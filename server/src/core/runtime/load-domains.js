const VALID_RUNTIME_TARGETS = new Set(['api', 'worker', 'both']);

function normalizeTargets(runtimeTargets) {
  if (Array.isArray(runtimeTargets) && runtimeTargets.length > 0) {
    return runtimeTargets.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  }
  if (typeof runtimeTargets === 'string' && runtimeTargets.trim()) {
    return [runtimeTargets.trim().toLowerCase()];
  }
  return ['both'];
}

function canRunOnRole(targets, role) {
  return targets.includes('both') || targets.includes(role);
}

function hasValidTargets(targets) {
  return targets.length > 0 && targets.every((target) => VALID_RUNTIME_TARGETS.has(target));
}

async function loadDomainsForRuntime({
  role,
  ctx = {},
  strict = false,
  domainModules = [],
  log = console,
} = {}) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const startedDomains = [];

  for (const domainModule of domainModules) {
    const domain = domainModule && typeof domainModule === 'object' ? domainModule : {};
    const id = typeof domain.id === 'string' && domain.id.trim() ? domain.id.trim() : 'unknown-domain';
    const targets = normalizeTargets(domain.runtimeTargets);

    if (!hasValidTargets(targets)) {
      const message = `Skipping domain "${id}": invalid runtimeTargets (${targets.join(', ') || 'none'})`;
      if (strict) {
        throw new Error(message);
      }
      log.warn?.(message);
      continue;
    }

    if (!canRunOnRole(targets, normalizedRole)) {
      log.warn?.(`Skipping domain "${id}" for role "${normalizedRole}" (targets: ${targets.join(', ')})`);
      continue;
    }

    try {
      if (normalizedRole === 'api' && typeof domain.mountRoutes === 'function') {
        await domain.mountRoutes(ctx.app, ctx);
      }
      if (normalizedRole === 'worker' && typeof domain.startWorker === 'function') {
        await domain.startWorker(ctx);
      }
      startedDomains.push(domain);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (strict) {
        throw error instanceof Error ? error : new Error(message);
      }
      log.warn?.(`Domain "${id}" failed during startup: ${message}`);
    }
  }

  return {
    startedDomainIds: startedDomains
      .map((domain) => (typeof domain.id === 'string' ? domain.id.trim() : ''))
      .filter(Boolean),
    async stopAll() {
      for (const domain of startedDomains) {
        if (typeof domain.stopWorker === 'function') {
          await domain.stopWorker(ctx);
        }
      }
    },
  };
}

module.exports = {
  loadDomainsForRuntime,
};
