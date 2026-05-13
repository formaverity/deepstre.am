import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from './AudioEngine.js'

// ── Camera → grain parameter mapping ─────────────────────────────────────────

export const MAPPING = {
  elevationToRate:     { low: 0.6, high: 1.6 },
  distanceToGrainSize: { near: 0.02, far: 0.25, nearDist: 0.5, farDist: 3.0 },
  speedToOverlap:      { still: 0.6, fast: 0.15, fastThreshold: 0.02 },
  detuneCoefficient:   200,
}

// ── Color-to-pitch resonance constants ────────────────────────────────────────

export const COLOR_MAPPING = {
  baseSemitone:       60,    // MIDI C4 = reference
  resonanceThreshold: 0.2,   // below this, no visual response
  impulseScale:       4.0,
  maxMagnify:         2.5,
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function circularDist(a, b) {
  const d = Math.abs(a - b)
  return Math.min(d, 12 - d)
}

function pitchLabel(pitchClass, octaveOffset) {
  const note = NOTE_NAMES[Math.round(((pitchClass % 12) + 12) % 12)]
  const oct  = octaveOffset >= 0 ? `+${octaveOffset}` : `${octaveOffset}`
  return `${note} ${oct}`
}

// Reuse Float32Array across frames — avoids GC churn
const _resonances = new Float32Array(16)

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSculptDriver({ enabled, uniformsRef }) {
  const frameCount = useRef(0)

  useFrame(() => {
    // When not in sculpt mode, decay sculpt shader uniforms and reset resonance
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

    const azimuth   = Math.atan2(camPos.x, camPos.z)
    const elevation = Math.asin(THREE.MathUtils.clamp(camPos.y / r, -1, 1))

    // ── Audio mappings ────────────────────────────────────────────────────────

    const positionFraction = (azimuth + Math.PI) / (2 * Math.PI)

    const { elevationToRate } = MAPPING
    const elevNorm    = (elevation + Math.PI / 2) / Math.PI
    const playbackRate = elevationToRate.low + elevNorm * (elevationToRate.high - elevationToRate.low)

    const { near, far, nearDist, farDist } = MAPPING.distanceToGrainSize
    const distT    = THREE.MathUtils.clamp((r - nearDist) / (farDist - nearDist), 0, 1)
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

    // ── Shader uniforms ───────────────────────────────────────────────────────

    if (uniformsRef?.current) {
      const u = uniformsRef.current.uniforms
      const elevShader  = THREE.MathUtils.clamp(elevation / (Math.PI / 2), -1, 1)
      const distShader  = distT
      const speedShader = speedT
      if (u.uSculptElev)  u.uSculptElev.value  = elevShader
      if (u.uSculptDist)  u.uSculptDist.value  = distShader
      if (u.uSculptSpeed) u.uSculptSpeed.value = speedShader
    }

    // ── Color-affinity resonance → per-group visual response ─────────────────

    const totalSemitones   = Math.log2(playbackRate) * 12 + detune / 100
    const currentPitchClass = ((totalSemitones % 12) + 12) % 12
    const currentOctave     = Math.floor(totalSemitones / 12)

    const store      = useMurmurStore.getState()
    const affinities = store.cloud?.groupAffinities
    let litGroups    = 0

    _resonances.fill(0)
    if (affinities) {
      for (let i = 0; i < 16; i++) {
        const { pitchClass, octave, affinityStrength } = affinities[i]
        const pd = circularDist(currentPitchClass, pitchClass)
        const od = Math.abs(currentOctave - octave)
        const raw = Math.max(0, 1 - (pd / 6 + od / 3)) * affinityStrength
        _resonances[i] = raw > COLOR_MAPPING.resonanceThreshold ? raw : 0
        if (_resonances[i] > 0.3) litGroups++
      }
    }

    // Write sculpt effect params for PointCloud to consume next frame
    store.effectParamsRef.current = {
      returnForce:      10.0,
      explodeStrength:  0,  explodeGroupMask:  0,
      dissolveRate:     0,  dissolveGroupMask: 0,
      magnifyTarget:    0,  magnifyGroupMask:  0,
      chopAdvance:      0,  chopGroupMask:     0,
      sculptMode:       1,
      sculptResonance:  _resonances,
      sculptImpulse:    COLOR_MAPPING.impulseScale,
      sculptMaxMag:     COLOR_MAPPING.maxMagnify,
    }

    // ── Throttled store write (~10 fps) ───────────────────────────────────────

    frameCount.current++
    if (frameCount.current % 6 === 0) {
      store.setSculptParams({
        positionFraction,
        playbackRate,
        grainSize,
        overlap,
        azimuth,
        elevation,
        distance: r,
        speed,
        currentPitch: pitchLabel(currentPitchClass, currentOctave),
        litGroups,
      })
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SculptDriver() {
  const mode     = useMurmurStore(s => s.mode)
  const uniforms = useMurmurStore(s => s.uniforms)
  useSculptDriver({ enabled: mode === 'sculpt', uniformsRef: uniforms.ref })
  return null
}
