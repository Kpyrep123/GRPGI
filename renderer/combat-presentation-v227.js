/* Shared initiative presentation. Callers filter rows for their audience. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
 function order(tokens,{currentId='',selectedId='',interactive=false,showNpcHealth=false}={}){
  return tokens.map((token,index)=>{
   const tag=interactive?'button':'div',hp=Math.max(0,Number(token.hpCurrent)||0),max=Math.max(1,Number(token.hpMax)||1),current=token.id===currentId;
   return `<${tag} ${interactive?`type="button" data-battle-unit226="${esc(token.id)}" aria-pressed="${token.id===selectedId}"`:''} class="battle-order-unit-v226 ${current?'is-current':''} ${token.id===selectedId?'is-selected':''}" ${current?'aria-current="step"':''} title="${esc(token.name)} · инициатива ${Number(token.initiative)||0}"><i>${index+1}</i><span class="battle-portrait-v226" aria-hidden="true">${token.image?`<img src="${esc(token.image)}" alt=""/>`:esc(String(token.name||'?').slice(0,2).toUpperCase())}</span><span><b>${esc(token.name)}</b><small>${current?'ХОДИТ СЕЙЧАС':'Инициатива '+(Number(token.initiative)||0)}</small>${token.playerId||showNpcHealth?`<span class="battle-health-v226"><i style="width:${Math.min(100,hp/max*100)}%"></i></span>`:''}</span></${tag}>`;
  }).join('');
 }
 const api={order};root.GRPGCombatPresentationV227=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
