// npm install --prefix /tmp/grpgi-test-dom happy-dom
// HAPPY_DOM_MODULE=/path/happy-dom/lib/index.js node tests/v137-combat-performance.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-v134-'));
const errors=[];
const w=new Window({url:'https://grpgi.test',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,disableComputedStyleRendering:true}});
const context=vm.isContext(w)?w:vm.createContext(w);
const run=code=>vm.runInContext(code,context);
w.setInterval=()=>0;w.requestAnimationFrame=()=>0;
const windowAdd=w.addEventListener.bind(w),documentAdd=w.document.addEventListener.bind(w.document);
w.addEventListener=(type,...args)=>{if(type!=='load')return windowAdd(type,...args)};
w.document.addEventListener=(type,...args)=>{if(type!=='DOMContentLoaded')return documentAdd(type,...args)};
w.console={...console,log(){},debug(){},warn(...args){errors.push(args.map(String).join(' '))},error(...args){errors.push(args.map(String).join(' '))}};
w.electronAPI={appVersion:'1.0.134',debugLog:async()=>{},saveWorldData:async world=>{
 fs.writeFileSync(path.join(scratch,'world.json'),JSON.stringify(world));return{ok:true,world:JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'))};
},loadWorldData:async()=>({ok:true,world:JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'))}),saveWorldSection:async(type,payload)=>{
 const world=JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'));world[type]=payload;fs.writeFileSync(path.join(scratch,'world.json'),JSON.stringify(world));return{ok:true};
},exportWorldSectionJson:async(type,payload)=>{fs.writeFileSync(path.join(scratch,type+'.json'),JSON.stringify(payload));return{ok:true,fileName:type+'.json'}}};
const html=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8');
w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
// Every renderer script is evaluated unmodified, in index.html order, sharing
// browser-style lexical globals. Only OS/cloud/bootstrap boundaries are mocked.
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))(()=>{let source=fs.readFileSync(path.join(root,'renderer',m[1]),'utf8');if(m[1]==='scene-editor-v113.js')source=source.replace('// New module is DM-only;', 'window.__sceneTestV137={local,applyStore,visibleHexCells112,showLootOverlay118,startBoardPointer104,moveBoardPointer104,endBoardPointer104,renderSounds104};\n  // New module is DM-only;');vm.runInContext(source,context,{filename:m[1]});})();

const pause=ms=>new Promise(r=>setTimeout(r,ms));
run("applyWorldData({players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'},p:{id:'p',role:'player'}}},equipment:{EQUIPMENT:{}},npcs:{NPCS:{n:{id:'n',name:'Unit'}}}});App.state=makeDefaultState();App.currentUserId='gm'");
run("window.__sceneTestV137.applyStore({scenes:{s:{id:'s',name:'Performance',width:40,height:30,fogMode:'objects',assets:[],templates:[]}},runtimes:{s:{tokens:Array.from({length:80},(_,i)=>({id:'t'+i,name:'Token '+i,type:i===0?'player':'npc',playerId:i===0?'p':'',npcId:i===0?'':'n',x:i%20,y:Math.floor(i/20)+5,w:1,h:1,hpCurrent:10,hpMax:10,visionRange:3,sharesVisionWithPlayers:i===0,blockSight:false}))}},selectedSceneId:'s',rangeSchema:109,cameraSchema:109});window.__sceneTestV137.local.loaded=true");
let calls=0;const normalize=run('normalizeCombatToken');w.normalizerV137=(token)=>{calls++;return normalize(token)};
run('normalizeCombatToken=window.normalizerV137');
let start=performance.now();for(let i=0;i<100;i++)run('Combat.getRuntime()');
console.log('100 runtime reads ms',Math.round(performance.now()-start),'normalizations',calls);assert.equal(calls,80);
calls=0;for(let i=0;i<100;i++)run('Combat.getRuntime()');assert.equal(calls,0);
calls=0;start=performance.now();const cells=run('window.__sceneTestV137.visibleHexCells112(Combat.getScene(),Combat.getRuntime())');
console.log('Visibility ms',Math.round(performance.now()-start),'normalizations',calls,'visible cells',cells.length);assert.equal(calls,0);assert.ok(cells.length>0);
run('Combat.getRuntime().tokens.push({id:"new",hpCurrent:1})');const added=run('Combat.getRuntime().tokens.at(-1)');assert.ok(added.lootStateV118);assert.equal(calls,81);
const first=run('Combat.getRuntime().tokens[0]');assert.equal(run('Combat.getRuntime().tokens[0]'),first);
run('Combat.getRuntime().tokens=Combat.getRuntime().tokens.map(t=>({...t}))');calls=0;run('Combat.getRuntime()');assert.equal(calls,81);
console.log('PASS runtime cache: reads avoid normalization; new arrays/tokens normalized; token identity preserved');
await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});
