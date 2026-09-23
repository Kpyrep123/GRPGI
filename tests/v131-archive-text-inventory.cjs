'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const desktop = read('renderer/feature-pack-v120.js');
const desktopCss = read('renderer/feature-pack-v120.css');
const web = read('deploy/site/app/app.js');
const webCss = read('deploy/site/app/styles.css');

assert.match(desktop, /textInventoryItems/);
assert.match(desktop, /Предметы без веса/);
assert.match(desktop, /textInventoryNameV131/);
assert.match(desktop, /__renderRichText\(text/);
assert.match(desktop, /Выстрелов за действие/);
assert.match(desktop, /rapidFireShots\|\|1/);
assert.match(desktop, /archive-equipment-facts-v131/);
assert.match(desktop, /item\.textOnlyInventory=false/);
assert.match(desktopCss, /profile-text-inventory-v131/);

assert.match(web, /archiveEquipmentFactsWebV131/);
assert.match(web, /Выстрелов за действие/);
assert.match(web, /textInventoryItems/);
assert.match(web, /web-text-inventory-v131/);
assert.match(web, /normalizeRichHtml\(row\.name\)/);
assert.match(web, /item\.rapidFireShots=Math\.max\(1,Math\.trunc/);
assert.match(webCss, /web-text-inventory-row-v131/);

console.log('v1.0.131 archive/text inventory compatibility regression: OK');
