import { useFrame } from '@react-three/fiber'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from './AudioEngine.js'

// 0.2 Hz sine, 0.05 amplitude — cloud breathes gently when idle
const IDLE_HZ = 0.2
const IDLE_AMP = 0.05

export function useReactiveDriver({ enabled, uniformsRef }) {
  useFrame(({ clock }) => {
    if (!enabled || !uniformsRef?.current) return
    const u = uniformsRef.current.uniforms

    if (audioEngine.isAnyAudioActive) {
      const bands = audioEngine.getFFT()
      u.uBassEnergy.value   = bands.bass
      u.uMidEnergy.value    = (bands.lowMid + bands.highMid) / 2
      u.uTrebleEnergy.value = bands.treble
    } else {
      // Idle breath — keep the cloud alive even with no audio
      const t = clock.getElapsedTime()
      u.uBassEnergy.value   = Math.max(0, IDLE_AMP * Math.sin(2 * Math.PI * IDLE_HZ * t))
      u.uMidEnergy.value    = 0
      u.uTrebleEnergy.value = 0
    }
  })
}

export default function ReactiveDriver() {
  const mode    = useMurmurStore(s => s.mode)
  const uniforms = useMurmurStore(s => s.uniforms)
  useReactiveDriver({ enabled: mode === 'reactive' || mode === 'sculpt', uniformsRef: uniforms.ref })
  return null
}
