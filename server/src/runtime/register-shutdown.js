let isHandlerRegistered = false;
let isShuttingDown = false;
const cleanupSteps = [];

function normalizeCleanupInput(cleanupInput) {
  if (typeof cleanupInput === 'function') {
    return [cleanupInput];
  }
  if (Array.isArray(cleanupInput)) {
    return cleanupInput.filter((step) => typeof step === 'function');
  }
  if (cleanupInput && Array.isArray(cleanupInput.steps)) {
    return cleanupInput.steps.filter((step) => typeof step === 'function');
  }
  return [];
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}; shutting down...`);
  for (const step of cleanupSteps) {
    await step();
  }
}

function registerSignalHandlers() {
  if (isHandlerRegistered) return;
  isHandlerRegistered = true;

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

function registerShutdown(cleanupInput) {
  const steps = normalizeCleanupInput(cleanupInput);
  cleanupSteps.push(...steps);
  registerSignalHandlers();
}

module.exports = { registerShutdown };
