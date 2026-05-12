export default {
  slug: 'g2tree',
  name: 'G2Tree',
  description: 'Forest carbon accounting and tree growth measurement at G2 plots',
  status: 'active',
  home: { x: 0.32, y: 0.40 },
  glyph: {
    ascii: '❋',
    svg: `<g stroke="#9FE1CB" stroke-width="1.2" fill="none" stroke-linecap="round"><line x1="0" y1="11" x2="0" y2="-3"/><line x1="0" y1="5" x2="-6" y2="2"/><line x1="0" y1="5" x2="6" y2="2"/><line x1="0" y1="0" x2="-5" y2="-3"/><line x1="0" y1="0" x2="5" y2="-3"/><line x1="0" y1="-3" x2="-3" y2="-7"/><line x1="0" y1="-3" x2="3" y2="-7"/></g>`,
  },
  behavior: {
    bobAmplitude: 4,
    bobPeriod: [3.2, 4.7],
    cursorAgitation: 1.0,
  },
  frame: {
    mode: 'iframe',
    target: 'https://g2tree.vercel.app',
  },
}
