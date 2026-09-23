import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),w=new Window({url:'https://grpgi.test'}),context=vm.isContext(w)?w:vm.createContext(w),run=code=>vm.runInContext(code,context);
w.console=console;w.crypto=globalThis.crypto;w.document.body.innerHTML='<div id="root"></div>';
run(`
window.esc=value=>String(value??'');
window.EQUIPMENT={tool:{id:'tool',name:'Tool',type:'gear'}};window.PLAYER_TEMPLATES={};
window.normalizeEquipmentItemV2=raw=>({...raw,id:String(raw.id||''),type:String(raw.type||'gear')});
window.normalizePlayerProfileV2=raw=>({...raw,inventory:Array.isArray(raw.inventory)?raw.inventory:[]});
window.App={state:{users:{p:{id:'p',role:'player',displayName:'Player',credits:100,inventory:[]}}},writeLocalMirrors:async()=>({ok:true})};
window.Sync={config:{campaignId:'c'}};window.PlayerSync={shouldIsolateUsersFromSnapshot:()=>false,applyRemoteRow(row){if(row?.playerId&&row.player)App.state.users[row.playerId]=normalizePlayerProfileV2(row.player);}};
window.Persistence={save:async()=>({ok:true})};window.Toast={show(){}};window.activeSyncActorLabel=()=> 'gm';window.electronAPI={};
window.Configurator={renderEquipmentEditor(item){return '<form><button class="primary" type="submit">SAVE_ITEM</button></form>';},renderPlayerEditor(user){return '<form><input name="credits" value="'+user.credits+'"><button class="primary" type="submit">SAVE_PLAYER</button></form>';},collectEntity(type,form,fd){return type==='equipment'?normalizeEquipmentItemV2({id:'tool',type:'gear'}):normalizePlayerProfileV2(App.state.users.p);}};
`);
run(fs.readFileSync(path.join(root,'renderer/feature-pack-v138.js'),'utf8'));
assert.equal(run('normalizeEquipmentItemV2({id:"x",durabilityMax:"7",chargesMax:"3"}).durabilityMax'),7);
assert.equal(run('normalizeEquipmentItemV2({id:"x",durabilityMax:"7",chargesMax:"3"}).chargesMax'),3);
const equipmentHtml=run('Configurator.renderEquipmentEditor({id:"x",durabilityMax:7,chargesMax:3})');assert.ok(equipmentHtml.includes('name="durabilityMax"'));assert.ok(equipmentHtml.includes('name="chargesMax"'));
const playerHtml=run('Configurator.renderPlayerEditor(App.state.users.p)');assert.ok(playerHtml.includes('data-credit-grant-v138="p"'));
w.document.getElementById('root').innerHTML=equipmentHtml;const form=w.document.querySelector('form');form.querySelector('[name=durabilityMax]').value='9';form.querySelector('[name=chargesMax]').value='4';w.form=form;
assert.deepEqual(JSON.parse(run('JSON.stringify(Configurator.collectEntity("equipment",window.form,new FormData(window.form)))')),{id:'tool',type:'gear',durabilityMax:9,chargesMax:4});
console.log('PASS durability and charge fields normalize, render and collect');

let saves=0;w.Persistence.save=async()=>{saves++;if(saves===1)throw new Error('disk unavailable');return{ok:true};};
let result=await w.GRPGCombatAPIv138.grantCredits('p',10,{reason:'test'});assert.equal(result.status,'local-save-failed');assert.equal(run('App.state.users.p.credits'),110);
result=await w.GRPGCombatAPIv138.grantCredits('p',10,{reason:'test'});assert.equal(result.ok,true);assert.equal(run('App.state.users.p.credits'),110);assert.equal(Object.keys(JSON.parse(w.localStorage.getItem('grpg-credit-grants-v138')||'{}')).length,0);
console.log('PASS local save retry reuses receipt and never doubles credits');

run('PlayerSync.shouldIsolateUsersFromSnapshot=()=>true;App.state.users.p.credits=110');let committed=false,lost=true,requests=[];
w.electronAPI.patchPlayer=async request=>{requests.push(structuredClone(request));if(!committed)committed=true;if(lost)throw new Error('lost response');return{ok:true,status:'replayed',row:{playerId:'p',player:{...w.App.state.users.p,credits:115}}};};
result=await w.GRPGCombatAPIv138.grantCredits('p',5,{reason:'remote'});assert.equal(result.ok,false);lost=false;result=await w.GRPGCombatAPIv138.grantCredits('p',5,{reason:'remote'});assert.equal(result.ok,true);assert.equal(new Set(requests.map(row=>row.operationId)).size,1);assert.equal(run('App.state.users.p.credits'),115);
console.log('PASS lost remote response reuses operation id and reconciles one grant');
assert.deepEqual(JSON.parse(run('JSON.stringify(normalizePlayerProfileV2({id:"p",itemStateV138:{shield:{durabilityMax:5,durability:0,chargesMax:2,charges:1,broken:true}}}).itemStateV138.shield)')),{itemId:'shield',slot:'',durabilityMax:5,durability:0,chargesMax:2,charges:1,broken:true});
console.log('ALL V138 UI MONEY/ITEM CHECKS PASSED');
await w.happyDOM.abort();
