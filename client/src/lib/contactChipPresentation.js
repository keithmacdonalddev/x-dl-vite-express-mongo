export function getContactChipClassName(contact = {}) {
  const hasThumbnail = Boolean(contact.latestThumbnail)
  return hasThumbnail ? 'contact-chip' : 'contact-chip is-no-thumb'
}
