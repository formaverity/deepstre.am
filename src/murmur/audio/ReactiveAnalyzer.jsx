import { useFrame } from '@react-three/fiber'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from './AudioEngine.js'

const IDLE_HZ  = 0.2
const IDLE_AMP = 0.05

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
      // Gentle idle breath so the atmos sphere is never dead
      bass = Math.max(0, IDLE_AMP * Math.sin(2 * Math.PI * IDLE_HZ * t))
    }

    if (u.uBassEnergy)   u.uBassEnergy.value   = bass
    if (u.uMidEnergy)    u.uMidEnergy.value     = (lowMid + highMid) / 2
    if (u.uTrebleEnergy) u.uTrebleEnergy.value  = treble

    // Reset effectParamsRef only when no cloud is loaded (SculptDriver owns it otherwise)
    const store = useMurmurStore.getState()
    if (!store.cloud) {
      store.effectParamsRef.current = {
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
    }
  })
}

export default function ReactiveDriver() {
  const uniforms = useMurmurStore(s => s.uniforms)
  const cloud    = useMurmurStore(s => s.cloud)
  useReactiveDriver({ enabled: !!cloud, uniformsRef: uniforms.ref })
  return null
}
