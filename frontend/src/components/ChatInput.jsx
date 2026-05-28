import React, { useEffect, useState } from 'react';

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
  const [voiceInputLanguage, setVoiceInputLanguage] = useState('en');
  const canSend = Boolean(message.trim()) && !disabled;

  useEffect(() => {
    if (language === 'en') {
      setVoiceInputLanguage('en');
    }
  }, [language]);

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
          <div className={`chat-voice-control ${isListening ? 'listening' : ''}`}>
            {language === 'ur' && (
              <div className="voice-language-switch" role="group" aria-label="Spoken language">
                {[
                  { code: 'en', label: 'EN' },
                  { code: 'ur', label: 'UR' },
                ].map((voiceLanguage) => (
                  <button
                    key={voiceLanguage.code}
                    type="button"
                    className={`voice-language-option ${voiceInputLanguage === voiceLanguage.code ? 'active' : ''}`}
                    onClick={() => setVoiceInputLanguage(voiceLanguage.code)}
                    disabled={disabled || isListening}
                    title={voiceLanguage.code === 'en' ? 'Speak in English' : 'Speak in Urdu'}
                  >
                    {voiceLanguage.label}
                  </button>
                ))}
              </div>
            )}

              <button
                type="button"
                className={`chat-voice-button ${isListening ? 'listening' : ''}`}
                onClick={isListening ? onStopVoiceInput : () => onStartVoiceInput?.(voiceInputLanguage)}
                disabled={disabled}
                title={isListening ? 'Stop voice input' : (voiceInputLanguage === 'ur' ? 'Speak in Urdu' : 'Speak in English')}
                aria-label={isListening ? 'Stop voice input' : (voiceInputLanguage === 'ur' ? 'Start Urdu voice input' : 'Start English voice input')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 1 3 3v8a3 3 0 1 1-6 0V4a3 3 0 0 1 3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
          </div>
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
