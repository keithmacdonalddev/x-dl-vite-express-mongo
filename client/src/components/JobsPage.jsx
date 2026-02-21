import { useEffect, useMemo, useState } from 'react'
import { listTelemetry, openTelemetryStream } from '../api/jobsApi'
import { useJobsPolling } from '../hooks/useJobsPolling'
import { buildContacts, compareByPublishedAtDesc, toAssetHref } from '../lib/contacts'
import { IntakeForm } from '../features/intake/IntakeForm'
import { JobsList } from '../features/dashboard/JobsList'
import { useSelection } from '../features/dashboard/useSelection'
import { useJobActions } from '../features/dashboard/useJobActions'
import { ActivityPanel } from '../features/activity/ActivityPanel'
import { ConfirmModal } from './ConfirmModal'
import { getContactChipClassName } from '../lib/contactChipPresentation'

const MAX_TELEMETRY_EVENTS = 800
const INITIAL_TELEMETRY_HISTORY_LIMIT = 300
const INITIAL_TELEMETRY_HISTORY_MAX_AGE_MS = 20 * 60 * 1000
const JOB_ROW_ID_PREFIX = 'job-row-'

/**
 * HTTP request events (generated every 3s by polling) drown out actual job
 * telemetry in the ring buffer.  Filter them so the Activity Panel only shows
 * meaningful job-lifecycle events.
 */
const NOISE_EVENT_PREFIXES = ['http.request.', 'auth.status.']

function isNoiseTelemetry(entry) {
  if (!entry || typeof entry.event !== 'string') return false
  return NOISE_EVENT_PREFIXES.some((prefix) => entry.event.startsWith(prefix))
}

function isRecentTelemetry(entry, nowMs = Date.now()) {
  if (!entry || typeof entry.ts !== 'string') return true
  const tsMs = new Date(entry.ts).getTime()
  if (!Number.isFinite(tsMs)) return true
  return (nowMs - tsMs) <= INITIAL_TELEMETRY_HISTORY_MAX_AGE_MS
}

function upsertTelemetryEvent(list, next) {
  if (!next || typeof next !== 'object') return list
  if (isNoiseTelemetry(next)) return list
  const nextId = Number.isFinite(next.id) ? next.id : null
  if (nextId !== null && list.some((entry) => entry.id === nextId)) return list
  const merged = [...list, next]
  if (merged.length <= MAX_TELEMETRY_EVENTS) return merged
  return merged.slice(merged.length - MAX_TELEMETRY_EVENTS)
}

