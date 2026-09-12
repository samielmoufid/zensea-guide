// La loupe : une page du livre en pleine résolution, sur tout l'écran, qu'on
// pince pour agrandir et qu'on fait glisser. Un balayage vers la gauche
// passe à la page suivante ; l'indication, en bas, ne couvre pas la page et
// s'efface une fois le geste compris.

export class Loupe {
  /**
   * @param {HTMLElement} root  conteneur (#loupe)
   * @param {{ url(p): string, total: number, onOpen(), onClose() }} o
   */
  constructor(root, { url, total, onOpen, onClose } = {}) {
    this.root = root
    this.url = url
    this.total = total
    this.onOpen = onOpen
    this.onClose = onClose
    this.img = root.querySelector('img')
    this.num = root.querySelector('.loupe__num')
    this.aide = root.querySelector('.loupe__texte')
    this.page = 1
    this.ouverte = false
    this.compris = false          // le visiteur a déjà changé de page en glissant
    this.s = 1; this.tx = 0; this.ty = 0
    this.pts = new Map()
    this.fin = matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches
    this._lier()
  }

  ouvrir(p) {
    this.page = Math.max(1, Math.min(this.total, p || 1))
    this._charger()
    this.root.hidden = false
    this.root.classList.toggle('is-compris', this.compris)
    requestAnimationFrame(() => this.root.classList.add('is-on'))
    this.ouverte = true
    this._reset()
    this.onOpen?.()
  }

  fermer() {
    if (!this.ouverte) return
    this.ouverte = false
    this.root.classList.remove('is-on')
    setTimeout(() => { if (!this.ouverte) this.root.hidden = true }, 350)
    this.onClose?.()
  }

  aller(d, geste = false) {
    const p = this.page + d
    if (p < 1 || p > this.total) { this._butee(d); return }
    this.page = p
    this._charger()
    this._reset()
    this.root.classList.remove('is-glisse-g', 'is-glisse-d')
    void this.img.offsetWidth
    this.root.classList.add(d > 0 ? 'is-glisse-g' : 'is-glisse-d')
    if (geste && !this.compris) { this.compris = true; this.root.classList.add('is-compris') }
  }

  // En bout de livre : la page résiste un peu.
  _butee(d) {
    this.root.classList.remove('is-butee-g', 'is-butee-d')
    void this.img.offsetWidth
    this.root.classList.add(d > 0 ? 'is-butee-g' : 'is-butee-d')
  }

  _charger() {
    this.img.src = this.url(this.page)
    this.num.textContent = `${this.page} / ${this.total}`
    this.root.querySelector('.loupe__prev').disabled = this.page <= 1
    this.root.querySelector('.loupe__next').disabled = this.page >= this.total
    this.aide.textContent = this.page >= this.total
      ? 'Dernière page'
      : this.fin ? 'Glissez ou utilisez les flèches pour changer de page' : 'Glissez vers la gauche pour la page suivante'
  }

  _reset() { this.s = 1; this.tx = 0; this.ty = 0; this._appliquer() }

