onBootstrap(e=>require(__hooks+'/grpgi_planning_v316.js').bootstrap(e));
routerAdd('GET','/api/grpgi/auth-v212/planning-v316/state',e=>require(__hooks+'/grpgi_planning_v316.js').state(e));
routerAdd('POST','/api/grpgi/auth-v212/planning-v316/mutate',e=>require(__hooks+'/grpgi_planning_v316.js').mutate(e));
cronAdd('grpgi-planning-v316','* * * * *',()=>require(__hooks+'/grpgi_planning_v316.js').tick($app));
