const assert=require('node:assert/strict'),G=require('../renderer/skill-graph-v185.js');
const make=(id,parent)=>({id,requiredAbilities:[{key:'strength',value:1}],requiredSkillIds:parent?[parent]:[]});
// Deep/wide branches must not push their first node out by reserving leaf lanes.
for(const width of [1,4,8,12]){G.clearCache();const skills=[make('root'),...Array.from({length:width},(_,i)=>make('leaf'+i,'root'))],before=JSON.stringify(skills),g=G.layout(skills);assert(Math.hypot(g.positions.get('root').x,g.positions.get('root').y)<=330.01);assert.equal(JSON.stringify(skills),before);assert.equal(g.routes.size,width);assert([...g.routes.values()].every(Boolean));}
// A clear direct line wins over arcs even if endpoints have different angles.
const graph={positions:new Map([['a',{x:500,y:300}],['b',{x:900,y:700}]]),assignment:new Map()};let d=G.route(graph,{from:'a',to:'b'});assert.equal((d.match(/ L/g)||[]).length,1);assert(!d.includes(' A'));
graph.positions.set('blocker',{x:700,y:500});d=G.route(graph,{from:'a',to:'b'});assert.equal((d.match(/ L/g)||[]).length,2);assert(!d.includes(' A'));
// General and cross-window requirements remain in the DAG, but not in SVG routes.
G.clearCache();const skills=[make('root'),{id:'common',category:'Общее',requiredSkillIds:['root'],treePlacement:{mode:'manual',x:9000,y:9000}},make('child','common')],original=JSON.stringify(skills),g=G.layout(skills);assert.equal(g.edges.length,2);assert.equal(g.visualEdges.length,0);assert.equal(g.routes.size,0);assert.equal(g.generalArea,null);assert.equal(G.route(g,{from:'common',to:'child'}),'');assert.equal(JSON.stringify(skills),original);
console.log('PASS near-stat wide-branch roots, straight/one-elbow routing preference and text-only general prerequisites without metadata mutation');
