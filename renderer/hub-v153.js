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
    return {version:VERSION,defaultMapId:raw.defaultMapId || maps[0].id,maps,dialogs:Array.isArray(raw.dialogs)?raw.dialogs:[],prefabs:Array.isArray(raw.prefabs)?raw.prefabs:[]};
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
    const objects=(map.objects||[]).filter(object=>editor||(object.type!=='spawn'&&visible(object,player,state)));
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
  function closeBuilder(){document.getElementById('hub-builder-v153')?.remove();document.body.classList.remove('hub-builder-open-v153');if(builder)App.uiHoverLock=Boolean(builder.previousHoverLock);builder=null;}
  function openBuilder(planet){if(!planet)return;builder={planet,hub:asHub(planet),mapId:'',selectedId:'',view:{scale:1,x:0,y:0},previousHoverLock:Boolean(App.uiHoverLock)};builder.mapId=builder.hub.defaultMapId||builder.hub.maps[0].id;App.uiHoverLock=true;document.body.classList.add('hub-builder-open-v153');drawBuilder();}
  const PREFABS155=[
    {id:'decor',kind:'asset',type:'decor',name:'Ассет',width:100,height:80},
    {id:'door',kind:'asset',type:'door',name:'Дверь',width:100,height:30,blockMovement:true},
    {id:'terminal',kind:'asset',type:'terminal',name:'Терминал',width:70,height:70},
    {id:'transition',kind:'asset',type:'transition',name:'Переход',width:90,height:90},
    {id:'spawn',kind:'asset',type:'spawn',name:'Стартовая точка',width:40,height:40},
    {id:'label',kind:'asset',type:'label',name:'Надпись',width:160,height:40},
    {id:'item',kind:'asset',type:'item',name:'Интерактивный предмет',width:70,height:70},
    {id:'unit',kind:'unit',type:'npc',name:'Юнит',width:48,height:48},
    ...['rectangle','circle','cone','wall','polygon'].map(shape=>({id:shape,kind:'zone',type:'zone',shape,name:({rectangle:'Прямоугольник',circle:'Круг',cone:'Конус',wall:'Стена',polygon:'Область'})[shape],width:shape==='wall'?200:160,height:shape==='wall'?12:160,color:'#d6a65b'}))
  ];
  const kind155=o=>o.kind||(o.type==='npc'?'unit':o.type==='zone'?'zone':'asset');
  const map155=()=>builder.hub.maps.find(m=>m.id===builder.mapId)||builder.hub.maps[0];
  function syncSpawns155(map){map.spawnPoints=(map.objects||[]).filter(o=>o.type==='spawn').map(o=>({id:o.id,name:o.name,x:o.x+o.width/2,y:o.y+o.height/2}));}
  function prepare155(){
    builder.hub=copy(builder.hub);builder.tab='asset';builder.search='';builder.history=[];builder.future=[];builder.tool='select';
    builder.hub.prefabs=Array.isArray(builder.planet.hub?.prefabs)?copy(builder.planet.hub.prefabs):[];
    builder.hub.maps.forEach(m=>{m.objects=m.objects||[];(m.spawnPoints||[]).forEach(s=>{if(!m.objects.some(o=>o.type==='spawn'&&o.id===s.id))m.objects.push({id:s.id,name:s.name||'Вход',type:'spawn',kind:'asset',x:s.x-20,y:s.y-20,width:40,height:40});});m.objects.forEach(o=>o.kind=kind155(o));syncSpawns155(m);});
  }
  function checkpoint155(){builder.history.push(copy(builder.hub));if(builder.history.length>50)builder.history.shift();builder.future=[];}
  function undo155(redo=false){const from=redo?builder.future:builder.history,to=redo?builder.history:builder.future;if(!from.length)return;to.push(copy(builder.hub));builder.hub=from.pop();drawBuilder();}
  function field155(label,key,value,type='text'){return '<label>'+safe(label)+'</label><input class="input" data-prop="'+safe(key)+'" type="'+type+'" value="'+safe(value??'')+'">';}
  function select155(label,key,value,rows,empty='Не выбрано'){return '<label>'+safe(label)+'</label><select class="select" data-prop="'+key+'"><option value="">'+empty+'</option>'+rows.map(r=>'<option value="'+safe(r.id)+'" '+(r.id===value?'selected':'')+'>'+safe(r.name||r.displayName||r.id)+'</option>').join('')+'</select>';}
  function inspector155(map,o){
    if(!o)return '<div class="scene-inspector-head-v104"><b>КАРТА</b></div><div class="hub-form-v153">'+field155('Название карты','map.name',map.name)+
      '<label>Фон</label><div class="hub-actions-v153"><button class="secondary" data-pick-background>ЗАГРУЗИТЬ ФОН</button><button class="ghost" data-clear-background>УБРАТЬ</button></div>'+
      (map.background?'<div class="hub-background-preview-v153"><img src="'+safe(map.background)+'" alt=""></div>':'')+
      '<div class="cols2">'+field155('Ширина','map.width',map.width,'number')+field155('Высота','map.height',map.height,'number')+'</div><p class="small-note">Стартовую точку перетащите из палитры ассетов. Переход привязывается к её названию.</p></div>';
    let specific='';
    if(o.type==='terminal'||o.type==='item')specific+=select155('Статья архива','articleId',o.articleId,Object.values(ARTICLES));
    if(o.type==='transition'){const target=builder.hub.maps.find(m=>m.id===o.targetMapId);specific+=select155('Карта назначения','targetMapId',o.targetMapId,builder.hub.maps)+select155('Точка входа','targetSpawnId',o.targetSpawnId,target?.spawnPoints||[]);}
    if(kind155(o)==='unit')specific+=select155('Персонаж NPC','npcId',o.npcId,Object.values(NPCS))+select155('Диалог','dialogId',o.dialogId,builder.hub.dialogs)+
      '<label>Ассортимент торговца</label><select class="select" multiple size="6" data-multi="merchantItemIds">'+Object.values(EQUIPMENT).filter(i=>i.type!=='stock').map(i=>'<option value="'+safe(i.id)+'" '+((o.merchantItemIds||[]).includes(i.id)?'selected':'')+'>'+safe(i.name)+'</option>').join('')+'</select>';
    if(kind155(o)==='zone')specific+=select155('Форма','shape',o.shape,['rectangle','circle','cone','wall','polygon'].map(id=>({id,name:({rectangle:'Прямоугольник',circle:'Круг',cone:'Конус',wall:'Стена',polygon:'Область'})[id]})))+field155('Цвет','color',o.color||'#d6a65b','color');
    return '<div class="scene-inspector-head-v104"><b>'+({asset:'АССЕТ',unit:'ЮНИТ',zone:'ЗОНА'})[kind155(o)]+'</b><span>'+safe(o.name)+'</span></div><form class="hub-form-v153" data-inspector>'+
      '<details open><summary>Основное</summary>'+field155('Название','name',o.name)+'<label>Описание</label><textarea class="area" data-prop="description">'+safe(o.description||'')+'</textarea>'+
      (kind155(o)!=='zone'?'<button class="secondary" type="button" data-pick-object-image>ЗАГРУЗИТЬ ИЗОБРАЖЕНИЕ</button>':'')+
      '<div class="cols2">'+field155('Ширина','width',o.width,'number')+field155('Высота','height',o.height,'number')+field155('Поворот','rotation',o.rotation||0,'number')+field155('Слой','zIndex',o.zIndex||1,'number')+'</div></details>'+
      (specific?'<details open><summary>Взаимодействие</summary>'+specific+'</details>':'')+
      '<details><summary>Доступ и видимость</summary>'+select155('Требуемый предмет','requiredItemId',o.requiredItemId,Object.values(EQUIPMENT))+field155('Требуемый флаг','requiredFlag',o.requiredFlag)+field155('Флаг после использования','setFlag',o.setFlag)+field155('Флаг для видимости','visibleRequiredFlag',o.visibleRequiredFlag)+
      '<label>Виден этим игрокам (пусто — всем)</label><select class="select" multiple size="5" data-multi="visiblePlayerIds">'+Object.values(App.state.users||{}).map(p=>'<option value="'+safe(p.id)+'" '+((o.visiblePlayerIds||[]).includes(p.id)?'selected':'')+'>'+safe(p.displayName||p.id)+'</option>').join('')+'</select></details>'+
      '<details><summary>Параметры карты</summary>'+['locked','blockMovement','blockSight','once'].map(k=>'<label class="toggle-row"><input type="checkbox" data-bool="'+k+'" '+(o[k]?'checked':'')+'> '+({locked:'Зафиксировать объект',blockMovement:'Блокировать движение',blockSight:'Блокировать обзор',once:'Одноразовое взаимодействие'})[k]+'</label>').join('')+'</details>'+
      '<div class="hub-actions-v153"><button class="secondary" type="button" data-duplicate>ДУБЛИКАТ</button><button class="secondary" type="button" data-template>В ШАБЛОНЫ</button><button class="danger" type="button" data-delete>УДАЛИТЬ</button></div></form>';
  }
  function drawBuilder(){
    if(!builder)return;if(!builder.history)prepare155();document.getElementById('hub-builder-v153')?.remove();
    const map=map155(),o=map.objects.find(o=>o.id===builder.selectedId),node=document.createElement('div');
    node.id='hub-builder-v153';node.className='hub-builder-v153';node.tabIndex=-1;
    const palette=[...PREFABS155,...Object.values(NPCS).map(n=>({id:'npc:'+n.id,kind:'unit',type:'npc',npcId:n.id,name:n.name,image:n.image,width:48,height:48})),...builder.hub.prefabs].filter(p=>kind155(p)===builder.tab&&(!builder.search||p.name.toLowerCase().includes(builder.search.toLowerCase())));
    const cards=palette.map(p=>'<div class="scene-palette-card-v104" draggable="true" data-prefab="'+safe(p.id)+'">'+(p.image?'<img src="'+safe(p.image)+'" alt="">':'<span>◫</span>')+'<b>'+safe(p.name)+'</b><small>Перетащите на карту</small></div>').join('');
    node.innerHTML='<div class="hub-builder-head-v153"><b class="hub-builder-title-v153">ХАБ · '+safe(builder.planet.name)+'</b><button class="secondary" data-add-map>+ КАРТА</button><button class="secondary" data-copy-map>ДУБЛИКАТ КАРТЫ</button><button class="secondary" data-dialogs>ДИАЛОГИ</button><button class="ghost" data-undo>ОТМЕНА</button><button class="ghost" data-redo>ПОВТОР</button><span style="flex:1"></span><button class="primary" data-save>СОХРАНИТЬ</button><button class="secondary" data-close>ЗАКРЫТЬ</button></div>'+
      '<div class="hub-builder-body-v153"><aside class="hub-builder-side-v153 scene-left-v104"><div class="scene-left-section-v104"><b>КАРТЫ</b><div class="hub-list-v153">'+builder.hub.maps.map(m=>'<button class="secondary '+(m.id===map.id?'active':'')+'" data-map="'+safe(m.id)+'">'+safe(m.name)+'</button>').join('')+'</div></div><div class="scene-left-section-v104 scene-palette-v104"><div class="scene-palette-tabs-v104">'+['asset','unit','zone'].map(k=>'<button class="'+(builder.tab===k?'active':'')+'" data-tab="'+k+'">'+({asset:'Ассеты',unit:'Юниты',zone:'Зоны'})[k]+'</button>').join('')+'</div><input class="input" data-search placeholder="Поиск в палитре" value="'+safe(builder.search)+'"><button class="secondary" data-import>+ АССЕТ ИЗ ФАЙЛА</button><div class="scene-palette-grid-v104">'+cards+'</div></div></aside>'+
      '<main class="hub-builder-center-v153"><div class="hub-builder-viewport-v153" data-builder-viewport><div class="hub-builder-frame-v153"><div class="hub-builder-stage-v153" data-builder-stage style="width:'+map.width+'px;height:'+map.height+'px">'+mapMarkup(map,App.currentUser||{},{flags:{}},true)+'</div></div></div><div class="hub-builder-toolbar-v153"><div class="row">'+['select','pan','measure'].map(k=>'<button class="secondary '+(builder.tool===k?'active':'')+'" data-tool="'+k+'">'+({select:'ВЫБОР',pan:'РУКА',measure:'ЛИНЕЙКА'})[k]+'</button>').join('')+'<span class="small-note" data-measure></span></div><div class="row"><button class="ghost" data-zoom-out>−</button><span class="hub-builder-zoom-v153"></span><button class="ghost" data-zoom-in>+</button><button class="secondary" data-reset-view>ЦЕНТР</button></div></div></main><aside class="hub-builder-side-v153 scene-inspector-v104">'+inspector155(map,o)+'</aside></div>';
    document.body.append(node);bindBuilder(node,map);
    node.querySelectorAll('[data-hub-object-v153]').forEach(el=>{const ob=map.objects.find(x=>x.id===el.dataset.hubObjectV153);el.classList.toggle('selected',ob.id===builder.selectedId);el.classList.add('hub-kind-'+kind155(ob));if(ob.type==='spawn')el.classList.add('hub-spawn-v155');if(ob.id===builder.selectedId&&!ob.locked){el.insertAdjacentHTML('beforeend','<i class="hub-resize-v155" data-transform="size"></i><i class="hub-rotate-v155" data-transform="rotate">↻</i>');}if(kind155(ob)==='zone'){el.style.background=ob.color||'#d6a65b';el.style.opacity='.4';if(ob.shape==='circle')el.style.borderRadius='50%';if(ob.shape==='cone')el.style.clipPath='polygon(0 50%,100% 0,100% 100%)';}});
  }
  async function image155(stem){
    const picked=await window.electronAPI.chooseCombatMedia({kind:'image'});if(picked?.canceled)return null;const path=picked?.filePaths?.[0];if(!path)throw new Error(picked?.message||'Файл не выбран');
    const saved=await window.electronAPI.saveLocalCombatAssetFile({filePath:path,preferredStem:stem});if(!saved?.ok)throw new Error(saved?.message||'Не удалось сохранить изображение');return saved.url||saved.localUrl;
  }
  function bindBuilder(node,map){
    ['pointerdown','mousedown','mouseup','click','dblclick','contextmenu','wheel','keydown','keyup'].forEach(t=>node.addEventListener(t,e=>e.stopPropagation()));
    node.querySelector('[data-inspector]')?.addEventListener('submit',e=>e.preventDefault());const viewport=node.querySelector('[data-builder-viewport]'),stage=node.querySelector('[data-builder-stage]');
    const view=()=>{stage.style.transform='translate('+builder.view.x+'px,'+builder.view.y+'px) scale('+builder.view.scale+')';node.querySelector('.hub-builder-zoom-v153').textContent=Math.round(builder.view.scale*100)+'%';};view();
    const point=e=>{const r=stage.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*map.width,y:(e.clientY-r.top)/r.height*map.height};};
    const redraw=()=>{syncSpawns155(map);drawBuilder();};
    const duplicate=()=>{const o=map.objects.find(o=>o.id===builder.selectedId);if(!o)return;checkpoint155();const c=copy(o);c.id=uid(c.kind);c.x+=24;c.y+=24;map.objects.push(c);builder.selectedId=c.id;redraw();};
    const remove=()=>{const o=map.objects.find(o=>o.id===builder.selectedId);if(!o||o.locked)return;checkpoint155();map.objects=map.objects.filter(o=>o.id!==builder.selectedId);builder.selectedId='';redraw();};
    node.querySelector('[data-close]').onclick=closeBuilder;
    node.querySelector('[data-save]').onclick=async()=>{builder.hub.maps.forEach(syncSpawns155);builder.planet.locationType='hub';builder.planet.hub=copy(builder.hub);await Configurator.persistAll('Хаб сохранён');closeBuilder();Configurator.render();};
    node.querySelector('[data-undo]').onclick=()=>undo155();node.querySelector('[data-redo]').onclick=()=>undo155(true);
    node.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{builder.mapId=b.dataset.map;builder.selectedId='';builder.view={scale:1,x:0,y:0};drawBuilder();});
    node.querySelector('[data-add-map]').onclick=()=>{checkpoint155();const id=uid('map');builder.hub.maps.push({id,name:'Новая карта',width:1200,height:720,objects:[],spawnPoints:[]});builder.mapId=id;builder.selectedId='';drawBuilder();};
    node.querySelector('[data-copy-map]').onclick=()=>{checkpoint155();const c=copy(map),ids=new Map();c.id=uid('map');c.name+=' — копия';c.objects.forEach(o=>{const old=o.id;o.id=uid(kind155(o));ids.set(old,o.id);});c.objects.forEach(o=>{if(o.targetMapId===map.id){o.targetMapId=c.id;o.targetSpawnId=ids.get(o.targetSpawnId)||o.targetSpawnId;}});syncSpawns155(c);builder.hub.maps.push(c);builder.mapId=c.id;builder.selectedId='';drawBuilder();};
    node.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{builder.tab=b.dataset.tab;drawBuilder();});
    node.querySelector('[data-search]').onchange=e=>{builder.search=e.target.value;drawBuilder();};
    node.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{builder.tool=b.dataset.tool;drawBuilder();});
    const zoom=v=>{builder.view.scale=Math.max(.1,Math.min(5,v));view();};
    node.querySelector('[data-zoom-out]').onclick=()=>zoom(builder.view.scale/1.2);node.querySelector('[data-zoom-in]').onclick=()=>zoom(builder.view.scale*1.2);
    node.querySelector('[data-reset-view]').onclick=()=>{builder.view={scale:Math.min(1,viewport.clientWidth/map.width,viewport.clientHeight/map.height)*.9,x:0,y:0};view();};
    viewport.addEventListener('wheel',e=>{e.preventDefault();zoom(builder.view.scale*(e.deltaY<0?1.12:1/1.12));},{passive:false});
    node.querySelectorAll('[data-prefab]').forEach(card=>{card.ondragstart=e=>{e.dataTransfer.setData('application/x-grpgi-hub-prefab',card.dataset.prefab);e.dataTransfer.effectAllowed='copy';};});
    viewport.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';};
    viewport.ondrop=e=>{e.preventDefault();const id=e.dataTransfer.getData('application/x-grpgi-hub-prefab'),p=[...PREFABS155,...Object.values(NPCS).map(n=>({id:'npc:'+n.id,kind:'unit',type:'npc',npcId:n.id,name:n.name,image:n.image,width:48,height:48})),...builder.hub.prefabs].find(p=>p.id===id);if(!p)return;checkpoint155();const pos=point(e),o={...copy(p),id:uid(kind155(p)),x:pos.x-p.width/2,y:pos.y-p.height/2};map.objects.push(o);builder.selectedId=o.id;redraw();};
    viewport.onpointerdown=e=>{node.focus({preventScroll:true});
      if(e.button!==0&&e.button!==1)return;const el=e.target.closest('[data-hub-object-v153]'),p=point(e),initial={x:e.clientX,y:e.clientY,panX:builder.view.x,panY:builder.view.y};let ob=el?map.objects.find(o=>o.id===el.dataset.hubObjectV153):null;
      const transform=e.target.closest('[data-transform]')?.dataset.transform;const pan=builder.tool==='pan'||e.button===1,measure=builder.tool==='measure';e.preventDefault();viewport.setPointerCapture(e.pointerId);
      if(ob&&!pan&&!measure){checkpoint155();if(e.shiftKey){ob={...copy(ob),id:uid(kind155(ob))};map.objects.push(ob);const clone=el.cloneNode(true);clone.dataset.hubObjectV153=ob.id;el.parentElement.append(clone);}builder.selectedId=ob.id;}
      const origin=ob?{x:ob.x,y:ob.y,width:ob.width,height:ob.height,rotation:ob.rotation||0}:null;
      const move=ev=>{if(pan){builder.view.x=initial.panX+ev.clientX-initial.x;builder.view.y=initial.panY+ev.clientY-initial.y;view();}else if(measure){const q=point(ev);node.querySelector('[data-measure]').textContent=Math.round(Math.hypot(q.x-p.x,q.y-p.y))+' px';}else if(ob&&!ob.locked){const q=point(ev);if(transform==='size'){ob.width=Math.max(12,Math.round(origin.width+q.x-p.x));ob.height=Math.max(12,Math.round(origin.height+q.y-p.y));}else if(transform==='rotate'){ob.rotation=Math.round(origin.rotation+(ev.clientX-initial.x));if(ev.shiftKey)ob.rotation=Math.round(ob.rotation/15)*15;}else{ob.x=Math.round(origin.x+q.x-p.x);ob.y=Math.round(origin.y+q.y-p.y);}const target=stage.querySelector('[data-hub-object-v153="'+ob.id+'"]');if(target){target.style.left=ob.x+'px';target.style.top=ob.y+'px';target.style.width=ob.width+'px';target.style.height=ob.height+'px';target.style.transform='rotate('+(ob.rotation||0)+'deg)';}}};
      const up=()=>{viewport.removeEventListener('pointermove',move);viewport.releasePointerCapture(e.pointerId);if(!pan&&!measure){if(!ob)builder.selectedId='';redraw();}};
      viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',up,{once:true});
    };
    node.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key==='Delete'){e.preventDefault();remove();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo155(e.shiftKey);}});
    const selected=map.objects.find(o=>o.id===builder.selectedId);
    node.querySelectorAll('[data-prop]').forEach(input=>input.onchange=()=>{checkpoint155();const key=input.dataset.prop,value=input.type==='number'?+input.value:input.value;if(key.startsWith('map.'))map[key.slice(4)]=value;else if(selected){selected[key]=value;if(key==='npcId'){const npc=NPCS[value];if(npc){selected.name=npc.name;selected.image=npc.image||selected.image;}}}redraw();});
    node.querySelectorAll('[data-bool]').forEach(input=>input.onchange=()=>{checkpoint155();selected[input.dataset.bool]=input.checked;});
    node.querySelectorAll('[data-multi]').forEach(input=>input.onchange=()=>{checkpoint155();selected[input.dataset.multi]=Array.from(input.selectedOptions,o=>o.value);});
    node.querySelector('[data-duplicate]')?.addEventListener('click',duplicate);node.querySelector('[data-delete]')?.addEventListener('click',remove);
    node.querySelector('[data-template]')?.addEventListener('click',()=>{checkpoint155();builder.hub.prefabs.push({...copy(selected),id:uid('prefab')});drawBuilder();});
    const pick=async(target,key,stem)=>{try{const image=await image155(stem);if(image){checkpoint155();target[key]=image;redraw();}}catch(e){Toast.show(e.message,'err');}};
    node.querySelector('[data-pick-background]')?.addEventListener('click',()=>pick(map,'background','hub_background'));
    node.querySelector('[data-clear-background]')?.addEventListener('click',()=>{checkpoint155();map.background='';drawBuilder();});
    node.querySelector('[data-pick-object-image]')?.addEventListener('click',()=>pick(selected,'image','hub_asset'));
    node.querySelector('[data-import]').onclick=async()=>{try{const image=await image155('hub_prefab');if(!image)return;checkpoint155();builder.hub.prefabs.push({id:uid('prefab'),kind:'asset',type:'decor',name:'Новый ассет',image,width:100,height:100});builder.tab='asset';drawBuilder();}catch(e){Toast.show(e.message,'err');}};
    node.querySelector('[data-dialogs]').onclick=openDialogEditor;
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
