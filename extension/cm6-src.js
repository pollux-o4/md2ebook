import { EditorState, StateField, StateEffect } from '@codemirror/state';
import {
  EditorView, Decoration, WidgetType, keymap
} from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';

/* ================================================================
   0) 라벨 색조 — reader.html 의 hue() 로직 이식 (단일 출처)
   ================================================================
   보기(reader)의 `.lbl.auto` 는 hsl(var(--h) …) 로 hue 를 받는다. 임의 라벨의
   색을 보기와 완전히 일치시키려면 reader 와 동일한 hue 산출식을 써야 한다.
   HUES(예약 hue)와 문자열 해시(%360) 둘 다 reader.html 라인 473–481 그대로. */
const LABEL_HUES = {
  '중요':6,'IMPORTANT':6,'TODO':214,'할일':214,'질문':278,'QUESTION':278,
  '참고':158,'NOTE':158,'REF':158,'경고':32,'WARNING':32,'팁':176,'TIP':176,
};
function labelHue(s){
  if (LABEL_HUES[s] != null) return LABEL_HUES[s];
  let h = 0; for (let i = 0; i < s.length; i++) h = (h*31 + s.charCodeAt(i)) >>> 0; return h % 360;
}
// 시맨틱 4종 — reader.html 라인 471 의 LABELS 와 동일.
const LABEL_SEM = { '사실': 'fact', '추정': 'guess', '의견': 'op', '모름': 'none' };

/* ================================================================
   1) 테마
   ================================================================ */
