import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from './AudioEngine.js'

// Drives stereoBalance (Tone.Panner) and binauralPanner (HRTF PannerNode)
// from camera position each frame. Must run inside <Canvas>.
export function useSpatialPanner() {
  const dirRef = useRef(new THREE.Vector3())

  useFrame(() => {
    const state   = useMurmurStore.getState()
    const camPos  = state.cameraState?.position
    if (!camPos) return

    const enabled = state.spatialEnabled ?? true

    const px = camPos.x
    const py = camPos.y
    const pz = camPos.z
    const r  = Math.sqrt(px * px + py * py + pz * pz)
    if (r < 0.001) return

    const azimuth = Math.atan2(px, pz)

    // Stereo balance: camera right → cloud sounds left (matching HRTF source direction)
    const stereo = -Math.sin(azimuth) * 0.7

    // HRTF source position: unit vector pointing FROM camera TOWARD origin, scaled to 2m
    const nx = (-px / r) * 2
    const ny = (-py / r) * 2
    const nz = (-pz / r) * 2

    // Store direction for visual indicator
    dirRef.current.set(nx, ny, nz)

    audioEngine.updateSpatialPan({ stereo, x: nx, y: ny, z: nz, enabled })
  })

  return dirRef
}
