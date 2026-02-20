const path = require('node:path');
const fs = require('node:fs');
const { logger } = require('../core/lib/logger');

const MEDIA_URL_PATTERN = /\.(mp4|m3u8|webm|mov|m4v)(\?.*)?$/i;
const IMAGE_URL_PATTERN = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i;
const { getAuthBlockingHosts, getAllMediaPathPatterns } = require('../core/platforms/registry');

const VIDEO_CONTENT_TYPE_PATTERN = /^(video\/|application\/(vnd\.apple\.mpegurl|x-mpegurl))/i;
const IMAGE_CONTENT_TYPE_PATTERN = /^image\//i;
const AUTH_REQUIRED_PATTERN = /(log in|login|sign in|authenticate|session expired)/i;
const BOT_CHALLENGE_PATTERN =
  /(captcha|verify you are human|performing security verification|unusual traffic|just a moment|checking your browser|attention required)/i;

// Resolved once at startup from the platform registry
const AUTH_BLOCKING_HOSTS = getAuthBlockingHosts();
const PLATFORM_MEDIA_PATH_PATTERNS = getAllMediaPathPatterns();

let persistentContextPromise = null;
const CHROMIUM_SINGLETON_ARTIFACTS = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

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
        : parseBoolean(env.PLAYWRIGHT_HEADLESS, true),
    settleMs: Number.isFinite(settleMs) && settleMs >= 0 ? settleMs : 3000,
    navigationTimeoutMs: Number.isFinite(navigationTimeoutMs) && navigationTimeoutMs > 0 ? navigationTimeoutMs : 45000,
    manualSolveTimeoutMs: Number.isFinite(manualSolveTimeoutMs) && manualSolveTimeoutMs >= 0 ? manualSolveTimeoutMs : 90000,
    manualSolvePollMs: Number.isFinite(manualSolvePollMs) && manualSolvePollMs > 0 ? manualSolvePollMs : 1000,
    contextOptions: input.contextOptions || {},
  };
}

function assessAccessState({ title, visibleText, content, finalUrl }) {
  const sample = `${title || ''}\n${visibleText || content || ''}\n${finalUrl || ''}`;
  let hostname = '';

  try {
    hostname = new URL(finalUrl || '').hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    hostname = '';
  }

  if (BOT_CHALLENGE_PATTERN.test(sample)) {
    return 'BOT_CHALLENGE';
  }

  // Only block on auth-wall text for platforms that have authWallBlocks: true.
  // (e.g. TikTok pages show "log in" UI even on public videos — not a hard block)
  if (AUTH_BLOCKING_HOSTS.has(hostname) && AUTH_REQUIRED_PATTERN.test(sample)) {
    return 'AUTH_REQUIRED';
  }

  return '';
}

function isLaunchClosedError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /target page, context or browser has been closed/i.test(message) ||
    /browser has been closed/i.test(message) ||
    /exitcode=21/i.test(message)
  );
}

async function clearChromiumSingletonArtifacts(userDataDir) {
  if (!userDataDir) {
    return;
  }

  const removals = CHROMIUM_SINGLETON_ARTIFACTS.map((name) =>
    fs.promises.rm(path.join(userDataDir, name), {
      force: true,
      recursive: true,
    })
  );

  await Promise.all(removals).catch(() => {});
}

