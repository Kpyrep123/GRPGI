const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const T=require('../renderer/combat-trauma-v195.js'),ctx={GRPGCombatTraumaV195:T};ctx.window=ctx;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../renderer/combat-rules-v119.js'),'utf8'),ctx);const R=ctx.GRPGCombatRulesV119;
for(const hpMax of [10,100]){
 const actor={hpCurrent:hpMax,hpMax};R.applyDamage(actor,4);assert.equal(T.ensure(actor).degree,4);R.applyHeal(actor,4);assert.equal(T.ensure(actor).degree,4);R.applyDamage(actor,1);assert.equal(T.ensure(actor).degree,5);R.applyHeal(actor,100);assert.equal(T.ensure(actor).degree,5);
 T.treat(actor,2);assert.equal(T.ensure(actor).degree,3);actor.hpMax+=10;for(let i=0;i<50;i++)T.ensure(actor);assert.equal(T.ensure(actor).degree,3);const saved=JSON.parse(JSON.stringify(actor));assert.equal(T.ensure(saved).degree,3);
}
const overkill={hpCurrent:1,hpMax:100,traumaV195:T.normalize()};assert.equal(R.applyDamage(overkill,100).applied,1);assert.equal(T.ensure(overkill).degree,1);
const zero={hpCurrent:10,hpMax:10};R.applyDamage(zero,0);assert.equal(T.ensure(zero).degree,0);
const legacy={hpCurrent:10,hpMax:10,injuriesV129:[{degree:2},{degree:3}]};assert.equal(T.ensure(legacy).degree,3);T.treat(legacy,3);legacy.hpCurrent=2;for(let i=0;i<50;i++)T.ensure(legacy);assert.equal(T.ensure(legacy).degree,0);
const missingLegacy={hpCurrent:7,hpMax:10};assert.equal(T.ensure(missingLegacy).degree,2);R.applyHeal(missingLegacy,3);assert.equal(T.ensure(missingLegacy).degree,2);T.treat(missingLegacy,2);R.applyDamage(missingLegacy,1);assert.equal(T.ensure(missingLegacy).degree,1);
assert.deepEqual([0,1,2,3,4,5].map(d=>T.speed(5,d)),[5,4,3,3,2,1]);assert.deepEqual([0,1,2,3,4,5].map(d=>T.effects(d).checkPenalty),[0,0,1,1,2,5]);assert.equal(T.effects(3).noHeavyWeapon,true);assert.equal(T.effects(4).noHeavyWeapon,false);assert.equal(T.effects(4).noReaction,true);assert.equal(T.effects(5).noReaction,false);assert.equal(T.effects(5).disadvantage,true);assert.equal(T.speed(0,5),0);
for(const type of ['drone','turret']){const target={type,hpCurrent:5,hpMax:5};R.applyDamage(target,2);assert.equal(target.hpCurrent,3);assert.equal(T.ensure(target).degree,0);}
const fauna={type:'fauna',hpCurrent:10,hpMax:10};R.applyDamage(fauna,2);assert.equal(T.ensure(fauna).degree,2);
console.log('PASS real damage/heal: cumulative 4+heal+1, HP-max independence, overkill/zero, one-time migration, highest tier, movement rounding and living/mechanical units');
