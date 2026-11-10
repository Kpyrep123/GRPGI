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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))vm.runInContext(fs.readFileSync(path.join(root,'renderer',m[1]),'utf8').replace('// New module is DM-only;', 'window.test225={local,applyStore,collectStoreFromRuntime,luaUnitRows119,applyLuaCommands119,runInteractiveLuaHookV138,requestAttackRolls119,playerVisionSources112,droneActions225,droneShareVision225,deviceCommandReason200,checkpointCombat120,conditionEvents225,positionEvents204,refreshRuntimeSources122,centerOf,updatePlayerHp105,mergeCombatProfile225,importCombatProfiles225};\n// New module is DM-only;'),context,{filename:m[1]});
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
   p:{id:'p',role:'player',displayName:'Оператор',stats:{hpCurrent:8,hpMax:10},baseStats:{hpBase:10,implantSlots:1},implantSlotCount:1,traumaV195:{schema:195,degree:0},abilityBase:{intelligence:3},inventory:[{itemId:'implant',qty:1}],implantSlots:['implant'],installedImplantIds:['implant'],skills:['events']},
   q:{id:'q',role:'player',displayName:'Другой игрок',stats:{hpCurrent:10,hpMax:10},baseStats:{hpBase:10}}
  }},
  equipment:{EQUIPMENT:{implant:{id:'implant',name:'Дополнительные команды',type:'implant',modifiers:[{target:'drone_actions',op:'add',value:2}]}}},
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
 const patches=[];let fail=true;
 run("test225.local.combatProfileHashesV120.clear();PlayerSync.pushPlayerPatch=async(playerId,patch)=>window.push225(playerId,patch)");
 w.push225=async(playerId,patch)=>{patches.push({playerId,patch:JSON.parse(JSON.stringify(patch))});return fail?{ok:false,message:'offline'}:{ok:true};};
 token('a').hpCurrent=6;api.updatePlayerHp105(token('a'));
 await api.checkpointCombat120('local action',true);
 assert.equal(patches.length,0,'profiles are deferred until exit');
 await run('UI.closeModule()');
 assert.equal(run("UI.activeModuleId"),'combat','failed upload keeps scene open');
 assert(w.notices225.some(row=>row[0].includes('offline')));
 fail=false;await run('UI.closeModule()');
 assert.notEqual(run('UI.activeModuleId'),'combat');
 assert.equal(patches.filter(row=>row.playerId==='p').at(-1).patch.stats.hpCurrent,6);
 run("Sync.config={enabled:true};PlayerSync.shouldIsolateUsersFromSnapshot=()=>true;");
 w.electronAPI.pullPlayers=async()=>({ok:true,rows:[{playerId:'p',player:JSON.parse(run('JSON.stringify({...App.state.users.p,stats:{...App.state.users.p.stats,hpCurrent:9}})')),version:20}]});
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
