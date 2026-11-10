'use strict';
(() => {
const E = window.PowerEntitlement;
const M = window.PowerMath;
const $ = id => document.getElementById(id);
const BUILD_KEY = 'homelab-power-builds-v1';
const CUSTOM_KEY = 'homelab-power-custom-parts-v1';
const CORR_KEY = 'homelab-power-corrections-v1';
const CALC_KEY = 'homelab-power-v1';
const SETTINGS_KEY = 'homelab-power-settings-v1';
const PREVIEW = 'homelab-power-preview-pro';
const SAVE_PAUSE = 400;
const HEIGHTS = [6, 8, 9, 12, 18, 24, 42];
/* Filenames stay generic so a later accuracy pass can swap the JSON files. */
const DATA_FILES = {parts: 'data/parts.json', presets: 'data/presets.json'};
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
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s?.numberFormat === 'us') return 'en-US';
    if (s?.numberFormat === 'eu') return 'de-DE';
  } catch {}
  return undefined;
}
const fmt = (v, d = 2) => new Intl.NumberFormat(locale(), {maximumFractionDigits: d, minimumFractionDigits: d === 1 ? 1 : 0}).format(Number(v) || 0);
const wattsText = v => `${fmt(v, 1)} W`;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = 'none'; }, 4200);
}

let parts = [], presets = [], custom = [], corrections = {version: 1, parts: {}}, book, saveTimer = 0, catalogLimit = 40, editingId = null;

