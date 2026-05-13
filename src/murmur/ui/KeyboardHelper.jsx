import { useEffect, useRef, useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

const SHORTCUTS = [
  { key: 'space', label: 'play / freeze' },
  { key: 'm',     label: 'mode' },
  { key: 'g',     label: 'grid' },
  { key: 'i',     label: 'info' },
  { key: 'r',     label: 'reset cam' },
  { key: '?',     label: 'help' },
  { key: 'esc',   label: 'pond' },
]

const HELP_ROWS = [
  { key: 'space', reactive: 'play / pause',     sculpt: 'freeze grain position' },
  { key: 'm',     reactive: 'switch to sculpt', sculpt: 'switch to reactive' },
  { key: 'g',     reactive: '—',                sculpt: 'group grid' },
  { key: 'i',     reactive: 'info card',        sculpt: 'info card' },
  { key: 'r',     reactive: 'reset camera',     sculpt: 'reset camera' },
  { key: '?',     reactive: 'this overlay',     sculpt: 'this overlay' },
  { key: 'esc',   reactive: 'close / pond',     sculpt: 'close / pond' },
]

export default function KeyboardHelper({ onNavigateToPond }) {
  const [visible,  setVisible]  = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpOpenRef        = useRef(false)
  const navigateToPondRef  = useRef(onNavigateToPond)
  const fadeTimer          = useRef(null)

  // Keep ref current so the keydown closure always calls the latest version
  useEffect(() => { navigateToPondRef.current = onNavigateToPond }, [onNavigateToPond])

  // Auto-fade hints after 5s
  useEffect(() => {
    fadeTimer.current = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(fadeTimer.current)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      // Don't fire when user is typing
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      const state = useMurmurStore.getState()

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (state.mode === 'reactive') {
          if (!state.audio.isLoaded) return
          audioEngine.isPlaying ? audioEngine.pause() : audioEngine.play()
        } else {
          state.setGrainFrozen(!state.grainFrozen)
        }
      } else if (e.key === 'm' || e.key === 'M') {
        if (!state.audio.isLoaded) return
        state.setMode(state.mode === 'reactive' ? 'sculpt' : 'reactive')
      } else if (e.key === 'i' || e.key === 'I') {
        state.setInfoOpen(!state.infoOpen)
      } else if (e.key === 'g' || e.key === 'G') {
        if (state.mode === 'sculpt') state.toggleGroupGrid()
      } else if (e.key === 'r' || e.key === 'R') {
        state.resetCamera()
      } else if (e.key === '?') {
        const next = !helpOpenRef.current
        helpOpenRef.current = next
        setHelpOpen(next)
      } else if (e.key === 'Escape') {
        // Priority: 1) close help overlay, 2) close info card, 3) navigate to pond
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
        {SHORTCUTS.map(s => (
          <span key={s.key} className="murmur-keyboard-shortcut">
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
                  <th>reactive</th>
                  <th>sculpt</th>
                </tr>
              </thead>
              <tbody>
                {HELP_ROWS.map(h => (
                  <tr key={h.key}>
                    <td><kbd className="murmur-keyboard-key">{h.key}</kbd></td>
                    <td>{h.reactive}</td>
                    <td>{h.sculpt}</td>
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
