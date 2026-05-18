import { useRef, useState } from 'react'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import cloudManifest from '@/murmur/clouds/_manifest.js'
import { checkFileFormat } from '@/murmur/clouds/loaders.js'

export default function CloudPicker() {
  const [open, setOpen]       = useState(false)
  const [tab, setTab]         = useState('library')   // 'library' | 'upload'
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview]   = useState(null)       // { file, count, bbox, meta }
  const [metaPlace, setMetaPlace]   = useState('')
  const [metaDate, setMetaDate]     = useState('')
  const [metaNotes, setMetaNotes]   = useState('')
  const [formatErr, setFormatErr]   = useState(null)
  const [uploading, setUploading]   = useState(false)

  const fileInputRef = useRef(null)

  const cloud              = useMurmurStore(s => s.cloud)
  const userClouds         = useMurmurStore(s => s.userClouds)
  const currentCloudSource = useMurmurStore(s => s.currentCloudSource)
  const loadCloud          = useMurmurStore(s => s.loadCloud)
  const loadCloudFromFile  = useMurmurStore(s => s.loadCloudFromFile)

  // ── drag handlers ──────────────────────────────────────────────────────
  function onDragOver(e) { e.preventDefault(); setDragging(true) }
  function onDragLeave()  { setDragging(false) }

  async function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function onBrowse(e) {
    const file = e.target.files[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  async function handleFile(file) {
    setFormatErr(null)
    setPreview(null)

    const check = checkFileFormat(file)
    if (!check.supported) { setFormatErr(check.message); return }

    try {
      const url = URL.createObjectURL(file)
      let geo
      try {
        geo = await new PLYLoader().loadAsync(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      geo.computeBoundingBox()
      const bb  = geo.boundingBox
      const count = geo.attributes.position.count
      geo.dispose()

      const bbox = {
        x: (bb.max.x - bb.min.x).toFixed(2),
        y: (bb.max.y - bb.min.y).toFixed(2),
        z: (bb.max.z - bb.min.z).toFixed(2),
      }

      setPreview({ file, count, bbox })
      setMetaPlace(''); setMetaDate(''); setMetaNotes('')
    } catch (err) {
      setFormatErr(`Could not read file: ${err.message}`)
    }
  }

  async function handleLoad() {
    if (!preview) return
    setUploading(true)
    try {
      const userMeta = {
        name:     preview.file.name.replace(/\.ply$/i, ''),
        place:    metaPlace  || undefined,
        captured: metaDate   || undefined,
        description: metaNotes || undefined,
      }
      await loadCloudFromFile({ file: preview.file, userMeta })
      setPreview(null)
      setOpen(false)
    } catch (err) {
      setFormatErr(err.message)
    } finally {
      setUploading(false)
    }
  }

  function clearPreview() { setPreview(null); setFormatErr(null) }

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="murmur-picker">
      <button
        className={`murmur-picker-toggle${open ? ' murmur-picker-toggle--active' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="Switch cloud"
      >
        cloud
      </button>

      {open && (
        <div className="murmur-picker-panel">
          {/* Tabs */}
          <div className="murmur-picker-tabs">
            <button
              className={`murmur-picker-tab${tab === 'library' ? ' murmur-picker-tab--active' : ''}`}
              onClick={() => setTab('library')}
            >library</button>
            <button
              className={`murmur-picker-tab${tab === 'upload' ? ' murmur-picker-tab--active' : ''}`}
              onClick={() => setTab('upload')}
            >upload</button>
          </div>

          {/* ── Library tab ──────────────────────────────────────────── */}
          {tab === 'library' && (
            <ul className="murmur-picker-list">
              {cloudManifest.map(entry => {
                const active = currentCloudSource === 'default' && cloud?.id === entry.id
                return (
                  <li key={entry.id}>
                    <button
                      className={`murmur-picker-cloud${active ? ' murmur-picker-cloud--active' : ''}`}
                      onClick={() => { loadCloud(entry.id); setOpen(false) }}
                    >
                      {entry.name ?? entry.id}
                    </button>
                  </li>
                )
              })}

              {userClouds.length > 0 && (
                <>
                  <li className="murmur-picker-divider" aria-hidden="true" />
                  {userClouds.map((uc, i) => {
                    const active = currentCloudSource === 'user' && cloud?.id === uc.id
                    return (
                      <li key={uc.id}>
                        <button
                          className={`murmur-picker-cloud${active ? ' murmur-picker-cloud--active' : ''}`}
                          onClick={() => { useMurmurStore.getState().setCloud(uc); setOpen(false) }}
                        >
                          {uc.meta?.name ?? uc.id}
                        </button>
                      </li>
                    )
                  })}
                </>
              )}
            </ul>
          )}

          {/* ── Upload tab ───────────────────────────────────────────── */}
          {tab === 'upload' && (
            <div className="murmur-picker-upload">
              {!preview ? (
                <>
                  <div
                    className={`murmur-picker-zone${dragging ? ' murmur-picker-zone--dragging' : ''}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                  >
                    <span className="murmur-picker-zone-label">
                      {dragging ? 'drop .ply' : 'drag .ply or click'}
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ply"
                    style={{ display: 'none' }}
                    onChange={onBrowse}
                  />
                  {formatErr && (
                    <p className="murmur-picker-err">{formatErr}</p>
                  )}
                </>
              ) : (
                <>
                  {/* Preview */}
                  <div className="murmur-picker-preview">
                    <p className="murmur-picker-preview-name">{preview.file.name}</p>
                    <dl className="murmur-picker-preview-stats">
                      <dt>points</dt>
                      <dd>{preview.count.toLocaleString()}{preview.count > 2_000_000 ? ' → 300k' : ''}</dd>
                      <dt>bbox</dt>
                      <dd>{preview.bbox.x} × {preview.bbox.y} × {preview.bbox.z}</dd>
                    </dl>
                  </div>

                  {/* Optional metadata */}
                  <div className="murmur-picker-meta">
                    <input
                      className="murmur-picker-meta-input"
                      placeholder="place (optional)"
                      value={metaPlace}
                      onChange={e => setMetaPlace(e.target.value)}
                    />
                    <input
                      className="murmur-picker-meta-input"
                      placeholder="date captured (optional)"
                      value={metaDate}
                      onChange={e => setMetaDate(e.target.value)}
                    />
                    <textarea
                      className="murmur-picker-meta-input murmur-picker-meta-notes"
                      placeholder="notes (optional)"
                      value={metaNotes}
                      onChange={e => setMetaNotes(e.target.value)}
                      rows={2}
                    />
                  </div>

                  {formatErr && <p className="murmur-picker-err">{formatErr}</p>}

                  <div className="murmur-picker-actions">
                    <button className="murmur-picker-cancel" onClick={clearPreview}>back</button>
                    <button
                      className="murmur-picker-load-btn"
                      onClick={handleLoad}
                      disabled={uploading}
                    >
                      {uploading ? 'loading…' : 'load cloud'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
