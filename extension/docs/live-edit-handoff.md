# Live Edit (CM6) 핸드오프 문서

> **읽는 시점**: 컨텍스트 압축 후 작업 재개 시 반드시 먼저 읽는다.
> **마지막 업데이트**: 2026-07-02 (세션 3)
> 반복 실패의 일반 교훈은 `lessons.md` 참조.

---

## 세션 3 (2026-07-02) — 결정·실패 추가

### 갱신된(supersede) 이전 결정
- **리스트는 이제 위젯 아님.** 아래 "INLINE_NODES vs WIDGET_NODES" 표에서 `BulletList`/`OrderedList`를 위젯으로 둔 결정은 **폐기**. 위젯 방식은 렌더(위젯 박스)와 raw(라인 박스)의 **박스 모델이 이원화**돼 높이·들여쓰기 정합이 태생적으로 취약(클릭 시 40px↔25px 세로 점프). → **리스트도 인라인-데코(줄 기반)로 전환.** 커서 항목만 raw, 나머지 렌더. 세로 픽셀 불변이 구조적으로 성립. 현재 WIDGET_NODES = `FencedCode, Blockquote, Table, HorizontalRule` 뿐.
- **H2 잔여 오차 해소.** 아래 "현재 H2 잔여 오차"(marginBottom 19.8px 누락)는 **수정 완료**: `marginBottom` 제거 → `paddingBottom .87em` + `background-gradient` 밑줄(선은 `bottom .55em`에 그려 시각 위치 불변). 클릭 좌표 오차 0 확인.

### 새 결정
- **line-height 강제 고정**: `.cm-scroller`/`.cm-content`에 `line-height: var(--reader-leading) !important`. CM6 기본 테마가 `.cm-content`를 1.4로 깔아, `.page-pad`의 1.9 대신 1.4가 먹던 문제 차단. 렌더↔커서·보기와 동일 1.9.
- **불릿은 글리프 대신 CSS 원**: `-`/`*`/`+`를 `BulletWidget`(`.cm-li-dot`)로 치환. filled(depth0)/hollow(depth≥1), 지름 동일. 글리프 `•`(7px)와 `○`(18px)가 크기 달라 보이던 문제 제거.
- **태스크 체크박스 폭 정합**: `[ ]`/`[x]` → ghost(투명 원문, `[x]→[ ]` 정규화로 폭 고정) + 오버레이 input. 체크/미체크 텍스트 좌측 정렬 일치.
- **편집 줄 = 보기 값 재사용**(진행 중): 편집용 스타일을 지어내지 말고 `.page-pad` 값을 단일 출처로. 라벨은 전역 `.lbl` 클래스 재사용(색·`.74em`), 코드는 `.page-pad code` 값. 계획: `~/.claude/plans/mighty-jingling-comet.md`.
- **버전 개발 중 고정(1.2.2)**: 미완 기능마다 bump 금지. 머지 시 1회 bump.

### 실패·교훈 (상세는 `lessons.md`)
- **webview 리소스 캐시 = 숨은 원흉.** VS Code webview는 번들을 확장 버전 기준으로 캐시. 버전을 1.2.2로 고정하니 재빌드해도 옛 번들을 계속 로드 → "sandbox·코드에선 고쳤는데 VS Code에선 그대로"가 반복됨. **해결**: `extension.js`에서 번들 URI에 `?v=<파일 mtime>` 부착(버전 무관 강제 갱신).
- **버전 그림자.** 옛 상위 버전(1.2.3 orphan)이 남아 새 1.2.2를 가릴 위험 — VS Code가 "가장 높은 버전"을 로드하는 함정. **해결**: 확장 통째 uninstall 후 1.2.2 재설치 + orphan dir 제거. (버전 고정하려면 옛 상위 버전을 반드시 지운다.)
- **sandbox가 실제와 drift → 가짜 통과.** 이전 sandbox는 CSS 손복제 + CM 기본 line-height 1.4 + serif 폰트로 실제 reader(1.9, sans)와 달라, wrap·간격 버그를 못 잡았다. **해결**: sandbox가 reader.html `<style>`을 런타임 주입하고 `.page-pad`에 마운트(1:1). 검증은 **충실 sandbox + 실제 VS Code 이중**으로.
- **폐기: 리스트 ListItem별 위젯화.** 항목 단위 raw는 됐으나 위젯↔라인 박스 높이 불일치로 세로 점프. → 인라인-데코로 대체.

---

## 세션 3 후반 (2026-07-02) — 추가 결정

