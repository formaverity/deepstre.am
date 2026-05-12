export default {
  slug: 'deepstream',
  name: 'Deepstream',
  description: 'Spatial data infrastructure and tooling for the deepstre.am ecosystem',
  status: 'active',
  home: { x: 0.50, y: 0.42 },
  glyph: {
    ascii: '◎',
    svg: `<g stroke="#5DCAA5" stroke-width="1.2" fill="none" stroke-linecap="round"><circle cx="0" cy="0" r="5"/><circle cx="0" cy="0" r="9"/><line x1="0" y1="-12" x2="0" y2="-10"/><line x1="12" y1="0" x2="10" y2="0"/><line x1="0" y1="12" x2="0" y2="10"/><line x1="-12" y1="0" x2="-10" y2="0"/></g>`,
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
