const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');

function chooseDownloadMode(mediaUrl) {
  return typeof mediaUrl === 'string' && /\.m3u8(\?.*)?$/i.test(mediaUrl) ? 'hls' : 'direct';
}

async function downloadDirect(
  mediaUrl,
  {
    targetPath,
    fetchImpl = globalThis.fetch,
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
    ffmpegPath = 'ffmpeg',
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

    child.once('error', reject);
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
  chooseDownloadMode,
  downloadDirect,
  downloadHlsWithFfmpeg,
  downloadMedia,
};
