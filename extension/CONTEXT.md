# CONTEXT: md2ebook (Markdown eBook Reader)

이 문서는 `markdown-ebook-reader` VS Code 익스텐션 개발 및 아키텍처 개선 작업에 대한 컨텍스트와 다음 에이전트 세션을 위한 인계 사항을 담고 있습니다.

---

## 1. 작업 배경 (Why)
사용자가 마크다운 에디터에서 문서 작성 중, 별도의 파일 생성 없이 메모리(WebView) 상에서 기존 `md2ebook` 오리지널 템플릿 디자인과 100% 일치하는 프리뷰 환경을 제공하기 위해 VS Code 로컬 익스텐션 개발을 진행하였습니다.
이 과정에서 VS Code 자체 테마 CSS가 웹뷰 내부의 요소(코드 블록, 진행 표시줄, 인용문 등)들을 침범하여 스타일이 깨지고 가독성이 저하되는 문제가 식별되었습니다. 또한, 비동기 체크박스 토글 시 마크다운 파싱 규칙 불일치 및 갱신 꼬임 위험이 확인되어 이를 근본적으로 해결하기 위한 아키텍처 개선 작업을 수행했습니다.

---

## 2. 주요 수행 작업 (What)

### ① 시각적 스타일 격리 및 보정 완료
* **인용문(`blockquote`) 가독성 패치**: VS Code 글로벌 다크/라이트 테마가 웹뷰의 인용구 배경색을 덮어써 글자가 거의 안 보이고 어두워지는 현상이 있었습니다. 이를 `background: transparent !important;` 및 `color: var(--ink-soft) !important;` 속성을 주입하여 완치하였습니다.
* **진행 바 및 레이아웃 격리**: 가로 스크롤바가 하단 컨트롤바를 덮거나 글자색이 오염되는 문제를 리셋 마진 기법으로 스타일 시트 상에서 완전 격리 보존했습니다.

### ② 아키텍처 개선 및 모듈성 깊이 확보
* **`HtmlAssembler` 모듈 분리**: `extension.js`와 오프라인 렌더링 도구인 `make_test.js`에 산재되어 있던 경로 변환 및 템플릿 변수 조립 로직을 하나의 깊은 모듈([htmlAssembler.js](file:///C:/Users/orix4/.agents/my_skills/md2ebook/htmlAssembler.js))로 추상화했습니다. 
* **`CheckboxEditor` 상태 스캐너 도입**: 이전의 단순 정규식 치환 방식(`/- \[[ xX]\]/g`)은 코드 블록 내부의 `- [ ]` 문장 등을 체크박스로 잘못 인식하여 인덱스 불일치 버그를 냈습니다. 이를 해결하기 위해 실제 이북 렌더러의 라인 스캐너 로직을 모방한 경량 상태 머신형 편집기([checkboxEditor.js](file:///C:/Users/orix4/.agents/my_skills/md2ebook/checkboxEditor.js))를 구현하여 코드 블록 내부의 체크박스를 완전히 건너뛰도록 만들었습니다.
* **경쟁 상태(Race Condition) 해소**: 사용자가 프리뷰 화면에서 체크박스를 연타할 시 파일 입출력 트랜잭션이 꼬이는 현상을 방지하고자 `Promise Queue`(`editQueue`)를 이벤트 핸들러 단에 배치해 동기화 작업을 순차화했습니다.

---

## 3. 폴더 구조 및 역할 정의 ([my_skills/md2ebook](file:///C:/Users/orix4/.agents/my_skills/md2ebook/))
* **[extension.js](file:///C:/Users/orix4/.agents/my_skills/md2ebook/extension.js)**: VS Code 생명주기 및 웹뷰 패널 인스턴스 조율, 실시간 변경 스트림 구독, 파일 저장 트랜잭션 핸들러.
* **[htmlAssembler.js](file:///C:/Users/orix4/.agents/my_skills/md2ebook/htmlAssembler.js)**: 마크다운 상대 이미지 경로 치환 및 테마 설정값을 웹뷰 템플릿에 안전하게 변형 주입하는 비즈니스 로직 모듈.
* **[checkboxEditor.js](file:///C:/Users/orix4/.agents/my_skills/md2ebook/checkboxEditor.js)**: 렌더러와 동일한 방식으로 실제 노출 체크박스만 찾아 오프셋 안전하게 토글하는 순수 JS 마크다운 에디팅 유틸리티.
* **[reader.html](file:///C:/Users/orix4/.agents/my_skills/md2ebook/reader.html)**: CSS/JS가 독립적으로 내장된 고성능 종이 질감의 이북 프리뷰 뷰어 템플릿 파일.
* **[make_test.js](file:///C:/Users/orix4/.agents/my_skills/md2ebook/make_test.js) & [verify_render.js](file:///C:/Users/orix4/.agents/my_skills/md2ebook/verify_render.js)**: Playwright와 로컬 크롬을 연동해 가상 E2E UI 프리뷰를 오프라인 상에서 즉시 캡처하고 검증하는 로컬 테스트 스위트.

---

## 4. 다음 에이전트를 위한 제언 및 계획 (Next Steps)
1. **설정 영속화 레이어 격리 (ConfigStore)**: 향후 로컬 `globalState` 외에 사용자 프로젝트 수준의 `.vscode/settings.json` 설정 파일과 이북 설정을 양방향 바인딩해야 할 경우, `ConfigStore` 인터페이스를 별도로 구축하여 concrete 어댑터를 분기하는 아키텍처 개선을 이어갈 수 있습니다.
2. **테스트 커버리지 보강**: `checkboxEditor`의 상태 스캐너 유닛 테스트를 추가하여, 예외적인 마크다운 마크업(예: 중첩 목록, 코드펜스 미종료 등)에 대한 텍스트 처리 신뢰도를 강화하는 것을 권장합니다.
3. **스킬 연동**: `my_skills/md2ebook` 폴더의 완성본 코드를 타 에이전트들이 마크다운 이북 변환 스킬 요청 시 지렛대로 삼을 수 있도록 안내할 수 있습니다.
