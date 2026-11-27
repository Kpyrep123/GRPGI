// All legacy exchange endpoints are closed without opening or updating the database.
for(const suffix of ['', '/order','/cancel','/impulse','/tick','/portfolio','/mode','/stream'])for(const method of ['GET','POST','PUT','PATCH','DELETE'])routerAdd(method,'/api/grpgi/stock-exchange-v148'+suffix,e=>require(__hooks+'/grpgi_stocks_disabled_v318.js').deny(e));
