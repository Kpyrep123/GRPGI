/* World Config catalog. The existing editor and quick list remain the entry points for changes. */
(() => {
  'use strict';
  const panes = new Map();
  let catalogType = '';
  const sortText = new Intl.Collator('ru', {numeric:true, sensitivity:'base'});
  const order = (a,b) => sortText.compare(a,b);
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const name = (item,type) => configEntityPrimaryNameV1061(item,type) || item.id;
  const typeLabel = item => itemTypeLabelV2(item.type);
  const planet = item => PLANETS[item.currentPlanetId || item.planetId]?.name || text(item.currentPlanetId || item.planetId);
  const facetsByType = {
    equipment: [['Тип', typeLabel], ['Редкость', item => text(item.rarity)], ['Категория', item => text(item.category)]],
    npcs: [['Локация', item => text(item.location) || planet(item)], ['Роль', item => text(item.role)]],
    players: [['Планета', planet], ['Роль', item => text(item.role)], ['Статус', item => text(item.approvalStatus)]],
    planets: [['Система', item => text(item.location?.system)], ['Тип', item => text(item.physics?.type)]],
    systems: [['Рукав', item => text(item.arm || item.location?.arm)]],
    geographicOrigins: [['Тип места', item => text(item.locationType)]],
    skills: [['Ветка', item => text(item.treeBranch || item.branch)], ['Тип', item => text(item.skillType || item.type)]]
  };
  const commonFacets = [['Категория', item => text(item.category)], ['Тип', item => text(item.type)], ['Статус', item => text(item.status)]];
  function catalogItems(type){
    if(type==='equipment')return Object.values(EQUIPMENT || {}).map(normalizeEquipmentItemV2);
    return Configurator.getItems(type);
  }
  function showCatalog(panel,type){
    const items=catalogItems(type);
    const facets=(facetsByType[type]||commonFacets).filter(([,get])=>items.some(item=>get(item)));
    if(!panes.has(type))panes.set(type,{query:'',group:'',filter:''});
    const state=panes.get(type);
    if(state.group&&!facets.some(([label])=>label===state.group)){state.group='';state.filter='';}
    panel.innerHTML=`<section class="config-catalog" aria-labelledby="config-catalog-title">
      <h2 id="config-catalog-title">${esc(WORLD_SECTIONS[type].label)}</h2>
      <div class="config-catalog-controls">
        <label>Поиск<input class="input" data-catalog-search value="${esc(state.query)}" placeholder="Название или параметр"></label>
        <label>Группировка<select class="select" data-catalog-group><option value="">По названию</option>${facets.map(([label])=>`<option value="${esc(label)}">${esc(label)}</option>`).join('')}</select></label>
        <label data-catalog-filter-field hidden>Значение<select class="select" data-catalog-filter></select></label>
      </div>
      <div data-catalog-results></div>
    </section>`;
    const search=panel.querySelector('[data-catalog-search]'),group=panel.querySelector('[data-catalog-group]'),filter=panel.querySelector('[data-catalog-filter]'),results=panel.querySelector('[data-catalog-results]');
    group.value=state.group;
    function draw(){
      const get=facets.find(([label])=>label===state.group)?.[1];
      const groups=new Map(),query=state.query.trim().toLowerCase();
      for(const item of items){
        if(query&&!configSearchMatchV1061(item,type,query).matched&&!facets.some(([,value])=>value(item).toLowerCase().includes(query)))continue;
        const key=get?(get(item)||'Без значения'):'';
        if(state.filter&&state.filter!==key)continue;
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(item);
      }
      results.innerHTML=[...groups].sort(([a],[b])=>order(a,b)).map(([key,rows])=>`${key?`<h3>${esc(key)}</h3>`:''}<div class="config-catalog-tiles">${rows.sort((a,b)=>order(name(a,type),name(b,type))).map(item=>{
        const detail=facets.map(([,value])=>value(item)).filter((value,index,all)=>value&&value!==key&&all.indexOf(value)===index).slice(0,2).join(' · ');
        return `<button type="button" class="config-catalog-tile" data-catalog-id="${esc(item.id)}">${renderThumb(item,{size:'md',label:name(item,type)})}<strong>${esc(name(item,type))}</strong>${detail?`<small>${esc(detail)}</small>`:''}</button>`;
      }).join('')}</div>`).join('')||'<p class="subtle">Ничего не найдено</p>';
    }
    function updateFilter(){
      const get=facets.find(([label])=>label===state.group)?.[1];
      const values=get?[...new Set(items.map(item=>get(item)||'Без значения'))].sort(order):[];
      if(!values.includes(state.filter))state.filter='';
      filter.parentElement.hidden=!values.length;
      filter.innerHTML='<option value="">Все</option>'+values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
      filter.value=state.filter;
    }
    search.addEventListener('input',()=>{state.query=search.value;draw();});
    group.addEventListener('change',()=>{state.group=group.value;state.filter='';updateFilter();draw();});
    filter.addEventListener('change',()=>{state.filter=filter.value;draw();});
    results.addEventListener('click',event=>{
      const tile=event.target.closest('[data-catalog-id]');
      const item=tile&&items.find(row=>String(row.id)===tile.dataset.catalogId);
      if(!item)return;
      if(type==='equipment')Configurator.equipmentCategoryV1052=item.type;
      if(!configSearchMatchV1061(item,type,String(Configurator.searchQuery||'').trim().toLowerCase()).matched)Configurator.searchQuery='';
      Configurator.selectedId=item.id;
      catalogType='';
      Configurator.render();
    });
    updateFilter();draw();
  }

  const renderEditor=Configurator.renderEditor;
  Configurator.renderEditor=function(...args){
    return catalogType===this.selectedType?'':renderEditor.apply(this,args);
  };
  const render=Configurator.render;
  Configurator.render=function(...args){
    const previousPanel=document.querySelector('#config-content .config-main');
    const result=render.apply(this,args);
    const panel=document.querySelector('#config-content .config-main');
    if(!panel||panel===previousPanel)return result;
    if(catalogType===this.selectedType)showCatalog(panel,catalogType);
    else panel.insertAdjacentHTML('afterbegin','<button type="button" class="secondary config-catalog-back" data-catalog-back>К каталогу</button>');
    return result;
  };
  document.addEventListener('click',event=>{
    const target=event.target;
    const category=target.closest?.('#config-content .config-type-btn[data-type]');
    if(category){
      catalogType=category.dataset.type;
      if(Configurator.selectedType!==catalogType)Configurator.searchQuery='';
      return;
    }
    if(target.closest?.('#config-content [data-catalog-back]')){
      catalogType=Configurator.selectedType;
      Configurator.render();
      return;
    }
    if(target.closest?.('#config-content #config-add-btn, #config-content .config-entity-list [data-config-id]')&&!target.closest('[data-config-favorite-v182]'))catalogType='';
  },true);
})();
