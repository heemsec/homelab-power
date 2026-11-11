import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const { createRequire } = await import('node:module');
createRequire(import.meta.url)(path.join(root, 'sync-web.js'));

const webPort = 8876;
const wwwPort = 8877;
const WEB = `http://127.0.0.1:${webPort}/`;
const WWW = `http://127.0.0.1:${wwwPort}/`;
const shots = process.env.BILLING_SHOTS || '/opt/cursor/artifacts';
mkdirSync(shots, { recursive: true });

function serve(port, cwd) {
  const child = spawn('python3', ['-m', 'http.server', String(port)], { cwd, stdio: 'ignore' });
  return child;
}
const webServer = serve(webPort, root);
const wwwServer = serve(wwwPort, path.join(root, 'www'));
await Promise.all([once(webServer, 'spawn'), once(wwwServer, 'spawn')]);
await new Promise(r => setTimeout(r, 250));

const prices = { pro_unlock: '$2.99', tip_small: '$0.99', tip_medium: '$2.99', tip_large: '$4.99' };
let checks = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); console.log('ok', m); checks++; };
const ok = (v, m) => { if (!v) throw Error(m); console.log('ok', m); checks++; };

function mock(init) {
  window.__billing = { state: init.state, purchaseResult: null, restoreState: null, failGet: !!init.failGet, calls: [], listeners: [] };
  window.__emit = s => { window.__billing.state = s; window.__billing.listeners.forEach(f => f(s)); };
  window.NativeBilling = {
    getState: async () => { if (window.__billing.failGet) throw Error('PlayBilling not implemented'); return { ...window.__billing.state }; },
    purchase: async id => { window.__billing.calls.push(id); const r = window.__billing.purchaseResult; if (r instanceof Error) throw r; if (r && r.status) window.__billing.state = { ...r }; return r; },
    restore: async () => { window.__billing.calls.push('restore'); const s = window.__billing.restoreState || window.__billing.state; window.__billing.state = s; return { ...s }; },
    onUpdate: fn => { window.__billing.listeners.push(fn); return { remove() {} }; }
  };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const open = async (url, init, opts = {}) => {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 390, height: 844 },
    deviceScaleFactor: opts.scale || 2,
    colorScheme: opts.scheme || 'dark',
    isMobile: !!opts.mobile
  });
  if (init) await ctx.addInitScript(mock, init);
  if (opts.storage) await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, opts.storage);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  if (opts.wait === 'settings') await p.waitForSelector('#supportTitle', { state: 'attached' });
  else if (opts.wait === 'planner') await p.waitForSelector('#rackTitle');
  else await p.waitForFunction(() => !!window.PowerApp);
  await p.waitForTimeout(200);
  return { ctx, p };
};
const visible = (p, s) => p.locator(s).isVisible();
const text = (p, s) => p.locator(s).innerText();
const flat = async (p, s) => (await p.locator(s).innerText()).replace(/\s+/g, ' ').trim();
const hasProNow = p => p.evaluate(() => window.PowerEntitlement.hasPro() === true);
const toast = p => p.locator('#toast').innerText();
const proOpen = p => p.locator('#profileSelect').isVisible();
const quiet = p => p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.style.display = 'none'; });

