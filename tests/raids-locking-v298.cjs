'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'raid-lock-')),file=path.join(scratch,'test.db'),a=new DatabaseSync(file),b=new DatabaseSync(file);
try{
 a.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=0; CREATE TABLE grpgi_raids_v290 (revision INTEGER); INSERT INTO grpgi_raids_v290 VALUES (0)');b.exec('PRAGMA busy_timeout=0');
 a.exec('BEGIN');a.prepare('SELECT revision FROM grpgi_raids_v290').get();b.exec('UPDATE grpgi_raids_v290 SET revision=1');assert.throws(()=>a.exec('UPDATE grpgi_raids_v290 SET revision=2'),error=>/database is locked/.test(error.message)&&error.errcode===517);a.exec('ROLLBACK');
 const source=fs.readFileSync(path.resolve(__dirname,'../pocketbase/pb_hooks/grpgi_raids_v290.js'),'utf8'),body=source.slice(source.indexOf('function write('),source.indexOf('function random('));
 class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
 const ctx={table:'grpgi_raids_v290',ApiError};vm.createContext(ctx);vm.runInContext(body,ctx);
 const app={runInTransaction(fn){a.exec('BEGIN');try{const result=fn({db:()=>({newQuery:sql=>({execute:()=>a.exec(sql)})})});a.exec('COMMIT');return result;}catch(error){a.exec('ROLLBACK');throw error;}}};
 ctx.write(app,()=>{assert.equal(a.prepare('SELECT revision FROM grpgi_raids_v290').get().revision,1);assert.throws(()=>b.exec('UPDATE grpgi_raids_v290 SET revision=9'),/database is locked/);a.exec('UPDATE grpgi_raids_v290 SET revision=2');});assert.equal(b.prepare('SELECT revision FROM grpgi_raids_v290').get().revision,2);
 assert.throws(()=>ctx.write(app,()=>{a.exec('UPDATE grpgi_raids_v290 SET revision=3');throw Error('failure');}),/failure/);assert.equal(b.prepare('SELECT revision FROM grpgi_raids_v290').get().revision,2);
 b.exec('BEGIN IMMEDIATE');assert.throws(()=>ctx.write(app,()=>{throw Error('must not run');}),error=>error.status===503);b.exec('ROLLBACK');assert.equal(a.prepare('SELECT revision FROM grpgi_raids_v290').get().revision,2);
 console.log('PASS real SQLite WAL: reproduced BUSY_SNAPSHOT 517, writer reservation, rollback and recoverable busy response');
}finally{a.close();b.close();fs.rmSync(scratch,{recursive:true,force:true});}
