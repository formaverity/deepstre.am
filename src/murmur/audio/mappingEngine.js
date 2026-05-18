// Autonomous effect mapping: pairing-determined base + slow live drift.
// Replaces the user-controlled MappingsPanel.

const BANDS = ['bass', 'lowMid', 'highMid', 'treble']

const DEFAULT_BASE = {
  explode:  { band: 'bass',    strength: 0.7, groupMask: 65535 },
  magnify:  { band: 'treble',  strength: 0.8, groupMask: 65535 },
  dissolve: { band: 'lowMid',  strength: 0.4, groupMask: 65535 },
  chop:     { band: 'highMid', strength: 0.0, groupMask: 0     },
}

// Drift smoothing: modulations are low-passed over ~4 seconds
const DRIFT_ALPHA = 0.005   // per frame at ~60fps ≈ 3–5s time constant

export class MappingEngine {
  constructor() {
    this.baseMapping   = { ...DEFAULT_BASE }
    this.driftFactors  = { explode: 1, magnify: 1, dissolve: 1, chop: 0 }
    this._smoothRMS    = 0
    this._smoothFlat   = 0
    this._smoothOnset  = 0
    this._prevBass     = 0
  }

  // ── Pairing fingerprint ────────────────────────────────────────────────────
  // Called once when both audio and cloud are ready.
  // audioFingerprint: { bassRatio, midRatio, trebleRatio, onsetDensity }
  // cloudFingerprint: { colorVariance, groupCount }

  computeBaseMapping(audioFingerprint, cloudFingerprint) {
    if (!audioFingerprint) { this.baseMapping = { ...DEFAULT_BASE }; return }

    const { bassRatio = 0.3, midRatio = 0.4, trebleRatio = 0.3, onsetDensity = 0.5 } = audioFingerprint
    const { colorVariance = 0.5 } = cloudFingerprint ?? {}

    // Band ordering by dominance
    const ordered = [
      { band: 'bass',    weight: bassRatio },
      { band: 'treble',  weight: trebleRatio },
      { band: 'lowMid',  weight: midRatio * 0.6 },
      { band: 'highMid', weight: midRatio * 0.4 },
    ].sort((a, b) => b.weight - a.weight)

    // Dominant band → EXPLODE; second → MAGNIFY; third → DISSOLVE
    const explodeBand  = ordered[0].band
    const magnifyBand  = ordered[1].band
    const dissolveBand = ordered[2].band

    // CHOP: only on high-onset audio, targets percussive band
    const chopEnabled = onsetDensity > 0.6
    const chopBand    = onsetDensity > 0.6 ? 'highMid' : 'highMid'

    // Group masks: high variance → effect-per-region; low → whole-cloud
    const allGroups = 65535
    const evenGroups = 21845   // 0101…01 in binary — alternating cells
    const explodeMask  = allGroups
    const magnifyMask  = colorVariance > 0.4 ? evenGroups : allGroups
    const dissolveMask = allGroups
    const chopMask     = chopEnabled ? 43690 : 0   // 1010…10

    // Strength inversely scaled to loudness estimate so quiet audio still responds
    const loudness      = Math.max(0.1, bassRatio + midRatio + trebleRatio)
    const normFactor    = Math.min(1.5, 1.0 / loudness)

    this.baseMapping = {
      explode:  { band: explodeBand,  strength: Math.min(1, 0.7 * normFactor), groupMask: explodeMask  },
      magnify:  { band: magnifyBand,  strength: Math.min(1, 0.8 * normFactor), groupMask: magnifyMask  },
      dissolve: { band: dissolveBand, strength: Math.min(1, 0.4 * normFactor), groupMask: dissolveMask },
      chop:     { band: chopBand,     strength: chopEnabled ? Math.min(1, 0.3 * normFactor) : 0, groupMask: chopMask },
    }

    this.driftFactors = { explode: 1, magnify: 1, dissolve: 1, chop: chopEnabled ? 1 : 0 }
  }

  // ── Per-frame drift ────────────────────────────────────────────────────────
  // Called every frame with current FFT bands.
  // fft: { bass, lowMid, highMid, treble }

