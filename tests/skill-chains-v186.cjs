const assert=require('node:assert/strict'),fs=require('node:fs'),G=require('../renderer/skill-graph-v185.js');
const radius=p=>Math.hypot(p.x,p.y),angle=p=>Math.atan2(p.y,p.x),snapshot=g=>[...g.positions].sort(([a],[b])=>a.localeCompare(b));
const make=(id,parent,extra={})=>({id,name:id,requiredAbilities:[{key:'strength',value:1}],requiredSkillIds:parent?[parent]:[],...extra});
// Deliberately reverse lexical ID order; no ID or display order may reverse learning order.
const ids=['zz_root','yy_second','mm_third','bb_fourth','aa_fifth'];
const chain=ids.map((id,i)=>make(id,ids[i-1])),parallel=['z_support','m_support','a_support'].map((id,i,a)=>make(id,a[i-1],{treePlacement:{mode:'auto',groupId:'theme'}}));
const extras=['01_free','02_free','03_free'].map(id=>make(id,null));
const data=[...chain,...parallel,...extras];const original=JSON.stringify(data);G.clearCache();const graph=G.layout(data,{theme:{id:'theme',name:'A theme'}});
for(const sequence of [ids,parallel.map(s=>s.id)]){
 for(let i=1;i<sequence.length;i++){const p=graph.positions.get(sequence[i-1]),q=graph.positions.get(sequence[i]);assert(radius(q)>=radius(p)+159.99);assert(Math.abs(angle(q)-angle(p))<1e-8);const path=graph.routes.get(sequence[i-1]+'|'+sequence[i]);assert(path);assert.equal((path.match(/ L/g)||[]).length,1);assert.equal((path.match(/ A/g)||[]).length,0);}
}
assert.notEqual(angle(graph.positions.get(ids[0])),angle(graph.positions.get(parallel[0].id)));
assert.equal(JSON.stringify(data),original);
G.clearCache();assert.deepEqual(snapshot(G.layout([...data].reverse(),{theme:{id:'theme',name:'A theme'}})),snapshot(graph));
// A fork stays nearby; a merge comes after both requirements, with all real edges.
const fork=[make('r'),make('left','r'),make('right','r'),make('merge',null,{requiredSkillIds:['left','right']}),make('last','merge')];G.clearCache();const f=G.layout(fork);
for(const e of f.edges)assert(radius(f.positions.get(e.to))>=radius(f.positions.get(e.from))+159.99);
assert(Math.abs(angle(f.positions.get('left'))-angle(f.positions.get('right')))<.5);assert.equal(f.edges.filter(e=>e.to==='merge').length,2);assert(Math.abs(angle(f.positions.get('last'))-angle(f.positions.get('merge')))<1e-8);
for(const path of f.routes.values()){assert(path);assert((path.match(/ A/g)||[]).length<=1);assert((path.match(/ L/g)||[]).length<=2);}
const before=snapshot(f);const added=G.layout([...fork,make('another_unrelated_root')]);for(const [id,p] of before)assert.deepEqual(added.positions.get(id),p);
const manual=[make('pin',null,{treePlacement:{mode:'manual',x:900,y:-400}}),make('child','pin')];G.clearCache();const m=G.layout(manual);assert.deepEqual([m.positions.get('pin').x,m.positions.get('pin').y],[900,-400]);assert(radius(m.positions.get('child'))>radius(m.positions.get('pin')));assert(Math.abs(angle(m.positions.get('child'))-angle(m.positions.get('pin')))<1e-8);
// Cross-sector automatic dependants must follow a changed manual prerequisite.
const cross=[make('pinned',null,{treePlacement:{mode:'manual',x:0,y:-800}}),make('combined','pinned',{requiredAbilities:[{key:'strength',value:1},{key:'endurance',value:1}]})];G.clearCache();G.layout(cross);const changedCross=G.layout(cross.map(s=>s.id==='pinned'?{...s,treePlacement:{mode:'manual',x:0,y:-1800}}:s));assert(radius(changedCross.positions.get('combined'))>=1960);
// Actual project catalogue must retain every definition, prerequisite and script.
const raw=JSON.parse(fs.readFileSync('renderer/data/skills.json','utf8')),skills=Object.values(raw.SKILLS||raw),serialized=JSON.stringify(raw);G.clearCache();const start=performance.now(),catalogue=G.layout(skills),elapsed=performance.now()-start;for(const e of catalogue.edges){const a=catalogue.positions.get(e.from),b=catalogue.positions.get(e.to);if(!b.manual)assert(radius(b)>=radius(a)+159.99);}assert.equal(JSON.stringify(raw),serialized);assert.equal([...catalogue.routes.values()].filter(Boolean).length,catalogue.edges.length);console.log(skills.length?'Nonempty catalogue layout ms '+Math.round(elapsed):'Empty shipped catalogue retained; nonempty sequences exercised by fixtures');
for(const name of ['skill-graph-v185.js','skill-radial-v177.js','skill-graph-v185.css'])assert.equal(fs.readFileSync('renderer/'+name,'utf8'),fs.readFileSync('deploy/site/app/'+name,'utf8'));
assert(!fs.readFileSync('renderer/skill-radial-v177.js','utf8').includes('>Б</small>'));console.log('PASS reversed-ID sequential lanes, parallel corridors, outward forks/merges, direct/simple routes, stable unrelated components, manual pins, catalogue preservation and explicit basic label');
