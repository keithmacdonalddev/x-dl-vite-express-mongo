export function getJobStatusNote(job = {}) {
  const status = String(job.status || '')
  const error = typeof job.error === 'string' ? job.error.trim() : ''
  if (status === 'failed') return error || 'Download failed.'
  return 'Download not ready yet.'
}
