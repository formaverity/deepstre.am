export default {
  slug: 'beechlens',
  name: 'BeechLens',
  description: 'Time-lapse phenology and canopy spectral analysis for beech woodland',
  status: 'active',
  home: { x: 0.58, y: 0.28 },
  glyph: {
    ascii: '◈',
  },
  behavior: {
    bobAmplitude: 4,
    bobPeriod: [4.1, 3.8],
    cursorAgitation: 1.0,
  },
  frame: {
    mode: 'iframe',
    target: 'https://beechlens.vercel.app',
  },
}
