const { JOB_STATUSES } = require('../constants/job-status');

const ALLOWED_TRANSITIONS = Object.freeze({
  [JOB_STATUSES.QUEUED]: new Set([JOB_STATUSES.RUNNING, JOB_STATUSES.CANCELED]),
  [JOB_STATUSES.RUNNING]: new Set([
    JOB_STATUSES.COMPLETED,
    JOB_STATUSES.FAILED,
    JOB_STATUSES.CANCELED,
  ]),
  [JOB_STATUSES.COMPLETED]: new Set(),
  [JOB_STATUSES.FAILED]: new Set(),
  [JOB_STATUSES.CANCELED]: new Set(),
});

function canTransition(fromStatus, toStatus) {
  const from = String(fromStatus || '').trim().toLowerCase();
  const to = String(toStatus || '').trim().toLowerCase();

  if (!from || !to || from === to) {
    return false;
  }

  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) {
    return false;
  }

  return allowed.has(to);
}

module.exports = {
  canTransition,
  ALLOWED_TRANSITIONS,
};
