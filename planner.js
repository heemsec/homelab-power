'use strict';
(() => {
const E = window.PowerEntitlement;
const $ = id => document.getElementById(id);
const BUILD_KEY = 'homelab-power-builds-v1';
const CUSTOM_KEY = 'homelab-power-custom-parts-v1';
const CALC_KEY = 'homelab-power-v1';
const PREVIEW = 'homelab-power-preview-pro';
const SAVE_PAUSE = 400;
const HEIGHTS = [6, 8, 9, 12, 18, 24, 42];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => `b${Math.random().toString(36).slice(2, 10)}`;
const roundU = u => Math.round(Number(u) * 2) / 2;
function num(v, lo, hi, fallback) {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
function locale() {
  try {
    const s = JSON.parse(localStorage.getItem('homelab-power-settings-v1') || 'null');
    if (s?.numberFormat === 'us') return 'en-US';
    if (s?.numberFormat === 'eu') return 'de-DE';
  } catch {}
  return undefined;
}
const fmt = (v, d = 2) => new Intl.NumberFormat(locale(), {maximumFractionDigits: d}).format(v);
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = 'none'; }, 4200);
}

let parts = [], presets = [], custom = [], book, saveTimer = 0, catalogLimit = 40;

function pro() { return E.hasPro(); }
function allParts() { return parts.concat(custom); }
function partById(id) { return allParts().find(p => p.id === id); }
function active() { return book.builds.find(b => b.id === book.activeId) || book.builds[0]; }

function emptyBuild(name = 'My build') {
  return {id: uid(), name, width: 10, heightU: 8, items: []};
}
function loadBook() {
  try {
    const raw = JSON.parse(localStorage.getItem(BUILD_KEY) || 'null');
    if (raw && raw.version === 1 && Array.isArray(raw.builds) && raw.builds.length) {
      book = raw;
      if (!book.builds.some(b => b.id === book.activeId)) book.activeId = book.builds[0].id;
      return;
    }
  } catch {}
  const first = emptyBuild();
  book = {version: 1, activeId: first.id, builds: [first]};
}
function loadCustom() {
  try { custom = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); if (!Array.isArray(custom)) custom = []; }
  catch { custom = []; }
}
function writeBook() {
  saveTimer = 0;
  try { localStorage.setItem(BUILD_KEY, JSON.stringify(book)); }
  catch { toast('Couldn\'t save this build on the device. It\'s still on screen.'); }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(writeBook, SAVE_PAUSE); }
function flushSave() { if (saveTimer) { clearTimeout(saveTimer); writeBook(); } }

function stepOf(width) { return width === 10 ? 0.5 : 1; }
function unitsOf(item, width) {
  const p = partById(item.partId);
  let u = Number(p?.rackUnits) || 1;
  if (width === 10) u = Math.max(0.5, roundU(u));
  else u = Math.max(1, Math.ceil(u));
  return roundU(u * (item.qty || 1));
}
function defaultPlacement(part, width) {
  if (!part) return 'shelf';
  if (part.category === 'rack') return 'frame';
  const u = Number(part.rackUnits) || 0;
  if (u <= 0) return 'shelf';
  const ff = String(part.formFactor || '').toLowerCase();
  if (!/rack|\du|0\.5u/.test(ff)) return 'shelf';
  if (part.rackWidth === 19 && width === 10) return 'shelf';
  return 'rack';
}
function oneWatts(item) {
  const p = partById(item.partId);
  const idle = item.idleOverride == null ? (Number(p?.idleW) || 0) : item.idleOverride;
  const typical = item.typicalOverride == null ? (Number(p?.typicalW) || 0) : item.typicalOverride;
  return {idle, typical};
}
function totals(build) {
  return (build?.items || []).reduce((a, it) => {
    const w = oneWatts(it);
    const q = it.qty || 1;
    a.idle += w.idle * q;
    a.typical += w.typical * q;
    return a;
  }, {idle: 0, typical: 0});
}
function layout(build) {
  const step = stepOf(build.width);
  const occ = new Set();
  const key = u => Math.round(u * 2);
  const span = (start, units) => { const ks = []; for (let u = start; u < start + units - 1e-6; u += step) ks.push(key(u)); return ks; };
  const fits = (start, units) => start >= -1e-9 && start + units <= build.heightU + 1e-6 && span(start, units).every(k => !occ.has(k));
  const take = (start, units) => span(start, units).forEach(k => occ.add(k));
  const rack = build.items.filter(it => it.placement === 'rack');
  const pending = [];
  for (const it of rack) {
    it.units = unitsOf(it, build.width);
    if (Number.isFinite(it.startU) && fits(it.startU, it.units)) { take(it.startU, it.units); it.overflow = false; }
    else pending.push(it);
  }
  for (const it of pending) {
    it.units = unitsOf(it, build.width);
    let placed = false;
    for (let s = 0; s <= build.heightU - it.units + 1e-6; s += step) {
      if (fits(s, it.units)) { it.startU = roundU(s); take(s, it.units); it.overflow = false; placed = true; break; }
    }
    if (!placed) { it.startU = null; it.overflow = true; }
  }
  return rack.some(it => it.overflow);
}

