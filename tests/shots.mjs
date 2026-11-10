import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = '/opt/cursor/artifacts';
const app = spawn('python3', ['-m', 'http.server', '9901'], { cwd: root, stdio: 'ignore' });
const before = spawn('python3', ['-m', 'http.server', '9902'], { cwd: '/tmp/calc-before', stdio: 'ignore' });
await Promise.all([once(app, 'spawn'), once(before, 'spawn')]);
await new Promise(r => setTimeout(r, 300));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const phoneContext = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
const deskContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const phone = await phoneContext.newPage();
const desk = await deskContext.newPage();

async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name);
}
async function nick(page) {
  await page.goto('http://127.0.0.1:9901/planner.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#presetSelect option').length > 2);
  await page.selectOption('#presetSelect', 'nicks-8u-minilab');
  await page.click('#loadPreset');
  await page.waitForFunction(() => Number(document.querySelector('#idleTotal')?.dataset.w) > 15);
  await page.locator('#rackVisual').scrollIntoViewIfNeeded();
}

try {
  await nick(phone);
  await shot(phone, 'planner_nick_phone');
  await nick(desk);
  await shot(desk, 'planner_nick_desktop');

  for (const page of [phone, desk]) {
    await page.click('#previewPro');
    await page.click('#newBuild');
    page.once('dialog', d => d.accept());
    await page.selectOption('#presetSelect', '10in-tiny-cluster');
    await page.click('#loadPreset');
    await page.locator('#comparison').scrollIntoViewIfNeeded();
  }
  await shot(phone, 'planner_compare_phone');
  await shot(desk, 'planner_compare_desktop');

  for (const page of [phone, desk]) {
    await page.fill('#partSearch', 'M720q');
    await page.locator('[data-edit="lenovo-thinkcentre-m720q-tiny"]').scrollIntoViewIfNeeded();
    await page.click('[data-edit="lenovo-thinkcentre-m720q-tiny"]');
    await page.waitForSelector('#editPart[open]');
  }
  await shot(phone, 'planner_edit_phone');
  await shot(desk, 'planner_edit_desktop');
  await phone.click('#closeEdit');
  await desk.click('#closeEdit');

  await phone.evaluate(() => { navigator.clipboard.writeText = async t => { window.__clip = t; }; });
  await phone.click('#copyBuild');
  await phone.waitForFunction(() => window.__clip && window.__clip.includes('#b='));
  const link = await phone.evaluate(() => window.__clip);
  const sharePhone = await phoneContext.newPage();
  const shareDesk = await deskContext.newPage();
  const url = link.replace(/^https?:\/\/[^/]+/, 'http://127.0.0.1:9901');
  await sharePhone.goto(url, { waitUntil: 'domcontentloaded' });
  await shareDesk.goto(url, { waitUntil: 'domcontentloaded' });
  await sharePhone.waitForSelector('#shareBanner:not([hidden])');
  await shareDesk.waitForSelector('#shareBanner:not([hidden])');
  await shot(sharePhone, 'planner_share_phone');
  await shot(shareDesk, 'planner_share_desktop');
  await sharePhone.close();
  await shareDesk.close();

  for (const page of [phone, desk]) {
    await page.fill('#partSearch', 'BR1500MS2');
    await page.locator('[data-add="apc-back-ups-pro-br1500ms2"][data-where="shelf"]').click();
    await page.locator('#upsCard').scrollIntoViewIfNeeded();
  }
  await shot(phone, 'planner_ups_phone');
  await shot(desk, 'planner_ups_desktop');

  for (const page of [phone, desk]) await page.locator('#whatIfCard').scrollIntoViewIfNeeded();
  await shot(phone, 'planner_whatif_phone');
  await shot(desk, 'planner_whatif_desktop');

  const calcPhone = await phoneContext.newPage();
  const calcDesk = await deskContext.newPage();
  for (const page of [calcPhone, calcDesk]) {
    await page.goto('http://127.0.0.1:9901/index.html', { waitUntil: 'domcontentloaded' });
    await page.click('#previewPro');
    await page.click('#examplePeak');
    await page.locator('#touExtra').scrollIntoViewIfNeeded();
  }
  await shot(calcPhone, 'calculator_tou_phone');
  await shot(calcDesk, 'calculator_tou_desktop');
  for (const page of [calcPhone, calcDesk]) await page.locator('#totalsTitle').scrollIntoViewIfNeeded();
  await shot(calcPhone, 'calculator_after_phone');
  await shot(calcDesk, 'calculator_after_desktop');

  const oldPhone = await phoneContext.newPage();
  const oldDesk = await deskContext.newPage();
  await oldPhone.goto('http://127.0.0.1:9902/index.html', { waitUntil: 'domcontentloaded' });
  await oldDesk.goto('http://127.0.0.1:9902/index.html', { waitUntil: 'domcontentloaded' });
  await oldPhone.waitForTimeout(300);
  await oldDesk.waitForTimeout(300);
  await shot(oldPhone, 'calculator_before_phone');
  await shot(oldDesk, 'calculator_before_desktop');

  const setPhone = await phoneContext.newPage();
  const setDesk = await deskContext.newPage();
  await setPhone.goto('http://127.0.0.1:9901/settings.html', { waitUntil: 'domcontentloaded' });
  await setDesk.goto('http://127.0.0.1:9901/settings.html', { waitUntil: 'domcontentloaded' });
  await shot(setPhone, 'settings_phone');
  await setDesk.locator('h1').scrollIntoViewIfNeeded();
  await shot(setDesk, 'settings_desktop');
  await setPhone.locator('#paletteTitle').scrollIntoViewIfNeeded();
  await setDesk.locator('#paletteTitle').scrollIntoViewIfNeeded();
  await shot(setPhone, 'settings_themes_phone');
  await shot(setDesk, 'settings_themes_desktop');

  for (const palette of ['homelab', 'cyber', 'nordic', 'amber']) {
    const themedPhone = await phoneContext.newPage();
    const themedDesk = await deskContext.newPage();
    for (const page of [themedPhone, themedDesk]) {
      await page.addInitScript(value => {
        localStorage.setItem('homelab-power-palette', value);
        localStorage.setItem('homelab-power-preview-pro', 'true');
        localStorage.setItem('homelab-power-theme', 'dark');
      }, palette);
      await page.goto('http://127.0.0.1:9901/planner.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('#presetSelect option').length > 2);
      await page.selectOption('#presetSelect', 'nicks-8u-minilab');
      await page.click('#loadPreset');
      await page.waitForSelector('#rackVisual .rack-block, #rackZero');
      await page.locator('#rackVisual').scrollIntoViewIfNeeded();
    }
    await shot(themedPhone, `planner_${palette}_dark_phone`);
    await themedPhone.evaluate(() => window.HomelabTheme.setMode('light'));
    await themedPhone.waitForTimeout(80);
    await shot(themedPhone, `planner_${palette}_light_phone`);
    await shot(themedDesk, `planner_${palette}_desktop`);
    await themedPhone.close();
    await themedDesk.close();
  }
} finally {
  await browser.close();
  app.kill();
  before.kill();
}
console.log('shots done');
