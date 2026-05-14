import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import { COLOR_MAPPING } from '@/murmur/audio/GranularSculptor.jsx'
import { resolveIntervals } from '@/murmur/audio/chordVoicings.js'

const CHORD_DELAY_MS = 80
const NAV_THRESHOLD  = 5     // px — beyond this = navigation, abort chord
const MAX_DRAG_PX    = 300
const SPHERE_RADIUS  = 1.5
const CUTOFF_MIN     = 200
const CUTOFF_MAX     = 12000
const Q_MIN          = 0.5
const Q_MAX          = 8.0

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
    let bestDist = Infinity, bestIdx = rootIdx
    for (let i = 0; i < 16; i++) {
      if (i === rootIdx) continue
      const d = circularDist(groupAffinities[i].pitchClass, targetPC)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    mask |= (1 << bestIdx)
  }
  return mask
}

// Sample the average RGB of a cloud group, desaturated for ink feel
function sampleGroupColor(cloud, groupIdx) {
  const { positions, colors, count } = cloud
  if (!colors || !positions) return { r: 0.72, g: 0.80, b: 0.70 }

  const SKIP = count > 60000 ? Math.ceil(count / 10000) : 1
  let r = 0, g = 0, b = 0, n = 0

  for (let i = 0; i < count; i += SKIP) {
    const px = positions[i * 3]
    const pz = positions[i * 3 + 2]
    const gx = Math.min(3, Math.max(0, Math.floor((px + 1.0) * 2.0)))
    const gz = Math.min(3, Math.max(0, Math.floor((pz + 1.0) * 2.0)))
    if (gx * 4 + gz === groupIdx) {
      r += colors[i * 3]; g += colors[i * 3 + 1]; b += colors[i * 3 + 2]; n++
    }
  }

  if (n === 0) return { r: 0.72, g: 0.80, b: 0.70 }

  const rA = r / n, gA = g / n, bA = b / n
  const maxC = Math.max(rA, gA, bA)
  if (maxC < 0.01) return { r: 0.72, g: 0.80, b: 0.70 }

  // Desaturate 35%
  const lum = 0.299 * rA + 0.587 * gA + 0.114 * bA
  const amt = 0.35
  return {
    r: rA * (1 - amt) + lum * amt,
    g: gA * (1 - amt) + lum * amt,
    b: bA * (1 - amt) + lum * amt,
  }
}

// Merge all active pointer states into the chordParamsRef used by PointCloud for magnify
function flushChordParams(store, pointerMap) {
  let anyActive = false
  let mask = 0
  let maxMag = 0
  let latestWorldPoint = null

  for (const [, p] of pointerMap) {
    if (p.isChordActive) {
      anyActive = true
      mask |= p.groupMask
      maxMag = Math.max(maxMag, 1.5)
      latestWorldPoint = p.worldPoint
    }
  }

  store.chordParamsRef.current = {
    active:        anyActive,
    groupMask:     mask,
    magnifyTarget: maxMag,
    worldPoint:    latestWorldPoint,
  }
}

// ── Controller ────────────────────────────────────────────────────────────────

export default function ChordController() {
  const { camera, gl } = useThree()

  // Map<pointerId, { downX, downY, chordTimer, isChordActive, isNav, worldPoint, groupMask, smudgeId }>
  const pointers = useRef(new Map())

  useEffect(() => {
    const canvas    = gl.domElement
    const raycaster = new THREE.Raycaster()
    const sphere    = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SPHERE_RADIUS)
    const ndcVec    = new THREE.Vector2()
    const hitVec    = new THREE.Vector3()

    const getWorldPoint = (cx, cy) => {
      const rect = canvas.getBoundingClientRect()
      ndcVec.set(
        ((cx - rect.left) / rect.width)  *  2 - 1,
        -((cy - rect.top) / rect.height) *  2 + 1,
      )
      raycaster.setFromCamera(ndcVec, camera)
      hitVec.set(0, 0, 0)
      return raycaster.ray.intersectSphere(sphere, hitVec) ? hitVec.clone() : null
    }

    const triggerChord = (pid, worldPoint) => {
      const p     = pointers.current.get(pid)
      const store = useMurmurStore.getState()
      if (!p || !store.cloud?.groupAffinities || !audioEngine.isReady) return

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

      audioEngine.startChord(pid, { rootSemitone: rootSt, intervals, voices, position })

      p.isChordActive = true
      p.groupMask     = groupMask

      // Spawn smudge
      const color    = sampleGroupColor(store.cloud, groupIdx)
      const seed     = ((pid * 9301 + Date.now()) * 49297) | 0
      const smudgeId = store.addSmudge({
        position: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
        seed,
        color,
      })
      p.smudgeId = smudgeId

      flushChordParams(store, pointers.current)
    }

    const onPointerDown = (e) => {
      if (!audioEngine.isReady) return

      const worldPoint = getWorldPoint(e.clientX, e.clientY)
      const pid = e.pointerId

      const state = {
        downX: e.clientX, downY: e.clientY,
        chordTimer: null, isChordActive: false,
        isNav: false, worldPoint,
        groupMask: 0, smudgeId: null,
      }
      pointers.current.set(pid, state)

      state.chordTimer = setTimeout(() => {
        if (!state.isNav && state.worldPoint) triggerChord(pid, state.worldPoint)
      }, CHORD_DELAY_MS)
    }

    const onPointerMove = (e) => {
      const p = pointers.current.get(e.pointerId)
      if (!p) return

      const dx   = e.clientX - p.downX
      const dy   = e.clientY - p.downY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (!p.isChordActive) {
        if (dist > NAV_THRESHOLD) { p.isNav = true; clearTimeout(p.chordTimer) }
        return
      }

      const cutoffT = Math.max(0, Math.min(1, 1.0 + dx / MAX_DRAG_PX))
      const qT      = Math.max(0, Math.min(1, -dy / MAX_DRAG_PX))
      const logMin  = Math.log(CUTOFF_MIN)
      const logMax  = Math.log(CUTOFF_MAX)
      audioEngine.updateChord(e.pointerId, {
        filterCutoff: Math.exp(logMin + (logMax - logMin) * cutoffT),
        filterQ:      Q_MIN + (Q_MAX - Q_MIN) * qT,
      })
    }

    const onPointerUp = (e) => {
      const p = pointers.current.get(e.pointerId)
      if (!p) return

      clearTimeout(p.chordTimer)

      if (p.isChordActive) {
        audioEngine.stopChord(e.pointerId)
        p.isChordActive = false
        if (p.smudgeId) {
          useMurmurStore.getState().releaseSmudge(p.smudgeId)
          p.smudgeId = null
        }
        flushChordParams(useMurmurStore.getState(), pointers.current)
      }

      pointers.current.delete(e.pointerId)
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

      const store = useMurmurStore.getState()
      for (const [pid, p] of pointers.current) {
        clearTimeout(p.chordTimer)
        if (p.isChordActive) {
          audioEngine.stopChord(pid)
          if (p.smudgeId) store.releaseSmudge(p.smudgeId)
        }
      }
      pointers.current.clear()
    }
  }, [camera, gl])

  return null
}
