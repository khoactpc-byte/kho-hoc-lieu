import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMathTypesetter } from '../src/utils/mathTypesetting.js';
const flush = () => new Promise(resolve => setImmediate(resolve));

test('math requested before CDN loading waits for startup and serializes later updates', async () => {
  const { window } = new JSDOM('<script id="MathJax-script"></script><div id="a"></div><div id="b"></div>');
  const calls = [];
  let finishStartup, finishTypeset;
  const typeset = createMathTypesetter(() => window);
  const a = window.document.getElementById('a'), b = window.document.getElementById('b');
  try {
    typeset(a); typeset(a);
    window.MathJax = { startup: { promise: new Promise(resolve => { finishStartup = resolve; }) }, typesetClear: () => {},
      typesetPromise: roots => { calls.push(roots); return new Promise(resolve => { finishTypeset = resolve; }); } };
    window.document.getElementById('MathJax-script').dispatchEvent(new window.Event('load'));
    await flush(); assert.equal(calls.length, 0);
    finishStartup(); await flush(); assert.deepEqual(calls, [[a]]);
    typeset(b); await flush(); assert.equal(calls.length, 1, 'no overlapping MathJax work');
    finishTypeset(); await flush(); assert.deepEqual(calls, [[a], [b]]);
    finishTypeset(); await flush();
    b.remove(); typeset(b); await flush(); assert.equal(calls.length, 2);
  } finally { window.close(); }
});

test('slow math loading warns once and automatically recovers when the script finally loads', async () => {
  const { window } = new JSDOM('<script id="MathJax-script"></script><div id="a"></div>');
  const warnings = [], calls = [], root = window.document.getElementById('a');
  window.addEventListener('khl-math-error', event => warnings.push(event.detail));
  const typeset = createMathTypesetter(() => window, 5);
  try {
    typeset(root);
    await new Promise(resolve => window.setTimeout(resolve, 15));
    assert.equal(warnings.length, 1);
    window.MathJax = { typesetPromise: async roots => { calls.push(roots); } };
    window.document.getElementById('MathJax-script').dispatchEvent(new window.Event('load'));
    await new Promise(resolve => window.setTimeout(resolve, 5));
    assert.deepEqual(calls, [[root]]);
  } finally { window.close(); }
});
