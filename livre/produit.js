// La page du livre : écran d'entrée → voyage (tunnel de lumière) → on
// atterrit dans la clairière, un grand livre lévite devant nous dans la
// lumière, avec les oiseaux et un handpan quelque part dans les arbres. On
// le touche (ou le bouton) : il vient dans les mains et s'ouvre.
//
// Pas de marche ici : on regarde autour de soi, et on lit.

import { Foret, TEMPLE_YAW } from '../src/foret.js'
import { Ambiance } from '../src/ambiance.js'
import { Livre } from '../src/livre.js'
import { Loupe } from '../src/loupe.js'
import { Voyage } from '../src/voyage.js'

const N_PAGES = 19
const LIVRE_DIST = 2.2        // tout près : on le voit bien
const LIVRE_HAUTEUR = -0.15

const $ = s => document.querySelector(s)
const params = new URLSearchParams(location.search)
const mobile = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent)
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches

const entry = $('#entry'), hud = $('#hud'), hint = $('#entry-hint')
const btnSon = $('#enter-sound'), btnSilence = $('#enter-silent'), toggle = $('#sound-toggle')
const lookHint = $('#look-hint'), murmure = $('#murmure'), ouvrir = $('#ouvrir')
const lecture = $('#lecture'), livreNum = $('#livre-num'), livrePlein = $('#livre-plein')

const ambiance = new Ambiance()
let foret = null, livre = null, loupe = null
let webgl = !params.has('no3d')

try {
  if (webgl) foret = new Foret($('#scene'), { mobile, base: '../' })
} catch (e) {
  console.warn('WebGL indisponible :', e)
  webgl = false
}
window.__foret = foret
if (!webgl) { $('#scene').hidden = true; $('#fallback').hidden = false }

const urlPage = p => `../livre/page-${String(p).padStart(2, '0')}.jpg`
if (foret) {
  livre = new Livre(foret.renderer, {
    mobile, nPages: N_PAGES, base: '../livre/',
    on: {
      ouvert: () => { hud.classList.add('is-lecture'); lecture.hidden = false; majPage(); montrerAide() },
      ferme: () => { foret.lecture = false; hud.classList.remove('is-lecture'); lecture.hidden = true },
      change: () => majPage(),
      tourne: (dir, rigide) => ambiance.page(0.7, rigide),
      zoom: () => majPage(),
      loupe: p => { if (p) loupe.ouvrir(p) }
    }
  })
  livre.poser(-Math.sin(TEMPLE_YAW) * LIVRE_DIST, LIVRE_HAUTEUR, -Math.cos(TEMPLE_YAW) * LIVRE_DIST)
  livre.yawOffset = 0.26            // il nous fait face, tourné d'un rien
  foret.apres = (cam, dt) => livre.rendu(cam, dt)
  foret.onTap = (nx, ny) => { if (livre.toucher(foret.camera, nx, ny)) ouvrirLivre() }
  loupe = new Loupe($('#loupe'), {
    url: urlPage, total: N_PAGES,
    onClose: () => {
      const p = loupe.page, etaitZoom = !!livre.zoom
      livre.goTo(Livre.feuillePour(p))
      if (etaitZoom || mobile) livre.zoomTo(p % 2 === 1 ? 'right' : 'left')
    }
  })
  window.__livre = livre
}

// Le panorama et les pages se chargent derrière l'écran d'entrée.
const pret = (async () => {
  if (foret) {
    const url = (!mobile && foret.maxTexture >= 6144) ? '../foret/sentier-6k.jpg' : '../foret/sentier-4k.jpg'
    await foret.charger(url)
    livre?.setEnvironment(foret.scene.environment)
    livre?.charger()
  }
  hint.textContent = mobile ? 'Inclinez votre téléphone une fois arrivé' : 'Le voyage est prêt'
  btnSon.disabled = false; btnSilence.disabled = false
})().catch(err => { console.error(err); hint.textContent = 'La forêt met du temps à charger… vérifiez votre connexion.' })
btnSon.disabled = true; btnSilence.disabled = true

// Boucle de rendu.
if (foret) {
  let raf
  const boucle = () => {
    foret.ventExterne = ambiance.running ? ambiance.niveauVent : null
    foret.rendu()
    raf = requestAnimationFrame(boucle)
  }
  boucle()
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else boucle() })
}

