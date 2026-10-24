import { protectQuizMath } from './quizMath.js';

const protectedBlocks = 'table,pre,code,figure,math,mjx-container,.teacher-only,[data-lesson-answer]';
const supportingLabel = /^(?:(?:Ví dụ(?: trực tiếp| mẫu)?(?:\s*\([^)]*\))?|Gợi ý|Bài làm|Trình bày bài làm|Lời giải(?: bài làm)?):|Lời giải chi tiết:?)$/i;
const conceptStart = /^(?:Tính chất|Tính chia hết|Định nghĩa|Định lí|Định lý|Khái niệm|Quy tắc|Quy ước|Công thức|Dấu hiệu|Phép |Tập hợp|Số |Hợp số|Ước |Bội |Cách |Thứ tự|Hằng đẳng thức|Tia |Hai góc|Hai tam giác|Hình |Tam giác|Trường hợp|Góc |Đường |Đoạn |Trung điểm|Đơn thức|Đa thức|(?:Nhân|Chia|Cộng|Trừ)(?=[\s,])|Lũy thừa|Bình phương|Lập phương|Tổng (?:hai|các góc)|Tứ giác|Hiệu hai|Đại số|Căn |Giá trị|Dữ liệu|Biểu đồ|Tần số|Tiên đề|Hàm số|Hệ số|Bước \d|Điều kiện|Ghi nhớ|Lưu ý|Kết luận|Nhận xét|Ứng dụng|Biểu thức|So sánh|Phân tích|Phân thức|Thu thập|Phân loại|Cùng mẫu|Khác mẫu|Khi |Độ dài|Diện tích|Phương pháp|Đặt nhân tử|Dùng hằng đẳng thức|Nhóm hạng tử|[1-3]\.\s+Bài tập)/i;

const unwrap = element => element.replaceWith(...element.childNodes);

function emphasizeRange(element, start, end) {
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, document.defaultView.NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0, started = false;
  while (walker.nextNode()) {
    const node = walker.currentNode, length = node.nodeValue.length;
    if (!started && start < offset + length) { range.setStart(node, start - offset); started = true; }
    if (started && end <= offset + length) { range.setEnd(node, end - offset); break; }
    offset += length;
  }
  const fragment = range.extractContents();
  [...fragment.querySelectorAll('strong,b')].forEach(unwrap);
  const strong = document.createElement('strong');
  strong.className = 'lesson-concept-label';
  strong.append(fragment);
  range.insertNode(strong);
}

// Change emphasis only: keep the lesson text, equations and structure intact.
export function emphasizeLessonLabels(root) {
  let concepts = 0, supportingLabels = 0;
  for (const element of root.querySelectorAll('p,li')) {
    if (element.closest(protectedBlocks) || element.querySelector('p,li')) continue;
    for (const bold of element.querySelectorAll('strong,b')) {
      const label = bold.textContent.trim();
      if (supportingLabel.test(label) && element.textContent.trimStart().startsWith(label)) {
        unwrap(bold); supportingLabels++;
      }
    }
    const text = element.textContent;
    const prefix = /^(\s*(?:[•●▪*-]\s+)?(?:\d+[a-z]?\)\s+)?)/i.exec(text)[0];
    const tail = text.slice(prefix.length), math = protectQuizMath(tail);
    const colon = math.source.indexOf(':');
    const label = colon < 0 ? '' : math.restore(math.source.slice(0, colon + 1));
    const ranges = [];
    if (label && label.length <= 110 && conceptStart.test(label)) ranges.push({ start: prefix.length, label });
    else {
      // Some definitions have no colon; emphasize their short existing term.
      const term = /^(?:Hàm số bậc nhất|Đồ thị hàm số|Dữ liệu thống kê|Căn bậc ba|Lập bảng tần số)(?=\s|[:.,]|$)/i.exec(tail)?.[0];
      if (term) ranges.push({ start: prefix.length, label: term });
      if (/^Hệ số a gọi là hệ số góc/i.test(tail)) ranges.push({ start: text.indexOf('hệ số góc'), label: 'hệ số góc' });
      if (/^Độ dài cung /i.test(tail)) {
        ranges.push({ start: prefix.length, label: tail.slice(0, 'Độ dài cung'.length) });
        const position = text.indexOf('Diện tích quạt');
        if (position >= 0) ranges.push({ start: position, label: 'Diện tích quạt' });
      }
    }
    for (const range of ranges.reverse()) {
      if ([...element.querySelectorAll('strong,b')].some(bold => bold.textContent === range.label)) continue;
      emphasizeRange(element, range.start, range.start + range.label.length);
      concepts++;
    }
  }
  return { concepts, supportingLabels };
}