function pro() { return E.hasPro(); }
function rawPart(id) { return parts.concat(custom).find(p => p.id === id) || null; }
function partById(id) {
  const part = rawPart(id);
  if (!part) return null;
  const patch = corrections.parts[id];
  if (!patch) return part;
  return Object.assign({}, part, patch, {edited: true});
}
function allParts() { return parts.concat(custom).map(p => partById(p.id)); }
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
function loadCorrections() {
  try {
    const raw = JSON.parse(localStorage.getItem(CORR_KEY) || 'null');
    if (raw && raw.version === 1 && raw.parts && typeof raw.parts === 'object') corrections = raw;
  } catch { corrections = {version: 1, parts: {}}; }
}
function writeCorrections() {
  try { localStorage.setItem(CORR_KEY, JSON.stringify(corrections)); }
  catch { toast('Couldn\'t save that correction on this device.'); }
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
  let u = Number(p?.rackUnits);
  if (!Number.isFinite(u)) u = 1;
  if (u <= 0) return 0;
  if (width === 10) u = Math.max(0.5, roundU(u));
  else u = Math.max(1, Math.ceil(u));
  return roundU(u * (item.qty || 1));
}
function isRackShelf(part) {
  if (!part || part.category !== 'accessory') return false;
  const units = Number(part.rackUnits);
  if (!Number.isFinite(units) || units <= 0) return false;
  return /shelf/i.test(part.model || '');
}
function isShelfRider(part) {
  return !!(part && part.category === 'mini-pc' && /shelf/i.test(part.formFactor || '') && !isRackShelf(part));
}
function isZeroUFan(part) {
  if (!part || part.category !== 'fan') return false;
  const units = Number(part.rackUnits);
  return (!Number.isFinite(units) || units <= 0) && /top|rear|side|0u/i.test(part.formFactor || '');
}
function defaultPlacement(part, width) {
  if (!part) return 'shelf';
  if (part.category === 'rack') return 'frame';
  if (isZeroUFan(part)) return 'zerou';
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
function assignHosts(build) {
  for (const it of build.items) { it.hostedBy = null; it.hosts = null; }
  const shelves = build.items.filter(it => it.placement === 'rack' && isRackShelf(partById(it.partId)));
  const riders = build.items.filter(it => isShelfRider(partById(it.partId)) && !it.ownSlot && it.placement !== 'frame' && it.placement !== 'zerou');
  riders.forEach((rider, i) => {
    const shelf = shelves[i];
    if (!shelf || shelf.uid === rider.uid) return;
    rider.hostedBy = shelf.uid;
    shelf.hosts = rider.uid;
    rider.overflow = false;
    rider.startU = null;
  });
}
function slotUnits(it, build) {
  if (it.hostedBy || it.placement !== 'rack') return 0;
  const own = unitsOf(it, build.width);
  if (!it.hosts) return own;
  const rider = build.items.find(x => x.uid === it.hosts);
  return Math.max(own, rider ? unitsOf(rider, build.width) : 0);
}
function layout(build) {
  for (const it of build.items) {
    if (isZeroUFan(partById(it.partId))) it.placement = 'zerou';
  }
  assignHosts(build);
  const step = stepOf(build.width);
  const occ = new Set();
  const key = u => Math.round(u * 2);
  const span = (start, units) => { const ks = []; for (let u = start; u < start + units - 1e-6; u += step) ks.push(key(u)); return ks; };
  const fits = (start, units) => units > 0 && start >= -1e-9 && start + units <= build.heightU + 1e-6 && span(start, units).every(k => !occ.has(k));
  const take = (start, units) => span(start, units).forEach(k => occ.add(k));
  const rack = build.items.filter(it => it.placement === 'rack' && !it.hostedBy);
  const pending = [];
  for (const it of rack) {
    it.units = slotUnits(it, build);
    if (it.units <= 0) { it.overflow = false; continue; }
    if (Number.isFinite(it.startU) && fits(it.startU, it.units)) { take(it.startU, it.units); it.overflow = false; }
    else pending.push(it);
  }
  for (const it of pending) {
    it.units = slotUnits(it, build);
    let placed = false;
    for (let s = 0; s <= build.heightU - it.units + 1e-6; s += step) {
      if (fits(s, it.units)) { it.startU = roundU(s); take(s, it.units); it.overflow = false; placed = true; break; }
    }
    if (!placed) { it.startU = null; it.overflow = true; }
  }
  return rack.some(it => it.overflow);
}

function badge(part) {
  if (part?.edited) return 'Edited';
  if (part?.custom) return 'Yours';
  if (part?.confidence === 'measured') return 'Measured';
  if (part?.confidence === 'spec') return 'From a spec';
  return 'Estimate';
}
function labelOf(part, item) {
  if (!part) return item?.partId || 'Missing part';
  if (part.displayName) return part.displayName;
  return `${part.brand ? part.brand + ' ' : ''}${part.model}`;
}
function shortLabel(part, item) {
  if (!part) return labelOf(part, item);
  if (part.displayName) return part.displayName;
  const brand = String(part.brand || '').split('/')[0].trim();
  const model = String(part.model || '').replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
  return `${brand} ${model}`.replace(/\s+/g, ' ').trim() || labelOf(part, item);
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

function currentRate() {
  let rate = 0.2, currency = 'USD', source = 'the starting rate';
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s && Number.isFinite(+s.rate)) { rate = +s.rate; source = 'your default rate'; }
    if (s && s.currency) currency = s.currency;
  } catch {}
  try {
    const c = JSON.parse(localStorage.getItem(CALC_KEY) || 'null');
    if (c && Number.isFinite(+c.rate)) { rate = +c.rate; source = 'the rate on your calculator'; }
    if (c && c.currency) currency = c.currency;
  } catch {}
  return {rate, currency, source};
}
function money(amount, currency) {
  try { return new Intl.NumberFormat(locale(), {style: 'currency', currency, maximumFractionDigits: 2}).format(amount); }
  catch { return new Intl.NumberFormat(locale(), {style: 'currency', currency: 'USD', maximumFractionDigits: 2}).format(amount); }
}

