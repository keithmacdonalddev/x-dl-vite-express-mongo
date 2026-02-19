const helperPath = require.resolve('../../api/routes/helpers/route-utils');
delete require.cache[helperPath];
module.exports = require(helperPath);
