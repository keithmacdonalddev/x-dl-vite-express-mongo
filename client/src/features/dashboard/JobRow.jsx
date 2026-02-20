import {
  deriveHandleFromUrl,
  toAssetHref,
} from '../../lib/contacts'
import { JobEditForm } from './JobEditForm'
import { OverflowMenu } from '../../components/OverflowMenu'

export function JobRow({
  job,
  isSelected,
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
  isHighlighted,
}) {
  const accountLabel =
    job.accountDisplayName ||
    job.accountHandle ||
    deriveHandleFromUrl(job.tweetUrl || '')

  const thumbnailSrc = job.thumbnailPath || (Array.isArray(job.imageUrls) && job.imageUrls[0]) || ''

  const menuItems = [
    { label: 'Edit', onClick: () => onStartEdit(job) },
    { label: 'Copy URL', onClick: () => navigator.clipboard.writeText(job.tweetUrl || '') },
    { label: 'Retry', onClick: () => onRetry(job.tweetUrl), hidden: job.status !== 'failed' },
    { label: 'Delete', onClick: () => onDelete(job._id), danger: true, disabled: isMutating },
  ]

  return (
    <li
      id={`job-row-${job._id}`}
      className={`job-row ${isHighlighted ? 'is-highlighted' : ''}`}
    >
      <div className="row-actions-top">
        <label className="select-box">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(job._id)}
          />
          <span>Select</span>
        </label>
        <OverflowMenu items={menuItems} />
      </div>

      <div className="job-top">
        <div className="job-primary">
          <p className="job-account-label">
            <strong>{accountLabel || 'unknown account'}</strong>
            <span className={`status-chip is-${job.status}`}>{job.status}</span>
          </p>
          {job.status === 'completed' && job.outputPath ? (
            <div className="job-media-preview">
              <video controls preload="metadata" src={toAssetHref(job.outputPath)} />
              <a href={toAssetHref(job.outputPath)} target="_blank" rel="noreferrer">
                Open downloaded file
              </a>
            </div>
          ) : (
            <p className="job-status-note">Download not ready yet.</p>
          )}
        </div>
        {thumbnailSrc && (
          <img
            className="job-thumb"
            src={toAssetHref(thumbnailSrc)}
            alt={accountLabel || 'thumbnail'}
          />
        )}
      </div>

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
    </li>
  )
}
