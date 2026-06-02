# md2ebook — Architecture Reference

> 이 문서는 `md-ebook` (= 공개 repo `pollux-o4/md2ebook`) 스킬의 **변경용 레퍼런스**다.
> 코드를 1000줄 다시 읽지 않고도 어디를 고치면 되는지 빨리 찾도록 함수명·줄 범위 단위로 정리했다.
> 인용한 줄 번호는 `src/*` 소스 모듈 기준이다 (`reader.html` 은 이들을 조립한 산출물이라 줄 번호가 다르다).

---

## 1. Overview & the zero-dependency constraint

md2ebook 은 `.md` 한 편을 **외부 의존성 0 의 단일 오프라인 HTML 책 리더**로 바꾼다.
산출물은 CDN·번들러·런타임 fetch 없이 파일 하나로 폰에서도 열린다.

이 제약이 설계 전체를 규정한다:

| 제약 | 귀결 |
|---|---|
| 사용 시점에 빌드 도구 없음 | 마크다운 파서를 라이브러리 대신 `app.js` 에 **손으로 짜 넣음** (`parseMarkdown`/`inline`) |
| 네트워크 0 | 폰트는 system font stack 만, 이미지는 data-URI 또는 동봉 경로만 동작 (자동 인라인화 없음) |
| 단일 파일 | 콘텐츠가 `<script type="text/markdown">` 안에 인라인되고, 변환은 그 블록 **텍스트만** 치환 |
| 토큰/수작업 0 | AI 가 HTML 을 생성하지 않음 — `build.py` 가 블록만 swap, 또는 사람이 블록만 복붙 |

즉 "산출물은 항상 zero-dependency single offline HTML" 이 1순위 불변식이다. 기능을 추가할 때 외부 CSS/JS/폰트/CDN 을 끌어오면 이 불변식이 깨진다.

---

## 2. Build pipeline (two layers)

빌드는 **두 층**으로 나뉜다. 끝사용자는 1층(템플릿 조립)을 절대 돌리지 않는다.

```
 [유지보수 전용]                          [끝사용자]
 src/template.html ─┐                     reader.html (커밋됨)
 src/styles.css   ──┤ --build-template      │ build.py <doc.md>
 src/app.js       ──┘   ─────────►          │   ─────────►  doc.html
        (마커 치환)      reader.html         (md 블록만 swap)
```

### Layer 1 — template assembly (`assemble_template`, build.py:54-65)

`python build.py --build-template` (별칭 `-t`, build.py:69) 가 `src/` 3개 모듈을 읽어 `reader.html` 로 조립한다:

- `STYLE_MARK = "/*__STYLES__*/"` (build.py:26) → `src/styles.css` 전체로 치환 (template.html:8 위치)
- `APP_MARK = "//__APP__"` (build.py:27) → `src/app.js` 전체로 치환 (template.html:176 위치)
- 각각 `.replace(..., 1)` 로 **첫 1회만** 치환 (build.py:62). 마커 문자열은 verbatim 매칭이므로 절대 변형 금지.
- 마커가 없으면 exit 2 (build.py:59-61).

산출물 `reader.html` 은 repo 에 **커밋된다**. README/SKILL 의 "조립본이 이미 커밋돼 있다" 가 이것.

### Layer 2 — content swap (`main`, build.py:68-97)

`python build.py <doc.md> [out.html]` 가 실제 변환이다:

1. `<doc.md>` 읽기 → `rewrite_md_links` 로 링크 재작성 (아래) — build.py:83-84
2. `reader.html` 읽고 `BLOCK` 정규식으로 md 블록 탐색 (build.py:29-32, 85-88)
   `BLOCK = (<script type="text/markdown" id="book-md">)(.*?)(</script>)`, `re.DOTALL`
3. 본문 내 리터럴 `</script>` 를 `<\/script>` 로 이스케이프 (build.py:91) — 안 하면 블록이 조기 종료됨. 리더가 런타임에 원복한다 (app.js:168)
4. `BLOCK.sub` 로 group2(내용)만 교체, group1/group3(태그)은 보존, `count=1` (build.py:92)
5. 출력 경로 생략 시 `<doc>.html` (build.py:94)

