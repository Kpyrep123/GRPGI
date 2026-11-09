import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const {Window} = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const window = new Window();
const context = vm.createContext(window);
for (const file of ['player-sync-core.js', 'item-facts-v141.js', 'hub-multiplayer-v221.js']) {
  vm.runInContext(fs.readFileSync(new URL('../renderer/' + file, import.meta.url), 'utf8'), context);
}

const item = {id:'rifle', name:'Винтовка', type:'weapon', damage:'2d6', description:'Полное описание.'};
const copy = {id:'copy-a', durability:3, durabilityMax:10};
const ammo = {id:'ammo', name:'Патроны', type:'ammo'};
const player = {id:'p', inventory:[{itemId:'rifle', qty:1, instancesV215:[copy]}, {itemId:'ammo', qty:4}], credits:80};
const storage = [{itemId:'ammo', qty:6}];
const rights = {view:true, deposit:true, withdraw:true};
const requests = [];
const planet = {id:'hub'};
const map = {id:'deck'};
const getItem = id => id === item.id ? item : ammo;
const B = {
  currentPlayer:() => player, currentPlanet:() => planet, isActive:() => true,
  marketContext:() => ({campaignId:'main'}),
  playerById:id => ({role:id === 'gm' ? 'gm' : 'player'}),
  item:getItem, itemThumb:entry => '<img src="/' + entry.id + '.png" alt="">',
  inventoryLayout({inventory}, {storageCapacity = 12} = {}) {
    return {cols:5, rows:Math.ceil(storageCapacity / 5), size:storageCapacity,
      instances:inventory.map((row, x) => ({item:getItem(row.itemId), itemId:row.itemId, unitIndex:0,
        qty:row.qty, w:1, h:1, pos:{x,y:0}}))};
  },
  async hubRequest(route, input) {
    if (route === 'presence') return {peers:[{id:'gm',x:2,y:3},{id:'peer',x:4,y:5}]};
    requests.push(input);
    return {rights, contents:rights.view ? {items:storage, cells:1, credits:10} : null, capacity:6};
  }
};
const doc = window.document;
function modal(_title, html) {
  const node = doc.createElement('div');
  node.innerHTML = '<button data-close>Закрыть</button>' + html + '<div data-status></div>';
  doc.body.append(node);
  return node;
}
const {storage:open, presence} = window.GRPGHubMultiplayerV221;
const wait = async () => { await Promise.resolve(); await Promise.resolve(); };
const esc = value => String(value);
const scope = {playerId:player.id, planet, map};
open(B, modal, scope, {id:'box'}, esc);
await wait();

const box = doc.querySelector('[data-hub-storage-v221]');
const left = box.querySelector('[data-storage-side="player"]');
const right = box.querySelector('[data-storage-side="box"]');
assert.equal(left.querySelectorAll('.inventory-grid-cell-v1067').length, 12);
assert.equal(right.querySelectorAll('.inventory-grid-cell-v1067').length, 6);
const rifle = left.querySelector('[data-storage-tile]');
assert(rifle.querySelector('img'));
rifle.click();
const detail = box.querySelector('[data-storage-detail]');
assert.match(detail.textContent, /Винтовка.*Прочность 3 \/ 10/s);
assert.match(detail.textContent, /2d6.*Полное описание/s);
assert.equal(detail.querySelector('button').textContent, 'Сложить');
detail.querySelector('form').dispatchEvent(new window.Event('submit', {bubbles:true,cancelable:true}));
await wait();
assert.equal(requests.at(-1).action, 'deposit');
assert.equal(requests.at(-1).instanceIds[0], copy.id);

const ammoTile = box.querySelector('[data-storage-side="box"] .hub-storage-grid-v221 [data-storage-tile]');
ammoTile.click();
assert.equal(box.querySelector('[data-storage-detail] button').textContent, 'Забрать');
const dataTransfer = new window.DataTransfer();
function drag(node, type) {
  const event = new window.Event(type, {bubbles:true,cancelable:true});
  Object.defineProperty(event, 'dataTransfer', {value:dataTransfer});
  node.dispatchEvent(event);
  return event;
}
drag(ammoTile, 'dragstart');
assert(drag(box.querySelector('[data-storage-side="player"]'), 'dragover').defaultPrevented);
drag(box.querySelector('[data-storage-side="player"]'), 'drop');
await wait();
assert.equal(requests.at(-1).action, 'withdraw');
assert.equal(requests.at(-1).amount, 6);

rights.view = rights.withdraw = false;
box.querySelector('[data-storage-refresh]').click();
await wait();
assert.match(box.querySelector('[data-storage-side="box"]').textContent, /Просмотр содержимого закрыт/);
assert.equal(box.querySelector('[data-storage-side="box"] [data-storage-tile]'), null);

const surface = doc.createElement('div');
doc.body.append(surface);
const stop = presence(B, surface, scope, player, () => ({x:1,y:1}));
await wait();
assert.deepEqual(Array.from(surface.querySelectorAll('.hub-peer-v221'), node => node.title), ['peer']);
stop();
await window.happyDOM.abort();
console.log('PASS storage grid, item details, exact click transfer, stack drag and DM token filtering');
