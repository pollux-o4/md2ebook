const { chromium } = require('playwright-core');
const path = require('path');

async function run() {
    console.log('Playwright-core 검증 시작...');
    
    // 로컬 시스템 크롬 브라우저 경로 지정
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const htmlPath = 'file:///' + path.resolve(__dirname, 'test_render.html').replace(/\\/g, '/');
    const screenshotPath = path.resolve(__dirname, 'test_render.png');

    console.log('브라우저 경로:', chromePath);
    console.log('대상 HTML:', htmlPath);
    console.log('저장할 스크린샷 경로:', screenshotPath);

    let browser;
    try {
        browser = await chromium.launch({
            executablePath: chromePath,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });

        const context = await browser.newContext({
            viewport: { width: 1024, height: 768 }
        });

        const page = await context.newPage();

        // 브라우저 내부 콘솔 메시지 수집
        page.on('console', msg => {
            console.log(`[Browser Console] ${msg.type().toUpperCase()}: ${msg.text()}`);
        });

        // 브라우저 내부 에러 수집
        page.on('pageerror', err => {
            console.error(`[Browser PageError] ${err.toString()}`);
        });

        // HTML 로드
        await page.goto(htmlPath, { waitUntil: 'load' });
        console.log('HTML 로드 완료. 레이아웃 연산 대기...');

        // 이북 리더 페이지네이션 연산 완료를 위해 2초 대기
        await page.waitForTimeout(2000);

        // 다음 페이지(2페이지)로 이동하여 코드 블록 및 라벨 칩 검증
        console.log('2페이지로 이동 시도...');
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(1000);

        // 스크린샷 저장
        await page.screenshot({ path: screenshotPath });
        console.log('스크린샷 캡처 성공!');

    } catch (error) {
        console.error('검증 실행 중 에러 발생:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
        console.log('검증 프로세스 종료.');
    }
}

run();
