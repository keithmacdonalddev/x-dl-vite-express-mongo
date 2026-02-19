import {
  deriveHandleFromUrl,
  toAssetHref,
} from '../../lib/contacts'
import { JobEditForm } from './JobEditForm'

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
  isHighlighted,
}) {
  const accountLabel =
    job.accountDisplayName ||
    job.accountHandle ||
    deriveHandleFromUrl(job.tweetUrl || '')

  const thumbnailSrc = job.thumbnailPath || (Array.isArray(job.imageUrls) && job.imageUrls[0]) || ''

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
        <div className="row-buttons">
          <button type="button" className="ghost-btn small-btn" onClick={() => onStartEdit(job)}>
            Edit
          </button>
          <button
            type="button"
            className="danger-btn small-btn"
            onClick={() => onDelete(job._id)}
            disabled={isMutating}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="job-top">
        <div className="job-primary">
          <p className="job-account-label">
            <strong>{accountLabel || 'unknown account'}</strong>
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
