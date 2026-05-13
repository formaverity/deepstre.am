export default {
  slug: 'murmur',
  name: 'MURMUR',
  description: 'point cloud audio instrument',
  status: 'active',
  home: { x: 0.52, y: 0.50 },
  glyph: {
    ascii: '∴',
    svgUrl: '/glyphs/murmur_icon.svg',
    svg: `<g fill="#B9A0E0"><circle cx="-5" cy="4" r="1.5"/><circle cx="5" cy="4" r="1.5"/><circle cx="0" cy="-2" r="1.5"/><circle cx="-9" cy="8" r="0.9"/><circle cx="9" cy="8" r="0.9"/><circle cx="-3" cy="-7" r="0.9"/><circle cx="3" cy="-7" r="0.9"/></g>`,
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
