import * as Tone from 'tone'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'
import { detectBPM } from './detectBPM.js'

class AudioEngine {
  constructor() {
    this.player         = null
    this.grainPlayer    = null
    this.analyzer       = null
    this.stereoBalance  = null   // Tone.Panner — left/right balance
    this.binauralPanner = null   // native PannerNode (HRTF)
    this.buffer         = null
    this.isReady        = false
    this.duration       = 0
    this.name           = ''

    this._pauseOffset   = 0
    this._startedAt     = 0
    this._lastKnownTime = 0
    this._smooth        = { bass: 0, lowMid: 0, highMid: 0, treble: 0 }
    this._loop          = true
    this.detectedBPM    = null

    this._chordSets = new Map()  // key → { voices, filter, masterGain }
  }

  get loop() { return this._loop }
  setLoop(v) {
    this._loop = v
    if (this.player) this.player.loop = v
  }

  async start() {
    await Tone.start()
  }

  // ── Buffer loading ──────────────────────────────────────────────────────

  async loadBuffer(input) {
    const store = useMurmurStore.getState()

    this.stopAllChords()

    // Dispose old sources — fresh instances prevent stale-connection bugs
    if (this.player) {
      try { if (this.isPlaying) this.player.stop() } catch (_) {}
      try { this.player.disconnect() }               catch (_) {}
      try { this.player.dispose() }                  catch (_) {}
      this.player = null
    }
    if (this.grainPlayer) {
      try { this.grainPlayer.stop() }       catch (_) {}
      try { this.grainPlayer.disconnect() } catch (_) {}
      try { this.grainPlayer.dispose() }    catch (_) {}
      this.grainPlayer = null
    }
    if (this.buffer) {
      try { this.buffer.dispose() } catch (_) {}
      this.buffer = null
    }

    this._pauseOffset   = 0
    this._startedAt     = 0
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

    const rawCtx = Tone.getContext().rawContext
    // .slice(0) prevents ArrayBuffer detachment on some browsers
    const audioBuffer = await rawCtx.decodeAudioData(arrayBuffer.slice(0))
    const toneBuffer  = new Tone.ToneAudioBuffer(audioBuffer)

    this.buffer   = toneBuffer
    this.duration = toneBuffer.duration
    this.name     = name

    // Persistent mid-chain: stereoBalance → binauralPanner → analyzer → destination
    // Built once and reused across file loads and mode switches.
    if (!this.analyzer) {
      this.analyzer = new Tone.Analyser({ type: 'fft', size: 1024 })
      this.analyzer.toDestination()
    }
    if (!this.binauralPanner) {
      this.binauralPanner = rawCtx.createPanner()
      this.binauralPanner.panningModel    = 'HRTF'
      this.binauralPanner.distanceModel   = 'inverse'
      this.binauralPanner.refDistance     = 1
      this.binauralPanner.maxDistance     = 10000
      this.binauralPanner.rolloffFactor   = 1
      this.binauralPanner.coneInnerAngle  = 360
      this.binauralPanner.coneOuterAngle  = 0
      this.binauralPanner.coneOuterGain   = 0
      this._setPannerPosition(0, 0, -2)
      const listener = rawCtx.listener
      if (listener.positionX) {
        listener.positionX.value = 0; listener.positionY.value = 0; listener.positionZ.value = 0
        listener.forwardX.value  = 0; listener.forwardY.value  = 0; listener.forwardZ.value  = -1
        listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0
      } else {
        listener.setPosition(0, 0, 0)
        listener.setOrientation(0, 0, -1, 0, 1, 0)
      }
      this.binauralPanner.connect(this.analyzer.input)
    }
    if (!this.stereoBalance) {
      this.stereoBalance = new Tone.Panner(0)
      this.stereoBalance.connect(this.binauralPanner)
    }

    // Always create a fresh player; attach to chain based on current mode
    this.player      = new Tone.Player(toneBuffer)
    this.player.loop = this._loop

    if (store.mode === 'interactive') {
      this.attachInteractiveChain()   // creates + connects fresh grainPlayer
      // player left disconnected; attachPlaybackChain() wires it on mode switch
    } else {
      this.player.connect(this.stereoBalance)
    }

    this.isReady     = true
    this.detectedBPM = null
    store.setAudioLoaded({ name, duration: this.duration })

    const bufForBPM = audioBuffer
    setTimeout(() => {
      try { this.detectedBPM = detectBPM(bufForBPM) } catch (_) {}
    }, 0)
  }

