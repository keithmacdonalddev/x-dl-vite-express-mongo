import { describe, it, expect } from 'vitest'
import { getContactChipClassName } from './contactChipPresentation'

describe('getContactChipClassName (REG-UI-001)', () => {
  it('adds no-thumb modifier when thumbnail missing', () => {
    expect(getContactChipClassName({ latestThumbnail: '' })).toBe('contact-chip is-no-thumb')
  })

  it('uses base class when thumbnail exists', () => {
    expect(getContactChipClassName({ latestThumbnail: 'downloads/a.jpg' })).toBe('contact-chip')
  })
})
