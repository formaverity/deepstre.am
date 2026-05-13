import { useEffect, useRef, useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

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
  const scrubRef   = useRef()
  const isDragging = useRef(false)
  const rafRef     = useRef()

  // RAF: update scrub position directly (no React re-render) and display time at 1 Hz
  useEffect(() => {
    const tick = () => {
      const ct = audioEngine.currentTime
      const ip = audioEngine.isPlaying

      if (!isDragging.current && scrubRef.current) {
        scrubRef.current.value = ct
      }

      // Floor to int so setDisplaySecs bails out without re-render on same second
      const s = Math.floor(ct)
      setDisplaySecs(prev => prev !== s ? s : prev)
      setPlaying(prev => prev !== ip ? ip : prev)

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const togglePlay = () => {
    if (audioEngine.isPlaying) audioEngine.pause()
    else audioEngine.play()
  }

  const onScrubStart = () => { isDragging.current = true }
  const onScrubEnd   = (e) => {
    isDragging.current = false
    audioEngine.seek(+e.target.value)
  }

  if (!isLoaded || mode !== 'reactive') return null

  return (
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
    </div>
  )
}
