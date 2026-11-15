// Additive v137 hook. Install alongside the existing v135 player/market hooks.
onBootstrap((e)=>{
  e.next();
  $app.db().newQuery(`CREATE TABLE IF NOT EXISTS grpgi_loot_operations_v137 (
    campaign TEXT NOT NULL, operation TEXT NOT NULL, fingerprint TEXT NOT NULL,
    player TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(campaign, operation))`).execute();
});
routerAdd('POST','/api/grpgi/loot/transfer',(e)=>{
  const service=require(__hooks+'/grpgi_loot_v137.js');
  return service.transfer(e);
});
