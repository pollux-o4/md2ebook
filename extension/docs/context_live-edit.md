# Context: Live Edit 현재 상태

> **목적**: 컨텍스트 압축 후 "지금 어디까지 왔나"를 빠르게 복원.
> 결정 이유·실패 이력은 `live-edit-handoff.md`, 반복 실패 교훈은 `lessons.md` 참조.
> **마지막 업데이트**: 2026-07-02 (세션 3, 후반)

---

## 현재 상태

- **브랜치**: `feat/live-edit` (main 미머지, push 안 함)
- **버전**: **1.2.2 고정** — 개발 중 bump 안 함. VS Code 설치본도 **1.2.2 하나만**(옛 1.2.3 orphan 제거 완료). 머지 시 일괄 bump.
- **커밋**: `f4c2cd6` 이후 변경분 다수 **미커밋**.
- **아키텍처**: 문단·제목·**리스트** = 인라인 스타일 줄(줄박스, 세로 이동 없음, Obsidian식). 표·코드펜스·인용·hr = 비커서 시 블록 위젯.
- **핵심 원칙**: 편집 줄 스타일은 **지어내지 말고 보기(`.page-pad`) 값을 단일 출처로 재사용.**

## 이번 세션 완료 (충실 sandbox 실측 + 대부분 실제 VS Code 검증)

1. **H2 클릭 오프셋**: `.cm-line-h2` marginBottom → paddingBottom .87em + gradient 밑줄. 클릭 오차 0.
2. **리스트 항목단위 편집**: 커서 항목만 raw, 나머지 렌더. CSS 원 불릿(`.cm-li-dot` filled/hollow 동일 지름), 체크박스(ghost+overlay, `[x]→[ ]` 정규화 정렬), 순서번호 원문 유지.
3. **세로 픽셀 불변 (wrap 점프 해소)**: 원인은 마커 폭이 아니라 **`Decoration.replace`가 삽입하는 `.cm-widgetBuffer`(18px img)가 line box 높이 부풀림**. 수정: `.cm-line .cm-widgetBuffer { display:none }`. 긴 h2/문단/라벨줄 렌더=커서 높이 동일 확인.
4. **네이티브 인라인 정합** (지어낸 값 폐기, 보기 값 재사용):
   - 라벨: 전역 `.lbl` 클래스 재사용 → 의미색(fact/guess/op/none) + `.74em` + auto는 `data-key`+`hue()`. 커스텀 색은 reader `#labelStyle`이 `data-key`로 매칭(인라인 `--h` 제거).
   - 인라인 코드: `Decoration.mark({tagName:'code'})`로 실제 `<code>` → 보기 `.page-pad code` 직접 적용.
   - bold 600(브라우저 기본 700→교정), 폰트 sans(`--font-sans`).
5. **라벨 색 UI 스크롤 모드 노출**: `updateContent` 핸들러 스크롤 분기가 `reflow()` 건너뛰어 `buildLabelControls()` 미호출 → `applyLabelStyle()+buildLabelControls()` 추가(reader.html). (auto 태그 있을 때만 UI 뜸 — 의미 고정색은 원래 안 뜸.)
6. **Tab/Shift-Tab 리스트 들여쓰기**: `listIndentKeymap`(리스트 줄만 가로챔, 2칸 단위=depth). sandbox 검증 완료(불릿·순서 Tab→중첩 d1, Shift-Tab→d0, 문단 Tab 무효). **실제 VS Code 사용자 확인 대기.**
7. **인프라**: webview 캐시버스터(`extension.js` 번들 URI `?v=<mtime>`), sandbox 충실화(`loadReaderStyles()`가 reader `<style>` 주입 + `.page-pad` 마운트, 폰트 sans), 버전 orphan 정리.

## 잔여 작업

- [ ] Tab 들여쓰기 실제 VS Code 확인 (사용자)
- [ ] **범위 밖(별도)**: 표/코드펜스/인용 블록 위젯 클릭 시 세로 점프(다줄 구조라 난이도 높음)
- [ ] feat/live-edit 커밋 → main squash merge (**사용자 허락 필수**), 그때 버전 bump + 릴리즈

## 검증 환경 (이중 필수 — `lessons.md`)

```bash
cd extension && python -m http.server 3939
# → http://localhost:3939/test/cm6-sandbox.html  (?cb 자동 최신 번들)
# 실제 VS Code 반영: npx @vscode/vsce package --no-dependencies && code --install-extension markdown-ebook-reader-1.2.2.vsix --force → Reload Window
```
- **충실 sandbox(Playwright 실측) + 실제 VS Code(computer-use)** 이중. sandbox만 믿지 말 것.

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `extension/cm6-src.js` | CM6 소스. theme + buildInlineDecos/buildListDecos/buildBlockDecorations + listIndentKeymap(Tab) |
| `extension/reader.html` | webview. `<style>`(보기 CSS 단일 출처, `.page-pad`/`.lbl`/`hue()`/`#labelStyle`), `mountCM6()`, `updateContent` 핸들러 |
| `extension/extension.js` | webview HTML 조립, 번들 URI 캐시버스터 |
| `extension/test/cm6-sandbox.html` | 충실 sandbox(reader `<style>` 주입, `.page-pad` 마운트) |
| `extension/docs/live-edit-handoff.md` / `lessons.md` | 결정·실패 이력 / 일반 교훈 |
