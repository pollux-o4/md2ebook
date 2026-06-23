/* =========================================================================
   1) 미니 마크다운 → HTML 파서
   지원: # ## ###, **bold**, `code`, [라벨]칩, > 인용(연속),
        ``` 코드펜스, | 표 |, - 목록, 단락, *italic*, ---
   ========================================================================= */
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const LABELS = { '사실':'fact','추정':'guess','의견':'op','모름':'none' };
// 자주 쓰는 라벨은 hue 를 고정(종이/신문 톤). 한/영 별칭 동일 색.
const HUES = {
  '중요':6,'IMPORTANT':6, 'TODO':214,'할일':214, '질문':278,'QUESTION':278,
  '참고':158,'NOTE':158,'REF':158, '경고':32,'WARNING':32, '팁':176,'TIP':176,
};
// 예약 hue 없으면 단어 해시 → 0~359 (같은 단어는 항상 같은 색)
function hue(s){
  if (HUES[s] != null) return HUES[s];
  let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h%360;
}
const usedLabels = new Set();   // 문서에 쓰인 커스텀(비시맨틱) 라벨 — 설정에서 색 조절용
let taskIdx = 0;                 // 체크박스 안정 인덱스 (parseMarkdown 시작 시 0으로 리셋)
function attr(s){ return esc(s).replace(/"/g,'&quot;'); }

// 널바이트 자리표시자 단일 소스 — 코드/이미지를 esc 전에 빼두고 마지막에 되꽂는다.
const NUL = String.fromCharCode(0);
const PH = n => NUL + n + NUL;
const RE_PH = new RegExp(NUL + '(\\d+)' + NUL, 'g');
// 인라인 정규식 호이스팅(모듈 스코프) — 매 호출 재컴파일 회피.
// CommonMark 코드 스팬 — 여는 백틱 N개 ~ 닫는 백틱 N개. double-backtick(``)도 처리.
const RE_CODE = /(`+)((?:(?!\1)[\s\S])+?)\1/g;
const RE_LABEL = /^\[(.+)\]$/;
const RE_IMG = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const RE_BOLD = /\*\*([^*]+)\*\*/g;
const RE_ITAL = /(^|[^*])\*([^*\n]+)\*/g;
const RE_DEL = /~~([^~]+)~~/g;
const RE_LINK = /(^|[^!])\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const RE_EXT = /^(https?:|mailto:|\/\/)/i;

// 라벨 칩 렌더 — 시맨틱 고정색이면 매핑 클래스, 아니면 .lbl.auto + data-key(usedLabels 등록).
function renderLabel(key, raw){ if (LABELS[key]) return '<span class="lbl '+LABELS[key]+'">'+esc(raw)+'</span>'; usedLabels.add(key); return '<span class="lbl auto" data-key="'+attr(key)+'">'+esc(raw)+'</span>'; }

function inline(text){
  // 코드 먼저 추출(내부는 이스케이프, 인라인 처리 안 함) → 자리표시자
  const codes = [];
  text = text.replace(RE_CODE, (m, ticks, c) => {
    // CommonMark: 양쪽 공백 1개씩 트림(내용이 공백뿐이 아닐 때) — ``  `x`  `` → ` `x` `
    let body = c;
    if (body.length >= 2 && body.charCodeAt(0) === 32 && body.charCodeAt(body.length-1) === 32 && body.trim() !== '') body = body.slice(1, -1);
    const t = body.trim();
    const lm = RE_LABEL.exec(t);              // [사실] 같은 라벨에서 대괄호 제거
    const html = lm ? renderLabel(lm[1], t) : '<code>'+esc(body)+'</code>';
    codes.push(html); return PH(codes.length-1);
  });
  // 이미지 ![대체텍스트](src "제목") — src 보존 위해 esc 전에 자리표시자로 추출.
  text = text.replace(RE_IMG, (m, alt, src, title) => {
    const tt = title ? ' title="'+attr(title)+'"' : '';
    codes.push('<img src="'+src+'" alt="'+attr(alt)+'"'+tt+'>');
    return PH(codes.length-1);
  });
  // raw 인라인 SVG 보존 — esc 전에 통째로 빼두고 마지막에 되꽂는다(표준 마크다운 동작).
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, (m) => { codes.push(m); return PH(codes.length-1); });
  text = esc(text);
  // 줄바꿈용 raw <br> 만 복원(GFM 표준) — 그 외 태그는 이스케이프 유지(XSS 방지)
  text = text.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  text = text.replace(RE_BOLD, '<strong>$1</strong>');
  text = text.replace(RE_ITAL, '$1<em>$2</em>');
  text = text.replace(RE_DEL, '<del>$1</del>');
  // 링크 [텍스트](url "제목") — 이미지(! 앞)는 제외. 외부 http 는 새 탭, 로컬은 같은 탭.
  text = text.replace(RE_LINK, (m, pre, txt, href, title) => {
    const ext = RE_EXT.test(href);
    const tgt = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
    const tt = title ? ' title="'+attr(title)+'"' : '';
    return pre + '<a href="'+href.replace(/"/g,'&quot;')+'"'+tgt+tt+'>'+txt+'</a>';
  });
  text = text.replace(RE_PH, (m, i) => codes[+i]);
  return text;
}

function slug(s){
  return s.toLowerCase().replace(/<[^>]+>/g,'').replace(/[^\w\uac00-\ud7a3\s-]/g,'')
    .trim().replace(/\s+/g,'-').slice(0,60) || 'h';
}

// 목록 렌더 — 들여쓰기로 중첩, 줄당 한 항목, 체크박스 지원
function renderList(items){
  let out = ''; const stack = [];   // stack: [{indent, ordered}]
  const closeTo = n => { while (stack.length > n){ const t = stack.pop();
    out += '</li>' + (t.ordered ? '</ol>' : '</ul>'); } };
  items.forEach(it => {
    while (stack.length && it.indent < stack[stack.length-1].indent) closeTo(stack.length-1);
    const top = stack[stack.length-1];
    if (top && it.indent <= top.indent){ out += '</li>'; }
    else { stack.push({ indent: it.indent, ordered: it.ordered });
           out += it.ordered ? '<ol>' : '<ul>'; }
    const cb = /^\[([ xX])\]\s+([\s\S]*)$/.exec(it.text);
    if (cb){ const ck = cb[1].toLowerCase()==='x' ? ' checked' : '';
      out += '<li class="task"><input type="checkbox" data-task-idx="'+(taskIdx++)+'"'+ck+'> '+inline(cb[2]); }
    else { out += '<li>'+inline(it.text); }
  });
  closeTo(0);
  return out;
}

function parseMarkdown(md){
  const lines = md.replace(/\r/g,'').split('\n');
  let html = '', i = 0; const usedIds = {};
  taskIdx = 0;   // 체크박스 인덱스 리셋 — 같은 문서면 항상 동일한 idx 배정
  const mkId = base => { let id = base, n = 2; while(usedIds[id]){ id = base+'-'+n++; } usedIds[id]=1; return id; };

  while (i < lines.length){
    let line = lines[i];

    // 코드펜스
    if (/^```/.test(line)){
      const lang = (/^`{3,}\s*([\w-]*)/.exec(line)||[])[1] || '';
      let buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])){ buf.push(lines[i]); i++; }
      i++;
      const src = buf.join('\n');
      // mermaid 펜스 → 다이어그램 div. esc(src) 로 textContent=원본 보존(mermaid 가 읽음), data-src 는 캐시 키.
      if (/^mermaid$/i.test(lang)){ html += '<div class="mermaid" data-src="'+attr(src)+'">'+esc(src)+'</div>'; continue; }
      html += '<div class="codeblock"><button class="copy-btn" type="button">복사</button>'
        + '<pre><code>'+esc(src)+'</code></pre></div>'; continue;
    }
    // 헤딩
    let h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h){
      const lv = h[1].length, txt = inline(h[2].trim());
      const id = mkId(slug(h[2]));
      html += '<h'+lv+' id="'+id+'" data-h="'+lv+'">'+txt+'</h'+lv+'>';
      i++; continue;
    }
    // 수평선
    if (/^---+\s*$/.test(line)){ html += '<hr/>'; i++; continue; }
    // 인용(연속 라인)
    if (/^>\s?/.test(line)){
      let buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])){ buf.push(lines[i].replace(/^>\s?/,'')); i++; }
      html += '<blockquote>'+buf.map(b=> b.trim()? '<p>'+inline(b)+'</p>':'').join('')+'</blockquote>';
      continue;
    }
    // 표
    if (/^\|.*\|/.test(line) && i+1 < lines.length && /^\|?[\s:|-]+\|?\s*$/.test(lines[i+1]) && lines[i+1].includes('-')){
      const splitRow = r => r.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const head = splitRow(line); i += 2;
      let body = '';
      while (i < lines.length && /^\|.*\|/.test(lines[i])){
        const cells = splitRow(lines[i]);
        body += '<tr>'+cells.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>'; i++;
      }
      html += '<div class="table-wrap"><table><thead><tr>'
        + head.map(c=>'<th>'+inline(c)+'</th>').join('')
        + '</tr></thead><tbody>'+body+'</tbody></table></div>';
      continue;
    }
    // 목록 (순서/비순서 · 중첩 · 체크박스)
    const liRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
    if (liRe.test(line)){
      const items = [];
      while (i < lines.length){
        const m = liRe.exec(lines[i]);
        if (!m) break;
        items.push({ indent: m[1].replace(/\t/g,'    ').length,
                     ordered: /\d/.test(m[2]), text: m[3] });
        i++;
      }
      html += renderList(items); continue;
    }
    // raw <svg> 블록(여러 줄) — 통째로 통과(이스케이프 안 함). 표준 마크다운 동작과 일치.
    if (/^\s*<svg[\s>]/i.test(line)){
      let buf = [];
      while (i < lines.length){ buf.push(lines[i]); const end = /<\/svg>/i.test(lines[i]); i++; if (end) break; }
      html += buf.join('\n'); continue;
    }
    // 빈 줄
    if (/^\s*$/.test(line)){ i++; continue; }
    // 단락(연속 비빈 줄 묶기)
    let buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|>|```|\||\s*[-*]\s|\s*\d+\.\s|---)/.test(lines[i])){
      buf.push(lines[i]); i++;
    }
    if (buf.length) html += '<p>'+inline(buf.join(' '))+'</p>';
    // 블록 문법처럼 보이나 미완성인 줄(예: 구분선 없는 표 행 `| x |`)은 위 단락 루프가 건너뛴다.
    // 그대로 두면 i 가 안 늘어 무한 루프 → 화면 백지. 단락으로 흘리고 전진시킨다.
    else { html += '<p>'+inline(line)+'</p>'; i++; }
  }
  return html;
}

