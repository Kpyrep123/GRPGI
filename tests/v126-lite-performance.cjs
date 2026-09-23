const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('renderer/app.js');
const styles = read('renderer/styles.css');
const region = read('renderer/region-command-center.js');
const display = read('renderer/player-display.js');
const displayHtml = read('renderer/player-display.html');
const scene = read('renderer/scene-editor-v113.js');
const main = read('main.js');
const index = read('renderer/index.html');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

assert.equal(pkg.version, '1.0.126');
assert.equal(pkg.buildVersion, '1.0.126.0');
assert.equal(pkg.build.buildVersion, '1.0.126.0');
assert.equal(lock.version, '1.0.126');
assert.equal(lock.packages[''].version, '1.0.126');

assert.match(app, /LITE_DPR:\s*0\.75/);
assert.match(app, /LITE_ACTIVE_FPS:\s*15/);
assert.match(app, /shouldContinueFrame\(\)/);
assert.match(app, /GraphicsMode\.isLite\(\) \? this\.LITE_ACTIVE_FPS : this\.TARGET_FPS/);
assert.match(app, /GraphicsMode\.isLite\(\) \? 0 : now\(\) \* 0\.001/);
assert.match(app, /frameNow - RTS_REGION_UI_V36\.lastLiteFrameAt < 100/);
assert.match(app, /graphicsMode: GraphicsMode\.isLite\(\) \? 'lite' : 'full'/);

assert.match(styles, /maximal Lite mode for very low-end hardware/);
assert.match(styles, /html\[data-graphics-mode="lite"\] \*/);
assert.match(styles, /animation:\s*none !important/);
assert.match(styles, /transition:\s*none !important/);
assert.match(styles, /backdrop-filter:\s*none !important/);
assert.match(styles, /filter:\s*none !important/);
assert.match(styles, /box-shadow:\s*none !important/);
assert.match(styles, /#galaxy-backdrop/);

assert.match(region, /lastLiteFrameAt:\s*0/);
assert.match(region, /now - state\.lastLiteFrameAt < 100/);
assert.match(region, /graphicsMode: document\.documentElement\.dataset\.graphicsMode === 'lite' \? 'lite' : 'full'/);

assert.match(display, /graphicsMode: String\(payload\?\.graphicsMode/);
assert.match(display, /dataset\.graphicsMode = graphicsMode/);
assert.match(display, /frameNow-regionDisplayV36\.lastLiteFrameAt<100/);
assert.match(display, /now-regionDisplayV36\.lastLiteFogAt>=500/);
assert.match(display, /W=lite\?480:720/);
assert.match(displayHtml, /data-graphics-mode="full"/);

assert.match(main, /graphicsMode: 'full'/);
assert.match(main, /hasGraphicsMode/);
assert.match(scene, /dataset\?\.graphicsMode==='lite'\?'lite':'full'/);
assert.match(index, /APP: v1\.0\.126/);
assert.match(index, /styles\.css\?v=1\.0\.126/);
assert.match(index, /app\.js\?v=1\.0\.126/);
assert.match(index, /region-command-center\.js\?v=1\.0\.126/);
assert.match(displayHtml, /player-display\.js\?v=1\.0\.126/);

console.log('v1.0.126 maximal Lite performance checks passed');
