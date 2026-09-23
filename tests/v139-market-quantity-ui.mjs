import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const { Window } = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeWindow(url) {
  const window = new Window({ url, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.console = { ...console, log() {}, debug() {}, warn() {}, error() {} };
  window.setInterval = () => 0;
  window.requestAnimationFrame = () => 0;
  window.confirm = () => true;
  return window;
}

{
  const window = makeWindow('https://desktop.grpgi.test');
  const context = vm.isContext(window) ? window : vm.createContext(window);
  const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
  window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
  window.electronAPI = { appVersion: '1.0.140', debugLog: async () => {} };
  const scripts = [...html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g)].map(match => match[1]);
  for (const file of scripts) {
    let source = fs.readFileSync(path.join(root, 'renderer', file), 'utf8');
    if (file === 'app.js') {
      const marker = '  const renderNewsBeforeStocksV1074=UI.renderNews.bind(UI);';
      assert.equal(source.split(marker).length, 2, 'desktop market test export marker');
      source = source.replace(marker, `  window.__marketQuantityV139={quantityControlsV139,updateQuantityControlV139};\n${marker}`);
    }
    vm.runInContext(source, context, { filename: file });
  }
  vm.runInContext(`
    App.state=makeDefaultState();
    App.state.users.p={id:'p',role:'player',displayName:'Игрок',credits:1000,inventory:[]};
    App.currentUserId='p';
    document.getElementById('market-items').innerHTML=window.__marketQuantityV139.quantityControlsV139({
      user:App.currentUser,item:{id:'share'},offer:{price:125},buy:true,stock:true,owned:0
    });
  `, context);
  const control = window.document.querySelector('[data-market-quantity-v139]');
  const input = control.querySelector('[data-market-qty-input-v139]');
  input.value = '7';
  vm.runInContext('window.__marketQuantityV139.updateQuantityControlV139(document.querySelector("[data-market-quantity-v139]"))', context);
  assert.match(control.querySelector('[data-market-qty-total-v139]').textContent, /875/);
  assert.match(control.querySelector('[data-market-action-v1074]').textContent, /7 акц\./);
  input.value = '99';
  vm.runInContext('window.__marketQuantityV139.updateQuantityControlV139(document.querySelector("[data-market-quantity-v139]"))', context);
  assert.equal(input.value, '8', 'desktop quantity is capped by available credits');
  vm.runInContext(`
    window.GRPGInventoryV1067={canAddItem(player,itemId,quantity){return quantity<=2?{ok:true}:{ok:false,reason:'Недостаточно свободных ячеек.'};}};
    document.getElementById('market-items').innerHTML=window.__marketQuantityV139.quantityControlsV139({
      user:App.currentUser,item:{id:'crate'},offer:{price:50},buy:true,stock:false,owned:0
    });
    document.querySelector('[data-market-qty-input-v139]').value='3';
    window.__marketQuantityV139.updateQuantityControlV139(document.querySelector('[data-market-quantity-v139]'));
  `, context);
  assert.equal(window.document.querySelector('[data-market-action-v1074]').disabled, true);
  assert.match(window.document.querySelector('[data-market-qty-error-v139]').textContent, /свободных ячеек/);
  console.log('PASS desktop quantity selector updates total and enforces purchase/capacity limits');
  await window.happyDOM.abort();
}

{
  const window = makeWindow('https://web.grpgi.test');
  const context = vm.isContext(window) ? window : vm.createContext(window);
  const html = fs.readFileSync(path.join(root, 'deploy/site/app/index.html'), 'utf8');
  window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
  for (const file of ['rich-text-scope.js', 'market-engine.js', 'player-sync-core.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'deploy/site/app', file), 'utf8'), context, { filename: file });
  }
  let source = fs.readFileSync(path.join(root, 'deploy/site/app/app.js'), 'utf8');
  const exportMarker = '  function marketSelectionWebMarkupV1071(rotation,player)';
  assert.equal(source.split(exportMarker).length, 2, 'web market test export marker');
  source = source.replace(exportMarker, `  window.__marketQuantityWebV139={quantityControlsWebV139,updateMarketQuantityWebV139};\n${exportMarker}`);
  const initMarker = '  init().catch(error => {';
  assert.equal(source.split(initMarker).length, 2, 'web init marker');
  source = source.replace(initMarker, '  if(false) init().catch(error => {');
  vm.runInContext(source, context, { filename: 'app.js' });
  vm.runInContext(`
    document.getElementById('screen-market').innerHTML=window.__marketQuantityWebV139.quantityControlsWebV139({
      player:{id:'p',credits:900},item:{id:'share'},offer:{price:150},buy:true,stock:true,owned:0
    });
  `, context);
  const control = window.document.querySelector('[data-web-market-quantity-v139]');
  const input = control.querySelector('[data-web-market-qty-input-v139]');
  input.value = '4';
  vm.runInContext('window.__marketQuantityWebV139.updateMarketQuantityWebV139(document.querySelector("[data-web-market-quantity-v139]"))', context);
  assert.match(control.querySelector('[data-web-market-qty-total-v139]').textContent, /600/);
  assert.match(control.querySelector('[data-web-stock-action-v1074]').textContent, /4 акц\./);
  input.value = '999';
  vm.runInContext('window.__marketQuantityWebV139.updateMarketQuantityWebV139(document.querySelector("[data-web-market-quantity-v139]"))', context);
  assert.equal(input.value, '6', 'web quantity is capped by available credits');
  console.log('PASS web quantity selector updates total and enforces purchase limit');
  await window.happyDOM.abort();
}

const desktopHtml = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
const webHtml = fs.readFileSync(path.join(root, 'deploy/site/app/index.html'), 'utf8');
const landingHtml = fs.readFileSync(path.join(root, 'deploy/site/index.html'), 'utf8');
const visibleCopySources = [
  fs.readFileSync(path.join(root, 'renderer/app.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'renderer/campaign-studio.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'renderer/scene-editor-v113.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'deploy/site/app/app.js'), 'utf8')
].join('\n');
assert.match(desktopHtml, /technology-theme-v139\.css\?v=1\.0\.140/);
assert.match(webHtml, /technology-theme-v139\.css\?v=1\.0\.140/);
assert.match(landingHtml, /technology-theme-v139\.css\?v=1\.0\.140/);
for (const file of ['renderer/technology-theme-v139.css', 'deploy/site/app/technology-theme-v139.css', 'deploy/site/technology-theme-v139.css']) {
  const css = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(css, /#b99358/i, `${file}: muted brass accent`);
  assert.match(css, /linear-gradient/, `${file}: material surface`);
}
for (const forbidden of ['CHARACTER_ACCESS', 'WEB CLIENT', 'PocketBase secure session', 'LOCAL_TERMINAL', 'GLOBAL SECURITIES', 'PERSONAL STORAGE']) {
  assert.ok(!desktopHtml.includes(forbidden), `desktop copy still contains ${forbidden}`);
  assert.ok(!webHtml.includes(forbidden), `web copy still contains ${forbidden}`);
}
for (const forbidden of ['PLANET_SCAN', 'SYSTEM_SCAN', 'GALAXY_NAV', 'ACTIVE VIEW', 'Realtime sync', 'TACTICAL_SCENE_NODE', '>CHARACTER_LORE<', '>CHARACTER_APPLICATION<', '>SCENE_EDITOR<', 'SYNC ПРИОСТАНОВЛЕН']) {
  assert.ok(!visibleCopySources.includes(forbidden), `player-facing source still contains ${forbidden}`);
}
console.log('PASS technological theme is linked everywhere and prominent player-facing technical copy is removed');
console.log('ALL V139 MARKET UI CHECKS PASSED');
