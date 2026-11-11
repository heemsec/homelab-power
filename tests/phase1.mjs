import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const port = 9891;
const base = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore' });
await once(server, 'spawn');
await new Promise(r => setTimeout(r, 250));

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const failures = [];
function check(cond, message) {
  if (cond) console.log('ok', message);
  else { console.error('FAIL', message); failures.push(message); }
}

async function metrics(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (el.closest('.table-scroll, .rack-scroll, .catalog')) continue;
      if (r.right > vw + 1.5 || r.left < -1.5) {
        bad.push(`${el.tagName}.${String(el.className || el.id).slice(0, 40)}@${Math.round(r.left)}-${Math.round(r.right)}`);
      }
    }
    const main = document.querySelector('main')?.getBoundingClientRect();
    const top = document.querySelector('.topbar')?.getBoundingClientRect();
    return {
      scroll: document.documentElement.scrollWidth,
      client: vw,
      bad: bad.slice(0, 6),
      mainLeft: main && Math.round(main.left),
      topLeft: top && Math.round(top.left),
      mainWidth: main && Math.round(main.width),
      topWidth: top && Math.round(top.width)
    };
  });
}

try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  const github = [];
  page.on('request', req => { if (/github\.com/i.test(req.url())) github.push(req.url()); });

  await page.goto(`${base}/planner.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('#presetSelect option')].some(o => o.value === 'nicks-8u-minilab'));
  await page.selectOption('#presetSelect', 'nicks-8u-minilab');
  await page.click('#loadPreset');
  await page.waitForFunction(() => Number(document.querySelector('#idleTotal')?.dataset.w) > 15);

  const idle = await page.locator('#idleTotal').innerText();
  const typical = await page.locator('#typicalTotal').innerText();
  const precise = Number(await page.locator('#typicalTotal').getAttribute('data-w'));
  check(/18\.1 W/.test(idle), `idle shows one decimal (${idle})`);
  check(Math.abs(precise - 22.05) < 0.02, `typical stays precise (${precise})`);
  check(/22\.1 W/.test(typical), `22.05 W displays as 22.1 (${typical})`);
  check(await page.locator('#fitWarning').isHidden(), 'Nick preset fits with no warning');
  const zero = await page.locator('#rackZero').innerText();
  check(/0U top \/ rear/.test(zero) && /fan/i.test(zero), 'fan is visible as a 0U top/rear part');
  check(/shelf/i.test(await page.locator('#frameNote').innerText()), 'shelf share is explained');
  check(!(await page.locator('.rack-block').allInnerTexts()).some(t => /M720q/.test(t) && !/\+/.test(t)), 'M720q is not its own slot');
  const blocks = await page.locator('.rack-block').allInnerTexts();
  check(blocks.some(t => /M720q/.test(t) && /shelf/i.test(t)), `mini PC shares the shelf block (${blocks.join(' | ')})`);

  await page.fill('#partSearch', 'M720q');
  await page.waitForSelector('[data-edit="lenovo-thinkcentre-m720q-tiny"]');
  const listName = await page.locator('#catalog .part-row b').first().innerText();
  check(/ThinkCentre M720q Tiny/.test(listName), `parts list keeps the full name (${listName})`);
  await page.click('[data-edit="lenovo-thinkcentre-m720q-tiny"]');
  await page.waitForSelector('#editPart[open]');
  check(/9 W idle/.test(await page.locator('#editOriginal').innerText()), 'original idle stays visible');
  await page.fill('#editIdle', '5');
  const href = await page.locator('#suggestFix').getAttribute('href');
  check(href.includes('github.com/heemsec/homelab-power/issues/new'), 'suggest-a-fix points at the repo issues');
  check(decodeURIComponent(href).includes('lenovo-thinkcentre-m720q-tiny'), 'issue names the part id');
  check(decodeURIComponent(href).includes('"idleW": 9') || decodeURIComponent(href).includes('"idleW":9'), 'issue includes the old idle');
  check(decodeURIComponent(href).includes('"idleW": 5') || decodeURIComponent(href).includes('"idleW":5'), 'issue includes the new idle');
  check(github.length === 0, 'opening the form does not call GitHub');
  await page.click('#editForm button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('#editPart[open]'));
  const editedIdle = Number(await page.locator('#idleTotal').getAttribute('data-w'));
  check(Math.abs(editedIdle - 14.1) < 0.05, `edited idle total is 14.1 (${editedIdle})`);
  check(/Edited/.test(await page.locator('#catalog').innerText()), 'edited badge shows');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Number(document.querySelector('#idleTotal')?.dataset.w) > 10);
  const saved = Number(await page.locator('#idleTotal').getAttribute('data-w'));
  check(Math.abs(saved - 14.1) < 0.05, `saved build keeps the correction (${saved})`);

  await page.fill('#partSearch', 'M720q');
  await page.click('[data-edit="lenovo-thinkcentre-m720q-tiny"]');
  await page.fill('#editU', '6');
  await page.click('#editForm button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('#fitWarning').hidden);
  check(true, 'raising the mini PC to 6U brings the fit warning back');

  await page.fill('#partSearch', 'M720q');
  await page.click('[data-edit="lenovo-thinkcentre-m720q-tiny"]');
  await page.click('#resetPart');
  await page.waitForFunction(() => document.querySelector('#fitWarning').hidden && Math.abs(Number(document.querySelector('#idleTotal').dataset.w) - 18.1) < 0.05);
  check(true, 'reset restores the original fit and the 18.1 W idle');

  await page.fill('#partSearch', 'M720q');
  await page.click('[data-edit="lenovo-thinkcentre-m720q-tiny"]');
  await page.fill('#editIdle', '7');
  await page.click('#editForm button[type="submit"]');
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('#idleTotal').dataset.w) - 16.1) < 0.05);

  const settings = await context.newPage();
  await settings.setViewportSize({ width: 390, height: 844 });
  await settings.goto(`${base}/settings.html`, { waitUntil: 'domcontentloaded' });
  check((await settings.locator('#aboutVersion').innerText()) === '1.3.0', 'About reads the single version');
  const [download] = await Promise.all([
    settings.waitForEvent('download'),
    settings.click('#backup')
  ]);
  const backupPath = await download.path();
  settings.once('dialog', dialog => dialog.accept());
  await settings.click('#clearData');
  await settings.waitForTimeout(200);
  settings.once('dialog', dialog => dialog.accept());
  await settings.setInputFiles('#restore', backupPath);
  await settings.waitForFunction(() => (document.querySelector('#backupStatus')?.textContent || '').includes('Restored'));
  const restored = await settings.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('homelab-power-corrections-v1') || 'null');
    return raw?.parts?.['lenovo-thinkcentre-m720q-tiny']?.idleW;
  });
  check(restored === 7, `backup round-trip kept idle 7 (${restored})`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('#idleTotal')?.dataset.w) - 16.1) < 0.05);
  check(true, 'planner still shows the restored correction');

  await page.click('#previewPro');
  await page.selectOption('#presetSelect', 'nicks-8u-minilab');
  page.once('dialog', dialog => dialog.accept());
  await page.click('#newBuild');
  await page.click('#loadPreset');
  await page.selectOption('#compareA', { index: 0 });
  await page.selectOption('#compareB', { index: 1 });
  const compare = await page.locator('#comparison').innerText();
  check(/a month/.test(compare) && /a year/.test(compare), 'compare shows monthly and yearly cost');
  check(/W/.test(compare) && /year/.test(compare), 'compare shows the watt gap and the money gap');

  const widths = [344, 390, 412, 768, 1440];
  const pages = ['index.html', 'planner.html', 'settings.html', 'privacy.html'];
  for (const width of widths) {
    const probe = await browser.newPage({ viewport: { width, height: 900 } });
    for (const file of pages) {
      await probe.goto(`${base}/${file}`, { waitUntil: 'domcontentloaded' });
      await probe.waitForTimeout(150);
      const box = await metrics(probe);
      check(box.scroll <= box.client + 1, `${file} @ ${width} has no sideways scroll (${box.scroll}/${box.client})`);
      check(box.bad.length === 0, `${file} @ ${width} stays inside the screen ${box.bad.join(', ')}`);
      check(box.mainLeft === box.topLeft && box.mainWidth === box.topWidth, `${file} @ ${width} header lines up with the page (${box.topLeft}/${box.mainLeft}, ${box.topWidth}/${box.mainWidth})`);
    }
    await probe.close();
  }

  const dragPage = await context.newPage();
  await dragPage.setViewportSize({ width: 1280, height: 1000 });
  await dragPage.goto(`${base}/planner.html`, { waitUntil: 'domcontentloaded' });
  await dragPage.waitForSelector('#catalog .part-row');
  await dragPage.evaluate(() => localStorage.removeItem('homelab-power-builds-v1'));
  await dragPage.reload({ waitUntil: 'domcontentloaded' });
  await dragPage.waitForSelector('#catalog .part-row');
  await dragPage.fill('#partSearch', 'patch panel');
  await dragPage.locator('#catalog .part-row').first().scrollIntoViewIfNeeded();
  await dragPage.locator('#rackDrop').scrollIntoViewIfNeeded();
  await dragPage.waitForTimeout(100);
  const before = await dragPage.locator('#itemList article').count();
  const from = await dragPage.locator('#catalog .part-row').first().boundingBox();
  const rack = await dragPage.locator('#rackDrop').boundingBox();
  await dragPage.mouse.move(from.x + 40, from.y + 16);
  await dragPage.mouse.down();
  await dragPage.mouse.move(rack.x + rack.width / 2, rack.y + 80, { steps: 15 });
  await dragPage.mouse.up();
  await dragPage.waitForTimeout(200);
  const afterMouse = await dragPage.locator('#itemList article').count();
  check(afterMouse === before + 1, `mouse drag added a part (${before} -> ${afterMouse})`);

  await dragPage.fill('#partSearch', '120mm');
  await dragPage.locator('#catalog .part-row').first().scrollIntoViewIfNeeded();
  await dragPage.locator('#itemList').scrollIntoViewIfNeeded();
  await dragPage.waitForTimeout(100);
  const fanBox = await dragPage.locator('#catalog .part-row').first().boundingBox();
  const listBox = await dragPage.locator('#itemList').boundingBox();
  await dragPage.evaluate(({ start, end }) => {
    const target = document.elementFromPoint(start.x, start.y);
    const fire = (type, x, y) => {
      const dest = type === 'pointerdown' ? target : (document.elementFromPoint(x, y) || document.body);
      dest.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
        clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1
      }));
    };
    fire('pointerdown', start.x, start.y);
    fire('pointermove', (start.x + end.x) / 2, (start.y + end.y) / 2);
    fire('pointermove', end.x, end.y);
    fire('pointerup', end.x, end.y);
  }, {
    start: { x: fanBox.x + 30, y: fanBox.y + 16 },
    end: { x: listBox.x + 40, y: listBox.y + 30 }
  });
  await dragPage.waitForTimeout(200);
  const afterTouch = await dragPage.locator('#itemList article').count();
  check(afterTouch === afterMouse + 1, `touch drag added a part (${afterMouse} -> ${afterTouch})`);

  const phone = await browser.newPage({ viewport: { width: 390, height: 1800 } });
  await phone.goto(`${base}/planner.html`, { waitUntil: 'domcontentloaded' });
  await phone.waitForFunction(() => [...document.querySelectorAll('#presetSelect option')].some(o => o.value === 'nicks-8u-minilab'));
  await phone.selectOption('#presetSelect', 'nicks-8u-minilab');
  await phone.click('#loadPreset');
  await phone.waitForSelector('.rack-block');
  const clamped = await phone.evaluate(() => {
    const block = document.querySelector('.rack-block b');
    const style = getComputedStyle(block);
    return { clamp: style.webkitLineClamp || style.lineClamp, text: block.textContent };
  });
  check(String(clamped.clamp) === '2', `phone rack names wrap to two lines (${clamped.clamp}: ${clamped.text})`);

  check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await settings.close();
  await page.close();
  await dragPage.close();
  await phone.close();
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
console.log('\nphase 1 passed');
