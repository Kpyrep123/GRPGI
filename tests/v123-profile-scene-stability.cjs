'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('renderer/app.js');
const feature=read('renderer/feature-pack-v120.js');
const css=read('renderer/feature-pack-v120.css');
const scene=read('renderer/scene-editor-v113.js');
const html=read('renderer/index.html');
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));

// The DM publication panel survives transient status and IPC failures.
assert.doesNotMatch(app,/\['packaged-build', 'dm-required'\]\.includes\(status\?\.reason\)/);
assert.match(app,/ensureDevOpsPanelV64\(\);\n\s*if \(devOpsStateV64\.status\) updateDevOpsPanelV64/);
assert.match(app,/reason: 'ipc-unavailable'/);
assert.match(app,/reason: 'status-failed'/);
assert.match(app,/window\.GRPGDevOpsV64 = Object\.freeze/);

// Profile and inventory enhancers are idempotent instead of rebuilding unchanged DOM.
assert.match(feature,/profileRenderSignature123/);
assert.match(feature,/profileRenderSignatureV123===signature/);
assert.match(feature,/itemCardSignatureV123===signature/);
assert.match(feature,/queueMicrotask\(\(\)=>/);
assert.match(css,/\.profile-social-card-v123\{/);
assert.match(css,/\.item-card-description-v120\{[^}]*min-height:23px/);

// Combat data is authoritative in the dedicated local store. Missing combat data in
// campaign App.state is not interpreted as an empty runtime after closing the scene.
assert.match(scene,/const combat = App\?\.state\?\.toolState\?\.\[COMBAT_STATE_KEY\] \|\| null/);
assert.match(scene,/if \(combat\?\.scenes && typeof combat\.scenes === 'object'\) local\.store\.runtimes = clone\(combat\.scenes\)/);
assert.match(scene,/if\(local\.loaded&&local\.store\)applyStore\(clone\(local\.store\)\)/);
assert.match(scene,/stability: \{[^}]*generation:0/);
assert.match(scene,/local\.stability\.generation!==generation/);
assert.match(scene,/function queueStoreSave\(\) \{\n\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n){2}\s*collectStoreFromRuntime\(\)/);

assert.equal(pkg.version,'1.0.132');
assert.equal(pkg.buildVersion,'1.0.132.0');
assert.equal(pkg.build.buildVersion,'1.0.132.0');
assert.equal(lock.version,'1.0.132');
assert.equal(lock.packages[''].version,'1.0.132');
assert.match(html,/APP: v1\.0\.132/);
assert.match(html,/app\.js\?v=1\.0\.132/);
assert.match(html,/scene-editor-v113\.js\?v=1\.0\.132/);
assert.match(html,/feature-pack-v120\.js\?v=1\.0\.132/);

console.log('V123_PROFILE_SCENE_STABILITY_OK');
