'use strict';
const assert=require('node:assert/strict');
const C=require('../raid-service/raid-core.cjs');
let seq=0;const id=()=> 'test:'+ ++seq,random=()=>.5;
const zone=(id,kind,x=1,y=1)=>({id,shape:'polygon',raidZone290:kind,points:[{x,y},{x:x+5,y},{x:x+5,y:y+5},{x,y:y+5}],visibleToPlayers:true});
const world={equipment:{EQUIPMENT:{gun:{id:'gun',name:'Gun',type:'weapon',mass:1,weaponCategory:'light',damage:'2',range:20,durabilityMax:10},armor:{id:'armor',type:'armor',mass:1,durabilityMax:10,modifiers:[{target:'defense',op:'add',value:4},{target:'carry_capacity',op:'add',value:4}]}}},npcs:{NPCS:{bot:{id:'bot',name:'Bot',dangerLevel:1,abilityBase:{endurance:2},stats:{hpMax:8},equipmentSlots:{primaryWeapon:'gun',armor:'armor'}}}},skills:{SKILLS:{}}};
const mission={id:'mission',name:'Mission',entry:{planetId:'planet',objectId:'npc',dialogId:'dialog'},maps:[{id:'one',name:'One',width:20,height:20,templates:[zone('spawn','spawn'),zone('evac','evacuation')],assets:[],tokens:[]}],reward:{credits:5,skillPoints:2,items:[]},goals:[{id:'kill',type:'eliminate'}]};
const player=(id,more={})=>({id,displayName:id,role:'player',abilityBase:{endurance:2,will:3,strength:2,dexterity:3},stats:{hpCurrent:8,hpMax:8},inventory:[{itemId:'gun',qty:1}],equipmentSlots:{primaryWeapon:'gun'},baseStats:{movement:7,carryBase:20},credits:0,skillPoints:0,...more});
const fixture=(players=[player('a')],m=mission)=>{const s=C.create(world,structuredClone(m),players,1000,random,id);s.id='campaign|2026-11-20';s.week='2026-11-20';return s;};
const friday=Date.parse('2026-11-20T17:00:00Z');assert.equal(C.week(friday).open,true);assert.equal(C.week(friday).id,'2026-11-20');assert.equal(C.week(friday-1).open,false);assert.equal(C.week(Date.parse('2026-11-23T04:59:59Z')).open,true);assert.equal(C.week(Date.parse('2026-11-23T05:00:00Z')).open,false);
assert.equal(C.week(friday,{windowMode:'closed'}).open,false);assert.equal(C.week(friday-1,{windowMode:'open'}).open,true);assert.equal(C.week(friday-1,{windowMode:'open'}).id,C.week(friday-1).id);assert.equal(C.week(friday-1,{windowMode:'invalid'}).open,false);
{
 const original=player('a'),s=fixture([original,player('b')]),e=C.engine(s,random,id),a=e.unit('a'),b=e.unit('b');assert.equal(e.current().id,'a');assert.equal(original.inventory[0].instancesV215,undefined);
 const before=structuredClone(s);assert.throws(()=>e.command('b',{type:'aim'},1100),/другого/);assert.deepEqual(s,before);
 e.command('a',{type:'carry',target:'b'},1100);assert.equal(a.conditionsV138.handsBusy,true);assert.equal(a.actionUsed,true);assert.equal(a.budget,3);assert.equal(b.carriedBy,'a');
 e.command('a',{type:'move',x:2.5,y:1.5},1200);assert.equal(b.x,a.x);assert.equal(b.y,a.y);assert.equal(a.movedThisTurn,1);
 assert.throws(()=>e.command('a',{type:'attack',target:'b'},1200),/Атака/);
 e.command('a',{type:'release'},1300);assert.equal(a.conditionsV138.handsBusy,false);assert.equal(b.carriedBy,undefined);assert.equal(a.actionUsed,true);
 const save=JSON.stringify(s),reloaded=JSON.parse(save);assert.deepEqual(C.engine(reloaded,random,id).profiles(),e.profiles());
}
{
 const m=structuredClone(mission);m.maps[0].tokens=[{id:'enemy',npcId:'bot',x:5.5,y:1.5,hpMax:8,hpCurrent:8}];
 const s=fixture(undefined,m),e=C.engine(s,random,id),enemy=s.units.find(u=>u.npcId);assert.equal(e.current().id,'a');assert(enemy.profile.inventory.find(r=>r.itemId==='armor').instancesV215[0].durability>=3);
 const p=e.unit('a');e.command('a',{type:'attack',target:enemy.id,slot:'primaryWeapon'},1100);assert.equal(p.actionUsed,true);assert.equal(enemy.hpCurrent,8,'armor blocks ordinary damage');assert.equal(s.flow,undefined);assert.equal(s.pending,undefined);
 assert.throws(()=>e.command('a',{type:'attack',target:enemy.id,slot:'primaryWeapon'},1200),/Действие/);
 const armor=enemy.profile.inventory.find(r=>r.itemId==='armor').instancesV215[0];armor.durability=3;armor.broken=false;
 e.damage(enemy,6,'explosive',{absorptionSource:'all'});assert.equal(armor.durability,0);assert.equal(armor.broken,true);assert.equal(enemy.hpCurrent,6);const hp=enemy.hpCurrent;e.damage(enemy,2,'kinetic',{absorptionSource:'all'});assert.equal(enemy.hpCurrent,hp-2);
 const copyId=armor.id;enemy.hpCurrent=0;p.actionUsed=false;e.command('a',{type:'move',x:4.5,y:1.5},1400);e.command('a',{type:'search',target:enemy.id},1500);const loot=s.pending;e.command('a',{type:'loot',pendingId:loot.id,values:loot.options.map(o=>o.id)},1510);assert.equal(p.profile.inventory.find(r=>r.itemId==='armor').instancesV215[0].id,copyId);assert.equal(enemy.profile.inventory.length,0);p.actionUsed=false;assert.throws(()=>e.command('a',{type:'search',target:enemy.id},1600),/Обыск/);
}
{
 const s=fixture([player('a'),player('b')]),e=C.engine(s,random,id),b=e.unit('b');b.x=15;b.y=15;e.command('a',{type:'evacuate'},1100);assert.equal(s.evac.finishRound,5);e.command('a',{type:'end'},1200);e.command('b',{type:'end'},1300);assert.equal(s.round,2);
 for(let n=0;n<6;n++)e.command(e.current().id,{type:'end'},2000+n);
 assert.equal(s.phase,'finished');assert.deepEqual(s.survivors,['a']);assert.equal(b.dead229,true);assert.equal(b.hpCurrent,0);const profiles=e.profiles();assert.equal(profiles.a.credits,5);assert.equal(profiles.a.skillPoints,2);assert.equal(profiles.b.combatState093.dead,true);assert.equal(profiles.b.credits,0);assert.equal(profiles.b.skillPoints,0);assert.equal(profiles.a.raidLock290,undefined);const copy=JSON.stringify(profiles);e.tick(1000000);assert.equal(JSON.stringify(e.profiles()),copy,'a completed evacuation never pays twice');
}
{
 const s=fixture([player('a'),player('b')]),e=C.engine(s,random,id),b=e.unit('b');b.hpCurrent=0;b.conditionsV138={unconscious:true,dying:true};b.critical229={damage:8,fallTurn:0};e.command('a',{type:'carry',target:'b'},1100);e.command('a',{type:'evacuate'},1200);
 for(let n=0;n<8;n++){if(s.phase!=='running')break;e.tick(s.deadline+1);}
 assert.equal(s.phase,'finished');assert.deepEqual(s.survivors.sort(),['a','b']);assert.equal(b.hpCurrent,0);assert.equal(b.conditionsV138.dying,true);assert.equal(e.profiles().b.skillPoints,2);assert.equal(e.profiles().a.credits+e.profiles().b.credits,5);
}
{
 const m=structuredClone(mission);m.maps[0].templates.push({...zone('out','transition'),targetMap290:'two',targetZone290:'in'});m.maps.push({id:'two',name:'Two',width:20,height:20,tokens:[],assets:[],templates:[zone('in','spawn'),zone('end','evacuation')]});
 const s=fixture([player('a'),player('b')],m),e=C.engine(s,random,id),a=e.unit('a');e.command('a',{type:'aim'},1100);const turn=a.ownTurnV199;e.command('a',{type:'transition',zoneId:'out'},1200);assert.equal(s.mapId,'two');assert.equal(a.actionUsed,true);assert.equal(a.ownTurnV199,turn);assert(s.units.every(u=>u.mapId==='two'));assert.equal(s.order[s.turn],'a');
}
{
 const m=structuredClone(mission);m.maps[0].templates.push({id:'wall',shape:'wall',points:[{x:4,y:0},{x:4,y:10}],blockMovement:true,blockSight:true});m.maps[0].tokens=[{id:'enemy',npcId:'bot',x:5.5,y:1.5,hpMax:8,hpCurrent:8}];const s=fixture(undefined,m),e=C.engine(s,random,id),enemy=s.units.find(u=>u.npcId);assert.throws(()=>e.command('a',{type:'attack',target:enemy.id,slot:'primaryWeapon'},1100),/видна|закрыта/);assert.equal(e.unit('a').actionUsed,false);assert(!C.view(s,'a',1100).units.some(u=>u.id===enemy.id));
}
{
 const s=fixture(),e=C.engine(s,random,id);e.tick(61001);assert.equal(s.round,2);assert.equal(e.unit('a').ownTurnV199,2,'disconnect expires a turn without changing equipment');
}
{
 const before=structuredClone(world.equipment.EQUIPMENT.gun);Object.assign(world.equipment.EQUIPMENT.gun,{magazineSize:3,rapidFireShots:3,ammoTypeId:'ammo'});world.equipment.EQUIPMENT.ammo={id:'ammo',type:'ammo',mass:0};
 const m=structuredClone(mission);m.maps[0].tokens=[{id:'enemy',npcId:'bot',x:5.5,y:1.5,hpMax:100,hpCurrent:100}];const s=fixture(undefined,m),e=C.engine(s,random,id),bot=s.units.find(u=>u.npcId),copy=bot.profile.inventory.find(r=>r.itemId==='gun').instancesV215[0];copy.broken=false;copy.durability=10;copy.magazine={loaded:0,ammoTypeId:'ammo'};bot.profile.inventory.push({itemId:'ammo',qty:6});s.turn=s.order.indexOf(bot.id);e.begin(1000);e.tick(1100);assert.equal(copy.magazine.loaded,3,'NPC reloads instead of freezing');assert.equal(bot.actionUsed,true);
 e.begin(1200);for(let n=0;n<6&&copy.magazine.loaded>0;n++)e.tick(1300+n);assert.equal(copy.magazine.loaded,0,'NPC continues all shots of its burst');assert.equal(bot.burst,null);
 copy.broken=true;e.begin(1400);assert.doesNotThrow(()=>e.tick(1500),'NPC falls back from a destroyed weapon');assert.equal(e.profiles().a.combatState093.dead,false);
 world.equipment.EQUIPMENT.gun=before;delete world.equipment.EQUIPMENT.ammo;
}
console.log('PASS raids: Moscow window, ownership, carry, real HP/armor/loot, evacuation, rewards, dying extraction, group transitions, LOS and timeout persistence');
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const execute=payload=>new Promise((resolve,reject)=>{const w=new Worker(path.join(__dirname,'../lua-sandbox-worker.cjs'));const timeout=setTimeout(()=>{w.terminate();reject(Error('Lua timeout'));},5000);w.on('error',reject);w.on('message',r=>{clearTimeout(timeout);w.terminate();resolve(r);});w.postMessage(payload);});
(async()=>{
 world.skills.SKILLS.roll={id:'roll',name:'Roll',activationType:'active',luaEnabled:true,luaScript:`function OnAbilityExecuted(self,p)
 local value=RequestRoll('roll','Бросок',{min=1,max=20})
 if value>=10 then InflictDamage(self:GetCaster(),p.target,2,{damageType='gas'}) end
 end`};
 const s=fixture([player('a',{skills:['roll']}),player('b')]),e=C.engine(s,random,id);e.command('a',{type:'ability',sourceId:'roll',target:'b'},1100);assert(s.job);const job=s.job.id,first=await execute(s.job.payload);assert.equal(first.ok,true,first.message);e.jobResult(job,first,1200);assert.equal(s.job.id,job);assert.equal(s.job.payload.input.params.inputs.roll,11);assert.equal(e.unit('b').hpCurrent,8,'the first Lua pass has no partial effects');
 const saved=JSON.parse(JSON.stringify(s)),resumed=C.engine(saved,random,id),second=await execute(saved.job.payload);resumed.jobResult(job,second,1300);assert.equal(resumed.unit('b').hpCurrent,6);assert.equal(saved.job,undefined);assert.equal(resumed.jobResult(job,second,1400),false);assert.equal(resumed.unit('b').hpCurrent,6,'a duplicate worker response does not repeat damage');
 delete world.skills.SKILLS.roll;
 world.skills.SKILLS.react={id:'react',name:'React',activationType:'reaction',luaEnabled:true,luaScript:'function BeforeDamage(self,p) ReduceDamage(1) end'};
 const m=structuredClone(mission);m.maps[0].tokens=[{id:'enemy',npcId:'bot',x:5.5,y:1.5,hpMax:8,hpCurrent:8}];const r=fixture([player('a',{skills:['react'],abilityBase:{endurance:2,will:0,dexterity:0}})],m),api=C.engine(r,random,id);r.turn=r.order.indexOf(r.units.find(u=>u.npcId).id);api.begin(1000);api.tick(1200);assert.equal(r.pending.kind,'reaction');assert.equal(r.pending.actor,'a');const before=api.unit('a').hpCurrent,remaining=r.remainingTurn;
 const p=r.pending;api.command('a',{type:'reaction',pendingId:p.id,sourceId:'react'},1300);const result=await execute(r.job.payload);api.jobResult(r.job.id,result,1400);assert.equal(api.unit('a').hpCurrent,before-1);assert.equal(api.unit('a').reactionUsedV119,true);assert.equal(r.deadline,1400+remaining);
 const timeout=fixture([player('a',{skills:['react'],abilityBase:{endurance:2,will:0,dexterity:0}})],m),ae=C.engine(timeout,random,id);timeout.turn=timeout.order.indexOf(timeout.units.find(u=>u.npcId).id);ae.begin(1000);ae.tick(1200);const until=timeout.pending.until;ae.tick(until+1501);assert.equal(timeout.pending,undefined);assert.equal(ae.unit('a').hpCurrent,6);
 world.skills.SKILLS.choice={id:'choice',name:'Choice',activationType:'active',luaScript:`function OnAbilityExecuted(self,p) local v=RequestChoice('variant',{options={{id='heal',label='Heal'},{id='no',label='No'}}}); if v=='heal' then Heal(self:GetCaster(),self:GetCaster(),2) end end`};
 const choices=fixture([player('a',{skills:['choice'],stats:{hpCurrent:4,hpMax:8}})]),choiceApi=C.engine(choices,random,id);choiceApi.command('a',{type:'ability',sourceId:'choice'},1000);choiceApi.jobResult(choices.job.id,await execute(choices.job.payload),1100);assert.equal(choices.pending.kind,'choice');assert.equal(choiceApi.unit('a').actionUsed,false);const request=choices.pending;
 assert.throws(()=>choiceApi.command('a',{type:'choice',pendingId:request.id,value:'forged'},1200),/Недоступный/);choiceApi.command('a',{type:'choice',pendingId:request.id,value:'heal'},1200);choiceApi.jobResult(choices.job.id,await execute(choices.job.payload),1300);assert.equal(choiceApi.unit('a').hpCurrent,6);assert.equal(choiceApi.unit('a').actionUsed,true);
 world.skills.SKILLS.unsupported={id:'unsupported',luaScript:'function OnUnsupportedEvent(self,p) end'};assert.throws(()=>fixture([player('a',{skills:['unsupported']})]),/OnUnsupportedEvent/);
 console.log('PASS raid Lua: automatic saved d20, restart/retry idempotency, player reaction, pause/resume and reaction timeout');
})().catch(e=>{console.error(e);process.exitCode=1;});
