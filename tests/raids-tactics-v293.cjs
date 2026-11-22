'use strict';
const assert=require('node:assert/strict'),C=require('../raid-service/raid-core.cjs'),I=require('../renderer/item-instances-v215.js');
let serial=0;const id=()=>`tactics:${++serial}`,random=()=>.5;
const zone=(id,kind)=>({id,shape:'polygon',raidZone290:kind,points:[{x:1,y:1},{x:9,y:1},{x:9,y:9},{x:1,y:9}]});
const world={equipment:{EQUIPMENT:{sword:{id:'sword',name:'Sword',type:'weapon',weaponCategory:'melee',range:1,damage:'1',durabilityMax:20,rapidFireShots:3},drone:{id:'drone',type:'drone',name:'Drone',unitHp:6,unitMoveRange:5,unitVisionRange:9,unitArmorClass:7,range:10,damage:'1',mass:1,durabilityMax:10},med:{id:'med',type:'gear',name:'Med',mass:0}}},skills:{SKILLS:{}}};
const mission={id:'tactics',entry:{planetId:'p',objectId:'o',dialogId:'d'},maps:[{id:'map',width:20,height:20,assets:[{id:'box',name:'Box',x:1,y:3,w:1,h:1,lootStateV118:{items:[{itemId:'med',qty:2},{itemId:'sword',qty:1,copiesV287:[{id:'unique',durability:3,durabilityMax:20,aberration252:{effects:[],rarity:'common'},attachments:[]}]}]}}],tokens:[],templates:[zone('spawn','spawn'),zone('evac','evacuation')]}],goals:[{id:'g',type:'eliminate'}],reward:{credits:0,skillPoints:0,items:[]}};
const player=(id)=>({id,role:'player',abilityBase:{endurance:8,strength:0,dexterity:0,will:5,intelligence:3},stats:{hpCurrent:20,hpMax:20},baseStats:{movement:8,carryBase:100,inventorySlots:20},inventory:[{itemId:'sword',qty:1},{itemId:'drone',qty:1}],equipmentSlots:{primaryWeapon:'sword'}});
function make(){const s=C.create(world,mission,[player('a'),player('b'),player('c')],1000,random,id);return{s,e:C.engine(s,random,id)};}
// Typed help is once per scene, not once per map/turn, and consumed by the matching roll only.
{
 const {s,e}=make();e.command('a',{type:'help',target:'b',checkType:'defense'},1100);assert.equal(e.unit('b').help229.bonus,6);assert.equal(e.unit('a').actionUsed,true);e.unit('a').actionUsed=false;assert.throws(()=>e.command('a',{type:'help',target:'c'},1200),/Помощь/);e.unit('c').teamId='npcs';e.unit('c').x=3.5;e.unit('b').x=2.5;e.command('a',{type:'end'},1300);e.command('b',{type:'attack',target:'c'},1400);assert(e.unit('b').help229,'defense help is not consumed by attack');e.unit('b').burst=null;e.command('b',{type:'end'},1500);e.command('c',{type:'attack',target:'b'},1600);assert.equal(e.unit('b').help229,undefined);
}
// Saved opportunity prompt resolves before the movement step, declines/timeouts cost nothing.
{
 let {s,e}=make();e.unit('b').teamId='npcs';e.command('a',{type:'move',x:1.5,y:3.5},1100);assert.equal(s.pending.kind,'opportunity');assert.equal(e.unit('a').y,1.5);const pid=s.pending.id;s=JSON.parse(JSON.stringify(s));e=C.engine(s,random,id);e.command('b',{type:'opportunity',pendingId:pid,sourceId:'primaryWeapon'},1200);assert.equal(e.unit('b').reactionUsedV119,true);assert.equal(e.unit('b').actionUsed,false);assert.equal(e.unit('b').burst,null,'opportunity is a single attack');assert.equal(e.unit('a').y,3.5);assert.equal(s.move292,undefined);assert.throws(()=>e.command('b',{type:'opportunity',pendingId:pid,sourceId:'primaryWeapon'},1300));
 const f=make();f.e.unit('b').teamId='npcs';f.e.command('a',{type:'disengage'},1100);f.e.command('a',{type:'move',x:1.5,y:3.5},1200);assert.equal(f.s.pending,undefined);assert.equal(f.e.unit('b').reactionUsedV119,false);assert.equal(f.e.unit('a').actionUsed,true);
 const g=make();g.e.unit('b').teamId='npcs';g.e.command('a',{type:'move',x:1.5,y:3.5},1100);g.e.tick(g.s.pending.until+1501);assert.equal(g.e.unit('b').reactionUsedV119,false);assert.equal(g.e.unit('a').y,3.5);
}
// Damage no longer requests Instinct. Legacy panic saves resume without replaying damage.
{
 const {s,e}=make(),a=e.unit('a');e.damage(a,6,'gas',{attackerId:'b'});e.drain(1200);
 assert.equal(a.hpCurrent,14);assert.equal(a.traumaV195.injuryPoints,6);assert(!s.pending);assert(!s.instinct293);assert.equal(a.reactionUsedV119,false);
 for(const kind of ['panic','panicPoint']){
  const saved=JSON.parse(JSON.stringify(s)),u=saved.units.find(u=>u.id==='a');
  u.moraleV199=[{kind:'panic',sourceId:'b'}];u.instinctPendingV199={damage:6};u.conditionsV138.panic=true;u.conditionsV138.shaken=true;u.conditionsV138.prone=true;u.loseNextAction093=true;
  u.profile.combatState093={morale:u.moraleV199,conditions:{panic:true,shaken:true,prone:true},ownTurn:4};
  saved.pending={id:'old',kind,actor:'a',until:1400};saved.instinct293=[{target:'a',damage:6}];saved.move292={panic:true};saved.remainingTurn=10000;
  const restored=C.engine(saved,()=>0,id);restored.drain(1500);
  assert(!saved.pending);assert(!saved.move292);assert(!saved.instinct293);assert.equal(u.hpCurrent,14);assert.equal(u.traumaV195.injuryPoints,6);assert.equal(u.reactionUsedV119,false);assert.equal(u.loseNextAction093,true);assert.equal(u.conditionsV138.prone,true);
  assert(!u.moraleV199);assert(!u.instinctPendingV199);assert(!u.conditionsV138.panic);assert(!u.conditionsV138.shaken);
  const profile=restored.profiles().a;assert(!profile.combatState093.morale);assert.equal(profile.combatState093.conditions.prone,true);
 }
 const q=make();q.e.unit('b').x=5.5;q.e.unit('c').x=6.5;q.e.unit('a').moraleV199=[{kind:'shaken',sourceId:'b'}];const restored=C.engine(q.s,random,id);restored.command('a',{type:'move',x:2.5,y:1.5},1300);assert.equal(restored.unit('a').x,2.5);
}
// Chest contents are server-owned, exact instance IDs survive transfer/reload; range is enforced.
{
 const {s,e}=make();e.unit('a').x=1.5;e.unit('a').y=2.5;e.command('a',{type:'searchObject',objectId:'box'},1100);assert.equal(s.pending.kind,'loot');const copy=s.pending.options.find(o=>o.itemId==='sword');assert(copy);const instanceId=copy.copyId;assert.notEqual(instanceId,'unique');e.command('a',{type:'loot',pendingId:s.pending.id,values:[instanceId],quantities:{[instanceId]:1}},1200);assert(e.unit('a').profile.inventory.flatMap(r=>r.instancesV215||[]).some(c=>c.id===instanceId&&c.durability===3));e.unit('a').actionUsed=false;e.command('a',{type:'searchObject',objectId:'box'},1300);assert(!s.pending.options.some(o=>o.id===instanceId));e.command('a',{type:'loot',pendingId:s.pending.id,values:[]},1400);e.unit('a').actionUsed=false;e.unit('a').x=19;assert.throws(()=>e.command('a',{type:'searchObject',objectId:'box'},1500),/недоступен/);
}
// Device issuance follows the shared ledger. Operator ownership and link are checked each time.
{
 const {s,e}=make(),a=e.unit('a'),copy=a.profile.inventory.find(r=>r.itemId==='drone').instancesV215[0];e.command('a',{type:'deployDevice',itemId:'drone',instanceId:copy.id,x:1.5,y:2.5},1100);let d=s.units.find(u=>u.operatorTokenIdV129==='a');assert(d);assert(!s.order.includes(d.id));assert.equal(a.profile.inventory.some(r=>r.itemId==='drone'),false);assert.throws(()=>e.command('a',{type:'attack',deviceId:d.id,target:'b'},1150),/команда/);a.actionUsed=false;e.command('a',{type:'commandDevice',target:d.id,kind:'simple'},1200);assert.equal(a.actionUsed,false);assert.throws(()=>e.command('a',{type:'attack',deviceId:d.id,target:'b'},1250),/Операция/);e.command('a',{type:'move',deviceId:d.id,x:1.5,y:3.5},1300);assert.equal(d.y,3.5);assert.throws(()=>e.command('a',{type:'commandDevice',target:d.id,kind:'complex'},1400),/разным/);e.command('a',{type:'move',deviceId:d.id,x:1.5,y:2.5},1500);e.command('a',{type:'returnDevice',deviceId:d.id},1600);assert(!s.units.some(u=>u.id===d.id));const returned=a.profile.inventory.find(r=>r.itemId==='drone').instancesV215[0];assert.equal(returned.id,copy.id);assert.equal(returned.droneState231.hpCurrent,6);
}
// Two complex commands cannot be bought twice for one device; no operation can follow lost link.
{
 const {s,e}=make(),a=e.unit('a'),copy=a.profile.inventory.find(r=>r.itemId==='drone').instancesV215[0];e.command('a',{type:'deployDevice',itemId:'drone',instanceId:copy.id,x:1.5,y:2.5},1100);const d=s.units.find(u=>u.operatorTokenIdV129==='a');a.actionUsed=false;e.command('a',{type:'commandDevice',target:d.id,kind:'complex'},1200);assert(a.actionUsed);e.unit('b').teamId='npcs';e.command('a',{type:'attack',deviceId:d.id,target:'b',slot:'secondaryWeapon'},1300);assert(d.droneCommandV129.moduleUsed);assert.equal(d.droneCommandV129.completed,false);e.command('a',{type:'move',deviceId:d.id,x:1.5,y:3.5},1400);assert.throws(()=>e.command('a',{type:'attack',deviceId:d.id,target:'b'},1500),/Операция/);d.linkJammedV129=true;assert.throws(()=>e.command('a',{type:'move',deviceId:d.id,x:1.5,y:4.5},1600),/связи/);e.damage(d,99,'gas');assert.equal(d.conditionsV138.dying,undefined);assert.equal(d.traumaV195.injuryPoints,0);assert(!s.instinct293?.length);
 assert(!C.view(s,'a',1600).map.assets[0].lootStateV118.items,'contents stay private until an allowed search');
}
// Preplaced device operator IDs are remapped to this attempt, without independent initiative.
{
 const w=structuredClone(world);w.npcs={NPCS:{n:{id:'n',name:'Operator',abilityBase:{intelligence:3,endurance:2},stats:{hpMax:8},inventory:[]}}};const m=structuredClone(mission);m.maps[0].tokens=[{id:'operator-template',npcId:'n',x:10,y:10},{id:'device-template',equipmentType:'drone',equipmentItemId:'drone',operatorTokenIdV129:'operator-template',x:11,y:10}];const s=C.create(w,m,[player('a')],1000,random,id),device=s.units.find(u=>u.equipmentType==='drone'),operator=s.units.find(u=>u.npcId==='n');assert.equal(device.operatorTokenIdV129,operator.id);assert.equal(device.teamId,'npcs');assert(!s.order.includes(device.id));
}
console.log('PASS raid tactics: typed help, opportunity/restart/timeout, disengage, retired morale migration, chest instance transfer, operator device ledger/link/recovery');
