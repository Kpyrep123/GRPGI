
const root = document.getElementById('player-display-root');
let playerDisplayMirror = { activeSceneId: '', cameraByScene: {}, updatedAt: null };

function normalizeMirrorPayload(payload = {}) {
  return {
    mode: String(payload?.mode || '').trim(),
    activeRegionMapId: String(payload?.activeRegionMapId || '').trim(),
    activeSceneId: String(payload?.activeSceneId || '').trim(),
    cameraByScene: payload?.cameraByScene && typeof payload.cameraByScene === 'object' ? payload.cameraByScene : {},
    regionCamera: payload?.regionCamera && typeof payload.regionCamera === 'object' ? payload.regionCamera : null,
    updatedAt: payload?.updatedAt || null
  };
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
async function refresh() {
  try {
    const [state, worldRes] = await Promise.all([
      window.electronAPI?.loadState?.(),
      window.electronAPI?.loadWorldData?.()
    ]);
    const world = worldRes?.world || {};
    const regionActive = playerDisplayMirror?.mode === 'region' || playerDisplayMirror?.activeRegionMapId || state?.toolState?.regionRuntime?.activeMapId;
    if (regionActive) { syncRegionDisplayV36(world, state || {}); return; }
    stopRegionDisplayV36();
    const signature = JSON.stringify({
      mode: playerDisplayMirror.mode || '',
      activeRegionMapId: playerDisplayMirror.activeRegionMapId || state?.toolState?.regionRuntime?.activeMapId || '',
      regionMap: world?.regionMaps?.REGION_MAPS?.[playerDisplayMirror.activeRegionMapId || state?.toolState?.regionRuntime?.activeMapId || ''] || null,
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
  }
}
setInterval(refresh, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('resize', () => refresh());
window.electronAPI?.onCombatRuntimeEvent?.(() => refresh());
refresh();

window.electronAPI?.getPlayerDisplayView?.().then(res => {
  if (res?.ok && res.payload) {
    playerDisplayMirror = normalizeMirrorPayload(res.payload);
    refresh();
  }
}).catch(() => {});
window.electronAPI?.onPlayerDisplayView?.(payload => {
  playerDisplayMirror = normalizeMirrorPayload(payload);
  if (playerDisplayMirror.mode === 'region' || playerDisplayMirror.activeRegionMapId) {
    if (playerDisplayMirror.regionCamera) {
      regionDisplayV36.cameraTarget = {
        zoom: Number(playerDisplayMirror.regionCamera.zoom || 1),
        panFracX: Number(playerDisplayMirror.regionCamera.panFracX || 0),
        panFracY: Number(playerDisplayMirror.regionCamera.panFracY || 0)
      };
    }
    ensureRegionDisplayRafV36();
    if (playerDisplayMirror.activeRegionMapId && playerDisplayMirror.activeRegionMapId !== regionDisplayV36.mapId) refresh();
    return;
  }
  refresh();
});


/* v1.0.37 player display: smooth interactive region map — interpolated movement, mirrored DM camera, live fuel circles */
let regionDisplayV36 = { mapId: '', structSig: '', map: null, ships: {}, users: {}, frame: null, stage: null, tokenNodes: {}, rangeNodes: {}, camera: { zoom: 1, panX: 0, panY: 0 }, cameraTarget: { zoom: 1, panFracX: 0, panFracY: 0 }, frameW: 0, frameH: 0, raf: 0 };

function normalizeRegionMapDisplayV36(map = {}) {
  return {
    id: String(map.id || '').trim(),
    name: String(map.name || 'Регион').trim() || 'Регион',
    image: String(map.image || '').trim(),
    width: Math.max(300, Number(map.width || 1000)),
    height: Math.max(200, Number(map.height || 700)),
    markers: Array.isArray(map.markers) ? map.markers : [],
    tokens: Array.isArray(map.tokens) ? map.tokens : [],
    fog: {
      enabled: map.fog ? map.fog.enabled !== false : false,
      radius: Math.max(0, Number(map.fog?.radius ?? 50)),
      explored: typeof map.fog?.explored === 'string' ? map.fog.explored : ''
    }
  };
}
function regionTokenPosDisplayV36(token = {}, at = Date.now()) {
  // на паузе токен стоит там, где остановился
  if (Number(token.movePausedMs || 0) > 0 && !token.moveEndsAt) return { x: Number(token.x ?? 0), y: Number(token.y ?? 0) };
  const start = Date.parse(token.moveStartedAt || '');
  const end = Date.parse(token.moveEndsAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || at >= end) return { x: Number(token.destX ?? token.x ?? 0), y: Number(token.destY ?? token.y ?? 0) };
  const t = clamp((at - start) / (end - start), 0, 1);
  return { x: Number(token.startX ?? token.x ?? 0) + (Number(token.destX ?? token.x ?? 0) - Number(token.startX ?? token.x ?? 0)) * t, y: Number(token.startY ?? token.y ?? 0) + (Number(token.destY ?? token.y ?? 0) - Number(token.startY ?? token.y ?? 0)) * t };
}
function displayShipHasPlayerCrewV36(shipId) {
  const ship = (regionDisplayV36.ships || {})[shipId];
  if (!ship) return false;
  if ((ship.crewPlayerIds || []).length) return true;
  // экипаж также определяется по ссылке игрока на текущий корабль
  return Object.values(regionDisplayV36.users || {}).some(u => String(u?.currentShipId || '') === String(shipId) && String(u?.role || '').toLowerCase() !== 'gm');
}
function displayTokenGrantsViewV36(t) {
  // обзор дают только корабли/эскадры с игроками в экипаже
  if (!t) return false;
  if (t.type === 'ship' && t.shipId && displayShipHasPlayerCrewV36(t.shipId)) return true;
  if (t.type === 'squadron' && (Array.isArray(t.shipIds) ? t.shipIds : []).some(id => displayShipHasPlayerCrewV36(id))) return true;
  return false;
}
function displayViewRadiusV36(t, map) {
  // WC первичен: обзор корабля из WC, иначе радиус карты; токен — только для не-кораблей
  const ships = regionDisplayV36.ships || {};
  if (t?.type === 'ship' || t?.type === 'squadron') {
    const shipVision = t.type === 'ship'
      ? Number(ships[t.shipId]?.visionRadius || 0)
      : Math.max(0, ...(Array.isArray(t.shipIds) ? t.shipIds : []).map(id => Number(ships[id]?.visionRadius || 0)), 0);
    return shipVision > 0 ? shipVision : Math.max(0, Number(map?.fog?.radius ?? 50));
  }
  const own = Number(t?.visionRadius || 0);
  return own > 0 ? own : Math.max(0, Number(map?.fog?.radius ?? 50));
}
function displayViewSourcesV36(map, at = Date.now()) {
  return (map.tokens || []).filter(displayTokenGrantsViewV36).map(t => {
    const p = regionTokenPosDisplayV36(t, at);
    return { x: p.x, y: p.y, r: Math.max(1, displayViewRadiusV36(t, map)) };
  });
}
// Обзор: видно только то, что в радиусе обзора кораблей с игроками в экипаже
// (и токенов персонажей). Города видны поверх тумана только если закреплены.
function displayTokenVisibleV36(token, map, at = Date.now()) {
  if (!token || !map) return false;
  if (token.type === 'city') return Boolean(token.visibleToPlayers);
  if (displayTokenGrantsViewV36(token)) return true;
  if (token.visibleToPlayers) return true;
  const p = regionTokenPosDisplayV36(token, at);
  return displayViewSourcesV36(map, at).some(src => Math.hypot(p.x - src.x, p.y - src.y) <= src.r);
}
function displayShipRadarSpecV36(ship) {
  const radars = regionDisplayV36.radars || {};
  const installed = (Array.isArray(ship?.radarIds) ? ship.radarIds : []).map(id => radars[id]).filter(Boolean);
  const ranges = installed.filter(r => String(r.kind) !== 'jammer').map(r => Number(r.range || 0));
  const range = Math.max(0, Number(ship?.radarRadius || 0), ...(ranges.length ? ranges : [0]));
  return { range, jammer: installed.some(r => String(r.kind) === 'jammer') };
}
function displayRadarInfoV36(t) {
  const ships = regionDisplayV36.ships || {};
  if (t.type === 'ship' && t.shipId && ships[t.shipId]) {
    const s = ships[t.shipId];
    const spec = displayShipRadarSpecV36(s);
    const on = s.radarEnabled !== false && t.radarEnabled !== false;
    return { r: spec.range, active: on && spec.range > 0, jammer: on && spec.jammer };
  }
  if (t.type === 'squadron') {
    const members = (Array.isArray(t.shipIds) ? t.shipIds : []).map(id => ships[id]).filter(Boolean);
    const r = members.reduce((sum, m) => m.radarEnabled !== false ? sum + displayShipRadarSpecV36(m).range : sum, 0);
    const jammer = members.some(m => m.radarEnabled !== false && displayShipRadarSpecV36(m).jammer);
    return { r, active: r > 0 && t.radarEnabled !== false, jammer: jammer && t.radarEnabled !== false };
  }
  const r = Math.max(0, Number(t.radarRadius || 0));
  return { r, active: r > 0 && t.radarEnabled !== false, jammer: false };
}
function displayPlayerRadarSourcesV36(map, at = Date.now()) {
  return (map.tokens || []).filter(displayTokenGrantsViewV36).map(t => {
    const info = displayRadarInfoV36(t);
    if (!info.active) return null;
    const p = regionTokenPosDisplayV36(t, at);
    return { id: String(t.id || ''), x: p.x, y: p.y, r: info.r };
  }).filter(Boolean);
}
// Радарные контакты: объект в зоне радара, но вне прямой видимости — игрокам
// показывается НАПРАВЛЕНИЕ на объект (пеленг), а не его точная позиция.
function displayRadarContactsV36(map, at = Date.now()) {
  const sources = displayPlayerRadarSourcesV36(map, at);
  if (!sources.length) return [];
  return (map.tokens || []).map(t => {
    if (t.type === 'city' || displayTokenGrantsViewV36(t) || displayTokenVisibleV36(t, map, at)) return null;
    if (displayRadarInfoV36(t).jammer) return null; // РЭБ скрывает от радара
    const p = regionTokenPosDisplayV36(t, at);
    let best = null;
    sources.forEach(src => {
      const d = Math.hypot(p.x - src.x, p.y - src.y);
      if (d <= src.r && (!best || d < best.d)) best = { src, d };
    });
    if (!best) return null;
    // пеленг: отметка на ~80% дальности радара по направлению на объект
    const angle = Math.atan2(p.y - best.src.y, p.x - best.src.x);
    const dist = Math.min(best.src.r * 0.8, Math.max(30, best.d));
    return { id: String(t.id || ''), px: best.src.x + Math.cos(angle) * dist, py: best.src.y + Math.sin(angle) * dist, angle };
  }).filter(Boolean);
}
function displayShipForTokenV36(token) {
  const ships = regionDisplayV36.ships || {};
  if (token.type === 'squadron') {
    const members = (Array.isArray(token.shipIds) ? token.shipIds : []).map(id => ships[id]).filter(Boolean);
    if (!members.length) return null;
    return {
      id: `squadron:${token.id}`,
      fuel: members.reduce((sum, m) => sum + Number(m.fuel || 0), 0),
      fuelCapacity: members.reduce((sum, m) => sum + Number(m.fuelCapacity || 0), 0),
      fuelConsumption: Math.max(0.01, members.reduce((sum, m) => sum + Math.max(0.01, Number(m.fuelConsumption || 1)), 0)),
      __squadron: true
    };
  }
  if (token.shipId && ships[token.shipId]) return ships[token.shipId];
  const uid = token.playerId && regionDisplayV36.users?.[token.playerId]?.currentShipId;
  return uid && ships[uid] ? ships[uid] : null;
}
function displayLiveFuelV36(token, ship, at) {
  if (!ship) return 0;
  const start = Date.parse(token.moveStartedAt || ''), end = Date.parse(token.moveEndsAt || '');
  const moving = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const matchesMove = ship.__squadron ? (token.type === 'squadron' && Number(token.moveFuelCost || 0) > 0) : token.moveShipId === ship.id;
  if (moving && matchesMove) {
    const t = clamp((at - start) / (end - start), 0, 1);
    return clamp(Number(token.moveFuelStart || ship.fuel || 0) - Number(token.moveFuelCost || 0) * t, 0, Math.max(1, Number(ship.fuelCapacity || ship.fuel || 0)));
  }
  return Number(ship.fuel || 0);
}
function displayRangeV36(ship, fuel) { return Math.max(0, (Math.max(0, fuel) / Math.max(0.01, Number(ship.fuelConsumption || 1))) * 100); }
function isRegionDisplayActiveV36() { return playerDisplayMirror?.mode === 'region' || Boolean(playerDisplayMirror?.activeRegionMapId) || Boolean(regionDisplayV36.mapId); }

function buildRegionDisplayStructureV36(map) {
  const now = Date.now();
  const visibleTokens = (map.tokens || []).filter(t => displayTokenVisibleV36(t, map, now));
  const markersHtml = (map.markers || []).filter(m => m.visibleToPlayers !== false).map(m =>
    `<div class="region-display-marker-v36" style="left:${(Number(m.x||0)/map.width*100).toFixed(3)}%;top:${(Number(m.y||0)/map.height*100).toFixed(3)}%;--rts-color:${esc(m.color || '#7df9ff')}"><span></span><b>${esc(m.name || '')}</b></div>`).join('');
  const tokensHtml = visibleTokens.map(t => {
    const isShip = t.type === 'ship' || t.type === 'squadron';
    const isCity = t.type === 'city';
    const ship = t.shipId && regionDisplayV36.ships[t.shipId] ? regionDisplayV36.ships[t.shipId] : null;
    // Ships/squadrons render as a plain coloured circle + name (no image).
    const img = isShip ? '' : String(t.image || ship?.image || '').trim();
    const glyph = isShip ? '' : isCity ? '⬢' : t.type === 'player' ? '●' : '▲';
    const inner = img ? `<img src="${esc(img)}" alt="" />` : `<span>${esc(glyph)}</span>`;
    const label = t.type === 'squadron' ? `${t.name || t.id || ''} ×${(Array.isArray(t.shipIds) ? t.shipIds : []).length}` : (t.name || t.id || '');
    return `<div class="region-display-token-v36${isShip ? ' is-ship-v36' : ''}${isCity ? ' is-city-v36' : ''}" data-token-id="${esc(String(t.id || ''))}" style="--rts-color:${esc(t.color || '#7df9ff')}">${inner}<b>${esc(label)}</b></div>`;
  }).join('');
  const rangesHtml = visibleTokens.filter(t => t.type !== 'unit' && t.type !== 'city').map(t => `<div class="region-display-range-v36" data-range-for="${esc(String(t.id || ''))}" style="display:none"></div>`).join('');
  // радары игроков видны на втором экране: сетка вокруг корабля
  const radarsHtml = displayPlayerRadarSourcesV36(map, now).map(src => `<div class="region-display-radar-v36" data-radar-for="${esc(src.id)}"></div>`).join('');
  // радарные контакты: пеленг (направление), а не точная позиция
  const contactsHtml = displayRadarContactsV36(map, now).map(c => `<div class="region-display-token-v36 is-contact-v36" data-contact-id="${esc(c.id)}"><span style="transform:rotate(${(c.angle * 180 / Math.PI).toFixed(1)}deg)">➤</span><b>контакт</b></div>`).join('');
  root.innerHTML = `<div class="player-display-stage"><div class="player-display-board-frame region-display-frame-v36" id="rd-frame-v36"><div class="region-display-stage-v36" id="rd-stage-v36" style="background-image:${map.image ? `url('${esc(map.image)}')` : 'none'}">${radarsHtml}${rangesHtml}<div class="rts-map-grid-v36"></div>${markersHtml}${tokensHtml}${contactsHtml}<canvas class="region-display-fog-canvas-v36" id="rd-fog-v36" style="display:none"></canvas></div><div class="region-display-title-v36">${esc(map.name)}</div></div></div>`;
  regionDisplayV36.frame = document.getElementById('rd-frame-v36');
  regionDisplayV36.stage = document.getElementById('rd-stage-v36');
  regionDisplayV36.fogCanvas = document.getElementById('rd-fog-v36');
  regionDisplayV36.tokenNodes = {};
  regionDisplayV36.rangeNodes = {};
  regionDisplayV36.radarNodes = {};
  regionDisplayV36.contactNodes = {};
  if (regionDisplayV36.stage) {
    regionDisplayV36.stage.querySelectorAll('[data-token-id]').forEach(node => { regionDisplayV36.tokenNodes[node.dataset.tokenId] = node; });
    regionDisplayV36.stage.querySelectorAll('[data-range-for]').forEach(node => { regionDisplayV36.rangeNodes[node.dataset.rangeFor] = node; });
    regionDisplayV36.stage.querySelectorAll('[data-radar-for]').forEach(node => { regionDisplayV36.radarNodes[node.dataset.radarFor] = node; });
    regionDisplayV36.stage.querySelectorAll('[data-contact-id]').forEach(node => { regionDisplayV36.contactNodes[node.dataset.contactId] = node; });
  }
  sizeRegionDisplayFrameV36();
  regionDisplayPositionV36(Date.now());
}
// Серо-чёрные «облака» тумана войны: дрейфующая текстура, обзор мягко
// раздвигает облака; покинутая зона сразу закрывается снова.
function buildDisplayFogCloudsV36(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgb(7,9,13)';
  c.fillRect(0, 0, w, h);
  let seed = 1337;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 260; i += 1) {
    const x = rnd() * w, y = rnd() * h, r = 18 + rnd() * 95;
    const shade = 16 + Math.floor(rnd() * 46);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${shade},${shade + 3},${shade + 7},${(0.22 + rnd() * 0.34).toFixed(2)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  return cv;
}
function renderRegionDisplayFogV36(map, now) {
  const canvas = regionDisplayV36.fogCanvas;
  if (!canvas) return;
  if (!map.fog || !map.fog.enabled) { canvas.style.display = 'none'; return; }
  const W = 900, H = Math.max(1, Math.round(W * (map.height / Math.max(1, map.width))));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; regionDisplayV36.fogClouds = null; }
  canvas.style.display = '';
  if (!regionDisplayV36.fogClouds) regionDisplayV36.fogClouds = buildDisplayFogCloudsV36(W, H);
  const clouds = regionDisplayV36.fogClouds;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const t = now * 0.006;
  const dx = Math.floor(t % W), dy = Math.floor((t * 0.55) % H);
  ctx.globalAlpha = 0.97;
  ctx.drawImage(clouds, -dx, -dy);
  ctx.drawImage(clouds, W - dx, -dy);
  ctx.drawImage(clouds, -dx, H - dy);
  ctx.drawImage(clouds, W - dx, H - dy);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  displayViewSourcesV36(map, now).forEach(src => {
    const r = Math.max(2, src.r / map.width * W);
    const cx = src.x / map.width * W, cy = src.y / map.height * H;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,1)');
    g.addColorStop(0.82, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
}
function sizeRegionDisplayFrameV36() {
  const map = regionDisplayV36.map, frame = regionDisplayV36.frame;
  if (!map || !frame) return;
  const vw = Math.max(1, window.innerWidth || document.documentElement?.clientWidth || 1280);
  const vh = Math.max(1, window.innerHeight || document.documentElement?.clientHeight || 720);
  const aspect = Math.max(.1, map.width / Math.max(1, map.height));
  let w = vw, h = w / aspect;
  if (h > vh) { h = vh; w = h * aspect; }
  frame.style.width = `${w.toFixed(1)}px`;
  frame.style.height = `${h.toFixed(1)}px`;
  regionDisplayV36.frameW = w;
  regionDisplayV36.frameH = h;
}
function regionDisplayPositionV36(now) {
  const map = regionDisplayV36.map;
  if (!map) return;
  (map.tokens || []).forEach(t => {
    const id = String(t.id || '');
    const node = regionDisplayV36.tokenNodes[id];
    if (node) {
      const p = regionTokenPosDisplayV36(t, now);
      node.style.left = `${(p.x / map.width * 100).toFixed(3)}%`;
      node.style.top = `${(p.y / map.height * 100).toFixed(3)}%`;
      node.classList.toggle('moving', Boolean(t.moveEndsAt) && Date.parse(t.moveEndsAt || '') > now);
      const circle = regionDisplayV36.rangeNodes[id];
      if (circle) {
        const ship = displayShipForTokenV36(t);
        const range = ship ? Math.min(displayRangeV36(ship, displayLiveFuelV36(t, ship, now)), Math.hypot(map.width, map.height)) : 0;
        if (ship && range > 0) {
          circle.style.display = '';
          circle.style.left = `${(p.x / map.width * 100).toFixed(3)}%`;
          circle.style.top = `${(p.y / map.height * 100).toFixed(3)}%`;
          circle.style.width = `${(range / map.width * 100 * 2).toFixed(3)}%`;
          circle.style.height = `${(range / map.height * 100 * 2).toFixed(3)}%`;
        } else {
          circle.style.display = 'none';
        }
      }
    }
  });
  // радарные сетки игроков
  displayPlayerRadarSourcesV36(map, now).forEach(src => {
    const node = regionDisplayV36.radarNodes?.[src.id];
    if (!node) return;
    node.style.left = `${(src.x / map.width * 100).toFixed(3)}%`;
    node.style.top = `${(src.y / map.height * 100).toFixed(3)}%`;
    node.style.width = `${(src.r / map.width * 100 * 2).toFixed(3)}%`;
    node.style.height = `${(src.r / map.height * 100 * 2).toFixed(3)}%`;
  });
  // пеленги радарных контактов
  displayRadarContactsV36(map, now).forEach(c => {
    const node = regionDisplayV36.contactNodes?.[c.id];
    if (!node) return;
    node.style.left = `${(c.px / map.width * 100).toFixed(3)}%`;
    node.style.top = `${(c.py / map.height * 100).toFixed(3)}%`;
    const arrow = node.querySelector('span');
    if (arrow) arrow.style.transform = `rotate(${(c.angle * 180 / Math.PI).toFixed(1)}deg)`;
  });
}
function regionDisplayTickV36() {
  const map = regionDisplayV36.map;
  if (!map || !isRegionDisplayActiveV36()) { regionDisplayV36.raf = 0; return; }
  const now = Date.now();
  const fw = regionDisplayV36.frameW || 1, fh = regionDisplayV36.frameH || 1;
  const tgt = regionDisplayV36.cameraTarget, cam = regionDisplayV36.camera;
  const targetPanX = Number(tgt.panFracX || 0) * fw, targetPanY = Number(tgt.panFracY || 0) * fh, targetZoom = Number(tgt.zoom || 1);
  cam.zoom += (targetZoom - cam.zoom) * 0.2;
  cam.panX += (targetPanX - cam.panX) * 0.2;
  cam.panY += (targetPanY - cam.panY) * 0.2;
  if (regionDisplayV36.stage) regionDisplayV36.stage.style.transform = `translate(${cam.panX.toFixed(1)}px, ${cam.panY.toFixed(1)}px) scale(${cam.zoom.toFixed(4)})`;
  regionDisplayPositionV36(now);
  try { renderRegionDisplayFogV36(map, now); } catch {}
  regionDisplayV36.raf = requestAnimationFrame(regionDisplayTickV36);
}
function ensureRegionDisplayRafV36() { if (!regionDisplayV36.raf) regionDisplayV36.raf = requestAnimationFrame(regionDisplayTickV36); }
function stopRegionDisplayV36() {
  if (regionDisplayV36.raf) { cancelAnimationFrame(regionDisplayV36.raf); regionDisplayV36.raf = 0; }
  if (regionDisplayV36.mapId) { regionDisplayV36.mapId = ''; regionDisplayV36.structSig = ''; regionDisplayV36.map = null; lastSignature = ''; }
}
function syncRegionDisplayV36(world = {}, state = {}) {
  const maps = world?.regionMaps?.REGION_MAPS || world?.REGION_MAPS || {};
  const activeMapId = String(playerDisplayMirror.activeRegionMapId || state?.toolState?.regionRuntime?.activeMapId || '').trim();
  const rawMap = activeMapId && maps[activeMapId] ? maps[activeMapId] : null;
  if (!rawMap) {
    if (regionDisplayV36.raf) { cancelAnimationFrame(regionDisplayV36.raf); regionDisplayV36.raf = 0; }
    regionDisplayV36.mapId = ''; regionDisplayV36.structSig = ''; regionDisplayV36.map = null;
    root.innerHTML = '<div class="player-display-stage player-display-stage--blank"></div>';
    return;
  }
  const map = normalizeRegionMapDisplayV36(rawMap);
  regionDisplayV36.map = map;
  regionDisplayV36.ships = world?.ships?.SHIPS || world?.SHIPS || {};
  regionDisplayV36.radars = world?.radars?.RADARS || world?.RADARS || {};
  regionDisplayV36.users = state?.users || {};
  if (playerDisplayMirror.regionCamera) {
    regionDisplayV36.cameraTarget = { zoom: Number(playerDisplayMirror.regionCamera.zoom || 1), panFracX: Number(playerDisplayMirror.regionCamera.panFracX || 0), panFracY: Number(playerDisplayMirror.regionCamera.panFracY || 0) };
  }
  const structSig = JSON.stringify({
    id: map.id, name: map.name, image: map.image, w: map.width, h: map.height,
    markers: (map.markers || []).filter(m => m.visibleToPlayers !== false).map(m => [m.id, Math.round(m.x), Math.round(m.y), m.name, m.color]),
    tokens: (map.tokens || []).filter(t => displayTokenVisibleV36(t, map)).map(t => [t.id, t.type, t.color, t.image || (regionDisplayV36.ships[t.shipId]?.image || ''), t.name]),
    contacts: displayRadarContactsV36(map).map(c => c.id),
    radars: displayPlayerRadarSourcesV36(map).map(src => [src.id, Math.round(src.r)])
  });
  if (structSig !== regionDisplayV36.structSig || map.id !== regionDisplayV36.mapId) {
    regionDisplayV36.structSig = structSig;
    regionDisplayV36.mapId = map.id;
    buildRegionDisplayStructureV36(map);
  } else {
    sizeRegionDisplayFrameV36();
  }
  ensureRegionDisplayRafV36();
}
