export function formatTimestamp(value) {
  if (!value) {
    return 'n/a'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'n/a'
  }
  return date.toLocaleString()
}

export function toAssetHref(value) {
  if (!value || typeof value !== 'string') {
    return ''
  }
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '')
  return `/${normalized}`
}

export function deriveHandleFromUrl(value) {
  try {
    const parsed = new URL(value)
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length === 0) {
      return ''
    }
    if (parts[0].startsWith('@')) {
      return parts[0]
    }
    return `@${parts[0]}`
  } catch {
    return ''
  }
}

export function makeContactSlug(job) {
  if (typeof job.accountSlug === 'string' && job.accountSlug.trim()) {
    return job.accountSlug.trim().toLowerCase()
  }
  const fallback = (job.accountHandle || deriveHandleFromUrl(job.tweetUrl || '') || 'unknown').replace(/^@/, '')
  return fallback.trim().toLowerCase() || 'unknown'
}

export function buildContacts(jobs) {
  const map = new Map()

  for (const job of jobs) {
    const slug = makeContactSlug(job)
    const current = map.get(slug) || {
      slug,
      platform: job.accountPlatform || 'unknown',
      handle: job.accountHandle || deriveHandleFromUrl(job.tweetUrl || ''),
      displayName: job.accountDisplayName || '',
      totalJobs: 0,
      completedJobs: 0,
      latestAt: '',
      firstSeenAt: '',
      latestThumbnail: '',
    }

    current.totalJobs += 1
    if (job.status === 'completed') {
      current.completedJobs += 1
    }

    const createdAt = job.createdAt || ''
    if (!current.firstSeenAt || (createdAt && new Date(createdAt) < new Date(current.firstSeenAt))) {
      current.firstSeenAt = createdAt
    }

    if (!current.latestAt || (createdAt && new Date(createdAt) > new Date(current.latestAt))) {
      current.latestAt = createdAt
      current.latestThumbnail = job.thumbnailPath || (Array.isArray(job.imageUrls) ? job.imageUrls[0] || '' : '')
      current.platform = job.accountPlatform || current.platform
      current.handle = job.accountHandle || current.handle
      current.displayName = job.accountDisplayName || current.displayName
    }

    map.set(slug, current)
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = a.latestAt ? new Date(a.latestAt).getTime() : 0
    const bTime = b.latestAt ? new Date(b.latestAt).getTime() : 0
    return bTime - aTime
  })
}

function toPositiveInt(value) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function getAreaFromPath(pathname) {
  const size = String(pathname || '').match(/(\d{2,5})x(\d{2,5})/)
  if (!size) {
    return 0
  }
  const width = toPositiveInt(size[1])
  const height = toPositiveInt(size[2])
  if (!width || !height) {
    return 0
  }
  return width * height
}

export function getCandidateFacts(url) {
  try {
    const parsed = new URL(url)
    const width = toPositiveInt(parsed.searchParams.get('vw')) || toPositiveInt(parsed.searchParams.get('width'))
    const height = toPositiveInt(parsed.searchParams.get('vh')) || toPositiveInt(parsed.searchParams.get('height'))
    const area = width && height ? width * height : getAreaFromPath(parsed.pathname)
    const br = toPositiveInt(parsed.searchParams.get('br'))
    const bt = toPositiveInt(parsed.searchParams.get('bt'))
    const fps = toPositiveInt(parsed.searchParams.get('fps'))
    const watermark = parsed.searchParams.get('watermark') === '1' || parsed.searchParams.get('is_watermark') === '1'

    return {
      host: parsed.hostname,
      width,
      height,
      area,
      br,
      bt,
      fps,
      watermark,
    }
  } catch {
    return {
      host: '',
      width: 0,
      height: 0,
      area: 0,
      br: 0,
      bt: 0,
      fps: 0,
      watermark: false,
    }
  }
}

export function parseQualityLabel(url, index) {
  const facts = getCandidateFacts(url)
  const parts = [`Option ${index + 1}`]
  if (facts.width && facts.height) {
    parts.push(`${facts.width}x${facts.height}`)
  }
  if (facts.br) {
    parts.push(`br ${facts.br}`)
  }
  if (facts.bt) {
    parts.push(`bt ${facts.bt}`)
  }
  if (facts.fps) {
    parts.push(`${facts.fps}fps`)
  }
  if (facts.watermark) {
    parts.push('watermarked')
  }
  if (facts.host) {
    parts.push(facts.host)
  }
  return parts.join(' | ')
}

