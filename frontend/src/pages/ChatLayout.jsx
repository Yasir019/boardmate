import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import ChapterList from '../components/ChapterList';
import ChatPanel from '../components/ChatPanel';
import { getBoardById, getClassById, getSubjectById, mockMessages } from '../data/mockData';

function ChatLayout() {
  const { board, classLevel, subject } = useParams();
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [messages, setMessages] = useState(mockMessages);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Get data from mock
  const boardData = getBoardById(board);
  const classData = getClassById(classLevel);
  const subjectData = getSubjectById(subject);

  const handleSelectChapter = (chapter) => {
    setSelectedChapter(chapter);
    // Reset messages when chapter changes
    setMessages([
      {
        id: Date.now(),
        type: 'bot',
        text: `Welcome to ${chapter.name}! I'm here to help you understand this chapter. Feel free to ask any questions.`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleSendMessage = (text) => {
    // Add user message
    const userMessage = {
      id: Date.now(),
      type: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Simulate bot response after a short delay
    setTimeout(() => {
      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: `Thank you for your question about "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}".\n\nThis is a mock response. In the full implementation, this would connect to the RAG backend to provide accurate answers based on your ${subjectData?.name || 'subject'} textbook content for ${classData?.name || 'your class'} (${boardData?.name || 'your board'}).`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMessage]);
    }, 800);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="chat-layout">
      <ChapterList
        selectedChapter={selectedChapter}
        onSelectChapter={handleSelectChapter}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <ChatPanel
        board={boardData}
        classLevel={classData}
        subject={subjectData}
        selectedChapter={selectedChapter}
        messages={messages}
        onSendMessage={handleSendMessage}
        onToggleChapters={toggleSidebar}
      />
    </div>
  );
}

export default ChatLayout;
