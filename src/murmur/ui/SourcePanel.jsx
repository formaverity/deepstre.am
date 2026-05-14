import { useCallback, useEffect, useRef, useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import cloudManifest from '@/murmur/clouds/_manifest.js'
import { checkFileFormat } from '@/murmur/clouds/loaders.js'

const WAVE = '▁▂▃▄▅▆▇█▇▆▅▄▃▂▁'

function fmt(t) {
  if (!t || !isFinite(t)) return '00:00'
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  const s = Math.floor(t % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function SourcePanel() {
  const mode               = useMurmurStore(s => s.mode)
  const cloud              = useMurmurStore(s => s.cloud)
  const audioState         = useMurmurStore(s => s.audio)
  const cloudLoading       = useMurmurStore(s => s.cloudLoading)
  const loadCloud          = useMurmurStore(s => s.loadCloud)
  const loadCloudFromFile  = useMurmurStore(s => s.loadCloudFromFile)
  const setCloud           = useMurmurStore(s => s.setCloud)
  const currentCloudSource = useMurmurStore(s => s.currentCloudSource)
  const userClouds         = useMurmurStore(s => s.userClouds)

  // Panel open/closed — starts open when no audio loaded
  const [open, setOpen]           = useState(!audioState.isLoaded)

  // Audio section
  const [audioDrag, setAudioDrag]       = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError]     = useState(null)
  const [waveOff, setWaveOff]           = useState(0)

  // Transport (RAF-updated)
  const [playing, setPlaying]       = useState(false)
  const [posSecs, setPosSecs]       = useState(0)
  const [looped, setLooped]         = useState(() => audioEngine.loop)
  const [bpm, setBpm]               = useState(null)

  // Cloud section
  const [cloudDrag, setCloudDrag]         = useState(false)
  const [cloudUploading, setCloudUploading] = useState(false)
  const [cloudError, setCloudError]       = useState(null)

  const audioInputRef = useRef()
  const cloudInputRef = useRef()
  const scrubRef      = useRef()
  const scrubDragging = useRef(false)
  const rafRef        = useRef()

  // Wave animation while decoding
  useEffect(() => {
    if (!audioLoading) { setWaveOff(0); return }
    const id = setInterval(() => setWaveOff(o => (o + 1) % WAVE.length), 80)
    return () => clearInterval(id)
  }, [audioLoading])

  // Auto-dismiss errors
  useEffect(() => {
    if (!audioError) return
    const id = setTimeout(() => setAudioError(null), 6000)
    return () => clearTimeout(id)
  }, [audioError])
  useEffect(() => {
    if (!cloudError) return
    const id = setTimeout(() => setCloudError(null), 6000)
    return () => clearTimeout(id)
  }, [cloudError])

  // RAF: update scrub position + playing state
  useEffect(() => {
    const tick = () => {
      const ip  = audioEngine.isPlaying
      const pos = audioEngine.playbackSecs

      if (!scrubDragging.current && scrubRef.current) {
        scrubRef.current.value = pos
      }
      setPosSecs(Math.floor(pos))
      setPlaying(prev => prev !== ip ? ip : prev)
      setBpm(prev => {
        const b = audioEngine.detectedBPM
        return prev !== b ? b : prev
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // ── Audio file handler ──────────────────────────────────────────────────

  const handleAudioFile = useCallback(async (file) => {
    if (!file) return
    setAudioError(null)
    setAudioLoading(true)
    try {
      await audioEngine.start()
      await audioEngine.loadBuffer(file)
      // Auto-play in playback mode (grain player auto-starts in interactive)
      if (useMurmurStore.getState().mode === 'playback') {
        audioEngine.play()
      }
      setOpen(false)
    } catch (err) {
      setAudioError('decode failed — try a different file')
      console.error('[SourcePanel] audio load error:', err)
    } finally {
      setAudioLoading(false)
    }
  }, [])

  // ── Cloud file handler ──────────────────────────────────────────────────

  const handleCloudFile = useCallback(async (file) => {
    if (!file) return
    const check = checkFileFormat(file)
    if (!check.supported) { setCloudError(check.message); return }
    setCloudError(null)
    setCloudUploading(true)
    try {
      await loadCloudFromFile({
        file,
        userMeta: { name: file.name.replace(/\.ply$/i, '') },
      })
    } catch (err) {
      setCloudError(err.message || 'cloud load failed')
    } finally {
      setCloudUploading(false)
    }
  }, [loadCloudFromFile])

  // ── Transport ───────────────────────────────────────────────────────────

  const togglePlay = () => {
    if (audioEngine.isPlaying) audioEngine.pause()
    else audioEngine.play()
  }

  const toggleLoop = () => {
    const next = !looped
    audioEngine.setLoop(next)
    setLooped(next)
  }

  const onScrubStart = () => { scrubDragging.current = true }
  const onScrubEnd   = e  => {
    scrubDragging.current = false
    audioEngine.seek(+e.target.value)
  }

  // ── Derived display values ──────────────────────────────────────────────

  const dur      = audioState.duration || 0
  const waveStr  = WAVE.slice(waveOff) + WAVE.slice(0, waveOff)
  const audioLabel = audioDrag
    ? 'release to load'
    : audioLoading
    ? waveStr
    : audioError
    ? audioError
    : audioState.isLoaded
    ? audioState.name
    : 'drop audio · tap to browse'

  const cloudSelectVal = cloud?.id ?? ''

  const playDisabled = mode === 'interactive'

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="sp-root">

      {/* Expanded body — renders above the toggle bar */}
      {open && (
        <div className="sp-body">

          {/* ── AUDIO ──────────────────────────────────────────────── */}
          <div className="sp-section">
            <span className="sp-section-hd">AUDIO</span>

            {/* Drop / status zone */}
            <div
              className={[
                'sp-drop',
                audioDrag    ? 'sp-drop--drag'    : '',
                audioError   ? 'sp-drop--error'   : '',
                audioLoading ? 'sp-drop--loading' : '',
              ].filter(Boolean).join(' ')}
              onDragOver={e  => { e.preventDefault(); setAudioDrag(true) }}
              onDragEnter={e => { e.preventDefault(); setAudioDrag(true) }}
              onDragLeave={() => setAudioDrag(false)}
              onDrop={e => {
                e.preventDefault(); setAudioDrag(false)
                handleAudioFile(e.dataTransfer.files[0])
              }}
              onClick={() => !audioLoading && audioInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && !audioLoading && audioInputRef.current?.click()}
              aria-label="Load audio file"
              aria-busy={audioLoading}
            >
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={e => { handleAudioFile(e.target.files[0]); e.target.value = '' }}
              />
              <span className={`sp-drop-label${audioLoading ? ' sp-drop-label--wave' : ''}`}>
                {audioLabel}
              </span>
              {audioState.isLoaded && !audioLoading && !audioError && (
                <span className="sp-drop-dur">{fmt(dur)}</span>
              )}
            </div>

            {/* Transport row */}
            <div className={`sp-transport${!audioState.isLoaded ? ' sp-transport--idle' : ''}`}>
              <button
                className="sp-play-btn"
                onClick={togglePlay}
                disabled={!audioState.isLoaded || playDisabled}
                title={playDisabled ? 'orbit controls playback in interactive mode' : undefined}
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? '❚❚' : '▸'}
              </button>

              <input
                ref={scrubRef}
                type="range"
                className="sp-scrub"
                min={0}
                max={dur || 100}
                step={0.1}
                defaultValue={0}
                disabled={!audioState.isLoaded}
                onMouseDown={onScrubStart}
                onTouchStart={onScrubStart}
                onMouseUp={onScrubEnd}
                onTouchEnd={onScrubEnd}
                onChange={e => { if (scrubDragging.current) audioEngine.seek(+e.target.value) }}
                aria-label="Playback position"
              />

              <span className="sp-time">
                {fmt(posSecs)}
                <span className="sp-time-sep"> / </span>
                {fmt(dur)}
              </span>

              <button
                className={`sp-loop-btn${looped ? ' sp-loop-btn--on' : ''}`}
                onClick={toggleLoop}
                aria-label="Toggle loop"
                aria-pressed={looped}
                title={looped ? 'loop on' : 'loop off'}
              >
                ↺
              </button>

              {bpm && <span className="sp-bpm">♩{bpm}</span>}
            </div>
          </div>

          <div className="sp-divider" aria-hidden="true" />

          {/* ── CLOUD ──────────────────────────────────────────────── */}
          <div className="sp-section">
            <span className="sp-section-hd">CLOUD</span>

            {/* Cloud selector */}
            <select
              className="sp-cloud-select"
              value={cloudSelectVal}
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
                <option key={entry.id} value={entry.id}>
                  {entry.name ?? entry.id}
                </option>
              ))}
              {userClouds.length > 0 && userClouds.map(uc => (
                <option key={uc.id} value={uc.id}>
                  ↑ {uc.meta?.name ?? uc.id}
                </option>
              ))}
            </select>

            {/* Cloud metadata */}
            {cloud && !cloudLoading && (
              <span className="sp-cloud-meta">
                {(cloud.count ?? 0).toLocaleString()} pts
                {cloud.meta?.place ? ` · ${cloud.meta.place}` : ''}
              </span>
            )}
            {cloudLoading && <span className="sp-cloud-meta">{waveStr}</span>}

            {/* PLY upload zone */}
            <div
              className={[
                'sp-ply-drop',
                cloudDrag ? 'sp-ply-drop--drag' : '',
                cloudUploading ? 'sp-ply-drop--loading' : '',
              ].filter(Boolean).join(' ')}
              onDragOver={e  => { e.preventDefault(); setCloudDrag(true) }}
              onDragEnter={e => { e.preventDefault(); setCloudDrag(true) }}
              onDragLeave={() => setCloudDrag(false)}
              onDrop={e => {
                e.preventDefault(); setCloudDrag(false)
                handleCloudFile(e.dataTransfer.files[0])
              }}
              onClick={() => !cloudUploading && cloudInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && !cloudUploading && cloudInputRef.current?.click()}
              aria-label="Upload point cloud (.ply)"
              aria-busy={cloudUploading}
            >
              <input
                ref={cloudInputRef}
                type="file"
                accept=".ply"
                style={{ display: 'none' }}
                onChange={e => { handleCloudFile(e.target.files[0]); e.target.value = '' }}
              />
              <span className="sp-ply-label">
                {cloudUploading ? waveStr : cloudDrag ? 'drop .ply' : 'upload .ply'}
              </span>
            </div>

            {cloudError && <p className="sp-error" role="alert">{cloudError}</p>}
          </div>

        </div>
      )}

      {/* Toggle bar — always visible at bottom */}
      <button
        className={`sp-toggle${open ? ' sp-toggle--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="Toggle source panel"
      >
        <span className="sp-toggle-status">
          {audioState.isLoaded
            ? <><span className="sp-dot" />&#8203;<span className="sp-toggle-name">{audioState.name}</span></>
            : <span className="sp-toggle-name sp-toggle-name--idle">no audio</span>
          }
        </span>
        <span className="sp-toggle-sep" aria-hidden="true">·</span>
        <span className="sp-toggle-cloud">
          {cloud?.meta?.name ?? cloud?.id ?? '—'}
        </span>
        <span className="sp-toggle-chevron" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>

    </div>
  )
}
