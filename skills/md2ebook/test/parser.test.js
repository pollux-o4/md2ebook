#!/usr/bin/env node
/* 파서 회귀 테스트 — 의존성 없음.  실행:  node test/parser.test.js
 *
 * 정본 src/app.js 에서 parseMarkdown(+헬퍼)만 떼어내 평가한 뒤, 입력→기대출력
 * 단언으로 검증한다. 렌더 규칙이 바뀌면 이 파일의 기대값을 같이 갱신할 것.
 * (DOM 의존 기능 — 페이지네이션·검색·설정 — 은 test/search.spec.js / 수동 브라우저 검증.)
 */
const fs = require('fs');
const path = require('path');

// --- 정본 파서 추출: `function esc(` ~ parseMarkdown 의 `return html;}` 까지 ---
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const start = appSrc.indexOf('function esc(');
const endMark = '\n  return html;\n}';
const end = appSrc.indexOf(endMark);
if (start < 0 || end < 0) { console.error('파서 블록을 src/app.js 에서 찾지 못함'); process.exit(2); }
const parserCode = appSrc.slice(start, end + endMark.length);
const parseMarkdown = new Function(parserCode + '\nreturn parseMarkdown;')();

let pass = 0, fail = 0;
function eq(name, input, expected) {
  let out; try { out = parseMarkdown(input); } catch (e) { out = 'THROW:' + e.message; }
  if (out === expected) pass++;
  else { fail++; console.log(`FAIL [${name}]\n  in : ${JSON.stringify(input)}\n  exp: ${expected}\n  got: ${out}`); }
}
function ok(name, cond, detail) { if (cond) pass++; else { fail++; console.log(`FAIL [${name}] ${detail || ''}`); } }

const NL = '\n';

/* === 1:1 줄바꿈 보존 (줄바꿈 1개→<br>, 빈 줄→문단) === */
eq('para-2줄→br',        'A' + NL + 'B',                 '<p>A<br>B</p>');
eq('para-3줄→br',        'A' + NL + 'B' + NL + 'C',      '<p>A<br>B<br>C</p>');
eq('두 문단',            'A' + NL + NL + 'B',            '<p>A</p><p>B</p>');

/* === 목록: loose 연속문단 / lazy 이어쓰기 / 중첩 / ul·ol 분리 / 체크박스 === */
eq('불릿 lazy 이어쓰기', '- a' + NL + '  b',             '<ul><li>a<br>b</li></ul>');
eq('불릿 lazy 2줄',      '- a' + NL + '  b' + NL + '  c', '<ul><li>a<br>b<br>c</li></ul>');
eq('불릿 빈줄 연속문단',  '- a' + NL + NL + '  p1' + NL + '  p2', '<ul><li><p>a</p><p>p1<br>p2</p></li></ul>');
eq('중첩+빈줄 연속문단',  '- n' + NL + '  - x' + NL + '  - y' + NL + NL + '  c',
                         '<ul><li>n<ul><li>x</li><li>y</li></ul><p>c</p></li></ul>');
eq('중첩 하위 lazy',     '- L' + NL + '  - it)' + NL + '    (note)',
                         '<ul><li>L<ul><li>it)<br>(note)</li></ul></li></ul>');
eq('ul→ol 분리',         '- a' + NL + NL + '1. b',        '<ul><li>a</li></ul><ol><li>b</li></ol>');
eq('불릿후 비들여쓰기',   '- a' + NL + 'b',               '<ul><li>a</li></ul><p>b</p>');
eq('체크박스',           '- [ ] t' + NL + '- [x] d',
                         '<ul><li class="task"><input type="checkbox" data-task-idx="0"> t</li><li class="task"><input type="checkbox" data-task-idx="1" checked> d</li></ul>');
eq('체크박스+lazy',      '- [ ] t' + NL + '  more',
                         '<ul><li class="task"><input type="checkbox" data-task-idx="0"> t<br>more</li></ul>');

/* === 헤딩 / 인용 / 표 / 코드 / 서식 === */
eq('헤딩 H1',            '# H',                          '<h1 id="h" data-h="1">H</h1>');
eq('인용 다줄→br',       '> q1' + NL + '> q2',           '<blockquote><p>q1<br>q2</p></blockquote>');
eq('인용 빈줄 분리',     '> q1' + NL + '>' + NL + '> q2', '<blockquote><p>q1</p><p>q2</p></blockquote>');
eq('표',                 '| h |' + NL + '|---|' + NL + '| 1 |',
                         '<div class="table-wrap"><table><thead><tr><th>h</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>');
eq('굵게/기울임/코드',    '**b** *i* `c`',                '<p><strong>b</strong> <em>i</em> <code>c</code></p>');
eq('인라인코드 파이프',   'x `a|b` y',                    '<p>x <code>a|b</code> y</p>');

/* === 회귀: 고아 표행 무한루프(과거 버그) — 멈추지 않고 단락 처리 === */
eq('고아 표행',          '| 고아 | 행 |',                 '<p>| 고아 | 행 |</p>');
eq('표 뒤 고아행',       '- x' + NL + NL + '| a | b |' + NL + NL + '끝',
                         '<ul><li>x</li></ul><p>| a | b |</p><p>끝</p>');

/* === 코드펜스: 줄바꿈 verbatim (br 변환 금지) === */
(() => {
  const out = parseMarkdown('```' + NL + 'l1' + NL + 'l2' + NL + '```');
  ok('코드펜스 verbatim', out.includes('l1\nl2') && !out.includes('l1<br>l2'), out);
})();

/* === 적대 엣지: 빈 입력 / 빈 줄만 (무한루프·예외 없어야) === */
eq('빈 입력',            '',                             '');
eq('빈 줄만',            NL + NL + NL,                   '');

console.log(`\n=== parser.test.js : ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
