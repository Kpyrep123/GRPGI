import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
for(const file of ['hub-core-v156.js','hub-spatial-v157.js'])vm.runInThisContext(fs.readFileSync(new URL('../renderer/'+file,import.meta.url),'utf8'));
const C=globalThis.GRPGHubCoreV156,S=globalThis.GRPGHubSpatialV157;
const map={id:'main',width:900,height:720,hexSize:28,fogEnabled:true,visionRange:3,objects:[],walls:[],spawnPoints:[]};
for(const h of S.cells(map)){const c=S.center(map,h);assert.deepEqual(S.hex(map,c.x,c.y),h,'pixel/hex roundtrip');assert.ok(S.valid(map,h));}
const a={q:2,r:4},b={q:8,r:4},start=S.center(map,a),end=S.center(map,b),p={id:'p',combat:{visionRange:5}},s={...start,mapId:'main',flags:{},objectStates:{}};
assert.equal(S.distance(a,b),6);let path=S.path(map,s,end.x,end.y);assert.equal(path.length,6);
for(const step of path){const before={...s};S.step(map,s,p,step);assert.equal(S.distance(S.hex(map,before.x,before.y),step),1);}
assert.equal(s.x,end.x);assert.ok(s.exploration.main.cells.includes(S.cellKey(a)),'exploration retained across steps');
const explored=s.exploration.main.cells.length;S.normalize(map,s,p);assert.equal(s.exploration.main.cells.length,explored,'no repeated exploration growth');
const wallX=(start.x+end.x)/2;map.walls=[{id:'w',thickness:8,blockSight:true,blockMovement:true,points:[{x:wallX,y:100},{x:wallX,y:500}]}];
assert.equal(S.canMove(map,{...s,...start},end.x,end.y),false);assert.equal(S.lineOfSight(map,s,start,end),false);
path=S.path(map,{...s,...start},end.x,end.y);assert.ok(path.length>6,'route goes around wall');for(const step of path){assert.equal(S.canMove(map,{...s,...start},end.x,end.y),false);}
const routeState={...s,...start};for(const step of path)S.step(map,routeState,p,step);assert.equal(routeState.x,end.x);
map.walls[0].points=[{x:wallX,y:0},{x:wallX,y:map.height}];assert.deepEqual(S.path(map,{...s,...start},end.x,end.y),[],'full-height wall blocks crossing');
assert.throws(()=>S.step(map,{...s,...start},p,{...b,...end}),/гекс/,'teleport rejected');
map.walls=[];map.objects=[{id:'door',type:'door',x:wallX-8,y:0,width:16,height:map.height,blockMovement:true}];
assert.equal(S.path(map,{...s,...start,objectStates:{}},end.x,end.y).length,0);assert.equal(S.lineOfSight(map,{objectStates:{}},start,end),false);
assert.equal(S.path(map,{...s,...start,objectStates:{door:'open'}},end.x,end.y).length,6);assert.equal(S.lineOfSight(map,{objectStates:{door:'open'}},start,end),true);
map.objects=[];map.walls=[{id:'w',thickness:8,blockMovement:false,blockSight:true,points:[{x:start.x+60,y:0},{x:start.x+60,y:map.height}]}];
const fogState={...s,...start,exploration:{},objectStates:{}};S.reveal(map,fogState,p);assert.ok(S.visibleCells(map,fogState,p).has(S.cellKey(a)));assert.ok(!S.visibleCells(map,fogState,p).has(S.cellKey({q:4,r:4})),'wall occludes sight even when walkable');
const hidden={id:'hidden',type:'decor',x:start.x+100,y:start.y-10,width:20,height:20};assert.equal(S.inSight(map,fogState,p,hidden),false);assert.throws(()=>S.assertObject({maps:[map]},hidden,p,fogState),/туман/);
map.walls[0].blockSight=false;assert.equal(S.inSight(map,fogState,p,hidden),true);
map.fogEnabled=false;assert.equal(S.inSight(map,fogState,p,{...hidden,x:800}),true);
const planet={id:'hub',hub:{defaultMapId:'main',maps:[map],dialogs:[]}},h=C.hubOf(planet),user={id:'p',hubState:{planetId:'hub',mapId:'main',...start}};
C.storeState(user,C.stateFor(user,planet,h));assert.equal(user.hubState.x,start.x);assert.equal(C.validate(h).length,0);
const nextMap={...map,id:'next',fogEnabled:true,spawnPoints:[{id:'entry',...end}],walls:[]};h.maps.push(nextMap);h.maps[0].objects.push({id:'transition',type:'transition',targetMapId:'next',x:start.x,y:start.y});const state=C.stateFor(user,planet,h);C.use(h,h.maps[0].objects.at(-1),user,state);assert.equal(state.mapId,'next');assert.ok(state.exploration.next.cells.length);C.storeState(user,state);assert.ok(C.stateFor(user,planet,h).exploration.next.cells.length);
const bad=C.clone(h);bad.maps[0].walls[0].points[0].x=-1;assert.ok(C.validate(bad).includes('Некорректная стена'));
const gridState={...state,...end};nextMap.hexSize=40;S.normalize(nextMap,gridState,user);assert.equal(gridState.exploration.next.gridKey,S.gridKey(nextMap),'changed grid resets incompatible exploration');
for(const f of ['hub-spatial-v157.js','hub-runtime-v156.js'])assert.equal(fs.readFileSync(new URL('../renderer/'+f,import.meta.url),'utf8'),fs.readFileSync(new URL('../deploy/site/app/'+f,import.meta.url),'utf8'));
console.log('Hub spatial: hex coordinates, shortest paths, wall detours/blocking, doors, fog, scopes, step checks, transitions and exploration persistence passed');
