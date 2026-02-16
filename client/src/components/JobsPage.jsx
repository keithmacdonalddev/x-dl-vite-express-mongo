import { useState } from 'react'
import { createJob, createManualRetryJob } from '../api/jobsApi'
import { useJobsPolling } from '../hooks/useJobsPolling'

function formatTimestamp(value) {
  if (!value) {
    return 'n/a'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'n/a'
  }
  return date.toLocaleString()
}

export function JobsPage() {
  const [tweetUrl, setTweetUrl] = useState('')
  const [manualMediaByJobId, setManualMediaByJobId] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [manualSubmittingJobId, setManualSubmittingJobId] = useState('')
  const [submitError, setSubmitError] = useState('')
  const { jobs, isLoading, error: pollError, refresh } = useJobsPolling({ intervalMs: 3000 })

  async function handleSubmit(event) {
    event.preventDefault()
    if (!tweetUrl.trim()) {
      return
    }

    setIsSubmitting(true)
    setSubmitError('')
    try {
      await createJob(tweetUrl.trim())
      setTweetUrl('')
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

  const errorMessage = submitError || pollError

  return (
    <main className="app">
      <header>
        <p className="eyebrow">x-dl rewrite</p>
        <h1>Jobs Dashboard</h1>
        <p className="subhead">Submit an X or TikTok post URL and track extraction/download job status.</p>
      </header>

      <section className="card">
        <h2>Create job</h2>
        <form className="job-form" onSubmit={handleSubmit}>
          <label htmlFor="tweetUrl">Post URL</label>
          <input
            id="tweetUrl"
            name="tweetUrl"
            type="url"
            placeholder="https://x.com/user/status/123... or https://www.tiktok.com/@user/video/123..."
            value={tweetUrl}
            onChange={(event) => setTweetUrl(event.target.value)}
            required
          />
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Add job'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Jobs</h2>
        {isLoading && <p>Loading jobs...</p>}
        {!isLoading && jobs.length === 0 && <p>No jobs yet.</p>}
        {!isLoading && jobs.length > 0 && (
          <ul className="jobs-list">
            {jobs.map((job) => (
              <li key={job._id} className="job-row">
                <p>
                  <strong>Status:</strong> {job.status}
                </p>
                <p>
                  <strong>URL:</strong> {job.tweetUrl}
                </p>
                <p>
                  <strong>Created:</strong> {formatTimestamp(job.createdAt)}
                </p>
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
    </main>
  )
}
