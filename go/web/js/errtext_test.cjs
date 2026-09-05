'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extractErrText(src) {
  const start = src.indexOf('function errText(err)');
  if (start < 0) throw new Error('function errText(err) not found in app.js');
  const brace = src.indexOf('{', start);
  if (brace < 0) throw new Error('errText body not found');
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed errText function');
}

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const fnSrc = extractErrText(src);
const errText = vm.runInNewContext(fnSrc + '\nerrText;');
if (typeof errText !== 'function') {
  throw new Error('failed to eval extracted errText');
}

test('errText does not repeat data.error already in the message', () => {
  assert.equal(errText({ message: 'X', data: { error: 'X' } }), 'X');
});

test('errText appends extra fields that are not error or message', () => {
  const out = errText({ message: 'X', data: { error: 'X', detail: 'Y' } });
  assert.ok(out.includes('Y'), 'got ' + out);
  assert.ok(out.includes('|'), 'got ' + out);
  assert.equal(out.includes('"error"'), false);
});

test('errText includes truncated data.raw from a non-JSON response', () => {
  const raw = 'z'.repeat(250);
  const out = errText({ message: 'X', data: { error: 'X', raw } });
  assert.ok(out.includes('z'.repeat(200)), 'got ' + out.slice(0, 80) + '...');
  assert.equal(out.includes('z'.repeat(201)), false);
  assert.ok(out.includes('|'), 'got ' + out);
});
