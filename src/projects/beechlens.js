export default {
  slug: 'beechlens',
  name: 'BeechLens',
  description: 'Time-lapse phenology and canopy spectral analysis for beech woodland',
  status: 'active',
  home: { x: 0.58, y: 0.28 },
  glyph: {
    ascii: '◈',
    blob: [
      ' ≈ ',
      '≈❋≈',
      ' ≈ ',
    ],
    svgUrl: '/glyphs/beechlens_icon.svg',
    svg: `<g stroke="#C0DD97" stroke-width="1.2" fill="none" stroke-linecap="round"><path d="M0 -10 C7 -4 7 4 0 10 C-7 4 -7 -4 0 -10Z"/><line x1="0" y1="-9" x2="0" y2="9"/><line x1="0" y1="-2" x2="4" y2="2"/><line x1="0" y1="-2" x2="-4" y2="2"/><line x1="0" y1="3" x2="3" y2="6"/><line x1="0" y1="3" x2="-3" y2="6"/></g>`,
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
