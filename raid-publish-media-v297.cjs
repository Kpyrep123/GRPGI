'use strict';
// Mission maps are copied out of the local combat store before snapshot publication.
// A desktop-only URL must never be reported as a published mission image.
module.exports=async function publishRaidMedia(config,snapshot,upload){
 const cache=new Map();
 async function field(entity,key,scene){
  const source=entity?.[key];if(!source||/^https?:\/\//i.test(source))return;
  if(!cache.has(source))cache.set(source,(async()=>{
   const result=await upload(config,source,{section:'raid-maps',entityId:scene.id,preferredStem:scene.id+'_'+key});
   const url=result?.publicUrl||result?.url;
   if(!/^https?:\/\//i.test(url||''))throw Error('Изображение карты не опубликовано: '+(scene.name||scene.id));
   return url;
  })());
  entity[key]=await cache.get(source);delete entity.imageLocal;
 }
 for(const campaign of Object.values(snapshot.world?.campaigns?.RAIDS_V290||{}))for(const mission of campaign.missions||[])for(const scene of mission.maps||[]){
  await field(scene,'backgroundImage',scene);
  for(const asset of scene.assets||[])await field(asset,'image',scene);
  for(const token of scene.tokens||[])await field(token,'image',scene);
 }
 return snapshot;
};
