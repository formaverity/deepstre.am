import { useEffect, useRef } from 'react'
import usePondStore from '@/store/usePondStore.js'
import projects from '@/projects/_manifest.js'
import { BASE_RADIUS, INFLUENCE_MULTIPLIER } from '@/pond/displacement.js'

const BASE_CELL_H = 11
const BASE_CELL_W = BASE_CELL_H * 0.6
const TWO_PI      = Math.PI * 2

// Pull strength per status: active creatures lean toward cursor, archival barely react
const PULL_STRENGTH = { active: 1.0, paused: 0.4, archival: 0.2 }
const PULL_MAX_PX   = 28   // world-px cap on cursor attraction
const PULL_FAR_R    = 280  // world-px — pull fades to 0 beyond this
const PULL_NEAR_R   = 60   // world-px — pull is at full strength inside this

function smoothstepFalloff(d) {
  const t = Math.max(0, Math.min(1, (PULL_FAR_R - d) / (PULL_FAR_R - PULL_NEAR_R)))
  return t * t * (3 - 2 * t)
}

function buildCreature(p, i, field) {
  const pondHome       = field.creatureHomes?.[p.slug]
  const homeX          = (pondHome?.x ?? p.home.x) * field.cols * BASE_CELL_W
  const homeY          = (pondHome?.y ?? p.home.y) * field.rows * BASE_CELL_H
  const [periodX, periodY] = p.behavior.bobPeriod
  const phaseX         = (i / projects.length) * TWO_PI
  const phaseY         = phaseX + Math.PI / 2
  return {
    slug:            p.slug,
    project:         p,
    homeX,
    homeY,
    x:               homeX,
    y:               homeY,
    vx:              0,
    vy:              0,
    radius:          BASE_RADIUS,
    influenceRadius: BASE_RADIUS * INFLUENCE_MULTIPLIER,
    influence:       1.2,   // tuned down ~40% from 2.0
    amplitude:       p.behavior.bobAmplitude ?? 4,
    omegaX:          TWO_PI / periodX,
    omegaY:          TWO_PI / periodY,
    phaseX,
    phaseY,
    hoverProgress:   0,
    pullX:           0,
    pullY:           0,
  }
}

export function useCreatures(field) {
  const creaturesRef = useRef([])

  useEffect(() => {
    if (!field) return

    creaturesRef.current = projects.map((p, i) => buildCreature(p, i, field))

    const t0   = performance.now()
    let prevT  = null
    let rafId

    function tick() {
      rafId = requestAnimationFrame(tick)
      const t  = (performance.now() - t0) / 1000
      const dt = prevT === null ? 0 : Math.min(t - prevT, 0.1)
      prevT = t

      const { mouse, camera } = usePondStore.getState()
      const cursorInside = mouse.inside
      const cursorWX = cursorInside ? (mouse.x - camera.x) / camera.zoom : null
      const cursorWY = cursorInside ? (mouse.y - camera.y) / camera.zoom : null

      // Time-corrected lerp factor: 0.08 per frame at 60fps
      const lerpFactor = 1 - Math.pow(0.92, dt * 60)

      for (const c of creaturesRef.current) {
        // Bob animation
        const bobX = c.amplitude * Math.sin(c.omegaX * t + c.phaseX)
        const bobY = c.amplitude * Math.cos(c.omegaY * t + c.phaseY)
        c.vx = c.amplitude * c.omegaX *  Math.cos(c.omegaX * t + c.phaseX)
        c.vy = c.amplitude * c.omegaY * -Math.sin(c.omegaY * t + c.phaseY)

        // Cursor attraction
        let targetPX = 0, targetPY = 0
        if (cursorWX !== null) {
          const dx = cursorWX - c.homeX
          const dy = cursorWY - c.homeY
          const d  = Math.sqrt(dx * dx + dy * dy)
          if (d > 0.5 && d < PULL_FAR_R) {
            const statusMult = PULL_STRENGTH[c.project.status] ?? 1.0
            const fo         = smoothstepFalloff(d)
            const mag        = Math.min(PULL_MAX_PX, fo * 20 * statusMult)
            targetPX = (dx / d) * mag
            targetPY = (dy / d) * mag
          }
        }

        // Lerp toward target pull (eases in and out organically)
        c.pullX += (targetPX - c.pullX) * lerpFactor
        c.pullY += (targetPY - c.pullY) * lerpFactor

        c.x = c.homeX + bobX + c.pullX
        c.y = c.homeY + bobY + c.pullY
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [field])

  return creaturesRef
}
