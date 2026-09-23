const root = document.getElementById('player-display-root');
let playerDisplayMirror = { mode: '', eraTheme: 'technological', graphicsMode: 'full', activeSceneId: '', cameraByScene: {}, combatSnapshot: null, updatedAt: null };
let playerDisplayCachedWorld = {};
let playerDisplayCachedState = {};
let playerDisplayRefreshInFlight = false;
let combatDisplaySceneId = '';
let combatDisplayStaticSig = '';
let combatDisplayFogSig = '';
let combatTokenState = new Map();
let lastSignature = '';

function normalizeMirrorPayload(payload = {}) {
  return {
    mode: String(payload?.mode || '').trim(),
    eraTheme: ['medieval','industrial','technological'].includes(String(payload?.eraTheme || '').trim()) ? String(payload.eraTheme).trim() : 'technological',
    graphicsMode: String(payload?.graphicsMode || '').trim() === 'lite' ? 'lite' : 'full',
    activeRegionMapId: String(payload?.activeRegionMapId || '').trim(),
    activeSceneId: String(payload?.activeSceneId || '').trim(),
    cameraByScene: payload?.cameraByScene && typeof payload.cameraByScene === 'object' ? payload.cameraByScene : {},
    combatSnapshot: payload?.combatSnapshot && typeof payload.combatSnapshot === 'object' ? payload.combatSnapshot : null,
    regionCamera: payload?.regionCamera && typeof payload.regionCamera === 'object' ? payload.regionCamera : null,
    regionDisplay: payload?.regionDisplay && typeof payload.regionDisplay === 'object' ? payload.regionDisplay : null,
    regionRuntime: payload?.regionRuntime && typeof payload.regionRuntime === 'object' ? payload.regionRuntime : null,
    selectedRegionTokenId: String(payload?.selectedRegionTokenId || '').trim(),
    updatedAt: payload?.updatedAt || null
  };
}
function applyPlayerDisplayEraTheme() {
  const era = ['medieval','industrial','technological'].includes(String(playerDisplayMirror?.eraTheme || '')) ? playerDisplayMirror.eraTheme : 'technological';
  const graphicsMode = playerDisplayMirror?.graphicsMode === 'lite' ? 'lite' : 'full';
  document.documentElement.dataset.eraTheme = era;
  document.documentElement.dataset.graphicsMode = graphicsMode;
  document.body?.setAttribute('data-era-theme', era);
  document.body?.setAttribute('data-graphics-mode', graphicsMode);
}
function esc(v = '') { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function clamp(v,min,max){return Math.max(min,Math.min(max,Number(v||0)));}
function list(v){return Array.isArray(v)?v:[];}
function num(v,f=0){return Number.isFinite(Number(v))?Number(v):f;}
function initials(name='',fallback='•'){const w=String(name||'').trim().split(/\s+/).filter(Boolean);return w.length?w.slice(0,2).map(x=>x[0]?.toUpperCase()||'').join(''):fallback;}
function scaleMirroredPan(rawPan,destinationSize,sourceSize){const dst=Math.max(1,num(destinationSize,1)),src=Math.max(1,num(sourceSize,dst));return num(rawPan)*(dst/src);}
function clampMirroredView(view,viewportWidth,viewportHeight){const zoom=clamp(num(view?.zoom,1),.45,3.5),width=Math.max(1,num(viewportWidth,innerWidth||1280)),height=Math.max(1,num(viewportHeight,innerHeight||720));const maxPanX=width*Math.max(.18,(zoom-1)*.62+.18),maxPanY=height*Math.max(.18,(zoom-1)*.62+.18);return{zoom,panX:clamp(num(view?.panX),-maxPanX,maxPanX),panY:clamp(num(view?.panY),-maxPanY,maxPanY)};}
function normalizeScene(scene={}){const requested=String(scene.fogMode||'').trim();const fogMode=scene.fogEnabled===false?'off':(['off','cover','objects'].includes(requested)?requested:'cover');return{id:String(scene.id||''),name:String(scene.name||'Сцена'),width:Math.max(1,num(scene.width,20)),height:Math.max(1,num(scene.height,12)),backgroundColor:String(scene.backgroundColor||'#0b1420'),backgroundImage:String(scene.backgroundImage||''),gridColor:String(scene.gridColor||'rgba(190,215,230,.20)'),fogEnabled:fogMode!=='off',fogMode,showInitiativeToPlayers:Boolean(scene.showInitiativeToPlayers),assets:list(scene.assets),templates:list(scene.templates)};}
function normalizeToken(token={}){return{...token,id:String(token.id||''),name:String(token.name||'Юнит'),image:String(token.image||''),color:String(token.color||'#7df9ff'),x:num(token.x),y:num(token.y),w:Math.max(.1,num(token.w,1)),h:Math.max(.1,num(token.h,1)),rotation:num(token.rotation),hpCurrent:num(token.hpCurrent,1),hpMax:Math.max(1,num(token.hpMax,1)),hidden:Boolean(token.hidden),visibleToPlayers:token.visibleToPlayers!==false,showNameToPlayers:token.showNameToPlayers!==false,proneV122:Boolean(token.proneV122),playerId:String(token.playerId||''),sharesVisionWithPlayers:token.sharesVisionWithPlayers==null?Boolean(token.playerId):Boolean(token.sharesVisionWithPlayers),resolvedVisionCells:Math.max(0,num(token.resolvedVisionCells,token.visionRadius||6)),resolvedVisionRadius:Math.max(0,num(token.resolvedVisionRadius,0))};}
function hexGridSvg(scene){const w=scene.width,h=scene.height,side=.42,hexH=Math.sqrt(3)*side,stepX=side*1.5,paths=[];for(let col=0,cx=side;cx<=w+side;col++,cx=side+col*stepX){const offset=(col%2)*hexH/2;for(let row=0,cy=hexH/2+offset;cy<=h+hexH/2;row++,cy=hexH/2+offset+row*hexH){const pts=[];for(let i=0;i<6;i++){const a=Math.PI/3*i;pts.push(`${(cx+side*Math.cos(a)).toFixed(3)},${(cy+side*Math.sin(a)).toFixed(3)}`);}paths.push(`<polygon points="${pts.join(' ')}"/>`);}}return `<svg class="scene-hex-grid-v104" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><g>${paths.join('')}</g></svg>`;}
function hexMetrics109(){const side=.42,hexH=Math.sqrt(3)*side;return{side,hexH,stepX:side*1.5};}
function nearestHexNode109(scene,point={x:0,y:0}){const {side,hexH,stepX}=hexMetrics109(),w=Math.max(1,num(scene?.width,20)),h=Math.max(1,num(scene?.height,12)),approx=Math.round((num(point.x)-side)/stepX);let best=null,bestD=Infinity;for(let col=Math.max(0,approx-3);col<=approx+3;col++){const cx=side+col*stepX;if(cx<0||cx>w)continue;const base=hexH/2+(col%2)*hexH/2,row0=Math.round((num(point.y)-base)/hexH);for(let row=Math.max(0,row0-3);row<=row0+3;row++){const cy=base+row*hexH;if(cy<0||cy>h)continue;const d=(cx-num(point.x))**2+(cy-num(point.y))**2;if(d<bestD){bestD=d;best={col,row,x:cx,y:cy};}}}return best||{col:0,row:0,x:side,y:hexH/2};}
function oddQToCube109(node){const q=num(node?.col,0),row=num(node?.row,0),r=row-(q-(q&1))/2;return{x:q,z:r,y:-q-r};}
function cubeToOddQ109(cube){const col=Math.round(num(cube?.x,0)),z=Math.round(num(cube?.z,0)),row=Math.round(z+(col-(col&1))/2);return{col,row};}
function hexNode109(scene,col,row){const {side,hexH,stepX}=hexMetrics109(),x=side+col*stepX,y=hexH/2+(col%2)*hexH/2+row*hexH;if(col<0||row<0||x<0||x>scene.width||y<0||y>scene.height)return null;return{col,row,x,y};}
function hexDistance109(scene,a,b){const ac=oddQToCube109(nearestHexNode109(scene,a)),bc=oddQToCube109(nearestHexNode109(scene,b));return Math.max(Math.abs(ac.x-bc.x),Math.abs(ac.y-bc.y),Math.abs(ac.z-bc.z));}
function hexLabel109(value){const n=Math.max(0,Math.round(num(value,0)));return `${n} ${n===1?'гекс':'гексов'}`;}
function pct(v,total){return `${(num(v)/Math.max(.0001,num(total,1))*100).toFixed(5)}%`;}
function pointSegmentDistance(p,a,b){const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,c1=vx*wx+vy*wy;if(c1<=0)return Math.hypot(p.x-a.x,p.y-a.y);const c2=vx*vx+vy*vy;if(c2<=c1)return Math.hypot(p.x-b.x,p.y-b.y);const t=c1/c2;return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy));}
function pointInPolygon(point,points=[]){let inside=false;if(points.length<3)return false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j],hit=((a.y>point.y)!==(b.y>point.y))&&(point.x<(b.x-a.x)*(point.y-a.y)/((b.y-a.y)||1e-9)+a.x);if(hit)inside=!inside;}return inside;}
function orient(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function segIntersects(a,b,c,d){const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);if(((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0)))return true;return false;}
function segmentIntersectsRect(a,b,r){const corners=[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}];if((a.x>=r.x&&a.x<=r.x+r.w&&a.y>=r.y&&a.y<=r.y+r.h)||(b.x>=r.x&&b.x<=r.x+r.w&&b.y>=r.y&&b.y<=r.y+r.h))return true;for(let i=0;i<4;i++)if(segIntersects(a,b,corners[i],corners[(i+1)%4]))return true;return false;}
function blocksSightBetween(scene,a,b){
  for(const asset of scene.assets){if(asset.blockSight&&segmentIntersectsRect(a,b,{x:num(asset.x),y:num(asset.y),w:num(asset.w,1),h:num(asset.h,1)}))return true;}
  for(const zone of scene.templates){if(!zone.blockSight)continue;const points=list(zone.points).map(p=>({x:num(p.x),y:num(p.y)}));if(zone.shape==='wall'&&points.length>1){for(let i=1;i<points.length;i++)if(segIntersects(a,b,points[i-1],points[i]))return true;}else if(zone.shape==='polygon'&&points.length>2){if(pointInPolygon(b,points))return true;for(let i=0;i<points.length;i++)if(segIntersects(a,b,points[i],points[(i+1)%points.length]))return true;}else if(segmentIntersectsRect(a,b,{x:num(zone.x),y:num(zone.y),w:num(zone.w,1),h:num(zone.h,1)}))return true;}
  return false;
}
function combatVisionSources(runtime){const step=hexMetrics109().hexH;return list(runtime.tokens).map(normalizeToken).filter(t=>(t.playerId||t.sharesVisionWithPlayers)&&!t.hidden&&t.visibleToPlayers).map(token=>({token,origin:{x:token.x+token.w/2,y:token.y+token.h/2},radiusHexes:Math.max(0,num(token.resolvedVisionCells,6)),radius:Math.max(.1,num(token.resolvedVisionRadius,0)||Math.max(0,num(token.resolvedVisionCells,6))*step)}));}
function pointVisibleToPlayers(scene,sources,point){for(const src of sources){if(hexDistance109(scene,src.origin,point)>Math.floor(src.radiusHexes+1e-6))continue;if(!blocksSightBetween(scene,src.origin,point))return true;}return false;}
function visibleHexesForSource109(scene,src){const center=nearestHexNode109(scene,src.origin),cc=oddQToCube109(center),radius=Math.max(0,Math.floor(num(src.radiusHexes,0)+1e-6)),out=[];for(let dx=-radius;dx<=radius;dx++){const yMin=Math.max(-radius,-dx-radius),yMax=Math.min(radius,-dx+radius);for(let dy=yMin;dy<=yMax;dy++){const dz=-dx-dy,cube={x:cc.x+dx,y:cc.y+dy,z:cc.z+dz},off=cubeToOddQ109(cube),node=hexNode109(scene,off.col,off.row);if(!node)continue;if((node.col!==center.col||node.row!==center.row)&&blocksSightBetween(scene,src.origin,node))continue;out.push(node);}}return out;}
function raycastVisionDistance(scene,origin,angle,radius){const target={x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius};if(!blocksSightBetween(scene,origin,target))return radius;let lo=0,hi=radius;for(let i=0;i<11;i++){const mid=(lo+hi)/2,p={x:origin.x+Math.cos(angle)*mid,y:origin.y+Math.sin(angle)*mid};if(blocksSightBetween(scene,origin,p))hi=mid;else lo=mid;}return Math.max(0,lo-.015);}
function previewMarkup(scene,p){if(!p)return'';const label=p.label||'';if(p.kind==='route'){const pts=list(p.points).map(v=>`${num(v.x)},${num(v.y)}`).join(' '),end=p.end||p.points?.at?.(-1);return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polyline class="scene-route-v104 ${p.limited?'limited':''} ${p.blocked?'blocked':''}" points="${pts}"/>${p.limited&&end?`<g class="scene-route-cross-v104" transform="translate(${num(end.x)} ${num(end.y)})"><path d="M-.28-.28 L.28.28 M.28-.28 L-.28.28"/></g>`:''}</svg><div class="scene-measure-label-v104">${esc(label)}</div>`;}
  if(['measure','circle','cone'].includes(p.kind)){const a=p.start||{},b=p.end||{},r=Math.max(0,num(p.radius,Math.hypot(num(b.x)-num(a.x),num(b.y)-num(a.y)))),text=label||`${p.kind==='measure'?'Дистанция':'Радиус'}: ${hexLabel109(p.hexes??hexDistance109(scene,a,b))}`;if(p.kind==='circle')return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><circle class="scene-measure-shape-v104" cx="${num(a.x)}" cy="${num(a.y)}" r="${r}"/></svg><div class="scene-measure-label-v104">${esc(text)}</div>`;if(p.kind==='cone'){const ang=Math.atan2(num(b.y)-num(a.y),num(b.x)-num(a.x)),spread=Math.PI/6,p1={x:num(a.x)+Math.cos(ang-spread)*r,y:num(a.y)+Math.sin(ang-spread)*r},p2={x:num(a.x)+Math.cos(ang+spread)*r,y:num(a.y)+Math.sin(ang+spread)*r};return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><path class="scene-measure-shape-v104" d="M ${num(a.x)} ${num(a.y)} L ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y} Z"/></svg><div class="scene-measure-label-v104">${esc(text)}</div>`;}return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><line class="scene-measure-line-v104" x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}"/></svg><div class="scene-measure-label-v104">${esc(text)}</div>`;}
  if(p.kind==='grenade'){const a=p.start||{},b=p.end||{},r=Math.max(0,num(p.radius)),text=label||'Граната';return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><line class="scene-grenade-line-v105 ${p.limited?'limited':''}" x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}"/><circle class="scene-grenade-area-v105" cx="${num(b.x)}" cy="${num(b.y)}" r="${r}"/><circle class="scene-grenade-center-v105" cx="${num(b.x)}" cy="${num(b.y)}" r=".10"/>${p.limited?`<g class="scene-route-cross-v104" transform="translate(${num(b.x)} ${num(b.y)})"><path d="M-.28-.28 L.28.28 M.28-.28 L-.28.28"/></g>`:''}</svg><div class="scene-measure-label-v104">${esc(text)}</div>`;}
  return'';
}
function zoneMarkup(scene,zone){if(zone.visibleToPlayers===false)return'';const id=esc(zone.id||''),color=esc(zone.color||'rgba(255,190,92,.35)'),points=list(zone.points).map(p=>`${num(p.x)},${num(p.y)}`).join(' ');if(zone.shape==='wall'&&points)return `<svg class="player-scene-vector-v104 player-scene-zone-node-v112" data-player-zone-v112="${id}" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polyline class="player-scene-wall-v104" points="${points}" style="--zone-color:${color};stroke-width:${Math.max(.04,num(zone.thickness,.18))}"/></svg>`;if(zone.shape==='polygon'&&points)return `<svg class="player-scene-vector-v104 player-scene-zone-node-v112" data-player-zone-v112="${id}" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polygon class="player-scene-polygon-v104" points="${points}" style="--zone-color:${color}"/></svg>`;return `<div class="player-scene-object-v104 player-scene-zone-v104 player-scene-zone-node-v112 shape-${esc(zone.shape||'rect')}" data-player-zone-v112="${id}" style="left:${pct(zone.x,scene.width)};top:${pct(zone.y,scene.height)};width:${pct(zone.w,scene.width)};height:${pct(zone.h,scene.height)};transform:rotate(${num(zone.rotation)}deg);--template-color:${color};z-index:${num(zone.z,25)}">${zone.label?`<span class="combat-template-label">${esc(zone.label)}</span>`:''}</div>`;}
function staticSceneSignature(scene){return JSON.stringify([scene.id,scene.width,scene.height,scene.backgroundColor,scene.backgroundImage,scene.gridColor,scene.fogMode,scene.showInitiativeToPlayers,scene.assets,scene.templates]);}
function ensureCombatBoard(scene){
  if(combatDisplaySceneId!==scene.id||!root.querySelector('.player-scene-v104')){
    combatDisplaySceneId=scene.id;combatDisplayStaticSig='';combatDisplayFogSig='';combatTokenState.clear();
    root.innerHTML=`<div class="player-scene-v104"><div class="player-scene-board-v104"><div class="player-scene-stage-v104"><div class="combat-stage-bg"></div><div class="player-scene-grid-v104"></div><div class="player-scene-layer-v104 player-scene-assets-v104"></div><div class="player-scene-layer-v104 player-scene-zones-v104"></div><div class="player-scene-layer-v104 player-scene-tokens-v104"></div><canvas class="player-scene-fog-v104"></canvas><div class="player-scene-preview-v104"></div></div></div><div class="player-scene-initiative-v112"></div></div>`;
  }
  const sig=staticSceneSignature(scene);if(sig!==combatDisplayStaticSig){
    combatDisplayStaticSig=sig;
    const bg=root.querySelector('.combat-stage-bg');if(bg){bg.style.backgroundImage=scene.backgroundImage?`url('${scene.backgroundImage.replace(/'/g,"%27")}')`:'';bg.style.backgroundColor=scene.backgroundColor;}
    const grid=root.querySelector('.player-scene-grid-v104');if(grid)grid.innerHTML=hexGridSvg(scene);
    const assets=root.querySelector('.player-scene-assets-v104');if(assets)assets.innerHTML=scene.assets.filter(a=>a.visibleToPlayers!==false).map(a=>`<div class="player-scene-object-v104 player-scene-asset-v104" data-player-asset-v112="${esc(a.id||'')}" style="left:${pct(a.x,scene.width)};top:${pct(a.y,scene.height)};width:${pct(a.w,scene.width)};height:${pct(a.h,scene.height)};transform:rotate(${num(a.rotation)}deg);z-index:${num(a.z,10)};opacity:${clamp(num(a.opacity,1),.05,1)}">${a.image?`<img src="${esc(a.image)}" alt=""/>`:`<span>${esc(initials(a.name,'◫'))}</span>`}</div>`).join('');
    const zones=root.querySelector('.player-scene-zones-v104');if(zones)zones.innerHTML=scene.templates.map(z=>zoneMarkup(scene,z)).join('');
  }
}
function updateCombatCamera(scene){const vw=Math.max(1,num(innerWidth,1280)),vh=Math.max(1,num(innerHeight,720)),aspect=scene.width/scene.height;let bw=vw,bh=bw/aspect;if(bh>vh){bh=vh;bw=bh*aspect;}const raw=playerDisplayMirror.cameraByScene?.[scene.id]||{},srcW=Math.max(1,num(raw.boardWidth||raw.viewportWidth,bw)),srcH=Math.max(1,num(raw.boardHeight||raw.viewportHeight,bh)),view=clampMirroredView({zoom:num(raw.zoom,1),panX:scaleMirroredPan(raw.panX,bw,srcW),panY:scaleMirroredPan(raw.panY,bh,srcH)},bw,bh),board=root.querySelector('.player-scene-board-v104');if(board){board.style.width=`${bw.toFixed(2)}px`;board.style.height=`${bh.toFixed(2)}px`;board.style.left='50%';board.style.top='50%';board.style.transform=`translate(-50%,-50%) translate(${view.panX.toFixed(1)}px,${view.panY.toFixed(1)}px) scale(${view.zoom.toFixed(3)})`;}}

function fogActive112(scene){return scene.fogMode!=='off'&&scene.fogEnabled!==false;}
function objectSamplePoints112(obj,kind){
  if(kind==='zone'&&list(obj.points).length){const pts=list(obj.points).map(p=>({x:num(p.x),y:num(p.y)}));const cx=pts.reduce((a,p)=>a+p.x,0)/pts.length,cy=pts.reduce((a,p)=>a+p.y,0)/pts.length;return [{x:cx,y:cy},...pts];}
  const x=num(obj.x),y=num(obj.y),w=Math.max(.01,num(obj.w,1)),h=Math.max(.01,num(obj.h,1));return [{x:x+w/2,y:y+h/2},{x:x+w*.15,y:y+h*.15},{x:x+w*.85,y:y+h*.15},{x:x+w*.15,y:y+h*.85},{x:x+w*.85,y:y+h*.85}];
}
function objectVisible112(scene,sources,obj,kind){return objectSamplePoints112(obj,kind).some(p=>pointVisibleToPlayers(scene,sources,p));}
function updateStaticVisibility112(scene,runtime){
  const restricted=scene.fogMode==='objects',sources=combatVisionSources(runtime);
  for(const asset of scene.assets.filter(a=>a.visibleToPlayers!==false)){const node=root.querySelector(`[data-player-asset-v112="${CSS.escape(String(asset.id||''))}"]`);if(node)node.style.display=!restricted||objectVisible112(scene,sources,asset,'asset')?'':'none';}
  for(const zone of scene.templates.filter(z=>z.visibleToPlayers!==false)){const node=root.querySelector(`[data-player-zone-v112="${CSS.escape(String(zone.id||''))}"]`);if(node)node.style.display=!restricted||objectVisible112(scene,sources,zone,'zone')?'':'none';}
}
function visionBoundaryEdges112(scene,sources){
  const {side}=hexMetrics109(),cells=new Map();for(const src of sources)for(const cell of visibleHexesForSource109(scene,src))cells.set(`${cell.col}:${cell.row}`,cell);
  const edges=new Map();for(const cell of cells.values()){const pts=[];for(let i=0;i<6;i++){const a=Math.PI/3*i;pts.push({x:cell.x+side*Math.cos(a),y:cell.y+side*Math.sin(a)});}for(let i=0;i<6;i++){const a=pts[i],b=pts[(i+1)%6],ka=`${a.x.toFixed(3)},${a.y.toFixed(3)}`,kb=`${b.x.toFixed(3)},${b.y.toFixed(3)}`,key=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;if(edges.has(key))edges.delete(key);else edges.set(key,{a,b});}}
  return [...edges.values()];
}
function tokenKnownToPlayers112(scene,sources,token){const center={x:token.x+token.w/2,y:token.y+token.h/2};return !fogActive112(scene)||Boolean(token.playerId)||Boolean(token.sharesVisionWithPlayers)||pointVisibleToPlayers(scene,sources,center);}
function updateInitiative112(scene,runtime){
  const el=root.querySelector('.player-scene-initiative-v112');if(!el)return;if(!scene.showInitiativeToPlayers){el.hidden=true;el.innerHTML='';return;}
  const sources=combatVisionSources(runtime),tokens=new Map(list(runtime.tokens).map(t=>[t.id,normalizeToken(t)])),order=list(runtime.initiativeOrder),turn=Math.max(0,Math.min(order.length-1,num(runtime.turnIndex,0)));
  const rows=order.map((id,index)=>({token:tokens.get(id),index})).filter(row=>row.token&&!row.token.hidden&&row.token.visibleToPlayers&&tokenKnownToPlayers112(scene,sources,row.token));
  el.hidden=false;el.innerHTML=`<b>ИНИЦИАТИВА</b><div>${rows.map(row=>`<span class="${row.index===turn?'active':''}"><i>${row.index+1}</i>${esc(row.token.showNameToPlayers!==false?row.token.name:'Неизвестный юнит')}</span>`).join('')||'<span>—</span>'}</div>`;
}
function animateTokenAlongRoute(node,token,scene,preview,previous){if(!node||preview?.kind!=='route'||preview.mode!=='move'||!Array.isArray(preview.points)||preview.points.length<2||!previous)return;const final={x:token.x+token.w/2,y:token.y+token.h/2},end=preview.end||preview.points[preview.points.length-1];if(Math.hypot(num(end.x)-final.x,num(end.y)-final.y)>.7)return;const start=preview.points[0];if(Math.hypot(num(start.x)-(previous.x+token.w/2),num(start.y)-(previous.y+token.h/2))>1.2)return;const frames=preview.points.map(p=>({left:pct(num(p.x)-token.w/2,scene.width),top:pct(num(p.y)-token.h/2,scene.height)}));try{node.getAnimations().forEach(a=>a.cancel());node.animate(frames,{duration:Math.max(500,Math.min(2200,(preview.points.length-1)*160)),easing:'ease-in-out'});}catch{}}
function updateTokens(scene,runtime,preview){
  const layer=root.querySelector('.player-scene-tokens-v104');if(!layer)return;const currentId=list(runtime.initiativeOrder)[Math.max(0,num(runtime.turnIndex))]||'',visionSources=combatVisionSources(runtime),wanted=new Set();
  for(const raw of list(runtime.tokens)){
    const token=normalizeToken(raw),fogVisible=tokenKnownToPlayers112(scene,visionSources,token);if(!token.id||token.hidden||!token.visibleToPlayers||!fogVisible)continue;wanted.add(token.id);
    let node=layer.querySelector(`[data-player-token-v104="${CSS.escape(token.id)}"]`),previous=combatTokenState.get(token.id);if(!node){node=document.createElement('div');node.className='player-scene-object-v104 player-scene-token-v104';node.dataset.playerTokenV104=token.id;node.innerHTML=`<span class="player-scene-token-visual-v104"></span><span class="player-scene-token-name-v104"></span><span class="player-scene-token-prone-v128">ЛЕЖИТ</span><span class="player-scene-token-hp-v104"><i></i></span>`;layer.appendChild(node);}
    node.classList.toggle('turn',currentId===token.id);node.classList.toggle('is-prone-v122',token.proneV122);node.style.left=pct(token.x,scene.width);node.style.top=pct(token.y,scene.height);node.style.width=pct(token.w,scene.width);node.style.height=pct(token.h,scene.height);node.style.transform=`rotate(${token.rotation}deg)`;node.style.setProperty('--token-accent',token.color);
    const visual=node.querySelector('.player-scene-token-visual-v104'),name=node.querySelector('.player-scene-token-name-v104'),hpBar=node.querySelector('.player-scene-token-hp-v104'),hp=node.querySelector('.player-scene-token-hp-v104 i');if(visual){const imageSig=`${token.image||''}|name-visible:${token.showNameToPlayers!==false}`;if(visual.dataset.image!==imageSig){visual.dataset.image=imageSig;visual.innerHTML=token.image?`<img src="${esc(token.image)}" alt="" decoding="async" draggable="false"/>`:`<span class="player-scene-token-fallback-v104">${esc(token.showNameToPlayers!==false?initials(token.name,'✦'):'●')}</span>`;}}if(name){name.textContent=token.name;name.style.display=token.showNameToPlayers!==false?'':'none';}if(hpBar)hpBar.style.display=token.playerId?'':'none';if(hp&&token.playerId)hp.style.width=`${clamp(token.hpCurrent/token.hpMax*100,0,100)}%`;
    if(previous&&(previous.x!==token.x||previous.y!==token.y))animateTokenAlongRoute(node,token,scene,preview,previous);if(previous&&token.hpCurrent<previous.hpCurrent){node.classList.remove('player-scene-damage-v104');void node.offsetWidth;node.classList.add('player-scene-damage-v104');if(token.playerId){const pop=document.createElement('span');pop.className='player-scene-damage-pop-v104';pop.textContent=`−${Math.max(0,previous.hpCurrent-token.hpCurrent)}`;node.appendChild(pop);setTimeout(()=>pop.remove(),750);}}combatTokenState.set(token.id,{x:token.x,y:token.y,hpCurrent:token.hpCurrent});
  }
  layer.querySelectorAll('[data-player-token-v104]').forEach(node=>{if(!wanted.has(node.dataset.playerTokenV104)){combatTokenState.delete(node.dataset.playerTokenV104);node.remove();}});
}
function updateFog(scene,runtime){
  const canvas=root.querySelector('.player-scene-fog-v104');if(!canvas)return;const mode=scene.fogMode|| (scene.fogEnabled===false?'off':'cover');if(mode==='off'){canvas.style.display='none';combatDisplayFogSig='';return;}canvas.style.display='block';
  const fogSig=JSON.stringify([mode,scene.width,scene.height,scene.assets.filter(a=>a.blockSight),scene.templates.filter(z=>z.blockSight),list(runtime.tokens).map(t=>[t.id,t.x,t.y,t.w,t.h,t.playerId,t.sharesVisionWithPlayers,t.hidden,t.visibleToPlayers,t.resolvedVisionCells])]);if(fogSig===combatDisplayFogSig)return;combatDisplayFogSig=fogSig;
  const stage=root.querySelector('.player-scene-stage-v104'),cssW=Math.max(1,Math.round(stage?.clientWidth||1000)),cssH=Math.max(1,Math.round(stage?.clientHeight||700)),dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cssW,cssH);const sources=combatVisionSources(runtime),sx=cssW/scene.width,sy=cssH/scene.height,{side}=hexMetrics109();
  if(mode==='cover'){ctx.fillStyle='rgba(0,0,0,.985)';ctx.fillRect(0,0,cssW,cssH);if(sources.length){ctx.globalCompositeOperation='destination-out';ctx.fillStyle='rgba(0,0,0,1)';ctx.beginPath();for(const src of sources){for(const cell of visibleHexesForSource109(scene,src)){for(let i=0;i<6;i++){const a=Math.PI/3*i,x=(cell.x+side*Math.cos(a))*sx,y=(cell.y+side*Math.sin(a))*sy;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();}}ctx.fill();ctx.globalCompositeOperation='source-over';}}
  if(mode==='objects'&&sources.length){const edges=visionBoundaryEdges112(scene,sources);ctx.save();ctx.strokeStyle='rgba(170,226,255,.82)';ctx.lineWidth=1.35;ctx.shadowColor='rgba(90,190,255,.48)';ctx.shadowBlur=5;ctx.lineCap='round';ctx.beginPath();for(const e of edges){ctx.moveTo(e.a.x*sx,e.a.y*sy);ctx.lineTo(e.b.x*sx,e.b.y*sy);}ctx.stroke();ctx.restore();}
}
function previewKnownToPlayers128(scene,runtime,preview){if(!preview)return null;const sourceId=String(preview.sourceTokenId||preview.movedTokenId||'');if(!sourceId)return preview;const source=list(runtime.tokens).find(token=>String(token.id)===sourceId),sources=combatVisionSources(runtime);return source&&!source.hidden&&source.visibleToPlayers&&tokenKnownToPlayers112(scene,sources,source)?preview:null;}
function renderCombatSnapshot(snapshot){if(!snapshot?.scene){root.innerHTML='<div class="player-display-stage player-display-stage--blank"></div>';combatDisplaySceneId='';return;}stopRegionDisplayV36?.();const scene=normalizeScene(snapshot.scene),runtime={...snapshot.runtime,tokens:list(snapshot.runtime?.tokens).map(normalizeToken),initiativeOrder:list(snapshot.runtime?.initiativeOrder)},publicPreview=previewKnownToPlayers128(scene,runtime,snapshot.preview);ensureCombatBoard(scene);updateCombatCamera(scene);updateStaticVisibility112(scene,runtime);updateTokens(scene,runtime,publicPreview);updateInitiative112(scene,runtime);const preview=root.querySelector('.player-scene-preview-v104');if(preview)preview.innerHTML=previewMarkup(scene,publicPreview);requestAnimationFrame(()=>updateFog(scene,runtime));}
async function refresh(){if(playerDisplayRefreshInFlight)return;playerDisplayRefreshInFlight=true;try{if(playerDisplayMirror.mode==='combat'&&playerDisplayMirror.combatSnapshot){renderCombatSnapshot(playerDisplayMirror.combatSnapshot);return;}if(playerDisplayMirror.mode==='region'||playerDisplayMirror.activeRegionMapId){const[state,worldRes]=await Promise.all([window.electronAPI?.loadState?.(),window.electronAPI?.loadWorldData?.()]);playerDisplayCachedState=state||{};playerDisplayCachedWorld=worldRes?.world||{};syncRegionDisplayV36(playerDisplayCachedWorld,playerDisplayCachedState);return;}root.innerHTML='<div class="player-display-stage player-display-stage--blank"></div>';}catch(error){console.error('player-display refresh failed',error);root.innerHTML='<div class="player-display-stage player-display-stage--blank"></div>';}finally{playerDisplayRefreshInFlight=false;}}
setInterval(()=>{if(playerDisplayMirror.mode==='region'||playerDisplayMirror.activeRegionMapId)refresh();},10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.addEventListener('resize',()=>{sizeRegionDisplayFrameV36?.();if(playerDisplayMirror.mode==='combat'&&playerDisplayMirror.combatSnapshot)renderCombatSnapshot(playerDisplayMirror.combatSnapshot);else if(!isRegionDisplayActiveV36?.())refresh();});
window.electronAPI?.onPlayerDisplayDataChanged?.(()=>{if(playerDisplayMirror.mode!=='combat')refresh();});
window.electronAPI?.onCombatRuntimeEvent?.(()=>{}); // combat scenes are local-only in v1.0.106
window.electronAPI?.getPlayerDisplayView?.().then(res=>{if(res?.ok&&res.payload){playerDisplayMirror=normalizeMirrorPayload(res.payload);applyPlayerDisplayEraTheme();refresh();}}).catch(()=>{});
window.electronAPI?.onPlayerDisplayView?.(payload=>{playerDisplayMirror=normalizeMirrorPayload(payload);applyPlayerDisplayEraTheme();if(playerDisplayMirror.mode==='combat'&&playerDisplayMirror.combatSnapshot){renderCombatSnapshot(playerDisplayMirror.combatSnapshot);return;}if(playerDisplayMirror.mode==='region'||playerDisplayMirror.activeRegionMapId){if(playerDisplayMirror.regionCamera)regionDisplayV36.cameraTarget={zoom:num(playerDisplayMirror.regionCamera.zoom,1),panFracX:num(playerDisplayMirror.regionCamera.panFracX),panFracY:num(playerDisplayMirror.regionCamera.panFracY)};if(Object.keys(playerDisplayCachedWorld||{}).length)syncRegionDisplayV36(playerDisplayCachedWorld,playerDisplayCachedState||{});else refresh();return;}refresh();});
refresh();

/* v1.0.43 player display: complete Region Command Center mirror with bounded memory */
let regionDisplayV36 = {
  mapId: '', structSig: '', map: null, ships: {}, radars: {}, missilesCatalog: {}, users: {},
  frame: null, stage: null, fogCanvas: null, tokenNodes: {}, rangeNodes: {}, radarNodes: {}, contactNodes: {},
  routeNodes: {}, missileNodes: {}, missileRouteNodes: {}, camera: { zoom: 1, panX: 0, panY: 0 },
  cameraTarget: { zoom: 1, panFracX: 0, panFracY: 0 }, frameW: 0, frameH: 0, raf: 0, fogClouds: null,
  lastLiteFrameAt: 0, lastLiteFogAt: 0
};

function listV43(value) { return Array.isArray(value) ? value : []; }
function dictV43(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function imageSigV43(value = '') {
  const raw = String(value || '');
  return [raw.length, raw.slice(0, 28), raw.slice(-16)];
}
function regionDisplayOptionsV43() {
  const raw = playerDisplayMirror?.regionDisplay || {};
  return {
    layers: {
      grid: raw.layers?.grid !== false,
      labels: raw.layers?.labels !== false,
      vision: raw.layers?.vision !== false,
      radar: raw.layers?.radar !== false,
      fuel: raw.layers?.fuel !== false,
      weapons: raw.layers?.weapons !== false,
      fog: raw.layers?.fog !== false
    },
    layerFilter: ['surface', 'air', 'orbit'].includes(raw.layerFilter) ? raw.layerFilter : 'all',
    workspaceMode: raw.workspaceMode === 'build' ? 'build' : 'operate',
    timeScale: Number(raw.timeScale ?? 1)
  };
}
function normalizeRegionMapDisplayV36(map = {}) {
  return {
    id: String(map.id || '').trim(), name: String(map.name || 'Регион').trim() || 'Регион',
    kind: String(map.kind || 'region').trim(), image: String(map.image || '').trim(),
    width: Math.max(300, Number(map.width || 1000)), height: Math.max(200, Number(map.height || 700)),
    gridSize: Math.max(1, Number(map.gridSize || 50)), defaultLayer: ['surface','air','orbit'].includes(map.defaultLayer) ? map.defaultLayer : 'surface',
    scaleLabel: String(map.scaleLabel || 'ед').trim() || 'ед', summary: String(map.summary || '').trim(),
    markers: listV43(map.markers), tokens: listV43(map.tokens),
    fog: { enabled: map.fog ? map.fog.enabled !== false : false, radius: Math.max(0, Number(map.fog?.radius ?? 50)), explored: typeof map.fog?.explored === 'string' ? map.fog.explored : '' }
  };
}
function regionTokenPosDisplayV36(token = {}, at = Date.now()) {
  if (Number(token.movePausedMs || 0) > 0 && !token.moveEndsAt) return { x: Number(token.x ?? 0), y: Number(token.y ?? 0) };
  const start = Date.parse(token.moveStartedAt || ''), end = Date.parse(token.moveEndsAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || at >= end) return { x: Number(token.destX ?? token.x ?? 0), y: Number(token.destY ?? token.y ?? 0) };
  const t = clamp((at - start) / (end - start), 0, 1);
  return { x: Number(token.startX ?? token.x ?? 0) + (Number(token.destX ?? token.x ?? 0) - Number(token.startX ?? token.x ?? 0)) * t, y: Number(token.startY ?? token.y ?? 0) + (Number(token.destY ?? token.y ?? 0) - Number(token.startY ?? token.y ?? 0)) * t };
}
function displayShipHasPlayerCrewV36(shipId) {
  const ship = regionDisplayV36.ships?.[shipId];
  if (!ship) return false;
  if (listV43(ship.crewPlayerIds).length) return true;
  return Object.values(regionDisplayV36.users || {}).some(u => String(u?.currentShipId || '') === String(shipId) && String(u?.role || '').toLowerCase() !== 'gm');
}
function displayTokenGrantsViewV36(token) {
  if (!token) return false;
  if (token.type === 'player') return true;
  if (token.type === 'ship' && token.shipId && displayShipHasPlayerCrewV36(token.shipId)) return true;
  if (token.type === 'squadron' && listV43(token.shipIds).some(displayShipHasPlayerCrewV36)) return true;
  return false;
}
function displayViewRadiusV36(token, map) {
  if (token?.type === 'ship' || token?.type === 'squadron') {
    const radius = token.type === 'ship' ? Number(regionDisplayV36.ships?.[token.shipId]?.visionRadius || 0) : Math.max(0, ...listV43(token.shipIds).map(id => Number(regionDisplayV36.ships?.[id]?.visionRadius || 0)), 0);
    return radius > 0 ? radius : Number(map?.fog?.radius || 50);
  }
  return Number(token?.visionRadius || 0) || Number(map?.fog?.radius || 50);
}
function displayViewSourcesV36(map, at = Date.now()) {
  return listV43(map.tokens).filter(displayTokenGrantsViewV36).map(token => { const p = regionTokenPosDisplayV36(token, at); return { id: String(token.id || ''), x: p.x, y: p.y, r: Math.max(1, displayViewRadiusV36(token, map)) }; });
}
function displayTokenVisibleV36(token, map, at = Date.now()) {
  if (!token || !map) return false;
  if (token.type === 'city' || token.type === 'facility') return token.visibleToPlayers !== false;
  if (displayTokenGrantsViewV36(token) || token.visibleToPlayers) return true;
  const p = regionTokenPosDisplayV36(token, at);
  return displayViewSourcesV36(map, at).some(src => Math.hypot(p.x - src.x, p.y - src.y) <= src.r);
}
function displayShipSystemsV43(ship = {}) {
  const systems = listV43(ship.radarIds).map(id => regionDisplayV36.radars?.[id]).filter(Boolean);
  const best = kind => Math.max(0, ...systems.filter(item => String(item.kind || 'radar') === kind).map(item => Number(item.range || 0) * clamp(Number(item.power ?? 100), 0, 100) / 100), 0);
  return { active: Math.max(Number(ship.radarRadius || 0), best('radar')), passive: best('passive'), jammer: best('jammer') };
}
function displayRadarInfoV36(token) {
  const shipSystems = ship => {
    const spec = displayShipSystemsV43(ship);
    const enabled = ship?.radarEnabled !== false && token?.radarEnabled !== false;
    return { r: Math.max(spec.active, spec.passive), activeRange: enabled ? spec.active : 0, passiveRange: enabled ? spec.passive : 0, jammerRange: enabled ? spec.jammer : 0, active: enabled && Math.max(spec.active, spec.passive) > 0, jammer: enabled && spec.jammer > 0 };
  };
  if (token?.type === 'ship' && token.shipId && regionDisplayV36.ships?.[token.shipId]) return shipSystems(regionDisplayV36.ships[token.shipId]);
  if (token?.type === 'squadron') {
    const members = listV43(token.shipIds).map(id => regionDisplayV36.ships?.[id]).filter(Boolean);
    const specs = members.map(displayShipSystemsV43);
    const enabled = token.radarEnabled !== false;
    const activeRange = enabled ? specs.reduce((sum, item) => sum + item.active, 0) : 0;
    const passiveRange = enabled ? specs.reduce((sum, item) => sum + item.passive, 0) : 0;
    const jammerRange = enabled ? Math.max(0, ...specs.map(item => item.jammer), 0) : 0;
    return { r: Math.max(activeRange, passiveRange), activeRange, passiveRange, jammerRange, active: Math.max(activeRange, passiveRange) > 0, jammer: jammerRange > 0 };
  }
  const r = Math.max(0, Number(token?.radarRadius || 0));
  return { r, activeRange: r, passiveRange: 0, jammerRange: 0, active: r > 0 && token?.radarEnabled !== false, jammer: false };
}
function displayPlayerRadarSourcesV36(map, at = Date.now()) {
  return listV43(map.tokens).filter(displayTokenGrantsViewV36).map(token => {
    const info = displayRadarInfoV36(token); if (!info.active && !info.jammer) return null;
    const p = regionTokenPosDisplayV36(token, at); return { id: String(token.id || ''), x: p.x, y: p.y, ...info };
  }).filter(Boolean);
}
function displayRadarContactsV36(map, at = Date.now()) {
  const sources = displayPlayerRadarSourcesV36(map, at); if (!sources.length) return [];
  return listV43(map.tokens).map(token => {
    if (displayTokenGrantsViewV36(token) || displayTokenVisibleV36(token, map, at) || ['city','facility'].includes(token.type)) return null;
    if (displayRadarInfoV36(token).jammer) return null;
    const p = regionTokenPosDisplayV36(token, at); let best = null;
    sources.forEach(src => { const d = Math.hypot(p.x-src.x,p.y-src.y); if (d <= src.r && (!best || d < best.d)) best={src,d}; });
    if (!best) return null;
    const angle=Math.atan2(p.y-best.src.y,p.x-best.src.x), dist=Math.min(best.src.r*.8,Math.max(30,best.d));
    return { id:String(token.id||''), px:best.src.x+Math.cos(angle)*dist, py:best.src.y+Math.sin(angle)*dist, angle };
  }).filter(Boolean);
}
function displayShipForTokenV36(token) {
  if (token?.type === 'squadron') {
    const members=listV43(token.shipIds).map(id=>regionDisplayV36.ships?.[id]).filter(Boolean); if(!members.length)return null;
    return { id:`squadron:${token.id}`, name:token.name, fuel:members.reduce((s,m)=>s+Number(m.fuel||0),0), fuelCapacity:members.reduce((s,m)=>s+Number(m.fuelCapacity||0),0), hull:members.reduce((s,m)=>s+Number(m.hull||0),0), hullCapacity:members.reduce((s,m)=>s+Number(m.hullCapacity||0),0), fuelConsumption:Math.max(.01,members.reduce((s,m)=>s+Math.max(.01,Number(m.fuelConsumption||1)),0)), missileIds:[...new Set(members.flatMap(m=>listV43(m.missileIds)))], __squadron:true };
  }
  if (token?.shipId && regionDisplayV36.ships?.[token.shipId]) return regionDisplayV36.ships[token.shipId];
  const id=token?.playerId && regionDisplayV36.users?.[token.playerId]?.currentShipId; return id&&regionDisplayV36.ships?.[id]?regionDisplayV36.ships[id]:null;
}
function displayLiveFuelV36(token, ship, at) {
  if (!ship) return 0;
  const start=Date.parse(token.moveStartedAt||''),end=Date.parse(token.moveEndsAt||'');
  const moving=Number.isFinite(start)&&Number.isFinite(end)&&end>start;
  const matches=ship.__squadron?(token.type==='squadron'&&Number(token.moveFuelCost||0)>0):token.moveShipId===ship.id;
  if(moving&&matches){const t=clamp((at-start)/(end-start),0,1);return clamp(Number(token.moveFuelStart||ship.fuel||0)-Number(token.moveFuelCost||0)*t,0,Math.max(1,Number(ship.fuelCapacity||ship.fuel||0)));}
  return Number(ship.fuel||0);
}
function displayRangeV36(ship,fuel){return Math.max(0,(Math.max(0,fuel)/Math.max(.01,Number(ship.fuelConsumption||1)))*100);}
function isRegionDisplayActiveV36(){return playerDisplayMirror?.mode==='region'||Boolean(playerDisplayMirror?.activeRegionMapId)||Boolean(regionDisplayV36.mapId);}
function displayLayerAllowedV43(token){const filter=regionDisplayOptionsV43().layerFilter;return filter==='all'||String(token?.layer||regionDisplayV36.map?.defaultLayer||'surface')===filter;}
function displayMissileSpecV43(rawType='') {
  const id=String(rawType||'').startsWith('wc:')?String(rawType).slice(3):'';
  const item=id?regionDisplayV36.missilesCatalog?.[id]:null;
  return item||{name:String(rawType||'ракета').replace('wc:',''),range:0,blastRadius:0};
}
function selectedRangeSpecsV43(map, token, at) {
  if (!token) return [];
  const options=regionDisplayOptionsV43(), pos=regionTokenPosDisplayV36(token,at), ship=displayShipForTokenV36(token), radar=displayRadarInfoV36(token), out=[];
  const add=(kind,r,label)=>{if(r>0)out.push({kind,r:Math.min(Number(r),Math.hypot(map.width,map.height)),label,x:pos.x,y:pos.y});};
  if(options.layers.vision)add('vision',displayViewRadiusV36(token,map),'ОБЗОР');
  if(options.layers.radar){add('radar',radar.activeRange,'РЛС');add('passive',radar.passiveRange,'ПАССИВ');add('jammer',radar.jammerRange,'РЭБ');}
  if(options.layers.fuel&&ship)add('fuel',displayRangeV36(ship,displayLiveFuelV36(token,ship,at)),'ТОПЛИВО');
  if(options.layers.weapons&&ship){const range=Math.max(0,...listV43(ship.missileIds).map(id=>Number(regionDisplayV36.missilesCatalog?.[id]?.range||0)),0);add('weapon',range,'РАКЕТЫ');}
  return out;
}
function tokenGlyphV43(token){return ({ship:'◆',squadron:'◆',player:'●',city:'⬢',facility:'▣',aircraft:'✦',convoy:'▰',unit:'▲'})[token.type]||'●';}
function markerGlyphV43(marker){return marker.icon||({transition:'↗',city:'⬢',building:'▣',danger:'!',objective:'◎'})[marker.category||marker.type]||'•';}
function tokenStatusHtmlV43(token) {
  const ship=displayShipForTokenV36(token); if(!ship)return '';
  const hullCap=Math.max(1,Number(ship.hullCapacity||100)),fuelCap=Math.max(1,Number(ship.fuelCapacity||100));
  const hull=clamp(Number(ship.hull??hullCap),0,hullCap),fuel=clamp(Number(ship.fuel||0),0,fuelCap);
  return `<span class="region-display-bars-v43"><i style="--p:${(hull/hullCap*100).toFixed(1)}%"></i><i class="fuel" style="--p:${(fuel/fuelCap*100).toFixed(1)}%"></i></span>`;
}
function buildRegionDisplayStructureV36(map) {
  const now=Date.now(),options=regionDisplayOptionsV43();
  const visibleTokens=listV43(map.tokens).filter(token=>displayLayerAllowedV43(token)&&displayTokenVisibleV36(token,map,now));
  const markersHtml=listV43(map.markers).filter(m=>m.visibleToPlayers!==false).map(m=>`<div class="region-display-marker-v36 marker-${esc(m.category||m.type||'point')}" style="left:${(Number(m.x||0)/map.width*100).toFixed(3)}%;top:${(Number(m.y||0)/map.height*100).toFixed(3)}%;--rts-color:${esc(m.color||'#7df9ff')}"><span>${esc(markerGlyphV43(m))}</span><b>${esc(m.name||'')}</b></div>`).join('');
  const tokensHtml=visibleTokens.map(t=>{const ship=displayShipForTokenV36(t),img=String(t.image||ship?.image||'').trim(),inner=img?`<img src="${esc(img)}" alt=""/>`:`<span>${esc(tokenGlyphV43(t))}</span>`,label=t.type==='squadron'?`${t.name||t.id||''} ×${listV43(t.shipIds).length}`:(t.name||ship?.name||t.id||'');return `<div class="region-display-token-v36 type-${esc(t.type||'unit')} layer-${esc(t.layer||map.defaultLayer)} status-${esc(t.status||ship?.status||'active')}" data-token-id="${esc(String(t.id||''))}" style="--rts-color:${esc(t.color||'#7df9ff')}">${inner}<b>${esc(label)}</b>${tokenStatusHtmlV43(t)}</div>`;}).join('');
  const routeHtml=visibleTokens.filter(t=>t.moveEndsAt).map(t=>`<line data-route-token="${esc(String(t.id||''))}" class="region-display-route-v43"/>`).join('');
  const radarHtml=displayPlayerRadarSourcesV36(map,now).flatMap(src=>[
    src.activeRange>0?`<div class="region-display-radar-v36 sensor-active" data-sensor-for="${esc(src.id)}" data-sensor-kind="active"></div>`:'',
    src.passiveRange>0?`<div class="region-display-radar-v36 sensor-passive" data-sensor-for="${esc(src.id)}" data-sensor-kind="passive"></div>`:'',
    src.jammerRange>0?`<div class="region-display-radar-v36 sensor-jammer" data-sensor-for="${esc(src.id)}" data-sensor-kind="jammer"></div>`:''
  ]).join('');
  const contactsHtml=displayRadarContactsV36(map,now).map(c=>`<div class="region-display-token-v36 is-contact-v36" data-contact-id="${esc(c.id)}"><span style="transform:rotate(${(c.angle*180/Math.PI).toFixed(1)}deg)">➤</span><b>КОНТАКТ</b></div>`).join('');
  const selected=listV43(map.tokens).find(t=>String(t.id||'')===playerDisplayMirror.selectedRegionTokenId&&displayLayerAllowedV43(t)&&displayTokenVisibleV36(t,map,now));
  const rangesHtml=selectedRangeSpecsV43(map,selected,now).map(spec=>`<div class="region-display-range-v36 range-${spec.kind}" data-selected-range="${spec.kind}"><span>${spec.label} ${spec.r.toFixed(0)}</span></div>`).join('');
  const runtime=listV43(playerDisplayMirror?.regionRuntime?.missiles);
  const missileRoutes=runtime.filter(m=>!m.dead).map(m=>`<line data-missile-route="${esc(m.id)}" class="region-display-missile-route-v43"/>`).join('');
  const missilesHtml=runtime.map(m=>m.dead?`<div class="region-display-impact-v43" data-impact-id="${esc(m.id)}"></div>`:`<div class="region-display-missile-v43 guidance-${esc(m.guidance||m.type||'heat')}" data-missile-id="${esc(m.id)}"><span></span></div>`).join('');
  const gridX=clamp(map.gridSize/map.width*100,.25,50),gridY=clamp(map.gridSize/map.height*100,.25,50);
  const layerLabel=options.layerFilter==='all'?'ВСЕ СЛОИ':({surface:'ПОВЕРХНОСТЬ',air:'ВОЗДУХ',orbit:'ОРБИТА'})[options.layerFilter];
  root.innerHTML=`<div class="player-display-stage"><div class="player-display-board-frame region-display-frame-v36" id="rd-frame-v36"><div class="region-display-stage-v36 ${options.layers.labels?'':'labels-hidden'}" id="rd-stage-v36" style="background-image:${map.image?`url('${esc(map.image)}')`:'none'}"><div class="rts-map-grid-v36" style="display:${options.layers.grid?'':'none'};background-size:${gridX}% ${gridY}%"></div><svg class="region-display-routes-v43" viewBox="0 0 ${map.width} ${map.height}" preserveAspectRatio="none">${routeHtml}${missileRoutes}</svg>${radarHtml}${rangesHtml}${markersHtml}${tokensHtml}${contactsHtml}${missilesHtml}<canvas class="region-display-fog-canvas-v36" id="rd-fog-v36" style="display:none"></canvas></div><div class="region-display-title-v36">${esc(map.name)}</div><div class="region-display-hud-v43"><span>${esc(layerLabel)}</span><span>${options.timeScale===0?'ПАУЗА':`${options.timeScale}×`}</span><span>${visibleTokens.length} ОБЪЕКТОВ</span></div>${selected?selectedInfoPanelV43(selected):''}</div></div>`;
  regionDisplayV36.frame=document.getElementById('rd-frame-v36');regionDisplayV36.stage=document.getElementById('rd-stage-v36');regionDisplayV36.fogCanvas=document.getElementById('rd-fog-v36');
  regionDisplayV36.tokenNodes={};regionDisplayV36.rangeNodes={};regionDisplayV36.radarNodes={};regionDisplayV36.contactNodes={};regionDisplayV36.routeNodes={};regionDisplayV36.missileNodes={};regionDisplayV36.missileRouteNodes={};
  regionDisplayV36.stage?.querySelectorAll('[data-token-id]').forEach(n=>regionDisplayV36.tokenNodes[n.dataset.tokenId]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-selected-range]').forEach(n=>regionDisplayV36.rangeNodes[n.dataset.selectedRange]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-sensor-for]').forEach(n=>regionDisplayV36.radarNodes[`${n.dataset.sensorFor}:${n.dataset.sensorKind}`]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-contact-id]').forEach(n=>regionDisplayV36.contactNodes[n.dataset.contactId]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-route-token]').forEach(n=>regionDisplayV36.routeNodes[n.dataset.routeToken]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-missile-id],[data-impact-id]').forEach(n=>regionDisplayV36.missileNodes[n.dataset.missileId||n.dataset.impactId]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-missile-route]').forEach(n=>regionDisplayV36.missileRouteNodes[n.dataset.missileRoute]=n);
  sizeRegionDisplayFrameV36();regionDisplayPositionV36(Date.now());
}
function selectedInfoPanelV43(token){const ship=displayShipForTokenV36(token),radar=displayRadarInfoV36(token);if(!ship)return `<div class="region-display-info-v43"><b>${esc(token.name||token.id)}</b><span>${esc(token.type||'объект')} · ${esc(token.layer||'surface')}</span></div>`;return `<div class="region-display-info-v43"><b>${esc(ship.callsign||ship.name||token.name||token.id)}</b><span>${esc(ship.model||token.type||'корабль')} · ${esc(ship.status||'operational')}</span><span>КОРПУС ${Number(ship.hull||0).toFixed(0)}/${Number(ship.hullCapacity||0).toFixed(0)} · ТОПЛИВО ${Number(ship.fuel||0).toFixed(0)}/${Number(ship.fuelCapacity||0).toFixed(0)}</span><span>РЛС ${radar.activeRange.toFixed(0)} · ПАССИВ ${radar.passiveRange.toFixed(0)} · РЭБ ${radar.jammerRange.toFixed(0)}</span></div>`;}
function buildDisplayFogCloudsV36(w,h){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');c.fillStyle='rgb(7,9,13)';c.fillRect(0,0,w,h);let seed=1337;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<180;i++){const x=rnd()*w,y=rnd()*h,r=18+rnd()*95,shade=16+Math.floor(rnd()*46),g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${shade},${shade+3},${shade+7},${(.22+rnd()*.34).toFixed(2)})`);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}return cv;}
function renderRegionDisplayFogV36(map,now){const canvas=regionDisplayV36.fogCanvas,options=regionDisplayOptionsV43();if(!canvas)return;if(!map.fog?.enabled||!options.layers.fog){canvas.style.display='none';return;}const lite=document.documentElement.dataset.graphicsMode==='lite',W=lite?480:720,H=Math.max(1,Math.round(W*(map.height/Math.max(1,map.width))));if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;regionDisplayV36.fogClouds=null;}canvas.style.display='';const ctx=canvas.getContext('2d');ctx.clearRect(0,0,W,H);if(lite){ctx.fillStyle='rgb(7,9,13)';ctx.fillRect(0,0,W,H);}else{if(!regionDisplayV36.fogClouds)regionDisplayV36.fogClouds=buildDisplayFogCloudsV36(W,H);const clouds=regionDisplayV36.fogClouds,t=now*.004,dx=Math.floor(t%W),dy=Math.floor((t*.55)%H);ctx.globalAlpha=.97;ctx.drawImage(clouds,-dx,-dy);ctx.drawImage(clouds,W-dx,-dy);ctx.drawImage(clouds,-dx,H-dy);ctx.drawImage(clouds,W-dx,H-dy);ctx.globalAlpha=1;}ctx.globalCompositeOperation='destination-out';displayViewSourcesV36(map,now).forEach(src=>{const r=Math.max(2,src.r/map.width*W),cx=src.x/map.width*W,cy=src.y/map.height*H;if(lite){ctx.fillStyle='#000';}else{const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.55,'rgba(0,0,0,1)');g.addColorStop(.82,'rgba(0,0,0,.55)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;}ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();});ctx.globalCompositeOperation='source-over';}
function sizeRegionDisplayFrameV36(){const map=regionDisplayV36.map,frame=regionDisplayV36.frame;if(!map||!frame)return;const vw=Math.max(1,window.innerWidth||1280),vh=Math.max(1,window.innerHeight||720),aspect=Math.max(.1,map.width/Math.max(1,map.height));let w=vw,h=w/aspect;if(h>vh){h=vh;w=h*aspect;}frame.style.width=`${w.toFixed(1)}px`;frame.style.height=`${h.toFixed(1)}px`;regionDisplayV36.frameW=w;regionDisplayV36.frameH=h;}
function setCircleV43(node,x,y,r,map){if(!node)return;node.style.left=`${(x/map.width*100).toFixed(3)}%`;node.style.top=`${(y/map.height*100).toFixed(3)}%`;node.style.width=`${(r/map.width*200).toFixed(3)}%`;node.style.height=`${(r/map.height*200).toFixed(3)}%`;}
function regionDisplayPositionV36(now){const map=regionDisplayV36.map;if(!map)return;listV43(map.tokens).forEach(t=>{const id=String(t.id||''),node=regionDisplayV36.tokenNodes[id],p=regionTokenPosDisplayV36(t,now);if(node){node.style.left=`${(p.x/map.width*100).toFixed(3)}%`;node.style.top=`${(p.y/map.height*100).toFixed(3)}%`;node.classList.toggle('moving',Boolean(t.moveEndsAt)&&Date.parse(t.moveEndsAt||'')>now);}const route=regionDisplayV36.routeNodes[id];if(route){route.setAttribute('x1',p.x);route.setAttribute('y1',p.y);route.setAttribute('x2',Number(t.destX??p.x));route.setAttribute('y2',Number(t.destY??p.y));}});
  displayPlayerRadarSourcesV36(map,now).forEach(src=>{setCircleV43(regionDisplayV36.radarNodes[`${src.id}:active`],src.x,src.y,src.activeRange,map);setCircleV43(regionDisplayV36.radarNodes[`${src.id}:passive`],src.x,src.y,src.passiveRange,map);setCircleV43(regionDisplayV36.radarNodes[`${src.id}:jammer`],src.x,src.y,src.jammerRange,map);});
  displayRadarContactsV36(map,now).forEach(c=>{const node=regionDisplayV36.contactNodes[c.id];if(!node)return;node.style.left=`${(c.px/map.width*100).toFixed(3)}%`;node.style.top=`${(c.py/map.height*100).toFixed(3)}%`;const arrow=node.querySelector('span');if(arrow)arrow.style.transform=`rotate(${(c.angle*180/Math.PI).toFixed(1)}deg)`;});
  const selected=listV43(map.tokens).find(t=>String(t.id||'')===playerDisplayMirror.selectedRegionTokenId);selectedRangeSpecsV43(map,selected,now).forEach(spec=>setCircleV43(regionDisplayV36.rangeNodes[spec.kind],spec.x,spec.y,spec.r,map));
  listV43(playerDisplayMirror?.regionRuntime?.missiles).forEach(m=>{const node=regionDisplayV36.missileNodes[m.id];if(node){node.style.left=`${(Number(m.x||0)/map.width*100).toFixed(3)}%`;node.style.top=`${(Number(m.y||0)/map.height*100).toFixed(3)}%`;}const line=regionDisplayV36.missileRouteNodes[m.id];if(line){line.setAttribute('x1',Number(m.x||0));line.setAttribute('y1',Number(m.y||0));line.setAttribute('x2',Number(m.sx||m.x||0));line.setAttribute('y2',Number(m.sy||m.y||0));}});
}
function regionDisplayTickV36(frameNow){const map=regionDisplayV36.map;if(!map||!isRegionDisplayActiveV36()){regionDisplayV36.raf=0;return;}const lite=document.documentElement.dataset.graphicsMode==='lite';if(lite&&frameNow-regionDisplayV36.lastLiteFrameAt<100){regionDisplayV36.raf=requestAnimationFrame(regionDisplayTickV36);return;}regionDisplayV36.lastLiteFrameAt=frameNow;const now=Date.now(),fw=regionDisplayV36.frameW||1,fh=regionDisplayV36.frameH||1,tgt=regionDisplayV36.cameraTarget,cam=regionDisplayV36.camera,targetPanX=Number(tgt.panFracX||0)*fw,targetPanY=Number(tgt.panFracY||0)*fh,targetZoom=Number(tgt.zoom||1);cam.zoom+=(targetZoom-cam.zoom)*.2;cam.panX+=(targetPanX-cam.panX)*.2;cam.panY+=(targetPanY-cam.panY)*.2;if(regionDisplayV36.stage)regionDisplayV36.stage.style.transform=`translate(${cam.panX.toFixed(1)}px,${cam.panY.toFixed(1)}px) scale(${cam.zoom.toFixed(4)})`;regionDisplayPositionV36(now);if(!lite||now-regionDisplayV36.lastLiteFogAt>=500){regionDisplayV36.lastLiteFogAt=now;try{renderRegionDisplayFogV36(map,now);}catch{}}regionDisplayV36.raf=requestAnimationFrame(regionDisplayTickV36);}
function ensureRegionDisplayRafV36(){if(!regionDisplayV36.raf)regionDisplayV36.raf=requestAnimationFrame(regionDisplayTickV36);}
function stopRegionDisplayV36(){if(regionDisplayV36.raf){cancelAnimationFrame(regionDisplayV36.raf);regionDisplayV36.raf=0;}if(regionDisplayV36.mapId){regionDisplayV36.mapId='';regionDisplayV36.structSig='';regionDisplayV36.map=null;regionDisplayV36.fogClouds=null;lastSignature='';}}
function syncRegionDisplayV36(world={},state={}){const maps=world?.regionMaps?.REGION_MAPS||world?.REGION_MAPS||{},activeMapId=String(playerDisplayMirror.activeRegionMapId||state?.toolState?.regionRuntime?.activeMapId||'').trim(),rawMap=activeMapId&&maps[activeMapId]?maps[activeMapId]:null;if(!rawMap){stopRegionDisplayV36();root.innerHTML='<div class="player-display-stage player-display-stage--blank"></div>';return;}const map=normalizeRegionMapDisplayV36(rawMap);regionDisplayV36.map=map;regionDisplayV36.ships=world?.ships?.SHIPS||world?.SHIPS||{};regionDisplayV36.radars=world?.radars?.RADARS||world?.RADARS||{};regionDisplayV36.missilesCatalog=world?.missiles?.MISSILES||world?.MISSILES||{};regionDisplayV36.users=state?.users||{};if(playerDisplayMirror.regionCamera)regionDisplayV36.cameraTarget={zoom:Number(playerDisplayMirror.regionCamera.zoom||1),panFracX:Number(playerDisplayMirror.regionCamera.panFracX||0),panFracY:Number(playerDisplayMirror.regionCamera.panFracY||0)};const options=regionDisplayOptionsV43(),now=Date.now(),visible=listV43(map.tokens).filter(t=>displayLayerAllowedV43(t)&&displayTokenVisibleV36(t,map,now)),runtime=listV43(playerDisplayMirror?.regionRuntime?.missiles);const structSig=JSON.stringify({id:map.id,name:map.name,image:imageSigV43(map.image),w:map.width,h:map.height,grid:map.gridSize,options,selected:playerDisplayMirror.selectedRegionTokenId,markers:listV43(map.markers).filter(m=>m.visibleToPlayers!==false).map(m=>[m.id,Math.round(m.x),Math.round(m.y),m.name,m.color,m.category,m.icon]),tokens:visible.map(t=>[t.id,t.type,t.layer,t.status,t.color,imageSigV43(t.image||regionDisplayV36.ships?.[t.shipId]?.image||''),t.name,t.moveEndsAt,regionDisplayV36.ships?.[t.shipId]?.hull,regionDisplayV36.ships?.[t.shipId]?.fuel]),contacts:displayRadarContactsV36(map,now).map(c=>c.id),sensors:displayPlayerRadarSourcesV36(map,now).map(src=>[src.id,Math.round(src.activeRange),Math.round(src.passiveRange),Math.round(src.jammerRange)]),missiles:runtime.map(m=>[m.id,m.dead,m.guidance,m.type])});if(structSig!==regionDisplayV36.structSig||map.id!==regionDisplayV36.mapId){regionDisplayV36.structSig=structSig;regionDisplayV36.mapId=map.id;buildRegionDisplayStructureV36(map);}else sizeRegionDisplayFrameV36();ensureRegionDisplayRafV36();}
