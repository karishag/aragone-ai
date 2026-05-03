// src/services/imageService.js
const sharp = require('sharp');
const path = require('path');

/**
 * Convert HEIC/HEIF buffer to JPEG using sharp (sharp handles HEIC on most platforms)
 * Falls back to heic-convert if sharp fails
 */
async function convertHeicToJpeg(buffer) {
  try {
    // Sharp can handle HEIC on platforms with libheif
    const converted = await sharp(buffer)
      .jpeg({ quality: 90, progressive: true })
      .toBuffer();
    return { buffer: converted, mimeType: 'image/jpeg', ext: '.jpg' };
  } catch (sharpErr) {
    try {
      // Fallback: heic-convert library
      const heicConvert = require('heic-convert');
      const converted = await heicConvert({
        buffer,
        format: 'JPEG',
        quality: 0.9,
      });
      return {
        buffer: Buffer.from(converted),
        mimeType: 'image/jpeg',
        ext: '.jpg',
      };
    } catch (heicErr) {
      throw new Error(`HEIC conversion failed: ${heicErr.message}`);
    }
  }
}

/**
 * Process and normalize an uploaded image:
 * - Convert HEIC to JPEG
 * - Strip EXIF metadata (privacy)
 * - Apply lossless optimization for PNG
 * - Progressive JPEG encoding
 */
async function processImage(buffer, mimeType, originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase();
  const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif' || ext === '.heic' || ext === '.heif';

  let processedBuffer;
  let finalMimeType;
  let finalExt;
  let convertedFrom = null;

  if (isHeic) {
    // Convert HEIC to JPEG
    const result = await convertHeicToJpeg(buffer);
    processedBuffer = result.buffer;
    finalMimeType = result.mimeType;
    finalExt = result.ext;
    convertedFrom = 'heic';
  } else if (mimeType === 'image/png' || ext === '.png') {
    // Optimize PNG, strip metadata
    processedBuffer = await sharp(buffer)
      .png({ compressionLevel: 7, adaptiveFiltering: true })
      .withMetadata({ exif: {} }) // Strip EXIF but keep orientation
      .toBuffer();
    finalMimeType = 'image/png';
    finalExt = '.png';
  } else {
    // JPEG: re-encode with optimization and strip EXIF
    processedBuffer = await sharp(buffer)
      .jpeg({ quality: 90, progressive: true })
      .withMetadata({ exif: {} })
      .toBuffer();
    finalMimeType = 'image/jpeg';
    finalExt = '.jpg';
  }

  return {
    buffer: processedBuffer,
    mimeType: finalMimeType,
    ext: finalExt,
    convertedFrom,
  };
}

/**
 * Generate a thumbnail for preview
 * Returns a JPEG buffer at max 400x400
 */
async function generateThumbnail(buffer, maxSize = 400) {
  return sharp(buffer)
    .resize(maxSize, maxSize, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 75, progressive: true })
    .toBuffer();
}

/**
 * Get image dimensions without full processing
 */
async function getImageDimensions(buffer) {
  const metadata = await sharp(buffer).metadata();
  return { width: metadata.width, height: metadata.height };
}

module.exports = {
  processImage,
  generateThumbnail,
  convertHeicToJpeg,
  getImageDimensions,
};