/* =========================================================================
   2) 상태 + 영속화 (VS Code 웹뷰 브릿지 연동)
   ========================================================================= */
const isVSCode = typeof acquireVsCodeApi === 'function' || window.IS_VSCODE_ENV;
const vscode = isVSCode && typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

function load(k, d){
  if (isVSCode && window.VSCODE_CONFIG) {
    if (k === 'br-settings') return window.VSCODE_CONFIG || d;
  }
  try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch(e){ return d; }
}

function save(k, v){
  if (isVSCode && vscode) {
    if (k === 'br-settings') {
      vscode.postMessage({ command: 'saveConfig', config: v });
    }
    return;
  }
  try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){}
}

const $ = s => document.querySelector(s);
const reader = $('#reader');
const DEFAULTS = { theme:'paper', flip:'flip3d', size:18, lead:1.9, font:'sans' };
let settings = Object.assign({}, DEFAULTS, load('br-settings', {}));
if (!settings.labelHues || typeof settings.labelHues !== 'object') settings.labelHues = {};
const STORE_POS = 'br-pos';

/* =========================================================================
   3) 페이지네이션 (H2 = 새 챕터, 높이 초과 시 자동 분할)
   ========================================================================= */
const rawMd = $('#book-md').textContent.replace(/<\\\/script>/g, '<\/script>');
const sourceHtml = parseMarkdown(rawMd);
const srcDoc = document.createElement('div');
srcDoc.innerHTML = sourceHtml;
const srcNodes = Array.from(srcDoc.children);

