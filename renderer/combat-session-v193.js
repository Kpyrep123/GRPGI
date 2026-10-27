/* Local combat identity and resource ownership; independent of map geometry. */
(function(root){
  'use strict';
  const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const rows=value=>Array.isArray(value)?value:[];
  const localFields=new Set(['x','y','w','h','rotation','hidden','locked','visibleToPlayers','sharesVisionWithPlayers','showNameToPlayers','blockMovement','blockSight','notes','color']);
  const budgets=['dashUsedV198','actionUsed','movedThisTurn','reactionUsedV119','burstStateV122','disengagedV122','freeDroneCommandUsedV129','droneCommandV129'];
  function identity(token,mapId){return token.playerId?'player:'+token.playerId:String(token.participantId193||'instance:'+mapId+':'+token.id);}
  function state(token){return Object.fromEntries(Object.entries(copy(token)).filter(([key])=>!localFields.has(key)));}
  function place(actor,token){return {...copy(actor),...Object.fromEntries(Object.entries(copy(token)).filter(([key])=>localFields.has(key)))};}
  function remap(value,ids){
    if(typeof value==='string')return ids[value]||value;
    if(Array.isArray(value))return value.map(v=>remap(v,ids));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v,ids)]));
    return value;
  }
  function register(session,token,mapId){
    const pid=identity(token,mapId);token.participantId193=pid;
    if(!session.participants[pid])session.participants[pid]=state(token);
    return pid;
  }
  function create(mapId,runtime,mode,makeId){
    const session={version:193,narrativeId:makeId('episode'),battleId:mode==='combat'||runtime.battleStarted191?makeId('battle'):'',activeMapId:mapId,mapIds:[mapId],participants:{},order:[],round:1,turnTokenId:'',mode};
    for(const token of rows(runtime.tokens))token.initiativeBattle193=session.battleId;
    capture(session,mapId,runtime,mode);return session;
  }
  function capture(session,mapId,runtime,mode){
    if(!session||session.activeMapId!==mapId)return;
    for(const token of rows(runtime.tokens)){
      const pid=register(session,token,mapId);
      session.participants[pid]=state(token);
    }
    session.order=rows(runtime.initiativeOrder).slice();session.round=Math.max(1,Number(runtime.round)||1);
    session.turnTokenId=session.order[runtime.turnIndex]||'';session.mode=mode;
    session.pendingTurnStart193=String(runtime.pendingTurnStart193||'');
    session.started=runtime.battleStarted191===true||mode==='combat';
    session.pausedBudget191=copy(runtime.pausedBudget191||null);
  }
  function project(session,mapId,runtime){
    const ids={};
    runtime.tokens=rows(runtime.tokens).map(token=>{
      const actor=session.participants[identity(token,mapId)];if(!actor)return token;
      if(token.id!==actor.id)ids[token.id]=actor.id;
      return place(actor,token);
    });
    // Token IDs stay stable through transfer; rewrite prepared map references to replaced placeholders.
    if(Object.keys(ids).length){runtime.tokens=runtime.tokens.map(t=>remap(t,ids));runtime.thinkersV125=rows(runtime.thinkersV125).map(t=>remap(t,ids));}
    return ids;
  }
  function transfer(session,mapId,runtime){
    const seen=new Set();
    for(const token of rows(runtime.tokens)){
      const pid=identity(token,mapId);if(seen.has(pid))throw Error('На карте два токена одного участника');seen.add(pid);
    }
    project(session,mapId,runtime);
    const existingOrder=session.order.slice();
    for(const token of rows(runtime.tokens)){
      const pid=register(session,token,mapId);Object.assign(token,place(session.participants[pid],token));
      if(Number(token.hpCurrent)>0&&!['drone','turret'].includes(token.equipmentType)&&!existingOrder.includes(token.id))existingOrder.push(token.id);
    }
    session.mapIds=[...new Set([...rows(session.mapIds),mapId])];
    session.activeMapId=mapId;session.order=existingOrder;
    runtime.round=session.round;runtime.initiativeOrder=existingOrder.slice();runtime.turnIndex=Math.max(0,existingOrder.indexOf(session.turnTokenId));
    runtime.pendingTurnStart193=session.pendingTurnStart193||'';
    runtime.battleStarted191=session.started;runtime.pausedBudget191=copy(session.pausedBudget191);
    return session.mode;
  }
  function reset(session,kind,makeId){
    if(kind==='scene')session.narrativeId=makeId('episode');
    session.battleId=kind==='battle'?makeId('battle'):'';
    session.mode=kind==='battle'?'combat':'standard';session.started=kind==='battle';
    session.pendingTurnStart193='';session.order=[];session.round=1;session.turnTokenId='';session.pausedBudget191=null;
    for(const actor of Object.values(session.participants)){
      actor.initiativeBattle193='';
      for(const key of budgets)actor[key]=key==='movedThisTurn'?0:['burstStateV122','droneCommandV129'].includes(key)?null:false;
      actor.usage193={...(actor.usage193||{}),battle:{},...(kind==='scene'?{scene:{}}:{})};
      actor.timedModifiersV122=rows(actor.timedModifiersV122).filter(m=>m.resetScope193!=='battle'&&(kind!=='scene'||m.resetScope193!=='scene'));
    }
  }
  function order(session,runtime,resetTurn=false){
    const current=runtime.initiativeOrder?.[runtime.turnIndex]||session.turnTokenId;
    const placed=rows(runtime.tokens),states=new Map(Object.values(session.participants).map(t=>[t.id,t]));
    placed.forEach(t=>states.set(t.id,t));
    let ids=resetTurn?placed.map(t=>t.id):[...new Set([...session.order,...rows(runtime.initiativeOrder),...placed.map(t=>t.id)])];
    ids=ids.filter(id=>Number(states.get(id)?.hpCurrent)>0&&!['drone','turret'].includes(states.get(id)?.equipmentType)&&!rows(session.withdrawn194).includes(states.get(id)?.participantId193));
    ids.sort((a,b)=>(Number(states.get(b).initiative)||0)-(Number(states.get(a).initiative)||0)||String(states.get(a).name||'').localeCompare(String(states.get(b).name||''),'ru'));
    runtime.initiativeOrder=ids;runtime.turnIndex=resetTurn?0:Math.max(0,ids.indexOf(current));if(resetTurn)runtime.round=1;
    session.order=ids.slice();session.turnTokenId=ids[runtime.turnIndex]||'';
  }
  function forkMap(runtime,makeId){
    const ids=Object.fromEntries(rows(runtime.tokens).filter(t=>!t.playerId).map(t=>[t.id,makeId('token')]));
    const next=remap(copy(runtime),ids);
    for(const token of rows(next.tokens))if(!token.playerId)token.participantId193='';
    return next;
  }
  const api={identity,state,place,create,capture,register,project,transfer,reset,order,forkMap,budgets};
  root.GRPGCombatSessionV193=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
