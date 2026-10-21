import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const retired={regionMaps:{REGION_MAPS:{old:{id:'old',name:'Legacy city',planetId:'home',custom:{keep:true}}}},ships:{SHIPS:{s:{id:'s',fuel:17,custom:'keep'}}},missiles:{MISSILES:{m:{id:'m',seek:19}}},radars:{RADARS:{r:{id:'r',range:23}}}};
const world={...retired,players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm',displayName:'DM'},p:{id:'p',role:'player',displayName:'Player',geographicOriginId:'local'}}},systems:{SYSTEMS:[{id:'sys',name:'System',planetIds:['home']}]},planets:{PLANETS:{home:{id:'home',name:'Home',systemId:'sys',type:'hub'}}},geographicOrigins:{GEOGRAPHIC_ORIGINS:{local:{id:'local',name:'Local',linkedRegionIds:['old']}}}};
try {
 const page=await browser.newPage({viewport:{width:1500,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),base=path.resolve('renderer');
  if(u.hostname!=='cleanup181.test')return route.abort();
  const file=path.resolve(base,decodeURIComponent(u.pathname.slice(1))||'index.html');
  if(!file.startsWith(base+path.sep)||! /\.(html|js|css)$/.test(file))return route.abort();
  try {await route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}catch{return route.abort();}
 });
 await page.addInitScript(()=>{
  window.setInterval=()=>0;
  const da=document.addEventListener.bind(document),wa=window.addEventListener.bind(window);
  document.addEventListener=(t,...a)=>t==='DOMContentLoaded'&&!String(a[0]).includes('playerRuntime=window.GRPGHubRuntimeV156')?undefined:da(t,...a);
  window.addEventListener=(t,...a)=>t==='load'?undefined:wa(t,...a);
  window.electronAPI={appVersion:'1.0.155',debugLog:async()=>{},saveWorldData:async world=>({ok:true,world}),getPlayerDisplayView:async()=>({ok:true,payload:{mode:''}})};
 });
 await page.goto('https://cleanup181.test/');
 const result=await page.evaluate(world=>{
  applyWorldData(structuredClone(world));App.state=makeDefaultState();App.currentUserId='gm';App.activeCampaignId='main';
  document.getElementById('login-screen').classList.remove('open');
  Configurator.selectedType='geographicOrigins';Configurator.selectedId='local';Configurator.render();
  const form=document.querySelector('#config-editor-form');
  const before=buildWorldSnapshot(),selected=!!form?.querySelector('[name="linkedPlanetIds"][value="home"]:checked');
  const collected=Configurator.collectEntity('geographicOrigins',form);
  Configurator.insertEntity('geographicOrigins',collected);
  const saved=buildWorldSnapshot();applyWorldData(JSON.parse(JSON.stringify(saved)));const reloaded=buildWorldSnapshot();
  UI.renderProfile();
  Configurator.selectedType='planets';Configurator.selectedId='home';Configurator.render();
  document.getElementById('hub-builder-open-v153').click();
  const builder=!!document.querySelector('#hub-builder-v153 [data-hub-map-v153]');
  document.getElementById('hub-builder-v153')?.remove();
  Combat.render();
  return {builder,types:Object.keys(WORLD_SECTIONS),runtime:typeof window.RegionMapsV36,selected,collected,before,saved,reloaded,regionFields:document.querySelectorAll('[name="linkedRegionIds"],[name="currentShipId"],[name="currentRegionId"]').length,regionUI:document.querySelectorAll('[data-open-region-map],[data-rcc-launcher],.profile-rts-location-card-v36').length,hub:!!window.GRPGHubV153,combat:typeof Combat !== "undefined"};
 },world);
 for(const section of Object.keys(retired))for(const snap of [result.before,result.saved,result.reloaded])assert.deepEqual(snap[section],retired[section],`${section} survives save/import`);
 for(const section of Object.keys(retired))assert(!result.types.includes(section),section+' editor removed');
 assert.equal(result.runtime,'undefined');assert(result.selected,'legacy access shown as planet');assert(result.collected.linkedPlanetIds.includes('home'));assert(result.collected.grantedPlanetIds.includes('home'));
 assert.equal(result.regionFields,0);assert.equal(result.regionUI,0);assert(result.hub);assert(result.builder);assert(result.combat);
 assert.deepEqual(errors,[]);
 // Old region display payload must not load retired data; combat still renders and resizes.
 await page.goto('https://cleanup181.test/player-display.html');
 const display=await page.evaluate(async()=>{
  playerDisplayMirror=normalizeMirrorPayload({mode:'region',activeRegionMapId:'old'});await refresh();
  const blank=!!document.querySelector('.player-display-stage--blank');
  playerDisplayMirror=normalizeMirrorPayload({mode:'combat',combatSnapshot:{scene:{id:'scene',name:'Combat',width:20,height:12,fogEnabled:false,assets:[]},runtime:{tokens:[{id:'p',name:'Player',x:3,y:3,w:1,h:1,playerId:'p'}]}}});await refresh();window.dispatchEvent(new Event('resize'));
  return {blank,combat:!!document.querySelector('.player-scene-v104'),token:!!document.querySelector('[data-player-token-v104="p"]')};
 });
 assert(display.blank);assert(display.combat);assert(display.token);assert.deepEqual(errors,[]);
 console.log('v181 PASS: retired editors/runtime absent; legacy JSON roundtrip and origin planet access preserved; Hub/Combat loaded; combat second-screen renders after old region payload and resize.');
}finally{await browser.close();}
