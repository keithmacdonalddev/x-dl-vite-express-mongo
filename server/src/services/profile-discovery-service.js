'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DiscoveredPost } = require('../core/data/discovered-post-model');
const { Job } = require('../core/models/job');
const { logger } = require('../core/lib/logger');
const { canonicalizePostUrl } = require('../core/utils/validation');
const { sanitizeAccountSlug } = require('../core/utils/account-profile');

// ---------------------------------------------------------------------------
// Config — env-backed with defaults
// ---------------------------------------------------------------------------

function getConfig() {
  return {
    DISCOVERY_TIMEOUT_MS: parseInt(process.env.DISCOVERY_TIMEOUT_MS || '120000', 10),
    DISCOVERY_CAPTCHA_WAIT_MS: parseInt(process.env.DISCOVERY_CAPTCHA_WAIT_MS || '60000', 10),
    DISCOVERY_CAPTCHA_POLL_MS: parseInt(process.env.DISCOVERY_CAPTCHA_POLL_MS || '2000', 10),
    DISCOVERY_SCROLL_MAX_STEPS: parseInt(process.env.DISCOVERY_SCROLL_MAX_STEPS || '60', 10),
    DISCOVERY_SCROLL_PAUSE_MS: parseInt(process.env.DISCOVERY_SCROLL_PAUSE_MS || '600', 10),
    DISCOVERY_SCROLL_STAGNANT_STEPS: parseInt(process.env.DISCOVERY_SCROLL_STAGNANT_STEPS || '3', 10),
    DISCOVERY_WRITE_CONCURRENCY: parseInt(process.env.DISCOVERY_WRITE_CONCURRENCY || '4', 10),
  };
}

const DOWNLOADS_ROOT = path.resolve(process.cwd(), 'downloads');

// ---------------------------------------------------------------------------
// Handle utilities
// ---------------------------------------------------------------------------

/**
 * Normalize a TikTok handle: trim whitespace, ensure @ prefix.
 * Returns empty string for invalid/unknown values (not null, for test compat).
 */
function normalizeHandle(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Reject known-bad sentinel values
  const stripped = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (!stripped || stripped === 'unknown' || stripped === '@@') return '';
  // Reject all-at-sign values (e.g. "@@@")
  if (/^@+$/.test(stripped)) return '';
  return '@' + stripped;
}

/**
 * Extract a TikTok handle from a canonical post URL.
 * e.g. https://www.tiktok.com/@sample_user/video/123 → '@sample_user'
 */
function extractHandleFromTikTokUrl(tweetUrl) {
  try {
    const parsed = new URL(tweetUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length > 0 && parts[0].startsWith('@')) {
      return parts[0];
    }
  } catch { /* ignore */ }
  return '';
}

/**
 * Resolve the best TikTok handle for discovery.
 * - For short links (vm.tiktok.com, vt.tiktok.com) or any URL without a handle
 *   in the path, prefer the explicit accountHandle parameter.
 * - Fall back to '@' + accountSlug when accountHandle is empty/invalid.
 * Returns a normalized handle string (with @ prefix), or empty string if unresolvable.
 */
function resolveDiscoveryHandle({ tweetUrl, accountHandle, accountSlug } = {}) {
  // Normalize the explicit handle first
  const normalizedExplicit = normalizeHandle(accountHandle || '');

  // Check if the URL itself contains a handle in the path
  const urlHandle = extractHandleFromTikTokUrl(tweetUrl || '');

  // Prefer explicit accountHandle for short links (no handle in URL)
  if (!urlHandle && normalizedExplicit) {
    return normalizedExplicit;
  }

  // If URL has a handle, prefer it (canonical form)
  if (urlHandle) {
    return urlHandle;
  }

  // Fall back to accountSlug
  if (accountSlug) {
    const slugHandle = normalizeHandle(accountSlug);
    if (slugHandle) return slugHandle;
  }

  return '';
}

// ---------------------------------------------------------------------------
// Thumbnail download
// ---------------------------------------------------------------------------

