/* Web-only presentation. No persistence, polling or profile mutation. */
(() => {
  'use strict';
  if (window.GRPGWebUIV313) return;
  const dock = document.querySelector('.bottom-nav');
  if (!dock) return;
  const paths = {
    home: '<circle cx="12" cy="12" r="8"/><path d="m16 8-2 6-6 2 2-6Z"/>',
    archive: '<path d="M4 5h6l2 2 2-2h6v14h-6l-2 2-2-2H4Z M12 7v14 M7 10h2 M15 10h2 M7 14h2 M15 14h2"/>',
    market: '<path d="M3 6h18v14H3Z M7 6V3h10v3 M3 11h18 M10 11v3h4v-3"/>',
    tasks: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2 M8 10l2 2 5-5 M8 16h8"/>',
    news: '<path d="M4 4h16v13H9l-5 4Z M8 8h8 M8 12h5"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    'hub-v153': '<path d="m3 11 9-8 9 8 M5 9v12h14V9 M9 21v-7h6v7"/>'
  };
  for (const button of dock.querySelectorAll('[data-screen]')) {
    const path = paths[button.dataset.screen];
    if (!path) continue;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.classList.add('web-nav-icon-v313');
    icon.innerHTML = path;
    button.prepend(icon);
  }
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastScreen = null, transition = null;
  function syncNavigation() {
    const active = document.querySelector('.screen.active');
    for (const button of dock.querySelectorAll('[data-screen]')) {
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    // A realtime render of the same screen must not replay its entrance.
    if (active?.id === lastScreen) return;
    transition?.cancel();
    transition = null;
    if (lastScreen && active && !motion.matches && !document.hidden) {
      transition = active.animate?.([{opacity: 0.4}, {opacity: 1}], {duration: 160, easing: 'ease-out'});
    }
    lastScreen = active?.id || null;
  }
  motion.addEventListener?.('change', () => { if (motion.matches) transition?.cancel(); });
  window.GRPGWebUIV313 = Object.freeze({syncNavigation});
  syncNavigation();
})();
