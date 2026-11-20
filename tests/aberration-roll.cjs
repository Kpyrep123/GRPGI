const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { defaultChances, maxBudget, roll, updateChance } = require('../renderer/aberration-roll');

const context = { window: {} };
vm.runInNewContext(readFileSync(require.resolve('../renderer/aberration-catalog.js'), 'utf8'), context);
const catalog = context.window.GRPGAberrationCatalog;
assert.equal(catalog.length, 57);
assert.equal(new Set(catalog.flatMap(effect => effect.variants.map(variant => variant.id))).size,
  catalog.reduce((total, effect) => total + effect.variants.length, 0));
const variants = catalog.filter(effect => effect.category === 'weapon')
  .flatMap(effect => effect.variants.map(variant => ({ ...variant, group: effect.id })));
const byId = new Map(variants.map(variant => [variant.id, variant]));
const ranges = { common:[0,0], uncommon:[1,3], rare:[4,5], epic:[6,7], legendary:[8,8] };

let seed = 123456;
const random = () => {
  seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
let sawSix=false,sawMultipleDebuffs=false;
for (let danger = 1; danger <= 9; danger++) {
  assert.equal(defaultChances[danger - 1].reduce((a,b)=>a+b), 100);
  for (let i = 0; i < 50; i++) {
    const result = roll(danger, variants, { random });
    const effects = result.effects.map(id => byId.get(id));
    assert.equal(effects.reduce((sum,effect)=>sum+effect.cost,0), result.budget);
    assert.equal(new Set(effects.map(effect=>effect.group)).size, effects.length);
    assert(effects.length <= 6);
    sawSix ||= effects.length===6;
    sawMultipleDebuffs ||= effects.filter(effect=>effect.cost<0).length>1;

    assert(result.budget >= ranges[result.rarity][0]);
    assert(result.budget <= Math.min(maxBudget(danger),ranges[result.rarity][1]));
  }
}
assert(sawSix);assert(sawMultipleDebuffs);
const I=require('../renderer/item-instances-v215.js');
assert.equal(I.inventoryRowMass({qty:1,instancesV215:[{aberration252:{effects:['armor-22-6','shield-31-6']}}]},2),0);
const row = updateChance(defaultChances[4],2,20,5);
assert(Math.abs(row.reduce((a,b)=>a+b)-100)<1e-9);
assert(Math.abs(row[0]/row[1]-60/32)<1e-9);
assert.deepEqual(row.slice(2),[20,0,0]);
console.log('PASS aberration catalog, rarity ranges, danger cap and proportional probability edits');
