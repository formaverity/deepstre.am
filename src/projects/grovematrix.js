export default {
  slug: 'grovematrix',
  name: 'GroveMatrix',
  description: 'Point-cloud mapping and spatial analysis of native grove structure',
  status: 'paused',
  home: { x: 0.42, y: 0.56 },
  glyph: {
    ascii: '∷',
  },
  behavior: {
    bobAmplitude: 4,
    bobPeriod: [5.2, 3.6],
    cursorAgitation: 0.8,
  },
  frame: {
    mode: 'iframe',
    target: 'https://grovematrix.vercel.app',
  },
}
