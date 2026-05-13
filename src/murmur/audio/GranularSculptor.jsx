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

export function useSculptDriver({ enabled }) {
  const frameCount = useRef(0)

  useFrame(() => {
    if (!enabled) return

    const { position: camPos, speed } = useMurmurStore.getState().cameraState

    const r = Math.sqrt(camPos.x ** 2 + camPos.y ** 2 + camPos.z ** 2)
    if (r < 0.001) return

    // Spherical coordinates of the camera
    const azimuth   = Math.atan2(camPos.x, camPos.z)                             // −π..π
    const elevation = Math.asin(THREE.MathUtils.clamp(camPos.y / r, -1, 1))      // −π/2..π/2

    // ── Mappings ────────────────────────────────────────────────────────────

    // Azimuth → buffer position: full orbit = full scrub
    const positionFraction = (azimuth + Math.PI) / (2 * Math.PI)

    // Elevation → playbackRate
    const { elevationToRate } = MAPPING
    const elevNorm    = (elevation + Math.PI / 2) / Math.PI                       // 0..1
    const playbackRate = elevationToRate.low + elevNorm * (elevationToRate.high - elevationToRate.low)

    // Distance → grainSize
    const { near, far, nearDist, farDist } = MAPPING.distanceToGrainSize
    const distT     = THREE.MathUtils.clamp((r - nearDist) / (farDist - nearDist), 0, 1)
    const grainSize = THREE.MathUtils.lerp(near, far, distT)

    // Speed → overlap (stationary = dense, fast motion = sparse)
    const { still, fast, fastThreshold } = MAPPING.speedToOverlap
    const speedT = THREE.MathUtils.clamp(speed / fastThreshold, 0, 1)
    const overlap = THREE.MathUtils.lerp(still, fast, speedT)

    // Detune: subtle pitch colour from rate deviation
    const detune = (playbackRate - 1.0) * MAPPING.detuneCoefficient

    const frozen = useMurmurStore.getState().grainFrozen
    audioEngine.setGrainParams({
      position: frozen ? undefined : positionFraction,
      grainSize, overlap, playbackRate, detune,
    })

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
  const mode = useMurmurStore(s => s.mode)
  useSculptDriver({ enabled: mode === 'sculpt' })
  return null
}
