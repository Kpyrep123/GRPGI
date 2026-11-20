const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

global.__hooks = path.resolve(__dirname,'../pocketbase/pb_hooks');
global.BadRequestError = class extends Error {};
global.DynamicModel = class { constructor(fields) { Object.assign(this,fields); } };
let serial=0;
global.$security = { sha256:value=>crypto.createHash('sha256').update(value).digest('hex'), randomString:()=>String(++serial) };
const ledger=new Map();
const data={version:1,playerJson:{id:'p',role:'player',inventory:[{itemId:'rifle',qty:1,positions:[],instancesV215:[{id:'old',durability:2,durabilityMax:5}]}]}};
const world={ equipment:{EQUIPMENT:{rifle:{id:'rifle',type:'weapon',durabilityMax:5,mass:1}}} };
const collection=()=>({updateRule:'test'});
const record={collection,getString:key=>typeof data[key]==='object'?JSON.stringify(data[key]):String(data[key]||''),getInt:key=>data[key],set:(key,value)=>{data[key]=value;}};
const snapshot={collection,getString:()=>JSON.stringify(world)};
const tx={
  findFirstRecordByFilter:()=>record,findRecordsByFilter:()=>[snapshot],canAccessRecord:()=>true,save(){},
  db:()=>({newQuery:sql=>({bind:params=>({
    one:model=>{if(!ledger.has(params.operation))throw Error('no rows');Object.assign(model,ledger.get(params.operation));},
    execute:()=>{assert.match(sql,/INSERT/);ledger.set(params.operation,params);}
  })})})
};
global.$app={runInTransaction:fn=>fn(tx)};
const {transfer}=require('../pocketbase/pb_hooks/grpgi_loot_v137.js');
const body={campaignId:'c',playerId:'p',operationId:'test_operation',lootTransferV137:{itemId:'rifle',qty:1,source:'scene/npc',aberrations:[{rarity:'rare',budget:4,effects:['weapon-3-2','weapon-4-3','weapon-8-4']}]}};
const request={requestInfo:()=>({body}),json:(_code,value)=>value};
assert.equal(transfer(request).status,'committed');
assert.equal(transfer(request).status,'replayed');
const row=data.playerJson.inventory[0];
assert.equal(row.qty,2);
assert.equal(row.instancesV215[0].id,'old');
assert.match(require('../pocketbase/pb_hooks/item-instances-v215.js').inventoryBadges(data.playerJson,'rifle',1),/data-rarity="rare"/);
assert.equal(row.instancesV215[0].durability,2);
assert.deepEqual(row.instancesV215[1].aberration252,body.lootTransferV137.aberrations[0]);
body.lootTransferV137.aberrations[0]={rarity:'uncommon',budget:1,effects:['weapon-1-4']};
assert.throws(()=>transfer(request),/другими данными/);
assert.equal(data.playerJson.inventory[0].qty,2);
body.operationId='test_conditional_effects';
body.lootTransferV137.aberrations[0]={rarity:'rare',budget:4,effects:['weapon-59-1','weapon-7-1']};
assert.equal(transfer(request).status,'committed');
assert.deepEqual(data.playerJson.inventory[0].instancesV215[2].aberration252,body.lootTransferV137.aberrations[0]);
assert.deepEqual(data.playerJson.inventory[0].instancesV215[1].aberration252.effects,['weapon-3-2','weapon-4-3','weapon-8-4']);
const rules=require('../pocketbase/pb_hooks/grpgi_loot_core_v137.js').engine(world);
assert.equal(rules.layout(data.playerJson).weight,3.75);
const available=rules.layout(data.playerJson).user.carryWeightMax;
world.equipment.EQUIPMENT.heavy={id:'heavy',type:'weapon',mass:available-3.75,inventoryWidth:1,inventoryHeight:1};
assert.equal(rules.canAdd(data.playerJson,'heavy',1).ok,true);
assert.equal(rules.canAdd(data.playerJson,'heavy',1,[{effects:['weapon-7-1']}]).ok,false);
for(const [index,effect] of ['weapon-5-3:kinetic','weapon-60-1','weapon-12-2','weapon-15-1'].entries()){
  body.operationId='test_new_effect_'+index;
  body.lootTransferV137.aberrations[0]={rarity:'rare',budget:4,effects:[effect]};
  assert.equal(transfer(request).status,'committed');
  assert.deepEqual(data.playerJson.inventory[0].instancesV215.at(-1).aberration252.effects,[effect]);
}
world.equipment.EQUIPMENT.armor={id:'armor',type:'armor',mass:1,durabilityMax:10};
body.operationId='test_armor_aberration';
body.lootTransferV137={itemId:'armor',qty:1,source:'scene/npc',aberrations:[{rarity:'rare',budget:4,effects:['armor-21-6','armor-23-4']}]};
assert.equal(transfer(request).status,'committed');
const armorRow=data.playerJson.inventory.find(row=>row.itemId==='armor');
assert.equal(armorRow.instancesV215[0].durabilityMax,13);
assert.equal(armorRow.instancesV215[0].durability,13);
const baseCapacity=rules.layout(data.playerJson).user.carryWeightMax;
armorRow.instancesV215[0].slot='armor';
data.playerJson.equipmentSlots={armor:'armor'};
assert.equal(rules.layout(data.playerJson).user.carryWeightMax,baseCapacity+1);
body.operationId='test_cross_category_aberration';
body.lootTransferV137.aberrations[0].effects=['shield-31-1'];
assert.throws(()=>transfer(request),/не соответствуют типу/);
world.equipment.EQUIPMENT.armor.modifiers=[{target:'shield_capacity',op:'add',value:5}];
body.operationId='test_shield_aberration';
body.lootTransferV137.aberrations[0].effects=['shield-29-4','armor-23-4'];
assert.equal(transfer(request).status,'committed');
assert.deepEqual(data.playerJson.inventory.find(row=>row.itemId==='armor').instancesV215.at(-1).aberration252.effects,['shield-29-4','armor-23-4']);
delete world.equipment.EQUIPMENT.armor.modifiers;
body.operationId='test_armor_reaction';
body.lootTransferV137.aberrations[0]={rarity:'rare',budget:4,effects:['armor-25-2','armor-26-1']};
assert.equal(transfer(request).status,'committed');
assert.deepEqual(data.playerJson.inventory.find(row=>row.itemId==='armor').instancesV215.at(-1).aberration252.effects,['armor-25-2','armor-26-1']);
body.operationId='test_armor_damage_type';
body.lootTransferV137.aberrations[0]={rarity:'legendary',budget:8,effects:['armor-27-1:energy','armor-20-1:kinetic']};
assert.equal(transfer(request).status,'committed');
assert.deepEqual(data.playerJson.inventory.find(row=>row.itemId==='armor').instancesV215.at(-1).aberration252.effects,['armor-27-1:energy','armor-20-1:kinetic']);
body.operationId='test_invalid_armor_damage_type';
body.lootTransferV137.aberrations[0].effects=['armor-27-1:invalid'];
assert.throws(()=>transfer(request),/Некорректные аберрации/);
body.operationId='test_armor_attack_immunity';
body.lootTransferV137.aberrations[0].effects=['armor-28-1:ranged'];
assert.equal(transfer(request).status,'committed');
assert.deepEqual(data.playerJson.inventory.find(row=>row.itemId==='armor').instancesV215.at(-1).aberration252.effects,['armor-28-1:ranged']);
// The same NPC instance is transferred with wear and modules intact, then replayed once.
body.operationId='test_real_copy_transfer';
data.playerJson.baseStats={carryBase:100,inventorySlots:100};
body.lootTransferV137={itemId:'rifle',qty:1,source:'scene/npc',copiesV287:[{
 id:'corpse-rifle',durabilityMax:5,durability:0,broken:true,
 aberration252:{rarity:'legendary',budget:21,forged:true,effects:['weapon-1-6','weapon-59-3','weapon-60-3']},
 attachments:[{mount:0,itemId:'optic',copy:{id:'corpse-optic',durabilityMax:0,durability:0,chargesMax:2,charges:1}}]
}]};
assert.equal(transfer(request).status,'committed');
const persisted=data.playerJson.inventory.find(row=>row.itemId==='rifle').instancesV215.find(copy=>copy.id==='corpse-rifle');
assert.equal(persisted.durability,0);assert.equal(persisted.broken,true);assert.equal(persisted.attachments[0].copy.id,'corpse-optic');
assert.equal(transfer(request).status,'replayed');
assert.equal(data.playerJson.inventory.flatMap(row=>row.instancesV215||[]).filter(copy=>copy.id==='corpse-rifle').length,1);
body.lootTransferV137.copiesV287[0].durability=1;
assert.throws(()=>transfer(request),/другими данными/);
console.log('PASS loot persists aberrations and rejects a changed replay');

require('../renderer/combat-rules-v119.js');
const {resolveManualAttack}=global.GRPGCombatRulesV119;
const die={attackRoll:19,defenseRoll:10,damageRoll:4};
assert.equal(resolveManualAttack(die).rawDamage,4);
assert.equal(resolveManualAttack({...die,criticalRange:1,criticalBonus:2}).rawDamage,8);
assert.equal(resolveManualAttack({...die,criticalRange:1,defenseRoll:20}).hit,false);
assert.equal(resolveManualAttack({...die,attackRoll:20,criticalRange:-1}).rawDamage,4);
assert.equal(resolveManualAttack({...die,attackRoll:20,defenseRoll:1,criticalRange:-1}).rawDamage,8);
assert.equal(resolveManualAttack({...die,attackRoll:20,criticalBonus:-2}).rawDamage,4);
console.log('PASS critical range, guaranteed natural hit and suppressed critical bonus');
