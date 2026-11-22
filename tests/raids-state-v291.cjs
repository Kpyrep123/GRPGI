'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{Worker}=require('node:worker_threads');
const Core=require('../raid-service/raid-core.cjs'),Bridge=require('../renderer/combat-state-v291.js'),Lua=require('../renderer/combat-lua-v204.js');
let serial=0;const id=()=> 'state:'+ ++serial,random=()=>.5;
const z=(id,kind)=>({id,shape:'polygon',raidZone290:kind,points:[{x:1,y:1},{x:8,y:1},{x:8,y:8},{x:1,y:8}]});
const mission={id:'state',name:'State',entry:{planetId:'p',objectId:'o',dialogId:'d'},maps:[{id:'map',width:20,height:20,tokens:[],assets:[],templates:[z('spawn','spawn'),z('evac','evacuation')]}],reward:{credits:0,skillPoints:0,items:[]},goals:[{id:'g',type:'eliminate'}]};
const script=`function OnAbilityExecuted(self,p)
 self:DefineResource('uses',{max=3,reset='manual'})
 if not self:HasResource('uses',1) then error('empty') end
 self:SpendResource('uses',1)
 self:SetData('count',self:GetData('count',0)+1)
 ApplyModifier(self:GetCaster(),self:GetCaster(),{id='strength',duration=3,effects={ModifierEffect('strength',2),ModifierEffect('max_hp',2)}})
 end`;
