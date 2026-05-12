export default {
  slug: 'thesis',
  name: 'Thesis',
  description: 'Research thesis on ecological phenomenology and landscape perception',
  status: 'active',
  home: { x: 0.40, y: 0.30 },
  glyph: {
    ascii: '⊠',
    svg: `<g stroke="#F0997B" stroke-width="1.2" fill="none" stroke-linecap="round"><rect x="-8" y="-8" width="16" height="16"/><line x1="-8" y1="-8" x2="8" y2="8"/><line x1="8" y1="-8" x2="-8" y2="8"/></g>`,
  },
  behavior: {
    bobAmplitude: 4,
    bobPeriod: [4.4, 3.2],
    cursorAgitation: 0.9,
  },
  frame: {
    mode: 'route',
    target: '/thesis',
  },
}
