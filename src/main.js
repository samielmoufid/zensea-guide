// Orchestration : écran d'entrée → déverrouillage du son et du gyroscope →
// voile de brume → descente dans la forêt → interface.

import { Foret } from './foret.js'
import { Ambiance } from './ambiance.js'
import { Atelier, ATELIER_YAW } from './atelier.js'

const $ = s => document.querySelector(s)
const params = new URLSearchParams(location.search)
const mobile = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent)
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches

const entry = $('#entry'), hud = $('#hud'), veil = $('#veil'), hint = $('#entry-hint')
const btnSon = $('#enter-sound'), btnSilence = $('#enter-silent'), toggle = $('#sound-toggle')
const lookHint = $('#look-hint'), choose = $('#choose'), walk = $('#walk'), murmure = $('#murmure')
const run = $('#run')
const carte = $('#carte'), carteNom = $('#carte-nom'), carteSous = $('#carte-sous'), guide = $('#guide')

const ambiance = new Ambiance()
let foret = null
let webgl = !params.has('no3d')

// ---- Scène ---------------------------------------------------------------
try {
  if (webgl) foret = new Foret($('#scene'), { mobile })
} catch (e) {
  console.warn('WebGL indisponible, repli 2D :', e)
  webgl = false
}
// Pratique pour inspecter la scène depuis la console.
window.__foret = foret
if (!webgl) {
  $('#scene').hidden = true
  $('#fallback').hidden = false
}

// Le panorama se charge pendant que l'écran d'entrée est affiché. Le bouton
// n'est actif qu'une fois la forêt prête : on n'entre jamais dans le noir.
const pret = (async () => {
  if (foret) {
    // 4K partout (33 Mo en mémoire graphique : dans le budget d'un iPhone),
    // 6K sur les machines qui l'acceptent. Le flou du 2K venait de là : sur
    // un téléphone on ne voit que 82° du panorama, soit un cinquième des
    // pixels étirés sur toute la largeur de l'écran.
    const url = (!mobile && foret.maxTexture >= 6144) ? './foret/vondel-6k.jpg' : './foret/vondel-4k.jpg'
    await foret.charger(url)
  }
  hint.textContent = mobile ? 'Inclinez votre téléphone une fois dans la forêt' : 'La forêt est prête'
  btnSon.disabled = false; btnSilence.disabled = false
})().catch(err => {
  console.error(err)
  hint.textContent = 'La forêt met du temps à charger… vérifiez votre connexion.'
})
btnSon.disabled = true; btnSilence.disabled = true

// ---- Le corps ------------------------------------------------------------
// Cinq photos (repos, marche gauche/droite, course gauche/droite) posées sur
// la vue. Elles glissent dans le champ quand on baisse les yeux, suivent le
// balancement de la tête, et à chaque pas la pose bascule d'un côté à
// l'autre — au rythme réel des pas, plus vite en courant.
const corps2d = $('#corps2d')
const calques = Object.fromEntries([...corps2d.querySelectorAll('.corps2d__c')].map(el => [el.dataset.c, el]))
const DEG = Math.PI / 180
let poseActive = 'repos'
function animerCorps() {
  if (!foret) return
  if (foret.autre || foret.intro < 0.9) { corps2d.classList.add('is-off'); return }
  corps2d.classList.remove('is-off')
  const p = foret.pitch
  // 0 = hors champ (regard à l'horizon) … 1 = en place (regard à ~60° en bas).
  let k = Math.min(1, Math.max(0, (-p - 12 * DEG) / (48 * DEG)))
  k = 1 - Math.pow(1 - k, 2)
  const h = corps2d.offsetHeight || 1
  const a = foret.allure || 0, e = foret.effort || 0, ph = foret.phasePas || 0
  const bob = (foret.bobY || 0) * (h * 0.9)
  const roll = -(foret.rollCorps || 0) / DEG * 0.5
  const pulse = 1 + Math.abs(Math.sin(ph)) * (0.012 + 0.02 * e) * a
  corps2d.style.transform = `translateY(${(1 - k) * 105}%) translateY(${bob}px) rotate(${roll}deg) scale(${pulse})`
  const pose = a < 0.3 ? 'repos' : (e > 0.5 ? 'course' : 'marche') + (Math.sin(ph) >= 0 ? '-g' : '-d')
  if (pose !== poseActive) {
    calques[poseActive]?.classList.remove('is-on')
    calques[pose]?.classList.add('is-on')
    poseActive = pose
  }
}

// Déclarés avant la boucle de rendu, qui démarre tout de suite.
let arrive = false
let musiqueLancee = false
if (foret) {
  let raf
  const boucle = () => {
    // Le vent qu'on entend est celui qu'on voit.
    foret.ventExterne = ambiance.running ? ambiance.niveauVent : null
    if (ambiance.running) ambiance.setCourse(foret.effort * foret.allure)
    if (ambiance.hp) ambiance.setMusique(foret.distanceMusique(), foret.angleMusique())
    if (musiqueLancee && !arrive && foret.distanceMusique() < 6) arrivee()
    foret.rendu()
    animerCorps()
    raf = requestAnimationFrame(boucle)
  }
  boucle()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf); else boucle()
  })
}

