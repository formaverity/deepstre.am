import { useEffect, useState } from 'react'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

export default function SculptHUD() {
  const mode           = useMurmurStore(s => s.mode)
  const grainFrozen    = useMurmurStore(s => s.grainFrozen)
  const spatialEnabled = useMurmurStore(s => s.spatialEnabled)
  const setSpatialEnabled = useMurmurStore(s => s.setSpatialEnabled)
  const [params, setParams] = useState(null)

  useEffect(() => {
    const id = setInterval(() => {
      const p = useMurmurStore.getState().sculptParams
      if (p) setParams({ ...p })
    }, 80)
    return () => clearInterval(id)
  }, [])

  if (!params) return null

  return (
    <div className="murmur-hud" aria-label="Sculpt parameters">
      <div className="murmur-hud-title">sculpt</div>

      {mode === 'interactive' && (
        <>
          <div className="murmur-hud-row">
            <span className="murmur-hud-label">position</span>
            <span className={`murmur-hud-value${grainFrozen ? ' murmur-hud-value--frozen' : ''}`}>
              {grainFrozen ? 'frozen' : (params.positionFraction?.toFixed(3) ?? '—')}
            </span>
          </div>
          <div className="murmur-hud-row">
            <span className="murmur-hud-label">grain</span>
            <span className="murmur-hud-value">{params.grainSize != null ? `${Math.round(params.grainSize * 1000)}ms` : '—'}</span>
          </div>
          <div className="murmur-hud-row">
            <span className="murmur-hud-label">rate</span>
            <span className="murmur-hud-value">{params.playbackRate != null ? `${params.playbackRate.toFixed(2)}×` : '—'}</span>
          </div>
          <div className="murmur-hud-row">
            <span className="murmur-hud-label">overlap</span>
            <span className="murmur-hud-value">{params.overlap?.toFixed(2) ?? '—'}</span>
          </div>
          <div className="murmur-hud-row">
            <span className="murmur-hud-label">speed</span>
            <span className="murmur-hud-value">{params.speed?.toFixed(3) ?? '—'}</span>
          </div>
        </>
      )}

      {params.currentPitch != null && (
        <div className="murmur-hud-row">
          <span className="murmur-hud-label">pitch</span>
          <span className="murmur-hud-value">{params.currentPitch}</span>
        </div>
      )}
      {params.litGroups != null && (
        <div className="murmur-hud-row">
          <span className="murmur-hud-label">lit</span>
          <span className="murmur-hud-value">{params.litGroups} / 16</span>
        </div>
      )}

      <div className="murmur-hud-row murmur-hud-row--spatial">
        <span className="murmur-hud-label">360°</span>
        <button
          className={`murmur-hud-spatial-btn${spatialEnabled[mode] ? ' murmur-hud-spatial-btn--on' : ''}`}
          onClick={() => setSpatialEnabled(mode, !spatialEnabled[mode])}
          title={spatialEnabled[mode] ? 'disable spatial audio' : 'enable spatial audio'}
        >
          {spatialEnabled[mode] ? 'on' : 'off'}
        </button>
      </div>
    </div>
  )
}
