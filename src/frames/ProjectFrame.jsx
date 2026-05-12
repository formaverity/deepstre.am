import usePondStore from '@/store/usePondStore.js'
import IframeModal from './IframeModal.jsx'
import RoutedFrame from './RoutedFrame.jsx'
import DrawerFrame from './DrawerFrame.jsx'

export default function ProjectFrame() {
  const project = usePondStore(s => s.activeProject)
  if (!project) return null

  if (project.mode === 'iframe')  return <IframeModal project={project} />
  if (project.mode === 'route')   return <RoutedFrame project={project} />
  if (project.mode === 'drawer')  return <DrawerFrame project={project} />
  return null
}
