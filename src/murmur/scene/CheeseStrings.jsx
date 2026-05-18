import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { GROUP_CENTERS, groupState, updateGroupPhysics } from './groupPhysics.js'

// All 24 shared-edge adjacent pairs in the 4×4 grid
const PAIRS = []
for (let gx = 0; gx < 4; gx++) {
  for (let gz = 0; gz < 4; gz++) {
    if (gx < 3) PAIRS.push([gx * 4 + gz, (gx + 1) * 4 + gz])
    if (gz < 3) PAIRS.push([gx * 4 + gz,  gx * 4 + (gz + 1)])
  }
}

const N_VERTS = PAIRS.length * 2 * 2   // 2 segments × 2 verts × 24 pairs

export default function CheeseStrings() {
  const cloud       = useMurmurStore(s => s.cloud)
  const matRef      = useRef()
  const smoothDisp  = useRef(new Float32Array(16).fill(0))  // per-group XZ disp, lerped
  const phaseRef    = useRef(new Float32Array(PAIRS.length).fill(0))  // accumulated wobble phase per pair

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(N_VERTS * 3), 3)
        .setUsage(THREE.DynamicDrawUsage),
    )
    return g
  }, [])

  useEffect(() => () => geo.dispose(), [geo])

  useFrame((state, delta) => {
    if (!cloud || !matRef.current) return

    const ep = useMurmurStore.getState().effectParamsRef.current
    if (!ep) return

    updateGroupPhysics(state.clock.getElapsedTime(), delta, ep)

    // Smooth per-group XZ displacement magnitude to remove high-frequency jitter
    let maxDisp = 0
    for (let i = 0; i < 16; i++) {
      const b   = i * 3
      const xz  = Math.sqrt(groupState.pos[b] ** 2 + groupState.pos[b + 2] ** 2)
      const mag = Math.sqrt(xz ** 2 + groupState.pos[b + 1] ** 2)
      smoothDisp.current[i] += (xz - smoothDisp.current[i]) * 0.05
      if (mag > maxDisp) maxDisp = mag
    }

    const pos = geo.attributes.position.array

    PAIRS.forEach(([a, b], pi) => {
      const ba = a * 3
      const bb = b * 3

      // Scale XZ displacement down so reactive explode doesn't over-stretch strings;
      // Y is left full since chop lift is already modest.
      const xzScale = 0.4
      const ax = GROUP_CENTERS[a].x + groupState.pos[ba]     * xzScale
      const ay = groupState.pos[ba + 1]
      const az = GROUP_CENTERS[a].z + groupState.pos[ba + 2] * xzScale
      const bx = GROUP_CENTERS[b].x + groupState.pos[bb]     * xzScale
      const by = groupState.pos[bb + 1]
      const bz = GROUP_CENTERS[b].z + groupState.pos[bb + 2] * xzScale

      const mx = (ax + bx) * 0.5
      const mz = (az + bz) * 0.5

      // Wobble: use smoothed XZ displacement so amplitude/freq don't jump
      // Integrate phase with delta to avoid discontinuities as frequency changes
      const da  = smoothDisp.current[a]
      const db  = smoothDisp.current[b]
      const frq = 3.0 + (da + db) * 5.0
      phaseRef.current[pi] = (phaseRef.current[pi] + frq * delta) % (Math.PI * 2)

      const amp = Math.min(0.15, (da + db) * 0.5 * 1.2)
      const my  = (ay + by) * 0.5 + Math.sin(phaseRef.current[pi] + pi * 1.3) * amp

      const base = pi * 12
      pos[base + 0] = ax;  pos[base + 1] = ay; pos[base + 2] = az
      pos[base + 3] = mx;  pos[base + 4] = my; pos[base + 5] = mz
      pos[base + 6] = mx;  pos[base + 7] = my; pos[base + 8] = mz
      pos[base + 9] = bx;  pos[base + 10] = by; pos[base + 11] = bz
    })

    geo.attributes.position.needsUpdate = true

    const targetOp = Math.min(0.42, maxDisp * 1.6)
    matRef.current.opacity += (targetOp - matRef.current.opacity) * 0.07
  })

  if (!cloud) return null

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial
        ref={matRef}
        color="#c8d5c0"
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  )
}
