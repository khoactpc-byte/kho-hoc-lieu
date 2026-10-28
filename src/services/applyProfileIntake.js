import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, where } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { getStudentSchoolCode } from '../utils/schoolClasses';
import { intakeReviewSummary } from '../utils/profileIntakeReview';
import { requestProfileIntake } from './profileIntake';

async function readCurrent(row) {
  const records=collection(db,'artifacts',appId,'public','data','students');
  const snapshot=await getDocsFromServer(query(records,where('accessCode','==',row.accessCode),limit(32)));
  const matches=snapshot.docs.map(item=>({...item.data(),id:item.id})).filter(item=>item.schoolYear===row.schoolYear && getStudentSchoolCode(item)===row.schoolCode);
  if(matches.length!==1)throw new Error('Chưa xác định được duy nhất hồ sơ chính theo mã, trường và năm học. Quyết định duyệt được giữ để đối soát.');
  const result=await requestProfileIntake('overrides',{schoolYear:row.schoolYear});
  const override=(result.overrides || []).find(item=>item.accessCode===row.accessCode && item.schoolCode===row.schoolCode && item.schoolYear===row.schoolYear);
  return override?{...matches[0],...override.fields,id:matches[0].id}:matches[0];
}
async function readSettings(){return (await getDocFromServer(doc(db,'artifacts',appId,'public','data','settings','global'))).data() || {};}

// Called only after an explicit administrator approval or retry. Never from a subscription.
export async function applyProfileIntake(row,{save,validate=async()=>{},isReadOnly=()=>false,read=readCurrent,settings=readSettings}) {
  const fields=intakeReviewSummary(row).approved;
  if(!fields.length)throw new Error('Không có mục đã duyệt cần đồng bộ.');
  const before=await read(row);
  if(!before?.id || before.accessCode!==row.accessCode || before.schoolYear!==row.schoolYear || getStudentSchoolCode(before)!==row.schoolCode)throw new Error('Hồ sơ chính không khớp yêu cầu. Chưa cập nhật.');
  if(isReadOnly(before))throw new Error('Hồ sơ này đang ở chế độ chỉ xem. Quyết định duyệt được giữ để đối soát.');
  const changes=Object.fromEntries(fields.filter(key=>String(before[key] ?? '')!==row.changes[key]).map(key=>[key,row.changes[key]]));
  if(Object.keys(changes).length){
    const config=await settings();
    if(config.maintenance?.active || config.inputYearLocks?.[row.schoolYear])throw new Error('Hồ sơ đang bảo trì hoặc năm học đã khóa. Quyết định duyệt được giữ lại.');
    await validate({...before,...changes},before);
    await save({...before,...changes},{expected:before});
  }
  return {fields,saved:true};
}

// Apply approved fields to the Cloudflare student-profile overlay. Firestore is
// read only for identity/current-value checks; this path performs no Firestore write.
export async function applyProfileIntakeToCloud(row,{validate=async()=>{},isReadOnly=()=>false,read=readCurrent,settings=readSettings,request=requestProfileIntake}={}) {
  const fields=intakeReviewSummary(row).approved;
  if(!fields.length)throw new Error('Không có mục đã duyệt cần đồng bộ.');
  const before=await read(row);
  if(!before?.id || before.accessCode!==row.accessCode || before.schoolYear!==row.schoolYear || getStudentSchoolCode(before)!==row.schoolCode)throw new Error('Hồ sơ chính không khớp yêu cầu. Chưa cập nhật.');
  if(isReadOnly(before))throw new Error('Hồ sơ này đang ở chế độ chỉ xem. Quyết định duyệt được giữ để đối soát.');
  const changes=Object.fromEntries(fields.filter(key=>String(before[key] ?? '')!==row.changes[key]).map(key=>[key,row.changes[key]]));
  if(Object.keys(changes).length){
    const config=await settings();
    if(config.maintenance?.active || config.inputYearLocks?.[row.schoolYear])throw new Error('Hồ sơ đang bảo trì hoặc năm học đã khóa. Quyết định duyệt được giữ lại.');
    await validate({...before,...changes},before);
  }
  const result=await request('apply',{id:row.id,expectedHash:row.payloadHash,expectedVersion:row.review?.version || 0});
  return {fields,saved:true,request:result.request};
}
