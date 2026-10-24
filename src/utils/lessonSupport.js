import { createHtmlSanitizer } from './safeHtml.js';
import { createLessonPresentationTools } from './lessonPresentation.js';
import { createLessonAssistantContentTools } from './lessonAssistant.js';
import { LESSON_PRACTICE_LIMIT, resolveLessonSupportPractice } from './lessonPractice.js';

export function createLessonSupportTools(windowObject) {
  const presentation=createLessonPresentationTools(windowObject),content=createLessonAssistantContentTools(windowObject),sanitize=createHtmlSanitizer(windowObject);
  const apply = (html,value,{instruction='',practiceCount='',practiceDifficulty='',includeMath=false,selectedIds}={}) => {
    const additions=value?.additions??[];
    if(!Array.isArray(additions)||additions.length>8)throw new Error('AI chưa trả danh sách nội dung bổ sung hợp lệ.');
    const practice=resolveLessonSupportPractice(instruction,{practiceCount,practiceDifficulty});
    if(additions.length&&!String(instruction).trim()&&!practice.practiceCount)throw new Error('AI đưa thêm nội dung ngoài yêu cầu rà bài. Thầy cô thử lại.');
    const requested=practice.practiceCount;
    const revised=presentation.applyCorrections(html,value,{includeMath,selectedIds});
    const root=windowObject.document.createElement('div');root.innerHTML=revised.html;
    const target=root.childElementCount===1&&root.firstElementChild.matches('.lesson-formatted')?root.firstElementChild:root;
    const changes=[...revised.changes],warnings=[...revised.warnings];let exerciseCount=0;
    for(const [index,addition] of additions.entries()) {
      if(!addition||typeof addition!=='object'||Array.isArray(addition))throw new Error('Nội dung bổ sung của AI chưa đúng cấu trúc.');
      if(addition.exercises!=null&&!Array.isArray(addition.exercises))throw new Error('AI chưa trả danh sách bài tự luyện hợp lệ.');
      if(addition.html!=null&&typeof addition.html!=='string')throw new Error('Nội dung bổ sung của AI chưa đúng cấu trúc.');
      const count=addition.exercises?.length||0;
      exerciseCount+=count;
      if(exerciseCount>LESSON_PRACTICE_LIMIT)throw new Error(`AI trả quá ${LESSON_PRACTICE_LIMIT} bài trong một lượt. Thầy cô thử lại.`);
      if(count&&(addition.html?.trim()||addition.diagram))throw new Error('AI cần đặt đề và lời giải bài tự luyện trong danh sách riêng. Thầy cô thử lại.');
      const parsed=count
        ? content.parse(JSON.stringify({exercises:addition.exercises,warnings:[]}),{action:'practice',count})
        : content.parse(JSON.stringify({html:addition.html??'',diagram:addition.diagram??null,warnings:[]}),{action:'custom'});
      const id=`addition-${index}`,selected=selectedIds?selectedIds.includes(id):true;
      if(selected)target.insertAdjacentHTML('beforeend',parsed.html);
      const summary=windowObject.document.createElement('div');summary.innerHTML=parsed.html;
      changes.push({id,kind:count?`Bổ sung ${count} bài tự luyện`:'Bổ sung nội dung',before:'Chưa có phần bổ sung này.',
        after:count?`${count} bài tự luyện kèm gợi ý và lời giải chi tiết. Xem nội dung ở cuối bản xem trước.`:summary.textContent.trim().slice(0,400),
        reason:count?'Đáp án mới được đặt riêng cho giáo viên.':'Theo yêu cầu bổ sung của giáo viên.',selected});
      warnings.push(...parsed.warnings);
    }
    if(requested&&exerciseCount!==requested)throw new Error(`AI chưa tạo đủ ${requested} bài tự luyện theo yêu cầu. Thầy cô thử lại; bài gốc vẫn được giữ.`);
    return {html:sanitize(root.innerHTML),changes,warnings:[...new Set(warnings)].slice(0,30)};
  };
  return {apply};
}
