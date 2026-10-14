(() => {
  'use strict';
  if (document.documentElement.dataset.client !== 'web') return;
  const button = document.getElementById('web-ambient-toggle');
  if (!button) return;
  const key = 'grpg.web.ambientMuted.v166';
  const audio = new Audio('./assets/audio/web_ambient.m4a');
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = 0.15;
  let muted = false, pending = false, unavailable = false;
  try { muted = localStorage.getItem(key) === 'true'; } catch {}
  function render() {
    audio.muted = muted;
    const label = muted ? 'Включить фоновый звук' : 'Выключить фоновый звук';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(muted));
    button.title = unavailable ? 'Фоновый звук недоступен: web_ambient.m4a' : label;
    button.classList.toggle('is-muted', muted);
    button.classList.toggle('is-unavailable', unavailable);
  }
  async function start() {
    if (muted || pending || unavailable || !audio.paused) return;
    pending = true;
    try {
      await audio.play();
      unavailable = false;
    } catch (error) {
      // Autoplay rejection is retried on the next gesture; missing media is marked.
      unavailable = error.name !== 'NotAllowedError';
    } finally {
      pending = false;
      if (muted) audio.pause();
      render();
    }
  }
  button.addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem(key, String(muted)); } catch {}
    render();
    if (muted) audio.pause(); else { unavailable = false; start(); }
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest?.('#web-ambient-toggle')) start();
  });
  document.addEventListener('keydown', event => {
    if (!event.repeat && !event.target.closest?.('#web-ambient-toggle')) start();
  });
  audio.addEventListener('error', () => { unavailable = true; render(); });
  render();
})();
