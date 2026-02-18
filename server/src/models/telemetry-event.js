const mongoose = require('mongoose');

const telemetryEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    level: { type: String, default: '' },
    jobId: { type: String, default: '' },
    traceId: { type: String, default: '' },
    ts: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Used for TTL index — set to the parsed ts date on insert
    createdAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false }
);

telemetryEventSchema.index({ ts: -1 });
telemetryEventSchema.index({ jobId: 1, ts: -1 });
// TTL: auto-expire documents after 24 hours to prevent unbounded collection growth
telemetryEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const TelemetryEvent =
  mongoose.models.TelemetryEvent ||
  mongoose.model('TelemetryEvent', telemetryEventSchema);

module.exports = { TelemetryEvent };