// ---- Entrée et voyage --------------------------------------------------------
let entre = false
async function entrer(avecSon) {
  if (entre) return
  entre = true
  if (avecSon && ambiance.unlock()) toggle.setAttribute('aria-pressed', 'true')
  else toggle.setAttribute('aria-pressed', 'false')
  if (foret && mobile) foret.activerGyro().catch(() => {})
  await pret

  const voyage = new Voyage($('#voyage'), { reduit, leger: mobile })
  entry.classList.add('is-leaving')
  await voyage.jouer({
    onCouvert: () => {
      entry.remove()
      hud.hidden = false
      foret?.setIntro(0)
    },
    onReveal: () => {
      // On atterrit : la tête redescend vers la clairière.
      if (avecSon && ambiance.ctx) { ambiance.start(3); ambiance.rafale(1) }
      descente()
    }
  })
  hud.classList.add('is-live')
  lookHint.textContent = foret?.gyroBrut
    ? 'Inclinez le téléphone ou glissez pour regarder · double appui pour recentrer'
    : 'Glissez pour regarder autour de vous'
  await attendre(1400)
  murmure.textContent = 'Il vous attend. Touchez-le.'
  hud.classList.add('is-settled')
  await attendre(2600)
  // Quelqu'un joue, pas loin, derrière les arbres.
  if (ambiance.running) { ambiance.handpanLointain(); ambiance.setMusique(13, 0.55) }
  await attendre(4000)
  hud.classList.add('is-settled')
  if (murmure.textContent === 'Il vous attend. Touchez-le.') murmure.textContent = ''
}

function descente() {
  if (!foret) return
  const duree = reduit ? 300 : 2200
  const t0 = performance.now()
  const step = () => {
    const p = Math.min(1, (performance.now() - t0) / duree)
    foret.setIntro(p)
    if (p < 1) requestAnimationFrame(step)
  }
  step()
}

btnSon.addEventListener('click', () => { ambiance.unlock(); entrer(true) })
btnSilence.addEventListener('click', () => entrer(false))
if (foret) foret.onInteraction = () => { if (hud.classList.contains('is-live')) hud.classList.add('is-settled') }

// ---- Le livre ----------------------------------------------------------------
function ouvrirLivre() {
  if (!livre || livre.ouvert) return
  foret.lecture = true
  murmure.textContent = ''
  livre.ouvrir(foret.camera)
}
ouvrir.addEventListener('click', ouvrirLivre)

function majPage() {
  if (!livre) return
  const T = livre.turned, S = livre.S
  let txt
  if (livre.zoom) { const p = livre.page(livre.zoom.side); txt = p ? `${p} / ${N_PAGES}` : (T === 0 ? 'Couverture' : '') }
  else if (T === 0) txt = 'Couverture'
  else if (T >= S) txt = 'Fin'
  else {
    const g = livre.page('left'), d = livre.page('right')
    txt = g && d ? `${g} – ${d} / ${N_PAGES}` : (g || d) ? `${g || d} / ${N_PAGES}` : ''
  }
  livreNum.textContent = txt
  livrePlein.hidden = !(livre.page('left') || livre.page('right'))
}

let aideTimer
function montrerAide() {
  lecture.classList.add('is-hint')
  clearTimeout(aideTimer)
  aideTimer = setTimeout(() => lecture.classList.remove('is-hint'), 7000)
}

$('#livre-fermer').addEventListener('click', () => livre?.fermer())
$('#livre-prev').addEventListener('click', () => { if (!livre) return; livre.zoom ? livre.zoomNav(-1) : livre.prev() })
$('#livre-next').addEventListener('click', () => { if (!livre) return; livre.zoom ? livre.zoomNav(1) : livre.next() })
livrePlein.addEventListener('click', () => {
  if (!livre) return
  const p = livre.page(livre.zoom?.side || 'right') || livre.page('left')
  if (p) loupe.ouvrir(p)
})

// ---- Son -----------------------------------------------------------------------
toggle.addEventListener('click', () => {
  const on = toggle.getAttribute('aria-pressed') === 'true'
  if (on) { ambiance.stop(); toggle.setAttribute('aria-pressed', 'false') }
  else if (ambiance.unlock()) {
    ambiance.start(2.5); toggle.setAttribute('aria-pressed', 'true')
    if (hud.classList.contains('is-settled')) { ambiance.handpanLointain(); ambiance.setMusique(13, 0.55) }
  }
})
document.addEventListener('visibilitychange', () => {
  if (!ambiance.ctx) return
  if (document.hidden) ambiance.ctx.suspend(); else if (ambiance.enabled) ambiance.ctx.resume()
})

const attendre = ms => new Promise(r => setTimeout(r, ms))
