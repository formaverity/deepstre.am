import { useEffect, useRef, useState } from 'react'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'

const SAMPLE_TRACKS = [
  { url: '/clouds/02_Radiators.mp3', name: '02 Radiators' },
]

const WAVE = '▁▂▃▄▅▆▇█▇▆▅▄▃▂▁'

export default function AudioUpload() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [waveOff, setWaveOff]   = useState(0)
  const inputRef = useRef()

  // Wave animation while decoding
  useEffect(() => {
    if (!loading) { setWaveOff(0); return }
    const id = setInterval(() => setWaveOff(o => (o + 1) % WAVE.length), 80)
    return () => clearInterval(id)
  }, [loading])

  // Auto-dismiss errors after 5s
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(id)
  }, [error])

  const handleFile = async (file) => {
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      await audioEngine.start()
      await audioEngine.loadBuffer(file)
    } catch (err) {
      setError('could not decode — click to retry')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const waveStr = WAVE.slice(waveOff) + WAVE.slice(0, waveOff)

  const label = dragging
    ? 'drop here'
    : loading
    ? waveStr
    : error
    ? error
    : 'drop audio · click to browse'

  return (
    <div className="murmur-upload-wrap">
      <div
        className={[
          'murmur-upload',
          dragging ? 'murmur-upload--dragging' : '',
          error     ? 'murmur-upload--error'    : '',
          loading   ? 'murmur-upload--loading'  : '',
        ].filter(Boolean).join(' ')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !loading && inputRef.current?.click()}
        aria-label="Upload audio file"
        aria-busy={loading}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          onChange={(e) => { handleFile(e.target.files[0]); e.target.value = '' }}
          style={{ display: 'none' }}
        />
        <span className={`murmur-upload-label${loading ? ' murmur-upload-label--wave' : ''}`}>
          {label}
        </span>
      </div>

      {SAMPLE_TRACKS.length > 0 && (
        <ul className="murmur-samples">
          {SAMPLE_TRACKS.map((track) => (
            <li key={track.url}>
              <button
                className="murmur-sample-btn"
                onClick={async () => {
                  await audioEngine.start()
                  const buf = await fetch(track.url).then(r => r.arrayBuffer())
                  await audioEngine.loadBuffer(buf)
                }}
              >
                {track.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
