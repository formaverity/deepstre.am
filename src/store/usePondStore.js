import { create } from 'zustand'

function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

const ZOOM_MIN    = 0.3
const ZOOM_MAX    = 10
const AERIAL_MAX  = 1.6
const SURFACE_MAX = 3.2

const usePondStore = create((set, get) => ({
  camera: { zoom: 1.0, targetZoom: 1.0, x: 0, y: 0, pivot: null },
  viewport: { width: 1, height: 1 },
  mouse: { x: 0, y: 0, inside: false },
  focusedSlug: null,
  activeProject: null,  // { slug, mode, target } | null
  fx: false,

  // ── Camera ───────────────────────────────────────────────────────────

  setZoomTarget: (z) => set(s => ({
    camera: { ...s.camera, targetZoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) },
  })),

  // Zoom around an optional screen-space pivot {mx, my}.
  // Pan correction is applied incrementally each RAF frame (AsciiField),
  // so this action only records the target zoom and the pivot point.
  zoomBy: (factor, around = null) => set(s => ({
    camera: {
      ...s.camera,
      targetZoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s.camera.targetZoom * factor)),
      // Fall back to viewport centre so button-triggered zoom is stable.
      pivot: around ?? { mx: s.viewport.width / 2, my: s.viewport.height / 2 },
    },
  })),

  setPan: (x, y) => set(s => ({ camera: { ...s.camera, x, y } })),
  panBy: (dx, dy) => set(s => ({ camera: { ...s.camera, x: s.camera.x + dx, y: s.camera.y + dy } })),

  // ── Other ─────────────────────────────────────────────────────────────

  setViewport: (w, h) => set({ viewport: { width: w, height: h } }),
  setMouse: (x, y, inside) => set({ mouse: { x, y, inside } }),
  setFocused: (slug) => set({ focusedSlug: slug }),
  openProject: (p) => set({ activeProject: p }),
  closeProject: () => set({ activeProject: null }),
  toggleFx: () => set(s => ({ fx: !s.fx })),

  // ── Derived ───────────────────────────────────────────────────────────

  zone: () => {
    const { zoom } = get().camera
    if (zoom < AERIAL_MAX)  return 'aerial'
    if (zoom < SURFACE_MAX) return 'surface'
    return 'immersed'
  },

  revealFactor: () => {
    const { zoom } = get().camera
    return smoothstep((zoom - AERIAL_MAX) / (SURFACE_MAX - AERIAL_MAX))
  },
}))

export default usePondStore
