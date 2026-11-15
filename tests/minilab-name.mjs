import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8906;
const base = `http://127.0.0.1:${port}`;
const shots = '/opt/cursor/artifacts';
mkdirSync(shots, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: root, stdio: 'ignore' });
await once(server, 'spawn');
await new Promise(r => setTimeout(r, 200));

const oldName = 'Nick\'s 8U 10" minilab';
const curlyName = 'Nick\u2019s 8U 10\u2033 minilab';
const newName = '8U 10" minilab';
const book = {
  version: 1,
  activeId: 'old',
  builds: [
    {
      id: 'old',
      name: oldName,
      presetId: 'nicks-8u-minilab',
      width: 10,
      heightU: 8,
      items: [
        {uid: 'a', partId: 'deskpi-geeekpi-rackmate-t1-8u', qty: 1, placement: 'frame', startU: null},
        {uid: 'b', partId: 'deskpi-geeekpi-1u-10-rack-shelf', qty: 1, placement: 'rack', startU: 0},
        {uid: 'c', partId: 'lenovo-thinkcentre-m720q-tiny', qty: 1, placement: 'shelf', startU: null, hostedBy: 'b'},
        {uid: 'd', partId: 'generic-10-1-hdmi-ips-monitor-1280x800-12-v', qty: 1, placement: 'rack', startU: 0.5}
      ]
    },
    {id: 'custom', name: 'Office rack', presetId: 'nicks-8u-minilab', width: 10, heightU: 8, items: []},
    {id: 'other', name: oldName, presetId: 'classic-r730-synology-unifi', width: 19, heightU: 12, items: []},
    {id: 'curly', name: curlyName, width: 10, heightU: 8, items: []}
  ]
};

const failures = [];
function check(cond, message) {
  if (cond) console.log('ok', message);
  else { console.error('FAIL', message); failures.push(message); }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' });
  await ctx.addInitScript(saved => localStorage.setItem('homelab-power-builds-v1', saved), JSON.stringify(book));
  const page = await ctx.newPage();
  await page.goto(`${base}/planner.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(name => document.querySelector('#buildHeading')?.textContent === name, newName);
  check((await page.locator('#buildHeading').innerText()) === newName, 'the planner title uses the current preset name');
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem('homelab-power-builds-v1')).builds.map(b => [b.id, b.name]));
  const byId = Object.fromEntries(names);
  check(byId.old === newName, 'the saved preset build was renamed');
  check(byId.curly === newName, 'a curly-quote copy of the old name was renamed');
  check(byId.custom === 'Office rack', 'a name someone typed is left alone');
  check(byId.other === oldName, 'the old name on a different preset is left alone');
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${shots}/planner_minilab_renamed_phone_3x.png` });
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
console.log('\nminilab name migration passed');
