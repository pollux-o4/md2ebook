#!/usr/bin/env node
/* 리더 동작(검색·네비·시트·설정) 브라우저 회귀 테스트.
 *
 * 실행:  node test/search.spec.js
 * 의존:  playwright-core + 시스템 Chrome.
 *        크롬 경로는 env PLAYWRIGHT_CHROME 로 덮어쓸 수 있음.
 *        (정본 dir 에 node_modules 가 없으면 extension/ 의 playwright-core 를 재사용)
 *
 * 페이지로 분할되는 테스트 문서를 build.py 로 만들어 헤드리스 크롬에 띄우고,
 * Ctrl+F 검색과 기존 기능(페이지 이동·Esc 시트 닫기·설정 reflow·모드 전환)이
 * 깨지지 않는지 단언한다. DOM·페이지네이션 의존부의 회귀 가드.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

let chromium;
try { ({ chromium } = require('playwright-core')); }
catch { ({ chromium } = require(path.resolve(__dirname, '..', '..', '..', 'extension', 'node_modules', 'playwright-core'))); }

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..');
const CHROME = process.env.PLAYWRIGHT_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// 여러 페이지로 분할되도록 더미 문단을 채우고, 검색어 TARGET 을 ch1·3·5 의 문단 2·7 에 배치(총 6건).
function makeDoc() {
  const lines = ['# 검색 테스트 문서', ''];
  for (let ch = 1; ch <= 5; ch++) {
    lines.push(`## 챕터 ${ch}`, '');
    for (let p = 0; p < 12; p++) {
      const mark = ([1, 3, 5].includes(ch) && [2, 7].includes(p)) ? ' TARGET' : '';
      lines.push(`챕터 ${ch} 문단 ${p}: 페이지를 넘기기 위한 더미 텍스트 라라라 리리리 가나다라마바사아자차카타파하 더미 더미.${mark}`, '');
    }
  }
  return lines.join('\n');
}

const results = [];
const check = (name, cond, got) => results.push({ name, ok: !!cond, got });

async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md2e-'));
  const md = path.join(tmp, 'doc.md'), html = path.join(tmp, 'doc.html');
  fs.writeFileSync(md, makeDoc(), 'utf8');
  execFileSync('python', ['build.py', md, html], { cwd: ROOT, stdio: 'pipe' });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file:///' + html.replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.waitForTimeout(1500); // 페이지네이션 대기

    const R = await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const fire = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: k === 'f', bubbles: true, cancelable: true }));
      const o = {};
      o.pages = pages.length;

      // 검색: Ctrl+F → TARGET → 6건, 페이지 점프, prev wrap
      fire('f'); o.barOpen = !document.getElementById('searchBar').hidden;
      const inp = document.getElementById('searchInput'); inp.value = 'TARGET'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      o.hits = srchHits.length; o.count1 = document.getElementById('searchCount').textContent; // 1/6
      prevMatch(); o.wrapCount = document.getElementById('searchCount').textContent;          // 1/6 → wrap → 6/6
      nextMatch();                                                                            // 다시 1/6
      // 6건을 끝까지 진행: 카운터 2..6/6, 방문 페이지 유효·여러 페이지 분포 (정확한 페이지번호는 분할에 따라 달라 비고정)
      const counts = []; const pagesSeen = new Set(); let allValid = true;
      for (let k = 0; k < 5; k++) { nextMatch(); counts.push(document.getElementById('searchCount').textContent); pagesSeen.add(current); if (!(current >= 0 && current < pages.length)) allValid = false; }
      o.counts = counts; o.distinctPages = pagesSeen.size; o.allValid = allValid;
      // 오검색
      inp.value = 'ZZZNOPE'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      o.noneCount = document.getElementById('searchCount').textContent; o.noneMarks = document.querySelectorAll('#padBelow mark.search-hit').length;
      closeSearch(); o.marksClearedAfterClose = document.querySelectorAll('#padBelow mark.search-hit').length;

      // 기존 기능 회귀
      settings.flip = 'flip3d'; applySettings(); reflow(); current = 0; renderBase(); await sleep(50);
      document.activeElement && document.activeElement.blur();
      fire('ArrowRight'); await sleep(550); o.navRight = current;
      fire('ArrowLeft'); await sleep(550); o.navLeft = current;

      document.getElementById('btnToc').click(); await sleep(40);
      o.tocOpened = document.getElementById('tocSheet').classList.contains('show');
      fire('Escape'); await sleep(40);
      o.tocClosedByEsc = !document.getElementById('tocSheet').classList.contains('show');

      const before = pages.length; document.getElementById('sizeUp').click();
      o.reflowOk = pages.length > 0 && current >= 0 && current < pages.length; document.getElementById('sizeDown').click();

      settings.flip = 'scroll'; applySettings(); reflow(); renderBase();
      o.scrollHeadings = document.querySelectorAll('#padBelow h1,#padBelow h2').length;
      settings.flip = 'flip3d'; applySettings(); reflow();
      return o;
    });

    check('페이지 2개 이상 분할', R.pages >= 2, R.pages);
    check('Ctrl+F 검색바 열림', R.barOpen, R.barOpen);
    check('TARGET 6건', R.hits === 6, R.hits);
    check('첫 결과 1/6', R.count1 === '1 / 6', R.count1);
    check('prev 가 6/6 로 wrap', R.wrapCount === '6 / 6', R.wrapCount);
    check('다음 진행 2..6/6', JSON.stringify(R.counts) === JSON.stringify(['2 / 6', '3 / 6', '4 / 6', '5 / 6', '6 / 6']), R.counts);
    check('결과가 여러 페이지에 분포', R.distinctPages >= 2, R.distinctPages);
    check('점프한 페이지 모두 유효', R.allValid, R.allValid);
    check('오검색 "없음"·마크0', R.noneCount === '없음' && R.noneMarks === 0, [R.noneCount, R.noneMarks]);
    check('닫으면 하이라이트 정리', R.marksClearedAfterClose === 0, R.marksClearedAfterClose);
    check('화살표 다음 페이지', R.navRight === 1, R.navRight);
    check('화살표 이전 페이지', R.navLeft === 0, R.navLeft);
    check('Esc 가 TOC 시트 닫음', R.tocOpened && R.tocClosedByEsc, [R.tocOpened, R.tocClosedByEsc]);
    check('설정 변경 reflow 정상', R.reflowOk, R.reflowOk);
    check('스크롤 모드 전체 렌더', R.scrollHeadings > 0, R.scrollHeadings);
    check('JS 런타임 에러 없음', errors.length === 0, errors);
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

run().then(() => {
  const fail = results.filter(r => !r.ok);
  results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  → ' + JSON.stringify(r.got)}`));
  console.log(`\n=== search.spec.js : ${results.length - fail.length} PASS / ${fail.length} FAIL ===`);
  process.exit(fail.length ? 1 : 0);
}).catch(e => { console.error('실행 오류:', e); process.exit(2); });
