import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ChapterList from '../components/ChapterList';
import ChatPanel from '../components/ChatPanel';
import PdfViewer from '../components/PdfViewer';
import { api } from '../api/client';
import {
  browserSupportsSpeechRecognition,
  browserSupportsSpeechSynthesis,
  createSpeechRecognition,
  speakText,
  stopSpeaking,
} from '../utils/speech';

const UI_TEXT = {
  en: {
    listening: 'Listening now...',
    voiceReady: 'Microphone ready',
    micUnsupported: 'Voice input works best in Chrome or Edge on localhost/HTTPS.',
    micPermissionBlocked: 'Microphone permission is blocked. Please allow mic access in your browser.',
    micStartFailed: 'Could not start voice input. Try Chrome or Edge and refresh the page.',
    micGenericError: 'Voice input failed. Try again after allowing microphone access.',
    micNoSpeech: 'No speech was detected. Please speak a little closer to the microphone.',
    micNetwork: 'Voice recognition service is unavailable right now.',
    inputPlaceholder: 'Ask a short question or tap the microphone...',
    chapterChanged: (chapter) => `Focused on ${chapter}. Ask about this chapter.`,
    welcome: 'Ask anything from this chapter.',
    noContent: 'No chapter content found for this subject yet.',
    loading: (subject) => `Loading ${subject}...`,
    speakUnsupported: 'Voice playback is not supported in this browser.',
  },
  ur: {
    listening: 'Listening now...',
    voiceReady: 'Microphone ready',
    micUnsupported: 'Voice input works best in Chrome or Edge on localhost/HTTPS.',
    micPermissionBlocked: 'Microphone permission is blocked. Please allow mic access in your browser.',
    micStartFailed: 'Could not start voice input. Try Chrome or Edge and refresh the page.',
    micGenericError: 'Voice input failed. Try again after allowing microphone access.',
    micNoSpeech: 'No speech was detected. Please speak a little closer to the microphone.',
    micNetwork: 'Voice recognition service is unavailable right now.',
    inputPlaceholder: 'Ask a short question or tap the microphone...',
    chapterChanged: (chapter) => `Focused on ${chapter}. Ask about this chapter.`,
    welcome: 'Ask anything from this chapter.',
    noContent: 'No chapter content found for this subject yet.',
    loading: (subject) => `Loading ${subject}...`,
    speakUnsupported: 'Voice playback is not supported in this browser.',
  },
};

