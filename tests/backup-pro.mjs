import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8891;
const base = `http://127.0.0.1:${port}`;
const shots = '/opt/cursor/artifacts';
mkdirSync(shots, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: root, stdio: 'ignore' });
await once(server, 'spawn');
await new Promise(r => setTimeout(r, 250));

const failures = [];
function check(cond, message) {
  if (cond) console.log('ok', message);
  else { console.error('FAIL', message); failures.push(message); }
}

function nativeBilling() {
  window.__bought = [];
  window.NativeBilling = {
    getState: async () => ({ status: 'ready', prices: { pro_unlock: '$2.99' }, pro: false }),
    purchase: async productId => { window.__bought.push(productId); return { outcome: 'purchased', status: 'ready', pro: true }; },
    restore: async () => ({ status: 'ready', pro: false }),
    onUpdate: () => ({ remove() {} })
  };
}

async function showBackup(page) {
  await page.evaluate(() => {
    const card = document.getElementById('backupTitle').closest('section');
    const nav = document.querySelector('.sitenav');
    const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    window.scrollBy(0, card.getBoundingClientRect().top - 16);
    const bottom = card.getBoundingClientRect().bottom;
    if (bottom > navTop - 8) window.scrollBy(0, bottom - (navTop - 12));
    const toast = document.getElementById('toast');
    if (toast) toast.style.display = 'none';
  });
}
async function shot(page, file) {
  await showBackup(page);
  await page.screenshot({ path: `${shots}/${file}` });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await phone.newPage();
  await page.goto(`${base}/settings.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('homelab-power-v1', JSON.stringify({ version: 1, currency: 'USD', rate: 0.2, devices: [{ id: 'd1', name: 'Kept lab', idle: 4, load: 8, loadPct: 0, hours: 24, start: 0, selected: true }] })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  check(await page.locator('#backup').isVisible() && await page.locator('#restoreBtn').isVisible(), 'locked backup buttons stay visible');
  check(await page.locator('#backup .pro-badge').isVisible() && await page.locator('#restoreBtn .pro-badge').isVisible(), 'locked buttons show a Pro badge');
  check(await page.locator('#clearData .pro-badge').count() === 0, 'erase stays free');
  await shot(page, 'backup_free_phone_3x.png');
  await page.click('#backup');
  check(await page.locator('#proPrompt').evaluate(el => el.open), 'download opens the prompt');
  check((await page.locator('#proPromptGo').innerText()) === 'Turn on Preview Pro', 'web prompt offers Preview Pro');
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('homelab-power-v1')).devices[0].name);
  check(kept === 'Kept lab', 'opening the prompt leaves saved data alone');
  await page.locator('#restore').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"homelab-power","version":1}') });
  check(await page.locator('#proPrompt').evaluate(el => el.open), 'a file picked while locked opens the prompt');
  check(kept === await page.evaluate(() => JSON.parse(localStorage.getItem('homelab-power-v1')).devices[0].name), 'locked restore does not replace the lab');
  await page.click('#proPromptGo');
  await page.waitForFunction(() => !document.querySelector('#backup').classList.contains('is-pro-locked'));
  check(await page.locator('#backup .pro-badge').isHidden(), 'Preview Pro removes the badge');
  check((await page.locator('#backupStatus').innerText()).includes('Preview Pro is on'), 'the prompt says you can use the file now');
  await page.evaluate(() => { const d = document.getElementById('proPrompt'); if (d.open) d.close(); });
  await shot(page, 'backup_pro_phone_3x.png');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
  check(!!await download.path(), 'unlocked download works');
  await phone.close();

  const fold = await browser.newContext({ viewport: { width: 673, height: 841 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const wide = await fold.newPage();
  await wide.addInitScript(nativeBilling);
  await wide.goto(`${base}/settings.html`, { waitUntil: 'domcontentloaded' });
  check(await wide.locator('#backup .pro-badge').isVisible(), 'fold locked badge');
  await shot(wide, 'backup_free_fold_2x.png');
  await wide.click('#restoreBtn');
  check((await wide.locator('#proPromptGo').innerText()) === 'Get Pro', 'Android prompt offers Get Pro');
  await shot(wide, 'backup_getpro_fold_2x.png');
  await wide.click('#proPromptGo');
  await wide.waitForFunction(() => localStorage.getItem('homelab-power-pro') === 'true');
  check(await wide.evaluate(() => window.__bought[0] === 'pro_unlock'), 'Get Pro asks for pro_unlock');
  check(await wide.locator('#backup').evaluate(el => !el.classList.contains('is-pro-locked')), 'purchase unlocks the backup buttons');
  await wide.evaluate(() => { const d = document.getElementById('proPrompt'); if (d.open) d.close(); const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
  await shot(wide, 'backup_pro_fold_2x.png');
  const phoneBuy = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const buy = await phoneBuy.newPage();
  await buy.addInitScript(nativeBilling);
  await buy.goto(`${base}/settings.html`, { waitUntil: 'domcontentloaded' });
  await showBackup(buy);
  await buy.click('#backup');
  check((await buy.locator('#proPromptGo').innerText()) === 'Get Pro', 'phone prompt offers Get Pro');
  await shot(buy, 'backup_getpro_phone_3x.png');
  await phoneBuy.close();
  await fold.close();

  const web = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const calc = await web.newPage();
  await calc.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
  check(await calc.locator('#exportCSV').isVisible(), 'CSV download stays on the page');
  check(await calc.locator('#share').isVisible(), 'share link stays on the page');
  await web.close();
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
console.log('\nbackup pro gating passed');
