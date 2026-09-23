
    const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),asar=require('@electron/asar');
    const root=path.resolve(__dirname,'..'),archive=path.join(root,'dist/win-unpacked/resources/app.asar');
    const files=['main.js','preload.js','renderer/app.js','renderer/index.html','renderer/player-sync-core.js','renderer/player-sync-ui-v135.js','renderer/stats-engine-v113.js','renderer/scene-editor-v113.js'];
    for(const file of files){assert.deepEqual(asar.extractFile(archive,file),fs.readFileSync(path.join(root,file)),file);}
    for(const file of [...files.filter(f=>f.endsWith('.js')),'deploy/site/app/app.js',...fs.readdirSync(path.join(root,'pocketbase/pb_hooks')).filter(f=>f.endsWith('.js')).map(f=>'pocketbase/pb_hooks/'+f)]){
     const r=cp.spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});assert.equal(r.status,0,file+'\n'+r.stderr);
    }
    const packaged=JSON.parse(asar.extractFile(archive,'package.json')),source=JSON.parse(fs.readFileSync(path.join(root,'package.json')));for(const key of ['version','name','main','dependencies'])assert.deepEqual(packaged[key],source[key],key);assert.equal(packaged.version,'1.0.135');
    console.log('PASS: packaged executable contains the exact tested sources; all changed scripts parse');
    