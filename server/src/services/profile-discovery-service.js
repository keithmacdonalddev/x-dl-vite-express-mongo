const fs = require('node:fs');
const path = require('node:path');
const { DiscoveredPost } = require('../core/data/discovered-post-model');
const { Job } = require('../core/models/job');
const { logger } = require('../core/lib/logger');
const { canonicalizePostUrl } = require('../core/utils/validation');
const { sanitizeAccountSlug } = require('../core/utils/account-profile');

const DISCOVERY_TIMEOUT_MS = 30000;
const DOWNLOADS_ROOT = path.resolve(process.cwd(), 'downloads');

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

async function scrapeProfileVideos(handle, { traceId } = {}) {
  const profileUrl = `https://www.tiktok.com/${handle}`;
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

    // Wait for video grid to load
    await page.waitForTimeout(3000);

    const items = await page.evaluate(() => {
      const results = [];

      // Strategy 1: data-e2e user-post-item links
      const postItems = document.querySelectorAll('[data-e2e="user-post-item"] a[href*="/video/"]');
      for (const anchor of postItems) {
        const href = anchor.getAttribute('href') || '';
        const img = anchor.querySelector('img');
        const thumbUrl = img ? (img.getAttribute('src') || '') : '';
        const alt = img ? (img.getAttribute('alt') || '') : '';
        if (href) {
          results.push({ postUrl: href, thumbnailUrl: thumbUrl, title: alt });
        }
      }

      // Strategy 2: fallback to any anchor with /video/ in href
      if (results.length === 0) {
        const allAnchors = document.querySelectorAll('a[href*="/@"][href*="/video/"]');
        for (const anchor of allAnchors) {
          const href = anchor.getAttribute('href') || '';
          const img = anchor.querySelector('img');
          const thumbUrl = img ? (img.getAttribute('src') || '') : '';
          const alt = img ? (img.getAttribute('alt') || '') : '';
          if (href && !results.some((r) => r.postUrl === href)) {
            results.push({ postUrl: href, thumbnailUrl: thumbUrl, title: alt });
          }
        }
      }

      // Strategy 3: __UNIVERSAL_DATA_FOR_REHYDRATION__ profile data
      if (results.length === 0) {
        const rehydrationScript = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (rehydrationScript) {
          try {
            const data = JSON.parse(rehydrationScript.textContent || '{}');
            const defaultScope = data['__DEFAULT_SCOPE__'] || {};
            const userDetail = defaultScope['webapp.user-detail'] || {};
            const userPage = defaultScope['webapp.user-page'] || {};

            // Try userPage.itemList for video items
            const itemList = userPage.itemList || userDetail.itemList || [];
            if (Array.isArray(itemList)) {
              for (const item of itemList) {
                if (!item || !item.id) continue;
                const author = item.author || {};
                const handle = author.uniqueId || '';
                const videoId = item.id;
                const postUrl = handle ? 'https://www.tiktok.com/@' + handle + '/video/' + videoId : '';
                const thumbUrl = (item.video && item.video.cover) || (item.video && item.video.originCover) || '';
                const title = item.desc || '';
                if (postUrl) {
                  results.push({ postUrl, thumbnailUrl: thumbUrl, title });
                }
              }
            }
          } catch { /* ignore */ }
        }
      }

      return results;
    });

    logger.info('discovery.scrape.completed', {
      traceId,
      handle,
      itemCount: items.length,
    });

    return items.map((item) => {
      const fullUrl = item.postUrl.startsWith('http')
        ? item.postUrl
        : `https://www.tiktok.com${item.postUrl}`;

      // Extract video ID from URL
      const videoIdMatch = fullUrl.match(/\/video\/(\d+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : '';

      return {
        postUrl: fullUrl,
        canonicalUrl: canonicalizePostUrl(fullUrl) || fullUrl,
        thumbnailUrl: item.thumbnailUrl || '',
        title: item.title || '',
        videoId,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.scrape.failed', { traceId, handle, message });
    return [];
  } finally {
    if (page && typeof page.close === 'function') {
      await page.close().catch(() => {});
    }
  }
}

async function downloadThumbnail(thumbnailUrl, targetPath, { traceId } = {}) {
  if (!thumbnailUrl || !thumbnailUrl.startsWith('http')) return '';

  try {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

    const response = await fetch(thumbnailUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        referer: 'https://www.tiktok.com/',
      },
    });

    if (!response.ok || !response.body) return '';

    const { Readable } = require('node:stream');
    const { pipeline } = require('node:stream/promises');
    const output = fs.createWriteStream(targetPath);
    await pipeline(Readable.fromWeb(response.body), output);

    return targetPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('discovery.thumbnail.failed', { traceId, thumbnailUrl, message });
    return '';
  }
}

async function triggerProfileDiscovery({ tweetUrl, accountSlug, traceId } = {}) {
  const handle = extractHandleFromTikTokUrl(tweetUrl);
  if (!handle) {
    logger.info('discovery.trigger.no_handle', { traceId, tweetUrl });
    return;
  }

  const slug = accountSlug || sanitizeAccountSlug(handle);
  const startedAt = Date.now();

  logger.info('discovery.trigger.started', { traceId, handle, slug });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Discovery timed out')), DISCOVERY_TIMEOUT_MS)
  );

  try {
    const items = await Promise.race([
      scrapeProfileVideos(handle, { traceId }),
      timeoutPromise,
    ]);

    if (!Array.isArray(items) || items.length === 0) {
      logger.info('discovery.trigger.no_items', { traceId, handle, slug });
      return;
    }

    // Dedup: get existing canonical URLs from Jobs and DiscoveredPosts for this account
    const [existingJobUrls, existingDiscoveredUrls] = await Promise.all([
      Job.distinct('canonicalUrl', { accountSlug: slug }),
      DiscoveredPost.distinct('canonicalUrl', { accountSlug: slug }),
    ]);
    const knownUrls = new Set([...existingJobUrls, ...existingDiscoveredUrls]);
    const newItems = items.filter((item) => !knownUrls.has(item.canonicalUrl));

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

    // Create DiscoveredPost documents and download thumbnails
    const discoveredDir = path.join(DOWNLOADS_ROOT, slug, 'discovered');

    for (const item of newItems) {
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
        if (error.code === 11000) continue;
        const message = error instanceof Error ? error.message : String(error);
        logger.error('discovery.create.failed', {
          traceId,
          postUrl: item.postUrl,
          message,
        });
      }
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
};
