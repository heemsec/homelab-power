import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8893;
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

async function shot(page, name) {
  await page.evaluate(() => {
    const t = document.getElementById('toast');
    if (t) t.style.display = 'none';
    const nav = document.querySelector('.sitenav');
    if (nav) nav.style.visibility = 'hidden';
  });
  await page.locator('#layoutTitle').scrollIntoViewIfNeeded();
  await page.locator('section:has(#rackVisual)').screenshot({ path: `${shots}/${name}` });
  await page.evaluate(() => { const nav = document.querySelector('.sitenav'); if (nav) nav.style.visibility = ''; });
}

async function loadNick(page) {
  await page.goto(`${base}/planner.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('#presetSelect option')].some(o => o.value === 'nicks-8u-minilab'));
  await page.selectOption('#presetSelect', 'nicks-8u-minilab');
  await page.click('#loadPreset');
  await page.waitForSelector('#rackDrop .rack-block');
}

async function rackReport(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('#rackDrop');
    const heading = [...document.querySelectorAll('h3')].find(h => /Parts in this build/.test(h.textContent));
    const rows = [...document.querySelectorAll('#rackDrop .rack-row')];
    const blocks = [...document.querySelectorAll('#rackDrop .rack-block')];
    const clips = el => {
      const r = el.getBoundingClientRect();
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (node === document.body || node === document.documentElement) continue;
        const y = getComputedStyle(node).overflowY;
        if (!['auto', 'scroll', 'hidden', 'clip'].includes(y)) continue;
        const box = node.getBoundingClientRect();
        if (r.top < box.top - 1 || r.bottom > box.bottom + 1) return node.id || node.className || node.tagName;
      }
      return '';
    };
    const frameBox = frame.getBoundingClientRect();
    const headBox = heading.getBoundingClientRect();
    const rowProblems = [];
    for (const row of rows) {
      const label = row.querySelector('span');
      const box = row.getBoundingClientRect();
      const text = (label?.textContent || '').trim();
      const why = [];
      if (!/^U\d+(\.\d+)?$/.test(text)) why.push('bad label');
      if (box.height < 20) why.push('short row');
      if (box.top < frameBox.top - 1 || box.bottom > frameBox.bottom + 1) why.push('outside the frame');
      const clipped = clips(row) || (label ? clips(label) : '');
      if (clipped) why.push('clipped by ' + clipped);
      if (why.length) rowProblems.push(`${text || 'row'}: ${why.join(', ')}`);
    }
    const blockProblems = [];
    for (const block of blocks) {
      const label = block.querySelector('b');
      const text = (label?.innerText || '').replace(/\s+/g, ' ').trim();
      const box = block.getBoundingClientRect();
      const labelBox = label ? label.getBoundingClientRect() : null;
      const why = [];
      if (!text) why.push('empty label');
      if (!labelBox || labelBox.height < 8) why.push('label has no height');
      else if (labelBox.top < box.top - 1 || labelBox.bottom > box.bottom + 1) why.push('label outside its block');
      const clipped = clips(block) || (label ? clips(label) : '');
      if (clipped) why.push('clipped by ' + clipped);
      if (why.length) blockProblems.push(`${block.getAttribute('aria-label')}: ${why.join(', ')}`);
    }
    return {
      rows: rows.map(row => row.querySelector('span').textContent.trim()),
      rowProblems,
      blockProblems,
      overlap: headBox.top < frameBox.bottom - 1,
      frameH: Math.round(frameBox.height),
      blocks: blocks.length
    };
  });
}

function expectFull(report, label) {
  const expected = [];
  for (let u = 8; u >= 0.5; u -= 0.5) expected.push('U' + u);
  check(report.rows.join(',') === expected.join(','), `${label}: every U row is present (${report.rows.join(' ')})`);
  check(report.rowProblems.length === 0, `${label}: every U row is fully visible${report.rowProblems.length ? ' — ' + report.rowProblems.join('; ') : ''}`);
  check(report.blocks >= 5, `${label}: the build's devices are drawn (${report.blocks})`);
  check(report.blockProblems.length === 0, `${label}: every device label is visible${report.blockProblems.length ? ' — ' + report.blockProblems.join('; ') : ''}`);
  check(report.overlap === false, `${label}: Parts in this build does not overlap the rack`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' });
  const page = await phone.newPage();
  await loadNick(page);
  expectFull(await rackReport(page), 'phone dark free');
  await shot(page, 'rack_full_phone_free_3x.png');

  await page.evaluate(() => localStorage.setItem('homelab-power-preview-pro', 'true'));
  await loadNick(page);
  await page.waitForFunction(() => document.querySelector('#previewPro')?.checked || localStorage.getItem('homelab-power-preview-pro') === 'true');
  expectFull(await rackReport(page), 'phone dark pro');
  await shot(page, 'rack_full_phone_pro_3x.png');
  await phone.close();

  const fold = await browser.newContext({ viewport: { width: 673, height: 841 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const wide = await fold.newPage();
  await wide.addInitScript(() => localStorage.setItem('homelab-power-theme', 'light'));
  await loadNick(wide);
  expectFull(await rackReport(wide), 'fold light free');
  await shot(wide, 'rack_full_fold_free_2x.png');
  await wide.evaluate(() => localStorage.setItem('homelab-power-preview-pro', 'true'));
  await loadNick(wide);
  expectFull(await rackReport(wide), 'fold light pro');
  await shot(wide, 'rack_full_fold_pro_2x.png');

  await wide.setViewportSize({ width: 844, height: 390 });
  await wide.waitForFunction(() => document.querySelector('#rackDrop')?.style.height === '448px');
  expectFull(await rackReport(wide), 'landscape after resize');

  await wide.setViewportSize({ width: 1280, height: 900 });
  await wide.waitForFunction(() => getComputedStyle(document.querySelector('#rackVisual')).getPropertyValue('--rack-row').trim() === '28px');
  await wide.waitForTimeout(150);
  expectFull(await rackReport(wide), 'desktop after resize');

  await wide.selectOption('#rackHeight', '12');
  await wide.waitForFunction(() => document.querySelectorAll('#rackDrop .rack-row').length === 24);
  const taller = await rackReport(wide);
  check(taller.rows[0] === 'U12' && taller.rows.at(-1) === 'U0.5' && taller.rowProblems.length === 0 && taller.blockProblems.length === 0 && taller.overlap === false, 'a taller rack stays fully visible after the height edit');
  await wide.selectOption('#rackHeight', '8');
  await wide.waitForFunction(() => document.querySelectorAll('#rackDrop .rack-row').length === 16);
  expectFull(await rackReport(wide), 'desktop after putting the height back');
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
console.log('\nrack layout passed');
