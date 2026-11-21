onBootstrap(e=>require(__hooks+'/grpgi_raids_v290.js').bootstrap(e));
routerAdd('POST','/api/grpgi/auth-v212/raids-v290',e=>require(__hooks+'/grpgi_raids_v290.js').request(e));
routerAdd('POST','/api/grpgi/auth-v212/raids-v290/worker/claim',e=>require(__hooks+'/grpgi_raids_v290.js').claim(e),$apis.skipSuccessActivityLog());
routerAdd('POST','/api/grpgi/auth-v212/raids-v290/worker/result',e=>require(__hooks+'/grpgi_raids_v290.js').result(e),$apis.skipSuccessActivityLog());
onRecordUpdateRequest(e=>require(__hooks+'/grpgi_raids_v290.js').lockedRequest(e),'campaign_players');
