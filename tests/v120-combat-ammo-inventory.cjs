'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const scene=read('renderer/scene-editor-v113.js');
const rulesSource=read('renderer/combat-rules-v119.js');
const stats=read('renderer/stats-engine-v113.js');
const feature=read('renderer/feature-pack-v120.js');
const featureCss=read('renderer/feature-pack-v120.css');
const web=read('deploy/site/app/app.js');
const webCss=read('deploy/site/app/styles.css');
const desktopHtml=read('renderer/index.html');
const webHtml=read('deploy/site/app/index.html');
const pkg=JSON.parse(read('package.json'));

const rulesContext={console,Math};rulesContext.window=rulesContext;rulesContext.globalThis=rulesContext;
vm.createContext(rulesContext);vm.runInContext(rulesSource,rulesContext,{filename:'combat-rules-v119.js'});
const Rules=rulesContext.GRPGCombatRulesV119;
assert.equal(Rules.version,'1.0.122');
assert.equal(Rules.resolveManualAttack({attackRoll:1,attackBonus:15,defenseRoll:2,defenseBonus:0,damageRoll:7,damageReduction:2}).hit,false);
assert.equal(Rules.resolveManualAttack({attackRoll:1,attackBonus:0,defenseRoll:20,defenseBonus:0,damageRoll:7}).hit,false);
assert.deepEqual(JSON.parse(JSON.stringify(Rules.reduceDamage(9,3))),{raw:9,reduction:3,absorbed:3,applied:6});

const featureContext={
  console,structuredClone,setTimeout,clearTimeout,
  window:{},
  document:{body:{},getElementById(){return null;},createElement(){return{innerHTML:'',content:{querySelector(){return null;}}};}},
  MutationObserver:class{observe(){}},
  normalizeEquipmentItemV2(raw={}){return{...raw};},
  normalizeSkillV50(raw={}){return{...raw};},
  normalizePlayerProfileV2(raw={}){return structuredClone(raw);},
  isSpecializationV55(){return true;},
  EQUIPMENT:{round:{id:'round',type:'ammo',stackLimit:50},rifle:{id:'rifle',type:'weapon',stackable:true,stackLimit:10}},
  SKILLS_V50:{old:{id:'old',name:'Старая специализация',type:'specialization'}},
  PLAYER_TEMPLATES:{pilot:{id:'pilot',skills:[],specializations:{old:3}}},
  Data:{skills:{old:{id:'old',name:'Старая специализация',type:'specialization'}}},
  worldData:{skills:{SKILLS:{old:{id:'old',name:'Старая специализация',type:'specialization'}}}},
  App:{state:{users:{}},currentUser:null,currentUserId:''},
  UI:{renderProfile(){}},
  Configurator:{selectedType:'',renderEquipmentEditor(){return'<form></form>';},renderSkillEditor(){return'<form></form>';},collectEntity(type){return{id:type,visibility:{playerIds:['p1'],campaignIds:['main'],eraIds:['industrial']}};},insertEntity(){},render(){}},
  applyWorldData(){},buildWorldSnapshot(){return{skills:{SKILLS:{scoped:{id:'scoped',visibility:{playerIds:['p1'],campaignIds:['main'],eraIds:['industrial']}}}},players:{PLAYER_TEMPLATES:{}}};},
  deep:value=>structuredClone(value),esc:value=>String(value??'')
};
featureContext.window=featureContext;
vm.createContext(featureContext);vm.runInContext(feature,featureContext,{filename:'feature-pack-v120.js'});
const ammo=featureContext.normalizeEquipmentItemV2({id:'ammo',type:'ammo',ammoFamily:'12.7',stackLimit:60});
const weapon=featureContext.normalizeEquipmentItemV2({id:'gun',type:'weapon',ammoFamily:'12.7',stackable:true,stackLimit:20});
assert.equal(ammo.stackable,true);assert.equal(ammo.stackLimit,60);assert.equal(ammo.ammoFamily,'12.7');
assert.equal(weapon.stackable,true);assert.equal(weapon.stackLimit,20);
const skill=featureContext.normalizeSkillV50({id:'old',type:'specialization',activationType:'reaction',specializationIncreases:['x'],visibility:{playerIds:['p1'],campaignIds:['main'],eraIds:['industrial']}});
assert.equal(skill.type,'skill');assert.equal(skill.skillType,'skill');assert.equal(skill.activationType,'reaction');assert.deepEqual(Array.from(skill.specializationIncreases),[]);
assert.deepEqual(JSON.parse(JSON.stringify(skill.visibility)),{playerIds:['p1'],campaignIds:['main'],eraIds:['industrial']});
const collectedSkill=featureContext.Configurator.collectEntity('skills',{}, {get(){return null;}});
assert.deepEqual(JSON.parse(JSON.stringify(collectedSkill.visibility)),{playerIds:['p1'],campaignIds:['main'],eraIds:['industrial']});
const exportedSkill=featureContext.buildWorldSnapshot().skills.SKILLS.scoped;
assert.deepEqual(JSON.parse(JSON.stringify(exportedSkill.visibility)),{playerIds:['p1'],campaignIds:['main'],eraIds:['industrial']});
const migrated=featureContext.normalizePlayerProfileV2({id:'p',skills:['base'],specializations:{old:2,unused:0}});
assert.deepEqual(Array.from(migrated.skills),['base','old']);assert.deepEqual(JSON.parse(JSON.stringify(migrated.specializations)),{});assert.equal(migrated.legacySpecializationsV120.old,2);

