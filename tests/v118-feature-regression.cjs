'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const featureSource = fs.readFileSync(path.join(root, 'renderer/feature-pack-v118.js'), 'utf8');
const feature119Source = fs.readFileSync(path.join(root, 'renderer/feature-pack-v119.js'), 'utf8');
const sceneSource = fs.readFileSync(path.join(root, 'renderer/scene-editor-v113.js'), 'utf8');
const webSource = fs.readFileSync(path.join(root, 'deploy/site/app/app.js'), 'utf8');
const desktopHtml = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
const webHtml = fs.readFileSync(path.join(root, 'deploy/site/app/index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const web118Start = webSource.indexOf('  /* v1.0.122 —');
const webBlock = webSource.slice(web118Start, webSource.indexOf('  /* v1.0.120 —', web118Start));

function legacyItemNormalizer(raw = {}) {
  const allowed = new Set(['weapon','armor','implant','gear']);
  return { ...raw, type: allowed.has(String(raw.type)) ? String(raw.type) : 'gear' };
}

const basePlayer = raw => ({ ...raw, baseStats: { ...(raw.baseStats || {}) }, combat: { ...(raw.combat || {}) } });
const context = {
  console,
  structuredClone,
  setTimeout,
  clearTimeout,
  window: {},
  document: {
    body: {},
    getElementById() { return null; },
    addEventListener() {},
    createElement() { return { innerHTML: '', content: { querySelector() { return null; } } }; }
  },
  MutationObserver: class { observe() {} },
  FormData: class {},
  normalizeEquipmentItemV2: legacyItemNormalizer,
  normalizePlayerProfileV2: basePlayer,
  EQUIPMENT: {
    ammo_plasma: { id: 'ammo_plasma', name: 'Плазменный заряд', type: 'ammo', modifiers: [{ target: 'damage_bonus', op: 'add', value: 2 }] },
    rifle: { id: 'rifle', name: 'Винтовка', type: 'weapon', ammoTypeId: 'ammo_plasma', magazineSize: 12, ammoPerShot: 2 }
  },
  PLAYER_TEMPLATES: {},
  NPCS: {},
  Data: { getItem(id) { return context.EQUIPMENT[id] || null; }, skills: {} },
  worldData: { skills: { SKILLS: {} } },
  App: { state: { users: {} }, currentUser: null },
  UI: { renderProfile() {} },
  Configurator: {
    selectedType: '',
    selectedId: '',
    equipmentCategoryV1052: 'gear',
    renderPlayerEditor() { return '<form></form>'; },
    renderEquipmentEditor() { return '<form><select class="select" name="type"></select><div class="field"><label>Теги</label></div><button class="primary" type="submit">SAVE_ITEM</button></form>'; },
    renderSkillEditor() { return '<form><div class="field"><label>Категория</label></div></form>'; },
    render() {},
    collectEntity(type, form, fd) {
      return type === 'players'
        ? { id: 'p', baseStats: { vision: 6 }, combat: { visionRange: Number(fd?.get?.('combatVisionRange') || 6) } }
        : { id: type };
    },
    insertEntity() {},
    remapReferences() {},
    renderNpcEditorV60() { return '<form><button class="primary" type="submit">SAVE_NPC</button></form>'; }
  },
  applyWorldData() {},
  esc(value) { return String(value ?? ''); },
  deep(value) { return structuredClone(value); }
};
context.window = context;
context.window.GRPGStatsV113 = { computePlayer(player) { return { values: { vision: Number(player.baseStats?.vision || 0) + 3 } }; } };

vm.createContext(context);
vm.runInContext(featureSource, context, { filename: 'feature-pack-v118.js' });
vm.runInContext(feature119Source, context, { filename: 'feature-pack-v119.js' });

const ammo = context.normalizeEquipmentItemV2({ id: 'a', type: 'ammo', stackLimit: 80, mass: 0.03 });
assert.equal(ammo.type, 'ammo');
assert.equal(ammo.stackable, true);
assert.equal(ammo.stackLimit, 80);
assert.equal(ammo.inventoryWidth, 1);

const weapon = context.normalizeEquipmentItemV2({ id: 'w', type: 'weapon', ammoTypeId: 'a', magazineSize: 30, ammoPerShot: 3 });
assert.equal(weapon.ammoTypeId, 'a');
assert.equal(weapon.magazineSize, 30);
assert.equal(weapon.ammoPerShot, 3);
assert.equal(weapon.stackable, false);
assert.equal(weapon.stackLimit, 1);
const scriptedWeapon = context.normalizeEquipmentItemV2({ id: 'lua_w', type: 'weapon', luaEnabled: true, luaTriggerMode: 'reaction', luaReactionLabel: 'Щит', luaScript: 'function BeforeDamage() end' });
assert.equal(scriptedWeapon.luaEnabled, true);
assert.equal(scriptedWeapon.luaTriggerMode, 'reaction');
assert.equal(scriptedWeapon.luaReactionLabel, 'Щит');
assert.match(scriptedWeapon.luaScript, /BeforeDamage/);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.GRPGFeaturePackV118.normalizeLootTable([{ itemId: 'a', chance: 130, minQty: 4, maxQty: 2 }]))),
  [{ itemId: 'a', chance: 100, minQty: 4, maxQty: 4 }]
);
assert.equal(context.GRPGFeaturePackV118.normalizeActivationType('active', 'skill'), 'active');
assert.equal(context.GRPGFeaturePackV118.normalizeActivationType('reaction', 'specialization'), 'passive');
assert.match(context.GRPGFeaturePackV118.modifierText({ target: 'damage_bonus', op: 'add', value: 2 }), /Урон · \+2/);

const fieldData = values => ({ get(name) { return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null; } });
const collectedPlayer = context.Configurator.collectEntity('players', null, fieldData({ v113p_vision: '9' }));
assert.equal(collectedPlayer.baseStats.vision, 9);
assert.equal(collectedPlayer.combat.visionRange, 12);
const collectedAmmo = context.Configurator.collectEntity('equipment', null, fieldData({ type: 'ammo', magazineSize: '0', ammoPerShot: '1' }));
assert.equal(collectedAmmo.type, 'ammo');
assert.equal(collectedAmmo.stackable, true);
const equipmentEditor = context.Configurator.renderEquipmentEditor({ id: 'rifle', type: 'weapon', ammoTypeId: 'ammo_plasma', magazineSize: 12, ammoPerShot: 2 });
assert.match(equipmentEditor, /value="ammo"/);
assert.match(equipmentEditor, /name="ammoTypeId"/);
assert.match(equipmentEditor, /name="magazineSize"/);
assert.match(equipmentEditor, /name="luaScript"/);
assert.match(equipmentEditor, /name="luaTriggerMode"/);
const skillEditor = context.Configurator.renderSkillEditor({ id: 'dash', skillType: 'skill', activationType: 'active' });
assert.match(skillEditor, /name="activationType"/);
assert.match(skillEditor, /value="active" selected/);
assert.match(skillEditor, /data-lua-editor-v119/);
const collectedLuaItem = context.Configurator.collectEntity('equipment', null, fieldData({ type: 'weapon', luaEnabled: 'on', luaTriggerMode: 'reaction', luaReactionLabel: 'Перехват', luaScript: 'function BeforeDamage() ReduceDamage(2) end' }));
assert.equal(collectedLuaItem.luaEnabled, true);
assert.equal(collectedLuaItem.luaTriggerMode, 'reaction');
assert.equal(collectedLuaItem.luaReactionLabel, 'Перехват');
assert.match(collectedLuaItem.luaScript, /ReduceDamage/);

assert.ok(Number(pkg.version.split('.').at(-1)) >= 118);
assert.equal(pkg.buildVersion, `${pkg.version}.0`);
assert.ok(desktopHtml.indexOf('scene-editor-v113.js') < desktopHtml.indexOf('feature-pack-v118.js'), 'feature pack must load after the scene editor');
assert.match(desktopHtml, new RegExp(`APP: v${pkg.version.replaceAll('.', '\\.')}`));
assert.match(webHtml, new RegExp(`styles\\.css\\?v=${pkg.version.replaceAll('.', '\\.')}`));
assert.match(webHtml, new RegExp(`app\\.js\\?v=${pkg.version.replaceAll('.', '\\.')}`));

assert.match(featureSource, /formData|get\('v113p_vision'\)/);
assert.match(featureSource, /combatVisionRange/);
assert.match(sceneSource, /currentMagazine\.loaded-=shotCost/);
assert.match(sceneSource, /temporaryModifiers/);
assert.match(sceneSource, /attack\?\.damageBonus/);
assert.match(sceneSource, /inCombat:true, temporaryModifiers/);
assert.match(sceneSource, /data-scene-reload-v118/);
assert.match(sceneSource, /lootStateV118/);
assert.match(sceneSource, /class="scene-token-loot-v118" data-scene-search-v118/);
assert.match(sceneSource, /data-scene-skill-v118/);
assert.match(sceneSource, /scene-measurebar-v118/);
assert.match(webSource, /function derivedPlayerWeb118/);
assert.match(webSource, /function applyFormulaWeb118/);
assert.match(webSource, /incoming_weapon_category/);
assert.match(webSource, /type==='backpack'/);
assert.match(webSource, /web-item-modifiers-v118/);
assert.match(webSource, /item\.stackable===true\?Math\.ceil/);

const webContext = {
  console,
  structuredClone,
  deep: value => structuredClone(value),
  window: {},
  document: { querySelector() { return null; } },
  $() { return null; },
  esc(value) { return String(value ?? ''); },
  renderEntityThumb() { return '<i></i>'; },
  currentPlayer() { return null; },
  normalizedItemTypeV1052(item = {}) { return String(item.type || 'gear'); },
  normalizeInventoryEntryWebV1067(entry = {}) { return { ...entry, itemId: String(entry.itemId || ''), qty: Math.max(0, Math.trunc(Number(entry.qty || 0))), positions: Array.isArray(entry.positions) ? entry.positions : [] }; },
  normalizeInventoryPlayerWebV1067(player = {}) { return structuredClone(player); },
  inventoryColsWebV1067() { return 5; },
  equippedCountsWebV1067() { return new Map(); },
  slotAcceptsWebV1067() { return false; },
  webSlotLabelV1067(type) { return type; },
  buildInventoryLayoutWebV1067() { return {}; },
  webSlotMarkupV1067() { return ''; },
  webGridMarkupV1067() { return ''; },
  webInventoryPanelV1067() { return ''; },
  profileItemDetailMarkupV1060() { return '<div class="divider"></div>'; },
  showWebSkillTip() {},
  compileData() {},
  renderProfile() {},
  getSlotWebV1067(user, type, index = -1) { return type === 'implant' ? String(user.implantSlots?.[index] || '') : String(user.equipmentSlots?.[type] || ''); },
  itemSizeWebV1067(item = {}) { return { w: Math.max(1, Number(item.inventoryWidth || 1)), h: Math.max(1, Number(item.inventoryHeight || 1)) }; },
  fitsWebV1067(size, cols, occupied, x, y, w, h) { if (x < 0 || y < 0 || x + w > cols) return false; for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) if (yy * cols + xx >= size || occupied.has(`${xx}:${yy}`)) return false; return true; },
  firstFitWebV1067(size, cols, occupied, w, h) { for (let y = 0; y < Math.ceil(size / cols); y += 1) for (let x = 0; x < cols; x += 1) if (webContext.fitsWebV1067(size, cols, occupied, x, y, w, h)) return { x, y }; return null; },
  markOccWebV1067(occupied, x, y, w, h) { for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) occupied.add(`${xx}:${yy}`); },
  inventoryWeightWebV1067(user = {}) { return (user.inventory || []).reduce((sum, row) => sum + Number(webContext.App.data.items.get(row.itemId)?.mass || 0) * Number(row.qty || 0), 0); },
  App: { data: { items: new Map(), skills: new Map(), players: new Map(), socialOrigins: new Map(), geographicOrigins: new Map() } }
};
webContext.window = webContext;
webContext.itemWebV1067 = itemId => webContext.App.data.items.get(String(itemId || '')) || { id: String(itemId || ''), type: 'gear', mass: 1, inventoryWidth: 1, inventoryHeight: 1 };
webContext.App.data.items = new Map([
  ['backpack', { id: 'backpack', name: 'Рюкзак', type: 'backpack', mass: 1, modifiers: [{ target: 'inventory_slots', op: 'add', value: 4 }, { target: 'carry_capacity', op: 'add', value: 5 }] }],
  ['armor', { id: 'armor', name: 'Броня', type: 'armor', mass: 3, modifiers: [{ target: 'armor_class', op: 'replace_stat', statRef: 'intelligence' }, { target: 'armor_class', op: 'add', value: 2 }, { target: 'defense', op: 'add', value: 3 }, { target: 'defense', op: 'add', value: 9, condition: 'incoming_weapon_category', conditionValue: 'heavy' }] }],
  ['implant', { id: 'implant', name: 'Имплант', type: 'implant', mass: 0.1, modifiers: [{ target: 'vision', op: 'add', value: 2 }] }],
  ['ghost_implant', { id: 'ghost_implant', name: 'Чужой имплант', type: 'implant', mass: 0.1, modifiers: [{ target: 'vision', op: 'add', value: 100 }] }],
  ['ammo', { id: 'ammo', name: 'Патроны', type: 'ammo', mass: 0.02, stackLimit: 999 }],
  ['rifle', { id: 'rifle', name: 'Винтовка', type: 'weapon', weaponCategory: 'light', hitBonus: 1, weaponSkillId: 'shooting', weaponSkillBonus: 2 }]
]);
webContext.App.data.skills.set('shooting',{id:'shooting',name:'Стрельба'});
webContext.App.data.geographicOrigins.set('origin', { id: 'origin', abilityBonuses: { strength: 1 } });
vm.createContext(webContext);
vm.runInContext(webBlock, webContext, { filename: 'web-v118-block.js' });
const webPlayer = webContext.GRPGWebFeaturePackV118.normalizePlayer({
  id: 'pilot', geographicOriginId: 'origin', skills:['shooting'],
  abilityBase: { strength: 2, dexterity: 1, intelligence: 4 },
  baseStats: { inventorySlots: 12, carryBase: 10, implantSlots: 2, armorClass: 1, defense: 0, vision: 5, movement: 6 },
  inventory: [{ itemId: 'backpack', qty: 1 }, { itemId: 'armor', qty: 1 }, { itemId: 'implant', qty: 1 }, { itemId: 'ammo', qty: 1000 }],
  equipmentSlots: { backpack: 'backpack', armor: 'armor' },
  implantSlots: ['implant', 'ghost_implant']
});
assert.equal(webPlayer.abilities.strength, 3);
assert.equal(webPlayer.inventorySize, 16);
assert.equal(webPlayer.carryWeightMax, 21);
assert.equal(webPlayer.stats.armorClass, 7);
assert.equal(webPlayer.stats.defense, 3);
assert.equal(webPlayer.combat.visionRange, 7);
assert.equal(webContext.GRPGWebFeaturePackV118.weaponAttack(webPlayer,webContext.App.data.items.get('rifle')).bonus,4);
assert.deepEqual(JSON.parse(JSON.stringify(webPlayer.implantSlots)), ['implant', '']);
assert.equal(webContext.buildInventoryLayoutWebV1067(webPlayer).instances.filter(row => row.itemId === 'ammo').length, 2);
assert.equal(webContext.GRPGWebFeaturePackV119.normalizeItem({ id: 'grenade', type: 'grenade', stackable: true, stackLimit: 20 }).stackLimit, 1);

console.log('v1.0.118 feature regression checks passed');
