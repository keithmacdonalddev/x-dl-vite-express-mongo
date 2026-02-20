export function JobEditForm({ job, draft, isMutating, onUpdateDraft, onSubmit, onCancel, idPrefix = '' }) {
  const urlId = `${idPrefix}edit-url-${job._id}`
  const displayId = `${idPrefix}edit-display-${job._id}`

  return (
    <form className="edit-form" onSubmit={(event) => onSubmit(event, job)}>
      <label htmlFor={urlId}>Post URL</label>
      <input
        id={urlId}
        type="url"
        value={draft?.tweetUrl || ''}
        onChange={(event) => onUpdateDraft(job._id, 'tweetUrl', event.target.value)}
        required
      />
      <label htmlFor={displayId}>Display name</label>
      <input
        id={displayId}
        type="text"
        value={draft?.accountDisplayName || ''}
        onChange={(event) => onUpdateDraft(job._id, 'accountDisplayName', event.target.value)}
      />
      <div className="row-buttons">
        <button type="submit" disabled={isMutating}>
          {isMutating ? 'Saving...' : 'Save edit'}
        </button>
        <button type="button" className="ghost-btn" onClick={onCancel} disabled={isMutating}>
          Cancel
        </button>
      </div>
    </form>
  )
}
