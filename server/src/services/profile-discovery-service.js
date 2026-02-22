'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DiscoveredPost } = require('../core/data/discovered-post-model');
const { Job } = require('../core/models/job');
const { logger } = require('../core/lib/logger');
const { canonicalizePostUrl } = require('../core/utils/validation');
const { sanitizeAccountSlug } = require('../core/utils/account-profile');
const { resolvePublishedAt, parsePublishedAt } = require('../core/utils/published-at');

// ---------------------------------------------------------------------------
// Config — env-backed with defaults
// ---------------------------------------------------------------------------

function parseBooleanEnv(value, fallback = false) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function getConfig() {
  return {
    DISCOVERY_TIMEOUT_MS: parseInt(process.env.DISCOVERY_TIMEOUT_MS || '120000', 10),
    DISCOVERY_CAPTCHA_WAIT_MS: parseInt(process.env.DISCOVERY_CAPTCHA_WAIT_MS || '60000', 10),
    DISCOVERY_CAPTCHA_POLL_MS: parseInt(process.env.DISCOVERY_CAPTCHA_POLL_MS || '2000', 10),
    DISCOVERY_SCROLL_MAX_STEPS: parseInt(process.env.DISCOVERY_SCROLL_MAX_STEPS || '60', 10),
    DISCOVERY_SCROLL_PAUSE_MS: parseInt(process.env.DISCOVERY_SCROLL_PAUSE_MS || '600', 10),
    DISCOVERY_SCROLL_STAGNANT_STEPS: parseInt(process.env.DISCOVERY_SCROLL_STAGNANT_STEPS || '3', 10),
    DISCOVERY_WRITE_CONCURRENCY: parseInt(process.env.DISCOVERY_WRITE_CONCURRENCY || '4', 10),
    DISCOVERY_THUMBNAIL_TIMEOUT_MS: parseInt(process.env.DISCOVERY_THUMBNAIL_TIMEOUT_MS || '15000', 10),
    DISCOVERY_THUMBNAIL_AUTH_FALLBACK: parseBooleanEnv(process.env.DISCOVERY_THUMBNAIL_AUTH_FALLBACK, true),
    DISCOVERY_DEBUG_SCREENSHOTS: parseBooleanEnv(process.env.DISCOVERY_DEBUG_SCREENSHOTS, false),
    DISCOVERY_DEBUG_SCREENSHOT_RETENTION_MS: parseInt(process.env.DISCOVERY_DEBUG_SCREENSHOT_RETENTION_MS || '86400000', 10),
  };
}

const DOWNLOADS_ROOT = path.resolve(process.cwd(), 'downloads');
const DISCOVERY_DEDUPE_LOOKUP_BATCH_SIZE = 250;

async function reconcileSourceAvailability({
  slug,
  scrapedCanonicalUrls,
  profileRemovedOnSource,
  canAssertProfileAvailable,
  checkedAt,
} = {}) {
  if (!slug) {
    return;
  }

  const canonicalUrls = Array.isArray(scrapedCanonicalUrls)
    ? scrapedCanonicalUrls.filter((url) => typeof url === 'string' && url)
    : [];

  if (profileRemovedOnSource) {
    await Promise.all([
      DiscoveredPost.updateMany(
        { accountSlug: slug, accountPlatform: 'tiktok', removedFromSourceAt: null },
        { $set: { removedFromSourceAt: checkedAt } }
      ),
      Job.updateMany(
        { accountSlug: slug, accountPlatform: 'tiktok', removedFromSourceAt: null },
        { $set: { removedFromSourceAt: checkedAt } }
      ),
      DiscoveredPost.updateMany(
        { accountSlug: slug, accountPlatform: 'tiktok', profileRemovedFromSourceAt: null },
        { $set: { profileRemovedFromSourceAt: checkedAt } }
      ),
      Job.updateMany(
        { accountSlug: slug, accountPlatform: 'tiktok', profileRemovedFromSourceAt: null },
        { $set: { profileRemovedFromSourceAt: checkedAt } }
      ),
    ]);
    return;
  }

  if (canAssertProfileAvailable) {
    await Promise.all([
      DiscoveredPost.updateMany(
        { accountSlug: slug, accountPlatform: 'tiktok', profileRemovedFromSourceAt: { $ne: null } },
        { $set: { profileRemovedFromSourceAt: null } }
      ),
      Job.updateMany(
        { accountSlug: slug, accountPlatform: 'tiktok', profileRemovedFromSourceAt: { $ne: null } },
        { $set: { profileRemovedFromSourceAt: null } }
      ),
    ]);
  }

  if (canonicalUrls.length === 0) {
    return;
  }

  await Promise.all([
    DiscoveredPost.updateMany(
      {
        accountSlug: slug,
        accountPlatform: 'tiktok',
        canonicalUrl: { $in: canonicalUrls },
        removedFromSourceAt: { $ne: null },
      },
      { $set: { removedFromSourceAt: null } }
    ),
    Job.updateMany(
      {
        accountSlug: slug,
        accountPlatform: 'tiktok',
        canonicalUrl: { $in: canonicalUrls },
        removedFromSourceAt: { $ne: null },
      },
      { $set: { removedFromSourceAt: null } }
    ),
  ]);

  await Promise.all([
    DiscoveredPost.updateMany(
      {
        accountSlug: slug,
        accountPlatform: 'tiktok',
        canonicalUrl: { $nin: canonicalUrls, $exists: true, $ne: '' },
        removedFromSourceAt: null,
      },
      { $set: { removedFromSourceAt: checkedAt } }
    ),
    Job.updateMany(
      {
        accountSlug: slug,
        accountPlatform: 'tiktok',
        canonicalUrl: { $nin: canonicalUrls, $exists: true, $ne: '' },
        removedFromSourceAt: null,
      },
      { $set: { removedFromSourceAt: checkedAt } }
    ),
  ]);
}

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
 * - Prefer explicit accountHandle when present.
 * - Fall back to handle parsed from URL.
 * - Fall back to '@' + accountSlug when accountHandle is empty/invalid.
 * Returns a normalized handle string (with @ prefix), or empty string if unresolvable.
 */
