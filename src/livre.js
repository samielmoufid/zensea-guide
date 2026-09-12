// Le livre : un grand guide qui lévite au milieu du sentier, dans la lumière.
// On le touche, il vient dans les mains et s'ouvre ; les pages se tournent au
// doigt (glissé, coin tiré, appui), un double appui rapproche une page.
//
// Géométrie réelle : chaque feuille est un plan de 24 segments dont on
// courbe les sommets à chaque image (la page plie pendant qu'elle tourne),
// recto et verso partagent positions et normales, seuls les UV diffèrent.
// Repère local du groupe « flat » : x = largeur (dos en x = 0), y = hauteur,
// z = empilement, vers le lecteur.
//
// Le livre a sa propre scène, rendue par-dessus la forêt (ou l'atelier) avec
// la même caméra : il est éclairé par le panorama lui-même.

import * as THREE from 'three'

const PW = 0.8                    // largeur d'une page
const PH = PW * 1536 / 1024       // hauteur : pages 1024 × 1536
const TH = 0.0062                 // épaisseur visuelle d'une feuille
const COUV = 1.03                 // débord de la couverture
const EASE = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k

function geometrieMiroir(geom) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', geom.attributes.position)
  g.setAttribute('normal', geom.attributes.normal)
  g.setIndex(geom.index)
  const uv = geom.attributes.uv
  const f = new Float32Array(uv.count * 2)
  for (let j = 0; j < uv.count; j++) { f[2 * j] = 1 - uv.getX(j); f[2 * j + 1] = uv.getY(j) }
  g.setAttribute('uv', new THREE.BufferAttribute(f, 2))
  return g
}

// ---- Faces dessinées (gardes, quatrième de couverture, tranche) ----------
const W = 1024, H = 1536
function toile() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c }

function fondPapier(g) {
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#f7f5ee'); grad.addColorStop(1, '#efece2')
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  // Grain très léger.
  g.globalAlpha = 0.05
  for (let i = 0; i < 2600; i++) { g.fillStyle = i % 2 ? '#000' : '#fff'; g.fillRect(Math.random() * W, Math.random() * H, 2, 2) }
  g.globalAlpha = 1
}

// Une fougère stylisée, en filigrane.
function fougere(g, x, y, s, couleur, alpha) {
  g.save(); g.translate(x, y); g.globalAlpha = alpha; g.strokeStyle = couleur; g.lineCap = 'round'
  g.lineWidth = 4 * s; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(40 * s, -260 * s, 10 * s, -520 * s); g.stroke()
  g.lineWidth = 2.2 * s
  for (let i = 0; i < 16; i++) {
    // Point sur la tige (courbe de Bézier quadratique), puis deux folioles.
    const t = 0.08 + i * 0.055, L = (1 - t) * 120 * s
    const px = 2 * (1 - t) * t * 40 * s + t * t * 10 * s
    const yy = -(2 * (1 - t) * t * 260 * s + t * t * 520 * s)
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(px, yy); g.quadraticCurveTo(px + d * L * 0.6, yy - L * 0.25, px + d * L, yy - L * 0.55); g.stroke() }
  }
  g.restore()
}

function lettres(g, txt, cx, y, esp) {
  const w = [...txt].map(ch => g.measureText(ch).width)
  const tot = w.reduce((a, b) => a + b, 0) + esp * (txt.length - 1)
  let x = cx - tot / 2
  ;[...txt].forEach((ch, i) => { g.fillText(ch, x, y); x += w[i] + esp })
}

export function toileGarde(fin = false) {
  const c = toile(), g = c.getContext('2d')
  fondPapier(g)
  fougere(g, W * 0.78, H * 0.92, 1.15, '#2e5e46', 0.10)
  fougere(g, W * 0.22, H * 0.55, 0.7, '#2e5e46', 0.07)
  g.textAlign = 'center'; g.fillStyle = 'rgba(22,51,42,.78)'
  g.font = '500 44px "Cormorant Garamond", Georgia, serif'
  lettres(g, 'ZENSEA', W / 2, fin ? H * 0.5 : H * 0.46, 22)
  g.font = '400 24px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  g.fillStyle = 'rgba(22,51,42,.55)'
  if (fin) {
    g.fillText('Ce livre est offert avec chaque instrument.', W / 2, H * 0.5 + 64)
    g.fillText('Vous pouvez le transmettre à qui va commencer.', W / 2, H * 0.5 + 100)
  } else {
    lettres(g, 'LA MAISON DU HANDPAN', W / 2, H * 0.46 + 52, 6)
    g.font = 'italic 400 34px "Cormorant Garamond", Georgia, serif'
    g.fillStyle = 'rgba(22,51,42,.7)'
    g.fillText('Le handpan, du premier geste au premier morceau', W / 2, H * 0.46 + 130)
  }
  return c
}

