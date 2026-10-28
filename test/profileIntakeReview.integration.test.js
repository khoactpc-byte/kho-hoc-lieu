import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

test('official profile writes use fresh scope and approved fields only; quota and locks keep decisions staged',async()=>{
  const dir=await mkdtemp(resolve('node_modules/.intake-review-'));
  try{
    const out=join(dir,'apply.mjs');
    await build({entryPoints:['src/services/applyProfileIntake.js'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'offline',setup(b){
      b.onResolve({filter:/^firebase\/firestore$|config\/firebase$/},a=>({path:a.path,namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='firebase/firestore'?`const fail=()=>{throw new Error('No unexpected Firestore calls');};export const collection=fail,doc=fail,getDocFromServer=fail,getDocsFromServer=fail,limit=fail,query=fail,where=fail;`:'export const db={},appId="test";'}));
    }}]});
    const {applyProfileIntake}=await import(pathToFileURL(out));
    const row={accessCode:'HS26601',schoolCode:'NAN',schoolYear:'2026-2027',changes:{phone:'456',address:'UNAPPROVED',fullName:'REJECTED'},review:{decisions:{phone:'approve',fullName:'reject'},appliedFields:[]}};
    const before={id:'real',accessCode:row.accessCode,schoolCode:'NAN',schoolYear:row.schoolYear,className:'6A',phone:'123',address:'old',fullName:'Pupil'};
    const writes=[],options={read:async()=>before,settings:async()=>({}),save:async(...args)=>writes.push(args)};
    const result=await applyProfileIntake(row,options);assert.deepEqual(result,{fields:['phone'],saved:true});assert.equal(writes.length,1);assert.deepEqual(writes[0],[{...before,phone:'456'},{expected:before}]);
    writes.length=0;
    await assert.rejects(applyProfileIntake(row,{...options,read:async()=>{throw new Error('Quota exceeded');}}),/Quota/);assert.equal(writes.length,0);assert.deepEqual(row.review.appliedFields,[]);
    for(const invalid of [{...before,schoolCode:'TQK'},{...before,accessCode:'HS99999'},{...before,schoolYear:'2025-2026'}])await assert.rejects(applyProfileIntake(row,{...options,read:async()=>invalid}),/không khớp/);
    await assert.rejects(applyProfileIntake(row,{...options,isReadOnly:()=>true}),/chỉ xem/);
    await assert.rejects(applyProfileIntake(row,{...options,settings:async()=>({inputYearLocks:{[row.schoolYear]:true}})}),/khóa/);
    await assert.rejects(applyProfileIntake(row,{...options,validate:async()=>{throw new Error('invalid address');}}),/invalid address/);assert.equal(writes.length,0);
    await applyProfileIntake(row,{...options,read:async()=>({...before,phone:'456'})});assert.equal(writes.length,0,'retry after lost acknowledgement must not write twice');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('approval controls never write on load; failed official save has no applied acknowledgement and can be retried',async()=>{
  const dir=await mkdtemp(resolve('node_modules/.intake-panel-')),page=new JSDOM('<div id="root"></div>',{url:'https://site.test/'}).window;
  const old=Object.fromEntries(['window','document','Event','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{window:page,document:page.document,Event:page.Event,IS_REACT_ACT_ENVIRONMENT:true});
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');let root;
  try{
    const out=join(dir,'panel.mjs');
    await build({entryPoints:['src/components/CloudProfileIntakePanel.jsx'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'intake-fixture',setup(b){
      b.onResolve({filter:/services\/profileIntake$/},()=>({path:'api',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const requestProfileIntake=(action,payload)=>window.intakeApi(action,payload);'}));
    }}]});
    const Panel=(await import(pathToFileURL(out))).default;
    let row={id:'intake-test',payloadHash:'hash',accessCode:'HS26601',schoolCode:'NAN',schoolYear:'2026-2027',studentName:'Fixture',className:'6A',createdAt:Date.now(),changes:{phone:'456'},status:'pending',review:{version:0,decisions:{},appliedFields:[]}},saveCalls=0,ready=false;const actions=[];
    page.intakeApi=async(action,payload)=>{actions.push(action);if(action==='list')return {requests:[row],total:1};if(action==='review'){assert.equal(payload.decision,'approve');row={...row,review:{version:1,decisions:{phone:'approve'},appliedFields:[]}};}if(action==='applied')row={...row,status:'synced',review:{...row.review,appliedFields:payload.fields}};return {request:row};};
    root=createRoot(page.document.getElementById('root'));
    await act(async()=>root.render(React.createElement(Panel,{schoolYear:row.schoolYear,educationLevel:'thcs',fields:[{key:'phone',label:'Điện thoại'}],onApply:async()=>{saveCalls++;if(!ready)throw new Error('Quota exceeded');return {saved:true,fields:['phone']};}})));
    assert.deepEqual(actions,['list']);assert.equal(saveCalls,0);
    const click=async text=>{const el=[...page.document.querySelectorAll('button')].find(item=>item.textContent===text);assert.ok(el,text);await act(async()=>el.click());};
    await click('Đồng ý yêu cầu này');assert.deepEqual(actions,['list','review']);assert.equal(saveCalls,1);assert.match(page.document.body.textContent,/Đã duyệt, chờ đồng bộ/);
    ready=true;await click('Thử đồng bộ hồ sơ chính');assert.deepEqual(actions,['list','review','applied']);assert.equal(saveCalls,2);assert.match(page.document.body.textContent,/Đã cập nhật hồ sơ chính/);
  }finally{if(root)await act(async()=>root.unmount());page.close();for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}await rm(dir,{recursive:true,force:true});}
});
