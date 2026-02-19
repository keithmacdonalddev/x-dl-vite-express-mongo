const corePath = require.resolve('../core/runtime/start-api-runtime');
delete require.cache[corePath];
module.exports = require(corePath);
