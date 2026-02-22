import { useEffect, useMemo, useRef, useState } from 'react'
import { toAssetHref } from '../lib/contacts'
import { OverflowMenu } from './OverflowMenu'

function isPlaceholderSrc(src) {
  return !src || src.startsWith('data:')
}

function getDownloadOutputPath(post) {
  if (!post || typeof post !== 'object') {
    return ''
  }
  if (typeof post.downloadOutputPath === 'string' && post.downloadOutputPath.trim()) {
    return post.downloadOutputPath
  }
  if (typeof post.outputPath === 'string' && post.outputPath.trim()) {
    return post.outputPath
  }
  return ''
}

function buildVlcHref(videoHref) {
  if (!videoHref || typeof window === 'undefined') {
    return ''
  }
  try {
    const absoluteUrl = new URL(videoHref, window.location.origin).toString()
    return `vlc://${absoluteUrl}`
  } catch {
    return ''
  }
}

function getPrimaryPostUrl(post) {
  if (!post || typeof post !== 'object') {
    return ''
  }
  const postUrl = typeof post.postUrl === 'string' ? post.postUrl.trim() : ''
  if (postUrl) {
    return postUrl
  }
  const canonicalUrl = typeof post.canonicalUrl === 'string' ? post.canonicalUrl.trim() : ''
  return canonicalUrl
}

function formatPublishedLabel(value) {
  if (!value) return 'n/a'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'n/a'
  return date.toLocaleString()
}

function copyTextToClipboard(text) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (!value || typeof navigator === 'undefined') {
    return
  }

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(value).catch(() => {})
    return
  }

  if (typeof document !== 'undefined') {
    const input = document.createElement('textarea')
    input.value = value
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.focus()
    input.select()
    try {
      document.execCommand('copy')
    } catch {
      // Ignore copy fallback failures.
    }
    document.body.removeChild(input)
  }
}

function VlcIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3L16 11H8L12 3Z" fill="currentColor" />
      <path d="M9.4 12.5H14.6L16.4 17H7.6L9.4 12.5Z" fill="currentColor" opacity="0.8" />
      <rect x="6" y="18" width="12" height="3" rx="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

function DiscoveredCardThumb({ src, alt, videoId }) {
  const [broken, setBroken] = useState(false)

  if (isPlaceholderSrc(src) || broken) {
    const shortId = videoId
      ? videoId.length > 12 ? `...${videoId.slice(-10)}` : videoId
      : null
    return (
      <div className="discovered-card-thumb discovered-card-placeholder">
        <svg className="discovered-placeholder-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <polygon points="10,8.5 16,12 10,15.5" fill="currentColor" />
        </svg>
        {shortId && <span className="discovered-placeholder-id">{shortId}</span>}
      </div>
    )
  }

  return (
    <img
      className="discovered-card-thumb"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  )
}

