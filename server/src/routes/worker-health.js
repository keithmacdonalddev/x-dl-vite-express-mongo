const routePath = require.resolve('../api/routes/worker-health');
delete require.cache[routePath];
module.exports = require(routePath);
