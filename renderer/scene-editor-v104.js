/* v1.0.104 — local-only Scene Editor */
(() => {
  'use strict';
  if (window.__grpgSceneEditorV104 || typeof Combat === 'undefined') return;
  window.__grpgSceneEditorV104 = true;

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
    ui: { palette: 'assets', assetCategory: 'all', sceneCategory: 'all', soundsOpen: false, soundSearch: '', unitSearch: '', action: 'select' },
    draw: null,
    preview: null,
    context: null,
    broadcastRaf: 0
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
    return { version: 2, scenes: {}, runtimes: {}, cameraByScene: {}, categories: ['Общее'], assetCategories: ['Общее'], assetLibrary: [], selectedSceneId: '', legacyImportedAt: null, updatedAt: null };
  }
  function normalizeStore(raw = {}) {
    const next = { ...blankStore(), ...(raw && typeof raw === 'object' ? raw : {}) };
    next.scenes = next.scenes && typeof next.scenes === 'object' && !Array.isArray(next.scenes) ? next.scenes : {};
    next.runtimes = next.runtimes && typeof next.runtimes === 'object' && !Array.isArray(next.runtimes) ? next.runtimes : {};
    next.cameraByScene = next.cameraByScene && typeof next.cameraByScene === 'object' && !Array.isArray(next.cameraByScene) ? next.cameraByScene : {};
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
    local.store.cameraByScene = clone(combat.cameraByScene || {});
    local.store.selectedSceneId = String(Combat.selectedSceneId || local.store.selectedSceneId || '');
    local.store.updatedAt = new Date().toISOString();
    return local.store;
  }
  function applyStore(store) {
    local.store = normalizeStore(store);
    setCombatScenes(local.store.scenes || {});
    const combat = ensureCombatState();
    combat.scenes = clone(local.store.runtimes || {});
    combat.cameraByScene = clone(local.store.cameraByScene || {});
    combat.activeSceneId = '';
    for (const id of Object.keys(COMBAT_SCENES)) ensureCombatRuntime(id);
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
      <div class="field"><label>Дальность видимости</label><input class="input" type="number" min="0" step="0.1" name="combatVisionRange" value="${c.visionRange}" /><div class="small-note">В единицах масштаба сцены.</div></div>
      <div class="field"><label>Дальность движения за ход</label><input class="input" type="number" min="0" step="0.1" name="combatMoveRange" value="${c.moveRange}" /><div class="small-note">В единицах масштаба сцены.</div></div>
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

  function entityForToken(token) {
    if (token?.playerId) return App.state?.users?.[token.playerId] || PLAYER_TEMPLATES?.[token.playerId] || null;
    if (token?.npcId) return Data.getNpc?.(token.npcId) || null;
    return null;
  }
  function scalePerHex(scene) { return Math.max(.01, num(scene?.scalePerHex, 1)); }
  function tokenVisionCells(token, scene) {
    if (num(token?.visionRange, 0) > 0) return num(token.visionRange) / scalePerHex(scene);
    const wc = combatConfig(entityForToken(token) || {});
    if (wc.visionRange > 0) return wc.visionRange / scalePerHex(scene);
    if (num(token?.visionRadius, 0) > 0) return num(token.visionRadius);
    return Math.max(1, num(scene?.visionRadius, COMBAT_DEFAULT_VISION));
  }
  function tokenMoveCells(token, scene) {
    if (num(token?.moveRange, 0) > 0) return num(token.moveRange) / scalePerHex(scene);
    const wc = combatConfig(entityForToken(token) || {});
    return Math.max(.1, (wc.moveRange || DEFAULT_MOVE_WORLD) / scalePerHex(scene));
  }
  function tokenAttackCells(token, scene) {
    if (num(token?.attackRange, 0) > 0) return num(token.attackRange) / scalePerHex(scene);
    const weapon = getCombatTokenWeapon?.(token) || {};
    const candidate = num(weapon.range ?? weapon.maxRange ?? weapon.distance, 0);
    return Math.max(.1, (candidate || DEFAULT_ATTACK_WORLD) / scalePerHex(scene));
  }

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

  function hexGridSvg(scene) {
    const w=Math.max(1,num(scene.width,20)),h=Math.max(1,num(scene.height,12));
    const side=1/Math.sqrt(3), hexH=Math.sqrt(3)*side, stepX=side*1.5;
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
      ${token.image?`<img src="${html(token.image)}" alt="" draggable="false"/>`:`<span class="combat-token-fallback">${html(fallback)}</span>`}<span class="combat-token-name">${html(token.name)}</span><span class="combat-token-hp"><i style="width:${hp}%"></i></span></button>`;
  }
  function assetMarkup(asset,scene){
    const selected=Combat.selectedObject?.kind==='asset'&&Combat.selectedObject?.id===asset.id;
    return `<button class="combat-object combat-asset scene-asset-v104 ${selected?'selected':''}" type="button" data-scene-kind-v104="asset" data-scene-id-v104="${html(asset.id)}" style="${objectStyle(asset,scene,10)}opacity:${clamp104(asset.opacity??1,.05,1)};">${asset.image?`<img src="${html(asset.image)}" alt="" draggable="false"/>`:`<span>◫</span>`}${asset.label?`<span class="combat-object-label">${html(asset.label)}</span>`:''}</button>`;
  }
  function zoneMarkup(zone,scene){
    const selected=Combat.selectedObject?.kind==='zone'&&Combat.selectedObject?.id===zone.id;
    if(['wall','polygon'].includes(zone.shape)&&zone.points?.length>1){
      const points=zone.points.map(p=>`${p.x},${p.y}`).join(' '), color=html(zone.color||'rgba(255,190,92,.75)');
      if(zone.shape==='polygon') return `<svg class="scene-zone-vector-wrap-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polygon class="scene-polygon-v104 ${selected?'selected':''}" data-scene-kind-v104="zone" data-scene-id-v104="${html(zone.id)}" points="${points}" style="--zone-color:${color}"/></svg>`;
      return `<svg class="scene-zone-vector-wrap-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polyline class="scene-wall-v104 ${selected?'selected':''}" data-scene-kind-v104="zone" data-scene-id-v104="${html(zone.id)}" points="${points}" style="--zone-color:${color};stroke-width:${num(zone.thickness,.18)}"/></svg>`;
    }
    return `<button class="combat-object combat-template scene-zone-v104 shape-${html(zone.shape||'circle')} ${selected?'selected':''}" type="button" data-scene-kind-v104="zone" data-scene-id-v104="${html(zone.id)}" style="${objectStyle(zone,scene,25)}--template-color:${html(zone.color||'rgba(255,190,92,.35)')};">${zone.label?`<span class="combat-template-label">${html(zone.label)}</span>`:''}</button>`;
  }
  function previewMarkup(scene) {
    const p=local.preview;if(!p)return '';
    if(p.kind==='route'){
      const points=list(p.points).map(v=>`${v.x},${v.y}`).join(' '), end=p.end||p.points?.[p.points.length-1];
      return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polyline class="scene-route-v104 ${p.limited?'limited':''} ${p.blocked?'blocked':''}" points="${points}"/>${p.limited&&end?`<g class="scene-route-cross-v104" transform="translate(${end.x} ${end.y})"><path d="M-.28-.28 L.28.28 M.28-.28 L-.28.28"/></g>`:''}</svg><div class="scene-measure-label-v104">${html(p.label||'')}</div>`;
    }
    if(p.kind==='measure' || p.kind==='circle' || p.kind==='cone'){
      const a=p.start,b=p.end,r=dist(a,b), label=p.label||`${(r*scalePerHex(scene)).toFixed(1)} ${scene.scaleLabel}`;
      if(p.kind==='circle') return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><circle class="scene-measure-shape-v104" cx="${a.x}" cy="${a.y}" r="${r}"/></svg><div class="scene-measure-label-v104">${html(label)}</div>`;
      if(p.kind==='cone'){
        const ang=Math.atan2(b.y-a.y,b.x-a.x), spread=Math.PI/6;
        const p1={x:a.x+Math.cos(ang-spread)*r,y:a.y+Math.sin(ang-spread)*r},p2={x:a.x+Math.cos(ang+spread)*r,y:a.y+Math.sin(ang+spread)*r};
        return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><path class="scene-measure-shape-v104" d="M ${a.x} ${a.y} L ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y} Z"/></svg><div class="scene-measure-label-v104">${html(label)}</div>`;
      }
      return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><line class="scene-measure-line-v104" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><circle class="scene-measure-dot-v104" cx="${b.x}" cy="${b.y}" r=".12"/></svg><div class="scene-measure-label-v104">${html(label)}</div>`;
    }
    if(p.kind==='wall'&&p.points?.length>1) return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polyline class="scene-wall-preview-v104" points="${p.points.map(v=>`${v.x},${v.y}`).join(' ')}"/></svg>`;
    if(p.kind==='area'&&p.points?.length>1) return `<svg class="scene-preview-svg-v104" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="none"><polygon class="scene-area-preview-v104" points="${p.points.map(v=>`${v.x},${v.y}`).join(' ')}"/></svg>`;
    return '';
  }
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
      <div class="scene-actionbar-v104">${actionButton('select','ВЫБОР')}${actionButton('move','ДВИЖЕНИЕ')}${actionButton('attack','ВЫСТРЕЛ')}${actionButton('measure','ЛИНЕЙКА')}${actionButton('circle','КРУГ')}${actionButton('cone','КОНУС')}${actionButton('wall','СТЕНА')}${actionButton('area','ОБЛАСТЬ')}<button class="ghost" type="button" data-scene-action-v104="clear">ОЧИСТИТЬ ИЗМЕРЕНИЕ</button><span class="scene-action-spacer-v104"></span><span class="scene-round-v104">Раунд ${Math.max(1,num(runtime.round,1))}</span><button class="primary" id="scene-next-turn-v104" type="button">СЛЕДУЮЩИЙ ХОД</button></div>
    </div>`;
  }
  function actionButton(id,label){return `<button class="secondary ${local.ui.action===id?'active':''}" type="button" data-scene-action-v104="${id}">${label}</button>`;}

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
      <div class="scene-palette-grid-v104">${assets.map(a=>`<div class="scene-palette-card-v104" draggable="true" data-scene-drag-v104="asset" data-scene-library-id-v104="${html(a.id)}">${a.image?`<img src="${html(a.image)}" alt=""/>`:'<span>◫</span>'}<b>${html(a.name)}</b><button class="scene-favorite-v104 ${a.favorite?'active':''}" type="button" data-scene-favorite-v104="${html(a.id)}" title="Избранное">★</button><small>${html(a.category)}</small></div>`).join('')||'<div class="small-note">Импортируй изображение или сохрани размещённый ассет как шаблон.</div>'}</div>`;
  }
  function renderUnitPalette104(){
    const q=String(local.ui.unitSearch||'').trim().toLowerCase();
    const players=Object.values(App.state?.users||{}).filter(u=>String(u.role||'').toLowerCase()!=='gm').filter(u=>!q||String(u.displayName||u.name||u.id).toLowerCase().includes(q));
    const npcs=list(NPC_LIST).filter(n=>!q||String(n.name||n.id).toLowerCase().includes(q));
    const card=(kind,id,name,image)=>`<div class="scene-unit-card-v104" draggable="true" data-scene-drag-v104="${kind}" data-scene-entity-id-v104="${html(id)}">${image?`<img src="${html(image)}" alt=""/>`:`<span>${html((name||'?')[0]||'?')}</span>`}<b>${html(name||id)}</b></div>`;
    return `<input class="input" id="scene-unit-search-v104" placeholder="Поиск персонажа или NPC" value="${html(local.ui.unitSearch)}"/><div class="scene-palette-subtitle-v104">ПЕРСОНАЖИ</div><div class="scene-unit-list-v104">${players.map(p=>card('player',p.id,p.displayName||p.name||p.id,p.image||'')).join('')||'<div class="small-note">Нет персонажей.</div>'}</div><div class="scene-palette-subtitle-v104">NPC</div><div class="scene-unit-list-v104">${npcs.map(n=>card('npc',n.id,n.name||n.id,n.image||'')).join('')||'<div class="small-note">Нет NPC.</div>'}</div>`;
  }
  function renderZonePalette104(){
    const zones=[['circle','Круг'],['rect','Прямоугольник'],['cone','Конус'],['line','Линия'],['polygon','Область'],['wall','Стена']];
    return `<div class="small-note">Перетащи зону на карту. Стену можно рисовать мышью в нижнем режиме «СТЕНА».</div><div class="scene-zone-palette-v104">${zones.map(([id,name])=>`<div class="scene-zone-palette-card-v104" draggable="true" data-scene-drag-v104="zone" data-scene-zone-shape-v104="${id}"><span class="zone-icon-v104 shape-${id}"></span><b>${name}</b></div>`).join('')}</div>`;
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
        <div class="field"><label>Инициатива вручную</label><input class="input" type="number" name="initiative" value="${num(o.initiative)}"/></div>
        <div class="cols2"><div class="field"><label>Видимость</label><input class="input" type="number" min="0" step="0.1" name="visionRange" value="${vision}"/><div class="small-note">0 = World Config (${wc.visionRange})</div></div><div class="field"><label>Движение</label><input class="input" type="number" min="0" step="0.1" name="moveRange" value="${move}"/><div class="small-note">0 = World Config (${wc.moveRange})</div></div></div>
        <div class="field"><label>Дальность выстрела</label><input class="input" type="number" min="0" step="0.1" name="attackRange" value="${num(o.attackRange,0)}"/><div class="small-note">0 = ${DEFAULT_ATTACK_WORLD} ${html(scene.scaleLabel)} по умолчанию</div></div>
        <div class="small-note">Эффективно: обзор ${(tokenVisionCells(o,scene)*scalePerHex(scene)).toFixed(1)} · движение ${(tokenMoveCells(o,scene)*scalePerHex(scene)).toFixed(1)} · выстрел ${(tokenAttackCells(o,scene)*scalePerHex(scene)).toFixed(1)} ${html(scene.scaleLabel)}</div>
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
  function renderSounds104(scene){
    const api=audioApi();if(!api)return '<div class="small-note">Аудиобиблиотека недоступна.</div>';
    const q=String(local.ui.soundSearch||'').toLowerCase();
    return `<div class="scene-sound-drawer-v104"><div class="scene-sound-tools-v104"><input class="input" id="scene-sound-search-v104" placeholder="Поиск звука" value="${html(local.ui.soundSearch)}"/><input class="input" id="scene-sound-new-section-v104" placeholder="Новый раздел"/><button class="secondary" id="scene-sound-add-section-v104" type="button">＋ РАЗДЕЛ</button><button class="ghost" id="scene-stop-all-v104" type="button">СТОП ВСЁ</button></div>
      <div class="scene-sound-sections-v104">${list(api.sections).map(section=>{const sounds=list(section.sounds).filter(s=>!q||String(s.name).toLowerCase().includes(q));return `<section class="scene-sound-section-v104"><header><b>${html(section.name)}</b><span><button class="secondary" type="button" data-scene-sound-add-v104="${html(section.id)}">＋ ФАЙЛ</button><button class="ghost" type="button" data-scene-sound-random-v104="${html(section.id)}">RANDOM</button></span></header>${sounds.map(s=>`<div class="scene-sound-row-v104"><span>${html(s.name)}</span><span><button class="ghost" type="button" data-scene-sound-play-v104="${html(s.id)}">▶</button><button class="ghost" type="button" data-scene-sound-stop-v104="${html(s.id)}">■</button><button class="ghost ${api.state.sceneAmbient?.[scene.id]===s.id?'active':''}" type="button" data-scene-sound-ambient-v104="${html(s.id)}">AMBIENT</button><button class="ghost" type="button" data-scene-sound-delete-v104="${html(section.id)}:${html(s.id)}">×</button></span></div>`).join('')||'<div class="small-note">Нет звуков.</div>'}</section>`;}).join('')}</div></div>`;
  }
  function renderTop104(scene,runtime){
    const api=audioApi(), ambientId=api?.state?.sceneAmbient?.[scene.id]||'';
    const sounds=list(api?.sections).flatMap(s=>list(s.sounds).map(x=>({...x,section:s.name}))),current=list(runtime?.initiativeOrder).length?list(runtime.tokens).find(t=>t.id===runtime.initiativeOrder[Math.max(0,Math.min(list(runtime.initiativeOrder).length-1,num(runtime.turnIndex,0)))])||null:null;
    return `<header class="scene-top-v104"><div class="scene-top-title-v104"><span>SCENE_EDITOR</span><b>${html(scene.name)}</b><small>${scene.width}×${scene.height} · 1 гекс = ${scene.scalePerHex} ${html(scene.scaleLabel)}${current?` · Раунд ${Math.max(1,num(runtime.round,1))} · Ход: ${html(current.name)}`:''}</small></div>
      <div class="scene-top-controls-v104"><label>МАСШТАБ <input class="input tiny-v104" id="scene-scale-top-v104" type="number" min=".01" step=".1" value="${scene.scalePerHex}"/></label><label class="scene-top-check-v104"><input type="checkbox" id="scene-fog-top-v104" ${scene.fogEnabled?'checked':''}/> FOG</label>
      <label>ЭМБИЕНТ <select class="select" id="scene-ambient-v104"><option value="">— выключен —</option>${sounds.map(s=>`<option value="${html(s.id)}" ${ambientId===s.id?'selected':''}>${html(s.section)} / ${html(s.name)}</option>`).join('')}</select></label><button class="ghost" id="scene-ambient-stop-v104" type="button">■</button>
      <button class="secondary ${local.ui.soundsOpen?'active':''}" id="scene-sounds-toggle-v104" type="button">ЗВУКИ</button><button class="secondary" id="scene-export-v104" type="button">ЭКСПОРТ</button><button class="secondary" id="scene-import-v104" type="button">ИМПОРТ</button>
      ${window.electronAPI?.openPlayerDisplay?`<button class="${Combat.displayWindowOpen?'danger':'primary'}" id="scene-display-v104" type="button">${Combat.displayWindowOpen?'ЗАКРЫТЬ ВТОРОЙ ЭКРАН':'ВТОРОЙ ЭКРАН'}</button>`:''}</div>
      ${local.ui.soundsOpen?renderSounds104(scene):''}</header>`;
  }

  Combat.render = function() {
    this.refreshPlayerDisplayStatus?.().catch?.(()=>{});
    ensureCombatModuleMarkup();
    const root=document.getElementById('combat-content'); if(!root)return;
    if(!this.isDm()) { root.innerHTML='<div class="card pad18">Сцены доступны только ДМу.</div>'; return; }
    if(!local.loaded){ root.innerHTML='<div class="card pad18">Загрузка локальных сцен…</div>'; loadLocalStore().then(()=>this.render()); return; }
    if(!this.selectedSceneId || !COMBAT_SCENES[this.selectedSceneId]) this.selectedSceneId=COMBAT_SCENE_LIST[0]?.id||null;
    const scene=this.getScene();
    if(!scene){ root.innerHTML=`<div class="scene-empty-v104"><b>Нет сцен</b><button class="primary" id="scene-new-v104" type="button">СОЗДАТЬ СЦЕНУ</button></div>`; return; }
    const runtime=this.getRuntime(scene.id);
    root.innerHTML=`<div class="scene-editor-v104">${renderTop104(scene,runtime)}${renderLeft104()}<main class="scene-center-v104">${renderBoard104(scene,runtime)}</main>${renderInspector104(scene,runtime)}</div>`;
    requestAnimationFrame(()=>{ try{this.syncViewportBoardFrame?.(scene,document.getElementById('combat-stage-viewport'));this.applyViewTransform?.();}catch{} broadcastScene104(); });
    const api=audioApi(); if(api) api.startAmbient(scene.id);
  };

  function addScene104(){
    const scene=createBlankCombatScene();scene.category=local.ui.sceneCategory==='all'?'Общее':local.ui.sceneCategory;scene.scalePerHex=1;scene.scaleLabel='м';scene.parentId='';scene.templates=[];
    COMBAT_SCENES[scene.id]=normalizeCombatScene(scene);sortCombatScenes();ensureCombatRuntime(scene.id);Combat.selectedSceneId=scene.id;Combat.selectedObject=null;queueStoreSave();Combat.render();
  }
  function deleteScene104(sceneId){
    if(!sceneId||!COMBAT_SCENES[sceneId])return;
    if(!confirm(`Удалить сцену «${COMBAT_SCENES[sceneId].name}»?`))return;
    Object.values(COMBAT_SCENES).forEach(s=>{if(s.parentId===sceneId)s.parentId='';});delete COMBAT_SCENES[sceneId];delete ensureCombatState().scenes[sceneId];delete ensureCombatState().cameraByScene?.[sceneId];sortCombatScenes();Combat.selectedSceneId=COMBAT_SCENE_LIST[0]?.id||null;Combat.selectedObject=null;queueStoreSave();Combat.render();broadcastScene104();
  }
  function duplicateScene104(sceneId){
    const scene=COMBAT_SCENES[sceneId];if(!scene)return;const id=makeId('scene');const copy=normalizeCombatScene({...clone(scene),id,name:`${scene.name} — копия`,parentId:scene.parentId||''});COMBAT_SCENES[id]=copy;ensureCombatState().scenes[id]=clone(ensureCombatRuntime(sceneId));sortCombatScenes();Combat.selectedSceneId=id;queueStoreSave();Combat.render();
  }
  async function requestLocalImage104(stem='scene_asset'){
    return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='image/*,.dds,image/vnd.ms-dds,application/octet-stream';input.onchange=async()=>{const file=input.files?.[0];if(!file)return resolve(null);try{const dataUrl=await readImageFileAsRenderableDataUrlV51(file);if(window.electronAPI?.saveLocalCombatAsset){const res=await window.electronAPI.saveLocalCombatAsset({dataUrl,preferredStem:stem});if(res?.ok&&res.url)return resolve(res.url);}resolve(dataUrl);}catch(e){Toast.show(`Не удалось загрузить изображение: ${e?.message||e}`,'err');resolve(null);}};input.click();});
  }
  Combat.requestImage=requestLocalImage104;
  async function importAsset104(){
    const image=await requestLocalImage104('scene_library');if(!image)return;const name=prompt('Название ассета','Новый ассет')||'Новый ассет';const category=local.ui.assetCategory!=='all'&&local.ui.assetCategory!=='favorites'?local.ui.assetCategory:'Общее';local.store.assetLibrary.push(normalizeLibraryAsset({name,image,category}));if(!local.store.assetCategories.includes(category))local.store.assetCategories.push(category);queueStoreSave();Combat.render();
  }
  function placeLibraryAsset104(id, point){const lib=local.store.assetLibrary.find(a=>a.id===id),scene=Combat.getScene();if(!lib||!scene)return;const obj=normalizeCombatAsset({...clone(lib),id:makeId('asset'),libraryId:lib.id,x:point.x-lib.w/2,y:point.y-lib.h/2});scene.assets.push(obj);Combat.selectedObject={kind:'asset',id:obj.id};queueStoreSave();Combat.render();}
  function placeUnit104(kind,id,point){const scene=Combat.getScene(),runtime=Combat.getRuntime();if(!scene||!runtime)return;let token=kind==='player'?createPlayerCombatToken(id):createNpcCombatToken(id);token=normalizeCombatToken({...token,x:point.x-.5,y:point.y-.5,visibleToPlayers:true});runtime.tokens.push(token);Combat.selectedObject={kind:'token',id:token.id};Combat.syncInitiative(scene.id,false);queueStoreSave();Combat.render();}
  function placeZone104(shape,point){const scene=Combat.getScene();if(!scene)return;const dims=shape==='line'?{w:4,h:.5}:shape==='cone'?{w:4,h:4}:shape==='circle'?{w:3,h:3}:{w:3,h:3};const zone=normalizeCombatTemplate({id:makeId('zone'),shape,name:'Зона',label:'',x:point.x-dims.w/2,y:point.y-dims.h/2,w:dims.w,h:dims.h,color:'rgba(255,190,92,.35)',visibleToPlayers:true,blockMovement:false,blockSight:false,points:shape==='wall'?[{x:point.x-1,y:point.y},{x:point.x+1,y:point.y}]:shape==='polygon'?[{x:point.x-1.4,y:point.y-1},{x:point.x+1.4,y:point.y-1},{x:point.x+1.4,y:point.y+1},{x:point.x-1.4,y:point.y+1}]:[]});scene.templates.push(zone);Combat.selectedObject={kind:'zone',id:zone.id};queueStoreSave();Combat.render();broadcastScene104();}

  function selectedObject104(){const s=Combat.getScene(),r=Combat.getRuntime();return s&&r?getSelection(s,r):null;}
  function deleteSelected104(){const scene=Combat.getScene(),runtime=Combat.getRuntime(),sel=selectedObject104();if(!scene||!runtime||!sel)return;if(sel.kind==='token')runtime.tokens=runtime.tokens.filter(x=>x.id!==sel.obj.id);if(sel.kind==='asset')scene.assets=scene.assets.filter(x=>x.id!==sel.obj.id);if(sel.kind==='zone')scene.templates=scene.templates.filter(x=>x.id!==sel.obj.id);Combat.selectedObject=null;Combat.syncInitiative(scene.id,false);queueStoreSave();Combat.render();broadcastScene104();}
  function saveAssetTemplate104(){const sel=selectedObject104();if(sel?.kind!=='asset')return;const a=sel.obj;const category=local.ui.assetCategory!=='all'&&local.ui.assetCategory!=='favorites'?local.ui.assetCategory:'Общее';local.store.assetLibrary.push(normalizeLibraryAsset({...a,id:makeId('assetlib'),category,favorite:false}));if(!local.store.assetCategories.includes(category))local.store.assetCategories.push(category);queueStoreSave();Toast.show('Ассет сохранён в локальную библиотеку','ok');Combat.render();}

  function applyObjectForm104(form){
    const scene=Combat.getScene(),runtime=Combat.getRuntime(),sel=selectedObject104();if(!scene||!runtime||!sel)return;const fd=new FormData(form),o=sel.obj;
    if(sel.kind==='token'){o.name=String(fd.get('name')||o.name);o.hpMax=Math.max(1,num(fd.get('hpMax'),o.hpMax));o.hpCurrent=clamp104(fd.get('hpCurrent'),0,o.hpMax);o.initiative=num(fd.get('initiative'));o.visionRange=Math.max(0,num(fd.get('visionRange')));o.moveRange=Math.max(0,num(fd.get('moveRange')));o.attackRange=Math.max(0,num(fd.get('attackRange')));o.visibleToPlayers=fd.get('visibleToPlayers')==='on';o.sharesVisionWithPlayers=fd.get('sharesVisionWithPlayers')==='on';o.hidden=fd.get('hidden')==='on';o.locked=fd.get('locked')==='on';o.blockMovement=fd.get('blockMovement')==='on';Combat.syncInitiative(scene.id,false);}
    if(sel.kind==='asset'){o.name=String(fd.get('name')||o.name);o.w=clamp104(fd.get('w'),.25,40);o.h=clamp104(fd.get('h'),.25,40);o.rotation=num(fd.get('rotation'));o.opacity=clamp104(fd.get('opacity'),.05,1);o.blockMovement=fd.get('blockMovement')==='on';o.blockSight=fd.get('blockSight')==='on';o.visibleToPlayers=fd.get('visibleToPlayers')==='on';}
    if(sel.kind==='zone'){o.label=String(fd.get('label')||'');o.color=String(fd.get('color')||o.color);if(!['wall','polygon'].includes(o.shape)){o.w=clamp104(fd.get('w'),.25,60);o.h=clamp104(fd.get('h'),.25,60);}else if(o.shape==='wall')o.thickness=clamp104(fd.get('thickness'),.04,4);o.blockMovement=fd.get('blockMovement')==='on';o.blockSight=fd.get('blockSight')==='on';o.visibleToPlayers=fd.get('visibleToPlayers')==='on';}
    queueStoreSave();Combat.render();broadcastScene104();
  }
  function applySceneForm104(form){const scene=Combat.getScene();if(!scene)return;const fd=new FormData(form);scene.name=String(fd.get('name')||scene.name).trim()||'Сцена';scene.category=String(fd.get('category')||'Общее').trim()||'Общее';scene.parentId=String(fd.get('parentId')||'');if(scene.parentId===scene.id||sceneDescendantIds(scene.id).has(scene.parentId))scene.parentId='';scene.width=clamp104(fd.get('width'),8,100);scene.height=clamp104(fd.get('height'),8,100);scene.scalePerHex=clamp104(fd.get('scalePerHex'),.01,100000);scene.scaleLabel=String(fd.get('scaleLabel')||'м').trim()||'м';scene.fogEnabled=fd.get('fogEnabled')==='on';scene.backgroundColor=String(fd.get('backgroundColor')||scene.backgroundColor);if(!local.store.categories.includes(scene.category))local.store.categories.push(scene.category);sortCombatScenes();queueStoreSave();Combat.render();broadcastScene104();}

  function refreshPreviewDom104(){const scene=Combat.getScene(),layer=document.querySelector('#combat-stage .scene-preview-layer-v104');if(scene&&layer)layer.innerHTML=previewMarkup(scene);broadcastScene104();}
  function selectedToken104(){const sel=selectedObject104();return sel?.kind==='token'?sel.obj:null;}
  function makeRoutePreview104(point,attack=false){const scene=Combat.getScene(),token=selectedToken104();if(!scene||!token)return null;const start=centerOf(token);if(attack){const max=tokenAttackCells(token,scene),distance=dist(start,point),limited=distance>max;const ratio=distance>1e-6?max/distance:0;const end=limited?{x:start.x+(point.x-start.x)*ratio,y:start.y+(point.y-start.y)*ratio}:point;return {kind:'route',mode:'attack',points:[start,end],end,limited,label:`Выстрел: ${(Math.min(distance,max)*scalePerHex(scene)).toFixed(1)} / ${(max*scalePerHex(scene)).toFixed(1)} ${scene.scaleLabel}`};}
    const path=findPath(scene,start,point,token.id),totalMax=tokenMoveCells(token,scene),spentWorld=Math.max(0,num(token.movedThisTurn)),spentCells=spentWorld/scalePerHex(scene),max=Math.max(0,totalMax-spentCells);if(!path){return {kind:'route',mode:'move',points:[start],end:start,limited:true,blocked:true,label:'Путь заблокирован'};}const cut=truncatePath(path,max),usedWorld=Math.min(pathLength(path),max)*scalePerHex(scene),remainingWorld=Math.max(0,max*scalePerHex(scene));return {kind:'route',mode:'move',points:cut.points,end:cut.end,limited:cut.limited,label:`Движение: ${usedWorld.toFixed(1)} / осталось ${remainingWorld.toFixed(1)} ${scene.scaleLabel}`};}
  function commitMove104(){const token=selectedToken104(),scene=Combat.getScene(),p=local.preview;if(!token||!scene||p?.kind!=='route'||p.mode!=='move'||p.blocked)return;token.x=clamp104(p.end.x-token.w/2,0,Math.max(0,scene.width-token.w));token.y=clamp104(p.end.y-token.h/2,0,Math.max(0,scene.height-token.h));token.movedThisTurn=num(token.movedThisTurn)+pathLength(p.points)*scalePerHex(scene);queueStoreSave();Combat.render();broadcastScene104();}

  function startBoardPointer104(event){
    const stage=event.target.closest?.('#combat-stage');if(!stage||event.button!==0)return;const scene=Combat.getScene();if(!scene)return;const point=scenePointFromEvent(event,stage,scene),object=event.target.closest?.('[data-scene-kind-v104]');
    if(local.ui.action==='select'){
      if(object){Combat.selectedObject={kind:object.dataset.sceneKindV104,id:object.dataset.sceneIdV104};const sel=selectedObject104();if(sel&&!sel.obj.locked){local.draw={kind:'drag',pointerId:event.pointerId,start:point,objectKind:sel.kind,id:sel.obj.id,ox:num(sel.obj.x),oy:num(sel.obj.y),node:object};stage.setPointerCapture?.(event.pointerId);}else Combat.render();}
      else{Combat.selectedObject=null;Combat.render();}return;
    }
    if(local.ui.action==='move'){local.preview=makeRoutePreview104(point,false);refreshPreviewDom104();commitMove104();return;}
    if(local.ui.action==='attack'){local.preview=makeRoutePreview104(point,true);refreshPreviewDom104();return;}
    if(['measure','circle','cone'].includes(local.ui.action)){local.draw={kind:local.ui.action,pointerId:event.pointerId,start:point};local.preview={kind:local.ui.action,start:point,end:point};stage.setPointerCapture?.(event.pointerId);refreshPreviewDom104();return;}
    if(['wall','area'].includes(local.ui.action)){local.draw={kind:local.ui.action,pointerId:event.pointerId,points:[point],last:point};local.preview={kind:local.ui.action,points:[point]};stage.setPointerCapture?.(event.pointerId);refreshPreviewDom104();}
  }
  function moveBoardPointer104(event){
    const stage=document.getElementById('combat-stage'),scene=Combat.getScene();if(!stage||!scene)return;const point=scenePointFromEvent(event,stage,scene);
    if(!local.draw && (local.ui.action==='move'||local.ui.action==='attack')){local.preview=makeRoutePreview104(point,local.ui.action==='attack');refreshPreviewDom104();return;}
    const d=local.draw;if(!d)return;
    if(d.kind==='drag'){
      const sel=selectedObject104();if(!sel)return;const dx=point.x-d.start.x,dy=point.y-d.start.y;sel.obj.x=clamp104(d.ox+dx,0,Math.max(0,scene.width-num(sel.obj.w,1)));sel.obj.y=clamp104(d.oy+dy,0,Math.max(0,scene.height-num(sel.obj.h,1)));if(d.node){d.node.style.left=`${sel.obj.x/scene.width*100}%`;d.node.style.top=`${sel.obj.y/scene.height*100}%`;}broadcastScene104();return;
    }
    if(['measure','circle','cone'].includes(d.kind)){local.preview={kind:d.kind,start:d.start,end:point,label:`${(dist(d.start,point)*scalePerHex(scene)).toFixed(1)} ${scene.scaleLabel}`};refreshPreviewDom104();return;}
    if(['wall','area'].includes(d.kind) && dist(d.last,point)>.18){d.points.push(point);d.last=point;local.preview={kind:d.kind,points:d.points};refreshPreviewDom104();}
  }
  function endBoardPointer104(){
    const d=local.draw;if(!d)return;local.draw=null;
    if(d.kind==='drag'){queueStoreSave();Combat.render();broadcastScene104();return;}
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
    const scene=Combat.getScene();if(!scene)return null;const runtime=clone(Combat.getRuntime(scene.id)||{});runtime.tokens=list(runtime.tokens).map(t=>({...t,resolvedVisionCells:tokenVisionCells(t,scene),resolvedMoveCells:tokenMoveCells(t,scene),resolvedAttackCells:tokenAttackCells(t,scene)}));
    return {version:2,scene:clone(scene),runtime,preview:clone(local.preview),sentAt:new Date().toISOString()};
  }
  Combat.broadcastPlayerDisplayMirror = function(sceneId=this.getSceneIdForView()){
    if(!this.isDm()||!window.electronAPI?.updatePlayerDisplayView)return;
    const combat=this.getCombatState(),scene=sceneId&&COMBAT_SCENES[sceneId]?COMBAT_SCENES[sceneId]:this.getScene();
    window.electronAPI.updatePlayerDisplayView({mode:'combat',eraTheme:document.documentElement?.dataset?.eraTheme||'technological',activeSceneId:scene?.id||'',cameraByScene:clone(combat.cameraByScene||{}),combatSnapshot:buildCombatSnapshot104(),activeRegionMapId:'',updatedAt:new Date().toISOString()}).catch(()=>{});
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
    if(!payload)return;const incoming=normalizeStore(payload.store||payload);local.store=incoming;applyStore(incoming);const api=audioApi();if(payload.audioLibrary&&api){api.stopAll?.();const lib=clone(payload.audioLibrary);lib.sections=list(lib.sections).map(section=>({id:String(section.id||makeId('sound_section')),name:String(section.name||'Общее'),sounds:list(section.sounds).map(sound=>({id:String(sound.id||makeId('sound')),name:String(sound.name||'Звук'),url:String(sound.url||sound.file||''),file:String(sound.file||sound.url||''),createdAt:sound.createdAt||new Date().toISOString()})).filter(sound=>sound.url)}));if(!lib.sections.length)lib.sections=[{id:'general',name:'Общее',sounds:[]}];lib.sceneAmbient=lib.sceneAmbient&&typeof lib.sceneAmbient==='object'?lib.sceneAmbient:{};api.state=lib;api.save();}else if(payload.audioAmbient&&api){api.state.sceneAmbient={...api.state.sceneAmbient,...payload.audioAmbient};api.save();}local.loaded=true;await saveStoreNow();Combat.render();broadcastScene104();Toast.show('Архив сцен, ассетов и звуков импортирован','ok');
  }

  // Ambient: selecting the active track again or Stop really disables it for that scene.
  const api=audioApi();
  if(api){
    const stopBefore104=api.stopAmbient.bind(api), setBefore104=api.setAmbient.bind(api);
    api.stopAmbient=function(sceneId=''){
      const sid=String(sceneId||((UI.activeModuleId==='combat'&&Combat.getSceneIdForView?.())||'')).trim();
      if(sid&&this.state?.sceneAmbient){delete this.state.sceneAmbient[sid];this.save();}
      stopBefore104();
    };
    api.setAmbient=function(sceneId,soundId){const sid=String(sceneId||'').trim(),sound=String(soundId||'').trim();if(!sid)return;if(this.state.sceneAmbient?.[sid]===sound){this.stopAmbient(sid);Combat.render();return;}if(!sound){this.stopAmbient(sid);Combat.render();return;}return setBefore104(sid,sound);};
  }

  // New module is DM-only; leaving it always closes the player display.
  async function closeDisplayQuiet104(){try{await window.electronAPI?.closePlayerDisplay?.();Combat.displayWindowOpen=false;}catch{}}
  const openModuleBefore104=UI.openModule.bind(UI);
  UI.openModule=function(id,options={}){if(id==='combat'&&!Combat.isDm()){Toast.show('Сцены доступны только ДМу','info');return;}if(this.activeModuleId==='combat'&&id!=='combat')closeDisplayQuiet104();return openModuleBefore104(id,options);};
  const closeModuleBefore104=UI.closeModule.bind(UI);
  UI.closeModule=function(...args){const wasCombat=this.activeModuleId==='combat';const result=closeModuleBefore104(...args);if(wasCombat){local.preview=null;closeDisplayQuiet104();audioApi()?.stopAll?.();}return result;};
  const updateBootBefore104=App.updateBootView.bind(App);
  App.updateBootView=function(){const result=updateBootBefore104();ensureCombatModuleMarkup();const button=document.getElementById('open-combat');if(button){button.style.display=Combat.isDm()?'grid':'none';button.dataset.label='СЦЕНЫ';}return result;};
  window.addEventListener('beforeunload',()=>{try{window.electronAPI?.closePlayerDisplay?.();}catch{}});

  const initBefore104=App.init.bind(App);
  App.init=async function(){const result=await initBefore104();await loadLocalStore();ensureCombatModuleMarkup();const button=document.getElementById('open-combat');if(button){button.style.display=Combat.isDm()?'grid':'none';button.dataset.label='СЦЕНЫ';}return result;};
  const finishLoginBefore104=App.finishLogin.bind(App);
  App.finishLogin=function(){const result=finishLoginBefore104();ensureCombatModuleMarkup();const button=document.getElementById('open-combat');if(button){button.style.display=Combat.isDm()?'grid':'none';button.dataset.label='СЦЕНЫ';}return result;};
  const logoutBefore104=App.logout.bind(App);
  App.logout=function(){closeDisplayQuiet104();return logoutBefore104();};

  document.addEventListener('dragstart',event=>{
    const item=event.target.closest?.('[data-scene-drag-v104]');if(!item)return;const payload={kind:item.dataset.sceneDragV104,libraryId:item.dataset.sceneLibraryIdV104||'',entityId:item.dataset.sceneEntityIdV104||'',shape:item.dataset.sceneZoneShapeV104||''};event.dataTransfer?.setData('application/x-grpgi-scene',JSON.stringify(payload));event.dataTransfer.effectAllowed='copy';
  });
  document.addEventListener('dragover',event=>{if(event.target.closest?.('#combat-stage')){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';}});
  document.addEventListener('drop',event=>{const stage=event.target.closest?.('#combat-stage');if(!stage)return;event.preventDefault();let payload;try{payload=JSON.parse(event.dataTransfer?.getData('application/x-grpgi-scene')||'{}');}catch{return;}const scene=Combat.getScene();if(!scene)return;const p=scenePointFromEvent(event,stage,scene);if(payload.kind==='asset')placeLibraryAsset104(payload.libraryId,p);if(payload.kind==='player'||payload.kind==='npc')placeUnit104(payload.kind,payload.entityId,p);if(payload.kind==='zone')placeZone104(payload.shape,p);});
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
    if(t.id==='scene-import-asset-v104'){importAsset104();return;}
    if(t.id==='scene-add-asset-category-v104'){const input=document.getElementById('scene-new-asset-category-v104'),v=String(input?.value||'').trim();if(v&&!local.store.assetCategories.includes(v)){local.store.assetCategories.push(v);local.ui.assetCategory=v;queueStoreSave();Combat.render();}return;}
    if(t.dataset.sceneFavoriteV104){const a=local.store.assetLibrary.find(x=>x.id===t.dataset.sceneFavoriteV104);if(a){a.favorite=!a.favorite;queueStoreSave();Combat.render();}return;}
    if(t.dataset.sceneActionV104){const action=t.dataset.sceneActionV104;if(action==='clear'){local.preview=null;refreshPreviewDom104();return;}local.ui.action=action;Combat.render();return;}
    if(t.id==='scene-next-turn-v104'){Combat.nextTurn?.();queueStoreSave();broadcastScene104();return;}
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
    if(t.dataset.sceneSoundDeleteV104){const [sectionId,soundId]=String(t.dataset.sceneSoundDeleteV104).split(':');audioApi()?.deleteSound?.(sectionId,soundId);return;}
    if(t.dataset.contextToggleV104){const sel=selectedObject104();if(sel){sel.obj[t.dataset.contextToggleV104]=!sel.obj[t.dataset.contextToggleV104];queueStoreSave();closeContext104();Combat.render();broadcastScene104();}return;}
    if(t.dataset.contextDeleteV104){closeContext104();deleteSelected104();return;}
  },true);
  document.addEventListener('change',event=>{
    const t=event.target;
    if(t.id==='scene-category-filter-v104'){local.ui.sceneCategory=t.value;Combat.render();return;}
    if(t.id==='scene-asset-category-v104'){local.ui.assetCategory=t.value;Combat.render();return;}
    if(t.id==='scene-ambient-v104'){audioApi()?.setAmbient?.(Combat.getScene()?.id,t.value);return;}
    if(t.id==='scene-scale-top-v104'){const scene=Combat.getScene();if(scene){scene.scalePerHex=clamp104(t.value,.01,100000);queueStoreSave();Combat.render();broadcastScene104();}return;}
    if(t.id==='scene-fog-top-v104'){const scene=Combat.getScene();if(scene){scene.fogEnabled=t.checked;queueStoreSave();broadcastScene104();}return;}
    if(t.matches?.('[data-context-hp-v104],[data-context-hpmax-v104],[data-context-init-v104]')){const sel=selectedObject104();if(sel?.kind==='token'){const menu=t.closest('.scene-context-v104');sel.obj.hpMax=Math.max(1,num(menu.querySelector('[data-context-hpmax-v104]')?.value,sel.obj.hpMax));sel.obj.hpCurrent=clamp104(menu.querySelector('[data-context-hp-v104]')?.value,0,sel.obj.hpMax);sel.obj.initiative=num(menu.querySelector('[data-context-init-v104]')?.value,sel.obj.initiative);Combat.syncInitiative(Combat.getScene()?.id,false);queueStoreSave();broadcastScene104();}return;}
  },true);
  document.addEventListener('input',event=>{if(event.target.id==='scene-sound-search-v104'){local.ui.soundSearch=event.target.value;clearTimeout(local._soundTimer);local._soundTimer=setTimeout(()=>Combat.render(),120);}if(event.target.id==='scene-unit-search-v104'){local.ui.unitSearch=event.target.value;clearTimeout(local._unitTimer);local._unitTimer=setTimeout(()=>Combat.render(),120);}});
  document.addEventListener('submit',event=>{if(event.target.id==='scene-properties-form-v104'){event.preventDefault();applySceneForm104(event.target);return;}if(event.target.matches?.('[data-object-form-v104]')){event.preventDefault();applyObjectForm104(event.target);}},true);
  document.addEventListener('wheel',event=>{const viewport=event.target.closest?.('#combat-stage-viewport');if(viewport){Combat.handleViewWheel?.(event,viewport);}}, {passive:false,capture:true});
  document.addEventListener('pointerdown',event=>{if(local.context&&!event.target.closest('.scene-context-v104'))closeContext104();},true);
})();
