import { sanitizeHtml } from './safeHtml.js';
import { mapOutsideQuizMath, protectQuizMath } from './quizMath.js';
import { normalizeMathDelimiters, normalizeMathText } from './quizContent.js';

export const SELF_QUIZ_OPTION_IDS = ['a', 'b', 'c', 'd'];

export const makeId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const normalizeQuizText = (text = '') =>
  mapOutsideQuizMath(normalizeMathDelimiters(text), prose => prose
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n'))
    .trim();

const cleanGeneratedQuizText = (text = '') =>
  mapOutsideQuizMath(normalizeQuizText(text), prose => prose
    .replace(/\s+(?:Câu|Cau|Question)\s*$/i, '')
    .replace(/\s+(?:Câu|Cau|Question)\s+\d{1,3}\s*[:.)-]?\s*$/i, '')
    .replace(/\s+(?:Câu|Cau|Question)\s+\d{1,3}\s*[:.)-]\s+.*$/i, ''))
    .trim();

export const getDefaultSelfQuizDraft = () => ({
  questions: [],
  shuffleQuestions: true,
  shuffleOptions: true,
  showScoreAfterSubmit: true,
  allowRetake: true,
  requirePassingScore: false,
  passingPercent: 0
});

export const makeEmptySelfQuizQuestion = () => ({
  id: makeId('q'),
  text: '',
  options: SELF_QUIZ_OPTION_IDS.map(id => ({ id, text: '' })),
  correctOptionId: '',
  points: 1
});

const foldText = (text = '') =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase();

export const stripHtmlToText = (html = '') => {
  const math = protectQuizMath(html);
  const source = math.source
    .replace(/<(sup|sub)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, value) => `${tag.toLowerCase() === 'sup' ? '^' : '_'}{${value}}`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n');
  const decode = value => value.replace(/&(?:lt|gt|amp|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, entity => {
    const name = entity.slice(1, -1).toLowerCase();
    if (name.startsWith('#')) {
      const code = name.startsWith('#x') ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' }[name];
  });
  if (typeof document === 'undefined') return decode(math.restore(source.replace(/<[^>]+>/g, ' '))).trim();
  const tmp = document.createElement('div');
  tmp.innerHTML = sanitizeHtml(source);
  return math.restore(tmp.innerText || tmp.textContent || '', decode).trim();
};

const prepareQuizTextForParsing = (text = '') =>
  mapOutsideQuizMath(text, prose => prose
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/([^\n])\s*((?:c(?:\u00e2u|au)|question)\s*\d{1,3}\s*[:.)-]?)/gi, '$1\n$2')
    .replace(/([^\n])\s*(\d{1,3}\s*[:.)-]\s+)/g, '$1\n$2')
    .replace(/([^\n])\s*(?:[-*•]\s*)?(\(?[A-D]\)?\s*[:.)-]\s+)/g, '$1\n$2')
    .replace(/([^\n])\s*((?:(?:\u0111(?:\u00e1|a)p\s*(?:\u00e1|a)n|dap\s*an|answer)\s*[:.)-]|d\/a\s*[:.)-]?|da\s*:))/gi, '$1\n$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n'))
    .trim();

const isAnswerMarkerLine = (line = '') => {
  const folded = foldText(line).trim();
  return /^(?:dap\s*an|answer)\b/.test(folded) || /^(d\/a|da\s*:)\b/.test(folded);
};

