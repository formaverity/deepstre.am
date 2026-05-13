import { useEffect, useRef } from 'react'
import usePondStore from '@/store/usePondStore.js'
import { sampleCell } from '@/utils/pondCodec.js'
import { fbm } from '@/utils/noise.js'
import { shimmerBrightness } from '@/pond/shimmer.js'
import { pickGlyph } from '@/pond/glyphs.js'
import { doubletDisplacement } from '@/pond/displacement.js'
import projects from '@/projects/_manifest.js'
import { colorForStatus } from '@/pond/statusColors.js'
import { loadColoredSvg } from '@/pond/glyphImages.js'

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

// Hover unfurl constants
const NAME_FONT_SIZE  = CELL_H * 2           // 22px — project name label
const TEXT_GAP        = Math.round(CELL_W * 1.2)  // gap between glyph right edge and text start
const TEXT_HALF_H     = NAME_FONT_SIZE * 0.75     // vertical half-extent of the name text
const HOVER_IN_SPEED  = 6   // progress units/sec — full unfurl ~167ms
const HOVER_OUT_SPEED = 4   // progress units/sec — full furl ~250ms

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

// Wobble constants — ambient noise displacement applied to creature glyph positions
const WOBBLE_AMP   = 3.0
const WOBBLE_FREQ  = 0.032
const WOBBLE_SPEED = 1.2

// Glyphs pepper in across this zoom range — each project has a distinct threshold
const GLYPH_PEPPER_MIN   = 0.85
const GLYPH_PEPPER_MAX   = 0.95
const CLUSTER_BOUNDING_R = 24   // encloses the █ blob cluster

// Blob zoom thresholds — match AERIAL_MAX / SURFACE_MAX in usePondStore
const BLOB_ZOOM_MIN = 1.6   // single char fades out, blob fades in
const SVG_ZOOM_MIN  = 3.2   // SVG detail overlay fades in above this

function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

// Deterministic 0…2π phase from a string seed — per-cell and per-creature offsets
function phaseFromSeed(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0
  return (h % 1000) / 1000 * Math.PI * 2
}

// Procedural amoeba-shaped cluster of █ cells for the zoomed-out view.
// Shape varies per slug via basePhase; cells use CELL_W/CELL_H grid spacing.
function buildClusterBlob(slug) {
  const basePhase = phaseFromSeed(slug + '_cl')
  const cells     = []
  for (let row = -3; row <= 3; row++) {
    for (let col = -4; col <= 4; col++) {
      const dist  = Math.sqrt(col * col * 0.65 + row * row * 1.15)
      const angle = Math.atan2(row, col)
      const vary  = 0.55 * Math.sin(angle * 3 + basePhase)
                  + 0.30 * Math.cos(angle * 5 + basePhase * 1.8)
                  + 0.20 * Math.sin(angle * 7 + basePhase * 0.9)
      if (dist < 1.85 + vary) {
        cells.push({ homeX: col * CELL_W, homeY: row * CELL_H, phase: phaseFromSeed(slug + col + ',' + row) })
      }
    }
  }
  return cells
}

