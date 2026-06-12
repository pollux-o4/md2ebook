const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { assemble, transformPaths } = require('./htmlAssembler');
const { toggleCheckbox } = require('./checkboxEditor');

// 비동기 에디팅 경쟁 상태를 방지하기 위한 순차 작업 큐
let editQueue = Promise.resolve();

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let disposable = vscode.commands.registerCommand('markdown-ebook-reader.open', async (uri) => {
        // 1. 활성화된 텍스트 에디터 확인
        let activeEditor = vscode.window.activeTextEditor;
        let document = activeEditor ? activeEditor.document : null;

        if (uri) {
            document = await vscode.workspace.openTextDocument(uri);
        }

        if (!document || document.languageId !== 'markdown') {
            vscode.window.showErrorMessage('활성화된 마크다운(.md) 파일이 없습니다.');
            return;
        }

        const docDir = path.dirname(document.uri.fsPath);
        const docUriString = document.uri.toString();

        // 2. 웹뷰 패널 생성
        const panel = vscode.window.createWebviewPanel(
            'markdownEbookReader',
            `Ebook: ${path.basename(document.uri.fsPath)}`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(docDir), vscode.Uri.file(context.extensionPath)]
            }
        );

        // 3. 로컬 reader.html 템플릿 로드
        const templatePath = path.join(context.extensionPath, 'reader.html');
        let htmlTemplate = '';
        try {
            htmlTemplate = fs.readFileSync(templatePath, 'utf8');
        } catch (err) {
            vscode.window.showErrorMessage('reader.html 템플릿 파일을 찾을 수 없습니다.');
            return;
        }

        // 4. globalState에서 테마/읽기 설정 복구
        const savedConfig = context.globalState.get('ebook-reader-config', {
            theme: 'paper',
            fontSize: '18px',
            flip: 'flip3d',
            leading: '1.9',
            font: 'sans'
        });

        // 5. 경로 해석용 pathResolver 정의
        const pathResolver = (src) => {
            const absolutePath = path.resolve(docDir, src);
            return panel.webview.asWebviewUri(vscode.Uri.file(absolutePath)).toString();
        };

        // 6. HTML 생성 헬퍼 함수
        //    mermaid.min.js 는 문서에 mermaid 블록이 있을 때만 1회 읽어 캐시(없으면 안 읽음).
        let mermaidJs = null;
        function loadMermaid() {
            if (mermaidJs !== null) return mermaidJs;
            try {
                mermaidJs = fs.readFileSync(path.join(context.extensionPath, 'mermaid.min.js'), 'utf8');
            } catch (e) {
                mermaidJs = ''; // 번들이 없으면 빈 문자열 → 주입 스킵, 소스 폴백
            }
            return mermaidJs;
        }
        function generateHtml(docText) {
            const needMermaid = /^`{3,}\s*mermaid\b/im.test(docText);
            return assemble({
                templateHtml: htmlTemplate,
                markdownText: docText,
                config: savedConfig,
                pathResolver,
                mermaidJs: needMermaid ? loadMermaid() : null
            });
        }

        // 초기 HTML 로드
        panel.webview.html = generateHtml(document.getText());

        // 7. 실시간 문서 변경 이벤트 리스너 등록
        const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === docUriString) {
                // 문서 변경 시 웹뷰 프론트엔드로 변경된 마크다운 전달
                const updatedMd = transformPaths(e.document.getText(), pathResolver);
                panel.webview.postMessage({
                    command: 'updateContent',
                    markdown: updatedMd
                });
            }
        });

        // 8. 웹뷰 메시지 리시버 설정
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'saveConfig':
                    // 설정을 globalState에 동기화
                    await context.globalState.update('ebook-reader-config', message.config);
                    break;

                case 'openLink':
                    // 로컬 상대 경로 문서 링크 열기
                    try {
                        const targetPath = path.resolve(docDir, message.path);
                        if (fs.existsSync(targetPath)) {
                            const targetUri = vscode.Uri.file(targetPath);
                            const doc = await vscode.workspace.openTextDocument(targetUri);
                            await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                        } else {
                            vscode.window.showWarningMessage(`파일을 찾을 수 없습니다: ${message.path}`);
                        }
                    } catch (e) {
                        vscode.window.showErrorMessage(`링크 열기 실패: ${e.message}`);
                    }
                    break;

                case 'toggleTask':
                    // 체크박스 토글을 락 큐를 통해 순차적으로 안전하게 처리 (Race Condition 방지)
                    editQueue = editQueue.then(async () => {
                        try {
                            const { taskIdx, checked } = message;
                            const docText = document.getText();
                            const { success, updatedText } = toggleCheckbox(docText, taskIdx, checked);

                            if (success) {
                                const edit = new vscode.WorkspaceEdit();
                                const fullRange = new vscode.Range(
                                    document.positionAt(0),
                                    document.positionAt(docText.length)
                                );
                                edit.replace(document.uri, fullRange, updatedText);
                                await vscode.workspace.applyEdit(edit);
                                await document.save();
                            }
                        } catch (e) {
                            console.error('체크박스 상태 반영 실패:', e);
                        }
                    });
                    await editQueue;
                    break;
            }
        }, null, context.subscriptions);

        // 패널 소멸 시 이벤트 구독 취소
        panel.onDidDispose(() => {
            changeSubscription.dispose();
        }, null, context.subscriptions);
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
