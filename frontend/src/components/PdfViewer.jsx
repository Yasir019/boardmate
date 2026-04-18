import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import '../styles/pdfviewer.css';

const STUDIO_VIDEO_URL = 'https://www.youtube.com/results?search_query=Eleventh+class+computer+book+panjab+bord';
const STUDIO_PAST_PAPERS_URL = 'https://www.ilmkidunya.com/past_papers/lahore-board-11th-computer-science.aspx';

function extractJsonPayload(rawText) {
  if (!rawText) {
    return null;
  }

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const directCandidate = fencedMatch ? fencedMatch[1] : rawText;

  try {
    return JSON.parse(directCandidate);
  } catch {
    const sanitizedCandidate = directCandidate
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, '$1');

    try {
      return JSON.parse(sanitizedCandidate);
    } catch {
      // Continue with substring extraction fallback.
    }

    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(rawText.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function toSentenceList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeModelText(String(item))).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\n|\u2022|-\s+/)
      .map((item) => sanitizeModelText(item))
      .filter(Boolean);
  }
  return [];
}

function sanitizeModelText(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .replace(/```json|```/gi, '')
    .replace(/\[(\d+)\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function parseLooseSummaryText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const cleaned = rawText
    .replace(/\r/g, '')
    .replace(/\*\*/g, '')
    .replace(/```json|```/gi, '')
    .trim();

  if (!cleaned) {
    return null;
  }

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const sections = {
    overview: [],
    keyConcepts: [],
    examTakeaways: [],
    revisionQuestions: [],
    importantTerms: [],
  };

  let current = 'overview';

  const toPlain = (line) => sanitizeModelText(line.replace(/^[-*\u2022]\s*/, ''));

  lines.forEach((line) => {
    const normalized = line.toLowerCase();

    if (/^summary\s*title\s*:/i.test(line)) {
      sections.title = sanitizeModelText(line.replace(/^summary\s*title\s*:/i, ''));
      return;
    }

    if (/^overview\s*:?$/i.test(line)) {
      current = 'overview';
      return;
    }
    if (/^(key\s*concepts?|main\s*points?)\s*:?$/i.test(line)) {
      current = 'keyConcepts';
      return;
    }
    if (/^(important\s*terms?|terms?)\s*:?$/i.test(line)) {
      current = 'importantTerms';
      return;
    }
    if (/^(exam\s*takeaways?|takeaways?|exam\s*points?)\s*:?$/i.test(line)) {
      current = 'examTakeaways';
      return;
    }
    if (/^(revision\s*questions?|practice\s*questions?)\s*:?$/i.test(line)) {
      current = 'revisionQuestions';
      return;
    }

    const cleanedLine = toPlain(line);
    if (!cleanedLine) {
      return;
    }

    if (current === 'importantTerms') {
      const [term, ...definitionParts] = cleanedLine.split(':');
      const trimmedTerm = sanitizeModelText(term);
      const definition = sanitizeModelText(definitionParts.join(':'));
      if (trimmedTerm && definition) {
        sections.importantTerms.push({ term: trimmedTerm, definition });
      } else if (trimmedTerm) {
        sections.importantTerms.push({ term: trimmedTerm, definition: 'Definition not provided.' });
      }
      return;
    }

    sections[current].push(cleanedLine);
  });

  const fallbackPoints = cleaned
    .split(/[.!?]\s+/)
    .map((point) => sanitizeModelText(point))
    .filter((point) => point.length > 25);

  if (!sections.keyConcepts.length) {
    sections.keyConcepts = fallbackPoints.slice(0, 5);
  }

  const overviewText = sections.overview.join(' ');

  if (!overviewText && !sections.keyConcepts.length && !sections.examTakeaways.length) {
    return null;
  }

  return {
    title: sections.title || 'Chapter Summary',
    overview: overviewText || fallbackPoints[0] || 'Overview not provided.',
    keyConcepts: sections.keyConcepts,
    importantTerms: sections.importantTerms,
    examTakeaways: sections.examTakeaways,
    revisionQuestions: sections.revisionQuestions,
  };
}

function beautifyRawResponse(rawText) {
  if (!rawText) {
    return 'No content available.';
  }

  const parsed = extractJsonPayload(rawText);
  if (!parsed || typeof parsed !== 'object') {
    return String(rawText)
      .replace(/```json|```/gi, '')
      .replace(/[{}\[\]"]/g, '')
      .replace(/\s*,\s*/g, '\n')
      .replace(/\s*:\s*/g, ': ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const lines = [];
  Object.entries(parsed).forEach(([key, value]) => {
    const heading = key.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
    if (Array.isArray(value)) {
      lines.push(`${heading}:`);
      value.forEach((item) => {
        if (typeof item === 'object' && item !== null) {
          lines.push(`- ${Object.values(item).join(': ')}`);
        } else {
          lines.push(`- ${String(item)}`);
        }
      });
      lines.push('');
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${heading}:`);
      Object.entries(value).forEach(([k, v]) => {
        lines.push(`- ${k}: ${String(v)}`);
      });
      lines.push('');
    } else {
      lines.push(`${heading}: ${String(value)}`);
    }
  });

  return lines.join('\n').trim() || String(rawText);
}

function parseLooseQuizText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const cleaned = rawText
    .replace(/\r/g, '')
    .replace(/\*\*/g, '')
    .trim();

  if (!cleaned) {
    return null;
  }

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const titleLine = lines.find((line) => /^quiz\s*title\s*:|^quiz_title\s*:/i.test(line));
  const title = titleLine
    ? titleLine.replace(/^quiz\s*title\s*:|^quiz_title\s*:/i, '').trim()
    : 'Chapter Quiz';

  const questions = [];
  let i = 0;

  const isQuestionStart = (line) => /^q\d+\.|^question\s*:/i.test(line);
  const isMetaStart = (line) => /^(answer\s*:|answer_index\s*:|explanation\s*:)/i.test(line);

  while (i < lines.length) {
    const current = lines[i];
    if (!isQuestionStart(current)) {
      i += 1;
      continue;
    }

    const questionText = current
      .replace(/^q\d+\.\s*/i, '')
      .replace(/^question\s*:\s*/i, '')
      .trim();

    const options = [];
    let answerIndex = 0;
    let explanation = '';
    i += 1;

    while (i < lines.length && !isQuestionStart(lines[i])) {
      const line = lines[i];

      if (/^options?\s*:/i.test(line)) {
        const firstOption = line.replace(/^options?\s*:\s*/i, '').trim();
        if (firstOption) {
          options.push(firstOption.replace(/^[A-D]\.?\s*/i, '').trim());
        }

        i += 1;
        while (i < lines.length && !isQuestionStart(lines[i]) && !isMetaStart(lines[i])) {
          const optionLine = lines[i].replace(/^[A-D]\.?\s*/i, '').trim();
          if (optionLine) {
            options.push(optionLine);
          }
          i += 1;
        }
        continue;
      }

      if (/^[A-D]\.?\s+/i.test(line)) {
        options.push(line.replace(/^[A-D]\.?\s*/i, '').trim());
        i += 1;
        continue;
      }

      if (/^answer_index\s*:/i.test(line)) {
        const numeric = Number(line.replace(/^answer_index\s*:\s*/i, '').trim());
        if (Number.isFinite(numeric)) {
          // Accept both 0-based and 1-based values from model output.
          answerIndex = numeric >= 1 && numeric <= 4 ? numeric - 1 : numeric;
        }
        i += 1;
        continue;
      }

      if (/^answer\s*:/i.test(line)) {
        const rawAnswer = line.replace(/^answer\s*:\s*/i, '').trim();
        if (/^[A-D]$/i.test(rawAnswer)) {
          answerIndex = rawAnswer.toUpperCase().charCodeAt(0) - 65;
        } else {
          const numeric = Number(rawAnswer);
          if (Number.isFinite(numeric)) {
            answerIndex = numeric >= 1 && numeric <= 4 ? numeric - 1 : numeric;
          }
        }
        i += 1;
        continue;
      }

      if (/^explanation\s*:/i.test(line)) {
        explanation = line.replace(/^explanation\s*:\s*/i, '').trim();
        i += 1;
        continue;
      }

      i += 1;
    }

    while (options.length < 4) {
      options.push(`Option ${options.length + 1}`);
    }

    questions.push({
      id: questions.length + 1,
      question: questionText || `Question ${questions.length + 1}`,
      options: options.slice(0, 4),
      answerIndex: Math.max(0, Math.min(3, answerIndex || 0)),
      explanation,
    });
  }

  if (!questions.length) {
    return null;
  }

  return {
    title,
    questions: questions.slice(0, 20),
  };
}

function normalizeQuizData(answer) {
  const parsed = extractJsonPayload(answer);
  if (!parsed || typeof parsed !== 'object') {
    return parseLooseQuizText(answer);
  }

  const candidateQuestions = parsed.questions || parsed.mcqs || parsed.items || [];
  if (!Array.isArray(candidateQuestions)) {
    return null;
  }

  const normalizedQuestions = candidateQuestions
    .map((q, index) => {
      if (!q || typeof q !== 'object') {
        return null;
      }

      const questionText = q.question || q.prompt || q.stem || '';
      if (!questionText) {
        return null;
      }

      let options = [];
      if (Array.isArray(q.options)) {
        options = q.options.map((opt) => String(opt));
      } else if (q.options && typeof q.options === 'object') {
        options = Object.values(q.options).map((opt) => String(opt));
      }

      options = options.filter(Boolean).slice(0, 4);
      while (options.length < 4) {
        options.push(`Option ${options.length + 1}`);
      }

      const answerIndex = Number.isInteger(q.answer_index)
        ? q.answer_index
        : (typeof q.correct_option === 'number'
          ? q.correct_option
          : (/^[A-D]$/i.test(String(q.answer || ''))
            ? String(q.answer).toUpperCase().charCodeAt(0) - 65
            : 0));

      return {
        id: index + 1,
        question: sanitizeModelText(String(questionText)),
        options: options.map((opt) => sanitizeModelText(opt)),
        answerIndex: Math.max(0, Math.min(3, answerIndex)),
        explanation: q.explanation ? sanitizeModelText(String(q.explanation)) : '',
      };
    })
    .filter(Boolean)
    .slice(0, 20)
    ;

  if (!normalizedQuestions.length) {
    return parseLooseQuizText(answer);
  }

  return {
    title: parsed.quiz_title || 'Chapter Quiz',
    questions: normalizedQuestions,
  };
}

function normalizeSummaryData(answer) {
  const parsed = extractJsonPayload(answer);
  if (!parsed || typeof parsed !== 'object') {
    return parseLooseSummaryText(answer);
  }

  const keyConcepts = toSentenceList(parsed.key_concepts || parsed.concepts || parsed.main_points);
  const examTakeaways = toSentenceList(parsed.exam_takeaways || parsed.takeaways || parsed.exam_points);
  const revisionQuestions = toSentenceList(parsed.revision_questions || parsed.practice_questions);

  const terms = parsed.important_terms || parsed.terms || [];
  const importantTerms = Array.isArray(terms)
    ? terms
      .map((item) => {
        if (!item) {
          return null;
        }
        if (typeof item === 'string') {
          const [term, ...rest] = item.split(':');
          return { term: term.trim(), definition: rest.join(':').trim() || term.trim() };
        }
        if (typeof item === 'object') {
          const term = item.term || item.name || '';
          const definition = item.definition || item.meaning || '';
          if (!term && !definition) {
            return null;
          }
          return {
            term: sanitizeModelText(String(term || 'Term')),
            definition: sanitizeModelText(String(definition || '')),
          };
        }
        return null;
      })
      .filter(Boolean)
    : [];

  if (!keyConcepts.length && !examTakeaways.length && !revisionQuestions.length) {
    return parseLooseSummaryText(answer);
  }

  return {
    title: sanitizeModelText(parsed.summary_title || 'Chapter Summary'),
    overview: sanitizeModelText(String(parsed.overview || '')),
    detailedNotes: sanitizeModelText(String(parsed.detailed_notes || parsed.full_summary || '')),
    keyConcepts,
    importantTerms,
    examTakeaways,
    revisionQuestions,
  };
}

function normalizeExerciseData(answer) {
  const parsed = extractJsonPayload(answer);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const solutions = Array.isArray(parsed.solutions)
    ? parsed.solutions
      .map((item, index) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const question = sanitizeModelText(String(item.question || ''));
        const answerText = sanitizeModelText(String(item.answer || ''));
        if (!question && !answerText) {
          return null;
        }

        const steps = Array.isArray(item.steps)
          ? item.steps.map((step) => sanitizeModelText(String(step))).filter(Boolean)
          : [];

        const keyPoints = Array.isArray(item.key_points)
          ? item.key_points.map((point) => sanitizeModelText(String(point))).filter(Boolean)
          : [];

        return {
          id: index + 1,
          questionNo: sanitizeModelText(String(item.question_no || index + 1)),
          question,
          answer: answerText,
          steps,
          keyPoints,
        };
      })
      .filter(Boolean)
    : [];

  if (!solutions.length) {
    return null;
  }

  return {
    title: sanitizeModelText(String(parsed.solution_title || 'Exercise Solutions')),
    overview: sanitizeModelText(String(parsed.overview || '')),
    solutions,
  };
}

function PdfViewer({
  pdfUrl,
  chapterTitle,
  board,
  classLevel,
  subject,
  chapterId,
  language = 'en',
  onCollapsePanel,
}) {
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(false);
  const [studioItems, setStudioItems] = useState([]);
  const [activeStudioItemId, setActiveStudioItemId] = useState(null);
  const [quizSessions, setQuizSessions] = useState({});
  const [generationState, setGenerationState] = useState({
    quiz: false,
    view: false,
    summary: false,
    exercise: false,
  });
  const [openHistoryMenuId, setOpenHistoryMenuId] = useState(null);
  const [historyMenuPosition, setHistoryMenuPosition] = useState({ top: 0, left: 0 });
  const viewerRef = useRef(null);

  useEffect(() => {
    setError(false);
    setZoom(100);
    setIsDocumentVisible(false);
    setStudioItems([]);
    setActiveStudioItemId(null);
    setQuizSessions({});
    setGenerationState({
      quiz: false,
      view: false,
      summary: false,
      exercise: false,
    });
    setOpenHistoryMenuId(null);
    setHistoryMenuPosition({ top: 0, left: 0 });
  }, [pdfUrl, chapterTitle, chapterId, board, classLevel, subject]);

  useEffect(() => {
    if (!openHistoryMenuId) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenHistoryMenuId(null);
        return;
      }

      if (target.closest('.pdf-studio-history-menu') || target.closest('.pdf-studio-history-more')) {
        return;
      }

      setOpenHistoryMenuId(null);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenHistoryMenuId(null);
      }
    };

    const handleViewportChange = () => {
      setOpenHistoryMenuId(null);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [openHistoryMenuId]);

  const activeStudioItem = useMemo(
    () => studioItems.find((item) => item.id === activeStudioItemId) || null,
    [studioItems, activeStudioItemId]
  );

  const historyItems = useMemo(
    () => studioItems.filter((item) => item.type === 'quiz' || item.type === 'summary' || item.type === 'exercise'),
    [studioItems]
  );

  const updateStudioItem = (itemId, patch) => {
    setStudioItems((prev) => prev.map((item) => (
      item.id === itemId
        ? { ...item, ...patch }
        : item
    )));
  };

  const createStudioItem = (type, title) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const nextItem = {
      id,
      type,
      title,
      status: 'processing',
      createdAt: new Date().toISOString(),
      payload: null,
      error: '',
    };
    setStudioItems((prev) => [nextItem, ...prev]);
    return id;
  };

  const setGenerationFlag = (type, nextValue) => {
    setGenerationState((prev) => ({
      ...prev,
      [type]: nextValue,
    }));
  };

  const hasPendingItem = (type) => studioItems.some(
    (item) => item.type === type && item.status === 'processing'
  );

  const positionHistoryMenu = (buttonElement) => {
    if (!(buttonElement instanceof Element)) {
      return;
    }

    const rect = buttonElement.getBoundingClientRect();
    const menuWidth = 124;
    const menuHeight = 92;
    const spacing = 8;

    const left = Math.max(
      spacing,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - spacing)
    );

    let top = rect.top - menuHeight - 6;
    if (top < spacing) {
      top = Math.min(rect.bottom + 6, window.innerHeight - menuHeight - spacing);
    }

    setHistoryMenuPosition({ top, left });
  };

  const handleOpenStudioItem = (item) => {
    if (!item || item.status !== 'ready') {
      return;
    }

    setOpenHistoryMenuId(null);

    setActiveStudioItemId(item.id);

    if (item.type === 'quiz' && item.payload?.quiz?.questions?.length) {
      setQuizSessions((prev) => {
        if (prev[item.id]) {
          return prev;
        }

        return {
          ...prev,
          [item.id]: {
            questionIndex: 0,
            selectedAnswers: {},
          },
        };
      });
    }
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) {
      return 'just now';
    }

    const now = Date.now();
    const then = new Date(timestamp).getTime();
    if (Number.isNaN(then)) {
      return 'just now';
    }

    const diffMinutes = Math.max(0, Math.floor((now - then) / 60000));
    if (diffMinutes < 1) {
      return 'just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getHistoryTypeLabel = (type) => {
    if (type === 'quiz') {
      return 'Quiz';
    }
    if (type === 'summary') {
      return 'Summary';
    }
    if (type === 'exercise') {
      return 'Exercise Solution';
    }
    return 'Item';
  };

  const handleRenameStudioItem = (itemId) => {
    const item = studioItems.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    const nextTitle = window.prompt('Rename item', item.title || '')?.trim();
    if (!nextTitle) {
      return;
    }

    updateStudioItem(itemId, { title: nextTitle });
    setOpenHistoryMenuId(null);
  };

  const handleDeleteStudioItem = (itemId) => {
    const item = studioItems.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    const shouldDelete = window.confirm(`Delete "${item.title}"?`);
    if (!shouldDelete) {
      return;
    }

    setStudioItems((prev) => prev.filter((entry) => entry.id !== itemId));
    setQuizSessions((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    if (activeStudioItemId === itemId) {
      setActiveStudioItemId(null);
    }

    setOpenHistoryMenuId(null);
  };


  const handleCloseStudioDetail = () => {
    setActiveStudioItemId(null);
  };

  const handleQuizAnswer = (itemId, questionId, optionIndex) => {
    setQuizSessions((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { questionIndex: 0, selectedAnswers: {} }),
        selectedAnswers: {
          ...(prev[itemId]?.selectedAnswers || {}),
          [questionId]: optionIndex,
        },
      },
    }));
  };

  const shiftQuizQuestion = (itemId, direction, maxCount) => {
    setQuizSessions((prev) => {
      const current = prev[itemId] || { questionIndex: 0, selectedAnswers: {} };
      const nextIndex = Math.max(0, Math.min(maxCount - 1, current.questionIndex + direction));
      return {
        ...prev,
        [itemId]: {
          ...current,
          questionIndex: nextIndex,
        },
      };
    });
  };

  const handleGenerateQuiz = async () => {
    if (!chapterId || generationState.quiz || hasPendingItem('quiz')) {
      return;
    }

    setGenerationFlag('quiz', true);
    const itemId = createStudioItem('quiz', `${chapterTitle || 'Chapter'} Quiz`);
    try {
      const result = await api.generateChapterQuiz(
        board,
        classLevel,
        subject,
        chapterId,
        chapterTitle || chapterId,
        language,
      );

      updateStudioItem(itemId, {
        status: 'ready',
        payload: {
          quiz: normalizeQuizData(result.answer),
          rawAnswer: result.answer,
        },
      });
    } catch (studioError) {
      updateStudioItem(itemId, {
        status: 'failed',
        error: studioError.message || 'Could not generate quiz right now.',
      });
    } finally {
      setGenerationFlag('quiz', false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!chapterId || generationState.summary || hasPendingItem('summary')) {
      return;
    }

    setGenerationFlag('summary', true);
    const itemId = createStudioItem('summary', `${chapterTitle || 'Chapter'} Summary`);
    try {
      const result = await api.generateChapterSummary(
        board,
        classLevel,
        subject,
        chapterId,
        chapterTitle || chapterId,
        language,
      );

      updateStudioItem(itemId, {
        status: 'ready',
        payload: {
          summary: normalizeSummaryData(result.answer),
          rawAnswer: result.answer,
        },
      });
    } catch (studioError) {
      updateStudioItem(itemId, {
        status: 'failed',
        error: studioError.message || 'Could not generate summary right now.',
      });
    } finally {
      setGenerationFlag('summary', false);
    }
  };

  const handleGenerateExerciseSolution = async () => {
    if (!chapterId || generationState.exercise || hasPendingItem('exercise')) {
      return;
    }

    setGenerationFlag('exercise', true);
    const itemId = createStudioItem('exercise', `${chapterTitle || 'Chapter'} Exercise Solutions`);
    try {
      const result = await api.generateChapterExerciseSolution(
        board,
        classLevel,
        subject,
        chapterId,
        chapterTitle || chapterId,
        language,
      );

      updateStudioItem(itemId, {
        status: 'ready',
        payload: {
          exercise: normalizeExerciseData(result.answer),
          rawAnswer: result.answer,
        },
      });
    } catch (studioError) {
      updateStudioItem(itemId, {
        status: 'failed',
        error: studioError.message || 'Could not generate exercise solutions right now.',
      });
    } finally {
      setGenerationFlag('exercise', false);
    }
  };

  const handleCreateView = async () => {
    if (!chapterId || generationState.view || hasPendingItem('view')) {
      return;
    }

    setGenerationFlag('view', true);
    setIsDocumentVisible(true);
    setGenerationFlag('view', false);
  };

  const handleOpenVideos = () => {
    window.open(STUDIO_VIDEO_URL, '_blank', 'noopener,noreferrer');
  };

  const handleOpenPastPapers = () => {
    window.open(STUDIO_PAST_PAPERS_URL, '_blank', 'noopener,noreferrer');
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 50));
  };

  const handleZoomReset = () => {
    setZoom(100);
  };

  const toggleFullscreen = useCallback(() => {
    const el = viewerRef.current;
    if (!el) {
      return;
    }

    if (!document.fullscreenElement) {
      el.requestFullscreen().catch((err) => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  if (!pdfUrl) {
    return (
      <div className="pdf-viewer empty">
        <div className="pdf-placeholder">
          <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M10 14h4" />
            <path d="M10 10h2" />
            <path d="M10 18h4" />
          </svg>
          <p>Select a chapter to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={viewerRef}>
      <div className="pdf-header">
        <div className="pdf-title-group">
          <h3>Studio</h3>
        </div>
        {isDocumentVisible ? (
          <div className="pdf-controls">
            <button
              type="button"
              className="pdf-control-btn"
              onClick={() => setIsDocumentVisible(false)}
              title="Back to studio"
            >
              &lsaquo;
            </button>

            <button
              onClick={handleZoomOut}
              className="pdf-control-btn"
              title="Zoom Out"
              disabled={zoom <= 50}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="8" y1="11" x2="14" y2="11" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            <span className="zoom-level">{zoom}%</span>

            <button
              onClick={handleZoomIn}
              className="pdf-control-btn"
              title="Zoom In"
              disabled={zoom >= 200}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            <button
              onClick={handleZoomReset}
              className="pdf-control-btn"
              title="Reset Zoom"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6" />
                <path d="M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
            </button>

            <div className="pdf-divider"></div>

            <button
              onClick={toggleFullscreen}
              className="pdf-control-btn"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </button>

            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pdf-control-btn"
              title="Open in new tab"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        ) : (
          <div className="pdf-controls">
            <button
              type="button"
              className="panel-collapse-btn"
              onClick={() => onCollapsePanel?.()}
              title="Hide book panel"
              aria-label="Hide book panel"
            >
              <svg
                className="panel-toggle-icon"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="16" height="16" rx="2.8" />
                <path d="M10 2v16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className={`pdf-body ${isDocumentVisible ? 'document-mode' : 'studio-mode'}`}>
        <div className="pdf-container">
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1&zoom=${zoom}&view=FitH`}
            title={chapterTitle || 'Chapter PDF'}
            className="pdf-iframe"
            onError={(evt) => {
              console.error('PDF iframe error:', evt);
              setError(true);
            }}
          >
            <p>
              Your browser does not support PDFs.
              {' '}
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Download the PDF</a>
            </p>
          </iframe>
        </div>

        <aside className="pdf-studio-panel">
          <div className="pdf-studio-card-grid">
            <button
              type="button"
              className="pdf-studio-card"
              onClick={handleGenerateQuiz}
              disabled={generationState.quiz || hasPendingItem('quiz')}
            >
              <span className="pdf-studio-card-head">
                <span className="pdf-studio-card-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </span>
                <span className="pdf-studio-card-title">Quiz</span>
              </span>
                <span className="pdf-studio-card-sub">Practise MCQs</span>
            </button>

            <button
              type="button"
              className="pdf-studio-card"
              onClick={handleCreateView}
              disabled={generationState.view || hasPendingItem('view')}
            >
              <span className="pdf-studio-card-head">
                <span className="pdf-studio-card-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </span>
                <span className="pdf-studio-card-title">View</span>
              </span>
              <span className="pdf-studio-card-sub">Open selected chapter</span>
            </button>

            <button
              type="button"
              className="pdf-studio-card"
              onClick={handleGenerateSummary}
              disabled={generationState.summary || hasPendingItem('summary')}
            >
              <span className="pdf-studio-card-head">
                <span className="pdf-studio-card-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="14" y2="17" />
                  </svg>
                </span>
                <span className="pdf-studio-card-title">Summary / Notes</span>
              </span>
              <span className="pdf-studio-card-sub">Exam-focused notes</span>
            </button>

            <button
              type="button"
              className="pdf-studio-card"
              onClick={handleGenerateExerciseSolution}
              disabled={generationState.exercise || hasPendingItem('exercise')}
            >
              <span className="pdf-studio-card-head">
                <span className="pdf-studio-card-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="14" y2="17" />
                  </svg>
                </span>
                <span className="pdf-studio-card-title">Exercise Solution</span>
              </span>
              <span className="pdf-studio-card-sub">Chapter answers with steps</span>
            </button>

            <button
              type="button"
              className="pdf-studio-card is-video"
              onClick={handleOpenVideos}
            >
              <span className="pdf-studio-card-head">
                <span className="pdf-studio-card-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="16" rx="3" />
                    <polygon points="10,9 16,12 10,15" />
                  </svg>
                </span>
                <span className="pdf-studio-card-title">Videos</span>
              </span>
              <span className="pdf-studio-card-sub">Open learning videos</span>
            </button>

            <button
              type="button"
              className="pdf-studio-card is-paper"
              onClick={handleOpenPastPapers}
            >
              <span className="pdf-studio-card-head">
                <span className="pdf-studio-card-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="14" y2="17" />
                  </svg>
                </span>
                <span className="pdf-studio-card-title">Past Papers</span>
              </span>
              <span className="pdf-studio-card-sub">Open board past papers</span>
            </button>

            <button
              type="button"
              className="pdf-studio-card is-coming-soon"
              disabled
              aria-disabled="true"
              title="Mindmap coming soon"
            >
              <span className="pdf-studio-card-head">
                <span className="pdf-studio-card-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="6" r="2" />
                    <circle cx="6" cy="18" r="2" />
                    <circle cx="18" cy="18" r="2" />
                    <line x1="12" y1="8" x2="6" y2="16" />
                    <line x1="12" y1="8" x2="18" y2="16" />
                  </svg>
                </span>
                <span className="pdf-studio-card-title">Mindmap</span>
              </span>
              <span className="pdf-studio-card-sub">Coming Soon</span>
            </button>

            <button
              type="button"
              className="pdf-studio-card is-coming-soon"
              disabled
              aria-disabled="true"
              title="Flashcard coming soon"
            >
              <span className="pdf-studio-card-head">
                <span className="pdf-studio-card-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="6" width="16" height="12" rx="2" />
                    <line x1="8" y1="10" x2="16" y2="10" />
                    <line x1="8" y1="14" x2="13" y2="14" />
                  </svg>
                </span>
                <span className="pdf-studio-card-title">Flashcard</span>
              </span>
              <span className="pdf-studio-card-sub">Coming Soon</span>
            </button>
          </div>

          <div className="pdf-studio-history" aria-live="polite">
            <div className="pdf-studio-results">
              {historyItems.length === 0 ? (
                <div className="pdf-studio-empty-state">
                  <div className="pdf-studio-empty-state-icon" aria-hidden="true">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4.5 14.5l6.2-6.2a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0l-1.2-1.2a2 2 0 0 1 0-2.8z" />
                      <path d="M12 7l1-1" />
                      <path d="M17 3v2" />
                      <path d="M17 9v2" />
                      <path d="M14 6h2" />
                      <path d="M18 6h2" />
                    </svg>
                  </div>
                  <p className="pdf-studio-empty-state-title">Studio output will be saved here.</p>
                  <p className="pdf-studio-empty-state-text">
                    After adding sources, click to add Audio Overview, study guide, mind map and more.
                  </p>
                </div>
              ) : (
                historyItems.map((item) => {
                  const itemTypeLabel = getHistoryTypeLabel(item.type);
                  const isReady = item.status === 'ready';
                  const isProcessing = item.status === 'processing';

                  return (
                    <article key={item.id} className={`pdf-studio-history-card status-${item.status}`}>
                      <button
                        type="button"
                        className="pdf-studio-history-main"
                        onClick={() => handleOpenStudioItem(item)}
                        disabled={!isReady}
                      >
                        <span className="pdf-studio-history-icon" aria-hidden="true">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="8" y1="13" x2="16" y2="13" />
                          </svg>
                        </span>
                        <span className="pdf-studio-history-copy">
                          <span className="pdf-studio-history-item-title">
                            {isProcessing ? `Generating ${itemTypeLabel.toLowerCase()}...` : item.title}
                          </span>
                          <span className="pdf-studio-history-item-meta">
                            {isProcessing && 'based on 1 source'}
                            {isReady && `1 source · ${formatRelativeTime(item.createdAt)}`}
                            {item.status === 'failed' && (item.error || 'Failed to generate')}
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        className="pdf-studio-history-more"
                        onClick={(event) => {
                          event.preventDefault();
                          if (openHistoryMenuId === item.id) {
                            setOpenHistoryMenuId(null);
                            return;
                          }

                          positionHistoryMenu(event.currentTarget);
                          setOpenHistoryMenuId(item.id);
                        }}
                        title="Options"
                        aria-label="Options"
                        aria-haspopup="menu"
                        aria-expanded={openHistoryMenuId === item.id}
                      >
                        &#8942;
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          {openHistoryMenuId && createPortal(
            <div
              className="pdf-studio-history-menu"
              role="menu"
              aria-label="History item actions"
              style={{ top: `${historyMenuPosition.top}px`, left: `${historyMenuPosition.left}px` }}
            >
              <button
                type="button"
                className="pdf-studio-history-menu-item"
                onClick={() => handleRenameStudioItem(openHistoryMenuId)}
                role="menuitem"
              >
                Rename
              </button>
              <button
                type="button"
                className="pdf-studio-history-menu-item danger"
                onClick={() => handleDeleteStudioItem(openHistoryMenuId)}
                role="menuitem"
              >
                Delete
              </button>
            </div>,
            document.body
          )}
        </aside>
      </div>

      {error && (
        <div className="pdf-studio-overlay" role="dialog" aria-modal="true" aria-label="PDF loading error">
          <div className="pdf-studio-overlay-card">
            <div className="pdf-studio-overlay-header">
              <h3>Failed to load PDF</h3>
              <button type="button" className="pdf-control-btn" onClick={() => setError(false)} title="Close">
                ✕
              </button>
            </div>
            <div className="pdf-studio-overlay-content">
              <p className="dialog-message">There was a PDF loading issue. Click View again to retry.</p>
            </div>
          </div>
        </div>
      )}

      {activeStudioItem && (
        <div className="pdf-studio-overlay" role="dialog" aria-modal="true" aria-label="Studio result">
          <div className="pdf-studio-overlay-card">
            <div className="pdf-studio-overlay-header">
              <div className="pdf-studio-overlay-headings">
                <p className="pdf-studio-breadcrumb">Studio &rsaquo; App</p>
                <h3>{activeStudioItem.title}</h3>
              </div>
              <div className="pdf-studio-overlay-actions">
                <button
                  type="button"
                  className="pdf-control-btn"
                  onClick={handleCloseStudioDetail}
                  title="Back"
                >
                  &lsaquo;
                </button>
              </div>
            </div>

            <div className="pdf-studio-overlay-content">
              {activeStudioItem.type === 'quiz' && (
                <div className="quiz-sheet">
                  {activeStudioItem.payload?.quiz ? (
                    <>
                      <p className="quiz-title-line">{activeStudioItem.payload.quiz.title || 'Chapter Quiz'}</p>

                      {activeStudioItem.payload.quiz.questions.map((question, index) => {
                        const options = Array.isArray(question.options) ? question.options : [];
                        const answerIndex = Number.isInteger(question.answerIndex)
                          ? Math.max(0, Math.min(3, question.answerIndex))
                          : 0;

                        return (
                          <article key={`${question.id || index}-${question.question}`} className="quiz-text-question-block">
                            <p className="quiz-text-question">
                              {`Q${index + 1}. `}
                              {question.question || 'Question not available'}
                            </p>

                            <div className="quiz-text-options">
                              {options.slice(0, 4).map((option, optionIndex) => (
                                <p key={`${question.id || index}-${optionIndex}`}>
                                  {`${String.fromCharCode(65 + optionIndex)}. ${option}`}
                                </p>
                              ))}
                            </div>

                            <p className="quiz-text-answer">
                              {`Answer: ${String.fromCharCode(65 + answerIndex)}`}
                            </p>
                            <p className="quiz-text-explanation">
                              {`Explanation: ${question.explanation || 'No explanation provided.'}`}
                            </p>

                            {index < activeStudioItem.payload.quiz.questions.length - 1 && (
                              <p className="quiz-text-separator">--------------------------------------------------</p>
                            )}
                          </article>
                        );
                      })}
                    </>
                  ) : (
                    <pre className="studio-raw-output">{beautifyRawResponse(activeStudioItem.payload?.rawAnswer || 'Quiz format not available.')}</pre>
                  )}
                </div>
              )}

              {activeStudioItem.type === 'summary' && (
                <div className="summary-sheet">
                  {activeStudioItem.payload?.summary ? (
                    <div className="summary-plain">
                      <p className="summary-plain-heading"><strong>{activeStudioItem.payload.summary.title}</strong></p>

                      <p className="summary-plain-heading"><strong>Overview</strong></p>
                      <p className="summary-plain-paragraph">{activeStudioItem.payload.summary.overview || 'Overview not provided.'}</p>

                      {activeStudioItem.payload.summary.detailedNotes && (
                        <>
                          <p className="summary-plain-heading"><strong>Detailed Notes</strong></p>
                          <p className="summary-plain-paragraph">{activeStudioItem.payload.summary.detailedNotes}</p>
                        </>
                      )}

                      {activeStudioItem.payload.summary.keyConcepts.length > 0 && (
                        <>
                          <p className="summary-plain-heading"><strong>Key Concepts</strong></p>
                          {activeStudioItem.payload.summary.keyConcepts.map((item) => (
                            <p key={item} className="summary-plain-line">• {item}</p>
                          ))}
                        </>
                      )}

                      {activeStudioItem.payload.summary.importantTerms.length > 0 && (
                        <>
                          <p className="summary-plain-heading"><strong>Important Terms</strong></p>
                          {activeStudioItem.payload.summary.importantTerms.map((item) => (
                            <p key={`${item.term}-${item.definition}`} className="summary-plain-line">
                              • <strong>{item.term}:</strong> {item.definition}
                            </p>
                          ))}
                        </>
                      )}

                      {activeStudioItem.payload.summary.examTakeaways.length > 0 && (
                        <>
                          <p className="summary-plain-heading"><strong>Exam Takeaways</strong></p>
                          {activeStudioItem.payload.summary.examTakeaways.map((item) => (
                            <p key={item} className="summary-plain-line">• {item}</p>
                          ))}
                        </>
                      )}

                      {activeStudioItem.payload.summary.revisionQuestions.length > 0 && (
                        <>
                          <p className="summary-plain-heading"><strong>Revision Questions</strong></p>
                          {activeStudioItem.payload.summary.revisionQuestions.map((item, index) => (
                            <p key={item} className="summary-plain-line">{`${index + 1}. ${item}`}</p>
                          ))}
                        </>
                      )}
                    </div>
                  ) : (
                    <pre className="studio-raw-output">{beautifyRawResponse(activeStudioItem.payload?.rawAnswer || 'No summary found.')}</pre>
                  )}
                </div>
              )}

              {activeStudioItem.type === 'exercise' && (
                <div className="exercise-sheet">
                  {activeStudioItem.payload?.exercise ? (
                    <div className="summary-plain">
                      <p className="summary-plain-heading"><strong>{activeStudioItem.payload.exercise.title}</strong></p>

                      {activeStudioItem.payload.exercise.overview && (
                        <>
                          <p className="summary-plain-heading"><strong>Overview</strong></p>
                          <p className="summary-plain-paragraph">{activeStudioItem.payload.exercise.overview}</p>
                        </>
                      )}

                      <p className="summary-plain-heading"><strong>Solved Exercise</strong></p>
                      {activeStudioItem.payload.exercise.solutions.map((solution) => (
                        <div key={`${solution.questionNo}-${solution.question}`} className="exercise-item">
                          <p className="summary-plain-line"><strong>{`Q${solution.questionNo}:`}</strong> {solution.question}</p>
                          <p className="summary-plain-line"><strong>Answer:</strong> {solution.answer}</p>

                          {solution.steps.length > 0 && (
                            <>
                              <p className="summary-plain-line"><strong>Steps:</strong></p>
                              {solution.steps.map((step, index) => (
                                <p key={`${solution.questionNo}-step-${index}`} className="summary-plain-line">{`${index + 1}. ${step}`}</p>
                              ))}
                            </>
                          )}

                          {solution.keyPoints.length > 0 && (
                            <>
                              <p className="summary-plain-line"><strong>Key Points:</strong></p>
                              {solution.keyPoints.map((point, index) => (
                                <p key={`${solution.questionNo}-point-${index}`} className="summary-plain-line">• {point}</p>
                              ))}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="studio-raw-output">{beautifyRawResponse(activeStudioItem.payload?.rawAnswer || 'No exercise solutions found.')}</pre>
                  )}
                </div>
              )}

              {activeStudioItem.type === 'view' && (
                <div className="summary-sheet">
                  <pre className="studio-raw-output">{activeStudioItem.payload?.excerpt || 'No chapter preview found.'}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PdfViewer;
