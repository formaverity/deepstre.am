import { useEffect, useRef, useState } from 'react'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import cloudManifest from '@/murmur/clouds/_manifest.js'

// ── POND album ────────────────────────────────────────────────────────────────

const POND_TRACKS = [
  { name: '01 Pond 1021', url: '/clouds/POND%20ALBUM/01_Pond_1021.mp3' },
  { name: '02 Radiators', url: '/clouds/POND%20ALBUM/02_Radiators.mp3' },
  { name: '03 Hum',       url: '/clouds/POND%20ALBUM/03_Hum.mp3'       },
  { name: '04 Lenfant',   url: '/clouds/POND%20ALBUM/04_Lenfant.mp3'   },
  { name: '05 Opal',      url: '/clouds/POND%20ALBUM/05_Opal.mp3'      },
  { name: '05 Canarium',  url: '/clouds/POND%20ALBUM/05_Canarium.mp3'  },
]

function fmt(t) {
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  const s = Math.floor(t % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MediaBar() {
  const mode               = useMurmurStore(s => s.mode)
  const isLoaded           = useMurmurStore(s => s.audio.isLoaded)
  const audioName          = useMurmurStore(s => s.audio.name)
  const duration           = useMurmurStore(s => s.audio.duration)
  const cloud              = useMurmurStore(s => s.cloud)
  const userClouds         = useMurmurStore(s => s.userClouds)
  const currentCloudSource = useMurmurStore(s => s.currentCloudSource)
  const loadCloud          = useMurmurStore(s => s.loadCloud)
  const loadCloudFromFile  = useMurmurStore(s => s.loadCloudFromFile)
  const sensitivity        = useMurmurStore(s => s.sensitivity)
  const setSensitivity     = useMurmurStore(s => s.setSensitivity)

  const [expanded,      setExpanded]      = useState(false)
  const [playing,       setPlaying]       = useState(false)
  const [displaySecs,   setDisplaySecs]   = useState(0)
  const [looped,        setLooped]        = useState(() => audioEngine.loop)
  const [bpm,           setBpm]           = useState(null)
  const [loadingTrack,  setLoadingTrack]  = useState(false)
  const [loadingCloud,  setLoadingCloud]  = useState(false)
  const [audioDragging, setAudioDragging] = useState(false)
  const [plyDragging,   setPlyDragging]   = useState(false)
  const [error,         setError]         = useState(null)
  const [activeUrl,     setActiveUrl]     = useState(null)  // currently loaded POND url

  const scrubRef      = useRef()
  const isDragging    = useRef(false)
  const rafRef        = useRef()
  const audioInputRef = useRef()
  const plyInputRef   = useRef()
  const gestureRef    = useRef(null)

  // ── RAF: sync transport display ───────────────────────────────────────────

  useEffect(() => {
    const tick = () => {
      const ip = audioEngine.isPlaying
      setPlaying(prev => prev !== ip ? ip : prev)

      if (!isDragging.current) {
        const ct = audioEngine.currentTime
        const s  = Math.floor(ct)
        setDisplaySecs(prev => prev !== s ? s : prev)
        if (scrubRef.current) scrubRef.current.value = ct
      }

      setBpm(prev => {
        const b = audioEngine.detectedBPM
        return prev !== b ? b : prev
      })

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // ── Mount: prefetch POND album; preload random track; auto-start sculpt ───

  useEffect(() => {
    // Background-prefetch entire album into browser cache
    POND_TRACKS.forEach(t => fetch(t.url, { priority: 'low' }).catch(() => {}))

    // Pick a random track and decode it (works on suspended AudioContext)
    const track = POND_TRACKS[Math.floor(Math.random() * POND_TRACKS.length)]
    setActiveUrl(track.url)
    setLoadingTrack(true)

    let cancelled = false

    fetch(track.url)
      .then(r => r.arrayBuffer())
      .then(ab => { if (!cancelled) return audioEngine.loadBuffer(ab, track.name) })
      .then(() => {
        if (cancelled) return
        setLoadingTrack(false)

        // Auto-start sculpt on the very first pointer interaction
        const onGesture = async () => {
          if (cancelled || !audioEngine.isReady) return
          try {
            await audioEngine.start()
            useMurmurStore.getState().setMode('sculpt')
          } catch (_) {}
        }
        gestureRef.current = onGesture
        document.addEventListener('pointerdown', onGesture, { once: true })
      })
      .catch(() => { if (!cancelled) setLoadingTrack(false) })

    return () => {
      cancelled = true
      if (gestureRef.current) {
        document.removeEventListener('pointerdown', gestureRef.current)
        gestureRef.current = null
      }
    }
  }, [])

  // ── Auto-dismiss errors ───────────────────────────────────────────────────

  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(id)
  }, [error])

  // ── Audio helpers ─────────────────────────────────────────────────────────

  const loadPondTrack = async (track) => {
    setLoadingTrack(true)
    setError(null)
    try {
      await audioEngine.start()
      const ab = await fetch(track.url).then(r => r.arrayBuffer())
      await audioEngine.loadBuffer(ab, track.name)
      setActiveUrl(track.url)
    } catch {
      setError('load failed')
    } finally {
      setLoadingTrack(false)
    }
  }

  const loadAudioFile = async (file) => {
    if (!file) return
    setLoadingTrack(true)
    setError(null)
    try {
      await audioEngine.start()
      await audioEngine.loadBuffer(file)
      setActiveUrl(null)
    } catch {
      setError('could not decode audio')
    } finally {
      setLoadingTrack(false)
    }
  }

  const loadPlyFile = async (file) => {
    if (!file) return
    setLoadingCloud(true)
    setError(null)
    try {
      await loadCloudFromFile({ file, userMeta: { name: file.name.replace(/\.ply$/i, '') } })
    } catch (err) {
      setError(err.message ?? 'cloud load failed')
    } finally {
      setLoadingCloud(false)
    }
  }

  const togglePlay = () => {
    audioEngine.isPlaying ? audioEngine.pause() : audioEngine.play()
  }

  const toggleLoop = () => {
    const next = !looped
    audioEngine.setLoop(next)
    setLooped(next)
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const showTransport = isLoaded && mode === 'reactive'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mbar-root">

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="mbar-panel">

          {/* Sensitivity */}
          <div className="mbar-sens-row">
            <span className="mbar-sens-label">SENS</span>
            <input
              type="range"
              className="mbar-sens-slider"
              min="0.1" max="3" step="0.05"
              value={sensitivity}
              onChange={e => setSensitivity(+e.target.value)}
              aria-label="Reactive sensitivity"
            />
            <span className="mbar-sens-val">{sensitivity.toFixed(1)}×</span>
          </div>

          <div className="mbar-rule" />

          {/* POND album */}
          <div className="mbar-section">
            <p className="mbar-section-head">POND &mdash; mosspcm</p>
            <ul className="mbar-list">
              {POND_TRACKS.map(t => (
                <li key={t.url}>
                  <button
                    className={`mbar-list-btn${activeUrl === t.url ? ' mbar-list-btn--active' : ''}`}
                    onClick={() => loadPondTrack(t)}
                    disabled={loadingTrack}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mbar-rule" />

          {/* Cloud library */}
          <div className="mbar-section">
            <p className="mbar-section-head">cloud</p>
            <ul className="mbar-list">
              {cloudManifest.map(entry => {
                const active = currentCloudSource === 'default' && cloud?.id === entry.id
                return (
                  <li key={entry.id}>
                    <button
                      className={`mbar-list-btn${active ? ' mbar-list-btn--active' : ''}`}
                      onClick={() => loadCloud(entry.id)}
                    >
                      {entry.name ?? entry.id}
                    </button>
                  </li>
                )
              })}
              {userClouds.length > 0 && <>
                <li className="mbar-list-divider" aria-hidden="true" />
                {userClouds.map(uc => {
                  const active = currentCloudSource === 'user' && cloud?.id === uc.id
                  return (
                    <li key={uc.id}>
                      <button
                        className={`mbar-list-btn${active ? ' mbar-list-btn--active' : ''}`}
                        onClick={() => useMurmurStore.getState().setCloud(uc)}
                      >
                        {uc.meta?.name ?? uc.id}
                      </button>
                    </li>
                  )
                })}
              </>}
            </ul>
          </div>

          <div className="mbar-rule" />

          {/* Upload zones */}
          <div className="mbar-uploads">
            <div
              className={`mbar-drop${audioDragging ? ' mbar-drop--over' : ''}`}
              onDragOver={e => { e.preventDefault(); setAudioDragging(true) }}
              onDragLeave={() => setAudioDragging(false)}
              onDrop={e => { e.preventDefault(); setAudioDragging(false); loadAudioFile(e.dataTransfer.files[0]) }}
              onClick={() => audioInputRef.current?.click()}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && audioInputRef.current?.click()}
              aria-label="Upload audio file"
            >
              <span className="mbar-drop-label">
                {loadingTrack ? '…' : audioDragging ? 'drop' : 'audio'}
              </span>
            </div>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={e => { loadAudioFile(e.target.files[0]); e.target.value = '' }}
            />

            <div
              className={`mbar-drop${plyDragging ? ' mbar-drop--over' : ''}`}
              onDragOver={e => { e.preventDefault(); setPlyDragging(true) }}
              onDragLeave={() => setPlyDragging(false)}
              onDrop={e => { e.preventDefault(); setPlyDragging(false); loadPlyFile(e.dataTransfer.files[0]) }}
              onClick={() => plyInputRef.current?.click()}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && plyInputRef.current?.click()}
              aria-label="Upload point cloud (.ply)"
            >
              <span className="mbar-drop-label">
                {loadingCloud ? '…' : plyDragging ? 'drop' : '.ply cloud'}
              </span>
            </div>
            <input
              ref={plyInputRef}
              type="file"
              accept=".ply"
              style={{ display: 'none' }}
              onChange={e => { loadPlyFile(e.target.files[0]); e.target.value = '' }}
            />
          </div>

          {error && <p className="mbar-error">{error}</p>}
        </div>
      )}

      {/* ── Collapsed bar ── */}
      <div className="mbar-bar">

        <button
          className={`mbar-expand${expanded ? ' mbar-expand--open' : ''}`}
          onClick={() => setExpanded(v => !v)}
          aria-label={expanded ? 'collapse' : 'expand'}
        >
          {expanded ? '▾' : '▴'}
        </button>

        {showTransport && (
          <>
            <button className="mbar-play" onClick={togglePlay} aria-label={playing ? 'pause' : 'play'}>
              {playing ? '■' : '▶'}
            </button>

            <span className="mbar-time">{fmt(displaySecs)}</span>

            <input
              ref={scrubRef}
              type="range"
              className="mbar-scrub"
              min={0}
              max={duration || 100}
              step={0.1}
              defaultValue={0}
              onMouseDown={() => { isDragging.current = true }}
              onTouchStart={() => { isDragging.current = true }}
              onMouseUp={e => { isDragging.current = false; audioEngine.seek(+e.target.value) }}
              onTouchEnd={e => { isDragging.current = false; audioEngine.seek(+e.target.value) }}
              onChange={e => { if (isDragging.current) audioEngine.seek(+e.target.value) }}
              aria-label="Playback position"
            />

            <span className="mbar-time">{fmt(duration)}</span>

            <button
              className={`mbar-loop${looped ? ' mbar-loop--on' : ''}`}
              onClick={toggleLoop}
              aria-label="toggle loop"
            >
              ↺
            </button>

            {bpm && <span className="mbar-bpm">♩{bpm}</span>}
          </>
        )}

        {/* Track name — sculpt mode or no transport */}
        {!showTransport && (
          <span className="mbar-label">
            {loadingTrack
              ? 'loading…'
              : isLoaded
                ? audioName
                : 'drop audio · ▴'}
          </span>
        )}

      </div>
    </div>
  )
}
