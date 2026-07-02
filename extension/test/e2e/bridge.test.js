const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, buildPage, VSCODE_MOCK, cleanup, FIX } = require('./helpers');

let browser;

before(async () => { browser = await launch(); });
after(async () => { await browser.close(); cleanup(); });

async function newPage(md, config = {}) {
  const page = await browser.newPage();
  await page.addInitScript(VSCODE_MOCK);
  await page.goto(buildPage(md, { flip: 'scroll', ...config }));
  // 부팅 완료 대기
  await page.waitForFunction(() => document.getElementById('docTitle') !== null);
  // 부팅 중 발생한 postMessage 초기화
  await page.evaluate(() => { window.__posted = []; });
  return page;
}

test('boots without JS error', async () => {
  const errors = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e));
  await page.addInitScript(VSCODE_MOCK);
  await page.goto(buildPage(FIX('doc-a.md'), { flip: 'scroll' }));
  await page.waitForFunction(() => document.getElementById('docTitle') !== null);
  assert.strictEqual(errors.length, 0);
  const title = await page.evaluate(() => document.getElementById('docTitle').textContent);
  assert.ok(title.includes('Title A'));
  await page.close();
});

test('checkbox click posts toggleTask message', async () => {
  const page = await newPage(FIX('doc-a.md'));
  // 스크롤 모드에서 체크박스 렌더 확인 후 클릭
  await page.waitForFunction(() => document.querySelector('input[type=checkbox][data-task-idx="0"]') !== null);
  await page.evaluate(() => {
    document.querySelector('input[type=checkbox][data-task-idx="0"]').click();
  });
  const posted = await page.evaluate(() => window.__posted);
  const msg = posted.find(m => m.command === 'toggleTask');
  assert.ok(msg, 'toggleTask 메시지가 없음');
  assert.strictEqual(msg.taskIdx, 0);
  assert.strictEqual(msg.checked, true);
  await page.close();
});

test('theme swatch click posts saveConfig', async () => {
  const page = await newPage(FIX('doc-a.md'));
  await page.waitForFunction(() => document.querySelector('[data-theme="sepia"]') !== null);
  await page.evaluate(() => {
    document.querySelector('[data-theme="sepia"]').click();
  });
  const posted = await page.evaluate(() => window.__posted);
  const msg = posted.find(m => m.command === 'saveConfig');
  assert.ok(msg, 'saveConfig 메시지가 없음');
  assert.strictEqual(msg.config.theme, 'sepia');
  await page.close();
});

test('updateContent re-renders title and body', async () => {
  const page = await newPage(FIX('doc-a.md'));
  const titleBefore = await page.evaluate(() => document.getElementById('docTitle').textContent);
  assert.ok(titleBefore.includes('Title A'));

  await page.evaluate(md => {
    window.postMessage({ command: 'updateContent', markdown: md }, '*');
  }, FIX('doc-b.md'));

  await page.waitForFunction(
    () => document.getElementById('docTitle').textContent.includes('Title B'),
    { timeout: 5000 }
  );

  const titleAfter = await page.evaluate(() => document.getElementById('docTitle').textContent);
  assert.ok(titleAfter.includes('Title B'));

  const bodyText = await page.evaluate(() => document.getElementById('padBelow')?.textContent || document.body.textContent);
  assert.ok(bodyText.includes('Updated paragraph beta'));
  assert.ok(!bodyText.includes('Original paragraph alpha'));
  await page.close();
});

test('scrollmode class follows flip setting', async () => {
  const page = await newPage(FIX('doc-a.md'), { flip: 'flip3d' });

  // flip3d: scrollmode 클래스 없음
  const hasScrollBefore = await page.evaluate(() =>
    document.getElementById('reader').classList.contains('scrollmode')
  );
  assert.strictEqual(hasScrollBefore, false);

  // scroll 모드로 전환
  await page.waitForFunction(() => document.querySelector('[data-flip="scroll"]') !== null);
  await page.evaluate(() => document.querySelector('[data-flip="scroll"]').click());

  const hasScrollAfter = await page.evaluate(() =>
    document.getElementById('reader').classList.contains('scrollmode')
  );
  assert.strictEqual(hasScrollAfter, true);

  // flip3d로 복귀
  await page.evaluate(() => document.querySelector('[data-flip="flip3d"]').click());

  const hasScrollFinal = await page.evaluate(() =>
    document.getElementById('reader').classList.contains('scrollmode')
  );
  assert.strictEqual(hasScrollFinal, false);
  await page.close();
});