async function downloadThumbnail(thumbnailUrl, targetPath, { traceId } = {}) {
  if (!thumbnailUrl || !thumbnailUrl.startsWith('http')) return '';

  let output = null;
  try {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

    const response = await fetch(thumbnailUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        referer: 'https://www.tiktok.com/',
      },
    });

    // Validate response status
    if (!response.ok) {
      logger.warn('discovery.thumbnail.bad_status', {
        traceId,
        thumbnailUrl,
        status: response.status,
      });
      return '';
    }

    if (!response.body) {
      logger.warn('discovery.thumbnail.no_body', { traceId, thumbnailUrl });
      return '';
    }

    // Validate content-type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      logger.warn('discovery.thumbnail.bad_content_type', {
        traceId,
        thumbnailUrl,
        contentType,
      });
      return '';
    }

    const { Readable } = require('node:stream');
    const { pipeline } = require('node:stream/promises');
    output = fs.createWriteStream(targetPath);
    await pipeline(Readable.fromWeb(response.body), output);

    return targetPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.thumbnail.failed', { traceId, thumbnailUrl, message });

    // Delete partial file if it exists
    try {
      await fs.promises.unlink(targetPath);
    } catch { /* ignore — file may not exist */ }

    return '';
  }
}

// ---------------------------------------------------------------------------
// Profile scrape
// ---------------------------------------------------------------------------

