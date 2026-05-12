export default {
  slug: 'flo',
  name: 'Flo',
  description: 'Field observation log — seasonal notes and ecological encounter records',
  status: 'archival',
  home: { x: 0.28, y: 0.68 },
  glyph: {
    ascii: '☰',
    svg: `<g stroke="#AFA9EC" stroke-width="1.2" fill="none" stroke-linecap="round"><rect x="-7" y="-9" width="14" height="18" rx="1"/><line x1="-4" y1="-3" x2="4" y2="-3"/><line x1="-4" y1="1" x2="4" y2="1"/><line x1="-4" y1="5" x2="4" y2="5"/></g>`,
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
