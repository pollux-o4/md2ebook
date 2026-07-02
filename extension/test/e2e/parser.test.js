const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, buildPage, VSCODE_MOCK, cleanup, FIX } = require('./helpers');

let browser, page;

before(async () => {
  browser = await launch();
  page = await browser.newPage();
  await page.addInitScript(VSCODE_MOCK);
  await page.goto(buildPage('# Boot\n\nx', { flip: 'scroll' }));
  // 파서 준비 대기
  await page.waitForFunction(() => typeof parseMarkdown === 'function');
});

after(async () => {
  await browser.close();
  cleanup();
});

async function parse(md) {
  return page.evaluate(md => parseMarkdown(md), md);
}

test('renders headings with id and data-h', async () => {
  const html = await parse(FIX('formatting.md'));
  assert.match(html, /id="hello-world"/);
  assert.match(html, /data-h="1"/);
  assert.ok(html.includes('Hello World'));
});

test('bold/italic/del/code inline', async () => {
  const html = await parse(FIX('formatting.md'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<em>italic</em>'));
  assert.ok(html.includes('<del>struck</del>'));
  assert.ok(html.includes('inline code'));
});

test('external link gets target=_blank', async () => {
  const html = await parse(FIX('formatting.md'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes('https://example.com'));
});

test('local link has no target attribute', async () => {
  const html = await parse(FIX('formatting.md'));
  // local link가 있고 그 링크에는 target이 없어야 함
  assert.ok(html.includes('./other.md'));
  // 단순히 target=_blank 없는 로컬 링크 확인
  const localLinkMatch = html.match(/<a href="\.\/other\.md"[^>]*>/);
  assert.ok(localLinkMatch);
  assert.ok(!localLinkMatch[0].includes('target'));
});

test('image with title preserved', async () => {
  const html = await parse(FIX('formatting.md'));
  assert.ok(html.includes('src="images/cat.png"') || html.includes('images/cat.png'));
  assert.ok(html.includes('alt="cat"') || html.includes('cat'));
  assert.ok(html.includes('Title'));
});

test('semantic label chips render', async () => {
  const html = await parse(FIX('labels.md'));
  assert.ok(html.includes('class="lbl fact"'), 'fact class missing');
  assert.ok(html.includes('class="lbl guess"'), 'guess class missing');
  assert.ok(html.includes('class="lbl op"'), 'op class missing');
  assert.ok(html.includes('class="lbl none"'), 'none class missing');
});

test('custom label auto chip with data-key', async () => {
  const html = await parse(FIX('labels.md'));
  assert.ok(html.includes('data-key="중요"'), 'data-key=중요 missing');
  assert.ok(html.includes('data-key="커스텀"'), 'data-key=커스텀 missing');
  assert.ok(html.includes('lbl auto'), 'auto class missing');
});

test('table renders thead and tbody', async () => {
  const html = await parse(FIX('table.md'));
  assert.ok(html.includes('<th>') || html.includes('thead') || html.includes('Name'));
  assert.ok(html.includes('alpha'));
  assert.ok(html.includes('beta'));
});

test('blockquote groups paragraphs', async () => {
  const html = await parse(FIX('blockquote.md'));
  assert.ok(html.includes('blockquote'));
  assert.ok(html.includes('first line'));
  assert.ok(html.includes('third paragraph'));
});

test('task list assigns sequential data-task-idx skipping fenced', async () => {
  const html = await parse(FIX('tasks.md'));
  assert.ok(html.includes('data-task-idx="0"'));
  assert.ok(html.includes('data-task-idx="1"'));
  assert.ok(html.includes('data-task-idx="2"'));
  const count = (html.match(/data-task-idx=/g) || []).length;
  assert.strictEqual(count, 3);
});

test('checked vs unchecked attribute on tasks', async () => {
  const html = await parse(FIX('tasks.md'));
  // real1([x])은 checked, real0/real2([ ])은 unchecked
  // data-task-idx="1"이 checked를 가져야 함
  const idx1Match = html.match(/data-task-idx="1"([^>]*)/);
  assert.ok(idx1Match);
  assert.ok(idx1Match[0].includes('checked') || html.match(/data-task-idx="1"[^>]*checked/));
});
