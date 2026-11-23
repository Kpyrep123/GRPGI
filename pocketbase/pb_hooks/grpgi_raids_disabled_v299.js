'use strict';
// One startup cleanup only. Do not load the retired engine or execute pending jobs.
function bootstrap(e){
 e.next();const app=e.app;
 function exists(name){const row=new DynamicModel({name:''});try{app.db().newQuery("SELECT name FROM sqlite_master WHERE type='table' AND name={:name}").bind({name}).one(row);return !!row.name;}catch(error){if(String(error).includes('no rows'))return false;throw error;}}
 const attempts=exists('grpgi_raids_v290'),players=exists('campaign_players');if(!attempts&&!players)return;
 app.runInTransaction(tx=>{
  // Acquire the writer before reads, then preserve all snapshots byte-for-byte.
  if(attempts)tx.db().newQuery("UPDATE grpgi_raids_v290 SET status='suspended' WHERE status IN ('lobby','running','rewards')").execute();
  if(players)tx.db().newQuery("UPDATE campaign_players SET playerJson=json_remove(playerJson,'$.raidLock290'),version=COALESCE(version,0)+1,updatedBy='raids-disabled-v299',clientUpdatedAt={:now} WHERE json_valid(playerJson) AND json_type(playerJson,'$.raidLock290') IS NOT NULL").bind({now:new Date().toISOString()}).execute();
 });
}
module.exports={bootstrap};
