/* v1.0.109 — hex-native tactical Scene Editor */
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
    ui: { palette: 'assets', assetCategory: 'all', sceneCategory: 'all', soundsOpen: false, soundSearch: '', unitSearch: '', action: 'select', pendingPlacement: null },
    draw: null,
    spaceDown: false,
    preview: null,
    context: null,
    broadcastRaf: 0,
    cameraRuntime: Object.create(null),
    stability: { active:false, dirtyProfiles:false, remotePending:false, localPersistTimer:0, enteredAt:0 }
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

  function blankStore() {
    return { version: 2, cameraSchema: 109, rangeSchema: 109, scenes: {}, runtimes: {}, cameraByScene: {}, categories: ['Общее'], assetCategories: ['Общее'], assetLibrary: [], selectedSceneId: '', legacyImportedAt: null, updatedAt: null };
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
      blockSight: Boolean(item.blockSight),
      visibleToPlayers: item.visibleToPlayers !== false,
      opacity: clamp104(item.opacity ?? 1, .05, 1)
    };
  }

  // Extend legacy normalizers without deleting old fields.
  const normalizeSceneBefore104 = normalizeCombatScene;
  normalizeCombatScene = function(scene = {}) {
    const next = normalizeSceneBefore104(scene);
    next.category = String(scene.category || next.category || 'Общее').trim() || 'Общее';
    next.parentId = String(scene.parentId || next.parentId || '').trim();
    next.scalePerHex = clamp104(scene.scalePerHex ?? next.scalePerHex ?? 1, .01, 100000);
    next.scaleLabel = String(scene.scaleLabel || next.scaleLabel || 'м').trim() || 'м';
    next.assets = list(scene.assets || next.assets).map(normalizeCombatAsset);
    next.templates = list(scene.templates || next.templates).map(normalizeCombatTemplate);
    return next;
  };
  const normalizeAssetBefore104 = normalizeCombatAsset;
  normalizeCombatAsset = function(asset = {}) {
    const next = normalizeAssetBefore104(asset);
    next.blockMovement = Boolean(asset.blockMovement);
    next.visibleToPlayers = asset.visibleToPlayers !== false;
    next.libraryId = String(asset.libraryId || '');
    return next;
  };
  const normalizeTokenBefore104 = normalizeCombatToken;
  normalizeCombatToken = function(token = {}) {
    const next = normalizeTokenBefore104(token);
    next.visibleToPlayers = token.visibleToPlayers !== false;
    next.sharesVisionWithPlayers = token.sharesVisionWithPlayers == null ? Boolean(token.playerId) : Boolean(token.sharesVisionWithPlayers);
    next.visionRange = Math.max(0, num(token.visionRange, 0));
    next.moveRange = Math.max(0, num(token.moveRange, 0));
    next.attackRange = Math.max(0, num(token.attackRange, 0));
    next.movedThisTurn = Math.max(0, num(token.movedThisTurn, 0));
    next.actionUsed = Boolean(token.actionUsed);
    next.blockMovement = Boolean(token.blockMovement);
    next.blockSight = Boolean(token.blockSight);
    next.armorClass = Math.max(0, num(token.armorClass, 0));
    next.weaponId = String(token.weaponId || next.weaponId || '');
    next.grenadeId = String(token.grenadeId || '');
    next.equipmentItemId = String(token.equipmentItemId || '');
    next.equipmentType = String(token.equipmentType || '');
    return next;
  };
  const normalizeTemplateBefore104 = normalizeCombatTemplate;
  normalizeCombatTemplate = function(template = {}) {
    const next = normalizeTemplateBefore104(template);
    next.blockMovement = Boolean(template.blockMovement);
    next.visibleToPlayers = template.visibleToPlayers !== false;
    next.points = list(template.points).map(p => ({ x: num(p?.x), y: num(p?.y) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    next.thickness = clamp104(template.thickness || .18, .04, 4);
    if (['wall','polygon'].includes(String(template.shape || ''))) next.shape = String(template.shape);
    next.closed = template.closed !== false;
    return next;
  };

  function collectStoreFromRuntime() {
    if (!local.store) local.store = blankStore();
    local.store.scenes = Object.fromEntries(Object.entries(COMBAT_SCENES || {}).map(([id, scene]) => [id, normalizeCombatScene(scene)]));
    const combat = ensureCombatState();
    local.store.runtimes = clone(combat.scenes || {});
    local.store.cameraByScene = clone(local.cameraRuntime || local.store.cameraByScene || {});
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
    if (local.loaded) return local.store;
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
    const payload = collectStoreFromRuntime();
    try {
      if (window.electronAPI?.saveLocalCombatScenes) return await window.electronAPI.saveLocalCombatScenes(payload);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
      return { ok: true, fallback: true };
    } catch (error) {
      console.error('SCENE_LOCAL_SAVE_FAILED', error);
      return { ok: false, message: error?.message || String(error) };
    }
  }
  function queueStoreSave() {
    clearTimeout(local.saveTimer);
    local.saveTimer = setTimeout(() => { local.saveTimer = 0; saveStoreNow(); }, SAVE_DELAY);
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
    const safePayload = payload && typeof payload === 'object' ? { ...payload } : {};
    // On the first launch allow legacy scenes to load so they can be migrated into the PC-only store.
    // Once the local store exists, all later world/cloud refreshes are prevented from touching scenes.
    if (local.loaded) delete safePayload.combatScenes;
    const result = applyWorldBefore104(safePayload);
    if (local.loaded && local.store) applyStore(local.store);
    return result;
  };
  const syncApplyBefore104 = Sync.applyRemoteSnapshot.bind(Sync);
  Sync.applyRemoteSnapshot = async function(payload, remoteMeta = {}, options = {}) {
    if(local.stability?.active){local.stability.remotePending=true;return {ok:true,status:'deferred-combat-session'};}
    const result = await syncApplyBefore104(payload, remoteMeta, options);
    if (local.loaded && local.store) applyStore(local.store);
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
  Combat.nextTurn = function() {
    const runtime = this.getRuntime();
    if (!runtime || !runtime.initiativeOrder?.length) return;
    runtime.turnIndex = Math.max(0, num(runtime.turnIndex)) + 1;
    if (runtime.turnIndex >= runtime.initiativeOrder.length) { runtime.turnIndex = 0; runtime.round = Math.max(1, num(runtime.round, 1)) + 1; }
    const current = this.getCurrentTurnToken?.();
    if (current) { current.movedThisTurn = 0; current.actionUsed = false; }
    queueStoreSave(); this.render(); broadcastScene104();
  };

  // v1.0.109: preserve token object identity. Legacy ensureCombatRuntime() re-normalized by replacing
  // runtime.tokens on every read, which detached references during canAct/canMove checks.
  const getRuntimeBefore109 = Combat.getRuntime.bind(Combat);
  Combat.getRuntime = function(sceneId = this.getSceneIdForView()) {
    const id=String(sceneId||'').trim(); if(!id)return null;
    const combat=ensureCombatState();
    if(!combat.scenes[id]) getRuntimeBefore109(id);
    const runtime=combat.scenes[id];
    if(!runtime)return null;
    if(!Array.isArray(runtime.tokens))runtime.tokens=[];
    runtime.tokens.forEach((token,index)=>{
      if(!token||typeof token!=='object'){runtime.tokens[index]=normalizeCombatToken(token||{});return;}
      const normalized=normalizeCombatToken(token);
      Object.assign(token,normalized);
    });
    if(!Array.isArray(runtime.initiativeOrder))runtime.initiativeOrder=[];
    runtime.initiativeOrder=runtime.initiativeOrder.map(String);
    runtime.turnIndex=Math.max(0,num(runtime.turnIndex,0));
    runtime.round=Math.max(1,num(runtime.round,1));
    if(!Array.isArray(runtime.log))runtime.log=[];
    return runtime;
  };

  Combat.syncInitiative = function(sceneId=this.getSceneIdForView(),resetTurn=false){
    const runtime=this.getRuntime(sceneId);if(!runtime)return;
    // Never replace runtime.tokens here: active combat actions keep references to these exact objects.
    runtime.tokens.forEach(token=>Object.assign(token,normalizeCombatToken(token)));
    const currentId=!resetTurn?String(runtime.initiativeOrder?.[Math.max(0,num(runtime.turnIndex,0))]||''):'';
    runtime.initiativeOrder=runtime.tokens.slice().sort((a,b)=>(num(b.initiative)-num(a.initiative))||String(a.name||'').localeCompare(String(b.name||''),'ru')).map(token=>token.id);
    if(resetTurn){runtime.turnIndex=0;runtime.round=1;}else if(currentId&&runtime.initiativeOrder.includes(currentId))runtime.turnIndex=runtime.initiativeOrder.indexOf(currentId);else runtime.turnIndex=clamp104(runtime.turnIndex,0,Math.max(0,runtime.initiativeOrder.length-1));
  };

  // World Config: canonical scene ranges are stored on characters/NPCs and remain cloud-synced with the character itself.
  function combatConfig(entity = {}) {
    return {
      visionRange: Math.max(0, num(entity?.combat?.visionRange, 6)),
      moveRange: Math.max(0, num(entity?.combat?.moveRange, 6))
    };
  }
  function sceneConfigFields(entity = {}) {
    const c = combatConfig(entity);
    return `<div class="section-title">Параметры сцены</div><div class="cols2">
      <div class="field"><label>Дальность видимости</label><input class="input" type="number" min="0" step="1" name="combatVisionRange" value="${c.visionRange}" /><div class="small-note">В гексах.</div></div>
      <div class="field"><label>Дальность движения за ход</label><input class="input" type="number" min="0" step="1" name="combatMoveRange" value="${c.moveRange}" /><div class="small-note">В гексах.</div></div>
    </div>`;
  }
  const collectEntityBefore104 = Configurator.collectEntity.bind(Configurator);
  Configurator.collectEntity = function(type, formEl, formData = new FormData(formEl)) {
    const entity = collectEntityBefore104(type, formEl, formData);
    if ((type === 'players' || type === 'npcs') && entity) {
      entity.combat = { ...(entity.combat || {}), visionRange: Math.max(0, num(formData.get('combatVisionRange'), 6)), moveRange: Math.max(0, num(formData.get('combatMoveRange'), 6)) };
    }
    return entity;
  };
  const renderNpcBefore104 = Configurator.renderNpcEditorV60?.bind(Configurator);
  if (renderNpcBefore104) Configurator.renderNpcEditorV60 = function(entity) {
    const markup = renderNpcBefore104(entity);
    const fields = sceneConfigFields(entity);
    return markup.replace('<button class="primary" type="submit">SAVE_NPC</button>', `${fields}<button class="primary" type="submit">SAVE_NPC</button>`);
  };
  const renderPlayerBefore104 = Configurator.renderPlayerEditor.bind(Configurator);
  Configurator.renderPlayerEditor = function(entity) {
    const markup = renderPlayerBefore104(entity);
    if (markup.includes('name="combatVisionRange"')) return markup;
    const fields = sceneConfigFields(entity);
    return markup.replace(/<button class="primary" type="submit">[^<]*SAVE_PLAYER[^<]*<\/button>/, match => fields + match);
  };

  function equipmentItem105(id) { return id ? normalizeEquipmentItemV2(Data.getItem?.(id) || EQUIPMENT?.[id] || {}) : null; }
  function tokenDefense105(token) {
    if (!token) return 10;
    if (num(token.armorClass, 0) > 0) return num(token.armorClass, 10);
    if (token.equipmentItemId) {
      const item = equipmentItem105(token.equipmentItemId);
      if (num(item?.unitArmorClass, 0) > 0) return num(item.unitArmorClass, 10);
    }
    const entity = entityForToken(token);
    if (token.playerId && entity) {
      const user = normalizePlayerProfileV2(entity);
      return Math.max(0, num(user.stats?.armorClass || user.stats?.baseArmorClass, 10));
    }
    return Math.max(0, num(entity?.armorClass || entity?.stats?.armorClass || entity?.defense, 10));
  }
  function entityForToken(token) {
    if (token?.playerId) return App.state?.users?.[token.playerId] || PLAYER_TEMPLATES?.[token.playerId] || null;
    if (token?.npcId) return Data.getNpc?.(token.npcId) || null;
    if (token?.equipmentItemId) return equipmentItem105(token.equipmentItemId);
    return null;
  }
  function inventoryQty105(entity, itemId) { const row=list(entity?.inventory).find(v=>String(v?.itemId||'')===String(itemId||'')); return Math.max(0,Math.trunc(num(row?.qty,0))); }
  function ownedItems105(token, type) {
    const entity=entityForToken(token); const rows=[]; const seen=new Set();
    for(const entry of list(entity?.inventory)){const item=equipmentItem105(entry?.itemId);if(!item||item.type!==type||num(entry.qty,0)<=0||seen.has(item.id))continue;seen.add(item.id);rows.push({...item,ownedQty:Math.max(0,Math.trunc(num(entry.qty,0)))});}
    if(type==='weapon'&&token?.playerId){const slots=entity?.equipmentSlots||{};for(const id of [slots.primaryWeapon||slots.weapon,slots.secondaryWeapon]){const item=equipmentItem105(id);if(item?.type==='weapon'&&!seen.has(item.id)){seen.add(item.id);rows.push({...item,ownedQty:Math.max(1,inventoryQty105(entity,item.id))});}}}
    if(type==='weapon'&&!token?.playerId&&!rows.length&&token?.weaponId){const item=equipmentItem105(token.weaponId);if(item?.type==='weapon')rows.push({...item,ownedQty:1});}
    return rows;
  }
  function weaponForToken105(token) {
    if(!token)return null;
    if(token.equipmentItemId && ['turret','drone'].includes(String(token.equipmentType||equipmentItem105(token.equipmentItemId)?.type||''))){const item=equipmentItem105(token.equipmentItemId);if(item)return item;}
    const weapons=ownedItems105(token,'weapon');
    let weapon=weapons.find(w=>w.id===token.weaponId)||weapons[0]||null;
    if(!weapon&&!token.playerId&&token.weaponId)weapon=equipmentItem105(token.weaponId);
    return weapon;
  }
  function grenadeForToken105(token) { const grenades=ownedItems105(token,'grenade'); return grenades.find(g=>g.id===token?.grenadeId)||grenades[0]||null; }
  function scalePerHex(scene) { return Math.max(.01, num(scene?.scalePerHex, 1)); }
  // v1.0.109: all tactical ranges are stored and interpreted as whole/decimal HEX COUNTS.
  // scalePerHex remains presentation metadata (for example 1 hex = 5 m) and never multiplies movement/range limits.
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
    if (num(token?.moveRange, 0) > 0) return Math.max(0, num(token.moveRange));
    if (token?.equipmentItemId && ['turret','drone'].includes(String(token.equipmentType || equipmentItem105(token.equipmentItemId)?.type || ''))) {
      return Math.max(0, num(equipmentItem105(token.equipmentItemId)?.unitMoveRange, 0));
    }
    const wc = combatConfig(entityForToken(token) || {});
    return Math.max(0, wc.moveRange || DEFAULT_MOVE_WORLD);
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
  function movementBlockedAt(scene, x, y, ignoreTokenId = '', clearance = 0) {
    const p={x,y}, pad=Math.max(0,num(clearance,0));
    for (const asset of list(scene.assets)) {
      if (!asset.blockMovement) continue;
      if (x >= asset.x-pad && x <= asset.x + asset.w+pad && y >= asset.y-pad && y <= asset.y + asset.h+pad) return true;
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
    for(const asset of list(scene.assets)){if(!asset.blockSight)continue;if(x>=num(asset.x)&&x<=num(asset.x)+num(asset.w,1)&&y>=num(asset.y)&&y<=num(asset.y)+num(asset.h,1))return true;}
    for(const zone of list(scene.templates)){if(!zone.blockSight)continue;if(zone.shape==='wall'&&zone.points?.length>1){for(let i=1;i<zone.points.length;i++)if(pointSegmentDistance(p,zone.points[i-1],zone.points[i])<=Math.max(.05,num(zone.thickness,.18)))return true;}else if(zone.shape==='polygon'&&zone.points?.length>2){if(pointInPolygon(p,zone.points))return true;}else if(x>=num(zone.x)&&x<=num(zone.x)+num(zone.w,1)&&y>=num(zone.y)&&y<=num(zone.y)+num(zone.h,1))return true;}
    for(const token of list(Combat.getRuntime(scene.id)?.tokens)){if(ignoreIds.has(token.id)||!token.blockSight)continue;if(x>=num(token.x)&&x<=num(token.x)+num(token.w,1)&&y>=num(token.y)&&y<=num(token.y)+num(token.h,1))return true;}
    return false;
  }
  function sightSegmentBlocked105(scene,a,b,ignoreIds=[]){const ids=new Set(ignoreIds);const length=dist(a,b),steps=Math.max(2,Math.ceil(length/.08));for(let i=1;i<steps;i++){const t=i/steps;if(sightBlockedAt105(scene,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,ids))return true;}return false;}

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
        const nk=key(n),tent=(score.get(ck)??Infinity)+1;if(tent>=(score.get(nk)??Infinity))continue;
        came.set(nk,ck);score.set(nk,tent);const heuristic=dist(n,g)/Math.max(.001,hexMetrics107().hexH);open.set(nk,{...n,f:tent+heuristic});
      }
    }
    return null;
  }
  function truncateHexPath108(path,maxCells){
    const maxSteps=Math.max(0,Math.floor(num(maxCells,0)+1e-6)),steps=Math.max(0,path.length-1),used=Math.min(steps,maxSteps),points=path.slice(0,used+1);
    return {points,steps:used,limited:steps>maxSteps,end:points[points.length-1]||path[0]};
  }
  function canMechanicalMove108(token){
    if(!token||token.locked||!Combat.isDm?.())return false;
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
    return `<button class="combat-object combat-token scene-token-v104 ${selected?'selected':''} ${currentId===token.id?'turn':''}" type="button" data-scene-kind-v104="token" data-scene-id-v104="${html(token.id)}" style="${objectStyle(token,scene,40)}--token-accent:${html(token.color||'#7df9ff')};">
      ${token.image?`<img src="${html(token.image)}" alt="" decoding="async" draggable="false"/>`:`<span class="combat-token-fallback">${html(fallback)}</span>`}<span class="combat-token-name">${html(token.name)}</span><span class="combat-token-hp"><i style="width:${hp}%"></i></span></button>`;
  }
  function assetMarkup(asset,scene){
    const selected=Combat.selectedObject?.kind==='asset'&&Combat.selectedObject?.id===asset.id;
    return `<button class="combat-object combat-asset scene-asset-v104 ${selected?'selected':''}" type="button" data-scene-kind-v104="asset" data-scene-id-v104="${html(asset.id)}" style="${objectStyle(asset,scene,10)}opacity:${clamp104(asset.opacity??1,.05,1)};">${asset.image?`<img src="${html(asset.image)}" alt="" draggable="false"/>`:`<span>◫</span>`}${asset.label?`<span class="combat-object-label">${html(asset.label)}</span>`:''}</button>`;
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
        <div class="combat-stage-layer combat-templates-layer">${list(scene.templates).map(z=>zoneMarkup(z,scene)).join('')}</div>
        <div class="combat-stage-layer combat-tokens-layer">${list(runtime.tokens).map(t=>tokenMarkup(t,scene,current?.id||'')).join('')}</div>
        <div class="scene-preview-layer-v104">${previewMarkup(scene)}</div>
      </div></div></div>
      <div class="scene-actionbar-v104">${actionButton('select','ВЫБОР')}${actionButton('pan','РУКА')}${actionButton('move','ДВИЖЕНИЕ')}${actionButton('attack','ВЫСТРЕЛ')}${actionButton('grenade','ГРАНАТА')}${actionButton('measure','ЛИНЕЙКА')}${actionButton('circle','КРУГ')}${actionButton('cone','КОНУС')}${actionButton('wall','СТЕНА')}${actionButton('area','ОБЛАСТЬ')}${renderActionEquipment105(scene,runtime)}<button class="ghost" type="button" data-scene-action-v104="clear">ОЧИСТИТЬ ИЗМЕРЕНИЕ</button><span class="scene-action-spacer-v104"></span><span class="scene-round-v104">Раунд ${Math.max(1,num(runtime.round,1))}</span><button class="primary" id="scene-next-turn-v104" type="button">СЛЕДУЮЩИЙ ХОД</button></div>
    </div>`;
  }
  function actionButton(id,label){return `<button class="secondary ${local.ui.action===id?'active':''}" type="button" data-scene-action-v104="${id}">${label}</button>`;}
  function renderActionEquipment105(scene,runtime){
    const token=selectedToken104();if(!token)return '';
    if(local.ui.action==='attack'){
      if(token.equipmentItemId&&['turret','drone'].includes(token.equipmentType)){const w=weaponForToken105(token);return `<span class="scene-action-equipment-v105"><b>${html(w?.name||token.name)}</b><small>${html(w?.damage||'—')} · ${hexLabel109(num(w?.range ?? token.attackRange ?? DEFAULT_ATTACK_WORLD))}</small></span>`;}
      const weapons=ownedItems105(token,'weapon');if(!weapons.length)return `<span class="scene-action-warning-v105">Нет оружия</span>`;
      if(!weapons.some(w=>w.id===token.weaponId))token.weaponId=weapons[0].id;
      return `<label class="scene-action-select-v105">ОРУЖИЕ <select class="select" id="scene-weapon-v105">${weapons.map(w=>`<option value="${html(w.id)}" ${w.id===token.weaponId?'selected':''}>${html(w.name)} · ${html(w.damage||'—')} · ${hexLabel109(num(w.range ?? DEFAULT_ATTACK_WORLD))}</option>`).join('')}</select></label>`;
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
      <div class="scene-palette-grid-v104">${assets.map(a=>`<div class="scene-palette-card-v104" draggable="true" data-scene-drag-v104="asset" data-scene-library-id-v104="${html(a.id)}">${a.image?`<img src="${html(a.image)}" alt=""/>`:'<span>◫</span>'}<b>${html(a.name)}</b><button class="scene-favorite-v104 ${a.favorite?'active':''}" type="button" data-scene-favorite-v104="${html(a.id)}" title="Избранное">★</button><small>${html(a.category)}</small><button class="scene-place-btn-v105 scene-place-asset-v105" type="button" data-scene-place-v105="asset" data-scene-library-id-v104="${html(a.id)}" title="Разместить на карте">＋</button></div>`).join('')||'<div class="small-note">Импортируй изображение или сохрани размещённый ассет как шаблон.</div>'}</div>`;
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
        <div class="cols2"><div class="field"><label>Масштаб одного гекса</label><input class="input" type="number" name="scalePerHex" min="0.01" step="0.1" value="${scene.scalePerHex}"/></div><div class="field"><label>Единица</label><input class="input" name="scaleLabel" value="${html(scene.scaleLabel)}"/></div></div>
        ${checkbox('fogEnabled',scene.fogEnabled,'Fog of War на втором экране')}
        <div class="field"><label>Цвет поля</label><input class="input" type="color" name="backgroundColor" value="${html(scene.backgroundColor||'#0b1420')}"/></div>
        <div class="row"><button class="secondary" type="button" id="scene-background-v104">ФОН</button><button class="ghost" type="button" id="scene-background-clear-v104">УБРАТЬ</button><button class="primary" type="submit">СОХРАНИТЬ</button></div>
        <div class="row"><button class="secondary" type="button" id="scene-duplicate-v104">ДУБЛИРОВАТЬ</button><button class="danger" type="button" id="scene-delete-v104">УДАЛИТЬ</button></div>
      </form></aside>`;
    }
    const o=selected.obj;if(!o)return `<aside class="scene-inspector-v104"><div class="small-note">Объект не найден.</div></aside>`;
    if(selected.kind==='token'){
      const entity=entityForToken(o), wc=combatConfig(entity||{}), vision=num(o.visionRange,0), move=num(o.moveRange,0);
      return `<aside class="scene-inspector-v104"><div class="scene-inspector-head-v104"><b>ЮНИТ</b><span>${html(o.name)}</span></div><form class="scene-inspector-form-v104" data-object-form-v104="token">
        <div class="field"><label>Имя</label><input class="input" name="name" value="${html(o.name)}"/></div>
        <div class="cols2"><div class="field"><label>HP тек.</label><input class="input" type="number" name="hpCurrent" value="${num(o.hpCurrent)}"/></div><div class="field"><label>HP макс.</label><input class="input" type="number" name="hpMax" min="1" value="${num(o.hpMax,1)}"/></div></div>
        <div class="cols2"><div class="field"><label>Инициатива вручную</label><input class="input" type="number" name="initiative" value="${num(o.initiative)}"/></div><div class="field"><label>Класс брони / защиты</label><input class="input" type="number" min="0" name="armorClass" value="${num(o.armorClass,0)}"/><div class="small-note">0 = автоматически (${tokenDefense105(o)})</div></div></div>
        <div class="cols2"><div class="field"><label>Видимость</label><input class="input" type="number" min="0" step="1" name="visionRange" value="${vision}"/><div class="small-note">0 = World Config (${wc.visionRange})</div></div><div class="field"><label>Движение</label><input class="input" type="number" min="0" step="1" name="moveRange" value="${move}"/><div class="small-note">0 = World Config (${wc.moveRange})</div></div></div>
        <div class="field"><label>Переопределение дальности атаки</label><input class="input" type="number" min="0" step="1" name="attackRange" value="${num(o.attackRange,0)}"/><div class="small-note">0 = дальность выбранного оружия / встроенной атаки.</div></div>
        ${renderTokenEquipmentInspector105(o,scene)}
        <div class="small-note">Эффективно: обзор ${hexLabel109(tokenVisionCells(o,scene))} · движение ${hexLabel109(tokenMoveCells(o,scene))} · атака ${hexLabel109(tokenAttackCells(o,scene))}</div>
        ${checkbox('visibleToPlayers',o.visibleToPlayers!==false,'Может быть виден игрокам')}${checkbox('sharesVisionWithPlayers',o.sharesVisionWithPlayers,'Даёт обзор игрокам')}${checkbox('hidden',o.hidden,'Скрыт')}${checkbox('locked',o.locked,'Заблокировать ручное перемещение')}${checkbox('blockMovement',o.blockMovement,'Блокирует путь другим юнитам')}
        <div class="row"><button class="primary" type="submit">ПРИМЕНИТЬ</button><button class="danger" type="button" data-scene-delete-object-v104="1">УДАЛИТЬ</button></div>
      </form></aside>`;
    }
    if(selected.kind==='asset')return `<aside class="scene-inspector-v104"><div class="scene-inspector-head-v104"><b>АССЕТ</b><span>${html(o.name)}</span></div><form class="scene-inspector-form-v104" data-object-form-v104="asset">
      <div class="field"><label>Название</label><input class="input" name="name" value="${html(o.name)}"/></div><div class="cols2"><div class="field"><label>Ширина</label><input class="input" type="number" min=".25" step=".25" name="w" value="${o.w}"/></div><div class="field"><label>Высота</label><input class="input" type="number" min=".25" step=".25" name="h" value="${o.h}"/></div></div>
      <div class="cols2"><div class="field"><label>Поворот</label><input class="input" type="number" name="rotation" value="${num(o.rotation)}"/></div><div class="field"><label>Прозрачность</label><input class="input" type="number" min=".05" max="1" step=".05" name="opacity" value="${num(o.opacity,1)}"/></div></div>
      ${checkbox('blockMovement',o.blockMovement,'Блокирует движение')}${checkbox('blockSight',o.blockSight,'Блокирует обзор')}${checkbox('visibleToPlayers',o.visibleToPlayers!==false,'Виден игрокам')}
      <div class="row"><button class="primary" type="submit">ПРИМЕНИТЬ</button><button class="secondary" type="button" id="scene-save-template-v104">В ШАБЛОНЫ</button><button class="danger" type="button" data-scene-delete-object-v104="1">УДАЛИТЬ</button></div></form></aside>`;
    return `<aside class="scene-inspector-v104"><div class="scene-inspector-head-v104"><b>ЗОНА</b><span>${html(o.label||o.shape||'Зона')}</span></div><form class="scene-inspector-form-v104" data-object-form-v104="zone">
      <div class="field"><label>Подпись</label><input class="input" name="label" value="${html(o.label||'')}"/></div><div class="field"><label>Цвет</label><input class="input" name="color" value="${html(o.color||'rgba(255,190,92,.35)')}"/></div>
      ${!['wall','polygon'].includes(o.shape)?`<div class="cols2"><div class="field"><label>Ширина</label><input class="input" type="number" min=".25" step=".25" name="w" value="${o.w}"/></div><div class="field"><label>Высота</label><input class="input" type="number" min=".25" step=".25" name="h" value="${o.h}"/></div></div>`:o.shape==='wall'?`<div class="field"><label>Толщина стены</label><input class="input" type="number" min=".04" step=".04" name="thickness" value="${num(o.thickness,.18)}"/></div>`:`<div class="small-note">Форма области задаётся нарисованным контуром.</div>`}
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
      <div class="scene-sound-sections-v104">${list(api.sections).map(section=>{const sounds=list(section.sounds).filter(s=>!q||String(s.name).toLowerCase().includes(q));const seq=`section:${section.id}:sequential`,rnd=`section:${section.id}:random`;return `<section class="scene-sound-section-v104"><header><b>${html(section.name)}</b><span><button class="secondary" type="button" data-scene-sound-add-v104="${html(section.id)}">＋ ФАЙЛ</button><button class="ghost" type="button" data-scene-sound-random-v104="${html(section.id)}">▶ RANDOM</button><button class="ghost ${active===seq?'active':''}" type="button" data-scene-section-ambient-v107="${html(section.id)}" data-scene-section-mode-v107="sequential">ЭМБИЕНТ ПО ПОРЯДКУ</button><button class="ghost ${active===rnd?'active':''}" type="button" data-scene-section-ambient-v107="${html(section.id)}" data-scene-section-mode-v107="random">ЭМБИЕНТ СЛУЧАЙНО</button></span></header>${sounds.map(s=>`<div class="scene-sound-row-v104"><span>${html(s.name)}</span><span><button class="ghost" type="button" data-scene-sound-play-v104="${html(s.id)}">▶</button><button class="ghost" type="button" data-scene-sound-stop-v104="${html(s.id)}">■</button><button class="ghost ${active===`sound:${s.id}`?'active':''}" type="button" data-scene-sound-ambient-v104="${html(s.id)}">AMBIENT</button><button class="ghost" type="button" data-scene-sound-delete-v104="${html(section.id)}:${html(s.id)}">×</button></span></div>`).join('')||'<div class="small-note">Нет звуков.</div>'}</section>`;}).join('')}</div></div>`;
  }
  function renderTop104(scene,runtime){
    const api=audioApi(), ambientChoice=ambientSelection107(api,scene.id);
    const sounds=list(api?.sections).flatMap(s=>list(s.sounds).map(x=>({...x,section:s.name}))),current=list(runtime?.initiativeOrder).length?list(runtime.tokens).find(t=>t.id===runtime.initiativeOrder[Math.max(0,Math.min(list(runtime.initiativeOrder).length-1,num(runtime.turnIndex,0)))])||null:null;
    return `<header class="scene-top-v104"><div class="scene-top-title-v104"><span>SCENE_EDITOR</span><b>${html(scene.name)}</b><small>${scene.width}×${scene.height} · 1 гекс = ${scene.scalePerHex} ${html(scene.scaleLabel)} · дальности считаются в гексах${current?` · Раунд ${Math.max(1,num(runtime.round,1))} · Ход: ${html(current.name)}`:''}</small></div>
      <div class="scene-top-controls-v104"><label>МАСШТАБ <input class="input tiny-v104" id="scene-scale-top-v104" type="number" min=".01" step=".1" value="${scene.scalePerHex}"/></label><label class="scene-top-check-v104"><input type="checkbox" id="scene-fog-top-v104" ${scene.fogEnabled?'checked':''}/> FOG</label><span class="scene-stability-badge-v108">БОЕВОЙ РЕЖИМ · SYNC ПРИОСТАНОВЛЕН</span>
      <label>ЭМБИЕНТ <select class="select" id="scene-ambient-v104"><option value="">— выключен —</option>${list(api?.sections).flatMap(section=>[...list(section.sounds).map(sound=>`<option value="sound:${html(sound.id)}" ${ambientChoice===`sound:${sound.id}`?'selected':''}>${html(section.name)} / ${html(sound.name)}</option>`),`<option value="section:${html(section.id)}:sequential" ${ambientChoice===`section:${section.id}:sequential`?'selected':''}>${html(section.name)} — весь раздел по порядку</option>`,`<option value="section:${html(section.id)}:random" ${ambientChoice===`section:${section.id}:random`?'selected':''}>${html(section.name)} — весь раздел случайно</option>`]).join('')}</select></label><button class="ghost" id="scene-ambient-stop-v104" type="button">■</button>
      <button class="ghost" id="scene-center-v108" type="button">ЦЕНТР КАРТЫ</button><button class="secondary ${local.ui.soundsOpen?'active':''}" id="scene-sounds-toggle-v104" type="button">ЗВУКИ</button><button class="secondary" id="scene-export-v104" type="button">ЭКСПОРТ</button><button class="secondary" id="scene-import-v104" type="button">ИМПОРТ</button>
      ${window.electronAPI?.openPlayerDisplay?`<button class="${Combat.displayWindowOpen?'danger':'primary'}" id="scene-display-v104" type="button">${Combat.displayWindowOpen?'ЗАКРЫТЬ ВТОРОЙ ЭКРАН':'ВТОРОЙ ЭКРАН'}</button>`:''}</div>
      ${local.ui.soundsOpen?renderSounds104(scene):''}</header>`;
  }

  Combat.render = function() {
    ensureCombatModuleMarkup();
    const root=document.getElementById('combat-content'); if(!root)return;
    if(!this.isDm()) { root.innerHTML='<div class="card pad18">Сцены доступны только ДМу.</div>'; return; }
    if(!local.loaded){ root.innerHTML='<div class="card pad18">Загрузка локальных сцен…</div>'; loadLocalStore().then(()=>this.render()); return; }
    if(!this.selectedSceneId || !COMBAT_SCENES[this.selectedSceneId]) this.selectedSceneId=COMBAT_SCENE_LIST[0]?.id||null;
    const scene=this.getScene();
    if(!scene){ root.innerHTML=`<div class="scene-empty-v104"><b>Нет сцен</b><button class="primary" id="scene-new-v104" type="button">СОЗДАТЬ СЦЕНУ</button></div>`; return; }
    const runtime=this.getRuntime(scene.id);
    root.innerHTML=`<div class="scene-editor-v104">${renderTop104(scene,runtime)}${renderLeft104()}<main class="scene-center-v104">${renderBoard104(scene,runtime)}</main>${renderInspector104(scene,runtime)}</div>`;
    // Keep board sizing and camera transform in the same JS task as DOM replacement: no one-frame jump to a default frame.
    try{const viewport=document.getElementById('combat-stage-viewport');this.syncViewportBoardFrame?.(scene,viewport);this.applyViewTransform?.(viewport);}catch{}
    broadcastScene104();
    const api=audioApi(); if(api) api.startAmbient(scene.id);
  };

  function addScene104(){
    const scene=createBlankCombatScene();scene.category=local.ui.sceneCategory==='all'?'Общее':local.ui.sceneCategory;scene.scalePerHex=1;scene.scaleLabel='м';scene.parentId='';scene.templates=[];
    COMBAT_SCENES[scene.id]=normalizeCombatScene(scene);sortCombatScenes();ensureCombatRuntime(scene.id);Combat.selectedSceneId=scene.id;Combat.selectedObject=null;queueStoreSave();Combat.render();
  }
  function deleteScene104(sceneId){
    if(!sceneId||!COMBAT_SCENES[sceneId])return;
    if(!confirm(`Удалить сцену «${COMBAT_SCENES[sceneId].name}»?`))return;
    Object.values(COMBAT_SCENES).forEach(s=>{if(s.parentId===sceneId)s.parentId='';});delete COMBAT_SCENES[sceneId];delete ensureCombatState().scenes[sceneId];delete ensureCombatState().cameraByScene?.[sceneId];delete local.cameraRuntime?.[sceneId];if(local.store?.cameraByScene)delete local.store.cameraByScene[sceneId];sortCombatScenes();Combat.selectedSceneId=COMBAT_SCENE_LIST[0]?.id||null;Combat.selectedObject=null;queueStoreSave();Combat.render();broadcastScene104();
  }
  function duplicateScene104(sceneId){
    const scene=COMBAT_SCENES[sceneId];if(!scene)return;const id=makeId('scene');const copy=normalizeCombatScene({...clone(scene),id,name:`${scene.name} — копия`,parentId:scene.parentId||''});COMBAT_SCENES[id]=copy;ensureCombatState().scenes[id]=clone(ensureCombatRuntime(sceneId));sortCombatScenes();Combat.selectedSceneId=id;queueStoreSave();Combat.render();
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
    const image=await requestLocalImage104('scene_library'); if(!image)return;
    const name=String(prompt('Название ассета','Новый ассет')||'Новый ассет').trim()||'Новый ассет';
    const category=local.ui.assetCategory!=='all'&&local.ui.assetCategory!=='favorites'?local.ui.assetCategory:'Общее';
    const asset=normalizeLibraryAsset({id:makeId('assetlib'),name,image,category,favorite:false,createdAt:new Date().toISOString()});
    local.store.assetLibrary=Array.isArray(local.store.assetLibrary)?local.store.assetLibrary:[];
    local.store.assetLibrary.push(asset);
    if(!local.store.assetCategories.includes(category))local.store.assetCategories.push(category);
    local.ui.assetCategory=category;
    await saveStoreNow();
    Combat.render();
    Toast.show(`Ассет «${name}» добавлен в локальную библиотеку`,'ok');
  }
  function placeLibraryAsset104(id, point){const lib=local.store.assetLibrary.find(a=>a.id===id),scene=Combat.getScene();if(!lib||!scene){Toast.show('Ассет не найден в локальной библиотеке','err');return;}scene.assets=Array.isArray(scene.assets)?scene.assets:[];const obj=normalizeCombatAsset({...clone(lib),id:makeId('asset'),libraryId:lib.id,x:clamp104(point.x-lib.w/2,0,Math.max(0,scene.width-lib.w)),y:clamp104(point.y-lib.h/2,0,Math.max(0,scene.height-lib.h))});scene.assets.push(obj);Combat.selectedObject={kind:'asset',id:obj.id};local.ui.pendingPlacement=null;queueStoreSave();Combat.render();broadcastScene104();}
  function createEquipmentUnit105(id){const item=equipmentItem105(id);if(!item||!['turret','drone'].includes(item.type))return null;return normalizeCombatToken({id:`token_${item.type}_${item.id}_${Date.now().toString(36)}`,type:item.type,name:item.name||item.id,image:item.image||'',equipmentItemId:item.id,equipmentType:item.type,x:0,y:0,w:1,h:1,hpCurrent:item.unitHp||10,hpMax:item.unitHp||10,initiative:item.unitInitiative||0,armorClass:item.unitArmorClass||10,visionRange:item.unitVisionRange||0,moveRange:item.unitMoveRange||0,attackRange:item.range||0,color:item.type==='drone'?'#b9a7ff':'#ffd078',visibleToPlayers:true,sharesVisionWithPlayers:false,blockMovement:true,weaponId:item.id});}
  function placeUnit104(kind,id,point){const scene=Combat.getScene(),runtime=Combat.getRuntime();if(!scene||!runtime)return;let token=kind==='player'?createPlayerCombatToken(id):kind==='npc'?createNpcCombatToken(id):kind==='equipment-unit'?createEquipmentUnit105(id):null;if(!token){Toast.show('Не удалось создать юнит','err');return;}token=normalizeCombatToken({...token,visibleToPlayers:true});fitTokenToHex107(token,scene,nearestHexCenter107(scene,point));runtime.tokens.push(token);Combat.selectedObject={kind:'token',id:token.id};local.ui.pendingPlacement=null;Combat.syncInitiative(scene.id,false);queueStoreSave();Combat.render();broadcastScene104();}
  function placeZone104(shape,point){const scene=Combat.getScene();if(!scene)return;const dims=shape==='line'?{w:4,h:.5}:shape==='cone'?{w:4,h:4}:shape==='circle'?{w:3,h:3}:{w:3,h:3};const zone=normalizeCombatTemplate({id:makeId('zone'),shape,name:'Зона',label:'',x:point.x-dims.w/2,y:point.y-dims.h/2,w:dims.w,h:dims.h,color:'rgba(255,190,92,.35)',visibleToPlayers:true,blockMovement:false,blockSight:false,points:shape==='wall'?[{x:point.x-1,y:point.y},{x:point.x+1,y:point.y}]:shape==='polygon'?[{x:point.x-1.4,y:point.y-1},{x:point.x+1.4,y:point.y-1},{x:point.x+1.4,y:point.y+1},{x:point.x-1.4,y:point.y+1}]:[]});scene.templates.push(zone);Combat.selectedObject={kind:'zone',id:zone.id};queueStoreSave();Combat.render();broadcastScene104();}

  function selectedObject104(){const s=Combat.getScene(),r=Combat.getRuntime();return s&&r?getSelection(s,r):null;}
  function deleteSelected104(){const scene=Combat.getScene(),runtime=Combat.getRuntime(),sel=selectedObject104();if(!scene||!runtime||!sel)return;if(sel.kind==='token')runtime.tokens=runtime.tokens.filter(x=>x.id!==sel.obj.id);if(sel.kind==='asset')scene.assets=scene.assets.filter(x=>x.id!==sel.obj.id);if(sel.kind==='zone')scene.templates=scene.templates.filter(x=>x.id!==sel.obj.id);Combat.selectedObject=null;Combat.syncInitiative(scene.id,false);queueStoreSave();Combat.render();broadcastScene104();}
  function saveAssetTemplate104(){const sel=selectedObject104();if(sel?.kind!=='asset')return;const a=sel.obj;const category=local.ui.assetCategory!=='all'&&local.ui.assetCategory!=='favorites'?local.ui.assetCategory:'Общее';local.store.assetLibrary.push(normalizeLibraryAsset({...a,id:makeId('assetlib'),category,favorite:false}));if(!local.store.assetCategories.includes(category))local.store.assetCategories.push(category);queueStoreSave();Toast.show('Ассет сохранён в локальную библиотеку','ok');Combat.render();}

  function applyObjectForm104(form){
    const scene=Combat.getScene(),runtime=Combat.getRuntime(),sel=selectedObject104();if(!scene||!runtime||!sel)return;const fd=new FormData(form),o=sel.obj;
    if(sel.kind==='token'){o.name=String(fd.get('name')||o.name);o.hpMax=Math.max(1,num(fd.get('hpMax'),o.hpMax));o.hpCurrent=clamp104(fd.get('hpCurrent'),0,o.hpMax);o.initiative=num(fd.get('initiative'));o.armorClass=Math.max(0,num(fd.get('armorClass'),0));o.visionRange=Math.max(0,num(fd.get('visionRange')));o.moveRange=Math.max(0,num(fd.get('moveRange')));o.attackRange=Math.max(0,num(fd.get('attackRange')));if(fd.has('weaponId'))o.weaponId=String(fd.get('weaponId')||'');if(fd.has('grenadeId'))o.grenadeId=String(fd.get('grenadeId')||'');o.visibleToPlayers=fd.get('visibleToPlayers')==='on';o.sharesVisionWithPlayers=fd.get('sharesVisionWithPlayers')==='on';o.hidden=fd.get('hidden')==='on';o.locked=fd.get('locked')==='on';o.blockMovement=fd.get('blockMovement')==='on';Combat.syncInitiative(scene.id,false);if(o.playerId){updatePlayerHp105(o);void persistCombatProfiles105('Сцена: ручное изменение HP');}}
    if(sel.kind==='asset'){o.name=String(fd.get('name')||o.name);o.w=clamp104(fd.get('w'),.25,40);o.h=clamp104(fd.get('h'),.25,40);o.rotation=num(fd.get('rotation'));o.opacity=clamp104(fd.get('opacity'),.05,1);o.blockMovement=fd.get('blockMovement')==='on';o.blockSight=fd.get('blockSight')==='on';o.visibleToPlayers=fd.get('visibleToPlayers')==='on';}
    if(sel.kind==='zone'){o.label=String(fd.get('label')||'');o.color=String(fd.get('color')||o.color);if(!['wall','polygon'].includes(o.shape)){o.w=clamp104(fd.get('w'),.25,60);o.h=clamp104(fd.get('h'),.25,60);}else if(o.shape==='wall')o.thickness=clamp104(fd.get('thickness'),.04,4);o.blockMovement=fd.get('blockMovement')==='on';o.blockSight=fd.get('blockSight')==='on';o.visibleToPlayers=fd.get('visibleToPlayers')==='on';}
    queueStoreSave();Combat.render();broadcastScene104();
  }
  function applySceneForm104(form){const scene=Combat.getScene();if(!scene)return;const fd=new FormData(form);scene.name=String(fd.get('name')||scene.name).trim()||'Сцена';scene.category=String(fd.get('category')||'Общее').trim()||'Общее';scene.parentId=String(fd.get('parentId')||'');if(scene.parentId===scene.id||sceneDescendantIds(scene.id).has(scene.parentId))scene.parentId='';scene.width=clamp104(fd.get('width'),8,100);scene.height=clamp104(fd.get('height'),8,100);scene.scalePerHex=clamp104(fd.get('scalePerHex'),.01,100000);scene.scaleLabel=String(fd.get('scaleLabel')||'м').trim()||'м';scene.fogEnabled=fd.get('fogEnabled')==='on';scene.backgroundColor=String(fd.get('backgroundColor')||scene.backgroundColor);if(!local.store.categories.includes(scene.category))local.store.categories.push(scene.category);sortCombatScenes();queueStoreSave();Combat.render();broadcastScene104();}

  function refreshPreviewDom104(){const scene=Combat.getScene(),layer=document.querySelector('#combat-stage .scene-preview-layer-v104');if(scene&&layer)layer.innerHTML=previewMarkup(scene);broadcastScene104();}
  function selectedToken104(){const sel=selectedObject104();return sel?.kind==='token'?sel.obj:null;}
  function makeRoutePreview104(point,attack=false){
    const scene=Combat.getScene(),token=selectedToken104();if(!scene||!token)return null;const start=centerOf(token);
    if(attack){const weapon=weaponForToken105(token);if(!weapon)return {kind:'route',mode:'attack',points:[start,start],end:start,limited:true,blocked:true,label:'Нет выбранного оружия'};const max=tokenAttackCells(token,scene),snapped=nearestHexCenter107(scene,point),distance=hexDistancePoints109(scene,start,snapped),rangeEnd=hexEndpointAtRange109(scene,start,snapped,max),end={x:rangeEnd.x,y:rangeEnd.y},limited=distance>Math.floor(max+1e-6),blocked=!limited&&sightSegmentBlocked105(scene,start,end,[token.id]);return {kind:'route',mode:'attack',points:[start,end],end,hexes:Math.min(distance,Math.floor(max+1e-6)),maxHexes:Math.floor(max+1e-6),limited,blocked,label:`${weapon.name||'Выстрел'}: ${hexLabel109(Math.min(distance,max))} / ${hexLabel109(max)}${blocked?' · ЛИНИЯ ОГНЯ БЛОКИРОВАНА':''}`};}
    if(!canMechanicalMove108(token))return {kind:'route',mode:'move',points:[start],end:start,steps:0,limited:true,blocked:true,label:'Выбран не текущий юнит инициативы'};const snappedTarget=nearestHexCenter107(scene,point),path=findHexPath108(scene,start,snappedTarget,token.id),totalMax=Math.max(0,Math.floor(tokenMoveCells(token,scene)+1e-6)),spentCells=Math.max(0,Math.floor(num(token.movedThisTurn,0)+1e-6)),max=Math.max(0,totalMax-spentCells);if(!path){return {kind:'route',mode:'move',points:[start],end:start,steps:0,limited:true,blocked:true,label:'Путь заблокирован'};}const cut=truncateHexPath108(path,max),remaining=Math.max(0,max-cut.steps);return {kind:'route',mode:'move',points:cut.points,end:cut.end,steps:cut.steps,limited:cut.limited,label:`Движение: ${hexLabel109(cut.steps)} / останется ${hexLabel109(remaining)}`};
  }
  function makeGrenadePreview105(point){const scene=Combat.getScene(),token=selectedToken104(),grenade=grenadeForToken105(token);if(!scene||!token||!grenade)return null;const start=centerOf(token),max=grenadeRangeCells105(grenade,scene),snapped=nearestHexCenter107(scene,point),distance=hexDistancePoints109(scene,start,snapped),rangeEnd=hexEndpointAtRange109(scene,start,snapped,max),end={x:rangeEnd.x,y:rangeEnd.y},radiusHexes=Math.max(0,Math.floor(grenadeRadiusCells105(grenade,scene)+1e-6)),radius=radiusHexes*hexStepDistance109(),limited=distance>Math.floor(max+1e-6);return {kind:'grenade',mode:'grenade',start,end,radius,radiusHexes,hexes:Math.min(distance,max),maxHexes:max,limited,itemId:grenade.id,label:`${grenade.name}: бросок ${hexLabel109(Math.min(distance,max))} / ${hexLabel109(max)} · радиус ${hexLabel109(radiusHexes)}`};}
  function commitMove104(){const selected=selectedToken104(),scene=Combat.getScene(),p=local.preview;if(!selected||!scene||p?.kind!=='route'||p.mode!=='move')return;if(p.blocked){Toast.show(p.label||'Путь заблокирован','info');return;}if(!canMechanicalMove108(selected)){Toast.show('Сейчас не ход этого юнита','info');return;}if(num(p.steps,0)<=0)return;const runtime=Combat.getRuntime(scene.id),token=list(runtime?.tokens).find(t=>t.id===selected.id);if(!token)return;fitTokenToHex107(token,scene,p.end);token.movedThisTurn=Math.max(0,num(token.movedThisTurn))+Math.max(0,Math.floor(num(p.steps,0)));local.preview={...p,effect:'move',movedTokenId:token.id};queueStoreSave();Combat.render();broadcastScene104();setTimeout(()=>{if(local.preview?.effect==='move'&&local.preview?.movedTokenId===token.id){local.preview=null;refreshPreviewDom104();}},650);}
  function updatePlayerHp105(token){if(token?.playerId&&App.state?.users?.[token.playerId]){const user=normalizePlayerProfileV2(App.state.users[token.playerId]);user.stats={...(user.stats||{}),hpCurrent:token.hpCurrent,hpMax:Math.max(num(user.stats?.hpMax,0),num(token.hpMax,1))};App.state.users[token.playerId]=user;}}
  async function persistCombatProfiles105(reason='Сцена: боевое действие'){local.stability.dirtyProfiles=true;clearTimeout(local.stability.localPersistTimer);local.stability.localPersistTimer=setTimeout(()=>{Promise.resolve(Persistence?.save?.(App.state)).catch(error=>console.error('SCENE_LOCAL_PROFILE_SAVE_FAILED',error));},220);return {ok:true,status:'deferred-until-scene-exit',reason};}
  function appendCombatLog105(runtime,text){runtime.log=Array.isArray(runtime.log)?runtime.log:[];runtime.log.unshift({id:makeId('scene_log'),createdAt:new Date().toISOString(),text});runtime.log=runtime.log.slice(0,30);}
  function commitAttack105(targetId) {
    const scene = Combat.getScene(), runtime = Combat.getRuntime(), attacker = selectedToken104();
    const target = list(runtime?.tokens).find(t => t.id === targetId);
    if (!scene || !runtime || !attacker || !target || attacker.id === target.id) return;
    if (!Combat.canActWithToken?.(attacker)) { Toast.show('Сейчас не ход этого юнита', 'info'); return; }
    if (attacker.actionUsed) { Toast.show('Действие этого юнита уже потрачено', 'info'); return; }
    const weapon = weaponForToken105(attacker);
    if (!weapon) { Toast.show('У юнита не выбрано оружие', 'info'); return; }
    const from = centerOf(attacker), to = centerOf(target), max = tokenAttackCells(attacker, scene), distance = hexDistancePoints109(scene, from, to);
    local.preview = makeRoutePreview104(to, true); refreshPreviewDom104();
    if (distance > Math.floor(max + 1e-6)) { Toast.show(`Цель вне дальности: ${hexLabel109(distance)} / ${hexLabel109(max)}`, 'info'); return; }
    if (sightSegmentBlocked105(scene, from, to, [attacker.id, target.id])) { Toast.show('Линия огня заблокирована', 'info'); return; }
    const rawRoll = 1 + Math.floor(Math.random() * 20), hitBonus = num(weapon.hitBonus, 0), attackTotal = rawRoll + hitBonus, defense = tokenDefense105(target);
    const hit = attackTotal >= defense;
    attacker.actionUsed = true;
    let damage = 0;
    if (hit) {
      damage = parseCombatDamage(String(weapon.damage || '1d6')).roll();
      if (rawRoll === 20) damage += 1;
      target.hpCurrent = Math.max(0, num(target.hpCurrent) - damage);
      updatePlayerHp105(target);
    }
    const bonusText = hitBonus ? ` ${hitBonus >= 0 ? '+' : '-'} ${Math.abs(hitBonus)}` : '';
    appendCombatLog105(runtime, hit
      ? `${attacker.name} стреляет в ${target.name} из «${weapon.name || 'оружия'}»: d20 ${rawRoll}${bonusText} = ${attackTotal} против КБ ${defense}; ${damage} урона${rawRoll === 20 ? ' (крит.)' : ''}.`
      : `${attacker.name} стреляет в ${target.name} из «${weapon.name || 'оружия'}»: d20 ${rawRoll}${bonusText} = ${attackTotal} против КБ ${defense}; промах.`);
    local.preview = { ...local.preview, effect: hit ? 'shot' : 'miss', targetId: target.id, label: hit ? `${weapon.name}: ${damage} урона · ${attackTotal} ≥ ${defense}` : `${weapon.name}: промах · ${attackTotal} < ${defense}` };
    queueStoreSave(); Combat.render(); broadcastScene104(); persistCombatProfiles105();
    setTimeout(() => { if (['shot', 'miss'].includes(local.preview?.effect) && local.preview?.targetId === target.id) { local.preview = null; refreshPreviewDom104(); } }, 900);
  }
  function consumeGrenade105(token,itemId){const entity=entityForToken(token);if(!entity||!token?.playerId)return false;const row=list(entity.inventory).find(v=>String(v?.itemId||'')===String(itemId));if(!row||num(row.qty,0)<=0)return false;row.qty=Math.max(0,Math.trunc(num(row.qty,0))-1);if(Array.isArray(row.positions)&&row.positions.length)row.positions.pop();if(row.qty<=0)entity.inventory=entity.inventory.filter(v=>v!==row);App.state.users[token.playerId]=normalizePlayerProfileV2(entity);return true;}
  function commitGrenade105(point){const scene=Combat.getScene(),runtime=Combat.getRuntime(),attacker=selectedToken104(),grenade=grenadeForToken105(attacker);if(!scene||!runtime||!attacker){return;}if(!Combat.canActWithToken?.(attacker)){Toast.show('Сейчас не ход этого юнита','info');return;}if(!grenade){Toast.show('В инвентаре персонажа нет гранаты','info');return;}if(attacker.actionUsed){Toast.show('Действие этого юнита уже потрачено','info');return;}const preview=makeGrenadePreview105(point);if(!preview)return;if(preview.limited){local.preview=preview;refreshPreviewDom104();Toast.show('Точка броска вне дальности — граната не израсходована','info');return;}if(!consumeGrenade105(attacker,grenade.id)){Toast.show('Граната отсутствует в инвентаре персонажа','err');return;}const damage=parseCombatDamage(String(grenade.damage||'1d6')).roll(),impact=preview.end,radiusHexes=Math.max(0,num(preview.radiusHexes,grenadeRadiusCells105(grenade,scene))),hit=[];for(const target of list(runtime.tokens)){const c=centerOf(target);if(hexDistancePoints109(scene,c,impact)>radiusHexes)continue;if(sightSegmentBlocked105(scene,impact,c,[target.id]))continue;target.hpCurrent=Math.max(0,num(target.hpCurrent)-damage);updatePlayerHp105(target);hit.push(target.name);}attacker.actionUsed=true;appendCombatLog105(runtime,`${attacker.name} бросает «${grenade.name}»: ${damage} урона${hit.length?` (${hit.join(', ')})`:'; целей в зоне нет'}.`);local.preview={...preview,effect:'grenade',label:`${grenade.name}: ${damage} урона · целей ${hit.length}`};queueStoreSave();Combat.render();broadcastScene104();persistCombatProfiles105('Сцена: использована граната');setTimeout(()=>{if(local.preview?.effect==='grenade'){local.preview=null;refreshPreviewDom104();}},1200);}
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
    const stage=event.target.closest?.('#combat-stage'),viewport=event.target.closest?.('#combat-stage-viewport');if(!stage)return;const scene=Combat.getScene();if(!scene)return;
    if(event.button===1||local.ui.action==='pan'||(local.spaceDown&&event.button===0)){event.preventDefault();beginPan105(event,viewport||stage.closest('#combat-stage-viewport'));return;}
    if(event.button!==0)return;const point=scenePointFromEvent(event,stage,scene),object=event.target.closest?.('[data-scene-kind-v104]');
    const resizeHandle=event.target.closest?.('[data-zone-resize-v107]');
    if(resizeHandle){const zone=list(scene.templates).find(z=>z.id===resizeHandle.dataset.zoneResizeV107);if(zone&&!zone.locked){event.preventDefault();event.stopPropagation();local.draw={kind:'zone-resize',pointerId:event.pointerId,id:zone.id,ox:num(zone.x),oy:num(zone.y),ow:Math.max(.2,num(zone.w,1)),oh:Math.max(.2,num(zone.h,1)),points:clone(zone.points||[])};stage.setPointerCapture?.(event.pointerId);}return;}
    if(local.ui.pendingPlacement){const p=local.ui.pendingPlacement;if(p.kind==='asset')placeLibraryAsset104(p.libraryId,point);else if(['player','npc','equipment-unit'].includes(p.kind))placeUnit104(p.kind,p.entityId,point);else if(p.kind==='zone')placeZone104(p.shape,point);return;}
    if(local.ui.action==='select'){
      if(object){Combat.selectedObject={kind:object.dataset.sceneKindV104,id:object.dataset.sceneIdV104};const sel=selectedObject104();if(sel&&!sel.obj.locked){local.draw={kind:'drag',pointerId:event.pointerId,start:point,objectKind:sel.kind,id:sel.obj.id,ox:num(sel.obj.x),oy:num(sel.obj.y),points:clone(sel.obj.points||[]),node:object};stage.setPointerCapture?.(event.pointerId);}else Combat.render();}
      else{Combat.selectedObject=null;Combat.render();}return;
    }
    if(local.ui.action==='move'){local.preview=makeRoutePreview104(point,false);refreshPreviewDom104();commitMove104();return;}
    if(local.ui.action==='attack'){const targetEl=object?.dataset.sceneKindV104==='token'?object:null;local.preview=makeRoutePreview104(targetEl?centerOf(list(Combat.getRuntime()?.tokens).find(t=>t.id===targetEl.dataset.sceneIdV104)||{x:point.x,y:point.y,w:0,h:0}):point,true);refreshPreviewDom104();if(targetEl)commitAttack105(targetEl.dataset.sceneIdV104);return;}
    if(local.ui.action==='grenade'){local.preview=makeGrenadePreview105(point);refreshPreviewDom104();commitGrenade105(point);return;}
    if(['measure','circle','cone'].includes(local.ui.action)){const snapped=nearestHexCenter107(scene,point);local.draw={kind:local.ui.action,pointerId:event.pointerId,start:snapped};local.preview={kind:local.ui.action,start:snapped,end:snapped,hexes:0,radius:0,label:hexLabel109(0)};stage.setPointerCapture?.(event.pointerId);refreshPreviewDom104();return;}
    if(['wall','area'].includes(local.ui.action)){local.draw={kind:local.ui.action,pointerId:event.pointerId,points:[point],last:point};local.preview={kind:local.ui.action,points:[point]};stage.setPointerCapture?.(event.pointerId);refreshPreviewDom104();}
  }
  function moveBoardPointer104(event){
    const stage=document.getElementById('combat-stage'),scene=Combat.getScene();if(!stage||!scene)return;const d=local.draw;
    if(d?.kind==='pan'){Combat.updateViewDrag?.(event,d.viewport);return;}
    const point=scenePointFromEvent(event,stage,scene);
    if(!d&&(local.ui.action==='move'||local.ui.action==='attack'||local.ui.action==='grenade')){local.preview=local.ui.action==='grenade'?makeGrenadePreview105(point):makeRoutePreview104(point,local.ui.action==='attack');refreshPreviewDom104();return;}
    if(!d)return;
    if(d.kind==='drag'){
      const sel=selectedObject104();if(!sel)return;const dx=point.x-d.start.x,dy=point.y-d.start.y;
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
  function endBoardPointer104(){
    const d=local.draw;if(!d)return;local.draw=null;
    if(d.kind==='pan'){Combat.endViewDrag?.();return;}
    if(d.kind==='drag'){queueStoreSave();Combat.render();broadcastScene104();return;}
    if(d.kind==='zone-resize'){queueStoreSave();Combat.render();broadcastScene104();return;}
    if(d.kind==='wall'&&d.points.length>1){const scene=Combat.getScene();const xs=d.points.map(p=>p.x),ys=d.points.map(p=>p.y);const zone=normalizeCombatTemplate({id:makeId('wall'),shape:'wall',name:'Стена',label:'',x:Math.min(...xs),y:Math.min(...ys),w:Math.max(.2,Math.max(...xs)-Math.min(...xs)),h:Math.max(.2,Math.max(...ys)-Math.min(...ys)),points:d.points,thickness:.18,color:'rgba(255,190,92,.75)',visibleToPlayers:false,blockSight:true,blockMovement:true});scene.templates.push(zone);Combat.selectedObject={kind:'zone',id:zone.id};local.preview=null;queueStoreSave();Combat.render();broadcastScene104();return;}
    if(d.kind==='area'&&d.points.length>2){const scene=Combat.getScene();const xs=d.points.map(p=>p.x),ys=d.points.map(p=>p.y);const zone=normalizeCombatTemplate({id:makeId('area'),shape:'polygon',name:'Область',label:'',x:Math.min(...xs),y:Math.min(...ys),w:Math.max(.2,Math.max(...xs)-Math.min(...xs)),h:Math.max(.2,Math.max(...ys)-Math.min(...ys)),points:d.points,color:'rgba(255,190,92,.35)',visibleToPlayers:true,blockSight:false,blockMovement:false});scene.templates.push(zone);Combat.selectedObject={kind:'zone',id:zone.id};local.preview=null;queueStoreSave();Combat.render();broadcastScene104();return;}
    refreshPreviewDom104();
  }

  function contextMenu104(event){
    const object=event.target.closest?.('[data-scene-kind-v104]');if(!object||!object.closest('#combat-stage'))return;event.preventDefault();Combat.selectedObject={kind:object.dataset.sceneKindV104,id:object.dataset.sceneIdV104};const sel=selectedObject104();if(!sel)return;closeContext104();const menu=document.createElement('div');menu.className='scene-context-v104';menu.style.left=`${event.clientX}px`;menu.style.top=`${event.clientY}px`;
    if(sel.kind==='token')menu.innerHTML=`<b>${html(sel.obj.name)}</b><label>HP <input type="number" data-context-hp-v104 value="${num(sel.obj.hpCurrent)}"/> / <input type="number" data-context-hpmax-v104 value="${num(sel.obj.hpMax,1)}"/></label><label>Инициатива <input type="number" data-context-init-v104 value="${num(sel.obj.initiative)}"/></label><button data-context-toggle-v104="visibleToPlayers" type="button">${sel.obj.visibleToPlayers!==false?'Скрыть от игроков':'Показать игрокам'}</button><button data-context-toggle-v104="sharesVisionWithPlayers" type="button">${sel.obj.sharesVisionWithPlayers?'Не давать обзор игрокам':'Даёт обзор игрокам'}</button><button data-context-toggle-v104="blockMovement" type="button">${sel.obj.blockMovement?'Не блокирует путь':'Блокирует путь'}</button><button data-context-delete-v104 type="button">Удалить</button>`;
    else menu.innerHTML=`<b>${html(sel.obj.name||sel.obj.label||'Объект')}</b><button data-context-toggle-v104="blockMovement" type="button">${sel.obj.blockMovement?'Не блокирует движение':'Блокирует движение'}</button><button data-context-toggle-v104="blockSight" type="button">${sel.obj.blockSight?'Просматривается насквозь':'Блокирует обзор'}</button><button data-context-toggle-v104="visibleToPlayers" type="button">${sel.obj.visibleToPlayers!==false?'Скрыть от игроков':'Показать игрокам'}</button><button data-context-delete-v104 type="button">Удалить</button>`;
    document.body.appendChild(menu);local.context=menu;
  }
  function closeContext104(){local.context?.remove();local.context=null;}

  function buildCombatSnapshot104(){
    const scene=Combat.getScene();if(!scene)return null;const runtime=clone(Combat.getRuntime(scene.id)||{});runtime.tokens=list(runtime.tokens).map(t=>({...t,resolvedVisionCells:tokenVisionCells(t,scene),resolvedVisionRadius:tokenVisionCells(t,scene)*hexStepDistance109(),resolvedMoveCells:tokenMoveCells(t,scene),resolvedAttackCells:tokenAttackCells(t,scene)}));
    return {version:2,scene:clone(scene),runtime,preview:clone(local.preview),sentAt:new Date().toISOString()};
  }
  Combat.broadcastPlayerDisplayMirror = function(sceneId=this.getSceneIdForView()){
    if(!this.isDm()||!window.electronAPI?.updatePlayerDisplayView)return;
    const combat=this.getCombatState(),scene=sceneId&&COMBAT_SCENES[sceneId]?COMBAT_SCENES[sceneId]:this.getScene();
    window.electronAPI.updatePlayerDisplayView({mode:'combat',eraTheme:document.documentElement?.dataset?.eraTheme||'technological',activeSceneId:scene?.id||'',cameraByScene:clone(local.cameraRuntime||{}),combatSnapshot:buildCombatSnapshot104(),activeRegionMapId:'',updatedAt:new Date().toISOString()}).catch(()=>{});
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
    if(local.stability.active)return;local.stability.active=true;local.stability.enteredAt=Date.now();local.stability.remotePending=false;document.body.classList.add('combat-stability-v108');
    try{Sync?.stopPolling?.();if(Sync?._pendingWorldSnapshotPullV1015){clearTimeout(Sync._pendingWorldSnapshotPullV1015);Sync._pendingWorldSnapshotPullV1015=null;}if(Sync?._worldSnapshotRealtimeUnsubV1015){Sync._worldSnapshotRealtimeUnsubV1015();Sync._worldSnapshotRealtimeUnsubV1015=null;}}catch{}
    try{PlayerSync?.stopPolling?.();}catch{}try{ChatSync?.stopPolling?.();ChatSync?.stopRealtimeBridge?.();}catch{}try{Combat.stopRuntimeSync?.();}catch{}
  }
  async function exitCombatStability108(){
    if(!local.stability.active)return;local.stability.active=false;document.body.classList.remove('combat-stability-v108');clearTimeout(local.stability.localPersistTimer);local.stability.localPersistTimer=0;
    try{await saveStoreNow();}catch{}
    try{Sync?.initWorldSnapshotRealtimeBridgeV1015?.();if(Sync?.config?.enabled)Sync?.startPolling?.();}catch{}
    try{if(Sync?.config?.enabled)PlayerSync?.startPolling?.();}catch{}try{if(Sync?.config?.enabled)ChatSync?.startPolling?.();}catch{}
    try{
      if(local.stability.dirtyProfiles){local.stability.dirtyProfiles=false;await App.saveState?.('Боевой сеанс завершён: изменения применены пакетом');}
      else if(local.stability.remotePending&&syncCheckBefore108)await syncCheckBefore108('combat-session-exit',{applyIfNewer:true,silent:true});
    }catch(error){console.error('COMBAT_STABILITY_FLUSH_FAILED',error);}
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
  UI.openModule=function(id,options={}){if(id==='combat'&&!Combat.isDm()){Toast.show('Сцены доступны только ДМу','info');return;}const leaving=this.activeModuleId==='combat'&&id!=='combat';if(leaving){closeDisplayQuiet104();void exitCombatStability108();}const result=openModuleBefore104(id,options);if(id==='combat'&&this.activeModuleId==='combat')enterCombatStability108();return result;};
  const closeModuleBefore104=UI.closeModule.bind(UI);
  UI.closeModule=function(...args){const wasCombat=this.activeModuleId==='combat';const result=closeModuleBefore104(...args);if(wasCombat){local.preview=null;closeDisplayQuiet104();audioApi()?.stopAll?.();void exitCombatStability108();}return result;};
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
    const t=event.target.closest?.('#mod-combat button,#mod-combat [data-scene-select-v104],.scene-context-v104 button');
    if(!t){if(local.context&&!event.target.closest('.scene-context-v104'))closeContext104();return;}
    if(t.id==='scene-new-v104'){event.preventDefault();addScene104();return;}
    if(t.dataset.sceneSelectV104){event.preventDefault();Combat.selectedSceneId=t.dataset.sceneSelectV104;Combat.selectedObject=null;local.preview=null;queueStoreSave();Combat.render();return;}
    if(t.dataset.scenePaletteV104){local.ui.palette=t.dataset.scenePaletteV104;Combat.render();return;}
    if(t.dataset.scenePlaceV105){event.preventDefault();event.stopPropagation();local.ui.pendingPlacement={kind:t.dataset.scenePlaceV105,libraryId:t.dataset.sceneLibraryIdV104||'',entityId:t.dataset.sceneEntityIdV104||'',shape:t.dataset.sceneZoneShapeV104||''};Toast.show('Кликни по карте, чтобы разместить объект','info');return;}
    if(t.id==='scene-import-asset-v104'){importAsset104();return;}
    if(t.id==='scene-add-asset-category-v104'){const input=document.getElementById('scene-new-asset-category-v104'),v=String(input?.value||'').trim();if(v&&!local.store.assetCategories.includes(v)){local.store.assetCategories.push(v);local.ui.assetCategory=v;queueStoreSave();Combat.render();}return;}
    if(t.dataset.sceneFavoriteV104){const a=local.store.assetLibrary.find(x=>x.id===t.dataset.sceneFavoriteV104);if(a){a.favorite=!a.favorite;queueStoreSave();Combat.render();}return;}
    if(t.dataset.sceneActionV104){const action=t.dataset.sceneActionV104;local.ui.pendingPlacement=null;if(action==='clear'){local.preview=null;refreshPreviewDom104();return;}if(['move','attack','grenade'].includes(action)){const current=Combat.getCurrentTurnToken?.();const selected=selectedToken104();if(current&&selected?.id!==current.id)Combat.selectedObject={kind:'token',id:current.id};}local.ui.action=action;Combat.render();return;}
    if(t.id==='scene-next-turn-v104'){Combat.nextTurn?.();queueStoreSave();broadcastScene104();return;}
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
    if(t.id==='scene-category-filter-v104'){local.ui.sceneCategory=t.value;Combat.render();return;}
    if(t.id==='scene-asset-category-v104'){local.ui.assetCategory=t.value;Combat.render();return;}
    if(t.id==='scene-ambient-v104'){const api=audioApi(),sid=Combat.getScene()?.id,value=String(t.value||'');if(!value)api?.stopAmbient?.(sid);else if(value.startsWith('sound:'))api?.setAmbient?.(sid,value.slice(6));else if(value.startsWith('section:')){const parts=value.split(':');api?.setSectionAmbient?.(sid,parts[1],parts[2]||'sequential');}return;}
    if(t.id==='scene-scale-top-v104'){const scene=Combat.getScene();if(scene){scene.scalePerHex=clamp104(t.value,.01,100000);queueStoreSave();Combat.render();broadcastScene104();}return;}
    if(t.id==='scene-fog-top-v104'){const scene=Combat.getScene();if(scene){scene.fogEnabled=t.checked;queueStoreSave();broadcastScene104();}return;}
    if(t.id==='scene-weapon-v105'){const token=selectedToken104();if(token){token.weaponId=String(t.value||'');queueStoreSave();Combat.render();broadcastScene104();}return;}
    if(t.id==='scene-grenade-v105'){const token=selectedToken104();if(token){token.grenadeId=String(t.value||'');queueStoreSave();Combat.render();}return;}
    if(t.matches?.('[data-context-hp-v104],[data-context-hpmax-v104],[data-context-init-v104]')){const sel=selectedObject104();if(sel?.kind==='token'){const menu=t.closest('.scene-context-v104');sel.obj.hpMax=Math.max(1,num(menu.querySelector('[data-context-hpmax-v104]')?.value,sel.obj.hpMax));sel.obj.hpCurrent=clamp104(menu.querySelector('[data-context-hp-v104]')?.value,0,sel.obj.hpMax);sel.obj.initiative=num(menu.querySelector('[data-context-init-v104]')?.value,sel.obj.initiative);Combat.syncInitiative(Combat.getScene()?.id,false);if(sel.obj.playerId){updatePlayerHp105(sel.obj);void persistCombatProfiles105('Сцена: ручное изменение HP');}queueStoreSave();broadcastScene104();}return;}
  },true);
  document.addEventListener('input',event=>{if(event.target.id==='scene-sound-search-v104'){local.ui.soundSearch=event.target.value;clearTimeout(local._soundTimer);local._soundTimer=setTimeout(()=>Combat.render(),120);}if(event.target.id==='scene-unit-search-v104'){local.ui.unitSearch=event.target.value;clearTimeout(local._unitTimer);local._unitTimer=setTimeout(()=>Combat.render(),120);}});
  document.addEventListener('submit',event=>{if(event.target.id==='scene-properties-form-v104'){event.preventDefault();applySceneForm104(event.target);return;}if(event.target.matches?.('[data-object-form-v104]')){event.preventDefault();applyObjectForm104(event.target);}},true);
  document.addEventListener('wheel',event=>{const viewport=event.target.closest?.('#combat-stage-viewport');if(viewport){Combat.handleViewWheel?.(event,viewport);}}, {passive:false,capture:true});
  document.addEventListener('pointerdown',event=>{if(local.context&&!event.target.closest('.scene-context-v104'))closeContext104();},true);
  window.addEventListener('keydown',event=>{if(event.code==='Space'&&UI.activeModuleId==='combat'&&!event.repeat){local.spaceDown=true;document.getElementById('combat-stage-viewport')?.classList.add('space-pan-v105');event.preventDefault();}});
  window.addEventListener('keyup',event=>{if(event.code==='Space'){local.spaceDown=false;document.getElementById('combat-stage-viewport')?.classList.remove('space-pan-v105');}});
})();