  _appliquer() {
    const r = this.img.getBoundingClientRect()
    const W = innerWidth, H = innerHeight
    const w0 = r.width / this.s, h0 = r.height / this.s
    const mx = Math.max(0, (w0 * this.s - W) / 2), my = Math.max(0, (h0 * this.s - H) / 2)
    this.tx = Math.max(-mx, Math.min(mx, this.tx)); this.ty = Math.max(-my, Math.min(my, this.ty))
    this.img.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`
    this.root.classList.toggle('is-zoom', this.s > 1.02)
  }

  _lier() {
    const r = this.root
    r.querySelector('.loupe__close').addEventListener('click', () => this.fermer())
    r.querySelector('.loupe__prev').addEventListener('click', () => this.aller(-1))
    r.querySelector('.loupe__next').addEventListener('click', () => this.aller(1))
    window.addEventListener('keydown', e => {
      if (!this.ouverte) return
      if (e.code === 'Escape') { this.fermer(); e.preventDefault(); e.stopImmediatePropagation() }
      if (e.code === 'ArrowRight') { this.aller(1, true); e.preventDefault(); e.stopImmediatePropagation() }
      if (e.code === 'ArrowLeft') { this.aller(-1, true); e.preventDefault(); e.stopImmediatePropagation() }
    }, true)

    const zone = r.querySelector('.loupe__zone')
    let pinch = null, dernierTap = 0, x0 = 0, y0 = 0, t0 = 0, bouge = false
    zone.addEventListener('pointerdown', e => {
      zone.setPointerCapture(e.pointerId)
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY })
      if (this.pts.size === 2) {
        const [a, b] = [...this.pts.values()]
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: this.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx0: this.tx, ty0: this.ty }
      } else { x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); bouge = false }
      e.preventDefault()
    })
    zone.addEventListener('pointermove', e => {
      const p = this.pts.get(e.pointerId)
      if (!p) return
      p.px = p.x; p.py = p.y; p.x = e.clientX; p.y = e.clientY
      if (pinch && this.pts.size === 2) {
        const [a, b] = [...this.pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const s = Math.max(1, Math.min(4.5, pinch.s0 * d / pinch.d0))
        const cx = (a.x + b.x) / 2 - innerWidth / 2, cy = (a.y + b.y) / 2 - innerHeight / 2
        const k = s / pinch.s0
        this.tx = cx - (pinch.cx - innerWidth / 2 - pinch.tx0) * k
        this.ty = cy - (pinch.cy - innerHeight / 2 - pinch.ty0) * k
        this.s = s
        this._appliquer()
      } else if (this.pts.size === 1) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) bouge = true
        if (this.s > 1.02) { this.tx += p.x - p.px; this.ty += p.y - p.py; this._appliquer() }
        else {
          // La page suit un peu le doigt : on sent qu'elle va partir.
          const dx = e.clientX - x0
          this.img.style.transform = `translate(${dx * 0.35}px, 0) scale(1)`
        }
      }
    })
    const fin = e => {
      const avait = this.pts.size
      this.pts.delete(e.pointerId)
      if (avait === 2) { pinch = null; const rest = [...this.pts.values()][0]; if (rest) { x0 = rest.x; y0 = rest.y; bouge = true }; return }
      if (this.pts.size) return
      const dt = performance.now() - t0, dx = e.clientX - x0, dy = e.clientY - y0
      if (this.s <= 1.02) {
        // Un geste franc, ou un long glissé lent : les deux changent de page.
        const franc = dt < 900 && Math.abs(dx) > 48
        const long = Math.abs(dx) > innerWidth * 0.25
        if (bouge && (franc || long) && Math.abs(dx) > Math.abs(dy) * 1.3) { this.aller(dx < 0 ? 1 : -1, true); return }
        this._appliquer() // la page revient en place
      }
      if (!bouge && dt < 350) {
        const now = performance.now()
        if (now - dernierTap < 320) {
          if (this.s > 1.02) this._reset()
          else {
            const s = 2.6
            this.tx = -(e.clientX - innerWidth / 2) * (s - 1); this.ty = -(e.clientY - innerHeight / 2) * (s - 1); this.s = s
            this._appliquer()
          }
          dernierTap = 0
        } else dernierTap = now
      }
    }
    zone.addEventListener('pointerup', fin)
    zone.addEventListener('pointercancel', fin)
    zone.addEventListener('wheel', e => {
      e.preventDefault()
      const s = Math.max(1, Math.min(4.5, this.s * (e.deltaY < 0 ? 1.12 : 0.89)))
      const k = s / this.s
      const cx = e.clientX - innerWidth / 2, cy = e.clientY - innerHeight / 2
      this.tx = cx - (cx - this.tx) * k; this.ty = cy - (cy - this.ty) * k; this.s = s
      this._appliquer()
    }, { passive: false })
    window.addEventListener('resize', () => { if (this.ouverte) this._appliquer() })
  }
}
