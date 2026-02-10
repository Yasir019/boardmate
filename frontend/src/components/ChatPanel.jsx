import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

function ChatPanel({ 
  board, 
  classLevel, 
  subject, 
  selectedChapter, 
  messages, 
  onSendMessage,
  onToggleChapters,
  isLoading = false,
  chatEnabled = false
}) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <main className="chat-panel">
      {/* Mobile Chapter Toggle */}
      <button className="mobile-chapter-toggle" onClick={onToggleChapters}>
        ☰ {selectedChapter ? selectedChapter.name : 'Select Chapter'}
      </button>

      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <h2>{subject?.name || 'Subject'}</h2>
          <p>
            {board?.name} • {classLevel?.name} 
            {selectedChapter && ` • ${selectedChapter.name}`}
          </p>
        </div>
        {selectedChapter && (
          <span className="chat-header-badge">
            {selectedChapter.name.split(':')[0]}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
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
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput 
        onSendMessage={onSendMessage} 
        disabled={!chatEnabled || isLoading}
        placeholder={chatEnabled ? "Ask me anything..." : "Content coming soon..."}
      />
    </main>
  );
}

export default ChatPanel;
