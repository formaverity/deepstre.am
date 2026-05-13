import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import * as THREE from 'three'
import positionFragmentShader from './shaders/positionFragment.js'
import velocityFragmentShader from './shaders/velocityFragment.js'
import stateFragmentShader    from './shaders/stateFragment.js'
import homeFragmentShader     from './shaders/homeFragment.js'

export class ParticleSystem {
  constructor({ renderer, count, initialPositions }) {
    const side  = Math.ceil(Math.sqrt(count))
    this.side   = side
    this.count  = count
    this.total  = side * side
    this.isValid = false

    const gpuCompute = new GPUComputationRenderer(side, side, renderer)
    this.gpuCompute  = gpuCompute

    // ── Create and populate initial state textures ────────────────────────

    const posTex   = gpuCompute.createTexture()
    const velTex   = gpuCompute.createTexture()
    const homeTex  = gpuCompute.createTexture()
    const stateTex = gpuCompute.createTexture()

    const posData   = posTex.image.data
    const velData   = velTex.image.data
    const homeData  = homeTex.image.data
    const stateData = stateTex.image.data

    for (let i = 0; i < count; i++) {
      const x = initialPositions[i * 3]
      const y = initialPositions[i * 3 + 1]
      const z = initialPositions[i * 3 + 2]

      posData[i * 4]     = x
      posData[i * 4 + 1] = y
      posData[i * 4 + 2] = z
      posData[i * 4 + 3] = 1.0

      homeData[i * 4]     = x
      homeData[i * 4 + 1] = y
      homeData[i * 4 + 2] = z
      homeData[i * 4 + 3] = 1.0

      const gx = Math.min(3, Math.max(0, Math.floor((x + 1.0) * 2.0)))
      const gz = Math.min(3, Math.max(0, Math.floor((z + 1.0) * 2.0)))
      velData[i * 4]     = 0
      velData[i * 4 + 1] = 0
      velData[i * 4 + 2] = 0
      velData[i * 4 + 3] = (gx * 4 + gz) / 15.0

      stateData[i * 4]     = 1.0
      stateData[i * 4 + 1] = 0.0
      stateData[i * 4 + 2] = 0.0
      stateData[i * 4 + 3] = 0.0
    }

    // ── Add GPGPU variables ───────────────────────────────────────────────

    this.posVar   = gpuCompute.addVariable('texturePosition', positionFragmentShader, posTex)
    this.velVar   = gpuCompute.addVariable('textureVelocity', velocityFragmentShader, velTex)
    this.stateVar = gpuCompute.addVariable('textureState',    stateFragmentShader,    stateTex)
    this.homeVar  = gpuCompute.addVariable('textureHome',     homeFragmentShader,     homeTex)

    // ── Variable dependencies ─────────────────────────────────────────────

    gpuCompute.setVariableDependencies(this.posVar,   [this.posVar, this.velVar, this.homeVar, this.stateVar])
    gpuCompute.setVariableDependencies(this.velVar,   [this.velVar, this.posVar, this.homeVar, this.stateVar])
    gpuCompute.setVariableDependencies(this.stateVar, [this.stateVar, this.velVar])
    gpuCompute.setVariableDependencies(this.homeVar,  [this.homeVar])

    // ── Custom uniforms ───────────────────────────────────────────────────

    const pu = this.posVar.material.uniforms
    pu.uTime        = { value: 0 }
    pu.uDt          = { value: 0 }
    pu.uReturnForce = { value: 10.0 }

    const vu = this.velVar.material.uniforms
    vu.uTime             = { value: 0 }
    vu.uDt               = { value: 0 }
    vu.uExplodeStrength  = { value: 0 }
    vu.uExplodeGroupMask = { value: 65535 }
    vu.uSculptMode       = { value: 0 }
    vu.uSculptRes0       = { value: new THREE.Vector4() }
    vu.uSculptRes1       = { value: new THREE.Vector4() }
    vu.uSculptRes2       = { value: new THREE.Vector4() }
    vu.uSculptRes3       = { value: new THREE.Vector4() }
    vu.uSculptImpulse    = { value: 4.0 }

    const su = this.stateVar.material.uniforms
    su.uDt                = { value: 0 }
    su.uDissolveRate      = { value: 0 }
    su.uDissolveGroupMask = { value: 65535 }
    su.uMagnifyTarget     = { value: 0 }
    su.uMagnifyGroupMask  = { value: 65535 }
    su.uChopAdvance       = { value: 0 }
    su.uChopGroupMask     = { value: 0 }
    su.uSculptMode        = { value: 0 }
    su.uSculptRes0        = { value: new THREE.Vector4() }
    su.uSculptRes1        = { value: new THREE.Vector4() }
    su.uSculptRes2        = { value: new THREE.Vector4() }
    su.uSculptRes3        = { value: new THREE.Vector4() }
    su.uSculptMaxMag      = { value: 2.5 }

    // ── Initialize ────────────────────────────────────────────────────────

    const error = gpuCompute.init()
    if (error !== null) {
      console.error('[ParticleSystem] GPUComputationRenderer init failed:', error)
      return
    }
    this.isValid = true
  }