// 문서 제목
const h1 = srcDoc.querySelector('h1');
const docTitle = h1 ? h1.textContent : (window.VSCODE_DOC_NAME || '책');
const docKey = p => p + ':' + docTitle;
$('#docTitle').textContent = docTitle;
document.title = docTitle + ' · 책 리더';

/* 체크박스 상태: data-task-idx -> bool */
const STORE_TASKS = docKey('br-tasks');
let taskState = load(STORE_TASKS, {});
if (!taskState || typeof taskState !== 'object') taskState = {};
function applyTasks(pad){
  pad.querySelectorAll('input[type=checkbox][data-task-idx]').forEach(cb => {
    const saved = taskState[cb.dataset.taskIdx];
    if (saved !== undefined) cb.checked = !!saved;
  });
}

let pages = [];        // {html, headings:[{id,level,text}]}
const headingPage = {}; // id -> page index
let current = 0;
let tocItems = [];      // 캐시된 .toc-item 버튼들
let scrollObserver = null;
let scrollHeadings = [];
const scrollAboveTop = new Set();
let scrollActiveId = null;
let scrollChap = '';

// 페이지보다 큰 리스트(<ul>/<ol>)를 <li> 단위로 페이지 크기 조각들로 분할.
// 한 항목씩 채우다 넘치면 끊어 새 리스트로 — <ol> 은 start 속성으로 번호 이어줌.
function splitList(node, maxH, pad){
  const items = Array.from(node.children);
  const chunks = [];
  let cur = node.cloneNode(false);
  pad.textContent = ''; pad.appendChild(cur);
  for (const li of items){
    cur.appendChild(li.cloneNode(true));
    if (pad.scrollHeight > maxH && cur.children.length > 1){
      cur.removeChild(cur.lastChild);
      chunks.push(cur);
      cur = node.cloneNode(false);
      pad.textContent = ''; pad.appendChild(cur);
      cur.appendChild(li.cloneNode(true));
    }
  }
  if (cur.children.length) chunks.push(cur);
  if (node.tagName === 'OL'){
    let n = parseInt(node.getAttribute('start') || '1', 10);
    chunks.forEach(c => { c.setAttribute('start', String(n)); n += c.children.length; });
  }
  return chunks;
}

function paginate(){
  const pad = $('#padMeasure');
  const maxH = pad.clientHeight;
  pages = []; for (const k in headingPage) delete headingPage[k];

  // 0) 페이지를 넘기는 큰 리스트는 미리 조각으로 펼친다(블록 단위 분할 불가 문제 해결).
  const nodes = [];
  for (const node of srcNodes){
    pad.textContent = ''; pad.appendChild(node.cloneNode(true));
    if (pad.scrollHeight > maxH && (node.tagName === 'UL' || node.tagName === 'OL')){
      nodes.push(...splitList(node, maxH, pad));
    } else {
      nodes.push(node);
    }
  }

  let curNodes = [];
  const flush = () => {
    if (!curNodes.length) return;
    const headings = curNodes.filter(n=>/^H[1-3]$/.test(n.tagName))
      .map(n=>({ id:n.id, level:+n.dataset.h, text:n.textContent }));
    pages.push({ html: curNodes.map(n=>n.outerHTML).join(''), headings });
    curNodes = [];
  };
  pad.textContent = '';
  for (const node of nodes){
    const isBreak = node.tagName === 'H1' || node.tagName === 'H2';
    if (isBreak && curNodes.length){ flush(); pad.textContent = ''; }
    curNodes.push(node);
    pad.appendChild(node.cloneNode(true));
    if (pad.scrollHeight > maxH && curNodes.length > 1){
      curNodes.pop();
      pad.removeChild(pad.lastChild);
      flush();
      pad.textContent = '';
      curNodes.push(node);
      pad.appendChild(node.cloneNode(true));
    }
  }
  flush();
  pages.forEach((p, idx) => p.headings.forEach(h => { if (headingPage[h.id] === undefined) headingPage[h.id] = idx; }));
}

/* =========================================================================
   4) 렌더 + 네비게이션 + 넘김 효과
   ========================================================================= */