  updateDrift(fft) {
    if (!fft) return

    const rms = (fft.bass + fft.lowMid + fft.highMid + fft.treble) / 4
    this._smoothRMS = this._smoothRMS + (rms - this._smoothRMS) * DRIFT_ALPHA

    // Spectral flatness proxy: how even are the bands?
    const avg = rms
    const variance = ((fft.bass - avg) ** 2 + (fft.lowMid - avg) ** 2 +
                      (fft.highMid - avg) ** 2 + (fft.treble - avg) ** 2) / 4
    const flatness = 1 - Math.min(1, variance * 8)   // 1 = noise-like, 0 = tonal
    this._smoothFlat = this._smoothFlat + (flatness - this._smoothFlat) * DRIFT_ALPHA

    // Onset proxy: bass transient rate
    const bassDelta = Math.max(0, fft.bass - this._prevBass)
    this._prevBass = fft.bass
    this._smoothOnset = this._smoothOnset + (bassDelta - this._smoothOnset) * DRIFT_ALPHA

    // Derive drift factors
    const rmsNorm  = Math.min(1, this._smoothRMS / 0.4)
    const flatNorm = this._smoothFlat
    const onset    = Math.min(1, this._smoothOnset * 20)

    // High RMS → sharper (amplify chop, dampen dissolve)
    // Low RMS  → softer  (amplify dissolve, dampen chop)
    const targetExplode  = 0.8 + flatNorm * 0.4          // chaos expands
    const targetMagnify  = 0.8 + rmsNorm  * 0.4          // loudness magnifies
    const targetDissolve = 0.5 + (1 - rmsNorm) * 0.8     // quiet dissolves
    const targetChop     = onset * 1.5                    // transients chop

    const a = 0.008   // slow approach
    this.driftFactors.explode  += (targetExplode  - this.driftFactors.explode)  * a
    this.driftFactors.magnify  += (targetMagnify  - this.driftFactors.magnify)  * a
    this.driftFactors.dissolve += (targetDissolve - this.driftFactors.dissolve) * a
    this.driftFactors.chop     += (targetChop     - this.driftFactors.chop)     * a
  }

  // ── Current live mapping ───────────────────────────────────────────────────

  getCurrentMapping() {
    const b = this.baseMapping
    const d = this.driftFactors
    return {
      explode:  { band: b.explode.band,  strength: b.explode.strength  * d.explode,  groupMask: b.explode.groupMask  },
      magnify:  { band: b.magnify.band,  strength: b.magnify.strength  * d.magnify,  groupMask: b.magnify.groupMask  },
      dissolve: { band: b.dissolve.band, strength: b.dissolve.strength * d.dissolve, groupMask: b.dissolve.groupMask },
      chop:     { band: b.chop.band,     strength: b.chop.strength     * d.chop,     groupMask: b.chop.groupMask     },
    }
  }

  // ── Offline audio fingerprinting (first 8s) ───────────────────────────────
  // Returns { bassRatio, midRatio, trebleRatio, onsetDensity }.
  // Safe to call in a setTimeout — synchronous, no Web Audio needed.

  static analyzeBuffer(audioBuffer) {
    if (!audioBuffer) return null
    try {
      const sr       = audioBuffer.sampleRate
      const samples  = audioBuffer.getChannelData(0)
      const limit    = Math.min(samples.length, sr * 8)

      // Simple energy split via brute-force frequency bands using a tiny DFT
      // on overlapping 512-sample windows. Not a real FFT — just sufficient for
      // the fingerprint.
      const WIN   = 512
      const HOP   = 256
      let bass = 0, mid = 0, treble = 0, frames = 0
      let prevEnergy = 0, onsets = 0

      for (let start = 0; start + WIN < limit; start += HOP) {
        let b = 0, m = 0, tr = 0, energy = 0
        for (let i = 0; i < WIN; i++) {
          const s = Math.abs(samples[start + i])
          energy += s * s
          // Approximate frequency bins via sample-domain heuristic:
          // bass = low 10%, mid = next 20%, treble = rest
          if (i < WIN * 0.10) b  += s
          else if (i < WIN * 0.30) m  += s
          else tr += s
        }
        const rms = Math.sqrt(energy / WIN)
        if (rms > prevEnergy * 1.3 && rms > 0.02) onsets++
        prevEnergy = rms

        bass   += b / (WIN * 0.10)
        mid    += m / (WIN * 0.20)
        treble += tr / (WIN * 0.70)
        frames++
      }

      if (frames === 0) return null

      const total = bass + mid + treble || 1
      const onsetDensity = Math.min(1, onsets / (frames * 0.15))

      return {
        bassRatio:    bass   / total,
        midRatio:     mid    / total,
        trebleRatio:  treble / total,
        onsetDensity,
      }
    } catch (_) {
      return null
    }
  }
}

export const mappingEngine = new MappingEngine()
