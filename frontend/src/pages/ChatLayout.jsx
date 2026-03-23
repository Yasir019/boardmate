import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ChapterList from '../components/ChapterList';
import ChatPanel from '../components/ChatPanel';
import PdfViewer from '../components/PdfViewer';
import { api } from '../api/client';

function ChatLayout() {
  const { board, classLevel, subject } = useParams();
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(true);

  // Create data objects from URL params
  const boardData = { id: board, name: board };
  const classData = { id: classLevel, name: classLevel };
  const subjectData = { id: subject, name: subject };

  // Fetch chapters from API
  useEffect(() => {
    const fetchChapters = async () => {
      setIsLoadingChapters(true);
      try {
        const response = await api.getChapters(board, classLevel, subject);
        
        // Transform API response to component format
        const formattedChapters = response.chapters.map(ch => ({
          id: ch.chapter,
          name: ch.chapter_title,
          chapter: ch.chapter,
          chapterNumber: ch.chapter_number,
          pdfPath: ch.pdf_path
        }));
        
        setChapters(formattedChapters);
        
        // Auto-select first chapter if available
        if (formattedChapters.length > 0) {
          setSelectedChapter(formattedChapters[0]);
        }
      } catch (error) {
        console.error('Error fetching chapters:', error);
        setChapters([]);
      } finally {
        setIsLoadingChapters(false);
      }
    };

    fetchChapters();
  }, [board, classLevel, subject]);

  // Initialize with welcome message
  useEffect(() => {
    const welcomeText = chapters.length > 0
      ? `Welcome! I'm BoardMate, your AI study assistant for ${subject} (${board} - ${classLevel}). Ask me any question about your textbook. You can also select a chapter from the left to focus on specific content.`
      : isLoadingChapters
        ? `Loading ${subject} content...`
        : `No content found for ${subject} (${board} - ${classLevel}). Please add chapters to the Books folder and re-index.`;
    
    setMessages([
      {
        id: Date.now(),
        type: 'bot',
        text: welcomeText,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [board, classLevel, subject, chapters, isLoadingChapters]);

  const handleSelectChapter = (chapter) => {
    setSelectedChapter(chapter);

    // Clear previous chat and start fresh for the new chapter
    setMessages([
      {
        id: Date.now(),
        type: 'bot',
        text: `Now viewing: **${chapter.name}**\n\nThe PDF is displayed on the right. Ask me anything about this chapter.`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleSendMessage = async (text) => {
    if (!text.trim()) return;
    
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
      // Call the RAG API with optional chapter filter
      const chapterFilter = selectedChapter ? selectedChapter.chapter : null;
      
      const response = await api.askQuestion(
        board,
        classLevel,
        subject,
        text,
        chapterFilter
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
        text: `Sorry, I encountered an error: ${error.message}. Please make sure the backend is running and content is indexed.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Get PDF URL for selected chapter
  const pdfUrl = selectedChapter?.pdfPath 
    ? `http://localhost:8000${selectedChapter.pdfPath}`
    : null;

  return (
    <div className="chat-layout three-panel">
      <ChapterList
        chapters={chapters}
        selectedChapter={selectedChapter}
        onSelectChapter={handleSelectChapter}
        isLoading={isLoadingChapters}
      />
      <ChatPanel
        board={boardData}
        classLevel={classData}
        subject={subjectData}
        selectedChapter={selectedChapter}
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        chatEnabled={true}
      />
      <PdfViewer
        pdfUrl={pdfUrl}
        chapterTitle={selectedChapter?.name}
      />
    </div>
  );
}

export default ChatLayout;
