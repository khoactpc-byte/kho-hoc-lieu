export const LESSON_PRACTICE_LIMIT = 10;
export const LESSON_PRACTICE_DIFFICULTIES = [
  {value:'easy',label:'Dễ'},
  {value:'medium',label:'Trung bình'},
  {value:'hard',label:'Khó'},
  {value:'mixed',label:'Hỗn hợp (từ dễ đến khó)'}
];
export const normalizeLessonPracticeCount = count => Math.min(LESSON_PRACTICE_LIMIT,Math.max(1,Math.floor(Number(count)||1)));

export function requestedLessonPracticeCount(instruction) {
  const match=String(instruction||'').trim().toLocaleLowerCase('vi').match(/(?:^|(?<![\p{L}\p{N}])(?:thêm|tạo|bổ\s*sung|soạn|ra)(?!\s+lại)\s+(?:(?:cho tôi|giúp tôi|mới|thêm)\s+)?)(\d{1,2}|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười)\s*(?:bài|câu)(?=\s|[.,;:!?]|$)/u);
  if(!match)return null;
  const words={một:1,hai:2,ba:3,bốn:4,tư:4,năm:5,sáu:6,bảy:7,tám:8,chín:9,mười:10},count=Number(match[1])||words[match[1]];
  if(count<1||count>LESSON_PRACTICE_LIMIT)throw new Error(`Mỗi lần tạo từ 1 đến ${LESSON_PRACTICE_LIMIT} bài tự luyện. Thầy cô chia yêu cầu thành nhiều lượt nếu cần thêm.`);
  return count;
}

export function resolveLessonSupportPractice(instruction='', {practiceCount='',practiceDifficulty=''}={}) {
  const quick=practiceCount!==''&&practiceCount!=null;
  const count=quick?Number(practiceCount):requestedLessonPracticeCount(instruction);
  if(quick&&(!Number.isInteger(count)||count<1||count>LESSON_PRACTICE_LIMIT))throw new Error(`Chọn từ 1 đến ${LESSON_PRACTICE_LIMIT} câu ôn tập, hoặc Không thêm.`);
  if(practiceDifficulty&&!LESSON_PRACTICE_DIFFICULTIES.some(option=>option.value===practiceDifficulty))throw new Error('Mức độ bài tự luyện chưa hợp lệ.');
  return {
    ...(count?{practiceCount:count}:{}),
    ...(quick?{practiceScope:'whole_week'}:{}),
    ...((quick||String(instruction).trim())&&practiceDifficulty?{practiceDifficulty}:{})
  };
}
