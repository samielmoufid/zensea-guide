// La forêt : un panorama photographique 360° (Poly Haven, CC0) projeté sur
// l'intérieur d'une sphère, avec par-dessus un halo de soleil, des rais de
// lumière, des poussières en suspension, et une caméra qui respire. On
// regarde autour de soi à la souris, au doigt, ou en inclinant le téléphone,
// et on peut marcher : la caméra avance à l'intérieur de la sphère, ce qui
// grossit ce qui est devant et fait défiler les côtés.

import * as THREE from 'three'

const DEG = Math.PI / 180
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k
// Interpolation d'angle qui passe par le chemin le plus court.
const lerpAngle = (a, b, k) => {
  const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
  return a + d * k
}

// Position du soleil dans le panorama (mesurée sur l'image : pixel le plus
// lumineux). Repère : le centre de la photo est à yaw 90°, et yaw décroît
// quand on va vers la droite de l'image.
const SUN_YAW = (90 - 41.1) * DEG
const SUN_EL = 15.8 * DEG
const SUN_DIR = new THREE.Vector3(-Math.sin(SUN_YAW) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_YAW) * Math.cos(SUN_EL))

const RAYON = 60          // rayon de la sphère
const PORTEE = 36         // distance maximale de marche depuis le centre
const VITESSE = 3.4       // marche, unités par seconde
const VITESSE_COURSE = 7.2
const CADENCE = 2.0       // pas par seconde en marchant
const CADENCE_COURSE = 3.2
const PITCH_MAX = 80 * DEG

export class Foret {
  constructor(canvas, { mobile = false } = {}) {
    this.canvas = canvas
    this.mobile = mobile
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 3 : 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200)

    // Regard : cible (où l'utilisateur veut regarder) et valeur lissée.
    this.yaw0 = SUN_YAW + 34 * DEG   // recalculé selon le format dans resize()
    this.yaw = this.yaw0; this.pitch = 0
    this.dragYaw = 0; this.dragPitch = 0       // décalage accumulé au doigt / souris
    this.mouseX = 0; this.mouseY = 0            // parallaxe souris, -1..1
    this.gyro = null                            // { yaw, pitch } lissés de l'appareil
    this.gyroBrut = null
    this.gyroYaw0 = 0; this.gyroPitch0 = 0      // calibrage : orientation de départ = horizon
    this.inertie = null

    // Marche
    this.pos = new THREE.Vector3()
    this.marche = false
    this.course = false                          // on court plutôt qu'on marche
    this.effort = 0                              // 0 marche … 1 course, lissé
    this.allure = 0                              // 0..1, lissé
    this.phasePas = 0
    this.dernierPas = 0
    this.onPas = null

    // Là d'où vient la musique : à gauche de la vue de départ, près du bout
    // du chemin. On y marche ; on « arrive » quand on en est tout près.
    this.musique = new THREE.Vector3()
    this.cibleYaw = null
    this.suivre = false          // les pieds vont vers la musique, la tête reste libre
    this.autre = null            // scène de l'atelier quand on y est

    this.tPrec = performance.now()
    this.t0 = this.tPrec
    this.intro = 0
    this.actif = false

    this._sphere()
    this._soleil()
    this._rais()
    this._poussieres()
    this._feuilles()
    this._brume()
    this._controles()
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  get maxTexture() { return this.renderer.capabilities.maxTextureSize }