export default function AsciiField({ field, creaturesRef, creatureDragRef }) {
  const canvasRef      = useRef(null)
  const mouseDownPos   = useRef(null)
  const hoveredSlugRef = useRef(null)
  const textWidthsRef  = useRef({})
  const glyphMasksRef  = useRef({})

  useEffect(() => {
    if (!field) return

    const canvas    = canvasRef.current
    const container = canvas.parentElement
    const ctx       = canvas.getContext('2d', { alpha: true })

    // Pre-load color-normalized SVG glyphs; module-level cache avoids re-fetch on remount
    const svgImageMap = {}
    for (const p of projects) {
      if (p.glyph?.svgUrl) {
        svgImageMap[p.slug] = loadColoredSvg(p.glyph.svgUrl, p.status)
      }
    }

    // Pre-measure project name text widths for unfurl animation
    const tmpCtx = document.createElement('canvas').getContext('2d')
    tmpCtx.font = `${NAME_FONT_SIZE}px ui-monospace, 'Courier New', Courier, monospace`
    for (const p of projects) {
      textWidthsRef.current[p.slug] = tmpCtx.measureText(p.name).width
    }

    // Pre-parse blob cell arrays into flat lists with world-space offsets and phase seeds
    const blobCells = {}
    for (const p of projects) {
      if (!p.glyph?.blob) continue
      const rows  = p.glyph.blob
      const nRows = rows.length
      const nCols = Math.max(...rows.map(r => [...r].length))
      const cells = []
      for (let r = 0; r < nRows; r++) {
        const chars = [...rows[r]]
        for (let col = 0; col < chars.length; col++) {
          if (chars[col] !== ' ') {
            cells.push({
              char:  chars[col],
              homeX: (col - (nCols - 1) / 2) * CELL_W,
              homeY: (r   - (nRows - 1) / 2) * CELL_H,
              phase: phaseFromSeed(p.slug + cells.length),
            })
          }
        }
      }
      blobCells[p.slug] = cells
    }

    // Zoomed-out amoeba clusters — one blob shape per project
    const clusterBlobs = {}
    for (const p of projects) clusterBlobs[p.slug] = buildClusterBlob(p.slug)

    // Fast lookup: Set of "col,row" offsets for exact-cell clearance matching
    const clusterBlobSets = {}
    for (const p of projects) {
      const s = new Set()
      for (const bc of clusterBlobs[p.slug]) {
        s.add(`${Math.round(bc.homeX / CELL_W)},${Math.round(bc.homeY / CELL_H)}`)
      }
      clusterBlobSets[p.slug] = s
    }

    // Each project reveals its glyph at a distinct zoom within GLYPH_PEPPER_MIN..MAX
    const glyphThresholds = {}
    for (const p of projects) {
      const t01 = phaseFromSeed(p.slug + '_gt') / (Math.PI * 2)
      glyphThresholds[p.slug] = GLYPH_PEPPER_MIN + t01 * (GLYPH_PEPPER_MAX - GLYPH_PEPPER_MIN)
    }

    // ── Glyph masks ────────────────────────────────────────────────────
    // Per-creature pixel masks built from the actual rendered glyph shape.
    // Blob and ASCII masks are built synchronously; SVG masks are built on image load.
    const glyphMasks = {}
    const creatureRenderH = CELL_H * 3
    const M = GLYPH_MASK_MARGIN, S = GLYPH_MASK_SCALE

    // Mirror mask into both the local map and the ref so event handlers can read it
    const setMask = (slug, mask) => {
      glyphMasks[slug] = mask
      glyphMasksRef.current[slug] = mask
    }

    // Blob glyphs — rasterise all cells onto an offscreen canvas
    for (const p of projects) {
      if (!p.glyph?.blob) continue
      const cells = blobCells[p.slug]
      if (!cells?.length) continue
      const nRows = p.glyph.blob.length
      const nCols = Math.max(...p.glyph.blob.map(r => [...r].length))
      const blobW = nCols * CELL_W
      const blobH = nRows * CELL_H
      const oc = document.createElement('canvas')
      oc.width  = Math.ceil((blobW + M * 2) * S)
      oc.height = Math.ceil((blobH + M * 2) * S)
      const octx = oc.getContext('2d')
      octx.font         = `${CELL_H * S}px ui-monospace, 'Courier New', Courier, monospace`
      octx.textBaseline = 'middle'
      octx.textAlign    = 'center'
      octx.fillStyle    = 'white'
      for (const cell of cells) {
        octx.fillText(cell.char, (blobW / 2 + cell.homeX + M) * S, (blobH / 2 + cell.homeY + M) * S)
      }
      setMask(p.slug, buildGlyphMask(oc, blobW, blobH))
    }

    // ASCII glyphs — rasterise the character (skip blob and SVG creatures)
    for (const p of projects) {
      if (p.glyph?.blob || p.glyph?.svgUrl) continue
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
      setMask(p.slug, buildGlyphMask(oc, charW, charH))
    }

    // SVG glyphs — build mask on image load (skip blob creatures)
    for (const p of projects) {
      if (p.glyph?.blob || !p.glyph?.svgUrl) continue
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
        setMask(p.slug, buildGlyphMask(oc, svgW, svgH))
      }
      if (img.complete && img.naturalWidth > 0) buildSvgMask()
      else img.addEventListener('load', buildSvgMask)
    }

    const cursor = {
      x: 0, y: 0, vx: 0, vy: 0,
      radius: 12, influenceRadius: 80, influence: 0,
      _velBuf: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
      _velIdx: 0, _prevX: null, _prevY: null,
    }

    let rafId
    const t0       = performance.now()
    const animZoom = { v: usePondStore.getState().camera.targetZoom }
    const animPan  = { x: usePondStore.getState().camera.x, y: usePondStore.getState().camera.y }
    let initialized = false
    let prevTs = null

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

      const dt = prevTs === null ? 0 : Math.min((ts - prevTs) / 1000, 0.1)
      prevTs = ts

      const store     = usePondStore.getState()
      const { targetZoom, pivot } = store.camera
      const t  = (ts - t0) / 1000

      // ── Instant zoom + incremental pivot-pan ──────────────────────────
      const prevAnim = animZoom.v
      animZoom.v = targetZoom
      const zoom = animZoom.v
      const blobReveal = smoothstep((zoom - BLOB_ZOOM_MIN) / (SVG_ZOOM_MIN - BLOB_ZOOM_MIN))

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

      // ── Animate hoverProgress per creature ────────────────────────────
      const currentHoveredSlug = hoveredSlugRef.current
      const creatures = creaturesRef ? creaturesRef.current : []
      for (const c of creatures) {
        const isHovered = c.slug === currentHoveredSlug
        if (isHovered) {
          c.hoverProgress = Math.min(1, (c.hoverProgress ?? 0) + HOVER_IN_SPEED * dt)
        } else {
          c.hoverProgress = Math.max(0, (c.hoverProgress ?? 0) - HOVER_OUT_SPEED * dt)
        }
      }

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

      // Pre-filter creatures — extend bounding box to include unfurling text
      const visCreatures = creatures.filter(c => {
        const hp = c.hoverProgress ?? 0
        const gm = glyphMasks[c.slug]
        const showGlyphC = zoom >= (glyphThresholds[c.slug] ?? GLYPH_PEPPER_MIN)
        const glyphHW = showGlyphC ? (gm ? gm.totalHalfW : (c.radius ?? 12) * 4) : CLUSTER_BOUNDING_R + GLYPH_MASK_MARGIN
        const textExtra = hp > 0 ? TEXT_GAP + (textWidthsRef.current[c.slug] ?? 0) * hp : 0
        const r1 = Math.max(c.influenceRadius ?? ((c.radius ?? 12) * 4), glyphHW + textExtra)
        return c.x + r1 > wL && c.x - r1 < wR && c.y + r1 > wT && c.y - r1 < wB
      })
      // Cursor virtual displacer — fades in 100 ms when inside, out 300 ms when outside
      const mouse = store.mouse
      if (mouse.inside) {
        const wx = (mouse.x - animPan.x) / zoom
        const wy = (mouse.y - animPan.y) / zoom
        if (cursor._prevX !== null && dt > 0) {
          const rawVx = (wx - cursor._prevX) / dt
          const rawVy = (wy - cursor._prevY) / dt
          cursor._velBuf[cursor._velIdx] = { x: rawVx, y: rawVy }
          cursor._velIdx = (cursor._velIdx + 1) % 6
          let svx = 0, svy = 0
          for (const v of cursor._velBuf) { svx += v.x; svy += v.y }
          cursor.vx = svx / 6
          cursor.vy = svy / 6
        }
        cursor.x = wx
        cursor.y = wy
        cursor._prevX = wx
        cursor._prevY = wy
        cursor.influence = Math.min(0.6, cursor.influence + dt * 10)
      } else {
        cursor.influence = Math.max(0, cursor.influence - dt * 3.33)
        cursor._prevX = null
        cursor._prevY = null
      }
      // Cursor is no longer a doublet displacer — it drives wind direction instead
      const displacers = visCreatures
      const hasFlow    = displacers.length > 0

      // Wind direction: bias shimmer drift toward cursor position
      const fieldW    = field.cols * CELL_W
      const fieldH    = field.rows * CELL_H
      const hasCursor = cursor.influence > 0.01
      const normCX    = hasCursor ? Math.max(0, Math.min(1, cursor.x / fieldW)) : 0.5
      const normCY    = hasCursor ? Math.max(0, Math.min(1, cursor.y / fieldH)) : 0.5
      const windDriftX = 0.18 + (normCX - 0.5) * 0.20
      const windDriftY = 0.13 + (normCY - 0.5) * 0.16

      const shimmerIntensity = 0.12

      // ── Main glyph render ─────────────────────────────────────────────
      let lastFillStyle = ''
      for (let cy = row0; cy <= row1; cy++) {
        const baseWy = cy * CELL_H
        for (let cx = col0; cx <= col1; cx++) {
          const cell = sampleCell(field, cx, cy)
          const reg  = cell.region
          if (reg === 0) continue

          const baseWx = cx * CELL_W

          // Glyph + text clearance — pixel-mask test plus animated text rectangle.
          // AABB pre-reject keeps the common (far-away) case cheap.
          const cellCx = baseWx + CELL_W * 0.5
          const cellCy = baseWy + CELL_H * 0.5
          let inClearance = false
          for (const c of visCreatures) {
            const lx = cellCx - c.x, ly = cellCy - c.y
            const gm = glyphMasks[c.slug]
            if (zoom < (glyphThresholds[c.slug] ?? GLYPH_PEPPER_MIN)) {
              const col = Math.round(lx / CELL_W)
              const row = Math.round(ly / CELL_H)
              if (clusterBlobSets[c.slug]?.has(`${col},${row}`)) { inClearance = true; break }
            } else if (gm) {
              if (Math.abs(lx) <= gm.totalHalfW && Math.abs(ly) <= gm.totalHalfH) {
                const mx = Math.min(gm.width  - 1, Math.round((lx + gm.totalHalfW) * GLYPH_MASK_SCALE))
                const my = Math.min(gm.height - 1, Math.round((ly + gm.totalHalfH) * GLYPH_MASK_SCALE))
                if (gm.data[my * gm.width + mx]) { inClearance = true; break }
              }
            } else {
              // Mask not ready yet — tight circle fallback
              if (lx * lx + ly * ly < 400) { inClearance = true; break }  // 20px radius
            }
            // Text clearance — clear the area the unfurling name occupies
            const hp = c.hoverProgress ?? 0
            if (hp > 0.01) {
              const glyphHW = gm ? gm.totalHalfW : 20
              const animW   = (textWidthsRef.current[c.slug] ?? 0) * hp
              if (lx > glyphHW && lx < glyphHW + TEXT_GAP + animW + GLYPH_MASK_MARGIN
                  && Math.abs(ly) < TEXT_HALF_H) {
                inClearance = true; break
              }
            }
          }
          if (inClearance) continue

          // Creature doublet displacement (clearance already excludes the inner mask zone)
          let drawX = baseWx, drawY = baseWy
          if (hasFlow) {
            const { dx, dy } = doubletDisplacement(baseWx, baseWy, displacers, t, CELL_H)
            drawX += dx
            drawY += dy
          }

          const sb    = reg === 1
            ? shimmerBrightness(cell.brightness, cx, cy, t, shimmerIntensity, 1, windDriftX, windDriftY)
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

      // ── Creature glyphs + hover name unfurl ───────────────────────────
      if (creatures.length > 0) {
        const creatureH = CELL_H * 3
        ctx.save()
        ctx.font         = `${creatureH}px ui-monospace, 'Courier New', Courier, monospace`
        ctx.textBaseline = 'middle'
        ctx.textAlign    = 'center'
        for (const c of creatures) {
          if (c.x < wL - creatureH * 2 || c.x > wR + creatureH * 2) continue
          if (c.y < wT - creatureH * 2 || c.y > wB + creatureH * 2) continue

          const hp = c.hoverProgress ?? 0

          const wobX = (fbm(c.x * WOBBLE_FREQ + t * WOBBLE_SPEED + 1.5,
                            c.y * WOBBLE_FREQ + t * WOBBLE_SPEED * 0.7, 2) - 0.5) * 2
          const wobY = (fbm(c.x * WOBBLE_FREQ + t * WOBBLE_SPEED * 0.8 + 7.3,
                            c.y * WOBBLE_FREQ + t * WOBBLE_SPEED * 1.1 + 2.1, 2) - 0.5) * 2
          const glyphX = c.x + wobX * WOBBLE_AMP
          const glyphY = c.y + wobY * WOBBLE_AMP

          const showGlyphC = zoom >= (glyphThresholds[c.slug] ?? GLYPH_PEPPER_MIN)
          if (!showGlyphC) {
            // Amoeba blob — cluster of █ cells, organically jittered
            const clusterCells = clusterBlobs[c.slug]
            if (clusterCells?.length) {
              ctx.save()
              ctx.font         = `${CELL_H}px ui-monospace, 'Courier New', Courier, monospace`
              ctx.textBaseline = 'middle'
              ctx.textAlign    = 'center'
              ctx.fillStyle    = colorForStatus(c.project.status)
              for (const bc of clusterCells) {
                ctx.globalAlpha = 0.50 + 0.14 * Math.sin(t * 0.25 + bc.phase * 0.7)
                ctx.fillText('█', c.x + bc.homeX, c.y + bc.homeY)
              }
              ctx.globalAlpha = 1
              ctx.restore()
            }
          } else {
            const cells      = blobCells[c.slug]
            const statusColor = colorForStatus(c.project.status)

            if (cells?.length > 0) {
              // ── Single-char layer — fades out as blob fades in ──────────
              const charAlpha = 0.55 * (1 - blobReveal)
              if (charAlpha > 0.01) {
                const glyph = c.project?.glyph?.ascii
                if (glyph) {
                  ctx.fillStyle   = statusColor
                  ctx.globalAlpha = charAlpha
                  ctx.fillText(glyph, glyphX, glyphY)
                  ctx.globalAlpha = 1
                }
              }

              // ── Blob layer — fades in from BLOB_ZOOM_MIN ────────────────
              if (blobReveal > 0.005) {
                if (c._blobPhase === undefined) {
                  c._blobPhase = phaseFromSeed(c.slug + 'blob')
                  c._pulse = { cell: -1, startT: -999, cooldown: 0.5 + Math.random() * 2 }
                }

                // Breathing — shared opacity oscillation across all cells
                const breathFreq = hp > 0.05 ? 0.30 : 0.15
                const breathe    = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * breathFreq + c._blobPhase)
                const baseAlpha  = (0.45 + 0.20 * breathe) * blobReveal

                // Pulse — one cell brightens periodically
                c._pulse.cooldown -= dt
                if (c._pulse.cooldown <= 0) {
                  c._pulse.cell     = Math.floor(Math.random() * cells.length)
                  c._pulse.startT   = t
                  c._pulse.cooldown = (hp > 0.05 ? 0.75 : 3.0) * (0.7 + Math.random() * 0.6)
                }

                const jitterScale = hp > 0.05 ? 1.5 : 1.0

                ctx.save()
                ctx.font         = `${CELL_H}px ui-monospace, 'Courier New', Courier, monospace`
                ctx.textBaseline = 'middle'
                ctx.textAlign    = 'center'
                ctx.fillStyle    = statusColor

                for (let ci = 0; ci < cells.length; ci++) {
                  const cell     = cells[ci]
                  const jx       = Math.sin(t * 1.2 + cell.phase) * 0.6 * CELL_W * jitterScale
                  const jy       = Math.cos(t * 0.9 + cell.phase * 1.3) * 0.4 * CELL_H * jitterScale
                  const pulseAge = t - c._pulse.startT
                  let cellAlpha  = baseAlpha
                  if (ci === c._pulse.cell && pulseAge >= 0 && pulseAge < 0.6) {
                    const ramp  = Math.min(1, pulseAge / 0.2)
                    const decay = pulseAge >= 0.2 ? Math.max(0, 1 - (pulseAge - 0.2) / 0.4) : 1
                    cellAlpha   = Math.min(1, cellAlpha + 0.4 * Math.min(ramp, decay))
                  }
                  ctx.globalAlpha = Math.min(1, Math.max(0, cellAlpha))
                  ctx.fillText(cell.char, glyphX + cell.homeX + jx, glyphY + cell.homeY + jy)
                }
                ctx.globalAlpha = 1
                ctx.restore()

                // ── SVG detail overlay — fades in above SVG_ZOOM_MIN ────
                if (zoom >= SVG_ZOOM_MIN) {
                  const svgImg = svgImageMap[c.slug]
                  if (svgImg?.complete && svgImg.naturalWidth > 0) {
                    const svgFactor = smoothstep((zoom - SVG_ZOOM_MIN) / 1.6)
                    if (svgFactor > 0.01) {
                      const svgH = CELL_H * 2
                      const svgW = svgH * (svgImg.naturalWidth / svgImg.naturalHeight)
                      ctx.globalAlpha = 0.35 * svgFactor
                      ctx.drawImage(svgImg, glyphX - svgW / 2, glyphY - svgH / 2, svgW, svgH)
                      ctx.globalAlpha = 1
                    }
                  }
                }
              }
            } else {
              // Non-blob fallback — original SVG or ASCII
              const svgImg = svgImageMap[c.slug]
              if (svgImg?.complete && svgImg.naturalWidth > 0) {
                const svgH = creatureH * 1.4
                const svgW = svgH * (svgImg.naturalWidth / svgImg.naturalHeight)
                ctx.globalAlpha = 0.70
                ctx.drawImage(svgImg, glyphX - svgW / 2, glyphY - svgH / 2, svgW, svgH)
                ctx.globalAlpha = 1
              } else {
                const glyph = c.project?.glyph?.ascii
                if (glyph) {
                  ctx.fillStyle   = statusColor
                  ctx.globalAlpha = 0.55
                  ctx.fillText(glyph, glyphX, glyphY)
                  ctx.globalAlpha = 1
                }
              }
            }
          }

          // Project name unfurls to the right of the glyph on hover
          if (hp > 0.01) {
            const gm = glyphMasks[c.slug]
            const baseHW  = gm ? gm.totalHalfW : creatureH * CHAR_ASPECT * 0.5 + GLYPH_MASK_MARGIN
            const glyphHW = showGlyphC ? baseHW : CLUSTER_BOUNDING_R + GLYPH_MASK_MARGIN
            const fullW = textWidthsRef.current[c.slug] ?? 0
            const animW = fullW * hp
            const textX = glyphX + glyphHW + TEXT_GAP

            ctx.save()
            ctx.beginPath()
            ctx.rect(textX, glyphY - TEXT_HALF_H, animW, TEXT_HALF_H * 2)
            ctx.clip()
            ctx.font         = `${NAME_FONT_SIZE}px ui-monospace, 'Courier New', Courier, monospace`
            ctx.textBaseline = 'middle'
            ctx.textAlign    = 'left'
            ctx.fillStyle   = colorForStatus(c.project.status)
            ctx.globalAlpha = 0.55 * hp
            ctx.fillText(c.project.name, textX, glyphY)
            ctx.restore()
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

    let hitSlug = null
    for (const c of creatures) {
      const rx = worldX - c.x, ry = worldY - c.y
      // Glyph hit radius
      if (Math.sqrt(rx * rx + ry * ry) < c.radius * 2.5) {
        hitSlug = c.slug
        break
      }
      // Text area hit-test — only active once partially unfurled
      const hp = c.hoverProgress ?? 0
      if (hp > 0.05) {
        const gm = glyphMasksRef.current[c.slug]
        const glyphHW = gm ? gm.totalHalfW : 20
        const textW = textWidthsRef.current[c.slug] ?? 0
        if (rx > glyphHW && rx < glyphHW + TEXT_GAP + textW && Math.abs(ry) < TEXT_HALF_H) {
          hitSlug = c.slug
          break
        }
      }
    }

    hoveredSlugRef.current = hitSlug
    e.currentTarget.style.cursor = hitSlug ? 'pointer' : ''
  }

  function handleMouseLeave() {
    hoveredSlugRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ position: 'absolute', inset: 0, display: 'block' }}
    />
  )
}
