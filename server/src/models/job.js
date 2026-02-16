const mongoose = require('mongoose');

const JOB_STATUSES = ['queued', 'running', 'completed', 'failed'];

const jobSchema = new mongoose.Schema(
  {
    tweetUrl: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: JOB_STATUSES,
      default: 'queued',
      required: true,
    },
    extractedUrl: {
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

module.exports = {
  Job,
  JOB_STATUSES,
};
