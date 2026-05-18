import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from './AudioEngine.js'
import { mappingEngine } from './mappingEngine.js'

// ── Color-to-pitch resonance constants ────────────────────────────────────────

export const COLOR_MAPPING = {
  baseSemitone:       60,
  resonanceThreshold: 0.15,
  impulseScale:       10.0,
  maxMagnify:         5.0,
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function circularDist(a, b) {
  const d = Math.abs(a - b)
  return Math.min(d, 12 - d)
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

// Estimate dominant pitch class from raw FFT array (dB values).
function estimatePitchClass(raw) {
  if (!raw || raw.length < 100) return null
  let peakBin = -1, peakVal = -Infinity
  for (let i = 6; i <= 97; i++) {
    if (raw[i] > peakVal) { peakVal = raw[i]; peakBin = i }
  }
  if (peakBin < 0 || peakVal < -55) return null

  const freq = peakBin * (44100 / 2048)
  if (freq < 20) return null

  const midi       = 12 * Math.log2(freq / 440) + 69
  const pitchClass = ((Math.round(midi) % 12) + 12) % 12
  const octave     = Math.floor(Math.round(midi) / 12) - 5
  return { pitchClass, octave }
}

const _resonances = new Float32Array(16)

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSculptDriver({ enabled, uniformsRef }) {
  useFrame(() => {
    if (!enabled) {
      if (uniformsRef?.current) {
        const u = uniformsRef.current.uniforms
        if (u.uSculptElev)  u.uSculptElev.value  *= 0.88
        if (u.uSculptDist)  u.uSculptDist.value  *= 0.88
        if (u.uSculptSpeed) u.uSculptSpeed.value *= 0.88
      }
      return
    }

    const store         = useMurmurStore.getState()
    const gestureState  = store.gestureState
    const isPlaying     = store.isPlayingPassive
    const camPos        = store.cameraState.position
    const speed         = store.cameraState.speed

    // ── Gesture-driven source switching ─────────────────────────────────────
    if (gestureState === 'touching' && audioEngine.buffer) {
      // Auto-start passive playback on first touch — instrument wakes when played
      if (!isPlaying) store.setIsPlayingPassive(true)
      if (audioEngine.activeSource !== 'grain') {
        audioEngine.setActiveSource('grain')
      }
    } else if (gestureState === 'idle') {
      if (isPlaying && audioEngine.buffer) {
        if (audioEngine.activeSource !== 'player') {
          audioEngine.setActiveSource('player')
        }
      } else if (!isPlaying) {
        if (audioEngine.activeSource !== null && audioEngine.activeSource !== 'grain') {
          audioEngine.setActiveSource(null)
        }
        // If grain was active but we released touch with no passive play,
        // stop grain after syncing position
        if (audioEngine.activeSource === 'grain') {
          audioEngine.setActiveSource(null)
        }
      }
    }

    // ── Camera spherical coords ──────────────────────────────────────────────
    const r = Math.sqrt(camPos.x ** 2 + camPos.y ** 2 + camPos.z ** 2)
    if (r < 0.001) return

    const azimuth   = Math.atan2(camPos.x, camPos.z)            // -π..π
    const elevation = Math.asin(THREE.MathUtils.clamp(camPos.y / r, -1, 1))

    let currentPitchClass = 0
    let currentOctave     = 0
    let resonanceScale    = 1.0

    if (gestureState === 'touching') {
      // ── Orbital → grain params ─────────────────────────────────────────────

      // Buffer position: azimuth wraps once around the audio file
      const bufferFraction = (azimuth + Math.PI) / (2 * Math.PI)   // 0..1

      // Playback rate: linear tilt-to-pitch (0.6..1.6) — consistent feel across the range
      const elevNorm     = (elevation + Math.PI / 2) / Math.PI      // 0..1
      const playbackRate = 0.6 + elevNorm * 1.0                     // 0.6..1.6

      // Grain size: full range — close orbit = tight texture, far = phrase-length grabs
      const grainSize = THREE.MathUtils.lerp(0.02, 0.4, smoothstep(0.5, 3.0, r))

      // Overlap: wider range for more expressive density sweep
      const overlap = THREE.MathUtils.lerp(0.75, 0.08, smoothstep(0, 0.04, speed))

      // Detune: smooth pitch shift as cents offset
      const detune = (playbackRate - 1.0) * 200   // ±cents

      audioEngine.setGrainParams({ position: bufferFraction, grainSize, overlap, playbackRate, detune })

      // Shader sculpt uniforms
      if (uniformsRef?.current) {
        const u = uniformsRef.current.uniforms
        const elevShader  = THREE.MathUtils.clamp(elevation / (Math.PI / 2), -1, 1)
        const distShader  = smoothstep(0.6, 3.5, r)
        const speedShader = smoothstep(0, 0.05, speed)
        if (u.uSculptElev)  u.uSculptElev.value  = elevShader
        if (u.uSculptDist)  u.uSculptDist.value  = distShader
        if (u.uSculptSpeed) u.uSculptSpeed.value = speedShader
      }

      // Pitch class from playback rate + detune for color resonance
      const totalSt     = Math.log2(playbackRate) * 12 + detune / 100
      currentPitchClass = ((totalSt % 12) + 12) % 12
      currentOctave     = Math.floor(totalSt / 12)
      resonanceScale    = 1.0

    } else {
      // ── Idle: FFT-derived pitch class ────────────────────────────────────
      if (uniformsRef?.current) {
        const u = uniformsRef.current.uniforms
        if (u.uSculptElev)  u.uSculptElev.value  *= 0.92
        if (u.uSculptDist)  u.uSculptDist.value  *= 0.92
        if (u.uSculptSpeed) u.uSculptSpeed.value *= 0.92
      }

      const fft = audioEngine.getFFT()
      const pc  = estimatePitchClass(fft.raw)
      if (pc !== null) {
        currentPitchClass = pc.pitchClass
        currentOctave     = pc.octave
      }
      resonanceScale = 0.8

      // Update mapping drift from live FFT
      mappingEngine.updateDrift(fft)
    }

    // ── Color-affinity resonance → per-group visual response ────────────────

    const affinities = store.cloud?.groupAffinities
    _resonances.fill(0)
    if (affinities) {
      for (let i = 0; i < 16; i++) {
        const { pitchClass, octave, affinityStrength } = affinities[i]
        const pd  = circularDist(currentPitchClass, pitchClass)
        const od  = Math.abs(currentOctave - octave)
        const raw = Math.max(0, 1 - (pd / 6 + od / 3)) * affinityStrength
        _resonances[i] = raw > COLOR_MAPPING.resonanceThreshold ? raw : 0
      }
    }

    // Build a group mask from regions above resonance threshold so magnify
    // targets the specific spatial zones that tonally match the current audio
    let resonantMask = 0
    let maxResonance = 0
    for (let i = 0; i < 16; i++) {
      if (_resonances[i] > 0.15) resonantMask |= (1 << i)
      if (_resonances[i] > maxResonance) maxResonance = _resonances[i]
    }

    // ── Effect params from algorithmic mapping ───────────────────────────────

    const mapping = mappingEngine.getCurrentMapping()
    const fft     = audioEngine.getFFT()
    const fftMap  = { bass: fft.bass, lowMid: fft.lowMid, highMid: fft.highMid, treble: fft.treble }

    const baseMagnify = mapping.magnify.strength * (fftMap[mapping.magnify.band] ?? 0)

    store.effectParamsRef.current = {
      returnForce:      16.0,
      explodeStrength:  mapping.explode.strength  * (fftMap[mapping.explode.band]  ?? 0),
      explodeGroupMask: mapping.explode.groupMask,
      dissolveRate:     mapping.dissolve.strength * (fftMap[mapping.dissolve.band] ?? 0),
      dissolveGroupMask: mapping.dissolve.groupMask,
      // Resonating groups get targeted by the FFT-driven magnify in addition to sculpt resonance
      magnifyTarget:    baseMagnify + maxResonance * 0.6,
      magnifyGroupMask: resonantMask || mapping.magnify.groupMask,
      chopAdvance:      mapping.chop.strength     * (fftMap[mapping.chop.band]     ?? 0),
      chopGroupMask:    mapping.chop.groupMask,
      sculptMode:       1,
      sculptResonance:  _resonances,
      sculptImpulse:    COLOR_MAPPING.impulseScale * resonanceScale,
      sculptMaxMag:     COLOR_MAPPING.maxMagnify   * resonanceScale,
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SculptDriver() {
  const cloud    = useMurmurStore(s => s.cloud)
  const uniforms = useMurmurStore(s => s.uniforms)
  useSculptDriver({ enabled: !!cloud, uniformsRef: uniforms.ref })
  return null
}
