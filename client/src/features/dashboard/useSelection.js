import { useMemo, useState } from 'react'

export function useSelection(allJobIds) {
  const [selectedJobIds, setSelectedJobIds] = useState({})

  const selectedIds = useMemo(
    () => allJobIds.filter((id) => Boolean(selectedJobIds[id])),
    [selectedJobIds, allJobIds]
  )
  const selectedCount = selectedIds.length

  function toggleSelection(jobId) {
    setSelectedJobIds((current) => ({
      ...current,
      [jobId]: !current[jobId],
    }))
  }

  function toggleAllSelection() {
    if (selectedCount === allJobIds.length) {
      setSelectedJobIds({})
      return
    }
    const next = {}
    for (const jobId of allJobIds) {
      next[jobId] = true
    }
    setSelectedJobIds(next)
  }

  function clearSelection() {
    setSelectedJobIds({})
  }

  return {
    selectedJobIds,
    selectedIds,
    selectedCount,
    toggleSelection,
    toggleAllSelection,
    clearSelection,
  }
}
