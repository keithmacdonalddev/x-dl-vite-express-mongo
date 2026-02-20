const express = require('express');
const { logger } = require('../../core/lib/logger');
const {
  openPlatformLogin,
  checkAuthStatus,
  disconnectPlatform,
} = require('../../services/auth-service');

const router = express.Router();

/**
 * POST /api/auth/connect/:platform
 *
 * Opens the persistent Playwright browser to the platform's login page.
 * The browser window becomes visible (non-headless mode) and the user
 * logs in manually. Returns immediately with a 200 response.
 *
 * The openPlatformLogin service function handles:
 * - Platform validation (INVALID_PLATFORM)
 * - Auth config validation (AUTH_NOT_CONFIGURED)
 * - Headless mode guard (HEADLESS_MODE)
 * - Browser launch and page navigation
 */
router.post('/connect/:platform', async (req, res) => {
  const platformId = req.params.platform;

  try {
    const result = await openPlatformLogin(platformId, { traceId: req.traceId });

    res.json({
      ok: true,
      message: 'Browser opened to login page. Log in manually in the browser window.',
      platform: result.platform,
    });
  } catch (err) {
    const code = err.code || 'BROWSER_LAUNCH_FAILED';
    const statusCode = code === 'INVALID_PLATFORM' || code === 'AUTH_NOT_CONFIGURED'
      ? 400
      : code === 'HEADLESS_MODE'
      ? 409
      : 500;

    logger.error('auth.connect.failed', {
      traceId: req.traceId,
      platform: platformId,
      code,
      error: err.message,
    });

    res.status(statusCode).json({
      ok: false,
      code,
      error: err.message,
    });
  }
});

/**
 * GET /api/auth/status
 *
 * Checks if the persistent browser has valid session cookies for each
 * registered platform.
 *
 * This endpoint does NOT launch Playwright. If no browser context exists,
 * all platforms are returned as { connected: false }. The checkAuthStatus
 * service function uses hasPersistentContext() to make this determination
 * without side effects.
 */
router.get('/status', async (req, res) => {
  const result = await checkAuthStatus({ traceId: req.traceId });
  res.json({ ok: true, platforms: result.platforms });
});

/**
 * POST /api/auth/disconnect/:platform
 *
 * Clears all cookies for the specified platform's domains from the
 * persistent browser context. Does NOT close the browser.
 *
 * Reports verified clearing results with before/after counts.
 */
router.post('/disconnect/:platform', async (req, res) => {
  const platformId = req.params.platform;

  try {
    const result = await disconnectPlatform(platformId, { traceId: req.traceId });

    res.json({
      ok: true,
      platform: result.platform,
      cleared: result.cleared,
      beforeCount: result.beforeCount,
      afterCount: result.afterCount,
    });
  } catch (err) {
    const code = err.code || 'DISCONNECT_FAILED';
    const statusCode = code === 'INVALID_PLATFORM' || code === 'AUTH_NOT_CONFIGURED'
      ? 400
      : 500;

    logger.error('auth.disconnect.failed', {
      traceId: req.traceId,
      platform: platformId,
      code,
      error: err.message,
    });

    res.status(statusCode).json({
      ok: false,
      code,
      error: err.message,
    });
  }
});

module.exports = { authRouter: router };
