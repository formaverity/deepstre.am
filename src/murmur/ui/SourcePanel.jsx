import { useCallback, useEffect, useRef, useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import cloudManifest from '@/murmur/clouds/_manifest.js'
import { checkFileFormat } from '@/murmur/clouds/loaders.js'

const WAVE = '▁▂▃▄▅▆▇█▇▆▅▄▃▂▁'

const POND_ALBUM = [
  { id: '01', label: 'pond',      url: '/clouds/POND%20ALBUM/01_Pond_1021.mp3' },
  { id: '02', label: 'radiators', url: '/clouds/POND%20ALBUM/02_Radiators.mp3' },
  { id: '03', label: 'hum',       url: '/clouds/POND%20ALBUM/03_Hum.mp3'       },
  { id: '04', label: "l'enfant",  url: '/clouds/POND%20ALBUM/04_Lenfant.mp3'   },
  { id: '05', label: 'canarium',  url: '/clouds/POND%20ALBUM/05_Canarium.mp3'  },
  { id: '06', label: 'opal',      url: '/clouds/POND%20ALBUM/05_Opal.mp3'      },
]

function fmt(t) {
  if (!t || !isFinite(t)) return '00:00'
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  const s = Math.floor(t % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function SourcePanel() {
  const mode              = useMurmurStore(s => s.mode)
  const cloud             = useMurmurStore(s => s.cloud)
  const audioState        = useMurmurStore(s => s.audio)
  const cloudLoading      = useMurmurStore(s => s.cloudLoading)
  const loadCloud         = useMurmurStore(s => s.loadCloud)
  const loadCloudFromFile = useMurmurStore(s => s.loadCloudFromFile)
  const setCloud          = useMurmurStore(s => s.setCloud)
  const userClouds        = useMurmurStore(s => s.userClouds)

  const [open, setOpen]               = useState(!audioState.isLoaded)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError]   = useState(null)
  const [cloudError, setCloudError]   = useState(null)
  const [cloudUploading, setCloudUploading] = useState(false)
  const [activeTrackUrl, setActiveTrackUrl] = useState(null)
  const [bodyDrag, setBodyDrag]       = useState(false)
  const [waveOff, setWaveOff]         = useState(0)

  // Transport (RAF-updated)
  const [playing, setPlaying] = useState(false)
  const [posSecs, setPosSecs] = useState(0)
  const [looped, setLooped]   = useState(() => audioEngine.loop)
  const [bpm, setBpm]         = useState(null)

  const audioInputRef = useRef()
  const cloudInputRef = useRef()
  const scrubRef      = useRef()
  const scrubDragging = useRef(false)
  const rafRef        = useRef()

  useEffect(() => {
    if (!audioLoading) { setWaveOff(0); return }
    const id = setInterval(() => setWaveOff(o => (o + 1) % WAVE.length), 80)
    return () => clearInterval(id)
  }, [audioLoading])

  useEffect(() => {
    if (!audioError) return
    const id = setTimeout(() => setAudioError(null), 5000)
    return () => clearTimeout(id)
  }, [audioError])

  useEffect(() => {
    if (!cloudError) return
    const id = setTimeout(() => setCloudError(null), 5000)
    return () => clearTimeout(id)
  }, [cloudError])

  useEffect(() => {
    const tick = () => {
      const ip  = audioEngine.isPlaying
      const pos = audioEngine.playbackSecs
      if (!scrubDragging.current && scrubRef.current) scrubRef.current.value = pos
      setPosSecs(Math.floor(pos))
      setPlaying(prev => prev !== ip ? ip : prev)
      setBpm(prev => { const b = audioEngine.detectedBPM; return prev !== b ? b : prev })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAudioFile = useCallback(async (file) => {
    if (!file) return
    setAudioError(null)
    setAudioLoading(true)
    setActiveTrackUrl(null)
    try {
      await audioEngine.start()
      await audioEngine.loadBuffer(file)
      if (useMurmurStore.getState().mode === 'playback') audioEngine.play()
      setOpen(false)
    } catch {
      setAudioError('decode failed')
    } finally {
      setAudioLoading(false)
    }
  }, [])

  const loadTrack = useCallback(async (track) => {
    setAudioError(null)
    setAudioLoading(true)
    setActiveTrackUrl(track.url)
    try {
      await audioEngine.start()
      await audioEngine.loadBuffer(track.url)
      if (useMurmurStore.getState().mode === 'playback') audioEngine.play()
      setOpen(false)
    } catch {
      setAudioError('load failed')
      setActiveTrackUrl(null)
    } finally {
      setAudioLoading(false)
    }
  }, [])

  const handleCloudFile = useCallback(async (file) => {
    if (!file) return
    const check = checkFileFormat(file)
    if (!check.supported) { setCloudError(check.message); return }
    setCloudError(null)
    setCloudUploading(true)
    try {
      await loadCloudFromFile({ file, userMeta: { name: file.name.replace(/\.ply$/i, '') } })
    } catch (err) {
      setCloudError(err.message || 'cloud load failed')
    } finally {
      setCloudUploading(false)
    }
  }, [loadCloudFromFile])

  const handleBodyDrop = useCallback((e) => {
    e.preventDefault()
    setBodyDrag(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (/\.ply$/i.test(file.name)) handleCloudFile(file)
    else handleAudioFile(file)
  }, [handleAudioFile, handleCloudFile])

  const togglePlay = (e) => {
    e.stopPropagation()
    if (!audioState.isLoaded || mode === 'interactive') return
    if (audioEngine.isPlaying) audioEngine.pause()
    else audioEngine.play()
  }

  const toggleLoop = () => {
    const next = !looped
    audioEngine.setLoop(next)
    setLooped(next)
  }

  const onScrubStart = () => { scrubDragging.current = true }
  const onScrubEnd   = e  => { scrubDragging.current = false; audioEngine.seek(+e.target.value) }

  // ── Derived ───────────────────────────────────────────────────────────────

  const dur         = audioState.duration || 0
  const waveStr     = WAVE.slice(waveOff) + WAVE.slice(0, waveOff)
  const playable    = audioState.isLoaded && mode !== 'interactive'
  const cloudVal    = cloud?.id ?? ''

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="sp-root">

      {open && (
        <div
          className={`sp-body${bodyDrag ? ' sp-body--drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setBodyDrag(true) }}
          onDragLeave={() => setBodyDrag(false)}
          onDrop={handleBodyDrop}
        >
          {/* Scrubber row — only when audio is loaded */}
          {audioState.isLoaded && (
            <div className="sp-row sp-row--scrub">
              <input
                ref={scrubRef}
                type="range"
                className="sp-scrub"
                min={0} max={dur || 100} step={0.1} defaultValue={0}
                onMouseDown={onScrubStart} onTouchStart={onScrubStart}
                onMouseUp={onScrubEnd}    onTouchEnd={onScrubEnd}
                onChange={e => { if (scrubDragging.current) audioEngine.seek(+e.target.value) }}
                aria-label="Playback position"
              />
              <span className="sp-time">
                {fmt(posSecs)}<span className="sp-time-sep">/</span>{fmt(dur)}
              </span>
              <button
                className={`sp-loop-btn${looped ? ' sp-loop-btn--on' : ''}`}
                onClick={toggleLoop} aria-label="Toggle loop" aria-pressed={looped}
              >↺</button>
              {bpm && <span className="sp-bpm">♩{bpm}</span>}
            </div>
          )}

          {/* Audio row: pond album + custom upload */}
          <div className="sp-row">
            {POND_ALBUM.map(track => (
              <button
                key={track.id}
                className={`sp-track-btn${activeTrackUrl === track.url ? ' sp-track-btn--active' : ''}`}
                onClick={() => !audioLoading && loadTrack(track)}
                disabled={audioLoading}
              >
                {audioLoading && activeTrackUrl === track.url ? waveStr.slice(0, 3) : track.label}
              </button>
            ))}
            <button
              className="sp-track-btn sp-track-btn--dim"
              onClick={() => audioInputRef.current?.click()}
              disabled={audioLoading}
              title="upload audio file"
            >+</button>
            <input
              ref={audioInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
              onChange={e => { handleAudioFile(e.target.files[0]); e.target.value = '' }}
            />
            {audioError && <span className="sp-inline-err">{audioError}</span>}
          </div>

          {/* Cloud row: built-in selector + PLY upload */}
          <div className="sp-row">
            <select
              className="sp-cloud-select"
              value={cloudVal}
              disabled={cloudLoading || cloudUploading}
              onChange={e => {
                const val = e.target.value
                const uc  = userClouds.find(u => u.id === val)
                if (uc) setCloud(uc)
                else    loadCloud(val)
              }}
              aria-label="Select cloud"
            >
              {cloudManifest.map(entry => (
                <option key={entry.id} value={entry.id}>{entry.name ?? entry.id}</option>
              ))}
              {userClouds.map(uc => (
                <option key={uc.id} value={uc.id}>↑ {uc.meta?.name ?? uc.id}</option>
              ))}
            </select>
            {cloudLoading && <span className="sp-cloud-meta">{waveStr}</span>}
            {cloud && !cloudLoading && cloud.meta?.place && (
              <span className="sp-cloud-meta">{cloud.meta.place}</span>
            )}
            <button
              className="sp-track-btn sp-track-btn--dim"
              onClick={() => cloudInputRef.current?.click()}
              disabled={cloudUploading}
              title="upload .ply point cloud"
            >{cloudUploading ? '…' : '.ply'}</button>
            <input
              ref={cloudInputRef} type="file" accept=".ply" style={{ display: 'none' }}
              onChange={e => { handleCloudFile(e.target.files[0]); e.target.value = '' }}
            />
            {cloudError && <span className="sp-inline-err">{cloudError}</span>}
          </div>

        </div>
      )}

      {/* Toggle bar — always visible, play/pause lives here */}
      <button
        className={`sp-toggle${open ? ' sp-toggle--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="Toggle source panel"
      >
        <span
          className={`sp-play-inline${!playable ? ' sp-play-inline--dim' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={togglePlay}
          onKeyDown={e => e.key === 'Enter' && togglePlay(e)}
        >
          {playing ? '❚❚' : '▸'}
        </span>

        <span className="sp-toggle-status">
          {audioState.isLoaded
            ? <><span className="sp-dot" /><span className="sp-toggle-name">{audioState.name}</span></>
            : <span className="sp-toggle-name sp-toggle-name--idle">no audio</span>
          }
        </span>
        <span className="sp-toggle-sep" aria-hidden="true">·</span>
        <span className="sp-toggle-cloud">{cloud?.meta?.name ?? cloud?.id ?? '—'}</span>
        <span className="sp-toggle-chevron" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>

    </div>
  )
}
