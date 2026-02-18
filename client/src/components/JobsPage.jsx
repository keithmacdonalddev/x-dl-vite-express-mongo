import { useEffect, useMemo, useState } from 'react'
import { listTelemetry, openTelemetryStream } from '../api/jobsApi'
import { useJobsPolling } from '../hooks/useJobsPolling'
import { buildContacts, toAssetHref } from '../lib/contacts'
import { IntakeForm } from '../features/intake/IntakeForm'
import { JobsList } from '../features/dashboard/JobsList'
import { useSelection } from '../features/dashboard/useSelection'
import { useJobActions } from '../features/dashboard/useJobActions'
import { ActivityPanel } from '../features/activity/ActivityPanel'
import { ConfirmModal } from './ConfirmModal'

const MAX_TELEMETRY_EVENTS = 800

/**
 * HTTP request events (generated every 3s by polling) drown out actual job
 * telemetry in the ring buffer.  Filter them so the Activity Panel only shows
 * meaningful job-lifecycle events.
 */
const NOISE_EVENT_PREFIX = 'http.request.'

function isNoiseTelemetry(entry) {
  return typeof entry.event === 'string' && entry.event.startsWith(NOISE_EVENT_PREFIX)
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

  const actions = useJobActions({ refresh })
  const contacts = useMemo(() => buildContacts(jobs), [jobs])
  const visibleJobs = useMemo(() => jobs.filter((job) => !actions.hiddenJobIds[job._id]), [jobs, actions.hiddenJobIds])
  const allJobIds = useMemo(() => visibleJobs.map((job) => job._id), [visibleJobs])
  const selection = useSelection(allJobIds)

  useEffect(() => {
    actions.cleanupHiddenIds(jobs.map((j) => j._id))
  }, [jobs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Telemetry stream
  useEffect(() => {
    let cancelled = false
    let stream = null

    async function loadHistory() {
      try {
        const payload = await listTelemetry({ limit: 2000 })
        if (cancelled) return
        const raw = Array.isArray(payload.events) ? payload.events : []
        const events = raw.filter((e) => !isNoiseTelemetry(e))
        setTelemetryEvents(events.slice(Math.max(events.length - MAX_TELEMETRY_EVENTS, 0)))
      } catch { /* best-effort */ }
    }

    function attachStream() {
      stream = openTelemetryStream(
        { limit: 2000 },
        {
          onEvent: (entry) => {
            if (cancelled) return
            setTelemetryEvents((current) => upsertTelemetryEvent(current, entry))
          },
          onError: () => {},
        }
      )
    }

    loadHistory()
    attachStream()
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

  const errorMessage = actions.actionError || pollError

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">local creator vault</p>
        <h1>Creator Media Dashboard</h1>
        <p className="subhead">
          Submit X or TikTok URLs, keep account profiles, and choose any captured media quality.
        </p>
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
                  className="contact-chip"
                  onClick={() => {
                    if (typeof onOpenContact === 'function') onOpenContact(contact.slug)
                  }}
                >
                  {contact.latestThumbnail && (
                    <img src={toAssetHref(contact.latestThumbnail)} alt={contact.handle || contact.slug} />
                  )}
                  <span>{contact.displayName || contact.handle || `@${contact.slug}`}</span>
                  <small>{contact.completedJobs} downloads | view profile</small>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="workspace">
          <IntakeForm onCreated={refresh} isBusy={actions.isMutating} />

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
            manualSubmittingJobId={actions.manualSubmittingJobId}
            manualMediaByJobId={actions.manualMediaByJobId}
            onToggleSelect={selection.toggleSelection}
            onToggleAllSelection={selection.toggleAllSelection}
            onStartEdit={actions.startEdit}
            onCancelEdit={actions.cancelEdit}
            onSubmitEdit={actions.submitEdit}
            onUpdateEditDraft={actions.updateEditDraft}
            onOpenSingleDelete={openSingleDelete}
            onOpenBulkDelete={openBulkDelete}
            onManualRetry={actions.handleManualRetry}
            onCandidateRetry={actions.handleCandidateRetry}
            onSetManualMediaUrl={actions.setManualMediaUrl}
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
