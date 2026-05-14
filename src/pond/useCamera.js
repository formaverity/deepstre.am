import { useRef, useEffect } from 'react'
import usePondStore from '@/store/usePondStore.js'
import { POND_PHYSICS } from '@/pond/pondPhysics.js'

export function useCamera(creatureDragRef = null) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let dragging = false
    let lastX = 0, lastY = 0
    let lastTouchDist   = null
    let touchDecayTimer = null
    let touchStartPos   = null   // {x,y} screen — for tap detection

    const store = () => usePondStore.getState()

    // ── Wheel / zoom ────────────────────────────────────────────────────

    function onWheel(e) {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      store().zoomBy(Math.exp(-e.deltaY * 0.0015), {
        mx: e.clientX - rect.left,
        my: e.clientY - rect.top,
      })
    }

    // ── Mouse drag / pan ─────────────────────────────────────────────────

    function onMouseDown(e) {
      if (e.button !== 0) return
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      el.classList.add('dragging')
    }

    function onMouseMove(e) {
      const rect = el.getBoundingClientRect()
      store().setMouse(e.clientX - rect.left, e.clientY - rect.top, true)
      if (!dragging) return
      if (creatureDragRef?.current) {
        lastX = e.clientX; lastY = e.clientY
        return
      }
      store().panBy(e.clientX - lastX, e.clientY - lastY)
      lastX = e.clientX; lastY = e.clientY
    }

    function onMouseUp() {
      dragging = false
      el.classList.remove('dragging')
    }

    function onMouseLeave() {
      store().setMouse(0, 0, false)
      dragging = false
      el.classList.remove('dragging')
    }

    // ── Touch (pinch-zoom + single-finger pan + cursor simulation) ───────

    function touchDist(a, b) {
      const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    function scheduleTouchDecay() {
      if (touchDecayTimer) clearTimeout(touchDecayTimer)
      touchDecayTimer = setTimeout(() => {
        store().setMouse(0, 0, false)
        touchDecayTimer = null
      }, POND_PHYSICS.cursor.mobileDecayMs)
    }

    function onTouchStart(e) {
      if (touchDecayTimer) { clearTimeout(touchDecayTimer); touchDecayTimer = null }

      if (e.touches.length === 2) {
        lastTouchDist = touchDist(e.touches[0], e.touches[1])
      } else {
        lastX = e.touches[0].clientX
        lastY = e.touches[0].clientY
        touchStartPos = { x: lastX, y: lastY }
        // Treat as cursor entering so the doublet is live immediately
        const rect = el.getBoundingClientRect()
        store().setMouse(lastX - rect.left, lastY - rect.top, true)
      }
    }

    function onTouchMove(e) {
      e.preventDefault()
      if (e.touches.length === 2) {
        const dist = touchDist(e.touches[0], e.touches[1])
        if (lastTouchDist) {
          const rect = el.getBoundingClientRect()
          store().zoomBy(dist / lastTouchDist, {
            mx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
            my: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
          })
        }
        lastTouchDist = dist
      } else {
        const touch = e.touches[0]
        const rect  = el.getBoundingClientRect()
        // Mirror touch position as the cursor doublet origin
        store().setMouse(touch.clientX - rect.left, touch.clientY - rect.top, true)
        // Pan
        store().panBy(touch.clientX - lastX, touch.clientY - lastY)
        lastX = touch.clientX; lastY = touch.clientY
        touchStartPos = null  // moved — not a tap
      }
    }

    function onTouchEnd(e) {
      if (e.touches.length < 2) lastTouchDist = null
      // Begin gradual cursor decay — intensity fades naturally via idle state machine
      scheduleTouchDecay()
      touchStartPos = null
    }

    // ── Bind ─────────────────────────────────────────────────────────────

    el.addEventListener('wheel',      onWheel,      { passive: false })
    el.addEventListener('mousedown',  onMouseDown)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)

    return () => {
      el.removeEventListener('wheel',      onWheel)
      el.removeEventListener('mousedown',  onMouseDown)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
      if (touchDecayTimer) clearTimeout(touchDecayTimer)
    }
  }, [])

  return ref
}
