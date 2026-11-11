'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../math.js');
const Share = require('../../share.js');

const brCurve = [
  {loadW: 40, minutes: 150},
  {loadW: 79, minutes: 94},
  {loadW: 119, minutes: 66},
  {loadW: 240, minutes: 32},
  {loadW: 335, minutes: 21}
];
const cpCurve = [
  {loadW: 500, minutes: 10},
  {loadW: 1000, minutes: 2.5}
];

test('share link round-trips a build and drops markup', async () => {
  const build = {
    name: 'Nick <lab>',
    width: 10,
    heightU: 8,
    rate: 0.42,
    currency: 'USD',
    periods: [{id: 'peak', name: 'Peak', price: 0.4, start: 16, end: 21, days: 'weekday'}],
    items: [{partId: 'lenovo-thinkcentre-m720q-tiny', qty: 2, placement: 'rack', startU: 1, idleOverride: null, typicalOverride: 5.5, batteryWh: 216, ownSlot: true}]
  };
  const token = await Share.encode(build);
  assert.match(token, /^[jz]\./);
  const back = await Share.decode(token);
  assert.equal(back.name, 'Nick lab');
  assert.equal(back.width, 10);
  assert.equal(back.heightU, 8);
  assert.equal(back.rate, 0.42);
  assert.equal(back.items[0].partId, 'lenovo-thinkcentre-m720q-tiny');
  assert.equal(back.items[0].qty, 2);
  assert.equal(back.items[0].typicalOverride, 5.5);
  assert.equal(back.items[0].batteryWh, 216);
  assert.equal(back.items[0].ownSlot, true);
  assert.equal(back.periods[0].price, 0.4);
  assert.equal(M.cleanPeriods(back.periods)[0].name, 'Peak');
});

test('a damaged or empty share link is refused', async () => {
  await assert.rejects(() => Share.decode(''), /not a build/);
  await assert.rejects(() => Share.decode('j.!!!'), /not a build/);
  await assert.rejects(() => Share.decode('j.' + 'a'.repeat(20001)), /too long/);
});

test('a bad part id is rejected instead of trusted', () => {
  assert.throws(() => Share.sanitize({v: 1, n: 'x', w: 10, h: 8, i: [['<script>', 1, 'rack', '', '', '', '', 0]]}));
});

test('UPS curve hits the published points and interpolates the middle', () => {
  for (const point of brCurve) {
    const hit = M.interpolateRuntime(brCurve, point.loadW);
    assert.equal(hit.bound, 'exact');
    assert.ok(Math.abs(hit.minutes - point.minutes) < 1e-9);
  }
  const between = M.interpolateRuntime(brCurve, (40 + 79) / 2);
  assert.ok(Math.abs(between.minutes - (150 + 94) / 2) < 1e-9);
  assert.equal(M.interpolateRuntime(brCurve, 20).bound, 'longer');
  assert.equal(M.interpolateRuntime(cpCurve, 500).minutes, 10);
  assert.equal(M.interpolateRuntime(cpCurve, 1000).minutes, 2.5);
  assert.ok(Math.abs(M.interpolateRuntime(cpCurve, 750).minutes - 6.25) < 1e-9);
});

test('battery energy uses the stated efficiency and depth', () => {
  const est = M.runtimeFromEnergy(216, 100);
  assert.ok(Math.abs(est.mid - (216 * 0.85 * 0.8 / 100 * 60)) < 1e-9);
  assert.ok(Math.abs(est.low - (216 * 0.8 * 0.7 / 100 * 60)) < 1e-9);
  assert.ok(Math.abs(est.high - (216 * 0.9 * 0.9 / 100 * 60)) < 1e-9);
});

test('BTU is watts times 3.412', () => {
  assert.ok(Math.abs(M.btuPerHour(19.1) - 19.1 * 3.412) < 1e-9);
  assert.equal(M.btuPerHour(100), 341.2);
});

test('a swap saves the yearly cost of the watts it removes', () => {
  const save = M.yearlySavings(180, 12, 0.2);
  assert.ok(Math.abs(save.year - M.energyCost(168, 0.2).year) < 1e-6);
  assert.ok(Math.abs(save.month - save.year / 12) < 1e-9);
});

test('time-of-use matches a hand-worked weekday and weekend', () => {
  const device = {id: 'a', name: 'Load', idle: 100, load: 100, loadPct: 100, hours: 24, start: 0, selected: true};
  const periods = [
    {id: 'peak', name: 'Peak', price: 0.4, start: 16, end: 21, days: 'weekday'},
    {id: 'off', name: 'Off-peak', price: 0.1, start: 21, end: 16, days: 'weekday'},
    {id: 'weekend', name: 'Weekend off-peak', price: 0.1, start: 0, end: 0, days: 'weekend', allDay: true}
  ];
  const issues = M.touIssues(periods);
  assert.equal(issues.overlaps.length, 0);
  assert.equal(issues.gaps.length, 0);
  const weekday = 0.5 * 0.4 + 1.9 * 0.1;
  const weekend = 2.4 * 0.1;
  const expected = (5 * weekday + 2 * weekend) / 7;
  const got = M.integrate([device], {tou: true, rate: 0.1, peakStart: 16, peakEnd: 21, periods});
  assert.ok(Math.abs(got.cost - expected) < 1e-9, `${got.cost} vs ${expected}`);
});
