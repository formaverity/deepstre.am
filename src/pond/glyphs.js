// Identical logic to bake.js pickGlyph — ramps shipped in pond.json keep them in sync.

export function pickGlyph({ brightness, edgeMag, edgeAngle, region }, ramps, edgeThreshold = 0.18) {
  const threshold = edgeThreshold * 255

  if (edgeMag > threshold) {
    // Recover angle −π..π, bin into 4 edge directions
    const angle  = (edgeAngle / 255) * 2 * Math.PI - Math.PI
    const sector = Math.round(angle * 4 / Math.PI)
    const s      = ((sector % 4) + 4) % 4
    const ec = ramps.edgeChars
    return [ec.vert, ec.diag2, ec.horiz, ec.diag1][s]
  }

  const rampKey = ['outside', 'water', 'shore', 'vegetation'][region] ?? 'shore'
  const ramp    = ramps[rampKey]
  const idx     = Math.floor((brightness / 255) * (ramp.length - 1))
  return ramp[Math.max(0, Math.min(ramp.length - 1, idx))]
}

export function getRegionRamp(region, ramps) {
  const key = ['outside', 'water', 'shore', 'vegetation'][region] ?? 'shore'
  return ramps[key]
}

// Sanity check: logs first 4 rows × 60 cols, returns full ASCII string.
export function debugSampleField(field) {
  const { cols, rows, brightness, edgeMag, edgeAngle, region, ramps } = field
  const previewCols = Math.min(60, cols)

  for (let y = 0; y < Math.min(4, rows); y++) {
    let line = ''
    for (let x = 0; x < previewCols; x++) {
      const i = y * cols + x
      line += pickGlyph({ brightness: brightness[i], edgeMag: edgeMag[i], edgeAngle: edgeAngle[i], region: region[i] }, ramps)
    }
    console.log(line)
  }

  const lines = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      line += pickGlyph({ brightness: brightness[i], edgeMag: edgeMag[i], edgeAngle: edgeAngle[i], region: region[i] }, ramps)
    }
    lines.push(line)
  }
  return lines.join('\n')
}