export function DiscoveredGrid({
  posts,
  downloadingPostIds,
  onDownload,
  onOpenInVlc,
  initialOpenDownloadedJobId = '',
  size = 'medium',
  title = 'Discovered Videos',
  emptyMessage = 'No discovered posts yet. Download a TikTok video to trigger profile discovery.',
}) {
  const safePosts = useMemo(() => (Array.isArray(posts) ? posts : []), [posts])
  const normalizedSize = size === 'small' || size === 'large' ? size : 'medium'
  const [activeVideoPostId, setActiveVideoPostId] = useState('')
  const [activeMetaPostId, setActiveMetaPostId] = useState('')
  const autoOpenedJobIdRef = useRef('')

  const playableHrefByPostId = useMemo(() => {
    const hrefById = new Map()
    for (const post of safePosts) {
      const hasVerifiedDownloaded = typeof post.isDownloaded === 'boolean'
      const isAlreadyDownloaded = hasVerifiedDownloaded
        ? post.isDownloaded
        : Boolean(post.downloadedJobId)
      if (!isAlreadyDownloaded) {
        continue
      }

      const outputPath = getDownloadOutputPath(post)
      const href = toAssetHref(outputPath)
      if (href) {
        hrefById.set(post._id, href)
      }
    }
    return hrefById
  }, [safePosts])

  const activeVideoPost = safePosts.find((post) => post._id === activeVideoPostId) || null
  const activeVideoHref = activeVideoPost ? (playableHrefByPostId.get(activeVideoPost._id) || '') : ''
  const activeVideoOutputPath = getDownloadOutputPath(activeVideoPost)
  const activeVideoVlcHref = useMemo(() => buildVlcHref(activeVideoHref), [activeVideoHref])
  const canOpenActiveInVlc = Boolean(activeVideoVlcHref || activeVideoOutputPath)
  const activeMetaPost = safePosts.find((post) => post._id === activeMetaPostId) || null
  const activeDownloadCount = useMemo(() => {
    let count = 0
    for (const post of safePosts) {
      const hasVerifiedDownloaded = typeof post.isDownloaded === 'boolean'
      const isAlreadyDownloaded = hasVerifiedDownloaded
        ? post.isDownloaded
        : Boolean(post.downloadedJobId)
      const isLinkedActive = !isAlreadyDownloaded && Boolean(post.downloadedJobId)
      const isThisDownloading = downloadingPostIds.has(post._id)
      if (isLinkedActive || isThisDownloading) {
        count += 1
      }
    }
    return count
  }, [downloadingPostIds, safePosts])

  useEffect(() => {
    if (!activeVideoPostId && !activeMetaPostId) return

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setActiveVideoPostId('')
        setActiveMetaPostId('')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeVideoPostId, activeMetaPostId])

  useEffect(() => {
    const targetJobId = typeof initialOpenDownloadedJobId === 'string'
      ? initialOpenDownloadedJobId.trim()
      : ''

    if (!targetJobId) {
      autoOpenedJobIdRef.current = ''
      return
    }

    if (autoOpenedJobIdRef.current === targetJobId) {
      return
    }

    const matchingPost = safePosts.find((post) => {
      const downloadedJobId = post && post.downloadedJobId ? String(post.downloadedJobId).trim() : ''
      return downloadedJobId === targetJobId && playableHrefByPostId.has(post._id)
    })

    if (!matchingPost) {
      return
    }

    const timerId = setTimeout(() => {
      setActiveVideoPostId(matchingPost._id)
      autoOpenedJobIdRef.current = targetJobId
    }, 0)

    return () => {
      clearTimeout(timerId)
    }
  }, [initialOpenDownloadedJobId, playableHrefByPostId, safePosts])

  function closePlayerModal() {
    setActiveVideoPostId('')
  }

  function closeMetadataModal() {
    setActiveMetaPostId('')
  }

  function openVlcWithFallback(outputPath, fallbackHref, event) {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }

    if (typeof onOpenInVlc === 'function' && outputPath) {
      Promise.resolve(onOpenInVlc(outputPath, fallbackHref)).catch(() => {})
      return
    }

    if (fallbackHref && typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
      window.location.assign(fallbackHref)
    }
  }

  if (safePosts.length === 0) {
    return (
      <section className={`discovered-section is-size-${normalizedSize}`}>
        <div className="discovered-header">
          <h3>{title}</h3>
        </div>
        <p className="discovered-empty">{emptyMessage}</p>
      </section>
    )
  }

  return (
    <section className={`discovered-section is-size-${normalizedSize}`}>
      <div className="discovered-header">
        <h3>{title}</h3>
        <p>
          {safePosts.length} found on profile
          {activeDownloadCount > 0 ? ` • ${activeDownloadCount} downloading` : ''}
        </p>
      </div>
      <ul className="discovered-grid">
        {safePosts.map((post) => {
          const hasVerifiedDownloaded = typeof post.isDownloaded === 'boolean'
          const isAlreadyDownloaded = hasVerifiedDownloaded
            ? post.isDownloaded
            : Boolean(post.downloadedJobId)
          const isRemovedFromSource = Boolean(post.isRemovedFromSource || post.removedFromSourceAt)
          const isProfileRemovedFromSource = Boolean(
            post.isProfileRemovedFromSource || post.profileRemovedFromSourceAt
          )
          const isLinkedActive = !isAlreadyDownloaded && Boolean(post.downloadedJobId)
          const isThisDownloading = downloadingPostIds.has(post._id)
          const thumbSrc = post.thumbnailPath
            ? toAssetHref(post.thumbnailPath)
            : post.thumbnailUrl || ''
          const outputPath = getDownloadOutputPath(post)
          const playableHref = playableHrefByPostId.get(post._id) || ''
          const vlcHref = buildVlcHref(playableHref)
          const canPlayInBrowser = Boolean(playableHref)
          const canOpenInVlc = Boolean(vlcHref || outputPath)
          const canQueue = !isAlreadyDownloaded && !isLinkedActive && !isThisDownloading
          const canThumbAction = canQueue || canPlayInBrowser
          const isActiveDownload = isLinkedActive || isThisDownloading
          const postUrl = getPrimaryPostUrl(post)
          const canonicalUrl = typeof post.canonicalUrl === 'string' ? post.canonicalUrl.trim() : ''
          const videoId = typeof post.videoId === 'string' ? post.videoId.trim() : ''
          const publishedLabel = formatPublishedLabel(post.publishedAt || post.createdAt)
          const statusLabel = isAlreadyDownloaded
            ? 'Downloaded'
            : isLinkedActive
              ? 'Queued'
              : isThisDownloading
                ? 'Queuing'
                : 'Ready to download'

          function handleThumbClick() {
            if (canPlayInBrowser) {
              setActiveVideoPostId(post._id)
              return
            }
            if (canQueue) {
              onDownload(post._id)
            }
          }

          const menuItems = [
            { label: 'View metadata', onClick: () => setActiveMetaPostId(post._id) },
            {
              label: 'Open source post',
              onClick: () => {
                if (postUrl && typeof window !== 'undefined' && typeof window.open === 'function') {
                  window.open(postUrl, '_blank', 'noopener,noreferrer')
                }
              },
              hidden: !postUrl,
            },
            {
              label: 'Copy post URL',
              onClick: () => copyTextToClipboard(postUrl),
              hidden: !postUrl,
            },
            {
              label: 'Copy canonical URL',
              onClick: () => copyTextToClipboard(canonicalUrl),
              hidden: !canonicalUrl || canonicalUrl === postUrl,
            },
            {
              label: 'Copy video ID',
              onClick: () => copyTextToClipboard(videoId),
              hidden: !videoId,
            },
            {
              label: `Published: ${publishedLabel}`,
              onClick: () => {},
              disabled: true,
            },
            {
              label: `Status: ${statusLabel}`,
              onClick: () => {},
              disabled: true,
            },
          ]

          return (
            <li key={post._id} className={`discovered-card${isThisDownloading ? ' is-downloading' : ''}${isActiveDownload ? ' is-active-download' : ''}${isRemovedFromSource ? ' is-removed-from-source' : ''}`}>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="discovered-thumb-btn"
                  onClick={handleThumbClick}
                  disabled={isRemovedFromSource || !canThumbAction}
                  title={
                    isRemovedFromSource
                      ? 'This post has been removed from the source'
                      : canPlayInBrowser
                        ? 'Play in browser'
                        : isAlreadyDownloaded
                          ? 'Downloaded file unavailable'
                        : isLinkedActive
                          ? 'Download in progress'
                        : isThisDownloading
                            ? 'Queuing...'
                            : 'Queue this video'
                  }
                >
                  <DiscoveredCardThumb src={thumbSrc} alt={post.title || 'Discovered video'} videoId={post.videoId} />
                </button>
                {isRemovedFromSource && (
                  <span className="discovered-badge-overlay is-removed">Removed</span>
                )}
              </div>
              <div className="discovered-card-body">
                <div className="discovered-card-actions">
                  <div className="discovered-main-action">
                    {isRemovedFromSource ? (
                      <button className="discovered-btn-unavailable" disabled>Unavailable</button>
                    ) : isAlreadyDownloaded ? (
                      <>
                        <button
                          type="button"
                          className="discovered-play-btn"
                          onClick={() => setActiveVideoPostId(post._id)}
                          disabled={!canPlayInBrowser}
                        >
                          Play
                        </button>
                        {canOpenInVlc && (
                          <a
                            className="discovered-vlc-link"
                            href={vlcHref}
                            aria-label="Open in VLC"
                            title="Open in VLC"
                            onClick={(event) => openVlcWithFallback(outputPath, vlcHref, event)}
                          >
                            <VlcIcon />
                          </a>
                        )}
                      </>
                    ) : isLinkedActive ? (
                      <span className="discovered-badge is-active is-pulse">Downloading</span>
                    ) : (
                      <button
                        type="button"
                        className="discovered-download-btn"
                        onClick={() => onDownload(post._id)}
                        disabled={isThisDownloading}
                      >
                        {isThisDownloading ? 'Queuing...' : 'Download'}
                      </button>
                    )}
                  </div>
                  <OverflowMenu items={menuItems} />
                </div>
                {isRemovedFromSource && (
                  <p className="discovered-source-note is-removed">Removed on TikTok</p>
                )}
                {isProfileRemovedFromSource && (
                  <p className="discovered-source-note is-profile-removed">Creator profile unavailable on TikTok</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {activeVideoPost && activeVideoHref && (
        <div
          className="modal-overlay discovered-player-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={activeVideoPost.title || 'Downloaded video'}
          onClick={closePlayerModal}
        >
          <div className="modal-card discovered-player-modal" onClick={(event) => event.stopPropagation()}>
            <div className="discovered-player-header">
              <h3>{activeVideoPost.title || 'Downloaded video'}</h3>
              <button type="button" className="ghost-btn discovered-player-close" onClick={closePlayerModal}>
                Close
              </button>
            </div>
            <video
              className="discovered-player-video"
              controls
              autoPlay
              muted
              playsInline
              preload="metadata"
              src={activeVideoHref}
            />
            {canOpenActiveInVlc && (
              <div className="discovered-player-actions">
                <a
                  className="ghost-btn discovered-vlc-cta"
                  href={activeVideoVlcHref}
                  title="Open this video in VLC"
                  onClick={(event) => openVlcWithFallback(activeVideoOutputPath, activeVideoVlcHref, event)}
                >
                  <VlcIcon />
                  <span>Open in VLC</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
      {activeMetaPost && (
        <div
          className="modal-overlay discovered-meta-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Post metadata"
          onClick={closeMetadataModal}
        >
          <div className="modal-card discovered-meta-modal" onClick={(event) => event.stopPropagation()}>
            <div className="discovered-player-header">
              <h3>Post metadata</h3>
              <button type="button" className="ghost-btn discovered-player-close" onClick={closeMetadataModal}>
                Close
              </button>
            </div>
            <dl className="discovered-meta-list">
              <div>
                <dt>Published</dt>
                <dd>{formatPublishedLabel(activeMetaPost.publishedAt || activeMetaPost.createdAt)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {activeMetaPost.isDownloaded
                    ? 'Downloaded'
                    : activeMetaPost.downloadedJobId
                      ? 'Queued'
                      : 'Ready to download'}
                </dd>
              </div>
              <div>
                <dt>Post URL</dt>
                <dd>
                  {getPrimaryPostUrl(activeMetaPost) ? (
                    <a href={getPrimaryPostUrl(activeMetaPost)} target="_blank" rel="noreferrer">
                      {getPrimaryPostUrl(activeMetaPost)}
                    </a>
                  ) : 'n/a'}
                </dd>
              </div>
              <div>
                <dt>Canonical URL</dt>
                <dd>{activeMetaPost.canonicalUrl || 'n/a'}</dd>
              </div>
              <div>
                <dt>Video ID</dt>
                <dd>{activeMetaPost.videoId || 'n/a'}</dd>
              </div>
              <div>
                <dt>Output path</dt>
                <dd>{getDownloadOutputPath(activeMetaPost) || 'n/a'}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </section>
  )
}
