import test from 'node:test'
import assert from 'node:assert/strict'
import { getContactChipClassName } from '../../src/lib/contactChipPresentation.js'

test('adds no-thumb modifier when thumbnail missing', () => {
  assert.equal(getContactChipClassName({ latestThumbnail: '' }), 'contact-chip is-no-thumb')
})

test('uses base class when thumbnail exists', () => {
  assert.equal(getContactChipClassName({ latestThumbnail: 'downloads/a.jpg' }), 'contact-chip')
})