const baseTheme = EditorView.theme({
  '&': {
    height: 'auto',
    minHeight: '100%',
    backgroundColor: 'var(--page)',
    color: 'var(--ink)',
    fontFamily: 'var(--reader-font)',
    fontSize: 'var(--reader-size)',
    border: 'none',
    outline: 'none',
  },
  '&.cm-focused': { outline: 'none' },
  /* line-height 를 .cm-scroller 와 .cm-content 에 명시 고정한다.
     이유: CM6 내장 baseTheme 이 '.cm-scroller{line-height:1.4}' 를 직접 박아,
     우리 &(.cm-editor) 의 상속을 끊는다. 그 결과 환경(호스트 .page-pad 의
     line-height 상속 승부)에 따라 .cm-content 가 1.4(sandbox)/1.9(VS Code)로
     갈려 렌더 세로 간격이 달라졌다. 여기서 reader 본문과 동일한 1.9 로 못박아
     환경 무관·렌더↔커서 일관을 보장한다. */
  '.cm-scroller': { overflow: 'visible', fontFamily: 'inherit', lineHeight: 'var(--reader-leading) !important' },
  '.cm-content': {
    padding: '0',
    caretColor: 'var(--accent)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: 'var(--reader-leading) !important',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '& .cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--sel)',
  },
  /* 인라인 마크 — 커서 블록 내 활성 상태 */
  /* 보기 `.page-pad strong{ font-weight:600 }` 과 일치(브라우저 bold=700 이라 어긋났음). */
  '.cm-md-strong': { fontWeight: '600' },
  '.cm-md-em':     { fontStyle: 'italic' },
  /* 인라인 코드·라벨은 지어낸 `.cm-md-code`/`.cm-md-lbl*` 를 폐기하고 보기(reader)의
     전역 규칙을 단일 출처로 쓴다:
       · 코드  → buildInlineDecos 가 실제 <code> 요소로 감싸 `.page-pad code` 적용
       · 라벨  → `lbl fact|guess|op|none|auto` 클래스로 `.lbl*` 적용
     따라서 여기엔 별도 정의가 없다(주입된 reader-styles 가 담당). */
  '.cm-md-h1': { fontSize: '1.62em', fontWeight: '600', letterSpacing: '-.01em', lineHeight: '1.3' },
  '.cm-md-h2': { fontSize: '1.3em',  fontWeight: '600', lineHeight: '1.35' },
  '.cm-md-h3': { fontSize: '1.08em', fontWeight: '600' },
  '.cm-md-h4': { fontSize: '1em',    fontWeight: '600' },
  '.cm-md-h5': { fontSize: '.92em',  fontWeight: '600', letterSpacing: '.01em', color: 'var(--ink-soft)' },
  '.cm-md-h6': { fontSize: '.85em',  fontWeight: '600', letterSpacing: '.04em', color: 'var(--ink-soft)', textTransform: 'uppercase' },
  '.cm-line-h1': { paddingBottom: '.5em' },
  '.cm-line-h2': {
    paddingTop: '1.5em',
    paddingBottom: '.87em',
    backgroundImage: 'linear-gradient(var(--rule), var(--rule))',
    backgroundSize: '100% 1px',
    backgroundPosition: 'left bottom .55em',
    backgroundRepeat: 'no-repeat',
  },
  '.cm-line-h3': { paddingTop: '1.5em', paddingBottom: '.4em' },
  '.cm-line-h4': { paddingTop: '1.3em', paddingBottom: '.35em' },
  '.cm-line-h5': { paddingTop: '1.2em', paddingBottom: '.3em' },
  '.cm-line-h6': { paddingTop: '1.2em', paddingBottom: '.3em' },
  '.cm-md-hmark': { opacity: '0.35', fontWeight: 'normal' },
  /* 블록 위젯 — display:flow-root으로 BFC 생성 → 자식 <hr> margin이 외부로 collapse되지 않음 */
  '.cm-block-widget': {
    display: 'flow-root',
    cursor: 'text',
    fontFamily: 'var(--reader-font)',
    fontSize: 'var(--reader-size)',
    lineHeight: 'var(--reader-leading)',
    color: 'var(--ink)',
  },
  /* 리스트 라인(인라인-데코 방식) — 항상 라인 박스라 raw↔렌더 높이 불변.
     들여쓰기: hanging indent. 깊이별 padding-left 로 마크·텍스트 블록을 오른쪽으로
     밀고, text-indent 음수로 마크를 그 왼쪽에 매달아 후속 줄이 마크 폭만큼
     더 들여써지도록(렌더 <ul> 의 marker/텍스트 정렬과 동일한 느낌) 한다.
     depth 0 기준 padding-left = 렌더 <ul> padding-left(1.35em) + 마크 폭(1.4em). */
  /* 들여쓰기: base padding + hanging(text-indent). 깊이별 cm-li-dN 이 depth 당
     1.35em 추가 padding 을 얹어 또렷한 중첩 계단을 만든다. depth 는 선행 공백
     (raw·렌더 공통)으로 계산되어 커서 여부와 무관하게 같은 클래스가 붙으므로
     들여쓰기가 raw↔렌더 픽셀 불변이다.
     주의: 선행 공백 자체도 텍스트로 렌더되므로(약 0.48em/level) dN padding 은
     depth 0 기준 증분만 담당. base(d0)=1.966em, 이후 depth 당 1.35em. */
  /* 상하 padding(.16em×2 ≈ reader <li>{margin:.32em 0}) 로 항목 간 간격을 준다.
     line-height 1.9 라 wrap 된 둘째 줄이 생겨도 이 간격이 다음 항목과 구분해 준다
     (reader 렌더의 li margin 과 동일 효과). 항목은 단일 .cm-line 이라 padding 이
     항목 경계에만 붙고 wrap 내부 줄엔 안 붙는다. raw·렌더 공통 → 세로 불변. */
  '.cm-li': { paddingLeft: '1.966em', textIndent: '-0.616em', paddingTop: '.16em', paddingBottom: '.16em' },
  '.cm-li-d1': { paddingLeft: '3.316em' },
  '.cm-li-d2': { paddingLeft: '4.666em' },
  '.cm-li-d3': { paddingLeft: '6.016em' },
  '.cm-li-d4': { paddingLeft: '7.366em' },
  '.cm-li-d5': { paddingLeft: '8.716em' },
  '.cm-li-d6': { paddingLeft: '10.066em' },
  /* 불릿 위젯 — raw '- '(하이픈+공백) 자리를 대체. 폭을 raw '- ' 실측값
     (0.616em @ Georgia)에 맞춰 렌더 텍스트 x 를 raw 와 픽셀 정합한다.
     hanging 시작점(padding-left + text-indent)은 raw·렌더 공통이므로 폭만 일치시키면
     텍스트 좌측이 동일해진다. */
  /* 마커 박스 — 점을 왼쪽 정렬해 점~텍스트 gap 을 확보한다. 박스 폭을 0.716em 으로
     키우되 margin-left:-0.1em 으로 왼쪽만 확장 → 박스 오른쪽 끝(=텍스트 시작 x)은
     0.616em 자리 그대로 유지(불변). gap = 박스폭(0.716em≈12.9px) - 점(0.4em≈7.2px)
     = ~5.7px. 채운/빈 원 동일 적용. */
  /* 인라인 마커 숨김(Decoration.replace)이 라인 박스 높이를 부풀리던 문제 해결.
     CM6 는 replace 데코 자리에 .cm-widgetBuffer(<img>, vertical-align:text-top, 18px)
     를 삽입한다. 이 버퍼가 텍스트 행과 겹쳐 line box 를 늘려, 렌더(마커 숨김)와
     커서(마커 노출) 상태의 줄 높이가 달라진다 — 특히 wrap 되는 줄에서 시각행 수까지
     달라 보이게 만든다(예: 긴 h2 렌더 3행 140px vs 커서 2행 113px, 26.8px 점프).
     실측 결과 모든 .cm-widgetBuffer 는 .cm-line 내부에만 있고(블록 위젯은 .cm-content
     직속 형제라 무관), 이를 전부 display:none 하면 렌더↔커서 세로 픽셀 불변이 된다.
     리스트(불릿·체크박스 위젯 버퍼)도 이 규칙의 부분집합으로 함께 처리된다. */
  '.cm-line .cm-widgetBuffer': { display: 'none !important' },
  '.cm-li-bullet': {
    position: 'relative',
    display: 'inline-block',
    width: '0.716em',
    height: '0',
    marginLeft: '-0.1em',
    lineHeight: '0',
    overflow: 'visible',
    verticalAlign: 'baseline',
  },
  /* 원 마커 — 채운/빈 원 모두 같은 지름(0.4em ≈ 7.2px). 절대배치. 부모(height:0)가
     텍스트 baseline 에 놓이므로, baseline 위 ~0.28em 지점(소문자/한글 시각 중앙)에
     점 중심을 맞춘다(top:-0.28em + translateY(-50%)). */
  '.cm-li-dot': {
    position: 'absolute',
    left: '0',
    top: '-0.45em',
    transform: 'translateY(-50%)',
    width: '0.4em',
    height: '0.4em',
    borderRadius: '50%',
    boxSizing: 'border-box',
  },
  '.cm-li-dot-filled': { backgroundColor: 'var(--ink-soft)' },
  '.cm-li-dot-hollow': { border: '1px solid var(--ink-soft)', backgroundColor: 'transparent' },
  /* 태스크 체크박스 — ghost(투명 원문)로 raw 와 동일 폭 확보 + 체크박스 오버레이. */
  '.cm-li-task': {
    position: 'relative',
    display: 'inline-block',
    textIndent: '0',
  },
  '.cm-li-task-ghost': { visibility: 'hidden' },
  '.cm-li-task-box': {
    position: 'absolute',
    left: '0',
    top: '50%',
    transform: 'translateY(-50%)',
    margin: '0',
    accentColor: 'var(--accent)',
    cursor: 'default',
    pointerEvents: 'none',
  },
});