function badge(part) {
  if (part?.custom) return 'Yours';
  if (part?.confidence === 'measured') return 'Measured';
  if (part?.confidence === 'spec') return 'From a spec';
  return 'Estimate';
}
function labelOf(part, item) {
  if (!part) return item?.partId || 'Missing part';
  return `${part.brand ? part.brand + ' ' : ''}${part.model}`;
}

function readControls(build) {
  build.width = $('rackWidth19').checked ? 19 : 10;
  const h = $('rackHeight').value;
  if (h === 'custom') build.heightU = num($('rackHeightCustom').value, 1, 52, build.heightU || 8);
  else build.heightU = Number(h);
  build.name = $('buildName').value.trim().slice(0, 60) || 'My build';
}

function paintControls(build) {
  $('rackWidth10').checked = build.width !== 19;
  $('rackWidth19').checked = build.width === 19;
  if (HEIGHTS.includes(build.heightU)) { $('rackHeight').value = String(build.heightU); $('rackHeightCustomField').hidden = true; }
  else { $('rackHeight').value = 'custom'; $('rackHeightCustomField').hidden = false; $('rackHeightCustom').value = build.heightU; }
  $('buildName').value = build.name;
}

function renderTotals(build) {
  const t = totals(build);
  $('idleTotal').textContent = `${fmt(t.idle)} W`;
  $('idleTotal').dataset.w = String(t.idle);
  $('typicalTotal').textContent = `${fmt(t.typical)} W`;
  $('typicalTotal').dataset.w = String(t.typical);
  const over = layout(build);
  const wide = build.items.filter(it => it.placement === 'rack' && partById(it.partId)?.rackWidth === 19 && build.width === 10);
  const bits = [];
  if (over) bits.push('Some rack parts don\'t fit this height. Move one to the shelf, or pick a taller rack.');
  if (wide.length) bits.push('A 19 inch part won\'t sit in a 10 inch rack. It\'s listed with the shelf gear.');
  $('fitWarning').hidden = !bits.length;
  $('fitWarning').textContent = bits.join(' ');
}

