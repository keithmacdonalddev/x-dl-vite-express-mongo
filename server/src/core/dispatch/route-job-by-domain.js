const { logger } = require('../../lib/logger');

function normalizeDomainId(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

async function routeJobByDomain({
  job,
  routes = {},
  fallback,
  log = logger,
} = {}) {
  if (typeof fallback !== 'function') {
    throw new TypeError('routeJobByDomain requires a fallback(job) function');
  }

  const domainId = normalizeDomainId(job && job.domainId);
  const domainHandler = domainId && typeof routes[domainId] === 'function'
    ? routes[domainId]
    : null;

  if (!domainHandler) {
    if (!domainId) {
      log.info?.('worker.job.dispatch.legacy_fallback', {
        jobId: job && job._id ? String(job._id) : '',
        reason: 'missing-domain-id',
      });
    } else {
      log.warn?.('worker.job.dispatch.legacy_fallback', {
        jobId: job && job._id ? String(job._id) : '',
        domainId,
        reason: 'missing-domain-handler',
      });
    }
    return fallback(job);
  }

  return domainHandler(job);
}

module.exports = {
  routeJobByDomain,
};

