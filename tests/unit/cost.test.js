'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../math.js');

test('yearly cost keeps the full watt value', () => {
  const cost = M.energyCost(23.65, 0.2);
  const yearKwh = 23.65 * 24 * 365 / 1000;
  assert.ok(Math.abs(cost.kwhYear - yearKwh) < 1e-9);
  assert.ok(Math.abs(cost.year - yearKwh * 0.2) < 1e-9);
  assert.ok(Math.abs(cost.month - cost.kwhYear / 12 * 0.2) < 1e-9);
});

test('typed numbers accept a decimal comma and ignore junk', () => {
  assert.equal(M.parse('12,5'), 12.5);
  assert.equal(M.parse('18,1'), 18.1);
  assert.equal(M.parse('1.234,56'), 1234.56);
  assert.equal(M.parse('1,234.56'), 1234.56);
  assert.equal(M.parse(''), NaN);
  assert.equal(M.parse('nope'), NaN);
  assert.equal(M.clamp('-4', 0, 100), 0);
  assert.equal(M.clamp('1000000', 0, 100), 100);
  assert.equal(M.energyCost(-10, 0.2).year, 0);
  assert.equal(M.energyCost(10, -1).year, 0);
  assert.equal(M.btuPerHour(-3), 0);
  assert.equal(M.energyCost(0, 0.2).year, 0);
});

test('a higher build costs the difference, not a fresh total', () => {
  const low = M.energyCost(19.1, 0.42);
  const high = M.energyCost(23.65, 0.42);
  assert.ok(Math.abs((high.year - low.year) - M.energyCost(23.65 - 19.1, 0.42).year) < 1e-9);
});
