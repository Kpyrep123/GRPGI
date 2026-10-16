(function(root){
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v));
const values=v=>v&&typeof v.get==='function'&&typeof v.values==='function'?[...v.values()]:Array.isArray(v)?v:Object.values(v||{});
const ids=v=>Array.isArray(v)?v:String(v||'').split(/[\s,;]+/).filter(Boolean);
const key=s=>JSON.stringify([s.kind||'planet',String(s.planetId||''),String(s.mapId||''),String(s.objectId||'')]);
const recommended=i=>Number(i.recommendedPrice??i.price??i.cost??0);
function matches(item,filter={}){
 const price=recommended(item);
 return item.type!=='stock'&&(!filter.types?.length||filter.types.includes(item.type))&&(!filter.tags?.length||filter.tags.some(t=>(item.tags||[]).includes(t)))&&(!filter.search||String((item.name||'')+' '+item.id).toLowerCase().includes(filter.search.toLowerCase()))&&(filter.minPrice==null||price>=filter.minPrice)&&(filter.maxPrice==null||price<=filter.maxPrice);
}
function pricing(item,setting={},adjustment=0){
 if(setting.priceMode==='recommended'){
  const base=recommended(item)*(1+Number(adjustment)/100),variation=Number(setting.variationPct??15)/100;
  const result={minPrice:Math.max(0,Math.round(base*(1-variation))),maxPrice:Math.max(0,Math.round(base*(1+variation)))};if(!Object.values(result).every(Number.isSafeInteger))throw Error('Рассчитанная цена выходит за допустимые пределы');return result;
 }
 const price=Number(setting.price??recommended(item));return {minPrice:Number(setting.minPrice??price),maxPrice:Number(setting.maxPrice??price)};
}
function entries(planet={},equipment={},scope={kind:'planet',planetId:planet.id}){
 const destination=key(scope),policy=planet.assortmentPolicy,items=values(equipment);
 const rows=new Map((policy?policy.legacy||[]:Array.isArray(planet.market)?planet.market:[]).map(e=>[String(e.itemId),{...e}]));
 if(!policy){for(const item of items)for(const offer of item.merchantOffers||[])if(key(offer)===destination)rows.set(String(item.id),{...(rows.get(String(item.id))||{}),...offer,itemId:item.id});return [...rows.values()];}
 const adjustment=policy.priceAdjustmentPct==null?Number(planet.priceAdjustmentPct||0):Number(policy.priceAdjustmentPct);
 for(const item of items){if(item.type==='stock')continue;
  let setting=null,source='';
  for(const rule of policy.rules||[])if(rule.enabled!==false&&matches(item,rule.filter)){setting={...policy.defaults,...rule,priceMode:'recommended'};source='Правило: '+(rule.name||rule.id);}
  if(Object.hasOwn(policy.overrides||{},item.id)){setting=policy.overrides[item.id];source='Индивидуально';}
  if(setting){const row={...(rows.get(String(item.id))||{}),...pricing(item,setting,adjustment),itemId:item.id,enabled:setting.enabled!==false,appearanceChance:Number(setting.appearanceChance??policy.defaults?.appearanceChance??100),source};rows.set(String(item.id),row);}
 }
 return [...rows.values()];
}
function trader(o){return o.trader===undefined?(o.merchantMarket===undefined?ids(o.merchantItemIds).length>0:(o.merchantMarket||[]).some(e=>e&&e.enabled!==false)):o.trader===true;}
function legacy(object,equipment={}){return object.merchantMarket===undefined?ids(object.merchantItemIds).map(itemId=>{const item=values(equipment).find(i=>i.id===itemId)||{};return {itemId,enabled:true,appearanceChance:100,...pricing(item)};}):object.merchantMarket||[];}
function createPolicy(target,equipment,scope){
 if(target.assortmentPolicy)return clone(target.assortmentPolicy);
 const policy={version:171,legacy:clone(scope.kind==='hub'?legacy(target,equipment):target.market||[]),defaults:{appearanceChance:60,variationPct:15},rules:[],overrides:{}};
 for(const item of values(equipment))for(const offer of item.merchantOffers||[])if(key(offer)===key(scope)){const {kind,planetId,mapId,objectId,...setting}=offer;policy.overrides[item.id]={...setting,priceMode:'fixed'};}
 return policy;
}
function resolve(planets,scope){const planet=values(planets).find(p=>p.id===scope.planetId);return {planet,target:scope.kind==='hub'?planet?.hub?.maps?.find(m=>m.id===scope.mapId)?.objects?.find(o=>o.id===scope.objectId):planet};}
function destinationEntries(planets,equipment,scope){const {planet,target}=resolve(planets,scope);if(!target)return [];return entries({...target,market:scope.kind==='hub'?legacy(target,equipment):target.market,priceAdjustmentPct:planet.priceAdjustmentPct},equipment,scope);}
function destinations(planets,npcs={}){
 const out=[];
 for(const p of values(planets)){
  if(String(p.locationType||'planet').toLowerCase()!=='hub'){out.push({kind:'planet',planetId:p.id,name:`${p.name||p.id} · Терминал`,legacy:p.market||[]});continue;}
  for(const m of p.hub?.maps||[])for(const o of m.objects||[]){if(!trader(o)||o.type==='spawn')continue;
   const npc=typeof npcs.get==='function'?npcs.get(o.npcId):npcs[o.npcId];
   out.push({kind:'hub',planetId:p.id,mapId:m.id,objectId:o.id,npcId:o.npcId||'',name:`${p.name||p.id} / ${m.name||m.id} / ${o.name||npc?.name||o.id}${npc?.name&&npc.name!==o.name?' ('+npc.name+')':''}`,legacy:legacy(o)});
  }
 }
 return out.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}
