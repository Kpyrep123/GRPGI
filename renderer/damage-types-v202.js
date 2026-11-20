/* Shared damage classification; weapon handling categories remain independent. */
(function(root){
  'use strict';
  const labels=Object.freeze({explosive:'Взрывной',kinetic:'Кинетический',energy:'Энергетический',electric:'Электрический',gas:'Газ'});
  const aberrationTypeIds=Object.freeze(['kinetic','energy','electric','explosive','gas']);
  const aliases={explosive:'explosive','взрывной':'explosive',kinetic:'kinetic','кинетический':'kinetic',energy:'energy','энергетический':'energy',electric:'electric',electrical:'electric','электрический':'electric',gas:'gas','газ':'gas'};
  function normalize(value,fallback=''){const key=String(value||'').trim().toLowerCase();return Object.prototype.hasOwnProperty.call(aliases,key)?aliases[key]:fallback;}
  function effective(item={},ammo=null){return normalize(ammo?.damageType)||normalize(item?.damageType)||(String(item?.weaponCategory).toLowerCase()==='energy'?'energy':String(item?.type).toLowerCase()==='grenade'?'explosive':'kinetic');}
  function label(value){return labels[normalize(value)]||'Не задан';}
  // Positive sources block a share of the remaining exposure. Explicit set
  // replaces the aggregate; signed debuffs retain their percentage-point meaning.
  function combineGasProtection(current,amount,replace=false){
    const bounded=value=>Math.max(0,Math.min(100,Number(value)||0));
    const before=bounded(current),next=Number(amount)||0;
    if(replace||next<=0)return bounded(replace?next:before+next);
    return bounded(before+(100-before)*bounded(next)/100);
  }
  const api=Object.freeze({combineGasProtection,labels,aberrationTypeIds,normalize,effective,label});root.GRPGDamageTypesV202=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
