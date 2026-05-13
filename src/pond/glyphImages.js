import { colorForStatus } from './statusColors.js'

// Module-level cache: `${url}__${color}` → HTMLImageElement
// The image may still be loading when first returned — callers check .complete.
const _cache = new Map()

function normalizeSvgColors(svgText, color) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const walk = (el) => {
    if (el.nodeType !== 1) return
    const fill = el.getAttribute('fill')
    if (fill !== null && fill.toLowerCase() !== 'none') el.setAttribute('fill', color)
    const stroke = el.getAttribute('stroke')
    if (stroke !== null && stroke.toLowerCase() !== 'none') el.setAttribute('stroke', color)
    for (const child of el.children) walk(child)
  }
  walk(doc.documentElement)
  return new XMLSerializer().serializeToString(doc)
}

// Returns an HTMLImageElement that begins loading asynchronously.
// Repeated calls with the same url+status return the cached instance.
export function loadColoredSvg(url, status) {
  const color = colorForStatus(status)
  const key = `${url}__${color}`
  if (_cache.has(key)) return _cache.get(key)

  const img = new Image()
  _cache.set(key, img)

  fetch(url)
    .then(r => r.text())
    .then(text => {
      const normalized = normalizeSvgColors(text, color)
      const blob = new Blob([normalized], { type: 'image/svg+xml' })
      img.src = URL.createObjectURL(blob)
    })
    .catch(err => console.error('[glyphImages] failed to load', url, err))

  return img
}