function resolveDiscoveryHandle({ tweetUrl, accountHandle, accountSlug } = {}) {
  // Normalize the explicit handle first
  const normalizedExplicit = normalizeHandle(accountHandle || '');
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  // Check if the URL itself contains a handle in the path
  const urlHandle = extractHandleFromTikTokUrl(tweetUrl || '');

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

async function removeFileIfExists(targetPath) {
  try {
    await fs.promises.unlink(targetPath);
  } catch {
    // ignore — file may not exist
  }
}

async function downloadThumbnailWithAuthFallback(thumbnailUrl, targetPath, { traceId, jobId } = {}) {
  try {
    const { downloadDirectWithPlaywrightSession } = require('./downloader-service');
    const authResult = await downloadDirectWithPlaywrightSession(thumbnailUrl, {
      targetPath,
      telemetryContext: { traceId, jobId, stage: 'discovery-thumbnail-auth' },
    });

    const contentType = authResult && typeof authResult.contentType === 'string'
      ? authResult.contentType
      : '';

    if (contentType && !contentType.startsWith('image/')) {
      logger.info('discovery.thumbnail.auth_non_image', {
        traceId,
        jobId,
        thumbnailUrl,
        contentType,
      });
      await removeFileIfExists(targetPath);
      return '';
    }

    return targetPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.info('discovery.thumbnail.fetch_failed', {
      traceId,
      jobId,
      thumbnailUrl,
      message,
    });
    await removeFileIfExists(targetPath);
    return '';
  }
}

async function downloadThumbnail(thumbnailUrl, targetPath, { traceId, jobId } = {}) {
  if (!thumbnailUrl || !thumbnailUrl.startsWith('http')) return '';

  const config = getConfig();
  const shouldAuthFallback = Boolean(config.DISCOVERY_THUMBNAIL_AUTH_FALLBACK);
  let authFallbackAttempted = false;
  let timeoutHandle = null;

  async function maybeAuthFallback() {
    if (!shouldAuthFallback || authFallbackAttempted) return '';
    authFallbackAttempted = true;
    return downloadThumbnailWithAuthFallback(thumbnailUrl, targetPath, { traceId, jobId });
  }

  try {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    if (abortController) {
      timeoutHandle = setTimeout(() => abortController.abort(), config.DISCOVERY_THUMBNAIL_TIMEOUT_MS);
      timeoutHandle.unref?.();
    }

    const response = await fetch(thumbnailUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        referer: 'https://www.tiktok.com/',
      },
      signal: abortController ? abortController.signal : undefined,
    });

    // Validate response status
    if (!response.ok) {
      logger.info('discovery.thumbnail.bad_status', {
        traceId,
        jobId,
        thumbnailUrl,
        status: response.status,
      });
      return maybeAuthFallback();
    }

    if (!response.body) {
      logger.info('discovery.thumbnail.no_body', { traceId, jobId, thumbnailUrl });
      return maybeAuthFallback();
    }

    // Validate content-type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      logger.info('discovery.thumbnail.bad_content_type', {
        traceId,
        jobId,
        thumbnailUrl,
        contentType,
      });
      return maybeAuthFallback();
    }

    const { Readable } = require('node:stream');
    const { pipeline } = require('node:stream/promises');
    const output = fs.createWriteStream(targetPath);
    await pipeline(Readable.fromWeb(response.body), output);
    const stat = await fs.promises.stat(targetPath).catch(() => null);
    if (!stat || stat.size <= 0) {
      logger.info('discovery.thumbnail.empty_file', {
        traceId,
        jobId,
        thumbnailUrl,
      });
      await removeFileIfExists(targetPath);
      return maybeAuthFallback();
    }

    return targetPath;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      logger.info('discovery.thumbnail.timeout', {
        traceId,
        jobId,
        thumbnailUrl,
        timeoutMs: config.DISCOVERY_THUMBNAIL_TIMEOUT_MS,
      });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('discovery.thumbnail.failed', { traceId, jobId, thumbnailUrl, message });
    }

    await removeFileIfExists(targetPath);
    return maybeAuthFallback();
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function cleanupOldDiscoveryScreenshots(screenshotDir, retentionMs) {
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) return;
  try {
    const files = await fs.promises.readdir(screenshotDir);
    const now = Date.now();
    await Promise.all(
      files
        .filter((filename) => filename.startsWith('discovery-debug-') && filename.endsWith('.png'))
        .map(async (filename) => {
          const fullPath = path.join(screenshotDir, filename);
          try {
            const stat = await fs.promises.stat(fullPath);
            if (now - stat.mtimeMs > retentionMs) {
              await fs.promises.unlink(fullPath);
            }
          } catch {
            // ignore best-effort cleanup errors
          }
        })
    );
  } catch {
    // ignore best-effort cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Profile scrape
// ---------------------------------------------------------------------------

async function scrapeProfileVideos(handle, { traceId, jobId } = {}) {
  const logContext = { traceId, jobId };
  const config = getConfig();
  const profileUrl = `https://www.tiktok.com/${handle}`;
  const { getPersistentContext } = require('./playwright-adapter');

  logger.info('discovery.scrape.started', { ...logContext, handle, profileUrl });

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
      logger.info('discovery.scrape.captcha_detected', { ...logContext, handle });

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
          logger.info('discovery.scrape.captcha_solved', { ...logContext, handle, attempts: attempt + 1 });
          await page.waitForTimeout(3000);
          break;
        }
      }

      if (!solved) {
        logger.error('discovery.scrape.captcha_timeout', { ...logContext, handle });
        return {
          items: [],
          profileAvatarUrl: '',
          profileUnavailable: false,
          stats: { rawCount: 0, filteredCount: 0, itemCount: 0 },
        };
      }
    }

    if (config.DISCOVERY_DEBUG_SCREENSHOTS) {
      const screenshotDir = path.resolve(process.cwd(), 'tmp');
      await fs.promises.mkdir(screenshotDir, { recursive: true });
      await cleanupOldDiscoveryScreenshots(
        screenshotDir,
        config.DISCOVERY_DEBUG_SCREENSHOT_RETENTION_MS
      );
      const screenshotPath = path.join(screenshotDir, `discovery-debug-${handle.replace('@', '')}-${Date.now()}.png`);
      try {
        await page.screenshot({ path: screenshotPath, fullPage: false });
        logger.info('discovery.scrape.screenshot', { ...logContext, handle, screenshotPath });
      } catch (screenshotErr) {
        logger.error('discovery.scrape.screenshot_failed', {
          ...logContext,
          handle,
          message: screenshotErr.message || String(screenshotErr),
        });
      }
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
          ...logContext,
          handle,
          step,
          elapsedMs: Date.now() - scrapeStartedAt,
        });
        break;
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(config.DISCOVERY_SCROLL_PAUSE_MS);

      const newHeight = await page.evaluate(() => document.body.scrollHeight).catch(() => lastHeight);

      const shouldLogScroll =
        step === 0 ||
        step === config.DISCOVERY_SCROLL_MAX_STEPS - 1 ||
        step % 5 === 0 ||
        newHeight <= lastHeight;
      if (shouldLogScroll) {
        logger.info('discovery.scrape.scrolled', {
          ...logContext,
          handle,
          step,
          height: lastHeight,
          newHeight,
        });
      }

      if (newHeight <= lastHeight) {
        stagnantCount++;
        logger.info('discovery.scrape.scroll_stagnated', {
          ...logContext,
          handle,
          step,
          stagnantCount,
        });

        if (stagnantCount >= config.DISCOVERY_SCROLL_STAGNANT_STEPS) {
          logger.info('discovery.scrape.end_of_feed', { ...logContext, handle, step });
          break;
        }
      } else {
        stagnantCount = 0;
        lastHeight = newHeight;
      }
    }

    // Scroll back to top and allow a brief settle so TikTok's lazy-loader can
    // replace placeholder GIFs with real thumbnail URLs before we scrape.
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(1500);

    // ---------------------------------------------------------------------------
    // Multi-strategy extraction with in-browser dedupe
    // ---------------------------------------------------------------------------
    const rawItems = await page.evaluate(() => {
      const seen = new Set();
      const results = [];

      /**
       * Return the best real thumbnail URL from an <img> element.
       * TikTok uses lazy-loading: the real URL may be in data-src, data-lazy,
       * or srcset rather than src.  If only a data: URI is available, return ''.
       */
      function resolveImgUrl(img) {
        if (!img) return '';
        const candidates = [
          img.getAttribute('data-src'),
          img.getAttribute('data-lazy'),
          img.getAttribute('src'),
        ];
        // srcset: pick the first token (highest-res entry is usually last, but
        // any real URL beats a placeholder)
        const srcset = img.getAttribute('srcset') || '';
        if (srcset) {
          const firstToken = srcset.trim().split(/\s+/)[0];
          if (firstToken && !firstToken.startsWith('data:')) {
            candidates.push(firstToken);
          }
        }
        for (const c of candidates) {
          if (c && !c.startsWith('data:')) return c;
        }
        return '';
      }

      function addItem(postUrl, thumbnailUrl, title, avatarUrl, publishedAt) {
        if (!postUrl) return;
        const key = postUrl.split('?')[0]; // canonical key (no query params)
        if (seen.has(key)) return;
        seen.add(key);
        results.push({
          postUrl,
          thumbnailUrl: thumbnailUrl || '',
          title: title || '',
          avatarUrl: avatarUrl || '',
          publishedAt: publishedAt || '',
        });
      }

      // Strategy 1: data-e2e user-post-item links
      const postItems = document.querySelectorAll('[data-e2e="user-post-item"] a[href*="/video/"]');
      for (const anchor of postItems) {
        const href = anchor.getAttribute('href') || '';
        const img = anchor.querySelector('img');
        const thumbUrl = resolveImgUrl(img);
        const alt = img ? (img.getAttribute('alt') || '') : '';
        if (href) {
          const fullUrl = href.startsWith('http') ? href : 'https://www.tiktok.com' + href;
          addItem(fullUrl, thumbUrl, alt, '', '');
        }
      }

      // Strategy 2: broader anchor fallback — any anchor with /@<handle>/video/
      const allAnchors = document.querySelectorAll('a[href*="/@"][href*="/video/"]');
      for (const anchor of allAnchors) {
        const href = anchor.getAttribute('href') || '';
        const img = anchor.querySelector('img');
        const thumbUrl = resolveImgUrl(img);
        const alt = img ? (img.getAttribute('alt') || '') : '';
        if (href) {
          const fullUrl = href.startsWith('http') ? href : 'https://www.tiktok.com' + href;
          addItem(fullUrl, thumbUrl, alt, '', '');
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
              addItem(postUrl, thumbUrl, title, '', item.createTime || '');
            }
          }
        } catch { /* ignore */ }
      }

      // Strategy 4: SIGI_STATE
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
            addItem(postUrl, thumbUrl, title, '', item.createTime || '');
          }
        } catch { /* ignore */ }
        break; // only first match
      }

      // Try meta tags for avatar as last resort
      if (!profileAvatarUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) profileAvatarUrl = ogImage.getAttribute('content') || '';
      }

      return { results, profileAvatarUrl };
    });

    const allRaw = rawItems.results || [];
    const profileAvatarUrl = rawItems.profileAvatarUrl || '';
    const rawCount = allRaw.length;

    // Diagnostic DOM snippet if nothing found
    let profileUnavailable = false;
    if (allRaw.length === 0) {
      try {
        const diagnostics = await page.evaluate(() => {
          const body = document.body;
          const bodyText = body ? body.innerText : '';
          const lowered = (bodyText || '').toLowerCase();
          const title = document.title || '';
          const loweredTitle = title.toLowerCase();
          const unavailablePhrases = [
            "couldn't find this account",
            'couldn’t find this account',
            "couldn't find this user",
            'account not found',
            'user not found',
            'this account is unavailable',
          ];
          const profileUnavailable = unavailablePhrases.some((phrase) => (
            lowered.includes(phrase) || loweredTitle.includes(phrase)
          ));

          return {
            title,
            url: window.location.href,
            bodyText: bodyText.slice(0, 1500),
            scriptIds: Array.from(document.querySelectorAll('script[id]')).map((s) => s.id),
            anchorCount: document.querySelectorAll('a').length,
            videoLinkCount: document.querySelectorAll('a[href*="/video/"]').length,
            hasRehydration: !!document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__'),
            profileUnavailable,
          };
        });
        profileUnavailable = Boolean(diagnostics && diagnostics.profileUnavailable);
        logger.info('discovery.scrape.dom_debug', {
          ...logContext,
          handle,
          bodySnippet: JSON.stringify(diagnostics),
        });
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
      // Use non-www host so URLs are consistent regardless of scrape source
      const canonBase = `https://tiktok.com/${urlHandle}/video/${videoId}`;
      const canonicalUrl = canonicalizePostUrl(canonBase) || canonBase;
      const resolvedPublishedAt = resolvePublishedAt({
        publishedAt: raw.publishedAt,
        videoId,
        tweetUrl: canonBase,
        canonicalUrl,
      });

      items.push({
        postUrl: canonBase,
        canonicalUrl,
        thumbnailUrl: raw.thumbnailUrl || '',
        title: raw.title || '',
        videoId,
        publishedAt: resolvedPublishedAt ? resolvedPublishedAt.toISOString() : '',
      });
    }

    const filteredCount = allRaw.length - items.length;

    logger.info('discovery.scrape.completed', {
      ...logContext,
      handle,
      rawCount,
      filteredCount,
      itemCount: items.length,
    });

    return {
      items,
      profileAvatarUrl,
      profileUnavailable,
      stats: { rawCount, filteredCount, itemCount: items.length },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.scrape.failed', { ...logContext, handle, message });
    return {
      items: [],
      profileAvatarUrl: '',
      profileUnavailable: false,
      stats: { rawCount: 0, filteredCount: 0, itemCount: 0 },
    };
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
  const sourceJobIdString = sourceJobId ? sourceJobId.toString() : '';
  const discoveryLogContext = {
    traceId,
    sourceJobId: sourceJobIdString,
    jobId: sourceJobIdString,
  };

  const handle = resolveDiscoveryHandle({ tweetUrl, accountHandle, accountSlug });
  if (!handle) {
    logger.info('discovery.trigger.no_handle', {
      ...discoveryLogContext,
      tweetUrl,
      accountHandle,
      accountSlug,
      accountDisplayName,
    });
    return;
  }

  const slug = accountSlug || sanitizeAccountSlug(handle);
  const startedAt = Date.now();

  logger.info('discovery.trigger.started', {
    ...discoveryLogContext,
    handle,
    slug,
    accountDisplayName,
  });

  let discoveryTimeoutHandle = null;
  const timeoutPromise = new Promise((_, reject) => {
    discoveryTimeoutHandle = setTimeout(
      () => reject(new Error('Discovery timed out')),
      config.DISCOVERY_TIMEOUT_MS
    );
    discoveryTimeoutHandle.unref?.();
  });

  try {
    const scrapeResult = await Promise.race([
      scrapeProfileVideos(handle, { traceId, jobId: sourceJobIdString }),
      timeoutPromise,
    ]);

    const items = scrapeResult.items || [];
    const profileAvatarUrl = scrapeResult.profileAvatarUrl || '';
    const scrapedCanonicalUrls = Array.from(
      new Set(items.map((i) => i.canonicalUrl).filter((url) => typeof url === 'string' && url))
    );
    const profileRemovedOnSource = items.length === 0 && scrapeResult.profileUnavailable === true;
    const sourceCheckedAt = new Date();

    await reconcileSourceAvailability({
      slug,
      scrapedCanonicalUrls,
      profileRemovedOnSource,
      canAssertProfileAvailable: items.length > 0,
      checkedAt: sourceCheckedAt,
    });

    // Download avatar even if no new items found (if URL is available)
    if (profileAvatarUrl) {
      const avatarPath = path.join(DOWNLOADS_ROOT, slug, 'avatar.jpg');
      await downloadThumbnail(profileAvatarUrl, avatarPath, {
        traceId,
        jobId: sourceJobIdString,
      });
    }

    if (items.length === 0) {
      logger.info('discovery.trigger.no_items', {
        ...discoveryLogContext,
        handle,
        slug,
        profileRemovedOnSource,
      });
      return;
    }

    // ---------------------------------------------------------------------------
    // Bounded dedupe: $in lookups scoped to scraped URLs and videoIds
    // Both canonicalUrl and videoId are checked to survive URL normalisation
    // differences between runs (e.g. www.tiktok.com vs tiktok.com).
    // ---------------------------------------------------------------------------
    const scrapedVideoIds = Array.from(
      new Set(items.map((i) => i.videoId).filter((id) => typeof id === 'string' && id))
    );
    const knownUrls = new Set();
    const knownVideoIds = new Set();
    for (let i = 0; i < scrapedCanonicalUrls.length; i += DISCOVERY_DEDUPE_LOOKUP_BATCH_SIZE) {
      const canonicalChunk = scrapedCanonicalUrls.slice(i, i + DISCOVERY_DEDUPE_LOOKUP_BATCH_SIZE);
      const videoIdChunk = scrapedVideoIds.slice(i, i + DISCOVERY_DEDUPE_LOOKUP_BATCH_SIZE);
      const [existingJobDocs, existingDiscoveredDocs] = await Promise.all([
        Job.find({ $or: [{ canonicalUrl: { $in: canonicalChunk } }, { videoId: { $in: videoIdChunk } }] })
          .select('canonicalUrl videoId').lean(),
        DiscoveredPost.find({ $or: [{ canonicalUrl: { $in: canonicalChunk } }, { videoId: { $in: videoIdChunk } }] })
          .select('canonicalUrl videoId').lean(),
      ]);
      for (const doc of existingJobDocs) {
        if (doc && typeof doc.canonicalUrl === 'string' && doc.canonicalUrl) {
          knownUrls.add(doc.canonicalUrl);
        }
        if (doc && typeof doc.videoId === 'string' && doc.videoId) {
          knownVideoIds.add(doc.videoId);
        }
      }
      for (const doc of existingDiscoveredDocs) {
        if (doc && typeof doc.canonicalUrl === 'string' && doc.canonicalUrl) {
          knownUrls.add(doc.canonicalUrl);
        }
        if (doc && typeof doc.videoId === 'string' && doc.videoId) {
          knownVideoIds.add(doc.videoId);
        }
      }
    }

    // In-memory dedupe by canonical URL and videoId
    const seenInBatch = new Set();
    const newItems = items.filter((item) => {
      if (knownUrls.has(item.canonicalUrl)) return false;
      if (item.videoId && knownVideoIds.has(item.videoId)) return false;
      if (seenInBatch.has(item.canonicalUrl)) return false;
      seenInBatch.add(item.canonicalUrl);
      if (item.videoId) seenInBatch.add(item.videoId);
      return true;
    });

    // ---------------------------------------------------------------------------
    // Thumbnail self-heal: update existing posts whose stored thumbnail is a
    // placeholder (data: URI or empty) but the fresh scrape has a real URL.
    // ---------------------------------------------------------------------------
    const discoveredDir = path.join(DOWNLOADS_ROOT, slug, 'discovered');
    const concurrency = config.DISCOVERY_WRITE_CONCURRENCY;

    const existingItemsWithFreshThumbs = items.filter((item) => {
      // Item was filtered out (it's already in DB) and has a real thumbnail URL
      const isExisting = knownUrls.has(item.canonicalUrl) || (item.videoId && knownVideoIds.has(item.videoId));
      const hasRealThumb = item.thumbnailUrl && !item.thumbnailUrl.startsWith('data:');
      return isExisting && hasRealThumb;
    });

    if (existingItemsWithFreshThumbs.length > 0) {
      try {
        // Build lookup maps: videoId -> thumbnailUrl, canonicalUrl -> thumbnailUrl
        const freshThumbByVideoId = new Map();
        const freshThumbByCanonicalUrl = new Map();
        for (const item of existingItemsWithFreshThumbs) {
          if (item.videoId) freshThumbByVideoId.set(item.videoId, item.thumbnailUrl);
          if (item.canonicalUrl) freshThumbByCanonicalUrl.set(item.canonicalUrl, item.thumbnailUrl);
        }

        // Find matching DB docs where thumbnailUrl is bad (data: or empty)
        const videoIdsToCheck = [...freshThumbByVideoId.keys()];
        const canonicalUrlsToCheck = [...freshThumbByCanonicalUrl.keys()];
        const docsWithBadThumbs = await DiscoveredPost.find({
          $or: [
            { videoId: { $in: videoIdsToCheck } },
            { canonicalUrl: { $in: canonicalUrlsToCheck } },
          ],
          $and: [
            {
              $or: [
                { thumbnailUrl: '' },
                { thumbnailUrl: { $exists: false } },
                { thumbnailUrl: /^data:/ },
              ],
            },
          ],
        }).select('_id videoId canonicalUrl thumbnailUrl thumbnailPath').lean();

        let healedCount = 0;
        for (let i = 0; i < docsWithBadThumbs.length; i += concurrency) {
          const chunk = docsWithBadThumbs.slice(i, i + concurrency);
          await Promise.all(chunk.map(async (doc) => {
            const freshThumb =
              (doc.videoId && freshThumbByVideoId.get(doc.videoId)) ||
              (doc.canonicalUrl && freshThumbByCanonicalUrl.get(doc.canonicalUrl));
            if (!freshThumb) return;

            try {
              // Update the stored thumbnailUrl and clear thumbnailPath so it gets re-downloaded
              await DiscoveredPost.findByIdAndUpdate(doc._id, {
                $set: { thumbnailUrl: freshThumb, thumbnailPath: '' },
              });
              healedCount++;

              // Immediately attempt to download the fresh thumbnail
              const thumbFilename = `${doc.videoId || doc._id.toString()}.jpg`;
              const thumbPath = path.join(discoveredDir, thumbFilename);
              const savedPath = await downloadThumbnail(freshThumb, thumbPath, {
                traceId,
                jobId: sourceJobIdString,
              });
              if (savedPath) {
                const relativePath = path.relative(process.cwd(), savedPath).split(path.sep).join('/');
                await DiscoveredPost.findByIdAndUpdate(doc._id, { thumbnailPath: relativePath });
              }
            } catch (err) {
              logger.info('discovery.thumbnails.heal_failed', {
                ...discoveryLogContext,
                postId: doc._id.toString(),
                message: err instanceof Error ? err.message : String(err),
              });
            }
          }));
        }

        if (healedCount > 0) {
          logger.info('discovery.thumbnails.healed', {
            ...discoveryLogContext,
            count: healedCount,
            slug,
          });
        }
      } catch (err) {
        logger.info('discovery.thumbnails.heal_query_failed', {
          ...discoveryLogContext,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ---------------------------------------------------------------------------
    // Re-attempt thumbnails for existing posts with URL but no local file
    // (runs regardless of whether there are new posts this discovery cycle)
    // ---------------------------------------------------------------------------
    try {
      const postsNeedingThumbs = await DiscoveredPost.find({
        accountSlug: slug,
        thumbnailUrl: { $exists: true, $ne: '', $not: /^data:/ },
        $or: [{ thumbnailPath: '' }, { thumbnailPath: { $exists: false } }],
      }).lean();

      if (postsNeedingThumbs.length > 0) {
        logger.info('discovery.trigger.reattempt_thumbnails', {
          ...discoveryLogContext,
          count: postsNeedingThumbs.length,
        });

        for (let i = 0; i < postsNeedingThumbs.length; i += concurrency) {
          const chunk = postsNeedingThumbs.slice(i, i + concurrency);
          await Promise.all(chunk.map(async (post) => {
            try {
              const thumbFilename = `${post.videoId || post._id.toString()}.jpg`;
              const thumbPath = path.join(discoveredDir, thumbFilename);
              const savedPath = await downloadThumbnail(post.thumbnailUrl, thumbPath, {
                traceId,
                jobId: sourceJobIdString,
              });
              if (savedPath) {
                const relativePath = path.relative(process.cwd(), savedPath).split(path.sep).join('/');
                await DiscoveredPost.findByIdAndUpdate(post._id, { thumbnailPath: relativePath });
              }
            } catch (err) {
              logger.info('discovery.thumbnail.reattempt_failed', {
                ...discoveryLogContext,
                postId: post._id.toString(),
                message: err instanceof Error ? err.message : String(err),
              });
            }
          }));
        }
      }
    } catch (err) {
      logger.info('discovery.trigger.reattempt_thumbnails_failed', {
        ...discoveryLogContext,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    if (newItems.length === 0) {
      logger.info('discovery.trigger.all_known', {
        ...discoveryLogContext,
        handle,
        slug,
        totalScraped: items.length,
      });
      return;
    }

    logger.info('discovery.trigger.new_items', {
      ...discoveryLogContext,
      handle,
      slug,
      newCount: newItems.length,
      totalScraped: items.length,
    });

    for (let i = 0; i < newItems.length; i += concurrency) {
      const chunk = newItems.slice(i, i + concurrency);
      await Promise.all(chunk.map(async (item) => {
        try {
          const doc = await DiscoveredPost.create({
            accountSlug: slug,
            accountHandle: handle,
            accountDisplayName: accountDisplayName || '',
            accountPlatform: 'tiktok',
            postUrl: item.postUrl,
            canonicalUrl: item.canonicalUrl,
            thumbnailUrl: item.thumbnailUrl,
            videoId: item.videoId,
            title: item.title,
            publishedAt: parsePublishedAt(item.publishedAt),
          });

          // Download thumbnail (with single retry after 2s on failure)
          if (item.thumbnailUrl) {
            const thumbFilename = `${item.videoId || doc._id.toString()}.jpg`;
            const thumbPath = path.join(discoveredDir, thumbFilename);
            let savedPath = await downloadThumbnail(item.thumbnailUrl, thumbPath, {
              traceId,
              jobId: sourceJobIdString,
            });
            // Single retry after 2s if first attempt failed
            if (!savedPath) {
              await new Promise((r) => setTimeout(r, 2000));
              savedPath = await downloadThumbnail(item.thumbnailUrl, thumbPath, {
                traceId,
                jobId: sourceJobIdString,
              });
            }
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
            ...discoveryLogContext,
            postUrl: item.postUrl,
            message,
          });
        }
      }));
    }

    logger.info('discovery.trigger.completed', {
      ...discoveryLogContext,
      handle,
      slug,
      newCount: newItems.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.trigger.failed', {
      ...discoveryLogContext,
      handle,
      slug,
      message,
      durationMs: Date.now() - startedAt,
    });
  } finally {
    if (discoveryTimeoutHandle) {
      clearTimeout(discoveryTimeoutHandle);
    }
  }
}

// ---------------------------------------------------------------------------
// oEmbed thumbnail repair
// ---------------------------------------------------------------------------

const OEMBED_REPAIR_RATE_LIMIT_MS = 500;

/**
 * Repair missing or placeholder thumbnails for discovered posts belonging to
 * the given accountSlug by fetching fresh thumbnail URLs from TikTok's public
 * oEmbed endpoint (no auth required).
 *
 * @param {string} accountSlug - The account slug to repair thumbnails for.
 * @param {{ traceId?: string }} [options]
 * @returns {Promise<{ total: number, repaired: number, failed: number }>}
 */
async function repairThumbnailsViaOembed(accountSlug, { traceId } = {}) {
  const logContext = { traceId, accountSlug };

  if (!accountSlug || typeof accountSlug !== 'string') {
    logger.info('discovery.thumbnails.oembed_repair.invalid_slug', { ...logContext });
    return { total: 0, repaired: 0, failed: 0 };
  }

  // Query for posts with missing/empty/placeholder thumbnails that have a valid canonicalUrl
  let postsNeedingRepair;
  try {
    postsNeedingRepair = await DiscoveredPost.find({
      accountSlug,
      canonicalUrl: { $exists: true, $ne: '' },
      $or: [
        { thumbnailUrl: '' },
        { thumbnailUrl: { $exists: false } },
        { thumbnailUrl: /^data:/ },
      ],
    }).select('_id videoId canonicalUrl thumbnailUrl thumbnailPath').lean();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('discovery.thumbnails.oembed_repair.query_failed', { ...logContext, message });
    return { total: 0, repaired: 0, failed: 0 };
  }

  const total = postsNeedingRepair.length;

  if (total === 0) {
    logger.info('discovery.thumbnails.oembed_repair', { ...logContext, total: 0, repaired: 0, failed: 0 });
    return { total: 0, repaired: 0, failed: 0 };
  }

  logger.info('discovery.thumbnails.oembed_repair.started', { ...logContext, total });

  const discoveredDir = path.join(DOWNLOADS_ROOT, accountSlug, 'discovered');
  let repaired = 0;
  let failed = 0;

  for (let i = 0; i < postsNeedingRepair.length; i++) {
    const post = postsNeedingRepair[i];

    // Rate-limit: wait between requests (skip the delay before the first request)
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, OEMBED_REPAIR_RATE_LIMIT_MS));
    }

    try {
      const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(post.canonicalUrl)}`;
      const response = await fetch(oembedUrl, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        logger.info('discovery.thumbnails.oembed_repair.bad_status', {
          ...logContext,
          postId: post._id.toString(),
          canonicalUrl: post.canonicalUrl,
          status: response.status,
        });
        failed++;
        continue;
      }

      let oembedData;
      try {
        oembedData = await response.json();
      } catch {
        logger.info('discovery.thumbnails.oembed_repair.bad_json', {
          ...logContext,
          postId: post._id.toString(),
          canonicalUrl: post.canonicalUrl,
        });
        failed++;
        continue;
      }

      const thumbnailUrl =
        typeof oembedData === 'object' && oembedData !== null
          ? (typeof oembedData.thumbnail_url === 'string' ? oembedData.thumbnail_url : '')
          : '';

      if (!thumbnailUrl || !thumbnailUrl.startsWith('http')) {
        logger.info('discovery.thumbnails.oembed_repair.no_thumbnail_url', {
          ...logContext,
          postId: post._id.toString(),
          canonicalUrl: post.canonicalUrl,
        });
        failed++;
        continue;
      }

      // Update the stored thumbnailUrl and clear thumbnailPath so it gets re-downloaded
      await DiscoveredPost.findByIdAndUpdate(post._id, {
        $set: { thumbnailUrl, thumbnailPath: '' },
      });

      // Download the thumbnail file to disk
      const thumbFilename = `${post.videoId || post._id.toString()}.jpg`;
      const thumbPath = path.join(discoveredDir, thumbFilename);
      const savedPath = await downloadThumbnail(thumbnailUrl, thumbPath, { traceId });

      if (savedPath) {
        const relativePath = path.relative(process.cwd(), savedPath).split(path.sep).join('/');
        await DiscoveredPost.findByIdAndUpdate(post._id, { $set: { thumbnailPath: relativePath } });
      }

      repaired++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.info('discovery.thumbnails.oembed_repair.post_failed', {
        ...logContext,
        postId: post._id.toString(),
        canonicalUrl: post.canonicalUrl,
        message,
      });
      failed++;
    }
  }

  logger.info('discovery.thumbnails.oembed_repair', { ...logContext, total, repaired, failed });
  return { total, repaired, failed };
}

module.exports = {
  triggerProfileDiscovery,
  scrapeProfileVideos,
  extractHandleFromTikTokUrl,
  normalizeHandle,
  resolveDiscoveryHandle,
  repairThumbnailsViaOembed,
};
