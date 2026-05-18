// CPU-side spring-damper simulation mirroring the GPGPU velocity/position shaders.
// Called once per frame (frame-time deduplication prevents double-advance).
// Both SculptOverlay and CheeseStrings read from groupState after update.

export const GROUP_CENTERS = Array.from({ length: 16 }, (_, i) => ({
  x: Math.floor(i / 4) * 0.5 - 0.75,
  z: (i % 4)           * 0.5 - 0.75,
}))

export const groupState = {
  pos:       new Float32Array(16 * 3),  // XYZ displacement delta from home
  vel:       new Float32Array(16 * 3),
  chopPhase: new Float32Array(16),
}

let _lastTime = -1

export function updateGroupPhysics(time, dt, ep) {
  if (time === _lastTime || !ep) return
  _lastTime = time

  const cdt  = Math.min(dt, 0.05)
  const drag = Math.pow(0.96, cdt * 60)   // matches velocityFragment.js

  const exStr = ep.explodeStrength  ?? 0
  const exMask = ep.explodeGroupMask ?? 65535
  const chAdv  = ep.chopAdvance      ?? 0
  const chMask = ep.chopGroupMask    ?? 0
  const ret    = ep.returnForce      ?? 10
  const sculpt = (ep.sculptMode      ?? 0) > 0.5
  const sRes   = ep.sculptResonance
  const sImp   = ep.sculptImpulse    ?? 4.0

  for (let i = 0; i < 16; i++) {
    const b   = i * 3
    const bit = 1 << i
    const hx  = GROUP_CENTERS[i].x
    const hz  = GROUP_CENTERS[i].z
    const len = Math.sqrt(hx * hx + hz * hz) || 0.001

    // Advance chop phase for groups in chop mask (mirrors stateFragment.js)
    if ((chMask & bit) !== 0 && chAdv > 0)
      groupState.chopPhase[i] = (groupState.chopPhase[i] + chAdv * cdt) % 4.0

    // Chop spring target — mirrors positionFragment.js exactly
    const ph  = Math.floor(groupState.chopPhase[i])
    const cox = ph === 1 ?  0.09 : ph === 2 ? -0.09 : 0
    const coy = ph >= 3  ?  0.09 : 0

    // Spring toward (home + chopOffset) in displacement space
    groupState.vel[b]     += (cox - groupState.pos[b])     * ret * cdt
    groupState.vel[b + 1] += (coy - groupState.pos[b + 1]) * ret * cdt
    groupState.vel[b + 2] += (  0 - groupState.pos[b + 2]) * ret * cdt

    // Explode: outward velocity impulse (XZ only — mirrors velocityFragment.js)
    if ((exMask & bit) !== 0 && exStr > 0.001) {
      groupState.vel[b]     += (hx / len) * exStr * cdt
      groupState.vel[b + 2] += (hz / len) * exStr * cdt
    }

    // Sculpt resonance impulse (outward in XZ)
    if (sculpt && sRes && sRes[i] > 0.001) {
      groupState.vel[b]     += (hx / len) * sRes[i] * sImp * cdt
      groupState.vel[b + 2] += (hz / len) * sRes[i] * sImp * cdt
    }

    // Drag + speed cap (GPU caps at 5.0)
    groupState.vel[b]     *= drag
    groupState.vel[b + 1] *= drag
    groupState.vel[b + 2] *= drag

    const spd = Math.sqrt(
      groupState.vel[b] ** 2 + groupState.vel[b + 1] ** 2 + groupState.vel[b + 2] ** 2
    )
    if (spd > 5.0) {
      const inv = 5.0 / spd
      groupState.vel[b]     *= inv
      groupState.vel[b + 1] *= inv
      groupState.vel[b + 2] *= inv
    }

    // Integrate
    groupState.pos[b]     += groupState.vel[b]     * cdt
    groupState.pos[b + 1] += groupState.vel[b + 1] * cdt
    groupState.pos[b + 2] += groupState.vel[b + 2] * cdt
  }
}
