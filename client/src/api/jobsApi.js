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

export async function updateJob(jobId, payload) {
  const response = await fetch(`${JOBS_API_BASE}/${jobId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload || {}),
  })
  return parseResponse(response)
}

export async function deleteJob(jobId) {
  const response = await fetch(`${JOBS_API_BASE}/${jobId}`, {
    method: 'DELETE',
  })
  return parseResponse(response)
}

export async function bulkDeleteJobs(jobIds) {
  const response = await fetch(`${JOBS_API_BASE}/bulk-delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jobIds }),
  })
  return parseResponse(response)
}

export async function updateContactProfile(contactSlug, displayName) {
  const response = await fetch(`${JOBS_API_BASE}/contact/${encodeURIComponent(contactSlug)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ displayName }),
  })
  return parseResponse(response)
}

export async function deleteContactProfile(contactSlug) {
  const response = await fetch(`${JOBS_API_BASE}/contact/${encodeURIComponent(contactSlug)}`, {
    method: 'DELETE',
  })
  return parseResponse(response)
}