function itemButtons(it) {
  const name = labelOf(partById(it.partId), it);
  const inRack = it.placement === 'rack' && !it.overflow;
  if (it.placement === 'frame') return `<div class="part-actions"><button type="button" class="quiet" data-act="remove" data-uid="${it.uid}" aria-label="Remove ${esc(name)}">Remove</button></div>`;
  return `<div class="part-actions">
    ${inRack ? `<button type="button" data-act="up" data-uid="${it.uid}">Up</button><button type="button" data-act="down" data-uid="${it.uid}">Down</button>` : ''}
    ${it.placement === 'shelf' ? `<button type="button" data-act="rack" data-uid="${it.uid}">Into the rack</button>` : `<button type="button" class="secondary" data-act="shelf" data-uid="${it.uid}">On the shelf</button>`}
    <button type="button" class="quiet" data-act="remove" data-uid="${it.uid}" aria-label="Remove ${esc(name)}">Remove</button>
  </div>`;
}
function wattFields(it) {
  const w = oneWatts(it);
  return `<label>Idle W<input data-uid="${it.uid}" data-field="idle" type="text" inputmode="decimal" value="${it.idleOverride == null ? w.idle : it.idleOverride}" aria-label="Idle watts override"></label>
    <label>Typical W<input data-uid="${it.uid}" data-field="typical" type="text" inputmode="decimal" value="${it.typicalOverride == null ? w.typical : it.typicalOverride}" aria-label="Typical watts override"></label>`;
}
function renderRack(build) {
  const step = stepOf(build.width);
  const rowH = 30;
  const rows = Math.max(1, Math.round(build.heightU / step));
  const heightPx = rows * rowH;
  const slots = [];
  for (let i = rows - 1; i >= 0; i--) {
    const u = roundU((i + 1) * step);
    slots.push(`<div class="rack-row" data-u="${roundU(i * step)}"><span>U${u}</span></div>`);
  }
  const blocks = build.items.filter(it => it.placement === 'rack' && !it.overflow && Number.isFinite(it.startU)).map(it => {
    const p = partById(it.partId);
    const top = (it.startU / step) * rowH;
    const h = Math.max(rowH, (it.units / step) * rowH - 4);
    return `<article class="rack-block" draggable="true" data-drag="item:${it.uid}" style="bottom:${top + 2}px;height:${Math.max(16, h - 4)}px" aria-label="${esc(labelOf(p, it))}, ${it.units}U"><b>${esc(labelOf(p, it))}${it.qty > 1 ? ' ×' + it.qty : ''}</b></article>`;
  }).join('');
  $('rackVisual').innerHTML = `<div class="rack-frame" id="rackDrop" style="height:${heightPx}px">${slots.join('')}${blocks}</div>`;
  const frames = build.items.filter(it => it.placement === 'frame');
  $('frameNote').textContent = frames.length ? `${frames.map(it => labelOf(partById(it.partId), it)).join(', ')} is the rack, so it doesn't use a U.` : `${build.heightU}U, ${build.width} inch. U1 sits at the bottom.`;
}
function whereText(it) {
  if (it.placement === 'frame') return 'The rack itself';
  if (it.overflow) return 'No free slot';
  if (it.placement === 'shelf') return 'On a shelf';
  return `In the rack at ${it.startU}U`;
}
function renderItems(build) {
  const items = build.items;
  $('itemList').innerHTML = items.length ? items.map(it => {
    const p = partById(it.partId);
    const w = oneWatts(it);
    return `<article class="shelf-item" draggable="true" data-drag="item:${it.uid}">
      <div><b>${esc(labelOf(p, it))}${it.qty > 1 ? ' ×' + it.qty : ''}</b>
      <div class="part-meta">${whereText(it)}. ${fmt(w.idle * (it.qty || 1))} W idle, ${fmt(w.typical * (it.qty || 1))} W typical. <span class="badge">${esc(badge(p))}</span>
      ${p?.source ? `<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Source</a>` : ''}</div>
      <div class="settings-grid">${wattFields(it)}</div></div>
      ${itemButtons(it)}
    </article>`;
  }).join('') : '<p class="help">Nothing in this build yet. Add a part from the list, or load a starter.</p>';
}
function renderCatalog() {
  const q = $('partSearch').value.trim().toLowerCase();
  const cat = $('partCategory').value;
  const list = allParts().filter(p => (cat === 'all' || p.category === cat) && (!q || `${p.brand} ${p.model} ${p.category} ${p.formFactor}`.toLowerCase().includes(q)))
    .sort((a, b) => (a.popularity || 9) - (b.popularity || 9) || String(a.brand).localeCompare(String(b.brand)));
  const shown = list.slice(0, catalogLimit);
  $('catalog').innerHTML = shown.map(p => `<article class="part-row" draggable="true" data-drag="part:${p.id}">
    <div><b>${esc(p.brand)} ${esc(p.model)}</b>
    <div class="part-meta">${fmt(p.idleW)} W idle, ${fmt(p.typicalW)} W typical <span class="badge">${esc(badge(p))}</span>
    ${p.source ? `<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Source</a>` : ''}
    ${p.includesDrives ? '<span>Typical watts already include the drives.</span>' : ''}</div></div>
    <div class="part-actions"><button type="button" data-add="${esc(p.id)}" data-where="rack">Add to rack</button><button type="button" class="secondary" data-add="${esc(p.id)}" data-where="shelf">Shelf</button></div>
  </article>`).join('') || '<p class="help">No parts match that.</p>';
  $('catalogMore').hidden = list.length <= catalogLimit;
  $('catalogMore').textContent = `Show more (${list.length - shown.length} left)`;
}
function renderBuilds() {
  const sel = $('buildSelect');
  const prev = sel.value;
  sel.innerHTML = book.builds.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
  sel.value = book.builds.some(b => b.id === prev) && prev ? prev : book.activeId;
  $('buildNote').textContent = pro() ? `${book.builds.length} saved on this device.` : 'The free planner keeps one build. Pro keeps as many as you want.';
  const fill = id => { $(id).innerHTML = book.builds.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join(''); };
  fill('compareA'); fill('compareB');
  if (book.builds[1]) $('compareB').value = book.builds[1].id;
}
function renderCompare() {
  if (!pro()) { $('comparison').innerHTML = ''; return; }
  const a = book.builds.find(b => b.id === $('compareA').value) || book.builds[0];
  const b = book.builds.find(b => b.id === $('compareB').value) || book.builds[1] || book.builds[0];
  if (!a || !b) { $('comparison').innerHTML = '<p class="help">Save a second build and you can put them next to each other.</p>'; return; }
  const ta = totals(a), tb = totals(b);
  const card = (build, t, lead) => `<article class="comparison-card"><p class="step">${lead}</p><h3>${esc(build.name)}</h3><p>${fmt(t.idle)} W idle</p><strong>${fmt(t.typical)} W typical</strong><p>${build.items.length} parts, ${build.heightU}U ${build.width}"</p></article>`;
  const delta = tb.typical - ta.typical;
  $('comparison').innerHTML = card(a, ta, 'First') + card(b, tb, 'Second') + `<p class="help">The second build is ${fmt(Math.abs(delta))} W ${delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'the same'} on typical watts.</p>`;
}
function renderPro() {
  const on = pro();
  $('previewPro').checked = E.isPreview();
  $('proUpsell').hidden = on;
  $('proTools').hidden = !on;
  if (on) renderCompare();
}
function render() {
  const build = active();
  paintControls(build);
  renderTotals(build);
  renderRack(build);
  renderItems(build);
  renderCatalog();
  renderBuilds();
  renderPro();
}