function ChatLayout() {
  const { board, classLevel, subject } = useParams();
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(true);
  const [language, setLanguage] = useState('en');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef(null);
  const voiceStartTimeoutRef = useRef(null);

  const boardData = { id: board, name: board };
  const classData = { id: classLevel, name: classLevel };
  const subjectData = { id: subject, name: subject };
  const speechRecognitionSupported = browserSupportsSpeechRecognition();
  const speechSynthesisSupported = browserSupportsSpeechSynthesis();
  const text = UI_TEXT[language] || UI_TEXT.en;

  const setIntroMessage = (messageText) => {
    setMessages([
      {
        id: Date.now(),
        type: 'bot',
        text: messageText,
        timestamp: new Date().toISOString(),
        language,
      },
    ]);
  };

  const clearVoiceStartTimeout = () => {
    if (voiceStartTimeoutRef.current) {
      window.clearTimeout(voiceStartTimeoutRef.current);
      voiceStartTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    stopSpeaking();
    clearVoiceStartTimeout();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setVoiceError('');
  }, [language]);

  useEffect(() => () => {
    stopSpeaking();
    clearVoiceStartTimeout();
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    const fetchChapters = async () => {
      setIsLoadingChapters(true);
      try {
        const response = await api.getChapters(board, classLevel, subject);
        const formattedChapters = response.chapters.map((chapter) => ({
          id: chapter.chapter,
          name: chapter.chapter_title,
          chapter: chapter.chapter,
          chapterNumber: chapter.chapter_number,
          pdfPath: chapter.pdf_path,
        }));

        setChapters(formattedChapters);
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

  useEffect(() => {
    if (chapters.length > 0) {
      setIntroMessage(text.welcome);
      return;
    }

    if (isLoadingChapters) {
      setIntroMessage(text.loading(subject));
      return;
    }

    setIntroMessage(text.noContent);
  }, [board, classLevel, subject, chapters, isLoadingChapters, language]);

  const handleSelectChapter = (chapter) => {
    setSelectedChapter(chapter);
    stopSpeaking();
    setIntroMessage(text.chapterChanged(chapter.name));
  };

  const handleSendMessage = async (messageText) => {
    if (!messageText.trim()) return;

    setVoiceError('');
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: 'user',
        text: messageText,
        timestamp: new Date().toISOString(),
        language,
      },
    ]);
    setIsLoading(true);

    try {
      const chapterFilter = selectedChapter ? selectedChapter.chapter : null;
      const response = await api.askQuestion(
        board,
        classLevel,
        subject,
        messageText,
        chapterFilter,
        language
      );

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: response.answer,
        sources: response.sources,
        timestamp: new Date().toISOString(),
        language,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('API Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          type: 'bot',
          text: `Sorry, something went wrong: ${error.message}`,
          timestamp: new Date().toISOString(),
          language,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartVoiceInput = () => {
    if (!speechRecognitionSupported) {
      setVoiceError(text.micUnsupported);
      return;
    }

    setVoiceError('');
    stopSpeaking();
    clearVoiceStartTimeout();

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    let recognition;
    try {
      recognition = createSpeechRecognition(language);
      if (!recognition) {
        setVoiceError(text.micUnsupported);
        return;
      }
    } catch (error) {
      console.error('Speech recognition setup error:', error);
      setVoiceError(text.micStartFailed);
      return;
    }

    recognitionRef.current = recognition;
    recognition.onstart = () => {
      clearVoiceStartTimeout();
      setIsListening(true);
    };
    recognition.onend = () => {
      clearVoiceStartTimeout();
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognition.onerror = (event) => {
      clearVoiceStartTimeout();
      const errorCode = event?.error;
      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        setVoiceError(text.micPermissionBlocked);
      } else if (errorCode === 'no-speech' || errorCode === 'aborted') {
        setVoiceError(text.micNoSpeech);
      } else if (errorCode === 'network') {
        setVoiceError(text.micNetwork);
      } else {
        setVoiceError(text.micGenericError);
      }
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        handleSendMessage(transcript);
      }
    };

    voiceStartTimeoutRef.current = window.setTimeout(() => {
      if (!isListening) {
        setVoiceError(text.micStartFailed);
      }
    }, 2500);

    try {
      recognition.start();
    } catch (error) {
      console.error('Speech recognition start error:', error);
      clearVoiceStartTimeout();
      setVoiceError(text.micStartFailed);
    }
  };

  const handleStopVoiceInput = () => {
    clearVoiceStartTimeout();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleSpeakMessage = (messageText) => {
    if (!speechSynthesisSupported) {
      setVoiceError(text.speakUnsupported);
      return;
    }

    setVoiceError('');
    speakText(messageText, language);
  };

  const pdfUrl = selectedChapter?.pdfPath
    ? api.resolveUrl(selectedChapter.pdfPath)
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
        language={language}
        onLanguageChange={setLanguage}
        onStartVoiceInput={handleStartVoiceInput}
        onStopVoiceInput={handleStopVoiceInput}
        isListening={isListening}
        speechRecognitionSupported={speechRecognitionSupported}
        speechSynthesisSupported={speechSynthesisSupported}
        onSpeakMessage={handleSpeakMessage}
        voiceError={voiceError}
        inputPlaceholder={text.inputPlaceholder}
      />
      <PdfViewer
        pdfUrl={pdfUrl}
        chapterTitle={selectedChapter?.name}
      />
    </div>
  );
}

export default ChatLayout;
