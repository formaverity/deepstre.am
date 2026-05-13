import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { vertexShader, fragmentShader, makeUniforms } from './pointShader.js'

export default function PointCloud() {
  const cloud         = useMurmurStore(s => s.cloud)
  const setUniformsRef = useMurmurStore(s => s.setUniformsRef)

  const uniforms = useMemo(() => makeUniforms(), [])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent:  true,
    blending:     THREE.AdditiveBlending,
    depthWrite:   false,
    vertexColors: true,
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
    if (cloud.colors) {
      g.setAttribute('color', new THREE.BufferAttribute(cloud.colors, 3))
    }
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
