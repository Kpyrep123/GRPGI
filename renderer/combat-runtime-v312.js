/* Serializable, skill-independent combat contracts. */
(function(root){
  'use strict';
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,copy=v=>JSON.parse(JSON.stringify(v)),list=v=>Array.isArray(v)?v:[];
  function state(unit){return unit.luaCombat312 ||= {version:312,effects:[],prepared:[],shares:[],receipts:{}};}
  function restriction(unit,kind){return list(unit?.luaCombat312?.effects).some(e=>e.kind===kind&&e.uses!==0);}
  function consume(unit,kind){for(const e of list(unit?.luaCombat312?.effects))if(e.kind===kind&&e.uses>0)e.uses--;}
  function expire(unit,hook,actor,context){
    const s=state(unit),phase=hook.endsWith('Start')?'start':'end';
    const keep=row=>{
      if(row.uses===0)return false;
      const d=row.duration;if(!d)return true;
      if(d.scope==='scene')return d.createdScene===context.sceneId;
      if(d.scope==='battle')return d.createdBattle===context.battleId;
      if(d.scope==='manual')return true;
      if(d.phase!==phase)return true;
      if(d.scope==='turn'&&(!['OnTurnStart','OnTurnEnd'].includes(hook)||d.unitId!==actor?.id))return true;
      if(d.scope==='round'&&!['OnRoundStart','OnRoundEnd'].includes(hook))return true;
      const stamp=hook+':'+context.battleId+':'+(d.scope==='turn'?context.turn:context.round);
      if(d.last===stamp)return true;d.last=stamp;d.remaining--;return d.remaining>0;
    };
    s.effects=list(s.effects).filter(keep);s.prepared=list(s.prepared).filter(keep);s.shares=list(s.shares).filter(keep);
  }
  function receipt(unit,key){return key&&state(unit).receipts[key];}
  function remember(unit,key,value=true){if(!key)return;const rows=state(unit).receipts;rows[key]=value;const keys=Object.keys(rows),pending=Object.keys(state(unit).pendingBatches||{}),removable=keys.filter(k=>!pending.some(event=>k.startsWith(event+':')||k.startsWith('batch:'+event+':')));for(const old of removable.slice(0,Math.max(0,keys.length-512)))delete rows[old];}
  function resultRoll(roll){const total=num(roll.natural)+num(roll.bonus)+num(roll.bonusDelta);return {...roll,total,success:roll.dc==null?null:total>=num(roll.dc)};}
  function armorParts(raw,parts){let left=Math.max(0,num(raw));const result={};for(const key of ['cover','base','armor','shield']){const take=Math.min(left,Math.max(0,num(parts?.[key])));result[key]=take;left-=take;}return {sources:result,remaining:left};}
  function action(id,owner,spec={}){return {id,ownerId:owner.id,mode:spec.mode||'single',source:spec.source||'',plannedShots:Math.max(1,Math.trunc(num(spec.plannedShots,1))),shots:[],finished:false};}
  function shot(action,shot){if(!action.shots.some(row=>row.id===shot.id))action.shots.push(copy(shot));return action;}
  const api={num,copy,state,restriction,consume,expire,receipt,remember,resultRoll,armorParts,action,shot};root.GRPGCombatRuntimeV312=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
