// src/hooks/useImageUpload.js
import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { uploadImages } from '../utils/api';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];
const MAX_FILE_SIZE_MB = 10;

/**
 * Validate file on the frontend before sending to backend
 * Returns { valid: boolean, error: string | null }
 */
function validateFileLocally(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  const isValidType = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(ext);

  if (!isValidType) {
    return {
      valid: false,
      error: `"${file.name}" is not a supported format. Only JPEG, PNG, and HEIC images are accepted.`,
    };
  }

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return {
      valid: false,
      error: `"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB.`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Generate a local preview URL for a File object
 */
function generatePreview(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function useImageUpload() {
  // Queue of files waiting to upload
  const [queue, setQueue] = useState([]);
  // Completed results (accepted + rejected)
  const [accepted, setAccepted] = useState([]);
  const [rejected, setRejected] = useState([]);
  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  // Session
  const sessionId = useRef(uuidv4());

  /**
   * Add files to the queue with frontend validation and preview generation
   */
  const addFiles = useCallback(async (newFiles) => {
    setError(null);
    const validFiles = [];
    const frontendRejected = [];

    for (const file of newFiles) {
      const validation = validateFileLocally(file);
      const preview = await generatePreview(file);

      if (!validation.valid) {
        frontendRejected.push({
          id: uuidv4(),
          originalFilename: file.name,
          status: 'rejected',
          preview,
          rejectionReasons: [validation.error],
          source: 'frontend',
        });
      } else {
        validFiles.push({
          id: uuidv4(),
          file,
          preview,
          status: 'queued',
          originalFilename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });
      }
    }

    // Add frontend-rejected files immediately to rejected list
    if (frontendRejected.length > 0) {
      setRejected((prev) => [...prev, ...frontendRejected]);
    }

    setQueue((prev) => [...prev, ...validFiles]);
    return { validCount: validFiles.length, rejectedCount: frontendRejected.length };
  }, []);

  /**
   * Remove a file from the queue
   */
  const removeFromQueue = useCallback((id) => {
    setQueue((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /**
   * Upload all queued files
   */
  const uploadQueue = useCallback(async () => {
    if (queue.length === 0 || isUploading) return;

    setIsUploading(true);
    setProgress(0);
    setError(null);

    // Mark all queued files as uploading
    setQueue((prev) => prev.map((f) => ({ ...f, status: 'uploading' })));

    try {
      const files = queue.map((q) => q.file);
      const queueMap = Object.fromEntries(queue.map((q) => [q.originalFilename, q]));

      const result = await uploadImages(files, sessionId.current, setProgress);

      const newAccepted = [];
      const newRejected = [];

      result.results.forEach((r) => {
        const queued = queueMap[r.originalFilename] || {};
        const enriched = {
          ...r,
          preview: queued.preview, // Use local preview (faster than fetching from S3)
          localId: queued.id,
        };

        if (r.status === 'accepted') {
          newAccepted.push(enriched);
        } else {
          newRejected.push(enriched);
        }
      });

      setAccepted((prev) => [...prev, ...newAccepted]);
      setRejected((prev) => [...prev, ...newRejected]);
      setQueue([]); // Clear queue
      setProgress(100);
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Upload failed. Please try again.';
      setError(message);
      // Mark all as error
      setQueue((prev) => prev.map((f) => ({ ...f, status: 'error' })));
    } finally {
      setIsUploading(false);
    }
  }, [queue, isUploading]);

  /**
   * Clear all results
   */
  const clearAll = useCallback(() => {
    setQueue([]);
    setAccepted([]);
    setRejected([]);
    setError(null);
    setProgress(0);
    sessionId.current = uuidv4(); // New session
  }, []);

  /**
   * Remove an item from accepted or rejected
   */
  const removeResult = useCallback((id, status) => {
    if (status === 'accepted') {
      setAccepted((prev) => prev.filter((r) => r.id !== id));
    } else {
      setRejected((prev) => prev.filter((r) => r.id !== id || r.localId !== id));
    }
  }, []);

  return {
    queue,
    accepted,
    rejected,
    isUploading,
    progress,
    error,
    sessionId: sessionId.current,
    addFiles,
    removeFromQueue,
    uploadQueue,
    clearAll,
    removeResult,
    stats: {
      queued: queue.length,
      accepted: accepted.length,
      rejected: rejected.length,
      total: accepted.length + rejected.length,
    },
  };
}
