# md2ebook — 작업 지침

## 서브모듈 2단계 push

`md-ebook/` 은 `pollux-o4/md2ebook` 서브모듈이다. 수정 시 반드시 두 단계로 push한다.

1. 서브모듈 내부: `git commit && git push`
2. my_skills 루트: `git add md-ebook && git commit && git push`

## 릴리즈 절차

### 버전 정책 (SemVer)
- PATCH(x.x.N): 버그픽스만
- MINOR(x.N.0): 기능 추가
- MAJOR(N.0.0): 하위 호환 파괴

### extension 빌드 및 릴리즈
```bash
# 1. extension/package.json 의 version 수정
# 2. vsix 빌드
cd extension
npx @vscode/vsce package --no-dependencies

# 3. 커밋 + 태그 + push
git add extension/package.json
git commit -m "chore: bump extension to vX.Y.Z"
git tag vX.Y.Z
git push origin main && git push origin vX.Y.Z

# 4. GitHub 릴리즈 생성 (vsix 첨부)
gh release create vX.Y.Z extension/markdown-ebook-reader-X.Y.Z.vsix \
  --title "vX.Y.Z" --notes "..."
```

### 주의사항
- `extension/*.vsix` 는 `.gitignore` 에 포함 — git 추적 대상 아님, GitHub Release asset 으로만 배포
- VS Code Marketplace 게시자: `pollux-o4` (marketplace.visualstudio.com/manage/publishers/pollux-o4)
- Marketplace 배포 시 `npx @vscode/vsce publish` + Azure DevOps PAT 필요

## 진행 중 작업 컨텍스트

컨텍스트 압축 후 재개 시 아래 파일을 반드시 먼저 읽는다:

- `extension/docs/context_live-edit.md` — 현재 상태·다음 할 일 (압축 후 여기서 시작)
- `extension/docs/live-edit-handoff.md` — 결정 이유·실패 이력 (왜 그렇게 됐는지)

## 수정·디버깅 원칙

1. **변경 전에 흐름을 먼저 파악한다.** "다른 곳에서 처리될 것"이라는 가정은 검증 전까지 하지 않는다.
2. **시작과 종료는 쌍이다.** 열었으면 닫고, 표시했으면 감추고, 등록했으면 해제한다. 타이머·GC 같은 자동 해제에만 의존하면 수명이 어긋날 때 깨진다.
3. **테스트 실패 시 assert보다 전제조건을 먼저 의심한다.** 조건이 영영 참이 안 된다면 assertion 구문이 아닌 그 상태를 만드는 호출 체인을 역추적한다.