CSS/JS 는 손대지 않는다. 따라서 **라벨 색 커스터마이징·읽기 설정은 절대 HTML 에 구워지지 않는다** (런타임 localStorage 전용, 6·7장).

### Link rewrite (`rewrite_md_links`, build.py:37-51)

`](url "title")` 형태(`LINK`, build.py:34)만 본다. `.md` 링크를 **같은 디렉토리에 동명 `.html` 파일이 실제로 존재할 때만** `.html` 로 바꾼다 (build.py:48). 외부 URL(`http/https//mailto:#`)·`.md` 아님·파일 없음은 그대로 둔다. `#fragment` 는 분리해 보존 (build.py:46,49). 자동 크롤링/변환 없음.

### No-python path (manual)

python 이 없으면 (SKILL.md 의 "방법 B"):
1. `reader.html` 을 출력 경로로 복사
2. 복사본의 `<script type="text/markdown" id="book-md"> … </script>` **안쪽만** `.md` 원문으로 통째 교체 (바깥 CSS/JS 금지)
3. 본문에 `</script>` 가 있으면 `<\/script>` 로 손수 치환

결과물은 python 경로와 동일. (단 링크 재작성은 자동으로 안 됨 — 수동 경로의 알려진 차이)

---

## 3. Module map

| 파일 | 책임 | 핵심 마커/연결점 |
|---|---|---|
| `src/template.html` | HTML 골격: 콘텐츠 `<script>` 블록, 리더 셸(topbar/stage/botbar), 측정용 숨은 페이지(`#padMeasure`, line 107), 목차·설정 시트, hint 토스트 | `/*__STYLES__*/` (8), `//__APP__` (176), `id="book-md"` (17) |
| `src/styles.css` | 모든 리더 CSS: 테마 토큰 4종(`:root[data-theme=...]`), 페이지/넘김 레이어, 타이포, 라벨 칩 색, 시트·오버레이 | `--h` (auto 라벨 hue, line 180-182), `.lbl.*` (175-178) |
| `src/app.js` | 모든 리더 JS: 마크다운 파서, 페이지네이션, 네비게이션/넘김, 목차, 설정, 라벨 시스템, 영속화, 부팅 | 섹션 주석 1)~8) |
| `reader.html` | 위 3개 조립 산출물 (커밋됨). **직접 편집 금지** — 항상 src 고치고 재조립 | 두 마커가 이미 치환됨 |

### template.html 의 DOM 핵심

- 콘텐츠: `<script type="text/markdown" id="book-md">` (17) — `type` 이 비표준이라 브라우저가 렌더 안 하고 원문 보존.
- 무대 레이어 3장: `.layer.below`(아래, z1) / `.layer.anim#animLayer`(넘김 중인 페이지, z2) / `.tap-zones`(클릭 영역). 각 레이어의 `.page-pad` (`#padBelow`/`#padAnim`) 가 실제 본문 컨테이너.
- `#padMeasure` (107): **실 무대와 같은 크기의 숨은 패드** — 페이지 높이 측정 전용. 이게 있어야 분할이 정확하다.
- 시트 2개: `#tocSheet`(좌측 드로어), `#setSheet`(하단 시트, 설정).

---

## 4. Markdown parser reference

파서는 `app.js` 의 두 함수. block-level `parseMarkdown` (app.js:81-149) + span-level `inline` (app.js:21-54). 손으로 짠 경량 파서이며 CommonMark 호환이 아니다.

### 4.1 지원 문법표

