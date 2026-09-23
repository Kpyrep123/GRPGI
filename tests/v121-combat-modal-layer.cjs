'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const css=read('renderer/feature-pack-v120.css');
const baseCss=read('renderer/styles.css');
const scene=read('renderer/scene-editor-v113.js');
const html=read('renderer/index.html');
const pkg=JSON.parse(read('package.json'));

const overlayRule=css.match(/body>\.scene-lua-overlay-v119\s*\{([\s\S]*?)\}/)?.[1]||'';
assert.match(overlayRule,/position:\s*fixed\s*!important/);
assert.match(overlayRule,/inset:\s*0\s*!important/);
assert.match(overlayRule,/display:\s*grid\s*!important/);
assert.match(overlayRule,/pointer-events:\s*auto\s*!important/);
const overlayZ=Number(overlayRule.match(/z-index:\s*(\d+)/)?.[1]||0);
const moduleZ=Number(baseCss.match(/\.fs-module\{[^}]*z-index:(\d+)/)?.[1]||0);
assert.ok(moduleZ>=4000,'fullscreen module layer must be detected');
assert.ok(overlayZ>moduleZ,`combat modal z-index ${overlayZ} must exceed fullscreen module ${moduleZ}`);
assert.match(scene,/document\.body\.appendChild\(overlay\)/);
assert.match(scene,/finally\{finishCombatTransaction120\(transaction\);\}/);
assert.match(html,/feature-pack-v120\.css\?v=1\.0\.132/);
assert.match(html,/APP: v1\.0\.132/);
assert.equal(pkg.version,'1.0.132');
assert.equal(pkg.buildVersion,'1.0.132.0');
assert.equal(pkg.build.buildVersion,'1.0.132.0');

console.log('V121_COMBAT_MODAL_LAYER_OK');
