import { useEffect, useRef, useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

function SensitivityRow() {
  const sensitivity    = useMurmurStore(s => s.sensitivity)
  const setSensitivity = useMurmurStore(s => s.setSensitivity)
  return (
    <div className="murmur-sensitivity">
      <span className="murmur-sensitivity-label">SENS</span>
      <input
        type="range"
        className="murmur-sensitivity-slider"
        min="0.1" max="3" step="0.05"
        value={sensitivity}
        onChange={e => setSensitivity(+e.target.value)}
        aria-label="Reactive sensitivity"
      />
      <span className="murmur-sensitivity-val">{sensitivity.toFixed(1)}×</span>
    </div>
  )
}

function fmt(t) {
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  const s = Math.floor(t % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function Transport() {
  const mode     = useMurmurStore(s => s.mode)
  const isLoaded = useMurmurStore(s => s.audio.isLoaded)
  const duration = useMurmurStore(s => s.audio.duration)

  const [playing,     setPlaying]     = useState(false)
  const [displaySecs, setDisplaySecs] = useState(0)
  const [looped,      setLooped]      = useState(() => audioEngine.loop)
  const [bpm,         setBpm]         = useState(null)
  const scrubRef   = useRef()
  const isDragging = useRef(false)
  const rafRef     = useRef()

  // RAF: update scrub, playing state, BPM display at low cost
  useEffect(() => {
    const tick = () => {
      const ct = audioEngine.currentTime
      const ip = audioEngine.isPlaying

      if (!isDragging.current && scrubRef.current) {
        scrubRef.current.value = ct
      }

      const s = Math.floor(ct)
      setDisplaySecs(prev => prev !== s ? s : prev)
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

  const togglePlay = () => {
    if (audioEngine.isPlaying) audioEngine.pause()
    else audioEngine.play()
  }

  const toggleLoop = () => {
    const next = !looped
    audioEngine.setLoop(next)
    setLooped(next)
  }

  const onScrubStart = () => { isDragging.current = true }
  const onScrubEnd   = (e) => {
    isDragging.current = false
    audioEngine.seek(+e.target.value)
  }

  if (!isLoaded || mode !== 'reactive') return null

  return (
    <>
    <SensitivityRow />
    <div className="murmur-transport">
      <button
        className="murmur-transport-play"
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '■' : '▶'}
      </button>

      <span className="murmur-transport-time">{fmt(displaySecs)}</span>

      <input
        ref={scrubRef}
        type="range"
        className="murmur-transport-scrub"
        min={0}
        max={duration || 100}
        step={0.1}
        defaultValue={0}
        onMouseDown={onScrubStart}
        onTouchStart={onScrubStart}
        onMouseUp={onScrubEnd}
        onTouchEnd={onScrubEnd}
        onChange={(e) => {
          if (isDragging.current) audioEngine.seek(+e.target.value)
        }}
        aria-label="Playback position"
      />

      <span className="murmur-transport-time">{fmt(duration)}</span>

      <button
        className={`murmur-transport-loop${looped ? ' murmur-transport-loop--on' : ''}`}
        onClick={toggleLoop}
        title={looped ? 'Loop on' : 'Loop off'}
        aria-label="Toggle loop"
        aria-pressed={looped}
      >
        ↺
      </button>

      {bpm && (
        <span className="murmur-transport-bpm" title="Detected tempo">
          ♩{bpm}
        </span>
      )}
    </div>
    </>
  )
}
