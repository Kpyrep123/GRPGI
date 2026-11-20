function jsonField(record,name){return JSON.parse(record.getString(name)||'{}');}
function transfer(e){
  const b=e.requestInfo().body||{}, campaign=String(b.campaignId||''),playerId=String(b.playerId||''),operation=String(b.operationId||''),loot=b.lootTransferV137||{};
  const itemId=String(loot.itemId||''),qty=Number(loot.qty),source=String(loot.source||'');
  if(!campaign||!playerId||!itemId||!source||source.length>512||!Number.isSafeInteger(qty)||qty<1||qty>10000||!/^[-a-zA-Z0-9_]{8,120}$/.test(operation))throw new BadRequestError('Некорректная передача добычи.');
  const rolls=loot.aberrations,copies=require(__hooks+'/item-instances-v215.js'),instances=require(__hooks+'/aberration-instances.js'),incoming=loot.copiesV287;
  if(incoming!==undefined&&!instances.validCopies(incoming,qty))throw new BadRequestError('Некорректные экземпляры добычи.');
  if(rolls!==undefined&&(!Array.isArray(rolls)||rolls.length!==qty||rolls.some(roll=>!validRoll(roll,copies))))throw new BadRequestError('Некорректные аберрации добычи.');
  const identity=[playerId,itemId,qty,source];
  if(rolls!==undefined)identity.push(rolls);
  if(incoming!==undefined)identity.push(incoming);
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
    if(rolls?.some(roll=>roll?.effects.some(id=>!copies.canRollAberration(item,id.split('-')[0])))){
      throw new BadRequestError('Аберрации не соответствуют типу предмета.');
    }
    if(incoming?.some(instance=>instance.aberration252?.effects.some(id=>!copies.canRollAberration(item,id.split('-')[0]))))throw new BadRequestError('Аберрации не соответствуют типу предмета.');
    const check=rules.canAdd(player,itemId,qty,rolls||incoming?.map(instance=>instance.aberration252));
    if(!check.ok){result={ok:false,status:'capacity',message:check.reason,remote:record};return;}
    const migrated=rules.normalizePlayer(player);
    player.inventory=migrated.inventory;player.textInventoryItems=migrated.textInventoryItems;
    if(item.legacyTextOnlyInventoryV131){
      player.textInventoryItems.push({name:item.name||itemId,qty});
    }else{
      const inventory=player.inventory;
      let entry=inventory.find(row=>row.itemId===itemId);
      if(!entry){entry={itemId,qty:0,positions:[]};inventory.push(entry);}
      const newId=()=> 'item:'+ $security.randomString(24);
      // Restore old rows that predate instance IDs before appending new copies.
      copies.normalize(player,rules.equipment);
      const offset=entry.qty;
      if(incoming){instances.append(player,item,incoming);}else copies.add(entry,qty,item,newId);
      for(const [index,roll] of (incoming?[]:rolls||[]).entries()){
        copies.storeAberration(entry.instancesV215[offset+index],item,roll);
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
function validRoll(roll){return require(__hooks+'/aberration-instances.js').validRoll(roll);}

module.exports={transfer};
