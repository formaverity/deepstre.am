import { useEffect, useRef } from 'react'
import usePondStore from '@/store/usePondStore.js'
import { sampleCell } from '@/utils/pondCodec.js'
import { fbm } from '@/utils/noise.js'
import { shimmerBrightness } from '@/pond/shimmer.js'
import { pickGlyph } from '@/pond/glyphs.js'
import { doubletDisplacement, BASE_RADIUS } from '@/pond/displacement.js'
import projects from '@/projects/_manifest.js'
import { colorForStatus } from '@/pond/statusColors.js'
import { POND_PHYSICS } from '@/pond/pondPhysics.js'

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

// Outward-propagating wave from cursor position.
// Replaces the old doublet (magnifying-glass) effect with expanding rings.
function cursorWave(wx, wy, cx, cy, intensity, vx, vy, t) {
  const W  = POND_PHYSICS.cursor
  const lx = wx - cx, ly = wy - cy
  const d2 = lx * lx + ly * ly
  if (d2 < 1 || d2 > W.waveRadius * W.waveRadius) return null
  const d  = Math.sqrt(d2)
  const nx = lx / d, ny = ly / d   // radial unit vec

  const fo  = 1 - d / W.waveRadius
  const fos = fo * fo * (3 - 2 * fo)  // smoothstep falloff

  const phase = d * W.waveK - t * W.waveOmega
  const sinP  = Math.sin(phase)
  const cosP  = Math.cos(phase)

  // Amplitude scales with cursor intensity and speed — still when stationary, active when moving
  const speed  = Math.sqrt(vx * vx + vy * vy)
  const velFac = Math.min(1, speed / W.waveVelRef)
  const amp    = W.waveAmp * intensity * fos * (0.35 + 0.65 * velFac)

  // 80% radial (compression rings) + 20% tangential (organic curl)
  return {
    dx: amp * (sinP * 0.8 * nx + cosP * 0.2 * (-ny)),
    dy: amp * (sinP * 0.8 * ny + cosP * 0.2 *   nx),
  }
}

// Wobble constants — ambient noise displacement applied to creature positions
const WOBBLE_AMP   = 3.0
const WOBBLE_FREQ  = 0.032
const WOBBLE_SPEED = 1.2

