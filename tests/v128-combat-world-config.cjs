'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const scene=read('renderer/scene-editor-v113.js');
const display=read('renderer/player-display.js');
const feature=read('renderer/feature-pack-v120.js');
const css=read('renderer/scene-editor-v113.css');
const html=read('renderer/index.html');
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));

// Movement is rendered before persistence, and an opportunity attack shares the
// movement checkpoint instead of adding a second blocking save.
assert.match(scene,/resolveOpportunityAttack122\(source,mover,weapon,\{deferCheckpoint:true\}\)/);
assert.match(scene,/Combat\.render\(\);\n\s*broadcastScene104\(\);\n\s*await checkpointCombat120\(opportunity\.reactionUsed/);
assert.doesNotMatch(scene,/checkpointCombat120\('Сцена: перемещение',true\)/);

// Prone/stand is an explicit movement-cost action and is mirrored to players.
assert.match(scene,/function postureAvailability128/);
assert.match(scene,/Math\.ceil\(total\/2\)/);
assert.match(scene,/data-scene-posture-v128/);
assert.match(display,/proneV122:Boolean\(token\.proneV122\)/);
assert.match(display,/player-scene-token-prone-v128/);

// Preview source identity is used to suppress hidden enemy paths under fog.
assert.match(scene,/sourceTokenId:token\.id/);
assert.match(scene,/function previewVisibleToPlayers128/);
assert.match(display,/function previewKnownToPlayers128/);
assert.match(display,/publicPreview=previewKnownToPlayers128/);

// WC grenade damage is read from the active item panel, not the first hidden input.
assert.match(feature,/activeBlock=form\?\.querySelector\?\.\(`\[data-for-item=/);
assert.match(feature,/if\(activeDamage\)fd\.set\('damage',activeDamage\.value\)/);

// Names can be hidden in WC and are not leaked by labels, initials, or initiative.
assert.match(feature,/Показывать имя юнита игрокам/);
assert.match(feature,/showNameToPlayersV128/);
assert.match(scene,/showNameToPlayers:tokenNameVisibleToPlayers128\(t\)/);
assert.match(display,/Неизвестный юнит/);
assert.match(display,/name\.style\.display=token\.showNameToPlayers/);

// Tactical scale controls are gone; scenes are normalized to direct hex units.
assert.doesNotMatch(scene,/Масштаб одного гекса/);
assert.doesNotMatch(scene,/id="scene-scale-top-v104"/);
assert.match(scene,/next\.scalePerHex = 1/);
assert.match(scene,/next\.scaleLabel = 'гекс'/);

// Inspector supports both scroll axes and player movement uses the slower route animation.
assert.match(css,/overflow-x:auto !important/);
assert.match(display,/Math\.max\(500,Math\.min\(2200,\(preview\.points\.length-1\)\*160\)\)/);

assert.equal(pkg.version,'1.0.132');
assert.equal(pkg.buildVersion,'1.0.132.0');
assert.equal(pkg.build.buildVersion,'1.0.132.0');
assert.equal(lock.version,'1.0.132');
assert.equal(lock.packages[''].version,'1.0.132');
assert.match(html,/APP: v1\.0\.132/);

console.log('V128_COMBAT_WORLD_CONFIG_OK');
