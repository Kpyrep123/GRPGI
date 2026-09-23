// Preserve the state seen when the GM opened a player form.
(function(){
  const core=window.GRPGPlayerSyncCoreV135;
  PlayerSync._editorBaseV135=new Map();
  const render=Configurator.renderPlayerEditor.bind(Configurator);
  Configurator.renderPlayerEditor=function(player){
    if(player?.id)PlayerSync._editorBaseV135.set(player.id,core.clone(PlayerSync.projectedPlayerV135(player.id)));
    return render(player);
  };
  window.GRPGInventoryPendingV120={
    has:playerId=>PlayerSync._pendingV135.has(String(playerId||'')),
    hasAny:()=>PlayerSync._pendingV135.size>0
  };
})();
