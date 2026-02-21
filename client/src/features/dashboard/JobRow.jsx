import { motion, useReducedMotion } from 'framer-motion'
import {
  deriveHandleFromUrl,
  makeContactSlug,
  toAssetHref,
} from '../../lib/contacts'
import { JobEditForm } from './JobEditForm'
import { OverflowMenu } from '../../components/OverflowMenu'

function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  if (diffMs < 0) return ''
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function JobRow({
  job,
  isSelected,
  isHighlighted,
  isEditing,
  editDraft,
  isMutating,
  onToggleSelect,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onUpdateEditDraft,
  onDelete,
  onRetry,
  onOpenContact,
  selectMode,
}) {
  const prefersReducedMotion = useReducedMotion()

  const accountHandle =
    job.accountDisplayName ||
    job.accountHandle ||
    deriveHandleFromUrl(job.tweetUrl || '')

  const thumbnailSrc = job.thumbnailPath ? toAssetHref(job.thumbnailPath) : null
  const downloadSrc = job.downloadPath
    ? toAssetHref(job.downloadPath)
    : job.outputPath
      ? toAssetHref(job.outputPath)
      : null
  const isCompleted = job.status === 'completed'
  const isFailed = job.status === 'failed'
  const platform = job.platform
    ? job.platform.charAt(0).toUpperCase() + job.platform.slice(1)
    : ''
  const relativeTime = formatRelativeTime(job.publishedAt || job.createdAt)
  const contactSlug = makeContactSlug(job)

  const rowClasses = [
    'job-row',
    isHighlighted && 'is-highlighted',
    isSelected && 'is-selected',
  ]
    .filter(Boolean)
    .join(' ')

  const checkboxClasses = ['row-checkbox', selectMode && 'is-visible']
    .filter(Boolean)
    .join(' ')

  const menuItems = [
    { label: 'Edit', onClick: () => onStartEdit(job) },
    {
      label: 'Copy URL',
      onClick: () => navigator.clipboard.writeText(job.tweetUrl || ''),
    },
    {
      label: 'Retry',
      onClick: () => onRetry(job.tweetUrl),
      hidden: job.status !== 'failed',
    },
    {
      label: 'Delete',
      onClick: () => onDelete(job._id),
      danger: true,
      disabled: isMutating,
    },
  ]

  return (
    <motion.li
      id={`job-row-${job._id}`}
      className={rowClasses}
      layout={!prefersReducedMotion}
      initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={
        prefersReducedMotion
          ? undefined
          : { opacity: 0, x: -20, transition: { duration: 0.15 } }
      }
    >
      {/* Checkbox */}
      <div className={checkboxClasses}>
        <input
          type="checkbox"
          checked={!!isSelected}
          onChange={() => onToggleSelect(job._id)}
          aria-label={`Select job for ${accountHandle}`}
        />
      </div>

      {/* Thumbnail */}
      {thumbnailSrc ? (
        <img className="job-thumb" src={thumbnailSrc} alt="" />
      ) : (
        <div className="job-thumb-placeholder" />
      )}

      {/* Content */}
      <div className="job-content">
        <div className="job-headline">
          {typeof onOpenContact === 'function' ? (
            <button
              type="button"
              className="job-account-link"
              onClick={() => onOpenContact(contactSlug)}
              title="Open creator profile"
            >
              @{accountHandle || 'unknown'}
            </button>
          ) : (
            <span className="job-account-link">
              @{accountHandle || 'unknown'}
            </span>
          )}
          <span className={`status-chip is-${job.status}`}>{job.status}</span>
        </div>
        <div className="job-meta">
          {platform && <span>{platform}</span>}
          {platform && relativeTime && (
            <span className="job-meta-sep">&middot;</span>
          )}
          {relativeTime && <span>{relativeTime}</span>}
          {isCompleted && downloadSrc && (
            <>
              <span className="job-meta-sep">&middot;</span>
              <a
                className="job-open-link"
                href={downloadSrc}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open file
              </a>
            </>
          )}
        </div>
        {isFailed && job.error && (
          <div className="job-error" title={job.error}>
            {job.error}
          </div>
        )}
      </div>

      {/* Overflow menu */}
      <OverflowMenu items={menuItems} />

      {/* Edit form (spans full row) */}
      {isEditing && (
        <JobEditForm
          job={job}
          draft={editDraft}
          isMutating={isMutating}
          onUpdateDraft={onUpdateEditDraft}
          onSubmit={onSubmitEdit}
          onCancel={onCancelEdit}
        />
      )}
    </motion.li>
  )
}
