/**
 * One-time cleanup script: remove duplicate DiscoveredPost documents
 * and normalize www.tiktok.com URLs to tiktok.com.
 *
 * Usage: node server/scripts/cleanup-duplicate-discovered-posts.js
 */

const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load .env from server directory (same as the app)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { getServerConfig } = require('../src/core/config/env');
const { DiscoveredPost } = require('../src/core/data/discovered-post-model');

async function main() {
  const { mongoUri } = getServerConfig();
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI is not set. Check server/.env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  // -------------------------------------------------------
  // 1. Find and remove duplicate DiscoveredPosts
  //    Group by accountSlug + videoId where videoId is not null/empty
  // -------------------------------------------------------
  console.log('--- Phase 1: Remove duplicate discovered posts ---');

  const duplicateGroups = await DiscoveredPost.aggregate([
    { $match: { videoId: { $ne: null, $ne: '' } } },
    {
      $group: {
        _id: { accountSlug: '$accountSlug', videoId: '$videoId' },
        count: { $sum: 1 },
        docs: {
          $push: { _id: '$_id', createdAt: '$createdAt' },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  console.log(`Found ${duplicateGroups.length} groups with duplicates.`);

  let totalDeleted = 0;

  for (const group of duplicateGroups) {
    // Sort docs by createdAt ascending — keep the oldest (first)
    const sorted = group.docs.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const keepId = sorted[0]._id;
    const deleteIds = sorted.slice(1).map((d) => d._id);

    console.log(
      `  [${group._id.accountSlug} / ${group._id.videoId}] ` +
        `${group.count} docs — keeping ${keepId}, deleting ${deleteIds.length}`
    );

    const result = await DiscoveredPost.deleteMany({ _id: { $in: deleteIds } });
    totalDeleted += result.deletedCount;
  }

  console.log(`Deleted ${totalDeleted} duplicate documents.\n`);

  // -------------------------------------------------------
  // 2. Normalize canonicalUrl: www.tiktok.com -> tiktok.com
  // -------------------------------------------------------
  console.log('--- Phase 2: Normalize www.tiktok.com URLs ---');

  const wwwDocs = await DiscoveredPost.find({
    canonicalUrl: { $regex: /www\.tiktok\.com/ },
  }).lean();

  console.log(`Found ${wwwDocs.length} documents with www.tiktok.com in canonicalUrl.`);

  let normalizedCount = 0;

  for (const doc of wwwDocs) {
    const newUrl = doc.canonicalUrl.replace(/www\.tiktok\.com/g, 'tiktok.com');
    if (newUrl !== doc.canonicalUrl) {
      await DiscoveredPost.updateOne(
        { _id: doc._id },
        { $set: { canonicalUrl: newUrl } }
      );
      normalizedCount++;
    }
  }

  console.log(`Normalized ${normalizedCount} URLs.\n`);

  // -------------------------------------------------------
  // Done
  // -------------------------------------------------------
  console.log('Cleanup complete. Disconnecting...');
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Script failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
