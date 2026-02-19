import { JobRow } from './JobRow'
import './dashboard.css'

export function JobsList({
  jobs,
  isLoading,
  error,
  selectedJobIds,
  selectedCount,
  allJobIds,
  editingJobId,
  editDraftByJobId,
  isMutating,
  onToggleSelect,
  onToggleAllSelection,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onUpdateEditDraft,
  onOpenSingleDelete,
  onOpenBulkDelete,
  highlightedJobId,
}) {
  return (
    <section className="card">
      <div className="jobs-header">
        <h2>Jobs Timeline</h2>
        <p>{jobs.length} total</p>
      </div>

      <div className="bulk-toolbar">
        <button type="button" className="ghost-btn" onClick={onToggleAllSelection} disabled={jobs.length === 0}>
          {selectedCount === allJobIds.length && allJobIds.length > 0 ? 'Clear all' : 'Select all'}
        </button>
        <button
          type="button"
          className="danger-btn"
          onClick={onOpenBulkDelete}
          disabled={selectedCount === 0 || isMutating}
        >
          Delete selected ({selectedCount})
        </button>
      </div>

      {isLoading && <p>Loading jobs...</p>}
      {!isLoading && jobs.length === 0 && <p>No jobs yet.</p>}
      {!isLoading && jobs.length > 0 && (
        <ul className="jobs-list">
          {jobs.map((job) => (
            <JobRow
              key={job._id}
              job={job}
              isSelected={Boolean(selectedJobIds[job._id])}
              isEditing={editingJobId === job._id}
              editDraft={editDraftByJobId[job._id]}
              isMutating={isMutating}
              onToggleSelect={onToggleSelect}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSubmitEdit={onSubmitEdit}
              onUpdateEditDraft={onUpdateEditDraft}
              onDelete={onOpenSingleDelete}
              isHighlighted={highlightedJobId === job._id}
            />
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
