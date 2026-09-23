'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer/app.js'), 'utf8');

function functionBody(name) {
  const marker = `async function ${name}(`;
  const syncMarker = `function ${name}(`;
  const start = Math.max(main.indexOf(marker), main.indexOf(syncMarker));
  assert.ok(start >= 0, `${name} is present`);
  const paren = main.indexOf('(', start);
  let parenDepth = 0;
  let brace = -1;
  for (let index = paren; index < main.length; index += 1) {
    if (main[index] === '(') parenDepth += 1;
    if (main[index] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        brace = main.indexOf('{', index);
        break;
      }
    }
  }
  assert.ok(brace >= 0, `${name} body is present`);
  let depth = 0;
  for (let index = brace; index < main.length; index += 1) {
    if (main[index] === '{') depth += 1;
    if (main[index] === '}') depth -= 1;
    if (depth === 0) return main.slice(brace + 1, index);
  }
  throw new Error(`Cannot read ${name}`);
}

// Missing/corrupt writable files must be recovered before the packaged defaults
// are considered. In particular, ensureWorldDataDir must not eagerly copy the
// bundled equipment file and thereby hide a valid backup.
assert.doesNotMatch(functionBody('ensureWorldDataDir'), /copyFile/);
assert.match(main, /chooseWorldSectionPayload\(name, currentPayload, backupPayload, fallbackPayload\)/);
assert.doesNotMatch(main, /chooseWorldSectionPayload\(name, currentPayload \?\? payload/);

const start = main.indexOf('function isWorldSectionUsable(');
const end = main.indexOf('async function readWorldData()', start);
const context = {};
vm.createContext(context);
vm.runInContext(main.slice(start, end), context);
const bundled = { EQUIPMENT: { blaster: { id: 'blaster' } } };
const backup = { EQUIPMENT: { blaster: { id: 'blaster' }, custom_relic: { id: 'custom_relic' } } };
assert.equal(context.chooseWorldSectionPayload('equipment', null, backup, bundled).source, 'backup');
assert.equal(context.chooseWorldSectionPayload('equipment', { EQUIPMENT: null }, backup, bundled).source, 'backup');
assert.equal(context.chooseWorldSectionPayload('equipment', { EQUIPMENT: {} }, backup, bundled).source, 'current');

// Every local state/world write goes through a temporary file and rename.
assert.match(main, /async function writeTextAtomic\(/);
assert.match(functionBody('writeTextAtomic'), /rename\(tempFile, file\)/);
assert.match(functionBody('writeWorldSection'), /writeJsonAtomic\(file, payload\)/);
assert.match(functionBody('writeWorldData'), /writeJsonAtomic\(file, payload \?\? \{\}\)/);
assert.match(main, /stateBackupFilePath\(\)/);

// Snapshot writes are section-scoped. A World Config equipment save may update
// equipment only, while routine/profile saves preserve the authoritative world.
assert.match(renderer, /worldSections:\s*\[this\.selectedType\]/);
assert.match(renderer, /worldSections:\s*\['players'\]/);
assert.match(main, /status:\s*'world-section-reset-protected'/);
assert.match(main, /const worldSections = gmWrite[\s\S]*?: \[\];/);
assert.match(main, /normalizedSnapshot\.state\.__worldWriteV140/);

console.log('v140: World Config backup recovery, atomic writes, scoped sync and bundled-reset protection OK');
