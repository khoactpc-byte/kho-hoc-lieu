import { profileRequestRejectedFields } from './profileRequestDecisions.js';
import { STUDENT_PROFILE_ADDRESS_GROUPS } from './studentProfileProvinces.js';
export const intakeReview = row => row.review || { version:0, decisions:{}, appliedFields:[] };
export function intakeReviewSummary(row){
  const review=intakeReview(row),keys=Object.keys(row.changes);
  return {pending:keys.filter(key=>!review.decisions[key]),approved:keys.filter(key=>review.decisions[key]==='approve' && !review.appliedFields.includes(key)),
    applied:keys.filter(key=>review.appliedFields.includes(key)),rejected:keys.filter(key=>review.decisions[key]==='reject')};
}
export function decideIntakeFields(row,decision,field){
  if(!['approve','reject'].includes(decision) || field && !Object.hasOwn(row.changes,field))throw new Error('Thông tin duyệt không hợp lệ.');
  const review=intakeReview(row),next={...review.decisions};
  const keys=(field?(decision==='reject'?profileRequestRejectedFields(row.changes,field):[field]):Object.keys(row.changes)).filter(key=>!next[key]);
  if(!keys.length)throw new Error('Thông tin đã được xử lý. Tải lại danh sách để đối chiếu.');
  if(decision==='approve')for(const key of keys){
    const group=STUDENT_PROFILE_ADDRESS_GROUPS.find(item=>[item.district,item.ward].includes(key));
    const parents=group?(key===group.ward?[group.province,group.district]:[group.province]).filter(Boolean):[];
    if(parents.some(parent=>Object.hasOwn(row.changes,parent) && !keys.includes(parent) && next[parent]!=='approve'))throw new Error('Duyệt tỉnh/huyện đề nghị liên quan trước khi duyệt huyện/xã, hoặc dùng Đồng ý yêu cầu này.');
  }
  for(const key of keys)next[key]=decision;
  return {...review,decisions:next,fields:keys};
}
export function intakeResolvedStatus(row,review){
  const keys=Object.keys(row.changes);
  if(keys.some(key=>!review.decisions[key] || review.decisions[key]==='approve' && !review.appliedFields.includes(key)))return 'pending';
  return keys.some(key=>review.decisions[key]==='approve')?'synced':'rejected';
}
