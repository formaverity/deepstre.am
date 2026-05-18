import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

const MAX_P = 350

// Each grain: spawns at a cloud point, drifts, fades — bell-curve size envelope
const vertexShader = /* glsl */`
  attribute float aAge;
  attribute float aMaxAge;
  attribute float aSize;
  varying float vT;
  void main() {
    vT = aAge / max(aMaxAge, 0.001);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float env = sin(3.14159265 * vT);
    gl_PointSize = aSize * env * (1.0 / -mv.z);
  }
`

const fragmentShader = /* glsl */`
  varying float vT;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float rim  = 1.0 - smoothstep(0.18, 0.50, d);
    float life = sin(3.14159265 * vT);
    gl_FragColor = vec4(0.85, 0.78, 1.0, rim * life * 0.38);
  }
`

export default function SculptParticles() {
  const mode  = useMurmurStore(s => s.mode)
  const cloud = useMurmurStore(s => s.cloud)

  const poolRef    = useRef([])
  const spawnAccum = useRef(0)

  const posArr    = useMemo(() => new Float32Array(MAX_P * 3), [])
  const ageArr    = useMemo(() => new Float32Array(MAX_P), [])
  const maxAgeArr = useMemo(() => new Float32Array(MAX_P).fill(1), [])
  const sizeArr   = useMemo(() => new Float32Array(MAX_P), [])

  useMemo(() => {
    poolRef.current = Array.from({ length: MAX_P }, () => ({
      alive: false, age: 0, maxAge: 1,
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
    }))
    for (let i = 0; i < MAX_P; i++) posArr[i * 3 + 1] = -9999
  }, [posArr])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posArr,    3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aAge',     new THREE.BufferAttribute(ageArr,    1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aMaxAge',  new THREE.BufferAttribute(maxAgeArr, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSize',    new THREE.BufferAttribute(sizeArr,   1).setUsage(THREE.DynamicDrawUsage))
    return g
  }, [posArr, ageArr, maxAgeArr, sizeArr])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  }), [])

  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])

  useFrame((_, delta) => {
    if (mode !== 'sculpt' || !cloud) return
    const dt = Math.min(delta, 0.05)

    const sp        = useMurmurStore.getState().sculptParams ?? {}
    const grainSize = sp.grainSize ?? 0.05
    const overlap   = sp.overlap   ?? 0.3
    const elevation = sp.elevation ?? 0   // radians, −π/2..π/2
    const speed     = sp.speed     ?? 0   // 0..1 normalised

    // Map audio grain params → particle visual params
    const tGrain    = Math.max(0, Math.min(1, (grainSize - 0.02) / 0.23))
    const lifetime  = 0.5 + tGrain * 2.0          // 0.5–2.5 s  (large grains linger)
    const ptSize    = 12 + tGrain * 20             // 12–32 base screen-px
    const spawnRate = 8 + overlap * 55             // ~8–41 / sec (dense overlap = more grains)
    const scatter   = 0.025 + speed * 0.07         // 0.025–0.095 units/sec

    // Spawn new particles into dead slots
    spawnAccum.current += spawnRate * dt
    let toSpawn = Math.floor(spawnAccum.current)
    spawnAccum.current -= toSpawn

    for (let i = 0; i < MAX_P && toSpawn > 0; i++) {
      const p = poolRef.current[i]
      if (p.alive) continue

      const idx = Math.floor(Math.random() * cloud.count) * 3
      p.x = cloud.positions[idx]
      p.y = cloud.positions[idx + 1]
      p.z = cloud.positions[idx + 2]

      const angle = Math.random() * Math.PI * 2
      const mag   = scatter * (0.4 + Math.random() * 0.6)
      p.vx     = Math.cos(angle) * mag
      p.vy     = Math.sin(angle) * mag + elevation * 0.018  // tilt drift with camera
      p.vz     = (Math.random() - 0.5) * scatter
      p.age    = 0
      p.maxAge = lifetime * (0.5 + Math.random() * 1.0)
      p.alive  = true
      toSpawn--
    }

    // Integrate and write to GPU buffers
    for (let i = 0; i < MAX_P; i++) {
      const p = poolRef.current[i]
      if (!p.alive) {
        posArr[i * 3 + 1] = -9999
        sizeArr[i]        = 0
        continue
      }
      p.age += dt
      if (p.age >= p.maxAge) {
        p.alive           = false
        posArr[i * 3 + 1] = -9999
        sizeArr[i]        = 0
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      posArr[i * 3]     = p.x
      posArr[i * 3 + 1] = p.y
      posArr[i * 3 + 2] = p.z
      ageArr[i]    = p.age
      maxAgeArr[i] = p.maxAge
      sizeArr[i]   = ptSize
    }

    geo.attributes.position.needsUpdate = true
    geo.attributes.aAge.needsUpdate     = true
    geo.attributes.aMaxAge.needsUpdate  = true
    geo.attributes.aSize.needsUpdate    = true
  })

  if (mode !== 'sculpt' || !cloud) return null
  return <points geometry={geo} material={mat} />
}
