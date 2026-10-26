const assert=require('node:assert/strict'),M=require('../renderer/combat-session-v193.js');
let seq=0;const id=p=>p+'_'+(++seq),clone=structuredClone;
const p={id:'p1',playerId:'p',name:'Игрок',x:2,y:3,hpCurrent:7,hpMax:10,initiative:18,actionUsed:true,movedThisTurn:3,reactionUsedV119:true,weaponId:'w',weaponMagazinesV118:{w:{loaded:2}},weaponMalfunctionsV122:{w:true},injuriesV129:[{degree:3}],conditionsV138:{prone:true},itemStateV138:{shield:{durability:0,destroyed:true}},timedModifiersV122:[{id:'ongoing',remainingTurns:2},{id:'battle',remainingTurns:2,resetScope193:'battle'},{id:'scene',remainingTurns:3,resetScope193:'scene'}],usage193:{battle:{pain:1},scene:{medic:1}},burstStateV122:{weaponId:'w',nextShot:2,maxShots:3}};
const n={id:'n1',npcId:'n',name:'NPC1',hpCurrent:3,hpMax:10,initiative:12,combatInventoryV120:[{itemId:'ammo',qty:1}],actionUsed:true};
const twin={...clone(n),id:'n2',name:'NPC2',hpCurrent:8};
const drone={id:'d',equipmentType:'drone',equipmentItemId:'drone',hpCurrent:2,operatorTokenIdV129:'p1',droneCommandV129:{operatorTokenId:'p1',moduleUsed:true}};
const source={tokens:[p,n,twin,drone],initiativeOrder:['p1','n1','n2'],turnIndex:0,round:4,battleStarted191:true};
const s=M.create('a',source,'combat',id),narrative=s.narrativeId,battle=s.battleId;
assert.notEqual(n.participantId193,twin.participantId193);
const dest={tokens:[{...clone(p),id:'placeholder',hpCurrent:10,actionUsed:false,x:15,y:7}],round:1,initiativeOrder:[]};
M.transfer(s,'b',dest);assert.equal(dest.tokens[0].id,'p1');assert.equal(dest.tokens[0].hpCurrent,7);assert.equal(dest.tokens[0].x,15);assert.equal(dest.round,4);assert.equal(dest.tokens[0].actionUsed,true);assert.equal(dest.tokens[0].weaponMagazinesV118.w.loaded,2);assert.equal(s.narrativeId,narrative);assert.equal(s.battleId,battle);
// Detached copies cannot mutate canonical participant state or the former token.
dest.tokens[0].hpCurrent=6;assert.equal(s.participants['player:p'].hpCurrent,7);assert.equal(source.tokens[0].hpCurrent,7);M.capture(s,'b',dest,'combat');assert.equal(s.participants['player:p'].hpCurrent,6);
// A stale map save does not take ownership.
source.tokens[0].hpCurrent=10;M.capture(s,'a',source,'combat');assert.equal(s.participants['player:p'].hpCurrent,6);
const restored=JSON.parse(JSON.stringify(s)),late={tokens:[],initiativeOrder:[],turnIndex:0};M.transfer(restored,'c',late);M.order(restored,late);assert.equal(late.initiativeOrder[late.turnIndex],'p1');assert.equal(late.round,4);
late.tokens.push(M.place(restored.participants[n.participantId193],{x:12,y:4}));assert.equal(late.tokens[0].combatInventoryV120[0].qty,1);assert.equal(late.tokens[0].hpCurrent,3);
late.tokens.push(M.place(restored.participants[drone.participantId193],{x:13,y:4}));assert.equal(late.tokens[1].operatorTokenIdV129,'p1');assert.equal(late.tokens[1].droneCommandV129.moduleUsed,true);
const fork=M.forkMap(source,id);assert.notEqual(fork.tokens[1].id,n.id);assert.equal(fork.tokens[0].id,p.id);assert.equal(fork.tokens[3].operatorTokenIdV129,p.id);assert.equal(fork.tokens[1].participantId193,'');
// New battle clears only battle/turn lifetimes, never gear, trauma or arbitrary modifiers.
M.reset(restored,'battle',id);const actor=restored.participants['player:p'];assert.notEqual(restored.battleId,battle);assert.equal(restored.narrativeId,narrative);assert.equal(actor.hpCurrent,6);assert.equal(actor.weaponMagazinesV118.w.loaded,2);assert.equal(actor.weaponMalfunctionsV122.w,true);assert.equal(actor.itemStateV138.shield.destroyed,true);assert.equal(actor.injuriesV129[0].degree,3);assert.equal(actor.actionUsed,false);assert.equal(actor.movedThisTurn,0);assert.equal(actor.burstStateV122,null);assert.deepEqual(actor.usage193,{battle:{},scene:{medic:1}});assert.deepEqual(actor.timedModifiersV122.map(m=>m.id),['ongoing','scene']);
M.reset(restored,'scene',id);assert.notEqual(restored.narrativeId,narrative);assert.equal(restored.battleId,'');assert.equal(restored.mode,'standard');assert.equal(actor.hpCurrent,6);assert.deepEqual(actor.usage193,{battle:{},scene:{}});assert.deepEqual(actor.timedModifiersV122.map(m=>m.id),['ongoing']);
assert.throws(()=>M.transfer(restored,'bad',{tokens:[clone(p),clone(p)]}),/два токена/);
console.log('PASS canonical actors, distinct NPC instances, preplaced/late transfer, stable drone references, detached mirrors, save/reload, exact scoped resets and duplicate guard');
// Exercise the real main-process atomic JSON writer/backup, not a renderer mock.
(async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grpg-session193-'));
 try{
  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'),source=main.slice(main.indexOf('function combatLocalStoreFile()'),main.indexOf('async function saveCombatLocalImage'));
  const context=vm.createContext({fs,path,app:{getPath:()=>dir}});vm.runInContext(source,context);
  const payload={version:3,session193:restored,runtimes:{c:late}};
  await context.writeCombatLocalStore(payload);const read=await context.readCombatLocalStore();assert.deepEqual(JSON.parse(JSON.stringify(read.payload)),JSON.parse(JSON.stringify(payload)));
  const second=clone(payload);second.session193.participants['player:p'].hpCurrent=4;await context.writeCombatLocalStore(second);
  const reloaded=JSON.parse(fs.readFileSync(path.join(dir,'scene-editor-local-v2.json'),'utf8'));assert.equal(reloaded.session193.participants['player:p'].hpCurrent,4);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'scene-editor-local-v2.json.bak'),'utf8')).session193.participants['player:p'].hpCurrent,6);
  console.log('PASS actual main-process JSON persistence/readback and previous-revision backup retain session/participant data');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
