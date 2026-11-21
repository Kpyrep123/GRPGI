/* Base attack characteristics; damage type is a separate field. */
(function(root){
  'use strict';
  const stats=Object.freeze({light:'dexterity',heavy:'endurance',melee:'strength',drone:'intelligence'});
  const labels=Object.freeze({light:'Лёгкое',heavy:'Тяжёлое',melee:'Ближний бой',drone:'Дроны / управляемые устройства'});
  const statLabels=Object.freeze({dexterity:'Ловкость',endurance:'Выносливость',strength:'Сила',intelligence:'Интеллект'});
  function normalize(value){const key=String(value||'').trim().toLowerCase();return Object.prototype.hasOwnProperty.call(stats,key)?key:'light';}
  function category(item={}){return ['drone','turret'].includes(String(item.type||item.equipmentType||'').toLowerCase())?'drone':normalize(item.weaponCategory);}
  function stat(item){return stats[category(item)];}
  const api=Object.freeze({stats,labels,statLabels,normalize,category,stat});root.GRPGWeaponHandlingV203=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
