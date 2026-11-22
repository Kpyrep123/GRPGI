/* Server-owned raid state machine. Every mutation is committed with its random results. */
'use strict';
const root=typeof __hooks==='undefined'?'../pocketbase/pb_hooks/':__hooks+'/';
const T=require(root+'combat-trauma-v195.js');
const Devices=require(root+'combat-devices-v200.js');
const Lua=require(root+'combat-lua-v204.js');
const AreaRuntime=require(root+'raid-effects-v292.js');
const Bridge=require(root+'combat-state-v291.js');
const R=require(root+'combat-rules-v119.js');
const D=require(root+'damage-types-v202.js');
const I=require(root+'item-instances-v215.js');
const Copies=require(root+'aberration-instances.js');
const Catalog=require(root+'aberration-catalog.js');
const Roll=require(root+'aberration-roll.js');
const Vision=require(root+'combat-vision-v225.js');
const Movement=require(root+'combat-movement-v198.js');
const Stats=require(root+'grpgi_loot_core_v137.js');
const CombatMath=require(root+'raid-combat-math-v290.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const arr=x=>Array.isArray(x)?x:[];
const num=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f;
const fail=message=>{throw Error(message);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function week(now){
  const local=new Date(now+10800000),day=(local.getUTCDay()+2)%7;
  let start=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-day,20)-10800000;
  if(now<start)start-=604800000;
  return {id:new Date(start+10800000).toISOString().slice(0,10),start,end:start+216000000,open:now>=start&&now<start+216000000};
}
function inside(zone,p){return zone?.points?.length>=3&&contains(zone.points,p);}
function contains(points,p){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[j],b=points[i];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
function segment(a,b,c,d){const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);return x*y<=0&&u*v<=0&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+1e-8&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))+1e-8;}
function polygon(asset){
  const cx=num(asset.x)+num(asset.w??asset.width,1)/2,cy=num(asset.y)+num(asset.h??asset.height,1)/2,angle=num(asset.rotation)*Math.PI/180;
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{x*=num(asset.w??asset.width,1)/2;y*=num(asset.h??asset.height,1)/2;return{x:cx+x*Math.cos(angle)-y*Math.sin(angle),y:cy+x*Math.sin(angle)+y*Math.cos(angle)};});
}
function blockers(map,a,b,kind='blockSight'){
  return [...arr(map.assets),...arr(map.templates)].filter(o=>kind==='cover'?num(o.coverArmorBonus)>0||o.coverType&&o.coverType!=='none':o[kind]===true||o.shape==='wall'&&o[kind]!==false).filter(o=>{
    const p=o.points?.length?o.points:polygon(o);if(contains(p,a)||contains(p,b))return true;
    const count=o.shape==='wall'?p.length-1:p.length;return p.some((point,i)=>i<count&&segment(a,b,point,p[(i+1)%p.length]));
  });
}
function clear(map,a,b){return !blockers(map,a,b).length&&!Vision.elevationBlocksSight(map,a,b);}
function pointOK(s,p,ignore){const map=s.mission.maps.find(m=>m.id===s.mapId);return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=.25&&p.y>=.25&&p.x<=map.width-.25&&p.y<=map.height-.25&&!blockers(map,p,p,'blockMovement').length&&!s.units.some(u=>u.id!==ignore&&u.carriedBy!==ignore&&u.mapId===s.mapId&&!u.dead229&&distance(p,u)<.7);}
function path(s,a,b){
  const map=s.mission.maps.find(m=>m.id===s.mapId);if(!pointOK(s,b,a.id))fail('Точка занята или недоступна');
  const step=.5,key=p=>Math.round(p.x/step)+','+Math.round(p.y/step),open=[{x:a.x,y:a.y,g:0}],seen=new Map(),limit=20000;let count=0;
  while(open.length&&count++<limit){open.sort((x,y)=>(x.g+distance(x,b))-(y.g+distance(y,b)));const p=open.shift(),k=key(p);if(seen.has(k))continue;seen.set(k,p);
    if(distance(p,b)<=.72&&!blockers(map,p,b,'blockMovement').length){const result=[b];let cur=p;while(cur){result.push({x:cur.x,y:cur.y});cur=cur.parent;}return result.reverse();}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const n={x:p.x+dx*step,y:p.y+dy*step,g:p.g+Math.hypot(dx,dy)*step,parent:p};if(!seen.has(key(n))&&pointOK(s,n,a.id)&&!blockers(map,p,n,'blockMovement').length)open.push(n);}
  }fail('Путь не найден');
}
function validate(mission,world){
  if(!mission?.id||!arr(mission.maps).length)fail('Нужны ID миссии и карты');
  if(new Set(mission.maps.map(m=>m.id)).size!==mission.maps.length)fail('ID карт должны различаться');
  if(!mission.entry?.planetId||!mission.entry?.objectId||!mission.entry?.dialogId)fail('Настройте НПС и диалог входа');
  for(const m of mission.maps){
    if(!m.id||!(m.width>0&&m.height>0))fail('Некорректные размеры карты');
    const zones=arr(m.templates).filter(z=>z.raidZone290);
    if(zones.some(z=>!['spawn','transition','evacuation','objective'].includes(z.raidZone290)||!z.id||!z.points||z.points.length<3))fail('Некорректная зона вылазки');
    for(const z of zones.filter(z=>z.raidZone290==='transition')){const target=mission.maps.find(m=>m.id===z.targetMap290);if(!target||!arr(target.templates).some(x=>x.id===z.targetZone290&&x.points?.length>=3))fail('Переход не связан с зоной назначения');}
    for(const t of arr(m.tokens)){if(t.playerId)fail('Экспортируйте карты без игроков');if(!t.npcId&&(!Devices.device(t)||!world.equipment?.EQUIPMENT?.[t.equipmentItemId]||!arr(m.tokens).some(o=>o.id===t.operatorTokenIdV129&&o.npcId)))fail('Устройству нужен предмет и оператор НПС на той же карте');if(t.npcId&&!world.npcs?.NPCS?.[t.npcId])fail('Не найден шаблон НПС '+t.npcId);}
  }
  const start=mission.maps.find(m=>m.id===(mission.startMapId||mission.maps[0].id));
  if(!start||!arr(start.templates).some(z=>z.raidZone290==='spawn'))fail('Нужна зона высадки');
  if(!mission.maps.some(m=>arr(m.templates).some(z=>z.raidZone290==='evacuation')))fail('Нужна зона эвакуации');
  if(!Number.isSafeInteger(mission.reward?.credits)||mission.reward.credits<0||!Number.isSafeInteger(mission.reward?.skillPoints)||mission.reward.skillPoints<0)fail('Награды должны быть целыми и неотрицательными');
  for(const row of arr(mission.reward.items))if(!world.equipment?.EQUIPMENT?.[row.itemId]||!Number.isSafeInteger(row.qty)||row.qty<1)fail('Неверная предметная награда');
  if(!arr(mission.goals).length||mission.goals.some(g=>!['eliminate','interact','reach','deliver','hold'].includes(g.type)))fail('Настройте цели из списка');
  if(new Set(mission.goals.map(g=>g.id)).size!==mission.goals.length||mission.goals.some(g=>!g.id||['__proto__','constructor','prototype'].includes(g.id)))fail('Нужны уникальные ID целей');
  for(const g of mission.goals){const m=mission.maps.find(m=>m.id===g.mapId);if(g.mapId&&!m)fail('Не найдена карта цели');if(g.type!=='eliminate'&&(!m||!arr(m.templates).some(z=>z.id===g.zoneId&&z.points?.length>=3)))fail('Нужна зона цели');if(g.type==='deliver'&&(!world.equipment?.EQUIPMENT?.[g.itemId]||!Number.isSafeInteger(g.qty)||g.qty<1))fail('Проверьте доставляемый предмет');if(g.type==='hold'&&(!Number.isSafeInteger(g.rounds)||g.rounds<1))fail('Проверьте раунды удержания');}
  return true;
}
function create(world,mission,members,now,random,id){
  validate(mission,world);const s={schema:290,luaContext291:id(),phase:'running',revision:0,mission:clone(mission),world:clone(world),mapId:mission.startMapId||mission.maps[0].id,members:members.map(p=>p.id),units:[],order:[],turn:0,round:1,deadline:now+60000,receipts:[],log:[],goals:{},createdAt:now};
  const api=engine(s,random,id);const map=api.map(),spawn=map.templates.find(z=>z.raidZone290==='spawn');
  for(const p of members){
    const profile=api.stats.normalizePlayer(p);I.normalize(profile,api.item,id);
    const u={id:p.id,playerId:p.id,teamId:'players',mapId:s.mapId,profile,name:p.displayName||p.name||p.id,hpCurrent:num(p.stats?.hpCurrent,num(profile.stats?.hpCurrent,profile.stats?.hpMax)),hpMax:num(profile.stats?.hpMax),traumaV195:clone(profile.traumaV195||{}),ownTurnV199:num(profile.combatState093?.ownTurn),conditionsV138:Bridge.conditions(profile.combatState093||{}),control:clone(profile.combatState093?.control||null),critical229:clone(profile.combatState093?.critical||null),loseNextAction093:!!profile.combatState093?.loseNextAction,dead229:!!profile.dead229,actionUsed:false,reactionUsedV119:false,movedThisTurn:0};
    u.luaResources204={};u.luaState204={};u.timedModifiersV122=[];Bridge.restoreLua(u,profile.combatState093?.lua204);
    api.syncMaximum(u);
    if(u.dead229||u.hpCurrent<=0||u.conditionsV138.dying||u.conditionsV138.unconscious)fail('Участник не готов к вылазке: '+u.name);
    s.units.push(u);api.place(u,spawn);u.initiative=api.die(20)+api.computed(u).values.initiativeBonus;
  }
  for(const m of mission.maps)for(const t of arr(m.tokens).filter(t=>t.npcId)){
    const base=clone(world.npcs?.NPCS?.[t.npcId]||t.profile||{});const owned=Copies.spawn(base,api.item,(item,danger)=>api.aberrate(item,danger),id,random);
    const profile={...base,...owned};
    for(const row of arr(t.combatInventoryV120))for(const original of arr(row.instancesV215))if(original.aberration252?.forged){const copy=clone(original);const rekey=c=>{c.id=id();for(const a of arr(c.attachments))rekey(a.copy);};rekey(copy);const slot=copy.slot;delete copy.slot;Copies.append(profile,api.item(row.itemId),[copy]);if(slot){profile.equipmentSlots[slot]=row.itemId;I.bind(profile,row.itemId,slot,copy.id);}}
    for(const loot of arr(base.lootTable)){if(['weapon','armor'].includes(api.item(loot.itemId)?.type)&&Object.values(profile.equipmentSlots||{}).includes(loot.itemId))continue;if(random()*100>=num(loot.chance,100))continue;const i=api.item(loot.itemId);if(!i)continue;const qty=Math.max(1,Math.trunc(num(loot.qty,1)));if(I.tracked(i))for(let n=0;n<qty;n++)Copies.append(profile,i,[Copies.create(i,api.aberrate(i,base.dangerLevel),id,random)]);else{let r=profile.inventory.find(r=>r.itemId===i.id);if(!r)profile.inventory.push(r={itemId:i.id,qty:0});r.qty+=qty;}}
    const hp=num(t.hpMax,num(api.computed({profile}).values.maxHp,num(base.stats?.hpMax,num(base.hpMax,4))));const u={...clone(t),templateId293:t.id,id:id(),teamId:'npcs',mapId:m.id,profile,name:t.name||base.name||'Противник',hpMax:hp,hpCurrent:num(t.hpCurrent,hp),ownTurnV199:0,conditionsV138:{},traumaV195:{injuryPoints:0,schema:195},actionUsed:false,reactionUsedV119:false,movedThisTurn:0};u.luaResources204={};u.luaState204={};u.timedModifiersV122=[];s.units.push(u);u.initiative=api.die(20)+api.computed(u).values.initiativeBonus;
  }
  for(const m of mission.maps)for(const t of arr(m.tokens).filter(t=>!t.npcId&&Devices.device(t))){const operator=s.units.find(u=>u.mapId===m.id&&u.templateId293===t.operatorTokenIdV129),def=api.item(t.equipmentItemId),copy=Copies.create(def,null,id,random);api.spawnDevice(operator,def,copy,{x:t.x,y:t.y},t);}
  api.validateSources();api.reorder();api.event('OnSceneStart');api.event('OnBattleStart');api.begin(now);return s;
}
function engine(s,random=Math.random,id=()=>String(Date.now())+':'+random()){
  // Discard retired morale checks/routes without replaying damage or refunding spent resources.
  delete s.instinct293;
  if(['panic','panicPoint'].includes(s.pending?.kind))delete s.pending;
  if(s.move292?.panic)delete s.move292;
  for(const u of s.units){Bridge.stripMorale(u);Bridge.stripMorale(u.profile?.combatState093);}
  const stats=Stats.engine(s.world),item=key=>stats.equipment(key);
  let areas,draining=false;
  const map=()=>{const m=s.mission.maps.find(m=>m.id===s.mapId),extra=areas?.obstacles(s.mapId)||[];return extra.length?{...m,templates:[...arr(m.templates),...extra]}:m;};
  const unit=key=>s.units.find(u=>u.id===key)||fail('Участник не найден');
  const current=()=>s.units.find(u=>u.id===s.order[s.turn]);
  const die=sides=>{const n=Math.max(1,Math.min(100000,Math.trunc(sides)));const value=1+Math.floor(random()*n);log('d'+n+' → '+value);return value;};
  function log(text){s.log.push({at:Date.now(),text:String(text).slice(0,1500)});s.log=s.log.slice(-300);}
  const alive=u=>!u.dead229;
  const active=u=>alive(u)&&u.hpCurrent>0&&!u.conditionsV138?.unconscious&&!u.conditionsV138?.dying&&!u.conditionsV138?.stunned;
  function context291(u){return {sceneId:s.luaContext291||s.id||String(s.createdAt),battleId:s.luaContext291||s.id||String(s.createdAt),round:s.round,turn:num(u.ownTurnV199),unitId:u.id};}
  for(const u of s.units){if(!u.luaResources204){u.luaResources204=u.resources204||{};for(const row of Object.values(u.luaResources204))if(row.epoch==null){row.initial=row.initial??row.max;row.reset=row.reset||'battle';row.epoch=Lua.epoch(row.reset,context291(u));}}u.luaState204 ||= u.sourceData||{};u.reactionDebt204 ??= num(u.reactionDebt);if(!u.timedModifiersV122){u.timedModifiersV122=arr(u.modifiers).map(m=>({id:m.id,name:m.name,remainingTurns:Math.max(1,num(m.expires,num(u.ownTurnV199)+1)-num(u.ownTurnV199)),effects:[{property:m.target,operation:m.op,value:m.value,statRef:m.statRef}]}));}delete u.resources204;delete u.sourceData;delete u.modifiers;delete u.reactionDebt;}
  function resources(u){const out={};for(const key of Object.keys(u.luaResources204||{}))out[key]=Lua.resource(u.luaResources204,key,context291(u));return out;}
  function reactionAvailable(u){const pool=resources(u).reaction;return active(u)&&!Devices.device(u)&&!T.effects(u).noReaction&&!u.reactionUsedV119&&(!pool||pool.value>0);}
  function spendReaction(u){if(resources(u).reaction)Lua.spend(u.luaResources204,'reaction',1,context291(u));else u.reactionUsedV119=true;}
  const policyKey=source=>(source.ownerId||'')+':'+source.kind+':'+source.id;
  const policy=source=>s.policies292?.[policyKey(source)]?.script===source.luaScript?s.policies292[policyKey(source)]:null;
  const needsPolicy=source=>/function\s+Get(?:CostMode|EventScope|Behavior|CastRange|AOERadius|ThinkerDuration|ThinkerInterval)\s*\(/.test(source.luaScript)&&!policy(source);
  const scripted=source=>source.luaCostMode==='scripted'||(policy(source)?.costMode204||source.costMode204)==='scripted';
  const behavior=source=>String(source.behavior292||source.abilityBehavior||source.behavior||'scripted');
  const areaBehavior=source=>['aura','toggle_aura','persistent_area'].includes(behavior(source));
  const computed=(u,context={})=>stats.compute({...u.profile,stats:{...u.profile.stats,hpCurrent:u.hpCurrent}},{kind:u.playerId?'player':'npc',inCombat:true,temporaryModifiers:Bridge.modifiers(u),...context});
  const penalty=u=>T.effects(u).checkPenalty;
  function takeHelp(u,type){const h=u.help229;if(!h||h.type!=='any'&&h.type!==type)return 0;delete u.help229;log(u.name+': Помощь +'+h.bonus+' ('+type+')');return num(h.bonus);}
  function checkDie(u){const a=die(20);return T.effects(u).disadvantage?Math.min(a,die(20)):a;}
  function opportunityOptions(u){if(!reactionAvailable(u)||u.conditionsV138.handsBusy||Devices.device(u))return [];return ['primaryWeapon','secondaryWeapon','unarmed'].filter(slot=>{const w=weapon(u,slot),copy=I.instance(u.profile,w.id,-1,slot);return (slot==='unarmed'||u.profile.equipmentSlots?.[slot])&&w.weaponCategory==='melee'&&!copy?.broken&&!copy?.jammed&&!(T.effects(u).heavyWeaponRestricted&&w.heavy);}).map(slot=>({id:slot,name:weapon(u,slot).name}));}
  function opportunity(u,target,slot,now){if(!opportunityOptions(u).some(o=>o.id===slot)||!active(target)||distance(u,target)>1.01||!clear(map(),u,target))return;attack(u,target,slot,now,{free:true,opportunity:true});spendReaction(u);log(u.name+': атака по возможности');}

  function effectRows(u,slot='primaryWeapon'){
    const copy=I.instance(u.profile,u.profile.equipmentSlots?.[slot],-1,slot);
    return arr(copy?.aberration252?.effects).map(value=>{
      const [base,type]=value.split(':'),group=Catalog.find(g=>g.variants.some(v=>v.id===base)),variant=group?.variants.find(v=>v.id===base);if(!variant)return null;
      let amount=I.passiveEffect(base)?.value;
      if(amount==null)amount=group.id==='weapon-5'?Number(/d(\d+)/.exec(variant.value)?.[1]):num(String(variant.value).replace('−','-').split(/\s/)[0]);
      return{id:value,group:group.id,value:amount,type:group.id==='weapon-5'?'kinetic':type};
    }).filter(Boolean);
  }
  function aberrate(i,danger){const pool=Catalog.filter(g=>I.canRollAberration(i,g.category)).flatMap(g=>g.variants.map(v=>({...v,group:g.id})));const roll=Roll.roll(danger||1,pool,{random});if(!roll)return null;roll.effects=roll.effects.map(e=>{const g=e.match(/^(.*)-\d+$/)[1];return ['armor-20','armor-27','weapon-56'].includes(g)?e+':'+(['armor-20','armor-27'].includes(g)?D.aberrationTypeIds:['energy','electric','explosive','gas'])[Math.floor(random()*(['armor-20','armor-27'].includes(g)?5:4))]:g==='armor-28'?e+':any':g==='weapon-5'?e+':kinetic':e;});return roll;}
  function weapon(u,slot='primaryWeapon'){if(Devices.device(u))return item(u.equipmentItemId);return item(u.profile.equipmentSlots?.[slot])||{id:'__unarmed_v122',name:'Безоружная атака',type:'weapon',weaponCategory:'melee',isUnarmedV122:true,damage:'1',range:1};}
  function expression(value){const text=R.normalizeDamageExpression(value);if(/^\d+$/.test(text))return Number(text);const match=/^(\d{0,2})d(\d{1,5})([+-]\d+)?$/.exec(text);if(!match)fail('Не поддерживается формула урона: '+value);let out=num(match[3]);for(let n=0;n<Math.min(30,num(match[1],1)||1);n++)out+=die(Number(match[2]));return Math.max(0,out);}
  function place(u,zone){
    const points=zone.points,minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    for(let y=minY+.5;y<maxY;y+=1)for(let x=minX+.5;x<maxX;x+=1)if(inside(zone,{x,y})&&pointOK(s,{x,y},u.id)){u.x=x;u.y=y;u.mapId=s.mapId;return;}
    fail('Недостаточно места в зоне высадки/перехода');
  }
  function reorder(){s.order=s.units.filter(u=>u.mapId===s.mapId&&alive(u)&&!Devices.device(u)).sort((a,b)=>b.initiative-a.initiative||a.id.localeCompare(b.id)).map(u=>u.id);s.turn=0;}
  function speed(u){if(Devices.device(u))return u.equipmentType==='turret'?0:Math.max(0,num(item(u.equipmentItemId)?.unitMoveRange));const c=computed(u),p=u.profile;const load=Movement.weight(p.inventory,Object.values(p.equipmentSlots||{}),item);let speed=Movement.resolve({speed:c.values.movement,weight:load,capacity:c.values.carryCapacity}).speed;speed=T.speed(speed,u);if(u.conditionsV138?.prone)speed=Math.ceil(speed/4);if(u.carrying)speed=Math.floor(speed/2);if(u.control?.rootUntil>=u.ownTurnV199)return 0;if(u.control?.slowUntil>=u.ownTurnV199)speed=Math.max(0,speed-u.control.slow);return speed;}
  function release(u){if(u.carrying){const other=unit(u.carrying);delete other.carriedBy;delete u.carrying;u.conditionsV138.handsBusy=!!u.handsBeforeCarry;delete u.handsBeforeCarry;}}
  function syncMaximum(u){const delta=num(computed(u).values.maxHp)-num(stats.compute(u.profile,{kind:u.playerId?'player':'npc',inCombat:true,temporaryModifiers:[]}).values.maxHp);u.baseHpMax291 ??= u.playerId?num(stats.compute(u.profile,{kind:'player',temporaryModifiers:[]}).values.maxHp,u.hpMax):u.hpMax;u.hpMax=Math.max(1,u.baseHpMax291+delta);u.hpCurrent=Math.min(u.hpCurrent,u.hpMax);}
  function expire(hook,actor){for(const u of s.units){Bridge.expire(u,hook,context291(actor));syncMaximum(u);}areas?.phase(hook,actor);}
  function begin(now){s.eventCount=0;const u=current();if(!u)return;u.ownTurnV199=num(u.ownTurnV199)+1;u.actionUsed=!!u.loseNextAction093;u.loseNextAction093=false;u.reactionUsedV119=false;expire('OnTurnStart',u);if(num(u.reactionDebt204)>0){const pool=resources(u).reaction;if(pool){const take=Math.min(pool.value,u.reactionDebt204);if(take)Lua.spend(u.luaResources204,'reaction',take,context291(u));u.reactionDebt204-=take;}else{u.reactionUsedV119=true;u.reactionDebt204--;}}for(const d of s.units.filter(v=>v.operatorTokenIdV129===u.id&&v.mapId===s.mapId)){d.ownTurnV199=num(d.ownTurnV199)+1;expire('OnTurnStart',d);}u.disengagedV122=false;u.aiMoved=false;u.dashUsed=false;u.burst=null;u.movedThisTurn=0;u.budget=speed(u);u.profile.stats={...u.profile.stats,hpCurrent:u.hpCurrent};const beforeConditions=clone(u.conditionsV138||{});R.criticalTurn(u,'start');conditionEvents(u,beforeConditions);for(const m of arr(u.timedModifiersV122)){if(num(m.onTurnStartDamage)>0)damage(u,m.onTurnStartDamage,m.damageType||'kinetic',{sourceName:m.name||m.id,absorptionSource:'all'});if(num(m.onTurnStartHeal)>0)R.applyHeal(u,m.onTurnStartHeal);}s.deadline=now+60000;event('OnTurnStart',[u]);}
  function end(now){
    if(s.pending||s.flow||s.job||s.move292||s.action292||s.turnEnd292)fail('Сначала завершите текущий выбор');const u=current();if(!u){finish(now);return;}const beforeConditions=clone(u.conditionsV138||{});R.criticalTurn(u,'end');conditionEvents(u,beforeConditions);s.turnEnd292={actor:u.id,stage:'turnEnd'};event('OnTurnEnd',[u]);drain(now);
  }
  function turnStep(now){const t=s.turnEnd292,u=unit(t.actor);if(t.stage==='turnEnd'){expire('OnTurnEnd',u);for(const d of s.units.filter(v=>v.operatorTokenIdV129===u.id&&v.mapId===s.mapId))expire('OnTurnEnd',d);if(u.control){if(u.control.rootUntil<=u.ownTurnV199)delete u.control.rootUntil;if(u.control.slowUntil<=u.ownTurnV199){delete u.control.slowUntil;delete u.control.slow;}}t.stage='advance';}
    if(t.stage==='roundEnd'){expire('OnRoundEnd',u);s.round++;if(s.evac&&s.round>=s.evac.finishRound){delete s.turnEnd292;finish(now);return;}expire('OnRoundStart',u);progressHold();t.stage='select';event('OnRoundStart');return;}
    if(t.stage==='advance'){if(!s.order.some(key=>{const x=unit(key);return alive(x)&&x.mapId===s.mapId;})){delete s.turnEnd292;finish(now);return;}s.turn++;if(s.turn>=s.order.length){s.turn=0;t.stage='roundEnd';event('OnRoundEnd');return;}t.stage='select';}
    if(t.stage==='select'){if(!current()||!alive(current())||current().mapId!==s.mapId){t.stage='advance';return;}delete s.turnEnd292;delete s.remainingTurn;begin(now);}
  }
  function unitController(u){return u.playerId?u.id:s.units.find(v=>v.id===u.operatorTokenIdV129&&v.playerId)?.id;}
  function objectHolder(key){const asset=arr(map().assets).find(a=>a.id===key);if(!asset?.lootStateV118)fail('Ящик не найден');s.objects293 ||= {};const storageKey=s.mapId+':'+key;
    if(!s.objects293[storageKey]){const profile={inventory:[],equipmentSlots:{}};for(const row of arr(asset.lootStateV118.items)){const def=item(row.itemId);if(!def)continue;if(I.tracked(def)){for(let i=0;i<num(row.qty);i++){const copy=row.copiesV287?.[i]?clone(row.copiesV287[i]):Copies.create(def,row.aberrations?.[i]||null,id);if(row.copiesV287?.[i]){const rekey=c=>{c.id=id();for(const mod of arr(c.attachments))if(mod.copy)rekey(mod.copy);};rekey(copy);}delete copy.slot;Copies.append(profile,def,[copy]);}}else profile.inventory.push({itemId:row.itemId,qty:num(row.qty)});}s.objects293[storageKey]={name:asset.name||'Ящик',profile};}
    return {...s.objects293[storageKey],asset};
  }
  function lootOptions(target){return arr(target.profile.inventory).flatMap((row,index)=>{const def=item(row.itemId);if(!def||row.qty<1)return [];return I.tracked(def)?arr(row.instancesV215).map(copy=>({id:copy.id,itemId:row.itemId,name:def.name||def.id,maxQty:1,row:index,copyId:copy.id,copy:Copies.snapshot(copy)})):[{id:'stack:'+index,itemId:row.itemId,name:def.name||def.id,maxQty:row.qty,row:index}];});}
  function vision(u){return Devices.device(u)?Math.max(0,num(item(u.equipmentItemId)?.unitVisionRange,6)):num(computed(u).values.vision,6);}
  function deviceEpoch(u){return Devices.epoch(u,{battleId:s.luaContext291});}
  function deviceLink(device,operator){return Devices.device(device)&&device.operatorTokenIdV129===operator.id&&device.mapId===s.mapId&&operator.mapId===s.mapId&&active(device)&&active(operator)&&!device.destroyedV200&&!I.instance(device.profile,device.equipmentItemId,-1,'primaryWeapon')?.broken&&!device.linkJammedV129&&distance(device,operator)<=30&&clear(map(),operator,device);}
  function deployDevice(u,c){
    const def=item(c.itemId),row=arr(u.profile.inventory).find(r=>r.itemId===c.itemId),copy=arr(row?.instancesV215).find(x=>x.id===c.instanceId&&!x.slot),point={x:Number(c.x),y:Number(c.y)};
    if(!def||!['drone','turret'].includes(def.type)||!copy||copy.broken||u.conditionsV138.handsBusy||u.burst)fail('Устройство недоступно');
    if(def.type==='drone'&&s.units.filter(v=>v.operatorTokenIdV129===u.id&&v.equipmentType==='drone').length>=num(computed(u).abilities.intelligence))fail('Предел дронов равен Интеллекту');
    if(distance(u,point)>1.5||!pointOK(s,point)||!clear(map(),u,point))fail('Выберите свободную соседнюю точку');
    useAction(u);const owned=clone(copy);delete owned.slot;I.remove(row,row.instancesV215.indexOf(copy));u.profile.inventory=u.profile.inventory.filter(r=>r.qty>0);
    spawnDevice(u,def,owned,point);validateSources();log(u.name+' разместил '+def.name);
  }
  function spawnDevice(u,def,owned,point,template={}){
    const hp=Math.max(1,num(def.unitHp,10)),profile={inventory:[{itemId:def.id,qty:1,instancesV215:[{...owned,slot:'primaryWeapon'}]}],equipmentSlots:{primaryWeapon:def.id},abilityBase:{},stats:{hpMax:hp,hpCurrent:hp},baseStats:{movement:num(def.unitMoveRange),vision:num(def.unitVisionRange,6)}};
    if(owned.droneState231?.magazines?.[def.id])profile.inventory[0].instancesV215[0].magazine=clone(owned.droneState231.magazines[def.id]);
    const device={id:id(),name:def.name,armorClassOverrideV120:true,armorClass:Math.max(0,num(def.unitArmorClass,10)),equipmentType:def.type,equipmentItemId:def.id,operatorTokenIdV129:u.id,teamId:u.teamId,mapId:u.mapId,linkJammedV129:!!template.linkJammedV129,...point,profile,hpMax:hp,hpCurrent:Math.max(0,Math.min(hp,num(template.hpCurrent,num(owned.droneState231?.hpCurrent,hp)))),ownTurnV199:0,conditionsV138:{},traumaV195:{schema:195,injuryPoints:0},luaResources204:{},luaState204:{},timedModifiersV122:[],actionUsed:false,movedThisTurn:0,budget:0};s.units.push(device);return device;
  }
  function recoverDevice(device,owner){const def=item(device.equipmentItemId),copy=clone(I.instance(device.profile,def.id,-1,'primaryWeapon')),check=stats.canAdd(owner.profile,def.id,1,[copy.aberration252]);if(!check.ok)fail(check.reason);delete copy.slot;copy.droneState231={hpCurrent:device.hpCurrent,magazines:{[def.id]:clone(copy.magazine||{})}};Copies.append(owner.profile,def,[copy]);s.units=s.units.filter(v=>v.id!==device.id);log(owner.name+' забрал '+device.name);}
  function runtimeCopy(u,key){for(const row of arr(u.profile.inventory))for(const copy of arr(row.instancesV215))if(copy.id===key||copy.slot===key||row.itemId===key)return copy;return null;}
  function luaUnit(u){
    const c=computed(u),p=u.profile,inventory=arr(p.inventory).flatMap(row=>{const def=item(row.itemId)||{};return row.instancesV215?.length?row.instancesV215.map(copy=>({...copy,slot:copy.slot,itemId:row.itemId,instanceId:copy.id,type:def.type,name:def.name,tags:arr(def.tags),qty:1,ammo:num(copy.magazine?.loaded),magazineSize:num(def.magazineSize),ammoTypeId:copy.magazine?.ammoTypeId})): [{...row,type:def.type,name:def.name,tags:arr(def.tags)}];});
    const d=defense(u,s.flow?.type||'kinetic');u.droneActions=Math.max(0,num(c.values.droneActions));
    return{...u,droneActions225:Devices.remaining(u,deviceEpoch(u)),droneActionsMax225:u.droneActions,operatorId204:u.operatorTokenIdV129||'',droneShareVision225:u.equipmentType==='drone'&&!!unitController(u)&&deviceLink(u,s.units.find(v=>v.id===u.operatorTokenIdV129)||{}),profile:undefined,kind:u.playerId?'player':'npc',stats:{...c.values,...c.abilities,...d,hpCurrent:u.hpCurrent,hpMax:u.hpMax},abilities:arr(p.skills),trained:arr(p.trained||p.training),inventory,equipped:inventory.filter(row=>row.slot),items:inventory.map(r=>r.itemId),movementMode:u.movementModeV138||'ground',movementSpent:num(u.movedThisTurn),movementRemaining:Math.max(0,num(u.budget)-num(u.movedThisTurn)),conditions:u.conditionsV138,actionAvailable:active(u)&&!u.actionUsed,resources204:resources(u),modifierData204:clone(arr(u.timedModifiersV122)),modifiers:arr(u.timedModifiersV122).map(m=>m.id),reactionEligible204:active(u)&&!T.effects(u).noReaction&&!u.reactionUsedV119,reactionAvailable:reactionAvailable(u),injuryPoints:T.ensure(u).injuryPoints,injuryDegree:T.ensure(u).degree,checkPenalty:penalty(u),distances:Object.fromEntries(s.units.filter(x=>x.mapId===u.mapId).map(x=>[x.id,distance(u,x)]))};
  }
  function validateSources(){
    const supported=new Set(['OnActionDeclared','OnActionFinished','OnMoveStart','OnMoveStep','OnPositionChanged','OnRoundEnd','OnHealApplied','OnConditionChanged','OnKnockedDown','OnStandUp','OnForcedMove','OnConditionApplied','OnConditionRemoved','OnModifierChanged','OnThinkerInterval','OnThinkerDestroyed','OnUnitEnter','OnUnitLeave','OnSceneStart','OnBattleStart','OnTurnStart','OnTurnEnd','OnRoundStart','OnAttackDeclared','BeforeRoll','BeforeAttackStart','BeforeAttackRoll','AfterAttackRoll','AfterRoll','OnAttackResolved','OnHit','BeforeDamage','OnMiss','OnTakeDamage','OnShotFired','OnDamageApplied','OnMoveEnd','OnAbilityPhaseStart','OnAbilityExecuted']);
    for(const u of s.units)for(const source of sources(u))for(const match of source.luaScript.matchAll(/function\s+((?:On|Before|After)[A-Za-z0-9_]+)\s*\(/g))if(!supported.has(match[1]))fail('Тестовые вылазки ещё не поддерживают '+match[1]+' в «'+(source.name||source.id)+'»');
  }
  function sources(u){
    const list=[];for(const key of arr(u.profile.skills)){const row=s.world.skills?.SKILLS?.[key];if(row)list.push({...row,kind:'skill',ownerId:u.id});}
    for(const [slot,key] of [...Object.entries(u.profile.equipmentSlots||{}),...arr(u.profile.implantSlots).map((key,i)=>['implant:'+i,key])]){const row=item(key),copy=row&&I.instance(u.profile,key,-1,slot);if(row&&!copy?.broken)list.push({...row,kind:row.type==='implant'?'implant':'equipment',slot,ownerId:u.id,instanceId:copy?.id});}
    for(const [kind,table,key] of [['profession',s.world.socialOrigins?.SOCIAL_ORIGINS,u.profile.socialOriginId],['origin',s.world.geographicOrigins?.GEOGRAPHIC_ORIGINS,u.profile.geographicOriginId]])if(table?.[key])list.push({...table[key],kind,ownerId:u.id});
    for(const row of arr(u.profile.inventory)){const def=item(row.itemId);if(def?.activeUse&&def.luaScript&&!list.some(x=>x.id===def.id)){const copy=arr(row.instancesV215).find(c=>!c.broken&&(!c.chargesMax||c.charges>0));if(!I.tracked(def)||copy)list.push({...def,kind:'equipment',ownerId:u.id,instanceId:copy?.id,inventoryOnly:true});}}
    return list.filter(x=>x.luaEnabled!==false&&x.luaScript).map(x=>({...x,...(policy(x)||{}),luaScript:x.luaScript}));
  }
  const has=(source,hook)=>new RegExp('function\\s+'+hook+'\\s*\\(').test(source.luaScript);
  function event(hook,owners=null,params={}){
    const scope=new Set(owners?owners.map(u=>u.id):params.unit||params.attacker?[params.unit||params.attacker]:s.units.filter(u=>u.mapId===s.mapId).map(u=>u.id));s.events ||= [];s.eventCount=num(s.eventCount)+1;if(s.eventCount>256)fail('Превышен лимит цепочки Lua-событий');
    for(const u of s.units.filter(u=>u.mapId===s.mapId)){if(!alive(u))continue;const all=sources(u);if(u.id===params.attacker&&params.ammo?.luaScript&&params.ammo.luaEnabled!==false)all.push({...params.ammo,kind:'equipment',ownerId:u.id});const candidates=all.filter(x=>!x.inventoryOnly&&has(x,hook)).filter(x=>!(hook==='OnShotFired'&&x.type==='weapon'&&x.id!==params.weapon?.id)).filter(x=>!(scope.has(u.id)&&['OnAttackDeclared','BeforeAttackStart','OnHit'].includes(hook)&&x.type==='weapon'&&params.weapon?.id&&x.id!==params.weapon.id&&!scripted(x)));
      const auto=candidates.filter(x=>!['reaction','реакция'].includes(String(x.activationType||x.actionCost||'').toLowerCase())).filter(x=>scope.has(u.id)||x.eventScope204==='scene'||needsPolicy(x));
      for(const source of auto)s.events.push({source,hook,ownerId:u.id,params,sceneScope292:!scope.has(u.id)});
      const reactions=candidates.filter(x=>['reaction','реакция'].includes(String(x.activationType||x.actionCost||'').toLowerCase()));if(reactions.length&&reactionAvailable(u))s.events.push({reaction:true,options:reactions,hook,ownerId:u.id,params});
    }
  }
  function suspend(now){if(s.remainingTurn==null)s.remainingTurn=Math.max(0,s.deadline-now);}
  function resume(now){if(s.remainingTurn!=null){s.deadline=now+s.remainingTurn;delete s.remainingTurn;}}
  function makeJob(entry,now){
    entry={...entry,source:{...entry.source,...(policy(entry.source)||{}),luaScript:entry.source.luaScript}};const metadata=needsPolicy(entry.source);
    const owner=unit(entry.ownerId),params={...entry.params,attackerId:entry.params.attacker,targetId:entry.params.target,casterId:owner.id,unitId:owner.id,targetIds:entry.params.targets||[],unitId204:entry.params.unit||entry.params.attacker||owner.id,action204:entry.params.action204,event:entry.hook,attackBonus:s.flow?.state.attackBonus,defenseBonus:s.flow?.state.defenseBonus,damage:s.flow?.state.damage??entry.params.damage,geometry204:entry.params.geometry204||{},inputs:entry.params.inputs||{},targetRequests:entry.params.targetRequests||{},answers204:entry.params.answers204||{}};
    s.job={id:id(),entry,metadata292:metadata,areaCheck292:!metadata&&entry.abilityFlow292&&entry.hook==='OnAbilityExecuted'&&areaBehavior(entry.source)&&!entry.areaPrepared292,reactionBefore291:resources(owner).reaction?.value,payload:{script:entry.source.luaScript,hook:entry.hook,mode:metadata?'metadata':entry.reactionProbe292||entry.abilityFlow292&&entry.hook==='OnAbilityExecuted'&&areaBehavior(entry.source)&&!entry.areaPrepared292?'check':'execute',input:{session204:context291(owner),source:{...entry.source,behavior:behavior(entry.source),costMode204:scripted(entry.source)?'scripted':'legacy',luaScript:undefined,image:undefined,id:entry.source.id,kind:entry.source.kind,ownerId:owner.id,state204:owner.luaState204?.[entry.source.kind+':'+entry.source.id]||{}},units:s.units.filter(u=>u.mapId===s.mapId).map(u=>{const data=luaUnit(u);if(entry.abilityReserved&&u.id===owner.id)data.actionAvailable=true;return data;}),params}}};suspend(now);
  }
  function drain(now){
    if(draining)return;draining=true;try{let n=0;while(!s.job&&!s.pending&&s.phase==='running'&&n++<60){
      if(arr(s.events).length){const e=s.events.shift(),u=unit(e.ownerId);if(e.reaction){if(!reactionAvailable(u))continue;const probe=e.options.find(source=>new RegExp('function\\s+Can'+e.hook+'\\s*\\(').test(source.luaScript)&&!arr(e.checked292).includes(source.id));if(probe){makeJob({source:probe,hook:e.hook,ownerId:u.id,params:e.params,reactionProbe292:e},now);break;}if(!e.options.length)continue;if(u.playerId){s.pending={id:id(),kind:'reaction',actor:u.id,options:e.options.map(x=>({id:x.id,name:x.name})),entry:e,until:now+25000};suspend(now);break;}e.source=e.options[0];e.isReaction=true;delete e.reaction;}makeJob(e,now);break;}
      if(s.flow){step(now);continue;}if(arr(s.attacks).length){const a=s.attacks.shift();attack(unit(a.attackerId),unit(a.targetId),a.slot||'primaryWeapon',now,{free:a.consumeAction===false});continue;}if(s.move292){moveStep(now);continue;}if(s.action292){actionStep(now);continue;}if(s.turnEnd292){turnStep(now);continue;}resume(now);break;
    }
    if(n>=60&&!s.move292&&!s.turnEnd292)fail('Превышен лимит событий');}finally{draining=false;}
  }
  function cover(attacker,target){const rows=blockers(map(),attacker,target,'cover'),walls=blockers(map(),attacker,target),bonus=Math.max(0,Vision.elevationCover(map(),attacker,target),...rows.map(o=>num(o.coverArmorBonus)));return{bonus,hardness:rows.reduce((v,o)=>v+Math.max(0,num(o.coverHardness)),0),blocked:walls.some(o=>!o.coverType||o.coverType==='none'||o.coverType==='total'&&o.coverPenetrable!==true),concealment:rows.some(o=>o.coverType==='concealment')};}
  const math=CombatMath({stats,temporary:Bridge.modifiers,instances:I,types:D,item,effects:ids=>arr(ids).map(value=>{const [base,type]=value.split(':');const group=Catalog.find(g=>g.variants.some(v=>v.id===base)),v=group?.variants.find(v=>v.id===base);return v?{group:group.id,type,value:num(String(v.value).replace('−','-').split(/\s/)[0])}:null;}).filter(Boolean)});
  function defense(target,type,cv={bonus:0,hardness:0},category='light'){
    return math.defense(target,category,{armorBonus:num(cv.bonus),hardness:num(cv.hardness)},type);
  }
  function conditionEvents(u,before){for(const key of new Set([...Object.keys(before),...Object.keys(u.conditionsV138||{})]))if(!!before[key]!==!!u.conditionsV138?.[key]){const params={unit:u.id,target:u.id,condition225:key,enabled225:!!u.conditionsV138[key]};event('OnConditionChanged',[u],params);if(key==='prone')event(u.conditionsV138[key]?'OnKnockedDown':'OnStandUp',[u],params);}}
  function damage(target,amount,type='kinetic',spec={}){
    const raw=spec.parts?spec.parts.reduce((sum,p)=>sum+p.amount,0):Math.max(0,Math.floor(amount)),d=defense(target,type,spec.cover,spec.weaponCategory),source=spec.absorptionSource||'none';
    const state={damage:raw,damagePartsV138:spec.parts||[{amount:raw,absorptionSource:source,penetration:spec.penetration,ignoreAbsorption:spec.ignoreAbsorption,ignorePercent:spec.ignorePercent}],weaponPenetration287:spec.weaponPenetration};
    const reduced=math.absorb(state,d,partType=>defense(target,partType,spec.cover,spec.weaponCategory)),blocked=reduced.absorbed,armorBlocked=reduced.explosiveArmorBlocked;
    let final=reduced.applied;if(spec.defenseCritical)final=Math.floor(final/2);
    const before=target.hpCurrent,beforeConditions=clone(target.conditionsV138||{});R.applyDamage(target,final);conditionEvents(target,beforeConditions);log(target.name+': '+raw+' − '+blocked+' → '+final+' '+D.label(type)+'; HP '+before+' → '+target.hpCurrent+'; травма '+T.ensure(target).injuryPoints+'/10');
    if(reduced.explosiveHit){
      const armor=item(target.profile.equipmentSlots?.armor),copy=armor&&I.instance(target.profile,armor.id,-1,'armor');if(copy&&armorBlocked>0&&copy.durabilityMax){copy.durability=Math.max(0,copy.durability-armorBlocked);copy.broken=copy.durability===0;log('Прочность брони −'+armorBlocked+' → '+copy.durability);}
      const dc=10+final,roll=die(20)+computed(target).abilities.will-penalty(target);if(roll<=dc){target.reactionUsedV119=true;if(roll<=dc/2)target.loseNextAction093=true;}log('Ошеломление '+roll+' / СЛ '+dc);
    }
    if(target.hpCurrent<=0)release(target);event('OnDamageApplied',[target],{target:target.id,damage:final,unit:target.id,hpLoss:before-target.hpCurrent,hpLost204:Math.max(0,before-target.hpCurrent),rawDamage204:raw,absorbed204:blocked});return final;
  }
  function consume(u,row,qty){for(let n=0;n<qty;n++){const copy=arr(row.instancesV215).find(c=>!c.slot)||row.instancesV215?.[0];if(copy){if(copy.slot){if(copy.slot.startsWith('implant:'))u.profile.implantSlots[Number(copy.slot.split(':')[1])]='';else u.profile.equipmentSlots[copy.slot]='';}I.remove(row,row.instancesV215.indexOf(copy));}else row.qty--; }u.profile.inventory=u.profile.inventory.filter(row=>row.qty>0);}
  function useAction(u){if(!active(u)||u.carriedBy||u.actionUsed)fail('Действие недоступно');u.actionUsed=true;}
  function checkTurn(actor,internal=false){const u=current();if(!u||u.id!==actor||!u.playerId&&!internal)fail('Сейчас ход другого участника');if(!active(u)||u.carriedBy)fail('Персонаж не может действовать');return u;}
  function attack(u,target,slot,now,options={}){
    if(!active(u)||u.conditionsV138.handsBusy||Devices.device(u)&&!deviceLink(u,s.units.find(v=>v.id===u.operatorTokenIdV129)||{}))fail('Атака недоступна');if(!alive(target)||target.mapId!==s.mapId||target.teamId===u.teamId)fail('Недопустимая цель');
    const w=weapon(u,slot),copy=I.instance(u.profile,w.id,-1,slot);if(copy?.broken)fail('Оружие уничтожено');if(copy?.jammed)fail('Оружие заклинило: нужна перезарядка');if(!s.units.filter(p=>p.teamId===u.teamId&&p.mapId===s.mapId&&p.hpCurrent>0).some(p=>distance(p,target)<=vision(p)&&clear(map(),p,target)))fail('Цель не видна команде');
    const effects=effectRows(u,slot),bonus=group=>num(effects.find(e=>e.group===group)?.value),range=Math.max(0,num(w.range,1)+bonus('weapon-9')),cv=cover(u,target);
    if(cv.blocked)fail('Цель закрыта препятствием');cv.bonus=Math.max(0,cv.bonus-bonus('weapon-60'));
    if(w.weaponCategory==='melee'&&distance(u,target)>Math.max(1,range)+bonus('weapon-10'))fail('Цель вне досягаемости');
    const size=num(w.magazineSize)>0?Math.max(1,num(w.magazineSize)+bonus('weapon-8')):0;if(copy&&!copy.magazine)copy.magazine=clone(u.profile.weaponMagazines?.[w.id]||{loaded:w.ammoTypeId?size:0,ammoTypeId:w.ammoTypeId});const ammoId=copy?.magazine?.ammoTypeId||w.ammoTypeId,ammo=item(ammoId),type=D.effective(w,ammo);
    if(size>0){copy.magazine ||= {loaded:0,ammoTypeId};if(num(copy.magazine.loaded)<Math.max(1,num(w.ammoPerShot,1)))fail('Нужна перезарядка');copy.magazine.loaded-=Math.max(1,num(w.ammoPerShot,1));}
    const burst=options.opportunity?null:u.burst;if(burst&&burst.slot!==slot)fail('Сначала завершите очередь');if(!burst&&!options.free)useAction(u);
    const shot=burst?.shot||1,switches=num(burst?.switches)+(burst&&burst.lastTarget!==target.id?1:0);
    const a=stats.weaponAttack(u.profile,w,{kind:u.playerId?'player':'npc',inCombat:true,weaponSlot:slot,damageType:type,firstShot:shot===1,temporaryModifiers:[...Bridge.modifiers(u),...arr(ammo?.modifiers)]});
    const controller=Devices.device(u)?unit(u.operatorTokenIdV129):u;const hitBonus=(Devices.device(u)?num(computed(controller).abilities.intelligence)+num(w.hitBonus):a.bonus+bonus('weapon-1'))+(target.failureUntil>num(target.ownTurnV199)?1:0)-penalty(controller)+(target.conditionsV138.prone&&w.weaponCategory==='melee'?2:0)-(shot-1)-switches+num(u.aim),d=defense(target,type,cv,w.weaponCategory);
    const params={attacker:u.id,target:target.id,weapon:w,ammo,damageType:type,weaponSlot:slot,shotIndex:shot,shotCount:Math.max(1,num(w.rapidFireShots,1)),damage:0};
    s.flow={kind:'attack',opportunity:!!options.opportunity,priorBurst:options.opportunity?clone(u.burst||null):null,stage:0,attacker:u.id,target:target.id,slot,type,cover:cv,range,distance:distance(u,target),effects,params,shot,switches,hadHit:!!burst?.hadHit,hadCritical:!!burst?.hadCritical,state:{damage:0,attackBonus:hitBonus,defenseBonus:d.defenseBonus,damageBonus:a.damageBonus+bonus('weapon-2')+num(u.aim)}};
    delete target.failureUntil;suspend(now);event('OnAttackDeclared',[u,target],params);
  }
  function step(now){
    const f=s.flow,u=unit(f.attacker),target=unit(f.target);if(f.kind!=='attack'){delete s.flow;return;}
    if(Devices.device(u)&&!deviceLink(u,s.units.find(v=>v.id===u.operatorTokenIdV129)||{})){f.state.cancelled=true;if(f.result)f.result.hit=false;}
    if(f.stage===0){f.stage=1;event('BeforeRoll',[u,target],f.params);event('BeforeAttackStart',[u,target],f.params);event('BeforeAttackRoll',[u],f.params);return;}
    if(f.stage===1){
      const attackDice=[die(20)],defenseDice=[die(20)],w=weapon(u,f.slot),bonus=group=>num(f.effects.find(e=>e.group===group)?.value);
      if(f.distance>f.range&&w.weaponCategory!=='melee'||T.effects(Devices.device(u)?unit(u.operatorTokenIdV129):u).disadvantage||f.cover.concealment)attackDice.push(die(20));if(T.effects(target).disadvantage)defenseDice.push(die(20));
      f.state.attackBonus+=takeHelp(u,'attack');f.state.defenseBonus+=takeHelp(target,'defense')-penalty(target)+(target.conditionsV138.prone&&w.weaponCategory!=='melee'&&f.distance>3?1:0);
      f.result=R.resolveManualAttack({attackRoll:Math.min(...attackDice),defenseRoll:Math.min(...defenseDice),attackBonus:f.state.attackBonus,defenseBonus:f.state.defenseBonus,damageRoll:expression(w.damage||1),damageBonus:f.state.damageBonus,criticalRange:f.shot===1?bonus('weapon-3'):0,criticalBonus:f.hadCritical?0:bonus('weapon-4')});
      const r=f.result;if(f.state.cancelled){r.hit=false;r.rawDamage=0;f.cancelled=true;}const acopy=I.instance(target.profile,target.profile.equipmentSlots?.armor,-1,'armor');f.armorEffects=acopy&&!acopy.broken?effectRows(target,'armor'):[];const immunity=f.armorEffects.find(e=>e.group==='armor-28'&&(!e.type||e.type==='any'||(e.type==='melee')===(w.weaponCategory==='melee')));if(immunity&&!target.armorCancelUsed){target.armorCancelUsed=true;r.hit=false;r.rawDamage=0;f.cancelled=true;}f.state.damage=r.rawDamage;Object.assign(f.params,{attackRoll:r.attackDie,defenseRoll:r.defenseDie,attackTotal:r.attackTotal,defenseTotal:r.defenseTotal,attackMargin:r.attackMargin,hit:r.hit,critical:r.critical,damage:r.rawDamage});
      f.stage=2;event('AfterRoll',[u,target],f.params);event('AfterAttackRoll',[u],f.params);event('OnAttackResolved',[u,target],f.params);if(r.hit){event('OnHit',[u],f.params);event('BeforeDamage',[target],f.params);}else event('OnMiss',[u],f.params);return;
    }
    if(f.stage===2){f.stage=3;if(f.result.hit){
      let raw=f.state.damage;if(f.effects.some(e=>e.group==='weapon-13')&&!u.burst?.finisherUsed&&target.hpCurrent<=target.hpMax*.25){raw+=2;f.finisherUsed=true;}if(f.type==='energy'&&weapon(u,f.slot).weaponCategory!=='melee')raw=R.attenuateEnergyDamage(raw,f.distance,f.range);
      const pen=num(f.effects.find(e=>e.group==='weapon-59')?.value),parts=[{amount:raw,absorptionSource:'all',penetration:f.state.penetration,ignoreAbsorption:f.state.ignoreAbsorption,ignorePercent:f.state.ignorePercent}];
      for(const e of f.effects){if(e.group==='weapon-5'&&!f.hadHit)parts.push({amount:die(e.value),damageType258:'kinetic',absorptionSource:'all'});if(e.group==='weapon-56'&&f.shot===1)parts.push({amount:e.value,damageType258:e.type,absorptionSource:'all'});}
      const final=damage(target,raw,f.type,{attackerId:u.id,sourceName:weapon(u,f.slot).name,parts,cover:f.cover,absorptionSource:'all',weaponCategory:weapon(u,f.slot).weaponCategory,weaponPenetration:pen,defenseCritical:f.result.defenseCritical});
      for(const e of f.effects){
        if(e.group==='weapon-58'&&!f.hadHit)target.control={...target.control,slow:Math.max(e.value,num(target.control?.slow)),slowUntil:target.ownTurnV199+1};
        if(e.group==='weapon-57'&&!f.hadHit&&die(20)>=15)target.control={...target.control,rootUntil:target.ownTurnV199+1};
        if(e.group==='weapon-12'&&!f.hadHit){if(u.playerId)s.pending={id:id(),kind:'push',actor:u.id,target:target.id,distance:e.value,until:now+25000};else push(u,target,e.value);}
      }
      if(f.result.attackDie===20){const armor=item(target.profile.equipmentSlots?.armor),copy=armor&&I.instance(target.profile,armor.id,-1,'armor');if(copy?.durabilityMax&&!copy.broken){copy.durability=Math.max(0,copy.durability-1);copy.broken=copy.durability===0;}}
      for(const e of f.armorEffects||[]){if(e.group==='armor-25'&&weapon(u,f.slot).weaponCategory==='melee'&&target.reflectRound!==s.round){target.reflectRound=s.round;damage(u,e.value,'kinetic',{attackerId:target.id,sourceName:'Отражение брони',absorptionSource:'none'});}if(e.group==='armor-26'&&f.result.critical&&!target.armorFragilityUsed){target.armorFragilityUsed=true;const armor=item(target.profile.equipmentSlots?.armor),copy=armor&&I.instance(target.profile,armor.id,-1,'armor');if(copy?.durabilityMax){copy.durability=Math.max(0,copy.durability-e.value);copy.broken=copy.durability===0;}}}
      f.params.damage=final;event('OnTakeDamage',[target],f.params);
    }log(u.name+' → '+target.name+': '+f.result.attackTotal+' против '+f.result.defenseTotal+(f.result.hit?' попадание':' промах'));return;}
    const w=weapon(u,f.slot),copy=I.instance(u.profile,w.id,-1,f.slot);
    if(f.result.fumble&&copy?.durabilityMax){copy.durability=Math.max(0,copy.durability-1);copy.broken=copy.durability===0;}
    if(f.result.attackDie===20&&f.result.defenseDie===1&&f.effects.some(e=>e.group==='weapon-15')&&copy?.jamRound!==s.round){copy.jammed=true;copy.jamRound=s.round;}
    if(!f.result.hit&&f.effects.some(e=>e.group==='weapon-16')&&u.recoilRound!==s.round){u.recoilRound=s.round;u.control={...u.control,slow:Math.max(1,num(u.control?.slow)),slowUntil:u.ownTurnV199+1};u.budget=Math.min(u.budget,speed(u));}
    if(!f.result.hit&&f.effects.some(e=>e.group==='weapon-17')&&u.failureRound!==s.round){u.failureRound=s.round;u.failureUntil=u.ownTurnV199+1;}
    const more=!f.cancelled&&f.shot<Math.max(1,num(w.rapidFireShots,1))&&!f.result.fumble&&!copy?.broken&&!copy?.jammed&&(!w.magazineSize||num(copy?.magazine?.loaded)>=Math.max(1,num(w.ammoPerShot,1)));
    u.burst=f.opportunity?f.priorBurst:more?{slot:f.slot,shot:f.shot+1,switches:f.switches,lastTarget:target.id,hadHit:f.hadHit||f.result.hit,hadCritical:f.hadCritical||f.result.critical,finisherUsed:!!f.finisherUsed||!!u.burst?.finisherUsed}:null;
    event('OnShotFired',[u],f.params);delete s.flow;delete u.aim;progress();
  }
  function push(u,target,amount){const d=distance(u,target)||1;const to={x:target.x+(target.x-u.x)/d*amount,y:target.y+(target.y-u.y)/d*amount};if(pointOK(s,to,target.id)&&!blockers(map(),target,to,'blockMovement').length){target.x=to.x;target.y=to.y;}}
  function progress(){for(const g of s.mission.goals){if(g.type==='eliminate')s.goals[g.id]=!s.units.some(u=>u.teamId==='npcs'&&alive(u)&&u.hpCurrent>0&&(!g.mapId||u.mapId===g.mapId)&&(!g.group||u.group290===g.group));if(g.type==='reach')s.goals[g.id]=s.units.some(u=>u.playerId&&alive(u)&&u.mapId===g.mapId&&inside(s.mission.maps.find(m=>m.id===g.mapId)?.templates.find(z=>z.id===g.zoneId),u));}s.success=s.mission.goals.filter(g=>!g.optional).every(g=>s.goals[g.id]);}
  function progressHold(){for(const g of s.mission.goals.filter(g=>g.type==='hold')){const z=map().templates.find(z=>z.id===g.zoneId);if(s.mapId===g.mapId&&s.units.some(u=>u.playerId&&active(u)&&inside(z,u))&&!s.units.some(u=>!u.playerId&&active(u)&&inside(z,u))){s.hold ||= {};s.hold[g.id]=num(s.hold[g.id])+1;if(s.hold[g.id]>=g.rounds)s.goals[g.id]=true;}}progress();}
  function finish(now=Date.now()){
    if(s.phase==='finished')return;progress();const zone=s.evac&&s.mission.maps.find(m=>m.id===s.evac.mapId)?.templates.find(z=>z.id===s.evac.zoneId);s.survivors=s.units.filter(u=>u.playerId&&alive(u)&&u.mapId===s.evac?.mapId&&inside(zone,u)).map(u=>u.id);
    for(const u of s.units.filter(u=>u.playerId)){if(!s.survivors.includes(u.id)){u.dead229=true;u.hpCurrent=0;u.conditionsV138={...u.conditionsV138,dying:false,unconscious:true};}release(u);}
    const winners=s.success?s.survivors:[];const credits=Math.max(0,num(s.mission.reward.credits)),base=winners.length?credits/winners.length:0;
    for(const [index,key] of [...winners].sort().entries()){const p=unit(key).profile;p.credits=num(p.credits)+base;p.skillPoints=num(p.skillPoints)+num(s.mission.reward.skillPoints);}
    s.rewardItems=s.success?clone(s.mission.reward.items||[]):[];s.phase=s.rewardItems.length&&winners.length?'rewards':'finished';s.rewardsEligible=winners;s.rewardOrder=[...winners].sort();s.rewardTurn=0;s.deadline=now+60000;delete s.pending;delete s.job;delete s.flow;s.events=[];delete s.action292;delete s.move292;delete s.turnEnd292;log(s.success?'Задание выполнено; эвакуация завершена':'Эвакуация без награды за задание');
  }
  function move(u,to){const route=path(s,u,to);const cost=route.slice(1).reduce((sum,p,i)=>sum+distance(p,route[i]),0);if(cost>Math.max(0,u.budget-u.movedThisTurn)+1e-6)fail('Недостаточно перемещения');s.move292={actor:u.id,route,index:1,cancelled:false};event('OnMoveStart',undefined,{attacker:u.id,unit:u.id,movementKind204:'normal',oldPosition204:{x:u.x,y:u.y},newPosition204:to});}
  function positionEvents(u,before,kind='normal'){const after={x:u.x,y:u.y};areas.position(u,before,after);event('OnPositionChanged',undefined,{unit:u.id,attacker:u.id,target:u.id,movementKind204:kind,oldPosition204:before,newPosition204:after});}
  function moveStep(now){const m=s.move292,u=unit(m.actor),next=m.route[m.index],previous=m.route[m.index-1];if(m.cancelled||!next||!active(u)||Devices.device(u)&&!deviceLink(u,s.units.find(v=>v.id===u.operatorTokenIdV129)||{})||u.carriedBy||u.control?.rootUntil>=u.ownTurnV199||distance(u,previous)>.01||next&&(!pointOK(s,next,u.id)||blockers(map(),u,next,'blockMovement').length||distance(u,next)>Math.max(0,u.budget-u.movedThisTurn)+1e-6)){delete s.move292;event('OnMoveEnd',undefined,{unit:u.id,attacker:u.id,position:{x:u.x,y:u.y},movementKind204:'normal'});progress();return;}
    if(!u.disengagedV122){m.opportunityChecked293 ||= [];const enemy=s.units.find(v=>v.mapId===s.mapId&&v.teamId!==u.teamId&&distance(v,u)<=1.01&&distance(v,next)>1.01&&!m.opportunityChecked293.includes(v.id)&&opportunityOptions(v).length&&clear(map(),v,u));if(enemy){m.opportunityChecked293.push(enemy.id);const options=opportunityOptions(enemy);if(enemy.playerId){s.pending={id:id(),kind:'opportunity',actor:enemy.id,target:u.id,options,until:now+25000};suspend(now);}else opportunity(enemy,u,options[0].id,now);return;}}
    m.opportunityChecked293=[];const before={x:u.x,y:u.y};u.movedThisTurn+=distance(u,next);u.x=next.x;u.y=next.y;m.index++;if(u.carrying){const other=unit(u.carrying),old={x:other.x,y:other.y};other.x=u.x;other.y=u.y;positionEvents(other,old,'carry');}positionEvents(u,before);event('OnMoveStep',undefined,{unit:u.id,attacker:u.id,target:u.id,movementKind204:'normal',oldPosition204:before,newPosition204:{x:u.x,y:u.y}});progress();}
  const labels292={finishBurst:'Завершение очереди',deployDevice:'Размещение устройства',commandDevice:'Команда устройству',finishDevice:'Завершение команды',returnDevice:'Возврат дрона',help:'Помощь',disengage:'Отход',searchObject:'Открыть ящик',attack:'Атака',ability:'Активный навык',move:'Перемещение',dash:'Рывок',reload:'Перезарядка',grenade:'Граната',stand:'Положение',aim:'Прицеливание',search:'Обыск',carry:'Перенос союзника',release:'Перенос союзника',stabilize:'Стабилизация',unbind:'Освобождение',transition:'Переход',interact:'Взаимодействие',evacuate:'Эвакуация'};
  function validateCommand(actor,c,now,internal){const snapshot=clone(s);delete snapshot.action292;delete snapshot.move292;let serial=0;engine(snapshot,()=>.5,()=> 'preview:'+ ++serial).performCommand(actor,c,now,internal);}
  function queueAction(actor,c,now,internal=false){const source=c.type==='ability'&&sources(unit(c.deviceId||actor)).find(x=>x.id===c.sourceId);if(source&&needsPolicy(source)){makeJob({source,ownerId:c.deviceId||actor,hook:'OnAbilityExecuted',params:{},resumeCommand292:{actor,command:clone(c),internal}},now);return;}if(s.action292||s.move292||s.job||s.flow)fail('Разрешается предыдущее действие');validateCommand(actor,c,now,internal);s.eventCount=0;s.action292={actor,command:clone(c),internal,stage:0,cancelled:false};suspend(now);event('OnActionDeclared',undefined,{attacker:c.deviceId||actor,unit:c.deviceId||actor,target:c.target,action204:labels292[c.type]||c.type});drain(now);}
  function actionStep(now){const a=s.action292;if(a.stage===0){a.stage=1;if(a.cancelled){delete s.action292;return;}try{validateCommand(a.actor,a.command,now,a.internal);}catch(error){log('Действие отменено после Lua: '+error.message);delete s.action292;return;}performCommand(a.actor,a.command,now,a.internal);return;}if(a.stage===1){const device=s.units.find(v=>v.id===a.command.deviceId);if(device&&['attack','reload','ability'].includes(a.command.type)&&!device.burst&&!a.cancelled)Devices.finishOperation(device);a.stage=2;if(!a.cancelled)event('OnActionFinished',undefined,{attacker:a.command.deviceId||a.actor,unit:a.command.deviceId||a.actor,target:a.command.target,action204:labels292[a.command.type]||a.command.type});return;}delete s.action292;}
  function command(actor,c,now){if(!s.pending&&(s.action292||s.move292||s.turnEnd292))fail('Разрешается предыдущее действие');if(s.phase!=='running'||s.pending||c.type==='end')return performCommand(actor,c,now);checkTurn(actor);queueAction(actor,c,now);}

  function advanceRewards(now){if(s.rewardsEligible.every(key=>s.rewardsDone?.includes(key))){s.phase='finished';return;}do{s.rewardTurn=(s.rewardTurn+1)%s.rewardOrder.length;}while(s.rewardsDone?.includes(s.rewardOrder[s.rewardTurn]));s.deadline=now+60000;}
  function performCommand(actor,c,now,internal=false){
    if(s.phase==='rewards'){
      if(!s.rewardsEligible.includes(actor)||s.rewardOrder[s.rewardTurn]!==actor||s.rewardsDone?.includes(actor))fail('Сейчас очередь другого участника');
      if(c.type==='leaveRewards'){s.rewardsDone ||= [];s.rewardsDone.push(actor);if(s.rewardsEligible.every(key=>s.rewardsDone.includes(key)))s.phase='finished';else advanceRewards(now);return;}
      if(c.type==='passReward'){advanceRewards(now);return;}
      if(c.type!=='claimReward')fail('Выберите предмет награды');const row=s.rewardItems.find(r=>r.itemId===c.itemId&&r.qty>0);if(!row)fail('Предмет уже забрали');const u=unit(actor),check=stats.canAdd(u.profile,row.itemId,1);if(!check.ok)fail(check.reason);const i=item(row.itemId);if(I.tracked(i))Copies.append(u.profile,i,[Copies.create(i,null,id)]);else{let r=u.profile.inventory.find(r=>r.itemId===i.id);if(!r)u.profile.inventory.push(r={itemId:i.id,qty:0});r.qty++;}row.qty--;if(!s.rewardItems.some(r=>r.qty>0))s.phase='finished';else advanceRewards(now);return;
    }
    if(s.phase!=='running')fail('Вылазка завершена');
    if(s.pending){const p=s.pending;if(c.type!==(p.kind==='abilityPoint292'?'point':p.kind))fail('Ожидается другой тип ответа');if(p.actor!==actor||c.pendingId!==p.id)fail('Сейчас требуется выбор другого участника');if(now>p.until+1500)fail('Время выбора истекло');if(p.kind==='abilityPoint292'){const point={x:Number(c.x),y:Number(c.y)},owner=unit(p.command.deviceId||actor);if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>map().width||point.y>map().height||distance(owner,point)>p.radius)fail('Точка за пределами области выбора');delete s.pending;performCommand(actor,{...p.command,...point},now,p.internal);drain(now);return;}if(p.kind==='opportunity'){if(c.sourceId){if(!p.options.some(o=>o.id===c.sourceId))fail('Недоступное оружие');opportunity(unit(actor),unit(p.target),c.sourceId,now);}}else if(p.kind==='reaction'){const source=p.entry.options.find(x=>x.id===c.sourceId);if(source){makeJob({...p.entry,source,isReaction:true},now);}}else if(p.kind==='push'&&c.accept)push(unit(actor),unit(p.target),p.distance);else if(p.kind==='loot'){
        const target=p.objectId?objectHolder(p.objectId):unit(p.target),owner=unit(actor),chosen=[...new Set(arr(c.values))];if(chosen.some(key=>!p.options.some(o=>o.id===key)))fail('Предмет отсутствует в добыче');
        for(const key of chosen){const option=p.options.find(o=>o.id===key),qty=Number(c.quantities?.[key]??option.maxQty);if(!Number.isInteger(qty)||qty<1||qty>option.maxQty)fail('Неверное количество');const row=target.profile.inventory[option.row],def=item(row.itemId),copy=option.copyId&&row.instancesV215.find(x=>x.id===option.copyId);const check=stats.canAdd(owner.profile,def.id,qty,copy?[copy.aberration252]:[]);if(!check.ok)fail(check.reason);if(copy){Copies.append(owner.profile,def,[Copies.snapshot(copy)]);const index=row.instancesV215.indexOf(copy);if(copy.slot){if(copy.slot.startsWith('implant:'))target.profile.implantSlots[Number(copy.slot.split(':')[1])]='';else target.profile.equipmentSlots[copy.slot]='';}I.remove(row,index);}else{let own=owner.profile.inventory.find(r=>r.itemId===def.id);if(!own)owner.profile.inventory.push(own={itemId:def.id,qty:0});own.qty+=qty;row.qty-=qty;}}
        target.profile.inventory=target.profile.inventory.filter(r=>r.qty>0);target.searched=!target.profile.inventory.length;log(owner.name+' обыскал '+target.name);
      }else if(['choice','confirm','checklist','point'].includes(p.kind)){
        let answer=c.value;
        if(p.kind==='confirm'){if(!c.accept){if(p.job?.entry?.ability&&s.action292)s.action292.cancelled=true;delete s.pending;drain(now);return;}answer=true;}
        if(p.kind==='choice'&&!p.options.some(o=>o.id===answer))fail('Недоступный вариант');
        if(p.kind==='checklist'){answer=[...new Set(arr(c.values))];if(answer.length<p.min||answer.length>p.max||answer.some(key=>!p.options.some(o=>o.id===key)))fail('Проверьте выбранные варианты');}
        if(p.kind==='point'){answer={x:Number(c.x),y:Number(c.y)};const origin=s.units.find(u=>u.id===p.originId)||unit(actor);if(!Number.isFinite(answer.x)||!Number.isFinite(answer.y)||answer.x<0||answer.y<0||answer.x>map().width||answer.y>map().height||distance(origin,answer)>p.radius)fail('Точка за пределами области выбора');}
        s.job=p.job;s.job.payload.input.params.answers204[p.key]=answer;
      }else if(p.kind==='number'){const value=Number(c.value);if(!Number.isInteger(value)||value<p.min||value>p.max)fail('Введите число в указанных пределах');s.job=p.job;s.job.payload.input.params.inputs[p.key]=value;}else if(p.kind==='targets'){s.job=p.job;s.job.payload.input.params.targetRequests[p.key]=[...new Set(arr(c.targets))].filter(key=>p.candidates.includes(key)).slice(0,p.max);if(s.job.payload.input.params.targetRequests[p.key].length<p.min)fail('Выберите цели');}delete s.pending;drain(now);return;}
    if(s.job||s.flow)fail('Разрешается предыдущее действие');const operator=checkTurn(actor,internal);let u=operator;
    if(['finishDevice','returnDevice'].includes(c.type)&&!c.deviceId)fail('Выберите устройство');
    if(c.deviceId){c={...c,slot:'primaryWeapon'};u=unit(c.deviceId);if(!deviceLink(u,operator))fail('Нет связи с устройством');const dc=u.droneCommandV129;if(!dc||dc.epochV200!==deviceEpoch(operator)||dc.completed)fail('Нужна команда оператора');if(!['move','attack','reload','ability','finishBurst','finishDevice','returnDevice'].includes(c.type))fail('Действие устройства недоступно');if(c.type==='move'&&!Devices.movementAllowed(u,dc))fail('Перемещение устройства закрыто');if(['attack','reload','ability'].includes(c.type)&&!u.burst&&!Devices.operationAllowed(u,dc))fail('Операция устройства недоступна');}
    if(c.type==='finishBurst'){if(!u.burst)fail('Нет начатой очереди');u.burst=null;u.aim=0;u.actionUsed=true;if(Devices.device(u))Devices.finishOperation(u);return;}
    if(c.type==='finishDevice'){u.burst=null;u.droneCommandV129.completed=true;return;}
    if(c.type==='returnDevice'){if(u.equipmentType!=='drone'||distance(u,operator)>1.5)fail('Дрон должен вернуться к оператору');recoverDevice(u,operator);return;}
    if(c.type==='commandDevice'){const device=unit(c.target);if(!deviceLink(device,operator)||operator.burst)fail('Нет связи или не завершена очередь');operator.droneActions=Math.max(0,num(computed(operator).values.droneActions));Devices.issue(operator,device,c.kind,deviceEpoch(operator),s.round);device.budget=speed(device)*(c.kind==='dash'?2:1);return;}
    if(c.type==='deployDevice'){deployDevice(operator,c);return;}

    if(c.type==='end'){u.burst=null;end(now);return;}if(c.type==='release'){release(u);return;}if(c.type==='move'){if(u.burst)fail('Сначала завершите очередь');if(u.control?.rootUntil>=u.ownTurnV199)fail('Персонаж опутан');move(u,{x:Number(c.x),y:Number(c.y)});return;}
    if(c.type==='attack'){attack(u,unit(c.target),c.slot||'primaryWeapon',now);drain(now);return;}
    if(c.type==='disengage'){if(u.burst||u.disengagedV122)fail('Отход недоступен');useAction(u);u.disengagedV122=true;return;}
    if(c.type==='help'){const target=unit(c.target),type=c.checkType||'any';if(u.burst||u.helpUsed293||target.id===u.id||target.mapId!==s.mapId||!alive(target)||target.help229||!['any','attack','defense','stabilization','grenade'].includes(type))fail('Помощь недоступна');useAction(u);u.helpUsed293=true;target.help229={id:id(),source:u.name,bonus:1+num(computed(u).abilities.will),type};log(u.name+' помогает '+target.name+': +'+target.help229.bonus);return;}
    if(c.type==='carry'){const target=unit(c.target);if(!target.playerId||target.id===u.id||!alive(target)||target.mapId!==s.mapId||distance(u,target)>1.5||!clear(map(),u,target)||u.carrying||target.carriedBy||target.carrying||u.conditionsV138.handsBusy)fail('Нельзя поднять союзника');useAction(u);u.carrying=target.id;u.handsBeforeCarry=!!u.conditionsV138.handsBusy;target.carriedBy=u.id;u.conditionsV138.handsBusy=true;u.budget=Math.min(u.budget,speed(u));target.x=u.x;target.y=u.y;return;}
    if(c.type==='unbind'){useAction(u);if(u.control)delete u.control.rootUntil;return;}
    if(c.type==='dash'){if(u.dashUsed)fail('Рывок уже использован');useAction(u);u.dashUsed=true;u.budget+=speed(u);return;}if(c.type==='stand'){if(!u.conditionsV138.prone||u.budget-u.movedThisTurn<1)fail('Нельзя встать');u.conditionsV138.prone=false;u.movedThisTurn++;event('OnConditionChanged',undefined,{unit:u.id,condition225:'prone',enabled225:false});event('OnStandUp',undefined,{unit:u.id});return;}if(c.type==='aim'){useAction(u);u.aim=Math.min(3,num(u.aim)+1);return;}
    if(c.type==='stabilize'){const target=unit(c.target);if(distance(u,target)>1.5||!clear(map(),u,target)||!target.conditionsV138?.dying)fail('Нет доступного умирающего');useAction(u);const roll=checkDie(u),total=roll+computed(u).abilities.intelligence-penalty(u)+takeHelp(u,'stabilization');if(roll!==1&&total>=R.stabilizationDifficulty(target))R.stabilize(target);log('Стабилизация '+total+' / '+R.stabilizationDifficulty(target));return;}
    if(c.type==='searchObject'){
      const holder=objectHolder(c.objectId),asset=holder.asset,center={x:num(asset.x)+num(asset.w,1)/2,y:num(asset.y)+num(asset.h,1)/2};
      const nearest={x:Math.max(num(asset.x),Math.min(u.x,num(asset.x)+num(asset.w,1))),y:Math.max(num(asset.y),Math.min(u.y,num(asset.y)+num(asset.h,1)))};
      if(asset.hidden||asset.visibleToPlayers===false||u.conditionsV138.handsBusy||u.burst||distance(u,nearest)>1.5||blockers({...map(),assets:arr(map().assets).filter(a=>a.id!==asset.id)},u,center).length)fail('Ящик недоступен');useAction(u);
      s.pending={id:id(),kind:'loot',actor:unitController(u)||u.id,objectId:asset.id,options:lootOptions(holder),until:now+25000};suspend(now);return;
    }
    if(c.type==='search'){
      const target=unit(c.target);if(u.conditionsV138.handsBusy)fail('Руки заняты');if(target.mapId!==s.mapId||target.playerId&&!target.dead229||target.hpCurrent>0&&!target.dead229||distance(u,target)>1.5||!clear(map(),u,target)||target.searched)fail('Обыск недоступен');useAction(u);
      const options=arr(target.profile.inventory).flatMap((row,index)=>{const def=item(row.itemId);if(!def||row.qty<1)return[];if(I.tracked(def))return arr(row.instancesV215).map(copy=>({id:copy.id,itemId:row.itemId,name:def.name||def.id,maxQty:1,row:index,copyId:copy.id,copy:Copies.snapshot(copy)}));return[{id:'stack:'+index,itemId:row.itemId,name:def.name||def.id,maxQty:row.qty,row:index}];});
      if(!options.length){target.searched=true;return;}s.pending={id:id(),kind:'loot',actor:u.id,target:target.id,options,until:now+25000};suspend(now);return;
    }
    if(c.type==='reload'){reload(u,c);return;}
    if(c.type==='evacuate'){const zone=map().templates.find(z=>z.raidZone290==='evacuation'&&inside(z,u));if(!zone)fail('Войдите в зону эвакуации');if(!s.evac){s.evac={mapId:s.mapId,zoneId:zone.id,finishRound:s.round+4};log('Эвакуация: три полных следующих раунда');}return;}
    if(c.type==='transition'){
      if(s.evac)fail('Во время эвакуации переход закрыт');const z=map().templates.find(z=>z.id===c.zoneId&&z.raidZone290==='transition');if(!z||s.units.filter(x=>x.playerId&&alive(x)).some(x=>!inside(z,x)))fail('Вся живая команда должна собраться в переходе');
      const targetMap=s.mission.maps.find(m=>m.id===z.targetMap290),arrival=targetMap.templates.find(row=>row.id===z.targetZone290);s.mapId=targetMap.id;for(const p of s.units.filter(x=>x.playerId&&alive(x)&&!x.carriedBy)){p.mapId=s.mapId;place(p,arrival);if(p.carrying){const other=unit(p.carrying);other.mapId=s.mapId;other.x=p.x;other.y=p.y;}}reorder();s.turn=Math.max(0,s.order.indexOf(u.id));return;
    }
    if(c.type==='interact'){const g=s.mission.goals.find(g=>g.id===c.goalId&&['interact','deliver'].includes(g.type)),z=g&&map().templates.find(z=>z.id===g.zoneId);if(!g||g.mapId!==s.mapId||!inside(z,u))fail('Цель недоступна');useAction(u);if(g.type==='deliver'){const row=u.profile.inventory.find(r=>r.itemId===g.itemId&&r.qty>=num(g.qty,1));if(!row)fail('Нет нужного предмета');consume(u,row,num(g.qty,1));}s.goals[g.id]=true;progress();return;}
    if(c.type==='grenade'){
      if(u.conditionsV138.handsBusy)fail('Руки заняты');const g=item(c.itemId),row=u.profile.inventory.find(r=>r.itemId===g?.id&&r.qty>0);if(!g||g.type!=='grenade'||!row)fail('Граната недоступна');const point={x:Number(c.x),y:Number(c.y)};if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||distance(u,point)>num(g.throwRange??g.range,6)||!clear(map(),u,point))fail('Точка броска недоступна');
      useAction(u);consume(u,row,1);const check=checkDie(u),scatter=R.grenadeScatter(check,check+computed(u).abilities.dexterity-penalty(u)+takeHelp(u,'grenade'));if(scatter){const direction=(die(6)-1)*Math.PI/3;point.x+=Math.cos(direction)*scatter;point.y+=Math.sin(direction)*scatter;}
      const raw=expression(g.damage||0),type=D.effective(g),radius=Math.max(0,num(g.areaRadius??g.radius??g.aoeRadius,2));for(const other of s.units.filter(x=>x.mapId===s.mapId&&alive(x)&&distance(x,point)<=radius&&clear(map(),point,x)))damage(other,raw,type,{attackerId:u.id,origin:point,sourceName:g.name,absorptionSource:'all'});log('Граната '+g.name+'; отклонение '+scatter);progress();return;
    }
    if(c.type==='ability'){
      const source=sources(u).find(x=>x.id===c.sourceId);if(!source||!has(source,'OnAbilityExecuted')&&!has(source,'OnAbilityPhaseStart')&&!areaBehavior(source))fail('Навык недоступен');if(u.conditionsV138.handsBusy&&source.kind==='equipment')fail('Руки заняты');if(u.actionUsed&&!scripted(source))fail('Действие недоступно');const kind=behavior(source),range=Math.max(0,num(source.castRange,1));
      let target=c.target?unit(c.target):u,position={x:target.x,y:target.y},targets=[target];if(['self','aura','toggle_aura'].includes(kind)){target=u;position={x:u.x,y:u.y};targets=[u];}if(kind==='no_target'){target=null;targets=[];position={x:u.x,y:u.y};}
      if(['point','area','persistent_area'].includes(kind)){if(!Number.isFinite(c.x)||!Number.isFinite(c.y)){if(!unitController(u)){c={...c,x:position.x,y:position.y};}else{s.pending={id:id(),kind:'abilityPoint292',actor:unitController(u)||u.id,title:'Выберите точку способности',until:now+25000,radius:range,command:clone(c),internal};suspend(now);return;}}position={x:c.x,y:c.y};if(position.x<0||position.y<0||position.x>map().width||position.y>map().height||distance(u,position)>range)fail('Точка способности недоступна');if(kind!=='point')targets=s.units.filter(v=>v.mapId===s.mapId&&(source.targetAlive===false||v.hpCurrent>0&&!v.dead229)&&(v.id!==u.id||source.includeSelf===true)&&(v.playerId?source.targetPlayers!==false:v.npcId?source.targetNpcs!==false:source.targetUnits===true)&&(!source.targetRelation||source.targetRelation==='any'||(v.teamId===u.teamId)===(source.targetRelation==='ally'))&&distance(v,position)<=num(source.areaRadius??source.aoeRadius,1));else targets=[];target=targets[0]||null;}
      if(kind==='unit_target'&&(!c.target||target.mapId!==s.mapId||distance(u,target)>range||!clear(map(),u,target)||source.targetAlive!==false&&(target.hpCurrent<=0||target.dead229)||target.id===u.id&&source.includeSelf!==true||source.targetRelation==='ally'&&target.teamId!==u.teamId||source.targetRelation==='enemy'&&target.teamId===u.teamId))fail('Выберите доступную цель способности');if(target&&(target.mapId!==s.mapId||!['aura','toggle_aura','area','persistent_area'].includes(kind)&&num(source.castRange)>0&&distance(u,target)>source.castRange))fail('Цель навыка недоступна');
      makeJob({source,hook:has(source,'OnAbilityPhaseStart')?'OnAbilityPhaseStart':'OnAbilityExecuted',phase290:has(source,'OnAbilityPhaseStart')?'start':'execute',ownerId:u.id,ability:true,abilityFlow292:true,params:{caster:u.id,target:target?.id,targets:targets.map(v=>v.id),position}},now);return;
    }
    fail('Неизвестное действие');
  }
  function reload(u,c){if(u.conditionsV138.handsBusy)fail('Руки заняты');const slot=c.slot||'primaryWeapon',w=weapon(u,slot),copy=I.instance(u.profile,w.id,-1,slot),ammo=item(c.ammoId||w.ammoTypeId);if(!copy||copy.broken||!w.magazineSize||!ammo||!(ammo.id===w.ammoTypeId||String(ammo.ammoFamily||ammo.caliber||ammo.ammunitionFamily||'').toLowerCase()&&String(ammo.ammoFamily||ammo.caliber||ammo.ammunitionFamily||'').toLowerCase()===String(w.ammoFamily||w.caliber||w.ammunitionFamily||'').toLowerCase())||num(copy.magazine?.loaded)>0&&copy.magazine?.ammoTypeId!==ammo.id)fail('Нельзя перезарядить');const row=u.profile.inventory.find(r=>r.itemId===ammo.id);const loaded=num(copy.magazine?.loaded),take=Math.min(Math.max(1,num(w.magazineSize)+num(effectRows(u,slot).find(e=>e.group==='weapon-8')?.value))-loaded,num(row?.qty));if(take<=0&&!copy.jammed)fail('Нет патронов или магазин полон');useAction(u);if(row)row.qty-=Math.max(0,take);copy.magazine={loaded:loaded+take,ammoTypeId:ammo.id};copy.jammed=false;return;}
  function npcDeviceStep(operator,now){
    const devices=s.units.filter(d=>d.operatorTokenIdV129===operator.id&&deviceLink(d,operator));operator.droneActions=Math.max(0,num(computed(operator).values.droneActions));
    for(const d of devices){const w=weapon(d),target=s.units.filter(v=>v.teamId!==operator.teamId&&v.mapId===s.mapId&&active(v)&&distance(d,v)<=vision(d)&&!cover(d,v).blocked&&(w.weaponCategory!=='melee'||distance(d,v)<=num(w.range,1))).sort((a,b)=>distance(d,a)-distance(d,b))[0];if(!target)continue;
      const command=d.droneCommandV129;if(!command||command.epochV200!==deviceEpoch(operator)){if(Devices.reason(operator,d,'complex',deviceEpoch(operator)))continue;queueAction(operator.id,{type:'commandDevice',target:d.id,kind:'complex'},now,true);return true;}
      if(command.completed||command.moduleUsed)continue;try{queueAction(operator.id,{type:'attack',deviceId:d.id,target:target.id},now,true);return true;}catch{command.completed=true;}
    }return false;
  }
  function tick(now){
    if(s.phase==='rewards'){if(now>=s.deadline)advanceRewards(now);return;}
    if(s.phase!=='running')return;
    if(s.pending&&now>=s.pending.until+1500){const p=s.pending;if(['targets','number','choice','confirm','checklist','point','loot','abilityPoint292'].includes(p.kind)){if((p.job?.entry?.ability||p.kind==='abilityPoint292')&&s.action292)s.action292.cancelled=true;delete s.job;}delete s.pending;drain(now);}
    if(s.job||s.pending)return;drain(now);if(s.job||s.pending||s.move292||s.action292||s.turnEnd292)return;
    if(!s.units.some(u=>u.playerId&&alive(u))){finish(now);return;}
    const u=current();if(!u){finish(now);return;}
    if(!active(u)||u.carriedBy||now>=s.deadline){end(now);return;}
    if(!u.playerId){
      if(npcDeviceStep(u,now))return;
      if(u.actionUsed&&!u.burst){end(now);return;}
      const enemies=s.units.filter(x=>x.playerId&&alive(x)&&x.mapId===s.mapId&&distance(u,x)<=num(computed(u).values.vision,6)&&clear(map(),u,x)).sort((a,b)=>distance(u,a)-distance(u,b));const target=enemies[0];if(!target){end(now);return;}
      let slot=u.burst?.slot||'primaryWeapon';
      const usable=key=>{const w=weapon(u,key),copy=I.instance(u.profile,w.id,-1,key);return !copy?.broken&&!copy?.jammed&&(!num(w.magazineSize)||num(copy?.magazine?.loaded,w.ammoTypeId?num(w.magazineSize):0)>=Math.max(1,num(w.ammoPerShot,1)));};
      if(!usable(slot)){
        if(!u.actionUsed){const w=weapon(u,slot),copy=I.instance(u.profile,w.id,-1,slot),ammoId=copy?.magazine?.ammoTypeId||w.ammoTypeId;if(copy&&!copy.broken&&(copy.jammed||u.profile.inventory.some(r=>r.itemId===ammoId&&r.qty>0))){queueAction(u.id,{type:'reload',slot,ammoId},now,true);u.burst=null;return;}}
        u.burst=null;if(u.actionUsed){end(now);return;}slot=usable('secondaryWeapon')&&u.profile.equipmentSlots?.secondaryWeapon?'secondaryWeapon':'unarmed';
      }
      const tactic=u.tactic290||'shooter',w=weapon(u,slot),range=num(w.range,1);if(tactic==='support'){const ally=s.units.filter(x=>x.teamId===u.teamId&&x.mapId===s.mapId&&active(x)&&x.hpCurrent<x.hpMax).sort((a,b)=>a.hpCurrent/a.hpMax-b.hpCurrent/b.hpMax)[0],source=sources(u).find(x=>has(x,'OnAbilityExecuted'));if(ally&&source){if(u.actionUsed&&!scripted(source))fail('Действие недоступно');queueAction(u.id,{type:'ability',sourceId:source.id,target:ally.id},now,true);return;}}const canAttack=!cover(u,target).blocked&&(w.weaponCategory!=='melee'||distance(u,target)<=range);
      if(tactic==='shooter'&&!u.aiMoved&&u.budget>u.movedThisTurn){const old=cover(u,target).bonus;let best=null;for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){const p={x:u.x+x,y:u.y+y},cv=cover(p,target);if(cv.bonus>old&&!cv.blocked&&pointOK(s,p,u.id)&&distance(p,u)<=u.budget-u.movedThisTurn&&(!best||cv.bonus>best.cover))best={...p,cover:cv.bonus};}if(best){try{queueAction(u.id,{type:'move',x:best.x,y:best.y},now,true);u.aiMoved=true;return;}catch{}}}if(canAttack){queueAction(u.id,{type:'attack',target:target.id,slot},now,true);return;}
      if(tactic!=='hold'&&!u.aiMoved&&u.budget>u.movedThisTurn){let best=null;for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){const p={x:u.x+x,y:u.y+y};if(!pointOK(s,p,u.id)||distance(p,u)>u.budget-u.movedThisTurn)continue;const score=distance(p,target)+(tactic==='shooter'?cover(p,target).bonus*-2:0);if(!best||score<best.score)best={...p,score};}if(best){try{queueAction(u.id,{type:'move',x:best.x,y:best.y},now,true);u.aiMoved=true;return;}catch{}}}u.actionUsed=true;
    }
  }
  function jobResult(jobId,result,now){
    if(!s.job||s.job.id!==jobId)return false;if(!result?.ok) {s.error=result?.message||'Ошибка Lua';return false;}
    const j=s.job,commands=arr(result.result?.commands);const queries=commands.filter(c=>c.kind==='query_geometry204'&&j.payload.input.params.geometry204?.[c.key]===undefined);if(queries.length){j.geometryPasses292=num(j.geometryPasses292)+1;if(j.geometryPasses292>32)fail('Превышен лимит пространственных запросов Lua');j.payload.input.params.geometry204 ||= {};for(const q of queries)j.payload.input.params.geometry204[q.key]=geometryQuery(q,j.entry.ownerId);delete j.lease;return true;}
    if(j.metadata292){const m=result.result?.metadata||{};s.policies292 ||= {};s.policies292[policyKey(j.entry.source)]={script:j.entry.source.luaScript,costMode204:String(m.GetCostMode||'').toLowerCase()==='scripted'?'scripted':'legacy',eventScope204:String(m.GetEventScope||'').toLowerCase()==='scene'?'scene':'owner',behavior292:m.GetBehavior,castRange:m.GetCastRange??j.entry.source.castRange,areaRadius:m.GetAOERadius??j.entry.source.areaRadius,thinkerDuration:m.GetThinkerDuration??j.entry.source.thinkerDuration,thinkerInterval:m.GetThinkerInterval??j.entry.source.thinkerInterval};delete s.job;if(j.entry.resumeCommand292){const a=j.entry.resumeCommand292;queueAction(a.actor,a.command,now,a.internal);}else if(!j.entry.sceneScope292||s.policies292[policyKey(j.entry.source)].eventScope204==='scene')makeJob(j.entry,now);else drain(now);return true;}    if(j.entry.reactionProbe292){const e=j.entry.reactionProbe292;if(result.result?.eligible)(e.checked292 ||= []).push(j.entry.source.id);else e.options=e.options.filter(source=>source.id!==j.entry.source.id);delete s.job;s.events.unshift(e);drain(now);return true;}
    if(!result.result?.eligible&&!(j.areaCheck292&&!result.result?.hasHook)){if(j.entry.ability&&s.action292)s.action292.cancelled=true;delete s.job;drain(now);return true;}
    if(j.areaCheck292){const source=j.entry.source,u=unit(j.entry.ownerId),logical='ability:'+source.id;const existing=s.thinkers292.find(t=>t.logicalId===logical&&t.casterId===u.id);if(j.entry.ability&&!scripted(source))useAction(u);let thinker=null,toggled=true;if(behavior(source)==='toggle_aura'&&existing){areas.command({kind:'destroy_thinker',thinkerId:logical,casterId:u.id},j.entry);toggled=false;}else{if(behavior(source)!=='persistent_area')areas.command({kind:'destroy_thinker',thinkerId:logical,casterId:u.id},j.entry);thinker=areas.create({thinkerId:behavior(source)==='persistent_area'?logical+':'+id():logical,name:source.name,casterId:u.id,followUnitId:['aura','toggle_aura'].includes(behavior(source))?u.id:'',x:j.entry.params.position?.x??u.x,y:j.entry.params.position?.y??u.y,radius:num(source.areaRadius??source.aoeRadius,1),durationRounds:behavior(source)==='toggle_aura'?0:num(source.thinkerDuration??source.durationRounds,1),intervalRounds:num(source.thinkerInterval??source.intervalRounds,1),relation:source.targetRelation||'any',players:source.targetPlayers!==false,npcs:source.targetNpcs!==false,units:source.targetUnits===true,alive:source.targetAlive!==false,includeSelf:source.includeSelf===true,visibleToPlayers:source.thinkerVisibleToPlayers!==false,color:source.thinkerColor||source.color},j.entry);}delete s.job;if(has(source,'OnAbilityExecuted'))makeJob({...j.entry,ability:false,abilityReserved:!scripted(source),areaPrepared292:true,params:{...j.entry.params,toggled,thinker:thinker?areas.params(thinker).thinker:null}},now);else drain(now);return true;}
    const decision=commands.find(c=>/^request_(choice|confirm|checklist|point)204$/.test(c.kind)&&j.payload.input.params.answers204[c.key]===undefined);
    if(decision){const owner=unit(j.entry.ownerId),kind=decision.kind.replace('request_','').replace('204',''),options=arr(decision.options).map(o=>typeof o==='string'?{id:o,name:o}:{id:String(o.id??o.value),name:String(o.label??o.text??o.name??o.id??o.value)});if(!owner.playerId&&!unitController(owner)){j.payload.input.params.answers204[decision.key]=kind==='confirm'?true:kind==='point'?{x:owner.x,y:owner.y}:kind==='checklist'?options.slice(0,num(decision.min,1)).map(o=>o.id):options[0]?.id||'';delete j.lease;return true;}s.pending={id:id(),kind,actor:unitController(owner)||owner.id,key:decision.key,options,min:num(decision.min,0),max:num(decision.max,options.length),radius:num(decision.radius,Infinity),originId:decision.origin||owner.id,title:String(decision.title||decision.text||'Выбор'),until:now+25000,job:j};delete s.job;return true;}
    const requested=commands.find(c=>c.kind==='request_number'&&j.payload.input.params.inputs[c.name]==null||c.kind==='request_targets'&&!j.payload.input.params.targetRequests[c.key]);
    if(requested){
      if(requested.kind==='request_number'){
        if(!requested.rollType){s.pending={id:id(),kind:'number',actor:unitController(unit(j.entry.ownerId))||j.entry.ownerId,key:requested.name,min:num(requested.min,0),max:num(requested.max,100000),until:now+25000,job:j};delete s.job;return true;}
        const lo=Number.isFinite(requested.min)?requested.min:1,hi=Number.isFinite(requested.max)?requested.max:20;if(!Number.isInteger(lo)||!Number.isInteger(hi)||lo>hi||hi-lo>100000)fail('Неверные границы Lua-броска');const roller=s.units.find(u=>u.id===requested.unitId)||unit(j.entry.ownerId),help=requested.rollType==='damage'?0:takeHelp(roller,requested.rollType);j.payload.input.params.inputs[requested.name]=lo+die(hi-lo+1)-1+help;delete j.lease;return true;
      }
      const owner=unit(j.entry.ownerId),origin=s.units.find(u=>u.id===requested.originId)||owner,candidates=s.units.filter(u=>u.mapId===s.mapId&&(!requested.alive||u.hpCurrent>0)&&(!u.playerId||requested.players)&&(!u.npcId||requested.npcs)&&(requested.includeSelf||u.id!==origin.id)&&(requested.relation==='any'||(u.teamId===origin.teamId)===(requested.relation==='ally'))&&distance(u,origin)<=num(requested.radius,Infinity)&&clear(map(),origin,u)).map(u=>u.id);if(!owner.playerId&&!unitController(owner)){j.payload.input.params.targetRequests[requested.key]=candidates.slice(0,requested.max);delete j.lease;return true;}s.pending={id:id(),kind:'targets',actor:unitController(owner)||owner.id,key:requested.key,candidates,min:num(requested.min,1),max:num(requested.max,1),until:now+25000,job:j};delete s.job;return true;
    }
    if(j.entry.ability&&!scripted(j.entry.source))useAction(unit(j.entry.ownerId));
    const unsupported=commands.find(c=>!['query_geometry204','create_thinker','destroy_thinker','thinker_data204','set_thinker_vision','reload','set_movement_mode','show_area','move_between','log','sound','particle','request_number','request_targets','damage','heal','heal_injury','heal_injury_points','add_injury_points','set_injury_points','set_condition','set_position','move_to','reduce_damage','add_damage','set_damage','add_attack_bonus','add_defense_bonus','set_armor_penetration','ignore_absorption','add_modifier','apply_modifier','remove_modifier','standard_attack','restore_action','restore_reaction','break_item','damage_item','repair_item','spend_charges','spend_action','spend_reaction','spend_movement','restore_movement','source_data204','define_resource204','spend_resource204','restore_resource204','cancel_event204','reaction_debt204','add_credits','request_choice204','request_confirm204','request_checklist204','request_point204'].includes(c.kind));
    if(unsupported){s.error='Lua-команда пока не поддерживается вылазками: '+unsupported.kind;return false;}
    for(const c of commands){
      areas.command(c,j.entry);
      const target=s.units.find(u=>u.id===(c.targetId||c.unitId));
      if(c.kind==='define_resource204'&&target)Lua.define(target.luaResources204,c.key,c,context291(target));
      if(c.kind==='spend_resource204'&&target)Lua.spend(target.luaResources204,c.key,c.amount,context291(target));
      if(c.kind==='restore_resource204'&&target)Lua.restore(target.luaResources204,c.key,c.amount,context291(target));
      if(c.kind==='add_credits'&&target){const credits=num(target.profile.credits)+c.amount;if(!Number.isSafeInteger(credits)||credits<0)fail('Недопустимое изменение денег');target.profile.credits=credits;}
      if(c.kind==='reaction_debt204'&&target)target.reactionDebt204=num(target.reactionDebt204)+num(c.amount,1);
      if(c.kind==='cancel_event204'&&['OnMoveStart','OnActionDeclared'].includes(j.entry.hook)){if(s.action292)s.action292.cancelled=true;if(s.move292)s.move292.cancelled=true;}
      if(c.kind==='cancel_event204'&&s.flow&&!['OnMoveStart','OnActionDeclared'].includes(j.entry.hook)){s.flow.state.cancelled=true;s.flow.state.damage=0;if(s.flow.result)s.flow.result.hit=false;if(s.flow.params)s.flow.params.hit=false;log(c.reason);}
      if(c.kind==='log')log(c.text);
      if(c.kind==='damage'&&target)damage(target,c.amount,c.damageType||'kinetic',c);
      if(c.kind==='heal'&&target){const before=target.hpCurrent,conditions=clone(target.conditionsV138||{});R.applyHeal(target,c.amount);conditionEvents(target,conditions);event('OnHealApplied',undefined,{unit:target.id,target:target.id,attacker:c.casterId,damage:target.hpCurrent-before});}
      if(c.kind==='heal_injury'&&target)T.treat(target,c.amount);
      if(c.kind==='heal_injury_points'&&target)T.healPoints(target,c.amount);
      if(c.kind==='add_injury_points'&&target)T.setPoints(target,T.ensure(target).injuryPoints+c.amount);
      if(c.kind==='set_injury_points'&&target)T.setPoints(target,c.amount);
      if(c.kind==='set_condition'&&['panic','shaken'].includes(c.name))continue;
      if(c.kind==='set_condition'&&target){const before=!!target.conditionsV138[c.name];target.conditionsV138[c.name]=c.enabled;if(before!==!!c.enabled){event('OnConditionChanged',undefined,{unit:target.id,target:target.id,condition225:c.name,enabled225:!!c.enabled});if(c.name==='prone')event(c.enabled?'OnKnockedDown':'OnStandUp',undefined,{unit:target.id,target:target.id});}if(before!==!!c.enabled)event(c.enabled?'OnConditionApplied':'OnConditionRemoved',undefined,{unit:target.id,target:target.id,condition225:c.name,enabled225:!!c.enabled});if(c.name==='prone')target.proneV122=c.enabled;}
      if(['set_position','move_to'].includes(c.kind)&&target){const p=c.position||{x:c.x,y:c.y};if(!pointOK(s,p,target.id))fail('Lua перемещает в недоступную точку');if(target.carriedBy)release(unit(target.carriedBy));const before={x:target.x,y:target.y};target.x=p.x;target.y=p.y;positionEvents(target,before,c.movementKind204||'placement');event('OnForcedMove',undefined,{unit:target.id,target:target.id,oldPosition204:before,newPosition204:{x:target.x,y:target.y}});if(target.carrying){const other=unit(target.carrying);other.x=p.x;other.y=p.y;}}
      if(c.kind==='reduce_damage'&&s.flow)s.flow.state.damage=Math.max(0,s.flow.state.damage-num(c.amount));
      if(c.kind==='add_attack_bonus'&&s.flow)s.flow.state.attackBonus+=num(c.amount);
      if(c.kind==='add_defense_bonus'&&s.flow)s.flow.state.defenseBonus+=num(c.amount);
      if(c.kind==='set_armor_penetration'&&s.flow)s.flow.state.penetration=num(c.amount);
      if(c.kind==='ignore_absorption'&&s.flow){s.flow.state.ignoreAbsorption=num(c.amount);s.flow.state.ignorePercent=num(c.percent);}
      if(c.kind==='add_damage'&&s.flow)s.flow.state.damage+=num(c.amount);
      if(c.kind==='set_damage'&&s.flow)s.flow.state.damage=Math.max(0,num(c.amount));
      if(c.kind==='apply_modifier'&&target){const key=String(c.modifierId||id()),row={id:key,name:c.name||key,sourceId:c.sourceId,stacks204:c.stacks204,data204:Lua.data(c.data204||{}),duration204:c.duration204?Lua.duration(c.duration204,context291(target)):null,remainingTurns:Math.max(1,num(c.duration,1)),effects:clone(arr(c.effects)),onTurnStartDamage:num(c.onTurnStartDamage),onTurnStartHeal:num(c.onTurnStartHeal)};target.timedModifiersV122=arr(target.timedModifiersV122).filter(m=>m.id!==key);target.timedModifiersV122.push(row);syncMaximum(target);event('OnModifierChanged',undefined,{unit:target.id,target:target.id,reason204:'applied:'+key});}
      if(c.kind==='standard_attack'&&Devices.device(unit(c.attackerId))&&!deviceLink(unit(c.attackerId),s.units.find(v=>v.id===unit(c.attackerId).operatorTokenIdV129)||{}))fail('Нет связи с устройством');
      if(c.kind==='standard_attack'){s.attacks ||= [];if(s.attacks.length>8)fail('Слишком много вложенных атак');s.attacks.push(c);}
      if(c.kind==='restore_action'&&target)target.actionUsed=false;if(c.kind==='restore_reaction'&&target){target.reactionUsedV119=false;if(resources(target).reaction)Lua.restore(target.luaResources204,'reaction',null,context291(target));}
      if(c.kind==='break_item'&&target){const w=item(target.profile.equipmentSlots?.[c.slot]),copy=w&&I.instance(target.profile,w.id,-1,c.slot);if(copy){copy.durability=0;copy.broken=true;}}
      if(c.kind==='add_modifier'&&target){const m=c.modifier||{};target.timedModifiersV122.push({id:m.id||id(),name:m.name,remainingTurns:Math.max(1,num(m.duration,1)),effects:[{property:m.target||m.property,operation:m.op||m.operation||'add',value:m.value}]});syncMaximum(target);}
      if(c.kind==='remove_modifier'&&target){target.timedModifiersV122=arr(target.timedModifiersV122).filter(x=>x.id!==c.modifierId);syncMaximum(target);event('OnModifierChanged',undefined,{unit:target.id,target:target.id,reason204:'removed:'+c.modifierId});}
      if(c.kind==='spend_action'&&target)target.actionUsed=true;if(c.kind==='spend_reaction'&&target)spendReaction(target);
      if(c.kind==='spend_movement'&&target)target.movedThisTurn+=num(c.amount);if(c.kind==='restore_movement'&&target)target.movedThisTurn=c.all?0:Math.max(0,target.movedThisTurn-num(c.amount));
      if(c.kind==='reload'&&target)reload(target,c);
      if(c.kind==='set_movement_mode'&&target){if(!['ground','flight','swim','climb'].includes(c.mode))fail('Неизвестный режим перемещения');target.movementModeV138=c.mode;}
      if(c.kind==='move_between'){const owner=unit(c.casterId),a=unit(c.attackerId),b=unit(c.targetId),length=distance(a,b)||1,p={x:b.x+(a.x-b.x)/length*Math.max(.8,num(c.distance,1)),y:b.y+(a.y-b.y)/length*Math.max(.8,num(c.distance,1))};if(!pointOK(s,p,owner.id))fail('MoveBetween: точка недоступна');const before={x:owner.x,y:owner.y};owner.x=p.x;owner.y=p.y;positionEvents(owner,before,'placement');}
      if(c.kind==='spend_charges'&&target){const copy=runtimeCopy(target,c.slot===j.entry.source.id?j.entry.source.instanceId||c.slot:c.slot);if(!copy||copy.charges<num(c.amount))fail('Недостаточно зарядов');copy.charges-=num(c.amount);}
      if(c.kind==='damage_item'&&target){const slot=c.slot||c.itemSlot||'armor',copy=runtimeCopy(target,slot);if(copy?.durabilityMax){copy.durability=Math.max(0,copy.durability-num(c.amount));copy.broken=copy.durability===0;}}
      if(c.kind==='repair_item'&&target){const slot=c.slot||'armor',copy=runtimeCopy(target,slot);if(copy&&!copy.broken)copy.durability=Math.min(copy.durabilityMax,copy.durability+num(c.amount));}
      if(c.kind==='source_data204'){const u=target||unit(j.entry.ownerId),key=Lua.key(c.source||j.entry.source.kind+':'+j.entry.source.id),field=Lua.key(c.key);u.luaState204[key] ||= {};if(c.value==null)delete u.luaState204[key][field];else u.luaState204[key][field]=Lua.data(c.value);}
    }
    if(j.entry.isReaction&&!scripted(j.entry.source)){const u=unit(j.entry.ownerId),pool=resources(u).reaction;const explicit=commands.some(c=>(c.kind==='spend_reaction'||c.kind==='spend_resource204'&&c.key==='reaction')&&(c.unitId||c.targetId)===u.id);if(pool?(j.reactionBefore291==null?!explicit:pool.value===j.reactionBefore291):!u.reactionUsedV119)spendReaction(u);}
    delete s.job;delete s.error;if(j.entry.phase290==='start'&&(has(j.entry.source,'OnAbilityExecuted')||areaBehavior(j.entry.source))){makeJob({...j.entry,hook:'OnAbilityExecuted',phase290:'execute',ability:false,abilityReserved:!scripted(j.entry.source),params:{...j.payload.input.params,attacker:j.payload.input.params.attackerId,target:j.payload.input.params.targetId,targets:j.payload.input.params.targetIds}},now);}else drain(now);return true;
  }
  function geometryQuery(q,ownerId){const owner=unit(ownerId);if(q.query==='area'){const g=Lua.geometry(q.area||{});return s.units.filter(u=>u.mapId===owner.mapId&&Lua.contains(g,u)).map(u=>u.id);}const a=q.a,b=q.b;if(!a||!b)return false;if(q.query==='distance')return distance(a,b);if(['sight','fire'].includes(q.query))return q.query==='sight'?clear(map(),a,b):!cover(a,b).blocked;if(q.query==='visible')return clear(map(),a,b)&&distance(a,b)<=num(computed(s.units.find(u=>u.id===a.id)||owner).values.vision,6);if(q.query==='reachable'){try{const u=s.units.find(u=>u.id===a.id)||owner,route=path(s,u,b);return route.slice(1).reduce((n,p,i)=>n+distance(p,route[i]),0)<=Math.max(0,u.budget-u.movedThisTurn);}catch{return false;}}if(q.query==='attack'){const u=s.units.find(u=>u.id===a.id)||owner,w=weapon(u);return active(u)&&!u.conditionsV138.handsBusy&&!cover(a,b).blocked&&clear(map(),a,b)&&(w.weaponCategory!=='melee'||distance(a,b)<=num(w.range,1));}return false;}
  areas=AreaRuntime(s,{Lua,Bridge,id,unit,context:context291,emit(source,hook,params,ownerId){s.eventCount=num(s.eventCount)+1;if(s.eventCount>256)fail('Превышен лимит цепочки областей Lua');if(has(source,hook))(s.events ||= []).push({source:clone(source),hook,params,ownerId});}});
  function profiles(){const out={};for(const u of s.units.filter(u=>u.playerId)){const p=clone(u.profile);p.weaponMagazines ||= {};for(const slot of ['primaryWeapon','secondaryWeapon']){const w=weapon(u,slot),copy=I.instance(u.profile,w.id,-1,slot);if(copy?.magazine)p.weaponMagazines[w.id]=clone(copy.magazine);}p.stats={...p.stats,hpCurrent:u.hpCurrent,hpMax:u.hpMax};p.traumaV195=clone(T.ensure(u));p.dead229=!!u.dead229;p.combatState093={...p.combatState093,schema:1,dead:!!u.dead229,ownTurn:u.ownTurnV199,conditions:clone(u.conditionsV138),dying:!!u.conditionsV138.dying,stabilized:!!u.conditionsV138.stabilized,unconscious:!!u.conditionsV138.unconscious,lua204:Bridge.captureLua(u),critical:clone(u.critical229||null),loseNextAction:!!u.loseNextAction093,control:clone(u.control||null)};if(s.phase==='running'||s.phase==='rewards'&&s.rewardsEligible.includes(u.id)&&!s.rewardsDone?.includes(u.id))p.raidLock290=s.id;else delete p.raidLock290;out[u.id]=p;}return out;}
  return{item,stats,map,unit,current,die,computed,weapon,expression,place,reorder,begin,end,command,performCommand,tick,drain,event,damage,jobResult,profiles,aberrate,log,speed,vision,spawnDevice,deviceLink,sources,validateSources,syncMaximum,resources,areas};
}
function view(s,actor,now){
  const e=engine(s,()=>0,()=>''),mine=s.units.find(u=>u.id===actor),map=e.map(),party=s.units.filter(u=>u.playerId&&u.mapId===s.mapId&&!u.dead229&&u.hpCurrent>0&&!u.conditionsV138.unconscious);
  for(const d of s.units.filter(u=>u.mapId===s.mapId&&u.equipmentType==='drone')){const owner=s.units.find(u=>u.id===d.operatorTokenIdV129);if(owner?.playerId&&e.deviceLink(d,owner))party.push(d);}
  const visible=u=>u.mapId===s.mapId&&(u.playerId||party.some(p=>distance(u,p)<=e.vision(p)&&clear(map,p,u)));
  const units=s.units.filter(u=>visible(u)||u.operatorTokenIdV129===actor&&u.mapId===s.mapId).map(u=>({id:u.id,name:u.name,playerId:u.playerId,operatorId:u.operatorTokenIdV129,equipmentType:u.equipmentType,deviceCommand:u.droneCommandV129,x:u.x,y:u.y,hpCurrent:u.hpCurrent,hpMax:u.hpMax,dead229:u.dead229,conditions:u.conditionsV138,help:u.help229,helpUsed:u.helpUsed293,disengaged:u.disengagedV122,carrying:u.carrying,carriedBy:u.carriedBy,searched:u.searched,actionUsed:u.actionUsed,burst:(u.playerId===actor||u.operatorTokenIdV129===actor)?clone(u.burst||null):undefined,weapons:u.operatorTokenIdV129===actor?[{slot:'primaryWeapon',...e.weapon(u,'primaryWeapon')}]:undefined,reactionUsed:u.reactionUsedV119,moveRemaining:Math.max(0,num(u.budget)-num(u.movedThisTurn)),injury:T.ensure(u).injuryPoints}));
  const pending=s.pending?.actor===actor?{id:s.pending.id,kind:s.pending.kind,options:s.pending.options,candidates:s.pending.candidates,max:s.pending.max,min:s.pending.min,title:s.pending.title,until:s.pending.until}:s.pending?{kind:'waiting',until:s.pending.until}:null;
  return {id:s.id,week:s.week,revision:s.revision,phase:s.phase,resolving:!!(s.job||s.action292||s.move292||s.turnEnd292),mission:{id:s.mission.id,name:s.mission.name,reward:s.mission.reward,goals:s.mission.goals},areas:e.areas.view(s.mapId),map:{id:map.id,name:map.name,width:map.width,height:map.height,backgroundImage:map.backgroundImage,assets:arr(map.assets).filter(a=>a.visibleToPlayers!==false&&!a.hidden).map(a=>({...a,lootStateV118:a.lootStateV118?{}:undefined})),templates:arr(map.templates).filter(z=>z.visibleToPlayers!==false||z.raidZone290)},units,me:mine?{profile:mine.profile,weapons:['primaryWeapon','secondaryWeapon'].map(slot=>({slot,...e.weapon(mine,slot)})),abilities:e.sources(mine).filter(x=>(/function\s+(?:OnAbilityExecuted|OnAbilityPhaseStart|GetBehavior)\s*\(/.test(x.luaScript)||['aura','toggle_aura','persistent_area'].includes(x.abilityBehavior||x.behavior))&&x.activationType!=='reaction').map(x=>({id:x.id,name:x.name}))}:null,pending,turnActor:s.phase==='rewards'?s.rewardOrder[s.rewardTurn]:s.order[s.turn],round:s.round,deadline:s.deadline,remainingTurn:s.remainingTurn,evac:s.evac,goals:s.goals,success:s.success,rewardItems:s.rewardItems,log:s.log.slice(-70),error:s.error,serverNow:now};
}
module.exports={week,validate,create,engine,view,inside,blockers,path};
