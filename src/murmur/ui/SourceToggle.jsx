import useMurmurStore from '@/murmur/store/useMurmurStore.js'

const MODES = [
  {
    id:      'playback',
    label:   'PLAYBACK',
    tooltip: 'audio plays; cloud listens',
  },
  {
    id:      'interactive',
    label:   'INTERACTIVE',
    tooltip: 'camera plays the cloud',
  },
]

export default function SourceToggle() {
  const mode     = useMurmurStore(s => s.mode)
  const setMode  = useMurmurStore(s => s.setMode)
  const isLoaded = useMurmurStore(s => s.audio.isLoaded)

  return (
    <div className="src-toggle" aria-label="Source mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`src-btn${mode === m.id ? ' src-btn--active' : ''}`}
          onClick={() => isLoaded && setMode(m.id)}
          disabled={!isLoaded}
          title={m.tooltip}
          aria-pressed={mode === m.id}
        >
          {mode === m.id && <span className="src-marker">▸ </span>}
          {m.label}
        </button>
      ))}
    </div>
  )
}
