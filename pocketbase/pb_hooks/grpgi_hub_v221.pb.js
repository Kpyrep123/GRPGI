routerAdd("POST", "/api/grpgi/auth-v212/hub-v221/storage", (e) => {
  return require(__hooks + "/grpgi_hub_v221.js").storage(e);
});
routerAdd("POST", "/api/grpgi/auth-v212/hub-v221/presence", (e) => {
  return require(__hooks + "/grpgi_hub_v221.js").presence(e);
}, $apis.skipSuccessActivityLog());

cronAdd("grpgi-hub-presence-v221", "* * * * *", () => {
  require(__hooks + "/grpgi_hub_v221.js").prune($app);
});
