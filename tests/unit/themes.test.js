'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function contrast(a, b) {
  const L1 = lum(a), L2 = lum(b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

const pairs = [
  ['homelab text', '#eff7f6', '#0b1215'],
  ['homelab muted', '#a0b3b8', '#121e22'],
  ['homelab button', '#16201a', '#b4ef86'],
  ['homelab light button', '#ffffff', '#326319'],
  ['homelab light heavy', '#8a4b00', '#ffffff'],
  ['cyber text', '#E5E7EB', '#0B0F19'],
  ['cyber muted on card', '#9CA3AF', '#1F2937'],
  ['cyber button', '#06281F', '#34D399'],
  ['cyber light button', '#FFFFFF', '#047857'],
  ['nordic text', '#E2E8F0', '#0F172A'],
  ['nordic muted card', '#94A3B8', '#1E293B'],
  ['nordic button', '#042F2E', '#22D3EE'],
  ['nordic light button', '#ECFEFF', '#0E7490'],
  ['amber text', '#F5F5F5', '#121212'],
  ['amber label', '#B3B3B3', '#282828'],
  ['amber button', '#1C1917', '#F59E0B'],
  ['amber heavy', '#7DD3FC', '#282828'],
  ['amber light heavy', '#0369A1', '#FFFFFF'],
  ['amber light button', '#1C1917', '#D97706'],
  ['over on dark', '#FF8A80', '#121212'],
  ['over on light', '#9B2335', '#FFFFFF']
];

test('every theme pair clears WCAG AA for normal text', () => {
  for (const [name, fg, bg] of pairs) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 4.5, `${name} is ${ratio.toFixed(2)}:1`);
  }
});

test('amber heavy load is not the same hue as the amber accent', () => {
  assert.notEqual('#7DD3FC'.toLowerCase(), '#f59e0b');
  assert.ok(contrast('#7DD3FC', '#F59E0B') >= 1.2);
});
