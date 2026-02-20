import { useState, useEffect, useRef, useCallback } from 'react'
import { getAuthStatus, connectPlatformApi, disconnectPlatformApi } from '../api/jobsApi'

const STATUS_POLL_INTERVAL_MS = 30000    // Normal polling: 30s
const CONNECT_POLL_INTERVAL_MS = 5000    // After connect click: 5s
const CONNECT_TIMEOUT_MS = 5 * 60 * 1000 // Stop fast-polling after 5 minutes

export function useAuthStatus() {
  const [authStatus, setAuthStatus] = useState({})
  const [isConnecting, setIsConnecting] = useState('')
  const [authError, setAuthError] = useState('')

  // Refs for interval and timeout to prevent leaks
  const intervalRef = useRef(null)
  const connectTimeoutRef = useRef(null)

  // Stable reference to isConnecting for the callback
  const isConnectingRef = useRef('')
  isConnectingRef.current = isConnecting

  const startPolling = useCallback((intervalMs) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => fetchAuthStatus(), intervalMs)
  }, [])

  const fetchAuthStatus = useCallback(async () => {
    try {
      const data = await getAuthStatus()
      if (data.ok && data.platforms) {
        setAuthStatus(data.platforms)

        // If we were waiting for a connect to complete, check if it succeeded
        const connectingPlatform = isConnectingRef.current
        if (connectingPlatform && data.platforms[connectingPlatform]?.connected) {
          setIsConnecting('')

          // Clear fast-poll timeout
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current)
            connectTimeoutRef.current = null
          }

          // Restore normal polling
          if (intervalRef.current) clearInterval(intervalRef.current)
          intervalRef.current = setInterval(() => fetchAuthStatus(), STATUS_POLL_INTERVAL_MS)
        }
      }
    } catch {
      // Silently fail — auth status is supplementary, not critical
    }
  }, [])

  // Normal polling: check auth status every 30s
  useEffect(() => {
    fetchAuthStatus() // immediate check on mount
    intervalRef.current = setInterval(fetchAuthStatus, STATUS_POLL_INTERVAL_MS)

    return () => {
      // Cleanup clears BOTH interval and timeout
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current)
        connectTimeoutRef.current = null
      }
    }
  }, [fetchAuthStatus])

  async function connectPlatform(platformId) {
    setIsConnecting(platformId)
    setAuthError('')

    try {
      const data = await connectPlatformApi(platformId)
      if (!data.ok) {
        setAuthError(data.error || 'Failed to open login page')
        setIsConnecting('')
        return
      }

      // Clear existing interval before starting fast poll
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }

      // Start faster polling to detect when login completes
      intervalRef.current = setInterval(fetchAuthStatus, CONNECT_POLL_INTERVAL_MS)

      // 5-minute timeout tracked in a separate ref, cleared on unmount
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current)
      }
      connectTimeoutRef.current = setTimeout(() => {
        setIsConnecting('')

        // Restore normal polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
        intervalRef.current = setInterval(fetchAuthStatus, STATUS_POLL_INTERVAL_MS)
        connectTimeoutRef.current = null
      }, CONNECT_TIMEOUT_MS)

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setAuthError(message)
      setIsConnecting('')
    }
  }

  async function disconnectPlatform(platformId) {
    setAuthError('')

    try {
      const data = await disconnectPlatformApi(platformId)
      if (!data.ok) {
        setAuthError(data.error || 'Failed to disconnect')
        return
      }
      // Refresh status immediately after disconnect
      await fetchAuthStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setAuthError(message)
    }
  }

  return {
    authStatus,
    isConnecting,
    authError,
    connectPlatform,
    disconnectPlatform,
  }
}
