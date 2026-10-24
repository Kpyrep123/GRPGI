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
 p.groupId=String(p.groupId||'');return p;
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
const cache=new Map(),stable=new Map();
function layout(skills,groups={},config=sectors){
 const signature=JSON.stringify([config,groups,skills.map(s=>[String(s.id),req(s),s.requiredAbilities,s.treeBranch,s.treePos,s.treePlacement,s.isBasic,s.originOnly178]).sort((a,b)=>a[0].localeCompare(b[0]))]);
 if(cache.has(signature))return cache.get(signature);
 const analysis=analyze(skills),positions=new Map(),assignment=new Map(),occupied=config.map(b=>({id:'stat:'+b.id,...polar(182,b.angle),hw:62,hh:42})),groupRegions=[];
 function free(p){return Math.hypot(p.x,p.y)>265&&!occupied.some(o=>Math.abs(o.x-p.x)<o.hw+62&&Math.abs(o.y-p.y)<o.hh+66);}
 const nodeKey=s=>JSON.stringify([s.treePlacement,s.treePos,s.treeBranch,anchors(s,analysis.by),(s.requiredSkillIds||[]),s.isBasic]);
 const stableRows=skills.filter(s=>stable.get(String(s.id))?.key===nodeKey(s));
 for(const s of stableRows){const old=stable.get(String(s.id)).point;occupied.push({id:'stable:'+s.id,...old,hw:62,hh:66});}
 const rows=[...skills].sort((a,b)=>{const pa=placement(a.treePlacement),pb=placement(b.treePlacement);return (pb?.mode==='manual')-(pa?.mode==='manual')||(pa?.order||0)-(pb?.order||0)||String(a.id).localeCompare(String(b.id));});
 for(const s of rows){const id=String(s.id),p=placement(s.treePlacement),stats=anchors(s,analysis.by),vectors=stats.map(k=>config.find(b=>b.id===k)).filter(Boolean);let a=vectors.length?Math.atan2(vectors.reduce((v,b)=>v+Math.sin(b.angle),0),vectors.reduce((v,b)=>v+Math.cos(b.angle),0)):Math.PI;
 if(p?.groupId){let h=0;for(const c of p.groupId)h=(h*31+c.charCodeAt(0))>>>0;a+=((h%9)-4)*.055;}
 a+=rad(p?.angleOffset||0);const depth=analysis.depth.get(id)||0;let radius=350+Math.max(0,Math.floor(p?.ring??(stats.length>1?3:depth+1))-1)*150+(p?.radiusOffset||0),point;
 const previous=stable.get(id);if(previous?.key===nodeKey(s))point={x:previous.point.x,y:previous.point.y};
 const legacy=s.treePos;const manual=p?.mode==='manual';
 if(manual&&Number.isFinite(p.x)&&Number.isFinite(p.y))point={x:p.x,y:p.y};;
 if(!point){for(let step=0;step<3000;step++){const row=Math.floor(step/7),lane=step%7,offset=lane===0?0:Math.ceil(lane/2)*.13*(lane%2?1:-1);point=polar(Math.max(330,radius+row*150),a+offset);if(free(point))break;}}
 const branch=stats.length===1?stats[0]:stats.length>1?'combined':'neutral';positions.set(id,{...point,branch,depth,anchors:stats,groupId:p?.groupId||'',manual});stable.set(id,{key:nodeKey(s),point:{...point}});assignment.set(id,branch);occupied.push({id,...point,hw:62,hh:66});
 }
 for(const group of Object.values(groups)){const nodes=[...positions.values()].filter(p=>p.groupId===group.id);if(nodes.length){const xs=nodes.map(p=>p.x),ys=nodes.map(p=>p.y);groupRegions.push({...group,x:Math.min(...xs)-82,y:Math.min(...ys)-94,w:Math.max(...xs)-Math.min(...xs)+164,h:Math.max(...ys)-Math.min(...ys)+180});}}
 const graph={...analysis,positions,assignment,common:[],commonHeight:170,groups:groupRegions,routes:new Map(),signature};
 // Route cache is structural and independent of ownership, points and camera.
 for(const [index,e] of graph.edges.entries())graph.routes.set(e.from+'|'+e.to,route(graph,e,index));
 cache.set(signature,graph);if(cache.size>12)cache.delete(cache.keys().next().value);return graph;
}
function route(graph,edge,index=0){
 const start=graph.positions.get(edge.from),end=graph.positions.get(edge.to);if(!start||!end)return '';
 const obstacles=[...graph.positions].filter(([id])=>id!==edge.from&&id!==edge.to).map(([,p])=>({x:p.x,y:p.y,hw:62,hh:66}));
 const bucket=new Map();for(const o of obstacles){for(let x=Math.floor((o.x-o.hw)/150);x<=Math.floor((o.x+o.hw)/150);x++)for(let y=Math.floor((o.y-o.hh)/150);y<=Math.floor((o.y+o.hh)/150);y++){const k=x+':'+y;if(!bucket.has(k))bucket.set(k,[]);bucket.get(k).push(o);}}
 const clear=p=>Math.hypot(p.x,p.y)>248&&!(bucket.get(Math.floor(p.x/150)+':'+Math.floor(p.y/150))||[]).some(o=>Math.abs(p.x-o.x)<o.hw&&Math.abs(p.y-o.y)<o.hh);
 const sr=Math.hypot(start.x,start.y),er=Math.hypot(end.x,end.y),sa=angle(Math.atan2(start.y,start.x)),ea=angle(Math.atan2(end.y,end.x));
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
const api={sectors,placement,analyze,anchors,layout,route,requirements:req,clearCache:ids=>{cache.clear();if(Array.isArray(ids))ids.forEach(id=>stable.delete(String(id)));else stable.clear();}};root.GRPGSkillGraphV185=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
