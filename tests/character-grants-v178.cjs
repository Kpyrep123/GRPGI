const assert = require("node:assert/strict"),
  G = require("../renderer/character-grants-v178.js");
const world = {
  skills: {
    SKILLS: {
      basic: { id: "basic", isBasic: true, activationType: "active" },
      chosen: { id: "chosen" },
      other: { id: "other" },
    },
  },
  equipment: { EQUIPMENT: { kit: { id: "kit" } } },
  socialOrigins: {
    SOCIAL_ORIGINS: {
      doctor: {
        id: "doctor",
        name: "Врач",
        grantedSkillIds: ["chosen", "missing"],
        grantedSkills: [
          {
            id: "heal",
            name: "Лечение",
            activationType: "active",
            luaEnabled: true,
            luaScript: "Heal(2)",
            modifiers: [{ target: "vision", value: 1 }],
          },
        ],
        startingItems: [{ itemId: "kit", qty: 2 }],
      },
    },
  },
  geographicOrigins: {
    GEOGRAPHIC_ORIGINS: {
      station: {
        id: "station",
        grantedSkills: [{ id: "heal", name: "Станция" }],
        startingItems: [{ itemId: "kit", qty: 1 }],
      },
    },
  },
};
const raw = {
    skills: ["other"],
    skillPoints: 7,
    socialOriginId: "doctor",
    geographicOriginId: "station",
    inventory: [{ itemId: "kit", qty: 1, positions: [{ x: 0, y: 0 }] }],
  },
  before = JSON.stringify(raw),
  p = G.startingLoadout(raw, world);
assert.equal(JSON.stringify(raw), before);
assert.equal(p.skillPoints, 7);
assert.equal(p.inventory[0].qty, 4);
assert.deepEqual(p.inventory[0].positions, [{ x: 0, y: 0 }]);
assert.equal(p.skills.length, 5);
assert.ok(p.skills.includes("basic"));
assert.ok(p.skills.includes("chosen"));
assert.ok(!p.skills.includes("missing"));
assert.equal(new Set(p.skills).size, 5);
assert.deepEqual(
  G.apply(p, world),
  p,
  "repeated normalization must be idempotent",
);
p.inventory = [];
assert.deepEqual(
  G.apply(JSON.parse(JSON.stringify(p)), world).inventory,
  [],
  "consumed goods must not respawn on reload",
);
const defs = G.ownedDefinitions(p, world);
assert.equal(defs.length, 2);
assert.notEqual(defs[0].id, defs[1].id);
assert.equal(defs[0].luaScript, "Heal(2)");
assert.equal(defs[0].modifiers[0].value, 1);
assert.equal(defs[0].cost, 0);
assert.deepEqual(defs[0].requiredSkillIds, []);
assert.equal(
  G.ownedDefinitions({ skills: [] }, world).length,
  0,
  "unrelated players do not receive private skills",
);
assert.deepEqual(
  G.apply({ skills: [], inventory: [] }, world).skills,
  ["basic"],
  "existing and new players get basics without origins",
);
const restored = JSON.parse(JSON.stringify(world));
assert.deepEqual(
  G.apply(raw, restored),
  G.apply(raw, world),
  "JSON round trip retains definitions/grants",
);
console.log(
  "PASS: retroactive basic skills; origin/private skill ownership and metadata; point-free grants; independent stable IDs; starter item ledger survives consumption and JSON reload",
);
