const mongoose = require('mongoose');

const discoveredPostSchema = new mongoose.Schema(
  {
    accountSlug: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    accountHandle: {
      type: String,
      default: '',
      trim: true,
    },
    accountPlatform: {
      type: String,
      default: 'tiktok',
      trim: true,
    },
    postUrl: {
      type: String,
      required: true,
      trim: true,
    },
    canonicalUrl: {
      type: String,
      required: true,
      trim: true,
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
    videoId: {
      type: String,
      default: '',
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    downloadedJobId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

discoveredPostSchema.index({ canonicalUrl: 1 }, { unique: true });
discoveredPostSchema.index({ accountSlug: 1, downloadedJobId: 1 });

const DiscoveredPost =
  mongoose.models.DiscoveredPost || mongoose.model('DiscoveredPost', discoveredPostSchema);

module.exports = { DiscoveredPost };