export function toileQuatrieme() {
  const c = toile(), g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, W * 0.3, H)
  grad.addColorStop(0, '#1b3a2c'); grad.addColorStop(1, '#0b1a13')
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  const sheen = g.createRadialGradient(W * 0.3, H * 0.1, 40, W * 0.3, H * 0.1, W)
  sheen.addColorStop(0, 'rgba(255,240,200,0.12)'); sheen.addColorStop(1, 'rgba(255,240,200,0)')
  g.fillStyle = sheen; g.fillRect(0, 0, W, H)
  fougere(g, W * 0.8, H * 0.98, 1.4, '#d7c39a', 0.16)
  g.strokeStyle = 'rgba(215,195,154,.35)'; g.lineWidth = 2; g.strokeRect(46, 46, W - 92, H - 92)
  g.textAlign = 'center'
  g.fillStyle = '#f6f9f8'; g.font = 'italic 400 60px "Cormorant Garamond", Georgia, serif'
  g.fillText('Vous n’avez besoin', W / 2, 420); g.fillText('de rien savoir.', W / 2, 492)
  g.font = '400 27px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'; g.fillStyle = 'rgba(246,249,248,.8)'
  const lignes = ['Comment l’instrument est fait, quelles notes', 'vous avez sous les mains, comment poser', 'vos mains sur lui, un premier motif juste,', 'et comment garder votre handpan accordé', 'pendant des années.']
  lignes.forEach((l, i) => g.fillText(l, W / 2, 620 + i * 42))
  g.fillStyle = '#d7c39a'; g.font = '500 40px "Cormorant Garamond", Georgia, serif'
  lettres(g, 'ZENSEA', W / 2, H - 230, 20)
  g.font = '400 22px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'; g.fillStyle = 'rgba(246,249,248,.6)'
  lettres(g, 'FRANCE', W / 2, H - 192, 8)
  g.fillText('zensea.fr · contact@zensea.fr', W / 2, H - 120)
  return c
}

// Couverture de secours (le temps que la vraie soit livrée) — même titre.
export function toileCouverture() {
  const c = toile(), g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, W * 0.2, H)
  grad.addColorStop(0, '#2e5e46'); grad.addColorStop(1, '#0f2a1e')
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  fougere(g, W * 0.85, H * 0.95, 1.6, '#d7c39a', 0.2)
  g.textAlign = 'left'; g.fillStyle = 'rgba(246,249,248,.75)'
  g.font = '400 22px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  g.fillText('L A   M A I S O N   Z E N S E A', 78, 128)
  g.fillStyle = '#f6f9f8'; g.font = '400 108px "Cormorant Garamond", Georgia, serif'
  g.fillText('Le handpan,', 74, 300); g.fillText('du premier geste', 74, 412); g.fillText('au premier morceau', 74, 524)
  g.font = '400 30px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'; g.fillStyle = 'rgba(246,249,248,.8)'
  g.fillText('Tout ce qu’il faut savoir sur le Ré mineur Kurd.', 78, 600)
  g.textAlign = 'center'; g.font = 'italic 400 28px "Cormorant Garamond", Georgia, serif'
  g.fillText('Offert avec chaque instrument Zensea · zensea.fr', W / 2, H - 90)
  return c
}

function toileTranche() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#ece8dc'; g.fillRect(0, 0, 128, 64)
  for (let y = 1; y < 64; y += 3) { g.fillStyle = y % 2 ? 'rgba(120,110,90,.32)' : 'rgba(255,255,255,.5)'; g.fillRect(0, y, 128, 1) }
  return c
}

