import { useCallback, useEffect, useRef, useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

const WAVE = '▁▂▃▄▅▆▇█▇▆▅▄▃▂▁'

function fmt(t) {
  if (!t || !isFinite(t)) return '00:00'
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  const s = Math.floor(t % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Fetch sample track manifest from public/audio/_manifest.json.
// Returns [] if missing or empty — dropdown will only show upload option.
async function loadManifest() {
  try {
    const r = await fetch('/audio/_manifest.json')
    if (!r.ok) return []
    const data = await r.json()
    return Array.isArray(data) ? data : []
  } catch (_) {
    return []
  }
}

export default function AudioDropdown() {
  const audioState        = useMurmurStore(s => s.audio)
  const gestureState      = useMurmurStore(s => s.gestureState)
  const isPlayingPassive  = useMurmurStore(s => s.isPlayingPassive)
  const setIsPlayingPassive = useMurmurStore(s => s.setIsPlayingPassive)

  const [tracks, setTracks]           = useState([])
  const [menuOpen, setMenuOpen]       = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [activeId, setActiveId]       = useState(null)
  const [waveOff, setWaveOff]         = useState(0)
  const [scrubOpen, setScrubOpen]     = useState(false)

  // 1Hz time display
  const [displaySecs, setDisplaySecs] = useState(0)

  const audioInputRef = useRef()
  const menuRef       = useRef()
  const scrubRef      = useRef()
  const scrubDragging = useRef(false)
  const tickRef       = useRef()

  // Load manifest, auto-select a random track, and prime passive play
  useEffect(() => {
    let alive = true
    loadManifest().then(async (data) => {
      if (!alive) return
      setTracks(data)
      if (!data.length) return

      const pick = data[Math.floor(Math.random() * data.length)]
      setLoading(true)
      try {
        // AudioContext may be suspended without a user gesture — that's fine.
        // decodeAudioData works in suspended state; playback starts on first touch.
        try { await audioEngine.start() } catch (_) {}
        await audioEngine.loadBuffer(pick.file)
        if (!alive) return
        setActiveId(pick.id)
        // Mark as "should play" — GranularSculptor starts audio on first canvas touch
        setIsPlayingPassive(true)
      } catch (_) {
        // Auto-load failed — user selects manually
      } finally {
        if (alive) setLoading(false)
      }
    })
    return () => { alive = false }
  }, [setIsPlayingPassive])

  // Wave animation while loading
  useEffect(() => {
    if (!loading) { setWaveOff(0); return }
    const id = setInterval(() => setWaveOff(o => (o + 1) % WAVE.length), 80)
    return () => clearInterval(id)
  }, [loading])

  // 1Hz time update
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (!scrubDragging.current) {
        setDisplaySecs(Math.floor(audioEngine.playbackSecs))
        if (scrubRef.current) scrubRef.current.value = audioEngine.playbackSecs
      }
    }, 1000)
    return () => clearInterval(tickRef.current)
  }, [])

  // Auto-dismiss error after 4s
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(id)
  }, [error])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [menuOpen])

  const loadOnly = useCallback(async (source, trackId) => {
    setError(null)
    setLoading(true)
    setMenuOpen(false)
    try {
      await audioEngine.start()
      await audioEngine.loadBuffer(source)
      setActiveId(trackId)
      // Track is loaded and ready — user presses play to start
    } catch {
      setError("× couldn't load — try another")
      setActiveId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTrackSelect = useCallback((track) => {
    loadOnly(track.file, track.id)
  }, [loadOnly])

  const handleFileInput = useCallback((file) => {
    if (!file) return
    loadOnly(file, `user-${file.name}`)
  }, [loadOnly])

  const togglePlay = useCallback((e) => {
    e.stopPropagation()
    if (!audioState.isLoaded || loading) return
    if (isPlayingPassive) {
      setIsPlayingPassive(false)
      audioEngine.setActiveSource(null)
    } else {
      setIsPlayingPassive(true)
      audioEngine.setActiveSource('player')
    }
  }, [audioState.isLoaded, isPlayingPassive, loading, setIsPlayingPassive])

  const onScrubStart = () => { scrubDragging.current = true }
  const onScrubEnd   = (e) => {
    scrubDragging.current = false
    const t = +e.target.value
    audioEngine._lastKnownTime = t
    audioEngine.granularBufferPosition = audioEngine.duration > 0 ? t / audioEngine.duration : 0
    if (audioEngine.activeSource === 'player') {
      try {
        audioEngine.player?.seek(t)
        audioEngine._pauseOffset = t
      } catch (_) {}
    } else if (audioEngine.activeSource === 'grain') {
      audioEngine.setGranularBufferPosition(audioEngine.duration > 0 ? t / audioEngine.duration : 0)
    }
  }

  const dur           = audioState.duration || 0
  const waveStr       = WAVE.slice(waveOff) + WAVE.slice(0, waveOff)
  const isGranular    = gestureState === 'touching'
  const timePrefix    = isGranular ? '◐ ' : ''
  const granularSecs  = isGranular ? Math.floor(audioEngine.getGranularTimeSecs?.() ?? displaySecs) : displaySecs
  const displayTime   = `${timePrefix}${fmt(granularSecs)} / ${fmt(dur)}`

  // ── Render ──────────────────────────────────────────────────────────────

  let triggerContent
  if (loading) {
    triggerContent = <span className="sd-name sd-name--dim">{waveStr} loading…</span>
  } else if (error) {
    triggerContent = <span className="sd-name sd-name--err">{error}</span>
  } else if (!audioState.isLoaded) {
    triggerContent = <span className="sd-name sd-name--dim">▸ pick a track or upload</span>
  } else {
    triggerContent = (
      <>
        <button
          className={`sd-play${!audioState.isLoaded || loading ? ' sd-play--dim' : ''}`}
          onClick={togglePlay}
          aria-label={isPlayingPassive ? 'pause' : 'play'}
          disabled={!audioState.isLoaded || loading}
        >
          {isPlayingPassive ? '❚❚' : '▸'}
        </button>
        <span className="sd-name">{audioState.name}</span>
        <button
          className="sd-time"
          onClick={(e) => { e.stopPropagation(); setScrubOpen(v => !v) }}
          title="click to scrub"
          aria-label="scrub playback position"
        >
          {displayTime}
        </button>
      </>
    )
  }

  return (
    <div className="sd-root" ref={menuRef}>

      {/* Scrub slider — shown above when time is clicked */}
      {scrubOpen && audioState.isLoaded && (
        <div className="sd-scrub-row">
          <input
            ref={scrubRef}
            type="range"
            className="sd-scrub"
            min={0} max={dur || 100} step={0.1} defaultValue={0}
            onMouseDown={onScrubStart} onTouchStart={onScrubStart}
            onMouseUp={onScrubEnd}    onTouchEnd={onScrubEnd}
            onChange={e => { if (scrubDragging.current) onScrubEnd(e) }}
            aria-label="Playback position"
          />
        </div>
      )}

      {/* Floating menu */}
      {menuOpen && (
        <div className="sd-menu" role="listbox" aria-label="audio source">
          {tracks.map(track => (
            <button
              key={track.id}
              className={`sd-option${activeId === track.id ? ' sd-option--active' : ''}`}
              onClick={() => handleTrackSelect(track)}
              role="option"
              aria-selected={activeId === track.id}
            >
              {track.name}
            </button>
          ))}
          {tracks.length > 0 && <div className="sd-divider" />}
          <button
            className="sd-option sd-option--upload"
            onClick={() => { audioInputRef.current?.click(); setMenuOpen(false) }}
          >
            ↑ upload audio file…
          </button>
        </div>
      )}

      {/* Trigger row */}
      <button
        className="sd-trigger"
        onClick={() => {
          // Pre-warm AudioContext on first interaction so track selection never races Tone init
          audioEngine.start().catch(() => {})
          setMenuOpen(v => !v)
        }}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label="audio source"
      >
        <span className="sd-label">track:</span>
        <span className="sd-content">{triggerContent}</span>
        <span className="sd-chevron" aria-hidden="true">{menuOpen ? '▾' : '▴'}</span>
      </button>

      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={e => { handleFileInput(e.target.files[0]); e.target.value = '' }}
      />
    </div>
  )
}
