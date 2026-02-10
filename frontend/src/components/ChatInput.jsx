import React, { useState } from 'react';

function ChatInput({ onSendMessage, disabled, placeholder = "Ask a question about this chapter..." }) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="chat-input-container">
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          placeholder={placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />
        <button 
          type="submit" 
          className="chat-send-button"
          disabled={!message.trim() || disabled}
        >
          Send ➤
        </button>
      </form>
    </div>
  );
}

export default ChatInput;
