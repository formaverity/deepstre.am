function b64ToU8(str) {
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function decodePond(json) {
  const { grid, world_aspect, data, ramps, config, creature_homes } = json
  const { cols, rows } = grid
  return {
    cols,
    rows,
    worldAspect: world_aspect,
    brightness: b64ToU8(data.brightness),
    edgeMag:    b64ToU8(data.edge_mag),
    edgeAngle:  b64ToU8(data.edge_angle),
    region:     b64ToU8(data.region),
    ramps,
    config,
    creatureHomes: creature_homes ?? null,
  }
}

export function sampleCell(field, x, y) {
  const cx = Math.max(0, Math.min(field.cols - 1, Math.floor(x)))
  const cy = Math.max(0, Math.min(field.rows - 1, Math.floor(y)))
  const i  = cy * field.cols + cx
  return {
    brightness: field.brightness[i],
    edgeMag:    field.edgeMag[i],
    edgeAngle:  field.edgeAngle[i],
    region:     field.region[i],
  }
}