  // ── Signal chain management ─────────────────────────────────────────────

  // ── Internal helper ─────────────────────────────────────────────────────

  _setPannerPosition(x, y, z) {
    const p = this.binauralPanner
    if (!p) return
    if (p.positionX) {
      p.positionX.value = x
      p.positionY.value = y
      p.positionZ.value = z
    } else {
      p.setPosition(x, y, z)
    }
  }

  // ── Signal chain management ─────────────────────────────────────────────

  attachPlaybackChain() {
    if (!this.player || !this.stereoBalance) return
    try { this.player.connect(this.stereoBalance) } catch (_) {}
  }

  detachPlaybackChain() {
    if (!this.player) return
    if (this.isPlaying) {
      this._lastKnownTime = this.currentTime
      this.player.stop()
    }
    try { this.player.disconnect() } catch (_) {}
  }

  attachInteractiveChain() {
    if (!this.buffer || !this.spatialPanner) return

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

    // Position grain player near where linear player left off
    if (this.duration > 0) {
      const pos = Math.max(0, Math.min(0.999, this._lastKnownTime / this.duration))
      this.setGrainParams({ position: pos })
    }

    try { this.grainPlayer.connect(this.stereoBalance) } catch (_) {}
    this.grainPlayer.start()
  }

  detachInteractiveChain() {
    if (!this.grainPlayer) return
    // Record approximate buffer position so playback can resume nearby
    if (this.grainPlayer.loopStart != null && this.duration > 0) {
      this._lastKnownTime = this.grainPlayer.loopStart
    }
    try { this.grainPlayer.stop() }        catch (_) {}
    try { this.grainPlayer.disconnect() } catch (_) {}
  }

  // ── Spatial panning ─────────────────────────────────────────────────────

