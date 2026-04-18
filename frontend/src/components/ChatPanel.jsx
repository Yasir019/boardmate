import React, { useEffect, useRef } from 'react';
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
}) {
  const messagesContainerRef = useRef(null);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <main className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-info">
          <h2>Chat</h2>
        </div>

        <div className="chat-header-controls">
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
