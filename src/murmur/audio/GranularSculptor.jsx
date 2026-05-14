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

// Estimate dominant pitch class from raw FFT array (dB values).
// Searches the pitched range ~130 Hz–4200 Hz (bins 6–97 at 44100/2048 binwidth).
// Returns { pitchClass, octave } or null if no signal found.
function estimatePitchClass(raw) {
  if (!raw || raw.length < 100) return null
  let peakBin = -1, peakVal = -Infinity
  for (let i = 6; i <= 97; i++) {
    if (raw[i] > peakVal) { peakVal = raw[i]; peakBin = i }
  }
  if (peakBin < 0 || peakVal < -55) return null  // below noise floor

  // Approximate: bin frequency = bin * sampleRate / fftPoints
  // fftPoints ≈ 2048 for a 1024-bin analyser at 44100 Hz → ~21.5 Hz/bin
  const freq = peakBin * (44100 / 2048)
  if (freq < 20) return null

  const midi       = 12 * Math.log2(freq / 440) + 69
  const pitchClass = ((Math.round(midi) % 12) + 12) % 12
  const octave     = Math.floor(Math.round(midi) / 12) - 5
  return { pitchClass, octave }
}

// Reuse Float32Array across frames — avoids GC churn
const _resonances = new Float32Array(16)

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSculptDriver({ enabled, uniformsRef }) {
  const frameCount = useRef(0)

  useFrame(() => {
    // When sculpt is disabled (e.g. cloud not yet loaded), decay shader uniforms
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

    const mode = useMurmurStore.getState().mode

    let currentPitchClass = 0
    let currentOctave     = 0
    let resonanceScale    = 1.0
    let hudData           = {}

    if (mode === 'interactive') {
      // ── Camera → grain params ──────────────────────────────────────────────

      const positionFraction = (azimuth + Math.PI) / (2 * Math.PI)

      const { elevationToRate } = MAPPING
      const elevNorm     = (elevation + Math.PI / 2) / Math.PI
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

      // Shader uniforms
      if (uniformsRef?.current) {
        const u = uniformsRef.current.uniforms
        const elevShader  = THREE.MathUtils.clamp(elevation / (Math.PI / 2), -1, 1)
        const distShader  = distT
        const speedShader = speedT
        if (u.uSculptElev)  u.uSculptElev.value  = elevShader
        if (u.uSculptDist)  u.uSculptDist.value  = distShader
        if (u.uSculptSpeed) u.uSculptSpeed.value = speedShader
      }

      // Camera-derived pitch class for resonance
      const totalSemitones = Math.log2(playbackRate) * 12 + detune / 100
      currentPitchClass    = ((totalSemitones % 12) + 12) % 12
      currentOctave        = Math.floor(totalSemitones / 12)
      resonanceScale       = 1.0

      hudData = {
        positionFraction,
        playbackRate,
        grainSize,
        overlap,
        azimuth,
        elevation,
        distance: r,
        speed,
        currentPitch: pitchLabel(currentPitchClass, currentOctave),
      }
    } else {
      // ── PLAYBACK: FFT-derived pitch class for resonance ───────────────────

      const fft = audioEngine.getFFT()
      const pc  = estimatePitchClass(fft.raw)
      if (pc !== null) {
        currentPitchClass = pc.pitchClass
        currentOctave     = pc.octave
      }
      resonanceScale = 0.5

      hudData = {
        currentPitch: pc ? pitchLabel(currentPitchClass, currentOctave) : null,
      }
    }

    // ── Color-affinity resonance → per-group visual response (both modes) ──

    const store      = useMurmurStore.getState()
    const affinities = store.cloud?.groupAffinities
    let litGroups    = 0

    _resonances.fill(0)
    if (affinities) {
      for (let i = 0; i < 16; i++) {
        const { pitchClass, octave, affinityStrength } = affinities[i]
        const pd  = circularDist(currentPitchClass, pitchClass)
        const od  = Math.abs(currentOctave - octave)
        const raw = Math.max(0, 1 - (pd / 6 + od / 3)) * affinityStrength
        _resonances[i] = raw > COLOR_MAPPING.resonanceThreshold ? raw : 0
        if (_resonances[i] > 0.3) litGroups++
      }
    }

    store.effectParamsRef.current = {
      returnForce:      10.0,
      explodeStrength:  0,  explodeGroupMask:  0,
      dissolveRate:     0,  dissolveGroupMask: 0,
      magnifyTarget:    0,  magnifyGroupMask:  0,
      chopAdvance:      0,  chopGroupMask:     0,
      sculptMode:       1,
      sculptResonance:  _resonances,
      sculptImpulse:    COLOR_MAPPING.impulseScale * resonanceScale,
      sculptMaxMag:     COLOR_MAPPING.maxMagnify  * resonanceScale,
    }

    // Throttled store write (~10 fps)
    frameCount.current++
    if (frameCount.current % 6 === 0) {
      store.setSculptParams({ ...hudData, litGroups })
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SculptDriver() {
  const cloud    = useMurmurStore(s => s.cloud)
  const uniforms = useMurmurStore(s => s.uniforms)
  // Sculpt visual frame is always active once a cloud is loaded
  useSculptDriver({ enabled: !!cloud, uniformsRef: uniforms.ref })
  return null
}
