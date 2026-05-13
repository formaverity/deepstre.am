import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import { useSEO } from '@/lib/useSEO.js'
import PointCloudScene from './scene/PointCloudScene.jsx'
import ModeToggle from './ui/ModeToggle.jsx'
import Transport from './ui/Transport.jsx'
import AudioUpload from './ui/AudioUpload.jsx'
import SculptHUD from './ui/SculptHUD.jsx'
import CloudPicker from './ui/CloudPicker.jsx'
import KeyboardHelper from './ui/KeyboardHelper.jsx'
import MappingsPanel from './ui/MappingsPanel.jsx'
import ChordPicker from './ui/ChordPicker.jsx'
import './murmur.css'

// Mode-default camera positions
const CAM = {
  sculpt:   { x: 2.2, y: 1.0, z: 2.2 },
  reactive: { x: 2.0, y: 1.5, z: 2.5 },
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

  // Navigate back to pond — fade audio if active, save session state, then route
  const navigateToPond = useCallback(async () => {
    try {
      const state = useMurmurStore.getState()
      sessionStorage.setItem('murmur_mode', state.mode)
      if (state.sculptParams) {
        sessionStorage.setItem('murmur_sculpt_params', JSON.stringify(state.sculptParams))
      }
    } catch (_) {}

    if (audioEngine.isAnyAudioActive) {
      audioEngine.fadeOut(0.2)
      await new Promise(r => setTimeout(r, 200))
    }
    audioEngine.fadeIn(0.001)  // reset volume for next visit
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
    audioEngine.fadeIn(0.001)  // reset in case previous exit left volume faded
    try {
      const savedMode = sessionStorage.getItem('murmur_mode')
      if (savedMode === 'reactive' || savedMode === 'sculpt') {
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

  // Mode-switch choreography
  useEffect(() => {
    if (firstMount.current) { firstMount.current = false; return }
    if (!audioEngine.isReady) return

    clearTimeout(swapTimer.current)
    clearTimeout(vignetteTimer.current)
    clearTimeout(camTimer.current)

    // Reset grain freeze on every mode change
    setGrainFrozen(false)

    // 0ms: vignette darkens edges (CSS animation handles 0→peak→0)
    setVignetteActive(true)

    // 80ms: begin audio fade-out over 200ms
    swapTimer.current = setTimeout(() => {
      audioEngine.fadeOut(0.2)

      // 160ms (80+80): swap chains at fade midpoint, then fade back in
      setTimeout(() => {
        if (mode === 'sculpt') {
          audioEngine.detachReactiveChain()
          audioEngine.attachSculptChain()
        } else {
          audioEngine.detachSculptChain()
          audioEngine.attachReactiveChain()
        }
        audioEngine.fadeIn(0.2)
      }, 80)
    }, 80)

    // 200ms: ease camera toward mode-default position
    camTimer.current = setTimeout(() => {
      setCameraTarget(CAM[mode])
    }, 200)

    // 700ms: remove vignette element (CSS animation is complete)
    vignetteTimer.current = setTimeout(() => setVignetteActive(false), 700)

    return () => {
      clearTimeout(swapTimer.current)
      clearTimeout(vignetteTimer.current)
      clearTimeout(camTimer.current)
    }
  }, [mode, setCameraTarget, setGrainFrozen])

  return (
    <div className="murmur-root">

      {/* Vignette — edge darkening during mode transitions */}
      {vignetteActive && <div className="murmur-vignette" aria-hidden="true" />}

      {/* Top-left: breadcrumb */}
      <nav className="murmur-breadcrumb" aria-label="breadcrumb">
        <Link to="/" className="murmur-breadcrumb-link">← pond</Link>
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
      <CloudPicker />

      {/* Top-center: mode toggle */}
      {cloud && <ModeToggle />}

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

      {/* Full-bleed 3-D scene — keep mounted once initial cloud is ready; cloud swaps are handled inside PointCloud via useMemo */}
      {cloud && <PointCloudScene />}

      {/* Bottom-center: transport + upload — stacked in a flex column so they never overlap */}
      {cloud && (
        <div className="murmur-bottom-center">
          <Transport />
          <AudioUpload />
        </div>
      )}

      {/* Bottom-right: sculpt HUD */}
      {cloud && <SculptHUD />}

      {/* Decimation notice */}
      {noticeText && (
        <div className="murmur-notice" role="status">
          {noticeText}
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

      {/* Left-side panel stack: mappings (reactive only) + chord picker (both modes) */}
      {cloud && (
        <div className="murmur-left-panels">
          {mode === 'reactive' && <MappingsPanel />}
          <ChordPicker />
        </div>
      )}

      {/* Keyboard shortcuts helper (desktop only, fades after 5s) */}
      {cloud && <KeyboardHelper onNavigateToPond={navigateToPond} />}

    </div>
  )
}
