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
    accountDisplayName: {
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
    publishedAt: {
      type: Date,
      default: null,
    },
    removedFromSourceAt: {
      type: Date,
      default: null,
    },
    profileRemovedFromSourceAt: {
      type: Date,
      default: null,
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
discoveredPostSchema.index({ accountSlug: 1, publishedAt: -1, createdAt: -1 });
// Prevent duplicate discovered posts for the same account+video when URL variants differ (e.g. www vs non-www).
// Uses a partial filter so only documents with a non-empty videoId are included — posts without a
// videoId (non-TikTok content or legacy records) are excluded and do not conflict with each other.
discoveredPostSchema.index(
  { accountSlug: 1, videoId: 1 },
  { unique: true, partialFilterExpression: { videoId: { $type: 'string', $gt: '' } } }
);

const DiscoveredPost =
  mongoose.models.DiscoveredPost || mongoose.model('DiscoveredPost', discoveredPostSchema);

module.exports = { DiscoveredPost };
