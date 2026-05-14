export default {
  slug: 'flo',
  name: 'Flo',
  description: 'Field observation log — seasonal notes and ecological encounter records',
  status: 'archival',
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
    target: 'https://flo-app-silk.vercel.app',
  },
}
