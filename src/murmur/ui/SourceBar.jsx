import AudioDropdown from './AudioDropdown.jsx'
import ModelDropdown from './ModelDropdown.jsx'

// Drag-drop target: accepts both audio files and .ply point clouds.
// Drop anywhere on the SourceBar to load without opening the file picker.

function handleBarDrop(e, loadAudio, loadCloud) {
  e.preventDefault()
  const file = e.dataTransfer.files[0]
  if (!file) return
  if (/\.ply$/i.test(file.name)) loadCloud(file)
  else loadAudio(file)
}

export default function SourceBar() {
  return (
    <div className="src-bar" aria-label="source controls">
      <div className="src-bar-half">
        <AudioDropdown />
      </div>
      <div className="src-bar-divider" aria-hidden="true" />
      <div className="src-bar-half">
        <ModelDropdown />
      </div>
    </div>
  )
}
