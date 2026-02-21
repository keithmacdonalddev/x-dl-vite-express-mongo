import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteContactProfile,
  downloadDiscoveredPost,
  listDiscoveredPosts,
  refreshDiscovery,
  updateContactProfile,
} from '../api/jobsApi'
import { useJobsPolling } from '../hooks/useJobsPolling'
import {
  buildContacts,
  formatTimestamp,
  makeContactSlug,
  toAssetHref,
} from '../lib/contacts'
import { useSelection } from '../features/dashboard/useSelection'
import { useJobActions } from '../features/dashboard/useJobActions'
import { JobEditForm } from '../features/dashboard/JobEditForm'
import { ConfirmModal } from './ConfirmModal'
import { DiscoveredGrid } from './DiscoveredGrid'
import { OverflowMenu } from './OverflowMenu'

function sortNewestFirst(left, right) {
  const l = left.createdAt ? new Date(left.createdAt).getTime() : 0
  const r = right.createdAt ? new Date(right.createdAt).getTime() : 0
  return r - l
}

const DISCOVERY_POLL_INTERVAL_MS = 2500
const DISCOVERY_POLL_MAX_ATTEMPTS = 48

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function ContactProfilePage({ contactSlug, onBack }) {
  const { jobs, isLoading, error, refresh } = useJobsPolling({ intervalMs: 3000 })
  const [editContactName, setEditContactName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, mode: '', jobId: '', count: 0 })
  const [discoveredPosts, setDiscoveredPosts] = useState([])
  const [downloadingPostIds, setDownloadingPostIds] = useState(new Set())
  const [isDiscoveryRefreshing, setIsDiscoveryRefreshing] = useState(false)
  const [discoveryRefreshStatus, setDiscoveryRefreshStatus] = useState({ tone: '', text: '' })
  const [expandedJobId, setExpandedJobId] = useState('')
  const refreshRunRef = useRef(0)

  function toggleExpanded(jobId) {
    setExpandedJobId((prev) => (prev === jobId ? '' : jobId))
  }

  const actions = useJobActions({ refresh })
  const contacts = useMemo(() => buildContacts(jobs), [jobs])
  const normalizedSlug = String(contactSlug || '').toLowerCase()

  const contact = useMemo(
    () => contacts.find((value) => value.slug === normalizedSlug),
    [contacts, normalizedSlug]
  )

  const contactJobs = useMemo(
    () => jobs.filter((job) => makeContactSlug(job) === normalizedSlug).sort(sortNewestFirst),
    [jobs, normalizedSlug]
  )
  const visibleContactJobs = useMemo(
    () => contactJobs.filter((job) => !actions.hiddenJobIds[job._id]),
    [contactJobs, actions.hiddenJobIds]
  )

  const allJobIds = useMemo(() => visibleContactJobs.map((j) => j._id), [visibleContactJobs])
  const selection = useSelection(allJobIds)

  useEffect(() => {
    actions.cleanupHiddenIds(contactJobs.map((j) => j._id))
  }, [contactJobs]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDiscoveredPosts = useCallback(async ({ silent = true } = {}) => {
    if (!normalizedSlug) return []
    try {
      const data = await listDiscoveredPosts(normalizedSlug)
      const posts = Array.isArray(data.posts) ? data.posts : []
      setDiscoveredPosts(posts)
      return posts
    } catch (err) {
      if (!silent) throw err
      return []
    }
  }, [normalizedSlug])

  useEffect(() => {
    fetchDiscoveredPosts()
  }, [fetchDiscoveredPosts])

  useEffect(() => {
    refreshRunRef.current += 1
    setIsDiscoveryRefreshing(false)
    setDiscoveryRefreshStatus({ tone: '', text: '' })
  }, [normalizedSlug])

  async function handleDownloadDiscovered(discoveredPostId) {
    setDownloadingPostIds(prev => new Set(prev).add(discoveredPostId))
    try {
      await downloadDiscoveredPost(discoveredPostId)
      // alreadyExists is also a success — the job exists
      await refresh()
      await fetchDiscoveredPosts()
    } catch (err) {
      actions.setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setDownloadingPostIds(prev => {
        const next = new Set(prev)
        next.delete(discoveredPostId)
        return next
      })
    }
  }

  async function handleRefreshDiscovery() {
    if (!normalizedSlug || isDiscoveryRefreshing) return

    const runId = refreshRunRef.current + 1
    refreshRunRef.current = runId
    const isCurrentRun = () => refreshRunRef.current === runId
    const initialCount = discoveredPosts.length

    setIsDiscoveryRefreshing(true)
    setDiscoveryRefreshStatus({ tone: 'info', text: 'Discovery started. Scraping profile...' })

    try {
      await refreshDiscovery(normalizedSlug)

      for (let attempt = 1; attempt <= DISCOVERY_POLL_MAX_ATTEMPTS; attempt += 1) {
        if (!isCurrentRun()) return
        setDiscoveryRefreshStatus({
          tone: 'info',
          text: `Discovery in progress... check ${attempt}/${DISCOVERY_POLL_MAX_ATTEMPTS}`,
        })

        await delay(DISCOVERY_POLL_INTERVAL_MS)
        if (!isCurrentRun()) return

        const posts = await fetchDiscoveredPosts({ silent: false })
        if (!isCurrentRun()) return

        const nextCount = Array.isArray(posts) ? posts.length : 0
        if (nextCount > initialCount) {
          const added = nextCount - initialCount
          setDiscoveryRefreshStatus({
            tone: 'success',
            text: `Discovery complete. Found ${added} new video${added === 1 ? '' : 's'}.`,
          })
          return
        }
      }

      setDiscoveryRefreshStatus({
        tone: 'info',
        text: 'Discovery is still running or no new videos found yet. Check back shortly.',
      })
    } catch (err) {
      if (!isCurrentRun()) return
      const message = err instanceof Error ? err.message : String(err)
      setDiscoveryRefreshStatus({
        tone: 'error',
        text: `Discovery failed: ${message}`,
      })
    } finally {
      if (isCurrentRun()) {
        setIsDiscoveryRefreshing(false)
      }
    }
  }

  function openSingleDelete(jobId) {
    setConfirmDelete({ isOpen: true, mode: 'single', jobId, count: 1 })
  }

  function openBulkDelete() {
    if (selection.selectedCount === 0) return
    setConfirmDelete({ isOpen: true, mode: 'bulk', jobId: '', count: selection.selectedCount })
  }

  function openContactDelete() {
    setConfirmDelete({ isOpen: true, mode: 'contact', jobId: '', count: visibleContactJobs.length })
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
    } else if (confirmDelete.mode === 'contact') {
      try {
        await deleteContactProfile(normalizedSlug)
        if (typeof onBack === 'function') onBack()
      } catch (err) {
        actions.setActionError(err instanceof Error ? err.message : String(err))
      }
      await refresh()
    }
    closeDeleteModal()
  }

  async function saveContactEdit(event) {
    event.preventDefault()
    const nextName = editContactName.trim()
    if (!nextName) return

    try {
      await updateContactProfile(normalizedSlug, nextName)
      setEditContactName('')
      await refresh()
    } catch (err) {
      actions.setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  function buildMenuItems(job) {
    return [
      { label: 'Edit', onClick: () => actions.startEdit(job) },
      { label: 'Copy URL', onClick: () => navigator.clipboard.writeText(job.tweetUrl || '') },
      { label: 'Retry', onClick: () => actions.handleRetry(job.tweetUrl), hidden: job.status !== 'failed' },
      { label: 'Delete', onClick: () => openSingleDelete(job._id), danger: true, disabled: actions.isMutating },
    ]
  }

  const errorMessage = actions.actionError || error

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">creator profile</p>
        <h1>{contact?.displayName || contact?.handle || `@${contactSlug}`}</h1>
        <p className="subhead">
          Dedicated timeline with every captured post thumbnail, metadata, and media variants.
        </p>
        <button type="button" className="ghost-btn" onClick={onBack}>
          Back to dashboard
        </button>
      </header>

      <section className="layout profile-layout">
        <aside className="card profile-summary">
          <h2>Profile Summary</h2>
          <img
            className="profile-avatar"
            src={toAssetHref(contact?.avatarPath)}
            alt={contact?.displayName || contact?.handle || contact?.slug}
            onError={(e) => {
              const fallback = toAssetHref(contact?.latestThumbnail)
              if (fallback && e.target.src !== fallback) {
                e.target.src = fallback
              } else {
                e.target.style.display = 'none'
              }
            }}
          />
          <p><strong>Handle:</strong> {contact?.handle || 'n/a'}</p>
          <p><strong>Platform:</strong> {contact?.platform || 'unknown'}</p>
          <p><strong>Total jobs:</strong> {contact?.totalJobs || 0}</p>
          <p><strong>Completed:</strong> {contact?.completedJobs || 0}</p>
          <p><strong>First seen:</strong> {formatTimestamp(contact?.firstSeenAt)}</p>
          <p><strong>Latest:</strong> {formatTimestamp(contact?.latestAt)}</p>
          <form className="edit-form" onSubmit={saveContactEdit}>
            <label htmlFor="contact-display-name">Edit display name</label>
            <input
              id="contact-display-name"
              type="text"
              placeholder="Creator display name"
              value={editContactName}
              onChange={(event) => setEditContactName(event.target.value)}
            />
            <button type="submit" disabled={actions.isMutating}>
              {actions.isMutating ? 'Saving...' : 'Save profile'}
            </button>
          </form>
          <button type="button" className="refresh-btn" onClick={refresh}>
            Refresh now
          </button>
          {contact?.platform === 'tiktok' && (
            <div className="discovery-refresh">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleRefreshDiscovery}
                disabled={isDiscoveryRefreshing}
              >
                {isDiscoveryRefreshing ? 'Discovering...' : 'Discover more videos'}
              </button>
              {discoveryRefreshStatus.text && (
                <p className={`discovery-refresh-status is-${discoveryRefreshStatus.tone || 'info'}`}>
                  {discoveryRefreshStatus.text}
                </p>
              )}
            </div>
          )}
          <button type="button" className="danger-btn" onClick={openContactDelete} disabled={actions.isMutating}>
            Delete contact permanently
          </button>
          {errorMessage && <p className="error">{errorMessage}</p>}
        </aside>

        <div className="profile-right">
        <section className="card">
          <div className="jobs-header">
            <h2>Posts</h2>
            <p>{visibleContactJobs.length} entries</p>
          </div>

          <div className="bulk-toolbar">
            <button type="button" className="ghost-btn" onClick={selection.toggleAllSelection} disabled={visibleContactJobs.length === 0}>
              {selection.selectedCount === visibleContactJobs.length && visibleContactJobs.length > 0 ? 'Clear all' : 'Select all'}
            </button>
            {selection.selectedCount > 0 && (
              <button type="button" className="danger-btn" onClick={openBulkDelete} disabled={actions.isMutating}>
                Delete selected ({selection.selectedCount})
              </button>
            )}
          </div>

          {isLoading && <p>Loading profile...</p>}
          {!isLoading && visibleContactJobs.length === 0 && <p>No jobs found for this contact yet.</p>}

          {!isLoading && visibleContactJobs.length > 0 && (
            <ul className="profile-grid">
              {visibleContactJobs.map((job) => {
                const isExpanded = expandedJobId === job._id
                return (
                  <li key={job._id} className={`profile-card${isExpanded ? ' is-expanded' : ''}`}>
                    <div className="profile-card-media" onClick={() => toggleExpanded(job._id)}>
                      {(job.thumbnailPath || (Array.isArray(job.imageUrls) && job.imageUrls[0])) ? (
                        <img
                          className="profile-card-thumb"
                          src={toAssetHref(job.thumbnailPath || job.imageUrls[0])}
                          alt={job.accountDisplayName || job.accountHandle || contactSlug}
                        />
                      ) : (
                        <div className="profile-card-thumb profile-card-placeholder" />
                      )}
                      <span className={`status-dot is-${job.status}`} />
                    </div>
                    <div className="profile-card-content">
                      <div className="row-actions-top">
                        <label className="select-box">
                          <input
                            type="checkbox"
                            checked={Boolean(selection.selectedJobIds[job._id])}
                            onChange={() => selection.toggleSelection(job._id)}
                          />
                          <span>Select</span>
                        </label>
                        <OverflowMenu items={buildMenuItems(job)} />
                      </div>
                      {isExpanded && (
                        <div className="profile-card-details">
                          <p className="profile-card-status-line">
                            <span className={`status-chip is-${job.status}`}>{job.status}</span>
                            <span className="profile-card-date">{formatTimestamp(job.createdAt)}</span>
                          </p>
                          <p className="profile-card-url">
                            <a href={job.tweetUrl} target="_blank" rel="noreferrer">
                              {job.tweetUrl && job.tweetUrl.length > 50 ? job.tweetUrl.slice(0, 50) + '...' : job.tweetUrl}
                            </a>
                          </p>
                          {job.outputPath && (
                            <a href={toAssetHref(job.outputPath)} target="_blank" rel="noreferrer" className="profile-card-file-link">
                              Open downloaded file
                            </a>
                          )}
                          {job.metadata && (job.metadata.title || job.metadata.durationSeconds || (job.metadata.videoWidth && job.metadata.videoHeight)) && (
                            <div className="profile-card-meta">
                              {job.metadata.title && <p className="meta-title">{job.metadata.title}</p>}
                              <p className="meta-specs">
                                {job.metadata.videoWidth && job.metadata.videoHeight && <span>{job.metadata.videoWidth}x{job.metadata.videoHeight}</span>}
                                {job.metadata.durationSeconds && <span>{job.metadata.durationSeconds}s</span>}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {actions.editingJobId === job._id && (
                        <JobEditForm
                          job={job}
                          draft={actions.editDraftByJobId[job._id]}
                          isMutating={actions.isMutating}
                          onUpdateDraft={actions.updateEditDraft}
                          onSubmit={actions.submitEdit}
                          onCancel={actions.cancelEdit}
                          idPrefix="profile-"
                        />
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <DiscoveredGrid
          posts={discoveredPosts}
          downloadingPostIds={downloadingPostIds}
          onDownload={handleDownloadDiscovered}
        />
        </div>
      </section>

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title={
          confirmDelete.mode === 'contact'
            ? 'Delete this contact?'
            : confirmDelete.mode === 'bulk'
              ? 'Delete selected posts?'
              : 'Delete this post?'
        }
        message={
          confirmDelete.mode === 'contact'
            ? `Permanently delete this contact and all ${confirmDelete.count} of its posts?`
            : confirmDelete.mode === 'bulk'
              ? `Permanently delete ${confirmDelete.count} selected posts?`
              : 'Permanently delete this post?'
        }
        confirmLabel="Delete permanently"
        isBusy={actions.isMutating}
        onCancel={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </main>
  )
}
