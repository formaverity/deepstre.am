import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Dev-mode handler for /api/biointranet — mirrors api/biointranet.js.
// Vite's static file server would otherwise serve the .js source literally.
function biointranetDevApi() {
  const BASE = 'https://liampmartin.com/biointranet'

  function stripTags(h) { return h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }

  function parseEntries(html) {
    const raw = []
    let m

    // Build hash → filename lookup from embedded page JSON
    const hashToName = {}
    const nameHashRe = /"name":"([^"]+)","hash":"([^"]+)"/g
    let nh
    while ((nh = nameHashRe.exec(html)) !== null) {
      hashToName[nh[2]] = nh[1]
    }

    // Images
    const mediaRe = /<media-item([^>]*)>([\s\S]*?)<\/media-item>/gi
    while ((m = mediaRe.exec(html)) !== null) {
      const hashM = /\bhash="([^"]+)"/.exec(m[1])
      if (!hashM) continue
      const hash     = hashM[1]
      const filename = hashToName[hash]
      if (!filename) continue
      const inner = m[2]
      const end   = m.index + m[0].length

      let caption = ''
      const capM  = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(inner)
      if (capM) caption = stripTags(capM[1])

      if (!caption) {
        const after = html.slice(end, end + 600)
        const spanM = /<span[^>]*class="[^"]*caption[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(after)
        if (spanM) caption = stripTags(spanM[1])
      }

      if (!caption) {
        const after = html.slice(end, end + 200)
        const iM = /^[\s\S]*?<i>([^<]+)<\/i>/i.exec(after)
        if (iM) caption = iM[1].trim()
      }

      raw.push({ pos: m.index, type: 'image', src: `https://freight.cargo.site/w/1200/i/${hash}/${filename}`, caption })
    }

    // Text + header blocks
    const unitRe = /<column-unit([^>]*)>([\s\S]*?)<\/column-unit>/gi
    while ((m = unitRe.exec(html)) !== null) {
      const spanM = /\bspan="(\d+)"/.exec(m[1])
      if (!spanM || parseInt(spanM[1], 10) < 4) continue
      const inner = m[2]

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
    return raw.map(({ pos: _p, ...e }) => e)
  }

  return {
    name: 'biointranet-dev-api',
    configureServer(server) {
      // Runs before Vite's static file middleware — prevents the .js source being served raw
      server.middlewares.use('/api/biointranet', async (_req, res) => {
        try {
          const r = await fetch(BASE, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; deepstream/1.0)' } })
          if (!r.ok) throw new Error(`upstream ${r.status}`)
          const entries = parseEntries(await r.text())
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ entries }))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), biointranetDevApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
