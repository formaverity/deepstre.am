import { useEffect, useRef } from 'react'
import { usePondField } from '@/pond/usePondField.js'
import { useCamera } from '@/pond/useCamera.js'
import { useCreatures } from '@/pond/useCreatures.js'
import AsciiField from '@/pond/AsciiField.jsx'
import CameraControls from '@/pond/CameraControls.jsx'
import ProjectFrame from '@/frames/ProjectFrame.jsx'
import usePondStore from '@/store/usePondStore.js'
import projects from '@/projects/_manifest.js'
import '@/pond/pond.css'

export default function Pond() {
  // Deep-link: ?project=slug opens a project on load
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('project')
    if (!slug) return
    const p = projects.find(proj => proj.slug === slug)
    if (!p) return
    usePondStore.getState().openProject({
      slug:   p.slug,
      name:   p.name,
      status: p.status,
      mode:   p.frame.mode,
      target: p.frame.target,
    })
  }, [])
  const { field, loading, error } = usePondField()
  // Shared ref: set to the creature being dragged, null otherwise.
  // useCamera reads it to suppress panning; AsciiField writes it on creature mousedown.
  const creatureDragRef = useRef(null)
  const pondRef         = useCamera(creatureDragRef)
  const creaturesRef    = useCreatures(field)

  return (
    <div ref={pondRef} className="pond-root">
      {loading && <CenteredNote>Loading pond…</CenteredNote>}
      {error   && <CenteredNote error>{error.message} — run the bake tool first</CenteredNote>}
      {field   && <AsciiField field={field} creaturesRef={creaturesRef} creatureDragRef={creatureDragRef} />}
      {field   && <CameraControls />}
      {field   && <HintBar />}
      {import.meta.env.DEV && (
        <a href="/tools/bake-aerial/index.html" target="_blank" rel="noreferrer" className="dev-bake-btn">
          bake
        </a>
      )}
      <ProjectFrame />
    </div>
  )
}

function HintBar() {
  const hasProject = usePondStore(s => s.activeProject !== null)
  return (
    <div className="hint-bar">
      scroll to zoom · drag to pan{hasProject ? ' · ESC to close' : ''}
    </div>
  )
}

function CenteredNote({ children, error }) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'ui-monospace, "Courier New", monospace',
      fontSize: '12px',
      color: error ? '#c06060' : 'var(--color-muted, #5a7060)',
      pointerEvents: 'none',
    }}>
      {children}
    </div>
  )
}
