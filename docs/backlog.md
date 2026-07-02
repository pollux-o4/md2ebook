# md2ebook 백로그

## 리팩토링 (라이브 편집 기능 완료 후)

라이브 편집 기능 main squash merge 이후 별도 작업으로 진행.

### 목표
- 한 곳 수정 시 여러 곳 연동 수정이 필요한 구조 개선
- 하드코딩/비동적 할당 부분 정리
- 전체 유지보수성 향상

### 사용 스킬
- `/improve-codebase-architecture` — 아키텍처 개선 기회 탐색
- `/simplify` — 중복·복잡도 제거
- (기타 리팩토링 관련 스킬 포함)

### 브랜치 전략
- 라이브 편집과 동일하게 middle-merge 브랜치 + 서브 PR 패턴 사용
- main squash 전 사용자 검증 필수

### 참고
- `C:\Users\orix4\Documents\my_skills\md-ebook` 기준
- 회귀 테스트(feat/live-edit/regression-tests에서 작성)가 먼저 main에 들어와 있어야 리팩토링 안전망 확보됨
