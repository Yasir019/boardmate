/**
 * BoardMate API Client
 * Handles all communication with the FastAPI backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'admin123';

async function getErrorMessage(response, fallbackMessage) {
  try {
    const error = await response.json();
    return error.detail || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

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
   * Create a new user account
   * @param {string} fullName - User full name
   * @param {string} email - User email
   * @param {string} password - User password
   */
  async signUp(fullName, email, password) {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        full_name: fullName,
        email,
        password,
      }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Sign up failed'));
    }

    return response.json();
  },

  /**
   * Sign in an existing user
   * @param {string} email - User email
   * @param {string} password - User password
   */
  async signIn(email, password) {
    const response = await fetch(`${API_BASE_URL}/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Sign in failed'));
    }

    return response.json();
  },

  /**
   * Get profile for currently authenticated user
   * @param {string} accessToken - JWT bearer token
   */
  async getMe(accessToken) {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch profile'));
    }

    return response.json();
  },

  /**
   * Ask a question about textbook content
   * @param {string} board - Board name (e.g., 'Federal', 'Punjab')
   * @param {string} classLevel - Class level (e.g., '9', '10')
   * @param {string} subject - Subject name (e.g., 'Physics')
   * @param {string} question - User's question
   * @param {string} chapter - Optional chapter filter
   */
  async askQuestion(board, classLevel, subject, question, chapter = null) {
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
        chapter,
      }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Request failed'));
    }

    return response.json();
  },

  /**
   * Get list of chapters for a subject
   * @param {string} board - Board name
   * @param {string} classLevel - Class level
   * @param {string} subject - Subject name
   */
  async getChapters(board, classLevel, subject) {
    const response = await fetch(
      `${API_BASE_URL}/api/chapters/list?board=${encodeURIComponent(board)}&class_level=${encodeURIComponent(classLevel)}&subject=${encodeURIComponent(subject)}`
    );

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch chapters'));
    }

    return response.json();
  },

  /**
   * Get chapter HTML content
   * @param {string} board - Board name
   * @param {string} classLevel - Class level
   * @param {string} subject - Subject name
   * @param {string} chapter - Chapter identifier
   */
  async getChapterContent(board, classLevel, subject, chapter) {
    const response = await fetch(
      `${API_BASE_URL}/api/chapters/content/${encodeURIComponent(board)}/${encodeURIComponent(classLevel)}/${encodeURIComponent(subject)}/${encodeURIComponent(chapter)}`
    );

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch chapter content'));
    }

    return response.json();
  },

  /**
   * Get PDF URL for a chapter
   * @param {string} board - Board name
   * @param {string} classLevel - Class level
   * @param {string} subject - Subject name
   * @param {string} chapter - Chapter identifier
   */
  getPdfUrl(board, classLevel, subject, chapter) {
    return `${API_BASE_URL}/api/chapters/pdf/${encodeURIComponent(board)}/${encodeURIComponent(classLevel)}/${encodeURIComponent(subject)}/${encodeURIComponent(chapter)}.pdf`;
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
      throw new Error(await getErrorMessage(response, 'Upload failed'));
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
      throw new Error(await getErrorMessage(response, 'Reindex failed'));
    }

    return response.json();
  },
};