  // Called every frame from SpatialPanner.jsx (inside Canvas)
  updateSpatialPan({ stereo, x, y, z, enabled }) {
    if (this.stereoBalance) {
      const target = enabled ? stereo : 0
      this.stereoBalance.pan.rampTo(Math.max(-1, Math.min(1, target)), 0.05)
    }
    if (this.binauralPanner) {
      if (enabled) {
        this._setPannerPosition(x, y, z)
      } else {
        this._setPannerPosition(0, 0, -2)
      }
    }
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

  // ── Chord layer (keyed — each pointer/touch is its own set) ────────────

  startChord(key, { rootSemitone, intervals, voices, position }) {
    this.stopChord(key)
    if (!this.buffer || !this.analyzer) return

    const masterGain = new Tone.Gain(Tone.dbToGain(-12))
    const filter     = new Tone.Filter({ frequency: 12000, type: 'lowpass', Q: 1 })
    masterGain.connect(filter)
    filter.connect(this.analyzer)

    const baseSemitones = rootSemitone - 60
    const voiceCount    = Math.min(voices, intervals.length)
    const voiceList     = []

    for (let i = 0; i < voiceCount; i++) {
      const totalSt = baseSemitones + intervals[i]
      const rate    = Math.max(0.125, Math.min(8.0, Math.pow(2, totalSt / 12)))

      const gp = new Tone.GrainPlayer(this.buffer)
      gp.loop         = true
      gp.grainSize    = 0.05 + i * 0.04
      gp.overlap      = Math.max(0.15, 0.65 - i * 0.12)
      gp.playbackRate = rate

      if (position !== undefined && this.duration) {
        const spread   = (voiceCount > 1 ? i / (voiceCount - 1) : 0) * 0.35
        const voicePos = (position + spread) % 1.0
        const pos      = Math.max(0, Math.min(0.999, voicePos)) * this.duration
        const winSize  = Math.min(0.4, Math.max(0.06, this.duration * (0.06 + i * 0.02)))
        gp.loopStart   = pos
        gp.loopEnd     = Math.min(this.duration, pos + winSize)
      }

      const voiceGain = new Tone.Gain(1.0)
      gp.connect(voiceGain)
      voiceGain.connect(masterGain)
      gp.start()
      voiceList.push({ grainPlayer: gp, gain: voiceGain })
    }

    this._chordSets.set(key, { voices: voiceList, filter, masterGain })
  }

  updateChord(key, { filterCutoff, filterQ }) {
    const s = this._chordSets.get(key)
    if (!s?.filter) return
    if (filterCutoff !== undefined) {
      s.filter.frequency.rampTo(Math.max(20, Math.min(20000, filterCutoff)), 0.05)
    }
    if (filterQ !== undefined) {
      s.filter.Q.rampTo(Math.max(0.1, Math.min(20, filterQ)), 0.05)
    }
  }

  stopChord(key) {
    const s = this._chordSets.get(key)
    if (!s) return
    this._chordSets.delete(key)

    const fadeDur = 0.4
    s.voices.forEach(v => {
      try { v.gain.gain.rampTo(0, fadeDur) } catch (_) {}
    })
    const { filter, masterGain } = s
    setTimeout(() => {
      s.voices.forEach(v => {
        try { v.grainPlayer.stop() }       catch (_) {}
        try { v.grainPlayer.disconnect() } catch (_) {}
        try { v.gain.disconnect() }        catch (_) {}
      })
      try { masterGain?.disconnect() } catch (_) {}
      try { filter?.disconnect() }     catch (_) {}
    }, fadeDur * 1000 + 50)
  }

  stopAllChords() {
    for (const key of [...this._chordSets.keys()]) this.stopChord(key)
  }

  // ── Stop all active audio (for clean navigation exit) ──────────────────

  stopAll() {
    try { if (this.isPlaying) this.player.stop() } catch (_) {}
    this._pauseOffset   = 0
    this._lastKnownTime = 0

    if (this.grainPlayer) {
      try { this.grainPlayer.stop() }       catch (_) {}
      try { this.grainPlayer.disconnect() } catch (_) {}
    }

    this.stopAllChords()
  }

  // ── Volume fades for clean chain swaps ──────────────────────────────────

  fadeOut(duration = 0.15) {
    Tone.getDestination().volume.rampTo(-60, duration)
  }

  fadeIn(duration = 0.15) {
    Tone.getDestination().volume.rampTo(0, duration)
  }

  // ── Linear playback ─────────────────────────────────────────────────────

  play() {
    if (!this.isReady || !this.player || this.isPlaying) return
    const offset = this._lastKnownTime >= this.duration ? 0 : this._lastKnownTime
    this._pauseOffset   = offset
    this._lastKnownTime = offset
    this.player.loop = this._loop
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
    // Also reposition grain player if active (interactive mode)
    if (this.grainPlayer && this.duration > 0) {
      this.setGrainParams({ position: newT / this.duration })
    }
  }

  // Current playback position in seconds (works in both modes)
  get playbackSecs() {
    if (this.grainPlayer?.state === 'started' && this.duration > 0) {
      return this.grainPlayer.loopStart ?? this._lastKnownTime
    }
    return this.currentTime
  }

  get isPlaying() {
    return this.player?.state === 'started'
  }

  get isAnyAudioActive() {
    return this.player?.state === 'started'
        || this.grainPlayer?.state === 'started'
        || this._chordSets.size > 0
  }

  get currentTime() {
    if (this.isPlaying) {
      const elapsed = Tone.now() - this._startedAt
      const raw = this._pauseOffset + elapsed
      this._lastKnownTime = (this._loop && this.duration > 0)
        ? raw % this.duration
        : Math.min(raw, this.duration)
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