assert.match(scene,/beginCombatTransaction120\('attack'/);
assert.match(scene,/beginCombatTransaction120\('grenade'/);
assert.match(scene,/event\.stopImmediatePropagation\(\)/);
assert.match(scene,/document\.body\.appendChild\(overlay\)/);
assert.match(scene,/await checkpointCombat120\(result\.hit\?'Сцена: атака и урон'/);
assert.match(scene,/await checkpointCombat120\('Сцена: граната и урон'/);
assert.match(scene,/await checkpointCombat120\('Сцена: переход хода и Lua'/);
assert.match(scene,/pushCombatProfile120/);
assert.match(scene,/combatInventoryV120/);
assert.match(scene,/Боевое действие сохранено локально/);
assert.match(scene,/Combat\.syncInitiative\(scene\.id,false\);Combat\.render\(\);flushLuaEffects119\(effectState\);await checkpointCombat120/);
assert.match(scene,/Combat\.syncInitiative\(scene\.id,false\);Combat\.render\(\);flushLuaEffects119\(allEffects\);await checkpointCombat120/);
assert.match(scene,/ammoFamily120\(item\)===family/);
assert.match(scene,/В инвентаре нет совместимых патронов/);
assert.match(scene,/coverDefenseBonus/);
assert.match(scene,/Полное укрытие/);
const defenseFn=scene.slice(scene.indexOf('function tokenDefense105'),scene.indexOf('function itemProtectsFromEnergy119'));
assert.doesNotMatch(defenseFn,/entity\?\.defense|stats\?\.defense/);
assert.match(scene,/armorClassOverrideV120/);
assert.match(scene,/defenseOverrideV120/);

assert.match(stats,/if\(op==='add'&&n\(raw\.value,0\)===0&&!statRef\)return null/);
assert.match(stats,/targetOptions\(selected=''\).*выберите показатель/s);
assert.match(feature,/legacySpecializationsV120/);
assert.match(feature,/data-skill-add-v63="specialization"/);
assert.match(feature,/name\^="specialization_"/);
assert.match(feature,/stackToggle\.checked=item\.stackable===true/);
assert.match(feature,/Можно складывать в стопку/);
assert.match(feature,/querySelectorAll\(':scope > small/);
assert.match(featureCss,/inventory-tile-v1067\.item-card-v120/);

assert.match(web,/optimisticPlayersWeb120/);
assert.match(web,/mutationQueuesWeb120/);
assert.match(web,/legacySpecializationsV120/);
assert.match(web,/renderMobileReputation=function/);
assert.match(web,/Класс брони<\/div>/);
assert.match(web,/Защита<\/div>/);
assert.match(webCss,/web-reputation-row-v120/);
assert.match(webCss,/web-player-write-pending-v120/);

const patchVersion=Number(String(pkg.version).split('.')[2]||0);
assert.ok(patchVersion>=120);assert.equal(pkg.buildVersion,`${pkg.version}.0`);assert.equal(pkg.build.buildVersion,`${pkg.version}.0`);
assert.ok(desktopHtml.indexOf('feature-pack-v119.js')<desktopHtml.indexOf('feature-pack-v120.js'));
assert.match(desktopHtml,/feature-pack-v120\.css\?v=1\.0\.132/);
assert.match(webHtml,new RegExp(`styles\\.css\\?v=${pkg.version.replaceAll('.', '\\.')}`));assert.match(webHtml,new RegExp(`app\\.js\\?v=${pkg.version.replaceAll('.', '\\.')}`));

console.log('V120_COMBAT_AMMO_INVENTORY_OK');
