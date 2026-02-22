import { useState, useEffect, useRef, useCallback } from 'react'
import { openTelemetryStream } from '../api/jobsApi'

const IDLE = { phase: 'idle', statusText: '', progress: null, counters: null, isComplete: false, isError: false }

function translateDiscoverEvent(event, data, prev) {
  switch (event) {
    case 'discovery.scrape.started':
      return { ...prev, phase: 'scanning', statusText: 'Scanning profile...', isComplete: false, isError: false }

    case 'discovery.scrape.scrolled': {
      const step = data.step || data.scrollStep || ''
      return { ...prev, phase: 'scanning', statusText: step ? `Scanning... (scroll ${step})` : 'Scanning...' }
    }

    case 'discovery.scrape.end_of_feed':
      return { ...prev, phase: 'scanning', statusText: 'Reached end of feed' }

    case 'discovery.scrape.completed': {
      const itemCount = data.itemCount || data.count || data.total || 0
      return { ...prev, phase: 'processing', statusText: `Found ${itemCount} posts, processing...` }
    }

    case 'discovery.trigger.started':
      return { ...prev, phase: 'processing', statusText: 'Processing...' }

    case 'discovery.trigger.all_known':
      return { ...prev, phase: 'complete', statusText: 'No new posts found', isComplete: true }

    case 'discovery.trigger.new_items': {
      const newCount = data.newCount || data.count || 0
      return { ...prev, phase: 'downloading', statusText: `${newCount} new posts, downloading thumbnails...` }
    }

    case 'discovery.trigger.completed': {
      const newCount = data.newCount || data.count || 0
      return { ...prev, phase: 'complete', statusText: `Done \u2014 added ${newCount} new posts`, isComplete: true }
    }

    case 'discovery.trigger.failed': {
      const error = data.error || data.message || 'Unknown error'
      return { ...prev, phase: 'error', statusText: `Discovery failed: ${error}`, isComplete: false, isError: true }
    }

    default:
      return prev
  }
}

function translateSyncEvent(event, data, prev) {
  switch (event) {
    case 'discovery.sync.started': {
      const total = data.total || 0
      return {
        ...prev,
        phase: 'syncing',
        statusText: `Syncing... 0/${total}`,
        progress: 0,
        counters: { total, repaired: 0, removed: 0, failed: 0, current: 0 },
        isComplete: false,
        isError: false,
      }
    }

    case 'discovery.sync.post.repaired':
    case 'discovery.sync.post.removed':
    case 'discovery.sync.post.failed': {
      const index = typeof data.index === 'number' ? data.index : (prev.counters?.current || 0)
      const total = data.total || prev.counters?.total || 1
      const current = index + 1
      const counters = { ...(prev.counters || { total, repaired: 0, removed: 0, failed: 0, current: 0 }) }
      counters.current = current
      counters.total = total

      if (event === 'discovery.sync.post.repaired') counters.repaired += 1
      else if (event === 'discovery.sync.post.removed') counters.removed += 1
      else if (event === 'discovery.sync.post.failed') counters.failed += 1

      return {
        ...prev,
        phase: 'syncing',
        statusText: `Syncing... ${current}/${total}`,
        progress: current / total,
        counters,
      }
    }

    case 'discovery.sync.completed': {
      const total = data.total || prev.counters?.total || 0
      const repaired = data.repaired ?? prev.counters?.repaired ?? 0
      const removed = data.removed ?? prev.counters?.removed ?? 0
      const failed = data.failed ?? prev.counters?.failed ?? 0

      const parts = []
      if (repaired > 0) parts.push(`${repaired} repaired`)
      if (removed > 0) parts.push(`${removed} removed`)
      if (failed > 0) parts.push(`${failed} failed`)
      const statusText = parts.length > 0 ? parts.join(', ') : 'Sync complete'

      return {
        ...prev,
        phase: 'complete',
        statusText,
        progress: 1,
        counters: { total, repaired, removed, failed, current: total },
        isComplete: true,
      }
    }

    case 'discovery.repair_thumbnails.failed': {
      const error = data.error || data.message || 'Unknown error'
      return {
        ...prev,
        phase: 'error',
        statusText: `Sync failed: ${error}`,
        progress: null,
        isError: true,
      }
    }

    default:
      return prev
  }
}

function translateEvent(entry, prev, mode) {
  const event = entry.event || entry.name || ''
  const data = entry.meta || entry.data || entry

  if (mode === 'discover') {
    return translateDiscoverEvent(event, data, prev)
  }
  return translateSyncEvent(event, data, prev)
}

export function useDiscoveryProgress(traceId, mode = 'discover') {
  const [state, setState] = useState(IDLE)
  const streamRef = useRef(null)

  useEffect(() => {
    if (!traceId) {
      setState(IDLE)
      return
    }

    setState({ ...IDLE, phase: 'connecting' })

    const stream = openTelemetryStream({ traceId }, {
      onEvent: (entry) => {
        setState(prev => translateEvent(entry, prev, mode))
      },
      onError: () => {
        // EventSource auto-reconnects; only flag permanent failures
      },
    })
    streamRef.current = stream

    return () => {
      if (streamRef.current) {
        streamRef.current.close()
        streamRef.current = null
      }
    }
  }, [traceId, mode])

  const reset = useCallback(() => setState(IDLE), [])

  return { ...state, reset }
}
