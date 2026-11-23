'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite');
const source=fs.readFileSync(path.resolve(__dirname,'../pocketbase/pb_hooks/grpgi_raids_disabled_v299.js'),'utf8');
const db=new DatabaseSync(':memory:');
function query(sql){let args={};const statement=()=>db.prepare(sql.replace(/\{:([a-zA-Z]+)\}/g,':$1'));return{bind(a){args=a;return this;},execute(){return statement().run(args);},one(out){const row=statement().get(args);if(!row)throw Error('sql: no rows');Object.assign(out,row);}};}
const ctx={module:{exports:{}},DynamicModel:class{constructor(data){Object.assign(this,data);}}};vm.createContext(ctx);vm.runInContext(source,ctx);const retirement=ctx.module.exports;
const app={db:()=>({newQuery:query}),runInTransaction(fn){db.exec('BEGIN');try{fn(app);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};let next=0;const event={app,next(){next++;}};
try{
 retirement.bootstrap(event);assert.equal(next,1,'fresh installs do not create retired tables');
 db.exec('CREATE TABLE grpgi_raids_v290 (campaign TEXT,week TEXT,status TEXT,state TEXT); CREATE TABLE campaign_players (id TEXT,playerJson TEXT,version INTEGER,updatedBy TEXT,clientUpdatedAt TEXT)');
 const active={phase:'running',job:{id:'job'},pending:{kind:'reaction'},units:[{id:'p',hpCurrent:3}],world:{equipment:{saved:true}}},profile={id:'p',raidLock290:'main|week',stats:{hpCurrent:3},inventory:[{itemId:'gun',qty:1,instancesV215:[{id:'copy',durability:2}]}],credits:7,dead229:false};
 db.prepare('INSERT INTO grpgi_raids_v290 VALUES (?,?,?,?)').run('main','week','running',JSON.stringify(active));db.prepare('INSERT INTO grpgi_raids_v290 VALUES (?,?,?,?)').run('other','week','finished','{"phase":"finished"}');
 db.prepare('INSERT INTO campaign_players VALUES (?,?,?,?,?)').run('p',JSON.stringify(profile),5,'old','old');db.prepare('INSERT INTO campaign_players VALUES (?,?,?,?,?)').run('q','{"id":"q","dead229":true}',2,'old','old');
 retirement.bootstrap(event);const attempt=db.prepare('SELECT * FROM grpgi_raids_v290 WHERE campaign=?').get('main'),row=db.prepare('SELECT * FROM campaign_players WHERE id=?').get('p');assert.equal(attempt.status,'suspended');assert.equal(attempt.state,JSON.stringify(active),'archive is preserved byte-for-byte');const expected={...profile};delete expected.raidLock290;assert.deepEqual(JSON.parse(row.playerJson),expected);assert.equal(row.version,6);assert.equal(db.prepare('SELECT status FROM grpgi_raids_v290 WHERE campaign=?').get('other').status,'finished');assert.equal(db.prepare('SELECT version FROM campaign_players WHERE id=?').get('q').version,2);
 retirement.bootstrap(event);assert.equal(db.prepare('SELECT version FROM campaign_players WHERE id=?').get('p').version,6,'cleanup is idempotent');
 const routes=[],registration={onBootstrap(){},routerAdd(method,url,fn){routes.push({url,fn});},$apis:{skipSuccessActivityLog:()=>({})}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../pocketbase/pb_hooks/grpgi_raids_v290.pb.js'),'utf8'),registration);
 assert.equal(routes.length,3);for(const route of routes){const e={get app(){throw Error('disabled route touched database');},json:(status,body)=>({status,body})};assert.equal(route.fn(e).status,410);}
 const service=fs.readFileSync(path.resolve(__dirname,'../raid-service/grpgi-raids.service'),'utf8');assert(service.includes('ConditionPathExists=/etc/grpgi-raids.enabled'));assert(!service.includes('Restart=always'));
 console.log('PASS suspended module: no runtime routes/DB work, preserved snapshots and resources, released locks, idempotent cleanup and dormant service');
}finally{db.close();}
