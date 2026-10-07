(() => {
  'use strict';
  const C=window.GRPGHubCoreV156,A=window.GRPGHubAuthoringV156,S=window.GRPGHubSpatialV157;
  const VERSION=157;
  const TYPES={decor:'Ассет',label:'Надпись',terminal:'Терминал',door:'Дверь',transition:'Переход',npc:'Юнит',item:'Объект'};
  const uid=prefix=>prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
  const copy=C.clone,asHub=C.hubOf,isHub=C.isHub,visible=C.visible;
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentPlanet=()=>Data.getPlanet(App.currentUser?.currentPlanetId)||null;
  let playerRuntime;
  function mapMarkup(map,player,state,editor=false){
    const objects=(map.objects||[]).filter(object=>editor||(object.type!=='spawn'&&visible(object,player,state)));
    return `<div class="hub-map-v153" data-hub-map-v153 style="width:${Math.max(640,+map.width||1200)}px;height:${Math.max(420,+map.height||720)}px;${map.background?`background-image:url('${safe(map.background)}')`:''}">
      ${S.gridMarkup(map)}${S.wallsMarkup(map,editor,builder?.selectedWallId)}${editor&&builder?.fogPreview?'<canvas class="hub-fog-v157" data-editor-fog></canvas>':''}${objects.map(object=>`<button class="hub-object-v153" data-hub-object-v153="${safe(object.id)}" data-type="${safe(object.type||'decor')}" style="left:${+object.x||0}px;top:${+object.y||0}px;width:${Math.max(24,+object.width||90)}px;height:${Math.max(24,+object.height||70)}px;z-index:${+object.zIndex||1};transform:rotate(${+object.rotation||0}deg)" title="${safe(object.description||object.name||'')}">${object.image?`<img src="${safe(object.image)}" alt="">`:''}<span>${safe(object.name||TYPES[object.type]||'Объект')}</span></button>`).join('')}
      ${editor?'':`<div class="hub-player-v153" style="left:${state.x}px;top:${state.y}px">${safe((player.displayName||player.name||player.id||'?').slice(0,1).toUpperCase())}</div>`}
    </div>`;
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
  let builder=null,builderResizeObserver=null;
  function closeBuilder(){if(builder?.saving)return;document.querySelectorAll('.hub-authoring-v156').forEach(n=>n.remove());builderResizeObserver?.disconnect();builderResizeObserver=null;document.getElementById('hub-builder-v153')?.remove();document.body.classList.remove('hub-builder-open-v153');if(builder)App.uiHoverLock=Boolean(builder.previousHoverLock);builder=null;}
  function openBuilder(planet){if(!planet)return;builder={planet,hub:asHub(planet),baseHub:copy(PLANETS[planet.id]?.hub||null),mapId:'',selectedId:'',view:{scale:1,x:0,y:0,fit:true},previousHoverLock:Boolean(App.uiHoverLock)};builder.mapId=builder.hub.defaultMapId||builder.hub.maps[0].id;App.uiHoverLock=true;document.body.classList.add('hub-builder-open-v153');drawBuilder();}
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
    builder.hub.maps.forEach(m=>{m.walls ||= [];m.objects=m.objects||[];(m.spawnPoints||[]).forEach(s=>{if(!m.objects.some(o=>o.type==='spawn'&&o.id===s.id))m.objects.push({id:s.id,name:s.name||'Вход',type:'spawn',kind:'asset',x:s.x-20,y:s.y-20,width:40,height:40});});m.objects.forEach(o=>o.kind=kind155(o));syncSpawns155(m);});
  }
  function checkpoint155(){builder.history.push(copy(builder.hub));if(builder.history.length>50)builder.history.shift();builder.future=[];}
  function undo155(redo=false){const from=redo?builder.future:builder.history,to=redo?builder.history:builder.future;if(!from.length)return;to.push(copy(builder.hub));builder.hub=from.pop();drawBuilder();}
  function field155(label,key,value,type='text'){return '<label>'+safe(label)+'</label><input class="input" data-prop="'+safe(key)+'" type="'+type+'" value="'+safe(value??'')+'">';}
  function select155(label,key,value,rows,empty='Не выбрано'){return '<label>'+safe(label)+'</label><select class="select" data-prop="'+key+'"><option value="">'+empty+'</option>'+rows.map(r=>'<option value="'+safe(r.id)+'" '+(r.id===value?'selected':'')+'>'+safe(r.name||r.displayName||r.id)+'</option>').join('')+'</select>';}
  function inspector155(map,o){
    const wall=(map.walls||[]).find(w=>w.id===builder.selectedWallId);if(wall)return '<div class="scene-inspector-head-v104"><b>СТЕНА</b></div><div class="hub-form-v153">'+field155('Название','wall.name',wall.name||'Стена')+field155('Толщина (1–80 px)','wall.thickness',wall.thickness,'number')+'<label><input type="checkbox" data-wall-bool="blockMovement" '+(wall.blockMovement!==false?'checked':'')+'> Блокировать движение</label><label><input type="checkbox" data-wall-bool="blockSight" '+(wall.blockSight!==false?'checked':'')+'> Блокировать обзор</label><p>Перетащите стену для перемещения. Shift при перетаскивании — копия. Delete — удалить.</p><button class="secondary" data-duplicate-wall>ДУБЛИКАТ</button><button class="danger" data-delete-wall>УДАЛИТЬ</button></div>';
    const flags=A.flags(builder.hub),items=Object.values(EQUIPMENT).filter(i=>i.type!=='stock');
    const multi=(label,key,values,rows)=>'<label>'+label+'</label><select class="select" multiple size="5" data-multi="'+key+'">'+rows.map(r=>'<option value="'+safe(r.id)+'" '+(C.ids(values).includes(r.id)?'selected':'')+'>'+safe(r.name||r.displayName||r.id)+'</option>').join('')+'</select>';
    if(!o)return '<div class="scene-inspector-head-v104"><b>КАРТА</b></div><div class="hub-form-v153">'+field155('Название карты','map.name',map.name)+select155('Начальная карта хаба','hub.defaultMapId',builder.hub.defaultMapId,builder.hub.maps)+'<label>Фон</label><button class="secondary" data-pick-background>ЗАГРУЗИТЬ ФОН</button><button class="ghost" data-clear-background>УБРАТЬ</button>'+field155('Ширина (от 640)','map.width',map.width,'number')+field155('Высота (от 420)','map.height',map.height,'number')+field155('Радиус гекса (20–80 px)','map.hexSize',S.size(map),'number')+field155('Обзор в гексах (пусто — из профиля)','map.visionRange',map.visionRange??'','number')+'<p>Перетащите точку входа из палитры ассетов. Инструмент «Стена»: зажмите мышь и проведите отрезок. Shift — угол кратный 30°. Туман проверяется от точки входа.</p></div>';
    const kind=C.kind(o);
    let specific=kind==='unit'?select155('Персонаж NPC','npcId',o.npcId,Object.values(NPCS)):'';
    if(o.type==='terminal'||o.type==='item')specific+=select155('Статья','articleId',o.articleId,Object.values(ARTICLES));
    if(o.type==='transition')specific+=select155('Карта назначения','targetMapId',o.targetMapId,builder.hub.maps)+select155('Точка входа','targetSpawnId',o.targetSpawnId,builder.hub.maps.find(m=>m.id===o.targetMapId)?.spawnPoints||[]);
    if(kind==='zone')specific+=select155('Форма','shape',o.shape,['rectangle','circle','cone','wall','polygon'].map(id=>({id,name:id})))+field155('Цвет','color',o.color||'#d6a65b','color');
    if(kind!=='zone'&&o.type!=='spawn')specific+=multi('Диалоги / действия','dialogIds',o.dialogIds||o.dialogId,builder.hub.dialogs)+'<button class="secondary" type="button" data-edit-dialogs>РЕДАКТОР ДИАЛОГОВ</button><label><input type="checkbox" data-bool="trader" '+(C.trader(o)?'checked':'')+'> Торговец</label>'+(C.trader(o)?'<button class="secondary" type="button" data-edit-assortment>EDIT PRODUCT RANGE</button>':'');
    return '<div class="scene-inspector-head-v104"><b>'+({asset:'АССЕТ',unit:'ЮНИТ',zone:'ЗОНА'})[kind]+'</b><span>'+safe(o.name)+'</span></div><form class="hub-form-v153" data-inspector><details open><summary>Основное</summary>'+field155('Название','name',o.name)+'<label>Описание</label><textarea class="area" data-prop="description">'+safe(o.description||'')+'</textarea><button class="secondary" type="button" data-pick-object-image>ЗАГРУЗИТЬ ИЗОБРАЖЕНИЕ</button>'+field155(kind==='unit'?'Диаметр':'Ширина','width',o.width,'number')+(kind==='unit'?'':field155('Высота','height',o.height,'number'))+field155('Поворот','rotation',o.rotation||0,'number')+field155('Слой','zIndex',o.zIndex||1,'number')+'</details><details open><summary>Взаимодействие</summary>'+specific+'</details><details open><summary>Доступ и результаты</summary>'+A.conditionsMarkup(o,builder.hub,items,'object')+select155('Требуемый флаг (старое условие)','requiredFlag',o.requiredFlag,flags)+select155('Требуемый предмет (старое условие)','requiredItemId',o.requiredItemId,items)+select155('Установить флаг после действия','setFlag',o.setFlag,flags)+select155('Снять флаг после действия','clearFlag',o.clearFlag,flags)+'<button class="secondary" type="button" data-edit-flags>СОЗДАТЬ ФЛАГ</button><label><input type="checkbox" data-bool="once" '+(o.once?'checked':'')+'> Взаимодействие один раз на игрока</label></details><details><summary>Видимость</summary>'+select155('Видим при флаге','visibleRequiredFlag',o.visibleRequiredFlag,flags)+select155('Скрыть при флаге','hiddenAfterFlag',o.hiddenAfterFlag,flags)+multi('Виден игрокам (пусто — всем)','visiblePlayerIds',o.visiblePlayerIds,Object.values(App.state.users||{}))+'</details><details><summary>Редактирование</summary><label><input type="checkbox" data-bool="locked" '+(o.locked?'checked':'')+'> Зафиксировать объект</label><label><input type="checkbox" data-bool="blockMovement" '+(o.blockMovement?'checked':'')+'> Блокировать движение</label><label><input type="checkbox" data-bool="blockSight" '+(o.blockSight?'checked':'')+'> Блокировать обзор</label></details><div class="hub-actions-v153"><button class="secondary" type="button" data-duplicate>ДУБЛИКАТ</button><button class="secondary" type="button" data-template>В ШАБЛОНЫ</button><button class="danger" type="button" data-delete>УДАЛИТЬ</button></div></form>';
  }
  async function uploadLegacyHubMedia(hub,planetId){
    const sources=new Map();
    for(const map of hub.maps){sources.set(map,'background');for(const o of map.objects)sources.set(o,'image');}
    for(const o of hub.prefabs)sources.set(o,'image');
    const uploaded=new Map();
    for(const [entity,key] of sources){
      const src=entity[key];if(!src||!/^file:|^[a-z]:[\\/]|^\//i.test(src))continue;
      if(!uploaded.has(src)){
        let filePath=src;
        if(src.startsWith('file:')){const u=new URL(src);filePath=decodeURIComponent(u.pathname);if(/^\/[A-Za-z]:/.test(filePath))filePath=filePath.slice(1);if(u.hostname)filePath='//'+u.hostname+filePath;}
        const r=await window.electronAPI.saveWorldImageFile({filePath,preferredStem:'hub_'+entity.id,section:'planets',entityId:planetId});
        if(!r?.ok||r.warning)throw new Error(r?.warning||r?.message||'Не удалось загрузить изображение хаба');
        uploaded.set(src,r.cloudUrl||r.url||r.localUrl);
      }
      entity[key]=uploaded.get(src);
    }
  }
  async function saveBuilder(){
    const current=builder;if(!current||current.saving)return {ok:false,message:'The Hub draft is unavailable or already saving'};
    document.activeElement?.blur();current.hub.maps.forEach(syncSpawns155);
    const errors=C.validate(current.hub);if(errors.length){Toast.show(errors.join(' · '),'err');return {ok:false,message:errors.join(' · ')};}
    const live=PLANETS[current.planet.id];
    if(!live){Toast.show('Планета удалена. Черновик хаба остаётся открыт.','err');return {ok:false,message:'The planet was deleted. The Hub draft remains open.'};}
    if(JSON.stringify(live.hub||null)!==JSON.stringify(current.baseHub)){Toast.show('Хаб изменён извне. Сохранение отменено, чтобы не перезаписать изменения. Черновик остаётся открыт.','err');return {ok:false,message:'The Hub changed externally. Saving was cancelled; the draft remains open.'};}
    const previous={hub:copy(live.hub||null),locationType:live.locationType};
    current.saving=true;const node=document.getElementById('hub-builder-v153');node.inert=true;
    try{
      await uploadLegacyHubMedia(current.hub,current.planet.id);
      const target=PLANETS[current.planet.id];if(!target||JSON.stringify(target.hub||null)!==JSON.stringify(current.baseHub))throw new Error('Хаб изменился во время сохранения. Черновик сохранён в редакторе.');
      target.hub=copy(current.hub);target.locationType='hub';
      const result=await Configurator.persistAll('Хаб сохранён',{worldSections:['planets']});
      if(!result?.ok){
        if(result?.localSaved){current.baseHub=copy(current.hub);throw new Error('Хаб записан локально, но облако не подтверждено. Повторите сохранение.');}
        throw new Error(result?.message||'Не удалось сохранить хаб');
      }
      current.saving=false;closeBuilder();Configurator.render();return {ok:true};
    }catch(error){
      if(current.baseHub===undefined||JSON.stringify(current.baseHub)!==JSON.stringify(current.hub)){
        const target=PLANETS[current.planet.id];if(target&&JSON.stringify(target.hub)===JSON.stringify(current.hub)){if(previous.hub===null)delete target.hub;else target.hub=previous.hub;target.locationType=previous.locationType;}
      }
      Toast.show(error.message,'err');return {ok:false,message:error.message};
    }finally{current.saving=false;node.inert=false;}
  }
  function drawBuilder(){
    if(!builder)return;builderResizeObserver?.disconnect();builderResizeObserver=null;if(!builder.history)prepare155();document.getElementById('hub-builder-v153')?.remove();
    const map=map155(),o=map.objects.find(o=>o.id===builder.selectedId),node=document.createElement('div');
    node.id='hub-builder-v153';node.className='hub-builder-v153';node.tabIndex=-1;
    const palette=[...PREFABS155,...Object.values(NPCS).map(n=>({id:'npc:'+n.id,kind:'unit',type:'npc',npcId:n.id,name:n.name,image:n.image,width:48,height:48})),...builder.hub.prefabs].filter(p=>kind155(p)===builder.tab&&(!builder.search||p.name.toLowerCase().includes(builder.search.toLowerCase())));
    const cards=palette.map(p=>'<div class="scene-palette-card-v104" draggable="true" data-prefab="'+safe(p.id)+'">'+(p.image?'<img src="'+safe(p.image)+'" alt="">':'<span>◫</span>')+'<b>'+safe(p.name)+'</b><small>Перетащите на карту</small></div>').join('');
    node.innerHTML='<div class="hub-builder-head-v153"><b class="hub-builder-title-v153">ХАБ · '+safe(builder.planet.name)+'</b><button class="secondary" data-add-map>+ КАРТА</button><button class="secondary" data-copy-map>ДУБЛИКАТ КАРТЫ</button><button class="secondary" data-dialogs>ДИАЛОГИ</button><button class="secondary" data-flags>ФЛАГИ</button><button class="ghost" data-undo>ОТМЕНА</button><button class="ghost" data-redo>ПОВТОР</button><span style="flex:1"></span><button class="primary" data-save>СОХРАНИТЬ</button><button class="secondary" data-close>ЗАКРЫТЬ</button></div>'+
      '<div class="hub-builder-body-v153"><aside class="hub-builder-side-v153 scene-left-v104"><div class="scene-left-section-v104"><b>КАРТЫ</b><div class="hub-list-v153">'+builder.hub.maps.map(m=>'<button class="secondary '+(m.id===map.id?'active':'')+'" data-map="'+safe(m.id)+'">'+safe(m.name)+'</button>').join('')+'</div></div><div class="scene-left-section-v104 scene-palette-v104"><div class="scene-palette-tabs-v104">'+['asset','unit','zone'].map(k=>'<button class="'+(builder.tab===k?'active':'')+'" data-tab="'+k+'">'+({asset:'Ассеты',unit:'Юниты',zone:'Зоны'})[k]+'</button>').join('')+'</div><input class="input" data-search placeholder="Поиск в палитре" value="'+safe(builder.search)+'"><button class="secondary" data-import>+ АССЕТ ИЗ ФАЙЛА</button><div class="scene-palette-grid-v104">'+cards+'</div></div></aside>'+
      '<main class="hub-builder-center-v153"><div class="hub-builder-viewport-v153" data-builder-viewport><div class="hub-builder-frame-v153"><div class="hub-builder-stage-v153" data-builder-stage style="width:'+map.width+'px;height:'+map.height+'px">'+mapMarkup(map,App.currentUser||{},{flags:{}},true)+'</div></div></div><div class="hub-builder-toolbar-v153"><div class="row">'+['select','pan','measure','wall'].map(k=>'<button class="secondary '+(builder.tool===k?'active':'')+'" data-tool="'+k+'">'+({select:'ВЫБОР',pan:'РУКА',measure:'ЛИНЕЙКА',wall:'СТЕНА'})[k]+'</button>').join('')+'<label class="hub-fog-toggle-v157"><input type="checkbox" data-map-fog '+(map.fogEnabled?'checked':'')+'> ТУМАН</label><label class="hub-fog-toggle-v157"><input type="checkbox" data-fog-preview '+(builder.fogPreview?'checked':'')+'> ПРОСМОТР</label><span class="small-note" data-measure></span></div><div class="row"><button class="ghost" data-zoom-out>−</button><span class="hub-builder-zoom-v153"></span><button class="ghost" data-zoom-in>+</button><button class="secondary" data-reset-view>ЦЕНТР</button></div></div></main><aside class="hub-builder-side-v153 scene-inspector-v104">'+inspector155(map,o)+'</aside></div>';
    document.body.append(node);bindBuilder(node,map);const spawn=map.spawnPoints[0]||{x:100,y:100};S.drawFog(node.querySelector('[data-editor-fog]'),map,{...spawn,objectStates:{}},App.currentUser,true);
    node.querySelectorAll('[data-hub-object-v153]').forEach(el=>{const ob=map.objects.find(x=>x.id===el.dataset.hubObjectV153);el.classList.toggle('selected',ob.id===builder.selectedId);el.classList.add('hub-kind-'+kind155(ob));if(ob.type==='spawn')el.classList.add('hub-spawn-v155');if(ob.id===builder.selectedId&&!ob.locked){el.insertAdjacentHTML('beforeend','<i class="hub-resize-v155" data-transform="size"></i><i class="hub-rotate-v155" data-transform="rotate">↻</i>');}if(kind155(ob)==='unit'){el.classList.add('hub-unit-v156');el.style.height=el.style.width;}if(kind155(ob)==='zone'){el.style.background=ob.color||'#d6a65b';el.style.opacity='.4';if(ob.shape==='circle')el.style.borderRadius='50%';if(ob.shape==='cone')el.style.clipPath='polygon(0 50%,100% 0,100% 100%)';}});
  }
  async function image155(stem){
    const picked=await window.electronAPI.chooseCombatMedia({kind:'image'});if(picked?.canceled)return null;const path=picked?.filePaths?.[0];if(!path)throw new Error(picked?.message||'Файл не выбран');
    const saved=await window.electronAPI.saveWorldImageFile({filePath:path,preferredStem:stem,section:'planets',entityId:builder.planet.id});if(!saved?.ok||saved.warning)throw new Error(saved?.warning||saved?.message||'Не удалось сохранить изображение');return saved.cloudUrl||saved.url||saved.localUrl;
  }
  function bindBuilder(node,map){
    ['pointerdown','mousedown','mouseup','click','dblclick','contextmenu','wheel','keydown','keyup'].forEach(t=>node.addEventListener(t,e=>e.stopPropagation()));
    node.querySelector('[data-inspector]')?.addEventListener('submit',e=>e.preventDefault());const viewport=node.querySelector('[data-builder-viewport]'),stage=node.querySelector('[data-builder-stage]');
    const view=()=>{stage.style.transform='translate('+builder.view.x+'px,'+builder.view.y+'px) scale('+builder.view.scale+')';node.querySelector('.hub-builder-zoom-v153').textContent=Math.round(builder.view.scale*100)+'%';};view();
    const point=e=>{const r=stage.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*map.width,y:(e.clientY-r.top)/r.height*map.height};};
    const redraw=()=>{syncSpawns155(map);drawBuilder();};
    const duplicate=()=>{const o=map.objects.find(o=>o.id===builder.selectedId);if(!o)return;checkpoint155();const c=copy(o);c.id=uid(c.kind);c.x+=24;c.y+=24;map.objects.push(c);builder.selectedId=c.id;redraw();};
    const remove=()=>{const o=map.objects.find(o=>o.id===builder.selectedId);if(!o||o.locked)return;checkpoint155();map.objects=map.objects.filter(o=>o.id!==builder.selectedId);builder.selectedId='';redraw();};
    const wallSelected=()=>map.walls.find(w=>w.id===builder.selectedWallId);
    const deleteWall=()=>{const wall=wallSelected();if(!wall)return;checkpoint155();map.walls=map.walls.filter(w=>w!==wall);builder.selectedWallId='';redraw();};
    const copyWall=()=>{const w=wallSelected();if(!w)return;checkpoint155();const c=copy(w);c.id=uid('wall');c.points=c.points.map(p=>({x:Math.min(map.width,p.x+24),y:Math.min(map.height,p.y+24)}));map.walls.push(c);builder.selectedWallId=c.id;redraw();};
    node.querySelector('[data-delete-wall]')?.addEventListener('click',deleteWall);node.querySelector('[data-duplicate-wall]')?.addEventListener('click',copyWall);
    node.querySelector('[data-map-fog]').onchange=e=>{checkpoint155();map.fogEnabled=e.target.checked;redraw();};
    node.querySelector('[data-fog-preview]').onchange=e=>{builder.fogPreview=e.target.checked;redraw();};
    node.querySelectorAll('[data-wall-bool]').forEach(input=>input.onchange=()=>{checkpoint155();wallSelected()[input.dataset.wallBool]=input.checked;redraw();});
    node.querySelector('[data-close]').onclick=closeBuilder;
    node.querySelector('[data-save]').onclick=saveBuilder;
    node.querySelector('[data-undo]').onclick=()=>undo155();node.querySelector('[data-redo]').onclick=()=>undo155(true);
    node.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{builder.mapId=b.dataset.map;builder.selectedId='';builder.selectedWallId='';builder.view={scale:1,x:0,y:0,fit:true};drawBuilder();});
    node.querySelector('[data-add-map]').onclick=()=>{checkpoint155();const id=uid('map');builder.hub.maps.push({id,name:'Новая карта',width:1200,height:720,objects:[],spawnPoints:[],walls:[],fogEnabled:true,hexSize:28});builder.mapId=id;builder.selectedId='';builder.selectedWallId='';builder.view={scale:1,x:0,y:0,fit:true};drawBuilder();};
    node.querySelector('[data-copy-map]').onclick=()=>{checkpoint155();const c=copy(map),ids=new Map();c.id=uid('map');c.name+=' — копия';c.objects.forEach(o=>{const old=o.id;o.id=uid(kind155(o));ids.set(old,o.id);});c.objects.forEach(o=>{if(o.targetMapId===map.id){o.targetMapId=c.id;o.targetSpawnId=ids.get(o.targetSpawnId)||o.targetSpawnId;}});syncSpawns155(c);builder.hub.maps.push(c);builder.mapId=c.id;builder.selectedId='';builder.selectedWallId='';builder.view={scale:1,x:0,y:0,fit:true};drawBuilder();};
    node.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{builder.tab=b.dataset.tab;drawBuilder();});
    node.querySelector('[data-search]').onchange=e=>{builder.search=e.target.value;drawBuilder();};
    node.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{builder.tool=b.dataset.tool;drawBuilder();});
    const zoom=v=>{builder.view.fit=false;builder.view.scale=Math.max(.1,Math.min(5,v));view();};
    node.querySelector('[data-zoom-out]').onclick=()=>zoom(builder.view.scale/1.2);node.querySelector('[data-zoom-in]').onclick=()=>zoom(builder.view.scale*1.2);
    const fit=()=>{builder.view={scale:Math.min(viewport.clientWidth/map.width,viewport.clientHeight/map.height)*.9,x:0,y:0,fit:true};view();};
    node.querySelector('[data-reset-view]').onclick=fit;
    if(builder.view.fit)fit();
    builderResizeObserver=new ResizeObserver(()=>{if(builder?.view.fit&&node.isConnected)fit();});
    builderResizeObserver.observe(viewport);
    viewport.addEventListener('wheel',e=>{e.preventDefault();zoom(builder.view.scale*(e.deltaY<0?1.12:1/1.12));},{passive:false});
    node.querySelectorAll('[data-prefab]').forEach(card=>{card.ondragstart=e=>{e.dataTransfer.setData('application/x-grpgi-hub-prefab',card.dataset.prefab);e.dataTransfer.effectAllowed='copy';};});
    viewport.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';};
    viewport.ondrop=e=>{e.preventDefault();const id=e.dataTransfer.getData('application/x-grpgi-hub-prefab'),p=[...PREFABS155,...Object.values(NPCS).map(n=>({id:'npc:'+n.id,kind:'unit',type:'npc',npcId:n.id,name:n.name,image:n.image,width:48,height:48})),...builder.hub.prefabs].find(p=>p.id===id);if(!p)return;checkpoint155();const pos=point(e),o={...copy(p),id:uid(kind155(p)),x:pos.x-p.width/2,y:pos.y-p.height/2};map.objects.push(o);builder.selectedId=o.id;redraw();};
    viewport.onpointerdown=e=>{node.focus({preventScroll:true});
      if(e.button===0&&['wall','select'].includes(builder.tool)){
        const line=e.target.closest('[data-wall]'),wall=line?map.walls.find(w=>w.id===line.dataset.wall):null;
        if(builder.tool==='wall'||wall){
          e.preventDefault();viewport.setPointerCapture(e.pointerId);const clamp=p=>({x:Math.max(0,Math.min(map.width,p.x)),y:Math.max(0,Math.min(map.height,p.y))}),start=clamp(point(e));let end=start,moved=false,original=wall?copy(wall.points):null,current=wall;
          if(wall){checkpoint155();if(e.shiftKey){current=copy(wall);current.id=uid('wall');map.walls.push(current);const clone=line.cloneNode(true);clone.dataset.wall=current.id;line.parentElement.append(clone);}builder.selectedWallId=current.id;builder.selectedId='';}
          const svg=stage.querySelector('.hub-walls-v157'),preview=document.createElementNS('http://www.w3.org/2000/svg','polyline');if(!wall){preview.classList.add('hub-wall-preview-v157');preview.setAttribute('stroke-width','8');svg.append(preview);}
          const move=ev=>{end=clamp(point(ev));moved=Math.hypot(end.x-start.x,end.y-start.y)>4;if(wall){let dx=end.x-start.x,dy=end.y-start.y;dx=Math.max(-Math.min(...original.map(p=>p.x)),Math.min(map.width-Math.max(...original.map(p=>p.x)),dx));dy=Math.max(-Math.min(...original.map(p=>p.y)),Math.min(map.height-Math.max(...original.map(p=>p.y)),dy));current.points=original.map(p=>({x:p.x+dx,y:p.y+dy}));svg.querySelector('[data-wall="'+current.id+'"]').setAttribute('points',current.points.map(p=>p.x+','+p.y).join(' '));}else{if(ev.shiftKey){const distance=Math.hypot(end.x-start.x,end.y-start.y),a=Math.round(Math.atan2(end.y-start.y,end.x-start.x)/(Math.PI/6))*Math.PI/6;end=clamp({x:start.x+distance*Math.cos(a),y:start.y+distance*Math.sin(a)});}preview.setAttribute('points',start.x+','+start.y+' '+end.x+','+end.y);}};
          const finish=ev=>{viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',finish);viewport.removeEventListener('pointercancel',finish);if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);preview.remove();if(!wall&&moved&&ev.type!=='pointercancel'){checkpoint155();const w={id:uid('wall'),name:'Стена',points:[start,end],thickness:8,blockMovement:true,blockSight:true};map.walls.push(w);builder.selectedWallId=w.id;builder.selectedId='';}else if(wall&&ev.type==='pointercancel')current.points=original;redraw();};
          viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',finish);return;
        }
      }
      builder.selectedWallId='';
      if(e.button!==0&&e.button!==1)return;const el=e.target.closest('[data-hub-object-v153]'),p=point(e),initial={x:e.clientX,y:e.clientY,panX:builder.view.x,panY:builder.view.y};let ob=el?map.objects.find(o=>o.id===el.dataset.hubObjectV153):null;
      const transform=e.target.closest('[data-transform]')?.dataset.transform;const pan=builder.tool==='pan'||e.button===1,measure=builder.tool==='measure';e.preventDefault();viewport.setPointerCapture(e.pointerId);
      if(ob&&!pan&&!measure){checkpoint155();if(e.shiftKey){ob={...copy(ob),id:uid(kind155(ob))};map.objects.push(ob);const clone=el.cloneNode(true);clone.dataset.hubObjectV153=ob.id;el.parentElement.append(clone);}builder.selectedId=ob.id;}
      const origin=ob?{x:ob.x,y:ob.y,width:ob.width,height:ob.height,rotation:ob.rotation||0}:null;
      const move=ev=>{if(pan){builder.view.fit=false;builder.view.x=initial.panX+ev.clientX-initial.x;builder.view.y=initial.panY+ev.clientY-initial.y;view();}else if(measure){const q=point(ev);node.querySelector('[data-measure]').textContent=Math.round(Math.hypot(q.x-p.x,q.y-p.y))+' px';}else if(ob&&!ob.locked){const q=point(ev);if(transform==='size'){ob.width=Math.max(12,Math.round(origin.width+q.x-p.x));ob.height=C.kind(ob)==='unit'?ob.width:Math.max(12,Math.round(origin.height+q.y-p.y));}else if(transform==='rotate'){ob.rotation=Math.round(origin.rotation+(ev.clientX-initial.x));if(ev.shiftKey)ob.rotation=Math.round(ob.rotation/15)*15;}else{ob.x=Math.round(origin.x+q.x-p.x);ob.y=Math.round(origin.y+q.y-p.y);}const target=stage.querySelector('[data-hub-object-v153="'+ob.id+'"]');if(target){target.style.left=ob.x+'px';target.style.top=ob.y+'px';target.style.width=ob.width+'px';target.style.height=ob.height+'px';target.style.transform='rotate('+(ob.rotation||0)+'deg)';}}};
      const up=()=>{viewport.removeEventListener('pointermove',move);viewport.releasePointerCapture(e.pointerId);if(!pan&&!measure){if(!ob)builder.selectedId='';redraw();}};
      viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',up,{once:true});
    };
    node.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.key==='Delete'){e.preventDefault();if(builder.selectedWallId)deleteWall();else remove();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();if(builder.selectedWallId)copyWall();else duplicate();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo155(e.shiftKey);}});
    const selected=map.objects.find(o=>o.id===builder.selectedId);
    node.querySelectorAll('[data-prop]').forEach(input=>{
      const update=()=>{checkpoint155();const key=input.dataset.prop,value=input.type==='number'?+input.value:input.value;
        if(key.startsWith('wall.'))wallSelected()[key.slice(5)]=value;else if(key==='map.visionRange'&&input.value==='')delete map.visionRange;else if(key.startsWith('map.'))map[key.slice(4)]=value;
        else if(key.startsWith('hub.'))builder.hub[key.slice(4)]=value;
        else if(selected){selected[key]=value;if(C.kind(selected)==='unit'&&key==='width')selected.height=value;if(key==='npcId'){const npc=NPCS[value];if(npc){selected.name=npc.name;selected.image=npc.image||selected.image;}}}
        if(['map.width','map.height','map.hexSize','map.visionRange','wall.thickness'].includes(key)){
          try{const html=S.gridMarkup(map),mapNode=stage.querySelector('[data-hub-map-v153]');stage.style.width=map.width+'px';stage.style.height=map.height+'px';mapNode.style.width=map.width+'px';mapNode.style.height=map.height+'px';mapNode.querySelector('.hub-hex-grid-v157').outerHTML=html;mapNode.querySelector('.hub-walls-v157').outerHTML=S.wallsMarkup(map,true,builder.selectedWallId);S.drawFog(mapNode.querySelector('[data-editor-fog]'),map,map.spawnPoints[0]||{x:100,y:100},App.currentUser,true);if(builder.view.fit)fit();}catch(error){/* Save validation reports incomplete numbers. */}
        }
      };
      input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>{update();if(['npcId','targetMapId','shape'].includes(input.dataset.prop))redraw();});
    });
    node.querySelectorAll('[data-bool]').forEach(input=>input.onchange=()=>{checkpoint155();selected[input.dataset.bool]=input.checked;if(input.dataset.bool==='trader')redraw();});
    node.querySelectorAll('[data-multi]').forEach(input=>input.onchange=()=>{checkpoint155();selected[input.dataset.multi]=Array.from(input.selectedOptions,o=>o.value);if(input.dataset.multi==='dialogIds')delete selected.dialogId;});
    A.bindConditions(node,()=>selected,checkpoint155,redraw);
    node.querySelector('[data-edit-flags]')?.addEventListener('click',()=>A.openFlags({hub:builder.hub,checkpoint:checkpoint155,onClose:redraw}));
    node.querySelector('[data-edit-dialogs]')?.addEventListener('click',openDialogEditor);
    node.querySelector('[data-edit-assortment]')?.addEventListener('click',()=>openMerchantEditor(selected));
    node.querySelector('[data-duplicate]')?.addEventListener('click',duplicate);node.querySelector('[data-delete]')?.addEventListener('click',remove);
    node.querySelector('[data-template]')?.addEventListener('click',()=>{checkpoint155();builder.hub.prefabs.push({...copy(selected),id:uid('prefab')});drawBuilder();});
    const pick=async(target,key,stem)=>{try{const image=await image155(stem);if(image){checkpoint155();target[key]=image;redraw();}}catch(e){Toast.show(e.message,'err');}};
    node.querySelector('[data-pick-background]')?.addEventListener('click',()=>pick(map,'background','hub_background'));
    node.querySelector('[data-clear-background]')?.addEventListener('click',()=>{checkpoint155();map.background='';drawBuilder();});
    node.querySelector('[data-pick-object-image]')?.addEventListener('click',()=>pick(selected,'image','hub_asset'));
    node.querySelector('[data-import]').onclick=async()=>{try{const image=await image155('hub_prefab');if(!image)return;checkpoint155();builder.hub.prefabs.push({id:uid('prefab'),kind:'asset',type:'decor',name:'Новый ассет',image,width:100,height:100});builder.tab='asset';drawBuilder();}catch(e){Toast.show(e.message,'err');}};
    node.querySelector('[data-dialogs]').onclick=openDialogEditor;
    node.querySelector('[data-flags]').onclick=()=>A.openFlags({hub:builder.hub,checkpoint:checkpoint155,onClose:drawBuilder});
  }
  function openMerchantEditor(object){
    if(!builder||!object)return;
    const current=builder,items=Object.values(EQUIPMENT).filter(i=>!window.GRPGMarketEngineV1071?.isStock(i)&&i.type!=='stock').sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)));
    const entries=new Map((object.merchantMarket===undefined?C.ids(object.merchantItemIds).map(id=>{const i=EQUIPMENT[id];return {itemId:id,enabled:true,appearanceChance:100,minPrice:Number(i?.price??i?.cost??0),maxPrice:Number(i?.price??i?.cost??0)};}):copy(object.merchantMarket)).map(e=>[e.itemId,e]));
    for(const i of items)if(!entries.has(i.id)){const price=Number(i.price??i.cost??0);entries.set(i.id,{itemId:i.id,enabled:false,appearanceChance:100,minPrice:Number.isSafeInteger(price)&&price>=0?price:0,maxPrice:Number.isSafeInteger(price)&&price>=0?price:0});}
    const n=document.createElement('div');n.className='hub-authoring-v156 hub-merchant-editor-v162';n.setAttribute('role','dialog');n.setAttribute('aria-modal','true');n.setAttribute('aria-label','Product range');
    n.innerHTML=`<section class="hub-merchant-card-v162"><header class="row"><h2>Product range · ${safe(object.name||object.id)}</h2><button class="secondary" data-cancel-assortment>Cancel</button></header><p>Check equipment available from this merchant. Appearance is rolled once per campaign market day; without a campaign date, it changes at midnight UTC. Prices are whole credits. Apply updates the Hub draft; Save hub persists it.</p><div class="row"><input class="input" data-merchant-search placeholder="Search equipment" aria-label="Search equipment"><label><input type="checkbox" data-enabled-only> Selected only</label><span data-merchant-count></span></div><div class="hub-merchant-table-v162"><table><thead><tr><th>Available</th><th>Equipment</th><th>Chance %</th><th>Minimum price</th><th>Maximum price</th></tr></thead><tbody>${items.map(i=>{const e=entries.get(i.id);return `<tr data-merchant-item="${safe(i.id)}"><td><input type="checkbox" data-merchant-field="enabled" aria-label="Available: ${safe(i.name||i.id)}" ${e.enabled!==false?'checked':''}></td><td><div class="hub-merchant-equipment-v163">${window.GRPGMerchantUIV163.thumb(i,typeof renderThumb==='function'?item=>renderThumb(item,{size:'sm',type:'item'}):null)}<div><b>${safe(i.name||i.id)}</b><small>${safe(i.type||'equipment')} · ${safe(i.id)}</small></div></div></td>${['appearanceChance','minPrice','maxPrice'].map(f=>`<td><input class="input" type="number" min="0" ${f==='appearanceChance'?'max="100" step="0.1"':'step="1"'} data-merchant-field="${f}" aria-label="${safe(f)}: ${safe(i.name||i.id)}" value="${safe(e[f])}"></td>`).join('')}</tr>`;}).join('')}</tbody></table></div><footer class="row"><span role="status" data-merchant-status></span><button class="primary" data-apply-assortment>Apply to Hub draft</button></footer></section>`;
    n.addEventListener('error',e=>{if(e.target.tagName==='IMG'&&e.target.closest('.hub-trade-image-v163'))e.target.closest('.hub-trade-image-v163').innerHTML='<span class="hub-trade-placeholder-v163" aria-label="Image unavailable">'+safe((e.target.alt||'?').slice(0,2).toUpperCase())+'</span>';},true);
    document.body.append(n);const parent=document.getElementById('hub-builder-v153');if(parent)parent.inert=true;
    const close=()=>{n.remove();if(parent)parent.inert=false;if(builder===current){drawBuilder();document.querySelector('[data-edit-assortment]')?.focus();}};
    const filter=()=>{const q=n.querySelector('[data-merchant-search]').value.trim().toLowerCase(),only=n.querySelector('[data-enabled-only]').checked;let shown=0;for(const row of n.querySelectorAll('[data-merchant-item]')){const e=entries.get(row.dataset.merchantItem);row.hidden=!((!only||e.enabled!==false)&&row.textContent.toLowerCase().includes(q));if(!row.hidden)shown++;}n.querySelector('[data-merchant-count]').textContent=`${[...entries.values()].filter(e=>e.enabled!==false).length} selected · ${shown} shown`;};
    n.querySelectorAll('[data-merchant-field]').forEach(input=>input.addEventListener('input',()=>{const e=entries.get(input.closest('[data-merchant-item]').dataset.merchantItem);n.querySelector('[data-merchant-status]').textContent='';e[input.dataset.merchantField]=input.type==='checkbox'?input.checked:(input.value===''?null:Number(input.value));filter();}));
    n.querySelector('[data-merchant-search]').oninput=filter;n.querySelector('[data-enabled-only]').onchange=filter;
    n.querySelector('[data-cancel-assortment]').onclick=close;
    n.querySelector('[data-apply-assortment]').onclick=()=>{
      const next=[...entries.values()],errors=C.merchantErrors({merchantMarket:next});
      if(errors.length){n.querySelector('[data-merchant-status]').textContent=errors.join(' · ');return;}
      if(builder!==current||!current.hub.maps.some(m=>m.objects.includes(object))){n.querySelector('[data-merchant-status]').textContent='The merchant draft changed. Reopen the editor.';return;}
      checkpoint155();object.merchantMarket=copy(next);delete object.merchantItemIds;close();
    };
    n.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const fields=[...n.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.getClientRects().length),first=fields[0],last=fields.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
    ['pointerdown','mousedown','mouseup','click','dblclick','contextmenu','wheel','keyup'].forEach(t=>n.addEventListener(t,e=>e.stopPropagation()));
    filter();n.querySelector('[data-merchant-search]').focus();
  }
  function openDialogEditor(){A.openDialogs({hub:builder.hub,items:Object.values(EQUIPMENT),npcs:Object.values(NPCS),planetId:builder.planet.id,testPlayer:App.currentUser,checkpoint:checkpoint155,onSave:saveBuilder,onClose:drawBuilder});}
  function boot(){
    enhanceConfigurator();
    playerRuntime=window.GRPGHubRuntimeV156.create({
      root:()=>document.getElementById('hub-content-v153'),currentPlayer:()=>App.currentUser,currentPlanet,
      isActive:()=>UI.activeModuleId==='hub-v153',activate:()=>{},
      itemThumb:item=>typeof renderThumb==='function'?renderThumb(item,{size:'sm',type:'item'}):window.GRPGMerchantUIV163.thumb(item),inventoryLayout:p=>window.GRPGInventoryV1067.buildLayout?.(p),
      marketContext:()=>{const campaignId=String((typeof Sync!=='undefined'?Sync.config?.campaignId:'')||App.activeCampaignId||'main');return {campaignId,campaign:Data.getCampaign?.(campaignId)||Data.campaigns?.[campaignId]||{}};},
      item:id=>Data.getItem(id),npc:id=>NPCS[id],article:id=>ARTICLES[id],
      canAdd:(p,id,n)=>window.GRPGInventoryV1067.canAddItem(p,id,n),
      notify:(m,t)=>Toast.show(m,t),openStocks:()=>UI.openModule('market'),
      openArticle:id=>{UI.closeModule();UI.openModule('wiki',{preserveWikiState:true});Wiki.showEntity('article',id,true);},
      commit:async(mutator,notice,expectedId)=>{
        const user=App.currentUser;if(!user||user.id!==expectedId)throw new Error('Персонаж изменился');
        const base=copy(PlayerSync.projectedPlayerV135(user.id)),next=copy(base);await mutator(next);
        const patch={hubState:next.hubState,hubProgress:next.hubProgress};
        if(JSON.stringify(next.inventory)!==JSON.stringify(base.inventory))patch.inventory=next.inventory;
        if(next.credits!==base.credits)patch.credits=next.credits;
        Object.assign(App.state.users[user.id],copy(patch));
        try{const result=await PlayerSync.pushPlayerPatch(user.id,patch,{basePlayer:base,notice,rerender:false});if(!result?.ok)throw new Error(result?.message||'Сохранение не подтверждено');}
        catch(e){const live=App.state.users[user.id];for(const key of Object.keys(patch))if(JSON.stringify(live[key])===JSON.stringify(patch[key])){if(base[key]===undefined)delete live[key];else live[key]=copy(base[key]);}throw e;}
      }
    });
    const oldOpen=UI.openModule.bind(UI);UI.openModule=function(id,options={}){const result=oldOpen(id,options);if(id==='hub-v153')playerRuntime.show();if(id==='market'&&isHub(currentPlanet()))requestAnimationFrame(()=>{const goods=document.querySelector('#market-items [data-market-tab-v1074="goods"],#market-items [data-market-tab-v1073="goods"]'),stocks=document.querySelector('#market-items [data-market-tab-v1074="stocks"],#market-items [data-market-tab-v1073="stocks"]');if(goods)goods.style.display='none';if(stocks&&!stocks.classList.contains('active'))stocks.click();});return result;};
    document.getElementById('open-hub-v153')?.addEventListener('click',()=>UI.openModule('hub-v153'));
    const refresh=()=>document.getElementById('open-hub-v153')?.classList.toggle('hidden',!isHub(currentPlanet()));refresh();setInterval(refresh,3000);
    window.GRPGHubV153={asHub,isHub,visible,allowed:(o,p,s)=>{const reason=C.access(o,p,s);return[!reason,reason];},render:()=>playerRuntime.show(),version:VERSION};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
