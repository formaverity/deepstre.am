import { useEffect, useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import { COLOR_MAPPING } from '@/murmur/audio/GranularSculptor.jsx'
import { resolveIntervals } from '@/murmur/audio/chordVoicings.js'

const CHORD_DELAY_MS  = 80
const NAV_THRESHOLD   = 5    // px — beyond this = navigation, abort chord
const MAX_DRAG_PX     = 300  // px for full filter/Q sweep
const SPHERE_RADIUS   = 1.5
const CUTOFF_MIN      = 200
const CUTOFF_MAX      = 12000
const Q_MIN           = 0.5
const Q_MAX           = 8.0

function circularDist(a, b) {
  const d = Math.abs(a - b)
  return Math.min(d, 12 - d)
}

function groupFromWorldPoint(x, z) {
  const gx = Math.min(3, Math.max(0, Math.floor((x + 1.0) * 2.0)))
  const gz = Math.min(3, Math.max(0, Math.floor((z + 1.0) * 2.0)))
  return gx * 4 + gz
}

function buildGroupMask(groupAffinities, rootIdx, intervals) {
  if (!groupAffinities) return 1 << rootIdx
  const rootPC = groupAffinities[rootIdx].pitchClass
  let mask = 1 << rootIdx
  for (let vi = 1; vi < intervals.length; vi++) {
    const targetPC = ((rootPC + Math.round(intervals[vi])) % 12 + 12) % 12
    let bestDist = Infinity
    let bestIdx  = rootIdx
    for (let i = 0; i < 16; i++) {
      if (i === rootIdx) continue
      const d = circularDist(groupAffinities[i].pitchClass, targetPC)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    mask |= (1 << bestIdx)
  }
  return mask
}

// ── Fresnel rim shaders (shared with OrbitIndicator aesthetic) ─────────────

const rimVert = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal  = normalize(normalMatrix * normal);
    vec4 mv  = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const rimFrag = /* glsl */`
  uniform float uOpacity;
  varying vec3  vNormal;
  varying vec3  vViewDir;
  void main() {
    float rim   = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
    float alpha = pow(rim, 2.8) * uOpacity;
    gl_FragColor = vec4(0.82, 0.80, 0.88, alpha);
  }
`

// ── Visual ring (inside Canvas) ────────────────────────────────────────────

export function ChordRing() {
  const meshRef  = useRef(null)
  const uniforms = useMemo(() => ({ uOpacity: { value: 0 } }), [])

  useFrame(() => {
    if (!meshRef.current) return
    const cp = useMurmurStore.getState().chordParamsRef?.current
    if (!cp) return

    if (cp.active && cp.worldPoint) {
      meshRef.current.position.copy(cp.worldPoint)
    }

    const target = cp.active ? 0.85 : 0
    uniforms.uOpacity.value += (target - uniforms.uOpacity.value) * 0.12
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.22, 24, 18]} />
      <shaderMaterial
        vertexShader={rimVert}
        fragmentShader={rimFrag}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}

// ── Controller (attaches to canvas DOM, no render output) ─────────────────

export default function ChordController() {
  const { camera, gl } = useThree()

  // mutable state for the current pointer interaction — no re-renders needed
  const ps = useRef({
    pointerId:     null,
    downX:         0,
    downY:         0,
    chordTimer:    null,
    isChordActive: false,
    isNav:         false,
    worldPoint:    null,
  })

  useEffect(() => {
    const canvas    = gl.domElement
    const p         = ps.current
    const raycaster = new THREE.Raycaster()
    const sphere    = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SPHERE_RADIUS)
    const ndcVec    = new THREE.Vector2()
    const hitVec    = new THREE.Vector3()

    const getWorldPoint = (cx, cy) => {
      const rect = canvas.getBoundingClientRect()
      ndcVec.set(
        ((cx - rect.left) / rect.width)  *  2 - 1,
        -((cy - rect.top)  / rect.height) *  2 + 1,
      )
      raycaster.setFromCamera(ndcVec, camera)
      hitVec.set(0, 0, 0)
      return raycaster.ray.intersectSphere(sphere, hitVec) ? hitVec.clone() : null
    }

    const triggerChord = (worldPoint) => {
      const store = useMurmurStore.getState()
      if (!store.cloud?.groupAffinities || !audioEngine.isReady) return

      const affs     = store.cloud.groupAffinities
      const groupIdx = groupFromWorldPoint(worldPoint.x, worldPoint.z)
      const aff      = affs[groupIdx]
      const rootSt   = aff.octave * 12 + aff.pitchClass + COLOR_MAPPING.baseSemitone

      const { chordConfig } = store
      const intervals = resolveIntervals(chordConfig)
      const voices    = Math.min(chordConfig.voices, intervals.length)
      const groupMask = buildGroupMask(affs, groupIdx, intervals)

      const azimuth  = Math.atan2(worldPoint.x, worldPoint.z)
      const position = (azimuth + Math.PI) / (2 * Math.PI)

      audioEngine.startChord({ rootSemitone: rootSt, intervals, voices, position })
      p.isChordActive = true

      store.chordParamsRef.current = {
        active:       true,
        groupMask,
        magnifyTarget: 1.5,
        worldPoint:   worldPoint.clone(),
      }
    }

    const onPointerDown = (e) => {
      // Second pointer down while tracking → multi-touch, cancel chord (orbit/pinch wins)
      if (p.pointerId !== null) {
        clearTimeout(p.chordTimer)
        p.isNav = true
        return
      }
      if (!audioEngine.isReady) return

      p.pointerId     = e.pointerId
      p.downX         = e.clientX
      p.downY         = e.clientY
      p.isNav         = false
      p.isChordActive = false
      p.worldPoint    = getWorldPoint(e.clientX, e.clientY)

      clearTimeout(p.chordTimer)
      p.chordTimer = setTimeout(() => {
        if (!p.isNav && p.worldPoint) triggerChord(p.worldPoint)
      }, CHORD_DELAY_MS)
    }

    const onPointerMove = (e) => {
      if (e.pointerId !== p.pointerId) return

      const dx   = e.clientX - p.downX
      const dy   = e.clientY - p.downY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (!p.isChordActive) {
        if (dist > NAV_THRESHOLD) {
          p.isNav = true
          clearTimeout(p.chordTimer)
        }
        return
      }

      // Map drag to filter cutoff (x) and resonance Q (y)
      // Right = open, left = closed; up = squelchy, down = tame
      const cutoffT = Math.max(0, Math.min(1, 1.0 + dx / MAX_DRAG_PX))
      const qT      = Math.max(0, Math.min(1, -dy / MAX_DRAG_PX))
      const logMin  = Math.log(CUTOFF_MIN)
      const logMax  = Math.log(CUTOFF_MAX)
      audioEngine.updateChord({
        filterCutoff: Math.exp(logMin + (logMax - logMin) * cutoffT),
        filterQ:      Q_MIN + (Q_MAX - Q_MIN) * qT,
      })
    }

    const onPointerUp = (e) => {
      if (e.pointerId !== p.pointerId) return
      clearTimeout(p.chordTimer)
      p.pointerId = null

      if (p.isChordActive) {
        audioEngine.stopChord()
        p.isChordActive = false
        useMurmurStore.getState().chordParamsRef.current = {
          active: false, groupMask: 0, magnifyTarget: 0, worldPoint: null,
        }
      }
    }

    canvas.addEventListener('pointerdown',   onPointerDown)
    canvas.addEventListener('pointermove',   onPointerMove)
    canvas.addEventListener('pointerup',     onPointerUp)
    canvas.addEventListener('pointerleave',  onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    return () => {
      canvas.removeEventListener('pointerdown',   onPointerDown)
      canvas.removeEventListener('pointermove',   onPointerMove)
      canvas.removeEventListener('pointerup',     onPointerUp)
      canvas.removeEventListener('pointerleave',  onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      clearTimeout(p.chordTimer)
    }
  }, [camera, gl])

  return null
}
