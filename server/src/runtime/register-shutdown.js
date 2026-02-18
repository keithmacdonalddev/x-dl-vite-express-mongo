function registerShutdown(cleanupFn) {
  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Received ${signal}; shutting down...`);
    await cleanupFn();
  }

  process.on('SIGINT', () =>
    shutdown('SIGINT')
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  );

  process.on('SIGTERM', () =>
    shutdown('SIGTERM')
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  );
}

module.exports = { registerShutdown };
