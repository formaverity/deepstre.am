// Hash two floats to 0..1 via classic GLSL sin-fract trick.
// Works well for visual noise at moderate coordinate ranges.
function hash(x, y) {
  return (Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1
}

function fract(v) {
  return v - Math.floor(v)
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// 2D value noise, deterministic — returns 0..1
export function noise2D(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix,        fy = y - iy
  const ux = smoothstep(fx), uy = smoothstep(fy)

  const v00 = fract(Math.abs(hash(ix,     iy)))
  const v10 = fract(Math.abs(hash(ix + 1, iy)))
  const v01 = fract(Math.abs(hash(ix,     iy + 1)))
  const v11 = fract(Math.abs(hash(ix + 1, iy + 1)))

  return lerp(lerp(v00, v10, ux), lerp(v01, v11, ux), uy)
}

// Fractional Brownian motion — sums octaves of noise2D
export function fbm(x, y, octaves = 3) {
  let value = 0
  let amp   = 0.5
  let freq  = 1
  let norm  = 0

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * freq, y * freq) * amp
    norm  += amp
    amp   *= 0.5
    freq  *= 2.1  // slight lacunarity offset avoids axis-aligned artifacts
  }

  return value / norm
}
