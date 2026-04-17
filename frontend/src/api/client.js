/**
 * BoardMate API Client
 * Handles all communication with the FastAPI backend
 */

import { clearSession } from '../utils/auth';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;
const TOKEN_KEY = 'boardmate_access_token';
const AUTH_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

function buildApiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function getAuthHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getStoredToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function getErrorMessage(response, fallbackMessage) {
  try {
    const error = await response.json();
    return error.detail || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function getErrorDetail(response) {
  try {
    const error = await response.json();
    return error?.detail || '';
  } catch {
    return '';
  }
}

function toNetworkError(error, actionLabel) {
  if (error instanceof TypeError) {
    const backendHint = API_BASE_URL || 'the configured backend';
    return new Error(
      `Unable to ${actionLabel}. Cannot reach backend at ${backendHint}. Start backend and verify CORS/API URL settings.`,
    );
  }
  return error;
}

function assertAuthOrThrow(response) {
  if (response.status === 401) {
    handleAuthExpired();
    throw new Error(AUTH_EXPIRED_MESSAGE);
  }
}

function handleAuthExpired() {
  clearSession();
  if (typeof window !== 'undefined') {
    window.location.assign('/signin');
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
    const response = await fetch(buildApiUrl('/health'));
    return response.json();
  },

  /**
   * Create a new user account
   * @param {string} fullName - User full name
   * @param {string} email - User email
   * @param {string} password - User password
   */
  async signUp(fullName, email, password) {
    const response = await fetch(buildApiUrl('/auth/signup'), {
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
    let response;
    try {
      response = await fetch(buildApiUrl('/auth/signin'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });
    } catch (error) {
      throw toNetworkError(error, 'sign in');
    }

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
    const response = await fetch(buildApiUrl('/auth/me'), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 401) {
      handleAuthExpired();
      throw new Error(AUTH_EXPIRED_MESSAGE);
    }

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
  async askQuestion(board, classLevel, subject, question, chapter = null, language = 'en', chatId = null) {
    const response = await fetch(buildApiUrl('/chat/ask'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        board,
        class_level: classLevel,
        subject,
        question,
        chapter,
        chat_id: chatId,
        language,
      }),
    });

    if (response.status === 401) {
      const detail = (await getErrorDetail(response)).toLowerCase();
      if (detail.includes('expired token') || detail.includes('invalid or expired token')) {
        handleAuthExpired();
        throw new Error(AUTH_EXPIRED_MESSAGE);
      }
    }

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
    const query = new URLSearchParams({
      board,
      class_level: classLevel,
      subject,
    });
    const response = await fetch(buildApiUrl(`/api/chapters/list?${query.toString()}`));

    assertAuthOrThrow(response);

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch chapters'));
    }

    return response.json();
  },

  async listChatSessions() {
    const response = await fetch(buildApiUrl('/chat/sessions'), {
      headers: {
        ...getAuthHeaders(),
      },
    });

    assertAuthOrThrow(response);

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch chat sessions'));
    }

    return response.json();
  },

  async createChatSession(board, classLevel, subject, chapter = null, title = null) {
    const response = await fetch(buildApiUrl('/chat/sessions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        board,
        class_level: classLevel,
        subject,
        chapter,
        title,
      }),
    });

    assertAuthOrThrow(response);

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to create chat session'));
    }

    return response.json();
  },

  async getChatSession(chatId) {
    const response = await fetch(buildApiUrl(`/chat/sessions/${encodeURIComponent(chatId)}`), {
      headers: {
        ...getAuthHeaders(),
      },
    });

    assertAuthOrThrow(response);

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch chat session'));
    }

    return response.json();
  },

  async deleteChatSession(chatId) {
    const response = await fetch(buildApiUrl(`/chat/sessions/${encodeURIComponent(chatId)}`), {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(),
      },
    });

    assertAuthOrThrow(response);

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to delete chat session'));
    }
  },

  async renameChatSession(chatId, title) {
    const response = await fetch(buildApiUrl(`/chat/sessions/${encodeURIComponent(chatId)}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ title }),
    });

    assertAuthOrThrow(response);

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to rename chat session'));
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
      buildApiUrl(`/api/chapters/content/${encodeURIComponent(board)}/${encodeURIComponent(classLevel)}/${encodeURIComponent(subject)}/${encodeURIComponent(chapter)}`)
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
    return buildApiUrl(
      `/api/chapters/pdf/${encodeURIComponent(board)}/${encodeURIComponent(classLevel)}/${encodeURIComponent(subject)}/${encodeURIComponent(chapter)}.pdf`
    );
  },

  resolveUrl(path) {
    return buildApiUrl(path);
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
    if (!ADMIN_TOKEN) {
      throw new Error('VITE_ADMIN_TOKEN is not configured');
    }

    const formData = new FormData();
    formData.append('board', board);
    formData.append('class_level', classLevel);
    formData.append('subject', subject);
    formData.append('chapter', chapter);
    formData.append('file', file);

    const response = await fetch(buildApiUrl('/admin/upload'), {
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
    if (!ADMIN_TOKEN) {
      throw new Error('VITE_ADMIN_TOKEN is not configured');
    }

    const response = await fetch(buildApiUrl('/admin/reindex'), {
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