function addPart(id, where) {
  const build = active();
  const part = partById(id);
  if (!part) return;
  let placement = where === 'shelf' ? 'shelf' : defaultPlacement(part, build.width);
  if (where === 'rack' && placement === 'frame') placement = 'frame';
  if (where === 'rack' && part.rackWidth === 19 && build.width === 10) placement = 'shelf';
  build.items.push({uid: uid(), partId: id, qty: 1, placement, startU: null, idleOverride: null, typicalOverride: null});
  scheduleSave();
  render();
}
function findItem(id) { return active().items.find(it => it.uid === id); }
function nudge(item, dir) {
  const build = active();
  const step = stepOf(build.width);
  if (!Number.isFinite(item.startU)) return;
  item.startU = roundU(item.startU + dir * step);
  scheduleSave();
  render();
}

function applyPreset(preset) {
  const build = active();
  if (build.items.length && !confirm(`Replace “${build.name}” with ${preset.name}?`)) return;
  const frame = preset.items.map(it => partById(it.partId)).find(p => p && p.category === 'rack');
  build.width = frame?.rackWidth === 19 ? 19 : 10;
  build.heightU = frame?.rackUnits && HEIGHTS.includes(frame.rackUnits) ? frame.rackUnits : (frame?.rackUnits || build.heightU);
  build.name = preset.name;
  build.items = preset.items.map(it => {
    const part = partById(it.partId);
    return {uid: uid(), partId: it.partId, qty: it.qty || 1, placement: defaultPlacement(part, build.width), startU: null, idleOverride: null, typicalOverride: null};
  });
  scheduleSave();
  render();
  toast(`${preset.name} is loaded. Watts are still a starting point.`);
}

function sendToCalculator() {
  flushSave();
  const build = active();
  let calc = null;
  try { calc = JSON.parse(localStorage.getItem(CALC_KEY) || 'null'); } catch {}
  if (!calc || calc.version !== 1) {
    calc = {version:1,region:null,currency:'USD',rate:.2,tou:false,offRate:.15,peakRate:.35,peakStart:16,peakEnd:21,offStart:0,offEnd:7,consolidateWatts:55,replacementWatts:25,price:350,voltageMode:build.width===19?'230':'120',voltage:build.width===19?230:120,breaker:build.width===19?16:15,devices:[]};
  }
  calc.devices = build.items.map(it => {
    const p = partById(it.partId);
    const w = oneWatts(it);
    const devices = [];
    for (let i = 0; i < (it.qty || 1); i++) {
      devices.push({id: uid(), name: labelOf(p, it).slice(0, 100), idle: w.idle, load: Math.max(w.idle, w.typical), loadPct: 100, hours: 24, start: 0, selected: true});
    }
    return devices;
  }).flat();
  try { localStorage.setItem(CALC_KEY, JSON.stringify(calc)); }
  catch { toast('Couldn\'t hand this to the calculator. The build is still saved here.'); return; }
  location.href = 'index.html';
}

