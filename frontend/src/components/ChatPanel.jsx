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
  onToggleChapters 
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
        {!selectedChapter ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            padding: '2rem'
          }}>
            <div>
              <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📖</p>
              <p>Select a chapter from the sidebar to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput 
        onSendMessage={onSendMessage} 
        disabled={!selectedChapter}
      />
    </main>
  );
}

export default ChatPanel;
