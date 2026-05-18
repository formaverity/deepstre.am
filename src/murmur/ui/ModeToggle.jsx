import useMurmurStore from '@/murmur/store/useMurmurStore.js'

export default function ModeToggle() {
  const mode     = useMurmurStore(s => s.mode)
  const setMode  = useMurmurStore(s => s.setMode)
  const isLoaded = useMurmurStore(s => s.audio.isLoaded)

  const tooltip = isLoaded ? undefined : 'load audio first'

  return (
    <div
      className="murmur-mode-toggle"
      title={tooltip}
      aria-label="Mode toggle"
    >
      {['reactive', 'sculpt'].map((m) => (
        <button
          key={m}
          className={`murmur-mode-btn${mode === m ? ' murmur-mode-btn--active' : ''}`}
          onClick={() => isLoaded && setMode(m)}
          disabled={!isLoaded}
          aria-pressed={mode === m}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
