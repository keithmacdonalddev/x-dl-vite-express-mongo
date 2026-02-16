const JOBS_API_BASE = '/api/jobs'

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof data.error === 'string' && data.error
        ? data.error
        : `Request failed with status ${response.status}`
    throw new Error(message)
  }
  return data
}

export async function createJob(tweetUrl) {
  const response = await fetch(JOBS_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tweetUrl }),
  })
  return parseResponse(response)
}

export async function listJobs() {
  const response = await fetch(JOBS_API_BASE)
  return parseResponse(response)
}

export async function getJob(id) {
  const response = await fetch(`${JOBS_API_BASE}/${id}`)
  return parseResponse(response)
}

export async function createManualRetryJob(jobId, mediaUrl) {
  const response = await fetch(`${JOBS_API_BASE}/${jobId}/manual-retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mediaUrl }),
  })
  return parseResponse(response)
}
