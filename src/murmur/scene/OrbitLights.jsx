import { useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

// 8 glowing orbs on 4 tilted orbital planes (2 per plane, always diametrically opposite).
// Each pair is tuned to a frequency band and has a matching hue.
//
// Schema: [orbitalRadius, angularSpeed(rad/s), tiltAngle(rad), phase(rad), r, g, b, bandIdx]
//   bandIdx: 0=bass, 1=mid, 2=treble
const ORBS = [
  [1.20, 0.38, 0,             0,            0.68, 0.48, 1.00, 0], // purple pair  — equatorial, bass
  [1.20, 0.38, 0,             Math.PI,      0.68, 0.48, 1.00, 0],
  [1.00, 0.68, Math.PI / 6,  0.50,         0.08, 0.84, 0.58, 1], // teal pair    — 30° tilt, mid
  [1.00, 0.68, Math.PI / 6,  0.50+Math.PI, 0.08, 0.84, 0.58, 1],
  [0.88, 1.08, Math.PI / 3,  1.20,         0.32, 0.52, 1.00, 2], // blue pair    — 60° tilt, treble
  [0.88, 1.08, Math.PI / 3,  1.20+Math.PI, 0.32, 0.52, 1.00, 2],
  [1.38, 0.21, Math.PI * 0.42, 2.10,       1.00, 0.28, 0.07, 0], // orange pair  — near-polar, bass
  [1.38, 0.21, Math.PI * 0.42, 2.10+Math.PI, 1.00, 0.28, 0.07, 0],
]
const N = ORBS.length

// Soft glow: tight bright core + wide faint halo
const vertexShader = /* glsl */`
  attribute vec3  aColor;
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv      = modelViewMatrix * vec4(position, 1.0);
    gl_Position  = projectionMatrix * mv;
    gl_PointSize = aSize / -mv.z;
  }
`

const fragmentShader = /* glsl */`
  varying vec3 vColor;
  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float d    = length(uv);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.04, 0.22, d);
    float halo = 1.0 - smoothstep(0.12, 0.50, d);
    gl_FragColor = vec4(vColor, core * 0.92 + halo * 0.28);
  }
`

export default function OrbitLights() {
  const posArr   = useMemo(() => new Float32Array(N * 3), [])
  const colorArr = useMemo(() => new Float32Array(N * 3), [])
  const sizeArr  = useMemo(() => new Float32Array(N),     [])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posArr,   3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aColor',   new THREE.BufferAttribute(colorArr, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSize',    new THREE.BufferAttribute(sizeArr,  1).setUsage(THREE.DynamicDrawUsage))
    return g
  }, [posArr, colorArr, sizeArr])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  }), [])

  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])

  useFrame(({ clock }) => {
    const t  = clock.getElapsedTime()
    const b  = audioEngine.getFFT()
    const bands = [b.bass, (b.lowMid + b.highMid) * 0.5, b.treble]

    for (let i = 0; i < N; i++) {
      const [r, spd, tilt, phase, cr, cg, cb, band] = ORBS[i]
      const energy = bands[band]
      const θ      = spd * t + phase

      // Circular orbit on a plane tilted by `tilt` around the X axis
      posArr[i * 3]     = r * Math.cos(θ)
      posArr[i * 3 + 1] = r * Math.sin(θ) * Math.sin(tilt)
      posArr[i * 3 + 2] = r * Math.sin(θ) * Math.cos(tilt)

      // Brightness has a 18% floor so orbs are always faintly visible, then
      // flares up to full color on loud hits matching the band.
      const bright       = 0.18 + energy * 0.82
      colorArr[i * 3]     = cr * bright
      colorArr[i * 3 + 1] = cg * bright
      colorArr[i * 3 + 2] = cb * bright

      sizeArr[i] = 30 + energy * 44  // 30..74 base screen-px ÷ distance
    }

    geo.attributes.position.needsUpdate = true
    geo.attributes.aColor.needsUpdate   = true
    geo.attributes.aSize.needsUpdate    = true
  })

  return <points geometry={geo} material={mat} />
}
