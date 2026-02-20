import { toAssetHref } from '../lib/contacts'

export function DiscoveredGrid({ posts, isDownloading, onDownload }) {
  if (!Array.isArray(posts) || posts.length === 0) return null

  return (
    <section className="discovered-section">
      <div className="discovered-header">
        <h3>Discovered Videos</h3>
        <p>{posts.length} found on profile</p>
      </div>
      <ul className="discovered-grid">
        {posts.map((post) => {
          const isAlreadyDownloaded = Boolean(post.downloadedJobId)
          const thumbSrc = post.thumbnailPath
            ? toAssetHref(post.thumbnailPath)
            : post.thumbnailUrl || ''

          return (
            <li key={post._id} className={`discovered-card${isAlreadyDownloaded ? ' is-downloaded' : ''}`}>
              {thumbSrc ? (
                <img
                  className="discovered-card-thumb"
                  src={thumbSrc}
                  alt={post.title || 'Discovered video'}
                  loading="lazy"
                />
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
                      disabled={isDownloading}
                    >
                      {isDownloading ? 'Queuing...' : 'Download'}
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
