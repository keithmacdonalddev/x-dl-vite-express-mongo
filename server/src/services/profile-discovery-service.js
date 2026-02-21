const fs = require('node:fs');
const path = require('node:path');
const { DiscoveredPost } = require('../core/data/discovered-post-model');
const { Job } = require('../core/models/job');
const { logger } = require('../core/lib/logger');
const { canonicalizePostUrl } = require('../core/utils/validation');
const { sanitizeAccountSlug } = require('../core/utils/account-profile');

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DISCOVERY_TIMEOUT_MS = toPositiveInt(process.env.DISCOVERY_TIMEOUT_MS, 120000);
const DISCOVERY_CAPTCHA_WAIT_MS = toPositiveInt(process.env.DISCOVERY_CAPTCHA_WAIT_MS, 60000);
const DISCOVERY_CAPTCHA_POLL_MS = toPositiveInt(process.env.DISCOVERY_CAPTCHA_POLL_MS, 2000);
const DISCOVERY_SCROLL_MAX_STEPS = toPositiveInt(process.env.DISCOVERY_SCROLL_MAX_STEPS, 60);
const DISCOVERY_SCROLL_PAUSE_MS = toPositiveInt(process.env.DISCOVERY_SCROLL_PAUSE_MS, 1500);
const DISCOVERY_SCROLL_STAGNANT_STEPS = toPositiveInt(process.env.DISCOVERY_SCROLL_STAGNANT_STEPS, 5);
const DISCOVERY_WRITE_CONCURRENCY = toPositiveInt(process.env.DISCOVERY_WRITE_CONCURRENCY, 4);
const THUMBNAIL_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  referer: 'https://www.tiktok.com/',
};
const DOWNLOADS_ROOT = path.resolve(process.cwd(), 'downloads');

function normalizeHandle(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const cleaned = value
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '');

  if (!cleaned || cleaned.toLowerCase() === 'unknown') {
    return '';
  }

  return `@${cleaned}`;
}

function toCanonicalHandle(value) {
  const normalized = normalizeHandle(value);
  return normalized ? normalized.slice(1).toLowerCase() : '';
}

function extractHandleFromPostUrl(postUrl) {
  try {
    const parsed = new URL(String(postUrl || ''));
    const first = (parsed.pathname || '/').split('/').filter(Boolean)[0] || '';
    if (!first.startsWith('@')) return '';
    return toCanonicalHandle(first);
  } catch {
    return '';
  }
}

function extractHandleFromTikTokUrl(tweetUrl) {
  try {
    const parsed = new URL(tweetUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length > 0 && parts[0].startsWith('@')) {
      return normalizeHandle(parts[0]);
    }
  } catch { /* ignore */ }
  return '';
}

function resolveDiscoveryHandle({ tweetUrl, accountHandle, accountSlug } = {}) {
  return (
    normalizeHandle(accountHandle) ||
    extractHandleFromTikTokUrl(tweetUrl) ||
    normalizeHandle(accountSlug)
  );
}

async function mapWithConcurrency(items, concurrency, worker) {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    })
  );
}

