import { describe, it, expect } from 'vitest'
import { translateEvent } from './eventTranslator'

describe('translateEvent discovery thumbnail mappings', () => {
  it('maps backend thumbnail status and timeout events to readable text', () => {
    expect(translateEvent({ event: 'discovery.thumbnail.bad_status', status: 403 }).text)
      .toContain('status 403')
    expect(translateEvent({ event: 'discovery.thumbnail.no_body' }).text)
      .toContain('response was empty')
    expect(translateEvent({ event: 'discovery.thumbnail.bad_content_type', contentType: 'text/html' }).text)
      .toContain('text/html')
    expect(translateEvent({ event: 'discovery.thumbnail.empty_file' }).text)
      .toContain('empty image file')
    expect(translateEvent({ event: 'discovery.thumbnail.timeout', timeoutMs: 15000 }).text)
      .toContain('timed out')
    expect(translateEvent({ event: 'discovery.refresh.already_running' }).text)
      .toContain('already in progress')
  })
})
