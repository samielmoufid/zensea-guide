// Le voyage : un tunnel de traînées de lumière dorées et vertes, des
// feuilles aspirées vers le point de fuite, puis la lumière se dissipe sur
// la clairière. Canvas 2D plein écran, ~1,9 s. D'après la transition du
// guide Hydelis, dans la palette de la forêt.

const TEINTES = ['#d7c39a', '#f2e2b4', '#9fd18a', '#e9f5df', '#ffd59a']

export class Voyage {
  constructor(canvas, { reduit = false, leger = false } = {}) {
    this.canvas = canvas
    this.reduit = reduit
    this.leger = leger
    this.ctx = canvas.getContext('2d')
  }

  /**
   * `onCouvert` : l'écran est entièrement couvert (on échange les scènes).
   * `onReveal` : juste avant que le tunnel ne se dissipe.
   */
  jouer({ onCouvert, onReveal } = {}) {
    if (this.reduit) return this._fondu(onCouvert, onReveal)
    return this._tunnel(onCouvert, onReveal)
  }

  _fondu(onCouvert, onReveal) {
    const el = this.canvas
    el.style.display = 'block'; el.style.transition = 'opacity .3s ease'; el.style.background = '#0b1a13'; el.style.opacity = '0'
    return new Promise(res => {
      requestAnimationFrame(() => {
        el.style.opacity = '1'
        setTimeout(() => {
          onCouvert?.()
          setTimeout(() => {
            onReveal?.(); el.style.opacity = '0'
            setTimeout(() => { el.style.display = 'none'; el.style.background = 'none'; res() }, 320)
          }, 80)
        }, 340)
      })
    })
  }

  _tunnel(onCouvert, onReveal) {
    const canvas = this.canvas, ctx = this.ctx
    const dpr = Math.min(window.devicePixelRatio || 1, this.leger ? 1.5 : 2)
    const w = innerWidth, h = innerHeight
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    canvas.style.display = 'block'; canvas.style.opacity = '1'
    const cx0 = w / 2, cy = h * 0.46
    const maxR = Math.hypot(cx0, cy) * 1.15
    const N = this.leger ? 60 : 120
    const traits = []
    for (let i = 0; i < N; i++) {
      traits.push({ a: Math.random() * Math.PI * 2, r: 0.02 * maxR + Math.random() * maxR, len: 0.05 + Math.random() * 0.16, w: 0.8 + Math.random() * 2.2, c: TEINTES[(Math.random() * TEINTES.length) | 0], chroma: !this.leger && Math.random() < 0.3 })
    }
    // Feuilles aspirées vers la lumière.
    const feuilles = []
    for (let i = 0; i < (this.leger ? 12 : 26); i++) {
      feuilles.push({ a: Math.random() * Math.PI * 2, r: maxR * (0.35 + Math.random() * 0.75), s: 0.6 + Math.random() * 1.4, taille: 3 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 8, c: Math.random() < 0.5 ? '#9fd18a' : '#d7c39a' })
    }
    const DUR = 1900
    let t0 = performance.now(), couvert = false, revele = false
    return new Promise(res => {
      const tick = () => {
        const t = (performance.now() - t0) / DUR
        if (t >= 1) {
          if (!couvert) { couvert = true; try { onCouvert?.() } catch (e) { console.error(e) } }
          if (!revele) { revele = true; try { onReveal?.() } catch (e) { console.error(e) } }
          canvas.style.display = 'none'; res(); return
        }
        const vitesse = Math.sin(Math.min(1, t) * Math.PI) ** 1.5
        const alpha = t < 0.24 ? t / 0.24 : t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1
        const cx = cx0 + Math.sin(t * Math.PI * 3.4) * w * 0.07 * Math.sin(Math.PI * Math.min(1, t)) * (this.leger ? 0.75 : 1)
        if (!couvert && t >= 0.42) {
          couvert = true
          const b0 = performance.now()
          try { onCouvert?.() } catch (e) { console.error(e) }
          t0 += performance.now() - b0
        }
        if (couvert && !revele && t >= 0.7) { revele = true; try { onReveal?.() } catch (e) { console.error(e) } }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.globalCompositeOperation = 'source-over'
        ctx.clearRect(0, 0, w, h)
        // Voile de sous-bois qui couvre la scène, puis lumière blanche au bout.
        ctx.fillStyle = `rgba(8, 22, 15, ${0.97 * alpha})`
        ctx.fillRect(0, 0, w, h)
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.55)
        halo.addColorStop(0, `rgba(255, 236, 190, ${(0.22 + 0.5 * vitesse) * alpha})`)
        halo.addColorStop(0.35, `rgba(215, 195, 154, ${0.12 * alpha})`)
        halo.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h)

        ctx.globalCompositeOperation = 'lighter'
        for (const s of traits) {
          s.r += vitesse * maxR * 0.055 * (0.5 + s.len * 3)
          if (s.r > maxR) s.r = 0.02 * maxR + Math.random() * 0.1 * maxR
          const r2 = s.r + s.len * maxR * (0.3 + vitesse * 2.2)
          const x1 = cx + Math.cos(s.a) * s.r, y1 = cy + Math.sin(s.a) * s.r
          const x2 = cx + Math.cos(s.a) * r2, y2 = cy + Math.sin(s.a) * r2
          if (this.leger) {
            ctx.globalAlpha = alpha * 0.6; ctx.strokeStyle = s.c; ctx.lineWidth = s.w
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
            ctx.globalAlpha = alpha * 0.85; ctx.strokeStyle = '#fff8e8'; ctx.lineWidth = s.w * 0.7
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(s.a) * (s.r + (r2 - s.r) * 0.72), cy + Math.sin(s.a) * (s.r + (r2 - s.r) * 0.72)); ctx.lineTo(x2, y2); ctx.stroke()
            continue
          }
          const grad = ctx.createLinearGradient(x1, y1, x2, y2)
          grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.6, s.c); grad.addColorStop(1, 'rgba(255,250,235,0.9)')
          ctx.globalAlpha = alpha * 0.85; ctx.strokeStyle = grad; ctx.lineWidth = s.w
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
          if (s.chroma) {
            ctx.globalAlpha = alpha * 0.3; ctx.strokeStyle = '#b8f0a0'; ctx.lineWidth = s.w * 0.8
            const da = 0.004
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(s.a + da) * s.r, cy + Math.sin(s.a + da) * s.r); ctx.lineTo(cx + Math.cos(s.a + da) * r2, cy + Math.sin(s.a + da) * r2); ctx.stroke()
          }
        }
        // Feuilles : elles tournent en filant vers la lumière.
        ctx.globalCompositeOperation = 'source-over'
        for (const f of feuilles) {
          f.r -= vitesse * maxR * 0.03 * f.s
          if (f.r < maxR * 0.04) f.r = maxR * (0.6 + Math.random() * 0.5)
          f.rot += f.vr * 0.016 * (0.3 + vitesse)
          const x = cx + Math.cos(f.a) * f.r, y = cy + Math.sin(f.a) * f.r
          const k = f.taille * (0.35 + f.r / maxR)
          ctx.save(); ctx.translate(x, y); ctx.rotate(f.rot); ctx.globalAlpha = alpha * 0.8; ctx.fillStyle = f.c
          ctx.beginPath(); ctx.moveTo(0, -k); ctx.quadraticCurveTo(k * 0.8, 0, 0, k); ctx.quadraticCurveTo(-k * 0.8, 0, 0, -k); ctx.fill(); ctx.restore()
        }
        ctx.globalAlpha = 1
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }
}
