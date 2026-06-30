const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assemble, transformPaths, hasMermaid } = require('../../htmlAssembler');

const TEMPLATE =
  '<!doctype html><html><head><title>t</title></head>' +
  '<body><script type="text/markdown" id="book-md">__SLOT__<\/script></body></html>';
const cfg = { theme: 'paper', flip: 'scroll', size: 18, lead: 1.9, font: 'sans' };
const noop = s => s;

// --- transformPaths ---

test('rewrites relative image src', () => {
  const result = transformPaths('![a](img/p.png)', s => 'R:' + s);
  assert.ok(result.includes('R:img/p.png'));
});

test('leaves https URL untouched', () => {
  let called = 0;
  const result = transformPaths('![a](https://x/p.png)', () => { called++; return 'X'; });
  assert.ok(result.includes('https://x/p.png'));
  assert.strictEqual(called, 0);
});

test('leaves protocol-relative // untouched', () => {
  const result = transformPaths('![a](//cdn/p.png)', () => 'X');
  assert.ok(result.includes('//cdn/p.png'));
});

test('leaves data: URI untouched', () => {
  const result = transformPaths('![a](data:image/png;base64,AAA)', () => 'X');
  assert.ok(result.includes('data:image/png;base64,AAA'));
});

test('preserves title attr', () => {
  const result = transformPaths('![a](p.png "T")', s => 'R:' + s);
  assert.ok(result.includes('R:p.png'));
  assert.ok(result.includes('"T"'));
});

test('multiple images all rewritten', () => {
  const result = transformPaths('![a](a.png) ![b](b.png)', s => 'R:' + s);
  assert.ok(result.includes('R:a.png'));
  assert.ok(result.includes('R:b.png'));
});

test('no-image text unchanged', () => {
  const result = transformPaths('plain text', () => 'X');
  assert.strictEqual(result, 'plain text');
});

test('resolver throw → original kept', () => {
  const result = transformPaths('![a](p.png)', () => { throw new Error('oops'); });
  assert.ok(result.includes('p.png'));
});

// --- hasMermaid ---

test('true for mermaid fence', () => {
  assert.ok(hasMermaid('```mermaid\nA-->B\n```'));
});

test('true with extra backticks/spaces', () => {
  assert.ok(hasMermaid('````   mermaid\nx\n````'));
});

test('false for non-mermaid fence', () => {
  assert.strictEqual(hasMermaid('```js\nx\n```'), false);
});

test('false when mermaid only in prose', () => {
  assert.strictEqual(hasMermaid('I like mermaid diagrams'), false);
});

// --- assemble ---

test('injects MD into book-md slot', () => {
  const result = assemble({ templateHtml: TEMPLATE, markdownText: '# Hi', config: cfg, pathResolver: noop, mermaidUri: null, docName: 'D' });
  assert.ok(result.includes('id="book-md">') || result.includes("id='book-md'>"));
  assert.ok(result.includes('# Hi'));
  assert.ok(!result.includes('__SLOT__'));
});

test('escapes </script> in MD', () => {
  const result = assemble({ templateHtml: TEMPLATE, markdownText: 'before</script>after', config: cfg, pathResolver: noop, mermaidUri: null, docName: 'D' });
  // htmlAssembler가 </script>를 <\/script>로 이스케이프해야 함
  // JS 문자열에서 '\\/' = 실제 문자 \/
  assert.ok(result.includes('before<\\/script>after'));
});

test('injects config/env/docName', () => {
  const result = assemble({ templateHtml: TEMPLATE, markdownText: '# x', config: cfg, pathResolver: noop, mermaidUri: null, docName: 'D' });
  assert.ok(result.includes('window.VSCODE_CONFIG'));
  assert.ok(result.includes('"paper"'));
  assert.ok(result.includes('window.IS_VSCODE_ENV = true'));
  assert.ok(result.includes('window.VSCODE_DOC_NAME'));
  assert.ok(result.includes('"D"'));
});

test('mermaid script injected when uri + mermaid fence', () => {
  const result = assemble({ templateHtml: TEMPLATE, markdownText: '```mermaid\nA-->B\n```', config: cfg, pathResolver: noop, mermaidUri: 'M.js', docName: 'D' });
  assert.ok(result.includes('M.js'));
});

test('no mermaid script when no fence', () => {
  const result = assemble({ templateHtml: TEMPLATE, markdownText: '# plain', config: cfg, pathResolver: noop, mermaidUri: 'M.js', docName: 'D' });
  assert.ok(!result.includes('M.js'));
});

test('no mermaid script when uri null', () => {
  const result = assemble({ templateHtml: TEMPLATE, markdownText: '```mermaid\nA-->B\n```', config: cfg, pathResolver: noop, mermaidUri: null, docName: 'D' });
  assert.ok(!result.includes('src="null"'));
});

test('path transform applied', () => {
  const result = assemble({ templateHtml: TEMPLATE, markdownText: '![x](pic.png)', config: cfg, pathResolver: s => 'R:' + s, mermaidUri: null, docName: 'D' });
  assert.ok(result.includes('R:pic.png'));
});

test('docName special chars JSON-escaped', () => {
  const result = assemble({ templateHtml: TEMPLATE, markdownText: '# x', config: cfg, pathResolver: noop, mermaidUri: null, docName: 'a"b' });
  assert.ok(!result.includes('"a"b"'));
  assert.ok(result.includes('a') && result.includes('b'));
  assert.ok(result.includes('"a\\"b"'), 'JSON-escaped docName not found');
});
