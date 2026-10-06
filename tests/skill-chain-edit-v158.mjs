import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(process.env.SKILL_APP_SOURCE||new URL('../renderer/app.js',import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
function functionSource(name){const start=source.indexOf('  function '+name+'(');assert.ok(start>=0,name);const end=source.indexOf('\n  }',start);return source.slice(start,end+4);}
const context=vm.createContext({console,Set,FormData,Configurator:{
  replaceEntity(){},
  insertEntity(type){this.otherCalls.push('insert:'+type);},removeEntity(type){this.otherCalls.push('remove:'+type);},buildPayload(){},collectEntity(){},remapReferences(type){this.otherCalls.push('remap:'+type);},otherCalls:[]
},SKILLS_V50:{},SKILL_LIST_V50:[],PLAYER_TEMPLATES:{},App:{state:{users:{}}},Data:{},worldData:{},
slugifyId:x=>String(x),SKILL_TYPE_SPECIALIZATION_V55:'specialization',SKILL_TYPE_SKILL_V55:'skill',
normalizeSkillTypeV55:x=>x||'skill',normalizeAbilityRequirementsV52:x=>x||[],
normalizeAbilityValueV53:x=>Number(x)||0,ABILITY_MODEL_V50:[],numberOrFallbackV50:(x,d)=>Number.isFinite(Number(x))?Number(x):d,
normalizeSkillIdArrayV50:x=>[...new Set(x||[])],normalizeSpecializationIncreaseIdsV55:x=>[...new Set(x||[])],
sortEntitiesForList:x=>x,serializeWorldSection:(section,record)=>({SKILLS:copy(record)}),
getCheckedValues:(form,name)=>form.checked[name]||[]});
vm.runInContext(functionSource('normalizeSkillTreePositionSafeV64')+'\n'+functionSource('normalizeSkillV50')+'\n'+functionSource('syncSkillsWorldDataV50'),context);
const baseStart=source.indexOf('  replaceEntity(type, oldId, entity) {'),baseEnd=source.indexOf('  collectEntity(',baseStart);
vm.runInContext('Configurator.replaceEntity = function'+source.slice(baseStart,baseEnd).trim().slice('replaceEntity'.length).replace(/,$/,';'),context);
const start=source.indexOf('  const __configInsertEntityV50 ='),end=source.indexOf('  const __configRenderV50 =',start);
vm.runInContext(source.slice(start,end),context);
function fixture(){
 context.SKILLS_V50=Object.fromEntries(['a','b','c','d','e'].map((id,i)=>[id,{id,name:id,skillType:'skill',category:'Chain',description:'Original',cost:1,requiredSkillIds:i?['abcde'[i-1]]:[],specializationIncreases:id==='a'?['c']:[],treePos:{x:100+i*200,y:300}}]));
 context.PLAYER_TEMPLATES={template:{id:'template',skills:['c'],specializations:{c:2}}};context.App.state.users={live:{id:'live',skills:['c'],specializations:{c:3}}};context.Configurator.selectedId='c';context.syncSkillsWorldDataV50();
}
function formEdit(id='c',requires=['b']){
 const values={id,name:'Edited third',category:'Chain',cost:'2',description:'Edited description',skillType:'skill',color:'#abcdef'};
 const form={querySelector:()=>null,checked:{requiredSkillIds:requires}};
 const fd={get:name=>values[name]??null};return context.Configurator.collectEntity('skills',form,fd);
}
function links(){return copy(Object.fromEntries(Object.values(context.SKILLS_V50).map(s=>[s.id,s.requiredSkillIds])));}
fixture();const originalLinks=links(),originalPositions=copy(Object.fromEntries(Object.entries(context.SKILLS_V50).map(([id,s])=>[id,s.treePos])));
const edited=formEdit();
context.Configurator.replaceEntity('skills','c',edited);
assert.deepEqual(links(),originalLinks,'editing the third skill preserves the complete five-skill chain');
assert.deepEqual(copy(edited.treePos),{x:500,y:300},'World Config keeps the manual tree position');
assert.equal(context.SKILLS_V50.c.description,'Edited description');assert.equal(context.SKILLS_V50.c.cost,2);
assert.deepEqual(copy(Object.fromEntries(Object.entries(context.SKILLS_V50).map(([id,s])=>[id,s.treePos]))),originalPositions);
assert.deepEqual(copy(context.PLAYER_TEMPLATES.template.skills),['c']);assert.equal(context.PLAYER_TEMPLATES.template.specializations.c,2);assert.equal(context.App.state.users.live.specializations.c,3);
assert.deepEqual(copy(context.worldData.skills.SKILLS.d.requiredSkillIds),['c'],'serialized world preserves incoming prerequisite');
context.SKILLS_V50=copy(context.worldData.skills.SKILLS);context.Configurator.replaceEntity('skills','c',formEdit());assert.deepEqual(links(),originalLinks,'repeated edits after reload preserve edges');
context.Configurator.replaceEntity('skills','c',formEdit('c',['a']));assert.deepEqual(copy(context.SKILLS_V50.c.requiredSkillIds),['a'],'explicit prerequisite changes remain supported');assert.deepEqual(copy(context.SKILLS_V50.d.requiredSkillIds),['c']);
fixture();context.Configurator.replaceEntity('skills','c',formEdit('renamed-c'));
assert.equal(context.SKILLS_V50.c,undefined);assert.equal(context.SKILLS_V50['renamed-c'].name,'Edited third');assert.deepEqual(copy(context.SKILLS_V50['renamed-c'].requiredSkillIds),['b']);assert.deepEqual(copy(context.SKILLS_V50.d.requiredSkillIds),['renamed-c']);assert.deepEqual(copy(context.SKILLS_V50.e.requiredSkillIds),['d']);assert.deepEqual(copy(context.SKILLS_V50.a.specializationIncreases),['renamed-c']);
for(const player of [context.PLAYER_TEMPLATES.template,context.App.state.users.live]){assert.deepEqual(copy(player.skills),['renamed-c']);assert.ok(player.specializations['renamed-c']>0);assert.equal(player.specializations.c,undefined);}
assert.equal(context.Configurator.selectedId,'renamed-c');assert.deepEqual(copy(context.worldData.skills.SKILLS.d.requiredSkillIds),['renamed-c']);
context.Configurator.remapReferences('skills','renamed-c','renamed-c');assert.equal(context.PLAYER_TEMPLATES.template.specializations['renamed-c'],2,'same-ID remapping is harmless');
fixture();const before=copy(context.SKILLS_V50);assert.throws(()=>context.Configurator.replaceEntity('skills','c',formEdit('d')),/ID/);assert.deepEqual(copy(context.SKILLS_V50),before,'ID collision must not alter either branch');
fixture();context.Configurator.removeEntity('skills','c');assert.equal(context.SKILLS_V50.c,undefined);assert.deepEqual(copy(context.SKILLS_V50.d.requiredSkillIds),[],'explicit deletion still removes references');assert.deepEqual(copy(context.SKILLS_V50.e.requiredSkillIds),['d']);assert.deepEqual(copy(context.PLAYER_TEMPLATES.template.skills),[]);
context.Configurator.replaceEntity('planets','old',{id:'new'});assert.deepEqual(context.Configurator.otherCalls,['remove:planets','insert:planets','remap:planets'],'other World Config entity types retain their save path');
console.log('Skill chain: five-node edits/reload, tree positions, grants, explicit prerequisites, ID rename/collision, deletion and non-skill delegation passed');
