/* Personal World Config pins; no entity data or unsaved forms are modified. */
(function(root){
  'use strict';
  const cache=new Map();
  let context={enabled:false,userId:'',campaignId:''};
  const key=()=>`grpg.config.favorites.v182:${JSON.stringify([context.userId,context.campaignId])}`;
  const entry=(type,id)=>JSON.stringify([String(type),String(id)]);
  function pins(){
    const k=key();
    if(!cache.has(k)){
      let data=[];try{data=JSON.parse(root.localStorage.getItem(k)||'[]');}catch{}
      cache.set(k,new Set(Array.isArray(data)?data.filter(v=>typeof v==='string'):[]));
    }
    return cache.get(k);
  }
  function persist(){try{root.localStorage.setItem(key(),JSON.stringify([...pins()]));}catch{}}
  function has(type,id){return context.enabled && pins().has(entry(type,id));}
  function set(type,id,value){if(!context.enabled||!id)return;value?pins().add(entry(type,id)):pins().delete(entry(type,id));persist();}
  function decorate(button,type,id){const active=has(type,id),label=active?'Убрать из избранного':'Добавить в избранное';button.textContent=active?'★':'☆';button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',label);button.title=label;}
  function bind(list,type){
    if(!context.enabled||!list)return;
    const rows=[...list.querySelectorAll('[data-config-id]')];
    function reorder(){rows.sort((a,b)=>Number(has(type,b.dataset.configId))-Number(has(type,a.dataset.configId))||Number(a.dataset.configOrderV182)-Number(b.dataset.configOrderV182));for(const row of rows)list.append(row);}
    for(const row of rows){
      const button=row.querySelector('[data-config-favorite-v182]');if(!button)continue;
      decorate(button,type,row.dataset.configId);
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();set(type,row.dataset.configId,!has(type,row.dataset.configId));decorate(button,type,row.dataset.configId);reorder();});
    }
  }
  root.GRPGConfigFavoritesV182=Object.freeze({
    configure(next){context={...next,userId:String(next.userId||''),campaignId:String(next.campaignId||'')};},
    has,set,bind,
    sort(items,type){return [...items].sort((a,b)=>Number(has(type,b.id))-Number(has(type,a.id)));},
    remap(type,oldId,newId){if(oldId!==newId&&has(type,oldId)){set(type,oldId,false);set(type,newId,true);}},
    remove(type,id){set(type,id,false);}
  });
})(window);
