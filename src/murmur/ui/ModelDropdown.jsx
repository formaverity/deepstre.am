import { useCallback, useEffect, useRef, useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import cloudManifest from '@/murmur/clouds/_manifest.js'
import { checkFileFormat } from '@/murmur/clouds/loaders.js'

const WAVE = '▁▂▃▄▅▆▇█▇▆▅▄▃▂▁'

export default function ModelDropdown() {
  const cloud             = useMurmurStore(s => s.cloud)
  const cloudLoading      = useMurmurStore(s => s.cloudLoading)
  const cloudError        = useMurmurStore(s => s.cloudError)
  const loadCloud         = useMurmurStore(s => s.loadCloud)
  const loadCloudFromFile = useMurmurStore(s => s.loadCloudFromFile)
  const setCloud          = useMurmurStore(s => s.setCloud)
  const userClouds        = useMurmurStore(s => s.userClouds)

  const [menuOpen, setMenuOpen]           = useState(false)
  const [cloudUploading, setCloudUploading] = useState(false)
  const [uploadError, setUploadError]     = useState(null)
  const [waveOff, setWaveOff]             = useState(0)

  const cloudInputRef = useRef()
  const menuRef       = useRef()

  // Wave animation while loading
  useEffect(() => {
    if (!cloudLoading && !cloudUploading) { setWaveOff(0); return }
    const id = setInterval(() => setWaveOff(o => (o + 1) % WAVE.length), 80)
    return () => clearInterval(id)
  }, [cloudLoading, cloudUploading])

  // Auto-dismiss upload error
  useEffect(() => {
    if (!uploadError) return
    const id = setTimeout(() => setUploadError(null), 4000)
    return () => clearTimeout(id)
  }, [uploadError])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [menuOpen])

  const handleCloudSelect = useCallback((entry) => {
    setMenuOpen(false)
    // Preserve granular buffer position across cloud swap
    const savedPos = audioEngine.granularBufferPosition
    const uc = userClouds.find(u => u.id === entry.id)
    if (uc) {
      setCloud(uc)
    } else {
      loadCloud(entry.id)
    }
    // Restore after swap (async, but granularBufferPosition is restored immediately)
    audioEngine.granularBufferPosition = savedPos
  }, [loadCloud, setCloud, userClouds])

  const handleFileInput = useCallback(async (file) => {
    if (!file) return
    const check = checkFileFormat(file)
    if (!check.supported) { setUploadError(check.message); return }
    setUploadError(null)
    setCloudUploading(true)
    setMenuOpen(false)
    const savedPos = audioEngine.granularBufferPosition
    try {
      await loadCloudFromFile({ file, userMeta: { name: file.name.replace(/\.ply$/i, '') } })
      audioEngine.granularBufferPosition = savedPos
      // Trigger pairing recompute after new cloud is loaded
      const cloud = useMurmurStore.getState().cloud
      if (cloud) audioEngine.onCloudLoaded(cloud)
    } catch (err) {
      setUploadError(err.message || 'cloud load failed')
    } finally {
      setCloudUploading(false)
    }
  }, [loadCloudFromFile])

  // Trigger pairing recompute when cloud changes
  useEffect(() => {
    if (cloud) audioEngine.onCloudLoaded(cloud)
  }, [cloud])

  const waveStr   = WAVE.slice(waveOff) + WAVE.slice(0, waveOff)
  const isLoading = cloudLoading || cloudUploading
  const displayName = cloud?.meta?.name ?? cloud?.id ?? null

  // Cloud meta line fields (omit missing)
  const meta = cloud?.meta
  const metaParts = []
  if (cloud?.count) metaParts.push(`${(cloud.count / 1000).toFixed(0)}k pts`)
  if (meta?.place)    metaParts.push(meta.place)
  if (meta?.captured) metaParts.push(meta.captured)
  const metaLine = metaParts.join(' · ')

  // All models for the menu: bundled + user
  const allModels = [
    ...cloudManifest.map(e => ({ id: e.id, name: e.name ?? e.id, isUser: false })),
    ...userClouds.map(u => ({ id: u.id, name: `↑ ${u.meta?.name ?? u.id}`, isUser: true })),
  ]

  return (
    <div className="sd-root sd-root--model" ref={menuRef}>

      {/* Floating menu */}
      {menuOpen && (
        <div className="sd-menu" role="listbox" aria-label="model source">
          {allModels.map(entry => (
            <button
              key={entry.id}
              className={`sd-option${cloud?.id === entry.id ? ' sd-option--active' : ''}`}
              onClick={() => handleCloudSelect(entry)}
              role="option"
              aria-selected={cloud?.id === entry.id}
            >
              {entry.name}
            </button>
          ))}
          <div className="sd-divider" />
          <button
            className="sd-option sd-option--upload"
            onClick={() => { cloudInputRef.current?.click(); setMenuOpen(false) }}
            disabled={cloudUploading}
          >
            ↑ upload .ply file…
          </button>
        </div>
      )}

      {/* Trigger row */}
      <button
        className="sd-trigger"
        onClick={() => setMenuOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label="model source"
      >
        <span className="sd-label">place:</span>
        <span className="sd-content">
          {isLoading
            ? <span className="sd-name sd-name--dim">{waveStr} loading…</span>
            : cloudError
              ? <span className="sd-name sd-name--err">× couldn't load model</span>
              : <span className="sd-name">{displayName ?? 'no model'}</span>
          }
        </span>
        <span className="sd-chevron" aria-hidden="true">{menuOpen ? '▾' : '▴'}</span>
      </button>

      {/* Meta line — always visible when a cloud is loaded */}
      {metaLine && !isLoading && (
        <p className="sd-meta">{metaLine}</p>
      )}
      {uploadError && (
        <p className="sd-meta sd-meta--err">{uploadError}</p>
      )}

      <input
        ref={cloudInputRef}
        type="file"
        accept=".ply"
        style={{ display: 'none' }}
        onChange={e => { handleFileInput(e.target.files[0]); e.target.value = '' }}
      />
    </div>
  )
}