// ---- Entrée --------------------------------------------------------------
let entre = false
async function entrer(avecSon) {
  if (entre) return
  entre = true
  await pret

  // Tout ce qui exige un geste utilisateur se fait ici, dans le clic.
  if (avecSon && ambiance.unlock()) {
    ambiance.start(6)
    ambiance.rafale(1)
    toggle.setAttribute('aria-pressed', 'true')
  } else {
    toggle.setAttribute('aria-pressed', 'false')
  }
  if (foret && mobile) foret.activerGyro().catch(() => {})

  // 1. Le titre s'enfonce, l'arrière-plan s'approche.
  entry.classList.add('is-leaving')
  // 2. La brume monte et recouvre tout.
  // Appliqué de façon synchrone (lecture forcée de la mise en page entre les
  // deux) : un requestAnimationFrame peut arriver après le minuteur suivant
  // sur une machine qui rame, et le voile resterait alors opaque.
  veil.style.transition = 'opacity 1.4s cubic-bezier(.4,0,.6,1)'
  void veil.offsetHeight
  veil.style.opacity = '1'
  await attendre(1500)
  entry.remove()
  hud.hidden = false

  // 3. La brume se dissipe sur la descente dans la forêt.
  veil.style.transition = 'opacity 3.2s cubic-bezier(.3,0,.2,1)'
  veil.style.opacity = '0'
  const duree = reduit ? 800 : 5200
  const t0 = performance.now()
  await new Promise(res => {
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / duree)
      foret?.setIntro(p)
      if (p < 1) requestAnimationFrame(step); else res()
    }
    step()
  })

  // 4. L'interface se pose.
  hud.classList.add('is-live')
  lookHint.textContent = foret?.gyroBrut
    ? 'Inclinez le téléphone ou glissez pour regarder · double appui pour recentrer'
    : (mobile ? 'Glissez pour regarder autour de vous' : 'Glissez pour regarder · ↑ pour marcher, Maj pour courir')
  await attendre(4500)
  hud.classList.add('is-settled')

  // Acte 1 : quelqu'un joue, un peu plus loin.
  await attendre(2500)
  lancerMusique()
}

function lancerMusique() {
  if (musiqueLancee) return
  musiqueLancee = true
  if (ambiance.running) ambiance.handpanLointain()
  preparerAtelier()
  murmure.textContent = 'Quelqu’un joue, un peu plus loin.'
  hud.classList.add('is-musique')
  choose.querySelector('.btn__label').textContent = 'Suivre la musique'
}

// Le bouton tourne le regard vers la musique, puis on se met en marche.
async function suivre() {
  if (!musiqueLancee) return
  foret?.tournerVersMusique()
  murmure.textContent = ''
  // Les pieds vont vers la musique quoi qu'on regarde ; la tête reste libre.
  if (foret) foret.suivre = true
  for (let i = 0; i < 24 && foret?.cibleYaw != null; i++) await attendre(50)
  if (foret && !foret.marche) marcher(true)
}

// Arrivée : la lumière monte, et on entre dans l'atelier.
let atelier = null
async function arrivee() {
  arrive = true
  marcher(false)
  veil.style.transition = 'opacity 1.6s cubic-bezier(.4,0,.6,1)'
  void veil.offsetHeight
  veil.style.opacity = '1'
  await Promise.all([attendre(1700), atelierPret])
  entrerAtelier()
  veil.style.transition = 'opacity 2.6s cubic-bezier(.3,0,.2,1)'
  veil.style.opacity = '0'
  await attendre(2200)
  murmure.textContent = 'Il vient de partir. Le thé fume encore.'
  await attendre(5200)
  murmure.textContent = 'Choisissez votre handpan.'
}

// L'atelier se charge en arrière-plan dès que la musique commence.
let atelierPret = Promise.resolve()
function preparerAtelier() {
  if (!foret || atelier) return
  atelier = new Atelier(foret.renderer, { mobile })
  atelierPret = atelier.charger('./atelier/attic-3k.jpg').catch(err => console.error(err))
  atelier.onNote = (f, vel, pan) => ambiance.noteProche(f, vel, pan)
}

