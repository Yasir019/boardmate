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

  const tryUnwrapObject = (value) => {
    let current = value;
    for (let i = 0; i < 3; i += 1) {
      if (typeof current === 'string') {
        try {
          current = JSON.parse(current);
          continue;
        } catch {
          return null;
        }
      }

      if (current && typeof current === 'object' && !Array.isArray(current)) {
        const envelope = current.data || current.result || current.output || current.response;
        if (envelope && envelope !== current) {
          current = envelope;
          continue;
        }
      }
      return current;
    }
    return current;
  };

  try {
    return tryUnwrapObject(JSON.parse(directCandidate));
  } catch {
    const sanitizedCandidate = directCandidate
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, '$1');

    try {
      return tryUnwrapObject(JSON.parse(sanitizedCandidate));
    } catch {
      // Continue with substring extraction fallback.
    }

    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return tryUnwrapObject(JSON.parse(rawText.slice(start, end + 1)));
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

function stripSummaryBoilerplate(value) {
  const text = sanitizeModelText(value);
  if (!text) {
    return '';
  }

  return text
    .replace(/^chapter\s+summary\s*:?\s*/i, '')
    .replace(/^overview\s*:?\s*/i, '')
    .replace(/^detailed\s*summary\s*:?\s*/i, '')
    .replace(/^📖\s*chapter\s+summary\s*:?\s*/i, '')
    .replace(/^##\s*overview\s*/i, '')
    .trim();
}

function splitSummaryParagraphs(value) {
  const text = stripSummaryBoilerplate(value);
  if (!text) {
    return [];
  }

  const explicitParagraphs = text
    .split(/\n{2,}|<br\s*\/?><br\s*\/?>/i)
    .map((item) => sanitizeModelText(item))
    .filter(Boolean);

  if (explicitParagraphs.length > 1) {
    return explicitParagraphs;
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((item) => sanitizeModelText(item))
    .filter(Boolean);

  if (sentences.length <= 3) {
    return sentences.length ? [text] : [];
  }

  const grouped = [];
  for (let i = 0; i < sentences.length; i += 3) {
    grouped.push(sentences.slice(i, i + 3).join(' '));
  }
  return grouped;
}

function extractSectionText(rawText, heading) {
  const text = String(rawText || '').replace(/\r/g, '');
  if (!text) {
    return '';
  }

  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:\\*\\*)?(?:Overview|Detailed Summary|Key Points|Key Concepts)(?:\\*\\*)?\\s*:?\\s*(?:\\n|$)|$)`,
    'i'
  );
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
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
    detailedSummary: [],
    keyPoints: [],
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

    if (/^overview\s*:?$/i.test(line) || /^##\s*overview\b/i.test(line)) {
      current = 'overview';
      return;
    }
    if (/^detailed\s*summary\s*:?$/i.test(line) || /^##\s*detailed\s*summary\b/i.test(line)) {
      current = 'detailedSummary';
      return;
    }
    if (/^chapter\s+summary\s*:?\s*/i.test(line) || /^📖\s*chapter\s+summary\s*:?\s*/i.test(line)) {
      return;
    }
    if (/^(key\s*points?)\s*:?$/i.test(line)) {
      current = 'keyPoints';
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

    const cleanedLine = stripSummaryBoilerplate(toPlain(line));
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
  if (!sections.keyPoints.length && sections.keyConcepts.length) {
    sections.keyPoints = sections.keyConcepts.slice(0, 8);
  }

  const overviewText = sections.overview.join(' ');
  const detailedSummaryText = sections.detailedSummary.join(' ');

  if (!overviewText && !detailedSummaryText && !sections.keyConcepts.length && !sections.examTakeaways.length) {
    return null;
  }

  return {
    title: sections.title || 'Chapter Summary',
    overview: overviewText || fallbackPoints[0] || 'Overview not provided.',
    detailedNotes: detailedSummaryText,
    keyPoints: sections.keyPoints,
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

  const stripMarkdownMarkers = (value) => String(value || '').replace(/\*\*/g, '').trim();
  const isQuestionStart = (line) => {
    const normalized = stripMarkdownMarkers(line);
    return /^q\d+\.|^question\s*:|^question\s+\d+\s*:?$|^\d+[\.\-]\s+/i.test(normalized);
  };
  const isMetaStart = (line) => {
    const normalized = stripMarkdownMarkers(line);
    return /^(answer\s*:|correct\s+answer\s*:|answer_index\s*:|explanation\s*:)/i.test(normalized);
  };

  while (i < lines.length) {
    const current = lines[i];
    if (!isQuestionStart(current)) {
      i += 1;
      continue;
    }

    const normalizedCurrent = stripMarkdownMarkers(current);
    let questionText = normalizedCurrent
      .replace(/^q\d+\.\s*/i, '')
      .replace(/^question\s*:\s*/i, '')
      .replace(/^question\s+\d+\s*:?\s*/i, '')
      .trim();

    if (!questionText && i + 1 < lines.length) {
      const nextLine = stripMarkdownMarkers(lines[i + 1]);
      if (nextLine && !isQuestionStart(nextLine) && !isMetaStart(nextLine) && !/^[A-D][\)\.]\s+/i.test(nextLine)) {
        questionText = nextLine;
        i += 1;
      }
    }

    const options = [];
    let answerIndex = 0;
    let explanation = '';
    i += 1;

    while (i < lines.length && !isQuestionStart(lines[i])) {
      const line = lines[i];

      if (/^options?\s*:/i.test(line)) {
        const firstOption = stripMarkdownMarkers(line).replace(/^options?\s*:\s*/i, '').trim();
        if (firstOption) {
          options.push(firstOption.replace(/^[A-D][\)\.]?\s*/i, '').trim());
        }

        i += 1;
        while (i < lines.length && !isQuestionStart(lines[i]) && !isMetaStart(lines[i])) {
          const optionLine = stripMarkdownMarkers(lines[i]).replace(/^[A-D][\)\.]?\s*/i, '').trim();
          if (optionLine) {
            options.push(optionLine);
          }
          i += 1;
        }
        continue;
      }

      if (/^[A-D][\)\.]?\s+/i.test(stripMarkdownMarkers(line))) {
        options.push(stripMarkdownMarkers(line).replace(/^[A-D][\)\.]?\s*/i, '').trim());
        i += 1;
        continue;
      }

      if (/^answer_index\s*:/i.test(stripMarkdownMarkers(line))) {
        const numeric = Number(stripMarkdownMarkers(line).replace(/^answer_index\s*:\s*/i, '').trim());
        if (Number.isFinite(numeric)) {
          // Accept both 0-based and 1-based values from model output.
          answerIndex = numeric >= 1 && numeric <= 4 ? numeric - 1 : numeric;
        }
        i += 1;
        continue;
      }

      if (/^(answer|correct\s+answer)\s*:/i.test(stripMarkdownMarkers(line))) {
        const rawAnswer = stripMarkdownMarkers(line).replace(/^(answer|correct\s+answer)\s*:\s*/i, '').trim();
        const answerLetterMatch = rawAnswer.match(/^([A-D])[\)\.]?/i);
        if (answerLetterMatch) {
          answerIndex = answerLetterMatch[1].toUpperCase().charCodeAt(0) - 65;
        } else if (/^[A-D]$/i.test(rawAnswer)) {
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

      if (/^explanation\s*:/i.test(stripMarkdownMarkers(line))) {
        explanation = stripMarkdownMarkers(line).replace(/^explanation\s*:\s*/i, '').trim();
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
    const loose = parseLooseSummaryText(answer);
    if (!loose) {
      return null;
    }

    const overviewSection = extractSectionText(answer, 'Overview');
    const detailSection = extractSectionText(answer, 'Detailed Summary');
    const keyPointsSection = extractSectionText(answer, 'Key Points');
    const keyConceptsSection = extractSectionText(answer, 'Key Concepts');

    const overview = stripSummaryBoilerplate(overviewSection || loose.overview || '');
    const detailedNotes = stripSummaryBoilerplate(detailSection || loose.detailedNotes || '');
    const keyPoints = keyPointsSection ? toSentenceList(keyPointsSection) : (loose.keyPoints || []);
    const keyConcepts = keyConceptsSection ? toSentenceList(keyConceptsSection) : (loose.keyConcepts || []);

    return {
      ...loose,
      overview,
      overviewParagraphs: splitSummaryParagraphs(overview),
      detailedNotes,
      detailedParagraphs: splitSummaryParagraphs(detailedNotes),
      keyPoints,
      keyConcepts,
    };
  }

  const nestedCandidate = (
    typeof parsed.overview === 'string' && parsed.overview.trim().startsWith('{')
      ? extractJsonPayload(parsed.overview)
      : null
  );

  const summarySource = (
    nestedCandidate
    && typeof nestedCandidate === 'object'
    && (
      nestedCandidate.summary_title
      || nestedCandidate.detailed_notes
      || nestedCandidate.key_concepts
      || nestedCandidate.exam_takeaways
    )
  )
    ? nestedCandidate
    : parsed;

  const keyPoints = toSentenceList(summarySource.key_points || summarySource.key_concepts || summarySource.concepts || summarySource.main_points);
  const keyConcepts = toSentenceList(summarySource.key_concepts || summarySource.concepts || summarySource.main_points);
  const examTakeaways = toSentenceList(summarySource.exam_takeaways || summarySource.takeaways || summarySource.exam_points);
  const revisionQuestions = toSentenceList(summarySource.revision_questions || summarySource.practice_questions);

  const terms = summarySource.important_terms || summarySource.terms || [];
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

  const detailedNotes = stripSummaryBoilerplate(String(summarySource.detailed_notes || summarySource.full_summary || ''));
  const overview = stripSummaryBoilerplate(String(summarySource.overview || ''));
  const overviewParagraphs = splitSummaryParagraphs(overview);
  const detailedParagraphs = splitSummaryParagraphs(detailedNotes);

  if (!keyPoints.length && !keyConcepts.length && !examTakeaways.length && !revisionQuestions.length && !detailedNotes && !overview) {
    return parseLooseSummaryText(answer);
  }

  return {
    title: sanitizeModelText(summarySource.summary_title || 'Chapter Summary'),
    overview,
    overviewParagraphs,
    detailedNotes,
    detailedParagraphs,
    keyPoints,
    keyConcepts,
    importantTerms,
    examTakeaways,
    revisionQuestions,
  };
}

function normalizeExerciseSectionItems(items, sectionKey) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const question = sanitizeModelText(String(item.question || item.text || ''));
      const answer = sanitizeModelText(String(item.answer || item.solution || ''));
      const explanation = sanitizeModelText(String(item.explanation || ''));
      const steps = Array.isArray(item.steps)
        ? item.steps.map((step) => sanitizeModelText(String(step))).filter(Boolean)
        : [];
      const keyPoints = Array.isArray(item.key_points || item.keyPoints)
        ? (item.key_points || item.keyPoints).map((point) => sanitizeModelText(String(point))).filter(Boolean)
        : [];

      if (!question && !answer && !explanation && !steps.length && !keyPoints.length) {
        return null;
      }

      return {
        id: `${sectionKey}-${index + 1}`,
        questionNo: sanitizeModelText(String(item.question_no || item.number || index + 1)),
        question,
        answer,
        explanation,
        steps,
        keyPoints,
      };
    })
    .filter(Boolean);
}

function buildExercisePayload({
  title = 'Exercise Solutions',
  overview = '',
  mcqs = [],
  shortQuestions = [],
  longQuestions = [],
  numericals = [],
}) {
  const total = mcqs.length + shortQuestions.length + longQuestions.length + numericals.length;
  if (!total) {
    return null;
  }

  return {
    title,
    overview: overview || `Generated ${total} exercise solution${total === 1 ? '' : 's'}.`,
    mcqs,
    shortQuestions,
    longQuestions,
    numericals,
  };
}

function parseLooseExerciseData(answer) {
  if (!answer || typeof answer !== 'string') {
    return null;
  }

  const cleaned = answer.replace(/```json|```/gi, '').replace(/\r/g, '').trim();
  if (!cleaned) {
    return null;
  }

  const stripMarkdownMarkers = (value) => String(value || '').replace(/\*\*/g, '').trim();
  const toSectionKey = (line) => {
    const normalized = stripMarkdownMarkers(line)
      .replace(/^section\s+[a-z]\s*:\s*/i, '')
      .toLowerCase();

    if (/^multiple choice questions/.test(normalized) || /^mcqs?/.test(normalized)) {
      return 'mcqs';
    }
    if (/^short questions/.test(normalized)) {
      return 'shortQuestions';
    }
    if (/^long questions/.test(normalized)) {
      return 'longQuestions';
    }
    if (/^numerical problems/.test(normalized) || /^numericals?/.test(normalized)) {
      return 'numericals';
    }
    return '';
  };

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const sections = {
    mcqs: [],
    shortQuestions: [],
    longQuestions: [],
    numericals: [],
  };

  let currentSection = '';
  let current = null;
  let activeListKey = '';

  const flushCurrent = () => {
    if (!current || !currentSection) {
      current = null;
      activeListKey = '';
      return;
    }

    if (current.question || current.answer || current.explanation || current.steps.length || current.keyPoints.length) {
      sections[currentSection].push({
        id: `${currentSection}-${sections[currentSection].length + 1}`,
        questionNo: current.questionNo || String(sections[currentSection].length + 1),
        question: current.question,
        answer: current.answer,
        explanation: current.explanation,
        steps: current.steps,
        keyPoints: current.keyPoints,
      });
    }

    current = null;
    activeListKey = '';
  };

  lines.forEach((line) => {
    const normalizedLine = stripMarkdownMarkers(line);
    const sectionKey = toSectionKey(normalizedLine);
    if (sectionKey) {
      flushCurrent();
      currentSection = sectionKey;
      return;
    }

    const questionMatch = normalizedLine.match(/^(?:q(?:uestion)?\s*)?(\d+[a-zA-Z]?)\s*[\)\.:\-]\s*(.+)$/i);
    if (questionMatch && currentSection) {
      flushCurrent();
      current = {
        questionNo: sanitizeModelText(questionMatch[1]),
        question: sanitizeModelText(questionMatch[2]),
        answer: '',
        explanation: '',
        steps: [],
        keyPoints: [],
      };
      return;
    }

    if (!current || !currentSection) {
      return;
    }

    if (/^answer\s*:/i.test(normalizedLine)) {
      current.answer = sanitizeModelText(normalizedLine.replace(/^answer\s*:/i, ''));
      activeListKey = '';
      return;
    }
    if (/^explanation\s*:/i.test(normalizedLine)) {
      current.explanation = sanitizeModelText(normalizedLine.replace(/^explanation\s*:/i, ''));
      activeListKey = '';
      return;
    }
    if (/^solution\s*:/i.test(normalizedLine)) {
      const solutionText = sanitizeModelText(normalizedLine.replace(/^solution\s*:/i, ''));
      if (currentSection === 'mcqs') {
        current.explanation = solutionText;
      } else if (!current.answer) {
        current.answer = solutionText;
      } else {
        current.steps.push(solutionText);
      }
      activeListKey = '';
      return;
    }
    if (/^steps?\s*:/i.test(normalizedLine)) {
      const firstStep = sanitizeModelText(normalizedLine.replace(/^steps?\s*:/i, ''));
      if (firstStep) {
        current.steps.push(firstStep);
      }
      activeListKey = 'steps';
      return;
    }
    if (/^(key[_\s-]*points?|key[_\s-]*concepts?)\s*:/i.test(normalizedLine)) {
      const firstPoint = sanitizeModelText(normalizedLine.replace(/^(key[_\s-]*points?|key[_\s-]*concepts?)\s*:/i, ''));
      if (firstPoint) {
        current.keyPoints.push(firstPoint);
      }
      activeListKey = 'keyPoints';
      return;
    }
    if (/^(given|required)\s*:/i.test(normalizedLine)) {
      current.steps.push(sanitizeModelText(normalizedLine));
      activeListKey = 'steps';
      return;
    }

    if (/^[-*\u2022]\s*/.test(normalizedLine)) {
      const bullet = sanitizeModelText(normalizedLine.replace(/^[-*\u2022]\s*/, ''));
      if (bullet && activeListKey && Array.isArray(current[activeListKey])) {
        current[activeListKey].push(bullet);
      } else if (bullet) {
        current.keyPoints.push(bullet);
      }
      return;
    }

    if (activeListKey && Array.isArray(current[activeListKey])) {
      current[activeListKey].push(sanitizeModelText(normalizedLine));
      return;
    }

    if (!current.answer) {
      current.answer = sanitizeModelText(normalizedLine);
      return;
    }

    if (currentSection === 'mcqs') {
      current.explanation = [current.explanation, sanitizeModelText(normalizedLine)].filter(Boolean).join(' ').trim();
      return;
    }

    current.steps.push(sanitizeModelText(normalizedLine));
  });

  flushCurrent();

  return buildExercisePayload(sections);
}

function normalizeExerciseData(answer) {
  const parsed = extractJsonPayload(answer);
  if (!parsed || typeof parsed !== 'object') {
    return parseLooseExerciseData(answer);
  }

  const mcqs = normalizeExerciseSectionItems(
    parsed.mcqs || parsed.multiple_choice_questions || parsed.multipleChoiceQuestions || [],
    'mcqs'
  );
  const shortQuestions = normalizeExerciseSectionItems(
    parsed.short_questions || parsed.shortQuestions || [],
    'shortQuestions'
  );
  const longQuestions = normalizeExerciseSectionItems(
    parsed.long_questions || parsed.longQuestions || [],
    'longQuestions'
  );
  const numericals = normalizeExerciseSectionItems(
    parsed.numerical_problems || parsed.numericals || parsed.numericalQuestions || [],
    'numericals'
  );

  if (!mcqs.length && !shortQuestions.length && !longQuestions.length && !numericals.length) {
    const legacySolutions = normalizeExerciseSectionItems(parsed.solutions || [], 'shortQuestions');
    if (!legacySolutions.length) {
      return parseLooseExerciseData(answer);
    }

    return buildExercisePayload({
      title: sanitizeModelText(String(parsed.solution_title || 'Exercise Solutions')),
      overview: sanitizeModelText(String(parsed.overview || '')),
      shortQuestions: legacySolutions,
    });
  }

  return buildExercisePayload({
    title: sanitizeModelText(String(parsed.solution_title || 'Exercise Solutions')),
    overview: sanitizeModelText(String(parsed.overview || '')),
    mcqs,
    shortQuestions,
    longQuestions,
    numericals,
  });
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
                      {activeStudioItem.payload.quiz.questions.map((question, index) => {
                        const options = Array.isArray(question.options) ? question.options : [];
                        const answerIndex = Number.isInteger(question.answerIndex)
                          ? Math.max(0, Math.min(3, question.answerIndex))
                          : 0;
                        const answerLetter = `${String.fromCharCode(65 + answerIndex)})`;
                        const answerText = options[answerIndex] || 'Correct option not available';

                        return (
                          <article key={`${question.id || index}-${question.question}`} className="quiz-text-question-block">
                            <p className="quiz-text-question">
                              {`${index + 1}. `}
                              {question.question || 'Question not available'}
                            </p>

                            <div className="quiz-text-options" role="list" aria-label={`Options for question ${index + 1}`}>
                              {options.slice(0, 4).map((option, optionIndex) => (
                                <p key={`${question.id || index}-${optionIndex}`} role="listitem">
                                  {`${String.fromCharCode(65 + optionIndex)}) ${option}`}
                                </p>
                              ))}
                            </div>

                            <p className="quiz-text-answer">
                              <strong>Answer:</strong>
                              {' '}
                              <strong>{answerLetter}</strong>
                              {' '}
                              {answerText}
                            </p>

                            {index < activeStudioItem.payload.quiz.questions.length - 1 && (
                              <div className="quiz-text-separator" aria-hidden="true"></div>
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
                    <div className="summary-structured">
                      <h4>{activeStudioItem.payload.summary.title}</h4>

                      <section className="summary-section">
                        <p className="summary-section-heading"><strong>Overview</strong></p>
                        {(activeStudioItem.payload.summary.overviewParagraphs?.length
                          ? activeStudioItem.payload.summary.overviewParagraphs
                          : [activeStudioItem.payload.summary.overview || 'Overview not provided.']
                        ).map((paragraph, index) => (
                          <p key={`overview-${index}`} className="summary-section-paragraph">{paragraph}</p>
                        ))}
                      </section>

                      {(activeStudioItem.payload.summary.detailedNotes || activeStudioItem.payload.summary.overviewParagraphs?.length) && (
                        <section className="summary-section">
                          <p className="summary-section-heading"><strong>Detailed Summary</strong></p>
                          {(activeStudioItem.payload.summary.detailedParagraphs?.length
                            ? activeStudioItem.payload.summary.detailedParagraphs
                            : activeStudioItem.payload.summary.overviewParagraphs || []
                          ).map((paragraph, index) => (
                            <p key={`detail-${index}`} className="summary-section-paragraph">{paragraph}</p>
                          ))}
                        </section>
                      )}

                      {activeStudioItem.payload.summary.keyPoints.length > 0 && (
                        <section className="summary-section">
                          <p className="summary-section-heading"><strong>Key Points</strong></p>
                          <ul className="summary-section-list">
                            {activeStudioItem.payload.summary.keyPoints.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      )}

                      {(activeStudioItem.payload.summary.importantTerms.length > 0
                        || activeStudioItem.payload.summary.examTakeaways.length > 0
                        || activeStudioItem.payload.summary.revisionQuestions.length > 0) && (
                        <section className="summary-section">
                          <p className="summary-section-heading"><strong>Key Concepts</strong></p>
                          <ul className="summary-section-list">
                            {activeStudioItem.payload.summary.importantTerms.map((item) => (
                              <li key={`${item.term}-${item.definition}`}>
                                <strong>{item.term}</strong>
                                {item.definition ? ` - ${item.definition}` : ''}
                              </li>
                            ))}
                            {activeStudioItem.payload.summary.examTakeaways.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                            {activeStudioItem.payload.summary.revisionQuestions.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      )}

                      {false && activeStudioItem.payload.summary.keyConcepts.length > 0 && (
                        <>
                          <p className="summary-plain-heading"><strong>Key Concepts</strong></p>
                          {activeStudioItem.payload.summary.keyConcepts.map((item) => (
                            <p key={item} className="summary-plain-line">• {item}</p>
                          ))}
                        </>
                      )}

                      {false && activeStudioItem.payload.summary.importantTerms.length > 0 && (
                        <>
                          <p className="summary-plain-heading"><strong>Important Terms</strong></p>
                          {activeStudioItem.payload.summary.importantTerms.map((item) => (
                            <p key={`${item.term}-${item.definition}`} className="summary-plain-line">
                              • <strong>{item.term}:</strong> {item.definition}
                            </p>
                          ))}
                        </>
                      )}

                      {false && activeStudioItem.payload.summary.examTakeaways.length > 0 && (
                        <>
                          <p className="summary-plain-heading"><strong>Exam Takeaways</strong></p>
                          {activeStudioItem.payload.summary.examTakeaways.map((item) => (
                            <p key={item} className="summary-plain-line">• {item}</p>
                          ))}
                        </>
                      )}

                      {false && activeStudioItem.payload.summary.revisionQuestions.length > 0 && (
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
                    <div className="summary-structured exercise-structured">
                      <h4>{activeStudioItem.payload.exercise.title}</h4>

                      {activeStudioItem.payload.exercise.overview && (
                        <section className="summary-section">
                          <p className="summary-section-heading"><strong>Overview</strong></p>
                          <p className="summary-section-paragraph">{activeStudioItem.payload.exercise.overview}</p>
                        </section>
                      )}

                      {[
                        { key: 'mcqs', heading: 'Multiple Choice Questions', items: activeStudioItem.payload.exercise.mcqs },
                        { key: 'shortQuestions', heading: 'Short Questions', items: activeStudioItem.payload.exercise.shortQuestions },
                        { key: 'longQuestions', heading: 'Long Questions', items: activeStudioItem.payload.exercise.longQuestions },
                        { key: 'numericals', heading: 'Numerical Problems', items: activeStudioItem.payload.exercise.numericals },
                      ]
                        .filter((section) => Array.isArray(section.items) && section.items.length > 0)
                        .map((section) => (
                          <section key={section.key} className="summary-section">
                            <p className="summary-section-heading"><strong>{section.heading}</strong></p>

                            <div className="exercise-section-list">
                              {section.items.map((item) => (
                                <article key={`${section.key}-${item.questionNo}-${item.question}`} className="exercise-item">
                                  <p className="exercise-question-line">
                                    <strong>{`${item.questionNo}.`}</strong>
                                    {' '}
                                    <strong>{item.question}</strong>
                                  </p>

                                  {item.answer && (
                                    <p className="exercise-answer-line">
                                      <strong>Answer:</strong>
                                      {' '}
                                      {item.answer}
                                    </p>
                                  )}

                                  {item.explanation && (
                                    <p className="exercise-detail-line">
                                      <strong>Explanation:</strong>
                                      {' '}
                                      {item.explanation}
                                    </p>
                                  )}

                                  {item.steps.length > 0 && (
                                    <div className="exercise-detail-group">
                                      <p className="exercise-detail-label"><strong>Steps:</strong></p>
                                      {item.steps.map((step, index) => (
                                        <p key={`${section.key}-${item.questionNo}-step-${index}`} className="exercise-detail-line">{`${index + 1}. ${step}`}</p>
                                      ))}
                                    </div>
                                  )}

                                  {item.keyPoints.length > 0 && (
                                    <div className="exercise-detail-group">
                                      <p className="exercise-detail-label"><strong>Key Points:</strong></p>
                                      {item.keyPoints.map((point, index) => (
                                        <p key={`${section.key}-${item.questionNo}-point-${index}`} className="exercise-detail-line">• {point}</p>
                                      ))}
                                    </div>
                                  )}
                                </article>
                              ))}
                            </div>
                          </section>
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
