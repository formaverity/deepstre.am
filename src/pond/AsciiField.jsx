import { useEffect, useRef } from 'react'
import usePondStore from '@/store/usePondStore.js'
import { sampleCell } from '@/utils/pondCodec.js'
import { shimmerBrightness } from '@/pond/shimmer.js'
import { pickGlyph } from '@/pond/glyphs.js'
import { doubletDisplacement } from '@/pond/displacement.js'

const CHAR_ASPECT = 0.6
const CELL_H      = 11
const CELL_W      = CELL_H * CHAR_ASPECT

const REGION_BASE_ALPHA  = [0, 0.04, 0.06, 0.07]
const REGION_ALPHA_SCALE = 0.38

// Pre-computed alpha strings in 64 steps — avoids per-cell string allocation
const ALPHA_STEPS = 64
const ALPHA_CACHE = Array.from({ length: REGION_BASE_ALPHA.length }, (_, reg) =>
  Array.from({ length: ALPHA_STEPS }, (__, i) => {
    const sb    = i / (ALPHA_STEPS - 1)
    const alpha = REGION_BASE_ALPHA[reg] + sb * REGION_ALPHA_SCALE
    return `rgba(255,255,255,${alpha.toFixed(3)})`
  })
)

export default function AsciiField({ field, creaturesRef, creatureDragRef }) {
  const canvasRef    = useRef(null)
  const mouseDownPos = useRef(null)

  useEffect(() => {
    if (!field) return

    const canvas    = canvasRef.current
    const container = canvas.parentElement
    const ctx       = canvas.getContext('2d', { alpha: true })

    let rafId
    const t0       = performance.now()
    const animZoom = { v: usePondStore.getState().camera.targetZoom }
    const animPan  = { x: usePondStore.getState().camera.x, y: usePondStore.getState().camera.y }
    let initialized = false

    // ── Resize observer ────────────────────────────────────────────────

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const dpr = window.devicePixelRatio || 1
      canvas.width  = Math.round(width  * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width  = `${width}px`
      canvas.style.height = `${height}px`
      usePondStore.getState().setViewport(width, height)

      if (!initialized) {
        initialized = true
        const fieldW = field.cols * CELL_W
        const fieldH = field.rows * CELL_H
        // Fit the pond within 90% of the viewport on first load.
        // Caps at 1 so we never start zoomed in past 100%.
        const fitZoom = Math.min(1, (width * 0.9) / fieldW, (height * 0.9) / fieldH)
        animZoom.v = fitZoom
        usePondStore.setState(s => ({
          camera: {
            ...s.camera,
            zoom:       fitZoom,
            targetZoom: fitZoom,
            x: Math.round((width  - fieldW * fitZoom) / 2),
            y: Math.round((height - fieldH * fitZoom) / 2),
          },
        }))
      }
    })
    ro.observe(container)

    // ── RAF loop ───────────────────────────────────────────────────────

    function frame(ts) {
      rafId = requestAnimationFrame(frame)

      const store     = usePondStore.getState()
      const { targetZoom, pivot } = store.camera
      const debugFlow = store.debug.flow
      const t         = (ts - t0) / 1000

      // ── Smooth zoom + incremental pivot-pan ────────────────────────────
      // Pan correction is applied frame-by-frame so the pivot stays fixed
      // on screen throughout the zoom animation — no pop on scroll.
      const prevAnim = animZoom.v
      animZoom.v += (targetZoom - animZoom.v) * 0.14
      const zoom = animZoom.v

      if (pivot && prevAnim > 0.001) {
        const f     = zoom / prevAnim
        // Also incorporate any drag delta that arrived since last frame.
        const dragX = store.camera.x - animPan.x
        const dragY = store.camera.y - animPan.y
        animPan.x   = pivot.mx + (animPan.x - pivot.mx) * f + dragX
        animPan.y   = pivot.my + (animPan.y - pivot.my) * f + dragY
      } else {
        // No active zoom pivot — sync from store (drag updates land here).
        animPan.x = store.camera.x
        animPan.y = store.camera.y
      }

      const settled = Math.abs(zoom - targetZoom) < 0.001
      usePondStore.setState(s => ({
        camera: {
          ...s.camera,
          zoom,
          x:     animPan.x,
          y:     animPan.y,
          pivot: settled ? null : pivot,
        },
      }))

      const panX = animPan.x
      const panY = animPan.y

      const dpr  = window.devicePixelRatio || 1
      const cssW = canvas.width  / dpr
      const cssH = canvas.height / dpr

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.translate(panX, panY)
      ctx.scale(zoom, zoom)

      ctx.font         = `${CELL_H}px ui-monospace, 'Courier New', Courier, monospace`
      ctx.textBaseline = 'top'
      ctx.textAlign    = 'left'

      // Visible world rect (in world px)
      const wL = -panX / zoom,          wT = -panY / zoom
      const wR = (cssW - panX) / zoom,  wB = (cssH - panY) / zoom

      const col0 = Math.max(0,              Math.floor(wL / CELL_W) - 1)
      const col1 = Math.min(field.cols - 1, Math.ceil( wR / CELL_W) + 1)
      const row0 = Math.max(0,              Math.floor(wT / CELL_H) - 1)
      const row1 = Math.min(field.rows - 1, Math.ceil( wB / CELL_H) + 1)

      // Pre-filter creatures whose influence circle touches the visible rect
      const creatures    = creaturesRef ? creaturesRef.current : []
      const visCreatures = creatures.filter(c => {
        const r1 = c.influenceRadius ?? ((c.radius ?? 12) * 4)
        return c.x + r1 > wL && c.x - r1 < wR && c.y + r1 > wT && c.y - r1 < wB
      })
      const hasFlow = visCreatures.length > 0

      // ── Debug: flow vectors (drawn BEFORE glyphs so they sit behind) ──
      if (debugFlow && hasFlow) {
        ctx.save()
        ctx.strokeStyle = 'rgba(159,225,203,0.22)'
        ctx.lineWidth   = 0.5
        for (let cy = row0; cy <= row1; cy++) {
          for (let cx = col0; cx <= col1; cx++) {
            const wx = cx * CELL_W, wy = cy * CELL_H
            const { dx, dy } = doubletDisplacement(wx, wy, visCreatures, t, CELL_H)
            const mag = Math.abs(dx) + Math.abs(dy)
            if (mag < 0.15) continue
            ctx.beginPath()
            ctx.moveTo(wx + CELL_W * 0.3,       wy + CELL_H * 0.5)
            ctx.lineTo(wx + CELL_W * 0.3 + dx,  wy + CELL_H * 0.5 + dy)
            ctx.stroke()
          }
        }
        ctx.restore()
      }

      // ── Main glyph render ─────────────────────────────────────────────
      let lastFillStyle = ''
      for (let cy = row0; cy <= row1; cy++) {
        const baseWy = cy * CELL_H
        for (let cx = col0; cx <= col1; cx++) {
          const cell = sampleCell(field, cx, cy)
          const reg  = cell.region
          if (reg === 0) continue

          const baseWx = cx * CELL_W

          // Displacement — bounding-box pre-reject per cell is O(1) inside doubletDisplacement
          let drawX = baseWx, drawY = baseWy
          if (hasFlow) {
            const { dx, dy, mask } = doubletDisplacement(baseWx, baseWy, visCreatures, t, CELL_H)
            if (mask) continue
            drawX += dx
            drawY += dy
          }

          // Only water (reg 1) shimmers — shore/veg return static brightness directly
          const sb    = reg === 1
            ? shimmerBrightness(cell.brightness, cx, cy, t, 0.15, 1)
            : cell.brightness / 255
          const glyph = pickGlyph({ ...cell, brightness: Math.round(sb * 255) }, field.ramps)
          if (glyph === ' ') continue

          const bucket    = Math.min(ALPHA_STEPS - 1, Math.round(sb * (ALPHA_STEPS - 1)))
          const fillStyle = ALPHA_CACHE[reg][bucket]
          if (fillStyle !== lastFillStyle) {
            ctx.fillStyle = fillStyle
            lastFillStyle = fillStyle
          }
          ctx.fillText(glyph, drawX, drawY)
        }
      }

      // ── Creature glyphs ─────────────────────────────────────────────────
      // Draw each creature's ASCII glyph at 3× cell height, centred on its
      // current animated world position.
      if (creatures.length > 0) {
        const creatureH = CELL_H * 3
        ctx.save()
        ctx.font         = `${creatureH}px ui-monospace, 'Courier New', Courier, monospace`
        ctx.textBaseline = 'middle'
        ctx.textAlign    = 'center'
        for (const c of creatures) {
          if (c.x < wL - creatureH * 2 || c.x > wR + creatureH * 2) continue
          if (c.y < wT - creatureH * 2 || c.y > wB + creatureH * 2) continue
          const glyph = c.project?.glyph?.ascii
          if (!glyph) continue
          ctx.fillStyle = 'rgba(255,255,255,0.55)'
          ctx.fillText(glyph, c.x, c.y)
        }
        ctx.restore()
      }

      ctx.restore()
    }

    rafId = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(rafId); ro.disconnect() }
  }, [field, creaturesRef])

  function handleMouseDown(e) {
    mouseDownPos.current = { x: e.clientX, y: e.clientY }

    // If pressing on a creature, start a drag rather than a pan.
    const { x: panX, y: panY, zoom } = usePondStore.getState().camera
    const worldX = (e.clientX - panX) / zoom
    const worldY = (e.clientY - panY) / zoom

    const creatures = creaturesRef ? creaturesRef.current : []
    for (const c of creatures) {
      const rx = worldX - c.x, ry = worldY - c.y
      if (Math.sqrt(rx * rx + ry * ry) < c.radius * 2.5) {
        if (creatureDragRef) creatureDragRef.current = c

        let lastDragX = e.clientX
        let lastDragY = e.clientY

        function onDragMove(me) {
          const { zoom: z } = usePondStore.getState().camera
          c.homeX += (me.clientX - lastDragX) / z
          c.homeY += (me.clientY - lastDragY) / z
          lastDragX = me.clientX
          lastDragY = me.clientY
        }

        function onDragUp() {
          if (creatureDragRef) creatureDragRef.current = null
          window.removeEventListener('mousemove', onDragMove)
          window.removeEventListener('mouseup',   onDragUp)
        }

        window.addEventListener('mousemove', onDragMove)
        window.addEventListener('mouseup',   onDragUp)
        break
      }
    }
  }

  function handleClick(e) {
    // Don't open project if the pointer moved (drag or creature drag).
    if (mouseDownPos.current) {
      const dx = e.clientX - mouseDownPos.current.x
      const dy = e.clientY - mouseDownPos.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) return
    }

    const { x: panX, y: panY, zoom } = usePondStore.getState().camera
    const worldX = (e.clientX - panX) / zoom
    const worldY = (e.clientY - panY) / zoom

    const creatures = creaturesRef ? creaturesRef.current : []
    for (const c of creatures) {
      const rx = worldX - c.x, ry = worldY - c.y
      if (Math.sqrt(rx * rx + ry * ry) < c.radius * 2.5) {
        const p = c.project
        usePondStore.getState().openProject({
          slug:   p.slug,
          name:   p.name,
          status: p.status,
          mode:   p.frame.mode,
          target: p.frame.target,
        })
        return
      }
    }
  }

  function handleMouseMove(e) {
    if (creatureDragRef?.current) return  // already dragging
    const { x: panX, y: panY, zoom } = usePondStore.getState().camera
    const worldX = (e.clientX - panX) / zoom
    const worldY = (e.clientY - panY) / zoom
    const creatures = creaturesRef ? creaturesRef.current : []
    const hit = creatures.some(c => {
      const rx = worldX - c.x, ry = worldY - c.y
      return Math.sqrt(rx * rx + ry * ry) < c.radius * 2.5
    })
    e.currentTarget.style.cursor = hit ? 'pointer' : ''
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      style={{ position: 'absolute', inset: 0, display: 'block' }}
    />
  )
}
