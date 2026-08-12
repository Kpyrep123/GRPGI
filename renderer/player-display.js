
const root = document.getElementById('player-display-root');
let playerDisplayMirror = { eraTheme: 'technological', activeSceneId: '', cameraByScene: {}, updatedAt: null };

function normalizeMirrorPayload(payload = {}) {
  return {
    mode: String(payload?.mode || '').trim(),
    eraTheme: ['medieval','industrial','technological'].includes(String(payload?.eraTheme || '').trim()) ? String(payload.eraTheme).trim() : 'technological',
    activeRegionMapId: String(payload?.activeRegionMapId || '').trim(),
    activeSceneId: String(payload?.activeSceneId || '').trim(),
    cameraByScene: payload?.cameraByScene && typeof payload.cameraByScene === 'object' ? payload.cameraByScene : {},
    regionCamera: payload?.regionCamera && typeof payload.regionCamera === 'object' ? payload.regionCamera : null,
    regionDisplay: payload?.regionDisplay && typeof payload.regionDisplay === 'object' ? payload.regionDisplay : null,
    regionRuntime: payload?.regionRuntime && typeof payload.regionRuntime === 'object' ? payload.regionRuntime : null,
    selectedRegionTokenId: String(payload?.selectedRegionTokenId || '').trim(),
    updatedAt: payload?.updatedAt || null
  };
}

function applyPlayerDisplayEraTheme() {
  const era = ['medieval','industrial','technological'].includes(String(playerDisplayMirror?.eraTheme || '')) ? playerDisplayMirror.eraTheme : 'technological';
  document.documentElement.dataset.eraTheme = era;
  document.body?.setAttribute('data-era-theme', era);
}