function entrerAtelier() {
  foret.entrerAtelier(atelier, ATELIER_YAW)
  ambiance.interieur(true)
  hud.classList.add('is-atelier')
  choose.hidden = true
  walk.hidden = true
  run.hidden = true
  // Un appui sur un handpan le choisit ; sur un champ, joue la note.
  foret.onTap = (nx, ny) => {
    const r = atelier.toucher(foret.camera, nx, ny)
    if (r?.type === 'choix') {
      carteNom.textContent = r.modele.nom; carteSous.textContent = r.modele.sous
      carte.hidden = false; guide.hidden = false
      hud.classList.add('is-choisi')
      murmure.textContent = 'Touchez les champs pour jouer.'
      setTimeout(() => { if (murmure.textContent === 'Touchez les champs pour jouer.') murmure.textContent = '' }, 5000)
      // La première note, offerte : c'est sa voix.
      setTimeout(() => ambiance.noteProche(r.modele.notes[0], 0.7, 0), 700)
    }
  }
  // Survol à la souris : le handpan s'éclaire.
  window.addEventListener('pointermove', e => {
    if (atelier.choisi) return
    const obj = atelier.viser(foret.camera, (e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    atelier.survol = obj ? (obj.userData.handpan || obj.parent) : null
    document.body.style.cursor = obj ? 'pointer' : ''
  }, { passive: true })
}

// Le déverrouillage audio se fait ici, dans le clic, avant toute attente.
btnSon.addEventListener('click', () => { ambiance.unlock(); entrer(true) })
btnSilence.addEventListener('click', () => entrer(false))

// Un glissé dans la forêt fait disparaître l'indication plus tôt.
if (foret) foret.onInteraction = () => { if (hud.classList.contains('is-live')) hud.classList.add('is-settled') }

// ---- Marche --------------------------------------------------------------
// Un appui lance la marche, un autre l'arrête ; si on maintient le bouton
// plus d'un instant, relâcher arrête aussi. Au clavier : ↑, Z ou W maintenus.
let marcher = () => {}
if (foret) {
  foret.onPas = (pan, force, course) => ambiance.pas(pan, force, course)
  const va = (on, course = false) => {
    foret.marche = on
    foret.course = on && course
    walk.classList.toggle('is-on', on && !course)
    run.classList.toggle('is-on', on && course)
    walk.querySelector('span').textContent = on && !course ? 'Stop' : 'Marcher'
    run.querySelector('span').textContent = on && course ? 'Stop' : 'Courir'
    walk.setAttribute('aria-pressed', on && !course ? 'true' : 'false')
    run.setAttribute('aria-pressed', on && course ? 'true' : 'false')
  }
  const brancher = (btn, course) => {
    let tAppui = 0
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation()
      tAppui = performance.now()
      foret.suivre = false
      const dejaCeMode = foret.marche && foret.course === course
      va(!dejaCeMode, course)
    })
    btn.addEventListener('pointerup', e => {
      e.preventDefault()
      if (foret.marche && foret.course === course && performance.now() - tAppui > 450) va(false)
    })
    btn.addEventListener('click', e => e.preventDefault())
  }
  brancher(walk, false); brancher(run, true)
  // Clavier : ↑ / Z / W pour marcher, avec Maj pour courir.
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'KeyW', 'KeyZ'].includes(e.code) && !e.repeat) { va(true, e.shiftKey); e.preventDefault() }
    if (e.code.startsWith('Shift') && foret.marche) va(true, true)
  })
  window.addEventListener('keyup', e => {
    if (['ArrowUp', 'KeyW', 'KeyZ'].includes(e.code)) va(false)
    if (e.code.startsWith('Shift') && foret.marche) va(true, false)
  })
  window.addEventListener('blur', () => va(false))
  document.addEventListener('visibilitychange', () => { if (document.hidden) va(false) })
  foret.onArret = () => va(false)
  marcher = va
}

// ---- Son -----------------------------------------------------------------
toggle.addEventListener('click', () => {
  const on = toggle.getAttribute('aria-pressed') === 'true'
  if (on) { ambiance.stop(); toggle.setAttribute('aria-pressed', 'false') }
  else {
    if (ambiance.unlock()) { ambiance.start(2.5); toggle.setAttribute('aria-pressed', 'true'); if (musiqueLancee) ambiance.handpanLointain() }
  }
})
document.addEventListener('visibilitychange', () => {
  if (!ambiance.ctx) return
  if (document.hidden) ambiance.ctx.suspend(); else if (ambiance.enabled) ambiance.ctx.resume()
})

// ---- Étape suivante (à brancher : choix du handpan) ----------------------
// Le bouton est en place ; l'écran de choix sera ajouté quand les visuels et
// les sons des handpans seront livrés.
choose.addEventListener('click', () => {
  if (musiqueLancee) suivre()
  else toast('Écoutez… quelqu’un ne va pas tarder à jouer.')
})

guide.addEventListener('click', () => toast('Le guide s’ouvrira ici — sur la table, à côté de vous.'))

let toastEl, toastTimer
function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('p'); toastEl.className = 'toast'; document.body.appendChild(toastEl) }
  toastEl.textContent = msg
  requestAnimationFrame(() => toastEl.classList.add('is-on'))
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2800)
}

const attendre = ms => new Promise(r => setTimeout(r, ms))
