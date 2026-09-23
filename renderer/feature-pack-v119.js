/* GRPGI v1.0.125 — equipment safeguards and Lua ability behavior editor */
(function(){
  'use strict';
  if(window.__GRPGFeaturePackV119)return;
  window.__GRPGFeaturePackV119=true;

  const text=value=>String(value??'').trim().toLowerCase();
  const integer=(value,fallback=0)=>Number.isFinite(Number(value))?Math.trunc(Number(value)):fallback;
  const isAmmo=item=>['ammo','ammunition','патроны','боеприпасы'].includes(text(item?.type));
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalizeLuaTrigger=value=>text(value)==='reaction'?'reaction':'automatic';
  const ABILITY_BEHAVIORS_V125=new Set(['scripted','no_target','self','unit_target','point','area','aura','persistent_area','toggle_aura']);
  const normalizeAbilityBehaviorV125=value=>ABILITY_BEHAVIORS_V125.has(text(value))?text(value):'scripted';
  const nonNegativeV125=(value,fallback=0)=>Number.isFinite(Number(value))?Math.max(0,Number(value)):fallback;
  const luaFields=raw=>({
    luaScript:String(raw?.luaScript||''),
    luaEnabled:raw?.luaEnabled===true||String(raw?.luaEnabled||'').toLowerCase()==='true',
    luaTriggerMode:normalizeLuaTrigger(raw?.luaTriggerMode),
    luaReactionLabel:String(raw?.luaReactionLabel||'').trim().slice(0,120),
    abilityBehavior:normalizeAbilityBehaviorV125(raw?.abilityBehavior||raw?.behavior),
    castRange:nonNegativeV125(raw?.castRange,1),
    areaRadius:nonNegativeV125(raw?.areaRadius??raw?.aoeRadius,1),
    thinkerDuration:Math.trunc(nonNegativeV125(raw?.thinkerDuration??raw?.durationRounds,1)),
    thinkerInterval:Math.max(1,Math.trunc(nonNegativeV125(raw?.thinkerInterval??raw?.intervalRounds,1))),
    targetRelation:['any','ally','enemy','self'].includes(text(raw?.targetRelation))?text(raw.targetRelation):'any',
    targetPlayers:raw?.targetPlayers!==false,
    targetNpcs:raw?.targetNpcs!==false,
    targetUnits:raw?.targetUnits===true,
    targetAlive:raw?.targetAlive!==false,
    includeSelf:raw?.includeSelf===true,
    thinkerVisibleToPlayers:raw?.thinkerVisibleToPlayers!==false,
    thinkerColor:String(raw?.thinkerColor||'#7df9ff').trim()||'#7df9ff'
  });

  const normalizeBefore119=normalizeEquipmentItemV2;
  normalizeEquipmentItemV2=function(raw={}){
    const next=normalizeBefore119(raw||{});
    Object.assign(next,luaFields(raw));
    if(isAmmo(next)){
      next.type='ammo';
      next.stackable=true;
      next.stackLimit=Math.max(2,integer(raw?.stackLimit??next.stackLimit,999));
    }else{
      next.stackable=false;
      next.stackLimit=1;
    }
    return next;
  };

  try{Object.entries(EQUIPMENT||{}).forEach(([id,item])=>{EQUIPMENT[id]=normalizeEquipmentItemV2(item);});}catch(error){console.warn('FEATURE_PACK_V119_STACK_NORMALIZE',error);}

  const renderEquipmentBefore119=Configurator.renderEquipmentEditor.bind(Configurator);
  Configurator.renderEquipmentEditor=function(raw){
    const item=normalizeEquipmentItemV2(raw||{});
    let markup=renderEquipmentBefore119(item);
    try{
      const template=document.createElement('template');template.innerHTML=markup;
      const form=template.content.querySelector('#config-editor-form')||template.content.querySelector('form');
      const toggle=form?.querySelector('[name="stackableV113"]');
      const limit=form?.querySelector('[name="stackLimitV113"]');
      const ammo=isAmmo(item);
      if(toggle){
        toggle.checked=ammo;
        toggle.disabled=true;
        const title=toggle.closest('.consent-line')?.querySelector('b');
        const note=toggle.closest('.consent-line')?.querySelector('small');
        if(title)title.textContent=ammo?'Патроны складываются в стопки':'Один экземпляр в стопке';
        if(note)note.textContent=ammo?'Одна ячейка содержит несколько патронов до указанного лимита.':'Оружие, броня, гранаты и прочее снаряжение всегда занимают отдельные экземпляры.';
      }
      if(limit){
        limit.value=String(ammo?Math.max(2,integer(item.stackLimit,999)):1);
        limit.min=ammo?'2':'1';
        limit.disabled=!ammo;
      }
      markup=template.innerHTML;
    }catch(error){console.error('FEATURE_PACK_V119_STACK_EDITOR',error);return markup;}
    return injectLuaEditor119(markup,item,'equipment');
  };

  function luaEditorMarkup119(raw={},kind='equipment'){
    const data=luaFields(raw);
    const skill=kind==='skills';
    return `<section class="lua-editor-v119" data-lua-editor-v119>
      <div class="section-title">Lua-скрипт боевой сцены</div>
      <label class="consent-line"><input type="checkbox" name="luaEnabled" ${data.luaEnabled?'checked':''}/><span><b>Исполнять этот скрипт</b><small>Только локальная боевая сцена ДМа. Web-клиент скрипты не исполняет.</small></span></label>
      ${skill?`<div class="section-title">Behavior активного навыка</div>
      <div class="cols3">
        <div class="field"><label>Тип применения</label><select class="select" name="abilityBehavior">
          <option value="scripted" ${data.abilityBehavior==='scripted'?'selected':''}>Определяется Lua</option>
          <option value="no_target" ${data.abilityBehavior==='no_target'?'selected':''}>Без цели</option>
          <option value="self" ${data.abilityBehavior==='self'?'selected':''}>На себя</option>
          <option value="unit_target" ${data.abilityBehavior==='unit_target'?'selected':''}>Одна цель</option>
          <option value="point" ${data.abilityBehavior==='point'?'selected':''}>Точка на карте</option>
          <option value="area" ${data.abilityBehavior==='area'?'selected':''}>Область в точке</option>
          <option value="aura" ${data.abilityBehavior==='aura'?'selected':''}>Аура от владельца</option>
          <option value="persistent_area" ${data.abilityBehavior==='persistent_area'?'selected':''}>Постоянная область (thinker)</option>
          <option value="toggle_aura" ${data.abilityBehavior==='toggle_aura'?'selected':''}>Переключаемая аура</option>
        </select></div>
        <div class="field"><label>Дальность применения</label><input class="input" type="number" min="0" step="1" name="castRange" value="${data.castRange}"/></div>
        <div class="field"><label>Радиус области / ауры</label><input class="input" type="number" min="0" step="1" name="areaRadius" value="${data.areaRadius}"/></div>
      </div>
      <div class="cols3">
        <div class="field"><label>Длительность thinker, раундов</label><input class="input" type="number" min="0" step="1" name="thinkerDuration" value="${data.thinkerDuration}"/><div class="small-note">0 — пока скрипт не вызовет DestroyThinker.</div></div>
        <div class="field"><label>Интервал thinker, раундов</label><input class="input" type="number" min="1" step="1" name="thinkerInterval" value="${data.thinkerInterval}"/></div>
        <div class="field"><label>Отношение к владельцу</label><select class="select" name="targetRelation"><option value="any" ${data.targetRelation==='any'?'selected':''}>Любая</option><option value="ally" ${data.targetRelation==='ally'?'selected':''}>Союзники</option><option value="enemy" ${data.targetRelation==='enemy'?'selected':''}>Противники</option><option value="self" ${data.targetRelation==='self'?'selected':''}>Только владелец</option></select></div>
      </div>
      <div class="lua-behavior-targets-v125">
        <label class="toggle-row"><input type="checkbox" name="targetPlayers" ${data.targetPlayers?'checked':''}/> Персонажи</label>
        <label class="toggle-row"><input type="checkbox" name="targetNpcs" ${data.targetNpcs?'checked':''}/> NPC</label>
        <label class="toggle-row"><input type="checkbox" name="targetUnits" ${data.targetUnits?'checked':''}/> Турели и дроны</label>
        <label class="toggle-row"><input type="checkbox" name="targetAlive" ${data.targetAlive?'checked':''}/> Только живые</label>
        <label class="toggle-row"><input type="checkbox" name="includeSelf" ${data.includeSelf?'checked':''}/> Включать владельца</label>
        <label class="toggle-row"><input type="checkbox" name="thinkerVisibleToPlayers" ${data.thinkerVisibleToPlayers?'checked':''}/> Показывать область игрокам</label>
      </div>
      <div class="field"><label>Цвет области</label><input class="input" name="thinkerColor" value="${safe(data.thinkerColor)}" placeholder="#7df9ff"/></div>
      <div class="small-note">Для старых скриптов оставьте «Определяется Lua». GetBehavior может переопределить выбранный тип непосредственно из кода.</div>`:''}
      ${skill?'':`<div class="cols2"><div class="field"><label>Режим срабатывания</label><select class="select" name="luaTriggerMode"><option value="automatic" ${data.luaTriggerMode==='automatic'?'selected':''}>Автоматически</option><option value="reaction" ${data.luaTriggerMode==='reaction'?'selected':''}>Реакция — выбор ДМа</option></select></div><div class="field"><label>Название в окне реакции</label><input class="input" name="luaReactionLabel" value="${safe(data.luaReactionLabel)}" placeholder="Например: Закрыть союзника щитом"/></div></div>`}
      <div class="field"><label>Код Lua 5.4</label><textarea class="area lua-code-v119" name="luaScript" spellcheck="false" placeholder="function BeforeDamage(self, params)\n  ReduceDamage(2)\nend">${safe(data.luaScript)}</textarea></div>
      <div class="lua-editor-actions-v119"><button class="secondary" type="button" data-validate-lua-v119>ПРОВЕРИТЬ КОД</button><span class="small-note" data-lua-status-v119>Hook определяется названием функции: OnHit, BeforeDamage, OnAbilityPhaseStart и другие.</span></div>
    </section>`;
  }
  function injectLuaEditor119(markup,raw,kind){
    if(String(markup).includes('data-lua-editor-v119'))return markup;
    const block=luaEditorMarkup119(raw,kind);
    const save=kind==='skills'?'SAVE_SKILL':'SAVE_ITEM';
    const needle=`<button class="primary" type="submit">${save}</button>`;
    return String(markup).includes(needle)?String(markup).replace(needle,block+needle):String(markup)+block;
  }

  const renderSkillBefore119=Configurator.renderSkillEditor?.bind(Configurator);
  if(renderSkillBefore119)Configurator.renderSkillEditor=function(raw){return injectLuaEditor119(renderSkillBefore119(raw),raw,'skills');};

  const collectBefore119=Configurator.collectEntity.bind(Configurator);
  Configurator.collectEntity=function(type,form,fd=new FormData(form)){
    let entity=collectBefore119(type,form,fd);
    if(!entity||!['equipment','skills'].includes(type))return entity;
    entity.luaScript=String(fd.get('luaScript')||'');
    entity.luaEnabled=fd.get('luaEnabled')==='on';
    entity.luaReactionLabel=String(fd.get('luaReactionLabel')||'').trim().slice(0,120);
    entity.luaTriggerMode=type==='skills'?(text(entity.activationType)==='reaction'?'reaction':'automatic'):normalizeLuaTrigger(fd.get('luaTriggerMode'));
    if(type==='skills')Object.assign(entity,luaFields({
      ...entity,
      luaScript:entity.luaScript,
      luaEnabled:entity.luaEnabled,
      luaReactionLabel:entity.luaReactionLabel,
      luaTriggerMode:entity.luaTriggerMode,
      abilityBehavior:fd.get('abilityBehavior'),
      castRange:fd.get('castRange'),
      areaRadius:fd.get('areaRadius'),
      thinkerDuration:fd.get('thinkerDuration'),
      thinkerInterval:fd.get('thinkerInterval'),
      targetRelation:fd.get('targetRelation'),
      targetPlayers:fd.get('targetPlayers')==='on',
      targetNpcs:fd.get('targetNpcs')==='on',
      targetUnits:fd.get('targetUnits')==='on',
      targetAlive:fd.get('targetAlive')==='on',
      includeSelf:fd.get('includeSelf')==='on',
      thinkerVisibleToPlayers:fd.get('thinkerVisibleToPlayers')==='on',
      thinkerColor:fd.get('thinkerColor')
    }));
    return type==='equipment'?normalizeEquipmentItemV2(entity):entity;
  };

  function reassertSkillLua119(entity={}){
    if(!entity.id)return;
    const fields=luaFields({...entity,luaTriggerMode:text(entity.activationType)==='reaction'?'reaction':'automatic'});
    if(Data?.skills?.[entity.id])Object.assign(Data.skills[entity.id],fields);
    if(worldData?.skills?.SKILLS?.[entity.id])Object.assign(worldData.skills.SKILLS[entity.id],fields);
  }
  const insertBefore119=Configurator.insertEntity.bind(Configurator);
  Configurator.insertEntity=function(type,entity){
    const fields=type==='skills'?luaFields(entity):null;
    const result=insertBefore119(type,entity);
    if(type==='skills')reassertSkillLua119({...entity,...fields});
    return result;
  };
  const applyWorldBefore119=applyWorldData;
  applyWorldData=function(payload={}){
    const skillLua=Object.fromEntries(Object.entries(payload?.skills?.SKILLS||{}).map(([id,row])=>[id,luaFields(row)]));
    const result=applyWorldBefore119(payload);
    Object.entries(skillLua).forEach(([id,fields])=>reassertSkillLua119({id,...fields,activationType:Data?.skills?.[id]?.activationType}));
    Object.entries(EQUIPMENT||{}).forEach(([id,item])=>{EQUIPMENT[id]=normalizeEquipmentItemV2(item);});
    return result;
  };

  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-validate-lua-v119]');
    if(!button)return;
    event.preventDefault();
    const editor=button.closest('[data-lua-editor-v119]'),status=editor?.querySelector('[data-lua-status-v119]');
    const script=String(editor?.querySelector('[name="luaScript"]')?.value||'');
    if(status)status.textContent='Проверка…';
    button.disabled=true;
    try{
      const result=await window.electronAPI?.validateCombatLua?.({script});
      if(!result?.ok)throw new Error(result?.message||'Код не прошёл проверку');
      const hooks=Array.isArray(result.hooks)?result.hooks:[];
      if(status){status.textContent=hooks.length?`Код корректен. Hooks: ${hooks.join(', ')}`:'Код корректен, но поддерживаемые hooks не найдены.';status.classList.toggle('ok',hooks.length>0);status.classList.toggle('err',false);}
    }catch(error){if(status){status.textContent=`Ошибка: ${error?.message||error}`;status.classList.add('err');status.classList.remove('ok');}}
    finally{button.disabled=false;}
  },true);

  window.GRPGFeaturePackV119=Object.freeze({version:'1.0.125',isAmmo,luaFields,normalizeLuaTrigger,normalizeAbilityBehavior:normalizeAbilityBehaviorV125});
})();
