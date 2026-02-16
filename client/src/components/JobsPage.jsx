import { useEffect, useMemo, useState } from 'react'
import {
  bulkDeleteJobs,
  createJob,
  createManualRetryJob,
  deleteJob,
  updateJob,
} from '../api/jobsApi'
import { useJobsPolling } from '../hooks/useJobsPolling'
import {
  buildContacts,
  deriveHandleFromUrl,
  formatTimestamp,
  parseQualityLabel,
  toAssetHref,
} from '../lib/contacts'
import { ConfirmModal } from './ConfirmModal'

function getSelectedIds(selectionMap, allIds) {
  return allIds.filter((id) => Boolean(selectionMap[id]))
}

export function JobsPage({ onOpenContact }) {
  const [postUrl, setPostUrl] = useState('')
  const [manualMediaByJobId, setManualMediaByJobId] = useState({})
  const [editDraftByJobId, setEditDraftByJobId] = useState({})
  const [selectedJobIds, setSelectedJobIds] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [manualSubmittingJobId, setManualSubmittingJobId] = useState('')
  const [editingJobId, setEditingJobId] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [hiddenJobIds, setHiddenJobIds] = useState({})
  const [confirmDelete, setConfirmDelete] = useState({
    isOpen: false,
    mode: '',
    jobId: '',
    count: 0,
  })
  const { jobs, isLoading, error: pollError, refresh } = useJobsPolling({ intervalMs: 3000 })

  const contacts = useMemo(() => buildContacts(jobs), [jobs])
  const visibleJobs = useMemo(() => jobs.filter((job) => !hiddenJobIds[job._id]), [jobs, hiddenJobIds])
  const allJobIds = useMemo(() => visibleJobs.map((job) => job._id), [visibleJobs])
  const selectedIds = useMemo(() => getSelectedIds(selectedJobIds, allJobIds), [selectedJobIds, allJobIds])
  const selectedCount = selectedIds.length

  useEffect(() => {
    const validIds = new Set(allJobIds)
    setSelectedJobIds((current) => {
      const next = {}
      for (const key of Object.keys(current)) {
        if (validIds.has(key)) {
          next[key] = current[key]
        }
      }
      return next
    })
  }, [allJobIds])

  useEffect(() => {
    const jobIds = new Set(jobs.map((job) => job._id))
    setHiddenJobIds((current) => {
      const next = {}
      for (const key of Object.keys(current)) {
        if (jobIds.has(key)) {
          next[key] = current[key]
        }
      }
      return next
    })
  }, [jobs])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!postUrl.trim()) {
      return
    }

    setIsSubmitting(true)
    setSubmitError('')
    try {
      await createJob(postUrl.trim())
      setPostUrl('')
      await refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleManualRetry(event, jobId) {
    event.preventDefault()
    const mediaUrl = (manualMediaByJobId[jobId] || '').trim()
    if (!mediaUrl) {
      return
    }

    setManualSubmittingJobId(jobId)
    setSubmitError('')
    try {
      await createManualRetryJob(jobId, mediaUrl)
      setManualMediaByJobId((current) => ({
        ...current,
        [jobId]: '',
      }))
      await refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setManualSubmittingJobId('')
    }
  }

  async function handleCandidateRetry(jobId, mediaUrl) {
    if (!mediaUrl) {
      return
    }

    setManualSubmittingJobId(jobId)
    setSubmitError('')
    try {
      await createManualRetryJob(jobId, mediaUrl)
      await refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setManualSubmittingJobId('')
    }
  }

  function toggleSelection(jobId) {
    setSelectedJobIds((current) => ({
      ...current,
      [jobId]: !current[jobId],
    }))
  }

  function toggleAllSelection() {
    if (selectedCount === allJobIds.length) {
      setSelectedJobIds({})
      return
    }

    const next = {}
    for (const jobId of allJobIds) {
      next[jobId] = true
    }
    setSelectedJobIds(next)
  }

  function openSingleDelete(jobId) {
    setConfirmDelete({
      isOpen: true,
      mode: 'single',
      jobId,
      count: 1,
    })
  }

  function openBulkDelete() {
    if (selectedCount === 0) {
      return
    }
    setConfirmDelete({
      isOpen: true,
      mode: 'bulk',
      jobId: '',
      count: selectedCount,
    })
  }

  function closeDeleteModal() {
    if (isMutating) {
      return
    }
    setConfirmDelete({
      isOpen: false,
      mode: '',
      jobId: '',
      count: 0,
    })
  }

  async function handleConfirmDelete() {
    setIsMutating(true)
    setSubmitError('')

    try {
      if (confirmDelete.mode === 'single' && confirmDelete.jobId) {
        await deleteJob(confirmDelete.jobId)
        setHiddenJobIds((current) => ({ ...current, [confirmDelete.jobId]: true }))
      } else if (confirmDelete.mode === 'bulk') {
        await bulkDeleteJobs(selectedIds)
        setHiddenJobIds((current) => {
          const next = { ...current }
          for (const jobId of selectedIds) {
            next[jobId] = true
          }
          return next
        })
        setSelectedJobIds({})
      }

      await refresh()
      closeDeleteModal()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  function startEdit(job) {
    setEditingJobId(job._id)
    setEditDraftByJobId((current) => ({
      ...current,
      [job._id]: {
        tweetUrl: job.tweetUrl || '',
        accountDisplayName: job.accountDisplayName || '',
      },
    }))
  }

  function cancelEdit() {
    setEditingJobId('')
  }

  async function submitEdit(event, job) {
    event.preventDefault()
    const draft = editDraftByJobId[job._id] || {}
    const payload = {}

    if (typeof draft.tweetUrl === 'string' && draft.tweetUrl.trim() && draft.tweetUrl.trim() !== job.tweetUrl) {
      payload.tweetUrl = draft.tweetUrl.trim()
    }
    if (typeof draft.accountDisplayName === 'string' && draft.accountDisplayName.trim() !== (job.accountDisplayName || '')) {
      payload.accountDisplayName = draft.accountDisplayName.trim()
    }

    if (Object.keys(payload).length === 0) {
      setEditingJobId('')
      return
    }

    setIsMutating(true)
    setSubmitError('')
    try {
      await updateJob(job._id, payload)
      setEditingJobId('')
      await refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  const errorMessage = submitError || pollError

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
                    if (typeof onOpenContact === 'function') {
                      onOpenContact(contact.slug)
                    }
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
          <section className="card">
            <h2>Create job</h2>
            <form className="job-form" onSubmit={handleSubmit}>
              <label htmlFor="postUrl">Post URL</label>
              <input
                id="postUrl"
                name="postUrl"
                type="url"
                placeholder="https://x.com/user/status/123... or https://www.tiktok.com/@user/video/123..."
                value={postUrl}
                onChange={(event) => setPostUrl(event.target.value)}
                required
              />
              <button type="submit" disabled={isSubmitting || isMutating}>
                {isSubmitting ? 'Submitting...' : 'Add job'}
              </button>
            </form>
          </section>

          <section className="card">
            <div className="jobs-header">
              <h2>Jobs Timeline</h2>
              <p>{visibleJobs.length} total</p>
            </div>

            <div className="bulk-toolbar">
              <button type="button" className="ghost-btn" onClick={toggleAllSelection} disabled={visibleJobs.length === 0}>
                {selectedCount === allJobIds.length && allJobIds.length > 0 ? 'Clear all' : 'Select all'}
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={openBulkDelete}
                disabled={selectedCount === 0 || isMutating}
              >
                Delete selected ({selectedCount})
              </button>
            </div>

            {isLoading && <p>Loading jobs...</p>}
            {!isLoading && visibleJobs.length === 0 && <p>No jobs yet.</p>}
            {!isLoading && visibleJobs.length > 0 && (
              <ul className="jobs-list">
                {visibleJobs.map((job) => (
                  <li key={job._id} className="job-row">
                    <div className="row-actions-top">
                      <label className="select-box">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedJobIds[job._id])}
                          onChange={() => toggleSelection(job._id)}
                        />
                        <span>Select</span>
                      </label>
                      <div className="row-buttons">
                        <button type="button" className="ghost-btn small-btn" onClick={() => startEdit(job)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="danger-btn small-btn"
                          onClick={() => openSingleDelete(job._id)}
                          disabled={isMutating}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="job-top">
                      <div>
                        <p>
                          <strong>Status:</strong> {job.status}
                        </p>
                        <p>
                          <strong>Account:</strong>{' '}
                          {job.accountDisplayName || job.accountHandle || deriveHandleFromUrl(job.tweetUrl || '')}
                        </p>
                        <p>
                          <strong>URL:</strong> {job.tweetUrl}
                        </p>
                        <p>
                          <strong>Created:</strong> {formatTimestamp(job.createdAt)}
                        </p>
                      </div>
                      {(job.thumbnailPath || (Array.isArray(job.imageUrls) && job.imageUrls[0])) && (
                        <img
                          className="job-thumb"
                          src={toAssetHref(job.thumbnailPath || job.imageUrls[0])}
                          alt={job.accountDisplayName || job.accountHandle || 'thumbnail'}
                        />
                      )}
                    </div>

                    {editingJobId === job._id && (
                      <form className="edit-form" onSubmit={(event) => submitEdit(event, job)}>
                        <label htmlFor={`edit-url-${job._id}`}>Post URL</label>
                        <input
                          id={`edit-url-${job._id}`}
                          type="url"
                          value={editDraftByJobId[job._id]?.tweetUrl || ''}
                          onChange={(event) =>
                            setEditDraftByJobId((current) => ({
                              ...current,
                              [job._id]: {
                                ...(current[job._id] || {}),
                                tweetUrl: event.target.value,
                              },
                            }))
                          }
                          required
                        />
                        <label htmlFor={`edit-display-${job._id}`}>Display name</label>
                        <input
                          id={`edit-display-${job._id}`}
                          type="text"
                          value={editDraftByJobId[job._id]?.accountDisplayName || ''}
                          onChange={(event) =>
                            setEditDraftByJobId((current) => ({
                              ...current,
                              [job._id]: {
                                ...(current[job._id] || {}),
                                accountDisplayName: event.target.value,
                              },
                            }))
                          }
                        />
                        <div className="row-buttons">
                          <button type="submit" disabled={isMutating}>
                            {isMutating ? 'Saving...' : 'Save edit'}
                          </button>
                          <button type="button" className="ghost-btn" onClick={cancelEdit} disabled={isMutating}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {job.metadata && (
                      <details>
                        <summary>Metadata</summary>
                        <p>
                          <strong>Title:</strong> {job.metadata.title || 'n/a'}
                        </p>
                        <p>
                          <strong>Description:</strong> {job.metadata.description || 'n/a'}
                        </p>
                        <p>
                          <strong>Canonical:</strong> {job.metadata.canonicalUrl || 'n/a'}
                        </p>
                      </details>
                    )}

                    {Array.isArray(job.imageUrls) && job.imageUrls.length > 0 && (
                      <details>
                        <summary>Images ({job.imageUrls.length})</summary>
                        <ul className="assets-list">
                          {job.imageUrls.map((imageUrl) => (
                            <li key={imageUrl}>
                              <a href={toAssetHref(imageUrl)} target="_blank" rel="noreferrer">
                                {imageUrl}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {Array.isArray(job.candidateUrls) && job.candidateUrls.length > 0 && (
                      <details>
                        <summary>Media candidates ({job.candidateUrls.length})</summary>
                        <ul className="assets-list">
                          {job.candidateUrls.map((candidateUrl, index) => (
                            <li key={candidateUrl}>
                              <button
                                type="button"
                                disabled={manualSubmittingJobId === job._id || isMutating}
                                onClick={() => handleCandidateRetry(job._id, candidateUrl)}
                              >
                                {manualSubmittingJobId === job._id ? 'Retrying...' : 'Use this media URL'}
                              </button>
                              <p>{parseQualityLabel(candidateUrl, index)}</p>
                              <a href={candidateUrl} target="_blank" rel="noreferrer">
                                {candidateUrl}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {job.status === 'failed' && (
                      <form className="manual-retry-form" onSubmit={(event) => handleManualRetry(event, job._id)}>
                        <label htmlFor={`manualMedia-${job._id}`}>Manual media URL</label>
                        <input
                          id={`manualMedia-${job._id}`}
                          type="url"
                          placeholder="https://video.twimg.com/.../video.mp4"
                          value={manualMediaByJobId[job._id] || ''}
                          onChange={(event) =>
                            setManualMediaByJobId((current) => ({
                              ...current,
                              [job._id]: event.target.value,
                            }))
                          }
                          required
                        />
                        <button type="submit" disabled={manualSubmittingJobId === job._id || isMutating}>
                          {manualSubmittingJobId === job._id ? 'Retrying...' : 'Retry with media URL'}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {errorMessage && <p className="error">{errorMessage}</p>}
          </section>
        </section>
      </section>

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title={confirmDelete.mode === 'bulk' ? 'Delete selected jobs?' : 'Delete this job?'}
        message={
          confirmDelete.mode === 'bulk'
            ? `Permanently delete ${confirmDelete.count} selected jobs and their local files?`
            : 'Permanently delete this job and its local files?'
        }
        confirmLabel="Delete permanently"
        isBusy={isMutating}
        onCancel={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </main>
  )
}
