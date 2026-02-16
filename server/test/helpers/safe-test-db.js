function assertSafeTestConnection(connection) {
  const host = String(connection?.host || '').toLowerCase();
  const dbName = String(connection?.name || '').toLowerCase();
  const readyState = Number(connection?.readyState || 0);

  if (readyState !== 1) {
    throw new Error('Unsafe database state: connection is not open.');
  }

  if (!(host === 'localhost' || host === '127.0.0.1')) {
    throw new Error(`Unsafe database host for tests: "${host}"`);
  }

  if (!dbName.includes('test')) {
    throw new Error(`Unsafe database name for tests: "${dbName}"`);
  }
}

module.exports = {
  assertSafeTestConnection,
};
