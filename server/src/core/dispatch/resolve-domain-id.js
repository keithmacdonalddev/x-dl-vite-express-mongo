const { getPostUrlInfo } = require('../../core/utils/validation');

const UNKNOWN_PLATFORM = 'unknown';
const PLATFORM_DOMAIN_PREFIX = 'platform-';

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function platformToDomainId(platformId) {
  const normalizedPlatform = normalizeString(platformId);
  if (!normalizedPlatform || normalizedPlatform === UNKNOWN_PLATFORM) {
    return '';
  }
  return `${PLATFORM_DOMAIN_PREFIX}${normalizedPlatform}`;
}

function resolveDomainId({
  existingDomainId = '',
  platformId = '',
  tweetUrl = '',
} = {}) {
  const explicitDomainId = normalizeString(existingDomainId);
  if (explicitDomainId) {
    return explicitDomainId;
  }

  const platformDomainId = platformToDomainId(platformId);
  if (platformDomainId) {
    return platformDomainId;
  }

  const postInfo = getPostUrlInfo(tweetUrl);
  return platformToDomainId(postInfo.platform);
}

module.exports = {
  resolveDomainId,
  platformToDomainId,
};

