// Un handpan à partir de sa photo : la vue de dessus (fond blanc, découpée
// au disque) est projetée à plat sur une calotte tournée, avec une carte de
// relief tirée de la même photo pour que les creux des champs de notes
// accrochent les reflets du lieu. Coque du dessous en acier sombre, corde de
// rebord tressée ou joint caoutchouc selon le modèle.

import * as THREE from 'three'

export const R = 0.27          // rayon (Ø 54 cm)
const H_HAUT = 0.09            // hauteur de la calotte supérieure
export const H_BAS = 0.115     // profondeur de la coque inférieure (une vraie lentille, pas une assiette)

let ropeTex = null
function textureCorde() {
  if (ropeTex) return ropeTex
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32
  const g = cv.getContext('2d')
  g.fillStyle = '#c9ae7a'; g.fillRect(0, 0, 256, 32)
  for (let x = -32; x < 288; x += 16) {
    g.fillStyle = 'rgba(90,64,30,.55)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 0); g.lineTo(x + 24, 32); g.lineTo(x + 16, 32); g.fill()
    g.fillStyle = 'rgba(255,240,200,.35)'; g.beginPath(); g.moveTo(x + 8, 0); g.lineTo(x + 12, 0); g.lineTo(x + 28, 32); g.lineTo(x + 24, 32); g.fill()
  }
  ropeTex = new THREE.CanvasTexture(cv)
  ropeTex.colorSpace = THREE.SRGBColorSpace
  ropeTex.wrapS = THREE.RepeatWrapping; ropeTex.wrapT = THREE.RepeatWrapping
  ropeTex.repeat.set(40, 1)
  return ropeTex
}

// Calotte supérieure : profil légèrement aplati, UV = projection verticale
// (la photo, vue de dessus, se pose dessus sans déformation visible).
function calotte(haut) {
  // Le profil monte (y croissant) pour que les faces regardent vers l'extérieur :
  // du bord au sommet pour la calotte, du fond au bord pour la coque du dessous.
  const N = 40, pts = []
  for (let k = 0; k <= N; k++) {
    const r = haut ? R * (1 - k / N) : (k / N) * R
    const y = H_HAUT * Math.pow(Math.max(0, 1 - Math.pow(r / R, 2.3)), 0.62)
    pts.push(new THREE.Vector2(r, haut ? y : -y * (H_BAS / H_HAUT)))
  }
  // LatheGeometry tourne autour de Y ; le profil part du centre (r = 0).
  const geo = new THREE.LatheGeometry(pts, 96)
  if (haut) {
    const pos = geo.attributes.position, uv = geo.attributes.uv
    const k = 1 / (2 * R * 1.02)
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, 0.5 + pos.getX(i) * k, 0.5 - pos.getZ(i) * k)
    }
    uv.needsUpdate = true
  }
  geo.computeVertexNormals()
  return geo
}

/**
 * @param {Object} m  modèle { id, nom, sous, corde, rough, metal, notes }
 * @param {{ loader: THREE.TextureLoader, base: string, mobile: boolean, aniso: number }} o
 */
