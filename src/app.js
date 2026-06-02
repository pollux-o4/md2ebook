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

function inline(text){
  // 코드 먼저 추출(내부는 이스케이프, 인라인 처리 안 함) → 자리표시자
  const codes = [];
  const NUL = String.fromCharCode(0), PH = n => NUL+n+NUL;
  text = text.replace(/`([^`]+)`/g, (m, c) => {
    const t = c.trim();
    const lm = /^\[(.+)\]$/.exec(t);          // [사실] 같은 라벨에서 대괄호 제거
    const key = lm ? lm[1] : null;
    let html;
    if (key && LABELS[key]) html = '<span class="lbl '+LABELS[key]+'">'+esc(t)+'</span>';
    else if (key){ usedLabels.add(key); html = '<span class="lbl auto" data-key="'+attr(key)+'">'+esc(t)+'</span>'; }
    else html = '<code>'+esc(c)+'</code>';
    codes.push(html); return '\u0000'+(codes.length-1)+'\u0000';
  });
  // 이미지 ![대체텍스트](src "제목") — src 보존 위해 esc 전에 자리표시자로 추출.
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, alt, src, title) => {
    const tt = title ? ' title="'+attr(title)+'"' : '';
    codes.push('<img src="'+src+'" alt="'+attr(alt)+'"'+tt+'>');
    return PH(codes.length-1);
  });
  text = esc(text);
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // 링크 [텍스트](url "제목") — 이미지(! 앞)는 제외. 외부 http 는 새 탭, 로컬은 같은 탭.
  text = text.replace(/(^|[^!])\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, pre, txt, href, title) => {
    const ext = /^(https?:|mailto:|\/\/)/i.test(href);
    const tgt = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
    const tt = title ? ' title="'+title+'"' : '';
    return pre + '<a href="'+href+'"'+tgt+tt+'>'+txt+'</a>';
  });
  text = text.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[+i]);
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
      let buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])){ buf.push(lines[i]); i++; }
      i++; html += '<div class="codeblock"><button class="copy-btn" type="button">복사</button>'
        + '<pre><code>'+esc(buf.join('\n'))+'</code></pre></div>'; continue;
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
    // 빈 줄
    if (/^\s*$/.test(line)){ i++; continue; }
    // 단락(연속 비빈 줄 묶기)
    let buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|>|```|\||\s*[-*]\s|\s*\d+\.\s|---)/.test(lines[i])){
      buf.push(lines[i]); i++;
    }
    if (buf.length) html += '<p>'+inline(buf.join(' '))+'</p>';
  }
  return html;
}

/* =========================================================================
   2) 상태 + 영속화
   ========================================================================= */
const $ = s => document.querySelector(s);
const reader = $('#reader');
const DEFAULTS = { theme:'paper', flip:'flip3d', size:18, lead:1.9, font:'sans' };
let settings = Object.assign({}, DEFAULTS, load('br-settings', {}));
if (!settings.labelHues || typeof settings.labelHues !== 'object') settings.labelHues = {};
const STORE_POS = 'br-pos';

