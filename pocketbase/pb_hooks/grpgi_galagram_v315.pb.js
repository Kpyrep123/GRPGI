onBootstrap(e=>require(__hooks+'/grpgi_galagram_v315.js').bootstrap(e));
routerAdd('GET','/api/grpgi/auth-v212/galagram-v315/state',e=>require(__hooks+'/grpgi_galagram_v315.js').state(e));
routerAdd('POST','/api/grpgi/auth-v212/galagram-v315/subscribe',e=>require(__hooks+'/grpgi_galagram_v315.js').subscribe(e));
routerAdd('POST','/api/grpgi/auth-v212/galagram-v315/unsubscribe',e=>require(__hooks+'/grpgi_galagram_v315.js').unsubscribe(e));
routerAdd('POST','/api/grpgi/auth-v212/galagram-v315/test',e=>require(__hooks+'/grpgi_galagram_v315.js').test(e));
routerAdd('POST','/api/grpgi/auth-v212/galagram-v315/worker/claim',e=>require(__hooks+'/grpgi_galagram_v315.js').claim(e));
routerAdd('POST','/api/grpgi/auth-v212/galagram-v315/worker/ack',e=>require(__hooks+'/grpgi_galagram_v315.js').ack(e));
