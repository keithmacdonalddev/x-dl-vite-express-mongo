const routePath = require.resolve('../api/routes/retry');
delete require.cache[routePath];
module.exports = require(routePath);
