export default {
  slug: 'deepstream',
  name: 'Deepstream',
  description: 'Spatial data infrastructure and tooling for the deepstre.am ecosystem',
  status: 'active',
  home: { x: 0.50, y: 0.42 },
  glyph: {
    ascii: '◎',
    outline: [
      ' ███ ',
      '█   █',
      '█ █ █',
      '█   █',
      ' ███ ',
    ],
  },
  behavior: {
    bobAmplitude: 4,
    bobPeriod: [3.5, 4.1],
    cursorAgitation: 1.0,
  },
  frame: {
    mode: 'route',
    target: '/deepstream-info',
  },
}
