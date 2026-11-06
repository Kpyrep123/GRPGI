import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const {Window} = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const w = new Window({url:'https://grpgi.test/app/', settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
const context = vm.createContext(w), run = text => vm.runInContext(text, context);
w.setInterval=()=>0;w.requestAnimationFrame=()=>0;
const read = name => fs.readFileSync('deploy/site/app/' + name, 'utf8');
w.document.write(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
for (const file of ['rich-text-scope.js','market-engine.js','player-sync-core.js','damage-types-v202.js','weapon-handling-v203.js','player-credentials-v212.js','player-auth-v212.js']) run(read(file));
const source = read('app.js').replace('  init().catch(error => {', `
  window.hp214={App,derived:derivedPlayerWeb118,normalize:normalizeInventoryPlayerWebV1067,upgrade:upgradeAbility,render:renderProfile};commitPlayerMutation=async fn=>{const p=currentPlayer();await fn(p);};
  renderCurrentScreen=()=>{};startRealtimeSync=()=>{};notify=()=>{};
  if(false) init().catch(error => {`);
run(source);

try{
const api=w.hp214;api.App.config={url:'https://test',campaignId:'main'};api.App.session={userId:'p',role:'player'};api.App.data.world={};
const p={id:'p',role:'player',stats:{hpCurrent:1,hpMax:1},abilityBase:{endurance:0},abilities:{endurance:0},skillPoints:5,inventory:[]};api.App.data.players.set('p',p);w.confirm=()=>true;
await api.upgrade('endurance');assert.equal(p.abilityBase.endurance,1);assert.equal(p.stats.hpMax,2);assert.equal(p.stats.hpCurrent,1);assert.equal(p.baseStats.hpBase,1);
api.render();assert.match(w.document.getElementById('screen-profile').textContent,/1\s*\/\s*2/);
let result=api.normalize(p);assert.equal(result.stats.hpMax,2);assert.equal(result.stats.hpCurrent,1);
await api.upgrade('endurance');assert.equal(p.stats.hpMax,3);assert.equal(p.stats.hpCurrent,1);
result=api.normalize({...p,baseStats:{hpBase:1},stats:{hpCurrent:0,hpMax:3},modifiers:[{target:'max_hp',op:'add',value:2}]});assert.equal(result.stats.hpMax,5);assert.equal(result.stats.hpCurrent,0);
assert.equal(api.normalize({...p,baseStats:{hpBase:1.6}}).stats.hpMax,4);
console.log('PASS v214 web HP: endurance upgrade persists base and max, repeated normalization stable, current HP unchanged, zero HP and max_hp modifier');
}finally{await w.happyDOM.abort();}
