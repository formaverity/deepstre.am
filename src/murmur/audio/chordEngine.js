// Algorithmic chord voicing — replaces user-controlled ChordPicker.
// Voicing is determined once per audio×cloud pairing.

export const VOICINGS = [
  { id: 'thirds',  intervalsMaj: [0, 4, 7],          intervalsMin: [0, 3, 7]          },
  { id: 'open',    intervalsMaj: [0, 7, 12, 19],     intervalsMin: [0, 7, 12, 19]     },
  { id: 'quartal', intervalsMaj: [0, 5, 10],         intervalsMin: [0, 5, 10]         },
  { id: 'unison',  intervalsMaj: [0, 0.07, -0.07],   intervalsMin: [0, 0.07, -0.07]   },
]

class ChordEngine {
  constructor() {
    // Default: thirds, major
    this.voicingId = 'thirds'
    this.isMinor   = false
  }

  // Called once per pairing — audioFingerprint and cloudFingerprint from mappingEngine
  computeVoicing(audioFingerprint, cloudAffinities) {
    if (!audioFingerprint) {
      this.voicingId = 'thirds'
      this.isMinor   = false
      return
    }

    const { bassRatio = 0.3, midRatio = 0.4, trebleRatio = 0.3, onsetDensity = 0.5 } = audioFingerprint

    // Spectral flatness proxy: similar bands → noise-like (pads, drones)
    const avg  = (bassRatio + midRatio + trebleRatio) / 3
    const dev  = Math.abs(bassRatio - avg) + Math.abs(trebleRatio - avg)
    const flatness = 1 - Math.min(1, dev * 3)   // 0=tonal/peaky, 1=flat/noisy

    // High flatness (pad-heavy) → unison or open (don't add harmonic content)
    // Mid flatness (melodic)    → thirds (adds the most)
    // Low flatness, high onset (percussive) → quartal (ambiguous, rhythm-friendly)
    if (flatness > 0.65) {
      this.voicingId = flatness > 0.82 ? 'unison' : 'open'
    } else if (onsetDensity > 0.55) {
      this.voicingId = 'quartal'
    } else {
      this.voicingId = 'thirds'
    }

    // Major vs minor: determined by cloud's average hue warmth
    // warm (reds/oranges/yellows 0–60° and 300–360°) → major
    // cool (greens/blues/purples 120–300°) → minor
    if (cloudAffinities && cloudAffinities.length) {
      let warmScore = 0
      for (const aff of cloudAffinities) {
        // pitchClass 0–11 maps to 0–330° hue; warm pitches ≈ 0–2, 10–11
        const pc = aff.pitchClass
        const isWarm = pc <= 2 || pc >= 10
        warmScore += (isWarm ? 1 : -1) * (aff.affinityStrength || 0.5)
      }
      this.isMinor = warmScore < 0
    } else {
      this.isMinor = false
    }
  }

  // Returns intervals array for the current voicing + tonality
  getIntervals() {
    const v = VOICINGS.find(v => v.id === this.voicingId) ?? VOICINGS[0]
    return this.isMinor ? v.intervalsMin : v.intervalsMaj
  }

  get voiceCount() {
    return this.getIntervals().length
  }
}

export const chordEngine = new ChordEngine()
