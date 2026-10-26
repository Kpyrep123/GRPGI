/* Injury is a persistent stack, independent of healing and maximum health. */
(function(root){
  'use strict';
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const degree=v=>Math.max(0,Math.min(5,Math.trunc(num(v))));
  const mechanical=t=>['drone','turret'].includes(String(t?.equipmentType||t?.type||'').toLowerCase());
  function normalize(value={}){return {schema:195,degree:degree(value.degree),migrated:value.migrated===true};}
  function ensure(target){
    if(!target||typeof target!=='object')return normalize();
    if(target.traumaV195?.schema===195){target.traumaV195=normalize(target.traumaV195);target.injuriesV129=[];return target.traumaV195;}
    const legacy=Array.isArray(target.injuriesV129)?target.injuriesV129:[];
    const maximum=Math.max(1,num(target.hpMax,1)),missing=Math.max(0,maximum-Math.max(0,num(target.hpCurrent,maximum)));
    // Preserve the last known legacy degree once. Past healed damage cannot be reconstructed.
    const prior=legacy.length?Math.max(...legacy.map(row=>degree(row?.degree))):missing>0?Math.ceil(missing/maximum*5):0;
    target.traumaV195={schema:195,degree:mechanical(target)?0:degree(prior),migrated:true};
    target.injuriesV129=[];
    return target.traumaV195;
  }
  function add(target,hpLost){
    const injury=ensure(target),before=injury.degree;
    if(!mechanical(target))injury.degree=degree(before+Math.max(0,Math.round(num(hpLost))));
    return {before,after:injury.degree,added:injury.degree-before};
  }
  function treat(target,amount){
    const injury=ensure(target),before=injury.degree;
    injury.degree=degree(before-Math.max(0,Math.trunc(num(amount))));
    return {before,after:injury.degree,removed:before-injury.degree};
  }
  function effects(value){
    const d=typeof value==='object'?ensure(value).degree:degree(value);
    return {degree:d,checkPenalty:d===5?5:d===4?2:d===2||d===3?1:0,disadvantage:d===5,noReaction:d===4,noHeavyWeapon:d===3};
  }
  function speed(base,value){
    const d=effects(value).degree,n=Math.max(0,num(base));
    return d===5?(n>0?1:0):d===4?Math.floor(n/2):d===3?Math.ceil(n/2):d===2?Math.max(0,n-2):d===1?Math.max(0,n-1):n;
  }
  const api={normalize,ensure,add,treat,effects,speed,mechanical};root.GRPGCombatTraumaV195=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
