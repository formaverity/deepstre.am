import { useEffect, useRef } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

const N      = 90        // history samples
const CW     = 148       // canvas CSS width  (px)
const LBL_W  = 20        // label column width (px)
const ROW_H  = 12        // waveform row height (px)
const GAP    = 3         // gap between rows (px)
const PAD    = 5         // outer padding (px)

// 5 waveform rows + 1 lit-dots row
const WAVEFORMS = [
  { key: 'pos',  label: 'POS',  norm: v => v },
  { key: 'grn',  label: 'GRN',  norm: v => Math.min(1, Math.max(0, (v - 0.02) / 0.23)) },
  { key: 'rate', label: 'RATE', norm: v => Math.min(1, Math.max(0, (v - 0.6)  / 1.0))  },
  { key: 'lap',  label: 'LAP',  norm: v => Math.min(1, Math.max(0, (v - 0.15) / 0.45)) },
  { key: 'spd',  label: 'SPD',  norm: v => Math.min(1, v * 40) },
]

const CH = PAD * 2 + WAVEFORMS.length * (ROW_H + GAP) + ROW_H  // fit all rows

const C_LINE = 'rgba(200,213,192,0.82)'
const C_DIM  = 'rgba(200,213,192,0.20)'
const C_FILL = 'rgba(200,213,192,0.05)'
const C_PURP = 'rgba(185,160,224,0.70)'

export default function SculptHUD() {
  const mode      = useMurmurStore(s => s.mode)
  const canvasRef = useRef()
  const sRef      = useRef(null)

  useEffect(() => {
    if (mode !== 'sculpt') return
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width  = Math.round(CW * dpr)
    canvas.height = Math.round(CH * dpr)
    canvas.style.width  = `${CW}px`
    canvas.style.height = `${CH}px`

    const ctx = canvas.getContext('2d')

    // Allocate history buffers once (or reuse if already allocated)
    if (!sRef.current) {
      sRef.current = {
        hist: Object.fromEntries(WAVEFORMS.map(w => [w.key, new Float32Array(N)])),
        head: 0,
        raf:  null,
      }
    }
    const s = sRef.current

    const tick = () => {
      const store  = useMurmurStore.getState()
      const sp     = store.sculptParams
      const frozen = store.grainFrozen

      if (sp) {
        const i = s.head % N
        s.hist.pos[i]  = sp.positionFraction ?? 0
        s.hist.grn[i]  = sp.grainSize        ?? 0.02
        s.hist.rate[i] = sp.playbackRate      ?? 1
        s.hist.lap[i]  = sp.overlap           ?? 0.5
        s.hist.spd[i]  = sp.speed             ?? 0
        s.head++
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, CW, CH)

      // ── Waveform rows ─────────────────────────────────────────────────────
      WAVEFORMS.forEach(({ key, label, norm }, ri) => {
        const wy = PAD + ri * (ROW_H + GAP)
        const wx = PAD + LBL_W
        const ww = CW - PAD - wx

        // Label
        ctx.font         = '7px ui-monospace,monospace'
        ctx.fillStyle    = C_DIM
        ctx.textBaseline = 'middle'
        ctx.textAlign    = 'left'
        ctx.fillText(label, PAD, wy + ROW_H * 0.5)

        // Baseline
        ctx.beginPath()
        ctx.strokeStyle = C_FILL
        ctx.lineWidth   = 0.5
        ctx.moveTo(wx, wy + ROW_H * 0.5)
        ctx.lineTo(wx + ww, wy + ROW_H * 0.5)
        ctx.stroke()

        // Waveform fill
        ctx.beginPath()
        for (let j = 0; j < N; j++) {
          const si = (s.head - N + j + N * 100) % N
          const v  = norm(s.hist[key][si])
          const x  = wx + (j / (N - 1)) * ww
          const y  = wy + ROW_H * (1 - v * 0.82) - ROW_H * 0.09
          if (j === 0) ctx.moveTo(x, wy + ROW_H)
          ctx.lineTo(x, y)
        }
        ctx.lineTo(wx + ww, wy + ROW_H)
        ctx.closePath()
        ctx.fillStyle = frozen ? 'rgba(185,160,224,0.07)' : C_FILL
        ctx.fill()

        // Waveform line
        ctx.beginPath()
        ctx.strokeStyle = frozen ? C_PURP : C_LINE
        ctx.lineWidth   = 0.85
        for (let j = 0; j < N; j++) {
          const si = (s.head - N + j + N * 100) % N
          const v  = norm(s.hist[key][si])
          const x  = wx + (j / (N - 1)) * ww
          const y  = wy + ROW_H * (1 - v * 0.82) - ROW_H * 0.09
          if (j === 0) ctx.moveTo(x, y)
          else         ctx.lineTo(x, y)
        }
        ctx.stroke()
      })

      // ── Lit dots row ─────────────────────────────────────────────────────
      const litY  = PAD + WAVEFORMS.length * (ROW_H + GAP)
      const litN  = sp?.litGroups ?? 0
      ctx.font         = '7px ui-monospace,monospace'
      ctx.fillStyle    = C_DIM
      ctx.textBaseline = 'middle'
      ctx.textAlign    = 'left'
      ctx.fillText('LIT', PAD, litY + ROW_H * 0.5)

      const dotX0   = PAD + LBL_W
      const dotArea = CW - PAD - dotX0
      const dotStep = dotArea / 16
      for (let d = 0; d < 16; d++) {
        const cx = dotX0 + d * dotStep + dotStep * 0.5
        const cy = litY + ROW_H * 0.5
        ctx.beginPath()
        ctx.arc(cx, cy, 1.8, 0, Math.PI * 2)
        ctx.fillStyle = d < litN ? C_LINE : C_FILL
        ctx.fill()
      }

      ctx.restore()
      s.raf = requestAnimationFrame(tick)
    }

    s.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(s.raf)
  }, [mode])

  if (mode !== 'sculpt') return null

  return (
    <div className="murmur-hud" aria-label="Sculpt parameters">
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}
