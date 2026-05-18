import { useFrame } from '@react-three/fiber'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from './AudioEngine.js'

const IDLE_HZ  = 0.2
const IDLE_AMP = 0.05

export const EFFECTS = {
  explode:  { impulseScale: 30.0 },
  dissolve: { fadeRate: 4.0      },
  magnify:  { maxScale: 2.5      },  // state.b stays 0..1; vertex shader multiplies by 5
  chop:     { phaseAdvance: 8.0  },
}

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
  useFrame(({ clock }, delta) => {
    if (!enabled || !uniformsRef?.current) return
    const u  = uniformsRef.current.uniforms
    const t  = clock.getElapsedTime()
    const dt = Math.min(delta, 0.1)

    let bass = 0, lowMid = 0, highMid = 0, treble = 0

    if (audioEngine.isAnyAudioActive) {
      const bands = audioEngine.getFFT()
      bass    = bands.bass
      lowMid  = bands.lowMid
      highMid = bands.highMid
      treble  = bands.treble
    } else {
      bass = Math.max(0, IDLE_AMP * Math.sin(2 * Math.PI * IDLE_HZ * t))
    }

    // Write visual tinting uniforms (fragment shader color feedback)
    if (u.uBassEnergy)   u.uBassEnergy.value   = bass
    if (u.uMidEnergy)    u.uMidEnergy.value     = (lowMid + highMid) / 2
    if (u.uTrebleEnergy) u.uTrebleEnergy.value  = treble

    // Compute GPGPU effect params from mappings, but only in reactive mode.
    // In sculpt mode the visual tinting above still runs; GPGPU stays neutral.
    const store = useMurmurStore.getState()
    if (store.mode !== 'reactive') {
      store.effectParamsRef.current = NEUTRAL_PARAMS
      return
    }

    const { mappings, effectParamsRef } = store
    const sens = store.sensitivity ?? 1.0
    const amp  = (v) => Math.min(2.0, v * sens)
    const E = { bass: amp(bass), lowMid: amp(lowMid), highMid: amp(highMid), treble: amp(treble), none: 0 }

    const explodeE  = (E[mappings.explode.band]  ?? 0) * mappings.explode.strength
    const dissolveE = (E[mappings.dissolve.band] ?? 0) * mappings.dissolve.strength
    const magnifyE  = (E[mappings.magnify.band]  ?? 0) * mappings.magnify.strength
    const chopE     = (E[mappings.chop.band]     ?? 0) * mappings.chop.strength

    // Weaken spring return on loud bass hits so particles actually fly
    const returnForce = Math.max(1.5, 10.0 * (1.0 - explodeE * 0.72))

    // Opacity follows sensitivity so dark clouds appear brighter at higher settings
    if (u.uOpacity) u.uOpacity.value = Math.max(0.15, Math.min(0.95, 0.50 + (sens - 1.0) * 0.14))

    effectParamsRef.current = {
      returnForce,
      explodeStrength:   explodeE  * EFFECTS.explode.impulseScale,
      explodeGroupMask:  mappings.explode.groupMask,
      dissolveRate:      dissolveE * EFFECTS.dissolve.fadeRate,
      dissolveGroupMask: mappings.dissolve.groupMask,
      magnifyTarget:     magnifyE  * EFFECTS.magnify.maxScale,
      magnifyGroupMask:  mappings.magnify.groupMask,
      chopAdvance:       chopE     * EFFECTS.chop.phaseAdvance,
      chopGroupMask:     mappings.chop.groupMask,
      sculptMode:        0,
      sculptResonance:   null,
      sculptImpulse:     4.0,
      sculptMaxMag:      2.5,
    }
  })
}

export default function ReactiveDriver() {
  const mode     = useMurmurStore(s => s.mode)
  const uniforms = useMurmurStore(s => s.uniforms)
  useReactiveDriver({ enabled: mode === 'reactive' || mode === 'sculpt', uniformsRef: uniforms.ref })
  return null
}
