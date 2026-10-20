const assert = require("node:assert/strict");
const fs = require("node:fs");
const G = require("../renderer/character-grants-v178.js");
const R = require("../renderer/registration-loadout-v179.js");
const world = {
  skills: { SKILLS: { basic: { id: "basic", isBasic: true }, trained: { id: "trained" } } },
  equipment: { EQUIPMENT: { kit: { id: "kit" }, tool: { id: "tool" } } },
  socialOrigins: { SOCIAL_ORIGINS: {
    doctor: { id: "doctor", grantedSkillIds: ["trained"], startingItems: [{ itemId: "kit", qty: 2 }] },
    other: { id: "other", startingItems: [{ itemId: "tool", qty: 7 }] }
  } },
  geographicOrigins: { GEOGRAPHIC_ORIGINS: {
    station: { id: "station", startingItems: [{ itemId: "kit", qty: 1 }] }
  } }
};
const beforeWorld = JSON.stringify(world);
// Missing/empty receipts are normal for pre-v178 characters, not an instruction to issue goods.
for (const receipts of [undefined, {items:[]}, {items:["socialOrigins:doctor:kit"]}]) {
  for (const inventory of [[], [{itemId:"kit",qty:5,positions:[{x:3,y:1}]}]]) {
    const raw = {id:"legacy",socialOriginId:"doctor",geographicOriginId:"station",skills:[],skillPoints:6,inventory};
    if (receipts) raw.characterGrants178 = receipts;
    const before = JSON.stringify(raw);
    let p = G.apply(raw,world);
    for (let i=0;i<20;i++) p = G.apply(JSON.parse(JSON.stringify(p)),world);
    assert.deepEqual(p.inventory,inventory,"reads/reloads must never add starter goods");
    assert.equal(p.skillPoints,6);
    assert.ok(p.skills.includes("basic"));
    assert.ok(p.skills.includes("trained"),"skill grants remain retroactive");
    assert.equal(JSON.stringify(raw),before,"source player must not be mutated");
    p = G.apply({...p,inventory:[{itemId:"tool",qty:1,positions:[{x:0,y:0}]}]},world);
    assert.deepEqual(p.inventory,[{itemId:"tool",qty:1,positions:[{x:0,y:0}]}],"inventory edit adds only the requested item");
    p = G.apply({...p,inventory:[],characterGrants178:undefined,socialOriginId:"other"},world);
    assert.deepEqual(p.inventory,[],"deletion, origin changes and missing receipts must not refill inventory");
  }
}
const selection = {profession:{id:"doctor"},geographic:{id:"station"},equipmentIds:["kit"]};
const draft = R.seed(selection,world);
assert.equal(draft.inventory.length,1);
assert.equal(draft.inventory[0].qty,4,"new registration combines one chosen + two profession + one origin copy");
assert.equal(draft.characterGrants178.items.length,2);
assert.ok(!draft.inventory.some(r=>r.itemId==="tool"),"unselected origins do not grant items");
assert.deepEqual(G.startingLoadout(draft,world),draft,"explicit initializer remains idempotent");
assert.deepEqual(G.apply(JSON.parse(JSON.stringify(draft)),world),draft,"application normalization preserves prepared goods");
const consumed = G.apply({...draft,inventory:[],characterGrants178:undefined},world);
assert.deepEqual(consumed.inventory,[],"even losing a receipt cannot cause implicit reissue");
world.socialOrigins.SOCIAL_ORIGINS.doctor.startingItems.push({itemId:"tool",qty:3});
assert.deepEqual(G.apply(consumed,world).inventory,[],"new origin goods do not retroactively populate old inventories");
const nextDraft = R.seed(selection,world);
assert.equal(nextDraft.inventory.find(r=>r.itemId==="tool").qty,3,"new registrations use the current origin definition");
world.socialOrigins.SOCIAL_ORIGINS.doctor.startingItems.pop();
assert.equal(JSON.stringify(world),beforeWorld);
assert.deepEqual(R.seed({equipmentIds:[]},world).inventory,[],"an unselected registration draft has no origin equipment");
for (const file of ["character-grants-v178.js","registration-loadout-v179.js"])
  assert.equal(fs.readFileSync("renderer/"+file,"utf8"),fs.readFileSync("deploy/site/app/"+file,"utf8"));
console.log("PASS: legacy inventory reads/edits never issue starting items; missing receipts, deletion, changed origins/catalogue and reload stay safe; registration still issues selected goods once; retroactive skills and shared mirrors retained");
