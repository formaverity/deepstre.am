import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'

// ── loadPLY ───────────────────────────────────────────────────────────────────
// Returns { positions: Float32Array, colors: Float32Array | null, count: number }
// colors are normalised 0–1 per channel (Three.js PLYLoader converts uchar→float).

export async function loadPLY(url) {
  const loader = new PLYLoader()
  const geometry = await loader.loadAsync(url)
  geometry.computeBoundingBox()

  const posAttr   = geometry.attributes.position
  const colorAttr = geometry.attributes.color

  const count     = posAttr.count
  const positions = new Float32Array(posAttr.array)
  const colors    = colorAttr ? new Float32Array(colorAttr.array) : null

  geometry.dispose()
  return { positions, colors, count }
}

// ── loadPLYFromFile ───────────────────────────────────────────────────────────
// Same as loadPLY but accepts a File object. Creates a temporary object URL,
// passes it to PLYLoader, then revokes it.

export async function loadPLYFromFile(file) {
  const url = URL.createObjectURL(file)
  try {
    return await loadPLY(url)
  } catch (err) {
    throw new Error(`Could not parse PLY: ${err.message}`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── checkFileFormat ───────────────────────────────────────────────────────────
// Returns { supported: true } for .ply files.
// Returns { supported: false, message } for recognised-but-unimplemented formats.

export function checkFileFormat(file) {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (ext === 'ply') return { supported: true }
  if (['xyz', 'pts'].includes(ext)) {
    return { supported: false, message: 'XYZ / PTS format not yet supported — convert to PLY first' }
  }
  if (['las', 'laz'].includes(ext)) {
    return { supported: false, message: 'LAS / LAZ not yet supported — convert to PLY first' }
  }
  return { supported: false, message: `Unknown format .${ext} — please use .ply` }
}

// ── decimate ──────────────────────────────────────────────────────────────────
// Stratified random sampling: bins points into a 3-D grid then samples each
// bin proportionally so spatial coverage is preserved rather than creating
// obvious bands (as every-Nth would).

const GRID = 16   // 16³ = 4 096 bins — fine enough for 120 k+ clouds

export function decimate({ positions, colors, count }, targetCount) {
  if (targetCount >= count) return { positions, colors, count }

  const ratio = targetCount / count

  // ── bounding box ──────────────────────────────────────────────────────
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2]
    if (x < minX) minX = x;  if (x > maxX) maxX = x
    if (y < minY) minY = y;  if (y > maxY) maxY = y
    if (z < minZ) minZ = z;  if (z > maxZ) maxZ = z
  }
  const rX = maxX - minX || 1, rY = maxY - minY || 1, rZ = maxZ - minZ || 1

  // ── bin every point ───────────────────────────────────────────────────
  const bins = new Map()
  for (let i = 0; i < count; i++) {
    const gx = Math.min(GRID - 1, (((positions[i * 3]     - minX) / rX) * GRID) | 0)
    const gy = Math.min(GRID - 1, (((positions[i * 3 + 1] - minY) / rY) * GRID) | 0)
    const gz = Math.min(GRID - 1, (((positions[i * 3 + 2] - minZ) / rZ) * GRID) | 0)
    const key = gx * GRID * GRID + gy * GRID + gz
    let bin = bins.get(key)
    if (!bin) { bin = []; bins.set(key, bin) }
    bin.push(i)
  }

  // ── partial Fisher-Yates shuffle per bin ─────────────────────────────
  const kept = []
  for (const [, indices] of bins) {
    const take = Math.max(1, Math.round(indices.length * ratio))
    for (let j = 0; j < take && j < indices.length; j++) {
      const k = j + Math.floor(Math.random() * (indices.length - j))
      const tmp = indices[j]; indices[j] = indices[k]; indices[k] = tmp
      kept.push(indices[j])
    }
  }

  const newCount = kept.length
  const newPos   = new Float32Array(newCount * 3)
  const newCol   = colors ? new Float32Array(newCount * 3) : null

  for (let i = 0; i < newCount; i++) {
    const s = kept[i]
    newPos[i * 3]     = positions[s * 3]
    newPos[i * 3 + 1] = positions[s * 3 + 1]
    newPos[i * 3 + 2] = positions[s * 3 + 2]
    if (newCol) {
      newCol[i * 3]     = colors[s * 3]
      newCol[i * 3 + 1] = colors[s * 3 + 1]
      newCol[i * 3 + 2] = colors[s * 3 + 2]
    }
  }

  return { positions: newPos, colors: newCol, count: newCount }
}

// ── computeGroupAffinities ────────────────────────────────────────────────────
// After normalize(), positions are in [-1,1]. Computes per-group mean color,
// converts to HSL, and maps to pitch affinity metadata used by Sculpt mode.
// Groups use the same 4×4 XZ spatial bins as the GPGPU ParticleSystem.

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l   = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else                h = ((r - g) / d + 4) / 6
  }
  return { h: h * 360, s, l }
}

