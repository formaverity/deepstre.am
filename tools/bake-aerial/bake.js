// bake.js — pure aerial-bake pipeline, ESM
// Browser: uses OffscreenCanvas. Node CLI: set globalThis.createCanvas before calling resampleToGrid.

export const RAMPS = {
  outside:    ' ',
  water:      ' .·∙:;≈≋⌇~-=',
  shore:      ' .,:;ixoX#',
  vegetation: ' .,*✿❋✸',
  edgeChars:  { horiz: '─', vert: '│', diag1: '╱', diag2: '╲' },
}

export const DEFAULT_CFG = {
  cols: 320,
  rows: 160,
  clipLo: 0.02,
  clipHi: 0.98,
  gamma: 0.85,
  invert: false,
  edgeThreshold: 0.15,
  waterSat: 0.25,
  waterHueLo: 160,
  waterHueHi: 260,
  vegBias: 0.08,
  outLum: 0.05,
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  if (typeof globalThis.createCanvas === 'function') return globalThis.createCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function rgbToHsl(r255, g255, b255) {
  const r = r255 / 255, g = g255 / 255, b = b255 / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: h * 360, s, l }
}

function hueInRange(hue, lo, hi) {
  if (lo <= hi) return hue >= lo && hue <= hi
  return hue >= lo || hue <= hi
}

function toBase64(uint8) {
  let s = ''
  for (let i = 0; i < uint8.length; i++) s += String.fromCharCode(uint8[i])
  return btoa(s)
}

// Pass 1 — resample source to cols × rows via canvas drawImage
export function resampleToGrid(source, cols, rows) {
  const canvas = makeCanvas(cols, rows)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (source instanceof ImageData) {
    const tmp = makeCanvas(source.width, source.height)
    tmp.getContext('2d').putImageData(source, 0, 0)
    ctx.drawImage(tmp, 0, 0, cols, rows)
  } else {
    ctx.drawImage(source, 0, 0, cols, rows)
  }
  return ctx.getImageData(0, 0, cols, rows)
}

// Passes 2–5 — tone, Sobel edges, region segmentation, quantize
export function computeChannels(imageData, cfg = {}) {
  const {
    clipLo = 0.02, clipHi = 0.98,
    gamma = 0.85, invert = false,
    outLum = 0.05, vegBias = 0.08,
    waterSat = 0.25, waterHueLo = 160, waterHueHi = 260,
  } = cfg

  const { width, height, data } = imageData
  const n = width * height
  const lumRaw      = new Float32Array(n)
  const greenBias   = new Float32Array(n)
  const satArr      = new Float32Array(n)
  const hueArr      = new Float32Array(n)

  // Pass 2a — per-cell luminance, HSL, green bias
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    lumRaw[i]    = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    greenBias[i] = g / 255 - (r + b) / 510
    const hsl    = rgbToHsl(r, g, b)
    hueArr[i]    = hsl.h
    satArr[i]    = hsl.s
  }

  // Pass 2b — percentile clip, linear stretch, gamma
  const sorted = Float32Array.from(lumRaw).sort()
  const loVal  = sorted[Math.floor(clipLo * (n - 1))]
  const hiVal  = sorted[Math.min(Math.floor(clipHi * (n - 1)), n - 1)]
  const range  = (hiVal - loVal) || 1

  const brightness = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = Math.max(0, Math.min(1, (lumRaw[i] - loVal) / range))
    v = Math.pow(v, gamma)
    brightness[i] = invert ? 1 - v : v
  }

  // Pass 3 — 3×3 Sobel on brightness
  const edgeMagF   = new Float32Array(n)
  const edgeAngleF = new Float32Array(n)
  let maxMag = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i  = y * width + x
      const tl = brightness[i - width - 1], tc = brightness[i - width], tr = brightness[i - width + 1]
      const ml = brightness[i - 1],                                      mr = brightness[i + 1]
      const bl = brightness[i + width - 1], bc = brightness[i + width], br = brightness[i + width + 1]
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br
      const mag = Math.sqrt(gx * gx + gy * gy)
      edgeMagF[i]   = mag
      edgeAngleF[i] = Math.atan2(gy, gx)
      if (mag > maxMag) maxMag = mag
    }
  }
  if (maxMag > 0) {
    for (let i = 0; i < n; i++) edgeMagF[i] /= maxMag
  }

  // Pass 4 — region per cell: 0=outside 1=water 2=shore 3=vegetation
  const region = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const lum = lumRaw[i]
    const gb  = greenBias[i]
    const sat = satArr[i]
    const hue = hueArr[i]
    if (lum < outLum) {
      region[i] = 0
    } else if (gb > vegBias) {
      region[i] = 3
    } else if (sat < waterSat && hueInRange(hue, waterHueLo, waterHueHi)) {
      region[i] = 1
    } else if (sat < waterSat * 1.3) {
      region[i] = 1
    } else {
      region[i] = 2
    }
  }

  // Pass 4b — water mask override
  // waterMask: Uint8Array[n] of luminance values resampled to the same grid.
  //   pixel > 200  → force water (white areas in mask)
  //   pixel < 55   → deny water; auto-detected water becomes shore (black areas in mask)
  //   pixel 55-200 → leave auto-detection unchanged (grey / no mask)
  if (cfg.waterMask) {
    for (let i = 0; i < n; i++) {
      const m = cfg.waterMask[i]
      if      (m > 200)              region[i] = 1
      else if (m < 55 && region[i] === 1) region[i] = 2
    }
  }

  // Pass 5 — quantize to Uint8
  const brightnessU8  = new Uint8Array(n)
  const edgeMagU8     = new Uint8Array(n)
  const edgeAngleU8   = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    brightnessU8[i] = Math.round(brightness[i] * 255)
    edgeMagU8[i]    = Math.round(edgeMagF[i] * 255)
    // edgeAngle: (a + π) / (2π) × 255, maps −π→0, π→255
    edgeAngleU8[i]  = Math.round((edgeAngleF[i] + Math.PI) / (2 * Math.PI) * 255)
  }

  return { brightness: brightnessU8, edgeMag: edgeMagU8, edgeAngle: edgeAngleU8, region }
}

