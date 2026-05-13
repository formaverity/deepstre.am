// Lightweight BPM detection from a decoded AudioBuffer.
// Uses onset-strength autocorrelation at 4kHz to stay within ~50ms for 3-min audio.
// Returns the estimated BPM normalised to 70–170, or null if the signal is too clean/short.
export function detectBPM(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate
  if (audioBuffer.numberOfChannels === 0) return null

  const rawData = audioBuffer.getChannelData(0)
  if (rawData.length < sampleRate * 2) return null   // need at least 2 seconds

  // Downsample to ~4000 Hz via peak envelope follower
  const factor = Math.max(1, Math.round(sampleRate / 4000))
  const sr     = Math.round(sampleRate / factor)
  const n      = Math.floor(rawData.length / factor)

  const env = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let peak = 0
    const base = i * factor
    for (let j = 0; j < factor; j++) {
      const v = Math.abs(rawData[base + j])
      if (v > peak) peak = v
    }
    env[i] = peak
  }

  // Smooth envelope (6-sample box)
  const W = 6
  const sm = new Float32Array(n)
  let ws = 0
  for (let i = 0; i < W && i < n; i++) ws += env[i]
  for (let i = 0; i < n; i++) {
    sm[i] = ws / W
    if (i + W < n) ws += env[i + W]
    ws -= env[i]
  }

  // Onset strength: half-wave rectified first-order difference
  const onset = new Float32Array(n)
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, sm[i] - sm[i - 1])

  // Dynamic threshold: mean + 0.7σ
  let mean = 0
  for (let i = 0; i < n; i++) mean += onset[i]
  mean /= n
  let variance = 0
  for (let i = 0; i < n; i++) variance += (onset[i] - mean) ** 2
  const thresh = mean + Math.sqrt(variance / n) * 0.7

  // Peak finding with NMS at max 240 BPM spacing
  const minDist = Math.round(sr * 60 / 240)
  const peaks   = []
  let lastIdx   = -minDist

  for (let i = 1; i < n - 1; i++) {
    if (onset[i] < thresh) continue
    if (onset[i] <= onset[i - 1] || onset[i] < onset[i + 1]) continue
    if (i - lastIdx < minDist) {
      if (peaks.length > 0 && onset[i] > onset[peaks[peaks.length - 1]]) {
        peaks[peaks.length - 1] = i
        lastIdx = i
      }
      continue
    }
    peaks.push(i)
    lastIdx = i
  }

  if (peaks.length < 4) return null

  // Inter-onset interval histogram weighted by immediate and double intervals
  const minIv  = Math.round(sr * 60 / 200)   // ≥ 200 BPM
  const maxIv  = Math.round(sr * 60 / 50)    // ≤ 50 BPM
  const BINS   = 200
  const hist   = new Int32Array(BINS)

  for (let i = 0; i + 1 < peaks.length; i++) {
    const iv1 = peaks[i + 1] - peaks[i]
    if (iv1 >= minIv && iv1 <= maxIv) {
      const bin = Math.round((sr * 60) / iv1) - 50
      if (bin >= 0 && bin < BINS) hist[bin]++
    }
    if (i + 2 < peaks.length) {
      const iv2 = peaks[i + 2] - peaks[i]
      if (iv2 >= minIv && iv2 <= maxIv) {
        const bin = Math.round((sr * 60) / iv2) - 50
        if (bin >= 0 && bin < BINS) hist[bin] += 2
      }
    }
  }

  // Smooth histogram with 3-bin kernel to reduce single-bin spikes
  const histSm = new Float32Array(BINS)
  for (let i = 1; i < BINS - 1; i++) histSm[i] = (hist[i - 1] + hist[i] * 2 + hist[i + 1]) / 4

  let bestBin = 0, bestScore = 0
  for (let i = 0; i < BINS; i++) {
    if (histSm[i] > bestScore) { bestScore = histSm[i]; bestBin = i }
  }
  if (bestScore < 1) return null

  let bpm = bestBin + 50
  while (bpm <  70) bpm *= 2
  while (bpm > 170) bpm /= 2
  return Math.round(bpm)
}
