import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const { Window } = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const window = new Window({ settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
const context = vm.createContext(window);
const pendingFrames = new Map();
let clock = 0;
let frameId = 0;
window.performance.now = () => clock;
window.requestAnimationFrame = callback => { pendingFrames.set(++frameId, callback); return frameId; };
window.cancelAnimationFrame = id => pendingFrames.delete(id);
window.ResizeObserver = class { observe() {} disconnect() {} };
const canvas = { clearRect() {} };
window.HTMLCanvasElement.prototype.getContext = () => canvas;

const map = { id: 'main', width: 1000, height: 600, objects: [], spawnPoints: [{ id: 'entry', x: 100, y: 300 }] };
const planet = { id: 'dock', locationType: 'hub', hub: { maps: [map] } };
let player = { id: 'p', currentPlanetId: planet.id, textInventoryItems: [{ name: '<a href="article:permit">Допуск &amp; пропуск</a>', qty: 1 }] };
let active = true;
let writes = 0;
let fail = false;
const notices = [];
const root = window.document.createElement('main');
window.document.body.append(root);
for (const file of ['hub-core-v156.js','hub-spatial-v157.js','hub-free-v178.js','hub-runtime-v156.js']) {
  vm.runInContext(fs.readFileSync(new URL('../renderer/' + file, import.meta.url), 'utf8'), context, { filename: file });
}
const core = window.GRPGHubCoreV156;
const rule = { conditions: [{ type: 'text-item', id: '  допуск   & пропуск  ' }] };
assert.equal(core.reason(rule, player, { flags: {} }), '');
assert.notEqual(core.reason(rule, { inventory: [{ itemId: 'Допуск & пропуск', qty: 1 }] }, { flags: {} }), '');
assert.equal(core.reason({ conditions: [{ ...rule.conditions[0], value: false }] }, {}, { flags: {} }), '');

const runtime = window.GRPGHubRuntimeV156.create({
  root: () => root,
  currentPlayer: () => player,
  currentPlanet: () => planet,
  isActive: () => active,
  notify: message => notices.push(message),
  async commit(mutator) {
    writes++;
    const next = structuredClone(player);
    mutator(next);
    if (fail) throw new Error('Save rejected');
    player = next;
  }
});

function advance(milliseconds) {
  for (let count = 0; count < milliseconds; count += 16) {
    clock += 16;
    const ready = [...pendingFrames.values()];
    pendingFrames.clear();
    for (const callback of ready) callback(clock);
  }
}

try {
  runtime.show();
  const mapNode = root.querySelector('[data-runtime-map]');
  const token = root.querySelector('.hub-player-v153');
  const first = runtime.walk(460, 300);
  advance(320);
  assert(parseFloat(token.style.translate) > 70);
  assert.equal(writes, 0);
  advance(1500);
  await first;
  assert.equal(writes, 1);
  assert.equal(player.hubState.x, 460);
  assert.equal(root.querySelector('[data-runtime-map]'), mapNode);

  fail = true;
  const rejected = runtime.walk(700, 300);
  advance(1000);
  await rejected;
  assert.equal(writes, 2);
  assert.equal(player.hubState.x, 460);
  assert.equal(parseFloat(token.style.left), 460);
  assert.equal(notices.at(-1), 'Save rejected');

  fail = false;
  const interrupted = runtime.walk(700, 300);
  advance(450);
  active = false;
  runtime.leave();
  advance(16);
  await interrupted;
  assert.equal(writes, 3);
  assert.equal(player.hubState.x, 580);
  console.log('PASS continuous movement, one write, rollback, interrupted route and manual inventory access');
} finally {
  await window.happyDOM.abort();
}
