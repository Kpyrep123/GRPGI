const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const T = require('../renderer/combat-trauma-v195.js');
const ctx = {GRPGCombatTraumaV195:T};
ctx.window = ctx;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/combat-rules-v119.js'), 'utf8'), ctx);
const R = ctx.GRPGCombatRulesV119;
const actor = {hpCurrent:14, hpMax:14};
for (let points=1; points<=10; points++) {
  R.applyDamage(actor, 1);
  assert.equal(T.ensure(actor).injuryPoints, points);
  assert.equal(T.ensure(actor).degree, Math.floor(points/2));
}
R.applyHeal(actor, 14);
assert.equal(T.ensure(actor).injuryPoints, 10);
R.applyDamage(actor, 1);
assert.equal(T.ensure(actor).injuryPoints, 10);
T.healPoints(actor, 3);
assert.equal(T.ensure(actor).injuryPoints, 7);
assert.equal(T.ensure(actor).degree, 3);
T.treat(actor, 2);
assert.equal(T.ensure(actor).injuryPoints, 3);
T.setPoints(actor, 1);
R.applyDamage(actor, 1);
assert.equal(T.ensure(actor).degree, 1);
const overkill = {hpCurrent:1, hpMax:14};
R.applyDamage(overkill, 50);
assert.equal(T.ensure(overkill).injuryPoints, 1);
assert.equal(overkill.critical229.damage, 50);
for (let degree=0; degree<=5; degree++) for (let remainder=0; remainder<=1; remainder++) {
  let target = {traumaV195:{schema:195, degree, remainder}};
  for (let load=0; load<5; load++) {
    target = JSON.parse(JSON.stringify(target));
    assert.equal(T.ensure(target).injuryPoints, Math.min(10, degree*2+remainder));
  }
  assert.equal(T.effects(target).noHeavyWeapon, false);
}
const stale = {traumaV195:{schema:195, injuryPoints:0, degree:5, remainder:1}};
assert.equal(T.ensure(stale).degree, 0);
assert.equal(T.ensure({hpCurrent:1, hpMax:14}).injuryPoints, 0);
assert.equal(T.ensure({injuriesV129:[{degree:3}]}).injuryPoints, 6);
for (const type of ['drone', 'turret']) {
  const target = {type, hpCurrent:5, hpMax:5};
  R.applyDamage(target, 2);
  T.add(target, 10);
  assert.equal(T.ensure(target).injuryPoints, 0);
}
assert.deepEqual([0,1,2,3,4,5].map(d=>T.speed(5,d)), [5,4,3,3,2,1]);
assert.equal(T.effects(4).noReaction, true);
assert.equal(T.effects(5).disadvantage, true);
console.log('PASS injury points, odd healing, legacy degrees, repeated migration, overkill, mechanical units and heavy weapons');