// Compute pond-specific creature homes.
//
// Strategy: farthest-point sampling picks k=n positions that are maximally
// spread across all water cells, then a greedy min-distance assignment maps
// each creature to the spread-out seed closest to its default home.
// This guarantees every creature lands in water while preserving as much of
// the intended spatial layout as the pond's water shape allows.
//
// creatures: array of { slug, home: { x, y } } (normalised 0–1)
// Returns { [slug]: { x, y } } normalised coordinates.
export function computeCreatureHomes(region, cols, rows, creatures) {
  const n = creatures.length

  // MARGIN: keep away from image edges. SHORE: keep away from shoreline (erosion radius).
  const MARGIN = Math.max(4, Math.round(Math.min(cols, rows) * 0.05))
  const SHORE  = Math.max(3, Math.round(Math.min(cols, rows) * 0.04))

  function isInteriorWater(x, y, shore) {
    for (let dy = -shore; dy <= shore; dy++)
      for (let dx = -shore; dx <= shore; dx++) {
        const ny = y + dy, nx = x + dx
        if (ny < 0 || ny >= rows || nx < 0 || nx >= cols || region[ny * cols + nx] !== 1)
          return false
      }
    return true
  }

  // Prefer eroded interior water cells; fall back progressively if too few.
  let water = []
  for (let y = MARGIN; y < rows - MARGIN; y++)
    for (let x = MARGIN; x < cols - MARGIN; x++)
      if (isInteriorWater(x, y, SHORE)) water.push({ x, y })

  if (water.length < n * 2) {
    // Relax shore erosion to half
    water = []
    for (let y = MARGIN; y < rows - MARGIN; y++)
      for (let x = MARGIN; x < cols - MARGIN; x++)
        if (isInteriorWater(x, y, Math.ceil(SHORE / 2))) water.push({ x, y })
  }

  if (water.length < n * 2) {
    // Last resort: all water cells inside image margin
    water = []
    for (let y = MARGIN; y < rows - MARGIN; y++)
      for (let x = MARGIN; x < cols - MARGIN; x++)
        if (region[y * cols + x] === 1) water.push({ x, y })
    // Include border cells too if still sparse
    if (water.length < n * 2)
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
          if (region[y * cols + x] === 1 &&
              (y < MARGIN || y >= rows - MARGIN || x < MARGIN || x >= cols - MARGIN))
            water.push({ x, y })
  }

  if (water.length === 0) {
    const homes = {}
    for (const c of creatures) homes[c.slug] = { x: c.home.x, y: c.home.y }
    return homes
  }

  // ── Farthest-point sampling ─────────────────────────────────────────
  const k    = Math.min(n, water.length)
  const dist = new Float32Array(water.length).fill(Infinity)
  const seeds = []

  // First seed: water cell nearest to the water-region centroid
  const cx0 = water.reduce((s, w) => s + w.x, 0) / water.length
  const cy0 = water.reduce((s, w) => s + w.y, 0) / water.length
  let first = 0
  for (let i = 1; i < water.length; i++) {
    if ((water[i].x - cx0) ** 2 + (water[i].y - cy0) ** 2 <
        (water[first].x - cx0) ** 2 + (water[first].y - cy0) ** 2) first = i
  }

  function addSeed(idx) {
    seeds.push(water[idx])
    const { x: sx, y: sy } = water[idx]
    for (let i = 0; i < water.length; i++) {
      const d = (water[i].x - sx) ** 2 + (water[i].y - sy) ** 2
      if (d < dist[i]) dist[i] = d
    }
  }

  addSeed(first)
  while (seeds.length < k) {
    let best = 0
    for (let i = 1; i < water.length; i++) if (dist[i] > dist[best]) best = i
    addSeed(best)
  }

  // ── Greedy min-distance assignment ─────────────────────────────────
  const pairs = []
  for (let ci = 0; ci < n; ci++) {
    const hx = creatures[ci].home.x * (cols - 1)
    const hy = creatures[ci].home.y * (rows - 1)
    for (let si = 0; si < seeds.length; si++) {
      const d = (seeds[si].x - hx) ** 2 + (seeds[si].y - hy) ** 2
      pairs.push({ ci, si, d })
    }
  }
  pairs.sort((a, b) => a.d - b.d)

  const usedC = new Uint8Array(n)
  const usedS = new Uint8Array(seeds.length)
  const pick  = new Int8Array(n).fill(-1)
  for (const { ci, si } of pairs) {
    if (usedC[ci] || usedS[si]) continue
    pick[ci] = si
    usedC[ci] = 1
    usedS[si] = 1
  }

  const homes = {}
  for (let ci = 0; ci < n; ci++) {
    const si = pick[ci]
    if (si < 0) {
      homes[creatures[ci].slug] = { x: creatures[ci].home.x, y: creatures[ci].home.y }
    } else {
      homes[creatures[ci].slug] = {
        x: seeds[si].x / (cols - 1),
        y: seeds[si].y / (rows - 1),
      }
    }
  }
  return homes
}

