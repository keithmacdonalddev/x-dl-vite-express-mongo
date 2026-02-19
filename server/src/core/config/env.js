function getServerConfig(input = process.env) {
  return {
    port: Number(input.PORT || 4000),
    mongoUri: input.MONGODB_URI || input.MONGO_URI || '',
  };
}

function readBool(input, key, fallback = false) {
  const raw = String(input?.[key] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function getRuntimeRole(input = process.env) {
  const raw = String(input.ROLE || input.PROCESS_ROLE || 'api').trim().toLowerCase();
  if (raw === 'worker') {
    return 'worker';
  }
  if (raw === 'combined') {
    return 'combined';
  }
  return 'api';
}

function chooseRuntime(input = process.env) {
  const role = getRuntimeRole(input);
  if (role === 'worker') {
    return 'worker';
  }
  if (role === 'combined') {
    return 'combined';
  }
  return 'api';
}

function isDomainKernelEnabled(input = process.env) {
  return readBool(input, 'ENABLE_DOMAIN_KERNEL', false);
}

function isStrictPluginStartup(input = process.env) {
  // Keep backwards compatibility with existing strict flag naming.
  const strictPlugins = readBool(input, 'STRICT_PLUGINS', false);
  const strictDomains = readBool(input, 'STRICT_DOMAINS', false);
  return strictPlugins || strictDomains;
}

module.exports = {
  getServerConfig,
  getRuntimeRole,
  chooseRuntime,
  isDomainKernelEnabled,
  isStrictPluginStartup,
};
