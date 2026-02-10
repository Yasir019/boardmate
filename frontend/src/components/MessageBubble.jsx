import React from 'react';

function MessageBubble({ message }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`message-bubble ${message.type}`}>
      <div className="message-text">{message.text}</div>
      <div className="message-time">{formatTime(message.timestamp)}</div>
    </div>
  );
}

export default MessageBubble;
