export default {
  slug: 'g2tree',
  name: 'G2Tree',
  description: 'Forest carbon accounting and tree growth measurement at G2 plots',
  status: 'active',
  home: { x: 0.32, y: 0.40 },
  glyph: {
    ascii: '❋',
    outline: [
      ' ██ ',
      '████',
      '████',
      ' ██ ',
      ' ██ ',
    ],
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
