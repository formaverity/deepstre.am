import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import usePondStore from '@/store/usePondStore.js'

// For route-mode projects, close the store entry and navigate immediately.
// No modal is shown — the click goes straight to the destination route.
export default function RoutedFrame({ project }) {
  const closeProject = usePondStore(s => s.closeProject)
  const navigate     = useNavigate()

  useEffect(() => {
    closeProject()
    navigate(project.target)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
