import { useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { VOICING_PRESETS } from '@/murmur/audio/chordVoicings.js'

export default function ChordPicker() {
  const [open, setOpen] = useState(false)

  const chordConfig    = useMurmurStore(s => s.chordConfig)
  const setChordConfig = useMurmurStore(s => s.setChordConfig)

  const { preset, isMinor, voices, customIntervals } = chordConfig

  const update = (patch) => setChordConfig({ ...chordConfig, ...patch })

  const setCustomInterval = (i, raw) => {
    const v   = parseFloat(raw)
    const arr = [...customIntervals]
    arr[i]    = isNaN(v) ? 0 : Math.max(-24, Math.min(24, v))
    update({ customIntervals: arr })
  }

  const activePreset = VOICING_PRESETS.find(p => p.id === preset)
  const maxVoices = preset === 'custom'
    ? 4
    : ((chordConfig.isMinor ? activePreset?.intervalsMin : activePreset?.intervalsMaj) ?? [0]).length

  return (
    <div className="cp-root">
      <button className="cp-header" onClick={() => setOpen(o => !o)}>
        <span>chord</span>
        <span className="cp-toggle-glyph">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="cp-body">
          {/* Minor / major toggle — relevant for 'thirds' */}
          {preset === 'thirds' && (
            <div className="cp-row">
              <button
                className={`cp-quality-btn${!isMinor ? ' cp-quality-btn--active' : ''}`}
                onClick={() => update({ isMinor: false })}
              >maj</button>
              <button
                className={`cp-quality-btn${isMinor ? ' cp-quality-btn--active' : ''}`}
                onClick={() => update({ isMinor: true })}
              >min</button>
            </div>
          )}

          {/* Voicing preset buttons */}
          <div className="cp-presets">
            {VOICING_PRESETS.map(p => (
              <button
                key={p.id}
                className={`cp-preset-btn${preset === p.id ? ' cp-preset-btn--active' : ''}`}
                onClick={() => update({ preset: p.id })}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom interval inputs */}
          {preset === 'custom' && (
            <div className="cp-custom">
              {customIntervals.map((v, i) => (
                <div key={i} className="cp-custom-row">
                  <span className="cp-custom-label">v{i + 1}</span>
                  <input
                    type="number"
                    className="cp-custom-input"
                    value={v}
                    min={-24}
                    max={24}
                    step={1}
                    onChange={e => setCustomInterval(i, e.target.value)}
                  />
                  <span className="cp-custom-unit">st</span>
                </div>
              ))}
            </div>
          )}

          {/* Voices count */}
          <div className="cp-row cp-row--voices">
            <span className="cp-label">voices</span>
            <input
              type="range"
              className="cp-slider"
              min={1}
              max={Math.min(6, maxVoices)}
              step={1}
              value={Math.min(voices, maxVoices)}
              onChange={e => update({ voices: parseInt(e.target.value) })}
            />
            <span className="cp-slider-val">{Math.min(voices, maxVoices)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
