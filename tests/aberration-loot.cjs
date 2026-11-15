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
console.log('PASS loot persists aberrations and rejects a changed replay');

require('../renderer/combat-rules-v119.js');
const {resolveManualAttack}=global.GRPGCombatRulesV119;
const die={attackRoll:19,defenseRoll:10,damageRoll:4};
assert.equal(resolveManualAttack(die).rawDamage,4);
assert.equal(resolveManualAttack({...die,criticalRange:1,criticalBonus:2}).rawDamage,7);
assert.equal(resolveManualAttack({...die,criticalRange:1,defenseRoll:20}).hit,false);
assert.equal(resolveManualAttack({...die,attackRoll:20,criticalRange:-1}).rawDamage,4);
assert.equal(resolveManualAttack({...die,attackRoll:20,defenseRoll:1,criticalRange:-1}).rawDamage,6);
assert.equal(resolveManualAttack({...die,attackRoll:20,criticalBonus:-2}).rawDamage,4);
console.log('PASS critical range, guaranteed natural hit and suppressed critical bonus');