const padBelow = $('#padBelow'), padAnim = $('#padAnim');
const animLayer = $('#animLayer'), animShade = $('#animShade');
const stage = $('#stage');
let animating = false;

function setHtml(pad, idx){ pad.innerHTML = (pages[idx] && pages[idx].html) || ''; pad.scrollTop = 0; applyTasks(pad); if (typeof initMermaidPanZoom === 'function') initMermaidPanZoom(pad); }

function renderBase(){
  // scroll 은 srcNodes(렌더된 mermaid 포함)에서 직접 — 캐시 문자열은 mermaid 렌더 전 상태라 안 씀
  if (settings.flip === 'scroll'){ padBelow.innerHTML = srcNodes.map(n=>n.outerHTML).join(''); applyTasks(padBelow); if (typeof initMermaidPanZoom === 'function') initMermaidPanZoom(padBelow); observeScrollHeadings(); }
  else { setHtml(padBelow, current); disconnectScrollObserver(); }
}

function observeScrollHeadings(){
  disconnectScrollObserver();
  scrollHeadings = Array.from(padBelow.querySelectorAll('h1,h2,h3'));
  if (!scrollHeadings.length) return;
  scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const rb = e.rootBounds;
      const above = rb ? (e.boundingClientRect.top <= rb.top) : false;
      if (above) scrollAboveTop.add(e.target.id); else scrollAboveTop.delete(e.target.id);
    });
    updateChromeScroll();
  }, { root: stage, rootMargin: '-80px 0px 0px 0px', threshold: 0 });
  scrollHeadings.forEach(h => scrollObserver.observe(h));
}

function disconnectScrollObserver(){
  if (scrollObserver){ scrollObserver.disconnect(); scrollObserver = null; }
  scrollHeadings = []; scrollAboveTop.clear();
}

function paintProgress(idx){
  const total = pages.length;
  $('#metaPage').textContent = (idx+1) + ' / ' + total;
  $('#progFill').style.width = total>1 ? (idx/(total-1)*100)+'%' : '100%';
}

function updateChrome(){
  if (settings.flip === 'scroll'){ updateChromeScroll(); return; }
  paintProgress(current);
  let chap = '';
  for (let i = current; i >= 0; i--){
    const hs = pages[i].headings.filter(h=>h.level<=2);
    if (hs.length){ chap = hs[hs.length-1].text; break; }
  }
  $('#metaChap').textContent = chap;
  tocItems.forEach(el=>{
    el.classList.toggle('active', headingPage[el.dataset.id] === current);
  });
  save(docKey(STORE_POS), current);
}

function updateChromeScroll(){
  const max = stage.scrollHeight - stage.clientHeight;
  const ratio = max > 0 ? stage.scrollTop / max : 0;
  $('#progFill').style.width = (ratio*100)+'%';
  $('#metaPage').textContent = Math.round(ratio*100) + '%';
  scrollChap = ''; scrollActiveId = null;
  scrollHeadings.forEach(h => { if (scrollAboveTop.has(h.id)){ if(+h.dataset.h<=2) scrollChap = h.textContent; scrollActiveId = h.id; } });
  $('#metaChap').textContent = scrollChap;
  tocItems.forEach(el=> el.classList.toggle('active', el.dataset.id === scrollActiveId));
}

function clamp(n){ return Math.max(0, Math.min(pages.length-1, n)); }

function tween(from, to, dur, step, done){
  const t0 = performance.now();
  const ease = p => 1 - Math.pow(1-p, 3);
  let finished = false, wd;
  const finish = () => { if (finished) return; finished = true; clearTimeout(wd); step(to); if (done) done(); };
  function frame(t){
    if (finished) return;
    let p = Math.min(1, (t-t0)/dur);
    step(from + (to-from)*ease(p));
    if (p < 1) requestAnimationFrame(frame); else finish();
  }
  requestAnimationFrame(frame);
  wd = setTimeout(finish, dur + 300);
}

function endTurn(){ animLayer.style.display='none'; animLayer.style.transform=''; animLayer.style.opacity=1; animShade.style.opacity=0; animating=false; }

function applyTurn(prog, dir, mode){
  if (mode === 'fade'){
    if (dir === 'next'){ animLayer.style.opacity = (1-prog); }
    else { animLayer.style.opacity = prog; }
    animLayer.style.transform = '';
  } else if (mode === 'slide'){
    animLayer.style.opacity = 1;
    if (dir === 'next'){ animLayer.style.transform = 'translateX('+(-prog*100)+'%)'; }
    else { animLayer.style.transform = 'translateX('+((prog-1)*100)+'%)'; }
  } else { // flip3d
    animLayer.style.opacity = 1;
    const ang = dir === 'next' ? -90*prog : -90*(1-prog);
    animLayer.style.transform = 'rotateY('+ang+'deg)';
    animShade.style.opacity = dir === 'next' ? prog : (1-prog);
  }
}

function prepareTurn(dir, mode){
  animLayer.classList.toggle('flipping', mode === 'flip3d');
  animShade.style.opacity = 0;
  if (dir === 'next'){
    setHtml(padAnim, current);
    setHtml(padBelow, current+1);
  } else {
    setHtml(padAnim, current-1);
    setHtml(padBelow, current);
  }
  animLayer.style.display = 'flex';
  applyTurn(0, dir, mode);
}

