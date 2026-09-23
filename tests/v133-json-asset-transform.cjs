'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {transform}=require('../renderer/asset-transform-v133.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const corner=(o,sx,sy)=>{const r=(o.rotation||0)*Math.PI/180;return{x:o.x+o.w/2+Math.cos(r)*sx*o.w/2-Math.sin(r)*sy*o.h/2,y:o.y+o.h/2+Math.sin(r)*sx*o.w/2+Math.cos(r)*sy*o.h/2};};
for(const rotation of [0,30,90,177,270])for(const mode of ['nw','ne','sw','se']){
 const o={x:10,y:12,w:4,h:2,rotation},sx=mode.includes('e')?1:-1,sy=mode.includes('s')?1:-1;
 const start=corner(o,sx,sy),fixed=corner(o,-sx,-sy),p={x:start.x+1,y:start.y+2};
 for(const shift of [false,true]){const n=transform(o,start,p,mode,shift),f=corner(n,-sx,-sy);close(f.x,fixed.x);close(f.y,fixed.y);if(shift)close(n.w/n.h,2);assert.ok(n.w>=.25&&n.h>=.25);}
 assert.deepEqual(transform(o,start,start,mode),o);
}
const o={x:0,y:0,w:2,h:2,rotation:0};close(transform(o,{x:1,y:0},{x:2,y:1},'rotate').rotation,90);
const n=transform(o,{x:2,y:2},{x:-100,y:-100},'se');close(n.w,.5);close(n.h,.5);
const codec=require('../renderer/world-json-transfer-v132.js');for(const bad of [null,7,true,'text'])assert.throws(()=>codec.sectionEntries('npcs',{npcs:{mapKey:'NPCS'}},bad),/объект или массив/);
const main=fs.readFileSync(require.resolve('../main.js'),'utf8');
const start=main.indexOf('function isWorldSectionUsable('),end=main.indexOf('async function readWorldData()',start);
const ctx={};vm.createContext(ctx);vm.runInContext(main.slice(start,end),ctx);
for(const [name,payload] of [['npcs',{NPCS:{}}],['planets',{PLANETS:{}}],['systems',{SYSTEMS:[]}]])assert.equal(ctx.chooseWorldSectionPayload(name,payload,{NPCS:{old:{id:'old'}},PLANETS:{old:{}},SYSTEMS:[{id:'old'}]},{}).source,'current');
assert.equal(ctx.chooseWorldSectionPayload('npcs',{NPCS:null},{NPCS:{old:{id:'old'}}},{}).source,'backup');
console.log('v133: rotated corners, aspect ratio, rotation, minimum dimensions, malformed JSON, empty-section restart recovery OK');