| 문법 | 처리 위치 | 산출 |
|---|---|---|
| `# … ######` (H1~H6) | parseMarkdown:96-102 | `<h1..6 id data-h>`; id 는 `slug()`(56-59) + 중복 시 `-2` (mkId, 84) |
| 코드펜스 ` ``` ` | parseMarkdown:90-94 | `<pre><code>`, 내부 `esc()` |
| `---+` 수평선 | parseMarkdown:104 | `<hr/>` |
| `> 인용` (연속) | parseMarkdown:106-111 | `<blockquote>` 안 줄마다 `<p>` |
| `\| 표 \|` (+ 구분행) | parseMarkdown:113-125 | `<div class=table-wrap><table>` |
| `- * 1.` 목록 (중첩·체크박스) | parseMarkdown:127-138 + renderList:62-79 | `<ul>/<ol>`, `[ ]/[x]` → `<li class=task><input disabled>` |
| 단락 | parseMarkdown:142-146 | 연속 비빈줄을 한 칸 띄어 join → `<p>` |
| `**bold**` | inline:42 | `<strong>` |
| `*italic*` | inline:43 | `<em>` (앞 문자 캡처로 `**` 오인 회피) |
| `~~del~~` | inline:44 | `<del>` |
| 인라인 `` `code` `` | inline:25-34 | `<code>` |
| `` `[단어]` `` 라벨 | inline:27-31 | `<span class=lbl …>` (6장) |
| `[txt](url "t")` 링크 | inline:46-51 | `<a>`; 외부 http/mailto// 는 `target=_blank` |
| `![alt](src "t")` 이미지 | inline:36-40 | `<img>` |

H4~H6 은 렌더는 되지만 **챕터 분할도 목차 등재도 안 됨** (5장).

### 4.2 Block grammar (parseMarkdown, line-oriented)

`md.replace(/\r/g,'').split('\n')` 후 `while(i<lines)` 루프. 각 줄을 우선순위대로 매칭하고 매칭 시 `continue`:
펜스 → 헤딩 → hr → 인용 → 표 → 목록 → 빈줄 → 단락.
단락 종료 조건(:143)이 다른 블록 시작 패턴(`#`,`>`,`` ``` ``,`|`,`-/*`,`\d.`,`---`)을 보고 멈춘다 — **새 블록 타입을 추가하면 이 단락 가드도 같이 갱신해야** 단락이 그걸 삼키지 않는다.
표는 `lines[i+1]` 이 구분행(`-` 포함)일 때만 표로 본다 (:113).

### 4.3 Inline grammar & the placeholder mechanism (핵심 함정)

`inline(text)` (app.js:21-54) 의 순서가 정확성의 전부다. **null-byte 자리표시자**(`String.fromCharCode(0)`, 즉 `\0`) 로 코드·이미지를 먼저 빼낸 뒤 마지막에 되꽂는다:

```
1. 코드/라벨 추출      `code` → codes[] 에 HTML, 자리표시자 \0{n}\0   (25-34)
2. 이미지 추출         ![](src) → codes[] 에 <img>, 자리표시자             (36-40)
3. esc(text)           전체 < > & 이스케이프                              (41)
4. **bold** *em* ~~del~~ 정규식                                          (42-44)
5. 링크 [txt](url)     esc 이후, 이미지(앞 ! 제외)                         (46-51)
6. 자리표시자 복원      \0{n}\0 → codes[i]                         (52)
```

왜 이 순서인가 — 어기면 깨지는 것:

- **이미지·코드는 `esc()` 보다 먼저 추출.** data-URI 의 `<`/`>` 나 코드 안 `<>` 가 `&lt;` 로 망가지지 않게 자리표시자로 격리. 추출된 HTML 은 이미 완성형이라 4·5단계 인라인 정규식도 안 닿는다.
- **링크는 `esc()` 이후 처리.** 그래서 링크 텍스트는 이미 이스케이프됨. (단 href/title 은 esc 안 거치고 직접 삽입 — :49-50)
- 자리표시자는 raw NUL 문자라 사용자 본문과 충돌 가능성이 사실상 0.
- `attr(s)` (app.js:19) = `esc()` + `"` → `&quot;` , 속성값 전용.

이미지 추출 정규식(:36)이 링크 정규식(:46)보다 먼저 돌고, 링크 정규식은 `(^|[^!])` 로 `!` 앞 패턴을 배제해 이미지를 다시 안 잡는다.

---

## 5. Pagination & TOC algorithm

### 5.1 소스 한 번 파싱 → 노드 배열

부팅 시 `rawMd`(app.js:168, `<\/script>` 원복) → `parseMarkdown` → `sourceHtml`(169) → 임시 div 에 넣어 `srcNodes` 배열(170-172). 이후 페이지네이션은 이 노드들을 자르기만 한다 (재파싱 없음).

