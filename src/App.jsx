import { useEffect } from 'react'
import Pond from '@/pond/Pond.jsx'
import usePondStore from '@/store/usePondStore.js'
import projects from '@/projects/_manifest.js'

export default function App() {
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

  return <Pond />
}
