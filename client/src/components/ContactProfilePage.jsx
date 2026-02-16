import { useEffect, useMemo, useState } from 'react'
import {
  bulkDeleteJobs,
  deleteContactProfile,
  deleteJob,
  updateContactProfile,
  updateJob,
} from '../api/jobsApi'
import { useJobsPolling } from '../hooks/useJobsPolling'
import {
  buildContacts,
  formatTimestamp,
  makeContactSlug,
  parseQualityLabel,
  toAssetHref,
} from '../lib/contacts'
import { ConfirmModal } from './ConfirmModal'

function sortNewestFirst(left, right) {
  const l = left.createdAt ? new Date(left.createdAt).getTime() : 0
  const r = right.createdAt ? new Date(right.createdAt).getTime() : 0
  return r - l
}

export function ContactProfilePage({ contactSlug, onBack }) {
  const { jobs, isLoading, error, refresh } = useJobsPolling({ intervalMs: 3000 })
  const [selectedJobIds, setSelectedJobIds] = useState({})
  const [editingJobId, setEditingJobId] = useState('')
  const [editDraftByJobId, setEditDraftByJobId] = useState({})
  const [editContactName, setEditContactName] = useState('')
  const [isMutating, setIsMutating] = useState(false)
  const [actionError, setActionError] = useState('')
  const [hiddenJobIds, setHiddenJobIds] = useState({})
  const [confirmDelete, setConfirmDelete] = useState({
    isOpen: false,
    mode: '',
    jobId: '',
    count: 0,
  })

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
    () => contactJobs.filter((job) => !hiddenJobIds[job._id]),
    [contactJobs, hiddenJobIds]
  )

  const selectedIds = useMemo(
    () => visibleContactJobs.map((job) => job._id).filter((id) => Boolean(selectedJobIds[id])),
    [visibleContactJobs, selectedJobIds]
  )
  const selectedCount = selectedIds.length

  useEffect(() => {
    const validIds = new Set(visibleContactJobs.map((job) => job._id))
    setSelectedJobIds((current) => {
      const next = {}
      for (const key of Object.keys(current)) {
        if (validIds.has(key)) {
          next[key] = current[key]
        }
      }
      return next
    })
  }, [visibleContactJobs])

  useEffect(() => {
    const jobIds = new Set(contactJobs.map((job) => job._id))
    setHiddenJobIds((current) => {
      const next = {}
      for (const key of Object.keys(current)) {
        if (jobIds.has(key)) {
          next[key] = current[key]
        }
      }
      return next
    })
  }, [contactJobs])

  function toggleSelection(jobId) {
    setSelectedJobIds((current) => ({
      ...current,
      [jobId]: !current[jobId],
    }))
  }

  function toggleAllSelection() {
    if (selectedCount === visibleContactJobs.length) {
      setSelectedJobIds({})
      return
    }
    const next = {}
    for (const job of visibleContactJobs) {
      next[job._id] = true
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

  function openContactDelete() {
    setConfirmDelete({
      isOpen: true,
      mode: 'contact',
      jobId: '',
      count: visibleContactJobs.length,
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
    setActionError('')
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
      } else if (confirmDelete.mode === 'contact') {
        await deleteContactProfile(normalizedSlug)
        if (typeof onBack === 'function') {
          onBack()
        }
      }

      await refresh()
      closeDeleteModal()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  async function saveContactEdit(event) {
    event.preventDefault()
    const nextName = editContactName.trim()
    if (!nextName) {
      return
    }

    setIsMutating(true)
    setActionError('')
    try {
      await updateContactProfile(normalizedSlug, nextName)
      setEditContactName('')
      await refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  function startEditJob(job) {
    setEditingJobId(job._id)
    setEditDraftByJobId((current) => ({
      ...current,
      [job._id]: {
        tweetUrl: job.tweetUrl || '',
        accountDisplayName: job.accountDisplayName || '',
      },
    }))
  }

  async function saveJobEdit(event, job) {
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
    setActionError('')
    try {
      await updateJob(job._id, payload)
      setEditingJobId('')
      await refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  const errorMessage = actionError || error

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
          {contact?.latestThumbnail && (
            <img
              className="profile-avatar"
              src={toAssetHref(contact.latestThumbnail)}
              alt={contact.displayName || contact.handle || contact.slug}
            />
          )}
          <p>
            <strong>Handle:</strong> {contact?.handle || 'n/a'}
          </p>
          <p>
            <strong>Platform:</strong> {contact?.platform || 'unknown'}
          </p>
          <p>
            <strong>Total jobs:</strong> {contact?.totalJobs || 0}
          </p>
          <p>
            <strong>Completed:</strong> {contact?.completedJobs || 0}
          </p>
          <p>
            <strong>First seen:</strong> {formatTimestamp(contact?.firstSeenAt)}
          </p>
          <p>
            <strong>Latest:</strong> {formatTimestamp(contact?.latestAt)}
          </p>
          <form className="edit-form" onSubmit={saveContactEdit}>
            <label htmlFor="contact-display-name">Edit display name</label>
            <input
              id="contact-display-name"
              type="text"
              placeholder="Creator display name"
              value={editContactName}
              onChange={(event) => setEditContactName(event.target.value)}
            />
            <button type="submit" disabled={isMutating}>
              {isMutating ? 'Saving...' : 'Save profile'}
            </button>
          </form>
          <button type="button" className="refresh-btn" onClick={refresh}>
            Refresh now
          </button>
          <button type="button" className="danger-btn" onClick={openContactDelete} disabled={isMutating}>
            Delete contact permanently
          </button>
          {errorMessage && <p className="error">{errorMessage}</p>}
        </aside>

        <section className="card">
          <div className="jobs-header">
            <h2>Posts</h2>
            <p>{visibleContactJobs.length} entries</p>
          </div>

          <div className="bulk-toolbar">
            <button type="button" className="ghost-btn" onClick={toggleAllSelection} disabled={visibleContactJobs.length === 0}>
              {selectedCount === visibleContactJobs.length && visibleContactJobs.length > 0 ? 'Clear all' : 'Select all'}
            </button>
            <button type="button" className="danger-btn" onClick={openBulkDelete} disabled={selectedCount === 0 || isMutating}>
              Delete selected ({selectedCount})
            </button>
          </div>

          {isLoading && <p>Loading profile...</p>}
          {!isLoading && visibleContactJobs.length === 0 && <p>No jobs found for this contact yet.</p>}

          {!isLoading && visibleContactJobs.length > 0 && (
            <ul className="profile-grid">
              {visibleContactJobs.map((job) => (
                <li key={job._id} className="profile-card">
                  {(job.thumbnailPath || (Array.isArray(job.imageUrls) && job.imageUrls[0])) && (
                    <img
                      className="profile-card-thumb"
                      src={toAssetHref(job.thumbnailPath || job.imageUrls[0])}
                      alt={job.accountDisplayName || job.accountHandle || contactSlug}
                    />
                  )}
                  <div className="profile-card-content">
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
                        <button type="button" className="ghost-btn small-btn" onClick={() => startEditJob(job)}>
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
                    <p>
                      <strong>Status:</strong> {job.status}
                    </p>
                    <p>
                      <strong>Created:</strong> {formatTimestamp(job.createdAt)}
                    </p>
                    <p>
                      <strong>Source:</strong>{' '}
                      <a href={job.tweetUrl} target="_blank" rel="noreferrer">
                        {job.tweetUrl}
                      </a>
                    </p>
                    {job.outputPath && (
                      <p>
                        <strong>Local file:</strong>{' '}
                        <a href={toAssetHref(job.outputPath)} target="_blank" rel="noreferrer">
                          {job.outputPath}
                        </a>
                      </p>
                    )}
                    {editingJobId === job._id && (
                      <form className="edit-form" onSubmit={(event) => saveJobEdit(event, job)}>
                        <label htmlFor={`profile-edit-url-${job._id}`}>Post URL</label>
                        <input
                          id={`profile-edit-url-${job._id}`}
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
                        <label htmlFor={`profile-edit-display-${job._id}`}>Display name</label>
                        <input
                          id={`profile-edit-display-${job._id}`}
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
                          <button type="button" className="ghost-btn" onClick={() => setEditingJobId('')}>
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
                          <strong>Author:</strong> {job.metadata.author || 'n/a'}
                        </p>
                        <p>
                          <strong>Published:</strong> {job.metadata.publishedAt || 'n/a'}
                        </p>
                        <p>
                          <strong>Duration (sec):</strong> {job.metadata.durationSeconds || 'n/a'}
                        </p>
                        <p>
                          <strong>Resolution:</strong>{' '}
                          {job.metadata.videoWidth && job.metadata.videoHeight
                            ? `${job.metadata.videoWidth}x${job.metadata.videoHeight}`
                            : 'n/a'}
                        </p>
                      </details>
                    )}
                    {Array.isArray(job.candidateUrls) && job.candidateUrls.length > 0 && (
                      <details>
                        <summary>Captured media options ({job.candidateUrls.length})</summary>
                        <ul className="assets-list">
                          {job.candidateUrls.map((candidateUrl, index) => (
                            <li key={candidateUrl}>
                              <p>{parseQualityLabel(candidateUrl, index)}</p>
                              <a href={candidateUrl} target="_blank" rel="noreferrer">
                                {candidateUrl}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
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
        isBusy={isMutating}
        onCancel={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </main>
  )
}
