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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))vm.runInContext(fs.readFileSync(path.join(root,'renderer',m[1]),'utf8').replace('// New module is DM-only;', 'window.test225={local,applyStore,collectStoreFromRuntime,luaUnitRows119,applyLuaCommands119,runInteractiveLuaHookV138,requestAttackRolls119,commitAttack105:id=>commitAttack105(id),performLuaStandardAttackV138,itemRuntimeStateV138,playerVisionSources112,droneActions225,droneShareVision225,deviceCommandReason200,checkpointCombat120,conditionEvents225,positionEvents204,refreshRuntimeSources122,centerOf,updatePlayerHp105,mergeCombatProfile225,importCombatProfiles225,runAutomaticHooks119,chooseReaction119,commitMove104:()=>commitMove104(),makeRoutePreview104,hexStepDistance109,activeSkillsForToken118,useActiveSkill118:id=>useActiveSkill118(id),fitTokenToHex107};\n// New module is DM-only;'),context,{filename:m[1]});
const {Worker}=await import('node:worker_threads');
w.electronAPI.runCombatLuaHook=payload=>new Promise((resolve,reject)=>{
 const worker=new Worker(path.join(root,'lua-sandbox-worker.cjs'));
 const timer=setTimeout(()=>{worker.terminate();reject(Error('Lua timeout'));},10000);
 worker.once('message',message=>{clearTimeout(timer);worker.terminate();resolve(message.ok?{ok:true,...message.result}:{ok:false,message:message.message});});
 worker.once('error',error=>{clearTimeout(timer);worker.terminate();reject(error);});
 worker.postMessage(payload);
});
const wait=async predicate=>{
 for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}
 throw Error('DOM condition timed out');
};
const confirm=()=>{
 const form=w.document.querySelector('.scene-lua-overlay-v119 form');
 assert(form,'decision form missing');
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
};
try{
 w.world225={
  players:{PLAYER_TEMPLATES:{
   gm:{id:'gm',role:'gm'},
   p:{id:'p',role:'player',displayName:'Оператор',stats:{hpCurrent:8,hpMax:10},baseStats:{hpBase:10,implantSlots:1},implantSlotCount:1,traumaV195:{schema:195,degree:0},abilityBase:{intelligence:3,will:2},equipmentSlots:{primaryWeapon:'test_rifle'},inventory:[{itemId:'implant',qty:1}],implantSlots:['implant'],installedImplantIds:['implant'],skills:['events']},
   q:{id:'q',role:'player',displayName:'Другой игрок',stats:{hpCurrent:10,hpMax:10},baseStats:{hpBase:10}}
  }},
  equipment:{EQUIPMENT:{test_rifle:{id:'test_rifle',name:'Тестовая винтовка',type:'weapon',weaponCategory:'light',damage:'1',range:10,rapidFireShots:3,durabilityMax:5,magazineSize:3,ammoTypeId:'test_round'},test_round:{id:'test_round',name:'Тестовые патроны',type:'ammo',modifiers:[{target:'damage_bonus',op:'add',value:4}],luaEnabled:true,luaScript:"function OnShotFired(self,p) assert(p.ammo.id=='test_round' and p.ammoSpent==1 and p.weaponSlot=='primaryWeapon' and not p.hit);local roll=RequestRoll('wear','Износ от патрона',{min=1,max=20});if roll==20 then DamageItem(p.attacker,p.weaponSlot,1) end end"},implant:{id:'implant',name:'Дополнительные команды',type:'implant',modifiers:[{target:'drone_actions',op:'add',value:2}]}}},
  skills:{SKILLS:{events:{id:'events',name:'События',activationType:'passive',luaEnabled:true,luaScript:"function BeforeRoll(self,p) self:SetData('before_'..p.rollType,self:GetData('before_'..p.rollType,0)+1) end function AfterRoll(self,p) assert(p.rollingUnit ~= nil);self:SetData('after_'..p.rollType,p.roll) end function OnKnockedDown(self,p) assert(p.condition=='prone' and p.enabled);self:SetData('down',self:GetData('down',0)+1) end function OnStandUp(self,p) self:SetData('up',self:GetData('up',0)+1) end function OnForcedMove(self,p) self:SetData('shift',self:GetData('shift',0)+1) end"}}}
 };
 run("applyWorldData(window.world225);App.state=makeDefaultState();App.currentUserId='gm';Sync.config={enabled:false};App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};App.writeLocalMirrors=async()=>({ok:true});Persistence.save=async()=>({ok:true});window.notices225=[];Toast.show=(message,type)=>notices225.push([message,type]);");
 const api=w.test225;
 api.applyStore({rangeSchema:109,cameraSchema:109,scenes:{s:{id:'s',name:'Бой',mode:'combat',width:24,height:20,fogMode:'objects',assets:[],templates:[]}},runtimes:{s:{tokens:[
  {id:'a',playerId:'p',name:'Оператор',x:3,y:3,hpCurrent:1,hpMax:10,initiative:20,initiativeOverrideV147:true,actionUsed:true,ownTurnV199:1},
  {id:'b',playerId:'q',name:'Другой игрок',x:12,y:12,hpCurrent:10,hpMax:10,initiative:10,initiativeOverrideV147:true},
  {id:'d',equipmentType:'drone',type:'drone',operatorTokenIdV129:'a',name:'Дрон',x:4,y:3,hpCurrent:3,hpMax:3,sharesVisionWithPlayers:true}
 ],initiativeOrder:['a','b'],turnIndex:0,battleStarted191:true}},selectedSceneId:'s'});
 api.local.loaded=true;
 run("UI.openModule('combat')");
 const token=id=>run("Combat.getRuntime().tokens").find(row=>row.id===id);
 assert.equal(token('a').hpCurrent,8,'entry imports profile HP');
 assert.equal(token('a').actionUsed,true,'entry preserves turn budget');
 assert.equal(api.droneActions225(token('a')),2,'equipped implant grants actions');
 assert.equal(api.droneShareVision225(token('d')),true);
 const vision=()=>Array.from(api.playerVisionSources112(run('Combat.getScene()'),run('Combat.getRuntime()')),row=>row.token.id);
 assert.deepEqual(vision(),['a','b','d']);
 run("Combat.getRuntime().turnIndex=1");assert.deepEqual(vision(),['a','b','d']);
 run("Combat.getRuntime().turnIndex=0");
 const shared=w.GRPGCombatVisionV225;
 assert.deepEqual(Array.from(shared.sources({mode:'standard'},{tokens:[{id:'p',playerId:'p'},{id:'d',type:'drone',sharesVisionWithPlayers:true,droneShareVision225:false}]}),t=>t.id),['p']);
 assert.equal(shared.sources({mode:'combat'},{tokens:[{id:'npc'}],initiativeOrder:['npc'],turnIndex:0}).length,0);
 const merged=api.mergeCombatProfile225({stats:{hpCurrent:8,hpMax:10}},{stats:{hpCurrent:6,hpMax:10}},{stats:{hpCurrent:8,hpMax:12}},'p');
 assert.equal(merged.stats.hpCurrent,6);assert.equal(merged.stats.hpMax,12);
 assert.throws(()=>api.mergeCombatProfile225({stats:{hpCurrent:8}},{stats:{hpCurrent:6}},{stats:{hpCurrent:7}},'p'),/изменён вне сцены/);

 const unitRows=api.luaUnitRows119(run('Combat.getRuntime()'),run('Combat.getScene()'));
 assert.equal(unitRows.find(row=>row.id==='a').droneActions225,2);
 assert.equal(unitRows.find(row=>row.id==='d').droneShareVision225,true);
 const source={id:'test',name:'test',kind:'skill',ownerToken:token('a'),raw:{},mode:'active',script:"function GetCostMode() return 'scripted' end function OnAbilityExecuted(self,p) local u=self:GetCaster();assert(DroneActions(u)==2);assert(u:GetMaxDroneActions()==2);assert(IsDroneShareVision(GetUnit('d')));SetProne(u,true);SetProne(u,true);SetProne(u,false);u:SetAbsOrigin(Vector(5,3),{kind='forced'}) end"};
 await api.runInteractiveLuaHookV138(source,'OnAbilityExecuted');
 const counters=token('a').luaState204['skill:events'];
 assert.equal(counters.down,1);assert.equal(counters.up,1);assert.equal(counters.shift,1);
 const attack=api.requestAttackRolls119({attacker:token('a'),target:token('b'),weapon:{id:'unarmed',name:'Тест',damage:'1'},attackBonus:0,defenseBonus:0,damageBonus:0});
 await wait(()=>w.document.querySelector('[name=attackRoll]'));
 w.document.querySelector('[name=attackRoll]').value='12';
 w.document.querySelector('[name=defenseRoll]').value='9';
 w.document.querySelector('[name=damageRoll]').value='1';
 confirm();const roll=await attack;
 assert.equal(roll.attackRoll,12);
 assert.equal(token('a').luaState204['skill:events'].before_attack,1);
 assert.equal(token('a').luaState204['skill:events'].after_attack,12);
 assert.equal(token('a').luaState204['skill:events'].after_damage,1);
 w.react225={id:'react225',name:'Реакция после броска',activationType:'reaction',luaEnabled:true,luaScript:"function GetCostMode() return 'scripted' end function CanAfterRoll(self,p) return p.rollType=='attack' and p.roll==13 and not self:GetData('used',false) end function AfterRoll(self,p) self:SetData('used',true);SpendReaction(self:GetCaster()) end"};
 run("worldData.skills.SKILLS.react225=window.react225;App.state.users.p.skills.push('react225');");
 const reactive=api.requestAttackRolls119({attacker:token('a'),target:token('b'),weapon:{id:'unarmed',name:'Тест',damage:'1'},attackBonus:0,defenseBonus:0,damageBonus:0});
 await wait(()=>w.document.querySelector('[name=attackRoll]'));
 w.document.querySelector('[name=attackRoll]').value='13';w.document.querySelector('[name=defenseRoll]').value='9';w.document.querySelector('[name=damageRoll]').value='1';confirm();
 await wait(()=>w.document.querySelector('[name=reaction]'));
 confirm();await reactive;
 assert.equal(token('a').luaState204['skill:react225'].used,true);
 assert.equal(token('a').reactionUsedV119,true);
 // A hook absent from the manifest must not start a worker for any equipped skill.
 const runHook=w.electronAPI.runCombatLuaHook,calls=[];
 w.electronAPI.runCombatLuaHook=payload=>{calls.push(payload);return runHook(payload);};
 await api.runAutomaticHooks119(token('a'),'OnMoveStep',{attacker:token('a')});
 assert(!calls.some(call=>call.hook==='OnMoveStep'),'absent movement hook never enters the worker');
 const turnReaction={activationType:'reaction',luaEnabled:true,luaScript:"function GetCostMode() return 'scripted' end function CanOnTurnStart() return false end function OnTurnStart() end"};
 w.turnA248={...turnReaction,id:'turn_a248',name:'Проверка A'};
 w.turnB248={...turnReaction,id:'turn_b248',name:'Проверка B'};
 run("Object.assign(worldData.skills.SKILLS,{turn_a248:window.turnA248,turn_b248:window.turnB248});App.state.users.p.skills.push('turn_a248','turn_b248');");
 calls.length=0;
 await api.chooseReaction119('OnTurnStart',{unit:token('a')});
 const turnChecks=calls.filter(call=>call.mode==='check'&&call.hook==='OnTurnStart');
 assert.equal(turnChecks.length,2,'both eligible sources are checked');
 assert.equal(turnChecks[0].input.units,turnChecks[1].input.units,'unit snapshot is shared only within the read-only pass');
 assert.equal(turnChecks[0].input.units[0].distances.a,0);
 run("App.state.users.p.skills=App.state.users.p.skills.filter(id=>!id.endsWith('248'))");

 run("Combat.selectedObject={kind:'token',id:'a'}");
 token('a').disengagedV122=true;
 const start=api.centerOf(token('a'));
 const preview=api.makeRoutePreview104({x:start.x,y:start.y+3*api.hexStepDistance109()});
 assert(!preview.blocked&&preview.points.length>=3,'fixture has a multi-hex route');
 const writes=[];
 w.electronAPI.saveLocalCombatScenes=async payload=>{writes.push(payload.operations194.active?.stage);return{ok:true};};
 api.local.preview=preview;
 await api.commitMove104();
 assert.deepEqual(api.centerOf(token('a')),preview.end,'movement reaches the preview endpoint');
 assert.equal(writes.filter(stage=>stage==='Подтверждено перемещение').length,1,JSON.stringify(writes));
 assert(!writes.includes('Подтверждён шаг перемещения'),'plain movement does not journal every hex');
 const rules=w.GRPGCombatRulesV119;
 assert.deepEqual(Array.from(api.activeSkillsForToken118(token('a')),row=>row.name).filter(name=>name!=='События'),['Прицеливание','Помощь','Стабилизация','Упор']);
 assert.equal(rules.burstPenalty(3,2,true),-3,'bracing does not reduce target-switch penalties');
 assert.equal(rules.grenadeScatter(1,6),2);
 assert.equal(rules.grenadeScatter(5,5),2);
 const fallen={hpCurrent:2,hpMax:10,ownTurnV199:3,traumaV195:{schema:195,degree:0}};
 rules.applyDamage(fallen,5);rules.applyDamage(fallen,3);
 assert.equal(rules.stabilizationDifficulty(fallen),20);
 assert.equal(fallen.traumaV195.degree,2);
 rules.applyHeal(fallen,2);
 assert.equal(fallen.conditionsV138.dying,true,'healing alone preserves the countdown');
 fallen.ownTurnV199=7;assert.equal(rules.criticalTurn(fallen,'end'),'');
 fallen.ownTurnV199=8;assert.equal(rules.criticalTurn(fallen,'start'),'awake');
 const fatal={hpCurrent:2,hpMax:10,ownTurnV199:0};rules.applyDamage(fatal,2);
 fatal.ownTurnV199=5;assert.equal(rules.criticalTurn(fatal,'start'),'');
 assert.equal(rules.criticalTurn(fatal,'end'),'dead');
 const ally=token('b');
 api.fitTokenToHex107(ally,run('Combat.getScene()'),{x:preview.end.x,y:preview.end.y+api.hexStepDistance109()});
 ally.hpCurrent=2;rules.applyDamage(ally,3);rules.applyHeal(ally,2);
 token('a').actionUsed=false;
 const stabilize=api.useActiveSkill118('skill_stabilization');
 await wait(()=>w.document.querySelector('[name=basicTarget229]'));
 confirm();
 await wait(()=>w.document.querySelector('[name=stabilize229]'));
 w.document.querySelector('[name=stabilize229]').value='20';confirm();await stabilize;
 assert.equal(ally.conditionsV138.dying,false);assert.equal(ally.conditionsV138.unconscious,false);
 assert.equal(token('a').actionUsed,true);
 for(let expected=1;expected<=3;expected++){
  token('a').actionUsed=false;
  token('a').ownTurnV199++;
  const aim=api.useActiveSkill118('skill_766282');
  await wait(()=>w.document.querySelector('[name=basicTarget229]'));
  confirm();await aim;
  assert.equal(token('a').aim229.bonus,expected,'consecutive Aim actions increase the bonus to +3');
 }
 token('a').actionUsed=false;
 const help=api.useActiveSkill118('skill_378845');
 await wait(()=>w.document.querySelector('[name=helpType229]'));
 w.document.querySelector('[name=helpType229]').value='defense';
 confirm();await help;
 assert.equal(token('b').help229.bonus,3,'help adds one plus the helper’s Will');
 const aimed=api.requestAttackRolls119({attacker:token('a'),target:token('b'),weapon:{id:'test_rifle',name:'Тестовая винтовка',damage:'1'},attackBonus:0,defenseBonus:0,damageBonus:0,aimBonus:3});
 await wait(()=>w.document.querySelector('[name=attackRoll]'));
 w.document.querySelector('[name=attackRoll]').value='12';
 w.document.querySelector('[name=defenseRoll]').value='8';
 w.document.querySelector('[name=damageRoll]').value='1';
 confirm();
 const aimedRoll=await aimed;
 assert.equal(aimedRoll.aimApplied229,3);
 assert.equal(aimedRoll.attackBonusDelta204,3);
 assert.equal(aimedRoll.defenseBonusDelta204,3,'Help applies to an active defense without changing the natural die');
 assert.equal(aimedRoll.defenseRoll,8);
 assert.equal(token('b').help229,null,'help is consumed by the selected check');
 token('a').actionUsed=false;
 token('a').weaponMagazinesV118={test_rifle:{loaded:2,ammoTypeId:'test_round'}};
 run("Combat.selectedObject={kind:'token',id:'a'}");
 const fired=api.commitAttack105('b');
 await wait(()=>w.document.querySelector('[name=attackRoll]'));
 w.document.querySelector('[name=attackRoll]').value='2';
 w.document.querySelector('[name=defenseRoll]').value='20';
 w.document.querySelector('[name=damageRoll]').value='1';confirm();
 await wait(()=>w.document.querySelector('[name=luaNumber]'));
 w.document.querySelector('[name=luaNumber]').value='20';confirm();await fired;
 assert.equal(token('a').weaponMagazinesV118.test_rifle.loaded,1);
 assert.equal(api.itemRuntimeStateV138(token('a'),'test_rifle','primaryWeapon').durability,4);
 token('a').burstStateV122=null;
 const scripted=api.performLuaStandardAttackV138({attackerId:'a',targetId:'b',slot:'primaryWeapon',consumeAction:false});
 await wait(()=>w.document.querySelector('[name=attackRoll]'));
 assert.match(w.document.querySelector('.scene-lua-overlay-v119').textContent,/Бонус урона: \+4/);
 w.document.querySelector('[name=attackRoll]').value='2';
 w.document.querySelector('[name=defenseRoll]').value='20';
 w.document.querySelector('[name=damageRoll]').value='1';confirm();
 await wait(()=>w.document.querySelector('[name=luaNumber]'));
 w.document.querySelector('[name=luaNumber]').value='1';confirm();await scripted;
 assert.equal(token('a').weaponMagazinesV118.test_rifle.loaded,0);
 assert.equal(api.itemRuntimeStateV138(token('a'),'test_rifle','primaryWeapon').durability,4);
 const patches=[],pulls=[];
 let releasePush;
 const remote=JSON.parse(run('JSON.stringify(App.state.users)'));
 const gate=new Promise(resolve=>{releasePush=resolve;});
 run("Sync.config={enabled:true};PlayerSync.shouldIsolateUsersFromSnapshot=()=>true;PlayerSync.pushPlayerPatch=async(playerId,patch)=>window.push225(playerId,patch);");
 w.electronAPI.pullPlayers=async options=>{
  pulls.push(options);
  return{ok:true,rows:Object.entries(remote).filter(([id])=>!options.playerId||id===options.playerId).map(([id,player])=>({playerId:id,player,version:20}))};
 };
 w.push225=async(playerId,patch)=>{
  patches.push({playerId,patch:JSON.parse(JSON.stringify(patch))});
  await gate;
  return{ok:false,message:'offline'};
 };
 token('a').hpCurrent=6;api.updatePlayerHp105(token('a'));
 await api.checkpointCombat120('local action',true);
 assert.equal(patches.length,0,'profiles are deferred until exit');
 let releaseArchive,archiveStarted=false;
 const saveArchive=w.electronAPI.saveLocalCombatScenes;
 w.electronAPI.saveLocalCombatScenes=payload=>{archiveStarted=true;return new Promise(resolve=>{releaseArchive=()=>resolve(saveArchive(payload));});};
 await run('UI.closeModule()');
 assert.notEqual(run("UI.activeModuleId"),'combat','window closes before the local archive write completes');
 await wait(()=>archiveStarted);
 assert.equal(patches.length,0,'remote writes follow durable local storage');
 w.electronAPI.saveLocalCombatScenes=saveArchive;releaseArchive();
 await wait(()=>patches.some(row=>row.playerId==='p'));
 assert(pulls.every(pull=>pull.playerId&&pull.limit===1),'exit only fetches changed players');
 assert.equal(patches.find(row=>row.playerId==='p').patch.stats.hpCurrent,6);
 releasePush();
 await wait(()=>w.notices225.some(row=>row[0].includes('offline')));
 assert.equal(api.local.store.profileDrafts225.profiles.p.stats.hpCurrent,6,'failed upload leaves a durable draft');
 w.push225=async(playerId,patch)=>{Object.assign(remote[playerId],patch);return{ok:true};};
 await run("UI.openModule('combat')");
 assert.equal(token('a').hpCurrent,6,'reopening restores the unsent combat draft');
 await run('UI.closeModule()');
 await wait(()=>!api.local.store.profileDrafts225);
 remote.p.stats.hpCurrent=9;
 w.electronAPI.pullPlayers=async()=>({ok:true,rows:[{playerId:'p',player:remote.p,version:21}]});
 await run("UI.openModule('combat')");
 assert.equal(token('a').hpCurrent,9,'online entry reads the server profile');
 assert.equal(token('a').actionUsed,true,'online refresh preserves spent action');
 const freshProfiles=JSON.parse(run('JSON.stringify(App.state.users)'));
 token('a').hpCurrent=5;api.updatePlayerHp105(token('a'));api.collectStoreFromRuntime();
 const archive=JSON.parse(JSON.stringify(api.local.store));
 api.applyStore(archive);api.importCombatProfiles225(freshProfiles);
 assert.equal(token('a').hpCurrent,5,'persisted combat draft survives archive restore over unchanged remote profile');
 console.log('PASS v225 real renderer: implant drone actions, party vision, Lua getters and events, deferred profiles, retry and fresh entry');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
