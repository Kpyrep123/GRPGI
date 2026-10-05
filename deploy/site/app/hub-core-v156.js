/* Shared hub rules. No UI or persistence: callers commit the returned player atomically. */
(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value ?? null));
  const ids = value => Array.isArray(value) ? value.filter(Boolean).map(String) : String(value || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  const kind = o => o.kind || (o.type === 'npc' ? 'unit' : o.type === 'zone' ? 'zone' : 'asset');
  const isHub = p => String(p?.locationType || p?.placeType || '').toLowerCase() === 'hub';
  const trader = o => o.trader === undefined ? (o.merchantItemIds || []).length > 0 : o.trader === true;
  function hubOf(planet) {
    const hub = clone(planet?.hub || {});
    if (!hub.maps?.length) hub.maps = [{id:'main', name:'Основная карта', width:1200, height:720, objects:[], spawnPoints:[{id:'default', name:'Вход', x:120, y:360}]}];
    hub.maps.forEach(m => { m.objects ||= []; m.spawnPoints ||= []; m.width = Math.max(640, Number(m.width) || 1200); m.height = Math.max(420, Number(m.height) || 720); });
    hub.dialogs ||= []; hub.dialogs.forEach(d=>{d.nodes ||= [];d.startNodeId ||= d.nodes[0]?.id;d.nodes.forEach(n=>n.choices ||= []);}); hub.prefabs ||= []; hub.flags ||= [];
    hub.defaultMapId ||= hub.maps[0].id;
    return hub;
  }
  function stateFor(player, planet, hub) {
    const old = clone(player.hubState?.planetId === planet.id ? player.hubState : player.hubProgress?.[planet.id] || {});
    const map = hub.maps.find(m => m.id === old.mapId) || hub.maps.find(m => m.id === hub.defaultMapId) || hub.maps[0];
    const spawn = map.spawnPoints.find(s => s.id === old.spawnId) || map.spawnPoints[0] || {x:100,y:100};
    return {...old, planetId:planet.id, mapId:map.id, spawnId:spawn.id || '',
      x:Math.max(0, Math.min(map.width, Number.isFinite(old.x) ? old.x : spawn.x)),
      y:Math.max(0, Math.min(map.height, Number.isFinite(old.y) ? old.y : spawn.y)),
      flags:old.flags || {}, completedDialogs:old.completedDialogs || {}, completedNodes:old.completedNodes || {},
      dialogCursors:old.dialogCursors || {}, completedChoices:old.completedChoices || {}, completedInteractions:old.completedInteractions || {}, objectStates:old.objectStates || {}};
  }
  function storeState(player, state) {
    player.hubState = clone(state);
    player.hubProgress = {...player.hubProgress, [state.planetId]:clone(state)};
  }
  function hasItem(player, id, where = 'either') {
    if (!id) return true;
    const equipped = [...Object.values(player.equipmentSlots || {}), ...(player.implantSlots || [])].some(x => String(x) === String(id));
    const inventory = (player.inventory || []).some(r => String(r.itemId) === String(id) && Number(r.qty) > 0);
    return where === 'equipped' ? equipped : where === 'inventory' ? inventory : inventory || equipped;
  }
  const key = (...parts) => JSON.stringify(parts);
  function reason(rule, player, state, context = {}) {
    const maps = ids(rule.mapIds), objects = ids(rule.objectIds), npcs = ids(rule.npcIds);
    if (maps.length && !maps.includes(state.mapId)) return 'Недоступно на этой карте';
    if (objects.length && !objects.includes(context.object?.id)) return 'Недоступно для этого объекта';
    if (npcs.length && !npcs.includes(context.object?.npcId)) return 'Недоступно этому NPC';
    if (ids(rule.allowedPlayerIds).length && !ids(rule.allowedPlayerIds).includes(player.id)) return 'Нет доступа у персонажа';
    if (rule.requiredFlag && !state.flags[rule.requiredFlag]) return 'Не выполнено условие флага';
    if (rule.requiredItemId && !hasItem(player, rule.requiredItemId, rule.itemLocation)) return 'Нет требуемого предмета';
    if (rule.requiredDialogId && !state.completedDialogs[rule.requiredDialogId]) return 'Сначала завершите предыдущий диалог';
    for (const c of rule.conditions || []) {
      if(!c.id)return 'Условие не настроено';
      let ok = false;
      if (c.type === 'flag') ok = c.value === false ? !state.flags[c.id] : !!state.flags[c.id];
      if (c.type === 'dialog') ok = !!state.completedDialogs[c.id];
      if (c.type === 'item') ok = hasItem(player, c.id, c.location || 'either');
      if (!ok) return c.type === 'item' ? 'Нет требуемого предмета' : c.type === 'dialog' ? 'Сначала завершите предыдущий диалог' : 'Не выполнено условие флага';
    }
    return '';
  }
  function visible(o, p, s) {
    return (!ids(o.visiblePlayerIds).length || ids(o.visiblePlayerIds).includes(p.id)) &&
      hasItem(p, o.visibleRequiredItemId) && (!o.visibleRequiredFlag || !!s.flags[o.visibleRequiredFlag]) && (!o.hiddenAfterFlag || !s.flags[o.hiddenAfterFlag]);
  }
  function access(o, p, s) { return reason(o,p,s,{object:o}) || (o.once && s.completedInteractions[o.id] ? 'Взаимодействие уже завершено' : ''); }
  function dialogReason(d,p,s,o) { return access(o,p,s) || reason(d,p,s,{object:o}) || (d.once && s.completedDialogs[d.id] ? 'Диалог уже завершён' : ''); }
  function nodeReason(d,n,p,s,o) { return reason(n,p,s,{object:o}) || (n.once && s.completedNodes[key(d.id,n.id)] ? 'Колонка уже завершена' : ''); }
  function choiceReason(d,n,c,p,s,o) {
    const why = reason(c,p,s,{object:o}) || (c.once && s.completedChoices[key(d.id,n.id,c.id)] ? 'Действие уже выполнено' : '');
    if (why) return why;
    if (c.nextNodeId) {
      const next = d.nodes.find(x => x.id === c.nextNodeId);
      if (!next) return 'Следующая колонка не найдена';
      const after=clone(s);effects(n,after);effects(c,after);return nodeReason(d,next,p,after,o);
    }
    return '';
  }
  function dialogsFor(hub,o,p,s) {
    const assigned = ids(o.dialogIds || o.dialogId);
    return hub.dialogs.filter(d => assigned.includes(d.id) || ids(d.objectIds).includes(o.id) || (o.npcId && ids(d.npcIds).includes(o.npcId)))
      .filter(d => !dialogReason(d,p,s,o));
  }
  function effects(rule,s) { if (rule.setFlag) s.flags[rule.setFlag] = true; if (rule.clearFlag) delete s.flags[rule.clearFlag]; }
  function finishDialog(d,o,s) {
    s.completedDialogs[d.id] = true;
    if (d.completionFlag) s.flags[d.completionFlag] = true;
    effects(o,s); if (o.once) s.completedInteractions[o.id] = true;
  }
  function advance(hub,objectId,dialogId,nodeId,choiceId,player,state) {
    const o = hub.maps.find(m => m.id === state.mapId)?.objects.find(x => x.id === objectId);
    const d = hub.dialogs.find(x => x.id === dialogId);
    if (!o || !visible(o,player,state) || !d || !dialogsFor(hub,o,player,state).includes(d)) throw new Error('Диалог недоступен');
    const cursorKey=key(d.id,state.mapId,o.id);
    if(nodeId!==(state.dialogCursors[cursorKey]||d.startNodeId))throw new Error('Колонка уже изменилась. Откройте диалог заново.');
    const n = d.nodes.find(x => x.id === nodeId);
    if (!n) throw new Error('Колонка не найдена');
    const blocked = dialogReason(d,player,state,o) || nodeReason(d,n,player,state,o);
    if (blocked) throw new Error(blocked);
    const c = choiceId == null ? null : n.choices.find(x => x.id === choiceId);
    if (choiceId != null && !c) throw new Error('Ответ не найден');
    if (!c && n.choices?.length) throw new Error('Выберите доступный ответ');
    if (c) { const why=choiceReason(d,n,c,player,state,o); if (why) throw new Error(why); }
    effects(n,state); if (c) effects(c,state);
    state.completedNodes[key(d.id,n.id)] = true;
    if (c) state.completedChoices[key(d.id,n.id,c.id)] = true;
    if (!c?.nextNodeId) {finishDialog(d,o,state);delete state.dialogCursors[cursorKey];}
    else state.dialogCursors[cursorKey]=c.nextNodeId;
    return {nextNodeId:c?.nextNodeId || '', articleId:c?.articleId || n.articleId || ''};
  }
  function use(hub,o,p,s) {
    const why=access(o,p,s); if (why) throw new Error(why);
    if (o.type === 'transition') {
      const m=hub.maps.find(m=>m.id===o.targetMapId); if(!m)throw new Error('Целевая карта не найдена');
      const spawn=m.spawnPoints.find(x=>x.id===o.targetSpawnId)||m.spawnPoints[0]; if(!spawn)throw new Error('Точка входа не найдена');
      Object.assign(s,{mapId:m.id,spawnId:spawn.id,x:spawn.x,y:spawn.y});
    } else if(o.type==='door') s.objectStates[o.id]=s.objectStates[o.id]==='open'?'closed':'open';
    else if(!o.articleId&&!o.setFlag&&!o.clearFlag&&!o.once) throw new Error('Действие не настроено');
    effects(o,s); if(o.once)s.completedInteractions[o.id]=true;
  }
  function purchase(hub,o,itemId,p,s,item,canAdd=()=>({ok:true})) {
    const why=access(o,p,s);if(why)throw new Error(why);
    if(!trader(o)||!ids(o.merchantItemIds).includes(itemId)||!item||item.type==='stock')throw new Error('Товар недоступен');
    const cost=Number(item.price ?? item.cost ?? 0),credits=Number(p.credits||0);
    if(!Number.isFinite(cost)||cost<0||!Number.isFinite(credits))throw new Error('Некорректная цена или баланс');
    if(credits<cost)throw new Error('Недостаточно кредитов');
    const room=canAdd(p,itemId,1);if(!room?.ok)throw new Error(room?.reason||'Недостаточно места');
    p.credits=credits-cost;p.inventory ||= [];
    const row=p.inventory.find(r=>r.itemId===itemId);if(row)row.qty=Number(row.qty||0)+1;else p.inventory.push({itemId,qty:1,positions:[]});
    effects(o,s);if(o.once)s.completedInteractions[o.id]=true;
  }
  function canMove(map,state,x,y){
    for(const o of map.objects||[]){
      if(!o.blockMovement||(o.type==='door'&&state.objectStates[o.id]==='open'))continue;
      const w=Number(o.width)||90,h=Number(o.height)||70,cx=(+o.x||0)+w/2,cy=(+o.y||0)+h/2,a=-(+o.rotation||0)*Math.PI/180;
      const point=(x,y)=>({x:(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),y:(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)});
      const p=point(state.x,state.y),q=point(x,y),dx=q.x-p.x,dy=q.y-p.y;
      let low=0,high=1,hit=true;
      for(const [v,min,max] of [[0,-w/2-20,w/2+20],[1,-h/2-20,h/2+20]]){
        const start=v?p.y:p.x,delta=v?dy:dx;
        if(Math.abs(delta)<1e-9){if(start<min||start>max)hit=false;continue;}
        let t1=(min-start)/delta,t2=(max-start)/delta;if(t1>t2)[t1,t2]=[t2,t1];low=Math.max(low,t1);high=Math.min(high,t2);
      }
      if(hit&&low<=high)return false;
    }
    return true;
  }
  function validate(hub) {
    const errors=[],seen=new Set();
    for(const m of hub.maps){if(seen.has(m.id))errors.push('Повтор ID карты: '+m.id);seen.add(m.id);if(!Number.isFinite(+m.width)||+m.width<640||!Number.isFinite(+m.height)||+m.height<420)errors.push('Минимальный размер карты: 640 × 420');}
    if(!hub.maps.some(m=>m.id===hub.defaultMapId))errors.push('Выберите стартовую карту');
    const all=hub.maps.flatMap(m=>m.objects||[]),dialogIds=hub.dialogs.map(d=>d.id);
    for(const o of all){for(const id of ids(o.dialogIds||o.dialogId))if(!dialogIds.includes(id))errors.push('Диалог объекта не найден: '+(o.name||o.id));if(o.type==='transition'&&o.targetMapId&&!hub.maps.some(m=>m.id===o.targetMapId))errors.push('Карта перехода не найдена');}
    const checkConditions=r=>{for(const c of r.conditions||[])if(!c.id||!['flag','dialog','item'].includes(c.type)||(c.type==='dialog'&&!dialogIds.includes(c.id)))errors.push('Незаполненное или неверное условие');};
    all.forEach(checkConditions);
    for(const d of hub.dialogs){checkConditions(d);if(!d.nodes?.some(n=>n.id===d.startNodeId))errors.push('Начальная колонка не найдена: '+d.name);for(const n of d.nodes||[]){checkConditions(n);for(const c of n.choices||[]){checkConditions(c);if(c.nextNodeId&&!d.nodes.some(x=>x.id===c.nextNodeId))errors.push('Переход к удалённой колонке: '+d.name);}}}
    return [...new Set(errors)];
  }
  globalThis.GRPGHubCoreV156={clone,ids,kind,isHub,trader,hubOf,stateFor,storeState,hasItem,key,reason,visible,access,dialogReason,nodeReason,choiceReason,dialogsFor,effects,advance,use,purchase,canMove,validate};
})();
