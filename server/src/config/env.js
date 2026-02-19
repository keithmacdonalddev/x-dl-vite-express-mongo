const corePath = require.resolve('../core/config/env');
delete require.cache[corePath];
module.exports = require(corePath);
