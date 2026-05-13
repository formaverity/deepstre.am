export default {
  slug: 'grovematrix',
  name: 'GroveMatrix',
  description: 'Point-cloud mapping and spatial analysis of native grove structure',
  status: 'paused',
  home: { x: 0.42, y: 0.56 },
  glyph: {
    ascii: '∷',
    blob: [
      '∴ ∴',
      ' ∴ ',
      '∴ ∴',
    ],
    svgUrl: '/glyphs/grovematrix_G.svg',
    svg: `<g fill="#97C459"><circle cx="-7" cy="-6" r="1.2"/><circle cx="1" cy="-9" r="1.2"/><circle cx="8" cy="-3" r="1.2"/><circle cx="-2" cy="-1" r="1.2"/><circle cx="6" cy="5" r="1.2"/><circle cx="-7" cy="5" r="1.2"/><circle cx="0" cy="9" r="1.2"/></g>`,
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
