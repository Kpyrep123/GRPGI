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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))vm.runInContext(fs.readFileSync(path.join(root,'renderer',m[1]),'utf8').replace('// New module is DM-only;', 'window.test312={beginCombatTransaction120,finishCombatTransaction120,coverContext312,hexNeighbours108,nearestHexNode108,updatePlayerHp105,centerOf,setConditionV138,createEquipmentUnit105,actualShot312,startWeaponAction312,beginShot312,local,applyStore,collectStoreFromRuntime,entityForToken,itemRuntimeStateV138,incomingDefense119,refreshEquipment311,movementState198,rollEvents225,requestAttackRolls119,applyLuaCommands119,runInteractiveLuaHookV138,runAutomaticHooks119,emit204,damageStages312,applyAbsorptionV138,applyHit199,wearArmorFromBlast093,routeMove312,setGrapple312,releaseGrapple312,conditionStateV138,reactionAvailable195,resources204,epochContext204,magazineState118,writeMagazineState118,disarm312,sensorDetection312,sensorSnapshot312,sharedDetection312,performLuaStandardAttackV138,startOwnTurn199,fitTokenToHex107,canCombatAct129,deviceContext312};\n// New module is DM-only;'),context,{filename:m[1]});
const {Worker}=await import('node:worker_threads');
w.electronAPI.runCombatLuaHook=payload=>new Promise((resolve,reject)=>{
 const worker=new Worker(path.join(root,'lua-sandbox-worker.cjs'));
 const timer=setTimeout(()=>{worker.terminate();reject(Error('Lua timeout'));},10000);
 worker.once('message',message=>{clearTimeout(timer);worker.terminate();resolve(message.ok?{ok:true,...message.result}:{ok:false,message:message.message});});
 worker.once('error',error=>{clearTimeout(timer);worker.terminate();reject(error);});
 worker.postMessage(payload);
});

