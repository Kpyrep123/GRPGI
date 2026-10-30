const assert=require('node:assert/strict'),H=require('../renderer/weapon-handling-v203.js');
assert.deepEqual(H.stats,{light:'dexterity',heavy:'endurance',melee:'strength',drone:'intelligence'});
for(const [weaponCategory,stat] of Object.entries(H.stats))assert.equal(H.stat({type:'weapon',weaponCategory}),stat);
assert.equal(H.stat({type:'drone',weaponCategory:'heavy'}),'intelligence');assert.equal(H.stat({type:'turret'}),'intelligence');assert.equal(H.normalize('energy'),'light');assert.equal(H.normalize('__proto__'),'light');assert.equal(H.normalize('constructor'),'light');
console.log('PASS four handling categories, melee Strength, operator-controlled devices and legacy/invalid defaults');
