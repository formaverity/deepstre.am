import { useEffect, useState } from 'react'
import usePondStore from '@/store/usePondStore.js'
import './frames.css'

function StatusBadge({ status }) {
  return (
    <span className={`frame-status frame-status--${status}`}>{status}</span>
  )
}

export default function IframeModal({ project }) {
  const closeProject = usePondStore(s => s.closeProject)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') closeProject()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeProject])

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) closeProject()
  }

  return (
    <div
      className={`frame-overlay${visible ? ' frame-overlay--visible' : ''}`}
      onClick={handleOverlayClick}
    >
      <div className="frame-modal">
        <div className="frame-header">
          <span className="frame-title">{project.name}</span>
          {project.status !== 'active' && <StatusBadge status={project.status} />}
          <div className="frame-header-actions">
            {project.target && (
              <a
                href={project.target}
                target="_blank"
                rel="noreferrer"
                className="frame-action-link"
                title="open in new tab"
              >↗</a>
            )}
            <button
              className="frame-close-btn"
              onClick={closeProject}
              aria-label="close"
            >×</button>
          </div>
        </div>
        <div className="frame-body">
          {project.target
            ? <iframe src={project.target} loading="lazy" title={project.name} />
            : <div className="frame-archived-notice">
                <span>archived</span>
                <span>this project is no longer available online</span>
              </div>
          }
        </div>
      </div>
    </div>
  )
}
