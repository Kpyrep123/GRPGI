// Module suspended. Old clients receive a terminal response without touching the DB.
onBootstrap(e=>require(__hooks+'/grpgi_raids_disabled_v299.js').bootstrap(e));
routerAdd('POST','/api/grpgi/auth-v212/raids-v290',e=>e.json(410,{message:'Функция недоступна.',data:{}}),$apis.skipSuccessActivityLog());
routerAdd('POST','/api/grpgi/auth-v212/raids-v290/worker/claim',e=>e.json(410,{message:'Функция недоступна.',data:{}}),$apis.skipSuccessActivityLog());
routerAdd('POST','/api/grpgi/auth-v212/raids-v290/worker/result',e=>e.json(410,{message:'Функция недоступна.',data:{}}),$apis.skipSuccessActivityLog());
