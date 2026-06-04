
const root = document.getElementById('player-display-root');
let playerDisplayMirror = { activeSceneId: '', cameraByScene: {}, updatedAt: null };

function normalizeMirrorPayload(payload = {}) {
  return {
    activeSceneId: String(payload?.activeSceneId || '').trim(),
    cameraByScene: payload?.cameraByScene && typeof payload.cameraByScene === 'object' ? payload.cameraByScene : {},
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
    const signature = JSON.stringify({
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
  refresh();
});
