const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  let time = 0, tick, observe, release;
  const line = {};
  const document = {
    createElement: () => Object.assign(line, { setAttribute() {} }),
    body: { append() {} },
    addEventListener() {}
  };
  class PerformanceObserver {
    static supportedEntryTypes = ['longtask'];
    constructor(callback) { observe = callback; }
    observe() {}
  }
  const App = { currentUser: { role: 'player' } };
  const Combat = { render() { time += 420; } };
  const PlayerSync = { pullUpdates() { return new Promise(resolve => { release = resolve; }); } };
  const context = {
    document, App, Combat, PlayerSync, PerformanceObserver,
    Sync: {}, ChatSync: {}, Configurator: {}, Persistence: {},
    performance: { now: () => time },
    setInterval(callback) { tick = callback; }
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../renderer/dm-process-status.js'), 'utf8'), context);
  tick();
  assert.equal(line.hidden, true);
  App.currentUser.role = 'gm';
  const pending = PlayerSync.pullUpdates();
  time = 200;
  tick();
  assert.match(line.textContent, /Профили · получение · 200 мс/);
  Combat.render();
  observe({ getEntries: () => [{ startTime: 200, duration: 420 }] });
  tick();
  assert.match(line.textContent, /Последний фриз 420 мс · Бой · отрисовка/);
  release('ok');
  assert.equal(await pending, 'ok');
  tick();
  assert.match(line.textContent, /^Фоновых операций нет/);
  observe({ getEntries: () => [{ startTime: 650, duration: 550 }] });
  tick();
  assert.match(line.textContent, /550 мс · участок не определён/);
  App.currentUser.role = 'player';
  tick();
  assert.equal(line.hidden, true);
  App.currentUser.role = 'gm';
  tick();
  assert.equal(line.textContent, 'Фоновых операций нет');
  console.log('PASS DM process status: role, pending operation, freeze attribution and logout');
})().catch(error => { console.error(error); process.exitCode = 1; });
