(function(root){
  'use strict';
  const rarities=['common','uncommon','rare','epic','legendary'];
  const labels={common:'Обычное',uncommon:'Необычное',rare:'Редкое',epic:'Эпическое',legendary:'Легендарное'};
  const damageTypes=['kinetic','energy','electric','explosive','gas'];
  const attackKinds={melee:'Ближняя атака',ranged:'Дальняя атака',any:'Любая атака'};
  const unique=new Set(['weapon-5','weapon-6','weapon-11','weapon-12','weapon-13','weapon-14','armor-25','armor-27','armor-28']);
  const list=value=>Array.isArray(value)?value:[];
  const cleanRarity=value=>rarities.includes(value)?value:'common';
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const variants=new Map(list(root.GRPGAberrationCatalog).flatMap(effect=>effect.variants.map(variant=>[variant.id,{...variant,group:effect.id,name:effect.name}])));

  function fallback(id,overrides){
    const [base,type]=id.split(':');
    const weaponType=/^weapon-6-([1-5])$/.exec(base);
    const row=variants.get(weaponType?'weapon-6-1':base);
    if(!row)return null;
    const saved=overrides[row.id],value=String(saved?.value??row.value);
    let detail=value;
    if(weaponType)detail=root.GRPGDamageTypesV202?.label(damageTypes[Number(weaponType[1])-1]);
    else if(row.group==='armor-28')detail=attackKinds[type]||value;
    else if(type)detail=(row.group==='armor-20'?row.value+' · ':'')+(root.GRPGDamageTypesV202?.label(type)||type);
    if(root.GRPGItemInstancesV215?.passiveEffect(base)||row.group==='weapon-7')detail=row.value;
    return {...row,cost:saved?.cost??row.cost,text:row.name+' · '+detail,
      value:Number(/^[-+]?\d+/.exec(value.replace('−','-'))?.[0])};
  }

  function effects(copy,overrides={}){
    return list(copy?.aberration252?.effects).flatMap(id=>{
      if(typeof id!=='string')return [];
      const runtime=root.GRPGAberrationWeapons?.presentationEffect(id);
      const row=runtime||fallback(id,overrides);
      if(!row)return [];
      const cost=Number(row.cost)||0;
      const level=Math.abs(row.value);
      const tone=cost<0?'negative':unique.has(row.group)||cost>=6||level===3?'violet':
        cost>=3||level===2?'blue':'green';
      return [{text:row.text,tone,cost}];
    });
  }

  function model(copy,overrides){
    return {rarity:cleanRarity(copy?.aberration252?.rarity),effects:effects(copy,overrides)};
  }
  function markup(data){
    const rows=list(data?.effects);
    if(!rows.length)return '';
    const rarity=cleanRarity(data.rarity);
    return `<div class="aberration-list" data-loot-rarity="${rarity}">
      <strong class="aberration-list-heading">Аберрации · ${labels[rarity]}${data.qty>1?' ×'+Number(data.qty):''}</strong>
      <ul>${rows.map(row=>`<li data-effect-tone="${escape(row.tone)}">${escape(row.text)}</li>`).join('')}</ul></div>`;
  }
  function copyMarkup(copy,overrides){
    return markup(model(copy,overrides));
  }
  function hoverMarker(copy,overrides){
    const data=model(copy,overrides);
    return data.effects.length?`<span hidden data-aberration-hover="${escape(JSON.stringify(data))}"></span>`:'';
  }
  function rarityForBudget(budget){
    return budget>=8?'legendary':budget>=6?'epic':budget>=4?'rare':budget>=1?'uncommon':'common';
  }

  if(root.document){
    let owner,tip;
    const hide=()=>{tip?.remove();tip=null;owner=null;};
    const show=target=>{
      const node=target.closest?.('[draggable="true"],[data-wc-durability-row-v215]');
      const marker=node?.querySelector('[data-aberration-hover]');
      if(node===owner)return;
      hide();
      if(!marker)return;
      const html=markup(JSON.parse(marker.dataset.aberrationHover));
      if(!html)return;
      tip=document.createElement('div');tip.className='aberration-tooltip';tip.setAttribute('role','tooltip');
      tip.innerHTML=html;
      document.body.append(tip);owner=node;
      const rect=node.getBoundingClientRect(),box=tip.getBoundingClientRect();
      tip.style.left=Math.max(8,Math.min(rect.left,root.innerWidth-box.width-8))+'px';
      tip.style.top=(rect.bottom+box.height+16<=root.innerHeight?rect.bottom+8:Math.max(8,rect.top-box.height-8))+'px';
    };
    document.addEventListener('pointerover',event=>show(event.target));
    document.addEventListener('pointerout',event=>{if(owner?.contains(event.target)&&!owner.contains(event.relatedTarget))hide();});
    document.addEventListener('focusin',event=>show(event.target));
    document.addEventListener('focusout',event=>{if(owner?.contains(event.target)&&!owner.contains(event.relatedTarget))hide();});
    for(const event of ['scroll','dragstart','click'])document.addEventListener(event,hide,true);
  }
  root.GRPGAberrationPresentation={model,markup,copyMarkup,hoverMarker,rarityForBudget,labels,cleanRarity};
})(typeof window==='undefined'?globalThis:window);
