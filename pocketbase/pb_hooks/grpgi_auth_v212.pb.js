routerUse(function(e) { return require(__hooks + "/grpgi_auth_v212.js").guard(e); });
routerAdd("POST", "/api/grpgi/auth-v212/login", function(e) { return require(__hooks + "/grpgi_auth_v212.js").login(e); });
routerAdd("GET", "/api/grpgi/auth-v212/session", function(e) { return require(__hooks + "/grpgi_auth_v212.js").session(e); });
routerAdd("POST", "/api/grpgi/auth-v212/recovery/request", function(e) { return require(__hooks + "/grpgi_auth_v212.js").request(e); });
routerAdd("GET", "/api/grpgi/auth-v212/recovery/requests", function(e) { return require(__hooks + "/grpgi_auth_v212.js").requests(e); });
routerAdd("POST", "/api/grpgi/auth-v212/recovery/approve", function(e) { return require(__hooks + "/grpgi_auth_v212.js").approve(e); });
routerAdd("POST", "/api/grpgi/auth-v212/recovery/reject", function(e) { return require(__hooks + "/grpgi_auth_v212.js").reject(e); });
routerAdd("POST", "/api/grpgi/auth-v212/recovery/confirm", function(e) { return require(__hooks + "/grpgi_auth_v212.js").confirm(e); });
onRecordCreate(function(e) { return require(__hooks + "/grpgi_auth_v212.js").protectPlayer(e, true); }, "campaign_players");
onRecordUpdate(function(e) { return require(__hooks + "/grpgi_auth_v212.js").protectPlayer(e, false); }, "campaign_players");
onRecordCreate(function(e) { return require(__hooks + "/grpgi_auth_v212.js").protectSnapshot(e); }, "campaign_snapshots");
onRecordUpdate(function(e) { return require(__hooks + "/grpgi_auth_v212.js").protectSnapshot(e); }, "campaign_snapshots");

routerAdd("POST", "/api/grpgi/auth-v212/credits/grant", function(e) { return require(__hooks + "/grpgi_auth_v212.js").grantCredits(e); });
