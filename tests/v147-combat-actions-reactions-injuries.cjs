const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const scene = read('renderer/scene-editor-v113.js');
const stats = read('renderer/stats-engine-v113.js');
const worker = read('lua-sandbox-worker.cjs');
const docs = read('LUA_COMBAT_SCRIPTING.md');

assert.match(stats, /initiative:s\.values\.initiativeBonus/);
assert.match(stats, /applyStatFormula\(base\.initiative,'will','initiative_bonus'/);
assert.match(scene, /if\(!token\.initiativeOverrideV147\)token\.initiative=token\.initiativeBonus/);
assert.match(scene, /Combat\.selectedObject=\{kind:'token',id:current\.id\}/);

assert.match(scene, /Math\.ceil\(missing\/maximum\*5\)/);
assert.match(scene, /automaticHealthV147:true/);
assert.doesNotMatch(scene, /title:`Травма: \$\{token\.name\}`/);

assert.match(scene, /name="reaction" value="\$\{index\}"/);
assert.match(scene, /choice\.ownerToken\.reactionUsedV119=true/);
for (const command of ['spend_action', 'restore_action', 'spend_reaction', 'restore_reaction', 'spend_movement', 'restore_movement']) {
  assert.match(scene, new RegExp(command));
  assert.match(worker, new RegExp(command));
}
assert.match(docs, /RestoreAction\(unit\)/);
assert.match(docs, /RestoreReaction\(unit\)/);

function runWorker(payload) {
  return new Promise((resolve, reject) => {
    const instance = new Worker(path.join(root, 'lua-sandbox-worker.cjs'));
    const timer = setTimeout(() => { instance.terminate(); reject(new Error('worker timeout')); }, 3000);
    instance.once('message', message => { clearTimeout(timer); instance.terminate(); resolve(message); });
    instance.once('error', reject);
    instance.postMessage(payload);
  });
}

(async () => {
  const script = `
function OnAbilityExecuted(self, params)
  local unit = self:GetCaster()
  if unit:HasAction() and unit:IsActionAvailable() and unit:HasReaction()
    and unit:GetMovementSpent() == 2 and unit:GetMovementRemaining() == 4 then
    SpendAction(unit)
    RestoreAction(unit)
    SpendReaction(unit)
    RestoreReaction(unit)
    SpendMovement(unit, 1)
    RestoreMovement(unit)
  end
end`;
  const input = {
    source: { id: 'action_test', name: 'Action test', kind: 'skill', ownerId: 'u1' },
    units: [{ id: 'u1', name: 'Unit', kind: 'player', hpCurrent: 10, hpMax: 10, actionAvailable: true, reactionAvailable: true, movementSpent: 2, movementRemaining: 4, stats: {}, abilities: [], trained: [], inventory: [], equipped: [], modifiers: [], conditions: {}, distances: {} }],
    params: { casterId: 'u1' }
  };
  const result = await runWorker({ mode: 'execute', hook: 'OnAbilityExecuted', script, input });
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(result.result.commands.map(row => row.kind), ['spend_action', 'restore_action', 'spend_reaction', 'restore_reaction', 'spend_movement', 'restore_movement']);
  console.log('PASS v147 combat actions, reactions, Will initiative and automatic injuries');
})().catch(error => { console.error(error); process.exitCode = 1; });
