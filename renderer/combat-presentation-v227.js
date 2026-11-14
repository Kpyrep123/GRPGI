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
 function camera(width,height,view={},vw,vh,wholeMap=false){
  const fit=Math.min(vw/width,vh/height);
  const sourceFit=Math.min(view.viewportWidth/width,view.viewportHeight/height);
  const scale=wholeMap||!(sourceFit>0)?fit:sourceFit*Math.min(vw/view.viewportWidth,vh/view.viewportHeight);
  const boardWidth=width*scale,boardHeight=height*scale;
  const ratio=view.boardWidth>0?boardWidth/view.boardWidth:1;
  const zoom=wholeMap?1:Math.min(3.5,Math.max(.45,Number(view.zoom)||1));
  return {boardWidth,boardHeight,zoom,panX:wholeMap?0:(Number(view.panX)||0)*ratio,panY:wholeMap?0:(Number(view.panY)||0)*ratio};
 }
 function projectile(scene,start,target,hit){
  if(hit)return {...target};
  const dx=target.x-start.x,dy=target.y-start.y;
  if(!dx&&!dy)return {x:scene.width,y:start.y};
  // Offset the ray to pass beside the target, then intersect the map boundary.
  const angle=Math.atan2(dy,dx)+Math.atan2(.65,Math.hypot(dx,dy))*(dy>=0?1:-1);
  const x=Math.cos(angle),y=Math.sin(angle);
  const t=Math.min(x>0?(scene.width-start.x)/x:x<0?-start.x/x:Infinity,y>0?(scene.height-start.y)/y:y<0?-start.y/y:Infinity);
  return {x:Math.max(0,Math.min(scene.width,start.x+t*x)),y:Math.max(0,Math.min(scene.height,start.y+t*y))};
 }
 function paintShots(stage,scene,shots){
  if(!stage)return;
  let layer=stage.querySelector('.combat-shot-layer');
  if(!layer){
   layer=document.createElement('div');
   layer.className='combat-shot-layer';
   stage.append(layer);
  }
  const previous=Number(layer.dataset.lastShot)||0;
  for(const shot of shots||[]){
   const age=Math.max(0,Date.now()-shot.at);
   if(shot.id<=previous||age>shot.duration+1500)continue;
   layer.dataset.lastShot=String(shot.id);
   const node=document.createElement('div');
   node.className='combat-projectile';
   const from=[shot.start.x/scene.width*100,shot.start.y/scene.height*100];
   const to=[shot.end.x/scene.width*100,shot.end.y/scene.height*100];
   const delay=Math.min(age,shot.duration/3);
   node.style.setProperty('--shot-from-x',from[0]+'%');
   node.style.setProperty('--shot-from-y',from[1]+'%');
   node.style.setProperty('--shot-to-x',to[0]+'%');
   node.style.setProperty('--shot-to-y',to[1]+'%');
   node.style.setProperty('--shot-duration',shot.duration+'ms');
   node.style.setProperty('--shot-delay',-delay+'ms');
   node.addEventListener('animationend',()=>node.remove(),{once:true});
   layer.append(node);
   setTimeout(()=>node.remove(),shot.duration+100);
  }
 }
 const api={order,camera,projectile,paintShots};root.GRPGCombatPresentationV227=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
