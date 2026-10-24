import { quizMathParts } from './quizMath.js';

// Only inspect the outer formula: relation signs in fractions, exponents,
// text, matrices and complete systems belong to their own expression.
function outerTokens(source) {
  const tokens=[];let braces=0,environments=0;
  for(let i=0;i<source.length;i++) {
    const environment=/^\\(begin|end)\{[^{}]+\}/.exec(source.slice(i));
    if(environment){environments+=environment[1]==='begin'?1:-1;i+=environment[0].length-1;continue;}
    if(source[i]==='\\'&&/[{}&]/.test(source[i+1]||'')){i++;continue;}
    if(source[i]==='{'){braces++;continue;}
    if(source[i]==='}'){braces--;continue;}
    const token=/^(?:\\\\|\\[A-Za-z]+)/.exec(source.slice(i))?.[0]||source[i];
    if(!braces&&!environments)tokens.push({index:i,value:token});
    i+=token.length-1;
  }
  return tokens;
}

const relationGlyphs={'=':'3D','<':'3C','>':'3E','≤':'2264','≥':'2265','≠':'2260','≈':'2248','\\le':'2264','\\leq':'2264','\\ge':'2265','\\geq':'2265','\\ne':'2260','\\neq':'2260','\\approx':'2248'};
const relationIn = source => outerTokens(source).find(token=>Object.hasOwn(relationGlyphs,token.value));
const bodyOf = math => math.slice(math.startsWith('$')&&!math.startsWith('$$')?1:2,math.startsWith('$')&&!math.startsWith('$$')?-1:-2).trim();

export function alignLessonMathSource(math) {
  const body=bodyOf(math);
  const outer=/^\\begin\{(aligned|align\*?|gathered|gather\*?)\}([\s\S]*)\\end\{\1\}$/.exec(body);
  const source=outer?outer[2]:body,tokens=outerTokens(source),rows=[];
  let start=0;
  for(const token of tokens) {
    const rowBreak=outer&&token.value==='\\\\';
    const arrow=!outer&&['\\Leftrightarrow','\\Rightarrow','⇔','⇒'].includes(token.value);
    if(!rowBreak&&!arrow)continue;
    if(source.slice(start,token.index).trim())rows.push(source.slice(start,token.index));
    start=token.index+(rowBreak?token.value.length:0);
    if(rowBreak) {
      const spacing=/^\s*\[(?:[\d.]+)(?:pt|em|ex)\]/.exec(source.slice(start));
      // Preserve deliberately spaced layouts instead of changing their meaning.
      if(spacing)return math;
    }
  }
  if(source.slice(start).trim())rows.push(source.slice(start));
  if(rows.length<2)return math;
  const aligned=[];let alreadyAligned=!!outer;
  for(const row of rows) {
    const amps=outerTokens(row).filter(token=>token.value==='&');
    if(amps.length>1)return math; // Multiple equation columns have an intentional layout.
    const originalRelation=relationIn(row);
    if(!amps.length||!originalRelation||amps[0].index>originalRelation.index||row.slice(amps[0].index+1,originalRelation.index).trim())alreadyAligned=false;
    const plain=(amps.length?row.slice(0,amps[0].index)+row.slice(amps[0].index+1):row).trim();
    const relation=relationIn(plain);
    if(!relation)return math; // In particular, never flatten a complete system.
    aligned.push(`${plain.slice(0,relation.index).trimEnd()}&${plain.slice(relation.index).trimStart()}`);
  }
  if(alreadyAligned)return math;
  const size=math.startsWith('$')&&!math.startsWith('$$')?1:2;
  return `${math.slice(0,size)}\\begin{aligned}${aligned.join('\\\\')}\\end{aligned}${math.slice(-size)}`;
}

export function prepareLessonMathAlignment(root) {
  const document=root.ownerDocument,walker=document.createTreeWalker(root,document.defaultView.NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode())if(!walker.currentNode.parentElement.closest('pre,code,textarea,input,svg,math,mjx-container'))nodes.push(walker.currentNode);
  for(const node of nodes)node.nodeValue=node.nodeValue.replace(quizMathParts,alignLessonMathSource);
  for(const step of root.querySelectorAll('.lesson-math-step')) {
    const math=[...step.textContent.matchAll(quizMathParts)][0]?.[0];
    if(!math)continue;
    const relation=relationIn(bodyOf(math));
    if(relation)step.dataset.lessonAlignRelation=relationGlyphs[relation.value];
  }
}

// Selectable steps are separate MathJax formulas. Measure their actual relation
// glyphs so they line up without merging click targets or guessing text widths.
export function alignRenderedLessonSteps(root) {
  const groups=new Map();
  for(const step of root.querySelectorAll('.lesson-math-step')) {
    step.style.removeProperty('--lesson-relation-offset');
    const wrapper=step.closest('.lesson-math-steps');
    if(!wrapper)continue;
    const key=wrapper.dataset.lessonStepChain||wrapper;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(step);
  }
  for(const steps of groups.values()) {
    const measures=[];
    for(const step of steps) {
      if(!step.dataset.lessonAlignRelation)continue;
      const glyph=[...step.querySelectorAll(`mjx-math mjx-mo > mjx-c.mjx-c${step.dataset.lessonAlignRelation}`)]
        .find(node=>!node.closest('mjx-mfrac,mjx-msup,mjx-msub,mjx-msubsup,mjx-mtable,mjx-munder,mjx-mover,mjx-munderover'));
      const box=step.getBoundingClientRect(),sign=glyph?.getBoundingClientRect();
      if(box.width&&sign?.width)measures.push({step,left:sign.left-box.left});
    }
    if(measures.length<2)continue;
    const target=Math.max(...measures.map(item=>item.left));
    for(const item of measures)item.step.style.setProperty('--lesson-relation-offset',`${Math.max(0,target-item.left).toFixed(3)}px`);
  }
}
