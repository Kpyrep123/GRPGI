'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL,fileURLToPath}=require('node:url');
const source=fs.readFileSync('main.js','utf8'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-audio-'));let save,calls=[];
const ctx={fs,path,Buffer,pathToFileURL,writableWorldAssetsDir:()=>temp,sanitizeFileStem:s=>s.replace(/[^\w-]/g,'_'),loadSyncConfig:async()=>({enabled:true}),uploadImageSourceToPocketBase:async(config,url,options)=>{calls.push({url,options});assert(fs.statSync(fileURLToPath(url)).isFile());return {publicUrl:'https://assets.test/audio.mp3'};},ipcMain:{handle:(name,fn)=>{assert.equal(name,'world:saveAudio');save=fn;}}};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function extensionFromContentType('),source.indexOf('async function imageSourceToBuffer(')),ctx);vm.runInContext(source.slice(source.indexOf("ipcMain.handle('world:saveAudio'"),source.indexOf("ipcMain.handle('world:saveImage'")),ctx);
(async()=>{try{
 const p=path.join(temp,'voice.mp3');fs.writeFileSync(p,Buffer.from('ID3 audio fixture'));
 let result=await save(null,{filePath:p,name:'voice.mp3',section:'news',entityId:'report'});assert(result.ok);assert.equal(result.cloudUrl,'https://assets.test/audio.mp3');assert.equal(calls[0].options.entityId,'report');assert.equal(ctx.inferImageContentType(pathToFileURL(p).href),'audio/mpeg');
 result=await save(null,{dataUrl:'data:audio/ogg;base64,'+Buffer.from('OggS fixture').toString('base64')});assert(result.ok);assert.equal(ctx.inferImageContentType(calls[1].url),'audio/ogg');
 const before=calls.length;assert(!(await save(null,{dataUrl:'data:text/html;base64,PHNjcmlwdD4='})).ok);assert(!(await save(null,{filePath:path.join(temp,'evil.html')})).ok);assert.equal(calls.length,before);
 const big=path.join(temp,'big.mp3');const fd=fs.openSync(big,'w');fs.ftruncateSync(fd,32*1024*1024+1);fs.closeSync(fd);assert(!(await save(null,{filePath:big})).ok);
 assert.equal(ctx.extensionFromContentType('image/webp'),'webp');assert.equal(ctx.contentTypeFromExtension('m4a'),'audio/mp4');
 console.log('PASS v315 audio IPC: native streaming and data URL upload, stable cloud URL and entity metadata, MIME types, 32 MiB limit, invalid content rejection and image compatibility');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
