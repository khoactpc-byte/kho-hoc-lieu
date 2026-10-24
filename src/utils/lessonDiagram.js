import { escapeHtmlText as esc } from './safeHtml.js';

export const LESSON_DIAGRAM_SCHEMA = `diagram là một trong các kiểu sau, chỉ dùng dữ kiện có căn cứ trong đoạn bài:
- {"type":"geometry","caption":"Chú thích","points":[{"id":"A","x":0,"y":0,"label":"A"}],"segments":[{"from":"A","to":"B"}],"polygons":[["A","B","C"]],"circles":[{"center":"O","radius":2}],"labels":[{"x":1,"y":2,"text":"AB = 3 cm"}]}. Tọa độ có cùng tỉ lệ hai trục. Tự tính tọa độ phù hợp các độ dài, góc được cho; không bịa thêm số đo. Nhãn dùng chữ thường/Unicode, không dùng LaTeX trong hình.
- {"type":"graph","caption":"...","xMin":-5,"xMax":5,"yMin":-5,"yMax":5,"curves":[{"coefficients":[1,2],"label":"y = 2x + 1"}],"points":[{"x":0,"y":1,"label":"A"}]}. coefficients theo thứ tự [hệ số tự do, hệ số x, hệ số x², hệ số x³], tối đa bậc 3. Không dùng công thức JavaScript hay URL. Chỉ vẽ hàm/điểm đúng trong bài.
- {"type":"numberline","caption":"...","min":-5,"max":8,"intervals":[{"from":3,"to":null,"includeFrom":false,"includeTo":false,"label":"x > 3"}],"marks":[{"value":3,"label":"3"}]}. null là đầu kéo dài vô cực, chọn biên min/max bao hết các mốc hữu hạn. Phân biệt chấm tròn rỗng/đặc của bất đẳng thức nghiêm/nghiệm có dấu bằng.
- {"type":"flow","caption":"...","steps":["Cộng 6 vào hai vế","2x > 6","Chia hai vế cho 2 > 0","x > 3"]}. Từ 2 đến 8 bước, mỗi bước ngắn; dùng ký hiệu Unicode.
Nếu không đủ dữ kiện để vẽ đúng, trả diagram:null và ghi dữ kiện cần bổ sung trong warnings. Không trả SVG/HTML ảnh/URL/base64.`;

const number = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6) throw new Error(`Hình minh họa thiếu ${label} hợp lệ.`);
  return value;
};
const list = (value, limit = 50) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > limit) throw new Error('Hình minh họa có quá nhiều chi tiết hoặc sai cấu trúc.');
  return value;
};
const label = (value, max = 100) => esc(String(value ?? '').slice(0, max));
const n = value => Number(value.toFixed(3));
const colors = ['#1d4ed8','#b91c1c','#047857','#7c3aed'];
const line = (x1,y1,x2,y2,attrs = '') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${attrs}/>`;
const text = (x,y,value,attrs = '') => `<text x="${n(x)}" y="${n(y)}" ${attrs}>${label(value)}</text>`;
const circle = (x,y,r,attrs = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" ${attrs}/>`;
const ticks = (min, max, maxCount = 10) => {
  const rough = (max-min)/maxCount, magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1,2,5,10].map(value=>value*magnitude).find(value=>value>=rough);
  const values = [];
  for (let value = Math.ceil(min/step)*step; value <= max + step/1000 && values.length < maxCount+2; value += step) values.push(n(value));
  return values;
};
const bounds = (min,max) => {
  min = number(min,'biên dưới'); max = number(max,'biên trên');
  if (max <= min || max-min < .0001) throw new Error('Khoảng trục của hình minh họa không hợp lệ.');
  return [min,max];
};

