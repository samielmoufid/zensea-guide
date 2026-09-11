// Notre histoire — sept images posées comme des panneaux dans l'espace, qui
// se reflètent sur un sol d'eau calme ; on passe de l'une à l'autre en 3D,
// les textes lévitent au-dessus. Souris, doigt, molette, flèches, points.

import * as THREE from 'three'

const DEG = Math.PI / 180
const lerp = (a, b, k) => a + (b - a) * k
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const mobile = matchMedia('(pointer: coarse)').matches
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches

const sections = [...document.querySelectorAll('.chapitre')]
const points = document.querySelector('.points')
const indice = document.getElementById('indice')
const canvas = document.getElementById('scene')

// ---- Scène -----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 3 : 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b1a13)
scene.fog = new THREE.Fog(0x0b1a13, 4, 11)
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50)
camera.position.set(0, 0.15, 4.2)

// Sol : un disque sombre à peine plus clair au centre, sous les panneaux.
{
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  gr.addColorStop(0, 'rgba(46,94,70,0.45)'); gr.addColorStop(0.6, 'rgba(46,94,70,0.12)'); gr.addColorStop(1, 'rgba(46,94,70,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }))
  sol.rotation.x = -Math.PI / 2; sol.position.y = -1.32
  scene.add(sol)
}

// Poussières d'or.
{
  const n = mobile ? 160 : 360
  const pos = new Float32Array(n * 3); const base = new Float32Array(n * 3); const ph = new Float32Array(n)
  for (let i = 0; i < n; i++) { base[i * 3] = (Math.random() - 0.5) * 8; base[i * 3 + 1] = (Math.random() - 0.5) * 5; base[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1; ph[i] = Math.random() * 6.28 }
  pos.set(base)
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const cv = document.createElement('canvas'); cv.width = cv.height = 32
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(1, 'rgba(255,236,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32)
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 0.035, transparent: true, depthWrite: false, opacity: 0.55, blending: THREE.AdditiveBlending }))
  scene.add(pts)
  pts.userData = { base, ph, n }
  scene.userData.poussieres = pts
}

// ---- Panneaux ---------------------------------------------------------------
// Coins arrondis, léger vignettage, et un reflet : le même panneau retourné
// sous la ligne d'eau, qui s'efface vers le bas et ondule à peine.
const vert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const frag = `
  uniform sampler2D map; uniform float uOpacity, uReflet, uTime; varying vec2 vUv;
  float arrondi(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main(){
    vec2 uv = vUv;
    if (uReflet > 0.5) uv.x += sin(uv.y * 40.0 + uTime * 1.4) * 0.0025 * (1.0 - uv.y);
    vec4 c = texture2D(map, uv);
    float d = arrondi(vUv - 0.5, vec2(0.5), 0.035);
    float bord = 1.0 - smoothstep(-0.006, 0.0, d);
    float vig = 1.0 - 0.28 * smoothstep(0.35, 0.75, length(vUv - 0.5));
    float a = bord * uOpacity;
    if (uReflet > 0.5) { a *= smoothstep(0.0, 0.85, vUv.y) * 0.5; c.rgb *= 0.85; }
    gl_FragColor = vec4(c.rgb * vig, a);
    #include <colorspace_fragment>
  }`
const H = 2.5, L = H * (1024 / 1536)
const panneaux = sections.map((sec, i) => {
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: null }, uOpacity: { value: 0 }, uReflet: { value: 0 }, uTime: { value: 0 } }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false })
  const matR = mat.clone(); matR.uniforms.uReflet.value = 1
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, H), mat)
  const reflet = new THREE.Mesh(new THREE.PlaneGeometry(L, H), matR)
  reflet.scale.y = -1
  const g = new THREE.Group(); g.add(mesh, reflet)
  g.visible = false
  scene.add(g)
  const zone = sec.dataset.zone
  // Le panneau se décale à l'opposé du texte pour lui laisser sa zone.
  const decal = zone === 'gauche' ? 0.55 : zone === 'droite' ? -0.55 : 0
  return { g, mesh, reflet, mat, matR, decal, coup: !!sec.dataset.coup, charge: false, url: sec.dataset.image }
})

const loader = new THREE.TextureLoader()
function charger(i) {
  const p = panneaux[i]; if (!p || p.charge) return Promise.resolve()
  p.charge = true
  return new Promise(res => loader.load(p.url, tex => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
    p.mat.uniforms.map.value = tex; p.matR.uniforms.map.value = tex; res()
  }, undefined, () => res()))
}

// ---- Textes : lettres une à une -------------------------------------------
for (const sec of sections) {
  const h2 = sec.querySelector('h2')
  const mots = h2.textContent.split(' ')
  h2.textContent = ''
  let k = 0
  mots.forEach((mot, mi) => {
    const w = document.createElement('span'); w.style.whiteSpace = 'nowrap'
    for (const ch of mot) { const s = document.createElement('span'); s.className = 'l'; s.textContent = ch; s.style.transitionDelay = (k++ * 28) + 'ms'; w.appendChild(s) }
    h2.appendChild(w); if (mi < mots.length - 1) h2.appendChild(document.createTextNode(' '))
  })
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Chapitre ' + (sections.indexOf(sec) + 1))
  b.addEventListener('click', () => aller(sections.indexOf(sec)))
  points.appendChild(b)
}