async function scrollProfileFeed(page, { traceId, handle } = {}) {
  if (!page || typeof page.evaluate !== 'function' || DISCOVERY_SCROLL_MAX_STEPS <= 0) {
    return;
  }

  let previousHeight = await page
    .evaluate(() => (document.body ? document.body.scrollHeight : 0))
    .catch(() => 0);
  let stagnantSteps = 0;
  let totalSteps = 0;
  let reachedEnd = false;

  for (let step = 0; step < DISCOVERY_SCROLL_MAX_STEPS; step += 1) {
    // Scroll both the window and any TikTok scrollable container (TikTok sometimes uses
    // a virtual scroll container instead of the document body).
    const endDetected = await page
      .evaluate(() => {
        const scrollHeight = document.body ? document.body.scrollHeight : 0;
        window.scrollTo(0, scrollHeight);

        // Also scroll the main content container if TikTok uses one
        const containers = [
          document.querySelector('[data-e2e="user-post-item-list"]')?.closest('[class*="scroll"]'),
          document.querySelector('main'),
          document.querySelector('[class*="DivUserPostList"]'),
        ].filter(Boolean);
        for (const el of containers) {
          try {
            el.scrollTo(0, el.scrollHeight);
          } catch { /* ignore */ }
        }

        // Detect TikTok's end-of-feed markers:
        // 1. Text-based end indicator
        const allText = document.body ? document.body.innerText : '';
        if (/no more (videos|results|content)/i.test(allText)) return true;

        // 2. data-e2e attribute for end of list
        const endMarkers = document.querySelectorAll(
          '[data-e2e="user-post-item-list-end"], [data-e2e="no-more-results"], [class*="NoMoreResults"], [class*="noMoreResults"]'
        );
        if (endMarkers.length > 0) return true;

        return false;
      })
      .catch(() => false);

    // Wait for TikTok's lazy-loaded content to appear after scroll
    await page.waitForTimeout(DISCOVERY_SCROLL_PAUSE_MS);

    const currentHeight = await page
      .evaluate(() => (document.body ? document.body.scrollHeight : 0))
      .catch(() => previousHeight);
    totalSteps = step + 1;

    if (endDetected) {
      reachedEnd = true;
      logger.info('discovery.scrape.scroll_end_detected', { traceId, handle, step: totalSteps });
      break;
    }

    if (currentHeight <= previousHeight) {
      stagnantSteps += 1;
    } else {
      stagnantSteps = 0;
    }

    previousHeight = Math.max(previousHeight, currentHeight);

    if (stagnantSteps >= DISCOVERY_SCROLL_STAGNANT_STEPS) {
      break;
    }
  }

  logger.info('discovery.scrape.scrolled', {
    traceId,
    handle,
    steps: totalSteps,
    stagnantSteps,
    finalHeight: previousHeight,
    reachedEnd,
  });
}