const isEssaySectionLine = (line = '') => {
  const folded = foldText(line).trim();
  return /^tu\s*luan\b/.test(folded) ||
    /^phan\s*(?:ii|2)\b/.test(folded) ||
    /^bai\s*\d+\b/.test(folded) ||
    /^tu\s*luan\s*\(/.test(folded);
};

const readPointValue = (text = '') => {
  const folded = foldText(text);
  const match = folded.match(/(?:\(|\b)(\d+(?:[,.]\d+)?)\s*diem(?:\)|\b)/);
  if (!match) return 0;
  const value = Number(String(match[1]).replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
};

const getMultipleChoiceTotalPoints = (text = '') => {
  const lines = prepareQuizTextForParsing(text).split('\n');
  for (const line of lines) {
    const folded = foldText(line);
    if (/trac\s*nghiem/.test(folded)) {
      const points = readPointValue(line);
      if (points > 0) return points;
    }
  }
  return 0;
};

export const inferMultipleChoiceTotalPoints = (source = '') => {
  const text = /<[^>]+>/.test(String(source || '')) ? stripHtmlToText(source) : source;
  return getMultipleChoiceTotalPoints(text);
};

const roundPoint = (value) => {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(rounded) ? rounded : Number(rounded.toFixed(2));
};

export const buildAnswerMap = (text = '') => {
  const answerMap = {};
  const answerLines = [];
  let inAnswerSection = false;

  prepareQuizTextForParsing(text).split('\n').forEach(line => {
    if (isAnswerMarkerLine(line)) {
      inAnswerSection = true;
      answerLines.push(line);
      return;
    }
    if (inAnswerSection) answerLines.push(line);
  });

  const answerText = foldText(answerLines.join('\n'));
  if (!answerText.trim()) return answerMap;

  const patterns = [
    /(?:cau|question)\s*(\d{1,3})\s*[:.)-]?\s*([a-d])\b/g,
    /(?:cau|question)\s*(\d{1,3})\s*(?:dap\s*an|answer)?\s*[:.)-]?\s*([a-d])\b/g,
    /\b(\d{1,3})\s*[-.)/:]?\s*([a-d])\b/g,
    /\b(\d{1,3})\s*(?:dap\s*an|answer)\s*[:.)-]?\s*([a-d])\b/g,
    /\b([a-d])\s*[-.)/:]?\s*(?:cau\s*)?(\d{1,3})\b/g
  ];

  patterns.forEach((pattern, patternIndex) => {
    let match;
    while ((match = pattern.exec(answerText)) !== null) {
      const isReversed = patternIndex === patterns.length - 1;
      const number = isReversed ? match[2] : match[1];
      const answer = isReversed ? match[1] : match[2];
      const key = String(Number(number));
      if (!answerMap[key]) answerMap[key] = answer;
    }
  });

  return answerMap;
};

const readQuestionLine = (line = '') => {
  const match = line.match(/^(?:(?:Câu|Cau|Question)\s*)?(\d{1,3})(?:\s*\(\s*\d+(?:[,.]\d+)?\s*(?:điểm|diem|đ|points?)\s*\))?\s*[:.)-]\s*/i);
  if (!match) return null;
  return {
    number: String(Number(match[1])),
    text: cleanGeneratedQuizText(line.slice(match[0].length))
  };
};

const readOptionLine = (line = '') => {
  const match = line.match(/^\s*(?:[-*•]\s*)?\(?([A-D])\)?\s*[:.)-]\s*(.*)$/i);
  if (!match) return null;
  const id = match[1].toLowerCase();
  if (!SELF_QUIZ_OPTION_IDS.includes(id)) return null;
  return { id, text: cleanGeneratedQuizText(match[2]) };
};

