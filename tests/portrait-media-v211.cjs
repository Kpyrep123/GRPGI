const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const web = fs.readFileSync('deploy/site/app/app.js', 'utf8');
const desktop = fs.readFileSync('renderer/app.js', 'utf8');
const context = vm.createContext({
  esc: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
  titleForEntity: (_, entity) => entity.displayName || entity.id,
  initials: value => String(value).slice(0, 2),
  hashHue: () => 120
});
vm.runInContext(
  web.slice(web.indexOf('  function publicStorageUrl('), web.indexOf('  function mediaFromEntity(')) +
  desktop.slice(desktop.indexOf('function renderThumb('), desktop.indexOf('function renderEntityButton(')),
  context
);
const url = 'https://assets.example.test/api/files/assets/new/portrait.webp';
context.url = url;
for (const storagePath of ['', 'campaign/players/new/portrait.webp']) {
  context.storagePath = storagePath;
  assert.equal(vm.runInContext('resolveMediaUrl(url, storagePath)', context), url);
}
assert.equal(vm.runInContext('resolveMediaUrl("", url)', context), url);
assert.equal(vm.runInContext('resolveMediaUrl("", "campaign/players/new/portrait.webp")', context), '');
for (const field of ['image', 'avatarImage', 'photo', 'portrait', 'imageStoragePath']) {
  context.player = {id:'new', displayName:'Новый персонаж', [field]:url};
  assert.match(vm.runInContext('renderThumb(player, {type:"player"})', context), /src="https:\/\/assets.example.test/);
}
context.player = {id:'old', image:url, imageStoragePath:'campaign/players/old/image.webp'};
assert.match(vm.runInContext('renderThumb(player)', context), /<img/);
context.player = {id:'empty', displayName:'Без портрета', image:'', imageStoragePath:''};
assert.doesNotMatch(vm.runInContext('renderThumb(player)', context), /<img/);
context.player = {image:'https://assets.example.test/changed.webp', imageStoragePath:'https://assets.example.test/original.webp'};
assert.match(vm.runInContext('renderThumb(player)', context), /changed.webp/);
assert.equal(vm.runInContext('resolveMediaUrl("C:\\\\world-data\\\\portrait.png", "")', context), '');
console.log('PASS media URL with relative storage metadata, path-only URL, legacy aliases, old portraits, changed portraits and empty fallback');
