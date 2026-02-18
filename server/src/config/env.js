function getServerConfig(input = process.env) {
  return {
    port: Number(input.PORT || 4000),
    mongoUri: input.MONGODB_URI || input.MONGO_URI || '',
  };
}

function getRuntimeRole(input = process.env) {
  const raw = String(input.ROLE || input.PROCESS_ROLE || 'api').trim().toLowerCase();
  return raw === 'worker' ? 'worker' : 'api';
}

function chooseRuntime(input = process.env) {
  return getRuntimeRole(input) === 'worker' ? 'worker' : 'api';
}

module.exports = {
  getServerConfig,
  getRuntimeRole,
  chooseRuntime,
};
