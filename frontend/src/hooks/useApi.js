import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'

/**
 * GET `path` with `params` and track loading / error state.
 * Pass `path = null` to skip the request.
 */
export default function useApi(path, params) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const paramsKey = JSON.stringify(params ?? {})

  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api
      .get(path, { params: JSON.parse(paramsKey), signal: controller.signal })
      .then((res) => setData(res.data))
      .catch((err) => {
        if (!controller.signal.aborted) setError(err)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [path, paramsKey, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { data, loading, error, reload }
}
