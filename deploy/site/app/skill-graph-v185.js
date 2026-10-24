/* Deterministic visual graph. No purchase, cost or combat mutations. */
(function(root){
'use strict';
const rad=d=>d*Math.PI/180,polar=(r,a)=>({x:Math.cos(a)*r,y:Math.sin(a)*r});
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
const cache=new Map(),stable=new Map(),wholeCache=new Map();
const structuralKey=s=>[String(s.id),req(s).sort(),s.requiredAbilities,s.treeBranch,s.treePlacement,s.isBasic,s.originOnly178,s.category];
const radiusOf=p=>Math.hypot(p.x,p.y);
// World-space distances include the two-line name and local requirements.
// Spread only the gaps between occupied lanes, not an extra empty lane.
const spacing={root:266,level:160,span:.9,maxAngle:.44,bandGap:180};
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
 const add=(id,point)=>{const stats=statMap.get(id),meta=metadata.get(id),branch=stats.length===1?stats[0]:stats.length>1?'combined':'neutral';positions.set(id,{...point,branch,depth:analysis.depth.get(id)||0,anchors:stats,groupId:meta?.groupId||'',manual:meta?.mode==='manual'});assignment.set(id,branch);reserved.push({id,x:point.x,y:point.y+30,hw:69,hh:74});};
 const free=(point,id)=>radiusOf(point)>265&&!reserved.some(o=>o.id!==id&&Math.abs(o.x-point.x)<o.hw+69&&Math.abs(o.y-point.y-30)<o.hh+74);
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
  for(const band of bands){const step=Math.min(spacing.maxAngle,spacing.span/Math.max(1,band.width-1));let offset=0;
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
  let point=polar(radius,a);while(!free(point,id)&&radius<100000){radius+=4;point=polar(radius,a);}add(id,point);
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
function layout(skills,groups={},config=sectors){
 const signature=JSON.stringify(['window189',config,groups,skills.map(structuralKey).sort((a,b)=>a[0].localeCompare(b[0]))]);if(wholeCache.has(signature))return wholeCache.get(signature);
 const full=analyze(skills),general=skills.filter(s=>isCommon(s,full.by)),generalIds=new Set(general.map(s=>String(s.id))),radial=radialLayout(skills.filter(s=>!generalIds.has(String(s.id))),groups,config,full.by),positions=new Map(radial.positions),assignment=new Map(radial.assignment);
 // General skills live in a separate catalogue. Coordinates are local list
 // metadata only; they never enlarge the map or constrain manual radial pins.
 const common=general.sort((a,b)=>(full.depth.get(String(a.id))||0)-(full.depth.get(String(b.id))||0)||String(a.id).localeCompare(String(b.id))).map(s=>String(s.id));
 common.forEach((id,index)=>{const s=full.by.get(id);positions.set(id,{x:0,y:index*160,branch:'general',depth:full.depth.get(id)||0,anchors:anchors(s,full.by),groupId:placement(s.treePlacement)?.groupId||'',manual:false});assignment.set(id,'general');});
 const visualEdges=full.edges.filter(e=>!generalIds.has(e.from)&&!generalIds.has(e.to));
 const graph={...full,positions,assignment,common,commonHeight:0,generalIds:[...generalIds],generalArea:null,groups:radial.groups,visualEdges,routes:new Map(),signature};
 for(const [index,e] of [...visualEdges].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)).entries())graph.routes.set(e.from+'|'+e.to,route(graph,e,index));
 wholeCache.set(signature,graph);if(wholeCache.size>12)wholeCache.delete(wholeCache.keys().next().value);return graph;
}
function route(graph,edge){
 const start=graph.positions.get(edge.from),end=graph.positions.get(edge.to);if(!start||!end||start.branch==='general'||end.branch==='general')return '';
 const obstacles=[...graph.positions].filter(([id,p])=>id!==edge.from&&id!==edge.to&&p.branch!=='general').map(([,p])=>({x:p.x,y:p.y+30,hw:76,hh:74}));
 const bucket=new Map();for(const o of obstacles){for(let x=Math.floor((o.x-o.hw)/150);x<=Math.floor((o.x+o.hw)/150);x++)for(let y=Math.floor((o.y-o.hh)/150);y<=Math.floor((o.y+o.hh)/150);y++){const k=x+':'+y;if(!bucket.has(k))bucket.set(k,[]);bucket.get(k).push(o);}}
 const clear=p=>Math.hypot(p.x,p.y)>248&&!(bucket.get(Math.floor(p.x/150)+':'+Math.floor(p.y/150))||[]).some(o=>Math.abs(p.x-o.x)<o.hw&&Math.abs(p.y-o.y)<o.hh);
 const straightClear=(a,b)=>{const length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(length/8));for(let i=0;i<=steps;i++){const t=i/steps;if(!clear({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}))return false;}return true;};
 // Prefer fewer bends before distance: unobstructed straight, then one elbow.
 if(straightClear(start,end))return `M${start.x},${start.y} L${end.x},${end.y}`;
 const elbows=[{x:start.x,y:end.y},{x:end.x,y:start.y}].filter(p=>straightClear(start,p)&&straightClear(p,end)).sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)+Math.hypot(end.x-a.x,end.y-a.y)-Math.hypot(b.x-start.x,b.y-start.y)-Math.hypot(end.x-b.x,end.y-b.y));
 if(elbows.length){const p=elbows[0];return `M${start.x},${start.y} L${p.x},${p.y} L${end.x},${end.y}`;}
 // For blocked links use an orthogonal visibility grid. Direction is part of
 // the search state: compare bend counts first, then path length. A shorter
 // zigzag must never replace an equally clear route with fewer bends.
 const xs=[...new Set([start.x,end.x,-256,256,...obstacles.flatMap(o=>[o.x-o.hw-6,o.x+o.hw+6])])].sort((a,b)=>a-b),ys=[...new Set([start.y,end.y,-256,256,...obstacles.flatMap(o=>[o.y-o.hh-6,o.y+o.hh+6])])].sort((a,b)=>a-b),cols=xs.length;
 const indexOf=p=>ys.indexOf(p.y)*cols+xs.indexOf(p.x),point=k=>({x:xs[k%cols],y:ys[Math.floor(k/cols)]}),sk=indexOf(start),goal=indexOf(end),heap=[],cost=new Map(),came=new Map(),segments=new Map();
 const less=(a,b)=>a.bends<b.bends||(a.bends===b.bends&&a.estimate<b.estimate);
 const push=v=>{heap.push(v);let i=heap.length-1;while(i){const p=(i-1)>>1;if(!less(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}};
 const pop=()=>{const v=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;while(true){let j=i,l=i*2+1,r=l+1;if(l<heap.length&&less(heap[l],heap[j]))j=l;if(r<heap.length&&less(heap[r],heap[j]))j=r;if(i===j)break;[heap[i],heap[j]]=[heap[j],heap[i]];i=j;}}return v;};
 const initial=sk*3;cost.set(initial,{bends:0,length:0});push({key:initial,bends:0,length:0,estimate:Math.abs(end.x-start.x)+Math.abs(end.y-start.y)});let found=null,steps=0;
 while(heap.length&&steps++<180000){const current=pop(),best=cost.get(current.key);if(best.bends!==current.bends||best.length!==current.length)continue;const node=Math.floor(current.key/3),direction=current.key%3;if(node===goal){found=current.key;break;}const x=node%cols,y=Math.floor(node/cols),p=point(node);
  for(const [dx,dy,nextDirection] of [[-1,0,1],[1,0,1],[0,-1,2],[0,1,2]]){const nx=x+dx,ny=y+dy;if(nx<0||nx>=cols||ny<0||ny>=ys.length)continue;const next=ny*cols+nx,q=point(next),segmentKey=Math.min(node,next)+':'+Math.max(node,next);if(!segments.has(segmentKey))segments.set(segmentKey,straightClear(p,q));if(!segments.get(segmentKey))continue;
   const key=next*3+nextDirection,bends=current.bends+(direction&&direction!==nextDirection?1:0),length=current.length+Math.abs(p.x-q.x)+Math.abs(p.y-q.y),old=cost.get(key);if(old&&(old.bends<bends||(old.bends===bends&&old.length<=length)))continue;cost.set(key,{bends,length});came.set(key,current.key);push({key,bends,length,estimate:length+Math.abs(end.x-q.x)+Math.abs(end.y-q.y)});
  }
 }
 if(found==null)return '';const nodes=[];for(let key=found;key!=null;key=came.get(key))nodes.push(point(Math.floor(key/3)));nodes.reverse();const simple=[nodes[0]];for(let i=1;i<nodes.length-1;i++){const a=nodes[i-1],b=nodes[i],c=nodes[i+1];if((a.x===b.x&&b.x===c.x)||(a.y===b.y&&b.y===c.y))continue;simple.push(b);}simple.push(nodes[nodes.length-1]);return simple.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');

}
const api={sectors,placement,analyze,anchors,isCommon,layout,route,requirements:req,clearCache:ids=>{cache.clear();wholeCache.clear();if(Array.isArray(ids)){const selected=new Set(ids.map(String));for(const [key,c] of stable)if(c.ids.some(id=>selected.has(id)))stable.delete(key);}else stable.clear();}};root.GRPGSkillGraphV185=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
