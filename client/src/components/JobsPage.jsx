import { useMemo, useState } from 'react'
import { createJob, createManualRetryJob } from '../api/jobsApi'
import { useJobsPolling } from '../hooks/useJobsPolling'
import {
  buildContacts,
  deriveHandleFromUrl,
  formatTimestamp,
  parseQualityLabel,
  toAssetHref,
} from '../lib/contacts'

export function JobsPage({ onOpenContact }) {
  const [postUrl, setPostUrl] = useState('')
  const [manualMediaByJobId, setManualMediaByJobId] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [manualSubmittingJobId, setManualSubmittingJobId] = useState('')
  const [submitError, setSubmitError] = useState('')
  const { jobs, isLoading, error: pollError, refresh } = useJobsPolling({ intervalMs: 3000 })

  const contacts = useMemo(() => buildContacts(jobs), [jobs])

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
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Add job'}
              </button>
            </form>
          </section>

          <section className="card">
            <div className="jobs-header">
              <h2>Jobs Timeline</h2>
              <p>{jobs.length} total</p>
            </div>

            {isLoading && <p>Loading jobs...</p>}
            {!isLoading && jobs.length === 0 && <p>No jobs yet.</p>}
            {!isLoading && jobs.length > 0 && (
              <ul className="jobs-list">
                {jobs.map((job) => (
                  <li key={job._id} className="job-row">
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
                                disabled={manualSubmittingJobId === job._id}
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
                        <button type="submit" disabled={manualSubmittingJobId === job._id}>
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
    </main>
  )
}