// Pick a single display character for one cell
export function pickGlyph(b, em, ea, reg, cfg = {}) {
  const threshold = (cfg.edgeThreshold ?? 0.15) * 255
  if (em > threshold) {
    // Recover angle −π..π, bin into 4 edge directions
    const angle  = (ea / 255) * 2 * Math.PI - Math.PI
    const sector = Math.round(angle * 4 / Math.PI)
    const s      = ((sector % 4) + 4) % 4
    // angle≈0 → gradient right → vertical edge │
    // angle≈π/4 → diag ╲, angle≈π/2 → horiz ─, angle≈3π/4 → diag ╱
    const ec = RAMPS.edgeChars
    return [ec.vert, ec.diag2, ec.horiz, ec.diag1][s]
  }
  const rampKey = ['outside', 'water', 'shore', 'vegetation'][reg] ?? 'shore'
  const ramp    = RAMPS[rampKey]
  const idx     = Math.floor((b / 255) * (ramp.length - 1))
  return ramp[Math.max(0, Math.min(ramp.length - 1, idx))]
}

// Assemble the final pond.json payload
export function packPondJSON({ channels, cfg, meta, creatureHomes }) {
  const payload = {
    version:      '1.0',
    source:       meta.source,
    baked_at:     meta.baked_at,
    grid:         { cols: meta.cols, rows: meta.rows },
    world_aspect: meta.world_aspect,
    channels:     ['brightness', 'edge_mag', 'edge_angle', 'region'],
    encoding:     'base64-u8',
    data: {
      brightness: toBase64(channels.brightness),
      edge_mag:   toBase64(channels.edgeMag),
      edge_angle: toBase64(channels.edgeAngle),
      region:     toBase64(channels.region),
    },
    legend: { region: { 0: 'outside', 1: 'water', 2: 'shore', 3: 'vegetation' } },
    ramps:  RAMPS,
    config: cfg,
  }
  if (creatureHomes) payload.creature_homes = creatureHomes
  return payload
}
