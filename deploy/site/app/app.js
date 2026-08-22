(() => {
  const RUNTIME = {
    webClient: document.documentElement?.dataset?.client === 'web' || window.GRPG_WEB_CLIENT === true,
    cloudOnly: document.documentElement?.dataset?.cloudOnly === 'true' || window.GRPG_CLOUD_ONLY === true,
    hideCombat: document.documentElement?.dataset?.hideCombat === 'true' || window.GRPG_HIDE_COMBAT === true
  };
  const WEB_MEMORY = new Map();
  const WEB_RUNTIME_CONFIG = (window.GRPG_WEB_RUNTIME && typeof window.GRPG_WEB_RUNTIME === 'object') ? window.GRPG_WEB_RUNTIME : {};

  const DEFAULTS = {
    backend: 'pocketbase',
    url: String(WEB_RUNTIME_CONFIG.url || 'https://sync.grpg-sync.ru').trim(),
    campaignId: String(WEB_RUNTIME_CONFIG.campaignId || 'main').trim() || 'main',
    appUsersCollection: String(WEB_RUNTIME_CONFIG.appUsersCollection || 'app_users').trim() || 'app_users',
    appUserEmail: String(WEB_RUNTIME_CONFIG.appUserEmail || '').trim(),
    appUserPassword: String(WEB_RUNTIME_CONFIG.appUserPassword || ''),
    tableName: String(WEB_RUNTIME_CONFIG.tableName || 'campaign_snapshots').trim() || 'campaign_snapshots',
    playerTableName: String(WEB_RUNTIME_CONFIG.playerTableName || 'campaign_players').trim() || 'campaign_players',
    chatTableName: String(WEB_RUNTIME_CONFIG.chatTableName || 'campaign_messages').trim() || 'campaign_messages',
    combatRuntimeTableName: String(WEB_RUNTIME_CONFIG.combatRuntimeTableName || 'campaign_combat_runtime').trim() || 'campaign_combat_runtime',
    assetsCollection: String(WEB_RUNTIME_CONFIG.assetsCollection || 'campaign_assets').trim() || 'campaign_assets'
  };

  const KEYS = {
    config: 'grpg.mobile.syncConfig.v1',
    cache: 'grpg.mobile.cache.v1',
    session: 'grpg.mobile.session.v1',
    auth: 'grpg.web.pocketbaseAuth.v1',
    remember: 'grpg.web.rememberLogin.v1',
    galaxyView: 'grpg.web.galaxyView.v1'
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
      boot: 'login',
      screen: 'home',
      archiveTab: 'articles',
      selectedArchiveId: '',
      selectedArchiveType: 'article',
      selectedThreadKey: '',
      selectedCombatSceneId: '',
      selectedCampaignId: 'all',
      focusedSystemId: '',
      galaxySelectedSystemId: '',
      galaxySelectedPlanetId: '',
      galaxyDesktopActive: false,
      galaxyCamera: null,
      archiveQuery: '',
      archiveScopeV1079: 'section',
      archiveCategoryV1079: 'all',
      archiveStatusV1079: 'all',
      archiveSortV1079: 'title',
      profileTab: 'main',
      profileItemModal: null,
      skillZoom: 1,
      combatFullscreen: false,
      combatViewByScene: {},
      lastLivePullAt: null,
      chatDrafts: {},
      lastSnapshotRevision: 0,
      lastChatStamp: null,
      lastCombatStamp: null
    },
    realtime: {
      reconnectTimer: null,
      eventKeys: new Set(),
      connected: false,
      hadConnection: false,
      lastEventAt: 0,
      lastResyncAt: 0
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
    clean.appUserEmail = '';
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
    const control = $('#login-remember-login');
    if (!control) return;
    let hasExplicitRememberState = false;
    try { hasExplicitRememberState = Boolean(window.localStorage.getItem(KEYS.remember)); } catch {}
    control.checked = hasExplicitRememberState ? Boolean(App.rememberLogin) : true;
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

  const GRPG_LORE_YEAR_V1075 = 3616;
  const GRPG_LORE_ERA_V1075 = 'В.Э.';
  function formatDate(value) {
    if (!value) return '—';
    const source = String(value).trim();
    const dateOnly = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let day, month, hour = 0, minute = 0;
    if (dateOnly) {
      month = Number(dateOnly[2]);
      day = Number(dateOnly[3]);
    } else {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return source;
      day = date.getDate();
      month = date.getMonth() + 1;
      hour = date.getHours();
      minute = date.getMinutes();
    }
    const pad = number => String(number).padStart(2, '0');
    const dateText = `${pad(day)}.${pad(month)}.${GRPG_LORE_YEAR_V1075} ${GRPG_LORE_ERA_V1075}`;
    return dateOnly ? dateText : `${dateText}, ${pad(hour)}:${pad(minute)}`;
  }
  window.GRPGCosmeticDateV1075 = Object.freeze({ year: GRPG_LORE_YEAR_V1075, era: GRPG_LORE_ERA_V1075, format: formatDate });

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
      appUserEmail: legacyConfig ? '' : String(payload.appUserEmail || payload.pocketbaseEmail || payload.pbEmail || DEFAULTS.appUserEmail || '').trim(),
      appUserPassword: legacyConfig ? '' : String(payload.appUserPassword || payload.pocketbasePassword || payload.pbPassword || DEFAULTS.appUserPassword || ''),
      appUsersCollection: String(payload.appUsersCollection || payload.pocketbaseUsersCollection || DEFAULTS.appUsersCollection).trim() || DEFAULTS.appUsersCollection,
      campaignId: String(payload.campaignId || DEFAULTS.campaignId || 'main').trim() || 'main',
      deviceLabel: String(payload.deviceLabel || '').trim(),
      tableName: String(payload.tableName || DEFAULTS.tableName).trim() || DEFAULTS.tableName,
      playerTableName: String(payload.playerTableName || DEFAULTS.playerTableName).trim() || DEFAULTS.playerTableName,
      chatTableName: String(payload.chatTableName || DEFAULTS.chatTableName).trim() || DEFAULTS.chatTableName,
      combatRuntimeTableName: String(payload.combatRuntimeTableName || DEFAULTS.combatRuntimeTableName).trim() || DEFAULTS.combatRuntimeTableName,
      assetsCollection: String(payload.assetsCollection || payload.pocketbaseAssetsCollection || DEFAULTS.assetsCollection).trim() || DEFAULTS.assetsCollection
    };
  }

  function isPocketBaseConfig() {
    return true;
  }

  function hasConfig(config = App.config) {
    return Boolean(config?.url && config?.campaignId && (App.auth?.token || (config?.appUserEmail && config?.appUserPassword)));
  }

  function hasRuntimeServiceAuth() {
    return Boolean(DEFAULTS.appUserEmail && DEFAULTS.appUserPassword);
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
    const isItem = Boolean(entity?.id && App.data.items?.has?.(entity.id));
    const cls = `${mode === 'hero' ? 'entity-hero-image' : 'entity-thumb'}${isItem ? ' entity-item-media-v1060' : ''}`;
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

  const ARCHIVE_FAVORITES_KEY_V1079 = 'grpg.web.archiveFavorites.v1079';
  const ARCHIVE_RECENT_KEY_V1079 = 'grpg.web.archiveRecent.v1079';
  const ARCHIVE_SECTION_LABELS_V1079 = { articles: 'Статьи', planets: 'Планеты', systems: 'Системы', equipment: 'Снаряжение' };

  function archiveUserKeyWebV1079() {
    return String(App.session?.userId || 'guest');
  }

  function readArchiveLocalMapV1079(key) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function writeArchiveLocalMapV1079(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value || {})); } catch {}
  }

  function archiveEntryKeyV1079(itemOrType, id = '') {
    if (itemOrType && typeof itemOrType === 'object') return `${String(itemOrType._type || '')}:${String(itemOrType.id || '')}`;
    return `${String(itemOrType || '')}:${String(id || '')}`;
  }

  function archiveFavoritesV1079() {
    const map = readArchiveLocalMapV1079(ARCHIVE_FAVORITES_KEY_V1079);
    return new Set((map[archiveUserKeyWebV1079()] || []).map(String));
  }

  function toggleArchiveFavoriteV1079(type, id) {
    const map = readArchiveLocalMapV1079(ARCHIVE_FAVORITES_KEY_V1079);
    const user = archiveUserKeyWebV1079();
    const set = new Set((map[user] || []).map(String));
    const key = archiveEntryKeyV1079(type, id);
    if (set.has(key)) set.delete(key); else set.add(key);
    map[user] = Array.from(set);
    writeArchiveLocalMapV1079(ARCHIVE_FAVORITES_KEY_V1079, map);
  }

  function archiveRecentV1079() {
    const map = readArchiveLocalMapV1079(ARCHIVE_RECENT_KEY_V1079);
    return Array.isArray(map[archiveUserKeyWebV1079()]) ? map[archiveUserKeyWebV1079()].map(String) : [];
  }

  function rememberArchiveRecentV1079(type, id) {
    const map = readArchiveLocalMapV1079(ARCHIVE_RECENT_KEY_V1079);
    const user = archiveUserKeyWebV1079();
    const key = archiveEntryKeyV1079(type, id);
    map[user] = [key, ...(Array.isArray(map[user]) ? map[user] : []).filter(value => String(value) !== key)].slice(0, 30);
    writeArchiveLocalMapV1079(ARCHIVE_RECENT_KEY_V1079, map);
  }

  function archiveSectionForTypeV1079(type) {
    return ({ article: 'articles', planet: 'planets', system: 'systems', item: 'equipment' })[String(type || '')] || 'articles';
  }

  function archiveBaseCategoryV1079(item = {}) {
    if (item._type === 'article') return String(item.category || item.section || 'Без категории').trim() || 'Без категории';
    if (item._type === 'item') {
      const labels = { weapon: 'Оружие', armor: 'Броня', implant: 'Импланты', stock: 'Акции', equipment: 'Снаряжение', gear: 'Снаряжение' };
      return labels[String(item.type || '').toLowerCase()] || String(item.category || item.type || 'Прочее').trim() || 'Прочее';
    }
    if (item._type === 'planet') return String(item.location?.system || item.location?.obj || item.code || 'Другие планеты').trim() || 'Другие планеты';
    return 'Звёздные системы';
  }

  function archiveCategoryV1079(item = {}, globalScope = false) {
    const base = archiveBaseCategoryV1079(item);
    return globalScope ? `${ARCHIVE_SECTION_LABELS_V1079[archiveSectionForTypeV1079(item._type)]} · ${base}` : base;
  }

  function normalizeArchiveSearchV1079(value) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function archiveSearchValuesV1079(value, output = [], depth = 0, key = '') {
    if (value == null || depth > 4) return output;
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value);
      if (!/^data:/i.test(text) && !/(image|avatar|media|thumb|background|asset)/i.test(key)) output.push(text);
      return output;
    }
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach(entry => archiveSearchValuesV1079(entry, output, depth + 1, key));
      return output;
    }
    if (typeof value === 'object') Object.entries(value).forEach(([childKey, entry]) => archiveSearchValuesV1079(entry, output, depth + 1, childKey));
    return output;
  }


  function groupedArchiveMarkup(items = [], entity = null, options = {}) {
    if (!items.length) return '<div class="placeholder">Ничего не найдено.</div>';
    const globalScope = Boolean(options.globalScope);
    const forceOpen = Boolean(options.forceOpen);
    const favorites = archiveFavoritesV1079();
    const groups = new Map();
    items.forEach(item => {
      const key = archiveCategoryV1079(item, globalScope);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const ordered = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ru'));
    return ordered.map(([category, group], groupIndex) => {
      const containsSelected = group.some(item => item.id === entity?.id && item._type === entity?._type);
      return `<details class="archive-group-v1079" ${forceOpen || containsSelected || groupIndex === 0 ? 'open' : ''}>
        <summary><span>${esc(category)}</span><span class="archive-group-count-v1079">${group.length}</span></summary>
        <div class="archive-group-list-v1079">${group.map(item => {
        const unread = item._type === 'article' && !isArchiveArticleRead(item.id);
        const favorite = favorites.has(archiveEntryKeyV1079(item));
        return `
          <article class="archive-entry-v1079 ${item.id === entity?.id && item._type === entity?._type ? 'active' : ''} ${unread ? 'unread' : ''}" data-action="select-archive" data-type="${esc(item._type)}" data-id="${esc(item.id)}" tabindex="0" role="button">
            ${renderEntityAvatar(item, archiveItemLabel(item), 'sm')}
            <div class="archive-entry-copy-v1079"><div class="archive-entry-title-v1079">${unread ? '<b class="new-badge">NEW</b> ' : ''}${esc(archiveItemLabel(item))}</div><div class="small-note archive-entry-summary-v1079">${esc(item.summary || item.subtitle || archiveBaseCategoryV1079(item))}</div></div>
            <button class="archive-favorite-v1079 ${favorite ? 'active' : ''}" type="button" data-action="archive-favorite-v1079" data-type="${esc(item._type)}" data-id="${esc(item.id)}" aria-label="${favorite ? 'Убрать из избранного' : 'Добавить в избранное'}">${favorite ? '★' : '☆'}</button>
          </article>
        `;
      }).join('')}</div></details>`;
    }).join('');
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
    const desktopGalaxyActive = active === 'home'
      && App.ui.galaxyDesktopActive
      && window.matchMedia('(min-width: 901px)').matches
      && WebGalaxyMap.isMounted();

    // The desktop galaxy owns its canvas and camera. World/player realtime updates
    // mutate only the data model and inspector; never rebuild the map DOM.
    if (desktopGalaxyActive && (changed.snapshot || changed.players)) {
      WebGalaxyMap.onDataChanged(changed);
      return;
    }

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
      throw new Error('Автоматическая PocketBase-авторизация не внедрена в Web-деплой. Выполните «ДЕПЛОЙ WEB» из DEV-профиля ДМа после сохранения PocketBase-конфигурации в Electron.');
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
    return { login: $('#login-screen'), app: $('#app-shell') };
  }

  function openBoot(mode) {
    App.ui.boot = mode;
    const nodes = screenNodes();
    nodes.login?.classList.toggle('hidden', mode !== 'login');
    nodes.app?.classList.toggle('hidden', mode !== 'app');
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


  function galaxyEraPaletteV1050() {
    const root = document.documentElement;
    const era = String(root?.dataset?.eraTheme || 'technological').toLowerCase();
    const styles = getComputedStyle(root);
    const css = (name, fallback) => String(styles.getPropertyValue(name) || '').trim() || fallback;
    if (era === 'medieval') return {
      era,
      marker: css('--map-marker', '#c88a52'), route: css('--map-route', '#9b673c'), text: css('--map-text', '#f0d9ad'),
      bg0: '#3a2415', bg1: '#160d08', bg2: '#080503', stars: '#f0d9ad', orbit: 'rgba(200,138,82,.20)'
    };
    if (era === 'industrial') return {
      era,
      marker: css('--map-marker', '#d49a3f'), route: css('--map-route', '#a96f2f'), text: css('--map-text', '#ead8b4'),
      bg0: '#1c1d1c', bg1: '#0c0d0d', bg2: '#030404', stars: '#d7c6a4', orbit: 'rgba(212,154,63,.18)'
    };
    return {
      era: 'technological',
      marker: css('--map-marker', '#60c9ff'), route: css('--map-route', '#328dff'), text: css('--map-text', '#e8f8ff'),
      bg0: '#102b49', bg1: '#071526', bg2: '#020610', stars: '#dff7ff', orbit: 'rgba(96,201,255,.16)'
    };
  }

  const WEB_ERA_MARKER_ASSET_FOLDERS_V1055 = Object.freeze({ industrial: 'nowadays', medieval: 'bronzera', technological: 'scifi' });
  const WEB_ERA_MARKER_ASSET_FILES_V1055 = Object.freeze({
    blackhole: 'blackhole.png', diamond: 'danger.png', square: 'misc.png', credits: 'trade.png',
    node: 'node.png', orbital: 'star.png', planet: 'planet.png', ship: 'ship.png'
  });
  const WEB_ERA_MARKER_SCALE_V1055 = Object.freeze({ blackhole: 5.1, diamond: 3.55, square: 3.55, credits: 3.75, node: 3.85, orbital: 4, planet: 3.15, ship: 3.65 });
  const WEB_ERA_MARKER_IMAGE_CACHE_V1055 = new Map();
  const WEB_ERA_MARKER_TINT_CACHE_V1055 = new Map();

  function webEraMarkerAssetUrlV1055(kind, palette = galaxyEraPaletteV1050()) {
    const file = WEB_ERA_MARKER_ASSET_FILES_V1055[String(kind || '').toLowerCase()];
    if (!file) return '';
    const era = String(palette?.era || document.documentElement?.dataset?.eraTheme || 'technological').toLowerCase();
    const folder = WEB_ERA_MARKER_ASSET_FOLDERS_V1055[era] || WEB_ERA_MARKER_ASSET_FOLDERS_V1055.technological;
    return `./assets/markers/${folder}/${file}`;
  }

  function webMarkerSpriteEntryV1055(kind, palette = galaxyEraPaletteV1050()) {
    const url = webEraMarkerAssetUrlV1055(kind, palette);
    if (!url || typeof Image === 'undefined') return null;
    let entry = WEB_ERA_MARKER_IMAGE_CACHE_V1055.get(url);
    if (entry) return entry;
    const image = new Image();
    entry = { url, image, status: 'loading' };
    image.decoding = 'async';
    image.onload = () => { entry.status = image.naturalWidth && image.naturalHeight ? 'ready' : 'error'; WEB_ERA_MARKER_TINT_CACHE_V1055.clear(); };
    image.onerror = () => { entry.status = 'error'; };
    image.src = url;
    WEB_ERA_MARKER_IMAGE_CACHE_V1055.set(url, entry);
    return entry;
  }

  function webTintedMarkerSpriteV1055(entry, markerColor = '#7df9ff') {
    if (!entry || entry.status !== 'ready' || !entry.image?.naturalWidth || !entry.image?.naturalHeight) return null;
    const color = String(markerColor || '#7df9ff').trim() || '#7df9ff';
    const key = `${entry.url}|${color.toLowerCase()}`;
    const cached = WEB_ERA_MARKER_TINT_CACHE_V1055.get(key);
    if (cached) return cached;
    const side = 192;
    const canvas = document.createElement('canvas'); canvas.width = side; canvas.height = side;
    const tctx = canvas.getContext('2d'); if (!tctx) return null;
    const pad = 10;
    const scale = Math.min((side - pad * 2) / entry.image.naturalWidth, (side - pad * 2) / entry.image.naturalHeight);
    const w = entry.image.naturalWidth * scale, h = entry.image.naturalHeight * scale;
    tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(entry.image, (side - w) / 2, (side - h) / 2, w, h);
    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    tctx.globalAlpha = .27;
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, side, side);
    tctx.restore();
    WEB_ERA_MARKER_TINT_CACHE_V1055.set(key, canvas);
    return canvas;
  }

  function drawWebEraMarkerSpriteV1055(ctx, kind, x, y, size, markerColor, palette, active = false) {
    const entry = webMarkerSpriteEntryV1055(kind, palette);
    const sprite = webTintedMarkerSpriteV1055(entry, markerColor);
    if (!sprite) return false;
    const dpr = WebGalaxyMap?.dpr || 1;
    const visual = Math.max(12 * dpr, Number(size || 8) * (WEB_ERA_MARKER_SCALE_V1055[kind] || 3.6));
    const color = String(markerColor || palette?.marker || '#7df9ff').trim() || '#7df9ff';
    ctx.save();
    ctx.globalAlpha = active ? 1 : .96;
    ctx.shadowColor = color;
    ctx.shadowBlur = (active ? 14 : 8) * dpr;
    ctx.drawImage(sprite, x - visual / 2, y - visual / 2, visual, visual);
    ctx.shadowBlur = 0;
    if (active) {
      ctx.globalAlpha = .62; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, 1.25 * dpr); ctx.setLineDash([4*dpr,4*dpr]);
      ctx.beginPath(); ctx.arc(x, y, visual * .56, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    return true;
  }

function computeWebGalaxyMarkerScaleMapV1058(points = [], dpr = 1) {
  const items = Array.isArray(points) ? points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)) : [];
  const scaleMap = new Map();
  if (!items.length) return scaleMap;
  const baseRadius = 46 * Math.max(1, Number(dpr || 1));
  for (const point of items) {
    let density = 0;
    let severe = 0;
    for (const other of items) {
      if (!other || other === point) continue;
      const dist = Math.hypot(point.x - other.x, point.y - other.y);
      if (dist <= baseRadius * 1.55) density += 1;
      if (dist <= baseRadius * 0.95) severe += 1;
    }
    const scale = clamp(1 - Math.max(0, density - 1) * .07 - severe * .045, .58, 1);
    scaleMap.set(String(point.id || ''), scale);
  }
  return scaleMap;
}

function webGalaxyBackgroundSourcesV1058(layerKey) {
  if (layerKey === 'bloom') return [
    './assets/images/galaxy_bigstars.png',
    './assets/images/galaxy2.png'
  ];
  return [
    './assets/images/galaxy_mainstars.png',
    './assets/images/galaxy1.png'
  ];
}

function drawWebEraSystemMarkerV1050(ctx, p, r, palette, active = false, markerColor = '', markerStyle = 'orbital') {

    const color = String(markerColor || palette.marker || '#7df9ff').trim() || '#7df9ff';
    const style = WEB_ERA_MARKER_ASSET_FILES_V1055[markerStyle] ? markerStyle : 'orbital';
    if (drawWebEraMarkerSpriteV1055(ctx, style, p.x, p.y, r, color, palette, active)) return;
    ctx.save();
    ctx.shadowBlur = (palette.era === 'technological' ? 20 : 13) * WebGalaxyMap.dpr;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.4 * WebGalaxyMap.dpr;
    ctx.globalAlpha = active ? 1 : .92;
    if (palette.era === 'industrial') {
      const core = r * .72;
      ctx.fillRect(p.x - core / 2, p.y - core / 2, core, core);
      ctx.shadowBlur = 0;
      const box = r * 1.35;
      const tick = r * .48;
      ctx.globalAlpha = .78;
      ctx.beginPath();
      ctx.moveTo(p.x-box,p.y-box+tick);ctx.lineTo(p.x-box,p.y-box);ctx.lineTo(p.x-box+tick,p.y-box);
      ctx.moveTo(p.x+box-tick,p.y-box);ctx.lineTo(p.x+box,p.y-box);ctx.lineTo(p.x+box,p.y-box+tick);
      ctx.moveTo(p.x+box,p.y+box-tick);ctx.lineTo(p.x+box,p.y+box);ctx.lineTo(p.x+box-tick,p.y+box);
      ctx.moveTo(p.x-box+tick,p.y+box);ctx.lineTo(p.x-box,p.y+box);ctx.lineTo(p.x-box,p.y+box-tick);
      ctx.stroke();
    } else if (palette.era === 'medieval') {
      ctx.beginPath();
      ctx.moveTo(p.x,p.y-r*.78);ctx.lineTo(p.x+r*.78,p.y);ctx.lineTo(p.x,p.y+r*.78);ctx.lineTo(p.x-r*.78,p.y);ctx.closePath();ctx.fill();
      ctx.shadowBlur = 0;ctx.globalAlpha=.62;
      ctx.beginPath();ctx.arc(p.x,p.y,r*1.52,0,Math.PI*2);ctx.stroke();
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.PI/4);ctx.strokeRect(-r*1.05,-r*1.05,r*2.1,r*2.1);ctx.restore();
    } else {
      ctx.beginPath();ctx.arc(p.x,p.y,r*.48,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.globalAlpha=.76;
      ctx.beginPath();ctx.ellipse(p.x,p.y,r*1.55,r*.82,0,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=.28;ctx.beginPath();ctx.arc(p.x,p.y,r*1.95,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }

  const WebGalaxyMap = {
    canvas: null,
    ctx: null,
    host: null,
    raf: 0,
    resizeObserver: null,
    dpr: 1,
    width: 1,
    height: 1,
    dragging: false,
    moved: false,
    lastX: 0,
    lastY: 0,
    hover: null,
    camera: { x: .5, y: .5, zoom: 1, tx: .5, ty: .5, tzoom: 1 },
    activeSystemId: '',
    systemPoints: [],
    planetPoints: [],
    stars: [],
    images: { main: null, bloom: null },
    loadEraImages(force = false) {
      const loadLayer = (key, sources) => {
        const existing = this.images[key];
        if (!force && existing?.__sourcesKey === sources.join('|')) return;
        let index = 0;
        const tryLoad = () => {
          if (index >= sources.length) {
            this.images[key] = null;
            return;
          }
          const src = sources[index++];
          const img = new Image();
          img.onload = () => { img.__sourcesKey = sources.join('|'); this.images[key] = img; };
          img.onerror = tryLoad;
          img.src = src;
        };
        tryLoad();
      };
      loadLayer('main', webGalaxyBackgroundSourcesV1058('main'));
      loadLayer('bloom', webGalaxyBackgroundSourcesV1058('bloom'));
    },
    isMounted() {
      return Boolean(this.canvas && this.canvas.isConnected && this.ctx);
    },
    persistCamera() {
      App.ui.galaxyCamera = {
        camera: { ...this.camera },
        activeSystemId: String(this.activeSystemId || ''),
        savedAt: Date.now()
      };
      jsonStorageWrite(window.sessionStorage, KEYS.galaxyView, App.ui.galaxyCamera);
    },
    restoreCamera() {
      const saved = App.ui.galaxyCamera || jsonStorageRead(window.sessionStorage, KEYS.galaxyView, null);
      if (saved) App.ui.galaxyCamera = saved;
      const raw = saved?.camera || {};
      const valid = ['x', 'y', 'zoom', 'tx', 'ty', 'tzoom'].every(key => Number.isFinite(Number(raw[key])));
      this.camera = valid
        ? {
            x: Number(raw.x), y: Number(raw.y), zoom: clamp(Number(raw.zoom), .65, 12),
            tx: Number(raw.tx), ty: Number(raw.ty), tzoom: clamp(Number(raw.tzoom), .65, 12)
          }
        : { x: .5, y: .5, zoom: 1, tx: .5, ty: .5, tzoom: 1 };
      const requestedSystem = String(saved?.activeSystemId || App.ui.galaxySelectedSystemId || '');
      this.activeSystemId = this.visibleSystems().some(system => system.id === requestedSystem) ? requestedSystem : '';
      if (!this.activeSystemId) App.ui.galaxySelectedSystemId = '';
    },
    init() {
      this.destroy();
      this.canvas = $('#web-galaxy-canvas');
      this.host = $('#web-galaxy-stage');
      if (!this.canvas || !this.host) return;
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.restoreCamera();
      this.loadEraImages(true);
      if (!this.stars.length) {
        this.stars = Array.from({ length: 360 }, (_, index) => ({
          x: ((index * 73) % 997) / 997,
          y: ((index * 193 + 47) % 991) / 991,
          r: .35 + ((index * 29) % 9) / 10,
          a: .16 + ((index * 41) % 47) / 100
        }));
      }
      this.bind();
      this.resize();
      this.syncBackButton();
      this.loop();
    },
    destroy() {
      if (this.canvas) this.persistCamera();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.resizeObserver = null;
      this.canvas = null;
      this.ctx = null;
      this.host = null;
      this.systemPoints = [];
      this.planetPoints = [];
    },
    bind() {
      const canvas = this.canvas;
      const point = event => {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      };
      canvas.addEventListener('pointerdown', event => {
        const p = point(event);
        this.dragging = true;
        this.moved = false;
        this.lastX = p.x;
        this.lastY = p.y;
        canvas.setPointerCapture?.(event.pointerId);
      });
      canvas.addEventListener('pointermove', event => {
        const p = point(event);
        if (this.dragging) {
          const dx = p.x - this.lastX;
          const dy = p.y - this.lastY;
          if (Math.hypot(dx, dy) > 2) this.moved = true;
          const zoom = Math.max(.65, Number(this.camera.tzoom || this.camera.zoom || 1));
          this.camera.tx -= (dx * this.dpr) / (this.width * zoom);
          this.camera.ty -= (dy * this.dpr) / (this.height * zoom);
          this.camera.tx = clamp(this.camera.tx, -.35, 1.35);
          this.camera.ty = clamp(this.camera.ty, -.35, 1.35);
          this.lastX = p.x;
          this.lastY = p.y;
        } else {
          this.updateHover(p.x * this.dpr, p.y * this.dpr, event.clientX, event.clientY);
        }
      });
      canvas.addEventListener('pointerup', event => {
        const p = point(event);
        this.dragging = false;
        if (!this.moved) this.activateAt(p.x * this.dpr, p.y * this.dpr);
        this.persistCamera();
      });
      canvas.addEventListener('pointercancel', () => { this.dragging = false; this.persistCamera(); });
      canvas.addEventListener('pointerleave', () => {
        this.dragging = false;
        this.hover = null;
        this.persistCamera();
        const tip = $('#web-galaxy-tooltip');
        if (tip) tip.classList.add('hidden');
      });
      canvas.addEventListener('wheel', event => {
        event.preventDefault();
        const p = point(event);
        const sx = p.x * this.dpr;
        const sy = p.y * this.dpr;
        const before = Math.max(.65, Number(this.camera.tzoom || 1));
        const worldX = this.camera.tx + (sx - this.width / 2) / (before * this.width);
        const worldY = this.camera.ty + (sy - this.height / 2) / (before * this.height);
        const factor = event.deltaY < 0 ? 1.18 : .84;
        const after = clamp(before * factor, .65, 12);
        this.camera.tzoom = after;
        this.camera.tx = worldX - (sx - this.width / 2) / (after * this.width);
        this.camera.ty = worldY - (sy - this.height / 2) / (after * this.height);
        this.camera.tx = clamp(this.camera.tx, -.35, 1.35);
        this.camera.ty = clamp(this.camera.ty, -.35, 1.35);
        if (this.activeSystemId && after < 2.2) this.exitSystem(true);
        this.persistCamera();
      }, { passive: false });
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host);
    },
    resize() {
      if (!this.canvas || !this.host) return;
      const rect = this.host.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.width = Math.max(1, Math.round(rect.width * this.dpr));
      this.height = Math.max(1, Math.round(rect.height * this.dpr));
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
    },
    visibleSystems() {
      return App.data.systems.filter(system => visibleForPlayer(system, App.session?.userId));
    },
    visiblePlanets(system) {
      return (system?.planetIds || []).map(id => App.data.planets.get(id)).filter(Boolean).filter(planet => visibleForPlayer(planet, App.session?.userId));
    },
    routes() {
      const systems = this.visibleSystems();
      const byId = new Map(systems.map(system => [system.id, system]));
      const seen = new Set();
      const out = [];
      systems.forEach(system => (system.routes || []).forEach(route => {
        const target = byId.get(route.toId);
        if (!target || target.id === system.id) return;
        const key = [system.id, target.id].sort().join('::');
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ from: system, to: target, color: route.color || system.color || '#7df9ff', label: route.label || '' });
      }));
      return out;
    },
    worldToScreen(x, y) {
      return {
        x: (Number(x ?? .5) - this.camera.x) * this.camera.zoom * this.width + this.width / 2,
        y: (Number(y ?? .5) - this.camera.y) * this.camera.zoom * this.height + this.height / 2
      };
    },
    loop() {
      if (!this.ctx || !this.canvas?.isConnected) return this.destroy();
      this.camera.x += (this.camera.tx - this.camera.x) * .12;
      this.camera.y += (this.camera.ty - this.camera.y) * .12;
      this.camera.zoom += (this.camera.tzoom - this.camera.zoom) * .12;
      this.draw();
      this.raf = requestAnimationFrame(() => this.loop());
    },
    drawSceneImage(ctx, img, alpha, scale = 1) {
      if (!img?.complete || !img.naturalWidth) return;
      const W = this.width;
      const H = this.height;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const baseFit = Math.max(W / iw, H / ih) * scale;
      const zoom = this.camera.zoom;
      const dw = iw * baseFit * zoom;
      const dh = ih * baseFit * zoom;
      const cx = W / 2 + (.5 - this.camera.x) * zoom * W;
      const cy = H / 2 + (.5 - this.camera.y) * zoom * H;
      ctx.save();
      const medievalBackdrop = String(document.documentElement?.dataset?.eraTheme || '') === 'medieval';
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = medievalBackdrop ? alpha * .78 : alpha;
      ctx.filter = medievalBackdrop ? 'sepia(.88) saturate(.48) brightness(.78) contrast(.92)' : 'none';
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();
    },
    draw() {
      const ctx = this.ctx;
      const W = this.width;
      const H = this.height;
      const t = performance.now() * .001;
      const palette = galaxyEraPaletteV1050();
      const bg = ctx.createRadialGradient(W * .5, H * .48, 0, W * .5, H * .48, Math.max(W, H) * .75);
      bg.addColorStop(0, palette.bg0);
      bg.addColorStop(.35, palette.bg1);
      bg.addColorStop(1, palette.bg2);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Background, stars, routes and markers now share one camera transform.
      this.drawSceneImage(ctx, this.images.bloom, .24, 1.08);
      this.drawSceneImage(ctx, this.images.main, .5, 1.02);

      if (palette.era === 'medieval') {
        ctx.save();
        const parchment = ctx.createRadialGradient(W * .48, H * .42, 0, W * .5, H * .5, Math.max(W, H) * .78);
        parchment.addColorStop(0, 'rgba(238,218,176,.28)');
        parchment.addColorStop(.58, 'rgba(194,151,91,.22)');
        parchment.addColorStop(1, 'rgba(92,54,28,.28)');
        ctx.fillStyle = parchment;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(137,88,45,.20)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      ctx.save();
      for (const star of this.stars) {
        const p = this.worldToScreen(star.x, star.y);
        if (p.x < -8 || p.y < -8 || p.x > W + 8 || p.y > H + 8) continue;
        ctx.globalAlpha = star.a;
        ctx.fillStyle = palette.stars;
        ctx.beginPath();
        ctx.arc(p.x, p.y, star.r * this.dpr * clamp(.8 + this.camera.zoom * .12, .8, 1.7), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const current = currentSystem();
      this.systemPoints = [];
      this.planetPoints = [];
      if (!this.activeSystemId) {
        for (const route of this.routes()) {
          const a = this.worldToScreen(route.from.pos?.x, route.from.pos?.y);
          const b = this.worldToScreen(route.to.pos?.x, route.to.pos?.y);
          ctx.save();
          ctx.strokeStyle = palette.route;
          ctx.globalAlpha = .42;
          ctx.lineWidth = 1.25 * this.dpr;
          ctx.setLineDash([7 * this.dpr, 7 * this.dpr]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.restore();
        }
      }
      const visibleSystems = this.visibleSystems().map(system => ({ system, p: this.worldToScreen(system.pos?.x, system.pos?.y) }));
      const markerScaleMap = !this.activeSystemId
        ? computeWebGalaxyMarkerScaleMapV1058(visibleSystems.map(({ system, p }) => ({ id: system.id, x: p.x, y: p.y })), this.dpr)
        : new Map();
      for (const { system, p } of visibleSystems) {
        const active = system.id === this.activeSystemId;
        if (this.activeSystemId && !active) continue;
        const r = ((active ? 12 : 8) * 1.4 * this.dpr) * (markerScaleMap.get(system.id) || 1);
        this.systemPoints.push({ id: system.id, x: p.x, y: p.y, r: Math.max(22 * this.dpr, r * 2) });
        drawWebEraSystemMarkerV1050(ctx, p, r, palette, active, system.color || palette.marker, system.markerStyle || 'orbital');
        ctx.save();
        const galaxyLabelFade = this.activeSystemId ? 1 : clamp((this.camera.zoom - 2.75) / 1.4, 0, 1);
        if ((!this.activeSystemId || active) && galaxyLabelFade > .02) {
          ctx.globalAlpha = galaxyLabelFade;
          ctx.font = `${11 * this.dpr}px Consolas, monospace`;
          ctx.fillStyle = palette.text;
          ctx.fillText(system.markerLabel || system.name || system.id, p.x + r + 7 * this.dpr, p.y - 8 * this.dpr);
        }
        if (current?.id === system.id && !this.activeSystemId) {
          ctx.setLineDash([5 * this.dpr, 5 * this.dpr]);
          ctx.strokeStyle = palette.text;
          ctx.lineWidth = 1.4 * this.dpr;
          ctx.beginPath(); ctx.arc(p.x, p.y, 24 * 1.4 * this.dpr * (1 + .05 * Math.sin(t * 3)), 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
        if (active && this.camera.zoom > 2) this.drawSystemPlanets(ctx, system, p, t);
      }
      if (!this.visibleSystems().length) {
        ctx.fillStyle = palette.text;
        ctx.font = `${14 * this.dpr}px Consolas, monospace`;
        ctx.fillText('Нет доступных систем', 28 * this.dpr, 42 * this.dpr);
      }
    },
    drawSystemPlanets(ctx, system, center, t) {
      const planets = this.visiblePlanets(system);
      const palette = galaxyEraPaletteV1050();
      planets.forEach((planet, index) => {
        const orbit = Math.max(48, Number(planet.dist || 18) * 3.1 + index * 24) * this.dpr;
        const angle = t * Math.max(.03, Number(planet.speed || .0006) * 90) + index * 2.1;
        ctx.save();
        ctx.strokeStyle = palette.orbit;
        ctx.lineWidth = 1 * this.dpr;
        ctx.beginPath(); ctx.ellipse(center.x, center.y, orbit, orbit * .52, 0, 0, Math.PI * 2); ctx.stroke();
        const x = center.x + Math.cos(angle) * orbit;
        const y = center.y + Math.sin(angle) * orbit * .52;
        const r = clamp(Number(planet.size || 7), 5, 13) * this.dpr * .65;
        this.planetPoints.push({ id: planet.id, systemId: system.id, x, y, r: Math.max(16 * this.dpr, r * 2) });
        const color = planet.color || '#f0e68c';
        const spriteDrawn = drawWebEraMarkerSpriteV1055(ctx, 'planet', x, y, r * 1.25, color, palette, App.ui.galaxySelectedPlanetId === planet.id);
        if (!spriteDrawn) {
          ctx.shadowBlur = 12 * this.dpr; ctx.shadowColor = color; ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.font = `${10 * this.dpr}px Consolas, monospace`; ctx.fillStyle = palette.text;
        ctx.fillText(planet.name || planet.id, x + 10 * this.dpr, y - 8 * this.dpr);
        ctx.restore();
      });
    },
    activateAt(x, y) {
      const planet = this.planetPoints.find(p => Math.hypot(p.x - x, p.y - y) <= p.r);
      if (planet) {
        App.ui.galaxySelectedPlanetId = planet.id;
        renderGalaxyInspector(planet.systemId, planet.id);
        return;
      }
      const systemPoint = this.systemPoints.find(p => Math.hypot(p.x - x, p.y - y) <= p.r);
      if (systemPoint) {
        if (this.activeSystemId === systemPoint.id) return renderGalaxyInspector(systemPoint.id, '');
        this.enterSystem(systemPoint.id);
        return;
      }
      App.ui.galaxySelectedPlanetId = '';
    },
    updateHover(x, y, clientX, clientY) {
      const planetPoint = this.planetPoints.find(p => Math.hypot(p.x - x, p.y - y) <= p.r);
      const systemPoint = !planetPoint && this.systemPoints.find(p => Math.hypot(p.x - x, p.y - y) <= p.r);
      const tip = $('#web-galaxy-tooltip');
      if (!tip) return;
      if (planetPoint) {
        const planet = App.data.planets.get(planetPoint.id);
        tip.innerHTML = `<b>${esc(planet?.name || planetPoint.id)}</b><span>Планета · нажмите для данных</span>`;
      } else if (systemPoint) {
        const system = App.data.systems.find(item => item.id === systemPoint.id);
        tip.innerHTML = `<b>${esc(system?.name || systemPoint.id)}</b><span>Система · ${(system?.planetIds || []).length} планет</span>`;
      } else {
        tip.classList.add('hidden');
        this.canvas.style.cursor = this.dragging ? 'grabbing' : 'grab';
        return;
      }
      tip.style.left = `${Math.min(window.innerWidth - 260, clientX + 16)}px`;
      tip.style.top = `${Math.min(window.innerHeight - 90, clientY + 16)}px`;
      tip.classList.remove('hidden');
      this.canvas.style.cursor = 'pointer';
    },
    syncBackButton() {
      $('#web-galaxy-back')?.classList.toggle('hidden', !this.activeSystemId);
    },
    onDataChanged() {
      if (!this.isMounted()) return;
      const visibleIds = new Set(this.visibleSystems().map(system => system.id));
      if (this.activeSystemId && !visibleIds.has(this.activeSystemId)) {
        this.activeSystemId = '';
        App.ui.galaxySelectedSystemId = '';
        App.ui.galaxySelectedPlanetId = '';
      }
      if (App.ui.galaxySelectedPlanetId && !App.data.planets.has(App.ui.galaxySelectedPlanetId)) App.ui.galaxySelectedPlanetId = '';
      renderGalaxyInspector(App.ui.galaxySelectedSystemId || this.activeSystemId, App.ui.galaxySelectedPlanetId);
      this.syncBackButton();
      this.persistCamera();
    },
    enterSystem(systemId) {
      const system = App.data.systems.find(item => item.id === systemId);
      if (!system) return;
      this.activeSystemId = systemId;
      App.ui.galaxySelectedSystemId = systemId;
      App.ui.galaxySelectedPlanetId = '';
      this.camera.tx = Number(system.pos?.x ?? .5);
      this.camera.ty = Number(system.pos?.y ?? .5);
      this.camera.tzoom = 5.2;
      renderGalaxyInspector(systemId, '');
      this.syncBackButton();
      this.persistCamera();
    },
    exitSystem(preserve = true) {
      const system = App.data.systems.find(item => item.id === this.activeSystemId);
      this.activeSystemId = '';
      App.ui.galaxySelectedSystemId = '';
      App.ui.galaxySelectedPlanetId = '';
      this.camera.tzoom = 1;
      if (!preserve || !system?.pos) { this.camera.tx = .5; this.camera.ty = .5; }
      renderGalaxyInspector('', '');
      this.syncBackButton();
      this.persistCamera();
    },
    recenter() {
      this.activeSystemId = '';
      App.ui.galaxySelectedSystemId = '';
      App.ui.galaxySelectedPlanetId = '';
      this.camera.tx = .5; this.camera.ty = .5; this.camera.tzoom = 1;
      renderGalaxyInspector('', '');
      this.syncBackButton();
      this.persistCamera();
    }
  };

  function renderGalaxyInspector(systemId = '', planetId = '') {
    const root = $('#web-galaxy-inspector');
    if (!root) return;
    const player = currentPlayer();
    const current = currentSystem();
    const system = App.data.systems.find(item => item.id === systemId) || current || WebGalaxyMap.visibleSystems()[0] || null;
    const planet = planetId ? App.data.planets.get(planetId) : null;
    if (planet) {
      root.innerHTML = `
        <div class="eyebrow">PLANET_SCAN</div>
        <h2>${esc(planet.name || planet.id)}</h2>
        ${renderEntityThumb(planet, 'hero')}
        <div class="galaxy-inspector-grid">
          <div><span>Тип</span><b>${esc(planet.physics?.type || '—')}</b></div>
          <div><span>Климат</span><b>${esc(planet.physics?.climate || '—')}</b></div>
          <div><span>Население</span><b>${esc(planet.socio?.pop || '—')}</b></div>
          <div><span>Столица</span><b>${esc(planet.socio?.capital || '—')}</b></div>
        </div>
        <p>${esc(stripHtml(planet.pilot?.reference || planet.pilot?.info || 'Нет открытой справки.'))}</p>
        <div class="button-row"><button class="primary" type="button" data-action="open-planet" data-planet-id="${esc(planet.id)}">ОТКРЫТЬ ДОСЬЕ</button><button class="secondary" type="button" data-action="galaxy-system" data-system-id="${esc(system?.id || '')}">К СИСТЕМЕ</button></div>`;
      return;
    }
    if (system) {
      const planets = WebGalaxyMap.visiblePlanets(system);
      root.innerHTML = `
        <div class="eyebrow">SYSTEM_SCAN</div>
        <h2>${esc(system.name || system.id)}</h2>
        <p class="muted">${esc(system.description || system.markerLabel || 'Доступная звёздная система.')}</p>
        <div class="galaxy-inspector-grid">
          <div><span>Планеты</span><b>${planets.length}</b></div>
          <div><span>Маршруты</span><b>${(system.routes || []).length}</b></div>
          <div><span>Статус</span><b>${current?.id === system.id ? 'ТЕКУЩАЯ' : 'ДОСТУПНА'}</b></div>
          <div><span>Персонаж</span><b>${esc(player?.shortName || player?.displayName || '—')}</b></div>
        </div>
        <div class="galaxy-planet-list">${planets.map(item => `<button class="galaxy-planet-row" type="button" data-action="galaxy-planet" data-system-id="${esc(system.id)}" data-planet-id="${esc(item.id)}"><span class="galaxy-planet-dot" style="--planet:${esc(item.color || '#f0e68c')}"></span><b>${esc(item.name || item.id)}</b><span>${esc(item.physics?.type || '')}</span></button>`).join('') || '<div class="muted">Открытых планет нет.</div>'}</div>`;
      return;
    }
    root.innerHTML = '<div class="eyebrow">GALAXY_NAV</div><h2>Галактическая карта</h2><p class="muted">Выберите систему на карте. Колесо — масштаб, перетаскивание — навигация.</p>';
  }

  function renderGalaxyHome() {
    setTopbar('Галактическая карта', 'Интерактивная навигация по доступным системам и планетам');
    const root = $('#screen-home');
    root.innerHTML = `
      <div class="web-galaxy-layout">
        <section class="web-galaxy-stage" id="web-galaxy-stage">
          <canvas id="web-galaxy-canvas" aria-label="Галактическая карта"></canvas>
          <div class="web-galaxy-controls">
            <button class="secondary hidden" id="web-galaxy-back" type="button" data-action="galaxy-back">← ГАЛАКТИКА</button>
            <button class="secondary" type="button" data-action="galaxy-center">⌾ ЦЕНТР</button>
          </div>
          <div class="web-galaxy-hint">DRAG · PAN &nbsp; / &nbsp; WHEEL · ZOOM &nbsp; / &nbsp; CLICK · OPEN</div>
        </section>
        <aside class="web-galaxy-inspector" id="web-galaxy-inspector"></aside>
      </div>
      <div id="web-galaxy-tooltip" class="web-galaxy-tooltip hidden"></div>`;
    App.ui.galaxyDesktopActive = true;
    renderGalaxyInspector(App.ui.galaxySelectedSystemId, App.ui.galaxySelectedPlanetId);
    requestAnimationFrame(() => WebGalaxyMap.init());
  }

  function renderHome() {
    const desktop = window.matchMedia('(min-width: 901px)').matches;
    if (desktop) return renderGalaxyHome();
    App.ui.galaxyDesktopActive = false;
    WebGalaxyMap.destroy();
    return renderMobileHome();
  }

  function renderMobileHome() {
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
      planets: Array.from(App.data.planets.values()).filter(item => visibleForPlayer(item, playerId)).map(item => ({ ...item, _type: 'planet' })),
      equipment: Array.from(App.data.items.values()).filter(item => visibleForPlayer(item, playerId)).map(item => ({ ...item, _type: 'item' })),
      articles: App.data.articleList.filter(item => visibleForPlayer(item, playerId)).map(item => ({ ...item, _type: 'article' })),
      systems: App.data.systems.filter(item => visibleForPlayer(item, playerId)).map(item => ({ ...item, _type: 'system' }))
    };
  }

  function currentArchiveEntity() {
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

  function filterArchiveItemsV1079(collections = archiveCollections()) {
    const globalScope = App.ui.archiveScopeV1079 === 'all';
    const base = globalScope
      ? ['articles', 'planets', 'systems', 'equipment'].flatMap(section => collections[section] || [])
      : [...(collections[App.ui.archiveTab] || [])];
    const categories = Array.from(new Set(base.map(item => archiveCategoryV1079(item, globalScope)))).sort((a, b) => a.localeCompare(b, 'ru'));
    if (App.ui.archiveCategoryV1079 !== 'all' && !categories.includes(App.ui.archiveCategoryV1079)) App.ui.archiveCategoryV1079 = 'all';
    const favorites = archiveFavoritesV1079();
    const recent = archiveRecentV1079();
    const recentIndex = new Map(recent.map((key, index) => [key, index]));
    const tokens = normalizeArchiveSearchV1079(App.ui.archiveQuery || '').split(' ').filter(Boolean);
    const rows = base.filter(item => {
      const key = archiveEntryKeyV1079(item);
      if (App.ui.archiveCategoryV1079 !== 'all' && archiveCategoryV1079(item, globalScope) !== App.ui.archiveCategoryV1079) return false;
      if (App.ui.archiveStatusV1079 === 'unread' && (item._type !== 'article' || isArchiveArticleRead(item.id))) return false;
      if (App.ui.archiveStatusV1079 === 'favorites' && !favorites.has(key)) return false;
      if (App.ui.archiveStatusV1079 === 'recent' && !recentIndex.has(key)) return false;
      if (!tokens.length) return true;
      const haystack = normalizeArchiveSearchV1079(archiveSearchValuesV1079(item).join(' '));
      return tokens.every(token => haystack.includes(token));
    });
    rows.sort((a, b) => {
      if (App.ui.archiveStatusV1079 === 'recent') return (recentIndex.get(archiveEntryKeyV1079(a)) ?? 999) - (recentIndex.get(archiveEntryKeyV1079(b)) ?? 999);
      if (App.ui.archiveSortV1079 === 'unread') {
        const unreadA = a._type === 'article' && !isArchiveArticleRead(a.id);
        const unreadB = b._type === 'article' && !isArchiveArticleRead(b.id);
        if (unreadA !== unreadB) return Number(unreadB) - Number(unreadA);
      }
      const titleOrder = archiveItemLabel(a).localeCompare(archiveItemLabel(b), 'ru');
      return App.ui.archiveSortV1079 === 'title_desc' ? -titleOrder : titleOrder;
    });
    return { base, rows, categories, globalScope };
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
    if (type === 'item') {
      const req = entity.requirements && typeof entity.requirements === 'object' ? entity.requirements : {};
      const requirementText = Object.entries(req).filter(([, value]) => value !== '' && value != null).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join(' · ');
      return `
        <article class="article-card archive-item-detail-v1060">
          ${renderEntityThumb(entity, 'hero')}
          <div class="eyebrow">Снаряжение</div>
          <h3>${esc(entity.name || entity.id)}</h3>
          <div class="small-note">${esc(entity.rarity || entity.type || entity.category || '')}</div>
          <div class="pill-row" style="margin-top:12px;">
            ${entity.damage ? `<div class="pill">Урон: ${esc(entity.damage)}</div>` : ''}
            ${entity.hitBonus != null && entity.hitBonus !== '' ? `<div class="pill">Попадание: ${Number(entity.hitBonus) >= 0 ? '+' : ''}${esc(entity.hitBonus)}</div>` : ''}
            ${entity.armorClass != null && entity.armorClass !== '' ? `<div class="pill">КБ: ${esc(entity.armorClass)}</div>` : ''}
            ${entity.requiredEnergy != null && entity.requiredEnergy !== '' ? `<div class="pill">Энергия: ${esc(entity.requiredEnergy)}</div>` : ''}
          </div>
          <div class="divider"></div>
          <div class="article-body"><p>${esc(entity.desc || entity.description || entity.summary || 'Описание предмета не задано.')}</p></div>
          ${requirementText ? `<div class="small-note" style="margin-top:12px;"><b>Требования:</b> ${esc(requirementText)}</div>` : ''}
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
    if (!['planets', 'equipment', 'articles', 'systems'].includes(App.ui.archiveTab)) App.ui.archiveTab = 'articles';
    setTopbar('Архив', 'Планеты, снаряжение, статьи и системы');
    const root = $('#screen-archive');
    const collections = archiveCollections();
    const result = filterArchiveItemsV1079(collections);
    const entity = result.rows.find(item => item.id === App.ui.selectedArchiveId && item._type === App.ui.selectedArchiveType) || null;
    const forceGroupsOpen = Boolean(normalizeArchiveSearchV1079(App.ui.archiveQuery)) || App.ui.archiveCategoryV1079 !== 'all' || App.ui.archiveStatusV1079 !== 'all';
    const tabButton = (tab, label) => `<button class="chip-btn ${App.ui.archiveTab === tab && App.ui.archiveScopeV1079 !== 'all' ? 'active' : ''}" data-action="archive-tab" data-tab="${tab}">${label} · ${(collections[tab] || []).length}</button>`;
    root.innerHTML = `
      <div class="segmented archive-top-nav-v1060">
        ${tabButton('articles', 'Статьи')}
        ${tabButton('planets', 'Планеты')}
        ${tabButton('systems', 'Системы')}
        ${tabButton('equipment', 'Снаряжение')}
      </div>
      <div class="archive-search-row archive-tools-v1079" style="margin-top:14px;">
        <div class="archive-search-line-v1079"><input class="input" id="archive-search-input" placeholder="Название, категория или текст материала" value="${esc(App.ui.archiveQuery || '')}" /><button class="secondary archive-clear-v1079" type="button" data-action="archive-clear-v1079" ${App.ui.archiveQuery ? '' : 'disabled'}>Очистить</button></div>
        <div class="archive-filter-grid-v1079">
          <label class="field"><span>Область поиска</span><select class="input" id="archive-scope-v1079"><option value="section" ${App.ui.archiveScopeV1079 === 'section' ? 'selected' : ''}>Текущий раздел</option><option value="all" ${App.ui.archiveScopeV1079 === 'all' ? 'selected' : ''}>Весь архив</option></select></label>
          <label class="field"><span>Категория</span><select class="input" id="archive-category-v1079"><option value="all">Все категории</option>${result.categories.map(category => `<option value="${esc(category)}" ${App.ui.archiveCategoryV1079 === category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
          <label class="field"><span>Подборка</span><select class="input" id="archive-status-v1079"><option value="all" ${App.ui.archiveStatusV1079 === 'all' ? 'selected' : ''}>Все материалы</option><option value="unread" ${App.ui.archiveStatusV1079 === 'unread' ? 'selected' : ''}>Новые</option><option value="favorites" ${App.ui.archiveStatusV1079 === 'favorites' ? 'selected' : ''}>Избранное</option><option value="recent" ${App.ui.archiveStatusV1079 === 'recent' ? 'selected' : ''}>Недавние</option></select></label>
          <label class="field"><span>Сортировка</span><select class="input" id="archive-sort-v1079"><option value="title" ${App.ui.archiveSortV1079 === 'title' ? 'selected' : ''}>Название: А—Я</option><option value="title_desc" ${App.ui.archiveSortV1079 === 'title_desc' ? 'selected' : ''}>Название: Я—А</option><option value="unread" ${App.ui.archiveSortV1079 === 'unread' ? 'selected' : ''}>Сначала новые</option></select></label>
        </div>
        <div class="archive-results-meta-v1079"><span>Найдено: <b>${result.rows.length}</b></span><span>Доступно: ${result.base.length}</span></div>
      </div>
      <div class="archive-split">
        <aside class="archive-sidebar">
          <div class="archive-list-title"><div class="eyebrow">Каталог</div><div class="small-note">Разверните нужную тематическую группу и выберите материал.</div></div>
          <div class="archive-catalog archive-catalog-side">${groupedArchiveMarkup(result.rows, entity, { globalScope: result.globalScope, forceOpen: forceGroupsOpen })}</div>
        </aside>
        <div class="archive-detail-top archive-detail-pane">
          <button class="secondary archive-back-v1079" type="button" data-action="archive-back-v1079">К каталогу</button>
          ${entity ? renderEntityBody(entity) : '<div class="placeholder">Выберите материал в каталоге. Поиск проверяет название, категорию, краткое описание и полный текст.</div>'}
        </div>
      </div>
    `;
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
    setTopbar('Чат', 'Активный канал сверху, список контактов ниже; обновления приходят напрямую через PocketBase Realtime');
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

  function profileItemDetailMarkupV1060(item, meta = {}) {
    if (!item) return '<div class="placeholder">Предмет не найден.</div>';
    const req = item.requirements && typeof item.requirements === 'object' ? item.requirements : {};
    const reqText = Object.entries(req).filter(([, value]) => value !== '' && value != null).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join(' · ');
    return `
      <div class="profile-item-modal-card-v1060">
        <button class="profile-item-modal-close-v1060" type="button" data-action="profile-item-close" aria-label="Закрыть">×</button>
        ${renderEntityThumb(item, 'hero')}
        <div class="eyebrow">${esc(meta.label || item.type || item.category || 'Снаряжение')}</div>
        <h2>${esc(item.name || item.id)}</h2>
        <div class="small-note">${esc(item.rarity || '')}</div>
        <div class="pill-row profile-item-modal-pills-v1060">
          ${meta.qty ? `<div class="pill">Количество: ${Number(meta.qty)}</div>` : ''}
          ${meta.registrationEquipment ? `<div class="pill">Стоимость выбора: ${Number(meta.creationCost || 0)} очк.</div>` : ''}
          ${item.damage ? `<div class="pill">Урон: ${esc(item.damage)}</div>` : ''}
          ${item.hitBonus != null && item.hitBonus !== '' ? `<div class="pill">Попадание: ${Number(item.hitBonus) >= 0 ? '+' : ''}${esc(item.hitBonus)}</div>` : ''}
          ${item.armorClass != null && item.armorClass !== '' ? `<div class="pill">КБ: ${esc(item.armorClass)}</div>` : ''}
          ${item.requiredEnergy != null && item.requiredEnergy !== '' ? `<div class="pill">Энергия: ${esc(item.requiredEnergy)}</div>` : ''}
          <div class="pill">Масса: ${Number(item.mass ?? item.weight ?? 1)}</div>
          <div class="pill">Размер: ${Math.max(1, Number(item.inventoryWidth ?? item.sizeWidth ?? 1))}×${Math.max(1, Number(item.inventoryHeight ?? item.sizeHeight ?? 1))}</div>
        </div>
        <div class="divider"></div>
        <div class="article-body"><p>${esc(item.desc || item.description || item.summary || 'Описание предмета не задано.')}</p></div>
        ${reqText ? `<div class="small-note"><b>Требования:</b> ${esc(reqText)}</div>` : ''}
        ${meta.registrationEquipment ? `<div class="registration-equipment-modal-actions-v1072"><button class="primary" type="button" data-registration-equipment-select-v1072 data-item-id="${esc(item.id)}">${meta.selected ? 'УБРАТЬ ИЗ ВЫБРАННОГО' : 'ВЫБРАТЬ'}</button></div>` : ''}
      </div>`;
  }

  function closeProfileItemModalV1060() {
    App.ui.profileItemModal = null;
    document.getElementById('profile-item-modal-v1060')?.remove();
    document.body.classList.remove('profile-item-modal-open-v1060');
  }

  function openProfileItemModalV1060(itemId, meta = {}) {
    const item = App.data.items.get(String(itemId || ''));
    if (!item) return notify('Предмет не найден', 'warn');
    closeProfileItemModalV1060();
    App.ui.profileItemModal = { itemId: item.id, ...meta };
    const modal = document.createElement('div');
    modal.id = 'profile-item-modal-v1060';
    modal.className = 'profile-item-modal-v1060';
    modal.dataset.action = 'profile-item-close';
    modal.innerHTML = `<div class="profile-item-modal-shell-v1060" data-profile-item-modal-shell>${profileItemDetailMarkupV1060(item, meta)}</div>`;
    document.body.appendChild(modal);
    document.body.classList.add('profile-item-modal-open-v1060');
  }

  function renderProfileCompactItemCardV1060(item, meta = {}) {
    return `
      <article class="entity-card profile-item-card-v1060" data-action="profile-item" data-item-id="${esc(item.id)}" data-item-label="${esc(meta.label || '')}" data-item-qty="${Number(meta.qty || 0)}" tabindex="0" role="button">
        ${renderEntityThumb(item)}
        <div class="profile-item-card-copy-v1060">
          <div class="eyebrow">${esc(meta.label || item.type || item.category || 'Предмет')}</div>
          <h3>${esc(item.name || item.id)}</h3>
          ${meta.qty ? `<div class="pill">×${Number(meta.qty)}</div>` : ''}
        </div>
      </article>`;
  }

  function renderProfile() {
    const root = $('#screen-profile');
    const player = currentPlayer();
    const planet = currentPlanet();
    const row = App.data.playerRows.get(player?.id || '');
    if (!player) {
      setTopbar('Профиль', '');
      root.innerHTML = '<div class="placeholder">Профиль не выбран.</div>';
      return;
    }
    const profileTab = App.ui.profileTab === 'skills' ? 'skills' : 'main';
    const tabsRow = `<div class="segmented profile-tabs-web era-article-top-v1060">
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
    setTopbar('Профиль', '');
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
        <div class="divider"></div><div class="section-head era-article-top-v1060"><div class="section-title">Личность</div></div><div class="personality-profile-grid-v1066"><div class="info-card"><div class="k">Черта характера</div><div class="v">${esc(player.personalityTrait || 'Не указана')}</div></div><div class="info-card"><div class="k">Идеал</div><div class="v">${esc(player.ideal || 'Не указан')}</div></div><div class="info-card"><div class="k">Слабость</div><div class="v">${esc(player.weakness || 'Не указана')}</div></div></div>
      </div>
      <div class="section-head era-article-top-v1060" style="margin-top:18px"><div class="section-title">Текущее снаряжение</div></div>
      <div class="inventory-list profile-item-grid-v1060">
        ${equippedCards.map(({ slot, item }) => renderProfileCompactItemCardV1060(item, { label: equipmentLabel(slot) })).join('') || '<div class="placeholder">Снаряжение не задано.</div>'}
      </div>
      <div class="section-head era-article-top-v1060" style="margin-top:18px"><div class="section-title">Инвентарь</div></div>
      <div class="inventory-list profile-item-grid-v1060">
        ${inventory.map(entry => {
          const item = App.data.items.get(entry.itemId) || { id: entry.itemId, name: entry.itemId, desc: '' };
          return renderProfileCompactItemCardV1060(item, { label: normalizedItemTypeV1052(item)==='stock'?'Акции':(item.type||item.category||'Предмет'), qty: Number(entry.qty || 0) });
        }).join('') || '<div class="placeholder">Инвентарь пуст.</div>'}
      </div>
      ${(Array.isArray(player.implants) && player.implants.length) ? `
        <div class="section-head era-article-top-v1060" style="margin-top:18px"><div class="section-title">Импланты</div></div>
        <div class="card-list">
          ${player.implants.map(implant => `<article class="entity-card"><div class="eyebrow">Имплант</div><h3>${esc(implant.name || 'Имплант')}</h3><div class="small-note">${esc(implant.desc || '')}</div></article>`).join('')}
        </div>
      ` : ''}
      ${(player.abilities && Object.keys(player.abilities).length) ? `
        <div class="section-head era-article-top-v1060" style="margin-top:18px"><div class="section-title">Характеристики</div></div>
        <div class="stat-grid">
          ${Object.entries(player.abilities).map(([key, value]) => `<div class="stat"><div class="data-label">${esc(ABILITY_LABELS[key] || key)}</div><div class="data-value">${esc(value)}</div></div>`).join('')}
        </div>
      ` : ''}
      ${(player.specializations && Object.keys(player.specializations).length) ? `
        <div class="section-head era-article-top-v1060" style="margin-top:18px"><div class="section-title">Специализации</div></div>
        <div class="stat-grid spec-grid-mobile">
          ${Object.entries(player.specializations).filter(([, value]) => Number(value || 0) > 0).map(([key, value]) => `<div class="stat"><div class="data-label">${esc(App.data.skills.get(key)?.name || key)}</div><div class="data-value">${Number(value || 0)}</div></div>`).join('')}
        </div>
      ` : ''}
      ${renderMobileReputation(player)}
    `;
  }

  function renderCurrentScreen() {
    if (App.ui.screen !== 'home') { App.ui.galaxyDesktopActive = false; WebGalaxyMap.destroy(); }
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
    App.ui.archiveScopeV1079 = 'section';
    App.ui.archiveCategoryV1079 = 'all';
    App.ui.archiveStatusV1079 = 'all';
    App.ui.archiveQuery = '';
    App.ui.selectedArchiveId = articleId;
    App.ui.selectedArchiveType = 'article';
    rememberArchiveRecentV1079('article', articleId);
    markArchiveArticleRead(articleId);
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
    App.ui.archiveScopeV1079 = 'section';
    App.ui.archiveCategoryV1079 = 'all';
    App.ui.archiveStatusV1079 = 'all';
    App.ui.archiveQuery = '';
    App.ui.selectedArchiveId = planetId;
    App.ui.selectedArchiveType = 'planet';
    rememberArchiveRecentV1079('planet', planetId);
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



  async function applyRealtimeRecord(collection, event, record) {
    if (!record) return;
    const campaignId = String(record.campaignId || record.campaign_id || '');
    if (campaignId && campaignId !== String(App.config.campaignId || '')) return;
    const isDelete = String(event || '').toLowerCase() === 'delete';

    if (collection === App.config.tableName || Object.prototype.hasOwnProperty.call(record, 'worldJson') || Object.prototype.hasOwnProperty.call(record, 'world_json')) {
      if (isDelete) return;
      const snapshot = normalizeSnapshotRow(record);
      if (!snapshot) return;
      const revision = Number(snapshot.revision || 0);
      if (revision && revision < Number(App.ui.lastSnapshotRevision || 0)) return;
      App.cache.snapshot = snapshot;
      compileData(snapshot, Array.from(App.data.playerRows.values()), App.data.chatRows, App.data.combatRuntime);
      await saveCache();
      renderAffectedScreens({ snapshot: true });
      return;
    }

    if (collection === App.config.playerTableName || record.playerId || record.player_id) {
      const row = normalizePlayerRow(record);
      const playerId = String(row?.player_id || record.playerId || record.player_id || '');
      if (!playerId) return;
      if (isDelete || row?.deleted_at) App.data.playerRows.delete(playerId);
      else App.data.playerRows.set(playerId, row);
      App.data.players = buildPlayerMap(App.cache.snapshot, Array.from(App.data.playerRows.values()));
      await saveCache();
      renderAffectedScreens({ players: true });
      return;
    }

    if (collection === App.config.chatTableName || record.messageId || record.message_id) {
      const row = normalizeChatRow(record);
      const messageId = String(row?.message_id || record.messageId || record.message_id || '');
      if (!messageId) return;
      if (isDelete) App.data.chatRows = App.data.chatRows.filter(item => String(item.message_id) !== messageId);
      else App.data.chatRows = mergeChatRows(App.data.chatRows, [row]);
      App.ui.lastChatStamp = maxUpdatedAt(App.data.chatRows) || App.ui.lastChatStamp;
      await saveCache();
      renderAffectedScreens({ chat: true });
      return;
    }

    if (collection === App.config.combatRuntimeTableName || Object.prototype.hasOwnProperty.call(record, 'runtimeJson') || Object.prototype.hasOwnProperty.call(record, 'runtime_json')) {
      const row = isDelete ? null : normalizeCombatRow(record);
      App.data.combatRuntime = row ? deep(row) : null;
      const activeSceneId = combatRowActiveSceneId(App.data.combatRuntime);
      const activeRuntime = combatRowRuntime(App.data.combatRuntime);
      if (activeSceneId && activeRuntime && Object.keys(activeRuntime).length) App.data.combatRuntimeByScene.set(activeSceneId, deep(activeRuntime));
      App.ui.lastCombatStamp = row?.updated_at || row?.client_updated_at || App.ui.lastCombatStamp;
      await saveCache();
      renderAffectedScreens({ combat: true });
    }
  }

  function handlePocketBaseRealtimePayload(frame) {
    const transportEvent = String(frame?.event || '').trim();
    const event = String(frame?.data?.action || frame?.action || transportEvent || '').trim();
    const record = frame?.data?.record || frame?.record || frame?.data || null;
    if (!record) return;
    const campaignId = String(record.campaignId || record.campaign_id || '');
    if (campaignId && campaignId !== String(App.config.campaignId || '')) return;
    const transportCollection = ['create', 'update', 'delete', 'message'].includes(transportEvent.toLowerCase()) ? '' : transportEvent;
    const collection = String(frame?.data?.collectionName || frame?.data?.collectionId || record.collectionName || record.collectionId || frame?.collectionName || transportCollection || '');
    const key = `${event}:${record.id || ''}:${record.updated || record.updated_at || record.clientUpdatedAt || ''}`;
    if (App.realtime.eventKeys.has(key)) return;
    App.realtime.eventKeys.add(key);
    if (App.realtime.eventKeys.size > 300) App.realtime.eventKeys.delete(App.realtime.eventKeys.values().next().value);
    App.realtime.lastEventAt = Date.now();
    applyRealtimeRecord(collection, event, record).catch(error => console.warn('realtime apply failed', error));
  }

  async function resyncAfterRealtimeGap(reason = 'reconnect') {
    if (!App.session?.userId || !hasConfig() || !navigator.onLine) return;
    const now = Date.now();
    if (now - Number(App.realtime.lastResyncAt || 0) < 1500) return;
    App.realtime.lastResyncAt = now;
    try {
      await pullEverything({ silent: true, render: true });
      console.info('GRPG_WEB_REALTIME_RESYNC', reason);
    } catch (error) {
      console.warn('realtime resync failed', reason, error);
    }
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
        const reconnect = App.realtime.hadConnection;
        App.realtime.connected = true;
        App.realtime.hadConnection = true;
        App.realtime.lastEventAt = Date.now();
        if (reconnect) resyncAfterRealtimeGap('reconnect');
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
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        frames.forEach(parseFrame);
      }
    } catch (error) {
      App.realtime.connected = false;
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
    if (App.realtime.reconnectTimer) clearTimeout(App.realtime.reconnectTimer);
    App.realtime.reconnectTimer = null;
    App.realtime.connected = false;
    try { App.realtime.abortController?.abort(); } catch {}
    App.realtime.abortController = null;
  }

  function startRealtimeSync() {
    stopRealtime();
    if (!hasConfig() || !App.session?.userId) return;
    startRealtime();
  }

  function stopRealtimeSync() {
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
    startRealtimeSync();
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
    startRealtimeSync();
    notify('Гостевой вход выполнен', 'ok');
  }

  async function logout() {
    stopRealtimeSync();
    App.ui.combatFullscreen = false;
    App.session = null;
    await storageRemove(KEYS.session);
    openBoot('login');
    renderLogin();
    syncRememberControls();
  }

  async function forgetThisDevice() {
    stopRealtimeSync();
    App.session = null;
    App.auth = { token: '', expiresAt: 0 };
    App.config = normalizeConfig({});
    App.cache = { snapshot: null, players: [], chat: [], combatRuntime: null, fetchedAt: null };
    App.rememberLogin = false;
    App.rememberUntil = 0;
    await Promise.all([KEYS.config, KEYS.cache, KEYS.session, KEYS.auth, KEYS.remember, KEYS.galaxyView, MOBILE_READ_MARKERS_KEY].map(key => storageRemove(key)));
    syncRememberControls();
    openBoot('login');
    renderLogin();
    notify('Сохранённый вход персонажа удалён. Техническое подключение восстановится автоматически.', 'warn');
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
        updated_by: App.config.deviceLabel || 'web-player',
        ...segments
      });
    } else {
      saved = await apiPatchPlayerWithVersion(App.config, player.id, Number(baseRow.version || 0), {
        updated_by: App.config.deviceLabel || 'web-player',
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
      const capacity = canAddInventoryItemWebV1067(player, itemId, 1);
      if (!capacity.ok) throw new Error(capacity.reason);
      player.credits = Number(player.credits || 0) - cost;
      if (!Array.isArray(player.inventory)) player.inventory = [];
      const existing = player.inventory.find(entry => entry.itemId === itemId);
      if (existing) existing.qty = Number(existing.qty || 0) + 1;
      else player.inventory.push({ itemId, qty: 1, positions: [] });
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
        App.ui.archiveTab = button.dataset.tab;
        App.ui.archiveScopeV1079 = 'section';
        App.ui.archiveCategoryV1079 = 'all';
        App.ui.archiveStatusV1079 = 'all';
        App.ui.archiveQuery = '';
        App.ui.selectedArchiveId = '';
        App.ui.selectedArchiveType = '';
        renderArchive();
      }
      if (action === 'select-archive') {
        App.ui.selectedArchiveType = button.dataset.type;
        App.ui.selectedArchiveId = button.dataset.id;
        rememberArchiveRecentV1079(button.dataset.type, button.dataset.id);
        if (button.dataset.type === 'article') markArchiveArticleRead(button.dataset.id);
        renderArchive();
        if (window.matchMedia('(max-width: 860px)').matches) requestAnimationFrame(() => document.querySelector('.archive-detail-pane')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
      if (action === 'archive-favorite-v1079') {
        toggleArchiveFavoriteV1079(button.dataset.type, button.dataset.id);
        renderArchive();
      }
      if (action === 'archive-clear-v1079') {
        App.ui.archiveQuery = '';
        renderArchive();
        requestAnimationFrame(() => $('#archive-search-input')?.focus());
      }
      if (action === 'archive-back-v1079') document.querySelector('.archive-sidebar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (action === 'open-article') openArticleById(button.dataset.articleId);
      if (action === 'open-planet') openPlanet(button.dataset.planetId);
      if (action === 'open-system') openSystem(button.dataset.systemId);
      if (action === 'focus-system') focusSystem(button.dataset.systemId);
      if (action === 'galaxy-back') WebGalaxyMap.exitSystem(true);
      if (action === 'galaxy-center') WebGalaxyMap.recenter();
      if (action === 'galaxy-system') WebGalaxyMap.enterSystem(button.dataset.systemId);
      if (action === 'galaxy-planet') { App.ui.galaxySelectedPlanetId = button.dataset.planetId || ''; renderGalaxyInspector(button.dataset.systemId, button.dataset.planetId); }
      if (action === 'profile-item') {
        openProfileItemModalV1060(button.dataset.itemId, { label: button.dataset.itemLabel || '', qty: Number(button.dataset.itemQty || 0) });
      }
      if (action === 'profile-item-close') {
        if (event.target === button || event.target.closest('.profile-item-modal-close-v1060')) closeProfileItemModalV1060();
      }
      if (action === 'buy-item') {
        buyItem(button.dataset.itemId, button.dataset.price).catch(error => notify(error.message, 'err'));
      }
      if (action === 'select-thread') {
        App.ui.selectedThreadKey = button.dataset.threadKey;
        openWebChatMasterV1068(button.dataset.threadKey);
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
      if (event.target.id === 'login-remember-login') {
        setRememberLogin(Boolean(event.target.checked)).catch(error => notify(error.message, 'err'));
      }
      if (event.target.id === 'archive-scope-v1079') {
        App.ui.archiveScopeV1079 = event.target.value === 'all' ? 'all' : 'section';
        App.ui.archiveCategoryV1079 = 'all';
        renderArchive();
      }
      if (event.target.id === 'archive-category-v1079') { App.ui.archiveCategoryV1079 = event.target.value || 'all'; renderArchive(); }
      if (event.target.id === 'archive-status-v1079') { App.ui.archiveStatusV1079 = event.target.value || 'all'; renderArchive(); }
      if (event.target.id === 'archive-sort-v1079') { App.ui.archiveSortV1079 = event.target.value || 'title'; renderArchive(); }
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

    document.body.addEventListener('keydown', event => {
      const entry = event.target?.closest?.('.archive-entry-v1079[data-action="select-archive"]');
      if (!entry || event.target?.closest?.('.archive-favorite-v1079') || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      App.ui.selectedArchiveType = entry.dataset.type;
      App.ui.selectedArchiveId = entry.dataset.id;
      rememberArchiveRecentV1079(entry.dataset.type, entry.dataset.id);
      if (entry.dataset.type === 'article') markArchiveArticleRead(entry.dataset.id);
      renderArchive();
    });

    let lastDesktopLayout = window.matchMedia('(min-width: 901px)').matches;
    window.addEventListener('resize', () => {
      if (App.ui.screen === 'combat') requestAnimationFrame(initCombatViewports);
      const desktopLayout = window.matchMedia('(min-width: 901px)').matches;
      if (App.ui.screen === 'home' && desktopLayout !== lastDesktopLayout) renderCurrentScreen();
      lastDesktopLayout = desktopLayout;
    });

    $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
      App.ui.screen = btn.dataset.screen;
      renderCurrentScreen();
    }));

    $('#login-guest-btn')?.addEventListener('click', () => {
      const consent = $('#login-privacy-consent-v1068');
      if (consent && !consent.checked) { consent.reportValidity?.(); return; }
      setRememberLogin(Boolean($('#login-remember-login')?.checked)).then(() => loginGuest()).catch(error => notify(error.message, 'err'));
    });

    $('#web-reload-btn')?.addEventListener('click', () => window.location.reload());

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && App.session?.userId) {
        if (!App.realtime.connected) startRealtime();
        resyncAfterRealtimeGap('visibility-resume');
      }
    });

    window.addEventListener('online', () => {
      if (!App.session?.userId) return;
      startRealtime();
      resyncAfterRealtimeGap('online');
    });
    window.addEventListener('offline', () => notify(RUNTIME.cloudOnly ? 'Сеть пропала, веб-клиент ждёт облако' : 'Сеть пропала, остаёмся на локальном кеше', 'warn'));
  }


  // v1.0.49 campaign availability, era themes and era-aware visibility
  const ERA_DEFS_V1049 = [
    { id: 'medieval', name: 'Средневековье', short: 'СРЕДНЕВЕКОВЬЕ' },
    { id: 'industrial', name: 'Индустриальная', short: 'ИНДУСТРИАЛЬНАЯ' },
    { id: 'technological', name: 'Технологичная', short: 'ТЕХНОЛОГИЧНАЯ' }
  ];
  const ERA_IDS_V1049 = new Set(ERA_DEFS_V1049.map(item => item.id));
  function normalizeEraV1049(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (ERA_IDS_V1049.has(raw)) return raw;
    if (/сред|mediev|feudal|ancient/.test(raw)) return 'medieval';
    if (/индустр|industrial|steam|diesel|analog/.test(raw)) return 'industrial';
    return 'technological';
  }
  function eraDefV1049(value) { const id=normalizeEraV1049(value); return ERA_DEFS_V1049.find(item=>item.id===id)||ERA_DEFS_V1049[2]; }
  function enhanceCampaignV1049(campaign = {}) {
    campaign.era = normalizeEraV1049(campaign.era || campaign.epoch || campaign.theme);
    if (!Object.prototype.hasOwnProperty.call(campaign, 'availableNow')) {
      const status = String(campaign.status || '').trim().toLowerCase();
      campaign.availableNow = !['unavailable','disabled','inactive','closed','archived','недоступна','недоступно'].includes(status);
    } else campaign.availableNow = campaign.availableNow !== false;
    return campaign;
  }
  function campaignsV1049() { return Array.from(App.data.campaigns.values()).map(enhanceCampaignV1049).filter(c=>String(c.status||'').toLowerCase()!=='guest').sort((a,b)=>slugText(a.name||a.id).localeCompare(slugText(b.name||b.id),'ru')); }
  function availableCampaignsV1049() { return campaignsV1049().filter(c=>c.availableNow!==false); }
  function campaignV1049(id) { const c=App.data.campaigns.get(String(id||'')); return c?enhanceCampaignV1049(c):null; }
  function selectedCampaignV1049() {
    const domId=String($('#login-campaign')?.value||'').trim();
    const uiId=String(App.ui.selectedCampaignId||'').trim();
    const sessionId=String(App.session?.campaignId||'').trim();
    let id=domId || (uiId && uiId !== 'all' ? uiId : '') || sessionId;
    if (id && campaignV1049(id)?.availableNow!==false) return id;
    return availableCampaignsV1049()[0]?.id||'';
  }
  function applyEraThemeV1049(campaignOrEra = null) {
    const campaign = typeof campaignOrEra==='object'&&campaignOrEra ? enhanceCampaignV1049(campaignOrEra) : null;
    const era=normalizeEraV1049(campaign?.era||campaignOrEra||'technological');
    document.documentElement.dataset.eraTheme=era;
    document.body?.setAttribute('data-era-theme',era);
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.content=era==='medieval'?'#2a1a0e':era==='industrial'?'#0b0c0c':'#080806';
    const hint=$('#login-campaign-hint');
    if(hint && campaign) hint.textContent=`Эпоха: ${eraDefV1049(era).name}${campaign.availableNow===false?' · Кампания сейчас недоступна':''}`;
    return era;
  }
  function visibilityScopeV1049(entity={}) {
    const vis=entity.visibility&&typeof entity.visibility==='object'?entity.visibility:{};
    const uniq=v=>Array.from(new Set((Array.isArray(v)?v:[]).map(x=>String(x?.id||x?.campaignId||x||'').trim()).filter(Boolean)));
    return { playerIds:uniq(vis.playerIds), campaignIds:uniq(vis.campaignIds||vis.campaigns), eraIds:uniq(vis.eraIds||vis.eras||vis.epochs).map(normalizeEraV1049) };
  }
  function sessionCampaignAllowedV1049() {
    if (!App.session?.userId) return false;
    if (String(App.session.role || '').toLowerCase() === 'guest') return true;
    const player=App.data.players.get(App.session.userId);
    const campaignId=selectedCampaignV1049();
    const campaign=campaignV1049(campaignId);
    return Boolean(player && campaign && campaign.availableNow !== false && campaignIdsForPlayer(player).includes(campaignId));
  }

  const __compileDataEraV1049=compileData;
  compileData=function(snapshot,playerRows,chatRows,combatRuntime){
    const result=__compileDataEraV1049(snapshot,playerRows,chatRows,combatRuntime);
    App.data.campaigns.forEach(c=>enhanceCampaignV1049(c));
    const selected=selectedCampaignV1049();
    if(selected) { App.ui.selectedCampaignId=selected; applyEraThemeV1049(campaignV1049(selected)); }
    return result;
  };

  selectedLoginCampaignId=function(){ return selectedCampaignV1049(); };
  const __applyEraThemeV1052=applyEraThemeV1049;
  applyEraThemeV1049=function(campaignOrEra=null){const era=__applyEraThemeV1052(campaignOrEra);const hint=$('#login-campaign-hint');if(hint)hint.textContent='';return era;};

  campaignOptionsMarkup=function(){
    const selected=selectedCampaignV1049();
    const rows=campaignsV1049();
    return rows.map(row=>`<option value="${esc(row.id)}" ${row.id===selected?'selected':''} ${row.availableNow===false?'disabled':''}>${esc(row.name||row.id)} · ${esc(eraDefV1049(row.era).name)}${row.availableNow===false?' · НЕДОСТУПНА':''}</option>`).join('')||'<option value="">Нет доступных кампаний</option>';
  };

  renderLogin=function(){
    const campaignSelect=$('#login-campaign');
    const playerSelect=$('#login-player');
    if(!playerSelect) return;
    const rows=campaignsV1049();
    let selected=selectedCampaignV1049();
    if(!selected||campaignV1049(selected)?.availableNow===false) selected=availableCampaignsV1049()[0]?.id||'';
    App.ui.selectedCampaignId=selected;
    if(campaignSelect){ campaignSelect.innerHTML=campaignOptionsMarkup(); if(selected) campaignSelect.value=selected; campaignSelect.disabled=!availableCampaignsV1049().length; }
    const campaign=campaignV1049(selected); if(campaign) applyEraThemeV1049(campaign); else applyEraThemeV1049('technological');
    const players=Array.from(App.data.players.values()).filter(player=>String(player.role||'')!=='guest').filter(player=>selected&&campaignIdsForPlayer(player).includes(selected)).sort((a,b)=>slugText(a.displayName||a.id).localeCompare(slugText(b.displayName||b.id),'ru'));
    if(!selected||!players.length){ playerSelect.innerHTML=`<option value="">${selected?'Нет доступных персонажей':'Нет доступных кампаний'}</option>`; $('#login-preview').innerHTML='<div class="muted">Выберите доступную кампанию. Персонажи недоступных кампаний не показываются.</div>'; return; }
    const saved=App.session?.campaignId===selected&&App.session?.userId&&players.some(p=>p.id===App.session.userId)?App.session.userId:players[0].id;
    playerSelect.innerHTML=players.map(player=>`<option value="${esc(player.id)}">${esc(player.displayName||player.shortName||player.id)}</option>`).join('');
    playerSelect.value=saved; renderLoginPreview();
  };

  const __visibleForPlayerEraV1049=visibleForPlayer;
  visibleForPlayer=function(entity,playerId){
    if(!entity) return false;
    if(!entity.visibility||typeof entity.visibility!=='object') return true;
    const vis=visibilityScopeV1049(entity);
    if(!vis.playerIds.length&&!vis.campaignIds.length&&!vis.eraIds.length) return false;
    const pid=String(playerId||'');
    if(vis.playerIds.includes(pid)) return true;
    if(isGuestSession()) return vis.playerIds.includes(GUEST_ID)||vis.playerIds.includes('guest');
    const player=App.data.players.get(pid)||null;
    const active=selectedCampaignV1049();
    const campaignIds=new Set(player?campaignIdsForPlayer(player):[]); if(active) campaignIds.add(active);
    if(vis.campaignIds.some(id=>campaignIds.has(String(id)))) return true;
    const eras=new Set(); campaignIds.forEach(id=>{const c=campaignV1049(id);if(c)eras.add(normalizeEraV1049(c.era));});
    return vis.eraIds.some(id=>eras.has(normalizeEraV1049(id)));
  };

  const __loginEraV1049=login;
  login=async function(playerId,pass){
    const campaignId=selectedCampaignV1049(); const campaign=campaignV1049(campaignId); const player=App.data.players.get(playerId);
    if(!campaign||campaign.availableNow===false) throw new Error('Эта кампания сейчас недоступна');
    if(!player||!campaignIdsForPlayer(player).includes(campaignId)) throw new Error('Персонаж не относится к выбранной кампании');
    App.ui.selectedCampaignId=campaignId; applyEraThemeV1049(campaign);
    await __loginEraV1049(playerId,pass);
    App.session={...(App.session||{}),campaignId,era:normalizeEraV1049(campaign.era)};
    await storageSet(KEYS.session,App.session);
    setTopbar($('#screen-title')?.textContent||'WEB CLIENT',$('#screen-subtitle')?.textContent||'');
  };

  const __loginGuestEraV1049=loginGuest;
  loginGuest=async function(){
    const selected=selectedCampaignV1049(); const campaign=campaignV1049(selected); if(campaign)applyEraThemeV1049(campaign);
    await __loginGuestEraV1049();
    App.session={...(App.session||{}),campaignId:selected||'',era:campaign?normalizeEraV1049(campaign.era):'technological'};
    await storageSet(KEYS.session,App.session);
  };

  const __loadLocalStateEraV1049=loadLocalState;
  loadLocalState=async function(){ await __loadLocalStateEraV1049(); if(App.session?.campaignId)App.ui.selectedCampaignId=String(App.session.campaignId); };

  const __setTopbarEraV1049=setTopbar;
  setTopbar=function(title,subtitle){
    __setTopbarEraV1049(title,subtitle);
    const c=campaignV1049(selectedCampaignV1049());
    const label=$('#campaign-label');
    if(label&&c) label.textContent=`${c.name||c.id} · ${eraDefV1049(c.era).short}`;
  };



  // v1.0.52 registration, origins, approval state and DM full visibility
  const ABILITIES_V1052 = [
    { key:'strength', label:'Сила', short:'СИЛ' },
    { key:'dexterity', label:'Ловкость', short:'ЛОВ' },
    { key:'intelligence', label:'Интеллект', short:'ИНТ' },
    { key:'endurance', label:'Выносливость', short:'ВЫН' },
    { key:'will', label:'Воля', short:'ВОЛ' },
    { key:'glory', label:'Слава', short:'СЛА' }
  ];
  function approvedPlayerV1052(player={}) {
    return String(player.role||'').toLowerCase()==='gm' || String(player.approvalStatus||'approved').toLowerCase()==='approved';
  }
  function socialOriginsV1052() { return App.data.socialOrigins instanceof Map ? App.data.socialOrigins : new Map(); }
  function geographicOriginsV1052() { return App.data.geographicOrigins instanceof Map ? App.data.geographicOrigins : new Map(); }
  function originBonusMapV1052(origin={}) { return Object.fromEntries(ABILITIES_V1052.map(row=>[row.key,Number(origin?.abilityBonuses?.[row.key]||0)])); }
  function playerOriginBonusesV1052(player={}) {
    const out=Object.fromEntries(ABILITIES_V1052.map(row=>[row.key,0]));
    [socialOriginsV1052().get(String(player.socialOriginId||'')),geographicOriginsV1052().get(String(player.geographicOriginId||''))].filter(Boolean).forEach(origin=>ABILITIES_V1052.forEach(row=>{out[row.key]+=Number(origin?.abilityBonuses?.[row.key]||0);}));
    return out;
  }
  function effectiveAbilitiesV1052(player={}) {
    const base=player.abilityBase&&typeof player.abilityBase==='object'?player.abilityBase:(player.abilities||{});
    const bonus=playerOriginBonusesV1052(player);
    return Object.fromEntries(ABILITIES_V1052.map(row=>[row.key,Number(base?.[row.key]||0)+Number(bonus[row.key]||0)]));
  }
  function normalizedItemTypeV1052(item={}) {
    const type=String(item.type||'').toLowerCase();
    const tags=Array.isArray(item.tags)?item.tags.map(tag=>String(tag||'').trim().toLowerCase()):[];
    if(['stock','stocks','share','shares'].includes(type)||String(item.id||'').toLowerCase().startsWith('stock_')||/^акции(?:\s|$)/i.test(String(item.name||'').trim())||tags.some(tag=>['акции','stock','stocks','share','shares'].includes(tag)))return'stock';
    return ['weapon','armor','implant'].includes(type)?type:'gear';
  }
  function effectiveArmorClassV1052(player={}) {
    const armorId=String(player?.equipmentSlots?.armor||'');
    const armor=App.data.items.get(armorId);
    if(armor&&normalizedItemTypeV1052(armor)==='armor'&&Number(armor.armorClass||0)>0)return Number(armor.armorClass);
    return Number(player?.stats?.baseArmorClass||10);
  }
  function visibleOriginsV1052(map) { return Array.from(map.values()).sort((a,b)=>slugText(a.name||a.id).localeCompare(slugText(b.name||b.id),'ru')); }

  const __compileDataV1052=compileData;
  compileData=function(snapshot,playerRows,chatRows,combatRuntime){
    const result=__compileDataV1052(snapshot,playerRows,chatRows,combatRuntime);
    const world=snapshot?.world_json||{};
    App.data.socialOrigins=new Map(Object.entries(world.socialOrigins?.SOCIAL_ORIGINS||{}).map(([id,value])=>[id,deep(value)]));
    App.data.geographicOrigins=new Map(Object.entries(world.geographicOrigins?.GEOGRAPHIC_ORIGINS||{}).map(([id,value])=>[id,deep(value)]));
    App.data.players.forEach(player=>{
      if(!player.approvalStatus)player.approvalStatus=String(player.role||'').toLowerCase()==='gm'?'approved':'approved';
      if(!player.stats)player.stats={};
      if(player.stats.baseArmorClass==null)player.stats.baseArmorClass=10;
      if(!player.abilityBase)player.abilityBase=deep(player.abilities||{});
      player.abilities=effectiveAbilitiesV1052(player);
      player.stats.armorClass=effectiveArmorClassV1052(player);
      if(!Array.isArray(player.installedImplantIds))player.installedImplantIds=[];
    });
    return result;
  };

  campaignOptionsMarkup=function(){
    const selected=selectedCampaignV1049();
    const rows=availableCampaignsV1049();
    return rows.map(row=>`<option value="${esc(row.id)}" ${row.id===selected?'selected':''}>${esc(row.name||row.id)}</option>`).join('')||'<option value="">Нет доступных кампаний</option>';
  };

  renderLogin=function(){
    const campaignSelect=$('#login-campaign');
    const playerSelect=$('#login-player');
    if(!playerSelect)return;
    const campaigns=availableCampaignsV1049();
    let selected=selectedCampaignV1049();
    if(!campaigns.some(c=>c.id===selected))selected=campaigns[0]?.id||'';
    App.ui.selectedCampaignId=selected;
    if(campaignSelect){campaignSelect.innerHTML=campaignOptionsMarkup();if(selected)campaignSelect.value=selected;campaignSelect.disabled=!campaigns.length;}
    const hint=$('#login-campaign-hint');if(hint)hint.textContent='';
    const campaign=campaignV1049(selected);if(campaign)applyEraThemeV1049(campaign);else applyEraThemeV1049('technological');
    const players=Array.from(App.data.players.values())
      .filter(player=>String(player.role||'').toLowerCase()!=='guest')
      .filter(approvedPlayerV1052)
      .filter(player=>String(player.role||'').toLowerCase()==='gm'||(selected&&campaignIdsForPlayer(player).includes(selected)))
      .sort((a,b)=>slugText(a.displayName||a.id).localeCompare(slugText(b.displayName||b.id),'ru'));
    if(!selected||!players.length){playerSelect.innerHTML=`<option value="">${selected?'Нет доступных персонажей':'Нет доступных кампаний'}</option>`;$('#login-preview').innerHTML='<div class="muted">Для входа доступны только персонажи активных кампаний, одобренные ДМом.</div>';return;}
    const saved=App.session?.campaignId===selected&&App.session?.userId&&players.some(p=>p.id===App.session.userId)?App.session.userId:players[0].id;
    playerSelect.innerHTML=players.map(player=>`<option value="${esc(player.id)}">${esc(player.displayName||player.shortName||player.id)}</option>`).join('');
    playerSelect.value=saved;renderLoginPreview();
  };

  const __visibleForPlayerV1052=visibleForPlayer;
  visibleForPlayer=function(entity,playerId){
    const player=App.data.players.get(String(playerId||''));
    if(String(App.session?.role||'').toLowerCase()==='gm'||String(player?.role||'').toLowerCase()==='gm')return true;
    return __visibleForPlayerV1052(entity,playerId);
  };

  function geographicOriginAccessWebV1061(player={}) {
    const origin=geographicOriginsV1052().get(String(player.geographicOriginId||''))||{};
    const planetIds=Array.from(new Set([...(origin.linkedPlanetIds||[]),...(origin.grantedPlanetIds||[])].map(String).filter(Boolean)));
    const systemIds=new Set([...(origin.grantedSystemIds||[])].map(String).filter(Boolean));
    App.data.systems.forEach(system=>{
      if((system.planetIds||[]).some(id=>planetIds.includes(String(id))))systemIds.add(String(system.id||''));
    });
    return {planetIds:new Set(planetIds),systemIds};
  }
  const __visibleForPlayerV1061=visibleForPlayer;
  visibleForPlayer=function(entity,playerId){
    const player=App.data.players.get(String(playerId||''));
    if(player&&String(player.role||'').toLowerCase()!=='gm'&&String(player.role||'').toLowerCase()!=='guest'){
      const access=geographicOriginAccessWebV1061(player);
      const entityId=String(entity?.id||'');
      if(entityId&&App.data.planets.has(entityId)&&access.planetIds.has(entityId))return true;
      if(entityId&&App.data.systems.some(system=>String(system.id||'')===entityId)&&access.systemIds.has(entityId))return true;
    }
    return __visibleForPlayerV1061(entity,playerId);
  };

  sessionCampaignAllowedV1049=function(){
    if(!App.session?.userId)return false;
    if(String(App.session.role||'').toLowerCase()==='guest')return true;
    const player=App.data.players.get(App.session.userId);
    const campaignId=selectedCampaignV1049();const campaign=campaignV1049(campaignId);
    if(!player||!campaign||campaign.availableNow===false||!approvedPlayerV1052(player))return false;
    if(String(player.role||'').toLowerCase()==='gm')return true;
    return campaignIdsForPlayer(player).includes(campaignId);
  };

  login=async function(playerId,pass){
    const player=App.data.players.get(playerId);if(!player)throw new Error('Персонаж не найден');
    const campaignId=selectedCampaignV1049();const campaign=campaignV1049(campaignId);
    if(!campaign||campaign.availableNow===false)throw new Error('Эта кампания сейчас недоступна');
    if(!approvedPlayerV1052(player))throw new Error(String(player.approvalStatus||'')==='pending'?'Анкета ещё ожидает одобрения ДМа':'Анкета персонажа отклонена');
    if(String(player.role||'').toLowerCase()!=='gm'&&!campaignIdsForPlayer(player).includes(campaignId))throw new Error('Персонаж не относится к выбранной кампании');
    if(String(player.role||'')!=='guest'&&String(player.pass||'')!==String(pass||''))throw new Error('Неверный пароль персонажа');
    App.ui.selectedCampaignId=campaignId;applyEraThemeV1049(campaign);
    App.session={userId:playerId,role:player.role||'player',loggedInAt:new Date().toISOString(),campaignId,era:normalizeEraV1049(campaign.era)};
    if(RUNTIME.cloudOnly&&App.rememberLogin)await setRememberLogin(true,{extend:true});
    await storageSet(KEYS.session,App.session);openBoot('app');App.ui.screen='home';renderCurrentScreen();startRealtimeSync();notify(`Вход выполнен: ${player.displayName||player.id}`,'ok');
  };

  const __renderProfileV1052=renderProfile;
  renderProfile=function(){
    const result=__renderProfileV1052();
    const player=currentPlayer();const root=$('#screen-profile');if(!player||!root)return result;
    const statGrid=root.querySelector('.stat-grid');
    if(statGrid&&!statGrid.querySelector('[data-ac-v1052]'))statGrid.insertAdjacentHTML('beforeend',`<div class="stat" data-ac-v1052><div class="data-label">КБ</div><div class="data-value">${effectiveArmorClassV1052(player)}</div></div>`);
    const card=root.querySelector('.profile-card');
    if(card&&!card.querySelector('[data-origin-v1052]')){
      const social=socialOriginsV1052().get(String(player.socialOriginId||''));const geo=geographicOriginsV1052().get(String(player.geographicOriginId||''));
      card.insertAdjacentHTML('beforeend',`<div class="divider"></div><div class="info-grid" data-origin-v1052><div class="info-card"><div class="k">Профессия</div><div class="v">${esc(social?.name||'Не выбрана')}</div></div><div class="info-card"><div class="k">Происхождение</div><div class="v">${esc(geo?.name||'Не выбрано')}</div></div></div>`);
    }
    if(!root.querySelector('[data-implants-v1052]')){
      const installed=(player.installedImplantIds||[]).map(id=>App.data.items.get(String(id))).filter(Boolean).filter(item=>normalizedItemTypeV1052(item)==='implant');
      root.insertAdjacentHTML('beforeend',`<section class="panel" data-implants-v1052><div class="section-head"><div><div class="eyebrow">IMPLANTS</div><div class="section-title">Установленные импланты</div></div></div>${installed.length?`<div class="info-grid">${installed.map(item=>{const req=item.requirements||{};const reqText=ABILITIES_V1052.filter(row=>Number(req[row.key]||0)>0).map(row=>`${row.short} ${Number(req[row.key])}`).join(' · ')||'нет';return `<div class="info-card"><div class="k">${esc(item.name||item.id)}</div><div class="v">${Number(item.energyRequired||0)} EN</div><div class="muted">Требования: ${esc(reqText)}</div></div>`;}).join('')}</div>`:'<div class="muted">Нет установленных имплантов.</div>'}</section>`);
    }
    if(String(App.session?.role||'').toLowerCase()==='gm'&&!root.querySelector('[data-pending-applications-v1052]')){
      const pending=Array.from(App.data.players.values()).filter(p=>String(p.role||'').toLowerCase()!=='gm'&&String(p.approvalStatus||'approved').toLowerCase()==='pending').sort((a,b)=>slugText(a.displayName||a.id).localeCompare(slugText(b.displayName||b.id),'ru'));
      root.insertAdjacentHTML('beforeend',`<section class="panel" data-pending-applications-v1052><div class="section-head"><div><div class="eyebrow">CHARACTER_APPLICATIONS</div><div class="section-title">Заявки персонажей</div></div><span class="chip">${pending.length}</span></div>${pending.length?`<div class="stack">${pending.map(p=>`<div class="info-card application-card-v1052"><div><div class="v">${esc(p.displayName||p.id)}</div><div class="muted">${esc((campaignIdsForPlayer(p).map(id=>App.data.campaigns.get(id)?.name||id).filter(Boolean).join(', '))||'Кампания не указана')}</div></div><div class="row"><button class="primary small" type="button" data-web-approval-v1052="approved" data-player-id="${esc(p.id)}">ОДОБРИТЬ</button><button class="ghost-btn small" type="button" data-web-approval-v1052="rejected" data-player-id="${esc(p.id)}">ОТКЛОНИТЬ</button></div></div>`).join('')}</div>`:'<div class="muted">Новых заявок нет.</div>'}</section>`);
    }
    return result;
  };

  async function setPlayerApprovalV1052(playerId,status){
    if(String(App.session?.role||'').toLowerCase()!=='gm')throw new Error('Требуется профиль ДМа');
    const id=String(playerId||'');const current=App.data.players.get(id);if(!current)throw new Error('Анкета не найдена');
    const baseRow=await apiPullPlayer(App.config,id);
    const merged=buildPlayerMap(App.cache.snapshot,baseRow?[baseRow]:[]).get(id)||deep(current);
    merged.approvalStatus=status;merged.approvalReviewedAt=new Date().toISOString();merged.approvalReviewedBy=App.session.userId||'gm';
    const segments=decomposePlayer(merged);let saved;
    if(baseRow){saved=await apiPatchPlayerWithVersion(App.config,id,Number(baseRow.version||0),{updated_by:App.config.deviceLabel||'web-gm',...segments});if(!saved)throw new Error('Конфликт версии анкеты. Обнови данные и повтори действие.');}
    else saved=await apiUpsertPlayer(App.config,{player_id:id,version:1,updated_by:App.config.deviceLabel||'web-gm',...segments});
    App.data.playerRows.set(id,saved);App.data.players=buildPlayerMap(App.cache.snapshot,Array.from(App.data.playerRows.values()));
    await saveCache();renderCurrentScreen();renderLogin();notify(status==='approved'?'Персонаж одобрен':'Анкета отклонена','ok');
  }
  document.addEventListener('click',async event=>{const btn=event.target?.closest?.('[data-web-approval-v1052]');if(!btn)return;btn.disabled=true;try{await setPlayerApprovalV1052(btn.dataset.playerId,btn.dataset.webApprovalV1052);}catch(error){notify(error.message,'err');btn.disabled=false;}});

  function originBonusBadgesWebV1054(origin={}){
    const bonuses=originBonusMapV1052(origin);const rows=ABILITIES_V1052.filter(row=>Number(bonuses[row.key]||0)!==0).map(row=>`<span class="origin-bonus-v1054 ${Number(bonuses[row.key])>0?'positive':'negative'}">${esc(row.short)} ${Number(bonuses[row.key])>0?'+':''}${Number(bonuses[row.key])}</span>`);
    return rows.length?rows.join(''):'<span class="origin-bonus-v1054 neutral">Без модификаторов</span>';
  }
  function geoTypeLabelWebV1054(type){return({city:'Город',planet:'Планета',region:'Регион / область',station:'Станция',colony:'Колония / поселение',other:'Место происхождения'})[String(type||'other')]||'Место происхождения';}
  function registrationOriginCardsWebV1054(map,fieldName,kind){
    const rows=visibleOriginsV1052(map);if(!rows.length)return'<div class="origin-empty-v1054">ДМ ещё не добавил варианты для выбора.</div>';
    return `<div class="origin-choice-grid-v1054">${rows.map(origin=>{const image=String(origin.image||origin.imageLocal||'').trim();const kicker=kind==='profession'?'ПРОФЕССИЯ':geoTypeLabelWebV1054(origin.locationType);const accessPlanets=kind==='geographic'?[...(origin.linkedPlanetIds||[]),...(origin.grantedPlanetIds||[])].map(id=>App.data.planets.get(String(id))?.name||String(id)).filter(Boolean):[];return `<label class="origin-choice-card-v1054"><input type="radio" name="${fieldName}" value="${esc(origin.id)}" required /><div class="origin-choice-media-v1054">${image?`<img src="${esc(image)}" alt="" />`:`<div class="origin-choice-placeholder-v1054">${kind==='profession'?'PROF':'ORIGIN'}</div>`}</div><div class="origin-choice-body-v1054"><div class="origin-choice-kicker-v1054">${esc(kicker)}</div><div class="origin-choice-title-v1054">${esc(origin.name||origin.id)}</div><div class="origin-choice-description-v1054">${esc(origin.description||'Описание пока не заполнено ДМом.')}</div>${accessPlanets.length?`<div class="muted origin-access-note-v1061">Доступ: ${esc(Array.from(new Set(accessPlanets)).join(' · '))}</div>`:''}<div class="origin-bonuses-v1054">${originBonusBadgesWebV1054(origin)}</div><div class="origin-select-indicator-v1054">ВЫБРАТЬ</div></div></label>`;}).join('')}</div>`;
  }
  const CHARACTER_CREATION_BUDGET_V1066=10;
  function creationEraWebV1066(value){const raw=String(value||'').trim().toLowerCase();if(/сред|mediev|feudal|ancient/.test(raw))return'medieval';if(/индустр|industrial|steam|diesel|analog/.test(raw))return'industrial';return'technological';}
  function creationCostWebV1066(entity={}){return clamp(Math.max(0,Number(entity.creationCost??entity.characterCreationCost??0)),0,CHARACTER_CREATION_BUDGET_V1066);}
  function creationVisibilityWebV1066(entity={}){const vis=entity?.visibility&&typeof entity.visibility==='object'?entity.visibility:{};const uniq=v=>Array.from(new Set((Array.isArray(v)?v:[]).map(x=>String(x?.id||x?.campaignId||x||'').trim()).filter(Boolean)));return{playerIds:uniq(vis.playerIds),campaignIds:uniq(vis.campaignIds||vis.campaigns),eraIds:uniq(vis.eraIds||vis.eras||vis.epochs)};}
  function creationOptionAvailableWebV1066(entity={},campaign=null){
    if(!entity||!campaign||entity.availableNow===false||entity.available===false)return false;
    const vis=creationVisibilityWebV1066(entity);const campaignId=String(campaign.id||'');const era=creationEraWebV1066(campaign.era||campaign.epoch||campaign.theme);
    const campaignMatch=vis.campaignIds.includes(campaignId);const eraMatch=vis.eraIds.map(creationEraWebV1066).includes(era);
    if(vis.campaignIds.length||vis.eraIds.length)return campaignMatch||eraMatch;
    if(vis.playerIds.length)return false;
    return true;
  }
  function creationOriginRowsWebV1066(map,campaign){return Array.from(map.values()).filter(origin=>creationOptionAvailableWebV1066(origin,campaign)).sort((a,b)=>slugText(a.name||a.id).localeCompare(slugText(b.name||b.id),'ru'));}
  function registrationOriginCardsWebV1066(map,fieldName,kind,campaign){
    const rows=creationOriginRowsWebV1066(map,campaign);if(!rows.length)return'<div class="origin-empty-v1054">Для выбранной кампании нет доступных вариантов.</div>';
    return `<div class="origin-choice-grid-v1054">${rows.map(origin=>{const image=String(origin.image||origin.imageLocal||'').trim();const kicker=kind==='profession'?'ПРОФЕССИЯ':geoTypeLabelWebV1054(origin.locationType);const accessPlanets=kind==='geographic'?[...(origin.linkedPlanetIds||[]),...(origin.grantedPlanetIds||[])].map(id=>App.data.planets.get(String(id))?.name||String(id)).filter(Boolean):[];return `<label class="origin-choice-card-v1054 creation-choice-card-v1066"><input type="radio" name="${fieldName}" value="${esc(origin.id)}" required /><div class="origin-choice-media-v1054">${image?`<img src="${esc(image)}" alt="" />`:`<div class="origin-choice-placeholder-v1054">${kind==='profession'?'PROF':'ORIGIN'}</div>`}</div><div class="origin-choice-body-v1054"><div class="origin-choice-kicker-v1054">${esc(kicker)}</div><div class="origin-choice-title-v1054">${esc(origin.name||origin.id)}</div><div class="creation-cost-badge-v1066">${creationCostWebV1066(origin)} ОЧК.</div><div class="origin-choice-description-v1054">${esc(origin.description||'Описание пока не заполнено ДМом.')}</div>${accessPlanets.length?`<div class="muted origin-access-note-v1061">Доступ: ${esc(Array.from(new Set(accessPlanets)).join(' · '))}</div>`:''}<div class="origin-bonuses-v1054">${originBonusBadgesWebV1054(origin)}</div><div class="origin-select-indicator-v1054">ВЫБРАТЬ</div></div></label>`;}).join('')}</div>`;
  }
  function startingEquipmentRowsWebV1066(campaign){return Array.from(App.data.items.values()).filter(item=>(item.availableAsStarting===true||String(item.availableAsStarting||'').toLowerCase()==='true')&&creationOptionAvailableWebV1066(item,campaign)).sort((a,b)=>slugText(a.name||a.id).localeCompare(slugText(b.name||b.id),'ru'));}
  function startingEquipmentTypeWebV1066(item={}){const type=normalizedItemTypeV1052(item);return type==='weapon'?'Оружие':type==='armor'?'Броня':type==='implant'?'Имплант':type==='stock'?'Акции':'Снаряжение';}
  function startingEquipmentCardsWebV1066(campaign){const rows=startingEquipmentRowsWebV1066(campaign);if(!rows.length)return'<div class="origin-empty-v1054">Для этой кампании нет предметов, отмеченных как стартовые.</div>';return `<div class="starting-equipment-grid-v1066">${rows.map(item=>`<div class="starting-equipment-card-v1066" data-registration-equipment-card-v1072 data-item-id="${esc(item.id)}" role="button" tabindex="0" aria-pressed="false"><input type="checkbox" name="startingEquipmentIds" value="${esc(item.id)}" hidden />${renderEntityThumb(item)}<span class="starting-equipment-copy-v1066"><b>${esc(item.name||item.id)}</b><small>${esc(startingEquipmentTypeWebV1066(item))}${item.rarity?` · ${esc(item.rarity)}`:''}</small><small>${esc(item.desc||'')}</small></span><span class="creation-cost-badge-v1066">${creationCostWebV1066(item)} ОЧК.</span><span class="starting-equipment-selected-v1072">ВЫБРАНО</span></div>`).join('')}</div>`;}
  function openStartingEquipmentModalWebV1072(itemId){const form=document.getElementById('register-form-v1052');const item=App.data.items.get(String(itemId||''));const input=form?.querySelector(`[name="startingEquipmentIds"][value="${CSS.escape(String(itemId||''))}"]`);if(!item||!input)return;openProfileItemModalV1060(item.id,{label:'Стартовое снаряжение',registrationEquipment:true,selected:Boolean(input.checked),creationCost:creationCostWebV1066(item)});}
  function creationSelectionWebV1066(form){const campaignId=String(form?.elements?.campaignId?.value||'');const campaign=campaignV1049(campaignId);const socialId=String(form?.querySelector('[name="socialOriginId"]:checked')?.value||'');const geoId=String(form?.querySelector('[name="geographicOriginId"]:checked')?.value||'');const profession=socialOriginsV1052().get(socialId)||null;const geographic=geographicOriginsV1052().get(geoId)||null;const equipmentIds=Array.from(new Set(Array.from(form?.querySelectorAll('[name="startingEquipmentIds"]:checked')||[]).map(n=>String(n.value)).filter(Boolean)));const equipment=equipmentIds.map(id=>App.data.items.get(id)).filter(Boolean);const total=creationCostWebV1066(profession)+creationCostWebV1066(geographic)+equipment.reduce((sum,item)=>sum+creationCostWebV1066(item),0);return{campaign,profession,geographic,equipment,equipmentIds,total};}
  function updateCreationBudgetWebV1066(form){if(!form)return;const selection=creationSelectionWebV1066(form);const node=form.querySelector('[data-creation-budget-v1066]');const submit=form.querySelector('[type="submit"]');const remaining=CHARACTER_CREATION_BUDGET_V1066-selection.total;form.querySelectorAll('[data-registration-equipment-card-v1072]').forEach(card=>{const input=card.querySelector('[name="startingEquipmentIds"]');card.setAttribute('aria-pressed',String(Boolean(input?.checked)));});if(node){node.textContent=`Потрачено: ${selection.total} / ${CHARACTER_CREATION_BUDGET_V1066} · ${remaining>=0?`Осталось: ${remaining}`:`ПЕРЕРАСХОД: ${Math.abs(remaining)}`}`;node.classList.toggle('over-budget',remaining<0);}if(submit)submit.disabled=remaining<0;}
  function refreshRegistrationChoicesWebV1066(form){if(!form)return;const campaign=campaignV1049(String(form.elements?.campaignId?.value||''))||availableCampaignsV1049()[0]||null;const prevSocial=form.querySelector('[name="socialOriginId"]:checked')?.value||'';const prevGeo=form.querySelector('[name="geographicOriginId"]:checked')?.value||'';const prevItems=new Set(Array.from(form.querySelectorAll('[name="startingEquipmentIds"]:checked')).map(n=>n.value));const p=form.querySelector('[data-registration-professions-v1066]'),g=form.querySelector('[data-registration-origins-v1066]'),e=form.querySelector('[data-registration-equipment-v1066]');if(p)p.innerHTML=registrationOriginCardsWebV1066(socialOriginsV1052(),'socialOriginId','profession',campaign);if(g)g.innerHTML=registrationOriginCardsWebV1066(geographicOriginsV1052(),'geographicOriginId','geographic',campaign);if(e)e.innerHTML=startingEquipmentCardsWebV1066(campaign);if(prevSocial){const x=form.querySelector(`[name="socialOriginId"][value="${CSS.escape(prevSocial)}"]`);if(x)x.checked=true;}if(prevGeo){const x=form.querySelector(`[name="geographicOriginId"][value="${CSS.escape(prevGeo)}"]`);if(x)x.checked=true;}prevItems.forEach(id=>{const x=form.querySelector(`[name="startingEquipmentIds"][value="${CSS.escape(id)}"]`);if(x)x.checked=true;});updateCreationBudgetWebV1066(form);}
  function validateRegistrationSelectionWebV1066(form){const sel=creationSelectionWebV1066(form);if(!sel.campaign||sel.campaign.availableNow===false)return{ok:false,message:'Кампания недоступна.',...sel};if(!sel.profession||!creationOptionAvailableWebV1066(sel.profession,sel.campaign))return{ok:false,message:'Выберите доступную профессию.',...sel};if(!sel.geographic||!creationOptionAvailableWebV1066(sel.geographic,sel.campaign))return{ok:false,message:'Выберите доступное происхождение.',...sel};if(sel.equipment.some(item=>!(item.availableAsStarting===true||String(item.availableAsStarting||'').toLowerCase()==='true')||!creationOptionAvailableWebV1066(item,sel.campaign)))return{ok:false,message:'Список стартового снаряжения изменился. Выберите предметы заново.',...sel};if(sel.total>CHARACTER_CREATION_BUDGET_V1066)return{ok:false,message:`Превышен бюджет создания: ${sel.total} / ${CHARACTER_CREATION_BUDGET_V1066}.`,...sel};const starter=buildInventoryLayoutWebV1067({inventorySize:12,carryWeightMax:12,equipmentSlots:{primaryWeapon:'',secondaryWeapon:'',armor:''},implantSlotCount:0,implantSlots:[],inventory:sel.equipmentIds.map(itemId=>({itemId,qty:1,positions:[]}))});if(starter.weight>12+1e-9)return{ok:false,message:`Стартовое снаряжение слишком тяжёлое: ${starter.weight.toFixed(1)} / 12.`,...sel};if(starter.overflow.length)return{ok:false,message:'Стартовое снаряжение не помещается в стандартный инвентарь на 12 клеток.',...sel};return{ok:true,...sel};}
  function registrationMarkupV1052(){
    const campaigns=availableCampaignsV1049();const preferred=String(App.ui?.selectedCampaignId||selectedCampaignV1049()||'');const campaign=campaigns.find(c=>String(c.id)===preferred)||campaigns[0]||null;
    return `<div class="registration-window-v1054" role="dialog" aria-modal="true" aria-labelledby="register-title-v1054"><div class="registration-card-v1052"><div class="registration-sticky-head-v1054 section-head"><div><div class="eyebrow">CHARACTER_APPLICATION</div><div class="section-title" id="register-title-v1054">Регистрация нового персонажа</div><div class="muted">Бюджет создания — максимум ${CHARACTER_CREATION_BUDGET_V1066} очков. Профессия, происхождение и стартовые предметы складываются.</div></div><button class="ghost-btn" type="button" id="register-close-v1052">Закрыть</button></div>
      <form id="register-form-v1052" class="form stack-lg registration-form-v1054"><div class="creation-budget-v1066" data-creation-budget-v1066>Потрачено: 0 / ${CHARACTER_CREATION_BUDGET_V1066} · Осталось: ${CHARACTER_CREATION_BUDGET_V1066}</div><section class="registration-section-v1054"><div class="section-title">Основные данные</div><label class="field"><span>Игровая кампания</span><select class="input" name="campaignId" required>${campaigns.map(c=>`<option value="${esc(c.id)}" ${campaign?.id===c.id?'selected':''}>${esc(c.name||c.id)}</option>`).join('')}</select></label><div class="form-grid-v1052"><label class="field"><span>Имя</span><input class="input" name="displayName" maxlength="80" required /></label><label class="field"><span>Фото персонажа</span><input class="input" name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label></div><label class="field"><span>Описание персонажа</span><textarea class="input area registration-description-v1054" name="description" maxlength="12000" placeholder="Внешность, история, важные детали биографии…"></textarea></label></section>
      <section class="registration-section-v1054"><div class="section-title">Личность</div><div class="form-grid-v1066"><label class="field"><span>Черта характера</span><textarea class="input area" name="personalityTrait" maxlength="3000"></textarea></label><label class="field"><span>Идеал</span><textarea class="input area" name="ideal" maxlength="3000"></textarea></label><label class="field"><span>Слабость</span><textarea class="input area" name="weakness" maxlength="3000"></textarea></label></div></section>
      <section class="registration-section-v1054"><div class="section-title">Профессия</div><p class="muted">Показываются только варианты, доступные выбранной кампании или её эпохе.</p><div data-registration-professions-v1066>${registrationOriginCardsWebV1066(socialOriginsV1052(),'socialOriginId','profession',campaign)}</div></section>
      <section class="registration-section-v1054"><div class="section-title">Происхождение</div><p class="muted">Происхождением может быть город, регион, станция, колония или целая планета.</p><div data-registration-origins-v1066>${registrationOriginCardsWebV1066(geographicOriginsV1052(),'geographicOriginId','geographic',campaign)}</div></section>
      <section class="registration-section-v1054"><div class="section-title">Стартовое снаряжение</div><p class="muted">Можно выбрать несколько предметов. Показываются только предметы с флагом «Доступен как стартовое», доступные кампании или её эпохе.</p><div data-registration-equipment-v1066>${startingEquipmentCardsWebV1066(campaign)}</div></section>
      <section class="registration-section-v1054"><div class="section-title">Доступ</div><div class="form-grid-v1052"><label class="field"><span>Пароль персонажа</span><input class="input" name="pass" type="password" minlength="4" required autocomplete="new-password" /></label><label class="field"><span>Повторите пароль</span><input class="input" name="pass2" type="password" minlength="4" required autocomplete="new-password" /></label></div></section>
      <div class="registration-submit-v1054"><button class="primary" type="submit">ОТПРАВИТЬ АНКЕТУ ДМУ</button><div class="status-line muted" id="register-status-v1052"></div></div></form></div></div>`;
  }
  async function resizeRegistrationPhotoV1052(file){
    if(!file||!file.size)return '';
    if(file.size>20*1024*1024)throw new Error('Фото для анкеты должно быть меньше 20 МБ');
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Не удалось прочитать фото'));reader.readAsDataURL(file);});
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Не удалось декодировать фото'));img.src=dataUrl;});
    const max=640;const scale=Math.min(1,max/Math.max(image.width||1,image.height||1));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',0.82);
  }
  function openRegistrationV1052(){const panel=$('#registration-panel-v1052');if(!panel)return;if(panel.parentElement!==document.body)document.body.appendChild(panel);panel.innerHTML=registrationMarkupV1052();panel.classList.remove('hidden');document.body.classList.add('registration-open-v1054');}
  function closeRegistrationV1052(){closeProfileItemModalV1060();const panel=$('#registration-panel-v1052');if(panel){panel.classList.add('hidden');panel.innerHTML='';document.body.classList.remove('registration-open-v1054');}}
  document.addEventListener('click',event=>{
    if(event.target?.id==='register-open-v1052')openRegistrationV1052();
    const equipmentCard=event.target?.closest?.('[data-registration-equipment-card-v1072]');
    if(equipmentCard&&equipmentCard.closest('#registration-panel-v1052')){event.preventDefault();openStartingEquipmentModalWebV1072(equipmentCard.dataset.itemId);return;}
    const equipmentSelect=event.target?.closest?.('[data-registration-equipment-select-v1072]');
    if(equipmentSelect){const form=document.getElementById('register-form-v1052');const itemId=String(equipmentSelect.dataset.itemId||'');const input=form?.querySelector(`[name="startingEquipmentIds"][value="${CSS.escape(itemId)}"]`);if(input){input.checked=!input.checked;input.dispatchEvent(new Event('change',{bubbles:true}));}closeProfileItemModalV1060();return;}
    if(event.target?.id==='register-close-v1052'||event.target?.classList?.contains('registration-window-v1054'))closeRegistrationV1052();
  });
  document.addEventListener('change',event=>{const form=event.target?.closest?.('#register-form-v1052');if(!form)return;if(event.target?.name==='campaignId')refreshRegistrationChoicesWebV1066(form);else if(['socialOriginId','geographicOriginId','startingEquipmentIds'].includes(String(event.target?.name||'')))updateCreationBudgetWebV1066(form);});
  document.addEventListener('keydown',event=>{const card=event.target?.closest?.('[data-registration-equipment-card-v1072]');if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openStartingEquipmentModalWebV1072(card.dataset.itemId);return;}if(event.key==='Escape'&&App.ui.profileItemModal?.registrationEquipment){closeProfileItemModalV1060();return;}if(event.key==='Escape'&&!$('#registration-panel-v1052')?.classList.contains('hidden'))closeRegistrationV1052();});
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.getElementById('profile-item-modal-v1060')) closeProfileItemModalV1060(); });
  document.addEventListener('submit',async event=>{
    if(event.target?.id!=='register-form-v1052')return;event.preventDefault();
    const form=event.target;const fd=new FormData(form);const status=form.querySelector('#register-status-v1052');const campaignId=String(fd.get('campaignId')||'');const campaign=campaignV1049(campaignId);
    if(!campaign||campaign.availableNow===false){status.textContent='Кампания недоступна.';return;}
    const creation=validateRegistrationSelectionWebV1066(form);if(!creation.ok){status.textContent=creation.message;updateCreationBudgetWebV1066(form);return;}
    const pass=String(fd.get('pass')||'');if(pass!==String(fd.get('pass2')||'')){status.textContent='Пароли не совпадают.';return;}
    const name=String(fd.get('displayName')||'').trim();if(!name)return;status.textContent='Отправка анкеты…';
    try{
      let id=slugText(name).replace(/[^a-zа-яё0-9]+/gi,'_').replace(/^_+|_+$/g,'').toLowerCase()||`player_${Date.now()}`;if(App.data.players.has(id))id=`${id}_${Date.now().toString(36).slice(-5)}`;
      const image=await resizeRegistrationPhotoV1052(form.elements.photo?.files?.[0]);
      const baseAbilities=Object.fromEntries(ABILITIES_V1052.map(row=>[row.key,0]));
      const player={id,role:'player',pass,displayName:name,shortName:name,rank:'Новый персонаж',avatarGlyph:name.slice(0,2).toUpperCase(),lore:String(fd.get('description')||'').trim(),notes:'',image,personalityTrait:String(fd.get('personalityTrait')||'').trim(),ideal:String(fd.get('ideal')||'').trim(),weakness:String(fd.get('weakness')||'').trim(),approvalStatus:'pending',allowCrossCampaignDirectMessages:false,applicationSubmittedAt:new Date().toISOString(),campaignIds:[campaignId],socialOriginId:creation.profession.id,geographicOriginId:creation.geographic.id,creationPointsSpent:creation.total,startingEquipmentIds:creation.equipmentIds,credits:0,stats:{hpCurrent:10,hpMax:10,shieldCurrent:0,shieldMax:0,energyCurrent:1,energyMax:1,baseArmorClass:10},abilities:baseAbilities,abilityBase:baseAbilities,equipmentSlots:{primaryWeapon:'',secondaryWeapon:'',armor:''},implantSlotCount:0,implantSlots:[],installedImplantIds:[],inventorySize:12,carryWeightMax:12,inventory:creation.equipmentIds.map(itemId=>({itemId,qty:1,positions:[]})),social:{npcIds:[],orgs:[],reputation:[]},currentPlanetId:'',relatedArticleIds:[]};
      const segments=decomposePlayer(player);const saved=await apiUpsertPlayer(App.config,{player_id:id,version:1,updated_by:App.config.deviceLabel||'web-registration',...segments});App.data.playerRows.set(id,saved);App.data.players=buildPlayerMap(App.cache.snapshot,Array.from(App.data.playerRows.values()));await saveCache();status.textContent='Анкета отправлена ДМу. После одобрения персонаж появится во входе.';form.reset();renderLogin();
    }catch(error){status.textContent=`Не удалось отправить анкету: ${error.message}`;}
  });


  // v1.0.62: campaign-wide chat + NPC contacts in Web + GM actor impersonation in campaign channels.
  function logicalCampaignIdV1062() {
    return String(App.session?.campaignId || App.ui?.selectedCampaignId || selectedCampaignV1049() || '').trim();
  }
  function campaignThreadKeyV1062(campaignId = logicalCampaignIdV1062()) {
    return `campaign::${String(campaignId || '').trim()}`;
  }
  function approvedCampaignPlayersV1062(campaignId = logicalCampaignIdV1062()) {
    const id = String(campaignId || '').trim();
    if (!id) return [];
    return Array.from(App.data.players.values())
      .filter(player => String(player.role || '').toLowerCase() !== 'guest')
      .filter(player => approvedPlayerV1052(player))
      .filter(player => String(player.role || '').toLowerCase() === 'gm' || campaignIdsForPlayer(player).includes(id))
      .sort((a,b)=>slugText(a.displayName||a.id).localeCompare(slugText(b.displayName||b.id),'ru'));
  }
  function crossCampaignDirectEnabledV1063(player = {}) {
    return player?.allowCrossCampaignDirectMessages === true || String(player?.allowCrossCampaignDirectMessages || '').toLowerCase() === 'true';
  }
  function canPlayersDirectMessageV1063(sender = currentPlayer(), target = null, campaignId = logicalCampaignIdV1062()) {
    if (!sender || !target) return false;
    if (String(target.role || '').toLowerCase() === 'gm') return false;
    if (String(sender.role || '').toLowerCase() === 'gm') return approvedPlayerV1052(target);
    if (!approvedPlayerV1052(sender) || !approvedPlayerV1052(target)) return false;
    const activeCampaign = String(campaignId || '').trim();
    if (activeCampaign && campaignIdsForPlayer(target).includes(activeCampaign)) return true;
    return crossCampaignDirectEnabledV1063(sender) || crossCampaignDirectEnabledV1063(target);
  }

  function campaignNpcOptionsV1062(player = currentPlayer()) {
    return Array.from(App.data.npcs.values())
      .filter(npc => {
        if (!npc) return false;
        if (String(App.session?.role || '').toLowerCase() === 'gm') return true;
        return npcAllowsPlayerChat(npc) && visibleForPlayer(npc, player?.id || App.session?.userId || '');
      })
      .sort((a,b)=>slugText(a.name||a.id).localeCompare(slugText(b.name||b.id),'ru'));
  }
  function campaignThreadV1062() {
    const campaignId = logicalCampaignIdV1062();
    if (!campaignId || String(App.session?.role || '').toLowerCase() === 'guest') return null;
    const campaign = App.data.campaigns.get(campaignId) || { id: campaignId, name: campaignId };
    const members = approvedCampaignPlayersV1062(campaignId).filter(player => String(player.role || '').toLowerCase() !== 'gm');
    return {
      key: campaignThreadKeyV1062(campaignId),
      label: `Общий чат · ${campaign.name || campaign.id}`,
      type: 'campaign',
      campaignId,
      subtitle: `${members.length} ${members.length === 1 ? 'персонаж' : (members.length >= 2 && members.length <= 4 ? 'персонажа' : 'персонажей')} · ДМ`,
      entity: campaign,
      members
    };
  }

  const __buildThreadsV1062 = buildThreads;
  buildThreads = function() {
    const player = currentPlayer();
    if (!player) return [];
    const campaignId = logicalCampaignIdV1062();
    const rows = [];
    const campaignThread = campaignThreadV1062();
    if (campaignThread) rows.push(campaignThread);

    Array.from(App.data.players.values())
      .filter(other => other && other.id !== player.id && String(other.role || '').toLowerCase() !== 'guest')
      .filter(other => String(other.role || '').toLowerCase() !== 'gm' && approvedPlayerV1052(other))
      .filter(other => canPlayersDirectMessageV1063(player, other, campaignId))
      .sort((a,b)=>slugText(a.displayName||a.id).localeCompare(slugText(b.displayName||b.id),'ru'))
      .forEach(other => {
        const threadKey = [player.id, other.id].sort().join('__');
        const sameCurrentCampaign = campaignIdsForPlayer(other).includes(campaignId);
        rows.push({ key: threadKey, label: other.displayName || other.id, type: 'direct', otherId: other.id, subtitle: String(other.role || '').toLowerCase() === 'gm' ? 'ДМ' : (sameCurrentCampaign ? (other.rank || 'Игрок') : `${other.rank || 'Игрок'} · другая кампания`), entity: other });
      });

    campaignNpcOptionsV1062(player).forEach(npc => {
      const threadKey = `${npc.id}__${player.id}`;
      rows.push({ key: threadKey, label: npc.name || npc.id, type: 'npc', npcId: npc.id, subtitle: npc.role || 'NPC', entity: npc });
    });
    return rows;
  };

  function campaignMessageActorMarkupV1062(row, selected) {
    const own = String(row.sender_id || '') === String(App.session?.userId || '') && String(row.sender_type || '') !== 'npc';
    const actor = messageActor(row, selected);
    return {
      own,
      actor,
      label: row.author_label || actor?.displayName || actor?.name || (own ? (currentPlayer()?.displayName || 'Ты') : 'Участник')
    };
  }
  function campaignMemberLineV1062(thread) {
    if (!thread || thread.type !== 'campaign') return '';
    const names = (thread.members || []).map(player => player.displayName || player.id).filter(Boolean);
    return `<div class="campaign-chat-members-v1062"><span class="eyebrow">УЧАСТНИКИ</span><span>${esc(names.join(' · ') || 'Пока нет одобренных персонажей')}</span><span>· ДМ</span></div>`;
  }
  function gmCampaignActorSelectV1062(thread) {
    if (String(App.session?.role || '').toLowerCase() !== 'gm' || thread?.type !== 'campaign') return '';
    const gm = currentPlayer();
    const npcs = campaignNpcOptionsV1062(gm);
    return `<label class="field campaign-actor-field-v1062"><span>Писать от лица</span><select class="input" name="actor"><option value="gm:${esc(gm?.id || App.session?.userId || '')}">ДМ · ${esc(gm?.displayName || gm?.shortName || 'Ведущий')}</option>${npcs.map(npc=>`<option value="npc:${esc(npc.id)}">NPC · ${esc(npc.name || npc.id)}</option>`).join('')}</select></label>`;
  }

  const __renderChatV1062 = renderChat;
  renderChat = function() {
    setTopbar('Чат', 'Общий канал кампании, личные диалоги и NPC · PocketBase Realtime');
    const root = $('#screen-chat');
    const threads = buildThreads();
    if (!App.ui.selectedThreadKey || !threads.some(thread => thread.key === App.ui.selectedThreadKey)) {
      App.ui.selectedThreadKey = threads[0]?.key || '';
    }
    const selected = threads.find(thread => thread.key === App.ui.selectedThreadKey) || threads[0] || null;
    const messages = selected ? messagesForThread(selected.key) : [];
    root.innerHTML = `
      <div class="chat-mobile-layout">
        <div class="card chat-active-card" style="padding:16px;">
          <div class="section-head">
            <div class="thread-row compact">
              ${selected ? renderEntityAvatar(selected.entity || {}, selected.label, 'sm') : ''}
              <div><div class="section-title">${esc(selected?.label || 'Канал')}</div><div class="small-note">${esc(selected?.subtitle || '')}</div></div>
            </div>
          </div>
          ${campaignMemberLineV1062(selected)}
          <div class="message-list">
            ${messages.map(row => {
              const meta = campaignMessageActorMarkupV1062(row, selected);
              return `
                <div class="chat-row ${meta.own ? 'own' : ''}">
                  ${renderEntityAvatar(meta.actor || {}, meta.label, 'sm')}
                  <div class="chat-bubble ${meta.own ? 'own' : ''} ${row.sender_type === 'npc' ? 'npc-message-v1062' : ''}">
                    <div class="chat-meta">${esc(meta.label)} · ${formatDate(row.created_at)}</div>
                    <div class="article-body">${normalizeRichHtml(row.body_html || '')}</div>
                  </div>
                </div>
              `;
            }).join('') || '<div class="placeholder">Сообщений ещё нет.</div>'}
          </div>
          ${selected ? `
            <form id="chat-compose-form" class="chat-compose" data-thread-key="${esc(selected.key)}">
              ${gmCampaignActorSelectV1062(selected)}
              <textarea class="textarea" name="body" rows="4" placeholder="${selected.type === 'campaign' ? 'Написать в общий чат кампании...' : selected.type === 'npc' ? 'Написать NPC...' : 'Написать сообщение...'}">${esc(App.ui.chatDrafts[selected.key] || '')}</textarea>
              <button class="primary" type="submit">Отправить</button>
            </form>
          ` : ''}
        </div>
        <div class="thread-list chat-contact-list">
          ${threads.map(thread => {
            const last = messagesForThread(thread.key).slice(-1)[0] || null;
            const eyebrow = thread.type === 'campaign' ? 'CAMPAIGN CHANNEL' : (thread.type === 'npc' ? 'NPC THREAD' : 'DIRECT THREAD');
            return `
              <article class="thread-card ${thread.key === selected?.key ? 'active' : ''} ${thread.type === 'campaign' ? 'campaign-thread-card-v1062' : ''}">
                <div class="thread-row">
                  ${renderEntityAvatar(thread.entity || {}, thread.label)}
                  <div class="thread-copy">
                    <div class="eyebrow">${eyebrow}</div>
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
  };

  const __sendMessageV1062 = sendMessage;
  sendMessage = async function(form) {
    const threadKey = String(form?.dataset?.threadKey || '');
    const thread = buildThreads().find(item => item.key === threadKey);
    if (!thread) return __sendMessageV1062(form);
    if (thread.type === 'direct') {
      const sender = currentPlayer();
      const target = App.data.players.get(thread.otherId);
      if (!canPlayersDirectMessageV1063(sender, target, logicalCampaignIdV1062())) throw new Error('Личный чат с персонажем другой кампании запрещён его настройками.');
      return __sendMessageV1062(form);
    }
    if (thread.type !== 'campaign') return __sendMessageV1062(form);
    const fd = new FormData(form);
    const body = String(fd.get('body') || '').trim();
    if (!body) return;
    const player = currentPlayer();
    if (!player) throw new Error('Профиль не найден');
    const campaignId = String(thread.campaignId || logicalCampaignIdV1062());
    if (!campaignId) throw new Error('Кампания не выбрана');

    let senderType = 'player';
    let senderId = player.id;
    let npcId = null;
    let authorLabel = player.displayName || player.id;
    if (String(App.session?.role || '').toLowerCase() === 'gm') {
      const actor = String(fd.get('actor') || `gm:${player.id}`);
      if (actor.startsWith('npc:')) {
        const requestedNpcId = actor.slice(4);
        const npc = App.data.npcs.get(requestedNpcId);
        if (!npc) throw new Error('NPC не найден');
        senderType = 'npc';
        senderId = npc.id;
        npcId = npc.id;
        authorLabel = npc.name || npc.id;
      }
    }

    const row = {
      message_id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      // Reuse the established PocketBase kind value; campaign identity is the thread_key prefix.
      kind: 'direct',
      thread_key: campaignThreadKeyV1062(campaignId),
      sender_type: senderType,
      sender_id: senderId,
      // Keep recipientPlayerId non-empty for existing PocketBase schemas that mark it required.
      recipient_player_id: player.id,
      npc_id: npcId,
      direct_a: null,
      direct_b: null,
      author_label: authorLabel,
      body_html: `<p>${esc(body)}</p>`
    };
    const saved = await apiUpsertChat(App.config, row);
    App.data.chatRows = mergeChatRows(App.data.chatRows, [saved]);
    await saveCache();
    App.ui.chatDrafts[thread.key] = '';
    form.reset();
    renderChat();
    notify(senderType === 'npc' ? `Сообщение отправлено от имени ${authorLabel}` : 'Сообщение отправлено в общий чат', 'ok');
  };


  /* v1.0.65 web chat unread state + scalable NPC selectors */
  const CHAT_READ_STORAGE_PREFIX_V1065 = 'grpg.web.chatRead.v1065';

  function chatReadStorageKeyV1065() {
    const playerId = String(App.session?.userId || 'guest');
    const campaignId = String(logicalCampaignIdV1062?.() || App.config?.campaignId || 'main');
    return `${CHAT_READ_STORAGE_PREFIX_V1065}:${playerId}:${campaignId}`;
  }

  function messageStampV1065(row = {}) {
    const raw = row.created_at || row.updated_at || row.client_updated_at || '';
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isOwnChatMessageV1065(row = {}) {
    const playerId = String(App.session?.userId || '');
    if (String(row.sender_type || '') === 'player' && String(row.sender_id || '') === playerId) return true;
    // NPC messages in the Web client are authored by the GM. Do not notify the GM
    // about their own impersonated NPC messages.
    if (String(App.session?.role || '').toLowerCase() === 'gm' && String(row.sender_type || '') === 'npc') return true;
    return false;
  }

  function writeChatReadStateV1065(state) {
    try { window.localStorage.setItem(chatReadStorageKeyV1065(), JSON.stringify(state)); } catch {}
  }

  function ensureChatReadStateV1065(threads = buildThreads()) {
    const key = chatReadStorageKeyV1065();
    let state = jsonStorageRead(window.localStorage, key, null);
    if (!state || typeof state !== 'object' || state.version !== 1 || !state.threads || typeof state.threads !== 'object') {
      const initializedAt = Date.now();
      state = { version: 1, initializedAt, threads: {} };
      // v1.0.65 introduces unread tracking for the first time. Existing history is
      // treated as already read so users do not receive a wall of legacy badges.
      for (const thread of threads) {
        const latest = messagesForThread(thread.key).reduce((max, row) => Math.max(max, messageStampV1065(row)), 0);
        state.threads[thread.key] = latest || initializedAt;
      }
      writeChatReadStateV1065(state);
    }
    return state;
  }

  function threadUnreadCountV1065(thread, state = ensureChatReadStateV1065()) {
    if (!thread?.key) return 0;
    const readAt = Number(state.threads?.[thread.key] ?? state.initializedAt ?? 0);
    return messagesForThread(thread.key).reduce((count, row) => {
      if (row.deleted_at || isOwnChatMessageV1065(row)) return count;
      return messageStampV1065(row) > readAt ? count + 1 : count;
    }, 0);
  }

  function markThreadReadV1065(threadKey) {
    const key = String(threadKey || '');
    if (!key) return;
    const state = ensureChatReadStateV1065();
    const latest = messagesForThread(key).reduce((max, row) => Math.max(max, messageStampV1065(row)), 0);
    state.threads[key] = Math.max(Number(state.threads[key] || 0), latest || Date.now());
    writeChatReadStateV1065(state);
  }

  function setUnreadBadgeTextV1065(node, count) {
    if (!node) return;
    const value = Number(count || 0);
    node.textContent = value > 99 ? '99+' : String(value);
    node.hidden = value <= 0;
    node.setAttribute('aria-label', value > 0 ? `Непрочитанных сообщений: ${value}` : 'Нет непрочитанных сообщений');
  }

  function updateChatUnreadIndicatorsV1065(options = {}) {
    if (!App.session?.userId || App.ui.boot !== 'app') return;
    const threads = buildThreads();
    if (options.markSelected && App.ui.screen === 'chat' && App.ui.selectedThreadKey) markThreadReadV1065(App.ui.selectedThreadKey);
    const state = ensureChatReadStateV1065(threads);
    let total = 0;
    const counts = new Map();
    for (const thread of threads) {
      const count = threadUnreadCountV1065(thread, state);
      counts.set(thread.key, count);
      total += count;
    }

    const navButton = document.querySelector('.nav-btn[data-screen="chat"]');
    if (navButton) {
      let badge = navButton.querySelector('.chat-nav-unread-v1065');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'chat-nav-unread-v1065';
        navButton.appendChild(badge);
      }
      setUnreadBadgeTextV1065(badge, total);
      navButton.classList.toggle('has-unread-v1065', total > 0);
    }

    document.querySelectorAll('#screen-chat [data-action="select-thread"][data-thread-key]').forEach(button => {
      const threadKey = String(button.dataset.threadKey || '');
      const card = button.closest('.thread-card');
      if (!card) return;
      let badge = card.querySelector('.chat-thread-unread-v1065');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'chat-thread-unread-v1065';
        const row = card.querySelector('.thread-row') || card;
        row.appendChild(badge);
      }
      const count = counts.get(threadKey) || 0;
      setUnreadBadgeTextV1065(badge, count);
      card.classList.toggle('has-unread-v1065', count > 0);
    });
  }

  function enhanceWebNpcPickersV1065(root = document) {
    root?.querySelectorAll?.('select[name="actor"], select[name="npcId"]').forEach(select => {
      const npcCount = Array.from(select.options || []).filter(option => String(option.value || '').startsWith('npc:') || select.name === 'npcId').length;
      if (npcCount <= 6) {
        select.removeAttribute('size');
        select.classList.remove('npc-scroll-select-v1064', 'npc-scroll-select-v1065');
        return;
      }
      select.dataset.scrollableNpcV1065 = '1';
      select.classList.add('npc-scroll-select-v1065');
      select.size = Math.min(8, Math.max(6, npcCount + (select.name === 'actor' ? 1 : 0)));
      select.title = 'Список NPC прокручивается';
    });
  }

  const __renderChatV1065 = renderChat;
  renderChat = function() {
    const result = __renderChatV1065();
    requestAnimationFrame(() => {
      enhanceWebNpcPickersV1065(document.getElementById('screen-chat') || document);
      updateChatUnreadIndicatorsV1065({ markSelected: true });
    });
    return result;
  };

  const __renderCurrentScreenV1065 = renderCurrentScreen;
  renderCurrentScreen = function() {
    const result = __renderCurrentScreenV1065();
    requestAnimationFrame(() => updateChatUnreadIndicatorsV1065({ markSelected: App.ui.screen === 'chat' }));
    return result;
  };

  const __renderAffectedScreensV1065 = renderAffectedScreens;
  renderAffectedScreens = function(changed = {}) {
    const result = __renderAffectedScreensV1065(changed);
    if (changed.chat) requestAnimationFrame(() => updateChatUnreadIndicatorsV1065({ markSelected: App.ui.screen === 'chat' }));
    return result;
  };


  /* v1.0.68 chat list + separate conversation master window */
  function gmChatActorSelectV1068(thread) {
    if (String(App.session?.role || '').toLowerCase() !== 'gm' || !thread || !['campaign','direct'].includes(thread.type)) return '';
    const gm = currentPlayer();
    const npcs = campaignNpcOptionsV1062(gm);
    return `<label class="field campaign-actor-field-v1062 chat-master-actor-v1068"><span>Писать от лица</span><select class="input" name="actor"><option value="gm:${esc(gm?.id || App.session?.userId || '')}">ДМ · ${esc(gm?.displayName || gm?.shortName || 'Ведущий')}</option>${npcs.map(npc=>`<option value="npc:${esc(npc.id)}">NPC · ${esc(npc.name || npc.id)}</option>`).join('')}</select></label>`;
  }

  function canManageChatRowWebV1078(row = {}) {
    if (String(App.session?.role || '').toLowerCase() === 'gm') return true;
    return String(row.sender_type || '') === 'player'
      && String(row.sender_id || '') === String(App.session?.userId || '');
  }

  function chatRowMetaWebV1078(row = {}, label = '') {
    return `${esc(label)} · ${formatDate(row.created_at)}${row.edited_at ? ' · изменено' : ''}`;
  }

  function chatRowControlsWebV1078(row = {}) {
    if (!canManageChatRowWebV1078(row)) return '';
    return `<div class="chat-actions-v1078">
      <button class="chat-action-v1078" type="button" data-web-chat-action-v1078="edit" data-message-id="${esc(row.message_id)}">Изменить</button>
      <button class="chat-action-v1078 danger" type="button" data-web-chat-action-v1078="delete" data-message-id="${esc(row.message_id)}">Скрыть</button>
    </div>`;
  }

  function findWebChatRowV1078(messageId) {
    return App.data.chatRows.find(row => String(row?.message_id || '') === String(messageId || '')) || null;
  }

  async function editWebChatRowV1078(row) {
    if (!row || !canManageChatRowWebV1078(row)) throw new Error('Недостаточно прав для изменения сообщения');
    const current = stripHtml(row.body_html || '');
    const next = window.prompt('Изменить сообщение', current);
    if (next == null) return false;
    const clean = String(next).trim();
    if (!clean) throw new Error('Пустое сообщение нельзя сохранить');
    const now = new Date().toISOString();
    const saved = await apiUpsertChat(App.config, {
      ...row,
      body_html: `<p>${esc(clean)}</p>`,
      edited_at: now,
      client_updated_at: now
    });
    App.data.chatRows = mergeChatRows(App.data.chatRows, [saved]);
    await saveCache();
    renderChat();
    if (App.ui.chatMasterOpenV1068 && App.ui.selectedThreadKey) renderWebChatMasterV1068(App.ui.selectedThreadKey);
    notify('Сообщение изменено', 'ok');
    return true;
  }

  async function softDeleteWebChatRowV1078(row) {
    if (!row || !canManageChatRowWebV1078(row)) throw new Error('Недостаточно прав для скрытия сообщения');
    if (!window.confirm('Скрыть сообщение? Оно исчезнет из чата, но сохранится на сервере для модерации и безопасности.')) return false;
    const now = new Date().toISOString();
    const saved = await apiUpsertChat(App.config, {
      ...row,
      deleted_at: now,
      edited_at: null,
      client_updated_at: now
    });
    App.data.chatRows = mergeChatRows(App.data.chatRows, [saved]);
    await saveCache();
    renderChat();
    if (App.ui.chatMasterOpenV1068 && App.ui.selectedThreadKey) renderWebChatMasterV1068(App.ui.selectedThreadKey);
    notify('Сообщение скрыто', 'ok');
    return true;
  }

  function chatThreadCardV1068(thread) {
    const last = messagesForThread(thread.key).slice(-1)[0] || null;
    const eyebrow = thread.type === 'campaign' ? 'ОБЩИЙ ЧАТ' : (thread.type === 'npc' ? 'NPC' : 'ЛИЧНЫЙ ЧАТ');
    return `<article class="thread-card chat-list-card-v1068 ${thread.type === 'campaign' ? 'campaign-thread-card-v1062' : ''}">
      <div class="thread-row">
        ${renderEntityAvatar(thread.entity || {}, thread.label)}
        <div class="thread-copy"><div class="eyebrow">${eyebrow}</div><h3>${esc(thread.label)}</h3><div class="small-note">${esc(last ? stripHtml(last.body_html || '').slice(0, 96) : (thread.subtitle || 'Без сообщений'))}</div></div>
      </div>
      <div class="entity-actions"><button class="secondary" type="button" data-action="select-thread" data-thread-key="${esc(thread.key)}">Открыть</button></div>
    </article>`;
  }

  function ensureWebChatMasterHostV1068() {
    let host = document.getElementById('chat-master-modal-v1068');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'chat-master-modal-v1068';
    host.className = 'chat-master-modal-v1068 hidden';
    host.setAttribute('aria-hidden','true');
    document.body.appendChild(host);
    return host;
  }

  function closeWebChatMasterV1068() {
    const host = document.getElementById('chat-master-modal-v1068');
    if (!host) return;
    App.ui.chatMasterOpenV1068 = false;
    host.classList.add('hidden');
    host.setAttribute('aria-hidden','true');
    host.innerHTML = '';
    updateChatUnreadIndicatorsV1065({ markSelected: false });
  }

  function renderWebChatMasterV1068(threadKey = App.ui.selectedThreadKey) {
    const host = ensureWebChatMasterHostV1068();
    const thread = buildThreads().find(item => item.key === String(threadKey || ''));
    if (!thread) { closeWebChatMasterV1068(); return; }
    App.ui.selectedThreadKey = thread.key;
    App.ui.chatMasterOpenV1068 = true;
    markThreadReadV1065(thread.key);
    const messages = messagesForThread(thread.key);
    host.innerHTML = `<div class="chat-master-backdrop-v1068" data-chat-master-close-v1068></div>
      <section class="chat-master-window-v1068" role="dialog" aria-modal="true" aria-label="${esc(thread.label)}">
        <header class="chat-master-header-v1068">
          <div class="thread-row compact">${renderEntityAvatar(thread.entity || {}, thread.label, 'sm')}<div><div class="section-title">${esc(thread.label)}</div><div class="small-note">${esc(thread.subtitle || '')}</div></div></div>
          <button class="chat-master-close-v1068" type="button" data-chat-master-close-v1068 aria-label="Закрыть">×</button>
        </header>
        ${campaignMemberLineV1062(thread)}
        <div class="message-list chat-master-message-list-v1068">
          ${messages.map(row => { const meta = campaignMessageActorMarkupV1062(row, thread); return `<div class="chat-row ${meta.own ? 'own' : ''}">${renderEntityAvatar(meta.actor || {}, meta.label, 'sm')}<div class="chat-bubble ${meta.own ? 'own' : ''} ${row.sender_type === 'npc' ? 'npc-message-v1062' : ''}"><div class="chat-head-row-v1078"><div class="chat-meta">${chatRowMetaWebV1078(row, meta.label)}</div>${chatRowControlsWebV1078(row)}</div><div class="article-body">${normalizeRichHtml(row.body_html || '')}</div></div></div>`; }).join('') || '<div class="placeholder">Сообщений ещё нет.</div>'}
        </div>
        <form id="chat-compose-form" class="chat-compose chat-master-compose-v1068" data-thread-key="${esc(thread.key)}">
          ${gmChatActorSelectV1068(thread)}
          <textarea class="textarea" name="body" rows="4" placeholder="${thread.type === 'campaign' ? 'Написать в общий чат кампании...' : thread.type === 'npc' ? 'Написать NPC...' : 'Написать сообщение...'}">${esc(App.ui.chatDrafts[thread.key] || '')}</textarea>
          <button class="primary" type="submit">Отправить</button>
        </form>
      </section>`;
    host.classList.remove('hidden');
    host.setAttribute('aria-hidden','false');
    requestAnimationFrame(() => {
      enhanceWebNpcPickersV1065(host);
      const list = host.querySelector('.chat-master-message-list-v1068');
      if (list) {
        list.scrollTop = list.scrollHeight;
        requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
      }
      updateChatUnreadIndicatorsV1065({ markSelected: false });
    });
  }

  function openWebChatMasterV1068(threadKey) {
    renderWebChatMasterV1068(threadKey);
  }

  const __renderChatV1068 = renderChat;
  renderChat = function() {
    setTopbar('Сообщения', '');
    const root = $('#screen-chat');
    if (!root) return;
    const threads = buildThreads();
    if (App.ui.selectedThreadKey && !threads.some(thread => thread.key === App.ui.selectedThreadKey)) App.ui.selectedThreadKey = '';
    root.innerHTML = `<div class="chat-list-only-v1068"><div class="section-head era-article-top-v1060"><div><div class="eyebrow">ЧАТЫ</div><div class="section-title">Сообщения</div></div></div><div class="thread-list chat-contact-list chat-contact-list-only-v1068">${threads.map(chatThreadCardV1068).join('') || '<div class="placeholder">Нет доступных каналов связи.</div>'}</div></div>`;
    requestAnimationFrame(() => updateChatUnreadIndicatorsV1065({ markSelected: false }));
  };

  const __updateChatUnreadIndicatorsV1068 = updateChatUnreadIndicatorsV1065;
  updateChatUnreadIndicatorsV1065 = function(options = {}) {
    return __updateChatUnreadIndicatorsV1068({ ...options, markSelected: Boolean(options.markSelected && App.ui.chatMasterOpenV1068) });
  };

  const __sendMessageV1068 = sendMessage;
  sendMessage = async function(form) {
    const threadKey = String(form?.dataset?.threadKey || '');
    const thread = buildThreads().find(item => item.key === threadKey);
    if (thread?.type === 'direct' && String(App.session?.role || '').toLowerCase() === 'gm') {
      const fd = new FormData(form);
      const body = String(fd.get('body') || '').trim();
      const actor = String(fd.get('actor') || '');
      if (body && actor.startsWith('npc:')) {
        const npcId = actor.slice(4);
        const npc = App.data.npcs.get(npcId);
        const target = App.data.players.get(thread.otherId);
        if (!npc) throw new Error('NPC не найден');
        if (!target || String(target.role || '').toLowerCase() === 'gm') throw new Error('Этот персонаж недоступен для личного чата');
        const row = { message_id:`msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`, kind:'direct', thread_key:thread.key, sender_type:'npc', sender_id:npc.id, recipient_player_id:target.id, npc_id:npc.id, direct_a:currentPlayer()?.id || App.session?.userId || '', direct_b:target.id, author_label:npc.name || npc.id, body_html:`<p>${esc(body)}</p>` };
        const saved = await apiUpsertChat(App.config,row);
        App.data.chatRows = mergeChatRows(App.data.chatRows,[saved]);
        await saveCache();
        App.ui.chatDrafts[thread.key]='';
        form.reset();
        renderChat();
        renderWebChatMasterV1068(thread.key);
        notify(`Сообщение отправлено от имени ${npc.name || npc.id}`,'ok');
        return;
      }
    }
    await __sendMessageV1068(form);
    if (App.ui.chatMasterOpenV1068 && threadKey) renderWebChatMasterV1068(threadKey);
  };

  const __renderAffectedScreensV1068 = renderAffectedScreens;
  renderAffectedScreens = function(changed = {}) {
    const result = __renderAffectedScreensV1068(changed);
    if (changed.chat && App.ui.chatMasterOpenV1068 && App.ui.selectedThreadKey) requestAnimationFrame(() => renderWebChatMasterV1068(App.ui.selectedThreadKey));
    return result;
  };

  document.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-web-chat-action-v1078]');
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      if (action.disabled) return;
      const row = findWebChatRowV1078(action.dataset.messageId);
      if (!row) { notify('Сообщение не найдено', 'warn'); return; }
      action.disabled = true;
      const task = action.dataset.webChatActionV1078 === 'delete'
        ? softDeleteWebChatRowV1078(row)
        : editWebChatRowV1078(row);
      Promise.resolve(task).catch(error => notify(error.message || String(error), 'err')).finally(() => { action.disabled = false; });
      return;
    }
    const close = event.target?.closest?.('[data-chat-master-close-v1068]');
    if (!close) return;
    if (close.classList.contains('chat-master-backdrop-v1068') && event.target !== close) return;
    closeWebChatMasterV1068();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && App.ui.chatMasterOpenV1068) closeWebChatMasterV1068(); });

  /* v1.0.67 inventory grid, carrying limits and equipment slots */
  const DEFAULT_INVENTORY_SIZE_V1067 = 12;
  const DEFAULT_CARRY_WEIGHT_V1067 = 12;
  function intNonNegativeWebV1067(value,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.floor(n)):fallback;}
  function numNonNegativeWebV1067(value,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.max(0,n):fallback;}
  function itemSizeWebV1067(item={}){return{w:Math.max(1,intNonNegativeWebV1067(item.inventoryWidth??item.sizeWidth??item.widthCells??1,1)),h:Math.max(1,intNonNegativeWebV1067(item.inventoryHeight??item.sizeHeight??item.heightCells??1,1))};}
  function itemMassWebV1067(item={}){return numNonNegativeWebV1067(item.mass??item.weight??1,1);}
  function itemTypeWebV1067(item={}){return normalizedItemTypeV1052(item);}
  function itemWebV1067(itemId){return App.data.items.get(String(itemId||''))||{id:String(itemId||''),name:String(itemId||''),type:'gear',mass:1,inventoryWidth:1,inventoryHeight:1};}
  function normalizeInventoryEntryWebV1067(entry={}){const qty=intNonNegativeWebV1067(entry.qty,0);const positions=Array.isArray(entry.positions)?entry.positions.slice(0,qty).map(pos=>pos&&Number.isInteger(Number(pos.x))&&Number.isInteger(Number(pos.y))&&Number(pos.x)>=0&&Number(pos.y)>=0?{x:Number(pos.x),y:Number(pos.y)}:null):[];return{...entry,itemId:String(entry.itemId||''),qty,positions};}
  function normalizeInventoryPlayerWebV1067(player={}){
    const next=deep(player||{});
    next.inventorySize=intNonNegativeWebV1067(next.inventorySize,DEFAULT_INVENTORY_SIZE_V1067);
    next.carryWeightMax=numNonNegativeWebV1067(next.carryWeightMax??next.maxCarryWeight,DEFAULT_CARRY_WEIGHT_V1067);
    next.inventory=(Array.isArray(next.inventory)?next.inventory:[]).map(normalizeInventoryEntryWebV1067).filter(entry=>entry.itemId&&entry.qty>0);
    next.equipmentSlots={primaryWeapon:'',secondaryWeapon:'',armor:'',...(next.equipmentSlots||{})};
    const legacySlots=Array.isArray(next.implantSlots)?next.implantSlots:(Array.isArray(next.installedImplantIds)?next.installedImplantIds:[]);
    next.implantSlotCount=next.implantSlotCount==null?legacySlots.filter(Boolean).length:intNonNegativeWebV1067(next.implantSlotCount,0);
    next.implantSlots=Array.from({length:next.implantSlotCount},(_,index)=>String(legacySlots[index]||''));
    next.installedImplantIds=next.implantSlots.filter(Boolean);
    return next;
  }
  function inventoryColsWebV1067(size){return Math.max(1,Math.ceil(Math.sqrt(Math.max(1,intNonNegativeWebV1067(size,DEFAULT_INVENTORY_SIZE_V1067)))));}
  function equippedCountsWebV1067(user={}){const map=new Map();const add=id=>{const key=String(id||'');if(key)map.set(key,(map.get(key)||0)+1);};add(user.equipmentSlots?.primaryWeapon);add(user.equipmentSlots?.secondaryWeapon);add(user.equipmentSlots?.armor);(user.implantSlots||[]).forEach(add);return map;}
  function inventoryWeightWebV1067(user={}){return(user.inventory||[]).reduce((sum,entry)=>sum+itemMassWebV1067(itemWebV1067(entry.itemId))*intNonNegativeWebV1067(entry.qty,0),0);}
  function markOccWebV1067(occupied,x,y,w,h,value=true){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const key=`${xx}:${yy}`;if(value)occupied.add(key);else occupied.delete(key);}}
  function fitsWebV1067(size,cols,occupied,x,y,w,h){if(x<0||y<0||x+w>cols)return false;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const index=yy*cols+xx;if(index<0||index>=size||occupied.has(`${xx}:${yy}`))return false;}return true;}
  function firstFitWebV1067(size,cols,occupied,w,h){const rows=Math.ceil(Math.max(1,size)/cols);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(fitsWebV1067(size,cols,occupied,x,y,w,h))return{x,y};return null;}
  function buildInventoryLayoutWebV1067(rawUser={}){
    const user=normalizeInventoryPlayerWebV1067(rawUser);const size=user.inventorySize,cols=inventoryColsWebV1067(size),equipped=equippedCountsWebV1067(user),occupied=new Set(),instances=[],overflow=[];
    for(const entry of user.inventory){const item=itemWebV1067(entry.itemId),sz=itemSizeWebV1067(item),skip=Math.min(entry.qty,equipped.get(entry.itemId)||0);for(let unitIndex=skip;unitIndex<entry.qty;unitIndex++){const key=`${entry.itemId}::${unitIndex}`;let pos=entry.positions?.[unitIndex]||null;if(!pos||!fitsWebV1067(size,cols,occupied,pos.x,pos.y,sz.w,sz.h))pos=firstFitWebV1067(size,cols,occupied,sz.w,sz.h);const inst={key,itemId:entry.itemId,unitIndex,item,w:sz.w,h:sz.h,pos};if(pos){markOccWebV1067(occupied,pos.x,pos.y,sz.w,sz.h);instances.push(inst);}else overflow.push(inst);}}
    return{user,size,cols,rows:Math.ceil(Math.max(1,size)/cols),instances,overflow,weight:inventoryWeightWebV1067(user)};
  }
  function setPositionWebV1067(user,itemId,unitIndex,pos){const entry=(user.inventory||[]).find(row=>row.itemId===itemId);if(!entry)return false;entry.positions=Array.isArray(entry.positions)?entry.positions:[];while(entry.positions.length<entry.qty)entry.positions.push(null);entry.positions[unitIndex]=pos?{x:intNonNegativeWebV1067(pos.x),y:intNonNegativeWebV1067(pos.y)}:null;return true;}
  function canPlaceWebV1067(user,itemId,unitIndex,x,y){const layout=buildInventoryLayoutWebV1067(user),occupied=new Set(),moving=`${itemId}::${unitIndex}`;layout.instances.filter(i=>i.key!==moving&&i.pos).forEach(i=>markOccWebV1067(occupied,i.pos.x,i.pos.y,i.w,i.h));const sz=itemSizeWebV1067(itemWebV1067(itemId));return fitsWebV1067(layout.size,layout.cols,occupied,x,y,sz.w,sz.h);}
  function getSlotWebV1067(user,type,index=-1){return type==='implant'?String(user.implantSlots?.[index]||''):String(user.equipmentSlots?.[type]||'');}
  function setSlotWebV1067(user,type,index,itemId){if(type==='implant'){user.implantSlots=Array.from({length:user.implantSlotCount},(_,i)=>String(user.implantSlots?.[i]||''));if(index<0||index>=user.implantSlotCount)return false;user.implantSlots[index]=String(itemId||'');user.installedImplantIds=user.implantSlots.filter(Boolean);return true;}user.equipmentSlots={primaryWeapon:'',secondaryWeapon:'',armor:'',...(user.equipmentSlots||{})};user.equipmentSlots[type]=String(itemId||'');return true;}
  function slotAcceptsWebV1067(type,item){const itemType=itemTypeWebV1067(item);if(type==='armor')return itemType==='armor';if(type==='implant')return itemType==='implant';if(type==='primaryWeapon')return itemType==='weapon'&&['primary','versatile',''].includes(String(item.weaponSlot||'primary'));if(type==='secondaryWeapon')return itemType==='weapon'&&['secondary','versatile',''].includes(String(item.weaponSlot||'secondary'));return false;}
  function ownedQtyWebV1067(user,itemId){return intNonNegativeWebV1067((user.inventory||[]).find(entry=>entry.itemId===itemId)?.qty,0);}
  function equippedCountWebV1067(user,itemId){return equippedCountsWebV1067(user).get(String(itemId||''))||0;}
  function canAddInventoryItemWebV1067(user,itemId,qty=1){const current=normalizeInventoryPlayerWebV1067(user),item=itemWebV1067(itemId),count=Math.max(1,intNonNegativeWebV1067(qty,1)),nextWeight=inventoryWeightWebV1067(current)+itemMassWebV1067(item)*count;if(nextWeight>current.carryWeightMax+1e-9)return{ok:false,reason:`Превышен переносимый вес: ${nextWeight.toFixed(1)} / ${current.carryWeightMax}`};const clone=deep(current);let entry=clone.inventory.find(row=>row.itemId===itemId);if(!entry){entry={itemId,qty:0,positions:[]};clone.inventory.push(entry);}entry.qty+=count;if(buildInventoryLayoutWebV1067(clone).overflow.length)return{ok:false,reason:'В инвентаре недостаточно свободного места для предмета.'};return{ok:true};}

  function webSlotLabelV1067(type,index=-1){return type==='primaryWeapon'?'Основное':type==='secondaryWeapon'?'Вторичное':type==='armor'?'Броня':`Имплант ${index+1}`;}
  function webSlotMarkupV1067(user,type,index=-1){const itemId=getSlotWebV1067(user,type,index),item=itemId?itemWebV1067(itemId):null;return `<div class="web-inventory-slot-v1067 ${item?'filled':''}" data-web-inventory-slot-v1067 data-slot-type="${type}" data-slot-index="${index}"><div class="web-inventory-slot-label-v1067">${esc(webSlotLabelV1067(type,index))}</div>${item?`<div class="web-inventory-slot-item-v1067" draggable="true" data-web-inventory-drag-v1067 data-source="slot" data-slot-type="${type}" data-slot-index="${index}" data-item-id="${esc(item.id)}" data-action="profile-item" data-item-id="${esc(item.id)}" data-item-label="${esc(webSlotLabelV1067(type,index))}">${renderEntityThumb(item)}<span>${esc(item.name||item.id)}</span></div>`:'<div class="web-inventory-slot-empty-v1067">Перетащите предмет</div>'}</div>`;}
  function webGridMarkupV1067(user){const layout=buildInventoryLayoutWebV1067(user);const cells=Array.from({length:layout.size},(_,index)=>`<div class="web-inventory-cell-v1067" style="grid-column:${index%layout.cols+1};grid-row:${Math.floor(index/layout.cols)+1}"></div>`).join('');const tiles=layout.instances.map(inst=>`<div class="web-inventory-tile-v1067" draggable="true" data-web-inventory-drag-v1067 data-source="grid" data-item-id="${esc(inst.itemId)}" data-unit-index="${inst.unitIndex}" data-action="profile-item" data-item-id="${esc(inst.itemId)}" data-item-label="Инвентарь" style="grid-column:${inst.pos.x+1}/span ${inst.w};grid-row:${inst.pos.y+1}/span ${inst.h}" title="${esc(inst.item.name||inst.itemId)} · ${inst.w}×${inst.h} · ${itemMassWebV1067(inst.item)} веса">${renderEntityThumb(inst.item)}<span>${esc(inst.item.name||inst.itemId)}</span><small>${inst.w}×${inst.h}</small></div>`).join('');const overflow=layout.overflow.length?`<div class="web-inventory-overflow-v1067"><b>Не помещается: ${layout.overflow.length}</b>${layout.overflow.map(inst=>`<span>${esc(inst.item.name||inst.itemId)} (${inst.w}×${inst.h})</span>`).join('')}</div>`:'';return`<div class="web-inventory-grid-v1067" data-web-inventory-grid-v1067 style="--inv-cols:${layout.cols};--inv-rows:${layout.rows}">${cells}${tiles}</div>${overflow}`;}
  function webInventoryPanelV1067(rawPlayer){const user=normalizeInventoryPlayerWebV1067(rawPlayer),layout=buildInventoryLayoutWebV1067(user),overweight=layout.weight>user.carryWeightMax+1e-9;return `<section class="panel web-profile-inventory-v1067"><div class="section-head era-article-top-v1060"><div><div class="eyebrow">LOADOUT</div><div class="section-title">Экипировка и инвентарь</div></div></div><div class="web-inventory-capacity-v1067"><span>Инвентарь <b>${[...layout.instances,...layout.overflow].reduce((sum,i)=>sum+i.w*i.h,0)} / ${user.inventorySize}</b> клеток</span><span class="${overweight?'inventory-limit-exceeded-v1067':''}">Вес <b>${layout.weight.toFixed(1)} / ${Number(user.carryWeightMax).toFixed(1)}</b></span><span>Импланты <b>${user.implantSlots.filter(Boolean).length} / ${user.implantSlotCount}</b></span></div><div class="web-inventory-slots-v1067">${webSlotMarkupV1067(user,'primaryWeapon')}${webSlotMarkupV1067(user,'secondaryWeapon')}${webSlotMarkupV1067(user,'armor')}${Array.from({length:user.implantSlotCount},(_,i)=>webSlotMarkupV1067(user,'implant',i)).join('')}</div><div class="section-head era-article-top-v1060 web-inventory-grid-head-v1067"><div class="section-title">Инвентарь</div><div class="muted">Перетаскивайте предметы по сетке и в слоты.</div></div>${webGridMarkupV1067(user)}</section>`;}

  const __renderProfileV1067=renderProfile;
  renderProfile=function(){const result=__renderProfileV1067();const root=$('#screen-profile'),player=currentPlayer();if(!root||!player)return result;const heads=Array.from(root.querySelectorAll('.section-head'));for(const head of heads){const title=head.querySelector('.section-title')?.textContent?.trim();if(['Текущее снаряжение','Инвентарь'].includes(title)){const next=head.nextElementSibling;head.remove();if(next?.classList.contains('profile-item-grid-v1060'))next.remove();}}root.querySelector('[data-implants-v1052]')?.remove();root.querySelector('.web-profile-inventory-v1067')?.remove();const main=root.querySelector('.profile-card');if(main){main.insertAdjacentHTML('afterend',webInventoryPanelV1067(player));const infoGrid=main.querySelector('.info-grid');if(infoGrid&&!main.querySelector('[data-web-inventory-limits-v1067]'))infoGrid.insertAdjacentHTML('beforeend',`<div class="info-card" data-web-inventory-limits-v1067><div class="k">Инвентарь / вес</div><div class="v">${normalizeInventoryPlayerWebV1067(player).inventorySize} ячеек · ${Number(normalizeInventoryPlayerWebV1067(player).carryWeightMax).toFixed(1)}</div></div>`);}return result;};

  let webInventoryDragV1067=null;
  document.addEventListener('dragstart',event=>{const node=event.target?.closest?.('[data-web-inventory-drag-v1067]');if(!node)return;webInventoryDragV1067={source:String(node.dataset.source||''),itemId:String(node.dataset.itemId||''),unitIndex:intNonNegativeWebV1067(node.dataset.unitIndex,-1),slotType:String(node.dataset.slotType||''),slotIndex:Number(node.dataset.slotIndex??-1)};event.dataTransfer.effectAllowed='move';try{event.dataTransfer.setData('text/plain',webInventoryDragV1067.itemId);}catch{}node.classList.add('web-inventory-dragging-v1067');});
  document.addEventListener('dragend',event=>{event.target?.closest?.('[data-web-inventory-drag-v1067]')?.classList.remove('web-inventory-dragging-v1067');webInventoryDragV1067=null;});
  document.addEventListener('dragover',event=>{if(!webInventoryDragV1067)return;if(event.target?.closest?.('[data-web-inventory-grid-v1067],[data-web-inventory-slot-v1067]')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
  document.addEventListener('drop',async event=>{if(!webInventoryDragV1067)return;const grid=event.target?.closest?.('[data-web-inventory-grid-v1067]'),slot=event.target?.closest?.('[data-web-inventory-slot-v1067]');if(!grid&&!slot)return;event.preventDefault();const drag={...webInventoryDragV1067};webInventoryDragV1067=null;try{if(slot){const targetType=String(slot.dataset.slotType||''),targetIndex=Number(slot.dataset.slotIndex??-1),item=itemWebV1067(drag.itemId);if(!slotAcceptsWebV1067(targetType,item))throw new Error('Этот предмет нельзя установить в выбранный слот');await commitPlayerMutation(user=>{const normalized=normalizeInventoryPlayerWebV1067(user);Object.assign(user,normalized);if(drag.source==='slot')setSlotWebV1067(user,drag.slotType,drag.slotIndex,'');const owned=ownedQtyWebV1067(user,drag.itemId),equipped=equippedCountWebV1067(user,drag.itemId),targetCurrent=getSlotWebV1067(user,targetType,targetIndex),allowance=targetCurrent===drag.itemId?1:0;if(owned<=equipped-allowance)throw new Error('В инвентаре нет свободного экземпляра этого предмета');setSlotWebV1067(user,targetType,targetIndex,drag.itemId);},'Экипировка обновлена');return;}const rect=grid.getBoundingClientRect(),cols=Number(getComputedStyle(grid).getPropertyValue('--inv-cols'))||1,cell=rect.width/cols,x=Math.max(0,Math.min(cols-1,Math.floor((event.clientX-rect.left)/cell))),y=Math.max(0,Math.floor((event.clientY-rect.top)/cell));await commitPlayerMutation(user=>{const normalized=normalizeInventoryPlayerWebV1067(user);Object.assign(user,normalized);let unitIndex=drag.unitIndex;if(drag.source==='slot'){setSlotWebV1067(user,drag.slotType,drag.slotIndex,'');unitIndex=equippedCountWebV1067(user,drag.itemId);}if(unitIndex<0||!canPlaceWebV1067(user,drag.itemId,unitIndex,x,y))throw new Error('Предмет не помещается в выбранное место');setPositionWebV1067(user,drag.itemId,unitIndex,{x,y});},drag.source==='slot'?'Предмет снят':'Инвентарь перемещён');}catch(error){notify(error.message||String(error),'warn');}});

  async function handlePointerInventoryDropWebV1067(drag,target,clientX,clientY){const grid=target?.closest?.('[data-web-inventory-grid-v1067]'),slot=target?.closest?.('[data-web-inventory-slot-v1067]');if(!grid&&!slot)return;try{if(slot){const targetType=String(slot.dataset.slotType||''),targetIndex=Number(slot.dataset.slotIndex??-1),item=itemWebV1067(drag.itemId);if(!slotAcceptsWebV1067(targetType,item))throw new Error('Этот предмет нельзя установить в выбранный слот');await commitPlayerMutation(user=>{Object.assign(user,normalizeInventoryPlayerWebV1067(user));if(drag.source==='slot')setSlotWebV1067(user,drag.slotType,drag.slotIndex,'');const owned=ownedQtyWebV1067(user,drag.itemId),equipped=equippedCountWebV1067(user,drag.itemId),targetCurrent=getSlotWebV1067(user,targetType,targetIndex),allowance=targetCurrent===drag.itemId?1:0;if(owned<=equipped-allowance)throw new Error('В инвентаре нет свободного экземпляра этого предмета');setSlotWebV1067(user,targetType,targetIndex,drag.itemId);},'Экипировка обновлена');return;}const rect=grid.getBoundingClientRect(),cols=Number(getComputedStyle(grid).getPropertyValue('--inv-cols'))||1,cell=rect.width/cols,x=Math.max(0,Math.min(cols-1,Math.floor((clientX-rect.left)/cell))),y=Math.max(0,Math.floor((clientY-rect.top)/cell));await commitPlayerMutation(user=>{Object.assign(user,normalizeInventoryPlayerWebV1067(user));let unitIndex=drag.unitIndex;if(drag.source==='slot'){setSlotWebV1067(user,drag.slotType,drag.slotIndex,'');unitIndex=equippedCountWebV1067(user,drag.itemId);}if(unitIndex<0||!canPlaceWebV1067(user,drag.itemId,unitIndex,x,y))throw new Error('Предмет не помещается в выбранное место');setPositionWebV1067(user,drag.itemId,unitIndex,{x,y});},drag.source==='slot'?'Предмет снят':'Инвентарь перемещён');}catch(error){notify(error.message||String(error),'warn');}}
  let touchInventoryDragWebV1067=null;
  document.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')return;const node=event.target?.closest?.('[data-web-inventory-drag-v1067]');if(!node)return;const drag={source:String(node.dataset.source||''),itemId:String(node.dataset.itemId||''),unitIndex:intNonNegativeWebV1067(node.dataset.unitIndex,-1),slotType:String(node.dataset.slotType||''),slotIndex:Number(node.dataset.slotIndex??-1)};const state={node,drag,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false,timer:null,ghost:null};state.timer=setTimeout(()=>{state.active=true;state.node.classList.add('web-inventory-dragging-v1067');const ghost=state.node.cloneNode(true);ghost.classList.add('web-inventory-touch-ghost-v1067');ghost.removeAttribute('draggable');document.body.appendChild(ghost);state.ghost=ghost;ghost.style.left=`${state.x}px`;ghost.style.top=`${state.y}px`;},280);touchInventoryDragWebV1067=state;});
  document.addEventListener('pointermove',event=>{const state=touchInventoryDragWebV1067;if(!state||state.pointerId!==event.pointerId)return;state.x=event.clientX;state.y=event.clientY;const dist=Math.hypot(event.clientX-state.startX,event.clientY-state.startY);if(!state.active&&dist>10){clearTimeout(state.timer);touchInventoryDragWebV1067=null;return;}if(state.active){event.preventDefault();if(state.ghost){state.ghost.style.left=`${event.clientX}px`;state.ghost.style.top=`${event.clientY}px`;}}},{passive:false});
  document.addEventListener('pointerup',async event=>{const state=touchInventoryDragWebV1067;if(!state||state.pointerId!==event.pointerId)return;clearTimeout(state.timer);touchInventoryDragWebV1067=null;if(!state.active)return;event.preventDefault();event.stopPropagation();state.node.classList.remove('web-inventory-dragging-v1067');state.ghost?.remove();const target=document.elementFromPoint(event.clientX,event.clientY);await handlePointerInventoryDropWebV1067(state.drag,target,event.clientX,event.clientY);},{passive:false});
  document.addEventListener('pointercancel',event=>{const state=touchInventoryDragWebV1067;if(!state||state.pointerId!==event.pointerId)return;clearTimeout(state.timer);state.node.classList.remove('web-inventory-dragging-v1067');state.ghost?.remove();touchInventoryDragWebV1067=null;});

  /* v1.0.71 — transactional daily planetary market */
  const MarketEngineV1071=window.GRPGMarketEngineV1071;
  let marketSelectionWebV1071=null,marketDragWebV1071=null,marketTabWebV1073='goods',lastMarketDayWebV1071=MarketEngineV1071?.rotationKey?.()||'';
  function marketRotationWebV1071(planet=currentPlanet()){
    if(!MarketEngineV1071||!planet)return{rotationKey:'',nextRotationAt:new Date().toISOString(),offers:[],allOffers:[]};
    const campaign=App.data.campaigns.get(App.config?.campaignId||'main')||{};
    return MarketEngineV1071.buildRotation({campaignId:App.config?.campaignId||'main',campaign,gameDate:campaign.marketDate,planet,planets:App.data.planets,equipment:App.data.items,marketState:App.data.state?.marketRuntimeV1071||{claims:{}}});
  }
  function marketSizeWebV1071(item={}){return{w:Math.max(1,Number.parseInt(item.inventoryWidth??item.sizeWidth??1,10)||1),h:Math.max(1,Number.parseInt(item.inventoryHeight??item.sizeHeight??1,10)||1)};}
  function marketItemIsStockWebV1073(item={}){return normalizedItemTypeV1052(item)==='stock';}
  function marketTabMatchesWebV1073(item={},tab=marketTabWebV1073){return tab==='stocks'?marketItemIsStockWebV1073(item):!marketItemIsStockWebV1073(item);}
  function marketSellPercentWebV1073(offer,item){const fallback=marketItemIsStockWebV1073(item)?1:.7,rate=Number.isFinite(Number(offer?.sellRate))?Number(offer.sellRate):fallback;return Math.round(rate*100);}
  function marketOfferTileWebV1071(offer){const item=App.data.items.get(offer.itemId);if(!item)return'';const size=marketSizeWebV1071(item),selected=marketSelectionWebV1071?.source==='market'&&marketSelectionWebV1071?.itemId===item.id;return`<button class="market-shop-tile-v1071 ${selected?'selected':''}" type="button" draggable="true" data-web-market-drag-v1071 data-source="market" data-item-id="${esc(item.id)}" style="grid-column:span ${size.w};grid-row:span ${size.h}" title="${esc(item.name||item.id)} · ${size.w}×${size.h}">${renderEntityThumb(item)}<span class="market-tile-name-v1071">${esc(item.name||item.id)}</span><span class="market-tile-meta-v1071">${size.w}×${size.h}${offer.unique?' · Уникальный':''}</span><b class="market-tile-price-v1071">${formatCredits(offer.price)}</b></button>`;}
  function marketInventoryWebV1071(player,offers,tab=marketTabWebV1073){const layout=buildInventoryLayoutWebV1067(player),offerMap=new Map(offers.map(offer=>[offer.itemId,offer]));const cells=Array.from({length:layout.size},(_,index)=>`<div class="market-inventory-cell-v1071" style="grid-column:${index%layout.cols+1};grid-row:${Math.floor(index/layout.cols)+1}"></div>`).join('');const visible=layout.instances.filter(inst=>marketTabMatchesWebV1073(inst.item,tab));const tiles=visible.map(inst=>{const offer=offerMap.get(inst.itemId),selected=marketSelectionWebV1071?.source==='inventory'&&marketSelectionWebV1071?.itemId===inst.itemId&&Number(marketSelectionWebV1071?.unitIndex)===Number(inst.unitIndex);return`<button class="market-inventory-tile-v1071 ${selected?'selected':''} ${offer?'sellable':'not-sellable'}" type="button" draggable="true" data-web-market-drag-v1071 data-source="inventory" data-item-id="${esc(inst.itemId)}" data-unit-index="${inst.unitIndex}" style="grid-column:${inst.pos.x+1}/span ${inst.w};grid-row:${inst.pos.y+1}/span ${inst.h}" title="${esc(inst.item.name||inst.itemId)}${offer?` · Продажа за ${formatCredits(offer.sellPrice)}`:' · Сегодня не принимается'}">${renderEntityThumb(inst.item)}<span>${esc(inst.item.name||inst.itemId)}</span><small>${inst.w}×${inst.h}${offer?` · ${formatCredits(offer.sellPrice)}`:''}</small></button>`;}).join('');const overflow=layout.overflow.filter(inst=>marketTabMatchesWebV1073(inst.item||App.data.items.get(inst.itemId),tab));return`<div class="market-inventory-grid-v1071" data-web-market-inventory-drop-v1071 style="--inv-cols:${layout.cols};--inv-rows:${layout.rows}">${cells}${tiles}</div>${overflow.length?`<div class="web-inventory-overflow-v1067"><b>Не помещается: ${overflow.length}</b></div>`:''}`;}
  function marketTypeLabelWebV1071(item={}){const type=normalizedItemTypeV1052(item);return type==='weapon'?'Оружие':type==='armor'?'Броня':type==='implant'?'Имплант':type==='stock'?'Акции':'Снаряжение';}
  function marketWeaponSlotLabelWebV1071(value){return({primary:'Основное',secondary:'Вторичное',versatile:'Универсальное'})[String(value||'primary')]||String(value||'Основное');}
  function marketRequirementTextWebV1071(item={}){const req=item.requirements&&typeof item.requirements==='object'?item.requirements:{};const rows=ABILITIES_V1052.filter(row=>Number(req[row.key]||0)>0).map(row=>`${row.short} ${Number(req[row.key])}`);return rows.length?rows.join(' · '):'нет';}
  function marketItemDetailsWebV1071(item,offer){const type=normalizedItemTypeV1052(item),size=marketSizeWebV1071(item),mass=Number(item.mass??item.weight??1),facts=[`Тип: ${marketTypeLabelWebV1071(item)}`,item.rarity?`Редкость: ${item.rarity}`:'',`Размер: ${size.w}×${size.h}`,`Масса: ${Number.isFinite(mass)?mass:1}`,offer?.unique?'Уникальный предмет':''];if(type==='weapon'){if(item.damage)facts.push(`Урон: ${item.damage}`);facts.push(`Попадание: ${Number(item.hitBonus||0)>=0?'+':''}${Number(item.hitBonus||0)}`);facts.push(`Слот: ${marketWeaponSlotLabelWebV1071(item.weaponSlot)}`);}if(type==='armor'&&Number(item.armorClass||0)>0)facts.push(`Класс брони: ${Number(item.armorClass)}`);if(type==='implant')facts.push(`Требуемая энергия: ${Number(item.energyRequired??item.requiredEnergy??0)}`);const tags=Array.isArray(item.tags)?item.tags.map(tag=>String(tag||'').trim()).filter(Boolean):[];return`<div class="market-selection-facts-v1071">${facts.filter(Boolean).map(fact=>`<span class="pill">${esc(fact)}</span>`).join('')}</div><p class="market-selection-description-v1071">${esc(item.desc||item.description||item.summary||'Описание предмета не задано.')}</p><div class="market-selection-requirements-v1071"><b>Требования:</b> ${esc(marketRequirementTextWebV1071(item))}</div>${tags.length?`<div class="market-selection-tags-v1071"><b>Категории:</b> ${esc(tags.join(' · '))}</div>`:''}`;}
  function marketSelectionWebMarkupV1071(rotation,player){const item=marketSelectionWebV1071?.itemId?App.data.items.get(marketSelectionWebV1071.itemId):null;if(!item)return'<div class="market-selection-empty-v1071">Выберите плитку товара или предмета.</div>';const buy=marketSelectionWebV1071.source==='market',offer=(buy?rotation.offers:rotation.allOffers).find(row=>row.itemId===item.id),capacity=buy?canAddInventoryItemWebV1067(player,item.id,1):{ok:true},disabled=!offer||(buy&&(!capacity.ok||Number(player.credits||0)<Number(offer.price||0))),sellPercent=marketSellPercentWebV1073(offer,item);return`<div class="market-selection-card-v1071">${renderEntityThumb(item)}<div class="market-selection-details-v1071"><div class="market-selection-heading-v1071"><b>${esc(item.name||item.id)}</b><strong>${buy?`Покупка: ${formatCredits(offer?.price||0)}`:offer?`Продажа: ${formatCredits(offer.sellPrice)} (${sellPercent}%)`:'Сегодня этот товар не принимается'}</strong></div>${marketItemDetailsWebV1071(item,offer)}${buy&&!capacity.ok?`<small class="error-line">${esc(capacity.reason)}</small>`:''}</div><button class="primary" type="button" data-web-market-action-v1071="${buy?'buy':'sell'}" ${disabled?'disabled':''}>${buy?'КУПИТЬ':'ПРОДАТЬ'}</button></div>`;}
  renderMarket=function(){
    const root=$('#screen-market'),player=currentPlayer(),planet=currentPlanet();
    setTopbar('Торговый терминал','Ежедневная ротация ассортимента и цен');
    if(!player||!planet){root.innerHTML='<div class="placeholder market-disabled">Терминал заблокирован. У профиля нет текущей планеты.</div>';return;}
    const rotation=marketRotationWebV1071(planet);
    const visibleOffers=rotation.offers.filter(offer=>marketTabMatchesWebV1073(App.data.items.get(offer.itemId)));
    const visibleAllOffers=rotation.allOffers.filter(offer=>marketTabMatchesWebV1073(App.data.items.get(offer.itemId)));
    if(marketSelectionWebV1071&&(!marketTabMatchesWebV1073(App.data.items.get(marketSelectionWebV1071.itemId))||(marketSelectionWebV1071.source==='market'&&!visibleOffers.some(offer=>offer.itemId===marketSelectionWebV1071.itemId))))marketSelectionWebV1071=null;
    root.innerHTML=`<div class="market-terminal-v1071"><div class="hero-card market-hero-v1071"><div class="section-head"><div><div class="eyebrow">LOCAL TERMINAL</div><div class="section-title">${esc(planet.name)}</div><div class="small-note">Игровой день рынка: ${esc(formatDate(rotation.rotationKey))}</div></div><div class="pill">Баланс: ${formatCredits(player.credits||0)}</div></div></div><div class="market-tabs-v1073" role="tablist" aria-label="Раздел торгового терминала"><button class="secondary ${marketTabWebV1073==='goods'?'active':''}" type="button" role="tab" aria-selected="${marketTabWebV1073==='goods'}" data-web-market-tab-v1073="goods">ТОВАРЫ</button><button class="secondary ${marketTabWebV1073==='stocks'?'active':''}" type="button" role="tab" aria-selected="${marketTabWebV1073==='stocks'}" data-web-market-tab-v1073="stocks">АКЦИИ</button></div><div class="market-access-banner-v1071 ok">Покупка доступна. Обычные товары продаются за 70% текущей цены.</div><div class="market-dual-grid-v1071"><section class="market-pane-v1071 market-stock-pane-v1071" data-web-market-stock-drop-v1071><div class="market-pane-head-v1071"><div><span class="eyebrow">${marketTabWebV1073==='stocks'?'SECURITIES':'MARKET STOCK'}</span><b>${marketTabWebV1073==='stocks'?'Акции':'Товары'}</b></div><span>${visibleOffers.length} поз.</span></div><div class="market-shop-grid-v1071">${visibleOffers.map(marketOfferTileWebV1071).join('')||`<div class="placeholder">В текущей ротации нет ${marketTabWebV1073==='stocks'?'акций':'товаров'}.</div>`}</div></section><section class="market-pane-v1071"><div class="market-pane-head-v1071"><div><span class="eyebrow">PERSONAL STORAGE</span><b>${marketTabWebV1073==='stocks'?'Портфель':'Инвентарь'}</b></div><span>${formatCredits(player.credits||0)}</span></div>${marketInventoryWebV1071(player,visibleAllOffers,marketTabWebV1073)}</section></div>${marketSelectionWebMarkupV1071(rotation,player)}</div>`;
  };
  async function transactMarketWebV1071(payload){const player=currentPlayer(),planet=currentPlanet();if(!player||!planet)throw new Error('Торговый терминал недоступен');let result;try{result=await pbFetch(App.config,'/api/grpgi/market/transaction',{method:'POST',json:{campaignId:App.config.campaignId,playerId:player.id,planetId:planet.id,updatedBy:App.config.deviceLabel||'web-market',clientUpdatedAt:new Date().toISOString(),...payload}});}catch(error){if(/404|not found/i.test(String(error.message||'')))throw new Error('На сервере PocketBase не установлен pb_hooks/grpgi_market.pb.js');throw error;}if(!result?.ok)throw new Error(result?.message||'Операция рынка не выполнена');marketSelectionWebV1071=null;await pullEverything({silent:true,render:false});renderMarket();notify(payload.action==='buy'?'Покупка завершена':'Продажа завершена','ok');return result;}
  document.addEventListener('click',event=>{const tab=event.target?.closest?.('[data-web-market-tab-v1073]');if(tab&&tab.closest('#screen-market')){marketTabWebV1073=tab.dataset.webMarketTabV1073==='stocks'?'stocks':'goods';marketSelectionWebV1071=null;renderMarket();return;}const tile=event.target?.closest?.('[data-web-market-drag-v1071]');if(tile&&tile.closest('#screen-market')){marketSelectionWebV1071={source:String(tile.dataset.source||''),itemId:String(tile.dataset.itemId||''),unitIndex:Number(tile.dataset.unitIndex??-1)};renderMarket();return;}const action=event.target?.closest?.('[data-web-market-action-v1071]');if(!action||!marketSelectionWebV1071)return;transactMarketWebV1071({action:String(action.dataset.webMarketActionV1071),itemId:marketSelectionWebV1071.itemId,unitIndex:marketSelectionWebV1071.unitIndex}).catch(error=>notify(error.message||String(error),'err'));});
  document.addEventListener('dragstart',event=>{const node=event.target?.closest?.('[data-web-market-drag-v1071]');if(!node)return;marketDragWebV1071={source:String(node.dataset.source||''),itemId:String(node.dataset.itemId||''),unitIndex:Number(node.dataset.unitIndex??-1)};event.dataTransfer.effectAllowed=marketDragWebV1071.source==='market'?'copy':'move';try{event.dataTransfer.setData('text/plain',marketDragWebV1071.itemId);}catch{}node.classList.add('market-dragging-v1071');});
  document.addEventListener('dragend',event=>{event.target?.closest?.('[data-web-market-drag-v1071]')?.classList.remove('market-dragging-v1071');marketDragWebV1071=null;});
  document.addEventListener('dragover',event=>{if(!marketDragWebV1071)return;const target=marketDragWebV1071.source==='market'?event.target?.closest?.('[data-web-market-inventory-drop-v1071]'):event.target?.closest?.('[data-web-market-stock-drop-v1071]');if(target){event.preventDefault();event.dataTransfer.dropEffect=marketDragWebV1071.source==='market'?'copy':'move';}});
  document.addEventListener('drop',event=>{if(!marketDragWebV1071)return;const inventory=event.target?.closest?.('[data-web-market-inventory-drop-v1071]'),stock=event.target?.closest?.('[data-web-market-stock-drop-v1071]');if((marketDragWebV1071.source==='market'&&!inventory)||(marketDragWebV1071.source==='inventory'&&!stock))return;event.preventDefault();const payload={action:marketDragWebV1071.source==='market'?'buy':'sell',itemId:marketDragWebV1071.itemId,unitIndex:marketDragWebV1071.unitIndex};if(inventory){const rect=inventory.getBoundingClientRect(),cols=Number(getComputedStyle(inventory).getPropertyValue('--inv-cols'))||1,cell=rect.width/cols;payload.targetPosition={x:Math.max(0,Math.min(cols-1,Math.floor((event.clientX-rect.left)/cell))),y:Math.max(0,Math.floor((event.clientY-rect.top)/cell))};}marketDragWebV1071=null;transactMarketWebV1071(payload).catch(error=>notify(error.message||String(error),'err'));});
  setInterval(()=>{const key=MarketEngineV1071?.rotationKey?.()||'';if(key&&key!==lastMarketDayWebV1071){lastMarketDayWebV1071=key;marketSelectionWebV1071=null;if(App.ui.screen==='market')renderMarket();}},60000);

  /* v1.0.74 — global securities exchange and non-inventory portfolio */
  let stockSelectionWebV1074=null,stockDragWebV1074=null;
  function stockTickerWebV1074(item={}){return MarketEngineV1071.stockTicker(item)||'—';}
  function stockQtyWebV1074(position={}){return Math.max(0,Number(position.knownQty||0))+Math.max(0,Number(position.unpricedQty||0));}
  function stockChangeClassWebV1074(value){return Number(value||0)>0?'up':Number(value||0)<0?'down':'flat';}
  function signedCreditsWebV1074(value){const amount=Number(value||0);return`${amount>0?'+':''}${formatCredits(amount)}`;}
  function normalizeStockPositionWebV1074(itemId,value={}){return{itemId:String(itemId||value.itemId||''),knownQty:Math.max(0,Math.trunc(Number(value.knownQty??value.quantity??0)||0)),unpricedQty:Math.max(0,Math.trunc(Number(value.unpricedQty||0)||0)),costBasis:Math.max(0,Number(value.costBasis||0))};}
  function normalizeStockPortfolioWebV1074(source={}){
    const raw=source.stockPortfolio&&typeof source.stockPortfolio==='object'&&!Array.isArray(source.stockPortfolio)?deep(source.stockPortfolio):{},positions={};
    if(Array.isArray(raw.positions))raw.positions.forEach(row=>{if(row?.itemId)positions[String(row.itemId)]=normalizeStockPositionWebV1074(row.itemId,row);});
    else Object.entries(raw.positions||{}).forEach(([itemId,row])=>{positions[itemId]=normalizeStockPositionWebV1074(itemId,row);});
    const migrated=raw.legacyInventoryMigrated&&typeof raw.legacyInventoryMigrated==='object'&&!Array.isArray(raw.legacyInventoryMigrated)?{...raw.legacyInventoryMigrated}:{},inventory=[];
    (Array.isArray(source.inventory)?source.inventory:[]).forEach(entry=>{const itemId=String(entry?.itemId||''),item=App.data.items.get(itemId);if(!item||!MarketEngineV1071.isStock(item)){inventory.push(entry);return;}const qty=Math.max(0,Math.trunc(Number(entry.qty||0)||0)),accounted=Math.max(0,Math.trunc(Number(migrated[itemId]||0)||0)),delta=Math.max(0,qty-accounted),position=positions[itemId]||normalizeStockPositionWebV1074(itemId);position.unpricedQty+=delta;positions[itemId]=position;migrated[itemId]=Math.max(accounted,qty);});
    return{positions,ledger:Array.isArray(raw.ledger)?raw.ledger.slice(-500):[],legacyInventoryMigrated:migrated,inventory};
  }
  function normalizeStockPlayerWebV1074(player={}){const portfolio=normalizeStockPortfolioWebV1074(player);player.stockPortfolio={positions:portfolio.positions,ledger:portfolio.ledger,legacyInventoryMigrated:portfolio.legacyInventoryMigrated};player.inventory=portfolio.inventory;return player;}
  const compileDataBeforeStocksWebV1074=compileData;
  compileData=function(...args){const result=compileDataBeforeStocksWebV1074(...args);App.data.players.forEach(normalizeStockPlayerWebV1074);return result;};

  function stockPortfolioStatsWebV1074(player,rotation){
    normalizeStockPlayerWebV1074(player);const portfolio=player.stockPortfolio,quotes=new Map((rotation.quotes||[]).map(row=>[row.itemId,row]));let marketValue=0,invested=0,unrealized=0,unpricedQty=0,expenses=0,income=0,realized=0;
    Object.values(portfolio.positions||{}).forEach(position=>{const quote=quotes.get(position.itemId),qty=stockQtyWebV1074(position),known=Math.max(0,Number(position.knownQty||0)),basis=Math.max(0,Number(position.costBasis||0));invested+=basis;unpricedQty+=Math.max(0,Number(position.unpricedQty||0));if(quote){marketValue+=qty*quote.price;unrealized+=known*quote.price-basis;}});
    (portfolio.ledger||[]).forEach(row=>{if(row.type==='buy')expenses+=Number(row.total||0);if(row.type==='sell'){income+=Number(row.total||0);if(Number.isFinite(Number(row.realizedPnl)))realized+=Number(row.realizedPnl);}});
    return{portfolio,quotes,marketValue,invested,unrealized,unpricedQty,expenses,income,realized,totalResult:realized+unrealized};
  }
  function stockSparklineWebV1074(history=[]){
    if(history.length<2)return'';const values=history.map(row=>Number(row.price||0)),min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min),width=420,height=110,pad=8,points=history.map((row,index)=>`${pad+(index/(history.length-1))*(width-pad*2)},${height-pad-((Number(row.price||0)-min)/span)*(height-pad*2)}`).join(' '),last=history[history.length-1];
    return`<div class="stock-chart-v1074 ${stockChangeClassWebV1074(values[values.length-1]-values[0])}"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="История цены за 30 игровых дней"><polyline points="${points}" /></svg><div><span>${esc(formatDate(history[0]?.day))}</span><b>${formatCredits(min)} — ${formatCredits(max)}</b><span>${esc(formatDate(last?.day))}</span></div></div>`;
  }
  function stockRelatedArticlesWebV1074(item={}){const player=currentPlayer(),rows=(Array.isArray(item.relatedArticleIds)?item.relatedArticleIds:[]).map(id=>App.data.articles.get(String(id))).filter(article=>article&&visibleForPlayer(article,player?.id));if(!rows.length)return'';return`<div class="stock-related-v1074"><b>Связанные материалы</b><div>${rows.map(article=>`<button class="secondary" type="button" data-action="open-article" data-article-id="${esc(article.id)}">${esc(article.name||article.title||article.id)}</button>`).join('')}</div></div>`;}
  function stockOfferTileWebV1074(offer){const item=App.data.items.get(offer.itemId);if(!item)return'';return`<button class="stock-quote-tile-v1074 ${stockSelectionWebV1074?.source==='market'&&stockSelectionWebV1074.itemId===item.id?'selected':''} ${stockChangeClassWebV1074(offer.change)}" type="button" draggable="true" data-web-stock-v1074 data-source="market" data-item-id="${esc(item.id)}"><span>${esc(stockTickerWebV1074(item))}</span><b>${esc(item.name||item.id)}</b><strong>${formatCredits(offer.price)}</strong><small>${offer.change>=0?'▲':'▼'} ${Math.abs(Number(offer.changePercent||0)).toFixed(2)}% · ${signedCreditsWebV1074(offer.change)}</small></button>`;}
  function stockPortfolioMarkupWebV1074(player,rotation){
    const stats=stockPortfolioStatsWebV1074(player,rotation),positions=Object.values(stats.portfolio.positions||{}).filter(row=>stockQtyWebV1074(row)>0).sort((a,b)=>stockTickerWebV1074(App.data.items.get(a.itemId)).localeCompare(stockTickerWebV1074(App.data.items.get(b.itemId)),'ru'));
    const holdings=positions.map(position=>{const item=App.data.items.get(position.itemId)||{id:position.itemId,name:position.itemId},quote=stats.quotes.get(position.itemId),qty=stockQtyWebV1074(position),value=quote?qty*quote.price:0,average=Number(position.knownQty||0)>0?Number(position.costBasis||0)/Number(position.knownQty):null;return`<button class="stock-holding-v1074 ${stockSelectionWebV1074?.source==='portfolio'&&stockSelectionWebV1074.itemId===position.itemId?'selected':''}" type="button" draggable="true" data-web-stock-v1074 data-source="portfolio" data-item-id="${esc(position.itemId)}"><span class="stock-holding-symbol-v1074">${esc(stockTickerWebV1074(item))}</span><span><b>${esc(item.name||item.id)}</b><small>${qty} шт.${average==null?' · без истории покупки':` · средняя ${formatCredits(average)}`}</small></span><span><b>${quote?formatCredits(value):'Нет котировки'}</b>${quote?`<small class="${stockChangeClassWebV1074(quote.change)}">${quote.change>=0?'▲':'▼'} ${Math.abs(Number(quote.changePercent||0)).toFixed(2)}%</small>`:''}</span></button>`;}).join(''),ledger=(stats.portfolio.ledger||[]).slice(-10).reverse();
    return`<div class="portfolio-shell-v1074" data-web-stock-portfolio-drop-v1074><div class="portfolio-head-v1074"><div><span class="eyebrow">PERSONAL SECURITIES ACCOUNT</span><b>Портфель</b></div><strong>${formatCredits(stats.marketValue)}</strong></div><div class="portfolio-metrics-v1074"><div><span>Стоимость портфеля</span><b>${formatCredits(stats.marketValue)}</b></div><div><span>Вложено</span><b>${formatCredits(stats.invested)}</b></div><div><span>Доход от продаж</span><b>${formatCredits(stats.income)}</b></div><div><span>Расходы на покупки</span><b>${formatCredits(stats.expenses)}</b></div><div class="${stockChangeClassWebV1074(stats.unrealized)}"><span>Нереализованный результат</span><b>${signedCreditsWebV1074(stats.unrealized)}</b></div><div class="${stockChangeClassWebV1074(stats.realized)}"><span>Зафиксированный результат</span><b>${signedCreditsWebV1074(stats.realized)}</b></div><div class="portfolio-result-v1074 ${stockChangeClassWebV1074(stats.totalResult)}"><span>Общий результат</span><b>${signedCreditsWebV1074(stats.totalResult)}</b></div></div>${stats.unpricedQty?`<div class="portfolio-legacy-note-v1074">${stats.unpricedQty} акц. перенесено из старого инвентаря без цены приобретения и не участвует в расчёте прибыли.</div>`:''}<div class="portfolio-holdings-v1074">${holdings||'<div class="market-selection-empty-v1071">Портфель пуст.</div>'}</div><div class="portfolio-ledger-v1074"><div class="portfolio-ledger-head-v1074"><b>Последние операции</b><span>${ledger.length}</span></div>${ledger.map(row=>{const item=App.data.items.get(row.itemId)||{id:row.itemId};return`<div class="portfolio-ledger-row-v1074"><span class="${row.type==='buy'?'down':'up'}">${row.type==='buy'?'ПОКУПКА':'ПРОДАЖА'}</span><b>${esc(stockTickerWebV1074(item))}</b><span>${esc(formatDate(row.marketDay))}</span><strong>${row.type==='buy'?'-':'+'}${formatCredits(row.total||0)}</strong></div>`;}).join('')||'<div class="small-note">Операций ещё нет.</div>'}</div></div>`;
  }
  function stockSelectionMarkupWebV1074(player,planet,rotation){
    const item=stockSelectionWebV1074?.itemId?App.data.items.get(stockSelectionWebV1074.itemId):null;if(!item)return'<div class="market-selection-empty-v1071">Выберите акцию или позицию портфеля.</div>';const buy=stockSelectionWebV1074.source==='market',offer=(buy?rotation.offers:rotation.quotes).find(row=>row.itemId===item.id),position=player.stockPortfolio?.positions?.[item.id],qty=stockQtyWebV1074(position),disabled=!rotation.stockMarketEnabled||!offer||(buy&&Number(player.credits||0)<Number(offer?.price||0))||(!buy&&qty<1),campaign=App.data.campaigns.get(App.config?.campaignId||'main')||{},history=MarketEngineV1071.priceHistory({campaignId:App.config?.campaignId||'main',campaign,gameDate:campaign.marketDate,planet,planets:App.data.planets,equipment:App.data.items,itemId:item.id,endDay:rotation.rotationKey,days:30});
    return`<div class="stock-selection-v1074"><div class="stock-selection-head-v1074">${renderEntityThumb(item)}<div><span class="stock-symbol-v1074">${esc(stockTickerWebV1074(item))}</span><h2>${esc(item.name||item.id)}</h2><p>${esc(item.desc||item.description||'Описание акции не задано.')}</p></div><div class="stock-selection-quote-v1074 ${stockChangeClassWebV1074(offer?.change)}"><span>Текущая цена</span><b>${formatCredits(offer?.price||0)}</b><small>Предыдущий день: ${formatCredits(offer?.previousPrice||0)}</small><strong>${offer?.change>=0?'▲':'▼'} ${Math.abs(Number(offer?.changePercent||0)).toFixed(2)}% · ${signedCreditsWebV1074(offer?.change||0)}</strong></div></div>${stockSparklineWebV1074(history)}<div class="stock-position-facts-v1074"><span>В портфеле: <b>${qty} шт.</b></span><span>Известная себестоимость: <b>${formatCredits(position?.costBasis||0)}</b></span><span>Игровой день: <b>${esc(formatDate(rotation.rotationKey))}</b></span></div>${stockRelatedArticlesWebV1074(item)}<button class="primary" type="button" data-web-stock-action-v1074="${buy?'buy':'sell'}" ${disabled?'disabled':''}>${buy?'КУПИТЬ АКЦИЮ':'ПРОДАТЬ АКЦИЮ'}</button></div>`;
  }
  const renderGoodsMarketBeforeStocksWebV1074=renderMarket;
  renderMarket=function(){
    if(marketTabWebV1073!=='stocks'){renderGoodsMarketBeforeStocksWebV1074();return;}
    const root=$('#screen-market'),player=currentPlayer(),planet=currentPlanet();setTopbar('Торговый терминал','Глобальная биржа и личный портфель');if(!player||!planet){root.innerHTML='<div class="placeholder market-disabled">Терминал заблокирован. У профиля нет текущей планеты.</div>';return;}normalizeStockPlayerWebV1074(player);const rotation=marketRotationWebV1071(planet),offers=rotation.offers.filter(row=>MarketEngineV1071.isStock(App.data.items.get(row.itemId)));if(stockSelectionWebV1074&&!MarketEngineV1071.isStock(App.data.items.get(stockSelectionWebV1074.itemId)))stockSelectionWebV1074=null;
    root.innerHTML=`<div class="market-terminal-v1071 ${rotation.stockMarketEnabled?'':'locked'}"><div class="hero-card market-hero-v1071"><div class="section-head"><div><div class="eyebrow">GLOBAL SECURITIES</div><div class="section-title">${esc(planet.name)}</div><div class="small-note">Игровой день рынка: ${esc(formatDate(rotation.rotationKey))}</div></div><div class="pill">Баланс: ${formatCredits(player.credits||0)}</div></div></div><div class="market-tabs-v1073" role="tablist"><button class="secondary" type="button" data-web-market-tab-v1073="goods">ТОВАРЫ</button><button class="secondary active" type="button" data-web-market-tab-v1073="stocks">АКЦИИ</button></div><div class="market-access-banner-v1071 ${rotation.stockMarketEnabled?'ok':'err'}">${rotation.stockMarketEnabled?'Все акции доступны по единым ценам на всех планетах. Продажа — 100% текущей котировки.':'На этой планете нет фондового рынка. Портфель доступен для просмотра, торговые операции отключены.'}</div><div class="market-dual-grid-v1071 stock-layout-v1074"><section class="market-pane-v1071" data-web-stock-market-drop-v1074><div class="market-pane-head-v1071"><div><span class="eyebrow">GLOBAL QUOTES</span><b>Биржевые котировки</b></div><span>${offers.length} поз.</span></div><div class="stock-quotes-grid-v1074">${offers.map(stockOfferTileWebV1074).join('')||'<div class="placeholder">На этой планете фондовый рынок недоступен.</div>'}</div></section><section class="market-pane-v1071">${stockPortfolioMarkupWebV1074(player,rotation)}</section></div>${stockSelectionMarkupWebV1074(player,planet,rotation)}</div>`;
  };
  document.addEventListener('click',event=>{const tile=event.target?.closest?.('[data-web-stock-v1074]');if(tile&&tile.closest('#screen-market')){stockSelectionWebV1074={source:String(tile.dataset.source||''),itemId:String(tile.dataset.itemId||'')};renderMarket();return;}const action=event.target?.closest?.('[data-web-stock-action-v1074]');if(action&&stockSelectionWebV1074)transactMarketWebV1071({action:String(action.dataset.webStockActionV1074),itemId:stockSelectionWebV1074.itemId}).catch(error=>notify(error.message||String(error),'err'));});
  document.addEventListener('dragstart',event=>{const node=event.target?.closest?.('[data-web-stock-v1074]');if(!node||!node.closest('#screen-market'))return;stockDragWebV1074={source:String(node.dataset.source||''),itemId:String(node.dataset.itemId||'')};event.dataTransfer.effectAllowed=stockDragWebV1074.source==='market'?'copy':'move';try{event.dataTransfer.setData('text/plain',stockDragWebV1074.itemId);}catch{}});
  document.addEventListener('dragend',event=>{if(event.target?.closest?.('[data-web-stock-v1074]'))stockDragWebV1074=null;});
  document.addEventListener('dragover',event=>{if(!stockDragWebV1074)return;const target=stockDragWebV1074.source==='market'?event.target?.closest?.('[data-web-stock-portfolio-drop-v1074]'):event.target?.closest?.('[data-web-stock-market-drop-v1074]');if(target){event.preventDefault();event.dataTransfer.dropEffect=stockDragWebV1074.source==='market'?'copy':'move';}});
  document.addEventListener('drop',event=>{if(!stockDragWebV1074)return;const portfolio=event.target?.closest?.('[data-web-stock-portfolio-drop-v1074]'),market=event.target?.closest?.('[data-web-stock-market-drop-v1074]');if((stockDragWebV1074.source==='market'&&!portfolio)||(stockDragWebV1074.source==='portfolio'&&!market))return;event.preventDefault();const payload={action:stockDragWebV1074.source==='market'?'buy':'sell',itemId:stockDragWebV1074.itemId};stockDragWebV1074=null;transactMarketWebV1071(payload).catch(error=>notify(error.message||String(error),'err'));});

  applyEraThemeV1049('technological');

  async function init() {
    bindGlobalEvents();
    await loadLocalState();
    syncRememberControls();

    const hasCached = RUNTIME.cloudOnly ? false : await bootFromCacheIfNeeded();
    if (!App.config) App.config = normalizeConfig({ url: DEFAULTS.url, campaignId: 'main', deviceLabel: 'web-player' });
    if (hasConfig()) {
      try {
        await pullEverything({ silent: true });
      } catch (error) {
        if (!hasCached) {
          openBoot('login');
          renderLogin();
          const status = $('#login-status');
          if (status) status.textContent = `Не удалось получить список персонажей: ${error.message}`;
          return;
        }
        notify(`Загружен локальный кеш. Облако сейчас недоступно: ${error.message}`, 'warn');
      }
      renderLogin();
      if (App.session?.userId && App.data.players.has(App.session.userId) && sessionCampaignAllowedV1049()) {
        applyEraThemeV1049(campaignV1049(selectedCampaignV1049()));
        openBoot('app');
        renderCurrentScreen();
        startRealtimeSync();
      } else {
        if (App.session?.userId && String(App.session.role || '').toLowerCase() !== 'guest') { App.session = null; await storageRemove(KEYS.session); }
        openBoot('login');
      }
      return;
    }
    openBoot('login');
    renderLogin();
    const status = $('#login-status');
    if (status) status.textContent = hasRuntimeServiceAuth()
      ? 'Выберите персонажа и введите его пароль.'
      : 'Web-деплой не содержит автоматической PocketBase-авторизации. Выполните деплой из DEV-профиля ДМа.';
  }

  init().catch(error => {
    openBoot('login');
    renderLogin();
    const status = $('#login-status');
    if (status) status.textContent = error.message;
    notify(`Ошибка запуска: ${error.message}`, 'err');
  });
})();
