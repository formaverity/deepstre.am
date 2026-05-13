import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from './AudioEngine.js'

// ── Tunable mapping constants ─────────────────────────────────────────────
// Edit these to change how camera motion maps to grain parameters.

export const MAPPING = {
  // Elevation angle → playbackRate: looking down = slow, up = fast
  elevationToRate: { low: 0.6, high: 1.6 },

  // Camera distance → grain size: close = tiny grains (texture), far = long grains (phrases)
  distanceToGrainSize: { near: 0.02, far: 0.25, nearDist: 0.5, farDist: 3.0 },

  // Smoothed camera speed → overlap density: still = lush, fast = sparse/stuttery
  speedToOverlap: { still: 0.6, fast: 0.15, fastThreshold: 0.02 },

  // Detune in cents per unit of (playbackRate − 1.0) — keeps pitch shifts organic
  detuneCoefficient: 200,
}

// ── Hook (must run inside R3F Canvas via useFrame) ────────────────────────

export function useSculptDriver({ enabled, uniformsRef }) {
  const frameCount = useRef(0)

  useFrame(() => {
    // When not in sculpt mode, decay sculpt shader uniforms back to 0
    if (!enabled) {
      if (uniformsRef?.current) {
        const u = uniformsRef.current.uniforms
        if (u.uSculptElev)  u.uSculptElev.value  = u.uSculptElev.value  * 0.88
        if (u.uSculptDist)  u.uSculptDist.value  = u.uSculptDist.value  * 0.88
        if (u.uSculptSpeed) u.uSculptSpeed.value = u.uSculptSpeed.value * 0.88
      }
      return
    }

    const { position: camPos, speed } = useMurmurStore.getState().cameraState

    const r = Math.sqrt(camPos.x ** 2 + camPos.y ** 2 + camPos.z ** 2)
    if (r < 0.001) return

    // Spherical coordinates of the camera
    const azimuth   = Math.atan2(camPos.x, camPos.z)                             // −π..π
    const elevation = Math.asin(THREE.MathUtils.clamp(camPos.y / r, -1, 1))      // −π/2..π/2

    // ── Audio mappings ───────────────────────────────────────────────────────

    const positionFraction = (azimuth + Math.PI) / (2 * Math.PI)

    const { elevationToRate } = MAPPING
    const elevNorm    = (elevation + Math.PI / 2) / Math.PI                       // 0..1
    const playbackRate = elevationToRate.low + elevNorm * (elevationToRate.high - elevationToRate.low)

    const { near, far, nearDist, farDist } = MAPPING.distanceToGrainSize
    const distT     = THREE.MathUtils.clamp((r - nearDist) / (farDist - nearDist), 0, 1)
    const grainSize = THREE.MathUtils.lerp(near, far, distT)

    const { still, fast, fastThreshold } = MAPPING.speedToOverlap
    const speedT = THREE.MathUtils.clamp(speed / fastThreshold, 0, 1)
    const overlap = THREE.MathUtils.lerp(still, fast, speedT)

    const detune = (playbackRate - 1.0) * MAPPING.detuneCoefficient

    const frozen = useMurmurStore.getState().grainFrozen
    audioEngine.setGrainParams({
      position: frozen ? undefined : positionFraction,
      grainSize, overlap, playbackRate, detune,
    })

    // ── Shader uniforms — spatial visual feedback ────────────────────────────
    if (uniformsRef?.current) {
      const u = uniformsRef.current.uniforms
      // elevation: -1 (looking down) to +1 (looking up)
      const elevShader = THREE.MathUtils.clamp(elevation / (Math.PI / 2), -1, 1)
      // distance: 0 (near) to 1 (far), using same near/far as grainSize mapping
      const distShader = distT
      // speed: 0 (still) to 1 (fast), using same threshold
      const speedShader = speedT

      if (u.uSculptElev)  u.uSculptElev.value  = elevShader
      if (u.uSculptDist)  u.uSculptDist.value  = distShader
      if (u.uSculptSpeed) u.uSculptSpeed.value = speedShader
    }

    // Throttle store writes to ~10 fps — HUD doesn't need 60 fps updates
    frameCount.current++
    if (frameCount.current % 6 === 0) {
      useMurmurStore.getState().setSculptParams({
        positionFraction,
        playbackRate,
        grainSize,
        overlap,
        azimuth,
        elevation,
        distance: r,
        speed,
      })
    }
  })
}

// ── Component (sibling inside Canvas, like ReactiveDriver) ────────────────

export default function SculptDriver() {
  const mode     = useMurmurStore(s => s.mode)
  const uniforms = useMurmurStore(s => s.uniforms)
  useSculptDriver({ enabled: mode === 'sculpt', uniformsRef: uniforms.ref })
  return null
}