export const parseSelfQuizFromHtml = (html = '') => {
  const math = protectQuizMath(stripHtmlToText(html));
  const text = prepareQuizTextForParsing(math.source);
  const answerMap = buildAnswerMap(text);
  const questions = [];
  const parseIssues = [], questionNumbers = new Set();
  let currentQuestion = null;
  let currentOptionId = '';
  let inAnswerSection = false;
  let inEssaySection = false;

  const commitQuestion = () => {
    if (!currentQuestion) return;
    const hasEnoughOptions = currentQuestion.options.filter(option => option.text).length >= 2;
    if (normalizeQuizText(currentQuestion.text) && hasEnoughOptions) questions.push(currentQuestion);
    else parseIssues.push(`Câu ${currentQuestion.sourceNumber} chưa đủ nội dung hoặc phương án; không thể nhập đầy đủ.`);
  };

  text.split('\n').forEach(rawLine => {
    const line = cleanGeneratedQuizText(rawLine);
    if (!line) return;

    if (isAnswerMarkerLine(line)) {
      inAnswerSection = true;
      currentOptionId = '';
      return;
    }
    if (inAnswerSection || inEssaySection) return;

    if (isEssaySectionLine(line)) {
      commitQuestion();
      currentQuestion = null;
      currentOptionId = '';
      inEssaySection = true;
      return;
    }

    const questionLine = readQuestionLine(line);
    if (questionLine) {
      commitQuestion();
      if (questionNumbers.has(questionLine.number)) parseIssues.push(`Câu ${questionLine.number} bị lặp số thứ tự.`);
      questionNumbers.add(questionLine.number);
      currentQuestion = {
        id: makeId(`q${questionLine.number}`),
        sourceNumber: questionLine.number,
        text: questionLine.text,
        options: SELF_QUIZ_OPTION_IDS.map(id => ({ id, text: '' })),
        correctOptionId: answerMap[questionLine.number] || '',
        points: 1
      };
      currentOptionId = '';
      return;
    }

    const optionLine = readOptionLine(line);
    if (currentQuestion && optionLine) {
      if (currentQuestion.options.some(option => option.id === optionLine.id && option.text)) {
        parseIssues.push(`Câu ${currentQuestion.sourceNumber}, phương án ${optionLine.id.toUpperCase()} bị lặp nhãn; cần kiểm tra dữ liệu nhập.`);
      }
      currentQuestion.options = currentQuestion.options.map(option =>
        option.id === optionLine.id ? { ...option, text: optionLine.text } : option
      );
      currentOptionId = optionLine.id;
      return;
    }

    if (currentQuestion && currentOptionId) {
      currentQuestion.options = currentQuestion.options.map(option =>
        option.id === currentOptionId ? { ...option, text: cleanGeneratedQuizText(`${option.text} ${line}`) } : option
      );
      return;
    }

    if (currentQuestion) currentQuestion.text = cleanGeneratedQuizText(`${currentQuestion.text} ${line}`);
  });

  commitQuestion();

  questions.forEach(question => {
    question.text = normalizeMathText(math.restore(question.text));
    question.options.forEach(option => { option.text = normalizeMathText(math.restore(option.text)); });
    delete question.sourceNumber;
  });

  const multipleChoiceTotalPoints = getMultipleChoiceTotalPoints(text);
  if (multipleChoiceTotalPoints > 0 && questions.length > 0) {
    const pointPerQuestion = roundPoint(multipleChoiceTotalPoints / questions.length);
    questions.forEach(question => {
      question.points = pointPerQuestion;
    });
  }

  return {
    ...getDefaultSelfQuizDraft(),
    questions,
    ...(parseIssues.length ? { parseIssues } : {})
  };
};

export const extractEssayTextFromHtml = (html = '') => {
  const text = prepareQuizTextForParsing(stripHtmlToText(html));
  const lines = text.split('\n');
  const startIndex = lines.findIndex(line => isEssaySectionLine(line));
  if (startIndex < 0) return '';
  const endIndex = lines.findIndex((line, index) => index > startIndex && isAnswerMarkerLine(line));
  return normalizeQuizText(lines.slice(startIndex, endIndex >= 0 ? endIndex : lines.length).join('\n'));
};

export const shuffleArray = (items = []) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const normalizeSelfQuizDraft = (draft) => ({
  shuffleQuestions: !!draft.shuffleQuestions,
  shuffleOptions: !!draft.shuffleOptions,
  showScoreAfterSubmit: draft.showScoreAfterSubmit !== false,
  allowRetake: draft.allowRetake !== false,
  requirePassingScore: !!draft.requirePassingScore,
  passingPercent: Math.min(100, Math.max(0, Number(draft.passingPercent) || 0)),
  questionCountPerAttempt: Math.max(0, Number(draft.questionCountPerAttempt || draft.questionsPerAttempt || 0)),
  questionBank: Array.isArray(draft.questionBank) ? draft.questionBank.map((q, idx) => {
    const correctOptionId = String(q.correctOptionId || '').trim().toLowerCase();
    return {
      id: q.id || makeId(`qb${idx + 1}`),
      text: cleanGeneratedQuizText(q.text),
      options: SELF_QUIZ_OPTION_IDS.map(id => ({
        id,
        text: cleanGeneratedQuizText(q.options?.find(opt => String(opt.id || '').trim().toLowerCase() === id)?.text || '')
      })),
      correctOptionId: SELF_QUIZ_OPTION_IDS.includes(correctOptionId) ? correctOptionId : '',
      points: Math.max(0.25, Number(q.points) || 1)
    };
  }).filter(q => q.text && q.options.filter(opt => opt.text).length >= 2) : [],
  questions: (draft.questions || [])
    .map((q, idx) => {
      const correctOptionId = String(q.correctOptionId || '').trim().toLowerCase();
      return {
        id: q.id || makeId(`q${idx + 1}`),
        text: cleanGeneratedQuizText(q.text),
        options: SELF_QUIZ_OPTION_IDS.map(id => ({
          id,
          text: cleanGeneratedQuizText(q.options?.find(opt => String(opt.id || '').trim().toLowerCase() === id)?.text || '')
        })),
        correctOptionId: SELF_QUIZ_OPTION_IDS.includes(correctOptionId) ? correctOptionId : '',
        points: Math.max(0.25, Number(q.points) || 1)
      };
    })
    .filter(q => q.text && q.options.filter(opt => opt.text).length >= 2)
});

