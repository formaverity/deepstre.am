import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import { useSEO } from '@/lib/useSEO.js'
import PointCloudScene from './scene/PointCloudScene.jsx'
import SourceToggle from './ui/SourceToggle.jsx'
import SourcePanel from './ui/SourcePanel.jsx'
import SculptHUD from './ui/SculptHUD.jsx'
import KeyboardHelper from './ui/KeyboardHelper.jsx'
import MappingsPanel from './ui/MappingsPanel.jsx'
import ChordPicker from './ui/ChordPicker.jsx'
import FxPanel from './ui/FxPanel.jsx'
import './murmur.css'

// Mode-default camera positions
const CAM = {
  interactive: { x: 2.2, y: 1.0, z: 2.2 },
  playback:    { x: 2.0, y: 1.5, z: 2.5 },
}

export default function Murmur() {
  const loadCloud        = useMurmurStore(s => s.loadCloud)
  const cloudLoading     = useMurmurStore(s => s.cloudLoading)
  const cloudError       = useMurmurStore(s => s.cloudError)
  const cloud            = useMurmurStore(s => s.cloud)
  const mode             = useMurmurStore(s => s.mode)
  const decimationNotice = useMurmurStore(s => s.decimationNotice)
  const infoOpen         = useMurmurStore(s => s.infoOpen)
  const setInfoOpen      = useMurmurStore(s => s.setInfoOpen)
  const setCameraTarget  = useMurmurStore(s => s.setCameraTarget)
  const setGrainFrozen   = useMurmurStore(s => s.setGrainFrozen)

  const navigate = useNavigate()

  useSEO({
    title:       'MURMUR — deepstre.am',
    description: 'A point cloud audio instrument. LiDAR scans of real places, driven by whatever sound you bring.',
    image:       'https://deepstre.am/og-murmur.png',
  })

  const [vignetteActive, setVignetteActive] = useState(false)
  const [noticeText, setNoticeText]         = useState(null)
  const [exiting, setExiting]               = useState(false)
  const [spatialHint, setSpatialHint]       = useState(false)
  const spatialHintTimer = useRef(null)

  // Navigate back to pond — fade visual + audio, save session state, then route
  const navigateToPond = useCallback(async () => {
    try {
      const state = useMurmurStore.getState()
      sessionStorage.setItem('murmur_mode', state.mode)
      if (state.sculptParams) {
        sessionStorage.setItem('murmur_sculpt_params', JSON.stringify(state.sculptParams))
      }
    } catch (_) {}

    setExiting(true)

    if (audioEngine.isAnyAudioActive) audioEngine.fadeOut(0.3)

    await new Promise(r => setTimeout(r, 340))

    audioEngine.stopAll()
    audioEngine.fadeIn(0.001)
    navigate('/')
  }, [navigate])

  const firstMount    = useRef(true)
  const swapTimer     = useRef(null)
  const vignetteTimer = useRef(null)
  const camTimer      = useRef(null)
  const noticeTimer   = useRef(null)
  const wasPlaying    = useRef(false)

  // Load default cloud on mount
  useEffect(() => {
    loadCloud('default-grove')
  }, [loadCloud])

  // Restore session state from previous visit and reset volume
  useEffect(() => {
    audioEngine.fadeIn(0.001)
    try {
      const savedMode = sessionStorage.getItem('murmur_mode')
      if (savedMode === 'playback' || savedMode === 'interactive') {
        useMurmurStore.getState().setMode(savedMode)
      }
      const savedParams = sessionStorage.getItem('murmur_sculpt_params')
      if (savedParams) {
        useMurmurStore.getState().setSculptParams(JSON.parse(savedParams))
      }
    } catch (_) {}
  }, [])

  // Decimation notice auto-dismiss
  useEffect(() => {
    if (!decimationNotice) return
    setNoticeText(decimationNotice)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNoticeText(null), 8000)
    return () => clearTimeout(noticeTimer.current)
  }, [decimationNotice])

  // Auto-pause / resume when tab is hidden
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        wasPlaying.current = audioEngine.isPlaying
        if (audioEngine.isPlaying) audioEngine.pause()
      } else {
        if (wasPlaying.current) audioEngine.play()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  // One-time headphone hint on first load
  useEffect(() => {
    try {
      if (localStorage.getItem('murmur-spatial-hint-v1')) return
      localStorage.setItem('murmur-spatial-hint-v1', '1')
    } catch (_) {}
    setSpatialHint(true)
    spatialHintTimer.current = setTimeout(() => setSpatialHint(false), 8000)
    return () => clearTimeout(spatialHintTimer.current)
  }, [])

  // Mode-switch choreography: audio chain swap + camera lerp + vignette flash
  useEffect(() => {
    if (firstMount.current) { firstMount.current = false; return }
    if (!audioEngine.isReady) return

    clearTimeout(swapTimer.current)
    clearTimeout(vignetteTimer.current)
    clearTimeout(camTimer.current)

    setGrainFrozen(false)
    setVignetteActive(true)

    swapTimer.current = setTimeout(() => {
      audioEngine.fadeOut(0.2)

      setTimeout(() => {
        if (mode === 'interactive') {
          audioEngine.detachPlaybackChain()
          audioEngine.attachInteractiveChain()
        } else {
          audioEngine.detachInteractiveChain()
          audioEngine.attachPlaybackChain()
        }
        audioEngine.fadeIn(0.2)
      }, 80)
    }, 80)

    camTimer.current = setTimeout(() => {
      setCameraTarget(CAM[mode])
    }, 200)

    vignetteTimer.current = setTimeout(() => setVignetteActive(false), 700)

    return () => {
      clearTimeout(swapTimer.current)
      clearTimeout(vignetteTimer.current)
      clearTimeout(camTimer.current)
    }
  }, [mode, setCameraTarget, setGrainFrozen])

  return (
    <div className={`murmur-root${exiting ? ' murmur-root--exiting' : ''}`}>

      {/* Vignette — edge darkening during mode transitions */}
      {vignetteActive && <div className="murmur-vignette" aria-hidden="true" />}

      {/* Top-left: breadcrumb */}
      <nav className="murmur-breadcrumb" aria-label="breadcrumb">
        <button className="murmur-breadcrumb-link" onClick={navigateToPond}>← pond</button>
      </nav>

      {/* Top-right: status + close button */}
      <div className="murmur-top-right-cluster">
        <div className="murmur-status" aria-label="audio status">
          <span className={`murmur-status-dot${cloud ? ' murmur-status-dot--ready' : ''}`} />
          <span>{cloud ? 'ready' : 'idle'}</span>
        </div>
        <button
          className="murmur-close-btn"
          onClick={navigateToPond}
          title="return to pond"
          aria-label="return to pond"
        >
          ✕
        </button>
      </div>
      {/* Top-center: playback / interactive source toggle */}
      {cloud && <SourceToggle />}

      {/* Loading / error / idle placeholder */}
      {cloudLoading && (
        <div className="murmur-body">
          <p className="murmur-loading">loading grove…</p>
        </div>
      )}
      {cloudError && (
        <div className="murmur-body">
          <p className="murmur-error">{cloudError}</p>
        </div>
      )}
      {!cloud && !cloudLoading && !cloudError && (
        <div className="murmur-body">
          <p className="murmur-title">MURMUR</p>
          <p className="murmur-subtitle">point cloud audio instrument</p>
        </div>
      )}

      {/* Full-bleed 3-D scene — always sculpt visual frame */}
      {cloud && <PointCloudScene />}

      {/* Bottom-center: unified source panel (audio + cloud + transport) */}
      <SourcePanel />

      {/* Bottom-right: sculpt HUD — both modes */}
      {cloud && <SculptHUD />}

      {/* Decimation notice */}
      {noticeText && (
        <div className="murmur-notice" role="status">
          {noticeText}
        </div>
      )}

      {/* One-time headphone hint */}
      {spatialHint && (
        <div className="murmur-notice murmur-notice--hint" role="status" aria-live="polite">
          headphones recommended — spatial audio is on
        </div>
      )}

      {/* Bottom-left: info button + card */}
      {cloud && (
        <>
          <button
            className={`murmur-info-btn${infoOpen ? ' murmur-info-btn--active' : ''}`}
            onClick={() => setInfoOpen(!infoOpen)}
            aria-label="Cloud info"
            aria-expanded={infoOpen}
          >
            i
          </button>

          {infoOpen && (
            <div className="murmur-info-card">
              <p className="murmur-info-name">{cloud.meta?.name ?? cloud.id}</p>
              {cloud.meta?.place && (
                <p className="murmur-info-row">
                  <span className="murmur-info-label">place</span>
                  <span>{cloud.meta.place}</span>
                </p>
              )}
              {cloud.meta?.captured && (
                <p className="murmur-info-row">
                  <span className="murmur-info-label">captured</span>
                  <span>{cloud.meta.captured}</span>
                </p>
              )}
              {cloud.meta?.captured_with && (
                <p className="murmur-info-row">
                  <span className="murmur-info-label">scanner</span>
                  <span>{cloud.meta.captured_with}</span>
                </p>
              )}
              {cloud.meta?.description && (
                <p className="murmur-info-desc">{cloud.meta.description}</p>
              )}
              {cloud.meta?.audio_suggestion && (
                <p className="murmur-info-desc murmur-info-suggestion">
                  {cloud.meta.audio_suggestion}
                </p>
              )}
              <Link to="/murmur/about" className="murmur-info-about">
                read more →
              </Link>
            </div>
          )}
        </>
      )}

      {/* Left-side panel stack: mappings (interactive only) + chord (both) + fx (both) */}
      {cloud && (
        <div className="murmur-left-panels">
          {mode === 'interactive' && <MappingsPanel />}
          <ChordPicker />
          <FxPanel />
        </div>
      )}

      {/* Keyboard shortcuts helper (desktop only, fades after 5s) */}
      {cloud && <KeyboardHelper onNavigateToPond={navigateToPond} />}

    </div>
  )
}
