import usePondStore from '@/store/usePondStore.js'

export default function CameraControls() {
  const targetZoom    = usePondStore(s => s.camera.targetZoom)
  const zone          = usePondStore(s => s.zone())
  const zoomBy        = usePondStore(s => s.zoomBy)
  const debugFlow     = usePondStore(s => s.debug.flow)
  const toggleDebug   = usePondStore(s => s.toggleDebugFlow)

  return (
    <div className="camera-controls">
      <div className="zone-label">{zone} · {targetZoom.toFixed(2)}×</div>
      <div className="zoom-buttons">
        <button className="zoom-btn" onClick={() => zoomBy(1.25)} aria-label="zoom in">+</button>
        <button className="zoom-btn" onClick={() => zoomBy(0.8)}  aria-label="zoom out">−</button>
        <button
          className={`zoom-btn zoom-btn--fx${debugFlow ? ' active' : ''}`}
          onClick={toggleDebug}
          aria-label="toggle flow debug"
          title="show displacement vectors"
        >
          fx
        </button>
      </div>
    </div>
  )
}
