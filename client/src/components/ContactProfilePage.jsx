import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteContactProfile,
  deleteDiscoveredPost,
  deleteJob,
  downloadDiscoveredPost,
  redownloadDiscoveredPost,
  redownloadJob,
  getJob,
  listDiscoveredPosts,
  openContainingFolder,
  openInVlc,
  refreshDiscovery,
  repairThumbnails,
  updateJob,
  updateContactProfile,
} from '../api/jobsApi'
import { useJobsPolling } from '../hooks/useJobsPolling'
import { useDiscoveryProgress } from '../hooks/useDiscoveryProgress'
import {
  buildContacts,
  compareByPublishedAtDesc,
  formatShortDate,
  getPublishedAtValue,
  makeContactSlug,
  toAssetHref,
} from '../lib/contacts'
import { recordProfileView, recordVideoView } from '../lib/recentViews'
import { useJobActions } from '../features/dashboard/useJobActions'

import { IntakeForm } from '../features/intake/IntakeForm'
import { ConfirmModal } from './ConfirmModal'
import { DiscoveredGrid } from './DiscoveredGrid'

const THUMBNAIL_SIZE_OPTIONS = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'xlarge', label: 'Extra Large' },
]
const PROFILE_POST_SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'most-viewed', label: 'Most viewed' },
]
const PROFILE_POST_VISIBILITY_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'downloaded', label: 'Downloaded' },
  { id: 'not-downloaded', label: 'Not downloaded' },
]
const DISCOVERED_INITIAL_LIMIT = 20
const DISCOVERED_PAGE_LIMIT = 40

function getDiscoveredStorageKey(slug) {
  const normalizedSlug = typeof slug === 'string' ? slug.trim().toLowerCase() : ''
  if (!normalizedSlug) {
    return ''
  }
  return `discovered-posts:${normalizedSlug}`
}