/* ================================================================
   2) 블록 위젯
   ================================================================ */
class BlockWidget extends WidgetType {
  constructor(src, html, extraClass = '', startNum = null) {
    super();
    this.src  = src;
    this.html = html;
    this.extraClass = extraClass;
    this.startNum = startNum; // OrderedList 항목 위젯의 시작 번호(<ol start>)
  }

  toDOM() {
    const div = document.createElement('div');
    div.className = this.extraClass ? 'cm-block-widget ' + this.extraClass : 'cm-block-widget';
    div.innerHTML = this.html;
    // 순서 리스트 항목은 각자 <ol> 래퍼를 가져 1 부터 다시 세므로, 실제 순번을
    // start 로 지정해 원본 번호(3,4,5…)를 복원한다.
    if (this.startNum != null) {
      const ol = div.querySelector('ol');
      if (ol) ol.setAttribute('start', String(this.startNum));
    }
    return div;
  }

  ignoreEvent() { return false; }

  eq(other) {
    return this.src === other.src
      && this.extraClass === other.extraClass
      && this.startNum === other.startNum;
  }
}

/* ================================================================
   3) 포커스 StateField
   ================================================================ */
const focusEffect = StateEffect.define();

const focusField = StateField.define({
  create: () => false,
  update(focused, tr) {
    for (const e of tr.effects) if (e.is(focusEffect)) return e.value;
    return focused;
  }
});

const focusHandlers = EditorView.domEventHandlers({
  focus(event, view) {
    view.dispatch({ effects: focusEffect.of(true) });
    return false;
  },
  blur(event, view) {
    view.dispatch({ effects: focusEffect.of(false) });
    return false;
  }
});

/* ================================================================
   4) 인라인 데코레이션 — 커서 블록 내 활성
   ================================================================ */
// buildBlockDecorations 에서 INLINE_NODES / WIDGET_NODES 로 분리됨
// getBlockStates 디버그 API용으로만 유지
// 실제 lezer 노드명: HorizontalRule(---), Blockquote(>), Table(GFM)
const BLOCK_NODES = new Set([
  'Paragraph',
  'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
  'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
  'FencedCode', 'Blockquote', 'BulletList', 'OrderedList',
  'Table', 'HorizontalRule',
]);

