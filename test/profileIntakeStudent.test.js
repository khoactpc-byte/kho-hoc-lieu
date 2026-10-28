import test from 'node:test';
import assert from 'node:assert/strict';
import { intakeStudentFromVerifiedSession } from '../src/utils/profileIntakeStudent.js';
test('quota-only form identity keeps verified code/year/campus and never invents existing pupil data',()=>{
  const profile={accessCode:'HS26601',fullName:'Học sinh mẫu',schoolCode:'NAN',className:'6A',schoolYear:'2026-2027',expiresAt:Date.now()+10000};
  const student=intakeStudentFromVerifiedSession(profile,'HS26601');
  assert.equal(student.intakeOnly,true);assert.equal(student.accessCode,profile.accessCode);assert.match(student.id,/^intake-/);assert.equal(student.birthDate,undefined);assert.equal(student.schoolYear,profile.schoolYear);
  for(const change of [{accessCode:'HS99999'},{schoolYear:''},{schoolCode:'UNKNOWN'},{expiresAt:1},{className:''}])assert.throws(()=>intakeStudentFromVerifiedSession({...profile,...change},'HS26601'),/chưa đủ dữ liệu/);
});
