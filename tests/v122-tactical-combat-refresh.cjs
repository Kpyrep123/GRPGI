'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {Worker}=require('node:worker_threads');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const scene=read('renderer/scene-editor-v113.js');
const stats=read('renderer/stats-engine-v113.js');
const rulesSource=read('renderer/combat-rules-v119.js');
const web=read('deploy/site/app/app.js');
const docs=read('LUA_COMBAT_SCRIPTING.md');
const pkg=JSON.parse(read('package.json'));

const context={console,Math};context.window=context;context.globalThis=context;vm.createContext(context);vm.runInContext(rulesSource,context);
const rules=context.GRPGCombatRulesV119;
const attack20=rules.resolveManualAttack({attackRoll:20,attackBonus:-5,defenseRoll:20,defenseBonus:99,damageRoll:6,damageReduction:2});
assert.equal(attack20.hit,true);assert.equal(attack20.rawDamage,7);assert.equal(attack20.damageApplied,5);assert.equal(attack20.defenseCritical,true);
const defense1=rules.resolveManualAttack({attackRoll:10,defenseRoll:1,damageRoll:6});assert.equal(defense1.rawDamage,7);assert.equal(defense1.defenseFumble,true);
const tie=rules.resolveManualAttack({attackRoll:10,attackBonus:2,defenseRoll:9,defenseBonus:3,damageRoll:1});assert.equal(tie.hit,true);

assert.match(scene,/clone\(collectStoreFromRuntime\(\)\)/);
assert.match(scene,/refreshRuntimeSources122/);assert.match(scene,/isMassNpc122/);
assert.match(scene,/filter\(token=>num\(token\.hpCurrent,0\)>0&&!isDroneToken129\(token\)\)/);
assert.match(scene,/chooseAfter=\(order,index\)/);assert.match(scene,/moveBusyV122/);
assert.match(scene,/terrainCostAt122/);assert.match(scene,/difficultTerrain/);
assert.match(scene,/resolveOpportunityAttacks122/);assert.match(scene,/Атака по возможности/);assert.match(scene,/disengagedV122/);
assert.match(scene,/burstStateV122/);assert.match(scene,/burstPenalty=-\(shotIndex-1\)/);assert.match(scene,/weaponMalfunctionsV122/);
assert.match(scene,/effectState=\{damage:result\.hit\?result\.damageApplied:0/);
assert.doesNotMatch(scene,/effectState=\{damage:result\.hit\?beforeState\.damage:0/);
assert.match(scene,/cover\.concealment/);assert.match(scene,/itemIsPhysicalShield122/);assert.match(scene,/Math\.max\(0,explicit,modifier\)/);assert.match(scene,/shield\?\.shieldDexterityCap!=null/);assert.match(scene,/itemIsHeavyArmor122/);assert.match(scene,/coverHardness/);
assert.match(scene,/apply_modifier/);assert.match(scene,/processTimedModifiers122/);assert.match(scene,/add_attack_bonus/);
assert.match(scene,/automaticSourcesForHook122/);assert.match(scene,/String\(source\.id\)===activeId/);
assert.match(stats,/rapidFireShots/);assert.match(stats,/weaponSkillBonus/);assert.match(stats,/armorWeightClass/);assert.match(stats,/shieldDexterityCap/);
assert.match(web,/Скорострельность/);assert.match(docs,/ApplyModifier/);assert.match(docs,/MODIFIER_PROPERTY_DEXTERITY_BONUS/);
assert.equal(pkg.version,'1.0.132');assert.equal(pkg.buildVersion,'1.0.132.0');
assert.ok(pkg.build.files.includes('COMBAT_RULES_AND_AMMUNITION_1.0.122.md'));

function worker(payload){return new Promise((resolve,reject)=>{const instance=new Worker(path.join(root,'lua-sandbox-worker.cjs'));const timer=setTimeout(()=>{instance.terminate();reject(new Error('timeout'));},3000);instance.once('message',message=>{clearTimeout(timer);instance.terminate();resolve(message);});instance.once('error',reject);instance.postMessage(payload);});}
(async()=>{const script=`function BeforeAttackStart(self,params) AddAttackBonus(2) ApplyModifier(self:GetCaster(),params.target,{id='burn',duration=2,effects=DeclareFunctions(ModifierEffect(MODIFIER_PROPERTY_DEXTERITY_BONUS,2)),onTurnStartDamage=1}) end`;const input={source:{id:'s',ownerId:'a'},units:[{id:'a',kind:'player',hpCurrent:5,hpMax:5,modifiers:[]},{id:'b',kind:'npc',hpCurrent:5,hpMax:5,modifiers:[]}],params:{attackerId:'a',casterId:'a',targetId:'b',targetIds:['b']}};const response=await worker({mode:'execute',hook:'BeforeAttackStart',script,input});assert.equal(response.ok,true);assert.deepEqual(response.result.commands.map(row=>row.kind),['add_attack_bonus','apply_modifier']);assert.equal(response.result.commands[1].effects[0].property,'dexterity');console.log('V122_TACTICAL_COMBAT_REFRESH_OK');})().catch(error=>{console.error(error);process.exitCode=1;});
