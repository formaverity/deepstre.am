import { create } from 'zustand'
import cloudManifest from '@/murmur/clouds/_manifest.js'
import { loadPLY, loadPLYFromFile, decimate, normalize } from '@/murmur/clouds/loaders.js'

const USER_CLOUD_CAP = 2_000_000
const USER_CLOUD_TARGET = 300_000

const useMurmurStore = create((set, get) => ({
  // ── Mode ─────────────────────────────────────────────────────────────
  mode: 'reactive',    // 'reactive' | 'sculpt'
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

      const decimated = decimate(raw, targetPoints)
      const normInfo  = normalize(decimated)

      set({
        cloud:              { id, ...decimated, meta, normInfo },
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

      const normInfo = normalize(decimated)
      const id = `user-${Date.now()}`
      const cloudObj = { id, ...decimated, meta: userMeta, normInfo }

      set(s => ({
        cloud:              cloudObj,
        cloudLoading:       false,
        currentCloudSource: 'user',
        userClouds:         [...s.userClouds, cloudObj],
        decimationNotice:   notice,
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

  // ── Sculpt HUD state (written ~10fps from GranularSculptor) ──────────
  sculptParams: null,
  setSculptParams: (p) => set({ sculptParams: p }),

  // ── Grain freeze (SPACE in sculpt mode) ───────────────────────────────
  grainFrozen:    false,
  setGrainFrozen: (v) => set({ grainFrozen: v }),

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