### 5.2 paginate() (app.js:184-210)

측정 패드 `#padMeasure` 의 `clientHeight` = `maxH`. `srcNodes` 를 순회:

1. 노드가 `H1` 또는 `H2` 면 `isBreak` — 현재 페이지에 노드가 있으면 먼저 `flush()` (:197-198). **챕터 분할은 H1/H2 에서만.**
2. 노드를 현재 묶음에 push 하고 `#padMeasure` 에 렌더, `scrollHeight > maxH` 이고 묶음이 2개 이상이면 마지막 노드를 떼어 별도 페이지로 (:201-206) — **높이 초과 자동 분할**.
3. `flush()` 는 묶음의 `outerHTML` join 과 그 안 `H1~H3` heading 목록을 `pages[]` 에 적재 (:189-194).
4. 끝나면 각 heading id → page index 를 `headingPage{}` 에 기록 (:209).

`pages` = `[{html, headings:[{id,level,text}]}]`. 한 노드가 한 페이지보다 커도 분할 못 하므로(노드 단위) 거대한 단일 블록은 넘칠 수 있다 — 알려진 한계.

### 5.3 TOC (buildToc, app.js:419-429)

`srcNodes` 중 `H1~H3` 만 버튼으로 (:421). `lv1/lv2/lv3` 클래스로 들여쓰기, 우측에 페이지번호(`headingPage`). 클릭 → `jumpTo(id)` (:430-441). **H4~H6 은 목차에 안 뜸.**
현재 위치 강조는 `updateChrome` (:240-242) 이 `headingPage[id]===current` 로 토글.

### 5.4 Windowed mounting

전체 페이지를 DOM 에 깔지 않는다. 동시에 마운트되는 `.page-pad` 는 최대 몇 개뿐:

- 평시: `#padBelow` 에 현재 페이지만 (`renderBase`→`setHtml`, :220-225).
- 넘김 중: `prepareTurn` (:295-307) 이 `#padAnim`(떠나는/들어오는 페이지) + `#padBelow`(드러나는 페이지) 2장만 채움.
- 측정: `#padMeasure` 는 분할 계산 때만 잠깐.
- 예외 — **scroll 모드**: `renderBase` 가 `padBelow.innerHTML = sourceHtml` 로 **전 문서를 한 번에** 깔고(:223), 페이지 개념 대신 `stage` 스크롤 비율로 진행 표시 (`updateChromeScroll`, :246-257).

`reflow()` (:500-510) 는 설정 변경/리사이즈 시 현재 heading 을 anchor 로 기억하고 재페이지네이션 후 위치 복원.

---

## 6. Label system (3 tiers)

라벨은 `` `[단어]` `` (백틱+대괄호) 로 쓴다. inline 코드 처리(app.js:25-34) 안에서 `^\[(.+)\]$` 매칭으로 분기.

### 6.1 세 티어

| 티어 | 단어 | 클래스 | 색 출처 |
|---|---|---|---|
| ① 시맨틱 고정 | 사실/추정/의견/모름 | `LABELS` 매핑(app.js:7) → `.lbl.fact/guess/op/none` | CSS 변수 `--chip-*` (styles.css:16-19, 테마별 보정 44-58) |
| ② 예약 hue 공용어 | 중요/TODO/질문/참고/경고/팁 + 영문별칭 | `.lbl.auto` + `data-key` | `HUES{}` 고정 hue (app.js:9-12) |
| ③ 임의 단어 | 그 외 무엇이든 | `.lbl.auto` + `data-key` | 단어 해시 hue (`hue()`, app.js:14-17) |

①은 inline 에서 `LABELS[key]` 로 즉시 클래스 결정(:30). ②③은 둘 다 `.lbl.auto` 로 렌더되고 `usedLabels` Set 에 등록(:31) — 차이는 `hue()` 가 `HUES` 에 있으면 고정값, 없으면 해시를 주는 것뿐.

### 6.2 hue 배정

