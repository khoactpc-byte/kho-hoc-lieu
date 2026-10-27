import {readableEssayMath} from './essayMath.js';

const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').replace(/[*`#]/g,'').trim().toLowerCase();
const studentHeading = line => /^nhan xet (?:gui|danh cho) hoc sinh\s*[:：]?/.test(fold(line));
const privateHeading = line => /^(?:ghi chu (?:rieng )?(?:cho|danh cho) giao vien|phan tich rieng cho giao vien|dieu giao vien can kiem tra)/.test(fold(line));
const internalText = paragraph => /(?:giao vien (?:chua|khong|can|nen)|can (?:thay|co|giao vien) (?:kiem tra|xem|doi chieu)|(?:thieu|chua co|khong co).{0,45}(?:bieu diem|thang diem|de goc|de bai)|(?:ai|toi) (?:chua|khong) (?:co )?du|chua du (?:can cu|du kien)|dap an doi chieu do ai|dap an.{0,30}ai tu giai|chi la (?:diem|muc).{0,20}de xuat)/.test(fold(paragraph));

// The same filter runs in the editor, returned-paper view and server send path.
// Legacy reports are filtered conservatively; internal paragraphs stay in the teacher's analysis.
export function studentEssayComment(value='') {
  const lines=String(value).replace(/\r/g,'').split('\n');
  const start=lines.findIndex(studentHeading);
  const selected=start<0?lines:lines.slice(start);
  const kept=[];
  for(const line of selected){
    if(privateHeading(line))break;
    if(studentHeading(line)){
      const after=line.replace(/^[^:：]+[:：]\s*/,'');
      if(after!==line && after.trim())kept.push(after);
      continue;
    }
    if(/^\s*(?:muc nhan xet|xep loai|diem(?: tu luan)?)(?:\s*\/\s*viet tay)?(?: de xuat)?\s*[:：]/.test(fold(line)))continue;
    kept.push(line.replace(/^\s*\**Nhận xét sơ bộ\s*[:：]\s*\**/i,''));
  }
  return readableEssayMath(kept.join('\n').split(/\n\s*\n/).filter(paragraph=>!internalText(paragraph))
    .join('\n\n').replace(/^\s*(?:Đối chiếu từng câu và từng bước|Hướng dẫn sửa từng bước)\s*[:：]?\s*$/gm,'').trim()).slice(0,10000);
}

export function essayDraftStudentComment(submission={},draft={}) {
  return String(draft.teacherComment ?? studentEssayComment(submission.teacherComment ?? submission.aiStudentComment ?? submission.aiComment ?? '')).slice(0,10000);
}

export function readEssayFeedbackMessage(body='') {
  const lines=String(body).replace(/\r/g,'').split('\n');
  if(!/^KẾT QUẢ TỰ LUẬN\s*·/i.test(lines[0]?.trim() || ''))return null;
  const assessment=lines.find(line=>/^Mức nhận xét(?: giáo viên duyệt)?\s*:/i.test(line))?.match(/:\s*(A\+?|B\+?|C\+?)\s*$/i)?.[1]?.toUpperCase();
  const scoreLine=lines.find(line=>/^Điểm(?: giáo viên duyệt)?\s*:/i.test(line));
  const numeric=scoreLine?.match(/:\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*$/);
  const commentStart=lines.findIndex(line=>/^Nhận xét(?: và hướng dẫn)?(?: của giáo viên)?\s*:/i.test(line));
  const comment=commentStart<0?'':lines.slice(commentStart+1).join('\n').replace(/\n(?:Bài có nét chấm và ghi chú trực tiếp\.|Mở bài tự luận của tuần này)[\s\S]*$/,'');
  return {title:lines[0],details:lines.filter(line=>/^(?:Học sinh|Lớp|Năm học)\s*:/.test(line)),
    review:assessment?{teacherAssessment:assessment}:numeric?{teacherScore:numeric[1].replace(',','.'),teacherMaxScore:numeric[2].replace(',','.')}: {},
    comment:studentEssayComment(comment)};
}
