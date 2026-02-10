import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ChapterList from '../components/ChapterList';
import ChatPanel from '../components/ChatPanel';
import { api } from '../api/client';

// Available chapters - Only Sindh Board, Class 10, Chemistry for now
const availableChapters = {
  'Sindh': {
    '10th': {
      'Chemistry': [
        { id: 1, name: 'Chapter 1: Chemical Equilibrium' },
      ]
    }
  }
};

function ChatLayout() {
  const { board, classLevel, subject } = useParams();
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Create data objects from URL params
  const boardData = { id: board, name: board };
  const classData = { id: classLevel, name: classLevel };
  const subjectData = { id: subject, name: subject };

  // Get chapters for current selection (or empty if not available)
  const chapters = availableChapters[board]?.[classLevel]?.[subject] || [];
  const isAvailable = chapters.length > 0;

  // Initialize with welcome message
  useEffect(() => {
    const welcomeText = isAvailable
      ? `Welcome! I'm BoardMate, your AI study assistant for ${subject} (${board} - ${classLevel}). Ask me any question about your textbook!`
      : `🚧 Coming Soon! Content for ${subject} (${board} - ${classLevel}) is under development.`;
    
    setMessages([
      {
        id: Date.now(),
        type: 'bot',
        text: welcomeText,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [board, classLevel, subject, isAvailable]);

  const handleSelectChapter = (chapter) => {
    setSelectedChapter(chapter);
  };

  const handleSendMessage = async (text) => {
    // Add user message
    const userMessage = {
      id: Date.now(),
      type: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Call the real RAG backend API
      const response = await api.askQuestion(
        board,
        classLevel,
        subject,
        text
      );

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: response.answer,
        sources: response.sources,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('API Error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: `Sorry, I encountered an error: ${error.message}. Please make sure the backend server is running.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="chat-layout">
      <ChapterList
        chapters={chapters}
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
        isLoading={isLoading}
        chatEnabled={isAvailable}
      />
    </div>
  );
}

export default ChatLayout;
