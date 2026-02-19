const JOB_STATUSES = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
});

const JOB_STATUS_VALUES = Object.freeze(Object.values(JOB_STATUSES));

const SOURCE_TYPES = Object.freeze({
  DIRECT: 'direct',
  HLS: 'hls',
  UNKNOWN: 'unknown',
});

const SOURCE_TYPE_VALUES = Object.freeze(Object.values(SOURCE_TYPES));

module.exports = {
  JOB_STATUSES,
  JOB_STATUS_VALUES,
  SOURCE_TYPES,
  SOURCE_TYPE_VALUES,
};