// Zoom thresholds: outlined █ → filled █ → revealed letters
const OUTLINE_FILL_START = 0.5
const OUTLINE_FILL_END   = 1.3
const BLOB_ZOOM_MIN      = 1.6
const TEXT_ZOOM_MAX      = 3.2

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
  const canvasRef        = useRef(null)
  const mouseDownPos     = useRef(null)
  const hoveredSlugRef   = useRef(null)
  const longPressTimer   = useRef(null)
  const longPressTouch   = useRef(null)  // {x,y} screen coords of touch start
  const longPressSlug    = useRef(null)  // slug set by long press (to clear on end)

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

    // Cursor wave state — intensity is managed via idle/active/leave state machine
    const C = POND_PHYSICS.cursor
    const cursor = {
      x: 0, y: 0, vx: 0, vy: 0,
      influence:  0,   // alias for _intensity (read by wind + blob jitter)
      _intensity: 0,
      _isIdle:    true,
      _idleMs:    0,
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

      const fillFactor = smoothstep((zoom - OUTLINE_FILL_START) / (OUTLINE_FILL_END - OUTLINE_FILL_START))
      const zoomReveal = smoothstep((zoom - BLOB_ZOOM_MIN)      / (TEXT_ZOOM_MAX    - BLOB_ZOOM_MIN))

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
        camera: { ...s.camera, zoom, x: animPan.x, y: animPan.y, pivot: null },
      }))

      const panX = animPan.x
      const panY = animPan.y

      const dpr  = window.devicePixelRatio || 1
      const cssW = canvas.width  / dpr
      const cssH = canvas.height / dpr

      // Animate hover progress per creature
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

      // ── Cursor intensity state machine ─────────────────────────────────
      // Three states: active (moving) → idle (still in viewport) → leave (outside)
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
        cursor.x = wx; cursor.y = wy
        cursor._prevX = wx; cursor._prevY = wy

        // Idle detection: track how long cursor has been below speed threshold
        const speed = Math.sqrt(cursor.vx * cursor.vx + cursor.vy * cursor.vy)
        if (speed > C.idleSpeedThreshold) {
          cursor._idleMs = 0
          cursor._isIdle = false
        } else {
          cursor._idleMs += dt * 1000
          if (cursor._idleMs > C.idleAfterMs) cursor._isIdle = true
        }

        const targetIntensity = cursor._isIdle ? C.intensityIdle : C.intensityActive
        if (targetIntensity > cursor._intensity) {
          // Attack: ramp up to active intensity over activeRampMs
          cursor._intensity = Math.min(
            targetIntensity,
            cursor._intensity + (C.intensityActive / (C.activeRampMs / 1000)) * dt
          )
        } else {
          // Decay to idle: ramp down over idleDecayMs
          cursor._intensity = Math.max(
            targetIntensity,
            cursor._intensity - ((C.intensityActive - C.intensityIdle) / (C.idleDecayMs / 1000)) * dt
          )
        }
      } else {
        // Leave: decay to 0 over leaveDecayMs
        cursor._intensity = Math.max(
          0,
          cursor._intensity - (C.intensityActive / (C.leaveDecayMs / 1000)) * dt
        )
        cursor._isIdle = true
        cursor._idleMs = 9999
        cursor._prevX  = null
        cursor._prevY  = null
      }
      cursor.influence = cursor._intensity

      // ── Build displacers: creatures + tap ripple ─────────────────────
      // Cursor no longer acts as a doublet — wave displacement is applied
      // per-cell in the main loop instead.
      const displacers = [...visCreatures]

      const tapRipple = store.tapRipple
      if (tapRipple) {
        const rippleAge = ts - tapRipple.t
        if (rippleAge < POND_PHYSICS.mobile.tapRippleFadeMs) {
          const fade = 1 - rippleAge / POND_PHYSICS.mobile.tapRippleFadeMs
          displacers.push({
            x:              tapRipple.x,
            y:              tapRipple.y,
            vx:             0,
            vy:             0,
            radius:         BASE_RADIUS,
            influenceRadius: POND_PHYSICS.mobile.tapRippleRadius,
            influence:      POND_PHYSICS.mobile.tapRippleIntensity * fade,
          })
        } else {
          usePondStore.getState().clearTapRipple()
        }
      }

      const hasFlow = displacers.length > 0

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

          // Clearance — suppress field cells inside a creature blob.
          // Also track closest blob edge distance for cursor-wave attenuation.
          let inClearance    = false
          let closestBlobDist = Infinity
          for (const c of visCreatures) {
            const lx = cellCx - c.x, ly = cellCy - c.y
            const gm = glyphMasks[c.slug]
            if (gm) {
              const inBox = Math.abs(lx) <= gm.totalHalfW && Math.abs(ly) <= gm.totalHalfH
              if (inBox) {
                const mx = Math.min(gm.width  - 1, Math.round((lx + gm.totalHalfW) * GLYPH_MASK_SCALE))
                const my = Math.min(gm.height - 1, Math.round((ly + gm.totalHalfH) * GLYPH_MASK_SCALE))
                if (gm.data[my * gm.width + mx]) { inClearance = true; break }
              }
              const bd = Math.max(0, Math.max(Math.abs(lx) - gm.totalHalfW, Math.abs(ly) - gm.totalHalfH))
              if (bd < closestBlobDist) closestBlobDist = bd
            } else {
              const dim = nameBlobDims[c.slug]
              if (dim) {
                const hw = dim.halfW + GLYPH_MASK_MARGIN, hh = dim.halfH + GLYPH_MASK_MARGIN
                if (Math.abs(lx) < hw && Math.abs(ly) < hh) { inClearance = true; break }
                const bd = Math.max(0, Math.max(Math.abs(lx) - hw, Math.abs(ly) - hh))
                if (bd < closestBlobDist) closestBlobDist = bd
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

          // Cursor wave — soft radial rings, attenuated near blob edges
          if (reg === 1 && cursor._intensity > 0.01) {
            const EXCL    = POND_PHYSICS.cursor.waveExclusionPx
            const waveAtt = closestBlobDist === Infinity ? 1 : Math.min(1, closestBlobDist / EXCL)
            if (waveAtt > 0.01) {
              const w = cursorWave(baseWx, baseWy, cursor.x, cursor.y, cursor._intensity, cursor.vx, cursor.vy, t)
              if (w) { drawX += w.dx * waveAtt; drawY += w.dy * waveAtt }
            }
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

          const breathFreq = hp > 0.05 ? 0.30 : 0.15
          const breathe    = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * breathFreq + c._blobPhase)
          const baseAlpha  = 0.45 + 0.20 * breathe

          c._pulse.cooldown -= dt
          if (c._pulse.cooldown <= 0) {
            c._pulse.cell     = Math.floor(Math.random() * cells.length)
            c._pulse.startT   = t
            c._pulse.cooldown = (hp > 0.05 ? 0.75 : 3.0) * (0.7 + Math.random() * 0.6)
          }

          const color     = colorForStatus(c.project.status)
          ctx.fillStyle   = color
          ctx.strokeStyle = color

          const revealBlurPx = revealFactor > 0.005 ? Math.max(0, (1 - revealFactor) * 6) : 0
          const cellCache    = []

          for (let ci = 0; ci < cells.length; ci++) {
            const cell       = cells[ci]
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

            const blockAlpha = cellAlpha * (1 - revealFactor)

            if (blockAlpha > 0.005 && fillFactor < 0.995) {
              ctx.globalAlpha = blockAlpha * (1 - fillFactor)
              ctx.strokeText('█', px, py)
            }
            if (blockAlpha > 0.005 && fillFactor > 0.005) {
              ctx.globalAlpha = blockAlpha * fillFactor
              ctx.fillText('█', px, py)
            }

            if (revealFactor > 0.005) cellCache.push({ px, py, cellAlpha, revealChar: cell.revealChar })
          }

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

  // ── Hit-test helper (shared by mouse + touch handlers) ─────────────────
  function hitCreature(worldX, worldY) {
    const cs = creaturesRef ? creaturesRef.current : []
    for (const c of cs) {
      const dim = nameBlobDims[c.slug]
      const hw  = dim ? dim.halfW + GLYPH_MASK_MARGIN : 20
      const hh  = dim ? dim.halfH + GLYPH_MASK_MARGIN : 12
      if (Math.abs(worldX - c.x) <= hw && Math.abs(worldY - c.y) <= hh) return c
    }
    return null
  }

  function worldFromEvent(clientX, clientY) {
    const { x: panX, y: panY, zoom } = usePondStore.getState().camera
    return { worldX: (clientX - panX) / zoom, worldY: (clientY - panY) / zoom }
  }

  // ── Mouse handlers ───────────────────────────────────────────────────────

  function handleMouseDown(e) {
    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    const { worldX, worldY } = worldFromEvent(e.clientX, e.clientY)
    const c = hitCreature(worldX, worldY)
    if (!c) return

    if (creatureDragRef) creatureDragRef.current = c
    let lastDragX = e.clientX, lastDragY = e.clientY

    function onDragMove(me) {
      const { zoom: z } = usePondStore.getState().camera
      c.homeX += (me.clientX - lastDragX) / z
      c.homeY += (me.clientY - lastDragY) / z
      lastDragX = me.clientX; lastDragY = me.clientY
    }
    function onDragUp() {
      if (creatureDragRef) creatureDragRef.current = null
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup',   onDragUp)
    }
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup',   onDragUp)
  }

  function handleClick(e) {
    if (mouseDownPos.current) {
      const dx = e.clientX - mouseDownPos.current.x
      const dy = e.clientY - mouseDownPos.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) return
    }
    const { worldX, worldY } = worldFromEvent(e.clientX, e.clientY)
    const c = hitCreature(worldX, worldY)
    if (c) {
      const p = c.project
      usePondStore.getState().openProject({ slug: p.slug, name: p.name, status: p.status, mode: p.frame.mode, target: p.frame.target })
    } else {
      // Tap/click on open water — ripple impulse
      usePondStore.getState().injectTapRipple(worldX, worldY)
    }
  }

  function handleMouseMove(e) {
    if (creatureDragRef?.current) return
    const { worldX, worldY } = worldFromEvent(e.clientX, e.clientY)
    const c = hitCreature(worldX, worldY)
    hoveredSlugRef.current = c ? c.slug : null
    e.currentTarget.style.cursor = c ? 'pointer' : ''
  }

  function handleMouseLeave() {
    hoveredSlugRef.current = null
  }

  // ── Touch handlers (long-press hover; tap and drag handled by useCamera) ─

  function handleTouchStart(e) {
    const touch = e.touches[0]
    if (!touch) return
    longPressTouch.current = { x: touch.clientX, y: touch.clientY }
    longPressSlug.current  = null

    const { worldX, worldY } = worldFromEvent(touch.clientX, touch.clientY)
    const c = hitCreature(worldX, worldY)
    if (!c) return

    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      hoveredSlugRef.current = c.slug
      longPressSlug.current  = c.slug
      longPressTimer.current = null
    }, POND_PHYSICS.mobile.longPressMs)
  }

  function handleTouchMove(e) {
    if (!longPressTimer.current) return
    const touch = e.touches[0]
    const start = longPressTouch.current
    if (!touch || !start) return
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y
    if (Math.sqrt(dx * dx + dy * dy) > POND_PHYSICS.mobile.tapMoveThreshold) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    // Auto-clear long-press hover after hold window expires
    const slug = longPressSlug.current
    if (slug) {
      setTimeout(() => {
        if (hoveredSlugRef.current === slug) hoveredSlugRef.current = null
      }, POND_PHYSICS.mobile.longPressHoldMs)
      longPressSlug.current = null
    }
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'absolute', inset: 0, display: 'block' }}
    />
  )
}
