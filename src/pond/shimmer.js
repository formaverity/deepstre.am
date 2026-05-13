import { fbm } from '@/utils/noise.js'

// Per-region intensity multipliers: outside, water, shore, vegetation
// Shore and vegetation are static — only water shimmers.
const REGION_SCALE = [0, 1.0, 0, 0]

// Returns clamped 0..1 brightness after a time-varying fbm wobble.
// baseBrightness is raw Uint8 (0-255); returned value is normalised float.
// driftX / driftY control the noise advection direction (cursor-biased wind).
export function shimmerBrightness(baseBrightness, x, y, t, intensity = 0.15, region = 1, driftX = 0.09, driftY = 0.06) {
  const scale = REGION_SCALE[region] ?? 0
  if (scale === 0) return baseBrightness / 255

  // Low-frequency fbm — larger cells (0.02/0.032 vs 0.03/0.05) = broader, calmer waves
  const wobble = fbm(x * 0.02 + t * driftX, y * 0.032 + t * driftY, 2)
  const delta  = (wobble - 0.5) * 2 * intensity * scale

  return Math.max(0, Math.min(1, baseBrightness / 255 + delta))
}