  update({ time, dt, effectParams = {} }) {
    if (!this.isValid || !this.gpuCompute) return

    const {
      returnForce       = 10.0,
      explodeStrength   = 0,
      explodeGroupMask  = 65535,
      dissolveRate      = 0,
      dissolveGroupMask = 65535,
      magnifyTarget     = 0,
      magnifyGroupMask  = 65535,
      chopAdvance       = 0,
      chopGroupMask     = 0,
      sculptMode        = 0,
      sculptResonance   = null,
      sculptImpulse     = 4.0,
      sculptMaxMag      = 2.5,
    } = effectParams

    const pu = this.posVar.material.uniforms
    pu.uTime.value        = time
    pu.uDt.value          = dt
    pu.uReturnForce.value = returnForce

    const vu = this.velVar.material.uniforms
    vu.uTime.value             = time
    vu.uDt.value               = dt
    vu.uExplodeStrength.value  = explodeStrength
    vu.uExplodeGroupMask.value = explodeGroupMask
    vu.uSculptMode.value       = sculptMode
    vu.uSculptImpulse.value    = sculptImpulse

    const su = this.stateVar.material.uniforms
    su.uDt.value               = dt
    su.uDissolveRate.value     = dissolveRate
    su.uDissolveGroupMask.value = dissolveGroupMask
    su.uMagnifyTarget.value    = magnifyTarget
    su.uMagnifyGroupMask.value = magnifyGroupMask
    su.uChopAdvance.value      = chopAdvance
    su.uChopGroupMask.value    = chopGroupMask
    su.uSculptMode.value       = sculptMode
    su.uSculptMaxMag.value     = sculptMaxMag

    if (sculptMode > 0.5 && sculptResonance) {
      const r = sculptResonance
      vu.uSculptRes0.value.set(r[0],  r[1],  r[2],  r[3])
      vu.uSculptRes1.value.set(r[4],  r[5],  r[6],  r[7])
      vu.uSculptRes2.value.set(r[8],  r[9],  r[10], r[11])
      vu.uSculptRes3.value.set(r[12], r[13], r[14], r[15])
      su.uSculptRes0.value.set(r[0],  r[1],  r[2],  r[3])
      su.uSculptRes1.value.set(r[4],  r[5],  r[6],  r[7])
      su.uSculptRes2.value.set(r[8],  r[9],  r[10], r[11])
      su.uSculptRes3.value.set(r[12], r[13], r[14], r[15])
    }

    this.gpuCompute.compute()
  }

  get positionTexture() {
    return this.gpuCompute.getCurrentRenderTarget(this.posVar).texture
  }

  get stateTexture() {
    return this.gpuCompute.getCurrentRenderTarget(this.stateVar).texture
  }

  dispose() {
    if (!this.gpuCompute) return
    for (const v of [this.posVar, this.velVar, this.stateVar, this.homeVar]) {
      try { for (const rt of (v?.renderTargets ?? [])) rt?.dispose() } catch (_) {}
    }
    this.gpuCompute = null
    this.isValid    = false
  }
}
