const { logger } = require('../core/lib/logger');
const {
  getPersistentContext,
  getAdapterConfig,
  hasPersistentContext,
} = require('./playwright-adapter');
const { AUTH_CONFIG } = require('../core/config/auth-config');
const { PLATFORMS } = require('../core/platforms/registry');

/**
 * Opens the persistent Playwright browser to the platform's login page.
 * Returns immediately — does NOT wait for the user to complete login.
 *
 * @param {string} platformId - Platform identifier ('x' or 'tiktok')
 * @param {object} [options]
 * @param {string} [options.traceId] - Request trace ID for telemetry
 * @returns {Promise<{ opened: true, platform: string, loginUrl: string }>}
 * @throws {Error} If platform is unknown, not configured, or headless mode is active
 */
async function openPlatformLogin(platformId, options = {}) {
  const { traceId } = options;

  // Validate platform
  const platformDef = PLATFORMS.find((p) => p.id === platformId);
  if (!platformDef) {
    const err = new Error(`Unknown platform: ${platformId}`);
    err.code = 'INVALID_PLATFORM';
    throw err;
  }

  const authConfig = AUTH_CONFIG[platformId];
  if (!authConfig || !authConfig.loginUrl) {
    const err = new Error(`No login URL configured for platform: ${platformId}`);
    err.code = 'AUTH_NOT_CONFIGURED';
    throw err;
  }

  // Headless mode guard (guard lives here, not in API route)
  const adapterConfig = getAdapterConfig();
  if (adapterConfig.headless) {
    const err = new Error(
      'Cannot connect accounts in headless mode. Set PLAYWRIGHT_HEADLESS=false and restart.'
    );
    err.code = 'HEADLESS_MODE';
    throw err;
  }

  logger.info('auth.connect.started', {
    traceId,
    platform: platformId,
  });

  const context = await getPersistentContext();
  const page = await context.newPage();

  await page.goto(authConfig.loginUrl, { waitUntil: 'domcontentloaded' });

  logger.info('auth.connect.browser-opened', {
    traceId,
    platform: platformId,
    loginUrl: authConfig.loginUrl,
  });

  // Do NOT close the page — the user needs it open to log in.
  // The page will be cleaned up when:
  //   1. The user navigates away and closes it manually, OR
  //   2. The persistent context is closed (server shutdown), OR
  //   3. A future disconnect call clears the session

  return {
    opened: true,
    platform: platformId,
    loginUrl: authConfig.loginUrl,
  };
}

/**
 * Checks session status for all registered platforms by inspecting cookies
 * in the persistent context. Does NOT launch Playwright if no context exists.
 *
 * Uses hasPersistentContext() to check if the module-level
 * persistentContextPromise is non-null. If null, returns all platforms as
 * { connected: false } without instantiating anything.
 *
 * @param {object} [options]
 * @param {string} [options.traceId] - Request trace ID for telemetry
 * @returns {Promise<{ platforms: Object }>}
 */
async function checkAuthStatus(options = {}) {
  const { traceId } = options;

  logger.info('auth.status.check.started', { traceId });

  // If no persistent context exists, return all disconnected
  // without launching a browser.
  if (!hasPersistentContext()) {
    logger.info('auth.status.no-context', {
      traceId,
      reason: 'persistentContextPromise is null — no browser running',
    });

    const platforms = {};
    for (const p of PLATFORMS) {
      platforms[p.id] = { connected: false, cookieCount: 0, hasSessionCookies: false };
    }
    return { platforms };
  }

  // Context exists — await it (it's already launched, no side effects)
  let context;
  try {
    context = await getPersistentContext();
  } catch (err) {
    logger.info('auth.status.context-error', {
      traceId,
      reason: err instanceof Error ? err.message : String(err),
    });

    const platforms = {};
    for (const p of PLATFORMS) {
      platforms[p.id] = { connected: false, cookieCount: 0, hasSessionCookies: false };
    }
    return { platforms };
  }

  // Get all cookies from the persistent context
  const cookies = await context.cookies();

  const platforms = {};
  for (const platformDef of PLATFORMS) {
    const authConfig = AUTH_CONFIG[platformDef.id];
    if (!authConfig) {
      platforms[platformDef.id] = { connected: false, cookieCount: 0, hasSessionCookies: false };
      continue;
    }

    // Filter cookies belonging to this platform's domains
    const platformCookies = cookies.filter((cookie) => {
      const domain = cookie.domain.toLowerCase();
      return authConfig.sessionCookieDomains.some(
        (d) => domain === d || domain.endsWith(d)
      );
    });

    // Check for specific session indicator cookies
    const hasSessionCookies = authConfig.sessionIndicatorCookies.some((name) =>
      platformCookies.some((c) => c.name === name && c.value && c.value.length > 0)
    );

    // Check that session cookies are not expired
    const now = Date.now() / 1000;
    const hasValidSessionCookies = hasSessionCookies &&
      platformCookies
        .filter((c) => authConfig.sessionIndicatorCookies.includes(c.name))
        .some((c) => c.expires === -1 || c.expires > now);

    platforms[platformDef.id] = {
      connected: hasValidSessionCookies,
      cookieCount: platformCookies.length,
      hasSessionCookies,
    };

    logger.info('auth.status.platform-checked', {
      traceId,
      platform: platformDef.id,
      connected: hasValidSessionCookies,
      cookieCount: platformCookies.length,
    });
  }

  return { platforms };
}

