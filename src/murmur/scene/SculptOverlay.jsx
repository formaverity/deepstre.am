import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { GROUP_CENTERS, groupState, updateGroupPhysics } from './groupPhysics.js'

function GroupBox({ hue, matRef }) {
  const geo = useMemo(() => {
    const box   = new THREE.BoxGeometry(0.5, 3.0, 0.5)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [])
  useEffect(() => () => geo.dispose(), [geo])

  const color = useMemo(
    () => new THREE.Color().setHSL(hue / 360, 0.75, 0.6),
    [hue]
  )

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={0.08}
        depthWrite={false}
      />
    </lineSegments>
  )
}

export default function SculptOverlay() {
  const cloud    = useMurmurStore(s => s.cloud)
  const matRefs  = useRef([])
  const wrapRefs = useRef([])

  useFrame((state, delta) => {
    const store    = useMurmurStore.getState()
    const isSculpt = store.mode === 'sculpt'
    const gridOn   = store.showGroupGrid
    const ep       = store.effectParamsRef.current
    const res      = ep?.sculptResonance

    updateGroupPhysics(state.clock.getElapsedTime(), delta, ep)

    for (let i = 0; i < 16; i++) {
      const wrap = wrapRefs.current[i]
      if (wrap) {
        const b = i * 3
        wrap.position.set(
          GROUP_CENTERS[i].x + groupState.pos[b],
          groupState.pos[b + 1],
          GROUP_CENTERS[i].z + groupState.pos[b + 2],
        )
      }

      const mat = matRefs.current[i]
      if (!mat) continue
      const target = (isSculpt && gridOn)
        ? 0.10 + (res ? res[i] * 0.45 : 0)
        : 0.04
      mat.opacity += (target - mat.opacity) * 0.08
    }
  })

  if (!cloud?.groupAffinities) return null

  return (
    <group>
      {cloud.groupAffinities.map((aff, i) => (
        <group key={i} ref={el => { wrapRefs.current[i] = el }}>
          <GroupBox
            hue={aff.pitchClass * 30}
            matRef={el => { matRefs.current[i] = el }}
          />
        </group>
      ))}
    </group>
  )
}
