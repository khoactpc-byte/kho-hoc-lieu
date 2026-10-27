import { quizMathParts, mapOutsideQuizMath } from './quizMath.js';

const danglingOperation = (value, allowTrailingEquality) => /[\p{L}\p{N}]/u.test(value) && /[=+\-−×÷^_]\s*$/.test(value)
  && !/\^[+-]\s*$/.test(value) && !(allowTrailingEquality && /=\s*$/.test(value));

// Structural checks catch damaged imports, not mathematical/subject correctness.
export function formulaIssues(value = '', { allowTrailingEquality = false } = {}) {
  const text = String(value ?? ''), issues = [];
  // JSON can decode an under-escaped TeX command (\begin, \frac, \text...) as a control character.
  if ([...text].some(char => char.charCodeAt(0) < 32 && char !== '\n') || /\n(?:abla|eq|ot|otin|exists|parallel|mid|u)\b/.test(text)) issues.push('Dấu gạch chéo LaTeX bị lỗi escape JSON hoặc chứa ký tự điều khiển.');
  let open = '';
  for (const match of text.matchAll(/(?<!\\)\\[()[\]]|(?<![\\$])\$\$|(?<![\\$])\$(?!\$)/g)) {
    const token = match[0];
    if (token === '$' || token === '$$') {
      if (!open) open = token;
      else if (open === token) open = '';
      else issues.push('Dấu bao công thức bị lồng hoặc không khớp.');
    } else if (token === '\\(' || token === '\\[') {
      if (open) issues.push('Dấu mở công thức bị lồng nhau.');
      open = token;
    } else {
      if (open !== (token === '\\)' ? '\\(' : '\\[')) issues.push('Dấu đóng công thức không có dấu mở tương ứng.');
      open = '';
    }
  }
  if (open) issues.push('Công thức thiếu dấu đóng LaTeX, có thể đã bị cắt cụt.');
  mapOutsideQuizMath(text, prose => {
    if (/\\(?:[dt]?frac|sqrt|mathrm|text|begin|end|ce)\b/.test(prose)) issues.push('Lệnh công thức nằm ngoài dấu bao LaTeX.');
    return prose;
  });
  for (const match of text.matchAll(quizMathParts)) {
    const part = match[0], width = part.startsWith('$$') || part.startsWith('\\') ? 2 : 1;
    const body = part.slice(width, -width).trim();
    if (!body) issues.push('Công thức rỗng.');
    // MathJax accepts \/ as italic spacing, so a damaged command such as
    // \/in silently renders as slash + letters instead of a relation symbol.
    if (/\\\/(?:in|notin|leq?|geq?|neq?)\b/.test(body)) issues.push('Ký hiệu quan hệ bị viết sai lệnh LaTeX. Dùng ký hiệu ∈, ∉, ≤, ≥, ≠ hoặc lệnh LaTeX đúng.');
    let depth = 0;
    for (const brace of body.matchAll(/\\[\s\S]|[{}]/g)) {
      if (brace[0].startsWith('\\')) continue;
      depth += brace[0] === '{' ? 1 : -1;
      if (depth < 0) break;
    }
    if (depth !== 0) issues.push('Công thức thiếu hoặc thừa ngoặc nhọn { }.');
    const environments = [];
    for (const env of body.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
      if (env[1] === 'begin') environments.push(env[2]);
      else if (environments.pop() !== env[2]) issues.push('Khối công thức begin/end không khớp.');
    }
    if (environments.length) issues.push('Khối công thức thiếu end.');
    if (/\\(?:frac|dfrac|tfrac)\s*\{[^{}]*\}\s*$|\\(?:sqrt|frac|dfrac|tfrac)\s*$/.test(body)) issues.push('Phân số hoặc căn thức chưa đầy đủ.');
    if (danglingOperation(body, allowTrailingEquality)) issues.push('Công thức kết thúc bằng phép toán, có thể thiếu dữ liệu.');
  }
  const visible = text.replace(quizMathParts, part => part.slice(part.startsWith('$') && !part.startsWith('$$') ? 1 : 2, part.startsWith('$') && !part.startsWith('$$') ? -1 : -2));
  if (!text.trim() || /^[\\\s()[\]{}$.,:;=]+$/.test(visible)) issues.push('Nội dung rỗng hoặc chỉ còn ký hiệu rời.');
  if (danglingOperation(visible.trim(), allowTrailingEquality)) issues.push('Nội dung kết thúc bằng phép toán, có thể đã bị cắt cụt.');
  return [...new Set(issues)];
}

