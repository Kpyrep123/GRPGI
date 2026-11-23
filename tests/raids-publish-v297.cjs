'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const main=fs.readFileSync(path.resolve(__dirname,'../main.js'),'utf8');
const ctx={require:name=>{assert.equal(name,'./raid-publish-media-v297.cjs');return require('../raid-publish-media-v297.cjs');},ensureEntityImageOnBackend:async()=>{},normalizeMapListSectionForSync:section=>({CAMPAIGNS:section.CAMPAIGNS||{},CAMPAIGN_LIST:[]}),uploads:[]};
ctx.uploadImageSourceToBackend=async(config,source)=>{ctx.uploads.push(source);if(source==='file:///missing.png')throw Error('missing image');return{publicUrl:'https://assets.test/'+ctx.uploads.length+'.png'};};
vm.createContext(ctx);vm.runInContext(main.slice(main.indexOf('function normalizeCampaignsSectionForSync('),main.indexOf('async function normalizeCombatPublishPayloadImages(')),ctx);
(async()=>{
 const config={campaignId:'main'},world={campaigns:{CAMPAIGNS:{main:{id:'main'}},RAIDS_V290:{main:{enabled:true,windowMode:'open',missions:[{id:'m',maps:[{id:'map',backgroundImage:'file:///background.png',assets:[{image:'file:///background.png',lootStateV118:{items:[{itemId:'gun',qty:1,copiesV287:[{id:'forged',durability:4,aberration252:{forged:true,effects:['weapon-1-1']}}]}]}}],tokens:[],templates:[{id:'spawn',raidZone290:'spawn',points:[{x:1,y:1}]}]}]}]}},ABERRATION_FORGE:{main:[{id:'recipe',copy:{id:'c'}}]},ABERRATION_SETTINGS:{main:{enabled:true}}}};
 const result=await ctx.normalizeSnapshotImagesForCloud(config,{world:structuredClone(world)}),campaigns=result.world.campaigns,map=campaigns.RAIDS_V290.main.missions[0].maps[0];
 assert.equal(campaigns.RAIDS_V290.main.windowMode,'open');assert.equal(campaigns.ABERRATION_FORGE.main[0].id,'recipe');assert(campaigns.ABERRATION_SETTINGS.main.enabled);
 assert.equal(map.backgroundImage,'https://assets.test/1.png');assert.equal(map.assets[0].image,map.backgroundImage);assert.equal(ctx.uploads.length,1,'same local image is uploaded once');assert.equal(map.assets[0].lootStateV118.items[0].copiesV287[0].durability,4);assert.equal(map.templates[0].raidZone290,'spawn');assert.equal(world.campaigns.RAIDS_V290.main.missions[0].maps[0].backgroundImage,'file:///background.png');
 const failed={world:structuredClone(world)};failed.world.campaigns.RAIDS_V290.main.missions[0].maps[0].backgroundImage='file:///missing.png';await assert.rejects(ctx.normalizeSnapshotImagesForCloud(config,failed),/missing image/);
 const invalid={world:structuredClone(world)};await assert.rejects(require('../raid-publish-media-v297.cjs')(config,invalid,async()=>({url:'file:///desktop-only'})),/не опубликовано/);
 const pkg=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../package.json'),'utf8'));assert(pkg.build.files.includes('raid-publish-media-v297.cjs'));
 console.log('PASS raid publication: actual main normalization, campaign/forge preservation, local media upload/cache/failure, map zones and forged loot');
})().catch(e=>{console.error(e);process.exitCode=1;});
