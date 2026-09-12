// Ambiance de forêt entièrement synthétisée (WebAudio) : vent dans les pins,
// bruissement de feuilles, et plusieurs « espèces » d'oiseaux qui chantent
// chacune à leur rythme, à des distances et des positions différentes.
// Aucun fichier audio à charger, aucune licence à vérifier — et le son
// n'est jamais le même deux fois.

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = arr => arr[Math.floor(Math.random() * arr.length)]

// Chaque espèce décrit la forme d'un chant : hauteur, nombre de notes,
// contour (glissando montant ou descendant), vibrato (trille) et rythme.
const ESPECES = [
  { // merle : sifflements clairs et mélodieux, un peu graves
    nom: 'merle', freq: [1900, 2900], notes: [3, 6], dur: [0.11, 0.19], gap: [0.13, 0.26],
    glide: [-0.35, 0.18], vib: [0, 0], gain: 0.9, repos: [9, 24]
  },
  { // mésange : « ti-tu ti-tu » rapide et aigu
    nom: 'mesange', freq: [3800, 5200], notes: [4, 9], dur: [0.06, 0.09], gap: [0.06, 0.11],
    glide: [-0.28, -0.1], vib: [0, 0], gain: 0.55, repos: [7, 18], alterne: true
  },
  { // rouge-gorge : phrases perlées, vibrato serré
    nom: 'rougegorge', freq: [2600, 4200], notes: [2, 4], dur: [0.22, 0.45], gap: [0.12, 0.3],
    glide: [-0.15, 0.25], vib: [18, 32], gain: 0.7, repos: [11, 28]
  },
  { // pouillot : trille descendant en cascade
    nom: 'pouillot', freq: [3200, 4600], notes: [7, 12], dur: [0.05, 0.08], gap: [0.03, 0.06],
    glide: [-0.12, -0.04], vib: [0, 0], gain: 0.5, repos: [14, 32], cascade: true
  },
  { // coucou, très loin : deux notes graves, beaucoup de réverbération
    nom: 'coucou', freq: [640, 700], notes: [2, 2], dur: [0.16, 0.2], gap: [0.14, 0.18],
    glide: [0, 0], vib: [0, 0], gain: 0.5, repos: [35, 80], loin: true, doux: true
  }
]

export class Ambiance {
  constructor() {
    this.ctx = null
    this.master = null
    this.enabled = false
    this.timers = []
    this.running = false
  }

