import { useEffect, useMemo, useRef, useState } from 'react'
import { createJob, getCapabilities, updateCapabilities } from '../../api/jobsApi'
import { detectPlatform, getDefaultCapabilities, normalizeCapabilities, PLATFORMS } from '../../platforms/index'

function logIntakeEvent(stage, details = {}) {
  console.info('[media-vault:intake]', stage, details)
}

export function classifyIntakeUrl(value, capabilities = getDefaultCapabilities()) {
  const nextUrl = String(value || '').trim()
  if (!nextUrl) {
    return { state: 'empty', platform: 'unknown', url: '' }
  }

  const platform = detectPlatform(nextUrl)
  if (platform === 'unknown') {
    return { state: 'invalid', platform, url: nextUrl }
  }
  if (capabilities[platform] !== true) {
    return { state: 'disabled', platform, url: nextUrl }
  }
  return { state: 'ready', platform, url: nextUrl }
}

export function useIntake({ onCreated, onDuplicate }) {
  const postUrlInputRef = useRef(null)
  const [postUrl, setPostUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [platformCapabilities, setPlatformCapabilities] = useState(getDefaultCapabilities)
  const [isUpdatingCapabilities, setIsUpdatingCapabilities] = useState(false)
  const [capabilitiesNote, setCapabilitiesNote] = useState('')
  const [isIntakeSuccessPulse, setIsIntakeSuccessPulse] = useState(false)
  const [duplicateActiveJob, setDuplicateActiveJob] = useState(null)

  const intakeState = useMemo(() => classifyIntakeUrl(postUrl, platformCapabilities), [postUrl, platformCapabilities])
  const hasReadyUrl = intakeState.state === 'ready'

  useEffect(() => {
    const field = postUrlInputRef.current
    if (!field) {
      return
    }
    field.focus()
    field.select()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCapabilities() {
      try {
        const payload = await getCapabilities()
        if (cancelled) return
        const nextCapabilities = normalizeCapabilities(payload)
        setPlatformCapabilities(nextCapabilities)
        setCapabilitiesNote('')
        logIntakeEvent('capabilities-loaded', nextCapabilities)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setPlatformCapabilities(getDefaultCapabilities())
        setCapabilitiesNote('Source flags unavailable. Using default platform support.')
        logIntakeEvent('capabilities-load-error', { message })
      }
    }

    loadCapabilities()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isIntakeSuccessPulse) return
    const timer = setTimeout(() => setIsIntakeSuccessPulse(false), 620)
    return () => clearTimeout(timer)
  }, [isIntakeSuccessPulse])

  async function submitIntakeUrl(nextUrl, source) {
    const classified = classifyIntakeUrl(nextUrl, platformCapabilities)
    if (classified.state === 'empty') {
      logIntakeEvent('submit-skipped-empty', { source })
      return
    }
    if (classified.state === 'invalid') {
      setSubmitError(`Unsupported URL. Supported platforms: ${PLATFORMS.map((p) => p.label).join(', ')}.`)
      logIntakeEvent('submit-skipped-invalid', { source, nextUrl })
      return
    }
    if (classified.state === 'disabled') {
      const p = PLATFORMS.find((pl) => pl.id === classified.platform)
      const label = p ? p.label : classified.platform
      const message = `${label} downloads are disabled by server feature flags.`
      setSubmitError(message)
      logIntakeEvent('submit-skipped-platform-disabled', { source, platform: classified.platform, nextUrl })
      return
    }

    setIsSubmitting(true)
    setSubmitError('')
    setDuplicateActiveJob(null)
    logIntakeEvent('submit-start', { source, nextUrl: classified.url, platform: classified.platform })
    try {
      await createJob(classified.url)
      setPostUrl('')
      setIsIntakeSuccessPulse(true)
      setDuplicateActiveJob(null)
      logIntakeEvent('submit-success', { source, platform: classified.platform })
      if (typeof onCreated === 'function') await onCreated()
    } catch (err) {
      if (err && err.code === 'DUPLICATE_ACTIVE_JOB' && typeof err.existingJobId === 'string' && err.existingJobId) {
        setDuplicateActiveJob({
          jobId: err.existingJobId,
          status: typeof err.existingJobStatus === 'string' ? err.existingJobStatus : 'queued',
        })
        setSubmitError('This URL is already downloading.')
        logIntakeEvent('submit-duplicate-active', {
          source,
          existingJobId: err.existingJobId,
          existingJobStatus: err.existingJobStatus,
        })
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setDuplicateActiveJob(null)
      setSubmitError(message)
      logIntakeEvent('submit-error', { source, message })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    await submitIntakeUrl(postUrl.trim(), 'typed')
  }

  async function handlePasteAndGo(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault()
    logIntakeEvent('paste-and-go-click')
    if (isSubmitting) {
      logIntakeEvent('paste-and-go-skipped-busy', { isSubmitting })
      return
    }

    let clipboardText = ''
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        clipboardText = (await navigator.clipboard.readText()).trim()
        logIntakeEvent('clipboard-read', { hasText: Boolean(clipboardText) })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logIntakeEvent('clipboard-read-error', { message })
      }
    } else {
      logIntakeEvent('clipboard-unavailable')
    }

    if (clipboardText) {
      setPostUrl(clipboardText)
      await submitIntakeUrl(clipboardText, 'clipboard')
      return
    }

    logIntakeEvent('clipboard-empty-fallback-to-typed')
    await submitIntakeUrl(postUrl.trim(), 'typed-fallback')
  }

  async function handleTogglePlatform(platform) {
    if (isUpdatingCapabilities || isSubmitting) return

    const currentValue = platformCapabilities[platform] === true
    const nextValue = !currentValue
    const updatePayload = { [platform]: nextValue }

    setIsUpdatingCapabilities(true)
    setSubmitError('')
    logIntakeEvent('capability-toggle-start', { platform, nextValue })
    try {
      const payload = await updateCapabilities(updatePayload)
      const nextCapabilities = normalizeCapabilities(payload)
      setPlatformCapabilities(nextCapabilities)
      setCapabilitiesNote('')
      logIntakeEvent('capability-toggle-success', nextCapabilities)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSubmitError(message)
      logIntakeEvent('capability-toggle-error', { platform, message })
    } finally {
      setIsUpdatingCapabilities(false)
    }
  }

  function handleViewExistingJob() {
    if (!duplicateActiveJob || typeof onDuplicate !== 'function') {
      return
    }
    onDuplicate(duplicateActiveJob)
  }

  return {
    postUrl,
    setPostUrl,
    postUrlInputRef,
    isSubmitting,
    submitError,
    setSubmitError,
    platformCapabilities,
    isUpdatingCapabilities,
    capabilitiesNote,
    isIntakeSuccessPulse,
    duplicateActiveJob,
    handleViewExistingJob,
    intakeState,
    hasReadyUrl,
    handleSubmit,
    handlePasteAndGo,
    handleTogglePlatform,
  }
}
