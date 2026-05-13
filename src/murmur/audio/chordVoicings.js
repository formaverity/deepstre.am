export const VOICING_PRESETS = [
  { id: 'thirds',  label: 'Thirds',   intervalsMaj: [0, 4, 7],          intervalsMin: [0, 3, 7]          },
  { id: 'open',    label: 'Open',     intervalsMaj: [0, 7, 12, 19],     intervalsMin: [0, 7, 12, 19]     },
  { id: 'quartal', label: 'Quartal',  intervalsMaj: [0, 5, 10],         intervalsMin: [0, 5, 10]         },
  { id: 'unison',  label: 'Unison ×', intervalsMaj: [0, 0.07, -0.07],   intervalsMin: [0, 0.07, -0.07]   },
  { id: 'custom',  label: 'Custom',   intervalsMaj: null,                intervalsMin: null               },
]

export function resolveIntervals(chordConfig) {
  if (chordConfig.preset === 'custom') {
    return chordConfig.customIntervals.slice(0, chordConfig.voices)
  }
  const preset = VOICING_PRESETS.find(p => p.id === chordConfig.preset)
  if (!preset) return [0]
  return (chordConfig.isMinor ? preset.intervalsMin : preset.intervalsMaj) ?? [0]
}