function go(dir){
  if (animating) return;
  const target = dir === 'next' ? current+1 : current-1;
  if (target < 0 || target >= pages.length){ bounce(dir); return; }
  const mode = settings.flip;
  if (mode === 'scroll'){ current = target; renderBase(); updateChrome(); return; }
  animating = true;
  paintProgress(target);
  prepareTurn(dir, mode);
  tween(0, 1, 360, p => applyTurn(p, dir, mode), () => {
    current = target;
    renderBase();
    endTurn();
    updateChrome();
  });
}

function bounce(dir){
  const sign = dir === 'next' ? -1 : 1;
  const el = padBelow.parentElement.parentElement;
  tween(0, 1, 280, p => {
    const o = Math.sin(p*Math.PI) * 22 * sign;
    el.style.transform = 'translateX('+o+'px)';
  }, () => { el.style.transform = ''; });
}

/* ---- 콘텐츠 인터랙션 ---- */
let lightbox = null;
function ensureLightbox(){
  if (lightbox) return lightbox;
  lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = '<img alt="">';
  lightbox.addEventListener('click', closeLightbox);
  document.body.appendChild(lightbox);
  return lightbox;
}
function openLightbox(src, alt){
  const lb = ensureLightbox();
  const img = lb.querySelector('img');
  img.src = src; img.alt = alt || '';
  lb.classList.add('show');
}
function closeLightbox(){ if (lightbox) lightbox.classList.remove('show'); }

function copyText(text, btn){
  const done = () => { const o = btn.textContent; btn.textContent = '복사됨';
    setTimeout(() => { btn.textContent = o; }, 1200); };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); done(); }catch(e){}
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done, fallback);
  } else fallback();
}

function bindContent(pad){
  pad.addEventListener('click', e => {
    const btn = e.target.closest('.copy-btn');
    if (btn){
      e.stopPropagation(); e.preventDefault();
      const pre = btn.parentElement.querySelector('pre');
      if (pre) copyText(pre.textContent, btn);
      return;
    }
    
    // 로컬 링크 클릭 처리 (VS Code에 알려 열어주기)
    const link = e.target.closest('a');
    if (link) {
      const href = link.getAttribute('href');
      if (isVSCode && vscode && href && !/^(https?:|\/\/|mailto:)/i.test(href)) {
        e.stopPropagation();
        e.preventDefault();
        vscode.postMessage({
          command: 'openLink',
          path: href
        });
        return;
      }
    }

    const img = e.target.closest('img');
    if (img){ e.stopPropagation(); openLightbox(img.src, img.alt); return; }
    const cb = e.target.closest('input[type=checkbox][data-task-idx]');
    if (cb){ e.stopPropagation(); return; }
  });

  pad.addEventListener('change', e => {
    const cb = e.target.closest('input[type=checkbox][data-task-idx]');
    if (!cb) return;
    e.stopPropagation();
    const idx = parseInt(cb.dataset.taskIdx, 10);
    taskState[idx] = cb.checked;
    save(STORE_TASKS, taskState);

    // VS Code 환경인 경우 백엔드 마크다운 원본 수정 요청
    if (isVSCode && vscode) {
      vscode.postMessage({
        command: 'toggleTask',
        taskIdx: idx,
        checked: cb.checked
      });
    }
  });
}
bindContent(padBelow);
bindContent(padAnim);

window.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

/* ---- 드래그 / 스와이프 ---- */
let drag = null;
stage.addEventListener('pointerdown', e => {
  if (settings.flip === 'scroll' || animating) return;
  if (e.target.closest('.toc-item')) return;
  drag = { x:e.clientX, y:e.clientY, dir:null, active:false, w:stage.clientWidth, t:performance.now(), type:e.pointerType };
});
stage.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.active){
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
    if (drag.type === 'mouse'){ drag = null; return; }
    drag.dir = dx < 0 ? 'next' : 'prev';
    const target = drag.dir === 'next' ? current+1 : current-1;
    if (target < 0 || target >= pages.length){ const d=drag.dir; drag = null; bounce(d); return; }
    drag.active = true;
    reader.classList.add('dragging');
    const sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges();
    prepareTurn(drag.dir, settings.flip);
    try{ stage.setPointerCapture(e.pointerId); }catch(_){}
  }
  let prog = drag.dir === 'next' ? (-dx/drag.w) : (dx/drag.w);
  prog = Math.max(0, Math.min(1, prog));
  drag.prog = prog;
  e.preventDefault();
  applyTurn(prog, drag.dir, settings.flip);
});
stage.addEventListener('pointerup', e => {
  if (!drag){ return; }
  if (!drag.active){ drag = null; return; }
  reader.classList.remove('dragging');
  lastSwipe = performance.now();
  const mode = settings.flip, dir = drag.dir;
  const dx = e.clientX - drag.x, dt = performance.now() - drag.t;
  const vel = Math.abs(dx)/dt;
  const prog = drag.prog || 0;
  const commit = prog > 0.5 || vel > 0.5;
  animating = true;
  const d = drag; drag = null;
  if (commit){
    paintProgress(dir === 'next' ? current+1 : current-1);
    tween(prog, 1, 240*(1-prog)+80, p => applyTurn(p, dir, mode), () => {
      current = dir === 'next' ? current+1 : current-1;
      renderBase(); endTurn();
      updateChrome();
    });
  } else {
    tween(prog, 0, 200, p => applyTurn(p, dir, mode), () => {
      endTurn();
    });
  }
});
stage.addEventListener('pointercancel', () => { drag = null; reader.classList.remove('dragging'); });