/**
 * Clears platform-specific cookies from the persistent context and verifies
 * the clearing succeeded.
 *
 * Reads cookies before and after clearing, verifies indicator
 * cookies are gone, and reports accurate counts.
 *
 * @param {string} platformId - Platform identifier ('x' or 'tiktok')
 * @param {object} [options]
 * @param {string} [options.traceId] - Request trace ID for telemetry
 * @returns {Promise<{ cleared: boolean, platform: string, beforeCount: number, afterCount: number, reason?: string }>}
 */
async function disconnectPlatform(platformId, options = {}) {
  const { traceId } = options;

  // Validate platform
  const platformDef = PLATFORMS.find((p) => p.id === platformId);
  if (!platformDef) {
    const err = new Error(`Unknown platform: ${platformId}`);
    err.code = 'INVALID_PLATFORM';
    throw err;
  }

  const authConfig = AUTH_CONFIG[platformId];
  if (!authConfig) {
    const err = new Error(`No auth configuration for platform: ${platformId}`);
    err.code = 'AUTH_NOT_CONFIGURED';
    throw err;
  }

  logger.info('auth.disconnect.started', {
    traceId,
    platform: platformId,
  });

  // If no persistent context exists, nothing to clear
  if (!hasPersistentContext()) {
    logger.info('auth.disconnect.no-context', {
      traceId,
      platform: platformId,
    });

    return {
      cleared: true,
      platform: platformId,
      beforeCount: 0,
      afterCount: 0,
      reason: 'no_active_session',
    };
  }

  let context;
  try {
    context = await getPersistentContext();
  } catch {
    // No browser context = nothing to clear
    return {
      cleared: true,
      platform: platformId,
      beforeCount: 0,
      afterCount: 0,
      reason: 'no_active_session',
    };
  }

  // Step 1: Read cookies BEFORE clearing
  const allCookiesBefore = await context.cookies();
  const platformCookiesBefore = allCookiesBefore.filter((cookie) => {
    const domain = cookie.domain.toLowerCase();
    return authConfig.sessionCookieDomains.some(
      (d) => domain === d || domain.endsWith(d)
    );
  });
  const beforeCount = platformCookiesBefore.length;

  if (beforeCount === 0) {
    logger.info('auth.disconnect.no-cookies', {
      traceId,
      platform: platformId,
    });

    return {
      cleared: true,
      platform: platformId,
      beforeCount: 0,
      afterCount: 0,
      reason: 'no_cookies_found',
    };
  }

  // Step 2: Clear cookies for each platform domain
  for (const domain of authConfig.sessionCookieDomains) {
    try {
      await context.clearCookies({ domain });
    } catch {
      // If clearCookies with domain filter fails for one domain, continue
      // trying other domains
    }
  }

  // Step 3: Read cookies AFTER clearing
  const allCookiesAfter = await context.cookies();
  const platformCookiesAfter = allCookiesAfter.filter((cookie) => {
    const domain = cookie.domain.toLowerCase();
    return authConfig.sessionCookieDomains.some(
      (d) => domain === d || domain.endsWith(d)
    );
  });
  const afterCount = platformCookiesAfter.length;

  // Step 4: Verify indicator cookies are gone
  const remainingIndicators = platformCookiesAfter.filter((c) =>
    authConfig.sessionIndicatorCookies.includes(c.name)
  );

  const actuallyCleared = remainingIndicators.length === 0;

  logger.info('auth.disconnect.completed', {
    traceId,
    platform: platformId,
    beforeCount,
    afterCount,
    actuallyCleared,
    remainingIndicators: remainingIndicators.map((c) => c.name),
  });

  return {
    cleared: actuallyCleared,
    platform: platformId,
    beforeCount,
    afterCount,
  };
}

module.exports = {
  openPlatformLogin,
  checkAuthStatus,
  disconnectPlatform,
};