const world={equipment:{EQUIPMENT:{}},skills:{SKILLS:{counter:{id:'counter',name:'Counter',activationType:'active',luaScript:script}}}};
const profile={id:'a',role:'player',abilityBase:{endurance:2,strength:2,dexterity:2},stats:{hpCurrent:8,hpMax:8},skills:['counter'],inventory:[]};
const execute=payload=>new Promise((resolve,reject)=>{const worker=new Worker(path.resolve(__dirname,'../lua-sandbox-worker.cjs')),timer=setTimeout(()=>{worker.terminate();reject(Error('timeout'));},5000);worker.on('error',reject);worker.on('message',result=>{clearTimeout(timer);worker.terminate();resolve(result);});worker.postMessage(payload);});
async function use(s,e,now){e.command('a',{type:'ability',sourceId:'counter'},now);const job=s.job,result=await execute(job.payload);assert(result.ok,result.message);assert(e.jobResult(job.id,result,now+1),s.error);}
(async()=>{
 const s=Core.create(world,mission,[profile],1000,random,id),e=Core.engine(s,random,id);s.id='campaign|week';await use(s,e,1100);let u=e.unit('a');assert.equal(u.luaResources204['skill:counter/uses'].value,2);assert.equal(u.luaState204['skill:counter'].count,1);assert.equal(e.computed(u).abilities.strength,4);assert.equal(u.hpMax,10);assert.equal(u.hpCurrent,8,'a modifier does not heal HP');assert.equal(u.traumaV195.injuryPoints,0);
 let saved=e.profiles().a;const snapshot=saved.combatState093.lua204;assert.equal(snapshot.resources['skill:counter/uses'].value,2);assert.equal(snapshot.modifiers.length,1);
 // A scene token has a new runtime ID. Own-turn duration references follow it.
 const token={id:'desktop-token'};Bridge.restoreLua(token,{...snapshot,ownerId:'a',modifiers:[{id:'root',duration204:{scope:'turn',unitId:'a',remaining:2,count:2,phase:'end'}}]});assert.equal(token.timedModifiersV122[0].duration204.unitId,'desktop-token');assert.equal(token.luaResources204['skill:counter/uses'].value,2);assert.notEqual(token.luaState204,snapshot.sourceData);
 const restored=Core.create(world,mission,[saved],2000,random,id),r=Core.engine(restored,random,id);restored.id='other|week';assert.equal(r.unit('a').hpMax,10);assert.equal(r.unit('a').hpCurrent,8);await use(restored,r,2100);u=r.unit('a');assert.equal(u.luaResources204['skill:counter/uses'].value,1,'new attempt does not replenish manual resources');assert.equal(u.luaState204['skill:counter'].count,2);assert.equal(r.computed(u).abilities.strength,4,'same modifier ID replaces its previous effects');
 // End/start changes turn/round resources; manual resources remain spent.
 const context={sceneId:'s',battleId:'b',round:1,turn:1,unitId:'a'},rows={};for(const reset of ['turn','round','battle','scene','manual']){Lua.define(rows,reset,{max:3,initial:2,reset},context);Lua.spend(rows,reset,1,context);}const moved={...context,turn:2,round:2};assert.equal(Lua.resource(rows,'turn',moved).value,2);assert.equal(Lua.resource(rows,'round',moved).value,2);assert.equal(Lua.resource(rows,'manual',moved).value,1);assert.equal(Lua.resource(rows,'battle',{...moved,battleId:'new'}).value,2);
 // Expiry is once per matching phase, not once per poll or profile synchronization.
 const timed={id:'a',timedModifiersV122:[{id:'t',duration204:{scope:'turn',phase:'end',unitId:'a',remaining:2}},{id:'legacy',remainingTurns:2}]};Bridge.expire(timed,'OnTurnEnd',context);assert.equal(timed.timedModifiersV122[0].duration204.remaining,1);Bridge.expire(timed,'OnTurnStart',context);assert.equal(timed.timedModifiersV122[0].duration204.remaining,1);Bridge.expire(timed,'OnTurnEnd',{...context,turn:2});assert.equal(timed.timedModifiersV122.length,0);
 // Both the old scene format and the earlier raid format preserve critical conditions.
 assert.deepEqual(Bridge.conditions({dying:true,unconscious:true}),{dying:true,unconscious:true});assert.equal(Bridge.conditions({conditions:{dying:true},dying:false}).dying,false);
 for(const state of [{schema:1,dying:true,unconscious:true},{schema:1,conditions:{dying:true,unconscious:true}}])assert.throws(()=>Core.create(world,mission,[{...profile,combatState093:state}],1000,random,id),/не готов/);
 // Legacy reaction cost is charged once, including when the script spends it explicitly.
 r.unit('a').profile.skills.push('react');restored.world.skills.SKILLS.react={id:'react',name:'React',activationType:'reaction',luaScript:'function BeforeDamage(self,p) ReduceDamage(1) end'};Lua.define(u.luaResources204,'reaction',{max:2,reset:'manual'},{});
 for(let n=0;n<2;n++){if(n)restored.world.skills.SKILLS.react.luaScript='function BeforeDamage(self,p) SpendReaction(self:GetCaster()) ReduceDamage(1) end';r.event('BeforeDamage',[u],{});r.drain(3000+n*100);assert.equal(restored.pending.kind,'reaction');r.command('a',{type:'reaction',pendingId:restored.pending.id,sourceId:'react'},3010+n*100);const job=restored.job,result=await execute(job.payload);assert(result.ok,result.message);assert(r.jobResult(job.id,result,3020+n*100),restored.error);assert.equal(r.resources(u).reaction.value,1-n);}
 restored.world.skills.SKILLS.free={id:'free',name:'Free',activationType:'active',luaCostMode:'scripted',luaScript:'function OnAbilityExecuted(self,p) self:SetData("free",true) end'};u.profile.skills.push('free');u.actionUsed=false;r.command('a',{type:'ability',sourceId:'free'},4000);let freeJob=restored.job;r.jobResult(freeJob.id,await execute(freeJob.payload),4010);assert.equal(u.actionUsed,false,'scripted cost does not acquire an automatic Action cost');
 restored.world.skills.SKILLS.free.luaScript='function OnAbilityExecuted(self,p) SpendAction(self:GetCaster()) end';r.command('a',{type:'ability',sourceId:'free'},4100);freeJob=restored.job;const freeResult=await execute(freeJob.payload);assert(freeResult.ok,freeResult.message);r.jobResult(freeJob.id,freeResult,4110);assert.equal(u.actionUsed,true);
 const final=r.profiles().a;assert.equal(final.combatState093.dying,false);assert.equal(final.combatState093.unconscious,false);
 console.log('PASS raid state: real Lua resources/sourceData, modifier stats/expiry, max HP without damage/heal, profile/scene bridge and legacy critical conditions');
})().catch(error=>{console.error(error);process.exitCode=1;});
