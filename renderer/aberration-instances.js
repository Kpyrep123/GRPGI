/* Instance ownership used by NPC equipment, the forge and loot transfers. */
(function(root){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const rows=value=>Array.isArray(value)?value:[];
  function create(item, roll, makeId, random=null){
    const api=root.GRPGItemInstancesV215||(typeof require==='function'?require('./item-instances-v215.js'):null);
    const result=api.updateResources({id:makeId(),modifiers:[]},item);
    if(roll)api.storeAberration(result,item,roll);
    api.updateResources(result,item);
    if(random&&result.durabilityMax>0){
      result.durability=Math.max(1,Math.ceil(result.durabilityMax*(.25+.75*Math.max(0,Math.min(1,random())))));
      result.broken=false;
    }
    return result;
  }
  function spawn(profile,lookup,roll,makeId,random=Math.random){
    const api=root.GRPGItemInstancesV215||(typeof require==='function'?require('./item-instances-v215.js'):null);
    const inventory=copy(rows(profile.inventory));
    const equipmentSlots={...(profile.equipmentSlots||profile.loadout||{})};
    equipmentSlots.primaryWeapon ||= equipmentSlots.weapon||'';
    const slots=['primaryWeapon','secondaryWeapon','armor','backpack'];
    for(const itemId of new Set(slots.map(slot=>equipmentSlots[slot]).filter(Boolean))){
      const item=lookup(itemId);if(!item||!api.tracked(item))continue;
      const needed=slots.filter(slot=>equipmentSlots[slot]===itemId).length;
      let row=inventory.find(row=>row.itemId===itemId);
      if(!row){row={itemId,qty:0};inventory.push(row);}
      row.qty=Math.max(needed,Number(row.qty)||0);
    }
    const owner={id:makeId(),equipmentSlots,inventory};
    for(const row of inventory){
      const item=lookup(row.itemId);if(!item||!api.tracked(item))continue;
      row.instancesV215=Array.from({length:row.qty},()=>create(item,['weapon','armor'].includes(item.type)?roll(item,profile.dangerLevel):null,makeId,random));
    }
    api.normalize(owner,lookup,makeId);
    for(const row of inventory)for(const instance of rows(row.instancesV215))if(instance.slot&&['weapon','armor'].includes(lookup(row.itemId)?.type))instance.lootGuaranteed=true;
    return owner;
  }
  function snapshot(value){
    const result=copy(value);delete result.slot;
    // A transferred copy is owned by the destination, not by its old NPC.
    delete result.lootGuaranteed;
    return result;
  }
  function append(profile,item,incoming){
    if(!Array.isArray(incoming)||!incoming.length)throw Error('Не указаны экземпляры');
    const ids=new Set();
    const remember=instance=>{ids.add(instance.id);for(const attachment of rows(instance.attachments))remember(attachment.copy);};
    for(const row of rows(profile.inventory))for(const instance of rows(row.instancesV215))remember(instance);
    const accept=instance=>{
      if(!instance?.id||ids.has(instance.id))throw Error('Экземпляр уже находится у получателя');
      ids.add(instance.id);
      for(const attachment of rows(instance.attachments))accept(attachment.copy);
    };
    for(const instance of incoming)accept(instance);
    let row=rows(profile.inventory).find(row=>row.itemId===item.id);
    if(!row){row={itemId:item.id,qty:0,positions:[],instancesV215:[]};(profile.inventory||=[]).push(row);}
    row.instancesV215 ||= [];
    row.positions ||= [];
    for(const instance of incoming){row.instancesV215.push(snapshot(instance));row.positions.push(null);row.qty++;}
    return row;
  }
  function validRoll(roll){
    if(roll===null)return true;
    const catalog=root.GRPGAberrationCatalog||(typeof require==='function'?require('./aberration-catalog.js'):[]);
    const bands={common:[0,0],uncommon:[1,3],rare:[4,5],epic:[6,7],legendary:[8,8]};
    const band=roll&&bands[roll.rarity];
    if(!band||!Number.isSafeInteger(roll.budget)||!Array.isArray(roll.effects)||roll.effects.length>6)return false;
    if(!roll.forged&&(roll.budget<band[0]||roll.budget>band[1]))return false;
    if(roll.rarity==='common'&&roll.effects.length||roll.rarity!=='common'&&!roll.effects.length)return false;
    const groups=new Set();
    return roll.effects.every(id=>{
      if(typeof id!=='string')return false;
      const parts=id.split(':');if(parts.length>2)return false;
      const [base,type]=parts;
      const row=catalog.find(row=>row.variants.some(variant=>variant.id===base));
      if(!row||groups.has(row.id))return false;groups.add(row.id);
      if(['armor-20','armor-27'].includes(row.id))return ['kinetic','energy','electric','explosive','gas'].includes(type);
      if(row.id==='armor-28')return ['melee','ranged','any'].includes(type);
      if(row.id==='weapon-56')return ['energy','electric','explosive','gas'].includes(type);
      if(row.id==='weapon-5')return !type||type==='kinetic';
      return !type;
    });
  }
  function validCopies(incoming,qty){
    if(!Array.isArray(incoming)||incoming.length!==qty||JSON.stringify(incoming).length>1000000)return false;
    const ids=new Set();
    function valid(instance,depth){
      if(!instance||typeof instance.id!=='string'||instance.id.length>200||!instance.id||ids.has(instance.id)||depth>3)return false;
      ids.add(instance.id);
      if(instance.aberration252&&!validRoll(instance.aberration252))return false;
      for(const key of ['durability','durabilityMax','charges','chargesMax'])if(instance[key]!=null&&(!Number.isSafeInteger(instance[key])||instance[key]<0))return false;
      return rows(instance.attachments).length<=32&&rows(instance.attachments).every(row=>typeof row.itemId==='string'&&valid(row.copy,depth+1));
    }
    return incoming.every(instance=>valid(instance,0));
  }
  const api={create,spawn,snapshot,append,validRoll,validCopies};
  root.GRPGAberrationInstances=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
