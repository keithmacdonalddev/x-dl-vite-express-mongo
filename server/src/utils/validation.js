function isTweetUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return false;
  }

  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const allowedHosts = new Set(['x.com', 'twitter.com']);

    if (!allowedHosts.has(hostname)) {
      return false;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 3 || parts[1] !== 'status') {
      return false;
    }

    return /^\d+$/.test(parts[2]);
  } catch {
    return false;
  }
}

module.exports = {
  isTweetUrl,
};
