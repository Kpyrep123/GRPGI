'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),S=require('../renderer/unit-size-v184.js');
const expected={small:1,normal:1,large:3,huge:7,massive:12,colossal:19},scene={width:40,height:30};
for(const [size,count] of Object.entries(expected)){
 const token={unitSize:size,x:4,y:4,w:1,h:1,rotation:60};assert.equal(S.info(size).count,count);assert(S.fit(token,scene,{x:6,y:8}));
 const offsets=S.info(size).offsets,seen=new Set([0]);for(let pass=0;pass<offsets.length;pass++)for(let i=0;i<offsets.length;i++)for(const j of seen){const [a,b]=offsets[i],[c,d]=offsets[j];if(Math.max(Math.abs(a-c),Math.abs(b-d),Math.abs(a+b-c-d))===1)seen.add(i);}assert.equal(seen.size,count);
 assert.equal(token.rotation,60);const cells=S.cells(token);assert.equal(new Set(cells.map(p=>`${p.x}:${p.y}`)).size,count);
 for(const cell of cells){const snapped=S.nearest(cell);assert(Math.hypot(cell.x-snapped.x,cell.y-snapped.y)<1e-8);assert(S.contains(token,cell.x,cell.y));}
 const before=JSON.stringify(token),a=S.anchor(token);S.fit(token,scene,a);assert.equal(JSON.stringify(token),before,'fit must be idempotent');
 assert(S.inBounds(size,scene,a));assert.equal((S.svg(token).match(/<polygon/g)||[]).length,count===1?0:count);
 const reload=JSON.parse(JSON.stringify(token));assert.deepEqual(S.cells(reload),cells);
 const edge={unitSize:size};assert(S.fit(edge,scene,{x:0,y:0}));assert(S.inBounds(size,scene,S.anchor(edge)));
}
const big={unitSize:'colossal'},small={unitSize:'normal'};S.fit(big,scene,{x:6,y:8});const edge=S.cells(big).sort((a,b)=>b.x-a.x)[0];S.fit(small,scene,{x:edge.x+S.side*1.5,y:edge.y+S.hexH/2});assert.equal(S.distance(big,small),1);
const tri={unitSize:'large'};S.fit(tri,scene,{x:6,y:8});assert(!S.contains(tri,tri.x+tri.w-.01,tri.y+.01),'bounding-box corner is not an occupied hex');
assert.equal(S.normalize('unknown'),'normal');assert.equal(S.normalize('Колоссальный'),'colossal');assert.equal(fs.readFileSync('renderer/unit-size-v184.js','utf8'),fs.readFileSync('deploy/site/app/unit-size-v184.js','utf8'));
console.log('PASS v184 exact 1/1/3/7/12/19 connected hex footprints, grid alignment, edge fit, reload/idempotence, footprint distance, empty corners and mirrored model.');
