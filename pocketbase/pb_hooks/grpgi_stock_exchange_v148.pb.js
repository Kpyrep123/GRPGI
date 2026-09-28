var stockV148=require(__hooks+'/grpgi_stock_exchange_v148.js');
routerAdd('GET','/api/grpgi/stock-exchange-v148',function(e){return stockV148.get(e);},$apis.requireAuth());
routerAdd('POST','/api/grpgi/stock-exchange-v148/order',function(e){return stockV148.order(e);},$apis.requireAuth());
routerAdd('POST','/api/grpgi/stock-exchange-v148/cancel',function(e){return stockV148.cancel(e);},$apis.requireAuth());
routerAdd('POST','/api/grpgi/stock-exchange-v148/impulse',function(e){return stockV148.manualImpulse(e);},$apis.requireAuth());
routerAdd('POST','/api/grpgi/stock-exchange-v148/tick',function(e){return stockV148.tickAll(e);});
