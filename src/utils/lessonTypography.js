import { mapOutsideQuizMath } from './quizMath.js';

export const LESSON_EDITORIAL_RULES = `QUY ƯỚC TRÌNH BÀY HỌC LIỆU: Ý liệt kê cấp chính dùng dấu -, ý nhỏ bên dưới dùng dấu + và thụt vào; với HTML dùng ul/li lồng nhau, không gõ thêm ký hiệu đầu dòng vào li. Giữ nguyên số thứ tự I., 1., a) đã có, không đánh số lại. Tựa bài là cấp cao nhất, lớn hơn nội dung khoảng 25–30%; tiêu đề mục và mục nhỏ phân cấp rõ, in đậm. Không biến mọi đoạn ngắn thành tiêu đề. Đoạn văn và danh sách giãn dòng vừa phải, ý xuống hàng thẳng với phần chữ, tiêu đề đi liền nội dung. Chỉ nhấn đậm tiêu đề, khái niệm, quy tắc và từ khóa, tránh in đậm cả đoạn dài. Nhãn Ví dụ, Gợi ý, Lời giải chi tiết dùng độ đậm bình thường. Dọn khoảng trắng thừa và dấu câu tiếng Việt có căn cứ; giữ nguyên số liệu, tên riêng, đơn vị, URL, mã và công thức. Mỗi bước tính xuống dòng, canh dấu bằng; dùng đúng =, ⇔, ⇒; mỗi hệ giữ đủ phương trình ở mọi bước. Bảng và hình đặt gần nội dung liên quan, chú thích ngắn khi cần và có đủ dữ kiện. Chuẩn hóa trình bày giữ nguyên ý nghĩa; khi giáo viên yêu cầu bổ sung bài tập, ví dụ hoặc diễn giải thì được thực hiện đúng yêu cầu đó.`;

const protectedBlocks='table,pre,code,figure,svg,math,mjx-container,a[href],.teacher-only,[data-lesson-answer]';
const headingTags='h1,h2,h3,h4,h5,h6';
const titlePattern=/^(?:(?:tuần|bài học|chủ đề|chương|ôn tập)(?=\s|[:\d]|$)|bài\s+\d+[a-z]?\s*[:.–-]\s*\S)/iu;
const romanHeading=/^[IVXLCDM]+[.)]\s+\p{L}/u;
const numberedHeading=/^\d{1,2}[.)]\s+\p{L}/u;
const letterHeading=/^[a-zđ][.)]\s+\p{L}/u;
const markerFor = element => {
  const match=/^\s*([-+•●▪*])\s+(?=\p{L})/u.exec(element.textContent);
  if(!match)return null;
  if(/^\p{L}{1,3}(?=\s*(?:[=+\-−×÷*/^_<>]|$))/u.test(element.textContent.slice(match[0].length)))return null;
  return {length:match[0].length,child:match[1]==='+'};
};

function removePrefix(element,length) {
  const walker=element.ownerDocument.createTreeWalker(element,element.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
  while(length&&walker.nextNode()) {
    const node=walker.currentNode,size=Math.min(length,node.nodeValue.length);
    node.nodeValue=node.nodeValue.slice(size);length-=size;
  }
}

function replaceTag(element,tag) {
  if(element.tagName===tag.toUpperCase())return element;
  const next=element.ownerDocument.createElement(tag);
  for(const attribute of [...element.attributes])next.setAttribute(attribute.name,attribute.value);
  next.append(...element.childNodes);element.replaceWith(next);return next;
}

function childList(item) {
  let list=item.lastElementChild;
  if(list?.tagName!=='UL'){list=item.ownerDocument.createElement('ul');item.append(list);}
  return list;
}

function normalizeLists(container) {
  if(container.matches(protectedBlocks)||container.tagName==='OL')return;
  let previous=null;
  for(const node of [...container.children]) {
    if(node.matches(protectedBlocks)){previous=null;continue;}
    if(node.tagName==='P') {
      const marker=markerFor(node);
      if(marker?.child&&previous?.tagName==='UL'&&previous.lastElementChild?.tagName==='LI') {
        removePrefix(node,marker.length);
        const item=replaceTag(node,'li');
        childList(previous.lastElementChild).append(item);continue;
      }
    }
    if(node.tagName==='UL') {
      let lastItem=null;
      for(const item of [...node.children]) {
        if(item.tagName!=='LI')continue;
        const marker=markerFor(item);
        if(marker)removePrefix(item,marker.length);
        if(marker?.child&&!lastItem)item.dataset.lessonListLevel='2';
        if(marker?.child&&lastItem)childList(lastItem).append(item);
        else lastItem=item;
      }
      if(previous?.tagName==='UL') {
        previous.append(...node.childNodes);node.remove();
        normalizeLists(previous);continue;
      }
    }
    normalizeLists(node);previous=node;
  }
}

function tidyProse(text) {
  return mapOutsideQuizMath(text,prose=>prose.split(/(https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|`[^`\n]*`|\b[A-Za-z]:\\[^\s]+)/g).map((part,index)=>index%2?part:part
    .replace(/[ \t\u00a0]{2,}/g,' ')
    .replace(/(\p{L}{2,})[ \t]+([,;:!?])/gu,'$1$2')
    .replace(/([,;:!?])(?=\p{L})/gu,'$1 ')).join(''));
}

export function normalizeLessonTypography(root,{fragment=false}={}) {
  const eligible=node=>!node.closest(protectedBlocks);
  const first=[...root.children].find(node=>node.textContent.trim()&&eligible(node));
  if(!fragment&&first&&/^(?:P|H[1-6])$/.test(first.tagName)&&(first.classList.contains('lesson-title')||titlePattern.test(first.textContent.trim()))) {
    replaceTag(first,'h2').classList.add('lesson-title');
  }
  const headings=[...root.querySelectorAll(headingTags)].filter(eligible);
  const hasRoman=headings.some(node=>romanHeading.test(node.textContent.trim()));
  for(const heading of headings) {
    if(heading.classList.contains('lesson-title'))continue;
    const text=heading.textContent.trim();
    if(romanHeading.test(text))replaceTag(heading,'h3');
    else if(numberedHeading.test(text))replaceTag(heading,hasRoman?'h4':'h3');
    else if(letterHeading.test(text))replaceTag(heading,hasRoman?'h5':'h4');
  }
  normalizeLists(root);
  for(const paragraph of root.querySelectorAll('p,li')) {
    if(!eligible(paragraph)||paragraph.querySelector('p,li')||paragraph.textContent.trim().length<160)continue;
    for(const bold of [...paragraph.querySelectorAll('strong,b')]) {
      if(paragraph.contains(bold)&&bold.textContent.trim()===paragraph.textContent.trim())bold.replaceWith(...bold.childNodes);
    }
  }
  const walker=root.ownerDocument.createTreeWalker(root,root.ownerDocument.defaultView.NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())if(eligible(walker.currentNode.parentElement))nodes.push(walker.currentNode);
  for(const node of nodes) {
    const after=tidyProse(node.nodeValue);
    if(after!==node.nodeValue)node.nodeValue=after;
  }
}
