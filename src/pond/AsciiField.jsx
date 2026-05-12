import { useEffect, useRef } from 'react'
import usePondStore from '@/store/usePondStore.js'
import { sampleCell } from '@/utils/pondCodec.js'
import { fbm, noise2D } from '@/utils/noise.js'
import { shimmerBrightness } from '@/pond/shimmer.js'
import { pickGlyph } from '@/pond/glyphs.js'
import { doubletDisplacement } from '@/pond/displacement.js'
import projects from '@/projects/_manifest.js'

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

// Glyph mask — geometry-responsive clearance built from the actual rendered pixels.
// Each glyph is rasterised onto a small offscreen canvas (SCALE× oversample),
// then the alpha mask is morphologically dilated by MARGIN world-px to create a halo.
// Cells whose centre falls on a masked pixel are suppressed in the main render.
const GLYPH_MASK_SCALE  = 2   // oversample factor
const GLYPH_MASK_MARGIN = 4   // world-px halo around the glyph shape

// Rasterises `canvas` (with the glyph drawn at offset MARGIN*SCALE, MARGIN*SCALE,
// size worldW*SCALE × worldH*SCALE) into a dilated binary mask.
function buildGlyphMask(canvas, worldW, worldH) {
  const W = canvas.width, H = canvas.height
  const raw = canvas.getContext('2d').getImageData(0, 0, W, H).data
  const src = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) src[i] = raw[i * 4 + 3] > 24 ? 1 : 0

  // Forward box-dilation: for every set source pixel, fill a dilR-radius neighbourhood.
  const dilR = GLYPH_MASK_MARGIN * GLYPH_MASK_SCALE
  const dst  = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!src[y * W + x]) continue
      const y0 = Math.max(0, y - dilR), y1 = Math.min(H - 1, y + dilR)
      const x0 = Math.max(0, x - dilR), x1 = Math.min(W - 1, x + dilR)
      for (let dy = y0; dy <= y1; dy++)
        for (let dx = x0; dx <= x1; dx++)
          dst[dy * W + dx] = 1
    }
  }

  return {
    data:       dst,
    width:      W,
    height:     H,
    // Half-extents of the world region the mask covers (glyph + margin on each side)
    totalHalfW: worldW / 2 + GLYPH_MASK_MARGIN,
    totalHalfH: worldH / 2 + GLYPH_MASK_MARGIN,
  }
}

// FX agitation constants — turbulent noise displacement over water cells
// Uses noise2D (not fbm) for lighter per-cell cost
const AGITATE_AMP   = 4.5   // max world-px displacement per axis
const AGITATE_FREQ  = 0.07  // spatial frequency (cells)
const AGITATE_SPEED = 2.2   // time scale

// FX wobble constants — applied to creature glyph positions
const WOBBLE_AMP   = 5.0
const WOBBLE_FREQ  = 0.032
const WOBBLE_SPEED = 1.2

