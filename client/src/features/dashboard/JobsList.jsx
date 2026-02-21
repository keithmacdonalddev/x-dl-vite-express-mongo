import { AnimatePresence } from 'framer-motion'
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
  onRetry,
  onOpenContact,
  highlightedJobId,
  selectMode,
  onToggleSelectMode,
}) {
  return (
    <section className="card">
      <div className="jobs-header">
        <h2>Jobs Timeline</h2>
        <div className="jobs-header-actions">
          <span className="jobs-count">{jobs.length} total</span>
          {jobs.length > 0 && (
            <button
              type="button"
              className="header-select-btn"
              onClick={onToggleSelectMode}
            >
              {selectMode ? 'Done' : 'Select'}
            </button>
          )}
        </div>
      </div>

      {selectMode && selectedCount > 0 && (
        <div className="bulk-toolbar">
          <span className="selected-count">{selectedCount} selected</span>
          <button
            type="button"
            className="ghost-btn"
            onClick={onToggleAllSelection}
          >
            {selectedCount === allJobIds.length ? 'Clear all' : 'Select all'}
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={onOpenBulkDelete}
            disabled={selectedCount === 0 || isMutating}
          >
            Delete selected
          </button>
        </div>
      )}

      {isLoading && <p>Loading jobs...</p>}
      {!isLoading && jobs.length === 0 && <p>No jobs yet.</p>}
      {!isLoading && jobs.length > 0 && (
        <ul className="jobs-list">
          <AnimatePresence mode="popLayout">
            {jobs.map((job) => (
              <JobRow
                key={job._id}
                job={job}
                selectMode={selectMode}
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
                onRetry={onRetry}
                onOpenContact={onOpenContact}
                isHighlighted={highlightedJobId === job._id}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
