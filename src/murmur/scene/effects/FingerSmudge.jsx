import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

// ── Tuning ────────────────────────────────────────────────────────────────────

const SMUDGE = {
  dotCount:    { min: 8, max: 14 },
  radius:      0.15,           // world units — disc spread around touch point
  dotSize:     { min: 5, max: 14 },  // pixels
  bloomMs:     80,             // press → full opacity
  fadeMs:      600,            // release → invisible
  driftAmount: 0.03,           // world units — outward drift during fade
  breathHz:    0.5,            // oscillations per second while held
  breathDepth: 0.10,           // ±10% opacity oscillation
  maxActive:   4,
}

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPos;
  // Perspective-correct: size is in pixels at initial camera distance (~2.2 units)
  gl_PointSize = aSize * (2.2 / max(0.5, -mvPos.z));
}
`

const FRAG = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  if (d > 1.0) discard;
  // Soft ink falloff: feathered edge, denser core
  float edge  = smoothstep(1.0, 0.15, d);
  float inner = 1.0 - d * d;
  float alpha = vAlpha * edge * (0.55 + 0.45 * inner);
  gl_FragColor = vec4(vColor, alpha);
}
`

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkRng(seed) {
  let s = (seed * 2654435761) >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function generateDots(smudge) {
  const rng   = mkRng(smudge.seed)
  const count = SMUDGE.dotCount.min
    + Math.floor(rng() * (SMUDGE.dotCount.max - SMUDGE.dotCount.min + 1))

  const dots = []
  for (let i = 0; i < count; i++) {
    const r     = Math.sqrt(rng()) * SMUDGE.radius
    const theta = rng() * Math.PI * 2
    dots.push({
      ox:         Math.cos(theta) * r,
      oy:         (rng() - 0.5) * SMUDGE.radius * 0.25,  // slight vertical scatter
      oz:         Math.sin(theta) * r,
      size:       SMUDGE.dotSize.min + rng() * (SMUDGE.dotSize.max - SMUDGE.dotSize.min),
      maxOpacity: 0.4  + rng() * 0.5,
      phase:      rng() * Math.PI * 2,
    })
  }
  return dots
}

function buildGeometry(flatDots) {
  const n      = flatDots.length
  const posArr = new Float32Array(n * 3)
  const colArr = new Float32Array(n * 3)
  const szArr  = new Float32Array(n)
  const alArr  = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const d = flatDots[i]
    posArr[i * 3]     = d.wx
    posArr[i * 3 + 1] = d.wy
    posArr[i * 3 + 2] = d.wz
    colArr[i * 3]     = d.r
    colArr[i * 3 + 1] = d.g
    colArr[i * 3 + 2] = d.b
    szArr[i]          = d.size
    alArr[i]          = 0
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aColor',   new THREE.BufferAttribute(colArr, 3))
  geo.setAttribute('aSize',    new THREE.BufferAttribute(szArr,  1))
  geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alArr,  1).setUsage(THREE.DynamicDrawUsage))
  return geo
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FingerSmudge() {
  const smudges      = useMurmurStore(s => s.smudges)
  const removeSmudge = useMurmurStore(s => s.removeSmudge)

  // Three.js objects — live for the component lifetime
  const pointsObj = useRef(null)
  const mat       = useRef(null)
  const geoRef    = useRef(null)

  // Per-smudge dot descriptors keyed by smudge id
  const dotMap  = useRef(new Map())  // id → { dots[], startIdx, count }
  const flatRef = useRef([])         // flat expanded dot list (for geometry rebuild)

  if (!mat.current) {
    mat.current = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      depthTest:      false,
    })
  }
  if (!pointsObj.current) {
    pointsObj.current = new THREE.Points(new THREE.BufferGeometry(), mat.current)
  }

  // Rebuild geometry whenever the smudges array reference changes
  useEffect(() => {
    const newDotMap = new Map()
    const flat      = []

    for (const sm of smudges) {
      const prev = dotMap.current.get(sm.id)
      const dots = prev ? prev.dots : generateDots(sm)
      const startIdx = flat.length
      const { x: cx, y: cy, z: cz } = sm.position
      const { r, g, b }              = sm.color

      for (const dot of dots) {
        flat.push({ ...dot, wx: cx + dot.ox, wy: cy + dot.oy, wz: cz + dot.oz, r, g, b })
      }
      newDotMap.set(sm.id, { dots, startIdx, count: dots.length })
    }

    dotMap.current  = newDotMap
    flatRef.current = flat

    geoRef.current?.dispose()

    if (flat.length === 0) {
      const empty = new THREE.BufferGeometry()
      geoRef.current = empty
      pointsObj.current.geometry = empty
      return
    }

    const geo = buildGeometry(flat)
    geoRef.current = geo
    pointsObj.current.geometry = geo
  }, [smudges])

  // Per-frame animation: bloom / breathe / fade / drift
  useFrame((state) => {
    const geo = geoRef.current
    if (!geo?.attributes?.aAlpha) return

    const now      = Date.now()
    const t        = state.clock.getElapsedTime()
    const alArr    = geo.attributes.aAlpha.array
    const posArr   = geo.attributes.position.array
    const curSmudges = useMurmurStore.getState().smudges

    let dirty = false

    for (const sm of curSmudges) {
      const entry = dotMap.current.get(sm.id)
      if (!entry) continue

      const elapsed  = now - sm.born
      const isDying  = sm.dying != null
      const diedAgo  = isDying ? now - sm.dying : 0

      if (isDying && diedAgo > SMUDGE.fadeMs + 100) {
        // Zero out and schedule removal
        for (let i = 0; i < entry.count; i++) alArr[entry.startIdx + i] = 0
        removeSmudge(sm.id)
        dirty = true
        continue
      }

      const bloomT = Math.min(1, elapsed / SMUDGE.bloomMs)
      const fadeT  = isDying ? Math.min(1, diedAgo / SMUDGE.fadeMs) : 0
      const { x: cx, y: cy, z: cz } = sm.position

      for (let i = 0; i < entry.count; i++) {
        const dot   = entry.dots[i]
        const idx   = entry.startIdx + i
        const breath = isDying
          ? 1
          : 1 + SMUDGE.breathDepth * Math.sin(t * SMUDGE.breathHz * Math.PI * 2 + dot.phase)

        alArr[idx] = Math.max(0, dot.maxOpacity * bloomT * (1 - fadeT) * breath)

        // Outward drift during fade — scale the offset vector
        if (isDying && fadeT > 0) {
          const offLen = Math.sqrt(dot.ox * dot.ox + dot.oz * dot.oz)
          const drift  = fadeT * SMUDGE.driftAmount
          const scale  = offLen > 0.001 ? drift / offLen : 0
          posArr[idx * 3]     = cx + dot.ox + dot.ox * scale
          posArr[idx * 3 + 1] = cy + dot.oy
          posArr[idx * 3 + 2] = cz + dot.oz + dot.oz * scale
        }

        dirty = true
      }
    }

    if (dirty) {
      geo.attributes.aAlpha.needsUpdate    = true
      geo.attributes.position.needsUpdate  = true
    }
  })

  useEffect(() => () => {
    geoRef.current?.dispose()
    mat.current?.dispose()
  }, [])

  return <primitive object={pointsObj.current} />
}
