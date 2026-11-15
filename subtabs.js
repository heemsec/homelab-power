'use strict';
/* Sub-tabs stay on the page. The Android back button still moves between the main pages. */
(() => {
  const root = document.querySelector('[data-subtabs]');
  if (!root) return;
  const page = root.dataset.subtabs;
  const key = `homelab-power-subtab-${page}`;
  const buttons = [...root.querySelectorAll('[data-subtab]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  const known = new Set(buttons.map(b => b.dataset.subtab));
  let saved = '';
  try { saved = localStorage.getItem(key) || ''; } catch {}
  if (page === 'calculator' && saved === 'whatif') saved = 'costs';
  if (!known.has(saved)) saved = buttons[0]?.dataset.subtab || '';

  function show(id, store) {
    if (!known.has(id)) return;
    buttons.forEach(button => {
      const on = button.dataset.subtab === id;
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== id; });
    if (store) { try { localStorage.setItem(key, id); } catch {} }
  }

  buttons.forEach(button => button.addEventListener('click', () => show(button.dataset.subtab, true)));
  show(saved, false);

  window.HomelabSubtabs = {
    show: id => show(id, true),
    current: () => buttons.find(b => b.getAttribute('aria-selected') === 'true')?.dataset.subtab || '',
    setSummary(id, text) {
      const el = root.querySelector(`[data-sum="${id}"]`);
      if (el) el.textContent = text;
    }
  };
})();
