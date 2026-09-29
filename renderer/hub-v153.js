(() => {
  'use strict';
  const VERSION = 153;
  const TYPES = {decor:'Декорация',label:'Надпись',terminal:'Терминал',door:'Дверь',transition:'Переход',npc:'NPC',item:'Объект'};
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
  const copy = value => JSON.parse(JSON.stringify(value ?? null));
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lines = value => String(value || '').split(/[\n,]/).map(v => v.trim()).filter(Boolean);
  const asHub = planet => {
    const raw = planet?.hub && typeof planet.hub === 'object' ? planet.hub : {};
    const maps = Array.isArray(raw.maps) && raw.maps.length ? raw.maps : [{id:'main',name:'Основная карта',background:'',width:1200,height:720,spawnPoints:[{id:'default',name:'Вход',x:120,y:360}],objects:[]}];
    return {version:VERSION,defaultMapId:raw.defaultMapId || maps[0].id,maps,dialogs:Array.isArray(raw.dialogs)?raw.dialogs:[]};
  };
  const locationType = planet => String(planet?.locationType || planet?.placeType || 'planet').toLowerCase();
  const isHub = planet => locationType(planet) === 'hub';
  const playerHas = (player,id) => !id || (player?.inventory || []).some(row => String(row.itemId)===String(id) && Number(row.qty || 0)>0);
  const stateFor = (player,planet,hub) => {
    const current = player?.hubState && player.hubState.planetId===planet.id ? copy(player.hubState) : {};
    const map = hub.maps.find(row => row.id===current.mapId) || hub.maps.find(row => row.id===hub.defaultMapId) || hub.maps[0];
    const spawn = map?.spawnPoints?.find(row => row.id===current.spawnId) || map?.spawnPoints?.[0] || {x:100,y:100};
    return {planetId:planet.id,mapId:map?.id||'',spawnId:current.spawnId||spawn.id||'',x:Number.isFinite(+current.x)?+current.x:+spawn.x||100,y:Number.isFinite(+current.y)?+current.y:+spawn.y||100,flags:current.flags||{},completedDialogs:current.completedDialogs||{},completedInteractions:current.completedInteractions||{},objectStates:current.objectStates||{}};
  };
  const visible = (object,player,state) => {
    const ids = Array.isArray(object.visiblePlayerIds)?object.visiblePlayerIds:lines(object.visiblePlayerIds);
    if(ids.length && !ids.includes(player.id)) return false;
    if(object.visibleRequiredItemId && !playerHas(player,object.visibleRequiredItemId)) return false;
    if(object.visibleRequiredFlag && !state.flags[object.visibleRequiredFlag]) return false;
    if(object.hiddenAfterFlag && state.flags[object.hiddenAfterFlag]) return false;
    return true;
  };
  const allowed = (object,player,state) => {
    const ids = Array.isArray(object.allowedPlayerIds)?object.allowedPlayerIds:lines(object.allowedPlayerIds);
    if(ids.length && !ids.includes(player.id)) return [false,'Этот объект вам недоступен.'];
    if(object.requiredItemId && !playerHas(player,object.requiredItemId)) return [false,`Требуется предмет: ${object.requiredItemId}`];
    if(object.requiredFlag && !state.flags[object.requiredFlag]) return [false,'Условие взаимодействия ещё не выполнено.'];
    if(object.once && state.completedInteractions[object.id]) return [false,'Взаимодействие уже завершено.'];
    return [true,''];
  };
  const currentPlanet = () => Data.getPlanet(App.currentUser?.currentPlanetId) || null;
  let runtime = null;
  let saveTimer = null;

  function saveState(notice=''){
    if(!runtime || !App.currentUser) return;
    App.currentUser.hubState=copy(runtime.state);
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>PlayerSync.pushPlayerPatch(App.currentUser.id,{hubState:copy(runtime.state)},{notice:notice||null,rerender:false}).catch(error=>Toast.show(error.message,'err')),220);
  }
  function article(id){
    if(!id) return Toast.show('Для терминала не выбрана статья','info');
    UI.closeModule(); UI.openModule('wiki',{preserveWikiState:true});
    setTimeout(()=>Wiki.showEntity('article',id,true),0);
  }
  function mapMarkup(map,player,state,editor=false){
    const objects=(map.objects||[]).filter(object=>editor||visible(object,player,state));
    return `<div class="hub-map-v153" data-hub-map-v153 style="width:${Math.max(640,+map.width||1200)}px;height:${Math.max(420,+map.height||720)}px;${map.background?`background-image:url('${safe(map.background)}')`:''}">
      <div class="hub-grid-v153"></div>${objects.map(object=>`<button class="hub-object-v153" data-hub-object-v153="${safe(object.id)}" data-type="${safe(object.type||'decor')}" style="left:${+object.x||0}px;top:${+object.y||0}px;width:${Math.max(24,+object.width||90)}px;height:${Math.max(24,+object.height||70)}px;z-index:${+object.zIndex||1};transform:rotate(${+object.rotation||0}deg)" title="${safe(object.description||object.name||'')}">${object.image?`<img src="${safe(object.image)}" alt="">`:''}<span>${safe(object.name||TYPES[object.type]||'Объект')}</span></button>`).join('')}
      ${editor?'':`<div class="hub-player-v153" style="left:${state.x}px;top:${state.y}px">${safe((player.displayName||player.name||player.id||'?').slice(0,1).toUpperCase())}</div>`}
    </div>`;
  }
  function renderRuntime(){
    const root=document.getElementById('hub-content-v153'),planet=currentPlanet(),player=App.currentUser;
    const dock=document.getElementById('open-hub-v153'); dock?.classList.toggle('hidden',!isHub(planet));
    if(!root) return;
    if(!planet||!isHub(planet)){root.innerHTML='<div class="hub-empty-v153">Персонаж сейчас не находится в хабе.</div>';return;}
    const hub=asHub(planet),state=runtime?.planet?.id===planet.id?runtime.state:stateFor(player,planet,hub),map=hub.maps.find(row=>row.id===state.mapId)||hub.maps[0];
    runtime={planet,hub,state,map,selected:null};
    document.getElementById('hub-subtitle-v153').textContent=`${planet.name||planet.id} · ${map?.name||'Карта'}`;
    root.innerHTML=`<div class="hub-shell-v153"><div class="hub-map-wrap-v153">${mapMarkup(map,player,state)}</div><aside class="hub-panel-v153"><div class="hub-card-v153"><b>${safe(planet.name||planet.id)}</b><div class="small-note">${safe(map?.name||'Карта')}</div></div><div id="hub-object-info-v153" class="hub-card-v153"><div class="small-note">Нажмите на объект для взаимодействия. Нажмите на свободное место карты, чтобы переместиться.</div></div><div class="hub-card-v153"><div class="small-note">Другие игроки скрыты. Положение и прогресс синхронизируются с вашим профилем.</div></div></aside></div>`;
    bindRuntime();
  }
  function bindRuntime(){
    const root=document.getElementById('hub-content-v153'),mapEl=root?.querySelector('[data-hub-map-v153]'); if(!mapEl)return;
    mapEl.addEventListener('click',event=>{
      if(event.target.closest('[data-hub-object-v153]'))return;
      const rect=mapEl.getBoundingClientRect();runtime.state.x=Math.max(0,Math.min(runtime.map.width,event.clientX-rect.left));runtime.state.y=Math.max(0,Math.min(runtime.map.height,event.clientY-rect.top));
      const token=mapEl.querySelector('.hub-player-v153');token.style.left=`${runtime.state.x}px`;token.style.top=`${runtime.state.y}px`;saveState();
    });
    mapEl.querySelectorAll('[data-hub-object-v153]').forEach(node=>node.addEventListener('click',event=>{event.stopPropagation();selectRuntimeObject(node.dataset.hubObjectV153);}));
  }
  function selectRuntimeObject(id){
    const object=runtime.map.objects.find(row=>row.id===id);if(!object)return;runtime.selected=object;
    const [ok,reason]=allowed(object,App.currentUser,runtime.state),info=document.getElementById('hub-object-info-v153');
    const actions=[];
    if(object.description)actions.push(`<button class="secondary" data-hub-action="inspect">ОСМОТРЕТЬ</button>`);
    if(['door','terminal','transition','item'].includes(object.type))actions.push(`<button class="primary" data-hub-action="use">ИСПОЛЬЗОВАТЬ</button>`);
    if(object.type==='npc'&&object.dialogId)actions.push(`<button class="primary" data-hub-action="talk">ГОВОРИТЬ</button>`);
    if(object.type==='npc'&&(object.merchantItemIds||[]).length)actions.push(`<button class="secondary" data-hub-action="trade">ТОРГОВАТЬ</button>`);
    info.innerHTML=`<b>${safe(object.name||TYPES[object.type]||object.id)}</b><div class="small-note" style="margin:8px 0">${safe(object.description||'Нет описания.')}</div>${ok?'':`<div class="status-line err">${safe(reason)}</div>`}<div class="hub-actions-v153">${actions.join('')}</div>`;
    info.querySelectorAll('[data-hub-action]').forEach(button=>button.addEventListener('click',()=>runAction(object,button.dataset.hubAction)));
  }
  function runAction(object,action){
    if(action==='inspect')return modal(object.name,`<p>${safe(object.description||'Нечего осматривать.')}</p>`);
    const [ok,reason]=allowed(object,App.currentUser,runtime.state);if(!ok)return Toast.show(reason,'err');
    if(action==='talk')return openDialog(object.dialogId);
    if(action==='trade')return openMerchant(object);
    if(object.type==='terminal')article(object.articleId);
    else if(object.type==='door'){runtime.state.objectStates[object.id]=runtime.state.objectStates[object.id]==='open'?'closed':'open';Toast.show(runtime.state.objectStates[object.id]==='open'?'Дверь открыта':'Дверь закрыта','ok');}
    else if(object.type==='transition')transition(object);
    else if(object.articleId)article(object.articleId);
    if(object.setFlag)runtime.state.flags[object.setFlag]=true;
    if(object.once)runtime.state.completedInteractions[object.id]=true;
    saveState();
  }
  function transition(object){
    const map=runtime.hub.maps.find(row=>row.id===object.targetMapId);if(!map)return Toast.show('Целевая карта не найдена','err');
    const spawn=map.spawnPoints?.find(row=>row.id===object.targetSpawnId)||map.spawnPoints?.[0]||{x:100,y:100};Object.assign(runtime.state,{mapId:map.id,spawnId:spawn.id||'',x:+spawn.x||100,y:+spawn.y||100});saveState();renderRuntime();
  }
  function modal(title,body){
    document.querySelector('.hub-modal-v153')?.remove();const node=document.createElement('div');node.className='hub-modal-v153';node.innerHTML=`<div class="hub-modal-card-v153"><div class="row" style="justify-content:space-between"><h3>${safe(title||'Хаб')}</h3><button class="secondary" data-close>ЗАКРЫТЬ</button></div>${body}</div>`;document.body.append(node);node.addEventListener('click',e=>{if(e.target===node||e.target.closest('[data-close]'))node.remove();});return node;
  }
  function openDialog(id){
    const dialog=runtime.hub.dialogs.find(row=>row.id===id);if(!dialog)return Toast.show('Диалог не найден','err');
    if(dialog.requiredFlag&&!runtime.state.flags[dialog.requiredFlag])return Toast.show('Диалог пока недоступен','info');
    if(dialog.once&&runtime.state.completedDialogs[id])return Toast.show('Этот разговор уже завершён','info');
    const node=modal(dialog.name||'Диалог',`<div id="hub-dialog-v153"></div>`);let nodeId=dialog.startNodeId||dialog.nodes?.[0]?.id;
    const draw=()=>{const step=dialog.nodes?.find(row=>row.id===nodeId);const host=node.querySelector('#hub-dialog-v153');if(!step){finish();return;}host.innerHTML=`<div class="hub-dialog-line-v153"><b>${safe(step.speaker||'Собеседник')}</b><p>${safe(step.text||'')}</p></div><div class="hub-actions-v153">${(step.choices||[]).map(choice=>`<button class="secondary" data-choice="${safe(choice.id)}">${safe(choice.text||'Продолжить')}</button>`).join('')||'<button class="primary" data-finish>ЗАВЕРШИТЬ</button>'}</div>`;host.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{const choice=step.choices.find(row=>row.id===btn.dataset.choice);applyEffects(choice);nodeId=choice?.nextNodeId||'';draw();});host.querySelector('[data-finish]')?.addEventListener('click',finish);};
    const applyEffects=choice=>{if(choice?.setFlag)runtime.state.flags[choice.setFlag]=true;if(choice?.articleId)article(choice.articleId);};
    const finish=()=>{if(dialog.once)runtime.state.completedDialogs[id]=true;if(dialog.completionFlag)runtime.state.flags[dialog.completionFlag]=true;saveState('Диалог завершён');node.remove();};draw();
  }
  function openMerchant(object){
    const ids=object.merchantItemIds||[],rows=ids.map(id=>{const item=Data.getItem(id);const price=Number(item?.price||item?.cost||0);return `<div class="hub-card-v153 row" style="justify-content:space-between"><div><b>${safe(item?.name||id)}</b><div class="small-note">${price} кр.</div></div><button class="primary" data-buy="${safe(id)}" data-price="${price}">КУПИТЬ</button></div>`;}).join('');
    const node=modal(object.name||'Торговец',rows||'<p>У торговца нет товаров.</p>');node.querySelectorAll('[data-buy]').forEach(button=>button.onclick=async()=>{const id=button.dataset.buy,price=+button.dataset.price||0,user=App.currentUser;if(+user.credits<price)return Toast.show('Недостаточно кредитов','err');user.credits-=price;const row=(user.inventory||[]).find(entry=>entry.itemId===id);if(row)row.qty=(+row.qty||0)+1;else(user.inventory||(user.inventory=[])).push({itemId:id,qty:1,positions:[]});await PlayerSync.pushPlayerPatch(user.id,{credits:user.credits,inventory:copy(user.inventory)},{notice:'Покупка завершена',rerender:false});});
  }

  function enhanceConfigurator(){
    if(typeof Configurator==='undefined')return;
    const oldRender=Configurator.renderPlanetEditor.bind(Configurator),oldCollect=Configurator.collectEntity.bind(Configurator),oldRenderAll=Configurator.render.bind(Configurator);
    Configurator.renderPlanetEditor=function(planet){
      let html=oldRender(planet);const block=`<div class="section-title">Тип локации</div><div class="cols2"><div class="field"><label>Режим</label><select class="select" name="locationTypeV153"><option value="planet" ${!isHub(planet)?'selected':''}>Планета</option><option value="hub" ${isHub(planet)?'selected':''}>Хаб</option></select></div><div class="field"><label>Конструктор хаба</label><button type="button" class="secondary" id="hub-builder-open-v153">ОТКРЫТЬ КОНСТРУКТОР</button><div class="small-note">Карты: ${asHub(planet).maps.length} · диалоги: ${asHub(planet).dialogs.length}</div></div></div>`;return html.replace('<div class="section-title">Локация</div>',block+'<div class="section-title">Локация</div>');
    };
    Configurator.collectEntity=function(type,form,data){const current=this.getSelectedEntity(),entity=oldCollect(type,form,data);if(type==='planets'&&entity){entity.locationType=String(data.get('locationTypeV153')||current?.locationType||'planet');entity.hub=copy(current?.hub||asHub(current));}return entity;};
    Configurator.render=function(){const result=oldRenderAll();document.getElementById('hub-builder-open-v153')?.addEventListener('click',()=>openBuilder(this.getSelectedEntity()));return result;};
  }
  let builder=null;
  function openBuilder(planet){if(!planet)return;builder={planet,hub:asHub(planet),mapId:'',selectedId:''};builder.mapId=builder.hub.defaultMapId||builder.hub.maps[0].id;drawBuilder();}
  function drawBuilder(){
    document.getElementById('hub-builder-v153')?.remove();const map=builder.hub.maps.find(row=>row.id===builder.mapId)||builder.hub.maps[0],selected=map.objects.find(row=>row.id===builder.selectedId);const node=document.createElement('div');node.id='hub-builder-v153';node.className='hub-builder-v153';node.innerHTML=`<div class="hub-builder-head-v153"><b>КОНСТРУКТОР · ${safe(builder.planet.name)}</b><button class="secondary" data-add-map>+ КАРТА</button><button class="secondary" data-copy-map>ДУБЛИРОВАТЬ</button><button class="secondary" data-dialogs>ДИАЛОГИ</button><span style="flex:1"></span><button class="primary" data-save>СОХРАНИТЬ</button><button class="secondary" data-close>ЗАКРЫТЬ</button></div><div class="hub-builder-body-v153"><aside class="hub-builder-side-v153"><div class="section-title">Карты</div><div class="hub-list-v153">${builder.hub.maps.map(row=>`<button class="secondary ${row.id===map.id?'active':''}" data-map="${safe(row.id)}">${safe(row.name)}</button>`).join('')}</div><div class="section-title" style="margin-top:14px">Добавить объект</div>${Object.entries(TYPES).map(([id,name])=>`<button class="secondary" style="width:100%;margin:3px 0" data-add-object="${id}">+ ${name}</button>`).join('')}</aside><main class="hub-builder-canvas-v153">${mapMarkup(map,App.currentUser||{}, {flags:{}},true)}</main><aside class="hub-builder-side-v153"><div class="section-title">Карта</div>${mapForm(map)}<div class="section-title" style="margin-top:14px">Объект</div>${selected?objectForm(selected):'<div class="small-note">Выберите объект на карте.</div>'}</aside></div>`;document.body.append(node);bindBuilder(node,map);}
  function mapForm(map){return `<div class="hub-form-v153"><label>Название</label><input class="input" data-map-field="name" value="${safe(map.name)}"><label>Фон (URL/data)</label><input class="input" data-map-field="background" value="${safe(map.background||'')}"><label>Размер</label><div class="row"><input class="input" type="number" data-map-field="width" value="${+map.width||1200}"><input class="input" type="number" data-map-field="height" value="${+map.height||720}"></div><label>Точки появления (id|имя|x|y)</label><textarea class="area" data-spawns>${(map.spawnPoints||[]).map(s=>`${s.id}|${s.name}|${s.x}|${s.y}`).join('\n')}</textarea></div>`;}
  function objectForm(o){return `<div class="hub-form-v153"><label>Тип</label><select class="select" data-object-field="type">${Object.entries(TYPES).map(([id,n])=>`<option value="${id}" ${o.type===id?'selected':''}>${n}</option>`).join('')}</select><label>Название</label><input class="input" data-object-field="name" value="${safe(o.name||'')}"><label>Описание</label><textarea class="area" data-object-field="description">${safe(o.description||'')}</textarea><label>Изображение</label><input class="input" data-object-field="image" value="${safe(o.image||'')}"><label>Позиция X/Y · размер W/H</label><div class="row"><input class="input" type="number" data-object-field="x" value="${+o.x||0}"><input class="input" type="number" data-object-field="y" value="${+o.y||0}"><input class="input" type="number" data-object-field="width" value="${+o.width||90}"><input class="input" type="number" data-object-field="height" value="${+o.height||70}"></div><label>Статья / диалог / целевая карта / точка</label><input class="input" data-object-field="articleId" placeholder="articleId" value="${safe(o.articleId||'')}"><input class="input" data-object-field="dialogId" placeholder="dialogId" value="${safe(o.dialogId||'')}"><input class="input" data-object-field="targetMapId" placeholder="targetMapId" value="${safe(o.targetMapId||'')}"><input class="input" data-object-field="targetSpawnId" placeholder="targetSpawnId" value="${safe(o.targetSpawnId||'')}"><label>Товары NPC (ID через запятую)</label><input class="input" data-object-list="merchantItemIds" value="${safe((o.merchantItemIds||[]).join(', '))}"><label>Доступ: предмет / флаг</label><input class="input" data-object-field="requiredItemId" placeholder="requiredItemId" value="${safe(o.requiredItemId||'')}"><input class="input" data-object-field="requiredFlag" placeholder="requiredFlag" value="${safe(o.requiredFlag||'')}"><label>Видимость: игроки / предмет / флаг</label><input class="input" data-object-list="visiblePlayerIds" placeholder="player IDs" value="${safe((o.visiblePlayerIds||[]).join(', '))}"><input class="input" data-object-field="visibleRequiredItemId" placeholder="item ID" value="${safe(o.visibleRequiredItemId||'')}"><input class="input" data-object-field="visibleRequiredFlag" placeholder="flag" value="${safe(o.visibleRequiredFlag||'')}"><label>Флаг после действия</label><input class="input" data-object-field="setFlag" value="${safe(o.setFlag||'')}"><label><input type="checkbox" data-object-bool="once" ${o.once?'checked':''}> Одноразовое взаимодействие</label><div class="hub-actions-v153"><button class="secondary" data-duplicate>ДУБЛИРОВАТЬ</button><button class="danger" data-delete>УДАЛИТЬ</button></div></div>`;}
  function bindBuilder(node,map){
    node.querySelector('[data-close]').onclick=()=>node.remove();node.querySelector('[data-save]').onclick=async()=>{builder.planet.locationType='hub';builder.planet.hub=copy(builder.hub);await Configurator.persistAll('Хаб сохранён');node.remove();Configurator.render();};
    node.querySelectorAll('[data-map]').forEach(btn=>btn.onclick=()=>{builder.mapId=btn.dataset.map;builder.selectedId='';drawBuilder();});
    node.querySelector('[data-add-map]').onclick=()=>{const id=uid('map');builder.hub.maps.push({id,name:'Новая карта',background:'',width:1200,height:720,spawnPoints:[{id:'default',name:'Вход',x:100,y:100}],objects:[]});builder.mapId=id;drawBuilder();};
    node.querySelector('[data-copy-map]').onclick=()=>{const clone=copy(map);clone.id=uid('map');clone.name=`${map.name} — копия`;clone.objects.forEach(o=>o.id=uid(o.type||'object'));builder.hub.maps.push(clone);builder.mapId=clone.id;drawBuilder();};
    node.querySelectorAll('[data-add-object]').forEach(btn=>btn.onclick=()=>{const object={id:uid(btn.dataset.addObject),type:btn.dataset.addObject,name:TYPES[btn.dataset.addObject],description:'',x:120,y:120,width:100,height:70,zIndex:1};map.objects.push(object);builder.selectedId=object.id;drawBuilder();});
    node.querySelectorAll('[data-hub-object-v153]').forEach(el=>{el.onclick=()=>{builder.selectedId=el.dataset.hubObjectV153;drawBuilder();};el.onpointerdown=event=>{event.preventDefault();const object=map.objects.find(o=>o.id===el.dataset.hubObjectV153),canvas=el.parentElement,rect=canvas.getBoundingClientRect();const move=e=>{object.x=Math.round(Math.max(0,e.clientX-rect.left-(object.width||90)/2));object.y=Math.round(Math.max(0,e.clientY-rect.top-(object.height||70)/2));el.style.left=`${object.x}px`;el.style.top=`${object.y}px`;};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);builder.selectedId=object.id;drawBuilder();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);};});
    node.querySelectorAll('[data-map-field]').forEach(input=>input.onchange=()=>{map[input.dataset.mapField]=input.type==='number'?+input.value:input.value;drawBuilder();});
    node.querySelector('[data-spawns]').onchange=e=>{map.spawnPoints=e.target.value.split('\n').map(line=>line.split('|')).filter(p=>p[0]).map(p=>({id:p[0].trim(),name:(p[1]||p[0]).trim(),x:+p[2]||0,y:+p[3]||0}));drawBuilder();};
    const selected=map.objects.find(o=>o.id===builder.selectedId);if(selected){node.querySelectorAll('[data-object-field]').forEach(input=>input.onchange=()=>{selected[input.dataset.objectField]=input.type==='number'?+input.value:input.value;drawBuilder();});node.querySelectorAll('[data-object-list]').forEach(input=>input.onchange=()=>{selected[input.dataset.objectList]=lines(input.value);drawBuilder();});node.querySelectorAll('[data-object-bool]').forEach(input=>input.onchange=()=>{selected[input.dataset.objectBool]=input.checked;});node.querySelector('[data-delete]').onclick=()=>{map.objects=map.objects.filter(o=>o.id!==selected.id);builder.selectedId='';drawBuilder();};node.querySelector('[data-duplicate]').onclick=()=>{const clone=copy(selected);clone.id=uid(clone.type||'object');clone.x+=24;clone.y+=24;map.objects.push(clone);builder.selectedId=clone.id;drawBuilder();};}
    node.querySelector('[data-dialogs]').onclick=()=>openDialogEditor();
  }
  function openDialogEditor(){
    const body=builder.hub.dialogs.map(d=>`<div class="hub-card-v153"><div class="row"><input class="input" data-dialog-name="${safe(d.id)}" value="${safe(d.name||d.id)}"><button class="secondary" data-edit-dialog="${safe(d.id)}">УЗЛЫ</button><button class="danger" data-remove-dialog="${safe(d.id)}">×</button></div><div class="small-note">ID: ${safe(d.id)} · узлов: ${(d.nodes||[]).length}</div></div>`).join('');const node=modal('Диалоги',`<button class="primary" data-new-dialog>+ ДИАЛОГ</button><div style="display:grid;gap:8px;margin-top:12px">${body||'<div class="small-note">Диалогов пока нет.</div>'}</div>`);node.querySelector('[data-new-dialog]').onclick=()=>{const id=uid('dialog');builder.hub.dialogs.push({id,name:'Новый диалог',once:false,completionFlag:'',requiredFlag:'',startNodeId:'start',nodes:[{id:'start',speaker:'NPC',text:'Новая реплика',choices:[]}]});node.remove();openDialogEditor();};node.querySelectorAll('[data-dialog-name]').forEach(input=>input.onchange=()=>builder.hub.dialogs.find(d=>d.id===input.dataset.dialogName).name=input.value);node.querySelectorAll('[data-remove-dialog]').forEach(btn=>btn.onclick=()=>{builder.hub.dialogs=builder.hub.dialogs.filter(d=>d.id!==btn.dataset.removeDialog);node.remove();openDialogEditor();});node.querySelectorAll('[data-edit-dialog]').forEach(btn=>btn.onclick=()=>{node.remove();editDialog(builder.hub.dialogs.find(d=>d.id===btn.dataset.editDialog));});
  }
  function editDialog(dialog){
    const rows=(dialog.nodes||[]).map(n=>`<div class="hub-card-v153"><b>${safe(n.id)}</b><input class="input" data-node-speaker="${safe(n.id)}" value="${safe(n.speaker||'NPC')}"><textarea class="area" data-node-text="${safe(n.id)}">${safe(n.text||'')}</textarea><label>Ответы: текст|следующий_узел|установить_флаг</label><textarea class="area" data-node-choices="${safe(n.id)}">${(n.choices||[]).map(c=>`${c.text}|${c.nextNodeId||''}|${c.setFlag||''}`).join('\n')}</textarea></div>`).join('');const node=modal(dialog.name,`<div class="hub-form-v153"><label>Стартовый узел</label><input class="input" data-start value="${safe(dialog.startNodeId||'')}"><label>Требуемый флаг / флаг завершения</label><input class="input" data-required value="${safe(dialog.requiredFlag||'')}"><input class="input" data-completion value="${safe(dialog.completionFlag||'')}"><label><input type="checkbox" data-once ${dialog.once?'checked':''}> Один раз на игрока</label><button class="secondary" data-add-node>+ УЗЕЛ</button>${rows}</div>`);node.querySelector('[data-start]').onchange=e=>dialog.startNodeId=e.target.value;node.querySelector('[data-required]').onchange=e=>dialog.requiredFlag=e.target.value;node.querySelector('[data-completion]').onchange=e=>dialog.completionFlag=e.target.value;node.querySelector('[data-once]').onchange=e=>dialog.once=e.target.checked;node.querySelector('[data-add-node]').onclick=()=>{dialog.nodes.push({id:uid('node'),speaker:'NPC',text:'',choices:[]});node.remove();editDialog(dialog);};node.querySelectorAll('[data-node-speaker]').forEach(el=>el.onchange=()=>dialog.nodes.find(n=>n.id===el.dataset.nodeSpeaker).speaker=el.value);node.querySelectorAll('[data-node-text]').forEach(el=>el.onchange=()=>dialog.nodes.find(n=>n.id===el.dataset.nodeText).text=el.value);node.querySelectorAll('[data-node-choices]').forEach(el=>el.onchange=()=>{dialog.nodes.find(n=>n.id===el.dataset.nodeChoices).choices=el.value.split('\n').map((line,i)=>line.split('|')).filter(p=>p[0]).map((p,i)=>({id:`choice_${i}`,text:p[0].trim(),nextNodeId:(p[1]||'').trim(),setFlag:(p[2]||'').trim()}));});
  }
  function boot(){
    enhanceConfigurator();const oldOpen=UI.openModule.bind(UI);UI.openModule=function(id,options={}){if(id==='hub-v153')renderRuntime();const result=oldOpen(id,options);if(id==='market'&&isHub(currentPlanet()))requestAnimationFrame(()=>{const goods=document.querySelector('#market-items [data-market-tab-v1074="goods"],#market-items [data-market-tab-v1073="goods"]'),stocks=document.querySelector('#market-items [data-market-tab-v1074="stocks"],#market-items [data-market-tab-v1073="stocks"]');if(goods)goods.style.display='none';if(stocks&&!stocks.classList.contains('active'))stocks.click();if(goods?.parentElement&&!goods.parentElement.querySelector('[data-hub-market-note-v153]'))goods.parentElement.insertAdjacentHTML('beforeend','<span class="small-note" data-hub-market-note-v153>Товары — у NPC</span>');});return result;};
    document.getElementById('open-hub-v153')?.addEventListener('click',()=>UI.openModule('hub-v153'));
    const refresh=()=>{const planet=currentPlanet();document.getElementById('open-hub-v153')?.classList.toggle('hidden',!isHub(planet));};refresh();setInterval(refresh,3000);
    window.GRPGHubV153={asHub,isHub,visible,allowed,render:renderRuntime,version:VERSION};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
