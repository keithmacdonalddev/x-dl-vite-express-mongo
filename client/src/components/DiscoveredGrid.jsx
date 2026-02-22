import { useState } from 'react'
import { toAssetHref } from '../lib/contacts'

function isPlaceholderSrc(src) {
  return !src || src.startsWith('data:')
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

export function DiscoveredGrid({ posts, downloadingPostIds, onDownload }) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return (
      <section className="discovered-section">
        <div className="discovered-header">
          <h3>Discovered Videos</h3>
        </div>
        <p className="discovered-empty">
          No discovered posts yet. Download a TikTok video to trigger profile discovery.
        </p>
      </section>
    )
  }

  return (
    <section className="discovered-section">
      <div className="discovered-header">
        <h3>Discovered Videos</h3>
        <p>{posts.length} found on profile</p>
      </div>
      <ul className="discovered-grid">
        {posts.map((post) => {
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
          const canQueue = !isAlreadyDownloaded && !isLinkedActive && !isThisDownloading

          function handleThumbClick() {
            if (!canQueue) return
            onDownload(post._id)
          }

          return (
            <li key={post._id} className={`discovered-card${isAlreadyDownloaded ? ' is-downloaded' : ''}${isThisDownloading ? ' is-downloading' : ''}`}>
              <button
                type="button"
                className="discovered-thumb-btn"
                onClick={handleThumbClick}
                disabled={!canQueue}
                title={
                  isAlreadyDownloaded
                    ? 'Already downloaded'
                    : isLinkedActive
                      ? 'Already queued or downloading'
                      : isThisDownloading
                        ? 'Queuing...'
                        : 'Queue this video'
                }
              >
                <DiscoveredCardThumb src={thumbSrc} alt={post.title || 'Discovered video'} videoId={post.videoId} />
              </button>
              <div className="discovered-card-body">
                <div className="discovered-card-actions">
                  {isAlreadyDownloaded ? (
                    <span className="discovered-badge is-done">Downloaded</span>
                  ) : isLinkedActive ? (
                    <span className="discovered-badge is-active">Queued</span>
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
    </section>
  )
}