function renderTotals(build) {
  const t = totals(build);
  $('idleTotal').textContent = wattsText(t.idle);
  $('idleTotal').dataset.w = String(t.idle);
  $('typicalTotal').textContent = wattsText(t.typical);
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
  const inRack = it.placement === 'rack' && !it.overflow && !it.hostedBy;
  if (it.placement === 'frame' || it.placement === 'zerou') return `<div class="part-actions"><button type="button" class="quiet" data-act="remove" data-uid="${it.uid}" aria-label="Remove ${esc(name)}">Remove</button></div>`;
  return `<div class="part-actions">
    ${inRack ? `<button type="button" data-act="up" data-uid="${it.uid}">Up</button><button type="button" data-act="down" data-uid="${it.uid}">Down</button>` : ''}
    ${it.placement === 'shelf' || it.hostedBy ? `<button type="button" data-act="rack" data-uid="${it.uid}">Into the rack</button>` : `<button type="button" class="secondary" data-act="shelf" data-uid="${it.uid}">On the shelf</button>`}
    <button type="button" class="quiet" data-act="remove" data-uid="${it.uid}" aria-label="Remove ${esc(name)}">Remove</button>
  </div>`;
}
function wattFields(it) {
  const w = oneWatts(it);
  const idleValue = it.idleOverride == null ? w.idle : it.idleOverride;
  const typicalValue = it.typicalOverride == null ? w.typical : it.typicalOverride;
  return `<label>Idle W<input data-uid="${it.uid}" data-field="idle" type="text" inputmode="decimal" value="${idleValue}" aria-label="Idle watts override"></label>
    <label>Typical W<input data-uid="${it.uid}" data-field="typical" type="text" inputmode="decimal" value="${typicalValue}" aria-label="Typical watts override"></label>`;
}
function renderRack(build) {
  const step = stepOf(build.width);
  const rowH = matchMedia('(max-width: 800px)').matches ? 48 : 30;
  const rows = Math.max(1, Math.round(build.heightU / step));
  const heightPx = rows * rowH;
  const slots = [];
  for (let i = rows - 1; i >= 0; i--) {
    const u = roundU((i + 1) * step);
    slots.push(`<div class="rack-row" data-u="${roundU(i * step)}"><span>U${u}</span></div>`);
  }
  const blocks = build.items.filter(it => it.placement === 'rack' && !it.overflow && !it.hostedBy && Number.isFinite(it.startU) && it.units > 0).map(it => {
    const p = partById(it.partId);
    const rider = it.hosts ? build.items.find(x => x.uid === it.hosts) : null;
    const riderPart = rider ? partById(rider.partId) : null;
    const face = riderPart ? `${shortLabel(p, it)} + ${shortLabel(riderPart, rider)}` : shortLabel(p, it);
    const full = riderPart ? `${labelOf(p, it)} with ${labelOf(riderPart, rider)} on it` : labelOf(p, it);
    const top = (it.startU / step) * rowH;
    const h = Math.max(rowH, (it.units / step) * rowH - 4);
    return `<article class="rack-block" data-drag="item:${it.uid}" style="bottom:${top + 2}px;height:${Math.max(rowH - 6, h - 4)}px" aria-label="${esc(full)}, ${it.units}U" title="${esc(full)}"><b>${esc(face)}${it.qty > 1 ? ' ×' + it.qty : ''}</b></article>`;
  }).join('');
  const fans = build.items.filter(it => it.placement === 'zerou');
  const fanHtml = fans.length ? `<div class="rack-zerou" id="rackZero">${fans.map(it => {
    const p = partById(it.partId);
    const w = oneWatts(it);
    return `<p><span class="badge">0U top / rear</span> <b>${esc(labelOf(p, it))}</b> · ${wattsText(w.idle)} idle, ${wattsText(w.typical)} typical. It bolts to the rack, so it doesn't take a U, and it still counts.</p>`;
  }).join('')}</div>` : '';
  $('rackVisual').innerHTML = `${fanHtml}<div class="rack-frame" id="rackDrop" style="height:${heightPx}px">${slots.join('')}${blocks}</div>`;
  const frames = build.items.filter(it => it.placement === 'frame');
  const hosted = build.items.filter(it => it.hostedBy).length;
  const frameText = frames.length ? `${frames.map(it => labelOf(partById(it.partId), it)).join(', ')} is the rack, so it doesn't use a U.` : `${build.heightU}U, ${build.width} inch. U1 sits at the bottom.`;
  const hostText = hosted ? ` A mini PC on a shelf shares that shelf's slot instead of taking a second one.` : '';
  $('frameNote').textContent = frameText + hostText;
}
function whereText(it) {
  if (it.placement === 'frame') return 'The rack itself';
  if (it.placement === 'zerou') return '0U, top or rear of the rack';
  if (it.hostedBy) return 'On the shelf, sharing that slot';
  if (it.overflow) return 'No free slot';
  if (it.placement === 'shelf') return 'On a shelf';
  return `In the rack at ${it.startU}U`;
}
function renderItems(build) {
  const items = build.items;
  $('itemList').innerHTML = items.length ? items.map(it => {
    const p = partById(it.partId);
    const w = oneWatts(it);
    return `<article class="shelf-item" data-drag="item:${it.uid}">
      <div><b>${esc(labelOf(p, it))}${it.qty > 1 ? ' ×' + it.qty : ''}</b>
      <div class="part-meta">${whereText(it)}. ${wattsText(w.idle * (it.qty || 1))} idle, ${wattsText(w.typical * (it.qty || 1))} typical. <span class="badge${p?.edited ? ' edited' : ''}">${esc(badge(p))}</span>
      ${p?.source ? `<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Source</a>` : ''}</div>
      <div class="settings-grid">${wattFields(it)}</div></div>
      ${itemButtons(it)}
    </article>`;
  }).join('') : '<p class="help">Nothing in this build yet. Add a part from the list, or load a starter.</p>';
}
function renderCatalog() {
  const q = $('partSearch').value.trim().toLowerCase();
  const cat = $('partCategory').value;
  const list = allParts().filter(p => (cat === 'all' || p.category === cat) && (!q || `${p.brand} ${p.model} ${p.displayName || ''} ${p.category} ${p.formFactor}`.toLowerCase().includes(q)))
    .sort((a, b) => (a.popularity || 9) - (b.popularity || 9) || String(a.brand).localeCompare(String(b.brand)));
  const shown = list.slice(0, catalogLimit);
  $('catalog').innerHTML = shown.map(p => `<article class="part-row" data-drag="part:${p.id}">
    <div><b>${esc(labelOf(p))}</b>
    <div class="part-meta">${esc(p.formFactor || 'unspecified form')} · ${wattsText(p.idleW)} idle, ${wattsText(p.typicalW)} typical${Number.isFinite(Number(p.maxW)) ? `, ${wattsText(p.maxW)} max` : ''} <span class="badge${p.edited ? ' edited' : ''}">${esc(badge(p))}</span>
    ${p.source ? `<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Source</a>` : ''}
    ${p.includesDrives ? '<span>Typical watts already include the drives.</span>' : ''}</div></div>
    <div class="part-actions"><button type="button" data-add="${esc(p.id)}" data-where="rack">Add to rack</button><button type="button" class="secondary" data-add="${esc(p.id)}" data-where="shelf">Shelf</button><button type="button" class="secondary" data-edit="${esc(p.id)}">Edit</button></div>
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
  const {rate, currency, source} = currentRate();
  const ca = M.energyCost(ta.typical, rate), cb = M.energyCost(tb.typical, rate);
  const card = (build, t, cost, lead) => `<article class="comparison-card"><p class="step">${lead}</p><h3>${esc(build.name)}</h3><p>${wattsText(t.idle)} idle</p><strong>${wattsText(t.typical)} typical</strong><p>${money(cost.month, currency)} a month · ${money(cost.year, currency)} a year</p><p>${build.items.length} parts, ${build.heightU}U ${build.width}"</p></article>`;
  const deltaW = tb.typical - ta.typical;
  const deltaMoney = cb.year - ca.year;
  const moneyWay = deltaMoney > 0.005 ? 'more' : deltaMoney < -0.005 ? 'less' : 'the same';
  const wattWay = deltaW > 0.05 ? 'higher' : deltaW < -0.05 ? 'lower' : 'the same';
  $('comparison').innerHTML = card(a, ta, ca, 'First') + card(b, tb, cb, 'Second') + `<p class="help">On typical watts, the second build is ${wattsText(Math.abs(deltaW))} ${wattWay}, which is ${money(Math.abs(deltaMoney), currency)} a year ${moneyWay}. That's ${money(Math.abs(deltaMoney) / 12, currency)} a month. Figures use ${source}, ${money(rate, currency)} per kWh, and assume the gear stays at the typical draw all year.</p>`;
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

function addPart(id, where, startU) {
  const build = active();
  const part = partById(id);
  if (!part) return;
  let placement = where === 'shelf' ? 'shelf' : defaultPlacement(part, build.width);
  if (where === 'rack' && placement === 'frame') placement = 'frame';
  if (where === 'rack' && part.rackWidth === 19 && build.width === 10 && placement === 'rack') placement = 'shelf';
  const item = {uid: uid(), partId: id, qty: 1, placement, startU: Number.isFinite(startU) ? startU : null, idleOverride: null, typicalOverride: null};
  build.items.push(item);
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
function dropData(data, hit) {
  if (!hit) return;
  const rack = hit.closest('#rackDrop');
  const list = hit.closest('#itemList');
  const zero = hit.closest('#rackZero');
  if (!rack && !list && !zero) return;
  if (data.startsWith('part:')) {
    const id = data.slice(5);
    const slot = rack && hit.closest('[data-u]');
    addPart(id, (rack || zero) ? 'rack' : 'shelf', slot ? Number(slot.dataset.u) : null);
    return;
  }
  if (!data.startsWith('item:')) return;
  const item = findItem(data.slice(5));
  if (!item) return;
  if (list && !rack) { item.placement = 'shelf'; item.startU = null; item.hostedBy = null; }
  else {
    const part = partById(item.partId);
    item.placement = isZeroUFan(part) ? 'zerou' : (defaultPlacement(part, active().width) === 'frame' ? 'frame' : 'rack');
    const slot = hit.closest('[data-u]');
    item.startU = slot ? Number(slot.dataset.u) : null;
  }
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
  canvas.height = rows * row + 120;
  const g = canvas.getContext('2d');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0b1215';
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#eff7f6';
  g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = ink; g.font = '28px sans-serif';
  g.fillText(build.name || 'Rack', 28, 46);
  const t = totals(build);
  g.font = '16px sans-serif';
  g.fillText(`${wattsText(t.idle)} idle, ${wattsText(t.typical)} typical`, 28, 74);
  const fans = build.items.filter(it => it.placement === 'zerou');
  if (fans.length) { g.font = '13px sans-serif'; g.fillText('0U top / rear: ' + fans.map(it => labelOf(partById(it.partId), it)).join(', '), 28, 96); }
  const top = 110;
  g.strokeStyle = '#77c8c6';
  for (let i = 0; i < rows; i++) {
    g.strokeRect(24, top + i * row, 852, row);
    g.fillStyle = ink; g.font = '12px sans-serif';
    g.fillText('U' + roundU((rows - i) * step), 30, top + i * row + 22);
  }
  for (const it of build.items.filter(x => x.placement === 'rack' && !x.overflow && !x.hostedBy && Number.isFinite(x.startU))) {
    const p = partById(it.partId);
    const rider = it.hosts ? build.items.find(x => x.uid === it.hosts) : null;
    const y = top + (rows - (it.startU + it.units) / step) * row;
    const h = (it.units / step) * row;
    g.fillStyle = '#1c3324'; g.fillRect(80, y + 2, 780, h - 4);
    g.fillStyle = ink; g.font = '14px sans-serif';
    const face = rider ? `${shortLabel(p, it)} + ${shortLabel(partById(rider.partId), rider)}` : labelOf(p, it);
    g.fillText(face, 90, y + Math.min(22, h - 6));
  }
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'homelab-rack.png';
    a.click();
  });
}

function originalSnapshot(part) {
  return {
    name: `${part.brand ? part.brand + ' ' : ''}${part.model}`,
    idleW: part.idleW,
    typicalW: part.typicalW,
    maxW: part.maxW,
    rackUnits: part.rackUnits,
    rackWidth: part.rackWidth,
    formFactor: part.formFactor || ''
  };
}
function suggestHref(part, next) {
  const title = `Part correction: ${part.id}`;
  const body = [
    'A correction saved in the planner. The catalog copy still has the original numbers.',
    '',
    `Part id: ${part.id}`,
    '',
    'Original:',
    '```json',
    JSON.stringify(originalSnapshot(part), null, 2),
    '```',
    '',
    'Corrected:',
    '```json',
    JSON.stringify(next, null, 2),
    '```'
  ].join('\n');
  return `https://github.com/heemsec/homelab-power/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
function readEditForm(original) {
  const width = $('editWidth').value;
  const rackWidth = width === '19' ? 19 : width === '10' ? 10 : 'none';
  return {
    displayName: $('editName').value.trim().slice(0, 80),
    idleW: num($('editIdle').value, 0, 100000, Number(original.idleW) || 0),
    typicalW: num($('editTypical').value, 0, 100000, Number(original.typicalW) || 0),
    maxW: $('editMax').value.trim() === '' ? null : num($('editMax').value, 0, 100000, 0),
    rackUnits: roundU(num($('editU').value, 0, 52, Number(original.rackUnits) || 0)),
    rackWidth,
    formFactor: $('editForm').value.trim().slice(0, 80)
  };
}
function refreshSuggest() {
  const original = rawPart(editingId);
  if (!original || original.custom) return;
  $('suggestFix').href = suggestHref(original, readEditForm(original));
}
function openEdit(id) {
  const original = rawPart(id);
  const current = partById(id);
  if (!original || !current) return;
  editingId = id;
  $('editTitle').textContent = original.custom ? 'Edit your part' : `Edit ${labelOf(original)}`;
  $('editName').value = current.displayName || labelOf(original);
  $('editIdle').value = current.idleW ?? 0;
  $('editTypical').value = current.typicalW ?? 0;
  $('editMax').value = current.maxW ?? '';
  $('editU').value = current.rackUnits ?? 0;
  const width = current.rackWidth === 19 ? '19' : current.rackWidth === 10 ? '10' : 'none';
  $('editWidth').value = width;
  $('editForm').value = current.formFactor || '';
  const snap = originalSnapshot(original);
  $('editOriginal').textContent = original.custom
    ? 'This part only exists on this device.'
    : `Catalog value: ${snap.name}, ${snap.idleW} W idle, ${snap.typicalW} W typical, ${snap.maxW ?? 'no'} W max, ${snap.rackUnits ?? 'n/a'}U, ${snap.rackWidth === 'none' || snap.rackWidth == null ? 'not a fixed rack width' : snap.rackWidth + ' inch'}. ${snap.formFactor || ''}`;
  const source = $('editSource');
  if (original.source && !original.custom) {
    source.hidden = false;
    source.href = original.source;
    source.textContent = 'Original source';
  } else source.hidden = true;
  $('resetPart').hidden = !!original.custom;
  $('suggestFix').hidden = !!original.custom;
  $('editHint').textContent = (width === '10' || active().width === 10) ? 'On a 10 inch rack, half a U is a real step.' : 'A 19 inch rack rounds up to the next whole U.';
  refreshSuggest();
  $('editPart').showModal();
  $('editName').focus();
}
function saveEdit(event) {
  event.preventDefault();
  const original = rawPart(editingId);
  if (!original) return;
  const next = readEditForm(original);
  if (String(next.rackWidth) === '19') next.rackUnits = next.rackUnits <= 0 ? 0 : Math.max(1, Math.ceil(next.rackUnits));
  else next.rackUnits = roundU(next.rackUnits);
  if (!next.displayName || next.displayName === originalSnapshot(original).name) delete next.displayName;
  if (original.custom) {
    Object.assign(original, next);
    if (!next.displayName) delete original.displayName;
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); }
    catch { toast('Couldn\'t save that part on this device.'); return; }
  } else {
    const patch = {};
    for (const key of ['displayName', 'idleW', 'typicalW', 'maxW', 'rackUnits', 'rackWidth', 'formFactor']) {
      if (next[key] === original[key]) continue;
      if ((next[key] == null || next[key] === '') && (original[key] == null || original[key] === '')) continue;
      patch[key] = next[key];
    }
    if (Object.keys(patch).length) corrections.parts[original.id] = patch;
    else delete corrections.parts[original.id];
    writeCorrections();
  }
  $('editPart').close();
  render();
  toast('Saved on this device. Every build that uses this part picks it up.');
}
function resetEdit() {
  const original = rawPart(editingId);
  if (!original || original.custom) return;
  delete corrections.parts[original.id];
  writeCorrections();
  $('editPart').close();
  render();
  toast('Back to the catalog value.');
}

let drag = null;
function clearDropMarks() { document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target')); }
function markDrop(hit) {
  clearDropMarks();
  const zone = hit && hit.closest('#rackDrop, #itemList, #rackZero');
  if (zone) zone.classList.add('drop-target');
}
function wire() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', flushSave);
  let resizeTimer = 0;
  matchMedia('(max-width: 800px)').addEventListener('change', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => renderRack(active()), 80); });
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
    const part = {id: uid(), custom: true, brand: '', model: $('customName').value.trim().slice(0, 80) || 'Custom part', category: 'custom', formFactor: where === 'shelf' ? 'shelf' : '1U rack', rackUnits: where === 'shelf' ? 0 : num($('customU').value, 0.5, 20, 1), rackWidth: where === '19' ? 19 : 10, idleW: num($('customIdle').value, 0, 100000, 0), typicalW: num($('customTypical').value, 0, 100000, 0), maxW: null, confidence: 'estimate', source: '', notes: 'Added on this device.', popularity: 3};
    custom.push(part);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch { toast('Couldn\'t save that part on this device.'); return; }
    $('customName').value = '';
    renderCatalog();
    toast('Added. It\'ll be in the list next time too.');
  });
  $('editForm').addEventListener('submit', saveEdit);
  $('editForm').addEventListener('input', refreshSuggest);
  $('resetPart').addEventListener('click', resetEdit);
  $('closeEdit').addEventListener('click', () => $('editPart').close());
  document.body.addEventListener('click', e => {
    const edit = e.target.closest('[data-edit]');
    if (edit) { openEdit(edit.dataset.edit); return; }
    const add = e.target.closest('[data-add]');
    if (add) { addPart(add.dataset.add, add.dataset.where); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const item = findItem(act.dataset.uid);
    if (!item) return;
    if (act.dataset.act === 'remove') active().items = active().items.filter(it => it !== item);
    else if (act.dataset.act === 'shelf') { item.placement = 'shelf'; item.startU = null; item.ownSlot = false; }
    else if (act.dataset.act === 'rack') {
      const part = partById(item.partId);
      item.placement = isZeroUFan(part) ? 'zerou' : (defaultPlacement(part, active().width) === 'frame' ? 'frame' : 'rack');
      item.startU = null;
      item.hostedBy = null;
      item.ownSlot = isShelfRider(part);
    }
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
  document.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    const el = e.target.closest('[data-drag]');
    if (!el || e.target.closest('button, a, input, select, textarea, label')) return;
    drag = {id: el.dataset.drag, x: e.clientX, y: e.clientY, pointerId: e.pointerId, el, active: false};
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.active) {
      if (dx * dx + dy * dy < 36) return;
      drag.active = true;
      try { drag.el.setPointerCapture(e.pointerId); } catch {}
      document.body.classList.add('is-dragging');
    }
    markDrop(document.elementFromPoint(e.clientX, e.clientY));
  });
  document.addEventListener('touchmove', e => { if (drag?.active) e.preventDefault(); }, {passive: false});
  const finishDrag = e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const state = drag;
    drag = null;
    document.body.classList.remove('is-dragging');
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    clearDropMarks();
    if (state.active) dropData(state.id, hit);
  };
  document.addEventListener('pointerup', finishDrag);
  document.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.pointerId) { drag = null; document.body.classList.remove('is-dragging'); clearDropMarks(); } });
}

async function boot() {
  try { E.setPreview(localStorage.getItem(PREVIEW) === 'true'); } catch {}
  try {
    const [p, r] = await Promise.all([fetch(DATA_FILES.parts), fetch(DATA_FILES.presets)]);
    if (!p.ok || !r.ok) throw Error('missing');
    parts = await p.json();
    presets = await r.json();
    if (!Array.isArray(parts) || !Array.isArray(presets)) throw Error('shape');
  } catch {
    $('catalog').innerHTML = '<p class="help">Couldn\'t load the parts list. Open this page online once and it stays on the device after that.</p>';
    return;
  }
  loadBook();
  loadCustom();
  loadCorrections();
  const cats = [...new Set(allParts().map(p => p.category).filter(Boolean))].sort();
  $('partCategory').innerHTML += cats.map(c => `<option value="${esc(c)}">${esc(String(c).replace(/-/g, ' '))}</option>`).join('');
  $('presetSelect').innerHTML = presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('presetBlurb').textContent = presets[0]?.description || '';
  wire();
  render();
}
boot();
})();
