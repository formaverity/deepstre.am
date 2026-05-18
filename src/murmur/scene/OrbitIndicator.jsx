import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

// Fresnel rim glow — only the silhouette edge lights up, center stays transparent.
// Combined with DitherBleed's ink-bleed, the rim smears into a soft atmospheric haze.
const vertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal  = normalize(normalMatrix * normal);
    vec4 mv  = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */`
  uniform float uOpacity;
  varying vec3  vNormal;
  varying vec3  vViewDir;
  void main() {
    float rim   = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
    float alpha = pow(rim, 3.2) * uOpacity;
    gl_FragColor = vec4(0.78, 0.84, 0.75, alpha);
  }
`

export default function OrbitIndicator() {
  const uniforms = useMemo(() => ({ uOpacity: { value: 0 } }), [])
  const matRef   = useRef()

  useFrame(() => {
    const { speed } = useMurmurStore.getState().cameraState
    const active = Math.max(0, speed - 0.015)
    const target = Math.min(0.7, active * 45)
    uniforms.uOpacity.value += (target - uniforms.uOpacity.value) * 0.05
  })

  return (
    <mesh>
      <sphereGeometry args={[0.95, 32, 24]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}
