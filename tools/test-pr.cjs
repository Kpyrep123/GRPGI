const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const checks = [
  ['tools/sync-shared-client.cjs', '--check'],
  ['tools/build-raid-core-v290.cjs', '--check'],
  ['tools/build-hub-rules-v221.cjs', '--check'],
  ['tests/hub-functions-v156.mjs'],
  ['tests/hub-free-v178.mjs'],
  ['tests/hub-movement-v218.dom.mjs'],
  ['tests/hub-storage-v222.dom.mjs'],
  ['tests/v120-combat-ammo-inventory.cjs'],
  ['tests/v134-world-config-full-load.mjs'],
  ['tests/combat-devices-v200.cjs'],
  ['tests/combat-v225.dom.mjs'],
  ['tests/combat-hud-v226.dom.mjs'],
  ['tests/v140-world-integrity.cjs'],
  ['tests/market-risk-v222.cjs'],
  ['tests/stock-orders-v213.dom.mjs'],
  ['tests/web-stock-draft-v214.dom.mjs'],
  ['tests/galagram-v159.cjs'],
  ['tests/task-destinations-v216.dom.mjs'],
  ['tests/v135-player-sync-web.mjs'],
  ['tests/web-hp-v214.dom.mjs'],
  ['tests/web-deploy-ambient-v167.mjs'],
  ['tests/item-durability-v215.dom.mjs'],
  ['tests/aberration-roll.cjs'],
  ['tests/core-damage-v288.cjs'],
  ['tests/aberration-loot.cjs'],
  ['tests/aberration-rebalance.dom.mjs'],
  ['tests/raids-publish-v297.cjs'],
  ['tests/dialogues-v161.mjs'],
  ['tests/raids-v290.cjs'],
  ['tests/raids-state-v291.cjs'],
  ['tests/raids-effects-v292.cjs'],
  ['tests/raids-tactics-v293.cjs'],
  ['tests/raids-locking-v298.cjs'],
  ['tests/raids-server-v290.cjs'],
  ['tests/raids-ui-v290.dom.mjs']
];
let failed = false;
for (const check of checks) {
  const result = spawnSync(process.execPath, check, { cwd: root, stdio: 'inherit' });
  if (result.error) console.error(result.error);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
