/* Server-owned raid state machine. Every mutation is committed with its random results. */
'use strict';
const root=typeof __hooks==='undefined'?'../pocketbase/pb_hooks/':__hooks+'/';
const T=require(root+'combat-trauma-v195.js');
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
    for(const t of arr(m.tokens)){if(t.playerId)fail('Экспортируйте карты без игроков');if(!t.npcId)fail('В тестовых вылазках противники должны быть экземплярами НПС');if(t.npcId&&!world.npcs?.NPCS?.[t.npcId])fail('Не найден шаблон НПС '+t.npcId);}
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
  validate(mission,world);const s={schema:290,phase:'running',revision:0,mission:clone(mission),world:clone(world),mapId:mission.startMapId||mission.maps[0].id,members:members.map(p=>p.id),units:[],order:[],turn:0,round:1,deadline:now+60000,receipts:[],log:[],goals:{},createdAt:now};
  const api=engine(s,random,id);const map=api.map(),spawn=map.templates.find(z=>z.raidZone290==='spawn');
  for(const p of members){
    const profile=api.stats.normalizePlayer(p);I.normalize(profile,api.item,id);
    const u={id:p.id,playerId:p.id,teamId:'players',mapId:s.mapId,profile,name:p.displayName||p.name||p.id,hpCurrent:num(profile.stats?.hpCurrent,profile.stats?.hpMax),hpMax:num(profile.stats?.hpMax),traumaV195:clone(profile.traumaV195||{}),ownTurnV199:num(profile.combatState093?.ownTurn),conditionsV138:clone(profile.combatState093?.conditions||{}),control:clone(profile.combatState093?.control||null),critical229:clone(profile.combatState093?.critical||null),loseNextAction093:!!profile.combatState093?.loseNextAction,dead229:!!profile.dead229,actionUsed:false,reactionUsedV119:false,movedThisTurn:0};
    if(u.dead229||u.hpCurrent<=0||u.conditionsV138.dying)fail('Участник не готов к вылазке: '+u.name);
    s.units.push(u);api.place(u,spawn);u.initiative=api.die(20)+api.computed(u).values.initiativeBonus;
  }
  for(const m of mission.maps)for(const t of arr(m.tokens)){
    const base=clone(world.npcs?.NPCS?.[t.npcId]||t.profile||{});const owned=Copies.spawn(base,api.item,(item,danger)=>api.aberrate(item,danger),id,random);
    const profile={...base,...owned};
    for(const row of arr(t.combatInventoryV120))for(const original of arr(row.instancesV215))if(original.aberration252?.forged){const copy=clone(original);const rekey=c=>{c.id=id();for(const a of arr(c.attachments))rekey(a.copy);};rekey(copy);const slot=copy.slot;delete copy.slot;Copies.append(profile,api.item(row.itemId),[copy]);if(slot){profile.equipmentSlots[slot]=row.itemId;I.bind(profile,row.itemId,slot,copy.id);}}
    for(const loot of arr(base.lootTable)){if(['weapon','armor'].includes(api.item(loot.itemId)?.type)&&Object.values(profile.equipmentSlots||{}).includes(loot.itemId))continue;if(random()*100>=num(loot.chance,100))continue;const i=api.item(loot.itemId);if(!i)continue;const qty=Math.max(1,Math.trunc(num(loot.qty,1)));if(I.tracked(i))for(let n=0;n<qty;n++)Copies.append(profile,i,[Copies.create(i,api.aberrate(i,base.dangerLevel),id,random)]);else{let r=profile.inventory.find(r=>r.itemId===i.id);if(!r)profile.inventory.push(r={itemId:i.id,qty:0});r.qty+=qty;}}
    const hp=num(t.hpMax,num(api.computed({profile}).values.maxHp,num(base.stats?.hpMax,num(base.hpMax,4))));const u={...clone(t),id:id(),teamId:'npcs',mapId:m.id,profile,name:t.name||base.name||'Противник',hpMax:hp,hpCurrent:num(t.hpCurrent,hp),ownTurnV199:0,conditionsV138:{},traumaV195:{injuryPoints:0,schema:195},actionUsed:false,reactionUsedV119:false,movedThisTurn:0};s.units.push(u);u.initiative=api.die(20)+api.computed(u).values.initiativeBonus;
  }
  api.validateSources();api.reorder();api.event('OnSceneStart');api.event('OnBattleStart');api.begin(now);return s;
}
function engine(s,random=Math.random,id=()=>String(Date.now())+':'+random()){
  const stats=Stats.engine(s.world),item=key=>stats.equipment(key);
  const map=()=>s.mission.maps.find(m=>m.id===s.mapId);
  const unit=key=>s.units.find(u=>u.id===key)||fail('Участник не найден');
  const current=()=>s.units.find(u=>u.id===s.order[s.turn]);
  const die=sides=>{const n=Math.max(1,Math.min(100000,Math.trunc(sides)));const value=1+Math.floor(random()*n);log('d'+n+' → '+value);return value;};
  function log(text){s.log.push({at:Date.now(),text:String(text).slice(0,1500)});s.log=s.log.slice(-300);}
  const alive=u=>!u.dead229;
  const active=u=>alive(u)&&u.hpCurrent>0&&!u.conditionsV138?.unconscious&&!u.conditionsV138?.dying&&!u.conditionsV138?.stunned;
  const computed=(u,context={})=>stats.compute({...u.profile,stats:{...u.profile.stats,hpCurrent:u.hpCurrent},temporaryModifiers:u.modifiers||[]},{kind:u.playerId?'player':'npc',inCombat:true,...context});
  const penalty=u=>T.effects(u).checkPenalty;
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
  function weapon(u,slot='primaryWeapon'){return item(u.profile.equipmentSlots?.[slot])||{id:'__unarmed_v122',name:'Безоружная атака',type:'weapon',weaponCategory:'melee',isUnarmedV122:true,damage:'1',range:1};}
  function expression(value){const text=R.normalizeDamageExpression(value);if(/^\d+$/.test(text))return Number(text);const match=/^(\d{0,2})d(\d{1,5})([+-]\d+)?$/.exec(text);if(!match)fail('Не поддерживается формула урона: '+value);let out=num(match[3]);for(let n=0;n<Math.min(30,num(match[1],1)||1);n++)out+=die(Number(match[2]));return Math.max(0,out);}
  function place(u,zone){
    const points=zone.points,minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    for(let y=minY+.5;y<maxY;y+=1)for(let x=minX+.5;x<maxX;x+=1)if(inside(zone,{x,y})&&pointOK(s,{x,y},u.id)){u.x=x;u.y=y;u.mapId=s.mapId;return;}
    fail('Недостаточно места в зоне высадки/перехода');
  }
  function reorder(){s.order=s.units.filter(u=>u.mapId===s.mapId&&alive(u)).sort((a,b)=>b.initiative-a.initiative||a.id.localeCompare(b.id)).map(u=>u.id);s.turn=0;}
  function speed(u){const c=computed(u),p=u.profile;const load=Movement.weight(p.inventory,Object.values(p.equipmentSlots||{}),item);let speed=Movement.resolve({speed:c.values.movement,weight:load,capacity:c.values.carryCapacity}).speed;speed=T.speed(speed,u);if(u.conditionsV138?.prone)speed=Math.ceil(speed/4);if(u.carrying)speed=Math.floor(speed/2);if(u.control?.rootUntil>=u.ownTurnV199)return 0;if(u.control?.slowUntil>=u.ownTurnV199)speed=Math.max(0,speed-u.control.slow);return speed;}
  function release(u){if(u.carrying){const other=unit(u.carrying);delete other.carriedBy;delete u.carrying;u.conditionsV138.handsBusy=!!u.handsBeforeCarry;delete u.handsBeforeCarry;}}
  function begin(now){s.eventCount=0;const u=current();if(!u)return;u.ownTurnV199=num(u.ownTurnV199)+1;u.actionUsed=!!u.loseNextAction093;u.loseNextAction093=false;u.reactionUsedV119=num(u.reactionDebt)>0;if(u.reactionDebt)u.reactionDebt--;for(const resource of Object.values(u.resources204||{}))if(resource.reset==='turn')resource.value=resource.max;u.aiMoved=false;u.dashUsed=false;u.burst=null;u.movedThisTurn=0;u.budget=speed(u);u.profile.stats={...u.profile.stats,hpCurrent:u.hpCurrent};R.criticalTurn(u,'start');s.deadline=now+60000;event('OnTurnStart',[u]);}
  function end(now){
    if(s.pending||s.flow||s.job)fail('Сначала завершите текущий выбор');const u=current();if(u){R.criticalTurn(u,'end');u.modifiers=arr(u.modifiers).filter(m=>m.expires==null||m.expires>u.ownTurnV199);if(u.control){if(u.control.rootUntil<=u.ownTurnV199)delete u.control.rootUntil;if(u.control.slowUntil<=u.ownTurnV199){delete u.control.slowUntil;delete u.control.slow;}}event('OnTurnEnd',[u]);}
    const start=s.turn;do{s.turn++;if(s.turn>=s.order.length){s.turn=0;s.round++;for(const actor of s.units)for(const resource of Object.values(actor.resources204||{}))if(resource.reset==='round')resource.value=resource.max;if(s.evac&&s.round>=s.evac.finishRound){finish(now);return;}progressHold();event('OnRoundStart');}if(s.turn===start&&s.order.every(key=>!alive(unit(key)))){finish(now);return;}}while(!current()||!alive(current())||current().mapId!==s.mapId);
    begin(now);
  }
  function runtimeCopy(u,key){for(const row of arr(u.profile.inventory))for(const copy of arr(row.instancesV215))if(copy.id===key||copy.slot===key||row.itemId===key)return copy;return null;}
  function luaUnit(u){
    const c=computed(u),p=u.profile,inventory=arr(p.inventory).flatMap(row=>{const def=item(row.itemId)||{};return row.instancesV215?.length?row.instancesV215.map(copy=>({...copy,slot:copy.slot,itemId:row.itemId,instanceId:copy.id,type:def.type,name:def.name,qty:1,ammo:num(copy.magazine?.loaded),magazineSize:num(def.magazineSize),ammoTypeId:copy.magazine?.ammoTypeId})): [{...row,type:def.type,name:def.name}];});
    const d=defense(u,s.flow?.type||'kinetic');
    return{...u,profile:undefined,kind:u.playerId?'player':'npc',stats:{...c.values,...c.abilities,...d,hpCurrent:u.hpCurrent,hpMax:u.hpMax},abilities:arr(p.skills),trained:arr(p.trained||p.training),inventory,equipped:inventory.filter(row=>row.slot),conditions:u.conditionsV138,actionAvailable:active(u)&&!u.actionUsed,reactionAvailable:active(u)&&!u.reactionUsedV119,injuryPoints:T.ensure(u).injuryPoints,injuryDegree:T.ensure(u).degree,checkPenalty:penalty(u),distances:Object.fromEntries(s.units.filter(x=>x.mapId===u.mapId).map(x=>[x.id,distance(u,x)]))};
  }
  function validateSources(){
    const supported=new Set(['OnSceneStart','OnBattleStart','OnTurnStart','OnTurnEnd','OnRoundStart','OnAttackDeclared','BeforeRoll','BeforeAttackStart','BeforeAttackRoll','AfterAttackRoll','AfterRoll','OnAttackResolved','OnHit','BeforeDamage','OnMiss','OnTakeDamage','OnShotFired','OnDamageApplied','OnMoveEnd','OnAbilityPhaseStart','OnAbilityExecuted']);
    for(const u of s.units)for(const source of sources(u))for(const match of source.luaScript.matchAll(/function\s+((?:On|Before|After)[A-Za-z0-9_]+)\s*\(/g))if(!supported.has(match[1]))fail('Тестовые вылазки ещё не поддерживают '+match[1]+' в «'+(source.name||source.id)+'»');
  }
  function sources(u){
    const list=[];for(const key of arr(u.profile.skills)){const row=s.world.skills?.SKILLS?.[key];if(row)list.push({...row,kind:'skill',ownerId:u.id});}
    for(const [slot,key] of [...Object.entries(u.profile.equipmentSlots||{}),...arr(u.profile.implantSlots).map((key,i)=>['implant:'+i,key])]){const row=item(key),copy=row&&I.instance(u.profile,key,-1,slot);if(row&&!copy?.broken)list.push({...row,kind:row.type==='implant'?'implant':'equipment',slot,ownerId:u.id,instanceId:copy?.id});}
    for(const [kind,table,key] of [['profession',s.world.socialOrigins?.SOCIAL_ORIGINS,u.profile.socialOriginId],['origin',s.world.geographicOrigins?.GEOGRAPHIC_ORIGINS,u.profile.geographicOriginId]])if(table?.[key])list.push({...table[key],kind,ownerId:u.id});
    for(const row of arr(u.profile.inventory)){const def=item(row.itemId);if(def?.activeUse&&def.luaScript&&!list.some(x=>x.id===def.id)){const copy=arr(row.instancesV215).find(c=>!c.broken&&(!c.chargesMax||c.charges>0));if(!I.tracked(def)||copy)list.push({...def,kind:'equipment',ownerId:u.id,instanceId:copy?.id,inventoryOnly:true});}}
    return list.filter(x=>x.luaEnabled!==false&&x.luaScript);
  }
  const has=(source,hook)=>new RegExp('function\\s+'+hook+'\\s*\\(').test(source.luaScript);
  function event(hook,owners=s.units.filter(u=>u.mapId===s.mapId),params={}){
    s.events ||= [];s.eventCount=num(s.eventCount)+1;if(s.eventCount>256)fail('Превышен лимит цепочки Lua-событий');for(const u of owners){if(!alive(u))continue;const candidates=sources(u).filter(x=>!x.inventoryOnly&&has(x,hook));const auto=candidates.filter(x=>!['reaction','реакция'].includes(String(x.activationType||x.actionCost||'').toLowerCase()));
      for(const source of auto)s.events.push({source,hook,ownerId:u.id,params});
      const reactions=candidates.filter(x=>!auto.includes(x));if(reactions.length&&!u.reactionUsedV119&&!T.effects(u).noReaction&&active(u))s.events.push({reaction:true,options:reactions,hook,ownerId:u.id,params});
    }
  }
  function suspend(now){if(s.remainingTurn==null)s.remainingTurn=Math.max(0,s.deadline-now);}
  function resume(now){if(s.remainingTurn!=null){s.deadline=now+s.remainingTurn;delete s.remainingTurn;}}
  function makeJob(entry,now){
    const owner=unit(entry.ownerId),params={...entry.params,attackerId:entry.params.attacker,targetId:entry.params.target,casterId:owner.id,unitId:owner.id,targetIds:entry.params.targets||[],event:entry.hook,attackBonus:s.flow?.state.attackBonus,defenseBonus:s.flow?.state.defenseBonus,damage:s.flow?.state.damage??entry.params.damage,inputs:entry.params.inputs||{},targetRequests:entry.params.targetRequests||{},answers204:entry.params.answers204||{}};
    s.job={id:id(),entry,payload:{script:entry.source.luaScript,hook:entry.hook,mode:'execute',input:{source:{...entry.source,luaScript:undefined,image:undefined,id:entry.source.id,kind:entry.source.kind,ownerId:owner.id,state204:owner.sourceData?.[entry.source.kind+':'+entry.source.id]||{}},units:s.units.filter(u=>u.mapId===s.mapId).map(u=>{const data=luaUnit(u);if(entry.abilityReserved&&u.id===owner.id)data.actionAvailable=true;return data;}),params}}};suspend(now);
  }
  function drain(now){
    let n=0;while(!s.job&&!s.pending&&s.phase==='running'&&n++<60){
      if(arr(s.events).length){const e=s.events.shift(),u=unit(e.ownerId);if(e.reaction){if(u.reactionUsedV119||!active(u))continue;if(u.playerId){s.pending={id:id(),kind:'reaction',actor:u.id,options:e.options.map(x=>({id:x.id,name:x.name})),entry:e,until:now+25000};suspend(now);break;}e.source=e.options[0];e.isReaction=true;delete e.reaction;}makeJob(e,now);break;}
      if(s.flow){step(now);continue;}if(arr(s.attacks).length){const a=s.attacks.shift();attack(unit(a.attackerId),unit(a.targetId),a.slot||'primaryWeapon',now,{free:true});continue;}resume(now);break;
    }
    if(n>=60)fail('Превышен лимит событий');
  }
  function cover(attacker,target){const rows=blockers(map(),attacker,target,'cover'),walls=blockers(map(),attacker,target),bonus=Math.max(0,Vision.elevationCover(map(),attacker,target),...rows.map(o=>num(o.coverArmorBonus)));return{bonus,hardness:rows.reduce((v,o)=>v+Math.max(0,num(o.coverHardness)),0),blocked:walls.some(o=>!o.coverType||o.coverType==='none'||o.coverType==='total'&&o.coverPenetrable!==true),concealment:rows.some(o=>o.coverType==='concealment')};}
  const math=CombatMath({stats,instances:I,types:D,item,effects:ids=>arr(ids).map(value=>{const [base,type]=value.split(':');const group=Catalog.find(g=>g.variants.some(v=>v.id===base)),v=group?.variants.find(v=>v.id===base);return v?{group:group.id,type,value:num(String(v.value).replace('−','-').split(/\s/)[0])}:null;}).filter(Boolean)});
  function defense(target,type,cv={bonus:0,hardness:0},category='light'){
    return math.defense(target,category,{armorBonus:num(cv.bonus),hardness:num(cv.hardness)},type);
  }
  function damage(target,amount,type='kinetic',spec={}){
    const raw=spec.parts?spec.parts.reduce((sum,p)=>sum+p.amount,0):Math.max(0,Math.floor(amount)),d=defense(target,type,spec.cover,spec.weaponCategory),source=spec.absorptionSource||'none';
    const state={damage:raw,damagePartsV138:spec.parts||[{amount:raw,absorptionSource:source,penetration:spec.penetration,ignoreAbsorption:spec.ignoreAbsorption,ignorePercent:spec.ignorePercent}],weaponPenetration287:spec.weaponPenetration};
    const reduced=math.absorb(state,d,partType=>defense(target,partType,spec.cover,spec.weaponCategory)),blocked=reduced.absorbed,armorBlocked=reduced.explosiveArmorBlocked;
    let final=reduced.applied;if(spec.defenseCritical)final=Math.floor(final/2);
    const before=target.hpCurrent;R.applyDamage(target,final);log(target.name+': '+raw+' − '+blocked+' → '+final+' '+D.label(type)+'; HP '+before+' → '+target.hpCurrent+'; травма '+T.ensure(target).injuryPoints+'/10');
    if(reduced.explosiveHit){
      const armor=item(target.profile.equipmentSlots?.armor),copy=armor&&I.instance(target.profile,armor.id,-1,'armor');if(copy&&armorBlocked>0&&copy.durabilityMax){copy.durability=Math.max(0,copy.durability-armorBlocked);copy.broken=copy.durability===0;log('Прочность брони −'+armorBlocked+' → '+copy.durability);}
      const dc=10+final,roll=die(20)+computed(target).abilities.will-penalty(target);if(roll<=dc){target.reactionUsedV119=true;if(roll<=dc/2)target.loseNextAction093=true;}log('Ошеломление '+roll+' / СЛ '+dc);
    }
    if(target.hpCurrent<=0)release(target);event('OnDamageApplied',[target],{target:target.id,damage:final,hpLoss:before-target.hpCurrent});return final;
  }
  function consume(u,row,qty){for(let n=0;n<qty;n++){const copy=arr(row.instancesV215).find(c=>!c.slot)||row.instancesV215?.[0];if(copy){if(copy.slot){if(copy.slot.startsWith('implant:'))u.profile.implantSlots[Number(copy.slot.split(':')[1])]='';else u.profile.equipmentSlots[copy.slot]='';}I.remove(row,row.instancesV215.indexOf(copy));}else row.qty--; }u.profile.inventory=u.profile.inventory.filter(row=>row.qty>0);}
  function useAction(u){if(!active(u)||u.carriedBy||u.actionUsed)fail('Действие недоступно');u.actionUsed=true;}
  function checkTurn(actor){const u=current();if(!u||u.id!==actor||!u.playerId)fail('Сейчас ход другого участника');if(!active(u)||u.carriedBy)fail('Персонаж не может действовать');return u;}
  function attack(u,target,slot,now,options={}){
    if(!active(u)||u.conditionsV138.handsBusy)fail('Атака недоступна');if(!alive(target)||target.mapId!==s.mapId||target.teamId===u.teamId)fail('Недопустимая цель');
    const w=weapon(u,slot),copy=I.instance(u.profile,w.id,-1,slot);if(copy?.broken)fail('Оружие уничтожено');if(copy?.jammed)fail('Оружие заклинило: нужна перезарядка');if(!s.units.filter(p=>p.teamId===u.teamId&&p.mapId===s.mapId&&p.hpCurrent>0).some(p=>distance(p,target)<=num(computed(p).values.vision,6)&&clear(map(),p,target)))fail('Цель не видна команде');
    const effects=effectRows(u,slot),bonus=group=>num(effects.find(e=>e.group===group)?.value),range=Math.max(0,num(w.range,1)+bonus('weapon-9')),cv=cover(u,target);
    if(cv.blocked)fail('Цель закрыта препятствием');cv.bonus=Math.max(0,cv.bonus-bonus('weapon-60'));
    if(w.weaponCategory==='melee'&&distance(u,target)>Math.max(1,range)+bonus('weapon-10'))fail('Цель вне досягаемости');
    const size=num(w.magazineSize)>0?Math.max(1,num(w.magazineSize)+bonus('weapon-8')):0;if(copy&&!copy.magazine)copy.magazine=clone(u.profile.weaponMagazines?.[w.id]||{loaded:w.ammoTypeId?size:0,ammoTypeId:w.ammoTypeId});const ammoId=copy?.magazine?.ammoTypeId||w.ammoTypeId,ammo=item(ammoId),type=D.effective(w,ammo);
    if(size>0){copy.magazine ||= {loaded:0,ammoTypeId};if(num(copy.magazine.loaded)<Math.max(1,num(w.ammoPerShot,1)))fail('Нужна перезарядка');copy.magazine.loaded-=Math.max(1,num(w.ammoPerShot,1));}
    const burst=u.burst;if(burst&&burst.slot!==slot)fail('Сначала завершите очередь');if(!burst&&!options.free)useAction(u);
    const shot=burst?.shot||1,switches=num(burst?.switches)+(burst&&burst.lastTarget!==target.id?1:0);
    const a=stats.weaponAttack(u.profile,w,{kind:u.playerId?'player':'npc',inCombat:true,weaponSlot:slot,damageType:type,firstShot:shot===1,temporaryModifiers:[...arr(u.modifiers),...arr(ammo?.modifiers)]});
    const hitBonus=a.bonus+bonus('weapon-1')+(target.failureUntil>num(target.ownTurnV199)?1:0)-penalty(u)-(shot-1)-switches+num(u.aim),d=defense(target,type,cv,w.weaponCategory);
    const params={attacker:u.id,target:target.id,weapon:w,ammo,damageType:type,weaponSlot:slot,shotIndex:shot,shotCount:Math.max(1,num(w.rapidFireShots,1)),damage:0};
    s.flow={kind:'attack',stage:0,attacker:u.id,target:target.id,slot,type,cover:cv,range,distance:distance(u,target),effects,params,shot,switches,hadHit:!!burst?.hadHit,hadCritical:!!burst?.hadCritical,state:{damage:0,attackBonus:hitBonus,defenseBonus:d.defenseBonus,damageBonus:a.damageBonus+bonus('weapon-2')+num(u.aim)}};
    delete target.failureUntil;suspend(now);event('OnAttackDeclared',[u,target],params);
  }
  function step(now){
    const f=s.flow,u=unit(f.attacker),target=unit(f.target);if(f.kind!=='attack'){delete s.flow;return;}
    if(f.stage===0){f.stage=1;event('BeforeRoll',[u,target],f.params);event('BeforeAttackStart',[u,target],f.params);event('BeforeAttackRoll',[u],f.params);return;}
    if(f.stage===1){
      const attackDice=[die(20)],defenseDice=[die(20)],w=weapon(u,f.slot),bonus=group=>num(f.effects.find(e=>e.group===group)?.value);
      if(f.distance>f.range&&w.weaponCategory!=='melee'||T.effects(u).disadvantage||f.cover.concealment)attackDice.push(die(20));if(T.effects(target).disadvantage)defenseDice.push(die(20));
      f.result=R.resolveManualAttack({attackRoll:Math.min(...attackDice),defenseRoll:Math.min(...defenseDice),attackBonus:f.state.attackBonus,defenseBonus:f.state.defenseBonus,damageRoll:expression(w.damage||1),damageBonus:f.state.damageBonus,criticalRange:f.shot===1?bonus('weapon-3'):0,criticalBonus:f.hadCritical?0:bonus('weapon-4')});
      const r=f.result;if(f.state.cancelled){r.hit=false;r.rawDamage=0;f.cancelled=true;}const acopy=I.instance(target.profile,target.profile.equipmentSlots?.armor,-1,'armor');f.armorEffects=acopy&&!acopy.broken?effectRows(target,'armor'):[];const immunity=f.armorEffects.find(e=>e.group==='armor-28'&&(!e.type||e.type==='any'||(e.type==='melee')===(w.weaponCategory==='melee')));if(immunity&&!target.armorCancelUsed){target.armorCancelUsed=true;r.hit=false;r.rawDamage=0;f.cancelled=true;}f.state.damage=r.rawDamage;Object.assign(f.params,{attackRoll:r.attackDie,defenseRoll:r.defenseDie,attackTotal:r.attackTotal,defenseTotal:r.defenseTotal,attackMargin:r.attackMargin,hit:r.hit,critical:r.critical,damage:r.rawDamage});
      f.stage=2;event('AfterRoll',[u,target],f.params);event('AfterAttackRoll',[u],f.params);event('OnAttackResolved',[u,target],f.params);if(r.hit){event('OnHit',[u],f.params);event('BeforeDamage',[target],f.params);}else event('OnMiss',[u],f.params);return;
    }
    if(f.stage===2){f.stage=3;if(f.result.hit){
      let raw=f.state.damage;if(f.effects.some(e=>e.group==='weapon-13')&&!u.burst?.finisherUsed&&target.hpCurrent<=target.hpMax*.25){raw+=2;f.finisherUsed=true;}if(f.type==='energy'&&weapon(u,f.slot).weaponCategory!=='melee')raw=R.attenuateEnergyDamage(raw,f.distance,f.range);
      const pen=num(f.effects.find(e=>e.group==='weapon-59')?.value),parts=[{amount:raw,absorptionSource:'all',penetration:f.state.penetration,ignoreAbsorption:f.state.ignoreAbsorption,ignorePercent:f.state.ignorePercent}];
      for(const e of f.effects){if(e.group==='weapon-5'&&!f.hadHit)parts.push({amount:die(e.value),damageType258:'kinetic',absorptionSource:'all'});if(e.group==='weapon-56'&&f.shot===1)parts.push({amount:e.value,damageType258:e.type,absorptionSource:'all'});}
      const final=damage(target,raw,f.type,{parts,cover:f.cover,absorptionSource:'all',weaponCategory:weapon(u,f.slot).weaponCategory,weaponPenetration:pen,defenseCritical:f.result.defenseCritical});
      for(const e of f.effects){
        if(e.group==='weapon-58'&&!f.hadHit)target.control={...target.control,slow:Math.max(e.value,num(target.control?.slow)),slowUntil:target.ownTurnV199+1};
        if(e.group==='weapon-57'&&!f.hadHit&&die(20)>=15)target.control={...target.control,rootUntil:target.ownTurnV199+1};
        if(e.group==='weapon-12'&&!f.hadHit){if(u.playerId)s.pending={id:id(),kind:'push',actor:u.id,target:target.id,distance:e.value,until:now+25000};else push(u,target,e.value);}
      }
      if(f.result.attackDie===20){const armor=item(target.profile.equipmentSlots?.armor),copy=armor&&I.instance(target.profile,armor.id,-1,'armor');if(copy?.durabilityMax&&!copy.broken){copy.durability=Math.max(0,copy.durability-1);copy.broken=copy.durability===0;}}
      for(const e of f.armorEffects||[]){if(e.group==='armor-25'&&weapon(u,f.slot).weaponCategory==='melee'&&target.reflectRound!==s.round){target.reflectRound=s.round;damage(u,e.value,'kinetic',{absorptionSource:'none'});}if(e.group==='armor-26'&&f.result.critical&&!target.armorFragilityUsed){target.armorFragilityUsed=true;const armor=item(target.profile.equipmentSlots?.armor),copy=armor&&I.instance(target.profile,armor.id,-1,'armor');if(copy?.durabilityMax){copy.durability=Math.max(0,copy.durability-e.value);copy.broken=copy.durability===0;}}}
      f.params.damage=final;event('OnTakeDamage',[target],f.params);
    }log(u.name+' → '+target.name+': '+f.result.attackTotal+' против '+f.result.defenseTotal+(f.result.hit?' попадание':' промах'));return;}
    const w=weapon(u,f.slot),copy=I.instance(u.profile,w.id,-1,f.slot);
    if(f.result.fumble&&copy?.durabilityMax){copy.durability=Math.max(0,copy.durability-1);copy.broken=copy.durability===0;}
    if(f.result.attackDie===20&&f.result.defenseDie===1&&f.effects.some(e=>e.group==='weapon-15')&&copy?.jamRound!==s.round){copy.jammed=true;copy.jamRound=s.round;}
    if(!f.result.hit&&f.effects.some(e=>e.group==='weapon-16')&&u.recoilRound!==s.round){u.recoilRound=s.round;u.control={...u.control,slow:Math.max(1,num(u.control?.slow)),slowUntil:u.ownTurnV199+1};u.budget=Math.min(u.budget,speed(u));}
    if(!f.result.hit&&f.effects.some(e=>e.group==='weapon-17')&&u.failureRound!==s.round){u.failureRound=s.round;u.failureUntil=u.ownTurnV199+1;}
    const more=!f.cancelled&&f.shot<Math.max(1,num(w.rapidFireShots,1))&&!f.result.fumble&&!copy?.broken&&!copy?.jammed&&(!w.magazineSize||num(copy?.magazine?.loaded)>=Math.max(1,num(w.ammoPerShot,1)));
    u.burst=more?{slot:f.slot,shot:f.shot+1,switches:f.switches,lastTarget:target.id,hadHit:f.hadHit||f.result.hit,hadCritical:f.hadCritical||f.result.critical,finisherUsed:!!f.finisherUsed||!!u.burst?.finisherUsed}:null;
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
    s.rewardItems=s.success?clone(s.mission.reward.items||[]):[];s.phase=s.rewardItems.length&&winners.length?'rewards':'finished';s.rewardsEligible=winners;s.rewardOrder=[...winners].sort();s.rewardTurn=0;s.deadline=now+60000;delete s.pending;delete s.job;delete s.flow;s.events=[];log(s.success?'Задание выполнено; эвакуация завершена':'Эвакуация без награды за задание');
  }
  function move(u,to){const route=path(s,u,to),cost=route.slice(1).reduce((sum,p,i)=>sum+distance(p,route[i]),0);if(cost>Math.max(0,u.budget-u.movedThisTurn)+1e-6)fail('Недостаточно перемещения');u.x=to.x;u.y=to.y;u.movedThisTurn+=cost;if(u.carrying){const other=unit(u.carrying);other.x=u.x;other.y=u.y;}event('OnMoveEnd',[u],{unit:u.id,position:to});progress();}
  function advanceRewards(now){if(s.rewardsEligible.every(key=>s.rewardsDone?.includes(key))){s.phase='finished';return;}do{s.rewardTurn=(s.rewardTurn+1)%s.rewardOrder.length;}while(s.rewardsDone?.includes(s.rewardOrder[s.rewardTurn]));s.deadline=now+60000;}
  function command(actor,c,now){
    if(s.phase==='rewards'){
      if(!s.rewardsEligible.includes(actor)||s.rewardOrder[s.rewardTurn]!==actor||s.rewardsDone?.includes(actor))fail('Сейчас очередь другого участника');
      if(c.type==='leaveRewards'){s.rewardsDone ||= [];s.rewardsDone.push(actor);if(s.rewardsEligible.every(key=>s.rewardsDone.includes(key)))s.phase='finished';else advanceRewards(now);return;}
      if(c.type==='passReward'){advanceRewards(now);return;}
      if(c.type!=='claimReward')fail('Выберите предмет награды');const row=s.rewardItems.find(r=>r.itemId===c.itemId&&r.qty>0);if(!row)fail('Предмет уже забрали');const u=unit(actor),check=stats.canAdd(u.profile,row.itemId,1);if(!check.ok)fail(check.reason);const i=item(row.itemId);if(I.tracked(i))Copies.append(u.profile,i,[Copies.create(i,null,id)]);else{let r=u.profile.inventory.find(r=>r.itemId===i.id);if(!r)u.profile.inventory.push(r={itemId:i.id,qty:0});r.qty++;}row.qty--;if(!s.rewardItems.some(r=>r.qty>0))s.phase='finished';else advanceRewards(now);return;
    }
    if(s.phase!=='running')fail('Вылазка завершена');
    if(s.pending){const p=s.pending;if(p.actor!==actor||c.pendingId!==p.id)fail('Сейчас требуется выбор другого участника');if(now>p.until+1500)fail('Время выбора истекло');if(p.kind==='reaction'){const source=p.entry.options.find(x=>x.id===c.sourceId);if(source){makeJob({...p.entry,source,isReaction:true},now);}}else if(p.kind==='push'&&c.accept)push(unit(actor),unit(p.target),p.distance);else if(p.kind==='loot'){
        const target=unit(p.target),owner=unit(actor),chosen=[...new Set(arr(c.values))];if(chosen.some(key=>!p.options.some(o=>o.id===key)))fail('Предмет отсутствует в добыче');
        for(const key of chosen){const option=p.options.find(o=>o.id===key),qty=Number(c.quantities?.[key]??option.maxQty);if(!Number.isInteger(qty)||qty<1||qty>option.maxQty)fail('Неверное количество');const row=target.profile.inventory[option.row],def=item(row.itemId),copy=option.copyId&&row.instancesV215.find(x=>x.id===option.copyId);const check=stats.canAdd(owner.profile,def.id,qty,copy?[copy.aberration252]:[]);if(!check.ok)fail(check.reason);if(copy){Copies.append(owner.profile,def,[Copies.snapshot(copy)]);const index=row.instancesV215.indexOf(copy);if(copy.slot){if(copy.slot.startsWith('implant:'))target.profile.implantSlots[Number(copy.slot.split(':')[1])]='';else target.profile.equipmentSlots[copy.slot]='';}I.remove(row,index);}else{let own=owner.profile.inventory.find(r=>r.itemId===def.id);if(!own)owner.profile.inventory.push(own={itemId:def.id,qty:0});own.qty+=qty;row.qty-=qty;}}
        target.profile.inventory=target.profile.inventory.filter(r=>r.qty>0);target.searched=!target.profile.inventory.length;log(owner.name+' обыскал '+target.name);
      }else if(['choice','confirm','checklist','point'].includes(p.kind)){
        let answer=c.value;
        if(p.kind==='confirm'){if(!c.accept){delete s.pending;drain(now);return;}answer=true;}
        if(p.kind==='choice'&&!p.options.some(o=>o.id===answer))fail('Недоступный вариант');
        if(p.kind==='checklist'){answer=[...new Set(arr(c.values))];if(answer.length<p.min||answer.length>p.max||answer.some(key=>!p.options.some(o=>o.id===key)))fail('Проверьте выбранные варианты');}
        if(p.kind==='point'){answer={x:Number(c.x),y:Number(c.y)};const origin=s.units.find(u=>u.id===p.originId)||unit(actor);if(!Number.isFinite(answer.x)||!Number.isFinite(answer.y)||answer.x<0||answer.y<0||answer.x>map().width||answer.y>map().height||distance(origin,answer)>p.radius)fail('Точка за пределами области выбора');}
        s.job=p.job;s.job.payload.input.params.answers204[p.key]=answer;
      }else if(p.kind==='number'){const value=Number(c.value);if(!Number.isInteger(value)||value<p.min||value>p.max)fail('Введите число в указанных пределах');s.job=p.job;s.job.payload.input.params.inputs[p.key]=value;}else if(p.kind==='targets'){s.job=p.job;s.job.payload.input.params.targetRequests[p.key]=[...new Set(arr(c.targets))].filter(key=>p.candidates.includes(key)).slice(0,p.max);if(s.job.payload.input.params.targetRequests[p.key].length<p.min)fail('Выберите цели');}delete s.pending;drain(now);return;}
    if(s.job||s.flow)fail('Разрешается предыдущее действие');const u=checkTurn(actor);s.eventCount=0;
    if(c.type==='end'){u.burst=null;end(now);return;}if(c.type==='release'){release(u);return;}if(c.type==='move'){if(u.burst)fail('Сначала завершите очередь');if(u.control?.rootUntil>=u.ownTurnV199)fail('Персонаж опутан');move(u,{x:Number(c.x),y:Number(c.y)});return;}
    if(c.type==='attack'){attack(u,unit(c.target),c.slot||'primaryWeapon',now);drain(now);return;}
    if(c.type==='carry'){const target=unit(c.target);if(!target.playerId||target.id===u.id||!alive(target)||target.mapId!==s.mapId||distance(u,target)>1.5||!clear(map(),u,target)||u.carrying||target.carriedBy||target.carrying||u.conditionsV138.handsBusy)fail('Нельзя поднять союзника');useAction(u);u.carrying=target.id;u.handsBeforeCarry=!!u.conditionsV138.handsBusy;target.carriedBy=u.id;u.conditionsV138.handsBusy=true;u.budget=Math.min(u.budget,speed(u));target.x=u.x;target.y=u.y;return;}
    if(c.type==='unbind'){useAction(u);if(u.control)delete u.control.rootUntil;return;}
    if(c.type==='dash'){if(u.dashUsed)fail('Рывок уже использован');useAction(u);u.dashUsed=true;u.budget+=speed(u);return;}if(c.type==='stand'){if(!u.conditionsV138.prone||u.budget-u.movedThisTurn<1)fail('Нельзя встать');u.conditionsV138.prone=false;u.movedThisTurn++;return;}if(c.type==='aim'){useAction(u);u.aim=Math.min(3,num(u.aim)+1);return;}
    if(c.type==='stabilize'){const target=unit(c.target);if(distance(u,target)>1.5||!clear(map(),u,target)||!target.conditionsV138?.dying)fail('Нет доступного умирающего');useAction(u);const total=die(20)+computed(u).abilities.intelligence-penalty(u);if(total-computed(u).abilities.intelligence+penalty(u)!==1&&total>=R.stabilizationDifficulty(target))R.stabilize(target);log('Стабилизация '+total+' / '+R.stabilizationDifficulty(target));return;}
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
      useAction(u);consume(u,row,1);const check=die(20),scatter=R.grenadeScatter(check,check+computed(u).abilities.dexterity-penalty(u));if(scatter){const direction=(die(6)-1)*Math.PI/3;point.x+=Math.cos(direction)*scatter;point.y+=Math.sin(direction)*scatter;}
      const raw=expression(g.damage||0),type=D.effective(g),radius=Math.max(0,num(g.areaRadius??g.radius??g.aoeRadius,2));for(const other of s.units.filter(x=>x.mapId===s.mapId&&alive(x)&&distance(x,point)<=radius&&clear(map(),point,x)))damage(other,raw,type,{absorptionSource:'all'});log('Граната '+g.name+'; отклонение '+scatter);progress();return;
    }
    if(c.type==='ability'){const source=sources(u).find(x=>x.id===c.sourceId);if(!source||!has(source,'OnAbilityExecuted')&&!has(source,'OnAbilityPhaseStart'))fail('Навык недоступен');if(u.conditionsV138.handsBusy&&source.kind==='equipment')fail('Руки заняты');const target=c.target?unit(c.target):u;if(target.mapId!==s.mapId||num(source.castRange)>0&&distance(u,target)>source.castRange)fail('Цель навыка недоступна');if(u.actionUsed)fail('Действие недоступно');makeJob({source,hook:has(source,'OnAbilityPhaseStart')?'OnAbilityPhaseStart':'OnAbilityExecuted',phase290:has(source,'OnAbilityPhaseStart')?'start':'execute',ownerId:u.id,ability:true,params:{caster:u.id,target:c.target||u.id,targets:c.target?[c.target]:[u.id]}},now);return;}
    fail('Неизвестное действие');
  }
  function reload(u,c){if(u.conditionsV138.handsBusy)fail('Руки заняты');const slot=c.slot||'primaryWeapon',w=weapon(u,slot),copy=I.instance(u.profile,w.id,-1,slot),ammo=item(c.ammoId||w.ammoTypeId);if(!copy||copy.broken||!w.magazineSize||!ammo||!(ammo.id===w.ammoTypeId||String(ammo.ammoFamily||ammo.caliber||ammo.ammunitionFamily||'').toLowerCase()&&String(ammo.ammoFamily||ammo.caliber||ammo.ammunitionFamily||'').toLowerCase()===String(w.ammoFamily||w.caliber||w.ammunitionFamily||'').toLowerCase())||num(copy.magazine?.loaded)>0&&copy.magazine?.ammoTypeId!==ammo.id)fail('Нельзя перезарядить');const row=u.profile.inventory.find(r=>r.itemId===ammo.id);const loaded=num(copy.magazine?.loaded),take=Math.min(Math.max(1,num(w.magazineSize)+num(effectRows(u,slot).find(e=>e.group==='weapon-8')?.value))-loaded,num(row?.qty));if(take<=0&&!copy.jammed)fail('Нет патронов или магазин полон');useAction(u);if(row)row.qty-=Math.max(0,take);copy.magazine={loaded:loaded+take,ammoTypeId:ammo.id};copy.jammed=false;return;}
  function tick(now){
    if(s.phase==='rewards'){if(now>=s.deadline)advanceRewards(now);return;}
    if(s.phase!=='running')return;
    if(s.pending&&now>=s.pending.until+1500){const p=s.pending;if(['targets','number','choice','confirm','checklist','point','loot'].includes(p.kind))delete s.job;delete s.pending;drain(now);}
    if(s.job||s.pending)return;drain(now);if(s.job||s.pending)return;
    if(!s.units.some(u=>u.playerId&&alive(u))){finish(now);return;}
    const u=current();if(!u){finish(now);return;}
    if(!active(u)||u.carriedBy||now>=s.deadline){end(now);return;}
    if(!u.playerId){
      if(u.actionUsed&&!u.burst){end(now);return;}
      const enemies=s.units.filter(x=>x.playerId&&alive(x)&&x.mapId===s.mapId&&distance(u,x)<=num(computed(u).values.vision,6)&&clear(map(),u,x)).sort((a,b)=>distance(u,a)-distance(u,b));const target=enemies[0];if(!target){end(now);return;}
      let slot=u.burst?.slot||'primaryWeapon';
      const usable=key=>{const w=weapon(u,key),copy=I.instance(u.profile,w.id,-1,key);return !copy?.broken&&!copy?.jammed&&(!num(w.magazineSize)||num(copy?.magazine?.loaded,w.ammoTypeId?num(w.magazineSize):0)>=Math.max(1,num(w.ammoPerShot,1)));};
      if(!usable(slot)){
        if(!u.actionUsed){const w=weapon(u,slot),copy=I.instance(u.profile,w.id,-1,slot),ammoId=copy?.magazine?.ammoTypeId||w.ammoTypeId;if(copy&&!copy.broken&&(copy.jammed||u.profile.inventory.some(r=>r.itemId===ammoId&&r.qty>0))){reload(u,{slot,ammoId});u.burst=null;return;}}
        u.burst=null;if(u.actionUsed){end(now);return;}slot=usable('secondaryWeapon')&&u.profile.equipmentSlots?.secondaryWeapon?'secondaryWeapon':'unarmed';
      }
      const tactic=u.tactic290||'shooter',w=weapon(u,slot),range=num(w.range,1);if(tactic==='support'){const ally=s.units.filter(x=>x.teamId===u.teamId&&x.mapId===s.mapId&&active(x)&&x.hpCurrent<x.hpMax).sort((a,b)=>a.hpCurrent/a.hpMax-b.hpCurrent/b.hpMax)[0],source=sources(u).find(x=>has(x,'OnAbilityExecuted'));if(ally&&source){if(u.actionUsed)fail('Действие недоступно');makeJob({source,hook:has(source,'OnAbilityPhaseStart')?'OnAbilityPhaseStart':'OnAbilityExecuted',phase290:has(source,'OnAbilityPhaseStart')?'start':'execute',ownerId:u.id,ability:true,params:{target:ally.id,targets:[ally.id]}},now);return;}}const canAttack=!cover(u,target).blocked&&(w.weaponCategory!=='melee'||distance(u,target)<=range);
      if(tactic==='shooter'&&!u.aiMoved&&u.budget>u.movedThisTurn){const old=cover(u,target).bonus;let best=null;for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){const p={x:u.x+x,y:u.y+y},cv=cover(p,target);if(cv.bonus>old&&!cv.blocked&&pointOK(s,p,u.id)&&distance(p,u)<=u.budget-u.movedThisTurn&&(!best||cv.bonus>best.cover))best={...p,cover:cv.bonus};}if(best){try{move(u,best);u.aiMoved=true;return;}catch{}}}if(canAttack){attack(u,target,slot,now);drain(now);return;}
      if(tactic!=='hold'&&!u.aiMoved&&u.budget>u.movedThisTurn){let best=null;for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){const p={x:u.x+x,y:u.y+y};if(!pointOK(s,p,u.id)||distance(p,u)>u.budget-u.movedThisTurn)continue;const score=distance(p,target)+(tactic==='shooter'?cover(p,target).bonus*-2:0);if(!best||score<best.score)best={...p,score};}if(best){try{move(u,best);u.aiMoved=true;return;}catch{}}}u.actionUsed=true;
    }
  }
  function jobResult(jobId,result,now){
    if(!s.job||s.job.id!==jobId)return false;if(!result?.ok) {s.error=result?.message||'Ошибка Lua';return false;}
    const j=s.job,commands=arr(result.result?.commands);if(!result.result?.eligible){delete s.job;drain(now);return true;}
    const decision=commands.find(c=>/^request_(choice|confirm|checklist|point)204$/.test(c.kind)&&j.payload.input.params.answers204[c.key]===undefined);
    if(decision){const owner=unit(j.entry.ownerId),kind=decision.kind.replace('request_','').replace('204',''),options=arr(decision.options).map(o=>typeof o==='string'?{id:o,name:o}:{id:String(o.id??o.value),name:String(o.label??o.text??o.name??o.id??o.value)});if(!owner.playerId){j.payload.input.params.answers204[decision.key]=kind==='confirm'?true:kind==='point'?{x:owner.x,y:owner.y}:kind==='checklist'?options.slice(0,num(decision.min,1)).map(o=>o.id):options[0]?.id||'';delete j.lease;return true;}s.pending={id:id(),kind,actor:owner.id,key:decision.key,options,min:num(decision.min,0),max:num(decision.max,options.length),radius:num(decision.radius,Infinity),originId:decision.origin||owner.id,title:String(decision.title||decision.text||'Выбор'),until:now+25000,job:j};delete s.job;return true;}
    const requested=commands.find(c=>c.kind==='request_number'&&j.payload.input.params.inputs[c.name]==null||c.kind==='request_targets'&&!j.payload.input.params.targetRequests[c.key]);
    if(requested){
      if(requested.kind==='request_number'){
        if(!requested.rollType){s.pending={id:id(),kind:'number',actor:j.entry.ownerId,key:requested.name,min:num(requested.min,0),max:num(requested.max,100000),until:now+25000,job:j};delete s.job;return true;}
        const lo=Number.isFinite(requested.min)?requested.min:1,hi=Number.isFinite(requested.max)?requested.max:20;if(!Number.isInteger(lo)||!Number.isInteger(hi)||lo>hi||hi-lo>100000)fail('Неверные границы Lua-броска');j.payload.input.params.inputs[requested.name]=lo+die(hi-lo+1)-1;delete j.lease;return true;
      }
      const owner=unit(j.entry.ownerId),origin=s.units.find(u=>u.id===requested.originId)||owner,candidates=s.units.filter(u=>u.mapId===s.mapId&&(!requested.alive||u.hpCurrent>0)&&(!u.playerId||requested.players)&&(!u.npcId||requested.npcs)&&(requested.includeSelf||u.id!==origin.id)&&(requested.relation==='any'||(u.teamId===origin.teamId)===(requested.relation==='ally'))&&distance(u,origin)<=num(requested.radius,Infinity)&&clear(map(),origin,u)).map(u=>u.id);if(!owner.playerId){j.payload.input.params.targetRequests[requested.key]=candidates.slice(0,requested.max);delete j.lease;return true;}s.pending={id:id(),kind:'targets',actor:owner.id,key:requested.key,candidates,min:num(requested.min,1),max:num(requested.max,1),until:now+25000,job:j};delete s.job;return true;
    }
    if(j.entry.ability)useAction(unit(j.entry.ownerId));
    const unsupported=commands.find(c=>!['log','sound','particle','request_number','request_targets','damage','heal','heal_injury','heal_injury_points','add_injury_points','set_injury_points','set_condition','set_position','move_to','reduce_damage','add_damage','set_damage','add_attack_bonus','add_defense_bonus','set_armor_penetration','ignore_absorption','add_modifier','apply_modifier','remove_modifier','standard_attack','restore_action','restore_reaction','break_item','damage_item','repair_item','spend_charges','spend_action','spend_reaction','spend_movement','restore_movement','source_data204','define_resource204','spend_resource204','restore_resource204','cancel_event204','reaction_debt204','add_credits','request_choice204','request_confirm204','request_checklist204','request_point204'].includes(c.kind));
    if(unsupported){s.error='Lua-команда пока не поддерживается вылазками: '+unsupported.kind;return false;}
    for(const c of commands){
      const target=s.units.find(u=>u.id===(c.targetId||c.unitId));
      if(c.kind==='define_resource204'&&target){target.resources204 ||= {};if(!target.resources204[c.key])target.resources204[c.key]={max:c.max,value:c.initial??c.max,reset:c.reset};}
      if(c.kind==='spend_resource204'&&target){const resource=target.resources204?.[c.key];if(!resource||resource.value<c.amount)fail('Недостаточно ресурса');resource.value-=c.amount;}
      if(c.kind==='restore_resource204'&&target){const resource=target.resources204?.[c.key];if(resource)resource.value=Math.min(resource.max,resource.value+num(c.amount,resource.max));}
      if(c.kind==='add_credits'&&target){const credits=num(target.profile.credits)+c.amount;if(!Number.isSafeInteger(credits)||credits<0)fail('Недопустимое изменение денег');target.profile.credits=credits;}
      if(c.kind==='reaction_debt204'&&target)target.reactionDebt=num(target.reactionDebt)+num(c.amount,1);
      if(c.kind==='cancel_event204'&&s.flow){s.flow.state.cancelled=true;s.flow.state.damage=0;if(s.flow.result)s.flow.result.hit=false;log(c.reason);}
      if(c.kind==='log')log(c.text);
      if(c.kind==='damage'&&target)damage(target,c.amount,c.damageType||'kinetic',c);
      if(c.kind==='heal'&&target)R.applyHeal(target,c.amount);
      if(c.kind==='heal_injury'&&target)T.treat(target,c.amount);
      if(c.kind==='heal_injury_points'&&target)T.healPoints(target,c.amount);
      if(c.kind==='add_injury_points'&&target)T.setPoints(target,T.ensure(target).injuryPoints+c.amount);
      if(c.kind==='set_injury_points'&&target)T.setPoints(target,c.amount);
      if(c.kind==='set_condition'&&target){target.conditionsV138[c.name]=c.enabled;if(c.name==='prone')target.proneV122=c.enabled;}
      if(['set_position','move_to'].includes(c.kind)&&target){const p=c.position||{x:c.x,y:c.y};if(!pointOK(s,p,target.id))fail('Lua перемещает в недоступную точку');if(target.carriedBy)release(unit(target.carriedBy));target.x=p.x;target.y=p.y;if(target.carrying){const other=unit(target.carrying);other.x=p.x;other.y=p.y;}}
      if(c.kind==='reduce_damage'&&s.flow)s.flow.state.damage=Math.max(0,s.flow.state.damage-num(c.amount));
      if(c.kind==='add_attack_bonus'&&s.flow)s.flow.state.attackBonus+=num(c.amount);
      if(c.kind==='add_defense_bonus'&&s.flow)s.flow.state.defenseBonus+=num(c.amount);
      if(c.kind==='set_armor_penetration'&&s.flow)s.flow.state.penetration=num(c.amount);
      if(c.kind==='ignore_absorption'&&s.flow){s.flow.state.ignoreAbsorption=num(c.amount);s.flow.state.ignorePercent=num(c.percent);}
      if(c.kind==='add_damage'&&s.flow)s.flow.state.damage+=num(c.amount);
      if(c.kind==='set_damage'&&s.flow)s.flow.state.damage=Math.max(0,num(c.amount));
      if(c.kind==='apply_modifier'&&target){for(const effect of arr(c.effects))(target.modifiers ||= []).push({id:c.modifierId||id(),name:c.name,target:effect.property||effect.target,op:effect.operation||effect.op||'add',value:effect.value,statRef:effect.statRef,enabled:true,expires:target.ownTurnV199+Math.max(1,num(c.duration))});}
      if(c.kind==='standard_attack'){s.attacks ||= [];if(s.attacks.length>8)fail('Слишком много вложенных атак');s.attacks.push(c);}
      if(c.kind==='restore_action'&&target)target.actionUsed=false;if(c.kind==='restore_reaction'&&target)target.reactionUsedV119=false;
      if(c.kind==='break_item'&&target){const w=item(target.profile.equipmentSlots?.[c.slot]),copy=w&&I.instance(target.profile,w.id,-1,c.slot);if(copy){copy.durability=0;copy.broken=true;}}
      if(c.kind==='add_modifier'&&target)(target.modifiers ||= []).push({...c.modifier,id:c.modifier?.id||id()});
      if(c.kind==='remove_modifier'&&target)target.modifiers=arr(target.modifiers).filter(x=>x.id!==c.modifierId);
      if(c.kind==='spend_action'&&target)target.actionUsed=true;if(c.kind==='spend_reaction'&&target)target.reactionUsedV119=true;
      if(c.kind==='spend_movement'&&target)target.movedThisTurn+=num(c.amount);if(c.kind==='restore_movement'&&target)target.movedThisTurn=Math.max(0,target.movedThisTurn-num(c.amount));
      if(c.kind==='spend_charges'&&target){const copy=runtimeCopy(target,c.slot===j.entry.source.id?j.entry.source.instanceId||c.slot:c.slot);if(!copy||copy.charges<num(c.amount))fail('Недостаточно зарядов');copy.charges-=num(c.amount);}
      if(c.kind==='damage_item'&&target){const slot=c.slot||c.itemSlot||'armor',copy=runtimeCopy(target,slot);if(copy?.durabilityMax){copy.durability=Math.max(0,copy.durability-num(c.amount));copy.broken=copy.durability===0;}}
      if(c.kind==='repair_item'&&target){const slot=c.slot||'armor',copy=runtimeCopy(target,slot);if(copy&&!copy.broken)copy.durability=Math.min(copy.durabilityMax,copy.durability+num(c.amount));}
      if(c.kind==='source_data204'){const u=unit(j.entry.ownerId),key=j.entry.source.kind+':'+j.entry.source.id;u.sourceData ||= {};u.sourceData[key] ||= {};u.sourceData[key][c.key]=c.value;}
    }
    if(j.entry.isReaction)unit(j.entry.ownerId).reactionUsedV119=true;
    delete s.job;delete s.error;if(j.entry.phase290==='start'&&has(j.entry.source,'OnAbilityExecuted')){makeJob({...j.entry,hook:'OnAbilityExecuted',phase290:'execute',ability:false,abilityReserved:true,params:{...j.payload.input.params,attacker:j.payload.input.params.attackerId,target:j.payload.input.params.targetId,targets:j.payload.input.params.targetIds}},now);}else drain(now);return true;
  }
  function profiles(){const out={};for(const u of s.units.filter(u=>u.playerId)){const p=clone(u.profile);p.weaponMagazines ||= {};for(const slot of ['primaryWeapon','secondaryWeapon']){const w=weapon(u,slot),copy=I.instance(u.profile,w.id,-1,slot);if(copy?.magazine)p.weaponMagazines[w.id]=clone(copy.magazine);}p.stats={...p.stats,hpCurrent:u.hpCurrent,hpMax:u.hpMax};p.traumaV195=clone(T.ensure(u));p.dead229=!!u.dead229;p.combatState093={...p.combatState093,schema:1,dead:!!u.dead229,ownTurn:u.ownTurnV199,conditions:clone(u.conditionsV138),critical:clone(u.critical229||null),loseNextAction:!!u.loseNextAction093,control:clone(u.control||null)};if(s.phase==='running'||s.phase==='rewards'&&s.rewardsEligible.includes(u.id)&&!s.rewardsDone?.includes(u.id))p.raidLock290=s.id;else delete p.raidLock290;out[u.id]=p;}return out;}
  return{item,stats,map,unit,current,die,computed,weapon,expression,place,reorder,begin,end,command,tick,drain,event,damage,jobResult,profiles,aberrate,log,speed,sources,validateSources};
}
function view(s,actor,now){
  const e=engine(s,()=>0,()=>''),mine=s.units.find(u=>u.id===actor),map=s.mission.maps.find(m=>m.id===s.mapId),party=s.units.filter(u=>u.playerId&&u.mapId===s.mapId&&!u.dead229&&u.hpCurrent>0&&!u.conditionsV138.unconscious);
  const visible=u=>u.mapId===s.mapId&&(u.playerId||party.some(p=>distance(u,p)<=num(e.computed(p).values.vision,6)&&clear(map,p,u)));
  const units=s.units.filter(visible).map(u=>({id:u.id,name:u.name,playerId:u.playerId,x:u.x,y:u.y,hpCurrent:u.hpCurrent,hpMax:u.hpMax,dead229:u.dead229,conditions:u.conditionsV138,carrying:u.carrying,carriedBy:u.carriedBy,searched:u.searched,actionUsed:u.actionUsed,reactionUsed:u.reactionUsedV119,moveRemaining:Math.max(0,num(u.budget)-num(u.movedThisTurn)),injury:T.ensure(u).injuryPoints}));
  const pending=s.pending?.actor===actor?{id:s.pending.id,kind:s.pending.kind,options:s.pending.options,candidates:s.pending.candidates,max:s.pending.max,min:s.pending.min,title:s.pending.title,until:s.pending.until}:s.pending?{kind:'waiting',until:s.pending.until}:null;
  return {id:s.id,week:s.week,revision:s.revision,phase:s.phase,mission:{id:s.mission.id,name:s.mission.name,reward:s.mission.reward,goals:s.mission.goals},map:{id:map.id,name:map.name,width:map.width,height:map.height,backgroundImage:map.backgroundImage,assets:arr(map.assets).filter(a=>a.visibleToPlayers!==false&&!a.hidden),templates:arr(map.templates).filter(z=>z.visibleToPlayers!==false||z.raidZone290)},units,me:mine?{profile:mine.profile,weapons:['primaryWeapon','secondaryWeapon'].map(slot=>({slot,...e.weapon(mine,slot)})),abilities:e.sources(mine).filter(x=>/function\s+(?:OnAbilityExecuted|OnAbilityPhaseStart)\s*\(/.test(x.luaScript)&&x.activationType!=='reaction').map(x=>({id:x.id,name:x.name}))}:null,pending,turnActor:s.phase==='rewards'?s.rewardOrder[s.rewardTurn]:s.order[s.turn],round:s.round,deadline:s.deadline,remainingTurn:s.remainingTurn,evac:s.evac,goals:s.goals,success:s.success,rewardItems:s.rewardItems,log:s.log.slice(-70),error:s.error,serverNow:now};
}
module.exports={week,validate,create,engine,view,inside,blockers,path};
