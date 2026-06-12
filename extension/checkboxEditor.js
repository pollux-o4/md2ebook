/**
 * 마크다운 소스 텍스트에서 코드 블록 등을 건너뛰며 정확한 체크박스 위치를 찾아 상태를 수정합니다.
 * (웹뷰의 parseMarkdown 파서 상태와 100% 동일하게 동작하는 라인별 상태 스캔 엔진 탑재)
 * 
 * @param {string} markdownText - 마크다운 원본 텍스트
 * @param {number} taskIndex - 변경할 체크박스의 순차적 인덱스 (0부터 시작)
 * @param {boolean} checked - 새로운 체크 상태 (true: 'x', false: ' ')
 * @returns {Object} { success: boolean, updatedText: string }
 */
function toggleCheckbox(markdownText, taskIndex, checked) {
    // 윈도우 줄바꿈 개행문자 표준화 처리하되 결과 조립 시 복원
    const lines = markdownText.split(/\r?\n/);
    let inCodeBlock = false;
    let currentTaskIdx = 0;
    
    // 리스트 마커 뒤에 오는 체크박스 패턴 매칭
    // 예: " - [ ] 할 일" 또는 " 1. [x] 완료"
    const listTaskRegex = /^(\s*(?:[-*+]|\d+\.))\s+\[([ xX])\]/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 코드 블록 전환 감지
        if (/^```/.test(line)) {
            inCodeBlock = !inCodeBlock;
            continue;
        }

        // 코드 블록 내부의 체크박스 텍스트는 완전히 무시
        if (inCodeBlock) {
            continue;
        }

        const match = listTaskRegex.exec(line);
        if (match) {
            if (currentTaskIdx === taskIndex) {
                // 이 라인의 체크박스를 업데이트
                // match[1]은 리스트 마커(예: " -"), 그 바로 뒤에 " ["가 나옴
                const prefixLength = match[1].length;
                const markerStart = prefixLength + line.substring(prefixLength).indexOf('[');
                
                // 해당 라인의 [ ] 괄호 안 문자를 변경
                const charToSet = checked ? 'x' : ' ';
                const updatedLine = line.substring(0, markerStart + 1) + charToSet + line.substring(markerStart + 2);
                
                lines[i] = updatedLine;
                
                // 줄바꿈 보존하여 재조합
                const joinChar = markdownText.includes('\r\n') ? '\r\n' : '\n';
                return {
                    success: true,
                    updatedText: lines.join(joinChar)
                };
            }
            currentTaskIdx++;
        }
    }

    return {
        success: false,
        updatedText: markdownText
    };
}

module.exports = { toggleCheckbox };
