import { useEffect, useRef } from 'react'
import usePondStore from '@/store/usePondStore.js'
import { sampleCell } from '@/utils/pondCodec.js'
import { fbm } from '@/utils/noise.js'
import { shimmerBrightness } from '@/pond/shimmer.js'
import { pickGlyph } from '@/pond/glyphs.js'
import { doubletDisplacement } from '@/pond/displacement.js'
import projects from '@/projects/_manifest.js'
import { colorForStatus } from '@/pond/statusColors.js'

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
const GLYPH_MASK_SCALE  = 2
const GLYPH_MASK_MARGIN = 4

const HOVER_IN_SPEED  = 6
const HOVER_OUT_SPEED = 4

function buildGlyphMask(canvas, worldW, worldH) {
  const W = canvas.width, H = canvas.height
  const raw = canvas.getContext('2d').getImageData(0, 0, W, H).data
  const src = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) src[i] = raw[i * 4 + 3] > 24 ? 1 : 0

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
    totalHalfW: worldW / 2 + GLYPH_MASK_MARGIN,
    totalHalfH: worldH / 2 + GLYPH_MASK_MARGIN,
  }
}

// Wobble constants — ambient noise displacement applied to creature positions
const WOBBLE_AMP   = 3.0
const WOBBLE_FREQ  = 0.032
const WOBBLE_SPEED = 1.2

// Zoom thresholds for the three blob states:
//   outlined █  →  filled █  →  revealed letters
const OUTLINE_FILL_START = 0.5   // outline starts filling in
const OUTLINE_FILL_END   = 1.3   // fully filled by this zoom
const BLOB_ZOOM_MIN      = 1.6   // filled █ start revealing as letters
const TEXT_ZOOM_MAX      = 3.2   // reveal complete at this zoom

function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

// Deterministic 0…2π phase from a string seed
function phaseFromSeed(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0
  return (h % 1000) / 1000 * Math.PI * 2
}

// Build a blob from the project name as rows of █ characters.
// 1-word names: single horizontal row centered on the creature.
// Multi-word names: one row per word, each odd row offset right for stagger.
function buildNameBlob(slug, name) {
  const words      = name.trim().split(/\s+/)
  const cells      = []
  const rowSpacing = CELL_H * 1.5
  const staggerX   = CELL_W * 1.5

  for (let wi = 0; wi < words.length; wi++) {
    const word    = words[wi]
    const rowY    = (wi - (words.length - 1) / 2) * rowSpacing
    const offsetX = wi % 2 === 1 ? staggerX : 0

    for (let ci = 0; ci < word.length; ci++) {
      cells.push({
        char:       '█',
        revealChar: word[ci],
        homeX:   (ci - (word.length - 1) / 2) * CELL_W * 0.92 + offsetX,
        homeY:   rowY,
        phase:   phaseFromSeed(slug + '_nb_' + wi + '_' + ci),
        charIdx: ci,
        wordLen: word.length,
      })
    }
  }

  return cells
}

// Module-level: precompute name blobs and their world extents (static data)
const nameBlobs    = {}
const nameBlobDims = {}
for (const p of projects) {
  const cells = buildNameBlob(p.slug, p.name)
  nameBlobs[p.slug] = cells
  if (cells.length) {
    let maxX = 0, maxY = 0
    for (const cell of cells) {
      maxX = Math.max(maxX, Math.abs(cell.homeX))
      maxY = Math.max(maxY, Math.abs(cell.homeY))
    }
    nameBlobDims[p.slug] = {
      worldW: (maxX + CELL_W / 2) * 2,
      worldH: (maxY + CELL_H / 2) * 2,
      halfW:  maxX + CELL_W / 2,
      halfH:  maxY + CELL_H / 2,
    }
  }
}

