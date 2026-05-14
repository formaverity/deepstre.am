import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { useSpatialPanner } from '@/murmur/audio/useSpatialPanner.js'

function buildLine() {
  const posArr = new Float32Array([0, 0, 0, 0, 0, -0.8])
  const geo    = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage))
  const mat  = new THREE.LineBasicMaterial({ color: '#c8d5c0', transparent: true, opacity: 0, depthTest: false })
  return new THREE.Line(geo, mat)
}

export default function SpatialPanner() {
  const dirRef  = useSpatialPanner()
  const lineObj = useRef(null)
  const opacRef = useRef(0)
  if (!lineObj.current) lineObj.current = buildLine()

  useEffect(() => () => {
    lineObj.current?.geometry.dispose()
    lineObj.current?.material.dispose()
  }, [])

  useFrame(() => {
    const state   = useMurmurStore.getState()
    const mode    = state.mode
    const enabled = state.spatialEnabled[mode] ?? false
    const target  = enabled ? 0.05 : 0

    opacRef.current += (target - opacRef.current) * 0.08

    const line = lineObj.current
    if (!line) return

    line.material.opacity = opacRef.current

    const d   = dirRef.current
    const pos = line.geometry.attributes.position
    pos.array[3] = d.x * 0.8
    pos.array[4] = d.y * 0.8
    pos.array[5] = d.z * 0.8
    pos.needsUpdate = true
  })

  return <primitive object={lineObj.current} />
}