async function launchPersistentContextWithRecovery(chromium, config) {
  try {
    return await chromium.launchPersistentContext(config.userDataDir, {
      headless: config.headless,
      acceptDownloads: true,
      ...config.contextOptions,
    });
  } catch (error) {
    if (!isLaunchClosedError(error)) {
      throw error;
    }

    await clearChromiumSingletonArtifacts(config.userDataDir);

    return chromium.launchPersistentContext(config.userDataDir, {
      headless: config.headless,
      acceptDownloads: true,
      ...config.contextOptions,
    });
  }
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

  if (PLATFORM_MEDIA_PATH_PATTERNS.some((pattern) => pattern.test(url))) {
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

function isLikelyImageResponse(response) {
  if (!response || typeof response.url !== 'function') {
    return false;
  }

  const url = response.url();
  if (typeof url !== 'string' || !url) {
    return false;
  }

  if (IMAGE_URL_PATTERN.test(url)) {
    return true;
  }

  try {
    if (typeof response.headers === 'function') {
      const headers = response.headers() || {};
      const contentType = headers['content-type'] || headers['Content-Type'] || '';
      if (IMAGE_CONTENT_TYPE_PATTERN.test(contentType)) {
        return true;
      }
    }
  } catch {
    // ignore header parsing failures
  }

  return false;
}

function isLikelyMediaUrl(url) {
  if (typeof url !== 'string') {
    return false;
  }
  return (
    MEDIA_URL_PATTERN.test(url) ||
    PLATFORM_MEDIA_PATH_PATTERNS.some((pattern) => pattern.test(url))
  );
}

function extractMediaUrlsFromContent(content) {
  if (typeof content !== 'string' || !content) {
    return [];
  }

  const normalized = content
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
  const matches = normalized.match(/https?:\/\/[^\s"'<>\\]+/g) || [];

  const mediaMatches = matches.filter((url) => isLikelyMediaUrl(url));
  return Array.from(new Set(mediaMatches));
}

async function extractTikTokRehydrationUrls(page) {
  if (!page || typeof page.evaluate !== 'function') {
    return [];
  }

  try {
    const urls = await page.evaluate(() => {
      const results = [];

      // Strategy 1: __UNIVERSAL_DATA_FOR_REHYDRATION__ (modern TikTok pages)
      const rehydrationScript = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (rehydrationScript) {
        try {
          const data = JSON.parse(rehydrationScript.textContent || '{}');
          const defaultScope = data['__DEFAULT_SCOPE__'] || {};
          const videoDetail = defaultScope['webapp.video-detail'] || {};
          const itemInfo = videoDetail.itemInfo || {};
          const itemStruct = itemInfo.itemStruct || {};
          const video = itemStruct.video || {};

          // play_addr = non-watermarked playback stream (preferred)
          if (video.play_addr && Array.isArray(video.play_addr.url_list)) {
            for (const u of video.play_addr.url_list) {
              if (typeof u === 'string' && u.startsWith('http')) {
                results.push({ url: u, source: 'play_addr' });
              }
            }
          }

          // bitrateInfo[].PlayAddr = quality variants (non-watermarked, up to 6x higher bitrate)
          if (Array.isArray(video.bitrateInfo)) {
            for (const variant of video.bitrateInfo) {
              const playAddr = variant.PlayAddr || variant.play_addr;
              if (playAddr && Array.isArray(playAddr.url_list)) {
                for (const u of playAddr.url_list) {
                  if (typeof u === 'string' && u.startsWith('http')) {
                    results.push({ url: u, source: 'bitrate_variant' });
                  }
                }
              }
            }
          }

          // download_addr = watermarked "save video" stream (deprioritized by ranking)
          if (video.download_addr && Array.isArray(video.download_addr.url_list)) {
            for (const u of video.download_addr.url_list) {
              if (typeof u === 'string' && u.startsWith('http')) {
                results.push({ url: u, source: 'download_addr' });
              }
            }
          }
        } catch {
          // JSON parse failure
        }
      }

      // Strategy 2: SIGI_STATE (older TikTok pages)
      const sigiScript = document.getElementById('SIGI_STATE');
      if (sigiScript) {
        try {
          const data = JSON.parse(sigiScript.textContent || '{}');
          const itemModule = data.ItemModule || {};
          for (const key of Object.keys(itemModule)) {
            const item = itemModule[key];
            const video = item && item.video;
            if (!video) continue;

            if (video.playAddr && typeof video.playAddr === 'string' && video.playAddr.startsWith('http')) {
              results.push({ url: video.playAddr, source: 'sigi_play_addr' });
            }
            if (video.downloadAddr && typeof video.downloadAddr === 'string' && video.downloadAddr.startsWith('http')) {
              results.push({ url: video.downloadAddr, source: 'sigi_download_addr' });
            }
          }
        } catch {
          // JSON parse failure
        }
      }

      return results;
    });

    return Array.isArray(urls) ? urls : [];
  } catch {
    return [];
  }
}

async function readPostMetadata(page) {
  const metadata = {
    title: '',
    description: '',
    author: '',
    thumbnailUrl: '',
    canonicalUrl: '',
    pageUrl: '',
    siteName: '',
    locale: '',
    publishedAt: '',
    videoWidth: 0,
    videoHeight: 0,
    durationSeconds: 0,
    keywords: '',
    twitterCreator: '',
    twitterSite: '',
  };

  const [title, pageUrl] = await Promise.all([
    page.title().catch(() => ''),
    Promise.resolve(typeof page.url === 'function' ? page.url() : ''),
  ]);
  metadata.title = title || '';
  metadata.pageUrl = pageUrl || '';

  if (typeof page.locator !== 'function') {
    return metadata;
  }

  const metadataSelectorTimeoutMs = 300;

  logger.info('extractor.metadata.selectors.started', {
    selectorCount: 18,
    timeoutMs: metadataSelectorTimeoutMs,
  });

  const selectors = [
    ['description', 'meta[name="description"]'],
    ['description', 'meta[property="og:description"]'],
    ['title', 'meta[property="og:title"]'],
    ['thumbnailUrl', 'meta[property="og:image"]'],
    ['canonicalUrl', 'link[rel="canonical"]'],
    ['siteName', 'meta[property="og:site_name"]'],
    ['locale', 'meta[property="og:locale"]'],
    ['publishedAt', 'meta[property="article:published_time"]'],
    ['publishedAt', 'meta[property="og:article:published_time"]'],
    ['keywords', 'meta[name="keywords"]'],
    ['twitterCreator', 'meta[name="twitter:creator"]'],
    ['twitterSite', 'meta[name="twitter:site"]'],
  ];

  const numericSelectors = [
    ['videoWidth', 'meta[property="og:video:width"]'],
    ['videoHeight', 'meta[property="og:video:height"]'],
    ['durationSeconds', 'meta[property="og:video:duration"]'],
    ['durationSeconds', 'meta[name="twitter:player:duration"]'],
    ['durationSeconds', 'meta[property="video:duration"]'],
  ];

  // Run all text selectors, numeric selectors, and author selector in parallel
  const textSelectorPromises = selectors.map(([field, selector]) => {
    const locator = page.locator(selector).first();
    const attr = selector.startsWith('link') ? 'href' : 'content';
    return locator.getAttribute(attr, { timeout: metadataSelectorTimeoutMs })
      .then((value) => ({ field, value: value || null }))
      .catch(() => ({ field, value: null }));
  });

  const numericSelectorPromises = numericSelectors.map(([field, selector]) => {
    const locator = page.locator(selector).first();
    return locator.getAttribute('content', { timeout: metadataSelectorTimeoutMs })
      .then((value) => ({ field, value: value || null, numeric: true }))
      .catch(() => ({ field, value: null, numeric: true }));
  });

  const authorSelectorPromise = page.locator('meta[name="author"]').first()
    .getAttribute('content', { timeout: metadataSelectorTimeoutMs })
    .then((value) => ({ field: 'author', value: value || null, isAuthor: true }))
    .catch(() => ({ field: 'author', value: null, isAuthor: true }));

  const allResults = await Promise.allSettled([
    ...textSelectorPromises,
    ...numericSelectorPromises,
    authorSelectorPromise,
  ]);

  // Apply text selector results (first non-empty value wins per field)
  for (let i = 0; i < selectors.length; i++) {
    const result = allResults[i];
    if (result.status === 'fulfilled' && result.value.value && !metadata[result.value.field]) {
      metadata[result.value.field] = result.value.value.trim();
    }
  }

  // Apply numeric selector results (first valid positive integer wins per field)
  for (let i = 0; i < numericSelectors.length; i++) {
    const result = allResults[selectors.length + i];
    if (result.status === 'fulfilled' && result.value.value) {
      const parsed = Number.parseInt(result.value.value, 10);
      if (Number.isFinite(parsed) && parsed > 0 && !metadata[result.value.field]) {
        metadata[result.value.field] = parsed;
      }
    }
  }

  // Apply author selector result
  const authorResult = allResults[selectors.length + numericSelectors.length];
  if (authorResult.status === 'fulfilled' && authorResult.value.value) {
    metadata.author = authorResult.value.value.trim();
  }

  if (!metadata.author && metadata.pageUrl) {
    try {
      const parsed = new URL(metadata.pageUrl);
      const first = parsed.pathname.split('/').filter(Boolean)[0] || '';
      if (first.startsWith('@')) {
        metadata.author = first;
      }
    } catch {
      // ignore parsing failures
    }
  }

  return metadata;
}

async function sampleAccessState(page, targetUrl) {
  const visibleTextPromise =
    page && typeof page.locator === 'function'
      ? page.locator('body').innerText().catch(() => '')
      : Promise.resolve('');

  const [title, visibleText, content, finalUrl] = await Promise.all([
    page.title().catch(() => ''),
    visibleTextPromise,
    page.content().catch(() => ''),
    Promise.resolve(typeof page.url === 'function' ? page.url() : targetUrl),
  ]);

  const accessState = assessAccessState({ title, visibleText, content, finalUrl });
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
    const contextPromise = launchPersistentContextWithRecovery(chromium, config)
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
  const chromium = resolveChromium(config.chromium);

  function isClosedContextError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /target page, context or browser has been closed/i.test(message);
  }

  async function openEphemeralPage() {
    const browser = await chromium.launch({
      headless: config.headless,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    return {
      page,
      async close() {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      },
    };
  }

  async function openNewPage() {
    let context;
    try {
      context = await getPersistentContext(config);
    } catch (error) {
      if (!isLaunchClosedError(error)) {
        throw error;
      }
      return openEphemeralPage();
    }

    try {
      const page = await context.newPage();
      return {
        page,
        async close() {
          await page.close();
        },
      };
    } catch (error) {
      if (!isClosedContextError(error)) {
        throw error;
      }

      await closePersistentContext().catch(() => {});
      try {
        const relaunched = await getPersistentContext(config);
        const page = await relaunched.newPage();
        return {
          page,
          async close() {
            await page.close();
          },
        };
      } catch (relaunchError) {
        if (!isLaunchClosedError(relaunchError)) {
          throw relaunchError;
        }
        return openEphemeralPage();
      }
    }
  }

  return async function pageFactory() {
    const opened = await openNewPage();
    const page = opened.page;
    const mediaUrls = new Set();
    const imageUrls = new Set();

    const onResponse = (response) => {
      try {
        if (isLikelyMediaResponse(response)) {
          mediaUrls.add(response.url());
        } else if (isLikelyImageResponse(response)) {
          imageUrls.add(response.url());
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
        const combined = new Set(mediaUrls);

        if (typeof page.content === 'function') {
          try {
            const content = await page.content();
            for (const url of extractMediaUrlsFromContent(content)) {
              combined.add(url);
            }
          } catch {
            // ignore content extraction failures
          }
        }

        // Extract structured video URLs from TikTok's embedded JSON data.
        // play_addr URLs from this source are non-watermarked HD.
        try {
          const rehydrationUrls = await extractTikTokRehydrationUrls(page);
          for (const entry of rehydrationUrls) {
            if (entry && typeof entry.url === 'string') {
              // Only add non-watermarked sources (play_addr, bitrate_variant, sigi_play_addr)
              // download_addr and sigi_download_addr are watermarked — exclude them
              if (entry.source !== 'download_addr' && entry.source !== 'sigi_download_addr') {
                combined.add(entry.url);
              }
            }
          }
        } catch {
          // ignore rehydration extraction failures
        }

        return Array.from(combined);
      },
      async collectImageUrls() {
        return Array.from(imageUrls);
      },
      async collectPostMetadata() {
        return readPostMetadata(page);
      },
      async close() {
        page.off('response', onResponse);
        await opened.close();
      },
    };
  };
}

/**
 * Returns true if a persistent context has been created and is potentially active.
 * This is a read-only check of the module-level variable — no side effects,
 * no browser launch. Used by auth-service to avoid instantiating Playwright
 * just to check auth status.
 */
function hasPersistentContext() {
  return persistentContextPromise !== null;
}

module.exports = {
  createPlaywrightPageFactory,
  getPersistentContext,
  closePersistentContext,
  getAdapterConfig,
  assessAccessState,
  extractTikTokRehydrationUrls,
  hasPersistentContext,
};
