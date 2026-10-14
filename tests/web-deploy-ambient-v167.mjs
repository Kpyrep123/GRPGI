import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{prepareWebDeploySource,deployWeb}=require('../tools/devops-automation.cjs');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'grpg-ambient-test-')),stages=[];
const source=path.join(root,'deploy/site'),audio=path.join(root,'renderer/assets/audio'),userAudio=path.join(root,'scene-editor-media/audio');
async function stage(){const result=await prepareWebDeploySource(source,{campaignId:'test',url:'https://sync.grpg-sync.ru'},root,userAudio);stages.push(result.stagingRoot);return result;}
try{
 await fs.mkdir(source,{recursive:true});await fs.writeFile(path.join(source,'index.html'),'fixture');await fs.mkdir(audio,{recursive:true});await fs.mkdir(userAudio,{recursive:true});
 let result=await stage();assert.equal(result.webAmbient.copied,false);
 // A local file larger than the archive's 20 MB ceiling still stages intact.
 const original=path.join(audio,'web_ambient.m4a'),file=await fs.open(original,'w');await file.write(Buffer.from('local-audio'));await file.truncate(21*1024*1024);await file.close();
 await fs.writeFile(path.join(audio,'private-combat.wav'),'must not be uploaded');
 result=await stage();const target=path.join(result.stagingSite,'app/assets/audio/web_ambient.m4a');assert.equal(result.webAmbient.copied,true);assert.equal((await fs.stat(target)).size,21*1024*1024);assert.equal((await fs.readFile(target)).subarray(0,11).toString(),'local-audio');assert.deepEqual(await fs.readdir(path.dirname(target)),['web_ambient.m4a']);assert.ok((await fs.readFile(path.join(result.stagingSite,'app/runtime-config.js'),'utf8')).includes('test'));
 await fs.rm(original);await fs.writeFile(path.join(userAudio,'100_web_ambient.m4a'),'old');await fs.utimes(path.join(userAudio,'100_web_ambient.m4a'),1,1);await fs.writeFile(path.join(userAudio,'200_web_ambient.m4a'),'new');
 result=await stage();assert.equal(await fs.readFile(path.join(result.stagingSite,'app/assets/audio/web_ambient.m4a'),'utf8'),'new');
 await fs.writeFile(path.join(userAudio,'web_ambient.m4a'),'exact');result=await stage();assert.equal(await fs.readFile(path.join(result.stagingSite,'app/assets/audio/web_ambient.m4a'),'utf8'),'exact');
 await fs.rm(userAudio,{recursive:true});await fs.mkdir(path.join(source,'app/assets/audio'),{recursive:true});await fs.writeFile(path.join(source,'app/assets/audio/web_ambient.m4a'),'site-local');result=await stage();assert.equal(await fs.readFile(path.join(result.stagingSite,'app/assets/audio/web_ambient.m4a'),'utf8'),'site-local');
 // Run the full deployment path with local SSH/SCP adapters, exercising its actual atomic script.
 const bin=path.join(root,'fake-bin'),remoteTarget=path.join(root,'remote/site');await fs.mkdir(bin,{recursive:true});
 await fs.writeFile(path.join(bin,'ssh'),`#!/usr/bin/env node
const {spawnSync}=require('child_process');const args=process.argv.slice(2);if(args.includes('-V')){console.log('OpenSSH fixture');process.exit(0);}const result=spawnSync('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});process.exit(result.status||0);
`);await fs.chmod(path.join(bin,'ssh'),0o755);
 await fs.writeFile(path.join(bin,'scp'),`#!/usr/bin/env node
const fs=require('fs'),path=require('path'),args=process.argv.slice(2);if(args.includes('-V'))process.exit(0);const src=args.at(-2),dest=args.at(-1).split(':').slice(1).join(':');fs.cpSync(src,path.join(dest,path.basename(src)),{recursive:true});
`);await fs.chmod(path.join(bin,'scp'),0o755);
 await fs.mkdir(path.join(source,'app'),{recursive:true});for(const name of ['index.html','app.js','article-sandbox.html'])await fs.writeFile(path.join(source,'app',name),'fixture');
 await fs.writeFile(path.join(root,'devops.config.json'),JSON.stringify({webDeploy:{source:'deploy/site',host:'fixture.invalid',user:'test',port:22,target:remoteTarget,identityFile:'',healthUrls:[]}}));
 const oldPath=process.env.PATH;process.env.PATH=bin+path.delimiter+oldPath;
 try{let deployed=await deployWeb(root,{runtimeConfig:{campaignId:'test',url:'https://sync.grpg-sync.ru'}});assert.equal(deployed.webAmbientCopied,true);assert.equal(deployed.webAmbientMissing,false);
 await fs.mkdir(path.join(remoteTarget,'downloads'),{recursive:true});await fs.writeFile(path.join(remoteTarget,'downloads/installer.exe'),'keep');await fs.rm(path.join(source,'app/assets/audio/web_ambient.m4a'));
 deployed=await deployWeb(root,{runtimeConfig:{campaignId:'test',url:'https://sync.grpg-sync.ru'}});assert.equal(deployed.webAmbientCopied,false);assert.equal(deployed.webAmbientPreserved,true);assert.equal(deployed.webAmbientMissing,false);assert.equal(await fs.readFile(path.join(remoteTarget,'app/assets/audio/web_ambient.m4a'),'utf8'),'site-local');assert.equal(await fs.readFile(path.join(remoteTarget,'downloads/installer.exe'),'utf8'),'keep');
 await fs.rm(path.join(remoteTarget,'app/assets/audio/web_ambient.m4a'));deployed=await deployWeb(root,{runtimeConfig:{campaignId:'test',url:'https://sync.grpg-sync.ru'}});assert.equal(deployed.webAmbientMissing,true);
 }finally{process.env.PATH=oldPath;}
 console.log('PASS: Deploy Web stages large local ambient, imported audio and source-site audio without copying private sound library');
}finally{for(const p of stages)await fs.rm(p,{recursive:true,force:true});await fs.rm(root,{recursive:true,force:true});}
