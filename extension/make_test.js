const fs = require('fs');
const path = require('path');
const { assemble } = require('./htmlAssembler');

const readerHtml = fs.readFileSync('reader.html', 'utf8');

const testMd = `# 테스팅 마크다운 문서
이북 리더가 브라우저에서 잘 렌더링되는지 확인하기 위한 테스트 파일입니다.

## 1. 헤딩과 서식
이 줄 위의 H2 제목이 새로운 챕터로 인식되는지 점검합니다.
**굵은 글씨**와 *기울임*, 그리고 \`인라인 코드\` 서식이 정상적으로 렌더링되는지 확인합니다.

\`\`\`javascript
const value = 42;
console.log('이북 리더 코드 블록 테스트:', value);
\`\`\`

[사실] 이것은 팩트 라벨 칩입니다.
[추정] 이것은 추정 라벨 칩입니다.

- 첫 번째 항목
- 두 번째 항목
  - 서브 항목 1
  - 서브 항목 2

---
마지막 문장입니다.`;

try {
    const finalHtml = assemble({
        templateHtml: readerHtml,
        markdownText: testMd,
        config: {
            theme: 'paper',
            fontSize: '18px',
            flip: 'flip3d',
            leading: '1.9',
            font: 'sans'
        },
        pathResolver: (src) => src // 테스트 빌드는 패스스루
    });
    fs.writeFileSync('test_render.html', finalHtml, 'utf8');
    console.log('test_render.html 생성 성공 (HtmlAssembler 적용)!');
} catch (e) {
    console.error('HTML 조립 실패:', e);
}