/* ---- 탭 영역 ---- */
let lastSwipe = 0;
stage.addEventListener('click', e => {
  if (settings.flip === 'scroll') return;
  if (performance.now() - lastSwipe < 400) return;
  if (e.target.closest('a')) return;
  const sel = window.getSelection && window.getSelection();
  if (sel && String(sel).trim()) return;
  const x = e.clientX - stage.getBoundingClientRect().left;
  const w = stage.clientWidth;
  if (x < w * 0.30) go('prev');
  else if (x > w * 0.70) go('next');
  else reader.classList.toggle('immersive');
});

/* ---- 키보드 ---- */
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go('next'); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go('prev'); }
  else if (e.key === 'Escape') closeSheets();
});

/* =========================================================================
   5) 목차
   ========================================================================= */
function buildToc(){
  const list = $('#tocList'); list.innerHTML = ''; tocItems = [];
  srcNodes.filter(n=>/^H[1-3]$/.test(n.tagName)).forEach(n => {
    const lv = +n.dataset.h;
    const b = document.createElement('button');
    b.className = 'toc-item lv'+lv; b.dataset.id = n.id;
    b.innerHTML = '<span>'+n.innerHTML+'</span><span class="pg">'+((headingPage[n.id]??0)+1)+'</span>';
    b.addEventListener('click', () => { jumpTo(n.id); closeSheets(); });
    list.appendChild(b);
    tocItems.push(b);
  });
}
function jumpTo(id){
  if (settings.flip === 'scroll'){
    const el = padBelow.querySelector('#'+CSS.escape(id));
    if (el) stage.scrollTop = el.offsetTop - 64;
    updateChrome();
    return;
  }
  const idx = headingPage[id];
  if (idx === undefined) return;
  current = clamp(idx);
  renderBase(); updateChrome();
}

/* =========================================================================
   6) 설정 적용
   ========================================================================= */
function applySettings(){
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--reader-size', settings.size+'px');
  document.documentElement.style.setProperty('--reader-leading', settings.lead);
  document.documentElement.style.setProperty('--reader-font', settings.font==='serif'?'var(--font-serif)':'var(--font-sans)');
  reader.classList.toggle('scrollmode', settings.flip === 'scroll');
  document.querySelectorAll('#setTheme .swatch').forEach(s=>s.classList.toggle('on', s.dataset.theme===settings.theme));
  document.querySelectorAll('#setFlip button').forEach(s=>s.classList.toggle('on', s.dataset.flip===settings.flip));
  document.querySelectorAll('#setLead button').forEach(s=>s.classList.toggle('on', +s.dataset.lead===settings.lead));
  document.querySelectorAll('#setFont button').forEach(s=>s.classList.toggle('on', s.dataset.font===settings.font));
  $('#sizeVal').textContent = settings.size+'px';
  save('br-settings', settings);
}

function labelHue(k){ return settings.labelHues[k] != null ? settings.labelHues[k] : hue(k); }
function applyLabelStyle(){
  let css = '';
  usedLabels.forEach(k => {
    const sel = '.lbl.auto[data-key="' + k.replace(/["\\]/g,'\\$&') + '"]';
    css += sel + '{--h:' + labelHue(k) + '}';
  });
  let el = document.getElementById('labelStyle');
  if (!el){ el = document.createElement('style'); el.id = 'labelStyle'; document.head.appendChild(el); }
  el.textContent = css;
}

let editKey = null;
function buildLabelControls(){
  const wrap = $('#setLabels'); if (!wrap) return;
  const keys = [...usedLabels].sort();
  $('#setLabelRow').hidden = keys.length === 0;
  $('#setLabelCount').textContent = keys.length ? '('+keys.length+')' : '';
  wrap.innerHTML = keys.map(k =>
    '<span class="lbl auto" data-key="'+attr(k)+'" role="button" tabindex="0">'+esc(k)+'</span>'
  ).join('');
  closeLabelEditor();
}
function openLabelEditor(k){
  editKey = k;
  const chip = $('#labEditChip'); chip.dataset.key = k; chip.textContent = k;
  $('#labEditRange').value = labelHue(k);
  $('#labelEditor').hidden = false;
  applyLabelStyle();
  document.querySelectorAll('#setLabels .lbl').forEach(c => c.classList.toggle('sel', c.dataset.key === k));
}
function closeLabelEditor(){
  editKey = null;
  const e = $('#labelEditor'); if (e) e.hidden = true;
  document.querySelectorAll('#setLabels .lbl.sel').forEach(c => c.classList.remove('sel'));
}

function reflow(keepId){
  let anchor = keepId;
  if (!anchor && pages[current]) anchor = (pages[current].headings[0]||{}).id;
  paginate();
  if (anchor && headingPage[anchor] !== undefined) current = headingPage[anchor];
  current = clamp(current);
  renderBase();
  buildToc();
  updateChrome();
}

stage.addEventListener('scroll', () => { if (settings.flip === 'scroll') updateChromeScroll(); }, { passive:true });

/* 설정 이벤트 */
$('#setTheme').addEventListener('click', e => { const t=e.target.closest('.swatch'); if(!t)return; settings.theme=t.dataset.theme; applySettings(); });
$('#setFlip').addEventListener('click', e => { const b=e.target.closest('button'); if(!b)return; settings.flip=b.dataset.flip; applySettings(); reflow(); });
$('#setLead').addEventListener('click', e => { const b=e.target.closest('button'); if(!b)return; settings.lead=+b.dataset.lead; applySettings(); reflow(); });
$('#setFont').addEventListener('click', e => { const b=e.target.closest('button'); if(!b)return; settings.font=b.dataset.font; applySettings(); reflow(); });
$('#sizeUp').addEventListener('click', () => { settings.size=Math.min(28,settings.size+1); applySettings(); reflow(); });
$('#sizeDown').addEventListener('click', () => { settings.size=Math.max(14,settings.size-1); applySettings(); reflow(); });
$('#setLabels').addEventListener('click', e => {
  const c = e.target.closest('.lbl'); if(!c) return;
  (editKey === c.dataset.key) ? closeLabelEditor() : openLabelEditor(c.dataset.key);
});
$('#setLabels').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const c = e.target.closest('.lbl'); if(!c) return; e.preventDefault();
  openLabelEditor(c.dataset.key);
});
$('#labEditRange').addEventListener('input', e => {
  if (editKey == null) return;
  settings.labelHues[editKey] = +e.target.value; applyLabelStyle(); save('br-settings', settings);
});
$('#labEditReset').addEventListener('click', () => {
  if (editKey == null) return;
  delete settings.labelHues[editKey];
  $('#labEditRange').value = labelHue(editKey); applyLabelStyle(); save('br-settings', settings);
});

