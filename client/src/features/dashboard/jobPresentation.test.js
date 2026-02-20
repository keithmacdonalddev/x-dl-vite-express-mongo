import { describe, it, expect } from 'vitest'
import { getJobStatusNote } from './jobPresentation'

describe('getJobStatusNote (REG-UI-002)', () => {
  it('failed job returns backend error text when present', () => {
    expect(getJobStatusNote({ status: 'failed', error: 'Video is unavailable on source platform' }))
      .toBe('Video is unavailable on source platform')
  })

  it('failed job falls back to generic failed message when error missing', () => {
    expect(getJobStatusNote({ status: 'failed', error: '' })).toBe('Download failed.')
  })

  it('non-completed non-failed statuses keep pending message', () => {
    expect(getJobStatusNote({ status: 'running', error: '' })).toBe('Download not ready yet.')
  })
})
