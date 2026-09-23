'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('renderer/app.js');
const feature = read('renderer/feature-pack-v120.js');
const web = read('deploy/site/app/app.js');
const main = read('main.js');
const preload = read('preload.js');
const Market = require('../sync-server/market-engine.js');

assert.match(feature, /textOnlyInventoryV131/);
assert.match(feature, /inventoryNameHtmlV131/);
assert.match(feature, /Выстрелов за действие/);
assert.match(feature, /equipmentStatsMarkup131/);
assert.match(app, /inventory-text-list-v131/);
assert.match(app, /market-text-list-v131/);
assert.match(app, /equipmentSlots\?\.backpack/);
assert.match(web, /equipmentArchiveStatsWebV131/);
assert.match(web, /web-inventory-text-list-v131/);
assert.match(web, /Выстрелов за действие/);
assert.match(main, /ipcMain\.handle\('market:transaction'/);
assert.match(preload, /transactMarket: payload => ipcRenderer\.invoke\('market:transaction'/);

const equipment = {
  crate: { id: 'crate', mass: 1, inventoryWidth: 1, inventoryHeight: 1 },
  ammo: { id: 'ammo', mass: 0.1, inventoryWidth: 1, inventoryHeight: 1, stackable: true, stackLimit: 5 },
  pass: { id: 'pass', mass: 999, inventoryWidth: 9, inventoryHeight: 9, textOnlyInventory: true },
  backpack: { id: 'backpack', type: 'backpack', mass: 1, inventoryWidth: 1, inventoryHeight: 1 }
};
const player = {
  id: 'p1', currentPlanetId: 'earth', inventorySize: 5, carryWeightMax: 10, credits: 100,
  inventory: [
    { itemId: 'crate', qty: 4, positions: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}] },
    { itemId: 'ammo', qty: 4, positions: [{x:4,y:0},null,null,null] },
    { itemId: 'pass', qty: 3, positions: [] }
  ],
  equipmentSlots: {}, implantSlots: []
};

const layout = Market.layoutInventory(player, equipment);
assert.equal(layout.cols, 5);
assert.equal(layout.instances.length, 5, 'four crates and one ammunition stack occupy five cells');
assert.equal(layout.text.length, 1);
assert.equal(layout.text[0].qty, 3);
assert.equal(layout.weight, 4.4, 'text-only items must not contribute mass');

const world = {
  planets: { PLANETS: { earth: { id: 'earth', market: [
    { itemId: 'pass', enabled: true, appearanceChance: 100, minPrice: 1, maxPrice: 1 },
    { itemId: 'ammo', enabled: true, appearanceChance: 100, minPrice: 1, maxPrice: 1 },
    { itemId: 'backpack', enabled: true, appearanceChance: 100, minPrice: 1, maxPrice: 1 }
  ] } } },
  equipment: { EQUIPMENT: equipment }
};

const boughtText = Market.executeTransaction({ campaignId:'main', world, state:{}, player, action:'buy', planetId:'earth', itemId:'pass', targetPosition:{x:0,y:0}, now:new Date('2026-09-12T00:00:00Z') });
assert.equal(boughtText.player.inventory.find(row => row.itemId === 'pass').qty, 4);
assert.equal(boughtText.placement.textOnly, true);

const boughtStack = Market.executeTransaction({ campaignId:'main', world, state:{}, player, action:'buy', planetId:'earth', itemId:'ammo', targetPosition:{x:0,y:0}, now:new Date('2026-09-12T00:00:00Z') });
assert.equal(boughtStack.player.inventory.find(row => row.itemId === 'ammo').qty, 5);
assert.equal(Market.layoutInventory(boughtStack.player, equipment).overflow.length, 0);

const equippedBackpack = {
  ...player,
  inventorySize: 6,
  inventory: [...player.inventory, { itemId:'backpack', qty:1, positions:[{x:0,y:1}] }],
  equipmentSlots: { backpack:'backpack' }
};
assert.throws(
  () => Market.executeTransaction({ campaignId:'main', world, state:{}, player:equippedBackpack, action:'sell', planetId:'earth', itemId:'backpack', now:new Date('2026-09-12T00:00:00Z') }),
  /экипированный экземпляр/i
);

console.log('V131_ARCHIVE_TEXT_INVENTORY_SYNC_OK');