function exportCsv() {
  if (!pro()) return;
  const build = active();
  const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['Part','Qty','Where','Start U','Idle W','Typical W','Confidence','Source']];
  for (const it of build.items) {
    const p = partById(it.partId) || {};
    const w = oneWatts(it);
    lines.push([labelOf(p, it), it.qty || 1, it.placement, it.startU ?? '', w.idle, w.typical, p.confidence || '', p.source || '']);
  }
  const csv = lines.map(r => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'homelab-rack.csv';
  a.click();
}
function exportPng() {
  if (!pro()) return;
  const build = active();
  const step = stepOf(build.width);
  const row = 36;
  const rows = Math.max(1, Math.round(build.heightU / step));
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = rows * row + 90;
  const g = canvas.getContext('2d');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0b1215';
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#eff7f6';
  g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = ink; g.font = '28px sans-serif';
  g.fillText(build.name || 'Rack', 28, 46);
  const t = totals(build);
  g.font = '16px sans-serif';
  g.fillText(`${fmt(t.idle)} W idle, ${fmt(t.typical)} W typical`, 28, 74);
  const top = 90;
  g.strokeStyle = '#77c8c6';
  for (let i = 0; i < rows; i++) {
    g.strokeRect(24, top + i * row, 852, row);
    g.fillStyle = ink; g.font = '12px sans-serif';
    g.fillText('U' + roundU((rows - i) * step), 30, top + i * row + 22);
  }
  for (const it of build.items.filter(x => x.placement === 'rack' && !x.overflow && Number.isFinite(x.startU))) {
    const p = partById(it.partId);
    const y = top + (rows - (it.startU + it.units) / step) * row;
    const h = (it.units / step) * row;
    g.fillStyle = '#1c3324'; g.fillRect(80, y + 2, 780, h - 4);
    g.fillStyle = ink; g.font = '14px sans-serif';
    g.fillText(labelOf(p, it), 90, y + Math.min(22, h - 6));
  }
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'homelab-rack.png';
    a.click();
  });
}