function buildInlineDecos(state, from, to, hasFocus = true) {
  const decos = [];
  const cursorLines = new Set();
  if (hasFocus) {
    for (const range of state.selection.ranges) {
      if (range.from > to || range.to < from) continue;
      const f = state.doc.lineAt(Math.max(range.from, from)).number;
      const t = state.doc.lineAt(Math.min(range.to, to)).number;
      for (let n = f; n <= t; n++) cursorLines.add(n);
    }
  }

  syntaxTree(state).iterate({ from, to,
    enter(node) {
      const onCursor = cursorLines.has(state.doc.lineAt(node.from).number);

      if (node.name === 'StrongEmphasis') {
        if (!onCursor) {
          node.node.cursor().iterate(c => {
            if (c.name === 'EmphasisMark' && c.from < c.to)
              decos.push(Decoration.replace({}).range(c.from, c.to));
          });
        }
        decos.push(Decoration.mark({ class: 'cm-md-strong' }).range(node.from, node.to));
        return false;
      }
      if (node.name === 'Emphasis') {
        if (!onCursor) {
          node.node.cursor().iterate(c => {
            if (c.name === 'EmphasisMark' && c.from < c.to)
              decos.push(Decoration.replace({}).range(c.from, c.to));
          });
        }
        decos.push(Decoration.mark({ class: 'cm-md-em' }).range(node.from, node.to));
        return false;
      }
      if (node.name === 'InlineCode') {
        // 백틱(CodeMark)은 bold 의 ** 와 동일 패턴으로 처리한다:
        //   · 비커서(렌더) 라인 → 백틱 숨김(Decoration.replace)
        //   · 커서 라인 → 백틱 노출(편집용)
        // 라벨(백틱 내부가 [...]) 이면 강조 칩 클래스, 아니면 인라인 코드 클래스.
        const inner = state.sliceDoc(node.from, node.to).replace(/^`+|`+$/g, '').trim();
        const isLabel = /^\[.+\]$/.test(inner);

        if (!onCursor) {
          // 백틱만 숨김 → 렌더 시 코드는 `text`, 라벨은 [사실] 만 남는다.
          node.node.cursor().iterate(c => {
            if (c.name === 'CodeMark' && c.from < c.to)
              decos.push(Decoration.replace({}).range(c.from, c.to));
          });
        }

        if (isLabel) {
          // 보기(reader)의 전역 `.lbl` 클래스를 그대로 재사용 → 색·.74em 단일 출처.
          //   · 시맨틱(사실/추정/의견/모름) → `lbl fact|guess|op|none`
          //   · auto(임의 태그)          → `lbl auto` + inline `--h` 로 hue 주입
          //     (reader `.lbl.auto{ color:hsl(var(--h) …) }` 가 색을 입힌다)
          const key = inner.slice(1, -1);
          const sem = LABEL_SEM[key];
          // auto 라벨: data-key 만 부여한다. 색(--h)은 인라인으로 박지 않는다 —
          // 보기(reader)의 #labelStyle 이 `.lbl.auto[data-key="k"]{--h:커스텀}` 규칙을
          // 생성하므로, 사용자가 조정한 per-key 커스텀 색이 그대로 반영된다(회귀 복구).
          // 인라인 style 은 그 규칙을 이겨 커스텀을 무력화하므로 금지.
          // (sandbox 도 아래 loadReaderStyles 와 짝이 되는 라벨 스타일을 생성하도록 이식됨)
          const spec = sem
            ? { class: `lbl ${sem}` }
            : { class: 'lbl auto', attributes: { 'data-key': key } };
          decos.push(Decoration.mark(spec).range(node.from, node.to));
        } else {
          // 보기 `.page-pad code` 가 직접 입혀지도록 실제 <code> 요소로 감싼다(단일 출처).
          decos.push(Decoration.mark({ tagName: 'code' }).range(node.from, node.to));
        }
        return false;
      }
      if (/^ATXHeading[1-6]$/.test(node.name)) {
        const level = parseInt(node.name.slice(-1), 10);
        decos.push(Decoration.line({ class: `cm-line-h${level}` }).range(node.from));
        node.node.cursor().iterate(c => {
          if (c.name === 'HeaderMark' && c.from < c.to) {
            if (!onCursor) {
              const end = c.to < node.to && state.sliceDoc(c.to, c.to + 1) === ' ' ? c.to + 1 : c.to;
              decos.push(Decoration.replace({}).range(c.from, end));
            } else {
              decos.push(Decoration.mark({ class: 'cm-md-hmark' }).range(c.from, c.to));
            }
          }
        });
        decos.push(Decoration.mark({ class: `cm-md-h${level}` }).range(node.from, node.to));
        return false;
      }
    },
  });

  return decos;
}

/* ================================================================
   5) 블록 데코레이션 빌더 (StateField 전용 — block:true 허용)
   ================================================================
   아키텍처 원칙:
   - INLINE_NODES (Paragraph, ATXHeading): 항상 인라인 데코만 사용.
     Decoration.replace({block:true})를 쓰면 ArrowDown이 블록 전체를 한 번에
     건너뛰어 줄 단위 이동이 불가능해진다. 인라인 데코는 buildInlineDecos가
     커서 위치에 따라 마커 숨김/표시를 처리하므로 동일한 시각 결과 달성 가능.
   - WIDGET_NODES (Table, FencedCode 등): 비커서 시 HTML 위젯. 이 블록들은
     내부 줄 단위 편집이 없으므로 원자 단위 취급이 적합하다.
   ================================================================ */

// Paragraph·Heading: 인라인 데코 전용 (block widget 금지)
const INLINE_NODES = new Set([
  'Paragraph',
  'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
  'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
]);

// 복합 블록: 비커서 시 HTML 위젯 (원자 단위 cursor jump 허용)
// 실제 lezer 노드명 기준 (getAllNodeNames() 로 검증)
// 주의: BulletList/OrderedList 는 여기 없음 — 리스트는 항목(ListItem) 단위로
// 개별 위젯화한다(listItemRanges 참조). 리스트 전체를 원자화하면 커서 진입 시
// 리스트 전체가 raw 로 뒤집혀 "항목 단위 편집"이 불가능해지기 때문.
const WIDGET_NODES = new Set([
  'FencedCode', 'Blockquote',
  'Table', 'HorizontalRule',
]);

// 리스트 컨테이너 노드명 — 최상위 자식 ListItem 을 개별 위젯 대상으로 삼는다.
const LIST_NODES = new Set(['BulletList', 'OrderedList']);

/* 문서 내 모든 "최상위 ListItem" 범위를 수집.
   - 중첩 리스트의 자식 ListItem 은 부모 ListItem 범위에 포함되므로 별도 항목으로
     잡지 않는다(부모 항목 위젯 하나가 자식 리스트까지 통째로 렌더). enter 에서
     LIST_NODES 를 만나면 그 직속 ListItem 만 push 하고 하위는 재귀하지 않는다.
   - ListItem 은 HTML 렌더 시 자기 ListMark(예: "3.")를 포함하므로 고립 렌더해도
     순서 번호와 불릿 계층이 보존된다(parseBlock = 완전한 마크다운 파서). */

