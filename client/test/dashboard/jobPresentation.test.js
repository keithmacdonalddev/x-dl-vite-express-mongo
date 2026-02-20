import test from 'node:test'
import assert from 'node:assert/strict'
import { getJobStatusNote } from '../../src/features/dashboard/jobPresentation.js'

test('failed job returns backend error text when present', () => {
  assert.equal(getJobStatusNote({ status: 'failed', error: 'Video is unavailable on source platform' }), 'Video is unavailable on source platform')
})

test('failed job falls back to generic failed message when error missing', () => {
  assert.equal(getJobStatusNote({ status: 'failed', error: '' }), 'Download failed.')
})

test('non-completed non-failed statuses keep pending message', () => {
  assert.equal(getJobStatusNote({ status: 'running', error: '' }), 'Download not ready yet.')
})
