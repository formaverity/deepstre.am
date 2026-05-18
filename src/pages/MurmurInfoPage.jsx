import { Link } from 'react-router-dom'
import { useSEO } from '@/lib/useSEO.js'
import './pages.css'
import './murmur-info.css'

const POND_TRACKS = [
  { num: '01', name: 'Pond 10/21' },
  { num: '02', name: 'Radiators' },
  { num: '03', name: 'Hum' },
  { num: '04', name: "L'Enfant" },
  { num: '05', name: 'Canarium' },
  { num: '05', name: 'Opal' },
]

const BUNDLED_CLOUDS = [
  {
    id:            'default-grove',
    name:          'Default Grove',
    place:         'Whitmore Lake, MI',
    captured:      '2026-03-14',
    captured_with: 'iPhone 15 Pro / Polycam',
    description:
      'Five oaks at the western edge of the property, captured at golden hour. The understory is sparse this early in spring — you can hear it in how the canopy sits above empty air.',
  },
]

export default function MurmurInfoPage() {
  useSEO({
    title:       'MURMUR — deepstre.am',
    description: 'Spatial memories and a mini album, together in a generative granular instrument. POND by mosspcm, played through LiDAR scans of real places.',
    image:       'https://deepstre.am/og-murmur.png',
  })

  return (
    <div className="mi-root">
      <nav className="page-breadcrumb" aria-label="breadcrumb">
        <Link to="/" className="page-breadcrumb-link">deepstre.am</Link>
        <span className="page-breadcrumb-sep">/</span>
        <Link to="/murmur" className="page-breadcrumb-link">murmur</Link>
        <span className="page-breadcrumb-sep">/</span>
        <span className="page-breadcrumb-current">about</span>
      </nav>

      <div className="mi-content">
        <header className="mi-header">
          <p className="mi-title">MURMUR</p>
          <p className="mi-subtitle">spatial memory · generative instrument</p>
        </header>

        {/* ── What is this ──────────────────────────────────────────── */}
        <section className="mi-section" aria-labelledby="what-heading">
          <h2 id="what-heading" className="mi-heading">what is this</h2>
          <p className="mi-body">
            These are spatial memories: LiDAR scans of real outdoor places, each one a frozen moment
            of space stored as a point cloud. And <em>POND</em> is a mini album I made as mosspcm —
            loop-built, ecological. 808 bass and acoustic synthesis and field percussion.
            Music that sounds like somewhere specific.
          </p>
          <p className="mi-body">
            When they meet in MURMUR, the scan becomes the instrument. Your viewpoint is the
            playhead — orbit the cloud and you're moving through the track; different regions of the
            forest resonate with different pitches based on their color; distance shapes grain
            density; tilt shifts pitch. Nothing plays the same way twice.
          </p>
          <p className="mi-body">
            <em>An ecological DJ booth.</em>{' '}
            The place and the music are inseparable here.
          </p>
        </section>

        {/* ── The music ─────────────────────────────────────────────── */}
        <section className="mi-section" aria-labelledby="music-heading">
          <h2 id="music-heading" className="mi-heading">the music</h2>
          <p className="mi-body mi-body--dim">
            POND by mosspcm. Six tracks, all preloaded. Select one from the track picker
            and press play — or touch the cloud to scrub through it directly in granular space.
          </p>

          <ul className="mi-track-list" aria-label="POND tracklist">
            {POND_TRACKS.map((t, i) => (
              <li key={i} className="mi-track">
                <span className="mi-track-num">{t.num}</span>
                <span className="mi-track-name">{t.name}</span>
              </li>
            ))}
          </ul>

          <p className="mi-body mi-body--dim">
            You can also upload your own audio — any .mp3, .wav, or .flac — and run it
            through any of the scans.
          </p>
        </section>

        {/* ── How to play it ────────────────────────────────────────── */}
        <section className="mi-section" aria-labelledby="how-heading">
          <h2 id="how-heading" className="mi-heading">how to play it</h2>

          <p className="mi-body">
            MURMUR has one mode and two stances. Press play to listen — the cloud responds to the
            audio. Touch the cloud — orbit, drag, press and hold — and you're playing it: orbital
            position scrubs through time, vertical tilt shifts pitch, distance shapes grain. The
            transition is instant; the moment you let go, the audio resumes from where the orbit
            left it.
          </p>

          <p className="mi-body">
            Every pairing of scan and track composes itself: the spectral character of the audio
            and the color distribution of the cloud together determine the resonance targets, chord
            voicing, and visual response. Different scans with the same track produce different
            compositions. The instrument is the relationship.
          </p>

          <div className="mi-mode-block">
            <p className="mi-mode-name">listening</p>
            <ol className="mi-steps">
              <li>Select a track from the bottom bar — it loads into the instrument. Press play to start.</li>
              <li>The cloud's color regions activate as the spectrum shifts — different zones respond to different frequencies.</li>
              <li>Orbit the camera freely. The stereo image follows your position.</li>
              <li>Press <kbd className="mi-key">space</kbd> to pause and resume.</li>
            </ol>
          </div>

          <div className="mi-mode-block">
            <p className="mi-mode-name">playing</p>
            <ol className="mi-steps">
              <li>Touch (click and drag) the cloud to enter granular mode.</li>
              <li><strong>Orbit</strong> — scrubs through the recording. One full orbit = one full pass through the audio.</li>
              <li><strong>Tilt</strong> — looking down slows and deepens the sound; looking up pitches it higher.</li>
              <li><strong>Distance</strong> — move close for fine granular texture; pull back for phrase-length grain.</li>
              <li><strong>Speed</strong> — fast sweeping fragments the audio; holding still is dense and lush.</li>
              <li>Release — playback resumes from exactly where the orbit left it.</li>
            </ol>
          </div>

          <div className="mi-mode-block">
            <p className="mi-mode-name">chord</p>
            <ol className="mi-steps">
              <li>Press and hold anywhere on the cloud. After a moment, a chord sustains from that point.</li>
              <li>Drag while held — horizontal shifts filter cutoff; vertical shifts resonance.</li>
              <li>Release — the chord fades over ~400ms.</li>
              <li>Multiple touches: independent chord layers.</li>
            </ol>
          </div>

          <p className="mi-note">
            Keyboard: <kbd className="mi-key">space</kbd> play/pause &nbsp;·&nbsp;
            <kbd className="mi-key">esc</kbd> close &nbsp;·&nbsp;
            <kbd className="mi-key">i</kbd> toggle breadcrumb
          </p>
        </section>

        {/* ── The scans ─────────────────────────────────────────────── */}
        <section className="mi-section" aria-labelledby="scans-heading">
          <h2 id="scans-heading" className="mi-heading">the scans</h2>
          <p className="mi-body mi-body--dim">
            LiDAR captures of specific outdoor places at specific moments. Not backdrop assets —
            spatial records. More are coming.
          </p>

          <ul className="mi-cloud-list">
            {BUNDLED_CLOUDS.map(c => (
              <li key={c.id} className="mi-cloud">
                <div className="mi-cloud-header">
                  <span className="mi-cloud-name">{c.name}</span>
                  <span className="mi-cloud-meta">
                    {c.place}{c.captured ? ` · ${c.captured}` : ''}
                    {c.captured_with ? ` · ${c.captured_with}` : ''}
                  </span>
                </div>
                <p className="mi-cloud-desc">{c.description}</p>
              </li>
            ))}
          </ul>

          <p className="mi-body mi-body--dim">
            Upload your own .ply file to bring a different place into the instrument.
          </p>
        </section>

        <footer className="mi-footer">
          <Link to="/murmur" className="mi-back">← open murmur</Link>
          <Link to="/" className="mi-back mi-back--dim">deepstre.am</Link>
        </footer>
      </div>
    </div>
  )
}
