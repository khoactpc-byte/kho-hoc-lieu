import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('phone news opens the full original announcement; Drive portraits use actual image endpoints and recover from failures', async () => {
  const directory = await mkdtemp(resolve('node_modules/.mobile-ux-'));
  const page = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = Object.fromEntries(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key => [key,globalThis[key]]));
  Object.assign(globalThis, { window: page, document: page.document, IS_REACT_ACT_ENVIRONMENT: true });
  page.innerWidth = 390;
  let root;
  try {
    const outfile = join(directory,'fixture.mjs');
    await build({ stdin: { contents: "export {default as News} from './src/components/MobileNewsList.jsx'; export {default as Portrait} from './src/components/StudentPortrait.jsx'; export {default as Classes} from './src/components/TeacherClassPicker.jsx';", resolveDir: resolve('.') }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
    const { News, Portrait, Classes } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client'); root = createRoot(page.document.getElementById('root'));
    const item = { id:'notice', title:'Thời khóa biểu', createdAt: Date.now(), content:'<table><tr><td>Nội dung chi tiết</td></tr></table>' };
    let opened, chosen;
    await act(async () => root.render(React.createElement(News,{items:[item],onOpen:value=>{opened=value;}})));
    assert.equal(page.document.querySelector('table'),null);
    assert.doesNotMatch(page.document.body.textContent,/Nội dung chi tiết/);
    await act(async () => page.document.querySelector('button').click());
    assert.equal(opened,item);
    await act(async () => root.render(React.createElement(Portrait,{url:'https://drive.google.com/file/d/drive-fixture/view',name:'Học sinh mẫu'})));
    assert.match(page.document.querySelector('img').src,/googleusercontent\.com\/d\/drive-fixture/);
    await act(async () => page.document.querySelector('img').dispatchEvent(new page.Event('error')));
    assert.match(page.document.querySelector('img').src,/drive\.google\.com\/thumbnail/);
    await act(async () => page.document.querySelector('img').dispatchEvent(new page.Event('error')));
    assert.equal(page.document.querySelector('img'),null);
    assert.equal(page.document.querySelector('iframe'),null);
    assert.match(page.document.querySelector('[role="img"]').getAttribute('aria-label'),/Chưa tải được ảnh/);
    await act(async () => root.render(React.createElement(Classes,{profile:{grades:['6','7']},grade:'6',onChange:value=>{chosen=value;}})));
    const select = page.document.querySelector('select');
    assert.ok(select,'phone classes are one selector instead of a grid of large buttons');
    await act(async () => { select.value='7'; select.dispatchEvent(new page.Event('change',{bubbles:true})); });
    assert.equal(chosen,'7');
  } finally {
    if(root) await act(async()=>root.unmount()); page.close();
    for(const [key,value] of Object.entries(previous)) { if(value===undefined)delete globalThis[key]; else globalThis[key]=value; }
    await rm(directory,{recursive:true,force:true});
  }
});
