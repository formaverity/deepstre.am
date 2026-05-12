// Potential-flow doublet displacement.
// Each creature acts as a 2D dipole; streamlines curve smoothly around it,
// displacing nearby ASCII cells along the flow without moving them in world space.

// ── Tuning constants (exported so the renderer can read them) ──────────────
export const BASE_RADIUS          = 12    // world px — cells inside are masked
export const INFLUENCE_MULTIPLIER = 4     // influenceRadius = BASE_RADIUS × this → 48 px
export const BOB_VELOCITY_COEFF   = 0.18  // wake trail strength from bob velocity
export const MAX_DX_DY_CLAMP      = 1.0   // maximum displacement as a fraction of cellSize

// ── Helpers ────────────────────────────────────────────────────────────────

function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

// Smooth attenuation: 1 at d = r0, 0 at d = r1
function falloff(d, r0, r1) {
  return smoothstep(1 - (d - r0) / (r1 - r0))
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * doubletDisplacement
 * @param {number} wx       World x of the cell centre (cellX * cellW)
 * @param {number} wy       World y of the cell centre (cellY * cellH)
 * @param {Array}  creatures Array of { x, y, vx, vy, radius?, influenceRadius?, influence? }
 *                           All positions in world px.
 * @param {number} t        Current time (seconds)
 * @param {number} cellSize Current cell height in world px (used for clamping)
 * @returns {{ dx: number, dy: number, mask: number }}
 *          dx/dy — world-px displacement to add to draw position
 *          mask  — 1 if this cell falls inside a creature footprint (skip drawing)
 */
export function doubletDisplacement(wx, wy, creatures, t, cellSize = 11) {
  let dx = 0, dy = 0, mask = 0
  const clamp = MAX_DX_DY_CLAMP * cellSize

  for (const c of creatures) {
    const r0    = c.radius          ?? BASE_RADIUS
    const r1    = c.influenceRadius ?? (r0 * INFLUENCE_MULTIPLIER)
    const influ = c.influence       ?? 1.0

    const rx = wx - c.x
    const ry = wy - c.y
    const d2 = rx * rx + ry * ry

    if (d2 > r1 * r1) continue
    const d = Math.sqrt(d2)
    if (d < r0) { mask = 1; continue }

    // 2D doublet velocity field:  u = κ(rx²-ry²)/d⁴,  v = 2κ·rx·ry/d⁴
    const strength = r0 * r0 * influ
    const d4       = d2 * d2
    dx += strength * (rx * rx - ry * ry) / d4
    dy += strength * 2 * rx * ry        / d4

    // Rotational wake from bob velocity — trails behind the creature's motion
    const fo   = falloff(d, r0, r1) * BOB_VELOCITY_COEFF
    const vx_c = c.vx ?? 0
    const vy_c = c.vy ?? 0
    dx +=  vy_c * (rx / d) * fo
    dy -= vx_c  * (ry / d) * fo
  }

  return {
    dx:   Math.max(-clamp, Math.min(clamp, dx)),
    dy:   Math.max(-clamp, Math.min(clamp, dy)),
    mask,
  }
}