function esc(v = '') {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, Number(v || 0))); }
function scaleMirroredPan(rawPan, destinationSize, sourceSize) {
  const dst = Math.max(1, Number(destinationSize || 1));
  const src = Math.max(1, Number(sourceSize || dst));
  return Number(rawPan || 0) * (dst / src);
}
function clampMirroredView(view, viewportWidth, viewportHeight) {
  const zoom = clamp(Number(view.zoom || 1), 0.45, 3.5);
  const width = Math.max(1, Number(viewportWidth || window.innerWidth || 1280));
  const height = Math.max(1, Number(viewportHeight || window.innerHeight || 720));
  const maxPanX = width * Math.max(0.18, (zoom - 1) * 0.62 + 0.18);
  const maxPanY = height * Math.max(0.18, (zoom - 1) * 0.62 + 0.18);
  return {
    zoom,
    panX: clamp(Number(view.panX || 0), -maxPanX, maxPanX),
    panY: clamp(Number(view.panY || 0), -maxPanY, maxPanY)
  };
}
function initials(name = '', fallback = '•') {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  return words.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || fallback;
}
function normalizeScene(scene = {}) {
  return {
    id: String(scene.id || '').trim(),
    name: String(scene.name || 'Сцена').trim() || 'Сцена',
    width: Math.max(8, Number(scene.width || 16)),
    height: Math.max(8, Number(scene.height || 10)),
    backgroundColor: String(scene.backgroundColor || '#0a1119').trim() || '#0a1119',
    backgroundImage: String(scene.backgroundImage || '').trim(),
    gridColor: String(scene.gridColor || 'rgba(125,249,255,.12)').trim() || 'rgba(125,249,255,.12)',
    mode: String(scene.mode || 'combat').trim() === 'standard' ? 'standard' : 'combat',
    fogEnabled: Boolean(scene.fogEnabled),
    visionRadius: Math.max(1, Number(scene.visionRadius || 6)),
    assets: Array.isArray(scene.assets) ? scene.assets : [],
    templates: Array.isArray(scene.templates) ? scene.templates : []
  };
}
function normalizeToken(token = {}) {
  return {
    id: String(token.id || '').trim(),
    name: String(token.name || 'Юнит').trim() || 'Юнит',
    image: String(token.image || '').trim(),
    color: String(token.color || '#7df9ff').trim() || '#7df9ff',
    x: Number(token.x || 0),
    y: Number(token.y || 0),
    w: Math.max(.5, Number(token.w || 1)),
    h: Math.max(.5, Number(token.h || 1)),
    rotation: Number(token.rotation || 0),
    hpCurrent: Number(token.hpCurrent || token.hpMax || 1),
    hpMax: Math.max(1, Number(token.hpMax || token.hpCurrent || 1)),
    hidden: Boolean(token.hidden),
    playerId: String(token.playerId || '').trim(),
    visionRadius: Math.max(1, Number(token.visionRadius || 0))
  };
}
function getBlockingCells(scene) {
  const blocked = new Set();
  const addRect = (x, y, w, h) => {
    const minX = clamp(Math.floor(x), 0, scene.width - 1);
    const minY = clamp(Math.floor(y), 0, scene.height - 1);
    const maxX = clamp(Math.ceil(x + w) - 1, 0, scene.width - 1);
    const maxY = clamp(Math.ceil(y + h) - 1, 0, scene.height - 1);
    for (let yy = minY; yy <= maxY; yy += 1) for (let xx = minX; xx <= maxX; xx += 1) blocked.add(`${xx}:${yy}`);
  };
  (scene.assets || []).filter(item => item.blockSight).forEach(item => addRect(item.x, item.y, item.w, item.h));
  (scene.templates || []).filter(item => item.blockSight).forEach(item => addRect(item.x, item.y, item.w, item.h));
  return blocked;
}
function hasLineOfSight(scene, fromX, fromY, toX, toY, blocked) {
  let x0 = Math.floor(fromX), y0 = Math.floor(fromY), x1 = Math.floor(toX), y1 = Math.floor(toY);
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (!(x0 === x1 && y0 === y1)) {
    if (!(x0 === Math.floor(fromX) && y0 === Math.floor(fromY)) && blocked.has(`${x0}:${y0}`)) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return !blocked.has(`${x1}:${y1}`) || (Math.floor(toX) === Math.floor(fromX) && Math.floor(toY) === Math.floor(fromY));
}
function computeTeamVisibility(scene, runtime) {
  if (!scene.fogEnabled) return null;
  const ownTokens = runtime.tokens.filter(token => token.playerId && !token.hidden);
  if (!ownTokens.length) return null;
  const visible = new Set();
  const blocked = getBlockingCells(scene);
  ownTokens.forEach(token => {
    const radius = Math.max(1, Number(token.visionRadius || scene.visionRadius || 6));
    const centerX = Number(token.x || 0) + Number(token.w || 1) / 2;
    const centerY = Number(token.y || 0) + Number(token.h || 1) / 2;
    for (let y = 0; y < scene.height; y += 1) {
      for (let x = 0; x < scene.width; x += 1) {
        const dx = x + 0.5 - centerX;
        const dy = y + 0.5 - centerY;
        if (Math.sqrt(dx * dx + dy * dy) > radius) continue;
        if (hasLineOfSight(scene, centerX, centerY, x + 0.5, y + 0.5, blocked)) visible.add(`${x}:${y}`);
      }
    }
  });
  return visible;
}
function renderFog(scene, visibleCells) {
  if (!scene.fogEnabled || !visibleCells) return '';
  const out = [];
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      if (visibleCells.has(`${x}:${y}`)) continue;
      out.push(`<div class="combat-fog-cell" style="left:${(x / scene.width) * 100}%;top:${(y / scene.height) * 100}%;width:${100 / scene.width}%;height:${100 / scene.height}%"></div>`);
    }
  }
  return out.join('');
}
function renderStage(world = {}, state = {}) {
  const combatState = state?.toolState?.combat || {};
  const activeSceneId = String(playerDisplayMirror.activeSceneId || combatState.activeSceneId || '').trim();
  const scenes = world?.combatScenes?.COMBAT_SCENES || world?.combatScenes || {};
  const scene = activeSceneId && scenes[activeSceneId] ? normalizeScene(scenes[activeSceneId]) : null;
  const runtime = {
    tokens: Array.isArray(combatState?.scenes?.[activeSceneId]?.tokens) ? combatState.scenes[activeSceneId].tokens.map(normalizeToken) : [],
    initiativeOrder: Array.isArray(combatState?.scenes?.[activeSceneId]?.initiativeOrder) ? combatState.scenes[activeSceneId].initiativeOrder.map(String) : [],
    turnIndex: Math.max(0, Number(combatState?.scenes?.[activeSceneId]?.turnIndex || 0)),
    round: Math.max(1, Number(combatState?.scenes?.[activeSceneId]?.round || 1))
  };
  if (!scene) {
    root.innerHTML = '<div class="player-display-stage player-display-stage--blank"></div>';
    return;
  }
  const currentTurnToken = runtime.initiativeOrder.length
    ? runtime.tokens.find(token => token.id === runtime.initiativeOrder[runtime.turnIndex]) || null
    : null;
  const visibleCells = computeTeamVisibility(scene, runtime);
  const rawCamera = playerDisplayMirror?.cameraByScene?.[activeSceneId] || combatState?.cameraByScene?.[activeSceneId] || {};
  const viewportWidth = Math.max(1, Number(window.innerWidth || document.documentElement?.clientWidth || 1));
  const viewportHeight = Math.max(1, Number(window.innerHeight || document.documentElement?.clientHeight || 1));
  const sceneAspect = Math.max(.1, Number(scene.width || 1) / Math.max(1, Number(scene.height || 1)));
  let boardWidth = viewportWidth;
  let boardHeight = boardWidth / sceneAspect;
  if (boardHeight > viewportHeight) {
    boardHeight = viewportHeight;
    boardWidth = boardHeight * sceneAspect;
  }
  const sourceViewportWidth = Math.max(1, Number(rawCamera.boardWidth || rawCamera.viewportWidth || boardWidth));
  const sourceViewportHeight = Math.max(1, Number(rawCamera.boardHeight || rawCamera.viewportHeight || boardHeight));
  const mirroredView = clampMirroredView({
    zoom: Number(rawCamera.zoom || 1),
    panX: scaleMirroredPan(rawCamera.panX, boardWidth, sourceViewportWidth),
    panY: scaleMirroredPan(rawCamera.panY, boardHeight, sourceViewportHeight)
  }, boardWidth, boardHeight);
  const zoom = mirroredView.zoom;
  const panX = mirroredView.panX;
  const panY = mirroredView.panY;
  root.innerHTML = `
    <div class="player-display-stage">
      <div class="player-display-board-frame" style="width:${boardWidth.toFixed(2)}px;height:${boardHeight.toFixed(2)}px;">
        <div class="combat-stage-viewport player-display-viewport" data-scene-id="${esc(scene.id)}">
          <div class="combat-stage" style="--combat-cols:${scene.width};--combat-rows:${scene.height};background:${esc(scene.backgroundColor)};transform:translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px) scale(${zoom.toFixed(3)});">
          <div class="combat-stage-bg" style="${scene.backgroundImage ? `background-image:url('${esc(scene.backgroundImage)}');` : ''}"></div>
          <div class="combat-stage-grid" style="--combat-grid-color:${esc(scene.gridColor)}"></div>
          <div class="combat-stage-layer combat-assets-layer">
            ${(scene.assets || []).map(asset => `
              <div class="combat-object combat-asset" style="left:${(asset.x / scene.width) * 100}%;top:${(asset.y / scene.height) * 100}%;width:${(asset.w / scene.width) * 100}%;height:${(asset.h / scene.height) * 100}%;transform:rotate(${Number(asset.rotation || 0)}deg);z-index:${Number(asset.z || 10)};opacity:${Number(asset.opacity || 1)};">
                ${asset.image ? `<img src="${esc(asset.image)}" alt="${esc(asset.name || '')}" />` : `<span>${esc(initials(asset.name, '◫'))}</span>`}
                ${asset.label ? `<span class="combat-object-label">${esc(asset.label)}</span>` : ''}
              </div>`).join('')}
          </div>
          <div class="combat-stage-layer combat-templates-layer">
            ${(scene.templates || []).filter(template => template.visibleToPlayers).map(template => {
              const style = `left:${(template.x / scene.width) * 100}%;top:${(template.y / scene.height) * 100}%;width:${(template.w / scene.width) * 100}%;height:${(template.h / scene.height) * 100}%;transform:rotate(${Number(template.rotation || 0)}deg);--template-color:${esc(template.color || 'rgba(255,190,92,.35)')};z-index:${Number(template.z || 20)};`;
              return `<div class="combat-object combat-template shape-${esc(template.shape || 'circle')}" style="${style}">${template.label ? `<span class="combat-template-label">${esc(template.label)}</span>` : ''}</div>`;
            }).join('')}
          </div>
          <div class="combat-stage-layer combat-tokens-layer">
            ${runtime.tokens.filter(token => !token.hidden).map(token => {
              const currentTurn = currentTurnToken?.id === token.id;
              const hpPct = clamp((Number(token.hpCurrent || 0) / Math.max(1, Number(token.hpMax || 1))) * 100, 0, 100);
              return `
                <div class="combat-object combat-token ${currentTurn ? 'turn' : ''}" style="left:${(token.x / scene.width) * 100}%;top:${(token.y / scene.height) * 100}%;width:${(token.w / scene.width) * 100}%;height:${(token.h / scene.height) * 100}%;transform:rotate(${Number(token.rotation || 0)}deg);--token-accent:${esc(token.color || '#7df9ff')};">
                  ${token.image ? `<img src="${esc(token.image)}" alt="${esc(token.name)}" />` : `<span class="combat-token-fallback">${esc(initials(token.name, '✦'))}</span>`}
                  <span class="combat-token-name">${esc(token.name)}</span>
                  <span class="combat-token-hp"><i style="width:${hpPct}%"></i></span>
                </div>`;
            }).join('')}
          </div>
            <div class="combat-stage-layer combat-fog-layer">${renderFog(scene, visibleCells)}</div>
          </div>
        </div>
      </div>
    </div>`;
}
let lastSignature = '';
let playerDisplayRefreshInFlight = false;
let playerDisplayCachedWorld = {};
let playerDisplayCachedState = {};
async function refresh() {
  if (playerDisplayRefreshInFlight) return;
  playerDisplayRefreshInFlight = true;
  try {
    const [state, worldRes] = await Promise.all([
      window.electronAPI?.loadState?.(),
      window.electronAPI?.loadWorldData?.()
    ]);
    const world = worldRes?.world || {};
    playerDisplayCachedWorld = world;
    playerDisplayCachedState = state || {};
    const regionActive = playerDisplayMirror?.mode === 'region' || playerDisplayMirror?.activeRegionMapId || state?.toolState?.regionRuntime?.activeMapId;
    if (regionActive) { syncRegionDisplayV36(world, state || {}); return; }
    stopRegionDisplayV36();
    const signature = JSON.stringify({
      mode: playerDisplayMirror.mode || '',
      activeSceneId: playerDisplayMirror.activeSceneId || state?.toolState?.combat?.activeSceneId || '',
      scene: world?.combatScenes?.COMBAT_SCENES?.[state?.toolState?.combat?.activeSceneId || ''] || world?.combatScenes?.[state?.toolState?.combat?.activeSceneId || ''] || null,
      runtime: state?.toolState?.combat?.scenes?.[state?.toolState?.combat?.activeSceneId || ''] || null,
      camera: playerDisplayMirror?.cameraByScene?.[playerDisplayMirror.activeSceneId || state?.toolState?.combat?.activeSceneId || ''] || state?.toolState?.combat?.cameraByScene?.[state?.toolState?.combat?.activeSceneId || ''] || null
    });
    if (signature !== lastSignature) {
      lastSignature = signature;
      renderStage(world, state || {});
    }
  } catch (error) {
    root.innerHTML = '<div class="player-display-stage player-display-stage--blank"></div>';
    console.error('player-display refresh failed', error);
  } finally {
    playerDisplayRefreshInFlight = false;
  }
}
setInterval(refresh, 10000); // fallback only; normal updates arrive through IPC events
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('resize', () => { sizeRegionDisplayFrameV36(); if (!isRegionDisplayActiveV36()) refresh(); });
let playerDisplayDataRefreshTimer = 0;
function queuePlayerDisplayDataRefresh(delay = 120) {
  clearTimeout(playerDisplayDataRefreshTimer);
  playerDisplayDataRefreshTimer = setTimeout(() => {
    playerDisplayDataRefreshTimer = 0;
    refresh();
  }, Math.max(0, Number(delay || 0)));
}
window.electronAPI?.onPlayerDisplayDataChanged?.(() => queuePlayerDisplayDataRefresh());
window.electronAPI?.onCombatRuntimeEvent?.(() => queuePlayerDisplayDataRefresh(40));
refresh();

