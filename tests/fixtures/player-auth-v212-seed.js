migrate(function(app) {
 for (var name of ["campaign_players","campaign_snapshots"]) {
 var collection = new Collection({name:name,type:"base",listRule:"",viewRule:"",createRule:"",updateRule:"",deleteRule:null,fields:[
 {name:"campaignId",type:"text"},{name:"playerId",type:"text"},{name:"deletedAt",type:"text"},
 {name:"playerJson",type:"json"},{name:"worldJson",type:"json"},{name:"stateJson",type:"json"},{name:"version",type:"number"}]});
 app.save(collection);
 }
 for(var profile of [{id:"gm",role:"gm",pass:"dm-secret-123"},{id:"p",role:"player",pass:"1234"}]){
 var row=new Record(app.findCollectionByNameOrId("campaign_players"));
 row.set("campaignId","main"); row.set("playerId",profile.id); row.set("playerJson",profile); row.set("version",1);
 app.save(row);
 }
 var snapshot=new Record(app.findCollectionByNameOrId("campaign_snapshots"));
 snapshot.set("campaignId","main");snapshot.set("worldJson",{players:{PLAYER_TEMPLATES:{gm:{id:"gm",role:"gm",pass:"old-pass"}}}});snapshot.set("stateJson",{users:{p:{id:"p",pass:"old-pass"}}});app.save(snapshot);
});