export function JobsPage({ onOpenContact }) {
  const { jobs, isLoading, error: pollError, refresh } = useJobsPolling({ intervalMs: 3000 })
  const [telemetryEvents, setTelemetryEvents] = useState([])
  const [isActivityOpen, setIsActivityOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, mode: '', jobId: '', count: 0 })
  const [highlightedJobId, setHighlightedJobId] = useState('')
  const [selectMode, setSelectMode] = useState(false)

  const actions = useJobActions({ refresh })
  const contacts = useMemo(() => buildContacts(jobs), [jobs])
  const visibleJobs = useMemo(
    () => jobs.filter((job) => !actions.hiddenJobIds[job._id]).sort(compareByPublishedAtDesc),
    [jobs, actions.hiddenJobIds]
  )
  const allJobIds = useMemo(() => visibleJobs.map((job) => job._id), [visibleJobs])
  const selection = useSelection(allJobIds)

  useEffect(() => {
    actions.cleanupHiddenIds(jobs.map((j) => j._id))
  }, [jobs]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!highlightedJobId) return
    const timer = setTimeout(() => setHighlightedJobId(''), 3500)
    return () => clearTimeout(timer)
  }, [highlightedJobId])

  // Telemetry stream
  useEffect(() => {
    let cancelled = false
    let stream = null

    async function loadHistory() {
      try {
        const payload = await listTelemetry({ limit: INITIAL_TELEMETRY_HISTORY_LIMIT })
        if (cancelled) return
        const raw = Array.isArray(payload.events) ? payload.events : []
        const nowMs = Date.now()
        const events = raw.filter((e) => !isNoiseTelemetry(e) && isRecentTelemetry(e, nowMs))
        setTelemetryEvents(events.slice(Math.max(events.length - MAX_TELEMETRY_EVENTS, 0)))
      } catch { /* best-effort */ }
    }

    function attachStream() {
      stream = openTelemetryStream(
        {},
        {
          onEvent: (entry) => {
            if (cancelled) return
            setTelemetryEvents((current) => upsertTelemetryEvent(current, entry))
          },
          onError: () => {},
        }
      )
    }

    loadHistory().then(() => {
      if (!cancelled) attachStream()
    })
    return () => {
      cancelled = true
      if (stream && typeof stream.close === 'function') stream.close()
    }
  }, [])

  function openSingleDelete(jobId) {
    setConfirmDelete({ isOpen: true, mode: 'single', jobId, count: 1 })
  }

  function openBulkDelete() {
    if (selection.selectedCount === 0) return
    setConfirmDelete({ isOpen: true, mode: 'bulk', jobId: '', count: selection.selectedCount })
  }

  function closeDeleteModal() {
    if (actions.isMutating) return
    setConfirmDelete({ isOpen: false, mode: '', jobId: '', count: 0 })
  }

  async function handleConfirmDelete() {
    if (confirmDelete.mode === 'single' && confirmDelete.jobId) {
      await actions.handleDeleteJob(confirmDelete.jobId)
    } else if (confirmDelete.mode === 'bulk') {
      await actions.handleBulkDelete(selection.selectedIds, selection.clearSelection)
    }
    closeDeleteModal()
  }

  async function handleDuplicateJobJump(duplicateInfo) {
    const jobId = duplicateInfo && typeof duplicateInfo.jobId === 'string' ? duplicateInfo.jobId : ''
    if (!jobId) return

    await refresh()
    setHighlightedJobId(jobId)

    window.setTimeout(() => {
      const row = document.getElementById(`${JOB_ROW_ID_PREFIX}${jobId}`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 80)
  }

  function toggleSelectMode() {
    setSelectMode((v) => {
      if (v) selection.clearSelection()
      return !v
    })
  }

  const errorMessage = actions.actionError || pollError

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">local creator vault</p>
        <h1>Creator Media Dashboard</h1>
        <p className="subhead">
          Submit X or TikTok URLs, keep account profiles, and choose any captured media quality.
        </p>
        <div className="hero-intake-wrap">
          <IntakeForm onCreated={refresh} onDuplicate={handleDuplicateJobJump} isBusy={actions.isMutating} compact />
        </div>
      </header>

      <section className="layout">
        <aside className="contacts-panel card">
          <div className="contacts-header">
            <h2>Contacts</h2>
            <p>{contacts.length} tracked</p>
          </div>
          <ul className="contacts-list">
            {contacts.map((contact) => (
              <li key={contact.slug}>
                <button
                  type="button"
                  className={getContactChipClassName(contact)}
                  onClick={() => {
                    if (typeof onOpenContact === 'function') onOpenContact(contact.slug)
                  }}
                >
                  <img
                    src={toAssetHref(contact.avatarPath)}
                    alt={contact.handle || contact.slug}
                    onError={(e) => {
                      const fallback = toAssetHref(contact.latestThumbnail)
                      if (fallback && e.target.src !== fallback) {
                        e.target.src = fallback
                      } else {
                        e.target.style.display = 'none'
                      }
                    }}
                  />
                  <span className="contact-chip-content">
                    <span className="contact-chip-name">{contact.displayName || contact.handle || `@${contact.slug}`}</span>
                    <small>{contact.completedJobs} downloads | view profile</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="workspace">
          <JobsList
            jobs={visibleJobs}
            isLoading={isLoading}
            error={errorMessage}
            selectedJobIds={selection.selectedJobIds}
            selectedCount={selection.selectedCount}
            allJobIds={allJobIds}
            editingJobId={actions.editingJobId}
            editDraftByJobId={actions.editDraftByJobId}
            isMutating={actions.isMutating}
            onToggleSelect={selection.toggleSelection}
            onToggleAllSelection={selection.toggleAllSelection}
            onStartEdit={actions.startEdit}
            onCancelEdit={actions.cancelEdit}
            onSubmitEdit={actions.submitEdit}
            onUpdateEditDraft={actions.updateEditDraft}
            onOpenSingleDelete={openSingleDelete}
            onOpenBulkDelete={openBulkDelete}
            onRetry={actions.handleRetry}
            onOpenContact={onOpenContact}
            highlightedJobId={highlightedJobId}
            selectMode={selectMode}
            onToggleSelectMode={toggleSelectMode}
          />
        </section>
      </section>

      <ActivityPanel
        telemetryEvents={telemetryEvents}
        isOpen={isActivityOpen}
        onToggle={() => setIsActivityOpen((v) => !v)}
      />

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title={confirmDelete.mode === 'bulk' ? 'Delete selected jobs?' : 'Delete this job?'}
        message={
          confirmDelete.mode === 'bulk'
            ? `Permanently delete ${confirmDelete.count} selected jobs and their local files?`
            : 'Permanently delete this job and its local files?'
        }
        confirmLabel="Delete permanently"
        isBusy={actions.isMutating}
        onCancel={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </main>
  )
}
