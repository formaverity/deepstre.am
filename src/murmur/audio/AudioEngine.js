import * as Tone from 'tone'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

class AudioEngine {
  constructor() {
    this.player      = null
    this.grainPlayer = null
    this.analyzer    = null
    this.buffer      = null
    this.isReady     = false
    this.duration    = 0
    this.name        = ''

    this._pauseOffset   = 0
    this._startedAt     = 0
    this._lastKnownTime = 0
    this._smooth        = { bass: 0, lowMid: 0, highMid: 0, treble: 0 }
  }

  async start() {
    await Tone.start()
  }

  // ── Buffer loading ──────────────────────────────────────────────────────

  async loadBuffer(input) {
    if (this.isPlaying) this.player.stop()
    this._pauseOffset   = 0
    this._lastKnownTime = 0

    let arrayBuffer
    let name = 'audio'

    if (input instanceof File) {
      name = input.name
      arrayBuffer = await input.arrayBuffer()
    } else if (input instanceof Blob) {
      arrayBuffer = await input.arrayBuffer()
    } else if (input instanceof ArrayBuffer) {
      arrayBuffer = input
    } else {
      throw new Error('loadBuffer: unsupported input type')
    }

    const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(arrayBuffer)
    const toneBuffer  = new Tone.ToneAudioBuffer(audioBuffer)

    this.buffer   = toneBuffer
    this.duration = toneBuffer.duration
    this.name     = name

    // Shared analyser → destination (kept alive across chain swaps)
    if (!this.analyzer) {
      this.analyzer = new Tone.Analyser({ type: 'fft', size: 1024 })
      this.analyzer.toDestination()
    }
    if (!this.player) {
      this.player = new Tone.Player()
      this.player.connect(this.analyzer)
    }
    this.player.buffer = toneBuffer

    // Hot-swap grain player buffer if sculpt is active
    if (this.grainPlayer) {
      const wasPlaying = this.grainPlayer.state === 'started'
      if (wasPlaying) this.grainPlayer.stop()
      this.grainPlayer.buffer = toneBuffer
      if (wasPlaying) this.grainPlayer.start()
    }

    this.isReady = true
    useMurmurStore.getState().setAudioLoaded({ name, duration: this.duration })
  }

  // ── Signal chain management ─────────────────────────────────────────────

  attachReactiveChain() {
    if (!this.player || !this.analyzer) return
    try { this.player.connect(this.analyzer) } catch (_) {}
  }

  detachReactiveChain() {
    if (!this.player) return
    if (this.isPlaying) {
      this._lastKnownTime = this.currentTime
      this.player.stop()
    }
    try { this.player.disconnect() } catch (_) {}
  }

  attachSculptChain() {
    if (!this.buffer || !this.analyzer) return

    if (!this.grainPlayer) {
      this.grainPlayer = new Tone.GrainPlayer(this.buffer)
    } else {
      this.grainPlayer.buffer = this.buffer
    }
    this.grainPlayer.grainSize    = 0.05
    this.grainPlayer.overlap      = 0.1
    this.grainPlayer.loop         = true
    this.grainPlayer.playbackRate = 1.0
    this.grainPlayer.detune       = 0

    try { this.grainPlayer.connect(this.analyzer) } catch (_) {}
    this.grainPlayer.start()
  }

  detachSculptChain() {
    if (!this.grainPlayer) return
    try { this.grainPlayer.stop() }        catch (_) {}
    try { this.grainPlayer.disconnect() } catch (_) {}
  }

  // ── Grain parameter control ─────────────────────────────────────────────

  setGrainParams({ position, grainSize, overlap, playbackRate, detune }) {
    const gp = this.grainPlayer
    if (!gp || !this.duration) return

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

    if (grainSize    !== undefined) gp.grainSize    = clamp(grainSize,    0.01,   0.4)
    if (overlap      !== undefined) gp.overlap      = clamp(overlap,      0.05,   0.9)
    if (playbackRate !== undefined) gp.playbackRate = clamp(playbackRate, 0.25,   2.0)
    if (detune       !== undefined) gp.detune       = clamp(detune,      -1200, 1200)

    if (position !== undefined) {
      const gs      = gp.grainSize ?? 0.05
      const pos     = clamp(position, 0, 0.999) * this.duration
      const winSize = clamp(gs * 4, 0.05, Math.max(0.05, this.duration * 0.1))
      gp.loopStart  = pos
      gp.loopEnd    = Math.min(this.duration, pos + winSize)
    }
  }

  // ── Volume fades for clean chain swaps ──────────────────────────────────

  fadeOut(duration = 0.15) {
    Tone.getDestination().volume.rampTo(-60, duration)
  }

  fadeIn(duration = 0.15) {
    Tone.getDestination().volume.rampTo(0, duration)
  }

  // ── Reactive playback ───────────────────────────────────────────────────

  play() {
    if (!this.isReady || !this.player || this.isPlaying) return
    const offset = this._lastKnownTime >= this.duration ? 0 : this._lastKnownTime
    this._pauseOffset   = offset
    this._lastKnownTime = offset
    const t = Tone.now()
    this.player.start(t, offset)
    this._startedAt = t
  }

  pause() {
    if (!this.isPlaying) return
    this._pauseOffset   = this.currentTime
    this._lastKnownTime = this._pauseOffset
    this.player.stop()
  }

  stop() {
    if (this.isPlaying) this.player.stop()
    this._pauseOffset   = 0
    this._lastKnownTime = 0
  }

  seek(t) {
    const newT = Math.max(0, Math.min(t, this.duration))
    this._pauseOffset   = newT
    this._lastKnownTime = newT
    if (this.isPlaying) {
      this.player.seek(newT)
      this._startedAt = Tone.now()
    }
  }

  get isPlaying() {
    return this.player?.state === 'started'
  }

  get isAnyAudioActive() {
    return this.player?.state === 'started' || this.grainPlayer?.state === 'started'
  }

  get currentTime() {
    if (this.isPlaying) {
      const elapsed = Tone.now() - this._startedAt
      this._lastKnownTime = Math.min(this._pauseOffset + elapsed, this.duration)
    }
    return this._lastKnownTime
  }

  // ── FFT analysis (shared across both modes) ─────────────────────────────

  getFFT() {
    if (!this.analyzer || !this.isReady) {
      return { bass: 0, lowMid: 0, highMid: 0, treble: 0, raw: null }
    }

    const raw = this.analyzer.getValue()

    let b = 0, lm = 0, hm = 0, tr = 0
    for (let i = 0;   i <= 7;   i++) b  += raw[i]
    for (let i = 8;   i <= 31;  i++) lm += raw[i]
    for (let i = 32;  i <= 127; i++) hm += raw[i]
    for (let i = 128; i <= 511; i++) tr += raw[i]
    b /= 8; lm /= 24; hm /= 96; tr /= 384

    const lin = (db) => Math.max(0, Math.min(1, (db + 80) / 70))
    const bass = lin(b), lowMid = lin(lm), highMid = lin(hm), treble = lin(tr)

    const s  = this._smooth
    const sm = (prev, cur) => cur > prev
      ? prev + (cur - prev) * 0.55
      : prev + (cur - prev) * 0.08

    s.bass    = sm(s.bass,    bass)
    s.lowMid  = sm(s.lowMid,  lowMid)
    s.highMid = sm(s.highMid, highMid)
    s.treble  = sm(s.treble,  treble)

    return { bass: s.bass, lowMid: s.lowMid, highMid: s.highMid, treble: s.treble, raw }
  }
}

export const audioEngine = new AudioEngine()
