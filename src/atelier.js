// Le temple : un pavillon de bois ouvert sur la forêt, où l'on arrive
// directement. Plancher de lattes, huit piliers, poutres et toit sombre,
// lanternes de papier, et devant soi deux tables basses en arc qui portent
// les seize handpans de la maison, chacun modelé d'après sa photo. On en
// touche un : il vient sur les genoux, et on joue.
//
// La forêt reste tout autour (le panorama du sentier) : c'est elle qui se
// reflète dans l'acier et qui éclaire le bois.

import * as THREE from 'three'
import { creerHandpan, R, H_BAS } from './handpan.js'
import { TEMPLE_YAW, SUN_DIR } from './foret.js'

const DEG = Math.PI / 180
const lerp = (a, b, k) => a + (b - a) * k

// Ré mineur Kurd, la gamme la plus répandue : ding puis les champs.
const KURD = [146.83, 220.0, 233.08, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0]

// Les seize handpans actifs de la maison (fiches Shopify 101 → 125).
export const MODELES = [
  { id: '101', nom: 'Noir mat', sous: 'Sans reflet, sans artifice. L’acier nitruré laisse toute la place au son.', rough: 0.5, metal: 0.45 },
  { id: '102', nom: 'Bleu nuit', sous: 'Presque noir sous une lumière faible, il se révèle dès qu’on l’approche d’une fenêtre.', rough: 0.32 },
  { id: '103', nom: 'Doré', sous: 'Le doré chaud du nitrurage, obtenu par la température et non par une peinture.', rough: 0.3 },
  { id: '104', nom: 'Argenté', sous: 'Une finition sobre, qui laisse voir le relief du martelage sans le maquiller.', rough: 0.28 },
  { id: '105', nom: 'Bronze', sous: 'Un bronze mat aux reflets cuivrés, le plus proche des premiers handpans suisses.', rough: 0.36 },
  { id: '106', nom: 'Vortex noir', sous: 'Une spirale gravée autour du ding, qui tourne avec le regard.', rough: 0.26 },
  { id: '108', nom: 'Motif bleu', sous: 'Un motif gravé sur fond bleu, dessiné autour des champs de notes.', rough: 0.34 },
  { id: '109', nom: 'Cosmos', sous: 'Des reflets qui passent du violet au vert selon l’angle. À la chaleur, pas au vernis.', rough: 0.22 },
  { id: '110', nom: 'Violet profond', sous: 'Un violet sombre, très saturé, qui vire au prune sous une lampe chaude.', rough: 0.3 },
  { id: '112', nom: 'Mandala', sous: 'Un mandala gravé sur toute la coque, qui suit les cercles du martelage.', rough: 0.38, metal: 0.45 },
  { id: '114', nom: 'Argenté brossé', sous: 'Un acier brossé aux champs cuivrés, corde tressée au rebord.', rough: 0.4, corde: true },
  { id: '115', nom: 'Spirale noire', sous: 'Des cercles concentriques sur un acier bleu-noir, comme des ondes.', rough: 0.24 },
  { id: '117', nom: 'Spirale or clair', sous: 'Un or pâle, presque champagne, et des champs à peine creusés.', rough: 0.3 },
  { id: '119', nom: 'Mandala doré', sous: 'Un mandala fin gravé autour du ding, sur un doré clair.', rough: 0.3 },
  { id: '121', nom: 'Mandala argenté', sous: 'Un argent clair, mandala au centre, corde tressée au rebord.', rough: 0.3, corde: true },
  { id: '125', nom: 'Doré grande gamme · 17 notes', sous: 'Deux étages de notes : une couronne étendue et des graves sous la coque.', rough: 0.32, corde: true }
].map(m => ({ ...m, notes: KURD }))

// Vue d'ouverture : face aux tables, la forêt et le sentier derrière.
export const ATELIER_YAW = TEMPLE_YAW

