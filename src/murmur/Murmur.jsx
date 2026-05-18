import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import { useSEO } from '@/lib/useSEO.js'
import PointCloudScene from './scene/PointCloudScene.jsx'
import ModeToggle from './ui/ModeToggle.jsx'
import MediaBar from './ui/MediaBar.jsx'
import SculptHUD from './ui/SculptHUD.jsx'
import KeyboardHelper from './ui/KeyboardHelper.jsx'
import MappingsPanel from './ui/MappingsPanel.jsx'
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

  // Navigate back to pond — fade visual + audio, save session state, then route
  const navigateToPond = useCallback(async () => {
    try {
      const state = useMurmurStore.getState()
      sessionStorage.setItem('murmur_mode', state.mode)
      if (state.sculptParams) {
        sessionStorage.setItem('murmur_sculpt_params', JSON.stringify(state.sculptParams))
      }
    } catch (_) {}

    setExiting(true)  // kick off CSS opacity fade

    if (audioEngine.isAnyAudioActive) audioEngine.fadeOut(0.3)

    await new Promise(r => setTimeout(r, 350))  // wait for fade to reach silence

    audioEngine.stopAll()  // stop all players now that volume is at -60dB
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

      {/* Bottom-center: combined media bar */}
      <div className="murmur-bottom-center">
        <MediaBar />
      </div>

      {/* Bottom-right: sculpt HUD */}
      {cloud && <SculptHUD />}

      {/* Decimation notice */}
      {noticeText && (
        <div className="murmur-notice" role="status">
          {noticeText}
        </div>
      )}

      {/* Left-side panel: mappings (reactive only) */}
      {cloud && mode === 'reactive' && (
        <div className="murmur-left-panels">
          <MappingsPanel />
        </div>
      )}

      {/* Keyboard shortcuts helper (desktop only, fades after 5s) */}
      {cloud && <KeyboardHelper onNavigateToPond={navigateToPond} />}

    </div>
  )
}
