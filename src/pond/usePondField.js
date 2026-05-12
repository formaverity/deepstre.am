import { useState, useEffect } from 'react'
import { decodePond } from '@/utils/pondCodec.js'

// Module-level cache — survives re-renders, prevents duplicate fetches
let _cache   = null
let _loading = false

export function usePondField() {
  const [field,   setField]   = useState(_cache)
  const [loading, setLoading] = useState(_cache === null)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (_cache !== null || _loading) return
    _loading = true
    fetch('/pond.json')
      .then(r => {
        if (!r.ok) throw new Error(`pond.json fetch failed: HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        _cache   = decodePond(json)
        _loading = false
        setField(_cache)
        setLoading(false)
      })
      .catch(err => {
        _loading = false
        setError(err)
        setLoading(false)
      })
  }, [])

  return { field, loading, error }
}
