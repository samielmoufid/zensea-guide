// L'atelier : une vraie cabane en bois (pine_attic, Poly Haven, CC0) où le
// musicien vient de partir. Sur la table basse, les handpans ; on en choisit
// un, on s'assoit, et on joue. Les handpans sont modelés ici en attendant
// les photos et les sons réels ; l'acier reflète la cabane elle-même
// (carte d'environnement tirée du panorama), c'est ce qui les rend crédibles.

import * as THREE from 'three'

const DEG = Math.PI / 180
const lerp = (a, b, k) => a + (b - a) * k

// Gammes provisoires : ding (centre) puis les champs dans le sens horaire.
const MODELES = [
  { nom: 'Ré Kurd 9', sous: 'Mineur, profond et mélancolique', couleur: 0x4a5560, rough: 0.34, notes: [146.83, 220.0, 233.08, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0] },
  { nom: 'Do♯ Amara 9', sous: 'Doux, lumineux, apaisant', couleur: 0x8a6a3a, rough: 0.28, notes: [138.59, 207.65, 246.94, 277.18, 311.13, 329.63, 369.99, 415.30, 493.88] },
  { nom: 'Fa Low Pygmy 9', sous: 'Grave, minimal, méditatif', couleur: 0x2a2a2e, rough: 0.42, notes: [174.61, 196.0, 207.65, 261.63, 311.13, 349.23, 392.0, 415.30, 523.25] }
]

// Ouverture de l'atelier : on regarde la partie ouverte de la cabane, sous
// les lucarnes (mesuré sur l'image : u = 0,60 → yaw 90° − 36°).
export const ATELIER_YAW = (90 - 36) * DEG

export class Atelier {
  constructor(renderer, { mobile = false } = {}) {
    this.renderer = renderer
    this.mobile = mobile
    this.scene = new THREE.Scene()
    this.pret = false
    this.choisi = null
    this.survol = null
    this.onNote = null          // (freq, velocite, pan) → son
    this.onSurvol = null        // (modele | null)
    this.t0 = performance.now()
    this.ray = new THREE.Raycaster()
    this.assis = 0               // 0 debout … 1 assis
    this._sphere()
    // Le mobilier est posé face à la vue d'ouverture.
    this.mobilier = new THREE.Group()
    this.mobilier.rotation.y = ATELIER_YAW
    this.scene.add(this.mobilier)
    this._table()
    this._handpans()
    this._tasse()
    this._poussieres()
  }

  _sphere() {
    const geo = new THREE.SphereGeometry(40, 64, 40)
    geo.scale(-1, 1, 1)
    this.panoMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
    this.scene.add(new THREE.Mesh(geo, this.panoMat))
  }

