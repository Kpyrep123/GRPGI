(() => {
  'use strict';
  const api = window.GRPGAberrationRoll;
  const catalog = window.GRPGAberrationCatalog;
  const rarityNames = ['Обычное', 'Необычное', 'Редкое', 'Эпическое', 'Легендарное'];
  const categories = {weapon:'Оружие',armor:'Броня',shield:'Щиты',backpack:'Рюкзаки',implant:'Импланты'};
  const storageKey = () => 'grpgi.aberrations:' + String(Sync.config?.campaignId || 'local');

  function settings() {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || '{}');
    return { chances:saved.chances || api.defaultChances.map(row=>row.slice()), variants:saved.variants || {} };
  }

  function openCatalog() {
    if (App.currentUser?.role !== 'gm') return;
    const key = storageKey();
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
        <details><summary>${esc(effect.name)}</summary>
        <p>${esc([effect.scope,effect.rule].filter(Boolean).join(' · '))}</p>
        ${effect.variants.map(variant=>{
          const saved = draft.variants[variant.id] || variant;
          return `<div class="row" data-variant="${variant.id}"><label>Значение <input class="input" data-field="value" value="${esc(saved.value)}"></label>
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
      if (value.trim() && Number.isSafeInteger(cost)) draft.variants[row.dataset.variant]={value:value.trim(),cost};
    });
    category.addEventListener('change',drawEffects);
    dialog.querySelector('[data-aberration-close]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=event=>{
      event.preventDefault();
      if (App.currentUser?.role!=='gm' || storageKey()!==key) return;
      try { localStorage.setItem(key,JSON.stringify(draft));dialog.close(); }
      catch (error) { Toast.show(error.message,'err'); }
    };
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    drawChances();drawEffects();
    document.body.append(dialog);
    dialog.showModal();
  }

  const render = Configurator.render;
  Configurator.render = function (...args) {
    const result = render.apply(this,args);
    const panel = document.querySelector('#config-content .config-main');
    if (panel && App.currentUser?.role==='gm' && !panel.querySelector('[data-aberration-catalog]')) {
      const button=document.createElement('button');
      button.className='secondary';button.type='button';button.dataset.aberrationCatalog='';
      button.textContent='Аберрации';button.onclick=openCatalog;
      panel.prepend(button);
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
