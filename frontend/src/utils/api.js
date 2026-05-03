// src/utils/api.js
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000, // 60s for large uploads
});

/**
 * Upload images to the backend
 * @param {File[]} files - Array of File objects
 * @param {string} sessionId - Session ID for grouping
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Object>} Upload results
 */
export async function uploadImages(files, sessionId, onProgress) {
  const formData = new FormData();
  
  files.forEach((file) => {
    formData.append('images', file);
  });
  
  formData.append('sessionId', sessionId);

  const response = await api.post('/api/images/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      onProgress?.(percent);
    },
  });

  return response.data;
}

/**
 * Fetch images with optional filters
 */
export async function fetchImages({ status, sessionId, page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (sessionId) params.append('sessionId', sessionId);
  params.append('page', page);
  params.append('limit', limit);

  const response = await api.get(`/api/images?${params}`);
  return response.data;
}

/**
 * Fetch a single image
 */
export async function fetchImage(id) {
  const response = await api.get(`/api/images/${id}`);
  return response.data;
}

/**
 * Delete an image
 */
export async function deleteImage(id) {
  const response = await api.delete(`/api/images/${id}`);
  return response.data;
}

/**
 * Fetch aggregate stats
 */
export async function fetchStats() {
  const response = await api.get('/api/images/stats');
  return response.data;
}

/**
 * Check API health
 */
export async function checkHealth() {
  const response = await api.get('/health');
  return response.data;
}

export default api;
