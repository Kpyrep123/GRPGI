'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=f=>fs.readFileSync(require.resolve('../'+f),'utf8');
async function jsonTest(){
 const ctx={console,structuredClone,window:{},document:{getElementById:()=>null},WORLD_SECTIONS:{equipment:{label:'Equipment',mapKey:'EQUIPMENT'},players:{label:'Players',mapKey:'PLAYER_TEMPLATES'}},App:{state:{users:{},meta:{}},refreshAfterLocalWrite(){}},data:{equipment:{EQUIPMENT:{a:{id:'a',name:'A'},b:{id:'b',name:'B'}}}},worldData:{},writes:0,mode:'merge',incoming:{EQUIPMENT:{a:{id:'a',name:'Changed'},c:{id:'c'}}},Toast:{show(){}},PlayerSync:{shouldIsolateUsersFromSnapshot:()=>false},Sync:{markLocalDirty(){},pushCurrentSnapshot:async()=>({ok:true})}};
 ctx.window.GRPGWorldJsonCodecV132=require('../renderer/world-json-transfer-v132.js');
 ctx.Configurator={render(){},buildPayload:t=>ctx.data[t],removeEntity(t,id){delete ctx.data[t][ctx.WORLD_SECTIONS[t].mapKey][id]},insertEntity(t,e){ctx.data[t][ctx.WORLD_SECTIONS[t].mapKey][e.id]=e}};
 ctx.buildWorldSnapshot=()=>structuredClone(ctx.data);ctx.applyWorldData=w=>{ctx.data=structuredClone(w)};ctx.Persistence={save:async()=>{},load:async()=>ctx.App.state};
 ctx.window.electronAPI={importWorldSectionJson:async()=>({ok:true,payload:ctx.incoming}),saveWorldSection:async(t,p)=>{ctx.writes++;ctx.saved=structuredClone(p);return{ok:!ctx.fail,message:'disk failure'}},loadWorldData:async()=>({ok:true,world:structuredClone(ctx.data)})};
 vm.createContext(ctx);let block=read('renderer/world-json-ui-v134.js');
 block=block.replace('  const renderBeforeJson132=',"  chooseImportMode=async()=>mode; window.importTest=importSelectedSection;\n  const renderBeforeJson132=");vm.runInContext(block,ctx);
 await ctx.window.importTest('equipment');assert.deepEqual(Object.keys(ctx.saved.EQUIPMENT).sort(),['a','b','c']);assert.equal(ctx.saved.EQUIPMENT.a.name,'Changed');
 ctx.mode='replace';ctx.incoming={EQUIPMENT:{d:{id:'d'}}};await ctx.window.importTest('equipment');assert.deepEqual(Object.keys(ctx.saved.EQUIPMENT),['d']);
 const before=structuredClone(ctx.data);ctx.fail=true;ctx.incoming={EQUIPMENT:{z:{id:'z'}}};await assert.rejects(ctx.window.importTest('equipment'),/disk failure/);assert.deepEqual(ctx.data,before);
 ctx.fail=false;ctx.mode='cancel';const writes=ctx.writes;await ctx.window.importTest('equipment');assert.equal(ctx.writes,writes);
 ctx.data.players={PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'}}};ctx.mode='replace';ctx.incoming={PLAYER_TEMPLATES:{user:{id:'user',role:'player'}}};await assert.rejects(ctx.window.importTest('players'),/профиль gm/);assert.equal(ctx.writes,writes);
}
function pointerTest(){
 const asset={id:'a',x:5,y:5,w:4,h:2,rotation:30},node={style:{},dataset:{sceneIdV104:'a'}},stage={setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}};
 const scene={id:'s',width:20,height:15,assets:[asset]},ctx={window:{GRPGAssetTransformV133:require('../renderer/asset-transform-v133.js')},document:{getElementById:()=>stage},local:{ui:{action:'select'},lua119:{},draw:null},Combat:{getScene:()=>scene,render(){}},num:(n,f=0)=>Number(n)||f,list:v=>Array.isArray(v)?v:[],clone:structuredClone,scenePointFromEvent:e=>({x:e.x,y:e.y}),saves:0,broadcastScene104(){}};
 ctx.queueStoreSave=()=>{ctx.saves++;ctx.saved=structuredClone(scene)};
 const event=(mode,x,y,type='pointerdown',pointerId=1)=>({x,y,type,pointerId,button:0,shiftKey:false,preventDefault(){},stopImmediatePropagation(){},target:{closest:s=>s==='#combat-stage'?stage:s==='[data-scene-kind-v104]'?node:s==='[data-asset-transform-v133]'?{dataset:{assetTransformV133:mode}}:null}});
 vm.createContext(ctx);const source=read('renderer/scene-editor-v113.js');vm.runInContext(source.slice(source.indexOf('  function startBoardPointer104('),source.indexOf('  function contextMenu104(')),ctx);
 ctx.startBoardPointer104(event('se',9,7));ctx.moveBoardPointer104(event('se',11,8,'pointermove'));assert.ok(asset.w>4);assert.equal(ctx.saves,0);ctx.endBoardPointer104(event('se',11,8,'pointerup'));assert.equal(ctx.saves,1);assert.deepEqual(ctx.saved.assets[0],asset);
 const before=structuredClone(asset);ctx.startBoardPointer104(event('rotate',8,4));ctx.moveBoardPointer104(event('rotate',11,6,'pointermove'));assert.notEqual(asset.rotation,before.rotation);ctx.endBoardPointer104(event('rotate',11,6,'pointercancel'));assert.deepEqual(asset,before);assert.equal(ctx.saves,1);
 ctx.startBoardPointer104(event('rotate',8,4));ctx.moveBoardPointer104(event('rotate',11,6,'pointermove'));ctx.endBoardPointer104(event('rotate',11,6,'pointerup'));assert.equal(ctx.saves,2);assert.deepEqual(ctx.saved.assets[0],asset);
}
(async()=>{await jsonTest();pointerTest();console.log('v133 integration: merge, replace, cancellation, failed-write rollback, gm protection; actual pointer resize/rotate/cancel handlers and save callback OK')})().catch(e=>{console.error(e);process.exit(1)});
