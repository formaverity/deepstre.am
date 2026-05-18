import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

const MAX_P = 350

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
  const gestureState = useMurmurStore(s => s.gestureState)
  const cloud        = useMurmurStore(s => s.cloud)

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
    if (gestureState !== 'touching' || !cloud) {
      // Kill all particles when not in granular mode
      for (let i = 0; i < MAX_P; i++) {
        if (poolRef.current[i]?.alive) {
          poolRef.current[i].alive = false
          posArr[i * 3 + 1] = -9999
          sizeArr[i] = 0
        }
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.aSize.needsUpdate    = true
      return
    }

    const dt = Math.min(delta, 0.05)

    // Derive grain visual params from camera state (same source as GranularSculptor)
    const { position: camPos, speed } = useMurmurStore.getState().cameraState
    const r = Math.sqrt(camPos.x ** 2 + camPos.y ** 2 + camPos.z ** 2) || 1
    const elevation = Math.asin(THREE.MathUtils.clamp(camPos.y / r, -1, 1))

    const grainT    = Math.max(0, Math.min(1, (r - 0.6) / (3.5 - 0.6)))
    const grainSize = 0.02 + grainT * (0.30 - 0.02)
    const overlap   = 0.6 - Math.max(0, Math.min(1, speed / 0.05)) * 0.45

    const tGrain    = Math.max(0, Math.min(1, (grainSize - 0.02) / 0.28))
    const lifetime  = 0.5 + tGrain * 2.0
    const ptSize    = 12 + tGrain * 20
    const spawnRate = 8 + overlap * 55
    const scatter   = 0.025 + speed * 0.07

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
      p.vy     = Math.sin(angle) * mag + elevation * 0.018
      p.vz     = (Math.random() - 0.5) * scatter
      p.age    = 0
      p.maxAge = lifetime * (0.5 + Math.random() * 1.0)
      p.alive  = true
      toSpawn--
    }

    for (let i = 0; i < MAX_P; i++) {
      const p = poolRef.current[i]
      if (!p.alive) { posArr[i * 3 + 1] = -9999; sizeArr[i] = 0; continue }
      p.age += dt
      if (p.age >= p.maxAge) {
        p.alive = false; posArr[i * 3 + 1] = -9999; sizeArr[i] = 0; continue
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
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

  if (!cloud) return null
  return <points geometry={geo} material={mat} />
}