const CM6_MOCK = () => {
  window.MD2EBOOK_CM6 = {
    mount(container, options) {
      const ta = document.createElement('textarea');
      ta.setAttribute('data-mock-cm6', 'true');
      ta.style.width = '100%';
      ta.value = options.initialDoc || '';
      container.appendChild(ta);
      let _focused = false;
      ta.addEventListener('focus',  () => { _focused = true; });
      ta.addEventListener('blur',   () => { _focused = false; });
      ta.addEventListener('input',  () => { if (options.onChange) options.onChange(ta.value); });
      return {
        hasFocus: () => _focused,
        setDoc:   (md) => { if (ta.value !== md) ta.value = md; },
        getDoc:   () => ta.value,
        destroy:  () => ta.remove(),
      };
    }
  };
};

test('CM6 mounts in scroll mode when MD2EBOOK_CM6 is available', async () => {
  const page = await browser.newPage();
  await page.addInitScript(VSCODE_MOCK);
  await page.addInitScript(CM6_MOCK);
  await page.goto(buildPage(FIX('doc-a.md'), { flip: 'scroll' }));
  await page.waitForFunction(() => document.getElementById('docTitle') !== null);
  const mounted = await page.evaluate(() =>
    document.querySelector('#padBelow textarea[data-mock-cm6]') !== null
  );
  assert.ok(mounted, 'CM6 mock editor not mounted in padBelow');
  await page.close();
});

test('custom label --h CSS injected after boot', async () => {
  const page = await browser.newPage();
  await page.addInitScript(VSCODE_MOCK);
  await page.goto(buildPage(FIX('labels.md'), { flip: 'scroll' }));
  // #labelStyle 생성까지 대기 — boot() async 완료 기준
  await page.waitForFunction(
    () => { const el = document.getElementById('labelStyle'); return el && el.textContent.includes('--h:'); },
    { timeout: 5000 }
  );
  const css = await page.evaluate(() => document.getElementById('labelStyle').textContent);
  assert.ok(css.includes('--h:'), '#labelStyle에 --h 없음 — applyLabelStyle이 paginate 전에 호출됨');
  assert.ok(css.includes('[data-key="중요"]'), 'data-key=중요 CSS 누락');
  await page.close();
});

test('padBelow cleared before CM6 mount on book→scroll switch', async () => {
  const page = await browser.newPage();
  await page.addInitScript(VSCODE_MOCK);
  await page.addInitScript(CM6_MOCK);
  await page.goto(buildPage(FIX('doc-a.md'), { flip: 'flip3d' }));
  await page.waitForFunction(() => document.getElementById('docTitle') !== null);
  // book 모드 HTML 잔류 시뮬레이션
  await page.evaluate(() => {
    document.getElementById('padBelow').innerHTML =
      '<div data-sentinel="book-html">sentinel</div>';
  });
  await page.evaluate(() => document.querySelector('[data-flip="scroll"]').click());
  await page.waitForFunction(() =>
    document.querySelector('#padBelow textarea[data-mock-cm6]') !== null
  );
  const sentinel = await page.evaluate(() =>
    document.querySelector('[data-sentinel="book-html"]') !== null
  );
  assert.strictEqual(sentinel, false, 'padBelow 미초기화 — book HTML + CM6 이중 적재');
  await page.close();
});

test('edit toast shows on each scroll entry and dismisses on exit', async () => {
  const page = await browser.newPage();
  await page.addInitScript(VSCODE_MOCK);
  await page.addInitScript(CM6_MOCK);
  await page.goto(buildPage(FIX('doc-a.md'), { flip: 'scroll' }));
  // 최초 진입: 토스트 표시
  await page.waitForFunction(() => document.getElementById('editToast').classList.contains('show'));
  // flip3d 전환: 토스트 해제
  await page.evaluate(() => document.querySelector('[data-flip="flip3d"]').click());
  const hiddenAfterExit = await page.evaluate(() =>
    !document.getElementById('editToast').classList.contains('show')
  );
  assert.ok(hiddenAfterExit, 'toast가 스크롤 이탈 후에도 표시됨');
  // 재진입: 토스트 재표시
  await page.evaluate(() => document.querySelector('[data-flip="scroll"]').click());
  await page.waitForFunction(() =>
    document.getElementById('editToast').classList.contains('show')
  );
  await page.close();
});

test('CM6 unmounts when switching away from scroll mode', async () => {
  const page = await browser.newPage();
  await page.addInitScript(VSCODE_MOCK);
  await page.addInitScript(CM6_MOCK);
  await page.goto(buildPage(FIX('doc-a.md'), { flip: 'scroll' }));
  await page.waitForFunction(() =>
    document.querySelector('#padBelow textarea[data-mock-cm6]') !== null
  );
  await page.evaluate(() => document.querySelector('[data-flip="flip3d"]').click());
  await page.waitForFunction(() =>
    document.querySelector('#padBelow textarea[data-mock-cm6]') === null
  );
  const hasContent = await page.evaluate(() =>
    document.querySelector('#padBelow').innerHTML.length > 0
  );
  assert.ok(hasContent, 'padBelow empty after flip3d switch');
  await page.close();
});