export function quizQualityIssues(quiz = {}) {
  const issues = [...(quiz.parseIssues || [])];
  for (const [index, question] of (quiz.questions || []).entries()) {
    const label = `Câu ${index + 1}`;
    // A stem may legitimately ask students to complete “2 + 3 =”.
    formulaIssues(question.text, { allowTrailingEquality: true }).forEach(issue => issues.push(`${label}: ${issue}`));
    const seen = new Map();
    for (const option of (question.options || []).filter(option => String(option.text || '').trim())) {
      const optionLabel = String(option.id).toUpperCase();
      formulaIssues(option.text).forEach(issue => issues.push(`${label}, phương án ${optionLabel}: ${issue}`));
      const key = String(option.text).replace(/\\[()[\]]|\$/g, '').replace(/\s+/g, '').normalize('NFC');
      if (seen.has(key)) issues.push(`${label}: phương án ${seen.get(key)} và ${optionLabel} trùng nội dung.`);
      seen.set(key, optionLabel);
    }
  }
  for (const [index, question] of (quiz.essayQuestions || []).entries()) {
    formulaIssues(question.text, { allowTrailingEquality: true }).forEach(issue => issues.push(`Bài tự luận ${index + 1}: ${issue}`));
  }
  return [...new Set(issues)];
}

export const QUIZ_FORMULA_PROMPT = String.raw`QUY TẮC CÔNG THỨC VÀ TỰ KIỂM TRA (Toán, Vật lý, Hóa học, Sinh học, Khoa học tự nhiên):
- Mỗi câu bắt đầu ở dòng riêng: Câu 1. ...; mỗi phương án ở dòng riêng A. ..., B. ..., C. ..., D. ...; không dùng bảng, input, label hay khối mã Markdown.
- Giữ nguyên toàn bộ công thức trong một phương án. Dùng LaTeX \( ... \) trong dòng hoặc \[ ... \] riêng dòng; dùng một dấu gạch chéo cho lệnh, đủ cặp dấu bao và ngoặc nhọn. Ví dụ: A. \(a + b = b + a\).
- Phân số dùng \frac{a}{b}, số mũ x^{2}, chỉ số dưới H_{2}O; đơn vị dùng \mathrm{m/s^{2}}. Công thức hóa học dùng lệnh chuẩn như \mathrm{H}_{2}\mathrm{O}; không dùng \ce hay gói LaTeX bổ sung.
- Tự giải lại từng câu, thay kết quả vào đề và đối chiếu khóa đáp án: đúng duy nhất một phương án, các phương án khác nhau, đủ dữ kiện, điều kiện xác định và đơn vị; với phản ứng hóa học phải kiểm tra cân bằng và điện tích.
- Không đoán số liệu hoặc công thức bị thiếu/không đọc rõ trong nguồn. Nếu thiếu dữ kiện, báo rõ để giáo viên bổ sung thay vì tạo câu hỏi không làm được.
- Trước khi trả kết quả, kiểm tra đủ số câu, đủ A/B/C/D, công thức không bị cắt, số thứ tự đáp án khớp câu. Kết thúc trọn vẹn câu và phần đáp án; không dùng dấu ... thay cho dữ liệu.`;

export function aiCompletionIssue(data) {
  const candidates = data?.candidates || data?.result?.candidates || data?.data?.candidates || data?.response?.candidates || [];
  const incomplete = candidates.find(candidate => candidate.finishReason && candidate.finishReason !== 'STOP');
  return incomplete ? `AI chưa hoàn tất câu hỏi (${incomplete.finishReason}). Thầy cô giảm số câu hoặc tạo lại để tránh đề bị cắt cụt.` : '';
}

export const renderedQuizMathIssue = root => root?.querySelector?.('mjx-merror, [data-mjx-error]')
  ? 'Có công thức không hiển thị được. Thầy cô sửa công thức trong ô chỉnh sửa hoặc tạo lại trước khi lưu.' : '';
