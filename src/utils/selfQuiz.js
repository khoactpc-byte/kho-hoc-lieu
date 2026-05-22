export const SELF_QUIZ_OPTION_IDS = ['a', 'b', 'c', 'd'];

export const makeId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const normalizeQuizText = (text = '') =>
  String(text || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\\\\/g, '\\')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const getDefaultSelfQuizDraft = () => ({
  questions: [],
  shuffleQuestions: true,
  shuffleOptions: true,
  showScoreAfterSubmit: true,
  allowRetake: true
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
  const source = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n');
  if (typeof document === 'undefined') return source.replace(/<[^>]+>/g, ' ').trim();
  const tmp = document.createElement('div');
  tmp.innerHTML = source;
  return (tmp.innerText || tmp.textContent || '').trim();
};

const prepareQuizTextForParsing = (text = '') =>
  String(text || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/([^\n])\s*((?:c(?:\u00e2u|au)|question)\s*\d{1,3}\s*[:.)-]?)/gi, '$1\n$2')
    .replace(/([^\n])\s*([A-D])\s*[.)]\s+/g, '$1\n$2. ')
    .replace(/([^\n])\s*((?:(?:\u0111(?:\u00e1|a)p\s*(?:\u00e1|a)n|dap\s*an|answer)\s*[:.)-]|d\/a\s*[:.)-]?|da\s*:))/gi, '$1\n$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
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
    /\b(\d{1,3})\s*[-.)/:]?\s*([a-d])\b/g,
    /\b([a-d])\s*[-.)/:]?\s*(?:cau\s*)?(\d{1,3})\b/g
  ];

  patterns.forEach((pattern, patternIndex) => {
    let match;
    while ((match = pattern.exec(answerText)) !== null) {
      const number = patternIndex === 2 ? match[2] : match[1];
      const answer = patternIndex === 2 ? match[1] : match[2];
      const key = String(Number(number));
      if (!answerMap[key]) answerMap[key] = answer;
    }
  });

  return answerMap;
};

const readQuestionLine = (line = '') => {
  const match = foldText(line).match(/^(?:cau|question)\s*(\d{1,3})\s*[:.)-]?\s*/);
  if (!match) return null;
  const prefix = line.match(/^\S+\s*\d{1,3}\s*[:.)-]?\s*/)?.[0] || '';
  return {
    number: String(Number(match[1])),
    text: normalizeQuizText(line.slice(prefix.length))
  };
};

const readOptionLine = (line = '') => {
  const match = line.match(/^([A-D])\s*[.)]\s*(.*)$/);
  if (!match) return null;
  const id = match[1].toLowerCase();
  if (!SELF_QUIZ_OPTION_IDS.includes(id)) return null;
  return { id, text: normalizeQuizText(match[2]) };
};

