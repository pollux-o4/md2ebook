# md2ebook

**마크다운 한 편, 한 장의 책.**

쓰던 `.md` 를 외부 의존성 0의 **오프라인 단일 HTML 책 리더**로 바꿔 주는 [Agent Skill](https://github.com/vercel-labs/skills).
CDN도 번들러도 런타임도 없이 **파일 하나** — 폰에서도 그냥. 내용과 디자인이 분리돼, 글만 갈아끼우면 그대로 책.

> 소개: [`intro.html`](./intro.html) · 사용 가이드: [`demo/guide.html`](./demo/guide.html) · 라이브로 넘겨보기: [`README.html`](./README.html)

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

## 왜 쓰나

- **파일 하나로 끝나는 공유** — 메신저로 보내든 USB에 담든, 받는 사람은 더블클릭이면 바로 책. 설치·계정·네트워크 전부 불필요.
- **오프라인에서도 그대로** — CDN·웹폰트·외부 스크립트가 0. 비행기에서도 폐쇄망에서도 똑같이, 링크가 죽을 일도 없이.
- **진짜 책 같은 읽기** — 화면 단위 페이지네이션, 넘김 애니메이션, 목차·진행바·몰입모드. 긴 글도 끝까지.
- **내 글은 그대로** — 내용과 디자인의 분리. 다음 글도 마크다운만 갈아끼우면 같은 톤의 책.

## 리더 기능

- **책처럼 넘겨 읽기** — `H2` 마다 챕터, 화면 높이를 넘으면 자동 분할. 넘김 4종(3D 넘김 / 슬라이드 / 페이드 / 스크롤)을 취향대로.
- **눈이 편한 4가지 테마** — paper / sepia / gray / black. 글자크기 · 줄간격 · 고딕/명조까지 조절.
- **멈춘 자리를 기억** — 읽던 위치 · 설정 · 체크박스 상태를 localStorage 에 저장. 닫았다 열어도 그 자리에서.
- **긴 글도 길 잃지 않게** — 현재 위치를 짚어주는 목차 드로어 · 진행바 · 몰입모드.
- **본문이 살아있다** — 데스크탑 선택·복사 유지 / 모바일 스와이프 넘김. 코드블록 복사 버튼 · 이미지 탭 확대(라이트박스).
- **근거가 한눈에** — `[사실]` `[추정]` `[의견]` `[모름]` 라벨을 색칩으로. 아무 단어나 라벨이 되고, 같은 단어는 어디서나 같은 색.

## 구성

| 파일 | 역할 |
|---|---|
| `SKILL.md` | 스킬 진입점 — 변환 절차·입력 규약 |
| `intro.html` | 소개용 랜딩 페이지 (단일 HTML) |
| `reader.html` | 책 리더 템플릿 겸 데모 (아래 `src/` 조립 결과, 커밋됨) |
| `build.py` | `python build.py <md> [out.html]` 변환기 |
| `src/` | 리더 소스 모듈 — `template.html` · `styles.css` · `app.js` |
| `demo/` | 사용자용 데모 — md2ebook 사용 가이드 |

> **유지보수 메모.** 리더를 고칠 땐 `src/` 모듈을 수정하고 `python build.py --build-template` 로 `reader.html` 을 재조립한다. 최종 사용자는 이 단계가 필요 없다 — 조립본이 이미 커밋돼 있어 평소처럼 `reader.html` 만 쓰면 된다.

리더 디자인은 [Claude Design](https://claude.ai/design) 핸드오프 번들을 채택했다.
