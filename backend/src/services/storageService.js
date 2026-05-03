// src/services/storageService.js
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');

class StorageService {
  constructor() {
    const clientConfig = {
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    };

    // Support for S3-compatible services (Cloudflare R2, MinIO, etc.)
    if (process.env.AWS_ENDPOINT_URL) {
      clientConfig.endpoint = process.env.AWS_ENDPOINT_URL;
      clientConfig.forcePathStyle = true;
    }

    this.s3 = new S3Client(clientConfig);
    this.bucket = process.env.S3_BUCKET_NAME;
    this.isConfigured = !!(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET_NAME
    );
  }

  /**
   * Upload a file buffer to S3
   * @param {Buffer} buffer - File buffer
   * @param {string} key - S3 object key
   * @param {string} contentType - MIME type
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<{url: string, key: string}>}
   */
  async uploadFile(buffer, key, contentType, metadata = {}) {
    if (!this.isConfigured) {
      // Return a mock URL for development without S3
      console.warn('⚠️  S3 not configured. Using mock storage.');
      return {
        key,
        url: `http://localhost:3001/mock-storage/${key}`,
      };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
      // Set appropriate cache control
      CacheControl: 'max-age=31536000',
    });

    await this.s3.send(command);

    const url = process.env.AWS_ENDPOINT_URL
      ? `${process.env.AWS_ENDPOINT_URL}/${this.bucket}/${key}`
      : `https://${this.bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

    return { key, url };
  }

  /**
   * Delete a file from S3
   * @param {string} key - S3 object key
   */
  async deleteFile(key) {
    if (!this.isConfigured) return;

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3.send(command);
  }

  /**
   * Generate a pre-signed URL for secure temporary access
   * @param {string} key - S3 object key
   * @param {number} expiresIn - Expiration in seconds (default 1 hour)
   */
  async getSignedUrl(key, expiresIn = 3600) {
    if (!this.isConfigured) {
      return `http://localhost:3001/mock-storage/${key}`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, command, { expiresIn });
  }

  /**
   * Build S3 key for an image
   */
  buildKey(imageId, filename, folder = 'images') {
    const ext = path.extname(filename).toLowerCase();
    return `${folder}/${imageId}${ext}`;
  }

  /**
   * Build S3 key for a thumbnail
   */
  buildThumbnailKey(imageId, folder = 'thumbnails') {
    return `${folder}/${imageId}_thumb.jpg`;
  }
}

module.exports = new StorageService();
