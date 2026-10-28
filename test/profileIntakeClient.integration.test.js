import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createAsyncScope } from '../src/utils/asyncScope.js';
test('Cloudflare intake submits an existing pupil profile while every Firestore operation is unavailable',async()=>{
  const dir=await mkdtemp(resolve('node_modules/.intake-client-')),page=new JSDOM('',{url:'https://site.test/'}).window;
  const old=Object.fromEntries(['window','document','Event','fetch'].map(key=>[key,globalThis[key]]));
  const calls=[],notices=[];let closed=false;
  Object.assign(globalThis,{window:page,document:page.document,Event:page.Event,fetch:async(url,options)=>{
    assert.equal(url,'/.site/profile-intake');const body=JSON.parse(options.body);calls.push(body);
    return Response.json(body.action==='submit'?{id:'intake-fixture',storage:'cloudflare-d1',status:'pending'}:{requests:[]});
  }});
  page.sessionStorage.setItem('khl-student-server-session-v1','student-fixture');
  try{
    const out=join(dir,'service.mjs');
    await build({stdin:{contents:"export * from './src/services/studentProfileRequests.js';",resolveDir:resolve('.')},outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',
      define:{'import.meta.env.VITE_PROFILE_INTAKE_ENABLED':'"true"'},plugins:[{name:'no-firestore',setup(b){
        b.onResolve({filter:/^firebase\/firestore$|config\/firebase$|\.\/serverQuizClient$|\.\/scopedIdentity$|utils\/helpers$|utils\/fileUpload$/},args=>({path:args.path,namespace:'fixture'}));
        b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='firebase/firestore'?`const fail=()=>{throw new Error('Quota exceeded: Firestore must not be called');};export const collection=fail,doc=fail,getDocsFromServer=fail,query=fail,runTransaction=fail,where=fail;`
          :args.path.endsWith('config/firebase')?'export const db={},appId="fixture";'
          :args.path.endsWith('scopedIdentity')?'export const SCOPED_AUTH_ENABLED=true;'
          :args.path.endsWith('serverQuizClient')?'export const requestPrivateApi=()=>{throw new Error("Unexpected Firestore API");};'
          :args.path.endsWith('utils/helpers')?'export const postAppsScript=()=>{throw new Error("No image in fixture");};'
          :'export const studentUploadMime=()=>"image/jpeg";export const readFileBase64=async()=>"fixture";',loader:'js'}));
      }}]});
    const {submitStudentProfileChange}=await import(pathToFileURL(out));
    await submitStudentProfileChange({activeStudentProfile:{id:'pupil',accessCode:'HS26601',fullName:'Học sinh mẫu',schoolYear:'2026-2027',className:'6A',phone:'123'},isSubmittingProfileRequest:false,activeStudentIsReadOnly:false,
      showNotification:message=>notices.push(message),studentRequestScopeRef:{current:createAsyncScope()},setIsSubmittingProfileRequest(){},STUDENT_PROFILE_IMAGE_FIELDS:[],studentProfileImages:{},studentProfileDocumentOverrides:{},activeStudentPendingProfileChanges:{},studentProfileImageAppendModes:{},studentProfileEditableFields:[{key:'phone'}],normalizeStudentResultRating:x=>x,studentProfileDraft:{phone:'456'},activeStudentPendingProfileRequests:[],currentSchoolYear:'2026-2027',setShowStudentProfileModal:value=>{closed=!value;}});
    assert.equal(closed,true);assert.match(notices.at(-1),/Đã tiếp nhận.*Cloudflare/);
    assert.deepEqual(calls.map(call=>call.action),['check','check','submit']);assert.deepEqual(calls.at(-1).changes,{phone:'456'});assert.equal(calls.at(-1).studentSessionToken,'student-fixture');
  }finally{page.close();for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}await rm(dir,{recursive:true,force:true});}
});
