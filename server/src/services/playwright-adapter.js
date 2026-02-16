const path = require('node:path');

const MEDIA_URL_PATTERN = /\.(mp4|m3u8|webm|mov|m4v)(\?.*)?$/i;
const TIKTOK_MEDIA_PATH_PATTERN = /\/(video\/tos\/|aweme\/v1\/play\/)/i;
const VIDEO_CONTENT_TYPE_PATTERN = /^(video\/|application\/(vnd\.apple\.mpegurl|x-mpegurl))/i;
const AUTH_REQUIRED_PATTERN = /(log in|login|sign in|authenticate|session expired)/i;
const BOT_CHALLENGE_PATTERN = /(captcha|verify you are human|performing security verification|unusual traffic)/i;
const X_AUTH_HOSTS = new Set(['x.com', 'twitter.com']);

let persistentContextPromise = null;

function parseBoolean(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return fallback;
}

function resolveChromium(injectedChromium) {
  if (injectedChromium) {
    return injectedChromium;
  }

  try {
    return require('playwright').chromium;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Playwright dependency is required for production extraction. Install with: npm --prefix server install playwright (${message})`
    );
  }
}

function getAdapterConfig(input = {}) {
  const env = input.env || process.env;

  const settleMs = Number.isFinite(input.settleMs)
    ? input.settleMs
    : Number(env.PLAYWRIGHT_SETTLE_MS || 3000);
  const navigationTimeoutMs = Number.isFinite(input.navigationTimeoutMs)
    ? input.navigationTimeoutMs
    : Number(env.PLAYWRIGHT_NAV_TIMEOUT_MS || 45000);
  const manualSolveTimeoutMs = Number.isFinite(input.manualSolveTimeoutMs)
    ? input.manualSolveTimeoutMs
    : Number(env.PLAYWRIGHT_MANUAL_SOLVE_TIMEOUT_MS || 90000);
  const manualSolvePollMs = Number.isFinite(input.manualSolvePollMs)
    ? input.manualSolvePollMs
    : Number(env.PLAYWRIGHT_MANUAL_SOLVE_POLL_MS || 1000);

  return {
    chromium: input.chromium,
    userDataDir:
      input.userDataDir ||
      env.PLAYWRIGHT_USER_DATA_DIR ||
      path.resolve(process.cwd(), '.playwright-profile'),
    headless:
      typeof input.headless === 'boolean'
        ? input.headless
        : parseBoolean(env.PLAYWRIGHT_HEADLESS, false),
    settleMs: Number.isFinite(settleMs) && settleMs >= 0 ? settleMs : 3000,
    navigationTimeoutMs: Number.isFinite(navigationTimeoutMs) && navigationTimeoutMs > 0 ? navigationTimeoutMs : 45000,
    manualSolveTimeoutMs: Number.isFinite(manualSolveTimeoutMs) && manualSolveTimeoutMs >= 0 ? manualSolveTimeoutMs : 90000,
    manualSolvePollMs: Number.isFinite(manualSolvePollMs) && manualSolvePollMs > 0 ? manualSolvePollMs : 1000,
    contextOptions: input.contextOptions || {},
  };
}

function assessAccessState({ title, content, finalUrl }) {
  const sample = `${title || ''}\n${content || ''}\n${finalUrl || ''}`;
  let hostname = '';

  try {
    hostname = new URL(finalUrl || '').hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    hostname = '';
  }

  if (BOT_CHALLENGE_PATTERN.test(sample)) {
    return 'BOT_CHALLENGE';
  }

  // X/Twitter extraction usually requires login for restricted posts.
  // TikTok pages often contain non-blocking "log in" UI text even when public media is accessible.
  if (X_AUTH_HOSTS.has(hostname) && AUTH_REQUIRED_PATTERN.test(sample)) {
    return 'AUTH_REQUIRED';
  }

  return '';
}

function isLikelyMediaResponse(response) {
  if (!response || typeof response.url !== 'function') {
    return false;
  }

  const url = response.url();
  if (typeof url !== 'string' || !url) {
    return false;
  }

  if (MEDIA_URL_PATTERN.test(url)) {
    return true;
  }

  if (TIKTOK_MEDIA_PATH_PATTERN.test(url)) {
    return true;
  }

  try {
    if (typeof response.headers === 'function') {
      const headers = response.headers() || {};
      const contentType = headers['content-type'] || headers['Content-Type'] || '';
      if (VIDEO_CONTENT_TYPE_PATTERN.test(contentType)) {
        return true;
      }
    }
  } catch {
    // ignore header parsing failures
  }

  return false;
}

async function sampleAccessState(page, targetUrl) {
  const [title, content, finalUrl] = await Promise.all([
    page.title().catch(() => ''),
    page.content().catch(() => ''),
    Promise.resolve(typeof page.url === 'function' ? page.url() : targetUrl),
  ]);

  const accessState = assessAccessState({ title, content, finalUrl });
  return { accessState, finalUrl };
}

async function waitForManualSolveIfNeeded(page, targetUrl, config) {
  const { accessState: initialAccessState } = await sampleAccessState(page, targetUrl);
  if (initialAccessState !== 'BOT_CHALLENGE') {
    return initialAccessState;
  }

  if (config.manualSolveTimeoutMs <= 0) {
    return 'BOT_CHALLENGE';
  }

  const attempts = Math.max(1, Math.ceil(config.manualSolveTimeoutMs / config.manualSolvePollMs));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.waitForTimeout(config.manualSolvePollMs);
    const { accessState } = await sampleAccessState(page, targetUrl);

    if (!accessState) {
      return '';
    }

    if (accessState === 'AUTH_REQUIRED') {
      return 'AUTH_REQUIRED';
    }
  }

  return 'BOT_CHALLENGE';
}

async function getPersistentContext(options = {}) {
  const config = getAdapterConfig(options);
  const chromium = resolveChromium(config.chromium);

  if (!persistentContextPromise) {
    const contextPromise = chromium
      .launchPersistentContext(config.userDataDir, {
        headless: config.headless,
        ...config.contextOptions,
      })
      .then((context) => {
        // If the browser exits unexpectedly, allow automatic relaunch on next usage.
        if (context && typeof context.once === 'function') {
          context.once('close', () => {
            if (persistentContextPromise === contextPromise) {
              persistentContextPromise = null;
            }
          });
        }
        return context;
      })
      .catch((error) => {
        persistentContextPromise = null;
        throw error;
      });
    persistentContextPromise = contextPromise;
  }

  return persistentContextPromise;
}

async function closePersistentContext() {
  if (!persistentContextPromise) {
    return;
  }

  const context = await persistentContextPromise;
  persistentContextPromise = null;
  await context.close();
}

function createPlaywrightPageFactory(options = {}) {
  const config = getAdapterConfig(options);

  function isClosedContextError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /target page, context or browser has been closed/i.test(message);
  }

  async function openNewPage() {
    const context = await getPersistentContext(config);

    try {
      return await context.newPage();
    } catch (error) {
      if (!isClosedContextError(error)) {
        throw error;
      }

      await closePersistentContext().catch(() => {});
      const relaunched = await getPersistentContext(config);
      return relaunched.newPage();
    }
  }

  return async function pageFactory() {
    const page = await openNewPage();
    const mediaUrls = new Set();

    const onResponse = (response) => {
      try {
        if (isLikelyMediaResponse(response)) {
          mediaUrls.add(response.url());
        }
      } catch {
        // swallow response parsing errors
      }
    };

    page.on('response', onResponse);

    return {
      async goto(targetUrl) {
        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: config.navigationTimeoutMs,
        });

        if (config.settleMs > 0) {
          await page.waitForTimeout(config.settleMs);
        }

        const accessState = await waitForManualSolveIfNeeded(page, targetUrl, config);
        if (accessState) {
          throw new Error(
            `${accessState}: manual interaction required in persistent browser profile before extraction can continue.`
          );
        }
      },
      async collectMediaUrls() {
        return Array.from(mediaUrls);
      },
      async close() {
        page.off('response', onResponse);
        await page.close();
      },
    };
  };
}

module.exports = {
  createPlaywrightPageFactory,
  getPersistentContext,
  closePersistentContext,
  getAdapterConfig,
  assessAccessState,
};
