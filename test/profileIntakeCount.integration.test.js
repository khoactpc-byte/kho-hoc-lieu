import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React,{act} from 'react';
import { JSDOM } from 'jsdom';

test('admin count loads before the list, refreshes after decisions and on visible timers, retains errors and discards other scopes',async()=>{
  const dir=await mkdtemp(resolve('node_modules/.intake-count-')),page=new JSDOM('<div id="root"></div>',{url:'https://site.test/',pretendToBeVisual:true}).window;
  const previous=Object.fromEntries(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,globalThis[key]]));Object.assign(globalThis,{window:page,document:page.document,IS_REACT_ACT_ENVIRONMENT:true});
  let root,current,tick,cleared=false;const reads=[];
  page.setInterval=(callback,ms)=>{assert.equal(ms,60000);tick=callback;return 1;};page.clearInterval=()=>{cleared=true;};
  page.countFixture={capture:value=>{current=value;},request:(action,payload,options)=>{assert.equal(action,'count');return new Promise((resolveRead,reject)=>reads.push({payload,signal:options.signal,resolve:resolveRead,reject}));}};
  try{
    const out=join(dir,'notice.mjs');
    await build({stdin:{resolveDir:resolve('.'),contents:`import React from 'react';import {useProfileIntakeCount} from './src/hooks/useProfileIntakeCount';export default function Notice(props){const value=useProfileIntakeCount(props.enabled,props.scope,props.year,props.level);window.countFixture.capture(value);return React.createElement('output',null,value.count);}`},outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){
      b.onResolve({filter:/services\/profileIntake$/},()=>({path:'api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const PROFILE_INTAKE_ENABLED=true;export const requestProfileIntake=(...args)=>window.countFixture.request(...args);'}));
    }}]});
    const Notice=(await import(pathToFileURL(out))).default,{createRoot}=await import('react-dom/client');root=createRoot(page.document.getElementById('root'));
    const render=(enabled,year='2026-2027',level='thcs')=>act(async()=>root.render(React.createElement(Notice,{enabled,scope:'admin-session',year,level})));
    const succeed=(i,total,pendingCount=total,waitingSyncCount=0)=>act(async()=>reads[i].resolve({total,pendingCount,waitingSyncCount}));
    await render(false);assert.equal(reads.length,0);
    await render(true);assert.deepEqual(reads[0].payload,{schoolYear:'2026-2027',level:'thcs'});assert.equal(current.loaded,false);
    await succeed(0,2);assert.equal(current.count,2);assert.equal(current.loaded,true);
    await act(async()=>page.dispatchEvent(new page.Event('profile-intake-updated')));assert.equal(reads.length,2);
    await succeed(1,1,0,1);assert.equal(current.pendingCount,0);assert.equal(current.waitingSyncCount,1);
    await act(async()=>{tick();tick();});assert.equal(reads.length,3,'reads cannot overlap');
    await act(async()=>reads[2].reject(new Error('Temporary disconnect')));assert.equal(current.count,1,'failed refresh must not hide known work');assert.match(current.error,/disconnect/);
    // The queued refresh still gets the latest count after an in-flight change.
    assert.equal(reads.length,4);await succeed(3,3);assert.equal(current.error,'');assert.equal(current.count,3);
    Object.defineProperty(page.document,'visibilityState',{configurable:true,value:'hidden'});await act(async()=>tick());assert.equal(reads.length,4,'hidden tabs do not poll');
    Object.defineProperty(page.document,'visibilityState',{configurable:true,value:'visible'});
    await act(async()=>tick());await render(true,'2025-2026','primary');assert.equal(reads[4].signal.aborted,true);assert.equal(current.count,0);assert.equal(current.loaded,false);
    assert.deepEqual(reads[5].payload,{schoolYear:'2025-2026',level:'primary'});await succeed(4,99);assert.equal(current.count,0,'late response from a previous year is ignored');await succeed(5,1);assert.equal(current.count,1);
    await act(async()=>tick());await act(async()=>reads[6].resolve({}));assert.equal(current.count,1);assert.ok(current.error,'malformed data is not an empty queue');
    await act(async()=>tick());await render(false);assert.equal(reads[7].signal.aborted,true);assert.equal(current.count,0);assert.equal(cleared,true);await succeed(7,50);assert.equal(current.count,0);
  }finally{if(root)await act(async()=>root.unmount());page.close();Object.assign(globalThis,previous);await rm(dir,{recursive:true,force:true});}
});
