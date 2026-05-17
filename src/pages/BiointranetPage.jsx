import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './pages.css'

function organizeEntries(entries) {
  const header  = entries.find(e => e.type === 'header')
  const gallery = entries.filter(e => e.type === 'image' && !e.caption)
  const rest    = entries.filter(e => e.type !== 'header' && !(e.type === 'image' && !e.caption))

  const out = []
  if (header) out.push(header)
  if (gallery.length > 0) out.push({ type: 'gallery', images: gallery })
  out.push(...rest)
  return out
}

export default function BiointranetPage() {
  const [entries, setEntries] = useState(null)
  const [error, setError]     = useState(null)
  const navigate              = useNavigate()

  useEffect(() => {
    fetch('/api/biointranet')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setEntries(data.entries)
      })
      .catch(e => setError(e.message))
  }, [])

  const organized = entries ? organizeEntries(entries) : null

  return (
    <div className="bio-root">
      <nav className="bio-nav" aria-label="breadcrumb">
        <Link to="/" className="page-breadcrumb-link">deepstre.am</Link>
        <span className="page-breadcrumb-sep">/</span>
        <span className="page-breadcrumb-current">biointranet</span>
      </nav>
      <button className="bio-close" onClick={() => navigate('/')} aria-label="Back to pond">✕</button>

      <div className="bio-feed">
        {organized === null && !error && (
          <p className="bio-status">loading…</p>
        )}
        {error && (
          <p className="bio-status bio-status--error">{error}</p>
        )}
        {organized?.length === 0 && (
          <p className="bio-status">no entries</p>
        )}

        {organized?.map((entry, i) => {
          if (entry.type === 'header') {
            const [title, ...meta] = entry.lines
            return (
              <header key={i} className="bio-header">
                <p className="bio-header-title">{title}</p>
                {meta.map((line, j) => (
                  <p key={j} className="bio-header-line">{line}</p>
                ))}
              </header>
            )
          }

          if (entry.type === 'gallery') {
            return (
              <section key={i} className="bio-gallery">
                {entry.images.map((img, j) => (
                  <img
                    key={j}
                    className="bio-gallery-img"
                    src={img.src}
                    alt=""
                    loading="lazy"
                  />
                ))}
              </section>
            )
          }

          if (entry.type === 'image') {
            return (
              <article key={i} className="bio-highlight">
                <img
                  className="bio-img"
                  src={entry.src}
                  alt={entry.caption}
                  loading="lazy"
                />
                <p className="bio-caption">{entry.caption}</p>
              </article>
            )
          }

          if (entry.type === 'text') {
            return (
              <div key={i} className="bio-text-block">
                {entry.paragraphs.map((p, j) => (
                  <p key={j} className="bio-text">{p}</p>
                ))}
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
