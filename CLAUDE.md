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
