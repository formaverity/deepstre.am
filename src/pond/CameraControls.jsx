import { useState, useEffect } from 'react'
import usePondStore from '@/store/usePondStore.js'

export default function CameraControls() {
  const [displayZoom, setDisplayZoom] = useState(() => usePondStore.getState().camera.zoom)

  useEffect(() => {
    let timer = null
    const unsub = usePondStore.subscribe(() => {
      if (timer) return
      timer = setTimeout(() => {
        setDisplayZoom(usePondStore.getState().camera.zoom)
        timer = null
      }, 100)
    })
    return () => { unsub(); if (timer) clearTimeout(timer) }
  }, [])

  return (
    <div className="zoom-readout">⌕ {displayZoom.toFixed(2)}×</div>
  )
}
