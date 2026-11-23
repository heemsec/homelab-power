import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8908;
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
  await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#labUps');
  const note = await page.locator('.waste-note').first().innerText();
  check(/Idle looks high/.test(note), 'a high idle shows a plain note');
  await page.click('#addUps');
  await page.fill('[data-ups-key="batteryWh"]', '150');
  await page.locator('[data-ups-host]').first().check();
  const runtime = await page.locator('.ups-block .help').first().innerText();
  check(/About \d/.test(runtime) && /hour/.test(runtime), `battery runtime is shown (${runtime})`);
  await page.evaluate(() => {
    const app = window.PowerApp.getState();
    app.devices.forEach(d => { d.linked = true; d.linkId = d.id; });
    app.notebookSync = window.PowerShare.deviceFingerprint(app.devices.map(d => ({...d, idle: d.idle + 1})));
    window.PowerApp.replaceState(app);
  });
  const prompt = await page.locator('#syncPromptText').innerText();
  check(/devices changed, update Notebook\?/.test(prompt), `sync prompt names the change (${prompt})`);
  await page.goto(`${base}/index.html#e=j.not-a-real-secret`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.getElementById('toast')?.textContent || '').includes('encrypted'));
  check(/Open it in Homelab Notebook/.test(await page.locator('#toast').innerText()), 'an encrypted link stays in Notebook');
  await page.goto(`${base}/settings.html`, { waitUntil: 'domcontentloaded' });
  check((await page.locator('#aboutVersion').innerText()) === '1.4.0', 'About reads 1.4.0');
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('interop v2 ui passed');
