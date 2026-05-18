import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { audioEngine } from '@/murmur/audio/AudioEngine.js'
import { useSEO } from '@/lib/useSEO.js'
import PointCloudScene from './scene/PointCloudScene.jsx'
import SourceBar from './ui/SourceBar.jsx'
import './murmur.css'

export default function Murmur() {
  const loadCloud    = useMurmurStore(s => s.loadCloud)
  const cloudLoading = useMurmurStore(s => s.cloudLoading)
  const cloudError   = useMurmurStore(s => s.cloudError)
  const cloud        = useMurmurStore(s => s.cloud)
  const setIsPlayingPassive = useMurmurStore(s => s.setIsPlayingPassive)
  const isPlayingPassive    = useMurmurStore(s => s.isPlayingPassive)
  const decimationNotice    = useMurmurStore(s => s.decimationNotice)

  const navigate = useNavigate()

  useSEO({
    title:       'MURMUR — deepstre.am',
    description: 'A point cloud audio instrument. LiDAR scans of real places, driven by whatever sound you bring.',
    image:       'https://deepstre.am/og-murmur.png',
  })

  const [exiting, setExiting]           = useState(false)
  const [breadcrumbVisible, setBreadcrumbVisible] = useState(true)
  const [noticeText, setNoticeText]     = useState(null)
  const noticeTimer                     = useRef(null)
  const wasPlaying                      = useRef(false)

  const navigateToPond = useCallback(async () => {
    setExiting(true)
    if (audioEngine.isAnyAudioActive) audioEngine.fadeOut(0.3)
    await new Promise(r => setTimeout(r, 340))
    audioEngine.stopAll()
    audioEngine.fadeIn(0.001)
    navigate('/')
  }, [navigate])

  // Load default cloud on mount
  useEffect(() => {
    loadCloud('default-grove')
  }, [loadCloud])

  // Restore audio volume on mount (in case previous exit faded it out)
  useEffect(() => {
    audioEngine.fadeIn(0.001)
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
        wasPlaying.current = audioEngine.activeSource !== null
        if (wasPlaying.current) audioEngine.setActiveSource(null)
      } else {
        if (wasPlaying.current && useMurmurStore.getState().isPlayingPassive) {
          audioEngine.setActiveSource('player')
        }
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  // Keyboard shortcuts (no hint bar — undisplayed)
  useEffect(() => {
    const handler = (e) => {
      // Ignore when focus is in an input/select
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        const playing = useMurmurStore.getState().isPlayingPassive
        const loaded  = useMurmurStore.getState().audio.isLoaded
        if (!loaded) return
        if (playing) {
          setIsPlayingPassive(false)
          audioEngine.setActiveSource(null)
        } else {
          setIsPlayingPassive(true)
          audioEngine.setActiveSource('player')
        }
      }

      if (e.key === 'Escape') {
        navigateToPond()
      }

      if (e.key === 'i' || e.key === 'I') {
        setBreadcrumbVisible(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigateToPond, setIsPlayingPassive])

  return (
    <div className={`murmur-root${exiting ? ' murmur-root--exiting' : ''}`}>

      {/* Top-left: breadcrumb */}
      {breadcrumbVisible && (
        <nav className="murmur-breadcrumb" aria-label="breadcrumb">
          <button className="murmur-breadcrumb-link" onClick={navigateToPond}>← pond</button>
          <span className="murmur-breadcrumb-sep">·</span>
          <span className="murmur-breadcrumb-current">murmur</span>
        </nav>
      )}

      {/* Top-right: close button */}
      <button
        className="murmur-close-btn"
        style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 10 }}
        onClick={navigateToPond}
        title="return to pond"
        aria-label="return to pond"
      >
        ✕
      </button>

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

      {/* Full-bleed 3-D scene */}
      {cloud && <PointCloudScene />}

      {/* Bottom-center: SourceBar (audio + model dropdowns) */}
      <SourceBar />

      {/* Decimation notice */}
      {noticeText && (
        <div className="murmur-notice" role="status">
          {noticeText}
        </div>
      )}

    </div>
  )
}
