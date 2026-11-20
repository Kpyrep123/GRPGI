(function(root){
  'use strict';
  const rarities=['common','uncommon','rare','epic','legendary'];
  const labels={common:'Обычное',uncommon:'Необычное',rare:'Редкое',epic:'Эпическое',legendary:'Легендарное'};
  const damageTypes=root.GRPGDamageTypesV202?.aberrationTypeIds || [];
  const attackKinds={melee:'Ближняя атака',ranged:'Дальняя атака',any:'Любая атака'};
  const unique=new Set(['weapon-5','weapon-6','weapon-11','weapon-12','weapon-13','weapon-14','armor-25','armor-27','armor-28']);
  const list=value=>Array.isArray(value)?value:[];
  const cleanRarity=value=>rarities.includes(value)?value:'common';
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const variants=new Map(list(root.GRPGAberrationCatalog).flatMap(effect=>effect.variants.map(variant=>[variant.id,{...variant,group:effect.id,name:effect.name,rule:effect.rule,scope:effect.scope}])));

  function fallback(id,overrides){
    const [base,type]=id.split(':');
    const weaponType=/^weapon-6-([1-5])$/.exec(base);
    const row=variants.get(weaponType?'weapon-6-1':base);
    if(!row)return null;
    const saved=overrides[row.id],value=String(saved?.value??row.value);
    let detail=value, resolvedType=type;
    if(weaponType){
      resolvedType=damageTypes[Number(weaponType[1])-1];
      detail=root.GRPGDamageTypesV202?.label(resolvedType);
    }
    else if(row.group==='armor-28')detail=attackKinds[type]||value;
    else if(type&&row.group==='weapon-56')detail=value+' урона · '+(root.GRPGDamageTypesV202?.label(type)||type);
    else if(type&&row.group!=='weapon-5')detail=(row.group==='armor-20'?row.value+' · ':'')+(root.GRPGDamageTypesV202?.label(type)||type);
    if(root.GRPGItemInstancesV215?.passiveEffect(base)||row.group==='weapon-7')detail=row.value;
    const dice=row.group==='weapon-5'&&/^1d(4|6|8)\b/i.exec(value);
    return {...row,type:resolvedType,cost:saved?.cost??row.cost,
      text:dice?'+1d'+dice[1]+' урона'+' · '+(root.GRPGDamageTypesV202?.label('kinetic')||'Кинетический'):row.name+' · '+detail,
      value:Number(dice?.[1]??/^[-+]?\d+/.exec(value.replace('−','-'))?.[0])};
  }

  function effectData(copy,overrides={}){
    return list(copy?.aberration252?.effects).flatMap(id=>{
      if(typeof id!=='string')return [];
      const catalog=fallback(id,overrides);
      if(!catalog)return [];
      const runtime=root.GRPGAberrationWeapons?.presentationEffect(id);
      return [{...catalog,...runtime}];
    });
  }

  function effects(copy,overrides){
    return effectData(copy,overrides).map(row=>{
      const cost=Number(row.cost)||0;
      const level=Math.abs(row.value);
      const tone=cost<0?'negative':unique.has(row.group)||cost>=6||level===3?'violet':
        cost>=3||level===2?'blue':'green';
      const typeRule=row.group==='armor-20'
        ?'При попадании защита меняется только для указанного типа урона. При смешанном уроне изменение учитывается один раз для соответствующей части.'
        :row.group==='armor-27'?'Броня поглощает всю часть попадания указанного типа. Остальные типы урона рассчитываются отдельно.':'';
      const description=[row.scope!=='Любое'?row.scope:'',typeRule||row.rule,`Бюджет: ${cost>0?'+':''}${cost}`].filter(Boolean).join(' · ');
      return {text:row.text,tone,cost,description};
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
      <ul>${rows.map(row=>`<li data-effect-tone="${escape(row.tone)}">${data.expandable&&row.description
        ?`<details><summary>${escape(row.text)}</summary><p>${escape(row.description)}</p></details>`:escape(row.text)}</li>`).join('')}</ul></div>`;
  }
  function copyMarkup(copy,overrides){
    return markup({...model(copy,overrides),expandable:true});
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
  root.GRPGAberrationPresentation={model,effectData,markup,copyMarkup,hoverMarker,rarityForBudget,labels,cleanRarity};
})(typeof window==='undefined'?globalThis:window);