function geometry(data) {
  const points = list(data.points), named = new Map();
  for (const point of points) {
    const id = String(point.id || '').slice(0,30);
    if (!id || named.has(id)) throw new Error('Tên điểm trong hình bị thiếu hoặc trùng.');
    named.set(id,{ ...point,x:number(point.x,'hoành độ'),y:number(point.y,'tung độ') });
  }
  if (!named.size) throw new Error('Hình hình học chưa có điểm.');
  const get = id => { const p = named.get(String(id)); if (!p) throw new Error(`Hình chưa có điểm ${String(id).slice(0,30)}.`); return p; };
  const circles = list(data.circles,12).map(c=>({ center:get(c.center),radius:number(c.radius,'bán kính') }));
  if (circles.some(c=>c.radius<=0)) throw new Error('Bán kính phải lớn hơn 0.');
  const labels = list(data.labels,30).map(p=>({ ...p,x:number(p.x,'vị trí nhãn'),y:number(p.y,'vị trí nhãn') }));
  const all = [...named.values(),...labels,...circles.flatMap(c=>[{x:c.center.x-c.radius,y:c.center.y-c.radius},{x:c.center.x+c.radius,y:c.center.y+c.radius}])];
  const xs=all.map(p=>p.x),ys=all.map(p=>p.y),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const scale=Math.min(580/Math.max(xmax-xmin,1),290/Math.max(ymax-ymin,1));
  const px=x=>360+(x-(xmin+xmax)/2)*scale,py=y=>205-(y-(ymin+ymax)/2)*scale;
  let result='';
  for (const polygon of list(data.polygons,12)) {
    if (!Array.isArray(polygon) || polygon.length<3 || polygon.length>20) throw new Error('Đa giác chưa đủ đỉnh hợp lệ.');
    result+=`<polygon points="${polygon.map(id=>{const p=get(id);return `${n(px(p.x))},${n(py(p.y))}`;}).join(' ')}" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2.5"/>`;
  }
  for (const segment of list(data.segments,50)) { const a=get(segment.from),b=get(segment.to); result+=line(px(a.x),py(a.y),px(b.x),py(b.y),'stroke="#1d4ed8" stroke-width="2.5"'); }
  for (const c of circles) result+=circle(px(c.center.x),py(c.center.y),c.radius*scale,'fill="none" stroke="#1d4ed8" stroke-width="2.5"');
  for (const p of named.values()) result+=circle(px(p.x),py(p.y),3.5,'fill="#0f172a"')+text(px(p.x)+9,py(p.y)-10,p.label||p.id,'font-weight="700"');
  for (const p of labels) result+=text(px(p.x),py(p.y),p.text,'text-anchor="middle" font-size="16" fill="#334155"');
  return { body:result,height:420 };
}

function graph(data) {
  const [xmin,xmax]=bounds(data.xMin,data.xMax),[ymin,ymax]=bounds(data.yMin,data.yMax);
  const px=x=>65+(x-xmin)/(xmax-xmin)*590,py=y=>345-(y-ymin)/(ymax-ymin)*290;
  const x0=Math.min(xmax,Math.max(xmin,0)),y0=Math.min(ymax,Math.max(ymin,0));
  let result='';
  for (const x of ticks(xmin,xmax)) result+=line(px(x),55,px(x),345,'stroke="#e2e8f0"')+text(px(x),370,x,'text-anchor="middle" font-size="13"');
  for (const y of ticks(ymin,ymax)) result+=line(65,py(y),655,py(y),'stroke="#e2e8f0"')+text(52,py(y)+4,y,'text-anchor="end" font-size="13"');
  result+=line(65,py(y0),670,py(y0),'stroke="#475569" stroke-width="1.7" marker-end="url(#arrow)"')+line(px(x0),345,px(x0),40,'stroke="#475569" stroke-width="1.7" marker-end="url(#arrow)"');
  result+=text(678,py(y0)+5,'x')+text(px(x0)+10,35,'y');
  const curves=list(data.curves,4);
  for (const [index,curve] of curves.entries()) {
    const coefficients=list(curve.coefficients,4).map(v=>number(v,'hệ số hàm số'));
    if (!coefficients.length) throw new Error('Đồ thị chưa có hệ số hàm số.');
    let path='',inside=false;
    for (let j=0;j<=240;j++) {
      const x=xmin+(xmax-xmin)*j/240,y=coefficients.reduceRight((value,c)=>value*x+c,0);
      if (!Number.isFinite(y)||y<ymin||y>ymax) { inside=false;continue; }
      path+=`${inside?'L':'M'}${n(px(x))},${n(py(y))} `;inside=true;
    }
    result+=`<path d="${path}" fill="none" stroke="${colors[index]}" stroke-width="2.7"/>`;
    result+=text(70+index*150,405,curve.label||`Đồ thị ${index+1}`,`font-size="14" fill="${colors[index]}"`);
  }
  const points=list(data.points,25);
  if (!curves.length&&!points.length) throw new Error('Chưa có hàm số hoặc điểm để vẽ đồ thị.');
  for (const point of points) {
    const x=number(point.x,'hoành độ'),y=number(point.y,'tung độ');
    if (x<xmin||x>xmax||y<ymin||y>ymax) throw new Error('Điểm nằm ngoài khoảng trục. Hãy yêu cầu AI chọn lại khoảng trục.');
    result+=circle(px(x),py(y),4,'fill="#b91c1c"')+text(px(x)+8,py(y)-8,point.label||`(${x}; ${y})`,'font-size="15"');
  }
  return {body:result,height:430};
}

