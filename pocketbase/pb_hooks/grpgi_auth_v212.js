"use strict";

var CREDENTIALS = "grpgi_credentials_v212";
var RECOVERY = "grpgi_recovery_v212";
var SECRET_KEYS = ["pass", "password", "passwordHash", "passwordConfirm", "__proto__", "constructor", "prototype"];
function json(record, field) {
  var value = record.get(field);
  return JSON.parse(typeof value === "string" ? value : toString(value || "{}"));
}
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;
  var result = {};
  Object.keys(value).forEach(function(key) {
    if (SECRET_KEYS.indexOf(key) < 0) result[key] = clean(value[key]);
  });
  return result;
}
function credential(app, campaign, player) {
  var rows = app.findRecordsByFilter(CREDENTIALS,
    "campaignId={:campaign} && playerId={:player}", "", 1, 0,
    {campaign: campaign, player: player});
  return rows[0] || null;
}
function createCredential(app, campaign, player, password, dm) {
  var record = new Record(app.findCollectionByNameOrId(CREDENTIALS));
  record.set("email", $security.randomString(32) + "@credentials.invalid");
    record.set("campaignId", campaign);
  record.set("playerId", player);
  record.set("dm", !!dm);
  record.setPassword(password || $security.randomString(48));
  app.save(record);
  return record;
}
function password(value) {
  var text = String(value || "");
  if (text.length < 8 || unescape(encodeURIComponent(text)).length > 72)
    throw new BadRequestError("Пароль должен содержать не меньше 8 символов и не больше 72 байт");
  return text;
}
function body(e) {
  var data = new DynamicModel({campaignId:"", playerId:"", password:"", token:"", requestId:""});
  e.bindBody(data);
  return data;
}
function rate(e, kind, identity, limit, seconds) {
  var key = $security.sha256(kind + "|" + (identity || e.realIP()));
  var bucket = Math.floor(Date.now() / (seconds * 1000));
  e.app.db().newQuery("CREATE TABLE IF NOT EXISTS grpgi_auth_limits_v212 (key TEXT PRIMARY KEY, bucket INTEGER, attempts INTEGER)").execute();
  e.app.db().newQuery("INSERT INTO grpgi_auth_limits_v212 (key,bucket,attempts) VALUES ({:key},{:bucket},1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN bucket={:bucket} THEN attempts+1 ELSE 1 END,bucket={:bucket}")
    .bind({key:key,bucket:bucket}).execute();
  var row = new DynamicModel({attempts:0});
  e.app.db().newQuery("SELECT attempts FROM grpgi_auth_limits_v212 WHERE key={:key}").bind({key:key}).one(row);
  if (row.attempts > limit) throw new TooManyRequestsError("Слишком много попыток. Повторите позже.");
}
function active(app, user) {
  var rows = app.findRecordsByFilter("campaign_players", "campaignId={:campaign} && playerId={:player}", "", 1, 0,
    {campaign:user.getString("campaignId"), player:user.getString("playerId")});
  if (rows.length) {
    var profile = json(rows[0], "playerJson");
    return !rows[0].getString("deletedAt") && !profile.__deleted &&
      ["pending","rejected"].indexOf(String(profile.approvalStatus || "")) < 0;
  }
  var snapshots = app.findRecordsByFilter("campaign_snapshots", "campaignId={:campaign}", "", 1, 0, {campaign:user.getString("campaignId")});
  if (!snapshots.length) return false;
  var world = json(snapshots[0], "worldJson"), state = json(snapshots[0], "stateJson"), id = user.getString("playerId");
  var profile = (state.users || {})[id] || ((world.players || {}).PLAYER_TEMPLATES || {})[id];
  return !!profile && !profile.__deleted && ["pending","rejected"].indexOf(String(profile.approvalStatus || "")) < 0;
}
function actor(e) {
  var token = String(e.request.header.get("X-GRPGI-Session") || "");
  var user;
  try { user = e.app.findAuthRecordByToken(token, "auth"); }
  catch (_) { throw new UnauthorizedError("Войдите в персонажа заново"); }
  if (user.collection().name !== CREDENTIALS || !active(e.app, user)) throw new UnauthorizedError("Неверная сессия персонажа");
  return user;
}
function gm(e, campaign) {
  var user = actor(e);
  if (!user.getBool("dm") || user.getString("campaignId") !== campaign)
    throw new ForbiddenError("Требуется сессия ДМа этой кампании");
  return user;
}
function login(e) {
  var data = body(e);
  rate(e, "login-ip", "", 30, 60);
  rate(e, "login", data.campaignId + "|" + data.playerId, 8, 60);
  var user = credential(e.app, data.campaignId, data.playerId);
  if (!user || !user.validatePassword(String(data.password)) || !active(e.app, user)) throw new UnauthorizedError("Неверный персонаж или пароль");
  return e.json(200, {ok:true, token:user.newAuthToken(), playerId:user.getString("playerId"), campaignId:user.getString("campaignId"), dm:user.getBool("dm")});
}
function session(e) {
  var user = actor(e);
  return e.json(200, {ok:true, playerId:user.getString("playerId"), campaignId:user.getString("campaignId"), dm:user.getBool("dm")});
}
// A dedicated authenticated route avoids depending on a legacy grant hook.
function grantCredits(e) {
  var data=e.requestInfo().body||{},admin=gm(e,String(data.campaignId||""));
  var amount=Number((data.creditGrantV138||{}).amount),operation=String(data.operationId||"");
  if(!Number.isSafeInteger(amount)||amount<=0||!operation||operation.length>100)throw new BadRequestError("Укажите положительное целое количество денег и идентификатор операции");
  var result;
  e.app.runInTransaction(function(app){
    var rows=app.findRecordsByFilter("campaign_players","campaignId={:campaign} && playerId={:player}","",1,0,{campaign:String(data.campaignId),player:String(data.playerId)});
    if(!rows.length||rows[0].getString("deletedAt"))throw new NotFoundError("Персонаж не найден");
    var row=rows[0],profile=json(row,"playerJson"),receipts=profile.__creditReceiptsV138||{};
    if(profile.__deleted)throw new NotFoundError("Персонаж удалён");
    if(receipts[operation]&&Number(receipts[operation].amount)!==amount)throw new BadRequestError("Идентификатор уже использован для другой суммы");
    if(!receipts[operation]){
      var balance=Number(profile.credits||0)+amount;
      if(!isFinite(balance)||Math.abs(balance)>Number.MAX_SAFE_INTEGER)throw new BadRequestError("Превышен допустимый баланс");
      profile.credits=balance;receipts[operation]={amount:amount,at:new Date().toISOString(),by:admin.getString("playerId")};profile.__creditReceiptsV138=receipts;
      row.set("playerJson",clean(profile));row.set("version",row.getFloat("version")+1);row.set("updatedBy","credit-grant-v213");row.set("clientUpdatedAt",new Date().toISOString());app.save(row);
    }
    result=row.publicExport();
  });
  return e.json(200,{ok:true,status:"granted",row:result});
}
function request(e) {
  var data = body(e);
  rate(e, "request-ip", "", 10, 900);
  rate(e, "request", data.campaignId + "|" + data.playerId, 3, 900);
  var user = credential(e.app, data.campaignId, data.playerId);
  if (user && !user.getBool("dm")) e.app.runInTransaction(function(app) {
    var existing = app.findRecordsByFilter(RECOVERY, "credentialId={:id} && status='pending'", "", 1, 0, {id:user.id});
    if (existing.length) return;
    var row = new Record(app.findCollectionByNameOrId(RECOVERY));
    row.set("credentialId", user.id);
    row.set("campaignId", data.campaignId);
    row.set("playerId", data.playerId);
    row.set("status", "pending");
    row.set("requestedAt", new Date().toISOString());
    app.save(row);
  });
  return e.json(200, {ok:true, message:"Если персонаж существует, запрос передан ДМу"});
}
function requests(e) {
  var campaign = String(e.request.url.query().get("campaignId") || "");
  gm(e, campaign);
  var rows = e.app.findRecordsByFilter(RECOVERY, "campaignId={:campaign} && (status='pending' || status='approved')", "-requestedAt", 100, 0, {campaign:campaign});
  return e.json(200, {ok:true, requests:rows.map(function(row) {
    return {id:row.id, playerId:row.getString("playerId"), status:row.getString("status"), requestedAt:row.getString("requestedAt")};
  })});
}
function approve(e) {
  var data = body(e), admin = gm(e, data.campaignId), token = $security.randomString(48);
  e.app.runInTransaction(function(app) {
    var row = app.findRecordById(RECOVERY, data.requestId);
    if (row.getString("campaignId") !== data.campaignId || ["pending","approved"].indexOf(row.getString("status")) < 0)
      throw new BadRequestError("Запрос уже завершён");
    var user = app.findRecordById(CREDENTIALS, row.getString("credentialId"));
    if (user.getBool("dm")) throw new ForbiddenError("Восстановление ДМа выполняет администратор сервера");
    app.findRecordsByFilter(RECOVERY, "credentialId={:id} && status='approved'", "", 0, 0, {id:user.id}).forEach(function(previous) {
      if (previous.id === row.id) return;
      previous.set("tokenHash", "");
      previous.set("status", "revoked");
      app.save(previous);
    });
    row.set("tokenHash", $security.sha256(token));
    row.set("expiresAt", Date.now() + 30 * 60 * 1000);
    row.set("approvedBy", admin.getString("playerId"));
    row.set("status", "approved");
    app.save(row);
  });
  // Only this response contains the bearer secret. Reapproval rotates it.
  var base = String($os.getenv("GRPGI_WEB_URL") || "https://app.grpg-sync.ru/app/");
  if (!/^https:\/\//.test(base) || base.indexOf("#") >= 0) throw new InternalServerError("Неверный GRPGI_WEB_URL");
  return e.json(200, {ok:true, url:base + "#recover=" + token, expiresIn:1800});
}
function reject(e) {
  var data = body(e), admin = gm(e, data.campaignId);
  e.app.runInTransaction(function(app) {
    var row = app.findRecordById(RECOVERY, data.requestId);
    if (row.getString("campaignId") !== data.campaignId) throw new ForbiddenError();
    if (["pending","approved"].indexOf(row.getString("status")) < 0) throw new BadRequestError("Запрос уже завершён");
    row.set("status", "rejected");
    row.set("approvedBy", admin.getString("playerId"));
    row.set("tokenHash", "");
    app.save(row);
  });
  return e.json(200, {ok:true});
}
function confirm(e) {
  var data = body(e), next = password(data.password);
  rate(e, "confirm", "", 10, 900);
  if (!/^[A-Za-z0-9]{48}$/.test(data.token)) throw new BadRequestError("Ссылка недействительна или истекла");
  e.app.runInTransaction(function(app) {
    var rows = app.findRecordsByFilter(RECOVERY, "tokenHash={:hash} && status='approved'", "", 1, 0, {hash:$security.sha256(data.token)});
    var row = rows[0];
    if (!row || row.getFloat("expiresAt") <= Date.now()) throw new BadRequestError("Ссылка недействительна или истекла");
    var user = app.findRecordById(CREDENTIALS, row.getString("credentialId"));
    user.setPassword(next);
    user.refreshTokenKey();
    app.save(user);
    app.findRecordsByFilter(RECOVERY, "credentialId={:id} && (status='pending' || status='approved')", "", 0, 0, {id:user.id}).forEach(function(other) {
      other.set("tokenHash", "");
      other.set("status", other.id === row.id ? "used" : "revoked");
      app.save(other);
    });
  });
  return e.json(200, {ok:true});
}
// Runs inside the existing caller's transaction, including registration routes.
function protectPlayer(e, creating) {
  var originalApp = e.app;
  try {
    return originalApp.runInTransaction(function(app) {
    e.app = app;
    var profile = json(e.record, "playerJson");
    var campaign = e.record.getString("campaignId"), id = e.record.getString("playerId");
    var user = credential(e.app, campaign, id);
    if (creating && user && profile.pass) throw new BadRequestError("Персонаж уже существует");
    if (!user && (profile.__deleted || e.record.getString("deletedAt"))) {
      e.record.set("playerJson", clean(profile)); return e.next();
    }
    if (!user) {
      if (!creating) throw new BadRequestError("Нет учётной записи. Выполните миграцию паролей.");
      if (String(profile.role || "").toLowerCase() === "gm") throw new ForbiddenError("Создание ДМа выполняет администратор сервера");
      createCredential(e.app, campaign, id, profile.pass ? password(profile.pass) : "", false);
    }
    if (!creating) {
      var old = e.record.original();
      if (old.getString("campaignId") !== campaign || old.getString("playerId") !== id) throw new ForbiddenError("Нельзя менять идентификатор учётной записи");
    }
    profile = clean(profile);
    profile.id = id;
    var previousProfile = creating ? {id:id} : json(old, "playerJson");
    var previousInventory = Array.isArray(previousProfile.inventory) ? previousProfile.inventory : [];
    var incomingInventory = Array.isArray(profile.inventory) ? profile.inventory : [];
    var needsCopies = incomingInventory.some(function(row) {
      var before = previousInventory.find(function(candidate) { return candidate.itemId === row.itemId; });
      if (Array.isArray(row.instancesV215)) return row.instancesV215.length !== Number(row.qty);
      return !before || before.qty !== row.qty || Array.isArray(before.instancesV215);
    });
    if (needsCopies) {
      var snapshots = app.findRecordsByFilter("campaign_snapshots", "campaignId={:campaign}", "", 1, 0, {campaign:campaign});
      var world = snapshots.length ? json(snapshots[0], "worldJson") : {};
      var catalog = (world.equipment || {}).EQUIPMENT || {};
      var copies = require(__hooks + "/item-instances-v215.js");
      incomingInventory.forEach(function(row) {
        var qty = Number(row.qty);
        if ((copies.tracked(catalog[row.itemId]) || Array.isArray(row.instancesV215)) &&
            (!Number.isSafeInteger(qty) || qty < 0 || qty > 10000)) {
          throw new BadRequestError("Недопустимое количество экземпляров предмета");
        }
      });
      copies.reconcile(previousProfile, profile, function(itemId) { return catalog[itemId]; },
        function() { return "item:" + $security.randomString(24); });
    }
    if (profile.itemStateV138) {
      previousInventory.concat(incomingInventory).forEach(function(row) {
        if (Array.isArray(row.instancesV215)) delete profile.itemStateV138[row.itemId];
      });
    }
    // Role changes cannot promote a player into a recovery administrator.
    profile.role = user && user.getBool("dm") ? "gm" : "player";
    e.record.set("playerJson", profile);
    e.next();
    });
  } finally { e.app = originalApp; }
}
// Retired sessions must not keep writing through older, publicly callable routes.
function guard(e) {
  var method = String(e.request.method), path = String(e.request.url.path);
  if (["POST","PUT","PATCH","DELETE"].indexOf(method) < 0) return e.next();
  // The game uses individual transactional routes, not PocketBase batch writes.
  if (path === "/api/batch" && !e.requestInfo().hasSuperuserAuth()) throw new ForbiddenError("Используйте игровые маршруты записи");
  if (path.indexOf("/api/grpgi/auth-v212/") === 0 ||
      path === "/api/grpgi/stock-exchange-v148/tick") return e.next();
  if (path === "/api/grpgi/character-applications/submit") {
    rate(e, "registration", "", 10, 3600);
    var application = e.requestInfo().body || {};
    if (!application.campaignId || !application.playerId || !application.playerJson)
      throw new BadRequestError("Некорректная анкета");
    password(application.playerJson.pass);
    if (credential(e.app, String(application.campaignId), String(application.playerId)))
      throw new BadRequestError("Персонаж уже существует");
    return e.next();
  }
  var collection = /^\/api\/collections\/(campaign_players|campaign_snapshots|campaign_messages|campaign_combat_runtime)\/records(?:\/([^/]+))?$/.exec(path);
  if (path.indexOf("/api/grpgi/") !== 0 && !collection) return e.next();
  var user = actor(e), info = e.requestInfo(), data = info.body || {};
  var campaign = String(data.campaignId || data.campaign_id || "");
  var previous = null;
  if (collection && collection[2]) {
    previous = e.app.findRecordById(collection[1], collection[2]);
    campaign = previous.getString("campaignId");
    if (data.campaignId && data.campaignId !== campaign) throw new ForbiddenError("Нельзя менять кампанию записи");
  }
  if (campaign !== user.getString("campaignId")) throw new ForbiddenError("Сессия другой кампании");
  if (user.getBool("dm")) return e.next();
  var own = user.getString("playerId");
  if (collection) {
    if (collection[1] === "campaign_players" && previous && method === "PATCH" &&
        previous.getString("playerId") === own) return e.next();
    if (collection[1] === "campaign_messages" && method !== "DELETE" &&
        String(previous ? previous.getString("senderId") : data.senderId) === own) return e.next();
    throw new ForbiddenError("Операция доступна ДМу");
  }
  var allowed = ["/api/grpgi/players/mutate","/api/grpgi/market/transaction","/api/grpgi/market/transaction-v139",
    "/api/grpgi/stock-exchange-v148/order","/api/grpgi/stock-exchange-v148/cancel"];
  if (allowed.indexOf(path) < 0 || String(data.playerId || data.player_id || "") !== own ||
      data.create === true || data.deleted === true) throw new ForbiddenError("Нельзя изменять другого персонажа");
  return e.next();
}
function protectSnapshot(e) {
  ["worldJson","stateJson"].forEach(function(field) { e.record.set(field, clean(json(e.record, field))); });
  e.next();
}
module.exports = {grantCredits:grantCredits,clean:clean, credential:credential, createCredential:createCredential, login:login, session:session,
  request:request, requests:requests, approve:approve, reject:reject, confirm:confirm,
  protectPlayer:protectPlayer, protectSnapshot:protectSnapshot, guard:guard};
