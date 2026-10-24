const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const elements = node => [...node.children].filter(child => !/Pr$/.test(child.localName));
const child = (node, name) => [...node.children].find(item => item.localName === name);
const value = (node, name, fallback = '') => {
  const property = [...node.children].find(item => item.localName === `${node.localName}Pr`);
  return child(property || node, name)?.getAttributeNS(MATH_NS, 'val') ?? fallback;
};
const escapeMath = text => String(text).replace(/[\\{}#$%&_]/g, char => char === '\\' ? '\\backslash ' : `\\${char}`);
const delimiter = text => ({ '{': '\\{', '}': '\\}', '': '.', '‖': '\\Vert', '⟨': '\\langle', '⟩': '\\rangle' }[text] ?? text);

export function wordMathToLatex(node) {
  const children = () => elements(node).map(wordMathToLatex).join('');
  const part = name => child(node, name) ? wordMathToLatex(child(node, name)) : '';
  switch (node.localName) {
    case 'oMath': case 'oMathPara': case 'r': case 'e': case 'num': case 'den': case 'sub': case 'sup':
    case 'deg': case 'fName': case 'lim': case 'box': case 'ctrlPr': return children();
    case 't': return escapeMath(node.textContent);
    case 'f': return `\\frac{${part('num')}}{${part('den')}}`;
    case 'rad': return `\\sqrt${part('deg') ? `[${part('deg')}]` : ''}{${part('e')}}`;
    case 'sSup': return `{${part('e')}}^{${part('sup')}}`;
    case 'sSub': return `{${part('e')}}_{${part('sub')}}`;
    case 'sSubSup': return `{${part('e')}}_{${part('sub')}}^{${part('sup')}}`;
    case 'sPre': return `{}_{${part('sub')}}^{${part('sup')}}{${part('e')}}`;
    case 'd': return `\\left${delimiter(value(node, 'begChr', '('))}${elements(node).filter(item => item.localName === 'e').map(wordMathToLatex).join(delimiter(value(node, 'sepChr', '|')))}\\right${delimiter(value(node, 'endChr', ')'))}`;
    case 'eqArr': return `\\begin{aligned}${elements(node).map(wordMathToLatex).join('\\\\')}\\end{aligned}`;
    case 'm': return `\\begin{matrix}${elements(node).map(wordMathToLatex).join('\\\\')}\\end{matrix}`;
    case 'mr': return elements(node).map(wordMathToLatex).join('&');
    case 'nary': {
      const symbol = value(node, 'chr', '∫');
      const operator = { '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '⋃': '\\bigcup', '⋂': '\\bigcap' }[symbol];
      if (!operator) throw new Error('Có ký hiệu toán Word chưa chuyển được. Xuất tài liệu sang PDF để giữ nguyên công thức này.');
      return `${operator}${part('sub') ? `_{${part('sub')}}` : ''}${part('sup') ? `^{${part('sup')}}` : ''}{${part('e')}}`;
    }
    case 'func': return `\\operatorname{${part('fName')}}{${part('e')}}`;
    case 'limLow': return `\\underset{${part('lim')}}{${part('e')}}`;
    case 'limUpp': return `\\overset{${part('lim')}}{${part('e')}}`;
    case 'bar': return `\\${value(node, 'pos') === 'bot' ? 'underline' : 'overline'}{${part('e')}}`;
    case 'acc': {
      const accent = { '̂': 'widehat', 'ˆ': 'widehat', '̅': 'overline', '¯': 'overline', '⃗': 'vec', '→': 'overrightarrow', '̃': 'widetilde', '̇': 'dot', '̈': 'ddot', '̆': 'breve', '̌': 'check' }[value(node, 'chr', '̂')];
      if (!accent) throw new Error('Dấu trên công thức Word chưa được hỗ trợ. Xuất sang PDF để giữ nguyên công thức.');
      return `\\${accent}{${part('e')}}`;
    }
    default:
      if (/Pr$/.test(node.localName)) return '';
      throw new Error(`Chưa chuyển được cấu trúc công thức Word (${node.localName}). Xuất sang PDF để giữ nguyên công thức.`);
  }
}

export function replaceWordMath(document) {
  const paragraphs = [...document.getElementsByTagNameNS(MATH_NS, 'oMathPara')];
  const inline = [...document.getElementsByTagNameNS(MATH_NS, 'oMath')].filter(node => !paragraphs.some(parent => parent.contains(node)));
  for (const node of [...paragraphs, ...inline]) {
    const tex = wordMathToLatex(node);
    if (!tex.trim()) throw new Error('Có công thức Word rỗng hoặc không đọc được. Chưa nhập tài liệu.');
    const run = document.createElementNS(WORD_NS, 'w:r'), text = document.createElementNS(WORD_NS, 'w:t');
    text.textContent = node.localName === 'oMathPara' ? `\\[${tex}\\]` : `\\(${tex}\\)`;
    run.append(text); node.replaceWith(run);
  }
  return paragraphs.length + inline.length;
}
