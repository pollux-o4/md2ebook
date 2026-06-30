const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { toggleCheckbox } = require('../../checkboxEditor');

const TASKS_MD = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'tasks.md'), 'utf8');

test('toggles unchecked → checked at index 0', () => {
  const md = '- [ ] a\n- [ ] b';
  const { success, updatedText } = toggleCheckbox(md, 0, true);
  assert.ok(success);
  const lines = updatedText.split('\n');
  assert.match(lines[0], /- \[x\] a/);
  assert.match(lines[1], /- \[ \] b/);
});

test('toggles checked → unchecked', () => {
  const md = '- [x] a';
  const { success, updatedText } = toggleCheckbox(md, 0, false);
  assert.ok(success);
  assert.match(updatedText, /- \[ \] a/);
});

test('targets the correct task by index', () => {
  const md = '- [ ] a\n- [ ] b\n- [ ] c';
  const { success, updatedText } = toggleCheckbox(md, 1, true);
  assert.ok(success);
  const lines = updatedText.split('\n');
  assert.match(lines[0], /\[ \]/);
  assert.match(lines[1], /\[x\]/);
  assert.match(lines[2], /\[ \]/);
});

test('recognizes uppercase [X]', () => {
  const md = '- [X] a';
  const { success, updatedText } = toggleCheckbox(md, 0, false);
  assert.ok(success);
  assert.match(updatedText, /- \[ \] a/);
});

test('ignores checkboxes inside fenced code blocks', () => {
  // real0=idx0, real1=idx1, real2=idx2 (fakeInFence는 건너뜀)
  const r0 = toggleCheckbox(TASKS_MD, 0, true);
  assert.ok(r0.success);
  assert.ok(r0.updatedText.includes('- [x] real0'));
  assert.ok(r0.updatedText.includes('- [ ] fakeInFence') || r0.updatedText.includes('fakeInFence'));

  const r2 = toggleCheckbox(TASKS_MD, 2, true);
  assert.ok(r2.success);
  assert.ok(r2.updatedText.includes('- [x] real2'));
  // fakeInFence 줄은 그대로
  assert.ok(!r2.updatedText.includes('- [x] fakeInFence'));
});

test('supports ordered-list marker', () => {
  const md = '1. [ ] a';
  const { success, updatedText } = toggleCheckbox(md, 0, true);
  assert.ok(success);
  assert.match(updatedText, /1\. \[x\] a/);
});

test('supports * and + bullets', () => {
  const md = '* [ ] a\n+ [ ] b';
  const { success, updatedText } = toggleCheckbox(md, 1, true);
  assert.ok(success);
  const lines = updatedText.split('\n');
  assert.match(lines[1], /\+ \[x\] b/);
});

test('preserves CRLF', () => {
  const md = '- [ ] a\r\n- [ ] b';
  const { success, updatedText } = toggleCheckbox(md, 0, true);
  assert.ok(success);
  assert.ok(updatedText.includes('\r\n'));
});

test('preserves LF-only', () => {
  const md = '- [ ] a\n- [ ] b';
  const { success, updatedText } = toggleCheckbox(md, 0, true);
  assert.ok(success);
  assert.ok(!updatedText.includes('\r'));
});

test('out-of-range index → no-op', () => {
  const md = '- [ ] a';
  const { success, updatedText } = toggleCheckbox(md, 5, true);
  assert.strictEqual(success, false);
  assert.strictEqual(updatedText, md);
});

test('only the bracket char changes', () => {
  const md = '  - [ ] 할 일 #tag';
  const { success, updatedText } = toggleCheckbox(md, 0, true);
  assert.ok(success);
  assert.strictEqual(updatedText, '  - [x] 할 일 #tag');
});

test('idempotent set keeps state', () => {
  const md = '- [x] a';
  const { success, updatedText } = toggleCheckbox(md, 0, true);
  assert.ok(success);
  assert.match(updatedText, /- \[x\] a/);
});

test('non-task list item is not counted', () => {
  const md = '- normal\n- [ ] task';
  const { success, updatedText } = toggleCheckbox(md, 0, true);
  assert.ok(success);
  const lines = updatedText.split('\n');
  assert.match(lines[0], /- normal/);
  assert.match(lines[1], /- \[x\] task/);
});
