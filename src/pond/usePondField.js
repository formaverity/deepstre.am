import { useState, useEffect } from 'react'
import { decodePond } from '@/utils/pondCodec.js'

// Module-level cache — survives re-renders, prevents duplicate fetches.
// A random pond is selected once per page load and held for the session.
let _field   = null
let _loading = false
let _error   = null

async function loadPondsManifest() {
  try {
    const r = await fetch('/ponds-manifest.json')
    if (!r.ok) return ['pond.json']
    const json = await r.json()
    return Array.isArray(json.ponds) && json.ponds.length > 0 ? json.ponds : ['pond.json']
  } catch {
    return ['pond.json']
  }
}

async function loadAndDecode(file) {
  const r = await fetch(`/${file}`)
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
  const json = await r.json()
  return decodePond(json)
}

export function usePondField() {
  const [field,   setField]   = useState(_field)
  const [loading, setLoading] = useState(_field === null && !_error)
  const [error,   setError]   = useState(_error)

  useEffect(() => {
    if (_field !== null || _error || _loading) return
    _loading = true

    async function load() {
      const files = await loadPondsManifest()

      // Fisher-Yates shuffle — uniform random selection across all ponds
      const shuffled = files.slice()
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }

      let lastErr = null
      for (const file of shuffled) {
        try {
          _field   = await loadAndDecode(file)
          _loading = false
          setField(_field)
          setLoading(false)
          return
        } catch (e) {
          lastErr = e
        }
      }

      _error   = lastErr ?? new Error('no ponds could be loaded')
      _loading = false
      setError(_error)
      setLoading(false)
    }

    load()
  }, [])

  return { field, loading, error }
}
