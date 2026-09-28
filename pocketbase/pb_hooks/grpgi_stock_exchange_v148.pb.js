routerAdd('GET','/api/grpgi/stock-exchange-v148',function(e){return require(__hooks+'/grpgi_stock_exchange_v148.js').get(e);});
routerAdd('POST','/api/grpgi/stock-exchange-v148/order',function(e){return require(__hooks+'/grpgi_stock_exchange_v148.js').order(e);});
routerAdd('POST','/api/grpgi/stock-exchange-v148/cancel',function(e){return require(__hooks+'/grpgi_stock_exchange_v148.js').cancel(e);});
routerAdd('POST','/api/grpgi/stock-exchange-v148/impulse',function(e){return require(__hooks+'/grpgi_stock_exchange_v148.js').manualImpulse(e);});
routerAdd('POST','/api/grpgi/stock-exchange-v148/tick',function(e){return require(__hooks+'/grpgi_stock_exchange_v148.js').tickAll(e);});
