/* Applies color and light/dark before the stylesheet paints. Palette choice is remembered even when a Pro theme can't be shown. */
(() => {
  'use strict';
  const PRO = new Set(['nordic', 'amber']);
  const NAMES = new Set(['homelab', 'cyber', 'nordic', 'amber']);
  const media = matchMedia('(prefers-color-scheme: light)');
  let mode;
  let palette = 'homelab';
  try { mode = localStorage.getItem('homelab-power-theme'); } catch {}
  try {
    const saved = localStorage.getItem('homelab-power-palette');
    if (NAMES.has(saved)) palette = saved;
  } catch {}
  if (mode === 'system') mode = null;
  if (!['light', 'dark'].includes(mode)) mode = null;
  function entitled() {
    try {
      return localStorage.getItem('homelab-power-preview-pro') === 'true' || localStorage.getItem('homelab-power-pro') === 'true';
    } catch { return false; }
  }
  function resolveMode() {
    return mode === 'light' || mode === 'dark' ? mode : (media.matches ? 'light' : 'dark');
  }
  function resolvePalette() {
    return PRO.has(palette) && !entitled() ? 'homelab' : palette;
  }
  const bar = {homelab: {dark: '#0b1215', light: '#f3f6f5'}, cyber: {dark: '#0B0F19', light: '#F3F6FB'}, nordic: {dark: '#0F172A', light: '#F8FAFC'}, amber: {dark: '#121212', light: '#FAFAF9'}};
  function apply() {
    const theme = resolveMode();
    const shown = resolvePalette();
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.palette = shown;
    document.documentElement.dataset.paletteChoice = palette;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = (bar[shown] || bar.homelab)[theme];
    const button = document.getElementById('theme');
    if (button) {
      button.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
      button.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`);
      button.setAttribute('aria-pressed', String(theme === 'light'));
    }
  }
  apply();
  media.addEventListener('change', () => { if (!mode) apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    const button = document.getElementById('theme');
    if (!button) return;
    button.addEventListener('click', () => {
      mode = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      apply();
      try { localStorage.setItem('homelab-power-theme', mode); } catch {}
    });
  });
  window.HomelabTheme = {
    apply,
    choice: () => palette,
    setPalette(next) {
      if (!NAMES.has(next)) return;
      palette = next;
      try { localStorage.setItem('homelab-power-palette', palette); } catch {}
      apply();
    },
    setMode(next) {
      mode = next === 'light' || next === 'dark' ? next : null;
      try { localStorage.setItem('homelab-power-theme', next || 'system'); } catch {}
      apply();
    }
  };
  window.addEventListener('power:pro', apply);
})();
