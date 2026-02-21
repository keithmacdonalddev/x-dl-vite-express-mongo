import { toAssetHref } from '../lib/contacts'

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
          const isAlreadyDownloaded = Boolean(post.downloadedJobId)
          const isThisDownloading = downloadingPostIds.has(post._id)
          const thumbSrc = post.thumbnailPath
            ? toAssetHref(post.thumbnailPath)
            : post.thumbnailUrl || ''
          const canQueue = !isAlreadyDownloaded && !isThisDownloading

          function handleThumbClick() {
            if (!canQueue) return
            onDownload(post._id)
          }

          return (
            <li key={post._id} className={`discovered-card${isAlreadyDownloaded ? ' is-downloaded' : ''}${isThisDownloading ? ' is-downloading' : ''}`}>
              {thumbSrc ? (
                <button
                  type="button"
                  className="discovered-thumb-btn"
                  onClick={handleThumbClick}
                  disabled={!canQueue}
                  title={isAlreadyDownloaded ? 'Already downloaded' : isThisDownloading ? 'Queuing...' : 'Queue this video'}
                >
                  <img
                    className="discovered-card-thumb"
                    src={thumbSrc}
                    alt={post.title || 'Discovered video'}
                    loading="lazy"
                  />
                </button>
              ) : (
                <div className="discovered-card-thumb discovered-card-placeholder" />
              )}
              <div className="discovered-card-body">
                {post.title && <p className="discovered-card-title">{post.title}</p>}
                <div className="discovered-card-actions">
                  {isAlreadyDownloaded ? (
                    <span className="discovered-badge is-done">Downloaded</span>
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
