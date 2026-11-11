import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const port = 9892;
const base = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore' });
await once(server, 'spawn');
await new Promise(r => setTimeout(r, 250));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];
function check(cond, message) {
  if (cond) console.log('ok', message);
  else { console.error('FAIL', message); failures.push(message); }
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  await page.addInitScript(() => { navigator.clipboard.writeText = async text => { window.__clip = text; }; });
  await page.goto(`${base}/planner.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#presetSelect option').length > 2);
  await page.selectOption('#presetSelect', 'nicks-8u-minilab');
  await page.click('#loadPreset');
  await page.waitForFunction(() => Number(document.querySelector('#idleTotal')?.dataset.w) > 15);
  const heat = Number(await page.locator('#idleHeat').getAttribute('data-btu'));
  check(Math.abs(heat - 18.1 * 3.412) < 0.02, `idle heat is watts times 3.412 (${heat})`);
  check(/3\.412/.test(await page.locator('#heatNote').innerText()), 'heat note explains the conversion');

  await page.click('#copyBuild');
  await page.waitForFunction(() => window.__clip && window.__clip.includes('#b='));
  const link = await page.evaluate(() => window.__clip);
  const preview = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await preview.goto(link.replace(/^https?:\/\/[^/]+/, base), { waitUntil: 'domcontentloaded' });
  await preview.waitForSelector('#shareBanner:not([hidden])');
  check(/preview/i.test(await preview.locator('#shareBanner').innerText()), 'shared link opens a preview');
  const sharedIdle = Number(await preview.locator('#idleTotal').getAttribute('data-w'));
  check(Math.abs(sharedIdle - 18.1) < 0.05, `preview keeps the watts (${sharedIdle})`);
  await preview.click('#saveCopy');
  await preview.waitForFunction(() => document.querySelector('#shareBanner').hidden);
  const saved = await preview.evaluate(() => JSON.parse(localStorage.getItem('homelab-power-builds-v1')).builds.length);
  check(saved >= 1, 'save a copy writes the build');

  await page.fill('#partSearch', 'BR1500MS2');
  await page.click('[data-add="apc-back-ups-pro-br1500ms2"]');
  await page.waitForSelector('#upsCard:not([hidden])');
  const ups = await page.locator('#upsRuntime').innerText();
  check(/More than 2 hours 30 minutes/.test(ups), `light load stays above the first published point (${ups.slice(0, 220)})`);
  check(/18\.1 W load/.test(ups), 'UPS copy names the load');
  check(!/on the other gear|longer than \d/.test(ups), 'UPS copy does not use the old runtime phrasing');
  check(/Runtime sheet/.test(ups) && /Battery sheet/.test(ups), 'UPS card names the runtime sheet and the battery sheet');
  check(!/Source Source/.test(ups), 'UPS card does not repeat a generic Source label');
  check(/Turn the 10\.1" monitor off when you're not using it/.test(await page.locator('#whatIfBody').innerText()), 'monitor suggestion uses a short name');
  page.once('dialog', dialog => dialog.accept());
  await page.selectOption('#presetSelect', 'classic-r730-synology-unifi');
  await page.click('#loadPreset');
  await page.waitForFunction(() => /tiny PC/.test(document.querySelector('#whatIfBody')?.textContent || ''));
  const swapTitle = await page.locator('#whatIfBody h3').first().innerText();
  check(/Move the Dell R730 onto a tiny PC/.test(swapTitle), `rack server swap uses a short name (${swapTitle})`);
  await page.selectOption('#presetSelect', 'nicks-8u-minilab');
  page.once('dialog', dialog => dialog.accept());
  await page.click('#loadPreset');
  await page.waitForFunction(() => /10\.1" monitor/.test(document.querySelector('#whatIfBody')?.textContent || ''));

  check(await page.locator('#whatIfLock').isVisible(), 'what-if swaps stay locked before Pro');
  await page.click('#previewPro');
  await page.waitForFunction(() => document.querySelector('#whatIfLock').hidden);
  const swap = page.locator('[data-swap]').first();
  check(await swap.count() === 1, 'a conservative swap is offered');
  await swap.click();
  await page.waitForFunction(() => (document.querySelector('#comparison')?.textContent || '').includes('a year'));
  check(/copy|swap/i.test(await page.locator('#buildName').inputValue()), 'the swap landed in a copy');

  const calc = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await calc.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  await calc.waitForSelector('#heatLine');
  check(/3\.412/.test(await calc.locator('#heatLine').innerText()), 'calculator explains heat');
  await calc.click('#previewPro');
  await calc.click('#examplePeak');
  await calc.waitForFunction(() => /covered/.test(document.querySelector('#touIssues')?.textContent || ''));
  check(/not a real tariff|made up/i.test(await calc.locator('main').innerText()), 'the example is labeled as an example');
  const withTou = await calc.locator('.total-card strong').first().innerText();
  await calc.click('#tou');
  await calc.waitForTimeout(300);
  const flat = await calc.locator('.total-card strong').first().innerText();
  check(withTou !== flat, `turning periods off changes the bill (${withTou} vs ${flat})`);

  check(errors.length === 0, `no planner errors ${errors.join(' | ')}`);
  await preview.close();
  await page.close();
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
console.log('\nphase 2 passed');
