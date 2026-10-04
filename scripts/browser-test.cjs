const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.log(`[browser:error] ${error.message}`));
  await page.goto(`file://${path.resolve(__dirname, '..', 'demo', 'demo.html')}`, { waitUntil: 'load', timeout: 10000 });
  if (await page.locator('#enter').count() !== 1) throw new Error('simulation controls did not load');
  await page.locator('#enter').click({ timeout: 3000 });
  await page.locator('#enter').click({ timeout: 3000 });
  await page.locator('[data-name="小红"]').click({ timeout: 3000 });
  await page.waitForTimeout(100);
  const state = await page.evaluate(() => ({ hosts: document.querySelectorAll('[data-qianchuan-flow-root]').length, rows: document.querySelectorAll('[data-live-message]').length }));
  if (state.hosts !== 1 || state.rows !== 3) throw new Error(`simulation did not render: ${JSON.stringify(state)}`);
  await page.waitForTimeout(100);
  await page.reload({ waitUntil: 'load', timeout: 10000 });
  await page.waitForTimeout(100);
  const restored = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-live-message]').length }));
  if (restored.rows !== 3) throw new Error(`simulation state was not restored after reload: ${JSON.stringify(restored)}`);
  fs.mkdirSync(path.resolve(__dirname, '..', 'test-results'), { recursive: true });
  await page.screenshot({ path: path.resolve(__dirname, '..', 'test-results', 'demo.png'), fullPage: true });
  await browser.close();
  console.log('Offline simulation browser check passed.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
