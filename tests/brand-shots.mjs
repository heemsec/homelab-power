import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8895;
const base = `http://127.0.0.1:${port}`;
const shots = process.env.HOMELAB_ARTIFACTS || '/opt/cursor/artifacts';
mkdirSync(shots, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: root, stdio: 'ignore' });
await once(server, 'spawn');
await new Promise(r => setTimeout(r, 250));

const failures = [];
function check(cond, message) {
  if (cond) console.log('ok', message);
  else { console.error('FAIL', message); failures.push(message); }
}

const pages = [
  ['calculator', 'index.html'],
  ['planner', 'planner.html'],
  ['settings', 'settings.html']
];

async function look(page, label, theme) {
  const report = await page.evaluate(() => {
    const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim().toLowerCase();
    const logo = document.querySelector('.logo');
    const svg = logo && logo.querySelector('svg');
    const tile = logo ? getComputedStyle(logo) : null;
    const old = ['#b4ef86', '#326319', '#213123', '#e9f2df'];
    const hit = old.filter(hex => document.documentElement.outerHTML.toLowerCase().includes(hex));
    return {
      bg: css('--bg'),
      accent: css('--accent'),
      ink: css('--accent-ink'),
      logo: svg && svg.getAttribute('viewBox') === '0 0 108 108',
      banner: !!document.querySelector('.brand-banner'),
      home: !!document.querySelector('.home-banner'),
      tile: tile ? { bg: tile.backgroundColor, fg: tile.color, w: tile.width } : null,
      wide: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      leftover: hit
    };
  });
  const dark = theme === 'dark';
  check(report.logo, `${label}: the approved rack mark is in the header`);
  check(report.banner === false, `${label}: the extra banner is gone`);
  check(report.tile && report.tile.w === '40px', `${label}: the logo tile is 40px (${report.tile && report.tile.w})`);
  const tileBg = report.home ? 'rgb(255, 255, 255)' : (dark ? 'rgb(255, 255, 255)' : 'rgb(49, 106, 215)');
  const tileFg = report.home ? 'rgb(11, 22, 40)' : (dark ? 'rgb(11, 22, 40)' : 'rgb(255, 255, 255)');
  check(report.tile && report.tile.bg === tileBg, `${label}: logo tile is ${report.tile && report.tile.bg}`);
  check(report.tile && report.tile.fg === tileFg, `${label}: logo mark is ${report.tile && report.tile.fg}`);
  check(report.wide, `${label}: no sideways scroll`);
  check(report.leftover.length === 0, `${label}: the page source has no old green${report.leftover.length ? ' ' + report.leftover.join(',') : ''}`);
  check(report.bg === (dark ? '#0b1628' : '#f7fbfe'), `${label}: page background is ${report.bg}`);
  check(report.accent === (dark ? '#7ec8f2' : '#316ad7'), `${label}: accent is ${report.accent}`);
  check(report.ink === (dark ? '#0b1628' : '#ffffff'), `${label}: button ink is ${report.ink}`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [theme, scheme] of [['dark', 'dark'], ['light', 'light']]) {
    for (const [name, file, width, height, scale] of [
      ...pages.map(([name, file]) => [name, file, 390, 844, 1]),
      ...pages.map(([name, file]) => [name, file, 673, 841, 1])
    ]) {
      const size = width === 390 ? 'phone' : 'fold';
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: scheme });
      const page = await ctx.newPage();
      if (theme === 'light') await page.addInitScript(() => localStorage.setItem('homelab-power-theme', 'light'));
      await page.goto(`${base}/${file}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.logo svg');
      await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });
      const label = `${name} ${size} ${theme}`;
      await look(page, label, theme);
      await ctx.close();
    }
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
console.log('\nbrand shots passed');
