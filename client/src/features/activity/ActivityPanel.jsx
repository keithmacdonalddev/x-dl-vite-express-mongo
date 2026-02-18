import { useEffect, useMemo, useRef, useState } from 'react'
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { translateEvent } from './eventTranslator'
import './activity.css'

const TERMINAL_EVENTS = new Set([
  'worker.job.completed',
  'worker.job.failed',
])

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

function JobGroup({ group }) {
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef(null)
  const isActive = group.status === 'active'

  useEffect(() => {
    if (isActive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [group.events.length, isActive])

  const label = group.handle ? `@${group.handle}` : group.jobId.slice(0, 8)

  if (!isActive && !expanded) {
    const terminal = group.terminalEntry
    const t = terminal ? translateEvent(terminal) : null
    const summaryIcon = group.status === 'completed' ? '\u2713' : '\u2717'
    const summaryText = t
      ? `${label} \u2014 ${t.text}`
      : `${label} \u2014 ${group.status}`

    return (
      <div className={`activity-job-summary-row ${group.status === 'failed' ? 'is-failed' : ''}`}>
        <button
          type="button"
          className={`activity-job-summary ${group.status === 'failed' ? 'is-failed' : ''}`}
          onClick={() => setExpanded(true)}
          title="Click to expand"
        >
          <span className="activity-icon">{summaryIcon}</span>
          <span>{summaryText}</span>
        </button>
        <CopyJobButton group={group} />
      </div>
    )
  }

  return (
    <div className={`activity-job-group ${isActive ? 'is-active' : ''}`}>
      <div className="activity-job-label">
        {isActive && <span className="activity-pulse" />}
        <strong>{label}</strong>
        <CopyJobButton group={group} />
        {!isActive && (
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

  const activeGroups = useMemo(() => groups.filter((g) => g.status === 'active'), [groups])
  const finishedGroups = useMemo(
    () => groups.filter((g) => g.status !== 'active').reverse(),
    [groups]
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
                          <JobGroup key={group.jobId} group={group} />
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
                          <JobGroup key={group.jobId} group={group} />
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
