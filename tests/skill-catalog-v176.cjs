const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  C = require("../renderer/skill-catalog-v176.js");
const nodes = [
  { id: "a" },
  { id: "b", requiredSkillIds: ["a"] },
  { id: "c", requiredSkillIds: ["a"] },
  { id: "d", requiredSkillIds: ["b", "c"] },
  { id: "e", requiredSkillIds: ["d"] },
  { id: "free" },
];
const before = JSON.stringify(nodes),
  g = C.layout(C.related(nodes, "d"));
assert.equal(g.positions.size, 5);
assert.equal(g.edges.length, 5);
assert.ok(!g.positions.has("free"));
assert.ok(g.positions.get("d").y > g.positions.get("b").y);
assert.deepEqual(
  [...C.layout([...nodes].reverse()).positions],
  [...C.layout(nodes).positions],
);
assert.equal(JSON.stringify(nodes), before);
assert.deepEqual(C.tags([" Медицина ", "медицина", "Боевые", "Боевые"]), [
  "Медицина",
  "Боевые",
]);
assert.deepEqual(C.requirements({ requiredSkills: "a, b" }), ["a", "b"]);
assert.equal(
  C.layout([
    { id: "a", requiredSkillIds: ["b"] },
    { id: "b", requiredSkillIds: ["a"] },
  ]).cyclic.length,
  2,
);
assert.equal(C.related(nodes, "free").length, 1);
for (const f of ["skill-catalog-v176.js", "skill-catalog-v176.css"])
  assert.equal(
    fs.readFileSync("renderer/" + f, "utf8"),
    fs.readFileSync("deploy/site/app/" + f, "utf8"),
  );
console.log(
  "PASS: deterministic dependency layout, multiple parents, isolated skills, cycle termination, no data mutation, tag deduplication, desktop/web mirrors",
);
