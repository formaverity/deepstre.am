import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

// Auto-show boxes on the first ever entry to sculpt mode, then auto-hide after 5s
let hasSculptedBefore = false

function GroupBox({ gx, gz, hue, matRef }) {
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

  // Cell center in normalized [-1,1] space
  const cx = gx * 0.5 - 0.75
  const cz = gz * 0.5 - 0.75

  return (
    <lineSegments position={[cx, 0, cz]} geometry={geo}>
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
  const mode      = useMurmurStore(s => s.mode)
  const showGrid  = useMurmurStore(s => s.showGroupGrid)
  const cloud     = useMurmurStore(s => s.cloud)
  const matRefs   = useRef([])
  const autoTimer = useRef(null)

  // Auto-show boxes on first sculpt entry, fade after 5s
  useEffect(() => {
    if (mode === 'sculpt' && !hasSculptedBefore) {
      hasSculptedBefore = true
      useMurmurStore.getState().setShowGroupGrid(true)
      clearTimeout(autoTimer.current)
      autoTimer.current = setTimeout(() => {
        if (useMurmurStore.getState().showGroupGrid) {
          useMurmurStore.getState().setShowGroupGrid(false)
        }
      }, 5000)
    }
    return () => clearTimeout(autoTimer.current)
  }, [mode])

  // Animate each box's opacity toward its resonance-driven target
  useFrame(() => {
    const isVisible = useMurmurStore.getState().showGroupGrid
    if (!isVisible || mode !== 'sculpt') {
      matRefs.current.forEach(mat => {
        if (mat) mat.opacity = Math.max(0, mat.opacity - 0.04)
      })
      return
    }

    const eph = useMurmurStore.getState().effectParamsRef.current
    const res = eph?.sculptResonance

    matRefs.current.forEach((mat, i) => {
      if (!mat) return
      const target = 0.08 + (res ? res[i] * 0.55 : 0)
      mat.opacity += (target - mat.opacity) * 0.1
    })
  })

  if (!cloud?.groupAffinities) return null

  return (
    <group>
      {cloud.groupAffinities.map((aff, i) => {
        const gx = Math.floor(i / 4)
        const gz = i % 4
        return (
          <GroupBox
            key={i}
            gx={gx}
            gz={gz}
            hue={aff.pitchClass * 30}
            matRef={el => { matRefs.current[i] = el }}
          />
        )
      })}
    </group>
  )
}
