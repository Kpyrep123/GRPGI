/* v1.0.130 — combat tab opening hotfix; equipment actions, drones and injuries */
(() => {
  'use strict';
  if (window.__grpgSceneEditorV109 || typeof Combat === 'undefined') return;
  window.__grpgSceneEditorV109 = true;

  const LOCAL_KEY = 'grpg-scene-editor-local-v2';
  const SAVE_DELAY = 120;
  const PATH_STEP = 0.5;
  const DEFAULT_MOVE_WORLD = 6;
  const DEFAULT_ATTACK_WORLD = 10;
  const local = {
    loaded: false,
    loading: null,
    saveTimer: 0,
    store: null,
    ui: { palette: 'assets', assetCategory: 'all', sceneCategory: 'all', soundsOpen: false, soundSearch: '', unitSearch: '', action: 'select', pendingPlacement: null, initiativeOpen: false },
    draw: null,
    spaceDown: false,
    preview: null,
    context: null,
    broadcastRaf: 0,
    cameraRuntime: Object.create(null),
    stability: { active:false, dirtyProfiles:false, remotePending:false, localPersistTimer:0, enteredAt:0, generation:0 },
    lua119: { busy:false, pointPicker:null },
    saveChainV120: Promise.resolve({ok:true}),
    profileSaveChainV120: Promise.resolve({ok:true}),
    combatProfileHashesV120: new Map(),
    combatTransactionV120: null,
    combatTransactionSeqV120: 0,
    moveBusyV122: false
  };

  const clone = value => {
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };
  const html = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp104 = (value, min, max) => Math.max(min, Math.min(max, num(value, min)));
  const makeId = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
  const list = value => Array.isArray(value) ? value : [];
  const unique = values => [...new Set(list(values).map(v => String(v || '').trim()).filter(Boolean))];
  const COVER_TYPES_V120 = new Set(['none','weak','partial','good','total','concealment']);
  function coverDefaults120(type='none') {
    if(type==='weak') return {armor:1,defense:0};
    if(type==='partial') return {armor:2,defense:0};
    if(type==='good') return {armor:3,defense:0};
    return {armor:0,defense:0};
  }
  function normalizeCoverType120(value='none') {
    const type=String(value||'none').trim().toLowerCase();
    // Preserve old scene archives: light was the former +2 cover and heavy the
    // former strongest physical cover.
    if(type==='light')return'partial';
    if(type==='heavy')return'good';
    return COVER_TYPES_V120.has(type)?type:'none';
  }

  function blankStore() {
    return { version: 3, cameraSchema: 109, rangeSchema: 109, mediaSchema: 110, scenes: {}, runtimes: {}, cameraByScene: {}, categories: ['Общее'], assetCategories: ['Общее'], assetLibrary: [], selectedSceneId: '', legacyImportedAt: null, updatedAt: null };
  }
  function normalizeStore(raw = {}) {
    const next = { ...blankStore(), ...(raw && typeof raw === 'object' ? raw : {}) };
    next.scenes = next.scenes && typeof next.scenes === 'object' && !Array.isArray(next.scenes) ? next.scenes : {};
    next.runtimes = next.runtimes && typeof next.runtimes === 'object' && !Array.isArray(next.runtimes) ? next.runtimes : {};
    // v1.0.107 could persist camera coordinates after a transient layout frame. Do not reuse those coordinates.
    // This is a one-time migration; all v1.0.108 camera states are stored with cameraSchema=108.
    const cameraSchema = num(raw?.cameraSchema, 0);
    next.cameraByScene = [108,109].includes(cameraSchema) && next.cameraByScene && typeof next.cameraByScene === 'object' && !Array.isArray(next.cameraByScene) ? next.cameraByScene : {};
    next.cameraSchema = 109;
    if(num(raw?.rangeSchema,0)!==109){for(const runtime of Object.values(next.runtimes||{})){for(const token of list(runtime?.tokens))if(token&&typeof token==='object')token.movedThisTurn=0;}}
    next.rangeSchema = 109;
    next.mediaSchema = 110;
    next.categories = unique(['Общее', ...list(next.categories)]);
    next.assetCategories = unique(['Общее', ...list(next.assetCategories)]);
    next.assetLibrary = list(next.assetLibrary).map(item => normalizeLibraryAsset(item));
    next.selectedSceneId = String(next.selectedSceneId || '');
    return next;
  }
  function normalizeLibraryAsset(item = {}) {
    return {
      id: String(item.id || makeId('assetlib')),
      name: String(item.name || 'Ассет').trim() || 'Ассет',
      image: String(item.image || ''),
      w: clamp104(item.w || 2, .25, 40),
      h: clamp104(item.h || 2, .25, 40),
      category: String(item.category || 'Общее').trim() || 'Общее',
      favorite: Boolean(item.favorite),
      blockMovement: Boolean(item.blockMovement),
      difficultTerrain: Boolean(item.difficultTerrain),
      blockSight: Boolean(item.blockSight),
      coverType: normalizeCoverType120(item.coverType),
      coverArmorBonus: Math.max(0,num(item.coverArmorBonus,coverDefaults120(normalizeCoverType120(item.coverType)).armor)),
      coverDefenseBonus: 0,
      coverHardness: Math.max(0,num(item.coverHardness,0)),
      coverPenetrable: Boolean(item.coverPenetrable),
      visibleToPlayers: item.visibleToPlayers !== false,
      opacity: clamp104(item.opacity ?? 1, .05, 1),
      imageMeta: item.imageMeta && typeof item.imageMeta === 'object' ? clone(item.imageMeta) : null
    };
  }

  // Extend legacy normalizers without deleting old fields.
  const normalizeSceneBefore104 = normalizeCombatScene;
  normalizeCombatScene = function(scene = {}) {
    const next = normalizeSceneBefore104(scene);
    next.category = String(scene.category || next.category || 'Общее').trim() || 'Общее';
    next.parentId = String(scene.parentId || next.parentId || '').trim();
    // v1.0.128: tactical scenes use hexes directly. Legacy scale metadata is
    // normalized to a fixed value so old scene files remain readable without
    // reintroducing a second unit of measurement in the editor.
    next.scalePerHex = 1;
    next.scaleLabel = 'гекс';
    const requestedFogMode = String(scene.fogMode || next.fogMode || '').trim();
    next.fogMode = scene.fogEnabled === false ? 'off' : (['off','cover','objects'].includes(requestedFogMode) ? requestedFogMode : 'cover');
    next.fogEnabled = next.fogMode !== 'off';
    next.showInitiativeToPlayers = Boolean(scene.showInitiativeToPlayers ?? next.showInitiativeToPlayers);
    next.assets = list(scene.assets || next.assets).map(normalizeCombatAsset);
    next.templates = list(scene.templates || next.templates).map(normalizeCombatTemplate);
    return next;
  };
  const normalizeAssetBefore104 = normalizeCombatAsset;
  normalizeCombatAsset = function(asset = {}) {
    const next = normalizeAssetBefore104(asset);
    next.blockMovement = Boolean(asset.blockMovement);
    next.difficultTerrain = Boolean(asset.difficultTerrain);
    next.coverType = normalizeCoverType120(asset.coverType);
    const coverDefaults=coverDefaults120(next.coverType);
    next.coverArmorBonus = Math.max(0,num(asset.coverArmorBonus,coverDefaults.armor));
    next.coverDefenseBonus = 0;
    next.coverHardness = Math.max(0,num(asset.coverHardness,0));
    next.coverPenetrable = Boolean(asset.coverPenetrable);
    if(next.coverType==='total')next.blockSight=true;
    if(next.coverType==='concealment')next.blockSight=false;
    next.visibleToPlayers = asset.visibleToPlayers !== false;
    next.libraryId = String(asset.libraryId || '');
    next.imageMeta = asset.imageMeta && typeof asset.imageMeta === 'object' ? clone(asset.imageMeta) : null;
    return next;
  };
  const normalizeTokenBefore104 = normalizeCombatToken;
  function normalizeMagazineMap118(value) {
    const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    return Object.fromEntries(Object.entries(source).map(([weaponId,entry])=>{
      const row=entry&&typeof entry==='object'?entry:{loaded:entry};
      return [String(weaponId||''),{loaded:Math.max(0,Math.trunc(num(row.loaded,0))),ammoTypeId:String(row.ammoTypeId||''),updatedAt:String(row.updatedAt||'')}];
    }).filter(([id])=>id));
  }
  normalizeCombatToken = function(token = {}) {
    const next = normalizeTokenBefore104(token);
    next.visibleToPlayers = token.visibleToPlayers !== false;
    next.sharesVisionWithPlayers = token.sharesVisionWithPlayers == null ? Boolean(token.playerId) : Boolean(token.sharesVisionWithPlayers);
    next.visionRange = Math.max(0, num(token.visionRange, 0));
    next.moveRange = Math.max(0, num(token.moveRange, 0));
    next.attackRange = Math.max(0, num(token.attackRange, 0));
    next.movedThisTurn = Math.max(0, num(token.movedThisTurn, 0));
    next.actionUsed = Boolean(token.actionUsed);
    next.reactionUsedV119 = Boolean(token.reactionUsedV119);
    next.disengagedV122 = Boolean(token.disengagedV122);
    next.proneV122 = Boolean(token.proneV122);
    const legacyConditionsV138=token.conditionsV138&&typeof token.conditionsV138==='object'?token.conditionsV138:{};
    next.conditionsV138={
      dying:Boolean(legacyConditionsV138.dying),
      stabilized:Boolean(legacyConditionsV138.stabilized),
      prone:Boolean(legacyConditionsV138.prone??token.proneV122),
      stunned:Boolean(legacyConditionsV138.stunned),
      grappled:Boolean(legacyConditionsV138.grappled),
      unconscious:Boolean(legacyConditionsV138.unconscious),
      handsBusy:Boolean(legacyConditionsV138.handsBusy)
    };
    next.proneV122=next.conditionsV138.prone;
    next.movementModeV138=['ground','flight','swim','climb'].includes(String(token.movementModeV138||token.movementMode||''))?String(token.movementModeV138||token.movementMode):'ground';
    next.itemStateV138=token.itemStateV138&&typeof token.itemStateV138==='object'&&!Array.isArray(token.itemStateV138)?clone(token.itemStateV138):{};
    next.showNameToPlayers = token.showNameToPlayers !== false;
    next.blockMovement = Boolean(token.blockMovement);
    next.blockSight = Boolean(token.blockSight);
    next.armorClass = Math.max(0, num(token.armorClass, 0));
    next.defense = Math.max(0, num(token.defense, 0));
    next.armorClassOverrideV120 = token.armorClassOverrideV120 === true;
    next.defenseOverrideV120 = token.defenseOverrideV120 === true;
    next.visionRangeOverrideV122 = token.visionRangeOverrideV122 === true;
    next.moveRangeOverrideV122 = token.moveRangeOverrideV122 === true;
    next.attackRangeOverrideV122 = token.attackRangeOverrideV122 === true;
    next.weaponMalfunctionsV122 = token.weaponMalfunctionsV122&&typeof token.weaponMalfunctionsV122==='object'?{...token.weaponMalfunctionsV122}:{};
    next.timedModifiersV122 = list(token.timedModifiersV122).map(row=>({...row,effects:list(row?.effects).map(effect=>({...effect})),remainingTurns:Math.max(0,Math.trunc(num(row?.remainingTurns??row?.duration,0)))})).filter(row=>row.id&&row.remainingTurns>0);
    next.burstStateV122=token.burstStateV122&&typeof token.burstStateV122==='object'?{weaponId:String(token.burstStateV122.weaponId||''),nextShot:Math.max(1,Math.trunc(num(token.burstStateV122.nextShot,1))),maxShots:Math.max(1,Math.trunc(num(token.burstStateV122.maxShots,1)))}:null;
    next.weaponId = String(token.weaponId || next.weaponId || '');
    next.grenadeId = String(token.grenadeId || '');
    next.equipmentItemId = String(token.equipmentItemId || '');
    next.equipmentType = String(token.equipmentType || '');
    next.operatorTokenIdV129=String(token.operatorTokenIdV129||'');
    next.deployedItemIdV129=String(token.deployedItemIdV129||token.equipmentItemId||'');
    next.linkJammedV129=Boolean(token.linkJammedV129);
    next.freeDroneCommandUsedV129=Boolean(token.freeDroneCommandUsedV129);
    next.droneCommandV129=token.droneCommandV129&&typeof token.droneCommandV129==='object'?{operatorTokenId:String(token.droneCommandV129.operatorTokenId||token.operatorTokenIdV129||''),round:Math.max(1,Math.trunc(num(token.droneCommandV129.round,1))),returnOnly:Boolean(token.droneCommandV129.returnOnly),moduleUsed:Boolean(token.droneCommandV129.moduleUsed),completed:Boolean(token.droneCommandV129.completed)}:null;
    next.injuriesV129=list(token.injuriesV129).map(row=>({id:String(row?.id||makeId('injury')),degree:clamp104(Math.trunc(num(row?.degree,1)),1,5),damage:Math.max(1,Math.trunc(num(row?.damage,1))),source:String(row?.source||'Попадание'),createdAt:String(row?.createdAt||new Date().toISOString())}));
    next.weaponMagazinesV118 = normalizeMagazineMap118(token.weaponMagazinesV118 || token.weaponMagazines);
    if(Array.isArray(token.combatInventoryV120))next.combatInventoryV120=clone(token.combatInventoryV120);
    const loot=token.lootStateV118&&typeof token.lootStateV118==='object'?token.lootStateV118:{};
    next.lootStateV118={searched:Boolean(loot.searched),searchedAt:String(loot.searchedAt||''),pendingTransfersV137:clone(loot.pendingTransfersV137||{}),items:list(loot.items).map(row=>({itemId:String(row?.itemId||''),qty:Math.max(0,Math.trunc(num(row?.qty,0)))})).filter(row=>row.itemId&&row.qty>0)};
    return next;
  };
  const normalizeTemplateBefore104 = normalizeCombatTemplate;
  normalizeCombatTemplate = function(template = {}) {
    const next = normalizeTemplateBefore104(template);
    next.blockMovement = Boolean(template.blockMovement);
    next.visibleToPlayers = template.visibleToPlayers !== false;
    next.points = list(template.points).map(p => ({ x: num(p?.x), y: num(p?.y) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    next.thickness = clamp104(template.thickness || .18, .04, 4);
    next.coverType = normalizeCoverType120(template.coverType || (template.shape==='wall'&&template.blockSight?'total':'none'));
    next.coverArmorBonus = Math.max(0,num(template.coverArmorBonus,coverDefaults120(next.coverType).armor));
    next.coverHardness = Math.max(0,num(template.coverHardness,0));
    next.coverPenetrable = Boolean(template.coverPenetrable);
    if (['wall','polygon'].includes(String(template.shape || ''))) next.shape = String(template.shape);
    next.closed = template.closed !== false;
    return next;
  };

  function collectStoreFromRuntime() {
    if (!local.store) local.store = blankStore();
    local.store.scenes = Object.fromEntries(Object.entries(COMBAT_SCENES || {}).map(([id, scene]) => [id, normalizeCombatScene(scene)]));
    const combat = App?.state?.toolState?.[COMBAT_STATE_KEY] || null;
    // Persistence intentionally excludes combat from campaign state. While the scene
    // window is closed App.saveState() may therefore replace App.state with a copy
    // that has no combat branch. That absence is not an empty scene and must never
    // overwrite the dedicated local scene store.
    if (combat?.scenes && typeof combat.scenes === 'object') local.store.runtimes = clone(combat.scenes);
    if (combat?.cameraByScene && typeof combat.cameraByScene === 'object') local.store.cameraByScene = clone(local.cameraRuntime || combat.cameraByScene);
    else local.store.cameraByScene = clone(local.cameraRuntime || local.store.cameraByScene || {});
    local.store.selectedSceneId = String(Combat.selectedSceneId || local.store.selectedSceneId || '');
    local.store.updatedAt = new Date().toISOString();
    return local.store;
  }
  function applyStore(store) {
    local.store = normalizeStore(store);
    setCombatScenes(local.store.scenes || {});
    const combat = ensureCombatState();
    combat.scenes = clone(local.store.runtimes || {});
    combat.cameraByScene = clone(local.store.cameraByScene || {}); // compatibility mirror only; active camera lives in local.cameraRuntime
    local.cameraRuntime = clone(local.store.cameraByScene || {});
    combat.activeSceneId = '';
    for (const id of Object.keys(COMBAT_SCENES)) {
      const runtime=ensureCombatRuntime(id),scene=COMBAT_SCENES[id];
      list(runtime?.tokens).forEach(token=>fitTokenToHex107(token,scene,nearestHexCenter107(scene,centerOf(token))));
    }
    Combat.selectedSceneId = local.store.selectedSceneId && COMBAT_SCENES[local.store.selectedSceneId]
      ? local.store.selectedSceneId
      : (COMBAT_SCENE_LIST[0]?.id || null);
    Data.combatScenes = COMBAT_SCENES;
  }
  function migrateLegacyStore() {
    const next = blankStore();
    next.scenes = clone(COMBAT_SCENES || {});
    next.runtimes = clone(ensureCombatState().scenes || {});
    next.cameraByScene = clone(ensureCombatState().cameraByScene || {});
    next.selectedSceneId = COMBAT_SCENE_LIST[0]?.id || '';
    next.legacyImportedAt = new Date().toISOString();
    Object.values(next.scenes).forEach(scene => {
      scene.category = String(scene.category || 'Общее');
      if (!next.categories.includes(scene.category)) next.categories.push(scene.category);
    });
    return next;
  }
  async function loadLocalStore() {
    if (local.loaded) {
      const combat=App?.state?.toolState?.[COMBAT_STATE_KEY];
      if(local.store&&(!combat?.scenes||!Object.keys(combat.scenes).length))applyStore(clone(local.store));
      return local.store;
    }
    if (local.loading) return local.loading;
    local.loading = (async () => {
      let payload = null, exists = false;
      try {
        if (window.electronAPI?.loadLocalCombatScenes) {
          const result = await window.electronAPI.loadLocalCombatScenes();
          if (result?.ok) { payload = result.payload; exists = Boolean(result.exists); }
        } else {
          const raw = localStorage.getItem(LOCAL_KEY);
          if (raw != null) { payload = JSON.parse(raw); exists = true; }
        }
      } catch (error) { console.error('SCENE_LOCAL_LOAD_FAILED', error); }
      const store = exists ? normalizeStore(payload || {}) : migrateLegacyStore();
      applyStore(store);
      local.loaded = true;
      if (!exists) await saveStoreNow();
      return local.store;
    })().finally(() => { local.loading = null; });
    return local.loading;
  }
  async function saveStoreNow() {
    if (!local.loaded && !local.store) return { ok: false };
    // Capture an immutable revision before entering the asynchronous writer. Otherwise a
    // later shot can mutate the same object while an earlier JSON write is still pending.
    const payload = clone(collectStoreFromRuntime());
    const write = async () => {
      try {
        if (window.electronAPI?.saveLocalCombatScenes) return await window.electronAPI.saveLocalCombatScenes(payload);
        localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
        return { ok: true, fallback: true };
      } catch (error) {
        console.error('SCENE_LOCAL_SAVE_FAILED', error);
        return { ok: false, message: error?.message || String(error) };
      }
    };
    local.saveChainV120 = Promise.resolve(local.saveChainV120).catch(() => ({ok:false})).then(write);
    return local.saveChainV120;
  }
  Combat.saveJsonScenesV133 = async function(){
    clearTimeout(local.saveTimer);local.saveTimer=0;
    return saveStoreNow();
  };
  function queueStoreSave() {
    // Update the authoritative in-memory copy immediately; the disk write remains
    // debounced. This also protects a newly reopened scene from an older async
    // profile/world save that replaces App.state while the window is open.
    collectStoreFromRuntime();
    clearTimeout(local.saveTimer);
    local.saveTimer = setTimeout(() => { local.saveTimer = 0; saveStoreNow(); }, SAVE_DELAY);
  }
  async function checkpointCombat120(reason='Боевое действие',saveProfiles=false) {
    clearTimeout(local.saveTimer); local.saveTimer=0;
    const sceneResult=await saveStoreNow();
    if(sceneResult?.ok===false)throw new Error(sceneResult?.message||`Не удалось сохранить сцену: ${reason}`);
    let profileResult={ok:true,status:'not-requested'};
    if(saveProfiles){
      profileResult=await persistCombatProfiles105(reason,{immediate:true});
      if(profileResult?.ok===false){
        // A completed shot must remain visible and durable in the local scene even
        // when PocketBase is temporarily unavailable. The profile hash is not
        // advanced on failure, therefore the next checkpoint retries the cloud push.
        console.error('SCENE_PROFILE_CHECKPOINT_V120_FAILED',profileResult.message||reason);
        Toast.show(`Боевое действие сохранено локально. Облако: ${profileResult.message||'повтор при следующем действии'}`,'err');
      }
    }
    broadcastScene104();
    return {...sceneResult,profileOk:profileResult?.ok!==false,profileResult};
  }

  // Scene data must never enter campaign/cloud snapshots again.
  const persistenceSaveBefore104 = Persistence.save.bind(Persistence);
  Persistence.save = async function(state) {
    const outgoing = clone(state || makeDefaultState());
    if (outgoing?.toolState) delete outgoing.toolState[COMBAT_STATE_KEY];
    return persistenceSaveBefore104(outgoing);
  };
  const buildSharedBefore104 = buildSharedStateSnapshot;
  buildSharedStateSnapshot = function(state = App?.state || makeDefaultState()) {
    const snap = buildSharedBefore104(state);
    if (snap?.toolState) delete snap.toolState[COMBAT_STATE_KEY];
    return snap;
  };
  const buildWorldBefore104 = buildWorldSnapshot;
  buildWorldSnapshot = function() {
    const snap = buildWorldBefore104();
    // Keep the legacy section readable until the one-time local migration has completed.
    // After that, omitting combatScenes leaves the old local JSON file untouched as a backup.
    if (local.loaded && snap && typeof snap === 'object') delete snap.combatScenes;
    return snap;
  };
  // Remote/world refreshes may still contain the legacy combatScenes section. Apply everything except it,
  // then restore the local scene store so cloud data can never overwrite local scenes.
  const applyWorldBefore104 = applyWorldData;
  applyWorldData = function(payload = {}) {
    // World Config updates may arrive before the debounced local scene write.
    // Capture the live runtime now; re-applying local.store here used to restore
    // an older token array and made recently placed units disappear.
    const liveStore = local.loaded ? clone(collectStoreFromRuntime()) : null;
    const safePayload = payload && typeof payload === 'object' ? { ...payload } : {};
    // On the first launch allow legacy scenes to load so they can be migrated into the PC-only store.
    // Once the local store exists, all later world/cloud refreshes are prevented from touching scenes.
    if (local.loaded) delete safePayload.combatScenes;
    const result = applyWorldBefore104(safePayload);
    if (liveStore) applyStore(liveStore);
    return result;
  };
  const configPersistAllBefore125=Configurator.persistAll.bind(Configurator);
  Configurator.persistAll=async function(...args){
    const sceneStore=local.loaded?clone(collectStoreFromRuntime()):null;
    try{return await configPersistAllBefore125(...args);}
    finally{
      // Configurator.persistAll reloads App.state from disk. Combat is deliberately
      // absent there, so reattach the dedicated scene runtime immediately.
      if(sceneStore){applyStore(sceneStore);refreshRuntimeSources122(Combat.getSceneIdForView?.());}
    }
  };
  const syncApplyBefore104 = Sync.applyRemoteSnapshot.bind(Sync);
  Sync.applyRemoteSnapshot = async function(payload, remoteMeta = {}, options = {}) {
    if(local.stability?.active){local.stability.remotePending=true;return {ok:true,status:'deferred-combat-session'};}
    const liveStore=local.loaded?clone(collectStoreFromRuntime()):null;
    const result = await syncApplyBefore104(payload, remoteMeta, options);
    if(liveStore)applyStore(liveStore);
    return result;
  };
  Combat.persist = async function(notice = '', options = {}) {
    if (!local.loaded) await loadLocalStore();
    queueStoreSave();
    broadcastScene104();
    if (UI.activeModuleId === 'combat' && options.render !== false) this.render();
    if (notice && !options.silentToast) Toast.show(notice, 'ok');
    return { ok: true, localOnly: true };
  };
  Combat.publishSceneState = async function() { queueStoreSave(); broadcastScene104(); return { ok: true, localOnly: true }; };
  Combat.startSync = function() {};
  Combat.stopSync = function() {};
  Combat.startRuntimeSync = function() {};
  Combat.stopRuntimeSync = function() { if (this.runtimePollTimer) { clearInterval(this.runtimePollTimer); this.runtimePollTimer = null; } };
  Combat.initRuntimeBridge = function() { if (this.runtimeListenerUnsub) { try { this.runtimeListenerUnsub(); } catch {} this.runtimeListenerUnsub = null; } };
  Combat.applyRemoteRuntimeRow = function() { return false; };
  Combat.pullRemoteRuntime = async function() { return { ok: true, status: 'local-only' }; };
  Combat.pushRemoteRuntime = async function() { return { ok: true, status: 'local-only' }; };
  Combat.persistCombatState = async function(notice = '', options = {}) {
    queueStoreSave(); broadcastScene104();
    if (options.render !== false && UI.activeModuleId === 'combat') this.render();
    if (notice && !options.silentToast) Toast.show(notice, 'ok');
    return { ok: true, localOnly: true };
  };
  Combat.nextTurn = async function() {
    const runtime = this.getRuntime();
    if (!runtime) return;
    if(local.lua119.busy){Toast.show('Сначала завершите текущее боевое действие','info');return;}
    const orderBefore=list(runtime.initiativeOrder).map(String),indexBefore=clamp104(runtime.turnIndex,0,Math.max(0,orderBefore.length-1)),previousId=String(orderBefore[indexBefore]||'');
    this.syncInitiative?.(this.getSceneIdForView?.(),false);
    if (!runtime.initiativeOrder?.length) return;
    local.lua119.busy=true;
    try{
      const effects={damage:0,effects:[]},previous=list(runtime.tokens).find(token=>String(token.id)===previousId)||null;
      if(previous&&num(previous.hpCurrent)>0){previous.burstStateV122=null;for(const drone of list(runtime.tokens).filter(row=>isDroneToken129(row)&&String(row.operatorTokenIdV129)===String(previous.id))){if(drone.droneCommandV129)drone.droneCommandV129.completed=true;}await runAutomaticHooks119(previous,'OnTurnEnd',{caster:previous,attacker:previous,target:previous,targets:[previous],event:'OnTurnEnd'},effects);await processTimedModifiers122(previous,'end',effects);}
      this.syncInitiative?.(this.getSceneIdForView?.(),false);
      const chooseAfter=(order,index)=>{
        const living=new Set(list(runtime.initiativeOrder).map(String));
        for(let offset=1;offset<=order.length;offset+=1){const sourceIndex=(index+offset)%order.length,id=String(order[sourceIndex]||'');if(id&&living.has(id))return{id,wrapped:sourceIndex<=index};}
        const id=String(runtime.initiativeOrder?.[0]||'');return{id,wrapped:false};
      };
      let choice=chooseAfter(orderBefore.length?orderBefore:list(runtime.initiativeOrder),orderBefore.length?indexBefore:-1);
      if(choice.wrapped){runtime.round=Math.max(1,num(runtime.round,1))+1;await processThinkers125(effects);}
      runtime.turnIndex=Math.max(0,list(runtime.initiativeOrder).indexOf(choice.id));
      // A periodic effect can incapacitate the unit whose turn has just begun.
      // Remove it from initiative immediately and advance to the next living
      // unit without running its OnTurnStart scripts or leaving a dead turn.
      let current=this.getCurrentTurnToken?.(),guard=Math.max(1,list(runtime.tokens).length+1);
      while(current&&guard-->0){
        const startOrder=list(runtime.initiativeOrder).map(String),startIndex=Math.max(0,startOrder.indexOf(String(current.id)));
        current.movedThisTurn=0;current.actionUsed=false;current.reactionUsedV119=injurySeverity129(current)>=4;current.disengagedV122=false;current.freeDroneCommandUsedV129=false;
        await processTimedModifiers122(current,'start',effects);
        if(num(current.hpCurrent)>0){await runAutomaticHooks119(current,'OnTurnStart',{caster:current,attacker:current,target:current,targets:[current],event:'OnTurnStart'},effects);if(num(current.hpCurrent)>0)break;}
        appendCombatLog105(runtime,`${current.name} выбывает из инициативы: здоровье равно 0.`);
        this.syncInitiative?.(this.getSceneIdForView?.(),false);
        choice=chooseAfter(startOrder,startIndex);
        if(choice.wrapped){runtime.round=Math.max(1,num(runtime.round,1))+1;await processThinkers125(effects);}
        runtime.turnIndex=Math.max(0,list(runtime.initiativeOrder).indexOf(choice.id));
        current=this.getCurrentTurnToken?.();
      }
      this.render();flushLuaEffects119(effects);
      await checkpointCombat120('Сцена: переход хода и Lua',true);
    }catch(error){
      console.error('SCENE_NEXT_TURN_V120_FAILED',error);
      Toast.show(`Ход изменён, но контрольное сохранение не выполнено: ${error?.message||error}`,'err');
    }finally{local.lua119.busy=false;}
  };

  // v1.0.109: preserve token object identity. Legacy ensureCombatRuntime() re-normalized by replacing
  // runtime.tokens on every read, which detached references during canAct/canMove checks.
  const getRuntimeBefore109 = Combat.getRuntime.bind(Combat);
  function normalizeThinker125(raw={}){
    return {
      id:String(raw.id||makeId('thinker')),
      thinkerId:String(raw.thinkerId||raw.id||''),
      name:String(raw.name||raw.thinkerId||'Thinker'),
      sourceId:String(raw.sourceId||''),
      sourceKind:String(raw.sourceKind||'skill'),
      sourceName:String(raw.sourceName||raw.name||'Thinker'),
      script:String(raw.script||''),
      sourceRaw:raw.sourceRaw&&typeof raw.sourceRaw==='object'?clone(raw.sourceRaw):{},
      casterId:String(raw.casterId||''),
      followUnitId:String(raw.followUnitId||''),
      x:num(raw.x),y:num(raw.y),radius:Math.max(0,num(raw.radius,1)),
      createdRound:Math.max(1,Math.trunc(num(raw.createdRound,1))),
      expiresRound:Math.max(0,Math.trunc(num(raw.expiresRound,0))),
      intervalRounds:Math.max(1,Math.trunc(num(raw.intervalRounds,1))),
      nextPulseRound:Math.max(1,Math.trunc(num(raw.nextPulseRound,2))),
      lastPulseRound:Math.max(0,Math.trunc(num(raw.lastPulseRound,0))),
      relation:['any','ally','enemy','self'].includes(String(raw.relation||''))?String(raw.relation):'any',
      players:raw.players!==false,npcs:raw.npcs!==false,units:raw.units===true,alive:raw.alive!==false,includeSelf:raw.includeSelf===true,
      visibleToPlayers:raw.visibleToPlayers!==false,blockSight:raw.blockSight===true,allowVision:raw.allowVision===true,color:String(raw.color||'#7df9ff')
    };
  }
  const runtimeShapeV137=new WeakMap();
  Combat.getRuntime = function(sceneId = this.getSceneIdForView()) {
    const id=String(sceneId||'').trim(); if(!id)return null;
    const combat=ensureCombatState();
    // Persistence.load() replaces App.state after a World Config save and the
    // campaign snapshot intentionally contains no combat branch. Recover the
    // scene runtime from its dedicated store instead of creating an empty one.
    if(!combat.scenes[id]&&local.loaded&&local.store?.runtimes?.[id])combat.scenes[id]=clone(local.store.runtimes[id]);
    if(!combat.scenes[id]) getRuntimeBefore109(id);
    const runtime=combat.scenes[id];
    if(!runtime)return null;
    if(!Array.isArray(runtime.tokens))runtime.tokens=[];
    let shape=runtimeShapeV137.get(runtime);
    if(!shape||shape.tokens!==runtime.tokens||shape.count!==runtime.tokens.length){
      runtime.tokens.forEach((token,index)=>{
        if(!token||typeof token!=='object'){runtime.tokens[index]=normalizeCombatToken(token||{});return;}
        Object.assign(token,normalizeCombatToken(token));
      });
      shape={tokens:runtime.tokens,count:runtime.tokens.length};
      runtimeShapeV137.set(runtime,shape);
    }
    if(!Array.isArray(runtime.initiativeOrder))runtime.initiativeOrder=[];
    if(shape.order!==runtime.initiativeOrder){runtime.initiativeOrder=runtime.initiativeOrder.map(String);shape.order=runtime.initiativeOrder;}
    runtime.turnIndex=Math.max(0,num(runtime.turnIndex,0));
    runtime.round=Math.max(1,num(runtime.round,1));
    if(!Array.isArray(runtime.log))runtime.log=[];
    if(shape.thinkers!==runtime.thinkersV125||shape.thinkerCount!==runtime.thinkersV125?.length){runtime.thinkersV125=list(runtime.thinkersV125).map(normalizeThinker125);shape.thinkers=runtime.thinkersV125;shape.thinkerCount=runtime.thinkersV125.length;}
    return runtime;
  };

  Combat.syncInitiative = function(sceneId=this.getSceneIdForView(),resetTurn=false){
    const runtime=this.getRuntime(sceneId);if(!runtime)return;
    // Never replace runtime.tokens here: active combat actions keep references to these exact objects.
    runtime.tokens.forEach(token=>Object.assign(token,normalizeCombatToken(token)));
    const currentId=!resetTurn?String(runtime.initiativeOrder?.[Math.max(0,num(runtime.turnIndex,0))]||''):'';
    runtime.initiativeOrder=runtime.tokens.filter(token=>num(token.hpCurrent,0)>0&&!isDroneToken129(token)).sort((a,b)=>(num(b.initiative)-num(a.initiative))||String(a.name||'').localeCompare(String(b.name||''),'ru')).map(token=>token.id);
    if(resetTurn){runtime.turnIndex=0;runtime.round=1;}else if(currentId&&runtime.initiativeOrder.includes(currentId))runtime.turnIndex=runtime.initiativeOrder.indexOf(currentId);else runtime.turnIndex=clamp104(runtime.turnIndex,0,Math.max(0,runtime.initiativeOrder.length-1));
  };

  // World Config: canonical scene ranges are stored on characters/NPCs and remain cloud-synced with the character itself.
  function combatConfig(entity = {}) {
    const derived=entity?.derivedStatsV113||{};
    return {
      visionRange: Math.max(0, num(entity?.combat?.visionRange ?? derived.vision, 6)),
      moveRange: Math.max(0, num(entity?.combat?.moveRange ?? derived.movement, 6))
    };
  }
  // World Config edits baseStats only; combat ranges are derived by Stats Engine.

  function equipmentItem105(id) { return id ? normalizeEquipmentItemV2(Data.getItem?.(id) || EQUIPMENT?.[id] || {}) : null; }
  const CONDITION_NAMES_V138=new Set(['dying','stabilized','prone','stunned','grappled','unconscious','handsBusy']);
  function conditionStateV138(token={}){
    const source=token.conditionsV138&&typeof token.conditionsV138==='object'?token.conditionsV138:{};
    token.conditionsV138={dying:Boolean(source.dying),stabilized:Boolean(source.stabilized),prone:Boolean(source.prone??token.proneV122),stunned:Boolean(source.stunned),grappled:Boolean(source.grappled),unconscious:Boolean(source.unconscious),handsBusy:Boolean(source.handsBusy)};
    token.proneV122=token.conditionsV138.prone;
    return token.conditionsV138;
  }
  function setConditionV138(token,name,enabled=true){
    if(!token||!CONDITION_NAMES_V138.has(String(name||'')))return false;
    const conditions=conditionStateV138(token);conditions[name]=Boolean(enabled);
    if(name==='prone')token.proneV122=conditions.prone;
    if(name==='stabilized'&&enabled)conditions.dying=false;
    if(name==='dying'&&enabled)conditions.stabilized=false;
    return true;
  }
  function itemStateContainerV138(token={}){
    const entity=entityForToken(token);
    const holder=token.playerId&&entity?entity:token;
    if(!holder.itemStateV138||typeof holder.itemStateV138!=='object'||Array.isArray(holder.itemStateV138))holder.itemStateV138={};
    if(token.playerId)token.itemStateV138=holder.itemStateV138;
    return holder.itemStateV138;
  }
  function itemRuntimeStateV138(token,itemOrId,slot=''){
    const item=typeof itemOrId==='object'&&itemOrId?itemOrId:equipmentItem105(itemOrId);
    if(!token||!item?.id)return{durability:0,durabilityMax:0,charges:0,chargesMax:0,broken:false,slot:String(slot||''),itemId:String(item?.id||itemOrId||'')};
    const states=itemStateContainerV138(token),key=String(item.id),prior=states[key]&&typeof states[key]==='object'?states[key]:{};
    const durabilityMax=Math.max(0,Math.trunc(num(item.durabilityMax??item.maxDurability,0))),chargesMax=Math.max(0,Math.trunc(num(item.chargesMax??item.maxCharges,0)));
    const row={...prior,itemId:key,slot:String(slot||prior.slot||''),durabilityMax,durability:durabilityMax>0?clamp104(prior.durability??durabilityMax,0,durabilityMax):0,chargesMax,charges:chargesMax>0?clamp104(Math.trunc(num(prior.charges,chargesMax)),0,chargesMax):0,broken:Boolean(prior.broken)||(durabilityMax>0&&num(prior.durability??durabilityMax)<=0)};
    states[key]=row;return row;
  }
  function equippedEntriesV138(token={}){
    const entity=entityForToken(token)||{},slots=entity.equipmentSlots||entity.loadout||{},rows=[];
    for(const [slot,id] of Object.entries(slots)){const item=equipmentItem105(id);if(item)rows.push({slot:String(slot),item});}
    list(entity.implantSlots?.length?entity.implantSlots:entity.installedImplantIds).forEach((id,index)=>{const item=equipmentItem105(id);if(item)rows.push({slot:`implant:${index}`,item});});
    if(token.equipmentItemId){const item=equipmentItem105(token.equipmentItemId);if(item&&!rows.some(row=>row.item.id===item.id))rows.push({slot:'module',item});}
    return rows;
  }
  function equippedEntryV138(token,slotOrId=''){
    const wanted=String(slotOrId||'');const rows=equippedEntriesV138(token);
    return rows.find(row=>row.slot===wanted||String(row.item.id)===wanted)||(wanted?null:rows[0])||null;
  }
  function itemBrokenV138(token,itemOrId,slot=''){return itemRuntimeStateV138(token,itemOrId,slot).broken;}
  function isDroneToken129(token={}){return String(token.equipmentType||token.type||equipmentItem105(token.equipmentItemId)?.type||'').toLowerCase()==='drone';}
  function isTurretToken129(token={}){return String(token.equipmentType||token.type||equipmentItem105(token.equipmentItemId)?.type||'').toLowerCase()==='turret';}
  function currentTurnToken129(runtime=Combat.getRuntime()){const order=list(runtime?.initiativeOrder),id=String(order[Math.max(0,Math.min(order.length-1,num(runtime?.turnIndex,0)))]||'');return list(runtime?.tokens).find(row=>String(row.id)===id)||null;}
  function injurySeverity129(token={}){return list(token.injuriesV129).reduce((max,row)=>Math.max(max,clamp104(Math.trunc(num(row?.degree,0)),0,5)),0);}
  function injuryCheckPenalty129(token={}){const degree=injurySeverity129(token);return degree>=5?5:degree>=4?2:degree>=2?1:0;}
  function injuryDisadvantage129(token={}){return injurySeverity129(token)>=5;}
  function injurySpeed129(base,token={}){const degree=injurySeverity129(token),value=Math.max(0,num(base));if(degree>=5)return value>0?1:0;if(degree>=3)return Math.ceil(value/2);if(degree===2)return Math.max(0,value-2);if(degree===1)return Math.max(0,value-1);return value;}
  function injuryMinimumDegree129(token,damage){const maxHp=Math.max(1,Math.trunc(num(token?.hpMax,1))),base=maxHp<=2?5:maxHp===3?4:maxHp===4?3:maxHp===5?2:1;return clamp104(Math.max(base,Math.ceil(num(damage,1))),1,5);}
  const INJURY_LABELS_V129={1:'лёгкая: −1 к скорости',2:'заметная: −1 ко всем проверкам, −2 к скорости',3:'тяжёлая: половина скорости, нельзя тяжёлое оружие, −1 к проверкам',4:'критическая: половина скорости, нет реакции, −2 к проверкам',5:'смертельная: помеха, скорость 1, −5 к проверкам'};
  function isHeavyWeapon129(item={}){const value=[item.weaponCategory,item.weightClass,item.name,...list(item.tags)].map(row=>String(row||'').toLowerCase()).join(' ');return item.heavyWeapon===true||/heavy|тяж[её]л/.test(value);}
  async function applyInjuryAfterDamage129(token,damage,source='Попадание'){
    const applied=Math.max(0,Math.trunc(num(damage,0)));if(!token||applied<=0||num(token.hpCurrent)<=0)return null;
    const minimum=injuryMinimumDegree129(token,applied),choices=[];for(let degree=minimum;degree<=5;degree++)choices.push(`<label><input type="radio" name="injuryDegree" value="${degree}" ${degree===minimum?'checked':''}/><span><b>${degree} степень</b><small>${html(INJURY_LABELS_V129[degree])}</small></span></label>`);
    const degree=await combatModal119({title:`Травма: ${token.name}`,subtitle:`Потеряно ${applied} HP · доступна степень ${minimum}–5`,body:`<div class="scene-lua-reactions-v119">${choices.join('')}</div>`,confirm:'ПРИМЕНИТЬ ТРАВМУ',decline:`МИНИМАЛЬНАЯ (${minimum})`,read:form=>clamp104(Math.trunc(num(form.elements.injuryDegree?.value,minimum)),minimum,5)});
    const chosen=degree==null?minimum:degree;token.injuriesV129=list(token.injuriesV129);token.injuriesV129.push({id:makeId('injury'),degree:chosen,damage:applied,source:String(source||'Попадание'),createdAt:new Date().toISOString()});
    if(chosen>=4)token.reactionUsedV119=true;appendCombatLog105(Combat.getRuntime(),`${token.name} получает травму ${chosen} степени (${INJURY_LABELS_V129[chosen]}).`);return chosen;
  }
  function operatorForDrone129(drone,runtime=Combat.getRuntime()){return list(runtime?.tokens).find(row=>String(row.id)===String(drone?.operatorTokenIdV129||drone?.droneCommandV129?.operatorTokenId||''))||null;}
  function operatorIntelligence129(operator){const entity=entityForToken(operator)||{},computed=window.GRPGStatsV113?.compute?.(entity,{kind:operator?.npcId?'npc':'player',inCombat:true,temporaryModifiers:timedStatModifiers122(operator)})||{};return Math.max(0,Math.trunc(num(computed.abilities?.intelligence??entity.abilities?.intelligence??entity.abilityBase?.intelligence,0)));}
  function operatorDroneSkill129(operator){const entity=entityForToken(operator)||{};for(const id of list(entity.skills)){const skill=skillForScene118(id)||{},name=`${id} ${skill.name||''} ${list(skill.tags).join(' ')}`.toLowerCase();if(!/drone|дрон/.test(name))continue;const explicit=entity.skillLevels?.[id]??skill.bonus??skill.level;return Number.isFinite(Number(explicit))?Number(explicit):1;}return 0;}
  function hasFreeDroneControl129(operator){const entity=entityForToken(operator)||{},ids=unique([...Object.values(entity.equipmentSlots||{}),...list(entity.implantSlots?.length?entity.implantSlots:entity.installedImplantIds)]);return ids.some(id=>{const item=equipmentItem105(id)||{},words=`${item.name||''} ${list(item.tags).join(' ')}`.toLowerCase();return item.freeDroneControl===true||/free[_ -]?drone[_ -]?control|бесплатн\S* управлен\S* дрон|нейроинтерфейс.*дрон/.test(words);});}
  function droneLinkState129(drone,operator=operatorForDrone129(drone),scene=Combat.getScene()){
    if(!drone||!operator||!scene)return{ok:false,reason:'Оператор не назначен'};if(drone.linkJammedV129)return{ok:false,reason:'Связь заглушена'};
    const distance=hexDistancePoints109(scene,centerOf(operator),centerOf(drone));if(distance>30)return{ok:false,reason:`Вне дальности связи: ${hexLabel109(distance)} / 30 гекс.`};
    const cover=coverBetween120(scene,centerOf(operator),centerOf(drone));if(cover.blocksAttack||sightSegmentBlocked105(scene,centerOf(operator),centerOf(drone),[operator.id,drone.id]))return{ok:false,reason:'Связь перекрыта полным укрытием'};
    return{ok:true,reason:'Связь установлена',distance};
  }
  function activeDroneCommand129(token){if(!isDroneToken129(token))return null;const runtime=Combat.getRuntime(),command=token.droneCommandV129,operator=operatorForDrone129(token,runtime),current=currentTurnToken129(runtime);if(!command||command.completed||!operator||current?.id!==operator.id||Math.trunc(num(command.round))!==Math.trunc(num(runtime?.round)))return null;if(!command.returnOnly&&!droneLinkState129(token,operator).ok)return null;return command;}
  function canCombatAct129(token){const conditions=conditionStateV138(token||{});if(conditions.stunned||conditions.unconscious||conditions.dying)return false;if(isDroneToken129(token)){const command=activeDroneCommand129(token);return Boolean(command&&!command.returnOnly&&!command.moduleUsed);}return Boolean(Combat.canActWithToken?.(token));}
  function completeDroneModule129(token){if(!isDroneToken129(token)||!token.droneCommandV129)return;token.droneCommandV129.moduleUsed=true;token.droneCommandV129.completed=true;}
  function tokenDefense105(token) {
    if (!token) return 10;
    if (token.armorClassOverrideV120 && num(token.armorClass, 0) > 0) return num(token.armorClass, 10);
    if (token.equipmentItemId) {
      const item = equipmentItem105(token.equipmentItemId);
      if (num(item?.unitArmorClass, 0) > 0) return num(item.unitArmorClass, 10);
    }
    const entity = entityForToken(token);
    if (token.playerId && entity) {
      const user = normalizePlayerProfileV2(entity);
      return Math.max(0, num(user.stats?.armorClass || user.stats?.baseArmorClass, 10));
    }
    // Armor Class decides whether an attack hits. Defense is damage reduction
    // and must never be used as an Armor Class fallback.
    return Math.max(0, num(entity?.armorClass ?? entity?.stats?.armorClass ?? token.armorClass, 10));
  }
  function itemProtectsFromEnergy119(item={}) {
    if(item.energyProtection===true||item.protectsAgainstEnergy===true)return true;
    return list(item.tags).some(tag=>['энергозащита','энергетическая защита','energy protection'].includes(String(tag||'').trim().toLowerCase()));
  }
  function itemIsPhysicalArmor119(item={}) {
    if(item.physicalArmor===true)return true;
    return list(item.tags).some(tag=>['физическая броня','physical armor'].includes(String(tag||'').trim().toLowerCase()));
  }
  function itemIsHeavyArmor122(item={}){const text=[item.armorWeightClass,item.armorClassType,...list(item.tags),item.name].map(value=>String(value||'').toLowerCase()).join(' ');return item.heavyArmor===true||/heavy|тяж[её]л/.test(text);}
  function itemIsPhysicalShield122(item={}){const text=[item.name,...list(item.tags)].map(value=>String(value||'').toLowerCase()).join(' ');return /shield|щит/.test(text)||num(item.shieldCoverBonus??item.coverBonus,0)>0;}
  function shieldBonus122(item={}){if(!itemIsPhysicalShield122(item))return 0;const modifier=list(item.modifiers).filter(row=>row?.enabled!==false&&String(row?.target)==='armor_class'&&String(row?.op||'add')==='add'&&['','always'].includes(String(row?.condition||'always'))&&['','global'].includes(String(row?.scope||'global'))).reduce((sum,row)=>sum+num(row?.value),0),explicit=num(item.shieldCoverBonus??item.coverBonus,0);return Math.max(0,explicit,modifier);}
  function incomingDefense119(token,weaponCategory='light',cover=null) {
    const category=String(weaponCategory||'light').trim().toLowerCase();
    const entity=entityForToken(token);
    let defenseBonus=Math.max(0,num(tokenDefense105(token),0));
    let baseArmorClass=defenseBonus,shieldArmorClass=0,coverArmorClass=Math.max(0,num(cover?.armorBonus,0));
    let baseAbsorption=token?.defenseOverrideV120?Math.max(0,num(token?.defense,0)):0,armorAbsorption=0,shieldAbsorption=0,coverAbsorption=Math.max(0,num(cover?.hardness,0));
    let physicalBonusApplied=false;
    if(entity&&window.GRPGStatsV113?.compute){
      let source=clone(entity);source.equipmentSlots={...(source.equipmentSlots||source.loadout||{})};
      for(const [slot,id] of Object.entries(source.equipmentSlots)){const item=equipmentItem105(id);if(item&&itemBrokenV138(token,item,slot))source.equipmentSlots[slot]='';}
      const intactImplants=list(source.implantSlots?.length?source.implantSlots:source.installedImplantIds).filter((id,index)=>!itemBrokenV138(token,equipmentItem105(id),`implant:${index}`));source.implantSlots=intactImplants;source.installedImplantIds=intactImplants.slice();
      if(category==='energy'){
        const armor=equipmentItem105(source.equipmentSlots.armor);
        if(armor&&!itemProtectsFromEnergy119(armor))source.equipmentSlots.armor='';
        const implantIds=list(source.implantSlots?.length?source.implantSlots:source.installedImplantIds);
        const keptImplants=implantIds.filter((id,index)=>{const item=equipmentItem105(id);return !itemBrokenV138(token,item,`implant:${index}`)&&(!itemIsPhysicalArmor119(item)||itemProtectsFromEnergy119(item));});
        source.implantSlots=keptImplants;
        source.installedImplantIds=keptImplants.slice();
      }
      try{
        const temporaryModifiers=timedStatModifiers122(token),slots=source.equipmentSlots||{},shield=equipmentItem105(slots.secondaryWeapon),physicalShield=itemIsPhysicalShield122(shield),withoutShield=physicalShield?{...source,equipmentSlots:{...slots,secondaryWeapon:''}}:source;
        const withoutArmor=clone(withoutShield);withoutArmor.equipmentSlots={...(withoutArmor.equipmentSlots||{}),armor:''};const withoutArmorImplants=list(withoutArmor.implantSlots?.length?withoutArmor.implantSlots:withoutArmor.installedImplantIds).filter(id=>!itemIsPhysicalArmor119(equipmentItem105(id)||{}));withoutArmor.implantSlots=withoutArmorImplants;withoutArmor.installedImplantIds=withoutArmorImplants.slice();
        const computeOptions={kind:token?.npcId?'npc':'player',inCombat:true,incomingWeaponCategory:category,temporaryModifiers},computedBase=window.GRPGStatsV113.compute(withoutArmor,computeOptions),computed=window.GRPGStatsV113.compute(withoutShield,computeOptions),computedFull=physicalShield?window.GRPGStatsV113.compute(source,computeOptions):computed,shieldBonus=physicalShield?Math.max(shieldBonus122(shield),num(computedFull?.values?.armorClass)-num(computed?.values?.armorClass)):0;
        if(!token?.armorClassOverrideV120)baseArmorClass=Math.max(0,num(computed?.values?.armorClass,defenseBonus));
        else baseArmorClass=defenseBonus;
        shieldArmorClass=Math.max(0,shieldBonus);
        if(!token?.defenseOverrideV120){baseAbsorption=Math.max(0,num(computedBase?.values?.defense,0));armorAbsorption=Math.max(0,num(computed?.values?.defense,0)-baseAbsorption);shieldAbsorption=Math.max(0,num(computedFull?.values?.defense,0)-num(computed?.values?.defense,0));}
        const armor=equipmentItem105(slots.armor),dex=Math.max(0,num(computed?.abilities?.dexterity,0));
        if(!token?.armorClassOverrideV120&&itemIsHeavyArmor122(armor))baseArmorClass=Math.max(0,baseArmorClass-dex);
        else if(!token?.armorClassOverrideV120&&shield?.shieldDexterityCap!=null&&String(shield.shieldDexterityCap).trim()!==''&&Number.isFinite(Number(shield.shieldDexterityCap))){const cap=Math.max(0,num(shield.shieldDexterityCap));baseArmorClass=Math.max(0,baseArmorClass-Math.max(0,dex-cap));}
        defenseBonus=baseArmorClass+Math.max(shieldArmorClass,coverArmorClass);physicalBonusApplied=true;
      }catch(error){console.warn('SCENE_INCOMING_DEFENSE_V119',error);}
    }
    // Equipment units and imported legacy tokens do not always have a WC
    // entity, but physical cover must still protect them.
    if(!physicalBonusApplied)defenseBonus=baseArmorClass+coverArmorClass;
    const damageReduction=baseAbsorption+armorAbsorption+shieldAbsorption+coverAbsorption;
    return {defenseBonus,damageReduction,category,coverBonus:coverArmorClass,baseArmorClass,shieldArmorClass,coverArmorClass,baseAbsorption,armorAbsorption,shieldAbsorption,coverAbsorption,absorptionSources:{base:baseAbsorption,armor:armorAbsorption,shield:shieldAbsorption,cover:coverAbsorption}};
  }
  function entityForToken(token) {
    if (token?.playerId) return App.state?.users?.[token.playerId] || PLAYER_TEMPLATES?.[token.playerId] || null;
    if (token?.npcId) return Data.getNpc?.(token.npcId) || null;
    if (token?.equipmentItemId) return equipmentItem105(token.equipmentItemId);
    return null;
  }
  function timedStatModifiers122(token={}){
    const out=[];
    for(const modifier of list(token.timedModifiersV122))for(const effect of list(modifier?.effects)){
      const target=String(effect?.property||effect?.target||'').trim();if(!target)continue;
      out.push({id:`${modifier.id}:${target}`,target,op:['add','set','replace_stat','add_stat'].includes(String(effect.operation||effect.op))?String(effect.operation||effect.op):'add',value:num(effect.value),statRef:String(effect.statRef||''),scope:String(effect.scope||'global'),scopeValue:String(effect.scopeValue||''),enabled:true,sourceId:String(modifier.id),sourceName:String(modifier.name||modifier.id),sourceKind:'timed_modifier'});
    }
    return out;
  }
  function isMassNpc122(entity={}){return String(entity.npcKind||entity.kind||'').toLowerCase()==='template'||entity.massNpc===true||entity.isMass===true;}
  function refreshRuntimeSources122(sceneId=Combat.getSceneIdForView?.()){
    const runtime=Combat.getRuntime(sceneId);if(!runtime)return false;
    let changed=false;
    for(const token of list(runtime.tokens)){
      if(!token?.playerId&&!token?.npcId)continue;
      const entity=entityForToken(token);if(!entity||(token.npcId&&(isMassNpc122(entity)||isMassNpc122(token))))continue;
      const before=JSON.stringify([token.name,token.image,token.hpMax,token.armorClass,token.defense,token.initiativeBonus,token.visionRange,token.moveRange,token.weaponId]);
      const computed=window.GRPGStatsV113?.compute?.(entity,{kind:token.npcId?'npc':'player',inCombat:true,temporaryModifiers:timedStatModifiers122(token)})||{};
      const values=computed.values||{},newMax=Math.max(1,num(values.maxHp,entity?.stats?.hpMax||token.hpMax||1));
      token.name=String(entity.displayName||entity.name||token.name||token.id);
      token.image=String(entity.image||token.image||'');
      token.hpMax=newMax;token.hpCurrent=clamp104(token.hpCurrent,0,newMax);
      token.initiativeBonus=num(values.initiativeBonus,token.initiativeBonus);
      if(!token.armorClassOverrideV120)token.armorClass=Math.max(0,num(values.armorClass,token.armorClass));
      if(!token.defenseOverrideV120)token.defense=Math.max(0,num(values.defense,token.defense));
      if(!token.visionRangeOverrideV122)token.visionRange=Math.max(0,num(values.vision,combatConfig(entity).visionRange));
      if(!token.moveRangeOverrideV122)token.moveRange=Math.max(0,num(values.movement,combatConfig(entity).moveRange));
      const weapons=ownedItems105(token,'weapon');
      if(!weapons.some(item=>String(item.id)===String(token.weaponId))){token.weaponId=String(weapons[0]?.id||'');token.burstStateV122=null;}
      if(before!==JSON.stringify([token.name,token.image,token.hpMax,token.armorClass,token.defense,token.initiativeBonus,token.visionRange,token.moveRange,token.weaponId])){token.sourceRefreshedAtV122=new Date().toISOString();changed=true;}
    }
    Combat.syncInitiative?.(sceneId,false);
    if(changed){collectStoreFromRuntime();queueStoreSave();}
    return changed;
  }
  function tokenInventoryOwner120(token){
    const entity=entityForToken(token);
    if(token?.npcId){
      if(!Array.isArray(token.combatInventoryV120))token.combatInventoryV120=clone(list(entity?.inventory));
      return{entity,rows:token.combatInventoryV120,set(rows){token.combatInventoryV120=list(rows);}};
    }
    return{entity,rows:list(entity?.inventory),set(rows){if(entity)entity.inventory=list(rows);}};
  }
  function inventoryQty105(owner, itemId) {
    const rows=owner?.rows||owner?.inventory||[];
    const row=list(rows).find(v=>String(v?.itemId||'')===String(itemId||''));
    return Math.max(0,Math.trunc(num(row?.qty,0)));
  }
  function ownedItems105(token, type) {
    const owner=tokenInventoryOwner120(token),entity=owner.entity; const rows=[]; const seen=new Set();
    for(const entry of list(owner.rows)){const item=equipmentItem105(entry?.itemId);if(!item||item.type!==type||num(entry.qty,0)<=0||seen.has(item.id))continue;seen.add(item.id);rows.push({...item,ownedQty:Math.max(0,Math.trunc(num(entry.qty,0)))});}
    if(type==='weapon'&&token?.playerId){const slots=entity?.equipmentSlots||{};for(const id of [slots.primaryWeapon||slots.weapon,slots.secondaryWeapon]){const item=equipmentItem105(id);if(item?.type==='weapon'&&!seen.has(item.id)){seen.add(item.id);rows.push({...item,ownedQty:Math.max(1,inventoryQty105(owner,item.id))});}}}
    if(type==='weapon'&&token?.npcId){const slots=entity?.equipmentSlots||entity?.loadout||{};for(const id of [slots.primaryWeapon||slots.weapon,slots.secondaryWeapon]){const item=equipmentItem105(id);if(item?.type==='weapon'&&!seen.has(item.id)){seen.add(item.id);rows.push({...item,ownedQty:1});}}}
    if(type==='weapon'&&!token?.playerId&&!rows.length&&token?.weaponId){const item=equipmentItem105(token.weaponId);if(item?.type==='weapon')rows.push({...item,ownedQty:1});}
    return rows;
  }
  function weaponForToken105(token) {
    if(!token)return null;
    if(token.equipmentItemId && ['turret','drone'].includes(String(token.equipmentType||equipmentItem105(token.equipmentItemId)?.type||''))){const item=equipmentItem105(token.equipmentItemId);if(item&&!itemBrokenV138(token,item,'module'))return item;}
    const weapons=ownedItems105(token,'weapon').filter(item=>!itemBrokenV138(token,item,equippedEntriesV138(token).find(row=>row.item.id===item.id)?.slot||''));
    let weapon=weapons.find(w=>w.id===token.weaponId)||weapons[0]||null;
    if(!weapon&&!token.playerId&&token.weaponId)weapon=equipmentItem105(token.weaponId);
    return weapon||normalizeEquipmentItemV2({id:'__unarmed_v122',name:'Безоружная атака',type:'weapon',weaponCategory:'melee',damage:'1',hitBonus:0,range:1,rapidFireShots:1,isUnarmedV122:true});
  }
  function rapidFireShots122(weapon={}){return Math.max(1,Math.trunc(num(weapon.rapidFireShots??weapon.burstShots,1)));}
  function weaponMalfunction122(token,weapon){return Boolean(token?.weaponMalfunctionsV122?.[String(weapon?.id||'')]);}
  function ignoresConcealment122(token){const entity=entityForToken(token)||{},ids=unique([...Object.values(entity.equipmentSlots||{}),...list(entity.implantSlots),...list(entity.installedImplantIds)]),texts=[...ids.map(id=>{const item=equipmentItem105(id)||{};return`${item.name||''} ${list(item.tags).join(' ')}`;}),...list(entity.skills).map(id=>{const skill=skillForScene118(id)||{};return`${skill.name||''} ${list(skill.tags).join(' ')}`;})].join(' ').toLowerCase();return /сенсор|тепловизор|thermal|sensor|ignore concealment|сквозь дым/.test(texts);}
  function ammoFamily120(item={}){return String(item.ammoFamily||item.caliber||item.ammunitionFamily||'').trim().toLowerCase();}
  function ammoForWeapon118(weapon,state=null){
    const id=String(state?.ammoTypeId||weapon?.ammoTypeId||weapon?.ammunitionId||'');
    const item=id?equipmentItem105(id):null;
    return item&&String(item.type||'')==='ammo'?item:null;
  }
  function compatibleAmmo120(token,weapon,{availableOnly=true,loadedTypeId=''}={}){
    const owner=tokenInventoryOwner120(token),family=ammoFamily120(weapon),exact=String(weapon?.ammoTypeId||weapon?.ammunitionId||'');
    if(!owner.entity)return[];
    const rows=[];
    for(const entry of list(owner.rows)){
      const qty=Math.max(0,Math.trunc(num(entry?.qty,0))),item=equipmentItem105(entry?.itemId);
      if(!item||String(item.type||'')!=='ammo'||(availableOnly&&qty<=0))continue;
      // A weapon may point to a legacy exact ammunition item and also acquire a
      // calibre in v1.0.120. Keep that exact item compatible during migration.
      const compatible=family?(ammoFamily120(item)===family||String(item.id)===exact):(exact?String(item.id)===exact:false);
      if(!compatible)continue;
      if(loadedTypeId&&String(item.id)!==String(loadedTypeId))continue;
      rows.push({...item,ownedQty:qty});
    }
    return rows.sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ru'));
  }
  function magazineSize118(weapon){return Math.max(0,Math.trunc(num(weapon?.magazineSize??weapon?.clipSize,0)));}
  function ammoPerShot118(weapon){return Math.max(1,Math.trunc(num(weapon?.ammoPerShot??weapon?.roundsPerShot,1)));}
  function magazineState118(token,weapon){
    if(!token||!weapon)return{loaded:0,size:0,ammoTypeId:''};
    const size=magazineSize118(weapon),weaponId=String(weapon.id||token.weaponId||'');
    token.weaponMagazinesV118=normalizeMagazineMap118(token.weaponMagazinesV118);
    const entity=entityForToken(token);
    const entityMap=normalizeMagazineMap118(entity?.weaponMagazines);
    const stored=token.weaponMagazinesV118[weaponId]||entityMap[weaponId]||null;
    const configuredAmmo=String(weapon.ammoTypeId||weapon.ammunitionId||'');
    // Legacy weapons with an exact ammunition item retain their already-loaded first
    // magazine. A new family-only weapon starts empty so the DM chooses the real round.
    const initialLoaded=configuredAmmo?size:0;
    const state={loaded:clamp104(stored?.loaded??initialLoaded,0,size),size,ammoTypeId:String(stored?.ammoTypeId||configuredAmmo),updatedAt:String(stored?.updatedAt||'')};
    token.weaponMagazinesV118[weaponId]=state;
    return state;
  }
  function writeMagazineState118(token,weapon,state){
    if(!token||!weapon)return;
    const weaponId=String(weapon.id||token.weaponId||'');
    const normalized={loaded:clamp104(Math.trunc(num(state?.loaded,0)),0,magazineSize118(weapon)),ammoTypeId:String(state?.ammoTypeId||weapon.ammoTypeId||''),updatedAt:new Date().toISOString()};
    token.weaponMagazinesV118=normalizeMagazineMap118(token.weaponMagazinesV118);
    token.weaponMagazinesV118[weaponId]=normalized;
    const entity=entityForToken(token);
    if(entity&&token.playerId){
      entity.weaponMagazines=normalizeMagazineMap118(entity.weaponMagazines);
      entity.weaponMagazines[weaponId]={...normalized};
      if(App.state?.users?.[token.playerId])App.state.users[token.playerId]=entity;
      if(PLAYER_TEMPLATES?.[token.playerId])PLAYER_TEMPLATES[token.playerId]={...PLAYER_TEMPLATES[token.playerId],weaponMagazines:clone(entity.weaponMagazines)};
    }
  }
  function reserveAmmo118(token,weapon,state=magazineState118(token,weapon)){
    const locked=state.loaded>0?state.ammoTypeId:'';
    const compatible=compatibleAmmo120(token,weapon,{availableOnly:true,loadedTypeId:locked});
    const ammo=compatible.find(row=>String(row.id)===String(state.ammoTypeId||weapon?.ammoTypeId||''))||compatible[0]||ammoForWeapon118(weapon,state);
    return{ammo,qty:ammo?inventoryQty105(tokenInventoryOwner120(token),ammo.id):0,compatible};
  }
  function consumeAmmoInventory118(token,itemId,qty){
    const owner=tokenInventoryOwner120(token),entity=owner.entity,take=Math.max(0,Math.trunc(num(qty,0)));if(!entity||!itemId||!take)return 0;
    const row=list(owner.rows).find(entry=>String(entry?.itemId||'')===String(itemId));if(!row)return 0;
    const used=Math.min(take,Math.max(0,Math.trunc(num(row.qty,0))));row.qty=Math.max(0,Math.trunc(num(row.qty,0))-used);
    if(Array.isArray(row.positions))row.positions=row.positions.slice(0,row.qty);
    if(row.qty<=0)owner.set(owner.rows.filter(entry=>entry!==row));
    if(token.playerId&&App.state?.users?.[token.playerId])App.state.users[token.playerId]=entity;
    return used;
  }
  function grenadeForToken105(token) { const grenades=ownedItems105(token,'grenade'); return grenades.find(g=>g.id===token?.grenadeId)||grenades[0]||null; }
  // v1.0.109: all tactical ranges are stored and interpreted as whole/decimal HEX COUNTS.
  function tokenVisionCells(token, scene) {
    if (num(token?.visionRange, 0) > 0) return Math.max(0, num(token.visionRange));
    if (token?.equipmentItemId && ['turret','drone'].includes(String(token.equipmentType || equipmentItem105(token.equipmentItemId)?.type || ''))) {
      return Math.max(0, num(equipmentItem105(token.equipmentItemId)?.unitVisionRange, 0));
    }
    const wc = combatConfig(entityForToken(token) || {});
    if (wc.visionRange > 0) return Math.max(0, wc.visionRange);
    if (num(token?.visionRadius, 0) > 0) return Math.max(0, num(token.visionRadius));
    return Math.max(1, num(scene?.visionRadius, COMBAT_DEFAULT_VISION));
  }
  function tokenMoveCells(token, scene) {
    if (num(token?.moveRange, 0) > 0) return injurySpeed129(Math.max(0,num(token.moveRange)),token);
    if (token?.equipmentItemId && ['turret','drone'].includes(String(token.equipmentType || equipmentItem105(token.equipmentItemId)?.type || ''))) {
      return injurySpeed129(Math.max(0,num(equipmentItem105(token.equipmentItemId)?.unitMoveRange,0)),token);
    }
    const wc = combatConfig(entityForToken(token) || {});
    return injurySpeed129(Math.max(0,wc.moveRange??DEFAULT_MOVE_WORLD),token);
  }
  function tokenAttackCells(token, scene) {
    if (num(token?.attackRange, 0) > 0) return Math.max(0, num(token.attackRange));
    const weapon = weaponForToken105(token) || {};
    return Math.max(0, num(weapon.range ?? weapon.attackRange ?? weapon.maxRange ?? weapon.distance, 0));
  }
  function grenadeRangeCells105(item,scene){return Math.max(0,num(item?.grenadeRange??item?.throwRange??item?.range,0));}
  function grenadeRadiusCells105(item,scene){return Math.max(0,num(item?.grenadeRadius??item?.blastRadius??item?.radius,0));}

  function scenePointFromEvent(event, stage, scene) {
    const rect = stage.getBoundingClientRect();
    return { x: clamp104(((event.clientX - rect.left) / Math.max(1, rect.width)) * scene.width, 0, scene.width), y: clamp104(((event.clientY - rect.top) / Math.max(1, rect.height)) * scene.height, 0, scene.height) };
  }
  function centerOf(obj) { return { x: num(obj.x) + num(obj.w,1)/2, y: num(obj.y) + num(obj.h,1)/2 }; }
  function dist(a,b) { return Math.hypot(num(a.x)-num(b.x), num(a.y)-num(b.y)); }

  function pointSegmentDistance(p, a, b) {
    const vx=b.x-a.x, vy=b.y-a.y, wx=p.x-a.x, wy=p.y-a.y;
    const c1=vx*wx+vy*wy;
    if (c1<=0) return dist(p,a);
    const c2=vx*vx+vy*vy;
    if (c2<=c1) return dist(p,b);
    const t=c1/c2;
    return dist(p,{x:a.x+t*vx,y:a.y+t*vy});
  }
  function pointInPolygon(point, points = []) {
    if (!Array.isArray(points) || points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      const hit = ((a.y > point.y) !== (b.y > point.y)) &&
        (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 1e-9) + a.x);
      if (hit) inside = !inside;
    }
    return inside;
  }
  function pointInAssetAlpha110(asset,x,y,padding=0){
    const ax=num(asset.x), ay=num(asset.y), aw=Math.max(.001,num(asset.w,1)), ah=Math.max(.001,num(asset.h,1));
    // Convert the scene point back into the unrotated image-local space.
    const cx=ax+aw/2, cy=ay+ah/2, angle=-num(asset.rotation,0)*Math.PI/180;
    const dx=x-cx, dy=y-cy, rx=dx*Math.cos(angle)-dy*Math.sin(angle)+cx, ry=dx*Math.sin(angle)+dy*Math.cos(angle)+cy;
    const lx=(rx-ax)/aw, ly=(ry-ay)/ah;
    if(lx < -padding/aw || lx > 1+padding/aw || ly < -padding/ah || ly > 1+padding/ah)return false;
    const meta=asset.imageMeta;
    if(!meta||!meta.alphaMask)return lx>=0&&lx<=1&&ly>=0&&ly<=1;
    const b=meta.alphaBounds||{x:0,y:0,w:1,h:1};
    if(lx < b.x-padding/aw || lx > b.x+b.w+padding/aw || ly < b.y-padding/ah || ly > b.y+b.h+padding/ah)return false;
    if(padding>0)return true; // conservative clearance around a transparent-shape obstacle
    const m=meta.alphaMask, gx=Math.max(0,Math.min(m.w-1,Math.floor(lx*m.w))), gy=Math.max(0,Math.min(m.h-1,Math.floor(ly*m.h)));
    const spans=Array.isArray(m.rows?.[gy])?m.rows[gy]:[];
    return spans.some(span=>gx>=span[0]&&gx<=span[1]);
  }
  function movementBlockedAt(scene, x, y, ignoreTokenId = '', clearance = 0) {
    const p={x,y}, pad=Math.max(0,num(clearance,0));
    for (const asset of list(scene.assets)) {
      if (!asset.blockMovement) continue;
      if (pointInAssetAlpha110(asset,x,y,pad)) return true;
    }
    for (const zone of list(scene.templates)) {
      if (!zone.blockMovement) continue;
      if (zone.shape === 'wall' && zone.points?.length > 1) {
        for (let i=1;i<zone.points.length;i++) if (pointSegmentDistance(p, zone.points[i-1], zone.points[i]) <= Math.max(.08, num(zone.thickness,.18))+pad) return true;
      } else if (zone.shape === 'polygon' && zone.points?.length > 2) {
        if (pointInPolygon(p, zone.points)) return true;
        for (let i=0;i<zone.points.length;i++) if (pointSegmentDistance(p, zone.points[i], zone.points[(i+1)%zone.points.length]) <= pad) return true;
      } else if (x >= zone.x-pad && x <= zone.x + zone.w+pad && y >= zone.y-pad && y <= zone.y + zone.h+pad) return true;
    }
    const runtime = Combat.getRuntime(scene.id);
    for (const token of list(runtime?.tokens)) {
      if (token.id === ignoreTokenId || !token.blockMovement) continue;
      if (x >= token.x-pad && x <= token.x + token.w+pad && y >= token.y-pad && y <= token.y + token.h+pad) return true;
    }
    return false;
  }
  function movementSegmentBlocked(scene,a,b,ignoreTokenId='',clearance=0){
    const length=dist(a,b),steps=Math.max(1,Math.ceil(length/.12));
    for(let i=1;i<=steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(movementBlockedAt(scene,x,y,ignoreTokenId,clearance))return true;}
    return false;
  }
  function sightBlockedAt105(scene,x,y,ignoreIds=new Set()){
    const p={x,y};
    for(const asset of list(scene.assets)){const type=normalizeCoverType120(asset.coverType),blocks=type==='total'?!asset.coverPenetrable:Boolean(asset.blockSight);if(!blocks)continue;if(pointInAssetAlpha110(asset,x,y,0))return true;}
    for(const zone of list(scene.templates)){const type=normalizeCoverType120(zone.coverType),blocks=type==='total'?!zone.coverPenetrable:Boolean(zone.blockSight)&&type==='none';if(!blocks)continue;if(zone.shape==='wall'&&zone.points?.length>1){for(let i=1;i<zone.points.length;i++)if(pointSegmentDistance(p,zone.points[i-1],zone.points[i])<=Math.max(.05,num(zone.thickness,.18)))return true;}else if(zone.shape==='polygon'&&zone.points?.length>2){if(pointInPolygon(p,zone.points))return true;}else if(x>=num(zone.x)&&x<=num(zone.x)+num(zone.w,1)&&y>=num(zone.y)&&y<=num(zone.y)+num(zone.h,1))return true;}
    for(const zone of thinkerZoneModels125(Combat.getRuntime(scene.id),scene)){if(!zone.blockSight||zone.allowVision)continue;const cx=num(zone.x)+num(zone.w,1)/2,cy=num(zone.y)+num(zone.h,1)/2,rx=Math.max(.001,num(zone.w,1)/2),ry=Math.max(.001,num(zone.h,1)/2);if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)return true;}
    for(const token of list(Combat.getRuntime(scene.id)?.tokens)){if(ignoreIds.has(token.id)||!token.blockSight)continue;if(x>=num(token.x)&&x<=num(token.x)+num(token.w,1)&&y>=num(token.y)&&y<=num(token.y)+num(token.h,1))return true;}
    return false;
  }
  function sightSegmentBlocked105(scene,a,b,ignoreIds=[]){const ids=new Set(ignoreIds);const length=dist(a,b),steps=Math.max(2,Math.ceil(length/.08));for(let i=1;i<steps;i++){const t=i/steps;if(sightBlockedAt105(scene,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,ids))return true;}return false;}
  function coverBetween120(scene,a,b){
    const found=[];
    for(const asset of list(scene?.assets)){
      const type=normalizeCoverType120(asset?.coverType);
      if(type==='none')continue;
      const length=Math.max(.001,dist(a,b)),steps=Math.max(4,Math.ceil(length/.08));
      let intersects=false;
      // Endpoints are excluded so scenery directly under a token does not count as
      // cover against every direction; the line must cross the asset between units.
      for(let i=1;i<steps;i++){
        const t=i/steps;if(t<.06||t>.94)continue;
        if(pointInAssetAlpha110(asset,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,0)){intersects=true;break;}
      }
      if(intersects){const defaults=coverDefaults120(type);found.push({id:asset.id,name:asset.name||'Укрытие',type,armorBonus:Math.max(0,num(asset.coverArmorBonus,defaults.armor)),defenseBonus:0,hardness:Math.max(0,num(asset.coverHardness,0)),penetrable:Boolean(asset.coverPenetrable)});}
    }
    for(const zone of list(scene?.templates)){
      const type=normalizeCoverType120(zone?.coverType);if(type==='none'||zone.shape!=='wall'||list(zone.points).length<2)continue;
      let intersects=false;const innerA={x:num(a.x)+(num(b.x)-num(a.x))*.06,y:num(a.y)+(num(b.y)-num(a.y))*.06},innerB={x:num(a.x)+(num(b.x)-num(a.x))*.94,y:num(a.y)+(num(b.y)-num(a.y))*.94};
      for(let index=1;index<zone.points.length;index++)if(segmentsIntersect122(innerA,innerB,zone.points[index-1],zone.points[index],Math.max(.02,num(zone.thickness,.18)/2))){intersects=true;break;}
      if(intersects){const defaults=coverDefaults120(type);found.push({id:zone.id,name:zone.label||zone.name||'Стена',type,armorBonus:Math.max(0,num(zone.coverArmorBonus,defaults.armor)),defenseBonus:0,hardness:Math.max(0,num(zone.coverHardness,0)),penetrable:Boolean(zone.coverPenetrable)});}
    }
    if(!found.length)return{assets:[],armorBonus:0,defenseBonus:0,label:'',concealment:false,blocksAttack:false,hardness:0};
    const total=found.filter(row=>row.type==='total').sort((x,y)=>y.hardness-x.hardness)[0],physical=found.filter(row=>!['concealment','total'].includes(row.type)).sort((x,y)=>y.armorBonus-x.armorBonus)[0],concealment=found.some(row=>row.type==='concealment');
    const strongest=total||physical||found[0];
    return{assets:found,armorBonus:total?0:(physical?.armorBonus||0),defenseBonus:0,label:strongest?.name||'',concealment,blocksAttack:Boolean(total&&!total.penetrable),hardness:total?.penetrable?total.hardness:0,total};
  }
  function segmentsIntersect122(a,b,c,d,tolerance=1e-7){
    const orient=(p,q,r)=>(num(q.y)-num(p.y))*(num(r.x)-num(q.x))-(num(q.x)-num(p.x))*(num(r.y)-num(q.y));
    const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
    if(((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0)))return true;
    // Thick and collinear walls should count as cover as well. Testing all
    // four endpoints against the opposite segment also catches grazing shots.
    return pointSegmentDistance(a,c,d)<=tolerance||pointSegmentDistance(b,c,d)<=tolerance||pointSegmentDistance(c,a,b)<=tolerance||pointSegmentDistance(d,a,b)<=tolerance;
  }

  function keyCell(ix,iy){ return `${ix}:${iy}`; }
  function findPath(scene, start, end, tokenId = '') {
    const step=PATH_STEP, cols=Math.ceil(scene.width/step)+1, rows=Math.ceil(scene.height/step)+1;
    const movingToken=list(Combat.getRuntime(scene.id)?.tokens).find(t=>t.id===tokenId);
    const clearance=movingToken?Math.max(.06,Math.min(num(movingToken.w,1),num(movingToken.h,1))*.32):.06;
    if(movementBlockedAt(scene,end.x,end.y,tokenId,clearance))return null;
    const toCell=p=>({x:clamp104(Math.round(p.x/step),0,cols-1),y:clamp104(Math.round(p.y/step),0,rows-1)});
    const toPoint=c=>({x:clamp104(c.x*step,0,scene.width),y:clamp104(c.y*step,0,scene.height)});
    const s=toCell(start), g=toCell(end), sk=keyCell(s.x,s.y), gk=keyCell(g.x,g.y);
    const open=new Map([[sk,{...s,g:0,f:dist(s,g)}]]), came=new Map(), score=new Map([[sk,0]]);
    const dirs=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[-1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,-1,Math.SQRT2]];
    let loops=0;
    while(open.size && loops++<18000){
      let currentKey='',current=null;
      for(const [k,v] of open){ if(!current || v.f<current.f){current=v;currentKey=k;} }
      open.delete(currentKey);
      if(currentKey===gk){
        const cells=[g]; let k=gk;
        while(came.has(k)){ k=came.get(k); const [x,y]=k.split(':').map(Number); cells.push({x,y}); }
        cells.reverse();
        const points=cells.map(toPoint); points[0]={...start}; points[points.length-1]={...end};
        return simplifyPath(points);
      }
      for(const [dx,dy,cost] of dirs){
        const nx=current.x+dx,ny=current.y+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
        const nk=keyCell(nx,ny), point=toPoint({x:nx,y:ny}),currentPoint=toPoint(current);
        if(movementSegmentBlocked(scene,currentPoint,point,tokenId,clearance))continue;
        if(dx && dy){
          const p1=toPoint({x:current.x+dx,y:current.y}),p2=toPoint({x:current.x,y:current.y+dy});
          if(movementBlockedAt(scene,p1.x,p1.y,tokenId,clearance)||movementBlockedAt(scene,p2.x,p2.y,tokenId,clearance))continue;
        }
        const tentative=(score.get(currentKey)??Infinity)+cost*step;
        if(tentative >= (score.get(nk)??Infinity))continue;
        came.set(nk,currentKey);score.set(nk,tentative);
        open.set(nk,{x:nx,y:ny,g:tentative,f:tentative+Math.hypot(nx-g.x,ny-g.y)*step});
      }
    }
    return null;
  }
  function simplifyPath(points) {
    if(points.length<3)return points;
    const out=[points[0]];
    for(let i=1;i<points.length-1;i++){
      const a=out[out.length-1],b=points[i],c=points[i+1];
      const abx=b.x-a.x,aby=b.y-a.y,bcx=c.x-b.x,bcy=c.y-b.y;
      if(Math.abs(abx*bcy-aby*bcx)>.001)out.push(b);
    }
    out.push(points[points.length-1]);return out;
  }
  function pathLength(points){let total=0;for(let i=1;i<points.length;i++)total+=dist(points[i-1],points[i]);return total;}
  function truncatePath(points,maxLen){
    if(maxLen<=0)return {points:[points[0]],limited:true,end:points[0]};
    let used=0,out=[points[0]];
    for(let i=1;i<points.length;i++){
      const seg=dist(points[i-1],points[i]);
      if(used+seg<=maxLen+.0001){out.push(points[i]);used+=seg;continue;}
      const remain=Math.max(0,maxLen-used),t=seg?remain/seg:0;
      const end={x:points[i-1].x+(points[i].x-points[i-1].x)*t,y:points[i-1].y+(points[i].y-points[i-1].y)*t};
      out.push(end);return {points:out,limited:true,end,length:maxLen};
    }
    return {points:out,limited:false,end:out[out.length-1],length:used};
  }

  const HEX_SIDE_V107 = .42;
  function hexMetrics107(){
    const side=HEX_SIDE_V107, hexH=Math.sqrt(3)*side;
    return {side,hexH,stepX:side*1.5,tokenSize:hexH*.90};
  }
  function nearestHexCenter107(scene,point={x:0,y:0}){const n=nearestHexNode108(scene,point);return {x:n.x,y:n.y};}
  function hexStepDistance109(){return hexMetrics107().hexH;}
  function oddQToCube109(node){const q=num(node?.col,0),row=num(node?.row,0),r=row-(q-(q&1))/2;return{x:q,z:r,y:-q-r};}
  function cubeToOddQ109(cube){const col=Math.round(num(cube?.x,0)),z=Math.round(num(cube?.z,0)),row=Math.round(z+(col-(col&1))/2);return{col,row};}
  function cubeRound109(c){let rx=Math.round(c.x),ry=Math.round(c.y),rz=Math.round(c.z);const dx=Math.abs(rx-c.x),dy=Math.abs(ry-c.y),dz=Math.abs(rz-c.z);if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;return{x:rx,y:ry,z:rz};}
  function hexDistanceNodes109(a,b){const ac=oddQToCube109(a),bc=oddQToCube109(b);return Math.max(Math.abs(ac.x-bc.x),Math.abs(ac.y-bc.y),Math.abs(ac.z-bc.z));}
  function hexDistancePoints109(scene,a,b){return hexDistanceNodes109(nearestHexNode108(scene,a),nearestHexNode108(scene,b));}
  function hexEndpointAtRange109(scene,start,target,maxHexes){
    const s=nearestHexNode108(scene,start),g=nearestHexNode108(scene,target),distance=hexDistanceNodes109(s,g),limit=Math.max(0,Math.floor(num(maxHexes,0)+1e-6));
    if(distance<=limit)return{x:g.x,y:g.y,node:g,distance,limited:false};
    if(limit<=0)return{x:s.x,y:s.y,node:s,distance,limited:distance>0};
    const sc=oddQToCube109(s),gc=oddQToCube109(g),t=limit/Math.max(1,distance),rounded=cubeRound109({x:sc.x+(gc.x-sc.x)*t,y:sc.y+(gc.y-sc.y)*t,z:sc.z+(gc.z-sc.z)*t}),off=cubeToOddQ109(rounded),node=hexNode108(scene,off.col,off.row)||s;
    return{x:node.x,y:node.y,node,distance,limited:true};
  }
  function hexLabel109(value){const n=Math.max(0,Math.round(num(value,0)));return `${n} ${n===1?'гекс':'гексов'}`;}

  function playerVisionSources112(scene,runtime){
    return list(runtime?.tokens).filter(t=>(t.playerId||t.sharesVisionWithPlayers)&&!t.hidden&&t.visibleToPlayers!==false).map(token=>({token,origin:centerOf(token),radius:Math.max(0,Math.floor(tokenVisionCells(token,scene)+1e-6))}));
  }
  function visibleHexCells112(scene,runtime){
    const cells=new Map();
    for(const src of playerVisionSources112(scene,runtime)){
      const center=nearestHexNode108(scene,src.origin),cc=oddQToCube109(center),radius=src.radius;
      for(let dx=-radius;dx<=radius;dx++){
        const yMin=Math.max(-radius,-dx-radius),yMax=Math.min(radius,-dx+radius);
        for(let dy=yMin;dy<=yMax;dy++){
          const dz=-dx-dy,cube={x:cc.x+dx,y:cc.y+dy,z:cc.z+dz},off=cubeToOddQ109(cube),node=hexNode108(scene,off.col,off.row);
          if(!node)continue;
          if((node.col!==center.col||node.row!==center.row)&&sightSegmentBlocked105(scene,src.origin,node,[src.token.id]))continue;
          cells.set(`${node.col}:${node.row}`,node);
        }
      }
    }
    return [...cells.values()];
  }
  function visionBoundarySegments112(scene,runtime){
    const {side}=hexMetrics107(),edges=new Map();
    for(const cell of visibleHexCells112(scene,runtime)){
      const pts=[];for(let i=0;i<6;i++){const a=Math.PI/3*i;pts.push({x:cell.x+side*Math.cos(a),y:cell.y+side*Math.sin(a)});}
      for(let i=0;i<6;i++){const a=pts[i],b=pts[(i+1)%6],ka=`${a.x.toFixed(3)},${a.y.toFixed(3)}`,kb=`${b.x.toFixed(3)},${b.y.toFixed(3)}`,key=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;if(edges.has(key))edges.delete(key);else edges.set(key,{a,b});}
    }
    return [...edges.values()];
  }
  function visionOverlayMarkup112(scene,runtime){
    if(scene.fogMode!=='objects')return '';
    const segs=visionBoundarySegments112(scene,runtime);if(!segs.length)return '';
    return `<svg class="scene-vision-boundary-v112" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none" aria-hidden="true">${segs.map(e=>`<line x1="${e.a.x}" y1="${e.a.y}" x2="${e.b.x}" y2="${e.b.y}"/>`).join('')}</svg>`;
  }

  function fitTokenToHex107(token,scene,center=null){
    if(!token||!scene)return token;
    const size=hexMetrics107().tokenSize,c=center||nearestHexCenter107(scene,centerOf(token));
    token.w=size;token.h=size;
    token.x=clamp104(c.x-size/2,0,Math.max(0,num(scene.width)-size));
    token.y=clamp104(c.y-size/2,0,Math.max(0,num(scene.height)-size));
    return token;
  }
  function nearestHexNode108(scene,point={x:0,y:0}){
    const w=Math.max(1,num(scene?.width,20)),h=Math.max(1,num(scene?.height,12));
    const {side,hexH,stepX,tokenSize}=hexMetrics107();
    const approx=Math.round((num(point.x)-side)/stepX);let best=null,bestD=Infinity;
    for(let col=Math.max(0,approx-3);col<=approx+3;col++){
      const cx=side+col*stepX;if(cx<tokenSize/2||cx>w-tokenSize/2)continue;
      const base=hexH/2+(col%2)*hexH/2,row0=Math.round((num(point.y)-base)/hexH);
      for(let row=Math.max(0,row0-3);row<=row0+3;row++){
        const cy=base+row*hexH;if(cy<tokenSize/2||cy>h-tokenSize/2)continue;
        const d=(cx-num(point.x))**2+(cy-num(point.y))**2;if(d<bestD){bestD=d;best={col,row,x:cx,y:cy};}
      }
    }
    return best||{col:0,row:0,x:side,y:hexH/2};
  }
  function hexNode108(scene,col,row){
    const {side,hexH,stepX,tokenSize}=hexMetrics107(),w=Math.max(1,num(scene?.width,20)),h=Math.max(1,num(scene?.height,12));
    const x=side+col*stepX,y=hexH/2+(col%2)*hexH/2+row*hexH;
    if(col<0||row<0||x<tokenSize/2||x>w-tokenSize/2||y<tokenSize/2||y>h-tokenSize/2)return null;
    return {col,row,x,y};
  }
  function hexNeighbours108(scene,node){
    const even=(node.col%2)===0;
    const offsets=even?[[1,-1],[1,0],[0,-1],[0,1],[-1,-1],[-1,0]]:[[1,0],[1,1],[0,-1],[0,1],[-1,0],[-1,1]];
    return offsets.map(([dc,dr])=>hexNode108(scene,node.col+dc,node.row+dr)).filter(Boolean);
  }
  function terrainCostAt122(scene,point){
    return list(scene?.assets).some(asset=>asset?.difficultTerrain&&pointInAssetAlpha110(asset,num(point?.x),num(point?.y),0))?2:1;
  }
  function findHexPath108(scene,start,end,tokenId=''){
    const s=nearestHexNode108(scene,start),g=nearestHexNode108(scene,end),runtime=Combat.getRuntime(scene.id),moving=list(runtime?.tokens).find(t=>t.id===tokenId);
    const clearance=moving?Math.max(.04,Math.min(num(moving.w,1),num(moving.h,1))*.18):.04;
    if(movementBlockedAt(scene,g.x,g.y,tokenId,clearance))return null;
    const key=n=>`${n.col}:${n.row}`,sk=key(s),gk=key(g),open=new Map([[sk,{...s,f:0}]]),came=new Map(),score=new Map([[sk,0]]);
    let loops=0;
    while(open.size&&loops++<12000){
      let ck='',cur=null;for(const [k,v] of open){if(!cur||v.f<cur.f){ck=k;cur=v;}}open.delete(ck);
      if(ck===gk){const out=[cur];let k=ck;while(came.has(k)){k=came.get(k);const [c,r]=k.split(':').map(Number);const n=hexNode108(scene,c,r);if(n)out.push(n);}out.reverse();return out.map(n=>({x:n.x,y:n.y}));}
      for(const n of hexNeighbours108(scene,cur)){
        if(movementSegmentBlocked(scene,{x:cur.x,y:cur.y},{x:n.x,y:n.y},tokenId,clearance))continue;
        const nk=key(n),tent=(score.get(ck)??Infinity)+terrainCostAt122(scene,n);if(tent>=(score.get(nk)??Infinity))continue;
        came.set(nk,ck);score.set(nk,tent);const heuristic=dist(n,g)/Math.max(.001,hexMetrics107().hexH);open.set(nk,{...n,f:tent+heuristic});
      }
    }
    return null;
  }
  function truncateHexPath108(path,maxCells){
    const scene=Combat.getScene(),maxCost=Math.max(0,Math.floor(num(maxCells,0)+1e-6));let cost=0,used=0;
    for(let index=1;index<path.length;index++){const next=terrainCostAt122(scene,path[index]);if(cost+next>maxCost)break;cost+=next;used=index;}
    const points=path.slice(0,used+1),steps=Math.max(0,path.length-1);
    return {points,steps:used,cost,limited:used<steps,end:points[points.length-1]||path[0]};
  }
  function canMechanicalMove108(token){
    if(!token||token.locked||!Combat.isDm?.())return false;
    if(isDroneToken129(token))return Boolean(activeDroneCommand129(token));
    const runtime=Combat.getRuntime?.();if(!runtime)return false;
    const order=list(runtime.initiativeOrder);if(!order.length)return true;
    const current=runtime.tokens.find(t=>t.id===order[Math.max(0,Math.min(order.length-1,num(runtime.turnIndex,0)))])||null;
    return !current||current.id===token.id;
  }

  function hexGridSvg(scene) {
    const w=Math.max(1,num(scene.width,20)),h=Math.max(1,num(scene.height,12));
    const {side,hexH,stepX}=hexMetrics107();
    const paths=[];
    for(let col=0,cx=side;cx<=w+side;col++,cx=side+col*stepX){
      const offset=(col%2)*hexH/2;
      for(let row=0,cy=hexH/2+offset;cy<=h+hexH/2;row++,cy=hexH/2+offset+row*hexH){
        const pts=[];
        for(let i=0;i<6;i++){const a=Math.PI/3*i;pts.push(`${(cx+side*Math.cos(a)).toFixed(3)},${(cy+side*Math.sin(a)).toFixed(3)}`);}
        paths.push(`<polygon points="${pts.join(' ')}"/>`);
      }
    }
    return `<svg class="scene-hex-grid-v104" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><g>${paths.join('')}</g></svg>`;
  }
  function objectStyle(obj,scene,z=20){return `left:${(num(obj.x)/scene.width*100).toFixed(4)}%;top:${(num(obj.y)/scene.height*100).toFixed(4)}%;width:${(num(obj.w,1)/scene.width*100).toFixed(4)}%;height:${(num(obj.h,1)/scene.height*100).toFixed(4)}%;transform:rotate(${num(obj.rotation)}deg);z-index:${num(obj.z,z)};`;}
  function tokenMarkup(token, scene, currentId='') {
    const selected=Combat.selectedObject?.kind==='token'&&Combat.selectedObject?.id===token.id;
    const hp=clamp104(num(token.hpCurrent)/Math.max(1,num(token.hpMax,1))*100,0,100);
    const fallback=(String(token.name||'•').trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase()||'•');
    const searchable=Boolean(token.npcId)&&num(token.hpCurrent,0)<=0;
    const searched=Boolean(token.lootStateV118?.searched);
    return `<button class="combat-object combat-token scene-token-v104 ${selected?'selected':''} ${currentId===token.id?'turn':''} ${searchable?'is-searchable-v118':''} ${searched?'is-searched-v118':''} ${token.proneV122?'is-prone-v122':''}" type="button" data-scene-kind-v104="token" data-scene-id-v104="${html(token.id)}" style="${objectStyle(token,scene,40)}--token-accent:${html(token.color||'#7df9ff')};">
      ${token.image?`<img src="${html(token.image)}" alt="" decoding="async" draggable="false"/>`:`<span class="combat-token-fallback">${html(fallback)}</span>`}<span class="combat-token-name">${html(token.name)}</span>${list(token.timedModifiersV122).length?`<span class="scene-token-effects-v122" title="${html(token.timedModifiersV122.map(row=>`${row.name}: ${row.remainingTurns}`).join('\n'))}">${token.timedModifiersV122.length}</span>`:''}${token.proneV122?`<span class="scene-token-prone-v122">ЛЕЖИТ</span>`:''}${searchable?`<span class="scene-token-loot-v118" data-scene-search-v118="${html(token.id)}" role="button" title="${searched?'Показать найденный лут':'Обыскать NPC'}">${searched?'✓':'⌕'}</span>`:''}<span class="combat-token-hp"><i style="width:${hp}%"></i></span></button>`;
  }
  function assetMarkup(asset,scene){
    const selected=Combat.selectedObject?.kind==='asset'&&Combat.selectedObject?.id===asset.id,cover=normalizeCoverType120(asset.coverType);
    const coverLabel={weak:'СЛАБОЕ',partial:'ЧАСТИЧНОЕ',good:'ХОРОШЕЕ',total:'ПОЛНОЕ',concealment:'МАСКИРОВКА'}[cover]||'',badges=[coverLabel,asset.difficultTerrain?'ТРУДНАЯ МЕСТНОСТЬ':''].filter(Boolean).join(' · ');
    return `<button class="combat-object combat-asset scene-asset-v104 ${selected?'selected':''} cover-${html(cover)} ${asset.difficultTerrain?'difficult-terrain-v122':''}" type="button" data-scene-kind-v104="asset" data-scene-id-v104="${html(asset.id)}" data-cover-type-v120="${html(cover)}" style="${objectStyle(asset,scene,10)}opacity:${clamp104(asset.opacity??1,.05,1)};">${asset.image?`<img src="${html(asset.image)}" alt="" draggable="false"/>`:`<span>◫</span>`}${badges?`<span class="scene-cover-badge-v120">${badges}</span>`:''}${asset.label?`<span class="combat-object-label">${html(asset.label)}</span>`:''}${selected&&!asset.locked&&local.ui.action==='select'?`<span class="asset-transform-v133 asset-rotate-v133" data-asset-transform-v133="rotate" title="Перетащите для поворота; Shift — шаг 15°">↻</span>${['nw','ne','sw','se'].map(c=>`<span class="asset-transform-v133 asset-resize-v133 ${c}" data-asset-transform-v133="${c}" title="Перетащите для размера; Shift — сохранить пропорции"></span>`).join('')}`:''}</button>`;
  }
  function zoneMarkup(zone,scene){
    const selected=Combat.selectedObject?.kind==='zone'&&Combat.selectedObject?.id===zone.id;
    if(['wall','polygon'].includes(zone.shape)&&zone.points?.length>1){
      const points=zone.points.map(p=>`${p.x},${p.y}`).join(' '), color=html(zone.color||'rgba(255,190,92,.75)');
      const handle=selected?`<span class="scene-zone-resize-handle-v107 scene-zone-resize-absolute-v107" data-zone-resize-v107="${html(zone.id)}" style="left:${((num(zone.x)+num(zone.w,1))/scene.width*100).toFixed(4)}%;top:${((num(zone.y)+num(zone.h,1))/scene.height*100).toFixed(4)}%" title="Изменить размер зоны"></span>`:'';
      if(zone.shape==='polygon') return `<svg class="scene-zone-vector-wrap-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polygon class="scene-polygon-v104 ${selected?'selected':''}" data-scene-kind-v104="zone" data-scene-id-v104="${html(zone.id)}" points="${points}" style="--zone-color:${color}"/></svg>${handle}`;
      return `<svg class="scene-zone-vector-wrap-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polyline class="scene-wall-v104 ${selected?'selected':''}" data-scene-kind-v104="zone" data-scene-id-v104="${html(zone.id)}" points="${points}" style="--zone-color:${color};stroke-width:${num(zone.thickness,.18)}"/></svg>${handle}`;
    }
    return `<button class="combat-object combat-template scene-zone-v104 shape-${html(zone.shape||'circle')} ${selected?'selected':''}" type="button" data-scene-kind-v104="zone" data-scene-id-v104="${html(zone.id)}" style="${objectStyle(zone,scene,25)}--template-color:${html(zone.color||'rgba(255,190,92,.35)')};">${zone.label?`<span class="combat-template-label">${html(zone.label)}</span>`:''}${selected?`<span class="scene-zone-resize-handle-v107" data-zone-resize-v107="${html(zone.id)}" title="Изменить размер зоны"></span>`:''}</button>`;
  }
  function previewMarkup(scene) {
    const p=local.preview;if(!p)return '';
    if(p.kind==='route'){
      const points=list(p.points).map(v=>`${v.x},${v.y}`).join(' '), end=p.end||p.points?.[p.points.length-1];
      return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polyline class="scene-route-v104 ${p.limited?'limited':''} ${p.blocked?'blocked':''}" points="${points}"/>${p.limited&&end?`<g class="scene-route-cross-v104" transform="translate(${end.x} ${end.y})"><path d="M-.28-.28 L.28.28 M.28-.28 L-.28.28"/></g>`:''}</svg><div class="scene-measure-label-v104">${html(p.label||'')}</div>`;
    }
    if(p.kind==='measure' || p.kind==='circle' || p.kind==='cone'){
      const a=p.start,b=p.end,r=Math.max(0,num(p.radius,dist(a,b))), label=p.label||hexLabel109(p.hexes??hexDistancePoints109(scene,a,b));
      if(p.kind==='circle') return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><circle class="scene-measure-shape-v104" cx="${a.x}" cy="${a.y}" r="${r}"/></svg><div class="scene-measure-label-v104">${html(label)}</div>`;
      if(p.kind==='cone'){
        const ang=Math.atan2(b.y-a.y,b.x-a.x), spread=Math.PI/6;
        const p1={x:a.x+Math.cos(ang-spread)*r,y:a.y+Math.sin(ang-spread)*r},p2={x:a.x+Math.cos(ang+spread)*r,y:a.y+Math.sin(ang+spread)*r};
        return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><path class="scene-measure-shape-v104" d="M ${a.x} ${a.y} L ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y} Z"/></svg><div class="scene-measure-label-v104">${html(label)}</div>`;
      }
      return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><line class="scene-measure-line-v104" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><circle class="scene-measure-dot-v104" cx="${b.x}" cy="${b.y}" r=".12"/></svg><div class="scene-measure-label-v104">${html(label)}</div>`;
    }
    if(p.kind==='grenade'){
      const a=p.start||{},end=p.end||{},r=Math.max(0,num(p.radius,0));
      return `<svg class="scene-preview-svg-v104 scene-grenade-preview-v105" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><line class="scene-measure-line-v104 ${p.limited?'limited':''}" x1="${a.x}" y1="${a.y}" x2="${end.x}" y2="${end.y}"/><circle class="scene-grenade-zone-v105" cx="${end.x}" cy="${end.y}" r="${r}"/>${p.limited?`<g class="scene-route-cross-v104" transform="translate(${end.x} ${end.y})"><path d="M-.28-.28 L.28.28 M.28-.28 L-.28.28"/></g>`:''}</svg><div class="scene-measure-label-v104">${html(p.label||'')}</div>`;
    }
    if(p.kind==='wall'&&p.points?.length>1) return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polyline class="scene-wall-preview-v104" points="${p.points.map(v=>`${v.x},${v.y}`).join(' ')}"/></svg>`;
    if(p.kind==='area'&&p.points?.length>1) return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polygon class="scene-area-preview-v104" points="${p.points.map(v=>`${v.x},${v.y}`).join(' ')}"/></svg>`;
    return '';
  }
  // v1.0.108: camera is session-runtime state. Rendering, snapping, initiative and persistence may read it but never move it.
  function cameraState108(sceneId=Combat.getSceneIdForView?.()){
    const key=String(sceneId||'').trim()||'__default';
    if(!local.cameraRuntime || typeof local.cameraRuntime!=='object')local.cameraRuntime=Object.create(null);
    if(!local.cameraRuntime[key]){
      const saved=local.store?.cameraByScene?.[key]||{};
      local.cameraRuntime[key]={zoom:clamp104(saved.zoom??1,.45,3.5),panX:num(saved.panX,0),panY:num(saved.panY,0)};
    }
    const view=local.cameraRuntime[key];
    view.zoom=clamp104(view.zoom,.45,3.5);view.panX=num(view.panX,0);view.panY=num(view.panY,0);
    return view;
  }
  Combat.getViewState=function(sceneId=this.getSceneIdForView?.()){return cameraState108(sceneId);};
  Combat.getViewTransform=function(sceneId=this.getSceneIdForView?.()){
    const view=cameraState108(sceneId);
    return `translate(${num(view.panX,0).toFixed(1)}px, ${num(view.panY,0).toFixed(1)}px) scale(${clamp104(view.zoom, .45, 3.5).toFixed(3)})`;
  };
  Combat.applyViewTransform=function(viewportEl=document.getElementById('combat-stage-viewport')){
    const stage=document.getElementById('combat-stage'),viewport=viewportEl||document.getElementById('combat-stage-viewport');
    if(!stage||!viewport)return;
    const sceneId=this.getSceneIdForView?.(),view=cameraState108(sceneId),metrics=this.getBoardMetrics?.(viewport)||{};
    view.viewportWidth=num(metrics.viewportWidth,viewport.clientWidth||0);view.viewportHeight=num(metrics.viewportHeight,viewport.clientHeight||0);view.boardWidth=num(metrics.boardWidth,0);view.boardHeight=num(metrics.boardHeight,0);
    stage.style.transform=this.getViewTransform(sceneId);
    viewport.classList.toggle('is-panning',Boolean(this.viewDragState));
    if(sceneId)this.queuePlayerDisplayMirrorUpdate?.(sceneId);
  };
  Combat.queueViewStateSave=function(sceneId=this.getSceneIdForView?.()){
    const key=String(sceneId||'').trim()||'__default',view=cameraState108(key);
    if(local.store){local.store.cameraByScene=local.store.cameraByScene||{};local.store.cameraByScene[key]=clone(view);}
    clearTimeout(this._viewStateSaveTimer);
    this._viewStateSaveTimer=setTimeout(()=>{queueStoreSave();this.queuePlayerDisplayMirrorUpdate?.(key);},90);
  };
  Combat.resetViewState=function(sceneId=this.getSceneIdForView?.(),options={}){
    const view=cameraState108(sceneId);view.zoom=1;view.panX=0;view.panY=0;
    this.applyViewTransform?.();
    if(options.persist!==false)this.queueViewStateSave?.(sceneId);
    if(options.render===true)this.render?.();
  };

  function renderBoard104(scene,runtime){
    const current=Combat.getCurrentTurnToken?.();
    const camera=Combat.getViewTransform?.(scene.id, document.getElementById('combat-stage-viewport')) || 'translate(0px,0px) scale(1)';
    return `<div class="scene-board-shell-v104">
      <div class="combat-stage-viewport scene-stage-viewport-v104" id="combat-stage-viewport"><div id="combat-stage-board-frame" class="scene-board-frame-v104"><div class="combat-stage scene-stage-v104" id="combat-stage" data-scene-id="${html(scene.id)}" style="--combat-cols:${scene.width};--combat-rows:${scene.height};background:${html(scene.backgroundColor)};transform:${camera};">
        <div class="combat-stage-bg" style="${scene.backgroundImage?`background-image:url('${html(scene.backgroundImage)}');`:''}"></div>${hexGridSvg(scene)}
        <div class="combat-stage-layer combat-assets-layer">${list(scene.assets).map(a=>assetMarkup(a,scene)).join('')}</div>
        <div class="combat-stage-layer combat-templates-layer">${list(scene.templates).map(z=>zoneMarkup(z,scene)).join('')}${thinkerZoneModels125(runtime,scene).map(z=>thinkerMarkup125(z,scene)).join('')}</div>
        <div class="combat-stage-layer combat-tokens-layer">${list(runtime.tokens).map(t=>tokenMarkup(t,scene,current?.id||'')).join('')}</div>
        ${visionOverlayMarkup112(scene,runtime)}
        <div class="scene-preview-layer-v104">${previewMarkup(scene)}</div>
      </div></div></div>
      ${local.ui.initiativeOpen?renderInitiativePanel112(runtime):''}
      <div class="scene-command-deck-v118">
        <div class="scene-measurebar-v118"><span class="scene-bar-label-v118">ИНСТРУМЕНТЫ</span>${actionButton('select','ВЫБОР')}${actionButton('pan','РУКА')}${actionButton('measure','ЛИНЕЙКА')}${actionButton('circle','КРУГ')}${actionButton('cone','КОНУС')}${actionButton('wall','СТЕНА')}${actionButton('area','ОБЛАСТЬ')}<button class="ghost" type="button" data-scene-action-v104="clear">ОЧИСТИТЬ</button></div>
        <div class="scene-actionbar-v104 scene-character-actions-v118"><span class="scene-bar-label-v118">ДЕЙСТВИЯ</span>${actionButton('move','ДВИЖЕНИЕ')}${renderPostureAction128()}${actionButton('attack','АТАКА')}${actionButton('grenade','ГРАНАТА')}${renderDisengageAction122()}${renderReloadAction120()}${renderMalfunctionAction122()}${renderBurstFinish122()}${renderSearchAction118()}${renderActiveSkills118()}${renderActiveEquipment129()}${renderDeviceActions129()}${renderActionEquipment105(scene,runtime)}<button class="ghost ${local.ui.initiativeOpen?'active':''}" id="scene-initiative-toggle-v112" type="button">ПОРЯДОК</button><span class="scene-action-spacer-v104"></span><span class="scene-round-v104">Раунд ${Math.max(1,num(runtime.round,1))}</span><button class="primary" id="scene-next-turn-v104" type="button">СЛЕДУЮЩИЙ ХОД</button></div>
      </div>
    </div>`;
  }
  function renderInitiativePanel112(runtime){
    const order=list(runtime?.initiativeOrder),tokens=new Map(list(runtime?.tokens).map(t=>[t.id,t])),turn=Math.max(0,Math.min(order.length-1,num(runtime?.turnIndex,0)));
    if(!order.length)return `<div class="scene-initiative-panel-v112"><span>Инициатива ещё не задана.</span></div>`;
    return `<div class="scene-initiative-panel-v112"><b>ПОРЯДОК ИНИЦИАТИВЫ</b>${order.map((id,i)=>{const t=tokens.get(id);if(!t)return'';return `<span class="${i===turn?'active':''}"><i>${i+1}</i>${html(t.name||'Юнит')}<small>${num(t.initiative,0)}</small></span>`;}).join('')}</div>`;
  }
  function actionButton(id,label){return `<button class="secondary ${local.ui.action===id?'active':''}" type="button" data-scene-action-v104="${id}">${label}</button>`;}
  function reloadAvailability120(token=selectedToken104()){
    const weapon=weaponForToken105(token);
    if(!token)return{enabled:false,reason:'Сначала выберите действующего юнита'};
    if(!weapon)return{enabled:false,reason:'У юнита нет выбранного оружия'};
    if(token.burstStateV122)return{enabled:false,reason:'Сначала завершите скорострельную очередь',token,weapon};
    if(weaponMalfunction122(token,weapon))return{enabled:false,reason:'Сначала устраните отказ оружия',token,weapon};
    const magazine=magazineState118(token,weapon);
    if(!magazine.size)return{enabled:false,reason:'Выбранное оружие не использует магазин',token,weapon,magazine};
    if(token.actionUsed)return{enabled:false,reason:'Обычное действие уже потрачено',token,weapon,magazine};
    if(magazine.loaded>=magazine.size)return{enabled:false,reason:'Магазин уже полон',token,weapon,magazine};
    const reserve=reserveAmmo118(token,weapon,magazine);
    if(!reserve.compatible.length||reserve.compatible.every(row=>row.ownedQty<=0))return{enabled:false,reason:'В инвентаре нет совместимых патронов',token,weapon,magazine,reserve};
    return{enabled:true,reason:`Перезарядить ${weapon.name||'оружие'}`,token,weapon,magazine,reserve};
  }
  function renderReloadAction120(){
    const state=reloadAvailability120();
    return `<button class="secondary scene-reload-action-v120" type="button" data-scene-reload-v118 ${state.enabled?'':'disabled'} title="${html(state.reason)}">ПЕРЕЗАРЯДКА</button>`;
  }
  function renderDisengageAction122(){const token=selectedToken104(),enabled=Boolean(token&&Combat.canActWithToken?.(token)&&!token.actionUsed&&!token.disengagedV122&&!token.burstStateV122);return `<button class="secondary" type="button" data-scene-disengage-v122 ${enabled?'':'disabled'} title="Потратить действие: движение не вызывает атаку по возможности">ОТХОД</button>`;}
  function postureAvailability128(token=selectedToken104()){
    const scene=Combat.getScene();if(!token||!scene)return{enabled:false,cost:0,remaining:0,reason:'Сначала выберите действующего юнита'};
    const total=Math.max(0,Math.floor(tokenMoveCells(token,scene)+1e-6)),cost=total>0?Math.max(1,Math.ceil(total/2)):0,spent=Math.max(0,Math.floor(num(token.movedThisTurn,0)+1e-6)),remaining=Math.max(0,total-spent);
    if(!canMechanicalMove108(token))return{enabled:false,cost,remaining,reason:'Сейчас не ход этого юнита'};
    if(token.burstStateV122)return{enabled:false,cost,remaining,reason:'Сначала завершите скорострельную очередь'};
    if(local.moveBusyV122||local.lua119.busy)return{enabled:false,cost,remaining,reason:'Предыдущее боевое действие ещё не завершено'};
    if(cost<=0||remaining<cost)return{enabled:false,cost,remaining,reason:`Недостаточно движения: нужно ${cost}, осталось ${remaining}`};
    return{enabled:true,cost,remaining,reason:`Стоимость: ${cost} из ${total} движения`,token};
  }
  function renderPostureAction128(){const state=postureAvailability128(),token=selectedToken104();return `<button class="secondary scene-posture-action-v128" type="button" data-scene-posture-v128 ${state.enabled?'':'disabled'} title="${html(state.reason)}">${token?.proneV122?'ВСТАТЬ':'ЛЕЧЬ'}${state.cost?` · ${state.cost}`:''}</button>`;}
  function renderBurstFinish122(){const token=selectedToken104();return token?.burstStateV122?`<button class="secondary active" type="button" data-scene-burst-finish-v122>ЗАВЕРШИТЬ ОЧЕРЕДЬ (${Math.max(0,token.burstStateV122.maxShots-token.burstStateV122.nextShot+1)})</button>`:'';}
  function renderMalfunctionAction122(){const token=selectedToken104(),weapon=weaponForToken105(token),jammed=weaponMalfunction122(token,weapon),enabled=jammed&&Combat.canActWithToken?.(token)&&!token.actionUsed;return jammed?`<button class="secondary" type="button" data-scene-clear-malfunction-v122 ${enabled?'':'disabled'}>УСТРАНИТЬ ОТКАЗ</button>`:'';}
  function skillForScene118(id){try{return Data.getSkill?.(id)||Data.skills?.[id]||worldData?.skills?.SKILLS?.[id]||null;}catch{return null;}}
  function activeSkillsForToken118(token=selectedToken104()){
    const entity=entityForToken(token)||{};
    return list(entity.skills).map(id=>skillForScene118(id)).filter(skill=>skill&&String(skill.skillType||skill.type||'skill')!=='specialization'&&String(skill.activationType||'passive')==='active');
  }
  function renderActiveSkills118(){
    const rows=activeSkillsForToken118();if(!rows.length)return'';
    return `<span class="scene-skill-actions-v118"><span>НАВЫКИ</span>${rows.map(skill=>`<button class="secondary scene-skill-action-v118" type="button" data-scene-skill-v118="${html(skill.id)}" title="${html(String(skill.description||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())}">${html(skill.name||skill.id)}</button>`).join('')}</span>`;
  }
  function activeEquipmentForToken129(token=selectedToken104()){if(!token)return[];return scriptSourcesForToken119(token).filter(source=>source.mode==='active'&&source.kind!=='skill');}
  function renderActiveEquipment129(){const token=selectedToken104(),rows=activeEquipmentForToken129(token);if(!rows.length)return'';const enabled=Boolean(token&&canCombatAct129(token)&&!token.actionUsed&&!token.burstStateV122);return `<span class="scene-skill-actions-v118"><span>СНАРЯЖЕНИЕ</span>${rows.map(source=>`<button class="secondary" type="button" data-scene-equipment-use-v129="${html(source.id)}" ${enabled?'':'disabled'}>${html(source.raw?.activeUseLabel||source.name||'Использовать')}</button>`).join('')}</span>`;}
  function deviceInventory129(token,type){const owner=tokenInventoryOwner120(token);return list(owner.rows).map(row=>{const item=equipmentItem105(row?.itemId);return item&&String(item.type)===type&&num(row?.qty,0)>0?{...item,ownedQty:Math.trunc(num(row.qty))}:null;}).filter(Boolean);}
  function linkedDrones129(operator,runtime=Combat.getRuntime()){return list(runtime?.tokens).filter(row=>isDroneToken129(row)&&String(row.operatorTokenIdV129)===String(operator?.id)&&num(row.hpCurrent)>0);}
  function renderDeviceActions129(){const token=selectedToken104();if(!token||isDroneToken129(token)||isTurretToken129(token))return'';const turrets=deviceInventory129(token,'turret'),drones=deviceInventory129(token,'drone'),linked=linkedDrones129(token),can=Boolean(Combat.canActWithToken?.(token)&&!token.actionUsed&&!token.burstStateV122),freeDroneCommand=Boolean(hasFreeDroneControl129(token)&&!token.freeDroneCommandUsedV129);return `${turrets.length?`<button class="secondary" type="button" data-scene-deploy-v129="turret" ${can?'':'disabled'}>РАЗМЕСТИТЬ ТУРЕЛЬ</button>`:''}${drones.length?`<button class="secondary" type="button" data-scene-deploy-v129="drone" ${can&&linked.length<operatorIntelligence129(token)?'':'disabled'} title="Связано ${linked.length} / ${operatorIntelligence129(token)}">ВЫПУСТИТЬ ДРОНА</button>`:''}${linked.length?`<button class="secondary" type="button" data-scene-command-drone-v129 ${can||freeDroneCommand?'':'disabled'}>КОМАНДА ДРОНУ</button>`:''}`;}
  const ABILITY_BEHAVIORS_V125=new Set(['scripted','no_target','self','unit_target','point','area','aura','persistent_area','toggle_aura']);
  function normalizeAbilityBehavior125(value){const key=String(value||'scripted').trim().toLowerCase();return ABILITY_BEHAVIORS_V125.has(key)?key:'scripted';}
  function abilityMetadata125(skill={}){
    return {
      behavior:normalizeAbilityBehavior125(skill.abilityBehavior||skill.behavior),
      castRange:Math.max(0,num(skill.castRange,1)),areaRadius:Math.max(0,num(skill.areaRadius??skill.aoeRadius,1)),
      thinkerDuration:Math.max(0,Math.trunc(num(skill.thinkerDuration??skill.durationRounds,1))),
      thinkerInterval:Math.max(1,Math.trunc(num(skill.thinkerInterval??skill.intervalRounds,1))),
      relation:['any','ally','enemy','self'].includes(String(skill.targetRelation||''))?String(skill.targetRelation):'any',
      players:skill.targetPlayers!==false,npcs:skill.targetNpcs!==false,units:skill.targetUnits===true,alive:skill.targetAlive!==false,includeSelf:skill.includeSelf===true,
      visibleToPlayers:skill.thinkerVisibleToPlayers!==false,color:String(skill.thinkerColor||skill.color||'#7df9ff')
    };
  }
  async function resolvedAbilityMetadata125(source,skill,token){
    const meta=abilityMetadata125(skill),context={caster:token,attacker:token,target:null,targets:[],ability:skill,sourceName:source?.name||skill?.name,inputs:{}};
    if(!source)return meta;
    const probe=await window.electronAPI?.runCombatLuaHook?.({mode:'metadata',hook:'',script:source.script,input:luaInput119(source,{...context,event:'AbilityMetadata'})});if(!probe?.ok)throw new Error(`${source.name}: ${probe?.message||'ошибка Lua'}`);const values=probe.metadata||{};
    if(values.GetBehavior!=null)meta.behavior=normalizeAbilityBehavior125(values.GetBehavior);
    if(values.GetCastRange!=null)meta.castRange=Math.max(0,num(values.GetCastRange,meta.castRange));
    if(values.GetAOERadius!=null)meta.areaRadius=Math.max(0,num(values.GetAOERadius,meta.areaRadius));
    if(values.GetThinkerDuration!=null)meta.thinkerDuration=Math.max(0,Math.trunc(num(values.GetThinkerDuration,meta.thinkerDuration)));
    if(values.GetThinkerInterval!=null)meta.thinkerInterval=Math.max(1,Math.trunc(num(values.GetThinkerInterval,meta.thinkerInterval)));
    return meta;
  }
  function abilityTargetsAtPoint125(point,spec={},caster=null){
    const runtime=Combat.getRuntime(),scene=Combat.getScene(),origin=caster||tokenById119(spec.casterId),relation=String(spec.relation||'any'),radius=Math.max(0,num(spec.radius??spec.areaRadius,0));
    return list(runtime?.tokens).filter(token=>{
      if(token.id===origin?.id&&spec.includeSelf!==true&&relation!=='self')return false;
      if(spec.alive!==false&&num(token.hpCurrent)<=0)return false;
      if(token.playerId&&spec.players===false)return false;
      if(token.npcId&&spec.npcs===false)return false;
      if(!token.playerId&&!token.npcId&&spec.units!==true)return false;
      if(hexDistancePoints109(scene,point,centerOf(token))>radius)return false;
      const same=String(token.teamId||token.factionId||(token.playerId?'players':token.npcId?'npcs':token.type||'units'))===String(origin?.teamId||origin?.factionId||(origin?.playerId?'players':origin?.npcId?'npcs':origin?.type||'units'));
      if(relation==='ally'&&!same)return false;if(relation==='enemy'&&same)return false;if(relation==='self'&&token.id!==origin?.id)return false;return true;
    });
  }
  function chooseAbilityPoint125(meta,token,skill){
    if(local.lua119.pointPicker?.resolve)local.lua119.pointPicker.resolve(null);
    return new Promise(resolve=>{
      local.lua119.pointPicker={resolve,casterId:String(token.id),castRange:Math.max(0,num(meta.castRange,1)),areaRadius:Math.max(0,num(meta.areaRadius,0)),label:String(skill?.name||'Навык')};
      Toast.show(`Выберите точку применения «${skill?.name||skill?.id||'навыка'}» на карте`,'info');
    });
  }
  function cancelAbilityPoint125(){const picker=local.lua119.pointPicker;local.lua119.pointPicker=null;if(picker?.resolve)picker.resolve(null);local.preview=null;refreshPreviewDom104();}
  async function resolveAbilityTargets125(meta,token,skill){
    const behavior=normalizeAbilityBehavior125(meta.behavior),base={target:null,targets:[],position:null,toggled:null};
    if(behavior==='scripted'||behavior==='no_target')return base;
    if(behavior==='self'){base.target=token;base.targets=[token];base.position=centerOf(token);return base;}
    if(behavior==='unit_target'){
      const picked=await chooseTargets119({title:`Цель: ${skill.name||skill.id}`,originId:token.id,radius:meta.castRange,min:1,max:1,relation:meta.relation,players:meta.players,npcs:meta.npcs,units:meta.units,alive:meta.alive,includeSelf:meta.includeSelf},{caster:token,sourceName:skill.name||skill.id});
      if(picked===null)return null;base.targets=picked;base.target=picked[0]||null;base.position=base.target?centerOf(base.target):null;return base;
    }
    if(behavior==='aura'||behavior==='toggle_aura'){base.position=centerOf(token);base.targets=abilityTargetsAtPoint125(base.position,{...meta,radius:meta.areaRadius},token);base.target=base.targets[0]||null;return base;}
    const point=await chooseAbilityPoint125(meta,token,skill);if(!point)return null;base.position=point;
    if(behavior==='area'||behavior==='persistent_area'){base.targets=abilityTargetsAtPoint125(point,{...meta,radius:meta.areaRadius},token);base.target=base.targets[0]||null;}
    return base;
  }
  function renderSearchAction118(){const token=selectedToken104();return token?.npcId&&num(token.hpCurrent,0)<=0?`<button class="secondary scene-search-action-v118" type="button" data-scene-search-v118="${html(token.id)}">${token.lootStateV118?.searched?'ПОКАЗАТЬ ЛУТ':'ОБЫСКАТЬ'}</button>`:'';}
  function renderActionEquipment105(scene,runtime){
    const token=selectedToken104();if(!token)return '';
    if(local.ui.action==='attack'){
      if(token.equipmentItemId&&['turret','drone'].includes(token.equipmentType)){const w=weaponForToken105(token);return `<span class="scene-action-equipment-v105"><b>${html(w?.name||token.name)}</b><small>${html(w?.damage||'—')} · ${hexLabel109(num(w?.range ?? token.attackRange ?? DEFAULT_ATTACK_WORLD))}</small></span>`;}
      const weapons=ownedItems105(token,'weapon');if(!weapons.length)return `<span class="scene-action-equipment-v105"><b>Безоружная атака</b><small>Урон 1 · ближний бой</small></span>`;
      if(!weapons.some(w=>w.id===token.weaponId))token.weaponId=weapons[0].id;
      const weapon=weapons.find(w=>w.id===token.weaponId)||weapons[0],magazine=magazineState118(token,weapon),reserve=reserveAmmo118(token,weapon,magazine),usesMagazine=magazine.size>0;
      const loadedAmmo=ammoForWeapon118(weapon,magazine);
      return `<label class="scene-action-select-v105">ОРУЖИЕ <select class="select" id="scene-weapon-v105" ${token.burstStateV122?'disabled':''}>${weapons.map(w=>`<option value="${html(w.id)}" ${w.id===token.weaponId?'selected':''}>${html(w.name)} · ${html(w.damage||'—')} · ${hexLabel109(num(w.range ?? DEFAULT_ATTACK_WORLD))}${rapidFireShots122(w)>1?` · очередь ${rapidFireShots122(w)}`:''}</option>`).join('')}</select></label>${weaponMalfunction122(token,weapon)?`<span class="scene-action-warning-v105">ОТКАЗ ОРУЖИЯ</span>`:''}${usesMagazine?`<span class="scene-magazine-v118"><b>${magazine.loaded} / ${magazine.size}</b><small>${html(loadedAmmo?.name||reserve.ammo?.name||'Тип патронов не задан')} · совместимый запас ${reserve.compatible.reduce((sum,row)=>sum+row.ownedQty,0)}</small></span>`:''}`;
    }
    if(local.ui.action==='grenade'){
      const grenades=ownedItems105(token,'grenade');if(!grenades.length)return `<span class="scene-action-warning-v105">В инвентаре нет гранат</span>`;
      if(!grenades.some(g=>g.id===token.grenadeId))token.grenadeId=grenades[0].id;
      return `<label class="scene-action-select-v105">ГРАНАТА <select class="select" id="scene-grenade-v105">${grenades.map(g=>`<option value="${html(g.id)}" ${g.id===token.grenadeId?'selected':''}>${html(g.name)} ×${g.ownedQty} · ${html(g.damage||'—')}</option>`).join('')}</select></label>`;
    }
    return '';
  }

  function sceneTreeRows(scene, depth, all, visited = new Set()) {
    if (!scene || visited.has(scene.id)) return '';
    const nextVisited = new Set(visited); nextVisited.add(scene.id);
    const children=all.filter(s=>String(s.parentId||'')===scene.id).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'));
    return `<button class="scene-tree-row-v104 ${Combat.selectedSceneId===scene.id?'active':''}" type="button" data-scene-select-v104="${html(scene.id)}" style="--depth:${depth}"><span>${html(scene.name)}</span><small>${html(scene.category||'Общее')}</small></button>${children.map(c=>sceneTreeRows(c,depth+1,all,nextVisited)).join('')}`;
  }
  function sceneDescendantIds(sceneId) {
    const out=new Set(), stack=[String(sceneId||'')];
    while(stack.length){const id=stack.pop();for(const scene of list(COMBAT_SCENE_LIST)){if(String(scene.parentId||'')===id&&!out.has(scene.id)){out.add(scene.id);stack.push(scene.id);}}}
    return out;
  }
  function renderSceneTree104() {
    const all=list(COMBAT_SCENE_LIST), categories=unique(all.map(s=>s.category||'Общее'));
    const filtered=local.ui.sceneCategory==='all'?all:all.filter(s=>(s.category||'Общее')===local.ui.sceneCategory);
    const roots=filtered.filter(s=>!s.parentId || !filtered.some(x=>x.id===s.parentId));
    return `<section class="scene-left-section-v104"><div class="scene-section-head-v104"><b>СЦЕНЫ</b><button class="mini-icon-btn" type="button" id="scene-new-v104" title="Новая сцена">＋</button></div>
      <select class="select compact-v104" id="scene-category-filter-v104"><option value="all">Все категории</option>${categories.map(c=>`<option value="${html(c)}" ${local.ui.sceneCategory===c?'selected':''}>${html(c)}</option>`).join('')}</select>
      <div class="scene-tree-v104">${roots.map(s=>sceneTreeRows(s,0,filtered)).join('')||'<div class="small-note">Сцен пока нет.</div>'}</div></section>`;
  }
  function renderAssetPalette104() {
    const cats=unique(local.store?.assetCategories || ['Общее']);
    let assets=list(local.store?.assetLibrary);
    if(local.ui.assetCategory==='favorites')assets=assets.filter(a=>a.favorite);
    else if(local.ui.assetCategory!=='all')assets=assets.filter(a=>a.category===local.ui.assetCategory);
    assets.sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'ru'));
    return `<div class="scene-palette-controls-v104"><select class="select compact-v104" id="scene-asset-category-v104"><option value="all">Все ассеты</option><option value="favorites" ${local.ui.assetCategory==='favorites'?'selected':''}>★ Избранные</option>${cats.map(c=>`<option value="${html(c)}" ${local.ui.assetCategory===c?'selected':''}>${html(c)}</option>`).join('')}</select><button class="secondary" type="button" id="scene-import-asset-v104">＋ ФАЙЛ</button></div>
      <div class="scene-add-category-v104"><input class="input" id="scene-new-asset-category-v104" placeholder="Новая категория"/><button class="ghost" id="scene-add-asset-category-v104" type="button">＋</button></div>
      <div class="scene-palette-grid-v104">${assets.map(a=>`<div class="scene-palette-card-v104" draggable="true" data-scene-drag-v104="asset" data-scene-library-id-v104="${html(a.id)}">${a.image?`<img src="${html(a.image)}" alt=""/>`:'<span>◫</span>'}<b>${html(a.name)}</b><button class="scene-favorite-v104 ${a.favorite?'active':''}" type="button" data-scene-favorite-v104="${html(a.id)}" title="Избранное">★</button><button class="scene-asset-library-delete-v144" type="button" data-scene-delete-library-asset-v144="${html(a.id)}" title="Удалить из библиотеки" aria-label="Удалить ассет ${html(a.name)} из библиотеки">×</button><small>${html(a.category)}</small><button class="scene-place-btn-v105 scene-place-asset-v105" type="button" data-scene-place-v105="asset" data-scene-library-id-v104="${html(a.id)}" title="Разместить на карте">＋</button></div>`).join('')||'<div class="small-note">Импортируй изображение или сохрани размещённый ассет как шаблон.</div>'}</div>`;
  }
  function renderUnitPalette104(){
    const q=String(local.ui.unitSearch||'').trim().toLowerCase();
    const players=Object.values(App.state?.users||{}).filter(u=>String(u.role||'').toLowerCase()!=='gm').filter(u=>!q||String(u.displayName||u.name||u.id).toLowerCase().includes(q));
    const npcs=list(NPC_LIST).filter(n=>!q||String(n.name||n.id).toLowerCase().includes(q));
    const equipmentUnits=Object.values(EQUIPMENT||{}).map(normalizeEquipmentItemV2).filter(i=>['turret','drone'].includes(i.type)).filter(i=>!q||String(i.name||i.id).toLowerCase().includes(q));
    const turrets=equipmentUnits.filter(i=>i.type==='turret'),drones=equipmentUnits.filter(i=>i.type==='drone');
    const card=(kind,id,name,image,meta='')=>`<div class="scene-unit-card-v104" draggable="true" data-scene-drag-v104="${kind}" data-scene-entity-id-v104="${html(id)}">${image?`<img src="${html(image)}" alt=""/>`:`<span>${html((name||'?')[0]||'?')}</span>`}<span class="scene-card-main-v105"><b>${html(name||id)}</b>${meta?`<small>${html(meta)}</small>`:''}</span><button class="scene-place-btn-v105" type="button" data-scene-place-v105="${kind}" data-scene-entity-id-v104="${html(id)}" title="Разместить на карте">＋</button></div>`;
    return `<div class="scene-unit-palette-v105"><input class="input scene-unit-search-sticky-v105" id="scene-unit-search-v104" placeholder="Поиск персонажа, NPC, турели или дрона" value="${html(local.ui.unitSearch)}"/><div class="scene-unit-scroll-v105"><div class="scene-palette-subtitle-v104">ПЕРСОНАЖИ</div><div class="scene-unit-list-v104">${players.map(p=>card('player',p.id,p.displayName||p.name||p.id,p.image||'')).join('')||'<div class="small-note">Нет персонажей.</div>'}</div><div class="scene-palette-subtitle-v104">NPC</div><div class="scene-unit-list-v104">${npcs.map(n=>card('npc',n.id,n.name||n.id,n.image||'')).join('')||'<div class="small-note">Нет NPC.</div>'}</div><div class="scene-palette-subtitle-v104">ТУРЕЛИ</div><div class="scene-unit-list-v104">${turrets.map(i=>card('equipment-unit',i.id,i.name,i.image||'',`HP ${i.unitHp} · дальность ${i.range}`)).join('')||'<div class="small-note">Нет турелей.</div>'}</div><div class="scene-palette-subtitle-v104">ДРОНЫ</div><div class="scene-unit-list-v104">${drones.map(i=>card('equipment-unit',i.id,i.name,i.image||'',`HP ${i.unitHp} · движение ${i.unitMoveRange}`)).join('')||'<div class="small-note">Нет дронов.</div>'}</div></div></div>`;
  }
  function renderZonePalette104(){
    const zones=[['circle','Круг'],['rect','Прямоугольник'],['cone','Конус'],['line','Линия'],['polygon','Область'],['wall','Стена']];
    return `<div class="small-note">Перетащи зону на карту или нажми ＋ и укажи точку. Стену и произвольную область удобнее рисовать нижними режимами.</div><div class="scene-zone-palette-v104">${zones.map(([id,name])=>`<div class="scene-zone-palette-card-v104" draggable="true" data-scene-drag-v104="zone" data-scene-zone-shape-v104="${id}"><span class="zone-icon-v104 shape-${id}"></span><b>${name}</b><button class="scene-place-btn-v105" type="button" data-scene-place-v105="zone" data-scene-zone-shape-v104="${id}" title="Разместить зону">＋</button></div>`).join('')}</div>`;
  }
  function renderLeft104(){
    const body=local.ui.palette==='units'?renderUnitPalette104():local.ui.palette==='zones'?renderZonePalette104():renderAssetPalette104();
    return `<aside class="scene-left-v104">${renderSceneTree104()}<section class="scene-left-section-v104 scene-palette-v104"><div class="scene-palette-tabs-v104"><button class="${local.ui.palette==='assets'?'active':''}" data-scene-palette-v104="assets" type="button">АССЕТЫ</button><button class="${local.ui.palette==='units'?'active':''}" data-scene-palette-v104="units" type="button">ЮНИТЫ</button><button class="${local.ui.palette==='zones'?'active':''}" data-scene-palette-v104="zones" type="button">ЗОНЫ</button></div>${body}</section></aside>`;
  }

  function getSelection(scene,runtime){
    const sel=Combat.selectedObject;if(!sel)return null;
    if(sel.kind==='token')return {kind:'token',obj:runtime.tokens.find(x=>x.id===sel.id)};
    if(sel.kind==='asset')return {kind:'asset',obj:scene.assets.find(x=>x.id===sel.id)};
    if(sel.kind==='zone'||sel.kind==='template')return {kind:'zone',obj:scene.templates.find(x=>x.id===sel.id)};
    return null;
  }
  function checkbox(name,checked,label){return `<label class="toggle-row"><input type="checkbox" name="${name}" ${checked?'checked':''}/> ${label}</label>`;}
  function renderTokenEquipmentInspector105(token,scene){
    if(token.equipmentItemId&&['turret','drone'].includes(token.equipmentType)){const item=weaponForToken105(token);return `<div class="scene-token-loadout-v105"><b>Встроенная атака</b><span>${html(item?.name||token.name)} · ${html(item?.damage||'—')} · дальность ${hexLabel109(num(item?.range ?? DEFAULT_ATTACK_WORLD))}</span></div>`;}
    const weapons=ownedItems105(token,'weapon'),grenades=ownedItems105(token,'grenade');
    if(weapons.length&&!weapons.some(w=>w.id===token.weaponId))token.weaponId=weapons[0].id;
    if(grenades.length&&!grenades.some(g=>g.id===token.grenadeId))token.grenadeId=grenades[0].id;
    return `<div class="scene-token-loadout-v105"><div class="field"><label>Оружие для выстрела</label><select class="select" name="weaponId"><option value="">— не выбрано —</option>${weapons.map(w=>`<option value="${html(w.id)}" ${w.id===token.weaponId?'selected':''}>${html(w.name)} · ${html(w.damage||'—')} · ${hexLabel109(num(w.range ?? DEFAULT_ATTACK_WORLD))}</option>`).join('')}</select></div><div class="field"><label>Граната</label><select class="select" name="grenadeId"><option value="">— нет —</option>${grenades.map(g=>`<option value="${html(g.id)}" ${g.id===token.grenadeId?'selected':''}>${html(g.name)} ×${g.ownedQty} · ${html(g.damage||'—')}</option>`).join('')}</select></div></div>`;
  }
  function renderInspector104(scene,runtime){
    const selected=getSelection(scene,runtime);
    const descendants=sceneDescendantIds(scene.id);
    const parents=list(COMBAT_SCENE_LIST).filter(s=>s.id!==scene.id&&!descendants.has(s.id));
    if(!selected){
      return `<aside class="scene-inspector-v104"><div class="scene-inspector-head-v104"><b>СЦЕНА</b><span>${html(scene.name)}</span></div><form class="scene-inspector-form-v104" id="scene-properties-form-v104">
        <div class="field"><label>Название</label><input class="input" name="name" value="${html(scene.name)}"/></div>
        <div class="cols2"><div class="field"><label>Категория</label><input class="input" name="category" list="scene-categories-list-v104" value="${html(scene.category||'Общее')}"/></div><div class="field"><label>Вложена в</label><select class="select" name="parentId"><option value="">— корень —</option>${parents.map(p=>`<option value="${html(p.id)}" ${scene.parentId===p.id?'selected':''}>${html(p.name)}</option>`).join('')}</select></div></div>
        <datalist id="scene-categories-list-v104">${unique(local.store?.categories||['Общее']).map(c=>`<option value="${html(c)}"></option>`).join('')}</datalist>
        <div class="cols2"><div class="field"><label>Ширина</label><input class="input" type="number" name="width" min="8" max="100" step="1" value="${scene.width}"/></div><div class="field"><label>Высота</label><input class="input" type="number" name="height" min="8" max="100" step="1" value="${scene.height}"/></div></div>
        <div class="field"><label>Туман войны</label><select class="select" name="fogMode"><option value="off" ${scene.fogMode==='off'?'selected':''}>Выключен</option><option value="cover" ${scene.fogMode==='cover'?'selected':''}>Полный туман — скрывает карту</option><option value="objects" ${scene.fogMode==='objects'?'selected':''}>Только объекты — карта остаётся видимой</option></select></div>
        ${checkbox('showInitiativeToPlayers',scene.showInitiativeToPlayers,'Показывать порядок инициативы игрокам')}
        <div class="field"><label>Цвет поля</label><input class="input" type="color" name="backgroundColor" value="${html(scene.backgroundColor||'#0b1420')}"/></div>
        <div class="row"><button class="secondary" type="button" id="scene-background-v104">ФОН</button><button class="ghost" type="button" id="scene-background-clear-v104">УБРАТЬ</button><button class="primary" type="submit">СОХРАНИТЬ</button></div>
        <div class="row"><button class="secondary" type="button" id="scene-duplicate-v104">ДУБЛИРОВАТЬ</button><button class="danger" type="button" id="scene-delete-v104">УДАЛИТЬ</button></div>
      </form></aside>`;
    }
    const o=selected.obj;if(!o)return `<aside class="scene-inspector-v104"><div class="small-note">Объект не найден.</div></aside>`;
    if(selected.kind==='token'){
      const entity=entityForToken(o), wc=combatConfig(entity||{}), vision=num(o.visionRange,0), move=num(o.moveRange,0),conditions=conditionStateV138(o),defenseInfo=incomingDefense119(o,'light'),itemStates=equippedEntriesV138(o).map(({slot,item})=>({slot,item,state:itemRuntimeStateV138(o,item,slot)}));
      return `<aside class="scene-inspector-v104"><div class="scene-inspector-head-v104"><b>ЮНИТ</b><span>${html(o.name)}</span></div><form class="scene-inspector-form-v104" data-object-form-v104="token">
        <div class="field"><label>Имя</label><input class="input" name="name" value="${html(o.name)}"/></div>
        <div class="cols2"><div class="field"><label>HP тек.</label><input class="input" type="number" name="hpCurrent" value="${num(o.hpCurrent)}"/></div><div class="field"><label>HP макс.</label><input class="input" type="number" name="hpMax" min="1" value="${num(o.hpMax,1)}"/></div></div>
        <div class="field"><label>Инициатива вручную</label><input class="input" type="number" name="initiative" value="${num(o.initiative)}"/></div>
        <div class="cols2"><div class="field"><label>Класс брони</label><input class="input" type="number" min="0" name="armorClass" value="${num(o.armorClass,0)}"/><div class="small-note">0 = автоматически (${tokenDefense105(o)}). Участвует в проверке попадания.</div></div><div class="field"><label>Защита</label><input class="input" type="number" min="0" name="defense" value="${num(o.defense,0)}"/><div class="small-note">0 = автоматически (${incomingDefense119(o,'light').damageReduction}). Снижает получаемый урон.</div></div></div>
        <div class="small-note scene-defense-breakdown-v138">КБ: базовый ${defenseInfo.baseArmorClass} + щит ${defenseInfo.shieldArmorClass}; поглощение: базовое ${defenseInfo.baseAbsorption}, броня ${defenseInfo.armorAbsorption}, щит ${defenseInfo.shieldAbsorption}.</div>
        <div class="cols2"><div class="field"><label>Видимость</label><input class="input" type="number" min="0" step="1" name="visionRange" value="${vision}"/><div class="small-note">0 = значение из настройки мира (${wc.visionRange})</div></div><div class="field"><label>Движение</label><input class="input" type="number" min="0" step="1" name="moveRange" value="${move}"/><div class="small-note">0 = значение из настройки мира (${wc.moveRange})</div></div></div>
        <div class="field"><label>Переопределение дальности атаки</label><input class="input" type="number" min="0" step="1" name="attackRange" value="${num(o.attackRange,0)}"/><div class="small-note">0 = дальность выбранного оружия / встроенной атаки.</div></div>
        ${renderTokenEquipmentInspector105(o,scene)}
        <div class="field"><label>Режим движения</label><select class="select" name="movementModeV138"><option value="ground" ${o.movementModeV138==='ground'?'selected':''}>Обычное</option><option value="flight" ${o.movementModeV138==='flight'?'selected':''}>Полёт</option><option value="swim" ${o.movementModeV138==='swim'?'selected':''}>Плавание</option><option value="climb" ${o.movementModeV138==='climb'?'selected':''}>Лазание</option></select></div>
        ${itemStates.length?`<div class="scene-token-loadout-v105"><b>Состояние снаряжения</b>${itemStates.map(row=>`<span>${html(row.item.name||row.item.id)} (${html(row.slot)}): ${row.state.durabilityMax?`прочность ${row.state.durability}/${row.state.durabilityMax}`:'прочность не задана'}${row.state.chargesMax?` · заряды ${row.state.charges}/${row.state.chargesMax}`:''}${row.state.broken?' · СЛОМАНО':''}</span>`).join('')}</div>`:''}
        ${injurySeverity129(o)?`<div class="scene-token-loadout-v105"><b>Травмы · степень ${injurySeverity129(o)}</b><span>${html(INJURY_LABELS_V129[injurySeverity129(o)])} · записей: ${list(o.injuriesV129).length}</span><button class="ghost" type="button" data-scene-clear-injuries-v129>СНЯТЬ ТРАВМЫ</button></div>`:''}
        <div class="small-note">Эффективно: обзор ${hexLabel109(tokenVisionCells(o,scene))} · движение ${hexLabel109(tokenMoveCells(o,scene))} · атака ${hexLabel109(tokenAttackCells(o,scene))}</div>
        ${checkbox('visibleToPlayers',o.visibleToPlayers!==false,'Может быть виден игрокам')}${checkbox('sharesVisionWithPlayers',o.sharesVisionWithPlayers,'Даёт обзор игрокам')}${checkbox('hidden',o.hidden,'Скрыт')}${checkbox('proneV122',conditions.prone,'Лежит')}${checkbox('conditionDyingV138',conditions.dying,'Умирает')}${checkbox('conditionStabilizedV138',conditions.stabilized,'Стабилизирован')}${checkbox('conditionStunnedV138',conditions.stunned,'Оглушён')}${checkbox('conditionGrappledV138',conditions.grappled,'Захвачен')}${checkbox('conditionUnconsciousV138',conditions.unconscious,'Без сознания')}${checkbox('conditionHandsBusyV138',conditions.handsBusy,'Руки заняты')}${isDroneToken129(o)?checkbox('linkJammedV129',o.linkJammedV129,'Связь дрона заглушена'):''}${checkbox('locked',o.locked,'Заблокировать ручное перемещение')}${checkbox('blockMovement',o.blockMovement,'Блокирует путь другим юнитам')}
        <div class="row"><button class="primary" type="submit">ПРИМЕНИТЬ</button><button class="danger" type="button" data-scene-delete-object-v104="1">УДАЛИТЬ</button></div>
      </form></aside>`;
    }
    if(selected.kind==='asset')return `<aside class="scene-inspector-v104"><div class="scene-inspector-head-v104"><b>АССЕТ</b><span>${html(o.name)}</span></div><div class="small-note">Выберите ассет: углы — размер, круглый маркер — поворот. Shift сохраняет пропорции или задаёт шаг 15°.</div><form class="scene-inspector-form-v104" data-object-form-v104="asset">
      <div class="field"><label>Название</label><input class="input" name="name" value="${html(o.name)}"/></div><div class="cols2"><div class="field"><label>Ширина</label><input class="input" type="number" min=".25" step=".25" name="w" value="${o.w}"/></div><div class="field"><label>Высота</label><input class="input" type="number" min=".25" step=".25" name="h" value="${o.h}"/></div></div>
      <div class="cols2"><div class="field"><label>Поворот</label><input class="input" type="number" name="rotation" value="${num(o.rotation)}"/></div><div class="field"><label>Прозрачность</label><input class="input" type="number" min=".05" max="1" step=".05" name="opacity" value="${num(o.opacity,1)}"/></div></div>
      <div class="field"><label>Вид защиты</label><select class="select" name="coverType"><option value="none" ${normalizeCoverType120(o.coverType)==='none'?'selected':''}>Не является укрытием</option><option value="weak" ${normalizeCoverType120(o.coverType)==='weak'?'selected':''}>Слабое укрытие (+1)</option><option value="partial" ${normalizeCoverType120(o.coverType)==='partial'?'selected':''}>Частичное укрытие (+2)</option><option value="good" ${normalizeCoverType120(o.coverType)==='good'?'selected':''}>Хорошее укрытие (+3)</option><option value="total" ${normalizeCoverType120(o.coverType)==='total'?'selected':''}>Полное укрытие</option><option value="concealment" ${normalizeCoverType120(o.coverType)==='concealment'?'selected':''}>Маскировка (помеха)</option></select></div>
      <div class="cols2"><div class="field"><label>Бонус укрытия</label><input class="input" type="number" min="0" step="1" name="coverArmorBonus" value="${num(o.coverArmorBonus,coverDefaults120(normalizeCoverType120(o.coverType)).armor)}"/></div><div class="field"><label>Твёрдость при простреле</label><input class="input" type="number" min="0" step="1" name="coverHardness" value="${num(o.coverHardness,0)}"/></div></div><div class="small-note">Засчитывается только между атакующим и целью. Используется один лучший бонус укрытия или физического щита.</div>
      ${checkbox('coverPenetrable',o.coverPenetrable,'Можно прострелить полное укрытие через Твёрдость')}${checkbox('difficultTerrain',o.difficultTerrain,'Труднопроходимая местность: вход в гекс стоит 2 движения')}${checkbox('blockMovement',o.blockMovement,'Блокирует движение')}${checkbox('blockSight',o.blockSight,'Блокирует обзор')}${checkbox('visibleToPlayers',o.visibleToPlayers!==false,'Виден игрокам')}
      <div class="row"><button class="primary" type="submit">ПРИМЕНИТЬ</button><button class="secondary" type="button" id="scene-save-template-v104">В ШАБЛОНЫ</button><button class="danger" type="button" data-scene-delete-object-v104="1">УДАЛИТЬ</button></div></form></aside>`;
    return `<aside class="scene-inspector-v104"><div class="scene-inspector-head-v104"><b>ЗОНА</b><span>${html(o.label||o.shape||'Зона')}</span></div><form class="scene-inspector-form-v104" data-object-form-v104="zone">
      <div class="field"><label>Подпись</label><input class="input" name="label" value="${html(o.label||'')}"/></div><div class="field"><label>Цвет</label><input class="input" name="color" value="${html(o.color||'rgba(255,190,92,.35)')}"/></div>
      ${!['wall','polygon'].includes(o.shape)?`<div class="cols2"><div class="field"><label>Ширина</label><input class="input" type="number" min=".25" step=".25" name="w" value="${o.w}"/></div><div class="field"><label>Высота</label><input class="input" type="number" min=".25" step=".25" name="h" value="${o.h}"/></div></div>`:o.shape==='wall'?`<div class="field"><label>Толщина стены</label><input class="input" type="number" min=".04" step=".04" name="thickness" value="${num(o.thickness,.18)}"/></div>`:`<div class="small-note">Форма области задаётся нарисованным контуром.</div>`}
      ${o.shape==='wall'?`<div class="field"><label>Стена как укрытие</label><select class="select" name="coverType"><option value="none" ${normalizeCoverType120(o.coverType)==='none'?'selected':''}>Нет</option><option value="weak" ${normalizeCoverType120(o.coverType)==='weak'?'selected':''}>Слабое +1</option><option value="partial" ${normalizeCoverType120(o.coverType)==='partial'?'selected':''}>Частичное +2</option><option value="good" ${normalizeCoverType120(o.coverType)==='good'?'selected':''}>Хорошее +3</option><option value="total" ${normalizeCoverType120(o.coverType)==='total'?'selected':''}>Полное</option><option value="concealment" ${normalizeCoverType120(o.coverType)==='concealment'?'selected':''}>Маскировка</option></select></div><div class="cols2"><div class="field"><label>Бонус</label><input class="input" type="number" name="coverArmorBonus" min="0" value="${num(o.coverArmorBonus,coverDefaults120(normalizeCoverType120(o.coverType)).armor)}"/></div><div class="field"><label>Твёрдость</label><input class="input" type="number" name="coverHardness" min="0" value="${num(o.coverHardness,0)}"/></div></div>${checkbox('coverPenetrable',o.coverPenetrable,'Можно прострелить через Твёрдость')}`:''}
      ${checkbox('blockMovement',o.blockMovement,'Блокирует движение')}${checkbox('blockSight',o.blockSight,'Блокирует обзор')}${checkbox('visibleToPlayers',o.visibleToPlayers!==false,'Видна игрокам')}
      <div class="row"><button class="primary" type="submit">ПРИМЕНИТЬ</button><button class="danger" type="button" data-scene-delete-object-v104="1">УДАЛИТЬ</button></div></form></aside>`;
  }

  function audioApi(){return window.CombatAudioV37 || null;}
  function ambientSelection107(api,sceneId){
    const section=api?.state?.sceneAmbientSections?.[sceneId];
    if(section?.sectionId)return `section:${section.sectionId}:${section.mode==='random'?'random':'sequential'}`;
    const sound=api?.state?.sceneAmbient?.[sceneId];
    return sound?`sound:${sound}`:'';
  }
  function renderSounds104(scene){
    const api=audioApi();if(!api)return '<div class="small-note">Аудиобиблиотека недоступна.</div>';
    const q=String(local.ui.soundSearch||'').toLowerCase(),active=ambientSelection107(api,scene.id);
    return `<div class="scene-sound-drawer-v104"><div class="scene-sound-tools-v104"><input class="input" id="scene-sound-search-v104" placeholder="Поиск звука" value="${html(local.ui.soundSearch)}"/><input class="input" id="scene-sound-new-section-v104" placeholder="Новый раздел"/><button class="secondary" id="scene-sound-add-section-v104" type="button">＋ РАЗДЕЛ</button><button class="ghost" id="scene-stop-all-v104" type="button">СТОП ВСЁ</button></div>
      <div class="small-note scene-ambient-help-v107">Раздел можно назначить эмбиентом целиком: ПО ПОРЯДКУ проигрывает все треки последовательно и начинает заново, СЛУЧАЙНО выбирает следующий трек в случайном порядке.</div>
      <div class="scene-sound-sections-v104">${list(api.sections).map(section=>{const sounds=list(section.sounds).filter(s=>!q||String(s.name).toLowerCase().includes(q));const seq=`section:${section.id}:sequential`,rnd=`section:${section.id}:random`;return `<section class="scene-sound-section-v104"><header><input class="input scene-sound-section-name-v144" value="${html(section.name)}" data-scene-sound-section-rename-v144="${html(section.id)}" aria-label="Название раздела звуков"/><span><button class="ghost" type="button" data-scene-sound-section-delete-v144="${html(section.id)}">УДАЛИТЬ РАЗДЕЛ</button><button class="secondary" type="button" data-scene-sound-add-v104="${html(section.id)}">＋ ФАЙЛ</button><button class="ghost" type="button" data-scene-sound-random-v104="${html(section.id)}">▶ СЛУЧАЙНО</button><button class="ghost ${active===seq?'active':''}" type="button" data-scene-section-ambient-v107="${html(section.id)}" data-scene-section-mode-v107="sequential">ФОН ПО ПОРЯДКУ</button><button class="ghost ${active===rnd?'active':''}" type="button" data-scene-section-ambient-v107="${html(section.id)}" data-scene-section-mode-v107="random">ФОН СЛУЧАЙНО</button></span></header>${sounds.map(s=>`<div class="scene-sound-row-v104"><span>${html(s.name)}</span><span><button class="ghost" type="button" data-scene-sound-play-v104="${html(s.id)}">▶</button><button class="ghost" type="button" data-scene-sound-stop-v104="${html(s.id)}">■</button><button class="ghost ${active===`sound:${s.id}`?'active':''}" type="button" data-scene-sound-ambient-v104="${html(s.id)}">ФОН</button><button class="ghost" type="button" data-scene-sound-delete-v104="${html(section.id)}:${html(s.id)}">×</button></span></div>`).join('')||'<div class="small-note">Нет звуков.</div>'}</section>`;}).join('')}</div></div>`;
  }
  function renderTop104(scene,runtime){
    const api=audioApi(), ambientChoice=ambientSelection107(api,scene.id);
    const sounds=list(api?.sections).flatMap(s=>list(s.sounds).map(x=>({...x,section:s.name}))),current=list(runtime?.initiativeOrder).length?list(runtime.tokens).find(t=>t.id===runtime.initiativeOrder[Math.max(0,Math.min(list(runtime.initiativeOrder).length-1,num(runtime.turnIndex,0)))])||null:null;
    return `<header class="scene-top-v104"><div class="scene-top-title-v104"><span>РЕДАКТОР СЦЕНЫ</span><b>${html(scene.name)}</b><small>${scene.width}×${scene.height} гексов${current?` · Раунд ${Math.max(1,num(runtime.round,1))} · Ход: ${html(current.name)}`:''}</small></div>
      <div class="scene-top-controls-v104"><label>ТУМАН <select class="select scene-fog-select-v112" id="scene-fog-mode-top-v112"><option value="off" ${scene.fogMode==='off'?'selected':''}>ВЫКЛ.</option><option value="cover" ${scene.fogMode==='cover'?'selected':''}>ПОЛНЫЙ</option><option value="objects" ${scene.fogMode==='objects'?'selected':''}>ТОЛЬКО ОБЪЕКТЫ</option></select></label><label class="scene-top-check-v104" title="Показать порядок инициативы на втором экране"><input type="checkbox" id="scene-show-initiative-top-v112" ${scene.showInitiativeToPlayers?'checked':''}/> ИНИЦИАТИВА ИГРОКАМ</label>
      <label>ФОН <select class="select" id="scene-ambient-v104"><option value="">— выключен —</option>${list(api?.sections).flatMap(section=>[...list(section.sounds).map(sound=>`<option value="sound:${html(sound.id)}" ${ambientChoice===`sound:${sound.id}`?'selected':''}>${html(section.name)} / ${html(sound.name)}</option>`),`<option value="section:${html(section.id)}:sequential" ${ambientChoice===`section:${section.id}:sequential`?'selected':''}>${html(section.name)} — весь раздел по порядку</option>`,`<option value="section:${html(section.id)}:random" ${ambientChoice===`section:${section.id}:random`?'selected':''}>${html(section.name)} — весь раздел случайно</option>`]).join('')}</select></label><button class="ghost" id="scene-ambient-stop-v104" type="button">■</button>
      <button class="ghost" id="scene-center-v108" type="button">ЦЕНТР КАРТЫ</button><button class="secondary ${local.ui.soundsOpen?'active':''}" id="scene-sounds-toggle-v104" type="button">ЗВУКИ</button><button class="secondary" id="scene-export-v104" type="button">ЭКСПОРТ</button><button class="secondary" id="scene-import-v104" type="button">ИМПОРТ</button>
      ${window.electronAPI?.openPlayerDisplay?`<button class="${Combat.displayWindowOpen?'danger':'primary'}" id="scene-display-v104" type="button">${Combat.displayWindowOpen?'ЗАКРЫТЬ ВТОРОЙ ЭКРАН':'ВТОРОЙ ЭКРАН'}</button>`:''}</div>
      ${local.ui.soundsOpen?renderSounds104(scene):''}</header>`;
  }

  const panelScrollV137=new Map();
  const scrollSelectorsV137=['.scene-unit-scroll-v105','.scene-palette-grid-v104','.scene-tree-v104','.scene-sound-drawer-v104','.scene-inspector-v104'];
  let renderedSceneV137='';
  Combat.render = function() {
    ensureCombatModuleMarkup();
    const root=document.getElementById('combat-content'); if(!root)return;
    if(!this.isDm()) { root.innerHTML='<div class="card pad18">Сцены доступны только ДМу.</div>'; return; }
    if(!local.loaded){ root.innerHTML='<div class="card pad18">Загрузка локальных сцен…</div>'; loadLocalStore().then(()=>this.render()); return; }
    if(!this.selectedSceneId || !COMBAT_SCENES[this.selectedSceneId]) this.selectedSceneId=COMBAT_SCENE_LIST[0]?.id||null;
    const scene=this.getScene();
    if(!scene){ root.innerHTML=`<div class="scene-empty-v104"><b>Нет сцен</b><button class="primary" id="scene-new-v104" type="button">СОЗДАТЬ СЦЕНУ</button></div>`; return; }
    if(renderedSceneV137)for(const selector of scrollSelectorsV137){const node=root.querySelector(selector);if(node)panelScrollV137.set(renderedSceneV137+selector,{top:node.scrollTop,left:node.scrollLeft});}
    const runtime=this.getRuntime(scene.id);
    root.innerHTML=`<div class="scene-editor-v104">${renderTop104(scene,runtime)}${renderLeft104()}<main class="scene-center-v104">${renderBoard104(scene,runtime)}</main>${renderInspector104(scene,runtime)}</div>`;
    renderedSceneV137=scene.id;
    for(const selector of scrollSelectorsV137){const node=root.querySelector(selector),pos=panelScrollV137.get(scene.id+selector);if(node&&pos){node.scrollTop=pos.top;node.scrollLeft=pos.left;}}
    // Keep board sizing and camera transform in the same JS task as DOM replacement: no one-frame jump to a default frame.
    try{const viewport=document.getElementById('combat-stage-viewport');this.syncViewportBoardFrame?.(scene,viewport);this.applyViewTransform?.(viewport);}catch{}
    broadcastScene104();
    const api=audioApi(); if(api) api.startAmbient(scene.id);
  };

  function addScene104(){
    const scene=createBlankCombatScene();scene.category=local.ui.sceneCategory==='all'?'Общее':local.ui.sceneCategory;scene.scalePerHex=1;scene.scaleLabel='гекс';scene.parentId='';scene.templates=[];
    COMBAT_SCENES[scene.id]=normalizeCombatScene(scene);sortCombatScenes();ensureCombatRuntime(scene.id);Combat.selectedSceneId=scene.id;Combat.selectedObject=null;queueStoreSave();Combat.render();
  }
  function deleteScene104(sceneId){
    if(!sceneId||!COMBAT_SCENES[sceneId])return;
    if(list(Combat.getRuntime(sceneId)?.tokens).some(pendingLootV137)){Toast.show('Сначала завершите передачу добычи.','info');return;}
    if(!confirm(`Удалить сцену «${COMBAT_SCENES[sceneId].name}»?`))return;
    Object.values(COMBAT_SCENES).forEach(s=>{if(s.parentId===sceneId)s.parentId='';});delete COMBAT_SCENES[sceneId];delete ensureCombatState().scenes[sceneId];delete ensureCombatState().cameraByScene?.[sceneId];delete local.cameraRuntime?.[sceneId];if(local.store?.cameraByScene)delete local.store.cameraByScene[sceneId];sortCombatScenes();Combat.selectedSceneId=COMBAT_SCENE_LIST[0]?.id||null;Combat.selectedObject=null;queueStoreSave();Combat.render();broadcastScene104();
  }
  function duplicateScene104(sceneId){
    const scene=COMBAT_SCENES[sceneId];if(!scene)return;if(list(Combat.getRuntime(sceneId)?.tokens).some(pendingLootV137)){Toast.show('Сначала завершите передачу добычи.','info');return;}const id=makeId('scene');const copy=normalizeCombatScene({...clone(scene),id,name:`${scene.name} — копия`,parentId:scene.parentId||''});COMBAT_SCENES[id]=copy;ensureCombatState().scenes[id]=clone(ensureCombatRuntime(sceneId));sortCombatScenes();Combat.selectedSceneId=id;queueStoreSave();Combat.render();
  }
  async function requestLocalImage104(stem='scene_asset'){
    return new Promise(resolve=>{
      const input=document.createElement('input');
      input.type='file'; input.accept='image/*,.dds,image/vnd.ms-dds,application/octet-stream';
      input.style.position='fixed'; input.style.left='-10000px'; input.style.top='-10000px'; input.style.opacity='0';
      document.body.appendChild(input);
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;try{input.remove();}catch{}resolve(value||null);};
      input.addEventListener('change',async()=>{
        const file=input.files?.[0]; if(!file){finish(null);return;}
        try{
          const nativePath=window.electronAPI?.getPathForFile?.(file)||'';
          const isDds=String(file.name||'').toLowerCase().endsWith('.dds')||String(file.type||'').toLowerCase().includes('dds');
          if(nativePath&&!isDds&&window.electronAPI?.saveLocalCombatAssetFile){
            const res=await window.electronAPI.saveLocalCombatAssetFile({filePath:nativePath,preferredStem:stem});
            if(res?.ok&&(res.url||res.localUrl)){finish(res.url||res.localUrl);return;}
            if(res?.message)throw new Error(res.message);
          }
          const dataUrl=await readImageFileAsRenderableDataUrlV51(file);
          if(window.electronAPI?.saveLocalCombatAsset){
            const res=await window.electronAPI.saveLocalCombatAsset({dataUrl,preferredStem:stem});
            if(res?.ok&&(res.url||res.localUrl)){finish(res.url||res.localUrl);return;}
            if(res?.message)throw new Error(res.message);
          }
          finish(dataUrl);
        }catch(e){Toast.show(`Не удалось загрузить изображение: ${e?.message||e}`,'err');finish(null);}
      },{once:true});
      input.addEventListener('cancel',()=>finish(null),{once:true});
      input.click();
    });
  }
  Combat.requestImage=requestLocalImage104;
  async function importAsset104(){
    try{
      let saved=null;
      let originalAssetName='Новый ассет';
      if(window.electronAPI?.chooseCombatMedia&&window.electronAPI?.saveLocalCombatAssetFile){
        const picked=await window.electronAPI.chooseCombatMedia({kind:'image'});
        if(picked?.canceled)return;
        const filePath=String(picked?.filePaths?.[0]||'');
        if(!filePath)throw new Error(picked?.message||'Файл не выбран');
        const sourceBase=(filePath.split(/[\/]/).pop()||'scene_library');
        const stem=sourceBase.replace(/\.[^.]+$/,'');
        originalAssetName=String(stem||'Новый ассет').trim()||'Новый ассет';
        saved=await window.electronAPI.saveLocalCombatAssetFile({filePath,preferredStem:stem});
        if(!saved?.ok)throw new Error(saved?.message||'Не удалось скопировать ассет');
      } else {
        const image=await requestLocalImage104('scene_library'); if(!image)return;
        saved={ok:true,url:image,localUrl:image,imageMeta:null};
      }
      const image=String(saved.url||saved.localUrl||'');
      if(!image)throw new Error('Локальный файл ассета не создан');
      // Packaged Electron does not support window.prompt(). Asset import must never depend on it.
      // Use the source filename as the initial library name; it can be edited after placement.
      const name=originalAssetName;
      const category=local.ui.assetCategory!=='all'&&local.ui.assetCategory!=='favorites'?local.ui.assetCategory:'Общее';
      const meta=saved.imageMeta&&typeof saved.imageMeta==='object'?saved.imageMeta:null;
      const aspect=meta?.width&&meta?.height?meta.width/meta.height:1;
      const asset=normalizeLibraryAsset({id:makeId('assetlib'),name,image,category,favorite:false,createdAt:new Date().toISOString(),imageMeta:meta,w:2,h:clamp104(2/Math.max(.1,aspect),.25,10)});
      local.store.assetLibrary=Array.isArray(local.store.assetLibrary)?local.store.assetLibrary:[];
      local.store.assetLibrary.push(asset);
      if(!local.store.assetCategories.includes(category))local.store.assetCategories.push(category);
      local.ui.assetCategory=category;
      const result=await saveStoreNow();
      if(result?.ok===false)throw new Error(result?.message||'Не удалось сохранить библиотеку ассетов');
      Combat.render();
      Toast.show(`Ассет «${name}» добавлен в локальную библиотеку`,'ok');
    }catch(e){console.error('SCENE_ASSET_IMPORT_V110_FAILED',e);Toast.show(`Не удалось добавить ассет: ${e?.message||e}`,'err');}
  }
  function placeLibraryAsset104(id, point){const lib=local.store.assetLibrary.find(a=>a.id===id),scene=Combat.getScene();if(!lib||!scene){Toast.show('Ассет не найден в локальной библиотеке','err');return;}scene.assets=Array.isArray(scene.assets)?scene.assets:[];const obj=normalizeCombatAsset({...clone(lib),id:makeId('asset'),libraryId:lib.id,x:clamp104(point.x-lib.w/2,0,Math.max(0,scene.width-lib.w)),y:clamp104(point.y-lib.h/2,0,Math.max(0,scene.height-lib.h))});scene.assets.push(obj);Combat.selectedObject={kind:'asset',id:obj.id};local.ui.pendingPlacement=null;queueStoreSave();Combat.render();broadcastScene104();}
  function createEquipmentUnit105(id){const item=equipmentItem105(id);if(!item||!['turret','drone'].includes(item.type))return null;return normalizeCombatToken({id:`token_${item.type}_${item.id}_${Date.now().toString(36)}`,type:item.type,name:item.name||item.id,image:item.image||'',equipmentItemId:item.id,equipmentType:item.type,x:0,y:0,w:1,h:1,hpCurrent:item.unitHp||10,hpMax:item.unitHp||10,initiative:item.unitInitiative||0,armorClass:item.unitArmorClass||10,visionRange:item.unitVisionRange||0,moveRange:item.unitMoveRange||0,attackRange:item.range||0,color:item.type==='drone'?'#b9a7ff':'#ffd078',visibleToPlayers:true,showNameToPlayers:item.showNameToPlayers!==false,sharesVisionWithPlayers:false,blockMovement:true,weaponId:item.id});}
  function placeUnit104(kind,id,point){const scene=Combat.getScene(),runtime=Combat.getRuntime();if(!scene||!runtime)return;let token=kind==='player'?createPlayerCombatToken(id):kind==='npc'?createNpcCombatToken(id):kind==='equipment-unit'?createEquipmentUnit105(id):null;if(!token){Toast.show('Не удалось создать юнит','err');return;}token=normalizeCombatToken({...token,visibleToPlayers:true});fitTokenToHex107(token,scene,nearestHexCenter107(scene,point));runtime.tokens.push(token);Combat.selectedObject={kind:'token',id:token.id};local.ui.pendingPlacement=null;Combat.syncInitiative(scene.id,false);queueStoreSave();Combat.render();broadcastScene104();}
  function placeZone104(shape,point){const scene=Combat.getScene();if(!scene)return;const dims=shape==='line'?{w:4,h:.5}:shape==='cone'?{w:4,h:4}:shape==='circle'?{w:3,h:3}:{w:3,h:3};const zone=normalizeCombatTemplate({id:makeId('zone'),shape,name:'Зона',label:'',x:point.x-dims.w/2,y:point.y-dims.h/2,w:dims.w,h:dims.h,color:'rgba(255,190,92,.35)',visibleToPlayers:true,blockMovement:false,blockSight:false,points:shape==='wall'?[{x:point.x-1,y:point.y},{x:point.x+1,y:point.y}]:shape==='polygon'?[{x:point.x-1.4,y:point.y-1},{x:point.x+1.4,y:point.y-1},{x:point.x+1.4,y:point.y+1},{x:point.x-1.4,y:point.y+1}]:[]});scene.templates.push(zone);Combat.selectedObject={kind:'zone',id:zone.id};queueStoreSave();Combat.render();broadcastScene104();}

  function selectedObject104(){const s=Combat.getScene(),r=Combat.getRuntime();return s&&r?getSelection(s,r):null;}
  function deleteSelected104(){const scene=Combat.getScene(),runtime=Combat.getRuntime(),sel=selectedObject104();if(!scene||!runtime||!sel)return;if(sel.kind==='token'&&pendingLootV137(sel.obj)){Toast.show('Сначала завершите передачу добычи.','info');return;}if(sel.kind==='token')runtime.tokens=runtime.tokens.filter(x=>x.id!==sel.obj.id);if(sel.kind==='asset')scene.assets=scene.assets.filter(x=>x.id!==sel.obj.id);if(sel.kind==='zone')scene.templates=scene.templates.filter(x=>x.id!==sel.obj.id);Combat.selectedObject=null;Combat.syncInitiative(scene.id,false);queueStoreSave();Combat.render();broadcastScene104();}
  function saveAssetTemplate104(){const sel=selectedObject104();if(sel?.kind!=='asset')return;const a=sel.obj;const category=local.ui.assetCategory!=='all'&&local.ui.assetCategory!=='favorites'?local.ui.assetCategory:'Общее';local.store.assetLibrary.push(normalizeLibraryAsset({...a,id:makeId('assetlib'),category,favorite:false}));if(!local.store.assetCategories.includes(category))local.store.assetCategories.push(category);queueStoreSave();Toast.show('Ассет сохранён в локальную библиотеку','ok');Combat.render();}

  function applyObjectForm104(form){
    const scene=Combat.getScene(),runtime=Combat.getRuntime(),sel=selectedObject104();if(!scene||!runtime||!sel)return;const fd=new FormData(form),o=sel.obj;
    if(sel.kind==='token'){o.name=String(fd.get('name')||o.name);o.hpMax=Math.max(1,num(fd.get('hpMax'),o.hpMax));o.hpCurrent=clamp104(fd.get('hpCurrent'),0,o.hpMax);o.initiative=num(fd.get('initiative'));o.armorClass=Math.max(0,num(fd.get('armorClass'),0));o.defense=Math.max(0,num(fd.get('defense'),0));o.armorClassOverrideV120=o.armorClass>0;o.defenseOverrideV120=o.defense>0;o.visionRange=Math.max(0,num(fd.get('visionRange')));o.moveRange=Math.max(0,num(fd.get('moveRange')));o.attackRange=Math.max(0,num(fd.get('attackRange')));o.visionRangeOverrideV122=o.visionRange>0;o.moveRangeOverrideV122=o.moveRange>0;o.attackRangeOverrideV122=o.attackRange>0;if(fd.has('weaponId'))o.weaponId=String(fd.get('weaponId')||'');if(fd.has('grenadeId'))o.grenadeId=String(fd.get('grenadeId')||'');o.visibleToPlayers=fd.get('visibleToPlayers')==='on';o.sharesVisionWithPlayers=fd.get('sharesVisionWithPlayers')==='on';o.hidden=fd.get('hidden')==='on';setConditionV138(o,'prone',fd.get('proneV122')==='on');setConditionV138(o,'dying',fd.get('conditionDyingV138')==='on');setConditionV138(o,'stabilized',fd.get('conditionStabilizedV138')==='on');setConditionV138(o,'stunned',fd.get('conditionStunnedV138')==='on');setConditionV138(o,'grappled',fd.get('conditionGrappledV138')==='on');setConditionV138(o,'unconscious',fd.get('conditionUnconsciousV138')==='on');setConditionV138(o,'handsBusy',fd.get('conditionHandsBusyV138')==='on');o.movementModeV138=['ground','flight','swim','climb'].includes(String(fd.get('movementModeV138')||''))?String(fd.get('movementModeV138')):'ground';o.locked=fd.get('locked')==='on';o.blockMovement=fd.get('blockMovement')==='on';Combat.syncInitiative(scene.id,false);if(o.playerId){updatePlayerHp105(o);void persistCombatProfiles105('Сцена: ручное изменение HP',{immediate:true});}}
    if(sel.kind==='token'&&fd.has('linkJammedV129'))o.linkJammedV129=fd.get('linkJammedV129')==='on';
    if(sel.kind==='asset'){o.name=String(fd.get('name')||o.name);o.w=clamp104(fd.get('w'),.25,40);o.h=clamp104(fd.get('h'),.25,40);o.rotation=num(fd.get('rotation'));o.opacity=clamp104(fd.get('opacity'),.05,1);o.coverType=normalizeCoverType120(fd.get('coverType'));const defaults=coverDefaults120(o.coverType);o.coverArmorBonus=Math.max(0,num(fd.get('coverArmorBonus'),defaults.armor));o.coverDefenseBonus=0;o.coverHardness=Math.max(0,num(fd.get('coverHardness'),0));o.coverPenetrable=fd.get('coverPenetrable')==='on';o.blockMovement=fd.get('blockMovement')==='on';o.difficultTerrain=fd.get('difficultTerrain')==='on';o.blockSight=o.coverType==='concealment'?false:((o.coverType==='total'&&!o.coverPenetrable)||fd.get('blockSight')==='on');o.visibleToPlayers=fd.get('visibleToPlayers')==='on';}
    if(sel.kind==='zone'){o.label=String(fd.get('label')||'');o.color=String(fd.get('color')||o.color);if(!['wall','polygon'].includes(o.shape)){o.w=clamp104(fd.get('w'),.25,60);o.h=clamp104(fd.get('h'),.25,60);}else if(o.shape==='wall')o.thickness=clamp104(fd.get('thickness'),.04,4);o.coverType=o.shape==='wall'?normalizeCoverType120(fd.get('coverType')):'none';const defaults=coverDefaults120(o.coverType);o.coverArmorBonus=Math.max(0,num(fd.get('coverArmorBonus'),defaults.armor));o.coverHardness=Math.max(0,num(fd.get('coverHardness'),0));o.coverPenetrable=fd.get('coverPenetrable')==='on';o.blockMovement=fd.get('blockMovement')==='on';o.blockSight=o.coverType==='concealment'?false:((o.coverType==='total'&&!o.coverPenetrable)||(fd.get('blockSight')==='on'&&o.coverType==='none'));o.visibleToPlayers=fd.get('visibleToPlayers')==='on';}
    queueStoreSave();Combat.render();broadcastScene104();
  }
  function applySceneForm104(form){const scene=Combat.getScene();if(!scene)return;const fd=new FormData(form);scene.name=String(fd.get('name')||scene.name).trim()||'Сцена';scene.category=String(fd.get('category')||'Общее').trim()||'Общее';scene.parentId=String(fd.get('parentId')||'');if(scene.parentId===scene.id||sceneDescendantIds(scene.id).has(scene.parentId))scene.parentId='';scene.width=clamp104(fd.get('width'),8,100);scene.height=clamp104(fd.get('height'),8,100);scene.scalePerHex=1;scene.scaleLabel='гекс';scene.fogMode=['off','cover','objects'].includes(String(fd.get('fogMode')||''))?String(fd.get('fogMode')):'cover';scene.fogEnabled=scene.fogMode!=='off';scene.showInitiativeToPlayers=fd.get('showInitiativeToPlayers')==='on';scene.backgroundColor=String(fd.get('backgroundColor')||scene.backgroundColor);if(!local.store.categories.includes(scene.category))local.store.categories.push(scene.category);sortCombatScenes();queueStoreSave();Combat.render();broadcastScene104();}

  function refreshPreviewDom104(){const scene=Combat.getScene(),layer=document.querySelector('#combat-stage .scene-preview-layer-v104');if(scene&&layer)layer.innerHTML=previewMarkup(scene);broadcastScene104();}
  function selectedToken104(){const sel=selectedObject104();return sel?.kind==='token'?sel.obj:null;}
  function makeRoutePreview104(point,attack=false){
    const scene=Combat.getScene(),token=selectedToken104();if(!scene||!token)return null;const start=centerOf(token);
    if(attack){const weapon=weaponForToken105(token);if(!weapon)return {kind:'route',mode:'attack',sourceTokenId:token.id,points:[start,start],end:start,limited:true,blocked:true,label:'Нет выбранного оружия'};const max=tokenAttackCells(token,scene),snapped=nearestHexCenter107(scene,point),distance=hexDistancePoints109(scene,start,snapped),rangeEnd=hexEndpointAtRange109(scene,start,snapped,max),end={x:rangeEnd.x,y:rangeEnd.y},limited=distance>Math.floor(max+1e-6),blocked=!limited&&sightSegmentBlocked105(scene,start,end,[token.id]);return {kind:'route',mode:'attack',sourceTokenId:token.id,points:[start,end],end,hexes:Math.min(distance,Math.floor(max+1e-6)),maxHexes:Math.floor(max+1e-6),limited,blocked,label:`${weapon.name||'Выстрел'}: ${hexLabel109(Math.min(distance,max))} / ${hexLabel109(max)}${blocked?' · ЛИНИЯ ОГНЯ БЛОКИРОВАНА':''}`};}
    if(token.burstStateV122)return {kind:'route',mode:'move',sourceTokenId:token.id,points:[start],end:start,steps:0,cost:0,limited:true,blocked:true,label:'Сначала завершите скорострельную очередь'};if(!canMechanicalMove108(token))return {kind:'route',mode:'move',sourceTokenId:token.id,points:[start],end:start,steps:0,cost:0,limited:true,blocked:true,label:'Выбран не текущий юнит инициативы'};const snappedTarget=nearestHexCenter107(scene,point),path=findHexPath108(scene,start,snappedTarget,token.id),totalMax=Math.max(0,Math.floor(tokenMoveCells(token,scene)+1e-6)),spentCells=Math.max(0,Math.floor(num(token.movedThisTurn,0)+1e-6)),max=Math.max(0,totalMax-spentCells);if(!path){return {kind:'route',mode:'move',sourceTokenId:token.id,points:[start],end:start,steps:0,cost:0,limited:true,blocked:true,label:'Путь заблокирован'};}const cut=truncateHexPath108(path,max),remaining=Math.max(0,max-cut.cost),terrainExtra=Math.max(0,cut.cost-cut.steps),command=activeDroneCommand129(token),operator=command?.returnOnly?operatorForDrone129(token):null,wrongDirection=Boolean(operator&&hexDistancePoints109(scene,cut.end,centerOf(operator))>=hexDistancePoints109(scene,start,centerOf(operator)));return {kind:'route',mode:'move',sourceTokenId:token.id,points:cut.points,end:cut.end,steps:cut.steps,cost:cut.cost,limited:cut.limited||wrongDirection,blocked:wrongDirection,label:wrongDirection?'Без связи дрон может двигаться только к оператору':`Движение: ${hexLabel109(cut.steps)} · стоимость ${cut.cost}${terrainExtra?` (+${terrainExtra} за трудную местность)`:''} / останется ${remaining}`};
  }
  function makeGrenadePreview105(point){const scene=Combat.getScene(),token=selectedToken104(),grenade=grenadeForToken105(token);if(!scene||!token||!grenade)return null;const start=centerOf(token),max=grenadeRangeCells105(grenade,scene),snapped=nearestHexCenter107(scene,point),distance=hexDistancePoints109(scene,start,snapped),rangeEnd=hexEndpointAtRange109(scene,start,snapped,max),end={x:rangeEnd.x,y:rangeEnd.y},radiusHexes=Math.max(0,Math.floor(grenadeRadiusCells105(grenade,scene)+1e-6)),radius=radiusHexes*hexStepDistance109(),limited=distance>Math.floor(max+1e-6);return {kind:'grenade',mode:'grenade',sourceTokenId:token.id,start,end,radius,radiusHexes,hexes:Math.min(distance,max),maxHexes:max,limited,itemId:grenade.id,label:`${grenade.name}: бросок ${hexLabel109(Math.min(distance,max))} / ${hexLabel109(max)} · радиус ${hexLabel109(radiusHexes)}`};}
  function tokenTeam122(token={}){return String(token.teamId||token.factionId||(token.playerId?'players':token.npcId?'npcs':token.type||'units'));}
  function meleeWeapons122(token){const rows=ownedItems105(token,'weapon').filter(item=>String(item.weaponCategory||'').toLowerCase()==='melee');return rows.length?rows:[normalizeEquipmentItemV2({id:'__unarmed_v122',name:'Безоружная атака',type:'weapon',weaponCategory:'melee',damage:'1',hitBonus:0,range:1,rapidFireShots:1,isUnarmedV122:true})];}
  async function resolveOpportunityAttack122(source,target,weapon,options={}){
    const scene=Combat.getScene(),rules=window.GRPGCombatRulesV119,transaction=beginCombatTransaction120('opportunity',scene?.id,source.id,[target.id]);if(!transaction)return num(target.hpCurrent)>0;
    try{
      let refs=combatTransactionRefs120(transaction),attacker=refs.attacker,victim=refs.target;const entity=entityForToken(attacker)||{},attack=window.GRPGStatsV113?.weaponAttack?.(entity,weapon,{kind:attacker.npcId?'npc':'player',inCombat:true,temporaryModifiers:timedStatModifiers122(attacker)}),hitBonus=num(attack?.bonus??weapon.hitBonus)-2-injuryCheckPenalty129(attacker),damageBonus=num(attack?.damageBonus),defense=incomingDefense119(victim,'melee',null);defense.defenseBonus-=injuryCheckPenalty129(victim);
      const declaredContext={attacker,target:victim,caster:attacker,targets:[victim],weapon,damageType:'melee',sourceName:`Атака по возможности: ${weapon.name}`},declared={damage:0,attackBonus:hitBonus,defenseBonus:defense.defenseBonus,effects:[]};await runAutomaticHooks119(attacker,'OnAttackDeclared',declaredContext,declared);await chooseReaction119('OnAttackDeclared',declaredContext,declared);
      const entered=await requestAttackRolls119({attacker,target:victim,weapon,attackBonus:declared.attackBonus,defenseBonus:declared.defenseBonus,damageBonus,attackDisadvantage:injuryDisadvantage129(attacker),defenseDisadvantage:injuryDisadvantage129(victim)});if(!entered)return num(victim.hpCurrent)>0;
      attacker.reactionUsedV119=true;
      const context={...declaredContext,attackRoll:entered.attackRoll,defenseRoll:entered.defenseRoll},pre={damage:0,attackBonus:declared.attackBonus,defenseBonus:declared.defenseBonus,effects:declared.effects};
      await runAutomaticHooks119(attacker,'BeforeAttackStart',{...context,attackBonus:pre.attackBonus,defenseBonus:pre.defenseBonus},pre);await chooseReaction119('BeforeAttackStart',{...context,attackBonus:pre.attackBonus,defenseBonus:pre.defenseBonus},pre);
      const result=rules.resolveManualAttack({attackRoll:entered.attackRoll,defenseRoll:entered.defenseRoll,attackBonus:pre.attackBonus,defenseBonus:pre.defenseBonus,damageRoll:entered.damageRoll,damageBonus,damageReduction:0});
      refs=combatTransactionRefs120(transaction);attacker=refs.attacker;victim=refs.target;let finalDamage=result.damageApplied,injuryDamage=0,hp={before:num(victim?.hpCurrent),after:num(victim?.hpCurrent),applied:0},state={damage:result.hit?result.damageApplied:0,damagePartsV138:result.hit?[{amount:result.damageApplied,absorptionSource:'all'}]:[],effects:pre.effects};
      if(result.hit&&victim){await runAutomaticHooks119(attacker,'OnHit',{...context,attacker,target:victim,damage:state.damage},state);await chooseReaction119('OnHit',{...context,attacker,target:victim,damage:state.damage},state);refs=combatTransactionRefs120(transaction);victim=refs.target;attacker=refs.attacker;if(victim){await runAutomaticHooks119(victim,'BeforeDamage',{...context,attacker,target:victim,damage:state.damage},state);await chooseReaction119('BeforeDamage',{...context,attacker,target:victim,damage:state.damage},state);finalDamage=applyAbsorptionV138(state,incomingDefense119(victim,'melee',null)).applied;if(result.defenseCritical)finalDamage=Math.floor(finalDamage/2);hp=rules.applyDamage(victim,finalDamage);injuryDamage=Math.max(0,num(hp.applied));updatePlayerHp105(victim);const afterContext={...context,attacker,target:victim,damage:finalDamage};await runAutomaticHooks119(victim,'OnTakeDamage',afterContext,state);await chooseReaction119('OnTakeDamage',afterContext,state);refs=combatTransactionRefs120(transaction);victim=refs.target;hp.after=num(victim?.hpCurrent,hp.after);hp.applied=Math.max(0,hp.before-hp.after);if(victim)updatePlayerHp105(victim);}}
      if(victim)await applyInjuryAfterDamage129(victim,injuryDamage,weapon.name||'Атака по возможности');
      if(result.fumble){if(weapon.isUnarmedV122){setConditionV138(attacker,'prone',true);attacker.reactionUsedV119=true;}else attacker.weaponMalfunctionsV122={...(attacker.weaponMalfunctionsV122||{}),[weapon.id]:true};}
      appendCombatLog105(refs.runtime,`${attacker.name} ${result.hit?'попадает':'промахивается'} атакой по возможности по ${victim?.name||target.name} (−2 к попаданию)${result.hit?`: ${hp.before} → ${hp.after} HP`:''}${result.fumble?' · натуральная 1':''}.`);
      Combat.syncInitiative(scene.id,false);flushLuaEffects119(state);if(!options.deferCheckpoint)await checkpointCombat120('Сцена: атака по возможности',true);return num(victim?.hpCurrent,0)>0;
    }catch(error){
      console.error('SCENE_OPPORTUNITY_ATTACK_V122_FAILED',error);
      Toast.show(`Атака по возможности не завершена: ${error?.message||error}`,'err');
      return false;
    }finally{finishCombatTransaction120(transaction);}
  }
  async function resolveOpportunityAttacks122(mover,path){
    const scene=Combat.getScene(),runtime=Combat.getRuntime();if(!scene||!runtime)return{alive:true,reactionUsed:false};const start=centerOf(mover),travel=list(path).slice(1),candidates=list(runtime.tokens).filter(token=>token.id!==mover.id&&num(token.hpCurrent)>0&&!token.reactionUsedV119&&injurySeverity129(token)<4&&tokenTeam122(token)!==tokenTeam122(mover)&&hexDistancePoints109(scene,centerOf(token),start)<=1&&travel.some(point=>hexDistancePoints109(scene,centerOf(token),point)>1));
    let reactionUsed=false;
    for(const source of candidates){const weapons=meleeWeapons122(source).filter(item=>!weaponMalfunction122(source,item)&&(injurySeverity129(source)<3||!isHeavyWeapon129(item)));if(!weapons.length)continue;const body=`<div class="scene-lua-participants-v119"><b>${html(source.name)}</b><span>→</span><b>${html(mover.name)}</b></div><div class="field"><label>Ближняя атака</label><select class="select" name="opportunityWeapon">${weapons.map((item,index)=>`<option value="${html(item.id)}" ${index===0?'selected':''}>${html(item.name)} · ${html(item.damage||'1')} · попадание −2</option>`).join('')}</select></div><div class="small-note">Противник покидает соседний гекс без Отхода. ДМ может отклонить реакцию без её расхода.</div>`;const weaponId=await combatModal119({title:'Атака по возможности',subtitle:'Решение ДМа',body,confirm:'ИСПОЛЬЗОВАТЬ РЕАКЦИЮ',decline:'ОТКЛОНИТЬ',read:form=>String(form.elements.opportunityWeapon?.value||'')});if(!weaponId)continue;reactionUsed=true;const weapon=weapons.find(item=>String(item.id)===weaponId)||weapons[0];if(!await resolveOpportunityAttack122(source,mover,weapon,{deferCheckpoint:true}))return{alive:false,reactionUsed};}
    return{alive:num(mover.hpCurrent)>0,reactionUsed};
  }
  async function commitMove104(){
    const selected=selectedToken104(),scene=Combat.getScene(),preview=local.preview;
    if(!selected||!scene||preview?.kind!=='route'||preview.mode!=='move')return;
    if(local.moveBusyV122||local.lua119.busy){Toast.show('Предыдущее боевое действие ещё не завершено','info');return;}
    if(preview.blocked){Toast.show(preview.label||'Путь заблокирован','info');return;}
    if(!canMechanicalMove108(selected)){Toast.show('Сейчас не ход этого юнита','info');return;}
    if(num(preview.steps,0)<=0)return;
    const runtime=Combat.getRuntime(scene.id),token=list(runtime?.tokens).find(row=>row.id===selected.id);
    if(!token)return;
    local.moveBusyV122=true;
    try{
      let opportunity={alive:true,reactionUsed:false};
      if(!token.disengagedV122){opportunity=await resolveOpportunityAttacks122(token,preview.points);if(!opportunity.alive){Combat.render();broadcastScene104();await checkpointCombat120('Сцена: атака по возможности',opportunity.reactionUsed);return;}}
      fitTokenToHex107(token,scene,preview.end);
      token.movedThisTurn=Math.max(0,num(token.movedThisTurn))+Math.max(0,Math.floor(num(preview.cost,preview.steps)));
      local.preview={...preview,effect:'move',movedTokenId:token.id};
      Combat.render();
      broadcastScene104();
      await checkpointCombat120(opportunity.reactionUsed?'Сцена: атака по возможности и перемещение':'Сцена: перемещение',opportunity.reactionUsed);
      setTimeout(()=>{if(local.preview?.effect==='move'&&local.preview?.movedTokenId===token.id){local.preview=null;refreshPreviewDom104();}},650);
    }catch(error){
      console.error('SCENE_MOVE_V122_FAILED',error);
      Toast.show(`Перемещение не завершено: ${error?.message||error}`,'err');
    }finally{local.moveBusyV122=false;}
  }
  async function togglePosture128(){
    const state=postureAvailability128(),token=state.token;if(!state.enabled||!token){Toast.show(state.reason||'Смена положения недоступна','info');return;}
    local.moveBusyV122=true;
    try{
      setConditionV138(token,'prone',!token.proneV122);
      token.movedThisTurn=Math.max(0,num(token.movedThisTurn))+state.cost;
      appendCombatLog105(Combat.getRuntime(),`${token.name} ${token.proneV122?'ложится':'встаёт'}, расходуя ${state.cost} движения.`);
      Combat.render();broadcastScene104();
      await checkpointCombat120(`Сцена: ${token.proneV122?'лечь':'встать'}`,false);
    }catch(error){console.error('SCENE_POSTURE_V128_FAILED',error);Toast.show(`Смена положения не сохранена: ${error?.message||error}`,'err');}
    finally{local.moveBusyV122=false;Combat.render();}
  }
  function updatePlayerHp105(token){if(token?.playerId&&App.state?.users?.[token.playerId]){const user=normalizePlayerProfileV2(App.state.users[token.playerId]);user.stats={...(user.stats||{}),hpCurrent:token.hpCurrent,hpMax:Math.max(num(user.stats?.hpMax,0),num(token.hpMax,1))};App.state.users[token.playerId]=user;}}
  function combatProfilePatch120(user={}){
    return{
      stats:clone(user.stats||{}),
      inventory:clone(list(user.inventory)),
      equipmentSlots:clone(user.equipmentSlots||{}),
      implantSlots:clone(list(user.implantSlots)),
      installedImplantIds:clone(list(user.installedImplantIds)),
      weaponMagazines:clone(user.weaponMagazines||{}),
      itemStateV138:clone(user.itemStateV138||{}),
      inventoryBaseSlots:user.inventoryBaseSlots,
      carryBase:user.carryBase,
      baseImplantSlots:user.baseImplantSlots,
      inventorySize:user.inventorySize,
      carryWeightMax:user.carryWeightMax,
      implantSlotCount:user.implantSlotCount
    };
  }
  async function pushCombatProfile120(playerId,patch){
    if(!PlayerSync?.pushPlayerPatch)return{ok:true,status:'local-only'};
    return PlayerSync.pushPlayerPatch(playerId,patch,{notice:null,rerender:false});
  }
  async function persistCombatProfiles105(reason='Сцена: боевое действие',options={}){
    local.stability.dirtyProfiles=true;
    clearTimeout(local.stability.localPersistTimer);local.stability.localPersistTimer=0;
    const save=async()=>{
      try{
        window.__grpgCombatCheckpointV120=true;
        try{await Persistence?.save?.(App.state);}finally{window.__grpgCombatCheckpointV120=false;}
        await App.writeLocalMirrors?.();
        if(options.immediate){
          const runtime=Combat.getRuntime(),playerIds=unique(list(runtime?.tokens).map(token=>token?.playerId));
          for(const playerId of playerIds){
            const user=normalizePlayerProfileV2(App.state?.users?.[playerId]||PLAYER_TEMPLATES?.[playerId]||{});
            if(!user.id)continue;
            const patch=combatProfilePatch120(user),hash=JSON.stringify(patch);
            if(local.combatProfileHashesV120.get(playerId)===hash)continue;
            const pushed=await pushCombatProfile120(playerId,patch);
            if(pushed?.ok===false)throw new Error(pushed?.message||`Не удалось сохранить профиль ${user.displayName||playerId}`);
            local.combatProfileHashesV120.set(playerId,hash);
          }
          await App.writeLocalMirrors?.();
        }
        return {ok:true,status:options.immediate?'saved':'saved-local',reason};
      }catch(error){console.error('SCENE_LOCAL_PROFILE_SAVE_FAILED',error);return {ok:false,message:error?.message||String(error),reason};}
    };
    local.profileSaveChainV120=Promise.resolve(local.profileSaveChainV120).catch(()=>({ok:false})).then(save);
    return local.profileSaveChainV120;
  }
  function appendCombatLog105(runtime,text){runtime.log=Array.isArray(runtime.log)?runtime.log:[];runtime.log.unshift({id:makeId('scene_log'),createdAt:new Date().toISOString(),text});runtime.log=runtime.log.slice(0,30);}
  function beginCombatTransaction120(kind,sceneId,attackerId,targetIds=[]){
    if(local.lua119.busy||local.combatTransactionV120){Toast.show('Предыдущее боевое действие ещё не завершено','info');return null;}
    const transaction={id:++local.combatTransactionSeqV120,kind,sceneId:String(sceneId||''),attackerId:String(attackerId||''),targetIds:list(targetIds).map(String),startedAt:Date.now()};
    local.combatTransactionV120=transaction;local.lua119.busy=true;return transaction;
  }
  function combatTransactionRefs120(transaction){
    if(!transaction||local.combatTransactionV120?.id!==transaction.id)throw new Error('Боевая транзакция была отменена');
    const scene=COMBAT_SCENES?.[transaction.sceneId]||null,runtime=Combat.getRuntime(transaction.sceneId);
    if(!scene||!runtime)throw new Error('Боевая сцена была закрыта во время действия');
    const attacker=list(runtime.tokens).find(row=>String(row.id)===transaction.attackerId)||null;
    const targets=transaction.targetIds.map(id=>list(runtime.tokens).find(row=>String(row.id)===id)||null).filter(Boolean);
    if(!attacker)throw new Error('Атакующий больше не находится на сцене');
    return{scene,runtime,attacker,targets,target:targets[0]||null};
  }
  function finishCombatTransaction120(transaction){
    if(local.combatTransactionV120?.id===transaction?.id)local.combatTransactionV120=null;
    local.lua119.busy=false;
  }

  function closeCombatModal119(value=null){const overlay=document.querySelector('.scene-lua-overlay-v119');if(!overlay)return;const finish=overlay.__finishV119;overlay.remove();if(typeof finish==='function')finish(value);}
  function combatModal119({title='',subtitle='',body='',confirm='ПОДТВЕРДИТЬ',decline='ОТКЛОНИТЬ',read=null,validate=null}={}){
    closeCombatModal119(null);
    return new Promise(resolve=>{
      const overlay=document.createElement('div');overlay.className='scene-lua-overlay-v119';
      overlay.innerHTML=`<form class="scene-lua-modal-v119"><header><span class="tiny-label">БОЕВАЯ СЦЕНА · РЕШЕНИЕ ДМА</span><h3>${html(title)}</h3>${subtitle?`<p>${html(subtitle)}</p>`:''}</header><div class="scene-lua-modal-body-v119">${body}</div><footer><button class="ghost" type="button" data-lua-decline-v119>${html(decline)}</button><button class="primary" type="submit">${html(confirm)}</button></footer></form>`;
      let completed=false;overlay.__finishV119=value=>{if(completed)return;completed=true;resolve(value);};
      overlay.querySelector('[data-lua-decline-v119]')?.addEventListener('click',()=>closeCombatModal119(null));
      overlay.querySelector('form')?.addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;const value=typeof read==='function'?read(form):true;const problem=typeof validate==='function'?validate(value,form):'';if(problem){const note=form.querySelector('[data-lua-modal-error-v119]');if(note)note.textContent=String(problem);else Toast.show(String(problem),'info');return;}closeCombatModal119(value);});
      // The scene renderer replaces #mod-combat. Keeping the decision window under body
      // prevents a harmless board refresh from orphaning this Promise and locking combat.
      document.body.appendChild(overlay);
      setTimeout(()=>overlay.querySelector('input,select,button.primary')?.focus(),0);
    });
  }
  function manualDamageLabel119(expression=''){return window.GRPGCombatRulesV119?.requiresManualDamage?.(expression)?`Итог броска урона (${expression||'по описанию'})`:`Базовый урон (${expression||0})`;}
  function requestAttackRolls119({attacker,target,weapon,attackBonus,defenseBonus,damageBonus,disadvantage=false,attackDisadvantage=disadvantage,defenseDisadvantage=false,shotIndex=1}){
    const expression=String(weapon?.damage||'').trim(),suggested=window.GRPGCombatRulesV119?.suggestedDamage?.(expression)||0;
    const body=`<div class="scene-lua-participants-v119"><b>${html(attacker?.name||'Атакующий')}</b><span>→</span><b>${html(target?.name||'Цель')}</b>${shotIndex>1?`<strong>Выстрел ${shotIndex} · штраф −${shotIndex-1}</strong>`:''}</div><div class="cols4"><div class="field"><label>${attackDisadvantage?'Первый d20 атаки':'Результат d20 атаки'}</label><input class="input" required type="number" min="1" max="20" name="attackRoll"/><small>Бонус атаки: ${num(attackBonus)>=0?'+':''}${num(attackBonus)}</small></div>${attackDisadvantage?`<div class="field"><label>Второй d20 атаки</label><input class="input" required type="number" min="1" max="20" name="attackRollSecond"/><small>Помеха: берётся меньший.</small></div>`:''}<div class="field"><label>${defenseDisadvantage?'Первый d20 цели':'Результат d20 цели'}</label><input class="input" required type="number" min="1" max="20" name="defenseRoll"/><small>Бонус защиты: ${num(defenseBonus)>=0?'+':''}${num(defenseBonus)}</small></div>${defenseDisadvantage?`<div class="field"><label>Второй d20 цели</label><input class="input" required type="number" min="1" max="20" name="defenseRollSecond"/><small>Смертельная травма: берётся меньший.</small></div>`:''}<div class="field"><label>${html(manualDamageLabel119(expression))}</label><input class="input" required type="number" min="0" name="damageRoll" value="${suggested||''}"/><small>Бонус урона: ${num(damageBonus)>=0?'+':''}${num(damageBonus)}</small></div></div><div class="small-note">Все кубики бросаются на столе. Натуральные значения проверяются до бонусов.</div><div class="scene-lua-modal-error-v119" data-lua-modal-error-v119></div>`;
    return combatModal119({title:`Атака: ${weapon?.name||'оружие'}`,subtitle:'Введите результаты физических бросков',body,confirm:'РАССЧИТАТЬ И ПРИМЕНИТЬ',decline:'ОТМЕНИТЬ АТАКУ',read:form=>{const first=num(form.elements.attackRoll?.value,0),second=attackDisadvantage?num(form.elements.attackRollSecond?.value,0):first,defenseFirst=num(form.elements.defenseRoll?.value,0),defenseSecond=defenseDisadvantage?num(form.elements.defenseRollSecond?.value,0):defenseFirst;return{attackRoll:Math.min(first,second),attackRolls:attackDisadvantage?[first,second]:[first],defenseRoll:Math.min(defenseFirst,defenseSecond),defenseRolls:defenseDisadvantage?[defenseFirst,defenseSecond]:[defenseFirst],damageRoll:num(form.elements.damageRoll?.value,0)};},validate:value=>value.attackRoll<1||value.defenseRoll<1?'Введите все результаты d20.':''});
  }
  function requestDamageRoll119({title,source,expression,damageBonus=0,targets=[]}){
    const suggested=window.GRPGCombatRulesV119?.suggestedDamage?.(expression)||0;
    const body=`<div class="scene-lua-participants-v119"><b>${html(source?.name||'Источник')}</b><span>→</span><b>${html(targets.map(row=>row.name).join(', ')||'область')}</b></div><div class="field"><label>${html(manualDamageLabel119(expression))}</label><input class="input" required type="number" min="0" name="damageRoll" value="${suggested||''}"/><small>Бонус приложения: ${num(damageBonus)>=0?'+':''}${num(damageBonus)}</small></div><div class="small-note">Одно введённое значение применяется ко всем целям области. Никаких автоматических бросков нет.</div>`;
    return combatModal119({title,subtitle:'Введите итог физического броска',body,confirm:'ПРИМЕНИТЬ',decline:'ОТМЕНИТЬ',read:form=>({damageRoll:Math.max(0,num(form.elements.damageRoll?.value,0))})});
  }

  function scriptSourcesForToken119(token={}){
    token=token&&typeof token==='object'?token:{};
    const entity=entityForToken(token)||{},rows=[],seen=new Set();
    const add=(raw,kind)=>{if(!raw?.id||raw.luaEnabled!==true||!String(raw.luaScript||'').trim())return;const key=`${kind}:${raw.id}`;if(seen.has(key))return;seen.add(key);const activation=String(raw.activationType||'passive');rows.push({id:String(raw.id),name:String(raw.name||raw.id),kind,ownerToken:token,script:String(raw.luaScript),mode:kind==='skill'?(activation==='reaction'?'reaction':activation==='active'?'active':'automatic'):(raw.activeUse===true?'active':String(raw.luaTriggerMode||'automatic')==='reaction'?'reaction':'automatic'),reactionLabel:String(raw.luaReactionLabel||raw.name||raw.id),raw});};
    list(entity.skills).forEach(id=>add(skillForScene118(id),'skill'));
    const slots=Object.values(entity.equipmentSlots||{}),implants=list(entity.implantSlots?.length?entity.implantSlots:entity.installedImplantIds);
    unique([...slots,...implants,token.weaponId,token.grenadeId,token.equipmentItemId]).forEach(id=>{const item=equipmentItem105(id);if(item&&!itemBrokenV138(token,item,equippedEntriesV138(token).find(row=>row.item.id===item.id)?.slot||''))add(item,item.type==='implant'?'implant':'equipment');});
    for(const entry of list(tokenInventoryOwner120(token).rows)){const item=equipmentItem105(entry?.itemId);if(item?.activeUse&&num(entry?.qty,0)>0)add(item,item.type==='implant'?'implant':'equipment');}
    return rows;
  }
  function thinkerPoint125(thinker,runtime=Combat.getRuntime()){
    const follow=thinker?.followUnitId?list(runtime?.tokens).find(token=>String(token.id)===String(thinker.followUnitId)):null;
    if(follow){const point=centerOf(follow);thinker.x=point.x;thinker.y=point.y;return point;}
    return{x:num(thinker?.x),y:num(thinker?.y)};
  }
  function thinkerContext125(thinker,runtime=Combat.getRuntime()){
    const caster=list(runtime?.tokens).find(token=>String(token.id)===String(thinker.casterId))||null,position=thinkerPoint125(thinker,runtime),targets=abilityTargetsAtPoint125(position,{...thinker,radius:thinker.radius},caster);
    return{caster,attacker:caster,target:targets[0]||null,targets,position,thinker:{id:thinker.thinkerId||thinker.id,runtimeId:thinker.id,name:thinker.name,position,radius:thinker.radius,createdRound:thinker.createdRound,expiresRound:thinker.expiresRound},ability:thinker.sourceRaw||{},sourceName:thinker.sourceName||thinker.name,inputs:{}};
  }
  function sourceForThinker125(thinker,runtime=Combat.getRuntime()){
    if(!String(thinker?.script||'').trim())return null;
    const ownerToken=list(runtime?.tokens).find(token=>String(token.id)===String(thinker.casterId))||null;
    return{id:String(thinker.sourceId||thinker.thinkerId||thinker.id),name:String(thinker.sourceName||thinker.name),kind:String(thinker.sourceKind||'skill'),ownerId:String(thinker.casterId||''),ownerToken,script:String(thinker.script),mode:'automatic',reactionLabel:String(thinker.sourceName||thinker.name),raw:thinker.sourceRaw||{}};
  }
  function createThinker125(command={},context={},options={}){
    const runtime=Combat.getRuntime(),scene=Combat.getScene(),source=context.scriptSource||null;if(!runtime||!scene)return null;
    runtime.thinkersV125=list(runtime.thinkersV125).map(normalizeThinker125);
    const logicalId=String(command.thinkerId||options.thinkerId||source?.id||makeId('thinker'));
    if(options.replace!==false&&logicalId)runtime.thinkersV125=runtime.thinkersV125.filter(row=>!(String(row.thinkerId)===logicalId&&String(row.casterId)===String(command.casterId||context.caster?.id||source?.ownerToken?.id||source?.ownerId||'')));
    const currentRound=Math.max(1,Math.trunc(num(runtime.round,1))),duration=Math.max(0,Math.trunc(num(command.durationRounds??options.durationRounds,1))),interval=Math.max(1,Math.trunc(num(command.intervalRounds??options.intervalRounds,1))),position=command.position||context.position||{x:command.x,y:command.y}||centerOf(context.caster||{}),casterId=String(command.casterId||context.caster?.id||source?.ownerToken?.id||source?.ownerId||'');
    const thinker=normalizeThinker125({
      id:makeId('thinker'),thinkerId:logicalId,name:String(command.name||options.name||source?.name||logicalId||'Thinker'),
      sourceId:String(source?.id||context.ability?.id||''),sourceKind:String(source?.kind||'skill'),sourceName:String(source?.name||context.sourceName||logicalId),script:String(source?.script||''),sourceRaw:clone(source?.raw||context.ability||{}),casterId,
      followUnitId:String(command.followUnitId||options.followUnitId||''),x:num(position?.x,centerOf(context.caster||{}).x),y:num(position?.y,centerOf(context.caster||{}).y),radius:Math.max(0,num(command.radius??options.radius,1)),
      createdRound:currentRound,expiresRound:duration>0?currentRound+duration:0,intervalRounds:interval,nextPulseRound:currentRound+interval,lastPulseRound:0,
      relation:String(command.relation||options.relation||'any'),players:command.players??options.players??true,npcs:command.npcs??options.npcs??true,units:command.units??options.units??false,alive:command.alive??options.alive??true,includeSelf:command.includeSelf??options.includeSelf??false,visibleToPlayers:command.visibleToPlayers??options.visibleToPlayers??true,color:String(command.color||options.color||'#7df9ff')
      ,blockSight:command.blockSight??options.blockSight??false,allowVision:command.allowVision??options.allowVision??false
    });
    runtime.thinkersV125.push(thinker);appendCombatLog105(runtime,`${context.sourceName||thinker.name}: создана область «${thinker.name}»${duration?` на ${duration} раунд.`:' без ограничения срока'}`);return thinker;
  }
  function destroyThinkers125(command={},context={}){
    const runtime=Combat.getRuntime();if(!runtime)return 0;const id=String(command.thinkerId||''),casterId=String(command.casterId||context.caster?.id||'');let removed=0;
    runtime.thinkersV125=list(runtime.thinkersV125).filter(row=>{const match=(!id||String(row.id)===id||String(row.thinkerId)===id)&&(!casterId||String(row.casterId)===casterId);if(match)removed++;return!match;});
    if(removed)appendCombatLog105(runtime,`${context.sourceName||'Lua'}: удалено областей thinker — ${removed}.`);return removed;
  }
  function toggleOrCreateBehaviorThinker125(meta,source,context={}){
    const runtime=Combat.getRuntime(),behavior=normalizeAbilityBehavior125(meta.behavior),baseId=`ability:${source.id}`,logicalId=behavior==='persistent_area'?`${baseId}:${makeId('area')}`:baseId,casterId=String(context.caster?.id||source.ownerToken?.id||''),existing=list(runtime?.thinkersV125).find(row=>String(row.thinkerId)===baseId&&String(row.casterId)===casterId);
    if(behavior==='toggle_aura'&&existing){destroyThinkers125({thinkerId:logicalId,casterId},context);return{thinker:null,toggled:false};}
    const thinker=createThinker125({thinkerId:logicalId,name:source.name,casterId,followUnitId:behavior==='aura'||behavior==='toggle_aura'?casterId:'',x:context.position?.x,y:context.position?.y,radius:meta.areaRadius,durationRounds:behavior==='toggle_aura'?0:meta.thinkerDuration,intervalRounds:meta.thinkerInterval,relation:meta.relation,players:meta.players,npcs:meta.npcs,units:meta.units,alive:meta.alive,includeSelf:meta.includeSelf,visibleToPlayers:meta.visibleToPlayers,color:meta.color},context,{replace:behavior!=='persistent_area'});
    return{thinker,toggled:true};
  }
  async function processThinkers125(state={effects:[]}){
    const runtime=Combat.getRuntime(),round=Math.max(1,Math.trunc(num(runtime?.round,1)));if(!runtime)return state;runtime.thinkersV125=list(runtime.thinkersV125).map(normalizeThinker125);
    for(const thinkerId of runtime.thinkersV125.map(row=>row.id)){
      let thinker=runtime.thinkersV125.find(row=>row.id===thinkerId);if(!thinker)continue;const source=sourceForThinker125(thinker,runtime),context=thinkerContext125(thinker,runtime);
      if(thinker.expiresRound>0&&round>=thinker.expiresRound){runtime.thinkersV125=runtime.thinkersV125.filter(row=>row.id!==thinker.id);try{if(source){const result=await runLuaSource119(source,'OnThinkerDestroyed',context,'execute');if(result.hasHook)await applyLuaCommands119(result.commands,{...context,scriptSource:source},state);}}catch(error){console.error('SCENE_THINKER_DESTROY_V125',error);Toast.show(String(error?.message||error),'err');}appendCombatLog105(runtime,`Область «${thinker.name}» завершена.`);continue;}
      if(round<thinker.nextPulseRound||thinker.lastPulseRound===round)continue;
      thinker.lastPulseRound=round;thinker.nextPulseRound=round+thinker.intervalRounds;
      try{if(source){const result=await runLuaSource119(source,'OnThinkerInterval',context,'execute');if(result.hasHook)await applyLuaCommands119(result.commands,{...context,scriptSource:source},state);}}catch(error){console.error('SCENE_THINKER_INTERVAL_V125',error);Toast.show(String(error?.message||error),'err');}
    }
    return state;
  }
  function thinkerZoneModels125(runtime=Combat.getRuntime(),scene=Combat.getScene()){
    return list(runtime?.thinkersV125).map(raw=>{const thinker=normalizeThinker125(raw),point=thinkerPoint125(thinker,runtime),radius=Math.max(.08,thinker.radius*hexStepDistance109());return{id:`thinker:${thinker.id}`,runtimeId:thinker.id,thinkerId:thinker.thinkerId,shape:'circle',name:thinker.name,label:thinker.name,x:point.x-radius,y:point.y-radius,w:radius*2,h:radius*2,rotation:0,color:thinker.color,visibleToPlayers:thinker.visibleToPlayers,blockSight:thinker.blockSight&&!thinker.allowVision,allowVision:thinker.allowVision,blockMovement:false,__thinkerV125:true};});
  }
  function thinkerMarkup125(thinker,scene){return `<div class="combat-object combat-template scene-zone-v104 shape-circle scene-thinker-v125" style="${objectStyle(thinker,scene,24)}--template-color:${html(thinker.color||'rgba(125,249,255,.35)')};">${thinker.label?`<span class="combat-template-label">${html(thinker.label)}</span>`:''}</div>`;}
  function automaticSourcesForHook122(owner,hook,context={}){
    const rows=scriptSourcesForToken119(owner).filter(row=>row.mode==='automatic');
    if(!['OnAttackDeclared','BeforeAttackStart','OnHit'].includes(String(hook))||String(context.attacker?.id||'')!==String(owner?.id||'')||!context.weapon?.id)return rows;
    const activeId=String(context.weapon.id);
    return rows.filter(source=>!['weapon','grenade'].includes(String(source.raw?.type||'').toLowerCase())||String(source.id)===activeId);
  }
  function luaUnitRows119(runtime,scene){
    const rows=list(runtime?.tokens).map(token=>{
      const entity=entityForToken(token)||{},computed=window.GRPGStatsV113?.compute?.(entity,{kind:token.npcId?'npc':'player',inCombat:true,temporaryModifiers:timedStatModifiers122(token)})||{},defense= incomingDefense119(token,'light'),stats={...(computed.abilities||{}),...(computed.values||{}),hpCurrent:num(token.hpCurrent),hpMax:num(token.hpMax),max_hp:num(token.hpMax),armorClass:defense.defenseBonus,armor_class:defense.defenseBonus,baseArmorClass:defense.baseArmorClass,shieldArmorClass:defense.shieldArmorClass,absorption:defense.damageReduction,baseAbsorption:defense.baseAbsorption,armorAbsorption:defense.armorAbsorption,shieldAbsorption:defense.shieldAbsorption,coverAbsorption:defense.coverAbsorption,initiative_bonus:num(computed.values?.initiativeBonus),defense:defense.damageReduction};
      const inventory=list(tokenInventoryOwner120(token).rows).map(entry=>{const item=equipmentItem105(entry?.itemId)||{},state=itemRuntimeStateV138(token,item,item.id);return{id:String(entry?.itemId||''),itemId:String(entry?.itemId||''),name:String(item.name||entry?.itemId||''),type:String(item.type||'gear'),qty:Math.max(0,Math.trunc(num(entry?.qty,0))),tags:list(item.tags).map(String),durability:state.durability,durabilityMax:state.durabilityMax,broken:state.broken,charges:state.charges,chargesMax:state.chargesMax};}).filter(row=>row.id&&row.qty>0);
      const equipped=equippedEntriesV138(token).map(({slot,item})=>{const state=itemRuntimeStateV138(token,item,slot),magazine=String(item.type)==='weapon'?magazineState118(token,item):{loaded:0,size:0,ammoTypeId:''};return{id:String(item.id),itemId:String(item.id),name:String(item.name||item.id),type:String(item.type||'gear'),slot:String(slot),tags:list(item.tags).map(String),ammo:magazine.loaded,magazineSize:magazine.size,ammoTypeId:magazine.ammoTypeId,durability:state.durability,durabilityMax:state.durabilityMax,broken:state.broken,charges:state.charges,chargesMax:state.chargesMax};});
      const itemIds=unique([...inventory.map(row=>row.itemId),...equipped.map(row=>row.itemId)]);
      const trained=unique([...list(entity.trainedSkills),...list(entity.trained),...Object.entries(entity.skillTraining||{}).filter(([,value])=>value===true||num(value)>0).map(([id])=>id),...Object.entries(entity.skillLevels||{}).filter(([,value])=>num(value)>0).map(([id])=>id)]);
      return {id:String(token.id),name:String(token.name||token.id),kind:token.playerId?'player':token.npcId?'npc':'unit',teamId:String(token.teamId||token.factionId||(token.playerId?'players':token.npcId?'npcs':token.type||'units')),hpCurrent:num(token.hpCurrent),hpMax:num(token.hpMax),x:centerOf(token).x,y:centerOf(token).y,stats,abilities:unique(entity.skills),trained,items:itemIds,inventory,equipped,modifiers:list(token.timedModifiersV122).map(row=>String(row.id)),reactionAvailable:!token.reactionUsedV119&&injurySeverity129(token)<4,conditions:clone(conditionStateV138(token)),movementMode:String(token.movementModeV138||'ground'),distances:{}};
    });
    rows.forEach(a=>rows.forEach(b=>{a.distances[b.id]=hexDistancePoints109(scene,{x:a.x,y:a.y},{x:b.x,y:b.y});}));
    return rows;
  }
  function luaInput119(source,context={}){
    const runtime=Combat.getRuntime(),scene=Combat.getScene(),targets=list(context.targets).filter(Boolean);
    const compactEntity=value=>value?{id:String(value.id||''),name:String(value.name||''),type:String(value.type||''),damage:String(value.damage||''),damageBonus:num(value.damageBonus),hitBonus:num(value.hitBonus),range:num(value.range),behavior:normalizeAbilityBehavior125(value.abilityBehavior||value.behavior),castRange:num(value.castRange),areaRadius:num(value.areaRadius??value.aoeRadius),thinkerDuration:num(value.thinkerDuration??value.durationRounds),thinkerInterval:num(value.thinkerInterval??value.intervalRounds,1),tags:list(value.tags).map(String)}:{};
    const raw=source.raw||{},position=context.position&&typeof context.position==='object'?{x:num(context.position.x),y:num(context.position.y)}:null,thinker=context.thinker&&typeof context.thinker==='object'?clone(context.thinker):null;
    return {source:{id:source.id,name:source.name,kind:source.kind,ownerId:String(source.ownerToken?.id||source.ownerId||''),behavior:normalizeAbilityBehavior125(raw.abilityBehavior||raw.behavior),castRange:num(raw.castRange),areaRadius:num(raw.areaRadius??raw.aoeRadius),thinkerDuration:num(raw.thinkerDuration??raw.durationRounds),thinkerInterval:num(raw.thinkerInterval??raw.intervalRounds,1),tags:list(raw.tags).map(String)},units:luaUnitRows119(runtime,scene),params:{event:String(context.event||''),attackerId:String(context.attacker?.id||''),targetId:String(context.target?.id||targets[0]?.id||''),targetIds:targets.map(row=>String(row.id)),casterId:String(context.caster?.id||source.ownerToken?.id||source.ownerId||''),damage:num(context.damage),damageType:String(context.damageType||''),attackBonus:num(context.attackBonus),defenseBonus:num(context.defenseBonus),attackRoll:context.attackRoll,defenseRoll:context.defenseRoll,hit:context.hit===true,critical:context.critical===true,toggled:context.toggled===true,position,thinker,inputs:context.inputs&&typeof context.inputs==='object'?context.inputs:{},targetRequests:context.targetRequests&&typeof context.targetRequests==='object'?context.targetRequests:{},weapon:compactEntity(context.weapon),ability:compactEntity(context.ability)}};
  }
  async function runLuaSource119(source,hook,context={},mode='execute'){
    const result=await window.electronAPI?.runCombatLuaHook?.({mode,hook,script:source.script,input:luaInput119(source,{...context,event:hook})});
    if(!result?.ok)throw new Error(`${source.name}: ${result?.message||'ошибка Lua'}`);
    return result;
  }
  function tokenById119(id){return list(Combat.getRuntime()?.tokens).find(row=>String(row.id)===String(id))||null;}
  function emitParticle119(command){
    const scene=Combat.getScene(),stage=document.getElementById('combat-stage');if(!scene||!stage)return;const token=tokenById119(command.unitId),point=token?centerOf(token):{x:num(command.x,scene.width/2),y:num(command.y,scene.height/2)};
    const node=document.createElement('i');node.className=`scene-lua-particle-v119 effect-${String(command.effectId||'pulse').replace(/[^a-z0-9_-]/gi,'')}`;node.style.left=`${point.x/scene.width*100}%`;node.style.top=`${point.y/scene.height*100}%`;node.style.setProperty('--particle-color',String(command.color||'#7df9ff'));node.style.setProperty('--particle-duration',`${clamp104(command.duration,100,5000)}ms`);stage.appendChild(node);setTimeout(()=>node.remove(),clamp104(command.duration,100,5000)+80);
  }
  function flushLuaEffects119(state={}){for(const command of list(state.effects)){if(command.kind==='sound')audioApi()?.play?.(command.soundId,{volume:num(command.volume,1)});if(command.kind==='particle')emitParticle119(command);}state.effects=[];}
  function absorptionSourceV138(value='all'){const source=String(value||'all').toLowerCase();return['none','all','base','armor','shield','cover'].includes(source)?source:'all';}
  function absorptionAmountV138(defense={},source='all'){
    source=absorptionSourceV138(source);if(source==='none')return 0;if(source==='all')return Math.max(0,num(defense.damageReduction,0));return Math.max(0,num(defense[`${source}Absorption`],0));
  }
  function applyAbsorptionV138(state={},defense={}){
    const total=Math.max(0,num(state.damage,0)),parts=list(state.damagePartsV138).length?list(state.damagePartsV138):[{amount:total,absorptionSource:'all'}];
    const partsTotal=parts.reduce((sum,row)=>sum+Math.max(0,num(row?.amount,0)),0);if(Math.abs(partsTotal-total)>.001){parts.length=0;parts.push({amount:total,absorptionSource:'all'});}
    let applied=0,absorbed=0;
    for(const part of parts){const raw=Math.max(0,num(part.amount,0)),source=absorptionSourceV138(part.absorptionSource),globalRule=state.absorptionRulesV138?.[source]||state.absorptionRulesV138?.all||{},base=absorptionAmountV138(defense,source),penetration=Math.max(0,num(part.penetration)>0?num(part.penetration):num(globalRule.penetration)),flat=Math.max(0,num(part.ignoreAbsorption)>0?num(part.ignoreAbsorption):num(globalRule.flat)),percent=clamp104(num(part.ignorePercent)>0?num(part.ignorePercent):num(globalRule.percent),0,100),effective=Math.max(0,base-penetration-flat)*(1-percent/100),taken=Math.min(raw,Math.max(0,Math.round(effective)));absorbed+=taken;applied+=Math.max(0,raw-taken);}
    return{raw:total,absorbed:Math.min(total,absorbed),applied:Math.max(0,Math.round(applied))};
  }
  function weaponForSlotV138(token,slotOrId=''){
    const entry=equippedEntryV138(token,slotOrId);if(entry?.item?.type==='weapon')return{...entry};
    const item=equipmentItem105(slotOrId);if(item?.type==='weapon')return{slot:equippedEntriesV138(token).find(row=>row.item.id===item.id)?.slot||'',item};
    const fallback=weaponForToken105(token);return fallback?{slot:equippedEntriesV138(token).find(row=>row.item.id===fallback.id)?.slot||'',item:fallback}:null;
  }
  function reloadUnitV138(token,slotOrId=''){
    const selected=weaponForSlotV138(token,slotOrId);if(!token||!selected?.item)throw new Error('Reload: оружие не найдено');
    const weapon=selected.item,state=magazineState118(token,weapon);if(state.size<=0)throw new Error(`Reload: у «${weapon.name||weapon.id}» нет магазина`);
    const need=Math.max(0,state.size-state.loaded);if(!need)return{loaded:0,state,weapon};
    if(token.npcId&&!list(tokenInventoryOwner120(token).rows).length){state.loaded=state.size;state.ammoTypeId=state.ammoTypeId||String(weapon.ammoTypeId||weapon.ammunitionId||'');writeMagazineState118(token,weapon,state);return{loaded:need,state,weapon};}
    const ammo=compatibleAmmo120(token,weapon,{availableOnly:true,loadedTypeId:state.loaded>0?state.ammoTypeId:''}).find(row=>String(row.id)===String(state.ammoTypeId||weapon.ammoTypeId||''))||compatibleAmmo120(token,weapon,{availableOnly:true,loadedTypeId:state.loaded>0?state.ammoTypeId:''})[0];
    if(!ammo)throw new Error(`Reload: для «${weapon.name||weapon.id}» нет совместимых патронов`);
    const loaded=consumeAmmoInventory118(token,ammo.id,need);if(!loaded)throw new Error('Reload: не удалось списать патроны');state.loaded+=loaded;state.ammoTypeId=ammo.id;writeMagazineState118(token,weapon,state);return{loaded,state,weapon,ammo};
  }
  function mutateItemStateV138(token,slotOrId,kind,amount=1){
    let entry=equippedEntryV138(token,slotOrId);if(!entry){const owned=list(tokenInventoryOwner120(token).rows).find(row=>String(row?.itemId||'')===String(slotOrId)&&num(row?.qty)>0),item=owned&&equipmentItem105(owned.itemId);if(item)entry={slot:String(item.id),item};}if(!entry)throw new Error(`Предмет в слоте «${slotOrId}» не найден`);const state=itemRuntimeStateV138(token,entry.item,entry.slot);
    if(kind==='spend_charges'){const take=Math.max(1,Math.trunc(num(amount,1)));if(state.chargesMax<=0)throw new Error(`У «${entry.item.name||entry.item.id}» нет зарядов`);if(state.charges<take)throw new Error(`Недостаточно зарядов: ${state.charges} / ${take}`);state.charges-=take;}
    if(kind==='damage_item'){if(state.durabilityMax<=0)throw new Error(`У «${entry.item.name||entry.item.id}» не задана прочность`);state.durability=Math.max(0,state.durability-Math.max(0,num(amount,1)));if(state.durability<=0)state.broken=true;}
    if(kind==='break_item'){if(state.durabilityMax>0)state.durability=0;state.broken=true;}
    return{entry,state};
  }
  async function applyLuaCommands119(commands=[],context={},state={damage:num(context.damage),effects:[]}){
    const runtime=Combat.getRuntime(),scene=Combat.getScene(),rules=window.GRPGCombatRulesV119,requests=[],numberRequests=[];let statsChanged=false;state.effects=state.effects||[];
    for(const command of list(commands)){
      const kind=String(command?.kind||'');
      if(kind==='reduce_damage'){state.damage=Math.max(0,num(state.damage)-Math.max(0,num(command.amount)));state.damagePartsV138=[{amount:state.damage,absorptionSource:'all'}];}
      else if(kind==='add_damage'){const amount=Math.max(0,num(command.amount));state.damage=Math.max(0,num(state.damage)+amount);(state.damagePartsV138||=[]).push({amount,absorptionSource:absorptionSourceV138(command.absorptionSource),penetration:Math.max(0,num(command.penetration)),ignoreAbsorption:Math.max(0,num(command.ignoreAbsorption)),ignorePercent:clamp104(command.ignorePercent,0,100)});}
      else if(kind==='set_damage'){state.damage=Math.max(0,num(command.amount));state.damagePartsV138=[{amount:state.damage,absorptionSource:'all'}];}
      else if(kind==='add_attack_bonus')state.attackBonus=num(state.attackBonus)+num(command.amount);
      else if(kind==='add_defense_bonus')state.defenseBonus=num(state.defenseBonus)+num(command.amount);
      else if(kind==='set_armor_penetration'||kind==='ignore_absorption'){const source=absorptionSourceV138(command.absorptionSource),rules=state.absorptionRulesV138||={},prior=rules[source]||{};rules[source]={...prior,penetration:kind==='set_armor_penetration'?Math.max(0,num(command.amount)):Math.max(0,num(prior.penetration)),flat:kind==='ignore_absorption'?Math.max(0,num(command.amount)):Math.max(0,num(prior.flat)),percent:kind==='ignore_absorption'?clamp104(command.percent,0,100):clamp104(prior.percent,0,100)};state.absorptionRulesV138=rules;}
      else if(kind==='apply_modifier'){
        const target=tokenById119(command.targetId);if(!target)continue;const id=String(command.modifierId||makeId('lua_modifier')),row={id,name:String(command.name||id),sourceId:String(command.sourceId||context.caster?.id||''),remainingTurns:Math.max(1,Math.min(100,Math.trunc(num(command.duration,1)))),effects:list(command.effects).map(effect=>({property:String(effect?.property||effect?.target||''),operation:String(effect?.operation||effect?.op||'add'),value:num(effect?.value),statRef:String(effect?.statRef||'')})).filter(effect=>effect.property),onTurnStartDamage:Math.max(0,num(command.onTurnStartDamage)),onTurnStartHeal:Math.max(0,num(command.onTurnStartHeal))};target.timedModifiersV122=list(target.timedModifiersV122).filter(existing=>String(existing.id)!==id);target.timedModifiersV122.push(row);statsChanged=true;appendCombatLog105(runtime,`${context.sourceName||'Lua'}: на ${target.name} наложен эффект «${row.name}» на ${row.remainingTurns} ход.`);
      }else if(kind==='remove_modifier'){
        const target=tokenById119(command.targetId);if(target){target.timedModifiersV122=list(target.timedModifiersV122).filter(row=>String(row.id)!==String(command.modifierId||''));statsChanged=true;}
      }else if(kind==='damage'||kind==='heal'){
        const target=tokenById119(command.targetId);if(!target)continue;let amount=Math.max(0,num(command.amount)),absorbed=0;if(kind==='damage'){const defense=incomingDefense119(target,context.damageType||'light'),reduced=applyAbsorptionV138({damage:amount,damagePartsV138:[{amount,absorptionSource:command.absorptionSource,penetration:command.penetration,ignoreAbsorption:command.ignoreAbsorption,ignorePercent:command.ignorePercent}]},defense);amount=reduced.applied;absorbed=reduced.absorbed;}const result=kind==='damage'?rules?.applyDamage?.(target,amount):rules?.applyHeal?.(target,amount);updatePlayerHp105(target);appendCombatLog105(runtime,`${context.sourceName||'Lua'}: ${kind==='damage'?'урон':'лечение'} ${target.name} ${num(result?.before)} → ${num(result?.after)}${absorbed?` (поглощено ${absorbed})`:''}.`);
      }else if(kind==='move_to'){
        const unit=tokenById119(command.unitId);if(unit)fitTokenToHex107(unit,scene,nearestHexCenter107(scene,{x:clamp104(command.x,0,scene.width),y:clamp104(command.y,0,scene.height)}));
      }else if(kind==='move_between'){
        const caster=tokenById119(command.casterId),attacker=tokenById119(command.attackerId),target=tokenById119(command.targetId);if(caster&&attacker&&target){const point=hexEndpointAtRange109(scene,centerOf(target),centerOf(attacker),Math.max(0,num(command.distance,1)));fitTokenToHex107(caster,scene,nearestHexCenter107(scene,point));}
      }else if(kind==='create_thinker'){
        createThinker125(command,context);
      }else if(kind==='destroy_thinker'){
        destroyThinkers125(command,context);
      }else if(kind==='set_thinker_vision'){
        const wanted=String(command.thinkerId||'');for(const thinker of list(runtime?.thinkersV125))if(String(thinker.id)===wanted||String(thinker.thinkerId)===wanted)thinker.allowVision=command.allowVision!==false;
      }else if(kind==='spend_reaction'){
        const unit=tokenById119(command.unitId);if(!unit)throw new Error('SpendReaction: юнит не найден');unit.reactionUsedV119=true;
      }else if(kind==='set_condition'){
        const unit=tokenById119(command.unitId);if(!unit||!setConditionV138(unit,String(command.name||''),command.enabled!==false))throw new Error(`SetCondition: неизвестное состояние «${command.name||''}»`);statsChanged=true;
      }else if(kind==='set_movement_mode'){
        const unit=tokenById119(command.unitId),mode=String(command.mode||'ground');if(!unit||!['ground','flight','swim','climb'].includes(mode))throw new Error('SetMovementMode: допустимы ground, flight, swim, climb');unit.movementModeV138=mode;
      }else if(kind==='reload'){
        const unit=tokenById119(command.unitId);if(!unit)throw new Error('Reload: юнит не найден');const result=reloadUnitV138(unit,command.slot);appendCombatLog105(runtime,`${context.sourceName||'Lua'}: ${unit.name} перезаряжает «${result.weapon.name||result.weapon.id}» (${result.state.loaded} / ${result.state.size}).`);statsChanged=true;
      }else if(kind==='spend_charges'||kind==='damage_item'||kind==='break_item'){
        const unit=tokenById119(command.unitId);if(!unit)throw new Error('Предмет: юнит не найден');const result=mutateItemStateV138(unit,command.slot,kind,command.amount);appendCombatLog105(runtime,`${context.sourceName||'Lua'}: «${result.entry.item.name||result.entry.item.id}» — ${result.state.broken?'сломано':kind==='spend_charges'?`заряды ${result.state.charges} / ${result.state.chargesMax}`:`прочность ${result.state.durability} / ${result.state.durabilityMax}`}.`);statsChanged=true;
      }else if(kind==='standard_attack'){
        await performLuaStandardAttackV138(command,context,state);
      }else if(kind==='add_credits'){
        const unit=tokenById119(command.unitId),amount=Math.trunc(num(command.amount));if(!unit?.playerId)throw new Error('AddCredits: деньги можно выдать только персонажу игрока');if(amount<=0)throw new Error('AddCredits: сумма должна быть положительной');const result=await window.GRPGCombatAPIv138?.grantCredits?.(unit.playerId,amount,{operationId:String(command.operationId||'')||undefined,reason:context.sourceName||'Lua'});if(!result?.ok)throw new Error(result?.message||'Не удалось выдать деньги');
      }else if(kind==='show_area'){
        const caster=tokenById119(command.centerId)||tokenById119(command.casterId)||context.caster||context.attacker,start=centerOf(caster||{x:0,y:0,w:0,h:0}),toward=centerOf(context.target||context.targets?.[0]||caster||{x:start.x+1,y:start.y,w:0,h:0}),length=Math.max(0,num(command.length||command.radius,1)),end=hexEndpointAtRange109(scene,start,toward,length),shape=['circle','cone','measure'].includes(String(command.shape))?String(command.shape):'circle';local.preview={kind:shape,sourceTokenId:String(caster?.id||''),start,end,radius:length*hexStepDistance109(),hexes:length,label:`${context.sourceName||'Lua'}: область ${length} гекс.`};
      }else if(kind==='request_targets')requests.push(command);
      else if(kind==='request_number')numberRequests.push(command);
      else if(kind==='particle'||kind==='sound')state.effects.push(command);
      else if(kind==='log'&&String(command.text||'').trim())appendCombatLog105(runtime,`${context.sourceName||'Lua'}: ${String(command.text).trim()}`);
    }
    if(statsChanged)refreshRuntimeSources122(scene?.id);Combat.syncInitiative?.(scene?.id,false);
    return {state,requests,numberRequests};
  }
  async function processTimedModifiers122(token,phase,state={effects:[]}){
    const rules=window.GRPGCombatRulesV119,runtime=Combat.getRuntime();token.timedModifiersV122=list(token.timedModifiersV122);
    if(phase==='start')for(const modifier of token.timedModifiersV122){if(num(modifier.onTurnStartDamage)>0){const hp=rules?.applyDamage?.(token,modifier.onTurnStartDamage);updatePlayerHp105(token);appendCombatLog105(runtime,`${modifier.name}: периодический урон ${token.name} ${hp.before} → ${hp.after}.`);}if(num(modifier.onTurnStartHeal)>0){const hp=rules?.applyHeal?.(token,modifier.onTurnStartHeal);updatePlayerHp105(token);appendCombatLog105(runtime,`${modifier.name}: периодическое лечение ${token.name} ${hp.before} → ${hp.after}.`);}}
    if(phase==='end'){
      const before=token.timedModifiersV122.length;
      token.timedModifiersV122=token.timedModifiersV122.map(row=>({...row,remainingTurns:Math.max(0,Math.trunc(num(row.remainingTurns,1))-1)})).filter(row=>{if(row.remainingTurns>0)return true;appendCombatLog105(runtime,`Эффект «${row.name||row.id}» на ${token.name} завершён.`);return false;});
      if(token.timedModifiersV122.length!==before)refreshRuntimeSources122(Combat.getSceneIdForView?.());
    }
    Combat.syncInitiative?.(Combat.getSceneIdForView?.(),false);return state;
  }
  function candidateTargets119(request={},context={}){
    const runtime=Combat.getRuntime(),scene=Combat.getScene(),origin=tokenById119(request.originId)||context.caster||context.attacker,originPoint=centerOf(origin||{x:0,y:0,w:0,h:0}),relation=String(request.relation||'any');
    return list(runtime?.tokens).filter(token=>{if(token.id===origin?.id&&request.includeSelf!==true)return false;if(request.alive!==false&&num(token.hpCurrent)<=0)return false;if(token.playerId&&request.players===false)return false;if(token.npcId&&request.npcs===false)return false;if(!token.playerId&&!token.npcId&&request.units!==true)return false;if(hexDistancePoints109(scene,originPoint,centerOf(token))>num(request.radius,999999))return false;const same=String(token.teamId||token.factionId||(token.playerId?'players':token.npcId?'npcs':token.type||'units'))===String(origin?.teamId||origin?.factionId||(origin?.playerId?'players':origin?.npcId?'npcs':origin?.type||'units'));if(relation==='ally'&&!same)return false;if(relation==='enemy'&&same)return false;if(relation==='self'&&token.id!==origin?.id)return false;return true;});
  }
  async function chooseTargets119(request,context={}){
    const rows=candidateTargets119(request,context),minimum=Math.max(0,Math.trunc(num(request.min,1))),maximum=Math.max(1,Math.trunc(num(request.max,1)));
    if(!rows.length){Toast.show('Для навыка нет подходящих целей','info');return null;}
    const body=`<div class="scene-lua-targets-v119">${rows.map(row=>`<label><input type="checkbox" name="target" value="${html(row.id)}"/><span><b>${html(row.name)}</b><small>${row.playerId?'Игрок':'NPC'} · HP ${num(row.hpCurrent)} / ${num(row.hpMax)}</small></span></label>`).join('')}</div><div class="small-note">Можно выбрать от ${minimum} до ${maximum}. Показаны только цели, прошедшие условия области и типа.</div><div class="scene-lua-modal-error-v119" data-lua-modal-error-v119></div>`;
    return combatModal119({title:String(request.title||'Выберите цели'),subtitle:context.sourceName||'',body,confirm:'ВЫБРАТЬ',decline:'ОТМЕНИТЬ НАВЫК',read:form=>Array.from(form.querySelectorAll('input[name="target"]:checked')).map(input=>tokenById119(input.value)).filter(Boolean),validate:value=>value.length<minimum||value.length>maximum?`Выберите от ${minimum} до ${maximum} целей.`:''});
  }
  async function requestLuaNumber119(request={},context={}){
    const min=Number.isFinite(Number(request.min))?Number(request.min):null,max=Number.isFinite(Number(request.max))?Number(request.max):null,initial=Number.isFinite(Number(request.default))?Number(request.default):'';
    const body=`<div class="scene-lua-participants-v119"><b>${html(context.caster?.name||'Юнит')}</b><span>·</span><b>${html(context.sourceName||'Lua')}</b></div><div class="field"><label>${html(request.label||request.name||'Значение')}</label><input class="input" type="number" step="any" name="luaNumber" ${min!==null?`min="${min}"`:''} ${max!==null?`max="${max}"`:''} value="${initial}" ${request.required!==false?'required':''}/></div><div class="small-note">Введите итог физического броска или другое значение, запрошенное скриптом. Приложение ничего не генерирует.</div>`;
    return combatModal119({title:'Ввод значения для навыка',subtitle:request.name||'value',body,confirm:'ПЕРЕДАТЬ В СКРИПТ',decline:'ОТМЕНИТЬ НАВЫК',read:form=>num(form.elements.luaNumber?.value,0)});
  }
  async function runInteractiveLuaHookV138(source,hook,context={},state={damage:num(context.damage),effects:[]}){
    const interactive={...context,inputs:{...(context.inputs||{})},targetRequests:{...(context.targetRequests||{})}};
    for(let pass=0;pass<4;pass++){
      const result=await runLuaSource119(source,hook,{...interactive,damage:state.damage},'execute');
      if(!result.hasHook||!result.eligible)return{cancelled:false,result,context:interactive};
      const targetRequests=list(result.commands).filter(command=>command?.kind==='request_targets'&&!Object.prototype.hasOwnProperty.call(interactive.targetRequests,String(command.key||'')));
      const numberRequests=list(result.commands).filter(command=>command?.kind==='request_number'&&!Object.prototype.hasOwnProperty.call(interactive.inputs,String(command.key||command.name||'')));
      if(!targetRequests.length&&!numberRequests.length){await applyLuaCommands119(result.commands,interactive,state);return{cancelled:false,result,context:interactive};}
      for(const request of targetRequests){const picked=await chooseTargets119(request,{...interactive,sourceName:source.name});if(picked===null)return{cancelled:true,result,context:interactive};interactive.targetRequests[String(request.key||'targets')]=picked.map(row=>String(row.id));}
      for(const request of numberRequests){const value=await requestLuaNumber119(request,{...interactive,sourceName:source.name});if(value===null)return{cancelled:true,result,context:interactive};interactive.inputs[String(request.key||request.name||'value')]=value;}
    }
    throw new Error(`${source.name}: превышен лимит интерактивных проходов Lua`);
  }
  async function runAutomaticHooks119(owner,hook,context={},state={damage:num(context.damage),effects:[]}){
    for(const source of automaticSourcesForHook122(owner,hook,context)){
      try{await runInteractiveLuaHookV138(source,hook,{...context,caster:owner,sourceName:source.name,scriptSource:source,damage:state.damage},state);}catch(error){console.error('SCENE_LUA_AUTOMATIC_V119',error);Toast.show(String(error?.message||error),'err');}
    }
    return state;
  }
  async function chooseReaction119(hook,context={},state={damage:num(context.damage),effects:[]}){
    const candidates=[];
    const sources=list(Combat.getRuntime()?.tokens).filter(token=>num(token.hpCurrent)>0&&!token.reactionUsedV119&&injurySeverity129(token)<4).flatMap(token=>scriptSourcesForToken119(token).filter(row=>row.mode==='reaction'));
    for(const source of sources){try{const result=await runLuaSource119(source,hook,{...context,caster:source.ownerToken,damage:state.damage},'check');if(result.hasHook&&result.eligible)candidates.push(source);}catch(error){console.error('SCENE_LUA_REACTION_CHECK_V119',error);Toast.show(String(error?.message||error),'err');}}
    if(!candidates.length)return state;
    const body=`<div class="scene-lua-participants-v119"><b>${html(context.attacker?.name||'—')}</b><span>→</span><b>${html(context.target?.name||'—')}</b>${num(state.damage)>0?`<strong>Ожидаемый урон: ${num(state.damage)}</strong>`:''}</div><div class="scene-lua-reactions-v119">${candidates.map((source,index)=>`<label><input type="radio" name="reaction" value="${index}" ${index===0?'checked':''}/><span><b>${html(source.reactionLabel||source.name)}</b><small>${html(source.ownerToken?.name||'Юнит')} · ${html(source.name)}</small></span></label>`).join('')}</div>`;
    const choice=await combatModal119({title:'Доступна реакция',subtitle:'ДМ выбирает одну реакцию или отклоняет все',body,confirm:'ИСПОЛЬЗОВАТЬ РЕАКЦИЮ',decline:'ОТКЛОНИТЬ',read:form=>candidates[Math.max(0,Math.trunc(num(form.elements.reaction?.value,0)))]||null});
    if(!choice)return state;
    try{const executed=await runInteractiveLuaHookV138(choice,hook,{...context,caster:choice.ownerToken,sourceName:choice.name,scriptSource:choice,damage:state.damage},state);if(executed.cancelled){choice.ownerToken.reactionUsedV119=false;return state;}choice.ownerToken.reactionUsedV119=true;appendCombatLog105(Combat.getRuntime(),`${choice.ownerToken.name} использует реакцию «${choice.reactionLabel||choice.name}» (${hook}).`);}catch(error){choice.ownerToken.reactionUsedV119=false;Toast.show(String(error?.message||error),'err');}
    return state;
  }
  async function performLuaStandardAttackV138(command={},parentContext={},parentState={}){
    const depth=Math.max(0,Math.trunc(num(parentState.standardAttackDepthV138,0)));if(depth>=4)throw new Error('StandardAttack: превышена глубина вложенных атак');
    const scene=Combat.getScene(),runtime=Combat.getRuntime(),rules=window.GRPGCombatRulesV119,attacker=tokenById119(command.attackerId),target=tokenById119(command.targetId);if(!scene||!runtime||!rules||!attacker||!target)throw new Error('StandardAttack: атакующий или цель не найдены');
    const selected=weaponForSlotV138(attacker,command.slot||command.weaponId),weapon=selected?.item;if(!weapon)throw new Error('StandardAttack: оружие не найдено');if(itemBrokenV138(attacker,weapon,selected.slot))throw new Error(`StandardAttack: «${weapon.name||weapon.id}» сломано`);
    const distance=hexDistancePoints109(scene,centerOf(attacker),centerOf(target)),range=Math.max(0,num(weapon.range??weapon.attackRange,1)),cover=coverBetween120(scene,centerOf(attacker),centerOf(target));if(distance>Math.floor(range+1e-6))throw new Error(`StandardAttack: цель вне дальности (${hexLabel109(distance)} / ${hexLabel109(range)})`);if(cover.blocksAttack||sightSegmentBlocked105(scene,centerOf(attacker),centerOf(target),[attacker.id,target.id]))throw new Error('StandardAttack: линия огня перекрыта');
    const magazine=magazineState118(attacker,weapon),shotCost=ammoPerShot118(weapon);if(magazine.size>0&&magazine.loaded<shotCost)throw new Error(`StandardAttack: магазин пуст (${magazine.loaded} / ${magazine.size})`);
    const entity=entityForToken(attacker)||{},attack=window.GRPGStatsV113?.weaponAttack?.(entity,weapon,{kind:attacker.npcId?'npc':'player',inCombat:true,temporaryModifiers:timedStatModifiers122(attacker)})||{},damageBonus=num(attack.damageBonus),baseHit=num(attack.bonus??weapon.hitBonus)-injuryCheckPenalty129(attacker),defense=incomingDefense119(target,weapon.weaponCategory||'light',cover);defense.defenseBonus-=injuryCheckPenalty129(target);
    const baseContext={attacker,target,caster:attacker,targets:[target],weapon,damageType:String(weapon.weaponCategory||'light'),sourceName:`StandardAttack: ${weapon.name||weapon.id}`},declared={damage:0,attackBonus:baseHit,defenseBonus:defense.defenseBonus,effects:[],standardAttackDepthV138:depth+1};await runAutomaticHooks119(attacker,'OnAttackDeclared',baseContext,declared);await chooseReaction119('OnAttackDeclared',baseContext,declared);
    const currentMagazine=magazineState118(attacker,weapon);if(currentMagazine.size>0&&currentMagazine.loaded<shotCost)throw new Error('StandardAttack: после объявления оружие не заряжено');
    const entered=await requestAttackRolls119({attacker,target,weapon,attackBonus:declared.attackBonus,defenseBonus:declared.defenseBonus,damageBonus,attackDisadvantage:(cover.concealment&&!ignoresConcealment122(attacker))||injuryDisadvantage129(attacker),defenseDisadvantage:injuryDisadvantage129(target)});if(!entered)throw new Error('StandardAttack: атака отменена');
    if(currentMagazine.size>0){currentMagazine.loaded-=shotCost;writeMagazineState118(attacker,weapon,currentMagazine);}
    const attackContext={...baseContext,attackRoll:entered.attackRoll,defenseRoll:entered.defenseRoll},before={damage:0,attackBonus:declared.attackBonus,defenseBonus:declared.defenseBonus,effects:declared.effects,standardAttackDepthV138:depth+1};await runAutomaticHooks119(attacker,'BeforeAttackStart',attackContext,before);await chooseReaction119('BeforeAttackStart',attackContext,before);
    const result=rules.resolveManualAttack({attackRoll:entered.attackRoll,defenseRoll:entered.defenseRoll,attackBonus:before.attackBonus,defenseBonus:before.defenseBonus,damageRoll:entered.damageRoll,damageBonus,damageReduction:0});let applied=0,absorbed=0,hp={before:num(target.hpCurrent),after:num(target.hpCurrent),applied:0},effects={damage:result.hit?result.damageApplied:0,damagePartsV138:result.hit?[{amount:result.damageApplied,absorptionSource:'all'}]:[],effects:before.effects,standardAttackDepthV138:depth+1};
    if(result.hit){await runAutomaticHooks119(attacker,'OnHit',{...attackContext,hit:true,critical:result.critical,damage:effects.damage},effects);await chooseReaction119('OnHit',{...attackContext,hit:true,critical:result.critical,damage:effects.damage},effects);await runAutomaticHooks119(target,'BeforeDamage',{...attackContext,hit:true,critical:result.critical,damage:effects.damage},effects);await chooseReaction119('BeforeDamage',{...attackContext,hit:true,critical:result.critical,damage:effects.damage},effects);const reduced=applyAbsorptionV138(effects,incomingDefense119(target,weapon.weaponCategory||'light',cover));absorbed=reduced.absorbed;applied=result.defenseCritical?Math.floor(reduced.applied/2):reduced.applied;hp=rules.applyDamage(target,applied);updatePlayerHp105(target);await runAutomaticHooks119(target,'OnTakeDamage',{...attackContext,hit:true,damage:applied},effects);await chooseReaction119('OnTakeDamage',{...attackContext,hit:true,damage:applied},effects);await applyInjuryAfterDamage129(target,hp.applied,weapon.name||'StandardAttack');}
    if(command.consumeAction!==false)attacker.actionUsed=true;appendCombatLog105(runtime,`${attacker.name} выполняет стандартную атаку «${weapon.name||weapon.id}» по ${target.name}: ${result.hit?`${applied} урона${absorbed?` (поглощено ${absorbed})`:''}, HP ${hp.before} → ${hp.after}`:'промах'}.`);parentState.effects=[...list(parentState.effects),...list(effects.effects)];updatePlayerHp105(target);return{hit:result.hit,damage:applied,target};
  }
  async function chooseDeviceItem129(rows,title){if(!rows.length)return null;if(rows.length===1)return rows[0];const body=`<div class="scene-lua-reactions-v119">${rows.map((item,index)=>`<label><input type="radio" name="deviceItem" value="${html(item.id)}" ${index===0?'checked':''}/><span><b>${html(item.name||item.id)}</b><small>В инвентаре: ${Math.max(1,num(item.ownedQty,1))}</small></span></label>`).join('')}</div>`;const id=await combatModal119({title,subtitle:'Выберите тип устройства',body,confirm:'ВЫБРАТЬ',decline:'ОТМЕНИТЬ',read:form=>String(form.elements.deviceItem?.value||'')});return rows.find(row=>String(row.id)===id)||null;}
  async function beginDeployDevice129(type){const operator=selectedToken104(),runtime=Combat.getRuntime();if(!operator||!runtime||!Combat.canActWithToken?.(operator)||operator.actionUsed||operator.burstStateV122){Toast.show('Размещение сейчас недоступно','info');return;}const rows=deviceInventory129(operator,type);if(!rows.length){Toast.show(type==='drone'?'В инвентаре нет дрона':'В инвентаре нет турели','info');return;}if(type==='drone'&&linkedDrones129(operator,runtime).length>=operatorIntelligence129(operator)){Toast.show('Предел связанных дронов равен Интеллекту оператора','info');return;}const item=await chooseDeviceItem129(rows,type==='drone'?'Выпустить дрона':'Разместить турель');if(!item)return;local.ui.pendingPlacement={kind:'deploy-device-v129',entityId:item.id,deviceType:type,operatorTokenId:operator.id};Toast.show('Выберите соседний гекс для размещения устройства','info');}
  function consumeInventoryItem129(token,itemId,qty=1){const owner=tokenInventoryOwner120(token),entry=list(owner.rows).find(row=>String(row?.itemId)===String(itemId)),take=Math.max(1,Math.trunc(num(qty,1)));if(!entry||num(entry.qty)<take)return false;entry.qty=Math.max(0,Math.trunc(num(entry.qty))-take);if(Array.isArray(entry.positions))entry.positions=entry.positions.slice(0,entry.qty);if(entry.qty<=0)owner.set(owner.rows.filter(row=>row!==entry));return true;}
  async function deployDeviceAt129(pending,point){const scene=Combat.getScene(),runtime=Combat.getRuntime(),operator=list(runtime?.tokens).find(row=>String(row.id)===String(pending?.operatorTokenId));if(!scene||!runtime||!operator)return;if(!Combat.canActWithToken?.(operator)||operator.actionUsed){Toast.show('Ход оператора уже завершён','info');local.ui.pendingPlacement=null;return;}if(hexDistancePoints109(scene,centerOf(operator),nearestHexCenter107(scene,point))>1){Toast.show('Устройство размещается в соседнем гексе','info');return;}const item=deviceInventory129(operator,pending.deviceType).find(row=>String(row.id)===String(pending.entityId));if(!item){Toast.show('Предмет уже отсутствует в инвентаре','err');local.ui.pendingPlacement=null;return;}if(pending.deviceType==='drone'&&linkedDrones129(operator,runtime).length>=operatorIntelligence129(operator)){Toast.show('Достигнут предел связанных дронов','info');local.ui.pendingPlacement=null;return;}const token=createEquipmentUnit105(item.id);if(!token||!consumeInventoryItem129(operator,item.id,1)){Toast.show('Не удалось развернуть устройство','err');return;}token.operatorTokenIdV129=operator.id;token.deployedItemIdV129=item.id;token.sharesVisionWithPlayers=Boolean(operator.playerId);fitTokenToHex107(token,scene,nearestHexCenter107(scene,point));runtime.tokens.push(token);operator.actionUsed=true;local.ui.pendingPlacement=null;Combat.selectedObject={kind:'token',id:token.id};Combat.syncInitiative(scene.id,false);appendCombatLog105(runtime,`${operator.name} ${pending.deviceType==='drone'?'выпускает дрона':'размещает турель'} «${item.name}», расходуя действие.`);Combat.render();await checkpointCombat120('Сцена: размещение устройства',true);}
  async function commandDrone129(){const operator=selectedToken104(),runtime=Combat.getRuntime();if(!operator||!runtime||!Combat.canActWithToken?.(operator)){Toast.show('Команду отдаёт действующий оператор','info');return;}const drones=linkedDrones129(operator,runtime);if(!drones.length){Toast.show('У оператора нет выпущенных дронов','info');return;}const body=`<div class="scene-lua-reactions-v119">${drones.map((drone,index)=>{const link=droneLinkState129(drone,operator);return `<label><input type="radio" name="droneId" value="${html(drone.id)}" ${index===0?'checked':''}/><span><b>${html(drone.name)}</b><small>${html(link.ok?`Связь ${hexLabel109(link.distance)} / 30 гекс.`:`Нет связи: ${link.reason} · доступен безопасный возврат`)}</small></span></label>`;}).join('')}</div>`;const id=await combatModal119({title:'Команда дрону',subtitle:'Один дрон может переместиться и применить один модуль',body,confirm:'ОТДАТЬ КОМАНДУ',decline:'ОТМЕНИТЬ',read:form=>String(form.elements.droneId?.value||'')});const drone=drones.find(row=>String(row.id)===id);if(!drone)return;const link=droneLinkState129(drone,operator),free=link.ok&&hasFreeDroneControl129(operator)&&!operator.freeDroneCommandUsedV129;if(link.ok&&!free&&operator.actionUsed){Toast.show('Действие оператора уже потрачено','info');return;}if(link.ok){if(free)operator.freeDroneCommandUsedV129=true;else operator.actionUsed=true;}drone.droneCommandV129={operatorTokenId:operator.id,round:Math.max(1,Math.trunc(num(runtime.round,1))),returnOnly:!link.ok,moduleUsed:false,completed:false};drone.movedThisTurn=0;drone.actionUsed=false;Combat.selectedObject={kind:'token',id:drone.id};local.ui.action='move';appendCombatLog105(runtime,link.ok?`${operator.name} отдаёт команду дрону «${drone.name}»${free?' через имплант без расхода действия':', расходуя действие'}.`:`Дрон «${drone.name}» теряет связь и переходит в безопасный режим возврата к оператору.`);Combat.render();await checkpointCombat120('Сцена: команда дрону',false);}
  async function useActiveEquipment129(itemId){const runtime=Combat.getRuntime(),token=selectedToken104(),source=activeEquipmentForToken129(token).find(row=>String(row.id)===String(itemId));if(!runtime||!token||!source)return;if(!canCombatAct129(token)||token.actionUsed){Toast.show('Активное использование сейчас недоступно','info');return;}if(token.burstStateV122){Toast.show('Сначала завершите скорострельную очередь','info');return;}if(local.lua119.busy)return;local.lua119.busy=true;try{const item=source.raw||equipmentItem105(source.id)||{},state={damage:0,effects:[]},context={caster:token,attacker:token,target:null,targets:[],ability:item,sourceName:source.name,scriptSource:source,inputs:{},targetRequests:{}};const phase=await runInteractiveLuaHookV138(source,'OnAbilityPhaseStart',context,state);if(phase.cancelled)return;Object.assign(context,{inputs:phase.context.inputs,targetRequests:phase.context.targetRequests});refreshPreviewDom104();const requestedIds=unique(Object.values(context.targetRequests||{}).flat()),targets=requestedIds.map(tokenById119).filter(Boolean);context.targets=targets;context.target=targets[0]||null;if(context.target)context.position=centerOf(context.target);const executed=await runInteractiveLuaHookV138(source,'OnAbilityExecuted',context,state);if(executed.cancelled)return;if(!phase.result.hasHook&&!executed.result.hasHook)throw new Error('В скрипте нет OnAbilityPhaseStart или OnAbilityExecuted');if(isDroneToken129(token))completeDroneModule129(token);else token.actionUsed=true;appendCombatLog105(runtime,`${token.name} использует «${item.activeUseLabel||source.name}»${targets.length?` по целям: ${targets.map(row=>row.name).join(', ')}`:''}.`);Combat.render();flushLuaEffects119(state);await checkpointCombat120('Сцена: активное снаряжение',true);}catch(error){console.error('SCENE_ACTIVE_EQUIPMENT_V129',error);Toast.show(String(error?.message||error),'err');}finally{local.lua119.busy=false;}}
  async function reloadWeapon118(){
    const initial=reloadAvailability120(),scene=Combat.getScene();
    if(!initial.enabled){Toast.show(initial.reason||'Перезарядка недоступна','info');return;}
    if(!Combat.canActWithToken?.(initial.token)){Toast.show('Сейчас не ход этого юнита','info');return;}
    const transaction=beginCombatTransaction120('reload',scene?.id,initial.token.id);if(!transaction)return;
    try{
      let {runtime,attacker:token}=combatTransactionRefs120(transaction),weapon=weaponForToken105(token),magazine=magazineState118(token,weapon);
      let choices=compatibleAmmo120(token,weapon,{availableOnly:true,loadedTypeId:magazine.loaded>0?magazine.ammoTypeId:''});
      if(!choices.length)throw new Error('В инвентаре нет совместимых патронов');
      let ammo=choices.find(row=>String(row.id)===String(magazine.ammoTypeId||weapon.ammoTypeId||''))||choices[0];
      if(choices.length>1&&magazine.loaded===0){
        const body=`<div class="scene-lua-reactions-v119">${choices.map(row=>`<label><input type="radio" name="reloadAmmo" value="${html(row.id)}" ${String(row.id)===String(ammo.id)?'checked':''}/><span><b>${html(row.name||row.id)}</b><small>${html(ammoFamily120(row)||'без калибра')} · в инвентаре ${row.ownedQty}</small></span></label>`).join('')}</div>`;
        const selectedId=await combatModal119({title:'Перезарядка',subtitle:`Выберите боеприпасы для «${weapon.name||'оружия'}»`,body,confirm:'ЗАРЯДИТЬ',decline:'ОТМЕНИТЬ',read:form=>String(form.elements.reloadAmmo?.value||'')});
        if(!selectedId)return;
        ({runtime,attacker:token}=combatTransactionRefs120(transaction));weapon=weaponForToken105(token);magazine=magazineState118(token,weapon);choices=compatibleAmmo120(token,weapon,{availableOnly:true,loadedTypeId:magazine.loaded>0?magazine.ammoTypeId:''});ammo=choices.find(row=>String(row.id)===selectedId);if(!ammo)throw new Error('Выбранные патроны уже отсутствуют в инвентаре');
      }
      const loaded=consumeAmmoInventory118(token,ammo.id,magazine.size-magazine.loaded);if(!loaded)throw new Error('Не удалось списать патроны из инвентаря');
      magazine.loaded+=loaded;magazine.ammoTypeId=ammo.id;writeMagazineState118(token,weapon,magazine);token.actionUsed=true;
      appendCombatLog105(runtime,`${token.name} перезаряжает «${weapon.name}» патронами «${ammo.name||ammo.id}»: ${magazine.loaded} / ${magazine.size}. Из запаса израсходовано ${loaded}.`);
      Combat.render();Toast.show('Оружие перезаряжено','ok');await checkpointCombat120('Сцена: перезарядка оружия',true);
    }catch(error){console.error('SCENE_RELOAD_V120_FAILED',error);Toast.show(String(error?.message||error),'err');}
    finally{finishCombatTransaction120(transaction);}
  }
  async function disengage122(){const token=selectedToken104();if(!token||!Combat.canActWithToken?.(token)||token.actionUsed||token.burstStateV122)return;token.actionUsed=true;token.disengagedV122=true;appendCombatLog105(Combat.getRuntime(),`${token.name} выполняет Отход: перемещение этого хода не вызывает атаку по возможности.`);Combat.render();await checkpointCombat120('Сцена: Отход',false);}
  async function finishBurst122(){const token=selectedToken104();if(!token?.burstStateV122)return;token.burstStateV122=null;token.actionUsed=true;completeDroneModule129(token);appendCombatLog105(Combat.getRuntime(),`${token.name} завершает скорострельную очередь.`);Combat.render();await checkpointCombat120('Сцена: завершение очереди',false);}
  async function clearMalfunction122(){const token=selectedToken104(),weapon=weaponForToken105(token);if(!token||!weapon||!weaponMalfunction122(token,weapon)||token.actionUsed||!Combat.canActWithToken?.(token))return;token.weaponMalfunctionsV122={...(token.weaponMalfunctionsV122||{})};delete token.weaponMalfunctionsV122[weapon.id];token.actionUsed=true;appendCombatLog105(Combat.getRuntime(),`${token.name} тратит действие и устраняет отказ «${weapon.name}».`);Combat.render();await checkpointCombat120('Сцена: устранение отказа',false);}
  async function useActiveSkill118(skillId){
    const runtime=Combat.getRuntime(),token=selectedToken104(),skill=activeSkillsForToken118(token).find(row=>String(row.id)===String(skillId));
    if(!runtime||!token||!skill)return;
    if(!Combat.canActWithToken?.(token)){Toast.show('Сейчас не ход этого юнита','info');return;}
    if(token.actionUsed){Toast.show('Действие этого юнита уже потрачено','info');return;}
    if(token.burstStateV122){Toast.show('Сначала завершите скорострельную очередь','info');return;}
    if(local.lua119.busy)return;local.lua119.busy=true;
    try{
      const source=scriptSourcesForToken119(token).find(row=>row.kind==='skill'&&row.id===String(skill.id));
      if(source){
        const state={damage:0,effects:[]},meta=await resolvedAbilityMetadata125(source,skill,token),selection=await resolveAbilityTargets125(meta,token,skill);if(selection===null)return;
        const context={caster:token,attacker:token,target:selection.target,targets:selection.targets,position:selection.position,toggled:selection.toggled,ability:skill,sourceName:source.name,scriptSource:source,inputs:{},targetRequests:{}};
        const phase=await runInteractiveLuaHookV138(source,'OnAbilityPhaseStart',context,state);if(phase.cancelled)return;Object.assign(context,{inputs:phase.context.inputs,targetRequests:phase.context.targetRequests});
        refreshPreviewDom104();
        let targets=unique([...list(selection.targets).map(row=>row.id),...Object.values(context.targetRequests||{}).flat()]).map(tokenById119).filter(Boolean);
        context.targets=targets;context.target=targets[0]||null;if(!context.position&&context.target)context.position=centerOf(context.target);
        if(['aura','persistent_area','toggle_aura'].includes(meta.behavior)){
          const result=toggleOrCreateBehaviorThinker125(meta,source,context);context.toggled=result.toggled;context.thinker=result.thinker?thinkerContext125(result.thinker).thinker:null;
        }
        const executed=await runInteractiveLuaHookV138(source,'OnAbilityExecuted',context,state);if(executed.cancelled)return;
        if(!phase.result.hasHook&&!executed.result.hasHook)Toast.show('В скрипте нет OnAbilityPhaseStart или OnAbilityExecuted','info');
        token.actionUsed=true;
        appendCombatLog105(runtime,`${token.name} применяет активный навык «${skill.name||skill.id}»${context.toggled===false?' и отключает его':targets.length?` по целям: ${targets.map(row=>row.name).join(', ')}`:''}.`);
        Combat.render();flushLuaEffects119(state);await checkpointCombat120('Сцена: Lua-навык',true);
        return;
      }
      token.actionUsed=true;
      const description=String(skill.description||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      appendCombatLog105(runtime,`${token.name} применяет активный навык «${skill.name||skill.id}»${description?`: ${description}`:'.'} Механический результат определяется описанием навыка и применяется ДМом.`);
      Combat.render();Toast.show(`Применён навык: ${skill.name||skill.id}`,'ok');await checkpointCombat120('Сцена: активный навык',false);
    }catch(error){console.error('SCENE_LUA_SKILL_V119',error);Toast.show(String(error?.message||error),'err');}
    finally{local.lua119.busy=false;}
  }
  function lootRows118(value){
    if(window.GRPGFeaturePackV118?.normalizeLootTable)return window.GRPGFeaturePackV118.normalizeLootTable(value);
    return list(value).map(row=>({itemId:String(row?.itemId||''),chance:clamp104(row?.chance,0,100),minQty:Math.max(1,Math.trunc(num(row?.minQty,1))),maxQty:Math.max(1,Math.trunc(num(row?.maxQty,row?.minQty||1)))})).filter(row=>row.itemId);
  }
  const lootBusyV137=new Set();
  const lootSourceQueueV137=window.GRPGPlayerSyncCoreV135.createQueue();
  function scenePlayersV137(sceneId){
    return unique(list(Combat.getRuntime(sceneId)?.tokens).map(token=>token.playerId)).map(id=>App.state.users[id])
      .filter(user=>user&&String(user.role||'player').toLowerCase()==='player')
      .sort((a,b)=>String(a.displayName||a.name||a.id).localeCompare(String(b.displayName||b.name||b.id),'ru'));
  }
  function pendingLootV137(token){return Object.keys(token?.lootStateV118?.pendingTransfersV137||{}).length>0;}
  function transferLootV137(sceneId,tokenId,itemId,playerId){
    return lootSourceQueueV137.run(JSON.stringify([sceneId,tokenId]),()=>performLootTransferV137(sceneId,tokenId,itemId,playerId));
  }
  async function performLootTransferV137(sceneId,tokenId,itemId,playerId){
    if(!Combat.isDm())return{ok:false,status:'forbidden'};
    const key=JSON.stringify([sceneId,tokenId,itemId]);
    if(lootBusyV137.has(key))return{ok:false,status:'busy'};
    const getToken=()=>list(Combat.getRuntime(sceneId)?.tokens).find(token=>token.id===tokenId);
    let token=getToken(),state=token?.lootStateV118;
    if(!token?.npcId||!state?.searched)return{ok:false,status:'missing'};
    const pending=state.pendingTransfersV137||{},prior=pending[itemId];
    if(prior&&prior.playerId!==playerId)return{ok:false,status:'pending'};
    if(!prior&&!scenePlayersV137(sceneId).some(user=>user.id===playerId))return{ok:false,status:'missing-player'};
    const qty=list(state.items).filter(row=>row.itemId===itemId).reduce((sum,row)=>sum+row.qty,0);
    if(!qty||(!prior&&!EQUIPMENT[itemId]))return{ok:false,status:'missing-item'};
    const remote=PlayerSync.shouldIsolateUsersFromSnapshot();
    if(prior&&(prior.remote!==remote||(prior.remote&&prior.campaignId!==String(Sync.config?.campaignId||'')))){Toast.show('Для завершения передачи восстановите прежний режим синхронизации.','err');return{ok:false,status:'pending'};}
    const job=prior||{operationId:window.GRPGPlayerSyncCoreV135.operationId(),playerId,itemId,qty,source:JSON.stringify([sceneId,tokenId]),remote,campaignId:String(Sync.config?.campaignId||'')};
    lootBusyV137.add(key);
    try{
      // Persist intent BEFORE granting. Retrying after an unknown response reuses this ID.
      if(!prior){
        const check=window.GRPGInventoryV113.canAdd(App.state.users[playerId],itemId,qty);
        if(!check.ok){Toast.show(check.reason,'info');return{ok:false,status:'capacity'};}
        state.pendingTransfersV137={...pending,[itemId]:clone(job)};
      }
      const saved=await saveStoreNow();
      if(!saved?.ok){Toast.show('Не удалось сохранить передачу. Добыча оставлена на месте.','err');return{ok:false,status:'local-save-failed'};}
      const result=await PlayerSync._queueV135.run(playerId,async()=>{
        let response;
        if(job.remote){
          const request={playerId,operationId:job.operationId,lootTransferV137:{itemId,qty:job.qty,source:job.source,campaignId:job.campaignId},updatedBy:activeSyncActorLabel()};
          for(let attempt=0;attempt<3;attempt++){
            try{response=await window.electronAPI.patchPlayer(request);}catch(error){response={ok:false,status:'error',message:error.message};}
            if(response?.ok&&(!['committed','replayed'].includes(response.status)||String(response.row?.playerId||response.row?.player_id||'')!==playerId))response={ok:false,status:'error',message:'Сервер не подтвердил выдачу. Проверьте подключение и повторите передачу.'};
            if(response?.ok||response?.status!=='error')break;
          }
          if(response?.ok&&response.row)PlayerSync.applyRemoteRow(response.row);
          else if(response?.remote)PlayerSync.applyRemoteRow(response.remote);
        }else{
          const user=App.state.users[playerId];
          if(!user)return{ok:false,status:'rejected',message:'Игрок удалён.'};
          if(!user.__lootReceiptsV137?.[job.operationId]){
            const check=window.GRPGInventoryV113.canAdd(user,itemId,job.qty);
            if(!check.ok)return{ok:false,status:'capacity',message:check.reason};
            const next=clone(user);let row=list(next.inventory).find(entry=>entry.itemId===itemId);
            if(row)row.qty+=job.qty;else(next.inventory||=[]).push({itemId,qty:job.qty,positions:[]});
            next.__lootReceiptsV137={...next.__lootReceiptsV137,[job.operationId]:true};
            App.state.users[playerId]=normalizePlayerProfileV2(next);PLAYER_TEMPLATES[playerId]=clone(App.state.users[playerId]);
          }
          response={ok:true,status:'local'};
        }
        if(response?.ok){
          const mirrored=await App.writeLocalMirrors();
          if(mirrored?.ok===false)throw new Error('Не удалось сохранить профиль игрока.');
        }
        return response||{ok:false,status:'error'};
      });
      token=getToken();state=token?.lootStateV118;
      if(!state)throw new Error('Сцена изменилась; повторите обыск для проверки передачи.');
      if(!result.ok){
        if(['capacity','rejected','unsupported','conflict'].includes(result.status)){
          delete state.pendingTransfersV137[itemId];await saveStoreNow();
        }
        Toast.show(result.message||'Ответ не получен. Повторите передачу тому же игроку: предмет не будет выдан дважды.','err');
        return result;
      }
      const before=clone(state);
      let remaining=job.qty;
      state.items=list(state.items).map(row=>{if(row.itemId!==itemId)return row;const taken=Math.min(row.qty,remaining);remaining-=taken;return{...row,qty:row.qty-taken};}).filter(row=>row.qty>0);
      delete state.pendingTransfersV137[itemId];
      const completed=await saveStoreNow();
      if(!completed?.ok){token.lootStateV118=before;throw new Error('Передача подтверждена, но сцена не сохранена. Повторите передачу для завершения.');}
      appendCombatLog105(Combat.getRuntime(sceneId),`${App.state.users[playerId]?.displayName||playerId} получает ${equipmentItem105(itemId)?.name||itemId} ×${job.qty} при обыске ${token.name}.`);
      queueStoreSave();broadcastScene104();
      if(Combat.getSceneIdForView()===sceneId)showLootOverlay118(token);
      Toast.show('Добыча передана в инвентарь.','ok');return result;
    }catch(error){Toast.show(String(error?.message||error),'err');return{ok:false,status:'error'};}
    finally{lootBusyV137.delete(key);}
  }
  function lootContextMenuV137(event,row){
    event.preventDefault();event.stopImmediatePropagation();
    if(!Combat.isDm())return;
    document.querySelector('.scene-loot-menu-v137')?.remove();
    const {lootSceneV137:sceneId,lootTokenV137:tokenId,lootItemV137:itemId}=row.dataset;
    const token=list(Combat.getRuntime(sceneId)?.tokens).find(t=>t.id===tokenId),job=token?.lootStateV118?.pendingTransfersV137?.[itemId];
    const qty=list(token?.lootStateV118?.items).filter(r=>r.itemId===itemId).reduce((sum,r)=>sum+r.qty,0);
    const players=job?[App.state.users[job.playerId]].filter(Boolean):scenePlayersV137(sceneId);
    const menu=document.createElement('div');menu.className='scene-context-v104 scene-loot-menu-v137';
    menu.innerHTML=`<b>${job?'Завершить передачу':'Передать игроку'} · ×${qty}</b>`;
    for(const player of players){
      const check=job?{ok:true}:window.GRPGInventoryV113.canAdd(player,itemId,qty),button=document.createElement('button');button.type='button';
      button.textContent=(player.displayName||player.name||player.id)+(check.ok?'':` — ${check.reason}`);button.disabled=!check.ok;button.title=check.reason||'Передать всю найденную пачку';
      button.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();menu.remove();void transferLootV137(sceneId,tokenId,itemId,player.id);});menu.appendChild(button);
    }
    if(!players.length){const empty=document.createElement('span');empty.textContent='На сцене нет игроков.';menu.appendChild(empty);}
    (document.getElementById('mod-combat')||document.body).appendChild(menu);
    menu.style.left=Math.max(8,Math.min(event.clientX,window.innerWidth-menu.offsetWidth-8))+'px';
    menu.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-menu.offsetHeight-8))+'px';
    setTimeout(()=>document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))menu.remove();},{once:true,capture:true}),0);
  }

  function closeLootOverlay118(){document.querySelector('.scene-loot-menu-v137')?.remove();document.querySelector('.scene-loot-overlay-v118')?.remove();}
  function showLootOverlay118(token){
    closeLootOverlay118();const host=document.getElementById('mod-combat')||document.body,state=token?.lootStateV118||{items:[]};
    const grouped=new Map();for(const row of list(state.items))grouped.set(row.itemId,(grouped.get(row.itemId)||0)+row.qty);
    const rows=Array.from(grouped,([itemId,qty])=>({itemId,qty})).map(row=>{const item=equipmentItem105(row.itemId);return `<div class="scene-loot-result-row-v118" tabindex="0" role="button" title="Правая кнопка — передать игроку" data-loot-scene-v137="${html(Combat.getSceneIdForView())}" data-loot-token-v137="${html(token.id)}" data-loot-item-v137="${html(row.itemId)}">${item?.image?`<img src="${html(item.image)}" alt=""/>`:'<span>▣</span>'}<b>${html(item?.name||row.itemId)}</b><strong>×${Math.max(1,Math.trunc(num(row.qty,1)))}</strong></div>`;}).join('');
    const overlay=document.createElement('div');overlay.className='scene-loot-overlay-v118';
    overlay.innerHTML=`<div class="scene-loot-window-v118"><div class="scene-loot-scan-v118"><i></i><span>ОБЫСК...</span></div><div class="scene-loot-results-v118"><div><span class="tiny-label">РЕЗУЛЬТАТ ОБЫСКА</span><h3>${html(token?.name||'NPC')}</h3></div><div class="small-note">Правая кнопка на предмете — передать игроку на сцене.</div>${rows||'<div class="scene-loot-empty-v118">Ничего не найдено.</div>'}<button class="primary" type="button" data-scene-loot-close-v118>ЗАКРЫТЬ</button></div></div>`;
    host.appendChild(overlay);requestAnimationFrame(()=>overlay.classList.add('running'));setTimeout(()=>overlay.classList.add('complete'),780);
  }
  function searchNpc118(tokenId){
    const runtime=Combat.getRuntime(),token=list(runtime?.tokens).find(row=>String(row.id)===String(tokenId));if(!runtime||!token?.npcId)return;
    if(num(token.hpCurrent,0)>0){Toast.show('Обыск доступен только для NPC с 0 HP','info');return;}
    if(!token.lootStateV118?.searched){
      const npc=entityForToken(token)||{},items=[];
      for(const row of lootRows118(npc.lootTable)){
        if(Math.random()*100>=num(row.chance,0))continue;
        const min=Math.max(1,Math.trunc(num(row.minQty,1))),max=Math.max(min,Math.trunc(num(row.maxQty,min)));
        items.push({itemId:row.itemId,qty:min+Math.floor(Math.random()*(max-min+1))});
      }
      token.lootStateV118={searched:true,searchedAt:new Date().toISOString(),items};
      appendCombatLog105(runtime,`${token.name} обыскан. Найдено: ${items.length?items.map(row=>`${equipmentItem105(row.itemId)?.name||row.itemId} ×${row.qty}`).join(', '):'ничего'}.`);
      queueStoreSave();broadcastScene104();Combat.render();
    }
    showLootOverlay118(token);
  }
  async function commitAttack105(targetId) {
    const scene = Combat.getScene(), runtime = Combat.getRuntime(), selectedAttacker = selectedToken104();
    const selectedTarget = list(runtime?.tokens).find(t => String(t.id) === String(targetId));
    if (!scene || !runtime || !selectedAttacker || !selectedTarget || selectedAttacker.id === selectedTarget.id) return;
    if (!canCombatAct129(selectedAttacker)) { Toast.show('Сейчас не ход этого юнита или дрон не получил команду', 'info'); return; }
    if (selectedAttacker.actionUsed) { Toast.show('Действие этого юнита уже потрачено', 'info'); return; }
    const selectedWeapon = weaponForToken105(selectedAttacker);
    if (!selectedWeapon) { Toast.show('У юнита не выбрано оружие', 'info'); return; }
    if(injurySeverity129(selectedAttacker)>=3&&isHeavyWeapon129(selectedWeapon)){Toast.show('Тяжёлая или более высокая травма не позволяет использовать тяжёлое оружие','info');return;}
    if(weaponMalfunction122(selectedAttacker,selectedWeapon)){Toast.show('Оружие отказало. Сначала устраните отказ отдельным действием.','info');return;}
    const activeBurst=selectedAttacker.burstStateV122,shotIndex=activeBurst&&String(activeBurst.weaponId)===String(selectedWeapon.id)?activeBurst.nextShot:1,maxShots=activeBurst?.maxShots||rapidFireShots122(selectedWeapon),burstPenalty=-(shotIndex-1);
    const from = centerOf(selectedAttacker), to = centerOf(selectedTarget), max = tokenAttackCells(selectedAttacker, scene), distance = hexDistancePoints109(scene, from, to);
    local.preview = makeRoutePreview104(to, true); refreshPreviewDom104();
    if (distance > Math.floor(max + 1e-6)) { Toast.show(`Цель вне дальности: ${hexLabel109(distance)} / ${hexLabel109(max)}`, 'info'); return; }
    const initialCover=coverBetween120(scene,from,to);
    if(initialCover.blocksAttack||sightSegmentBlocked105(scene, from, to, [selectedAttacker.id, selectedTarget.id])) { Toast.show('Прямая атака невозможна: между юнитами полное укрытие', 'info'); return; }
    const rules=window.GRPGCombatRulesV119;
    if(!rules){Toast.show('Модуль ручного расчёта боя не загружен','err');return;}
    // Validate ammunition before opening a transaction. An early return after
    // beginCombatTransaction120 used to leave the whole combat UI permanently busy.
    const initialMagazine=magazineState118(selectedAttacker,selectedWeapon),shotCost=ammoPerShot118(selectedWeapon);
    if(initialMagazine.size>0&&initialMagazine.loaded<shotCost){Toast.show(`Магазин пуст: ${initialMagazine.loaded} / ${initialMagazine.size}. Требуется перезарядка.`,'info');return;}
    const transaction=beginCombatTransaction120('attack',scene.id,selectedAttacker.id,[selectedTarget.id]);if(!transaction)return;
    try{
      let {attacker,target}=combatTransactionRefs120(transaction),weapon=weaponForToken105(attacker);
      let magazine=magazineState118(attacker,weapon),ammo=magazine.size>0?ammoForWeapon118(weapon,magazine):null;
      const entity = entityForToken(attacker) || {};
      const temporaryModifiers=[...timedStatModifiers122(attacker),...list(ammo?.modifiers).map(mod=>({...mod,sourceId:ammo.id,sourceName:ammo.name||ammo.id,sourceKind:'ammo'}))];
      const attack = window.GRPGStatsV113?.weaponAttack?.(entity, weapon, { kind: attacker.npcId ? 'npc' : 'player', inCombat:true, temporaryModifiers });
      const operator=isDroneToken129(attacker)?operatorForDrone129(attacker):null;
      const hitBonus = (operator?operatorIntelligence129(operator)+operatorDroneSkill129(operator):num(attack?.bonus??weapon.hitBonus,0))-injuryCheckPenalty129(attacker)+burstPenalty;
      const damageBonus=num(attack?.damageBonus,0),damageExpression=String(attack?.damage||weapon.damage||'1d6');
      const cover=initialCover,defense=incomingDefense119(target,weapon.weaponCategory||'light',cover);defense.defenseBonus-=injuryCheckPenalty129(target);const attackDisadvantage=(cover.concealment&&!ignoresConcealment122(attacker))||injuryDisadvantage129(attacker),defenseDisadvantage=injuryDisadvantage129(target);
      const declaredContext={attacker,target,caster:attacker,targets:[target],weapon,damageType:String(weapon.weaponCategory||'light'),sourceName:weapon.name||'Атака'},declaredState={damage:0,attackBonus:hitBonus,defenseBonus:defense.defenseBonus,effects:[]};
      await runAutomaticHooks119(attacker,'OnAttackDeclared',declaredContext,declaredState);await chooseReaction119('OnAttackDeclared',declaredContext,declaredState);
      ({attacker,target}=combatTransactionRefs120(transaction));weapon=weaponForToken105(attacker);if(!target||!weapon)throw new Error('Атака изменилась во время реакции на объявление');magazine=magazineState118(attacker,weapon);ammo=magazine.size>0?ammoForWeapon118(weapon,magazine):null;if(magazine.size>0&&magazine.loaded<shotCost)throw new Error('После объявления атаки оружие всё ещё не заряжено');
      const entered=await requestAttackRolls119({attacker,target,weapon:{...weapon,damage:damageExpression},attackBonus:num(declaredState.attackBonus,hitBonus),defenseBonus:num(declaredState.defenseBonus,defense.defenseBonus),damageBonus,attackDisadvantage,defenseDisadvantage,shotIndex});if(!entered)return;
      ({attacker,target}=combatTransactionRefs120(transaction));weapon=weaponForToken105(attacker);
      if(!target)throw new Error('Цель больше не находится на сцене');
      if(!weapon||String(weapon.id)!==String(selectedWeapon.id))throw new Error('Выбранное оружие изменилось во время атаки');
      if(magazine.size>0){const currentMagazine=magazineState118(attacker,weapon);if(currentMagazine.loaded<shotCost)throw new Error('Патроны были израсходованы другим действием');currentMagazine.loaded-=shotCost;writeMagazineState118(attacker,weapon,currentMagazine);magazine.loaded=currentMagazine.loaded;magazine.ammoTypeId=currentMagazine.ammoTypeId;}
      const context={attacker,target,caster:attacker,targets:[target],weapon,damageType:String(weapon.weaponCategory||'light'),attackRoll:entered.attackRoll,defenseRoll:entered.defenseRoll,sourceName:weapon.name||'Атака'};
      const beforeState={damage:0,attackBonus:num(declaredState.attackBonus,hitBonus),defenseBonus:num(declaredState.defenseBonus,defense.defenseBonus),effects:declaredState.effects};await runAutomaticHooks119(attacker,'BeforeAttackStart',{...context,damage:0,attackBonus:beforeState.attackBonus,defenseBonus:beforeState.defenseBonus},beforeState);await chooseReaction119('BeforeAttackStart',{...context,damage:0,attackBonus:beforeState.attackBonus,defenseBonus:beforeState.defenseBonus},beforeState);
      const result=rules.resolveManualAttack({attackRoll:entered.attackRoll,defenseRoll:entered.defenseRoll,attackBonus:num(beforeState.attackBonus,hitBonus),defenseBonus:num(beforeState.defenseBonus,defense.defenseBonus),damageRoll:entered.damageRoll,damageBonus,damageReduction:0});
      ({attacker,target}=combatTransactionRefs120(transaction));if(!target)throw new Error('Цель больше не находится на сцене');
      let hpChange={before:num(target.hpCurrent),after:num(target.hpCurrent),applied:0},finalDamage=result.damageApplied,injuryDamage=0,absorptionV138={absorbed:0,applied:result.damageApplied};
      // Begin OnHit/BeforeDamage with the damage left after the entered roll,
      // critical additions and armor. The pre-attack state normally starts at
      // zero and previously caused every ordinary weapon hit to deal 0 damage.
      const effectState={damage:result.hit?result.damageApplied:0,damagePartsV138:result.hit?[{amount:result.damageApplied,absorptionSource:'all'}]:[],effects:beforeState.effects};
      if(result.hit){
        let hitContext={...context,attacker,target,caster:attacker,targets:[target],hit:true,critical:result.critical,damage:effectState.damage};
        await runAutomaticHooks119(attacker,'OnHit',hitContext,effectState);await chooseReaction119('OnHit',{...hitContext,damage:effectState.damage},effectState);
        ({attacker,target}=combatTransactionRefs120(transaction));if(!target)throw new Error('Цель больше не находится на сцене');hitContext={...hitContext,attacker,target,caster:attacker,targets:[target]};
        await runAutomaticHooks119(target,'BeforeDamage',{...hitContext,damage:effectState.damage},effectState);await chooseReaction119('BeforeDamage',{...hitContext,damage:effectState.damage},effectState);
        ({attacker,target}=combatTransactionRefs120(transaction));if(!target)throw new Error('Цель больше не находится на сцене');
        const finalDefense=incomingDefense119(target,weapon.weaponCategory||'light',cover);absorptionV138=applyAbsorptionV138(effectState,finalDefense);finalDamage=absorptionV138.applied;if(result.defenseCritical)finalDamage=Math.floor(finalDamage/2);
        hpChange=rules.applyDamage(target,finalDamage);injuryDamage=Math.max(0,num(hpChange.applied));updatePlayerHp105(target);
        const afterContext={...hitContext,attacker,target,caster:attacker,targets:[target],damage:finalDamage};
        await runAutomaticHooks119(target,'OnTakeDamage',afterContext,effectState);await chooseReaction119('OnTakeDamage',afterContext,effectState);
        ({target}=combatTransactionRefs120(transaction));hpChange.after=num(target?.hpCurrent,hpChange.after);hpChange.applied=Math.max(0,hpChange.before-hpChange.after);if(target){updatePlayerHp105(target);await applyInjuryAfterDamage129(target,injuryDamage,weapon.name||'Оружие');}
      }
      if(result.fumble){if(weapon.isUnarmedV122){setConditionV138(attacker,'prone',true);attacker.reactionUsedV119=true;}else{attacker.weaponMalfunctionsV122={...(attacker.weaponMalfunctionsV122||{}),[weapon.id]:true};}}
      const continues=!result.fumble&&shotIndex<maxShots&&(magazine.size===0||magazine.loaded>=shotCost);
      if(continues){attacker.burstStateV122={weaponId:weapon.id,nextShot:shotIndex+1,maxShots};attacker.actionUsed=false;}else{attacker.burstStateV122=null;attacker.actionUsed=true;completeDroneModule129(attacker);}
      const attackRoll=`${result.attackDie}${result.attackBonus?` ${result.attackBonus>=0?'+':'−'} ${Math.abs(result.attackBonus)}`:''} = ${result.attackTotal}`;
      const defenseRoll=`${result.defenseDie}${result.defenseBonus?` ${result.defenseBonus>=0?'+':'−'} защита ${Math.abs(result.defenseBonus)}`:''} = ${result.defenseTotal}`;
      const magazineText=magazine.size>0?`; магазин ${magazine.loaded} / ${magazine.size}`:'';
      const refs=combatTransactionRefs120(transaction);attacker=refs.attacker;target=refs.target;const runtimeNow=refs.runtime;
      const coverText=cover.assets.length?`; защита между юнитами «${cover.label}»${cover.armorBonus?` (+${cover.armorBonus})`:''}${cover.hardness?`, Твёрдость ${cover.hardness}`:''}${attackDisadvantage?', помеха':''}`:'';
      if(result.hit){const reductionText=absorptionV138.absorbed?` − поглощение ${absorptionV138.absorbed}`:'';const luaText=finalDamage!==result.damageApplied?` → после реакций${result.defenseCritical?' и натуральной 20 защиты':''} ${finalDamage}`:'';appendCombatLog105(runtimeNow,`${attacker.name} атакует ${target.name} из «${weapon.name||'оружия'}»${ammo?` патронами «${ammo.name||ammo.id}»`:''}: атака d20 ${attackRoll} против d20 цели ${defenseRoll} — попадание${result.critical?' (натуральная 20 атаки, +1 урон)':''}${result.defenseFumble?' (натуральная 1 защиты, +1 урон)':''}; урон ${result.rawDamage}${reductionText}${luaText}; HP ${hpChange.before} → ${hpChange.after}${coverText}${magazineText}.`);}else appendCombatLog105(runtimeNow,`${attacker.name} атакует ${target.name} из «${weapon.name||'оружия'}»${ammo?` патронами «${ammo.name||ammo.id}»`:''}: атака d20 ${attackRoll} против d20 цели ${defenseRoll} — промах${result.fumble?weapon.isUnarmedV122?' (натуральная 1: падение и потеря реакции)':' (натуральная 1: отказ оружия и конец очереди)':''}${coverText}${magazineText}.`);
      local.preview={...local.preview,effect:result.hit?'shot':'miss',targetId:target.id,label:result.hit?`${weapon.name}: ${finalDamage} урона · HP ${hpChange.before} → ${hpChange.after}`:`${weapon.name}: промах · ${result.attackTotal} против ${result.defenseTotal}`};
      Combat.syncInitiative(scene.id,false);Combat.render();flushLuaEffects119(effectState);await checkpointCombat120(result.hit?'Сцена: атака и урон':'Сцена: атака',true);
      setTimeout(()=>{if(['shot','miss'].includes(local.preview?.effect)&&local.preview?.targetId===target.id){local.preview=null;refreshPreviewDom104();}},1100);
    }catch(error){console.error('SCENE_ATTACK_V119_FAILED',error);Toast.show(String(error?.message||error),'err');}
    finally{finishCombatTransaction120(transaction);}
  }
  function consumeGrenade105(token,itemId){
    const owner=tokenInventoryOwner120(token),entity=owner.entity;if(!entity)return false;
    const row=list(owner.rows).find(v=>String(v?.itemId||'')===String(itemId));if(!row||num(row.qty,0)<=0)return false;
    row.qty=Math.max(0,Math.trunc(num(row.qty,0))-1);if(Array.isArray(row.positions)&&row.positions.length)row.positions.pop();if(row.qty<=0)owner.set(owner.rows.filter(v=>v!==row));
    if(token?.playerId&&App.state?.users?.[token.playerId])App.state.users[token.playerId]=normalizePlayerProfileV2(entity);
    return true;
  }
  async function commitGrenade105(point){
    const scene=Combat.getScene(),runtime=Combat.getRuntime(),selectedAttacker=selectedToken104(),selectedGrenade=grenadeForToken105(selectedAttacker);
    if(!scene||!runtime||!selectedAttacker)return;
    if(!Combat.canActWithToken?.(selectedAttacker)){Toast.show('Сейчас не ход этого юнита','info');return;}
    if(!selectedGrenade){Toast.show('В инвентаре персонажа нет гранаты','info');return;}
    if(selectedAttacker.burstStateV122){Toast.show('Сначала завершите скорострельную очередь','info');return;}
    if(selectedAttacker.actionUsed){Toast.show('Действие этого юнита уже потрачено','info');return;}
    const preview=makeGrenadePreview105(point);if(!preview)return;
    if(preview.limited){local.preview=preview;refreshPreviewDom104();Toast.show('Точка броска вне дальности — граната не израсходована','info');return;}
    const rules=window.GRPGCombatRulesV119;
    if(!rules){Toast.show('Модуль ручного расчёта боя не загружен','err');return;}
    const impact=preview.end,radiusHexes=Math.max(0,num(preview.radiusHexes,grenadeRadiusCells105(selectedGrenade,scene))),targetIds=[];
    for(const target of list(runtime.tokens)){const c=centerOf(target);if(hexDistancePoints109(scene,c,impact)>radiusHexes)continue;if(sightSegmentBlocked105(scene,impact,c,[target.id]))continue;targetIds.push(String(target.id));}
    const transaction=beginCombatTransaction120('grenade',scene.id,selectedAttacker.id,targetIds);if(!transaction)return;
    try{
      let refs=combatTransactionRefs120(transaction),attacker=refs.attacker,targets=refs.targets,grenade=grenadeForToken105(attacker);
      if(!grenade)throw new Error('Граната уже отсутствует в инвентаре');
      const declaredContext={attacker,caster:attacker,target:null,targets,weapon:grenade,damage:0,damageType:String(grenade.weaponCategory||grenade.damageType||'heavy').toLowerCase(),hit:false,sourceName:grenade.name},declaredState={damage:0,effects:[]};await runAutomaticHooks119(attacker,'OnAttackDeclared',declaredContext,declaredState);await chooseReaction119('OnAttackDeclared',declaredContext,declaredState);
      const entered=await requestDamageRoll119({title:`Граната: ${grenade.name}`,source:attacker,expression:String(grenade.damage||''),damageBonus:num(grenade.damageBonus,0),targets});if(!entered)return;
      refs=combatTransactionRefs120(transaction);attacker=refs.attacker;targets=refs.targets;grenade=grenadeForToken105(attacker);
      if(!grenade||String(grenade.id)!==String(selectedGrenade.id)||!consumeGrenade105(attacker,selectedGrenade.id))throw new Error('Граната отсутствует в инвентаре персонажа');
      const rolledTotal=Math.max(0,Math.round(num(entered.damageRoll)+num(grenade.damageBonus,0))),affected=[],allEffects={effects:[]};
      const incomingCategory=String(grenade.weaponCategory||grenade.damageType||'heavy').toLowerCase();
      let beforeContext={attacker,caster:attacker,target:null,targets,weapon:grenade,damage:rolledTotal,damageType:incomingCategory,hit:true,sourceName:grenade.name};
      const preState={damage:rolledTotal,damagePartsV138:[{amount:rolledTotal,absorptionSource:'all'}],effects:declaredState.effects};await runAutomaticHooks119(attacker,'BeforeAttackStart',beforeContext,preState);await chooseReaction119('BeforeAttackStart',{...beforeContext,damage:preState.damage},preState);allEffects.effects=preState.effects;
      for(const targetId of transaction.targetIds){
        refs=combatTransactionRefs120(transaction);attacker=refs.attacker;const target=list(refs.runtime.tokens).find(row=>String(row.id)===String(targetId));if(!target)continue;
        const cover=coverBetween120(refs.scene,impact,centerOf(target)),defense=incomingDefense119(target,incomingCategory,cover);
        const state={damage:preState.damage,damagePartsV138:clone(preState.damagePartsV138),absorptionRulesV138:clone(preState.absorptionRulesV138||{}),effects:allEffects.effects};let context={...beforeContext,attacker,caster:attacker,target,targets:[target],damage:state.damage};
        await runAutomaticHooks119(attacker,'OnHit',context,state);await chooseReaction119('OnHit',{...context,damage:state.damage},state);
        refs=combatTransactionRefs120(transaction);const currentTarget=list(refs.runtime.tokens).find(row=>String(row.id)===String(targetId));if(!currentTarget)continue;attacker=refs.attacker;context={...context,attacker,caster:attacker,target:currentTarget,targets:[currentTarget]};
        await runAutomaticHooks119(currentTarget,'BeforeDamage',{...context,damage:state.damage},state);await chooseReaction119('BeforeDamage',{...context,damage:state.damage},state);
        refs=combatTransactionRefs120(transaction);const damageTarget=list(refs.runtime.tokens).find(row=>String(row.id)===String(targetId));if(!damageTarget)continue;
        const reduced=applyAbsorptionV138(state,incomingDefense119(damageTarget,incomingCategory,cover)),finalDamage=reduced.applied,hp=rules.applyDamage(damageTarget,finalDamage),injuryDamage=Math.max(0,num(hp.applied));updatePlayerHp105(damageTarget);
        context={...context,attacker:refs.attacker,caster:refs.attacker,target:damageTarget,targets:[damageTarget],damage:finalDamage};
        await runAutomaticHooks119(damageTarget,'OnTakeDamage',context,state);await chooseReaction119('OnTakeDamage',context,state);
        refs=combatTransactionRefs120(transaction);const finalTarget=list(refs.runtime.tokens).find(row=>String(row.id)===String(targetId));const after=num(finalTarget?.hpCurrent,hp.after),applied=Math.max(0,hp.before-after);if(finalTarget){updatePlayerHp105(finalTarget);await applyInjuryAfterDamage129(finalTarget,injuryDamage,grenade.name||'Взрыв');}
        affected.push({name:finalTarget?.name||damageTarget.name,damage:applied,absorbed:reduced.absorbed,before:hp.before,after,cover:cover.label});allEffects.effects=state.effects;
      }
      refs=combatTransactionRefs120(transaction);attacker=refs.attacker;attacker.actionUsed=true;
      const affectedText=affected.length?affected.map(row=>`${row.name}: −${row.damage} HP (${row.before} → ${row.after}${row.absorbed?`, защита ${row.absorbed}`:''}${row.cover?`, укрытие ${row.cover}`:''})`).join('; '):'нет целей';
      appendCombatLog105(refs.runtime,`${attacker.name} бросает «${grenade.name}»: введённый урон ${entered.damageRoll}${num(grenade.damageBonus)?` + ${num(grenade.damageBonus)} = ${rolledTotal}`:''}, радиус ${hexLabel109(radiusHexes)}. ${affectedText}.`);
      local.preview={...preview,effect:'grenade',label:`${grenade.name}: базовый урон ${rolledTotal} · целей ${affected.length}`};
      Combat.syncInitiative(scene.id,false);Combat.render();flushLuaEffects119(allEffects);await checkpointCombat120('Сцена: граната и урон',true);
      setTimeout(()=>{if(local.preview?.effect==='grenade'){local.preview=null;refreshPreviewDom104();}},1300);
    }catch(error){console.error('SCENE_GRENADE_V119_FAILED',error);Toast.show(String(error?.message||error),'err');}
    finally{finishCombatTransaction120(transaction);}
  }
  function beginPan105(event,viewport){
    if(!viewport)return;
    const sceneId=Combat.getSceneIdForView?.()||Combat.getScene()?.id||'';
    const view=Combat.getViewState?.(sceneId)||{panX:0,panY:0};
    Combat.viewDragState={sceneId,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,panX:num(view.panX),panY:num(view.panY),moved:false};
    viewport.setPointerCapture?.(event.pointerId);
    viewport.classList.add('is-panning');
    local.draw={kind:'pan',pointerId:event.pointerId,viewport};
  }
  function startBoardPointer104(event){
    if(local.draw?.kind==='asset-transform')return;
    const stage=event.target.closest?.('#combat-stage'),viewport=event.target.closest?.('#combat-stage-viewport');if(!stage)return;const scene=Combat.getScene();if(!scene)return;
    if(local.lua119.pointPicker&&event.button===0){event.preventDefault();event.stopImmediatePropagation();const picker=local.lua119.pointPicker,point=nearestHexCenter107(scene,scenePointFromEvent(event,stage,scene)),caster=tokenById119(picker.casterId),distance=hexDistancePoints109(scene,centerOf(caster||{x:point.x,y:point.y,w:0,h:0}),point);if(distance>picker.castRange){Toast.show(`Точка вне дальности: ${hexLabel109(distance)} при максимуме ${hexLabel109(picker.castRange)}`,'info');return;}local.lua119.pointPicker=null;local.preview={kind:'grenade',sourceTokenId:picker.casterId,start:centerOf(caster||{x:point.x,y:point.y,w:0,h:0}),end:point,radius:Math.max(.08,picker.areaRadius*hexStepDistance109()),hexes:picker.castRange,label:`${picker.label}: точка выбрана`};refreshPreviewDom104();picker.resolve(point);return;}
    if(event.button===1||local.ui.action==='pan'||(local.spaceDown&&event.button===0)){event.preventDefault();beginPan105(event,viewport||stage.closest('#combat-stage-viewport'));return;}
    if(event.button!==0)return;const point=scenePointFromEvent(event,stage,scene),object=event.target.closest?.('[data-scene-kind-v104]');
    const assetHandle=event.target.closest?.('[data-asset-transform-v133]');
    if(assetHandle&&local.ui.action==='select'){
      const asset=list(scene.assets).find(a=>a.id===object?.dataset.sceneIdV104);
      if(asset&&!asset.locked){
        event.preventDefault();event.stopImmediatePropagation();
        local.draw={kind:'asset-transform',pointerId:event.pointerId,sceneId:scene.id,id:asset.id,
          mode:assetHandle.dataset.assetTransformV133,start:point,original:clone(asset),node:object};
        stage.setPointerCapture?.(event.pointerId);
      }
      return;
    }
    const resizeHandle=event.target.closest?.('[data-zone-resize-v107]');
    if(resizeHandle){const zone=list(scene.templates).find(z=>z.id===resizeHandle.dataset.zoneResizeV107);if(zone&&!zone.locked){event.preventDefault();event.stopPropagation();local.draw={kind:'zone-resize',pointerId:event.pointerId,id:zone.id,ox:num(zone.x),oy:num(zone.y),ow:Math.max(.2,num(zone.w,1)),oh:Math.max(.2,num(zone.h,1)),points:clone(zone.points||[])};stage.setPointerCapture?.(event.pointerId);}return;}
    if(local.ui.pendingPlacement){const p=local.ui.pendingPlacement;if(p.kind==='asset')placeLibraryAsset104(p.libraryId,point);else if(['player','npc','equipment-unit'].includes(p.kind))placeUnit104(p.kind,p.entityId,point);else if(p.kind==='deploy-device-v129')void deployDeviceAt129(p,point);else if(p.kind==='zone')placeZone104(p.shape,point);return;}
    if(local.ui.action==='select'){
      if(object){Combat.selectedObject={kind:object.dataset.sceneKindV104,id:object.dataset.sceneIdV104};const sel=selectedObject104();if(sel&&!sel.obj.locked){local.draw={kind:'drag',pointerId:event.pointerId,start:point,objectKind:sel.kind,id:sel.obj.id,ox:num(sel.obj.x),oy:num(sel.obj.y),points:clone(sel.obj.points||[]),node:object,duplicateRequested:event.shiftKey&&sel.kind==='token',moved:false,sceneId:scene.id};stage.setPointerCapture?.(event.pointerId);}else Combat.render();}
      else{Combat.selectedObject=null;Combat.render();}return;
    }
    if(local.ui.action==='move'){event.preventDefault();event.stopImmediatePropagation();local.preview=makeRoutePreview104(point,false);refreshPreviewDom104();commitMove104();return;}
    if(local.ui.action==='attack'){event.preventDefault();event.stopImmediatePropagation();const targetEl=object?.dataset.sceneKindV104==='token'?object:null;local.preview=makeRoutePreview104(targetEl?centerOf(list(Combat.getRuntime()?.tokens).find(t=>t.id===targetEl.dataset.sceneIdV104)||{x:point.x,y:point.y,w:0,h:0}):point,true);refreshPreviewDom104();if(targetEl)void commitAttack105(targetEl.dataset.sceneIdV104);return;}
    if(local.ui.action==='grenade'){event.preventDefault();event.stopImmediatePropagation();local.preview=makeGrenadePreview105(point);refreshPreviewDom104();void commitGrenade105(point);return;}
    if(['measure','circle','cone'].includes(local.ui.action)){const snapped=nearestHexCenter107(scene,point);local.draw={kind:local.ui.action,pointerId:event.pointerId,start:snapped};local.preview={kind:local.ui.action,start:snapped,end:snapped,hexes:0,radius:0,label:hexLabel109(0)};stage.setPointerCapture?.(event.pointerId);refreshPreviewDom104();return;}
    if(['wall','area'].includes(local.ui.action)){local.draw={kind:local.ui.action,pointerId:event.pointerId,points:[point],last:point};local.preview={kind:local.ui.action,points:[point]};stage.setPointerCapture?.(event.pointerId);refreshPreviewDom104();}
  }
  function moveBoardPointer104(event){
    const stage=document.getElementById('combat-stage'),scene=Combat.getScene();if(!stage||!scene)return;const d=local.draw;
    if(d?.kind==='pan'){Combat.updateViewDrag?.(event,d.viewport);return;}
    const point=scenePointFromEvent(event,stage,scene);
    if(local.lua119.pointPicker){const picker=local.lua119.pointPicker,caster=tokenById119(picker.casterId),snapped=nearestHexCenter107(scene,point),start=centerOf(caster||{x:snapped.x,y:snapped.y,w:0,h:0}),distance=hexDistancePoints109(scene,start,snapped);local.preview={kind:'grenade',sourceTokenId:picker.casterId,start,end:snapped,radius:Math.max(.08,picker.areaRadius*hexStepDistance109()),limited:distance>picker.castRange,label:`${picker.label}: ${hexLabel109(distance)} / ${hexLabel109(picker.castRange)}`};refreshPreviewDom104();return;}
    if(!d&&(local.ui.action==='move'||local.ui.action==='attack'||local.ui.action==='grenade')){local.preview=local.ui.action==='grenade'?makeGrenadePreview105(point):makeRoutePreview104(point,local.ui.action==='attack');refreshPreviewDom104();return;}
    if(!d)return;
    if(d.kind==='asset-transform'){
      if(event.pointerId!==d.pointerId||scene.id!==d.sceneId)return;
      const asset=list(scene.assets).find(a=>a.id===d.id);if(!asset)return;
      Object.assign(asset,window.GRPGAssetTransformV133.transform(d.original,d.start,point,d.mode,event.shiftKey));
      d.node.style.left=`${asset.x/scene.width*100}%`;d.node.style.top=`${asset.y/scene.height*100}%`;
      d.node.style.width=`${asset.w/scene.width*100}%`;d.node.style.height=`${asset.h/scene.height*100}%`;
      d.node.style.transform=`rotate(${asset.rotation}deg)`;
      broadcastScene104();return;
    }
    if(d.kind==='drag'){
      if(event.pointerId!==d.pointerId||scene.id!==d.sceneId)return;
      let sel=selectedObject104();if(!sel)return;const dx=point.x-d.start.x,dy=point.y-d.start.y;
      if(!d.moved&&Math.hypot(dx,dy)<.08)return;
      if(!d.moved&&d.duplicateRequested){
        if(Object.keys(sel.obj.lootStateV118?.pendingTransfersV137||{}).length){Toast.show('Сначала завершите передачу добычи этого юнита.','info');return;}
        const copy=normalizeCombatToken({...clone(sel.obj),id:makeId('token')});
        Combat.getRuntime(scene.id).tokens.push(copy);d.originalId=sel.obj.id;d.id=copy.id;d.cloned=true;
        Combat.selectedObject={kind:'token',id:copy.id};sel={kind:'token',obj:copy};
        const node=d.node.cloneNode(true);node.dataset.sceneIdV104=copy.id;
        node.querySelectorAll('[data-scene-search-v118]').forEach(el=>el.dataset.sceneSearchV118=copy.id);
        d.node.parentNode.appendChild(node);d.node=node;
      }
      d.moved=true;
      if(sel.kind==='token'){const c=nearestHexCenter107(scene,{x:d.ox+num(sel.obj.w,1)/2+dx,y:d.oy+num(sel.obj.h,1)/2+dy});fitTokenToHex107(sel.obj,scene,c);}
      else{sel.obj.x=clamp104(d.ox+dx,0,Math.max(0,scene.width-num(sel.obj.w,1)));sel.obj.y=clamp104(d.oy+dy,0,Math.max(0,scene.height-num(sel.obj.h,1)));if(sel.kind==='zone'&&d.points?.length){const adx=sel.obj.x-d.ox,ady=sel.obj.y-d.oy;sel.obj.points=d.points.map(p=>({x:p.x+adx,y:p.y+ady}));}}
      if(d.node&&!['wall','polygon'].includes(sel.obj.shape)){d.node.style.left=`${sel.obj.x/scene.width*100}%`;d.node.style.top=`${sel.obj.y/scene.height*100}%`;}
      if(sel.kind==='zone'&&['wall','polygon'].includes(sel.obj.shape)){const vector=document.querySelector(`#combat-stage [data-scene-kind-v104="zone"][data-scene-id-v104="${CSS.escape(sel.obj.id)}"]`);vector?.setAttribute('points',sel.obj.points.map(p=>`${p.x},${p.y}`).join(' '));const handle=document.querySelector(`#combat-stage [data-zone-resize-v107="${CSS.escape(sel.obj.id)}"]`);if(handle){handle.style.left=`${(sel.obj.x+sel.obj.w)/scene.width*100}%`;handle.style.top=`${(sel.obj.y+sel.obj.h)/scene.height*100}%`;}}
      broadcastScene104();return;
    }
    if(d.kind==='zone-resize'){
      const zone=list(scene.templates).find(z=>z.id===d.id);if(!zone)return;const min=.25,newW=clamp104(point.x-d.ox,min,Math.max(min,scene.width-d.ox)),newH=clamp104(point.y-d.oy,min,Math.max(min,scene.height-d.oy));
      zone.w=newW;zone.h=newH;
      if(d.points?.length){const sx=newW/Math.max(.001,d.ow),sy=newH/Math.max(.001,d.oh);zone.points=d.points.map(p=>({x:d.ox+(p.x-d.ox)*sx,y:d.oy+(p.y-d.oy)*sy}));}
      const vector=document.querySelector(`#combat-stage [data-scene-kind-v104="zone"][data-scene-id-v104="${CSS.escape(zone.id)}"]`);if(vector&&zone.points?.length)vector.setAttribute('points',zone.points.map(p=>`${p.x},${p.y}`).join(' '));
      const node=document.querySelector(`#combat-stage .scene-zone-v104[data-scene-id-v104="${CSS.escape(zone.id)}"]`);if(node){node.style.width=`${zone.w/scene.width*100}%`;node.style.height=`${zone.h/scene.height*100}%`;}
      const handle=document.querySelector(`#combat-stage [data-zone-resize-v107="${CSS.escape(zone.id)}"]`);if(handle?.classList.contains('scene-zone-resize-absolute-v107')){handle.style.left=`${(zone.x+zone.w)/scene.width*100}%`;handle.style.top=`${(zone.y+zone.h)/scene.height*100}%`;}
      broadcastScene104();return;
    }
    if(['measure','circle','cone'].includes(d.kind)){const end=nearestHexCenter107(scene,point),hexes=hexDistancePoints109(scene,d.start,end),radius=hexes*hexStepDistance109();local.preview={kind:d.kind,start:d.start,end,hexes,radius,label:d.kind==='measure'?`Дистанция: ${hexLabel109(hexes)}`:`Радиус: ${hexLabel109(hexes)}`};refreshPreviewDom104();return;}
    if(['wall','area'].includes(d.kind) && dist(d.last,point)>.18){d.points.push(point);d.last=point;local.preview={kind:d.kind,points:d.points};refreshPreviewDom104();}
  }
  function endBoardPointer104(event){
    const d=local.draw;if(!d)return;
    if(event?.pointerId!=null&&event.pointerId!==d.pointerId)return;
    if(d.kind==='asset-transform'){
      if(event?.pointerId!=null&&event.pointerId!==d.pointerId)return;
      const scene=Combat.getScene(),asset=scene?.id===d.sceneId?list(scene.assets).find(a=>a.id===d.id):null;
      if(asset&&event?.type==='pointercancel')Object.assign(asset,d.original);
      local.draw=null;
      const stage=document.getElementById('combat-stage');
      if(stage?.hasPointerCapture?.(d.pointerId))stage.releasePointerCapture(d.pointerId);
      if(asset){if(event?.type!=='pointercancel')queueStoreSave();Combat.render();broadcastScene104();}
      return;
    }
    local.draw=null;
    if(d.kind==='pan'){Combat.endViewDrag?.();return;}
    if(d.kind==='drag'){
      if(event?.type==='pointercancel'){
        const runtime=Combat.getRuntime(d.sceneId);
        if(d.cloned){runtime.tokens=runtime.tokens.filter(t=>t.id!==d.id);Combat.selectedObject={kind:'token',id:d.originalId};}
        else{const sel=selectedObject104();if(sel){sel.obj.x=d.ox;sel.obj.y=d.oy;if(d.points?.length)sel.obj.points=clone(d.points);}}
      }else if(d.moved){if(d.cloned)Combat.syncInitiative(d.sceneId,false);queueStoreSave();}
      Combat.render();broadcastScene104();return;
    }
    if(d.kind==='zone-resize'){queueStoreSave();Combat.render();broadcastScene104();return;}
    if(d.kind==='wall'&&d.points.length>1){const scene=Combat.getScene();const xs=d.points.map(p=>p.x),ys=d.points.map(p=>p.y);const zone=normalizeCombatTemplate({id:makeId('wall'),shape:'wall',name:'Стена',label:'',x:Math.min(...xs),y:Math.min(...ys),w:Math.max(.2,Math.max(...xs)-Math.min(...xs)),h:Math.max(.2,Math.max(...ys)-Math.min(...ys)),points:d.points,thickness:.18,color:'rgba(255,190,92,.75)',visibleToPlayers:false,blockSight:true,blockMovement:true});scene.templates.push(zone);Combat.selectedObject={kind:'zone',id:zone.id};local.preview=null;queueStoreSave();Combat.render();broadcastScene104();return;}
    if(d.kind==='area'&&d.points.length>2){const scene=Combat.getScene();const xs=d.points.map(p=>p.x),ys=d.points.map(p=>p.y);const zone=normalizeCombatTemplate({id:makeId('area'),shape:'polygon',name:'Область',label:'',x:Math.min(...xs),y:Math.min(...ys),w:Math.max(.2,Math.max(...xs)-Math.min(...xs)),h:Math.max(.2,Math.max(...ys)-Math.min(...ys)),points:d.points,color:'rgba(255,190,92,.35)',visibleToPlayers:true,blockSight:false,blockMovement:false});scene.templates.push(zone);Combat.selectedObject={kind:'zone',id:zone.id};local.preview=null;queueStoreSave();Combat.render();broadcastScene104();return;}
    refreshPreviewDom104();
  }

  function contextMenu104(event){
    const lootRow=event.target.closest?.("[data-loot-item-v137]");if(lootRow){lootContextMenuV137(event,lootRow);return;}
    const object=event.target.closest?.('[data-scene-kind-v104]');if(!object||!object.closest('#combat-stage'))return;event.preventDefault();Combat.selectedObject={kind:object.dataset.sceneKindV104,id:object.dataset.sceneIdV104};const sel=selectedObject104();if(!sel)return;closeContext104();const menu=document.createElement('div');menu.className='scene-context-v104';menu.style.left=`${event.clientX}px`;menu.style.top=`${event.clientY}px`;
    if(sel.kind==='token')menu.innerHTML=`<b>${html(sel.obj.name)}</b><label>HP <input type="number" data-context-hp-v104 value="${num(sel.obj.hpCurrent)}"/> / <input type="number" data-context-hpmax-v104 value="${num(sel.obj.hpMax,1)}"/></label><label>Инициатива <input type="number" data-context-init-v104 value="${num(sel.obj.initiative)}"/></label><button data-context-toggle-v104="visibleToPlayers" type="button">${sel.obj.visibleToPlayers!==false?'Скрыть от игроков':'Показать игрокам'}</button><button data-context-toggle-v104="sharesVisionWithPlayers" type="button">${sel.obj.sharesVisionWithPlayers?'Не давать обзор игрокам':'Даёт обзор игрокам'}</button><button data-context-toggle-v104="blockMovement" type="button">${sel.obj.blockMovement?'Не блокирует путь':'Блокирует путь'}</button><button data-context-delete-v104 type="button">Удалить</button>`;
    else menu.innerHTML=`<b>${html(sel.obj.name||sel.obj.label||'Объект')}</b><button data-context-toggle-v104="blockMovement" type="button">${sel.obj.blockMovement?'Не блокирует движение':'Блокирует движение'}</button><button data-context-toggle-v104="blockSight" type="button">${sel.obj.blockSight?'Просматривается насквозь':'Блокирует обзор'}</button><button data-context-toggle-v104="visibleToPlayers" type="button">${sel.obj.visibleToPlayers!==false?'Скрыть от игроков':'Показать игрокам'}</button><button data-context-delete-v104 type="button">Удалить</button>`;
    document.body.appendChild(menu);local.context=menu;
  }
  function closeContext104(){local.context?.remove();local.context=null;}

  function tokenNameVisibleToPlayers128(token){const entity=entityForToken(token);if(entity&&typeof entity.showNameToPlayers==='boolean')return entity.showNameToPlayers;return token?.showNameToPlayers!==false;}
  function previewVisibleToPlayers128(scene,runtime,preview){
    if(!preview)return false;const sourceId=String(preview.sourceTokenId||preview.movedTokenId||'');if(!sourceId)return true;
    const source=list(runtime?.tokens).find(token=>String(token.id)===sourceId);if(!source||source.hidden||source.visibleToPlayers===false)return false;
    if(scene.fogMode==='off'||scene.fogEnabled===false||source.playerId||source.sharesVisionWithPlayers)return true;
    const point=centerOf(source);return playerVisionSources112(scene,runtime).some(vision=>hexDistancePoints109(scene,vision.origin,point)<=vision.radius&&!sightSegmentBlocked105(scene,vision.origin,point,[vision.token.id,source.id]));
  }
  function buildCombatSnapshot104(){
    const scene=Combat.getScene();if(!scene)return null;const liveRuntime=Combat.getRuntime(scene.id)||{},runtime=clone(liveRuntime);runtime.tokens=list(runtime.tokens).map(t=>({...t,showNameToPlayers:tokenNameVisibleToPlayers128(t),resolvedVisionCells:tokenVisionCells(t,scene),resolvedVisionRadius:tokenVisionCells(t,scene)*hexStepDistance109(),resolvedMoveCells:tokenMoveCells(t,scene),resolvedAttackCells:tokenAttackCells(t,scene)}));
    const displayScene=clone(scene);displayScene.templates=[...list(displayScene.templates),...thinkerZoneModels125(liveRuntime,scene).filter(row=>row.visibleToPlayers!==false)];
    const preview=previewVisibleToPlayers128(scene,liveRuntime,local.preview)?clone(local.preview):null;
    return {version:4,scene:displayScene,runtime,preview,sentAt:new Date().toISOString()};
  }
  Combat.broadcastPlayerDisplayMirror = function(sceneId=this.getSceneIdForView()){
    if(!this.isDm()||!window.electronAPI?.updatePlayerDisplayView)return;
    const combat=this.getCombatState(),scene=sceneId&&COMBAT_SCENES[sceneId]?COMBAT_SCENES[sceneId]:this.getScene();
    window.electronAPI.updatePlayerDisplayView({mode:'combat',eraTheme:document.documentElement?.dataset?.eraTheme||'technological',graphicsMode:document.documentElement?.dataset?.graphicsMode==='lite'?'lite':'full',activeSceneId:scene?.id||'',cameraByScene:clone(local.cameraRuntime||{}),combatSnapshot:buildCombatSnapshot104(),activeRegionMapId:'',updatedAt:new Date().toISOString()}).catch(()=>{});
  };
  function broadcastScene104(){if(local.broadcastRaf)return;local.broadcastRaf=requestAnimationFrame(()=>{local.broadcastRaf=0;Combat.broadcastPlayerDisplayMirror?.();});}

  async function exportArchive104(){
    const api=audioApi(),audioLibrary=clone(api?.state||{});
    list(audioLibrary?.sections).forEach(section=>list(section.sounds).forEach(sound=>{if(sound.file){sound.url=sound.file;sound.file=sound.file;}}));
    const payload={store:collectStoreFromRuntime(),audioLibrary,audioAmbient:clone(api?.state?.sceneAmbient||{})};
    if(window.electronAPI?.exportCombatArchive){const res=await window.electronAPI.exportCombatArchive(payload);if(res?.ok)Toast.show('Архив сцен, ассетов и звуков сохранён','ok');else if(!res?.canceled)Toast.show(`Экспорт не выполнен: ${res?.message||'unknown'}`,'err');return;}
    const blob=new Blob([JSON.stringify({format:'GRPGI_SCENE_ARCHIVE',version:2,payload},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='GRPGI-scenes.grpgscene';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  }
  async function importArchive104(){
    let payload=null;
    if(window.electronAPI?.importCombatArchive){const res=await window.electronAPI.importCombatArchive();if(!res?.ok){if(!res?.canceled)Toast.show(`Импорт не выполнен: ${res?.message||'unknown'}`,'err');return;}payload=res.payload;}
    else payload=await new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.grpgscene,.json,application/json';input.onchange=async()=>{try{const parsed=JSON.parse(await input.files[0].text());resolve(parsed?.payload||parsed);}catch{resolve(null);}};input.click();});
    if(!payload)return;const incoming=normalizeStore(payload.store||payload);local.store=incoming;applyStore(incoming);const api=audioApi();if(payload.audioLibrary&&api){api.stopAll?.();const lib=clone(payload.audioLibrary);lib.sections=list(lib.sections).map(section=>({id:String(section.id||makeId('sound_section')),name:String(section.name||'Общее'),sounds:list(section.sounds).map(sound=>({id:String(sound.id||makeId('sound')),name:String(sound.name||'Звук'),url:String(sound.url||sound.file||''),file:String(sound.file||sound.url||''),createdAt:sound.createdAt||new Date().toISOString()})).filter(sound=>sound.url)}));if(!lib.sections.length)lib.sections=[{id:'general',name:'Общее',sounds:[]}];lib.sceneAmbient=lib.sceneAmbient&&typeof lib.sceneAmbient==='object'?lib.sceneAmbient:{};lib.sceneAmbientSections=lib.sceneAmbientSections&&typeof lib.sceneAmbientSections==='object'?lib.sceneAmbientSections:{};api.state=lib;api.save();}else if(payload.audioAmbient&&api){api.state.sceneAmbient={...api.state.sceneAmbient,...payload.audioAmbient};api.save();}local.loaded=true;await saveStoreNow();Combat.render();broadcastScene104();Toast.show('Архив сцен, ассетов и звуков импортирован','ok');
  }

  // Ambient v1.0.107: a scene may use one looping track or a whole section playlist.
  const api=audioApi();
  if(api){
    api.state.sceneAmbient=api.state.sceneAmbient&&typeof api.state.sceneAmbient==='object'?api.state.sceneAmbient:{};
    api.state.sceneAmbientSections=api.state.sceneAmbientSections&&typeof api.state.sceneAmbientSections==='object'?api.state.sceneAmbientSections:{};
    api._sectionAmbientState=api._sectionAmbientState||null;
    api._stopAmbientNode107=function(){
      if(this.ambientNode){try{this.ambientNode.onended=null;this.ambientNode.pause();this.ambientNode.currentTime=0;}catch{}}
      this.ambientNode=null;this.ambientKey='';this._sectionAmbientState=null;
    };
    api.stopAmbient=function(sceneId=''){
      const sid=String(sceneId||((UI.activeModuleId==='combat'&&Combat.getSceneIdForView?.())||'')).trim();
      if(sid){delete this.state.sceneAmbient[sid];delete this.state.sceneAmbientSections[sid];this.save();}
      this._stopAmbientNode107();
    };
    api.stopAll=function(){this.stopSounds?.();this._stopAmbientNode107();};
    api.setAmbient=function(sceneId,soundId){
      const sid=String(sceneId||'').trim(),sound=String(soundId||'').trim();if(!sid)return;
      const same=this.state.sceneAmbient?.[sid]===sound&&!this.state.sceneAmbientSections?.[sid];
      if(!sound||same){this.stopAmbient(sid);Combat.render();return;}
      delete this.state.sceneAmbientSections[sid];this.state.sceneAmbient[sid]=sound;this.save();this.startAmbient(sid,{restart:true});Combat.render();
    };
    api.setSectionAmbient=function(sceneId,sectionId,mode='sequential'){
      const sid=String(sceneId||'').trim(),section=this.sections.find(s=>s.id===String(sectionId||''));mode=mode==='random'?'random':'sequential';if(!sid||!section)return;
      const current=this.state.sceneAmbientSections?.[sid],same=current?.sectionId===section.id&&current?.mode===mode;
      if(same){this.stopAmbient(sid);Combat.render();return;}
      delete this.state.sceneAmbient[sid];this.state.sceneAmbientSections[sid]={sectionId:section.id,mode};this._sectionAmbientState=null;this.save();this.startAmbient(sid,{restart:true});Combat.render();
    };
    const deleteSectionBase107=api.deleteSection.bind(api);
    api.deleteSection=function(sectionId){
      const sid=String(sectionId||'');
      for(const [sceneId,cfg] of Object.entries(this.state.sceneAmbientSections||{})){if(cfg?.sectionId===sid)delete this.state.sceneAmbientSections[sceneId];}
      if(this._sectionAmbientState?.sectionId===sid)this._stopAmbientNode107();
      const result=deleteSectionBase107(sid);this.save();return result;
    };
    api._playSectionAmbient107=function(sceneId,sectionId,mode='sequential',index=0){
      const section=this.sections.find(s=>s.id===sectionId),sounds=list(section?.sounds).filter(s=>s?.url);if(!section||!sounds.length){this.stopAmbient(sceneId);return;}
      let nextIndex=index;
      if(mode==='random'){if(sounds.length>1){let candidate=Math.floor(Math.random()*sounds.length);if(this._sectionAmbientState?.index===candidate)candidate=(candidate+1)%sounds.length;nextIndex=candidate;}else nextIndex=0;}
      else nextIndex=((index%sounds.length)+sounds.length)%sounds.length;
      const sound=sounds[nextIndex],key=`${sceneId}:section:${sectionId}:${mode}:${sound.id}`;
      this._stopAmbientNode107();
      try{AudioManager.stopAmbient?.();const audio=new Audio(sound.url);audio.loop=false;audio.volume=.34;audio.preload='auto';this.ambientNode=audio;this.ambientKey=key;this._sectionAmbientState={sceneId,sectionId,mode,index:nextIndex};audio.onended=()=>{const cfg=this.state.sceneAmbientSections?.[sceneId];if(!cfg||cfg.sectionId!==sectionId||cfg.mode!==mode)return;this._playSectionAmbient107(sceneId,sectionId,mode,mode==='random'?nextIndex:nextIndex+1);};audio.play().catch(()=>{});}catch{}
    };
    api.startAmbient=function(sceneId,options={}){
      const sid=String(sceneId||'').trim(),cfg=this.state.sceneAmbientSections?.[sid];
      if(cfg?.sectionId){const keyPrefix=`${sid}:section:${cfg.sectionId}:${cfg.mode||'sequential'}:`;if(!options.restart&&this.ambientNode&&String(this.ambientKey||'').startsWith(keyPrefix))return;this._playSectionAmbient107(sid,cfg.sectionId,cfg.mode,0);return;}
      const soundId=String(this.state.sceneAmbient?.[sid]||'');
      if(!soundId){this._stopAmbientNode107();return;}
      const found=this.findSound(soundId);if(!found?.sound?.url){delete this.state.sceneAmbient[sid];this.save();this._stopAmbientNode107();return;}
      const key=`${sid}:sound:${soundId}`;if(!options.restart&&this.ambientNode&&this.ambientKey===key)return;
      this._stopAmbientNode107();
      try{AudioManager.stopAmbient?.();const audio=new Audio(found.sound.url);audio.loop=true;audio.volume=.34;audio.preload='auto';this.ambientNode=audio;this.ambientKey=key;audio.play().catch(()=>{});}catch{}
    };
  }

  // v1.0.108 combat stability mode: scenes are local-first and network/UI background work is suspended for the session.
  const syncCheckBefore108=Sync?.checkForRemoteUpdates?.bind(Sync),syncPushBefore108=Sync?.pushCurrentSnapshot?.bind(Sync),playerPullBefore108=PlayerSync?.pullUpdates?.bind(PlayerSync);
  const syncStartPollingBefore108=Sync?.startPolling?.bind(Sync),playerStartPollingBefore108=PlayerSync?.startPolling?.bind(PlayerSync),chatStartPollingBefore108=ChatSync?.startPolling?.bind(ChatSync),chatRealtimeBefore108=ChatSync?.initRealtimeBridge?.bind(ChatSync),worldScheduleBefore108=Sync?.scheduleWorldSnapshotPullV1015?.bind(Sync);
  const appSaveBefore108=App?.saveState?.bind(App);
  function enterCombatStability108(){
    if(local.stability.active)return;
    local.stability.generation=Math.max(0,num(local.stability.generation,0))+1;
    // Rehydrate App.state from the dedicated local store before any render or WC
    // source refresh. App.state itself deliberately does not persist combat data.
    if(local.loaded&&local.store)applyStore(clone(local.store));
    local.stability.active=true;local.stability.enteredAt=Date.now();local.stability.remotePending=false;local.combatProfileHashesV120.clear();document.body.classList.add('combat-stability-v108');
    try{Sync?.stopPolling?.();if(Sync?._pendingWorldSnapshotPullV1015){clearTimeout(Sync._pendingWorldSnapshotPullV1015);Sync._pendingWorldSnapshotPullV1015=null;}if(Sync?._worldSnapshotRealtimeUnsubV1015){Sync._worldSnapshotRealtimeUnsubV1015();Sync._worldSnapshotRealtimeUnsubV1015=null;}}catch{}
    try{PlayerSync?.stopPolling?.();}catch{}try{ChatSync?.stopPolling?.();ChatSync?.stopRealtimeBridge?.();}catch{}try{Combat.stopRuntimeSync?.();}catch{}
  }
  async function exitCombatStability108(){
    if(!local.stability.active)return;
    const generation=local.stability.generation;
    clearTimeout(local.saveTimer);local.saveTimer=0;
    const sessionStore=clone(collectStoreFromRuntime());
    local.stability.active=false;document.body.classList.remove('combat-stability-v108');clearTimeout(local.stability.localPersistTimer);local.stability.localPersistTimer=0;
    try{await saveStoreNow();}catch{}
    // A quick reopen starts a newer generation. The stale close task may finish its
    // disk write, but it must not restart sync or replace the newly opened runtime.
    if(local.stability.active||local.stability.generation!==generation)return;
    try{Sync?.initWorldSnapshotRealtimeBridgeV1015?.();if(Sync?.config?.enabled)Sync?.startPolling?.();}catch{}
    try{if(Sync?.config?.enabled)PlayerSync?.startPolling?.();}catch{}try{if(Sync?.config?.enabled)ChatSync?.startPolling?.();}catch{}
    try{
      if(local.stability.dirtyProfiles){local.stability.dirtyProfiles=false;await App.saveState?.('Боевой сеанс завершён: изменения применены пакетом');}
      else if(local.stability.remotePending&&syncCheckBefore108)await syncCheckBefore108('combat-session-exit',{applyIfNewer:true,silent:true});
    }catch(error){console.error('COMBAT_STABILITY_FLUSH_FAILED',error);}
    if(local.stability.active||local.stability.generation!==generation){
      if(local.store)applyStore(clone(local.store));
      if(UI.activeModuleId==='combat'){refreshRuntimeSources122(Combat.getSceneIdForView?.());Combat.render?.();}
      return;
    }
    if(!local.stability.active&&local.stability.generation===generation)applyStore(sessionStore);
    local.stability.remotePending=false;
  }
  if(syncStartPollingBefore108)Sync.startPolling=function(...args){if(local.stability.active)return;return syncStartPollingBefore108(...args);};
  if(playerStartPollingBefore108)PlayerSync.startPolling=function(...args){if(local.stability.active)return;return playerStartPollingBefore108(...args);};
  if(chatStartPollingBefore108)ChatSync.startPolling=function(...args){if(local.stability.active)return;return chatStartPollingBefore108(...args);};
  if(chatRealtimeBefore108)ChatSync.initRealtimeBridge=function(...args){if(local.stability.active)return;return chatRealtimeBefore108(...args);};
  if(worldScheduleBefore108)Sync.scheduleWorldSnapshotPullV1015=function(reason='world-snapshot-event',delayMs=350){if(local.stability.active){local.stability.remotePending=true;return;}return worldScheduleBefore108(reason,delayMs);};
  if(syncCheckBefore108)Sync.checkForRemoteUpdates=async function(reason='manual',options={}){if(local.stability.active){local.stability.remotePending=true;return {ok:true,status:'deferred-combat-session'};}return syncCheckBefore108(reason,options);};
  if(syncPushBefore108)Sync.pushCurrentSnapshot=async function(reason='manual',options={}){if(local.stability.active){local.stability.dirtyProfiles=true;return {ok:true,status:'deferred-combat-session'};}return syncPushBefore108(reason,options);};
  if(playerPullBefore108)PlayerSync.pullUpdates=async function(reason='manual',options={}){if(local.stability.active){local.stability.remotePending=true;return {ok:true,status:'deferred-combat-session',rows:[]};}return playerPullBefore108(reason,options);};
  if(appSaveBefore108)App.saveState=async function(notice='Данные сохранены'){if(!local.stability.active)return appSaveBefore108(notice);local.stability.dirtyProfiles=true;try{if(this.saveStateLocalOnly)return await this.saveStateLocalOnly(notice,{silentToast:true});await Persistence?.save?.(this.state);}catch(error){console.error('COMBAT_LOCAL_SAVE_FAILED',error);return {ok:false,status:'local-save-failed',message:error?.message||String(error)};}return {ok:true,status:'deferred-combat-session',localOnly:true};};

  // New module is DM-only; leaving it always closes the player display.
  async function closeDisplayQuiet104(){try{await window.electronAPI?.closePlayerDisplay?.();Combat.displayWindowOpen=false;}catch{}}
  const openModuleBefore104=UI.openModule.bind(UI);
  UI.openModule=function(id,options={}){if(id==='combat'&&!Combat.isDm()){Toast.show('Сцены доступны только ДМу','info');return;}const leaving=this.activeModuleId==='combat'&&id!=='combat';if(leaving){if(local.lua119.pointPicker)cancelAbilityPoint125();closeDisplayQuiet104();void exitCombatStability108();}const result=openModuleBefore104(id,options);if(id==='combat'&&this.activeModuleId==='combat'){enterCombatStability108();refreshRuntimeSources122(Combat.getSceneIdForView?.());Combat.render?.();}return result;};
  const closeModuleBefore104=UI.closeModule.bind(UI);
  UI.closeModule=function(...args){const wasCombat=this.activeModuleId==='combat';if(wasCombat&&local.lua119.pointPicker)cancelAbilityPoint125();const result=closeModuleBefore104(...args);if(wasCombat){local.preview=null;closeDisplayQuiet104();audioApi()?.stopAll?.();void exitCombatStability108();}return result;};
  const updateBootBefore104=App.updateBootView.bind(App);
  App.updateBootView=function(){const result=updateBootBefore104();ensureCombatModuleMarkup();const button=document.getElementById('open-combat');if(button){button.style.display=Combat.isDm()?'grid':'none';button.dataset.label='СЦЕНЫ';}return result;};
  window.addEventListener('focus',()=>{if(UI.activeModuleId==='combat')Combat.refreshPlayerDisplayStatus?.().catch?.(()=>{});});
  window.addEventListener('beforeunload',()=>{try{window.electronAPI?.closePlayerDisplay?.();}catch{}try{collectStoreFromRuntime();window.electronAPI?.saveLocalCombatScenes?.(local.store);}catch{}});

  const initBefore104=App.init.bind(App);
  App.init=async function(){const result=await initBefore104();await loadLocalStore();ensureCombatModuleMarkup();const button=document.getElementById('open-combat');if(button){button.style.display=Combat.isDm()?'grid':'none';button.dataset.label='СЦЕНЫ';}return result;};
  const finishLoginBefore104=App.finishLogin.bind(App);
  App.finishLogin=function(){const result=finishLoginBefore104();ensureCombatModuleMarkup();const button=document.getElementById('open-combat');if(button){button.style.display=Combat.isDm()?'grid':'none';button.dataset.label='СЦЕНЫ';}return result;};
  const logoutBefore104=App.logout.bind(App);
  App.logout=function(){closeDisplayQuiet104();return logoutBefore104();};

  document.addEventListener('dragstart',event=>{
    const item=event.target.closest?.('[data-scene-drag-v104]');if(!item)return;const payload={kind:item.dataset.sceneDragV104,libraryId:item.dataset.sceneLibraryIdV104||'',entityId:item.dataset.sceneEntityIdV104||'',shape:item.dataset.sceneZoneShapeV104||''};const raw=JSON.stringify(payload);event.dataTransfer?.setData('application/x-grpgi-scene',raw);event.dataTransfer?.setData('text/plain',`GRPGI_SCENE:${raw}`);event.dataTransfer.effectAllowed='copy';
  });
  document.addEventListener('dragover',event=>{if(event.target.closest?.('#combat-stage')){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';}});
  document.addEventListener('drop',event=>{const stage=event.target.closest?.('#combat-stage');if(!stage)return;event.preventDefault();let payload=null;try{let raw=event.dataTransfer?.getData('application/x-grpgi-scene')||event.dataTransfer?.getData('text/plain')||'';if(raw.startsWith('GRPGI_SCENE:'))raw=raw.slice(12);payload=JSON.parse(raw||'{}');}catch{return;}const scene=Combat.getScene();if(!scene)return;const p=scenePointFromEvent(event,stage,scene);if(payload.kind==='asset')placeLibraryAsset104(payload.libraryId,p);if(['player','npc','equipment-unit'].includes(payload.kind))placeUnit104(payload.kind,payload.entityId,p);if(payload.kind==='zone')placeZone104(payload.shape,p);});
  document.addEventListener('pointerdown',startBoardPointer104,true);
  document.addEventListener('pointermove',moveBoardPointer104,true);
  document.addEventListener('pointerup',endBoardPointer104,true);
  document.addEventListener('pointercancel',endBoardPointer104,true);
  document.addEventListener('contextmenu',contextMenu104,true);
  document.addEventListener('click',event=>{
    const openButton=event.target.closest?.('#open-combat');
    if(openButton){event.preventDefault();event.stopImmediatePropagation?.();if(Combat.isDm())UI.openModule('combat');else Toast.show('Сцены доступны только ДМу','info');return;}
    const t=event.target.closest?.('#mod-combat [data-scene-search-v118],#mod-combat button,#mod-combat [data-scene-select-v104],.scene-context-v104 button');
    if(!t){if(local.context&&!event.target.closest('.scene-context-v104'))closeContext104();return;}
    if(t.id==='scene-new-v104'){event.preventDefault();addScene104();return;}
    if(t.dataset.sceneSelectV104){event.preventDefault();Combat.selectedSceneId=t.dataset.sceneSelectV104;Combat.selectedObject=null;local.preview=null;refreshRuntimeSources122(Combat.selectedSceneId);queueStoreSave();Combat.render();return;}
    if(t.dataset.scenePaletteV104){local.ui.palette=t.dataset.scenePaletteV104;Combat.render();return;}
    if(t.dataset.scenePlaceV105){event.preventDefault();event.stopPropagation();local.ui.pendingPlacement={kind:t.dataset.scenePlaceV105,libraryId:t.dataset.sceneLibraryIdV104||'',entityId:t.dataset.sceneEntityIdV104||'',shape:t.dataset.sceneZoneShapeV104||''};Toast.show('Кликни по карте, чтобы разместить объект','info');return;}
    if(t.id==='scene-import-asset-v104'){importAsset104();return;}
    if(t.id==='scene-add-asset-category-v104'){const input=document.getElementById('scene-new-asset-category-v104'),v=String(input?.value||'').trim();if(v&&!local.store.assetCategories.includes(v)){local.store.assetCategories.push(v);local.ui.assetCategory=v;queueStoreSave();Combat.render();}return;}
    if(t.dataset.sceneDeleteLibraryAssetV144){event.preventDefault();event.stopPropagation();const id=t.dataset.sceneDeleteLibraryAssetV144;const asset=local.store.assetLibrary.find(row=>row.id===id);if(asset&&confirm(`Удалить ассет «${asset.name}» из библиотеки?`)){local.store.assetLibrary=local.store.assetLibrary.filter(row=>row.id!==id);if(local.ui.pendingPlacement?.libraryId===id)local.ui.pendingPlacement=null;queueStoreSave();Combat.render();}return;}
    if(t.dataset.sceneFavoriteV104){const a=local.store.assetLibrary.find(x=>x.id===t.dataset.sceneFavoriteV104);if(a){a.favorite=!a.favorite;queueStoreSave();Combat.render();}return;}
    if(t.hasAttribute('data-scene-reload-v118')){event.preventDefault();reloadWeapon118();return;}
    if(t.hasAttribute('data-scene-posture-v128')){event.preventDefault();void togglePosture128();return;}
    if(t.hasAttribute('data-scene-disengage-v122')){event.preventDefault();void disengage122();return;}
    if(t.hasAttribute('data-scene-burst-finish-v122')){event.preventDefault();void finishBurst122();return;}
    if(t.hasAttribute('data-scene-clear-malfunction-v122')){event.preventDefault();void clearMalfunction122();return;}
    if(t.dataset.sceneSkillV118){event.preventDefault();useActiveSkill118(t.dataset.sceneSkillV118);return;}
    if(t.dataset.sceneEquipmentUseV129){event.preventDefault();void useActiveEquipment129(t.dataset.sceneEquipmentUseV129);return;}
    if(t.dataset.sceneDeployV129){event.preventDefault();void beginDeployDevice129(t.dataset.sceneDeployV129);return;}
    if(t.hasAttribute('data-scene-command-drone-v129')){event.preventDefault();void commandDrone129();return;}
    if(t.hasAttribute('data-scene-clear-injuries-v129')){event.preventDefault();const token=selectedToken104();if(token){token.injuriesV129=[];token.reactionUsedV119=false;queueStoreSave();Combat.render();broadcastScene104();}return;}
    if(t.dataset.sceneSearchV118){event.preventDefault();searchNpc118(t.dataset.sceneSearchV118);return;}
    if(t.hasAttribute('data-scene-loot-close-v118')){event.preventDefault();closeLootOverlay118();return;}
    if(t.dataset.sceneActionV104){const action=t.dataset.sceneActionV104;local.ui.pendingPlacement=null;if(action==='clear'){local.preview=null;refreshPreviewDom104();return;}if(['move','attack','grenade'].includes(action)){const current=Combat.getCurrentTurnToken?.();const selected=selectedToken104();if(current&&selected?.id!==current.id&&!activeDroneCommand129(selected))Combat.selectedObject={kind:'token',id:current.id};}local.ui.action=action;Combat.render();return;}
    if(t.id==='scene-initiative-toggle-v112'){local.ui.initiativeOpen=!local.ui.initiativeOpen;Combat.render();return;}
    if(t.id==='scene-next-turn-v104'){void Combat.nextTurn?.();return;}
    if(t.id==='scene-center-v108'){Combat.resetViewState?.(Combat.getSceneIdForView?.(),{persist:true,render:false});return;}
    if(t.id==='scene-sounds-toggle-v104'){local.ui.soundsOpen=!local.ui.soundsOpen;Combat.render();return;}
    if(t.id==='scene-ambient-stop-v104'){audioApi()?.stopAmbient?.(Combat.getScene()?.id);Combat.render();return;}
    if(t.id==='scene-display-v104'){Combat.displayWindowOpen?Combat.closePlayerDisplay():Combat.openPlayerDisplay();return;}
    if(t.id==='scene-export-v104'){exportArchive104();return;}
    if(t.id==='scene-import-v104'){importArchive104();return;}
    if(t.id==='scene-background-v104'){requestLocalImage104(`scene_${Combat.getScene()?.id||'background'}`).then(image=>{if(image){Combat.getScene().backgroundImage=image;queueStoreSave();Combat.render();broadcastScene104();}});return;}
    if(t.id==='scene-background-clear-v104'){Combat.getScene().backgroundImage='';queueStoreSave();Combat.render();broadcastScene104();return;}
    if(t.id==='scene-duplicate-v104'){duplicateScene104(Combat.getScene()?.id);return;}
    if(t.id==='scene-delete-v104'){deleteScene104(Combat.getScene()?.id);return;}
    if(t.id==='scene-save-template-v104'){saveAssetTemplate104();return;}
    if(t.dataset.sceneDeleteObjectV104){deleteSelected104();return;}
    if(t.dataset.sceneSoundSectionDeleteV144){audioApi()?.deleteSection?.(t.dataset.sceneSoundSectionDeleteV144);Combat.render();return;}
    if(t.id==='scene-sound-add-section-v104'){const input=document.getElementById('scene-sound-new-section-v104');audioApi()?.addSection?.(input?.value||'');return;}
    if(t.id==='scene-stop-all-v104'){audioApi()?.stopAll?.();return;}
    if(t.dataset.sceneSoundAddV104){audioApi()?.addSound?.(t.dataset.sceneSoundAddV104);return;}
    if(t.dataset.sceneSoundRandomV104){audioApi()?.playRandom?.(t.dataset.sceneSoundRandomV104);return;}
    if(t.dataset.sceneSoundPlayV104){audioApi()?.play?.(t.dataset.sceneSoundPlayV104);return;}
    if(t.dataset.sceneSoundStopV104){audioApi()?.stopSound?.(t.dataset.sceneSoundStopV104);return;}
    if(t.dataset.sceneSoundAmbientV104){audioApi()?.setAmbient?.(Combat.getScene()?.id,t.dataset.sceneSoundAmbientV104);return;}
    if(t.dataset.sceneSectionAmbientV107){audioApi()?.setSectionAmbient?.(Combat.getScene()?.id,t.dataset.sceneSectionAmbientV107,t.dataset.sceneSectionModeV107||'sequential');return;}
    if(t.dataset.sceneSoundDeleteV104){const [sectionId,soundId]=String(t.dataset.sceneSoundDeleteV104).split(':');audioApi()?.deleteSound?.(sectionId,soundId);return;}
    if(t.dataset.contextToggleV104){const sel=selectedObject104();if(sel){sel.obj[t.dataset.contextToggleV104]=!sel.obj[t.dataset.contextToggleV104];queueStoreSave();closeContext104();Combat.render();broadcastScene104();}return;}
    if(t.dataset.contextDeleteV104){closeContext104();deleteSelected104();return;}
  },true);
  document.addEventListener('change',event=>{
    const t=event.target;
    if(t.dataset.sceneSoundSectionRenameV144){const api=audioApi();if(!api?.renameSection?.(t.dataset.sceneSoundSectionRenameV144,t.value))t.value=api?.findSection(t.dataset.sceneSoundSectionRenameV144)?.name||'';Combat.render();return;}
    if(t.id==='scene-category-filter-v104'){local.ui.sceneCategory=t.value;Combat.render();return;}
    if(t.id==='scene-asset-category-v104'){local.ui.assetCategory=t.value;Combat.render();return;}
    if(t.id==='scene-ambient-v104'){const api=audioApi(),sid=Combat.getScene()?.id,value=String(t.value||'');if(!value)api?.stopAmbient?.(sid);else if(value.startsWith('sound:'))api?.setAmbient?.(sid,value.slice(6));else if(value.startsWith('section:')){const parts=value.split(':');api?.setSectionAmbient?.(sid,parts[1],parts[2]||'sequential');}return;}
    if(t.id==='scene-fog-mode-top-v112'){const scene=Combat.getScene();if(scene){scene.fogMode=['off','cover','objects'].includes(t.value)?t.value:'cover';scene.fogEnabled=scene.fogMode!=='off';queueStoreSave();Combat.render();broadcastScene104();}return;}
    if(t.id==='scene-show-initiative-top-v112'){const scene=Combat.getScene();if(scene){scene.showInitiativeToPlayers=t.checked;queueStoreSave();broadcastScene104();}return;}
    if(t.id==='scene-weapon-v105'){const token=selectedToken104();if(token){token.weaponId=String(t.value||'');queueStoreSave();Combat.render();broadcastScene104();}return;}
    if(t.id==='scene-grenade-v105'){const token=selectedToken104();if(token){token.grenadeId=String(t.value||'');queueStoreSave();Combat.render();}return;}
    if(t.matches?.('[data-context-hp-v104],[data-context-hpmax-v104],[data-context-init-v104]')){const sel=selectedObject104();if(sel?.kind==='token'){const menu=t.closest('.scene-context-v104');sel.obj.hpMax=Math.max(1,num(menu.querySelector('[data-context-hpmax-v104]')?.value,sel.obj.hpMax));sel.obj.hpCurrent=clamp104(menu.querySelector('[data-context-hp-v104]')?.value,0,sel.obj.hpMax);sel.obj.initiative=num(menu.querySelector('[data-context-init-v104]')?.value,sel.obj.initiative);Combat.syncInitiative(Combat.getScene()?.id,false);if(sel.obj.playerId){updatePlayerHp105(sel.obj);void persistCombatProfiles105('Сцена: ручное изменение HP',{immediate:true});}queueStoreSave();broadcastScene104();}return;}
  },true);
  document.addEventListener('input',event=>{if(event.target.id==='scene-sound-search-v104'){local.ui.soundSearch=event.target.value;clearTimeout(local._soundTimer);local._soundTimer=setTimeout(()=>Combat.render(),120);}if(event.target.id==='scene-unit-search-v104'){local.ui.unitSearch=event.target.value;clearTimeout(local._unitTimer);local._unitTimer=setTimeout(()=>Combat.render(),120);}});
  document.addEventListener('submit',event=>{if(event.target.id==='scene-properties-form-v104'){event.preventDefault();applySceneForm104(event.target);return;}if(event.target.matches?.('[data-object-form-v104]')){event.preventDefault();applyObjectForm104(event.target);}},true);
  document.addEventListener('wheel',event=>{const viewport=event.target.closest?.('#combat-stage-viewport');if(viewport){Combat.handleViewWheel?.(event,viewport);}}, {passive:false,capture:true});
  document.addEventListener('pointerdown',event=>{if(local.context&&!event.target.closest('.scene-context-v104'))closeContext104();},true);
  window.addEventListener('keydown',event=>{if(UI.activeModuleId==='combat'&&['Delete','Backspace'].includes(event.key)&&!event.target.closest?.('input,textarea,select,[contenteditable]')&&selectedObject104()?.kind==='asset'){event.preventDefault();deleteSelected104();return;}if(event.code==='Escape'&&local.lua119.pointPicker){event.preventDefault();cancelAbilityPoint125();return;}if(event.code==='Space'&&UI.activeModuleId==='combat'&&!event.repeat){local.spaceDown=true;document.getElementById('combat-stage-viewport')?.classList.add('space-pan-v105');event.preventDefault();}});
  window.addEventListener('keyup',event=>{if(event.code==='Space'){local.spaceDown=false;document.getElementById('combat-stage-viewport')?.classList.remove('space-pan-v105');}});
})();

/* v1.0.110 packaged-media hardening */
(function(){
  const api=window.CombatAudioV37;
  if(!api||api.__mediaV110)return;
  api.__mediaV110=true;
  api.addSound=async function(sectionId){
    const section=this.findSection(sectionId); if(!section)return;
    try{
      if(!window.electronAPI?.chooseCombatMedia||!window.electronAPI?.saveCombatSoundFile){
        throw new Error('Локальное файловое API недоступно');
      }
      const picked=await window.electronAPI.chooseCombatMedia({kind:'audio'});
      if(picked?.canceled)return;
      const paths=Array.isArray(picked?.filePaths)?picked.filePaths:[];
      if(!paths.length)throw new Error(picked?.message||'Файлы не выбраны');
      let added=0;
      for(const filePath of paths){
        const base=(String(filePath).split(/[\\/]/).pop()||'sound');
        const stem=base.replace(/\.[^.]+$/,'')||'sound';
        const result=await window.electronAPI.saveCombatSoundFile({filePath,preferredStem:stem});
        if(!result?.ok)throw new Error(result?.message||`Не удалось скопировать ${base}`);
        const url=String(result.fileUrl||result.url||result.localUrl||'');
        if(!url)throw new Error(`Не создан локальный URL: ${base}`);
        section.sounds.push({id:`sound_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,name:stem,url,file:String(result.file||''),createdAt:new Date().toISOString()});
        added++;
      }
      this.save();
      if(window.UI?.activeModuleId==='combat')window.Combat?.render?.();
      window.Toast?.show?.(`Добавлено звуков: ${added}. Файлы скопированы в локальную папку приложения.`,'ok');
    }catch(error){
      console.error('COMBAT_SOUND_ADD_V110_FAILED',error);
      window.Toast?.show?.(`Ошибка добавления звука: ${error?.message||error}`,'err');
    }
  };

  api.migrateLegacyMediaV110=async function(){
    if(this.state?.mediaSchema===110)return;
    let changed=false;
    for(const section of (this.sections||[])){
      for(const sound of (section.sounds||[])){
        const current=String(sound.url||'');
        if(current.startsWith('file://'))continue;
        const source=String(sound.file||'');
        if(!source||!window.electronAPI?.saveCombatSoundFile)continue;
        try{
          const result=await window.electronAPI.saveCombatSoundFile({filePath:source,preferredStem:sound.name||'legacy_sound'});
          if(result?.ok&&(result.fileUrl||result.url)){
            sound.file=String(result.file||'');
            sound.url=String(result.fileUrl||result.url||result.localUrl||'');
            changed=true;
          }
        }catch{}
      }
    }
    this.state.mediaSchema=110;
    if(changed||this.state.mediaSchema!==110)this.save(); else this.save();
  };
  void api.migrateLegacyMediaV110();
})();
