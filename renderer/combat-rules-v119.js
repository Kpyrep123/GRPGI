/* GRPGI v1.0.122 — manual tabletop rolls; this module never generates random values */
(function(root){
  'use strict';
  if(root.GRPGCombatRulesV119)return;

  const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const integer=(value,fallback=0)=>Math.trunc(number(value,fallback));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,number(value,min)));

  function normalizeDamageExpression(value=''){
    return String(value??'').trim().toLowerCase().replace(/[−–—]/g,'-').replace(/[дк]/g,'d').replace(/\s+/g,'');
  }
  function requiresManualDamage(value=''){
    const expression=normalizeDamageExpression(value);
    return /d\d+/i.test(expression)||!Number.isFinite(Number(expression));
  }
  function suggestedDamage(value=''){
    const expression=normalizeDamageExpression(value);
    return Number.isFinite(Number(expression))?Math.max(0,number(expression,0)):0;
  }
  function reduceDamage(rawDamage,damageReduction=0){
    const raw=Math.max(0,integer(Math.round(number(rawDamage,0)),0));
    const requested=Math.max(0,number(damageReduction,0));
    const absorbed=Math.min(raw,Math.max(0,Math.round(requested)));
    return {raw,reduction:requested,absorbed,applied:Math.max(0,raw-absorbed)};
  }
  function resolveManualAttack(options={}){
    const attackDie=clamp(integer(options.attackRoll,0),1,1000);
    const defenseDie=clamp(integer(options.defenseRoll,0),1,1000);
    const attackBonus=number(options.attackBonus,0),defenseBonus=number(options.defenseBonus,0);
    const attackTotal=attackDie+attackBonus,defenseTotal=defenseDie+defenseBonus;
    const critical=attackDie===20,fumble=attackDie===1,defenseCritical=defenseDie===20,defenseFumble=defenseDie===1;
    const hit=!fumble&&(critical||attackTotal>=defenseTotal);
    const rolledDamage=Math.max(0,number(options.damageRoll,0));
    const damageBonus=number(options.damageBonus,0);
    // Critical additions happen before armor and reactions. A natural defense 20
    // is halved by the scene pipeline only after those reductions.
    const rawDamage=hit?Math.max(0,Math.round(rolledDamage+damageBonus+(critical?1:0)+(defenseFumble?1:0))):0;
    const reduced=reduceDamage(rawDamage,options.damageReduction||0);
    return {hit,critical,fumble,defenseCritical,defenseFumble,attackDie,defenseDie,attackBonus,defenseBonus,attackTotal,defenseTotal,rolledDamage,damageBonus,rawDamage:reduced.raw,damageReduction:reduced.reduction,absorbed:reduced.absorbed,damageApplied:hit?reduced.applied:0};
  }
  function applyDamage(target,amount){
    if(!target||typeof target!=='object')return {before:0,after:0,applied:0};
    const before=Math.max(0,number(target.hpCurrent,target.hpMax||0));
    const requested=Math.max(0,integer(Math.round(number(amount,0)),0));
    const after=Math.max(0,before-requested);target.hpCurrent=after;
    if(after<=0){const conditions=target.conditionsV138&&typeof target.conditionsV138==='object'?target.conditionsV138:(target.conditionsV138={});conditions.dying=true;conditions.stabilized=false;conditions.unconscious=true;conditions.prone=true;target.proneV122=true;}
    return {before,after,applied:before-after};
  }
  function applyHeal(target,amount){
    if(!target||typeof target!=='object')return {before:0,after:0,applied:0};
    const before=Math.max(0,number(target.hpCurrent,0)),maximum=Math.max(before,number(target.hpMax,before));
    const after=Math.min(maximum,before+Math.max(0,integer(Math.round(number(amount,0)),0)));target.hpCurrent=after;
    if(after>0){const conditions=target.conditionsV138&&typeof target.conditionsV138==='object'?target.conditionsV138:(target.conditionsV138={});conditions.dying=false;conditions.stabilized=false;conditions.unconscious=false;}
    return {before,after,applied:after-before};
  }

  root.GRPGCombatRulesV119=Object.freeze({version:'1.0.122',normalizeDamageExpression,requiresManualDamage,suggestedDamage,reduceDamage,resolveManualAttack,applyDamage,applyHeal});
})(typeof window!=='undefined'?window:globalThis);
