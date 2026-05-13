import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { vertexShader, fragmentShader, makeUniforms } from './pointShader.js'
import { vertexShaderGpgpu, fragmentShaderGpgpu, makeUniformsGpgpu } from './pointShaderGpgpu.js'
import { ParticleSystem } from './gpgpu/ParticleSystem.js'

// Returns the color array if any sampled value is above a threshold, otherwise
// null — handles PLYs that have a color attribute but store it as all-zeros.
function usableColors(colors) {
  if (!colors) return null
  const limit = Math.min(colors.length, 600)
  for (let i = 0; i < limit; i++) {
    if (colors[i] > 0.01) return colors
  }
  return null
}

export default function PointCloud({ useGpgpu = true }) {
  const cloud          = useMurmurStore(s => s.cloud)
  const setUniformsRef = useMurmurStore(s => s.setUniformsRef)
  const { gl: renderer } = useThree()

  // ── Legacy materials/geometry ─────────────────────────────────────────

  const uniforms = useMemo(() => makeUniforms(), [])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  }), [uniforms])

  const geo = useMemo(() => {
    if (!cloud) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3))
    const colorData = usableColors(cloud.colors) ?? new Float32Array(cloud.count * 3).fill(1)
    g.setAttribute('color', new THREE.BufferAttribute(colorData, 3))
    g.computeBoundingSphere()
    return g
  }, [cloud?.id])

  useEffect(() => { return () => geo?.dispose() }, [geo])

  // ── GPGPU materials/geometry ──────────────────────────────────────────

  const gpuUniforms = useMemo(() => makeUniformsGpgpu(), [])
  const gpuMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   vertexShaderGpgpu,
    fragmentShader: fragmentShaderGpgpu,
    uniforms:       gpuUniforms,
    transparent:    true,
    blending:       THREE.AdditiveBlending,
    depthWrite:     false,
  }), [gpuUniforms])

  const gpuGeo = useMemo(() => {
    if (!cloud || !useGpgpu) return null
    const { count, positions, colors } = cloud
    const side = Math.ceil(Math.sqrt(count))

    const g = new THREE.BufferGeometry()

    // Use cloud.positions for the "position" attribute so Three.js computes
    // a correct bounding sphere for frustum culling.  The vertex shader ignores
    // it and reads from uPositionTex instead.
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const colorData = usableColors(colors) ?? new Float32Array(count * 3).fill(1)
    g.setAttribute('color', new THREE.BufferAttribute(colorData, 3))

    // Per-particle UV into the GPGPU textures.  Centers on each texel so
    // NearestFilter sampling returns the exact texel value.
    const aUv = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      aUv[2 * i]     = ((i % side) + 0.5) / side
      aUv[2 * i + 1] = (Math.floor(i / side) + 0.5) / side
    }
    g.setAttribute('aUv', new THREE.BufferAttribute(aUv, 2))

    g.computeBoundingSphere()
    return g
  }, [cloud?.id, useGpgpu])

  useEffect(() => { return () => gpuGeo?.dispose() }, [gpuGeo])

  // ── ParticleSystem lifecycle ──────────────────────────────────────────

  const particleSystemRef = useRef(null)
  const [gpuReady, setGpuReady] = useState(false)

  useEffect(() => {
    if (!useGpgpu || !cloud || !renderer) {
      particleSystemRef.current?.dispose()
      particleSystemRef.current = null
      setGpuReady(false)
      return
    }

    const ps = new ParticleSystem({
      renderer,
      count:            cloud.count,
      initialPositions: cloud.positions,
    })

    if (!ps.isValid) {
      console.warn('[PointCloud] GPGPU init failed — falling back to legacy path')
      ps.dispose()
      setGpuReady(false)
      return
    }

    particleSystemRef.current       = ps
    gpuMat.uniforms.uPositionTex.value = ps.positionTexture
    gpuMat.uniforms.uStateTex.value    = ps.stateTexture
    setGpuReady(true)

    return () => {
      ps.dispose()
      particleSystemRef.current = null
      setGpuReady(false)
    }
  }, [cloud?.id, useGpgpu, renderer])  // renderer is stable — included for correctness

  // ── Single uniforms ref exposed to audio drivers ──────────────────────
  // Switches to gpuMat when GPGPU is active so ReactiveAnalyzer and
  // GranularSculptor write to the correct material's uniforms.

  const activeMatRef = useRef(null)
  useEffect(() => {
    activeMatRef.current = (useGpgpu && gpuReady) ? gpuMat : mat
    setUniformsRef(activeMatRef)
    return () => setUniformsRef(null)
  }, [useGpgpu, gpuReady, mat, gpuMat, setUniformsRef])

  // ── Per-frame tick ────────────────────────────────────────────────────

  useFrame((state, delta) => {
    const t  = state.clock.getElapsedTime()
    const dt = Math.min(delta, 0.1)

    if (useGpgpu && particleSystemRef.current) {
      const store        = useMurmurStore.getState()
      const effectParams = store.effectParamsRef.current
      const cp           = store.chordParamsRef?.current

      // Merge chord MAGNIFY on top of whatever the audio drivers wrote
      const mergedParams = cp?.active ? {
        ...effectParams,
        magnifyGroupMask: effectParams.magnifyGroupMask | cp.groupMask,
        magnifyTarget:    Math.max(effectParams.magnifyTarget, cp.magnifyTarget),
      } : effectParams

      particleSystemRef.current.update({ time: t, dt, effectParams: mergedParams })
      // Refresh texture refs after each compute pass (ping-pong swaps targets)
      gpuMat.uniforms.uTime.value        = t
      gpuMat.uniforms.uPositionTex.value = particleSystemRef.current.positionTexture
      gpuMat.uniforms.uStateTex.value    = particleSystemRef.current.stateTexture
    } else {
      mat.uniforms.uTime.value = t
    }
  })

  // ── Render ────────────────────────────────────────────────────────────

  if (useGpgpu && gpuReady && gpuGeo) {
    return <points geometry={gpuGeo} material={gpuMat} />
  }
  return geo ? <points geometry={geo} material={mat} /> : null
}