- **편집 줄 = 보기 값 재사용(핵심 방향 전환).** 편집용 스타일을 지어내다 계속 깨졌다(불릿 크기·wrap 간격·라벨색). 결론: 손으로 값을 짓지 말고 **보기(`.page-pad`) CSS를 단일 출처로 재사용.** 라벨은 전역 `.lbl` 클래스, 코드는 `tagName:'code'`로 `.page-pad code`, bold 600 등. Obsidian식(날것 줄에 CSS만, 마커는 커서 줄만)이라 세로 이동 없이 네이티브 외형.
- **wrap 세로 점프 진범 = `.cm-widgetBuffer`.** 마커 숨김(`Decoration.replace`)이 삽입하는 18px `<img>` 버퍼가 line box를 부풀려, wrap 줄이 렌더/커서에서 높이가 달랐다. `.cm-line .cm-widgetBuffer{display:none}`로 해소. (가설: "마커 폭이 wrap 바꿈"은 **틀렸고**, DOM 측정으로 반증됨 — 가설 말고 측정.)
- **라벨 커스텀 색은 인라인 style 금지.** 라벨에 인라인 `--h`를 박으면 reader `#labelStyle`(`.lbl.auto[data-key]{--h:커스텀}`)을 우선순위로 눌러 커스텀 무력화 → `data-key`만 부여, 색은 reader가 입히게.
- **라벨 색 UI가 스크롤 모드에서 사라진 원인**: `updateContent`(VS Code 편집 경로) 스크롤 분기가 `reflow()`(→ `buildLabelControls`)를 건너뜀. 스크롤 분기에 `applyLabelStyle()+buildLabelControls()` 직접 추가. (초기 로드는 boot에서 정상.)
- **Tab 들여쓰기**: `listIndentKeymap`을 `keymap.of` **맨 앞**에 배치(defaultKeymap Tab보다 우선). 리스트 줄만 가로채고 밖에서는 `return false`로 기존 동작 보존. 단위 = 공백 2칸(= `buildListDecos`의 `floor(lead/2)` depth와 정합).

---

## 목표

스크롤 모드에서 Obsidian Live Preview 수준의 편집 UX:
- **비커서 블록** → `parseBlock(src)` 결과 HTML 위젯으로 렌더 (raw 마커 없음)
- **커서 블록** → raw 마크다운 + 인라인 데코레이션 (마커 일부 숨김)
- 레이아웃 안정: 커서 이동해도 여백·줄바꿈 불변

---

## 확정된 아키텍처 결정

| 결정 | 이유 |
|---|---|
| `StateField` 사용 (ViewPlugin 금지) | CM6: block decoration은 ViewPlugin에 불가 (`RangeError: Block decorations may not be specified via plugins`) |
| `EmptyWidget` 제거 | height:0 빈 줄 위젯이 ArrowDown 점프 유발 (빈 줄 건너뛰며 문서 하단 점프) |
| **Paragraph·ATXHeading: 인라인 데코 전용** | `Decoration.replace({ block:true })`를 Paragraph·Heading에 쓰면 CM6가 해당 range를 원자 단위로 취급 → ArrowDown이 블록 전체를 한 번에 건너뜀. 줄 단위 이동 불가. Playwright 루프로 재현·확인 후 아키텍처 분리. |
| **INLINE_NODES vs WIDGET_NODES 분리** | `Paragraph`, `ATXHeading1-6` → 인라인 데코 전용 (마커 숨김+CSS). `Table`, `FencedCode`, `Blockquote`, `BulletList`, `OrderedList`, `HorizontalRule` → 비커서 시 HTML 위젯 (원자 단위 jump 허용). |
| `parseBlock` 파라미터 필수 | `mount()` 호출 시 반드시 `parseBlock: md => parseMarkdown(md)` 전달. 없으면 빈 화면 |
| **heading: margin → padding** | `.cm-line-h*`의 `marginTop` → `paddingTop`으로 교체. `getBoundingClientRect()`는 margin 제외 → CM6 height map 누락. padding은 포함. Click 좌표 매핑 정확도 향상. |
| **`.cm-block-widget` display:flow-root** | `<hr>` 자식의 margin이 부모 밖으로 collapse → CM6가 widget 높이를 1px로 측정. BFC 생성으로 margin이 부모 안에 갇혀 58px 정상 측정. |
| **widgetNavKeymap: widget 내부도 명시적 이동** | CM6의 `cursorLineDown`은 `defaultLineHeight`(oracle median) 기준 점프. 대형 요소(H1·H2·H3·블록위젯)가 median을 부풀려 L18(표 구분행) 등 건너뜀. widget raw mode 내부에서 `dispatch({ anchor: curLine.to + 1 })`로 정확히 한 줄씩 이동. |

