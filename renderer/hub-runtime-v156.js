(() => {
  'use strict';
  const C=window.GRPGHubCoreV156;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function create(B) {
    let ctx=null,queue=Promise.resolve();
    function modal(title,html){document.querySelector('.hub-modal-v153')?.remove();const n=document.createElement('div');n.className='hub-modal-v153';n.innerHTML=`<div class="hub-modal-card-v153"><div class="row" style="justify-content:space-between"><h3>${esc(title)}</h3><button class="secondary" data-close>ЗАКРЫТЬ</button></div><div data-modal-body>${html}</div><div role="status" data-status></div></div>`;document.body.append(n);n.onclick=e=>{if(e.target===n||e.target.closest('[data-close]'))n.remove();};return n;}
    function transact(mutator,notice='Состояние хаба сохранено') {
      const captured=ctx;
      const task=queue.then(async()=>{
        if(!captured||B.currentPlayer()?.id!==captured.playerId||B.currentPlanet()?.id!==captured.planet.id)throw new Error('Персонаж или хаб изменился. Откройте хаб заново.');
        let result;
        await B.commit(p=>{
          if(p.id!==captured.playerId||p.currentPlanetId!==captured.planet.id)throw new Error('Персонаж сменил локацию');
          const planet=B.currentPlanet(),hub=C.hubOf(planet),state=C.stateFor(p,planet,hub);
          result=mutator(p,state,hub);C.storeState(p,state);
        },notice,captured.playerId);
        if(ctx===captured||ctx?.playerId===captured.playerId) refresh();
        return result;
      });
      queue=task.catch(()=>{});return task;
    }
    async function busy(node,task,onSuccess){
      if(node.dataset.busy==='1')return;node.dataset.busy='1';node.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{const value=await task();if(onSuccess)onSuccess(value);}catch(e){const s=node.querySelector('[data-status]');if(s)s.textContent=e.message;B.notify(e.message,'err');}
      finally{node.dataset.busy='';node.querySelectorAll('button').forEach(b=>b.disabled=b.dataset.blocked==='1');}
    }
    function refresh(){const p=B.currentPlayer(),planet=B.currentPlanet();if(!p||!C.isHub(planet)){ctx=null;return null;}const hub=C.hubOf(planet),state=C.stateFor(p,planet,hub);ctx={playerId:p.id,planet,hub,state,map:hub.maps.find(m=>m.id===state.mapId)};return ctx;}
    function mapHtml(p){const {map,state}=ctx;return `<div class="hub-map-v153" data-runtime-map style="width:${map.width}px;height:${map.height}px;${map.background?`background-image:url('${esc(map.background)}')`:''}"><div class="hub-grid-v153"></div>${map.objects.filter(o=>o.type!=='spawn'&&C.visible(o,p,state)).map(o=>{
      const unit=C.kind(o)==='unit',size=Math.max(24,+o.width||48),open=state.objectStates[o.id]==='open';
      return `<button class="hub-object-v153 ${unit?'hub-unit-v156':''} ${open?'hub-door-open-v156':''}" data-object="${esc(o.id)}" data-type="${esc(o.type)}" style="left:${+o.x||0}px;top:${+o.y||0}px;width:${unit?size:Math.max(24,+o.width||90)}px;height:${unit?size:Math.max(24,+o.height||70)}px;z-index:${+o.zIndex||1};transform:rotate(${+o.rotation||0}deg)">${o.image?`<img src="${esc(o.image)}" alt="">`:''}<span>${esc(o.name||'Объект')}${o.type==='door'?(open?' · Открыта':' · Закрыта'):''}</span></button>`;
    }).join('')}<div class="hub-player-v153" style="left:${state.x}px;top:${state.y}px">${esc((p.displayName||p.id||'?')[0].toUpperCase())}</div></div>`;}
    function show(){
      const root=B.root();if(!root)return; if(!refresh()){root.innerHTML='<div class="hub-empty-v153">Персонаж сейчас не находится в хабе.</div>';return;}
      B.activate?.();const p=B.currentPlayer();
      root.innerHTML=`<div class="hub-shell-v153"><div class="hub-map-wrap-v153">${mapHtml(p)}</div><aside class="hub-panel-v153"><div class="hub-card-v153"><h3>${esc(ctx.planet.name)}</h3><div>${esc(ctx.map.name)}</div></div><div class="hub-card-v153" data-info>Выберите объект для взаимодействия или точку карты для перемещения.</div><div class="hub-card-v153"><button class="secondary" data-stocks>ОТКРЫТЬ БИРЖУ</button></div></aside></div>`;
      root.querySelectorAll('[data-object]').forEach(el=>el.onclick=e=>{e.stopPropagation();select(el.dataset.object);});
      root.querySelector('[data-stocks]').onclick=()=>B.openStocks();
      const map=root.querySelector('[data-runtime-map]');map.onclick=e=>{if(e.target.closest('[data-object]'))return;const r=map.getBoundingClientRect(),mapId=ctx.map.id,x=(e.clientX-r.left)/r.width*ctx.map.width,y=(e.clientY-r.top)/r.height*ctx.map.height;
        transact((p,s,h)=>{if(s.mapId!==mapId)throw new Error('Карта изменилась');const m=h.maps.find(m=>m.id===s.mapId);if(!C.canMove(m,s,x,y))throw new Error('Путь перекрыт. Откройте дверь или выберите обход.');s.x=Math.max(0,Math.min(m.width,x));s.y=Math.max(0,Math.min(m.height,y));}).then(()=>{if(B.isActive())show();}).catch(e=>B.notify(e.message,'err'));
      };
    }
    function objectNow(id,p,s,h){const o=h.maps.find(m=>m.id===s.mapId)?.objects.find(o=>o.id===id);if(!o||!C.visible(o,p,s))throw new Error('Объект недоступен');return o;}
    function select(id){
      refresh();const o=ctx?.map.objects.find(o=>o.id===id),info=B.root()?.querySelector('[data-info]');if(!o||!info)return;
      const p=B.currentPlayer(),why=C.access(o,p,ctx.state),dialogs=C.dialogsFor(ctx.hub,o,p,ctx.state);
      info.innerHTML=`<b>${esc(o.name||'Объект')}</b><p>${esc(o.description||'')}</p>${why?`<p>${esc(why)}</p>`:''}<div class="hub-actions-v153">${['door','terminal','transition','item'].includes(o.type)||o.setFlag||o.clearFlag?'<button class="primary" data-use>ИСПОЛЬЗОВАТЬ</button>':''}${dialogs.map(d=>`<button class="secondary" data-dialog="${esc(d.id)}">${esc(d.name||'Диалог')}</button>`).join('')}${C.trader(o)?'<button class="secondary" data-trade>ТОРГОВАТЬ</button>':''}</div><div data-status role="status"></div>`;
      if(why)info.querySelectorAll('button').forEach(b=>{b.disabled=true;b.dataset.blocked='1';});
      info.querySelector('[data-use]')?.addEventListener('click',()=>busy(info,()=>transact((p,s,h)=>{const live=objectNow(id,p,s,h);if(live.articleId&&!B.article(live.articleId))throw new Error('Статья не найдена');C.use(h,live,p,s);return live.articleId;}),articleId=>{if(B.isActive()){show();select(id);}if(articleId)B.openArticle(articleId);}));
      info.querySelectorAll('[data-dialog]').forEach(b=>b.onclick=()=>openDialog(id,b.dataset.dialog));
      info.querySelector('[data-trade]')?.addEventListener('click',()=>merchant(id));
    }
    function openDialog(objectId,dialogId){
      refresh();const o=ctx.map.objects.find(x=>x.id===objectId),d=ctx.hub.dialogs.find(x=>x.id===dialogId);if(!o||!d)return;
      let nodeId=ctx.state.dialogCursors[C.key(d.id,ctx.state.mapId,o.id)]||d.startNodeId||d.nodes?.[0]?.id;const n=modal(d.name||'Диалог','');
      const draw=()=>{
        if(!refresh())return n.remove();const p=B.currentPlayer(),o=ctx.map.objects.find(x=>x.id===objectId),d=ctx.hub.dialogs.find(x=>x.id===dialogId),step=d?.nodes.find(x=>x.id===nodeId),host=n.querySelector('[data-modal-body]');
        const why=!o||!d||!step?'Диалог недоступен':C.dialogReason(d,p,ctx.state,o)||C.nodeReason(d,step,p,ctx.state,o);
        if(why){host.textContent=why;return;}
        host.innerHTML=`<div class="hub-dialog-line-v153"><b>${esc(step.speaker||o.name||'')}</b><p>${esc(step.text||'')}</p></div><div class="hub-actions-v153">${step.choices?.length?step.choices.map(c=>{const why=C.choiceReason(d,step,c,p,ctx.state,o);return `<button class="secondary" data-choice="${esc(c.id)}" ${why?'disabled data-blocked="1"':''}>${esc(c.text||'Продолжить')}${why?` — ${esc(why)}`:''}</button>`;}).join(''):'<button class="primary" data-finish>ЗАВЕРШИТЬ</button>'}</div>`;
        const advance=choiceId=>busy(n,()=>transact((p,s,h)=>C.advance(h,objectId,dialogId,nodeId,choiceId,p,s),'Прогресс диалога сохранён'),r=>{
          if(r.nextNodeId){nodeId=r.nextNodeId;draw();}else{n.remove();if(B.isActive()){show();select(objectId);}}
          if(r.articleId)B.openArticle(r.articleId);
        });
        host.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>advance(b.dataset.choice));host.querySelector('[data-finish]')?.addEventListener('click',()=>advance(null));
      };draw();
    }
    function merchant(id){
      refresh();const o=ctx.map.objects.find(x=>x.id===id);if(!o||!C.trader(o))return;
      const rows=C.ids(o.merchantItemIds).map(id=>B.item(id)).filter(i=>i&&i.type!=='stock');
      const n=modal(o.name||'Торговец',`<p>Кредиты: <b data-credits>${esc(B.currentPlayer().credits||0)}</b></p>${rows.map(i=>`<div class="hub-card-v153 row" style="justify-content:space-between"><div><b>${esc(i.name||i.id)}</b><div>${esc(i.price??i.cost??0)} кр.</div></div><button class="primary" data-buy="${esc(i.id)}">КУПИТЬ</button></div>`).join('')||'<p>Ассортимент не настроен.</p>'}`);
      n.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>busy(n,()=>transact((p,s,h)=>C.purchase(h,objectNow(id,p,s,h),b.dataset.buy,p,s,B.item(b.dataset.buy),B.canAdd),'Покупка сохранена'),()=>{n.querySelector('[data-credits]').textContent=B.currentPlayer().credits;n.querySelector('[data-status]').textContent='Покупка сохранена';if(B.isActive()){show();select(id);}}));
    }
    return {show,select,openDialog,merchant,transact,refresh};
  }
  window.GRPGHubRuntimeV156={create};
})();
