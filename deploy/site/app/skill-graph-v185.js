/* Deterministic visual graph. No purchase, cost or combat mutations. */
(function(root){
'use strict';
const TAU=Math.PI*2,rad=d=>d*Math.PI/180,polar=(r,a)=>({x:Math.cos(a)*r,y:Math.sin(a)*r}),angle=a=>(a%TAU+TAU)%TAU;
const sectors=[['strength','Сила','#df9567',-90],['dexterity','Ловкость','#64cdb5',-30],['intelligence','Интеллект','#79b9f2',30],['will','Воля','#b69ae8',90],['glory','Слава','#e2bf72',150],['endurance','Выносливость','#8cba75',210]].map(([id,name,color,degrees])=>({id,name,color,degrees,angle:rad(degrees)}));
const ids=new Set(sectors.map(s=>s.id)),copy=v=>JSON.parse(JSON.stringify(v)),req=s=>{const raw=s.requiredSkillIds||s.prerequisites||[];return [...new Set((Array.isArray(raw)?raw:String(raw).split(/[\s,;]+/)).map(String).filter(Boolean))]};
function placement(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const p=copy(raw);p.mode=p.mode==='manual'?'manual':'auto';p.anchorStats=[...new Set((Array.isArray(p.anchorStats)?p.anchorStats:[]).filter(k=>ids.has(k)))];
 for(const key of ['ring','order','angleOffset','radiusOffset','x','y'])if(p[key]!=null&&!Number.isFinite(Number(p[key])))delete p[key];else if(p[key]!=null)p[key]=Number(p[key]);
 p.groupId=String(p.groupId||'');if(p.treeType!=null)p.treeType=['auto','common','branch'].includes(p.treeType)?p.treeType:'auto';return p;
}
function analyze(skills){
 const by=new Map(skills.map(s=>[String(s.id),s])),depth=new Map(),cycles=new Set(),missing=[],stack=[],done=new Set();
 function visit(id){if(done.has(id))return depth.get(id)||0;const i=stack.indexOf(id);if(i>=0){stack.slice(i).forEach(k=>cycles.add(k));return 0;}stack.push(id);let n=0;for(const p of req(by.get(id))){if(!by.has(p)){missing.push({from:p,to:id});continue;}n=Math.max(n,visit(p)+1);}stack.pop();done.add(id);depth.set(id,n);return n;}
 [...by.keys()].sort().forEach(visit);return {by,depth,cycles:[...cycles],missing,edges:skills.flatMap(s=>req(s).filter(p=>by.has(p)).map(p=>({from:p,to:String(s.id)})))};
}
function anchors(skill,by,seen=new Set()){
 const p=placement(skill.treePlacement),id=String(skill.id);if(seen.has(id))return [];seen.add(id);
 if(p?.anchorStats.length)return p.anchorStats;
 const direct=(skill.requiredAbilities||[]).filter(r=>ids.has(r.key)&&Number(r.value)>0).map(r=>r.key);if(direct.length)return [...new Set(direct)];
 if(skill.isBasic||skill.originOnly178)return [];
 if(ids.has(skill.treeBranch))return [skill.treeBranch];
 return [...new Set(req(skill).flatMap(id=>by.has(id)?anchors(by.get(id),by,new Set(seen)):[]))];
}
const cache=new Map(),stable=new Map(),wholeCache=new Map(),generalStable=new Map();
const structuralKey=s=>[String(s.id),req(s).sort(),s.requiredAbilities,s.treeBranch,s.treePlacement,s.isBasic,s.originOnly178,s.category];
const radiusOf=p=>Math.hypot(p.x,p.y);
// World-space distances include the two-line name and local requirements.
// Spread only the gaps between occupied lanes, not an extra empty lane.
const spacing={root:350,level:160,lane:154,span:.9,maxAngle:.44,bandGap:180,generalColumn:160,generalRow:160,generalBand:180,generalGap:160};
function radialLayout(skills,groups={},config=sectors,contextBy=new Map(skills.map(s=>[String(s.id),s]))){
 const structure=skills.map(structuralKey).sort((a,b)=>a[0].localeCompare(b[0]));
 const signature=JSON.stringify([config,groups,structure,skills.map(s=>[String(s.id),anchors(s,contextBy)]).sort(([a],[b])=>a.localeCompare(b))]);
 if(cache.has(signature))return cache.get(signature);
 const analysis=analyze(skills),positions=new Map(),assignment=new Map(),groupRegions=[];
 const metadata=new Map(skills.map(s=>[String(s.id),placement(s.treePlacement)]));
 const statMap=new Map(skills.map(s=>[String(s.id),anchors(s,contextBy)]));
 const bucketOf=id=>[...statMap.get(id)].sort().join('|')||'neutral';
 const compare=(a,b)=>(metadata.get(a)?.order||0)-(metadata.get(b)?.order||0)||a.localeCompare(b);
 const children=new Map(skills.map(s=>[String(s.id),[]]));
 for(const e of analysis.edges)children.get(e.from).push(e.to);
 // A connected sequence owns a corridor. Thematic groups order corridors but
 // never split a sequence or create a logical parent.
 const pending=new Set(analysis.by.keys()),components=[];
 while(pending.size){
  const first=[...pending].sort(compare)[0],bucket=bucketOf(first),ids=[],queue=[first];
  while(queue.length){const id=queue.pop();if(!pending.has(id)||bucketOf(id)!==bucket)continue;pending.delete(id);ids.push(id);
   for(const next of [...req(analysis.by.get(id)),...children.get(id)])if(analysis.by.has(next)&&bucketOf(next)===bucket&&pending.has(next))queue.push(next);
  }
  ids.sort(compare);const local=new Set(ids),primary=new Map(),tree=new Map(ids.map(id=>[id,[]]));
  for(const id of ids){const parents=req(analysis.by.get(id)).filter(p=>local.has(p)&&(analysis.depth.get(p)||0)<(analysis.depth.get(id)||0)).sort((a,b)=>(analysis.depth.get(b)||0)-(analysis.depth.get(a)||0)||compare(a,b));if(parents.length){primary.set(id,parents[0]);tree.get(parents[0]).push(id);}}
  for(const row of tree.values())row.sort(compare);
  const slots=new Map(),levels=new Map(),visited=new Set();let leaf=0;
  function visit(id,level){if(visited.has(id))return;visited.add(id);levels.set(id,level);const start=leaf,desc=tree.get(id);if(!desc.length)slots.set(id,leaf++);else{desc.forEach(child=>visit(child,level+1));slots.set(id,(start+leaf-1)/2);}}
  ids.filter(id=>!primary.has(id)).sort(compare).forEach(id=>visit(id,0));ids.forEach(id=>visit(id,0));
  const ordered=[...ids].sort((a,b)=>(analysis.depth.get(a)||0)-(analysis.depth.get(b)||0)||compare(a,b));
  for(const id of ordered){const parents=req(analysis.by.get(id)).filter(p=>local.has(p)&&slots.has(p)&&(analysis.depth.get(p)||0)<(analysis.depth.get(id)||0));if(parents.length>1)slots.set(id,parents.reduce((n,p)=>n+slots.get(p),0)/parents.length);else if(parents.length===1&&tree.get(parents[0]).length===1)slots.set(id,slots.get(parents[0]));
   if(parents.length)levels.set(id,Math.max(...parents.map(p=>levels.get(p)||0))+1);
  }
  // Separate siblings at the same depth without shuffling the other layers.
  const rows=new Map();for(const id of ids){const level=levels.get(id);if(!rows.has(level))rows.set(level,[]);rows.get(level).push(id);}
  for(const row of rows.values()){row.sort((a,b)=>slots.get(a)-slots.get(b)||compare(a,b));let last=-Infinity;for(const id of row){const slot=Math.max(slots.get(id),last+1);slots.set(id,slot);last=slot;}}
  const min=Math.min(...slots.values()),width=Math.max(1,Math.ceil(Math.max(...slots.values())-min+1));for(const id of ids)slots.set(id,slots.get(id)-min);
  const component={ids,local,bucket,primary,tree,slots,levels,width,depth:Math.max(...levels.values()),first:ids[0],group:ids.map(id=>metadata.get(id)?.groupId||'').find(Boolean)||''};
  component.key=JSON.stringify([config,bucket,ids.map(id=>structuralKey(analysis.by.get(id))).sort((a,b)=>a[0].localeCompare(b[0]))]);components.push(component);
 }
 // A moved prerequisite in another sector also invalidates its dependants.
 // Component membership is included, so adding a fork cannot leave a cached
 // downstream component inside the newly extended prerequisite corridor.
 const componentOf=new Map(components.flatMap(c=>c.ids.map(id=>[id,c])));
 for(const c of components){const upstream=new Set([c]),parts=[];function collect(current){for(const id of current.ids)for(const parent of req(analysis.by.get(id))){const next=componentOf.get(parent);if(next&&!upstream.has(next)){upstream.add(next);parts.push(next.ids.map(id=>structuralKey(analysis.by.get(id))));collect(next);}}}collect(c);c.key=JSON.stringify([c.key,parts.sort((a,b)=>String(a[0]?.[0]).localeCompare(String(b[0]?.[0])))]);}
 const reserved=config.map(b=>({id:'stat:'+b.id,...polar(182,b.angle),hw:62,hh:42}));
 const add=(id,point)=>{const stats=statMap.get(id),meta=metadata.get(id),branch=stats.length===1?stats[0]:stats.length>1?'combined':'neutral';positions.set(id,{...point,branch,depth:analysis.depth.get(id)||0,anchors:stats,groupId:meta?.groupId||'',manual:meta?.mode==='manual'});assignment.set(id,branch);reserved.push({id,...point,hw:69,hh:75});};
 const free=(point,id)=>radiusOf(point)>265&&!reserved.some(o=>o.id!==id&&Math.abs(o.x-point.x)<o.hw+69&&Math.abs(o.y-point.y)<o.hh+75);
 const reused=new Set();
 for(const c of components){const saved=stable.get(c.key);if(!saved)continue;for(const id of c.ids)add(id,saved.points.get(id));reused.add(c);}
 // Explicit pins always take precedence over automatic packing.
 for(const c of components)if(!reused.has(c))for(const id of c.ids){const p=metadata.get(id);if(p?.mode==='manual'&&Number.isFinite(p.x)&&Number.isFinite(p.y))add(id,{x:p.x,y:p.y});}
 const buckets=new Map();for(const c of components)if(!reused.has(c)){if(!buckets.has(c.bucket))buckets.set(c.bucket,[]);buckets.get(c.bucket).push(c);}
 const plans=new Map();
 for(const [bucket,list] of buckets){
  list.sort((a,b)=>a.group.localeCompare(b.group)||compare(a.first,b.first));
  let base=Math.max(spacing.root,...components.filter(c=>reused.has(c)&&c.bucket===bucket).flatMap(c=>c.ids.map(id=>radiusOf(positions.get(id))+spacing.bandGap)));
  const bands=[];let band={items:[],width:0,depth:0};
  for(const c of list){if(band.width&&band.width+c.width>4){bands.push(band);band={items:[],width:0,depth:0};}band.items.push(c);band.width+=c.width;band.depth=Math.max(band.depth,c.depth);if(c.width>=4){bands.push(band);band={items:[],width:0,depth:0};}}
  if(band.items.length)bands.push(band);
  for(const band of bands){base=Math.max(base,(band.width-1)*spacing.lane/spacing.span);const step=Math.min(spacing.maxAngle,spacing.span/Math.max(1,band.width-1));let offset=0;
   for(const c of band.items){for(const id of c.ids)plans.set(id,{radius:base+(c.levels.get(id)||0)*spacing.level,offset:(offset+c.slots.get(id)-(band.width-1)/2)*step,step,component:c});offset+=c.width;}
   base+=band.depth*spacing.level+spacing.bandGap;
  }
 }
 const sorted=[...plans.keys()].sort((a,b)=>(analysis.depth.get(a)||0)-(analysis.depth.get(b)||0)||compare(a,b));
 for(const id of sorted){if(positions.has(id))continue;const p=metadata.get(id),stats=statMap.get(id),plan=plans.get(id),c=plan.component,vectors=stats.map(k=>config.find(b=>b.id===k)).filter(Boolean);
  let a=vectors.length?Math.atan2(vectors.reduce((v,b)=>v+Math.sin(b.angle),0),vectors.reduce((v,b)=>v+Math.cos(b.angle),0)):Math.PI;
  const parents=req(analysis.by.get(id)).filter(parent=>positions.has(parent)),localParents=parents.filter(parent=>c.local.has(parent));
  a+=plan.offset;
  if(localParents.length===1){const parent=localParents[0],point=positions.get(parent);a=Math.atan2(point.y,point.x)+(c.slots.get(id)-c.slots.get(parent))*plan.step;}
  else if(localParents.length>1){a=Math.atan2(localParents.reduce((sum,parent)=>sum+Math.sin(Math.atan2(positions.get(parent).y,positions.get(parent).x)),0),localParents.reduce((sum,parent)=>sum+Math.cos(Math.atan2(positions.get(parent).y,positions.get(parent).x)),0));}
  a+=rad(p?.angleOffset||0);
  let radius=Math.max(spacing.root,plan.radius,parents.length?Math.max(...parents.map(parent=>radiusOf(positions.get(parent))+spacing.level)):0);
  if(p?.ring!=null)radius=Math.max(radius,spacing.root+Math.max(0,p.ring-1)*spacing.level);
  radius=Math.max(radius+(p?.radiusOffset||0),parents.length?Math.max(...parents.map(parent=>radiusOf(positions.get(parent))+spacing.level)):spacing.root);
  let point=polar(radius,a);while(!free(point,id)&&radius<100000){radius+=20;point=polar(radius,a);}add(id,point);
 }
 for(const c of components)stable.set(c.key,{ids:c.ids,points:new Map(c.ids.map(id=>[id,{x:positions.get(id).x,y:positions.get(id).y}]))});
 if(stable.size>500)for(const key of [...stable.keys()].slice(0,stable.size-500))stable.delete(key);
 for(const group of Object.values(groups)){const nodes=[...positions.values()].filter(p=>p.groupId===group.id);if(nodes.length){const xs=nodes.map(p=>p.x),ys=nodes.map(p=>p.y);groupRegions.push({...group,x:Math.min(...xs)-82,y:Math.min(...ys)-94,w:Math.max(...xs)-Math.min(...xs)+164,h:Math.max(...ys)-Math.min(...ys)+214});}}
 const graph={...analysis,positions,assignment,common:[],commonHeight:170,groups:groupRegions,routes:new Map(),signature};
 for(const [index,e] of [...graph.edges].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)).entries())graph.routes.set(e.from+'|'+e.to,route(graph,e,index));
 cache.set(signature,graph);if(cache.size>12)cache.delete(cache.keys().next().value);return graph;
}
const commonCategories=new Set(['общее','общие','общий','общие навыки','common','general']);
function isCommon(skill,by=new Map()){
 const type=placement(skill.treePlacement)?.treeType;
 if(type==='common')return true;if(type==='branch')return false;
 if(commonCategories.has(String(skill.category||'').trim().toLocaleLowerCase('ru')))return true;
 if(skill.treeBranch==='common')return true;
 return anchors(skill,by).length===0;
}
function generalLayout(skills,startX,full){
 const side=analyze(skills),by=side.by,children=new Map(skills.map(s=>[String(s.id),[]]));
 for(const e of side.edges)children.get(e.from).push(e.to);
 const pending=new Set(by.keys()),components=[];
 while(pending.size){const queue=[[...pending].sort()[0]],ids=[];while(queue.length){const id=queue.pop();if(!pending.delete(id))continue;ids.push(id);for(const n of [...req(by.get(id)),...children.get(id)])if(by.has(n)&&pending.has(n))queue.push(n);}ids.sort();const pins=ids.some(id=>placement(by.get(id).treePlacement)?.mode==='manual');components.push({ids,key:JSON.stringify([ids.map(id=>structuralKey(by.get(id))),pins?startX:null])});}
 components.sort((a,b)=>a.ids[0].localeCompare(b.ids[0]));const local=new Map(),saved=new Set();
 const addPin=id=>{const p=placement(by.get(id).treePlacement);if(p?.mode==='manual'&&Number.isFinite(p.x)&&Number.isFinite(p.y)){local.set(id,{x:Math.max(0,p.x-startX),y:p.y});return true;}return false;};
 for(const c of components){const old=generalStable.get(c.key);if(old){for(const id of c.ids)local.set(id,{...old.points.get(id)});saved.add(c);}else c.ids.forEach(addPin);}
 const free=(p,id)=>p.x>=0&&![...local].some(([other,q])=>other!==id&&Math.abs(p.x-q.x)<152&&Math.abs(p.y-q.y)<150);
 let top=local.size?Math.max(...[...local.values()].map(p=>p.y))+spacing.generalBand:-240,column=0,bottom=top;
 for(const c of components){if(saved.has(c))continue;const levels=new Map(c.ids.map(id=>[id,side.depth.get(id)||0])),rows=new Map();for(const id of c.ids){const level=levels.get(id);if(!rows.has(level))rows.set(level,[]);rows.get(level).push(id);}const width=Math.max(1,...[...rows.values()].map(r=>r.length));if(column&&column+width>3){top=bottom+spacing.generalBand;column=0;}
  for(const [level,row] of [...rows].sort((a,b)=>a[0]-b[0])){const mean=id=>{const ps=req(by.get(id)).filter(p=>local.has(p));return ps.length?ps.reduce((sum,p)=>sum+local.get(p).x,0)/ps.length:Infinity;};row.sort((a,b)=>mean(a)-mean(b)||(placement(by.get(a).treePlacement)?.order||0)-(placement(by.get(b).treePlacement)?.order||0)||a.localeCompare(b));
   for(const [i,id] of row.entries()){if(local.has(id))continue;const parents=req(by.get(id)).filter(p=>local.has(p)),y=Math.max(top+level*spacing.generalRow,parents.length?Math.max(...parents.map(p=>local.get(p).y+spacing.generalRow)):-Infinity);let x=(column+(width-row.length)/2+i)*spacing.generalColumn;
    if(parents.length&&(row.length===1||parents.length>1))x=parents.reduce((sum,p)=>sum+local.get(p).x,0)/parents.length;
    let point={x,y};for(let step=0;!free(point,id)&&step<1000;step++)point={x:x+(step+1)*spacing.generalColumn,y};local.set(id,point);
   }
  }
  column+=width;bottom=Math.max(bottom,...c.ids.map(id=>local.get(id).y));if(column>=3){top=bottom+spacing.generalBand;column=0;}
 }
 for(const c of components)generalStable.set(c.key,{ids:c.ids,points:new Map(c.ids.map(id=>[id,{...local.get(id)}]))});
 if(generalStable.size>500)for(const key of [...generalStable.keys()].slice(0,generalStable.size-500))generalStable.delete(key);
 return new Map([...local].map(([id,p])=>[id,{x:p.x+startX,y:p.y,branch:'general',depth:full.depth.get(id)||0,anchors:anchors(by.get(id),full.by),groupId:placement(by.get(id).treePlacement)?.groupId||'',manual:placement(by.get(id).treePlacement)?.mode==='manual'}]));
}
function layout(skills,groups={},config=sectors){
 const signature=JSON.stringify(['compact188',config,groups,skills.map(structuralKey).sort((a,b)=>a[0].localeCompare(b[0]))]);if(wholeCache.has(signature))return wholeCache.get(signature);
 const full=analyze(skills),general=skills.filter(s=>isCommon(s,full.by)),generalIds=new Set(general.map(s=>String(s.id))),radial=radialLayout(skills.filter(s=>!generalIds.has(String(s.id))),groups,config,full.by),positions=new Map(radial.positions),assignment=new Map(radial.assignment);
 const right=Math.max(115,...config.map(b=>Math.cos(b.angle)*182+62),...[...positions.values()].map(p=>p.x+80)),startX=right+spacing.generalGap;
 const side=generalLayout(general,startX,full);for(const [id,p] of side){positions.set(id,p);assignment.set(id,'general');}
 const regions=[];for(const g of Object.values(groups))for(const kind of ['radial','general']){const ps=[...positions.values()].filter(p=>p.groupId===g.id&&(p.branch==='general')===(kind==='general'));if(!ps.length)continue;const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);regions.push({...g,x:Math.min(...xs)-82,y:Math.min(...ys)-94,w:Math.max(...xs)-Math.min(...xs)+164,h:Math.max(...ys)-Math.min(...ys)+214});}
 const area=side.size?{startX,left:startX-100,right:Math.max(...[...side.values()].map(p=>p.x))+100,top:Math.min(...[...side.values()].map(p=>p.y))-160,bottom:Math.max(...[...side.values()].map(p=>p.y))+130}:null;
 const graph={...full,positions,assignment,common:[],commonHeight:170,generalIds:[...generalIds],generalArea:area,groups:regions,routes:new Map(),signature};for(const [index,e] of [...full.edges].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)).entries())graph.routes.set(e.from+'|'+e.to,route(graph,e,index));
 wholeCache.set(signature,graph);if(wholeCache.size>12)wholeCache.delete(wholeCache.keys().next().value);return graph;
}
function route(graph,edge,index=0){
 const start=graph.positions.get(edge.from),end=graph.positions.get(edge.to);if(!start||!end)return '';
 const obstacles=[...graph.positions].filter(([id])=>id!==edge.from&&id!==edge.to).map(([,p])=>({x:p.x,y:p.y+30,hw:76,hh:74}));
 const bucket=new Map();for(const o of obstacles){for(let x=Math.floor((o.x-o.hw)/150);x<=Math.floor((o.x+o.hw)/150);x++)for(let y=Math.floor((o.y-o.hh)/150);y<=Math.floor((o.y+o.hh)/150);y++){const k=x+':'+y;if(!bucket.has(k))bucket.set(k,[]);bucket.get(k).push(o);}}
 const clear=p=>Math.hypot(p.x,p.y)>248&&!(bucket.get(Math.floor(p.x/150)+':'+Math.floor(p.y/150))||[]).some(o=>Math.abs(p.x-o.x)<o.hw&&Math.abs(p.y-o.y)<o.hh);
 const sr=Math.hypot(start.x,start.y),er=Math.hypot(end.x,end.y),sa=angle(Math.atan2(start.y,start.x)),ea=angle(Math.atan2(end.y,end.x));
 // Most edges stay inside their sequence's reserved corridor. Prefer one
 // radial line or one clean ring bend before considering a general detour.
 const straightClear=(a,b)=>{const length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(length/8));for(let i=0;i<=steps;i++){const t=i/steps;if(!clear({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}))return false;}return true;};
 if(graph.assignment.get(edge.from)==='general'&&graph.assignment.get(edge.to)==='general'){
  if(Math.abs(start.x-end.x)<1e-7&&straightClear(start,end))return `M${start.x},${start.y} L${end.x},${end.y}`;
  const direction=Math.sign(end.y-start.y)||1,track=(start.y+end.y)/2+direction*30,a={x:start.x,y:track},b={x:end.x,y:track};if(straightClear(start,a)&&straightClear(a,b)&&straightClear(b,end))return `M${start.x},${start.y} L${a.x},${a.y} L${b.x},${b.y} L${end.x},${end.y}`;
 }
 let delta=ea-sa;if(delta>Math.PI)delta-=TAU;if(delta< -Math.PI)delta+=TAU;
 if(Math.abs(delta)<1e-7&&straightClear(start,end))return `M${start.x},${start.y} L${end.x},${end.y}`;
 const arcClear=r=>{const steps=Math.max(1,Math.ceil(Math.abs(delta)*r/8));for(let i=0;i<=steps;i++)if(!clear(polar(r,sa+delta*i/steps)))return false;return true;};
 const low=Math.min(sr,er)+70,high=Math.max(sr,er)-70;
 const tracks=[(sr+er)/2+(index%3-1)*6,low,high,(sr+er)/2];
 for(const r of tracks){if(r<low||r>high||r<270)continue;const a=polar(r,sa),b=polar(r,ea);if(straightClear(start,a)&&arcClear(r)&&straightClear(b,end))return `M${start.x},${start.y} L${a.x},${a.y} A${r},${r} 0 ${Math.abs(delta)>Math.PI?1:0} ${delta>0?1:0} ${b.x},${b.y} L${end.x},${end.y}`;}
 const angles=[...new Set([sa,ea,...Array.from({length:36},(_,i)=>i*TAU/36)])].sort((a,b)=>a-b),radii=[...new Set([sr,er,270,...[...graph.positions.values()].flatMap(p=>{const r=Math.hypot(p.x,p.y);return [Math.max(270,r-88-(index%4)*5),r+88+(index%4)*5];})])].sort((a,b)=>a-b);
 const cols=angles.length,key=(r,a)=>r*cols+a,decode=k=>({r:Math.floor(k/cols),a:k%cols}),point=k=>{const n=decode(k);return polar(radii[n.r],angles[n.a]);},sk=key(radii.indexOf(sr),angles.indexOf(sa)),gk=key(radii.indexOf(er),angles.indexOf(ea));
 const open=new Map([[sk,0]]),cost=new Map([[sk,0]]),came=new Map();let found=false,steps=0;
 const segmentClear=(u,v,arc)=>{const a=decode(u),b=decode(v),p=point(u),q=point(v);let da=angles[b.a]-angles[a.a];if(da>Math.PI)da-=TAU;if(da< -Math.PI)da+=TAU;const length=arc?Math.abs(da)*radii[a.r]:Math.hypot(p.x-q.x,p.y-q.y),n=Math.max(1,Math.ceil(length/16));for(let i=0;i<=n;i++){const t=i/n,pos=arc?polar(radii[a.r],angles[a.a]+da*t):{x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};if(!clear(pos))return false;}return length;};
 while(open.size&&steps++<18000){let k=-1,best=Infinity;for(const [id,f] of open)if(f<best){best=f;k=id;}open.delete(k);if(k===gk){found=true;break;}const n=decode(k),neighbors=[[n.r-1,n.a,false],[n.r+1,n.a,false],[n.r,(n.a+cols-1)%cols,true],[n.r,(n.a+1)%cols,true]];for(const [r,a,arc] of neighbors){if(r<0||r>=radii.length)continue;const nk=key(r,a);if(arc&&(k===sk||nk===gk))continue;const length=segmentClear(k,nk,arc);if(length===false)continue;const next=cost.get(k)+length;if(next>=(cost.get(nk)??Infinity))continue;cost.set(nk,next);came.set(nk,k);const p=point(nk);open.set(nk,next+Math.hypot(p.x-end.x,p.y-end.y));}}
 if(!found)return '';const path=[gk];while(path[0]!==sk)path.unshift(came.get(path[0]));
 // Collapse collinear radial/arc steps, preserving polar bends.
 const nodes=path.map(k=>decode(k)),simple=[nodes[0]];for(let i=1;i<nodes.length-1;i++){const a=nodes[i-1],b=nodes[i],c=nodes[i+1];if((a.a===b.a&&b.a===c.a)||(a.r===b.r&&b.r===c.r&&Math.sign(angles[b.a]-angles[a.a])===Math.sign(angles[c.a]-angles[b.a])))continue;simple.push(b);}simple.push(nodes[nodes.length-1]);
 let d=`M${start.x},${start.y}`;for(let i=1;i<simple.length;i++){const a=simple[i-1],b=simple[i],p=polar(radii[b.r],angles[b.a]);if(a.r===b.r){let da=angles[b.a]-angles[a.a];if(da>Math.PI)da-=TAU;if(da< -Math.PI)da+=TAU;d+=` A${radii[b.r]},${radii[b.r]} 0 ${Math.abs(da)>Math.PI?1:0} ${da>0?1:0} ${p.x},${p.y}`;}else d+=` L${p.x},${p.y}`;}return d;
}
const api={sectors,placement,analyze,anchors,isCommon,layout,route,requirements:req,clearCache:ids=>{cache.clear();wholeCache.clear();if(Array.isArray(ids)){const selected=new Set(ids.map(String));for(const [key,c] of generalStable)if(c.ids.some(id=>selected.has(id)))generalStable.delete(key);}else generalStable.clear();if(Array.isArray(ids)){const selected=new Set(ids.map(String));for(const [key,c] of stable)if(c.ids.some(id=>selected.has(id)))stable.delete(key);}else stable.clear();}};root.GRPGSkillGraphV185=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
