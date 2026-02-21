import { useState } from 'react'
import { formatShortDate, getPublishedAtValue, toAssetHref } from '../lib/contacts'

function DiscoveredCardThumb({ src, alt }) {
  const [broken, setBroken] = useState(false)

  if (!src || broken) {
    return <div className="discovered-card-thumb discovered-card-placeholder" />
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
                <DiscoveredCardThumb src={thumbSrc} alt={post.title || 'Discovered video'} />
              </button>
              <div className="discovered-card-body">
                {post.title && <p className="discovered-card-title">{post.title}</p>}
                <p className="discovered-card-date">{formatShortDate(getPublishedAtValue(post))}</p>
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
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
