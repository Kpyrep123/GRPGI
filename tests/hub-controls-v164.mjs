import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const X=vm.createContext({console});for(const f of ['market-engine.js','hub-core-v156.js','hub-spatial-v157.js'])vm.runInContext(fs.readFileSync(new URL('../renderer/'+f,import.meta.url),'utf8'),X);
const C=X.GRPGHubCoreV156,S=X.GRPGHubSpatialV157,copy=x=>JSON.parse(JSON.stringify(x)),m={id:'a',width:1200,height:900,hexSize:28,objects:[],spawnPoints:[],walls:[]},at=h=>S.center(m,h),start=at({q:2,r:4});m.spawnPoints=[{id:'initial',...start}];
const make=(id,type,h)=>{const p=at(h);return {id,type,width:48,height:48,x:p.x-24,y:p.y-24};};
const near=make('near','npc',{q:4,r:4}),far=make('far','npc',{q:5,r:4});near.trader=far.trader=true;near.merchantItemIds=far.merchantItemIds=['key'];near.dialogIds=far.dialogIds=['d'];
const target=make('back','transition',{q:1,r:2}),next={id:'b',width:1200,height:900,hexSize:28,objects:[target],spawnPoints:[],walls:[]};
const portal=make('out','transition',{q:3,r:4});Object.assign(portal,{targetMapId:'b',targetObjectId:'back',targetType:'transition'});Object.assign(target,{targetMapId:'a',targetObjectId:'out',targetType:'transition'});m.objects=[near,far,portal];
const h={maps:[m,next],defaultMapId:'a',dialogs:[{id:'d',startNodeId:'n',nodes:[{id:'n',choices:[]}]}]},planet={id:'h',hub:h},p={id:'p',credits:10,inventory:[{itemId:'key',qty:1}],currentPlanetId:'h'},s=C.stateFor(p,planet,h),item={id:'key',type:'gear',price:2};
assert.equal(S.INTERACTION_RANGE,2);assert.equal(S.interactionReason(m,s,p,near),'');assert.match(S.interactionReason(m,s,p,far),/2 гексов/);
for(const action of [()=>C.purchase(h,far,'key',p,s,item),()=>C.sell(h,far,'key',0,p,s,item),()=>C.advance(h,'far','d','n',null,p,s),()=>C.use(h,{...far,type:'door'},p,s)]){const before=copy({p,s});assert.throws(action,/2 гексов/);assert.deepEqual(copy({p,s}),before);}
C.purchase(h,near,'key',p,s,item);assert.equal(p.credits,8);C.advance(h,'near','d','n',null,p,s);assert.equal(s.completedDialogs.d,true);
const fog={...m,fogEnabled:true,visionRange:0};assert.match(S.interactionReason(fog,s,p,near),/туманом/);
assert.equal(C.validate(h).length,0);C.use(h,portal,p,s);assert.equal(s.mapId,'b');assert.equal(s.arrivalObjectId,'back');assert.equal(s.spawnId,'');const expected=S.nearest(next,target.x+24,target.y+24);assert.deepEqual(copy(S.hex(next,s.x,s.y)),copy(expected));C.use(h,target,p,s);assert.equal(s.mapId,'a');assert.equal(s.arrivalObjectId,'out');assert.equal(s.completedDialogs.d,true);
const invalid=copy(h);invalid.maps[0].objects.find(o=>o.id==='out').targetObjectId='missing';assert.ok(C.validate(invalid).some(e=>e.includes('переход')));
const self=copy(h);Object.assign(self.maps[0].objects.find(o=>o.id==='out'),{targetMapId:'a',targetObjectId:'out'});assert.ok(C.validate(self).some(e=>e.includes('переход')));
const pending=copy(h);delete pending.maps[0].objects.find(o=>o.id==='out').targetObjectId;assert.ok(C.validate(pending).some(e=>e.includes('переход')));
const legacy={...portal,targetType:undefined,targetObjectId:undefined,targetMapId:'a',targetSpawnId:'initial'};C.use(h,legacy,p,s);assert.equal(s.spawnId,'initial');
for(const f of ['hub-core-v156.js','hub-runtime-v156.js','hub-spatial-v157.js','merchant-ui-v163.js','merchant-v163.css'])assert.equal(fs.readFileSync(new URL('../renderer/'+f,import.meta.url),'utf8'),fs.readFileSync(new URL('../deploy/site/app/'+f,import.meta.url),'utf8'));
console.log('Hub controls: exact 2/3-hex boundaries, all guarded actions, fog, transition-to-transition return, spawn-free destinations, stale/self/missing links, legacy entry and mirrors passed');
