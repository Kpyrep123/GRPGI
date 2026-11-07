import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const { Window } = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const window = new Window({ url: 'https://grpgi.test/app/', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
const context = vm.createContext(window);
const run = source => vm.runInContext(source, context);
const read = name => fs.readFileSync(new URL(`../deploy/site/app/${name}`, import.meta.url), 'utf8');
window.setInterval = () => 0;
window.requestAnimationFrame = () => 0;
window.matchMedia = () => ({ matches: false });
const html = read('index.html');
window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
assert(html.indexOf('src="./task-map-v216.js') < html.indexOf('src="./app.js'));
for (const file of ['task-map-v216.js', 'rich-text-scope.js', 'market-engine.js', 'player-sync-core.js', 'damage-types-v202.js', 'weapon-handling-v203.js', 'player-credentials-v212.js', 'player-auth-v212.js']) {
  run(read(file));
}
assert.equal(read('task-map-v216.js'), fs.readFileSync(new URL('../renderer/task-map-v216.js', import.meta.url), 'utf8'));
run(read('app.js').replace('  init().catch(error => {', `
  window.tasksTest = { App, compileData, bindGlobalEvents, renderAffectedScreens, WebGalaxyMap };
  if (false) init().catch(error => {`));

const openTo = playerId => ({ playerIds: [playerId] });
const task = (title, status, destinationPlanetId, visibility = openTo('p')) => ({ title, status, destinationPlanetId, visibility });
const { App, compileData, bindGlobalEvents, renderAffectedScreens, WebGalaxyMap } = window.tasksTest;
const planet = (id, name, visibility = openTo('p')) => ({ id, name, visibility });
const world = {
  players: { PLAYER_TEMPLATES: { p: { id: 'p', role: 'player' } } },
  systems: { SYSTEMS: [
    { id: 'visible', name: 'Visible System', pos: { x: .4, y: .4 }, planetIds: ['home', 'secret', 'finished'], visibility: openTo('p') },
    { id: 'hidden', name: 'Hidden System', pos: { x: .6, y: .6 }, planetIds: ['stranded'], visibility: openTo('other') }
  ] },
  planets: { PLANETS: {
    home: planet('home', 'Visible Planet'),
    secret: planet('secret', 'Secret Planet', openTo('other')),
    finished: planet('finished', 'Finished Planet'),
    stranded: planet('stranded', 'Stranded Planet')
  } },
  articles: { ARTICLES: {
    briefing: { id: 'briefing', title: 'Task Briefing', body: '<p>Briefing body</p>', visibility: openTo('p') },
    classified: { id: 'classified', title: 'Hidden Article', visibility: openTo('other') }
  } },
  tasks: { TASK_LIST: [
    { ...task('Task Open', 'open', 'home'), relatedArticleIds: ['briefing', 'classified'] },
    task('Task Active', 'active', 'home'),
    task('Task Same Destination', 'active', 'home'),
    task('Task Complete', 'completed', 'finished'),
    task('Task Hidden Planet', 'active', 'secret'),
    task('Task Hidden System', 'open', 'stranded'),
    task('Task Hidden', 'open', 'finished', openTo('other')),
    task('Task Legacy', undefined, undefined)
  ] }
};

try {
  App.session = { userId: 'p', role: 'player' };
  App.ui.boot = 'app';
  compileData({ world_json: world, state_json: {} }, [], [], null);
  bindGlobalEvents();
  const document = window.document;
  const navigate = screen => document.querySelector(`.nav-btn[data-screen="${screen}"]`).click();
  navigate('tasks');
  const board = document.querySelector('#screen-tasks');
  assert(board.classList.contains('active'));
  const columns = [...board.querySelectorAll('.web-task-column')];
  assert.match(columns[0].textContent, /Task Open.*Task Legacy/s);
  assert.match(columns[1].textContent, /Task Active/);
  assert.match(columns[2].textContent, /Task Complete/);
  assert.doesNotMatch(board.textContent, /Secret Planet|Hidden Article/);
  assert(![...board.querySelectorAll('h3')].some(title => title.textContent === 'Task Hidden'));
  assert(board.querySelector('[data-related-type="planet"][data-related-id="home"]'));

  const briefing = board.querySelector('[data-related-id="briefing"]');
  assert(briefing);
  briefing.click();
  assert.equal(App.ui.screen, 'archive');
  assert.equal(App.ui.selectedArchiveId, 'briefing');
  assert.match(document.querySelector('#screen-archive').textContent, /Briefing body/);

  navigate('tasks');
  App.data.tasksList[0].title = 'Task Updated';
  renderAffectedScreens({ snapshot: true });
  assert.match(board.textContent, /Task Updated/);

  navigate('home');
  const systemCards = [...document.querySelectorAll('#screen-home .system-grid .entity-card')];
  assert.equal(systemCards.length, 1);
  assert.match(systemCards[0].textContent, /Активные задания.*Не принятые задания/s);
  const planetCards = [...document.querySelectorAll('#screen-home .planet-grid .planet-card')];
  assert.equal(planetCards[0].querySelectorAll('.task-marker-labels span').length, 2);
  assert.equal(planetCards[1].querySelector('.task-marker-labels'), null);

  const glyphs = [];
  const ctx = new Proxy({
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText: text => { if (text === '◆' || text === '▲') glyphs.push(text); }
  }, { get: (target, key) => target[key] ?? (() => {}) });
  Object.assign(WebGalaxyMap, { ctx, width: 800, height: 600, dpr: 1, activeSystemId: '' });
  WebGalaxyMap.draw();
  assert.deepEqual(glyphs.splice(0), ['◆', '▲']);
  WebGalaxyMap.activeSystemId = 'visible';
  WebGalaxyMap.camera.zoom = 3;
  WebGalaxyMap.draw();
  assert.deepEqual(glyphs, ['◆', '▲']);
  console.log('PASS web tasks tab, article link, snapshot refresh, visibility and both galaxy zoom levels');
} finally {
  await window.happyDOM.abort();
}
