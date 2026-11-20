const assert=require('node:assert/strict');
require('../renderer/combat-rules-v119.js');
const R=global.GRPGCombatRulesV119;
const resolve=(changes={})=>R.resolveManualAttack({attackRoll:12,defenseRoll:10,damageRoll:3,...changes});
assert.equal(resolve().rawDamage,3);
assert.equal(resolve({attackRoll:20}).rawDamage,5);
assert.equal(resolve({attackRoll:20,defenseRoll:1}).rawDamage,7);
assert.equal(resolve({defenseRoll:1}).rawDamage,4);
assert.equal(resolve({attackRoll:19,criticalRange:1,defenseRoll:1}).rawDamage,5);
assert.equal(resolve({attackRoll:20,criticalBonus:2}).rawDamage,7);
assert.equal(resolve({attackRoll:20,defenseRoll:1,criticalBonus:2}).rawDamage,9);
assert.equal(resolve({attackRoll:20,damageReduction:4}).damageApplied,1);
assert.equal(resolve({attackRoll:20,defenseRoll:1,damageReduction:4}).damageApplied,3);
assert.equal(resolve({attackRoll:1,defenseRoll:1}).damageApplied,0);
assert.equal(resolve({attackRoll:20,criticalRange:-1}).rawDamage,3);
assert.equal(resolve({attackRoll:20,defenseRoll:1,criticalRange:-1}).rawDamage,7);
const {combineGasProtection:combine}=require('../renderer/damage-types-v202.js');
assert.equal(combine(50,50),75);
assert.equal(combine(40,40),64);
assert.equal(combine(100,50),100);
assert.equal(combine(50,100),100);
assert.equal(combine(50,20,true),20);
assert.equal(combine(50,-10),40);
const {engine}=require('../pocketbase/pb_hooks/grpgi_loot_core_v137.js');
const stats=engine({});
const profile={abilityBase:{strength:4},modifiers:[
 {target:'gas_protection_flat',op:'add',value:2},
 {target:'gas_protection_flat',op:'add',value:3},
 {target:'gas_protection_percent',op:'add',value:50},
 {target:'gas_protection_percent',op:'add',value:50},
 {target:'gas_protection_percent',op:'add',value:100,enabled:false}
]};
let gas=stats.compute(profile).values;
assert.equal(gas.gasProtectionFlat,5);assert.equal(gas.gasProtectionPercent,75);
profile.modifiers.push({target:'gas_protection_percent',op:'set',value:20,priority:1},{target:'gas_protection_percent',op:'add',value:50,priority:2});
assert.equal(stats.compute(profile).values.gasProtectionPercent,60);
profile.modifiers.push({target:'gas_protection_percent',op:'replace_stat',statRef:'strength',priority:3},{target:'gas_protection_percent',op:'add_stat',statRef:'strength',priority:4});
assert.equal(stats.compute(profile).values.gasProtectionPercent,7.84);
console.log('PASS crit +2, supercrit +4, critical overrides, gas stacking and server stats parity');