export default function AsciiField({ field, creaturesRef, creatureDragRef }) {
  const canvasRef    = useRef(null)
  const mouseDownPos = useRef(null)

  useEffect(() => {
    if (!field) return

    const canvas    = canvasRef.current
    const container = canvas.parentElement
    const ctx       = canvas.getContext('2d', { alpha: true })

    // Pre-load SVG images for projects that declare one
    const svgImageMap = {}
    for (const p of projects) {
      if (p.glyph?.svgUrl) {
        const img = new Image()
        img.src = p.glyph.svgUrl
        svgImageMap[p.slug] = img
      }
    }

    // ── Glyph masks ────────────────────────────────────────────────────
    // Per-creature pixel masks built from the actual rendered glyph shape.
    // ASCII masks are built synchronously; SVG masks are built on image load.
    const glyphMasks = {}
    const creatureRenderH = CELL_H * 3
    const M = GLYPH_MASK_MARGIN, S = GLYPH_MASK_SCALE

    // ASCII glyphs — rasterise the character into a small offscreen canvas
    for (const p of projects) {
      if (p.glyph?.svgUrl) continue
      const ascii = p.glyph?.ascii
      if (!ascii) continue
      const charW = creatureRenderH * CHAR_ASPECT
      const charH = creatureRenderH
      const oc = document.createElement('canvas')
      oc.width  = Math.ceil((charW + M * 2) * S)
      oc.height = Math.ceil((charH + M * 2) * S)
      const octx = oc.getContext('2d')
      octx.font         = `${charH * S}px ui-monospace, 'Courier New', Courier, monospace`
      octx.textBaseline = 'middle'
      octx.textAlign    = 'center'
      octx.fillStyle    = 'white'
      octx.fillText(ascii, oc.width / 2, oc.height / 2)
      glyphMasks[p.slug] = buildGlyphMask(oc, charW, charH)
    }

    // SVG glyphs — build mask once the image has loaded
    for (const p of projects) {
      if (!p.glyph?.svgUrl) continue
      const img = svgImageMap[p.slug]
      if (!img) continue
      const buildSvgMask = () => {
        const svgH = creatureRenderH * 1.4
        const svgW = svgH * (img.naturalWidth / img.naturalHeight)
        const oc = document.createElement('canvas')
        oc.width  = Math.ceil((svgW + M * 2) * S)
        oc.height = Math.ceil((svgH + M * 2) * S)
        const octx = oc.getContext('2d')
        octx.drawImage(img, M * S, M * S, svgW * S, svgH * S)
        glyphMasks[p.slug] = buildGlyphMask(oc, svgW, svgH)
      }
      if (img.complete && img.naturalWidth > 0) buildSvgMask()
      else img.addEventListener('load', buildSvgMask)
    }

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
      const fx = store.fx
      const t  = (ts - t0) / 1000

      // ── Instant zoom + incremental pivot-pan ──────────────────────────
      const prevAnim = animZoom.v
      animZoom.v = targetZoom
      const zoom = animZoom.v

      if (pivot && prevAnim > 0.001) {
        const f     = zoom / prevAnim
        const dragX = store.camera.x - animPan.x
        const dragY = store.camera.y - animPan.y
        animPan.x   = pivot.mx + (animPan.x - pivot.mx) * f + dragX
        animPan.y   = pivot.my + (animPan.y - pivot.my) * f + dragY
      } else {
        animPan.x = store.camera.x
        animPan.y = store.camera.y
      }

      usePondStore.setState(s => ({
        camera: {
          ...s.camera,
          zoom,
          x:     animPan.x,
          y:     animPan.y,
          pivot: null,  // cleared each frame — pivot is consumed in one step
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

      // Shimmer is more intense when FX is active
      const shimmerIntensity = fx ? 0.40 : 0.15

      // ── Main glyph render ─────────────────────────────────────────────
      let lastFillStyle = ''
      for (let cy = row0; cy <= row1; cy++) {
        const baseWy = cy * CELL_H
        for (let cx = col0; cx <= col1; cx++) {
          const cell = sampleCell(field, cx, cy)
          const reg  = cell.region
          if (reg === 0) continue

          const baseWx = cx * CELL_W

          // Glyph clearance — pixel-mask test against each visible creature's glyph shape.
          // AABB pre-reject keeps the common (far-away) case cheap.
          const cellCx = baseWx + CELL_W * 0.5
          const cellCy = baseWy + CELL_H * 0.5
          let inClearance = false
          for (const c of visCreatures) {
            const lx = cellCx - c.x, ly = cellCy - c.y
            const gm = glyphMasks[c.slug]
            if (gm) {
              if (Math.abs(lx) > gm.totalHalfW || Math.abs(ly) > gm.totalHalfH) continue
              const mx = Math.min(gm.width  - 1, Math.round((lx + gm.totalHalfW) * GLYPH_MASK_SCALE))
              const my = Math.min(gm.height - 1, Math.round((ly + gm.totalHalfH) * GLYPH_MASK_SCALE))
              if (gm.data[my * gm.width + mx]) { inClearance = true; break }
            } else {
              // Mask not ready yet — tight circle fallback
              if (lx * lx + ly * ly < 400) { inClearance = true; break }  // 20px radius
            }
          }
          if (inClearance) continue

          // Creature doublet displacement (clearance already excludes the inner mask zone)
          let drawX = baseWx, drawY = baseWy
          if (hasFlow) {
            const { dx, dy } = doubletDisplacement(baseWx, baseWy, visCreatures, t, CELL_H)
            drawX += dx
            drawY += dy
          }

          // Water agitation — single-octave noise displacement when FX is active
          if (fx && reg === 1) {
            const ax = (noise2D(cx * AGITATE_FREQ + t * AGITATE_SPEED * 0.4,
                                cy * AGITATE_FREQ + t * AGITATE_SPEED * 0.3) - 0.5) * 2
            const ay = (noise2D(cx * AGITATE_FREQ * 0.9 + t * AGITATE_SPEED * 0.35 + 9.7,
                                cy * AGITATE_FREQ * 1.1 + t * AGITATE_SPEED * 0.25 + 3.2) - 0.5) * 2
            drawX += ax * AGITATE_AMP
            drawY += ay * AGITATE_AMP
          }

          const sb    = reg === 1
            ? shimmerBrightness(cell.brightness, cx, cy, t, shimmerIntensity, 1)
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
      if (creatures.length > 0) {
        const creatureH = CELL_H * 3
        ctx.save()
        ctx.font         = `${creatureH}px ui-monospace, 'Courier New', Courier, monospace`
        ctx.textBaseline = 'middle'
        ctx.textAlign    = 'center'
        ctx.fillStyle    = 'rgba(255,255,255,0.55)'

        for (const c of creatures) {
          if (c.x < wL - creatureH * 2 || c.x > wR + creatureH * 2) continue
          if (c.y < wT - creatureH * 2 || c.y > wB + creatureH * 2) continue

          // Wobble glyph positions when FX is active
          let glyphX = c.x, glyphY = c.y
          if (fx) {
            const wx = (fbm(c.x * WOBBLE_FREQ + t * WOBBLE_SPEED + 1.5,
                             c.y * WOBBLE_FREQ + t * WOBBLE_SPEED * 0.7, 2) - 0.5) * 2
            const wy = (fbm(c.x * WOBBLE_FREQ + t * WOBBLE_SPEED * 0.8 + 7.3,
                             c.y * WOBBLE_FREQ + t * WOBBLE_SPEED * 1.1 + 2.1, 2) - 0.5) * 2
            glyphX += wx * WOBBLE_AMP
            glyphY += wy * WOBBLE_AMP
          }

          const svgImg = svgImageMap[c.slug]
          if (svgImg?.complete && svgImg.naturalWidth > 0) {
            // Render SVG glyph — size proportional to image aspect, same footprint as ASCII glyph
            const svgH = creatureH * 1.4
            const svgW = svgH * (svgImg.naturalWidth / svgImg.naturalHeight)
            ctx.globalAlpha = 0.50
            ctx.drawImage(svgImg, glyphX - svgW / 2, glyphY - svgH / 2, svgW, svgH)
            ctx.globalAlpha = 1
          } else {
            const glyph = c.project?.glyph?.ascii
            if (!glyph) continue
            ctx.fillText(glyph, glyphX, glyphY)
          }
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
    if (creatureDragRef?.current) return
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
