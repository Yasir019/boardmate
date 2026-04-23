import React, { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

function ChatPanel({
  board,
  classLevel,
  subject,
  selectedChapter,
  messages,
  onSendMessage,
  isLoading = false,
  chatEnabled = false,
  language = 'en',
  onLanguageChange,
  onStartVoiceInput,
  onStopVoiceInput,
  isListening = false,
  speechRecognitionSupported = false,
  speechSynthesisSupported = false,
  onSpeakMessage,
  activeSpeechMessageId = null,
  voiceError = '',
  inputPlaceholder = 'Ask me anything or use the microphone...',
  llmMode = 'cloud',
  onLlmModeChange,
  llmStatusText = '',
}) {
  const messagesContainerRef = useRef(null);
  const modelMenuRef = useRef(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isModelMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!modelMenuRef.current?.contains(event.target)) {
        setIsModelMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsModelMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isModelMenuOpen]);

  const modelLabel = llmMode === 'local' ? 'Offline' : 'Online';

  return (
    <main className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-info">
          <h2>Chat</h2>
          {llmStatusText && <p className="chat-header-subtitle">{llmStatusText}</p>}
        </div>

        <div className="chat-header-controls">
          <div className="model-menu" ref={modelMenuRef}>
            <button
              type="button"
              className="model-menu-trigger"
              onClick={() => setIsModelMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={isModelMenuOpen}
              aria-label="Open model settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3v18" />
                <path d="M17 7H9a2 2 0 1 1 0-4h8" />
                <path d="M7 17h8a2 2 0 1 1 0 4H7" />
              </svg>
              <span>{modelLabel}</span>
            </button>

            {isModelMenuOpen && (
              <div className="model-menu-dropdown" role="menu" aria-label="Model selection">
                <button
                  type="button"
                  className={`model-menu-item ${llmMode === 'cloud' ? 'active' : ''}`}
                  onClick={() => {
                    onLlmModeChange?.('cloud');
                    setIsModelMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <span>Online</span>
                  <small>Groq model</small>
                </button>
                <button
                  type="button"
                  className={`model-menu-item ${llmMode === 'local' ? 'active' : ''}`}
                  onClick={() => {
                    onLlmModeChange?.('local');
                    setIsModelMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <span>Offline</span>
                  <small>Local LLM</small>
                </button>
              </div>
            )}
          </div>

          <div className="language-toggle" role="group" aria-label="Language selection">
            <button
              type="button"
              className={`language-chip ${language === 'en' ? 'active' : ''}`}
              onClick={() => onLanguageChange?.('en')}
            >
              English
            </button>
            <button
              type="button"
              className={`language-chip ${language === 'ur' ? 'active' : ''}`}
              onClick={() => onLanguageChange?.('ur')}
            >
              Urdu
            </button>
          </div>
        </div>
      </div>

      <div className="messages-container" ref={messagesContainerRef}>
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            showSpeakButton={message.type === 'bot' && speechSynthesisSupported}
            onSpeak={onSpeakMessage}
            isSpeaking={activeSpeechMessageId === message.id}
            language={language}
          />
        ))}
        {isLoading && (
          <div className="message-bubble bot">
            <div className="message-content">
              <span className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </div>
          </div>
        )}
      </div>

      {voiceError && <div className="voice-status voice-status-error">{voiceError}</div>}

      <ChatInput
        onSendMessage={onSendMessage}
        disabled={!chatEnabled || isLoading}
        placeholder={inputPlaceholder}
        language={language}
        onStartVoiceInput={onStartVoiceInput}
        onStopVoiceInput={onStopVoiceInput}
        isListening={isListening}
        voiceSupported={speechRecognitionSupported}
      />
    </main>
  );
}

export default ChatPanel;
