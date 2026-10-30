/* Shared damage classification; weapon handling categories remain independent. */
(function(root){
  'use strict';
  const labels=Object.freeze({explosive:'Взрывной',kinetic:'Кинетический',energy:'Энергетический',electric:'Электрический',gas:'Газ'});
  const aliases={explosive:'explosive','взрывной':'explosive',kinetic:'kinetic','кинетический':'kinetic',energy:'energy','энергетический':'energy',electric:'electric',electrical:'electric','электрический':'electric',gas:'gas','газ':'gas'};
  function normalize(value,fallback=''){const key=String(value||'').trim().toLowerCase();return Object.prototype.hasOwnProperty.call(aliases,key)?aliases[key]:fallback;}
  function effective(item={},ammo=null){return normalize(ammo?.damageType)||normalize(item?.damageType)||(String(item?.weaponCategory).toLowerCase()==='energy'?'energy':String(item?.type).toLowerCase()==='grenade'?'explosive':'kinetic');}
  function label(value){return labels[normalize(value)]||'Не задан';}
  const api=Object.freeze({labels,normalize,effective,label});root.GRPGDamageTypesV202=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
