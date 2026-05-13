/**
 * Generates a synthetic point cloud for MURMUR development.
 *
 * Structure (120 000 points total):
 *   60 000  — five vertical trunk cylinders (h=2, r=0.06)
 *   50 000  — spherical canopy cluster above each trunk (r=0.7)
 *   10 000  — sparse ground plane (y ∈ [-0.05, 0.05])
 *
 * Output: public/clouds/default-grove.ply  (binary PLY, little-endian)
 *         public/clouds/default-grove.meta.json
 *
 * Usage: node tools/make-default-cloud.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR   = join(__dirname, '../public/clouds')
const OUT_PLY   = join(OUT_DIR, 'default-grove.ply')
const OUT_META  = join(OUT_DIR, 'default-grove.meta.json')

mkdirSync(OUT_DIR, { recursive: true })

// ── helpers ───────────────────────────────────────────────────────────────────

const rnd  = (lo, hi)       => lo + Math.random() * (hi - lo)
const clr  = (v, lo = 0, hi = 255) => Math.round(Math.max(lo, Math.min(hi, v)))

// ── cloud configuration ───────────────────────────────────────────────────────

const TRUNK_POSITIONS = [
  [ 0.00,  0.00],
  [ 0.80,  0.50],
  [-0.70,  0.40],
  [ 0.50, -0.80],
  [-0.60, -0.60],
]

const TRUNKS_PER  = 12_000   // × 5 = 60 000
const CANOPY_PER  = 10_000   // × 5 = 50 000
const GROUND_PTS  = 10_000
const TOTAL       = TRUNK_POSITIONS.length * (TRUNKS_PER + CANOPY_PER) + GROUND_PTS  // 120 000

// Binary PLY: 3 × float32 (12 bytes) + 3 × uint8 (3 bytes) = 15 bytes / vertex
const BYTES_PER = 15
const dataBuf   = Buffer.allocUnsafe(TOTAL * BYTES_PER)
let   offset    = 0

function writePoint(x, y, z, r, g, b) {
  dataBuf.writeFloatLE(x, offset); offset += 4
  dataBuf.writeFloatLE(y, offset); offset += 4
  dataBuf.writeFloatLE(z, offset); offset += 4
  dataBuf[offset++] = r
  dataBuf[offset++] = g
  dataBuf[offset++] = b
}

// ── trunks ────────────────────────────────────────────────────────────────────
// Brown (0.35, 0.22, 0.15) ± noise. Cylinder: y ∈ [0, 2], xz within radius 0.06.

for (const [tx, tz] of TRUNK_POSITIONS) {
  for (let i = 0; i < TRUNKS_PER; i++) {
    const y     = rnd(0, 2)
    const angle = rnd(0, Math.PI * 2)
    const r     = Math.sqrt(Math.random()) * 0.06   // uniform disk
    const x     = tx + r * Math.cos(angle)
    const z     = tz + r * Math.sin(angle)
    const n     = rnd(-0.04, 0.04)
    writePoint(
      x, y, z,
      clr((0.35 + n)        * 255),
      clr((0.22 + n * 0.6)  * 255),
      clr((0.15 + n * 0.4)  * 255),
    )
  }
}

// ── canopy ────────────────────────────────────────────────────────────────────
// Spherical cluster centred at (tx, 2.2, tz), radius 0.7.
// Uniform sphere: r ∝ ∛(random) keeps density uniform throughout volume.
// Green: r≈0.18, g 0.30–0.55, b≈0.10.

for (const [tx, tz] of TRUNK_POSITIONS) {
  for (let i = 0; i < CANOPY_PER; i++) {
    const rad   = Math.cbrt(Math.random()) * 0.7
    const theta = rnd(0, Math.PI * 2)
    const phi   = Math.acos(2 * Math.random() - 1)
    const x     = tx + rad * Math.sin(phi) * Math.cos(theta)
    const y     = 2.2 + rad * Math.cos(phi)
    const z     = tz  + rad * Math.sin(phi) * Math.sin(theta)
    writePoint(
      x, y, z,
      clr((0.18 + rnd(0, 0.08))  * 255),
      clr((0.30 + rnd(0, 0.25))  * 255),
      clr((0.10 + rnd(0, 0.06))  * 255),
    )
  }
}

// ── ground plane ──────────────────────────────────────────────────────────────
// Thin slab at y ≈ 0, xz ∈ [-1.5, 1.5]. Dark muddy brown.

for (let i = 0; i < GROUND_PTS; i++) {
  writePoint(
    rnd(-1.5, 1.5),
    rnd(-0.05, 0.05),
    rnd(-1.5, 1.5),
    clr((0.22 + rnd(0, 0.06)) * 255),
    clr((0.19 + rnd(0, 0.06)) * 255),
    clr((0.13 + rnd(0, 0.04)) * 255),
  )
}

if (offset !== TOTAL * BYTES_PER) {
  throw new Error(`Buffer mismatch: wrote ${offset} bytes, expected ${TOTAL * BYTES_PER}`)
}

// ── PLY header ────────────────────────────────────────────────────────────────

const header = [
  'ply',
  'format binary_little_endian 1.0',
  `element vertex ${TOTAL}`,
  'property float x',
  'property float y',
  'property float z',
  'property uchar red',
  'property uchar green',
  'property uchar blue',
  'end_header',
  '',   // trailing newline — binary data follows immediately
].join('\n')

const headerBuf = Buffer.from(header, 'ascii')
writeFileSync(OUT_PLY, Buffer.concat([headerBuf, dataBuf]))

const mb = ((headerBuf.length + dataBuf.length) / 1024 / 1024).toFixed(2)
console.log(`✓  ${OUT_PLY}`)
console.log(`   ${TOTAL.toLocaleString()} points · ${mb} MB`)

// ── meta JSON ─────────────────────────────────────────────────────────────────

const meta = {
  name:                'Default Grove',
  place:               'synthetic',
  captured:            null,
  description:         'Placeholder grove for development. Real LiDAR scans coming.',
  point_count_source:  TOTAL,
  notes:               'Five trunks, canopy clusters, sparse ground.',
}

writeFileSync(OUT_META, JSON.stringify(meta, null, 2))
console.log(`✓  ${OUT_META}`)
