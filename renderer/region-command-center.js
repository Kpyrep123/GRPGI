/* GRPGI Region Command Center v2 — explicit DM workflow, stable incremental canvas */
(function regionCommandCenterBootstrap() {
  'use strict';

  if (window.__regionCommandCenterV2) return;
  window.__regionCommandCenterV2 = true;

  const api = () => window.RegionMapsV36;
  const deep = value => JSON.parse(JSON.stringify(value));
  const clampN = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const text = value => String(value ?? '');
  const escapeHtml = value => text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const cssEscape = value => window.CSS?.escape ? CSS.escape(text(value)) : text(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const list = value => Array.isArray(value) ? value : [];
  const dict = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sorted = values => [...values].sort((a, b) => text(a?.name || a?.displayName || a?.id).localeCompare(text(b?.name || b?.displayName || b?.id), 'ru'));

  function roleIsGm() {
    const user = App?.currentUser || App?.state?.users?.[App?.currentUserId] || {};
    const role = text(user.role).toLowerCase();
    return role === 'gm' || role === 'dm' || role === 'master' || ['gm', 'dm'].includes(text(user.id).toLowerCase());
  }

  const state = {
    open: false,
    view: 'map',
    mapId: '',
    planetId: '',
    sidebarTab: 'regions',
    catalogType: 'ships',
    selectedCatalogId: '',
    selectedKind: '',
    selectedId: '',
    workspaceMode: 'operate',
    tool: 'select',
    placement: null,
    selectedMissileId: '',
    layerFilter: 'all',
    layers: { grid: true, labels: true, vision: true, radar: true, fuel: true, weapons: true, fog: false },
    camera: { zoom: 1, panX: 0, panY: 0, baseW: 1, baseH: 1 },
    pointer: { mapX: 0, mapY: 0, over: false },
    pan: null,
    drag: null,
    spaceDown: false,
    raf: 0,
    lastFrameAt: 0,
    saveTimer: 0,
    saveState: 'saved',
    saveLabel: 'Сохранено',
    undo: [],
    redo: [],
    search: '',
    eventLog: [],
    inspectorSection: 'main',
    resizeObserver: null,
    lastFogAt: 0,
    lastDisplayMirrorAt: 0
  };

  function maps() { return api()?.maps?.() || {}; }
  function ships() { return api()?.ships?.() || {}; }
  function missiles() { return api()?.missiles?.() || Data?.missiles || {}; }
  function radars() { return api()?.radars?.() || Data?.radars || {}; }
  function currentMap() { return maps()[state.mapId] || null; }
  function currentSelection() {
    const map = currentMap();
    if (!map || !state.selectedId) return null;
    if (state.selectedKind === 'token') return list(map.tokens).find(item => item.id === state.selectedId) || null;
    if (state.selectedKind === 'marker') return list(map.markers).find(item => item.id === state.selectedId) || null;
    return null;
  }

  function notify(message, type = 'ok') {
    try { Toast.show(message, type); } catch { console[type === 'err' ? 'error' : 'log'](message); }
  }

  function logEvent(label, detail = '') {
    state.eventLog.unshift({ at: new Date().toISOString(), label, detail });
    state.eventLog = state.eventLog.slice(0, 40);
    renderFooter();
  }

  function setSaveState(kind, label) {
    state.saveState = kind;
    state.saveLabel = label;
    const node = document.getElementById('rcc-save-state-v2');
    if (node) {
      node.className = `rcc-save-state-v2 is-${kind}`;
      node.textContent = label;
    }
  }

  function queuePersist(label = 'Изменения сохранены', delay = 500) {
    clearTimeout(state.saveTimer);
    setSaveState('dirty', 'Есть изменения');
    state.saveTimer = window.setTimeout(async () => {
      state.saveTimer = 0;
      setSaveState('saving', 'Сохранение…');
      try {
        await api()?.persist?.('', { silent: true });
        setSaveState('saved', 'Сохранено');
        if (label) logEvent(label);
      } catch (error) {
        setSaveState('error', 'Ошибка сохранения');
        notify(`Не удалось сохранить карту: ${error?.message || error}`, 'err');
      }
    }, delay);
  }

  async function flushPersist() {
    if (!state.saveTimer) return;
    clearTimeout(state.saveTimer);
    state.saveTimer = 0;
    setSaveState('saving', 'Сохранение…');
    try {
      await api()?.persist?.('', { silent: true });
      setSaveState('saved', 'Сохранено');
    } catch (error) {
      setSaveState('error', 'Ошибка сохранения');
    }
  }

  function captureWorld(label) {
    state.undo.push({
      label,
      maps: deep(maps()),
      ships: deep(ships()),
      missiles: deep(missiles()),
      radars: deep(radars()),
      mapId: state.mapId,
      selectedKind: state.selectedKind,
      selectedId: state.selectedId
    });
    if (state.undo.length > 20) state.undo.shift();
    state.redo = [];
    renderFooter();
  }

  function snapshotCurrent(label) {
    return {
      label,
      maps: deep(maps()),
      ships: deep(ships()),
      missiles: deep(missiles()),
      radars: deep(radars()),
      mapId: state.mapId,
      selectedKind: state.selectedKind,
      selectedId: state.selectedId
    };
  }

  function restoreDict(target, snapshot) {
    Object.keys(target).forEach(key => delete target[key]);
    Object.entries(snapshot || {}).forEach(([key, value]) => { target[key] = deep(value); });
  }

  function restoreWorld(snapshot) {
    restoreDict(maps(), snapshot.maps);
    restoreDict(ships(), snapshot.ships);
    restoreDict(missiles(), snapshot.missiles);
    restoreDict(radars(), snapshot.radars);
    state.mapId = maps()[snapshot.mapId] ? snapshot.mapId : Object.keys(maps())[0] || '';
    state.selectedKind = snapshot.selectedKind || '';
    state.selectedId = snapshot.selectedId || '';
    api()?.activate?.(state.mapId);
    renderAll({ scene: true });
    queuePersist(snapshot.label || 'Состояние восстановлено', 80);
  }

  function undo() {
    const snapshot = state.undo.pop();
    if (!snapshot) return;
    state.redo.push(snapshotCurrent(`Повтор: ${snapshot.label}`));
    restoreWorld(snapshot);
    logEvent(`Отмена: ${snapshot.label}`);
  }

  function redo() {
    const snapshot = state.redo.pop();
    if (!snapshot) return;
    state.undo.push(snapshotCurrent(`Отмена повтора: ${snapshot.label}`));
    restoreWorld(snapshot);
    logEvent(`Повтор: ${snapshot.label}`);
  }

  function upgradeData() {
    Object.values(maps()).forEach(map => {
      map.gridSize = Math.max(1, Number(map.gridSize || 50));
      map.snapToGrid = Boolean(map.snapToGrid);
      map.defaultLayer = ['surface', 'air', 'orbit'].includes(map.defaultLayer) ? map.defaultLayer : 'surface';
      map.tokens = list(map.tokens).map(token => ({
        ...token,
        layer: ['surface', 'air', 'orbit'].includes(token.layer) ? token.layer : map.defaultLayer,
        factionId: text(token.factionId),
        status: text(token.status || 'active'),
        locked: Boolean(token.locked)
      }));
      map.markers = list(map.markers).map(marker => ({
        ...marker,
        category: text(marker.category || marker.type || 'point'),
        icon: text(marker.icon),
        locked: Boolean(marker.locked)
      }));
    });
    Object.values(ships()).forEach(ship => {
      ship.callsign = text(ship.callsign);
      ship.factionId = text(ship.factionId);
      ship.status = ['operational', 'damaged', 'disabled', 'destroyed'].includes(ship.status) ? ship.status : 'operational';
      ship.hullCapacity = Math.max(1, Number(ship.hullCapacity || 100));
      ship.hull = clampN(ship.hull ?? ship.hullCapacity, 0, ship.hullCapacity);
      ship.missileStock = dict(ship.missileStock);
      list(ship.missileIds).forEach(id => {
        if (!Number.isFinite(Number(ship.missileStock[id]))) ship.missileStock[id] = -1;
      });
    });
    Object.values(missiles()).forEach(item => {
      item.damage = text(item.damage);
      item.blastRadius = Math.max(0, Number(item.blastRadius || 0));
      item.ammoLabel = text(item.ammoLabel);
    });
    Object.values(radars()).forEach(item => {
      item.kind = ['radar', 'passive', 'jammer'].includes(item.kind) ? item.kind : 'radar';
      item.power = clampN(item.power ?? 100, 0, 100);
    });
  }

  function ensureModal() {
    let modal = document.getElementById('region-command-center-v2');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'region-command-center-v2';
    modal.className = 'rcc-modal-v2';
    modal.innerHTML = `
      <section class="rcc-shell-v2" role="dialog" aria-modal="true" aria-label="Центр управления регионами">
        <header class="rcc-header-v2" id="rcc-header-v2"></header>
        <div class="rcc-body-v2">
          <aside class="rcc-sidebar-v2" id="rcc-sidebar-v2"></aside>
          <main class="rcc-workspace-v2" id="rcc-workspace-v2"></main>
          <aside class="rcc-inspector-v2" id="rcc-inspector-v2"></aside>
        </div>
        <footer class="rcc-footer-v2" id="rcc-footer-v2"></footer>
      </section>`;
    document.body.appendChild(modal);
    bindModal(modal);
    state.resizeObserver = new ResizeObserver(() => {
      if (!state.open || state.view !== 'map') return;
      layoutStage();
      updateCameraTransform();
    });
    state.resizeObserver.observe(modal.querySelector('.rcc-workspace-v2'));
    return modal;
  }

  function open(mapId = '', options = {}) {
    if (!roleIsGm()) return api()?.openLegacy?.(mapId);
    upgradeData();
    state.open = true;
    state.view = options.view || 'map';
    if (mapId && maps()[mapId]) state.mapId = mapId;
    if (!state.mapId || !maps()[state.mapId]) state.mapId = Object.keys(maps())[0] || '';
    const map = currentMap();
    state.planetId = options.planetId || map?.planetId || state.planetId || Object.keys(PLANETS || {})[0] || '';
    state.catalogType = options.catalogType || state.catalogType;
    state.selectedCatalogId = options.catalogId || state.selectedCatalogId;
    state.selectedKind = '';
    state.selectedId = '';
    state.tool = 'select';
    state.placement = null;
    state.camera = { zoom: 1, panX: 0, panY: 0, baseW: 1, baseH: 1 };
    api()?.activate?.(state.mapId);
    api()?.setMode?.(state.workspaceMode === 'build' ? 'edit' : 'play');
    api()?.setFogPreview?.(state.layers.fog);
    const modal = ensureModal();
    modal.classList.add('open');
    renderAll({ scene: true });
    startLoop();
    queueDisplayMirror();
  }

  async function close() {
    state.open = false;
    state.pan = null;
    state.drag = null;
    state.placement = null;
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    await flushPersist();
    document.getElementById('region-command-center-v2')?.classList.remove('open');
  }

  function setView(view, catalogType = '') {
    state.view = view;
    if (catalogType) state.catalogType = catalogType;
    state.selectedCatalogId = '';
    state.selectedKind = '';
    state.selectedId = '';
    state.tool = 'select';
    state.placement = null;
    renderAll({ scene: view === 'map' });
  }

  function setMap(mapId) {
    if (!maps()[mapId]) return;
    state.mapId = mapId;
    state.planetId = maps()[mapId].planetId || state.planetId;
    state.selectedKind = '';
    state.selectedId = '';
    state.tool = 'select';
    state.placement = null;
    state.camera = { zoom: 1, panX: 0, panY: 0, baseW: 1, baseH: 1 };
    api()?.activate?.(mapId);
    const runtime = api()?.getRuntime?.();
    if (runtime) runtime.missiles = [];
    renderAll({ scene: true });
    queueDisplayMirror();
  }

  function createMap(kind = 'region', planetId = state.planetId) {
    captureWorld('Создание карты');
    const id = uid(kind);
    const names = { region: 'Новый регион', city: 'Новый город', building: 'Новое здание' };
    maps()[id] = api()?.normalizeMap?.({
      id,
      name: names[kind] || 'Новая карта',
      kind,
      planetId: planetId || Object.keys(PLANETS || {})[0] || '',
      parentRegionId: kind === 'region' ? '' : (currentMap()?.id || ''),
      width: kind === 'building' ? 800 : 1400,
      height: kind === 'building' ? 600 : 900,
      gridSize: kind === 'building' ? 10 : 50,
      fog: { enabled: kind !== 'building', radius: kind === 'building' ? 15 : 80 },
      markers: [],
      tokens: []
    }) || { id, name: names[kind], kind, planetId, width: 1400, height: 900, markers: [], tokens: [] };
    state.view = 'map';
    state.workspaceMode = 'build';
    api()?.setMode?.('edit');
    setMap(id);
    queuePersist('Карта создана', 100);
  }

  function duplicateCurrentMap() {
    const map = currentMap();
    if (!map) return;
    captureWorld('Копирование карты');
    const id = uid(map.kind || 'region');
    const copy = deep(map);
    copy.id = id;
    copy.name = `${map.name} — копия`;
    copy.tokens = list(copy.tokens).map(token => ({
      ...token,
      id: uid('token'),
      moveStartedAt: '',
      moveEndsAt: '',
      startX: Number(token.x || 0),
      startY: Number(token.y || 0),
      destX: Number(token.x || 0),
      destY: Number(token.y || 0)
    }));
    copy.markers = list(copy.markers).map(marker => ({ ...marker, id: uid('marker') }));
    maps()[id] = api()?.normalizeMap?.(copy) || copy;
    setMap(id);
    state.workspaceMode = 'build';
    api()?.setMode?.('edit');
    renderAll({ scene: true });
    queuePersist('Карта скопирована', 100);
  }

  function deleteCurrentMap() {
    const map = currentMap();
    if (!map) return;
    if (!window.confirm(`Удалить карту «${map.name}»? Объекты на ней будут удалены.`)) return;
    captureWorld('Удаление карты');
    delete maps()[map.id];
    Object.values(maps()).forEach(item => {
      if (item.parentRegionId === map.id) item.parentRegionId = '';
      list(item.markers).forEach(marker => { if (marker.targetRegionId === map.id) marker.targetRegionId = ''; });
    });
    Object.values(ships()).forEach(ship => { if (ship.currentRegionId === map.id) ship.currentRegionId = ''; });
    Object.values(App?.state?.users || {}).forEach(user => { if (user.currentRegionId === map.id) user.currentRegionId = ''; });
    state.mapId = Object.keys(maps())[0] || '';
    api()?.activate?.(state.mapId);
    renderAll({ scene: true });
    queuePersist('Карта удалена', 100);
  }

  function renderAll(options = {}) {
    renderHeader();
    renderSidebar();
    renderWorkspace(options.scene !== false);
    renderInspector();
    renderFooter();
  }

  function mapBreadcrumb(map) {
    if (!map) return '';
    const chain = [];
    const seen = new Set();
    let cursor = map;
    while (cursor && !seen.has(cursor.id)) {
      chain.unshift(cursor.name || cursor.id);
      seen.add(cursor.id);
      cursor = maps()[cursor.parentRegionId];
    }
    return chain.join(' / ');
  }

  function renderHeader() {
    const root = document.getElementById('rcc-header-v2');
    if (!root) return;
    const map = currentMap();
    const planet = PLANETS?.[map?.planetId || state.planetId];
    root.innerHTML = `
      <div class="rcc-brand-v2">
        <span class="rcc-brand-mark-v2">◈</span>
        <div><b>REGION COMMAND CENTER</b><span>${escapeHtml(planet?.name || 'Планета не выбрана')}${map ? ` / ${escapeHtml(mapBreadcrumb(map))}` : ''}</span></div>
      </div>
      <nav class="rcc-main-tabs-v2" aria-label="Разделы">
        <button data-rcc-view="map" class="${state.view === 'map' ? 'active' : ''}">КАРТЫ</button>
        <button data-rcc-view="fleet" class="${state.view === 'fleet' ? 'active' : ''}">ФЛОТ</button>
        <button data-rcc-view="systems" class="${state.view === 'systems' ? 'active' : ''}">СИСТЕМЫ</button>
      </nav>
      <div class="rcc-header-actions-v2">
        ${state.view === 'map' ? `
          <div class="rcc-segment-v2">
            <button data-rcc-mode="operate" class="${state.workspaceMode === 'operate' ? 'active' : ''}">УПРАВЛЕНИЕ</button>
            <button data-rcc-mode="build" class="${state.workspaceMode === 'build' ? 'active' : ''}">КОНСТРУКТОР</button>
          </div>
          <button class="secondary" data-rcc-action="display">НА 2 ЭКРАН</button>` : ''}
        <span id="rcc-save-state-v2" class="rcc-save-state-v2 is-${state.saveState}">${escapeHtml(state.saveLabel)}</span>
        <button class="ghost" data-rcc-action="close" title="Закрыть">✕</button>
      </div>`;
  }

  function mapDepth(map, seen = new Set()) {
    if (!map?.parentRegionId || seen.has(map.id)) return 0;
    seen.add(map.id);
    return 1 + mapDepth(maps()[map.parentRegionId], seen);
  }

  function orderMapsByHierarchy(items) {
    const pool = new Map(items.map(item => [item.id, item]));
    const children = new Map();
    items.forEach(item => {
      const parentId = pool.has(item.parentRegionId) ? item.parentRegionId : '';
      const bucket = children.get(parentId) || [];
      bucket.push(item);
      children.set(parentId, bucket);
    });
    children.forEach(bucket => bucket.sort((a, b) => text(a.name || a.id).localeCompare(text(b.name || b.id), 'ru')));
    const output = [];
    const visited = new Set();
    const visit = item => {
      if (!item || visited.has(item.id)) return;
      visited.add(item.id);
      output.push(item);
      list(children.get(item.id)).forEach(visit);
    };
    list(children.get('')).forEach(visit);
    items.forEach(visit);
    return output;
  }

  function renderSidebar() {
    const root = document.getElementById('rcc-sidebar-v2');
    if (!root) return;
    if (state.view === 'map') {
      const planetOptions = sorted(Object.values(PLANETS || {})).map(planet => `<option value="${escapeHtml(planet.id)}" ${planet.id === state.planetId ? 'selected' : ''}>${escapeHtml(planet.name || planet.id)}</option>`).join('');
      const q = state.search.trim().toLowerCase();
      const visibleMaps = orderMapsByHierarchy(Object.values(maps()).filter(map => !state.planetId || map.planetId === state.planetId))
        .filter(map => !q || `${map.name} ${map.id} ${map.kind}`.toLowerCase().includes(q));
      root.innerHTML = `
        <div class="rcc-sidebar-head-v2">
          <select class="select" id="rcc-planet-select-v2">${planetOptions || '<option value="">Нет планет</option>'}</select>
          <div class="rcc-mini-tabs-v2"><button data-rcc-sidebar="regions" class="${state.sidebarTab === 'regions' ? 'active' : ''}">РЕГИОНЫ</button><button data-rcc-sidebar="objects" class="${state.sidebarTab === 'objects' ? 'active' : ''}">ОБЪЕКТЫ</button></div>
          <input class="input" id="rcc-sidebar-search-v2" value="${escapeHtml(state.search)}" placeholder="Поиск…" />
        </div>
        <div class="rcc-sidebar-scroll-v2">
          ${state.sidebarTab === 'regions' ? `
            <div class="rcc-map-list-v2">${visibleMaps.map(map => {
              const depth = Math.min(3, mapDepth(map));
              const counts = `${list(map.tokens).length} объектов · ${list(map.markers).length} меток`;
              return `<button class="rcc-map-row-v2 ${map.id === state.mapId ? 'active' : ''}" data-rcc-map="${escapeHtml(map.id)}" style="--depth:${depth}"><span class="rcc-map-kind-v2">${map.kind === 'city' ? '◆' : map.kind === 'building' ? '▣' : '⬡'}</span><span><b>${escapeHtml(map.name)}</b><small>${escapeHtml(counts)}</small></span></button>`;
            }).join('') || '<div class="rcc-empty-v2">На этой планете нет карт.</div>'}</div>
          ` : renderObjectLibrary()}
        </div>
        ${state.sidebarTab === 'regions' ? `<div class="rcc-sidebar-actions-v2"><button data-rcc-create-map="region">+ РЕГИОН</button><button data-rcc-create-map="city">+ ГОРОД</button><button data-rcc-create-map="building">+ ЗДАНИЕ</button></div>` : `<div class="rcc-sidebar-actions-v2"><span>${state.placement ? 'Кликните по карте для размещения' : 'Выберите объект для размещения'}</span></div>`}`;
      return;
    }

    const type = state.view === 'fleet' ? 'ships' : state.catalogType;
    const source = type === 'ships' ? ships() : type === 'missiles' ? missiles() : radars();
    const rows = sorted(Object.values(source)).filter(item => {
      const q = state.search.trim().toLowerCase();
      return !q || `${item.name} ${item.id} ${item.model || ''}`.toLowerCase().includes(q);
    });
    root.innerHTML = `
      <div class="rcc-sidebar-head-v2">
        ${state.view === 'systems' ? `<div class="rcc-mini-tabs-v2"><button data-rcc-catalog="missiles" class="${type === 'missiles' ? 'active' : ''}">РАКЕТЫ</button><button data-rcc-catalog="radars" class="${type === 'radars' ? 'active' : ''}">РЛС / РЭБ</button></div>` : '<div class="rcc-sidebar-title-v2">Корабли кампании</div>'}
        <input class="input" id="rcc-sidebar-search-v2" value="${escapeHtml(state.search)}" placeholder="Поиск…" />
      </div>
      <div class="rcc-sidebar-scroll-v2"><div class="rcc-catalog-list-v2">
        ${rows.map(item => `<button class="rcc-catalog-row-v2 ${item.id === state.selectedCatalogId ? 'active' : ''}" data-rcc-catalog-id="${escapeHtml(item.id)}"><span>${type === 'ships' ? '◉' : type === 'missiles' ? '➤' : item.kind === 'jammer' ? '≈' : '⌁'}</span><span><b>${escapeHtml(item.name || item.id)}</b><small>${escapeHtml(type === 'ships' ? item.model || item.status : type === 'missiles' ? `${item.guidance} · ${item.range}` : `${item.kind} · ${item.range}`)}</small></span></button>`).join('') || '<div class="rcc-empty-v2">Каталог пуст.</div>'}
      </div></div>
      <div class="rcc-sidebar-actions-v2"><button data-rcc-action="catalog-add">+ СОЗДАТЬ</button></div>`;
  }

  function renderObjectLibrary() {
    const q = state.search.trim().toLowerCase();
    const filter = item => !q || `${item.name || item.displayName || ''} ${item.id || ''}`.toLowerCase().includes(q);
    const shipRows = sorted(Object.values(ships())).filter(filter).map(ship => libraryRow('ship', ship.id, ship.name, `${ship.model || 'Корабль'} · ⛽ ${Number(ship.fuel || 0).toFixed(0)}`)).join('');
    const playerRows = sorted(Object.values(App?.state?.users || PLAYER_TEMPLATES || {})).filter(player => text(player.role).toLowerCase() !== 'gm').filter(filter).map(player => libraryRow('player', player.id, player.displayName || player.id, 'Персонаж игрока')).join('');
    const npcRows = sorted(Object.values(NPCS || {})).filter(filter).map(npc => libraryRow('npc', npc.id, npc.name || npc.id, 'NPC / группа')).join('');
    return `
      <div class="rcc-library-section-v2"><b>БЫСТРЫЕ ОБЪЕКТЫ</b>
        ${libraryRow('unit', '', 'Нейтральный отряд', 'Свободный тактический объект')}
        ${libraryRow('city', '', 'Поселение / объект', 'Закреплённая точка')}
        ${libraryRow('marker', '', 'Метка перехода', 'Связь с другой картой')}
      </div>
      <div class="rcc-library-section-v2"><b>КОРАБЛИ</b>${shipRows || '<small>Нет кораблей</small>'}</div>
      <div class="rcc-library-section-v2"><b>ИГРОКИ</b>${playerRows || '<small>Нет игроков</small>'}</div>
      <div class="rcc-library-section-v2"><b>NPC</b>${npcRows || '<small>Нет NPC</small>'}</div>`;
  }

  function libraryRow(kind, id, name, subtitle) {
    const active = state.placement?.kind === kind && state.placement?.id === id;
    return `<button class="rcc-library-row-v2 ${active ? 'active' : ''}" data-rcc-place-kind="${escapeHtml(kind)}" data-rcc-place-id="${escapeHtml(id)}"><span>${kind === 'ship' ? '◉' : kind === 'player' ? '●' : kind === 'marker' ? '◆' : kind === 'city' ? '▣' : '▲'}</span><span><b>${escapeHtml(name)}</b><small>${escapeHtml(subtitle)}</small></span><em>${active ? 'ГОТОВО' : '+'}</em></button>`;
  }

  function renderWorkspace(renderScene = true) {
    const root = document.getElementById('rcc-workspace-v2');
    if (!root) return;
    if (state.view !== 'map') {
      root.innerHTML = renderCatalogOverview();
      return;
    }
    const map = currentMap();
    if (!map) {
      root.innerHTML = '<div class="rcc-empty-workspace-v2"><b>Нет карт</b><span>Создайте первый регион в левой панели.</span></div>';
      return;
    }
    if (!renderScene && root.querySelector('.rcc-map-viewport-v2')) return;
    root.innerHTML = `
      <div class="rcc-map-toolbar-v2">
        <div class="rcc-tools-v2">
          <button data-rcc-tool="select" class="${state.tool === 'select' ? 'active' : ''}" title="Выбор [V]">⌖<span>Выбор</span></button>
          <button data-rcc-tool="move" class="${state.tool === 'move' ? 'active' : ''}" title="Маршрут [M]">➜<span>Маршрут</span></button>
          <button data-rcc-tool="missile" class="${state.tool === 'missile' ? 'active' : ''}" title="Ракета [R]">➤<span>Ракета</span></button>
          ${state.workspaceMode === 'build' ? `<button data-rcc-tool="marker" class="${state.tool === 'marker' ? 'active' : ''}" title="Метка [P]">◆<span>Метка</span></button>` : ''}
          <button data-rcc-tool="measure" class="${state.tool === 'measure' ? 'active' : ''}" title="Измерение [D]">⌇<span>Линейка</span></button>
        </div>
        <div class="rcc-layer-buttons-v2">
          ${layerButton('grid', 'СЕТКА')}${layerButton('labels', 'ПОДПИСИ')}${layerButton('vision', 'ОБЗОР')}${layerButton('radar', 'РЛС')}${layerButton('fuel', 'ТОПЛИВО')}${layerButton('weapons', 'ОРУЖИЕ')}${layerButton('fog', 'ТУМАН')}
        </div>
      </div>
      <div class="rcc-map-viewport-v2" id="rcc-map-viewport-v2">
        <div class="rcc-stage-v2" id="rcc-stage-v2" tabindex="0">
          <div class="rcc-grid-v2" id="rcc-grid-v2"></div>
          <svg class="rcc-routes-v2" id="rcc-routes-v2" viewBox="0 0 ${Number(map.width || 1000)} ${Number(map.height || 700)}" preserveAspectRatio="none"></svg>
          <div class="rcc-ranges-v2" id="rcc-ranges-v2"></div>
          <div class="rcc-markers-v2" id="rcc-markers-v2"></div>
          <div class="rcc-tokens-v2" id="rcc-tokens-v2"></div>
          <div class="rts-missiles-layer-v36 rcc-missiles-v2" id="rts-missiles-layer-v36"></div>
          <canvas class="rts-fog-canvas-v36 rcc-fog-v2" id="rts-fog-canvas-v36"></canvas>
        </div>
        <div class="rcc-map-corner-v2 rcc-map-title-v2"><b>${escapeHtml(map.name)}</b><span>${escapeHtml(map.kind)} · ${Number(map.width)}×${Number(map.height)} ${escapeHtml(map.scaleLabel || 'ед')}</span></div>
        <div class="rcc-map-corner-v2 rcc-zoom-v2"><button data-rcc-action="zoom-in">＋</button><button data-rcc-action="zoom-out">－</button><button data-rcc-action="focus">◎</button><button data-rcc-action="zoom-reset">⟲</button></div>
        <div class="rcc-command-hint-v2" id="rcc-command-hint-v2"></div>
      </div>`;
    renderSceneEntities();
    requestAnimationFrame(() => { layoutStage(); updateCameraTransform(); });
  }

  function layerButton(key, label) {
    return `<button data-rcc-layer="${key}" class="${state.layers[key] ? 'active' : ''}">${label}</button>`;
  }

  function renderCatalogOverview() {
    const type = state.view === 'fleet' ? 'ships' : state.catalogType;
    const source = type === 'ships' ? ships() : type === 'missiles' ? missiles() : radars();
    const items = sorted(Object.values(source));
    if (!items.length) return `<div class="rcc-empty-workspace-v2"><b>Каталог пуст</b><span>Создайте первый объект в левой панели.</span></div>`;
    return `<div class="rcc-catalog-overview-v2">
      <div class="rcc-overview-head-v2"><div><span>${type === 'ships' ? 'ФЛОТ КАМПАНИИ' : type === 'missiles' ? 'РАКЕТНОЕ ВООРУЖЕНИЕ' : 'СЕНСОРНЫЕ СИСТЕМЫ'}</span><h2>${items.length} объектов</h2></div><button class="primary" data-rcc-action="catalog-add">+ СОЗДАТЬ</button></div>
      <div class="rcc-overview-grid-v2">${items.map(item => catalogCard(type, item)).join('')}</div>
    </div>`;
  }

  function catalogCard(type, item) {
    if (type === 'ships') {
      const speed = api()?.shipSpeed?.(item) || 0;
      const fuelPct = item.fuelCapacity ? clampN(item.fuel / item.fuelCapacity * 100, 0, 100) : 0;
      return `<button class="rcc-overview-card-v2" data-rcc-catalog-id="${escapeHtml(item.id)}"><div class="rcc-card-icon-v2">◉</div><div><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.model || 'Без модели')}</span></div><div class="rcc-card-metrics-v2"><span>Скорость <b>${speed.toFixed(0)}</b></span><span>Топливо <b>${fuelPct.toFixed(0)}%</b></span><span>РЛС <b>${list(item.radarIds).length}</b></span></div></button>`;
    }
    if (type === 'missiles') return `<button class="rcc-overview-card-v2" data-rcc-catalog-id="${escapeHtml(item.id)}"><div class="rcc-card-icon-v2">➤</div><div><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.guidance)}</span></div><div class="rcc-card-metrics-v2"><span>Дальность <b>${Number(item.range)}</b></span><span>Поиск <b>${Number(item.seek)}</b></span><span>Скорость <b>${Number(item.speed)}</b></span></div></button>`;
    return `<button class="rcc-overview-card-v2" data-rcc-catalog-id="${escapeHtml(item.id)}"><div class="rcc-card-icon-v2">${item.kind === 'jammer' ? '≈' : '⌁'}</div><div><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.kind)}</span></div><div class="rcc-card-metrics-v2"><span>Дальность <b>${Number(item.range)}</b></span><span>Мощность <b>${Number(item.power || 100)}</b></span></div></button>`;
  }

  function renderSceneEntities() {
    const map = currentMap();
    if (!map) return;
    const tokenRoot = document.getElementById('rcc-tokens-v2');
    const markerRoot = document.getElementById('rcc-markers-v2');
    if (!tokenRoot || !markerRoot) return;
    tokenRoot.innerHTML = list(map.tokens).filter(token => state.layerFilter === 'all' || token.layer === state.layerFilter).map(tokenMarkup).join('');
    markerRoot.innerHTML = list(map.markers).map(markerMarkup).join('');
    document.getElementById('rcc-stage-v2')?.classList.toggle('hide-labels', !state.layers.labels);
    updateGrid();
    updateSelectionClasses();
  }

  function tokenMarkup(token) {
    const ship = token.shipId ? ships()[token.shipId] : null;
    const label = ship?.name || token.name || token.id;
    const kind = token.type === 'ship' || token.type === 'squadron' ? 'ship' : token.type === 'city' || token.type === 'facility' ? 'facility' : token.type === 'player' ? 'player' : token.type === 'aircraft' ? 'air' : 'unit';
    const glyph = kind === 'ship' ? '◉' : kind === 'facility' ? '▣' : kind === 'player' ? '●' : kind === 'air' ? '◆' : '▲';
    const status = ship?.status || token.status || 'active';
    return `<button class="rcc-token-v2 kind-${kind} status-${escapeHtml(status)} ${token.locked ? 'is-locked' : ''}" data-token-id="${escapeHtml(token.id)}" data-rcc-token="${escapeHtml(token.id)}" style="--token-color:${escapeHtml(token.color || '#7df9ff')}"><span class="rcc-token-core-v2">${glyph}</span><span class="rcc-token-label-v2">${escapeHtml(label)}</span><i class="rcc-token-layer-v2">${token.layer === 'orbit' ? 'ORB' : token.layer === 'air' ? 'AIR' : ''}</i></button>`;
  }

  function markerMarkup(marker) {
    const glyph = marker.icon || (marker.targetRegionId ? '↳' : marker.category === 'danger' ? '!' : '◆');
    return `<button class="rcc-marker-v2 ${marker.locked ? 'is-locked' : ''}" data-rcc-marker="${escapeHtml(marker.id)}" style="--marker-color:${escapeHtml(marker.color || '#7df9ff')}"><span>${escapeHtml(glyph)}</span><b>${escapeHtml(marker.name || 'Метка')}</b></button>`;
  }

  function renderInspector() {
    const root = document.getElementById('rcc-inspector-v2');
    if (!root) return;
    if (state.view !== 'map') {
      root.innerHTML = renderCatalogInspector();
      return;
    }
    const map = currentMap();
    if (!map) { root.innerHTML = ''; return; }
    const selected = currentSelection();
    if (state.selectedKind === 'token' && selected) root.innerHTML = renderTokenInspector(map, selected);
    else if (state.selectedKind === 'marker' && selected) root.innerHTML = renderMarkerInspector(map, selected);
    else root.innerHTML = renderMapInspector(map);
  }

  function isMapDescendant(candidateId, ancestorId) {
    const seen = new Set();
    let cursor = maps()[candidateId];
    while (cursor?.parentRegionId && !seen.has(cursor.id)) {
      if (cursor.parentRegionId === ancestorId) return true;
      seen.add(cursor.id);
      cursor = maps()[cursor.parentRegionId];
    }
    return false;
  }

  function renderMapInspector(map) {
    const playerSources = api()?.playerViewSources?.(map) || [];
    const radarContacts = api()?.playerRadarContacts?.(map) || [];
    const parentOptions = sorted(Object.values(maps()).filter(item => item.id !== map.id && item.planetId === map.planetId && !isMapDescendant(item.id, map.id)))
      .map(item => `<option value="${escapeHtml(item.id)}" ${item.id === map.parentRegionId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.kind)}</option>`).join('');
    return `
      <div class="rcc-inspector-head-v2"><span>КАРТА</span><h3>${escapeHtml(map.name)}</h3><small>${list(map.tokens).length} объектов · ${list(map.markers).length} меток</small></div>
      <div class="rcc-stat-grid-v2"><div><span>Источники обзора</span><b>${playerSources.length}</b></div><div><span>РЛС-контакты</span><b>${radarContacts.length}</b></div><div><span>Корабли</span><b>${list(map.tokens).filter(t => t.type === 'ship' || t.type === 'squadron').length}</b></div><div><span>Движутся</span><b>${list(map.tokens).filter(t => t.moveEndsAt).length}</b></div></div>
      <div class="rcc-panel-v2">
        <div class="rcc-panel-title-v2">Слои карты</div>
        <div class="rcc-layer-list-v2">${Object.entries({ grid: 'Сетка', labels: 'Подписи', vision: 'Радиус обзора', radar: 'РЛС', fuel: 'Запас хода', weapons: 'Дальность ракет', fog: 'Предпросмотр игроков' }).map(([key, label]) => `<label><input type="checkbox" data-rcc-layer-check="${key}" ${state.layers[key] ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
        <div class="rcc-layer-filter-v2"><button data-rcc-filter="all" class="${state.layerFilter === 'all' ? 'active' : ''}">ВСЕ</button><button data-rcc-filter="surface" class="${state.layerFilter === 'surface' ? 'active' : ''}">ПОВЕРХНОСТЬ</button><button data-rcc-filter="air" class="${state.layerFilter === 'air' ? 'active' : ''}">ВОЗДУХ</button><button data-rcc-filter="orbit" class="${state.layerFilter === 'orbit' ? 'active' : ''}">ОРБИТА</button></div>
      </div>
      ${state.workspaceMode === 'build' ? `
      <div class="rcc-panel-v2">
        <div class="rcc-panel-title-v2">Параметры</div>
        ${field('Название', 'map-name', map.name)}
        <div class="rcc-two-v2">${selectField('Тип', 'map-kind', map.kind, [['region','Регион'],['city','Город'],['building','Здание']])}${field('Единицы', 'map-scale', map.scaleLabel)}</div>
        <label class="rcc-field-v2"><span>Родительская карта</span><select class="select" data-rcc-field="map-parent"><option value="">Нет / корневой регион</option>${parentOptions}</select></label>
        <div class="rcc-two-v2">${numberField('Ширина', 'map-width', map.width, 300)}${numberField('Высота', 'map-height', map.height, 200)}</div>
        <div class="rcc-two-v2">${numberField('Шаг сетки', 'map-grid-size', map.gridSize || 50, 1)}${selectField('Слой по умолчанию', 'map-default-layer', map.defaultLayer || 'surface', [['surface','Поверхность'],['air','Воздух'],['orbit','Орбита']])}</div>
        <label class="rcc-check-v2"><input type="checkbox" data-rcc-field="map-snap" ${map.snapToGrid ? 'checked' : ''}> Привязка объектов к сетке</label>
        ${field('Фон карты (URL / asset)', 'map-image', map.image || '')}
        ${textareaField('Описание', 'map-summary', map.summary || '')}
        <div class="rcc-two-v2">${numberField('Обзор по умолчанию', 'map-fog-radius', map.fog?.radius ?? 50, 0)}<label class="rcc-check-v2"><input type="checkbox" data-rcc-field="map-fog-enabled" ${map.fog?.enabled !== false ? 'checked' : ''}> Туман войны</label></div>
      </div>
      <div class="rcc-two-v2"><button class="secondary" data-rcc-action="duplicate-map">СОЗДАТЬ КОПИЮ</button><button class="ghost danger" data-rcc-action="delete-map">УДАЛИТЬ КАРТУ</button></div>` : `
      <div class="rcc-panel-v2"><div class="rcc-panel-title-v2">Быстрые действия</div><button class="primary wide" data-rcc-action="open-library">+ ДОБАВИТЬ ОБЪЕКТ</button><button class="secondary wide" data-rcc-action="assign-player">ПРИВЯЗАТЬ ИГРОКА К РЕГИОНУ</button></div>`}`;
  }

  function renderTokenInspector(map, token) {
    const ship = api()?.liveShip?.(token) || null;
    const pos = api()?.currentPosition?.(token) || { x: token.x, y: token.y };
    const moving = Boolean(token.moveEndsAt);
    const radar = api()?.radarInfo?.(token) || { r: 0, active: false };
    const installedMissiles = ship && !ship.__squadron ? list(ship.missileIds).map(id => missiles()[id]).filter(Boolean) : [];
    if (!state.selectedMissileId || !installedMissiles.some(item => item.id === state.selectedMissileId)) state.selectedMissileId = installedMissiles[0]?.id || '';
    const fuel = ship ? api()?.liveFuel?.(token, ship) ?? ship.fuel : 0;
    const fuelCap = Number(ship?.fuelCapacity || 0);
    const hullPct = ship && !ship.__squadron ? clampN(ship.hull / ship.hullCapacity * 100, 0, 100) : 100;
    const fuelPct = fuelCap ? clampN(fuel / fuelCap * 100, 0, 100) : 0;
    const playerCrew = ship && !ship.__squadron ? list(ship.crewPlayerIds).map(id => App?.state?.users?.[id] || PLAYER_TEMPLATES?.[id]).filter(Boolean) : [];
    return `
      <div class="rcc-inspector-head-v2"><span>${token.type === 'ship' || token.type === 'squadron' ? 'КОРАБЛЬ / ГРУППА' : 'ОБЪЕКТ'}</span><h3>${escapeHtml(ship?.name || token.name || token.id)}</h3><small>${pos.x.toFixed(0)}, ${pos.y.toFixed(0)} ${escapeHtml(map.scaleLabel || 'ед')} · ${escapeHtml(token.layer || 'surface')}</small></div>
      ${ship ? `<div class="rcc-vitals-v2"><div><span>КОРПУС</span><i><b style="width:${hullPct}%"></b></i><em>${ship.__squadron ? 'Группа' : `${Number(ship.hull).toFixed(0)}/${Number(ship.hullCapacity).toFixed(0)}`}</em></div><div><span>ТОПЛИВО</span><i><b style="width:${fuelPct}%"></b></i><em>${Number(fuel).toFixed(1)}/${Number(fuelCap).toFixed(1)}</em></div></div>` : ''}
      <div class="rcc-action-grid-v2">
        <button data-rcc-tool="move" class="${state.tool === 'move' ? 'active' : ''}">➜ МАРШРУТ</button>
        <button data-rcc-action="stop" ${moving ? '' : 'disabled'}>■ СТОП</button>
        ${installedMissiles.length ? `<button data-rcc-tool="missile" class="${state.tool === 'missile' ? 'active' : ''}">➤ ЦЕЛЬ</button>` : ''}
        <button data-rcc-action="focus">◎ К ОБЪЕКТУ</button>
      </div>
      ${ship ? `
      <div class="rcc-panel-v2">
        <div class="rcc-panel-title-v2">Системы корабля <button data-rcc-action="open-ship-catalog" data-ship-id="${escapeHtml(ship.id || '')}">КАТАЛОГ ↗</button></div>
        <div class="rcc-system-line-v2"><span>Скорость</span><b>${Number(api()?.shipSpeed?.(ship) || ship.__speed || 0).toFixed(1)}</b></div>
        <div class="rcc-system-line-v2"><span>Запас хода</span><b>${Number(api()?.shipRangeFromFuel?.(ship, fuel) || 0).toFixed(0)} ${escapeHtml(map.scaleLabel || 'ед')}</b></div>
        <div class="rcc-system-line-v2"><span>РЛС</span><b>${radar.r ? `${radar.r} · ${radar.active ? 'АКТИВНА' : 'ВЫКЛ'}` : 'НЕТ'}</b></div>
        ${!ship.__squadron && radar.r ? `<label class="rcc-check-v2"><input type="checkbox" data-rcc-field="ship-radar-enabled" ${radar.active ? 'checked' : ''}> Питание РЛС</label>` : ''}
        ${!ship.__squadron ? `<div class="rcc-fuel-actions-v2"><button data-rcc-action="fuel-minus">−10</button><button data-rcc-action="fuel-plus">+10</button><button data-rcc-action="fuel-full">ЗАПРАВИТЬ</button></div>` : ''}
      </div>` : ''}
      ${installedMissiles.length ? `<div class="rcc-panel-v2"><div class="rcc-panel-title-v2">Ракетное вооружение</div><select class="select" data-rcc-field="selected-missile">${installedMissiles.map(item => {
        const stock = ship.missileStock?.[item.id];
        return `<option value="${escapeHtml(item.id)}" ${item.id === state.selectedMissileId ? 'selected' : ''}>${escapeHtml(item.name)} · ${item.range} · ${Number(stock) < 0 ? '∞' : Number(stock || 0)}</option>`;
      }).join('')}</select><div class="rcc-system-line-v2"><span>Дальность выбранной</span><b>${Number(missiles()[state.selectedMissileId]?.range || 0)} ${escapeHtml(map.scaleLabel || 'ед')}</b></div><button class="primary wide" data-rcc-tool="missile">ВЫБРАТЬ ЦЕЛЬ</button></div>` : ''}
      ${playerCrew.length ? `<div class="rcc-panel-v2"><div class="rcc-panel-title-v2">Экипаж игроков</div>${playerCrew.map(player => `<div class="rcc-crew-row-v2"><span>●</span><b>${escapeHtml(player.displayName || player.id)}</b></div>`).join('')}</div>` : ''}
      <div class="rcc-panel-v2">
        <div class="rcc-panel-title-v2">Положение и видимость</div>
        <label class="rcc-check-v2"><input type="checkbox" data-rcc-field="token-visible" ${token.visibleToPlayers ? 'checked' : ''}> Закрепить для игроков</label>
        ${state.workspaceMode === 'build' ? `${field('Название на карте', 'token-name', token.name || '')}<div class="rcc-two-v2">${selectField('Слой', 'token-layer', token.layer || 'surface', [['surface','Поверхность'],['air','Воздух'],['orbit','Орбита']])}${field('Цвет', 'token-color', token.color || '#7df9ff', 'color')}</div><label class="rcc-check-v2"><input type="checkbox" data-rcc-field="token-locked" ${token.locked ? 'checked' : ''}> Заблокировать перемещение в конструкторе</label>` : ''}
      </div>
      ${state.workspaceMode === 'build' ? `<button class="ghost danger" data-rcc-action="delete-selection">УДАЛИТЬ С КАРТЫ</button>` : ''}`;
  }

  function renderMarkerInspector(map, marker) {
    const regionOptions = sorted(Object.values(maps()).filter(item => item.id !== map.id)).map(item => `<option value="${escapeHtml(item.id)}" ${item.id === marker.targetRegionId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.kind)}</option>`).join('');
    return `
      <div class="rcc-inspector-head-v2"><span>МЕТКА</span><h3>${escapeHtml(marker.name || 'Метка')}</h3><small>${Number(marker.x).toFixed(0)}, ${Number(marker.y).toFixed(0)} ${escapeHtml(map.scaleLabel || 'ед')}</small></div>
      <div class="rcc-panel-v2">
        ${field('Название', 'marker-name', marker.name || '')}
        <div class="rcc-two-v2">${field('Цвет', 'marker-color', marker.color || '#7df9ff', 'color')}${selectField('Категория', 'marker-category', marker.category || 'point', [['point','Точка'],['transition','Переход'],['danger','Опасность'],['resource','Ресурс'],['mission','Задача']])}</div>
        ${field('Символ', 'marker-icon', marker.icon || '', 'text', '◆')}
        <label class="rcc-check-v2"><input type="checkbox" data-rcc-field="marker-visible" ${marker.visibleToPlayers !== false ? 'checked' : ''}> Видна игрокам</label>
        <label class="rcc-check-v2"><input type="checkbox" data-rcc-field="marker-locked" ${marker.locked ? 'checked' : ''}> Заблокировать положение</label>
        <label class="rcc-field-v2"><span>Переход на карту</span><select class="select" data-rcc-field="marker-target"><option value="">Нет перехода</option>${regionOptions}</select></label>
        ${textareaField('Заметки ДМа', 'marker-notes', marker.notes || '')}
        ${marker.targetRegionId && maps()[marker.targetRegionId] ? `<button class="secondary wide" data-rcc-action="open-marker-target">ОТКРЫТЬ: ${escapeHtml(maps()[marker.targetRegionId].name)}</button>` : ''}
      </div>
      <button class="ghost danger" data-rcc-action="delete-selection">УДАЛИТЬ МЕТКУ</button>`;
  }

  function renderCatalogInspector() {
    const type = state.view === 'fleet' ? 'ships' : state.catalogType;
    const source = type === 'ships' ? ships() : type === 'missiles' ? missiles() : radars();
    let item = source[state.selectedCatalogId];
    if (!item) item = Object.values(source)[0] || null;
    if (item) state.selectedCatalogId = item.id;
    if (!item) return '<div class="rcc-inspector-empty-v2">Выберите или создайте объект.</div>';
    if (type === 'ships') return renderShipCatalogInspector(item);
    if (type === 'missiles') return renderMissileCatalogInspector(item);
    return renderRadarCatalogInspector(item);
  }

  function renderShipCatalogInspector(ship) {
    const missileChecks = sorted(Object.values(missiles())).map(item => {
      const enabled = list(ship.missileIds).includes(item.id);
      const stock = Number(ship.missileStock?.[item.id]);
      return `<div class="rcc-loadout-row-v2"><label><input type="checkbox" data-rcc-loadout="missile" value="${escapeHtml(item.id)}" ${enabled ? 'checked' : ''}><span>${escapeHtml(item.name)}</span></label>${enabled ? `<input type="number" data-rcc-stock="${escapeHtml(item.id)}" value="${Number.isFinite(stock) ? stock : -1}" title="−1 = без учёта боезапаса">` : ''}</div>`;
    }).join('');
    const radarChecks = sorted(Object.values(radars())).map(item => `<label class="rcc-loadout-check-v2"><input type="checkbox" data-rcc-loadout="radar" value="${escapeHtml(item.id)}" ${list(ship.radarIds).includes(item.id) ? 'checked' : ''}><span>${escapeHtml(item.name)} · ${escapeHtml(item.kind)} · ${Number(item.range)}</span></label>`).join('');
    return `
      <div class="rcc-inspector-head-v2"><span>КОРАБЛЬ</span><h3>${escapeHtml(ship.name)}</h3><small>${escapeHtml(ship.model || ship.id)}</small></div>
      <div class="rcc-panel-v2">
        ${field('Название', 'ship-name', ship.name)}
        <div class="rcc-two-v2">${field('Позывной', 'ship-callsign', ship.callsign || '')}${field('Модель', 'ship-model', ship.model || '')}</div>
        <div class="rcc-two-v2">${selectField('Состояние', 'ship-status', ship.status || 'operational', [['operational','Исправен'],['damaged','Повреждён'],['disabled','Обесточен'],['destroyed','Уничтожен']])}${field('Фракция', 'ship-faction', ship.factionId || '')}</div>
        <div class="rcc-two-v2">${numberField('Корпус', 'ship-hull', ship.hull, 0)}${numberField('Макс. корпус', 'ship-hull-cap', ship.hullCapacity, 1)}</div>
        <div class="rcc-two-v2">${numberField('Топливо', 'ship-fuel', ship.fuel, 0, '0.1')}${numberField('Бак', 'ship-fuel-cap', ship.fuelCapacity, 0, '0.1')}</div>
        <div class="rcc-two-v2">${numberField('Расход / 100 ед.', 'ship-consumption', ship.fuelConsumption, 0.01, '0.01')}${numberField('Мощность двигателя', 'ship-power', ship.enginePower, 1)}</div>
        <div class="rcc-two-v2">${numberField('Масса', 'ship-mass', ship.mass, 1)}${numberField('Груз', 'ship-cargo', ship.cargoMass, 0)}</div>
        ${numberField('Оптический обзор', 'ship-vision', ship.visionRadius || 0, 0)}
      </div>
      <div class="rcc-panel-v2"><div class="rcc-panel-title-v2">Ракеты <small>−1 означает без учёта боезапаса</small></div>${missileChecks || '<small>Сначала создайте ракеты.</small>'}</div>
      <div class="rcc-panel-v2"><div class="rcc-panel-title-v2">РЛС / РЭБ</div>${radarChecks || '<small>Сначала создайте сенсорные системы.</small>'}</div>
      <div class="rcc-panel-v2"><label class="rcc-check-v2"><input type="checkbox" data-rcc-field="catalog-radar-enabled" ${ship.radarEnabled !== false ? 'checked' : ''}> Питание сенсоров включено</label>${textareaField('Заметки', 'ship-notes', ship.notes || '')}</div>
      <div class="rcc-danger-zone-v2"><button class="ghost danger" data-rcc-action="catalog-delete">УДАЛИТЬ КОРАБЛЬ</button></div>`;
  }

  function renderMissileCatalogInspector(item) {
    return `
      <div class="rcc-inspector-head-v2"><span>РАКЕТА</span><h3>${escapeHtml(item.name)}</h3><small>${escapeHtml(item.id)}</small></div>
      <div class="rcc-panel-v2">
        ${field('Название', 'missile-name', item.name)}
        ${selectField('Наведение', 'missile-guidance', item.guidance || 'heat', [['heat','ИК / тепловое'],['radar','РЛС / активное'],['anti','ПРО / противоракета']])}
        <div class="rcc-two-v2">${numberField('Дальность пуска', 'missile-range', item.range, 10)}${numberField('Радиус поиска', 'missile-seek', item.seek, 10)}</div>
        <div class="rcc-two-v2">${numberField('Скорость', 'missile-speed', item.speed, 20)}${numberField('Радиус поражения', 'missile-blast', item.blastRadius || 0, 0)}</div>
        ${field('Урон / эффект', 'missile-damage', item.damage || '')}
        ${field('Название боезапаса', 'missile-ammo-label', item.ammoLabel || '')}
        ${textareaField('Заметки', 'missile-notes', item.notes || '')}
      </div>
      <button class="ghost danger" data-rcc-action="catalog-delete">УДАЛИТЬ РАКЕТУ</button>`;
  }

  function renderRadarCatalogInspector(item) {
    return `
      <div class="rcc-inspector-head-v2"><span>СЕНСОРНАЯ СИСТЕМА</span><h3>${escapeHtml(item.name)}</h3><small>${escapeHtml(item.id)}</small></div>
      <div class="rcc-panel-v2">
        ${field('Название', 'radar-name', item.name)}
        ${selectField('Тип', 'radar-kind', item.kind || 'radar', [['radar','Активная РЛС'],['passive','Пассивный сенсор'],['jammer','РЭБ / подавление']])}
        <div class="rcc-two-v2">${numberField('Номинальная дальность', 'radar-range', item.range, 0)}${numberField('Эффективность, %', 'radar-power', item.power ?? 100, 0)}</div>
        ${textareaField('Заметки', 'radar-notes', item.notes || '')}
      </div>
      <button class="ghost danger" data-rcc-action="catalog-delete">УДАЛИТЬ СИСТЕМУ</button>`;
  }

  function field(label, key, value, type = 'text', placeholder = '') {
    return `<label class="rcc-field-v2"><span>${escapeHtml(label)}</span><input class="input" type="${type}" data-rcc-field="${key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"></label>`;
  }
  function numberField(label, key, value, min = '', step = '1') {
    return `<label class="rcc-field-v2"><span>${escapeHtml(label)}</span><input class="input" type="number" data-rcc-field="${key}" value="${escapeHtml(value)}" min="${escapeHtml(min)}" step="${escapeHtml(step)}"></label>`;
  }
  function textareaField(label, key, value) {
    return `<label class="rcc-field-v2"><span>${escapeHtml(label)}</span><textarea class="area" data-rcc-field="${key}">${escapeHtml(value)}</textarea></label>`;
  }
  function selectField(label, key, value, options) {
    return `<label class="rcc-field-v2"><span>${escapeHtml(label)}</span><select class="select" data-rcc-field="${key}">${options.map(([id, name]) => `<option value="${escapeHtml(id)}" ${id === value ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>`;
  }

  function renderFooter() {
    const root = document.getElementById('rcc-footer-v2');
    if (!root) return;
    const map = currentMap();
    const selection = currentSelection();
    const scale = api()?.getTimeScale?.() ?? 1;
    root.innerHTML = `
      <div class="rcc-time-v2"><button data-rcc-time="0" class="${scale === 0 ? 'active' : ''}">Ⅱ</button><button data-rcc-time="1" class="${scale === 1 ? 'active' : ''}">1×</button><button data-rcc-time="2" class="${scale === 2 ? 'active' : ''}">2×</button></div>
      <div class="rcc-footer-status-v2"><span id="rcc-pointer-status-v2">${state.pointer.over && map ? `${state.pointer.mapX.toFixed(0)}, ${state.pointer.mapY.toFixed(0)} ${escapeHtml(map.scaleLabel || 'ед')}` : 'Курсор вне карты'}</span><b>${selection ? escapeHtml(selection.name || selection.id) : state.placement ? `Размещение: ${escapeHtml(state.placement.label)}` : toolHint()}</b></div>
      <div class="rcc-history-v2"><button data-rcc-action="undo" ${state.undo.length ? '' : 'disabled'} title="Ctrl+Z">↶</button><button data-rcc-action="redo" ${state.redo.length ? '' : 'disabled'} title="Ctrl+Y">↷</button><span>${state.eventLog[0] ? `${new Date(state.eventLog[0].at).toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'})} · ${escapeHtml(state.eventLog[0].label)}` : 'Журнал готов'}</span></div>`;
  }

  function updateFooterPointer() {
    const node = document.getElementById('rcc-pointer-status-v2');
    const map = currentMap();
    if (!node) return;
    node.textContent = state.pointer.over && map
      ? `${state.pointer.mapX.toFixed(0)}, ${state.pointer.mapY.toFixed(0)} ${map.scaleLabel || 'ед'}`
      : 'Курсор вне карты';
  }

  function toolHint() {
    if (state.tool === 'move') return 'Кликните по точке назначения';
    if (state.tool === 'missile') return 'Кликните по цели или точке поиска';
    if (state.tool === 'marker') return 'Кликните по месту новой метки';
    if (state.tool === 'measure') return 'Зажмите и протяните линию';
    return state.workspaceMode === 'build' ? 'Выберите объект или откройте библиотеку' : 'Выберите объект для команд';
  }

  function bindModal(modal) {
    modal.addEventListener('click', event => {
      const target = event.target.closest('button,[data-rcc-field],input,select,textarea');
      if (!target) return;
      if (target.dataset.rccView) return setView(target.dataset.rccView);
      if (target.dataset.rccMode) return setWorkspaceMode(target.dataset.rccMode);
      if (target.dataset.rccMap) return setMap(target.dataset.rccMap);
      if (target.dataset.rccSidebar) { state.sidebarTab = target.dataset.rccSidebar; state.search = ''; renderSidebar(); return; }
      if (target.dataset.rccCatalog) { state.catalogType = target.dataset.rccCatalog; state.selectedCatalogId = ''; state.search = ''; renderAll({ scene: false }); return; }
      if (target.dataset.rccCatalogId) { state.selectedCatalogId = target.dataset.rccCatalogId; renderInspector(); updateCatalogSelection(); return; }
      if (target.dataset.rccCreateMap) return createMap(target.dataset.rccCreateMap, state.planetId);
      if (target.dataset.rccTool) return setTool(target.dataset.rccTool);
      if (target.dataset.rccLayer) return toggleLayer(target.dataset.rccLayer);
      if (target.dataset.rccFilter) { state.layerFilter = target.dataset.rccFilter; renderSceneEntities(); renderInspector(); queueDisplayMirror(); return; }
      if (target.dataset.rccTime != null) return setTimeScale(Number(target.dataset.rccTime));
      if (target.dataset.rccPlaceKind) return armPlacement(target.dataset.rccPlaceKind, target.dataset.rccPlaceId || '');
      if (target.dataset.rccAction) return handleAction(target.dataset.rccAction, target);
      if (target.dataset.rccToken) { event.stopPropagation(); return selectEntity('token', target.dataset.rccToken); }
      if (target.dataset.rccMarker) { event.stopPropagation(); return selectEntity('marker', target.dataset.rccMarker); }
    });

    modal.addEventListener('dblclick', event => {
      const markerNode = event.target.closest('[data-rcc-marker]');
      if (!markerNode) return;
      const marker = list(currentMap()?.markers).find(item => item.id === markerNode.dataset.rccMarker);
      if (marker?.targetRegionId && maps()[marker.targetRegionId]) setMap(marker.targetRegionId);
    });

    modal.addEventListener('input', handleInput);
    modal.addEventListener('change', handleChange);
    modal.addEventListener('pointerdown', handlePointerDown);
    modal.addEventListener('pointermove', handlePointerMove);
    modal.addEventListener('pointerup', handlePointerUp);
    modal.addEventListener('pointercancel', cancelPointer);
    modal.addEventListener('wheel', handleWheel, { passive: false });
    modal.addEventListener('contextmenu', event => {
      if (event.target.closest('#rcc-stage-v2')) event.preventDefault();
    });
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
  }

  function setWorkspaceMode(mode) {
    state.workspaceMode = mode === 'build' ? 'build' : 'operate';
    if (state.workspaceMode === 'operate' && ['marker', 'place'].includes(state.tool)) state.tool = 'select';
    api()?.setMode?.(state.workspaceMode === 'build' ? 'edit' : 'play');
    renderHeader();
    renderWorkspace(true);
    renderInspector();
    queueDisplayMirror();
  }

  function setTool(tool) {
    if (tool === 'move' && state.selectedKind !== 'token') return notify('Сначала выберите объект', 'err');
    if (tool === 'missile') {
      const token = state.selectedKind === 'token' ? currentSelection() : null;
      const ship = token ? api()?.liveShip?.(token) : null;
      const installed = ship && !ship.__squadron ? list(ship.missileIds) : [];
      if (!installed.length) return notify('На выбранном корабле нет ракет', 'err');
      if (!state.selectedMissileId) state.selectedMissileId = installed[0];
    }
    if (tool === 'marker' && state.workspaceMode !== 'build') return;
    state.tool = tool;
    state.placement = null;
    renderHeader();
    renderWorkspace(true);
    renderInspector();
    renderFooter();
  }

  function toggleLayer(key) {
    state.layers[key] = !state.layers[key];
    if (key === 'fog') {
      api()?.setFogPreview?.(state.layers.fog);
      api()?.setMode?.(state.layers.fog ? 'play' : state.workspaceMode === 'build' ? 'edit' : 'play');
    }
    renderWorkspace(true);
    renderInspector();
    queueDisplayMirror();
  }

  function setTimeScale(scale) {
    api()?.setTimeScale?.(scale);
    renderFooter();
    renderHeader();
    queueDisplayMirror();
  }

  function armPlacement(kind, id) {
    const labels = {
      ship: ships()[id]?.name || 'Корабль',
      player: App?.state?.users?.[id]?.displayName || PLAYER_TEMPLATES?.[id]?.displayName || 'Игрок',
      npc: NPCS?.[id]?.name || 'NPC',
      unit: 'Нейтральный отряд',
      city: 'Поселение',
      marker: 'Метка'
    };
    state.workspaceMode = 'build';
    api()?.setMode?.('edit');
    state.placement = { kind, id, label: labels[kind] || kind };
    state.tool = 'place';
    renderAll({ scene: true });
  }

  function selectEntity(kind, id) {
    state.selectedKind = kind;
    state.selectedId = id;
    state.tool = 'select';
    state.placement = null;
    api()?.setSelectedToken?.(kind === 'token' ? id : '');
    updateSelectionClasses();
    renderInspector();
    renderFooter();
    queueDisplayMirror();
  }

  function updateSelectionClasses() {
    document.querySelectorAll('[data-rcc-token]').forEach(node => node.classList.toggle('selected', state.selectedKind === 'token' && node.dataset.rccToken === state.selectedId));
    document.querySelectorAll('[data-rcc-marker]').forEach(node => node.classList.toggle('selected', state.selectedKind === 'marker' && node.dataset.rccMarker === state.selectedId));
  }

  function updateCatalogSelection() {
    document.querySelectorAll('[data-rcc-catalog-id]').forEach(node => node.classList.toggle('active', node.dataset.rccCatalogId === state.selectedCatalogId));
  }

  function handleAction(action, target) {
    if (action === 'close') return close();
    if (action === 'display') return showOnDisplay();
    if (action === 'zoom-in') return zoomAt(1.2);
    if (action === 'zoom-out') return zoomAt(1 / 1.2);
    if (action === 'zoom-reset') return resetCamera();
    if (action === 'focus') return focusSelection();
    if (action === 'undo') return undo();
    if (action === 'redo') return redo();
    if (action === 'open-library') { state.sidebarTab = 'objects'; renderSidebar(); return; }
    if (action === 'duplicate-map') return duplicateCurrentMap();
    if (action === 'delete-map') return deleteCurrentMap();
    if (action === 'delete-selection') return deleteSelection();
    if (action === 'stop') return stopSelected();
    if (action === 'fuel-minus') return adjustFuel(-10);
    if (action === 'fuel-plus') return adjustFuel(10);
    if (action === 'fuel-full') return refuelSelected();
    if (action === 'open-ship-catalog') return openShipCatalog(target.dataset.shipId);
    if (action === 'catalog-add') return createCatalogItem();
    if (action === 'catalog-delete') return deleteCatalogItem();
    if (action === 'assign-player') return assignPlayerPrompt();
    if (action === 'open-marker-target') return openMarkerTarget();
  }

  async function showOnDisplay() {
    const map = currentMap();
    if (!map) return;
    try {
      await window.electronAPI?.openPlayerDisplay?.();
      await window.electronAPI?.updatePlayerDisplayView?.(displayPayload());
      queuePersist('', 80);
      notify('Карта выведена на второй экран', 'ok');
    } catch (error) {
      notify(`Не удалось открыть второй экран: ${error?.message || error}`, 'err');
    }
  }

  function displayPayload() {
    const viewport = document.getElementById('rcc-map-viewport-v2');
    const fw = Math.max(1, viewport?.clientWidth || 1);
    const fh = Math.max(1, viewport?.clientHeight || 1);
    const runtime = api()?.getRuntime?.() || {};
    return {
      mode: 'region',
      activeRegionMapId: state.mapId,
      selectedRegionTokenId: state.selectedKind === 'token' ? state.selectedId : '',
      regionCamera: { zoom: state.camera.zoom, panFracX: state.camera.panX / fw, panFracY: state.camera.panY / fh },
      regionDisplay: {
        layers: { ...state.layers },
        layerFilter: state.layerFilter,
        workspaceMode: state.workspaceMode,
        timeScale: Number(api()?.getTimeScale?.() ?? 1)
      },
      regionRuntime: {
        missiles: list(runtime.missiles).map(item => ({
          id: text(item.id), type: text(item.type), guidance: text(item.guidance),
          x: Number(item.x || 0), y: Number(item.y || 0), sx: Number(item.sx || 0), sy: Number(item.sy || 0),
          phase: text(item.phase), targetTokenId: text(item.targetTokenId), targetMissileId: text(item.targetMissileId),
          dead: Boolean(item.dead), boomAt: Number(item.boomAt || 0)
        }))
      },
      updatedAt: new Date().toISOString()
    };
  }

  let displayTimer = 0;
  function queueDisplayMirror() {
    clearTimeout(displayTimer);
    displayTimer = setTimeout(() => {
      window.electronAPI?.updatePlayerDisplayView?.(displayPayload()).catch?.(() => {});
    }, 70);
  }

  function deleteSelection() {
    const map = currentMap();
    const selected = currentSelection();
    if (!map || !selected) return;
    if (!window.confirm(`Удалить «${selected.name || selected.id}» с карты?`)) return;
    captureWorld('Удаление объекта с карты');
    if (state.selectedKind === 'token') map.tokens = list(map.tokens).filter(item => item.id !== selected.id);
    else map.markers = list(map.markers).filter(item => item.id !== selected.id);
    state.selectedKind = '';
    state.selectedId = '';
    api()?.setSelectedToken?.('');
    renderSceneEntities();
    renderInspector();
    queuePersist('Объект удалён', 100);
  }

  function stopSelected() {
    const map = currentMap();
    if (!map || state.selectedKind !== 'token') return;
    api()?.setSelectedToken?.(state.selectedId);
    api()?.stopMove?.(map);
    queuePersist('Движение остановлено', 100);
    renderInspector();
  }

  function selectedConcreteShip() {
    const token = state.selectedKind === 'token' ? currentSelection() : null;
    const ship = token ? api()?.liveShip?.(token) : null;
    return ship && !ship.__squadron ? ship : null;
  }

  function adjustFuel(delta) {
    const ship = selectedConcreteShip();
    if (!ship) return;
    captureWorld('Изменение топлива');
    ship.fuel = clampN(Number(ship.fuel || 0) + delta, 0, Number(ship.fuelCapacity || 0));
    renderInspector();
    queuePersist('Топливо изменено', 120);
  }

  function refuelSelected() {
    const ship = selectedConcreteShip();
    if (!ship) return;
    captureWorld('Заправка корабля');
    ship.fuel = Number(ship.fuelCapacity || 0);
    renderInspector();
    queuePersist('Корабль заправлен', 120);
  }

  function openShipCatalog(shipId) {
    if (!shipId || !ships()[shipId]) return;
    state.view = 'fleet';
    state.selectedCatalogId = shipId;
    renderAll({ scene: false });
  }

  function createCatalogItem() {
    const type = state.view === 'fleet' ? 'ships' : state.catalogType;
    captureWorld('Создание элемента каталога');
    const id = uid(type === 'ships' ? 'ship' : type === 'missiles' ? 'missile' : 'radar');
    if (type === 'ships') ships()[id] = api()?.normalizeShip?.({ id, name: 'Новый корабль', fuel: 100, fuelCapacity: 100, hull: 100, hullCapacity: 100, mass: 100, enginePower: 100, fuelConsumption: 1, missileIds: [], radarIds: [] });
    else if (type === 'missiles') missiles()[id] = api()?.normalizeMissile?.({ id, name: 'Новая ракета', guidance: 'heat', range: 350, seek: 110, speed: 300 });
    else radars()[id] = api()?.normalizeRadar?.({ id, name: 'Новая РЛС', kind: 'radar', range: 200, power: 100 });
    state.selectedCatalogId = id;
    renderAll({ scene: false });
    queuePersist('Элемент каталога создан', 100);
  }

  function deleteCatalogItem() {
    const type = state.view === 'fleet' ? 'ships' : state.catalogType;
    const source = type === 'ships' ? ships() : type === 'missiles' ? missiles() : radars();
    const item = source[state.selectedCatalogId];
    if (!item || !window.confirm(`Удалить «${item.name || item.id}»?`)) return;
    captureWorld('Удаление элемента каталога');
    delete source[item.id];
    if (type === 'ships') Object.values(maps()).forEach(map => { map.tokens = list(map.tokens).filter(token => token.shipId !== item.id && !list(token.shipIds).includes(item.id)); });
    if (type === 'missiles') Object.values(ships()).forEach(ship => { ship.missileIds = list(ship.missileIds).filter(id => id !== item.id); if (ship.missileStock) delete ship.missileStock[item.id]; });
    if (type === 'radars') Object.values(ships()).forEach(ship => { ship.radarIds = list(ship.radarIds).filter(id => id !== item.id); });
    state.selectedCatalogId = Object.keys(source)[0] || '';
    renderAll({ scene: false });
    queuePersist('Элемент каталога удалён', 100);
  }

  function openMarkerTarget() {
    const marker = state.selectedKind === 'marker' ? currentSelection() : null;
    if (!marker?.targetRegionId || !maps()[marker.targetRegionId]) return;
    setMap(marker.targetRegionId);
  }

  function assignPlayerPrompt() {
    const map = currentMap();
    if (!map) return;
    const players = sorted(Object.values(App?.state?.users || {}).filter(user => text(user.role).toLowerCase() !== 'gm'));
    if (!players.length) return notify('Нет игроков для привязки', 'err');
    const menu = players.map((player, index) => `${index + 1}. ${player.displayName || player.id}`).join('\n');
    const raw = window.prompt(`Введите номер игрока:\n${menu}`, '1');
    const player = players[Number(raw) - 1];
    if (!player) return;
    captureWorld('Привязка игрока к региону');
    player.currentRegionId = map.id;
    player.currentPlanetId = map.planetId;
    if (PLAYER_TEMPLATES?.[player.id]) {
      PLAYER_TEMPLATES[player.id].currentRegionId = map.id;
      PLAYER_TEMPLATES[player.id].currentPlanetId = map.planetId;
    }
    queuePersist(`${player.displayName || player.id} перемещён в регион`, 100);
  }

  function handleInput(event) {
    const node = event.target;
    if (node.id === 'rcc-sidebar-search-v2') {
      state.search = node.value;
      const caret = node.selectionStart ?? state.search.length;
      clearTimeout(node.__rccTimer);
      node.__rccTimer = setTimeout(() => {
        renderSidebar();
        const next = document.getElementById('rcc-sidebar-search-v2');
        next?.focus();
        next?.setSelectionRange?.(caret, caret);
      }, 100);
      return;
    }
    if (!node.dataset.rccField && !node.dataset.rccStock) return;
    applyField(node, false);
  }

  function handleChange(event) {
    const node = event.target;
    if (node.id === 'rcc-planet-select-v2') {
      state.planetId = node.value;
      const map = Object.values(maps()).find(item => item.planetId === state.planetId);
      if (map) setMap(map.id); else renderSidebar();
      return;
    }
    if (node.dataset.rccLayerCheck) return toggleLayer(node.dataset.rccLayerCheck);
    if (node.dataset.rccLoadout) return applyLoadout(node);
    if (node.dataset.rccStock) return applyStock(node);
    if (node.dataset.rccField) applyField(node, true);
  }

  let fieldCaptureKey = '';
  function applyField(node, committed) {
    const key = node.dataset.rccField;
    if (!key) return;
    const value = node.type === 'checkbox' ? node.checked : node.type === 'number' ? Number(node.value) : node.value;
    const map = currentMap();
    const selection = currentSelection();
    const catalogType = state.view === 'fleet' ? 'ships' : state.catalogType;
    const catalog = catalogType === 'ships' ? ships() : catalogType === 'missiles' ? missiles() : radars();
    const catalogItem = catalog[state.selectedCatalogId];
    const captureKey = `${state.view}:${state.mapId}:${state.selectedKind}:${state.selectedId}:${state.selectedCatalogId}:${key}`;
    if (fieldCaptureKey !== captureKey) { captureWorld(`Изменение: ${key}`); fieldCaptureKey = captureKey; }
    if (committed) fieldCaptureKey = '';

    if (key.startsWith('map-') && map) applyMapField(map, key, value);
    else if (key.startsWith('token-') && selection && state.selectedKind === 'token') applyTokenField(selection, key, value);
    else if (key.startsWith('marker-') && selection && state.selectedKind === 'marker') applyMarkerField(selection, key, value);
    else if (key === 'ship-radar-enabled') {
      const ship = selectedConcreteShip(); if (ship) ship.radarEnabled = Boolean(value);
    }
    else if (key === 'selected-missile') state.selectedMissileId = text(value);
    else if (catalogItem) applyCatalogField(catalogType, catalogItem, key, value);

    if (committed) {
      renderSidebar();
      renderWorkspace(state.view === 'map');
      renderInspector();
    } else if (state.view === 'map') {
      patchLiveField(key, value);
    }
    queuePersist('Параметры обновлены', committed ? 180 : 650);
  }

  function applyMapField(map, key, value) {
    if (key === 'map-name') map.name = text(value).trim() || map.name;
    if (key === 'map-kind') map.kind = value;
    if (key === 'map-scale') map.scaleLabel = text(value).trim() || 'ед';
    if (key === 'map-width') map.width = Math.max(300, Number(value || 300));
    if (key === 'map-height') map.height = Math.max(200, Number(value || 200));
    if (key === 'map-grid-size') map.gridSize = Math.max(1, Number(value || 1));
    if (key === 'map-default-layer') map.defaultLayer = value;
    if (key === 'map-parent') map.parentRegionId = value && !isMapDescendant(value, map.id) ? text(value) : '';
    if (key === 'map-snap') map.snapToGrid = Boolean(value);
    if (key === 'map-image') map.image = text(value).trim();
    if (key === 'map-summary') map.summary = text(value);
    if (key === 'map-fog-radius') { map.fog ||= {}; map.fog.radius = Math.max(0, Number(value || 0)); }
    if (key === 'map-fog-enabled') { map.fog ||= {}; map.fog.enabled = Boolean(value); }
  }

  function applyTokenField(token, key, value) {
    if (key === 'token-name') token.name = text(value).trim() || token.name;
    if (key === 'token-layer') token.layer = value;
    if (key === 'token-color') token.color = value;
    if (key === 'token-status') token.status = value;
    if (key === 'token-faction') token.factionId = text(value);
    if (key === 'token-visible') token.visibleToPlayers = Boolean(value);
    if (key === 'token-locked') token.locked = Boolean(value);
  }

  function applyMarkerField(marker, key, value) {
    if (key === 'marker-name') marker.name = text(value).trim() || marker.name;
    if (key === 'marker-color') marker.color = value;
    if (key === 'marker-category') marker.category = value;
    if (key === 'marker-icon') marker.icon = text(value);
    if (key === 'marker-visible') marker.visibleToPlayers = Boolean(value);
    if (key === 'marker-locked') marker.locked = Boolean(value);
    if (key === 'marker-target') marker.targetRegionId = text(value);
    if (key === 'marker-notes') marker.notes = text(value);
  }

  function applyCatalogField(type, item, key, value) {
    const setNumber = (prop, min = 0) => { item[prop] = Math.max(min, Number(value || min)); };
    if (type === 'ships') {
      if (key === 'ship-name') item.name = text(value).trim() || item.name;
      if (key === 'ship-callsign') item.callsign = text(value);
      if (key === 'ship-model') item.model = text(value);
      if (key === 'ship-status') item.status = value;
      if (key === 'ship-faction') item.factionId = text(value);
      if (key === 'ship-hull') item.hull = clampN(value, 0, item.hullCapacity || 100);
      if (key === 'ship-hull-cap') { setNumber('hullCapacity', 1); item.hull = clampN(item.hull, 0, item.hullCapacity); }
      if (key === 'ship-fuel') item.fuel = clampN(value, 0, item.fuelCapacity || 0);
      if (key === 'ship-fuel-cap') { setNumber('fuelCapacity', 0); item.fuel = clampN(item.fuel, 0, item.fuelCapacity); }
      if (key === 'ship-consumption') setNumber('fuelConsumption', 0.01);
      if (key === 'ship-power') setNumber('enginePower', 1);
      if (key === 'ship-mass') setNumber('mass', 1);
      if (key === 'ship-cargo') setNumber('cargoMass', 0);
      if (key === 'ship-vision') setNumber('visionRadius', 0);
      if (key === 'catalog-radar-enabled') item.radarEnabled = Boolean(value);
      if (key === 'ship-notes') item.notes = text(value);
    } else if (type === 'missiles') {
      if (key === 'missile-name') item.name = text(value).trim() || item.name;
      if (key === 'missile-guidance') item.guidance = value;
      if (key === 'missile-range') setNumber('range', 10);
      if (key === 'missile-seek') setNumber('seek', 10);
      if (key === 'missile-speed') setNumber('speed', 20);
      if (key === 'missile-blast') setNumber('blastRadius', 0);
      if (key === 'missile-damage') item.damage = text(value);
      if (key === 'missile-ammo-label') item.ammoLabel = text(value);
      if (key === 'missile-notes') item.notes = text(value);
    } else {
      if (key === 'radar-name') item.name = text(value).trim() || item.name;
      if (key === 'radar-kind') item.kind = value;
      if (key === 'radar-range') setNumber('range', 0);
      if (key === 'radar-power') item.power = clampN(value, 0, 100);
      if (key === 'radar-notes') item.notes = text(value);
    }
  }

  function patchLiveField(key, value) {
    const selected = currentSelection();
    if (key === 'token-name' || key === 'token-color' || key === 'token-layer' || key === 'token-status' || key === 'token-faction' || key === 'token-locked') renderSceneEntities();
    if (key.startsWith('marker-')) renderSceneEntities();
    if (key.startsWith('map-')) renderHeader();
    if (selected) updateSelectionClasses();
  }

  function applyLoadout(node) {
    const ship = ships()[state.selectedCatalogId];
    if (!ship) return;
    captureWorld('Изменение комплектации');
    const id = node.value;
    if (node.dataset.rccLoadout === 'missile') {
      const set = new Set(list(ship.missileIds));
      node.checked ? set.add(id) : set.delete(id);
      ship.missileIds = [...set];
      ship.missileStock ||= {};
      if (node.checked && !Number.isFinite(Number(ship.missileStock[id]))) ship.missileStock[id] = -1;
      if (!node.checked) delete ship.missileStock[id];
    } else {
      const set = new Set(list(ship.radarIds));
      node.checked ? set.add(id) : set.delete(id);
      ship.radarIds = [...set];
    }
    renderInspector();
    queuePersist('Комплектация обновлена', 120);
  }

  function applyStock(node) {
    const ship = ships()[state.selectedCatalogId];
    if (!ship) return;
    captureWorld('Изменение боезапаса');
    ship.missileStock ||= {};
    ship.missileStock[node.dataset.rccStock] = Math.max(-1, Math.floor(Number(node.value || -1)));
    queuePersist('Боезапас обновлён', 180);
  }

  function handlePointerDown(event) {
    const stage = event.target.closest('#rcc-stage-v2');
    if (!stage || !state.open || state.view !== 'map') return;
    const tokenNode = event.target.closest('[data-rcc-token]');
    const markerNode = event.target.closest('[data-rcc-marker]');
    if (tokenNode || markerNode) {
      const kind = tokenNode ? 'token' : 'marker';
      const id = tokenNode?.dataset.rccToken || markerNode?.dataset.rccMarker;
      if (state.tool === 'missile' && kind === 'token') {
        event.preventDefault(); event.stopPropagation();
        launchAtToken(id);
        return;
      }
      selectEntity(kind, id);
      const selected = currentSelection();
      if (state.workspaceMode === 'build' && event.button === 0 && !selected?.locked) {
        captureWorld(`Перемещение ${kind === 'token' ? 'объекта' : 'метки'}`);
        state.drag = { kind, id, pointerId: event.pointerId };
        stage.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      }
      return;
    }

    if (event.button !== 0 && event.button !== 1) return;
    if (state.tool === 'move') { event.preventDefault(); return issueMoveAt(event); }
    if (state.tool === 'missile') { event.preventDefault(); return launchAtPoint(event); }
    if (state.tool === 'marker') { event.preventDefault(); return placeMarkerAt(event); }
    if (state.tool === 'place' && state.placement) { event.preventDefault(); return placeLibraryObject(event); }
    if (state.tool === 'measure') {
      const point = eventToMap(event);
      state.drag = { kind: 'measure', pointerId: event.pointerId, startX: point.x, startY: point.y, x: point.x, y: point.y };
      stage.setPointerCapture?.(event.pointerId);
      updateRoutes();
      return;
    }
    state.pan = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: state.camera.panX, panY: state.camera.panY };
    stage.setPointerCapture?.(event.pointerId);
    stage.classList.add('is-panning');
  }

  function handlePointerMove(event) {
    const viewport = event.target.closest('#rcc-map-viewport-v2') || document.getElementById('rcc-map-viewport-v2');
    if (viewport && state.view === 'map') {
      const point = eventToMap(event);
      state.pointer = { mapX: point.x, mapY: point.y, over: point.inside };
      updateCommandPreview(point, event);
      updateFooterPointer();
    }
    if (state.pan) {
      state.camera.panX = state.pan.panX + event.clientX - state.pan.startX;
      state.camera.panY = state.pan.panY + event.clientY - state.pan.startY;
      updateCameraTransform();
      queueDisplayMirror();
      return;
    }
    if (state.drag?.kind === 'token' || state.drag?.kind === 'marker') {
      const map = currentMap();
      const point = snapPoint(eventToMap(event), map);
      const item = state.drag.kind === 'token' ? list(map.tokens).find(value => value.id === state.drag.id) : list(map.markers).find(value => value.id === state.drag.id);
      if (!item) return;
      item.x = point.x; item.y = point.y;
      if (state.drag.kind === 'token') {
        item.startX = point.x; item.startY = point.y; item.destX = point.x; item.destY = point.y;
        item.moveStartedAt = ''; item.moveEndsAt = '';
      }
      updateEntityPosition(item, state.drag.kind);
      renderInspectorPosition(item);
      return;
    }
    if (state.drag?.kind === 'measure') {
      const point = eventToMap(event);
      state.drag.x = point.x; state.drag.y = point.y;
      updateRoutes();
    }
  }

  function handlePointerUp(event) {
    const stage = document.getElementById('rcc-stage-v2');
    if (state.pan) {
      stage?.releasePointerCapture?.(state.pan.pointerId);
      stage?.classList.remove('is-panning');
      state.pan = null;
      return;
    }
    if (state.drag) {
      stage?.releasePointerCapture?.(state.drag.pointerId);
      const kind = state.drag.kind;
      state.drag = null;
      if (kind === 'token' || kind === 'marker') {
        queuePersist('Положение объекта сохранено', 180);
        renderInspector();
      }
      updateRoutes();
    }
  }

  function cancelPointer() {
    state.pan = null;
    state.drag = null;
    document.getElementById('rcc-stage-v2')?.classList.remove('is-panning');
  }

  function handleWheel(event) {
    if (!event.target.closest('#rcc-map-viewport-v2')) return;
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
  }

  function handleKeyDown(event) {
    if (!state.open) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    if (event.ctrlKey && event.key.toLowerCase() === 'z') { event.preventDefault(); return undo(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'y') { event.preventDefault(); return redo(); }
    if (event.key === ' ') { state.spaceDown = true; event.preventDefault(); return; }
    if (event.key === 'Escape') { state.tool = 'select'; state.placement = null; state.drag = null; renderAll({ scene: true }); return; }
    if (event.key === 'Delete' && state.workspaceMode === 'build') return deleteSelection();
    const key = event.key.toLowerCase();
    if (key === 'v') setTool('select');
    if (key === 'm') setTool('move');
    if (key === 'r') setTool('missile');
    if (key === 'p' && state.workspaceMode === 'build') setTool('marker');
    if (key === 'd') setTool('measure');
    if (key === 'f') focusSelection();
  }

  function handleKeyUp(event) { if (event.key === ' ') state.spaceDown = false; }

  function eventToMap(event) {
    const stage = document.getElementById('rcc-stage-v2');
    const map = currentMap();
    if (!stage || !map) return { x: 0, y: 0, inside: false };
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) * map.width;
    const y = (event.clientY - rect.top) / Math.max(1, rect.height) * map.height;
    return { x: clampN(x, 0, map.width), y: clampN(y, 0, map.height), inside: event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom };
  }

  function snapPoint(point, map) {
    if (!map?.snapToGrid) return point;
    const step = Math.max(1, Number(map.gridSize || 1));
    return { x: clampN(Math.round(point.x / step) * step, 0, map.width), y: clampN(Math.round(point.y / step) * step, 0, map.height), inside: point.inside };
  }

  function issueMoveAt(event) {
    const map = currentMap();
    const token = state.selectedKind === 'token' ? currentSelection() : null;
    if (!map || !token) return notify('Сначала выберите объект', 'err');
    const ship = api()?.liveShip?.(token);
    if (ship && !ship.__squadron && ['disabled', 'destroyed'].includes(ship.status)) return notify('Корабль не может двигаться в текущем состоянии', 'err');
    captureWorld('Новый маршрут');
    const point = snapPoint(eventToMap(event), map);
    api()?.setSelectedToken?.(token.id);
    api()?.startMove?.(map, token, point.x, point.y);
    state.tool = 'select';
    renderWorkspace(true);
    renderInspector();
    renderFooter();
    logEvent('Маршрут назначен', `${token.name || token.id} → ${point.x.toFixed(0)}, ${point.y.toFixed(0)}`);
  }

  function launchAtToken(tokenId) {
    const target = list(currentMap()?.tokens).find(item => item.id === tokenId);
    if (!target) return;
    const point = api()?.currentPosition?.(target) || target;
    launchMissile(point.x, point.y, target.name || target.id);
  }

  function launchAtPoint(event) {
    const point = eventToMap(event);
    launchMissile(point.x, point.y, 'точка поиска');
  }

  function launchMissile(x, y, targetLabel) {
    const map = currentMap();
    const carrier = state.selectedKind === 'token' ? currentSelection() : null;
    const ship = carrier ? api()?.liveShip?.(carrier) : null;
    if (!map || !carrier || !ship || ship.__squadron) return notify('Выберите одиночный корабль-носитель', 'err');
    const missile = missiles()[state.selectedMissileId];
    if (!missile || !list(ship.missileIds).includes(missile.id)) return notify('Ракета не установлена на корабле', 'err');
    const stock = Number(ship.missileStock?.[missile.id]);
    if (Number.isFinite(stock) && stock === 0) return notify('Боезапас этой ракеты исчерпан', 'err');
    const from = api()?.currentPosition?.(carrier) || carrier;
    api()?.setMissileType?.(`wc:${missile.id}`);
    captureWorld('Пуск ракеты');
    const ok = api()?.launchMissile?.(map, from.x, from.y, x, y, `wc:${missile.id}`);
    if (!ok) { state.undo.pop(); renderFooter(); return; }
    if (Number.isFinite(stock) && stock > 0) ship.missileStock[missile.id] = stock - 1;
    state.tool = 'select';
    renderInspector();
    renderWorkspace(true);
    queuePersist('Боезапас обновлён', 180);
    logEvent(`Пуск: ${missile.name}`, targetLabel);
  }

  function placeMarkerAt(event) {
    const map = currentMap();
    if (!map) return;
    captureWorld('Добавление метки');
    const point = snapPoint(eventToMap(event), map);
    const marker = api()?.normalizeMarker?.({ id: uid('marker'), name: 'Новая метка', x: point.x, y: point.y, category: 'point', color: '#7df9ff', visibleToPlayers: true }, map.width, map.height) || { id: uid('marker'), name: 'Новая метка', x: point.x, y: point.y };
    map.markers.push(marker);
    state.selectedKind = 'marker'; state.selectedId = marker.id; state.tool = 'select';
    renderSceneEntities(); renderInspector(); renderFooter();
    queuePersist('Метка добавлена', 120);
  }

  function placeLibraryObject(event) {
    const map = currentMap();
    const placement = state.placement;
    if (!map || !placement) return;
    captureWorld('Размещение объекта');
    const point = snapPoint(eventToMap(event), map);
    if (placement.kind === 'marker') {
      const marker = api()?.normalizeMarker?.({ id: uid('marker'), name: 'Переход', x: point.x, y: point.y, category: 'transition', color: '#7df9ff', visibleToPlayers: true }, map.width, map.height);
      map.markers.push(marker);
      state.selectedKind = 'marker'; state.selectedId = marker.id;
    } else {
      const base = { id: uid('token'), x: point.x, y: point.y, startX: point.x, startY: point.y, destX: point.x, destY: point.y, layer: map.defaultLayer || 'surface', color: '#7df9ff', visibleToPlayers: placement.kind === 'player' };
      if (placement.kind === 'ship') Object.assign(base, { type: 'ship', shipId: placement.id, name: ships()[placement.id]?.name || 'Корабль', image: ships()[placement.id]?.image || '' });
      else if (placement.kind === 'player') Object.assign(base, { type: 'player', playerId: placement.id, name: App?.state?.users?.[placement.id]?.displayName || PLAYER_TEMPLATES?.[placement.id]?.displayName || 'Игрок' });
      else if (placement.kind === 'npc') Object.assign(base, { type: 'unit', npcId: placement.id, name: NPCS?.[placement.id]?.name || 'NPC', image: NPCS?.[placement.id]?.image || '' });
      else if (placement.kind === 'city') Object.assign(base, { type: 'city', name: 'Поселение', color: '#ffd678' });
      else Object.assign(base, { type: 'unit', name: 'Нейтральный отряд' });
      const token = api()?.normalizeToken?.(base, map.width, map.height) || base;
      map.tokens.push(token);
      state.selectedKind = 'token'; state.selectedId = token.id;
      api()?.setSelectedToken?.(token.id);
    }
    state.placement = null; state.tool = 'select';
    renderSceneEntities(); renderInspector(); renderSidebar(); renderFooter();
    queuePersist('Объект размещён', 120);
  }

  function layoutStage() {
    const viewport = document.getElementById('rcc-map-viewport-v2');
    const stage = document.getElementById('rcc-stage-v2');
    const map = currentMap();
    if (!viewport || !stage || !map) return;
    const pad = 38;
    const availableW = Math.max(240, viewport.clientWidth - pad * 2);
    const availableH = Math.max(180, viewport.clientHeight - pad * 2);
    const ratio = map.width / Math.max(1, map.height);
    let w = availableW, h = w / ratio;
    if (h > availableH) { h = availableH; w = h * ratio; }
    state.camera.baseW = w; state.camera.baseH = h;
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.style.left = `${(viewport.clientWidth - w) / 2}px`;
    stage.style.top = `${(viewport.clientHeight - h) / 2}px`;
    stage.style.backgroundColor = '#07101a';
    stage.style.backgroundImage = map.image ? `linear-gradient(rgba(2,7,12,.08),rgba(2,7,12,.2)),url("${String(map.image).replaceAll('"', '%22')}")` : 'radial-gradient(circle at 50% 42%,rgba(28,64,91,.7),rgba(4,9,15,.95) 70%)';
    updateGrid();
  }

  function updateGrid() {
    const grid = document.getElementById('rcc-grid-v2');
    const map = currentMap();
    if (!grid || !map) return;
    grid.style.display = state.layers.grid ? '' : 'none';
    const x = clampN(Number(map.gridSize || 50) / Number(map.width || 1000) * 100, 0.25, 50);
    const y = clampN(Number(map.gridSize || 50) / Number(map.height || 700) * 100, 0.25, 50);
    grid.style.backgroundSize = `${x}% ${y}%`;
  }

  function updateCameraTransform() {
    const stage = document.getElementById('rcc-stage-v2');
    if (!stage) return;
    state.camera.zoom = clampN(state.camera.zoom, 0.35, 5);
    stage.style.transform = `translate3d(${state.camera.panX}px,${state.camera.panY}px,0) scale(${state.camera.zoom})`;
    queueDisplayMirror();
  }

  function zoomAt(factor, clientX, clientY) {
    const viewport = document.getElementById('rcc-map-viewport-v2');
    const stage = document.getElementById('rcc-stage-v2');
    if (!viewport || !stage) return;
    const before = stage.getBoundingClientRect();
    const cx = Number.isFinite(clientX) ? clientX : before.left + before.width / 2;
    const cy = Number.isFinite(clientY) ? clientY : before.top + before.height / 2;
    const localX = (cx - before.left) / Math.max(1, before.width);
    const localY = (cy - before.top) / Math.max(1, before.height);
    const oldZoom = state.camera.zoom;
    state.camera.zoom = clampN(oldZoom * factor, 0.35, 5);
    const scaleRatio = state.camera.zoom / oldZoom;
    state.camera.panX -= (localX - 0.5) * state.camera.baseW * oldZoom * (scaleRatio - 1);
    state.camera.panY -= (localY - 0.5) * state.camera.baseH * oldZoom * (scaleRatio - 1);
    updateCameraTransform();
  }

  function resetCamera() {
    state.camera.zoom = 1; state.camera.panX = 0; state.camera.panY = 0;
    updateCameraTransform();
  }

  function focusSelection() {
    const selected = currentSelection();
    const map = currentMap();
    if (!selected || !map) return resetCamera();
    const pos = state.selectedKind === 'token' ? api()?.currentPosition?.(selected) || selected : selected;
    state.camera.zoom = Math.max(1.4, state.camera.zoom);
    state.camera.panX = (0.5 - pos.x / map.width) * state.camera.baseW * state.camera.zoom;
    state.camera.panY = (0.5 - pos.y / map.height) * state.camera.baseH * state.camera.zoom;
    updateCameraTransform();
  }

  function updateEntityPosition(item, kind) {
    const map = currentMap();
    const selector = kind === 'token' ? `[data-rcc-token="${cssEscape(item.id)}"]` : `[data-rcc-marker="${cssEscape(item.id)}"]`;
    const node = document.querySelector(selector);
    if (!node || !map) return;
    node.style.left = `${item.x / map.width * 100}%`;
    node.style.top = `${item.y / map.height * 100}%`;
  }

  function renderInspectorPosition(item) {
    const small = document.querySelector('.rcc-inspector-head-v2 small');
    const map = currentMap();
    if (small && map) small.textContent = `${Number(item.x).toFixed(0)}, ${Number(item.y).toFixed(0)} ${map.scaleLabel || 'ед'}`;
  }

  function updateSceneFrame(now, dt) {
    const map = currentMap();
    if (!map || state.view !== 'map') return;
    list(map.tokens).forEach(token => {
      const pos = api()?.currentPosition?.(token, now) || token;
      const node = document.querySelector(`[data-rcc-token="${cssEscape(token.id)}"]`);
      if (!node) return;
      node.style.left = `${pos.x / map.width * 100}%`;
      node.style.top = `${pos.y / map.height * 100}%`;
      node.classList.toggle('moving', Boolean(token.moveEndsAt));
    });
    list(map.markers).forEach(marker => updateEntityPosition(marker, 'marker'));
    updateRoutes();
    updateRanges(now);
    updateFog(now);
    try { api()?.updateMissiles?.(map, dt * (api()?.getTimeScale?.() ?? 1)); } catch {}
  }

  function updateRoutes() {
    const svg = document.getElementById('rcc-routes-v2');
    const map = currentMap();
    if (!svg || !map) return;
    const active = new Set();
    const ensureLine = (key, className, x1, y1, x2, y2) => {
      active.add(key);
      let line = svg.querySelector(`[data-rcc-route-node="${cssEscape(key)}"]`);
      if (!line) {
        line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.dataset.rccRouteNode = key;
        svg.insertBefore(line, svg.querySelector('#rcc-preview-line-v2'));
      }
      line.setAttribute('class', className);
      line.setAttribute('x1', Number(x1));
      line.setAttribute('y1', Number(y1));
      line.setAttribute('x2', Number(x2));
      line.setAttribute('y2', Number(y2));
    };
    list(map.tokens).filter(token => token.moveEndsAt).forEach(token => {
      const pos = api()?.currentPosition?.(token) || token;
      ensureLine(`move:${token.id}`, 'rcc-active-route-v2', pos.x, pos.y, token.destX, token.destY);
    });
    if (state.drag?.kind === 'measure') {
      ensureLine('measure', 'rcc-measure-route-v2', state.drag.startX, state.drag.startY, state.drag.x, state.drag.y);
    }
    svg.querySelectorAll('[data-rcc-route-node]').forEach(line => {
      if (!active.has(line.dataset.rccRouteNode)) line.remove();
    });
  }

  function updateCommandPreview(point, event) {
    const svg = document.getElementById('rcc-routes-v2');
    const hint = document.getElementById('rcc-command-hint-v2');
    const map = currentMap();
    if (!svg || !hint || !map) return;
    let from = null;
    let label = '';
    let bad = false;
    if (state.tool === 'move' || state.tool === 'missile') {
      const token = state.selectedKind === 'token' ? currentSelection() : null;
      if (token) from = api()?.currentPosition?.(token) || token;
      if (from) {
        const distance = Math.hypot(point.x - from.x, point.y - from.y);
        if (state.tool === 'move') {
          const ship = api()?.liveShip?.(token);
          const speed = ship ? Number(api()?.shipSpeed?.(ship) || ship.__speed || 40) : 40;
          label = `${distance.toFixed(0)} ${map.scaleLabel || 'ед'} · ${(distance / Math.max(1, speed)).toFixed(0)}с`;
          if (ship) {
            const cost = distance * Math.max(0.01, Number(ship.fuelConsumption || 1)) / 100;
            label += ` · ⛽ ${cost.toFixed(1)}`;
            bad = cost > Number((api()?.liveFuel?.(token, ship) ?? ship.fuel) || 0);
          }
        } else {
          const spec = missiles()[state.selectedMissileId];
          label = spec ? `${spec.name} · ${distance.toFixed(0)}/${Number(spec.range)} ${map.scaleLabel || 'ед'}` : 'Ракета не выбрана';
          bad = !spec || distance > Number(spec.range || 0);
        }
      }
    }
    const old = svg.querySelector('#rcc-preview-line-v2');
    old?.remove();
    if (from) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.id = 'rcc-preview-line-v2';
      line.setAttribute('x1', from.x); line.setAttribute('y1', from.y); line.setAttribute('x2', point.x); line.setAttribute('y2', point.y);
      line.setAttribute('class', bad ? 'rcc-preview-route-v2 bad' : 'rcc-preview-route-v2');
      svg.appendChild(line);
      hint.style.display = '';
      hint.classList.toggle('bad', bad);
      hint.textContent = label;
      const viewport = document.getElementById('rcc-map-viewport-v2')?.getBoundingClientRect();
      if (viewport) { hint.style.left = `${event.clientX - viewport.left + 18}px`; hint.style.top = `${event.clientY - viewport.top + 18}px`; }
    } else {
      hint.style.display = 'none';
    }
  }

  function updateRanges(now) {
    const root = document.getElementById('rcc-ranges-v2');
    const map = currentMap();
    const token = state.selectedKind === 'token' ? currentSelection() : null;
    if (!root || !map || !token) { root?.replaceChildren(); return; }
    const pos = api()?.currentPosition?.(token, now) || token;
    const ship = api()?.liveShip?.(token);
    const specs = [];
    const vision = ship ? Number(ship.visionRadius || map.fog?.radius || 0) : Number(token.visionRadius || map.fog?.radius || 0);
    const radar = api()?.radarInfo?.(token) || { r: 0, active: false };
    const fuel = ship ? Number(api()?.shipRangeFromFuel?.(ship, api()?.liveFuel?.(token, ship, now) ?? ship.fuel) || 0) : 0;
    const weapon = missiles()[state.selectedMissileId]?.range || (ship && !ship.__squadron ? Math.max(0, ...list(ship.missileIds).map(id => Number(missiles()[id]?.range || 0))) : 0);
    if (state.layers.vision && vision > 0) specs.push(['vision', vision, 'ОБЗОР']);
    if (state.layers.radar && radar.active && radar.r > 0) specs.push(['radar', radar.r, 'РЛС']);
    if (state.layers.fuel && fuel > 0) specs.push(['fuel', Math.min(fuel, Math.hypot(map.width, map.height)), 'ТОПЛИВО']);
    if (state.layers.weapons && weapon > 0) specs.push(['weapon', weapon, 'РАКЕТЫ']);
    const active = new Set();
    specs.forEach(([kind, radius, label]) => {
      active.add(kind);
      let node = root.querySelector(`[data-rcc-range="${kind}"]`);
      if (!node) {
        node = document.createElement('div');
        node.dataset.rccRange = kind;
        node.className = `rcc-range-v2 range-${kind}`;
        node.appendChild(document.createElement('span'));
        root.appendChild(node);
      }
      node.style.left = `${pos.x / map.width * 100}%`;
      node.style.top = `${pos.y / map.height * 100}%`;
      node.style.width = `${radius / map.width * 200}%`;
      node.style.height = `${radius / map.height * 200}%`;
      node.firstElementChild.textContent = `${label} ${Number(radius).toFixed(0)}`;
    });
    root.querySelectorAll('[data-rcc-range]').forEach(node => {
      if (!active.has(node.dataset.rccRange)) node.remove();
    });
  }


  function updateFog(now = Date.now()) {
    const canvas = document.getElementById('rts-fog-canvas-v36');
    if (!canvas) return;
    canvas.style.display = state.layers.fog ? '' : 'none';
    if (!state.layers.fog) return;
    if (now - state.lastFogAt < 90) return;
    state.lastFogAt = now;
    api()?.setFogPreview?.(true);
    api()?.setMode?.('play');
    try { api()?.renderFog?.(currentMap()); } catch {}
  }

  function startLoop() {
    cancelAnimationFrame(state.raf);
    state.lastFrameAt = performance.now();
    const tick = now => {
      if (!state.open) return;
      const dt = Math.min(100, now - state.lastFrameAt);
      state.lastFrameAt = now;
      const wallNow = Date.now();
      updateSceneFrame(wallNow, dt);
      if (wallNow - state.lastDisplayMirrorAt >= 100) { state.lastDisplayMirrorAt = wallNow; queueDisplayMirror(); }
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }

  function patchConfigurator() {
    if (!window.Configurator && typeof Configurator === 'undefined') return;
    const tactical = new Set(['regionMaps', 'ships', 'missiles', 'radars']);
    const originalRenderEditor = Configurator.renderEditor.bind(Configurator);
    Configurator.renderEditor = function renderEditorRcc(entity) {
      if (!tactical.has(this.selectedType)) return originalRenderEditor(entity);
      const view = this.selectedType === 'regionMaps' ? 'map' : this.selectedType === 'ships' ? 'fleet' : 'systems';
      const type = this.selectedType === 'missiles' ? 'missiles' : this.selectedType === 'radars' ? 'radars' : '';
      return `<div class="rcc-config-redirect-v2"><span>ЕДИНЫЙ ТАКТИЧЕСКИЙ КОНТУР</span><h2>${escapeHtml(entity?.name || entity?.id || WORLD_SECTIONS[this.selectedType]?.label || '')}</h2><p>Карты регионов, корабли, ракеты и РЛС теперь управляются в одном центре. Это исключает расхождение параметров между картой и World Config.</p><button class="primary" type="button" data-rcc-config-open="${view}" data-rcc-config-type="${type}" data-rcc-config-id="${escapeHtml(entity?.id || '')}">ОТКРЫТЬ REGION COMMAND CENTER</button></div>`;
    };
    const originalCreateNew = Configurator.createNew.bind(Configurator);
    Configurator.createNew = function createNewRcc() {
      if (!tactical.has(this.selectedType)) return originalCreateNew();
      if (this.selectedType === 'regionMaps') return open('', { view: 'map', planetId: UI?.selectedPlanetId || state.planetId });
      state.view = this.selectedType === 'ships' ? 'fleet' : 'systems';
      state.catalogType = this.selectedType === 'radars' ? 'radars' : this.selectedType === 'missiles' ? 'missiles' : 'ships';
      open('', { view: state.view, catalogType: state.catalogType });
      createCatalogItem();
    };
  }

  document.addEventListener('click', event => {
    const launcher = event.target.closest('[data-rcc-launcher]');
    if (launcher && roleIsGm()) {
      event.preventDefault(); event.stopImmediatePropagation();
      open(launcher.dataset.rccLauncher || '', { view: 'map' });
      return;
    }
    const configButton = event.target.closest('[data-rcc-config-open]');
    if (configButton) {
      event.preventDefault(); event.stopImmediatePropagation();
      const view = configButton.dataset.rccConfigOpen;
      const type = configButton.dataset.rccConfigType;
      const id = configButton.dataset.rccConfigId;
      open('', { view, catalogType: type, catalogId: id });
      return;
    }
    const openButton = event.target.closest('[data-open-region-map]');
    if (openButton && roleIsGm()) {
      event.preventDefault(); event.stopImmediatePropagation();
      open(openButton.dataset.openRegionMap);
      return;
    }
    const createButton = event.target.closest('[data-create-region-map]');
    if (createButton && roleIsGm()) {
      event.preventDefault(); event.stopImmediatePropagation();
      open('', { view: 'map', planetId: createButton.dataset.planetId || '' });
      createMap(createButton.dataset.createRegionMap || 'region', createButton.dataset.planetId || '');
    }
  }, true);

  function injectProfileLauncher() {
    if (!roleIsGm()) return;
    const root = document.getElementById('profile-content');
    if (!root || root.querySelector('.rcc-profile-launcher-v2')) return;
    const map = currentMap() || Object.values(maps())[0];
    const card = document.createElement('div');
    card.className = 'card profile-card rcc-profile-launcher-v2';
    card.innerHTML = `<div class="section-title">Region Command Center</div><div class="small-note">Единое управление картами планет, флотом, ракетами, РЛС и туманом войны.</div><button class="primary" type="button" data-rcc-launcher="${escapeHtml(map?.id || '')}" style="margin-top:10px;width:100%">ОТКРЫТЬ ЦЕНТР УПРАВЛЕНИЯ</button>`;
    root.prepend(card);
  }

  function hookProfileLauncher() {
    if (typeof UI === 'undefined' || !UI.renderProfile || UI.renderProfile.__rccV2Hooked) return;
    const original = UI.renderProfile.bind(UI);
    const wrapped = function renderProfileWithRccV2() {
      const result = original();
      queueMicrotask(injectProfileLauncher);
      return result;
    };
    wrapped.__rccV2Hooked = true;
    UI.renderProfile = wrapped;
    injectProfileLauncher();
  }

  function install() {
    if (!api()) return setTimeout(install, 100);
    api().open = open;
    window.RegionCommandCenterV2 = { open, close, state, createMap, undo, redo };
    patchConfigurator();
    hookProfileLauncher();
  }

  install();
})();
