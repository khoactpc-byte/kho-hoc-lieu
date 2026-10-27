import {quizMathParts} from './quizMath.js';

const symbols={notin:'∉',in:'∈',subseteq:'⊆',subset:'⊂',supseteq:'⊇',supset:'⊃',cup:'∪',cap:'∩',setminus:'∖',emptyset:'∅',varnothing:'∅',times:'×',cdot:'·',div:'÷',le:'≤',leq:'≤',ge:'≥',geq:'≥',ne:'≠',neq:'≠',approx:'≈',equiv:'≡',pm:'±',infty:'∞',to:'→',rightarrow:'→',Rightarrow:'⇒',Leftrightarrow:'⇔',angle:'∠',triangle:'△',parallel:'∥',perp:'⊥',alpha:'α',beta:'β',gamma:'γ',delta:'δ',Delta:'Δ',theta:'θ',pi:'π',omega:'ω',Omega:'Ω',lambda:'λ',sigma:'σ',ell:'ℓ'};
const sets={N:'ℕ',Z:'ℤ',Q:'ℚ',R:'ℝ',C:'ℂ',P:'ℙ'};
const superscripts=Object.fromEntries([...('0123456789+-=()ni')].map((char,i)=>[char,[...'⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ'][i]]));
const subscripts=Object.fromEntries([...('0123456789+-=()')].map((char,i)=>[char,[...'₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎'][i]]));
function groupAt(text,start){
  while(/\s/.test(text[start] || '') && start<text.length)start++;
  if(text[start]!=='{')return null;
  let depth=1;
  for(let i=start+1;i<text.length;i++){
    if(text[i]==='\\'){i++;continue;}
    if(text[i]==='{')depth++;
    if(text[i]==='}' && --depth===0)return {text:text.slice(start+1,i),end:i+1};
  }
  return null;
}
function simpleTex(text,depth=0){
  if(depth>12)return null;
  let value=text.replace(/\\(?:left|right)\s*\./g,'').replace(/\\(?:left|right)\b\s*/g,'');
  const command=/\\(dfrac|tfrac|frac|sqrt|mathbb|mathrm|mathbf|mathit|text)\b/g;
  let result='',end=0;
  for(let match; (match=command.exec(value));){
    if(match.index<end)continue;
    const first=groupAt(value,command.lastIndex);if(!first)return null;
    const left=simpleTex(first.text,depth+1);if(left==null)return null;
    let replacement=left,finish=first.end;
    if(/frac$/.test(match[1])){
      const second=groupAt(value,first.end);if(!second)return null;
      const right=simpleTex(second.text,depth+1);if(right==null)return null;
      // Inline a fraction only when its boundaries stay unambiguous. Keep mixed
      // numbers, implicit products and powers of fractions for the full renderer.
      if(/[A-Za-z0-9)}\]]\s*$/.test(value.slice(0,match.index)) || /^\s*(?:[A-Za-z0-9([_^]|\\(?:dfrac|tfrac|frac|sqrt|mathbb|mathrm|mathbf|mathit|text|pi|alpha|beta|theta)\b)/.test(value.slice(second.end)))return null;
      const atom=part=>/^(?:-?\d+(?:[.,]\d+)?|[A-Za-zα-ωΑ-Ω])$/.test(part)?part:`(${part})`;
      replacement=`${atom(left)}/${atom(right)}`;finish=second.end;
    }else if(match[1]==='sqrt')replacement=`√(${left})`;
    else if(match[1]==='mathbb'){if(!sets[left])return null;replacement=sets[left];}
    result+=value.slice(end,match.index)+replacement;end=finish;command.lastIndex=finish;
  }
  value=result+value.slice(end);
  value=value.replace(/\\not\s*\\in\b/g,' ∉ ').replace(/\\([A-Za-z]+)\b/g,(whole,name)=>symbols[name]?` ${symbols[name]} `:whole)
    .replace(/\\[,;:! ]/g,' ');
  value=value.replace(/([_^])\s*(?:\{([^{}]+)\}|([0-9ni+-]))/g,(whole,kind,braced,single)=>{
    const map=kind==='^'?superscripts:subscripts,part=braced ?? single;
    if(kind==='^' && part==='*')return '*';
    return [...part].every(char=>map[char])?[...part].map(char=>map[char]).join(''):whole;
  });
  if(/(?<!\\)[{}]/.test(value))return null;
  value=value.replace(/\\([{}%])/g,'$1');
  return /[\\_^]/.test(value)?null:value.replace(/[ \t]+/g,' ').trim();
}

// Only replace complete, understood formulas. Complex TeX stays intact for the math renderer.
export function readableEssayMath(value=''){
  return String(value).replace(quizMathParts,(part,offset,source)=>{
    if(part.startsWith('$') && /^\d/.test(source.slice(offset+part.length)))return part;
    const body=part.startsWith('$$')||part.startsWith('\\(')||part.startsWith('\\[')?part.slice(2,-2):part.slice(1,-1);
    if(!/[\\=+*/^_{}<>∈∉≤≥]/.test(body) && /[A-Za-zÀ-ỹ]{2,}/.test(body) && !/^[IVXLCDM]+$/.test(body.trim()))return part;
    return simpleTex(body) ?? part;
  });
}
