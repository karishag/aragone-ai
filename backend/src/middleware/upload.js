// src/middleware/upload.js
const multer = require('multer');
const { ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS } = require('../services/validationService');
const path = require('path');

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024; // Default 10MB
const MAX_FILES = parseInt(process.env.MAX_FILES_PER_REQUEST) || 10;

// Use memory storage — we process and upload to S3 directly
const storage = multer.memoryStorage();

/**
 * Filter function — only allow HEIC, PNG, JPEG at the multer level
 */
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const isValidMime = ALLOWED_MIME_TYPES.includes(file.mimetype);
  const isValidExt = ALLOWED_EXTENSIONS.includes(ext);

  // Accept if either mime type OR extension is valid
  // (browsers sometimes report wrong mime types for HEIC)
  if (isValidMime || isValidExt) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        `Invalid file type: ${file.mimetype}. Only HEIC, PNG, and JPEG are allowed.`
      ),
      false
    );
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    fields: 10,
    fieldNameSize: 100,
  },
});

/**
 * Error handler for multer errors
 */
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 10}MB.`,
      LIMIT_FILE_COUNT: `Too many files. Maximum is ${MAX_FILES} files per request.`,
      LIMIT_UNEXPECTED_FILE: err.message || 'Unexpected file field.',
    };
    return res.status(400).json({
      error: 'Upload Error',
      message: messages[err.code] || err.message,
      code: err.code,
    });
  }
  next(err);
}

module.exports = { upload, handleMulterError };
