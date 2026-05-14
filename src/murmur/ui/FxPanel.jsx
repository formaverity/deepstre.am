import { useState } from 'react'
import { fxSettings, saveFxSettings, resetFxSettings, FX_DEFAULTS } from '@/murmur/scene/fxSettings.js'

function Row({ label, field, min, max, step, fmt, values, setValues }) {
  const val = values[field]
  return (
    <div className="fx-row">
      <span className="fx-label">{label}</span>
      <input
        type="range"
        className="fx-slider"
        min={min} max={max} step={step}
        value={val}
        onChange={e => {
          const next = { ...values, [field]: +e.target.value }
          setValues(next)
          fxSettings[field] = +e.target.value
          saveFxSettings()
        }}
      />
      <span className="fx-val">{fmt ? fmt(val) : val.toFixed(2)}</span>
    </div>
  )
}

export default function FxPanel() {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(() => ({ ...fxSettings }))

  function handleReset() {
    resetFxSettings()
    setValues({ ...FX_DEFAULTS })
  }

  return (
    <div className="fx-root">
      <button className="fx-header" onClick={() => setOpen(o => !o)}>
        <span>fx</span>
        <span className="fx-toggle-glyph">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="fx-body">
          <div className="fx-section-label">dither</div>
          <Row label="strength" field="ditherStrength" min={0} max={1}    step={0.01} values={values} setValues={setValues} />
          <Row label="levels"   field="levels"         min={2} max={8}    step={1}    fmt={v => v.toFixed(0)} values={values} setValues={setValues} />
          <Row label="noise"    field="noiseStrength"  min={0} max={1}    step={0.01} values={values} setValues={setValues} />
          <Row label="mono"     field="monochrome"     min={0} max={1}    step={0.01} values={values} setValues={setValues} />

          <div className="fx-section-label fx-section-label--gap">bleed</div>
          <Row label="radius"   field="bleedRadius"    min={0} max={12}   step={0.5}  fmt={v => v.toFixed(1)} values={values} setValues={setValues} />
          <Row label="thresh"   field="bleedThreshold" min={0} max={1}    step={0.01} values={values} setValues={setValues} />
          <Row label="strength" field="bleedStrength"  min={0} max={1}    step={0.01} values={values} setValues={setValues} />
          <Row label="sat"      field="saturationBoost" min={0} max={2}   step={0.05} values={values} setValues={setValues} />

          <button className="fx-reset" onClick={handleReset}>reset</button>
        </div>
      )}
    </div>
  )
}
