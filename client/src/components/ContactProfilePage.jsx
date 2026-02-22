import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteContactProfile,
  downloadDiscoveredPost,
  listDiscoveredPosts,
  openInVlc,
  refreshDiscovery,
  repairThumbnails,
  updateContactProfile,
} from '../api/jobsApi'
import { useJobsPolling } from '../hooks/useJobsPolling'
import {
  buildContacts,
  compareByPublishedAtDesc,
  formatShortDate,
  getPublishedAtValue,
  toAssetHref,
} from '../lib/contacts'
import { useJobActions } from '../features/dashboard/useJobActions'

import { IntakeForm } from '../features/intake/IntakeForm'
import { ConfirmModal } from './ConfirmModal'
import { DiscoveredGrid } from './DiscoveredGrid'

const DISCOVERY_POLL_INTERVAL_MS = 2500
const DISCOVERY_POLL_MAX_ATTEMPTS = 48

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

export function ContactProfilePage({ contactSlug, onBack }) {
  const normalizedSlug = String(contactSlug || '').toLowerCase()
  const { jobs, isLoading, error, refresh } = useJobsPolling({
    intervalMs: 3000,
    view: 'compact',
    limit: 80,
    contactSlug: normalizedSlug,
  })
  const [editContactName, setEditContactName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, mode: '', jobId: '', count: 0 })
  const [discoveredPosts, setDiscoveredPosts] = useState([])
  const [downloadingPostIds, setDownloadingPostIds] = useState(new Set())
  const [isDiscoveryRefreshing, setIsDiscoveryRefreshing] = useState(false)
  const [discoveryRefreshStatus, setDiscoveryRefreshStatus] = useState({ tone: '', text: '' })
  const [isRepairingThumbnails, setIsRepairingThumbnails] = useState(false)
  const refreshRunRef = useRef(0)

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

    for (const job of visibleContactJobs) {
      const outputPath = typeof job.outputPath === 'string' ? job.outputPath.trim() : ''
      const isDownloadedJob = job.status === 'completed' && Boolean(outputPath)
      if (!isDownloadedJob) {
        continue
      }

      const jobId = String(job._id || '')
      const urlKey = normalizeComparableUrl(job.canonicalUrl || job.tweetUrl || '')
      if ((jobId && seenJobIds.has(jobId)) || (urlKey && seenUrls.has(urlKey))) {
        continue
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

    return combined.sort(compareByPublishedAtDesc)
  }, [discoveredPosts, visibleContactJobs])

  useEffect(() => {
    actions.cleanupHiddenIds(contactJobs.map((j) => j._id))
  }, [contactJobs]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDiscoveredPosts = useCallback(async ({ silent = true } = {}) => {
    if (!normalizedSlug) return []
    try {
      const data = await listDiscoveredPosts(normalizedSlug)
      const posts = Array.isArray(data.posts) ? data.posts.slice().sort(compareByPublishedAtDesc) : []
      setDiscoveredPosts(posts)
      return posts
    } catch (err) {
      if (!silent) throw err
      return []
    }
  }, [normalizedSlug])

  useEffect(() => {
    fetchDiscoveredPosts()
  }, [fetchDiscoveredPosts])

  useEffect(() => {
    refreshRunRef.current += 1
    setIsDiscoveryRefreshing(false)
    setDiscoveryRefreshStatus({ tone: '', text: '' })
  }, [normalizedSlug])

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
    if (!normalizedSlug || isDiscoveryRefreshing) return

    const runId = refreshRunRef.current + 1
    refreshRunRef.current = runId
    const isCurrentRun = () => refreshRunRef.current === runId
    const initialCount = discoveredPosts.length

    setIsDiscoveryRefreshing(true)
    setDiscoveryRefreshStatus({ tone: 'info', text: 'Discovery started. Scraping profile...' })

    try {
      await refreshDiscovery(normalizedSlug)

      for (let attempt = 1; attempt <= DISCOVERY_POLL_MAX_ATTEMPTS; attempt += 1) {
        if (!isCurrentRun()) return
        setDiscoveryRefreshStatus({
          tone: 'info',
          text: `Discovery in progress... check ${attempt}/${DISCOVERY_POLL_MAX_ATTEMPTS}`,
        })

        await delay(DISCOVERY_POLL_INTERVAL_MS)
        if (!isCurrentRun()) return

        const posts = await fetchDiscoveredPosts({ silent: false })
        if (!isCurrentRun()) return

        const nextCount = Array.isArray(posts) ? posts.length : 0
        if (nextCount > initialCount) {
          const added = nextCount - initialCount
          setDiscoveryRefreshStatus({
            tone: 'success',
            text: `Discovery complete. Found ${added} new video${added === 1 ? '' : 's'}.`,
          })
          return
        }
      }

      setDiscoveryRefreshStatus({
        tone: 'info',
        text: 'Discovery is still running or no new videos found yet. Check back shortly.',
      })
    } catch (err) {
      if (!isCurrentRun()) return
      const message = err instanceof Error ? err.message : String(err)
      setDiscoveryRefreshStatus({
        tone: 'error',
        text: `Discovery failed: ${message}`,
      })
    } finally {
      if (isCurrentRun()) {
        setIsDiscoveryRefreshing(false)
      }
    }
  }

  async function handleRepairThumbnails() {
    if (!normalizedSlug || isRepairingThumbnails) return
    setIsRepairingThumbnails(true)
    try {
      const result = await repairThumbnails(normalizedSlug)
      const repaired = result.repairedCount || 0
      setDiscoveryRefreshStatus({
        tone: repaired > 0 ? 'success' : 'info',
        text: repaired > 0
          ? `Repaired ${repaired} thumbnail${repaired === 1 ? '' : 's'}.`
          : 'All thumbnails are already present.',
      })
      await fetchDiscoveredPosts()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setDiscoveryRefreshStatus({ tone: 'error', text: `Thumbnail repair failed: ${message}` })
    } finally {
      setIsRepairingThumbnails(false)
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
                  disabled={isDiscoveryRefreshing}
                >
                  {isDiscoveryRefreshing ? 'Discovering...' : 'Discover'}
                </button>
              )}
              <button
                type="button"
                className="ghost-btn"
                onClick={handleRepairThumbnails}
                disabled={isRepairingThumbnails}
              >
                {isRepairingThumbnails ? 'Fixing...' : 'Fix Thumbnails'}
              </button>
            </div>
            {discoveryRefreshStatus.text && (
              <p className={`discovery-refresh-status is-${discoveryRefreshStatus.tone || 'info'}`}>
                {discoveryRefreshStatus.text}
              </p>
            )}
            <button type="button" className="profile-delete-link" onClick={openContactDelete} disabled={actions.isMutating}>
              Delete contact
            </button>
          </div>
          {errorMessage && <p className="error">{errorMessage}</p>}
        </aside>

        <div className="profile-right">
          {isLoading && <p>Loading profile...</p>}
          {!isLoading && (
            <DiscoveredGrid
              posts={unifiedVideoPosts}
              downloadingPostIds={downloadingPostIds}
              onDownload={handleDownloadDiscovered}
              onOpenInVlc={handleOpenInVlc}
              title="Videos"
              emptyMessage="No creator videos found yet. Run discovery to populate candidates."
            />
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
