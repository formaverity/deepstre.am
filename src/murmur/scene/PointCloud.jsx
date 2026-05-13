import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { vertexShader, fragmentShader, makeUniforms } from './pointShader.js'

// Returns the array if any sampled value is above a threshold, otherwise null.
// Handles PLYs that have a color attribute but store it as all-zeros (common in
// LiDAR exports and unlit photogrammetry captures).
function usableColors(colors) {
  if (!colors) return null
  const limit = Math.min(colors.length, 600)
  for (let i = 0; i < limit; i++) {
    if (colors[i] > 0.01) return colors
  }
  return null
}

export default function PointCloud() {
  const cloud         = useMurmurStore(s => s.cloud)
  const setUniformsRef = useMurmurStore(s => s.setUniformsRef)

  const uniforms = useMemo(() => makeUniforms(), [])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  }), [uniforms])

  const matRef = useRef(mat)

  useEffect(() => {
    matRef.current = mat
    setUniformsRef(matRef)
    return () => setUniformsRef(null)
  }, [mat, setUniformsRef])

  const geo = useMemo(() => {
    if (!cloud) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3))
    const colorData = usableColors(cloud.colors)
      ?? new Float32Array(cloud.count * 3).fill(1)
    g.setAttribute('color', new THREE.BufferAttribute(colorData, 3))
    g.computeBoundingSphere()
    return g
  }, [cloud?.id])

  useEffect(() => {
    return () => geo?.dispose()
  }, [geo])

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.getElapsedTime()
  })

  if (!geo) return null

  return <points geometry={geo} material={mat} />
}
