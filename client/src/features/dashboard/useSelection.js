import { useEffect, useMemo, useState } from 'react'

export function useSelection(allJobIds) {
  const [selectedJobIds, setSelectedJobIds] = useState({})

  const selectedIds = useMemo(
    () => allJobIds.filter((id) => Boolean(selectedJobIds[id])),
    [selectedJobIds, allJobIds]
  )
  const selectedCount = selectedIds.length

  useEffect(() => {
    const validSet = new Set(allJobIds)
    setSelectedJobIds((current) => {
      const keys = Object.keys(current)
      if (!keys.some((id) => !validSet.has(id))) return current
      const next = {}
      for (const id of keys) {
        if (validSet.has(id)) next[id] = current[id]
      }
      return next
    })
  }, [allJobIds])

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
