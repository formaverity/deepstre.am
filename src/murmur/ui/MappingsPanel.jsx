import { useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

const BANDS   = ['bass', 'lowMid', 'highMid', 'treble', 'none']
const EFFECTS = ['explode', 'dissolve', 'magnify', 'chop']
const LABELS  = { explode: 'EXPLODE', dissolve: 'DISSOLVE', magnify: 'MAGNIFY', chop: 'CHOP' }

function GroupGrid({ groupMask, onChange }) {
  return (
    <div className="mp-grid">
      {Array.from({ length: 16 }, (_, i) => {
        const on = (groupMask >> i) & 1
        return (
          <button
            key={i}
            className={`mp-cell${on ? ' mp-cell--on' : ''}`}
            onClick={() => onChange(groupMask ^ (1 << i))}
            title={`group ${i}`}
          />
        )
      })}
    </div>
  )
}

function EffectRow({ effectKey, mapping, onChange }) {
  return (
    <div className="mp-effect">
      <div className="mp-effect-name">{LABELS[effectKey]}</div>
      <div className="mp-effect-row">
        <span className="mp-label">band</span>
        <select
          className="mp-select"
          value={mapping.band}
          onChange={e => onChange({ ...mapping, band: e.target.value })}
        >
          {BANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <span className="mp-label">str</span>
        <input
          type="range"
          className="mp-slider"
          min="0" max="1" step="0.01"
          value={mapping.strength}
          onChange={e => onChange({ ...mapping, strength: +e.target.value })}
        />
        <span className="mp-slider-val">{mapping.strength.toFixed(2)}</span>
      </div>
      <GroupGrid
        groupMask={mapping.groupMask}
        onChange={mask => onChange({ ...mapping, groupMask: mask })}
      />
    </div>
  )
}

export default function MappingsPanel() {
  const [open, setOpen]    = useState(false)
  const mappings           = useMurmurStore(s => s.mappings)
  const setMappings        = useMurmurStore(s => s.setMappings)
  const resetMappings      = useMurmurStore(s => s.resetMappings)

  return (
    <div className="mp-root">
      <button className="mp-header" onClick={() => setOpen(v => !v)}>
        <span>MAPPINGS</span>
        <span className="mp-toggle-glyph">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mp-body">
          {EFFECTS.map(key => (
            <EffectRow
              key={key}
              effectKey={key}
              mapping={mappings[key]}
              onChange={m => setMappings({ ...mappings, [key]: m })}
            />
          ))}
          <button className="mp-reset" onClick={resetMappings}>reset defaults</button>
        </div>
      )}
    </div>
  )
}
