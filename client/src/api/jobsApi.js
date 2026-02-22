const JOBS_API_BASE = '/api/jobs'
const CAPABILITIES_API = '/api/capabilities'
const TELEMETRY_API = '/api/telemetry'
const DISCOVERY_API = '/api/discovery'
const AUTH_API = '/api/auth'

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}))
  const responseTraceId = typeof response.headers?.get === 'function' ? response.headers.get('x-trace-id') : ''
  if (!response.ok) {
    const message =
      typeof data.error === 'string' && data.error
        ? data.error
        : `Request failed with status ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.code = typeof data.code === 'string' ? data.code : ''
    error.traceId = typeof data.traceId === 'string' ? data.traceId : responseTraceId || ''
    if (typeof data.existingJobId === 'string' && data.existingJobId) {
      error.existingJobId = data.existingJobId
    }
    if (typeof data.existingJobStatus === 'string' && data.existingJobStatus) {
      error.existingJobStatus = data.existingJobStatus
    }
    throw error
  }
  if (responseTraceId && data && typeof data === 'object' && !('traceId' in data)) {
    data.traceId = responseTraceId
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

export async function listJobs(params = {}) {
  const search = new URLSearchParams()
  if (params.view) {
    search.set('view', String(params.view))
  }
  if (params.status) {
    search.set('status', String(params.status))
  }
  if (Number.isFinite(params.limit) && params.limit > 0) {
    search.set('limit', String(params.limit))
  }

  const query = search.toString()
  const response = await fetch(query ? `${JOBS_API_BASE}?${query}` : JOBS_API_BASE)
  return parseResponse(response)
}

export async function listContactJobs(contactSlug, params = {}) {
  const slug = typeof contactSlug === 'string' ? contactSlug.trim().toLowerCase() : ''
  if (!slug) {
    return {
      ok: true,
      jobs: [],
      view: params.view || 'compact',
      contactSlug: '',
    }
  }

  const search = new URLSearchParams()
  if (params.view) {
    search.set('view', String(params.view))
  }
  if (params.status) {
    search.set('status', String(params.status))
  }
  if (Number.isFinite(params.limit) && params.limit > 0) {
    search.set('limit', String(params.limit))
  }

  const query = search.toString()
  const endpoint = `${JOBS_API_BASE}/contact/${encodeURIComponent(slug)}`
  const response = await fetch(query ? `${endpoint}?${query}` : endpoint)
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

export async function getCapabilities() {
  const response = await fetch(CAPABILITIES_API)
  return parseResponse(response)
}

export async function updateCapabilities(platforms) {
  const response = await fetch(CAPABILITIES_API, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ platforms }),
  })
  return parseResponse(response)
}

export async function listTelemetry(params = {}) {
  const search = new URLSearchParams()
  if (params.jobId) {
    search.set('jobId', params.jobId)
  }
  if (params.traceId) {
    search.set('traceId', params.traceId)
  }
  if (params.level) {
    search.set('level', params.level)
  }
  if (params.limit) {
    search.set('limit', String(params.limit))
  }

  const response = await fetch(`${TELEMETRY_API}?${search.toString()}`)
  return parseResponse(response)
}

export async function listDiscoveredPosts(accountSlug) {
  const response = await fetch(`${DISCOVERY_API}/${encodeURIComponent(accountSlug)}`)
  return parseResponse(response)
}

export async function deleteDiscoveredPost(postId) {
  const response = await fetch(`${DISCOVERY_API}/posts/${postId}`, { method: 'DELETE' })
  return parseResponse(response)
}

export async function downloadDiscoveredPost(discoveredPostId) {
  const response = await fetch(`${DISCOVERY_API}/${discoveredPostId}/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  return parseResponse(response)
}

export async function refreshDiscovery(accountSlug) {
  const response = await fetch(`${DISCOVERY_API}/${encodeURIComponent(accountSlug)}/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  return parseResponse(response)
}

export async function repairThumbnails(accountSlug) {
  const response = await fetch(`${DISCOVERY_API}/${encodeURIComponent(accountSlug)}/repair-thumbnails`, {
    method: 'POST',
  })
  return parseResponse(response)
}

export async function openInVlc(outputPath) {
  const response = await fetch(`${JOBS_API_BASE}/open-vlc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ outputPath }),
  })
  return parseResponse(response)
}

export async function getAuthStatus() {
  const response = await fetch(`${AUTH_API}/status`)
  return parseResponse(response)
}

export async function connectPlatformApi(platformId) {
  const response = await fetch(`${AUTH_API}/connect/${encodeURIComponent(platformId)}`, {
    method: 'POST',
  })
  return parseResponse(response)
}

export async function disconnectPlatformApi(platformId) {
  const response = await fetch(`${AUTH_API}/disconnect/${encodeURIComponent(platformId)}`, {
    method: 'POST',
  })
  return parseResponse(response)
}

export function openTelemetryStream(params = {}, { onEvent, onError } = {}) {
  if (typeof EventSource === 'undefined') {
    return null
  }

  const search = new URLSearchParams()
  if (params.jobId) {
    search.set('jobId', params.jobId)
  }
  if (params.traceId) {
    search.set('traceId', params.traceId)
  }
  if (params.level) {
    search.set('level', params.level)
  }
  if (params.limit) {
    search.set('limit', String(params.limit))
  }

  const stream = new EventSource(`/api/telemetry/stream?${search.toString()}`)
  stream.addEventListener('telemetry', (event) => {
    try {
      const payload = JSON.parse(event.data)
      if (typeof onEvent === 'function') {
        onEvent(payload)
      }
    } catch (error) {
      if (typeof onError === 'function') {
        onError(error)
      }
    }
  })

  stream.onerror = (error) => {
    if (typeof onError === 'function') {
      onError(error)
    }
  }

  return stream
}
