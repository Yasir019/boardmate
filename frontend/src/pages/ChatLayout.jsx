import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ChapterList from '../components/ChapterList';
import ChatPanel from '../components/ChatPanel';
import PdfViewer from '../components/PdfViewer';
import { api } from '../api/client';
import { clearSession, getUser, isAuthenticated } from '../utils/auth';
import {
  browserSupportsSpeechRecognition,
  browserSupportsSpeechSynthesis,
  createSpeechRecognition,
  speakText,
  stopSpeaking,
} from '../utils/speech';

const CHAT_STORAGE_PREFIX = 'boardmate-chat-v1';
const DEFAULT_CHAPTER_KEY = '__subject__';
const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

const UI_TEXT = {
  en: {
    listening: 'Listening now...',
    voiceReady: 'Microphone ready',
    micUnsupported: 'Voice input works best in Chrome or Edge on localhost/HTTPS.',
    micPermissionBlocked: 'Microphone permission is blocked. Please allow mic access in your browser.',
    micStartFailed: 'Could not start voice input. Try Chrome or Edge and refresh the page.',
    micGenericError: 'Voice input failed. Try again after allowing microphone access.',
    micNoSpeech: 'No speech was detected. Please speak a little closer to the microphone.',
    micNetwork: 'Voice recognition service is unavailable right now. Urdu voice depends on your browser speech service.',
    inputPlaceholder: 'Ask a short question or tap the microphone...',
    chapterChanged: (chapter) => `Focused on ${chapter}. Ask about this chapter.`,
    welcome: 'Ask anything from this chapter.',
    noContent: 'No chapter content found for this subject yet.',
    loading: (subject) => `Loading ${subject}...`,
    speakUnsupported: 'Voice playback is not supported in this browser.',
  },
  ur: {
    listening: 'Listening now...',
    voiceReady: 'Microphone ready',
    micUnsupported: 'Voice input works best in Chrome or Edge on localhost/HTTPS.',
    micPermissionBlocked: 'Microphone permission is blocked. Please allow mic access in your browser.',
    micStartFailed: 'Could not start voice input. Try Chrome or Edge and refresh the page.',
    micGenericError: 'Voice input failed. Try again after allowing microphone access.',
    micNoSpeech: 'No speech was detected. Please speak a little closer to the microphone.',
    micNetwork: 'Voice recognition service is unavailable right now. Urdu voice depends on your browser speech service.',
    inputPlaceholder: 'Ask a short question or tap the microphone...',
    chapterChanged: (chapter) => `Focused on ${chapter}. Ask about this chapter.`,
    welcome: 'Ask anything from this chapter.',
    noContent: 'No chapter content found for this subject yet.',
    loading: (subject) => `Loading ${subject}...`,
    speakUnsupported: 'Voice playback is not supported in this browser.',
  },
};

