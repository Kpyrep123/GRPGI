(() => {
  const RUNTIME = {
    webClient: document.documentElement?.dataset?.client === 'web' || window.GRPG_WEB_CLIENT === true,
    cloudOnly: document.documentElement?.dataset?.cloudOnly === 'true' || window.GRPG_CLOUD_ONLY === true,
    hideCombat: document.documentElement?.dataset?.hideCombat === 'true' || window.GRPG_HIDE_COMBAT === true
  };
  const WEB_MEMORY = new Map();

  const DEFAULTS = {
    backend: 'pocketbase',
    url: 'https://sync.grpg-sync.ru',
    appUsersCollection: 'app_users',
    appUserEmail: '',
    appUserPassword: '',
    tableName: 'campaign_snapshots',
    playerTableName: 'campaign_players',
    chatTableName: 'campaign_messages',
    combatRuntimeTableName: 'campaign_combat_runtime',
    assetsCollection: 'campaign_assets',
    snapshotPollMs: 30000,
    livePollMs: 5000
  };

  const KEYS = {
    config: 'grpg.mobile.syncConfig.v1',
    cache: 'grpg.mobile.cache.v1',
    session: 'grpg.mobile.session.v1',
    auth: 'grpg.web.pocketbaseAuth.v1',
    remember: 'grpg.web.rememberLogin.v1'
  };
  const WEB_REMEMBER_MAX_MS = 30 * 24 * 60 * 60 * 1000;
  const LEGACY_BACKEND_MARKER = ['supa', 'base'].join('');

  const App = {
    config: null,
    auth: { token: '', expiresAt: 0 },
    rememberLogin: false,
    rememberUntil: 0,
    cache: { snapshot: null, players: [], chat: [], combatRuntime: null, fetchedAt: null },
    session: null,
    data: {
      world: null,
      state: null,
      players: new Map(),
      playerRows: new Map(),
      systems: [],
      planets: new Map(),
      articles: new Map(),
      articleList: [],
      newsList: [],
      tasksList: [],
      npcs: new Map(),
      items: new Map(),
      combatScenes: [],
      combatRuntime: null,
      combatRuntimeByScene: new Map(),
      chatRows: [],
      campaigns: new Map(),
      skills: new Map(),
      factions: new Map(),
      organizations: new Map()
    },
    ui: {
      boot: 'setup',
      screen: 'home',
      archiveTab: 'articles',
      selectedArchiveId: '',
      selectedArchiveType: 'article',
      selectedThreadKey: '',
      selectedCombatSceneId: '',
      selectedCampaignId: 'all',
      focusedSystemId: '',
      archiveQuery: '',
      profileTab: 'main',
      skillZoom: 1,
      combatFullscreen: false,
      combatViewByScene: {},
      lastLivePullAt: null,
      chatDrafts: {},
      lastSnapshotRevision: 0,
      lastChatStamp: null,
      lastCombatStamp: null
    },
    pollers: { snapshot: null, live: null },
    realtime: {
      socket: null,
      joined: false,
      heartbeat: null,
      reconnectTimer: null,
      ref: 1,
      pending: { players: false, chat: false, combat: false, snapshot: false },
      flushTimer: null,
      eventKeys: new Set(),
      suppressClose: false
    },
    busy: false
  };

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function deep(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function jsonStorageRead(storage, key, fallback = null) {
    try {
      const raw = storage?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function jsonStorageWrite(storage, key, value) {
    try {
      storage?.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function jsonStorageRemove(storage, key) {
    try { storage?.removeItem(key); } catch {}
  }

  function sanitizedConfig(config = App.config) {
    const clean = normalizeConfig(config || {});
    clean.appUserPassword = '';
    return clean;
  }

  function purgeLegacyBrowserState() {
    if (!RUNTIME.cloudOnly) return;
    [window.localStorage, window.sessionStorage].forEach(storage => {
      try {
        const removals = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          const raw = key ? String(storage.getItem(key) || '') : '';
          if (String(key || '').toLowerCase().includes(LEGACY_BACKEND_MARKER) || raw.toLowerCase().includes(LEGACY_BACKEND_MARKER)) {
            removals.push(key);
          }
        }
        removals.filter(Boolean).forEach(key => storage.removeItem(key));
      } catch {}
    });
  }

  function readRememberState() {
    if (!RUNTIME.cloudOnly) return { enabled: false, expiresAt: 0 };
    const saved = jsonStorageRead(window.localStorage, KEYS.remember, null);
    const expiresAt = Number(saved?.expiresAt || 0);
    if (!saved?.enabled || expiresAt <= Date.now()) {
      jsonStorageRemove(window.localStorage, KEYS.remember);
      [KEYS.config, KEYS.cache, KEYS.session, KEYS.auth].forEach(key => jsonStorageRemove(window.localStorage, key));
      return { enabled: false, expiresAt: 0 };
    }
    return { enabled: true, expiresAt };
  }

  function syncRememberControls() {
    ['#setup-remember-login', '#login-remember-login'].forEach(selector => {
      const control = document.querySelector(selector);
      if (control) control.checked = Boolean(App.rememberLogin);
    });
  }

  async function setRememberLogin(enabled, { extend = false } = {}) {
    if (!RUNTIME.cloudOnly) return;
    App.rememberLogin = Boolean(enabled);
    if (App.rememberLogin) {
      const currentExpiry = Number(App.rememberUntil || 0);
      App.rememberUntil = extend || currentExpiry <= Date.now()
        ? Date.now() + WEB_REMEMBER_MAX_MS
        : currentExpiry;
      jsonStorageWrite(window.localStorage, KEYS.remember, {
        enabled: true,
        createdAt: new Date().toISOString(),
        expiresAt: App.rememberUntil
      });
      jsonStorageWrite(window.localStorage, KEYS.config, sanitizedConfig());
      if (App.session) jsonStorageWrite(window.localStorage, KEYS.session, App.session);
      if (App.auth?.token) jsonStorageWrite(window.localStorage, KEYS.auth, App.auth);
      const readMarkers = jsonStorageRead(window.sessionStorage, MOBILE_READ_MARKERS_KEY, null);
      if (readMarkers) jsonStorageWrite(window.localStorage, MOBILE_READ_MARKERS_KEY, readMarkers);
      [KEYS.config, KEYS.session, KEYS.auth, MOBILE_READ_MARKERS_KEY].forEach(key => jsonStorageRemove(window.sessionStorage, key));
    } else {
      App.rememberUntil = 0;
      jsonStorageRemove(window.localStorage, KEYS.remember);
      [KEYS.config, KEYS.cache, KEYS.session, KEYS.auth].forEach(key => jsonStorageRemove(window.localStorage, key));
      jsonStorageWrite(window.sessionStorage, KEYS.config, sanitizedConfig());
      if (App.session) jsonStorageWrite(window.sessionStorage, KEYS.session, App.session);
      if (App.auth?.token) jsonStorageWrite(window.sessionStorage, KEYS.auth, App.auth);
      const readMarkers = jsonStorageRead(window.localStorage, MOBILE_READ_MARKERS_KEY, null);
      if (readMarkers) jsonStorageWrite(window.sessionStorage, MOBILE_READ_MARKERS_KEY, readMarkers);
      jsonStorageRemove(window.localStorage, MOBILE_READ_MARKERS_KEY);
    }
    syncRememberControls();
  }

  function notify(text, tone = 'ok') {
    const stack = $('#toast-stack');
    if (!stack) return;
    const node = document.createElement('div');
    node.className = `toast ${tone}`;
    node.textContent = text;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 3800);
  }

  function formatCredits(value) {
    return `${Number(value || 0).toLocaleString('ru-RU')} cr`;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase() || '').join('') || '?';
  }

  function slugText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function stripHtml(value) {
    return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeBackend() {
    return 'pocketbase';
  }

  function normalizeConfig(payload = {}) {
    const requestedUrl = String(payload.url || DEFAULTS.url).trim();
    const requestedProvider = String(payload.backend || payload.provider || '').trim().toLowerCase();
    const legacyConfig = requestedProvider.includes(LEGACY_BACKEND_MARKER) || requestedUrl.toLowerCase().includes(LEGACY_BACKEND_MARKER);
    return {
      backend: 'pocketbase',
      provider: 'pocketbase',
      url: legacyConfig ? DEFAULTS.url : requestedUrl,
      appUserEmail: legacyConfig ? '' : String(payload.appUserEmail || payload.pocketbaseEmail || payload.pbEmail || '').trim(),
      appUserPassword: legacyConfig ? '' : String(payload.appUserPassword || payload.pocketbasePassword || payload.pbPassword || '').trim(),
      appUsersCollection: String(payload.appUsersCollection || payload.pocketbaseUsersCollection || DEFAULTS.appUsersCollection).trim() || DEFAULTS.appUsersCollection,
      campaignId: String(payload.campaignId || DEFAULTS.campaignId || 'main').trim() || 'main',
      deviceLabel: String(payload.deviceLabel || '').trim(),
      tableName: String(payload.tableName || DEFAULTS.tableName).trim() || DEFAULTS.tableName,
      playerTableName: String(payload.playerTableName || DEFAULTS.playerTableName).trim() || DEFAULTS.playerTableName,
      chatTableName: String(payload.chatTableName || DEFAULTS.chatTableName).trim() || DEFAULTS.chatTableName,
      combatRuntimeTableName: String(payload.combatRuntimeTableName || DEFAULTS.combatRuntimeTableName).trim() || DEFAULTS.combatRuntimeTableName,
      assetsCollection: String(payload.assetsCollection || payload.pocketbaseAssetsCollection || DEFAULTS.assetsCollection).trim() || DEFAULTS.assetsCollection,
      snapshotPollMs: Math.max(10000, Number(payload.snapshotPollMs || DEFAULTS.snapshotPollMs)),
      livePollMs: Math.max(2500, Number(payload.livePollMs || DEFAULTS.livePollMs))
    };
  }

  function isPocketBaseConfig() {
    return true;
  }

  function hasConfig(config = App.config) {
    return Boolean(config?.url && config?.campaignId && (config?.appUserPassword || App.auth?.token));
  }


  function encodeStoragePath(path) {
    return String(path || '').split('/').map(part => encodeURIComponent(part)).join('/');
  }

  function publicStorageUrl(storagePath) {
    const cleanPath = String(storagePath || '').trim();
    return /^https?:/i.test(cleanPath) ? cleanPath : '';
  }

  function resolveMediaUrl(source, storagePath = '') {
    const raw = String(source || '').trim();
    if (storagePath) return publicStorageUrl(storagePath);
    if (!raw) return '';
    if (/^(data:|blob:|https?:|content:|capacitor:|file:)/i.test(raw)) {
      return encodeURI(raw).replace(/%5C/g, '/');
    }
    if (/^[a-z]:\\/i.test(raw) || raw.includes('\\') || raw.startsWith('/world-data/') || raw.includes('/world-data/')) {
      return '';
    }
    if (raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('/')) {
      return encodeURI(raw).replace(/%5C/g, '/');
    }
    if (/^[\w./-]+\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(raw)) {
      return encodeURI(raw).replace(/%5C/g, '/');
    }
    return raw;
  }

  function renderAvatar(player, sizeClass = '') {
    const image = resolveMediaUrl(player?.image || player?.avatarImage || player?.photo, player?.imageStoragePath || player?.avatarImageStoragePath || player?.photoStoragePath || '');
    if (image) return `<div class="avatar-circle ${sizeClass}"><img src="${esc(image)}" alt="${esc(player?.displayName || player?.id || 'avatar')}" /></div>`;
    return `<div class="avatar-circle ${sizeClass}">${esc(player?.avatarGlyph || initials(player?.displayName || player?.id))}</div>`;
  }

  function mediaFromEntity(entity) {
    if (!entity) return '';
    const pairs = [
      ['image', 'imageStoragePath'],
      ['coverImage', 'coverImageStoragePath'],
      ['avatarImage', 'avatarImageStoragePath'],
      ['photo', 'photoStoragePath'],
      ['portrait', 'portraitStoragePath'],
      ['thumbnail', 'thumbnailStoragePath'],
      ['art', 'artStoragePath'],
      ['backgroundImage', 'backgroundImageStoragePath']
    ];
    for (const [srcField, pathField] of pairs) {
      const url = resolveMediaUrl(entity?.[srcField] || '', entity?.[pathField] || '');
      if (url) return url;
    }
    if (entity._type === 'article') {
      const planetId = Array.isArray(entity.relatedPlanetIds) ? entity.relatedPlanetIds[0] : '';
      if (planetId && App.data.planets.has(planetId)) return mediaFromEntity(App.data.planets.get(planetId));
    }
    if (entity._type === 'system') {
      const firstPlanet = Array.isArray(entity.planetIds) ? entity.planetIds.map(id => App.data.planets.get(id)).find(Boolean) : null;
      if (firstPlanet) return mediaFromEntity(firstPlanet);
    }
    return '';
  }

  function renderEntityThumb(entity, mode = 'tile') {
    const image = mediaFromEntity(entity);
    const title = entity?.name || entity?.title || entity?.displayName || entity?.id || '—';
    const cls = mode === 'hero' ? 'entity-hero-image' : 'entity-thumb';
    if (image) return `<div class="${cls}"><img src="${esc(image)}" alt="${esc(title)}" /></div>`;
    const glyph = initials(title);
    return `<div class="${cls} placeholder-thumb"><span>${esc(glyph)}</span></div>`;
  }

  function renderEntityAvatar(entity, label = '', sizeClass = '') {
    const image = mediaFromEntity(entity);
    const title = label || entity?.name || entity?.title || entity?.displayName || entity?.id || '—';
    if (image) return `<div class="avatar-circle ${sizeClass}"><img src="${esc(image)}" alt="${esc(title)}" /></div>`;
    return `<div class="avatar-circle ${sizeClass}">${esc(entity?.avatarGlyph || initials(title))}</div>`;
  }

  function equipmentLabel(slot) {
    return ({ primaryWeapon: 'Основное оружие', secondaryWeapon: 'Вторичное оружие', armor: 'Броня' }[slot] || slot);
  }

  function findPlayerById(playerId) {
    return App.data.players.get(playerId) || null;
  }

  function findNpcById(npcId) {
    return App.data.npcs.get(npcId) || null;
  }

  function threadEntity(thread) {
    if (!thread) return null;
    if (thread.type === 'npc') return findNpcById(thread.npcId);
    return findPlayerById(thread.otherId);
  }

  function messageActor(row, thread = null) {
    if (!row) return null;
    if (row.sender_type === 'npc' || row.npc_id) return findNpcById(row.npc_id || row.sender_id);
    if (row.sender_id) return findPlayerById(row.sender_id);
    return threadEntity(thread);
  }

  function archiveItemLabel(item) {
    return item?.name || item?.title || item?.id || '—';
  }

  const MOBILE_READ_MARKERS_KEY = 'grpg.mobile.readMarkers.v1';

  function loadMobileReadMarkers() {
    try {
      if (RUNTIME.cloudOnly) {
        const primary = App.rememberLogin ? window.localStorage : window.sessionStorage;
        const secondary = App.rememberLogin ? window.sessionStorage : window.localStorage;
        return jsonStorageRead(primary, MOBILE_READ_MARKERS_KEY, jsonStorageRead(secondary, MOBILE_READ_MARKERS_KEY, {})) || {};
      }
      const parsed = JSON.parse(localStorage.getItem(MOBILE_READ_MARKERS_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveMobileReadMarkers(markers = {}) {
    try {
      if (RUNTIME.cloudOnly) {
        const target = App.rememberLogin ? window.localStorage : window.sessionStorage;
        const other = App.rememberLogin ? window.sessionStorage : window.localStorage;
        jsonStorageWrite(target, MOBILE_READ_MARKERS_KEY, deep(markers || {}));
        jsonStorageRemove(other, MOBILE_READ_MARKERS_KEY);
        return;
      }
      localStorage.setItem(MOBILE_READ_MARKERS_KEY, JSON.stringify(markers || {}));
    } catch {}
  }

  function isArchiveArticleRead(id) {
    const key = String(id || '').trim();
    if (!key) return true;
    return Boolean(loadMobileReadMarkers().articles?.[key]);
  }

  function markArchiveArticleRead(id) {
    const key = String(id || '').trim();
    if (!key) return;
    const markers = loadMobileReadMarkers();
    markers.articles = markers.articles && typeof markers.articles === 'object' ? markers.articles : {};
    markers.articles[key] = new Date().toISOString();
    saveMobileReadMarkers(markers);
  }


  function archiveCategoryLabel(item) {
    return String(item?.category || item?.type || item?.section || 'Без категории').trim() || 'Без категории';
  }

  function groupedArchiveMarkup(items = [], entity = null) {
    if (!items.length) return '<div class="placeholder">Ничего не найдено.</div>';
    const groups = new Map();
    items.forEach(item => {
      const key = item?._type === 'article' ? archiveCategoryLabel(item) : '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const ordered = Array.from(groups.entries()).sort((a, b) => {
      if (!a[0] && b[0]) return -1;
      if (a[0] && !b[0]) return 1;
      return a[0].localeCompare(b[0], 'ru');
    });
    return ordered.map(([category, group]) => `
      ${category ? `<div class="archive-category-title">${esc(category)}</div>` : ''}
      ${group.map(item => {
        const unread = item._type === 'article' && !isArchiveArticleRead(item.id);
        return `
          <article class="archive-tile ${item.id === entity?.id ? 'active' : ''} ${unread ? 'unread' : ''}" style="cursor:pointer" data-action="select-archive" data-type="${esc(item._type)}" data-id="${esc(item.id)}">
            ${renderEntityThumb(item)}
            <button class="archive-tile-btn" type="button" data-action="select-archive" data-type="${esc(item._type)}" data-id="${esc(item.id)}">
              <span>${unread ? '<b class="new-badge">NEW</b> ' : ''}${esc(archiveItemLabel(item))}</span>
            </button>
          </article>
        `;
      }).join('')}
    `).join('');
  }

  function sortArchiveItemsForMobile(items = [], tab = '') {
    // Stable order: category grouping happens later, items are always alphabetical.
    // (Unread-first sorting made tiles jump to a new grid position the moment an
    // article was read — the list must not reorder itself while browsing.)
    const list = [...(Array.isArray(items) ? items : [])];
    return list.sort((a, b) => slugText(archiveItemLabel(a)).localeCompare(slugText(archiveItemLabel(b)), 'ru'));
  }

  function normalizeRichHtml(html = '') {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    template.content.querySelectorAll('img').forEach(img => {
      const src = resolveMediaUrl(img.getAttribute('src') || '', img.getAttribute('data-storage-path') || img.dataset.storagePath || '');
      if (!src) {
        const stub = document.createElement('div');
        stub.className = 'media-missing';
        stub.textContent = 'Изображение недоступно на мобильном устройстве';
        img.replaceWith(stub);
        return;
      }
      img.setAttribute('src', src);
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    });
    template.content.querySelectorAll('a[href]').forEach(link => {
      const href = String(link.getAttribute('href') || '').trim();
      if (!href || href.startsWith('article:')) return;
      if (/^(https?:|mailto:|tel:|#)/i.test(href)) return;
      link.setAttribute('href', resolveMediaUrl(href));
    });
    return template.innerHTML;
  }

  function maxUpdatedAt(rows = []) {
    let value = null;
    rows.forEach(row => {
      const stamp = row?.updated_at || row?.client_updated_at || row?.created_at || null;
      if (!stamp) return;
      if (!value || new Date(stamp) > new Date(value)) value = stamp;
    });
    return value;
  }

  function combatRowActiveSceneId(row) {
    return String(row?.active_scene_id || row?.activeSceneId || '').trim();
  }

  function combatRowRuntime(row) {
    if (!row) return {};
    const raw = row.runtime_json || row.runtime || {};
    return raw && typeof raw === 'object' ? deep(raw) : {};
  }

  function mergeCombatRuntime(current, incoming) {
    if (!current) return incoming ? deep(incoming) : null;
    if (!incoming) return deep(current);
    const currentRevision = Number(current.revision || 0);
    const incomingRevision = Number(incoming.revision || 0);
    if (incomingRevision && incomingRevision !== currentRevision) return incomingRevision > currentRevision ? deep(incoming) : deep(current);
    const currentStamp = new Date(current.updated_at || current.client_updated_at || 0).getTime();
    const incomingStamp = new Date(incoming.updated_at || incoming.client_updated_at || 0).getTime();
    const preferred = incomingStamp >= currentStamp ? deep(incoming) : deep(current);
    const fallback = incomingStamp >= currentStamp ? deep(current) : deep(incoming);
    return {
      ...fallback,
      ...preferred,
      scene_json: preferred.scene_json || preferred.scene || fallback.scene_json || fallback.scene || {},
      runtime_json: preferred.runtime_json || preferred.runtime || fallback.runtime_json || fallback.runtime || {}
    };
  }

  function getCombatSceneRuntime(sceneId) {
    const key = String(sceneId || '').trim();
    if (!key) return {};
    const cached = App.data.combatRuntimeByScene instanceof Map ? App.data.combatRuntimeByScene.get(key) : null;
    if (cached && typeof cached === 'object') return cached;
    const activeSceneId = combatRowActiveSceneId(App.data.combatRuntime);
    if (activeSceneId && activeSceneId === key) return combatRowRuntime(App.data.combatRuntime);
    return {};
  }

  function getCombatView(sceneId) {
    const key = String(sceneId || '').trim();
    const current = App.ui.combatViewByScene?.[key] || {};
    return {
      scale: clamp(Number(current.scale || 1), 1, 4),
      panX: Number(current.panX || 0),
      panY: Number(current.panY || 0)
    };
  }

  function setCombatView(sceneId, patch = {}, viewport = null) {
    const key = String(sceneId || '').trim();
    if (!key) return getCombatView(key);
    const base = getCombatView(key);
    const scale = clamp(Number(patch.scale ?? base.scale), 1, 4);
    let panX = Number(patch.panX ?? base.panX);
    let panY = Number(patch.panY ?? base.panY);
    if (viewport) {
      const rect = viewport.getBoundingClientRect();
      const maxX = Math.max(0, ((rect.width * scale) - rect.width) / 2);
      const maxY = Math.max(0, ((rect.height * scale) - rect.height) / 2);
      panX = clamp(panX, -maxX, maxX);
      panY = clamp(panY, -maxY, maxY);
    }
    const next = { scale, panX, panY };
    App.ui.combatViewByScene = { ...(App.ui.combatViewByScene || {}), [key]: next };
    return next;
  }

  function combatStageTransformStyle(sceneId) {
    const view = getCombatView(sceneId);
    return `--cam-scale:${view.scale};--cam-pan-x:${view.panX}px;--cam-pan-y:${view.panY}px;`;
  }

  function bindCombatViewport(viewport) {
    if (!viewport || viewport.dataset.bound === '1') return;
    viewport.dataset.bound = '1';
    const sceneId = String(viewport.dataset.sceneId || '').trim();
    if (!sceneId) return;
    viewport.style.touchAction = 'none';
    const state = { pointers: new Map(), dragOrigin: null, pinchBase: null };

    const midpoint = pts => ({ x: pts.reduce((sum, pt) => sum + pt.x, 0) / pts.length, y: pts.reduce((sum, pt) => sum + pt.y, 0) / pts.length });
    const distance = (a, b) => Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));

    const refreshStage = () => {
      const stage = viewport.querySelector('.combat-board-stage');
      if (!stage) return;
      const view = setCombatView(sceneId, {}, viewport);
      stage.style.setProperty('--cam-scale', String(view.scale));
      stage.style.setProperty('--cam-pan-x', `${view.panX}px`);
      stage.style.setProperty('--cam-pan-y', `${view.panY}px`);
    };

    const resetFromPointers = () => {
      const points = [...state.pointers.values()];
      if (points.length >= 2) {
        const pair = points.slice(0, 2);
        const view = getCombatView(sceneId);
        state.pinchBase = { center: midpoint(pair), distance: Math.max(12, distance(pair[0], pair[1])), scale: view.scale, panX: view.panX, panY: view.panY };
        state.dragOrigin = null;
        return;
      }
      state.pinchBase = null;
      if (points.length === 1) {
        const point = points[0];
        const view = getCombatView(sceneId);
        state.dragOrigin = { x: point.x, y: point.y, panX: view.panX, panY: view.panY };
        return;
      }
      state.dragOrigin = null;
    };

    viewport.addEventListener('pointerdown', event => {
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      viewport.setPointerCapture?.(event.pointerId);
      resetFromPointers();
      event.preventDefault();
    });

    viewport.addEventListener('pointermove', event => {
      if (!state.pointers.has(event.pointerId)) return;
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...state.pointers.values()];
      if (points.length >= 2 && state.pinchBase) {
        const pair = points.slice(0, 2);
        const center = midpoint(pair);
        const nextScale = clamp(state.pinchBase.scale * (distance(pair[0], pair[1]) / Math.max(12, state.pinchBase.distance)), 1, 4);
        setCombatView(sceneId, {
          scale: nextScale,
          panX: state.pinchBase.panX + (center.x - state.pinchBase.center.x),
          panY: state.pinchBase.panY + (center.y - state.pinchBase.center.y)
        }, viewport);
        refreshStage();
        event.preventDefault();
        return;
      }
      if (points.length === 1 && state.dragOrigin) {
        const point = points[0];
        setCombatView(sceneId, {
          panX: state.dragOrigin.panX + (point.x - state.dragOrigin.x),
          panY: state.dragOrigin.panY + (point.y - state.dragOrigin.y)
        }, viewport);
        refreshStage();
        event.preventDefault();
      }
    });

    const releasePointer = event => {
      state.pointers.delete(event.pointerId);
      viewport.releasePointerCapture?.(event.pointerId);
      resetFromPointers();
    };

    viewport.addEventListener('pointerup', releasePointer);
    viewport.addEventListener('pointercancel', releasePointer);
    viewport.addEventListener('pointerleave', event => {
      if (state.pointers.size <= 1) releasePointer(event);
    });
    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      const current = getCombatView(sceneId);
      const factor = event.deltaY < 0 ? 1.12 : 0.9;
      setCombatView(sceneId, { scale: clamp(current.scale * factor, 1, 4) }, viewport);
      refreshStage();
    }, { passive: false });

    refreshStage();
  }

  function initCombatViewports() {
    $$('.combat-board-viewport').forEach(bindCombatViewport);
  }

  function renderActiveScreenSafely() {
    if (App.ui.boot !== 'app') return;
    const scrollY = window.scrollY || 0;
    const active = document.activeElement;
    const focusKey = active?.name === 'body' && App.ui.screen === 'chat' ? App.ui.selectedThreadKey : null;
    const focusValue = active && active instanceof HTMLTextAreaElement ? active.value : null;
    renderCurrentScreen();
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
      if (focusKey && focusValue != null) {
        const next = document.querySelector('#chat-compose-form textarea[name="body"]');
        if (next && App.ui.selectedThreadKey === focusKey) {
          next.value = focusValue;
          next.focus({ preventScroll: true });
          next.selectionStart = next.selectionEnd = next.value.length;
        }
      }
    });
  }

  function renderAffectedScreens(changed = {}) {
    if (App.ui.boot === 'login') {
      renderLogin();
      return;
    }
    if (App.ui.boot !== 'app') return;
    const active = App.ui.screen;
    if ((changed.chat && active === 'chat') || (changed.combat && active === 'combat') || (changed.players && active === 'profile') || (changed.snapshot && ['home', 'archive', 'market'].includes(active))) {
      renderActiveScreenSafely();
      return;
    }
    if (changed.players && ['home', 'market', 'chat'].includes(active)) {
      renderActiveScreenSafely();
    }
  }

  async function storageGet(key, fallback = null) {
    try {
      if (RUNTIME.cloudOnly) {
        if (key === KEYS.cache) return fallback;
        const primary = App.rememberLogin ? window.localStorage : window.sessionStorage;
        const secondary = App.rememberLogin ? window.sessionStorage : window.localStorage;
        const missing = {};
        const first = jsonStorageRead(primary, key, missing);
        if (first !== missing) return deep(first);
        const second = jsonStorageRead(secondary, key, missing);
        return second !== missing ? deep(second) : fallback;
      }
      const preferences = window.Capacitor?.Plugins?.Preferences;
      if (preferences?.get) {
        const res = await preferences.get({ key });
        return res?.value ? JSON.parse(res.value) : fallback;
      }
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  async function storageSet(key, value) {
    if (RUNTIME.cloudOnly) {
      if (key === KEYS.cache) return;
      const safeValue = key === KEYS.config ? sanitizedConfig(value) : deep(value);
      const target = App.rememberLogin ? window.localStorage : window.sessionStorage;
      const other = App.rememberLogin ? window.sessionStorage : window.localStorage;
      jsonStorageWrite(target, key, safeValue);
      jsonStorageRemove(other, key);
      return;
    }
    const raw = JSON.stringify(value);
    const preferences = window.Capacitor?.Plugins?.Preferences;
    if (preferences?.set) return preferences.set({ key, value: raw });
    window.localStorage.setItem(key, raw);
  }

  async function storageRemove(key) {
    if (RUNTIME.cloudOnly) {
      WEB_MEMORY.delete(key);
      jsonStorageRemove(window.localStorage, key);
      jsonStorageRemove(window.sessionStorage, key);
      return;
    }
    const preferences = window.Capacitor?.Plugins?.Preferences;
    if (preferences?.remove) return preferences.remove({ key });
    window.localStorage.removeItem(key);
  }


  function pbBaseUrl(config = App.config) {
    return String(config?.url || '').trim().replace(/\/+$/, '');
  }

  function pbCollection(config, key) {
    if (key === 'users') return config.appUsersCollection || DEFAULTS.appUsersCollection;
    if (key === 'snapshot') return config.tableName || DEFAULTS.tableName;
    if (key === 'players') return config.playerTableName || DEFAULTS.playerTableName;
    if (key === 'chat') return config.chatTableName || DEFAULTS.chatTableName;
    if (key === 'combat') return config.combatRuntimeTableName || DEFAULTS.combatRuntimeTableName;
    if (key === 'assets') return config.assetsCollection || DEFAULTS.assetsCollection;
    return key;
  }

  function pbFilterValue(value = '') {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function pbEq(field, value) {
    return `${field}="${pbFilterValue(value)}"`;
  }

  function pbAnd(...parts) {
    return parts.filter(Boolean).join(' && ');
  }

  function tokenExpiryMs(token) {
    try {
      const payload = String(token || '').split('.')[1];
      if (!payload) return 0;
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const parsed = JSON.parse(atob(padded));
      return Number(parsed?.exp || 0) * 1000;
    } catch {
      return 0;
    }
  }

  async function persistAuth(payload) {
    const token = String(payload?.token || '');
    App.auth = { token, expiresAt: tokenExpiryMs(token) };
    if (token) await storageSet(KEYS.auth, App.auth);
    else await storageRemove(KEYS.auth);
    return token;
  }

  async function refreshPocketBaseAuth(config = App.config) {
    if (!App.auth?.token) throw new Error('Сохранённая сессия отсутствует');
    const base = pbBaseUrl(config);
    const collection = encodeURIComponent(pbCollection(config, 'users'));
    const response = await fetch(`${base}/api/collections/${collection}/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${App.auth.token}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.token) throw new Error(payload?.message || `PocketBase auth refresh failed: HTTP ${response.status}`);
    return persistAuth(payload);
  }

  async function pbAuthToken(config = App.config, force = false) {
    const now = Date.now();
    const currentExpiry = Number(App.auth?.expiresAt || tokenExpiryMs(App.auth?.token));
    if (!force && App.auth?.token && currentExpiry > now + 60000) return App.auth.token;

    if (App.auth?.token) {
      try {
        return await refreshPocketBaseAuth(config);
      } catch {
        await persistAuth(null);
      }
    }

    if (!config?.appUserEmail || !config?.appUserPassword) {
      throw new Error('Срок сохранённого входа истёк. Введите данные подключения PocketBase повторно.');
    }

    const base = pbBaseUrl(config);
    const collection = encodeURIComponent(pbCollection(config, 'users'));
    const response = await fetch(`${base}/api/collections/${collection}/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: config.appUserEmail, password: config.appUserPassword })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.token) throw new Error(payload?.message || `PocketBase auth failed: HTTP ${response.status}`);
    return persistAuth(payload);
  }

  async function pbFetch(config, pathname, options = {}) {
    const base = pbBaseUrl(config);
    const url = new URL(pathname, `${base}/`);
    Object.entries(options.query || {}).forEach(([key, value]) => {
      if (value == null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers = { ...(options.headers || {}) };
      if (options.auth !== false) headers.Authorization = `Bearer ${await pbAuthToken(config, attempt > 0)}`;
      let body = options.body;
      if (options.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.json ?? {});
      }
      const response = await fetch(url.toString(), { method: options.method || 'GET', headers, body });
      const text = await response.text().catch(() => '');
      const payload = text ? (() => { try { return JSON.parse(text); } catch { return { text }; } })() : null;
      if (response.status === 401 && attempt === 0) {
        await persistAuth(null);
        continue;
      }
      if (!response.ok) {
        const detail = payload?.data ? ` // ${JSON.stringify(payload.data)}` : '';
        throw new Error(`${payload?.message || text || 'PocketBase request failed'}: HTTP ${response.status}${detail}`);
      }
      return payload;
    }
    throw new Error('PocketBase request failed');
  }

  async function pbList(config, key, options = {}) {
    const collection = encodeURIComponent(pbCollection(config, key));
    const payload = await pbFetch(config, `/api/collections/${collection}/records`, {
      query: { page: options.page || 1, perPage: options.perPage || options.limit || 500, filter: options.filter || '', sort: options.sort || '' }
    });
    return Array.isArray(payload?.items) ? payload.items : [];
  }

  async function pbFirst(config, key, filter = '') {
    const rows = await pbList(config, key, { filter, perPage: 1 });
    return rows[0] || null;
  }


  function qs(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === '') return;
      search.set(key, value);
    });
    return search.toString();
  }

  async function apiPing(config) {
    await pbAuthToken(config, true);
    await apiPullSnapshot(config, false);
    return true;
  }

  function normalizeSnapshotRow(record = {}) {
    if (!record) return null;
    return {
      id: record.id,
      campaign_id: record.campaign_id || record.campaignId,
      revision: Number(record.revision || 0),
      updated_at: record.updated_at || record.updated || record.updatedAt || null,
      updated_by: record.updated_by || record.updatedBy || null,
      client_updated_at: record.client_updated_at || record.clientUpdatedAt || null,
      world_json: record.world_json || record.worldJson || record.world || {},
      state_json: record.state_json || record.stateJson || record.state || {}
    };
  }

  function composePlayerJsonFromSegments(row = {}) {
    return {
      ...(row.profile_json || {}),
      ...(row.private_state_json || {}),
      inventory: Array.isArray(row.inventory_json) ? deep(row.inventory_json) : []
    };
  }

  function normalizePlayerRow(record = {}) {
    if (!record) return null;
    if (record.playerJson || record.playerId || record.campaignId) {
      const player = record.playerJson || {};
      const inventory = Array.isArray(player.inventory) ? deep(player.inventory) : [];
      const profile = deep(player);
      delete profile.inventory;
      const privateState = {};
      if (profile.currentPlanetId != null) privateState.currentPlanetId = profile.currentPlanetId;
      return {
        id: record.id,
        campaign_id: record.campaignId,
        player_id: record.playerId || player.id,
        version: Number(record.version || 0),
        updated_at: record.updated || record.updatedAt || null,
        updated_by: record.updatedBy || null,
        client_updated_at: record.clientUpdatedAt || null,
        deleted_at: record.deletedAt || null,
        profile_json: profile,
        inventory_json: inventory,
        private_state_json: privateState
      };
    }
    return record;
  }

  function normalizeChatRow(record = {}) {
    if (!record) return null;
    if (record.messageId || record.campaignId) {
      return {
        id: record.id,
        campaign_id: record.campaignId,
        message_id: record.messageId,
        kind: record.kind || 'direct',
        thread_key: record.threadKey || '',
        sender_type: record.senderType || 'player',
        sender_id: record.senderId || null,
        recipient_player_id: record.recipientPlayerId || null,
        npc_id: record.npcId || null,
        direct_a: record.directA || null,
        direct_b: record.directB || null,
        author_label: record.authorLabel || null,
        body_html: record.bodyHtml || '',
        created_at: record.clientCreatedAt || record.created || record.updated || null,
        edited_at: record.editedAt || null,
        deleted_at: record.deletedAt || null,
        updated_at: record.updated || record.clientUpdatedAt || null,
        client_updated_at: record.clientUpdatedAt || record.updated || null
      };
    }
    return record;
  }

  function normalizeCombatRow(record = {}) {
    if (!record) return null;
    if (record.activeSceneId || record.campaignId) {
      return {
        id: record.id,
        campaign_id: record.campaignId,
        revision: Number(record.revision || 0),
        updated_at: record.updated || record.updatedAt || null,
        updated_by: record.updatedBy || null,
        client_updated_at: record.clientUpdatedAt || null,
        active_scene_id: record.activeSceneId || '',
        scene_json: record.sceneJson || {},
        runtime_json: record.runtimeJson || {}
      };
    }
    return record;
  }

  async function apiPullSnapshot(config, includePayload = true) {
    const record = await pbFirst(config, 'snapshot', pbEq('campaignId', config.campaignId));
    const row = normalizeSnapshotRow(record);
    if (row && includePayload === false) { row.world_json = null; row.state_json = null; }
    return row;
  }

  async function apiPullPlayers(config) {
    const rows = await pbList(config, 'players', { filter: pbEq('campaignId', config.campaignId), sort: 'updated,playerId', perPage: 1000 });
    return rows.map(normalizePlayerRow).filter(Boolean);
  }

  async function apiPullPlayer(config, playerId) {
    const record = await pbFirst(config, 'players', pbAnd(pbEq('campaignId', config.campaignId), pbEq('playerId', playerId)));
    return normalizePlayerRow(record);
  }

  async function apiUpsertPlayer(config, payload) {
    const now = new Date().toISOString();
    const existing = await pbFirst(config, 'players', pbAnd(pbEq('campaignId', config.campaignId), pbEq('playerId', payload.player_id)));
    const body = {
      campaignId: config.campaignId,
      playerId: payload.player_id,
      version: Number(payload.version || existing?.version || 0) || 1,
      updatedBy: payload.updated_by || config.deviceLabel || 'mobile-player',
      clientUpdatedAt: payload.client_updated_at || now,
      playerJson: composePlayerJsonFromSegments(payload)
    };
    const collection = encodeURIComponent(pbCollection(config, 'players'));
    const record = existing?.id
      ? await pbFetch(config, `/api/collections/${collection}/records/${encodeURIComponent(existing.id)}`, { method: 'PATCH', json: body })
      : await pbFetch(config, `/api/collections/${collection}/records`, { method: 'POST', json: body });
    return normalizePlayerRow(record);
  }

  async function apiPatchPlayerWithVersion(config, playerId, expectedVersion, payload) {
    const now = new Date().toISOString();
    const existing = await pbFirst(config, 'players', pbAnd(pbEq('campaignId', config.campaignId), pbEq('playerId', playerId)));
    if (!existing || Number(existing.version || 0) !== Number(expectedVersion || 0)) return null;
    const collection = encodeURIComponent(pbCollection(config, 'players'));
    const record = await pbFetch(config, `/api/collections/${collection}/records/${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      json: {
        version: Number(expectedVersion || 0) + 1,
        updatedBy: payload.updated_by || config.deviceLabel || 'mobile-player',
        clientUpdatedAt: payload.client_updated_at || now,
        playerJson: composePlayerJsonFromSegments(payload)
      }
    });
    return normalizePlayerRow(record);
  }

  async function apiPullChat(config, since = null) {
    const filters = [pbEq('campaignId', config.campaignId)];
    if (since) filters.push(`updated>="${pbFilterValue(since)}"`);
    const rows = await pbList(config, 'chat', { filter: pbAnd(...filters), sort: 'updated,messageId', perPage: 1000 });
    return rows.map(normalizeChatRow).filter(Boolean);
  }

  async function apiUpsertChat(config, row) {
    const now = new Date().toISOString();
    const body = {
      campaignId: config.campaignId,
      messageId: row.message_id,
      kind: row.kind || 'direct',
      threadKey: row.thread_key,
      senderType: row.sender_type || 'player',
      senderId: row.sender_id || null,
      recipientPlayerId: row.recipient_player_id || null,
      npcId: row.npc_id || null,
      directA: row.direct_a || null,
      directB: row.direct_b || null,
      authorLabel: row.author_label || null,
      bodyHtml: row.body_html || '',
      clientCreatedAt: row.created_at || now,
      editedAt: row.edited_at || null,
      deletedAt: row.deleted_at || null,
      clientUpdatedAt: row.client_updated_at || now
    };
    const existing = await pbFirst(config, 'chat', pbAnd(pbEq('campaignId', config.campaignId), pbEq('messageId', body.messageId)));
    const collection = encodeURIComponent(pbCollection(config, 'chat'));
    const record = existing?.id
      ? await pbFetch(config, `/api/collections/${collection}/records/${encodeURIComponent(existing.id)}`, { method: 'PATCH', json: body })
      : await pbFetch(config, `/api/collections/${collection}/records`, { method: 'POST', json: body });
    return normalizeChatRow(record);
  }

  async function apiPullCombatRuntime(config) {
    const record = await pbFirst(config, 'combat', pbEq('campaignId', config.campaignId));
    return normalizeCombatRow(record);
  }

  const GUEST_ID = '__guest__';

  function isGuestSession() {
    return String(App.session?.role || '') === 'guest' || String(App.session?.userId || '') === GUEST_ID;
  }

  function visibilityIds(entity) {
    return Array.isArray(entity?.visibility?.playerIds) ? entity.visibility.playerIds.map(String) : [];
  }

  function visibleForPlayer(entity, playerId) {
    if (!entity) return false;
    if (!entity.visibility || typeof entity.visibility !== 'object') return true;
    const ids = visibilityIds(entity);
    if (!ids.length) return false;
    const pid = String(playerId || '');
    if (ids.includes(pid)) return true;
    return isGuestSession() && (ids.includes(GUEST_ID) || ids.includes('guest'));
  }

  function npcAllowsPlayerChat(npc = {}) {
    return npc && npc.allowPlayerChat !== false && npc.chatEnabled !== false && npc.disablePlayerChat !== true;
  }

  function buildPlayerMap(snapshot, playerRows) {
    const base = new Map();
    const fromWorld = snapshot?.world_json?.players?.PLAYER_TEMPLATES || {};
    const fromState = snapshot?.state_json?.users || {};
    Object.entries(fromWorld).forEach(([id, value]) => base.set(id, deep(value)));
    Object.entries(fromState).forEach(([id, value]) => base.set(id, { ...(base.get(id) || {}), ...deep(value) }));
    playerRows.forEach(row => {
      if (row?.deleted_at) {
        base.delete(row.player_id);
        return;
      }
      const current = base.get(row.player_id) || { id: row.player_id };
      const merged = {
        ...current,
        ...(row.profile_json || {}),
        ...(row.private_state_json || {}),
        inventory: Array.isArray(row.inventory_json) ? deep(row.inventory_json) : deep(current.inventory || [])
      };
      merged.id = row.player_id;
      base.set(row.player_id, merged);
    });
    return base;
  }

  function currentPlayer() {
    return App.data.players.get(App.session?.userId || '') || null;
  }

  function currentPlanet() {
    const player = currentPlayer();
    if (!player?.currentPlanetId) return null;
    return App.data.planets.get(player.currentPlanetId) || null;
  }

  function currentSystem() {
    const planet = currentPlanet();
    if (!planet) return null;
    return App.data.systems.find(system => (system.planetIds || []).includes(planet.id)) || null;
  }

  function relatedSystemForPlanetId(planetId) {
    if (!planetId) return null;
    return App.data.systems.find(system => (system.planetIds || []).includes(planetId)) || null;
  }

  function articleSystemTarget(article) {
    const planetId = Array.isArray(article?.relatedPlanetIds) ? article.relatedPlanetIds[0] : null;
    return relatedSystemForPlanetId(planetId);
  }

  function decomposePlayer(player) {
    const clean = deep(player || {});
    const inventory = Array.isArray(clean.inventory) ? clean.inventory : [];
    delete clean.inventory;
    const privateState = {};
    if (clean.currentPlanetId != null) privateState.currentPlanetId = clean.currentPlanetId;
    return {
      profile_json: clean,
      inventory_json: inventory,
      private_state_json: privateState
    };
  }

  function compileData(snapshot, playerRows, chatRows, combatRuntime) {
    const world = snapshot?.world_json || {};
    const state = snapshot?.state_json || {};
    App.data.world = world;
    App.data.state = state;
    App.data.playerRows = new Map(playerRows.map(row => [row.player_id, row]));
    App.data.players = buildPlayerMap(snapshot, playerRows);
    App.data.systems = Array.isArray(world.systems?.SYSTEMS) ? deep(world.systems.SYSTEMS) : [];
    App.data.planets = new Map(Object.entries(world.planets?.PLANETS || {}).map(([id, value]) => [id, deep(value)]));
    App.data.articles = new Map(Object.entries(world.articles?.ARTICLES || {}).map(([id, value]) => [id, deep(value)]));
    App.data.articleList = Array.isArray(world.articles?.ARTICLE_LIST) ? deep(world.articles.ARTICLE_LIST) : Array.from(App.data.articles.values());
    App.data.newsList = Array.isArray(world.news?.NEWS_LIST) ? deep(world.news.NEWS_LIST) : Object.values(world.news?.NEWS || {});
    App.data.tasksList = Array.isArray(world.tasks?.TASK_LIST) ? deep(world.tasks.TASK_LIST) : Object.values(world.tasks?.TASKS || {});
    App.data.npcs = new Map(Object.entries(world.npcs?.NPCS || {}).map(([id, value]) => [id, deep(value)]));
    App.data.items = new Map(Object.entries(world.equipment?.EQUIPMENT || {}).map(([id, value]) => [id, deep(value)]));
    App.data.campaigns = new Map(Object.entries(world.campaigns?.CAMPAIGNS || {}).map(([id, value]) => [id, deep(value)]));
    if (!App.data.campaigns.size) App.data.campaigns.set('main', { id: 'main', name: 'Основная кампания' });
    App.data.skills = new Map(Object.entries(world.skills?.SKILLS || {}).map(([id, value]) => [id, deep(value)]));
    App.data.factions = new Map(Object.entries(world.factions?.FACTIONS || {}).map(([id, value]) => [id, deep(value)]));
    App.data.organizations = new Map(Object.entries(world.organizations?.ORGANIZATIONS || {}).map(([id, value]) => [id, deep(value)]));
    App.data.combatScenes = Object.values(world.combatScenes?.COMBAT_SCENES || {}).map(scene => deep(scene));
    App.data.chatRows = Array.isArray(chatRows) ? deep(chatRows) : [];
    const runtimeCache = App.data.combatRuntimeByScene instanceof Map ? new Map(App.data.combatRuntimeByScene) : new Map();
    App.data.combatRuntime = combatRuntime ? deep(combatRuntime) : null;
    const remoteScene = App.data.combatRuntime?.scene_json || App.data.combatRuntime?.scene || null;
    const remoteSceneId = String(App.data.combatRuntime?.active_scene_id || App.data.combatRuntime?.activeSceneId || remoteScene?.id || '').trim();
    if (remoteScene && remoteSceneId && !App.data.combatScenes.some(scene => String(scene.id) === remoteSceneId)) {
      App.data.combatScenes.unshift({ ...deep(remoteScene), id: remoteSceneId });
    } else if (remoteScene && remoteSceneId) {
      App.data.combatScenes = App.data.combatScenes.map(scene => String(scene.id) === remoteSceneId ? { ...deep(remoteScene), id: remoteSceneId } : scene);
    }
    const activeSceneId = combatRowActiveSceneId(App.data.combatRuntime);
    const activeRuntime = combatRowRuntime(App.data.combatRuntime);
    if (activeSceneId && activeRuntime && Object.keys(activeRuntime).length) runtimeCache.set(activeSceneId, deep(activeRuntime));
    App.data.combatRuntimeByScene = runtimeCache;
    App.ui.lastSnapshotRevision = Number(snapshot?.revision || App.ui.lastSnapshotRevision || 0);
    App.ui.lastChatStamp = maxUpdatedAt(App.data.chatRows) || App.ui.lastChatStamp;
    App.ui.lastCombatStamp = combatRuntime?.updated_at || combatRuntime?.client_updated_at || App.ui.lastCombatStamp;
  }

  async function saveCache() {
    App.cache = {
      snapshot: App.cache.snapshot,
      players: Array.from(App.data.playerRows.values()),
      chat: App.data.chatRows,
      combatRuntime: App.data.combatRuntime,
      combatRuntimeByScene: Object.fromEntries(App.data.combatRuntimeByScene instanceof Map ? App.data.combatRuntimeByScene.entries() : []),
      fetchedAt: new Date().toISOString()
    };
    await storageSet(KEYS.cache, App.cache);
  }

  async function loadLocalState() {
    if (RUNTIME.cloudOnly) {
      purgeLegacyBrowserState();
      jsonStorageRemove(window.localStorage, KEYS.cache);
      jsonStorageRemove(window.sessionStorage, KEYS.cache);
      const remembered = readRememberState();
      App.rememberLogin = remembered.enabled;
      App.rememberUntil = remembered.expiresAt;
    }
    App.config = normalizeConfig(await storageGet(KEYS.config, {}));
    App.cache = await storageGet(KEYS.cache, App.cache);
    App.session = await storageGet(KEYS.session, null);
    App.auth = await storageGet(KEYS.auth, { token: '', expiresAt: 0 });
    if (App.auth?.token && !App.auth.expiresAt) App.auth.expiresAt = tokenExpiryMs(App.auth.token);
  }

  function screenNodes() {
    return {
      setup: $('#setup-screen'),
      login: $('#login-screen'),
      app: $('#app-shell')
    };
  }

  function openBoot(mode) {
    App.ui.boot = mode;
    const nodes = screenNodes();
    nodes.setup.classList.toggle('hidden', mode !== 'setup');
    nodes.login.classList.toggle('hidden', mode !== 'login');
    nodes.app.classList.toggle('hidden', mode !== 'app');
  }

  function setTopbar(title, subtitle) {
    $('#screen-title').textContent = title;
    $('#screen-subtitle').textContent = subtitle;
    $('#campaign-label').textContent = App.config?.campaignId || 'CAMPAIGN';
  }

  async function bootFromCacheIfNeeded() {
    if (!App.cache?.snapshot) return false;
    if (App.cache?.combatRuntimeByScene && typeof App.cache.combatRuntimeByScene === 'object') App.data.combatRuntimeByScene = new Map(Object.entries(App.cache.combatRuntimeByScene).map(([id, runtime]) => [id, deep(runtime)]));
    compileData(App.cache.snapshot, App.cache.players || [], App.cache.chat || [], App.cache.combatRuntime || null);
    return true;
  }

  async function pullEverything({ silent = false, render = true } = {}) {
    if (!hasConfig()) throw new Error('Синхронизация ещё не настроена');
    const [snapshot, players, chatRows, combatRuntime] = await Promise.all([
      apiPullSnapshot(App.config, true),
      apiPullPlayers(App.config),
      apiPullChat(App.config, null),
      apiPullCombatRuntime(App.config)
    ]);
    if (!snapshot) throw new Error('В облаке нет кампании с таким CAMPAIGN_ID');
    App.cache.snapshot = snapshot;
    compileData(snapshot, players, chatRows, combatRuntime);
    await saveCache();
    if (render) renderAffectedScreens({ snapshot: true, players: true, chat: true, combat: true });
    if (!silent) notify('Кампания обновлена из облака', 'ok');
  }

  async function pullLiveData(kinds = { players: true, chat: true, combat: true }) {
    if (!App.session?.userId || !hasConfig()) return;
    const jobs = [];
    if (kinds.players) jobs.push(apiPullPlayers(App.config)); else jobs.push(Promise.resolve(null));
    if (kinds.chat) jobs.push(apiPullChat(App.config, App.ui.lastChatStamp)); else jobs.push(Promise.resolve(null));
    if (kinds.combat) jobs.push(apiPullCombatRuntime(App.config)); else jobs.push(Promise.resolve(null));
    const [rows, chatRows, combatRuntime] = await Promise.all(jobs);
    const nextPlayers = rows || Array.from(App.data.playerRows.values());
    const mergedChat = kinds.chat ? mergeChatRows(App.data.chatRows, chatRows) : App.data.chatRows;
    const nextCombat = kinds.combat ? mergeCombatRuntime(App.data.combatRuntime, combatRuntime || App.data.combatRuntime) : App.data.combatRuntime;
    compileData(App.cache.snapshot, nextPlayers, mergedChat, nextCombat);
    await saveCache();
    renderAffectedScreens({ players: !!kinds.players, chat: !!kinds.chat, combat: !!kinds.combat });
  }

  function mergeChatRows(existing, incoming) {
    const map = new Map();
    [...(existing || []), ...(incoming || [])].forEach(row => {
      if (!row?.message_id) return;
      map.set(row.message_id, deep(row));
    });
    return Array.from(map.values()).sort((a, b) => new Date(a.updated_at || a.created_at || 0) - new Date(b.updated_at || b.created_at || 0));
  }

  function campaignIdsForPlayer(player = {}) {
    const ids = new Set();
    const source = Array.isArray(player.campaignIds) ? player.campaignIds : (Array.isArray(player.campaigns) ? player.campaigns : []);
    source.forEach(entry => {
      const id = String(entry?.id || entry?.campaignId || entry || '').trim();
      if (id) ids.add(id);
    });
    if (player.campaignId) ids.add(String(player.campaignId).trim());
    if (!ids.size) ids.add('main');
    return Array.from(ids);
  }

  function selectedLoginCampaignId() {
    return String($('#login-campaign')?.value || App.ui.selectedCampaignId || 'all');
  }

  function campaignOptionsMarkup() {
    const rows = Array.from(App.data.campaigns.values()).sort((a, b) => slugText(a.name || a.id).localeCompare(slugText(b.name || b.id), 'ru'));
    return `<option value="all">Все кампании</option>${rows.map(row => `<option value="${esc(row.id)}">${esc(row.name || row.id)}</option>`).join('')}`;
  }

  function guestProfile() {
    return {
      id: GUEST_ID,
      role: 'guest',
      displayName: 'Гость',
      shortName: 'Guest',
      avatarGlyph: 'GS',
      rank: 'Гостевой доступ',
      credits: 0,
      stats: {},
      abilities: {},
      skills: [],
      specializations: {},
      skillPoints: 0,
      inventory: [],
      implants: [],
      social: { npcIds: [], reputation: [] },
      campaignIds: ['guest']
    };
  }

  function renderLogin() {
    const campaignSelect = $('#login-campaign');
    if (campaignSelect) {
      campaignSelect.innerHTML = campaignOptionsMarkup();
      campaignSelect.value = App.ui.selectedCampaignId || 'all';
    }
    const select = $('#login-player');
    const selectedCampaign = selectedLoginCampaignId();
    const players = Array.from(App.data.players.values())
      .filter(player => String(player.role || '') !== 'guest')
      .filter(player => selectedCampaign === 'all' || campaignIdsForPlayer(player).includes(selectedCampaign))
      .sort((a, b) => slugText(a.displayName || a.id).localeCompare(slugText(b.displayName || b.id), 'ru'));
    if (!players.length) {
      select.innerHTML = '<option value="">Нет доступных профилей</option>';
      $('#login-preview').innerHTML = '<div class="muted">В выбранной кампании пока нет доступных персонажей. Можно войти гостем, если ДМ открыл гостевые материалы.</div>';
      return;
    }
    const current = App.session?.userId && App.data.players.has(App.session.userId) ? App.session.userId : players[0].id;
    select.innerHTML = players.map(player => `<option value="${esc(player.id)}">${esc(player.displayName || player.shortName || player.id)}</option>`).join('');
    select.value = current;
    renderLoginPreview();
  }

  function renderLoginPreview() {
    const player = App.data.players.get($('#login-player')?.value || '') || null;
    const root = $('#login-preview');
    if (!player) {
      root.innerHTML = '<div class="muted">Нет персонажа для предпросмотра.</div>';
      return;
    }
    const planet = player.currentPlanetId ? App.data.planets.get(player.currentPlanetId) : null;
    root.innerHTML = `
      <div class="profile-hero">
        ${renderAvatar(player)}
        <div>
          <div><b>${esc(player.displayName || player.id)}</b></div>
          <div class="muted">${esc(player.rank || player.role || 'Игрок')}</div>
          <div class="small-note" style="margin-top:6px">${planet ? `Текущая планета: ${esc(planet.name)}` : 'Текущая планета не задана'} · ${formatCredits(player.credits || 0)}</div>
        </div>
      </div>
    `;
  }

  function entityActionsSystemButton(systemId) {
    if (!systemId) return '';
    return `<button class="secondary" type="button" data-action="open-system" data-system-id="${esc(systemId)}">Перейти к системе</button>`;
  }

  function renderHome() {
    setTopbar('Навигатор', 'Системы, планеты и быстрый доступ к текущему миру без тяжёлой галактической карты');
    const root = $('#screen-home');
    const player = currentPlayer();
    const planet = currentPlanet();
    const system = currentSystem();
    const visibleSystems = App.data.systems.filter(item => visibleForPlayer(item, App.session.userId));
    const focusId = App.ui.focusedSystemId || system?.id || visibleSystems[0]?.id || '';
    const focusSystem = visibleSystems.find(item => item.id === focusId) || system || visibleSystems[0] || null;
    const focusPlanets = focusSystem ? (focusSystem.planetIds || []).map(id => App.data.planets.get(id)).filter(Boolean).filter(item => visibleForPlayer(item, App.session.userId)) : [];
    root.innerHTML = `
      <div class="hero-card">
        <div class="hero-cover">
          <div class="hero-map-bg"></div>
          <div class="hero-overlay">
            <div class="eyebrow">Текущая локация</div>
            <h2 class="hero-title">${esc(system?.name || 'Система не выбрана')}</h2>
            <p class="hero-subtitle">${planet ? `${esc(planet.name)} — текущая планета персонажа.` : 'У профиля ещё не задана текущая планета. Торговый терминал будет заблокирован, пока планета не появится в профиле.'}</p>
            <div class="chip-row">
              <div class="info-chip">Персонаж: ${esc(player?.displayName || '—')}</div>
              <div class="info-chip">Кредиты: ${formatCredits(player?.credits || 0)}</div>
              <div class="info-chip">Система: ${esc(system?.name || '—')}</div>
            </div>
          </div>
        </div>
        <div class="info-grid">
          <div class="info-card"><div class="k">Текущая планета</div><div class="v">${esc(planet?.name || 'Не задана')}</div></div>
          <div class="info-card"><div class="k">Маршруты</div><div class="v">${focusSystem ? Number((focusSystem.routes || []).length) : 0}</div></div>
          <div class="info-card"><div class="k">Видимых систем</div><div class="v">${visibleSystems.length}</div></div>
          <div class="info-card"><div class="k">Активный терминал</div><div class="v">${planet ? 'Доступен на текущей планете' : 'Заблокирован'}</div></div>
        </div>
      </div>
      <div class="section-head" style="margin-top:18px"><div class="section-title">Системы сектора</div></div>
      <div class="system-grid">
        ${visibleSystems.map(item => {
          const planets = (item.planetIds || []).map(id => App.data.planets.get(id)).filter(Boolean);
          const active = item.id === focusSystem?.id;
          return `
            <article class="entity-card ${active ? 'active' : ''}">
              <div class="eyebrow">Система</div>
              <h3>${esc(item.name || item.id)}</h3>
              <div class="entity-meta">Планет: ${planets.length}. Маршрутов: ${(item.routes || []).length}. ${item.markerLabel ? `Маркер: ${esc(item.markerLabel)}.` : ''}</div>
              <div class="entity-actions">
                <button class="secondary" type="button" data-action="focus-system" data-system-id="${esc(item.id)}">Открыть</button>
                ${planets[0] ? `<button class="secondary" type="button" data-action="open-planet" data-planet-id="${esc(planets[0].id)}">Первая планета</button>` : ''}
              </div>
            </article>
          `;
        }).join('') || '<div class="placeholder">Нет доступных систем.</div>'}
      </div>
      ${focusSystem ? `
        <div class="card" style="padding:16px; margin-top:18px;">
          <div class="section-head"><div class="section-title">${esc(focusSystem.name)}</div>${entityActionsSystemButton(focusSystem.id)}</div>
          <div class="small-note">${focusSystem.markerLabel ? esc(focusSystem.markerLabel) : 'Описание системы можно привязать через статьи и связанные планеты.'}</div>
          <div class="planet-grid" style="margin-top:14px;">
            ${focusPlanets.map(item => `
              <article class="planet-card ${item.id === planet?.id ? 'active' : ''}">
                <div class="eyebrow">Планета</div>
                <h3>${esc(item.name)}</h3>
                <div class="entity-meta">${esc(item.location?.obj || item.location?.system || item.code || '')}</div>
                <div class="entity-actions">
                  <button class="secondary" type="button" data-action="open-planet" data-planet-id="${esc(item.id)}">Открыть карточку</button>
                </div>
              </article>
            `).join('') || '<div class="placeholder">В этой системе нет планет.</div>'}
          </div>
        </div>
      ` : ''}
    `;
  }

  function archiveCollections() {
    const playerId = App.session?.userId || '';
    return {
      articles: App.data.articleList.filter(item => visibleForPlayer(item, playerId)).map(item => ({ ...item, _type: 'article' })),
      planets: Array.from(App.data.planets.values()).filter(item => visibleForPlayer(item, playerId)).map(item => ({ ...item, _type: 'planet' })),
      tasks: App.data.tasksList.filter(item => visibleForPlayer(item, playerId)).map(item => ({ ...item, _type: 'task' })),
      news: App.data.newsList.filter(item => visibleForPlayer(item, playerId)).map(item => ({ ...item, _type: 'news' }))
    };
  }

  function currentArchiveEntity() {
    if (App.ui.archiveTab === 'systems') App.ui.archiveTab = 'articles';
    const collections = archiveCollections();
    const items = sortArchiveItemsForMobile(collections[App.ui.archiveTab] || [], App.ui.archiveTab);
    let entity = items.find(item => item.id === App.ui.selectedArchiveId) || null;
    if (!entity && items[0]) {
      entity = items[0];
      App.ui.selectedArchiveId = entity.id;
      App.ui.selectedArchiveType = entity._type;
    }
    return entity;
  }

  function renderEntityBody(entity) {
    if (!entity) return '<div class="placeholder">Выбери карточку слева.</div>';
    const type = entity._type;
    if (type === 'article') {
      const relatedSystem = articleSystemTarget(entity);
      return `
        <article class="article-card">
          ${renderEntityThumb(entity, 'hero')}
          <div class="eyebrow">Статья</div>
          <h3>${esc(entity.name || entity.title || entity.id)}</h3>
          <div class="small-note">${esc(entity.summary || '')}</div>
          <div class="divider"></div>
          <div class="article-body" data-article-body>${normalizeRichHtml(entity.body || '<p class="muted">Текст статьи пуст.</p>')}</div>
          <div class="article-toolbar">
            ${entity.relatedPlanetIds?.[0] ? `<button class="secondary" type="button" data-action="open-planet" data-planet-id="${esc(entity.relatedPlanetIds[0])}">Открыть планету</button>` : ''}
            ${relatedSystem ? entityActionsSystemButton(relatedSystem.id) : ''}
          </div>
        </article>
      `;
    }
    if (type === 'planet') {
      const relatedSystem = relatedSystemForPlanetId(entity.id);
      return `
        <article class="article-card">
          ${renderEntityThumb(entity, 'hero')}
          <div class="eyebrow">Планета</div>
          <h3>${esc(entity.name)}</h3>
          <div class="small-note">${esc(entity.location?.obj || entity.location?.system || entity.code || '')}</div>
          <div class="info-grid" style="margin-top:14px;">
            <div class="info-card"><div class="k">Климат</div><div class="v">${esc(entity.physics?.climate || '—')}</div></div>
            <div class="info-card"><div class="k">Гравитация</div><div class="v">${esc(entity.physics?.gravity || '—')}</div></div>
            <div class="info-card"><div class="k">Население</div><div class="v">${esc(entity.socio?.pop || '—')}</div></div>
            <div class="info-card"><div class="k">Правление</div><div class="v">${esc(entity.socio?.gov || '—')}</div></div>
          </div>
          <div class="divider"></div>
          <div class="article-body"><p>${esc(entity.pilot?.reference || entity.pilot?.info || 'Карточка планеты доступна без отдельного фонового режима карты.')}</p><p>${esc(entity.pilot?.warning || '')}</p></div>
          <div class="article-toolbar">
            ${relatedSystem ? entityActionsSystemButton(relatedSystem.id) : ''}
            ${Array.isArray(entity.relatedArticleIds) && entity.relatedArticleIds[0] ? `<button class="secondary" type="button" data-action="open-article" data-article-id="${esc(entity.relatedArticleIds[0])}">Связанная статья</button>` : ''}
          </div>
        </article>
      `;
    }
    if (type === 'system') {
      const planets = (entity.planetIds || []).map(id => App.data.planets.get(id)).filter(Boolean);
      return `
        <article class="article-card">
          ${renderEntityThumb(entity, 'hero')}
          <div class="eyebrow">Система</div>
          <h3>${esc(entity.name)}</h3>
          <div class="small-note">${esc(entity.markerLabel || 'Системная карточка без тяжёлой галактической карты.')}</div>
          <div class="divider"></div>
          <div class="planet-grid">
            ${planets.map(planet => `
              <article class="planet-card">
                ${renderEntityThumb(planet)}
                <div class="eyebrow">Планета</div>
                <h3>${esc(planet.name)}</h3>
                <div class="small-note">${esc(planet.location?.obj || '')}</div>
                <div class="entity-actions"><button class="secondary" type="button" data-action="open-planet" data-planet-id="${esc(planet.id)}">Открыть</button></div>
              </article>
            `).join('') || '<div class="placeholder">В системе нет открытых планет.</div>'}
          </div>
          <div class="article-toolbar">${entityActionsSystemButton(entity.id)}</div>
        </article>
      `;
    }
    if (type === 'news' || type === 'task') {
      return `
        <article class="article-card">
          ${renderEntityThumb(entity, 'hero')}
          <div class="eyebrow">${type === 'news' ? 'Новость' : 'Задание'}</div>
          <h3>${esc(entity.title || entity.name || entity.id)}</h3>
          <div class="small-note">${esc(entity.subtitle || entity.summary || entity.status || '')}</div>
          <div class="divider"></div>
          <div class="article-body">${normalizeRichHtml(entity.body || `<p>${esc(entity.summary || 'Без дополнительного текста.')}</p>`)}</div>
        </article>
      `;
    }
    return '<div class="placeholder">Нет содержимого.</div>';
  }

  function renderArchive() {
    if (App.ui.archiveTab === 'systems') App.ui.archiveTab = 'articles';
    setTopbar('Архив', 'Список статей расположен рядом с материалом и разделён по категориям');
    const root = $('#screen-archive');
    const collections = archiveCollections();
    const rawList = sortArchiveItemsForMobile(collections[App.ui.archiveTab] || [], App.ui.archiveTab);
    const query = slugText(App.ui.archiveQuery || '');
    const activeList = query
      ? rawList.filter(item => slugText([archiveItemLabel(item), item.category, item.summary, item.subtitle, item.location?.system, item.markerLabel].filter(Boolean).join(' ')).includes(query))
      : rawList;
    let entity = activeList.find(item => item.id === App.ui.selectedArchiveId) || null;
    if (!entity && activeList[0]) {
      entity = activeList[0];
      App.ui.selectedArchiveId = entity.id;
      App.ui.selectedArchiveType = entity._type;
    }
    const isSelectedUnreadArticle = entity?._type === 'article' && !isArchiveArticleRead(entity.id);
    root.innerHTML = `
      <div class="segmented">
        <button class="chip-btn ${App.ui.archiveTab === 'articles' ? 'active' : ''}" data-action="archive-tab" data-tab="articles">Статьи</button>
        <button class="chip-btn ${App.ui.archiveTab === 'planets' ? 'active' : ''}" data-action="archive-tab" data-tab="planets">Планеты</button>
        <button class="chip-btn ${App.ui.archiveTab === 'tasks' ? 'active' : ''}" data-action="archive-tab" data-tab="tasks">Задания</button>
        <button class="chip-btn ${App.ui.archiveTab === 'news' ? 'active' : ''}" data-action="archive-tab" data-tab="news">Новости</button>
      </div>
      <div class="archive-search-row" style="margin-top:14px;">
        <input class="input" id="archive-search-input" placeholder="Поиск по текущему разделу" value="${esc(App.ui.archiveQuery || '')}" />
      </div>
      <div class="archive-split">
        <aside class="archive-sidebar">
          <div class="archive-list-title"><div class="eyebrow">Список</div><div class="small-note">Категории берутся из поля статьи «Категория».</div></div>
          <div class="archive-catalog archive-catalog-side">${groupedArchiveMarkup(activeList, entity)}</div>
        </aside>
        <div class="archive-detail-top archive-detail-pane">
          ${renderEntityBody(entity)}
        </div>
      </div>
    `;
    if (isSelectedUnreadArticle) markArchiveArticleRead(entity.id);
    root.querySelectorAll('[data-article-body] a').forEach(link => {
      link.addEventListener('click', event => {
        const href = link.getAttribute('href') || '';
        if (href.startsWith('article:')) {
          event.preventDefault();
          openArticleById(href.slice('article:'.length));
        }
      });
    });
  }

  function renderMarket() {
    const root = $('#screen-market');
    const player = currentPlayer();
    const planet = currentPlanet();
    setTopbar('Торговый терминал', 'Терминал доступен только на текущей планете персонажа и меняет только личную запись игрока');
    if (!player || !planet) {
      root.innerHTML = '<div class="placeholder market-disabled">Терминал заблокирован. У профиля нет текущей планеты.</div>';
      return;
    }
    const market = Array.isArray(planet.market) ? planet.market : [];
    root.innerHTML = `
      <div class="hero-card" style="padding:16px;">
        <div class="section-head"><div><div class="eyebrow">LOCAL TERMINAL</div><div class="section-title">${esc(planet.name)}</div></div><div class="pill">Баланс: ${formatCredits(player.credits || 0)}</div></div>
        <div class="small-note">Покупка в мобильном клиенте пишет только в строку текущего игрока в таблице <code>${esc(App.config.playerTableName)}</code>. Общий мир и снапшот кампании не перезаписываются.</div>
      </div>
      <div class="planet-grid" style="margin-top:16px;">
        ${market.map(entry => {
          const item = App.data.items.get(entry.itemId);
          if (!item) return '';
          return `
            <article class="planet-card">
              <div class="eyebrow">${esc(item.type || 'предмет')}</div>
              <h3>${esc(item.name)}</h3>
              <div class="small-note">${esc(item.desc || '')}</div>
              <div class="market-buy-row">
                <div class="price">${formatCredits(entry.price || 0)}</div>
                <button class="primary" type="button" data-action="buy-item" data-item-id="${esc(item.id)}" data-price="${Number(entry.price || 0)}">Купить</button>
              </div>
            </article>
          `;
        }).join('') || '<div class="placeholder">На этой планете нет рыночных предложений.</div>'}
      </div>
    `;
  }

  function buildThreads() {
    const player = currentPlayer();
    if (!player) return [];
    const threads = [];
    Array.from(App.data.players.values())
      .filter(other => other.id !== player.id && String(other.role || '') !== 'guest' && !isGuestSession())
      .sort((a, b) => slugText(a.displayName || a.id).localeCompare(slugText(b.displayName || b.id), 'ru'))
      .forEach(other => {
        const threadKey = [player.id, other.id].sort().join('__');
        threads.push({ key: threadKey, label: other.displayName || other.id, type: 'direct', otherId: other.id, subtitle: other.rank || 'Игрок', entity: other });
      });
    const npcPool = new Set([...(Array.isArray(currentPlanet()?.npcIds) ? currentPlanet().npcIds : []), ...(Array.isArray(player?.social?.npcIds) ? player.social.npcIds : [])]);
    Array.from(npcPool).forEach(npcId => {
      const npc = App.data.npcs.get(npcId);
      if (!npc || !npcAllowsPlayerChat(npc) || !visibleForPlayer(npc, player.id)) return;
      const threadKey = `${npc.id}__${player.id}`;
      threads.push({ key: threadKey, label: npc.name, type: 'npc', npcId: npc.id, subtitle: npc.role || 'NPC', entity: npc });
    });
    return threads;
  }

  function messagesForThread(threadKey) {
    return App.data.chatRows.filter(row => row.thread_key === threadKey && !row.deleted_at);
  }

  function renderChat() {
    setTopbar('Чат', 'Активный канал сверху, список контактов ниже; realtime и fallback-poll работают параллельно');
    const root = $('#screen-chat');
    const threads = buildThreads();
    if (!App.ui.selectedThreadKey && threads[0]) App.ui.selectedThreadKey = threads[0].key;
    const selected = threads.find(thread => thread.key === App.ui.selectedThreadKey) || threads[0] || null;
    const messages = selected ? messagesForThread(selected.key) : [];
    root.innerHTML = `
      <div class="chat-mobile-layout">
        <div class="card chat-active-card" style="padding:16px;">
          <div class="section-head">
            <div class="thread-row compact">
              ${selected ? renderEntityAvatar(selected.entity, selected.label, 'sm') : ''}
              <div><div class="section-title">${esc(selected?.label || 'Канал')}</div><div class="small-note">${esc(selected?.subtitle || '')}</div></div>
            </div>
          </div>
          <div class="message-list">
            ${messages.map(row => {
              const own = row.sender_id === App.session.userId && row.sender_type === 'player';
              const actor = messageActor(row, selected);
              return `
                <div class="chat-row ${own ? 'own' : ''}">
                  ${renderEntityAvatar(actor || {}, row.author_label || (own ? 'Ты' : selected?.label || 'Контакт'), 'sm')}
                  <div class="chat-bubble ${own ? 'own' : ''}">
                    <div class="chat-meta">${esc(row.author_label || (own ? (currentPlayer()?.displayName || 'Ты') : selected?.label || 'Контакт'))} · ${formatDate(row.created_at)}</div>
                    <div class="article-body">${normalizeRichHtml(row.body_html || '')}</div>
                  </div>
                </div>
              `;
            }).join('') || '<div class="placeholder">Сообщений ещё нет.</div>'}
          </div>
          ${selected ? `
            <form id="chat-compose-form" class="chat-compose" data-thread-key="${esc(selected.key)}">
              <textarea class="textarea" name="body" rows="4" placeholder="Написать сообщение...">${esc(App.ui.chatDrafts[selected.key] || '')}</textarea>
              <button class="primary" type="submit">Отправить</button>
            </form>
          ` : ''}
        </div>
        <div class="thread-list chat-contact-list">
          ${threads.map(thread => {
            const last = messagesForThread(thread.key).slice(-1)[0] || null;
            return `
              <article class="thread-card ${thread.key === selected?.key ? 'active' : ''}">
                <div class="thread-row">
                  ${renderEntityAvatar(thread.entity, thread.label)}
                  <div class="thread-copy">
                    <div class="eyebrow">${esc(thread.type === 'npc' ? 'NPC thread' : 'Direct thread')}</div>
                    <h3>${esc(thread.label)}</h3>
                    <div class="small-note">${esc(last ? stripHtml(last.body_html || '').slice(0, 82) : (thread.subtitle || 'Без сообщений'))}</div>
                  </div>
                </div>
                <div class="entity-actions"><button class="secondary" type="button" data-action="select-thread" data-thread-key="${esc(thread.key)}">Открыть</button></div>
              </article>
            `;
          }).join('') || '<div class="placeholder">Нет доступных каналов связи.</div>'}
        </div>
      </div>
    `;
  }

  function tokenVisibleToPlayer(token) {
    if (!token) return false;
    if (!token.hidden) return true;
    return token.ownerId === App.session.userId || token.playerId === App.session.userId;
  }

  function boardRectStyle(scene, entity) {
    const left = (Number(entity.x || 0) / Number(scene.width || 1)) * 100;
    const top = (Number(entity.y || 0) / Number(scene.height || 1)) * 100;
    const width = (Number(entity.w || 1) / Number(scene.width || 1)) * 100;
    const height = (Number(entity.h || 1) / Number(scene.height || 1)) * 100;
    return `left:${left}%;top:${top}%;width:${width}%;height:${height}%;transform:rotate(${Number(entity.rotation || 0)}deg);`;
  }

  function renderCombatSceneCard(selected, sceneRuntime, tokens, log, fullscreen = false) {
    const sceneImage = resolveMediaUrl(selected.backgroundImage || '', selected.backgroundImageStoragePath || '');
    const activeSceneId = combatRowActiveSceneId(App.data.combatRuntime);
    const isSyncedScene = !activeSceneId || activeSceneId === selected.id;
    return `
      <div class="combat-stage-shell ${fullscreen ? 'fullscreen' : ''}">
        <div class="combat-stage-head">
          <div>
            <div class="eyebrow">ACTIVE VIEW</div>
            <div class="section-title">${esc(selected.name)}</div>
            <div class="small-note">Раунд ${Number(sceneRuntime?.round || 1)}${isSyncedScene ? '' : ' · показывается последний локальный снимок этой сцены'}</div>
          </div>
          <div class="combat-head-actions">
            <div class="pill">${isSyncedScene ? 'Realtime sync' : 'Кэш сцены'}</div>
            <button class="ghost-btn mini-icon-btn" type="button" data-action="toggle-combat-fullscreen" title="${fullscreen ? 'Свернуть' : 'Развернуть'}">${fullscreen ? '🗕' : '⤢'}</button>
          </div>
        </div>
        <div class="combat-stage-grid ${fullscreen ? 'fullscreen' : ''}">
          <div class="combat-board-wrap ${fullscreen ? 'fullscreen' : ''}">
            <div class="combat-board-viewport ${fullscreen ? 'fullscreen' : ''}" data-scene-id="${esc(selected.id)}">
              <div class="combat-board" style="--board-cols:${Number(selected.width || 1)};--board-rows:${Number(selected.height || 1)};--board-ratio:${Number(selected.width || 1)} / ${Number(selected.height || 1)};--board-color:${esc(selected.backgroundColor || '#0b1420')}">
                <div class="combat-board-stage" style="${combatStageTransformStyle(selected.id)}">
                  <div class="combat-board-bg ${sceneImage ? 'with-image' : ''}" style="${sceneImage ? `background-image:url('${esc(sceneImage)}');` : ''}"></div>
                  <div class="combat-board-grid"></div>
                  <div class="combat-board-assets">
                    ${(Array.isArray(selected.assets) ? selected.assets : []).map(asset => `
                      <div class="board-asset" style="${boardRectStyle(selected, asset)};opacity:${clamp(Number(asset.opacity ?? 1), 0.1, 1)};z-index:${Number(asset.z || 10)};">
                        ${resolveMediaUrl(asset.image || '', asset.imageStoragePath || '') ? `<img src="${esc(resolveMediaUrl(asset.image || '', asset.imageStoragePath || ''))}" alt="${esc(asset.name || 'asset')}" />` : '<div class="token-glyph">□</div>'}
                      </div>
                    `).join('')}
                  </div>
                  <div class="combat-board-tokens">
                    ${tokens.map(token => `
                      <div class="board-token ${token.ownerId === App.session.userId || token.playerId === App.session.userId ? 'player-owned' : ''}" style="${boardRectStyle(selected, token)};background:${esc(token.color || '#1a2334')};">
                        ${resolveMediaUrl(token.image || '', token.imageStoragePath || '') ? `<img src="${esc(resolveMediaUrl(token.image || '', token.imageStoragePath || ''))}" alt="${esc(token.name || 'token')}" />` : `<div class="token-glyph">${esc(initials(token.name || token.id))}</div>`}
                        <div class="token-label">${esc(token.name)} · ${Number(token.hpCurrent ?? token.hpMax ?? 0)}/${Number(token.hpMax || token.hpCurrent || 0)}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <aside class="combat-log-side ${fullscreen ? 'fullscreen' : ''}">
            <div class="eyebrow">Журнал боя</div>
            <div class="log-list compact">
              ${log.slice(0, fullscreen ? 60 : 16).map(entry => `
                <div class="log-entry ${entry.kind === 'dice' ? 'dice' : ''}">
                  <div class="chat-meta">${formatDate(entry.createdAt || entry.created_at)}${entry.by ? ` · ${esc(entry.by)}` : ''}</div>
                  <div>${esc(entry.text || 'Боевой журнал')}</div>
                </div>
              `).join('') || '<div class="placeholder">Журнал боя пуст.</div>'}
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  function renderCombat() {
    setTopbar('Боевые сцены', 'Fullscreen-поле с pinch/drag камерой и компактным полупрозрачным журналом');
    const root = $('#screen-combat');
    const scenes = App.data.combatScenes || [];
    const activeSceneId = combatRowActiveSceneId(App.data.combatRuntime);
    if (!App.ui.selectedCombatSceneId && (activeSceneId || scenes[0])) App.ui.selectedCombatSceneId = activeSceneId || scenes[0].id;
    const selected = scenes.find(scene => scene.id === App.ui.selectedCombatSceneId) || scenes.find(scene => scene.id === activeSceneId) || scenes[0] || null;
    const sceneRuntime = selected ? getCombatSceneRuntime(selected.id) : null;
    const tokens = Array.isArray(sceneRuntime?.tokens) ? sceneRuntime.tokens.filter(tokenVisibleToPlayer) : [];
    const log = Array.isArray(sceneRuntime?.log) ? [...sceneRuntime.log].sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0)) : [];
    document.body.classList.toggle('combat-modal-open', !!App.ui.combatFullscreen && !!selected);
    root.innerHTML = `
      <div class="combat-scene-list">
        ${scenes.map(scene => `
          <article class="combat-card ${scene.id === selected?.id ? 'active' : ''}">
            <div class="eyebrow">Сцена</div>
            <h3>${esc(scene.name)}</h3>
            <div class="small-note">Поле ${Number(scene.width || 0)} × ${Number(scene.height || 0)} · ${scene.fogEnabled ? 'Туман включён' : 'Без тумана'}</div>
            <div class="entity-actions">
              <button class="secondary" type="button" data-action="select-combat-scene" data-scene-id="${esc(scene.id)}">Открыть</button>
              <button class="ghost-btn mini-icon-btn" type="button" data-action="open-combat-fullscreen" data-scene-id="${esc(scene.id)}" title="Развернуть">⤢</button>
            </div>
          </article>
        `).join('') || '<div class="placeholder">Боевых сцен пока нет.</div>'}
      </div>
      ${selected ? `
        <div class="card" style="padding:16px; margin-top:16px;">
          ${renderCombatSceneCard(selected, sceneRuntime, tokens, log, false)}
        </div>
        ${App.ui.combatFullscreen ? `<div class="combat-fullscreen">${renderCombatSceneCard(selected, sceneRuntime, tokens, log, true)}</div>` : ''}
      ` : ''}
    `;
    requestAnimationFrame(initCombatViewports);
  }

  const ABILITY_LABELS = { strength: 'Сила', dexterity: 'Ловкость', intelligence: 'Интеллект', endurance: 'Выносливость', will: 'Воля', glory: 'Слава' };

  function skillIdArray(value) {
    return Array.from(new Set((Array.isArray(value) ? value : []).map(entry => String(entry?.id || entry || '').trim()).filter(Boolean)));
  }

  function isSpecialization(skill = {}) {
    return String(skill.skillType || skill.type || '').toLowerCase() === 'specialization';
  }

  function visibleSkills() {
    return Array.from(App.data.skills.values()).filter(skill => visibleForPlayer(skill, App.session?.userId));
  }

  function playerOwnsSkill(player, skill) {
    if (!player || !skill?.id) return false;
    if (isSpecialization(skill)) return Number(player.specializations?.[skill.id] || 0) > 0;
    return skillIdArray(player.skills).includes(String(skill.id));
  }

  function skillDependsOnGloryV58(skill, stack = new Set()) {
    if (!skill) return false;
    if ((Array.isArray(skill.requiredAbilities) ? skill.requiredAbilities : []).some(req => String(req.key || req.ability || '') === 'glory')) return true;
    const id = String(skill.id || '');
    if (id && stack.has(id)) return false;
    if (id) stack.add(id);
    for (const reqId of skillIdArray(skill.requiredSkillIds || skill.requiredSkills)) {
      const reqSkill = App.data.skills.get(reqId);
      if (reqSkill && skillDependsOnGloryV58(reqSkill, stack)) return true;
    }
    return false;
  }

  function skillRequirementReasons(player, skill) {
    const reasons = [];
    if (!player || !skill) return ['Профиль не выбран'];
    if (playerOwnsSkill(player, skill)) return [];
    if (skillDependsOnGloryV58(skill)) return ['Выдаёт ДМ: ветка Славы'];
    const cost = Math.max(0, Number(skill.cost || 1));
    if (Number(player.skillPoints || 0) < cost) reasons.push(`Нужно очков: ${cost}`);
    const reqAbilities = Array.isArray(skill.requiredAbilities) ? skill.requiredAbilities : [];
    reqAbilities.forEach(req => {
      const key = String(req.key || '').trim();
      const need = Number(req.value || 0);
      if (key && need > 0 && Number(player.abilities?.[key] || 0) < need) reasons.push(`${ABILITY_LABELS[key] || key} ≥ ${need}`);
    });
    skillIdArray(skill.requiredSkillIds || skill.requiredSkills).forEach(reqId => {
      const reqSkill = App.data.skills.get(reqId);
      if (reqSkill && isSpecialization(reqSkill)) {
        if (Number(player.specializations?.[reqId] || 0) <= 0) reasons.push(reqSkill.name || reqId);
      } else if (!skillIdArray(player.skills).includes(reqId)) reasons.push(reqSkill?.name || reqId);
    });
    return reasons;
  }

  function applySkillSpecializationIncreases(values = {}, skill = {}) {
    const next = { ...(values || {}) };
    skillIdArray(skill.specializationIncreases || skill.increaseSpecializationIds || []).forEach(id => {
      next[id] = Number(next[id] || 0) + 1;
    });
    return next;
  }

  async function upgradeSkill(skillId) {
    const skill = App.data.skills.get(skillId);
    if (!skill) return notify('Навык не найден', 'err');
    const player = currentPlayer();
    if (isGuestSession()) return notify('Гость не может менять профиль', 'warn');
    const reasons = skillRequirementReasons(player, skill);
    if (reasons.length) return notify(`Требования не выполнены: ${reasons.join(', ')}`, 'warn');
    const cost = Math.max(0, Number(skill.cost || 1));
    if (!confirm(`Вы уверены что хотите взять «${skill.name || skill.id}» за ${cost} очк.?`)) return;
    await commitPlayerMutation(next => {
      next.skillPoints = Math.max(0, Number(next.skillPoints || 0) - cost);
      next.skills = skillIdArray(next.skills);
      next.specializations = { ...(next.specializations || {}) };
      if (isSpecialization(skill)) next.specializations[skill.id] = Math.max(1, Number(next.specializations[skill.id] || 0) + 1);
      else if (!next.skills.includes(skill.id)) next.skills.push(skill.id);
      next.specializations = applySkillSpecializationIncreases(next.specializations, skill);
    }, 'Навык обновлён');
  }

  /* Web skill tree — mirrors the desktop app's tidy tree: ability roots on row 0,
     compact skill nodes, solid primary edges only. Node positions come from the
     skill's persisted treePos (committed by the app's АВТО-СОРТИРОВКА) when
     present; otherwise the same tidy-forest layout is computed locally. */
  const ABILITY_MODEL_WEB = [
    { key: 'strength', label: 'Сила', short: 'СИЛ' },
    { key: 'dexterity', label: 'Ловкость', short: 'ЛОВ' },
    { key: 'intelligence', label: 'Интеллект', short: 'ИНТ' },
    { key: 'endurance', label: 'Выносливость', short: 'ВЫН' },
    { key: 'will', label: 'Воля', short: 'ВОЛ' },
    { key: 'glory', label: 'Слава', short: 'СЛА' }
  ];
  const ABILITY_MAX_WEB = 5;
  const TREE_NODE_W = 164, TREE_ABILITY_W = 170, TREE_SKILL_H = 84, TREE_ABILITY_H = 88;
  const TREE_X_GAP = 42, TREE_ROW_GAP = 128, TREE_PAD_X = 34, TREE_PAD_TOP = 18;

  function clampWebSkillZoom(value) {
    return Math.min(2.4, Math.max(0.45, Number(value || 1) || 1));
  }

  function skillTreePosWeb(skill) {
    const raw = skill?.treePos || skill?.layout || skill?.position || skill?.pos;
    const x = Number(raw?.x);
    const y = Number(raw?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) };
  }

  function skillFallbackAbilityWeb(skill) {
    const s = String(skill.category || skill.id || '');
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ABILITY_MODEL_WEB[h % 5].key; // never glory as a fallback root
  }

  function buildWebSkillTreeLayout(player) {
    const skills = visibleSkills();
    const byId = new Map(skills.map(s => [String(s.id), s]));
    const parentOf = new Map();
    skills.forEach(skill => {
      const id = String(skill.id);
      let parent = '';
      for (const reqId of skillIdArray(skill.requiredSkillIds || skill.requiredSkills)) {
        if (reqId !== id && byId.has(reqId)) { parent = `skill:${reqId}`; break; }
      }
      if (!parent) {
        const reqAb = (Array.isArray(skill.requiredAbilities) ? skill.requiredAbilities : []).find(req => ABILITY_LABELS[String(req.key || '').trim()]);
        parent = `ability:${reqAb ? String(reqAb.key).trim() : skillFallbackAbilityWeb(skill)}`;
      }
      parentOf.set(id, parent);
    });
    // break dependency cycles: reroute to a fallback ability root
    skills.forEach(skill => {
      const id = String(skill.id);
      const seen = new Set([id]);
      let cursor = parentOf.get(id);
      while (cursor && cursor.startsWith('skill:')) {
        const pid = cursor.slice(6);
        if (seen.has(pid)) { parentOf.set(id, `ability:${skillFallbackAbilityWeb(skill)}`); break; }
        seen.add(pid);
        cursor = parentOf.get(pid);
      }
    });
    const rowMemo = new Map();
    const rowOf = id => {
      if (rowMemo.has(id)) return rowMemo.get(id);
      rowMemo.set(id, 1);
      const parent = parentOf.get(id) || '';
      const row = parent.startsWith('skill:') ? rowOf(parent.slice(6)) + 1 : 1;
      rowMemo.set(id, row);
      return row;
    };
    const children = new Map();
    skills.forEach(skill => {
      const parent = parentOf.get(String(skill.id));
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(`skill:${skill.id}`);
    });
    for (const list of children.values()) {
      list.sort((a, b) => {
        const as = byId.get(a.slice(6)) || {}, bs = byId.get(b.slice(6)) || {};
        return String(as.category || '').localeCompare(String(bs.category || ''), 'ru')
          || String(as.name || '').localeCompare(String(bs.name || ''), 'ru')
          || String(as.id || '').localeCompare(String(bs.id || ''), 'ru');
      });
    }
    const col = new Map();
    let nextCol = 0;
    const assignCols = (nodeId, stack = new Set()) => {
      if (col.has(nodeId)) return col.get(nodeId);
      if (stack.has(nodeId)) { const c = nextCol; nextCol += 1; col.set(nodeId, c); return c; }
      stack.add(nodeId);
      const kids = children.get(nodeId) || [];
      let c;
      if (!kids.length) { c = nextCol; nextCol += 1; }
      else {
        const kidCols = kids.map(kid => assignCols(kid, stack));
        c = (kidCols[0] + kidCols[kidCols.length - 1]) / 2;
      }
      stack.delete(nodeId);
      col.set(nodeId, c);
      return c;
    };
    ABILITY_MODEL_WEB.forEach(item => { assignCols(`ability:${item.key}`); nextCol += 1; });
    skills.forEach(skill => { const nodeId = `skill:${skill.id}`; if (!col.has(nodeId)) assignCols(nodeId); });
    const positions = new Map();
    const COL_STEP = TREE_NODE_W + TREE_X_GAP;
    col.forEach((c, nodeId) => {
      const ability = nodeId.startsWith('ability:');
      const w = ability ? TREE_ABILITY_W : TREE_NODE_W;
      const h = ability ? TREE_ABILITY_H : TREE_SKILL_H;
      const row = ability ? 0 : rowOf(nodeId.slice(6));
      positions.set(nodeId, { x: Math.round(TREE_PAD_X + c * COL_STEP + TREE_NODE_W / 2 - w / 2), y: TREE_PAD_TOP + row * TREE_ROW_GAP, w, h });
    });
    // persisted positions from the desktop app win and are immutable here:
    // the web must show exactly the layout the GM set in the app
    skills.forEach(skill => {
      const manual = skillTreePosWeb(skill);
      if (!manual) return;
      const nodeId = `skill:${skill.id}`;
      const current = positions.get(nodeId) || { w: TREE_NODE_W, h: TREE_SKILL_H };
      positions.set(nodeId, { ...current, x: manual.x, y: manual.y, manual: true });
    });
    // De-overlap sweep: locally computed fallback positions can collide with the
    // desktop treePos layout. Only auto-positioned nodes are moved — nodes with
    // app-set positions never shift.
    {
      const nodes = Array.from(positions.entries()).filter(([id]) => id.startsWith('skill:')).map(([, p]) => p);
      for (let pass = 0; pass < 6; pass += 1) {
        nodes.sort((a, b) => a.x - b.x || a.y - b.y);
        let moved = false;
        for (let i = 0; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const a = nodes[i], b = nodes[j];
            const overY = b.y < a.y + a.h - 6 && a.y < b.y + b.h - 6;
            const overX = b.x < a.x + a.w + 10 && a.x < b.x + b.w + 10;
            if (!overY || !overX) continue;
            if (!b.manual) { b.x = a.x + a.w + 14; moved = true; }
            else if (!a.manual) { a.x = b.x + b.w + 14; moved = true; }
            // both manual: GM's layout is preserved as-is
          }
        }
        if (!moved) break;
      }
    }
    // centre ability headers over their actual branch
    ABILITY_MODEL_WEB.forEach(item => {
      const abilityId = `ability:${item.key}`;
      const centers = (children.get(abilityId) || []).map(kid => { const p = positions.get(kid); return p ? p.x + p.w / 2 : null; }).filter(v => v != null);
      if (!centers.length) return;
      const mid = (Math.min(...centers) + Math.max(...centers)) / 2;
      const current = positions.get(abilityId);
      if (current) positions.set(abilityId, { ...current, x: Math.round(mid - current.w / 2) });
    });
    // Ability headers must never overlap each other: branches laid out with the
    // desktop treePos can interleave horizontally, so two headers may re-centre
    // onto almost the same x. Sweep row 0 left-to-right enforcing a minimum gap.
    {
      const heads = ABILITY_MODEL_WEB.map(item => positions.get(`ability:${item.key}`)).filter(Boolean).sort((a, b) => a.x - b.x);
      for (let i = 1; i < heads.length; i += 1) {
        const prev = heads[i - 1];
        const head = heads[i];
        if (head.x < prev.x + prev.w + 24) head.x = prev.x + prev.w + 24;
      }
    }
    const edges = skills.map(skill => ({ from: parentOf.get(String(skill.id)), to: `skill:${skill.id}` }));
    const all = Array.from(positions.values());
    const canvasW = Math.max(920, ...all.map(p => p.x + p.w)) + TREE_PAD_X;
    const canvasH = Math.max(420, ...all.map(p => p.y + p.h)) + 60;
    return { skills, positions, edges, canvasW, canvasH };
  }

  function webSkillNodeMarkup(player, skill, layout) {
    const pos = layout.positions.get(`skill:${skill.id}`);
    if (!pos) return '';
    const owned = playerOwnsSkill(player, skill);
    const reasons = owned ? [] : skillRequirementReasons(player, skill);
    const state = owned ? 'owned' : reasons.length ? 'locked' : 'available';
    const spec = isSpecialization(skill);
    const specValue = spec ? Number(player.specializations?.[skill.id] || 0) : 0;
    const image = mediaFromEntity(skill);
    const thumb = image ? `<span class="web-skill-thumb"><img src="${esc(image)}" alt="" /></span>` : `<span class="web-skill-thumb">${esc(initials(skill.name || skill.id))}</span>`;
    const action = !owned && !reasons.length && !isGuestSession()
      ? `<button class="web-skill-learn" type="button" data-action="upgrade-skill" data-skill-id="${esc(skill.id)}">ПРОКАЧАТЬ</button>`
      : `<span class="web-skill-state">${owned ? (spec ? `УР. ${specValue}` : 'ИЗУЧЕНО') : 'ЗАКРЫТО'}</span>`;
    return `<div class="web-skill-node ${state} ${spec ? 'spec' : ''}" data-skill-node="${esc(skill.id)}" style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;">
      ${thumb}
      <span class="web-skill-main"><b>${esc(skill.name || skill.id)}</b>${spec ? '<i>специализация</i>' : ''}${action}</span>
    </div>`;
  }

  function webAbilityNodeMarkup(player, item, layout) {
    const pos = layout.positions.get(`ability:${item.key}`);
    if (!pos) return '';
    const value = Number(player.abilities?.[item.key] || 0);
    const points = Number(player.skillPoints || 0);
    const isGlory = item.key === 'glory';
    const canRaise = !isGlory && value < ABILITY_MAX_WEB && points > 0 && !isGuestSession();
    const button = canRaise
      ? `<button class="web-skill-learn" type="button" data-action="upgrade-ability" data-ability-key="${esc(item.key)}">+1</button>`
      : `<span class="web-skill-state">${isGlory ? 'ДМ' : value >= ABILITY_MAX_WEB ? 'МАКС' : 'НЕТ ОЧКОВ'}</span>`;
    return `<div class="web-skill-node web-ability-node" style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;">
      <span class="web-skill-thumb ability">${esc(item.short)}</span>
      <span class="web-skill-main"><b>${esc(item.label)}</b><i>${value} / ${ABILITY_MAX_WEB}</i>${button}</span>
    </div>`;
  }

  function renderWebSkillTree(player) {
    const layout = buildWebSkillTreeLayout(player);
    const zoom = clampWebSkillZoom(App.ui.skillZoom);
    const edges = layout.edges.map(edge => {
      const from = layout.positions.get(edge.from);
      const to = layout.positions.get(edge.to);
      if (!from || !to) return '';
      const kind = String(edge.from || '').startsWith('ability:') ? 'ability' : 'primary';
      return `<line class="web-skill-edge ${kind}" x1="${(from.x + from.w / 2).toFixed(1)}" y1="${(from.y + from.h).toFixed(1)}" x2="${(to.x + to.w / 2).toFixed(1)}" y2="${to.y.toFixed(1)}" />`;
    }).join('');
    return `<div class="web-skill-toolbar">
        <div class="pill">Очки улучшения: ${Number(player.skillPoints || 0)}</div>
        <div class="web-skill-zoom">
          <button class="ghost-btn mini-btn" type="button" data-action="skill-zoom" data-zoom="out">−</button>
          <span class="pill">${Math.round(zoom * 100)}%</span>
          <button class="ghost-btn mini-btn" type="button" data-action="skill-zoom" data-zoom="in">＋</button>
          <button class="ghost-btn mini-btn" type="button" data-action="skill-zoom" data-zoom="reset">100%</button>
        </div>
      </div>
      <div class="web-skill-tree-scroll">
        <div class="web-skill-tree-canvas" style="width:${Math.round(layout.canvasW * zoom)}px;height:${Math.round(layout.canvasH * zoom)}px;">
          <div class="web-skill-tree-inner" style="width:${layout.canvasW}px;height:${layout.canvasH}px;transform:scale(${zoom.toFixed(3)});">
            <svg class="web-skill-lines" width="${layout.canvasW}" height="${layout.canvasH}" viewBox="0 0 ${layout.canvasW} ${layout.canvasH}" aria-hidden="true">${edges}</svg>
            ${ABILITY_MODEL_WEB.map(item => webAbilityNodeMarkup(player, item, layout)).join('')}
            ${layout.skills.map(skill => webSkillNodeMarkup(player, skill, layout)).join('')}
          </div>
        </div>
      </div>`;
  }

  function hideWebSkillTipEl() {
    document.getElementById('web-skill-tip')?.remove();
  }

  function showWebSkillTip(node, skillId) {
    hideWebSkillTipEl();
    const skill = App.data.skills.get(skillId);
    const player = currentPlayer();
    if (!skill || !player) return;
    const owned = playerOwnsSkill(player, skill);
    const reasons = owned ? [] : skillRequirementReasons(player, skill);
    const spec = isSpecialization(skill);
    const specValue = spec ? Number(player.specializations?.[skill.id] || 0) : 0;
    const tip = document.createElement('div');
    tip.id = 'web-skill-tip';
    tip.className = 'web-skill-tip';
    tip.innerHTML = `
      <div class="web-skill-tip-head"><b>${esc(skill.name || skill.id)}</b><span>${spec ? `Специализация${specValue ? ` · ур. ${specValue}` : ''}` : 'Навык'}</span></div>
      ${skill.category ? `<div class="web-skill-tip-cat">${esc(skill.category)}</div>` : ''}
      ${skill.description ? `<div class="web-skill-tip-desc">${esc(skill.description)}</div>` : '<div class="web-skill-tip-desc muted">Описание не задано.</div>'}
      <div class="web-skill-tip-meta">
        <span class="pill">Стоимость: ${Number(skill.cost || 1)}</span>
        ${owned ? '<span class="pill ok">Изучено</span>' : reasons.length ? `<span class="pill warn">Требуется: ${esc(reasons.join(', '))}</span>` : '<span class="pill ok">Доступно</span>'}
      </div>`;
    document.body.appendChild(tip);
    const rect = node.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - tipRect.width - 10));
    let top = rect.bottom + 10;
    if (top + tipRect.height > window.innerHeight - 10) top = rect.top - tipRect.height - 10;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(Math.max(10, top))}px`;
  }

  function bindWebSkillTreeInteractions(root) {
    const scroll = root.querySelector('.web-skill-tree-scroll');
    if (!scroll) return;
    // restore the view the player had before the re-render (realtime refreshes
    // were resetting the tree to the top-left corner)
    if (App.ui.skillScroll) {
      scroll.scrollLeft = Number(App.ui.skillScroll.left || 0);
      scroll.scrollTop = Number(App.ui.skillScroll.top || 0);
    }
    scroll.addEventListener('scroll', () => {
      App.ui.skillScroll = { left: scroll.scrollLeft, top: scroll.scrollTop };
      hideWebSkillTipEl();
    }, { passive: true });
    // drag-to-pan with the mouse (touch keeps native scrolling)
    let pan = null;
    scroll.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.pointerType !== 'mouse') return;
      if (event.target.closest('button')) return;
      pan = { x: event.clientX, y: event.clientY, left: scroll.scrollLeft, top: scroll.scrollTop, moved: false };
      try { scroll.setPointerCapture(event.pointerId); } catch {}
    });
    scroll.addEventListener('pointermove', event => {
      if (!pan) return;
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { pan.moved = true; scroll.classList.add('is-panning'); hideWebSkillTipEl(); }
      scroll.scrollLeft = pan.left - dx;
      scroll.scrollTop = pan.top - dy;
    });
    const endPan = event => {
      if (!pan) return;
      try { scroll.releasePointerCapture(event.pointerId); } catch {}
      pan = null;
      scroll.classList.remove('is-panning');
    };
    scroll.addEventListener('pointerup', endPan);
    scroll.addEventListener('pointercancel', endPan);
    // rich hover tooltip with the skill description
    scroll.addEventListener('mouseover', event => {
      const node = event.target.closest('[data-skill-node]');
      if (!node || pan) return;
      showWebSkillTip(node, node.dataset.skillNode);
    });
    scroll.addEventListener('mouseout', event => {
      const node = event.target.closest('[data-skill-node]');
      if (node && !node.contains(event.relatedTarget)) hideWebSkillTipEl();
    });
  }

  async function upgradeAbility(abilityKey) {
    if (!ABILITY_LABELS[abilityKey]) return;
    if (isGuestSession()) return notify('Гость не может менять профиль', 'warn');
    const player = currentPlayer();
    if (!player) return;
    if (abilityKey === 'glory') return notify('Славу выдаёт ДМ', 'warn');
    const value = Number(player.abilities?.[abilityKey] || 0);
    if (value >= ABILITY_MAX_WEB) return notify(`${ABILITY_LABELS[abilityKey]} уже на максимуме ${ABILITY_MAX_WEB}`, 'info');
    if (Number(player.skillPoints || 0) < 1) return notify('Не хватает очков улучшения', 'warn');
    if (!confirm(`Улучшить «${ABILITY_LABELS[abilityKey]}» до ${Math.min(ABILITY_MAX_WEB, value + 1)} за 1 очко улучшения?`)) return;
    await commitPlayerMutation(next => {
      next.abilities = { ...(next.abilities || {}) };
      next.abilities[abilityKey] = Math.min(ABILITY_MAX_WEB, Number(next.abilities[abilityKey] || 0) + 1);
      next.skillPoints = Math.max(0, Number(next.skillPoints || 0) - 1);
    }, 'Характеристика улучшена');
  }

  function reputationRows(player) {
    const currentRows = Array.isArray(player?.social?.reputation) ? player.social.reputation : [];
    const legacy = Array.isArray(player?.social?.orgs) ? player.social.orgs : [];
    const byId = new Map();
    currentRows.forEach(row => { if (row?.orgId || row?.id) byId.set(String(row.orgId || row.id), row); });
    legacy.forEach(row => { if (row?.orgId || row?.id) byId.set(String(row.orgId || row.id), row); });
    return Array.from(App.data.factions.values()).filter(faction => visibleForPlayer(faction, App.session?.userId)).map(faction => {
      const row = byId.get(String(faction.id)) || {};
      return { faction, value: Number(row.value ?? row.score ?? row.reputation ?? 0), label: row.label || row.status || '' };
    });
  }

  function renderMobileReputation(player) {
    const rows = reputationRows(player);
    if (!rows.length) return '';
    return `<div class="section-head" style="margin-top:18px"><div class="section-title">Репутация</div></div><div class="card-list reputation-mobile-list">${rows.map(({ faction, value, label }) => `<article class="entity-card">
      ${renderEntityThumb(faction)}<div class="eyebrow">${esc(faction.type || 'Организация')}</div><h3>${esc(faction.name || faction.id)}</h3><div class="small-note">${esc(faction.description || faction.influence || '')}</div><div class="pill-row" style="margin-top:10px"><div class="pill">Репутация: ${value}</div>${label ? `<div class="pill">${esc(label)}</div>` : ''}</div>
    </article>`).join('')}</div>`;
  }

  function renderProfile() {
    const root = $('#screen-profile');
    const player = currentPlayer();
    const planet = currentPlanet();
    const row = App.data.playerRows.get(player?.id || '');
    if (!player) {
      setTopbar('Профиль', 'Личные данные игрока, экипировка, импланты и состояние синхронизации');
      root.innerHTML = '<div class="placeholder">Профиль не выбран.</div>';
      return;
    }
    const profileTab = App.ui.profileTab === 'skills' ? 'skills' : 'main';
    const tabsRow = `<div class="segmented profile-tabs-web">
      <button class="chip-btn ${profileTab === 'main' ? 'active' : ''}" type="button" data-action="profile-tab" data-tab="main">Профиль</button>
      <button class="chip-btn ${profileTab === 'skills' ? 'active' : ''}" type="button" data-action="profile-tab" data-tab="skills">Навыки · ${Number(player.skillPoints || 0)} очк.</button>
    </div>`;
    if (profileTab === 'skills') {
      setTopbar('Навыки', 'Древо навыков и характеристик — как в настольном интерфейсе');
      hideWebSkillTipEl();
      root.innerHTML = `${tabsRow}${renderWebSkillTree(player)}`;
      bindWebSkillTreeInteractions(root);
      return;
    }
    hideWebSkillTipEl();
    setTopbar('Профиль', 'Личные данные игрока, экипировка, импланты и состояние синхронизации');
    const stats = player.stats || {};
    const inventory = Array.isArray(player.inventory) ? player.inventory : [];
    const equipmentSlots = player.equipmentSlots || {};
    const equippedCards = Object.entries(equipmentSlots).filter(([, itemId]) => itemId).map(([slot, itemId]) => ({ slot, item: App.data.items.get(itemId) || { id: itemId, name: itemId, desc: '' } }));
    root.innerHTML = `
      ${tabsRow}
      <div class="profile-card" style="padding:16px;">
        <div class="profile-hero">
          ${renderAvatar(player)}
          <div>
            <div class="eyebrow">PLAYER PROFILE</div>
            <h3>${esc(player.displayName || player.id)}</h3>
            <div class="small-note">${esc(player.rank || player.role || 'Игрок')} · версия строки ${Number(row?.version || 0)}</div>
          </div>
        </div>
        <div class="profile-toolbar">
          <button class="ghost-btn mini-btn" type="button" data-action="profile-refresh">Обновить</button>
          <button class="ghost-btn mini-btn" type="button" data-action="profile-logout">Выйти из профиля</button>
          ${RUNTIME.cloudOnly ? '<button class="ghost-btn mini-btn danger" type="button" data-action="profile-forget-device">Забыть устройство</button>' : ''}
        </div>
        <div class="stat-grid">
          <div class="stat"><div class="data-label">HP</div><div class="data-value">${Number(stats.hpCurrent || 0)} / ${Number(stats.hpMax || 0)}</div></div>
          <div class="stat"><div class="data-label">Shield</div><div class="data-value">${Number(stats.shieldCurrent || 0)} / ${Number(stats.shieldMax || 0)}</div></div>
          <div class="stat"><div class="data-label">Energy</div><div class="data-value">${Number(stats.energyCurrent || 0)} / ${Number(stats.energyMax || 0)}</div></div>
          <div class="stat"><div class="data-label">Credits</div><div class="data-value">${formatCredits(player.credits || 0)}</div></div>
        </div>
        <div class="divider"></div>
        <div class="info-grid">
          <div class="info-card"><div class="k">Текущая планета</div><div class="v">${esc(planet?.name || 'Не задана')}</div></div>
          <div class="info-card"><div class="k">Последнее обновление</div><div class="v">${esc(row?.updated_at ? formatDate(row.updated_at) : 'Локальный fallback')}</div></div>
          <div class="info-card"><div class="k">Роль</div><div class="v">${esc(player.rank || player.role || 'Игрок')}</div></div>
          <div class="info-card"><div class="k">Локация</div><div class="v">${esc(currentSystem()?.name || 'Система не задана')}</div></div>
        </div>
        ${(player.lore || player.notes) ? `<div class="divider"></div><div class="article-body"><p>${esc(player.lore || '')}</p><p>${esc(player.notes || '')}</p></div>` : ''}
      </div>
      <div class="section-head" style="margin-top:18px"><div class="section-title">Текущее снаряжение</div></div>
      <div class="inventory-list">
        ${equippedCards.map(({ slot, item }) => `
          <article class="entity-card">
            ${renderEntityThumb(item)}
            <div class="eyebrow">${esc(equipmentLabel(slot))}</div>
            <h3>${esc(item.name)}</h3>
            <div class="small-note">${esc(item.desc || item.rarity || '')}</div>
            <div class="pill-row" style="margin-top:12px;">
              ${item.damage ? `<div class="pill">Урон: ${esc(item.damage)}</div>` : ''}
              ${item.weaponSlot ? `<div class="pill">Слот: ${esc(item.weaponSlot)}</div>` : ''}
              ${item.rarity ? `<div class="pill">${esc(item.rarity)}</div>` : ''}
            </div>
          </article>
        `).join('') || '<div class="placeholder">Снаряжение не задано.</div>'}
      </div>
      <div class="section-head" style="margin-top:18px"><div class="section-title">Инвентарь</div></div>
      <div class="inventory-list">
        ${inventory.map(entry => {
          const item = App.data.items.get(entry.itemId) || { name: entry.itemId, desc: '' };
          return `
            <article class="entity-card">
              ${renderEntityThumb(item)}
              <div class="eyebrow">${esc(item.type || 'предмет')}</div>
              <h3>${esc(item.name)}</h3>
              <div class="small-note">${esc(item.desc || '')}</div>
              <div class="pill-row" style="margin-top:12px;"><div class="pill">Количество: ${Number(entry.qty || 0)}</div></div>
            </article>
          `;
        }).join('') || '<div class="placeholder">Инвентарь пуст.</div>'}
      </div>
      ${(Array.isArray(player.implants) && player.implants.length) ? `
        <div class="section-head" style="margin-top:18px"><div class="section-title">Импланты</div></div>
        <div class="card-list">
          ${player.implants.map(implant => `<article class="entity-card"><div class="eyebrow">Имплант</div><h3>${esc(implant.name || 'Имплант')}</h3><div class="small-note">${esc(implant.desc || '')}</div></article>`).join('')}
        </div>
      ` : ''}
      ${(player.abilities && Object.keys(player.abilities).length) ? `
        <div class="section-head" style="margin-top:18px"><div class="section-title">Характеристики</div></div>
        <div class="stat-grid">
          ${Object.entries(player.abilities).map(([key, value]) => `<div class="stat"><div class="data-label">${esc(ABILITY_LABELS[key] || key)}</div><div class="data-value">${esc(value)}</div></div>`).join('')}
        </div>
      ` : ''}
      ${(player.specializations && Object.keys(player.specializations).length) ? `
        <div class="section-head" style="margin-top:18px"><div class="section-title">Специализации</div></div>
        <div class="stat-grid spec-grid-mobile">
          ${Object.entries(player.specializations).filter(([, value]) => Number(value || 0) > 0).map(([key, value]) => `<div class="stat"><div class="data-label">${esc(App.data.skills.get(key)?.name || key)}</div><div class="data-value">${Number(value || 0)}</div></div>`).join('')}
        </div>
      ` : ''}
      ${renderMobileReputation(player)}
    `;
  }

  function renderCurrentScreen() {
    if (RUNTIME.hideCombat && App.ui.screen === 'combat') App.ui.screen = 'home';
    if (App.ui.screen !== 'combat') document.body.classList.remove('combat-modal-open');
    $$('.screen').forEach(node => node.classList.remove('active'));
    $(`#screen-${App.ui.screen}`)?.classList.add('active');
    $$('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === App.ui.screen));
    if (App.ui.screen === 'home') renderHome();
    if (App.ui.screen === 'archive') renderArchive();
    if (App.ui.screen === 'market') renderMarket();
    if (App.ui.screen === 'chat') renderChat();
    if (App.ui.screen === 'combat' && !RUNTIME.hideCombat) renderCombat();
    if (App.ui.screen === 'profile') renderProfile();
  }

  function openArticleById(articleId) {
    if (!App.data.articles.has(articleId)) {
      notify('Статья не найдена в локальном архиве', 'warn');
      return;
    }
    App.ui.archiveTab = 'articles';
    App.ui.selectedArchiveId = articleId;
    App.ui.selectedArchiveType = 'article';
    App.ui.screen = 'archive';
    renderCurrentScreen();
  }

  function focusSystem(systemId) {
    App.ui.focusedSystemId = systemId;
    App.ui.screen = 'home';
    renderCurrentScreen();
  }

  function openPlanet(planetId) {
    if (!App.data.planets.has(planetId)) return notify('Планета не найдена', 'warn');
    App.ui.archiveTab = 'planets';
    App.ui.selectedArchiveId = planetId;
    App.ui.selectedArchiveType = 'planet';
    App.ui.screen = 'archive';
    renderCurrentScreen();
  }

  function openSystem(systemId) {
    const system = App.data.systems.find(item => item.id === systemId);
    if (!system) return notify('Система не найдена', 'warn');
    App.ui.focusedSystemId = systemId;
    App.ui.screen = 'home';
    renderCurrentScreen();
  }

  async function safeRefresh(options = {}) {
    try {
      await pullEverything({ silent: true, render: !options.deferRender });
      if (!options.deferRender) {
        renderLogin();
        renderAffectedScreens({ snapshot: true, players: true, chat: true, combat: true });
      }
      notify('Данные кампании обновлены', 'ok');
    } catch (error) {
      notify(`Не удалось обновить данные: ${error.message}`, 'err');
    }
  }



  function scheduleRealtimeRefresh(kinds = {}) {
    App.realtime.pending.players = App.realtime.pending.players || !!kinds.players;
    App.realtime.pending.chat = App.realtime.pending.chat || !!kinds.chat;
    App.realtime.pending.combat = App.realtime.pending.combat || !!kinds.combat;
    App.realtime.pending.snapshot = App.realtime.pending.snapshot || !!kinds.snapshot;
    if (App.realtime.flushTimer) return;
    App.realtime.flushTimer = setTimeout(async () => {
      App.realtime.flushTimer = null;
      const pending = { ...App.realtime.pending };
      App.realtime.pending = { players: false, chat: false, combat: false, snapshot: false };
      try {
        if (pending.snapshot) {
          await pullEverything({ silent: true, render: true });
          renderLogin();
          return;
        }
        await pullLiveData({ players: pending.players, chat: pending.chat, combat: pending.combat });
      } catch (error) {
        console.warn('realtime refresh failed', error);
      }
    }, 180);
  }


  function handlePocketBaseRealtimePayload(frame) {
    const event = String(frame?.event || '').trim();
    const record = frame?.data?.record || frame?.record || frame?.data || null;
    if (!record || String(record.campaignId || '') !== String(App.config.campaignId || '')) return;
    const collection = String(frame?.data?.collectionName || frame?.data?.collectionId || frame?.collectionName || '');
    const key = `${event}:${record.id || ''}:${record.updated || record.clientUpdatedAt || ''}`;
    if (App.realtime.eventKeys.has(key)) return;
    App.realtime.eventKeys.add(key);
    if (App.realtime.eventKeys.size > 200) App.realtime.eventKeys.delete(App.realtime.eventKeys.values().next().value);
    if (collection === App.config.chatTableName || record.messageId) scheduleRealtimeRefresh({ chat: true });
    else if (collection === App.config.combatRuntimeTableName || Object.prototype.hasOwnProperty.call(record, 'runtimeJson')) scheduleRealtimeRefresh({ combat: true });
    else if (collection === App.config.playerTableName || record.playerId) scheduleRealtimeRefresh({ players: true });
    else scheduleRealtimeRefresh({ snapshot: true });
  }


  async function startPocketBaseRealtime() {
    const controller = new AbortController();
    App.realtime.abortController = controller;
    try {
      const token = await pbAuthToken(App.config);
      const response = await fetch(`${pbBaseUrl(App.config)}/api/realtime`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`PocketBase realtime HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const subscribe = async clientId => {
        await pbFetch(App.config, '/api/realtime', {
          method: 'POST',
          json: { clientId, subscriptions: [
            `${App.config.tableName}/*`, `${App.config.playerTableName}/*`, `${App.config.chatTableName}/*`, `${App.config.combatRuntimeTableName}/*`
          ] }
        });
      };
      const parseFrame = text => {
        const lines = String(text || '').split(/\r?\n/);
        let event = 'message';
        const dataLines = [];
        lines.forEach(line => {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        });
        const raw = dataLines.join('\n');
        if (!raw) return;
        let payload = null;
        try { payload = JSON.parse(raw); } catch { payload = { raw }; }
        if (event === 'PB_CONNECT') subscribe(payload.clientId).catch(error => console.warn('pb realtime subscribe failed', error));
        else handlePocketBaseRealtimePayload({ event, data: payload });
      };
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() || '';
        frames.forEach(parseFrame);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn('pocketbase realtime failed', error);
        if (App.session?.userId) App.realtime.reconnectTimer = setTimeout(() => startRealtime(), 2500);
      }
    }
  }


  function startRealtime() {
    stopRealtime();
    if (!hasConfig() || !App.session?.userId) return;
    try {
      startPocketBaseRealtime();
    } catch (error) {
      console.warn('realtime init failed', error);
    }
  }

  function stopRealtime() {
    if (App.realtime.flushTimer) clearTimeout(App.realtime.flushTimer);
    App.realtime.flushTimer = null;
    if (App.realtime.heartbeat) clearInterval(App.realtime.heartbeat);
    App.realtime.heartbeat = null;
    if (App.realtime.reconnectTimer) clearTimeout(App.realtime.reconnectTimer);
    App.realtime.reconnectTimer = null;
    App.realtime.suppressClose = true;
    try { App.realtime.abortController?.abort(); } catch {}
    App.realtime.abortController = null;
    try { App.realtime.socket?.close(); } catch {}
    App.realtime.socket = null;
  }

  function startPolling() {
    stopPolling();
    if (!hasConfig() || !App.session?.userId) return;
    startRealtime();
    App.pollers.snapshot = setInterval(() => {
      pullEverything({ silent: true, render: false }).catch(() => {});
    }, Math.max(15000, Number(App.config.snapshotPollMs || DEFAULTS.snapshotPollMs)));
    App.pollers.live = setInterval(() => {
      pullLiveData({ players: true, chat: true, combat: true }).catch(() => {});
    }, Math.max(2500, Number(App.config.livePollMs || DEFAULTS.livePollMs)));
  }

  function stopPolling() {
    Object.values(App.pollers).forEach(timer => timer && clearInterval(timer));
    App.pollers.snapshot = null;
    App.pollers.live = null;
    stopRealtime();
  }

  async function login(playerId, pass) {
    const player = App.data.players.get(playerId);
    if (!player) throw new Error('Персонаж не найден');
    if (String(player.role || '') !== 'guest' && String(player.pass || '') !== String(pass || '')) throw new Error('Неверный пароль персонажа');
    App.session = { userId: playerId, role: player.role || 'player', loggedInAt: new Date().toISOString() };
    if (RUNTIME.cloudOnly && App.rememberLogin) await setRememberLogin(true, { extend: true });
    await storageSet(KEYS.session, App.session);
    openBoot('app');
    App.ui.screen = 'home';
    renderCurrentScreen();
    startPolling();
    notify(`Вход выполнен: ${player.displayName || player.id}`, 'ok');
  }

  async function loginGuest() {
    const guest = guestProfile();
    App.data.players.set(GUEST_ID, guest);
    App.session = { userId: GUEST_ID, role: 'guest', loggedInAt: new Date().toISOString() };
    if (RUNTIME.cloudOnly && App.rememberLogin) await setRememberLogin(true, { extend: true });
    await storageSet(KEYS.session, App.session);
    openBoot('app');
    App.ui.screen = 'home';
    renderCurrentScreen();
    startPolling();
    notify('Гостевой вход выполнен', 'ok');
  }

  async function logout() {
    stopPolling();
    App.ui.combatFullscreen = false;
    App.session = null;
    await storageRemove(KEYS.session);
    openBoot('login');
    renderLogin();
    syncRememberControls();
  }

  async function forgetThisDevice() {
    stopPolling();
    App.session = null;
    App.auth = { token: '', expiresAt: 0 };
    App.config = normalizeConfig({});
    App.cache = { snapshot: null, players: [], chat: [], combatRuntime: null, fetchedAt: null };
    App.rememberLogin = false;
    App.rememberUntil = 0;
    await Promise.all([KEYS.config, KEYS.cache, KEYS.session, KEYS.auth, KEYS.remember, MOBILE_READ_MARKERS_KEY].map(key => storageRemove(key)));
    fillSetupForm();
    syncRememberControls();
    openBoot('setup');
    notify('Сохранённый вход и данные подключения удалены с устройства', 'warn');
  }

  async function handleSetupSave(form) {
    const fd = new FormData(form);
    const config = normalizeConfig(Object.fromEntries(fd.entries()));
    const identityChanged = pbBaseUrl(config) !== pbBaseUrl(App.config)
      || config.appUserEmail !== App.config?.appUserEmail
      || config.appUsersCollection !== App.config?.appUsersCollection;
    if (identityChanged || config.appUserPassword) await persistAuth(null);
    $('#setup-status').textContent = 'Проверяю подключение и читаю кампанию из облака...';
    await apiPing(config);
    App.config = config;
    await storageSet(KEYS.config, config);
    await pullEverything({ silent: true });
    App.ui.lastLivePullAt = new Date().toISOString();
    openBoot('login');
    renderLogin();
    $('#setup-status').textContent = 'Готово.';
    notify('Подключение сохранено', 'ok');
  }

  async function commitPlayerMutation(mutator, successMessage) {
    const player = currentPlayer();
    if (!player) throw new Error('Профиль игрока не выбран');
    const baseRow = await apiPullPlayer(App.config, player.id);
    const mergedBase = buildPlayerMap(App.cache.snapshot, baseRow ? [baseRow] : []).get(player.id) || deep(player);
    const nextPlayer = deep(mergedBase);
    await mutator(nextPlayer);
    const segments = decomposePlayer(nextPlayer);
    let saved;
    if (!baseRow) {
      saved = await apiUpsertPlayer(App.config, {
        player_id: player.id,
        version: 1,
        updated_by: App.config.deviceLabel || 'android-player',
        ...segments
      });
    } else {
      saved = await apiPatchPlayerWithVersion(App.config, player.id, Number(baseRow.version || 0), {
        updated_by: App.config.deviceLabel || 'android-player',
        ...segments
      });
      if (!saved) throw new Error('Конфликт версии строки игрока. Обнови данные и повтори действие.');
    }
    App.data.playerRows.set(player.id, saved);
    App.data.players = buildPlayerMap(App.cache.snapshot, Array.from(App.data.playerRows.values()));
    await saveCache();
    renderCurrentScreen();
    notify(successMessage, 'ok');
  }

  async function buyItem(itemId, price) {
    await commitPlayerMutation(player => {
      const cost = Number(price || 0);
      if (Number(player.credits || 0) < cost) throw new Error('Недостаточно кредитов');
      player.credits = Number(player.credits || 0) - cost;
      if (!Array.isArray(player.inventory)) player.inventory = [];
      const existing = player.inventory.find(entry => entry.itemId === itemId);
      if (existing) existing.qty = Number(existing.qty || 0) + 1;
      else player.inventory.push({ itemId, qty: 1 });
    }, 'Покупка сохранена в облаке');
  }

  async function sendMessage(form) {
    const threadKey = form.dataset.threadKey;
    const body = String(new FormData(form).get('body') || '').trim();
    if (!threadKey || !body) return;
    const thread = buildThreads().find(item => item.key === threadKey);
    if (!thread) throw new Error('Канал связи не найден');
    const player = currentPlayer();
    const messageId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const row = {
      message_id: messageId,
      kind: thread.type === 'npc' ? 'npc' : 'direct',
      thread_key: thread.key,
      sender_type: 'player',
      sender_id: player.id,
      recipient_player_id: thread.type === 'direct' ? thread.otherId : player.id,
      npc_id: thread.type === 'npc' ? thread.npcId : null,
      direct_a: thread.type === 'direct' ? player.id : null,
      direct_b: thread.type === 'direct' ? thread.otherId : null,
      author_label: player.displayName || player.id,
      body_html: `<p>${esc(body)}</p>`
    };
    const saved = await apiUpsertChat(App.config, row);
    App.data.chatRows = mergeChatRows(App.data.chatRows, [saved]);
    await saveCache();
    App.ui.chatDrafts[thread.key] = '';
    form.reset();
    renderChat();
    notify('Сообщение отправлено', 'ok');
  }

  function bindGlobalEvents() {
    document.body.classList.toggle('web-cloud-only', !!RUNTIME.cloudOnly);
    document.body.classList.toggle('web-client-mode', !!RUNTIME.webClient);
    if (RUNTIME.hideCombat) {
      document.querySelectorAll('[data-screen="combat"], #screen-combat').forEach(node => node.remove());
    }
    document.body.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'archive-tab') {
        App.ui.archiveTab = button.dataset.tab === 'systems' ? 'articles' : button.dataset.tab;
        App.ui.selectedArchiveId = '';
        renderArchive();
      }
      if (action === 'select-archive') {
        App.ui.selectedArchiveType = button.dataset.type;
        App.ui.selectedArchiveId = button.dataset.id;
        if (button.dataset.type === 'article') markArchiveArticleRead(button.dataset.id);
        renderArchive();
      }
      if (action === 'open-article') openArticleById(button.dataset.articleId);
      if (action === 'open-planet') openPlanet(button.dataset.planetId);
      if (action === 'open-system') openSystem(button.dataset.systemId);
      if (action === 'focus-system') focusSystem(button.dataset.systemId);
      if (action === 'buy-item') {
        buyItem(button.dataset.itemId, button.dataset.price).catch(error => notify(error.message, 'err'));
      }
      if (action === 'select-thread') {
        App.ui.selectedThreadKey = button.dataset.threadKey;
        renderChat();
      }
      if (action === 'select-combat-scene') {
        App.ui.selectedCombatSceneId = button.dataset.sceneId;
        App.ui.combatFullscreen = true;
        renderCombat();
      }
      if (action === 'open-combat-fullscreen') {
        App.ui.selectedCombatSceneId = button.dataset.sceneId || App.ui.selectedCombatSceneId;
        App.ui.combatFullscreen = true;
        renderCombat();
      }
      if (action === 'toggle-combat-fullscreen') {
        App.ui.combatFullscreen = !App.ui.combatFullscreen;
        renderCombat();
      }
      if (action === 'upgrade-skill') {
        upgradeSkill(button.dataset.skillId).catch(error => notify(error.message, 'err'));
      }
      if (action === 'upgrade-ability') {
        upgradeAbility(button.dataset.abilityKey).catch(error => notify(error.message, 'err'));
      }
      if (action === 'profile-tab') {
        App.ui.profileTab = button.dataset.tab || 'main';
        renderProfile();
      }
      if (action === 'skill-zoom') {
        const mode = button.dataset.zoom;
        if (mode === 'in') App.ui.skillZoom = clampWebSkillZoom((App.ui.skillZoom || 1) * 1.15);
        else if (mode === 'out') App.ui.skillZoom = clampWebSkillZoom((App.ui.skillZoom || 1) / 1.15);
        else App.ui.skillZoom = 1;
        renderProfile();
      }
      if (action === 'profile-refresh') {
        safeRefresh({ deferRender: false }).catch(error => notify(error.message, 'err'));
      }
      if (action === 'profile-logout') {
        logout().catch(error => notify(error.message, 'err'));
      }
      if (action === 'profile-forget-device') {
        if (window.confirm('Удалить сохранённый вход и параметры подключения с этого устройства?')) {
          forgetThisDevice().catch(error => notify(error.message, 'err'));
        }
      }
    });

    document.body.addEventListener('submit', event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.id === 'setup-form') {
        event.preventDefault();
        setRememberLogin(Boolean($('#setup-remember-login')?.checked)).then(() => handleSetupSave(form)).catch(error => {
          $('#setup-status').textContent = error.message;
          notify(`Не удалось подключиться: ${error.message}`, 'err');
        });
      }
      if (form.id === 'login-form') {
        event.preventDefault();
        setRememberLogin(Boolean($('#login-remember-login')?.checked)).then(() => login($('#login-player').value, $('#login-pass').value)).catch(error => {
          $('#login-status').textContent = error.message;
          notify(error.message, 'err');
        });
      }
      if (form.id === 'chat-compose-form') {
        event.preventDefault();
        sendMessage(form).catch(error => notify(error.message, 'err'));
      }
    });

    document.body.addEventListener('change', event => {
      if (event.target.id === 'login-campaign') { App.ui.selectedCampaignId = event.target.value || 'all'; renderLogin(); }
      if (event.target.id === 'login-player') renderLoginPreview();
      if (event.target.id === 'setup-remember-login' || event.target.id === 'login-remember-login') {
        setRememberLogin(Boolean(event.target.checked)).catch(error => notify(error.message, 'err'));
      }
    });

    document.body.addEventListener('input', event => {
      const archiveSearch = event.target.closest('#archive-search-input');
      if (archiveSearch) {
        App.ui.archiveQuery = archiveSearch.value || '';
        renderArchive();
        const next = $('#archive-search-input');
        if (next) { next.focus(); next.selectionStart = next.selectionEnd = next.value.length; }
        return;
      }
      const textarea = event.target.closest('#chat-compose-form textarea[name="body"]');
      if (!textarea) return;
      const form = textarea.closest('#chat-compose-form');
      const threadKey = form?.dataset.threadKey || App.ui.selectedThreadKey || '';
      if (threadKey) App.ui.chatDrafts[threadKey] = textarea.value;
    });

    window.addEventListener('resize', () => {
      if (App.ui.screen === 'combat') requestAnimationFrame(initCombatViewports);
    });

    $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
      App.ui.screen = btn.dataset.screen;
      renderCurrentScreen();
    }));

    $('#login-guest-btn')?.addEventListener('click', () => {
      setRememberLogin(Boolean($('#login-remember-login')?.checked)).then(() => loginGuest()).catch(error => notify(error.message, 'err'));
    });

    $('#login-back-btn').addEventListener('click', () => {
      openBoot('setup');
      fillSetupForm();
    });

    $('#web-reload-btn')?.addEventListener('click', () => window.location.reload());

    $('#setup-clear-btn').addEventListener('click', async () => {
      if (RUNTIME.cloudOnly) {
        await forgetThisDevice();
        return;
      }
      await storageRemove(KEYS.config);
      await storageRemove(KEYS.cache);
      App.config = normalizeConfig({});
      App.cache = { snapshot: null, players: [], chat: [], combatRuntime: null, fetchedAt: null };
      fillSetupForm();
      notify('Локальная конфигурация очищена', 'warn');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopPolling();
      else if (App.session?.userId) startPolling();
    });

    window.addEventListener('online', () => { if (App.session?.userId) startPolling(); });
    window.addEventListener('offline', () => notify(RUNTIME.cloudOnly ? 'Сеть пропала, веб-клиент ждёт облако' : 'Сеть пропала, остаёмся на локальном кеше', 'warn'));
  }

  function fillSetupForm() {
    const form = $('#setup-form');
    if (!form) return;
    const config = normalizeConfig(App.config || {});
    form.url.value = config.url || DEFAULTS.url;
    if (form.appUserEmail) form.appUserEmail.value = config.appUserEmail || '';
    if (form.appUserPassword) form.appUserPassword.value = config.appUserPassword || '';
    if (form.appUsersCollection) form.appUsersCollection.value = config.appUsersCollection || DEFAULTS.appUsersCollection;
    form.campaignId.value = config.campaignId || '';
    form.deviceLabel.value = config.deviceLabel || '';
    form.tableName.value = config.tableName || DEFAULTS.tableName;
    form.playerTableName.value = config.playerTableName || DEFAULTS.playerTableName;
    form.chatTableName.value = config.chatTableName || DEFAULTS.chatTableName;
    form.combatRuntimeTableName.value = config.combatRuntimeTableName || DEFAULTS.combatRuntimeTableName;
    if (form.assetsCollection) form.assetsCollection.value = config.assetsCollection || DEFAULTS.assetsCollection;
    form.snapshotPollMs.value = config.snapshotPollMs || DEFAULTS.snapshotPollMs;
    form.livePollMs.value = config.livePollMs || DEFAULTS.livePollMs;
    syncRememberControls();
  }

  async function init() {
    bindGlobalEvents();
    await loadLocalState();
    fillSetupForm();
    syncRememberControls();

    const hasCached = RUNTIME.cloudOnly ? false : await bootFromCacheIfNeeded();
    if (hasConfig()) {
      try {
        await pullEverything({ silent: true });
      } catch (error) {
        if (!hasCached) {
          openBoot('setup');
          $('#setup-status').textContent = `Не удалось подключиться: ${error.message}`;
          notify(`Не удалось подключиться: ${error.message}`, 'err');
          return;
        }
        notify(`Загружен локальный кеш. Облако сейчас недоступно: ${error.message}`, 'warn');
      }
      renderLogin();
      if (App.session?.userId && App.data.players.has(App.session.userId)) {
        openBoot('app');
        renderCurrentScreen();
        startPolling();
      } else {
        openBoot('login');
      }
      return;
    }
    openBoot('setup');
  }

  init().catch(error => {
    openBoot('setup');
    $('#setup-status').textContent = error.message;
    notify(`Ошибка запуска: ${error.message}`, 'err');
  });
})();
