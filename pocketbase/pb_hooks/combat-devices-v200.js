/* Operator-owned device commands. No implant IDs or Lua policy are embedded here. */
(function(root){
  'use strict';
  const device=t=>['drone','turret'].includes(String(t?.equipmentType||t?.type||'').toLowerCase());
  const epoch=(operator,session)=>`${session?.battleId||session?.narrativeId||'standard'}:${operator?.id}:${Number(operator?.ownTurnV199)||0}`;
  function ledger(operator,key){
    const saved=operator?.droneControlV200?.epoch===key?operator.droneControlV200:{};
    return {...saved,epoch:key,simpleDeviceId:saved.simpleDeviceId||'',
      complexDeviceIds:Array.isArray(saved.complexDeviceIds)?saved.complexDeviceIds:saved.complexDeviceId?[saved.complexDeviceId]:[],
      droneActionsUsed:Math.max(0,Math.trunc(Number(saved.droneActionsUsed)||0))};
  }
  const maximum=operator=>Math.max(0,Math.trunc(Number(operator?.droneActions)||0));
  const remaining=(operator,key)=>Math.max(0,maximum(operator)-ledger(operator,key).droneActionsUsed);
  function reason(operator,unit,kind,key){
    if(!device(unit))return 'Устройство не найдено';
    if(!['simple','complex','dash'].includes(kind))return 'Неизвестная команда';
    if(!operator||Number(operator.hpCurrent)<=0)return 'Оператор не способен управлять';
    if(Number(unit.hpCurrent)<=0||unit.destroyedV200)return 'Устройство отключено или уничтожено';
    const used=ledger(operator,key),id=String(unit.id);
    if(kind==='simple'&&unit.equipmentType==='turret')return 'Турель не перемещается';
    if(kind==='dash'&&unit.equipmentType==='turret')return 'Турель не выполняет Рывок';
    if(kind==='simple'&&used.simpleDeviceId)return 'Простая команда уже использована';
    if(kind!=='simple'&&used.complexDeviceIds.includes(id))return 'Устройство уже получило сложную команду';
    if((kind==='simple'&&used.complexDeviceIds.includes(id))||(kind!=='simple'&&used.simpleDeviceId===id))return 'Простая и сложная команды направляются разным устройствам';
    if(kind!=='simple'&&!remaining(operator,key)&&operator.actionUsed)return 'Действие оператора уже потрачено';
    if(unit.burstStateV122)return 'Сначала завершите очередь устройства';
    return '';
  }
  function issue(operator,unit,kind,key,round){
    const problem=reason(operator,unit,kind,key);if(problem)throw Error(problem);
    const used=ledger(operator,key);
    let cost='free';
    if(kind==='simple')used.simpleDeviceId=String(unit.id);
    else{
      used.complexDeviceIds=[...used.complexDeviceIds,String(unit.id)];
      if(remaining(operator,key)>0){used.droneActionsUsed++;cost='droneAction';}
      else{operator.actionUsed=true;cost='action';}
    }
    operator.droneControlV200=used;
    if(unit.deviceEpochV200!==key){unit.movedThisTurn=0;unit.actionUsed=false;unit.deviceOperationUsedV200=false;unit.deviceEpochV200=key;}
    unit.droneCommandV129={operatorTokenId:operator.id,epochV200:key,kindV200:kind,costV225:cost,round,moduleUsed:false,completed:false,returnOnly:false,movementClosedV200:false};
    return unit.droneCommandV129;
  }
  function movementAllowed(unit,command){return Boolean(command&&!command.completed&&!command.movementClosedV200&&unit.equipmentType!=='turret');}
  function operationAllowed(unit,command){return Boolean(command&&!command.completed&&command.kindV200==='complex'&&!command.moduleUsed&&!unit.deviceOperationUsedV200);}
  function finishOperation(unit){
    const command=unit.droneCommandV129;if(!command)return;
    command.moduleUsed=true;unit.deviceOperationUsedV200=true;
    // Movement can be before OR after the operation, never split around it.
    if(Number(unit.movedThisTurn)>0){command.movementClosedV200=true;command.completed=true;}
    if(unit.equipmentType==='turret')command.completed=true;
  }
  const api={maximum,remaining,device,epoch,ledger,reason,issue,movementAllowed,operationAllowed,finishOperation};
  root.GRPGCombatDevicesV200=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