async function scrapeProfileVideos(handle, { traceId } = {}) {
  const profileUrl = `https://www.tiktok.com/${handle}`;
  const expectedHandle = toCanonicalHandle(handle);
  const { getPersistentContext } = require('./playwright-adapter');

  logger.info('discovery.scrape.started', { traceId, handle, profileUrl });

  let page = null;
  let context = null;

  try {
    context = await getPersistentContext();
    page = await context.newPage();

    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    // Try to wait for video grid to appear, fall back to fixed wait
    try {
      await page.waitForSelector('[data-e2e="user-post-item"], [data-e2e="user-post-item-list"], a[href*="/video/"]', { timeout: 10000 });
    } catch {
      // Grid selector not found — wait a fixed time and try anyway
      await page.waitForTimeout(5000);
    }

    // Check for CAPTCHA/bot challenge and wait for manual solve if needed
    const { assessAccessState } = require('./playwright-adapter');

    const pageTitle = await page.title().catch(() => '');
    const visibleText = await page.locator('body').innerText().catch(() => '');
    const finalUrl = typeof page.url === 'function' ? page.url() : profileUrl;
    const accessState = assessAccessState({ title: pageTitle, visibleText, content: '', finalUrl });

    if (accessState === 'BOT_CHALLENGE') {
      logger.info('discovery.scrape.captcha_detected', { traceId, handle });

      // Poll for manual solve and give the profile feed a chance to render.
      const pollMs = DISCOVERY_CAPTCHA_POLL_MS;
      const maxAttempts = Math.max(1, Math.ceil(DISCOVERY_CAPTCHA_WAIT_MS / pollMs));
      let solved = false;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await page.waitForTimeout(pollMs);
        const retryTitle = await page.title().catch(() => '');
        const retryText = await page.locator('body').innerText().catch(() => '');
        const retryUrl = typeof page.url === 'function' ? page.url() : profileUrl;
        const retryState = assessAccessState({ title: retryTitle, visibleText: retryText, content: '', finalUrl: retryUrl });

        if (!retryState) {
          solved = true;
          logger.info('discovery.scrape.captcha_solved', { traceId, handle, attempts: attempt + 1 });
          // Wait a bit more for grid to render after solve
          await page.waitForTimeout(3000);
          break;
        }
      }

      if (!solved) {
        logger.error('discovery.scrape.captcha_timeout', { traceId, handle });
        return { posts: [], avatarUrl: '' };
      }
    }

    await scrollProfileFeed(page, { traceId, handle });

    // Diagnostic screenshot
    const screenshotDir = path.resolve(process.cwd(), 'tmp');
    await fs.promises.mkdir(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `discovery-debug-${handle.replace('@', '')}-${Date.now()}.png`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      logger.info('discovery.scrape.screenshot', { traceId, handle, screenshotPath });
    } catch (screenshotErr) {
      logger.error('discovery.scrape.screenshot_failed', { traceId, handle, message: screenshotErr.message || String(screenshotErr) });
    }

    const evalResult = await page.evaluate(({ expectedHandle }) => {
      const resultsByUrl = new Map();
      const normalizeHandleLocal = (value) => {
        const cleaned = String(value || '')
          .trim()
          .replace(/^@+/, '')
          .replace(/[^a-zA-Z0-9._-]+/g, '')
          .toLowerCase();
        return cleaned;
      };
      const extractPostInfo = (postUrl) => {
        try {
          const parsed = new URL(String(postUrl || ''), window.location.origin);
          const parts = parsed.pathname.split('/').filter(Boolean);
          const first = parts[0] || '';
          const second = parts[1] || '';
          const third = parts[2] || '';
          const handlePart = first.startsWith('@') ? normalizeHandleLocal(first) : '';
          const hasVideoPath = second === 'video' && /^\d+$/.test(third);
          return {
            url: parsed.toString(),
            handle: handlePart,
            hasVideoPath,
          };
        } catch {
          return { url: '', handle: '', hasVideoPath: false };
        }
      };
      const extractBestImageUrl = (img) => {
        if (!img) return '';
        const srcset = img.getAttribute('srcset') || '';
        if (srcset) {
          const options = srcset
            .split(',')
            .map((entry) => entry.trim().split(/\s+/)[0] || '')
            .filter(Boolean);
          if (options.length > 0) {
            return options[options.length - 1];
          }
        }
        return img.getAttribute('src') || img.getAttribute('data-src') || '';
      };
      const addResult = (postUrl, thumbnailUrl, title, sourceScore = 1) => {
        const info = extractPostInfo(postUrl);
        if (!info.url || !info.hasVideoPath) return;
        if (expectedHandle && info.handle !== expectedHandle) return;

        const existing = resultsByUrl.get(info.url) || {
          postUrl: info.url,
          thumbnailUrl: '',
          title: '',
          _sourceScore: 0,
        };
        const nextThumbnail = String(thumbnailUrl || '').trim();
        const nextTitle = String(title || '').trim();

        const shouldUpgradeSource = sourceScore > (existing._sourceScore || 0);
        if ((shouldUpgradeSource || !existing.thumbnailUrl) && nextThumbnail) {
          existing.thumbnailUrl = nextThumbnail;
        }
        if ((shouldUpgradeSource || !existing.title) && nextTitle) {
          existing.title = nextTitle;
        }
        existing._sourceScore = Math.max(existing._sourceScore || 0, sourceScore);

        resultsByUrl.set(info.url, existing);
      };

      // Strategy 1: data-e2e user-post-item links
      const postItems = document.querySelectorAll('[data-e2e="user-post-item"] a[href*="/video/"]');
      for (const anchor of postItems) {
        const href = anchor.getAttribute('href') || '';
        const img = anchor.querySelector('img');
        const thumbUrl = extractBestImageUrl(img);
        const alt = (img && img.getAttribute('alt')) || anchor.getAttribute('aria-label') || '';
        addResult(href, thumbUrl, alt, 2);
      }

      // Strategy 2: broader anchor scan for profile posts.
      const allAnchors = document.querySelectorAll('a[href*="/@"][href*="/video/"]');
      for (const anchor of allAnchors) {
        const href = anchor.getAttribute('href') || '';
        const img = anchor.querySelector('img');
        const thumbUrl = extractBestImageUrl(img);
        const alt = (img && img.getAttribute('alt')) || anchor.getAttribute('aria-label') || '';
        addResult(href, thumbUrl, alt, 1);
      }

      // Strategy 3: __UNIVERSAL_DATA_FOR_REHYDRATION__ profile data.
      const rehydrationScript = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (rehydrationScript) {
        try {
          const data = JSON.parse(rehydrationScript.textContent || '{}');
          const defaultScope = data['__DEFAULT_SCOPE__'] || {};
          const userDetail = defaultScope['webapp.user-detail'] || {};
          const userPage = defaultScope['webapp.user-page'] || {};

          const itemLists = [userPage.itemList, userDetail.itemList]
            .map((list) => {
              if (Array.isArray(list)) return list;
              if (list && typeof list === 'object') return Object.values(list);
              return [];
            })
            .flat();

          for (const item of itemLists) {
            if (!item || !item.id) continue;
            const author = item.author || {};
            const authorHandle = author.uniqueId || '';
            const videoId = item.id;
            const postUrl = authorHandle ? 'https://www.tiktok.com/@' + authorHandle + '/video/' + videoId : '';
            const thumbUrl = (item.video && item.video.cover) || (item.video && item.video.originCover) || '';
            const title = item.desc || '';
            addResult(postUrl, thumbUrl, title, 3);
          }
        } catch {
          // Ignore parse failures.
        }
      }

      // Strategy 4: SIGI_STATE fallback for older pages.
      const sigiScript = document.getElementById('SIGI_STATE');
      if (sigiScript) {
        try {
          const data = JSON.parse(sigiScript.textContent || '{}');
          const itemModule = data.ItemModule || {};
          for (const key of Object.keys(itemModule)) {
            const item = itemModule[key];
            if (!item || !item.id) continue;
            const authorHandle =
              item.author ||
              (item.authorInfo && item.authorInfo.uniqueId) ||
              '';
            const postUrl = authorHandle ? 'https://www.tiktok.com/@' + authorHandle + '/video/' + item.id : '';
            const thumbUrl =
              (item.video && item.video.cover) ||
              (item.video && item.video.originCover) ||
              '';
            const title = item.desc || '';
            addResult(postUrl, thumbUrl, title, 3);
          }
        } catch {
          // Ignore parse failures.
        }
      }

      // Extract profile avatar from rehydration or DOM — scoped to the target profile
      let avatarUrl = '';
      if (rehydrationScript) {
        try {
          const data = JSON.parse(rehydrationScript.textContent || '{}');
          const defaultScope = data['__DEFAULT_SCOPE__'] || {};
          const userDetail = defaultScope['webapp.user-detail'] || {};
          const userPage = defaultScope['webapp.user-page'] || {};

          // Try userDetail first (most reliable), then userPage
          const userInfo =
            userDetail.userInfo?.user ||
            userPage.userInfo?.user ||
            userDetail.user ||
            userPage.user ||
            null;

          if (userInfo) {
            // Prefer avatarLarger > avatarMedium > avatarThumb (in descending quality)
            avatarUrl =
              userInfo.avatarLarger ||
              userInfo.avatarMedium ||
              userInfo.avatarThumb ||
              '';
            // Filter out data URIs and non-http values
            if (avatarUrl && !avatarUrl.startsWith('http')) avatarUrl = '';
          }
        } catch { /* ignore */ }
      }

      // Fallback: scrape avatar from the DOM profile header
      if (!avatarUrl) {
        const avatarSelectors = [
          '[data-e2e="user-avatar"] img',
          '[class*="AvatarWrapper"] img',
          '[class*="user-avatar"] img',
          'header img[class*="avatar"]',
          'header img[alt*="avatar"]',
        ];
        for (const sel of avatarSelectors) {
          const img = document.querySelector(sel);
          if (img) {
            const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
            if (src && src.startsWith('http')) {
              avatarUrl = src;
              break;
            }
          }
        }
      }

      return {
        items: Array.from(resultsByUrl.values()).map(({ _sourceScore, ...rest }) => rest),
        avatarUrl,
      };
    }, { expectedHandle });

    const { items: rawItems, avatarUrl: scrapedAvatarUrl } = evalResult;

    const expectedHandleMatches = [];
    const dedupedItems = Array.from(
      new Map(
        rawItems
          .map((item) => {
            const fullUrl = item.postUrl.startsWith('http')
              ? item.postUrl
              : `https://www.tiktok.com${item.postUrl}`;
            const canonicalUrl = canonicalizePostUrl(fullUrl) || fullUrl;

            // Extract video ID from URL
            const videoIdMatch = fullUrl.match(/\/video\/(\d+)/);
            const videoId = videoIdMatch ? videoIdMatch[1] : '';

            return [
              canonicalUrl,
              {
                postUrl: fullUrl,
                canonicalUrl,
                thumbnailUrl: item.thumbnailUrl || '',
                title: item.title || '',
                videoId,
              },
            ];
          })
          .filter(([canonicalUrl]) => Boolean(canonicalUrl))
      ).values()
    );

    for (const item of dedupedItems) {
      const itemHandle = extractHandleFromPostUrl(item.postUrl);
      if (!expectedHandle || itemHandle === expectedHandle) {
        expectedHandleMatches.push(item);
      }
    }

    // Diagnostic DOM snippet
    if (expectedHandleMatches.length === 0) {
      try {
        const bodySnippet = await page.evaluate(() => {
          const body = document.body;
          if (!body) return 'NO BODY';
          return JSON.stringify({
            title: document.title,
            url: window.location.href,
            bodyText: body.innerText.slice(0, 1500),
            scriptIds: Array.from(document.querySelectorAll('script[id]')).map((s) => s.id),
            anchorCount: document.querySelectorAll('a').length,
            videoLinkCount: document.querySelectorAll('a[href*="/video/"]').length,
            hasRehydration: !!document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__'),
          });
        });
        logger.info('discovery.scrape.dom_debug', { traceId, handle, bodySnippet });
      } catch { /* ignore */ }
    }

    logger.info('discovery.scrape.completed', {
      traceId,
      handle,
      itemCount: expectedHandleMatches.length,
      rawItemCount: dedupedItems.length,
      hasAvatar: Boolean(scrapedAvatarUrl),
    });

    return { posts: expectedHandleMatches, avatarUrl: scrapedAvatarUrl || '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.scrape.failed', { traceId, handle, message });
    return { posts: [], avatarUrl: '' };
  } finally {
    if (page && typeof page.close === 'function') {
      await page.close().catch(() => {});
    }
  }
}

