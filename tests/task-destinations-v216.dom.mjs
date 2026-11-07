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
  window.tasksTest = { App, compileData, bindGlobalEvents, renderAffectedScreens, openCharacterChatV1086, WebGalaxyMap };
  if (false) init().catch(error => {`));

for (const file of ['news-core-v159.js', 'news-ui-v159.js', 'news-web-v159.js']) run(read(file));

const openTo = playerId => ({ playerIds: [playerId] });
const task = (title, status, destinationPlanetId, visibility = openTo('p')) => ({ id: title.toLowerCase().replaceAll(' ', '-'), title, status, destinationPlanetId, visibility });
const { App, compileData, bindGlobalEvents, renderAffectedScreens, openCharacterChatV1086, WebGalaxyMap } = window.tasksTest;
const planet = (id, name, visibility = openTo('p')) => ({ id, name, visibility });
const world = {
  players: { PLAYER_TEMPLATES: {
    p: { id: 'p', displayName: 'Player One', role: 'player', campaignIds: ['main'] },
    q: { id: 'q', displayName: 'Player Two', role: 'player', campaignIds: ['main'] }
  } },
  news: { NEWS_LIST: [{ id: 'headline', title: 'Campaign headline', body: '<p>Feed post</p>' }] },
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
    { ...task('Task Open', 'open', 'home'), subtitle: 'Brief subtitle', summary: 'Full summary', body: '<p>Full mission body</p>', reward: 0, image: 'https://grpgi.test/mission.png', relatedArticleIds: ['briefing', 'classified'] },
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
  App.config = { campaignId: 'main' };
  App.session = { userId: 'p', role: 'player', campaignId: 'main' };
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
  assert(!board.querySelector('[data-task-id="task-hidden"]'));
  assert.doesNotMatch(board.textContent, /Full summary|Full mission body|Task Briefing/);
  const tile = board.querySelector('[data-task-id="task-open"]');
  assert.match(tile.textContent, /Brief subtitle.*Награда · 0.*Visible Planet/s);
  assert.equal(tile.querySelector('img').getAttribute('src'), 'https://grpgi.test/mission.png');
  tile.click();
  const reader = document.querySelector('#task-reader');
  assert(reader.open);
  assert.match(reader.textContent, /Full summary.*Full mission body/s);
  assert(reader.querySelector('[data-related-type="planet"][data-related-id="home"]'));
  assert(!reader.querySelector('[data-related-id="classified"]'));
  reader.querySelector('[data-action="close-task-reader"]').click();
  assert(!reader.open);
  tile.click();
  reader.querySelector('[data-related-id="briefing"]').click();
  assert(!reader.open);
  assert.equal(App.ui.screen, 'archive');
  assert.equal(App.ui.selectedArchiveId, 'briefing');
  assert.match(document.querySelector('#screen-archive').textContent, /Briefing body/);

  navigate('tasks');
  App.data.tasksList[0].title = 'Task Updated';
  renderAffectedScreens({ snapshot: true });
  assert.match(board.textContent, /Task Updated/);
  board.querySelector('[data-task-id="task-open"]').click();
  App.data.tasksList[0].visibility = openTo('other');
  renderAffectedScreens({ snapshot: true });
  assert(!reader.open);
  App.data.tasksList[0].visibility = openTo('p');

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
  console.log('PASS compact tasks, fullscreen reader, article link, visibility and galaxy markers');

  window.requestAnimationFrame = callback => { callback(); return 0; };
  navigate('news');
  assert(!document.querySelector('.nav-btn[data-screen="chat"]'));
  assert.match(document.querySelector('#screen-news').textContent, /Campaign headline/);
  const draft = document.querySelector('.gg-composer textarea');
  draft.value = 'Draft remains in the feed';
  const messagesTab = document.querySelector('.social-nav [data-section="chat"]');
  const feedTab = document.querySelector('.social-nav [data-section="news"]');
  App.data.chatRows.push({
    message_id: 'incoming', kind: 'direct', sender_type: 'player', sender_id: 'q',
    recipient_player_id: 'p', created_at: new Date(Date.now() + 10000).toISOString(), body_html: '<p>Incoming message</p>'
  });
  renderAffectedScreens({ chat: true });
  const unread = document.querySelector('#social-unread');
  assert.equal(unread.textContent, '1');
  assert(!unread.hidden);
  assert.equal(document.querySelector('.nav-btn[data-screen="news"] .chat-nav-unread-v1065').textContent, '1');
  messagesTab.click();
  assert.equal(App.ui.screen, 'chat');
  assert.equal(messagesTab.getAttribute('aria-current'), 'page');
  assert(document.querySelector('.nav-btn[data-screen="news"]').classList.contains('active'));
  assert(document.querySelector('#screen-chat').classList.contains('active'));
  document.querySelector('#screen-chat [data-thread-key="p__q"]').click();
  const thread = document.querySelector('#chat-master-modal-v1068');
  assert.match(thread.textContent, /Incoming message/);
  assert(unread.hidden);
  App.data.chatRows.push({
    ...App.data.chatRows[0], message_id: 'next', created_at: new Date(Date.now() + 20000).toISOString(), body_html: '<p>Next message</p>'
  });
  renderAffectedScreens({ chat: true });
  assert.match(thread.textContent, /Next message/);
  feedTab.click();
  assert(thread.classList.contains('hidden'));
  assert.equal(document.querySelector('.gg-composer textarea').value, 'Draft remains in the feed');
  openCharacterChatV1086({ entityType: 'player', entityId: 'q' });
  assert.equal(App.ui.screen, 'chat');
  assert.match(thread.textContent, /Next message/);
  navigate('tasks');
  assert(document.querySelector('#social-shell').classList.contains('hidden'));
  assert(thread.classList.contains('hidden'));
  console.log('PASS GalaGram feed, messages, unread count, live thread, deep link and retained composer draft');
} finally {
  await window.happyDOM.abort();
}
