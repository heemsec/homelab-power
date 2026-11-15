import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8899;
const base = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: root, stdio: 'ignore' });
await once(server, 'spawn');
await new Promise(r => setTimeout(r, 200));

const failures = [];
function check(cond, message) {
  if (cond) console.log('ok', message);
  else { console.error('FAIL', message); failures.push(message); }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/planner.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-subtab="parts"]');
  check(await page.locator('[data-panel="rack"]').isVisible(), 'rack panel starts open');
  check(await page.locator('[data-panel="parts"]').isHidden(), 'parts panel starts closed');
  await page.click('[data-subtab="parts"]');
  check(await page.locator('[data-panel="parts"]').isVisible(), 'parts panel opens');
  check(await page.locator('[data-panel="rack"]').isHidden(), 'rack panel closes');
  check((await page.locator('[data-sum="parts"]').innerText()).length > 0, 'parts tab keeps a summary');
  await page.click('[data-subtab="rack"]');
  await page.selectOption('#presetSelect', 'nicks-8u-minilab');
  await page.click('#loadPreset');
  await page.click('[data-subtab="parts"]');
  const row = page.locator('#itemList article').first();
  check(await row.locator('.part-edit').isHidden(), 'a part row starts collapsed');
  await row.locator('[data-expand]').click();
  check(await row.locator('.part-edit').isVisible(), 'tapping a row shows its controls');
  await row.locator('[data-expand]').click();
  check(await row.locator('.part-edit').isHidden(), 'tapping again hides the controls');
  await page.reload({ waitUntil: 'domcontentloaded' });
  check(await page.locator('[data-panel="parts"]').isVisible(), 'the last planner tab is remembered');
  const history = await page.evaluate(() => history.length);
  await page.click('[data-subtab="power"]');
  check(await page.evaluate(() => history.length) === history, 'switching tabs does not add a history entry');
  await page.close();
} catch (error) {
  console.error(error);
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nsub-tabs passed');
