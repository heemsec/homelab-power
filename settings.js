'use strict';
(() => {
const KEY = 'homelab-power-settings-v1';
const THEME = 'homelab-power-theme';
const SAVE_PAUSE = 400;
const $ = id => document.getElementById(id);
const PALETTE = 'homelab-power-palette';
const KNOWN = [KEY, 'homelab-power-v1', 'homelab-power-builds-v1', 'homelab-power-custom-parts-v1', 'homelab-power-corrections-v1', 'homelab-power-profiles-v1', THEME, PALETTE, 'homelab-power-preview-pro', 'homelab-power-pro'];
let saveTimer = 0;
let ready = false;
function num(v, lo, hi, fallback) {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}
function defaults() {
  return {version: 1, currency: 'USD', rate: 0.2, numberFormat: 'auto', theme: 'system', palette: 'homelab', voltageMode: '120', voltage: 120};
}
function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.version === 1) return Object.assign(defaults(), s);
  } catch {}
  const theme = localStorage.getItem(THEME);
  const base = defaults();
  if (theme === 'light' || theme === 'dark') base.theme = theme;
  const palette = localStorage.getItem(PALETTE);
  if (['homelab', 'cyber', 'nordic', 'amber'].includes(palette)) base.palette = palette;
  return base;
}
function paint(s) {
  $('currency').value = s.currency;
  $('rate').value = s.rate;
  $('numberFormat').value = s.numberFormat || 'auto';
  $('voltageMode').value = s.voltageMode || '120';
  $('voltage').value = s.voltage;
  $('voltageField').hidden = s.voltageMode !== 'custom';
  const theme = s.theme || 'system';
  const radio = document.querySelector(`input[name="theme"][value="${theme}"]`) || document.querySelector('input[name="theme"][value="system"]');
  if (radio) radio.checked = true;
  const palette = ['homelab', 'cyber', 'nordic', 'amber'].includes(s.palette) ? s.palette : 'homelab';
  const swatch = document.querySelector(`input[name="palette"][value="${palette}"]`) || document.querySelector('input[name="palette"][value="homelab"]');
  if (swatch) swatch.checked = true;
  paintLocks();
}
function collect() {
  const voltageMode = $('voltageMode').value;
  return {
    version: 1,
    currency: $('currency').value,
    rate: num($('rate').value, 0, 1000, 0.2),
    numberFormat: $('numberFormat').value,
    theme: (document.querySelector('input[name="theme"]:checked') || {}).value || 'system',
    palette: (document.querySelector('input[name="palette"]:checked') || {}).value || 'homelab',
    voltageMode,
    voltage: voltageMode === '120' ? 120 : voltageMode === '230' ? 230 : num($('voltage').value, 50, 480, 120)
  };
}
function hasPro() {
  try {
    if (window.NativeBilling) return localStorage.getItem('homelab-power-pro') === 'true';
    return localStorage.getItem('homelab-power-preview-pro') === 'true' || localStorage.getItem('homelab-power-pro') === 'true';
  } catch { return false; }
}
function paintLocks() {
  const pro = hasPro();
  for (const input of document.querySelectorAll('input[name="palette"][data-pro]')) {
    const card = input.closest('.swatch');
    if (card) card.classList.toggle('is-locked', !pro);
  }
  for (const id of ['backup', 'restoreBtn']) {
    const button = $(id);
    if (!button) continue;
    button.classList.toggle('is-pro-locked', !pro);
    const badge = button.querySelector('.pro-badge');
    if (badge) badge.hidden = pro;
  }
  const choice = (document.querySelector('input[name="palette"]:checked') || {}).value;
  const held = (choice === 'nordic' || choice === 'amber') && !pro;
  $('paletteUpsell').hidden = !held;
  const go = $('proPromptGo');
  if (go) go.textContent = storeMode() ? 'Get Pro' : 'Turn on Preview Pro';
  const intro = $('backupIntro');
  if (intro) intro.textContent = pro
    ? 'The lab saves itself on this device as you go. You can also download a backup file and bring it back any time.'
    : 'The lab saves itself on this device as you go. A file you can download, or bring back later, is part of Pro.';
}
function storeMode() {
  return !!(window.NativeBilling || (window.PowerEntitlement && window.PowerEntitlement.usesStore && window.PowerEntitlement.usesStore()));
}
function openProPrompt() {
  const dialog = $('proPrompt');
  if (dialog && !dialog.open) dialog.showModal();
}
function closeProPrompt() {
  const dialog = $('proPrompt');
  if (dialog && dialog.open) dialog.close();
}
async function acceptProPrompt() {
  closeProPrompt();
  if (storeMode() && window.NativeBilling && window.NativeBilling.purchase) {
    let result;
    try { result = await window.NativeBilling.purchase('pro_unlock'); }
    catch { result = null; }
    if (result && result.pro === true) {
      try { localStorage.setItem('homelab-power-pro', 'true'); } catch {}
      if (window.PowerEntitlement && window.PowerEntitlement.setStore) window.PowerEntitlement.setStore({pro: true, supporter: result.supporter === true});
      window.dispatchEvent(new Event('power:entitlement'));
      $('backupStatus').textContent = 'Pro is on. You can download or restore a file now.';
    }
    return;
  }
  try { localStorage.setItem('homelab-power-preview-pro', 'true'); } catch {}
  if (window.PowerEntitlement && !(window.PowerEntitlement.usesStore && window.PowerEntitlement.usesStore())) window.PowerEntitlement.setPreview(true);
  paintLocks();
  if (window.HomelabTheme) window.HomelabTheme.apply();
  $('backupStatus').textContent = 'Preview Pro is on. You can download or restore a file now.';
}
function applyTheme(theme) {
  if (window.HomelabTheme) window.HomelabTheme.setMode(theme === 'light' || theme === 'dark' ? theme : 'system');
  else {
    const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem(THEME, theme); } catch {}
  }
}
function applyPalette(palette) {
  const choice = ['homelab', 'cyber', 'nordic', 'amber'].includes(palette) ? palette : 'homelab';
  try { localStorage.setItem(PALETTE, choice); } catch {}
  if (window.HomelabTheme) window.HomelabTheme.setPalette(choice);
  paintLocks();
}
function write() {
  saveTimer = 0;
  const s = collect();
  let ok = true;
  try { localStorage.setItem(KEY, JSON.stringify(s)); }
  catch { ok = false; }
  applyTheme(s.theme);
  applyPalette(s.palette);
  $('saveStatus').textContent = ok ? 'Saved on this device.' : 'Couldn\'t save on this device.';
}
function schedule() { if (!ready) return; clearTimeout(saveTimer); saveTimer = setTimeout(write, SAVE_PAUSE); }
function flush() { if (saveTimer) { clearTimeout(saveTimer); write(); } }

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  a.download = name;
  a.click();
}
function backup() {
  if (!hasPro()) { openProPrompt(); return; }
  flush();
  const dump = {app: 'homelab-power', version: 1, exportedAt: new Date().toISOString()};
  for (const key of KNOWN) {
    const value = localStorage.getItem(key);
    if (value != null) dump[key] = value;
  }
  download('homelab-power-backup.json', JSON.stringify(dump, null, 2));
  $('backupStatus').textContent = 'Backup downloaded. It only leaves this device if you send the file somewhere.';
}
const ENTITLEMENT_KEYS = new Set(['homelab-power-pro', 'homelab-power-preview-pro']);
function validate(data) {
  if (!data || data.app !== 'homelab-power' || typeof data !== 'object') return 'This file isn\'t a Homelab Power backup.';
  if (data.version !== 1) return Number(data.version) > 1 ? 'This backup is from a newer copy of the app. This version can\'t open it.' : 'This backup is from an older copy of the app. This version can\'t open it.';
  for (const key of KNOWN) {
    if (data[key] == null) continue;
    if (typeof data[key] !== 'string') return 'That backup looks damaged.';
    if (key !== THEME && key !== PALETTE && key !== 'homelab-power-preview-pro') {
      try { JSON.parse(data[key]); } catch { return 'That backup looks damaged.'; }
    }
  }
  return '';
}
async function restore(file) {
  if (!hasPro()) { openProPrompt(); return; }
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { $('backupStatus').textContent = 'That file isn\'t JSON.'; return; }
  const problem = validate(data);
  if (problem) { $('backupStatus').textContent = problem; return; }
  if (!confirm('Replace the lab, builds, and settings on this device with this file?')) return;
  for (const key of KNOWN) {
    if (ENTITLEMENT_KEYS.has(key)) continue;
    if (data[key] == null) localStorage.removeItem(key);
    else localStorage.setItem(key, data[key]);
  }
  ready = false;
  paint(read());
  ready = true;
  applyTheme(collect().theme);
  applyPalette(collect().palette);
  $('backupStatus').textContent = 'Restored. What was on this device is the file you just picked.';
}
function clearAll() {
  if (!confirm('Erase the lab, builds, and settings on this device? You can\'t undo that here.')) return;
  for (const key of KNOWN) localStorage.removeItem(key);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith('homelab-power-')) localStorage.removeItem(key);
  }
  ready = false;
  paint(defaults());
  ready = true;
  applyTheme('system');
  applyPalette('homelab');
  $('backupStatus').textContent = 'Cleared. A new visit starts from the demo again.';
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', flush);
for (const id of ['currency', 'rate', 'numberFormat', 'voltageMode', 'voltage']) $(id).addEventListener('input', schedule);
for (const id of ['currency', 'numberFormat', 'voltageMode']) $(id).addEventListener('change', schedule);
$('voltageMode').addEventListener('change', () => { $('voltageField').hidden = $('voltageMode').value !== 'custom'; });
for (const radio of document.querySelectorAll('input[name="theme"]')) radio.addEventListener('change', () => { applyTheme(radio.value); schedule(); });
for (const radio of document.querySelectorAll('input[name="palette"]')) radio.addEventListener('change', () => {
  if (radio.dataset.pro === 'true' && !hasPro()) {
    const kept = window.HomelabTheme ? window.HomelabTheme.choice() : 'homelab';
    const back = document.querySelector(`input[name="palette"][value="${kept}"]`) || document.querySelector('input[name="palette"][value="homelab"]');
    if (back) back.checked = true;
    $('paletteUpsell').hidden = false;
    return;
  }
  applyPalette(radio.value);
  schedule();
});
$('aboutVersion').textContent = window.HOMELAB_VERSION || '';
window.addEventListener('power:pro', () => { paintLocks(); if (window.HomelabTheme) window.HomelabTheme.apply(); });
window.addEventListener('power:entitlement', () => { paintLocks(); if (window.HomelabTheme) window.HomelabTheme.apply(); });
$('backup').addEventListener('click', backup);
$('restoreBtn').addEventListener('click', () => { if (!hasPro()) { openProPrompt(); return; } $('restore').click(); });
$('restore').addEventListener('change', () => { const file = $('restore').files[0]; $('restore').value = ''; if (file) restore(file); });
$('proPromptGo').addEventListener('click', acceptProPrompt);
$('proPromptClose').addEventListener('click', closeProPrompt);
$('clearData').addEventListener('click', clearAll);
ready = false;
paint(read());
ready = true;
applyTheme(collect().theme);
applyPalette(collect().palette);
})();