try {
  let { ctx, p } = await open(WEB, null, { viewport: { width: 1280, height: 900 }, scale: 1 });
  eq(await p.locator('#billingBar').count(), 0, 'web: no billing bar');
  eq(await visible(p, '#previewPro'), true, 'web: preview toggle shown');
  eq(await p.evaluate(() => typeof window.PowerBilling), 'undefined', 'web: billing-ui not loaded');
  await p.locator('#previewPro').check();
  eq(await proOpen(p), true, 'web: preview still unlocks');
  await ctx.close();

  ({ ctx, p } = await open(`${WEB}settings.html`, null, { viewport: { width: 390, height: 844 }, scale: 2, wait: 'settings' }));
  eq(await p.locator('#billingBar').count(), 0, 'web settings: no billing bar');
  eq(await visible(p, '#supportCard'), false, 'web settings: tip section stays hidden');
  await ctx.close();

  ({ ctx, p } = await open(WWW, null, { viewport: { width: 1280, height: 900 }, scale: 1 }));
  eq(await p.locator('#billingBar').count(), 0, 'www/no bridge: no billing bar');
  eq(await p.evaluate(() => typeof window.PowerBilling), 'object', 'www: billing-ui loaded');
  eq(await visible(p, '#previewPro'), true, 'www/no bridge: preview kept');
  await p.locator('#previewPro').check();
  eq(await proOpen(p), true, 'www/no bridge: preview unlocks');
  await ctx.close();

  ({ ctx, p } = await open(`${WWW}?preview=pro`, { state: { status: 'ready', prices, pro: false, supporter: false } }, { storage: { 'homelab-power-preview-pro': 'true' }, viewport: { width: 390, height: 844 }, scale: 3 }));
  eq(await visible(p, '#previewPro'), false, 'native: preview toggle hidden');
  eq(await proOpen(p), false, 'native: old preview flag ignored');
  eq(await flat(p, '#buyPro'), 'Get Pro $2.99', 'native: localized pro price');
  eq(await p.locator('#profileCard #tip_small').count(), 0, 'pro card has no tip buttons');
  eq(await visible(p, '#restorePurchases'), true, 'native: restore button');
  eq(await p.locator('#buyPro').isEnabled(), true, 'native: buy enabled');
  ok((await text(p, '#billingStatus')).includes('Pay once'), 'native: status copy');
  eq(((await text(p, '#profileCard')).match(/stays free/gi) || []).length, 1, 'calculator stays free is said once');
  ok(!(await text(p, '#profileCard')).includes('testing preview'), 'native: no preview wording in profile card');
  ok((await text(p, '#compareCard')).includes('part of Pro'), 'native: lock copy swapped');
  for (const sel of ['#exportCSV', '#share', '#add', '#rate']) eq(await visible(p, sel), true, 'native: free feature kept ' + sel);
  await quiet(p);
  await p.screenshot({ path: `${shots}/pro_unlock_phone_3x.png` });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no sideways scroll');

  await p.evaluate(() => { window.__billing.purchaseResult = { outcome: 'cancelled', status: 'ready', prices: window.__billing.state.prices, pro: false }; });
  await p.locator('#buyPro').click();
  await p.waitForTimeout(120);
  ok((await toast(p)).includes('Nothing was charged'), 'cancel toast');
  eq(await proOpen(p), false, 'cancel keeps lock');
  eq(await p.evaluate(() => window.__billing.calls), ['pro_unlock'], 'buy asked for pro_unlock');

  await p.evaluate(() => { window.__billing.purchaseResult = { outcome: 'error', reason: 'Couldn’t reach Google Play. Check your connection and try again.', status: 'ready', prices: window.__billing.state.prices }; });
  await p.locator('#buyPro').click();
  await p.waitForTimeout(120);
  ok((await toast(p)).includes('Couldn’t reach Google Play'), 'error toast');
  eq(await proOpen(p), false, 'error keeps lock');
  await p.evaluate(() => { window.__billing.purchaseResult = new Error('bridge died'); });
  await p.locator('#buyPro').click();
  await p.waitForTimeout(120);
  ok((await toast(p)).includes('couldn’t finish'), 'thrown error handled');
  eq(await p.locator('#buyPro').isEnabled(), true, 'buttons re-enabled after error');

  await p.evaluate(() => { window.__billing.purchaseResult = { outcome: 'pending', status: 'ready', prices: window.__billing.state.prices, pro: false, proPending: true }; });
  await p.locator('#buyPro').click();
  await p.waitForTimeout(120);
  ok(/pending/i.test(await toast(p)), 'pending toast');
  eq(await proOpen(p), false, 'pending does not unlock');
  eq(await flat(p, '#buyPro'), 'Payment pending', 'pending label');
  eq(await p.locator('#buyPro').isEnabled(), false, 'pending not re-buyable');
  await p.evaluate(p2 => window.__emit({ status: 'ready', prices: p2, pro: true, supporter: false }), prices);
  await p.waitForTimeout(150);
  eq(await proOpen(p), true, 'completed pending unlocks live');
  eq(await flat(p, '#buyPro'), 'Pro is yours', 'owned label');
  eq(await p.locator('#buyPro').isEnabled(), false, 'owned not buyable');
  await p.locator('#createProfile').click();
  await p.waitForTimeout(80);
  ok((await p.evaluate(() => JSON.parse(localStorage.getItem('homelab-power-profiles-v1')))).profiles.length >= 2, 'pro feature works after purchase');
  await p.evaluate(p2 => window.__emit({ status: 'ready', prices: p2, pro: false, supporter: false }), prices);
  await p.waitForTimeout(150);
  eq(await proOpen(p), false, 'refund relocks');
  eq(await flat(p, '#buyPro'), 'Get Pro $2.99', 'refund re-offers pro');
  ok(await p.evaluate(() => { document.getElementById('showReport').click(); return document.getElementById('printReport').hidden; }), 'report gated after refund');
  await p.evaluate(p2 => { window.__billing.restoreState = { status: 'ready', prices: p2, pro: true, supporter: true }; }, prices);
  await p.locator('#restorePurchases').click();
  await p.waitForTimeout(120);
  ok((await toast(p)).includes('Restored. Pro'), 'restore toast');
  eq(await proOpen(p), true, 'restore unlocks');
  eq(await visible(p, '#supporterBadge'), false, 'no badge entitlement');
  await ctx.close();

  ({ ctx, p } = await open(WWW, { state: { status: 'ready', prices, pro: false } }, { scheme: 'light', viewport: { width: 673, height: 841 }, scale: 2 }));
  eq(await p.locator('#tip_small').count(), 0, 'fold pro card has no tip buttons');
  eq(await flat(p, '#buyPro'), 'Get Pro $2.99', 'fold: pro price on its own line');
  await quiet(p);
  await p.screenshot({ path: `${shots}/pro_unlock_fold_2x.png` });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'fold: no sideways scroll');
  await ctx.close();

  ({ ctx, p } = await open(`${WWW}settings.html`, { state: { status: 'ready', prices, pro: false } }, { wait: 'settings', scheme: 'light', viewport: { width: 673, height: 841 }, scale: 2 }));
  for (const id of ['tip_small', 'tip_medium', 'tip_large']) {
    for (let n = 0; n < 2; n++) {
      await p.evaluate(p2 => { window.__billing.purchaseResult = { outcome: 'purchased', status: 'ready', prices: p2, pro: false }; }, prices);
      await p.locator('#' + id).click();
      await p.waitForTimeout(80);
      ok((await toast(p)).includes('Thanks for the tip'), 'warm thank you');
      eq(await hasProNow(p), false, 'tip never unlocks Pro');
      eq(await p.locator('#' + id).isEnabled(), true, 'tip can be bought again');
    }
  }
  eq(await p.evaluate(() => window.__billing.calls), ['tip_small', 'tip_small', 'tip_medium', 'tip_medium', 'tip_large', 'tip_large'], 'each product bought twice');
  await p.evaluate(p2 => { window.__billing.purchaseResult = { outcome: 'pending', status: 'ready', prices: p2, pro: false, pendingTips: ['tip_small'] }; }, prices);
  await p.locator('#tip_small').click();
  await p.waitForTimeout(80);
  eq(await p.locator('#tip_small').isEnabled(), false, 'pending tip disabled');
  eq(await hasProNow(p), false, 'pending tip stays free');
  await p.evaluate(p2 => window.__emit({ status: 'ready', prices: p2, pro: false }), prices);
  eq(await p.locator('#tip_small').isEnabled(), true, 'completed pending tip becomes repeatable');
  await p.evaluate(p2 => { window.__billing.purchaseResult = { outcome: 'error', reason: 'Your tip is still being confirmed. Try again later.', status: 'ready', prices: p2, pro: false }; }, prices);
  await p.locator('#tip_small').click();
  await p.waitForTimeout(80);
  ok((await toast(p)).includes('still being confirmed'), 'consume error shown calmly');
  eq(await hasProNow(p), false, 'failed tip never grants Pro');
  await p.evaluate(p2 => { window.__billing.purchaseResult = { outcome: 'cancelled', status: 'ready', prices: p2, pro: false }; }, prices);
  await p.locator('#tip_medium').click();
  await p.waitForTimeout(80);
  ok((await toast(p)).includes('Nothing was charged'), 'cancelled tip');
  await p.evaluate(p2 => window.__emit({ status: 'ready', prices: p2, pro: true }), prices);
  await p.waitForTimeout(80);
  eq(await hasProNow(p), true, 'settings hears that Pro was bought');
  await p.evaluate(p2 => { window.__billing.purchaseResult = { outcome: 'purchased', status: 'ready', prices: p2, pro: true }; }, prices);
  await p.locator('#tip_large').click();
  await p.waitForTimeout(80);
  eq(await hasProNow(p), true, 'tip does not revoke Pro');
  await ctx.close();

  ({ ctx, p } = await open(`${WWW}settings.html`, { state: { status: 'ready', prices, pro: false } }, { wait: 'settings', viewport: { width: 390, height: 844 }, scale: 3 }));
  eq(await visible(p, '#supportCard'), true, 'settings: tip section shown on Android');
  eq(await p.locator('#supportCard #buyPro').count(), 0, 'tip section has no Get Pro');
  eq(await flat(p, '#tip_small'), 'Small tip $0.99', 'settings: small tip price');
  eq(await flat(p, '#tip_medium'), 'A little extra $2.99', 'settings: medium tip price');
  eq(await flat(p, '#tip_large'), 'Big thanks $4.99', 'settings: large tip price');
  ok((await text(p, '#supportNote')).includes('keep building'), 'settings: tip copy is warm');
  ok(!(await text(p, '#supportCard')).includes('Pay once'), 'tip section has no pro footer');
  const phoneHeights = await p.locator('#billingTips button').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
  ok(phoneHeights.length === 3 && Math.max(...phoneHeights) - Math.min(...phoneHeights) < 1, 'phone tip buttons match in height');
  await quiet(p);
  await p.screenshot({ path: `${shots}/settings_tips_phone_3x.png` });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'settings phone: no sideways scroll');
  await ctx.close();

  ({ ctx, p } = await open(`${WWW}settings.html`, { state: { status: 'ready', prices, pro: true } }, { wait: 'settings', viewport: { width: 673, height: 841 }, scale: 2, scheme: 'light' }));
  eq(await p.locator('#buyPro').count(), 0, 'settings fold: no Get Pro in the tip section');
  eq(await p.locator('#tip_small').isEnabled(), true, 'settings fold: tip still available after Pro');
  const foldHeights = await p.locator('#billingTips button').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
  ok(foldHeights.length === 3 && Math.max(...foldHeights) - Math.min(...foldHeights) < 1, 'fold tip buttons match in height');
  await quiet(p);
  await p.screenshot({ path: `${shots}/settings_tips_fold_2x.png` });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'settings fold: no sideways scroll');
  await ctx.close();

  ({ ctx, p } = await open(`${WWW}planner.html`, { state: { status: 'ready', prices, pro: false } }, { storage: { 'homelab-power-preview-pro': 'true' }, wait: 'planner' }));
  await p.waitForSelector('#previewPro', { state: 'attached' });
  await p.waitForTimeout(300);
  eq(await visible(p, '#previewPro'), false, 'planner: preview toggle hidden');
  eq(await p.evaluate(() => window.PowerEntitlement.hasPro()), false, 'planner: preview flag does not grant Pro');
  ok((await text(p, '#proUpsell')).includes('calculator'), 'planner: points at Get Pro on the calculator');
  await ctx.close();

  ({ ctx, p } = await open(WWW, { state: { status: 'unavailable', message: 'Google Play billing isn’t available on this device or account.', pro: false, source: 'none', prices: {} } }));
  ok((await text(p, '#billingStatus')).includes('isn’t available'), 'unavailable message');
  eq(await p.locator('#buyPro').isEnabled(), false, 'unavailable: buy off');
  eq(await p.locator('#tip_small').count(), 0, 'unavailable calculator has no tip button');
  eq(await p.locator('#restorePurchases').isEnabled(), true, 'unavailable: restore can retry');
  eq(await proOpen(p), false, 'unavailable: locked');
  await p.locator('#rate').fill('0.5');
  await p.locator('#rate').blur();
  ok((await text(p, '#totals')).length > 10, 'unavailable: calculator still works');
  await ctx.close();

  ({ ctx, p } = await open(WWW, { state: { status: 'unavailable', message: 'Couldn’t reach Google Play. Check your connection and try again.', pro: true, source: 'cache', prices: {} } }));
  eq(await proOpen(p), true, 'cached Play state keeps Pro offline');
  ok((await text(p, '#billingStatus')).includes('last time'), 'cache explained');
  await ctx.close();

  ({ ctx, p } = await open(WWW, { failGet: true, state: {} }));
  ok((await text(p, '#billingStatus')).includes('isn’t available'), 'missing plugin explained');
  eq(await proOpen(p), false, 'missing plugin locked');
  eq(await p.locator('#buyPro').isEnabled(), false, 'missing plugin buy off');
  await ctx.close();

  ({ ctx, p } = await open(WWW, { state: { status: 'ready', prices: {}, pro: false } }));
  eq(await flat(p, '#buyPro'), 'Get Pro', 'no price shown when product missing');
  eq(await p.locator('#buyPro').isEnabled(), false, 'missing product not buyable');
  ok((await text(p, '#billingStatus')).includes('isn’t on sale'), 'missing product explained');
  await ctx.close();
  ({ ctx, p } = await open(`${WWW}settings.html`, { state: { status: 'ready', prices: {}, pro: false } }, { wait: 'settings' }));
  for (const id of ['tip_small', 'tip_medium', 'tip_large']) eq(await p.locator('#' + id).isEnabled(), false, 'missing tip disabled ' + id);
  await ctx.close();
  ({ ctx, p } = await open(`${WWW}settings.html`, { state: { status: 'unavailable', message: 'Google Play billing isn’t available on this device or account.', pro: false, prices: {} } }, { wait: 'settings' }));
  eq(await p.locator('#tip_small').isEnabled(), false, 'unavailable: tip off');
  await ctx.close();

  ({ ctx, p } = await open(WWW, { state: { status: 'connecting' } }));
  ok((await text(p, '#billingStatus')).includes('Checking Google Play'), 'connecting shown');
  await p.evaluate(p2 => window.__emit({ status: 'ready', prices: p2, pro: false }), prices);
  await p.waitForTimeout(80);
  eq(await flat(p, '#buyPro'), 'Get Pro $2.99', 'ready after connecting');
  await ctx.close();

  eq(errors, [], 'zero console or runtime errors');
  console.log(`PASS ${checks} billing browser checks`);
} finally {
  await browser.close();
  webServer.kill();
  wwwServer.kill();
}
