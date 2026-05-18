import { create } from 'zustand'
import cloudManifest from '@/murmur/clouds/_manifest.js'
import { loadPLY, loadPLYFromFile, decimate, normalize, computeGroupAffinities } from '@/murmur/clouds/loaders.js'

const USER_CLOUD_CAP    = 2_000_000
const USER_CLOUD_TARGET = 300_000

const useMurmurStore = create((set, get) => ({

  // ── Cloud ─────────────────────────────────────────────────────────────────
  cloud:              null,
  cloudLoading:       false,
  cloudError:         null,
  currentCloudSource: 'default',
  userClouds:         [],
  decimationNotice:   null,

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

  // ── Camera ────────────────────────────────────────────────────────────────
  cameraState: {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed:    0,
  },
  setCameraState:   (s) => set({ cameraState: s }),
  cameraTarget:     null,
  setCameraTarget:  (t) => set({ cameraTarget: t }),
  cameraResetToken: 0,
  resetCamera:      () => set(s => ({ cameraResetToken: s.cameraResetToken + 1 })),

  // ── Shader uniforms ref ───────────────────────────────────────────────────
  uniforms: { ref: null },
  setUniformsRef: (ref) => set(s => ({ uniforms: { ...s.uniforms, ref } })),

  // ── Gesture state ─────────────────────────────────────────────────────────
  // 'idle'    — camera stationary, no pointer held
  // 'touching' — pointer held or camera actively orbiting
  gestureState:    'idle',
  setGestureState: (s) => set({ gestureState: s }),

  // ── Passive playback ──────────────────────────────────────────────────────
  isPlayingPassive:    false,
  setIsPlayingPassive: (v) => set({ isPlayingPassive: v }),

  // ── Granular buffer position (0..1 = position in audio file) ─────────────
  granularBufferPosition:    0,
  setGranularBufferPosition: (v) => set({ granularBufferPosition: v }),

  // ── Pairing fingerprint (computed once per audio×cloud pairing) ──────────
  pairingFingerprint:    null,
  setPairingFingerprint: (fp) => set({ pairingFingerprint: fp }),

  // ── Per-frame chord visual params (mutable ref — not reactive) ───────────
  chordParamsRef: { current: { active: false, groupMask: 0, magnifyTarget: 0, worldPoint: null } },

  // ── Per-frame effect params (mutable ref — not reactive) ─────────────────
  // GranularSculptor writes this every frame; PointCloud reads it.
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

  // ── Finger smudges ────────────────────────────────────────────────────────
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

  // ── Spatial audio ─────────────────────────────────────────────────────────
  spatialEnabled: true,
  setSpatialEnabled: (v) => set({ spatialEnabled: v }),

  // ── Audio state (set by AudioEngine after load) ───────────────────────────
  audio: {
    source:   null,
    name:     null,
    duration: 0,
    isLoaded: false,
  },
  setAudioLoaded: ({ name, duration }) => set(s => ({
    audio: { ...s.audio, name, duration, isLoaded: true },
  })),

  // ── Group grid overlay (debug, kept for dev convenience) ─────────────────
  showGroupGrid:    false,
  setShowGroupGrid: (v) => set({ showGroupGrid: v }),
  toggleGroupGrid:  () => set(s => ({ showGroupGrid: !s.showGroupGrid })),

}))

export default useMurmurStore
