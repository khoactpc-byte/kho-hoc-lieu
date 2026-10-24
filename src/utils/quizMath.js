// Keep complete TeX spans opaque to HTML conversion and question/option parsing.
export const quizMathParts = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|(?<![\\$])\$[^\n$]+?\$(?!\$)/g;

export function mapOutsideQuizMath(value, convert) {
  const text = String(value ?? '');
  let end = 0, result = '';
  for (const match of text.matchAll(quizMathParts)) {
    result += convert(text.slice(end, match.index)) + match[0];
    end = match.index + match[0].length;
  }
  return result + convert(text.slice(end));
}

export function protectQuizMath(value) {
  const text = String(value ?? ''), parts = [];
  let prefix = '\uE000KHL_MATH_';
  while (text.includes(prefix)) prefix += '_';
  const source = text.replace(quizMathParts, part => {
    const marker = `${prefix}${parts.length}\uE001`;
    parts.push(part);
    return marker;
  });
  const markers = new RegExp(`${prefix}(\\d+)\uE001`, 'g');
  return { source, restore: (value, convert = part => part) => String(value).replace(markers, (_, index) => convert(parts[Number(index)])) };
}
