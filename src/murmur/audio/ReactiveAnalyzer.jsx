import { useFrame } from '@react-three/fiber'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from './AudioEngine.js'

const IDLE_HZ  = 0.2
const IDLE_AMP = 0.05

// NEUTRAL_PARAMS: used when GranularSculptor owns effectParamsRef (always, both modes).
// ReactiveDriver's job is now purely FFT uniform tinting — it no longer drives
// band→effect particle mappings (those are a single visual frame: sculpt).
const NEUTRAL_PARAMS = {
  returnForce:      10.0,
  explodeStrength:  0,  explodeGroupMask:  65535,
  dissolveRate:     0,  dissolveGroupMask: 65535,
  magnifyTarget:    0,  magnifyGroupMask:  65535,
  chopAdvance:      0,  chopGroupMask:     0,
  sculptMode:       0,
  sculptResonance:  null,
  sculptImpulse:    4.0,
  sculptMaxMag:     2.5,
}

export function useReactiveDriver({ enabled, uniformsRef }) {
  useFrame(({ clock }) => {
    if (!enabled || !uniformsRef?.current) return
    const u = uniformsRef.current.uniforms
    const t = clock.getElapsedTime()

    let bass = 0, lowMid = 0, highMid = 0, treble = 0

    if (audioEngine.isAnyAudioActive) {
      const bands = audioEngine.getFFT()
      bass    = bands.bass
      lowMid  = bands.lowMid
      highMid = bands.highMid
      treble  = bands.treble
    } else {
      // Gentle idle breath so the atmos sphere is never completely dead
      bass = Math.max(0, IDLE_AMP * Math.sin(2 * Math.PI * IDLE_HZ * t))
    }

    // Write visual tinting uniforms (drives AudioAtmos + particle color feedback)
    if (u.uBassEnergy)   u.uBassEnergy.value   = bass
    if (u.uMidEnergy)    u.uMidEnergy.value     = (lowMid + highMid) / 2
    if (u.uTrebleEnergy) u.uTrebleEnergy.value  = treble

    // GranularSculptor owns effectParamsRef in both modes; we don't overwrite it.
    // We do reset it here only when the sculpt driver is not running (no cloud loaded).
    const store = useMurmurStore.getState()
    if (!store.cloud) {
      store.effectParamsRef.current = NEUTRAL_PARAMS
    }
  })
}

export default function ReactiveDriver() {
  const uniforms = useMurmurStore(s => s.uniforms)
  // Tinting runs whenever the cloud is present (same lifetime as SculptDriver)
  const cloud    = useMurmurStore(s => s.cloud)
  useReactiveDriver({ enabled: !!cloud, uniformsRef: uniforms.ref })
  return null
}
