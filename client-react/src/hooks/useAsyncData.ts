import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

export function useAsyncData<T>(
  loader: () => Promise<T>,
  dependencies: DependencyList,
  initialValue: T
) {
  const [data, setData] = useState<T>(initialValue)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const mounted = useRef(true)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const value = await loader()
      if (mounted.current) setData(value)
      return value
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason : new Error('加载失败'))
      return undefined
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, dependencies)

  useEffect(() => {
    mounted.current = true
    void reload()
    return () => {
      mounted.current = false
    }
  }, [reload])

  return { data, setData, loading, error, reload }
}

