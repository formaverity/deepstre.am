export default {
  slug: 'flo',
  name: 'wtflo.io',
  description: 'living notation of the phenomenal field — attention, encounter, passage',
  status: 'active',
  home: { x: 0.28, y: 0.68 },
  glyph: {
    ascii: '☰',
    outline: [
      '█████',
      '█   █',
      '█   █',
      '█   █',
      '█████',
    ],
  },
  behavior: {
    bobAmplitude: 4,
    bobPeriod: [4.8, 5.5],
    cursorAgitation: 0.6,
  },
  frame: {
    mode: 'iframe',
    target: 'https://www.wtflo.io',
  },
}