function wire() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', flushSave);
  for (const id of ['rackWidth10', 'rackWidth19']) $(id).addEventListener('change', () => { readControls(active()); scheduleSave(); render(); });
  $('rackHeight').addEventListener('change', () => { readControls(active()); scheduleSave(); render(); });
  $('rackHeightCustom').addEventListener('input', () => { readControls(active()); scheduleSave(); renderTotals(active()); renderRack(active()); });
  $('buildName').addEventListener('input', () => { active().name = $('buildName').value.slice(0, 60); scheduleSave(); });
  $('buildSelect').addEventListener('change', () => { book.activeId = $('buildSelect').value; scheduleSave(); render(); });
  $('newBuild').addEventListener('click', () => {
    if (!pro() && book.builds.length >= 1) { $('proUpsell').hidden = false; toast('One saved build is free. Preview Pro if you want another.'); return; }
    const b = emptyBuild('Another build');
    book.builds.push(b); book.activeId = b.id; scheduleSave(); render();
  });
  $('loadPreset').addEventListener('click', () => {
    const preset = presets.find(p => p.id === $('presetSelect').value);
    if (preset) applyPreset(preset);
  });
  $('presetSelect').addEventListener('change', () => {
    const preset = presets.find(p => p.id === $('presetSelect').value);
    $('presetBlurb').textContent = preset ? (preset.description || '') : '';
  });
  $('partSearch').addEventListener('input', () => { catalogLimit = 40; renderCatalog(); });
  $('partCategory').addEventListener('change', () => { catalogLimit = 40; renderCatalog(); });
  $('catalogMore').addEventListener('click', () => { catalogLimit += 40; renderCatalog(); });
  $('sendCalc').addEventListener('click', sendToCalculator);
  $('previewPro').addEventListener('change', () => {
    E.setPreview($('previewPro').checked);
    try { localStorage.setItem(PREVIEW, String(E.isPreview())); } catch {}
    renderPro(); renderBuilds();
  });
  $('compareA').addEventListener('change', renderCompare);
  $('compareB').addEventListener('change', renderCompare);
  $('exportCsv').addEventListener('click', exportCsv);
  $('exportPng').addEventListener('click', exportPng);
  $('customPartForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!pro()) { toast('Your own parts are a Pro extra.'); return; }
    const where = $('customWhere').value;
    const part = {id: uid(), custom: true, brand: '', model: $('customName').value.trim().slice(0, 80) || 'Custom part', category: 'custom', formFactor: where === 'shelf' ? 'shelf' : '1U rack', rackUnits: where === 'shelf' ? 0 : num($('customU').value, 0.5, 20, 1), rackWidth: where === '19' ? 19 : 10, idleW: num($('customIdle').value, 0, 100000, 0), typicalW: num($('customTypical').value, 0, 100000, 0), confidence: 'estimate', source: '', notes: 'Added on this device.', popularity: 3};
    custom.push(part);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch { toast('Couldn\'t save that part on this device.'); return; }
    $('customName').value = '';
    renderCatalog();
    toast('Added. It\'ll be in the list next time too.');
  });
  document.body.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { addPart(add.dataset.add, add.dataset.where); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const item = findItem(act.dataset.uid);
    if (!item) return;
    if (act.dataset.act === 'remove') active().items = active().items.filter(it => it !== item);
    else if (act.dataset.act === 'shelf') { item.placement = 'shelf'; item.startU = null; }
    else if (act.dataset.act === 'rack') { item.placement = defaultPlacement(partById(item.partId), active().width) === 'frame' ? 'frame' : 'rack'; item.startU = null; }
    else if (act.dataset.act === 'up') nudge(item, 1);
    else if (act.dataset.act === 'down') nudge(item, -1);
    scheduleSave();
    render();
  });
  document.body.addEventListener('input', e => {
    const field = e.target.dataset?.field;
    if (!field) return;
    const item = findItem(e.target.dataset.uid);
    if (!item) return;
    const raw = e.target.value.trim();
    item[field === 'idle' ? 'idleOverride' : 'typicalOverride'] = raw === '' ? null : num(raw, 0, 100000, 0);
    scheduleSave();
    renderTotals(active());
  });
  document.body.addEventListener('dragstart', e => {
    const el = e.target.closest('[data-drag]');
    if (!el) return;
    e.dataTransfer.setData('text/plain', el.dataset.drag);
    e.dataTransfer.effectAllowed = 'copyMove';
  });
  const allow = e => { if (e.target.closest('#rackDrop, #itemList')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } };
  document.addEventListener('dragover', allow);
  document.addEventListener('drop', e => {
    const rack = e.target.closest('#rackDrop');
    const shelf = e.target.closest('#itemList');
    if (!rack && !shelf) return;
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (data.startsWith('part:')) addPart(data.slice(5), rack ? 'rack' : 'shelf');
    else if (data.startsWith('item:')) {
      const item = findItem(data.slice(5));
      if (!item) return;
      if (shelf) { item.placement = 'shelf'; item.startU = null; }
      else {
        item.placement = 'rack';
        const slot = e.target.closest('[data-u]');
        item.startU = slot ? Number(slot.dataset.u) : null;
      }
      scheduleSave();
      render();
    }
  });
}

async function boot() {
  try { E.setPreview(localStorage.getItem(PREVIEW) === 'true'); } catch {}
  try {
    const [p, r] = await Promise.all([fetch('data/parts.json'), fetch('data/presets.json')]);
    if (!p.ok || !r.ok) throw Error('missing');
    parts = await p.json();
    presets = await r.json();
  } catch {
    $('catalog').innerHTML = '<p class="help">Couldn\'t load the parts list. Open this page online once and it stays on the device after that.</p>';
    return;
  }
  loadBook();
  loadCustom();
  const cats = [...new Set(allParts().map(p => p.category))].sort();
  $('partCategory').innerHTML += cats.map(c => `<option value="${esc(c)}">${esc(c.replace(/-/g, ' '))}</option>`).join('');
  $('presetSelect').innerHTML = presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('presetBlurb').textContent = presets[0]?.description || '';
  wire();
  render();
}
boot();
})();
