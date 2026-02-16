import { useCallback, useEffect, useState } from 'react'
import { listJobs } from '../api/jobsApi'

export function useJobsPolling({ intervalMs = 3000 } = {}) {
  const [jobs, setJobs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const payload = await listJobs()
    setJobs(Array.isArray(payload.jobs) ? payload.jobs : [])
  }, [])

  useEffect(() => {
    let cancelled = false
    let intervalId

    async function loadNow() {
      try {
        const payload = await listJobs()
        if (!cancelled) {
          setJobs(Array.isArray(payload.jobs) ? payload.jobs : [])
          setError('')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadNow()
    intervalId = setInterval(() => {
      loadNow()
    }, intervalMs)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [intervalMs])

  return {
    jobs,
    isLoading,
    error,
    refresh,
  }
}
