(() => {
  'use strict';
  const C=window.GRPGHubCoreV156,S=window.GRPGHubSpatialV157;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function create(B) {
    let ctx=null,queue=Promise.resolve(),walking=false,epoch=0;
    function modal(title,html){window.GRPGDialogViewV161.active?.leave();document.querySelector('.hub-modal-v153')?.remove();const n=document.createElement('div');n.className='hub-modal-v153';n.innerHTML=`<div class="hub-modal-card-v153"><div class="row" style="justify-content:space-between"><h3>${esc(title)}</h3><button class="secondary" data-close>ЗАКРЫТЬ</button></div><div data-modal-body>${html}</div><div role="status" data-status></div></div>`;document.body.append(n);n.onclick=e=>{if(e.target===n||e.target.closest('[data-close]'))n.remove();};return n;}
    function transact(mutator,notice=null) {
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
    function objectsHtml(p){const {map,state}=ctx,sight=map.fogEnabled?S.visibleCells(map,state,p):null;
      return map.objects.filter(o=>o.type!=='spawn'&&C.visible(o,p,state)&&S.inSight(map,state,p,o,sight)).map(o=>{
      const unit=C.kind(o)==='unit',size=Math.max(24,+o.width||48),open=state.objectStates[o.id]==='open';
      return `<button class="hub-object-v153 ${unit?'hub-unit-v156':''} ${open?'hub-door-open-v156':''}" data-object="${esc(o.id)}" data-type="${esc(o.type)}" style="left:${+o.x||0}px;top:${+o.y||0}px;width:${unit?size:Math.max(24,+o.width||90)}px;height:${unit?size:Math.max(24,+o.height||70)}px;z-index:${Math.max(1,Math.min(90,+o.zIndex||1))};transform:rotate(${+o.rotation||0}deg)">${o.image?`<img src="${esc(o.image)}" alt="">`:''}<span>${esc(o.name||'Объект')}${o.type==='door'?(open?' · Открыта':' · Закрыта'):''}</span></button>`;
    }).join('');
    }
    function mapHtml(p){const {map,state}=ctx;return `<div class="hub-map-v153" data-runtime-map style="width:${map.width}px;height:${map.height}px;${map.background?`background-image:url('${esc(map.background)}')`:''}">${S.gridMarkup(map)}${S.wallsMarkup(map)}<canvas class="hub-fog-v157" data-fog></canvas><svg class="hub-route-v160" data-route viewBox="0 0 ${map.width} ${map.height}" aria-hidden="true"></svg>${objectsHtml(p)}<div class="hub-player-v153" style="left:${state.x}px;top:${state.y}px">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.displayName||'Персонаж')}">`:`<span>${esc(p.avatarGlyph||(p.displayName||p.id||'?')[0].toUpperCase())}</span>`}</div></div>`;}
    function show(){
      epoch++;walking=false;
      const root=B.root();if(!root)return; if(!refresh()){root.innerHTML='<div class="hub-empty-v153">Персонаж сейчас не находится в хабе.</div>';return;}
      B.activate?.();const p=B.currentPlayer();
      root.innerHTML=`<div class="hub-shell-v153"><div class="hub-map-wrap-v153">${mapHtml(p)}</div><aside class="hub-panel-v153"><div class="hub-card-v153"><h3>${esc(ctx.planet.name)}</h3><div>${esc(ctx.map.name)}</div></div><div class="hub-card-v153" data-info>Выберите объект или гекс назначения. Стены перекрывают путь и обзор; туман раскрывается после каждого шага.</div><div class="hub-card-v153"><button class="secondary" data-stocks>ОТКРЫТЬ БИРЖУ</button></div></aside></div>`;
      root.querySelectorAll('[data-object]').forEach(el=>el.onclick=e=>{e.stopPropagation();select(el.dataset.object);});
      root.querySelector('[data-stocks]').onclick=()=>B.openStocks();
      const map=root.querySelector('[data-runtime-map]');S.drawFog(map.querySelector('[data-fog]'),ctx.map,ctx.state,p);map.parentElement.scrollTo({left:ctx.state.x-map.parentElement.clientWidth/2,top:ctx.state.y-map.parentElement.clientHeight/2});
      let hoverKey='',frame=0,pointer=null;
      const position=e=>{const r=map.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*ctx.map.width,y:(e.clientY-r.top)/r.height*ctx.map.height};};
      map.onpointermove=e=>{
        pointer=e;if(walking||frame)return;
        frame=requestAnimationFrame(()=>{frame=0;if(walking||!map.isConnected)return;
          if(pointer.target.closest('[data-object]')){hoverKey='';drawRoute(map,[]);return;}
          const at=position(pointer),goal=S.nearest(ctx.map,at.x,at.y),key=goal&&S.cellKey(goal);
          if(key===hoverKey)return;hoverKey=key;
          const route=S.path(ctx.map,ctx.state,at.x,at.y);drawRoute(map,route,goal);
        });
      };
      map.onpointerleave=()=>{pointer=null;hoverKey='';if(frame)cancelAnimationFrame(frame);frame=0;if(!walking)drawRoute(map,[]);};
      map.onclick=e=>{if(e.target.closest('[data-object]')||walking)return;hoverKey='';const at=position(e);walk(at.x,at.y);};
    }
    function drawRoute(mapNode,route,goal){
      const overlay=mapNode.querySelector('[data-route]');if(!overlay)return;
      if(!route.length){const here=S.hex(ctx.map,ctx.state.x,ctx.state.y);overlay.innerHTML=goal&&S.distance(here,goal)?`<polygon class="hub-route-blocked-v160" points="${S.polygon(ctx.map,goal)}"/>`:'';return;}
      const points=[ctx.state,...route].map(p=>p.x+','+p.y).join(' '),last=route[route.length-1];
      overlay.innerHTML=`<polyline points="${points}"/>${route.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4"/>`).join('')}<polygon points="${S.polygon(ctx.map,last)}"/>`;
    }
    function animateStep(token,destination){
      return new Promise(resolve=>{let done=false,timer;const finish=e=>{if(e&&e.target!==token)return;if(done)return;done=true;clearTimeout(timer);token.removeEventListener('transitionend',finish);resolve();};token.addEventListener('transitionend',finish);timer=setTimeout(finish,180);token.style.left=destination.x+'px';token.style.top=destination.y+'px';});
    }
    function resetToken(token,at){const transition=token.style.transition;token.style.transition='none';token.style.left=at.x+'px';token.style.top=at.y+'px';token.getBoundingClientRect();token.style.transition=transition;}
    async function walk(x,y){
      if(walking||!refresh())return;const currentEpoch=epoch,playerId=ctx.playerId,planetId=ctx.planet.id,mapId=ctx.map.id,root=B.root(),mapNode=root.querySelector('[data-runtime-map]');
      const route=S.path(ctx.map,ctx.state,x,y);if(!route.length){const target=S.nearest(ctx.map,x,y),here=S.hex(ctx.map,ctx.state.x,ctx.state.y);if(target&&S.distance(here,target))B.notify('Нет доступного пути к этому гексу','err');return;}
      walking=true;drawRoute(mapNode,route);mapNode.classList.add('hub-walking-v157');root.querySelector('[data-info]').textContent='Движение…';
      const active=()=>epoch===currentEpoch&&B.isActive()&&B.currentPlayer()?.id===playerId&&B.currentPlanet()?.id===planetId&&mapNode.isConnected;
      try{
        for(const [routeIndex,destination] of route.entries()){
          if(!active())break;const from={x:ctx.state.x,y:ctx.state.y};
          const token=mapNode.querySelector('.hub-player-v153');
          const save=transact((p,s,h)=>{if(s.mapId!==mapId||Math.hypot(s.x-from.x,s.y-from.y)>1)throw new Error('Положение персонажа изменилось. Выберите путь заново.');S.step(h.maps.find(m=>m.id===mapId),s,p,destination);},null);
          const animation=animateStep(token,destination);
          try{await Promise.all([save,animation]);}catch(e){await animation;if(active())resetToken(token,from);throw e;}
          if(!active())break;drawRoute(mapNode,route.slice(routeIndex+1));S.drawFog(mapNode.querySelector('[data-fog]'),ctx.map,ctx.state,B.currentPlayer());
          // Replace visible objects without rebuilding the terrain or interrupting the player animation.
          const fresh=document.createElement('div');fresh.innerHTML=objectsHtml(B.currentPlayer());
          mapNode.querySelectorAll('[data-object]').forEach(n=>n.remove());fresh.querySelectorAll('[data-object]').forEach(n=>{mapNode.append(n);n.onclick=e=>{e.stopPropagation();select(n.dataset.object);};});
          const wrap=mapNode.parentElement,tx=destination.x,ty=destination.y;if(tx<wrap.scrollLeft+50||tx>wrap.scrollLeft+wrap.clientWidth-50||ty<wrap.scrollTop+50||ty>wrap.scrollTop+wrap.clientHeight-50)wrap.scrollTo({left:tx-wrap.clientWidth/2,top:ty-wrap.clientHeight/2,behavior:'smooth'});
        }
      }catch(e){B.notify(e.message,'err');}
      finally{if(epoch===currentEpoch){walking=false;drawRoute(mapNode,[]);mapNode.classList.remove('hub-walking-v157');if(active())root.querySelector('[data-info]').textContent='Выберите объект или следующий гекс.';}}
    }

    function objectNow(id,p,s,h){const o=h.maps.find(m=>m.id===s.mapId)?.objects.find(o=>o.id===id);if(!o||!C.visible(o,p,s))throw new Error('Объект недоступен');S.assertObject(h,o,p,s);return o;}
    function select(id){
      if(walking)return;refresh();const o=ctx?.map.objects.find(o=>o.id===id),info=B.root()?.querySelector('[data-info]');if(!o||!info||!S.inSight(ctx.map,ctx.state,B.currentPlayer(),o))return;
      const p=B.currentPlayer(),why=C.access(o,p,ctx.state),dialogs=C.dialogsFor(ctx.hub,o,p,ctx.state);
      info.innerHTML=`<b>${esc(o.name||'Объект')}</b><p>${esc(o.description||'')}</p>${why?`<p>${esc(why)}</p>`:''}<div class="hub-actions-v153">${['door','terminal','transition','item'].includes(o.type)||o.setFlag||o.clearFlag?'<button class="primary" data-use>ИСПОЛЬЗОВАТЬ</button>':''}${dialogs.map(d=>`<button class="secondary" data-dialog="${esc(d.id)}">${esc(d.name||'Диалог')}</button>`).join('')}${C.trader(o)?'<button class="secondary" data-trade>ТОРГОВАТЬ</button>':''}</div><div data-status role="status"></div>`;
      if(why)info.querySelectorAll('button').forEach(b=>{b.disabled=true;b.dataset.blocked='1';});
      info.querySelector('[data-use]')?.addEventListener('click',()=>busy(info,()=>transact((p,s,h)=>{const live=objectNow(id,p,s,h);if(live.articleId&&!B.article(live.articleId))throw new Error('Статья не найдена');C.use(h,live,p,s);return live.articleId;}),articleId=>{if(B.isActive()){show();select(id);}if(articleId)B.openArticle(articleId);}));
      info.querySelectorAll('[data-dialog]').forEach(b=>b.onclick=()=>openDialog(id,b.dataset.dialog));
      info.querySelector('[data-trade]')?.addEventListener('click',()=>merchant(id));
    }
    function openDialog(objectId,dialogId){
      if(walking||!refresh())return;const object=ctx.map.objects.find(x=>x.id===objectId),dialog=ctx.hub.dialogs.find(x=>x.id===dialogId);
      if(!object||!dialog||!S.inSight(ctx.map,ctx.state,B.currentPlayer(),object))return;
      const playerId=ctx.playerId,planetId=ctx.planet.id,mapId=ctx.map.id;
      document.querySelector('.hub-modal-v153:not(.hub-conversation-v161)')?.remove();
      return window.GRPGDialogViewV161.open({
        npc:B.npc,
        snapshot:()=>{
          if(!refresh()||ctx.playerId!==playerId||ctx.planet.id!==planetId||ctx.map.id!==mapId||!B.isActive())return {why:'Conversation is no longer available'};
          const p=B.currentPlayer(),o=ctx.map.objects.find(x=>x.id===objectId),d=ctx.hub.dialogs.find(x=>x.id===dialogId),id=d&&(ctx.state.dialogCursors[C.key(d.id,mapId,objectId)]||d.startNodeId),n=d?.nodes.find(x=>x.id===id);
          return {dialog:d,node:n,object:o,player:p,state:ctx.state,why:!o||!S.inSight(ctx.map,ctx.state,p,o)?'The speaker is unavailable':''};
        },
        choose:(choiceId,nodeId)=>{if(!B.isActive()||B.currentPlayer()?.id!==playerId||B.currentPlanet()?.id!==planetId)throw new Error('Conversation is no longer available');return transact((p,s,h)=>{if(s.mapId!==mapId)throw new Error('The speaker is on another map');return C.advance(h,objectId,dialogId,nodeId,choiceId,p,s);},null);},
        onLeave:()=>{if(B.isActive()&&B.currentPlayer()?.id===playerId&&B.currentPlanet()?.id===planetId){show();select(objectId);}},
        openArticle:B.openArticle
      });
    }
    function merchant(id){
      if(walking)return;refresh();const o=ctx.map.objects.find(x=>x.id===id);if(!o||!C.trader(o)||!S.inSight(ctx.map,ctx.state,B.currentPlayer(),o))return;
      let rotation;try{rotation=C.merchantRotation(o,B.item,{...B.marketContext?.(),planetId:ctx.planet.id,mapId:ctx.map.id});}catch(e){B.notify(e.message,'err');return;}
      const playerId=ctx.playerId,planetId=ctx.planet.id,mapId=ctx.map.id,config=JSON.stringify(o.merchantMarket);
      window.GRPGMerchantUIV163.open({
        name:o.name,rotation,item:B.item,itemThumb:B.itemThumb,inventoryLayout:p=>B.inventoryLayout?.(C.clone(p)),player:B.currentPlayer,canAdd:B.canAdd,once:o.once,notify:B.notify,
        available:()=>B.isActive()&&B.currentPlayer()?.id===playerId&&B.currentPlanet()?.id===planetId&&C.stateFor(B.currentPlayer(),B.currentPlanet(),C.hubOf(B.currentPlanet())).mapId===mapId,
        transact:(chosen,quantity)=>transact((p,s,h)=>{
          if(s.mapId!==mapId)throw new Error('The merchant is on another map');
          const live=objectNow(id,p,s,h),quote={rotationKey:rotation.rotationKey,price:rotation.offers.find(e=>e.itemId===chosen.itemId)?.price,config};
          if(chosen.source==='market')C.purchase(h,live,chosen.itemId,p,s,B.item(chosen.itemId),B.canAdd,B.marketContext?.()||{},quote,quantity);
          else if(chosen.source==='inventory')C.sell(h,live,chosen.itemId,chosen.unitIndex,p,s,B.item(chosen.itemId),B.marketContext?.()||{},quote);
          else throw new Error('Select an inventory item');
        },chosen.source==='market'?'Покупка сохранена':'Продажа сохранена'),
        onLeave:()=>{if(B.isActive()&&B.currentPlayer()?.id===playerId&&B.currentPlanet()?.id===planetId){show();select(id);}}
      });
    }
    return {show,select,openDialog,merchant,transact,refresh,walk};
  }
  window.GRPGHubRuntimeV156={create};
})();
