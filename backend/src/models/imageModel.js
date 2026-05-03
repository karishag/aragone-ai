// src/models/imageModel.js
const db = require('../db');

const TABLE = 'images';

const ImageModel = {
  /**
   * Create a new image record
   */
  async create(data) {
    const [record] = await db(TABLE).insert(data).returning('*');
    return record;
  },

  /**
   * Find image by ID
   */
  async findById(id) {
    return db(TABLE).where({ id }).first();
  },

  /**
   * Update image record
   */
  async update(id, data) {
    const [record] = await db(TABLE)
      .where({ id })
      .update({ ...data, updated_at: db.fn.now() })
      .returning('*');
    return record;
  },

  /**
   * Delete image record
   */
  async delete(id) {
    return db(TABLE).where({ id }).delete();
  },

  /**
   * Get paginated list of images with optional filters
   */
  async list({ status, sessionId, page = 1, limit = 20, orderBy = 'created_at', order = 'desc' } = {}) {
    const query = db(TABLE).select('*');

    if (status) query.where('status', status);
    if (sessionId) query.where('session_id', sessionId);

    const offset = (page - 1) * limit;

    const [{ count }] = await db(TABLE)
      .modify((q) => {
        if (status) q.where('status', status);
        if (sessionId) q.where('session_id', sessionId);
      })
      .count('id as count');

    const rows = await query
      .orderBy(orderBy, order)
      .limit(limit)
      .offset(offset);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: parseInt(count),
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  /**
   * Get images grouped by status for a session
   */
  async getSessionSummary(sessionId) {
    const rows = await db(TABLE)
      .where('session_id', sessionId)
      .select('status', db.raw('COUNT(*) as count'))
      .groupBy('status');

    const summary = { accepted: 0, rejected: 0, pending: 0, processing: 0 };
    rows.forEach((r) => {
      summary[r.status] = parseInt(r.count);
    });
    return summary;
  },

  /**
   * Get all accepted images (for similarity checking)
   */
  async getAcceptedHashes() {
    return db(TABLE)
      .where('status', 'accepted')
      .whereNotNull('perceptual_hash')
      .select('id', 'perceptual_hash', 'original_filename')
      .orderBy('created_at', 'desc')
      .limit(1000);
  },

  /**
   * Get statistics across all images
   */
  async getStats() {
    const [stats] = await db(TABLE)
      .select([
        db.raw('COUNT(*) as total'),
        db.raw("COUNT(*) FILTER (WHERE status = 'accepted') as accepted"),
        db.raw("COUNT(*) FILTER (WHERE status = 'rejected') as rejected"),
        db.raw("COUNT(*) FILTER (WHERE status = 'pending') as pending"),
        db.raw('AVG(file_size_bytes) as avg_file_size'),
        db.raw('SUM(file_size_bytes) as total_storage_bytes'),
      ]);

    return stats;
  },
};

module.exports = ImageModel;
