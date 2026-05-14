import { create } from 'zustand'
import cloudManifest from '@/murmur/clouds/_manifest.js'
import { loadPLY, loadPLYFromFile, decimate, normalize, computeGroupAffinities } from '@/murmur/clouds/loaders.js'

const DEFAULT_CHORD_CONFIG = {
  preset:          'thirds',
  isMinor:         false,
  voices:          3,
  customIntervals: [0, 4, 7, 12],
}

function loadChordConfig() {
  try {
    const saved = localStorage.getItem('murmur-chord-v1')
    if (saved) {
      const p = JSON.parse(saved)
      if (p.preset && typeof p.voices === 'number') return { ...DEFAULT_CHORD_CONFIG, ...p }
    }
  } catch (_) {}
  return DEFAULT_CHORD_CONFIG
}

const DEFAULT_MAPPINGS = {
  explode:  { band: 'bass',    strength: 0.7, groupMask: 65535 },
  dissolve: { band: 'lowMid',  strength: 0.4, groupMask: 21845 },
  magnify:  { band: 'treble',  strength: 0.8, groupMask: 255   },
  chop:     { band: 'highMid', strength: 0.3, groupMask: 0     },
}

function loadMappings() {
  try {
    const saved = localStorage.getItem('murmur-mappings-v1')
    if (saved) {
      const p = JSON.parse(saved)
      if (p.explode && p.dissolve && p.magnify && p.chop) return p
    }
  } catch (_) {}
  return DEFAULT_MAPPINGS
}

function loadSensitivity() {
  try {
    const v = parseFloat(localStorage.getItem('murmur-sensitivity-v1'))
    if (!isNaN(v) && v >= 0.1 && v <= 4.0) return v
  } catch (_) {}
  return 1.0
}

const USER_CLOUD_CAP = 2_000_000
const USER_CLOUD_TARGET = 300_000

