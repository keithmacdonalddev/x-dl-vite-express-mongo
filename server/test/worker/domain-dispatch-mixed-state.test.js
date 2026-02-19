'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('empty domainId falls back to legacy processing path', async () => {
  const { routeJobByDomain } = require('../../src/core/dispatch/route-job-by-domain');
  let called = '';

  const result = await routeJobByDomain({
    job: { domainId: '' },
    routes: {
      'platform-x': async () => {
        called = 'platform-x';
        return 'platform';
      },
    },
    fallback: async () => {
      called = 'legacy';
      return 'legacy';
    },
  });

  assert.equal(called, 'legacy');
  assert.equal(result, 'legacy');
});

test('resolveDomainId preserves explicit value or deterministically maps platform id', () => {
  const { resolveDomainId } = require('../../src/core/dispatch/resolve-domain-id');

  assert.equal(
    resolveDomainId({
      existingDomainId: 'platform-tiktok',
      platformId: 'x',
      tweetUrl: 'https://x.com/example/status/123',
    }),
    'platform-tiktok'
  );

  assert.equal(
    resolveDomainId({
      existingDomainId: '',
      platformId: 'tiktok',
      tweetUrl: '',
    }),
    'platform-tiktok'
  );

  assert.equal(
    resolveDomainId({
      existingDomainId: '',
      platformId: '',
      tweetUrl: 'https://x.com/example/status/123',
    }),
    'platform-x'
  );
});

