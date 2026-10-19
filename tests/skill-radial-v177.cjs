const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  R = require("../renderer/skill-radial-v177.js");
const skills = [
  { id: "root", requiredAbilities: [{ key: "strength", value: 1 }] },
  { id: "child", requiredSkillIds: ["root"] },
  { id: "grandchild", requiredSkillIds: ["child"] },
  { id: "free" },
  { id: "general", treeBranch: "common", requiredSkillIds: ["root"] },
  { id: "manual", treeBranch: "intelligence" },
  { id: "multi", requiredSkillIds: ["child", "manual"] },
];
const before = JSON.stringify(skills),
  g = R.layout(skills);
assert.equal(g.assignment.get("free"), "common");
assert.equal(g.assignment.get("general"), "strength");
assert.equal(g.assignment.get("child"), "strength");
assert.equal(g.assignment.get("manual"), "intelligence");
assert.equal(g.edges.length, 5);
assert.equal(JSON.stringify(skills), before);
assert.deepEqual(
  [...R.layout([...skills].reverse()).positions],
  [...g.positions],
);
assert.ok(
  Math.hypot(g.positions.get("grandchild").x, g.positions.get("grandchild").y) >
    Math.hypot(g.positions.get("child").x, g.positions.get("child").y),
);
const generalChain=R.layout([{id:'free'},{id:'next',treeBranch:'common',requiredSkillIds:['free']},{id:'other'}]);
assert.ok(generalChain.positions.get('next').y>generalChain.positions.get('free').y);
assert.equal(generalChain.positions.get('next').x,generalChain.positions.get('free').x);
const dense = R.layout(
  Array.from({ length: 60 }, (_, i) => ({
    id: "x" + i,
    treeBranch: "strength",
  })),
);
const positions = [...dense.positions.values()];
for (let i = 0; i < positions.length; i++)
  for (let j = i + 1; j < positions.length; j++)
    assert.ok(
      Math.hypot(
        positions[i].x - positions[j].x,
        positions[i].y - positions[j].y,
      ) > 85,
    );
assert.equal(
  R.layout([
    { id: "a", requiredSkillIds: ["b"] },
    { id: "b", requiredSkillIds: ["a"] },
  ]).cycles.length,
  2,
);
for (const f of ["skill-radial-v177.js", "skill-radial-v177.css"])
  assert.equal(
    fs.readFileSync("renderer/" + f, "utf8"),
    fs.readFileSync("deploy/site/app/" + f, "utf8"),
  );
console.log(
  "PASS: radial branches/inheritance/dependent common/standalone, multi-parent edges, cycle handling, deterministic non-mutating layout, dense node separation and shared mirrors",
);
