/* Injury is a persistent stack, independent of healing and maximum health. */
(function(root){
  'use strict';
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const degree=v=>Math.max(0,Math.min(5,Math.trunc(num(v))));
  const mechanical=t=>['drone','turret'].includes(String(t?.equipmentType||t?.type||'').toLowerCase());
  const points = value => Math.max(0, Math.min(10, Math.trunc(num(value))));
  function normalize(value={}) {
    const injuryPoints = value.injuryPoints == null
      ? points(degree(value.degree) * 2 + Math.max(0, Math.min(1, Math.trunc(num(value.remainder)))))
      : points(value.injuryPoints);
    // Degree and remainder remain derived compatibility fields for older callers.
    return {schema:195, injuryPoints, degree:Math.floor(injuryPoints / 2), remainder:injuryPoints % 2, migrated:value.migrated===true};
  }
  function ensure(target) {
    if(!target||typeof target!=='object')return normalize();
    if(target.traumaV195?.schema===195) {
      target.traumaV195=normalize(target.traumaV195);
    } else {
      const legacy=Array.isArray(target.injuriesV129)?target.injuriesV129:[];
      const prior=legacy.length?Math.max(...legacy.map(row=>degree(row?.degree))):0;
      target.traumaV195=normalize({degree:mechanical(target)?0:prior,migrated:true});
    }
    target.injuriesV129=[];
    return target.traumaV195;
  }
  function setPoints(target, amount) {
    const injury=ensure(target), before=injury.degree, beforePoints=injury.injuryPoints;
    Object.assign(injury, normalize({...injury, injuryPoints:mechanical(target)?0:amount}));
    return {before, after:injury.degree, beforePoints, afterPoints:injury.injuryPoints};
  }
  function add(target, hpLost) {
    const result=setPoints(target, ensure(target).injuryPoints + Math.max(0, Math.trunc(num(hpLost))));
    return {...result, added:result.after-result.before};
  }
  function healPoints(target, amount) {
    const result=setPoints(target, ensure(target).injuryPoints - Math.max(0, Math.trunc(num(amount))));
    return {...result, removed:result.before-result.after};
  }
  function treat(target, amount) {
    // The existing Lua HealInjury command continues to heal whole degrees.
    return healPoints(target, Math.max(0, Math.trunc(num(amount))) * 2);
  }
  function effects(value){
    const d=typeof value==='object'?ensure(value).degree:degree(value);
    return {degree:d,checkPenalty:d===5?5:d===4?2:d===2||d===3?1:0,disadvantage:d===5,noReaction:d===4,noHeavyWeapon:false};
  }
  function speed(base,value){
    const d=effects(value).degree,n=Math.max(0,num(base));
    return d===5?(n>0?1:0):d===4?Math.floor(n/2):d===3?Math.ceil(n/2):d===2?Math.max(0,n-2):d===1?Math.max(0,n-1):n;
  }
  const api={normalize,ensure,add,treat,setPoints,healPoints,effects,speed,mechanical};root.GRPGCombatTraumaV195=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
