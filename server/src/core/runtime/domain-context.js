const mongoose = require('mongoose');
const { logger } = require('../../core/lib/logger');
const { publishTelemetry } = require('../../core/lib/telemetry');

function createDomainContext({ role, app, config, core = {} } = {}) {
  return {
    role: typeof role === 'string' ? role : '',
    app,
    config: config && typeof config === 'object' ? config : {},
    mongo: mongoose,
    logger,
    telemetry: {
      emit: publishTelemetry,
    },
    core,
  };
}

module.exports = {
  createDomainContext,
};
