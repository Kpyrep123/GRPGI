// Minimal stand-ins for legacy routes, used only in the disposable integration server.
routerAdd("POST", "/api/grpgi/character-applications/submit", function(e) {
  var data = new DynamicModel({campaignId:"",playerId:"",playerJson:{}});
  e.bindBody(data);
  var row = new Record(e.app.findCollectionByNameOrId("campaign_players"));
  row.set("campaignId", data.campaignId);
  row.set("playerId", data.playerId);
  row.set("playerJson", data.playerJson);
  e.app.save(row);
  return e.json(200, row);
});
routerAdd("POST", "/api/grpgi/players/mutate", function(e) { return e.json(200,{ok:true}); });
onRecordCreate(function(e) {
  var raw = e.record.get("playerJson");
  var profile = JSON.parse(typeof raw === "string" ? raw : toString(raw));
  if (profile.failSave) throw new BadRequestError("Fixture storage failure");
  return e.next();
}, "campaign_players");
