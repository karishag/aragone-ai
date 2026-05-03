// src/routes/images.js
const express = require('express');
const router = express.Router();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { upload, handleMulterError } = require('../middleware/upload');
const { validateImage } = require('../services/validationService');
const { processImage, generateThumbnail } = require('../services/imageService');
const storageService = require('../services/storageService');
const ImageModel = require('../models/imageModel');

// ─── POST /api/images/upload ───────────────────────────────────────────────
// Upload one or more images, validate, store, and return results

router.post(
  '/upload',
  upload.array('images', 10),
  handleMulterError,
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const sessionId = req.body.sessionId || uuidv4();
    const ipAddress = req.ip || req.connection.remoteAddress;
    const results = [];

    // Process each file — can be done in parallel for better throughput
    await Promise.all(
      req.files.map(async (file) => {
        const imageId = uuidv4();

        try {
          // ── Step 1: Validate ──────────────────────────────────────────
          const validation = await validateImage(
            file.buffer,
            file.originalname,
            file.mimetype,
            file.size
          );

          const status = validation.passed ? 'accepted' : 'rejected';

          // ── Step 2: Process image (convert HEIC, optimize, strip EXIF) ─
          let processedBuffer = file.buffer;
          let finalMimeType = file.mimetype;
          let finalExt = path.extname(file.originalname).toLowerCase() || '.jpg';
          let convertedFrom = null;

          if (validation.passed || true) {
            // Process even rejected images for preview/thumbnail
            try {
              const processed = await processImage(file.buffer, file.mimetype, file.originalname);
              processedBuffer = processed.buffer;
              finalMimeType = processed.mimeType;
              finalExt = processed.ext;
              convertedFrom = processed.convertedFrom;
            } catch (processErr) {
              console.error('Image processing error:', processErr.message);
            }
          }

          // ── Step 3: Generate thumbnail ────────────────────────────────
          let thumbnailBuffer;
          try {
            thumbnailBuffer = await generateThumbnail(processedBuffer);
          } catch (thumbErr) {
            console.error('Thumbnail generation failed:', thumbErr.message);
          }

          // ── Step 4: Upload to S3 ──────────────────────────────────────
          const s3Key = storageService.buildKey(imageId, `image${finalExt}`);
          const thumbKey = storageService.buildThumbnailKey(imageId);

          const [s3Result, thumbResult] = await Promise.all([
            storageService.uploadFile(processedBuffer, s3Key, finalMimeType, {
              originalFilename: file.originalname,
              status,
              sessionId,
            }),
            thumbnailBuffer
              ? storageService.uploadFile(thumbnailBuffer, thumbKey, 'image/jpeg')
              : Promise.resolve({ key: null, url: null }),
          ]);

          // ── Step 5: Save to database ──────────────────────────────────
          const record = await ImageModel.create({
            id: imageId,
            original_filename: file.originalname,
            stored_filename: `${imageId}${finalExt}`,
            s3_key: s3Result.key,
            s3_url: s3Result.url,
            thumbnail_s3_key: thumbResult.key,
            thumbnail_s3_url: thumbResult.url,
            mime_type: finalMimeType,
            original_format: path.extname(file.originalname).replace('.', '').toLowerCase() || 'unknown',
            converted_format: convertedFrom ? (finalMimeType === 'image/jpeg' ? 'jpeg' : 'png') : null,
            file_size_bytes: processedBuffer.length,
            width: validation.metadata.width || 0,
            height: validation.metadata.height || 0,
            status,
            validation_results: validation.validationResults,
            rejection_reasons: validation.rejectionReasons.join(' | '),
            perceptual_hash: validation.perceptualHash,
            blur_score: validation.blurScore,
            face_count: validation.faceCount || 0,
            face_area_ratio: validation.faceAreaRatio || 0,
            session_id: sessionId,
            ip_address: ipAddress,
          });

          results.push({
            id: record.id,
            originalFilename: record.original_filename,
            status: record.status,
            thumbnailUrl: record.thumbnail_s3_url,
            imageUrl: record.s3_url,
            dimensions: {
              width: record.width,
              height: record.height,
            },
            fileSize: record.file_size_bytes,
            mimeType: record.mime_type,
            convertedFrom: record.converted_format ? record.original_format : null,
            validationResults: record.validation_results,
            rejectionReasons: validation.rejectionReasons,
            uploadedAt: record.created_at,
          });
        } catch (err) {
          console.error(`Error processing file ${file.originalname}:`, err);
          results.push({
            originalFilename: file.originalname,
            status: 'error',
            error: err.message,
            rejectionReasons: [`Internal processing error: ${err.message}`],
          });
        }
      })
    );

    const accepted = results.filter((r) => r.status === 'accepted');
    const rejected = results.filter((r) => r.status === 'rejected' || r.status === 'error');

    res.status(200).json({
      sessionId,
      summary: {
        total: results.length,
        accepted: accepted.length,
        rejected: rejected.length,
      },
      results,
    });
  }
);