window.electronAPI?.getPlayerDisplayView?.().then(res => {
  if (res?.ok && res.payload) {
    playerDisplayMirror = normalizeMirrorPayload(res.payload);
    applyPlayerDisplayEraTheme();
    refresh();
  }
}).catch(() => {});
window.electronAPI?.onPlayerDisplayView?.(payload => {
  playerDisplayMirror = normalizeMirrorPayload(payload);
  applyPlayerDisplayEraTheme();
  if (playerDisplayMirror.mode === 'region' || playerDisplayMirror.activeRegionMapId) {
    if (playerDisplayMirror.regionCamera) {
      regionDisplayV36.cameraTarget = {
        zoom: Number(playerDisplayMirror.regionCamera.zoom || 1),
        panFracX: Number(playerDisplayMirror.regionCamera.panFracX || 0),
        panFracY: Number(playerDisplayMirror.regionCamera.panFracY || 0)
      };
    }
    if (Object.keys(playerDisplayCachedWorld || {}).length) syncRegionDisplayV36(playerDisplayCachedWorld, playerDisplayCachedState || {});
    else refresh();
    return;
  }
  refresh();
});


/* v1.0.43 player display: complete Region Command Center mirror with bounded memory */
let regionDisplayV36 = {
  mapId: '', structSig: '', map: null, ships: {}, radars: {}, missilesCatalog: {}, users: {},
  frame: null, stage: null, fogCanvas: null, tokenNodes: {}, rangeNodes: {}, radarNodes: {}, contactNodes: {},
  routeNodes: {}, missileNodes: {}, missileRouteNodes: {}, camera: { zoom: 1, panX: 0, panY: 0 },
  cameraTarget: { zoom: 1, panFracX: 0, panFracY: 0 }, frameW: 0, frameH: 0, raf: 0, fogClouds: null
};