function ChatLayout() {
  const navigate = useNavigate();
  const { board, classLevel, subject } = useParams();
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [messagesByChapter, setMessagesByChapter] = useState({});
  const [messagesBySession, setMessagesBySession] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(true);
  const [language, setLanguage] = useState('en');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [activeSpeechMessageId, setActiveSpeechMessageId] = useState(null);
  const [llmMode, setLlmMode] = useState('cloud');
  const [chatRuntime, setChatRuntime] = useState(null);
  const [showChapterPanel, setShowChapterPanel] = useState(true);
  const [showPdfPanel, setShowPdfPanel] = useState(true);
  const [chatSessionsByChapter, setChatSessionsByChapter] = useState({});
  const [activeChatByChapter, setActiveChatByChapter] = useState({});
  const [renameDialog, setRenameDialog] = useState({
    open: false,
    chatId: null,
    title: '',
    error: '',
    isSaving: false,
  });
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    chatId: null,
    title: '',
    error: '',
    isDeleting: false,
  });
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const recognitionRef = useRef(null);
  const voiceStartTimeoutRef = useRef(null);
  const latestSessionLoadIdRef = useRef(0);
  const isSendingRef = useRef(false);
  const lastSendRef = useRef({ chapterKey: '', text: '', at: 0 });
  const workspaceMenuRef = useRef(null);

  const boardData = { id: board, name: board };
  const classData = { id: classLevel, name: classLevel };
  const subjectData = { id: subject, name: subject };
  const user = getUser();
  const speechRecognitionSupported = browserSupportsSpeechRecognition();
  const speechSynthesisSupported = browserSupportsSpeechSynthesis();
  const text = UI_TEXT[language] || UI_TEXT.en;
  const storageKey = [CHAT_STORAGE_PREFIX, board, classLevel, subject].join(':');
  const getChapterScopeKey = (chapterId) => [board, classLevel, subject, chapterId || DEFAULT_CHAPTER_KEY].join('::');
  const currentChapterKey = getChapterScopeKey(selectedChapter?.chapter);
  const activeChatId = activeChatByChapter[currentChapterKey] || null;
  const messages = activeChatId
    ? (messagesBySession[activeChatId] || [])
    : (messagesByChapter[currentChapterKey] || []);
  const currentChapterSessions = chatSessionsByChapter[currentChapterKey] || [];

  const saveMessagesByChapter = (nextState) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextState));
    } catch (error) {
      console.warn('Could not persist chat history:', error);
    }
  };

  const setChapterMessages = (chapterKey, updater) => {
    setMessagesByChapter((prev) => {
      const previousMessages = prev[chapterKey] || [];
      const nextMessages = typeof updater === 'function'
        ? updater(previousMessages)
        : updater;

      const nextState = {
        ...prev,
        [chapterKey]: nextMessages,
      };
      saveMessagesByChapter(nextState);
      return nextState;
    });
  };

  const setSessionMessages = (chatId, updater) => {
    setMessagesBySession((prev) => {
      const previousMessages = prev[chatId] || [];
      const nextMessages = typeof updater === 'function'
        ? updater(previousMessages)
        : updater;

      return {
        ...prev,
        [chatId]: nextMessages,
      };
    });
  };

  const setChapterSessions = (chapterKey, sessions) => {
    setChatSessionsByChapter((prev) => ({
      ...prev,
      [chapterKey]: sessions,
    }));
  };

  const setActiveChatForChapter = (chapterKey, chatId) => {
    setActiveChatByChapter((prev) => ({
      ...prev,
      [chapterKey]: chatId,
    }));
  };

  const toUiMessage = (message) => ({
    id: `${message.id}-${message.role}`,
    type: message.role === 'assistant' ? 'bot' : 'user',
    text: message.content,
    sources: message.sources || [],
    timestamp: message.created_at,
    language,
  });

  const ensureIntroMessage = (chapterKey) => {
    setChapterMessages(chapterKey, (existing) => {
      if (existing.length > 0) {
        return existing;
      }

      let introText = text.noContent;
      if (chapters.length > 0) {
        introText = text.welcome;
      } else if (isLoadingChapters) {
        introText = text.loading(subject);
      }

      return [{
        id: Date.now(),
        type: 'bot',
        text: introText,
        timestamp: new Date().toISOString(),
        language,
      }];
    });
  };

  const loadChatSession = async (chatId, chapterKey) => {
    const requestId = latestSessionLoadIdRef.current + 1;
    latestSessionLoadIdRef.current = requestId;

    const detail = await api.getChatSession(chatId);
    if (latestSessionLoadIdRef.current !== requestId) {
      return;
    }

    const mappedMessages = (detail.messages || []).map(toUiMessage);
    setSessionMessages(chatId, mappedMessages.length ? mappedMessages : [{
      id: Date.now(),
      type: 'bot',
      text: text.welcome,
      timestamp: new Date().toISOString(),
      language,
    }]);
    setActiveChatForChapter(chapterKey, chatId);
  };

  const refreshChapterSessions = async (chapterKey, chapterId, preferredChatId = null) => {
    if (!isAuthenticated()) {
      ensureIntroMessage(chapterKey);
      return;
    }

    setIsLoadingSessions(true);
    try {
      const sessions = await api.listChatSessions();
      const filteredSessions = sessions.filter((session) => (
        session.board === board
        && session.class_level === classLevel
        && session.subject === subject
        && (session.chapter || null) === (chapterId || null)
      ));

      setChapterSessions(chapterKey, filteredSessions);

      const hasPreferred = preferredChatId && filteredSessions.some((session) => session.id === preferredChatId);
      const nextActiveId = hasPreferred ? preferredChatId : null;

      if (nextActiveId) {
        await loadChatSession(nextActiveId, chapterKey);
      } else {
        setActiveChatForChapter(chapterKey, null);
        setChapterMessages(chapterKey, []);
        setMessagesBySession((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => {
            if (!filteredSessions.some((session) => String(session.id) === key)) {
              delete next[key];
            }
          });
          return next;
        });
        ensureIntroMessage(chapterKey);
      }
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const clearVoiceStartTimeout = () => {
    if (voiceStartTimeoutRef.current) {
      window.clearTimeout(voiceStartTimeoutRef.current);
      voiceStartTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!isWorkspaceMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!workspaceMenuRef.current?.contains(event.target)) {
        setIsWorkspaceMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isWorkspaceMenuOpen]);

  useEffect(() => {
    latestSessionLoadIdRef.current += 1;
    setMessagesBySession({});
    setChatSessionsByChapter({});
    setActiveChatByChapter({});
    setRenameDialog({
      open: false,
      chatId: null,
      title: '',
      error: '',
      isSaving: false,
    });
    setDeleteDialog({
      open: false,
      chatId: null,
      title: '',
      error: '',
      isDeleting: false,
    });
  }, [board, classLevel, subject]);

  useEffect(() => {
    api.getChatRuntime()
      .then((runtime) => {
        setChatRuntime(runtime);
        if (runtime?.default_mode === 'local') {
          setLlmMode('local');
          return;
        }
        if (runtime?.default_mode === 'cloud' || runtime?.default_mode === 'auto') {
          setLlmMode('cloud');
        }
      })
      .catch((error) => {
        console.error('Error fetching chat runtime:', error);
      });
  }, []);

  useEffect(() => {
    if (isAuthenticated()) {
      // Signed-in users should land on a fresh chat screen, not cached local chapter messages.
      setMessagesByChapter({});
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setMessagesByChapter({});
        return;
      }

      const parsed = JSON.parse(raw);
      setMessagesByChapter(parsed && typeof parsed === 'object' ? parsed : {});
    } catch (error) {
      console.warn('Could not restore chat history:', error);
      setMessagesByChapter({});
    }
  }, [storageKey]);

  useEffect(() => {
    stopSpeaking();
    setActiveSpeechMessageId(null);
    clearVoiceStartTimeout();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setVoiceError('');
  }, [language]);

  useEffect(() => () => {
    stopSpeaking();
    clearVoiceStartTimeout();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    const fetchChapters = async () => {
      setIsLoadingChapters(true);
      try {
        const response = await api.getChapters(board, classLevel, subject);
        const formattedChapters = response.chapters.map((chapter) => ({
          id: chapter.chapter,
          name: chapter.chapter_title,
          chapter: chapter.chapter,
          chapterNumber: chapter.chapter_number,
          pdfPath: chapter.pdf_path,
        }));

        setChapters(formattedChapters);
        setSelectedChapter((prevSelected) => {
          if (!formattedChapters.length) {
            return null;
          }

          if (!prevSelected) {
            return formattedChapters[0];
          }

          const matchingChapter = formattedChapters.find((chapter) => chapter.id === prevSelected.id);
          return matchingChapter || formattedChapters[0];
        });
      } catch (error) {
        console.error('Error fetching chapters:', error);
        setChapters([]);
        setSelectedChapter(null);
      } finally {
        setIsLoadingChapters(false);
      }
    };

    fetchChapters();
  }, [board, classLevel, subject]);

  useEffect(() => {
    if (!selectedChapter) {
      return;
    }

    const chapterKey = getChapterScopeKey(selectedChapter.chapter);
    refreshChapterSessions(chapterKey, selectedChapter.chapter).catch((error) => {
      console.error('Error fetching chat sessions:', error);
      if (error?.message !== SESSION_EXPIRED_MESSAGE) {
        ensureIntroMessage(chapterKey);
      }
    });
  }, [board, classLevel, subject, selectedChapter?.chapter]);

  useEffect(() => {
    if (activeChatId || !selectedChapter) {
      return;
    }
    ensureIntroMessage(currentChapterKey);
  }, [activeChatId, currentChapterKey, selectedChapter]);

  const handleSelectChapter = (chapter) => {
    setSelectedChapter(chapter);
    clearVoiceStartTimeout();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopSpeaking();
    setActiveSpeechMessageId(null);
    setVoiceError('');
  };

  const handleSelectChat = async (chatId) => {
    if (!chatId) {
      return;
    }

    if (chatId === activeChatId) {
      return;
    }

    stopSpeaking();
    setActiveSpeechMessageId(null);
    setVoiceError('');

    try {
      await loadChatSession(chatId, currentChapterKey);
    } catch (error) {
      console.error('Error loading chat session:', error);
    }
  };

  const handleNewChat = async () => {
    stopSpeaking();
    setActiveSpeechMessageId(null);
    setVoiceError('');

    if (!selectedChapter) {
      return;
    }

    if (!isAuthenticated()) {
      setActiveChatForChapter(currentChapterKey, null);
      setChapterMessages(currentChapterKey, [{
        id: Date.now(),
        type: 'bot',
        text: text.chapterChanged(selectedChapter.name),
        timestamp: new Date().toISOString(),
        language,
      }]);
      return;
    }

    try {
      const created = await api.createChatSession(
        board,
        classLevel,
        subject,
        selectedChapter.chapter,
        `${selectedChapter.name} chat`
      );

      setActiveChatForChapter(currentChapterKey, created.id);
      setSessionMessages(created.id, [{
        id: Date.now(),
        type: 'bot',
        text: text.chapterChanged(selectedChapter.name),
        timestamp: new Date().toISOString(),
        language,
      }]);

      await refreshChapterSessions(currentChapterKey, selectedChapter.chapter, created.id);
    } catch (error) {
      console.error('Error creating chat session:', error);
    }
  };

  const handleRenameChat = async (chatId, currentTitle) => {
    setRenameDialog({
      open: true,
      chatId,
      title: currentTitle || '',
      error: '',
      isSaving: false,
    });
  };

  const handleDeleteChat = async (chatId) => {
    const chat = currentChapterSessions.find((session) => session.id === chatId);
    setDeleteDialog({
      open: true,
      chatId,
      title: chat?.title || 'this chat',
      error: '',
      isDeleting: false,
    });
  };

  const closeRenameDialog = () => {
    setRenameDialog({
      open: false,
      chatId: null,
      title: '',
      error: '',
      isSaving: false,
    });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({
      open: false,
      chatId: null,
      title: '',
      error: '',
      isDeleting: false,
    });
  };

  const confirmRenameChat = async () => {
    const chatId = renameDialog.chatId;
    const nextTitle = renameDialog.title.trim();

    if (!chatId) {
      return;
    }

    if (!nextTitle) {
      setRenameDialog((prev) => ({ ...prev, error: 'Title cannot be empty.' }));
      return;
    }

    setRenameDialog((prev) => ({ ...prev, isSaving: true, error: '' }));
    try {
      await api.renameChatSession(chatId, nextTitle);
      if (selectedChapter) {
        await refreshChapterSessions(currentChapterKey, selectedChapter.chapter, activeChatId || chatId);
      }
      closeRenameDialog();
    } catch (error) {
      console.error('Error renaming chat session:', error);
      setRenameDialog((prev) => ({ ...prev, error: error.message || 'Failed to rename chat.', isSaving: false }));
    }
  };

  const confirmDeleteChat = async () => {
    const chatId = deleteDialog.chatId;
    if (!chatId) {
      return;
    }

    setDeleteDialog((prev) => ({ ...prev, isDeleting: true, error: '' }));
    try {
      await api.deleteChatSession(chatId);

      setMessagesBySession((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });

      setChapterSessions(
        currentChapterKey,
        currentChapterSessions.filter((session) => session.id !== chatId)
      );

      if (activeChatId === chatId) {
        setActiveChatForChapter(currentChapterKey, null);
      }

      closeDeleteDialog();

      if (selectedChapter) {
        await refreshChapterSessions(currentChapterKey, selectedChapter.chapter);
      }
    } catch (error) {
      console.error('Error deleting chat session:', error);
      setDeleteDialog((prev) => ({ ...prev, error: error.message || 'Failed to delete chat.', isDeleting: false }));
    }
  };

  const handleSendMessage = async (messageText) => {
    const normalizedText = messageText.trim();
    if (!normalizedText) return;

    const requestChapterKey = currentChapterKey;
    const requestChapterId = selectedChapter?.chapter || null;
    const targetChatId = activeChatByChapter[requestChapterKey] || null;
    const now = Date.now();
    const isDuplicateBurst = (
      lastSendRef.current.chapterKey === requestChapterKey
      && lastSendRef.current.text === normalizedText
      && now - lastSendRef.current.at < 900
    );

    if (isSendingRef.current || isDuplicateBurst) {
      return;
    }

    isSendingRef.current = true;
    lastSendRef.current = { chapterKey: requestChapterKey, text: normalizedText, at: now };

    const optimisticUserMessage = {
      id: now,
      type: 'user',
      text: normalizedText,
      timestamp: new Date().toISOString(),
      language,
    };

    const appendMessage = (message) => {
      if (targetChatId) {
        setSessionMessages(targetChatId, (prev) => [...prev, message]);
      } else {
        setChapterMessages(requestChapterKey, (prev) => [...prev, message]);
      }
    };

    setVoiceError('');
    stopSpeaking();
    setActiveSpeechMessageId(null);
    appendMessage(optimisticUserMessage);
    setIsLoading(true);

    try {
      const response = await api.askQuestion(
        board,
        classLevel,
        subject,
        normalizedText,
        requestChapterId,
        language,
        targetChatId,
        true,
        llmMode
      );

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: response.answer,
        sources: response.sources,
        timestamp: new Date().toISOString(),
        language,
      };
      if (response.chat_id) {
        setActiveChatForChapter(requestChapterKey, response.chat_id);
      }

      if (response.chat_id && response.chat_id !== targetChatId) {
        setSessionMessages(response.chat_id, (prev) => {
          const hasAny = prev.length > 0;
          if (hasAny) {
            const alreadyHasUser = prev.some(
              (msg) => msg.type === 'user' && msg.text === normalizedText
            );
            return alreadyHasUser ? [...prev, botMessage] : [...prev, optimisticUserMessage, botMessage];
          }

          return [optimisticUserMessage, botMessage];
        });
      } else {
        appendMessage(botMessage);
      }

      if (requestChapterId) {
        const preferredActiveChatId = response.chat_id || targetChatId;
        refreshChapterSessions(requestChapterKey, requestChapterId, preferredActiveChatId).catch((error) => {
          console.error('Error refreshing chat sessions:', error);
        });
      }
    } catch (error) {
      console.error('API Error:', error);
      if (error?.message === SESSION_EXPIRED_MESSAGE) {
        return;
      }
      appendMessage({
        id: Date.now() + 1,
        type: 'bot',
        text: `Sorry, something went wrong: ${error.message}`,
        timestamp: new Date().toISOString(),
        language,
      });
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  const handleStartVoiceInput = () => {
    if (!speechRecognitionSupported) {
      setVoiceError(text.micUnsupported);
      return;
    }

    setVoiceError('');
    stopSpeaking();
    setActiveSpeechMessageId(null);
    clearVoiceStartTimeout();

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    let recognition;
    try {
      recognition = createSpeechRecognition(language);
      if (!recognition) {
        setVoiceError(text.micUnsupported);
        return;
      }
    } catch (error) {
      console.error('Speech recognition setup error:', error);
      setVoiceError(text.micStartFailed);
      return;
    }

    recognitionRef.current = recognition;
    recognition.onstart = () => {
      clearVoiceStartTimeout();
      setIsListening(true);
    };
    recognition.onend = () => {
      clearVoiceStartTimeout();
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognition.onerror = (event) => {
      clearVoiceStartTimeout();
      const errorCode = event?.error;
      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        setVoiceError(text.micPermissionBlocked);
      } else if (errorCode === 'no-speech' || errorCode === 'aborted') {
        setVoiceError(text.micNoSpeech);
      } else if (errorCode === 'network') {
        setVoiceError(text.micNetwork);
      } else {
        setVoiceError(text.micGenericError);
      }
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        handleSendMessage(transcript);
      }
    };

    voiceStartTimeoutRef.current = window.setTimeout(() => {
      if (!isListening) {
        setVoiceError(text.micStartFailed);
      }
    }, 2500);

    try {
      recognition.start();
    } catch (error) {
      console.error('Speech recognition start error:', error);
      clearVoiceStartTimeout();
      setVoiceError(text.micStartFailed);
    }
  };

  const handleStopVoiceInput = () => {
    clearVoiceStartTimeout();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopSpeaking();
    setActiveSpeechMessageId(null);
  };

  const handleSpeakMessage = (message) => {
    if (!speechSynthesisSupported) {
      setVoiceError(text.speakUnsupported);
      return;
    }

    if (!message?.text) {
      return;
    }

    if (activeSpeechMessageId === message.id) {
      stopSpeaking();
      setActiveSpeechMessageId(null);
      return;
    }

    setVoiceError('');
    const didStart = speakText(message.text, language, {
      onEnd: () => {
        setActiveSpeechMessageId((currentId) => (currentId === message.id ? null : currentId));
      },
      onError: () => {
        setActiveSpeechMessageId((currentId) => (currentId === message.id ? null : currentId));
      },
    });

    if (didStart) {
      setActiveSpeechMessageId(message.id);
    }
  };

  const pdfUrl = selectedChapter?.pdfPath
    ? api.resolveUrl(selectedChapter.pdfPath)
    : null;

  const llmStatusText = (() => {
    if (!chatRuntime) {
      return llmMode === 'local'
        ? 'Offline mode selected. BoardMate will use your local LLM if available.'
        : 'Online mode selected. BoardMate will use the Groq model.';
    }

    if (llmMode === 'local') {
      if (chatRuntime.local_available) {
        return `Offline mode uses local model: ${chatRuntime.resolved_local_model}.`;
      }
      return 'Offline mode selected, but no local LLM was detected. Start Ollama, then try again.';
    }

    if (!chatRuntime.cloud_available) {
      return 'Online mode selected, but no cloud API key is configured. Switch to Offline or set the backend API key.';
    }

    return 'Online mode uses the Groq model.';
  })();

  const layoutClasses = [
    'chat-layout',
    'three-panel',
    showChapterPanel ? '' : 'hide-left-panel',
    showPdfPanel ? '' : 'hide-right-panel',
  ].filter(Boolean).join(' ');

  const handleToggleChapterPanel = () => {
    setShowChapterPanel((prev) => !prev);
  };

  const handleTogglePdfPanel = () => {
    setShowPdfPanel((prev) => !prev);
  };

  const handleLogout = () => {
    clearSession();
    navigate('/signin', { replace: true });
  };

  const userDisplayName = user?.full_name?.trim() || user?.email?.trim() || 'BoardMate User';
  const userEmail = user?.email?.trim().toLowerCase() || '';
  const hasCustomProfileImage = userEmail === 'muhammadyasirali.ai@gmail.com';
  const avatarLabel = userDisplayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'BM';

  return (
    <div className={layoutClasses}>
      <header className="workspace-topbar">
        <Link className="brand workspace-brand" to="/">
          <img className="brand-icon workspace-brand-logo" src="/images/book.png" alt="BoardMate" />
          <span className="brand-wordmark workspace-brand-name">
            <span className="brand-board">Board</span>
            <span className="brand-mate">Mate</span>
          </span>
        </Link>

        <div className="workspace-actions" ref={workspaceMenuRef}>
          <div className="workspace-avatar" aria-hidden="true">
            {hasCustomProfileImage ? (
              <img
                src="/images/Myprofile.jpg"
                alt=""
                className="workspace-avatar-image"
              />
            ) : (
              avatarLabel
            )}
          </div>

          <button
            type="button"
            className="workspace-settings-btn"
            onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isWorkspaceMenuOpen}
            aria-label="Open settings menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .99 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51.99H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51.99V15z" />
            </svg>
            <span>Settings</span>
          </button>

          {isWorkspaceMenuOpen && (
            <div className="workspace-settings-menu" role="menu" aria-label="Workspace settings">
              <button type="button" className="workspace-settings-item workspace-settings-item-upgrade" role="menuitem">
                Upgrade to BoardMate
              </button>
              <button type="button" className="workspace-settings-item" role="menuitem" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {showChapterPanel && (
        <ChapterList
          chapters={chapters}
            selectedChapter={selectedChapter}
            onSelectChapter={handleSelectChapter}
            isLoading={isLoadingChapters}
            chatSessions={currentChapterSessions}
            activeChatId={activeChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
            onCollapsePanel={handleToggleChapterPanel}
          />
        )}

        {!showChapterPanel && (
          <button
            type="button"
            className="panel-reopen-handle left"
            onClick={handleToggleChapterPanel}
            title="Show chapters panel"
            aria-label="Show chapters panel"
          >
            <svg
              className="panel-toggle-icon"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="16" height="16" rx="2.8" />
              <path d="M10 2v16" />
            </svg>
          </button>
        )}

        <ChatPanel
          board={boardData}
          classLevel={classData}
          subject={subjectData}
          selectedChapter={selectedChapter}
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          chatEnabled={true}
          language={language}
          onLanguageChange={setLanguage}
          onStartVoiceInput={handleStartVoiceInput}
          onStopVoiceInput={handleStopVoiceInput}
          isListening={isListening}
          speechRecognitionSupported={speechRecognitionSupported}
          speechSynthesisSupported={speechSynthesisSupported}
          onSpeakMessage={handleSpeakMessage}
          activeSpeechMessageId={activeSpeechMessageId}
          voiceError={voiceError}
          inputPlaceholder={text.inputPlaceholder}
          llmMode={llmMode}
          onLlmModeChange={setLlmMode}
          llmStatusText={llmStatusText}
        />

        {!showPdfPanel && (
          <button
            type="button"
            className="panel-reopen-handle right"
            onClick={handleTogglePdfPanel}
            title="Show book panel"
            aria-label="Show book panel"
          >
            <svg
              className="panel-toggle-icon"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="16" height="16" rx="2.8" />
              <path d="M10 2v16" />
            </svg>
          </button>
        )}

        {showPdfPanel && (
          <PdfViewer
            pdfUrl={pdfUrl}
            chapterTitle={selectedChapter?.name}
            board={board}
            classLevel={classLevel}
            subject={subject}
            chapterId={selectedChapter?.chapter}
            language={language}
            llmMode={llmMode}
            onCollapsePanel={handleTogglePdfPanel}
          />
        )}

        {renameDialog.open && (
          <div className="dialog-backdrop" onClick={closeRenameDialog}>
            <div className="dialog-card" role="dialog" aria-modal="true" aria-label="Rename chat" onClick={(event) => event.stopPropagation()}>
              <h3>Rename chat</h3>
              <input
                type="text"
                value={renameDialog.title}
                onChange={(event) => setRenameDialog((prev) => ({ ...prev, title: event.target.value, error: '' }))}
                className="dialog-input"
                maxLength={200}
                autoFocus
              />
              {renameDialog.error && <div className="dialog-error">{renameDialog.error}</div>}
              <div className="dialog-actions">
                <button type="button" className="dialog-btn" onClick={closeRenameDialog}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="dialog-btn primary"
                  onClick={confirmRenameChat}
                  disabled={renameDialog.isSaving}
                >
                  {renameDialog.isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteDialog.open && (
          <div className="dialog-backdrop" onClick={closeDeleteDialog}>
            <div className="dialog-card" role="dialog" aria-modal="true" aria-label="Delete chat" onClick={(event) => event.stopPropagation()}>
              <h3>Delete chat?</h3>
              <p className="dialog-message">This will permanently delete "{deleteDialog.title}".</p>
              {deleteDialog.error && <div className="dialog-error">{deleteDialog.error}</div>}
              <div className="dialog-actions">
                <button type="button" className="dialog-btn" onClick={closeDeleteDialog}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="dialog-btn danger"
                  onClick={confirmDeleteChat}
                  disabled={deleteDialog.isDeleting}
                >
                  {deleteDialog.isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default ChatLayout;