  charger(url) {
    return new Promise((res, rej) => {
      new THREE.TextureLoader().load(url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        this.panoMat.map = tex; this.panoMat.color.set(0xffffff); this.panoMat.needsUpdate = true
        // La cabane se reflète dans l'acier : carte d'environnement.
        const pm = new THREE.PMREMGenerator(this.renderer)
        this.scene.environment = pm.fromEquirectangular(tex).texture
        pm.dispose()
        this.pret = true
        res()
      }, undefined, rej)
    })
  }

  // ---- La table basse -----------------------------------------------------
  // Ronde, sombre, très basse : on la voit à peine, mais elle porte les
  // handpans et leur ombre, ce qui les ancre dans la photo.
  _table() {
    this.table = new THREE.Group()
    const bois = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.55, metalness: 0.05 })
    const plateau = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.8, 0.045, 48), bois)
    plateau.position.y = -0.98
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.62, 20), bois)
    pied.position.y = -1.31
    this.table.add(plateau, pied)
    this.table.position.set(0, 0, -2.15)
    this.mobilier.add(this.table)
  }

  // ---- Les handpans ---------------------------------------------------------
  _handpan(modele, i) {
    const g = new THREE.Group()
    const acier = new THREE.MeshStandardMaterial({ color: modele.couleur, metalness: 0.92, roughness: modele.rough, envMapIntensity: 1.1 })
    // Coque : profil tourné (deux calottes).
    const pts = []
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI
      pts.push(new THREE.Vector2(Math.sin(a) * 0.28, Math.cos(a) * 0.075))
    }
    const coque = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), acier)
    g.add(coque)
    // Ding central et huit champs, comme des creux polis sur la calotte.
    const creux = new THREE.MeshStandardMaterial({ color: new THREE.Color(modele.couleur).multiplyScalar(0.7), metalness: 0.95, roughness: modele.rough * 0.8 })
    const champs = []
    const R = 0.28, H = 0.075
    const poser = (rayonSurf, ang, taille, note, idx) => {
      // Sur la calotte : hauteur au rayon donné, normale = pente locale.
      const y = H * Math.sqrt(Math.max(0, 1 - (rayonSurf / R) ** 2))
      const m = new THREE.Mesh(new THREE.SphereGeometry(taille, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), creux)
      m.scale.y = 0.35
      m.position.set(Math.cos(ang) * rayonSurf, y - 0.004, Math.sin(ang) * rayonSurf)
      const n = new THREE.Vector3(Math.cos(ang) * rayonSurf / (R * R), y / (H * H), Math.sin(ang) * rayonSurf / (R * R)).normalize()
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
      m.userData = { note, idx, handpan: g }
      g.add(m); champs.push(m)
      // Anneau clair autour du champ : la marque du martelage.
      const an = new THREE.Mesh(new THREE.TorusGeometry(taille * 1.05, 0.003, 8, 40), acier)
      an.position.copy(m.position); an.quaternion.copy(m.quaternion); an.rotateX(Math.PI / 2)
      g.add(an)
    }
    poser(0, 0, 0.062, modele.notes[0], 0)
    for (let k = 0; k < 8; k++) poser(0.185, k * Math.PI / 4 - Math.PI / 2, 0.042, modele.notes[k + 1], k + 1)
    // Ombre douce sous l'instrument.
    const cv = document.createElement('canvas'); cv.width = cv.height = 128
    const c = cv.getContext('2d'); const gr = c.createRadialGradient(64, 64, 10, 64, 64, 64)
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128)
    const ombre = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }))
    ombre.rotation.x = -Math.PI / 2; ombre.position.y = -0.074
    g.add(ombre)
    g.userData = { modele, champs, i, coque, ombre, repos: new THREE.Vector3(), reposQ: new THREE.Quaternion() }
    return g
  }

  _handpans() {
    this.handpans = MODELES.map((m, i) => this._handpan(m, i))
    // Posés en arc sur la table, légèrement tournés vers le visiteur.
    const angles = [-38, 0, 38]
    this.handpans.forEach((g, i) => {
      const a = angles[i] * DEG
      g.position.set(Math.sin(a) * 0.55, -0.95 + 0.075, -2.15 + 0.15 + (1 - Math.cos(a)) * 0.35)
      g.rotation.set(0, -a * 0.6, 0)
      g.userData.repos.copy(g.position); g.userData.reposQ.copy(g.quaternion)
      this.mobilier.add(g)
    })
    this.cibles = this.handpans.flatMap(g => [g.userData.coque, ...g.userData.champs])
  }

  // ---- La tasse de thé qui fume encore --------------------------------------
  _tasse() {
    const ceram = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.6 })
    const tasse = new THREE.Group()
    const corps = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.036, 0.075, 24, 1, true), ceram)
    corps.material.side = THREE.DoubleSide
    const fond = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), ceram); fond.rotation.x = -Math.PI / 2; fond.position.y = -0.037
    const the = new THREE.Mesh(new THREE.CircleGeometry(0.043, 24), new THREE.MeshStandardMaterial({ color: 0x6a3f1a, roughness: 0.2 })); the.rotation.x = -Math.PI / 2; the.position.y = 0.028
    tasse.add(corps, fond, the)
    tasse.position.set(0.68, -0.95 + 0.04, -1.75)
    this.mobilier.add(tasse)
    // Vapeur : quelques sprites qui montent en s'effaçant.
    const cv = document.createElement('canvas'); cv.width = cv.height = 64
    const c = cv.getContext('2d'); const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(cv)
    this.vapeur = []
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }))
      s.userData = { phase: i / 6 }
      s.position.copy(tasse.position)
      this.mobilier.add(s); this.vapeur.push(s)
    }
    this.tasse = tasse
  }

  // ---- Poussière dans la lumière des lucarnes -------------------------------
  _poussieres() {
    const n = this.mobile ? 150 : 350
    const pos = new Float32Array(n * 3); this.pBase = new Float32Array(n * 3); this.pPh = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      this.pBase[i * 3] = (Math.random() - 0.5) * 5; this.pBase[i * 3 + 1] = (Math.random() - 0.5) * 3.5; this.pBase[i * 3 + 2] = (Math.random() - 0.5) * 5
      this.pPh[i] = Math.random() * 6.28
    }
    pos.set(this.pBase)
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const cv = document.createElement('canvas'); cv.width = cv.height = 32
    const c = cv.getContext('2d'); const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16)
    gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(1, 'rgba(255,240,210,0)')
    c.fillStyle = gr; c.fillRect(0, 0, 32, 32)
    this.pMat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 0.018, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, sizeAttenuation: true })
    this.points = new THREE.Points(geo, this.pMat); this.nP = n
    this.scene.add(this.points)
  }

  // ---- Interaction ------------------------------------------------------------
  // Survol (souris) ou visée (centre de l'écran sur mobile).
  viser(camera, nx, ny) {
    if (!this.pret) return null
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), camera)
    const hit = this.ray.intersectObjects(this.cibles, false)[0]
    return hit ? hit.object : null
  }

  // Un appui : sur un handpan non choisi → on le choisit ; sur un champ du
  // handpan choisi → on joue la note.
  toucher(camera, nx, ny) {
    const obj = this.viser(camera, nx, ny)
    if (!obj) return null
    const g = obj.userData.handpan || obj.parent
    if (this.choisi !== g) { this.choisir(g); return { type: 'choix', modele: g.userData.modele } }
    if (obj.userData.note) {
      const pan = obj.position.x * 2
      this.onNote?.(obj.userData.note, 0.9, pan)
      obj.userData.frappe = performance.now()
      return { type: 'note', note: obj.userData.note }
    }
    return null
  }

  choisir(g) {
    this.choisi = g
  }

  rendu(camera, dt) {
    if (!this.pret) return
    const t = (performance.now() - this.t0) / 1000
    // Poussières lentes dans la lumière.
    const pos = this.points.geometry.attributes.position.array
    for (let i = 0; i < this.nP; i++) {
      pos[i * 3] = this.pBase[i * 3] + Math.sin(t * 0.12 + this.pPh[i]) * 0.15
      pos[i * 3 + 1] = this.pBase[i * 3 + 1] + Math.sin(t * 0.08 + this.pPh[i] * 1.3) * 0.12 - (t * 0.01) % 3.5 + 1.75
      pos[i * 3 + 2] = this.pBase[i * 3 + 2] + Math.cos(t * 0.1 + this.pPh[i] * 0.7) * 0.15
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.pMat.opacity = lerp(this.pMat.opacity, 0.7, 0.02)
    // Vapeur.
    for (const s of this.vapeur) {
      const p = (t * 0.22 + s.userData.phase) % 1
      s.position.set(this.tasse.position.x + Math.sin(t * 1.3 + s.userData.phase * 9) * 0.02 * p, this.tasse.position.y + 0.05 + p * 0.28, this.tasse.position.z)
      s.scale.setScalar(0.05 + p * 0.12)
      s.material.opacity = Math.sin(p * Math.PI) * 0.55
    }
    // Handpans : celui qu'on a choisi vient à nous, incliné comme sur les
    // genoux ; les autres reculent un peu et s'assombrissent.
    for (const g of this.handpans) {
      const u = g.userData
      const estChoisi = this.choisi === g
      const cible = estChoisi ? new THREE.Vector3(0, -0.42 - this.assis * 0.05, -0.62) : u.repos
      g.position.lerp(cible, 0.06)
      const q = estChoisi ? new THREE.Quaternion().setFromEuler(new THREE.Euler(28 * DEG, 0, 0)) : u.reposQ
      g.quaternion.slerp(q, 0.06)
      const s = estChoisi ? 1.25 : (this.choisi ? 0.92 : 1)
      g.scale.setScalar(lerp(g.scale.x, s, 0.06))
      const survole = this.survol === g && !this.choisi
      u.coque.material.emissive.setHex(survole ? 0x3a2a12 : 0x000000)
      u.ombre.visible = !estChoisi
      for (const ch of u.champs) {
        const f = ch.userData.frappe ? Math.max(0, 1 - (performance.now() - ch.userData.frappe) / 600) : 0
        ch.material = ch.material // (matériau partagé : on anime l'échelle, pas la couleur)
        ch.scale.y = 0.35 + f * 0.25
      }
    }
  }
}