function listV43(value) { return Array.isArray(value) ? value : []; }
function dictV43(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function imageSigV43(value = '') {
  const raw = String(value || '');
  return [raw.length, raw.slice(0, 28), raw.slice(-16)];
}
function regionDisplayOptionsV43() {
  const raw = playerDisplayMirror?.regionDisplay || {};
  return {
    layers: {
      grid: raw.layers?.grid !== false,
      labels: raw.layers?.labels !== false,
      vision: raw.layers?.vision !== false,
      radar: raw.layers?.radar !== false,
      fuel: raw.layers?.fuel !== false,
      weapons: raw.layers?.weapons !== false,
      fog: raw.layers?.fog !== false
    },
    layerFilter: ['surface', 'air', 'orbit'].includes(raw.layerFilter) ? raw.layerFilter : 'all',
    workspaceMode: raw.workspaceMode === 'build' ? 'build' : 'operate',
    timeScale: Number(raw.timeScale ?? 1)
  };
}
function normalizeRegionMapDisplayV36(map = {}) {
  return {
    id: String(map.id || '').trim(), name: String(map.name || 'Регион').trim() || 'Регион',
    kind: String(map.kind || 'region').trim(), image: String(map.image || '').trim(),
    width: Math.max(300, Number(map.width || 1000)), height: Math.max(200, Number(map.height || 700)),
    gridSize: Math.max(1, Number(map.gridSize || 50)), defaultLayer: ['surface','air','orbit'].includes(map.defaultLayer) ? map.defaultLayer : 'surface',
    scaleLabel: String(map.scaleLabel || 'ед').trim() || 'ед', summary: String(map.summary || '').trim(),
    markers: listV43(map.markers), tokens: listV43(map.tokens),
    fog: { enabled: map.fog ? map.fog.enabled !== false : false, radius: Math.max(0, Number(map.fog?.radius ?? 50)), explored: typeof map.fog?.explored === 'string' ? map.fog.explored : '' }
  };
}
function regionTokenPosDisplayV36(token = {}, at = Date.now()) {
  if (Number(token.movePausedMs || 0) > 0 && !token.moveEndsAt) return { x: Number(token.x ?? 0), y: Number(token.y ?? 0) };
  const start = Date.parse(token.moveStartedAt || ''), end = Date.parse(token.moveEndsAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || at >= end) return { x: Number(token.destX ?? token.x ?? 0), y: Number(token.destY ?? token.y ?? 0) };
  const t = clamp((at - start) / (end - start), 0, 1);
  return { x: Number(token.startX ?? token.x ?? 0) + (Number(token.destX ?? token.x ?? 0) - Number(token.startX ?? token.x ?? 0)) * t, y: Number(token.startY ?? token.y ?? 0) + (Number(token.destY ?? token.y ?? 0) - Number(token.startY ?? token.y ?? 0)) * t };
}
function displayShipHasPlayerCrewV36(shipId) {
  const ship = regionDisplayV36.ships?.[shipId];
  if (!ship) return false;
  if (listV43(ship.crewPlayerIds).length) return true;
  return Object.values(regionDisplayV36.users || {}).some(u => String(u?.currentShipId || '') === String(shipId) && String(u?.role || '').toLowerCase() !== 'gm');
}
function displayTokenGrantsViewV36(token) {
  if (!token) return false;
  if (token.type === 'player') return true;
  if (token.type === 'ship' && token.shipId && displayShipHasPlayerCrewV36(token.shipId)) return true;
  if (token.type === 'squadron' && listV43(token.shipIds).some(displayShipHasPlayerCrewV36)) return true;
  return false;
}
function displayViewRadiusV36(token, map) {
  if (token?.type === 'ship' || token?.type === 'squadron') {
    const radius = token.type === 'ship' ? Number(regionDisplayV36.ships?.[token.shipId]?.visionRadius || 0) : Math.max(0, ...listV43(token.shipIds).map(id => Number(regionDisplayV36.ships?.[id]?.visionRadius || 0)), 0);
    return radius > 0 ? radius : Number(map?.fog?.radius || 50);
  }
  return Number(token?.visionRadius || 0) || Number(map?.fog?.radius || 50);
}
function displayViewSourcesV36(map, at = Date.now()) {
  return listV43(map.tokens).filter(displayTokenGrantsViewV36).map(token => { const p = regionTokenPosDisplayV36(token, at); return { id: String(token.id || ''), x: p.x, y: p.y, r: Math.max(1, displayViewRadiusV36(token, map)) }; });
}
function displayTokenVisibleV36(token, map, at = Date.now()) {
  if (!token || !map) return false;
  if (token.type === 'city' || token.type === 'facility') return token.visibleToPlayers !== false;
  if (displayTokenGrantsViewV36(token) || token.visibleToPlayers) return true;
  const p = regionTokenPosDisplayV36(token, at);
  return displayViewSourcesV36(map, at).some(src => Math.hypot(p.x - src.x, p.y - src.y) <= src.r);
}
function displayShipSystemsV43(ship = {}) {
  const systems = listV43(ship.radarIds).map(id => regionDisplayV36.radars?.[id]).filter(Boolean);
  const best = kind => Math.max(0, ...systems.filter(item => String(item.kind || 'radar') === kind).map(item => Number(item.range || 0) * clamp(Number(item.power ?? 100), 0, 100) / 100), 0);
  return { active: Math.max(Number(ship.radarRadius || 0), best('radar')), passive: best('passive'), jammer: best('jammer') };
}
function displayRadarInfoV36(token) {
  const shipSystems = ship => {
    const spec = displayShipSystemsV43(ship);
    const enabled = ship?.radarEnabled !== false && token?.radarEnabled !== false;
    return { r: Math.max(spec.active, spec.passive), activeRange: enabled ? spec.active : 0, passiveRange: enabled ? spec.passive : 0, jammerRange: enabled ? spec.jammer : 0, active: enabled && Math.max(spec.active, spec.passive) > 0, jammer: enabled && spec.jammer > 0 };
  };
  if (token?.type === 'ship' && token.shipId && regionDisplayV36.ships?.[token.shipId]) return shipSystems(regionDisplayV36.ships[token.shipId]);
  if (token?.type === 'squadron') {
    const members = listV43(token.shipIds).map(id => regionDisplayV36.ships?.[id]).filter(Boolean);
    const specs = members.map(displayShipSystemsV43);
    const enabled = token.radarEnabled !== false;
    const activeRange = enabled ? specs.reduce((sum, item) => sum + item.active, 0) : 0;
    const passiveRange = enabled ? specs.reduce((sum, item) => sum + item.passive, 0) : 0;
    const jammerRange = enabled ? Math.max(0, ...specs.map(item => item.jammer), 0) : 0;
    return { r: Math.max(activeRange, passiveRange), activeRange, passiveRange, jammerRange, active: Math.max(activeRange, passiveRange) > 0, jammer: jammerRange > 0 };
  }
  const r = Math.max(0, Number(token?.radarRadius || 0));
  return { r, activeRange: r, passiveRange: 0, jammerRange: 0, active: r > 0 && token?.radarEnabled !== false, jammer: false };
}
function displayPlayerRadarSourcesV36(map, at = Date.now()) {
  return listV43(map.tokens).filter(displayTokenGrantsViewV36).map(token => {
    const info = displayRadarInfoV36(token); if (!info.active && !info.jammer) return null;
    const p = regionTokenPosDisplayV36(token, at); return { id: String(token.id || ''), x: p.x, y: p.y, ...info };
  }).filter(Boolean);
}
function displayRadarContactsV36(map, at = Date.now()) {
  const sources = displayPlayerRadarSourcesV36(map, at); if (!sources.length) return [];
  return listV43(map.tokens).map(token => {
    if (displayTokenGrantsViewV36(token) || displayTokenVisibleV36(token, map, at) || ['city','facility'].includes(token.type)) return null;
    if (displayRadarInfoV36(token).jammer) return null;
    const p = regionTokenPosDisplayV36(token, at); let best = null;
    sources.forEach(src => { const d = Math.hypot(p.x-src.x,p.y-src.y); if (d <= src.r && (!best || d < best.d)) best={src,d}; });
    if (!best) return null;
    const angle=Math.atan2(p.y-best.src.y,p.x-best.src.x), dist=Math.min(best.src.r*.8,Math.max(30,best.d));
    return { id:String(token.id||''), px:best.src.x+Math.cos(angle)*dist, py:best.src.y+Math.sin(angle)*dist, angle };
  }).filter(Boolean);
}
function displayShipForTokenV36(token) {
  if (token?.type === 'squadron') {
    const members=listV43(token.shipIds).map(id=>regionDisplayV36.ships?.[id]).filter(Boolean); if(!members.length)return null;
    return { id:`squadron:${token.id}`, name:token.name, fuel:members.reduce((s,m)=>s+Number(m.fuel||0),0), fuelCapacity:members.reduce((s,m)=>s+Number(m.fuelCapacity||0),0), hull:members.reduce((s,m)=>s+Number(m.hull||0),0), hullCapacity:members.reduce((s,m)=>s+Number(m.hullCapacity||0),0), fuelConsumption:Math.max(.01,members.reduce((s,m)=>s+Math.max(.01,Number(m.fuelConsumption||1)),0)), missileIds:[...new Set(members.flatMap(m=>listV43(m.missileIds)))], __squadron:true };
  }
  if (token?.shipId && regionDisplayV36.ships?.[token.shipId]) return regionDisplayV36.ships[token.shipId];
  const id=token?.playerId && regionDisplayV36.users?.[token.playerId]?.currentShipId; return id&&regionDisplayV36.ships?.[id]?regionDisplayV36.ships[id]:null;
}
function displayLiveFuelV36(token, ship, at) {
  if (!ship) return 0;
  const start=Date.parse(token.moveStartedAt||''),end=Date.parse(token.moveEndsAt||'');
  const moving=Number.isFinite(start)&&Number.isFinite(end)&&end>start;
  const matches=ship.__squadron?(token.type==='squadron'&&Number(token.moveFuelCost||0)>0):token.moveShipId===ship.id;
  if(moving&&matches){const t=clamp((at-start)/(end-start),0,1);return clamp(Number(token.moveFuelStart||ship.fuel||0)-Number(token.moveFuelCost||0)*t,0,Math.max(1,Number(ship.fuelCapacity||ship.fuel||0)));}
  return Number(ship.fuel||0);
}
function displayRangeV36(ship,fuel){return Math.max(0,(Math.max(0,fuel)/Math.max(.01,Number(ship.fuelConsumption||1)))*100);}
function isRegionDisplayActiveV36(){return playerDisplayMirror?.mode==='region'||Boolean(playerDisplayMirror?.activeRegionMapId)||Boolean(regionDisplayV36.mapId);}
function displayLayerAllowedV43(token){const filter=regionDisplayOptionsV43().layerFilter;return filter==='all'||String(token?.layer||regionDisplayV36.map?.defaultLayer||'surface')===filter;}
function displayMissileSpecV43(rawType='') {
  const id=String(rawType||'').startsWith('wc:')?String(rawType).slice(3):'';
  const item=id?regionDisplayV36.missilesCatalog?.[id]:null;
  return item||{name:String(rawType||'ракета').replace('wc:',''),range:0,blastRadius:0};
}
function selectedRangeSpecsV43(map, token, at) {
  if (!token) return [];
  const options=regionDisplayOptionsV43(), pos=regionTokenPosDisplayV36(token,at), ship=displayShipForTokenV36(token), radar=displayRadarInfoV36(token), out=[];
  const add=(kind,r,label)=>{if(r>0)out.push({kind,r:Math.min(Number(r),Math.hypot(map.width,map.height)),label,x:pos.x,y:pos.y});};
  if(options.layers.vision)add('vision',displayViewRadiusV36(token,map),'ОБЗОР');
  if(options.layers.radar){add('radar',radar.activeRange,'РЛС');add('passive',radar.passiveRange,'ПАССИВ');add('jammer',radar.jammerRange,'РЭБ');}
  if(options.layers.fuel&&ship)add('fuel',displayRangeV36(ship,displayLiveFuelV36(token,ship,at)),'ТОПЛИВО');
  if(options.layers.weapons&&ship){const range=Math.max(0,...listV43(ship.missileIds).map(id=>Number(regionDisplayV36.missilesCatalog?.[id]?.range||0)),0);add('weapon',range,'РАКЕТЫ');}
  return out;
}
function tokenGlyphV43(token){return ({ship:'◆',squadron:'◆',player:'●',city:'⬢',facility:'▣',aircraft:'✦',convoy:'▰',unit:'▲'})[token.type]||'●';}
function markerGlyphV43(marker){return marker.icon||({transition:'↗',city:'⬢',building:'▣',danger:'!',objective:'◎'})[marker.category||marker.type]||'•';}
function tokenStatusHtmlV43(token) {
  const ship=displayShipForTokenV36(token); if(!ship)return '';
  const hullCap=Math.max(1,Number(ship.hullCapacity||100)),fuelCap=Math.max(1,Number(ship.fuelCapacity||100));
  const hull=clamp(Number(ship.hull??hullCap),0,hullCap),fuel=clamp(Number(ship.fuel||0),0,fuelCap);
  return `<span class="region-display-bars-v43"><i style="--p:${(hull/hullCap*100).toFixed(1)}%"></i><i class="fuel" style="--p:${(fuel/fuelCap*100).toFixed(1)}%"></i></span>`;
}
function buildRegionDisplayStructureV36(map) {
  const now=Date.now(),options=regionDisplayOptionsV43();
  const visibleTokens=listV43(map.tokens).filter(token=>displayLayerAllowedV43(token)&&displayTokenVisibleV36(token,map,now));
  const markersHtml=listV43(map.markers).filter(m=>m.visibleToPlayers!==false).map(m=>`<div class="region-display-marker-v36 marker-${esc(m.category||m.type||'point')}" style="left:${(Number(m.x||0)/map.width*100).toFixed(3)}%;top:${(Number(m.y||0)/map.height*100).toFixed(3)}%;--rts-color:${esc(m.color||'#7df9ff')}"><span>${esc(markerGlyphV43(m))}</span><b>${esc(m.name||'')}</b></div>`).join('');
  const tokensHtml=visibleTokens.map(t=>{const ship=displayShipForTokenV36(t),img=String(t.image||ship?.image||'').trim(),inner=img?`<img src="${esc(img)}" alt=""/>`:`<span>${esc(tokenGlyphV43(t))}</span>`,label=t.type==='squadron'?`${t.name||t.id||''} ×${listV43(t.shipIds).length}`:(t.name||ship?.name||t.id||'');return `<div class="region-display-token-v36 type-${esc(t.type||'unit')} layer-${esc(t.layer||map.defaultLayer)} status-${esc(t.status||ship?.status||'active')}" data-token-id="${esc(String(t.id||''))}" style="--rts-color:${esc(t.color||'#7df9ff')}">${inner}<b>${esc(label)}</b>${tokenStatusHtmlV43(t)}</div>`;}).join('');
  const routeHtml=visibleTokens.filter(t=>t.moveEndsAt).map(t=>`<line data-route-token="${esc(String(t.id||''))}" class="region-display-route-v43"/>`).join('');
  const radarHtml=displayPlayerRadarSourcesV36(map,now).flatMap(src=>[
    src.activeRange>0?`<div class="region-display-radar-v36 sensor-active" data-sensor-for="${esc(src.id)}" data-sensor-kind="active"></div>`:'',
    src.passiveRange>0?`<div class="region-display-radar-v36 sensor-passive" data-sensor-for="${esc(src.id)}" data-sensor-kind="passive"></div>`:'',
    src.jammerRange>0?`<div class="region-display-radar-v36 sensor-jammer" data-sensor-for="${esc(src.id)}" data-sensor-kind="jammer"></div>`:''
  ]).join('');
  const contactsHtml=displayRadarContactsV36(map,now).map(c=>`<div class="region-display-token-v36 is-contact-v36" data-contact-id="${esc(c.id)}"><span style="transform:rotate(${(c.angle*180/Math.PI).toFixed(1)}deg)">➤</span><b>КОНТАКТ</b></div>`).join('');
  const selected=listV43(map.tokens).find(t=>String(t.id||'')===playerDisplayMirror.selectedRegionTokenId&&displayLayerAllowedV43(t)&&displayTokenVisibleV36(t,map,now));
  const rangesHtml=selectedRangeSpecsV43(map,selected,now).map(spec=>`<div class="region-display-range-v36 range-${spec.kind}" data-selected-range="${spec.kind}"><span>${spec.label} ${spec.r.toFixed(0)}</span></div>`).join('');
  const runtime=listV43(playerDisplayMirror?.regionRuntime?.missiles);
  const missileRoutes=runtime.filter(m=>!m.dead).map(m=>`<line data-missile-route="${esc(m.id)}" class="region-display-missile-route-v43"/>`).join('');
  const missilesHtml=runtime.map(m=>m.dead?`<div class="region-display-impact-v43" data-impact-id="${esc(m.id)}"></div>`:`<div class="region-display-missile-v43 guidance-${esc(m.guidance||m.type||'heat')}" data-missile-id="${esc(m.id)}"><span></span></div>`).join('');
  const gridX=clamp(map.gridSize/map.width*100,.25,50),gridY=clamp(map.gridSize/map.height*100,.25,50);
  const layerLabel=options.layerFilter==='all'?'ВСЕ СЛОИ':({surface:'ПОВЕРХНОСТЬ',air:'ВОЗДУХ',orbit:'ОРБИТА'})[options.layerFilter];
  root.innerHTML=`<div class="player-display-stage"><div class="player-display-board-frame region-display-frame-v36" id="rd-frame-v36"><div class="region-display-stage-v36 ${options.layers.labels?'':'labels-hidden'}" id="rd-stage-v36" style="background-image:${map.image?`url('${esc(map.image)}')`:'none'}"><div class="rts-map-grid-v36" style="display:${options.layers.grid?'':'none'};background-size:${gridX}% ${gridY}%"></div><svg class="region-display-routes-v43" viewBox="0 0 ${map.width} ${map.height}" preserveAspectRatio="none">${routeHtml}${missileRoutes}</svg>${radarHtml}${rangesHtml}${markersHtml}${tokensHtml}${contactsHtml}${missilesHtml}<canvas class="region-display-fog-canvas-v36" id="rd-fog-v36" style="display:none"></canvas></div><div class="region-display-title-v36">${esc(map.name)}</div><div class="region-display-hud-v43"><span>${esc(layerLabel)}</span><span>${options.timeScale===0?'ПАУЗА':`${options.timeScale}×`}</span><span>${visibleTokens.length} ОБЪЕКТОВ</span></div>${selected?selectedInfoPanelV43(selected):''}</div></div>`;
  regionDisplayV36.frame=document.getElementById('rd-frame-v36');regionDisplayV36.stage=document.getElementById('rd-stage-v36');regionDisplayV36.fogCanvas=document.getElementById('rd-fog-v36');
  regionDisplayV36.tokenNodes={};regionDisplayV36.rangeNodes={};regionDisplayV36.radarNodes={};regionDisplayV36.contactNodes={};regionDisplayV36.routeNodes={};regionDisplayV36.missileNodes={};regionDisplayV36.missileRouteNodes={};
  regionDisplayV36.stage?.querySelectorAll('[data-token-id]').forEach(n=>regionDisplayV36.tokenNodes[n.dataset.tokenId]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-selected-range]').forEach(n=>regionDisplayV36.rangeNodes[n.dataset.selectedRange]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-sensor-for]').forEach(n=>regionDisplayV36.radarNodes[`${n.dataset.sensorFor}:${n.dataset.sensorKind}`]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-contact-id]').forEach(n=>regionDisplayV36.contactNodes[n.dataset.contactId]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-route-token]').forEach(n=>regionDisplayV36.routeNodes[n.dataset.routeToken]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-missile-id],[data-impact-id]').forEach(n=>regionDisplayV36.missileNodes[n.dataset.missileId||n.dataset.impactId]=n);
  regionDisplayV36.stage?.querySelectorAll('[data-missile-route]').forEach(n=>regionDisplayV36.missileRouteNodes[n.dataset.missileRoute]=n);
  sizeRegionDisplayFrameV36();regionDisplayPositionV36(Date.now());
}
function selectedInfoPanelV43(token){const ship=displayShipForTokenV36(token),radar=displayRadarInfoV36(token);if(!ship)return `<div class="region-display-info-v43"><b>${esc(token.name||token.id)}</b><span>${esc(token.type||'объект')} · ${esc(token.layer||'surface')}</span></div>`;return `<div class="region-display-info-v43"><b>${esc(ship.callsign||ship.name||token.name||token.id)}</b><span>${esc(ship.model||token.type||'корабль')} · ${esc(ship.status||'operational')}</span><span>КОРПУС ${Number(ship.hull||0).toFixed(0)}/${Number(ship.hullCapacity||0).toFixed(0)} · ТОПЛИВО ${Number(ship.fuel||0).toFixed(0)}/${Number(ship.fuelCapacity||0).toFixed(0)}</span><span>РЛС ${radar.activeRange.toFixed(0)} · ПАССИВ ${radar.passiveRange.toFixed(0)} · РЭБ ${radar.jammerRange.toFixed(0)}</span></div>`;}
function buildDisplayFogCloudsV36(w,h){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');c.fillStyle='rgb(7,9,13)';c.fillRect(0,0,w,h);let seed=1337;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<180;i++){const x=rnd()*w,y=rnd()*h,r=18+rnd()*95,shade=16+Math.floor(rnd()*46),g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${shade},${shade+3},${shade+7},${(.22+rnd()*.34).toFixed(2)})`);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}return cv;}
function renderRegionDisplayFogV36(map,now){const canvas=regionDisplayV36.fogCanvas,options=regionDisplayOptionsV43();if(!canvas)return;if(!map.fog?.enabled||!options.layers.fog){canvas.style.display='none';return;}const W=720,H=Math.max(1,Math.round(W*(map.height/Math.max(1,map.width))));if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;regionDisplayV36.fogClouds=null;}canvas.style.display='';if(!regionDisplayV36.fogClouds)regionDisplayV36.fogClouds=buildDisplayFogCloudsV36(W,H);const ctx=canvas.getContext('2d'),clouds=regionDisplayV36.fogClouds,t=now*.004,dx=Math.floor(t%W),dy=Math.floor((t*.55)%H);ctx.clearRect(0,0,W,H);ctx.globalAlpha=.97;ctx.drawImage(clouds,-dx,-dy);ctx.drawImage(clouds,W-dx,-dy);ctx.drawImage(clouds,-dx,H-dy);ctx.drawImage(clouds,W-dx,H-dy);ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-out';displayViewSourcesV36(map,now).forEach(src=>{const r=Math.max(2,src.r/map.width*W),cx=src.x/map.width*W,cy=src.y/map.height*H,g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.55,'rgba(0,0,0,1)');g.addColorStop(.82,'rgba(0,0,0,.55)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();});ctx.globalCompositeOperation='source-over';}
function sizeRegionDisplayFrameV36(){const map=regionDisplayV36.map,frame=regionDisplayV36.frame;if(!map||!frame)return;const vw=Math.max(1,window.innerWidth||1280),vh=Math.max(1,window.innerHeight||720),aspect=Math.max(.1,map.width/Math.max(1,map.height));let w=vw,h=w/aspect;if(h>vh){h=vh;w=h*aspect;}frame.style.width=`${w.toFixed(1)}px`;frame.style.height=`${h.toFixed(1)}px`;regionDisplayV36.frameW=w;regionDisplayV36.frameH=h;}
function setCircleV43(node,x,y,r,map){if(!node)return;node.style.left=`${(x/map.width*100).toFixed(3)}%`;node.style.top=`${(y/map.height*100).toFixed(3)}%`;node.style.width=`${(r/map.width*200).toFixed(3)}%`;node.style.height=`${(r/map.height*200).toFixed(3)}%`;}
function regionDisplayPositionV36(now){const map=regionDisplayV36.map;if(!map)return;listV43(map.tokens).forEach(t=>{const id=String(t.id||''),node=regionDisplayV36.tokenNodes[id],p=regionTokenPosDisplayV36(t,now);if(node){node.style.left=`${(p.x/map.width*100).toFixed(3)}%`;node.style.top=`${(p.y/map.height*100).toFixed(3)}%`;node.classList.toggle('moving',Boolean(t.moveEndsAt)&&Date.parse(t.moveEndsAt||'')>now);}const route=regionDisplayV36.routeNodes[id];if(route){route.setAttribute('x1',p.x);route.setAttribute('y1',p.y);route.setAttribute('x2',Number(t.destX??p.x));route.setAttribute('y2',Number(t.destY??p.y));}});
  displayPlayerRadarSourcesV36(map,now).forEach(src=>{setCircleV43(regionDisplayV36.radarNodes[`${src.id}:active`],src.x,src.y,src.activeRange,map);setCircleV43(regionDisplayV36.radarNodes[`${src.id}:passive`],src.x,src.y,src.passiveRange,map);setCircleV43(regionDisplayV36.radarNodes[`${src.id}:jammer`],src.x,src.y,src.jammerRange,map);});
  displayRadarContactsV36(map,now).forEach(c=>{const node=regionDisplayV36.contactNodes[c.id];if(!node)return;node.style.left=`${(c.px/map.width*100).toFixed(3)}%`;node.style.top=`${(c.py/map.height*100).toFixed(3)}%`;const arrow=node.querySelector('span');if(arrow)arrow.style.transform=`rotate(${(c.angle*180/Math.PI).toFixed(1)}deg)`;});
  const selected=listV43(map.tokens).find(t=>String(t.id||'')===playerDisplayMirror.selectedRegionTokenId);selectedRangeSpecsV43(map,selected,now).forEach(spec=>setCircleV43(regionDisplayV36.rangeNodes[spec.kind],spec.x,spec.y,spec.r,map));
  listV43(playerDisplayMirror?.regionRuntime?.missiles).forEach(m=>{const node=regionDisplayV36.missileNodes[m.id];if(node){node.style.left=`${(Number(m.x||0)/map.width*100).toFixed(3)}%`;node.style.top=`${(Number(m.y||0)/map.height*100).toFixed(3)}%`;}const line=regionDisplayV36.missileRouteNodes[m.id];if(line){line.setAttribute('x1',Number(m.x||0));line.setAttribute('y1',Number(m.y||0));line.setAttribute('x2',Number(m.sx||m.x||0));line.setAttribute('y2',Number(m.sy||m.y||0));}});
}
function regionDisplayTickV36(){const map=regionDisplayV36.map;if(!map||!isRegionDisplayActiveV36()){regionDisplayV36.raf=0;return;}const now=Date.now(),fw=regionDisplayV36.frameW||1,fh=regionDisplayV36.frameH||1,tgt=regionDisplayV36.cameraTarget,cam=regionDisplayV36.camera,targetPanX=Number(tgt.panFracX||0)*fw,targetPanY=Number(tgt.panFracY||0)*fh,targetZoom=Number(tgt.zoom||1);cam.zoom+=(targetZoom-cam.zoom)*.2;cam.panX+=(targetPanX-cam.panX)*.2;cam.panY+=(targetPanY-cam.panY)*.2;if(regionDisplayV36.stage)regionDisplayV36.stage.style.transform=`translate(${cam.panX.toFixed(1)}px,${cam.panY.toFixed(1)}px) scale(${cam.zoom.toFixed(4)})`;regionDisplayPositionV36(now);try{renderRegionDisplayFogV36(map,now);}catch{}regionDisplayV36.raf=requestAnimationFrame(regionDisplayTickV36);}
function ensureRegionDisplayRafV36(){if(!regionDisplayV36.raf)regionDisplayV36.raf=requestAnimationFrame(regionDisplayTickV36);}
function stopRegionDisplayV36(){if(regionDisplayV36.raf){cancelAnimationFrame(regionDisplayV36.raf);regionDisplayV36.raf=0;}if(regionDisplayV36.mapId){regionDisplayV36.mapId='';regionDisplayV36.structSig='';regionDisplayV36.map=null;regionDisplayV36.fogClouds=null;lastSignature='';}}
function syncRegionDisplayV36(world={},state={}){const maps=world?.regionMaps?.REGION_MAPS||world?.REGION_MAPS||{},activeMapId=String(playerDisplayMirror.activeRegionMapId||state?.toolState?.regionRuntime?.activeMapId||'').trim(),rawMap=activeMapId&&maps[activeMapId]?maps[activeMapId]:null;if(!rawMap){stopRegionDisplayV36();root.innerHTML='<div class="player-display-stage player-display-stage--blank"></div>';return;}const map=normalizeRegionMapDisplayV36(rawMap);regionDisplayV36.map=map;regionDisplayV36.ships=world?.ships?.SHIPS||world?.SHIPS||{};regionDisplayV36.radars=world?.radars?.RADARS||world?.RADARS||{};regionDisplayV36.missilesCatalog=world?.missiles?.MISSILES||world?.MISSILES||{};regionDisplayV36.users=state?.users||{};if(playerDisplayMirror.regionCamera)regionDisplayV36.cameraTarget={zoom:Number(playerDisplayMirror.regionCamera.zoom||1),panFracX:Number(playerDisplayMirror.regionCamera.panFracX||0),panFracY:Number(playerDisplayMirror.regionCamera.panFracY||0)};const options=regionDisplayOptionsV43(),now=Date.now(),visible=listV43(map.tokens).filter(t=>displayLayerAllowedV43(t)&&displayTokenVisibleV36(t,map,now)),runtime=listV43(playerDisplayMirror?.regionRuntime?.missiles);const structSig=JSON.stringify({id:map.id,name:map.name,image:imageSigV43(map.image),w:map.width,h:map.height,grid:map.gridSize,options,selected:playerDisplayMirror.selectedRegionTokenId,markers:listV43(map.markers).filter(m=>m.visibleToPlayers!==false).map(m=>[m.id,Math.round(m.x),Math.round(m.y),m.name,m.color,m.category,m.icon]),tokens:visible.map(t=>[t.id,t.type,t.layer,t.status,t.color,imageSigV43(t.image||regionDisplayV36.ships?.[t.shipId]?.image||''),t.name,t.moveEndsAt,regionDisplayV36.ships?.[t.shipId]?.hull,regionDisplayV36.ships?.[t.shipId]?.fuel]),contacts:displayRadarContactsV36(map,now).map(c=>c.id),sensors:displayPlayerRadarSourcesV36(map,now).map(src=>[src.id,Math.round(src.activeRange),Math.round(src.passiveRange),Math.round(src.jammerRange)]),missiles:runtime.map(m=>[m.id,m.dead,m.guidance,m.type])});if(structSig!==regionDisplayV36.structSig||map.id!==regionDisplayV36.mapId){regionDisplayV36.structSig=structSig;regionDisplayV36.mapId=map.id;buildRegionDisplayStructureV36(map);}else sizeRegionDisplayFrameV36();ensureRegionDisplayRafV36();}
