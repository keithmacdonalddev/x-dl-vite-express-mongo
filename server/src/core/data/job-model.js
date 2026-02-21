const mongoose = require('mongoose');
const {
  JOB_STATUSES,
  JOB_STATUS_VALUES,
  SOURCE_TYPES,
  SOURCE_TYPE_VALUES,
} = require('./job-status');

const jobSchema = new mongoose.Schema(
  {
    tweetUrl: {
      type: String,
      required: true,
      trim: true,
    },
    canonicalUrl: {
      type: String,
      default: '',
      trim: true,
    },
    domainId: {
      type: String,
      default: '',
      trim: true,
    },
    traceId: {
      type: String,
      default: '',
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
    accountPlatform: {
      type: String,
      default: 'unknown',
      trim: true,
    },
    accountHandle: {
      type: String,
      default: '',
      trim: true,
    },
    accountDisplayName: {
      type: String,
      default: '',
      trim: true,
    },
    accountSlug: {
      type: String,
      default: '',
      trim: true,
    },
    publishedAt: {
      type: Date,
      default: null,
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
    thumbnailUrl: {
      type: String,
      default: '',
      trim: true,
    },
    thumbnailPath: {
      type: String,
      default: '',
      trim: true,
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
    errorCode: {
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
jobSchema.index({ publishedAt: -1, createdAt: -1 });
jobSchema.index(
  { canonicalUrl: 1 },
  {
    unique: true,
    partialFilterExpression: {
      canonicalUrl: { $exists: true, $gt: '' },
      status: {
        $in: [
          JOB_STATUSES.QUEUED,
          JOB_STATUSES.RUNNING,
          JOB_STATUSES.COMPLETED,
        ],
      },
    },
  }
);

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

module.exports = {
  Job,
  JOB_STATUSES: JOB_STATUS_VALUES,
};
