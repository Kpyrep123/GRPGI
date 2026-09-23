'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const codec = require('../renderer/world-json-transfer-v132.js');

const sections = {
  players: { mapKey: 'PLAYER_TEMPLATES', listKey: 'PLAYER_LIST' },
  systems: { arrayKey: 'SYSTEMS' },
  npcs: { mapKey: 'NPCS', listKey: 'NPC_LIST' },
  equipment: { mapKey: 'EQUIPMENT', listKey: 'EQUIPMENT_LIST' },
  articles: { mapKey: 'ARTICLES', listKey: 'ARTICLE_LIST' },
  navigation: { special: true }
};

assert.equal(codec.VERSION, '1.0.132');
assert.deepEqual(codec.sectionEntries('systems', sections, { SYSTEMS: [{ id: 'sol', name: 'Солнце' }] }), [{ id: 'sol', name: 'Солнце' }]);
assert.deepEqual(codec.sectionEntries('npcs', sections, { NPCS: { medic: { name: 'Медик' } } }), [{ name: 'Медик', id: 'medic' }]);
assert.deepEqual(codec.sectionEntries('articles', sections, [{ id: 'entry', body: '<a href="https://example.test">Ссылка</a>' }])[0].body, '<a href="https://example.test">Ссылка</a>');
assert.deepEqual(codec.sectionEntries('equipment', sections, { entities: { pistol: { id: 'pistol', damage: '1d6' } } })[0], { id: 'pistol', damage: '1d6' });

const exported = codec.canonicalExportPayload('equipment', sections, {
  EQUIPMENT: { rifle: { id: 'rifle', name: 'Винтовка', rapidFireShots: 4 } },
  EQUIPMENT_LIST: [{ id: 'stale', name: 'Устаревшая копия' }]
});
assert.deepEqual(Object.keys(exported), ['EQUIPMENT']);
assert.equal(exported.EQUIPMENT.rifle.rapidFireShots, 4);
assert.equal(exported.EQUIPMENT_LIST, undefined);

const summary = codec.summarize('npcs', sections, { NPCS: { a: { id: 'a', hp: 1 }, b: { id: 'b', hp: 2 } } }, [
  { id: 'a', hp: 3 },
  { id: 'c', hp: 1 }
]);
assert.deepEqual(summary, { total: 2, added: 1, updated: 1, unchanged: 0, missing: 1, current: 2 });

assert.throws(() => codec.sectionEntries('equipment', sections, { NPCS: {} }), /другой раздел/);
assert.throws(() => codec.sectionEntries('npcs', sections, { NPCS: { a: { id: 'different' } } }), /не совпадает/);
assert.throws(() => codec.sectionEntries('npcs', sections, [{ id: 'same' }, { id: 'same' }]), /Повторяющийся/);
assert.throws(() => codec.sectionEntries('npcs', sections, JSON.parse('{"NPCS":{"bad":{"id":"bad","__proto__":{"polluted":true}}}}')), /Недопустимый ключ/);
assert.throws(() => codec.sectionEntries('navigation', sections, {}), /не поддерживает/);

const main = read('main.js');
const preload = read('preload.js');
const feature = read('renderer/feature-pack-v120.js') + read('renderer/world-json-ui-v134.js');
const html = read('renderer/index.html');
const css = read('renderer/feature-pack-v120.css');
const pkg = require('../package.json');
const lock = require('../package-lock.json');

assert.match(main, /WORLD_JSON_IMPORT_MAX_BYTES\s*=\s*64\s*\*\s*1024\s*\*\s*1024/);
assert.match(main, /world:section:exportJson/);
assert.match(main, /world:section:importJson/);
assert.match(main, /replace\(\/\^\\uFEFF\//);
assert.match(preload, /exportWorldSectionJson/);
assert.match(preload, /importWorldSectionJson/);
assert.match(feature, /JSON_IMPORT_PREVIEW/);
assert.match(feature, /WORLD_CONFIG_JSON_IMPORT/);
assert.match(feature, /saveWorldSection\(type,nextSnapshot\[type\]\)/);
assert.match(feature, /writeLocalMirrors:false/);
assert.match(feature, /Полная замена персонажей должна содержать профиль gm/);
assert.match(html, /world-json-transfer-v132\.js\?v=1\.0\.134/);
assert.match(css, /world-json-modal-v132/);
assert.equal(pkg.version, '1.0.134');
assert.equal(pkg.buildVersion, '1.0.134.0');
assert.equal(pkg.build.buildVersion, '1.0.134.0');
assert.equal(lock.version, '1.0.134');
assert.equal(lock.packages[''].version, '1.0.134');

console.log('v1.0.132 World Config JSON transfer regression: OK');
