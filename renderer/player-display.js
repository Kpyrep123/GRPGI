
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
  const start = Date.parse(token.moveStartedAt || '');
  const end = Date.parse(token.moveEndsAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || at >= end) return { x: Number(token.destX ?? token.x ?? 0), y: Number(token.destY ?? token.y ?? 0) };
  const t = clamp((at - start) / (end - start), 0, 1);
  return { x: Number(token.startX ?? token.x ?? 0) + (Number(token.destX ?? token.x ?? 0) - Number(token.startX ?? token.x ?? 0)) * t, y: Number(token.startY ?? token.y ?? 0) + (Number(token.destY ?? token.y ?? 0) - Number(token.startY ?? token.y ?? 0)) * t };
}
function displayTokenVisibleV36(token) { return Boolean(token && token.visibleToPlayers); }
function displayShipForTokenV36(token) {
  const ships = regionDisplayV36.ships || {};
  if (token.shipId && ships[token.shipId]) return ships[token.shipId];
  const uid = token.playerId && regionDisplayV36.users?.[token.playerId]?.currentShipId;
  return uid && ships[uid] ? ships[uid] : null;
}
function displayLiveFuelV36(token, ship, at) {
  if (!ship) return 0;
  const start = Date.parse(token.moveStartedAt || ''), end = Date.parse(token.moveEndsAt || '');
  if (token.moveShipId === ship.id && Number.isFinite(start) && Number.isFinite(end) && end > start) {
    const t = clamp((at - start) / (end - start), 0, 1);
    return clamp(Number(token.moveFuelStart || ship.fuel || 0) - Number(token.moveFuelCost || 0) * t, 0, Math.max(1, Number(ship.fuelCapacity || ship.fuel || 0)));
  }
  return Number(ship.fuel || 0);
}
function displayRangeV36(ship, fuel) { return Math.max(0, (Math.max(0, fuel) / Math.max(0.01, Number(ship.fuelConsumption || 1))) * 100); }
function isRegionDisplayActiveV36() { return playerDisplayMirror?.mode === 'region' || Boolean(playerDisplayMirror?.activeRegionMapId) || Boolean(regionDisplayV36.mapId); }

