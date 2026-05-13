#!/usr/bin/env node
// Retrofits existing pond.json files with computed creature_homes.
// Run from repo root: node scripts/add-creature-homes.mjs
//
// Uses the same farthest-point sampling + greedy assignment as the bake tool,
// so re-baking via the browser tool will produce consistent results.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeCreatureHomes } from '../tools/bake-aerial/bake.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Keep in sync with src/projects/_manifest.js
const CREATURES = [
  { slug: 'g2tree',      home: { x: 0.32, y: 0.40 } },
  { slug: 'beechlens',   home: { x: 0.58, y: 0.28 } },
  { slug: 'grovematrix', home: { x: 0.42, y: 0.56 } },
  { slug: 'streamwise',  home: { x: 0.66, y: 0.62 } },
  { slug: 'flo',         home: { x: 0.28, y: 0.68 } },
  { slug: 'deepstream',  home: { x: 0.50, y: 0.42 } },
  { slug: 'thesis',      home: { x: 0.40, y: 0.30 } },
  { slug: 'murmur',      home: { x: 0.52, y: 0.50 } },
]

const REGION_NAMES = ['outside', 'water', 'shore', 'veg']
const FILES = ['pond.json', 'pond2.json', 'pond3.json']

for (const filename of FILES) {
  const path = resolve(ROOT, 'public', filename)
  let json
  try {
    json = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    console.log(`  skip  ${filename} (not found)`)
    continue
  }

  const { cols, rows } = json.grid
  const region = Buffer.from(json.data.region, 'base64')

  const waterCount = region.reduce((n, v) => n + (v === 1 ? 1 : 0), 0)
  const waterPct   = (waterCount / (cols * rows) * 100).toFixed(1)

  const homes = computeCreatureHomes(region, cols, rows, CREATURES)
  json.creature_homes = homes

  writeFileSync(path, JSON.stringify(json, null, 2), 'utf8')

  console.log(`\n${filename}  (${cols}×${rows}, water ${waterPct}%)`)
  for (const c of CREATURES) {
    const h   = homes[c.slug]
    const px  = Math.round(h.x * (cols - 1))
    const py  = Math.round(h.y * (rows - 1))
    const reg = region[py * cols + px]
    console.log(`  ${reg === 1 ? '✓' : '✗'} ${c.slug.padEnd(12)} → (${h.x.toFixed(3)}, ${h.y.toFixed(3)})  [${REGION_NAMES[reg] ?? '?'}]`)
  }
}

console.log('\ndone.\n')
