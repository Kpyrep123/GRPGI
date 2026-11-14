(() => {
  const line = document.createElement('div');
  line.id = 'dm-process-status';
  line.hidden = true;
  line.setAttribute('aria-live', 'off');
  document.body.append(line);

  const active = new Set();
  const recent = [];
  let lastFreeze = null;
  const threshold = 150;
  const isDm = () => App.currentUser?.role === 'gm';
  const now = () => performance.now();
  const elapsed = ms => ms >= 1000 ? (ms / 1000).toFixed(1) + ' с' : Math.round(ms) + ' мс';

  function begin(label, synchronous = false) {
    if (!isDm()) return () => {};
    const row = { label, synchronous, start: now(), end: Infinity };
    active.add(row);
    return () => {
      row.end = now();
      active.delete(row);
      if (synchronous && row.end - row.start >= 20) {
        recent.push(row);
        if (recent.length > 100) recent.shift();
      }
    };
  }

  function sync(label, task) {
    const end = begin(label, true);
    try { return task(); } finally { end(); }
  }

  function track(target, name, label, synchronous = false) {
    const original = target[name];
    if (typeof original !== 'function') return;
    target[name] = synchronous ? function (...args) {
      return sync(label, () => original.apply(this, args));
    } : async function (...args) {
      const end = begin(label);
      try { return await sync(label, () => original.apply(this, args)); } finally { end(); }
    };
  }

  function recordFreeze(start, duration) {
    if (!isDm() || duration < threshold || start + duration < (lastFreeze?.time ?? 0)) return;
    const end = start + duration;
    const candidates = recent.map(row => ({
      row, overlap: Math.min(end, row.end) - Math.max(start, row.start)
    })).filter(match => match.overlap >= 20);
    candidates.sort((a, b) => b.overlap - a.overlap || b.row.start - a.row.start);
    lastFreeze = { time: end, duration, label: candidates[0]?.row.label || 'участок не определён' };
  }

  const longTasks = window.PerformanceObserver?.supportedEntryTypes?.includes('longtask');
  if (longTasks) {
    const observer = new PerformanceObserver(list => {
      if (document.hidden) return;
      for (const entry of list.getEntries()) recordFreeze(entry.startTime, entry.duration);
    });
    observer.observe({ type: 'longtask' });
  }

  const topLayer = typeof line.showPopover === 'function';
  if (topLayer) line.setAttribute('popover', 'manual');
  function raise() {
    if (!topLayer || line.hidden) return;
    if (line.matches(':popover-open')) line.hidePopover();
    line.showPopover();
  }
  if (topLayer) {
    new MutationObserver(records => {
      if (records.some(({ target }) => target.matches?.('dialog[open]'))) raise();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  }

  const interval = 200;
  let previous = now();
  document.addEventListener('visibilitychange', () => { previous = now(); });
  setInterval(() => {
    const time = now();
    if (!longTasks && !document.hidden) recordFreeze(previous, time - previous - interval);
    previous = time;
    const visible = isDm();
    if (line.hidden === visible) {
      line.hidden = !visible;
      if (visible) raise();
      else {
        if (topLayer && line.matches(':popover-open')) line.hidePopover();
        recent.length = 0;
        active.clear();
        lastFreeze = null;
      }
    }
    if (!visible) return;
    const operations = [...active].reverse();
    const current = operations[0];
    const count = operations.length > 1 ? ' (+' + (operations.length - 1) + ')' : '';
    const operation = current ? current.label + ' · ' + elapsed(time - current.start) + count : 'Фоновых операций нет';
    const freeze = lastFreeze ? ' │ Последний фриз ' + elapsed(lastFreeze.duration) + ' · ' + lastFreeze.label : '';
    const text = operation + freeze;
    if (line.textContent !== text) line.textContent = text;
  }, interval);

  track(Sync, 'checkForRemoteUpdates', 'Облако · проверка и получение мира');
  track(Sync, 'applyRemoteSnapshot', 'Облако · применение снимка мира');
  track(Sync, 'pushCurrentSnapshot', 'Облако · отправка мира');
  track(PlayerSync, 'pullUpdates', 'Профили · получение');
  track(PlayerSync, 'applyRemoteRow', 'Профили · применение обновления', true);
  track(PlayerSync, 'pushPlayerPatch', 'Профили · сохранение');
  track(ChatSync, 'pull', 'Сообщения · получение');
  track(ChatSync, 'pushBatch', 'Сообщения · отправка');
  track(App, '_writeLocalMirrorsV135', 'Локальная запись профилей');
  track(Persistence, 'save', 'Локальная запись состояния');
  track(Configurator, 'render', 'World Config · отрисовка', true);
  track(Combat, 'render', 'Бой · отрисовка', true);
  track(Combat, 'broadcastPlayerDisplayMirror', 'Бой · подготовка второго экрана', true);

  window.GRPGDmProcessStatus = { begin, sync };
})();
