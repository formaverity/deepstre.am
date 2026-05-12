#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { computeChannels, packPondJSON } from './bake-aerial/bake.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ── Arg parsing ───────────────────────────────────────────────────────

const argv = process.argv.slice(2)
function arg(flag, def) {
  const i = argv.indexOf(flag)
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def
}

const inputPath  = resolve(ROOT, arg('--in',     'public/aerial/pond-source.jpg'))
const outputPath = resolve(ROOT, arg('--out',    'public/pond.json'))
const configPath = resolve(ROOT, arg('--config', 'bake.config.json'))

// ── Guards ────────────────────────────────────────────────────────────

if (!existsSync(configPath)) {
  console.error('\nbake-cli: bake.config.json not found.')
  console.error('Run the browser bake tool first to produce bake.config.json')
  console.error('  → npx serve tools/bake-aerial\n')
  process.exit(1)
}

if (!existsSync(inputPath)) {
  console.error(`\nbake-cli: source image not found: ${inputPath}`)
  console.error('Drop your aerial photo at public/aerial/pond-source.jpg, or pass --in <path>\n')
  process.exit(1)
}

// ── Load config ───────────────────────────────────────────────────────

const cfg  = JSON.parse(readFileSync(configPath, 'utf8'))

// Natural dimensions — needed for world_aspect and auto-cols
const sourceMeta  = await sharp(inputPath).metadata()
const worldAspect = sourceMeta.width / sourceMeta.height

const CHAR_ASPECT = 0.6
const rows = cfg.rows
// Auto-compute cols from source aspect so the grid matches the image proportions.
// cols/rows = sourceAspect / CHAR_ASPECT  (each character cell is CHAR_ASPECT wide per unit tall)
const autoCols = Math.round(rows * worldAspect / CHAR_ASPECT)
const cols = cfg.cols ?? autoCols
if (cfg.cols && cfg.cols !== autoCols) {
  console.warn(`  ⚠  bake.config.json cols=${cfg.cols} but aspect-correct value is ${autoCols}`)
  console.warn(`     (source ${sourceMeta.width}×${sourceMeta.height}, rows=${rows})`)
  console.warn(`     Remove "cols" from bake.config.json to use the correct value.\n`)
}

const pad = (s, n) => String(s).padEnd(n)

console.log()
console.log('bake-aerial cli')
console.log('─'.repeat(44))
console.log(`  ${pad('source', 10)} ${basename(inputPath)}  (${sourceMeta.width}×${sourceMeta.height})`)
console.log(`  ${pad('config', 10)} ${basename(configPath)}`)
console.log(`  ${pad('grid', 10)} ${cols} × ${rows}  (${cols * rows} cells)`)
console.log()

// Resize to target grid with lanczos3, ensure RGBA, get raw bytes
const { data, info } = await sharp(inputPath)
  .resize(cols, rows, { kernel: 'lanczos3' })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

// Construct a plain { data, width, height } compatible with computeChannels
const imageData = { data, width: info.width, height: info.height }

// ── Run pipeline ──────────────────────────────────────────────────────

const channels = computeChannels(imageData, cfg)

// ── Stats ─────────────────────────────────────────────────────────────

const n      = cols * rows
const counts = [0, 0, 0, 0]
for (let i = 0; i < n; i++) counts[channels.region[i]]++

let sumB = 0, sumE = 0
for (let i = 0; i < n; i++) { sumB += channels.brightness[i]; sumE += channels.edgeMag[i] }

const REGION_LABELS = ['outside', 'water  ', 'shore  ', 'veg    ']
console.log('  regions:')
REGION_LABELS.forEach((label, i) => {
  const frac = counts[i] / n
  const pct  = (frac * 100).toFixed(1).padStart(5)
  const bar  = '█'.repeat(Math.round(frac * 28))
  console.log(`    ${label}  ${pct}%  ${bar}`)
})
console.log()
console.log(`  ${pad('mean brightness', 18)} ${(sumB / n / 2.55).toFixed(1)}%`)
console.log(`  ${pad('mean edge mag',   18)} ${(sumE / n / 2.55).toFixed(1)}%`)
console.log()

// ── Pack + write ──────────────────────────────────────────────────────

const pond = packPondJSON({
  channels,
  cfg,
  meta: {
    source:       basename(inputPath),
    baked_at:     new Date().toISOString(),
    cols,
    rows,
    world_aspect: worldAspect,
  },
})

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(pond, null, 2), 'utf8')

const kb = (statSync(outputPath).size / 1024).toFixed(1)
console.log(`  ${pad('output', 10)} ${outputPath}`)
console.log(`  ${pad('size', 10)} ${kb} KB`)
console.log()
