export default {
  slug: 'streamwise',
  name: 'Streamwise',
  description: 'Stream corridor habitat assessment and water quality monitoring',
  status: 'paused',
  home: { x: 0.66, y: 0.62 },
  glyph: {
    ascii: '≈',
  },
  behavior: {
    bobAmplitude: 4,
    bobPeriod: [2.9, 4.3],
    cursorAgitation: 1.2,
  },
  frame: {
    mode: 'iframe',
    target: 'https://streamwise-iota.vercel.app',
  },
}
