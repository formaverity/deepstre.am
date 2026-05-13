import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

export default function CameraRig() {
  const mode            = useMurmurStore(s => s.mode)
  const setCameraState  = useMurmurStore(s => s.setCameraState)
  const cameraTarget    = useMurmurStore(s => s.cameraTarget)
  const cameraResetToken = useMurmurStore(s => s.cameraResetToken)

  const { camera } = useThree()
  const controlsRef  = useRef()
  const lastPos      = useRef(new THREE.Vector3())
  const speedHistory = useRef(new Array(10).fill(0))
  const frameIndex   = useRef(0)
  const targetPosRef = useRef(null)

  // Sync incoming cameraTarget → internal ref so useFrame can lerp without subscribing
  useEffect(() => {
    if (cameraTarget) {
      targetPosRef.current = new THREE.Vector3(cameraTarget.x, cameraTarget.y, cameraTarget.z)
    } else {
      targetPosRef.current = null
    }
  }, [cameraTarget])

  // Reset OrbitControls when token increments
  useEffect(() => {
    if (cameraResetToken === 0) return
    camera.position.set(2, 1.5, 2.5)
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
    useMurmurStore.getState().setCameraTarget(null)
    targetPosRef.current = null
  }, [cameraResetToken, camera])

  useFrame(() => {
    const pos = camera.position

    // ── Lerp toward mode-default position if a target is set ─────────
    if (targetPosRef.current) {
      camera.position.lerp(targetPosRef.current, 0.04)
      if (camera.position.distanceTo(targetPosRef.current) < 0.05) {
        useMurmurStore.getState().setCameraTarget(null)
        targetPosRef.current = null
      }
    }

    // ── Velocity / speed ──────────────────────────────────────────────
    const vel = pos.clone().sub(lastPos.current)
    const speed = vel.length()

    speedHistory.current[frameIndex.current % 10] = speed
    frameIndex.current++
    const smoothedSpeed = speedHistory.current.reduce((a, b) => a + b, 0) / 10

    setCameraState({
      position: { x: pos.x, y: pos.y, z: pos.z },
      velocity: { x: vel.x, y: vel.y, z: vel.z },
      speed:    smoothedSpeed,
    })

    lastPos.current.copy(pos)

    // Sync orbit target → shader uCameraTarget
    const controls = controlsRef.current
    if (controls) {
      const uniforms = useMurmurStore.getState().uniforms.ref
      if (uniforms?.current) {
        uniforms.current.uniforms.uCameraTarget.value.copy(controls.target)
      }
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.1}
      autoRotate={mode !== 'sculpt'}
      autoRotateSpeed={0.3}
      touches={{ ONE: 1, TWO: 2 }}
    />
  )
}