export default function AsciiField({ field, creaturesRef, creatureDragRef }) {
  const canvasRef      = useRef(null)
  const mouseDownPos   = useRef(null)
  const hoveredSlugRef = useRef(null)

  useEffect(() => {
    if (!field) return

    const canvas    = canvasRef.current
    const container = canvas.parentElement
    const ctx       = canvas.getContext('2d', { alpha: true })

    // Build pixel masks from name blob cells
    const glyphMasks = {}
    const M = GLYPH_MASK_MARGIN, S = GLYPH_MASK_SCALE

    for (const p of projects) {
      const cells = nameBlobs[p.slug]
      const dim   = nameBlobDims[p.slug]
      if (!cells?.length || !dim) continue
      const { worldW, worldH } = dim
      const oc = document.createElement('canvas')
      oc.width  = Math.ceil((worldW + M * 2) * S)
      oc.height = Math.ceil((worldH + M * 2) * S)
      const octx = oc.getContext('2d')
      octx.font         = `${CELL_H * S}px ui-monospace, 'Courier New', Courier, monospace`
      octx.textBaseline = 'middle'
      octx.textAlign    = 'center'
      octx.fillStyle    = 'white'
      for (const cell of cells) {
        octx.fillText('█', (cell.homeX + worldW / 2 + M) * S, (cell.homeY + worldH / 2 + M) * S)
      }
      glyphMasks[p.slug] = buildGlyphMask(oc, worldW, worldH)
    }

    const cursor = {
      x: 0, y: 0, vx: 0, vy: 0,
      radius: 12, influenceRadius: 80, influence: 0,
      _velBuf: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
      _velIdx: 0, _prevX: null, _prevY: null,
    }

    const windDrift = { x: 0.18, y: 0.13 }

    let rafId
    const t0       = performance.now()
    const animZoom = { v: usePondStore.getState().camera.targetZoom }
    const animPan  = { x: usePondStore.getState().camera.x, y: usePondStore.getState().camera.y }
    let initialized = false
    let prevTs = null

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

    function frame(ts) {
      rafId = requestAnimationFrame(frame)

      const dt = prevTs === null ? 0 : Math.min((ts - prevTs) / 1000, 0.1)
      prevTs = ts

      const store     = usePondStore.getState()
      const { targetZoom, pivot } = store.camera
      const t  = (ts - t0) / 1000

      const prevAnim = animZoom.v
      animZoom.v = targetZoom
      const zoom = animZoom.v

      // Blob state factors — three stages as zoom increases
      const fillFactor   = smoothstep((zoom - OUTLINE_FILL_START) / (OUTLINE_FILL_END   - OUTLINE_FILL_START))
      const zoomReveal   = smoothstep((zoom - BLOB_ZOOM_MIN)      / (TEXT_ZOOM_MAX      - BLOB_ZOOM_MIN))

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
          pivot: null,
        },
      }))

      const panX = animPan.x
      const panY = animPan.y

      const dpr  = window.devicePixelRatio || 1
      const cssW = canvas.width  / dpr
      const cssH = canvas.height / dpr

      // Animate hoverProgress per creature
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

      // Pre-filter creatures in viewport
      const visCreatures = creatures.filter(c => {
        const dim = nameBlobDims[c.slug]
        const r = dim
          ? Math.max(c.influenceRadius ?? 48, dim.halfW + GLYPH_MASK_MARGIN)
          : (c.influenceRadius ?? 48)
        return c.x + r > wL && c.x - r < wR && c.y + r > wT && c.y - r < wB
      })

      // Cursor virtual displacer
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
      const displacers = visCreatures
      const hasFlow    = displacers.length > 0

      // Wind direction: smoothly bias shimmer drift toward cursor position
      const fieldW    = field.cols * CELL_W
      const fieldH    = field.rows * CELL_H
      const hasCursor = cursor.influence > 0.01
      const normCX    = hasCursor ? Math.max(0, Math.min(1, cursor.x / fieldW)) : 0.5
      const normCY    = hasCursor ? Math.max(0, Math.min(1, cursor.y / fieldH)) : 0.5
      const targetDX  = 0.18 + (normCX - 0.5) * 0.12
      const targetDY  = 0.13 + (normCY - 0.5) * 0.09
      const lerpW = Math.min(1, dt * 0.45)
      windDrift.x += (targetDX - windDrift.x) * lerpW
      windDrift.y += (targetDY - windDrift.y) * lerpW
      const windDriftX = windDrift.x
      const windDriftY = windDrift.y

      const shimmerIntensity = 0.12

      // ── Main field render ─────────────────────────────────────────────
      let lastFillStyle = ''
      for (let cy = row0; cy <= row1; cy++) {
        const baseWy = cy * CELL_H
        for (let cx = col0; cx <= col1; cx++) {
          const cell = sampleCell(field, cx, cy)
          const reg  = cell.region
          if (reg === 0) continue

          const baseWx = cx * CELL_W
          const cellCx = baseWx + CELL_W * 0.5
          const cellCy = baseWy + CELL_H * 0.5

          // Clearance — suppress field cells that fall inside a creature blob
          let inClearance = false
          for (const c of visCreatures) {
            const lx = cellCx - c.x, ly = cellCy - c.y
            const gm = glyphMasks[c.slug]
            if (gm) {
              if (Math.abs(lx) <= gm.totalHalfW && Math.abs(ly) <= gm.totalHalfH) {
                const mx = Math.min(gm.width  - 1, Math.round((lx + gm.totalHalfW) * GLYPH_MASK_SCALE))
                const my = Math.min(gm.height - 1, Math.round((ly + gm.totalHalfH) * GLYPH_MASK_SCALE))
                if (gm.data[my * gm.width + mx]) { inClearance = true; break }
              }
            } else {
              const dim = nameBlobDims[c.slug]
              if (dim && Math.abs(lx) < dim.halfW + GLYPH_MASK_MARGIN && Math.abs(ly) < dim.halfH + GLYPH_MASK_MARGIN) {
                inClearance = true; break
              }
            }
          }
          if (inClearance) continue

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

      // ── Creature name blobs ───────────────────────────────────────────
      if (creatures.length > 0) {
        ctx.save()
        ctx.font         = `${CELL_H}px ui-monospace, 'Courier New', Courier, monospace`
        ctx.textBaseline = 'middle'
        ctx.textAlign    = 'center'
        // Outline stroke width: ~1px in screen space
        ctx.lineWidth    = 1.0 / zoom

        for (const c of creatures) {
          const dim = nameBlobDims[c.slug]
          if (!dim) continue
          const r = Math.max(dim.halfW, dim.halfH) + GLYPH_MASK_MARGIN
          if (c.x + r < wL || c.x - r > wR || c.y + r < wT || c.y - r > wB) continue

          const hp           = c.hoverProgress ?? 0
          const revealFactor = Math.max(zoomReveal, hp)

          const wobX = (fbm(c.x * WOBBLE_FREQ + t * WOBBLE_SPEED + 1.5,
                            c.y * WOBBLE_FREQ + t * WOBBLE_SPEED * 0.7, 2) - 0.5) * 2
          const wobY = (fbm(c.x * WOBBLE_FREQ + t * WOBBLE_SPEED * 0.8 + 7.3,
                            c.y * WOBBLE_FREQ + t * WOBBLE_SPEED * 1.1 + 2.1, 2) - 0.5) * 2
          const glyphX = c.x + wobX * WOBBLE_AMP
          const glyphY = c.y + wobY * WOBBLE_AMP

          const cells = nameBlobs[c.slug]
          if (!cells?.length) continue

          if (c._blobPhase === undefined) {
            c._blobPhase = phaseFromSeed(c.slug + 'blob')
            c._pulse = { cell: -1, startT: -999, cooldown: 0.5 + Math.random() * 2 }
          }

          // Breathing — shared opacity oscillation
          const breathFreq = hp > 0.05 ? 0.30 : 0.15
          const breathe    = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * breathFreq + c._blobPhase)
          const baseAlpha  = 0.45 + 0.20 * breathe

          // Pulse — one cell brightens periodically
          c._pulse.cooldown -= dt
          if (c._pulse.cooldown <= 0) {
            c._pulse.cell     = Math.floor(Math.random() * cells.length)
            c._pulse.startT   = t
            c._pulse.cooldown = (hp > 0.05 ? 0.75 : 3.0) * (0.7 + Math.random() * 0.6)
          }

          const color        = colorForStatus(c.project.status)
          ctx.fillStyle      = color
          ctx.strokeStyle    = color

          // Reveal blur: starts at 6px as letters appear, dissolves to 0 at full reveal.
          // Set once per creature — same revealFactor applies to every cell.
          const revealBlurPx = revealFactor > 0.005 ? Math.max(0, (1 - revealFactor) * 6) : 0

          // Cache per-cell positions so we can draw blocks first, then reveal chars
          // with blur in a second pass (avoids toggling ctx.filter inside a tight loop).
          const cellCache = []

          for (let ci = 0; ci < cells.length; ci++) {
            const cell     = cells[ci]
            // Drift in sync with water shimmer — sample the same wind-advected fbm field
            const edgeDist   = Math.min(cell.charIdx, cell.wordLen - 1 - cell.charIdx)
            const edgeFactor = Math.min(1, edgeDist / 1.5)
            const cellWX     = glyphX + cell.homeX
            const cellWY     = glyphY + cell.homeY
            const n1 = (fbm(cellWX * 0.02 + t * windDriftX,        cellWY * 0.032 + t * windDriftY,        2) - 0.5) * 2
            const n2 = (fbm(cellWX * 0.02 + t * windDriftX + 17.3, cellWY * 0.032 + t * windDriftY + 31.7, 2) - 0.5) * 2
            const driftAmp   = CELL_W * (0.08 + cursor.influence * 0.3) * edgeFactor
            const jx = n1 * driftAmp
            const jy = n2 * driftAmp * 0.6
            const pulseAge = t - c._pulse.startT
            let cellAlpha  = baseAlpha
            if (ci === c._pulse.cell && pulseAge >= 0 && pulseAge < 0.6) {
              const ramp  = Math.min(1, pulseAge / 0.2)
              const decay = pulseAge >= 0.2 ? Math.max(0, 1 - (pulseAge - 0.2) / 0.4) : 1
              cellAlpha   = Math.min(1, cellAlpha + 0.4 * Math.min(ramp, decay))
            }

            const px = glyphX + cell.homeX + jx
            const py = glyphY + cell.homeY + jy

            // blockAlpha: shared by outline + fill layers, both fade out as letters reveal
            const blockAlpha = cellAlpha * (1 - revealFactor)

            // Outline █ — visible at low zoom, fades out as fill increases
            if (blockAlpha > 0.005 && fillFactor < 0.995) {
              ctx.globalAlpha = blockAlpha * (1 - fillFactor)
              ctx.strokeText('█', px, py)
            }
            // Filled █ — fades in as zoom increases past OUTLINE_FILL_START
            if (blockAlpha > 0.005 && fillFactor > 0.005) {
              ctx.globalAlpha = blockAlpha * fillFactor
              ctx.fillText('█', px, py)
            }

            if (revealFactor > 0.005) cellCache.push({ px, py, cellAlpha, revealChar: cell.revealChar })
          }

          // Second pass: reveal characters with blur applied once for the whole creature
          if (cellCache.length) {
            if (revealBlurPx > 0.1) ctx.filter = `blur(${revealBlurPx.toFixed(1)}px)`
            for (const { px, py, cellAlpha, revealChar } of cellCache) {
              ctx.globalAlpha = cellAlpha * revealFactor
              ctx.fillText(revealChar, px, py)
            }
            if (revealBlurPx > 0.1) ctx.filter = 'none'
          }

          ctx.globalAlpha = 1
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
      const dim = nameBlobDims[c.slug]
      const hw = dim ? dim.halfW + GLYPH_MASK_MARGIN : 20
      const hh = dim ? dim.halfH + GLYPH_MASK_MARGIN : 12
      if (Math.abs(rx) <= hw && Math.abs(ry) <= hh) {
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
      const dim = nameBlobDims[c.slug]
      const hw = dim ? dim.halfW + GLYPH_MASK_MARGIN : 20
      const hh = dim ? dim.halfH + GLYPH_MASK_MARGIN : 12
      if (Math.abs(rx) <= hw && Math.abs(ry) <= hh) {
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
      const dim = nameBlobDims[c.slug]
      const hw = dim ? dim.halfW + GLYPH_MASK_MARGIN : 20
      const hh = dim ? dim.halfH + GLYPH_MASK_MARGIN : 12
      if (Math.abs(rx) <= hw && Math.abs(ry) <= hh) {
        hitSlug = c.slug
        break
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
