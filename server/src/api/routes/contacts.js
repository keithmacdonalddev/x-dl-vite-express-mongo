const express = require('express');
const mongoose = require('mongoose');
const { Job } = require('../../models/job');
const { ERROR_CODES } = require('../../lib/error-codes');
const { logger } = require('../../lib/logger');
const {
  sendError,
  normalizeContactSlug,
  sanitizeDisplayName,
  deleteJobFiles,
} = require('./helpers/route-utils');

const contactsRouter = express.Router();

contactsRouter.patch('/contact/:slug', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const slug = normalizeContactSlug(req.params.slug);
  if (!slug) {
    return sendError(res, 400, ERROR_CODES.INVALID_CONTACT_SLUG, 'Invalid contact slug.');
  }

  const displayName = sanitizeDisplayName(req.body?.displayName);
  if (!displayName) {
    return sendError(res, 400, ERROR_CODES.UPDATE_CONTACT_FAILED, 'Display name is required.');
  }

  try {
    const result = await Job.updateMany(
      { accountSlug: slug },
      {
        $set: {
          accountDisplayName: displayName,
        },
      }
    );

    return res.json({
      ok: true,
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
      contactSlug: slug,
      displayName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.contact.update.failed', { message, slug });
    return sendError(res, 500, ERROR_CODES.UPDATE_CONTACT_FAILED, `Failed to update contact: ${message}`);
  }
});

contactsRouter.delete('/contact/:slug', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, 503, ERROR_CODES.DB_NOT_CONNECTED, 'Database not connected.');
  }

  const slug = normalizeContactSlug(req.params.slug);
  if (!slug) {
    return sendError(res, 400, ERROR_CODES.INVALID_CONTACT_SLUG, 'Invalid contact slug.');
  }

  try {
    const jobs = await Job.find({ accountSlug: slug }).lean();
    await Promise.all(jobs.map((job) => deleteJobFiles(job)));
    const result = await Job.deleteMany({ accountSlug: slug });

    return res.json({
      ok: true,
      deletedCount: result.deletedCount || 0,
      contactSlug: slug,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('jobs.contact.delete.failed', { message, slug });
    return sendError(res, 500, ERROR_CODES.DELETE_CONTACT_FAILED, `Failed to delete contact jobs: ${message}`);
  }
});

module.exports = { contactsRouter };

