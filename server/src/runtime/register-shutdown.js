const corePath = require.resolve('../core/runtime/register-shutdown');
delete require.cache[corePath];
module.exports = require(corePath);