// Hauteurs (la caméra debout est à y = 0).
const SOL = -1.5
const TABLE_AV = -0.74, TABLE_AR = -0.42
const R_AV = 1.8, R_AR = 2.6
// Le présentoir : la petite table juste devant soi où vient le handpan choisi.
export const PRESENTOIR = { x: 0, y: -0.78, z: -0.82, pitch: -40 * DEG }

function textureBois(teinte = '#6b4a2e', veines = '#3e2a17', larg = 512, haut = 512, lattes = 6) {
  const cv = document.createElement('canvas'); cv.width = larg; cv.height = haut
  const g = cv.getContext('2d')
  g.fillStyle = teinte; g.fillRect(0, 0, larg, haut)
  const lh = haut / lattes
  for (let l = 0; l < lattes; l++) {
    const y0 = l * lh
    g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`; g.fillRect(0, y0, larg, lh)
    // veines : longues sinusoïdes très fines
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = i % 3 ? `rgba(0,0,0,${0.08 + Math.random() * 0.1})` : 'rgba(255,230,190,0.08)'
      g.lineWidth = 0.6 + Math.random() * 1.4
      g.beginPath()
      const yy = y0 + Math.random() * lh
      for (let x = 0; x <= larg; x += 16) g.lineTo(x, yy + Math.sin(x * 0.02 + i) * 2.5 + Math.sin(x * 0.005 + i * 2) * 4)
      g.stroke()
    }
    g.fillStyle = veines; g.fillRect(0, y0 + lh - 2, larg, 2)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

export class Atelier {
  constructor(renderer, { mobile = false, base = './' } = {}) {
    this.renderer = renderer
    this.mobile = mobile
    this.base = base
    this.scene = new THREE.Scene()
    this.pret = false
    this.choisi = null
    this.survol = null
    this.onNote = null
    this.t0 = performance.now()
    this.ray = new THREE.Raycaster()
    this.assis = 0
    this.loader = new THREE.TextureLoader()
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())

    this._sphere()
    this._lumieres()
    this.mobilier = new THREE.Group()
    this.mobilier.rotation.y = ATELIER_YAW
    this.scene.add(this.mobilier)
    this._pavillon()
    this._tables()
    this._presentoir()
    this._handpans()
    this._lanternes()
    this._encens()
    this._poussieres()
  }

  // La forêt tout autour : même panorama que le sentier.
  _sphere() {
    const geo = new THREE.SphereGeometry(60, 64, 40)
    geo.scale(-1, 1, 1)
    this.panoMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
    this.scene.add(new THREE.Mesh(geo, this.panoMat))
  }

  // Le panorama est déjà chargé par la forêt : on le reçoit tel quel.
  utiliser(tex, environment) {
    this.panoMat.map = tex; this.panoMat.color.set(0xffffff); this.panoMat.needsUpdate = true
    this.scene.environment = environment
    this.pret = true
    // Les photos des handpans, une à une.
    ;(async () => { for (const g of this.handpans) await g.userData.charger() })()
  }

  charger(url) {
    return new Promise((res, rej) => {
      this.loader.load(url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        const pm = new THREE.PMREMGenerator(this.renderer)
        const env = pm.fromEquirectangular(tex).texture
        pm.dispose()
        this.utiliser(tex, env)
        res()
      }, undefined, rej)
    })
  }

  _lumieres() {
    // Le soleil entre par le côté ouvert ; le ciel et le sol de la forêt font le reste.
    this.soleil = new THREE.DirectionalLight(0xffe2bc, 1.0)
    this.soleil.position.copy(SUN_DIR).multiplyScalar(12)
    this.scene.add(this.soleil)
    this.scene.add(new THREE.HemisphereLight(0xe6f0e4, 0x4a3a26, 0.55))
  }

  // ---- Le pavillon --------------------------------------------------------------
  _pavillon() {
    const boisSol = textureBois('#7a563a', '#3a2718', 1024, 1024, 14)
    boisSol.repeat.set(4, 4)
    const boisSombre = new THREE.MeshStandardMaterial({ color: 0x3a2617, roughness: 0.7, metalness: 0.02 })
    const boisPilier = new THREE.MeshStandardMaterial({ map: textureBois('#5a3d26', '#2e1c0f', 256, 512, 1), roughness: 0.65 })
    const RP = 4.4

    // Plancher : un disque de lattes, avec une marche basse tout autour.
    const sol = new THREE.Mesh(new THREE.CircleGeometry(RP + 0.6, 64), new THREE.MeshStandardMaterial({ map: boisSol, roughness: 0.62, metalness: 0.03 }))
    sol.rotation.x = -Math.PI / 2; sol.position.y = SOL
    this.mobilier.add(sol)
    const marche = new THREE.Mesh(new THREE.CylinderGeometry(RP + 0.6, RP + 0.75, 0.16, 64, 1, true), boisSombre)
    marche.position.y = SOL - 0.08
    this.mobilier.add(marche)

    // Huit piliers, poutres, et le toit en pente vers le centre (on en voit le dessous).
    this.piliers = []
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 3.2, 24), boisPilier)
      p.position.set(Math.sin(a) * RP, SOL + 1.6, Math.cos(a) * RP)
      this.mobilier.add(p)
      const socle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.8 }))
      socle.position.set(p.position.x, SOL + 0.06, p.position.z)
      this.mobilier.add(socle)
      // Poutre vers le pilier suivant.
      const b = (i + 1) * Math.PI / 4 + Math.PI / 8
      const pa = new THREE.Vector3(Math.sin(a) * RP, SOL + 3.22, Math.cos(a) * RP), pb = new THREE.Vector3(Math.sin(b) * RP, SOL + 3.22, Math.cos(b) * RP)
      const L = pa.distanceTo(pb)
      const poutre = new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 0.22, 0.18), boisSombre)
      poutre.position.copy(pa).add(pb).multiplyScalar(0.5)
      poutre.rotation.y = Math.atan2(pb.x - pa.x, pb.z - pa.z) + Math.PI / 2
      this.mobilier.add(poutre)
      // Chevron qui monte vers le faîte.
      const haut = new THREE.Vector3(0, SOL + 4.6, 0)
      const dir = haut.clone().sub(pa)
      const chevron = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, dir.length()), boisSombre)
      chevron.position.copy(pa).add(haut).multiplyScalar(0.5)
      chevron.lookAt(haut)
      this.mobilier.add(chevron)
    }
    // Chevrons secondaires, plus fins.
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12
      const pa = new THREE.Vector3(Math.sin(a) * RP, SOL + 3.25, Math.cos(a) * RP), haut = new THREE.Vector3(0, SOL + 4.55, 0)
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, pa.distanceTo(haut)), boisSombre)
      c.position.copy(pa).add(haut).multiplyScalar(0.5); c.lookAt(haut)
      this.mobilier.add(c)
    }
    // Le dessous du toit : un cône sombre, face intérieure.
    const toit = new THREE.Mesh(new THREE.ConeGeometry(RP + 0.9, 1.5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9, side: THREE.BackSide }))
    toit.position.y = SOL + 3.25 + 0.75
    this.mobilier.add(toit)
    // Balustrade basse à l'arrière (trois travées), le devant reste ouvert sur la forêt.
    for (let i = 3; i <= 5; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8, b = (i + 1) * Math.PI / 4 + Math.PI / 8
      const pa = new THREE.Vector3(Math.sin(a) * RP, SOL + 0.9, Math.cos(a) * RP), pb = new THREE.Vector3(Math.sin(b) * RP, SOL + 0.9, Math.cos(b) * RP)
      const rail = new THREE.Mesh(new THREE.BoxGeometry(pa.distanceTo(pb) - 0.3, 0.07, 0.07), boisSombre)
      rail.position.copy(pa).add(pb).multiplyScalar(0.5); rail.rotation.y = Math.atan2(pb.x - pa.x, pb.z - pa.z) + Math.PI / 2
      this.mobilier.add(rail)
    }
    // Un coussin de méditation sous soi, et un tapis.
    const tapis = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshStandardMaterial({ color: 0x8a6d4b, roughness: 0.95 }))
    tapis.rotation.x = -Math.PI / 2; tapis.position.y = SOL + 0.004
    this.mobilier.add(tapis)
    const coussin = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.14, 32), new THREE.MeshStandardMaterial({ color: 0x2e5e46, roughness: 0.95 }))
    coussin.position.set(0, SOL + 0.07, 0.15)
    this.mobilier.add(coussin)
  }

  // ---- Les tables basses --------------------------------------------------------
  // Deux arcs devant soi : le premier bas et proche, le second plus haut et
  // plus loin, pour que les seize instruments se voient tous.
  _tables() {
    const bois = new THREE.MeshStandardMaterial({ map: textureBois('#4a3320', '#2a1a0e', 1024, 256, 2), roughness: 0.5, metalness: 0.05 })
    bois.map.repeat.set(6, 1)
    const arc = (rayon, largeur, y, a0, a1) => {
      const forme = new THREE.Shape()
      forme.absarc(0, 0, rayon + largeur / 2, a0, a1, false)
      forme.absarc(0, 0, rayon - largeur / 2, a1, a0, true)
      const geo = new THREE.ExtrudeGeometry(forme, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 64 })
      const m = new THREE.Mesh(geo, bois)
      // La forme est dessinée dans le plan (x, -z) : devant = -z. L'épaisseur
      // s'extrude vers le haut, le dessus du plateau est à y.
      m.rotation.x = -Math.PI / 2; m.position.y = y - 0.05
      this.mobilier.add(m)
      // Pieds : des blocs sous l'arc.
      const n = 5
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n
        const pied = new THREE.Mesh(new THREE.BoxGeometry(0.08, y - SOL - 0.05, largeur * 0.8), bois)
        pied.position.set(Math.cos(a) * rayon, (y - 0.05 + SOL) / 2, -Math.sin(a) * rayon)
        pied.rotation.y = a
        this.mobilier.add(pied)
      }
    }
    // Les angles sont mesurés dans le plan (x, -z) : devant = -z = angle 90°.
    arc(R_AV, 0.74, TABLE_AV, 90 * DEG - 74 * DEG, 90 * DEG + 74 * DEG)
    arc(R_AR, 0.74, TABLE_AR, 90 * DEG - 82 * DEG, 90 * DEG + 82 * DEG)
  }

  // ---- Le présentoir --------------------------------------------------------------
  // Une table ronde, basse, juste devant les genoux : vide à l'arrivée, elle
  // reçoit le handpan qu'on a choisi, bien à plat, tout entier sous les mains.
  _presentoir() {
    const bois = new THREE.MeshStandardMaterial({ map: textureBois('#4a3320', '#2a1a0e', 512, 512, 5), roughness: 0.5, metalness: 0.05 })
    const P = PRESENTOIR
    const plateau = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.4, 0.045, 48), bois)
    plateau.position.set(P.x, P.y - 0.0225, P.z)
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, P.y - SOL - 0.045, 20), bois)
    pied.position.set(P.x, (P.y - 0.045 + SOL) / 2, P.z)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.03, 32), bois)
    base.position.set(P.x, SOL + 0.015, P.z)
    this.mobilier.add(plateau, pied, base)
  }

  // ---- Les handpans -------------------------------------------------------------
  _handpans() {
    const opts = { loader: this.loader, base: this.base + 'atelier/handpans/', mobile: this.mobile, aniso: this.aniso }
    this.handpans = MODELES.map(m => creerHandpan(m, opts))
    // Sept devant, neuf derrière ; chacun tourné vers le centre et incliné vers nous.
    const poser = (g, rayon, angDeg, y) => {
      const a = angDeg * DEG
      g.position.set(Math.cos(a) * rayon, y + H_BAS, -Math.sin(a) * rayon)
      // Repère : face au visiteur (le "haut" de la photo vers l'extérieur), inclinaison 12° vers le centre.
      g.rotation.set(0, a - Math.PI / 2, 0)
      g.rotateX(6 * DEG)
      g.userData.repos.copy(g.position); g.userData.reposQ.copy(g.quaternion)
    }
    for (let i = 0; i < 7; i++) poser(this.handpans[i], R_AV, 90 + 63 - i * 21, TABLE_AV)
    for (let i = 0; i < 9; i++) poser(this.handpans[7 + i], R_AR, 90 + 72 - i * 18, TABLE_AR)
    for (const g of this.handpans) this.mobilier.add(g)
    this.cibles = this.handpans.flatMap(g => [g.userData.coque, ...g.userData.champs])
  }

  // ---- Lanternes de papier ---------------------------------------------------------
  _lanternes() {
    this.lanternes = []
    const papier = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffc27a, emissiveIntensity: 0.55, roughness: 1 })
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4
      const grp = new THREE.Group()
      const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 16), papier)
      lampe.scale.y = 1.25
      const cadre = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.006, 6, 32), new THREE.MeshStandardMaterial({ color: 0x2a1c12 }))
      cadre.rotation.x = Math.PI / 2
      const fil = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x1a1410 }))
      fil.position.y = 0.55
      const lum = new THREE.PointLight(0xffc27a, this.mobile ? 6 : 9, 7, 2)
      grp.add(lampe, cadre, fil, lum)
      grp.position.set(Math.sin(a) * 2.7, SOL + 2.5, Math.cos(a) * 2.7)
      grp.userData = { phase: i * 1.7, lum }
      this.mobilier.add(grp); this.lanternes.push(grp)
    }
  }

  // ---- L'encens et le thé, sur le côté --------------------------------------------
  _encens() {
    const gueridon = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.04, 32), new THREE.MeshStandardMaterial({ color: 0x3a2617, roughness: 0.6 }))
    gueridon.position.set(0.95, SOL + 0.42, 0.55)
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 12), gueridon.material)
    pied.position.set(0.95, SOL + 0.2, 0.55)
    this.mobilier.add(gueridon, pied)
    // Tasse.
    const ceram = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.6, side: THREE.DoubleSide })
    const tasse = new THREE.Group()
    tasse.add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.07, 24, 1, true), ceram))
    const the = new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), new THREE.MeshStandardMaterial({ color: 0x6a3f1a, roughness: 0.2 })); the.rotation.x = -Math.PI / 2; the.position.y = 0.026
    tasse.add(the)
    tasse.position.set(0.88, SOL + 0.475, 0.5)
    this.mobilier.add(tasse)
    // Bâton d'encens et sa fumée.
    const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x4a2c18 }))
    baton.position.set(1.04, SOL + 0.55, 0.62); baton.rotation.z = -0.12
    this.mobilier.add(baton)
    const cv = document.createElement('canvas'); cv.width = cv.height = 64
    const c = cv.getContext('2d'); const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(cv)
    this.fumee = []
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }))
      s.userData = { phase: i / 9 }
      this.mobilier.add(s); this.fumee.push(s)
    }
    this.encensPos = new THREE.Vector3(1.05, SOL + 0.66, 0.62)
  }

  _poussieres() {
    const n = this.mobile ? 160 : 380
    const pos = new Float32Array(n * 3); this.pBase = new Float32Array(n * 3); this.pPh = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      this.pBase[i * 3] = (Math.random() - 0.5) * 7; this.pBase[i * 3 + 1] = SOL + 0.3 + Math.random() * 3; this.pBase[i * 3 + 2] = (Math.random() - 0.5) * 7
      this.pPh[i] = Math.random() * 6.28
    }
    pos.set(this.pBase)
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const cv = document.createElement('canvas'); cv.width = cv.height = 32
    const c = cv.getContext('2d'); const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16)
    gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(1, 'rgba(255,240,210,0)')
    c.fillStyle = gr; c.fillRect(0, 0, 32, 32)
    this.pMat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 0.02, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, sizeAttenuation: true })
    this.points = new THREE.Points(geo, this.pMat); this.nP = n
    this.scene.add(this.points)
  }

  // ---- Interaction --------------------------------------------------------------------
  viser(camera, nx, ny) {
    if (!this.pret) return null
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), camera)
    const hit = this.ray.intersectObjects(this.cibles, false)[0]
    return hit ? hit.object : null
  }

  // Un appui : sur un handpan non choisi → on le choisit ; sur un champ du
  // handpan choisi → on joue la note ; ailleurs → on le repose.
  toucher(camera, nx, ny) {
    const obj = this.viser(camera, nx, ny)
    if (!obj) {
      if (this.choisi) { this.choisi = null; return { type: 'repose' } }
      return null
    }
    const g = obj.userData.handpan || obj.parent
    if (this.choisi !== g) { this.choisir(g); return { type: 'choix', modele: g.userData.modele } }
    if (obj.userData.note) {
      const pan = obj.position.x * 2
      this.onNote?.(obj.userData.note, 0.9, pan)
      obj.userData.frappe = performance.now()
      const halo = g.userData.halo
      halo.visible = true; halo.position.copy(obj.position); halo.material.opacity = 0.9; halo.scale.setScalar(0.8)
      return { type: 'note', note: obj.userData.note }
    }
    return null
  }

  choisir(g) { this.choisi = g }

  rendu(camera, dt) {
    if (!this.pret) return
    const t = (performance.now() - this.t0) / 1000
    // Poussières dans la lumière.
    const pos = this.points.geometry.attributes.position.array
    for (let i = 0; i < this.nP; i++) {
      pos[i * 3] = this.pBase[i * 3] + Math.sin(t * 0.12 + this.pPh[i]) * 0.15
      pos[i * 3 + 1] = this.pBase[i * 3 + 1] + Math.sin(t * 0.08 + this.pPh[i] * 1.3) * 0.12 - (t * 0.01) % 3 + 1.5
      pos[i * 3 + 2] = this.pBase[i * 3 + 2] + Math.cos(t * 0.1 + this.pPh[i] * 0.7) * 0.15
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.pMat.opacity = lerp(this.pMat.opacity, 0.6, 0.02)
    // Lanternes : la flamme respire.
    for (const l of this.lanternes) l.userData.lum.intensity = (this.mobile ? 6 : 9) * (0.9 + 0.1 * Math.sin(t * 2.3 + l.userData.phase) * Math.sin(t * 0.7 + l.userData.phase))
    // Fumée d'encens : un filet qui monte en ondulant.
    for (const s of this.fumee) {
      const p = (t * 0.16 + s.userData.phase) % 1
      s.position.set(this.encensPos.x + Math.sin(t * 0.9 + p * 7) * 0.04 * p, this.encensPos.y + p * 0.9, this.encensPos.z + Math.cos(t * 0.7 + p * 5) * 0.03 * p)
      s.scale.setScalar(0.04 + p * 0.22)
      s.material.opacity = Math.sin(p * Math.PI) * 0.35 * (1 - p * 0.5)
    }
    // Handpans : celui qu'on a choisi vient sur les genoux, les autres restent sur les tables.
    for (const g of this.handpans) {
      const u = g.userData
      const estChoisi = this.choisi === g
      // Choisi : posé à plat sur le présentoir (le fond de la coque sur le bois).
      const cible = estChoisi ? new THREE.Vector3(PRESENTOIR.x, PRESENTOIR.y + H_BAS, PRESENTOIR.z) : u.repos
      g.position.lerp(cible, 0.07)
      const q = estChoisi ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)) : u.reposQ
      g.quaternion.slerp(q, 0.07)
      const s = 1
      g.scale.setScalar(lerp(g.scale.x, s, 0.07))
      const survole = this.survol === g && !this.choisi
      u.coque.material.emissive.setHex(survole ? 0x2a1e10 : 0x000000)
      u.ombre.visible = true
      if (u.halo.visible) {
        u.halo.material.opacity *= 0.9; u.halo.scale.multiplyScalar(1.03)
        if (u.halo.material.opacity < 0.02) u.halo.visible = false
      }
    }
  }
}
