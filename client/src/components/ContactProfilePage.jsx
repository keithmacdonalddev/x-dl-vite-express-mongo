import { useMemo } from 'react'
import { useJobsPolling } from '../hooks/useJobsPolling'
import {
  buildContacts,
  formatTimestamp,
  makeContactSlug,
  parseQualityLabel,
  toAssetHref,
} from '../lib/contacts'

function sortNewestFirst(left, right) {
  const l = left.createdAt ? new Date(left.createdAt).getTime() : 0
  const r = right.createdAt ? new Date(right.createdAt).getTime() : 0
  return r - l
}

export function ContactProfilePage({ contactSlug, onBack }) {
  const { jobs, isLoading, error, refresh } = useJobsPolling({ intervalMs: 3000 })

  const contacts = useMemo(() => buildContacts(jobs), [jobs])

  const contact = useMemo(
    () => contacts.find((value) => value.slug === String(contactSlug || '').toLowerCase()),
    [contacts, contactSlug]
  )

  const contactJobs = useMemo(
    () => jobs.filter((job) => makeContactSlug(job) === String(contactSlug || '').toLowerCase()).sort(sortNewestFirst),
    [jobs, contactSlug]
  )

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
          <button type="button" className="refresh-btn" onClick={refresh}>
            Refresh now
          </button>
          {error && <p className="error">{error}</p>}
        </aside>

        <section className="card">
          <div className="jobs-header">
            <h2>Posts</h2>
            <p>{contactJobs.length} entries</p>
          </div>

          {isLoading && <p>Loading profile...</p>}
          {!isLoading && contactJobs.length === 0 && <p>No jobs found for this contact yet.</p>}

          {!isLoading && contactJobs.length > 0 && (
            <ul className="profile-grid">
              {contactJobs.map((job) => (
                <li key={job._id} className="profile-card">
                  {(job.thumbnailPath || (Array.isArray(job.imageUrls) && job.imageUrls[0])) && (
                    <img
                      className="profile-card-thumb"
                      src={toAssetHref(job.thumbnailPath || job.imageUrls[0])}
                      alt={job.accountDisplayName || job.accountHandle || contactSlug}
                    />
                  )}
                  <div className="profile-card-content">
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
    </main>
  )
}

