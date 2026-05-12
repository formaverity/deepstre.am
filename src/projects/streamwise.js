export default {
  slug: 'streamwise',
  name: 'Streamwise',
  description: 'Stream corridor habitat assessment and water quality monitoring',
  status: 'paused',
  home: { x: 0.66, y: 0.62 },
  glyph: {
    ascii: '≈',
    svg: `<g stroke="#85B7EB" stroke-width="1.2" fill="none" stroke-linecap="round"><path d="M-10 -3 C-6 -7 -2 1 2 -3 C6 -7 8 1 10 -3"/><path d="M-10 3 C-6 -1 -2 7 2 3 C6 -1 8 7 10 3"/></g>`,
  },
  behavior: {
    bobAmplitude: 4,
    bobPeriod: [2.9, 4.3],
    cursorAgitation: 1.2,
  },
  frame: {
    mode: 'iframe',
    target: 'https://streamwise-iota.vercel.app',
  },
}
