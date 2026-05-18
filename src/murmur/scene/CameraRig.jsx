import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

function computeCloudCameraPos(normInfo) {
  if (!normInfo?.origSpan) return new THREE.Vector3(2, 1.5, 2.5)
  const { origSpan } = normInfo
  const maxSpan = Math.max(origSpan.x, origSpan.y, origSpan.z, 1e-6)
  const sX = origSpan.x / maxSpan
  const sY = origSpan.y / maxSpan
  const sZ = origSpan.z / maxSpan
  // phi: angle from Y axis — flat models get high overhead view, tall get side view
  const phi   = 0.3 + sY * 0.75          // 0.3 rad (17°) flat → 1.05 rad (60°) tall
  const theta = sX > sZ * 1.4 ? Math.PI / 2 : Math.PI / 4  // face the wide side
  const r = 3.2
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

export default function CameraRig() {
  const setCameraState   = useMurmurStore(s => s.setCameraState)
  const cameraTarget     = useMurmurStore(s => s.cameraTarget)
  const cameraResetToken = useMurmurStore(s => s.cameraResetToken)
  const setGestureState  = useMurmurStore(s => s.setGestureState)
  const cloud            = useMurmurStore(s => s.cloud)

  const { camera, gl } = useThree()
  const controlsRef  = useRef()
  const lastPos      = useRef(new THREE.Vector3())
  const speedHistory = useRef(new Array(10).fill(0))
  const frameIndex   = useRef(0)
  const targetPosRef = useRef(null)

  useEffect(() => {
    if (cameraTarget) {
      targetPosRef.current = new THREE.Vector3(cameraTarget.x, cameraTarget.y, cameraTarget.z)
    } else {
      targetPosRef.current = null
    }
  }, [cameraTarget])

  // Auto-position camera when a new cloud loads, respecting its aspect ratio
  useEffect(() => {
    if (!cloud?.normInfo) return
    const newPos = computeCloudCameraPos(cloud.normInfo)
    camera.position.copy(newPos)
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
    targetPosRef.current = null
  }, [cloud?.id, camera])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cameraResetToken === 0) return
    const newPos = computeCloudCameraPos(useMurmurStore.getState().cloud?.normInfo)
    camera.position.copy(newPos)
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
    useMurmurStore.getState().setCameraTarget(null)
    targetPosRef.current = null
  }, [cameraResetToken, camera])

  // ── Gesture state from OrbitControls events ──────────────────────────────
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    const onStart = () => useMurmurStore.getState().setGestureState('touching')
    const onEnd   = () => {
      // Pointer may still be held even after orbit ends — only go idle if truly up.
      // We rely on the canvas pointer handlers below for the definitive idle signal.
      useMurmurStore.getState().setGestureState('idle')
    }

    controls.addEventListener('start', onStart)
    controls.addEventListener('end',   onEnd)
    return () => {
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end',   onEnd)
    }
  })   // re-runs after each render so controlsRef.current is always populated

  // ── Gesture state from raw canvas pointer events ─────────────────────────
  useEffect(() => {
    const canvas = gl.domElement

    const onDown   = () => {
      useMurmurStore.getState().setGestureState('touching')
      // Resume AudioContext on every canvas gesture — required before any audio starts
      audioEngine.start().catch(() => {})
    }
    const onUp     = () => useMurmurStore.getState().setGestureState('idle')

    canvas.addEventListener('pointerdown',   onDown)
    canvas.addEventListener('pointerup',     onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave',  onUp)

    return () => {
      canvas.removeEventListener('pointerdown',   onDown)
      canvas.removeEventListener('pointerup',     onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave',  onUp)
    }
  }, [gl])

  useFrame(() => {
    const pos = camera.position

    // Lerp toward target position if set
    if (targetPosRef.current) {
      camera.position.lerp(targetPosRef.current, 0.04)
      if (camera.position.distanceTo(targetPosRef.current) < 0.05) {
        useMurmurStore.getState().setCameraTarget(null)
        targetPosRef.current = null
      }
    }

    // Velocity / speed
    const vel   = pos.clone().sub(lastPos.current)
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
      autoRotate={false}
      minDistance={0.2}
      maxDistance={7}
      touches={{ ONE: 1, TWO: 2 }}
    />
  )
}