/* 불릿 치환 위젯 — 비커서 리스트 라인의 마크(-,*,+)를 원 마커로 표시.
   글리프(•/○)는 폰트별 글리프 폭이 제각각(•=7px, ○=18px)이라 크기·정렬이
   깨진다. 대신 CSS 로 그린 고정 지름 원을 쓴다:
     · depth 0 → 채운 원(.cm-li-dot-filled)
     · depth ≥1 → 같은 지름의 빈 원(.cm-li-dot-hollow, border 1px)
   바깥 span(.cm-li-bullet)이 폭 0.616em 을 유지해 텍스트 x 불변. */
class BulletWidget extends WidgetType {
  constructor(depth = 0) { super(); this.depth = depth; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-li-bullet';
    const dot = document.createElement('span');
    dot.className = this.depth >= 1 ? 'cm-li-dot cm-li-dot-hollow' : 'cm-li-dot cm-li-dot-filled';
    span.appendChild(dot);
    return span;
  }
  eq(other) { return this.depth === other.depth; }
  ignoreEvent() { return true; }
}

/* 태스크 체크박스 위젯 — '- [ ] '(또는 '- [x] ') 마커 전체를 대체.
   폭 정합 방식: 대체 대상 문자열을 투명하게 깔아(ghost) 그 폭을 확보하고, 그 위에
   체크박스를 겹쳐 그린다.
   핵심: ghost 는 원문 그대로가 아니라 체크 표기('x'/'X')를 공백으로 정규화해
   '- [ ] ' 폭으로 고정한다. 그래야 체크/미체크 항목의 체크박스 폭·텍스트 시작 x 가
   동일해져 태스크 목록이 세로로 좌측 정렬된다. ('x' vs ' ' 글자폭 차 4.75px 로
   텍스트가 밀리던 문제 해소.) raw↔렌더는 이 폭차(가로)만 달라지고 세로는 불변. */
class TaskCheckWidget extends WidgetType {
  constructor(checked, rawText) { super(); this.checked = checked; this.rawText = rawText; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-li-task';
    // 폭 확보용 투명 원문 — 체크 표기를 공백으로 정규화해 미체크 폭으로 고정
    const ghost = document.createElement('span');
    ghost.className = 'cm-li-task-ghost';
    ghost.textContent = this.rawText.replace(/\[[xX]\]/, '[ ]');
    // 체크박스(절대배치 오버레이)
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.tabIndex = -1;
    box.setAttribute('aria-hidden', 'true');
    box.className = 'cm-li-task-box';
    span.appendChild(ghost);
    span.appendChild(box);
    return span;
  }
  eq(other) { return this.checked === other.checked && this.rawText === other.rawText; }
  ignoreEvent() { return true; }
}

/* 리스트 데코 빌더 — 인라인-데코 방식(라인 박스 유지).
   listNode 이하 모든 ListItem(중첩 포함)을 순회하며:
     · 각 라인에 cm-li + cm-li-dN(깊이) line 데코 → 들여쓰기 정합
     · 비커서 라인의 불릿 마크를 • 로 치환(순서 번호는 유지)
     · 인라인(strong/em/code)은 각 ListItem 범위에서 buildInlineDecos 재사용
   깊이는 라인 선행 공백 수 / 2 로 계산(마크다운 2칸=1단계, lezer 중첩과 일치). */