// ---- Le livre ---------------------------------------------------------------
export class Livre {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ mobile: boolean, nPages: number, base: string, on: object }} o
   *   on : { ouvert(), ferme(), change(T), tourne(dir, stiff), zoom(side) }
   */
  constructor(renderer, { mobile = false, nPages = 19, base = './livre/', on = {} } = {}) {
    this.renderer = renderer
    this.mobile = mobile
    this.nPages = nPages
    this.base = base
    this.on = on
    // Faces : couverture, garde, pages, page blanche si besoin, garde de fin, 4e.
    const impair = nPages % 2 === 1
    this.nFaces = 2 + nPages + (impair ? 1 : 0) + 2
    this.S = this.nFaces / 2
    this.impair = impair

    this.scene = new THREE.Scene()
    this.groupe = new THREE.Group()          // pose monde du livre
    this.flat = new THREE.Group()            // décalage : dos centré ou couverture centrée
    this.flatX = -PW / 2
    this.flat.position.x = this.flatX
    this.groupe.add(this.flat)
    this.scene.add(this.groupe)

    // États
    this.visible = true          // flotte dans la forêt (faux dans l'atelier)
    this.ouvert = false          // en lecture
    this.zoom = null             // { side }
    this.vol = null              // transition en cours { de, a, t0, dur, vers }
    this.ecarte = 0              // 0 : au milieu du chemin, 1 : envolé au-dessus
    this.ecarteK = 0
    this.yawOffset = 0.42        // de combien le livre fermé se tourne (on voit le dos)
    this.flotte = { p: new THREE.Vector3(), yaw: 0 }
    this.poseMonde = { p: new THREE.Vector3(), q: new THREE.Quaternion() }
    this.presence = 1            // 0..1, opacité/échelle globale (atelier)
    this.presenceT = 1
    this.tPrec = performance.now()
    this.t0 = this.tPrec

    this._lumieres()
    this._feuilles()
    this._blocs()
    this._halo()
    this._pointeur()
    this._cadrer()
    window.addEventListener('resize', () => this._cadrer())
  }

  setEnvironment(tex) { this.scene.environment = tex }

  // ---- Construction ---------------------------------------------------------
  _lumieres() {
    // Le panorama (vert) éclaire peu et teinte : on l'utilise pour les
    // reflets de la couverture, et on éclaire le papier en lumière chaude.
    this.hemi = new THREE.HemisphereLight(0xfff3e2, 0x6b5a3a, 0.95)
    this.scene.add(this.hemi)
    this.soleil = new THREE.DirectionalLight(0xffe6c0, 1.35)
    this.soleil.position.set(-1.2, 2.2, 1.6)
    this.scene.add(this.soleil)
    this.contre = new THREE.DirectionalLight(0xdfeee4, 0.4)
    this.contre.position.set(1.4, 0.6, -1.2)
    this.scene.add(this.contre)
  }

  _texCanvas(c) {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    return t
  }

  _feuilles() {
    this.sheets = []
    this.mats = []
    const SEG = this.mobile ? 18 : 26
    for (let i = 0; i < this.S; i++) {
      const stiff = i === 0 || i === this.S - 1
      const w = stiff ? PW * COUV : PW, h = stiff ? PH * COUV : PH
      const geom = new THREE.PlaneGeometry(w, h, SEG, 3)
      geom.translate(w / 2, 0, 0)
      const base = geom.attributes.position.array.slice()
      const opts = stiff
        ? { roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.35, envMapIntensity: 0.8 }
        : { roughness: 0.9, metalness: 0, envMapIntensity: 0.25 }
      const Mat = stiff ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial
      const matF = new Mat({ ...opts, color: 0xf3efe4, side: THREE.FrontSide })
      const matB = new Mat({ ...opts, color: 0xf3efe4, side: THREE.BackSide })
      this.mats[2 * i] = matF; this.mats[2 * i + 1] = matB
      const geomB = geometrieMiroir(geom)
      const meshF = new THREE.Mesh(geom, matF), meshB = new THREE.Mesh(geomB, matB)
      meshF.frustumCulled = meshB.frustumCulled = false
      const holder = new THREE.Group()
      holder.add(meshF, meshB)
      this.flat.add(holder)
      this.sheets.push({ i, geom, base, holder, w, h, stiff, bendK: stiff ? 0.08 : 0.42, t: 0, target: 0, lagSign: 1, anim: null, dragging: false, vel: 0 })
      this._deformer(this.sheets[i]); this._placer(this.sheets[i])
    }
    // Faces dessinées, disponibles tout de suite.
    this._appliquer(1, this._texCanvas(toileGarde(false)))
    this._appliquer(this.nFaces - 2, this._texCanvas(toileGarde(true)))
    this._appliquer(this.nFaces - 1, this._texCanvas(toileQuatrieme()))
    if (this.impair) {
      // La page blanche en face de la dernière page : papier nu.
      const c = toile(); fondPapier(c.getContext('2d'))
      this._appliquer(this.nFaces - 3, this._texCanvas(c))
    }
  }

  _appliquer(face, tex) {
    const m = this.mats[face]
    if (!m) return
    m.map = tex; m.color.set(0xffffff); m.needsUpdate = true
  }

  _blocs() {
    const tranche = this._texCanvas(toileTranche())
    tranche.wrapS = tranche.wrapT = THREE.RepeatWrapping
    const dessus = new THREE.MeshStandardMaterial({ color: 0xece8dc, roughness: 0.9 })
    const bord = new THREE.MeshStandardMaterial({ map: tranche, roughness: 0.9 })
    const mats = [bord, bord, bord, bord, dessus, dessus]
    const geo = new THREE.BoxGeometry(PW * 0.985, PH * 0.985, 1)
    geo.translate(PW * 0.985 / 2 + 0.003, 0, 0.5)
    this.blocR = new THREE.Mesh(geo, mats)
    this.blocL = new THREE.Mesh(geo.clone().scale(-1, 1, 1), mats)
    this.flat.add(this.blocR, this.blocL)
    this.dos = new THREE.Mesh(new THREE.BoxGeometry(0.04, PH * COUV, 1),
      new THREE.MeshPhysicalMaterial({ color: 0x1d3b2c, roughness: 0.5, clearcoat: 0.4 }))
    this.dos.geometry.translate(0, 0, 0.5)
    this.flat.add(this.dos)
  }

  // Halo doré derrière le livre et poussières d'or qui montent autour.
  _halo() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256
    const g = cv.getContext('2d')
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
    grad.addColorStop(0, 'rgba(255,225,160,0.55)'); grad.addColorStop(0.4, 'rgba(255,205,130,0.18)'); grad.addColorStop(1, 'rgba(255,190,110,0)')
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256)
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    this.haloMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 })
    this.halo = new THREE.Sprite(this.haloMat)
    this.halo.scale.set(PH * 3, PH * 3, 1)
    this.scene.add(this.halo)

    // Un rai de lumière tombe des arbres sur le livre.
    const cr = document.createElement('canvas'); cr.width = 64; cr.height = 512
    const gr = cr.getContext('2d')
    const vert = gr.createLinearGradient(0, 0, 0, 512)
    vert.addColorStop(0, 'rgba(255,240,200,0)'); vert.addColorStop(0.15, 'rgba(255,240,200,0.6)')
    vert.addColorStop(0.7, 'rgba(255,235,190,0.35)'); vert.addColorStop(1, 'rgba(255,230,180,0)')
    gr.fillStyle = vert; gr.fillRect(0, 0, 64, 512)
    const cote = gr.createLinearGradient(0, 0, 64, 0)
    cote.addColorStop(0, 'rgba(0,0,0,1)'); cote.addColorStop(0.35, 'rgba(0,0,0,0)'); cote.addColorStop(0.65, 'rgba(0,0,0,0)'); cote.addColorStop(1, 'rgba(0,0,0,1)')
    gr.globalCompositeOperation = 'destination-out'; gr.fillStyle = cote; gr.fillRect(0, 0, 64, 512)
    const tr = new THREE.CanvasTexture(cr); tr.colorSpace = THREE.SRGBColorSpace
    this.raiMat = new THREE.SpriteMaterial({ map: tr, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 })
    this.rai = new THREE.Sprite(this.raiMat)
    this.rai.scale.set(PW * 2.4, PH * 5.5, 1)
    this.scene.add(this.rai)

    const n = this.mobile ? 60 : 110
    this.nM = n
    const pos = new Float32Array(n * 3)
    this.mBase = new Float32Array(n * 3); this.mPhase = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = 0.35 + Math.random() * 1.1
      this.mBase[i * 3] = Math.cos(a) * r; this.mBase[i * 3 + 1] = (Math.random() - 0.5) * 2.2; this.mBase[i * 3 + 2] = Math.sin(a) * r
      this.mPhase[i] = Math.random() * 6.283
    }
    pos.set(this.mBase)
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 32
    const g2 = cv2.getContext('2d'); const gr2 = g2.createRadialGradient(16, 16, 0, 16, 16, 16)
    gr2.addColorStop(0, 'rgba(255,240,200,1)'); gr2.addColorStop(0.4, 'rgba(255,225,160,0.6)'); gr2.addColorStop(1, 'rgba(255,210,140,0)')
    g2.fillStyle = gr2; g2.fillRect(0, 0, 32, 32)
    const t2 = new THREE.CanvasTexture(cv2); t2.colorSpace = THREE.SRGBColorSpace
    this.motesMat = new THREE.PointsMaterial({ map: t2, size: 0.028, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    this.motes = new THREE.Points(geo, this.motesMat)
    this.motes.frustumCulled = false
    this.scene.add(this.motes)
  }

  // ---- Chargement progressif des pages ------------------------------------
  // La couverture et les deux premières pages d'abord, puis le reste dans
  // l'ordre, une image à la fois : jamais dix-neuf décodages en même temps.
  charger() {
    if (this._chargement) return this._chargement
    const loader = new THREE.TextureLoader()
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    const une = (url, face) => new Promise(res => {
      loader.load(url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso
        tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true
        if (this.mobile && tex.image && tex.image.width > 800) {
          // Sur téléphone, 768 px de large : la lecture fine passe par la loupe.
          const c = document.createElement('canvas'); c.width = 768; c.height = 1152
          c.getContext('2d').drawImage(tex.image, 0, 0, 768, 1152)
          tex.image = c
        }
        this._appliquer(face, tex); res(true)
      }, undefined, () => res(false))
    })
    const liste = [[this.base + 'couverture.jpg', 0]]
    for (let p = 1; p <= this.nPages; p++) liste.push([`${this.base}page-${String(p).padStart(2, '0')}.jpg`, p + 1])
    this._chargement = (async () => {
      const okCouv = await une(...liste[0])
      if (!okCouv) this._appliquer(0, this._texCanvas(toileCouverture()))
      for (let i = 1; i < liste.length; i++) await une(...liste[i])
    })()
    return this._chargement
  }

  // ---- Géométrie des pages ---------------------------------------------------
  _deformer(s) {
    const pos = s.geom.attributes.position, arr = pos.array, base = s.base
    const th0 = Math.PI * s.t
    const bend = s.bendK * Math.sin(th0) * s.lagSign
    for (let vi = 0; vi < arr.length; vi += 3) {
      const x0 = base[vi], u = x0 / s.w
      const th = th0 - bend * Math.sin(u * Math.PI * 0.5)
      arr[vi] = x0 * Math.cos(th); arr[vi + 1] = base[vi + 1]; arr[vi + 2] = x0 * Math.sin(th)
    }
    pos.needsUpdate = true
    s.geom.computeVertexNormals()
  }

  _placer(s) {
    const hR = 0.003 + (this.S - 1 - s.i) * TH, hL = 0.003 + s.i * TH
    const k = EASE(clamp(s.t, 0, 1))
    const lift = Math.sin(Math.PI * clamp(s.t, 0, 1)) * TH * 2.4
    s.holder.position.z = hR + (hL - hR) * k + lift
  }

  // ---- Feuilles ---------------------------------------------------------------
  get turned() { return this.sheets.filter(s => s.target === 1).length }

  _animer(s, to, dur, delay = 0) {
    if (s.target === to && !s.dragging && s.anim === null && s.t === to) return
    s.target = to; s.lagSign = to > s.t ? 1 : -1; s.dragging = false
    s.anim = { from: s.t, to, start: -1, dur, delay }
  }

  next() {
    const T = this.turned
    if (T >= this.S) return false
    const s = this.sheets[T]
    this._animer(s, 1, s.stiff ? 1.05 : 0.85)
    this._signaler(1, s)
    return true
  }

  prev() {
    const T = this.turned
    if (T <= 0) return false
    const s = this.sheets[T - 1]
    this._animer(s, 0, s.stiff ? 1.05 : 0.85)
    this._signaler(-1, s)
    return true
  }

  goTo(T2) {
    this.zoomExit()
    T2 = clamp(T2, 0, this.S)
    const T = this.turned
    if (T2 === T) return
    let k = 0
    if (T2 > T) for (let i = T; i < T2; i++) this._animer(this.sheets[i], 1, 0.7, 0.07 * k++)
    else for (let i = T - 1; i >= T2; i--) this._animer(this.sheets[i], 0, 0.7, 0.07 * k++)
    this._signaler(T2 > T ? 1 : -1, this.sheets[Math.min(T, T2)])
  }

  _signaler(dir, s) {
    this.on.tourne?.(dir, s.stiff)
    this.on.change?.(this.turned)
  }

  // Numéro de page (1-indexé) affiché d'un côté, ou null (couverture, garde…).
  page(side) {
    const T = this.turned
    const f = side === 'right' ? (T < this.S ? 2 * T : -1) : (T > 0 ? 2 * T - 1 : -1)
    const p = f - 1
    return p >= 1 && p <= this.nPages ? p : null
  }

  // Feuille à tourner pour voir la page p (1-indexée).
  static feuillePour(p) { return Math.ceil((p + 1) / 2) }

  // ---- Zoom -----------------------------------------------------------------
  zoomTo(side) { this.zoom = { side }; this._annulerDrag(); this.on.zoom?.(side) }
  zoomExit() { if (!this.zoom) return; this.zoom = null; this.on.zoom?.(null) }
  zoomNav(dir) {
    if (!this.zoom) return
    const s = this.zoom.side
    if (dir > 0) { if (s === 'left') this.zoomTo('right'); else if (this.next()) this.zoomTo('left') }
    else { if (s === 'right') this.zoomTo('left'); else if (this.prev()) this.zoomTo('right') }
  }

  // ---- Où le livre flotte ------------------------------------------------------
  // p : point du sentier ; le livre fait face à l'observateur, et s'envole
  // au-dessus du chemin quand on se met en marche (pour ne pas le traverser).
  poser(x, y, z) { this.flotte.p.set(x, y, z) }
  get positionFlottante() { return this.flotte.p }

  // Le livre fermé est-il sous le doigt ? (nx, ny dans -1..1)
  toucher(camera, nx, ny) {
    if (this.ouvert || !this.visible || this.presence < 0.5) return false
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera)
    // Boîte du livre fermé dans son repère : on teste une boîte un peu
    // plus large que la couverture (le doigt n'est pas précis).
    const inv = this.groupe.matrixWorld.clone().invert()
    const o = ray.ray.origin.clone().applyMatrix4(inv)
    const d = ray.ray.direction.clone().transformDirection(inv)
    const box = new THREE.Box3(new THREE.Vector3(-PW * 0.62, -PH * 0.58, -0.1), new THREE.Vector3(PW * 0.62, PH * 0.58, 0.2))
    return new THREE.Ray(o, d).intersectsBox(box)
  }

  // ---- Ouverture / fermeture --------------------------------------------------
  ouvrir(camera) {
    if (this.ouvert) return
    this.ouvert = true
    this.zoom = null
    this._camera = camera
    const depuisFlottant = this.visible && this.presence > 0.5
    this.vol = { t0: performance.now(), dur: depuisFlottant ? 1300 : 900, vers: 'lecture', depuis: depuisFlottant ? 'flottant' : 'bas' }
    this.presenceT = 1
    this.on.ouvert?.()
    // Une fois dans les mains, la couverture s'ouvre d'elle-même.
    clearTimeout(this._tOuv)
    this._tOuv = setTimeout(() => { if (this.ouvert && this.turned === 0) this.next() }, this.vol.dur + 200)
  }

  fermer() {
    if (!this.ouvert) return
    clearTimeout(this._tOuv)
    this.zoomExit()
    this._annulerDrag()
    const T = this.turned
    if (T > 0) this.goTo(0)
    const attente = T > 0 ? 450 + Math.min(T, 6) * 70 : 0
    setTimeout(() => {
      this.ouvert = false
      this.vol = { t0: performance.now(), dur: 1200, vers: this.visible ? 'flottant' : 'bas' }
      if (!this.visible) this.presenceT = 0
      this.on.ferme?.()
    }, attente)
  }

  // ---- Pointeur (actif seulement en lecture) ------------------------------------
  _pointeur() {
    const el = this.renderer.domElement
    this.pointer = null; this.dragSheet = null; this.dragActive = false; this.lastTap = null
    el.addEventListener('pointerdown', e => this._down(e))
    window.addEventListener('pointermove', e => this._move(e))
    window.addEventListener('pointerup', e => this._up(e))
    window.addEventListener('pointercancel', e => this._up(e, true))
    // Survol souris : le livre fermé se laisse deviner.
    el.addEventListener('pointermove', e => {
      if (this.ouvert || !this._camera || e.pointerType !== 'mouse') return
      const nx = (e.clientX / innerWidth) * 2 - 1, ny = -(e.clientY / innerHeight) * 2 + 1
      const sur = this.toucher(this._camera, nx, ny)
      this.survol = sur
      if (sur) el.style.cursor = 'pointer'; else if (el.style.cursor === 'pointer') el.style.cursor = ''
    }, { passive: true })
    window.addEventListener('keydown', e => {
      if (!this.ouvert || this.vol) return
      if (e.code === 'ArrowRight') { this.zoom ? this.zoomNav(1) : this.next(); e.preventDefault() }
      if (e.code === 'ArrowLeft') { this.zoom ? this.zoomNav(-1) : this.prev(); e.preventDefault() }
      if (e.code === 'Escape') { if (this.zoom) this.zoomExit(); else this.fermer() }
    })
  }

  // Point du doigt dans le repère « flat » (plan des pages).
  _local(clientX, clientY) {
    if (!this._camera) return null
    const nx = (clientX / innerWidth) * 2 - 1, ny = -(clientY / innerHeight) * 2 + 1
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(nx, ny), this._camera)
    this.flat.updateWorldMatrix(true, false)
    const inv = this.flat.matrixWorld.clone().invert()
    const o = ray.ray.origin.clone().applyMatrix4(inv)
    const d = ray.ray.direction.clone().transformDirection(inv)
    if (Math.abs(d.z) < 1e-5) return null
    const t = -o.z / d.z
    if (t < 0) return null
    return { x: o.x + d.x * t, y: o.y + d.y * t }
  }

  _down(e) {
    if (!this.ouvert || this.vol) return
    if (this.pointer) { this._annulerDrag(); this.pointer = null; return } // deuxième doigt : on ignore
    const loc = this._local(e.clientX, e.clientY)
    this.pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), loc0: loc, moved: false }
    const T = this.turned
    this.dragSheet = null
    if (loc && !this.zoom) {
      if (loc.x > PW * 0.45 && T < this.S) this.dragSheet = this.sheets[T]
      else if (loc.x < -PW * 0.45 && T > 0) this.dragSheet = this.sheets[T - 1]
    }
    this.dragActive = false
  }

  _move(e) {
    if (!this.pointer || e.pointerId !== this.pointer.id) return
    const dx = e.clientX - this.pointer.x0, dy = e.clientY - this.pointer.y0
    if (!this.pointer.moved && Math.hypot(dx, dy) > 9) {
      this.pointer.moved = true
      if (this.dragSheet) { this.dragActive = true; this.dragSheet.anim = null; this.dragSheet.dragging = true }
    }
    if (this.dragActive && this.dragSheet) {
      const loc = this._local(e.clientX, e.clientY)
      if (!loc) return
      const s = this.dragSheet, prev = s.t
      const nt = Math.acos(clamp(loc.x / s.w, -1, 1)) / Math.PI
      s.lagSign = nt >= prev ? 1 : -1
      s.t = nt; s.vel = s.vel * 0.6 + (nt - prev) * 0.4
      this._deformer(s); this._placer(s)
    }
  }

  _up(e, cancelled = false) {
    if (!this.pointer || e.pointerId !== this.pointer.id) return
    const p = this.pointer
    this.pointer = null
    const dt = performance.now() - p.t0
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0

    if (this.dragActive && this.dragSheet) {
      const s = this.dragSheet
      s.dragging = false
      const avance = cancelled ? s.target === 1 : s.t > 0.5 || s.vel > 0.02 ? true : s.vel < -0.02 ? false : s.t > 0.5
      const to = avance ? 1 : 0, etait = s.target === 1
      this._animer(s, to, 0.4 + 0.4 * Math.abs(to - s.t))
      if ((to === 1) !== etait) this._signaler(to === 1 ? 1 : -1, s)
      this.dragSheet = null; this.dragActive = false
      return
    }
    this.dragSheet = null
    if (cancelled) return

    // Balayage horizontal : page suivante / précédente.
    if (p.moved && dt < 650 && Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (this.zoom) this.zoomNav(dx < 0 ? 1 : -1); else dx < 0 ? this.next() : this.prev()
      return
    }
    if (p.moved) return

    // Appui simple / double.
    const now = performance.now()
    if (this.lastTap && now - this.lastTap.t < 320 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 44) {
      clearTimeout(this.lastTap.timer); this.lastTap = null
      const side = this.zoom ? this.zoom.side : p.loc0 && p.loc0.x >= 0 ? 'right' : 'left'
      if (this.zoom) this.on.loupe?.(this.page(side))
      else if (this.turned > 0 && this.turned < this.S) this.zoomTo(side)
      return
    }
    const loc = p.loc0
    const timer = setTimeout(() => {
      this.lastTap = null
      if (this.zoom) { this.zoomExit(); return }
      if (!loc) return
      const T = this.turned
      if (T === 0) { this.next(); return }
      if (T === this.S) { this.prev(); return }
      const side = loc.x >= 0.03 ? 'right' : loc.x <= -0.03 ? 'left' : null
      if (!side) return
      side === 'right' ? this.next() : this.prev()
    }, 290)
    this.lastTap = { t: now, x: e.clientX, y: e.clientY, timer }
  }

  _annulerDrag() {
    if (this.dragActive && this.dragSheet) { const s = this.dragSheet; s.dragging = false; this._animer(s, s.target, 0.4) }
    this.dragSheet = null; this.dragActive = false
  }

  // ---- Cadrage en lecture ------------------------------------------------------
  _cadrer() { this._aspect = innerWidth / innerHeight }

  _distance(camera, zoom) {
    const vHalf = Math.tan(camera.fov * Math.PI / 360), hHalf = vHalf * camera.aspect
    const marge = this.mobile ? 0.965 : 0.9
    const halfW = zoom ? PW / 2 * 1.02 : PW * COUV * 1.02
    const halfH = zoom ? PH / 2 * 1.02 : PH / 2 * COUV * 1.04
    return Math.max(halfW / hHalf, halfH / vHalf) / marge
  }

  // ---- Boucle ---------------------------------------------------------------------
  // Appelée après le rendu de la scène principale, avec la même caméra.
  rendu(camera, dt) {
    this._camera = camera
    const now = performance.now(), t = (now - this.t0) / 1000
    const damp = r => 1 - Math.exp(-r * Math.max(dt, 1e-3))

    // Tweens des feuilles.
    const nowS = now / 1000
    for (const s of this.sheets) {
      if (!s.anim) continue
      const a = s.anim
      if (a.start < 0) a.start = nowS + a.delay
      const raw = (nowS - a.start) / a.dur
      if (raw >= 1) { s.t = a.to; s.anim = null } else if (raw > 0) s.t = a.from + (a.to - a.from) * EASE(raw)
      this._deformer(s); this._placer(s)
    }
    const T = this.turned
    const cibleX = T === 0 ? -PW / 2 : T === this.S ? PW / 2 : 0
    this.flatX += (cibleX - this.flatX) * damp(4)
    this.flat.position.x = this.flatX

    // Blocs de tranche.
    const eff = this.sheets.reduce((a, s) => a + s.t, 0)
    const hR = Math.max(0, this.S - eff - 1) * TH, hL = Math.max(0, eff - 1) * TH
    this.blocR.visible = hR > 0.003; this.blocL.visible = hL > 0.003
    this.blocR.scale.z = Math.max(hR, 0.001); this.blocL.scale.z = Math.max(hL, 0.001)
    this.dos.scale.z = Math.max(hR, hL, TH)

    // Présence (le livre n'est pas dans l'atelier : il n'y vient qu'ouvert).
    this.presence += (this.presenceT - this.presence) * damp(3)

    // Pose « flottante » : au milieu du chemin, face à l'observateur, ou
    // envolé au-dessus quand on marche.
    this.ecarteK += (this.ecarte - this.ecarteK) * damp(1.6)
    const pf = this.flotte.p
    const yFl = pf.y + this.ecarteK * 2.3 + Math.sin(t * 0.7) * 0.05 + Math.sin(t * 1.9) * 0.015
    const posFl = new THREE.Vector3(pf.x, yFl, pf.z)
    // Tourné d'un quart vers la lumière, pour qu'on voie le dos et l'épaisseur :
    // un objet posé dans l'air, pas un panneau.
    const yawFl = Math.atan2(camera.position.x - pf.x, camera.position.z - pf.z) + this.yawOffset + Math.sin(t * 0.33) * 0.16
    const qFl = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2 - this.ecarteK * 0.5 + Math.sin(t * 0.5) * 0.04, yawFl, -0.05 + Math.sin(t * 0.41) * 0.035, 'YXZ'))

    // Pose « lecture » : dans les mains, devant la caméra ; en zoom, une page
    // seule est amenée au centre.
    const zoom = this.zoom
    const D = this._distance(camera, !!zoom)
    const interet = new THREE.Vector3(this.flatX + (zoom ? (zoom.side === 'right' ? 1 : -1) * PW / 2 : 0), zoom ? 0 : 0, 0)
    const qLoc = new THREE.Quaternion().setFromEuler(new THREE.Euler(zoom ? 0 : -0.06, 0, 0))
    // Un peu au-dessus du centre : la barre de navigation occupe le bas.
    const posLoc = new THREE.Vector3(0, D * (zoom ? 0.02 : 0.035), -D).sub(interet.clone().applyQuaternion(qLoc))
    camera.updateMatrixWorld()
    const posLec = posLoc.applyMatrix4(camera.matrixWorld)
    const qLec = camera.quaternion.clone().multiply(qLoc)
    const posBas = new THREE.Vector3(0, -1.2, -D).applyMatrix4(camera.matrixWorld)

    const g = this.groupe
    if (this.vol) {
      const v = this.vol
      const k = EASE(clamp((now - v.t0) / v.dur, 0, 1))
      if (v.vers === 'lecture') {
        const de = v.depuis === 'bas' ? posBas : (v.p0 || (v.p0 = g.position.clone()))
        const qDe = v.depuis === 'bas' ? qLec : (v.q0 || (v.q0 = g.quaternion.clone()))
        g.position.lerpVectors(de, posLec, k); g.quaternion.slerpQuaternions(qDe, qLec, k)
        g.scale.setScalar(v.depuis === 'bas' ? 0.6 + 0.4 * k : 1)
      } else {
        const p0 = v.p0 || (v.p0 = g.position.clone()), q0 = v.q0 || (v.q0 = g.quaternion.clone())
        const a = v.vers === 'flottant' ? posFl : posBas
        g.position.lerpVectors(p0, a, k); g.quaternion.slerpQuaternions(q0, v.vers === 'flottant' ? qFl : qLec, k)
        g.scale.setScalar(v.vers === 'flottant' ? 1 : 1 - 0.4 * k)
      }
      if (k >= 1) this.vol = null
    } else if (this.ouvert) {
      g.position.lerp(posLec, damp(9)); g.quaternion.slerp(qLec, damp(9)); g.scale.setScalar(1)
    } else {
      g.position.copy(posFl); g.quaternion.copy(qFl); g.scale.setScalar(1)
    }

    // Halo et poussières : autour du livre fermé, éteints en lecture.
    const halo = (this.ouvert || this.vol ? 0 : 1) * (this.visible ? 1 : 0) * this.presence
    this.haloMat.opacity = lerp(this.haloMat.opacity, halo * (0.95 + 0.05 * Math.sin(t * 0.9)) * (this.survol ? 1.2 : 1), damp(2))
    this.halo.position.copy(posFl).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(qFl), 0.3)
    this.raiMat.opacity = lerp(this.raiMat.opacity, halo * (0.55 + 0.12 * Math.sin(t * 0.6 + 1)), damp(2))
    this.rai.position.set(posFl.x + 0.05, posFl.y + PH * 1.9, posFl.z).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(qFl), 0.2)
    this.motesMat.opacity = lerp(this.motesMat.opacity, halo * 0.75, damp(2))
    const pos = this.motes.geometry.attributes.position.array
    for (let i = 0; i < this.nM; i++) {
      const ph = this.mPhase[i]
      pos[i * 3] = posFl.x + this.mBase[i * 3] + Math.sin(t * 0.4 + ph) * 0.12
      pos[i * 3 + 1] = posFl.y + ((this.mBase[i * 3 + 1] + t * (0.06 + 0.04 * Math.sin(ph)) + 1.1) % 2.2) - 1.1
      pos[i * 3 + 2] = posFl.z + this.mBase[i * 3 + 2] + Math.cos(t * 0.35 + ph * 1.3) * 0.12
    }
    this.motes.geometry.attributes.position.needsUpdate = true

    // Lumière : le soleil garde sa direction monde ; la clé suit un peu la caméra en lecture.
    this.groupe.visible = (this.visible || this.ouvert || this.vol) && this.presence > 0.02
    if (!this.groupe.visible && this.haloMat.opacity < 0.01) return

    const r = this.renderer
    const auto = r.autoClear
    r.autoClear = false
    r.clearDepth()
    r.render(this.scene, camera)
    r.autoClear = auto
  }
}

export { PW, PH }
