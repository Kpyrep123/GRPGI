/* GM-owned recipes. A recipe is a template, and every issue receives fresh instance IDs. */
(() => {
  'use strict';
  let saved={},active=false,editor=null,editorKey='';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const campaign=()=>String(Sync.config?.campaignId||'main');
  worldLoadSteps.push(payload=>{saved=clone(payload.campaigns?.ABERRATION_FORGE||{});if(!active)editor=null;});
  worldSaveSections.push(snapshot=>{snapshot.campaigns.ABERRATION_FORGE=clone(saved);});
  const list=()=>clone(saved[campaign()]||[]);
  const id=()=>crypto.randomUUID();
  function instantiate(recipe){
    const item=Data.getItem(recipe.itemId);if(!item)throw Error('Шаблон снаряжения удалён');
    const result=clone(recipe.copy);
    const rekey=copy=>{copy.id=id();delete copy.slot;for(const row of copy.attachments||[])rekey(row.copy);};
    rekey(result);
    window.GRPGItemInstancesV215.updateResources(result,item);
    return {item,copy:result,name:recipe.name};
  }
  window.GRPGAberrationForge={list,instantiate};
  function build(){
    let draft=list();
    const form=document.createElement('form');form.className='form';form.dataset.aberrationForge='';
    form.innerHTML=`<h2 class="section-title">Кузница аберраций</h2>
      <label class="field">Заготовка<select class="select" name="recipe"><option value="">Новая заготовка</option></select></label>
      <label class="field">Название<input class="input" name="name" required maxlength="160"></label>
      <label class="field">Предмет<select class="select" name="item" required></select></label>
      <label class="field">Аберрации<select class="select" multiple name="effects"></select></label>
      <output data-forge-budget>Бюджет 0</output>
      <label class="field">Текущая Прочность<input class="input" name="durability" type="number" min="0" step="1"></label>
      <div class="row"><button class="secondary" type="button" data-forge-stage>Записать заготовку</button><button class="secondary" type="button" data-forge-delete>Удалить заготовку</button><button class="primary" type="submit">Сохранить кузницу</button></div>`;
    const el=Object.fromEntries(['recipe','name','item','effects','durability'].map(name=>[name,form.elements.namedItem(name)]));
    const equipment=Object.values(EQUIPMENT).filter(item=>window.GRPGItemInstancesV215.aberrationCategory(item));
    el.item.innerHTML='<option value="">Выберите предмет</option>'+equipment.map(item=>`<option value="${esc(item.id)}">${esc(item.name||item.id)}</option>`).join('');
    function recipes(selected=''){
      el.recipe.innerHTML='<option value="">Новая заготовка</option>'+draft.map(row=>`<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('');el.recipe.value=selected;
    }
    function choices(selected=[]){
      const item=Data.getItem(el.item.value);
      const rows=item?window.GRPGAberrationWeapons.choices(item):[];
      el.effects.innerHTML=rows.map(row=>`<option value="${esc(row.id)}" ${selected.includes(row.id)?'selected':''}>${esc(window.GRPGAberrationWeapons.describe(row.id))} · бюджет ${row.cost}</option>`).join('');
      window.GRPGCheckboxPickerV172?.enhance(form);
      showBudget();
    }
    function selected(){return Array.from(el.effects.options).filter(row=>row.selected).map(row=>row.value);}
    function showBudget(){
      const value=window.GRPGAberrationWeapons.effects(selected()).reduce((sum,row)=>sum+row.cost,0);
      form.querySelector('[data-forge-budget]').textContent=`Бюджет ${value} · эффектов ${selected().length}/6`;
    }
    el.effects.addEventListener('change',showBudget);
    el.item.addEventListener('change',()=>{choices();const item=Data.getItem(el.item.value);el.durability.value=item?.durabilityMax||0;});
    el.recipe.addEventListener('change',()=>{
      const recipe=draft.find(row=>row.id===el.recipe.value);
      el.name.value=recipe?.name||'';el.item.value=recipe?.itemId||'';
      choices(recipe?.copy?.aberration252?.effects||[]);el.durability.value=recipe?.copy?.durability||0;
    });
    function stage(){
        if(!el.name.value.trim()||!el.item.value)throw Error('Укажите название и предмет');
        const item=Data.getItem(el.item.value),effects=window.GRPGAberrationWeapons.effects(selected());
        if(effects.length>6||new Set(effects.map(row=>row.group)).size!==effects.length)throw Error('До шести эффектов, по одному варианту каждого свойства');
        const budget=effects.reduce((sum,row)=>sum+row.cost,0);
        const rarity=!effects.length?'common':budget<=3?'uncommon':budget<=5?'rare':budget<=7?'epic':'legendary';
        const copy=window.GRPGAberrationInstances.create(item,{rarity,budget,effects:selected(),forged:true},id);
        if(copy.durabilityMax){const durability=Number(el.durability.value);if(!Number.isInteger(durability)||durability<0||durability>copy.durabilityMax)throw Error('Прочность должна быть в пределах максимума '+copy.durabilityMax);copy.durability=durability;copy.broken=durability===0;}
        const recipe={id:el.recipe.value||id(),name:el.name.value.trim(),itemId:item.id,copy};
        draft=draft.filter(row=>row.id!==recipe.id);draft.push(recipe);recipes(recipe.id);
    }
    form.querySelector('[data-forge-stage]').onclick=()=>{try{stage();}catch(error){Toast.show(error.message,'err');}};
    form.querySelector('[data-forge-delete]').onclick=()=>{draft=draft.filter(row=>row.id!==el.recipe.value);recipes();el.recipe.dispatchEvent(new Event('change'));};
    form.onsubmit=async event=>{
      event.preventDefault();if(App.currentUser?.role!=='gm')return;
      const before=saved;
      try{if(el.name.value.trim()||el.item.value)stage();saved={...saved,[campaign()]:clone(draft)};const result=await Configurator.persistAll('Кузница сохранена',{worldSections:['campaigns']});if(!result?.localSaved)saved=before;}catch(error){saved=before;Toast.show(error.message,'err');}
    };
    recipes();choices();return form;
  }
  document.addEventListener('click',event=>{if(event.target.closest?.('.config-type-btn:not([data-aberration-forge-tab])'))active=false;},true);
  const render=Configurator.render;
  Configurator.render=function(...args){
    const result=render.apply(this,args),root=document.getElementById('config-content'),nav=root?.querySelector('.config-type-list'),main=root?.querySelector('.config-main');
    if(App.currentUser?.role!=='gm'||!nav||!main){active=false;return result;}
    const button=document.createElement('button');button.type='button';button.className='secondary config-type-btn';button.dataset.aberrationForgeTab='';button.textContent='Кузница аберраций';button.onclick=()=>{active=true;this.render();};nav.append(button);
    if(active){
      nav.querySelectorAll('.active').forEach(node=>node.classList.remove('active'));button.classList.add('active');
      for(let node=nav.nextElementSibling;node;node=node.nextElementSibling)node.style.display='none';
      const key=App.currentUser.id+':'+campaign();if(!editor||editorKey!==key){editor=build();editorKey=key;}
      main.replaceChildren(editor);
    }
    return result;
  };
})();
