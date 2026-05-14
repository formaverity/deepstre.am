export default {
  slug: 'murmur',
  name: 'MURMUR',
  description: 'point cloud audio instrument',
  status: 'active',
  home: { x: 0.52, y: 0.50 },
  glyph: {
    ascii: '∴',
    outline: [
      '██ █ ',
      '██ ██',
      '█ ██ ',
      ' ███ ',
      '██ █ ',
    ],
  },
  behavior: {
    bobAmplitude: 4,
    bobPeriod: [4.8, 3.7],
    cursorAgitation: 0.85,
  },
  frame: {
    mode: 'route',
    target: '/murmur',
  },
  link: {
    about: '/murmur/about',
  },
}