/* =========================================================================
   7) 오버레이 열고 닫기
   ========================================================================= */
const scrim = $('#scrim');
function openSheet(el){ scrim.classList.add('show'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
function closeSheets(){ scrim.classList.remove('show'); $('#tocSheet').classList.remove('show'); $('#setSheet').classList.remove('show'); }
$('#btnToc').addEventListener('click', ()=>openSheet($('#tocSheet')));
$('#btnSettings').addEventListener('click', ()=>openSheet($('#setSheet')));
$('#tocClose').addEventListener('click', closeSheets);
$('#setClose').addEventListener('click', closeSheets);
scrim.addEventListener('click', closeSheets);

/* =========================================================================
   7.4) mermaid SVG 드래그(Pan) 및 휠 확대/축소(Zoom) 기능
   ========================================================================= */
function initMermaidPanZoom(container) {
  container.querySelectorAll('.mermaid').forEach(el => {
    const svg = el.querySelector('svg');
    if (!svg || el.getAttribute('data-panzoom-initialized')) return;
    el.setAttribute('data-panzoom-initialized', 'true');
    
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.style.cursor = 'grab';
    el.style.userSelect = 'none';
    svg.style.transformOrigin = '0 0';
    svg.style.transition = 'none';
    
    let isDragging = false;
    let startX = 0, startY = 0;
    let translateX = 0, translateY = 0;
    let scale = 1;
    
    const updateTransform = () => {
      svg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };
    
    // UI 컨트롤 버튼 패널 추가
    const controls = document.createElement('div');
    controls.className = 'mermaid-controls';
    controls.style.cssText = 'position:absolute;bottom:10px;right:10px;display:flex;gap:6px;z-index:10;pointer-events:auto;';
    
    const btnStyle = 'width:28px;height:28px;border:1px solid var(--chrome-rule,#ddd);background:var(--page,#faf6ec);color:var(--ink,#333);font-size:15px;font-weight:bold;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.1);user-select:none;transition:background 0.15s, opacity 0.15s;opacity:0.85;';
    
    const zoomInBtn = document.createElement('button');
    zoomInBtn.innerHTML = '＋';
    zoomInBtn.style.cssText = btnStyle;
    zoomInBtn.title = '확대';
    
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.innerHTML = '－';
    zoomOutBtn.style.cssText = btnStyle;
    zoomOutBtn.title = '축소';
    
    const resetBtn = document.createElement('button');
    resetBtn.innerHTML = '⟲';
    resetBtn.style.cssText = btnStyle;
    resetBtn.title = '초기화';
    
    // 버튼 마우스 오버 효과
    [zoomInBtn, zoomOutBtn, resetBtn].forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--chrome-rule, #efe8d8)'; btn.style.opacity = '1'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--page, #faf6ec)'; btn.style.opacity = '0.85'; });
    });
    
    controls.appendChild(zoomInBtn);
    controls.appendChild(zoomOutBtn);
    controls.appendChild(resetBtn);
    el.appendChild(controls);
    
    // 버튼 클릭 이벤트 바인딩 (컨테이너 드래그 동작 간섭 방지)
    const preventDrag = e => { e.stopPropagation(); e.preventDefault(); };
    controls.addEventListener('pointerdown', preventDrag);
    controls.addEventListener('mousedown', preventDrag);
    controls.addEventListener('click', e => e.stopPropagation());
    
    zoomInBtn.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      const prevScale = scale;
      scale = Math.min(scale * 1.25, 8);
      const rect = el.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      translateX = centerX - (centerX - translateX) * (scale / prevScale);
      translateY = centerY - (centerY - translateY) * (scale / prevScale);
      updateTransform();
    });
    
    zoomOutBtn.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      const prevScale = scale;
      scale = Math.max(scale / 1.25, 0.3);
      const rect = el.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      translateX = centerX - (centerX - translateX) * (scale / prevScale);
      translateY = centerY - (centerY - translateY) * (scale / prevScale);
      updateTransform();
    });
    
    resetBtn.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      translateX = 0;
      translateY = 0;
      scale = 1;
      updateTransform();
    });
    
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return; // 마우스는 좌클릭만
      isDragging = true;
      el.style.cursor = 'grabbing';
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      try { el.setPointerCapture(e.pointerId); } catch(_) {}
      e.preventDefault();
      e.stopPropagation();
    });
    
    el.addEventListener('pointermove', e => {
      if (!isDragging) return;
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      updateTransform();
      e.stopPropagation();
    });
    
    el.addEventListener('pointerup', e => {
      if (isDragging) {
        isDragging = false;
        el.style.cursor = 'grab';
        try { el.releasePointerCapture(e.pointerId); } catch(_) {}
        e.stopPropagation();
      }
    });
    
    el.addEventListener('pointercancel', e => {
      if (isDragging) {
        isDragging = false;
        el.style.cursor = 'grab';
        try { el.releasePointerCapture(e.pointerId); } catch(_) {}
        e.stopPropagation();
      }
    });
    
    el.addEventListener('wheel', e => {
      e.preventDefault();
      e.stopPropagation();
      const zoomFactor = 1.1;
      const prevScale = scale;
      
      if (e.deltaY < 0) {
        scale = Math.min(scale * zoomFactor, 8);
      } else {
        scale = Math.max(scale / zoomFactor, 0.3);
      }
      
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      translateX = mouseX - (mouseX - translateX) * (scale / prevScale);
      translateY = mouseY - (mouseY - translateY) * (scale / prevScale);
      
      updateTransform();
    }, { passive: false });
    
    el.addEventListener('dblclick', e => {
      e.preventDefault();
      e.stopPropagation();
      translateX = 0;
      translateY = 0;
      scale = 1;
      updateTransform();
    });
  });
}

