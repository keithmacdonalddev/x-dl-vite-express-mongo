import { useEffect, useMemo, useRef, useState } from 'react'
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { translateEvent } from './eventTranslator'
import './activity.css'

const TERMINAL_EVENTS = new Set([
  'worker.job.completed',
  'worker.job.failed',
])

function formatShortTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function groupEventsByJob(events) {
  const groups = new Map()
  const noJobEvents = []

  for (const entry of events) {
    const jobId = entry.jobId
    if (!jobId) {
      noJobEvents.push(entry)
      continue
    }
    if (!groups.has(jobId)) {
      groups.set(jobId, { jobId, events: [], handle: null, status: 'active' })
    }
    const group = groups.get(jobId)
    group.events.push(entry)

    if (entry.accountHandle && !group.handle) {
      group.handle = entry.accountHandle
    }
    if (TERMINAL_EVENTS.has(entry.event)) {
      group.status = entry.event === 'worker.job.completed' ? 'completed' : 'failed'
      group.terminalEntry = entry
    }
  }

  return { groups: Array.from(groups.values()), noJobEvents }
}

function formatJobForClipboard(group) {
  const handle = group.handle ? `@${group.handle}` : 'unknown'
  const lines = [
    `Job: ${group.jobId}`,
    `Handle: ${handle}`,
    `Status: ${group.status}`,
    `Events:`,
  ]

  for (const entry of group.events) {
    const { text } = translateEvent(entry)
    const ts = entry.ts ? new Date(entry.ts).toISOString().replace('T', ' ').replace('Z', '') : '?'
    lines.push(`  [${ts}] ${entry.event} \u2014 ${text}`)
  }

  return lines.join('\n')
}

function CopyJobButton({ group }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(formatJobForClipboard(group))
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: silent fail
    }
  }

  return (
    <button
      type="button"
      className="activity-copy-btn"
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy job log to clipboard'}
      aria-label={copied ? 'Copied to clipboard' : 'Copy job log to clipboard'}
    >
      {copied ? '\u2713' : '\u{1F4CB}'}
    </button>
  )
}

