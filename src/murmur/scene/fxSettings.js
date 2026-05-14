// Shared mutable FX settings — read by DitherBleed each frame, written by FxPanel.
// Deliberately not reactive (no Zustand) to avoid re-rendering the Canvas subtree.

const STORAGE_KEY = 'murmur-fx-v1'

export const FX_DEFAULTS = {
  ditherStrength:  0.38,
  levels:          5,
  noiseStrength:   0.30,
  monochrome:      0.85,
  bleedRadius:     4.0,
  bleedThreshold:  0.40,
  saturationBoost: 0.60,
  bleedStrength:   0.12,
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...FX_DEFAULTS, ...JSON.parse(raw) } : { ...FX_DEFAULTS }
  } catch { return { ...FX_DEFAULTS } }
}

export const fxSettings = load()

export function saveFxSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fxSettings)) } catch (_) {}
}

export function resetFxSettings() {
  Object.assign(fxSettings, FX_DEFAULTS)
  try { localStorage.removeItem(STORAGE_KEY) } catch (_) {}
}
