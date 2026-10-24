const assert=require('node:assert/strict'),G=require('../renderer/skill-graph-v185.js');
const radius=p=>Math.hypot(p.x,p.y);
const chain=(key,prefix=key)=>Array.from({length:5},(_,i)=>({id:prefix+i,name:'Long two-line skill name',requiredAbilities:[{key,value:1}],requiredSkillIds:i?[prefix+(i-1)]:[]}));
// A solitary sequence must start near its stat, with no empty outer ring.
for(const stat of G.sectors){G.clearCache();const skills=chain(stat.id),before=JSON.stringify(skills),g=G.layout(skills);assert.equal(radius(g.positions.get(stat.id+0)),350);for(let i=1;i<5;i++)assert(Math.abs(radius(g.positions.get(stat.id+i))-radius(g.positions.get(stat.id+(i-1)))-160)<1e-6);assert(radius(g.positions.get(stat.id+4))<=991);assert.equal(JSON.stringify(skills),before);}
// Multiple lanes need room for text, without paying for an unused lane.
for(const count of [2,3,4]){G.clearCache();const skills=Array.from({length:count},(_,i)=>chain('strength','lane'+i+'_')).flat(),g=G.layout(skills);for(let i=0;i<count;i++)assert(radius(g.positions.get('lane'+i+'_0'))<=520);const ps=[...g.positions.values()];for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)assert(Math.abs(ps[i].x-ps[j].x)>=138||Math.abs(ps[i].y-ps[j].y)>=150);assert([...g.routes.values()].every(Boolean));}
// The separate general tree stays right of all radial skills with compact rows.
G.clearCache();const skills=[...chain('dexterity'),...Array.from({length:5},(_,i)=>({id:'general'+i,category:'Общее',requiredSkillIds:i?['general'+(i-1)]:[]}))],g=G.layout(skills),right=Math.max(...[...g.positions.values()].filter(p=>p.branch!=='general').map(p=>p.x));assert.equal(g.positions.get('general0').x-right,240);for(let i=1;i<5;i++)assert.equal(g.positions.get('general'+i).y-g.positions.get('general'+(i-1)).y,160);
const saved=[...g.positions];assert.deepEqual([...G.layout(skills.map(s=>({...s,cost:99,owned:true}))).positions],saved);
console.log('PASS compact center/layer/lane bounds in all sectors, label clearance, routed sequences, compact separate general tree and stable status refresh');