function ArchiveButton({ onClick }) {
  return (
    <button
      type="button"
      className="activity-archive-btn"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title="Move to history"
      aria-label="Move to history"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="12" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 5v6.5a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5V5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.5 8.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function JobGroup({ group, isSticky, onArchive }) {
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef(null)
  const isActive = group.status === 'active'
  const showAsActive = isActive || isSticky

  useEffect(() => {
    if (isActive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [group.events.length, isActive])

  const label = group.handle ? `@${group.handle}` : group.jobId.slice(0, 8)

  if (!showAsActive && !expanded) {
    const terminal = group.terminalEntry
    const t = terminal ? translateEvent(terminal) : null
    const summaryIcon = group.status === 'completed' ? '\u2713' : '\u2717'
    const summaryText = t
      ? `${label} \u2014 ${t.text}`
      : `${label} \u2014 ${group.status}`

    // Use terminal event timestamp (when job finished), fallback to last event
    const finishedTs = terminal?.ts || group.events[group.events.length - 1]?.ts
    const timeLabel = formatShortTimestamp(finishedTs)

    return (
      <div className={`activity-job-summary-row ${group.status === 'failed' ? 'is-failed' : ''}`}>
        <button
          type="button"
          className={`activity-job-summary ${group.status === 'failed' ? 'is-failed' : ''}`}
          onClick={() => setExpanded(true)}
          title="Click to expand"
        >
          <span className="activity-icon">{summaryIcon}</span>
          <span className="activity-summary-content">
            {timeLabel && <span className="activity-summary-ts">{timeLabel}</span>}
            <span>{summaryText}</span>
          </span>
        </button>
        <CopyJobButton group={group} />
      </div>
    )
  }

  const stickyClass = isSticky ? `is-sticky is-sticky-${group.status}` : ''

  return (
    <div className={`activity-job-group ${isActive ? 'is-active' : ''} ${stickyClass}`}>
      <div className="activity-job-label">
        {isActive && <span className="activity-pulse" />}
        {isSticky && (
          <span className={`activity-done-dot ${group.status === 'failed' ? 'is-failed' : ''}`} />
        )}
        <strong>{label}</strong>
        {isSticky && <span className="activity-sticky-status">{group.status === 'completed' ? 'Done' : 'Failed'}</span>}
        <CopyJobButton group={group} />
        {isSticky && <ArchiveButton onClick={onArchive} />}
        {!showAsActive && (
          <button type="button" className="activity-collapse-btn" onClick={() => setExpanded(false)}>
            Collapse
          </button>
        )}
      </div>
      <ul className="activity-event-list" ref={scrollRef}>
        {group.events.map((entry, i) => {
          const { text, icon } = translateEvent(entry)
          return (
            <li key={`${entry.id || i}-${entry.ts}`} className="activity-event-row">
              <span className="activity-icon">{icon}</span>
              <span>{text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ActivityPanel({ telemetryEvents, isOpen, onToggle }) {
  const prefersReducedMotion = useReducedMotion()

  const { groups } = useMemo(() => groupEventsByJob(telemetryEvents), [telemetryEvents])

  // Track which finished jobs should stay "sticky" in the Active tab
  const [stickyJobIds, setStickyJobIds] = useState(() => new Set())
  // Track known active jobIds so we can detect when a NEW one appears
  const knownActiveRef = useRef(new Set())

  // Identify truly active and finished groups from event data
  const trueActiveGroups = useMemo(() => groups.filter((g) => g.status === 'active'), [groups])
  const trueFinishedGroups = useMemo(() => groups.filter((g) => g.status !== 'active'), [groups])

  // When a job transitions to finished, add it to sticky set
  // When a NEW active job appears, flush all sticky jobs to history
  useEffect(() => {
    const currentActiveIds = new Set(trueActiveGroups.map((g) => g.jobId))
    const currentFinishedIds = new Set(trueFinishedGroups.map((g) => g.jobId))

    setStickyJobIds((prev) => {
      const next = new Set(prev)

      // Add newly finished jobs to sticky (they were known active before)
      for (const id of currentFinishedIds) {
        if (knownActiveRef.current.has(id) && !next.has(id)) {
          next.add(id)
        }
      }

      // If a brand new active job appears, flush all sticky jobs
      let hasNewActive = false
      for (const id of currentActiveIds) {
        if (!knownActiveRef.current.has(id)) {
          hasNewActive = true
          break
        }
      }
      if (hasNewActive && next.size > 0) {
        next.clear()
      }

      // Update known active set
      knownActiveRef.current = currentActiveIds

      // Clean out sticky entries for jobs that no longer exist in events
      for (const id of next) {
        if (!currentFinishedIds.has(id)) {
          next.delete(id)
        }
      }

      // Only update state if something changed
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
        return prev
      }
      return next
    })
  }, [trueActiveGroups, trueFinishedGroups])

  const archiveJob = (jobId) => {
    setStickyJobIds((prev) => {
      const next = new Set(prev)
      next.delete(jobId)
      return next
    })
  }

  // Active tab shows: truly active + sticky finished
  const activeGroups = useMemo(() => {
    const sticky = trueFinishedGroups.filter((g) => stickyJobIds.has(g.jobId))
    return [...trueActiveGroups, ...sticky]
  }, [trueActiveGroups, trueFinishedGroups, stickyJobIds])

  // History tab shows: finished jobs NOT in sticky set
  const finishedGroups = useMemo(
    () => trueFinishedGroups.filter((g) => !stickyJobIds.has(g.jobId)).reverse(),
    [trueFinishedGroups, stickyJobIds]
  )

  const activeCount = activeGroups.length
  const finishedCount = finishedGroups.length

  // Default to Active tab if there are active jobs, otherwise History
  const [activeTab, setActiveTab] = useState(() => activeCount > 0 ? 'active' : 'history')

  // Auto-switch to Active when new active jobs appear and we're on History with nothing active before
  useEffect(() => {
    if (activeCount > 0 && finishedCount === 0) {
      setActiveTab('active')
    }
  }, [activeCount, finishedCount])

  const panelVariants = prefersReducedMotion
    ? { hidden: { x: '100%' }, visible: { x: 0 } }
    : {
        hidden: { x: '100%', opacity: 0.8 },
        visible: { x: 0, opacity: 1 },
      }

  return (
    <>
      <button
        type="button"
        className={`activity-toggle ${isOpen ? 'is-open' : ''}`}
        onClick={onToggle}
        title={isOpen ? 'Close activity panel' : 'Open activity panel'}
      >
        <span className="activity-toggle-label">Activity</span>
        {activeCount > 0 && <span className="activity-toggle-badge">{activeCount}</span>}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="activity-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
              onClick={onToggle}
            />
            <motion.aside
              className="activity-panel"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 }
              }
            >
              <div className="activity-panel-header">
                <h2>Activity</h2>
                <button type="button" className="activity-close-btn" onClick={onToggle}>
                  Close
                </button>
              </div>

              <div className="activity-tab-bar" role="tablist">
                <button
                  type="button"
                  role="tab"
                  className={`activity-tab ${activeTab === 'active' ? 'is-active' : ''}`}
                  aria-selected={activeTab === 'active'}
                  onClick={() => setActiveTab('active')}
                >
                  Active
                  {activeCount > 0 && (
                    <span className="activity-tab-badge is-active-badge">{activeCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`activity-tab ${activeTab === 'history' ? 'is-active' : ''}`}
                  aria-selected={activeTab === 'history'}
                  onClick={() => setActiveTab('history')}
                >
                  History
                  {finishedCount > 0 && (
                    <span className="activity-tab-badge is-history-badge">{finishedCount}</span>
                  )}
                </button>
              </div>

              <div className="activity-panel-content" role="tabpanel">
                {activeTab === 'active' && (
                  <>
                    {activeGroups.length > 0 ? (
                      <div className="activity-section activity-section-full">
                        {activeGroups.map((group) => (
                          <JobGroup
                            key={group.jobId}
                            group={group}
                            isSticky={stickyJobIds.has(group.jobId)}
                            onArchive={() => archiveJob(group.jobId)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="activity-empty">No active jobs right now.</p>
                    )}
                  </>
                )}

                {activeTab === 'history' && (
                  <>
                    {finishedGroups.length > 0 ? (
                      <div className="activity-section activity-section-full">
                        {finishedGroups.map((group) => (
                          <JobGroup key={group.jobId} group={group} isSticky={false} onArchive={() => {}} />
                        ))}
                      </div>
                    ) : (
                      <p className="activity-empty">No completed or failed jobs yet.</p>
                    )}
                  </>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
