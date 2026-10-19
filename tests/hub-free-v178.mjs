import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
for (const f of ["hub-core-v156.js", "hub-spatial-v157.js", "hub-free-v178.js"])
  vm.runInThisContext(fs.readFileSync("renderer/" + f, "utf8"));
const C = GRPGHubCoreV156,
  S = GRPGHubSpatialV157,
  F = GRPGHubFreeV178;
const map = {
    id: "m",
    width: 900,
    height: 720,
    hexSize: 28,
    playerWidth: 40,
    fogEnabled: true,
    visionRange: 10,
    objects: [],
    walls: [],
    spawnPoints: [{ id: "s", x: 120.3, y: 310.7 }],
  },
  player = { id: "p" },
  state = { x: 120.3, y: 310.7, mapId: "m", flags: {}, objectStates: {} };
function follow(route, m = map, s = structuredClone(state)) {
  assert.ok(route.length);
  for (const p of route) S.step(m, s, player, p);
  return s;
}
let route = S.path(map, state, 750.9, 311.2);
assert.equal(follow(route).x, 750.9);
assert.equal(follow(route).y, 311.2);
assert.equal(S.gridMarkup(map), "");
S.normalize(map, state, player);
assert.equal(state.x, 120.3, "never snap existing coordinates");
const wall = {
  id: "w",
  thickness: 8,
  points: [
    { x: 400, y: 150 },
    { x: 400, y: 500 },
  ],
};
map.walls = [wall];
assert.equal(S.canMove(map, state, 750, 310), false);
route = S.path(map, state, 750, 310);
assert.ok(
  route.some((p) => p.y < 130 || p.y > 520),
  "route rounds wall with full token clearance",
);
assert.equal(follow(route).x, 750);
assert.equal(S.wallsMarkup(map), "");
assert.match(
  S.wallsMarkup(map, true),
  /data-wall="w"/,
  "DM still sees selectable walls",
);
map.walls = [
  {
    ...wall,
    points: [
      { x: 400, y: 0 },
      { x: 400, y: 720 },
    ],
  },
];
assert.deepEqual(S.path(map, state, 750, 310), []);
assert.equal(
  S.inSight(map, state, player, {
    id: "x",
    x: 420,
    y: 300,
    width: 20,
    height: 20,
  }),
  false,
  "invisible wall still occludes sight",
);
map.walls[0].blockSight = false;
assert.equal(
  S.inSight(map, state, player, {
    id: "x",
    x: 420,
    y: 300,
    width: 20,
    height: 20,
  }),
  true,
);
assert.deepEqual(
  S.path(map, state, 750, 310),
  [],
  "sight and movement flags independent",
);
map.walls[0].blockMovement = false;
assert.ok(S.path(map, state, 750, 310).length);
map.walls = [
  {
    ...wall,
    id: "upper",
    points: [
      { x: 400, y: 0 },
      { x: 400, y: 293 },
    ],
  },
  {
    ...wall,
    id: "lower",
    points: [
      { x: 400, y: 327 },
      { x: 400, y: 720 },
    ],
  },
];
assert.deepEqual(
  S.path(map, state, 750, 310),
  [],
  "34px gap rejects 40px character",
);
map.playerWidth = 20;
assert.equal(
  follow(S.path(map, state, 750, 310)).x,
  750,
  "20px token passes wide enough gap",
);
map.playerWidth = 40;
map.walls = [];
map.objects = [
  {
    id: "r",
    x: 400,
    y: 260,
    width: 100,
    height: 100,
    rotation: 35,
    blockMovement: true,
    blockSight: true,
  },
];
assert.equal(
  follow(S.path(map, state, 750, 310)).x,
  750,
  "rotated asset detour",
);
const obj = {
  id: "door",
  type: "door",
  x: 350,
  y: 0,
  width: 20,
  height: 720,
  blockMovement: true,
};
map.objects = [obj];
assert.deepEqual(S.path(map, state, 750, 310), []);
const opened = { ...state, objectStates: { door: "open" } };
assert.ok(S.path(map, opened, 750, 310).length);
map.objects = [];
S.reveal(map, state, player);
assert.equal(state.exploration.m.version178, 1);
const old = JSON.stringify(state.exploration);
S.reveal(map, state, player);
assert.equal(JSON.stringify(state.exploration), old);
assert.ok(state.exploration.m.runs.length);
assert.ok(!state.exploration.m.cells, "no hex exploration");
const legacy = { ...state, exploration: { m: { cells: ["2,4"] } } };
S.reveal(map, legacy, player);
assert.equal(legacy.exploration.m.version178, 1, "legacy exploration migrates");
assert.throws(
  () => S.step(map, structuredClone(state), player, { x: 750, y: 310 }),
  /Путь/,
  "no direct teleport",
);
const planet = {
    id: "h",
    hub: { defaultMapId: "m", maps: [map], dialogs: [] },
  },
  h = C.hubOf(planet),
  p = { id: "p" };
const saved = C.stateFor(p, planet, h);
assert.equal(saved.x, 120.3);
C.storeState(p, saved);
assert.equal(
  C.stateFor(p, planet, h).x,
  120.3,
  "core load wrapper uses continuous normalization",
);
for (const f of [
  "character-grants-v178.js",
  "hub-free-v178.js",
  "hub-spatial-v157.js",
  "hub-runtime-v156.js",
])
  assert.equal(
    fs.readFileSync("renderer/" + f, "utf8"),
    fs.readFileSync("deploy/site/app/" + f, "utf8"),
  );
console.log(
  "PASS: exact pixel destinations, swept disc detours, tiny-gap rejection, token width, rotated assets/doors, hidden player walls with independent blockers, smooth fog migration and core state persistence",
);