export const rebalanceSelfQuizPoints = (quizData, source = '') => {
  if (!quizData?.questions?.length) return quizData;
  const totalPoints = inferMultipleChoiceTotalPoints(source);
  if (totalPoints <= 0) return quizData;
  const pointPerQuestion = roundPoint(totalPoints / quizData.questions.length);
  return {
    ...quizData,
    questions: quizData.questions.map(question => ({
      ...question,
      points: pointPerQuestion
    }))
  };
};

export const buildSelfQuizQuestionsForStudent = (quizData) => {
  if (!quizData?.questions?.length) return [];
  const sourceQuestions = quizData.questions.map(q => ({
    ...q,
    text: cleanGeneratedQuizText(q.text),
    options: (q.options || []).map(opt => ({
      ...opt,
      text: cleanGeneratedQuizText(opt.text)
    }))
  }));
  const shuffledQuestions = quizData.shuffleQuestions !== false ? shuffleArray(sourceQuestions) : [...sourceQuestions];
  const questionLimit = Math.max(0, Number(quizData.questionCountPerAttempt || quizData.questionsPerAttempt || 0));
  const questions = questionLimit > 0 ? shuffledQuestions.slice(0, Math.min(questionLimit, shuffledQuestions.length)) : shuffledQuestions;
  return questions.map(q => ({
    ...q,
    displayOptions: quizData.shuffleOptions !== false
      ? shuffleArray((q.options || []).filter(opt => opt.text))
      : (q.options || []).filter(opt => opt.text)
  }));
};

export const quizPassingPercent = (value, fallback = 80) => {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
};

export const isQuickQuizResultPassing = (result, material) => {
  const percent = Number(result?.percent);
  return result?.percent != null && result.percent !== '' && Number.isFinite(percent)
    && percent >= quizPassingPercent(result.passingPercent ?? material?.quizData?.passingPercent);
};

export const gradeSelfQuizSubmission = ({ quizData, answersByQuestionId, quizId, studentName, grade, subject, lesson, schoolYear, userId }) => {
  const questionPoints = question => {
    if (question.points == null || question.points === '') return 1;
    const points = Number(question.points);
    return Number.isFinite(points) && points >= 0 ? points : 1;
  };
  const total = (quizData.questions || []).reduce((sum, q) => sum + questionPoints(q), 0);
  const answers = (quizData.questions || []).map(q => {
    const selectedOptionId = String(answersByQuestionId?.[q.id] || '');
    const isCorrect = !!selectedOptionId && selectedOptionId === q.correctOptionId
      && (q.options || []).some(option => option.id === selectedOptionId);
    const points = questionPoints(q);
    return {
      questionId: q.id,
      questionText: String(q.text || ''),
      selectedOptionId,
      correctOptionId: String(q.correctOptionId || ''),
      isCorrect,
      points,
      earned: isCorrect ? points : 0
    };
  });
  const score = answers.reduce((sum, answer) => sum + answer.earned, 0);
  return {
    quizId: String(quizId || ''),
    studentName: String(studentName || '').trim(),
    grade: String(grade || ''),
    subject: String(subject || ''),
    lesson: String(lesson || ''),
    schoolYear: String(schoolYear || ''),
    score,
    total,
    percent: total ? Math.round((score / total) * 100) : 0,
    answers,
    submittedAt: Date.now(),
    authorId: String(userId || '')
  };
};

export const filterQuizResultsForContext = (results, { quizId, schoolYear, grade, subject, lesson }) =>
  results
    .filter(result =>
      (quizId ? String(result.quizId || '') === String(quizId)
        : !result.quizId) && (
        String(result.schoolYear || '') === String(schoolYear) &&
        String(result.grade) === String(grade) &&
        String(result.subject) === String(subject) &&
        String(result.lesson) === String(lesson)
      )
    )
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
