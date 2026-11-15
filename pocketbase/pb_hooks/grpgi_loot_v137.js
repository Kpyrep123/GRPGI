function jsonField(record,name){return JSON.parse(record.getString(name)||'{}');}
function transfer(e){
  const b=e.requestInfo().body||{}, campaign=String(b.campaignId||''),playerId=String(b.playerId||''),operation=String(b.operationId||''),loot=b.lootTransferV137||{};
  const itemId=String(loot.itemId||''),qty=Number(loot.qty),source=String(loot.source||'');
  if(!campaign||!playerId||!itemId||!source||source.length>512||!Number.isSafeInteger(qty)||qty<1||qty>10000||!/^[-a-zA-Z0-9_]{8,120}$/.test(operation))throw new BadRequestError('Некорректная передача добычи.');
  const rolls=loot.aberrations;
  if(rolls!==undefined&&(!Array.isArray(rolls)||rolls.length!==qty||rolls.some(roll=>!validRoll(roll))))throw new BadRequestError('Некорректные аберрации добычи.');
  const identity=[playerId,itemId,qty,source];
  if(rolls!==undefined)identity.push(rolls);
  const fingerprint=$security.sha256(JSON.stringify(identity));
  let result;
  $app.runInTransaction((tx)=>{
    const record=tx.findFirstRecordByFilter('campaign_players','campaignId={:campaign} && playerId={:player}',{campaign,player:playerId});
    if(!tx.canAccessRecord(record,e.requestInfo(),record.collection().updateRule))throw new ForbiddenError('Нет права изменять этого игрока.');
    const snapshots=tx.findRecordsByFilter('campaign_snapshots','campaignId={:campaign}','-revision',1,0,{campaign});
    const snapshot=snapshots[0];
    // Giving loot is a GM action: require the existing campaign/world write rule too.
    if(!snapshot||!tx.canAccessRecord(snapshot,e.requestInfo(),snapshot.collection().updateRule))throw new ForbiddenError('Нет права выдавать добычу в этой кампании.');
    const previous=new DynamicModel({fingerprint:'',player:''});
    let found=false;
    try{tx.db().newQuery('SELECT fingerprint, player FROM grpgi_loot_operations_v137 WHERE campaign={:campaign} AND operation={:operation}').bind({campaign,operation}).one(previous);found=true;}catch(error){if(!String(error).includes('no rows'))throw error;}
    if(found){
      if(previous.fingerprint!==fingerprint)throw new BadRequestError('Идентификатор передачи уже использован с другими данными.');
      result={ok:true,status:'replayed',row:record};return;
    }
    if(record.getString('deletedAt')){result={ok:false,status:'rejected',message:'Игрок удалён.',remote:record};return;}
    const player=jsonField(record,'playerJson'),world=jsonField(snapshot,'worldJson');
    if(String(player.role||'player').toLowerCase()!=='player'){result={ok:false,status:'rejected',message:'Получатель не является игроком.',remote:record};return;}
    const rules=require(__hooks+'/grpgi_loot_core_v137.js').engine(world);
    const item=rules.equipment(itemId);
    if(!item||item.type==='stock'){result={ok:false,status:'rejected',message:'Предмет отсутствует в снаряжении кампании.',remote:record};return;}
    if(rolls&&item.type!=='weapon')throw new BadRequestError('Аберрации добычи доступны только оружию.');
    const check=rules.canAdd(player,itemId,qty);
    if(!check.ok){result={ok:false,status:'capacity',message:check.reason,remote:record};return;}
    const migrated=rules.normalizePlayer(player);
    player.inventory=migrated.inventory;player.textInventoryItems=migrated.textInventoryItems;
    if(item.legacyTextOnlyInventoryV131){
      player.textInventoryItems.push({name:item.name||itemId,qty});
    }else{
      const copies=require(__hooks+'/item-instances-v215.js');
      const inventory=player.inventory;
      let entry=inventory.find(row=>row.itemId===itemId);
      if(!entry){entry={itemId,qty:0,positions:[]};inventory.push(entry);}
      const newId=()=> 'item:'+ $security.randomString(24);
      // Restore old rows that predate instance IDs before appending new copies.
      copies.normalize(player,rules.equipment);
      const offset=entry.qty;
      copies.add(entry,qty,item,newId);
      for(const [index,roll] of (rolls||[]).entries()){
        if(roll){const copy=entry.instancesV215[offset+index];copy.aberration252=roll;copy.rarity=roll.rarity==='common'?'обычный':roll.rarity;}
      }
    }
    const now=new Date().toISOString();
    // The small profile receipt supports the normal v135 lost-response reconciliation.
    // The SQL ledger is authoritative and is never pruned when the profile is edited.
    const receipts=player.__syncReceiptsV135||{};receipts[operation]=now;
    player.__syncReceiptsV135=Object.fromEntries(Object.entries(receipts).slice(-256));
    record.set('playerJson',player);record.set('version',record.getInt('version')+1);
    record.set('updatedBy',String(b.updatedBy||'combat-loot'));record.set('clientUpdatedAt',now);
    tx.save(record);
    tx.db().newQuery('INSERT INTO grpgi_loot_operations_v137(campaign,operation,fingerprint,player,created) VALUES({:campaign},{:operation},{:fingerprint},{:player},{:created})').bind({campaign,operation,fingerprint,player:playerId,created:now}).execute();
    result={ok:true,status:'committed',row:record};
  });
  return e.json(200,result);
}
function validRoll(roll){
  if(roll===null)return true;
  const limits={common:[0,0],uncommon:[1,3],rare:[4,5],epic:[6,7],legendary:[8,8]};
  if(!roll||!Object.prototype.hasOwnProperty.call(limits,roll.rarity))return false;
  const [min,max]=limits[roll.rarity];
  return Number.isInteger(roll.budget)&&roll.budget>=min&&roll.budget<=max&&Array.isArray(roll.effects)
    &&(roll.rarity==='common'?roll.effects.length===0:roll.effects.length>=1&&roll.effects.length<=3)
    &&roll.effects.every(id=>typeof id==='string'&&/^weapon-(?:[1289]-[1-6]|[3]-[1-3]|4-[1-5]|10-[1-3]|(?:13|16)-1)$/.test(id))
    &&new Set(roll.effects.map(id=>id.slice(0,id.lastIndexOf('-')))).size===roll.effects.length;
}
module.exports={transfer};