export function computeGroupAffinities({ positions, colors, count }) {
  const sums = Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0, n: 0 }))

  for (let i = 0; i < count; i++) {
    const x  = positions[i * 3]
    const z  = positions[i * 3 + 2]
    const gx = Math.min(3, Math.max(0, Math.floor((x + 1.0) * 2.0)))
    const gz = Math.min(3, Math.max(0, Math.floor((z + 1.0) * 2.0)))
    const g  = gx * 4 + gz
    sums[g].r += colors ? colors[i * 3]     : 0.5
    sums[g].g += colors ? colors[i * 3 + 1] : 0.5
    sums[g].b += colors ? colors[i * 3 + 2] : 0.5
    sums[g].n++
  }

  return sums.map(({ r, g, b, n }) => {
    const mr = n > 0 ? r / n : 0.5
    const mg = n > 0 ? g / n : 0.5
    const mb = n > 0 ? b / n : 0.5
    const { h, s, l } = rgbToHsl(mr, mg, mb)
    return {
      meanColor:       [mr, mg, mb],
      pitchClass:      Math.floor((h / 360) * 12) % 12,
      octave:          Math.floor((l - 0.5) * 4),   // -2..+2
      affinityStrength: s,
    }
  })
}

// ── normalize ─────────────────────────────────────────────────────────────────
// Mutates positions in place: recenters at origin, scales longest axis to ±1.
// Returns { center, scale, origSpan } — origSpan is pre-normalisation dimensions
// (useful for labelling in physical units).

export function normalize({ positions, count }) {
  // Use percentile bounds on a sample rather than absolute min/max.
  // A single outlier point (e.g. a GPS origin artifact or sensor ghost) at an
  // extreme coordinate would otherwise make scale = 2 / 1e7, collapsing the
  // real cluster to sub-pixel size and making it invisible.
  const SAMPLE = Math.min(count, 2000)
  const step   = Math.max(1, Math.floor(count / SAMPLE))

  const xs = [], ys = [], zs = []
  for (let i = 0; i < count; i += step) {
    xs.push(positions[i * 3])
    ys.push(positions[i * 3 + 1])
    zs.push(positions[i * 3 + 2])
  }
  xs.sort((a, b) => a - b)
  ys.sort((a, b) => a - b)
  zs.sort((a, b) => a - b)

  const sn = xs.length
  const lo = Math.floor(sn * 0.02)
  const hi = Math.max(Math.floor(sn * 0.98), lo + 1)

  const minX = xs[lo], maxX = xs[hi]
  const minY = ys[lo], maxY = ys[hi]
  const minZ = zs[lo], maxZ = zs[hi]

  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  }

  const origSpan = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }

  // Scale so the longest axis spans exactly 2 (i.e. fits in −1 … +1)
  const scale = 2 / Math.max(origSpan.x, origSpan.y, origSpan.z, 1e-6)

  for (let i = 0, n = count * 3; i < n; i += 3) {
    positions[i]     = (positions[i]     - center.x) * scale
    positions[i + 1] = (positions[i + 1] - center.y) * scale
    positions[i + 2] = (positions[i + 2] - center.z) * scale
  }

  return { center, scale, origSpan }
}