export const parseSelfQuizFromHtml = (html = '') => {
  const text = prepareQuizTextForParsing(stripHtmlToText(html));
  const answerMap = buildAnswerMap(text);
  const questions = [];
  let currentQuestion = null;
  let currentOptionId = '';
  let inAnswerSection = false;

  const commitQuestion = () => {
    if (!currentQuestion) return;
    const hasEnoughOptions = currentQuestion.options.filter(option => option.text).length >= 2;
    if (normalizeQuizText(currentQuestion.text) && hasEnoughOptions) questions.push(currentQuestion);
  };

  text.split('\n').forEach(rawLine => {
    const line = normalizeQuizText(rawLine);
    if (!line) return;

    if (isAnswerMarkerLine(line)) {
      inAnswerSection = true;
      currentOptionId = '';
      return;
    }
    if (inAnswerSection) return;

    if (currentQuestion && isEssaySectionLine(line)) {
      commitQuestion();
      currentQuestion = null;
      currentOptionId = '';
      return;
    }

    const questionLine = readQuestionLine(line);
    if (questionLine) {
      commitQuestion();
      currentQuestion = {
        id: makeId(`q${questionLine.number}`),
        text: questionLine.text || `Cau ${questionLine.number}`,
        options: SELF_QUIZ_OPTION_IDS.map(id => ({ id, text: '' })),
        correctOptionId: answerMap[questionLine.number] || '',
        points: 1
      };
      currentOptionId = '';
      return;
    }

    const optionLine = readOptionLine(line);
    if (currentQuestion && optionLine) {
      currentQuestion.options = currentQuestion.options.map(option =>
        option.id === optionLine.id ? { ...option, text: optionLine.text } : option
      );
      currentOptionId = optionLine.id;
      return;
    }

    if (currentQuestion && currentOptionId) {
      currentQuestion.options = currentQuestion.options.map(option =>
        option.id === currentOptionId ? { ...option, text: normalizeQuizText(`${option.text} ${line}`) } : option
      );
      return;
    }

    if (currentQuestion) currentQuestion.text = normalizeQuizText(`${currentQuestion.text} ${line}`);
  });

  commitQuestion();

  const multipleChoiceTotalPoints = getMultipleChoiceTotalPoints(text);
  if (multipleChoiceTotalPoints > 0 && questions.length > 0) {
    const pointPerQuestion = roundPoint(multipleChoiceTotalPoints / questions.length);
    questions.forEach(question => {
      question.points = pointPerQuestion;
    });
  }

  return {
    ...getDefaultSelfQuizDraft(),
    questions
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
  questions: (draft.questions || [])
    .map((q, idx) => {
      const correctOptionId = String(q.correctOptionId || '').trim().toLowerCase();
      return {
        id: q.id || makeId(`q${idx + 1}`),
        text: normalizeQuizText(q.text),
        options: SELF_QUIZ_OPTION_IDS.map(id => ({
          id,
          text: normalizeQuizText(q.options?.find(opt => String(opt.id || '').trim().toLowerCase() === id)?.text || '')
        })),
        correctOptionId: SELF_QUIZ_OPTION_IDS.includes(correctOptionId) ? correctOptionId : '',
        points: Math.max(0.25, Number(q.points) || 1)
      };
    })
    .filter(q => q.text && q.options.filter(opt => opt.text).length >= 2)
});

export const buildSelfQuizQuestionsForStudent = (quizData) => {
  if (!quizData?.questions?.length) return [];
  const questions = quizData.shuffleQuestions ? shuffleArray(quizData.questions) : [...quizData.questions];
  return questions.map(q => ({
    ...q,
    displayOptions: quizData.shuffleOptions
      ? shuffleArray((q.options || []).filter(opt => opt.text))
      : (q.options || []).filter(opt => opt.text)
  }));
};

export const gradeSelfQuizSubmission = ({ quizData, answersByQuestionId, quizId, studentName, grade, subject, lesson, schoolYear, userId }) => {
  const total = (quizData.questions || []).reduce((sum, q) => sum + (Number(q.points) || 1), 0);
  const answers = (quizData.questions || []).map(q => {
    const selectedOptionId = answersByQuestionId[q.id];
    const isCorrect = selectedOptionId === q.correctOptionId;
    const points = Number(q.points) || 1;
    return {
      questionId: q.id,
      questionText: q.text,
      selectedOptionId,
      correctOptionId: q.correctOptionId,
      isCorrect,
      points,
      earned: isCorrect ? points : 0
    };
  });
  const score = answers.reduce((sum, answer) => sum + answer.earned, 0);
  return {
    quizId,
    studentName: studentName.trim(),
    grade: String(grade),
    subject: String(subject),
    lesson: String(lesson),
    schoolYear,
    score,
    total,
    percent: total ? Math.round((score / total) * 100) : 0,
    answers,
    submittedAt: Date.now(),
    authorId: userId
  };
};

export const filterQuizResultsForContext = (results, { quizId, schoolYear, grade, subject, lesson }) =>
  results
    .filter(result =>
      String(result.quizId || '') === String(quizId || '') ||
      (
        String(result.schoolYear || '') === String(schoolYear) &&
        String(result.grade) === String(grade) &&
        String(result.subject) === String(subject) &&
        String(result.lesson) === String(lesson)
      )
    )
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
