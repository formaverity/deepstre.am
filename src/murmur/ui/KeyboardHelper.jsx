import { useEffect, useRef, useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

const SHORTCUTS = [
  { key: 'space', label: 'play / freeze' },
  { key: 'p',     label: 'playback' },
  { key: 'i',     label: 'interactive' },
  { key: 'g',     label: 'grid' },
  { key: 'i',     label: 'info' },
  { key: 'r',     label: 'reset cam' },
  { key: '?',     label: 'help' },
  { key: 'esc',   label: 'pond' },
]

const HELP_ROWS = [
  { key: 'space', playback: 'play / pause',       interactive: 'freeze grain position' },
  { key: 'p',     playback: 'already playback',   interactive: 'switch to playback' },
  { key: 'i',     playback: 'switch to interactive', interactive: 'already interactive' },
  { key: 'g',     playback: '—',                  interactive: 'group grid' },
  { key: 'i',     playback: 'info card',           interactive: 'info card' },
  { key: 'r',     playback: 'reset camera',        interactive: 'reset camera' },
  { key: '?',     playback: 'this overlay',        interactive: 'this overlay' },
  { key: 'esc',   playback: 'close / pond',        interactive: 'close / pond' },
]

// Deduplicate the shortcut bar (info 'i' and interactive 'i' collide — show one)
const SHORTCUT_BAR = [
  { key: 'space', label: 'play / freeze' },
  { key: 'p',     label: 'playback' },
  { key: 'i',     label: 'interactive / info' },
  { key: 'g',     label: 'grid' },
  { key: 'r',     label: 'reset cam' },
  { key: '?',     label: 'help' },
  { key: 'esc',   label: 'pond' },
]

export default function KeyboardHelper({ onNavigateToPond }) {
  const [visible,  setVisible]  = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpOpenRef        = useRef(false)
  const navigateToPondRef  = useRef(onNavigateToPond)
  const fadeTimer          = useRef(null)

  useEffect(() => { navigateToPondRef.current = onNavigateToPond }, [onNavigateToPond])

  // Auto-fade hints after 5s
  useEffect(() => {
    fadeTimer.current = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(fadeTimer.current)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      const state = useMurmurStore.getState()

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (state.mode === 'playback') {
          if (!state.audio.isLoaded) return
          audioEngine.isPlaying ? audioEngine.pause() : audioEngine.play()
        } else {
          state.setGrainFrozen(!state.grainFrozen)
        }
      } else if (e.key === 'p' || e.key === 'P') {
        if (!state.audio.isLoaded) return
        state.setMode('playback')
      } else if (e.key === 'i' || e.key === 'I') {
        // 'i' is overloaded: if info is open, close it; otherwise toggle based on context
        if (state.infoOpen) {
          state.setInfoOpen(false)
        } else if (state.audio.isLoaded) {
          state.setMode('interactive')
        }
      } else if (e.key === 'g' || e.key === 'G') {
        if (state.mode === 'interactive') state.toggleGroupGrid()
      } else if (e.key === 'r' || e.key === 'R') {
        state.resetCamera()
      } else if (e.key === '?') {
        const next = !helpOpenRef.current
        helpOpenRef.current = next
        setHelpOpen(next)
      } else if (e.key === 'Escape') {
        if (helpOpenRef.current) {
          helpOpenRef.current = false
          setHelpOpen(false)
        } else if (state.infoOpen) {
          state.setInfoOpen(false)
        } else {
          navigateToPondRef.current?.()
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <div className={`murmur-keyboard-helper${visible ? '' : ' murmur-keyboard-helper--hidden'}`}>
        {SHORTCUT_BAR.map(s => (
          <span key={s.key + s.label} className="murmur-keyboard-shortcut">
            <kbd className="murmur-keyboard-key">{s.key}</kbd>
            <span className="murmur-keyboard-label">{s.label}</span>
          </span>
        ))}
      </div>

      {helpOpen && (
        <div
          className="murmur-help-overlay"
          role="dialog"
          aria-label="Keyboard shortcuts"
          onClick={(e) => { if (e.target === e.currentTarget) { helpOpenRef.current = false; setHelpOpen(false) } }}
        >
          <div className="murmur-help-card">
            <button
              className="murmur-help-close"
              onClick={() => { helpOpenRef.current = false; setHelpOpen(false) }}
              aria-label="Close help"
            >
              ×
            </button>
            <p className="murmur-help-title">shortcuts</p>
            <table className="murmur-help-table">
              <thead>
                <tr>
                  <th>key</th>
                  <th>playback</th>
                  <th>interactive</th>
                </tr>
              </thead>
              <tbody>
                {HELP_ROWS.map((h, idx) => (
                  <tr key={idx}>
                    <td><kbd className="murmur-keyboard-key">{h.key}</kbd></td>
                    <td>{h.playback}</td>
                    <td>{h.interactive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="murmur-help-mouse-hint">
              click+hold: chord &nbsp;·&nbsp; drag while held: filter &nbsp;·&nbsp; ChordPicker for voicing
            </p>
          </div>
        </div>
      )}
    </>
  )
}
