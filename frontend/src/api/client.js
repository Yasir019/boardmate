/**
 * BoardMate API Client
 * Handles all communication with the FastAPI backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'admin123';

/**
 * API client for BoardMate backend
 */
export const api = {
  /**
   * Check backend health status
   */
  async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.json();
  },

  /**
   * Ask a question about textbook content
   * @param {string} board - Board name (e.g., 'Federal', 'Punjab')
   * @param {string} classLevel - Class level (e.g., '9', '10')
   * @param {string} subject - Subject name (e.g., 'Physics')
   * @param {string} question - User's question
   */
  async askQuestion(board, classLevel, subject, question) {
    const response = await fetch(`${API_BASE_URL}/chat/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        board,
        class_level: classLevel,
        subject,
        question,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Request failed');
    }

    return response.json();
  },

  /**
   * Upload a textbook file (Admin only)
   * @param {string} board - Board name
   * @param {string} classLevel - Class level
   * @param {string} subject - Subject name
   * @param {string} chapter - Chapter identifier
   * @param {File} file - Text file to upload
   */
  async uploadTextbook(board, classLevel, subject, chapter, file) {
    const formData = new FormData();
    formData.append('board', board);
    formData.append('class_level', classLevel);
    formData.append('subject', subject);
    formData.append('chapter', chapter);
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/admin/upload`, {
      method: 'POST',
      headers: {
        'X-ADMIN-TOKEN': ADMIN_TOKEN,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Upload failed');
    }

    return response.json();
  },

  /**
   * Re-index all textbooks (Admin only)
   * Processes all files in the data directory
   */
  async reindex() {
    const response = await fetch(`${API_BASE_URL}/admin/reindex`, {
      method: 'POST',
      headers: {
        'X-ADMIN-TOKEN': ADMIN_TOKEN,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Reindex failed');
    }

    return response.json();
  },
};
