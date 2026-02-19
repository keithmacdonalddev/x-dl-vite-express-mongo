const { PLATFORMS } = require('../../platforms/registry');

function parseBooleanFlag(rawValue, defaultValue) {
  if (typeof rawValue !== 'string') return defaultValue;
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

// Runtime overrides set via PATCH /api/capabilities — keyed by platform id
const runtimeOverrides = {};

function getPlatformCapabilities(input = process.env) {
  const capabilities = {};
  for (const platform of PLATFORMS) {
    const envKey = platform.envFlag || `ENABLE_${platform.id.toUpperCase()}`;
    const defaultEnabled = parseBooleanFlag(input[envKey], true);
    capabilities[platform.id] =
      typeof runtimeOverrides[platform.id] === 'boolean'
        ? runtimeOverrides[platform.id]
        : defaultEnabled;
  }
  return capabilities;
}

function isPlatformEnabled(platform, capabilities = getPlatformCapabilities()) {
  if (!platform || platform === 'unknown') return false;
  return capabilities[platform] === true;
}

function setPlatformCapabilities(nextCapabilities = {}) {
  for (const platform of PLATFORMS) {
    if (Object.prototype.hasOwnProperty.call(nextCapabilities, platform.id)) {
      runtimeOverrides[platform.id] = Boolean(nextCapabilities[platform.id]);
    }
  }
  return getPlatformCapabilities();
}

module.exports = {
  getPlatformCapabilities,
  isPlatformEnabled,
  setPlatformCapabilities,
};

