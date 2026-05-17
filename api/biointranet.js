const BASE_URL = 'https://liampmartin.com/biointranet'

export default async function handler(req, res) {
  try {
    const response = await fetch(BASE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; deepstream/1.0)' },
    })
    if (!response.ok) throw new Error(`upstream ${response.status}`)
    const html = await response.text()

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.json({ entries: parseEntries(html) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Cargo Collective sites use <media-item hash="..."> custom elements.
// The page JSON contains "name":"FILENAME","hash":"HASH" pairs used to
// build freight.cargo.site CDN URLs.
// Entry types:
//   header  — project title block (column-unit containing <h2>); lines[]
//   image   — media-item with optional caption string
//   text    — wide column-unit text; paragraphs[] (double-<br> splits)
export function parseEntries(html) {
  const raw = []

  // ── Build hash → filename lookup from embedded page JSON ─────────────────
  const hashToName = {}
  const nameHashRe = /"name":"([^"]+)","hash":"([^"]+)"/g
  let nh
  while ((nh = nameHashRe.exec(html)) !== null) {
    hashToName[nh[2]] = nh[1]
  }

  // ── Images ───────────────────────────────────────────────────────────────
  const mediaRe = /<media-item([^>]*)>([\s\S]*?)<\/media-item>/gi
  let m
  while ((m = mediaRe.exec(html)) !== null) {
    const hashM = /\bhash="([^"]+)"/.exec(m[1])
    if (!hashM) continue
    const hash     = hashM[1]
    const filename = hashToName[hash]
    if (!filename) continue
    const inner = m[2]
    const end   = m.index + m[0].length

    let caption = ''
    // figcaption slot="caption" inside element
    const capM = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(inner)
    if (capM) caption = stripTags(capM[1])

    // span.caption within 600 chars after closing tag
    if (!caption) {
      const after = html.slice(end, end + 600)
      const spanM = /<span[^>]*class="[^"]*caption[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(after)
      if (spanM) caption = stripTags(spanM[1])
    }

    // bare <i>text</i> (no nested tags) within 200 chars after — Cargo uses these
    if (!caption) {
      const after = html.slice(end, end + 200)
      const iM = /^[\s\S]*?<i>([^<]+)<\/i>/i.exec(after)
      if (iM) caption = iM[1].trim()
    }

    raw.push({
      pos:     m.index,
      type:    'image',
      src:     `https://freight.cargo.site/w/1200/i/${hash}/${filename}`,
      caption,
    })
  }

  // ── Text + header blocks ─────────────────────────────────────────────────
  const unitRe = /<column-unit([^>]*)>([\s\S]*?)<\/column-unit>/gi
  while ((m = unitRe.exec(html)) !== null) {
    const spanM = /\bspan="(\d+)"/.exec(m[1])
    if (!spanM || parseInt(spanM[1], 10) < 4) continue
    const inner = m[2]

    // Header block: column-unit that contains the page <h2> title
    if (/<h2/i.test(inner)) {
      const lines = inner
        .replace(/<h2[^>]*>[\s\S]*?<\/h2>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
      if (lines.length > 0) raw.push({ pos: m.index, type: 'header', lines })
      continue
    }

    // Regular text: preserve paragraph breaks, split on double <br>
    const paragraphs = inner
      .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .split('\n\n')
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(p => p.length > 30)

    if (paragraphs.length > 0) raw.push({ pos: m.index, type: 'text', paragraphs })
  }

  raw.sort((a, b) => a.pos - b.pos)
  return raw.map(({ pos: _p, ...entry }) => entry)
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}