`hue(s)` (app.js:14-17): `HUES[s]` 있으면 그 값, 없으면 `h=(h*31+charCode)>>>0` 누적 후 `%360`. **결정적** — 같은 단어는 어느 문서/세션에서나 같은 색.
`.lbl.auto` CSS(styles.css:180-182)는 `--h` 커스텀 속성으로 `hsl()` 색을 만들고, gray/black 테마에서 명도를 올린다.

### 6.3 색 주입 (applyLabelStyle, app.js:463-472)

`usedLabels` 의 각 키에 대해 `.lbl.auto[data-key="…"]{--h:…}` 규칙을 만들어 `<style id=labelStyle>` 에 통째로 주입. hue 값은 `labelHue(k)` (:462) = 사용자 오버라이드(`settings.labelHues[k]`) 있으면 그것, 없으면 `hue(k)`.

### 6.4 In-reader 편집 흐름

설정 시트 "라벨 색" 행:

- `buildLabelControls` (app.js:476-485): `usedLabels` 를 정렬해 칩 그리드로. 라벨 없으면 행을 hidden (:479).
- 칩 탭 → `openLabelEditor(k)` (:486-493): `editKey` 설정, 슬라이더(`#labEditRange`)에 현재 hue, 인라인 에디터 표시.
- 슬라이더 input → `settings.labelHues[editKey]=값`, `applyLabelStyle()`, `save` (app.js:532-535) — **라이브** 반영.
- 리셋 `↺` → `delete settings.labelHues[k]` 로 자동 hue 복귀 (:536-540).

`settings.labelHues` 는 **단어 키 기준 전역**(문서 무관) 이고 localStorage `br-settings` 에만 산다 — **HTML 에 절대 안 구워진다**. ①시맨틱 라벨은 편집 대상이 아님(`.lbl.auto` 만 `usedLabels` 에 들어감).

---

## 7. Settings & persistence

localStorage 키 (모두 `load`/`save`, app.js:161-162):

| 키 | 내용 | 쓰는 곳 |
|---|---|---|
| `br-settings` | `{theme, flip, size, lead, font, labelHues}` | `applySettings`(458), 라벨 편집(534,539) |
| `br-pos:<docTitle>` | 현재 페이지 index (문서 제목별) | `updateChrome`(243), `boot` 복원(563) |
| `br-hinted` | 첫 진입 힌트 노출 여부 | `boot`(567-571) |

기본값 `DEFAULTS` (app.js:156): theme=paper, flip=flip3d, size=18, lead=1.9, font=sans. `labelHues` 는 없으면 `{}` 로 초기화(:158).
`applySettings` (446-459) 가 테마를 `documentElement.dataset.theme`, 크기/줄간격/폰트를 CSS 변수(`--reader-size/-leading/-font`)로 반영하고 세그먼트 버튼 `on` 클래스 토글, 마지막에 `save`.
size 범위는 14~28 (app.js:520-521).

---

## 8. Extension cookbook

각 레시피는 `src/` 를 고친 뒤 **반드시 `python build.py --build-template` 로 `reader.html` 재조립** 으로 끝난다. (서브모듈이라 이후 2단계 push — CLAUDE.md 참조)

### 8.1 새 인라인 문법 추가 (예: `==highlight==`)

위치: `inline()` (app.js:21-54). esc 의존성에 따라 자리를 고른다:

