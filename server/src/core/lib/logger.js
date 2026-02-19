const { publishTelemetry } = require('./telemetry');
const sourceProcessId = String(process.pid);
const processRole = String(process.env.ROLE || 'combined');

function serialize(level, event, meta = {}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...meta,
  });
}

const logger = {
  info(event, meta = {}) {
    publishTelemetry(event, { level: 'info', sourceProcessId, processRole, ...meta });
    console.log(serialize('info', event, meta));
  },
  error(event, meta = {}) {
    publishTelemetry(event, { level: 'error', sourceProcessId, processRole, ...meta });
    console.error(serialize('error', event, meta));
  },
};

module.exports = {
  logger,
};
