const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('renderer/app.js');
const stats = read('renderer/stats-engine-v113.js');
const scene = read('renderer/scene-editor-v113.js');
const web = read('deploy/site/app/app.js');

// The old post-render index remapping caused filtered rows to receive names
// from the unfiltered alphabetical list.
assert.doesNotMatch(app, /querySelectorAll\('\[data-config-id\] b'\)/);
assert.match(app, /const primary = configEntityPrimaryNameV1061\(item, this\.selectedType\)/);

// A full Configurator redraw must preserve both relevant scroll containers.
assert.match(app, /previousSideScroll[\s\S]*nextSide\.scrollTop = previousSideScroll/);
assert.match(app, /previousListScroll[\s\S]*nextList\.scrollTop = previousListScroll/);

for (const field of ['hpMax', 'damage', 'hitBonus', 'attackRange', 'moveRange', 'visionRange', 'armorClass', 'defense', 'initiative']) {
  assert.match(app, new RegExp(`name="${field}"`), `missing fauna field ${field}`);
}
assert.match(scene, /createFaunaUnitV146/);
assert.match(scene, /kind==='fauna-unit'\?createFaunaUnitV146/);
assert.match(scene, /fauna_attack_/);

assert.match(app, /\{ value: 'shield', label: 'Щиты' \}/);
assert.match(app, /slotType === 'primaryWeapon'\) return type === 'shield'/);
assert.match(stats, /slot==='primaryWeapon'\)return item\.type==='weapon'\|\|item\.type==='shield'/);
assert.match(web, /type==='primaryWeapon'\)return itemType==='shield'/);
assert.match(web, /type==='secondaryWeapon'\?'Вторичное оружие'/);
assert.match(scene, /String\(item\.type\|\|''\)\.toLowerCase\(\)==='shield'/);

console.log('PASS v146 fauna combat fields, World Config stability and primary-slot shields');
