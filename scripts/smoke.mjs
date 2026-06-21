// Headless smoke test: serve dist/, open it in a browser, capture console /
// page errors (Three.js prints GLSL compile errors to console.error), and
// screenshot. Usage: node scripts/smoke.mjs [chromePath]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const PORT = 5189;

const CHROME_CANDIDATES = [
  process.argv[2],
  '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
  '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chromePath) { console.error('No browser found. Pass a path as argv[2].'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.map': 'application/json', '.wasm': 'application/wasm' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(PORT, '0.0.0.0', r));
console.log(`serving dist on http://localhost:${PORT} via ${chromePath}`);

const logs = [];
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
           '--use-angle=default', '--disable-dev-shm-usage'],
    protocolTimeout: 60000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 4000)); // let bake + a few frames run

  const out = '/tmp/smoke-shot.png';
  await page.screenshot({ path: out });
  console.log(`\nscreenshot -> ${out}`);
} catch (e) {
  console.error('SMOKE FAILED:', e.message);
} finally {
  console.log('\n===== BROWSER LOGS =====');
  console.log(logs.length ? logs.join('\n') : '(no console output captured)');
  if (browser) await browser.close().catch(() => {});
  server.close();
}
