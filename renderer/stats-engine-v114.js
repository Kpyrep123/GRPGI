/* GRPGI v1.0.114 — World Config layout + implant inventory hotfix */
(function(){
  'use strict';
  if(window.__GRPGStatsV114)return;
  window.__GRPGStatsV114=true;

  const normalizeItem = raw => {
    try{return normalizeEquipmentItemV2(raw||{});}catch{return raw||{};}
  };

  function forceNormalImplantInventoryFields(item){
    if(!item || String(item.type||'').toLowerCase()!=='implant')return item;
    item.stackable=false;
    item.stackLimit=1;
    item.textOnlyInventory=false;
    // An implant is a physical inventory item. Preserve explicitly configured mass,
    // but never allow its inventory geometry to collapse into a text-only entry.
    item.inventoryWidth=Math.max(1,Number.parseInt(item.inventoryWidth??item.sizeWidth??1,10)||1);
    item.inventoryHeight=Math.max(1,Number.parseInt(item.inventoryHeight??item.sizeHeight??1,10)||1);
    return item;
  }

  function cleanupPlayerImplantEditors(){
    const form=document.querySelector('#config-editor-form[data-entity-type="players"]');
    if(!form)return;

    // v1052 checkbox installer: remove it entirely, not merely visually hide it.
    Array.from(form.querySelectorAll('.field > label')).forEach(label=>{
      const text=String(label.textContent||'').trim();
      if(text==='Установленные импланты')label.closest('.field')?.remove();
    });

    // v1067 select-based installer is also redundant now that the inventory editor
    // has real implant slots and ownership validation.
    form.querySelectorAll('.implant-slot-editor-v1067').forEach(node=>node.remove());

    const inventoryEditor=form.querySelector('[data-wc-inventory-editor-v1068]');
    if(inventoryEditor){
      const note=inventoryEditor.querySelector('.small-note');
      if(note)note.textContent='Перетащите реальный экземпляр предмета из общего пула в инвентарь. Имплант устанавливается перетаскиванием из инвентаря в слот импланта; снятый имплант остаётся у персонажа.';
    }
  }

  function cleanupImplantItemEditor(){
    const form=document.querySelector('#config-editor-form[data-entity-type="equipment"]');
    if(!form)return;
    const type=String(form.querySelector('select[name="type"]')?.value||form.dataset.itemType||'').toLowerCase();
    form.dataset.itemType=type;
    if(type!=='implant')return;

    ['stackableV113','textOnlyInventoryV113'].forEach(name=>{
      form.querySelector(`input[name="${name}"]`)?.closest('label.consent-line')?.remove();
    });
    form.querySelector('input[name="stackLimitV113"]')?.closest('.field')?.remove();

    Array.from(form.querySelectorAll('.item-specific-v1052[data-for-item="implant"] .small-note')).forEach(note=>{
      if(/установк|персонаж/i.test(note.textContent||'')){
        note.textContent='Имплант является обычным предметом инвентаря. Для активации его нужно установить в свободный слот импланта конкретного персонажа.';
      }
    });
  }

  function cleanupEditors(){
    cleanupPlayerImplantEditors();
    cleanupImplantItemEditor();
  }

  // Configurator is declared with top-level `const` in app.js. Such bindings are
  // visible to later classic scripts but are intentionally not window properties.
  if(typeof Configurator!=='undefined'&&Configurator){
    const render114=Configurator.render?.bind(Configurator);
    if(render114){
      Configurator.render=function(){
        const result=render114();
        cleanupEditors();
        return result;
      };
    }

    const collect114=Configurator.collectEntity?.bind(Configurator);
    if(collect114){
      Configurator.collectEntity=function(type,formEl,formData){
        const entity=collect114(type,formEl,formData);
        if(type==='equipment'&&entity&&String(entity.type||'').toLowerCase()==='implant'){
          forceNormalImplantInventoryFields(entity);
        }
        return entity;
      };
    }
  }

  // Keep data consistent even for existing implants that had one of the v113
  // generic inventory flags accidentally enabled.
  try{
    Object.values(EQUIPMENT||{}).forEach(item=>{
      if(String(item?.type||'').toLowerCase()==='implant')forceNormalImplantInventoryFields(item);
    });
  }catch{}

  document.addEventListener('change',event=>{
    const select=event.target?.closest?.('#config-editor-form[data-entity-type="equipment"] select[name="type"]');
    if(!select)return;
    const form=select.closest('form');
    if(form)form.dataset.itemType=String(select.value||'').toLowerCase();
    queueMicrotask(cleanupImplantItemEditor);
  },true);

  document.addEventListener('DOMContentLoaded',cleanupEditors,{once:true});
})();