function load(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

/* =========================================================================
   3) 페이지네이션 (H2 = 새 챕터, 높이 초과 시 자동 분할)
   ========================================================================= */
// build.py 주입 시 닫는 스크립트 태그를 이스케이프하므로 파싱 전 원복(코드 예시 정확성)
const rawMd = $('#book-md').textContent.replace(/<\\\/script>/g, '<\/script>');
const sourceHtml = parseMarkdown(rawMd);
const srcDoc = document.createElement('div');
srcDoc.innerHTML = sourceHtml;
const srcNodes = Array.from(srcDoc.children);

// 문서 제목
const h1 = srcDoc.querySelector('h1');
const docTitle = h1 ? h1.textContent : '책';
$('#docTitle').textContent = docTitle;
document.title = docTitle + ' · 책 리더';

/* 체크박스 상태: data-task-idx -> bool, 문서별 localStorage 영속화.
   마크다운의 [x] 가 기본값, 저장된 값이 있으면 그것이 우선. */
const STORE_TASKS = 'br-tasks:' + docTitle;
let taskState = load(STORE_TASKS, {});
if (!taskState || typeof taskState !== 'object') taskState = {};
// 마운트된 패드의 체크박스에 저장된 상태를 재적용 (windowed mounting 대비 — 매 마운트마다 호출)
function applyTasks(pad){
  pad.querySelectorAll('input[type=checkbox][data-task-idx]').forEach(cb => {
    const saved = taskState[cb.dataset.taskIdx];
    if (saved !== undefined) cb.checked = !!saved;
  });
}

let pages = [];        // {html, headings:[{id,level,text}]}
const headingPage = {}; // id -> page index
let current = 0;

function paginate(){
  const pad = $('#padMeasure');
  const maxH = pad.clientHeight;
  pages = []; for (const k in headingPage) delete headingPage[k];
  let curNodes = [];
  const flush = () => {
    if (!curNodes.length) return;
    const headings = curNodes.filter(n=>/^H[1-3]$/.test(n.tagName))
      .map(n=>({ id:n.id, level:+n.dataset.h, text:n.textContent }));
    pages.push({ html: curNodes.map(n=>n.outerHTML).join(''), headings });
    curNodes = [];
  };
  for (const node of srcNodes){
    const isBreak = node.tagName === 'H1' || node.tagName === 'H2';
    if (isBreak && curNodes.length) flush();
    curNodes.push(node);
    pad.innerHTML = curNodes.map(n=>n.outerHTML).join('');
    if (pad.scrollHeight > maxH && curNodes.length > 1){
      const last = curNodes.pop();
      flush();
      curNodes.push(last);
      pad.innerHTML = last.outerHTML;
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

function setHtml(pad, idx){ pad.innerHTML = (pages[idx] && pages[idx].html) || ''; pad.scrollTop = 0; applyTasks(pad); }

function renderBase(){
  if (settings.flip === 'scroll'){ padBelow.innerHTML = sourceHtml; applyTasks(padBelow); }
  else { setHtml(padBelow, current); }
}

function updateChrome(){
  if (settings.flip === 'scroll'){ updateChromeScroll(); return; }
  const total = pages.length;
  $('#metaPage').textContent = (current+1) + ' / ' + total;
  $('#progFill').style.width = total>1 ? (current/(total-1)*100)+'%' : '100%';
  // 현재 챕터(가장 가까운 H1/H2)
  let chap = '';
  for (let i = current; i >= 0; i--){
    const hs = pages[i].headings.filter(h=>h.level<=2);
    if (hs.length){ chap = hs[hs.length-1].text; break; }
  }
  $('#metaChap').textContent = chap;
  // 목차 활성
  document.querySelectorAll('.toc-item').forEach(el=>{
    el.classList.toggle('active', headingPage[el.dataset.id] === current);
  });
  save(STORE_POS+':'+docTitle, current);
}

function updateChromeScroll(){
  const max = stage.scrollHeight - stage.clientHeight;
  const ratio = max > 0 ? stage.scrollTop / max : 0;
  $('#progFill').style.width = (ratio*100)+'%';
  $('#metaPage').textContent = Math.round(ratio*100) + '%';
  // 화면 상단을 지난 마지막 헤딩 = 현재 챕터 + 목차 활성
  const hs = padBelow.querySelectorAll('h1,h2,h3');
  let chap = '', activeId = null;
  hs.forEach(h => { if (h.offsetTop - stage.scrollTop <= 80){ if(+h.dataset.h<=2) chap = h.textContent; activeId = h.id; } });
  $('#metaChap').textContent = chap;
  document.querySelectorAll('.toc-item').forEach(el=> el.classList.toggle('active', el.dataset.id === activeId));
}

function clamp(n){ return Math.max(0, Math.min(pages.length-1, n)); }

// rAF 트윈 (백그라운드에서 rAF가 멈춰도 잠금이 풀리도록 워치독 포함)
function tween(from, to, dur, step, done){
  const t0 = performance.now();
  const ease = p => 1 - Math.pow(1-p, 3);
  let finished = false;
  const finish = () => { if (finished) return; finished = true; step(to); if (done) done(); };
  function frame(t){
    if (finished) return;
    let p = Math.min(1, (t-t0)/dur);
    step(from + (to-from)*ease(p));
    if (p < 1) requestAnimationFrame(frame); else finish();
  }
  requestAnimationFrame(frame);
  setTimeout(finish, dur + 300);
}

// 넘김 진행 적용: prog 0~1, dir 'next'|'prev'
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
    setHtml(padAnim, current);          // 떠나는 현재 페이지가 위
    setHtml(padBelow, current+1);       // 다음 페이지가 아래에서 드러남
  } else {
    setHtml(padAnim, current-1);        // 들어오는 이전 페이지가 위
    setHtml(padBelow, current);         // 현재가 아래
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
  prepareTurn(dir, mode);
  tween(0, 1, 360, p => applyTurn(p, dir, mode), () => {
    current = target;
    renderBase();
    animLayer.style.display = 'none';
    animLayer.style.transform = ''; animLayer.style.opacity = 1; animShade.style.opacity = 0;
    animating = false;
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

/* ---- 콘텐츠 인터랙션 (코드 복사 / 이미지 줌 / 체크박스) ----
   page-pad 에 위임. 핸들러는 stopPropagation 으로 stage 의 페이지 넘김 클릭을 막는다. */

// 이미지 라이트박스: 재사용 오버레이 1개
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

// 코드 복사: pre 의 textContent 를 클립보드로. file:// 대비 execCommand 폴백.
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
    const img = e.target.closest('img');
    if (img){ e.stopPropagation(); openLightbox(img.src, img.alt); return; }
    const cb = e.target.closest('input[type=checkbox][data-task-idx]');
    if (cb){ e.stopPropagation(); return; }   // 토글은 change 에서 처리, 넘김만 차단
  });
  pad.addEventListener('change', e => {
    const cb = e.target.closest('input[type=checkbox][data-task-idx]');
    if (!cb) return;
    e.stopPropagation();
    taskState[cb.dataset.taskIdx] = cb.checked;
    save(STORE_TASKS, taskState);
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
    // 마우스는 드래그로 넘기지 않고 텍스트 선택을 허용 (데스크탑은 좌우 탭·키보드로 넘김)
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
  const vel = Math.abs(dx)/dt; // px/ms
  const prog = drag.prog || 0;
  const commit = prog > 0.5 || vel > 0.5;
  animating = true;
  const d = drag; drag = null;
  if (commit){
    tween(prog, 1, 240*(1-prog)+80, p => applyTurn(p, dir, mode), () => {
      current = dir === 'next' ? current+1 : current-1;
      renderBase(); animLayer.style.display='none';
      animLayer.style.transform=''; animLayer.style.opacity=1; animShade.style.opacity=0;
      animating = false; updateChrome();
    });
  } else {
    tween(prog, 0, 200, p => applyTurn(p, dir, mode), () => {
      animLayer.style.display='none';
      animLayer.style.transform=''; animLayer.style.opacity=1; animShade.style.opacity=0;
      animating = false;
    });
  }
});
stage.addEventListener('pointercancel', () => { drag = null; reader.classList.remove('dragging'); });

/* ---- 탭 영역 (오버레이는 통과시키고 stage 클릭 좌표로 판정 → 텍스트 선택 보존) ---- */
let lastSwipe = 0;
stage.addEventListener('click', e => {
  if (settings.flip === 'scroll') return;
  if (performance.now() - lastSwipe < 400) return;      // 방금 스와이프로 넘겼으면 무시
  if (e.target.closest('a')) return;                    // 링크 클릭은 통과
  const sel = window.getSelection && window.getSelection();
  if (sel && String(sel).trim()) return;                // 텍스트를 선택 중이면 넘기지 않음
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
  const list = $('#tocList'); list.innerHTML = '';
  srcNodes.filter(n=>/^H[1-3]$/.test(n.tagName)).forEach(n => {
    const lv = +n.dataset.h;
    const b = document.createElement('button');
    b.className = 'toc-item lv'+lv; b.dataset.id = n.id;
    b.innerHTML = '<span>'+n.innerHTML+'</span><span class="pg">'+((headingPage[n.id]??0)+1)+'</span>';
    b.addEventListener('click', () => { jumpTo(n.id); closeSheets(); });
    list.appendChild(b);
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
  // UI 상태 반영
  document.querySelectorAll('#setTheme .swatch').forEach(s=>s.classList.toggle('on', s.dataset.theme===settings.theme));
  document.querySelectorAll('#setFlip button').forEach(s=>s.classList.toggle('on', s.dataset.flip===settings.flip));
  document.querySelectorAll('#setLead button').forEach(s=>s.classList.toggle('on', +s.dataset.lead===settings.lead));
  document.querySelectorAll('#setFont button').forEach(s=>s.classList.toggle('on', s.dataset.font===settings.font));
  $('#sizeVal').textContent = settings.size+'px';
  save('br-settings', settings);
}

// 라벨별 hue 를 스타일시트로 주입 (오버라이드 없으면 기본 hue). 칩·미리보기에 동시 적용.
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

// 설정 패널의 "라벨 색": 문서에 쓰인 라벨을 색칩 그리드로. 칩 탭 → 그 칩만 편집.
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
  applyLabelStyle();   // 편집용 칩(같은 data-key)도 색 반영
  document.querySelectorAll('#setLabels .lbl').forEach(c => c.classList.toggle('sel', c.dataset.key === k));
}
function closeLabelEditor(){
  editKey = null;
  const e = $('#labelEditor'); if (e) e.hidden = true;
  document.querySelectorAll('#setLabels .lbl.sel').forEach(c => c.classList.remove('sel'));
}

function reflow(keepId){
  // 재배치 전 기준 heading 기억
  let anchor = keepId;
  if (!anchor && pages[current]) anchor = (pages[current].headings[0]||{}).id;
  paginate();
  if (anchor && headingPage[anchor] !== undefined) current = headingPage[anchor];
  current = clamp(current);
  renderBase();
  buildToc();
  updateChrome();
}

// 스크롤 모드 진행 갱신
stage.addEventListener('scroll', () => { if (settings.flip === 'scroll') updateChromeScroll(); }, { passive:true });

/* 설정 이벤트 */
$('#setTheme').addEventListener('click', e => { const t=e.target.closest('.swatch'); if(!t)return; settings.theme=t.dataset.theme; applySettings(); });
$('#setFlip').addEventListener('click', e => { const b=e.target.closest('button'); if(!b)return; settings.flip=b.dataset.flip; applySettings(); reflow(); });
$('#setLead').addEventListener('click', e => { const b=e.target.closest('button'); if(!b)return; settings.lead=+b.dataset.lead; applySettings(); reflow(); });
$('#setFont').addEventListener('click', e => { const b=e.target.closest('button'); if(!b)return; settings.font=b.dataset.font; applySettings(); reflow(); });
$('#sizeUp').addEventListener('click', () => { settings.size=Math.min(28,settings.size+1); applySettings(); reflow(); });
$('#sizeDown').addEventListener('click', () => { settings.size=Math.max(14,settings.size-1); applySettings(); reflow(); });
// 라벨 색: 칩 탭 → 편집 토글, 슬라이더로 hue 조정(라이브), 리셋으로 자동 색 복귀
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
   8) 부팅
   ========================================================================= */
function boot(){
  applySettings();
  applyLabelStyle();
  buildLabelControls();
  paginate();
  buildToc();
  current = clamp(load(STORE_POS+':'+docTitle, 0));
  renderBase();
  updateChrome();
  // 첫 진입 힌트
  if (!load('br-hinted', false)){
    const hint = $('#hint'); hint.classList.add('show');
    setTimeout(()=>hint.classList.remove('show'), 3200);
    save('br-hinted', true);
  }
}
boot();

// 리사이즈 시 재배치(디바운스)
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(()=>reflow(), 200); });
