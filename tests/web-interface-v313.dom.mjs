import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const {Window} = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const w = new Window({url: 'https://grpgi.test/app/', settings: {disableJavaScriptFileLoading: true, disableCSSFileLoading: true}});
w.addEventListener('error', event => { throw event.error; });
const run = source => vm.runInContext(source, context);
const context = vm.createContext(w);
const read = name => fs.readFileSync(`deploy/site/app/${name}`, 'utf8');
w.setInterval = () => 0;
w.requestAnimationFrame = () => 0;
const nativeMatchMedia = w.matchMedia.bind(w), motion = new w.EventTarget();
motion.matches = false;
w.matchMedia = query => query.includes('prefers-reduced-motion') ? motion : nativeMatchMedia(query);
const animations = [];
w.Element.prototype.animate = function () {
  const animation = {element: this, cancelled: false, cancel() {this.cancelled = true;}};
  animations.push(animation);
  return animation;
};
w.document.write(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
try {
  for (const file of ['stock-ticket-v214.js', 'market-categories-v144.js', 'task-map-v216.js', 'item-instances-v215.js', 'item-facts-v141.js', 'rich-text-scope.js', 'market-engine.js', 'player-sync-core.js', 'damage-types-v202.js', 'weapon-handling-v203.js', 'player-credentials-v212.js', 'player-auth-v212.js', 'profile-sheet-v142.js']) run(read(file));
  run(read('app.js').replace('  init().catch(error => {', `
    window.webUIFixture = {App, compileData, renderCurrentScreen, bindGlobalEvents};
    if (false) init().catch(error => {`));
  const {App, compileData, renderCurrentScreen, bindGlobalEvents} = w.webUIFixture;
  App.config = {url: 'https://fixture.invalid', campaignId: 'main'};
  App.session = {userId: 'p', role: 'player', campaignId: 'main'};
  const p = {id: 'p', name: 'Fixture', displayName: 'Fixture', role: 'player', campaignIds: ['main'], currentPlanetId: 'home', inventory: [], skillPoints: 2, credits: 1500};
  compileData({world_json: {
    players: {PLAYER_TEMPLATES: {p}}, campaigns: {CAMPAIGNS: {main: {id: 'main', name: 'Fixture'}}},
    planets: {PLANETS: {home: {id: 'home', name: 'Home', visibility: {playerIds: ['p']}}}},
    systems: {SYSTEMS: [{id: 's', name: 'System', planetIds: ['home'], visibility: {playerIds: ['p']}}]}
  }, state_json: {}}, [], [], null);
  bindGlobalEvents();
  run(read('web-interface-v313.js'));
  const api = w.GRPGWebUIV313;
  run(read('web-interface-v313.js'));
  assert.equal(w.GRPGWebUIV313, api, 'loading twice must not duplicate icons or handlers');
  assert.equal(w.document.querySelectorAll('.web-nav-icon-v313').length, 7);
  renderCurrentScreen();
  assert.equal(animations.length, 0, 'initial view does not fade');
  const navigate = screen => w.document.querySelector(`.nav-btn[data-screen="${screen}"]`).click();
  for (const screen of ['profile', 'archive', 'tasks', 'market', 'home']) {
    navigate(screen);
    assert.equal(App.ui.screen, screen);
    assert(w.document.querySelector(`#screen-${screen}`).classList.contains('active'));
    assert.equal(w.document.querySelectorAll('.bottom-nav [aria-current="page"]').length, 1);
    assert.equal(w.document.querySelector('.bottom-nav [aria-current="page"]').dataset.screen, screen);
    const count = animations.length;
    renderCurrentScreen();
    assert.equal(animations.length, count, 'data refresh does not replay entrance');
  }
  assert.equal(animations.length, 5);
  // Presentation refresh alone must preserve forms and keyboard focus.
  const input = w.document.createElement('input');
  input.value = 'Unsubmitted draft';
  w.document.querySelector('#screen-home').append(input);
  input.focus();
  api.syncNavigation();
  assert.equal(w.document.activeElement, input);
  assert.equal(input.value, 'Unsubmitted draft');
  motion.matches = true;
  motion.dispatchEvent(new w.Event('change'));
  assert(animations.at(-1).cancelled);
  navigate('profile');
  assert.equal(animations.length, 5, 'reduced motion disables entrances');
  App.ui.screen = 'chat';
  // GalaGram's parent button represents both news and messages.
  w.GRPGNewsWebV159 = {show() {}};
  renderCurrentScreen();
  assert.equal(w.document.querySelector('.bottom-nav [aria-current="page"]').dataset.screen, 'news');
  assert(w.document.querySelector('#nav-hub-v153').classList.contains('hidden'));
  assert.equal(w.document.querySelector('.web-skip-link-v313').hash, '#web-main-v313');
  assert.equal(w.document.querySelector('#web-main-v313').tabIndex, -1);
  console.log('PASS web v313: actual app navigation/render, current section, single initialization, no animation on realtime redraw, preserved draft/focus, reduced motion, GalaGram mapping');
} finally {
  await w.happyDOM.abort();
}
