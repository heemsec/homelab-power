import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8907;
const base = `http://127.0.0.1:${port}`;
const shots = process.env.HOMELAB_ARTIFACTS || '/opt/cursor/artifacts';
mkdirSync(shots, { recursive: true });
const vectors = JSON.parse(readFileSync(new URL('../interop/test-vectors.json', import.meta.url), 'utf8'));
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: root, stdio: 'ignore' });
await once(server, 'spawn');
await new Promise(r => setTimeout(r, 200));

const failures = [];
function check(cond, message) {
  if (cond) console.log('ok', message);
  else { console.error('FAIL', message); failures.push(message); }
}

async function shot(page, name) {
  await page.evaluate(() => {
    const t = document.getElementById('toast');
    if (t && !t.textContent) t.style.display = 'none';
  });
  await page.screenshot({ path: `${shots}/${name}.png` });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const sizes = [[412, 915, 2.625, 'fold'], [884, 1104, 2, 'inner']];
  for (const [width, height, scale, label] of sizes) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#sendNotebook');
    check(await page.locator('#sendNotebook').innerText() === 'Send to Notebook', `${label}: send button is labeled`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `send_notebook_${label}`);

    const imported = await ctx.newPage();
    await imported.goto(`${base}/index.html#${vectors.tokens.p}`, { waitUntil: 'domcontentloaded' });
    await imported.waitForSelector('#notebookImport[open]');
    check((await imported.locator('#notebookImportList').innerText()).includes('pve1'), `${label}: the sheet lists the wall-power device`);
    check(!(await imported.locator('#notebookImportList').innerText()).includes('haos'), `${label}: a guest with no wall draw is left out`);
    check(await imported.locator('#notebookMerge').evaluate(el => el.classList.contains('is-pro-locked')), `${label}: merge is marked Pro for a free user`);
    check(!(await imported.locator('#notebookLoad').evaluate(el => el.classList.contains('is-pro-locked'))), `${label}: load as new lab is free on the first lab`);
    await shot(imported, `notebook_import_free_${label}`);
    await imported.click('#notebookMerge');
    await imported.waitForFunction(() => (document.querySelector('#toast')?.textContent || '').includes('Pro'));
    await shot(imported, `notebook_merge_pro_${label}`);

    const classic = await ctx.newPage();
    await classic.goto(`${base}/index.html#${vectors.tokens.s}`, { waitUntil: 'networkidle' });
    await classic.waitForFunction(() => [...document.querySelectorAll('#devices input[data-key="name"]')].some(el => el.value === 'pve1'));
    check(true, `${label}: an old calculator share link still opens`);
    await ctx.close();
  }
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
console.log('\nnotebook interop ui passed');
