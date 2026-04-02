import React from 'react';

function MessageBubble({ message, showSpeakButton = false, onSpeak, language = 'en' }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderText = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className={`message-bubble ${message.type}`}>
      <div className="message-text">{renderText(message.text)}</div>
      <div className="message-meta">
        <div className="message-time">{formatTime(message.timestamp)}</div>
        {showSpeakButton && (
          <button
            type="button"
            className="message-speak-button"
            onClick={() => onSpeak?.(message.text)}
            title={language === 'ur' ? 'جواب سنیں' : 'Listen to response'}
          >
            {language === 'ur' ? 'سنیں' : 'Listen'}
          </button>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
