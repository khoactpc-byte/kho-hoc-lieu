import {ESSAY_AI_LEASE_MS} from './essayAiPolicy.js';

export const essayBatchKey = row => JSON.stringify([row.key,row.essay?.id,row.essay?.fileId,Number(row.essay?.submittedAt)||0]);
export function essayBatchEligibility(row,{regrade=false,now=Date.now()}={}) {
  const essay=row.essay;
  if(!essay)return {eligible:false,reason:'Trắc nghiệm đã được chấm tự động.'};
  if(!essay.id || !essay.fileId || ['left_page','locked_left_page'].includes(essay.status))return {eligible:false,reason:'Chưa có tệp tự luận hợp lệ.'};
  if(essay.aiRetryAt>now)return {eligible:false,reason:'AI tạm bận; máy chủ đã lên lịch tự thử lại.'};
  const started=essay.aiStatus==='grading'?essay.aiStartedAt:essay.aiAutoRequestedAt;
  const stale=['queued','grading'].includes(essay.aiStatus) && started && now-Number(started)>=ESSAY_AI_LEASE_MS;
  if(essay.aiStatus==='grading' && !stale || essay.aiStatus==='queued' && essay.aiAutoRequestedAt && !stale)return {eligible:false,reason:'Bài đã gửi AI, đang chờ hoặc đang chấm.'};
  if(!regrade && (essay.status==='teacher_reviewed' || essay.aiStatus==='graded'))return {eligible:false,reason:'Đã có kết quả. Bật “Chấm lại bài đã có kết quả” nếu cần.'};
  return {eligible:true,retry:regrade || essay.aiStatus==='error' || !!stale,reason:''};
}

// Only enqueue drafts. Official grades and sending feedback are separate teacher actions.
export async function queueEssayBatch(rows,execute,{regrade=false,onProgress,shouldContinue=()=>true}={}) {
  const unique=new Map();
  for(const row of rows){const permission=essayBatchEligibility(row,{regrade});if(permission.eligible && !unique.has(row.essay.id))unique.set(row.essay.id,{row,permission});}
  const records=[...unique.values()],accepted=[],failed=[];let cursor=0;
  const progress=()=>onProgress?.({completed:accepted.length+failed.length,total:records.length,accepted:accepted.length,failed:failed.length});
  progress();
  const worker=async()=>{
    while(cursor<records.length && shouldContinue()){
      const {row,permission}=records[cursor++];
      try{
        const result=await execute(row.essay,{silent:true,retry:permission.retry,batch:true});
        if(!['queued','done'].includes(result?.status))throw new Error(result?.message || 'Máy chủ chưa nhận bài để chấm.');
        accepted.push({row,result});
      }catch(error){failed.push({row,message:error.message || 'Chưa gửi được bài.'});}
      progress();
    }
  };
  await Promise.all([worker(),worker()]);
  return {accepted,failed,total:records.length,remaining:records.length-accepted.length-failed.length};
}