async function scrapeProfileVideos(handle, { traceId } = {}) {
  const config = getConfig();
  const profileUrl = `https://www.tiktok.com/${handle}`;
  const { getPersistentContext } = require('./playwright-adapter');

  logger.info('discovery.scrape.started', { traceId, handle, profileUrl });

  let page = null;
  let context = null;

  const scrapeTimeoutMs = Math.floor(config.DISCOVERY_TIMEOUT_MS * 0.7);
  const scrapeStartedAt = Date.now();

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
      await page.waitForTimeout(3000);
    }

    // Check for CAPTCHA/bot challenge and wait for manual solve if needed
    const { assessAccessState } = require('./playwright-adapter');

    const pageTitle = await page.title().catch(() => '');
    const visibleText = await page.locator('body').innerText().catch(() => '');
    const finalUrl = typeof page.url === 'function' ? page.url() : profileUrl;
    const accessState = assessAccessState({ title: pageTitle, visibleText, content: '', finalUrl });

    if (accessState === 'BOT_CHALLENGE') {
      logger.info('discovery.scrape.captcha_detected', { traceId, handle });

      const pollMs = config.DISCOVERY_CAPTCHA_POLL_MS;
      const maxAttempts = Math.floor(config.DISCOVERY_CAPTCHA_WAIT_MS / pollMs);
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
          await page.waitForTimeout(3000);
          break;
        }
      }

      if (!solved) {
        logger.error('discovery.scrape.captcha_timeout', { traceId, handle });
        return { items: [], profileAvatarUrl: '', stats: { rawCount: 0, filteredCount: 0, itemCount: 0 } };
      }
    }

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

    // ---------------------------------------------------------------------------
    // Bounded scroll loop
    // ---------------------------------------------------------------------------
    let stagnantCount = 0;
    let lastHeight = await page.evaluate(() => document.body.scrollHeight).catch(() => 0);

    for (let step = 0; step < config.DISCOVERY_SCROLL_MAX_STEPS; step++) {
      // Elapsed-time guard: don't exceed 70% of DISCOVERY_TIMEOUT_MS
      if (Date.now() - scrapeStartedAt > scrapeTimeoutMs) {
        logger.info('discovery.scrape.scroll_timeout_guard', {
          traceId,
          handle,
          step,
          elapsedMs: Date.now() - scrapeStartedAt,
        });
        break;
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(config.DISCOVERY_SCROLL_PAUSE_MS);

      const newHeight = await page.evaluate(() => document.body.scrollHeight).catch(() => lastHeight);

      logger.info('discovery.scrape.scrolled', {
        traceId,
        handle,
        step,
        height: lastHeight,
        newHeight,
      });

      if (newHeight <= lastHeight) {
        stagnantCount++;
        logger.info('discovery.scrape.scroll_stagnated', {
          traceId,
          handle,
          step,
          stagnantCount,
        });

        if (stagnantCount >= config.DISCOVERY_SCROLL_STAGNANT_STEPS) {
          logger.info('discovery.scrape.end_of_feed', { traceId, handle, step });
          break;
        }
      } else {
        stagnantCount = 0;
        lastHeight = newHeight;
      }
    }

    // ---------------------------------------------------------------------------
    // Multi-strategy extraction with in-browser dedupe
    // ---------------------------------------------------------------------------
    const targetHandleLower = handle.toLowerCase();

    const rawItems = await page.evaluate((targetHandleLower) => {
      const seen = new Set();
      const results = [];

      function addItem(postUrl, thumbnailUrl, title, avatarUrl) {
        if (!postUrl) return;
        const key = postUrl.split('?')[0]; // canonical key (no query params)
        if (seen.has(key)) return;
        seen.add(key);
        results.push({ postUrl, thumbnailUrl: thumbnailUrl || '', title: title || '', avatarUrl: avatarUrl || '' });
      }

      // Strategy 1: data-e2e user-post-item links
      const postItems = document.querySelectorAll('[data-e2e="user-post-item"] a[href*="/video/"]');
      for (const anchor of postItems) {
        const href = anchor.getAttribute('href') || '';
        const img = anchor.querySelector('img');
        const thumbUrl = img ? (img.getAttribute('src') || '') : '';
        const alt = img ? (img.getAttribute('alt') || '') : '';
        if (href) {
          const fullUrl = href.startsWith('http') ? href : 'https://www.tiktok.com' + href;
          addItem(fullUrl, thumbUrl, alt, '');
        }
      }

      // Strategy 2: broader anchor fallback — any anchor with /@<handle>/video/
      const allAnchors = document.querySelectorAll('a[href*="/@"][href*="/video/"]');
      for (const anchor of allAnchors) {
        const href = anchor.getAttribute('href') || '';
        const img = anchor.querySelector('img');
        const thumbUrl = img ? (img.getAttribute('src') || '') : '';
        const alt = img ? (img.getAttribute('alt') || '') : '';
        if (href) {
          const fullUrl = href.startsWith('http') ? href : 'https://www.tiktok.com' + href;
          addItem(fullUrl, thumbUrl, alt, '');
        }
      }

      let profileAvatarUrl = '';

      // Strategy 3: __UNIVERSAL_DATA_FOR_REHYDRATION__
      const rehydrationScript = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (rehydrationScript) {
        try {
          const data = JSON.parse(rehydrationScript.textContent || '{}');
          const defaultScope = data['__DEFAULT_SCOPE__'] || {};
          const userDetail = defaultScope['webapp.user-detail'] || {};
          const userPage = defaultScope['webapp.user-page'] || {};
          const userInfo = (userDetail.userInfo || {});
          const avatarUser = userInfo.user || {};

          // Extract avatar from user info
          if (!profileAvatarUrl) {
            profileAvatarUrl = avatarUser.avatarLarger || avatarUser.avatarMedium || avatarUser.avatarThumb || '';
          }

          const itemList = userPage.itemList || userDetail.itemList || [];
          if (Array.isArray(itemList)) {
            for (const item of itemList) {
              if (!item || !item.id) continue;
              const author = item.author || {};
              const itemHandle = author.uniqueId || '';
              const videoId = item.id;
              const postUrl = itemHandle ? 'https://www.tiktok.com/@' + itemHandle + '/video/' + videoId : '';
              const thumbUrl = (item.video && item.video.cover) || (item.video && item.video.originCover) || '';
              const title = item.desc || '';
              if (!profileAvatarUrl) {
                profileAvatarUrl = author.avatarLarger || author.avatarMedium || author.avatarThumb || '';
              }
              addItem(postUrl, thumbUrl, title, '');
            }
          }
        } catch { /* ignore */ }
      }

      // Strategy 4: SIGI_STATE fallback
      if (results.length === 0) {
        const scripts = document.querySelectorAll('script[id="SIGI_STATE"], script#SIGI_STATE');
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent || '{}');
            const itemModule = data.ItemModule || {};
            for (const [videoId, item] of Object.entries(itemModule)) {
              if (!item || !item.author) continue;
              const itemHandle = item.author || '';
              const postUrl = 'https://www.tiktok.com/@' + itemHandle + '/video/' + videoId;
              const video = item.video || {};
              const thumbUrl = video.cover || video.originCover || '';
              const title = item.desc || '';
              if (!profileAvatarUrl) {
                const authorInfo = (data.UserModule || {}).users || {};
                const authorData = authorInfo[itemHandle] || {};
                profileAvatarUrl = authorData.avatarLarger || authorData.avatarMedium || authorData.avatarThumb || '';
              }
              addItem(postUrl, thumbUrl, title, '');
            }
          } catch { /* ignore */ }
          break; // only first match
        }
      }

      // Try meta tags for avatar as last resort
      if (!profileAvatarUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) profileAvatarUrl = ogImage.getAttribute('content') || '';
      }

      return { results, profileAvatarUrl };
    }, targetHandleLower);

    const allRaw = rawItems.results || [];
    const profileAvatarUrl = rawItems.profileAvatarUrl || '';
    const rawCount = allRaw.length;

    // Diagnostic DOM snippet if nothing found
    if (allRaw.length === 0) {
      try {
        const bodySnippet = await page.evaluate(() => {
          const body = document.body;
          if (!body) return 'NO BODY';
          return JSON.stringify({
            title: document.title,
            url: window.location.href,
            bodyText: body.innerText.slice(0, 1500),
            scriptIds: Array.from(document.querySelectorAll('script[id]')).map(s => s.id),
            anchorCount: document.querySelectorAll('a').length,
            videoLinkCount: document.querySelectorAll('a[href*="/video/"]').length,
            hasRehydration: !!document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__'),
          });
        });
        logger.info('discovery.scrape.dom_debug', { traceId, handle, bodySnippet });
      } catch { /* ignore */ }
    }

    // ---------------------------------------------------------------------------
    // Parse + strict filter: only accept URLs matching the target handle
    // ---------------------------------------------------------------------------
    const TIKTOK_VIDEO_RE = /^https:\/\/www\.tiktok\.com\/@([^/]+)\/video\/(\d+)/i;

    const items = [];
    for (const raw of allRaw) {
      const fullUrl = raw.postUrl.startsWith('http')
        ? raw.postUrl
        : `https://www.tiktok.com${raw.postUrl}`;

      // Reject non-TikTok or malformed URLs early
      let parsed;
      try {
        parsed = new URL(fullUrl);
      } catch {
        continue;
      }
      if (!parsed.hostname.endsWith('tiktok.com')) continue;

      // Strict filter: only accept the requested handle
      const match = TIKTOK_VIDEO_RE.exec(fullUrl);
      if (!match) continue;
      const urlHandle = '@' + match[1];
      if (urlHandle.toLowerCase() !== handle.toLowerCase()) continue;

      const videoId = match[2];
      // Canonicalize (strip query params for the canonical form)
      const canonBase = `https://www.tiktok.com/${urlHandle}/video/${videoId}`;
      const canonicalUrl = canonicalizePostUrl(canonBase) || canonBase;

      items.push({
        postUrl: canonBase,
        canonicalUrl,
        thumbnailUrl: raw.thumbnailUrl || '',
        title: raw.title || '',
        videoId,
      });
    }

    const filteredCount = allRaw.length - items.length;

    logger.info('discovery.scrape.completed', {
      traceId,
      handle,
      rawCount,
      filteredCount,
      itemCount: items.length,
    });

    return {
      items,
      profileAvatarUrl,
      stats: { rawCount, filteredCount, itemCount: items.length },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.scrape.failed', { traceId, handle, message });
    return { items: [], profileAvatarUrl: '', stats: { rawCount: 0, filteredCount: 0, itemCount: 0 } };
  } finally {
    if (page && typeof page.close === 'function') {
      await page.close().catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Trigger (orchestrator)
// ---------------------------------------------------------------------------

async function triggerProfileDiscovery({
  tweetUrl,
  accountSlug,
  accountHandle,
  accountDisplayName,
  sourceJobId,
  traceId,
} = {}) {
  const config = getConfig();

  const handle = resolveDiscoveryHandle({ tweetUrl, accountHandle, accountSlug });
  if (!handle) {
    logger.info('discovery.trigger.no_handle', {
      traceId,
      tweetUrl,
      accountHandle,
      accountSlug,
      accountDisplayName,
      sourceJobId,
    });
    return;
  }

  const slug = accountSlug || sanitizeAccountSlug(handle);
  const startedAt = Date.now();

  logger.info('discovery.trigger.started', {
    traceId,
    handle,
    slug,
    accountDisplayName,
    sourceJobId,
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Discovery timed out')), config.DISCOVERY_TIMEOUT_MS)
  );

  try {
    const scrapeResult = await Promise.race([
      scrapeProfileVideos(handle, { traceId }),
      timeoutPromise,
    ]);

    const items = scrapeResult.items || [];
    const profileAvatarUrl = scrapeResult.profileAvatarUrl || '';

    // Download avatar even if no new items found (if URL is available)
    if (profileAvatarUrl) {
      const avatarPath = path.join(DOWNLOADS_ROOT, slug, 'avatar.jpg');
      await downloadThumbnail(profileAvatarUrl, avatarPath, { traceId });
    }

    if (items.length === 0) {
      logger.info('discovery.trigger.no_items', { traceId, handle, slug });
      return;
    }

    // ---------------------------------------------------------------------------
    // Bounded dedupe: $in lookups scoped to scraped URLs only
    // ---------------------------------------------------------------------------
    const scrapedCanonicalUrls = items.map((i) => i.canonicalUrl);

    const [existingJobDocs, existingDiscoveredDocs] = await Promise.all([
      Job.find({ canonicalUrl: { $in: scrapedCanonicalUrls } }).select('canonicalUrl').lean(),
      DiscoveredPost.find({ canonicalUrl: { $in: scrapedCanonicalUrls } }).select('canonicalUrl').lean(),
    ]);

    const knownUrls = new Set([
      ...existingJobDocs.map((d) => d.canonicalUrl),
      ...existingDiscoveredDocs.map((d) => d.canonicalUrl),
    ]);

    // In-memory dedupe by canonical URL
    const seenInBatch = new Set();
    const newItems = items.filter((item) => {
      if (knownUrls.has(item.canonicalUrl)) return false;
      if (seenInBatch.has(item.canonicalUrl)) return false;
      seenInBatch.add(item.canonicalUrl);
      return true;
    });

    if (newItems.length === 0) {
      logger.info('discovery.trigger.all_known', {
        traceId,
        handle,
        slug,
        totalScraped: items.length,
      });
      return;
    }

    logger.info('discovery.trigger.new_items', {
      traceId,
      handle,
      slug,
      newCount: newItems.length,
      totalScraped: items.length,
    });

    // ---------------------------------------------------------------------------
    // Bounded write concurrency
    // ---------------------------------------------------------------------------
    const discoveredDir = path.join(DOWNLOADS_ROOT, slug, 'discovered');
    const concurrency = config.DISCOVERY_WRITE_CONCURRENCY;

    for (let i = 0; i < newItems.length; i += concurrency) {
      const chunk = newItems.slice(i, i + concurrency);
      await Promise.all(chunk.map(async (item) => {
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

          // Download thumbnail
          if (item.thumbnailUrl) {
            const thumbFilename = `${item.videoId || doc._id.toString()}.jpg`;
            const thumbPath = path.join(discoveredDir, thumbFilename);
            const savedPath = await downloadThumbnail(item.thumbnailUrl, thumbPath, { traceId });
            if (savedPath) {
              const relativePath = path.relative(process.cwd(), savedPath).split(path.sep).join('/');
              await DiscoveredPost.findByIdAndUpdate(doc._id, { thumbnailPath: relativePath });
            }
          }
        } catch (error) {
          // Skip duplicates (unique index violation on canonicalUrl)
          if (error.code === 11000) return;
          const message = error instanceof Error ? error.message : String(error);
          logger.error('discovery.create.failed', {
            traceId,
            postUrl: item.postUrl,
            message,
          });
        }
      }));
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
  normalizeHandle,
  resolveDiscoveryHandle,
};