const useMurmurStore = create((set, get) => ({
  // ── Mode ─────────────────────────────────────────────────────────────
  mode: 'playback',   // 'playback' | 'interactive'
  setMode: (m) => set({ mode: m }),

  // ── Cloud ─────────────────────────────────────────────────────────────
  // { id, positions, colors, count, meta, normInfo } | null
  cloud:              null,
  cloudLoading:       false,
  cloudError:         null,
  currentCloudSource: 'default',   // 'default' | 'user'
  userClouds:         [],          // previously uploaded clouds (session-only)
  decimationNotice:   null,        // string | null — shown briefly after auto-decimate

  // Switch to an already-loaded user cloud object directly
  setCloud: (cloudObj) => set({ cloud: cloudObj, currentCloudSource: 'user' }),

  loadCloud: async (id) => {
    const { cloud, cloudLoading } = get()
    if (cloudLoading || cloud?.id === id) return

    const entry = cloudManifest.find(c => c.id === id)
    if (!entry) {
      set({ cloudError: `unknown cloud: "${id}"`, cloudLoading: false })
      return
    }

    set({ cloudLoading: true, cloudError: null })

    try {
      const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width:639px)').matches
      const targetPoints = isMobile ? 60_000 : entry.targetPoints

      const [raw, meta] = await Promise.all([
        loadPLY(entry.file),
        fetch(entry.meta)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ])

      const decimated       = decimate(raw, targetPoints)
      const normInfo        = normalize(decimated)
      const groupAffinities = computeGroupAffinities(decimated)

      set({
        cloud:              { id, ...decimated, meta, normInfo, groupAffinities },
        cloudLoading:       false,
        currentCloudSource: 'default',
      })
    } catch (err) {
      set({ cloudError: err.message, cloudLoading: false })
    }
  },

  loadCloudFromFile: async ({ file, userMeta }) => {
    set({ cloudLoading: true, cloudError: null, decimationNotice: null })
    try {
      const raw = await loadPLYFromFile(file)

      let decimated = raw
      let notice = null
      if (raw.count > USER_CLOUD_CAP) {
        decimated = decimate(raw, USER_CLOUD_TARGET)
        notice = `Cloud decimated from ${raw.count.toLocaleString()} → ${decimated.count.toLocaleString()} points`
      }

      const normInfo        = normalize(decimated)
      const groupAffinities = computeGroupAffinities(decimated)
      const id = `user-${Date.now()}`
      const cloudObj = { id, ...decimated, meta: userMeta, normInfo, groupAffinities }

      set(s => ({
        cloud:              cloudObj,
        cloudLoading:       false,
        currentCloudSource: 'user',
        userClouds:         [...s.userClouds, cloudObj],
        decimationNotice:   notice,
        cameraResetToken:   s.cameraResetToken + 1,
      }))
    } catch (err) {
      set({ cloudError: err.message, cloudLoading: false })
    }
  },

  // ── Camera ────────────────────────────────────────────────────────────
  cameraState: {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed:    0,
  },
  setCameraState:  (s) => set({ cameraState: s }),
  cameraTarget:    null,   // { x, y, z } | null — CameraRig lerps toward this
  setCameraTarget: (t) => set({ cameraTarget: t }),
  cameraResetToken: 0,
  resetCamera: () => set(s => ({ cameraResetToken: s.cameraResetToken + 1 })),

  // ── Shader uniforms ref ───────────────────────────────────────────────
  // Set by PointCloud on mount; audio engine writes uniform values via ref.current
  uniforms: { ref: null },
  setUniformsRef: (ref) => set(s => ({ uniforms: { ...s.uniforms, ref } })),

  // ── Sensitivity (global band-energy multiplier, persisted) ───────────
  sensitivity: loadSensitivity(),
  setSensitivity: (v) => {
    try { localStorage.setItem('murmur-sensitivity-v1', String(v)) } catch (_) {}
    set({ sensitivity: v })
  },

  // ── Effect mappings (band → effect assignment, persisted) ─────────────
  mappings: loadMappings(),
  setMappings: (m) => {
    try { localStorage.setItem('murmur-mappings-v1', JSON.stringify(m)) } catch (_) {}
    set({ mappings: m })
  },
  resetMappings: () => {
    try { localStorage.setItem('murmur-mappings-v1', JSON.stringify(DEFAULT_MAPPINGS)) } catch (_) {}
    set({ mappings: DEFAULT_MAPPINGS })
  },

  // ── Chord voicing config (persisted) ─────────────────────────────────
  chordConfig: loadChordConfig(),
  setChordConfig: (c) => {
    try { localStorage.setItem('murmur-chord-v1', JSON.stringify(c)) } catch (_) {}
    set({ chordConfig: c })
  },

  // ── Per-frame chord visual params (non-reactive mutable ref) ─────────
  chordParamsRef: { current: { active: false, groupMask: 0, magnifyTarget: 0, worldPoint: null } },

  // ── Per-frame effect params (non-reactive mutable ref) ────────────────
  // ReactiveAnalyzer or SculptDriver writes this each frame; PointCloud reads it.
  effectParamsRef: { current: {
    returnForce:      10.0,
    explodeStrength:  0,  explodeGroupMask:  65535,
    dissolveRate:     0,  dissolveGroupMask: 65535,
    magnifyTarget:    0,  magnifyGroupMask:  65535,
    chopAdvance:      0,  chopGroupMask:     0,
    sculptMode:       0,
    sculptResonance:  null,
    sculptImpulse:    4.0,
    sculptMaxMag:     2.5,
  }},

  // ── Sculpt group-grid overlay ─────────────────────────────────────────
  showGroupGrid:   false,
  setShowGroupGrid: (v) => set({ showGroupGrid: v }),
  toggleGroupGrid:  () => set(s => ({ showGroupGrid: !s.showGroupGrid })),

  // ── Sculpt HUD state (written ~10fps from GranularSculptor) ──────────
  sculptParams: null,
  setSculptParams: (p) => set({ sculptParams: p }),

  // ── Grain freeze (SPACE in sculpt mode) ───────────────────────────────
  grainFrozen:    false,
  setGrainFrozen: (v) => set({ grainFrozen: v }),

  // ── Finger smudges (chord interaction visual) ─────────────────────────
  smudges: [],
  addSmudge: ({ position, seed, color }) => {
    const id = `sm-${Date.now()}-${(Math.random() * 0xfffff | 0).toString(36)}`
    set(s => ({
      smudges: [...s.smudges.slice(-3), { id, position, seed, color, born: Date.now(), dying: null }]
    }))
    return id
  },
  releaseSmudge: (id) => set(s => ({
    smudges: s.smudges.map(sm => sm.id === id ? { ...sm, dying: Date.now() } : sm)
  })),
  removeSmudge: (id) => set(s => ({ smudges: s.smudges.filter(sm => sm.id !== id) })),

  // ── Spatial audio ─────────────────────────────────────────────────────
  spatialEnabled: { playback: true, interactive: false },
  setSpatialEnabled: (mode, v) => set(s => ({
    spatialEnabled: { ...s.spatialEnabled, [mode]: v }
  })),

  // ── Shared UI state ───────────────────────────────────────────────────
  infoOpen:    false,
  setInfoOpen: (v) => set({ infoOpen: v }),

  // ── Audio ─────────────────────────────────────────────────────────────
  audio: {
    source:   null,
    name:     null,
    duration: 0,
    isLoaded: false,
  },
  setAudioLoaded: ({ name, duration }) => set(s => ({
    audio: { ...s.audio, name, duration, isLoaded: true },
  })),
}))

export default useMurmurStore