function readCachedDiscoveredPosts(slug) {
  const storageKey = getDiscoveredStorageKey(slug)
  if (!storageKey || typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCachedDiscoveredPosts(slug, posts) {
  const storageKey = getDiscoveredStorageKey(slug)
  if (!storageKey || typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(Array.isArray(posts) ? posts : []))
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

function mergeDiscoveredPosts(currentPosts, incomingPosts) {
  const mergedById = new Map()
  for (const post of Array.isArray(currentPosts) ? currentPosts : []) {
    if (post && post._id) {
      mergedById.set(post._id, post)
    }
  }
  for (const post of Array.isArray(incomingPosts) ? incomingPosts : []) {
    if (post && post._id) {
      mergedById.set(post._id, post)
    }
  }
  return Array.from(mergedById.values()).sort(compareByPublishedAtDesc)
}

function normalizeComparableUrl(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed)
    // Strip www. prefix so that www.tiktok.com and tiktok.com match
    const host = parsed.hostname.replace(/^www\./, '')
    return `${parsed.protocol}//${host}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase()
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase()
  }
}

function extractVideoIdFromUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const parsed = new URL(value.trim())
    const match = parsed.pathname.match(/\/video\/(\d+)/)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

function toDateMs(value) {
  if (!value) return 0
  const parsed = new Date(value)
  const parsedMs = parsed.getTime()
  return Number.isFinite(parsedMs) ? parsedMs : 0
}

function getPostSortTimestamp(post) {
  return toDateMs(getPublishedAtValue(post)) || toDateMs(post?.createdAt)
}

function getPostPlayCount(post) {
  const count = Number(post?.playCount)
  return Number.isFinite(count) && count > 0 ? count : 0
}

export function ContactProfilePage({
  contactSlug,
  onBack,
  onOpenFavorites,
  onOpenLiked,
  initialOpenJobId = '',
  onConsumeInitialOpenJobId,
}) {
  const normalizedSlug = String(contactSlug || '')
    .split('?')[0]
    .split('#')[0]
    .trim()
    .toLowerCase()
  const { jobs, isLoading, error, refresh } = useJobsPolling({
    intervalMs: 3000,
    view: 'compact',
    limit: 80,
    contactSlug: normalizedSlug,
    initialLimit: 18,
    progressiveDelayMs: 160,
  })
  const [editContactName, setEditContactName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, mode: '', jobId: '', count: 0 })
  const [discoveredPosts, setDiscoveredPosts] = useState(() => readCachedDiscoveredPosts(normalizedSlug))
  const [isHydratingDiscovered, setIsHydratingDiscovered] = useState(false)
  const [downloadingPostIds, setDownloadingPostIds] = useState(new Set())
  const [discoveryTraceId, setDiscoveryTraceId] = useState('')
  const [syncTraceId, setSyncTraceId] = useState('')
  const [initialOpenJob, setInitialOpenJob] = useState(null)
  const [thumbnailSize, setThumbnailSize] = useState('large')
  const [postSort, setPostSort] = useState('newest')
  const [postVisibility, setPostVisibility] = useState('all')
  const discoveredHydrationSequenceRef = useRef(0)
  const discoveredPostsRef = useRef(discoveredPosts)
  const recordedProfileSignatureRef = useRef('')

  const discoveryProgress = useDiscoveryProgress(discoveryTraceId, 'discover')
  const syncProgress = useDiscoveryProgress(syncTraceId, 'sync')

  const anyOperationActive = discoveryProgress.phase !== 'idle' || syncProgress.phase !== 'idle'

  const actions = useJobActions({ refresh })
  const contacts = useMemo(() => buildContacts(jobs), [jobs])

  const contact = useMemo(
    () => contacts.find((value) => value.slug === normalizedSlug),
    [contacts, normalizedSlug]
  )

  // Synthesize a minimal contact object from discovered posts when there are no
  // downloaded jobs for this slug (e.g. a profile that was only ever discovered,
  // never downloaded). Falls back to null when neither source has data.
  const effectiveContact = useMemo(() => {
    if (contact) return contact
    if (discoveredPosts.length > 0) {
      const sample = discoveredPosts[0]

      // Derive firstSeenAt and latestAt from published/created dates across all posts
      let firstSeenMs = 0
      let latestMs = 0
      for (const post of discoveredPosts) {
        const ms = toDateMs(getPublishedAtValue(post)) || toDateMs(post?.createdAt)
        if (ms > 0) {
          if (firstSeenMs === 0 || ms < firstSeenMs) firstSeenMs = ms
          if (ms > latestMs) latestMs = ms
        }
      }

      // Normalize handle — ensure it always has the @ prefix
      const rawHandle = sample?.accountHandle || normalizedSlug
      const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`

      // Use the same avatar path convention as buildContacts() — falls back to
      // discovered post thumbnail URL if the avatar file doesn't exist (handled
      // by the <img> onError below).
      const avatarPath = `downloads/${normalizedSlug}/avatar.jpg`

      // Collect the most recent thumbnail from discovered posts for avatar fallback
      const latestThumbnail =
        sample?.thumbnailPath ||
        sample?.thumbnailUrl ||
        ''

      return {
        slug: normalizedSlug,
        handle,
        displayName: sample?.accountDisplayName || '',
        platform: sample?.accountPlatform || 'tiktok',
        totalJobs: 0,
        completedJobs: 0,
        firstSeenAt: firstSeenMs > 0 ? new Date(firstSeenMs).toISOString() : null,
        latestAt: latestMs > 0 ? new Date(latestMs).toISOString() : null,
        avatarPath,
        latestThumbnail,
        profileRemovedFromSourceAt: null,
      }
    }
    return null
  }, [contact, discoveredPosts, normalizedSlug])

  useEffect(() => {
    if (!normalizedSlug) return
    const signature = [
      normalizedSlug,
      effectiveContact?.handle || '',
      effectiveContact?.displayName || '',
      effectiveContact?.avatarPath || '',
    ].join('|')
    if (signature === recordedProfileSignatureRef.current) {
      return
    }
    recordedProfileSignatureRef.current = signature
    recordProfileView({
      slug: normalizedSlug,
      handle: effectiveContact?.handle || `@${normalizedSlug}`,
      displayName: effectiveContact?.displayName || '',
      avatarPath: effectiveContact?.avatarPath || '',
    })
  }, [effectiveContact?.avatarPath, effectiveContact?.displayName, effectiveContact?.handle, normalizedSlug])

  const contactJobs = useMemo(
    () => jobs.slice().sort(compareByPublishedAtDesc),
    [jobs]
  )
  const visibleContactJobs = useMemo(
    () => contactJobs.filter((job) => !actions.hiddenJobIds[job._id]),
    [contactJobs, actions.hiddenJobIds]
  )

  const unifiedVideoPosts = useMemo(() => {
    const combined = Array.isArray(discoveredPosts) ? discoveredPosts.slice() : []
    const seenJobIds = new Set()
    const seenUrls = new Set()

    for (const post of combined) {
      if (post && post.downloadedJobId) {
        seenJobIds.add(String(post.downloadedJobId))
      }
      const postUrlKey = normalizeComparableUrl(post?.canonicalUrl || post?.postUrl || '')
      if (postUrlKey) {
        seenUrls.add(postUrlKey)
      }
    }

    function hasPlayableDownload(post) {
      if (!post || typeof post !== 'object') {
        return false
      }
      if (post.isDownloaded !== true) {
        return false
      }
      const outputPath = typeof post.downloadOutputPath === 'string' && post.downloadOutputPath.trim()
        ? post.downloadOutputPath.trim()
        : typeof post.outputPath === 'string'
          ? post.outputPath.trim()
          : ''
      return Boolean(outputPath)
    }

    function addDownloadedJob(job) {
      if (!job || typeof job !== 'object') {
        return
      }

      const outputPath = typeof job.outputPath === 'string' ? job.outputPath.trim() : ''
      const isDownloadedJob = job.status === 'completed' && Boolean(outputPath)
      if (!isDownloadedJob) {
        return
      }

      const jobId = String(job._id || '')
      const urlKey = normalizeComparableUrl(job.canonicalUrl || job.tweetUrl || '')
      if (jobId && seenJobIds.has(jobId)) {
        return
      }

      let matchingIndex = urlKey
        ? combined.findIndex((post) => normalizeComparableUrl(post?.canonicalUrl || post?.postUrl || '') === urlKey)
        : -1

      // Fallback: match by videoId extracted from the job URL against discovered post videoId
      if (matchingIndex < 0) {
        const jobVideoId = extractVideoIdFromUrl(job.canonicalUrl || job.tweetUrl || '')
        if (jobVideoId) {
          matchingIndex = combined.findIndex(
            (post) => post?.videoId && String(post.videoId) === jobVideoId
          )
        }
      }

      if (matchingIndex >= 0) {
        const existingPost = combined[matchingIndex]
        if (!hasPlayableDownload(existingPost)) {
          combined[matchingIndex] = {
            ...existingPost,
            downloadedJobId: jobId || existingPost?.downloadedJobId || null,
            isDownloaded: true,
            downloadOutputPath: outputPath,
            thumbnailPath: existingPost?.thumbnailPath || job.thumbnailPath || '',
            thumbnailUrl: existingPost?.thumbnailUrl || job.thumbnailUrl || (
              Array.isArray(job.imageUrls) ? job.imageUrls[0] || '' : ''
            ),
            publishedAt: existingPost?.publishedAt || getPublishedAtValue(job),
            isRemovedFromSource: Boolean(
              existingPost?.isRemovedFromSource ||
              existingPost?.removedFromSourceAt ||
              job.removedFromSourceAt ||
              job.isRemovedFromSource
            ),
            isProfileRemovedFromSource: Boolean(
              existingPost?.isProfileRemovedFromSource ||
              existingPost?.profileRemovedFromSourceAt ||
              job.profileRemovedFromSourceAt ||
              job.isProfileRemovedFromSource
            ),
            isFavorite: Boolean(job.isFavorite),
          }
        }
        if (jobId) {
          seenJobIds.add(jobId)
        }
        if (urlKey) {
          seenUrls.add(urlKey)
        }
        return
      }

      combined.push({
        _id: `job-${jobId}`,
        _syntheticJobPost: true,
        postUrl: job.tweetUrl || '',
        canonicalUrl: job.canonicalUrl || '',
        thumbnailPath: job.thumbnailPath || '',
        thumbnailUrl: job.thumbnailUrl || (Array.isArray(job.imageUrls) ? job.imageUrls[0] || '' : ''),
        publishedAt: getPublishedAtValue(job),
        downloadedJobId: jobId || null,
        isDownloaded: true,
        downloadOutputPath: outputPath,
        isRemovedFromSource: Boolean(job.removedFromSourceAt || job.isRemovedFromSource),
        isProfileRemovedFromSource: Boolean(job.profileRemovedFromSourceAt || job.isProfileRemovedFromSource),
        isFavorite: Boolean(job.isFavorite),
      })

      if (jobId) {
        seenJobIds.add(jobId)
      }
      if (urlKey) {
        seenUrls.add(urlKey)
      }
    }

    for (const job of visibleContactJobs) {
      addDownloadedJob(job)
    }

    if (initialOpenJob && typeof initialOpenJob === 'object') {
      const targetSlug = makeContactSlug(initialOpenJob)
      if (!normalizedSlug || !targetSlug || targetSlug === normalizedSlug || targetSlug === 'unknown') {
        addDownloadedJob(initialOpenJob)
      }
    }

    return combined.sort(compareByPublishedAtDesc)
  }, [discoveredPosts, initialOpenJob, normalizedSlug, visibleContactJobs])

  const sortedVideoPosts = useMemo(() => {
    const posts = unifiedVideoPosts.slice()

    if (postSort === 'oldest') {
      posts.sort((left, right) => {
        const leftTime = getPostSortTimestamp(left)
        const rightTime = getPostSortTimestamp(right)
        if (leftTime !== rightTime) {
          return leftTime - rightTime
        }
        return String(left?._id || '').localeCompare(String(right?._id || ''))
      })
      return posts
    }

    if (postSort === 'most-viewed') {
      posts.sort((left, right) => {
        const leftCount = getPostPlayCount(left)
        const rightCount = getPostPlayCount(right)
        if (rightCount !== leftCount) {
          return rightCount - leftCount
        }
        return getPostSortTimestamp(right) - getPostSortTimestamp(left)
      })
      return posts
    }

    posts.sort((left, right) => getPostSortTimestamp(right) - getPostSortTimestamp(left))
    return posts
  }, [postSort, unifiedVideoPosts])

  const filteredVideoPosts = useMemo(() => {
    if (postVisibility === 'downloaded') {
      return sortedVideoPosts.filter((post) => post && post.isDownloaded === true)
    }
    if (postVisibility === 'not-downloaded') {
      return sortedVideoPosts.filter((post) => !post || post.isDownloaded !== true)
    }
    return sortedVideoPosts
  }, [postVisibility, sortedVideoPosts])

  const filteredEmptyMessage = useMemo(() => {
    if (postVisibility === 'downloaded') {
      return 'No downloaded videos for this creator yet.'
    }
    if (postVisibility === 'not-downloaded') {
      return 'No pending videos. Everything shown is already downloaded.'
    }
    return 'No creator videos found yet. Run discovery to populate candidates.'
  }, [postVisibility])

  useEffect(() => {
    discoveredPostsRef.current = discoveredPosts
  }, [discoveredPosts])

  useEffect(() => {
    actions.cleanupHiddenIds(contactJobs.map((j) => j._id))
  }, [contactJobs]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const targetJobId = typeof initialOpenJobId === 'string' ? initialOpenJobId.trim() : ''
    if (!targetJobId) {
      setInitialOpenJob(null)
      return
    }

    let cancelled = false

    async function loadInitialOpenJob() {
      try {
        const payload = await getJob(targetJobId)
        const job = payload && payload.job ? payload.job : null
        if (!cancelled) {
          setInitialOpenJob(job)
        }
      } catch {
        if (!cancelled) {
          setInitialOpenJob(null)
        }
      }
    }

    loadInitialOpenJob()
    return () => {
      cancelled = true
    }
  }, [initialOpenJobId])

  const fetchDiscoveredPostsPage = useCallback(async ({
    silent = true,
    limit = 0,
    offset = 0,
    mode = 'replace',
  } = {}) => {
    if (!normalizedSlug) {
      return { posts: [], hasMore: false, nextOffset: null }
    }
    try {
      const data = await listDiscoveredPosts(normalizedSlug, { limit, offset })
      const posts = Array.isArray(data.posts) ? data.posts.slice().sort(compareByPublishedAtDesc) : []
      const hasMore = Boolean(data?.pagination?.hasMore)
      const nextOffsetRaw = Number(data?.pagination?.nextOffset)
      const nextOffset = Number.isFinite(nextOffsetRaw) ? nextOffsetRaw : null

      if (mode === 'merge') {
        setDiscoveredPosts((prev) => {
          const merged = mergeDiscoveredPosts(prev, posts)
          writeCachedDiscoveredPosts(normalizedSlug, merged)
          return merged
        })
      } else if (mode === 'replace') {
        setDiscoveredPosts(posts)
        writeCachedDiscoveredPosts(normalizedSlug, posts)
      }
      return { ok: true, posts, hasMore, nextOffset }
    } catch (err) {
      if (!silent) throw err
      return { ok: false, posts: [], hasMore: false, nextOffset: null }
    }
  }, [normalizedSlug])

  const hydrateDiscoveredPostsProgressively = useCallback(async ({ silent = true } = {}) => {
    if (!normalizedSlug) {
      return
    }

    const hydrationSequence = discoveredHydrationSequenceRef.current + 1
    discoveredHydrationSequenceRef.current = hydrationSequence
    setIsHydratingDiscovered(true)
    const hasSeedPosts = Array.isArray(discoveredPostsRef.current) && discoveredPostsRef.current.length > 0

    const firstPage = await fetchDiscoveredPostsPage({
      silent,
      limit: DISCOVERED_INITIAL_LIMIT,
      offset: 0,
      mode: hasSeedPosts ? 'none' : 'replace',
    })

    if (discoveredHydrationSequenceRef.current !== hydrationSequence) {
      return
    }
    if (!firstPage.ok) {
      setIsHydratingDiscovered(false)
      return
    }

    let hydratedPosts = firstPage.posts
    let nextOffset = firstPage.hasMore ? firstPage.nextOffset : null
    while (nextOffset !== null && discoveredHydrationSequenceRef.current === hydrationSequence) {
      const nextPage = await fetchDiscoveredPostsPage({
        silent,
        limit: DISCOVERED_PAGE_LIMIT,
        offset: nextOffset,
        mode: hasSeedPosts ? 'none' : 'merge',
      })
      if (!nextPage.ok) {
        break
      }
      hydratedPosts = mergeDiscoveredPosts(hydratedPosts, nextPage.posts)
      if (!nextPage.hasMore || nextPage.nextOffset === null) {
        break
      }
      nextOffset = nextPage.nextOffset
    }

    if (discoveredHydrationSequenceRef.current === hydrationSequence) {
      if (hasSeedPosts) {
        setDiscoveredPosts(hydratedPosts)
        writeCachedDiscoveredPosts(normalizedSlug, hydratedPosts)
      }
      setIsHydratingDiscovered(false)
    }
  }, [fetchDiscoveredPostsPage, normalizedSlug])

  useEffect(() => {
    discoveredHydrationSequenceRef.current += 1
    setIsHydratingDiscovered(false)
    setDiscoveredPosts(readCachedDiscoveredPosts(normalizedSlug))
  }, [normalizedSlug])

  useEffect(() => {
    hydrateDiscoveredPostsProgressively()
  }, [hydrateDiscoveredPostsProgressively])

  useEffect(() => {
    if (!normalizedSlug) return () => {}

    const intervalId = setInterval(() => {
      fetchDiscoveredPostsPage({
        silent: true,
        limit: DISCOVERED_INITIAL_LIMIT,
        offset: 0,
        mode: 'merge',
      })
    }, 3000)

    return () => {
      clearInterval(intervalId)
    }
  }, [fetchDiscoveredPostsPage, normalizedSlug])

  // Reset progress state when navigating to a different contact
  useEffect(() => {
    setDiscoveryTraceId('')
    setSyncTraceId('')
    discoveryProgress.reset()
    syncProgress.reset()
  }, [normalizedSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  // React to discovery completion — refresh grid and clear after delay
  useEffect(() => {
    if (discoveryProgress.isComplete || discoveryProgress.isError) {
      hydrateDiscoveredPostsProgressively()
      const timer = setTimeout(() => {
        setDiscoveryTraceId('')
        discoveryProgress.reset()
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [discoveryProgress.isComplete, discoveryProgress.isError]) // eslint-disable-line react-hooks/exhaustive-deps

  // React to sync completion — refresh grid and clear after delay
  useEffect(() => {
    if (syncProgress.isComplete || syncProgress.isError) {
      hydrateDiscoveredPostsProgressively()
      const timer = setTimeout(() => {
        setSyncTraceId('')
        syncProgress.reset()
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [syncProgress.isComplete, syncProgress.isError]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDownloadDiscovered(discoveredPostId) {
    setDownloadingPostIds(prev => new Set(prev).add(discoveredPostId))
    try {
      await downloadDiscoveredPost(discoveredPostId)
      // alreadyExists is also a success — the job exists
      await refresh()
      await hydrateDiscoveredPostsProgressively()
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

  async function handleRedownloadDiscovered(discoveredPostId) {
    setDownloadingPostIds(prev => new Set(prev).add(discoveredPostId))
    try {
      const post = unifiedVideoPosts.find((p) => p._id === discoveredPostId)
      const isSyntheticJob = post && post._syntheticJobPost === true
      const jobId = post && post.downloadedJobId ? String(post.downloadedJobId).trim() : ''

      if (isSyntheticJob && jobId) {
        await redownloadJob(jobId)
      } else {
        await redownloadDiscoveredPost(discoveredPostId)
      }
      await refresh()
      await hydrateDiscoveredPostsProgressively()
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

  async function handleDeleteDiscovered(postId) {
    try {
      // Synthetic posts (from downloaded jobs with no discovered-post record)
      // have _id like "job-<objectId>" — delete the underlying job instead
      if (typeof postId === 'string' && postId.startsWith('job-')) {
        const jobId = postId.slice(4)
        if (!jobId) throw new Error('Invalid synthetic post ID: missing job ID')
        await deleteJob(jobId)
      } else {
        await deleteDiscoveredPost(postId)
      }
      setDiscoveredPosts((prev) => {
        const next = prev.filter((p) => p._id !== postId)
        writeCachedDiscoveredPosts(normalizedSlug, next)
        return next
      })
    } catch (err) {
      actions.setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleOpenInVlc(outputPath, fallbackVlcHref) {
    const resolvedOutputPath = typeof outputPath === 'string' ? outputPath.trim() : ''
    if (!resolvedOutputPath) {
      if (fallbackVlcHref && typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
        window.location.assign(fallbackVlcHref)
      }
      return
    }

    try {
      await openInVlc(resolvedOutputPath)
    } catch (err) {
      if (fallbackVlcHref && typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
        window.location.assign(fallbackVlcHref)
        return
      }
      actions.setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleOpenContainingFolder(outputPath) {
    const resolvedOutputPath = typeof outputPath === 'string' ? outputPath.trim() : ''
    if (!resolvedOutputPath) {
      return
    }

    try {
      await openContainingFolder(resolvedOutputPath)
    } catch (err) {
      actions.setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleToggleFavorite(jobId, nextIsFavorite) {
    const normalizedJobId = typeof jobId === 'string' ? jobId.trim() : ''
    if (!normalizedJobId || typeof nextIsFavorite !== 'boolean') {
      return
    }

    setDiscoveredPosts((prev) => prev.map((post) => {
      const linkedJobId = post && post.downloadedJobId ? String(post.downloadedJobId).trim() : ''
      if (linkedJobId !== normalizedJobId) {
        return post
      }
      return { ...post, isFavorite: nextIsFavorite }
    }))

    try {
      await updateJob(normalizedJobId, { isFavorite: nextIsFavorite })
      await refresh()
      await fetchDiscoveredPostsPage({
        silent: true,
        limit: DISCOVERED_INITIAL_LIMIT,
        offset: 0,
        mode: 'merge',
      })
    } catch (err) {
      actions.setActionError(err instanceof Error ? err.message : String(err))
      await refresh()
      await fetchDiscoveredPostsPage({
        silent: true,
        limit: DISCOVERED_INITIAL_LIMIT,
        offset: 0,
        mode: 'merge',
      })
    }
  }

  function handleViewedVideo(post) {
    if (!post || typeof post !== 'object') return
    const outputPath = typeof post.downloadOutputPath === 'string' && post.downloadOutputPath.trim()
      ? post.downloadOutputPath.trim()
      : typeof post.outputPath === 'string'
        ? post.outputPath.trim()
        : ''
    const downloadedJobId = post.downloadedJobId ? String(post.downloadedJobId).trim() : ''

    recordVideoView({
      slug: normalizedSlug,
      jobId: downloadedJobId,
      postId: post._id,
      title: post.title || '',
      postUrl: post.postUrl || '',
      canonicalUrl: post.canonicalUrl || '',
      outputPath,
      thumbnailPath: post.thumbnailPath || '',
      thumbnailUrl: post.thumbnailUrl || '',
      handle: effectiveContact?.handle || `@${normalizedSlug}`,
      displayName: effectiveContact?.displayName || '',
    })
  }

  async function handleRefreshDiscovery() {
    if (!normalizedSlug || anyOperationActive) return

    try {
      const result = await refreshDiscovery(normalizedSlug)
      if (result.traceId) {
        setDiscoveryTraceId(result.traceId)
      }
    } catch (err) {
      actions.setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSync() {
    if (!normalizedSlug || anyOperationActive) return

    try {
      const result = await repairThumbnails(normalizedSlug)
      if (result.traceId) {
        setSyncTraceId(result.traceId)
      }
    } catch (err) {
      actions.setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  function openContactDelete() {
    setConfirmDelete({ isOpen: true, mode: 'contact', jobId: '', count: visibleContactJobs.length })
  }

  function closeDeleteModal() {
    if (actions.isMutating) return
    setConfirmDelete({ isOpen: false, mode: '', jobId: '', count: 0 })
  }

  async function handleConfirmDelete() {
    if (confirmDelete.mode === 'contact') {
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

  function getDiscoverButtonLabel() {
    const phase = discoveryProgress.phase
    if (phase === 'idle') return 'Discover'
    if (phase === 'complete' || phase === 'error') return 'Discover'
    return discoveryProgress.statusText || 'Discovering...'
  }

  function getSyncButtonLabel() {
    const phase = syncProgress.phase
    if (phase === 'idle') return 'Sync'
    if (phase === 'complete' || phase === 'error') return 'Sync'
    return syncProgress.statusText || 'Syncing...'
  }

  const rawErrorMessage = actions.actionError || error
  // Suppress "No TikTok jobs found" when discovered posts exist — the user can
  // see posts in the grid so this server error is misleading. The message only
  // makes sense when the profile is truly empty (no jobs AND no discovered posts).
  const errorMessage =
    rawErrorMessage &&
    rawErrorMessage.includes('No TikTok jobs found') &&
    discoveredPosts.length > 0
      ? ''
      : rawErrorMessage

  return (
    <main className="app">
      <header className="hero is-profile">
        <div className="hero-links-row">
          <button type="button" className="back-breadcrumb" onClick={onBack}>
            &larr; Dashboard
          </button>
          {typeof onOpenFavorites === 'function' && (
            <button type="button" className="back-breadcrumb" onClick={onOpenFavorites}>
              Favorites
            </button>
          )}
          {typeof onOpenLiked === 'function' && (
            <button type="button" className="back-breadcrumb" onClick={onOpenLiked}>
              Liked
            </button>
          )}
        </div>
        <p className="eyebrow">creator profile</p>
        <div className="profile-hero-top-row">
          <h1>{effectiveContact?.displayName || effectiveContact?.handle || `@${contactSlug}`}</h1>
          <div className="profile-hero-intake-inline">
            <IntakeForm onCreated={refresh} isBusy={actions.isMutating} compact />
          </div>
        </div>
        <p className="subhead">
          Captured posts, media, and metadata.
        </p>
      </header>

      <section className="layout profile-layout">
        <aside className="card profile-summary">
          <h2>Profile Summary</h2>
          <img
            className="profile-avatar"
            src={toAssetHref(effectiveContact?.avatarPath)}
            alt={effectiveContact?.displayName || effectiveContact?.handle || effectiveContact?.slug}
            onError={(e) => {
              const fallback = toAssetHref(effectiveContact?.latestThumbnail)
              if (fallback && e.target.src !== fallback) {
                e.target.src = fallback
              } else {
                e.target.style.display = 'none'
              }
            }}
          />
          <p><strong>Handle:</strong> {effectiveContact?.handle || 'n/a'}</p>
          <p><strong>Platform:</strong> {effectiveContact?.platform || 'unknown'}</p>
          <p>
            <strong>Source profile:</strong>{' '}
            {effectiveContact?.profileRemovedFromSourceAt
              ? `Unavailable on TikTok (${formatShortDate(effectiveContact.profileRemovedFromSourceAt)})`
              : 'Not flagged'}
          </p>
          <p><strong>Total jobs:</strong> {effectiveContact?.totalJobs || 0}</p>
          <p><strong>Completed:</strong> {effectiveContact?.completedJobs || 0}</p>
          <p><strong>First seen:</strong> {formatShortDate(effectiveContact?.firstSeenAt)}</p>
          <p><strong>Latest:</strong> {formatShortDate(effectiveContact?.latestAt)}</p>
          <div className="profile-actions-area">
            {contact && (
              <form className="edit-form profile-edit-inline" onSubmit={saveContactEdit}>
                <input
                  id="contact-display-name"
                  type="text"
                  placeholder="Display name"
                  value={editContactName}
                  onChange={(event) => setEditContactName(event.target.value)}
                />
                <button type="submit" disabled={actions.isMutating}>
                  {actions.isMutating ? '...' : 'Save'}
                </button>
              </form>
            )}
            <div className="profile-actions-row">
              {effectiveContact?.platform === 'tiktok' && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handleRefreshDiscovery}
                  disabled={anyOperationActive}
                >
                  {getDiscoverButtonLabel()}
                </button>
              )}
              <button
                type="button"
                className="ghost-btn"
                onClick={handleSync}
                disabled={anyOperationActive}
              >
                {getSyncButtonLabel()}
              </button>
            </div>
            {discoveryProgress.phase !== 'idle' && (
              <div className="discovery-progress">
                <div className="discovery-progress-bar is-indeterminate" />
                <p className={`discovery-progress-text is-${discoveryProgress.phase}`}>
                  {discoveryProgress.statusText}
                </p>
              </div>
            )}
            {syncProgress.phase !== 'idle' && (
              <div className="discovery-progress">
                <div
                  className="discovery-progress-bar"
                  style={{ '--progress': syncProgress.progress ?? 0 }}
                />
                <p className={`discovery-progress-text is-${syncProgress.phase}`}>
                  {syncProgress.statusText}
                </p>
              </div>
            )}
            {contact && (
              <button type="button" className="profile-delete-link" onClick={openContactDelete} disabled={actions.isMutating}>
                Delete contact
              </button>
            )}
          </div>
          {errorMessage && <p className="error">{errorMessage}</p>}
        </aside>

        <div className="profile-right">
          {isLoading && unifiedVideoPosts.length === 0 && <p>Loading profile...</p>}
          <div className="profile-video-toolbar">
            <div className="profile-video-toolbar-controls">
              <div className="profile-video-control-group">
                <p className="profile-video-toolbar-label">Thumbnail size</p>
                <div className="profile-video-size-group" role="group" aria-label="Thumbnail size">
                  {THUMBNAIL_SIZE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`ghost-btn profile-video-size-btn${thumbnailSize === option.id ? ' is-active' : ''}`}
                      onClick={() => setThumbnailSize(option.id)}
                      aria-pressed={thumbnailSize === option.id}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="profile-video-control-group">
                <p className="profile-video-toolbar-label">Sort posts</p>
                <div className="profile-video-sort-group" role="group" aria-label="Sort posts">
                  {PROFILE_POST_SORT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`ghost-btn profile-video-sort-btn${postSort === option.id ? ' is-active' : ''}`}
                      onClick={() => setPostSort(option.id)}
                      aria-pressed={postSort === option.id}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="profile-video-control-group">
                <p className="profile-video-toolbar-label">Show posts</p>
                <div className="profile-video-filter-group" role="group" aria-label="Show posts">
                  {PROFILE_POST_VISIBILITY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`ghost-btn profile-video-filter-btn${postVisibility === option.id ? ' is-active' : ''}`}
                      onClick={() => setPostVisibility(option.id)}
                      aria-pressed={postVisibility === option.id}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DiscoveredGrid
            posts={filteredVideoPosts}
            downloadingPostIds={downloadingPostIds}
            onDownload={handleDownloadDiscovered}
            onRedownload={handleRedownloadDiscovered}
            onDelete={handleDeleteDiscovered}
            onOpenInVlc={handleOpenInVlc}
            onOpenFolder={handleOpenContainingFolder}
            onToggleFavorite={handleToggleFavorite}
            onViewedVideo={handleViewedVideo}
            initialOpenDownloadedJobId={initialOpenJobId}
            onInitialOpenConsumed={onConsumeInitialOpenJobId}
            size={thumbnailSize}
            title="Videos"
            emptyMessage={filteredEmptyMessage}
          />
          {isLoading && sortedVideoPosts.length > 0 && (
            <p className="subtle-note">Refreshing profile data...</p>
          )}
          {isHydratingDiscovered && (
            <p className="subtle-note">Loading more videos...</p>
          )}
        </div>
      </section>

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title="Delete this contact?"
        message={`Permanently delete this contact and all ${confirmDelete.count} of its posts?`}
        confirmLabel="Delete permanently"
        isBusy={actions.isMutating}
        onCancel={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </main>
  )
}
