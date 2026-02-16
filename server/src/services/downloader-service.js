const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');

function isAuthBlockedStatus(status) {
  return status === 401 || status === 403;
}

function inferReferer(mediaUrl) {
  if (typeof mediaUrl !== 'string') {
    return '';
  }

  if (/tiktok\.com/i.test(mediaUrl)) {
    return 'https://www.tiktok.com/';
  }

  if (/twimg\.com|x\.com|twitter\.com/i.test(mediaUrl)) {
    return 'https://x.com/';
  }

  return '';
}

async function downloadDirectWithPlaywrightSession(
  mediaUrl,
  {
    targetPath,
    getPersistentContextImpl,
  } = {}
) {
  if (!targetPath) {
    throw new Error('targetPath is required for authenticated direct download');
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

  const getPersistentContext =
    getPersistentContextImpl ||
    require('./playwright-adapter').getPersistentContext;

  if (typeof getPersistentContext !== 'function') {
    throw new Error('Playwright persistent context is not available');
  }

  const context = await getPersistentContext();
  const referer = inferReferer(mediaUrl);
  const headers = referer ? { referer } : undefined;
  const response = await context.request.get(mediaUrl, { headers });

  if (!response || !response.ok()) {
    throw new Error(
      `Authenticated direct download failed with status ${response ? response.status() : 'unknown'}`
    );
  }

  const body = await response.body();
  await fs.promises.writeFile(targetPath, body);

  return {
    outputPath: targetPath,
    mode: 'direct',
  };
}

function chooseDownloadMode(mediaUrl) {
  return typeof mediaUrl === 'string' && /\.m3u8(\?.*)?$/i.test(mediaUrl) ? 'hls' : 'direct';
}

async function downloadDirect(
  mediaUrl,
  {
    targetPath,
    fetchImpl = globalThis.fetch,
    authenticatedDownloader = downloadDirectWithPlaywrightSession,
  } = {}
) {
  if (!targetPath) {
    throw new Error('targetPath is required for direct download');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available for direct download');
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

  const response = await fetchImpl(mediaUrl);
  if (!response || !response.ok || !response.body) {
    if (
      response &&
      isAuthBlockedStatus(response.status) &&
      typeof authenticatedDownloader === 'function'
    ) {
      return authenticatedDownloader(mediaUrl, { targetPath });
    }

    throw new Error(`Direct download failed with status ${response ? response.status : 'unknown'}`);
  }

  const output = fs.createWriteStream(targetPath);
  await pipeline(Readable.fromWeb(response.body), output);

  return {
    outputPath: targetPath,
    mode: 'direct',
  };
}

function downloadHlsWithFfmpeg(
  mediaUrl,
  {
    targetPath,
    spawnImpl = spawn,
    ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
  } = {}
) {
  if (!targetPath) {
    throw new Error('targetPath is required for hls download');
  }

  return new Promise(async (resolve, reject) => {
    try {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawnImpl(ffmpegPath, ['-y', '-i', mediaUrl, '-c', 'copy', targetPath], {
      stdio: 'ignore',
    });

    child.once('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ENOENT')) {
        reject(new Error('ffmpeg not found. Set FFMPEG_PATH or install ffmpeg on PATH.'));
        return;
      }
      reject(error);
    });
    child.once('close', (code) => {
      if (code === 0) {
        resolve({
          outputPath: targetPath,
          mode: 'hls',
        });
        return;
      }

      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function downloadMedia(
  mediaUrl,
  {
    targetPath,
    directDownloader = downloadDirect,
    hlsDownloader = downloadHlsWithFfmpeg,
  } = {}
) {
  if (typeof mediaUrl !== 'string' || !/^https?:\/\//i.test(mediaUrl)) {
    throw new Error('Invalid media URL');
  }

  const mode = chooseDownloadMode(mediaUrl);
  const downloader = mode === 'hls' ? hlsDownloader : directDownloader;

  const result = await downloader(mediaUrl, { targetPath });
  return {
    ...result,
    mode,
  };
}

module.exports = {
  isAuthBlockedStatus,
  inferReferer,
  chooseDownloadMode,
  downloadDirect,
  downloadDirectWithPlaywrightSession,
  downloadHlsWithFfmpeg,
  downloadMedia,
};
