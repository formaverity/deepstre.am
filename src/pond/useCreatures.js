import { useEffect, useRef } from 'react'
import projects from '@/projects/_manifest.js'
import { BASE_RADIUS, INFLUENCE_MULTIPLIER } from '@/pond/displacement.js'

const BASE_CELL_H = 11
const BASE_CELL_W = BASE_CELL_H * 0.6
const TWO_PI      = Math.PI * 2

function buildCreature(p, i, field) {
  const pondHome       = field.creatureHomes?.[p.slug]
  const homeX          = (pondHome?.x ?? p.home.x) * field.cols * BASE_CELL_W
  const homeY          = (pondHome?.y ?? p.home.y) * field.rows * BASE_CELL_H
  const [periodX, periodY] = p.behavior.bobPeriod
  // Spread phases evenly across creatures; quarter-turn between axes → elliptical orbit
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
    influence:       2.0,
    amplitude:       p.behavior.bobAmplitude ?? 4,
    omegaX:          TWO_PI / periodX,
    omegaY:          TWO_PI / periodY,
    phaseX,
    phaseY,
    hoverProgress:   0,
  }
}

// Returns a stable ref whose .current is an array of live creature objects.
// Positions and velocities are updated in place every animation frame so that
// AsciiField can read them without triggering React re-renders.
export function useCreatures(field) {
  const creaturesRef = useRef([])

  useEffect(() => {
    if (!field) return

    creaturesRef.current = projects.map((p, i) => buildCreature(p, i, field))

    const t0 = performance.now()
    let rafId

    function tick() {
      rafId = requestAnimationFrame(tick)
      const t = (performance.now() - t0) / 1000

      for (const c of creaturesRef.current) {
        const sx = c.amplitude * Math.sin(c.omegaX * t + c.phaseX)
        const cy_val = c.amplitude * Math.cos(c.omegaY * t + c.phaseY)
        c.x  = c.homeX + sx
        c.y  = c.homeY + cy_val
        c.vx = c.amplitude * c.omegaX *  Math.cos(c.omegaX * t + c.phaseX)
        c.vy = c.amplitude * c.omegaY * -Math.sin(c.omegaY * t + c.phaseY)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [field])

  return creaturesRef
}