  // ---- Le panorama --------------------------------------------------------
  // Le feuillage frémit : une ondulation très fine des coordonnées de
  // texture, appliquée seulement là où l'image est verte ou jaune-vert et
  // au-dessus de l'horizon. Les troncs, le ciel et le sol restent en place.
  // L'amplitude suit le vent — ce qu'on voit bouger est ce qu'on entend.
  _sphere() {
    const geo = new THREE.SphereGeometry(RAYON, 72, 48)
    geo.scale(-1, 1, 1)
    this.panoMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, uTime: { value: 0 }, uVent: { value: 0 }, uPret: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D map; uniform float uTime, uVent, uPret; varying vec2 vUv;
        void main(){
          vec4 b = texture2D(map, vUv);
          float vert  = smoothstep(0.02, 0.10, b.g - max(b.r, b.b) * 0.92);
          float jaune = smoothstep(0.12, 0.30, min(b.r, b.g) - b.b) * (1.0 - smoothstep(0.80, 0.95, (b.r + b.g + b.b) / 3.0));
          float haut  = smoothstep(0.47, 0.58, vUv.y);
          float m = max(vert, jaune * 0.8) * haut;
          vec2 d = vec2(sin(vUv.x * 210.0 + uTime * 1.6 + sin(vUv.y * 95.0 + uTime * 0.7) * 2.0),
                        cos(vUv.y * 160.0 + uTime * 1.3 + vUv.x * 60.0));
          d += 0.6 * vec2(sin(vUv.x * 520.0 - uTime * 3.1 + vUv.y * 30.0), cos(vUv.y * 470.0 + uTime * 2.6));
          vec2 uv = vUv + d * m * (0.00035 + 0.0013 * uVent);
          gl_FragColor = texture2D(map, uv) * uPret;
          #include <colorspace_fragment>
        }`
    })
    this.pano = new THREE.Mesh(geo, this.panoMat)
    this.scene.add(this.pano)
    this.vent = 0            // 0..1, fourni par l'ambiance sonore ou simulé
    this.ventExterne = null
  }

  charger(url) {
    return new Promise((res, rej) => {
      new THREE.TextureLoader().load(url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace
        // Le panorama est bien plus grand que l'écran : les mipmaps et
        // l'anisotropie évitent le scintillement sans perdre le piqué.
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = true
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        this.panoMat.uniforms.map.value = tex
        this.panoMat.uniforms.uPret.value = 1
        const pm = new THREE.PMREMGenerator(this.renderer)
        this.scene.environment = pm.fromEquirectangular(tex).texture
        pm.dispose()
        res()
      }, undefined, rej)
    })
  }

  // ---- Le soleil ------------------------------------------------------------
  // La photo contient déjà le soleil ; on lui ajoute un halo additif et un
  // cœur plus serré, qui pulsent lentement — le débordement de lumière qu'un
  // capteur photo écrase. Posés juste à l'intérieur de la sphère, ils restent
  // alignés sur le soleil de la photo quand on marche.
  _soleil() {
    const halo = (taille, stops) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256
      const g = cv.getContext('2d')
      const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
      for (const [k, c] of stops) grad.addColorStop(k, c)
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256)
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 })
      const sp = new THREE.Sprite(mat)
      sp.position.copy(SUN_DIR).multiplyScalar(RAYON - 1)
      sp.scale.set(taille, taille, 1)
      this.scene.add(sp)
      return mat
    }
    this.haloMat = halo(44, [[0, 'rgba(255,214,150,0.3)'], [0.25, 'rgba(255,190,110,0.12)'], [0.6, 'rgba(255,160,80,0.04)'], [1, 'rgba(255,140,60,0)']])
    this.coeurMat = halo(10, [[0, 'rgba(255,250,235,0.7)'], [0.3, 'rgba(255,230,180,0.35)'], [1, 'rgba(255,200,130,0)']])
  }

  // ---- Rais de lumière ----------------------------------------------------
  // Des plans très allongés, dégradé doux, fusion additive, groupés du côté
  // du soleil. Ils suivent la caméra : c'est de l'atmosphère, pas un objet.
  _rais() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 512
    const g = cv.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0, 'rgba(255,255,255,0.0)')
    grad.addColorStop(0.12, 'rgba(255,255,255,0.55)')
    grad.addColorStop(0.55, 'rgba(255,255,255,0.22)')
    grad.addColorStop(1, 'rgba(255,255,255,0.0)')
    g.fillStyle = grad; g.fillRect(0, 0, 64, 512)
    const side = g.createLinearGradient(0, 0, 64, 0)
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.3, 'rgba(0,0,0,0)')
    side.addColorStop(0.7, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)')
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, 64, 512)
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace

    this.rais = new THREE.Group()
    this.raisItems = []
    const n = this.mobile ? 9 : 14
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, color: new THREE.Color(0xffd08a), opacity: 0
      })
      const w = 1.4 + Math.random() * 2.6, h = 30 + Math.random() * 16
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      const yaw = SUN_YAW + (Math.random() - 0.5) * 70 * DEG
      const r = 14 + Math.random() * 10
      m.position.set(-Math.sin(yaw) * r, 4 + Math.random() * 6, -Math.cos(yaw) * r)
      // Le plan fait face au centre du groupe (qui suit la caméra), sinon on
      // le verrait de profil. Une légère inclinaison casse la régularité.
      m.rotation.set(0, Math.atan2(m.position.x, m.position.z), (Math.random() - 0.5) * 0.35)
      m.userData = { base: 0.45 + Math.random() * 0.4, phase: Math.random() * 6.28, vitesse: 0.08 + Math.random() * 0.1, mat }
      this.rais.add(m)
      this.raisItems.push(m)
    }
    this.scene.add(this.rais)
    this.raisOpacite = 0
  }

  // ---- Poussières et pollen ----------------------------------------------
  // Un nuage infini : chaque grain est replié dans une boîte autour de la
  // caméra, si bien qu'en marchant on les traverse sans jamais en sortir.
  _poussieres() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64
    const g = cv.getContext('2d')
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,236,190,1)')
    grad.addColorStop(0.35, 'rgba(255,236,190,0.5)')
    grad.addColorStop(1, 'rgba(255,236,190,0)')
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace

    const n = this.mobile ? 260 : 620
    this.nP = n
    this.BOITE = 16
    const pos = new Float32Array(n * 3)
    this.pBase = new Float32Array(n * 3)
    this.pPhase = new Float32Array(n * 2)
    this.pSize = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      this.pBase[i * 3] = (Math.random() - 0.5) * this.BOITE
      this.pBase[i * 3 + 1] = (Math.random() - 0.4) * 9
      this.pBase[i * 3 + 2] = (Math.random() - 0.5) * this.BOITE
      this.pPhase[i * 2] = Math.random() * 6.28
      this.pPhase[i * 2 + 1] = 0.3 + Math.random() * 0.9
      this.pSize[i] = 0.035 + Math.random() * 0.1
    }
    pos.set(this.pBase)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uOpacity: { value: 0 }, uScale: { value: 300 } },
      vertexShader: `
        attribute float aSize; varying float vA;
        uniform float uScale;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          float d = -mv.z;
          gl_PointSize = aSize * uScale / d;
          vA = smoothstep(0.6, 2.2, d) * (1.0 - smoothstep(7.0, 9.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform float uOpacity; varying float vA;
        void main(){
          vec4 c = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(c.rgb, c.a * vA * uOpacity);
        }`,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    })
    this.pMat = mat
    this.points = new THREE.Points(geo, mat)
    this.scene.add(this.points)
  }

  // ---- Feuilles mortes ----------------------------------------------------
  // Des feuilles d'automne, comme celles du sol de la photo : elles tombent
  // en tournant sur elles-mêmes, dérivent avec le vent, se posent, puis
  // repartent quand une rafale les soulève. Repliées autour de la caméra
  // comme les poussières, pour qu'il y en ait toujours autour de soi.
  _feuilles() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 96
    const g = cv.getContext('2d')
    g.fillStyle = '#fff'
    g.beginPath(); g.moveTo(32, 2)
    g.bezierCurveTo(60, 20, 62, 62, 32, 94)
    g.bezierCurveTo(2, 62, 4, 20, 32, 2)
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2
    g.beginPath(); g.moveTo(32, 6); g.lineTo(32, 92); g.stroke()
    g.lineWidth = 1.2
    for (const y of [26, 42, 58, 74]) { g.beginPath(); g.moveTo(32, y); g.lineTo(52, y - 12); g.moveTo(32, y); g.lineTo(12, y - 12); g.stroke() }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace

    const n = this.mobile ? 70 : 140
    this.nF = n
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, transparent: false })
    this.feuilles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.19), mat, n)
    this.feuilles.frustumCulled = false
    const teintes = [0xd9a441, 0xc7862c, 0xb8641f, 0xa84a22, 0xe0b95a, 0x9c6b2a, 0xc94f2b]
    this.F = []
    const BF = 14
    for (let i = 0; i < n; i++) {
      const f = {
        x: (Math.random() - 0.5) * BF, y: -1.6 + Math.random() * 7, z: (Math.random() - 0.5) * BF,
        vy: 0, vx: 0, vz: 0,
        rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28,
        wx: (Math.random() - 0.5) * 4, wy: (Math.random() - 0.5) * 4, wz: (Math.random() - 0.5) * 3,
        phase: Math.random() * 6.28, repos: 0, taille: 0.6 + Math.random() * 0.55
      }
      this.F.push(f)
      this.feuilles.setColorAt(i, new THREE.Color(teintes[i % teintes.length]).multiplyScalar(0.75 + Math.random() * 0.4))
    }
    this.BF = BF
    this.feuilles.instanceColor.needsUpdate = true
    this.scene.add(this.feuilles)
    // Le vent vient du côté du soleil, comme la lumière.
    this.ventDir = new THREE.Vector3(-SUN_DIR.x, 0, -SUN_DIR.z).normalize().multiplyScalar(-1)
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3()
  }

  _animerFeuilles(dt, t) {
    const vent = this.vent, hb = this.BF / 2, B = this.BF
    const rep = v => ((v + hb) % B + B) % B - hb
    const rafale = vent * vent
    for (let i = 0; i < this.nF; i++) {
      const f = this.F[i]
      if (f.repos > 0) {
        // Posée au sol : une rafale suffisamment forte la soulève.
        f.repos -= dt
        if (rafale > 0.42 && Math.random() < dt * 1.6 * rafale) { f.repos = 0; f.vy = 0.6 + Math.random() * 1.2 * rafale }
        else if (f.repos <= 0) { f.y = 5.5 + Math.random() * 1.5; f.x = this.pos.x + (Math.random() - 0.5) * B; f.z = this.pos.z + (Math.random() - 0.5) * B; f.vy = 0 }
        else { this._poserFeuille(i, f); continue }
      }
      // Chute freinée, tourbillon, poussée du vent.
      f.vy = lerp(f.vy, -(0.22 + 0.18 * Math.sin(f.phase * 3.1)) * f.taille, dt * 1.5)
      const pousse = 0.25 + 2.4 * rafale
      f.vx = lerp(f.vx, this.ventDir.x * pousse + Math.sin(t * 1.3 + f.phase) * 0.35, dt * 2)
      f.vz = lerp(f.vz, this.ventDir.z * pousse + Math.cos(t * 1.1 + f.phase * 1.7) * 0.35, dt * 2)
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt
      const w = 1 + 2.5 * rafale
      f.rx += f.wx * dt * w; f.ry += f.wy * dt * w; f.rz += f.wz * dt * w
      if (f.y < -1.6) { f.y = -1.6; f.repos = 3 + Math.random() * 7; f.rx = Math.PI / 2 + (Math.random() - 0.5) * 0.4; f.vx = f.vz = 0 }
      this._poserFeuille(i, f)
    }
    this.feuilles.instanceMatrix.needsUpdate = true
  }

  _poserFeuille(i, f) {
    const hb = this.BF / 2, B = this.BF
    const rep = v => ((v + hb) % B + B) % B - hb
    this._v.set(this.pos.x + rep(f.x - this.pos.x), f.y, this.pos.z + rep(f.z - this.pos.z))
    this._q.setFromEuler(this._e.set(f.rx, f.ry, f.rz))
    this._s.set(f.taille, f.taille, f.taille)
    this.feuilles.setMatrixAt(i, this._m4.compose(this._v, this._q, this._s))
  }

  // ---- Le corps -------------------------------------------------------------
  // Ce qu'on voit de soi en baissant les yeux : la poitrine sous la chemise,
  // les bras, des mains à cinq doigts, les jambes de lin sombre et les
  // chaussures. Tout est construit à partir de capsules et de sphères aux
  // proportions humaines, éclairé par le panorama lui-même et par un soleil
  // placé là où il est dans la photo. Le corps s'incline légèrement quand
  // on baisse la tête, comme le vrai.
  _corps() {
    const peau = new THREE.MeshStandardMaterial({ color: 0xd9b394, roughness: 0.62 })
    const chemise = new THREE.MeshStandardMaterial({ color: 0xe8e1d1, roughness: 0.92 })
    const pantalon = new THREE.MeshStandardMaterial({ color: 0x2f342e, roughness: 0.95 })
    const cuir = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.55 })
    const semelle = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.8 })
    const capsule = (r, l, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 5, 14), mat)
    const boule = (r, mat, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat); m.scale.set(sx, sy, sz); return m }

    this.corps = new THREE.Group()

    // Pas de torse : sous l'œil, il masquerait mains et pieds — c'est le
    // choix de toutes les vues subjectives.
    this.torse = new THREE.Group(); this.corps.add(this.torse)

    // Une main : paume, quatre doigts à trois phalanges, un pouce à deux.
    // Les doigts pointent vers le bas quand le bras pend, légèrement repliés.
    const main = (cote) => {
      const g = new THREE.Group()
      const paume = boule(0.045, peau, 1, 1.25, 0.42); paume.position.y = -0.045
      g.add(paume)
      const doigt = (x, longueur, courbure, epaisseur) => {
        let parent = g, y = -0.095
        const seg = [0.36, 0.3, 0.24].map(k => k * longueur)
        const ray = [1, 0.92, 0.82].map(k => k * epaisseur)
        let px = x, pz = 0
        for (let i = 0; i < 3; i++) {
          const art = new THREE.Group(); art.position.set(px, y, pz)
          art.rotation.x = courbure * (i === 0 ? 0.6 : 1) * (cote > 0 ? 1 : 1)
          const ph = capsule(ray[i], seg[i], peau); ph.position.y = -seg[i] / 2
          art.add(ph); parent.add(art)
          parent = art; px = 0; pz = 0; y = -seg[i]
        }
      }
      doigt(-0.03 * cote, 0.19, 0.42, 0.0095)      // index
      doigt(-0.01 * cote, 0.21, 0.5, 0.0095)       // majeur
      doigt(0.01 * cote, 0.195, 0.55, 0.009)       // annulaire
      doigt(0.03 * cote, 0.16, 0.6, 0.0082)        // auriculaire
      // Pouce : part du côté de la paume, vers l'avant.
      const pouce = new THREE.Group(); pouce.position.set(-0.045 * cote, -0.04, 0.012)
      pouce.rotation.set(0.5, 0, -0.9 * cote)
      const p1 = capsule(0.011, 0.045, peau); p1.position.y = -0.03
      const p2g = new THREE.Group(); p2g.position.y = -0.058; p2g.rotation.x = 0.35
      const p2 = capsule(0.01, 0.035, peau); p2.position.y = -0.022
      p2g.add(p2); pouce.add(p1, p2g); g.add(pouce)
      // La paume regarde vers la cuisse.
      g.rotation.y = -Math.PI / 2 * cote
      return g
    }

    // Un bras : épaule → haut du bras → coude → avant-bras → poignet → main.
    const bras = (cote) => {
      const epaule = new THREE.Group(); epaule.position.set(0.215 * cote, -0.3, 0.07)
      const haut = capsule(0.05, 0.24, chemise); haut.position.y = -0.14
      const coude = new THREE.Group(); coude.position.y = -0.29
      const avant = capsule(0.042, 0.22, chemise); avant.position.y = -0.13
      const manchette = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.03, 16), chemise); manchette.position.y = -0.255
      const poignet = capsule(0.03, 0.03, peau); poignet.position.y = -0.285
      const m = main(cote); m.position.y = -0.3
      coude.add(avant, manchette, poignet, m)
      epaule.add(haut, coude)
      epaule.userData = { coude, main: m }
      return epaule
    }

    // Une jambe : hanche → cuisse → genou → tibia → chaussure.
    const jambe = (cote) => {
      const hanche = new THREE.Group(); hanche.position.set(0.1 * cote, -0.83, 0.02)
      const cuisse = capsule(0.078, 0.34, pantalon); cuisse.position.y = -0.2
      const genou = new THREE.Group(); genou.position.y = -0.4
      const tibia = capsule(0.06, 0.32, pantalon); tibia.position.y = -0.19
      const ourlet = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.03, 16), pantalon); ourlet.position.y = -0.36
      const chaussure = new THREE.Group(); chaussure.position.set(0, -0.39, -0.03)
      const empeigne = capsule(0.05, 0.16, cuir); empeigne.rotation.x = Math.PI / 2; empeigne.position.set(0, -0.02, -0.06); empeigne.scale.set(1.05, 0.9, 1)
      const talon = boule(0.05, cuir, 1, 0.9, 0.9); talon.position.set(0, -0.02, 0.05)
      const sem = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.29), semelle); sem.position.set(0, -0.06, -0.03)
      chaussure.add(empeigne, talon, sem)
      genou.add(tibia, ourlet, chaussure)
      hanche.add(cuisse, genou)
      hanche.userData = { genou }
      return hanche
    }

    this.jG = jambe(-1); this.jD = jambe(1)
    this.bG = bras(-1); this.bD = bras(1)
    this.corps.add(this.jG, this.jD, this.bG, this.bD)
    this.scene.add(this.corps)
    this.soleil = new THREE.DirectionalLight(0xffe0b0, 1.8)
    this.soleil.position.copy(SUN_DIR).multiplyScalar(10)
    this.scene.add(this.soleil, new THREE.AmbientLight(0xd6dccf, 0.3))
  }

  _animerCorps(t) {
    const ph = this.phasePas, a = this.allure, e = this.effort
    const amp = (0.5 + 0.55 * e) * a
    const sw = Math.sin(ph)
    // Jambes : balancement depuis la hanche, genou qui plie quand la jambe
    // passe derrière — davantage en courant.
    this.jG.rotation.x = sw * amp + 0.2
    this.jD.rotation.x = -sw * amp + 0.2
    this.jG.userData.genou.rotation.x = -Math.max(0, Math.sin(ph + Math.PI)) * (0.7 + 0.9 * e) * a
    this.jD.userData.genou.rotation.x = -Math.max(0, Math.sin(ph)) * (0.7 + 0.9 * e) * a
    // Bras : en opposition. Au repos ils pendent, à peine écartés, et
    // respirent ; en courant les coudes se plient et les mains montent.
    const respire = Math.sin(t * 0.9) * 0.02
    // Rotation positive autour de X = le membre pendant part vers l'avant.
    this.bG.rotation.x = -sw * amp * 0.45 + respire + 0.28
    this.bD.rotation.x = sw * amp * 0.45 + respire + 0.28
    this.bG.rotation.z = 0.12; this.bD.rotation.z = -0.12
    const coude = (0.1 + 0.9 * e) * (0.35 + 0.65 * a) + 0.22
    this.bG.userData.coude.rotation.x = coude
    this.bD.userData.coude.rotation.x = coude
    // Le torse respire.
    const souffle = 1 + Math.sin(t * 1.1) * 0.012
    this.torse.scale.set(1, souffle, souffle)
    // Le corps est sous la tête, tourné avec elle, et s'incline un peu vers
    // l'avant quand on baisse les yeux — sans suivre le balancement.
    this.corps.position.set(this.pos.x, 0, this.pos.z)
    const penche = 0.08
    this.corps.rotation.set(penche, this.yaw, 0, 'YXZ')
  }

  // ---- Brume au sol -------------------------------------------------------
  // Un halo doré très doux sous l'horizon, qui suit la caméra. Le cylindre
  // descend bien sous le champ le plus bas et un disque le ferme.
  _brume() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128
    const g = cv.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 0, 128)
    grad.addColorStop(0, 'rgba(255,226,180,0)')
    grad.addColorStop(0.6, 'rgba(255,226,180,0.5)')
    grad.addColorStop(1, 'rgba(255,226,180,0.7)')
    g.fillStyle = grad; g.fillRect(0, 0, 256, 128)
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    this.brume = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false, opacity: 0 })
    this.brumeMat = mat
    const m = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 70, 48, 1, true), mat)
    m.position.y = -37
    const fond = new THREE.Mesh(new THREE.CircleGeometry(30, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe2b4, transparent: true, depthWrite: false, opacity: 0 }))
    fond.rotation.x = Math.PI / 2
    fond.position.y = -72
    this.brumeFond = fond.material
    this.brume.add(m, fond)
    this.scene.add(this.brume)
  }

  // ---- Contrôles ----------------------------------------------------------
  _controles() {
    const el = this.canvas
    let down = false, lx = 0, ly = 0, vx = 0, vy = 0, dernierTap = 0, doigt = null
    const debut = e => {
      // Un seul doigt pilote le regard. Un deuxième doigt (pincement) annule
      // le glissé en cours : mélanger les deux faisait n'importe quoi.
      if (doigt !== null && e.pointerId !== doigt) { down = false; doigt = null; this.inertie = null; return }
      doigt = e.pointerId
      down = true; lx = e.clientX; ly = e.clientY; vx = vy = 0
      this.onInteraction?.()
      // Double appui : on recentre le regard (utile avec le gyroscope).
      const now = performance.now()
      if (now - dernierTap < 320) this.recentrer()
      dernierTap = now
    }
    const bouge = e => {
      const w = window.innerWidth, h = window.innerHeight
      this.mouseX = (e.clientX / w) * 2 - 1
      this.mouseY = (e.clientY / h) * 2 - 1
      if (!down || e.pointerId !== doigt) return
      const dx = e.clientX - lx, dy = e.clientY - ly
      lx = e.clientX; ly = e.clientY
      // Un glissé sur toute la largeur tourne d'environ 60° : assez pour se
      // retourner en deux gestes, pas assez pour partir dans tous les sens.
      const k = (this.camera.fov / 70) * (this.mobile ? 60 * DEG / w : 0.0026)
      vx = -dx * k; vy = -dy * k
      this.dragYaw += vx; this.dragPitch = clamp(this.dragPitch + vy, -PITCH_MAX, PITCH_MAX)
    }
    let x0 = 0, y0 = 0, t0 = 0
    const debut0 = debut
    const debut2 = e => { x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); debut0(e) }
    const fin = e => {
      if (e.pointerId !== doigt) return
      doigt = null
      if (down) this.inertie = { vx, vy }
      down = false
      // Un appui bref sans déplacement : un « tap », pour l'atelier.
      if (performance.now() - t0 < 350 && Math.hypot(e.clientX - x0, e.clientY - y0) < 12) {
        this.inertie = null
        this._onTap?.((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
      }
    }
    // Pas de zoom : ni pincement, ni double appui (iOS ignore parfois
    // touch-action, d'où les gestes bloqués explicitement).
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false })
    document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault() }, { passive: false })
    document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault() }, { passive: false })
    el.addEventListener('pointerdown', debut2)
    window.addEventListener('pointermove', bouge, { passive: true })
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', fin)
  }

  // Gyroscope : à appeler depuis un geste (iOS exige une permission).
  // On n'utilise pas l'orientation brute : la façon dont on tient le
  // téléphone au départ devient l'horizon, et tout est mesuré par rapport à
  // elle, lissé, sans roulis. Le doigt reste disponible pour corriger.
  async activerGyro() {
    if (typeof DeviceOrientationEvent === 'undefined') return false
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission()
        if (r !== 'granted') return false
      }
    } catch { return false }
    const zee = new THREE.Vector3(0, 0, 1)
    const euler = new THREE.Euler()
    const q0 = new THREE.Quaternion()
    const q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
    const q = new THREE.Quaternion()
    const avant = new THREE.Vector3()
    window.addEventListener('deviceorientation', e => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return
      const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * DEG
      euler.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, 'YXZ')
      q.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient))
      avant.set(0, 0, -1).applyQuaternion(q)
      const yaw = Math.atan2(-avant.x, -avant.z)
      const pitch = Math.asin(clamp(avant.y, -1, 1))
      if (!this.gyroBrut) {
        this.gyroBrut = { yaw, pitch }
        this.gyro = { yaw, pitch }
        this.gyroYaw0 = yaw; this.gyroPitch0 = pitch
      } else {
        this.gyroBrut.yaw = yaw; this.gyroBrut.pitch = pitch
      }
    }, { passive: true })
    return true
  }

  // Remet la vue de départ : l'orientation actuelle du téléphone redevient
  // l'horizon, et les décalages au doigt sont effacés.
  recentrer() {
    if (this.gyroBrut) this.gyroYaw0 = this.gyroBrut.yaw
    this.dragYaw = 0; this.dragPitch = 0; this.inertie = null
  }

  distanceMusique() { return this.pos.distanceTo(this.musique) }
  // Angle de la musique par rapport au regard, en radians (négatif = à gauche).
  angleMusique() {
    const dx = this.musique.x - this.pos.x, dz = this.musique.z - this.pos.z
    const a = Math.atan2(-dx, -dz)
    return ((a - this.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
  }
  // Tourne doucement le regard vers la musique.
  tournerVersMusique() { this.cibleYaw = this.yaw + this.angleMusique() }

  // Bascule vers l'atelier : le regard repart de sa vue d'ouverture.
  entrerAtelier(atelier, yaw) {
    this.autre = atelier
    this.marche = false; this.suivre = false; this.allure = 0
    this.yaw0 = yaw
    this.dragYaw = 0; this.dragPitch = 0; this.inertie = null
    if (this.gyroBrut) this.gyroYaw0 = this.gyroBrut.yaw
    this.yaw = yaw; this.pitch = 0
  }
  // Appui simple (sans glissé) : transmis à l'atelier.
  get onTap() { return this._onTap } set onTap(f) { this._onTap = f }

  resize() {
    const w = window.innerWidth, h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Sur un écran étroit on ouvre plus l'angle pour ne pas se sentir enfermé,
    // et on met le soleil plus près du centre, le champ horizontal étant réduit.
    this.fovBase = w < h ? 82 : 68
    if (!this.autre) this.yaw0 = SUN_YAW + (w < h ? 20 : 34) * DEG
    const ym = this.yaw0 + 38 * DEG
    this.musique.set(-Math.sin(ym) * (PORTEE - 3), 0, -Math.cos(ym) * (PORTEE - 3))
    this.camera.updateProjectionMatrix()
    this.pMat.uniforms.uScale.value = h * 0.42
  }

  setIntro(p) { this.intro = p }

  // ---- Boucle -------------------------------------------------------------
  rendu() {
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.tPrec) / 1000)
    this.tPrec = now
    const t = (now - this.t0) / 1000
    const ease = 1 - Math.pow(1 - this.intro, 3)

    // Inertie après un glissé
    if (this.inertie) {
      this.dragYaw += this.inertie.vx; this.dragPitch = clamp(this.dragPitch + this.inertie.vy, -PITCH_MAX, PITCH_MAX)
      this.inertie.vx *= 0.9; this.inertie.vy *= 0.9
      if (Math.abs(this.inertie.vx) + Math.abs(this.inertie.vy) < 0.00005) this.inertie = null
    }

    // Respiration : très lent balancement, et un souffle du champ.
    const respire = Math.sin(t * 0.21) * 0.35 * DEG + Math.sin(t * 0.07) * 0.5 * DEG
    const fovResp = Math.sin(t * 0.16) * 0.6

    // Intro : on part le regard levé vers la canopée, champ serré, puis on
    // redescend vers le chemin en ouvrant l'angle. C'est la « descente ».
    const pitchIntro = lerp(52 * DEG, 0, ease)
    const fov = lerp(34, this.fovBase, ease) + fovResp * ease + 5 * this.effort * this.allure
    let roll = lerp(-3 * DEG, 0, ease)

    // Vent : celui de l'ambiance sonore si elle tourne, sinon une simulation
    // de la même forme (deux respirations lentes superposées).
    if (this.ventExterne != null) this.vent = lerp(this.vent, this.ventExterne, 0.05)
    else this.vent = lerp(this.vent, 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 0.4)) * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.09 + 1))), 0.05)
    this.panoMat.uniforms.uTime.value = t
    this.panoMat.uniforms.uVent.value = this.vent * ease
    this.feuilles.visible = ease > 0.25
    this._animerFeuilles(dt, t)

    // Rotation demandée vers la musique : on ajoute au décalage du doigt.
    if (this.cibleYaw != null) {
      const d = ((this.cibleYaw - this.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
      // Rotation en fonction du temps, pas du nombre d'images : la même
      // seconde sur un téléphone rapide et sur un vieux modèle.
      this.dragYaw += d * Math.min(1, dt * 3.5)
      if (Math.abs(d) < 0.8 * DEG) this.cibleYaw = null
    }

    // Regard cible
    let yawT, pitchT
    if (this.gyroBrut) {
      // Lissage des mesures : le gyroscope tremble, pas la tête.
      this.gyro.yaw = lerpAngle(this.gyro.yaw, this.gyroBrut.yaw, 0.12)
      this.gyro.pitch = lerp(this.gyro.pitch, this.gyroBrut.pitch, 0.12)
      // Le tangage est absolu : téléphone vertical = regard droit devant,
      // penché en arrière = vers le ciel. Seul le cap (boussole, arbitraire)
      // est calé sur la vue de départ.
      yawT = this.yaw0 + (this.gyro.yaw - this.gyroYaw0) + this.dragYaw
      pitchT = this.gyro.pitch + this.dragPitch
    } else {
      const par = this.mobile ? 0 : 1
      yawT = this.yaw0 + this.dragYaw - this.mouseX * 9 * DEG * par
      pitchT = this.dragPitch - this.mouseY * 5 * DEG * par
    }
    this.yaw = lerpAngle(this.yaw, yawT, this.gyroBrut ? 0.2 : 0.055)
    this.pitch = lerp(this.pitch, clamp(pitchT, -PITCH_MAX, PITCH_MAX), this.gyroBrut ? 0.2 : 0.055)

    // Marche : on avance dans la direction du regard, à l'horizontale, avec
    // une allure qui monte et descend en douceur ; balancement de la tête au
    // rythme des pas, et un pas déclenché à chaque appui du pied.
    const veut = this.marche && this.intro >= 1 ? 1 : 0
    this.allure = lerp(this.allure, veut, veut ? 0.05 : 0.08)
    this.effort = lerp(this.effort, this.course && this.marche ? 1 : 0, 0.04)
    const vitesse = lerp(VITESSE, VITESSE_COURSE, this.effort)
    const cadence = lerp(CADENCE, CADENCE_COURSE, this.effort)
    let bobY = 0
    if (this.allure > 0.01) {
      const dir = this.suivre
        ? new THREE.Vector3(this.musique.x - this.pos.x, 0, this.musique.z - this.pos.z).normalize()
        : new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
      const suivant = this.pos.clone().addScaledVector(dir, vitesse * this.allure * dt)
      // Au bout du chemin, on ralentit jusqu'à l'arrêt plutôt que de buter.
      const d = suivant.length()
      if (d < PORTEE || d < this.pos.length()) this.pos.copy(suivant)
      else if (this.marche) { this.marche = false; this.onArret?.() }
      this.phasePas += dt * cadence * 2 * Math.PI * (0.6 + 0.4 * this.allure)
      // Deux appuis par cycle (un par pied) : la tête descend à chaque pas.
      bobY = -Math.abs(Math.sin(this.phasePas)) * (0.05 + 0.07 * this.effort) * this.allure
      roll += Math.sin(this.phasePas) * (0.4 + 0.5 * this.effort) * DEG * this.allure
      const demi = Math.floor(this.phasePas / Math.PI)
      if (demi !== this.dernierPas) {
        this.dernierPas = demi
        if (this.allure > 0.25) this.onPas?.(demi % 2 ? 0.35 : -0.35, this.allure * (0.85 + 0.5 * this.effort), this.effort)
      }
    } else if (this.phasePas % (2 * Math.PI) > 0.01) {
      this.phasePas = 0
    }
    if (this.autre) {
      // Dans l'atelier : pas de marche, on est debout puis assis.
      this.autre.assis = lerp(this.autre.assis, this.autre.choisi ? 1 : 0, 0.03)
      this.camera.position.set(0, -0.35 * this.autre.assis, 0)
      this.camera.rotation.set(this.pitch + respire * 0.5, this.yaw, 0, 'YXZ')
      const f2 = this.fovBase - 6 + fovResp
      if (Math.abs(this.camera.fov - f2) > 0.01) { this.camera.fov = f2; this.camera.updateProjectionMatrix() }
      this.autre.rendu(this.camera, dt)
      this.renderer.render(this.autre.scene, this.camera)
      return
    }
    this.bobY = bobY; this.rollCorps = roll
    this.camera.position.set(this.pos.x, this.pos.y + bobY, this.pos.z)
    this.camera.rotation.set(this.pitch + pitchIntro + respire, this.yaw, roll, 'YXZ')
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix() }

    // Ce qui est de l'atmosphère suit la caméra.
    this.rais.position.set(this.pos.x, 0, this.pos.z)
    this.brume.position.set(this.pos.x, 0, this.pos.z)

    // Soleil : le halo respire, le cœur scintille à peine.
    this.haloMat.opacity = lerp(this.haloMat.opacity, (0.75 + 0.25 * Math.sin(t * 0.3)) * ease, 0.03)
    this.coeurMat.opacity = lerp(this.coeurMat.opacity, (0.85 + 0.15 * Math.sin(t * 1.7)) * ease, 0.05)

    // Rais : apparaissent pendant l'intro, ondulent ensuite.
    this.raisOpacite = lerp(this.raisOpacite, ease, 0.03)
    for (const m of this.raisItems) {
      const u = m.userData
      const o = u.base * (0.55 + 0.45 * Math.sin(t * u.vitesse * 6.283 + u.phase))
      u.mat.opacity = o * this.raisOpacite * (this.mobile ? 0.8 : 1)
    }
    this.rais.rotation.y = Math.sin(t * 0.03) * 0.15

    // Poussières : dérive lente, repliées autour de la caméra.
    const pos = this.points.geometry.attributes.position.array
    const B = this.BOITE, hb = B / 2
    const rep = v => ((v + hb) % B + B) % B - hb
    for (let i = 0; i < this.nP; i++) {
      const ph = this.pPhase[i * 2], v = this.pPhase[i * 2 + 1]
      const x = this.pBase[i * 3] + Math.sin(t * 0.13 * v + ph) * 0.6
      const y = this.pBase[i * 3 + 1] + Math.sin(t * 0.09 * v + ph * 1.3) * 0.5 - (t * 0.02 * v) % 8 + 4
      const z = this.pBase[i * 3 + 2] + Math.cos(t * 0.11 * v + ph * 0.7) * 0.6
      pos[i * 3] = this.pos.x + rep(x - this.pos.x)
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = this.pos.z + rep(z - this.pos.z)
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.pMat.uniforms.uOpacity.value = lerp(this.pMat.uniforms.uOpacity.value, 0.7 * ease, 0.02)
    this.brumeMat.opacity = lerp(this.brumeMat.opacity, 0.3 * ease, 0.02)
    this.brumeFond.opacity = this.brumeMat.opacity * 0.75

    this.renderer.render(this.scene, this.camera)
  }
}
