onBootstrap(function(e){return require(__hooks+'/grpgi_world_sync_v301.js').bootstrap(e);});
routerAdd('POST','/api/grpgi/auth-v212/world-v301/pull',function(e){return require(__hooks+'/grpgi_world_sync_v301.js').pull(e);});
routerAdd('POST','/api/grpgi/auth-v212/world-v301/push',function(e){return require(__hooks+'/grpgi_world_sync_v301.js').push(e);});
