/**
 * Translates raw telemetry event entries into human-readable descriptions.
 * Returns { text: string, icon: string } where icon is a plain-text indicator.
 */

function fmtBytes(bytes) {
  if (bytes == null) return null
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function fmtSec(ms) {
  if (ms == null) return null
  return `${(ms / 1000).toFixed(1)}s`
}

const translations = {
  // --- HTTP ---
  'http.request.started': (m) => ({ text: `HTTP ${m.method || ''} ${m.path || ''}`.trim(), icon: '\u2192' }),
  'http.request.completed': (m) => ({ text: `HTTP ${m.method || ''} ${m.path || ''} \u2014 ${m.statusCode || '?'} (${fmtSec(m.durationMs) || '?'})`, icon: '\u2713' }),

  // --- Job creation ---
  'jobs.create.request_received': (m) => ({ text: `New download request for ${m.tweetUrl || 'unknown URL'}`, icon: '\u2192' }),
  'jobs.create.invalid_url': (m) => ({ text: `Invalid URL rejected: ${m.tweetUrl || '?'}`, icon: '\u2717' }),
  'jobs.create.platform_disabled': (m) => ({ text: `Platform ${m.platform || '?'} is disabled`, icon: '\u2717' }),
  'jobs.create.db_not_connected': () => ({ text: 'Database not connected \u2014 cannot create job', icon: '\u2717' }),
  'jobs.create.queued': (m) => ({ text: `Job queued for ${m.accountHandle ? '@' + m.accountHandle : m.tweetUrl || '?'} (${m.platform || '?'})`, icon: '\u2713' }),
  'jobs.create.duplicate_active': () => ({ text: 'URL already has an active download job', icon: '\u26a0' }),
  'jobs.create.duplicate_completed': () => ({ text: 'URL already has a completed download job', icon: '\u26a0' }),
  'jobs.create.duplicate_race_resolved': () => ({ text: 'Duplicate job race detected; reused existing job', icon: '\u26a0' }),
  'jobs.create.failed': (m) => ({ text: `Failed to create job: ${m.message || 'unknown error'}`, icon: '\u2717' }),

  // --- Job list/detail ---
  'jobs.list.failed': (m) => ({ text: `Failed to list jobs: ${m.message || '?'}`, icon: '\u2717' }),
  'jobs.detail.failed': (m) => ({ text: `Failed to load job details: ${m.message || '?'}`, icon: '\u2717' }),

  // --- Bulk/delete ---
  'jobs.bulk_delete.failed': (m) => ({ text: `Bulk delete failed: ${m.message || '?'}`, icon: '\u2717' }),
  'jobs.delete.failed': (m) => ({ text: `Delete failed: ${m.message || '?'}`, icon: '\u2717' }),

  // --- Contact updates ---
  'jobs.contact.update.failed': (m) => ({ text: `Contact update failed: ${m.message || '?'}`, icon: '\u2717' }),
  'jobs.contact.delete.failed': (m) => ({ text: `Contact delete failed: ${m.message || '?'}`, icon: '\u2717' }),

  // --- Manual retry ---
  'jobs.manual_retry.invalid_media_url': () => ({ text: 'Manual retry rejected \u2014 invalid media URL', icon: '\u2717' }),
  'jobs.manual_retry.failed': (m) => ({ text: `Manual retry failed: ${m.message || '?'}`, icon: '\u2717' }),

  // --- Job update ---
  'jobs.update.platform_disabled': (m) => ({ text: `Cannot update \u2014 ${m.platform || '?'} is disabled`, icon: '\u2717' }),
  'jobs.update.failed': (m) => ({ text: `Job update failed: ${m.message || '?'}`, icon: '\u2717' }),
  'jobs.status.update.failed': (m) => ({ text: `Status update failed: ${m.message || '?'}`, icon: '\u2717' }),

  // --- Worker ---
  'worker.claim.skipped.db_not_connected': () => ({ text: 'Worker skipped \u2014 database not connected', icon: '\u26a0' }),
  'worker.job.claimed': (m) => {
    const parts = ['Worker picked up the job']
    if (m.attempt) parts.push(`(attempt #${m.attempt})`)
    if (m.waitMs) parts.push(`waited ${fmtSec(m.waitMs)}`)
    return { text: parts.join(' \u2014 '), icon: '\u2192' }
  },
  'worker.started': (m) => ({ text: `Worker started (polling every ${m.intervalMs || '?'}ms)`, icon: '\u2713' }),
  'worker.stopped': () => ({ text: 'Worker stopped', icon: '\u2717' }),
  'worker.tick.skipped': (m) => ({ text: `Worker busy \u2014 ${m.skippedTicks || '?'} ticks skipped (job may be slow)`, icon: '\u26a0' }),
  'worker.tick.failed': (m) => ({ text: `Worker tick error: ${m.message || '?'}`, icon: '\u2717' }),

  // --- Processing ---
  'worker.job.processing_started': (m) => ({ text: `Processing started${m.attempt ? ` (attempt #${m.attempt})` : ''}`, icon: '\u2192' }),
  'worker.job.extraction.reused': () => ({ text: 'Reusing previous extraction result', icon: '\u2192' }),
  'worker.job.extraction.started': () => ({ text: 'Starting media extraction via browser...', icon: '\u2192' }),
  'worker.job.extraction.completed': (m) => ({ text: `Extraction complete${m.durationMs ? ` (${fmtSec(m.durationMs)})` : ''}`, icon: '\u2713' }),
  'worker.job.extraction.empty_media_url': () => ({ text: 'No usable media URL found after extraction', icon: '\u2717' }),
  'worker.job.progress.saved': () => ({ text: 'Progress saved to database', icon: '\u2192' }),

  // --- Download ---
  'worker.job.download.started': (m) => ({ text: `Starting download...${m.mode ? ` (${m.mode})` : ''}`, icon: '\u2192' }),
  'worker.job.download.access_denied.retrying_with_refreshed_extraction': () => ({ text: 'Access denied \u2014 re-extracting with fresh URL...', icon: '\u26a0' }),
  'worker.job.download.refreshed_extraction.completed': (m) => ({ text: `Fresh extraction complete${m.durationMs ? ` (${fmtSec(m.durationMs)})` : ''}`, icon: '\u2713' }),
  'worker.job.download.completed': (m) => {
    const parts = ['Download finished']
    if (m.bytes) parts.push(fmtBytes(m.bytes))
    if (m.durationMs) parts.push(fmtSec(m.durationMs))
    return { text: parts.join(' \u2014 '), icon: '\u2713' }
  },
  'worker.job.download.empty_output': () => ({ text: 'Download produced an empty file', icon: '\u2717' }),
  'worker.job.download.wrong_content_type': (m) => ({ text: `Download returned ${m.contentType || '?'} instead of video \u2014 URL may have expired`, icon: '\u2717' }),
  'worker.job.download.suspiciously_small': (m) => ({ text: `Download is only ${fmtBytes(m.bytes) || '?'} \u2014 likely not a valid video`, icon: '\u2717' }),

  // --- Download validation retry ---
  'worker.job.download.validation_failed': (m) => ({ text: `Download invalid: ${m.reason || '?'} \u2014 retrying...`, icon: '\u26a0' }),
  'worker.job.download.cleanup_failed': (m) => ({ text: `Cleanup failed: ${m.message || '?'}`, icon: '\u26a0' }),
  'worker.job.download.validation_retry.auth_attempt': () => ({ text: 'Retrying download with browser session cookies...', icon: '\u2192' }),
  'worker.job.download.validation_retry.auth_succeeded': (m) => ({ text: `Browser session download succeeded${m.bytes ? ` (${fmtBytes(m.bytes)})` : ''}`, icon: '\u2713' }),
  'worker.job.download.validation_retry.auth_still_invalid': (m) => ({ text: `Browser session download still invalid: ${m.reason || '?'}`, icon: '\u2717' }),
  'worker.job.download.validation_retry.auth_failed': (m) => ({ text: `Browser session download failed: ${m.message || '?'}`, icon: '\u2717' }),
  'worker.job.download.validation_retry.browser_nav_attempt': () => ({ text: 'Retrying with full browser download (native TLS)...', icon: '\u2192' }),
  'worker.job.download.validation_retry.browser_nav_succeeded': (m) => ({ text: `Browser download succeeded${m.bytes ? ` (${fmtBytes(m.bytes)})` : ''}!`, icon: '\u2713' }),
  'worker.job.download.validation_retry.browser_nav_still_invalid': (m) => ({ text: `Browser download still invalid: ${m.reason || '?'}`, icon: '\u2717' }),
  'worker.job.download.validation_retry.browser_nav_failed': (m) => ({ text: `Browser download attempt failed: ${m.message || '?'}`, icon: '\u2717' }),
  'worker.job.download.validation_retry.re_extracting': () => ({ text: 'Re-extracting fresh media URL from page...', icon: '\u2192' }),
  'worker.job.download.validation_retry.re_extracted': (m) => ({ text: `Fresh URL extracted${m.changedMediaUrl ? ' (new URL)' : ' (same URL)'}${m.durationMs ? ` (${fmtSec(m.durationMs)})` : ''}`, icon: m.changedMediaUrl ? '\u2713' : '\u26a0' }),
  'worker.job.download.validation_retry.fresh_auth_succeeded': (m) => ({ text: `Fresh URL + browser session succeeded${m.bytes ? ` (${fmtBytes(m.bytes)})` : ''}`, icon: '\u2713' }),
  'worker.job.download.validation_retry.succeeded': (m) => ({ text: `Retry download succeeded${m.bytes ? ` (${fmtBytes(m.bytes)})` : ''}`, icon: '\u2713' }),

  // --- Thumbnail ---
  'worker.job.thumbnail.started': () => ({ text: 'Generating thumbnail...', icon: '\u2192' }),
  'worker.job.thumbnail.completed': () => ({ text: 'Thumbnail generated', icon: '\u2713' }),
  'worker.job.thumbnail.failed': (m) => ({ text: `Thumbnail failed: ${m.message || '?'}`, icon: '\u26a0' }),

  // --- Discovery (profile + thumbnail integration) ---
  'discovery.trigger.started': (m) => ({ text: `Profile discovery started for ${m.handle || m.slug || 'creator'}...`, icon: '\u2192' }),
  'discovery.trigger.no_handle': () => ({ text: 'Profile discovery skipped: account handle could not be resolved', icon: '\u26a0' }),
  'discovery.trigger.no_items': () => ({ text: 'Discovery finished with no profile posts found', icon: '\u26a0' }),
  'discovery.trigger.all_known': (m) => ({ text: `Discovery found only already-known posts${m.totalScraped ? ` (${m.totalScraped})` : ''}`, icon: '\u2713' }),
  'discovery.trigger.new_items': (m) => ({ text: `Discovery found ${m.newCount ?? '?'} new post${m.newCount === 1 ? '' : 's'}${m.totalScraped ? ` (${m.totalScraped} scanned)` : ''}`, icon: '\u2713' }),
  'discovery.trigger.completed': (m) => ({ text: `Discovery completed${m.newCount != null ? ` (${m.newCount} new)` : ''}${m.durationMs ? ` in ${fmtSec(m.durationMs)}` : ''}`, icon: '\u2713' }),
  'discovery.trigger.failed': (m) => ({ text: `Discovery failed: ${m.message || '?'}`, icon: '\u2717' }),

  'discovery.scrape.started': (m) => ({ text: `Opening profile page for ${m.handle || 'creator'}...`, icon: '\u2192' }),
  'discovery.scrape.captcha_detected': () => ({ text: 'Discovery blocked by captcha/challenge \u2014 waiting for solve...', icon: '\u26a0' }),
  'discovery.scrape.captcha_solved': (m) => ({ text: `Captcha/challenge solved${m.attempts ? ` after ${m.attempts} checks` : ''}`, icon: '\u2713' }),
  'discovery.scrape.captcha_timeout': () => ({ text: 'Discovery challenge timed out before profile became accessible', icon: '\u2717' }),
  'discovery.scrape.scrolled': (m) => ({ text: `Scrolled profile feed${m.step != null ? ` (step ${m.step})` : ''} to load more posts`, icon: '\u2192' }),
  'discovery.scrape.scroll_timeout_guard': (m) => ({ text: `Scroll stopped early${m.elapsedMs ? ` (${fmtSec(m.elapsedMs)} elapsed)` : ''} — timeout guard`, icon: '\u26a0' }),
  'discovery.scrape.scroll_stagnated': (m) => ({ text: `Profile feed stopped growing${m.stagnantCount ? ` (${m.stagnantCount} consecutive)` : ''}`, icon: '\u26a0' }),
  'discovery.scrape.end_of_feed': () => ({ text: 'Reached end of profile feed', icon: '\u2713' }),
  'discovery.scrape.screenshot': () => ({ text: 'Captured discovery debug screenshot', icon: '\u2192' }),
  'discovery.scrape.screenshot_failed': () => ({ text: 'Could not capture discovery debug screenshot', icon: '\u26a0' }),
  'discovery.scrape.dom_debug': () => ({ text: 'Captured discovery DOM diagnostics (no posts detected)', icon: '\u26a0' }),
  'discovery.scrape.completed': (m) => ({ text: `Profile scrape complete${m.itemCount != null ? ` (${m.itemCount} posts)` : ''}`, icon: '\u2713' }),
  'discovery.scrape.failed': (m) => ({ text: `Profile scrape failed: ${m.message || '?'}`, icon: '\u2717' }),

  'discovery.thumbnail.fetch_failed': (m) => ({ text: `Discovery thumbnail fetch failed: ${m.message || '?'}`, icon: '\u26a0' }),
  'discovery.thumbnail.fetch_non_image': (m) => ({ text: `Discovery thumbnail URL returned ${m.contentType || 'non-image'} content`, icon: '\u26a0' }),
  'discovery.thumbnail.auth_non_image': (m) => ({ text: `Auth thumbnail fetch returned ${m.contentType || 'non-image'} content`, icon: '\u26a0' }),
  'discovery.thumbnail.bad_status': (m) => ({ text: `Discovery thumbnail request returned status ${m.status || '?'}`, icon: '\u26a0' }),
  'discovery.thumbnail.no_body': () => ({ text: 'Discovery thumbnail response was empty', icon: '\u26a0' }),
  'discovery.thumbnail.bad_content_type': (m) => ({ text: `Discovery thumbnail URL returned ${m.contentType || 'non-image'} content`, icon: '\u26a0' }),
  'discovery.thumbnail.empty_file': () => ({ text: 'Discovery thumbnail response produced an empty image file', icon: '\u26a0' }),
  'discovery.thumbnail.timeout': (m) => ({ text: `Discovery thumbnail request timed out${m.timeoutMs ? ` after ${fmtSec(m.timeoutMs)}` : ''}`, icon: '\u26a0' }),
  'discovery.thumbnail.failed': (m) => ({ text: `Discovery thumbnail download failed: ${m.message || '?'}`, icon: '\u2717' }),
  'discovery.create.failed': (m) => ({ text: `Failed to persist discovered post: ${m.message || m.postUrl || '?'}`, icon: '\u2717' }),

  'discovery.download.created': () => ({ text: 'Created download job from discovered post', icon: '\u2713' }),
  'discovery.download.deduplicated': () => ({ text: 'Download skipped — job already exists for this URL', icon: '\u2713' }),
  'discovery.download.race-resolved': () => ({ text: 'Download skipped — duplicate job created concurrently', icon: '\u2713' }),
  'discovery.download.failed': (m) => ({ text: `Failed to queue discovered post: ${m.message || '?'}`, icon: '\u2717' }),
  'discovery.list.failed': (m) => ({ text: `Failed to list discovered posts: ${m.message || '?'}`, icon: '\u2717' }),
  'discovery.refresh.failed': (m) => ({ text: `Discovery refresh failed: ${m.message || '?'}`, icon: '\u2717' }),
  'discovery.refresh.already_running': () => ({ text: 'Discovery refresh already in progress for this contact', icon: '\u26a0' }),

  // --- Final status ---
  'worker.job.completed': (m) => {
    const parts = ['Done!']
    if (m.outputPath) parts.push(`Saved to ${m.outputPath}`)
    if (m.totalDurationMs) parts.push(`(${fmtSec(m.totalDurationMs)} total)`)
    return { text: parts.join(' '), icon: '\u2713' }
  },
  'worker.job.failed': (m) => {
    const icon = m.isTimeout ? '\u23f0' : '\u2717'
    const prefix = m.isTimeout ? 'Timed out' : 'Failed'
    const parts = [`${prefix}: ${m.message || m.error || 'unknown'}`]
    if (m.totalDurationMs) parts.push(`(${fmtSec(m.totalDurationMs)} total)`)
    return { text: parts.join(' '), icon }
  },

  // --- Downloader service ---
  'downloader.direct.auth.started': () => ({ text: 'Authenticating for download...', icon: '\u2192' }),
  'downloader.direct.auth.failed': (m) => ({ text: `Download auth failed: ${m.message || '?'}`, icon: '\u2717' }),
  'downloader.direct.auth.completed': () => ({ text: 'Download authentication successful', icon: '\u2713' }),
  'downloader.direct.expired_url': () => ({ text: 'Media URL expired \u2014 needs refresh', icon: '\u26a0' }),
  'downloader.direct.started': (m) => ({ text: `Downloading${m.url ? ' from CDN' : ''}...`, icon: '\u2192' }),
  'downloader.direct.response': (m) => {
    const parts = [`Server responded ${m.status || m.statusCode || '?'}`]
    if (m.contentLength) parts.push(fmtBytes(m.contentLength))
    if (m.contentType && !/^video\//i.test(m.contentType) && !/^application\/octet/i.test(m.contentType) && !/^binary\//i.test(m.contentType)) {
      parts.push(`\u26a0 ${m.contentType}`)
    }
    return { text: parts.join(' \u2014 '), icon: '\u2192' }
  },
  'downloader.direct.auth_fallback': () => ({ text: 'Got 403 \u2014 retrying with browser session...', icon: '\u26a0' }),
  'downloader.direct.auth_fallback.failed': (m) => ({ text: `Browser fallback failed: ${m.message || '?'}`, icon: '\u2717' }),
  'downloader.direct.failed': (m) => ({ text: `Direct download failed: ${m.message || '?'}`, icon: '\u2717' }),
  'downloader.direct.small_file_preview': (m) => ({ text: `Response body preview (${m.bytes || '?'} bytes): ${(m.preview || '').substring(0, 200)}`, icon: '\u26a0' }),
  'downloader.direct.auth.small_file_preview': (m) => ({ text: `Auth response preview (${m.bytes || '?'} bytes): ${(m.preview || '').substring(0, 200)}`, icon: '\u26a0' }),
  'downloader.direct.completed': (m) => {
    const parts = ['Video downloaded']
    if (m.bytes) parts.push(fmtBytes(m.bytes))
    if (m.durationMs) parts.push(fmtSec(m.durationMs))
    return { text: parts.join(' \u2014 '), icon: '\u2713' }
  },
  'downloader.browser_nav.started': () => ({ text: 'Downloading via browser navigation...', icon: '\u2192' }),
  'downloader.browser_nav.completed': (m) => ({ text: `Browser download complete${m.bytes ? ` (${fmtBytes(m.bytes)})` : ''}`, icon: '\u2713' }),
  'downloader.browser_nav.download_failed': (m) => ({ text: `Browser download failed: ${m.failure || '?'}`, icon: '\u2717' }),
  'downloader.browser_nav.failed': (m) => ({ text: `Browser navigation download failed: ${m.message || '?'}`, icon: '\u2717' }),
  'downloader.hls.ffmpeg.started': () => ({ text: 'Starting HLS download with ffmpeg...', icon: '\u2192' }),
  'downloader.hls.ffmpeg.error': (m) => ({ text: `ffmpeg error: ${m.message || '?'}`, icon: '\u2717' }),
  'downloader.hls.ffmpeg.completed': (m) => {
    const parts = ['ffmpeg download complete']
    if (m.bytes) parts.push(fmtBytes(m.bytes))
    return { text: parts.join(' \u2014 '), icon: '\u2713' }
  },
  'downloader.hls.ffmpeg.failed': (m) => ({ text: `ffmpeg failed (exit ${m.exitCode || '?'}): ${m.message || ''}`, icon: '\u2717' }),
  'downloader.mode.selected': (m) => ({ text: `Download mode: ${m.mode || '?'}`, icon: '\u2192' }),
  'downloader.completed': (m) => {
    const parts = ['Download complete']
    if (m.bytes) parts.push(fmtBytes(m.bytes))
    return { text: parts.join(' \u2014 '), icon: '\u2713' }
  },

  // --- Extractor ---
  'extractor.request.started': (m) => ({ text: `Browser navigating to ${m.url || 'page'}...`, icon: '\u2192' }),
  'extractor.page.goto.completed': (m) => ({ text: `Browser loaded the page${m.durationMs ? ` (${fmtSec(m.durationMs)})` : ''}`, icon: '\u2713' }),
  'extractor.collect.media_urls.completed': (m) => { const c = m.mediaUrlCount ?? m.count ?? '?'; return { text: `Found ${c} video URL${c === 1 ? '' : 's'}`, icon: '\u2713' } },
  'extractor.collect.image_urls.completed': (m) => { const c = m.imageUrlCount ?? m.count ?? '?'; return { text: `Found ${c} image${c === 1 ? '' : 's'}`, icon: '\u2713' } },
  'extractor.metadata.selectors.started': (m) => ({ text: `Collecting page metadata (${m.selectorCount || '?'} selectors)...`, icon: '\u2192' }),
  'extractor.collect.metadata.completed': () => ({ text: 'Page metadata collected', icon: '\u2713' }),
  'extractor.pick_media.failed': () => ({ text: 'Could not find any usable video on the page', icon: '\u2717' }),
  'extractor.request.completed': (m) => ({ text: `Extraction finished${m.durationMs ? ` (${fmtSec(m.durationMs)})` : ''}`, icon: '\u2713' }),
  'extractor.access_challenge': (m) => ({ text: `Access challenge detected: ${m.type || 'login/captcha'} \u2014 waiting for manual solve...`, icon: '\u26a0' }),
  'extractor.request.failed': (m) => ({ text: `Extraction failed: ${m.message || '?'}`, icon: '\u2717' }),
  'extractor.page.closed': () => ({ text: 'Browser page closed', icon: '\u2192' }),
  'extractor.page.kept_open': () => ({ text: 'Browser page kept open for manual intervention', icon: '\u26a0' }),
}

export function translateEvent(entry) {
  if (!entry || typeof entry !== 'object' || !entry.event) {
    return { text: 'Unknown event', icon: '\u2192' }
  }

  const translator = translations[entry.event]
  if (translator) {
    return translator(entry)
  }

  return { text: entry.event, icon: '\u2192' }
}
