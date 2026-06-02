# md2ebook

마크다운 한 편을 **오프라인 단일 HTML 책 리더**로 만들어 주는 [Agent Skill](https://github.com/vercel-labs/skills).
외부 라이브러리도, CDN도, 빌드 도구도 필요 없다 — 폰에서도 파일 하나만 열면 끝.

## 설치

```
npx skills add pollux-o4/md2ebook
```

`npx skills` 를 쓰는 에이전트(Claude Code · Codex · Gemini CLI 등)라면 어디든 설치된다.
설치 후 에이전트에게 `/md2ebook` 으로 부르면 `.md` 를 책 리더 HTML 로 변환해 준다.

## 직접 변환 (에이전트 없이)

python 이 있으면 한 줄:

```
python build.py <문서.md> [출력.html]
```

python 이 없으면 `reader.html` 을 복사한 뒤, 그 안의
`<script type="text/markdown" id="book-md"> … </script>` 블록 내용만 `.md` 원문으로 갈아끼우면 된다. (어느 쪽이든 결과물은 같다)

## 리더 기능

- **H2 단위 페이지네이션** + 화면 높이 초과 시 자동 분할
- **넘김 4종**(3D 넘김 / 슬라이드 / 페이드 / 스크롤) · **테마 4종**(paper/sepia/gray/black)
- 글자크기 · 줄간격 · 고딕/명조 · 목차 드로어 · 진행바 · 몰입모드 · 위치 저장(localStorage)
- 데스크탑 본문 선택·복사 유지 / 모바일 스와이프 넘김
- `[사실]` `[추정]` `[의견]` `[모름]` 근거 라벨 색칩

## 구성

| 파일 | 역할 |
|---|---|
| `SKILL.md` | 스킬 진입점 — 변환 절차·입력 규약 |
| `reader.html` | 책 리더 템플릿 겸 데모 |
| `build.py` | `python build.py <md> [out.html]` 변환기 |
| `test.md` | 예시 입력 |

리더 디자인은 [Claude Design](https://claude.ai/design) 핸드오프 번들을 채택했다.
