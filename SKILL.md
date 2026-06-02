---
name: md2ebook
description: Converts a Markdown document into a self-contained, offline book-reader HTML page — paginated like an e-book with page-flip/slide/fade/scroll modes, 4 themes (paper/sepia/gray/black), a table of contents, font/size/spacing controls, and 사실/추정/의견/모름 evidence-label chips. Use when the user wants to read or present a .md file as a book/e-book, turn Markdown into a shareable offline reading page, or asks for a 책 리더 / md 이북 / 마크다운 뷰어 / 문서를 책처럼. Conversion runs via build.py with no manual HTML editing.
---

# md2ebook — 마크다운을 책처럼

`.md` 한 편을 **오프라인 단일 HTML 책 리더**로 변환한다. 외부 라이브러리도, CDN도, 빌드 도구도 필요 없다 — 폰에서도 파일 하나만 열면 끝. 내용과 디자인이 분리돼 있어 내용만 갈아끼우면 된다.

## 변환 (둘 중 환경에 맞는 쪽)

둘 다 `reader.html` 의 마크다운 블록만 입력 `.md` 로 바꿔 완성본 HTML 을 만든다. 결과물은 동일하다.

**A. python 있으면 — 스크립트 한 줄 (빠름, 권장)**
```
python build.py <문서.md> [출력.html]
```
출력 경로를 생략하면 `<문서>.html` 로 저장된다. HTML 을 직접 만들거나 손대지 않으니 토큰도 안 든다.

**B. python 없으면 — 마크다운 블록만 교체 (스킬 호출 시 기본 경로)**
1. `reader.html` 을 출력 경로로 복사한다.
2. 복사본의 `<script type="text/markdown" id="book-md"> … </script>` 블록 **안쪽 내용만** 입력 `.md` 원문으로 통째 갈아끼운다 (바깥의 CSS/JS 는 건드리지 않는다).
3. 본문에 `</script>` 가 그대로 들어 있으면 `<\/script>` 로 바꿔 넣는다 (reader 가 읽을 때 알아서 원래대로 되돌린다).

스킬이 호출되면 AI 는 먼저 A 를 시도하고, python 이 없을 때 B 로 처리한다. 사람이 직접 할 때도 방법은 B 와 같다.

## 리더 기능 (런타임, reader.html 내장)

- **페이지네이션**: `H2` 마다 새 챕터, 화면 높이 넘치면 자동 분할 → 화면당 한 페이지.
- **넘김 4종**(우상단 `Aa` 설정에서 전환·비교): 3D 넘김 · 슬라이드 · 페이드 · 스크롤.
- 데스크탑: 좌우 탭·키보드(←/→), **본문 선택·복사 그대로 유지**. 모바일: 가로 스와이프로 넘김.
- **테마 4종**(paper / sepia / gray / black) · 글자크기 · 줄간격 · 고딕/명조.
- 목차 드로어(현재 위치 강조 · 클릭 이동) · 진행바 · 가운데 탭 몰입모드 · 위치·설정 localStorage 저장.
- **라벨 칩**: 백틱으로 감싼 `` `[단어]` `` 를 색칩으로 표시.
  - 근거 라벨 `[사실]` `[추정]` `[의견]` `[모름]` → 고정 시맨틱 색 (writing-templates 규약과 연결).
  - 자주 쓰는 `[중요]` `[TODO]` `[질문]` `[참고]` `[경고]` `[팁]` (영문 별칭 가능) → 고정 색.
  - 그 밖의 **아무 단어**나 라벨이 됨 → 단어 해시로 색 자동 배정 (같은 단어=어디서나 같은 색).

## 입력 마크다운 규약

지원: `# ## ###` 헤딩, `**굵게**`, `*기울임*`, 인라인 코드, 코드펜스, `> 인용`, `| 표 |`, `- 목록`, `---`, 그리고 `[사실]` `[중요]` 식 라벨 칩(아무 단어나 가능 — 위 "라벨 칩" 참조).

## 안티패턴

- 변환한다고 HTML(CSS/JS)을 새로 짜지 말 것 — `build.py` 를 돌리거나, python 이 없으면 마크다운 블록만 교체한다(위 B).
- 내용을 갈아끼울 때 `reader.html` 의 마크다운 블록 바깥(CSS/JS)까지 손대지 말 것.
- 한 줄이면 끝날 메모를 굳이 책 리더로 만들지 말 것 — 길고 구조 있는 문서에 쓴다.
