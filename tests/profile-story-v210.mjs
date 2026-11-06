import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const {Window} = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const w = new Window();
const source = fs.readFileSync('deploy/site/app/app.js', 'utf8');
const context = vm.createContext(w);
const base = {id:'p', role:'player', lore:'<p>История</p>', personalityTrait:'Черта', ideal:'Идеал', weakness:'Слабость', credits:10, inventory:[{itemId:'gun',qty:1}]};
let remote = structuredClone(base), fail = false, writes = 0, guest = false;
const App = {ui:{screen:'profile'}, config:{}, session:{userId:'p'}, cache:{snapshot:{}}, data:{players:new Map([['p',base]]), playerRows:new Map()}};
w.App=App;
w.currentPlayer=()=>App.data.players.get(App.session.userId);
w.isGuestSession=()=>guest;
w.deep=structuredClone;
w.esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
w.normalizeProfileLoreHtmlV1103=value=>value;
w.apiPullPlayer=async()=>({player_id:remote.id,version:2,profile_json:structuredClone(remote)});
w.buildPlayerMap=(_, rows)=>new Map(rows.map(row=>[row.player_id,structuredClone(row.profile_json)]));
w.decomposePlayer=player=>({profile_json:player});
w.apiPatchPlayerWithVersion=async(_,id,version,payload)=>{
  writes++;
  if(fail)throw Error('Сеть недоступна');
  remote=structuredClone(payload.profile_json);
  return {player_id:id,version:version+1,profile_json:remote};
};
w.saveCache=async()=>{};
w.notify=()=>{};
w.document.body.innerHTML='<main id="profile"></main>';
w.renderProfile=()=>{
  const host=w.document.getElementById('profile');
  host.innerHTML='<section class="character-sheet-story-v142"><section class="profile-lore-rich-v1103"><div class="profile-notes-v1103">Личные заметки</div></section><div class="section-head"><div class="section-title">Личность</div></div><div>Старые поля</div><div class="related-entity-section-v1100">Связанные статьи</div></section>';
  w.renderStory(host,w.currentPlayer());
};
vm.runInContext(source.slice(source.indexOf('  async function commitPlayerMutation('),source.indexOf('  async function buyItem(')),context);
vm.runInContext(source.slice(source.indexOf('  const storyFieldsV210'),source.indexOf('  const renderProfileBeforeSheetV142'))+'\nwindow.renderStory=renderProfileStoryV210;',context);
const click=selector=>w.document.querySelector(selector).click();
const field=(key,value)=>{
  const input=w.document.querySelector('[name="'+key+'"]');
  input.value=value;
  input.dispatchEvent(new w.Event('input',{bubbles:true}));
};
const submit=async()=>{
  w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve => setImmediate(resolve));
};
try {
  w.renderProfile();
  assert(w.document.querySelector('[role="tabpanel"]').hidden);
  click('[data-story-toggle]');
  click('[data-story-edit]');
  field('lore','Новый текст');
  w.renderProfile();
  assert.equal(w.document.querySelector('[name="lore"]').value,'Новый текст');
  click('[data-story-cancel]');
  assert.equal(writes,0);
  click('[data-story-edit]');
  field('lore','<p>Новая история</p>');
  field('personalityTrait','');
  field('ideal','Новый идеал');
  remote.credits=99; // A concurrent inventory/stat write must survive the story save.
  remote.inventory.push({itemId:'ammo',qty:3});
  await submit();
  assert.equal(remote.lore,'<p>Новая история</p>');
  assert.equal(remote.personalityTrait,'');
  assert.equal(remote.ideal,'Новый идеал');
  assert.equal(remote.credits,99);
  assert.equal(remote.inventory.length,2);
  assert(!w.document.querySelector('form'));
  assert(w.document.querySelector('.profile-notes-v1103'));
  assert(w.document.querySelector('.related-entity-section-v1100'));
  click('[data-story-edit]');
  field('weakness','Черновик');
  fail=true;
  await submit();
  assert.match(w.document.querySelector('[role="status"]').textContent,/Сеть/);
  assert.equal(w.document.querySelector('[name="weakness"]').value,'Черновик');
  fail=false;
  await submit();
  assert.equal(remote.weakness,'Черновик');
  guest=true;
  w.renderProfile();
  assert(!w.document.querySelector('[data-story-edit]'));
  console.log('PASS story draft, cancellation, clearing, versioned save, unrelated concurrent changes, failure/retry, notes and guest read-only');
} finally {
  await w.happyDOM.abort();
}
