import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const port = 9894;
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
  const context = await browser.newContext();
  await context.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('homelab-power-palette', 'cyber');
    sessionStorage.setItem('seeded', '1');
  });
  const page = await context.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/settings.html`, { waitUntil: 'domcontentloaded' });
  const early = await page.evaluate(() => ({
    palette: document.documentElement.dataset.palette,
    choice: document.documentElement.dataset.paletteChoice
  }));
  check(early.palette === 'cyber' && early.choice === 'cyber', `cyber is on before the settings script settles (${early.palette})`);
  check(await page.locator('.swatch').count() === 4, 'four theme swatches');
  check(await page.locator('.swatch.is-locked').count() === 2, 'two themes are locked without Pro');
  await page.evaluate(() => document.querySelector('input[name="palette"][value="nordic"]').click());
  await page.waitForTimeout(100);
  const blocked = await page.evaluate(() => ({
    palette: document.documentElement.dataset.palette,
    upsell: !document.getElementById('paletteUpsell').hidden
  }));
  check(blocked.palette === 'cyber' && blocked.upsell, 'a locked theme shows the upsell and does not take over');

  await page.evaluate(() => localStorage.setItem('homelab-power-preview-pro', 'true'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  check(await page.locator('.swatch.is-locked').count() === 0, 'Pro removes the locks');
  await page.locator('input[name="palette"][value="nordic"]').check();
  await page.locator('input[name="theme"][value="light"]').check();
  await page.waitForTimeout(500);
  const nordic = await page.evaluate(() => ({
    palette: document.documentElement.dataset.palette,
    theme: document.documentElement.dataset.theme,
    bg: getComputedStyle(document.body).backgroundColor
  }));
  check(nordic.palette === 'nordic' && nordic.theme === 'light', `nordic light applies (${nordic.palette} ${nordic.theme} ${nordic.bg})`);

  await page.evaluate(() => localStorage.removeItem('homelab-power-preview-pro'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const fallen = await page.evaluate(() => ({
    palette: document.documentElement.dataset.palette,
    choice: document.documentElement.dataset.paletteChoice
  }));
  check(fallen.palette === 'homelab' && fallen.choice === 'nordic', `Pro loss falls back without forgetting (${fallen.palette} / ${fallen.choice})`);

  await page.evaluate(() => localStorage.setItem('homelab-power-preview-pro', 'true'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
  const path = await download.path();
  const backup = JSON.parse(await (await import('node:fs')).promises.readFile(path, 'utf8'));
  const settings = JSON.parse(backup['homelab-power-settings-v1']);
  check(settings.palette === 'nordic' && backup['homelab-power-palette'] === 'nordic', 'backup keeps the theme choice');
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
console.log('\nphase 4 passed');