function buildListDecos(state, listNode, hasFocus, decos) {
  // 커서가 놓인 라인 집합(hasFocus 시)
  const cursorLines = new Set();
  if (hasFocus) {
    for (const r of state.selection.ranges) {
      const f = state.doc.lineAt(r.from).number;
      const t = state.doc.lineAt(r.to).number;
      for (let n = f; n <= t; n++) cursorLines.add(n);
    }
  }

  // 재귀: 각 ListItem 처리. depth 는 라인 선행 공백으로 판정하므로 별도 전달 불필요.
  const seenInlineFor = new Set(); // ListItem from 중복 인라인 처리 방지

  function processItem(itemNode) {
    // ListMark 추출
    let mark = null;
    for (let ch = itemNode.firstChild; ch; ch = ch.nextSibling) {
      if (ch.name === 'ListMark') { mark = ch; break; }
    }
    if (!mark) return;

    const markStr = state.sliceDoc(mark.from, mark.to);
    const isBullet = /^[-*+]$/.test(markStr.trim());
    const markLine = state.doc.lineAt(mark.from);
    const onCursor = cursorLines.has(markLine.number);
    // 깊이: 마크 라인의 선행 공백 수 / 2 (마크다운 2칸=1단계).
    const lead = (markLine.text.match(/^\s*/)[0] || '').replace(/\t/g, '  ').length;
    const depth = Math.floor(lead / 2);

    // 태스크 항목 판별: ListItem 자식에 Task 노드가 있으면 체크박스 항목.
    let taskNode = null;
    for (let ch = itemNode.firstChild; ch; ch = ch.nextSibling) {
      if (ch.name === 'Task') { taskNode = ch; break; }
    }

    // 이 항목의 "첫 줄"(마크가 있는 줄)에만 마크 치환 적용.
    if (!onCursor && taskNode) {
      // 태스크: '- [ ] '(마크+체크마커+공백) 전체를 체크박스 위젯으로 치환.
      // 폭을 raw 원문('- [ ] ')과 정합해 뒤 텍스트 x 불변.
      let tm = null;
      for (let ch = taskNode.firstChild; ch; ch = ch.nextSibling) {
        if (ch.name === 'TaskMarker') { tm = ch; break; }
      }
      if (tm) {
        const checked = /x/i.test(state.sliceDoc(tm.from, tm.to));
        const end = state.sliceDoc(tm.to, tm.to + 1) === ' ' ? tm.to + 1 : tm.to;
        const rawText = state.sliceDoc(mark.from, end); // 대체 대상 원문(폭 정합용)
        decos.push(
          Decoration.replace({ widget: new TaskCheckWidget(checked, rawText) }).range(mark.from, end)
        );
      }
    } else if (!onCursor && isBullet) {
      // 일반 불릿: 마크 + 뒤따르는 공백 1칸을 •/○ 위젯으로 치환(폭 정합, 깊이별 모양)
      const afterSpace = state.sliceDoc(mark.to, mark.to + 1) === ' ' ? mark.to + 1 : mark.to;
      decos.push(
        Decoration.replace({ widget: new BulletWidget(depth) }).range(mark.from, afterSpace)
      );
    }
    // 순서 마크(3.)는 비커서여도 원문 유지 → 렌더=raw 완전 불변(별도 치환 없음)

    // 인라인 데코(strong/em/code)는 ListItem 전체 범위에서 한 번만
    if (!seenInlineFor.has(itemNode.from)) {
      seenInlineFor.add(itemNode.from);
      for (const d of buildInlineDecos(state, itemNode.from, itemNode.to, hasFocus)) decos.push(d);
    }

    // 자식(중첩 리스트) 재귀
    for (let ch = itemNode.firstChild; ch; ch = ch.nextSibling) {
      if (LIST_NODES.has(ch.name)) {
        for (let gi = ch.firstChild; gi; gi = gi.nextSibling) {
          if (gi.name === 'ListItem') processItem(gi);
        }
      }
    }
  }

  for (let ch = listNode.firstChild; ch; ch = ch.nextSibling) {
    if (ch.name === 'ListItem') processItem(ch);
  }

  // 라인 데코: listNode 가 점유한 모든 라인에 cm-li + 깊이별 cm-li-dN 부여.
  //  · 깊이는 라인 선행 공백(원문 그대로, raw·렌더 공통)으로 계산 → 커서 여부와
  //    무관하게 같은 클래스가 붙으므로 들여쓰기가 raw↔렌더 픽셀 불변.
  //  · dN 은 base 위에 깊이당 추가 padding 을 얹어(선행 공백만으론 얕음) reader 처럼
  //    또렷한 중첩 계단을 만든다.
  const firstLine = state.doc.lineAt(listNode.from).number;
  const lastLine  = state.doc.lineAt(listNode.to).number;
  for (let ln = firstLine; ln <= lastLine; ln++) {
    const line = state.doc.line(ln);
    if (line.text.trim() === '') continue; // 빈 줄(loose 구분) 제외
    const lead = (line.text.match(/^\s*/)[0] || '').replace(/\t/g, '  ').length;
    const depth = Math.min(Math.floor(lead / 2), 6);
    decos.push(Decoration.line({ class: `cm-li cm-li-d${depth}` }).range(line.from));
  }
}

