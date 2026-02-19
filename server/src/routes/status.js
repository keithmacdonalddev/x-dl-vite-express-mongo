const routePath = require.resolve('../api/routes/status');
delete require.cache[routePath];
module.exports = require(routePath);