---

## CSS margin vs padding 원칙 (height map 관련)

- **CM6 height map**: 각 `.cm-line`·block widget의 `getBoundingClientRect().height` 기준
- **margin**: bounding rect에 미포함 → height map 누락 → `posAtCoords` 오차
- **padding**: bounding rect에 포함 → height map 정확
- **결론**: heading 간격은 반드시 `padding`으로 지정. `margin`은 height map에 보이지 않는 시각적 gap을 만들어 클릭 위치가 어긋남.

현재 H2 잔여 오차:
- `.cm-line-h2`의 `marginBottom: .55em` (9.9px) × 2개(L7, L13) = **19.8px 누적 오차**
- 표 위젯 클릭 시 약 2줄 위에 커서가 앉는 증상으로 나타남

---

## 시도했다가 폐기한 접근법 — 절대 되살리지 말 것

### ❌ ViewPlugin + block:true
```
RangeError: Block decorations may not be specified via plugins
```
→ StateField로만 해결 가능

### ❌ EmptyWidget (height:0)
빈 줄을 height:0으로 접으면 ArrowDown이 여러 빈 줄을 한 번에 건너뛰어 문서 하단으로 점프함.
→ 빈 줄은 자연 높이 유지 (위젯 없음)

### ❌ Paragraph·Heading에 Decoration.replace({ block:true }) 사용
Playwright ArrowDown 루프로 재현: L1→L4→L6→L8 — content 라인 전부 건너뜀.
`block:true` replace는 range를 원자 단위로 만들어 내부 줄 이동 불가.
→ Paragraph·ATXHeading은 반드시 인라인 데코 전용으로 처리해야 함.

