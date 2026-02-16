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
    console.log(serialize('info', event, meta));
  },
  error(event, meta = {}) {
    console.error(serialize('error', event, meta));
  },
};

module.exports = {
  logger,
};