async function saveFetchResponseBody(response, targetPath) {
  if (!response || !response.body) {
    return '';
  }

  const { Readable } = require('node:stream');
  const { pipeline } = require('node:stream/promises');
  const output = fs.createWriteStream(targetPath);
  await pipeline(Readable.fromWeb(response.body), output);

  const fileStat = await fs.promises.stat(targetPath);
  return Number.isFinite(fileStat.size) && fileStat.size > 0 ? targetPath : '';
}

async function savePlaywrightResponseBody(response, targetPath) {
  if (!response || typeof response.body !== 'function') {
    return '';
  }

  const body = await response.body();
  if (!Buffer.isBuffer(body) || body.byteLength === 0) {
    return '';
  }

  await fs.promises.writeFile(targetPath, body);
  return targetPath;
}

async function downloadThumbnail(thumbnailUrl, targetPath, { traceId } = {}) {
  if (!thumbnailUrl || !thumbnailUrl.startsWith('http')) return '';

  try {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

    let response = null;
    try {
      response = await fetch(thumbnailUrl, { headers: THUMBNAIL_HEADERS });
    } catch (fetchErr) {
      logger.info('discovery.thumbnail.fetch_failed', {
        traceId,
        thumbnailUrl,
        message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      });
    }

    if (response && response.ok && response.body) {
      const contentType = typeof response.headers?.get === 'function'
        ? (response.headers.get('content-type') || '').toLowerCase()
        : '';
      if (contentType && !contentType.startsWith('image/')) {
        logger.info('discovery.thumbnail.fetch_non_image', { traceId, thumbnailUrl, contentType });
      } else {
        const outputPath = await saveFetchResponseBody(response, targetPath);
        if (outputPath) {
          return outputPath;
        }
      }
    }

    const status = response && Number.isFinite(response.status) ? response.status : -1;
    if (status !== -1 && status !== 401 && status !== 403) {
      return '';
    }

    const { getPersistentContext } = require('./playwright-adapter');
    const context = await getPersistentContext();
    const authResponse = await context.request.get(thumbnailUrl, {
      headers: THUMBNAIL_HEADERS,
    });

    if (!authResponse || !authResponse.ok()) {
      return '';
    }

    const authHeaders = typeof authResponse.headers === 'function' ? authResponse.headers() : {};
    const authContentType = String(authHeaders['content-type'] || '').toLowerCase();
    if (authContentType && !authContentType.startsWith('image/')) {
      logger.info('discovery.thumbnail.auth_non_image', { traceId, thumbnailUrl, contentType: authContentType });
      return '';
    }

    return savePlaywrightResponseBody(authResponse, targetPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.thumbnail.failed', { traceId, thumbnailUrl, message });
    return '';
  }
}

async function triggerProfileDiscovery({ tweetUrl, accountSlug, accountHandle, traceId } = {}) {
  const handle = resolveDiscoveryHandle({ tweetUrl, accountHandle, accountSlug });
  if (!handle) {
    logger.info('discovery.trigger.no_handle', { traceId, tweetUrl, accountHandle, accountSlug });
    return;
  }

  const slug = accountSlug || sanitizeAccountSlug(handle);
  const startedAt = Date.now();

  logger.info('discovery.trigger.started', { traceId, handle, slug });

  const timeoutPromise = new Promise((_, reject) => {
    const timeoutHandle = setTimeout(() => reject(new Error('Discovery timed out')), DISCOVERY_TIMEOUT_MS);
    timeoutHandle.unref?.();
  });

  try {
    const scrapeResult = await Promise.race([
      scrapeProfileVideos(handle, { traceId }),
      timeoutPromise,
    ]);

    const { posts: scrapedPosts, avatarUrl } = scrapeResult || { posts: [], avatarUrl: '' };

    if (!Array.isArray(scrapedPosts) || scrapedPosts.length === 0) {
      logger.info('discovery.trigger.no_items', { traceId, handle, slug });
      return;
    }

    const dedupedItems = Array.from(new Map(scrapedPosts.map((item) => [item.canonicalUrl, item])).values());
    const discoveredCanonicalUrls = dedupedItems
      .map((item) => item.canonicalUrl)
      .filter((value) => typeof value === 'string' && value);

    // Dedup globally: skip anything already known in jobs/discovered posts anywhere in the app.
    const [existingJobUrls, existingDiscoveredUrls] = await Promise.all([
      discoveredCanonicalUrls.length > 0
        ? Job.distinct('canonicalUrl', { canonicalUrl: { $in: discoveredCanonicalUrls } })
        : [],
      discoveredCanonicalUrls.length > 0
        ? DiscoveredPost.distinct('canonicalUrl', { canonicalUrl: { $in: discoveredCanonicalUrls } })
        : [],
    ]);
    const knownUrls = new Set([...existingJobUrls, ...existingDiscoveredUrls]);
    const newItems = dedupedItems.filter((item) => !knownUrls.has(item.canonicalUrl));

    // Download the target profile's avatar (not the logged-in user's avatar).
    // Save it at downloads/<slug>/avatar.jpg so the client can show the real profile picture.
    const accountDir = path.join(DOWNLOADS_ROOT, slug);
    if (avatarUrl) {
      const avatarPath = path.join(accountDir, 'avatar.jpg');
      downloadThumbnail(avatarUrl, avatarPath, { traceId }).then((savedPath) => {
        if (savedPath) {
          logger.info('discovery.avatar.saved', { traceId, handle, slug, savedPath });
        } else {
          logger.info('discovery.avatar.not_saved', { traceId, handle, slug, avatarUrl });
        }
      }).catch(() => {});
    }

    if (newItems.length === 0) {
      logger.info('discovery.trigger.all_known', {
        traceId,
        handle,
        slug,
        totalScraped: dedupedItems.length,
      });
      return;
    }

    logger.info('discovery.trigger.new_items', {
      traceId,
      handle,
      slug,
      newCount: newItems.length,
      totalScraped: dedupedItems.length,
    });

    // Create DiscoveredPost documents and download thumbnails.
    // Use bounded concurrency so signed thumbnail URLs are fetched sooner (they expire quickly).
    const discoveredDir = path.join(DOWNLOADS_ROOT, slug, 'discovered');

    // First pass: create DB docs and download thumbnails concurrently.
    // Track which items need thumbnail retry (failed on first attempt).
    const retryItems = [];

    await mapWithConcurrency(newItems, DISCOVERY_WRITE_CONCURRENCY, async (item) => {
      try {
        const doc = await DiscoveredPost.create({
          accountSlug: slug,
          accountHandle: handle,
          accountPlatform: 'tiktok',
          postUrl: item.postUrl,
          canonicalUrl: item.canonicalUrl,
          thumbnailUrl: item.thumbnailUrl,
          videoId: item.videoId,
          title: item.title,
        });

        if (item.thumbnailUrl) {
          const thumbFilename = `${item.videoId || doc._id.toString()}.jpg`;
          const thumbPath = path.join(discoveredDir, thumbFilename);
          const savedPath = await downloadThumbnail(item.thumbnailUrl, thumbPath, { traceId });
          if (savedPath) {
            const relativePath = path.relative(process.cwd(), savedPath).split(path.sep).join('/');
            await DiscoveredPost.findByIdAndUpdate(doc._id, { thumbnailPath: relativePath });
          } else {
            // Queue for retry — TikTok signed URLs have short expiry so retry once immediately
            retryItems.push({ doc, item, thumbFilename, thumbPath });
          }
        }
      } catch (error) {
        // Skip duplicates (unique index violation on canonicalUrl).
        if (error && error.code === 11000) return;
        const message = error instanceof Error ? error.message : String(error);
        logger.error('discovery.create.failed', {
          traceId,
          postUrl: item.postUrl,
          message,
        });
      }
    });

    // Second pass: retry failed thumbnail downloads once.
    if (retryItems.length > 0) {
      logger.info('discovery.thumbnail.retry', { traceId, handle, slug, count: retryItems.length });
      await mapWithConcurrency(retryItems, DISCOVERY_WRITE_CONCURRENCY, async ({ doc, item, thumbPath }) => {
        try {
          const savedPath = await downloadThumbnail(item.thumbnailUrl, thumbPath, { traceId });
          if (savedPath) {
            const relativePath = path.relative(process.cwd(), savedPath).split(path.sep).join('/');
            await DiscoveredPost.findByIdAndUpdate(doc._id, { thumbnailPath: relativePath });
          }
        } catch { /* ignore retry failures */ }
      });
    }

    logger.info('discovery.trigger.completed', {
      traceId,
      handle,
      slug,
      newCount: newItems.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.trigger.failed', {
      traceId,
      handle,
      slug,
      message,
      durationMs: Date.now() - startedAt,
    });
  }
}

module.exports = {
  triggerProfileDiscovery,
  scrapeProfileVideos,
  extractHandleFromTikTokUrl,
  resolveDiscoveryHandle,
  normalizeHandle,
};
