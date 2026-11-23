/* Preserve dormant campaign definitions without registering UI or background work. */
(()=>{'use strict';let archived={};
 worldLoadSteps.push(world=>{archived=JSON.parse(JSON.stringify(world.campaigns?.RAIDS_V290||{}));});
 worldSaveSections.push(world=>{world.campaigns.RAIDS_V290=JSON.parse(JSON.stringify(archived));});
})();
