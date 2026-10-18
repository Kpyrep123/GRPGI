const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const source=fs.readFileSync('main.js','utf8'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'trade175-')),data=path.join(temp,'data'),target=path.join(temp,'exports');fs.mkdirSync(data);fs.mkdirSync(target);
const equipment={EQUIPMENT:{item:{id:'item',name:'Keep'}},TRADE_CATALOG:{tags:{tag:{id:'tag',name:'Tag'}},templates:{tpl:{id:'tpl',name:'Template',policy:{overrides:{item:{enabled:true,minPrice:4,maxPrice:9,appearanceChance:33}}}}}}};
const ctx=vm.createContext({fs,path,Buffer,WORLD_FILE_NAMES:['equipment','planets'],mainWindow:null,app:{getVersion:()=> 'test',getPath:()=>temp},dialog:{showOpenDialog:async(...args)=>args.at(-1).title.includes('резервной')?{filePaths:[target]}:{filePaths:[path.join(target,ctx.current+'.json')]},showSaveDialog:async()=>({filePath:path.join(target,ctx.current+'.json')})},writableWorldDataDir:()=>data,ensureWorldDataDir:async()=>data,defaultWorldDataDir:()=>data,stateFilePath:()=>path.join(temp,'state.json'),syncConfigFilePath:()=>path.join(temp,'sync.json'),readMarkersFilePath:()=>path.join(temp,'markers.json'),backupWorldSectionFile:async()=>{},localizeLegacyImageDataUrls:async()=>{},writeJsonAtomic:async(file,payload)=>fs.promises.writeFile(file,JSON.stringify(payload)),readJsonIfExists:async file=>JSON.parse(await fs.promises.readFile(file,'utf8'))});
vm.runInContext(source.slice(source.indexOf('function backupExportDirName()'),source.indexOf('function worldBackupsDir()')),ctx);
vm.runInContext(source.slice(source.indexOf('async function writeWorldSection('),source.indexOf('async function resetWorldDataDir()')),ctx);
ctx.readWorldData=async()=>{await ctx.writeTradeJsonFilesV175(data,JSON.parse(fs.readFileSync(path.join(data,'equipment.json'))));};
(async()=>{try{
 await ctx.writeWorldSection('equipment',equipment);
 for(const [section,key,wrapper] of [['tradeTags','tags','TRADE_TAGS'],['assortmentTemplates','templates','ASSORTMENT_TEMPLATES']]){
  const payload=JSON.parse(fs.readFileSync(path.join(data,section+'.json')));assert.deepEqual(payload[wrapper],equipment.TRADE_CATALOG[key]);ctx.current=section;await ctx.exportWorldSectionJson({section,payload});assert.deepEqual(JSON.parse(JSON.stringify((await ctx.importWorldSectionJson({section})).payload)),payload);
 }
 // Backup regenerates standalone files from canonical data, not stale derived copies.
 fs.writeFileSync(path.join(data,'tradeTags.json'),'{}');fs.unlinkSync(path.join(data,'assortmentTemplates.json'));
 const backup=await ctx.exportCampaignBackup();assert.equal(backup.ok,true);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup.backupDir,'world-data','tradeTags.json'))),{TRADE_TAGS:equipment.TRADE_CATALOG.tags});assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup.backupDir,'world-data','assortmentTemplates.json'))),{ASSORTMENT_TEMPLATES:equipment.TRADE_CATALOG.templates});assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup.backupDir,'world-data','equipment.json'))),equipment);
 await ctx.writeWorldData({equipment:{EQUIPMENT:{}},planets:{PLANETS:{}}});assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data,'assortmentTemplates.json'))),{ASSORTMENT_TEMPLATES:{}});
 assert.throws(()=>ctx.assertWorldJsonSection('unknown'),/Unsupported/);
 console.log('PASS: actual main section export/import dialogs, derived working files, full save clearing, legacy backup materialization and canonical preservation');
}finally{fs.rmSync(temp,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
