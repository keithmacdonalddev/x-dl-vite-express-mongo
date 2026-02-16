const mongoose = require('mongoose');
const {
  JOB_STATUSES,
  JOB_STATUS_VALUES,
  SOURCE_TYPES,
  SOURCE_TYPE_VALUES,
} = require('../constants/job-status');

const jobSchema = new mongoose.Schema(
  {
    tweetUrl: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: JOB_STATUS_VALUES,
      default: JOB_STATUSES.QUEUED,
      required: true,
    },
    progressPct: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      required: true,
    },
    attemptCount: {
      type: Number,
      min: 0,
      default: 0,
      required: true,
    },
    sourceType: {
      type: String,
      enum: SOURCE_TYPE_VALUES,
      default: SOURCE_TYPES.UNKNOWN,
      required: true,
    },
    extractedUrl: {
      type: String,
      default: '',
      trim: true,
    },
    candidateUrls: {
      type: [String],
      default: [],
    },
    imageUrls: {
      type: [String],
      default: [],
    },
    metadata: {
      type: Object,
      default: {},
    },
    outputPath: {
      type: String,
      default: '',
      trim: true,
    },
    error: {
      type: String,
      default: '',
      trim: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

jobSchema.index({ status: 1, createdAt: 1 });

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

module.exports = {
  Job,
  JOB_STATUSES: JOB_STATUS_VALUES,
};
