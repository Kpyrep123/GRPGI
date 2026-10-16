import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url),M=require('../renderer/merchant-catalog-v170.js');
require('../renderer/market-engine.js');require('../renderer/hub-core-v156.js');
const E=globalThis.GRPGMarketEngineV1071,C=globalThis.GRPGHubCoreV156,S=require('../sync-server/market-engine.js');
const equipment={med:{id:'med',name:'Medicine',type:'gear',recommendedPrice:100,tags:['medical']},gun:{id:'gun',type:'weapon',recommendedPrice:200,tags:['military']},stock:{id:'stock',type:'stock',recommendedPrice:300,tags:['medical']}};
const scope={kind:'planet',planetId:'p'},planet={id:'p',priceAdjustmentPct:25,market:[]};
const p=M.createPolicy(planet,equipment,scope);planet.assortmentPolicy=p;
p.rules.push({id:'medical',filter:{tags:['medical']},enabled:true});
p.defaults={appearanceChance:100,variationPct:15};
assert.deepEqual(M.pricing(equipment.med,{priceMode:'recommended',variationPct:15},25),{minPrice:106,maxPrice:144});
let entries=M.entries(planet,equipment);assert.equal(entries.length,1);assert.equal(entries[0].appearanceChance,100);assert.equal(entries[0].minPrice,106);
assert.deepEqual(E.buildRotation({planet,equipment,gameDate:'3616-10-16'}),E.buildRotation({planet,equipment,gameDate:'3616-10-16'}));
const prices=new Set(Array.from({length:28},(_,i)=>E.buildRotation({planet,equipment,gameDate:`3616-10-${String(i+1).padStart(2,'0')}`}).offers[0].price));assert.ok(prices.size>1);assert.ok([...prices].every(v=>v>=106&&v<=144));
const now=new Date('2026-10-16T00:00:00Z'),pricesOnly=r=>r.offers.map(({itemId,price})=>({itemId,price}));assert.deepEqual(pricesOnly(E.buildRotation({planet,equipment,now})),pricesOnly(S.buildRotation({planet,equipment,now})));
equipment.newMed={id:'newMed',type:'gear',recommendedPrice:80,tags:['medical']};assert.equal(M.entries(planet,equipment).length,2);
p.overrides.med={enabled:true,priceMode:'fixed',appearanceChance:100,minPrice:7,maxPrice:9};equipment.med.recommendedPrice=999;
assert.equal(M.entries(planet,equipment).find(e=>e.itemId==='med').minPrice,7);
p.overrides.newMed={enabled:false,priceMode:'recommended',appearanceChance:0,variationPct:0};assert.equal(E.buildRotation({planet,equipment}).offers.some(e=>e.itemId==='newMed'),false);
delete p.overrides.newMed;assert.ok(E.buildRotation({planet,equipment}).offers.some(e=>e.itemId==='newMed'));
// Rule removal after projection must not resurrect generated rows as legacy stock.
let world=M.projectWorld({planets:{PLANETS:{p:planet}},equipment:{EQUIPMENT:equipment}});world.planets.PLANETS.p.assortmentPolicy.rules=[];
world=M.projectWorld(world);assert.equal(world.planets.PLANETS.p.market.some(e=>e.itemId==='newMed'),false);assert.ok(world.planets.PLANETS.p.market.some(e=>e.itemId==='med'));
// A fixed selection does not grow when equipment is added.
const fixed=M.createPolicy({id:'fixed',market:[]},equipment,{kind:'planet',planetId:'fixed'});fixed.overrides.med={enabled:true,priceMode:'recommended',appearanceChance:100,variationPct:0};assert.equal(M.entries({assortmentPolicy:fixed},equipment).length,1);
// Existing equipment-card overrides migrate once; resetting them must not revive their old copy.
const oldScope={kind:'planet',planetId:'old'},oldItem={id:'x',type:'gear',price:100,merchantOffers:[{...oldScope,enabled:false,appearanceChance:100,minPrice:20,maxPrice:30}]};
const migration=M.createPolicy({id:'old',market:[]},{x:oldItem},oldScope);assert.equal(migration.overrides.x.enabled,false);delete migration.overrides.x;assert.equal(M.entries({id:'old',assortmentPolicy:migration},{x:oldItem}).length,0);
// Hub rules inherit planet adjustment, can override it and retain scoped/stale-quote guards.
const hs={kind:'hub',planetId:'h',mapId:'m',objectId:'trader'},o={id:'trader',trader:true,merchantMarket:[]};o.assortmentPolicy=M.createPolicy(o,equipment,hs);o.assortmentPolicy.defaults={appearanceChance:100,variationPct:0};o.assortmentPolicy.rules=[{id:'r',filter:{types:['weapon']}}];
const context={...hs,equipment,priceAdjustmentPct:-25,gameDate:'3616-10-16'};let rotation=C.merchantRotation(o,id=>equipment[id],context);assert.equal(rotation.offers[0].price,150);
const player={credits:1000,inventory:[]},state={planetId:'h',mapId:'m',flags:{},objectStates:{},completedInteractions:{}};const quote={price:150,rotationKey:rotation.rotationKey,config:rotation.configuration};C.purchase({},o,'gun',player,state,equipment.gun,()=>({ok:true}),context,quote);assert.equal(player.credits,850);
o.assortmentPolicy.priceAdjustmentPct=50;assert.equal(C.merchantRotation(o,id=>equipment[id],context).offers[0].price,300);assert.throws(()=>C.purchase({},o,'gun',player,state,equipment.gun,()=>({ok:true}),context,quote),/Ассортимент изменился/);
const hub={id:'h',priceAdjustmentPct:-25,locationType:'hub',hub:{maps:[{id:'m',objects:[o]}]}};const projected=M.projectWorld({planets:{PLANETS:{h:hub}},equipment:{EQUIPMENT:equipment}});assert.equal(projected.planets.PLANETS.h.hub.maps[0].objects[0].merchantMarket[0].minPrice,300);
const payment=S.executeTransaction({world:{planets:{PLANETS:{p:planet}},equipment:{EQUIPMENT:equipment}},player:{currentPlanetId:'p',credits:10000,inventory:[]},planetId:'p',itemId:'med',action:'buy',now:new Date('2026-10-16')});assert.ok(payment.player.credits>=9991&&payment.player.credits<=9993);
assert.throws(()=>M.validatePolicy({...p,priceAdjustmentPct:-101}),/Наценка/);assert.throws(()=>M.validatePolicy({...p,defaults:{appearanceChance:101,variationPct:15}}),/Шанс/);assert.throws(()=>M.validatePolicy({...p,defaults:{appearanceChance:50,variationPct:101}}),/Колебание/);
assert.equal(M.matches(equipment.med,{tags:['deleted-tag']}),false);
for(const f of ['deploy/site/app/merchant-catalog-v170.js','sync-server/merchant-catalog-v170.js'])assert.equal(fs.readFileSync(f,'utf8'),fs.readFileSync('renderer/merchant-catalog-v170.js','utf8'));
console.log('PASS: recommended/adjusted prices, daily seeded availability and variance, Node parity/transaction, dynamic vs fixed selection, overrides/exclusions/reset, projection removal, one-time legacy migration, Hub inheritance and stale quotes, deleted-tag safety, mirrors');
