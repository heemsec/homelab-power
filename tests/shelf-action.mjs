import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8898;
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

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(`${base}/planner.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('#presetSelect option')].some(o => o.value === 'nicks-8u-minilab' && o.textContent.includes('8U 10')));
  check(!(await page.locator('#presetSelect').innerText()).includes("Nick's"), 'preset list does not use a person\'s name');
  await page.locator('#presetSelect').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/planner_preset_phone_dark.png` });
  await page.selectOption('#presetSelect', 'nicks-8u-minilab');
  await page.click('#loadPreset');
  const monitor = page.locator('#itemList article', { hasText: '10.1" HDMI IPS monitor' });
  await monitor.waitFor();
  check(/In the rack at 0\.5U/.test(await monitor.innerText()), 'the monitor starts at half a U');
  await monitor.scrollIntoViewIfNeeded();
  const before = await monitor.boundingBox();
  const beforeY = await page.evaluate(() => window.scrollY);
  check(beforeY > 80, `the list is scrolled down before the tap (${Math.round(beforeY)})`);
  const shelf = monitor.locator('[data-act="shelf"]');
  const box = await shelf.boundingBox();
  await page.mouse.click(box.x + 12, box.y + 12);
  await page.mouse.click(box.x + 12, box.y + 12);
  check(/On a shelf/.test(await monitor.innerText()), 'a second tap does not put the 0.5U monitor back in the rack');
  const after = await monitor.boundingBox();
  const afterY = await page.evaluate(() => window.scrollY);
  check(Math.abs(after.y - before.y) < 40, `the monitor card stays put (${Math.round(before.y)} -> ${Math.round(after.y)})`);
  check(afterY > 80, `the page does not jump to the top (${Math.round(afterY)})`);
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
  await page.screenshot({ path: `${shots}/planner_shelf_phone_dark.png` });
  await monitor.locator('[data-act="rack"]').click();
  check(/In the rack at /.test(await monitor.innerText()), 'Into the rack puts the monitor back');
  const hub = page.locator('#itemList article', { hasText: 'Blazin3D' });
  await hub.locator('[data-act="remove"]').click();
  check(await hub.count() === 0, 'Remove drops the hub');
  check((await page.evaluate(() => window.scrollY)) > 40, 'Remove does not jump to the top');
  await ctx.close();
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
console.log('\nshelf actions passed');