function legacyRow({kind,planetId,mapId,objectId,source,...row}){return row;}
function projectWorld(world){
 const next=clone(world),equipment=next.equipment?.EQUIPMENT||{},items=values(equipment);
 const has=scope=>items.some(i=>(i.merchantOffers||[]).some(o=>key(o)===key(scope)));
 for(const p of values(next.planets?.PLANETS)){
  const scope={kind:'planet',planetId:p.id};if(p.assortmentPolicy||has(scope))p.market=entries(p,equipment,scope).map(legacyRow);
  for(const m of p.hub?.maps||[])for(const o of m.objects||[]){const scope={kind:'hub',planetId:p.id,mapId:m.id,objectId:o.id};if(!trader(o)||(!o.assortmentPolicy&&!has(scope)))continue;
   o.trader=true;o.merchantMarket=entries({...o,market:legacy(o,equipment),priceAdjustmentPct:p.priceAdjustmentPct},equipment,scope).map(legacyRow);delete o.merchantItemIds;
  }
 }
 if(next.planets?.PLANET_LIST)next.planets.PLANET_LIST=values(next.planets.PLANETS);
 return next;
}
function validateSetting(o){if(o.priceMode==='recommended'){if(!Number.isFinite(o.variationPct)||o.variationPct<0||o.variationPct>100)throw Error('Колебание цены: 0–100%');}else if(![o.minPrice,o.maxPrice].every(v=>Number.isSafeInteger(v)&&v>=0)||o.maxPrice<o.minPrice)throw Error('Цены — целые кредиты; минимум не больше максимума');if(!Number.isFinite(o.appearanceChance)||o.appearanceChance<0||o.appearanceChance>100)throw Error('Шанс: 0–100%');return o;}
function validatePolicy(p){
 if(p.priceAdjustmentPct!=null&&(!Number.isFinite(p.priceAdjustmentPct)||p.priceAdjustmentPct< -100||p.priceAdjustmentPct>100000))throw Error('Наценка: от −100% до 100000%');
 validateSetting({...p.defaults,priceMode:'recommended'});
 for(const r of p.rules||[]){validateSetting({...p.defaults,...r,priceMode:'recommended'});const f=r.filter||{};if([f.minPrice,f.maxPrice].some(v=>v!=null&&(!Number.isSafeInteger(v)||v<0))||(f.minPrice!=null&&f.maxPrice!=null&&f.minPrice>f.maxPrice))throw Error('Проверьте диапазон рекомендуемых цен правила');}
 for(const o of Object.values(p.overrides||{}))validateSetting(o);
 return p;
}
function validate(offers){const seen=new Set();for(const o of offers){const k=key(o);if(seen.has(k))throw Error('Торговец указан дважды');seen.add(k);if(!['planet','hub'].includes(o.kind)||!o.planetId||(o.kind==='hub'&&(!o.mapId||!o.objectId)))throw Error('Не указан торговец');validateSetting(o);}return offers;}
const api={key,entries,destinations,validate,projectWorld,values,recommended,matches,pricing,createPolicy,resolve,destinationEntries,validatePolicy,validateSetting};root.GRPGMerchantCatalogV170=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
