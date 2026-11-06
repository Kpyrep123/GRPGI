migrate(function(app) {
  var auth = new Collection({
    name:"grpgi_credentials_v212", type:"auth",
    listRule:null, viewRule:null, createRule:null, updateRule:null, deleteRule:null, manageRule:null, authRule:null,
    passwordAuth:{enabled:false},
    authToken:{duration:2592000},
    fields:[
      {name:"campaignId",type:"text",required:true},
      {name:"playerId",type:"text",required:true},
      {name:"dm",type:"bool"}
    ],
    indexes:["CREATE UNIQUE INDEX idx_grpgi_credentials_v212 ON grpgi_credentials_v212 (campaignId, playerId)"]
  });
  // Preserve existing short passwords for login. New passwords have stricter API validation.
  app.save(auth);
  auth.fields.getByName("password").min = 1;
  app.save(auth);
  app.save(new Collection({
    name:"grpgi_recovery_v212",type:"base",listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null,
    fields:[
      {name:"campaignId",type:"text",required:true},{name:"playerId",type:"text",required:true},
      {name:"credentialId",type:"text",required:true},{name:"status",type:"text",required:true},
      {name:"requestedAt",type:"text"},{name:"approvedBy",type:"text"},
      {name:"tokenHash",type:"text"},{name:"expiresAt",type:"number"}
    ]
  }));
  var seen = {};
  function read(record, field) {
    var value = record.get(field);
    return JSON.parse(typeof value === "string" ? value : toString(value || "{}"));
  }
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== "object") return value;
    var result = {};
    Object.keys(value).forEach(function(key) {
      if (["pass","password","passwordHash","passwordConfirm", "__proto__", "constructor", "prototype"].indexOf(key) < 0) result[key] = clean(value[key]);
    });
    return result;
  }
  function remember(campaign, id, player) {
    if (!campaign || !id || !player || player.role === "guest" || seen[campaign + "|" + id]) return;
    var record = new Record(auth);
    record.set("email", $security.randomString(32) + "@credentials.invalid");
    record.set("campaignId", campaign);
    record.set("playerId", id);
    record.set("dm", String(player.role || "").toLowerCase() === "gm");
    // Missing credentials require DM-assisted recovery, never an empty password.
    record.setPassword(typeof player.pass === "string" && player.pass ? player.pass : $security.randomString(48));
    app.save(record);
    seen[campaign + "|" + id] = true;
  }
  // Versioned player rows are authoritative over old snapshots.
  app.findRecordsByFilter("campaign_players", "", "", 0, 0).forEach(function(row) {
    var player = read(row, "playerJson");
    if (!row.getString("deletedAt") && !player.__deleted)
      remember(row.getString("campaignId"), row.getString("playerId"), player);
  });
  app.findRecordsByFilter("campaign_snapshots", "", "", 0, 0).forEach(function(row) {
    var campaign = row.getString("campaignId"), world = read(row,"worldJson"), state = read(row,"stateJson");
    var templates = (world.players || {}).PLAYER_TEMPLATES || {};
    Object.keys(templates).forEach(function(id) { remember(campaign, id, (state.users || {})[id] || templates[id]); });
    Object.keys(state.users || {}).forEach(function(id) { remember(campaign, id, state.users[id]); });
    row.set("worldJson", clean(world)); row.set("stateJson", clean(state)); app.save(row);
  });
  app.findRecordsByFilter("campaign_players", "", "", 0, 0).forEach(function(row) {
    row.set("playerJson", clean(read(row,"playerJson"))); app.save(row);
  });
}, function() {
  throw new Error("Пароли нельзя восстановить из хешей. Откат выполняется из защищённой резервной копии сервера.");
});