const pause=()=>new Promise(resolve=>setTimeout(resolve,8));
async function drive(promise,custom){
 let done=false,result,failure;promise.then(v=>{done=true;result=v},e=>{done=true;failure=e});let last;
 for(let count=0;!done&&count<1600;count++){
  const form=w.document.querySelector('.scene-lua-overlay-v119 form');
  if(form&&form!==last){last=form;if(custom&&custom(form)===false){await pause();continue;}
   for(const input of form.querySelectorAll('input[type=number]'))if(!input.value)input.value=input.name==='defenseRoll'?'2':input.name==='damageRoll'?'4':'20';
   form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  }await pause();
 }
 if(!done)throw Error('Modal sequence timed out');if(failure)throw failure;return result;
}
try{
 run(`applyWorldData({equipment:{EQUIPMENT:{
 gun:{id:'gun',name:'Gun',type:'weapon',weaponCategory:'light',damage:'4',range:20,rapidFireShots:3,magazineSize:8,ammoTypeId:'ammo',durabilityMax:10,mass:0},
 ammo:{id:'ammo',name:'Ammo',type:'ammo',mass:0},armor:{id:'armor',name:'Armor',type:'armor',armorWeightClass:'heavy',mass:0,durabilityMax:10,modifiers:[{target:'defense',value:3,op:'add'},{target:'movement',value:-2,op:'add'}]},
 shield:{id:'shield',name:'Shield',type:'shield',shieldBlock:1,mass:0,durabilityMax:10},drone:{id:'drone',name:'Sensor drone',type:'drone',unitMoveRange:6,unitVisionRange:20,unitHp:3,range:20,combatSensors:[{id:'thermal',range:20,revealsHidden:true}]}
 }},skills:{SKILLS:{logic:{id:'logic',name:'Logic',activationType:'passive',luaEnabled:true,luaScript:'-- empty'}}},players:{PLAYER_TEMPLATES:{
 gm:{id:'gm',role:'gm'},p:{id:'p',role:'player',skills:['logic'],displayName:'Actor',abilityBase:{strength:5,dexterity:1,endurance:8,intelligence:3,will:3},baseStats:{movement:6},stats:{hpCurrent:20,hpMax:20},inventory:[{itemId:'gun',qty:1},{itemId:'armor',qty:1}],equipmentSlots:{primaryWeapon:'gun',armor:'armor'}},
 q:{id:'q',role:'player',skills:['logic'],displayName:'Target',abilityBase:{dexterity:1,endurance:8,will:3},stats:{hpCurrent:20,hpMax:20},inventory:[{itemId:'gun',qty:1},{itemId:'armor',qty:1},{itemId:'shield',qty:1}],equipmentSlots:{primaryWeapon:'gun',armor:'armor',secondaryWeapon:'shield'}}
 }}});App.state=makeDefaultState();App.currentUserId='gm';Sync.config={enabled:false};App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};App.writeLocalMirrors=async()=>({ok:true});Persistence.save=async()=>({ok:true});Toast.show=()=>{};`);
 const a=w.test312,R=w.GRPGCombatRuntimeV312;
 a.applyStore({rangeSchema:109,cameraSchema:109,scenes:{s:{id:'s',name:'Test',mode:'combat',width:30,height:20,assets:[],templates:[]}},runtimes:{s:{tokens:[]}},selectedSceneId:'s'});a.local.loaded=true;run("UI.openModule('combat')");
 run("Combat.getRuntime().tokens.push(createPlayerCombatToken('p'),createPlayerCombatToken('q'));Combat.getRuntime().initiativeOrder=Combat.getRuntime().tokens.map(t=>t.id);Combat.getRuntime().turnIndex=0;Combat.getRuntime().battleStarted191=true");
 const p=()=>run('Combat.getRuntime().tokens[0]'),q=()=>run('Combat.getRuntime().tokens[1]');a.fitTokenToHex107(p(),run('Combat.getScene()'),{x:4,y:4});a.fitTokenToHex107(q(),run('Combat.getScene()'),{x:10,y:4});
 const set=script=>{w.script312=script;run("Data.getSkill('logic').luaScript=script312");};
 const source=(owner,script)=>({id:'logic',name:'Logic',kind:'skill',mode:'automatic',ownerToken:owner,script,raw:{id:'logic',activationType:'passive'}});
 const execute=(script,owner=p(),context={})=>a.runInteractiveLuaHookV138(source(owner,'function OnAbilityExecuted(self,p) '+script+' end'),'OnAbilityExecuted',{caster:owner,attacker:owner,...context},{damage:0,effects:[]});
 // Stage values are transient; armor compensation and trauma compensation compose before load.
 set("function ModifyCalculatedStat(self,p) if p.stat=='movement' and p.stage=='before_injury' then return {add=-math.min(0,p.equipmentContributions.armor.movement)} end if p.stage=='after_injury' and p.injuryDegree<=2 then return p.uninjuredValue end end");
 await a.refreshEquipment311();assert.equal(a.movementState198(p(),run('Combat.getScene()')).speed,6);
 await execute('AddInjuryPoints(self:GetCaster(),2)');await a.refreshEquipment311();assert.equal(a.movementState198(p(),run('Combat.getScene()')).speed,6);
 const saved=JSON.stringify(run('App.state.users.p.modifiers'));assert(!saved||!saved.includes('312'));
 await execute('SetInjuryPoints(self:GetCaster(),6)');
 set("function ModifyCalculatedStat(self,p) if p.stage=='before_injury' then local a=p.equipmentContributions.armor;return {add=a and -math.min(0,a.movement) or 0} end if p.stage=='after_injury' and p.injuryDegree==3 then return math.min(p.uninjuredValue,p.value+2) end end");
 await a.refreshEquipment311();assert.equal(a.movementState198(p(),run('Combat.getScene()')).speed,5,'tier 3 restores at most two after division');
 run("Data.getItem('armor').mass=22.5");await a.refreshEquipment311();assert.equal(a.movementState198(p(),run('Combat.getScene()')).speed,2,'load still applies after compensation');
 run("Data.getItem('armor').mass=0");await execute('SetInjuryPoints(self:GetCaster(),0)');await a.refreshEquipment311();
 run("App.state.users.p.equipmentSlots.armor=''");await a.refreshEquipment311();assert.equal(a.movementState198(p(),run('Combat.getScene()')).speed,6);run("App.state.users.p.equipmentSlots.armor='armor'");await a.refreshEquipment311();assert.equal(a.movementState198(p(),run('Combat.getScene()')).speed,6);
 await execute("ApplyCombatRestriction(self:GetCaster(),{kind='no_movement',duration={scope='turn',unitId=self:GetCaster():GetId(),count=1,phase='start'}})");await a.refreshEquipment311();assert.equal(a.movementState198(p(),run('Combat.getScene()')).speed,0,'positive stages do not defeat a movement ban');
 R.state(p()).effects=[];set('-- empty');
 // Mandatory physical reroll is one per roll, even when two requests are emitted.
 set("function AfterRoll(self,p) if p.rollType=='defense' and p.rollingUnit:GetId()==self:GetCaster():GetId() then assert(p.rollContext.purpose=='active_armor');assert(p.rollContext.natural==2);AddRollBonus(2);RequestReroll('first');RequestReroll('second') end end");
 let rerolls=0;const answer=await drive(a.requestAttackRolls119({attacker:p(),target:q(),weapon:run("Data.getItem('gun')"),attackBonus:0,defenseBonus:0,damageBonus:0}),form=>{if(form.elements.reroll312){rerolls++;form.elements.reroll312.value='20';}if(form.elements.attackRoll)form.elements.attackRoll.value='15';});
 assert.equal(rerolls,1);assert.equal(answer.defenseRoll,20);assert.equal(answer.defenseBonusDelta204,2);const replaced=w.GRPGCombatRulesV119.resolveManualAttack({attackRoll:answer.attackRoll,defenseRoll:answer.defenseRoll,attackBonus:answer.attackBonusDelta204,defenseBonus:answer.defenseBonusDelta204,damageRoll:4,damageBonus:0,damageReduction:0});assert.equal(replaced.defenseCritical,true);assert.equal(replaced.hit,false);assert.equal(replaced.attackMargin,-7);
 // Cancelling the reroll produces no attack/HP/ammunition consequences.
 const hp=q().hpCurrent,ammo=a.magazineState118(p(),run("Data.getItem('gun')")).loaded;
 await assert.rejects(drive(a.requestAttackRolls119({attacker:p(),target:q(),weapon:run("Data.getItem('gun')"),attackBonus:0,defenseBonus:0,damageBonus:0}),form=>{if(form.elements.reroll312){form.querySelector('[data-lua-decline-v119]').click();return false;}}),/переброс отменён/);
 assert.equal(q().hpCurrent,hp);assert.equal(a.magazineState118(p(),run("Data.getItem('gun')")).loaded,ammo);
 // A requested ability check returns a stable roll identity, natural value and separate total.
 set('-- empty');await drive(execute("local c=RequestCheck('will-check',{attribute='will',purpose='ability_save',dc=10});if c then assert(c.rollId~='');self:SetData('checkNatural312',c.natural);self:SetData('checkTotal312',c.total) end"));
 assert.equal(p().luaState204['skill:logic'].checkNatural312,20);assert.equal(p().luaState204['skill:logic'].checkTotal312,23);
 // Numeric shield block follows armor and cannot reduce explosive armor wear.
 set("function AfterArmor(self,p) if self:GetCaster():GetId()==p.target:GetId() then BlockShield(p.target,'secondaryWeapon') end end");
 const armor=a.itemRuntimeStateV138(q(),run("Data.getItem('armor')"),'armor');armor.durability=10;armor.broken=false;
 const damage={damage:4,effects:[]},reduction=a.applyAbsorptionV138(damage,a.incomingDefense119(q(),'light',null,'explosive'));
 assert.equal(reduction.applied,1);assert.equal(reduction.explosiveArmorBlocked,3);
 const after=await a.damageStages312(q(),damage,reduction,{attacker:p(),target:q(),damageType:'explosive'});assert.equal(after,0);
 await drive(a.applyHit199(q(),after,'Explosion',p(),{damageType:'explosive',blastReduction093:reduction}));assert.equal(a.itemRuntimeStateV138(q(),run("Data.getItem('armor')"),'armor').durability,7);assert.equal(q().hpCurrent,hp);
 // Full weapon mode and legacy single mode share attacks but aggregate the action once.
 set("function OnActionFinished(self,p) if p.weaponAction and p.weaponAction.ownerId==self:GetCaster():GetId() then self:SetData('shots312',p.weaponAction.actualShots) end end");
 p().actionUsed=false;R.state(q()).effects=[];run("App.state.users.q.equipmentSlots.armor='';App.state.users.q.equipmentSlots.secondaryWeapon=''");
 await drive(a.performLuaStandardAttackV138({attackerId:p().id,targetId:q().id,slot:'primaryWeapon',mode312:'weapon',consumeAction:true}));assert.equal(p().weaponAction312.shots.length,3);assert.equal(p().luaState204['skill:logic'].shots312,3);assert.equal(a.magazineState118(p(),run("Data.getItem('gun')")).loaded,ammo-3);
 // Target switching and a braced weapon use the native burst penalty formula.
 const alternative=run("normalizeCombatToken({id:'alternate312',name:'Alternate',type:'unit',hpCurrent:20,hpMax:20,x:12,y:5,w:1,h:1})");run('Combat.getRuntime().tokens').push(alternative);q().hpCurrent=20;a.updatePlayerHp105(q());p().actionUsed=false;p().brace229={weaponId:'gun'};a.writeMagazineState118(p(),run("Data.getItem('gun')"),{loaded:8,ammoTypeId:'ammo'},'primaryWeapon');
 await drive(a.performLuaStandardAttackV138({attackerId:p().id,targetId:q().id,targetIds312:[q().id,alternative.id,q().id],slot:'primaryWeapon',mode312:'weapon'}));
 assert.deepEqual(Array.from(p().weaponAction312.shots,shot=>shot.targetSwitchPenalty),[0,-1,-2]);assert.deepEqual(Array.from(p().weaponAction312.shots,shot=>shot.seriesPenalty),[0,0,-1]);delete p().brace229;run("Combat.getRuntime().tokens=Combat.getRuntime().tokens.filter(t=>t.id!=='alternate312')");
 // A reaction ban suppresses an entire extended pool and expires on the specified actor's own turn.
 set('-- empty');p().actionUsed=false;
 await execute("DefineResource(self:GetCaster(),'reaction',{max=2,reset='turn'});ApplyCombatRestriction(self:GetCaster(),{kind='no_reactions',duration={scope='turn',unitId=GetUnits()[2]:GetId(),count=1,phase='start'}})");
 assert.equal(a.reactionAvailable195(p()),false);assert.equal(a.resources204(p()).reaction.value,2);
 q().ownTurnV199++;await a.emit204('OnTurnStart',q(),{unit:q(),caster:q()},{damage:0,effects:[]});assert.equal(a.reactionAvailable195(p()),true);
 // Worker replay and save/load do not duplicate resource spending.
 const cmdScript="SpendResource(self:GetCaster(),'reaction',1)";await execute(cmdScript,p(),{eventId204:'stable-operation312'});await execute(cmdScript,p(),{eventId204:'stable-operation312'});assert.equal(a.resources204(p()).reaction.value,1);
 const bridge=w.GRPGCombatStateV291.captureLua(p());delete p().luaCombat312;w.GRPGCombatStateV291.restoreLua(p(),JSON.parse(JSON.stringify(bridge)));await execute(cmdScript,p(),{eventId204:'stable-operation312'});assert.equal(a.resources204(p()).reaction.value,1);
 // Route callbacks run before the next hex and can stop the native path without teleportation.
 set("function BeforeMoveStep(self,p) if self:GetCaster():GetId()==p.unit:GetId() then StopMovement('boundary') end end");
 const position={x:p().x,y:p().y};await a.routeMove312({unitId:p().id,x:7,y:4,additional:true,budget:3},{caster:p()},{effects:[]});assert.deepEqual({x:p().x,y:p().y},position);
 set('-- empty');const moved=await a.routeMove312({unitId:p().id,x:7,y:4,additional:true,budget:3},{caster:p()},{effects:[]});assert(moved.steps>0);assert(moved.spent<=3);
 // Only the actual physical-cover contribution changes; repeated ignore does not subtract twice.
 const midpoint={x:(a.centerOf(p()).x+a.centerOf(q()).x)/2,y:(a.centerOf(p()).y+a.centerOf(q()).y)/2};
 const physical=run("normalizeCombatAsset({id:'physical-cover312',coverType:'partial',coverArmorBonus:2,w:1,h:2,blockMovement:false,blockSight:false})");physical.x=midpoint.x;physical.y=midpoint.y-1;run('Combat.getScene().assets').push(physical);
 const cover=a.coverContext312(p(),q(),run("Data.getItem('gun')"));assert.equal(cover.rawBonus,2);assert(cover.sources.some(row=>row.id==='physical-cover312'));
 const coverState={defenseBonus:5,damage:0,effects:[]};await a.runInteractiveLuaHookV138(source(p(),"function BeforeAttackRoll(self,p) assert(p.cover.rawBonus==2);IgnorePhysicalCover();IgnorePhysicalCover() end"),'BeforeAttackRoll',{caster:p(),attacker:p(),target:q(),weapon:run("Data.getItem('gun')")},coverState);assert.equal(coverState.defenseBonus,3);
 const shieldCoverState={defenseBonus:5,damage:0,effects:[]};await a.runInteractiveLuaHookV138(source(p(),"function BeforeAttackRoll(self,p) ModifyPhysicalCover(1) end"),'BeforeAttackRoll',{caster:p(),attacker:p(),target:q(),cover312:{bonus:0,rawBonus:0,shieldBonus:3}},shieldCoverState);assert.equal(shieldCoverState.defenseBonus,5,'weak physical cover does not stack with a better shield');
 run("Combat.getScene().assets=Combat.getScene().assets.filter(row=>row.id!=='physical-cover312')");
 // A defensive route can invalidate a melee shot before its action or cartridge is paid.
 q().hpCurrent=20;a.setConditionV138(q(),'dying',false);a.setConditionV138(q(),'unconscious',false);a.updatePlayerHp105(q());const near=a.hexNeighbours108(run('Combat.getScene()'),a.nearestHexNode108(run('Combat.getScene()'),a.centerOf(p())))[1];a.fitTokenToHex107(q(),run('Combat.getScene()'),near);
 run("Data.getItem('gun').weaponCategory='melee';Data.getItem('gun').range=1");p().actionUsed=false;const beforeEscapeAmmo=a.magazineState118(p(),run("Data.getItem('gun')")).loaded;
 set("function GetEventScope(self) return 'scene' end function BeforeAttackStart(self,p) if self:GetCaster():GetId()==p.target:GetId() then local point=p.target:GetAbsOrigin();MoveRoute(p.target,Vector(point.x+4,point.y),{additional=true,budget=3}) end end");
 await assert.rejects(drive(a.performLuaStandardAttackV138({attackerId:p().id,targetId:q().id,slot:'primaryWeapon'})),/цель вне дальности/);
 assert.equal(p().actionUsed,false);assert.equal(a.magazineState118(p(),run("Data.getItem('gun')")).loaded,beforeEscapeAmmo);
 run("Data.getItem('gun').weaponCategory='light';Data.getItem('gun').range=20");
 // Preparations survive the profile bridge and execute once, with one reaction cost.
 p().actionUsed=false;set('-- empty');
 await execute("PrepareAction(self:GetCaster(),{id='ready312',trigger='OnMoveEnd',triggerUnit=GetUnits()[2],action='attack',target=GetUnits()[2],slot='primaryWeapon'})",p(),{eventId204:'ready-create312'});
 await execute("PrepareAction(self:GetCaster(),{id='ready312',trigger='OnMoveEnd',triggerUnit=GetUnits()[2],action='attack',target=GetUnits()[2],slot='primaryWeapon'})",p(),{eventId204:'ready-create312'});
 assert.equal(R.state(p()).prepared.length,1);assert.equal(p().actionUsed,true);
 const preparedSave=w.GRPGCombatStateV291.captureLua(p());delete p().luaCombat312;w.GRPGCombatStateV291.restoreLua(p(),JSON.parse(JSON.stringify(preparedSave)));
 await drive(a.emit204('OnMoveEnd',q(),{unit:q(),attacker:q(),caster:q()},{damage:0,effects:[]}));assert.equal(R.state(p()).prepared.length,0);assert.equal(a.resources204(p()).reaction.value,0);
 await a.emit204('OnMoveEnd',q(),{unit:q(),attacker:q(),caster:q()},{damage:0,effects:[]});assert.equal(a.resources204(p()).reaction.value,0);
 // A grapple stores both participants, routes them together and releases its hand restriction.
 q().hpCurrent=20;a.setConditionV138(q(),'dying',false);a.setConditionV138(q(),'unconscious',false);const center=a.centerOf(p());a.fitTokenToHex107(q(),run('Combat.getScene()'),a.hexNeighbours108(run('Combat.getScene()'),a.nearestHexNode108(run('Combat.getScene()'),center))[4]);a.updatePlayerHp105(q());
 a.setGrapple312(p(),q());assert.equal(R.state(q()).grapple.otherId,p().id);const heldBefore=a.centerOf(q());
 const drag=await a.routeMove312({unitId:p().id,x:center.x+2,y:center.y,additional:true,budget:2},{caster:p()},{effects:[]});assert(drag.steps>0);assert.notDeepEqual(a.centerOf(q()),heldBefore);assert(w.GRPGUnitSizeV184.distance(p(),q())<=1);
 a.releaseGrapple312(p());assert.equal(a.conditionStateV138(q()).grappled,false);assert.equal(a.conditionStateV138(p()).handsBusy,false);
 // Sensor sharing is tied to an actual device and is invalidated by physical walls.
 const drone=a.createEquipmentUnit105('drone');drone.id='sensor-device312';drone.operatorTokenIdV129=p().id;run('Combat.getRuntime().tokens').push(drone);a.fitTokenToHex107(drone,run('Combat.getScene()'),{x:a.centerOf(p()).x-1,y:a.centerOf(p()).y});a.fitTokenToHex107(q(),run('Combat.getScene()'),{x:a.centerOf(p()).x+3,y:a.centerOf(p()).y});q().hidden=true;
 assert.equal(a.sensorDetection312(drone,q(),'thermal').detected,true);assert.equal(a.sensorDetection312(drone,q(),'visual').detected,false);
 await execute("ShareSensorDetection(GetUnits()[3],GetUnits()[2],self:GetCaster(),{sensor='thermal',shots=2})");assert.equal(a.sharedDetection312(p(),q()),true);
 const share=R.state(p()).shares[0],fakeWeapon=run("Data.getItem('gun')");a.startWeaponAction312(p(),fakeWeapon,{mode:'single'});a.beginShot312(p(),fakeWeapon,p().weaponAction312,1);a.actualShot312(p(),{target:q()});a.actualShot312(p(),{target:q()});assert.equal(share.uses,1,'replayed confirmation does not consume another shared shot');
 run('Combat.getScene().assets').push(run("normalizeCombatAsset({id:'sensor-wall',x:8,y:0,w:1,h:20,blockSight:true,blockMovement:true,coverType:'total'})"));
 // Place the wall between the linked sensor and the target at known coordinates.
 const wall=run("Combat.getScene().assets.find(row=>row.id==='sensor-wall')");wall.x=(a.centerOf(drone).x+a.centerOf(q()).x)/2;assert.equal(a.sharedDetection312(p(),q()),false,'information never bypasses walls');run("Combat.getScene().assets=Combat.getScene().assets.filter(row=>row.id!=='sensor-wall')");
 // The complex command uses the existing operator ledger, and replay cannot issue it twice.
 p().actionUsed=false;run("App.state.users.p.modifiers.push({target:'drone_actions',op:'add',value:1})");
 await execute("CommandDevice(self:GetCaster(),GetUnits()[3],{operation='none'})",p(),{eventId204:'device-command312'});const issued=JSON.stringify(p().droneControlV200);
 await execute("CommandDevice(self:GetCaster(),GetUnits()[3],{operation='none'})",p(),{eventId204:'device-command312'});assert.equal(JSON.stringify(p().droneControlV200),issued);assert.equal(drone.droneCommandV129.completed,true);
 // A defensive route inside an attack still offers opportunity attacks and restores the parent transaction.
 q().teamId='opponents';q().reactionUsedV119=false;const parentCenter=a.centerOf(p());a.fitTokenToHex107(q(),run('Combat.getScene()'),a.hexNeighbours108(run('Combat.getScene()'),a.nearestHexNode108(run('Combat.getScene()'),parentCenter))[4]);
 const parentTransaction=a.beginCombatTransaction120('attack','s',p().id,[q().id]);assert(parentTransaction);
 await drive(a.routeMove312({unitId:p().id,x:parentCenter.x+4,y:parentCenter.y,additional:true,budget:2},{caster:p()},{effects:[]}));
 assert.equal(q().reactionUsedV119,true,'opportunity reaction is spent inside the pending attack');assert.equal(a.local.combatTransactionV120.id,parentTransaction.id);assert.equal(q().weaponAction312.source,'opportunity');assert.equal(q().weaponAction312.shots.length,1);a.finishCombatTransaction120(parentTransaction);
 // The exact copy, magazine and improvements leave the slot together.
 const gun=a.itemRuntimeStateV138(p(),run("Data.getItem('gun')"),'primaryWeapon');gun.attachments=[{itemId:'scope',copy:{id:'scope-instance'},modifiers:[]}];gun.aberration252={effects:['weapon-2-3']};
 a.writeMagazineState118(p(),run("Data.getItem('gun')"),{loaded:2,ammoTypeId:'ammo'},'primaryWeapon');
 const dropped=await a.disarm312(p(),'primaryWeapon'),copy=dropped.lootStateV118.items[0].copiesV287[0];assert.equal(copy.id,gun.id);assert.equal(copy.magazine312.loaded,2);assert.equal(copy.attachments[0].copy.id,'scope-instance');assert.equal(copy.aberration252.effects[0],'weapon-2-3');assert.equal(run('App.state.users.p.equipmentSlots.primaryWeapon'),'');assert(!run('App.state.users.p.inventory').some(row=>row.itemId==='gun'&&row.qty>0),'the dropped copy is removed from its original owner');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS v312 runtime: pure stat stages, physical rerolls/cancel, armor-before-block wear, weapon action, extended reaction restrictions, durable replay, routed steps and atomic instance drop');
}finally{await w.happyDOM.abort();w.close();fs.rmSync(scratch,{recursive:true,force:true});}
