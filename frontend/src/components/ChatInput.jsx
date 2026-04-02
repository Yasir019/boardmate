import React, { useState } from 'react';

function ChatInput({
  onSendMessage,
  disabled,
  placeholder = 'Ask a question about this chapter...',
  language = 'en',
  onStartVoiceInput,
  onStopVoiceInput,
  isListening = false,
  voiceSupported = false,
}) {
  const [message, setMessage] = useState('');
  const canSend = Boolean(message.trim()) && !disabled;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canSend) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <div className="chat-input-container">
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          placeholder={placeholder}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />

        {voiceSupported && (
          <button
            type="button"
            className={`chat-voice-button ${isListening ? 'listening' : ''}`}
            onClick={isListening ? onStopVoiceInput : onStartVoiceInput}
            disabled={disabled}
            title={
              isListening
                ? (language === 'ur' ? 'Stop voice input' : 'Stop voice input')
                : (language === 'ur' ? 'Start voice input' : 'Start voice input')
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 1 3 3v8a3 3 0 1 1-6 0V4a3 3 0 0 1 3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        )}

        <button
          type="submit"
          className={`chat-send-button ${canSend ? 'ready' : 'idle'}`}
          disabled={!canSend}
          title={language === 'ur' ? 'Send message' : 'Send message'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}

export default ChatInput;
