(() => {
  'use strict';
  const api = window.GRPGAberrationRoll;
  const catalog = window.GRPGAberrationCatalog;
  const rarityNames = ['Обычное', 'Необычное', 'Редкое', 'Эпическое', 'Легендарное'];
  const categories = {weapon:'Оружие',armor:'Броня',shield:'Щиты',backpack:'Рюкзаки',implant:'Импланты'};
  const campaignId = () => String(Sync.config?.campaignId || 'main');
  let campaignSettings = {};
  worldLoadSteps.push(payload => {
    const data = payload.campaigns?.ABERRATION_SETTINGS;
    campaignSettings = data && typeof data==='object' && !Array.isArray(data) ? deep(data) : {};
  });
  worldSaveSections.push(snapshot => {
    snapshot.campaigns.ABERRATION_SETTINGS = deep(campaignSettings);
  });

  function settings() {
    const id=campaignId();
    let saved=Object.hasOwn(campaignSettings,id)?campaignSettings[id]:null;
    if(!saved){
      try { saved=JSON.parse(localStorage.getItem('grpgi.aberrations:'+id) || localStorage.getItem('grpgi.aberrations:local') || '{}'); }
      catch { saved={}; }
    }
    return { chances:deep(saved?.chances || api.defaultChances), variants:deep(saved?.variants || {}) };
  }

  // Only effects with an implemented combat rule enter the loot pool.
  const supported = catalog.filter(effect => ['weapon-1','weapon-2','weapon-3','weapon-4','weapon-5','weapon-6','weapon-7','weapon-8','weapon-9','weapon-10','weapon-11','weapon-12','weapon-13','weapon-14','weapon-15','weapon-16','weapon-17','armor-20','armor-25','armor-26','armor-27','armor-28'].includes(effect.id)||effect.variants.some(row=>window.GRPGItemInstancesV215.passiveEffect(row.id)));
  const variants = supported.flatMap(effect => effect.variants.map(variant=>({...variant,group:effect.id,name:effect.name})));
  const damageTypeIds=['kinetic','energy','electric','explosive','gas'];
  const randomDamageGroups=['weapon-5','armor-20','armor-27'];
  const attackKinds={melee:'Ближняя атака',ranged:'Дальняя атака',any:'Любая атака'};
  const damageTypeVariant=variants.find(row=>row.group==='weapon-6');
  function resolve(id, overrides) {
    const damageMatch=/^weapon-6-([1-5])$/.exec(id);
    if(damageMatch)return {...damageTypeVariant,id,value:damageTypeIds[Number(damageMatch[1])-1]};
    const [baseId,type]=id.split(':');
    const variant=variants.find(row=>row.id===baseId);
    if (!variant) return null;
    const saved=overrides[baseId];
    if(variant.group==='armor-28'){
      if(!Object.hasOwn(attackKinds,type))return null;
      return {...variant,id,type,value:0,cost:saved?.cost??variant.cost};
    }
    if(randomDamageGroups.includes(variant.group)&&variant.group!=='weapon-5'){
      if(!damageTypeIds.includes(type))return null;
      const value=variant.group==='armor-27'?0:Number(variant.value.replace('−','-').split(/\s+/)[0]);
      return {...variant,id,type,value,cost:saved?.cost??variant.cost};
    }
    if(variant.group==='weapon-5'&&type&&!damageTypeIds.includes(type))return null;
    const rawValue=String(saved?.value ?? variant.value);
    const fixed=window.GRPGItemInstancesV215.passiveEffect(id);
    const value=fixed?fixed.value:variant.group==='weapon-5'?Number(/^1d(4|6|8)\b/i.exec(rawValue)?.[1])
      :variant.group==='weapon-7'?window.GRPGItemInstancesV215.massPercent([id])
      :Number(String(saved?.value ?? variant.value).replace('−','-').trim().split(/\s+/)[0]);
    return {...variant,type,cost:saved?.cost ?? variant.cost,value};
  }
  function validEffect(row){
    if(!row)return false;
    if(row.group==='weapon-6')return Boolean(row.value);
    if(['weapon-12','armor-25','armor-26'].includes(row.group))return [1,2].includes(row.value);
    if(row.group==='weapon-15')return row.value===1;
    return Number.isInteger(row.value)&&Math.abs(row.value)<=(/^(weapon-7|armor-21|armor-22|shield-31|backpack-40)$/.test(row.group)?30:20);
  }
  window.GRPGAberrationWeapons = {
    presentationEffect(id) {
      const effect=resolve(id,settings().variants);
      if(!validEffect(effect))return null;
      return {...effect,text:this.describe(id)};
    },
    describe(id) {
      const effect=resolve(id,settings().variants);
      if(!validEffect(effect))return '';
      const {group,name,value}=effect;
      if(group==='armor-28')return name+' · '+attackKinds[effect.type];
      if(group==='armor-20'||group==='armor-27'){
        const type=window.GRPGDamageTypesV202.label(effect.type);
        return group==='armor-27'?name+' · '+type:name+' · '+(value>0?'+':'')+value+' · '+type;
      }
      if(group==='weapon-5')return '+1d'+value+' урона'+(effect.type?' · '+window.GRPGDamageTypesV202.label(effect.type):'');
      if(group==='weapon-6')return name+' · '+window.GRPGDamageTypesV202.label(value);
      if(group==='weapon-15')return name+' · перезарядка после суперкрита';
      const sign=value>0&&!['weapon-11','weapon-12','weapon-14'].includes(group)?'+':'';
      return name+' · '+sign+value+(/^(weapon-7|armor-21|armor-22|shield-31|backpack-40)$/.test(group)?'%':'');
    },
    roll(danger,weapon) {
      const {chances,variants:overrides}=settings();
      const copies=window.GRPGItemInstancesV215;
      const target=window.GRPGDamageTypesV202.normalize(overrides[damageTypeVariant.id]?.value);
      const pool=variants.filter(row=>copies.canRollAberration(weapon,row.group.split('-')[0])).map(row=>{
        if(row.group==='armor-28'){
          const type=overrides[row.id]?.damageType;
          return Object.hasOwn(attackKinds,type)?resolve(row.id+':'+type,overrides):null;
        }
        if(randomDamageGroups.includes(row.group)){
          const type=damageTypeIds[Math.floor(Math.random()*damageTypeIds.length)];
          return resolve(row.id+':'+type,overrides);
        }
        if(row.group!=='weapon-6')return resolve(row.id,overrides);
        if(!target)return null;
        const id='weapon-6-'+(damageTypeIds.indexOf(target)+1);
        return {...resolve(id,overrides),cost:overrides[damageTypeVariant.id]?.cost??row.cost};
      }).filter(row=>validEffect(row)
        &&(row.group!=='weapon-6'||row.value!==window.GRPGDamageTypesV202.effective(weapon))
        &&(!/^(weapon-7|armor-22|shield-31|backpack-40)$/.test(row.group)||Number(weapon?.mass)>0)
        &&(!['armor-21','armor-26'].includes(row.group)||Number(weapon?.durabilityMax??weapon?.maxDurability)>0)
        &&(row.group!=='weapon-8'||(Number(weapon?.magazineSize??weapon?.clipSize)>0
          &&Number(weapon?.magazineSize??weapon?.clipSize)+row.value>=1))
        &&(row.group!=='weapon-15'||Number(weapon?.magazineSize??weapon?.clipSize)>0)
        &&(!['weapon-9','weapon-11','weapon-15','weapon-16'].includes(row.group)||weapon?.weaponCategory!=='melee')
        &&(!['weapon-10','weapon-12','weapon-13','weapon-14','weapon-17'].includes(row.group)||weapon?.weaponCategory==='melee'));
      const result=api.roll(danger,pool,{chances});
      if (!result) return {rarity:'common',budget:0,effects:[]};
      return result;
    },
    effects(ids) {
      const overrides=settings().variants;
      return (ids||[]).map(id=>resolve(id,overrides)).filter(validEffect);
    }
  };

  function openCatalog() {
    if (App.currentUser?.role !== 'gm') return;
    const key = campaignId();
    const draft = settings();
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'width:min(920px,95vw);max-height:85vh;overflow:auto';
    dialog.innerHTML = `<form><h2>Аберрации</h2>
      <table><thead><tr><th>Опасность</th><th>Бюджет</th>${rarityNames.map(name=>`<th>${name}</th>`).join('')}</tr></thead>
      <tbody data-aberration-chances></tbody></table>
      <label>Снаряжение <select class="select" data-aberration-category>${Object.entries(categories).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label>
      <div data-aberration-effects></div>
      <button class="primary" type="submit">Сохранить</button>
      <button class="secondary" type="button" data-aberration-close>Закрыть</button></form>`;
    const chanceBody = dialog.querySelector('[data-aberration-chances]');
    const effects = dialog.querySelector('[data-aberration-effects]');
    const category = dialog.querySelector('[data-aberration-category]');
    const thresholds = [0,1,4,6,8];

    function drawChances() {
      chanceBody.innerHTML = draft.chances.map((row,i)=>`<tr><th>${i+1}</th><td>${i}</td>
        ${row.map((value,j)=>`<td><input class="input" type="number" min="0" max="100" step="any" data-danger="${i}" data-rarity="${j}" aria-label="${rarityNames[j]}, опасность ${i+1}" value="${Number(value.toFixed(4))}" ${thresholds[j]>i?'disabled':''}></td>`).join('')}</tr>`).join('');
    }

    function drawEffects() {
      effects.innerHTML = catalog.filter(effect=>effect.category===category.value).map(effect=>`
        <details><summary>${esc(effect.name)}${supported.includes(effect)?'':' · в каталоге'}</summary>
        <p>${esc([effect.scope,effect.rule].filter(Boolean).join(' · '))}</p>
        ${effect.variants.map(variant=>{
          const saved = draft.variants[variant.id] || variant;
          const attack=effect.id==='armor-28';
          const fixed=attack||['armor-20','armor-27','weapon-7'].includes(effect.id)||Boolean(window.GRPGItemInstancesV215.passiveEffect(variant.id));
          return `<div class="row" data-variant="${variant.id}"><label>Значение ${effect.id==='weapon-6'
            ? `<select class="select" data-field="value"><option value="">Выберите тип</option>${Object.entries(window.GRPGDamageTypesV202.labels).map(([id,label])=>`<option value="${id}" ${saved.value===id?'selected':''}>${esc(label)}</option>`).join('')}</select>`
            : `<input class="input" data-field="value" value="${esc(fixed?variant.value:saved.value)}" ${fixed?'readonly':''}>` }</label>
            ${attack?`<label>Тип атаки <select class="select" data-field="damageType"><option value="">Выберите тип</option>${Object.entries(attackKinds).map(([id,label])=>`<option value="${id}" ${saved.damageType===id?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`:randomDamageGroups.includes(effect.id)?'<span>Тип урона определяется при выпадении</span>':''}
            <label>Бюджет <input class="input" type="number" step="1" data-field="cost" value="${saved.cost}"></label></div>`;
        }).join('')}</details>`).join('');
    }

    chanceBody.addEventListener('change',event=>{
      const input=event.target;
      if(!input.matches('[data-danger]'))return;
      const row=Number(input.dataset.danger);
      draft.chances[row]=api.updateChance(draft.chances[row],Number(input.dataset.rarity),input.value,row+1);
      drawChances();
    });
    effects.addEventListener('change',event=>{
      const row=event.target.closest('[data-variant]');
      if(!row)return;
      const [value,cost]=[row.querySelector('[data-field="value"]').value,row.querySelector('[data-field="cost"]').valueAsNumber];
      if ((value.trim() || row.dataset.variant==='weapon-6-1') && Number.isSafeInteger(cost)) draft.variants[row.dataset.variant]={value:value.trim(),cost,damageType:row.querySelector('[data-field="damageType"]')?.value};
    });
    category.addEventListener('change',drawEffects);
    dialog.querySelector('[data-aberration-close]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();
      if(App.currentUser?.role!=='gm'||campaignId()!==key)return;
      const submit=dialog.querySelector('[type="submit"]');
      if(submit.disabled)return;
      submit.disabled=true;
      const before=campaignSettings;
      campaignSettings={...before,[key]:deep(draft)};
      try{
        const result=await Configurator.persistAll('Аберрации сохранены',{worldSections:['campaigns']});
        if(result?.localSaved)dialog.close();
        else campaignSettings=before;
      }catch(error){
        campaignSettings=before;Toast.show(error.message,'err');
      }finally{submit.disabled=false;}
    };
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    drawChances();drawEffects();
    document.body.append(dialog);
    dialog.showModal();
  }

  const render = Configurator.render;
  Configurator.render = function (...args) {
    const result = render.apply(this,args);
    const panel = document.querySelector('#config-content .config-type-list');
    if (panel && App.currentUser?.role==='gm' && !panel.querySelector('[data-aberration-catalog]')) {
      const button=document.createElement('button');
      button.className='secondary config-type-btn';button.type='button';button.dataset.aberrationCatalog='';
      button.textContent='Аберрации';button.onclick=openCatalog;
      panel.append(button);
    }
    return result;
  };

  for (const type of ['npcs','fauna']) {
    // Keep this field in the regular entity editor and its normal save flow.
    const method = type==='npcs' ? 'renderNpcEditorV60' : 'renderFaunaEditor';
    const renderEntity = Configurator[method];
    if (typeof renderEntity !== 'function') continue;
    Configurator[method] = function (entity,...args) {
      const danger = api.maxBudget(entity?.dangerLevel)+1;
      return renderEntity.call(this,entity,...args).replace(/(<button[^>]+type="submit"[^>]*>)/,
        `<label class="field">Опасность <input class="input" name="dangerLevel" type="number" min="1" max="9" step="1" value="${danger}"></label>$1`);
    };
  }
  const collect=Configurator.collectEntity;
  Configurator.collectEntity=function(type,form,data=new FormData(form)){
    const entity=collect.call(this,type,form,data);
    if(entity&&['npcs','fauna'].includes(type))entity.dangerLevel=api.maxBudget(data.get('dangerLevel'))+1;
    return entity;
  };
})();