  // À appeler depuis un geste utilisateur (obligatoire sur mobile).
  // Doit s'exécuter DANS le geste, sans attente asynchrone avant : Safari
  // ne laisse démarrer le son que là. Sur iPhone, l'interrupteur silencieux
  // coupe aussi le Web Audio sauf si la page se déclare en « lecture »,
  // comme un lecteur vidéo — c'est le rôle d'audioSession.
  unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch {}
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume()
      this._silence()
      return true
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return false
      this.ctx = new AC()
      if (this.ctx.state !== 'running') this.ctx.resume()
      this._graphe()
      this._silence()
      return true
    } catch {
      this.ctx = null
      return false
    }
  }

  // Un échantillon muet joué dans le geste : c'est ce qui « débloque »
  // réellement la sortie audio sur iOS.
  _silence() {
    try {
      const c = this.ctx, b = c.createBuffer(1, 1, 22050)
      const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0)
    } catch {}
  }

  _graphe() {
    const c = this.ctx
    this.master = c.createGain()
    this.master.gain.value = 0
    // Une légère compression garde les chants d'oiseaux dans une plage douce.
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -22; comp.knee.value = 18; comp.ratio.value = 3
    comp.attack.value = 0.01; comp.release.value = 0.35
    // Un passe-bas global : grand ouvert dehors, fermé à l'intérieur (les
    // oiseaux et le vent à travers les murs de bois).
    this.dehors = c.createBiquadFilter(); this.dehors.type = 'lowpass'; this.dehors.frequency.value = 20000
    this.master.connect(this.dehors).connect(comp).connect(c.destination)
    // Ce qui se joue à l'intérieur (le handpan sous les mains) contourne ce filtre.
    this.dedans = c.createGain(); this.dedans.gain.value = 1
    this.dedans.connect(comp)
    this.oiseaux = c.createGain(); this.oiseaux.gain.value = 1
    this.oiseaux.connect(this.master)
    this.niveauVent = 0

    // Réverbération de sous-bois : réponse impulsionnelle synthétique,
    // un bruit qui s'éteint en 2,4 s, plus sombre en fin de queue.
    const sr = c.sampleRate, len = Math.floor(sr * 2.4)
    const ir = c.createBuffer(2, len, sr)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        const t = i / len
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (1 - 0.35 * t)
      }
    }
    this.reverb = c.createConvolver(); this.reverb.buffer = ir
    const revLp = c.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 3200
    this.revGain = c.createGain(); this.revGain.gain.value = 0.55
    this.reverb.connect(revLp).connect(this.revGain).connect(this.master)

    // Bruit blanc partagé (4 s), lu en boucle par le vent et les feuilles.
    const nlen = sr * 4
    this.bruit = c.createBuffer(1, nlen, sr)
    const nd = this.bruit.getChannelData(0)
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1

    this._vent()
    this._feuilles()
  }

  _sourceBruit() {
    const s = this.ctx.createBufferSource()
    s.buffer = this.bruit; s.loop = true
    return s
  }

  // Le vent : deux nappes de bruit filtré, une par côté, dont le filtre et
  // le volume respirent lentement et indépendamment. C'est ce qui donne les
  // bouffées qui traversent les pins.
  _vent() {
    const c = this.ctx
    this.ventGain = c.createGain(); this.ventGain.gain.value = 0.16
    this.ventGain.connect(this.master)
    this.souffles = []
    for (const [pan, phase] of [[-0.6, 0], [0.6, 2.1]]) {
      const src = this._sourceBruit()
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.6
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90
      const g = c.createGain(); g.gain.value = 0.5
      const p = c.createStereoPanner ? c.createStereoPanner() : null
      if (p) p.pan.value = pan
      src.connect(hp).connect(lp).connect(g)
      if (p) g.connect(p).connect(this.ventGain); else g.connect(this.ventGain)
      src.start()
      this.souffles.push({ lp, g, phase, vitesse: rnd(0.05, 0.08), vitesse2: rnd(0.013, 0.021) })
    }
  }

  // Les feuilles : un bruit très aigu et très faible, qui ne s'entend que
  // dans les rafales (le gain suit celui du vent, élevé au carré).
  _feuilles() {
    const c = this.ctx
    const src = this._sourceBruit()
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.7
    this.feuillesGain = c.createGain(); this.feuillesGain.gain.value = 0
    src.connect(bp).connect(this.feuillesGain).connect(this.master)
    src.start()
  }

  // Une note d'oiseau : sinus (plus une pointe d'harmonique 2) dont la
  // hauteur glisse, avec un vibrato optionnel, dans une enveloppe très
  // courte. La distance se traduit par le volume, le passe-bas et la part
  // de réverbération.
  _note(t, f0, f1, dur, vib, gain, pan, distance) {
    const c = this.ctx
    const osc = c.createOscillator(); osc.type = 'sine'
    const osc2 = c.createOscillator(); osc2.type = 'sine'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur)
    osc2.frequency.setValueAtTime(f0 * 2, t)
    osc2.frequency.exponentialRampToValueAtTime(f1 * 2, t + dur)
    const g2 = c.createGain(); g2.gain.value = 0.12
    osc2.connect(g2)

    if (vib > 0) {
      const lfo = c.createOscillator(); lfo.frequency.value = vib
      const lg = c.createGain(); lg.gain.value = f0 * 0.035
      lfo.connect(lg).connect(osc.frequency)
      lfo.start(t); lfo.stop(t + dur + 0.05)
    }

    const env = c.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.25))
    env.gain.setValueAtTime(gain, t + dur * 0.6)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

    const lp = c.createBiquadFilter(); lp.type = 'lowpass'
    lp.frequency.value = 9000 - distance * 6500

    const p = c.createStereoPanner ? c.createStereoPanner() : null
    if (p) p.pan.value = pan

    osc.connect(env); g2.connect(env)
    env.connect(lp)
    const sec = c.createGain(); sec.gain.value = 1 - distance * 0.55
    const rev = c.createGain(); rev.gain.value = 0.25 + distance * 0.75
    if (p) { lp.connect(p); p.connect(sec); p.connect(rev) } else { lp.connect(sec); lp.connect(rev) }
    sec.connect(this.oiseaux); rev.connect(this.reverb)

    osc.start(t); osc.stop(t + dur + 0.05)
    osc2.start(t); osc2.stop(t + dur + 0.05)
  }

  // Un chant complet d'une espèce : une phrase de plusieurs notes.
  _chant(esp, pan, distance) {
    const c = this.ctx
    let t = c.currentTime + 0.05
    const n = Math.round(rnd(...esp.notes))
    const base = rnd(...esp.freq)
    const gain = esp.gain * (1 - distance * 0.7) * 0.22
    for (let i = 0; i < n; i++) {
      const dur = rnd(...esp.dur)
      let f0 = base * (esp.alterne && i % 2 ? 0.8 : 1)
      if (esp.cascade) f0 = base * Math.pow(0.94, i)
      if (!esp.alterne && !esp.cascade) f0 = base * rnd(0.93, 1.07)
      if (esp.nom === 'coucou') f0 = i === 0 ? base : base * 0.84
      const f1 = f0 * (1 + rnd(...esp.glide))
      const vib = rnd(...esp.vib)
      this._note(t, f0, Math.max(200, f1), dur, vib, gain, pan, distance)
      t += dur + rnd(...esp.gap)
    }
  }

  // Programme le prochain chant d'une espèce, puis se re-programme.
  _planifier(esp) {
    const delai = rnd(...esp.repos) * 1000 / this.densite
    const id = setTimeout(() => {
      if (!this.running) return
      const distance = esp.loin ? rnd(0.75, 0.95) : Math.pow(Math.random(), 0.7) * 0.85
      const pan = rnd(-0.9, 0.9)
      this._chant(esp, pan, distance)
      // Un oiseau qui vient de chanter reprend souvent une fois, plus court.
      if (!esp.loin && Math.random() < 0.45) {
        const id2 = setTimeout(() => this.running && this._chant(esp, pan, distance), rnd(900, 2600))
        this.timers.push(id2)
      }
      this._planifier(esp)
    }, delai)
    this.timers.push(id)
  }

  // Démarre l'ambiance et la fait monter en douceur.
  start(fadeIn = 5, densite = 1) {
    if (!this.ctx) return
    if (this.ctx.state !== 'running') this.ctx.resume()
    this.densite = densite
    this.running = true
    this.enabled = true
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t)
    this.master.gain.exponentialRampToValueAtTime(1, t + fadeIn)
    // Premiers chants rapprochés pour que la forêt s'anime tout de suite.
    for (const esp of ESPECES) {
      const id = setTimeout(() => {
        if (!this.running) return
        if (!esp.loin) this._chant(esp, rnd(-0.8, 0.8), rnd(0.15, 0.6))
        this._planifier(esp)
      }, esp.loin ? rnd(12000, 25000) : rnd(1200, 6000))
      this.timers.push(id)
    }
    this._boucle()
  }

  // Coupe en douceur sans détruire le graphe : on peut relancer.
  stop(fadeOut = 1.2) {
    if (!this.ctx) return
    this.enabled = false
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t)
    this.master.gain.exponentialRampToValueAtTime(0.0001, t + fadeOut)
    this.running = false
    for (const id of this.timers) clearTimeout(id)
    this.timers = []
    this.hp = null
  }

  // Un pas sur l'herbe et les feuilles : un coup sourd très court (le pied
  // qui se pose) et un froissement plus aigu juste après (les feuilles).
  // Fonctionne même quand l'ambiance est coupée par le bouton, tant que le
  // contexte existe — le silence total reste le choix de l'entrée.
  pas(pan = 0, force = 1, course = 0) {
    if (!this.ctx || !this.enabled) return
    const c = this.ctx, t = c.currentTime
    const p = c.createStereoPanner ? c.createStereoPanner() : null
    if (p) p.pan.value = pan
    const sortie = p || c.createGain()
    sortie.connect(this.master)

    const coup = this._sourceBruit()
    coup.playbackRate.value = rnd(0.85, 1.1)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = rnd(520, 760) - 180 * course; lp.Q.value = 0.9 + 0.4 * course
    const g1 = c.createGain()
    const v1 = 0.16 * force
    g1.gain.setValueAtTime(0.0001, t)
    g1.gain.exponentialRampToValueAtTime(v1, t + 0.008)
    g1.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.09, 0.13))
    coup.connect(lp).connect(g1).connect(sortie)
    coup.start(t); coup.stop(t + 0.2)

    const feuilles = this._sourceBruit()
    feuilles.playbackRate.value = rnd(0.9, 1.3)
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rnd(2600, 4200); bp.Q.value = 0.8
    const g2 = c.createGain()
    const v2 = 0.05 * force
    const t2 = t + rnd(0.01, 0.03)
    g2.gain.setValueAtTime(0.0001, t2)
    g2.gain.exponentialRampToValueAtTime(v2, t2 + 0.012)
    g2.gain.exponentialRampToValueAtTime(0.0001, t2 + rnd(0.07, 0.12))
    feuilles.connect(bp).connect(g2).connect(sortie)
    feuilles.start(t2); feuilles.stop(t2 + 0.2)
  }

  // Une page qui tourne : un souffle de bruit filtré dont la fréquence
  // balaie vers le haut puis retombe — le frottement du papier. La
  // couverture, rigide, fait un son plus sourd et plus long. Passe par le
  // chemin « dedans » : le livre est dans les mains, pas derrière les arbres.
  page(force = 0.6, rigide = false) {
    if (!this.ctx || !this.enabled) return
    const c = this.ctx, t = c.currentTime
    const dur = rigide ? 0.36 : 0.2 + force * 0.1
    const src = this._sourceBruit()
    src.playbackRate.value = rigide ? 0.7 : 0.95 + Math.random() * 0.25
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = rigide ? 0.8 : 1.4
    bp.frequency.setValueAtTime(rigide ? 420 : 750, t)
    bp.frequency.exponentialRampToValueAtTime(rigide ? 900 : 2600, t + dur * 0.55)
    bp.frequency.exponentialRampToValueAtTime(rigide ? 380 : 900, t + dur)
    const g = c.createGain()
    const pic = (rigide ? 0.14 : 0.1) * (0.55 + 0.45 * force)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(pic, t + 0.025)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp).connect(g).connect(this.dedans)
    src.start(t); src.stop(t + dur + 0.05)
  }

  // ---- Le handpan au loin --------------------------------------------------
  // Provisoire, en attendant l'enregistrement : un handpan synthétisé
  // (fondamentale, octave, quinte supérieure, chacune avec sa propre
  // extinction, et le petit choc de la main), qui improvise sur la gamme
  // ré Kurd — la plus répandue. Il est loin : filtré, réverbéré, à gauche.
  handpanLointain() {
    if (!this.ctx || this.hp) return
    const c = this.ctx
    this.hp = {
      gain: c.createGain(), lp: c.createBiquadFilter(),
      pan: c.createStereoPanner ? c.createStereoPanner() : null, rev: c.createGain(),
      gamme: [146.83, 220.0, 233.08, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0],
      prochain: c.currentTime + 1.5, degre: 4
    }
    const h = this.hp
    h.gain.gain.value = 0
    h.lp.type = 'lowpass'; h.lp.frequency.value = 1400
    h.rev.gain.value = 0.9
    let sortie = h.gain
    if (h.pan) { h.pan.pan.value = -0.6; sortie.connect(h.pan); sortie = h.pan }
    sortie.connect(h.lp)
    h.lp.connect(this.master); h.lp.connect(h.rev).connect(this.reverb)
    this._phraseHandpan()
  }

  _noteHandpan(t, f, vel) {
    const c = this.ctx, h = this.hp
    for (const [ratio, g, dur] of [[1, 1, 3.6], [2, 0.45, 2.4], [3, 0.22, 1.5], [4.9, 0.05, 0.6]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio
      const e = c.createGain()
      e.gain.setValueAtTime(0.0001, t)
      e.gain.exponentialRampToValueAtTime(0.22 * g * vel, t + 0.006 + 0.004 * ratio)
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur * (0.7 + 0.3 * vel))
      o.connect(e).connect(h.gain)
      o.start(t); o.stop(t + dur + 0.1)
    }
    // Le choc de la main sur l'acier.
    const n = this._sourceBruit()
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2.2; bp.Q.value = 2
    const e = c.createGain()
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.06 * vel, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    n.connect(bp).connect(e).connect(h.gain); n.start(t); n.stop(t + 0.1)
  }

  // Une mesure à la fois, programmée un peu en avance. Des pas conjoints
  // surtout, un saut de temps en temps, la note grave qui revient poser le
  // motif, des silences : ce que fait une main qui se promène.
  _phraseHandpan() {
    if (!this.hp || !this.running) return
    const h = this.hp, c = this.ctx
    const temps = 60 / 66
    let t = h.prochain
    const motifs = [[1, 0, 0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 1, 0, 1], [0.5, 0.5, 0.5, 0.5, 0, 1], [1, 1, 0, 1]]
    const motif = pick(motifs)
    let premier = true
    for (const dur of motif) {
      if (dur === 0) { t += temps * 0.5; continue }
      let f
      if (premier && Math.random() < 0.5) { f = h.gamme[0]; premier = false }
      else {
        const saut = Math.random() < 0.22 ? (Math.random() < 0.5 ? 2 : -2) : (Math.random() < 0.5 ? 1 : -1)
        h.degre = Math.max(1, Math.min(h.gamme.length - 1, h.degre + saut))
        f = h.gamme[h.degre]
      }
      this._noteHandpan(t + rnd(-0.012, 0.012), f, rnd(0.55, 1))
      t += temps * dur
      premier = false
    }
    if (Math.random() < 0.3) t += temps           // une respiration
    h.prochain = t
    const id = setTimeout(() => this._phraseHandpan(), Math.max(50, (t - c.currentTime - 0.6) * 1000))
    this.timers.push(id)
  }

  // Entrer dans l'atelier : la musique au loin s'éteint, dehors s'assourdit.
  interieur(on) {
    if (!this.ctx) return
    this.interieurOn = on
    const t = this.ctx.currentTime
    this.dehors.frequency.setTargetAtTime(on ? 900 : 20000, t, 1.2)
    this.oiseaux.gain.setTargetAtTime(on ? 0.35 : 1, t, 1)
    this.ventGain.gain.setTargetAtTime(on ? 0.05 : 0.16, t, 1)
    if (on && this.hp) {
      this.hp.gain.gain.setTargetAtTime(0.0001, t, 0.8)
      const h = this.hp; this.hp = null
      setTimeout(() => { try { h.lp.disconnect() } catch {} }, 4000)
    }
  }

  // Une note de handpan tout près : sous les mains. Sans le filtre extérieur,
  // avec une réverbération de bois discrète.
  noteProche(f, vel = 0.9, pan = 0) {
    if (!this.ctx) return
    const c = this.ctx, t = c.currentTime + 0.01
    if (!this.proche) {
      this.proche = c.createGain(); this.proche.gain.value = 1
      const rev = c.createGain(); rev.gain.value = 0.22
      this.proche.connect(this.dedans); this.proche.connect(rev).connect(this.reverb)
    }
    const p = c.createStereoPanner ? c.createStereoPanner() : null
    const sortie = p || c.createGain()
    if (p) p.pan.value = Math.max(-0.7, Math.min(0.7, pan))
    sortie.connect(this.proche)
    for (const [ratio, g, dur] of [[1, 1, 4.2], [2, 0.5, 2.8], [3, 0.24, 1.8], [4.9, 0.06, 0.7], [6.2, 0.03, 0.4]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio
      const e = c.createGain()
      e.gain.setValueAtTime(0.0001, t)
      e.gain.exponentialRampToValueAtTime(0.28 * g * vel, t + 0.005 + 0.003 * ratio)
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur * (0.7 + 0.3 * vel))
      o.connect(e).connect(sortie); o.start(t); o.stop(t + dur + 0.1)
    }
    const n = this._sourceBruit()
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2.4; bp.Q.value = 1.5
    const e = c.createGain()
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.09 * vel, t + 0.003); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    n.connect(bp).connect(e).connect(sortie); n.start(t); n.stop(t + 0.1)
  }

  // Distance (unités de la scène) et angle (radians, négatif = à gauche) de la
  // musique par rapport à l'auditeur. Les oiseaux s'effacent en approchant.
  setMusique(distance, angle) {
    if (!this.hp) return
    const t = this.ctx.currentTime
    const prox = Math.max(0, 1 - distance / 44)       // 0 loin … 1 tout près
    const vol = Math.pow(prox, 1.7) * 0.9 + 0.03
    this.hp.gain.gain.setTargetAtTime(vol, t, 0.3)
    this.hp.lp.frequency.setTargetAtTime(700 + prox * prox * 7000, t, 0.4)
    this.hp.rev.gain.setTargetAtTime(0.9 - prox * 0.6, t, 0.4)
    if (this.hp.pan) this.hp.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, Math.sin(angle) * 0.9)), t, 0.15)
    this.oiseaux.gain.setTargetAtTime(1 - prox * 0.7, t, 0.5)
  }

  // En courant, l'air siffle aux oreilles : le vent monte et s'ouvre.
  setCourse(k) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.course = k
    this.ventGain.gain.setTargetAtTime(this.interieurOn ? 0.05 : 0.16 + 0.3 * k, t, 0.6)
  }

  // Bouffée de vent : utilisée à l'entrée dans la forêt.
  rafale(force = 1) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    for (const s of this.souffles) {
      s.lp.frequency.cancelScheduledValues(t)
      s.lp.frequency.setValueAtTime(s.lp.frequency.value, t)
      s.lp.frequency.linearRampToValueAtTime(900 * force, t + 1.8)
      s.lp.frequency.linearRampToValueAtTime(380, t + 5)
    }
  }

  // Modulation lente du vent et des feuilles, au rythme de l'affichage.
  _boucle() {
    if (!this.running) return
    const t = this.ctx.currentTime
    let total = 0
    for (const s of this.souffles) {
      const k = 0.5 + 0.5 * Math.sin(t * s.vitesse * 6.283 + s.phase)
      const k2 = 0.5 + 0.5 * Math.sin(t * s.vitesse2 * 6.283 + s.phase * 1.7)
      const v = 0.25 + 0.75 * k * (0.4 + 0.6 * k2)
      s.g.gain.setTargetAtTime(v, t, 0.4)
      s.lp.frequency.setTargetAtTime(260 + 520 * v + 900 * (this.course || 0), t, 0.6)
      total += v
    }
    const moy = total / this.souffles.length
    this.niveauVent = moy
    this.feuillesGain.gain.setTargetAtTime(0.045 * moy * moy, t, 0.5)
    this._raf = requestAnimationFrame(() => this._boucle())
  }
}
