import { Link } from 'react-router-dom'
import { useSEO } from '@/lib/useSEO.js'
import './pages.css'
import './murmur-info.css'

// Update this list whenever a new cloud is added to clouds/_manifest.js
const BUNDLED_CLOUDS = [
  {
    id:       'default-grove',
    name:     'Default Grove',
    place:    'Whitmore Lake, MI',
    captured: '2026-03-14',
    captured_with: 'iPhone 15 Pro / Polycam',
    description:
      'Five oaks at the western edge of the property, captured at golden hour. The understory is sparse this early in spring — you can hear it in how the canopy sits above empty air.',
  },
]

export default function MurmurInfoPage() {
  useSEO({
    title:       'MURMUR — deepstre.am',
    description: 'A point cloud audio instrument. LiDAR scans of real places, driven by whatever sound you bring.',
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
          <p className="mi-subtitle">point cloud audio instrument</p>
        </header>

        {/* ── What is this ──────────────────────────────────────────── */}
        <section className="mi-section" aria-labelledby="what-heading">
          <h2 id="what-heading" className="mi-heading">what is this</h2>
          <p className="mi-body">
            A LiDAR scan is a sampling of a place — every point in the cloud is a moment of light
            returning to a sensor, a small act of measurement that says{' '}
            <em>something was here.</em> An audio recording is the same thing, done differently:
            a diaphragm displaced by air, translated to numbers, stored. Both are imperfect records
            of a real moment in a real location. MURMUR is what happens when you cross them.
            Load a scan of a grove. Load a field recording, a piece of music, whatever you brought.
            Watch the cloud respond. Or take the wheel: orbit the camera and let your position
            in space become the score, the recording scrubbing past you as you move.
            The instrument is the camera. The score is the cloud. The source material is yours.
          </p>
        </section>

        {/* ── How to play it ────────────────────────────────────────── */}
        <section className="mi-section" aria-labelledby="how-heading">
          <h2 id="how-heading" className="mi-heading">how to play it</h2>

          <div className="mi-mode-block">
            <p className="mi-mode-name">reactive</p>
            <ol className="mi-steps">
              <li>Drop an audio file (or click the upload bar) to load it into the engine.</li>
              <li>Press play or hit <kbd className="mi-key">space</kbd>. The cloud responds to frequency bands in real time — bass swells the points, treble shimmers them.</li>
              <li>Scrub the timeline to navigate the recording. The cloud follows.</li>
              <li>When nothing is playing, the cloud breathes slowly on its own.</li>
            </ol>
          </div>

          <div className="mi-mode-block">
            <p className="mi-mode-name">sculpt</p>
            <ol className="mi-steps">
              <li>Load audio first, then switch modes with the toggle or press <kbd className="mi-key">m</kbd>.</li>
              <li><strong>Orbit</strong> (drag horizontally) — scrubs through the recording. A full orbit plays the whole file.</li>
              <li><strong>Tilt</strong> (drag vertically) — changes playback rate. Looking at the ground slows and thickens the sound; looking up pitches it higher.</li>
              <li><strong>Dolly</strong> (scroll or pinch) — controls grain size. Move in close for granular texture; pull back for long, phrase-length grains that blur into drones.</li>
              <li><strong>Speed</strong> — how fast you orbit changes overlap density. Still camera is lush; fast sweeping creates stuttery fragmentation.</li>
              <li>Press <kbd className="mi-key">space</kbd> to freeze the buffer position — the cloud keeps responding to your movement, but the recording stays put. Good for finding a sound, then exploring around it.</li>
            </ol>
          </div>

          <p className="mi-note">
            Keyboard shortcuts: <kbd className="mi-key">m</kbd> mode · <kbd className="mi-key">i</kbd> info ·{' '}
            <kbd className="mi-key">r</kbd> reset camera · <kbd className="mi-key">?</kbd> full list
          </p>
        </section>

        {/* ── Site notes ────────────────────────────────────────────── */}
        <section className="mi-section" aria-labelledby="clouds-heading">
          <h2 id="clouds-heading" className="mi-heading">site notes</h2>
          <p className="mi-body mi-body--dim">
            These are the bundled clouds. Each one is a scan of a specific place at a specific
            moment. They are not backdrop assets. They are records.
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
        </section>

        <footer className="mi-footer">
          <Link to="/murmur" className="mi-back">← open murmur</Link>
          <Link to="/" className="mi-back mi-back--dim">deepstre.am</Link>
        </footer>
      </div>
    </div>
  )
}