// ---- Navigation --------------------------------------------------------------
let actuel = -1, precedent = -1, tTrans = 0, enTrans = false, dernierGeste = performance.now()
const DUREE = reduit ? 300 : 1500
function aller(i) {
  if (i < 0 || i >= sections.length || i === actuel || enTrans) return
  precedent = actuel; actuel = i; tTrans = performance.now(); enTrans = true
  charger(i); charger(i + 1)
  sections.forEach((s, k) => s.classList.toggle('is-on', k === i))
  ;[...points.children].forEach((b, k) => b.classList.toggle('is-on', k === i))
  indice.style.opacity = i === 0 ? '' : '0'
  panneaux[i].g.visible = true
}
const geste = d => { dernierGeste = performance.now(); aller(actuel + d) }
let accum = 0
addEventListener('wheel', e => { accum += e.deltaY; if (Math.abs(accum) > 80) { geste(accum > 0 ? 1 : -1); accum = 0 } }, { passive: true })
let y0 = null
addEventListener('touchstart', e => { y0 = e.touches[0].clientY }, { passive: true })
addEventListener('touchend', e => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (Math.abs(dy) > 40) geste(dy < 0 ? 1 : -1) }, { passive: true })
addEventListener('keydown', e => { if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) geste(1); if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) geste(-1) })
// Avance douce toute seule si on ne fait rien, pour que ça vive.
setInterval(() => { if (performance.now() - dernierGeste > 9000 && actuel < sections.length - 1 && !document.hidden && !enTrans) { dernierGeste = performance.now(); aller(actuel + 1) } }, 1000)

// ---- Parallaxe : souris ou inclinaison du téléphone --------------------------
let mx = 0, my = 0, gx = 0, gy = 0
addEventListener('pointermove', e => { mx = (e.clientX / innerWidth) * 2 - 1; my = (e.clientY / innerHeight) * 2 - 1 }, { passive: true })
const gyro = e => { if (e.gamma == null) return; gx = Math.max(-1, Math.min(1, e.gamma / 25)); gy = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) }
if (mobile && typeof DeviceOrientationEvent !== 'undefined') {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const demande = () => DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') addEventListener('deviceorientation', gyro, { passive: true }) }).catch(() => {})
    addEventListener('touchend', demande, { once: true })
  } else addEventListener('deviceorientation', gyro, { passive: true })
}

// ---- Rendu --------------------------------------------------------------------
let portrait = false
function resize() {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  // En portrait, on recule pour que le panneau tienne dans la largeur.
  camera.position.z = camera.aspect < 0.8 ? 4.6 + (0.8 - camera.aspect) * 5.2 : 4.2
  portrait = camera.aspect < 0.8
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize); resize()
const t0 = performance.now()
function rendu() {
  const now = performance.now(), t = (now - t0) / 1000
  const px = mobile ? gx : mx, py = mobile ? gy : my
  const k = enTrans ? Math.min(1, (now - tTrans) / DUREE) : 1
  const e = ease(k)
  if (enTrans && k >= 1) { enTrans = false; if (precedent >= 0) panneaux[precedent].g.visible = false }
  panneaux.forEach((p, i) => {
    if (!p.g.visible) return
    const flotte = Math.sin(t * 0.5 + i) * 0.03
    if (i === actuel) {
      // Arrive de loin, en s'éclaircissant ; puis flotte et suit le regard.
      const z = lerp(-3.2, 0, e), s = lerp(0.82, 1, e)
      p.g.position.set(p.decal * (camera.aspect > 1 ? 1 : 0), flotte + (portrait ? 0.62 : 0), z)
      p.g.scale.setScalar(s)
      p.g.rotation.set(-py * 3 * DEG, px * 6 * DEG + lerp(-18 * DEG, 0, e), 0)
      let op = e
      if (p.coup && k > 0.55 && k < 0.75) { const q = (k - 0.55) / 0.2; p.g.position.y += Math.sin(q * Math.PI * 4) * 0.02 * (1 - q) }
      p.mat.uniforms.uOpacity.value = op; p.matR.uniforms.uOpacity.value = op
    } else if (i === precedent) {
      // S'en va en basculant, s'éloigne dans la brume.
      const z = lerp(0, 2.6, e), s = lerp(1, 1.12, e)
      p.g.position.set(lerp(p.decal * (camera.aspect > 1 ? 1 : 0), -1.4, e), flotte + (portrait ? 0.62 : 0) + lerp(0, 0.5, e), z)
      p.g.scale.setScalar(s)
      p.g.rotation.set(0, lerp(px * 6 * DEG, 42 * DEG, e), lerp(0, -4 * DEG, e))
      p.mat.uniforms.uOpacity.value = 1 - e; p.matR.uniforms.uOpacity.value = 1 - e
    }
    p.reflet.position.y = -H - 0.06 - flotte * 2
    p.matR.uniforms.uTime.value = t
  })
  // Le texte lévite : chacun à son rythme.
  sections.forEach((s, i) => { if (i === actuel) s.style.transform = `translateY(${Math.sin(t * 0.6 + i * 1.3) * 9}px)` })
  const pts = scene.userData.poussieres, pos = pts.geometry.attributes.position.array
  for (let i = 0; i < pts.userData.n; i++) {
    const b = pts.userData.base, ph = pts.userData.ph[i]
    pos[i * 3] = b[i * 3] + Math.sin(t * 0.12 + ph) * 0.25; pos[i * 3 + 1] = b[i * 3 + 1] + Math.sin(t * 0.09 + ph * 1.3) * 0.2 + ((t * 0.03 + ph) % 5) - 2.5; pos[i * 3 + 2] = b[i * 3 + 2] + Math.cos(t * 0.1 + ph * 0.7) * 0.25
  }
  pts.geometry.attributes.position.needsUpdate = true
  camera.position.x = lerp(camera.position.x, px * 0.12, 0.05); camera.position.y = lerp(camera.position.y, 0.15 - py * 0.08, 0.05)
  camera.lookAt(0, 0, 0)
  renderer.render(scene, camera)
  requestAnimationFrame(rendu)
}
charger(0).then(() => { dernierGeste = performance.now(); aller(0); charger(1) })
rendu()
