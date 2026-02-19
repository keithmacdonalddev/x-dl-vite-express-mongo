const corePath = require.resolve('../core/lib/telemetry');
delete require.cache[corePath];
module.exports = require(corePath);