function numberline(data) {
  const [min,max]=bounds(data.min,data.max),px=x=>70+(x-min)/(max-min)*570;
  let result=line(48,260,675,260,'stroke="#475569" stroke-width="2" marker-end="url(#arrow)"');
  const intervals=list(data.intervals,3),marks=list(data.marks,30);
  if (!intervals.length&&!marks.length) throw new Error('Trục số chưa có khoảng nghiệm hoặc mốc cần minh họa.');
  const values=new Map(ticks(min,max).map(value=>[value,String(value)]));
  for (const mark of marks) values.set(number(mark.value,'mốc trục số'),String(mark.label??mark.value));
  for (const [index,interval] of intervals.entries()) {
    const from=interval.from==null?min:number(interval.from,'đầu khoảng'),to=interval.to==null?max:number(interval.to,'cuối khoảng');
    if (from<min||to>max||from>=to) throw new Error('Khoảng nghiệm không khớp các mốc của trục số.');
    const y=135+index*38,color=colors[index];
    result+=line(px(from),y,px(to),y,`stroke="${color}" stroke-width="5" ${interval.to==null?'marker-end="url(#arrow)"':''}`);
    if (interval.from!=null) { result+=circle(px(from),y,6,`fill="${interval.includeFrom===true?color:'white'}" stroke="${color}" stroke-width="2.5"`);values.set(from,String(from)); }
    else result+=`<path d="M${n(px(from)+9)},${y-6} L${n(px(from))},${y} L${n(px(from)+9)},${y+6}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    if (interval.to!=null) { result+=circle(px(to),y,6,`fill="${interval.includeTo===true?color:'white'}" stroke="${color}" stroke-width="2.5"`);values.set(to,String(to)); }
    result+=text(360,y-15,interval.label||'',`text-anchor="middle" font-size="17" fill="${color}"`);
  }
  for (const [value,description] of values) {
    if (value<min||value>max) throw new Error('Mốc nằm ngoài trục số.');
    result+=line(px(value),253,px(value),267,'stroke="#475569"')+text(px(value),290,description,'text-anchor="middle" font-size="15"');
  }
  return {body:result,height:340};
}

function flow(data) {
  const steps=list(data.steps,8);
  if (steps.length<2||steps.some(value=>typeof value!=='string'||!value.trim()||value.length>140)) throw new Error('Sơ đồ cần từ 2 đến 8 bước ngắn.');
  let result='';
  steps.forEach((step,index)=>{
    const y=25+index*100,words=step.split(/\s+/),lines=[''];
    for (const word of words) { if ((lines.at(-1)+' '+word).length>42&&lines.at(-1)) lines.push('');lines[lines.length-1]+=(lines.at(-1)?' ':'')+word; }
    if (lines.length>3) throw new Error('Một bước sơ đồ quá dài. Hãy yêu cầu diễn đạt ngắn hơn.');
    result+=`<rect x="80" y="${y}" width="560" height="72" rx="12" fill="#eff6ff" stroke="#93c5fd" stroke-width="2"/>`;
    lines.forEach((value,lineIndex)=>{result+=text(360,y+38+(lineIndex-(lines.length-1)/2)*21,value,'text-anchor="middle" font-size="17"');});
    if (index<steps.length-1) result+=line(360,y+75,360,y+97,'stroke="#475569" stroke-width="2" marker-end="url(#arrow)"');
  });
  return {body:result,height:steps.length*100+15};
}

export function renderLessonDiagram(data) {
  if (!data||typeof data!=='object') throw new Error('AI chưa trả dữ kiện hình minh họa.');
  const renderers={geometry,graph,numberline,flow};
  const render=Object.hasOwn(renderers,data.type)?renderers[data.type]:null;
  if (!render) throw new Error('Loại hình minh họa chưa được hỗ trợ.');
  let rendered;
  try {rendered=render(data);} catch(failure){if(failure instanceof TypeError)throw new Error('Dữ liệu hình minh họa chưa đúng cấu trúc. Thầy cô yêu cầu AI tạo lại.',{cause:failure});throw failure;}
  const {body,height}=rendered,caption=String(data.caption||'Hình minh họa').slice(0,500);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 ${height}" role="img"><title>${esc(caption)}</title><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#475569"/></marker></defs><rect width="720" height="${height}" fill="white"/><g font-family="Arial,sans-serif" font-size="18" fill="#0f172a">${body}</g></svg>`;
  if (svg.length>100000) throw new Error('Hình minh họa quá lớn. Hãy giảm số chi tiết.');
  const src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return {svg,caption,html:`<figure class="lesson-ai-figure" data-lesson-diagram="${data.type}"><img src="${esc(src)}" alt="${esc(caption)}" style="width:100%;max-width:100%;height:auto"/><figcaption>${esc(caption)}</figcaption></figure>`};
}