// ─── GET /api/images ───────────────────────────────────────────────────────
// List images with pagination and filtering

router.get('/', async (req, res) => {
  try {
    const { status, sessionId, page = 1, limit = 20, orderBy = 'created_at', order = 'desc' } = req.query;

    const result = await ImageModel.list({
      status,
      sessionId,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Max 100 per page
      orderBy,
      order,
    });

    res.json(result);
  } catch (err) {
    console.error('List images error:', err);
    res.status(500).json({ error: 'Failed to retrieve images', message: err.message });
  }
});

// ─── GET /api/images/stats ─────────────────────────────────────────────────
// Get aggregate statistics

router.get('/stats', async (req, res) => {
  try {
    const stats = await ImageModel.getStats();
    res.json({
      total: parseInt(stats.total) || 0,
      accepted: parseInt(stats.accepted) || 0,
      rejected: parseInt(stats.rejected) || 0,
      pending: parseInt(stats.pending) || 0,
      avgFileSizeBytes: parseFloat(stats.avg_file_size) || 0,
      totalStorageBytes: parseInt(stats.total_storage_bytes) || 0,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to retrieve stats', message: err.message });
  }
});

// ─── GET /api/images/:id ───────────────────────────────────────────────────
// Get single image

router.get('/:id', async (req, res) => {
  try {
    const image = await ImageModel.findById(req.params.id);
    if (!image) return res.status(404).json({ error: 'Image not found' });

    // Generate fresh signed URL if using S3
    let imageUrl = image.s3_url;
    let thumbnailUrl = image.thumbnail_s3_url;

    if (image.s3_key && storageService.isConfigured) {
      imageUrl = await storageService.getSignedUrl(image.s3_key, 3600);
      if (image.thumbnail_s3_key) {
        thumbnailUrl = await storageService.getSignedUrl(image.thumbnail_s3_key, 3600);
      }
    }

    res.json({ ...image, s3_url: imageUrl, thumbnail_s3_url: thumbnailUrl });
  } catch (err) {
    console.error('Get image error:', err);
    res.status(500).json({ error: 'Failed to retrieve image', message: err.message });
  }
});

// ─── DELETE /api/images/:id ────────────────────────────────────────────────
// Delete image from DB and S3

router.delete('/:id', async (req, res) => {
  try {
    const image = await ImageModel.findById(req.params.id);
    if (!image) return res.status(404).json({ error: 'Image not found' });

    // Delete from S3
    if (image.s3_key) await storageService.deleteFile(image.s3_key).catch(() => {});
    if (image.thumbnail_s3_key) await storageService.deleteFile(image.thumbnail_s3_key).catch(() => {});

    // Delete from DB
    await ImageModel.delete(req.params.id);

    res.json({ message: 'Image deleted successfully', id: req.params.id });
  } catch (err) {
    console.error('Delete image error:', err);
    res.status(500).json({ error: 'Failed to delete image', message: err.message });
  }
});

// ─── PATCH /api/images/:id/status ──────────────────────────────────────────
// Manually update image status (admin use)

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be "accepted" or "rejected".' });
    }

    const image = await ImageModel.update(req.params.id, { status });
    if (!image) return res.status(404).json({ error: 'Image not found' });

    res.json(image);
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Failed to update status', message: err.message });
  }
});

module.exports = router;