function buildBlockDecorations(state, hasFocus, parseBlock) {
  const decos = [];

  function cursorOverlapsWidget(from, to) {
    if (!hasFocus) return false;
    // 라인 겹침 판정: 커서가 놓인 라인이 위젯이 점유한 라인 범위와 겹치면 raw.
    // offset 판정(r.from >= to)은 커서가 블록 텍스트의 끝(exclusive 경계 to)에
    // 앉을 때 — 특히 짧은 ListItem 을 클릭해 커서가 항목 끝에 떨어지는 흔한 경우 —
    // 해당 항목을 "밖"으로 오판해 raw 전환이 안 되는 문제가 있었다. 라인 기준이면
    // 같은 라인 끝이라도 포함되고, 헤딩·문단의 라인 기반 raw 판정과도 일관된다.
    const wFromLine = state.doc.lineAt(from).number;
    const wToLine   = state.doc.lineAt(to).number;
    return state.selection.ranges.some(r => {
      const rFromLine = state.doc.lineAt(r.from).number;
      const rToLine   = state.doc.lineAt(r.to).number;
      return rFromLine <= wToLine && rToLine >= wFromLine;
    });
  }

  syntaxTree(state).iterate({
    enter(node) {
      if (INLINE_NODES.has(node.name)) {
        // Paragraph·Heading: 커서 위치 무관하게 항상 인라인 데코
        // hasFocus=false면 cursorLines가 비어 → 모든 마커 숨김 (렌더 상태)
        for (const d of buildInlineDecos(state, node.from, node.to, hasFocus)) decos.push(d);
        return false;
      }

      if (WIDGET_NODES.has(node.name)) {
        if (cursorOverlapsWidget(node.from, node.to)) {
          // 커서 블록: raw + 인라인 데코
          for (const d of buildInlineDecos(state, node.from, node.to, hasFocus)) decos.push(d);
        } else {
          // 비커서: HTML 위젯
          const src  = state.sliceDoc(node.from, node.to);
          const html = parseBlock(src);
          decos.push(
            Decoration.replace({ widget: new BlockWidget(src, html), block: true })
              .range(node.from, node.to)
          );
        }
        return false;
      }

      if (LIST_NODES.has(node.name)) {
        // 리스트: 인라인-데코 방식. ListItem 을 위젯화하지 않고 라인 박스를 유지한다.
        //  - 항상 라인 박스 → raw↔렌더 토글 시 높이 불변(위젯 박스 이원화 제거).
        //  - 깊이별 line 데코(cm-li-dN)로 렌더 <ul> 들여쓰기와 동일한 left padding.
        //  - 비커서 라인: 불릿 마크(-,*,+)를 • 로 치환(고정폭), 마크 뒤 공백 정리.
        //    순서 번호(3.)는 원문 그대로 두어 렌더=raw 완전 불변.
        //  - 인라인(strong/em/code)은 buildInlineDecos 가 각 ListItem 범위에서 처리.
        buildListDecos(state, node.node, hasFocus, decos);
        return false; // 하위(중첩 리스트 포함) 전부 여기서 처리했으니 재귀 금지
      }
    },
  });

  decos.sort((a, b) => a.from - b.from || a.startSide - b.startSide);
  return Decoration.set(decos, true);
}

/* ================================================================
   6) 위젯 진입 keymap — ArrowDown/Up이 WIDGET_NODE 경계에서 from 위치로 커서 이동
   Decoration.replace({block:true})는 Arrow 탐색 시 블록 전체를 건너뜀.
   이 keymap이 먼저 가로채서 커서를 위젯 from에 놓으면 cursorOverlapsWidget이
   true를 반환해 raw 전환이 일어남.
   ================================================================ */
function findWidgetAt(state, pos) {
  let found = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (WIDGET_NODES.has(node.name) && node.from <= pos && pos < node.to) {
        found = { from: node.from, to: node.to };
        return false;
      }
      // 리스트는 인라인-데코 방식(라인 박스)이라 위젯이 아니다. Arrow 탐색은
      // CM6 기본 동작(줄 단위)에 맡긴다 → 여기서 리스트를 경계로 잡지 않는다.
    },
  });
  return found;
}

// 리스트 항목 라인 판정: 선행 공백 + 마커(- * + 또는 1. / 1)) + 공백.
// 정규식 기반(lezer 노드 경계 이슈 회피). 반환: 매치 시 { indentLen } 아니면 null.
const RE_LIST_LINE = /^(\s*)(?:[-*+]|\d+[.)])\s/;
function listIndentOf(lineText) {
  const m = RE_LIST_LINE.exec(lineText);
  if (!m) return null;
  return m[1].replace(/\t/g, '  ').length; // 선행 공백(탭=2칸 환산) 길이
}

// Tab/Shift-Tab 들여쓰기 — 리스트 줄에서만 가로챈다. 단위 = 공백 2칸
// (buildListDecos 의 depth = floor(lead/2) 와 일치 → 렌더 중첩 마커·들여쓰기 정합).
const INDENT_UNIT = '  ';
function listIndentKeymap(outdent) {
  return (view) => {
    const { state } = view;
    // 선택이 걸친 모든 라인 수집
    const ranges = state.selection.ranges;
    const lineNums = new Set();
    for (const r of ranges) {
      const f = state.doc.lineAt(r.from).number;
      const t = state.doc.lineAt(r.to).number;
      for (let n = f; n <= t; n++) lineNums.add(n);
    }
    // 대상 라인 중 하나라도 리스트 항목이 아니면 가로채지 않는다(리스트 밖 Tab 기존 동작 유지).
    // 단, 여러 줄 선택 시엔 리스트 라인만 조정하고 비-리스트 라인은 건드리지 않되,
    // "리스트 라인이 하나도 없으면" false 반환(포커스 이탈 등 접근성 보존).
    const targets = [];
    for (const n of lineNums) {
      const line = state.doc.line(n);
      if (listIndentOf(line.text) !== null) targets.push(line);
    }
    if (targets.length === 0) return false;

    const changes = [];
    for (const line of targets) {
      if (outdent) {
        // 선행 공백에서 최대 2칸 제거(0까지만). 탭이 섞이면 1탭(=2칸)을 2칸으로 간주해 1개 제거.
        const lead = /^[ \t]*/.exec(line.text)[0];
        if (lead.length === 0) continue;
        let removeLen = 0;
        if (lead[0] === '\t') removeLen = 1;                 // 탭 1개 = 한 단계
        else removeLen = Math.min(2, lead.length);           // 공백 최대 2칸
        changes.push({ from: line.from, to: line.from + removeLen });
      } else {
        changes.push({ from: line.from, insert: INDENT_UNIT });
      }
    }
    if (changes.length === 0) return false;
    // 커서/선택은 CM6 가 changes 에 맞춰 자동 매핑(텍스트 기준 상대 위치 유지).
    view.dispatch(state.update({ changes, userEvent: outdent ? 'delete.dedent' : 'input.indent', scrollIntoView: true }));
    return true;
  };
}

