const mongoose = require('mongoose');

const heartbeatSchema = new mongoose.Schema(
  {
    workerId: { type: String, default: 'default', required: true },
    lastHeartbeatAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false }
);

const WorkerHeartbeat =
  mongoose.models.WorkerHeartbeat ||
  mongoose.model('WorkerHeartbeat', heartbeatSchema);

module.exports = { WorkerHeartbeat };