/* =========================================================================
   7.5) mermaid 다이어그램 렌더 (페이지 측정 전에 한 번 그려 정적 SVG 로 박제)
   - 캐시(소스 해시) 로 안 바뀐 다이어그램 재렌더 회피 → 실시간 편집도 빠름
   - 항상 data-processed 표기(성공/폴백 모두) → 미처리 숨김 CSS 가 영구화되지 않음
   ========================================================================= */
const mmdCache = new Map();   // data-src 원본 → 렌더된 innerHTML(svg)
let mmdInit = false;
async function renderMermaidIn(container){
  const els = Array.from(container.querySelectorAll('.mermaid'));
  if (!els.length) return;
  // 엔진 없음 → 소스를 코드블록으로 폴백(안 보이게 두지 않음)
  if (!window.mermaid){
    els.forEach(el => { el.innerHTML = '<pre><code>'+esc(el.getAttribute('data-src')||el.textContent)+'</code></pre>'; el.setAttribute('data-processed','fallback'); });
    return;
  }
  if (!mmdInit){
    window.mermaid.initialize({ startOnLoad:false, securityLevel:'loose',
      theme: /black|gray/.test(settings.theme) ? 'dark' : 'default' });
    mmdInit = true;
  }
  const pending = [];
  els.forEach((el, k) => {
    const src = el.getAttribute('data-src') || '';
    if (mmdCache.has(src)){ el.innerHTML = mmdCache.get(src); el.setAttribute('data-processed','cache'); }
    else { el.removeAttribute('data-processed'); el.textContent = src; el.id = 'mmd-'+k+'-'+(src.length); pending.push(el); }
  });
  if (!pending.length) return;
  // mermaid 는 레이아웃 측정(getBBox)에 실제 DOM 부착이 필요 → 화면 밖 holder 에 잠깐 붙였다 뗀다
  const holder = document.createElement('div');
  const w = ($('#padMeasure') && $('#padMeasure').clientWidth) || 700;
  holder.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;width:'+w+'px;';
  const parked = container.parentNode;            // 원위치 기억(있다면)
  holder.appendChild(container);
  document.body.appendChild(holder);
  try { await window.mermaid.run({ nodes: pending }); }
  catch(e){ pending.forEach(el => { el.innerHTML = '<pre><code>'+esc(el.getAttribute('data-src')||'')+'</code></pre>'; }); }
  pending.forEach(el => { el.setAttribute('data-processed', el.getAttribute('data-processed')||'1'); mmdCache.set(el.getAttribute('data-src')||'', el.innerHTML); });
  document.body.removeChild(holder);
  if (parked) parked.appendChild(container); else holder.removeChild(container);
}

/* =========================================================================
   8) 부팅
   ========================================================================= */
async function boot(){
  applySettings();
  applyLabelStyle();
  buildLabelControls();
  await renderMermaidIn(srcDoc);
  paginate();
  buildToc();
  current = clamp(load(docKey(STORE_POS), 0));
  renderBase();
  updateChrome();
  if (!load('br-hinted', false)){
    const hint = $('#hint'); hint.classList.add('show');
    setTimeout(()=>hint.classList.remove('show'), 3200);
    save('br-hinted', true);
  }
}
boot();

let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(()=>reflow(), 200); });

/* =========================================================================
   9) VS Code 웹뷰 실시간 양방향 통신 수신부
   ========================================================================= */
if (isVSCode) {
  window.addEventListener('message', async event => {
    const message = event.data;
    if (message.command === 'updateContent') {
      const safeMd = message.markdown.replace(/<\\\/script>/g, '<\/script>');
      const updatedHtml = parseMarkdown(safeMd);
      srcDoc.innerHTML = updatedHtml;
      await renderMermaidIn(srcDoc);   // 캐시 덕에 안 바뀐 다이어그램은 즉시
      srcNodes.length = 0;
      srcNodes.push(...srcDoc.children);
      const h1 = srcDoc.querySelector('h1');
      const docTitle = h1 ? h1.textContent : (window.VSCODE_DOC_NAME || '책');
      $('#docTitle').textContent = docTitle;
      reflow();
    }
  });
}
