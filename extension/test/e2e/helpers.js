const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const { assemble } = require('../../htmlAssembler');

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const READER = path.join(__dirname, '..', '..', 'reader.html');
const FIXTURES = path.join(__dirname, '..', 'fixtures');

const tmpDirs = [];

function FIX(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function buildPage(markdown, config = {}, { mermaidUri = null, docName = 'TestDoc' } = {}) {
  const templateHtml = fs.readFileSync(READER, 'utf8');
  const cfg = Object.assign({ theme: 'paper', flip: 'scroll', size: 18, lead: 1.9, font: 'sans' }, config);
  const html = assemble({ templateHtml, markdownText: markdown, config: cfg, pathResolver: s => s, mermaidUri, docName });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2ebook-e2e-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'reader.html');
  fs.writeFileSync(file, html, 'utf8');
  return pathToFileURL(file).href;
}

const VSCODE_MOCK = () => {
  window.__posted = [];
  window.acquireVsCodeApi = () => ({
    postMessage: m => window.__posted.push(m),
    getState: () => window.__state || {},
    setState: s => { window.__state = s; }
  });
};

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
}

function cleanup() {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
  }
  tmpDirs.length = 0;
}

module.exports = { buildPage, VSCODE_MOCK, launch, cleanup, FIX };