### ❌ 마커 완전 숨김 (Decoration.replace로 `**`, 백틱 제거)
커서가 단락으로 이동 시 백틱 2개 분량 텍스트가 사라지며 줄바꿈 변화 → 레이아웃 팽창.
표처럼 긴 줄은 1줄↔2줄 왔다갔다함.
→ 인라인 마커(`**`, `` ` ``)는 커서 라인에서만 표시, 비커서 라인에서 숨김 (좁은 범위 적용)
→ 헤딩 `#`은 `Decoration.replace`로 숨기되 커서 라인에서는 dim 스타일로 표시

### ❌ 마커 완전 표시 (replace 완전 제거)
마커가 항상 보여 Obsidian 목표 달성 불가. 사용자 요구사항 미충족.

### ❌ widget 내부 ArrowDown을 CM6에 위임 (return false)
CM6의 `cursorLineDown`은 `view.defaultLineHeight`(HeightOracle median) 기준 Y 점프.
대형 요소(H1 47px, H2 65px, HR 58px 등)가 median을 부풀리면 25px짜리 일반 줄을 건너뜀.
Playwright 검증: L17(표 헤더) ArrowDown → L19(데이터행) 로 L18(구분행) 건너뜀.
→ widget raw mode 내부에서 `dispatch({ anchor: curLine.to + 1 })`로 직접 이동.

---

## 현재 cm6-src.js 구조

```
mount(container, { initialDoc, onChange, parseBlock })
  └─ makeDecoField(parseBlock)        ← StateField
       └─ buildBlockDecorations()
            ├─ INLINE_NODES (Paragraph, ATXHeading1-6)
            │    └─ 항상 buildInlineDecos() — 커서 여부 무관
            │         ├─ StrongEmphasis/Emphasis: 비커서 줄 마커 숨김 + mark
            │         ├─ InlineCode: 비커서 줄 마커 숨김 + mark
            │         └─ ATXHeading: 라인 클래스 + 커서 라인 # dim, 비커서 # 숨김
            └─ WIDGET_NODES (Table, FencedCode, Blockquote, BulletList, OrderedList, HorizontalRule)
                 ├─ 비커서: BlockWidget(src, html)  ← Decoration.replace({ block:true })
                 └─ 커서:  buildInlineDecos()
  └─ focusField (StateField<boolean>)
  └─ focusHandlers (domEventHandlers focus/blur → focusEffect dispatch)
  └─ widgetNavKeymap (ArrowDown/Up 가로채기)
       ├─ widget 내부: dispatch({ anchor: curLine.to + 1 }) — 정확히 한 줄
       └─ widget 외부 → widget 진입: dispatch({ anchor: widget.from })
```

### widgetNavKeymap 핵심 로직 (cm6-src.js:289~340)

```js
// ArrowDown
if (curWidget) {
  // widget raw mode 내부: oracle 오차 우회, 정확히 한 줄
  dispatch({ anchor: curLine.to + 1 });
  return true;
}
// widget 외부 → 다음 줄이 widget이면 진입
if (widget = findWidgetAt(nextLineFrom)) {
  dispatch({ anchor: widget.from });
  return true;
}
return false; // 일반 줄은 CM6에 위임

// ArrowUp (대칭)
if (curWidget) {
  dispatch({ anchor: curLine.from - 1 });
  return true;
}
```

---

## reader.html 의존 사항

`mountCM6()` 함수 (reader.html):
```js
cm6Editor = window.MD2EBOOK_CM6.mount(padBelow, {
  initialDoc: currentRawMd,
  parseBlock: md => parseMarkdown(md),   // ← 이거 빠지면 빈 화면
  onChange: (markdown) => { ... }
});
```

**`parseBlock` 없으면 화면 빈 채로 표시됨** — 절대 제거 금지.

---

## 검증 게이트

| # | 항목 | 상태 |
|---|---|---|
| 1 | 스크롤 모드 진입 → 비커서 블록 HTML 렌더 | 미검증 (sandbox에서는 OK) |
| 2 | 클릭 시 해당 블록만 raw 전환 | 부분 OK (height map 오차로 좌표 약 2줄 오차) |
| 3 | ArrowDown이 문서 하단으로 점프하지 않음 | ✓ Playwright 검증 완료 |
| 4 | 커서 이동 시 레이아웃 불변 | 미검증 |
| 5 | 표 행 ArrowDown 1줄씩 이동 | ✓ L17→L18→L19→L20→L21 확인 |

---

## 미해결 과제 (우선순위 순)

### 1. H2 marginBottom → paddingBottom 교체 [NEXT]
- `.cm-line-h2`의 `marginBottom: .55em` × 2 = 19.8px height map 누락
- click-to-position 오차 원인
- 수정: `marginBottom: .55em` → `paddingBottom`에 합산 (현재 `.32em` + `.55em` = `.87em`)
  → border-bottom 위치 주의 (`paddingBottom`은 border 안쪽에서 계산)
  → 실제론 `paddingBottom: .32em`(border 위), `marginBottom: .55em`(border 아래 간격) 이므로
     border 아래 간격을 padding으로 표현하려면 구조 재검토 필요

### 2. code fence / blockquote 내부 ArrowDown 미검증
- widgetNavKeymap 수정이 동일하게 적용되므로 동작 예상, 검증 미완

### 3. [게이트] VS Code VSIX 설치 후 사용자 시각 검증 (Task #5)
```bash
cd extension
npm run build:cm6
npx @vscode/vsce package --no-dependencies
code --install-extension markdown-ebook-reader-1.2.2.vsix
```

### 4. feat/live-edit → main squash merge (Task #6, #5 통과 후)

---

## Playwright 하네스 검증 이력

### lezer 노드명 확인 (이전 세션)

| 예상 (잘못됨) | 실제 lezer 노드명 |
|---|---|
| `ThematicBreak` | `HorizontalRule` |
| `BlockQuote` | `Blockquote` |
| `Table` | GFM 미적용 시 없음 → `markdown({ extensions: [GFM] })` 추가로 해결 |

### ArrowDown 내비게이션 결과 (2026-07-01, widgetNavKeymap 수정 후)

L1부터 ArrowDown 20회 결과 (DOM 이벤트 시뮬레이션):

```
step 16: line 17 | 이름 | 역할 | 비고 |    ← 표 헤더 진입 ✓
step 17: line 18 |---|---|---|              ← 구분행 방문 ✓ (이전엔 건너뜀)
step 18: line 19 | Alice | 설계 | 리드 |  ✓
step 19: line 20 | Bob | 구현 | 서브 |    ✓
step 20: line 21 (blank, 표 이탈)         ✓
```

### click-to-position 현황 (2026-07-01)
- 표 위젯 `.click()` → cursor at line 15 (`### 표 (Table)`)
- 실제 표는 line 17에서 시작 → 약 2줄 오차
- 원인: H2 `marginBottom: .55em` × 2 = 19.8px height map 누락

---

## 빌드·배포 명령

```bash
cd extension
npm run build:cm6                              # cm6-bundle.js 재생성
npx @vscode/vsce package --no-dependencies    # VSIX 패키지
code --install-extension markdown-ebook-reader-1.2.2.vsix  # VS Code 설치
# → VS Code에서 Ctrl+Shift+P > Developer: Reload Window
```