1. 마크업이 `< >` 를 포함/보존해야 하면 **esc 전**(코드·이미지처럼 자리표시자 추출), 아니면 **esc 후**(bold/em 영역, :42-44 부근)에 `text = text.replace(...)` 한 줄 추가.
2. 정규식이 기존 `*`/`` ` ``/`[` 와 겹치지 않게. (italic 처럼 앞 문자 캡처가 필요할 수 있음)
3. styles.css 의 `.page-pad` 섹션(131~)에 새 태그 스타일 추가.

`==x==` 예: esc 후 `text=text.replace(/==([^=]+)==/g,'<mark>$1</mark>');` + CSS `.page-pad mark{...}`.

### 8.2 새 블록 요소 추가 (예: ` ::: callout `)

위치: `parseMarkdown` while 루프 (app.js:86-147). 두 곳을 같이 손대야 한다:

1. 적절한 우선순위 위치에 매칭 분기 추가(펜스처럼 여러 줄을 모으려면 내부 `while` 로 `i` 전진 후 `continue`).
2. **단락 가드(:143)의 부정 lookahead 패턴에 새 시작 토큰을 추가** — 안 하면 단락이 그 블록을 삼킨다.
3. heading 처럼 챕터/목차에 끼우려면 `H1~H3` 검사(paginate:191, buildToc:421)도 갱신. 보통은 불필요.
4. styles.css `.page-pad` 섹션에 스타일.

### 8.3 새 예약 라벨 hue 추가 (예: `[데모]` 고정색)

위치: `HUES` 객체 (app.js:9-12). 한 줄 추가: `'데모':120, 'DEMO':120,` (한/영 별칭은 같은 값). 끝. 렌더·편집·영속화는 자동으로 기존 `.lbl.auto` 경로를 탄다. CSS 변경 불필요(hsl 자동).

### 8.4 페이지를 끊는 기준 변경 (예: H3 에서도 분할)

위치: `paginate()` 의 `isBreak` (app.js:197).
`const isBreak = node.tagName==='H1' || node.tagName==='H2';`
→ `… || node.tagName==='H3'` 추가.
부수효과: 챕터 메타(`updateChrome` :234-237 의 `h.level<=2`)와 목차 등재 범위(`H1~H3`, buildToc:421 / paginate:191)는 별개라 필요하면 따로 맞춘다. "목차에 H4 도" 라면 `/^H[1-3]$/` 정규식들(:191, :421)을 `/^H[1-4]$/` 로.

### 8.5 새 테마 추가

styles.css 에 `:root[data-theme="<name>"]{ --bg … }` 블록(24-59 형식) 추가 + 라벨 색 보정이 필요하면 `--chip-*` 도. template.html 설정 시트에 `<div class="swatch sw-<name>" data-theme="<name>">가</div>` (template.html:127-130) 추가하고 styles.css `.sw-<name>` (264-267) 미리보기 색 추가. JS 변경 불필요(`data-theme` 토글만).

---

## 부록 — 알려진 한계 / 함정 요약

- 한 노드(예: 초거대 표/코드블록)가 한 페이지보다 크면 분할 불가 — 넘침.
- 마크다운 파서는 CommonMark 비호환(setext 헤딩, 참조 링크, 느슨한 리스트 등 미지원).
- no-python 수동 경로는 `.md→.html` 링크 재작성을 자동으로 못 함.
- `reader.html` 직접 편집 금지 — 항상 `src/` → `--build-template`.
- 본문 리터럴 `</script>` 는 빌드 시 이스케이프(build.py:91)되고 런타임 원복(app.js:168)된다 — 둘 중 하나만 바꾸면 깨진다.

---

## 9. Interactive features (코드 복사 / 이미지 줌 / 체크박스)

런타임 콘텐츠 인터랙션 3종. 모두 **`.page-pad` 에 위임된 핸들러**로 동작하고, 핸들러는 `stopPropagation()` 으로 stage 의 페이지 넘김 클릭(app.js stage `click` 리스너)을 막는다. 위임 등록은 `bindContent(pad)` 한 함수에서 `padBelow`/`padAnim` 양쪽에 1회씩 — windowed mounting 으로 패드 내부 DOM 이 교체돼도 리스너는 패드 자체에 붙어 있어 유지된다.

### 9.1 코드 복사 버튼

- **파싱**: `parseMarkdown` 코드펜스 분기가 `<pre><code>` 를 `<div class="codeblock"><button class="copy-btn">복사</button><pre><code>…</pre></div>` 로 감싼다.
- **동작**: `bindContent` 의 `click` 위임이 `.copy-btn` 을 잡아 형제 `<pre>` 의 `textContent` 를 `copyText()` 로 복사. `navigator.clipboard.writeText` 우선, 실패/부재 시 `document.execCommand('copy')` 폴백(`file://` 대비). 성공 시 라벨을 잠시 「복사됨」으로 바꿨다 복원.
- **CSS**: `.page-pad .codeblock{position:relative}` + `.copy-btn{position:absolute;top/right}`.

### 9.2 이미지 라이트박스

- **동작**: `click` 위임이 콘텐츠 `<img>` 를 잡아 `openLightbox(src,alt)`. 오버레이는 `ensureLightbox()` 가 만드는 **재사용 단일 `.lightbox` 요소**(body 직속). 탭(오버레이 click) 또는 Escape(전역 keydown → `closeLightbox`)로 닫힘. data-URI 이미지도 `img.src` 그대로 쓰므로 동작.
- **CSS**: 이미지 `cursor:zoom-in`, `.lightbox`/그 안 이미지 `cursor:zoom-out`, 배경은 `--overlay`.

### 9.3 영속 체크박스

- **파싱**: 모듈 레벨 `taskIdx` 카운터를 `parseMarkdown` 시작에서 0 으로 리셋, `renderList` 의 task 항목마다 `data-task-idx="N"` 부여(이제 `disabled` 아님).
- **영속 키**: `STORE_TASKS = 'br-tasks:' + docTitle` (기존 `br-pos`/`br-settings` 명명 규약), 값은 `{idx: bool}` 맵. 마크다운의 `[x]` 가 기본값이고 저장값이 있으면 그것이 우선.
- **저장**: `bindContent` 의 `change` 위임이 토글을 잡아 `taskState[idx]=checked` + `save(STORE_TASKS,…)`. `click` 위임도 체크박스를 잡아 `stopPropagation` 만(넘김 차단, 토글 자체는 네이티브 + change).
- **remount 재적용(핵심)**: `applyTasks(pad)` 가 패드의 모든 `input[data-task-idx]` 에 저장 상태를 다시 입힌다. **매 마운트마다** 호출되도록 `setHtml`(페이지 모드)과 `renderBase`(scroll 모드)에 훅. 부팅 시 1회가 아니라 페이지가 마운트될 때마다 적용되는 게 windowed mounting 대응의 요점.

---

## 10. Performance notes

핫패스 위주의 성능·정리 변경 요약(동작 보존, `sourceHtml` 불변). 새 의존성 없음.

- **`paginate()` 증분 DOM**: 측정 패드 갱신을 노드 묶음 전체의 문자열 재직렬화 대신 `appendChild` 누적으로 처리한다 — 노드당 재직렬화 없는 O(n) `appendChild`. 묶음이 길어질수록 이득.
- **`inline()` 정규식 호이스팅**: 코드·이미지·bold/em/del·링크·자리표시자 복원 정규식은 매 호출 재컴파일되던 리터럴을 **모듈 스코프 상수로 끌어올렸다**. 줄 수가 많은 문서에서 `inline()` 호출당 컴파일 비용 제거.
- **NUL 자리표시자 단일 출처(`NUL`/`PH`/`RE_PH`)**: 널바이트 자리표시자를 `NUL`(문자)·`PH`(생성)·`RE_PH`(복원 정규식) **한 곳에서만 정의**해 추출·복원이 어긋날 여지를 없앴다. 이전엔 추출 쪽 리터럴(`'\0'`)과 복원 정규식이 따로 박혀 있었다.
- **scroll 모드 현재 헤딩 = IntersectionObserver**: scroll 모드의 활성 헤딩 판정을 스크롤마다 전 헤딩 `offsetTop` 을 재는 방식에서 **`IntersectionObserver`** 로 바꿨다 — per-scroll 레이아웃 측정 제거.
- **넘김 애니메이션 리셋 = `endTurn()`**: 넘김 종료 시 레이어 transform/transition·z-index 등 상태 복원을 **`endTurn()` 한 곳으로 모았다**(중복 리셋 경로 제거, 정합성 보장).
- **트윈 워치독 정리**: 넘김 트윈의 안전망 타이머(watchdog)를 트윈 정상 종료 시 **반드시 `clearTimeout`** 한다 — 누수·중복 콜백 방지.
- **문서별 localStorage 키 = `docKey()`**: `br-pos`/`br-tasks` 의 `:<docTitle>` 접미사 조합을 인라인 문자열 연결 대신 **`docKey()` 한 함수**로 단일화(키 명명 규약 일원화). (충돌 동작 자체는 GOTCHAS B 참조 — H1 같으면 여전히 공유)