export function creerHandpan(m, { loader, base, mobile, aniso }) {
  const g = new THREE.Group()
  const acier = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: m.metal ?? 0.55, roughness: m.rough ?? 0.34,
    clearcoat: 0.12, clearcoatRoughness: 0.4, envMapIntensity: 0.9, normalScale: new THREE.Vector2(0.7, 0.7)
  })
  const coque = new THREE.Mesh(calotte(true), acier)
  g.add(coque)
  // La coque du dessous : le même acier, sans champs de notes. Sa teinte est
  // prise sur la photo (le bord du disque) dès que celle-ci est chargée.
  const acierBas = new THREE.MeshPhysicalMaterial({ color: 0x8a8a8c, metalness: 0.92, roughness: (m.rough ?? 0.34) + 0.08, clearcoat: 0.1, envMapIntensity: 0.9 })
  const dessous = new THREE.Mesh(calotte(false), acierBas)
  g.add(dessous)

  // Rebord : corde tressée ou joint noir.
  const rebord = new THREE.Mesh(
    new THREE.TorusGeometry(R + 0.004, m.corde ? 0.014 : 0.01, 12, 96),
    m.corde
      ? new THREE.MeshStandardMaterial({ map: textureCorde(), roughness: 0.95, metalness: 0 })
      : new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7, metalness: 0.05 })
  )
  rebord.rotation.x = Math.PI / 2
  g.add(rebord)

  // Champs de notes (invisibles) : là où le doigt frappe. Disposition
  // générique en attendant les notes réelles : ding au centre, huit autour.
  const champs = []
  const cible = new THREE.MeshBasicMaterial({ visible: false })
  const poser = (r, ang, taille, note, idx) => {
    const y = H_HAUT * Math.pow(Math.max(0, 1 - Math.pow(r / R, 2.3)), 0.62)
    const c = new THREE.Mesh(new THREE.CircleGeometry(taille, 20), cible)
    c.position.set(Math.cos(ang) * r, y + 0.002, Math.sin(ang) * r)
    c.rotation.x = -Math.PI / 2
    c.userData = { note, idx, handpan: g }
    g.add(c); champs.push(c)
  }
  poser(0, 0, 0.07, m.notes[0], 0)
  for (let k = 0; k < 8; k++) poser(R * 0.63, k * Math.PI / 4 - Math.PI / 2, 0.05, m.notes[k + 1] ?? m.notes[0] * 2, k + 1)

  // Halo de frappe : un anneau qui s'allume sur le champ touché.
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.06, 32), new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
  halo.rotation.x = -Math.PI / 2; halo.visible = false
  g.add(halo)

  // Ombre douce sous l'instrument.
  const cv = document.createElement('canvas'); cv.width = cv.height = 128
  const c2 = cv.getContext('2d'); const gr = c2.createRadialGradient(64, 64, 20, 64, 64, 64)
  gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
  c2.fillStyle = gr; c2.fillRect(0, 0, 128, 128)
  const ombre = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.6, R * 2.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }))
  ombre.rotation.x = -Math.PI / 2; ombre.position.y = -H_BAS - 0.002
  g.add(ombre)

  // Textures : la photo, puis le relief. Chargées après coup, sans bloquer.
  const charger = () => new Promise(res => {
    loader.load(`${base}hp-${m.id}.jpg`, tex => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso
      if (mobile && tex.image?.width > 700) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 640
        cv.getContext('2d').drawImage(tex.image, 0, 0, 640, 640); tex.image = cv
      }
      acier.map = tex; acier.needsUpdate = true
      // Teinte du dessous : moyenne d'un anneau près du bord de la photo.
      try {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64
        const c = cv.getContext('2d'); c.drawImage(tex.image, 0, 0, 64, 64)
        const d = c.getImageData(0, 0, 64, 64).data
        let r = 0, gg = 0, b = 0, n = 0
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          const dd = Math.hypot(x - 31.5, y - 31.5) / 31.5
          if (dd > 0.6 && dd < 0.86) { const i = (y * 64 + x) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++ }
        }
        if (n) acierBas.color.setRGB(r / n / 255, gg / n / 255, b / n / 255).convertSRGBToLinear().multiplyScalar(0.9)
      } catch {}
      loader.load(`${base}nm-${m.id}.jpg`, nm => {
        nm.anisotropy = aniso
        acier.normalMap = nm; acier.needsUpdate = true
        res(true)
      }, undefined, () => res(true))
    }, undefined, () => { acier.color.setHex(m.couleur ?? 0x555a60); acier.metalness = 0.9; res(false) })
  })

  g.userData = { modele: m, champs, coque, ombre, halo, charger, repos: new THREE.Vector3(), reposQ: new THREE.Quaternion(), reposS: 1 }
  return g
}
