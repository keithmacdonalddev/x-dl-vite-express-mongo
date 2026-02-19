const corePath = require.resolve('../core/runtime/start-worker-runtime');
delete require.cache[corePath];
module.exports = require(corePath);
