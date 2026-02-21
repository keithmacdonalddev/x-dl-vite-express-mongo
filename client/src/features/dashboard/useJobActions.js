import { useState } from 'react'
import {
  bulkDeleteJobs,
  createJob,
  deleteJob,
  updateJob,
} from '../../api/jobsApi'

export function useJobActions({ refresh }) {
  const [isMutating, setIsMutating] = useState(false)
  const [actionError, setActionError] = useState('')
  const [editingJobId, setEditingJobId] = useState('')
  const [editDraftByJobId, setEditDraftByJobId] = useState({})
  const [hiddenJobIds, setHiddenJobIds] = useState({})

  function startEdit(job) {
    setEditingJobId(job._id)
    setEditDraftByJobId((current) => ({
      ...current,
      [job._id]: {
        tweetUrl: job.tweetUrl || '',
        accountDisplayName: job.accountDisplayName || '',
      },
    }))
  }

  function cancelEdit() {
    setEditingJobId('')
  }

  function updateEditDraft(jobId, field, value) {
    setEditDraftByJobId((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] || {}),
        [field]: value,
      },
    }))
  }

  async function submitEdit(event, job) {
    event.preventDefault()
    const draft = editDraftByJobId[job._id] || {}
    const payload = {}

    if (typeof draft.tweetUrl === 'string' && draft.tweetUrl.trim() && draft.tweetUrl.trim() !== job.tweetUrl) {
      payload.tweetUrl = draft.tweetUrl.trim()
    }
    if (typeof draft.accountDisplayName === 'string' && draft.accountDisplayName.trim() !== (job.accountDisplayName || '')) {
      payload.accountDisplayName = draft.accountDisplayName.trim()
    }

    if (Object.keys(payload).length === 0) {
      setEditingJobId('')
      return
    }

    setIsMutating(true)
    setActionError('')
    try {
      await updateJob(job._id, payload)
      setEditingJobId('')
      await refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  async function handleDeleteJob(jobId) {
    setIsMutating(true)
    setActionError('')
    try {
      await deleteJob(jobId)
      setHiddenJobIds((current) => ({ ...current, [jobId]: true }))
      await refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  async function handleBulkDelete(selectedIds, clearSelection) {
    setIsMutating(true)
    setActionError('')
    try {
      await bulkDeleteJobs(selectedIds)
      setHiddenJobIds((current) => {
        const next = { ...current }
        for (const jobId of selectedIds) {
          next[jobId] = true
        }
        return next
      })
      if (typeof clearSelection === 'function') clearSelection()
      await refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  async function handleRetry(tweetUrl) {
    if (!tweetUrl) return
    setIsMutating(true)
    setActionError('')
    try {
      await createJob(tweetUrl)
      await refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsMutating(false)
    }
  }

  function cleanupHiddenIds(currentJobIds) {
    const jobIds = new Set(currentJobIds)
    setHiddenJobIds((current) => {
      const next = {}
      for (const key of Object.keys(current)) {
        if (jobIds.has(key)) {
          next[key] = current[key]
        }
      }
      return next
    })
  }

  return {
    isMutating,
    actionError,
    setActionError,
    editingJobId,
    editDraftByJobId,
    hiddenJobIds,
    startEdit,
    cancelEdit,
    updateEditDraft,
    submitEdit,
    handleDeleteJob,
    handleBulkDelete,
    handleRetry,
    cleanupHiddenIds,
  }
}
