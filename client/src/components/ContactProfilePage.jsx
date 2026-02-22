import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteContactProfile,
  deleteDiscoveredPost,
  downloadDiscoveredPost,
  getJob,
  listDiscoveredPosts,
  openInVlc,
  refreshDiscovery,
  repairThumbnails,
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

function normalizeComparableUrl(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed)
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase()
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase()
  }
}

export function ContactProfilePage({
  contactSlug,
  onBack,
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
  })
  const [editContactName, setEditContactName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, mode: '', jobId: '', count: 0 })
  const [discoveredPosts, setDiscoveredPosts] = useState(() => readCachedDiscoveredPosts(normalizedSlug))
  const [downloadingPostIds, setDownloadingPostIds] = useState(new Set())
  const [discoveryTraceId, setDiscoveryTraceId] = useState('')
  const [syncTraceId, setSyncTraceId] = useState('')
  const [initialOpenJob, setInitialOpenJob] = useState(null)
  const [thumbnailSize, setThumbnailSize] = useState('large')

  const discoveryProgress = useDiscoveryProgress(discoveryTraceId, 'discover')
  const syncProgress = useDiscoveryProgress(syncTraceId, 'sync')

  const anyOperationActive = discoveryProgress.phase !== 'idle' || syncProgress.phase !== 'idle'

  const actions = useJobActions({ refresh })
  const contacts = useMemo(() => buildContacts(jobs), [jobs])

  const contact = useMemo(
    () => contacts.find((value) => value.slug === normalizedSlug),
    [contacts, normalizedSlug]
  )

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

      const matchingIndex = urlKey
        ? combined.findIndex((post) => normalizeComparableUrl(post?.canonicalUrl || post?.postUrl || '') === urlKey)
        : -1

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

  const fetchDiscoveredPosts = useCallback(async ({ silent = true } = {}) => {
    if (!normalizedSlug) return []
    try {
      const data = await listDiscoveredPosts(normalizedSlug)
      const posts = Array.isArray(data.posts) ? data.posts.slice().sort(compareByPublishedAtDesc) : []
      setDiscoveredPosts(posts)
      writeCachedDiscoveredPosts(normalizedSlug, posts)
      return posts
    } catch (err) {
      if (!silent) throw err
      return []
    }
  }, [normalizedSlug])

  useEffect(() => {
    setDiscoveredPosts(readCachedDiscoveredPosts(normalizedSlug))
  }, [normalizedSlug])

  useEffect(() => {
    fetchDiscoveredPosts()
  }, [fetchDiscoveredPosts])

  useEffect(() => {
    if (!normalizedSlug) return () => {}

    const intervalId = setInterval(() => {
      fetchDiscoveredPosts()
    }, 3000)

    return () => {
      clearInterval(intervalId)
    }
  }, [fetchDiscoveredPosts, normalizedSlug])

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
      fetchDiscoveredPosts()
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
      fetchDiscoveredPosts()
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
      await fetchDiscoveredPosts()
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
      await deleteDiscoveredPost(postId)
      setDiscoveredPosts((prev) => prev.filter((p) => p._id !== postId))
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

  const errorMessage = actions.actionError || error

  return (
    <main className="app">
      <header className="hero is-profile">
        <button type="button" className="back-breadcrumb" onClick={onBack}>
          &larr; Dashboard
        </button>
        <p className="eyebrow">creator profile</p>
        <h1>{contact?.displayName || contact?.handle || `@${contactSlug}`}</h1>
        <p className="subhead">
          Captured posts, media, and metadata.
        </p>
        <div className="hero-intake-wrap is-compact">
          <IntakeForm onCreated={refresh} isBusy={actions.isMutating} compact />
        </div>
      </header>

      <section className="layout profile-layout">
        <aside className="card profile-summary">
          <h2>Profile Summary</h2>
          <img
            className="profile-avatar"
            src={toAssetHref(contact?.avatarPath)}
            alt={contact?.displayName || contact?.handle || contact?.slug}
            onError={(e) => {
              const fallback = toAssetHref(contact?.latestThumbnail)
              if (fallback && e.target.src !== fallback) {
                e.target.src = fallback
              } else {
                e.target.style.display = 'none'
              }
            }}
          />
          <p><strong>Handle:</strong> {contact?.handle || 'n/a'}</p>
          <p><strong>Platform:</strong> {contact?.platform || 'unknown'}</p>
          <p>
            <strong>Source profile:</strong>{' '}
            {contact?.profileRemovedFromSourceAt
              ? `Unavailable on TikTok (${formatShortDate(contact.profileRemovedFromSourceAt)})`
              : 'Not flagged'}
          </p>
          <p><strong>Total jobs:</strong> {contact?.totalJobs || 0}</p>
          <p><strong>Completed:</strong> {contact?.completedJobs || 0}</p>
          <p><strong>First seen:</strong> {formatShortDate(contact?.firstSeenAt)}</p>
          <p><strong>Latest:</strong> {formatShortDate(contact?.latestAt)}</p>
          <div className="profile-actions-area">
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
            <div className="profile-actions-row">
              {contact?.platform === 'tiktok' && (
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
            <button type="button" className="profile-delete-link" onClick={openContactDelete} disabled={actions.isMutating}>
              Delete contact
            </button>
          </div>
          {errorMessage && <p className="error">{errorMessage}</p>}
        </aside>

        <div className="profile-right">
          {isLoading && unifiedVideoPosts.length === 0 && <p>Loading profile...</p>}
          <div className="profile-video-toolbar">
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
          <DiscoveredGrid
            posts={unifiedVideoPosts}
            downloadingPostIds={downloadingPostIds}
            onDownload={handleDownloadDiscovered}
            onDelete={handleDeleteDiscovered}
            onOpenInVlc={handleOpenInVlc}
            initialOpenDownloadedJobId={initialOpenJobId}
            onInitialOpenConsumed={onConsumeInitialOpenJobId}
            size={thumbnailSize}
            title="Videos"
            emptyMessage="No creator videos found yet. Run discovery to populate candidates."
          />
          {isLoading && unifiedVideoPosts.length > 0 && (
            <p className="subtle-note">Refreshing profile data...</p>
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
