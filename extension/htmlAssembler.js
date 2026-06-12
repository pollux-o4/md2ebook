const path = require('path');

/**
 * 마크다운 문서 내의 상대 이미지 경로들을 변환 콜백을 통해 치환합니다.
 * 
 * @param {string} markdownText - 마크다운 원본 내용
 * @param {Function} pathResolver - 상대 경로를 적절한 URI로 치환하는 동기 콜백 함수: (relativePath) => string
 * @returns {string} 경로가 치환된 마크다운 내용
 */
function transformPaths(markdownText, pathResolver) {
    const imgRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
    return markdownText.replace(imgRegex, (match, alt, src, title) => {
        // 웹 주소(http/https), data URI 등이 아닌 경우에만 경로를 치환
        if (!/^(https?:|\/\/|data:)/i.test(src)) {
            try {
                const resolved = pathResolver(src);
                const titleAttr = title ? ` "${title}"` : '';
                return `![${alt}](${resolved}${titleAttr})`;
            } catch (e) {
                console.error('이미지 경로 변환 실패:', src, e);
            }
        }
        return match;
    });
}

/**
 * 마크다운 문서와 설정을 템플릿과 결합하여 최종 HTML을 완성합니다.
 * 
 * @param {Object} params
 * @param {string} params.templateHtml  - reader.html 파일의 원본 텍스트 내용
 * @param {string} params.markdownText  - 프리뷰할 마크다운 원본 내용
 * @param {Object} params.config        - 테마, 글꼴 등의 사용자 설정 객체
 * @param {Function} params.pathResolver - 상대 경로를 적절한 URI로 치환하는 동기 콜백 함수: (relativePath) => string
 * @returns {string} 완성된 HTML 문자열
 */
/** 마크다운에 mermaid 코드펜스(```mermaid)가 있는지 검사 */
function hasMermaid(markdownText) {
    return /^`{3,}\s*mermaid\b/im.test(markdownText);
}

function assemble({ templateHtml, markdownText, config, pathResolver, mermaidJs }) {
    // 1. 이미지 및 리소스 상대 경로 치환
    const processedMarkdown = transformPaths(markdownText, pathResolver);

    // 2. </script> 탈출 처리 및 주입 (특수문자 $ 기호 오작동 방지 위해 콜백 함수 사용)
    const safeMarkdown = processedMarkdown.replace(/<\/script>/g, '<\\/script>');

    let result = templateHtml.replace(
        /<script type="text\/markdown" id="book-md">([\s\S]*?)<\/script>/,
        () => `<script type="text/markdown" id="book-md">${safeMarkdown}</script>`
    );

    // 3. 설정(Config) 및 환경 정보 주입
    const configScript = `
        <script>
            window.VSCODE_CONFIG = ${JSON.stringify(config)};
            window.IS_VSCODE_ENV = true;
        </script>
    `;

    // 4. mermaid 다이어그램이 있을 때만 엔진 인라인 주입 (없는 문서는 그대로 가벼움).
    //    replace 콜백으로 넣어 $ 특수치환 시퀀스 오작동 방지.
    let head = configScript;
    if (mermaidJs && hasMermaid(markdownText)) {
        // 인라인 스크립트 조기 종료 방지: 본문 내 </script> 시퀀스 무력화
        const safeJs = mermaidJs.replace(/<\/script/gi, '<\\/script');
        const tag = `<script>${safeJs}</script>`;
        head += tag;
    }
    return result.replace('</head>', () => `${head}</head>`);
}

module.exports = { assemble, transformPaths, hasMermaid };
