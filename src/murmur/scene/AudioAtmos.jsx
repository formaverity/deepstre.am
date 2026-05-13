import { useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

// Renders the inside of a large sphere as colored atmospheric haze.
// Bass heats the bottom/sides (orange-red), mid saturates the equator (teal),
// treble lifts the top (blue-violet). BackSide + additive = pure color addition.

const vertexShader = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir        = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */`
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  varying vec3 vDir;

  void main() {
    float up   = max(0.0,  vDir.y);
    float down = max(0.0, -vDir.y);
    float side = 1.0 - abs(vDir.y);

    vec3 col = vec3(0.0);
    // Bass: warm orange-red, strongest at bottom, bleeds sideways
    col += vec3(0.92, 0.22, 0.04) * (down * 0.75 + side * 0.25) * uBass;
    // Mid: teal, concentrated at equatorial band
    col += vec3(0.07, 0.60, 0.36) * side * uMid;
    // Treble: blue-violet, strongest at top, bleeds sideways
    col += vec3(0.18, 0.28, 1.00) * (up * 0.75 + side * 0.25) * uTreble;

    // Alpha: small ambient floor so sphere is always faintly present,
    // grows with energy so fog densifies on loud passages.
    float alpha = 0.018 + uBass * 0.095 + uMid * 0.060 + uTreble * 0.070;
    alpha = min(alpha, 0.17);

    gl_FragColor = vec4(col, alpha);
  }
`

export default function AudioAtmos() {
  const uniforms = useMemo(() => ({
    uBass:   { value: 0 },
    uMid:    { value: 0 },
    uTreble: { value: 0 },
  }), [])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    side:        THREE.BackSide,
  }), [uniforms])

  const geo = useMemo(() => new THREE.SphereGeometry(3.2, 20, 14), [])

  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])

  useFrame(() => {
    const b             = audioEngine.getFFT()
    uniforms.uBass.value   = b.bass
    uniforms.uMid.value    = (b.lowMid + b.highMid) * 0.5
    uniforms.uTreble.value = b.treble
  })

  return <mesh geometry={geo} material={mat} />
}
