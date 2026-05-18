import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

// Auto-show boxes on the first ever entry to sculpt mode, then auto-hide after 5s
let hasSculptedBefore = false

function GroupBox({ gx, gz, hue, matRef, boxH, boxW, boxD }) {
  const geo = useMemo(() => {
    const box   = new THREE.BoxGeometry(boxW, boxH, boxD)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [boxW, boxH, boxD])
  useEffect(() => () => geo.dispose(), [geo])

  const color = useMemo(
    () => new THREE.Color().setHSL(hue / 360, 0.75, 0.6),
    [hue]
  )

  // Cell center in normalized [-1,1] space (matches group bin computation in loaders.js)
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
  const gestureState = useMurmurStore(s => s.gestureState)
  const showGrid     = useMurmurStore(s => s.showGroupGrid)
  const cloud        = useMurmurStore(s => s.cloud)
  const matRefs      = useRef([])
  const autoTimer    = useRef(null)

  // Auto-show group grid on first touch, fade after 5s
  useEffect(() => {
    if (gestureState === 'touching' && !hasSculptedBefore) {
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
  }, [gestureState])

  // Animate each box's opacity toward its resonance-driven target
  useFrame(() => {
    const isVisible = useMurmurStore.getState().showGroupGrid
    if (!isVisible) {
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

  // Derive box proportions from normalized cloud dimensions
  const normInfo = cloud.normInfo
  const boxH = normInfo
    ? Math.max(0.3, normInfo.origSpan.y * normInfo.scale * 1.1)
    : 2.2
  // Cell width/depth: one quarter of the model's XZ normalized extents
  const boxW = normInfo ? Math.max(0.15, normInfo.origSpan.x * normInfo.scale * 0.25) : 0.5
  const boxD = normInfo ? Math.max(0.15, normInfo.origSpan.z * normInfo.scale * 0.25) : 0.5

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
            boxH={boxH}
            boxW={boxW}
            boxD={boxD}
          />
        )
      })}
    </group>
  )
}
