// src/services/validationService.js
const sharp = require('sharp');
const db = require('../db');

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_WIDTH = parseInt(process.env.MIN_IMAGE_WIDTH) || 200;
const MIN_HEIGHT = parseInt(process.env.MIN_IMAGE_HEIGHT) || 200;
const MIN_FILE_SIZE = parseInt(process.env.MIN_FILE_SIZE_BYTES) || 10240; // 10KB
const BLUR_THRESHOLD = parseFloat(process.env.BLUR_THRESHOLD) || 100;
const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.85;
const MIN_FACE_RATIO = parseFloat(process.env.MIN_FACE_RATIO) || 0.05;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];

// ─── Perceptual Hashing ───────────────────────────────────────────────────────

/**
 * Compute a simple perceptual hash (DCT-based pHash approximation using sharp)
 * Resize to 32x32, convert to grayscale, compute average, build binary hash
 */
async function computePerceptualHash(buffer) {
  try {
    const { data } = await sharp(buffer)
      .resize(32, 32, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const avg = pixels.reduce((sum, p) => sum + p, 0) / pixels.length;

    // Build binary hash: 1 if pixel > avg, else 0
    const hashBits = pixels.map((p) => (p > avg ? 1 : 0));

    // Convert to hex string (groups of 4 bits)
    let hash = '';
    for (let i = 0; i < hashBits.length; i += 4) {
      const nibble = (hashBits[i] << 3) | (hashBits[i + 1] << 2) | (hashBits[i + 2] << 1) | hashBits[i + 3];
      hash += nibble.toString(16);
    }

    return hash;
  } catch (err) {
    console.error('Hash computation failed:', err.message);
    return null;
  }
}

/**
 * Compute Hamming distance between two hex hash strings
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return Infinity;

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const a = parseInt(hash1[i], 16);
    const b = parseInt(hash2[i], 16);
    const xor = a ^ b;
    // Count set bits
    distance += xor.toString(2).split('').filter((bit) => bit === '1').length;
  }
  return distance;
}

/**
 * Similarity as a ratio (0 = completely different, 1 = identical)
 */
function hashSimilarity(hash1, hash2) {
  const totalBits = hash1.length * 4;
  const dist = hammingDistance(hash1, hash2);
  return 1 - dist / totalBits;
}

// ─── Blur Detection ───────────────────────────────────────────────────────────

/**
 * Compute the Laplacian variance to detect blur.
 * High variance = sharp image. Low variance = blurry.
 * Uses a manual 3x3 Laplacian kernel via convolution.
 */
async function computeBlurScore(buffer) {
  try {
    const { data, info } = await sharp(buffer)
      .resize({ width: 512, withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    const pixels = Array.from(data);

    // Apply Laplacian kernel: [0,1,0, 1,-4,1, 0,1,0]
    let sumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const laplacian =
          -4 * pixels[idx] +
          pixels[idx - 1] +
          pixels[idx + 1] +
          pixels[idx - width] +
          pixels[idx + width];
        sumSq += laplacian * laplacian;
        count++;
      }
    }

    const variance = count > 0 ? sumSq / count : 0;
    return variance;
  } catch (err) {
    console.error('Blur score computation failed:', err.message);
    return BLUR_THRESHOLD + 1; // Assume not blurry on error
  }
}

// ─── Face Detection ───────────────────────────────────────────────────────────

/**
 * Detect faces using the free face-api or a simple Viola-Jones approximation.
 * Since we can't guarantee external API availability, we implement a
 * lightweight skin-tone region detection as a fallback.
 * 
 * For production: integrate with AWS Rekognition, Google Vision, or
 * deploy face-api.js with tfjs-node.
 */
async function detectFaces(buffer, imageWidth, imageHeight) {
  // Try to use sharp to analyze skin-tone regions as a heuristic
  // This is a simplified approach — for production use AWS Rekognition or similar
  try {
    const { data } = await sharp(buffer)
      .resize(100, 100, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    let skinPixels = 0;
    const totalPixels = 100 * 100;

    // Simple skin color detection in RGB space
    for (let i = 0; i < pixels.length; i += 3) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Skin tone heuristic (works for various skin tones)
      const isSkin =
        r > 60 && g > 40 && b > 20 &&
        r > b &&
        Math.abs(r - g) > 15 &&
        r > 100 &&
        r > g + 10;

      if (isSkin) skinPixels++;
    }

    const skinRatio = skinPixels / totalPixels;

    // Estimate face presence and area based on skin ratio
    // This is a rough heuristic — replace with proper face detection in production
    let faceCount = 0;
    let faceAreaRatio = 0;

    if (skinRatio > 0.05 && skinRatio < 0.7) {
      // Likely has a face
      faceCount = 1;
      faceAreaRatio = skinRatio * 0.6; // Rough approximation
      
      if (skinRatio > 0.4) {
        // Very high skin ratio might indicate multiple faces or face close-up
        faceCount = skinRatio > 0.6 ? 2 : 1;
      }
    } else if (skinRatio >= 0.7) {
      // Extremely high skin ratio — multiple faces or extreme close-up
      faceCount = 2;
      faceAreaRatio = skinRatio;
    }

    return { faceCount, faceAreaRatio };
  } catch (err) {
    console.error('Face detection failed:', err.message);
    return { faceCount: 0, faceAreaRatio: 0 };
  }
}

// ─── Main Validation Pipeline ─────────────────────────────────────────────────

/**
 * Run all validations on an uploaded image buffer
 * Returns { passed, rejectionReasons, metadata }
 */
async function validateImage(buffer, originalFilename, mimeType, fileSize) {
  const rejectionReasons = [];
  const validationResults = {};

  // ── 1. Format Validation ──────────────────────────────────────────────────
  const ext = require('path').extname(originalFilename).toLowerCase();
  const isValidFormat =
    ALLOWED_MIME_TYPES.includes(mimeType) || ALLOWED_EXTENSIONS.includes(ext);

  if (!isValidFormat) {
    rejectionReasons.push(`Invalid format. Only JPEG, PNG, and HEIC images are accepted.`);
    validationResults.format = { passed: false, value: mimeType };
  } else {
    validationResults.format = { passed: true, value: mimeType };
  }

  // ── 2. File Size Validation ───────────────────────────────────────────────
  if (fileSize < MIN_FILE_SIZE) {
    rejectionReasons.push(
      `File size too small (${(fileSize / 1024).toFixed(1)}KB). Minimum is ${MIN_FILE_SIZE / 1024}KB.`
    );
    validationResults.fileSize = { passed: false, value: fileSize };
  } else {
    validationResults.fileSize = { passed: true, value: fileSize };
  }

  // ── 3. Get Image Metadata ─────────────────────────────────────────────────
  let metadata = { width: 0, height: 0 };
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err) {
    if (isValidFormat) {
      rejectionReasons.push('Could not read image metadata. File may be corrupted.');
      validationResults.readable = { passed: false };
      return {
        passed: false,
        rejectionReasons,
        validationResults,
        metadata: { width: 0, height: 0 },
      };
    }
  }

  const { width, height } = metadata;

  // ── 4. Resolution Validation ──────────────────────────────────────────────
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    rejectionReasons.push(
      `Resolution too low (${width}×${height}px). Minimum is ${MIN_WIDTH}×${MIN_HEIGHT}px.`
    );
    validationResults.resolution = { passed: false, value: `${width}x${height}` };
  } else {
    validationResults.resolution = { passed: true, value: `${width}x${height}` };
  }

  // ── 5. Blur Detection ─────────────────────────────────────────────────────
  const blurScore = await computeBlurScore(buffer);
  if (blurScore < BLUR_THRESHOLD) {
    rejectionReasons.push(
      `Image is too blurry (sharpness score: ${blurScore.toFixed(1)}, minimum: ${BLUR_THRESHOLD}).`
    );
    validationResults.blur = { passed: false, score: blurScore };
  } else {
    validationResults.blur = { passed: true, score: blurScore };
  }

  // ── 6. Perceptual Hash (for similarity check) ─────────────────────────────
  const perceptualHash = await computePerceptualHash(buffer);
  let isTooSimilar = false;

  if (perceptualHash) {
    // Query existing accepted images for similarity
    const existingImages = await db('images')
      .where('status', 'accepted')
      .whereNotNull('perceptual_hash')
      .select('id', 'perceptual_hash', 'original_filename')
      .limit(500); // Check last 500 accepted images

    for (const existing of existingImages) {
      const similarity = hashSimilarity(perceptualHash, existing.perceptual_hash);
      if (similarity >= SIMILARITY_THRESHOLD) {
        rejectionReasons.push(
          `Image is too similar to an existing image (${(similarity * 100).toFixed(1)}% similar to "${existing.original_filename}").`
        );
        validationResults.similarity = {
          passed: false,
          similarity,
          similarTo: existing.id,
        };
        isTooSimilar = true;
        break;
      }
    }

    if (!isTooSimilar) {
      validationResults.similarity = { passed: true };
    }
  }

  // ── 7. Face Detection ─────────────────────────────────────────────────────
  const { faceCount, faceAreaRatio } = await detectFaces(buffer, width, height);

  if (faceCount === 0) {
    // No face detected — could still be a valid photo, but flag it
    validationResults.face = {
      passed: true,
      faceCount,
      faceAreaRatio,
      note: 'No face detected',
    };
  } else if (faceCount > 1) {
    rejectionReasons.push(`Multiple faces detected (${faceCount} faces). Only single-face images are accepted.`);
    validationResults.face = { passed: false, faceCount, faceAreaRatio };
  } else if (faceAreaRatio < MIN_FACE_RATIO) {
    rejectionReasons.push(
      `Detected face is too small (${(faceAreaRatio * 100).toFixed(1)}% of image). Face should occupy at least ${MIN_FACE_RATIO * 100}% of the image.`
    );
    validationResults.face = { passed: false, faceCount, faceAreaRatio };
  } else {
    validationResults.face = { passed: true, faceCount, faceAreaRatio };
  }

  return {
    passed: rejectionReasons.length === 0,
    rejectionReasons,
    validationResults,
    metadata: { width, height, format: metadata.format },
    perceptualHash,
    blurScore,
    faceCount,
    faceAreaRatio,
  };
}

module.exports = {
  validateImage,
  computePerceptualHash,
  computeBlurScore,
  detectFaces,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
};
