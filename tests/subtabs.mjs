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

  const calc = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await calc.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
  await calc.waitForFunction(() => /Up to .+ a year/.test(document.querySelector('[data-sum="whatif"]')?.textContent || ''));
  check((await calc.locator('[data-subtab="whatif"] > span').innerText()) === 'Save money', 'the calculator tab is called Save money');
  check((await calc.locator('[data-subtab="whatif"]').getAttribute('data-subtab')) === 'whatif', 'the tab id stays whatif');
  const summary = await calc.locator('[data-sum="whatif"]').innerText();
  await calc.click('[data-subtab="whatif"]');
  const best = await calc.locator('.scenario-result').evaluateAll(nodes => {
    const amounts = nodes.filter(node => /You'd save/.test(node.textContent)).map(node => Number(node.querySelector('strong').textContent.replace(/[^0-9.-]/g, '')));
    return Math.max(...amounts.filter(n => Number.isFinite(n)));
  });
  const shown = Number(summary.replace(/[^0-9.-]/g, ''));
  check(Math.abs(shown - best) < 0.02, `Save money summary is the best yearly saving (${summary}, cards ${best})`);
  check(!(await calc.locator('[data-panel="whatif"]').innerText()).includes('What-if'), 'the Save money panel does not say What-if');
  check((await calc.locator('#compareCard .pro-lock').innerText()).includes('Save money cards'), 'the Pro note names the Save money cards');
  await calc.click('[data-subtab="devices"]');
  while (await calc.locator('#devices [data-key="selected"]:checked').count()) {
    await calc.locator('#devices [data-key="selected"]:checked').first().uncheck();
  }
  await calc.waitForFunction(() => document.querySelector('[data-sum="whatif"]')?.textContent === 'Try a cheaper setup');
  check(true, 'with nothing checked, the summary falls back');
  await calc.evaluate(() => localStorage.setItem('homelab-power-subtab-calculator', 'whatif'));
  await calc.reload({ waitUntil: 'domcontentloaded' });
  check(await calc.locator('[data-panel="whatif"]').isVisible(), 'a saved whatif tab still opens Save money');
  await calc.close();
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