const listIndentKeys = [
  { key: 'Tab', run: listIndentKeymap(false) },
  { key: 'Shift-Tab', run: listIndentKeymap(true) },
];

const widgetNavKeymap = [
  {
    key: 'ArrowDown',
    run(view) {
      const sel = view.state.selection.main;
      if (!sel.empty) return false;
      const { head } = sel;
      const curLine = view.state.doc.lineAt(head);
      const curWidget = findWidgetAt(view.state, head);

      if (curWidget) {
        // Widget raw mode 내부: oracle defaultLineHeight 오차를 우회해 정확히 한 줄 이동
        const nextLineStart = curLine.to + 1;
        if (nextLineStart >= view.state.doc.length) return false;
        view.dispatch({ selection: { anchor: nextLineStart }, scrollIntoView: true, userEvent: 'select' });
        return true;
      }

      // Widget 외부: 다음 줄이 widget 진입인지 확인
      const nextLineFrom = curLine.to + 1;
      if (nextLineFrom >= view.state.doc.length) return false;
      const widget = findWidgetAt(view.state, nextLineFrom);
      if (!widget) return false;
      view.dispatch({ selection: { anchor: widget.from }, scrollIntoView: true, userEvent: 'select' });
      return true;
    },
  },
  {
    key: 'ArrowUp',
    run(view) {
      const sel = view.state.selection.main;
      if (!sel.empty) return false;
      const { head } = sel;
      const curLine = view.state.doc.lineAt(head);
      const curWidget = findWidgetAt(view.state, head);

      if (curWidget) {
        // Widget raw mode 내부: 정확히 한 줄 위로
        if (curLine.from === 0) return false;
        view.dispatch({ selection: { anchor: curLine.from - 1 }, scrollIntoView: true, userEvent: 'select' });
        return true;
      }

      // Widget 외부: 이전 줄이 widget인지 확인 (widget.from으로 진입)
      if (curLine.from === 0) return false;
      const prevLineTo = curLine.from - 1;
      const widget = findWidgetAt(view.state, prevLineTo);
      if (!widget) return false;
      view.dispatch({ selection: { anchor: widget.from }, scrollIntoView: true, userEvent: 'select' });
      return true;
    },
  },
];

/* ================================================================
   7) StateField 기반 데코레이션
   ================================================================ */
function makeDecoField(parseBlock) {
  return StateField.define({
    create(state) {
      return buildBlockDecorations(state, false, parseBlock);
    },
    update(decos, tr) {
      if (tr.docChanged || tr.selection || tr.effects.some(e => e.is(focusEffect))) {
        const focused = tr.state.field(focusField, false) ?? false;
        return buildBlockDecorations(tr.state, focused, parseBlock);
      }
      return decos;
    },
    provide: f => EditorView.decorations.from(f),
  });
}

/* ================================================================
   8) 공개 API
   ================================================================ */
export function mount(container, { initialDoc = '', onChange, parseBlock } = {}) {
  const fn = parseBlock ?? (src => '<p>' + src.replace(/&/g,'&amp;').replace(/\n/g, '<br>') + '</p>');
  const decoField = makeDecoField(fn);

  const view = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        history(),
        keymap.of([...listIndentKeys, ...widgetNavKeymap, ...defaultKeymap, ...historyKeymap]),
        markdown({ extensions: [GFM] }),
        focusField,
        decoField,
        focusHandlers,
        baseTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of(update => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    }),
    parent: container,
  });

  return {
    hasFocus() { return view.hasFocus; },
    setDoc(text) {
      const current = view.state.doc.toString();
      if (current === text) return;
      view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
    },
    getDoc() { return view.state.doc.toString(); },
    destroy() { view.destroy(); },
    // 디버그/테스트 전용
    getAllNodeNames() {
      const names = new Set();
      syntaxTree(view.state).iterate({ enter(node) { names.add(node.name); } });
      return [...names].sort();
    },
    getCursor() {
      const sel = view.state.selection.main;
      const line = view.state.doc.lineAt(sel.head);
      return { pos: sel.head, line: line.number, col: sel.head - line.from };
    },
    getBlockStates() {
      const st = view.state;
      const results = [];
      syntaxTree(st).iterate({
        enter(node) {
          if (!BLOCK_NODES.has(node.name)) return;
          const line = st.doc.lineAt(node.from);
          results.push({ name: node.name, from: node.from, to: node.to, lineNo: line.number });
          return false;
        }
      });
      const focused = st.field(focusField, false) ?? false;
      return results.map(b => ({
        ...b,
        isWidget: !focused || !(st.selection.ranges.some(r => {
          if (r.from >= b.to || r.to <= b.from) return false;
          const line = st.doc.lineAt(r.head);
          return line.text.trim() !== '';
        }))
      }));
    },
  };
}
