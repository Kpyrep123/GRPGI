// Ship the same pure rules and extract the existing scene damage pipeline, without DOM code.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),dest=path.join(root,'pocketbase/pb_hooks'),check=process.argv.includes('--check');
function emit(name,value){const file=path.join(dest,name);if(check){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==value)throw Error('Regenerate raid rules: '+name);}else fs.writeFileSync(file,value);}
for(const file of ['combat-instinct-v199.js','combat-devices-v200.js','combat-state-v291.js','combat-lua-v204.js','combat-rules-v119.js','combat-trauma-v195.js','combat-movement-v198.js','combat-vision-v225.js','weapon-handling-v203.js','aberration-roll.js'])emit(file,fs.readFileSync(path.join(root,'renderer',file),'utf8'));
emit('raid-core-v290.js',fs.readFileSync(path.join(root,'raid-service/raid-core.cjs'),'utf8').replace("?'../pocketbase/pb_hooks/'","?'./'"));
emit('raid-effects-v292.js',fs.readFileSync(path.join(root,'raid-service/raid-effects-v292.cjs'),'utf8'));
const source=fs.readFileSync(path.join(root,'renderer/scene-editor-v113.js'),'utf8');
const part=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);if(start<0||end<0)throw Error(a);return source.slice(start,end);};
const body=part('  function itemIsPhysicalArmor119','  function damageType202')+part('  function incomingDefense119','  function ensureNpcGear287')+part('  function absorptionSourceV138','  function wearArmorFromBlast093');
const prefix=`'use strict';\nmodule.exports=function(deps){
const window={GRPGStatsV113:deps.stats,GRPGItemInstancesV215:deps.instances,GRPGDamageTypesV202:deps.types,GRPGAberrationWeapons:{effects:deps.effects}};
const num=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f,list=x=>Array.isArray(x)?x:[],clone=x=>JSON.parse(JSON.stringify(x)),clamp104=(x,a,b)=>Math.max(a,Math.min(b,num(x)));
const equipmentItem105=deps.item,entityForToken=u=>u.profile,timedStatModifiers122=u=>deps.temporary(u),tokenDefense105=u=>u.armorClassOverrideV120?u.armorClass:deps.stats.compute(u.profile).values.armorClass;
const itemRuntimeStateV138=(u,item,slot)=>deps.instances.instance(u.profile,item.id,-1,slot);
const itemBrokenV138=(u,item,slot)=>item?!!itemRuntimeStateV138(u,item,slot)?.broken:false;
`;
emit('raid-combat-math-v290.js',prefix+body+'\nreturn {defense:incomingDefense119,absorb:applyAbsorptionV138};\n};\n');
