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
  await page.click('[data-subtab="parts"]');
  const partsSummary = await page.locator('[data-sum="parts"]').innerText();
  check(/^8 items · \d+ W$/.test(partsSummary), `parts summary stays on one short line (${partsSummary})`);
  await tabsLineUp(page, 'planner phone');
  await page.close();

  async function tabsLineUp(target, label) {
    const report = await target.evaluate(() => {
      const buttons = [...document.querySelectorAll('.subtabs button')];
      const heights = buttons.map(button => Math.round(button.getBoundingClientRect().height));
      const tops = buttons.map(button => Math.round(button.querySelector('span').getBoundingClientRect().top));
      const lines = [...document.querySelectorAll('.subtabs small')].map(node => node.getClientRects().length);
      return { heights, tops, lines, count: buttons.length };
    });
    check(new Set(report.heights).size === 1, `${label}: tabs share a height (${report.heights.join(', ')})`);
    check(new Set(report.tops).size === 1, `${label}: labels share a baseline (${report.tops.join(', ')})`);
    check(report.lines.every(n => n === 1), `${label}: each summary is one line (${report.lines.join(', ')})`);
    return report.count;
  }

  const calc = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await calc.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
  await calc.waitForSelector('#whatTitle', { state: 'attached' });
  check(await calc.locator('[data-subtab="whatif"]').count() === 0, 'the calculator has no third tab');
  check(await tabsLineUp(calc, 'calculator phone') === 2, 'the calculator has Devices and Costs');
  await calc.click('[data-subtab="costs"]');
  check(await calc.locator('#whatTitle').isVisible(), 'ways to save sits on Costs');
  check((await calc.locator('#whatTitle').innerText()) === 'Ways to save', 'the section heading is Ways to save');
  check((await calc.locator('#compareCard .pro-lock').innerText()).includes('ways to save'), 'the Pro note still points at the free cards');
  await calc.evaluate(() => localStorage.setItem('homelab-power-subtab-calculator', 'whatif'));
  await calc.reload({ waitUntil: 'domcontentloaded' });
  check(await calc.locator('[data-panel="costs"]').isVisible(), 'a saved whatif tab opens Costs');
  check(await calc.locator('[data-subtab="costs"]').getAttribute('aria-selected') === 'true', 'Costs is the selected tab');
  await calc.close();

  const fold = await browser.newPage({ viewport: { width: 673, height: 841 } });
  await fold.goto(`${base}/planner.html`, { waitUntil: 'domcontentloaded' });
  await fold.waitForSelector('[data-sum="parts"]');
  await tabsLineUp(fold, 'planner fold');
  await fold.goto(`${base}/settings.html`, { waitUntil: 'domcontentloaded' });
  await fold.waitForSelector('[data-subtab="pro"]');
  await tabsLineUp(fold, 'settings fold');
  await fold.setViewportSize({ width: 390, height: 844 });
  await tabsLineUp(fold, 'settings phone');
  await fold.close();
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
