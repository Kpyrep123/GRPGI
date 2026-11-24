// npm install --prefix /tmp/grpgi-test-dom happy-dom
// HAPPY_DOM_MODULE=/tmp/grpgi-test-dom/node_modules/happy-dom/lib/index.js node tests/combat-v225.dom.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const root=process.cwd();
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-v134-'));
const errors=[];
const w=new Window({url:'https://grpgi.test',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,disableComputedStyleRendering:true}});
const context=vm.isContext(w)?w:vm.createContext(w);
const run=code=>vm.runInContext(code,context);
w.setInterval=()=>0;w.requestAnimationFrame=()=>0;
const windowAdd=w.addEventListener.bind(w),documentAdd=w.document.addEventListener.bind(w.document);
w.addEventListener=(type,...args)=>{if(type!=='load')return windowAdd(type,...args)};
w.document.addEventListener=(type,...args)=>{if(type!=='DOMContentLoaded')return documentAdd(type,...args)};
w.console={...console,log(){},debug(){},warn(...args){errors.push(args.map(String).join(' '))},error(...args){errors.push(args.map(String).join(' '))}};
w.electronAPI={appVersion:'1.0.134',debugLog:async()=>{},saveWorldData:async world=>{
 fs.writeFileSync(path.join(scratch,'world.json'),JSON.stringify(world));return{ok:true,world:JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'))};
},loadWorldData:async()=>({ok:true,world:JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'))}),saveWorldSection:async(type,payload)=>{
 const world=JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'));world[type]=payload;fs.writeFileSync(path.join(scratch,'world.json'),JSON.stringify(world));return{ok:true};
},exportWorldSectionJson:async(type,payload)=>{fs.writeFileSync(path.join(scratch,type+'.json'),JSON.stringify(payload));return{ok:true,fileName:type+'.json'}}};
const html=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8');
w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
// Every renderer script is evaluated unmodified, in index.html order, sharing
// browser-style lexical globals. Only OS/cloud/bootstrap boundaries are mocked.
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))vm.runInContext(fs.readFileSync(path.join(root,'renderer',m[1]),'utf8').replace('// New module is DM-only;', 'window.test225={canCombatAct129,activeMap193,inBattle191,conditionStateV138,weaponForSlotV138,weaponAberrationEffects257,equipmentPlan311,refreshEquipment311,entityForToken,incomingDefense119,resolveOpportunityAttack122,applyHit199,startOwnTurn199,endOwnTurn199,checkPenalty199,shotRange229,longRangeDisadvantage229,local,applyStore,collectStoreFromRuntime,luaUnitRows119,applyLuaCommands119,runInteractiveLuaHookV138,requestAttackRolls119,commitAttack105:id=>commitAttack105(id),performLuaStandardAttackV138,itemRuntimeStateV138,playerVisionSources112,droneActions225,droneShareVision225,deviceCommandReason200,checkpointCombat120,conditionEvents225,positionEvents204,refreshRuntimeSources122,centerOf,updatePlayerHp105,mergeCombatProfile225,importCombatProfiles225,runAutomaticHooks119,chooseReaction119,commitMove104:()=>commitMove104(),makeRoutePreview104,hexStepDistance109,activeSkillsForToken118,useActiveSkill118:id=>useActiveSkill118(id),fitTokenToHex107};\n// New module is DM-only;'),context,{filename:m[1]});
const {Worker}=await import('node:worker_threads');
w.electronAPI.runCombatLuaHook=payload=>new Promise((resolve,reject)=>{
 const worker=new Worker(path.join(root,'lua-sandbox-worker.cjs'));
 const timer=setTimeout(()=>{worker.terminate();reject(Error('Lua timeout'));},10000);
 worker.once('message',message=>{clearTimeout(timer);worker.terminate();resolve(message.ok?{ok:true,...message.result}:{ok:false,message:message.message});});
 worker.once('error',error=>{clearTimeout(timer);worker.terminate();reject(error);});
 worker.postMessage(payload);
});
try {
 run(`applyWorldData({equipment:{EQUIPMENT:{
 gun:{id:'gun',name:'Gun',type:'weapon',weaponCategory:'light',damage:'4',range:20,durabilityMax:10},
 armor:{id:'armor',name:'Armor',type:'armor',durabilityMax:10,modifiers:[{target:'armor_class',op:'add',value:2},{target:'defense',op:'add',value:4}]},
 shield:{id:'shield',name:'Shield',type:'shield',durabilityMax:10,shieldCoverBonus:2,modifiers:[{target:'defense',op:'add',value:1}]}
 }},skills:{SKILLS:{hook:{id:'hook',activationType:'passive',luaEnabled:true,luaScript:'function ModifyEquipmentBaseStat(self,p) return p.value end'}}},
 players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'},q:{id:'q',role:'player',displayName:'Target',stats:{hpCurrent:20,hpMax:20},baseStats:{hpBase:20},abilityBase:{endurance:8},inventory:[]},p:{id:'p',role:'player',displayName:'Player',stats:{hpCurrent:10,hpMax:10},skills:['hook'],abilityBase:{dexterity:1,endurance:3},inventory:[{itemId:'gun',qty:1},{itemId:'armor',qty:1},{itemId:'shield',qty:1}],equipmentSlots:{primaryWeapon:'gun',secondaryWeapon:'shield',armor:'armor'},baseStats:{inventorySlots:30,carryBase:100}}}}});
 App.state=makeDefaultState();App.currentUserId='gm';Sync.config={enabled:false};App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};window.notices311=[];Toast.show=message=>notices311.push(message);Persistence.save=async()=>({ok:true});`);
 const api=w.test225,I=w.GRPGItemInstancesV215,E=w.GRPGEquipmentStatsV311;
 api.applyStore({rangeSchema:109,cameraSchema:109,scenes:{s:{id:'s',name:'Test',mode:'normal',width:30,height:20,assets:[],templates:[]}},runtimes:{s:{tokens:[]}},selectedSceneId:'s'});
 api.local.loaded=true;run("UI.openModule('combat')");
 run("Combat.getRuntime().tokens.push(createPlayerCombatToken('p'))");
 const token=()=>run('Combat.getRuntime().tokens[0]');
 const profile=()=>run("App.state.users.p");
 const copy=slot=>api.itemRuntimeStateV138(token(),run("Data.getItem(App.state.users.p.equipmentSlots['"+slot+"'])"),slot);
 const armor=copy('armor');armor.aberration252={effects:['armor-19-4','armor-18-4']};
 armor.attachments=[{itemId:'plate',modifiers:[{target:'defense',op:'add',value:1}]}];
 const gun=copy('primaryWeapon');gun.aberration252={effects:['weapon-2-2','weapon-56-1']};
 gun.attachments=[{itemId:'barrel',modifiers:[{target:'damage_bonus',op:'add',value:1}]}];
 const saved=JSON.stringify(profile()),template=run("JSON.stringify(Data.getItem('armor'))");
 const setScript=script=>{w.nextScript311=script;run("Data.getSkill('hook').luaScript=nextScript311");};
 const refresh=()=>api.refreshEquipment311({event:'Test',damageType:'kinetic'});
 await refresh();
 assert.equal(E.get(token(),'armor').baseStats.absorption,4);
 assert.equal(E.get(token(),'armor').effectiveStats.absorption,7);
 assert.equal(api.incomingDefense119(token(),'light',null,'kinetic').armorAbsorption,7);
 setScript(`function ModifyEquipmentBaseStat(self,p)
   assert(self:GetCaster():GetEquipmentBaseStat('armor','absorption') == 4)
   assert(#self:GetCaster():GetEquipmentAberrations('armor') == 2)
   assert(#self:GetCaster():GetEquipmentModifications('armor') == 1)
   if p.slot=='armor' and p.stat=='absorption' then return p.value*2 end
 end`);
 await refresh();assert.equal(E.get(token(),'armor').effectiveStats.absorption,11);
 assert.equal(api.incomingDefense119(token(),'light',null,'kinetic').armorAbsorption,11);
 setScript("function ModifyEquipmentEffectiveStat(self,p) if p.slot=='armor' and p.stat=='absorption' then return p.value*2 end end");
 await refresh();assert.equal(E.get(token(),'armor').effectiveStats.absorption,14);
 assert.equal(api.incomingDefense119(token(),'light',null,'electric').armorAbsorption,7);
 assert.equal(api.incomingDefense119(token(),'light',null,'energy').armorAbsorption,0);
 setScript(`function BeforeAberrationApply(self,p) if p.effectId=='weapon-2-2' then return 2 elseif p.effectId=='armor-19-4' then return 5 elseif p.effectId=='weapon-56-1' then return false end end
 function ModifyEquipmentEffectiveStat(self,p) if p.slot=='secondaryWeapon' and p.stat=='armorClass' then return 0 end end`);
 await refresh();assert.equal(E.get(token(),'armor').effectiveStats.absorption,10);
 assert(!E.get(token(),'primaryWeapon').appliedAberrations.some(row=>row.id==='weapon-56-1'));
 assert.equal(api.incomingDefense119(token(),'light',null,'kinetic').shieldArmorClass,0);
 const attack=()=>w.GRPGStatsV113.weaponAttack(api.entityForToken(token()),'gun',{inCombat:true,weaponSlot:'primaryWeapon'});
 assert.equal(Number(attack().damage)+attack().damageBonus,7,'4 base + 2 first-shot + 1 module');
 token().burstStateV122={nextShot:2};await refresh();
 assert.equal(Number(attack().damage)+attack().damageBonus,5,'first-shot effect excluded on second shot');
 delete token().burstStateV122;
 setScript("function ModifyEquipmentBaseStat(self,p) if p.slot=='primaryWeapon' and p.stat=='damage' then return p.value*2 end end");
 await refresh();assert.equal(Number(attack().damage)+attack().damageBonus,7);
 setScript("function ModifyEquipmentEffectiveStat(self,p) if p.slot=='primaryWeapon' and p.stat=='damage' then return p.value*2 end end");
 await refresh();assert.equal(Number(attack().damage)+attack().damageBonus,6);
 run("Data.getItem('gun').damage='1d6'");
 await assert.rejects(refresh,/mul|arithmetic/);
 setScript("function ModifyEquipmentEffectiveStat(self,p) if p.slot=='primaryWeapon' and p.stat=='damage' then return '2d6' end end");
 await refresh();assert.equal(attack().damage,'2d6');assert.equal(attack().damageBonus,-1,'dice expression bonus remains separate');
 const last=JSON.stringify(E.rows(token()));
 setScript("function ModifyEquipmentBaseStat(self,p) self:GetCaster():Heal(1) end");
 await assert.rejects(refresh,/команды и запросы ДМа запрещены/);
 assert.equal(JSON.stringify(E.rows(token())),last,'failed calculation commits nothing');
 setScript("function ModifyEquipmentBaseStat(self,p) return 0/0 end");await assert.rejects(refresh,/конечное число/);
 run("Data.getItem('gun').damage='4'");
 assert.equal(JSON.stringify(profile()),saved,'no stored instance or profile is mutated');
 assert.equal(run("JSON.stringify(Data.getItem('armor'))"),template,'template is unchanged');
 setScript("function BeforeAberrationApply(self,p) if p.effectId=='weapon-56-1' then return false end end");await refresh();
 const calls=[];const originalRun=w.electronAPI.runCombatLuaHook;w.electronAPI.runCombatLuaHook=payload=>{if(payload.mode==='equipment')calls.push(payload);return originalRun(payload);};
 await refresh();await refresh();assert.equal(calls.length,0,'unchanged calculations reuse a transient result');
 token().hpCurrent-=1;await refresh();assert.equal(calls.length,1,'HP-dependent hooks are invalidated');
 const units=api.luaUnitRows119(run('Combat.getRuntime()'),run('Combat.getScene()'));
 const getter=await originalRun({mode:'execute',hook:'BeforeDamage',input:{source:{ownerId:token().id},units,params:{}},script:"function BeforeDamage(self,p) assert(self:GetCaster():GetEquipmentBaseStat('armor','absorption')==4); assert(self:GetCaster():GetEquipmentEffectiveStat('armor','absorption')==7); assert(#self:GetCaster():GetEquipmentAberrations('armor')==2) end"});
 assert.equal(getter.ok,true,getter.message);
 // Broken armor keeps its original template values for inspection but grants no defense.
 armor.broken=true;armor.durability=0;await refresh();assert.equal(api.incomingDefense119(token(),'light',null,'kinetic').armorAbsorption,0);
 armor.broken=false;armor.durability=10;
 setScript("function ModifyEquipmentEffectiveStat(self,p) if p.slot=='primaryWeapon' and p.stat=='damage' then return p.value*2 end end function BeforeAberrationApply(self,p) if p.effectId=='weapon-56-1' then return false end end");
 run("Combat.getRuntime().tokens.push(createPlayerCombatToken('q'))");
 const target=run('Combat.getRuntime().tokens[1]');target.x=token().x+1;target.y=token().y;
 const pending=api.performLuaStandardAttackV138({attackerId:token().id,targetId:target.id,slot:'primaryWeapon'},{},{});
 let form;
 for(let index=0;index<500;index++){form=w.document.querySelector('.scene-lua-overlay-v119 form');if(form)break;await new Promise(resolve=>setTimeout(resolve,10));}
 assert(form,'StandardAttack opens physical-roll form');
 assert.equal(Number(form.elements.damageRoll.value),6,'4 base - 2 aberration + 1 module, doubled');
 form.elements.attackRoll.value='15';form.elements.defenseRoll.value='2';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await pending;
 assert.equal(run('Combat.getRuntime().tokens[1].hpCurrent'),14,'actual StandardAttack applies intercepted damage');
 const answerAttack=async pending=>{
   let form;
   for(let index=0;index<500;index++){form=w.document.querySelector('.scene-lua-overlay-v119 form');if(form)break;await new Promise(resolve=>setTimeout(resolve,10));}
   assert(form,'attack opens physical-roll form: '+run('JSON.stringify(notices311)'));assert.equal(Number(form.elements.damageRoll.value),6);
   form.elements.attackRoll.value='15';form.elements.defenseRoll.value='2';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
   await pending;
 };
 run("Combat.selectedObject={kind:'token',id:Combat.getRuntime().tokens[0].id}");
 run("Combat.getRuntime().battleStarted191=true;Combat.getRuntime().initiativeOrder=Combat.getRuntime().tokens.map(t=>t.id);Combat.getRuntime().turnIndex=0;Combat.getRuntime().tokens[0].actionUsed=false");
 assert(api.canCombatAct129(token()),'fixture has current actor');
 await answerAttack(api.commitAttack105(target.id));
 assert.equal(run('Combat.getRuntime().tokens[1].hpCurrent'),8,'ordinary attack applies intercepted damage');
 await answerAttack(api.resolveOpportunityAttack122(token(),run('Combat.getRuntime().tokens[1]'),{...run("Data.getItem('gun')"),weaponCategory:'melee'}));
 assert.equal(run('Combat.getRuntime().tokens[1].hpCurrent'),2,'opportunity attack applies intercepted damage');
 // Suppression also changes special per-instance weapon effects used by the scene, not only the Lua getter.
 setScript("function BeforeAberrationApply(self,p) if p.effectId=='weapon-56-1' then return false end end");await refresh();
 assert(!api.weaponAberrationEffects257(token(),run("Data.getItem('gun')"),'primaryWeapon').some(effect=>effect.group==='weapon-56'));
 // Pure guards skip their own handler; source globals remain isolated during a batch.
 setScript("function CanModifyEquipmentBaseStat(self,p) return false end function ModifyEquipmentBaseStat(self,p) error('must not execute') end");await refresh();assert.equal(E.get(token(),'armor').effectiveStats.absorption,7);
 setScript("marker311=5; function ModifyEquipmentBaseStat(self,p) assert(marker311==5); if p.slot=='armor' and p.stat=='absorption' then return p.value*2 end end");
 run("Data.getItem('shield').luaEnabled=true;Data.getItem('shield').luaScript=\"marker311=99;function ModifyEquipmentBaseStat(self,p) assert(marker311==99);if p.slot=='armor' and p.stat=='absorption' then return p.value+1 end end\"");
 await refresh();assert.equal(E.get(token(),'armor').effectiveStats.absorption,12,'skills then equipment, without global collisions');
 run("Data.getItem('shield').luaEnabled=false");
 setScript('-- disabled hooks');await refresh();assert.equal(E.rows(token()).length,0);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS equipment Lua: real Wasmoon layers, modifiers, suppression, damage, formulas, defenses, atomic errors, cache and immutable instances');
} finally { await w.happyDOM.abort(); w.close(); fs.rmSync(scratch,{recursive:true,force:true}); }
