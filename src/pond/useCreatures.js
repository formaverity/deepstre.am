import { useEffect, useRef } from 'react'
import usePondStore from '@/store/usePondStore.js'
import projects from '@/projects/_manifest.js'
import { BASE_RADIUS, INFLUENCE_MULTIPLIER } from '@/pond/displacement.js'
import { sampleCell } from '@/utils/pondCodec.js'
import { POND_PHYSICS } from '@/pond/pondPhysics.js'

const BASE_CELL_H = 11
const BASE_CELL_W = BASE_CELL_H * 0.6
const TWO_PI      = Math.PI * 2

const BLOB = POND_PHYSICS.blob

function smoothstepFalloff(d) {
  const t = Math.max(0, Math.min(1, (BLOB.falloffFarPx - d) / (BLOB.falloffFarPx - BLOB.falloffNearPx)))
  return t * t * (3 - 2 * t)
}

// Region 1 = open water; blobs clamp to this region.
function isInPond(worldX, worldY, field) {
  const cx = Math.round(worldX / BASE_CELL_W)
  const cy = Math.round(worldY / BASE_CELL_H)
  if (cx < 0 || cx >= field.cols || cy < 0 || cy >= field.rows) return false
  return sampleCell(field, cx, cy).region === 1
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
    influence:       1.2,
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

      for (const c of creaturesRef.current) {
        // Bob animation
        const bobX = c.amplitude * Math.sin(c.omegaX * t + c.phaseX)
        const bobY = c.amplitude * Math.cos(c.omegaY * t + c.phaseY)
        c.vx = c.amplitude * c.omegaX *  Math.cos(c.omegaX * t + c.phaseX)
        c.vy = c.amplitude * c.omegaY * -Math.sin(c.omegaY * t + c.phaseY)

        // Cursor attraction with asymmetric lerp and status modulation
        const status     = c.project.status
        const statusMult = BLOB.statusMult[status]   ?? 1.0
        const attackRate = BLOB.statusAttack[status] ?? BLOB.attackBase

        let targetPX = 0, targetPY = 0
        if (cursorWX !== null) {
          const dx = cursorWX - c.homeX
          const dy = cursorWY - c.homeY
          const d  = Math.sqrt(dx * dx + dy * dy)
          if (d > 0.5 && d < BLOB.falloffFarPx) {
            const fo  = smoothstepFalloff(d)
            const mag = fo * BLOB.maxPullPx * statusMult
            targetPX  = (dx / d) * mag
            targetPY  = (dy / d) * mag
          }
        }

        // Asymmetric lerp: slow attack (trailing toward cursor), faster release
        const targetMag  = Math.sqrt(targetPX * targetPX + targetPY * targetPY)
        const currentMag = Math.sqrt(c.pullX  * c.pullX  + c.pullY  * c.pullY)
        const lerpPerFrame = targetMag > currentMag ? attackRate : BLOB.releaseBase
        const lerpFactor   = 1 - Math.pow(1 - lerpPerFrame, dt * 60)

        c.pullX += (targetPX - c.pullX) * lerpFactor
        c.pullY += (targetPY - c.pullY) * lerpFactor

        // Clamp to pond water: binary-search the largest pull fraction that stays in water
        let px = c.homeX + bobX + c.pullX
        let py = c.homeY + bobY + c.pullY
        if (!isInPond(px, py, field)) {
          if (isInPond(c.homeX + bobX, c.homeY + bobY, field)) {
            let scale = 0, lo = 0, hi = 1
            for (let iter = 0; iter < 6; iter++) {
              const mid = (lo + hi) / 2
              if (isInPond(c.homeX + bobX + c.pullX * mid, c.homeY + bobY + c.pullY * mid, field)) {
                scale = mid; lo = mid
              } else {
                hi = mid
              }
            }
            px = c.homeX + bobX + c.pullX * scale
            py = c.homeY + bobY + c.pullY * scale
          } else {
            px = c.homeX
            py = c.homeY
          }
        }

        c.x = px
        c.y = py
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [field])

  return creaturesRef
}
