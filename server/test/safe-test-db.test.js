const test = require('node:test');
const assert = require('node:assert/strict');

test('assertSafeTestConnection accepts localhost test database names', () => {
  const { assertSafeTestConnection } = require('./helpers/safe-test-db');
  assert.doesNotThrow(() =>
    assertSafeTestConnection({
      host: '127.0.0.1',
      name: 'xdl_read_routes_test',
      readyState: 1,
    })
  );
});

test('assertSafeTestConnection rejects non-local hosts', () => {
  const { assertSafeTestConnection } = require('./helpers/safe-test-db');
  assert.throws(
    () =>
      assertSafeTestConnection({
        host: 'cluster0.mongodb.net',
        name: 'xdl_read_routes_test',
        readyState: 1,
      }),
    /unsafe database host/i
  );
});

test('assertSafeTestConnection rejects non-test database names', () => {
  const { assertSafeTestConnection } = require('./helpers/safe-test-db');
  assert.throws(
    () =>
      assertSafeTestConnection({
        host: 'localhost',
        name: 'production',
        readyState: 1,
      }),
    /unsafe database name/i
  );
});
