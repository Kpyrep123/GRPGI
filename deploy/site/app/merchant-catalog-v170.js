(function(root){
'use strict';
const values=v=>v&&typeof v.get==='function'&&typeof v.values==='function'?[...v.values()]:Array.isArray(v)?v:Object.values(v||{});
const ids=v=>Array.isArray(v)?v:String(v||'').split(/[\s,;]+/).filter(Boolean);
const key=s=>JSON.stringify([s.kind||'planet',String(s.planetId||''),String(s.mapId||''),String(s.objectId||'')]);
function entries(planet={},equipment={},scope={kind:'planet',planetId:planet.id}){
 const destination=key(scope);
 const rows=new Map((Array.isArray(planet.market)?planet.market:[]).map(e=>[String(e.itemId),{...e}]));
 for(const item of values(equipment))for(const offer of item.merchantOffers||[]){if(key(offer)===destination)rows.set(String(item.id),{...(rows.get(String(item.id))||{}),...offer,itemId:item.id});}
 return [...rows.values()];
}
function trader(o){return o.trader===undefined?(o.merchantMarket===undefined?(o.merchantItemIds||[]).length>0:(o.merchantMarket||[]).some(e=>e&&e.enabled!==false)):o.trader===true;}
function destinations(planets,npcs={}){
 const out=[];
 for(const p of values(planets)){
  if(String(p.locationType||'planet').toLowerCase()!=='hub'){out.push({kind:'planet',planetId:p.id,name:`${p.name||p.id} · Терминал`,legacy:p.market||[]});continue;}
  for(const m of p.hub?.maps||[])for(const o of m.objects||[]){if(!trader(o)||o.type==='spawn')continue;
   const npc=npcs instanceof Map?npcs.get(o.npcId):npcs[o.npcId];
   const legacy=o.merchantMarket===undefined?ids(o.merchantItemIds).map(itemId=>({itemId,enabled:true})):Array.isArray(o.merchantMarket)?o.merchantMarket:[];
   out.push({kind:'hub',planetId:p.id,mapId:m.id,objectId:o.id,npcId:o.npcId||'',name:`${p.name||p.id} / ${m.name||m.id} / ${o.name||npc?.name||o.id}${npc?.name&&npc.name!==o.name?' ('+npc.name+')':''}`,legacy});
  }
 }
 return out.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}
function legacyRow({kind,planetId,mapId,objectId,...row}){return row;}
function projectWorld(world){
 const next=JSON.parse(JSON.stringify(world)),equipment=next.equipment?.EQUIPMENT||{},items=values(equipment);
 const has=scope=>items.some(i=>(i.merchantOffers||[]).some(o=>key(o)===key(scope)));
 for(const p of values(next.planets?.PLANETS)){
  const scope={kind:'planet',planetId:p.id};if(has(scope))p.market=entries(p,equipment,scope).map(legacyRow);
  for(const m of p.hub?.maps||[])for(const o of m.objects||[]){const scope={kind:'hub',planetId:p.id,mapId:m.id,objectId:o.id};if(!trader(o)||!has(scope))continue;
   const legacy=o.merchantMarket===undefined?ids(o.merchantItemIds).map(id=>({itemId:id,enabled:true,minPrice:Number(equipment[id]?.price??equipment[id]?.cost??0),maxPrice:Number(equipment[id]?.price??equipment[id]?.cost??0),appearanceChance:100})):o.merchantMarket;
   o.trader=true;o.merchantMarket=entries({market:legacy},equipment,scope).map(legacyRow);delete o.merchantItemIds;
  }
 }
 return next;
}
function validate(offers){const seen=new Set();for(const o of offers){const k=key(o);if(seen.has(k))throw Error('Торговец указан дважды');seen.add(k);if(!['planet','hub'].includes(o.kind)||!o.planetId||(o.kind==='hub'&&(!o.mapId||!o.objectId)))throw Error('Не указан торговец');if(!Number.isFinite(o.appearanceChance)||o.appearanceChance<0||o.appearanceChance>100||![o.minPrice,o.maxPrice].every(v=>Number.isSafeInteger(v)&&v>=0)||o.maxPrice<o.minPrice)throw Error('Шанс: 0–100%; цены — целые кредиты, минимум не больше максимума');}return offers;}
const api={key,entries,destinations,validate,projectWorld};root.GRPGMerchantCatalogV170=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
