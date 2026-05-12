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
export function packPondJSON({ channels, cfg, meta }) {
  return {
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
}
