import React from 'react';

function MessageBubble({ message }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  /**
   * Simple inline renderer: converts **bold** and line breaks.
   */
  const renderText = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className={`message-bubble ${message.type}`}>
      <div className="message-text">{renderText(message.text)}</div>
      <div className="message-time">{formatTime(message.timestamp)}</div>
    </div>
  );
}

export default MessageBubble;
