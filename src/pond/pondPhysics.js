// ── Pond physics tuning constants ────────────────────────────────────────────
// Edit this file to iterate on feel; all values are imported where needed.

export const POND_PHYSICS = {
  cursor: {
    // ── Intensity state machine ──────────────────────────────────────────
    intensityActive:    1.0,    // normalised scale when cursor is moving (0–1)
    intensityIdle:      0.30,   // 30% of active when cursor is stationary
    idleSpeedThreshold: 30,     // world px/s — below this, cursor counts as idle
    idleAfterMs:        200,    // ms of stillness before idle decay begins
    idleDecayMs:        600,    // ms to decay from active → idle intensity
    activeRampMs:       200,    // ms to ramp from idle → active intensity
    leaveDecayMs:       800,    // ms to decay to 0 after cursor leaves viewport
    mobileDecayMs:      1000,   // ms delay before setMouse(inside=false) after touch end
    // ── Wave field ──────────────────────────────────────────────────────
    waveRadius:         100,    // world px — wave influence zone
    waveAmp:            3.0,    // world px — peak displacement at full intensity + speed
    waveK:              0.13,   // rad/px — spatial frequency (cycle ≈ 48 px)
    waveOmega:          2.2,    // rad/s  — temporal frequency (speed ≈ 17 px/s)
    waveVelRef:         300,    // world px/s at which velocity boost saturates
    waveExclusionPx:    20,     // world px beyond blob edge where wave fades to 0
  },
  blob: {
    maxPullPx:      6,    // world px cap on cursor attraction (was 28)
    falloffNearPx:  60,   // world px — full pull inside this radius
    falloffFarPx:   140,  // world px — pull fades to 0 beyond this (was 280)
    attackBase:     0.04, // lerp factor per frame (~250ms) when approaching target
    releaseBase:    0.10, // lerp factor per frame (~100ms) when retreating
    statusAttack: {       // per-status attack factor overrides
      active:   0.05,
      paused:   0.025,
      archival: 0.015,
    },
    statusMult: {         // per-status pull magnitude multiplier
      active:   1.0,
      paused:   0.4,
      archival: 0.2,
    },
  },
  mobile: {
    tapRippleIntensity: 0.4,  // doublet influence for tap ripple
    tapRippleFadeMs:    700,  // ms for tap ripple to fade to zero
    tapRippleRadius:    60,   // world px influence radius for tap ripple
    tapMoveThreshold:   8,    // px — max movement to classify as tap (not drag)
    longPressMs:        500,  // ms hold before long-press hover activates
    longPressHoldMs:    1500, // ms long-press hover persists after touch end
  },
}
