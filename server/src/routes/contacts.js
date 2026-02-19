const routePath = require.resolve('../api/routes/contacts');
delete require.cache[routePath];
module.exports = require(routePath);
