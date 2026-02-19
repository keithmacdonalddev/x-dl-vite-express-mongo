const express = require('express');

const MAX_JSON_BODY = '32kb';
const MAX_TWEET_URL_LENGTH = 2048;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function createCorsOptions(env = process.env.NODE_ENV) {
  if (env && env !== 'development' && env !== 'test') {
    return { origin: false };
  }

  return {
    origin(origin, callback) {
      if (!origin || isLocalOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  };
}

function jsonBodyParser() {
  return express.json({ limit: MAX_JSON_BODY });
}

function enforceTweetUrlLength(req, res, next) {
  if (req.method !== 'POST') {
    next();
    return;
  }

  const tweetUrl = typeof req.body?.tweetUrl === 'string' ? req.body.tweetUrl.trim() : '';
  if (tweetUrl.length > MAX_TWEET_URL_LENGTH) {
    res.status(413).json({
      ok: false,
      error: `tweetUrl too long. Max length is ${MAX_TWEET_URL_LENGTH} characters.`,
    });
    return;
  }

  next();
}

function handleRequestLimitErrors(error, _req, res, next) {
  if (error && (error.status === 413 || error.type === 'entity.too.large')) {
    res.status(413).json({
      ok: false,
      error: 'Payload too large.',
    });
    return;
  }

  next(error);
}

module.exports = {
  MAX_JSON_BODY,
  MAX_TWEET_URL_LENGTH,
  createCorsOptions,
  jsonBodyParser,
  enforceTweetUrlLength,
  handleRequestLimitErrors,
};