function buildRegionDisplayStructureV36(map) {
  const visibleTokens = (map.tokens || []).filter(displayTokenVisibleV36);
  const markersHtml = (map.markers || []).filter(m => m.visibleToPlayers !== false).map(m =>
    `<div class="region-display-marker-v36" style="left:${(Number(m.x||0)/map.width*100).toFixed(3)}%;top:${(Number(m.y||0)/map.height*100).toFixed(3)}%;--rts-color:${esc(m.color || '#7df9ff')}"><span></span><b>${esc(m.name || '')}</b></div>`).join('');
  const tokensHtml = visibleTokens.map(t => {
    const isShip = t.type === 'ship';
    const ship = t.shipId && regionDisplayV36.ships[t.shipId] ? regionDisplayV36.ships[t.shipId] : null;
    // Ships render as a plain coloured circle + name (no image).
    const img = isShip ? '' : String(t.image || ship?.image || '').trim();
    const inner = img ? `<img src="${esc(img)}" alt="" />` : `<span>${esc(isShip ? '' : t.type === 'player' ? '●' : '▲')}</span>`;
    return `<div class="region-display-token-v36${isShip ? ' is-ship-v36' : ''}" data-token-id="${esc(String(t.id || ''))}" style="--rts-color:${esc(t.color || '#7df9ff')}">${inner}<b>${esc(t.name || t.id || '')}</b></div>`;
  }).join('');
  const rangesHtml = visibleTokens.filter(t => t.type !== 'unit').map(t => `<div class="region-display-range-v36" data-range-for="${esc(String(t.id || ''))}" style="display:none"></div>`).join('');
  root.innerHTML = `<div class="player-display-stage"><div class="player-display-board-frame region-display-frame-v36" id="rd-frame-v36"><div class="region-display-stage-v36" id="rd-stage-v36" style="background-image:${map.image ? `url('${esc(map.image)}')` : 'none'}">${rangesHtml}<div class="rts-map-grid-v36"></div>${markersHtml}${tokensHtml}<canvas class="region-display-fog-canvas-v36" id="rd-fog-v36" style="display:none"></canvas></div><div class="region-display-title-v36">${esc(map.name)}</div></div></div>`;
  regionDisplayV36.frame = document.getElementById('rd-frame-v36');
  regionDisplayV36.stage = document.getElementById('rd-stage-v36');
  regionDisplayV36.fogCanvas = document.getElementById('rd-fog-v36');
  regionDisplayV36.fogBase = null;
  regionDisplayV36.fogBaseSig = '';
  regionDisplayV36.tokenNodes = {};
  regionDisplayV36.rangeNodes = {};
  if (regionDisplayV36.stage) {
    regionDisplayV36.stage.querySelectorAll('[data-token-id]').forEach(node => { regionDisplayV36.tokenNodes[node.dataset.tokenId] = node; });
    regionDisplayV36.stage.querySelectorAll('[data-range-for]').forEach(node => { regionDisplayV36.rangeNodes[node.dataset.rangeFor] = node; });
  }
  sizeRegionDisplayFrameV36();
  regionDisplayPositionV36(Date.now());
}
function renderRegionDisplayFogV36(map, now) {
  const canvas = regionDisplayV36.fogCanvas;
  if (!canvas) return;
  if (!map.fog || !map.fog.enabled) { canvas.style.display = 'none'; return; }
  const cols = 64;
  const rows = clamp(Math.round(cols * (map.height / Math.max(1, map.width))), 16, 110);
  const len = cols * rows;
  const explored = (typeof map.fog.explored === 'string' && map.fog.explored.length === len) ? map.fog.explored : '0'.repeat(len);
  const W = 900, H = Math.max(1, Math.round(W * (map.height / Math.max(1, map.width))));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  canvas.style.display = '';
  const ctx = canvas.getContext('2d');
  const ones = (explored.match(/1/g) || []).length;
  const sig = `${len}:${ones}`;
  if (regionDisplayV36.fogBaseSig !== sig || !regionDisplayV36.fogBase) {
    const base = document.createElement('canvas'); base.width = cols; base.height = rows;
    const bc = base.getContext('2d');
    bc.fillStyle = 'rgba(2,6,12,0.96)'; bc.fillRect(0, 0, cols, rows);
    bc.globalCompositeOperation = 'destination-out'; bc.fillStyle = 'rgba(0,0,0,0.62)';
    for (let i = 0; i < explored.length; i++) { if (explored[i] === '1') bc.fillRect(i % cols, Math.floor(i / cols), 1, 1); }
    bc.globalCompositeOperation = 'source-over';
    regionDisplayV36.fogBase = base; regionDisplayV36.fogBaseSig = sig;
  }
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  try { ctx.drawImage(regionDisplayV36.fogBase, 0, 0, W, H); } catch {}
  ctx.globalCompositeOperation = 'destination-out';
  const baseR = Number(map.fog.radius || 50);
  (map.tokens || []).filter(t => displayTokenVisibleV36(t) && t.type !== 'unit').forEach(t => {
    const p = regionTokenPosDisplayV36(t, now);
    const r = Math.max(2, Math.max(baseR, Number(t.radarRadius || 0)) / map.width * W);
    const cx = p.x / map.width * W, cy = p.y / map.height * H;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.72, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
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
  regionDisplayV36.users = state?.users || {};
  if (playerDisplayMirror.regionCamera) {
    regionDisplayV36.cameraTarget = { zoom: Number(playerDisplayMirror.regionCamera.zoom || 1), panFracX: Number(playerDisplayMirror.regionCamera.panFracX || 0), panFracY: Number(playerDisplayMirror.regionCamera.panFracY || 0) };
  }
  const structSig = JSON.stringify({
    id: map.id, name: map.name, image: map.image, w: map.width, h: map.height,
    markers: (map.markers || []).filter(m => m.visibleToPlayers !== false).map(m => [m.id, Math.round(m.x), Math.round(m.y), m.name, m.color]),
    tokens: (map.tokens || []).filter(displayTokenVisibleV36).map(t => [t.id, t.type, t.color, t.image || (regionDisplayV36.ships[t.shipId]?.image || ''), t.name])
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
