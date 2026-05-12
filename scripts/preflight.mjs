#!/usr/bin/env node
// Pre-build validation. Exits non-zero on first failure.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let ok = true

function pass(msg) { console.log(`  ✓ ${msg}`) }
function fail(msg) { console.error(`  ✗ ${msg}`); ok = false }

// ── 1. public/pond.json ───────────────────────────────────────────────────

const pondPath = resolve(root, 'public/pond.json')
if (!existsSync(pondPath)) {
  fail('public/pond.json not found — run the bake tool first, then npm run bake')
  process.exit(1)
}

let pond
try {
  pond = JSON.parse(readFileSync(pondPath, 'utf8'))
} catch {
  fail('public/pond.json is not valid JSON')
  process.exit(1)
}

if (!pond.version) {
  fail('public/pond.json is missing a version field — re-bake to regenerate')
} else {
  pass(`pond.json v${pond.version} (${pond.grid?.cols ?? '?'}×${pond.grid?.rows ?? '?'})`)
}

// ── 2. At least one project in the manifest ───────────────────────────────

const manifestPath = resolve(root, 'src/projects/_manifest.js')
const manifestSrc  = readFileSync(manifestPath, 'utf8')
const importLines  = [...manifestSrc.matchAll(/^import\s+\w+\s+from\s+['"]\.\/([^'"]+)['"]/gm)]

if (importLines.length === 0) {
  fail('src/projects/_manifest.js has no project imports')
  ok = false
} else {
  pass(`manifest lists ${importLines.length} project(s)`)
}

// ── 3. Every project's frame.target is valid ──────────────────────────────

for (const [, file] of importLines) {
  const projectPath = resolve(root, 'src/projects', file)
  if (!existsSync(projectPath)) {
    fail(`${file}: file not found`)
    ok = false
    continue
  }

  const src   = readFileSync(projectPath, 'utf8')
  // Match the target inside a frame: { ... } block
  const match = src.match(/frame:\s*\{[^}]*target:\s*['"]([^'"]+)['"]/s)

  if (!match) {
    fail(`${file}: could not find frame.target`)
    ok = false
    continue
  }

  const target = match[1]
  if (!target.startsWith('https://') && !target.startsWith('/')) {
    fail(`${file}: frame.target "${target}" must be an https:// URL or a route starting with /`)
    ok = false
  } else {
    pass(`${file.replace(/\.js$/, '')}: ${target}`)
  }
}

// ── Result ────────────────────────────────────────────────────────────────

if (!ok) {
  console.error('\npreflight failed — fix the errors above before building\n')
  process.exit(1)
}

console.log('\npreflight passed\n')
