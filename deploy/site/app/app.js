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
      flora: new Map(),
      fauna: new Map(),
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
      directArticleIdV1082: '',
      directRelatedEntityV1100: null,
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
  const GRPG_LORE_ERA_V1075 = 'Ð’.Ð­.';
  function formatDate(value) {
    if (!value) return 'â€”';
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
    return Boolean(config?.url && config?.campaignId);
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
    const title = entity?.name || entity?.title || entity?.displayName || entity?.id || 'â€”';
    const isItem = Boolean(entity?.id && App.data.items?.has?.(entity.id));
    const cls = `${mode === 'hero' ? 'entity-hero-image' : 'entity-thumb'}${isItem ? ' entity-item-media-v1060' : ''}`;
    if (image) return `<div class="${cls}"><img src="${esc(image)}" alt="${esc(title)}" /></div>`;
    const glyph = initials(title);
    return `<div class="${cls} placeholder-thumb"><span>${esc(glyph)}</span></div>`;
  }

  function renderEntityAvatar(entity, label = '', sizeClass = '') {
    const image = mediaFromEntity(entity);
    const title = label || entity?.name || entity?.title || entity?.displayName || entity?.id || 'â€”';
    if (image) return `<div class="avatar-circle ${sizeClass}"><img src="${esc(image)}" alt="${esc(title)}" /></div>`;
    return `<div class="avatar-circle ${sizeClass}">${esc(entity?.avatarGlyph || initials(title))}</div>`;
  }

  function equipmentLabel(slot) {
    return ({ primaryWeapon: 'ÐžÑÐ½Ð¾Ð²Ð½Ð¾Ðµ Ð¾Ñ€ÑƒÐ¶Ð¸Ðµ / Ñ‰Ð¸Ñ‚', secondaryWeapon: 'Ð’Ñ‚Ð¾Ñ€Ð¸Ñ‡Ð½Ð¾Ðµ Ð¾Ñ€ÑƒÐ¶Ð¸Ðµ', armor: 'Ð‘Ñ€Ð¾Ð½Ñ' }[slot] || slot);
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
    return item?.name || item?.title || item?.id || 'â€”';
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
  const ARCHIVE_SECTION_LABELS_V1079 = { articles: 'Ð¡Ñ‚Ð°Ñ‚ÑŒÐ¸', planets: 'ÐŸÐ»Ð°Ð½ÐµÑ‚Ñ‹', systems: 'Ð¡Ð¸ÑÑ‚ÐµÐ¼Ñ‹', equipment: 'Ð¡Ð½Ð°Ñ€ÑÐ¶ÐµÐ½Ð¸Ðµ' };

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
    if (item._type === 'article') return String(item.category || item.section || 'Ð‘ÐµÐ· ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¸').trim() || 'Ð‘ÐµÐ· ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¸';
    if (item._type === 'item') {
      const labels = { weapon: 'ÐžÑ€ÑƒÐ¶Ð¸Ðµ', armor: 'Ð‘Ñ€Ð¾Ð½Ñ', implant: 'Ð˜Ð¼Ð¿Ð»Ð°Ð½Ñ‚Ñ‹', stock: 'ÐÐºÑ†Ð¸Ð¸', equipment: 'Ð¡Ð½Ð°Ñ€ÑÐ¶ÐµÐ½Ð¸Ðµ', gear: 'Ð¡Ð½Ð°Ñ€ÑÐ¶ÐµÐ½Ð¸Ðµ' };
      return labels[String(item.type || '').toLowerCase()] || String(item.category || item.type || 'ÐŸÑ€Ð¾Ñ‡ÐµÐµ').trim() || 'ÐŸÑ€Ð¾Ñ‡ÐµÐµ';
    }
    if (item._type === 'planet') return String(item.location?.system || item.location?.obj || item.code || 'Ð”Ñ€ÑƒÐ³Ð¸Ðµ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹').trim() || 'Ð”Ñ€ÑƒÐ³Ð¸Ðµ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹';
    return 'Ð—Ð²Ñ‘Ð·Ð´Ð½Ñ‹Ðµ ÑÐ¸ÑÑ‚ÐµÐ¼Ñ‹';
  }

  function archiveCategoryV1079(item = {}, globalScope = false) {
    const base = archiveBaseCategoryV1079(item);
    return globalScope ? `${ARCHIVE_SECTION_LABELS_V1079[archiveSectionForTypeV1079(item._type)]} Â· ${base}` : base;
  }

  function normalizeArchiveSearchV1079(value) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/Ñ‘/g, 'Ðµ').replace(/\s+/g, ' ').trim().toLowerCase();
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
    if (!items.length) return '<div class="placeholder">ÐÐ¸Ñ‡ÐµÐ³Ð¾ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾.</div>';
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
      return `<details class="archive-group-v1079" data-archive-group="${esc(category)}" ${options.openGroups ? options.openGroups.has(category) ? 'open' : '' : forceOpen || containsSelected || groupIndex === 0 ? 'open' : ''}>
        <summary><span>${esc(category)}</span><span class="archive-group-count-v1079">${group.length}</span></summary>
        <div class="archive-group-list-v1079">${group.map(item => {
        const unread = item._type === 'article' && !isArchiveArticleRead(item.id);
        const favorite = favorites.has(archiveEntryKeyV1079(item));
        return `
          <article class="archive-entry-v1079 ${item.id === entity?.id && item._type === entity?._type ? 'active' : ''} ${unread ? 'unread' : ''}" data-action="select-archive" data-type="${esc(item._type)}" data-id="${esc(item.id)}" tabindex="0" role="button">
            ${renderEntityAvatar(item, archiveItemLabel(item), 'sm')}
            <div class="archive-entry-copy-v1079"><div class="archive-entry-title-v1079">${unread ? '<b class="new-badge">ÐÐžÐ’ÐžÐ•</b> ' : ''}${esc(archiveItemLabel(item))}</div><div class="small-note archive-entry-summary-v1079">${esc(item.summary || item.subtitle || archiveBaseCategoryV1079(item))}</div></div>
            <button class="archive-favorite-v1079 ${favorite ? 'active' : ''}" type="button" data-action="archive-favorite-v1079" data-type="${esc(item._type)}" data-id="${esc(item.id)}" aria-label="${favorite ? 'Ð£Ð±Ñ€Ð°Ñ‚ÑŒ Ð¸Ð· Ð¸Ð·Ð±Ñ€Ð°Ð½Ð½Ð¾Ð³Ð¾' : 'Ð”Ð¾Ð±Ð°Ð²Ð¸Ñ‚ÑŒ Ð² Ð¸Ð·Ð±Ñ€Ð°Ð½Ð½Ð¾Ðµ'}">${favorite ? 'â˜…' : 'â˜†'}</button>
          </article>
        `;
      }).join('')}</div></details>`;
    }).join('');
  }

  function sortArchiveItemsForMobile(items = [], tab = '') {
    // Stable order: category grouping happens later, items are always alphabetical.
    // (Unread-first sorting made tiles jump to a new grid position the moment an
    // article was read â€” the list must not reorder itself while browsing.)
    const list = [...(Array.isArray(items) ? items : [])];
    return list.sort((a, b) => slugText(archiveItemLabel(a)).localeCompare(slugText(archiveItemLabel(b)), 'ru'));
  }

  function normalizeRichHtml(html = '', options = {}) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const preserveEmptyInteractiveImages = options.interactive === true && Boolean(template.content.querySelector('script'));
    template.content.querySelectorAll('img').forEach(img => {
      const src = resolveMediaUrl(img.getAttribute('src') || '', img.getAttribute('data-storage-path') || img.dataset.storagePath || '');
      if (!src) {
        // Interactive articles may intentionally keep an empty image element
        // and assign its source later from their isolated script.
        if (preserveEmptyInteractiveImages) return;
        const stub = document.createElement('div');
        stub.className = 'media-missing';
        stub.textContent = 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾ Ð½Ð° Ð¼Ð¾Ð±Ð¸Ð»ÑŒÐ½Ð¾Ð¼ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ðµ';
        img.replaceWith(stub);
        return;
      }
      img.setAttribute('src', src);
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    });
    template.content.querySelectorAll('a[href]').forEach(link => {
      const href = String(link.getAttribute('href') || '').trim();
      if (!href || linkedArticleIdV1082(href) || linkedCharacterTargetV1086(href).entityId) return;
      if (/^(https?:|mailto:|tel:|#)/i.test(href)) return;
      link.setAttribute('href', resolveMediaUrl(href));
    });
    const normalized = template.innerHTML;
    if (window.GRPGRichTextScope?.isolateHtml) return window.GRPGRichTextScope.isolateHtml(normalized, '', options);
    template.content.querySelectorAll('style, script, link[rel~="stylesheet"], link[as="style"]').forEach(node => node.remove());
    return `<div class="grpgi-rich-scope-v1081">${template.innerHTML}</div>`;
  }

  function normalizeProfileLoreHtmlV1103(value = '') {
    const source = String(value || '');
    const html = /<\/?[a-z][^>]*>/i.test(source)
      ? source
      : esc(source).replace(/\r?\n/g, '<br>');
    return normalizeRichHtml(html);
  }

  function linkedArticleIdV1082(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = raw.match(/^(?:article:|local-article:)(.+)$/i);
    const uri = raw.match(/^(?:article|local-article):\/\/(.+)$/i);
    const id = String(direct?.[1] || uri?.[1] || '').replace(/^\/+/, '').trim();
    if (!id) return '';
    try { return decodeURIComponent(id); } catch { return id; }
  }

  function linkedCharacterTargetV1086(value = '', link = null) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(player|character|npc):(?:\/\/)?(.+)$/i);
    const entityType = String(link?.dataset?.entityType || match?.[1] || '').toLowerCase();
    const encodedId = String(link?.dataset?.entityId || match?.[2] || '').replace(/^\/+/, '').trim();
    if (!encodedId) return { entityType: '', entityId: '' };
    let entityId = encodedId;
    try { entityId = decodeURIComponent(encodedId); } catch {}
    return { entityType: entityType === 'character' ? 'player' : entityType, entityId };
  }

  function articleSearchOnlyV1082(article = {}) {
    return article.searchOnly === true || String(article.searchOnly || '').toLowerCase() === 'true';
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

  async function pbFetch(config, pathname, options = {}) {
    const base = pbBaseUrl(config);
    const url = new URL(pathname, `${base}/`);
    Object.entries(options.query || {}).forEach(([key, value]) => {
      if (value == null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    for (let attempt = 0; attempt < 1; attempt += 1) {
      const headers = { ...(options.headers || {}) };
      let body = options.body;
      if (options.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.json ?? {});
      }
      const response = await fetch(url.toString(), { method: options.method || 'GET', headers, body });
      const text = await response.text().catch(() => '');
      const payload = text ? (() => { try { return JSON.parse(text); } catch { return { text }; } })() : null;
      if (!response.ok) {
        const detail = payload?.data ? ` // ${JSON.stringify(payload.data)}` : '';
        const error=new Error(`${payload?.message || text || 'PocketBase request failed'}: HTTP ${response.status}${detail}`);error.status=response.status;throw error;
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

  function canonicalChatThreadKeyV1090(record = {}) {
    const explicit = String(record.thread_key || record.threadKey || '').trim();
    if (explicit.startsWith('campaign::')) return explicit;
    const directA = String(record.direct_a || record.directA || '').trim();
    const directB = String(record.direct_b || record.directB || '').trim();
    if (directA && directB) return [directA, directB].sort().join('__');
    const kind = String(record.kind || 'direct').toLowerCase();
    const npcId = String(record.npc_id || record.npcId || '').trim();
    const recipientId = String(record.recipient_player_id || record.recipientPlayerId || '').trim();
    if ((kind === 'npc' || npcId) && npcId && recipientId) return `${npcId}__${recipientId}`;
    const senderType = String(record.sender_type || record.senderType || 'player').toLowerCase();
    const senderId = String(record.sender_id || record.senderId || '').trim();
    if (senderType === 'player' && senderId && recipientId) return [senderId, recipientId].sort().join('__');
    return explicit;
  }

  function normalizeChatRow(record = {}) {
    if (!record) return null;
    const retiredThreadKey = String(record.thread_key || record.threadKey || '').trim();
    const retiredKind = String(record.kind || '').trim().toLowerCase();
    if (retiredThreadKey.startsWith('notice::') || retiredKind === 'system_notice') return null;
    const row = {
      id: record.id || null,
      campaign_id: record.campaign_id || record.campaignId || null,
      message_id: record.message_id || record.messageId || null,
      kind: record.kind || 'direct',
      thread_key: record.thread_key || record.threadKey || '',
      sender_type: record.sender_type || record.senderType || 'player',
      sender_id: record.sender_id || record.senderId || null,
      recipient_player_id: record.recipient_player_id || record.recipientPlayerId || null,
      npc_id: record.npc_id || record.npcId || null,
      direct_a: record.direct_a || record.directA || null,
      direct_b: record.direct_b || record.directB || null,
      author_label: record.author_label || record.authorLabel || null,
      body_html: record.body_html || record.bodyHtml || '',
      created_at: record.created_at || record.clientCreatedAt || record.created || record.updated || null,
      edited_at: record.edited_at || record.editedAt || null,
      deleted_at: record.deleted_at || record.deletedAt || null,
      updated_at: record.updated_at || record.updated || record.clientUpdatedAt || null,
      client_updated_at: record.client_updated_at || record.clientUpdatedAt || record.updated || null
    };
    row.thread_key = canonicalChatThreadKeyV1090(row);
    return row;
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
    const normalized = rows.map(normalizePlayerRow).filter(Boolean);
    try {
      const applications = await apiPullPendingApplications(config);
      const merged = new Map(normalized.map(row => [String(row.player_id || ''), row]));
      applications.forEach(row => merged.set(String(row.player_id || ''), row));
      App.ui.applicationInboxError = '';
      return Array.from(merged.values()).filter(row => row?.player_id);
    } catch (error) {
      App.ui.applicationInboxError = error?.message || String(error);
      return normalized;
    }
  }

  async function apiPullPendingApplications(config) {
    const payload = await pbFetch(config, '/api/grpgi/character-applications', {
      query: { campaignId: config.campaignId }
    });
    if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error(payload?.message || 'Ð¡ÐµÑ€Ð²ÐµÑ€Ð½Ñ‹Ð¹ Ð¶ÑƒÑ€Ð½Ð°Ð» Ð°Ð½ÐºÐµÑ‚ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½');
    return payload.rows.map(normalizePlayerRow).filter(row => row?.player_id && String(row?.profile_json?.approvalStatus || '').toLowerCase() === 'pending');
  }

  async function apiPullPlayer(config, playerId) {
    const record = await pbFirst(config, 'players', pbAnd(pbEq('campaignId', config.campaignId), pbEq('playerId', playerId)));
    return normalizePlayerRow(record);
  }

  async function apiUpsertPlayer(config, payload) {
    const result=await pbFetch(config,'/api/grpgi/players/mutate',{method:'POST',json:{
      campaignId:config.campaignId,playerId:payload.player_id,create:true,baseVersion:0,
      operationId:payload.operationId||window.GRPGPlayerSyncCoreV135.operationId(),
      player:composePlayerJsonFromSegments(payload),updatedBy:payload.updated_by||config.deviceLabel||'web'
    }});
    if(!result?.ok)throw new Error(result?.message||'ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ ÑÐ¾Ð·Ð´Ð°Ñ‚ÑŒ Ð¸Ð³Ñ€Ð¾ÐºÐ°');
    return normalizePlayerRow(result.row);
  }

  async function apiCreatePlayer(config, payload) {
    const now = new Date().toISOString();
    const body = {
      campaignId: config.campaignId,
      playerId: payload.player_id,
      version: 1,
      updatedBy: payload.updated_by || config.deviceLabel || 'web-registration',
      clientUpdatedAt: payload.client_updated_at || now,
      playerJson: composePlayerJsonFromSegments(payload)
    };
    const response = await pbFetch(config, '/api/grpgi/character-applications/submit', { method: 'POST', json: body });
    const normalized = normalizePlayerRow(response?.row || null);
    const acceptedPlayerId = String(normalized?.player_id || '').trim();
    if (!response?.ok || !normalized || !acceptedPlayerId || normalized.deleted_at || normalized.profile_json?.__deleted) throw new Error(response?.message || 'Ð¡ÐµÑ€Ð²ÐµÑ€ Ð²ÐµÑ€Ð½ÑƒÐ» ÑÐºÑ€Ñ‹Ñ‚ÑƒÑŽ Ð¸Ð»Ð¸ Ð½ÐµÐºÐ¾Ñ€Ñ€ÐµÐºÑ‚Ð½ÑƒÑŽ Ð°Ð½ÐºÐµÑ‚Ñƒ');
    const readBack = await apiPullPendingApplications(config);
    const confirmed = readBack.find(row => String(row.player_id || '') === acceptedPlayerId);
    if (!confirmed) throw new Error('ÐÐ½ÐºÐµÑ‚Ð° ÑÐ¾Ð·Ð´Ð°Ð½Ð°, Ð½Ð¾ Ð½Ðµ Ð¿Ð¾ÑÐ²Ð¸Ð»Ð°ÑÑŒ Ð² ÑÐµÑ€Ð²ÐµÑ€Ð½Ð¾Ð¼ Ð¶ÑƒÑ€Ð½Ð°Ð»Ðµ Ð”ÐœÐ°');
    return confirmed;
  }

  async function apiReviewPlayerApplication(config, playerId, status, reviewedBy) {
    const response = await pbFetch(config, '/api/grpgi/character-applications/review', {
      method: 'POST',
      json: {
        campaignId: config.campaignId,
        playerId,
        status,
        reviewedBy: reviewedBy || 'gm',
        updatedBy: config.deviceLabel || 'web-gm'
      }
    });
    const normalized = normalizePlayerRow(response?.row || null);
    if (!response?.ok || !normalized) throw new Error(response?.message || 'Ð¡ÐµÑ€Ð²ÐµÑ€ Ð½Ðµ Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð´Ð¸Ð» Ñ€ÐµÑˆÐµÐ½Ð¸Ðµ Ð¿Ð¾ Ð°Ð½ÐºÐµÑ‚Ðµ');
    return normalized;
  }

  async function apiPatchPlayerWithVersion(config, playerId, expectedVersion, payload) {
    const result=await pbFetch(config,'/api/grpgi/players/mutate',{method:'POST',json:{
      campaignId:config.campaignId,playerId,baseVersion:expectedVersion,
      operationId:payload.operationId||window.GRPGPlayerSyncCoreV135.operationId(),
      basePlayer:payload.basePlayer,player:composePlayerJsonFromSegments(payload),
      updatedBy:payload.updated_by||config.deviceLabel||'web',clientUpdatedAt:new Date().toISOString()
    }});
    if(!result?.ok){
      if(result?.status==='conflict')return null;
      throw new Error(result?.message||'Ð˜Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ðµ Ð½Ðµ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¾');
    }
    return normalizePlayerRow(result.row);
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
      const current = { id: row.player_id };
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
    const newest=new Map((playerRows||[]).map(row=>[row.player_id,row]));
    for(const [id,row] of App.data.playerRows||[]){
      if(row.campaign_id&&row.campaign_id!==App.config.campaignId)continue;
      const incoming=newest.get(id);
      if(!incoming||Number(row.version||0)>Number(incoming.version||0))newest.set(id,row);
    }
    playerRows=Array.from(newest.values());
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
    App.data.flora = new Map(Object.entries(world.flora?.FLORA || {}).map(([id, value]) => [id, deep(value)]));
    App.data.fauna = new Map(Object.entries(world.fauna?.FAUNA || {}).map(([id, value]) => [id, deep(value)]));
    App.data.items = new Map(Object.entries(world.equipment?.EQUIPMENT || {}).map(([id, value]) => [id, deep(value)]));
    App.data.campaigns = new Map(Object.entries(world.campaigns?.CAMPAIGNS || {}).map(([id, value]) => [id, deep(value)]));
    if (!App.data.campaigns.size) App.data.campaigns.set('main', { id: 'main', name: 'ÐžÑÐ½Ð¾Ð²Ð½Ð°Ñ ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ñ' });
    App.data.skills = new Map(Object.entries(world.skills?.SKILLS || {}).map(([id, value]) => [id, deep(value)]));
    App.data.factions = new Map(Object.entries(world.factions?.FACTIONS || {}).map(([id, value]) => [id, deep(value)]));
    App.data.organizations = new Map(Object.entries(world.organizations?.ORGANIZATIONS || {}).map(([id, value]) => [id, deep(value)]));
    App.data.combatScenes = Object.values(world.combatScenes?.COMBAT_SCENES || {}).map(scene => deep(scene));
    App.data.chatRows = Array.isArray(chatRows) ? chatRows.map(normalizeChatRow).filter(row => row?.message_id).map(deep) : [];
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
    App.auth = { token: '', expiresAt: 0 };
    await storageRemove(KEYS.auth);
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
    $('#campaign-label').textContent = App.config?.campaignId || 'ÐšÐÐœÐŸÐÐÐ˜Ð¯';
  }

  async function bootFromCacheIfNeeded() {
    if (!App.cache?.snapshot) return false;
    if (App.cache?.combatRuntimeByScene && typeof App.cache.combatRuntimeByScene === 'object') App.data.combatRuntimeByScene = new Map(Object.entries(App.cache.combatRuntimeByScene).map(([id, runtime]) => [id, deep(runtime)]));
    compileData(App.cache.snapshot, App.cache.players || [], App.cache.chat || [], App.cache.combatRuntime || null);
    return true;
  }

  async function pullEverything({ silent = false, render = true } = {}) {
    if (!hasConfig()) throw new Error('Ð¡Ð¸Ð½Ñ…Ñ€Ð¾Ð½Ð¸Ð·Ð°Ñ†Ð¸Ñ ÐµÑ‰Ñ‘ Ð½Ðµ Ð½Ð°ÑÑ‚Ñ€Ð¾ÐµÐ½Ð°');
    const [snapshot, players, chatRows, combatRuntime] = await Promise.all([
      apiPullSnapshot(App.config, true),
      apiPullPlayers(App.config),
      apiPullChat(App.config, null),
      apiPullCombatRuntime(App.config)
    ]);
    if (!snapshot) throw new Error('Ð’ Ð¾Ð±Ð»Ð°ÐºÐµ Ð½ÐµÑ‚ ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸ Ñ Ñ‚Ð°ÐºÐ¸Ð¼ CAMPAIGN_ID');
    App.cache.snapshot = snapshot;
    compileData(snapshot, players, chatRows, combatRuntime);
    await saveCache();
    if (render) renderAffectedScreens({ snapshot: true, players: true, chat: true, combat: true });
    if (!silent) notify('ÐšÐ°Ð¼Ð¿Ð°Ð½Ð¸Ñ Ð¾Ð±Ð½Ð¾Ð²Ð»ÐµÐ½Ð° Ð¸Ð· Ð¾Ð±Ð»Ð°ÐºÐ°', 'ok');
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
    return `<option value="all">Ð’ÑÐµ ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸</option>${rows.map(row => `<option value="${esc(row.id)}">${esc(row.name || row.id)}</option>`).join('')}`;
  }

  function guestProfile() {
    return {
      id: GUEST_ID,
      role: 'guest',
      displayName: 'Ð“Ð¾ÑÑ‚ÑŒ',
      shortName: 'Guest',
      avatarGlyph: 'GS',
      rank: 'Ð“Ð¾ÑÑ‚ÐµÐ²Ð¾Ð¹ Ð´Ð¾ÑÑ‚ÑƒÐ¿',
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
      select.innerHTML = '<option value="">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÐµÐ¹</option>';
      $('#login-preview').innerHTML = '<div class="muted">Ð’ Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ð¾Ð¹ ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸ Ð¿Ð¾ÐºÐ° Ð½ÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶ÐµÐ¹. ÐœÐ¾Ð¶Ð½Ð¾ Ð²Ð¾Ð¹Ñ‚Ð¸ Ð³Ð¾ÑÑ‚ÐµÐ¼, ÐµÑÐ»Ð¸ Ð”Ðœ Ð¾Ñ‚ÐºÑ€Ñ‹Ð» Ð³Ð¾ÑÑ‚ÐµÐ²Ñ‹Ðµ Ð¼Ð°Ñ‚ÐµÑ€Ð¸Ð°Ð»Ñ‹.</div>';
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
      root.innerHTML = '<div class="muted">ÐÐµÑ‚ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð° Ð´Ð»Ñ Ð¿Ñ€ÐµÐ´Ð¿Ñ€Ð¾ÑÐ¼Ð¾Ñ‚Ñ€Ð°.</div>';
      return;
    }
    const planet = player.currentPlanetId ? App.data.planets.get(player.currentPlanetId) : null;
    root.innerHTML = `
      <div class="profile-hero">
        ${renderAvatar(player)}
        <div>
          <div><b>${esc(player.displayName || player.id)}</b></div>
          <div class="muted">${esc(player.rank || player.role || 'Ð˜Ð³Ñ€Ð¾Ðº')}</div>
          <div class="small-note" style="margin-top:6px">${planet ? `Ð¢ÐµÐºÑƒÑ‰Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°: ${esc(planet.name)}` : 'Ð¢ÐµÐºÑƒÑ‰Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð° Ð½Ðµ Ð·Ð°Ð´Ð°Ð½Ð°'} Â· ${formatCredits(player.credits || 0)}</div>
        </div>
      </div>
    `;
  }

  function entityActionsSystemButton(systemId) {
    if (!systemId) return '';
    return `<button class="secondary" type="button" data-action="open-system" data-system-id="${esc(systemId)}">ÐŸÐµÑ€ÐµÐ¹Ñ‚Ð¸ Ðº ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ</button>`;
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
      bg0: '#1c1912', bg1: '#0e0d0a', bg2: '#040403', stars: '#d2bb90', orbit: 'rgba(185,147,88,.18)'
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
      ctx.filter = medievalBackdrop ? 'sepia(.88) saturate(.48) brightness(.78) contrast(.92)' : String(document.documentElement?.dataset?.eraTheme || '') === 'technological' ? 'sepia(.78) saturate(.50) brightness(.66) contrast(1.10)' : 'none';
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
        ctx.fillText('ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… ÑÐ¸ÑÑ‚ÐµÐ¼', 28 * this.dpr, 42 * this.dpr);
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
        tip.innerHTML = `<b>${esc(planet?.name || planetPoint.id)}</b><span>ÐŸÐ»Ð°Ð½ÐµÑ‚Ð° Â· Ð½Ð°Ð¶Ð¼Ð¸Ñ‚Ðµ Ð´Ð»Ñ Ð´Ð°Ð½Ð½Ñ‹Ñ…</span>`;
      } else if (systemPoint) {
        const system = App.data.systems.find(item => item.id === systemPoint.id);
        tip.innerHTML = `<b>${esc(system?.name || systemPoint.id)}</b><span>Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð° Â· ${(system?.planetIds || []).length} Ð¿Ð»Ð°Ð½ÐµÑ‚</span>`;
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
        <div class="eyebrow">ÐŸÐ›ÐÐÐ•Ð¢Ð</div>
        <h2>${esc(planet.name || planet.id)}</h2>
        ${renderEntityThumb(planet, 'hero')}
        <div class="galaxy-inspector-grid">
          <div><span>Ð¢Ð¸Ð¿</span><b>${esc(planet.physics?.type || 'â€”')}</b></div>
          <div><span>ÐšÐ»Ð¸Ð¼Ð°Ñ‚</span><b>${esc(planet.physics?.climate || 'â€”')}</b></div>
          <div><span>ÐÐ°ÑÐµÐ»ÐµÐ½Ð¸Ðµ</span><b>${esc(planet.socio?.pop || 'â€”')}</b></div>
          <div><span>Ð¡Ñ‚Ð¾Ð»Ð¸Ñ†Ð°</span><b>${esc(planet.socio?.capital || 'â€”')}</b></div>
        </div>
        <p>${esc(stripHtml(planet.pilot?.reference || planet.pilot?.info || 'ÐÐµÑ‚ Ð¾Ñ‚ÐºÑ€Ñ‹Ñ‚Ð¾Ð¹ ÑÐ¿Ñ€Ð°Ð²ÐºÐ¸.'))}</p>
        <div class="button-row"><button class="primary" type="button" data-action="open-planet" data-planet-id="${esc(planet.id)}">ÐžÐ¢ÐšÐ Ð«Ð¢Ð¬ Ð”ÐžÐ¡Ð¬Ð•</button><button class="secondary" type="button" data-action="galaxy-system" data-system-id="${esc(system?.id || '')}">Ðš Ð¡Ð˜Ð¡Ð¢Ð•ÐœÐ•</button></div>`;
      return;
    }
    if (system) {
      const planets = WebGalaxyMap.visiblePlanets(system);
      root.innerHTML = `
        <div class="eyebrow">Ð¡Ð˜Ð¡Ð¢Ð•ÐœÐ</div>
        <h2>${esc(system.name || system.id)}</h2>
        <p class="muted">${esc(system.description || system.markerLabel || 'Ð”Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð°Ñ Ð·Ð²Ñ‘Ð·Ð´Ð½Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°.')}</p>
        <div class="galaxy-inspector-grid">
          <div><span>ÐŸÐ»Ð°Ð½ÐµÑ‚Ñ‹</span><b>${planets.length}</b></div>
          <div><span>ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚Ñ‹</span><b>${(system.routes || []).length}</b></div>
          <div><span>Ð¡Ñ‚Ð°Ñ‚ÑƒÑ</span><b>${current?.id === system.id ? 'Ð¢Ð•ÐšÐ£Ð©ÐÐ¯' : 'Ð”ÐžÐ¡Ð¢Ð£ÐŸÐÐ'}</b></div>
          <div><span>ÐŸÐµÑ€ÑÐ¾Ð½Ð°Ð¶</span><b>${esc(player?.shortName || player?.displayName || 'â€”')}</b></div>
        </div>
        <div class="galaxy-planet-list">${planets.map(item => `<button class="galaxy-planet-row" type="button" data-action="galaxy-planet" data-system-id="${esc(system.id)}" data-planet-id="${esc(item.id)}"><span class="galaxy-planet-dot" style="--planet:${esc(item.color || '#f0e68c')}"></span><b>${esc(item.name || item.id)}</b><span>${esc(item.physics?.type || '')}</span></button>`).join('') || '<div class="muted">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚Ñ‹Ñ… Ð¿Ð»Ð°Ð½ÐµÑ‚ Ð½ÐµÑ‚.</div>'}</div>`;
      return;
    }
    root.innerHTML = '<div class="eyebrow">ÐÐÐ’Ð˜Ð“ÐÐ¦Ð˜Ð¯</div><h2>Ð“Ð°Ð»Ð°ÐºÑ‚Ð¸Ñ‡ÐµÑÐºÐ°Ñ ÐºÐ°Ñ€Ñ‚Ð°</h2><p class="muted">Ð’Ñ‹Ð±ÐµÑ€Ð¸Ñ‚Ðµ ÑÐ¸ÑÑ‚ÐµÐ¼Ñƒ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ. ÐšÐ¾Ð»ÐµÑÐ¾ â€” Ð¼Ð°ÑÑˆÑ‚Ð°Ð±, Ð¿ÐµÑ€ÐµÑ‚Ð°ÑÐºÐ¸Ð²Ð°Ð½Ð¸Ðµ â€” Ð½Ð°Ð²Ð¸Ð³Ð°Ñ†Ð¸Ñ.</p>';
  }

  function renderGalaxyHome() {
    setTopbar('Ð“Ð°Ð»Ð°ÐºÑ‚Ð¸Ñ‡ÐµÑÐºÐ°Ñ ÐºÐ°Ñ€Ñ‚Ð°', 'Ð˜Ð½Ñ‚ÐµÑ€Ð°ÐºÑ‚Ð¸Ð²Ð½Ð°Ñ Ð½Ð°Ð²Ð¸Ð³Ð°Ñ†Ð¸Ñ Ð¿Ð¾ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ð¼ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°Ð¼ Ð¸ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°Ð¼');
    const root = $('#screen-home');
    root.innerHTML = `
      <div class="web-galaxy-layout">
        <section class="web-galaxy-stage" id="web-galaxy-stage">
          <canvas id="web-galaxy-canvas" aria-label="Ð“Ð°Ð»Ð°ÐºÑ‚Ð¸Ñ‡ÐµÑÐºÐ°Ñ ÐºÐ°Ñ€Ñ‚Ð°"></canvas>
          <div class="web-galaxy-controls">
            <button class="secondary hidden" id="web-galaxy-back" type="button" data-action="galaxy-back">â† Ð“ÐÐ›ÐÐšÐ¢Ð˜ÐšÐ</button>
            <button class="secondary" type="button" data-action="galaxy-center">âŒ¾ Ð¦Ð•ÐÐ¢Ð </button>
          </div>
          <div class="web-galaxy-hint">ÐŸÐ•Ð Ð•Ð¢ÐÐ¡ÐšÐ˜Ð’ÐÐÐ˜Ð• Â· ÐšÐÐœÐ•Ð Ð &nbsp; / &nbsp; ÐšÐžÐ›Ð•Ð¡Ðž Â· ÐœÐÐ¡Ð¨Ð¢ÐÐ‘ &nbsp; / &nbsp; Ð©Ð•Ð›Ð§ÐžÐš Â· ÐžÐ¢ÐšÐ Ð«Ð¢Ð¬</div>
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
    setTopbar('ÐÐ°Ð²Ð¸Ð³Ð°Ñ‚Ð¾Ñ€', 'Ð¡Ð¸ÑÑ‚ÐµÐ¼Ñ‹, Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹ Ð¸ Ð±Ñ‹ÑÑ‚Ñ€Ñ‹Ð¹ Ð´Ð¾ÑÑ‚ÑƒÐ¿ Ðº Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¼Ñƒ Ð¼Ð¸Ñ€Ñƒ Ð±ÐµÐ· Ñ‚ÑÐ¶Ñ‘Ð»Ð¾Ð¹ Ð³Ð°Ð»Ð°ÐºÑ‚Ð¸Ñ‡ÐµÑÐºÐ¾Ð¹ ÐºÐ°Ñ€Ñ‚Ñ‹');
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
            <div class="eyebrow">Ð¢ÐµÐºÑƒÑ‰Ð°Ñ Ð»Ð¾ÐºÐ°Ñ†Ð¸Ñ</div>
            <h2 class="hero-title">${esc(system?.name || 'Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð° Ð½Ðµ Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð°')}</h2>
            <p class="hero-subtitle">${planet ? `${esc(planet.name)} â€” Ñ‚ÐµÐºÑƒÑ‰Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð° Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°.` : 'Ð£ Ð¿Ñ€Ð¾Ñ„Ð¸Ð»Ñ ÐµÑ‰Ñ‘ Ð½Ðµ Ð·Ð°Ð´Ð°Ð½Ð° Ñ‚ÐµÐºÑƒÑ‰Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°. Ð¢Ð¾Ñ€Ð³Ð¾Ð²Ñ‹Ð¹ Ñ‚ÐµÑ€Ð¼Ð¸Ð½Ð°Ð» Ð±ÑƒÐ´ÐµÑ‚ Ð·Ð°Ð±Ð»Ð¾ÐºÐ¸Ñ€Ð¾Ð²Ð°Ð½, Ð¿Ð¾ÐºÐ° Ð¿Ð»Ð°Ð½ÐµÑ‚Ð° Ð½Ðµ Ð¿Ð¾ÑÐ²Ð¸Ñ‚ÑÑ Ð² Ð¿Ñ€Ð¾Ñ„Ð¸Ð»Ðµ.'}</p>
            <div class="chip-row">
              <div class="info-chip">ÐŸÐµÑ€ÑÐ¾Ð½Ð°Ð¶: ${esc(player?.displayName || 'â€”')}</div>
              <div class="info-chip">ÐšÑ€ÐµÐ´Ð¸Ñ‚Ñ‹: ${formatCredits(player?.credits || 0)}</div>
              <div class="info-chip">Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð°: ${esc(system?.name || 'â€”')}</div>
            </div>
          </div>
        </div>
        <div class="info-grid">
          <div class="info-card"><div class="k">Ð¢ÐµÐºÑƒÑ‰Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°</div><div class="v">${esc(planet?.name || 'ÐÐµ Ð·Ð°Ð´Ð°Ð½Ð°')}</div></div>
          <div class="info-card"><div class="k">ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚Ñ‹</div><div class="v">${focusSystem ? Number((focusSystem.routes || []).length) : 0}</div></div>
          <div class="info-card"><div class="k">Ð’Ð¸Ð´Ð¸Ð¼Ñ‹Ñ… ÑÐ¸ÑÑ‚ÐµÐ¼</div><div class="v">${visibleSystems.length}</div></div>
          <div class="info-card"><div class="k">ÐÐºÑ‚Ð¸Ð²Ð½Ñ‹Ð¹ Ñ‚ÐµÑ€Ð¼Ð¸Ð½Ð°Ð»</div><div class="v">${planet ? 'Ð”Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½ Ð½Ð° Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¹ Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ' : 'Ð—Ð°Ð±Ð»Ð¾ÐºÐ¸Ñ€Ð¾Ð²Ð°Ð½'}</div></div>
        </div>
      </div>
      <div class="section-head" style="margin-top:18px"><div class="section-title">Ð¡Ð¸ÑÑ‚ÐµÐ¼Ñ‹ ÑÐµÐºÑ‚Ð¾Ñ€Ð°</div></div>
      <div class="system-grid">
        ${visibleSystems.map(item => {
          const planets = (item.planetIds || []).map(id => App.data.planets.get(id)).filter(Boolean);
          const active = item.id === focusSystem?.id;
          return `
            <article class="entity-card ${active ? 'active' : ''}">
              <div class="eyebrow">Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð°</div>
              <h3>${esc(item.name || item.id)}</h3>
              <div class="entity-meta">ÐŸÐ»Ð°Ð½ÐµÑ‚: ${planets.length}. ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚Ð¾Ð²: ${(item.routes || []).length}. ${item.markerLabel ? `ÐœÐ°Ñ€ÐºÐµÑ€: ${esc(item.markerLabel)}.` : ''}</div>
              <div class="entity-actions">
                <button class="secondary" type="button" data-action="focus-system" data-system-id="${esc(item.id)}">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ</button>
                ${planets[0] ? `<button class="secondary" type="button" data-action="open-planet" data-planet-id="${esc(planets[0].id)}">ÐŸÐµÑ€Ð²Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°</button>` : ''}
              </div>
            </article>
          `;
        }).join('') || '<div class="placeholder">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… ÑÐ¸ÑÑ‚ÐµÐ¼.</div>'}
      </div>
      ${focusSystem ? `
        <div class="card" style="padding:16px; margin-top:18px;">
          <div class="section-head"><div class="section-title">${esc(focusSystem.name)}</div>${entityActionsSystemButton(focusSystem.id)}</div>
          <div class="small-note">${focusSystem.markerLabel ? esc(focusSystem.markerLabel) : 'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ ÑÐ¸ÑÑ‚ÐµÐ¼Ñ‹ Ð¼Ð¾Ð¶Ð½Ð¾ Ð¿Ñ€Ð¸Ð²ÑÐ·Ð°Ñ‚ÑŒ Ñ‡ÐµÑ€ÐµÐ· ÑÑ‚Ð°Ñ‚ÑŒÐ¸ Ð¸ ÑÐ²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹.'}</div>
          <div class="planet-grid" style="margin-top:14px;">
            ${focusPlanets.map(item => `
              <article class="planet-card ${item.id === planet?.id ? 'active' : ''}">
                <div class="eyebrow">ÐŸÐ»Ð°Ð½ÐµÑ‚Ð°</div>
                <h3>${esc(item.name)}</h3>
                <div class="entity-meta">${esc(item.location?.obj || item.location?.system || item.code || '')}</div>
                <div class="entity-actions">
                  <button class="secondary" type="button" data-action="open-planet" data-planet-id="${esc(item.id)}">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ ÐºÐ°Ñ€Ñ‚Ð¾Ñ‡ÐºÑƒ</button>
                </div>
              </article>
            `).join('') || '<div class="placeholder">Ð’ ÑÑ‚Ð¾Ð¹ ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ Ð½ÐµÑ‚ Ð¿Ð»Ð°Ð½ÐµÑ‚.</div>'}
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
    const tokens = normalizeArchiveSearchV1079(App.ui.archiveQuery || '').split(' ').filter(Boolean);
    const unfilteredBase = globalScope
      ? ['articles', 'planets', 'systems', 'equipment'].flatMap(section => collections[section] || [])
      : [...(collections[App.ui.archiveTab] || [])];
    const base = unfiltmxßom¢G§²ÚîÆ­y×•ÒÇÂ¶W—Ò(šRG¶æVVGÖ“°¢Ò“°¢6¶–ÆÄ–D'&’‡6¶–ÆÂç&WV—&VE6¶–ÆÄ–G2ÇÂ6¶–ÆÂç&WV—&VE6¶–ÆÇ2’æf÷$V6‚‡&W–BÓâ°¢6öç7B&W6¶–ÆÂÒæFFç6¶–ÆÇ2ævWB‡&W–B“°¢–b‡&W6¶–ÆÂbb—57V6–Æ—¦F–öâ‡&W6¶–ÆÂ’’°¢–b„çVÖ&W"‡Æ–W"ç7V6–Æ—¦F–öç3òå·&W–EÒÇÂ’ÃÒ’&V6öç2çW6‚‡&W6¶–ÆÂææÖRÇÂ&W–B“°¢ÒVÇ6R–b‚6¶–ÆÄ–D'&’‡Æ–W"ç6¶–ÆÇ2’æ–æ6ÇVFW2‡&W–B’’&V6öç2çW6‚‡&W6¶–ÆÃòææÖRÇÂ&W–B“°¢Ò“°¢&WGW&â&V6öç3°¢Ð ¢gVæ7F–öâÇ•6¶–ÆÅ7V6–Æ—¦F–öä–æ7&V6W2‡fÇVW2Ò·ÒÂ6¶–ÆÂÒ·Ò’°¢6öç7BæW‡BÒ²âââ‡fÇVW2ÇÂ·Ò’Ó°¢6¶–ÆÄ–D'&’‡6¶–ÆÂç7V6–Æ—¦F–öä–æ7&V6W2ÇÂ6¶–ÆÂæ–æ7&V6U7V6–Æ—¦F–öä–G2ÇÂµÒ’æf÷$V6‚†–BÓâ°¢æW‡E¶–EÒÒçVÖ&W"†æW‡E¶–EÒÇÂ’²°¢Ò“°¢&WGW&âæW‡C°¢Ð ¢7–æ2gVæ7F–öâWw&FU6¶–ÆÂ‡6¶–ÆÄ–B’°¢6öç7B6¶–ÆÂÒæFFç6¶–ÆÇ2ævWB‡6¶–ÆÄ–B“°¢–b‚6¶–ÆÂ’&WGW&âæ÷F–g’‚}	Ý-½¢ÝRÝM]ÒrÂvW'"r“°¢6öç7BÆ–W"Ò7W'&VçEÆ–W"‚“°¢–b†—4wVW7E6W76–öâ‚’’&WGW&âæ÷F–g’‚}	=í-ÂÝRÍím]"Í]Ýý-ÂýíM½ÂrÂwv&âr“°¢–b‡Æ–W$÷vç56¶–ÆÂ‡Æ–W"Ç6¶–ÆÂ’—&WGW&âæ÷F–g’‚}	Ý-½¢=mR}=}]ÒrÂv–æfòr“°¢6öç7B&V6öç2Ò6¶–ÆÅ&WV—&VÖVçE&V6öç2‡Æ–W"Â6¶–ÆÂ“°¢–b‡&V6öç2æÆVæwF‚’&WGW&âæ÷F–g’†
-]í-ÝòÝR-½ýí½Ý]Ý³¢G·&V6öç2æ¦ö–â‚rÂr—ÖÂwv&âr“°¢6öç7B6÷7BÒÖF‚æÖ‚ƒÂçVÖ&W"‡6¶–ÆÂæ6÷7Bóò’“°¢–b‚6öæf—&Ò†	-²=-]]Ý²}-â]í--R-}ý-Â*²G·6¶–ÆÂææÖRÇÂ6¶–ÆÂæ–GÜ+²}G¶6÷7GÒí}¢ãö’’&WGW&ã°¢v—B6öÖÖ—EÆ–W$×WFF–öâ†æW‡BÓâ°¢–b‡Æ–W$÷vç56¶–ÆÂ†æW‡BÇ6¶–ÆÂ’—F‡&÷ræWrW'&÷"‚}	Ý-½¢=mR}=}]Òr“°¢6öç7B&V6öç3×6¶–ÆÅ&WV—&VÖVçE&V6öç2†æW‡BÇ6¶–ÆÂ“°¢–b‡&V6öç2æÆVæwF‚—F‡&÷ræWrW'&÷"‡&V6öç2æ¦ö–â‚rÂr’“°¢æW‡Bç6¶–ÆÅö–çG2ÒÖF‚æÖ‚ƒÂçVÖ&W"†æW‡Bç6¶–ÆÅö–çG2ÇÂ’Ò6÷7B“°¢æW‡Bç6¶–ÆÇ2Ò6¶–ÆÄ–D'&’†æW‡Bç6¶–ÆÇ2“°¢æW‡Bç7V6–Æ—¦F–öç2Ò²âââ†æW‡Bç7V6–Æ—¦F–öç2ÇÂ·Ò’Ó°¢–b†—57V6–Æ—¦F–öâ‡6¶–ÆÂ’’æW‡Bç7V6–Æ—¦F–öç5·6¶–ÆÂæ–EÒÒÖF‚æÖ‚ƒÂçVÖ&W"†æW‡Bç7V6–Æ—¦F–öç5·6¶–ÆÂæ–EÒÇÂ’²“°¢VÇ6R–b‚æW‡Bç6¶–ÆÇ2æ–æ6ÇVFW2‡6¶–ÆÂæ–B’’æW‡Bç6¶–ÆÇ2çW6‚‡6¶–ÆÂæ–B“°¢æW‡Bç7V6–Æ—¦F–öç2ÒÇ•6¶–ÆÅ7V6–Æ—¦F–öä–æ7&V6W2†æW‡Bç7V6–Æ—¦F–öç2Â6¶–ÆÂ“°¢ÒÂ}	Ý-½¢íÝí-½Òr“°¢Ð ¢ò¢vV"6¶–ÆÂG&VR(	BÖ—'&÷'2F†RFW6·F÷w2F–G’G&VS¢&–Æ—G’&ö÷G2öâ&÷rÀ¢6ö×7B6¶–ÆÂæöFW2Â6öÆ–B&–Ö'’VFvW2öæÇ’âæöFR÷6—F–öç26öÖRg&öÒF†P¢6¶–ÆÂw2W'6—7FVBG&VU÷2†6öÖÖ—GFVB'’F†Rw2		-
-	âÝ
	í

-	
	í	-	­	’v†Và¢&W6VçC²÷F†W'v—6RF†R6ÖRF–G’Öf÷&W7BÆ–÷WB—26ö×WFVBÆö6ÆÇ’â¢ð¢6öç7B$”Ä•E•ôÔôDTÅõtT"Ò°¢²¶W“¢w7G&VæwF‚rÂÆ&VÃ¢}
½rÂ6†÷'C¢}
		²rÒÀ¢²¶W“¢vFW‡FW&—G’rÂÆ&VÃ¢}	½í-­í-ÂrÂ6†÷'C¢}	½	í	"rÒÀ¢²¶W“¢v–çFVÆÆ–vVæ6RrÂÆ&VÃ¢}	Ý-]½½]­"rÂ6†÷'C¢}		Ý
"rÒÀ¢²¶W“¢vVæGW&æ6RrÂÆ&VÃ¢}	-½Ýí½-í-ÂrÂ6†÷'C¢}	-
½	ÒrÒÀ¢²¶W“¢wv–ÆÂrÂÆ&VÃ¢}	-í½òrÂ6†÷'C¢}	-	í	²rÒÀ¢²¶W“¢vvÆ÷'’rÂÆ&VÃ¢}
½-rÂ6†÷'C¢}
	½	rÐ¢Ó°¢6öç7B$”Ä•E•ôÔ…õtT"ÒS°¢6öç7BE$TUôäôDUõrÒcBÂE$TUô$”Ä•E•õrÒsÂE$TUõ4´”ÄÅô‚ÒƒBÂE$TUô$”Ä•E•ô‚Òƒƒ°¢6öç7BE$TUõ…ôtÒC"ÂE$TUõ$õuôtÒ#‚ÂE$TUõEõ‚Ò3BÂE$TUõEõDõÒƒ° ¢gVæ7F–öâ6Æ×vV%6¶–ÆÅ¦ööÒ‡fÇVR’°¢&WGW&âÖF‚æÖ–âƒ"ãBÂÖF‚æÖ‚ƒãCRÂçVÖ&W"‡fÇVRÇÂ’ÇÂ’“°¢Ð ¢gVæ7F–öâ6¶–ÆÅG&VU÷5vV"‡6¶–ÆÂ’°¢6öç7B&rÒ6¶–ÆÃòçG&VU÷2ÇÂ6¶–ÆÃòæÆ–÷WBÇÂ6¶–ÆÃòç÷6—F–öâÇÂ6¶–ÆÃòç÷3°¢6öç7B‚ÒçVÖ&W"‡&sòç‚“°¢6öç7B’ÒçVÖ&W"‡&sòç’“°¢–b‚çVÖ&W"æ—4f–æ—FR‡‚’ÇÂçVÖ&W"æ—4f–æ—FR‡’’’&WGW&âçVÆÃ°¢&WGW&â²ƒ¢ÖF‚æÖ‚ƒÂÖF‚ç&÷VæB‡‚’’Â“¢ÖF‚æÖ‚ƒÂÖF‚ç&÷VæB‡’’’Ó°¢Ð ¢gVæ7F–öâ6¶–ÆÄfÆÆ&6´&–Æ—G•vV"‡6¶–ÆÂ’°¢6öç7B2Ò7G&–ær‡6¶–ÆÂæ6FVv÷'’ÇÂ6¶–ÆÂæ–BÇÂrr“°¢ÆWB‚Ò°¢f÷"†ÆWB’Ò²’Â2æÆVæwFƒ²’³Ò’‚Ò†‚¢3²2æ6†$6öFTB†’’’ããâ°¢&WGW&â$”Ä•E•ôÔôDTÅõtT%¶‚RUÒæ¶W“²òòæWfW"vÆ÷'’2fÆÆ&6²&ö÷@¢Ð ¢gVæ7F–öâ'V–ÆEvV%6¶–ÆÅG&VTÆ–÷WB‡Æ–W"’°¢6öç7B6¶–ÆÇ2Òf—6–&ÆU6¶–ÆÇ2‚“°¢6öç7B'”–BÒæWrÖ‡6¶–ÆÇ2æÖ‡2Óâµ7G&–ær‡2æ–B’Â5Ò’“°¢6öç7B&VçDöbÒæWrÖ‚“°¢6¶–ÆÇ2æf÷$V6‚‡6¶–ÆÂÓâ°¢6öç7B–BÒ7G&–ær‡6¶–ÆÂæ–B“°¢ÆWB&VçBÒrs°¢f÷"†6öç7B&W–Böb6¶–ÆÄ–D'&’‡6¶–ÆÂç&WV—&VE6¶–ÆÄ–G2ÇÂ6¶–ÆÂç&WV—&VE6¶–ÆÇ2’’°¢–b‡&W–BÓÒ–Bbb'”–Bæ†2‡&W–B’’²&VçBÒ6¶–ÆÃ¢G·&W–GÖ²'&V³²Ð¢Ð¢–b‚&VçB’°¢6öç7B&W"Ò„'&’æ—4'&’‡6¶–ÆÂç&WV—&VD&–Æ—F–W2’ò6¶–ÆÂç&WV—&VD&–Æ—F–W2¢µÒ’æf–æB‡&WÓâ$”Ä•E•ôÄ$TÅ5µ7G&–ær‡&Wæ¶W’ÇÂrr’çG&–Ò‚•Ò“°¢&VçBÒ&–Æ—G“¢G·&W"ò7G&–ær‡&W"æ¶W’’çG&–Ò‚’¢6¶–ÆÄfÆÆ&6´&–Æ—G•vV"‡6¶–ÆÂ—Ö°¢Ð¢&VçDöbç6WB†–BÂ&VçB“°¢Ò“°¢òò'&V²FWVæFVæ7’7–6ÆW3¢&W&÷WFRFòfÆÆ&6²&–Æ—G’&ö÷@¢6¶–ÆÇ2æf÷$V6‚‡6¶–ÆÂÓâ°¢6öç7B–BÒ7G&–ær‡6¶–ÆÂæ–B“°¢6öç7B6VVâÒæWr6WB…¶–EÒ“°¢ÆWB7W'6÷"Ò&VçDöbævWB†–B“°¢v†–ÆR†7W'6÷"bb7W'6÷"ç7F'G5v—F‚‚w6¶–ÆÃ¢r’’°¢6öç7B–BÒ7W'6÷"ç6Æ–6Rƒb“°¢–b‡6VVâæ†2‡–B’’²&VçDöbç6WB†–BÂ&–Æ—G“¢G·6¶–ÆÄfÆÆ&6´&–Æ—G•vV"‡6¶–ÆÂ—Ö“²'&V³²Ð¢6VVâæFB‡–B“°¢7W'6÷"Ò&VçDöbævWB‡–B“°¢Ð¢Ò“°¢6öç7B&÷tÖVÖòÒæWrÖ‚“°¢6öç7B&÷töbÒ–BÓâ°¢–b‡&÷tÖVÖòæ†2†–B’’&WGW&â&÷tÖVÖòævWB†–B“°¢&÷tÖVÖòç6WB†–BÂ“°¢6öç7B&VçBÒ&VçDöbævWB†–B’ÇÂrs°¢6öç7B&÷rÒ&VçBç7F'G5v—F‚‚w6¶–ÆÃ¢r’ò&÷töb‡&VçBç6Æ–6Rƒb’’²¢°¢&÷tÖVÖòç6WB†–BÂ&÷r“°¢&WGW&â&÷s°¢Ó°¢6öç7B6†–ÆG&VâÒæWrÖ‚“°¢6¶–ÆÇ2æf÷$V6‚‡6¶–ÆÂÓâ°¢6öç7B&VçBÒ&VçDöbævWB…7G&–ær‡6¶–ÆÂæ–B’“°¢–b‚6†–ÆG&Vâæ†2‡&VçB’’6†–ÆG&Vâç6WB‡&VçBÂµÒ“°¢6†–ÆG&VâævWB‡&VçB’çW6‚†6¶–ÆÃ¢G·6¶–ÆÂæ–GÖ“°¢Ò“°¢f÷"†6öç7BÆ—7Böb6†–ÆG&VâçfÇVW2‚’’°¢Æ—7Bç6÷'B‚†Â"’Óâ°¢6öç7B2Ò'”–BævWB†ç6Æ–6Rƒb’’ÇÂ·ÒÂ'2Ò'”–BævWB†"ç6Æ–6Rƒb’’ÇÂ·Ó°¢&WGW&â7G&–ær†2æ6FVv÷'’ÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†'2æ6FVv÷'’ÇÂrr’Âw'Rr¢ÇÂ7G&–ær†2ææÖRÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†'2ææÖRÇÂrr’Âw'Rr¢ÇÂ7G&–ær†2æ–BÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†'2æ–BÇÂrr’Âw'Rr“°¢Ò“°¢Ð¢6öç7B6öÂÒæWrÖ‚“°¢ÆWBæW‡D6öÂÒ°¢6öç7B76–vä6öÇ2Ò†æöFT–BÂ7F6²ÒæWr6WB‚’’Óâ°¢–b†6öÂæ†2†æöFT–B’’&WGW&â6öÂævWB†æöFT–B“°¢–b‡7F6²æ†2†æöFT–B’’²6öç7B2ÒæW‡D6öÃ²æW‡D6öÂ³Ò²6öÂç6WB†æöFT–BÂ2“²&WGW&â3²Ð¢7F6²æFB†æöFT–B“°¢6öç7B¶–G2Ò6†–ÆG&VâævWB†æöFT–B’ÇÂµÓ°¢ÆWB3°¢–b‚¶–G2æÆVæwF‚’²2ÒæW‡D6öÃ²æW‡D6öÂ³Ò²Ð¢VÇ6R°¢6öç7B¶–D6öÇ2Ò¶–G2æÖ†¶–BÓâ76–vä6öÇ2†¶–BÂ7F6²’“°¢2Ò†¶–D6öÇ5³Ò²¶–D6öÇ5¶¶–D6öÇ2æÆVæwF‚ÒÒ’ò#°¢Ð¢7F6²æFVÆWFR†æöFT–B“°¢6öÂç6WB†æöFT–BÂ2“°¢&WGW&â3°¢Ó°¢$”Ä•E•ôÔôDTÅõtT"æf÷$V6‚†—FVÒÓâ²76–vä6öÇ2†&–Æ—G“¢G¶—FVÒæ¶W—Ö“²æW‡D6öÂ³Ò²Ò“°¢6¶–ÆÇ2æf÷$V6‚‡6¶–ÆÂÓâ²6öç7BæöFT–BÒ6¶–ÆÃ¢G·6¶–ÆÂæ–GÖ²–b‚6öÂæ†2†æöFT–B’’76–vä6öÇ2†æöFT–B“²Ò“°¢6öç7B÷6—F–öç2ÒæWrÖ‚“°¢6öç7B4ôÅõ5DUÒE$TUôäôDUõr²E$TUõ…ôt°¢6öÂæf÷$V6‚‚†2ÂæöFT–B’Óâ°¢6öç7B&–Æ—G’ÒæöFT–Bç7F'G5v—F‚‚v&–Æ—G“¢r“°¢6öç7BrÒ&–Æ—G’òE$TUô$”Ä•E•õr¢E$TUôäôDUõs°¢6öç7B‚Ò&–Æ—G’òE$TUô$”Ä•E•ô‚¢E$TUõ4´”ÄÅôƒ°¢6öç7B&÷rÒ&–Æ—G’ò¢&÷töb†æöFT–Bç6Æ–6Rƒb’“°¢÷6—F–öç2ç6WB†æöFT–BÂ²ƒ¢ÖF‚ç&÷VæB…E$TUõEõ‚²2¢4ôÅõ5DU²E$TUôäôDUõrò"Òrò"’Â“¢E$TUõEõDõ²&÷r¢E$TUõ$õuôtÂrÂ‚Ò“°¢Ò“°¢òòW'6—7FVB÷6—F–öç2g&öÒF†RFW6·F÷v–âæB&R–Ö×WF&ÆR†W&S ¢òòF†RvV"×W7B6†÷rW†7FÇ’F†RÆ–÷WBF†RtÒ6WB–âF†R ¢6¶–ÆÇ2æf÷$V6‚‡6¶–ÆÂÓâ°¢6öç7BÖçVÂÒ6¶–ÆÅG&VU÷5vV"‡6¶–ÆÂ“°¢–b‚ÖçVÂ’&WGW&ã°¢6öç7BæöFT–BÒ6¶–ÆÃ¢G·6¶–ÆÂæ–GÖ°¢6öç7B7W'&VçBÒ÷6—F–öç2ævWB†æöFT–B’ÇÂ²s¢E$TUôäôDUõrÂƒ¢E$TUõ4´”ÄÅô‚Ó°¢÷6—F–öç2ç6WB†æöFT–BÂ²ââæ7W'&VçBÂƒ¢ÖçVÂç‚Â“¢ÖçVÂç’ÂÖçVÃ¢G'VRÒ“°¢Ò“°¢òòFRÖ÷fW&Æ7vVW¢Æö6ÆÇ’6ö×WFVBfÆÆ&6²÷6—F–öç26â6öÆÆ–FRv—F‚F†P¢òòFW6·F÷G&VU÷2Æ–÷WBâöæÇ’WFò×÷6—F–öæVBæöFW2&RÖ÷fVB(	BæöFW2v—F€¢òò×6WB÷6—F–öç2æWfW"6†–gBà¢°¢6öç7BæöFW2Ò'&’æg&öÒ‡÷6—F–öç2æVçG&–W2‚’’æf–ÇFW"‚…¶–EÒ’Óâ–Bç7F'G5v—F‚‚w6¶–ÆÃ¢r’’æÖ‚…²ÂÒ’Óâ“°¢f÷"†ÆWB72Ò²72Âc²72³Ò’°¢æöFW2ç6÷'B‚†Â"’Óâç‚Ò"ç‚ÇÂç’Ò"ç’“°¢ÆWBÖ÷fVBÒfÇ6S°¢f÷"†ÆWB’Ò²’ÂæöFW2æÆVæwFƒ²’³Ò’°¢f÷"†ÆWB¢Ò’²²¢ÂæöFW2æÆVæwFƒ²¢³Ò’°¢6öç7BÒæöFW5¶•ÒÂ"ÒæöFW5¶¥Ó°¢6öç7B÷fW%’Ò"ç’Âç’²æ‚Òbbbç’Â"ç’²"æ‚Òc°¢6öç7B÷fW%‚Ò"ç‚Âç‚²çr²bbç‚Â"ç‚²"çr²°¢–b‚÷fW%’ÇÂ÷fW%‚’6öçF–çVS°¢–b‚"æÖçVÂ’²"ç‚Òç‚²çr²C²Ö÷fVBÒG'VS²Ð¢VÇ6R–b‚æÖçVÂ’²ç‚Ò"ç‚²"çr²C²Ö÷fVBÒG'VS²Ð¢òò&÷F‚ÖçVÃ¢tÒw2Æ–÷WB—2&W6W'fVB2Ö—0¢Ð¢Ð¢–b‚Ö÷fVB’'&V³°¢Ð¢Ð¢òò6VçG&R&–Æ—G’†VFW'2÷fW"F†V—"7GVÂ'&æ6€¢$”Ä•E•ôÔôDTÅõtT"æf÷$V6‚†—FVÒÓâ°¢6öç7B&–Æ—G”–BÒ&–Æ—G“¢G¶—FVÒæ¶W—Ö°¢6öç7B6VçFW'2Ò†6†–ÆG&VâævWB†&–Æ—G”–B’ÇÂµÒ’æÖ†¶–BÓâ²6öç7BÒ÷6—F–öç2ævWB†¶–B“²&WGW&âòç‚²çrò"¢çVÆÃ²Ò’æf–ÇFW"‡bÓâbÒçVÆÂ“°¢–b‚6VçFW'2æÆVæwF‚’&WGW&ã°¢6öç7BÖ–BÒ„ÖF‚æÖ–â‚ââæ6VçFW'2’²ÖF‚æÖ‚‚ââæ6VçFW'2’’ò#°¢6öç7B7W'&VçBÒ÷6—F–öç2ævWB†&–Æ—G”–B“°¢–b†7W'&VçB’÷6—F–öç2ç6WB†&–Æ—G”–BÂ²ââæ7W'&VçBÂƒ¢ÖF‚ç&÷VæB†Ö–BÒ7W'&VçBçrò"’Ò“°¢Ò“°¢òò&–Æ—G’†VFW'2×W7BæWfW"÷fW&ÆV6‚÷F†W#¢'&æ6†W2Æ–B÷WBv—F‚F†P¢òòFW6·F÷G&VU÷26â–çFW&ÆVfR†÷&—¦öçFÆÇ’Â6òGvò†VFW'2Ö’&RÖ6VçG&P¢òòöçFòÆÖ÷7BF†R6ÖR‚â7vVW&÷rÆVgB×Fò×&–v‡BVæf÷&6–ærÖ–æ–×VÒvà¢°¢6öç7B†VG2Ò$”Ä•E•ôÔôDTÅõtT"æÖ†—FVÒÓâ÷6—F–öç2ævWB†&–Æ—G“¢G¶—FVÒæ¶W—Ö’’æf–ÇFW"„&ööÆVâ’ç6÷'B‚†Â"’Óâç‚Ò"ç‚“°¢f÷"†ÆWB’Ò²’Â†VG2æÆVæwFƒ²’³Ò’°¢6öç7B&WbÒ†VG5¶’ÒÓ°¢6öç7B†VBÒ†VG5¶•Ó°¢–b††VBç‚Â&Wbç‚²&Wbçr²#B’†VBç‚Ò&Wbç‚²&Wbçr²#C°¢Ð¢Ð¢6öç7BVFvW2Ò6¶–ÆÇ2æÖ‡6¶–ÆÂÓâ‡²g&öÓ¢&VçDöbævWB…7G&–ær‡6¶–ÆÂæ–B’’ÂFó¢6¶–ÆÃ¢G·6¶–ÆÂæ–GÖÒ’“°¢6öç7BÆÂÒ'&’æg&öÒ‡÷6—F–öç2çfÇVW2‚’“°¢6öç7B6çf5rÒÖF‚æÖ‚ƒ“#ÂââæÆÂæÖ‡Óâç‚²çr’’²E$TUõEõƒ°¢6öç7B6çf4‚ÒÖF‚æÖ‚ƒC#ÂââæÆÂæÖ‡Óâç’²æ‚’’²c°¢&WGW&â²6¶–ÆÇ2Â÷6—F–öç2ÂVFvW2Â6çf5rÂ6çf4‚Ó°¢Ð ¢gVæ7F–öâvV%6¶–ÆÄæöFTÖ&·W‡Æ–W"Â6¶–ÆÂÂÆ–÷WB’°¢6öç7B÷2ÒÆ–÷WBç÷6—F–öç2ævWB†6¶–ÆÃ¢G·6¶–ÆÂæ–GÖ“°¢–b‚÷2’&WGW&ârs°¢6öç7B÷væVBÒÆ–W$÷vç56¶–ÆÂ‡Æ–W"Â6¶–ÆÂ“°¢6öç7B&V6öç2Ò÷væVBòµÒ¢6¶–ÆÅ&WV—&VÖVçE&V6öç2‡Æ–W"Â6¶–ÆÂ“°¢6öç7B7FFRÒ÷væVBòv÷væVBr¢&V6öç2æÆVæwF‚òvÆö6¶VBr¢vf–Æ&ÆRs°¢6öç7B7V2Ò—57V6–Æ—¦F–öâ‡6¶–ÆÂ“°¢6öç7B7V5fÇVRÒ7V2òçVÖ&W"‡Æ–W"ç7V6–Æ—¦F–öç3òå·6¶–ÆÂæ–EÒÇÂ’¢°¢6öç7B–ÖvRÒÖVF–g&öÔVçF—G’‡6¶–ÆÂ“°¢6öç7BF‡VÖ"Ò–ÖvRòÇ7â6Æ73Ò'vV"×6¶–ÆÂ×F‡VÖ"#ãÆ–Ör7&3Ò"G¶W62†–ÖvR—Ò"ÇCÒ""óãÂ÷7ãæ¢Ç7â6Æ73Ò'vV"×6¶–ÆÂ×F‡VÖ"#âG¶W62†–æ—F–Ç2‡6¶–ÆÂææÖRÇÂ6¶–ÆÂæ–B’—ÓÂ÷7ãæ°¢6öç7B7F–öâÒ÷væVBbb&V6öç2æÆVæwF‚bb—4wVW7E6W76–öâ‚¢òÆ'WGFöâ6Æ73Ò'vV"×6¶–ÆÂÖÆV&â"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'Ww&FR×6¶–ÆÂ"FF×6¶–ÆÂÖ–CÒ"G¶W62‡6¶–ÆÂæ–B—Ò#í	ý
	í	­	
}	
-
ÃÂö'WGFöãæ ¢¢Ç7â6Æ73Ò'vV"×6¶–ÆÂ×7FFR#âG¶÷væVBò‡7V2ò
=
âG·7V5fÇVWÖ¢}		}
=
}	]	Ý	âr’¢}	}		­

½
-	âwÓÂ÷7ãæ°¢&WGW&âÆF—b6Æ73Ò'vV"×6¶–ÆÂÖæöFRG·7FFWÒG·7V2òw7V2r¢rwÒ"FF×6¶–ÆÂÖæöFSÒ"G¶W62‡6¶–ÆÂæ–B—Ò"7G–ÆSÒ&ÆVgC¢G·÷2ç‡×ƒ·F÷¢G·÷2ç—×ƒ·v–GFƒ¢G·÷2çw×ƒ²#à¢G·F‡VÖ'Ð¢Ç7â6Æ73Ò'vV"×6¶–ÆÂÖÖ–â#ãÆ#âG¶W62‡6¶–ÆÂææÖRÇÂ6¶–ÆÂæ–B—ÓÂö#âG·7V2òsÆ“íý]m½}móÂö“âr¢rwÒG¶7F–öçÓÂ÷7ãà¢ÂöF—cæ°¢Ð ¢gVæ7F–öâvV$&–Æ—G”æöFTÖ&·W‡Æ–W"Â—FVÒÂÆ–÷WB’°¢6öç7B÷2ÒÆ–÷WBç÷6—F–öç2ævWB†&–Æ—G“¢G¶—FVÒæ¶W—Ö“°¢–b‚÷2’&WGW&ârs°¢6öç7BfÇVRÒçVÖ&W"‡Æ–W"æ&–Æ—F–W3òå¶—FVÒæ¶W•ÒÇÂ“°¢6öç7Bö–çG2ÒçVÖ&W"‡Æ–W"ç6¶–ÆÅö–çG2ÇÂ“°¢6öç7B—4vÆ÷'’Ò—FVÒæ¶W’ÓÓÒvvÆ÷'’s°¢6öç7B6å&—6RÒ—4vÆ÷'’bbfÇVRÂ$”Ä•E•ôÔ…õtT"bbö–çG2âbb—4wVW7E6W76–öâ‚“°¢6öç7B'WGFöâÒ6å&—6P¢òÆ'WGFöâ6Æ73Ò'vV"×6¶–ÆÂÖÆV&â"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'Ww&FRÖ&–Æ—G’"FFÖ&–Æ—G’Ö¶W“Ò"G¶W62†—FVÒæ¶W’—Ò#â³Âö'WGFöãæ ¢¢Ç7â6Æ73Ò'vV"×6¶–ÆÂ×7FFR#âG¶—4vÆ÷'’ò}	M	Âr¢fÇVRãÒ$”Ä•E•ôÔ…õtT"ò}	Í		­
r¢}	Ý	]
"	í
}	­	í	"wÓÂ÷7ãæ°¢&WGW&âÆF—b6Æ73Ò'vV"×6¶–ÆÂÖæöFRvV"Ö&–Æ—G’ÖæöFR"7G–ÆSÒ&ÆVgC¢G·÷2ç‡×ƒ·F÷¢G·÷2ç—×ƒ·v–GFƒ¢G·÷2çw×ƒ²#à¢Ç7â6Æ73Ò'vV"×6¶–ÆÂ×F‡VÖ"&–Æ—G’#âG¶W62†—FVÒç6†÷'B—ÓÂ÷7ãà¢Ç7â6Æ73Ò'vV"×6¶–ÆÂÖÖ–â#ãÆ#âG¶W62†—FVÒæÆ&VÂ—ÓÂö#ãÆ“âG·fÇVWÒòG´$”Ä•E•ôÔ…õtT'ÓÂö“âG¶'WGFöçÓÂ÷7ãà¢ÂöF—cæ°¢Ð ¢gVæ7F–öâ&VæFW%vV%6¶–ÆÅG&VR‡Æ–W"’°¢6öç7BÆ–÷WBÒ'V–ÆEvV%6¶–ÆÅG&VTÆ–÷WB‡Æ–W"“°¢6öç7B¦ööÒÒ6Æ×vV%6¶–ÆÅ¦ööÒ„çV’ç6¶–ÆÅ¦ööÒ“°¢6öç7BVFvW2ÒÆ–÷WBæVFvW2æÖ†VFvRÓâ°¢6öç7Bg&öÒÒÆ–÷WBç÷6—F–öç2ævWB†VFvRæg&öÒ“°¢6öç7BFòÒÆ–÷WBç÷6—F–öç2ævWB†VFvRçFò“°¢–b‚g&öÒÇÂFò’&WGW&ârs°¢6öç7B¶–æBÒ7G&–ær†VFvRæg&öÒÇÂrr’ç7F'G5v—F‚‚v&–Æ—G“¢r’òv&–Æ—G’r¢w&–Ö'’s°¢&WGW&âÆÆ–æR6Æ73Ò'vV"×6¶–ÆÂÖVFvRG¶¶–æGÒ"ƒÒ"G²†g&öÒç‚²g&öÒçrò"’çFôf—†VBƒ—Ò"“Ò"G²†g&öÒç’²g&öÒæ‚’çFôf—†VBƒ—Ò"ƒ#Ò"G²‡Fòç‚²Fòçrò"’çFôf—†VBƒ—Ò"“#Ò"G·Fòç’çFôf—†VBƒ—Ò"óæ°¢Ò’æ¦ö–â‚rr“°¢&WGW&âÆF—b6Æ73Ò'vV"×6¶–ÆÂ×FööÆ&"#à¢ÆF—b6Æ73Ò'–ÆÂ#í	í}­‚=½=}]Ýó¢G´çVÖ&W"‡Æ–W"ç6¶–ÆÅö–çG2ÇÂ—ÓÂöF—cà¢ÆF—b6Æ73Ò'vV"×6¶–ÆÂ×¦ööÒ#à¢Æ'WGFöâ6Æ73Ò&v†÷7BÖ'FâÖ–æ’Ö'Fâ"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'6¶–ÆÂ×¦ööÒ"FF×¦ööÓÒ&÷WB#î(‰#Âö'WGFöãà¢Ç7â6Æ73Ò'–ÆÂ#âG´ÖF‚ç&÷VæB‡¦ööÒ¢—ÒSÂ÷7ãà¢Æ'WGFöâ6Æ73Ò&v†÷7BÖ'FâÖ–æ’Ö'Fâ"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'6¶–ÆÂ×¦ööÒ"FF×¦ööÓÒ&–â#îûÈ³Âö'WGFöãà¢Æ'WGFöâ6Æ73Ò&v†÷7BÖ'FâÖ–æ’Ö'Fâ"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'6¶–ÆÂ×¦ööÒ"FF×¦ööÓÒ'&W6WB#ãSÂö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò'vV"×6¶–ÆÂ×G&VR×67&öÆÂ#à¢ÆF—b6Æ73Ò'vV"×6¶–ÆÂ×G&VRÖ6çf2"7G–ÆSÒ'v–GFƒ¢G´ÖF‚ç&÷VæB†Æ–÷WBæ6çf5r¢¦ööÒ—×ƒ¶†V–v‡C¢G´ÖF‚ç&÷VæB†Æ–÷WBæ6çf4‚¢¦ööÒ—×ƒ²#à¢ÆF—b6Æ73Ò'vV"×6¶–ÆÂ×G&VRÖ–ææW""7G–ÆSÒ'v–GFƒ¢G¶Æ–÷WBæ6çf5w×ƒ¶†V–v‡C¢G¶Æ–÷WBæ6çf4‡×ƒ·G&ç6f÷&Ó§66ÆR‚G·¦ööÒçFôf—†VBƒ2—Ò“²#à¢Ç7fr6Æ73Ò'vV"×6¶–ÆÂÖÆ–æW2"v–GFƒÒ"G¶Æ–÷WBæ6çf5wÒ"†V–v‡CÒ"G¶Æ–÷WBæ6çf4‡Ò"f–Wt&÷ƒÒ#G¶Æ–÷WBæ6çf5wÒG¶Æ–÷WBæ6çf4‡Ò"&–Ö†–FFVãÒ'G'VR#âG¶VFvW7ÓÂ÷7fsà¢G´$”Ä•E•ôÔôDTÅõtT"æÖ†—FVÒÓâvV$&–Æ—G”æöFTÖ&·W‡Æ–W"Â—FVÒÂÆ–÷WB’’æ¦ö–â‚rr—Ð¢G¶Æ–÷WBç6¶–ÆÇ2æÖ‡6¶–ÆÂÓâvV%6¶–ÆÄæöFTÖ&·W‡Æ–W"Â6¶–ÆÂÂÆ–÷WB’’æ¦ö–â‚rr—Ð¢ÂöF—cà¢ÂöF—cà¢ÂöF—cæ°¢Ð ¢gVæ7F–öâ†–FUvV%6¶–ÆÅF—VÂ‚’°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚wvV"×6¶–ÆÂ×F—r“òç&VÖ÷fR‚“°¢Ð ¢gVæ7F–öâ6†÷uvV%6¶–ÆÅF—†æöFRÂ6¶–ÆÄ–B’°¢†–FUvV%6¶–ÆÅF—VÂ‚“°¢6öç7B6¶–ÆÂÒæFFç6¶–ÆÇ2ævWB‡6¶–ÆÄ–B“°¢6öç7BÆ–W"Ò7W'&VçEÆ–W"‚“°¢–b‚6¶–ÆÂÇÂÆ–W"’&WGW&ã°¢6öç7B÷væVBÒÆ–W$÷vç56¶–ÆÂ‡Æ–W"Â6¶–ÆÂ“°¢6öç7B&V6öç2Ò÷væVBòµÒ¢6¶–ÆÅ&WV—&VÖVçE&V6öç2‡Æ–W"Â6¶–ÆÂ“°¢6öç7B7V2Ò—57V6–Æ—¦F–öâ‡6¶–ÆÂ“°¢6öç7B7V5fÇVRÒ7V2òçVÖ&W"‡Æ–W"ç7V6–Æ—¦F–öç3òå·6¶–ÆÂæ–EÒÇÂ’¢°¢6öç7BF—ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“°¢F—æ–BÒwvV"×6¶–ÆÂ×F—s°¢F—æ6Æ74æÖRÒwvV"×6¶–ÆÂ×F—s°¢F—æ–ææW$…DÔÂÒ ¢ÆF—b6Æ73Ò'vV"×6¶–ÆÂ×F—Ö†VB#ãÆ#âG¶W62‡6¶–ÆÂææÖRÇÂ6¶–ÆÂæ–B—ÓÂö#ãÇ7ãâG·7V2ò
ý]m½}mòG·7V5fÇVRò+r=âG·7V5fÇVWÖ¢rwÖ¢}	Ý-½¢wÓÂ÷7ããÂöF—cà¢G·6¶–ÆÂæ6FVv÷'’òÆF—b6Æ73Ò'vV"×6¶–ÆÂ×F—Ö6B#âG¶W62‡6¶–ÆÂæ6FVv÷'’—ÓÂöF—cæ¢rwÐ¢G·6¶–ÆÂæFW67&—F–öâòÆF—b6Æ73Ò'vV"×6¶–ÆÂ×F—ÖFW62#âG¶W62‡6¶–ÆÂæFW67&—F–öâ—ÓÂöF—cæ¢sÆF—b6Æ73Ò'vV"×6¶–ÆÂ×F—ÖFW62×WFVB#í	íýÝRÝR}MÝâãÂöF—câwÐ¢ÆF—b6Æ73Ò'vV"×6¶–ÆÂ×F—ÖÖWF#à¢Ç7â6Æ73Ò'–ÆÂ#í
-íÍí-Ã¢G´çVÖ&W"‡6¶–ÆÂæ6÷7BÇÂ—ÓÂ÷7ãà¢G¶÷væVBòsÇ7â6Æ73Ò'–ÆÂö²#í	}=}]ÝãÂ÷7ãâr¢&V6öç2æÆVæwF‚òÇ7â6Æ73Ò'–ÆÂv&â#í
-]=]-ó¢G¶W62‡&V6öç2æ¦ö–â‚rÂr’—ÓÂ÷7ãæ¢sÇ7â6Æ73Ò'–ÆÂö²#í	Mí-=ýÝãÂ÷7ãâwÐ¢ÂöF—cæ°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB‡F—“°¢6öç7B&V7BÒæöFRævWD&÷VæF–æt6Æ–VçE&V7B‚“°¢6öç7BF—&V7BÒF—ævWD&÷VæF–æt6Æ–VçE&V7B‚“°¢ÆWBÆVgBÒ&V7BæÆVgB²&V7Bçv–GF‚ò"ÒF—&V7Bçv–GF‚ò#°¢ÆVgBÒÖF‚æÖ‚ƒÂÖF‚æÖ–â†ÆVgBÂv–æF÷ræ–ææW%v–GF‚ÒF—&V7Bçv–GF‚Ò’“°¢ÆWBF÷Ò&V7Bæ&÷GFöÒ²°¢–b‡F÷²F—&V7Bæ†V–v‡Bâv–æF÷ræ–ææW$†V–v‡BÒ’F÷Ò&V7BçF÷ÒF—&V7Bæ†V–v‡BÒ°¢F—ç7G–ÆRæÆVgBÒG´ÖF‚ç&÷VæB†ÆVgB—×†°¢F—ç7G–ÆRçF÷ÒG´ÖF‚ç&÷VæB„ÖF‚æÖ‚ƒÂF÷’—×†°¢Ð ¢gVæ7F–öâ&–æEvV%6¶–ÆÅG&VT–çFW&7F–öç2‡&ö÷B’°¢6öç7B67&öÆÂÒ&ö÷BçVW'•6VÆV7F÷"‚rçvV"×6¶–ÆÂ×G&VR×67&öÆÂr“°¢–b‚67&öÆÂ’&WGW&ã°¢òò&W7F÷&RF†Rf–WrF†RÆ–W"†B&Vf÷&RF†R&R×&VæFW"‡&VÇF–ÖR&Vg&W6†W0¢òòvW&R&W6WGF–ærF†RG&VRFòF†RF÷ÖÆVgB6÷&æW"¢–b„çV’ç6¶–ÆÅ67&öÆÂ’°¢67&öÆÂç67&öÆÄÆVgBÒçVÖ&W"„çV’ç6¶–ÆÅ67&öÆÂæÆVgBÇÂ“°¢67&öÆÂç67&öÆÅF÷ÒçVÖ&W"„çV’ç6¶–ÆÅ67&öÆÂçF÷ÇÂ“°¢Ð¢67&öÆÂæFDWfVçDÆ—7FVæW"‚w67&öÆÂrÂ‚’Óâ°¢çV’ç6¶–ÆÅ67&öÆÂÒ²ÆVgC¢67&öÆÂç67&öÆÄÆVgBÂF÷¢67&öÆÂç67&öÆÅF÷Ó°¢†–FUvV%6¶–ÆÅF—VÂ‚“°¢ÒÂ²76—fS¢G'VRÒ“°¢òòG&r×Fò×âv—F‚F†RÖ÷W6R‡F÷V6‚¶VW2æF—fR67&öÆÆ–ær¢ÆWBâÒçVÆÃ°¢67&öÆÂæFDWfVçDÆ—7FVæW"‚wö–çFW&F÷vârÂWfVçBÓâ°¢–b†WfVçBæ'WGFöâÓÒÇÂWfVçBçö–çFW%G—RÓÒvÖ÷W6Rr’&WGW&ã°¢–b†WfVçBçF&vWBæ6Æ÷6W7B‚v'WGFöâr’’&WGW&ã°¢âÒ²ƒ¢WfVçBæ6Æ–VçE‚Â“¢WfVçBæ6Æ–VçE’ÂÆVgC¢67&öÆÂç67&öÆÄÆVgBÂF÷¢67&öÆÂç67&öÆÅF÷ÂÖ÷fVC¢fÇ6RÓ°¢G'’²67&öÆÂç6WEö–çFW$6GW&R†WfVçBçö–çFW$–B“²Ò6F6‚·Ð¢Ò“°¢67&öÆÂæFDWfVçDÆ—7FVæW"‚wö–çFW&Ö÷fRrÂWfVçBÓâ°¢–b‚â’&WGW&ã°¢6öç7BG‚ÒWfVçBæ6Æ–VçE‚Òâçƒ°¢6öç7BG’ÒWfVçBæ6Æ–VçE’Òâç“°¢–b„ÖF‚æ'2†G‚’â2ÇÂÖF‚æ'2†G’’â2’²âæÖ÷fVBÒG'VS²67&öÆÂæ6Æ74Æ—7BæFB‚v—2×ææ–ærr“²†–FUvV%6¶–ÆÅF—VÂ‚“²Ð¢67&öÆÂç67&öÆÄÆVgBÒâæÆVgBÒGƒ°¢67&öÆÂç67&öÆÅF÷ÒâçF÷ÒG“°¢Ò“°¢6öç7BVæEâÒWfVçBÓâ°¢–b‚â’&WGW&ã°¢G'’²67&öÆÂç&VÆV6Uö–çFW$6GW&R†WfVçBçö–çFW$–B“²Ò6F6‚·Ð¢âÒçVÆÃ°¢67&öÆÂæ6Æ74Æ—7Bç&VÖ÷fR‚v—2×ææ–ærr“°¢Ó°¢67&öÆÂæFDWfVçDÆ—7FVæW"‚wö–çFW'WrÂVæEâ“°¢67&öÆÂæFDWfVçDÆ—7FVæW"‚wö–çFW&6æ6VÂrÂVæEâ“°¢òò&–6‚†÷fW"FööÇF—v—F‚F†R6¶–ÆÂFW67&—F–öà¢67&öÆÂæFDWfVçDÆ—7FVæW"‚vÖ÷W6V÷fW"rÂWfVçBÓâ°¢6öç7BæöFRÒWfVçBçF&vWBæ6Æ÷6W7B‚u¶FF×6¶–ÆÂÖæöFUÒr“°¢–b‚æöFRÇÂâ’&WGW&ã°¢6†÷uvV%6¶–ÆÅF—†æöFRÂæöFRæFF6WBç6¶–ÆÄæöFR“°¢Ò“°¢67&öÆÂæFDWfVçDÆ—7FVæW"‚vÖ÷W6V÷WBrÂWfVçBÓâ°¢6öç7BæöFRÒWfVçBçF&vWBæ6Æ÷6W7B‚u¶FF×6¶–ÆÂÖæöFUÒr“°¢–b†æöFRbbæöFRæ6öçF–ç2†WfVçBç&VÆFVEF&vWB’’†–FUvV%6¶–ÆÅF—VÂ‚“°¢Ò“°¢Ð ¢7–æ2gVæ7F–öâWw&FT&–Æ—G’†&–Æ—G”¶W’’°¢–b‚$”Ä•E•ôÄ$TÅ5¶&–Æ—G”¶W•×ÇÆ—4wVW7E6W76–öâ‚’—&WGW&ã°¢–b†&–Æ—G”¶W“ÓÓÒvvÆ÷'’r—&WGW&âæ÷F–g’‚}
½-2-½M"	M	ÂrÂwv&âr“°¢6öç7B7W'&VçCÖ7W'&VçEÆ–W"‚“¶–b‚7W'&VçB—&WGW&ã°¢6öç7BÆWfVÃÔÖF‚æfÆö÷"„çVÖ&W"‚†7W'&VçBæ&–Æ—G”&6WÇÆ7W'&VçBæ&–Æ—F–W7ÇÇ·Ò•¶&–Æ—G”¶W•×ÇÃ’’³°¢–b†ÆWfVÃãR—&WGW&âæ÷F–g’‚}
]­-]-­=mRÝÍ­Í=ÍRRrÂv–æfòr“°¢–b„çVÖ&W"†7W'&VçBç6¶–ÆÅö–çG7ÇÃ“ÆÆWfVÂ—&WGW&âæ÷F–g’‚}	M½ò=í-Ýòr¶ÆWfVÂ²r-]=]-òr¶ÆWfVÂ²rí}¢â=½=}]ÝòrÂwv&âr“°¢–b‚6öæf—&Ò‚}
=½=}-Â*²r´$”Ä•E•ôÄ$TÅ5¶&–Æ—G”¶W•Ò²|+²Mâr¶ÆWfVÂ²r}r¶ÆWfVÂ²rí}¢â=½=}]Ýóòr’—&WGW&ã°¢v—B6öÖÖ—EÆ–W$×WFF–öâ†æW‡CÓç°¢6öç7B&6S×²âââ†æW‡Bæ&–Æ—G”&6WÇÆæW‡Bæ&–Æ—F–W7ÇÇ·Ò—Ó°¢6öç7BF&vWCÔÖF‚æfÆö÷"„çVÖ&W"†&6U¶&–Æ—G”¶W•×ÇÃ’’³°¢–b‡F&vWBÓÖÆWfVÇÇÇF&vWCãWÇÄçVÖ&W"†æW‡Bç6¶–ÆÅö–çG7ÇÃ“ÇF&vWB—F‡&÷ræWrW'&÷"‚}	ýíM½Â}Í]Ý½òâ	ýí-]Í-RMí-=ýÝ½Rí}­‚âr“°¢&6U¶&–Æ—G”¶W•Ó×F&vWC¶æW‡Bæ&–Æ—G”&6SÖ&6S¶æW‡Bæ&–Æ—F–W3×²ââæ&6WÓ°¢æW‡Bç6¶–ÆÅö–çG3ÔçVÖ&W"†æW‡Bç6¶–ÆÅö–çG7ÇÃ’×F&vWC°¢ÒÂ}
]­-]-­=½=}]Ýr“°¢Ð ¢gVæ7F–öâ&WWFF–öå&÷w2‡Æ–W"’°¢6öç7B7W'&VçE&÷w2Ò'&’æ—4'&’‡Æ–W#òç6ö6–Ãòç&WWFF–öâ’òÆ–W"ç6ö6–Âç&WWFF–öâ¢µÓ°¢6öç7BÆVv7’Ò'&’æ—4'&’‡Æ–W#òç6ö6–Ãòæ÷&w2’òÆ–W"ç6ö6–Âæ÷&w2¢µÓ°¢6öç7B'”–BÒæWrÖ‚“°¢7W'&VçE&÷w2æf÷$V6‚‡&÷rÓâ²–b‡&÷sòæ÷&t–BÇÂ&÷sòæ–B’'”–Bç6WB…7G&–ær‡&÷ræ÷&t–BÇÂ&÷ræ–B’Â&÷r“²Ò“°¢ÆVv7’æf÷$V6‚‡&÷rÓâ²–b‡&÷sòæ÷&t–BÇÂ&÷sòæ–B’'”–Bç6WB…7G&–ær‡&÷ræ÷&t–BÇÂ&÷ræ–B’Â&÷r“²Ò“°¢&WGW&â'&’æg&öÒ„æFFæf7F–öç2çfÇVW2‚’’æf–ÇFW"†f7F–öâÓâf—6–&ÆTf÷%Æ–W"†f7F–öâÂç6W76–öãòçW6W$–B’’æÖ†f7F–öâÓâ°¢6öç7B&÷rÒ'”–BævWB…7G&–ær†f7F–öâæ–B’’ÇÂ·Ó°¢&WGW&â²f7F–öâÂfÇVS¢çVÖ&W"‡&÷rçfÇVRóò&÷rç66÷&Róò&÷rç&WWFF–öâóò’ÂÆ&VÃ¢&÷ræÆ&VÂÇÂ&÷rç7FGW2ÇÂrrÓ°¢Ò“°¢Ð ¢gVæ7F–öâ&VæFW$Öö&–ÆU&WWFF–öâ‡Æ–W"’°¢6öç7B&÷w2Ò&WWFF–öå&÷w2‡Æ–W"“°¢–b‚&÷w2æÆVæwF‚’&WGW&ârs°¢&WGW&âÆF—b6Æ73Ò'6V7F–öâÖ†VB"7G–ÆSÒ&Ö&v–â×F÷£‡‚#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
]ý=-móÂöF—cãÂöF—cãÆF—b6Æ73Ò&6&BÖÆ—7B&WWFF–öâÖÖö&–ÆRÖÆ—7B#âG·&÷w2æÖ‚‡²f7F–öâÂfÇVRÂÆ&VÂÒ’ÓâÆ'F–6ÆR6Æ73Ò&VçF—G’Ö6&B#à¢G·&VæFW$VçF—G•F‡VÖ"†f7F–öâ—ÓÆF—b6Æ73Ò&W–V'&÷r#âG¶W62†f7F–öâçG—RÇÂ}	í=Ý}mòr—ÓÂöF—cãÆƒ3âG¶W62†f7F–öâææÖRÇÂf7F–öâæ–B—ÓÂöƒ3ãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62†f7F–öâæFW67&—F–öâÇÂf7F–öâæ–æfÇVVæ6RÇÂrr—ÓÂöF—cãÆF—b6Æ73Ò'–ÆÂ×&÷r"7G–ÆSÒ&Ö&v–â×F÷£‚#ãÆF—b6Æ73Ò'–ÆÂ#í
]ý=-mó¢G·fÇVWÓÂöF—câG¶Æ&VÂòÆF—b6Æ73Ò'–ÆÂ#âG¶W62†Æ&VÂ—ÓÂöF—cæ¢rwÓÂöF—cà¢Âö'F–6ÆSæ’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð ¢gVæ7F–öâ&öf–ÆT—FVÔFWF–ÄÖ&·Wcc†—FVÒÂÖWFÒ·Ò’°¢–b‚—FVÒ’&WGW&âsÆF—b6Æ73Ò'Æ6V†öÆFW"#í	ý]MÍ]"ÝRÝM]ÒãÂöF—câs°¢6öç7B&WÒ—FVÒç&WV—&VÖVçG2bbG—Vöb—FVÒç&WV—&VÖVçG2ÓÓÒvö&¦V7Brò—FVÒç&WV—&VÖVçG2¢·Ó°¢6öç7B&WFW‡BÒö&¦V7BæVçG&–W2‡&W’æf–ÇFW"‚…²ÂfÇVUÒ’ÓâfÇVRÓÒrrbbfÇVRÒçVÆÂ’æÖ‚…¶¶W’ÂfÇVUÒ’ÓâG¶¶W’çFõWW$66R‚—Ó¢G·fÇVWÖ’æ¦ö–â‚r+rr“°¢&WGW&â ¢ÆF—b6Æ73Ò'&öf–ÆRÖ—FVÒÖÖöFÂÖ6&B×cc#à¢Æ'WGFöâ6Æ73Ò'&öf–ÆRÖ—FVÒÖÖöFÂÖ6Æ÷6R×cc"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'&öf–ÆRÖ—FVÒÖ6Æ÷6R"&–ÖÆ&VÃÒ-	}­½-Â#ì9sÂö'WGFöãà¢G·&VæFW$VçF—G•F‡VÖ"†—FVÒÂv†W&òr—Ð¢ÆF—b6Æ73Ò&W–V'&÷r#âG¶W62†ÖWFæÆ&VÂÇÂ—FVÒçG—RÇÂ—FVÒæ6FVv÷'’ÇÂ}
Ýým]ÝRr—ÓÂöF—cà¢Æƒ#âG¶W62†—FVÒææÖRÇÂ—FVÒæ–B—ÓÂöƒ#à¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62†—FVÒç&&—G’ÇÂrr—ÓÂöF—cà¢ÆF—b6Æ73Ò'–ÆÂ×&÷r&öf–ÆRÖ—FVÒÖÖöFÂ×–ÆÇ2×cc#à¢G¶ÖWFçG’òÆF—b6Æ73Ò'–ÆÂ#í	­í½}]--ã¢G´çVÖ&W"†ÖWFçG’—ÓÂöF—cæ¢rwÐ¢G¶ÖWFç&Vv—7G&F–öäWV—ÖVçBòÆF—b6Æ73Ò'–ÆÂ#í
-íÍí-Â-½í¢G´çVÖ&W"†ÖWFæ7&VF–öä6÷7BÇÂ—Òí}¢ãÂöF—cæ¢rwÐ¢G¶—FVÒæFÖvRòÆF—b6Æ73Ò'–ÆÂ#í
=íÓ¢G¶W62†—FVÒæFÖvR—ÓÂöF—cæ¢rwÐ¢G¶—FVÒæ†—D&öçW2ÒçVÆÂbb—FVÒæ†—D&öçW2ÓÒrròÆF—b6Æ73Ò'–ÆÂ#í	ýíýMÝS¢G´çVÖ&W"†—FVÒæ†—D&öçW2’ãÒòr²r¢rwÒG¶W62†—FVÒæ†—D&öçW2—ÓÂöF—cæ¢rwÐ¢G¶—FVÒæ&Ö÷$6Æ72ÒçVÆÂbb—FVÒæ&Ö÷$6Æ72ÓÒrròÆF—b6Æ73Ò'–ÆÂ#í	­	¢G¶W62†—FVÒæ&Ö÷$6Æ72—ÓÂöF—cæ¢rwÐ¢G¶—FVÒç&WV—&VDVæW&w’ÒçVÆÂbb—FVÒç&WV—&VDVæW&w’ÓÒrròÆF—b6Æ73Ò'–ÆÂ#í
ÝÝ]=ó¢G¶W62†—FVÒç&WV—&VDVæW&w’—ÓÂöF—cæ¢rwÐ¢ÆF—b6Æ73Ò'–ÆÂ#í	Í¢G´çVÖ&W"†—FVÒæÖ72óò—FVÒçvV–v‡Bóò—ÓÂöF—cà¢ÆF—b6Æ73Ò'–ÆÂ#í
}Í]¢G´ÖF‚æÖ‚ƒÂçVÖ&W"†—FVÒæ–çfVçF÷'•v–GF‚óò—FVÒç6—¦Uv–GF‚óò’—Ü9rG´ÖF‚æÖ‚ƒÂçVÖ&W"†—FVÒæ–çfVçF÷'”†V–v‡Bóò—FVÒç6—¦T†V–v‡Bóò’—ÓÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò&F—f–FW"#ãÂöF—cà¢ÆF—b6Æ73Ò&'F–6ÆRÖ&öG’#ãÇâG¶W62†—FVÒæFW62ÇÂ—FVÒæFW67&—F–öâÇÂ—FVÒç7VÖÖ'’ÇÂ}	íýÝRý]MÍ]-ÝR}MÝââr—ÓÂ÷ãÂöF—cà¢G·&WFW‡BòÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#ãÆ#í
-]í-Ýó£Âö#âG¶W62‡&WFW‡B—ÓÂöF—cæ¢rwÐ¢G·&VæFW%&VÆFVE6V7F–öåvV%c‚v'F–6ÆRrÂ—FVÒç&VÆFVD'F–6ÆT–G2Â}
-ý}ÝÝ½R--Í‚r—Ð¢G¶ÖWFç&Vv—7G&F–öäWV—ÖVçBòÆF—b6Æ73Ò'&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂÖ7F–öç2×cs"#ãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ&'WGFöâ"FF×&Vv—7G&F–öâÖWV—ÖVçB×6VÆV7B×cs"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò#âG¶ÖWFç6VÆV7FVBò}
=	
	
-
Â		r	-
½	
		Ý	Ý	í	=	âr¢}	-
½	
	
-
ÂwÓÂö'WGFöããÂöF—cæ¢rwÐ¢ÂöF—cæ°¢Ð ¢gVæ7F–öâ6Æ÷6U&öf–ÆT—FVÔÖöFÅcc‚’°¢çV’ç&öf–ÆT—FVÔÖöFÂÒçVÆÃ°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖ—FVÒÖÖöFÂ×ccr“òç&VÖ÷fR‚“°¢Fö7VÖVçBæ&öG’æ6Æ74Æ—7Bç&VÖ÷fR‚w&öf–ÆRÖ—FVÒÖÖöFÂÖ÷Vâ×ccr“°¢Ð ¢gVæ7F–öâ÷Vå&öf–ÆT—FVÔÖöFÅcc†—FVÔ–BÂÖWFÒ·Ò’°¢6öç7B—FVÒÒæFFæ—FV×2ævWB…7G&–ær†—FVÔ–BÇÂrr’“°¢–b‚—FVÒ’&WGW&âæ÷F–g’‚}	ý]MÍ]"ÝRÝM]ÒrÂwv&âr“°¢6Æ÷6U&öf–ÆT—FVÔÖöFÅcc‚“°¢çV’ç&öf–ÆT—FVÔÖöFÂÒ²—FVÔ–C¢—FVÒæ–BÂââæÖWFÓ°¢6öç7BÖöFÂÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“°¢ÖöFÂæ–BÒw&öf–ÆRÖ—FVÒÖÖöFÂ×ccs°¢ÖöFÂæ6Æ74æÖRÒw&öf–ÆRÖ—FVÒÖÖöFÂ×ccs°¢ÖöFÂæFF6WBæ7F–öâÒw&öf–ÆRÖ—FVÒÖ6Æ÷6Rs°¢ÖöFÂæ–ææW$…DÔÂÒÆF—b6Æ73Ò'&öf–ÆRÖ—FVÒÖÖöFÂ×6†VÆÂ×cc"FF×&öf–ÆRÖ—FVÒÖÖöFÂ×6†VÆÃâG·&öf–ÆT—FVÔFWF–ÄÖ&·Wcc†—FVÒÂÖWF—ÓÂöF—cæ°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB†ÖöFÂ“°¢Fö7VÖVçBæ&öG’æ6Æ74Æ—7BæFB‚w&öf–ÆRÖ—FVÒÖÖöFÂÖ÷Vâ×ccr“°¢Ð ¢gVæ7F–öâ&VæFW%&öf–ÆT6ö×7D—FVÔ6&Ecc†—FVÒÂÖWFÒ·Ò’°¢&WGW&â ¢Æ'F–6ÆR6Æ73Ò&VçF—G’Ö6&B&öf–ÆRÖ—FVÒÖ6&B×cc"FFÖ7F–öãÒ'&öf–ÆRÖ—FVÒ"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"FFÖ—FVÒÖÆ&VÃÒ"G¶W62†ÖWFæÆ&VÂÇÂrr—Ò"FFÖ—FVÒ×G“Ò"G´çVÖ&W"†ÖWFçG’ÇÂ—Ò"F&–æFWƒÒ#"&öÆSÒ&'WGFöâ#à¢G·&VæFW$VçF—G•F‡VÖ"†—FVÒ—Ð¢ÆF—b6Æ73Ò'&öf–ÆRÖ—FVÒÖ6&BÖ6÷’×cc#à¢ÆF—b6Æ73Ò&W–V'&÷r#âG¶W62†ÖWFæÆ&VÂÇÂ—FVÒçG—RÇÂ—FVÒæ6FVv÷'’ÇÂ}	ý]MÍ]"r—ÓÂöF—cà¢Æƒ3âG¶W62†—FVÒææÖRÇÂ—FVÒæ–B—ÓÂöƒ3à¢G¶ÖWFçG’òÆF—b6Æ73Ò'–ÆÂ#ì9rG´çVÖ&W"†ÖWFçG’—ÓÂöF—cæ¢rwÐ¢ÂöF—cà¢Âö'F–6ÆSæ°¢Ð ¢gVæ7F–öâ&VæFW%&öf–ÆR‚’°¢6öç7B&ö÷BÒB‚r767&VVâ×&öf–ÆRr“°¢6öç7BÆ–W"Ò7W'&VçEÆ–W"‚“°¢6öç7BÆæWBÒ7W'&VçEÆæWB‚“°¢6öç7B&÷rÒæFFçÆ–W%&÷w2ævWB‡Æ–W#òæ–BÇÂrr“°¢–b‚Æ–W"’°¢6WEF÷&"‚}	ýíM½ÂrÂrr“°¢&ö÷Bæ–ææW$…DÔÂÒsÆF—b6Æ73Ò'Æ6V†öÆFW"#í	ýíM½ÂÝR-½ÒãÂöF—câs°¢&WGW&ã°¢Ð¢6öç7B&öf–ÆUF"ÒçV’ç&öf–ÆUF"ÓÓÒw6¶–ÆÇ2ròw6¶–ÆÇ2r¢vÖ–âs°¢6öç7BF'5&÷rÒÆF—b6Æ73Ò'6VvÖVçFVB&öf–ÆR×F'2×vV"W&Ö'F–6ÆR×F÷×cc#à¢Æ'WGFöâ6Æ73Ò&6†—Ö'FâG·&öf–ÆUF"ÓÓÒvÖ–âròv7F—fRr¢rwÒ"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'&öf–ÆR×F""FF×F#Ò&Ö–â#í	ýíM½ÃÂö'WGFöãà¢Æ'WGFöâ6Æ73Ò&6†—Ö'FâG·&öf–ÆUF"ÓÓÒw6¶–ÆÇ2ròv7F—fRr¢rwÒ"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'&öf–ÆR×F""FF×F#Ò'6¶–ÆÇ2#í	Ý-½­‚+rG´çVÖ&W"‡Æ–W"ç6¶–ÆÅö–çG2ÇÂ—Òí}¢ãÂö'WGFöãà¢ÂöF—cæ°¢–b‡&öf–ÆUF"ÓÓÒw6¶–ÆÇ2r’°¢6WEF÷&"‚}	Ý-½­‚rÂ}	M]-âÝ-½­í"‚]­-]-¢(	B­¢"Ý-í½ÍÝíÂÝ-]M]Rr“°¢†–FUvV%6¶–ÆÅF—VÂ‚“°¢&ö÷Bæ–ææW$…DÔÂÒG·F'5&÷wÒG·&VæFW%vV%6¶–ÆÅG&VR‡Æ–W"—Ö°¢&–æEvV%6¶–ÆÅG&VT–çFW&7F–öç2‡&ö÷B“°¢&WGW&ã°¢Ð¢†–FUvV%6¶–ÆÅF—VÂ‚“°¢6WEF÷&"‚}	ýíM½ÂrÂrr“°¢6öç7B7FG2ÒÆ–W"ç7FG2ÇÂ·Ó°¢6öç7B–çfVçF÷'’Ò'&’æ—4'&’‡Æ–W"æ–çfVçF÷'’’òÆ–W"æ–çfVçF÷'’¢µÓ°¢6öç7BWV—ÖVçE6Æ÷G2ÒÆ–W"æWV—ÖVçE6Æ÷G2ÇÂ·Ó°¢6öç7BWV—VD6&G2Òö&¦V7BæVçG&–W2†WV—ÖVçE6Æ÷G2’æf–ÇFW"‚…²Â—FVÔ–EÒ’Óâ—FVÔ–B’æÖ‚…·6Æ÷BÂ—FVÔ–EÒ’Óâ‡²6Æ÷BÂ—FVÓ¢æFFæ—FV×2ævWB†—FVÔ–B’ÇÂ²–C¢—FVÔ–BÂæÖS¢—FVÔ–BÂFW63¢rrÒÒ’“°¢&ö÷Bæ–ææW$…DÔÂÒ ¢G·F'5&÷wÐ¢ÆF—b6Æ73Ò'&öf–ÆRÖ6&B"7G–ÆSÒ'FF–æs£gƒ²#à¢ÆF—b6Æ73Ò'&öf–ÆRÖ†W&ò#à¢G·&VæFW$fF"‡Æ–W"—Ð¢ÆF—cà¢ÆF—b6Æ73Ò&W–V'&÷r#í	ý
	í
M		½
Â	ý	]

	í	Ý		m	ÂöF—cà¢Æƒ3âG¶W62‡Æ–W"æF—7Æ”æÖRÇÂÆ–W"æ–B—ÓÂöƒ3à¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62‡Æ–W"ç&æ²ÇÂÆ–W"ç&öÆRÇÂ}	=í¢r—Ò+r-]ò-í­‚G´çVÖ&W"‡&÷sòçfW'6–öâÇÂ—ÓÂöF—cà¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò'&öf–ÆR×FööÆ&"#à¢Æ'WGFöâ6Æ73Ò&v†÷7BÖ'FâÖ–æ’Ö'Fâ"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'&öf–ÆR×&Vg&W6‚#í	íÝí--ÃÂö'WGFöãà¢Æ'WGFöâ6Æ73Ò&v†÷7BÖ'FâÖ–æ’Ö'Fâ"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'&öf–ÆRÖÆöv÷WB#í	-½-‚rýíM½óÂö'WGFöãà¢Gµ%TåD”ÔRæ6Æ÷VDöæÇ’òsÆ'WGFöâ6Æ73Ò&v†÷7BÖ'FâÖ–æ’Ö'FâFævW""G—SÒ&'WGFöâ"FFÖ7F–öãÒ'&öf–ÆRÖf÷&vWBÖFWf–6R#í	}½-Â=-í--ãÂö'WGFöãâr¢rwÐ¢ÂöF—cà¢ÆF—b6Æ73Ò'7FBÖw&–B#à¢ÆF—b6Æ73Ò'7FB#ãÆF—b6Æ73Ò&FFÖÆ&VÂ#í	}	M	í
	í	-
Í	SÂöF—cãÆF—b6Æ73Ò&FF×fÇVR#âG´çVÖ&W"‡7FG2æ‡7W'&VçBÇÂ—ÒòG´çVÖ&W"‡7FG2æ‡Ö‚ÇÂ—ÓÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò'7FB#ãÆF—b6Æ73Ò&FFÖÆ&VÂ#í
	
#ÂöF—cãÆF—b6Æ73Ò&FF×fÇVR#âG´çVÖ&W"‡7FG2ç6†–VÆD7W'&VçBÇÂ—ÒòG´çVÖ&W"‡7FG2ç6†–VÆDÖ‚ÇÂ—ÓÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò'7FB#ãÆF—b6Æ73Ò&FFÖÆ&VÂ#í
Ý	Ý	]
	=	
óÂöF—cãÆF—b6Æ73Ò&FF×fÇVR#âG´çVÖ&W"‡7FG2æVæW&w”7W'&VçBÇÂ—ÒòG´çVÖ&W"‡7FG2æVæW&w”Ö‚ÇÂ—ÓÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò'7FB#ãÆF—b6Æ73Ò&FFÖÆ&VÂ#í	­
	]	M	
-
³ÂöF—cãÆF—b6Æ73Ò&FF×fÇVR#âG¶f÷&ÖD7&VF—G2‡Æ–W"æ7&VF—G2ÇÂ—ÓÂöF—cãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò&F—f–FW"#ãÂöF—cà¢ÆF—b6Æ73Ò&–æfòÖw&–B#à¢ÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#í
-]­=òý½Ý]-ÂöF—cãÆF—b6Æ73Ò'b#âG¶W62‡ÆæWCòææÖRÇÂ}	ÝR}MÝr—ÓÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#í	ýí½]MÝ]RíÝí-½]ÝSÂöF—cãÆF—b6Æ73Ò'b#âG¶W62‡&÷sòçWFFVEöBòf÷&ÖDFFR‡&÷rçWFFVEöB’¢}	½í­½ÍÝò­íýòr—ÓÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#í
í½ÃÂöF—cãÆF—b6Æ73Ò'b#âG¶W62‡Æ–W"ç&æ²ÇÂÆ–W"ç&öÆRÇÂ}	=í¢r—ÓÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#í	½í­móÂöF—cãÆF—b6Æ73Ò'b#âG¶W62†7W'&VçE7—7FVÒ‚“òææÖRÇÂ}
-]ÍÝR}MÝr—ÓÂöF—cãÂöF—cà¢ÂöF—cà¢G²‡Æ–W"æÆ÷&RÇÂÆ–W"ææ÷FW2’òÆF—b6Æ73Ò&F—f–FW"#ãÂöF—cãÇ6V7F–öâ6Æ73Ò'&öf–ÆRÖÆ÷&R×&–6‚×c2#ãÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc#ãÆF—cãÆF—b6Æ73Ò&W–V'&÷r#í	

-	í
	
ò	ý	]

	í	Ý		m	ÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	½íý]íÝmÂöF—cãÂöF—cãÂöF—câG·Æ–W"æÆ÷&RòÆF—b6Æ73Ò&'F–6ÆRÖ&öG’&öf–ÆRÖÆ÷&RÖ&öG’×c2#âG¶æ÷&ÖÆ—¦U&öf–ÆTÆ÷&T‡FÖÅc2‡Æ–W"æÆ÷&R—ÓÂöF—cæ¢sÆF—b6Æ73Ò'Æ6V†öÆFW"#í	½íý]íÝmýí­ÝR}ýí½Ý]ÒãÂöF—câwÒG·Æ–W"ææ÷FW2òÆF—b6Æ73Ò'&öf–ÆRÖæ÷FW2×c2#ãÆF—b6Æ73Ò&²#í	½}Ý½R}Í]-­ƒÂöF—cãÇâG¶W62‡Æ–W"ææ÷FW2—ÓÂ÷ãÂöF—cæ¢rwÓÂ÷6V7F–öãæ¢rwÐ¢ÆF—b6Æ73Ò&F—f–FW"#ãÂöF—cãÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	½}Ýí-ÃÂöF—cãÂöF—cãÆF—b6Æ73Ò'W'6öæÆ—G’×&öf–ÆRÖw&–B×ccb#ãÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#í
}]-]­-]ÂöF—cãÆF—b6Æ73Ò'b#âG¶W62‡Æ–W"çW'6öæÆ—G•G&—BÇÂ}	ÝR=­}Ýr—ÓÂöF—cãÂöF—cãÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#í	M]³ÂöF—cãÆF—b6Æ73Ò'b#âG¶W62‡Æ–W"æ–FVÂÇÂ}	ÝR=­}Òr—ÓÂöF—cãÂöF—cãÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#í
½í-ÃÂöF—cãÆF—b6Æ73Ò'b#âG¶W62‡Æ–W"çvV¶æW72ÇÂ}	ÝR=­}Ýr—ÓÂöF—cãÂöF—cãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc"7G–ÆSÒ&Ö&v–â×F÷£‡‚#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
-]­=]RÝým]ÝSÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&–çfVçF÷'’ÖÆ—7B&öf–ÆRÖ—FVÒÖw&–B×cc#à¢G¶WV—VD6&G2æÖ‚‡²6Æ÷BÂ—FVÒÒ’Óâ&VæFW%&öf–ÆT6ö×7D—FVÔ6&Ecc†—FVÒÂ²Æ&VÃ¢WV—ÖVçDÆ&VÂ‡6Æ÷B’Ò’’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'Æ6V†öÆFW"#í
Ýým]ÝRÝR}MÝâãÂöF—câwÐ¢ÂöF—cà¢ÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc"7G–ÆSÒ&Ö&v–â×F÷£‡‚#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Ý-]Ý-ÃÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&–çfVçF÷'’ÖÆ—7B&öf–ÆRÖ—FVÒÖw&–B×cc#à¢G¶–çfVçF÷'’æÖ†VçG'’Óâ°¢6öç7B—FVÒÒæFFæ—FV×2ævWB†VçG'’æ—FVÔ–B’ÇÂ²–C¢VçG'’æ—FVÔ–BÂæÖS¢VçG'’æ—FVÔ–BÂFW63¢rrÓ°¢&WGW&â&VæFW%&öf–ÆT6ö×7D—FVÔ6&Ecc†—FVÒÂ²Æ&VÃ¢æ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÒ“ÓÓÒw7Fö6²sò}	­m‚s¢†—FVÒçG—WÇÆ—FVÒæ6FVv÷'—ÇÂ}	ý]MÍ]"r’ÂG“¢çVÖ&W"†VçG'’çG’ÇÂ’Ò“°¢Ò’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'Æ6V†öÆFW"#í	Ý-]Ý-Âý="ãÂöF—câwÐ¢ÂöF—cà¢G²„'&’æ—4'&’‡Æ–W"æ–×ÆçG2’bbÆ–W"æ–×ÆçG2æÆVæwF‚’ò ¢ÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc"7G–ÆSÒ&Ö&v–â×F÷£‡‚#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Íý½Ý-³ÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&6&BÖÆ—7B#à¢G·Æ–W"æ–×ÆçG2æÖ†–×ÆçBÓâÆ'F–6ÆR6Æ73Ò&VçF—G’Ö6&B#ãÆF—b6Æ73Ò&W–V'&÷r#í	Íý½Ý#ÂöF—cãÆƒ3âG¶W62†–×ÆçBææÖRÇÂ}	Íý½Ý"r—ÓÂöƒ3ãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62†–×ÆçBæFW62ÇÂrr—ÓÂöF—cãÂö'F–6ÆSæ’æ¦ö–â‚rr—Ð¢ÂöF—cà¢¢rwÐ¢G²‡Æ–W"æ&–Æ—F–W2bbö&¦V7Bæ¶W—2‡Æ–W"æ&–Æ—F–W2’æÆVæwF‚’ò ¢ÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc"7G–ÆSÒ&Ö&v–â×F÷£‡‚#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
]­-]-­ƒÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò'7FBÖw&–B#à¢G´ö&¦V7BæVçG&–W2‡Æ–W"æ&–Æ—F–W2’æÖ‚…¶¶W’ÂfÇVUÒ’ÓâÆF—b6Æ73Ò'7FB#ãÆF—b6Æ73Ò&FFÖÆ&VÂ#âG¶W62„$”Ä•E•ôÄ$TÅ5¶¶W•ÒÇÂ¶W’—ÓÂöF—cãÆF—b6Æ73Ò&FF×fÇVR#âG¶W62‡fÇVR—ÓÂöF—cãÂöF—cæ’æ¦ö–â‚rr—Ð¢ÂöF—cà¢¢rwÐ¢G²‡Æ–W"ç7V6–Æ—¦F–öç2bbö&¦V7Bæ¶W—2‡Æ–W"ç7V6–Æ—¦F–öç2’æÆVæwF‚’ò ¢ÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc"7G–ÆSÒ&Ö&v–â×F÷£‡‚#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
ý]m½}mƒÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò'7FBÖw&–B7V2Öw&–BÖÖö&–ÆR#à¢G´ö&¦V7BæVçG&–W2‡Æ–W"ç7V6–Æ—¦F–öç2’æf–ÇFW"‚…²ÂfÇVUÒ’ÓâçVÖ&W"‡fÇVRÇÂ’â’æÖ‚…¶¶W’ÂfÇVUÒ’ÓâÆF—b6Æ73Ò'7FB#ãÆF—b6Æ73Ò&FFÖÆ&VÂ#âG¶W62„æFFç6¶–ÆÇ2ævWB†¶W’“òææÖRÇÂ¶W’—ÓÂöF—cãÆF—b6Æ73Ò&FF×fÇVR#âG´çVÖ&W"‡fÇVRÇÂ—ÓÂöF—cãÂöF—cæ’æ¦ö–â‚rr—Ð¢ÂöF—cà¢¢rwÐ¢G·&VæFW$Öö&–ÆU&WWFF–öâ‡Æ–W"—Ð¢G·&VæFW%&VÆFVE6V7F–öåvV%c‚vç2rÂÆ–W"ç6ö6–Ãòæç4–G2Â}
-ý}ÝÝ½Rå2r—Ð¢G·&VæFW%&VÆFVE6V7F–öåvV%c‚v'F–6ÆRrÂÆ–W"ç&VÆFVD'F–6ÆT–G2Â}
-ý}ÝÝ½R--Í‚r—Ð¢°¢Ð ¢gVæ7F–öâ&VæFW$7W'&VçE67&VVâ‚’°¢–b„çV’ç67&VVâÓÒv†öÖRr’²çV’ævÆ‡”FW6·F÷7F—fRÒfÇ6S²vV$vÆ‡”ÖæFW7G&÷’‚“²Ð¢–b…%TåD”ÔRæ†–FT6öÖ&BbbçV’ç67&VVâÓÓÒv6öÖ&Br’çV’ç67&VVâÒv†öÖRs°¢–b„çV’ç67&VVâÓÒv6öÖ&Br’Fö7VÖVçBæ&öG’æ6Æ74Æ—7Bç&VÖ÷fR‚v6öÖ&BÖÖöFÂÖ÷Vâr“°¢BB‚rç67&VVâr’æf÷$V6‚†æöFRÓâæöFRæ6Æ74Æ—7BçFövvÆR‚v7F—fRrÂæöFRæ–BÓÓÒ67&VVâÒG´çV’ç67&VVçÖ’“°¢BB‚rææbÖ'Fâr’æf÷$V6‚†'FâÓâ'Fâæ6Æ74Æ—7BçFövvÆR‚v7F—fRrÂ'FâæFF6WBç67&VVâÓÓÒçV’ç67&VVâ’“°¢–b„çV’ç67&VVâÓÓÒv†öÖRr’&VæFW$†öÖR‚“°¢–b„çV’ç67&VVâÓÓÒv&6†—fRr’&VæFW$&6†—fR‚“°¢–b„çV’ç67&VVâÓÓÒvÖ&¶WBr’&VæFW$Ö&¶WB‚“°¢–b„çV’ç67&VVâÓÓÒv6†Br’&VæFW$6†B‚“°¢–b„çV’ç67&VVâÓÓÒv6öÖ&Brbb%TåD”ÔRæ†–FT6öÖ&B’&VæFW$6öÖ&B‚“°¢–b„çV’ç67&VVâÓÓÒw&öf–ÆRr’&VæFW%&öf–ÆR‚“°¢Ð ¢gVæ7F–öâ÷Vä'F–6ÆT'”–B†'F–6ÆT–BÂ÷F–öç2Ò·Ò’°¢6öç7B–BÒ7G&–ær†'F–6ÆT–BÇÂrr’çG&–Ò‚“°¢6öç7B'F–6ÆRÒæFFæ'F–6ÆW2ævWB†–B“°¢–b‚'F–6ÆR’°¢æ÷F–g’‚}
--ÍòÝRÝM]Ý"½í­½ÍÝíÂ]-RrÂwv&âr“°¢&WGW&ã°¢Ð¢6öç7BF—&V7D66W72Ò÷F–öç2æF—&V7D66W72ÓÓÒG'VS°¢–b‚F—&V7D66W72bbf—6–&ÆTf÷%Æ–W"†'F–6ÆRÂç6W76–öãòçW6W$–BÇÂrr’’°¢æ÷F–g’‚}
--ÍòÝ]Mí-=ýÝ-]­=]Í2ý]íÝm2rÂwv&âr“°¢&WGW&ã°¢Ð¢çV’æ&6†—fUF"Òv'F–6ÆW2s°¢çV’æF—&V7E&VÆFVDVçF—G•cÒçVÆÃ°¢çV’æ&6†—fU66÷Ucs’Òw6V7F–öâs°¢çV’æ&6†—fT6FVv÷'•cs’ÒvÆÂs°¢çV’æ&6†—fU7FGW5cs’ÒvÆÂs°¢çV’æ&6†—fUVW'’Òrs°¢çV’ç6VÆV7FVD&6†—fT–BÒ–C°¢çV’ç6VÆV7FVD&6†—fUG—RÒv'F–6ÆRs°¢çV’æF—&V7D'F–6ÆT–Ecƒ"ÒF—&V7D66W72ò–B¢rs°¢&VÖVÖ&W$&6†—fU&V6VçEcs’‚v'F–6ÆRrÂ–B“°¢Ö&´&6†—fT'F–6ÆU&VB†–B“°¢çV’ç67&VVâÒv&6†—fRs°¢–b‡G—Vöb6Æ÷6UvV$6†DÖ7FW%cc‚ÓÓÒvgVæ7F–öâr’6Æ÷6UvV$6†DÖ7FW%cc‚‚“°¢&VæFW$7W'&VçE67&VVâ‚“°¢Ð ¢gVæ7F–öâfö7W57—7FVÒ‡7—7FVÔ–B’°¢çV’æfö7W6VE7—7FVÔ–BÒ7—7FVÔ–C°¢çV’ç67&VVâÒv†öÖRs°¢&VæFW$7W'&VçE67&VVâ‚“°¢Ð ¢gVæ7F–öâ÷VåÆæWB‡ÆæWD–B’°¢–b‚æFFçÆæWG2æ†2‡ÆæWD–B’’&WGW&âæ÷F–g’‚}	ý½Ý]-ÝRÝM]ÝrÂwv&âr“°¢çV’æF—&V7E&VÆFVDVçF—G•cÒçVÆÃ°¢çV’æ&6†—fUF"ÒwÆæWG2s°¢çV’æ&6†—fU66÷Ucs’Òw6V7F–öâs°¢çV’æ&6†—fT6FVv÷'•cs’ÒvÆÂs°¢çV’æ&6†—fU7FGW5cs’ÒvÆÂs°¢çV’æ&6†—fUVW'’Òrs°¢çV’ç6VÆV7FVD&6†—fT–BÒÆæWD–C°¢çV’ç6VÆV7FVD&6†—fUG—RÒwÆæWBs°¢&VÖVÖ&W$&6†—fU&V6VçEcs’‚wÆæWBrÂÆæWD–B“°¢çV’ç67&VVâÒv&6†—fRs°¢&VæFW$7W'&VçE67&VVâ‚“°¢Ð ¢gVæ7F–öâ÷Vå7—7FVÒ‡7—7FVÔ–B’°¢6öç7B7—7FVÒÒæFFç7—7FV×2æf–æB†—FVÒÓâ—FVÒæ–BÓÓÒ7—7FVÔ–B“°¢–b‚7—7FVÒ’&WGW&âæ÷F–g’‚}
-]ÍÝRÝM]ÝrÂwv&âr“°¢çV’æF—&V7E&VÆFVDVçF—G•cÒçVÆÃ°¢çV’æfö7W6VE7—7FVÔ–BÒ7—7FVÔ–C°¢çV’ç67&VVâÒv†öÖRs°¢&VæFW$7W'&VçE67&VVâ‚“°¢Ð ¢gVæ7F–öâ÷Vå&VÆFVDVçF—G•vV%c‡G—UfÇVRÂ–EfÇVR’°¢6öç7BG—RÒ7G&–ær‡G—UfÇVRÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢6öç7B–BÒ7G&–ær†–EfÇVRÇÂrr’çG&–Ò‚“°¢6öç7BVçF—G’Ò&VÆFVDVçF—G•vV%c‡G—RÂ–B“°¢–b‚VçF—G’’&WGW&âæ÷F–g’‚}
-ý}ÝÝò}ýÂÝRÝM]ÝrÂwv&âr“°¢–b‚f—6–&ÆTf÷%Æ–W"†VçF—G’Âç6W76–öãòçW6W$–BÇÂrr’’&WGW&âæ÷F–g’‚}
-ý}ÝÝò}ýÂÝ]Mí-=ýÝ-]­=]Í2ýíM½ârÂwv&âr“°¢6Æ÷6U&öf–ÆT—FVÔÖöFÅcc‚“°¢–b‡G—RÓÓÒv'F–6ÆRr’&WGW&â÷Vä'F–6ÆT'”–B†–B“°¢–b‡G—RÓÓÒwÆæWBr’&WGW&â÷VåÆæWB†–B“°¢–b…²w7—7FVÒrÂv—FVÒuÒæ–æ6ÇVFW2‡G—R’’°¢çV’æF—&V7E&VÆFVDVçF—G•cÒçVÆÃ°¢çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs°¢çV’æ&6†—fUF"ÒG—RÓÓÒw7—7FVÒròw7—7FV×2r¢vWV—ÖVçBs°¢çV’æ&6†—fU66÷Ucs’Òw6V7F–öâs°¢çV’æ&6†—fT6FVv÷'•cs’ÒvÆÂs°¢çV’æ&6†—fU7FGW5cs’ÒvÆÂs°¢çV’æ&6†—fUVW'’Òrs°¢çV’ç6VÆV7FVD&6†—fT–BÒ–C°¢çV’ç6VÆV7FVD&6†—fUG—RÒG—S°¢ÒVÇ6R°¢çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs°¢çV’æF—&V7E&VÆFVDVçF—G•cÒ²G—RÂ–BÓ°¢çV’ç6VÆV7FVD&6†—fT–BÒ–C°¢çV’ç6VÆV7FVD&6†—fUG—RÒG—S°¢Ð¢&VÖVÖ&W$&6†—fU&V6VçEcs’‡G—RÂ–B“°¢çV’ç67&VVâÒv&6†—fRs°¢–b‡G—Vöb6Æ÷6UvV$6†DÖ7FW%cc‚ÓÓÒvgVæ7F–öâr’6Æ÷6UvV$6†DÖ7FW%cc‚‚“°¢&VæFW$7W'&VçE67&VVâ‚“°¢Ð ¢7–æ2gVæ7F–öâ6fU&Vg&W6‚†÷F–öç2Ò·Ò’°¢G'’°¢v—BVÆÄWfW'—F†–ær‡²6–ÆVçC¢G'VRÂ&VæFW#¢÷F–öç2æFVfW%&VæFW"Ò“°¢–b‚÷F–öç2æFVfW%&VæFW"’°¢&VæFW$Æöv–â‚“°¢&VæFW$ffV7FVE67&VVç2‡²6æ6†÷C¢G'VRÂÆ–W'3¢G'VRÂ6†C¢G'VRÂ6öÖ&C¢G'VRÒ“°¢Ð¢æ÷F–g’‚}	MÝÝ½R­ÍýÝ‚íÝí-½]Ý²rÂvö²r“°¢Ò6F6‚†W'&÷"’°¢æ÷F–g’†	ÝR=M½íÂíÝí--ÂMÝÝ½S¢G¶W'&÷"æÖW76vWÖÂvW'"r“°¢Ð¢Ð   ¢7–æ2gVæ7F–öâÇ•&VÇF–ÖU&V6÷&B†6öÆÆV7F–öâÂWfVçBÂ&V6÷&B’°¢–b‚&V6÷&B’&WGW&ã°¢6öç7B6×–vä–BÒ7G&–ær‡&V6÷&Bæ6×–vä–BÇÂ&V6÷&Bæ6×–våö–BÇÂrr“°¢–b†6×–vä–Bbb6×–vä–BÓÒ7G&–ær„æ6öæf–ræ6×–vä–BÇÂrr’’&WGW&ã°¢6öç7B—4FVÆWFRÒ7G&–ær†WfVçBÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvFVÆWFRs° ¢–b†6öÆÆV7F–öâÓÓÒæ6öæf–rçF&ÆTæÖRÇÂö&¦V7Bç&÷F÷G—Ræ†4÷vå&÷W'G’æ6ÆÂ‡&V6÷&BÂwv÷&ÆD§6öâr’ÇÂö&¦V7Bç&÷F÷G—Ræ†4÷vå&÷W'G’æ6ÆÂ‡&V6÷&BÂwv÷&ÆEö§6öâr’’°¢–b†—4FVÆWFR’&WGW&ã°¢6öç7B6æ6†÷BÒæ÷&ÖÆ—¦U6æ6†÷E&÷r‡&V6÷&B“°¢–b‚6æ6†÷B’&WGW&ã°¢6öç7B&Wf—6–öâÒçVÖ&W"‡6æ6†÷Bç&Wf—6–öâÇÂ“°¢–b‡&Wf—6–öâbb&Wf—6–öâÂçVÖ&W"„çV’æÆ7E6æ6†÷E&Wf—6–öâÇÂ’’&WGW&ã°¢æ66†Rç6æ6†÷BÒ6æ6†÷C°¢6ö×–ÆTFF‡6æ6†÷BÂ'&’æg&öÒ„æFFçÆ–W%&÷w2çfÇVW2‚’’ÂæFFæ6†E&÷w2ÂæFFæ6öÖ&E'VçF–ÖR“°¢v—B6fT66†R‚“°¢&VæFW$ffV7FVE67&VVç2‡²6æ6†÷C¢G'VRÒ“°¢&WGW&ã°¢Ð ¢–b†6öÆÆV7F–öâÓÓÒæ6öæf–rçÆ–W%F&ÆTæÖRÇÂ&V6÷&BçÆ–W$–BÇÂ&V6÷&BçÆ–W%ö–B’°¢6öç7B&÷rÒæ÷&ÖÆ—¦UÆ–W%&÷r‡&V6÷&B“°¢6öç7BÆ–W$–BÒ7G&–ær‡&÷sòçÆ–W%ö–BÇÂ&V6÷&BçÆ–W$–BÇÂ&V6÷&BçÆ–W%ö–BÇÂrr“°¢–b‚Æ–W$–B’&WGW&ã°¢6öç7B¶æ÷vãÔæFFçÆ–W%&÷w2ævWB‡Æ–W$–B“°¢–b†¶æ÷vâbbçVÖ&W"‡&÷sòçfW'6–öçÇÃ“ÄçVÖ&W"†¶æ÷vâçfW'6–öçÇÃ’—&WGW&ã°¢–b†¶æ÷vâbbçVÖ&W"‡&÷sòçfW'6–öçÇÃ“ÓÓÔçVÖ&W"†¶æ÷vâçfW'6–öçÇÃ’—°¢6öç7B6÷&S×v–æF÷räu%uÆ–W%7–æ46÷&Uc3S°¢6öç7B–æ6öÖ–æuÆ–W#Ö6ö×÷6UÆ–W$§6öäg&öÕ6VvÖVçG2‡&÷r’Æ¶æ÷våÆ–W#Ö6ö×÷6UÆ–W$§6öäg&öÕ6VvÖVçG2†¶æ÷vâ“°¢–b†6÷&RæWVÂ†–æ6öÖ–æuÆ–W"Æ¶æ÷våÆ–W"’—&WGW&ã°¢6öç7B–æ6öÖ–æu7F×ÔFFRç'6R‡&÷sòçWFFVEöGÇÇ&÷sòæ6Æ–VçE÷WFFVEöGÇÂrr’Æ¶æ÷vå7F×ÔFFRç'6R†¶æ÷vãòçWFFVEöGÇÆ¶æ÷vãòæ6Æ–VçE÷WFFVEöGÇÂrr“°¢–b‚çVÖ&W"æ—4f–æ—FR†–æ6öÖ–æu7F×—ÇÂçVÖ&W"æ—4f–æ—FR†¶æ÷vå7F×—ÇÆ–æ6öÖ–æu7F×ÃÖ¶æ÷vå7F×—&WGW&ã°¢Ð¢–b†—4FVÆWFRÇÂ&÷sòæFVÆWFVEöB’æFFçÆ–W%&÷w2ç6WB‡Æ–W$–BÇ²ââç&÷rÆFVÆWFVEöC§&÷sòæFVÆWFVEöGÇÆæWrFFR‚’çFô•4õ7G&–ær‚—Ò“°¢VÇ6RæFFçÆ–W%&÷w2ç6WB‡Æ–W$–BÂ&÷r“°¢æFFçÆ–W'2Ò'V–ÆEÆ–W$Ö„æ66†Rç6æ6†÷BÂ'&’æg&öÒ„æFFçÆ–W%&÷w2çfÇVW2‚’’“°¢v—B6fT66†R‚“°¢&VæFW$ffV7FVE67&VVç2‡²Æ–W'3¢G'VRÒ“°¢&WGW&ã°¢Ð ¢–b†6öÆÆV7F–öâÓÓÒæ6öæf–ræ6†EF&ÆTæÖRÇÂ&V6÷&BæÖW76vT–BÇÂ&V6÷&BæÖW76vUö–B’°¢6öç7B&÷rÒæ÷&ÖÆ—¦T6†E&÷r‡&V6÷&B“°¢6öç7BÖW76vT–BÒ7G&–ær‡&÷sòæÖW76vUö–BÇÂ&V6÷&BæÖW76vT–BÇÂ&V6÷&BæÖW76vUö–BÇÂrr“°¢–b‚ÖW76vT–B’&WGW&ã°¢–b†—4FVÆWFR’æFFæ6†E&÷w2ÒæFFæ6†E&÷w2æf–ÇFW"†—FVÒÓâ7G&–ær†—FVÒæÖW76vUö–B’ÓÒÖW76vT–B“°¢VÇ6RæFFæ6†E&÷w2ÒÖW&vT6†E&÷w2„æFFæ6†E&÷w2Â·&÷uÒ“°¢çV’æÆ7D6†E7F×ÒÖ…WFFVDB„æFFæ6†E&÷w2’ÇÂçV’æÆ7D6†E7F×°¢v—B6fT66†R‚“°¢&VæFW$ffV7FVE67&VVç2‡²6†C¢G'VRÒ“°¢&WGW&ã°¢Ð ¢–b†6öÆÆV7F–öâÓÓÒæ6öæf–ræ6öÖ&E'VçF–ÖUF&ÆTæÖRÇÂö&¦V7Bç&÷F÷G—Ræ†4÷vå&÷W'G’æ6ÆÂ‡&V6÷&BÂw'VçF–ÖT§6öâr’ÇÂö&¦V7Bç&÷F÷G—Ræ†4÷vå&÷W'G’æ6ÆÂ‡&V6÷&BÂw'VçF–ÖUö§6öâr’’°¢6öç7B&÷rÒ—4FVÆWFRòçVÆÂ¢æ÷&ÖÆ—¦T6öÖ&E&÷r‡&V6÷&B“°¢æFFæ6öÖ&E'VçF–ÖRÒ&÷ròFVW‡&÷r’¢çVÆÃ°¢6öç7B7F—fU66VæT–BÒ6öÖ&E&÷t7F—fU66VæT–B„æFFæ6öÖ&E'VçF–ÖR“°¢6öç7B7F—fU'VçF–ÖRÒ6öÖ&E&÷u'VçF–ÖR„æFFæ6öÖ&E'VçF–ÖR“°¢–b†7F—fU66VæT–Bbb7F—fU'VçF–ÖRbbö&¦V7Bæ¶W—2†7F—fU'VçF–ÖR’æÆVæwF‚’æFFæ6öÖ&E'VçF–ÖT'•66VæRç6WB†7F—fU66VæT–BÂFVW†7F—fU'VçF–ÖR’“°¢çV’æÆ7D6öÖ&E7F×Ò&÷sòçWFFVEöBÇÂ&÷sòæ6Æ–VçE÷WFFVEöBÇÂçV’æÆ7D6öÖ&E7F×°¢v—B6fT66†R‚“°¢&VæFW$ffV7FVE67&VVç2‡²6öÖ&C¢G'VRÒ“°¢Ð¢Ð ¢gVæ7F–öâ†æFÆUö6¶WD&6U&VÇF–ÖU–ÆöB†g&ÖR’°¢6öç7BG&ç7÷'DWfVçBÒ7G&–ær†g&ÖSòæWfVçBÇÂrr’çG&–Ò‚“°¢6öç7BWfVçBÒ7G&–ær†g&ÖSòæFFòæ7F–öâÇÂg&ÖSòæ7F–öâÇÂG&ç7÷'DWfVçBÇÂrr’çG&–Ò‚“°¢6öç7B&V6÷&BÒg&ÖSòæFFòç&V6÷&BÇÂg&ÖSòç&V6÷&BÇÂg&ÖSòæFFÇÂçVÆÃ°¢–b‚&V6÷&B’&WGW&ã°¢6öç7B6×–vä–BÒ7G&–ær‡&V6÷&Bæ6×–vä–BÇÂ&V6÷&Bæ6×–våö–BÇÂrr“°¢–b†6×–vä–Bbb6×–vä–BÓÒ7G&–ær„æ6öæf–ræ6×–vä–BÇÂrr’’&WGW&ã°¢6öç7BG&ç7÷'D6öÆÆV7F–öâÒ²v7&VFRrÂwWFFRrÂvFVÆWFRrÂvÖW76vRuÒæ–æ6ÇVFW2‡G&ç7÷'DWfVçBçFôÆ÷vW$66R‚’’òrr¢G&ç7÷'DWfVçC°¢6öç7B6öÆÆV7F–öâÒ7G&–ær†g&ÖSòæFFòæ6öÆÆV7F–öäæÖRÇÂg&ÖSòæFFòæ6öÆÆV7F–öä–BÇÂ&V6÷&Bæ6öÆÆV7F–öäæÖRÇÂ&V6÷&Bæ6öÆÆV7F–öä–BÇÂg&ÖSòæ6öÆÆV7F–öäæÖRÇÂG&ç7÷'D6öÆÆV7F–öâÇÂrr“°¢6öç7B¶W’ÒG¶WfVçGÓ¢G·&V6÷&Bæ–BÇÂrwÓ¢G·&V6÷&BçWFFVBÇÂ&V6÷&BçWFFVEöBÇÂ&V6÷&Bæ6Æ–VçEWFFVDBÇÂrwÖ°¢–b„ç&VÇF–ÖRæWfVçD¶W—2æ†2†¶W’’’&WGW&ã°¢ç&VÇF–ÖRæWfVçD¶W—2æFB†¶W’“°¢–b„ç&VÇF–ÖRæWfVçD¶W—2ç6—¦Râ3’ç&VÇF–ÖRæWfVçD¶W—2æFVÆWFR„ç&VÇF–ÖRæWfVçD¶W—2çfÇVW2‚’ææW‡B‚’çfÇVR“°¢ç&VÇF–ÖRæÆ7DWfVçDBÒFFRææ÷r‚“°¢Ç•&VÇF–ÖU&V6÷&B†6öÆÆV7F–öâÂWfVçBÂ&V6÷&B’æ6F6‚†W'&÷"Óâ6öç6öÆRçv&â‚w&VÇF–ÖRÇ’f–ÆVBrÂW'&÷"’“°¢Ð ¢7–æ2gVæ7F–öâ&W7–æ4gFW%&VÇF–ÖTv‡&V6öâÒw&V6öææV7Br’°¢–b‚ç6W76–öãòçW6W$–BÇÂ†46öæf–r‚’ÇÂæf–vF÷"æöäÆ–æR’&WGW&ã°¢6öç7Bæ÷rÒFFRææ÷r‚“°¢–b†æ÷rÒçVÖ&W"„ç&VÇF–ÖRæÆ7E&W7–æ4BÇÂ’ÂS’&WGW&ã°¢ç&VÇF–ÖRæÆ7E&W7–æ4BÒæ÷s°¢G'’°¢v—BVÆÄWfW'—F†–ær‡²6–ÆVçC¢G'VRÂ&VæFW#¢G'VRÒ“°¢6öç6öÆRæ–æfò‚tu%uõtT%õ$TÅD”ÔUõ$U5”ä2rÂ&V6öâ“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚w&VÇF–ÖR&W7–æ2f–ÆVBrÂ&V6öâÂW'&÷"“°¢Ð¢Ð  ¢7–æ2gVæ7F–öâ7F'Eö6¶WD&6U&VÇF–ÖR‚’°¢6öç7B6öçG&öÆÆW"ÒæWr&÷'D6öçG&öÆÆW"‚“°¢ç&VÇF–ÖRæ&÷'D6öçG&öÆÆW"Ò6öçG&öÆÆW#°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚†G·$&6UW&Â„æ6öæf–r—Òö’÷&VÇF–ÖVÂ²6–væÃ¢6öçG&öÆÆW"ç6–væÂÒ“°¢–b‚&W7öç6Ræö²ÇÂ&W7öç6Ræ&öG’’F‡&÷ræWrW'&÷"†ö6¶WD&6R&VÇF–ÖR…EEG·&W7öç6Rç7FGW7Ö“°¢6öç7B&VFW"Ò&W7öç6Ræ&öG’ævWE&VFW"‚“°¢6öç7BFV6öFW"ÒæWrFW‡DFV6öFW"‚“°¢ÆWB'VffW"Òrs°¢6öç7B7V'67&–&RÒ7–æ26Æ–VçD–BÓâ°¢v—B$fWF6‚„æ6öæf–rÂrö’÷&VÇF–ÖRrÂ°¢ÖWF†öC¢uõ5BrÀ¢§6öã¢²6Æ–VçD–BÂ7V'67&—F–öç3¢°¢G´æ6öæf–rçF&ÆTæÖWÒò¦ÂG´æ6öæf–rçÆ–W%F&ÆTæÖWÒò¦ÂG´æ6öæf–ræ6†EF&ÆTæÖWÒò¦ÂG´æ6öæf–ræ6öÖ&E'VçF–ÖUF&ÆTæÖWÒò¦ ¢ÒÐ¢Ò“°¢6öç7B&V6öææV7BÒç&VÇF–ÖRæ†D6öææV7F–öã°¢ç&VÇF–ÖRæ6öææV7FVBÒG'VS°¢ç&VÇF–ÖRæ†D6öææV7F–öâÒG'VS°¢ç&VÇF–ÖRæÆ7DWfVçDBÒFFRææ÷r‚“°¢–b‡&V6öææV7B’&W7–æ4gFW%&VÇF–ÖTv‚w&V6öææV7Br“°¢Ó°¢6öç7B'6Tg&ÖRÒFW‡BÓâ°¢6öç7BÆ–æW2Ò7G&–ær‡FW‡BÇÂrr’ç7Æ—B‚õÇ#õÆâò“°¢ÆWBWfVçBÒvÖW76vRs°¢6öç7BFFÆ–æW2ÒµÓ°¢Æ–æW2æf÷$V6‚†Æ–æRÓâ°¢–b†Æ–æRç7F'G5v—F‚‚vWfVçC¢r’’WfVçBÒÆ–æRç6Æ–6Rƒb’çG&–Ò‚“°¢–b†Æ–æRç7F'G5v—F‚‚vFF¢r’’FFÆ–æW2çW6‚†Æ–æRç6Æ–6RƒR’çG&–Ò‚’“°¢Ò“°¢6öç7B&rÒFFÆ–æW2æ¦ö–â‚uÆâr“°¢–b‚&r’&WGW&ã°¢ÆWB–ÆöBÒçVÆÃ°¢G'’²–ÆöBÒ¥4ôâç'6R‡&r“²Ò6F6‚²–ÆöBÒ²&rÓ²Ð¢–b†WfVçBÓÓÒu%ô4ôääT5Br’7V'67&–&R‡–ÆöBæ6Æ–VçD–B’æ6F6‚†W'&÷"Óâ6öç6öÆRçv&â‚w"&VÇF–ÖR7V'67&–&Rf–ÆVBrÂW'&÷"’“°¢VÇ6R†æFÆUö6¶WD&6U&VÇF–ÖU–ÆöB‡²WfVçBÂFF¢–ÆöBÒ“°¢Ó°¢v†–ÆR‚6öçG&öÆÆW"ç6–væÂæ&÷'FVB’°¢6öç7B²fÇVRÂFöæRÒÒv—B&VFW"ç&VB‚“°¢–b†FöæR’'&V³°¢'VffW"³ÒFV6öFW"æFV6öFR‡fÇVRÂ²7G&VÓ¢G'VRÒ“°¢6öç7Bg&ÖW2Ò'VffW"ç7Æ—B‚õÇ#õÆåÇ#õÆâò“°¢'VffW"Òg&ÖW2ç÷‚’ÇÂrs°¢g&ÖW2æf÷$V6‚‡'6Tg&ÖR“°¢Ð¢Ò6F6‚†W'&÷"’°¢ç&VÇF–ÖRæ6öææV7FVBÒfÇ6S°¢–b‚6öçG&öÆÆW"ç6–væÂæ&÷'FVB’°¢6öç6öÆRçv&â‚wö6¶WF&6R&VÇF–ÖRf–ÆVBrÂW'&÷"“°¢–b„ç6W76–öãòçW6W$–B’ç&VÇF–ÖRç&V6öææV7EF–ÖW"Ò6WEF–ÖV÷WB‚‚’Óâ7F'E&VÇF–ÖR‚’Â#S“°¢Ð¢Ð¢Ð  ¢gVæ7F–öâ7F'E&VÇF–ÖR‚’°¢7F÷&VÇF–ÖR‚“°¢–b‚†46öæf–r‚’ÇÂç6W76–öãòçW6W$–B’&WGW&ã°¢G'’°¢7F'Eö6¶WD&6U&VÇF–ÖR‚“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚w&VÇF–ÖR–æ—Bf–ÆVBrÂW'&÷"“°¢Ð¢Ð ¢gVæ7F–öâ7F÷&VÇF–ÖR‚’°¢–b„ç&VÇF–ÖRç&V6öææV7EF–ÖW"’6ÆV%F–ÖV÷WB„ç&VÇF–ÖRç&V6öææV7EF–ÖW"“°¢ç&VÇF–ÖRç&V6öææV7EF–ÖW"ÒçVÆÃ°¢ç&VÇF–ÖRæ6öææV7FVBÒfÇ6S°¢G'’²ç&VÇF–ÖRæ&÷'D6öçG&öÆÆW#òæ&÷'B‚“²Ò6F6‚·Ð¢ç&VÇF–ÖRæ&÷'D6öçG&öÆÆW"ÒçVÆÃ°¢Ð ¢gVæ7F–öâ7F'E&VÇF–ÖU7–æ2‚’°¢7F÷&VÇF–ÖR‚“°¢–b‚†46öæf–r‚’ÇÂç6W76–öãòçW6W$–B’&WGW&ã°¢7F'E&VÇF–ÖR‚“°¢Ð ¢gVæ7F–öâ7F÷&VÇF–ÖU7–æ2‚’°¢7F÷&VÇF–ÖR‚“°¢Ð ¢7–æ2gVæ7F–öâÆöv–â‡Æ–W$–BÂ72’°¢6öç7BÆ–W"ÒæFFçÆ–W'2ævWB‡Æ–W$–B“°¢–b‚Æ–W"’F‡&÷ræWrW'&÷"‚}	ý]íÝbÝRÝM]Òr“°¢–b…7G&–ær‡Æ–W"ç&öÆRÇÂrr’ÓÒvwVW7Brbb7G&–ær‡Æ–W"ç72ÇÂrr’ÓÒ7G&–ær‡72ÇÂrr’’F‡&÷ræWrW'&÷"‚}	Ý]-]Ý½’ýí½Âý]íÝmr“°¢ç6W76–öâÒ²W6W$–C¢Æ–W$–BÂ&öÆS¢Æ–W"ç&öÆRÇÂwÆ–W"rÂÆövvVD–äC¢æWrFFR‚’çFô•4õ7G&–ær‚’Ó°¢–b…%TåD”ÔRæ6Æ÷VDöæÇ’bbç&VÖVÖ&W$Æöv–â’v—B6WE&VÖVÖ&W$Æöv–â‡G'VRÂ²W‡FVæC¢G'VRÒ“°¢v—B7F÷&vU6WB„´U•2ç6W76–öâÂç6W76–öâ“°¢÷Vä&ö÷B‚vr“°¢çV’ç67&VVâÒv†öÖRs°¢&VæFW$7W'&VçE67&VVâ‚“°¢7F'E&VÇF–ÖU7–æ2‚“°¢æ÷F–g’†	-]íB-½ýí½Ý]Ó¢G·Æ–W"æF—7Æ”æÖRÇÂÆ–W"æ–GÖÂvö²r“°¢Ð ¢7–æ2gVæ7F–öâÆöv–äwVW7B‚’°¢6öç7BwVW7BÒwVW7E&öf–ÆR‚“°¢æFFçÆ–W'2ç6WB„uTU5Eô”BÂwVW7B“°¢ç6W76–öâÒ²W6W$–C¢uTU5Eô”BÂ&öÆS¢vwVW7BrÂÆövvVD–äC¢æWrFFR‚’çFô•4õ7G&–ær‚’Ó°¢–b…%TåD”ÔRæ6Æ÷VDöæÇ’bbç&VÖVÖ&W$Æöv–â’v—B6WE&VÖVÖ&W$Æöv–â‡G'VRÂ²W‡FVæC¢G'VRÒ“°¢v—B7F÷&vU6WB„´U•2ç6W76–öâÂç6W76–öâ“°¢÷Vä&ö÷B‚vr“°¢çV’ç67&VVâÒv†öÖRs°¢&VæFW$7W'&VçE67&VVâ‚“°¢7F'E&VÇF–ÖU7–æ2‚“°¢æ÷F–g’‚}	=í-]-í’-]íB-½ýí½Ý]ÒrÂvö²r“°¢Ð ¢7–æ2gVæ7F–öâÆöv÷WB‚’°¢7F÷&VÇF–ÖU7–æ2‚“°¢çV’æ6öÖ&DgVÆÇ67&VVâÒfÇ6S°¢ç6W76–öâÒçVÆÃ°¢v—B7F÷&vU&VÖ÷fR„´U•2ç6W76–öâ“°¢÷Vä&ö÷B‚vÆöv–âr“°¢&VæFW$Æöv–â‚“°¢7–æ5&VÖVÖ&W$6öçG&öÇ2‚“°¢Ð ¢7–æ2gVæ7F–öâf÷&vWEF†—4FWf–6R‚’°¢7F÷&VÇF–ÖU7–æ2‚“°¢ç6W76–öâÒçVÆÃ°¢æWF‚Ò²Fö¶Vã¢rrÂW‡—&W4C¢Ó°¢æ6öæf–rÒæ÷&ÖÆ—¦T6öæf–r‡·Ò“°¢æ66†RÒ²6æ6†÷C¢çVÆÂÂÆ–W'3¢µÒÂ6†C¢µÒÂ6öÖ&E'VçF–ÖS¢çVÆÂÂfWF6†VDC¢çVÆÂÓ°¢ç&VÖVÖ&W$Æöv–âÒfÇ6S°¢ç&VÖVÖ&W%VçF–ÂÒ°¢v—B&öÖ—6RæÆÂ…´´U•2æ6öæf–rÂ´U•2æ66†RÂ´U•2ç6W76–öâÂ´U•2æWF‚Â´U•2ç&VÖVÖ&W"Â´U•2ævÆ‡•f–WrÂÔô$”ÄUõ$TEôÔ$´U%5ô´U•ÒæÖ†¶W’Óâ7F÷&vU&VÖ÷fR†¶W’’’“°¢7–æ5&VÖVÖ&W$6öçG&öÇ2‚“°¢÷Vä&ö÷B‚vÆöv–âr“°¢&VæFW$Æöv–â‚“°¢æ÷F–g’‚}
í]ÝÝÝ½’-]íBý]íÝm=M½Òâ
-]]Ý}]­íRýíM­½í}]ÝR-í-Ýí--ò--íÍ-}]­‚ârÂwv&âr“°¢Ð ¢7–æ2gVæ7F–öâ6öÖÖ—EÆ–W$×WFF–öâ†×WFF÷"Â7V66W74ÖW76vR’°¢6öç7BÆ–W"Ò7W'&VçEÆ–W"‚“°¢–b‚Æ–W"’F‡&÷ræWrW'&÷"‚}	ýíM½Â=í­ÝR-½Òr“°¢6öç7B&6U&÷rÒv—B•VÆÅÆ–W"„æ6öæf–rÂÆ–W"æ–B“°¢6öç7BÖW&vVD&6RÒ'V–ÆEÆ–W$Ö„æ66†Rç6æ6†÷BÂ&6U&÷rò¶&6U&÷uÒ¢µÒ’ævWB‡Æ–W"æ–B’ÇÂFVW‡Æ–W"“°¢6öç7BæW‡EÆ–W"ÒFVW†ÖW&vVD&6R“°¢v—B×WFF÷"†æW‡EÆ–W"“°¢6öç7B6VvÖVçG2ÒFV6ö×÷6UÆ–W"†æW‡EÆ–W"“°¢ÆWB6fVC°¢–b‚&6U&÷r’°¢6fVBÒv—B•W6W'EÆ–W"„æ6öæf–rÂ°¢Æ–W%ö–C¢Æ–W"æ–BÀ¢fW'6–öã¢À¢WFFVEö'“¢æ6öæf–ræFWf–6TÆ&VÂÇÂwvV"×Æ–W"rÀ¢ââç6VvÖVçG0¢Ò“°¢ÒVÇ6R°¢6fVBÒv—B•F6…Æ–W%v—F…fW'6–öâ„æ6öæf–rÂÆ–W"æ–BÂçVÖ&W"†&6U&÷rçfW'6–öâÇÂ’Â°¢WFFVEö'“¢æ6öæf–ræFWf–6TÆ&VÂÇÂwvV"×Æ–W"rÀ¢ââç6VvÖVçG0¢Ò“°¢–b‚6fVB’F‡&÷ræWrW'&÷"‚}	­íÝM½­"-]‚-í­‚=í­â	íÝí-‚MÝÝ½R‚ýí--í‚M]--Râr“°¢Ð¢æFFçÆ–W%&÷w2ç6WB‡Æ–W"æ–BÂ6fVB“°¢æFFçÆ–W'2Ò'V–ÆEÆ–W$Ö„æ66†Rç6æ6†÷BÂ'&’æg&öÒ„æFFçÆ–W%&÷w2çfÇVW2‚’’“°¢v—B6fT66†R‚“°¢&VæFW$7W'&VçE67&VVâ‚“°¢æ÷F–g’‡7V66W74ÖW76vRÂvö²r“°¢Ð ¢7–æ2gVæ7F–öâ'W”—FVÒ†—FVÔ–BÂ&–6R’°¢v—B6öÖÖ—EÆ–W$×WFF–öâ‡Æ–W"Óâ°¢6öç7B6÷7BÒçVÖ&W"‡&–6RÇÂ“°¢–b„çVÖ&W"‡Æ–W"æ7&VF—G2ÇÂ’Â6÷7B’F‡&÷ræWrW'&÷"‚}	Ý]Mí--í}Ýâ­]M-í"r“°¢6öç7B66—G’Ò6äFD–çfVçF÷'”—FVÕvV%ccr‡Æ–W"Â—FVÔ–BÂ“°¢–b‚66—G’æö²’F‡&÷ræWrW'&÷"†66—G’ç&V6öâ“°¢Æ–W"æ7&VF—G2ÒçVÖ&W"‡Æ–W"æ7&VF—G2ÇÂ’Ò6÷7C°¢–b‚'&’æ—4'&’‡Æ–W"æ–çfVçF÷'’’’Æ–W"æ–çfVçF÷'’ÒµÓ°¢6öç7BW†—7F–ærÒÆ–W"æ–çfVçF÷'’æf–æB†VçG'’ÓâVçG'’æ—FVÔ–BÓÓÒ—FVÔ–B“°¢–b†W†—7F–ær’W†—7F–ærçG’ÒçVÖ&W"†W†—7F–ærçG’ÇÂ’²°¢VÇ6RÆ–W"æ–çfVçF÷'’çW6‚‡²—FVÔ–BÂG“¢Â÷6—F–öç3¢µÒÒ“°¢ÒÂ}	ýí­=ý­í]Ý]Ý"í½­Rr“°¢Ð ¢7–æ2gVæ7F–öâ6VæDÖW76vR†f÷&Ò’°¢6öç7BF‡&VD¶W’Òf÷&ÒæFF6WBçF‡&VD¶W“°¢6öç7B&öG’Ò7G&–ær†æWrf÷&ÔFF†f÷&Ò’ævWB‚v&öG’r’ÇÂrr’çG&–Ò‚“°¢–b‚F‡&VD¶W’ÇÂ&öG’’&WGW&ã°¢6öç7BF‡&VBÒ'V–ÆEF‡&VG2‚’æf–æB†—FVÒÓâ—FVÒæ¶W’ÓÓÒF‡&VD¶W’“°¢–b‚F‡&VB’F‡&÷ræWrW'&÷"‚}	­Ý²-ý}‚ÝRÝM]Òr“°¢6öç7BÆ–W"Ò7W'&VçEÆ–W"‚“°¢6öç7BÖW76vT–BÒ×6uòG´FFRææ÷r‚’çFõ7G&–ærƒ3b—ÕòG´ÖF‚ç&æFöÒ‚’çFõ7G&–ærƒ3b’ç6Æ–6Rƒ"Âr—Ö°¢6öç7B&÷rÒ°¢ÖW76vUö–C¢ÖW76vT–BÀ¢¶–æC¢F‡&VBçG—RÓÓÒvç2ròvç2r¢vF—&V7BrÀ¢F‡&VEö¶W“¢F‡&VBæ¶W’À¢6VæFW%÷G—S¢wÆ–W"rÀ¢6VæFW%ö–C¢Æ–W"æ–BÀ¢&V6—–VçE÷Æ–W%ö–C¢F‡&VBçG—RÓÓÒvF—&V7BròF‡&VBæ÷F†W$–B¢Æ–W"æ–BÀ¢ç5ö–C¢F‡&VBçG—RÓÓÒvç2ròF‡&VBæç4–B¢çVÆÂÀ¢F—&V7Eö¢F‡&VBçG—RÓÓÒvF—&V7BròÆ–W"æ–B¢çVÆÂÀ¢F—&V7Eö#¢F‡&VBçG—RÓÓÒvF—&V7BròF‡&VBæ÷F†W$–B¢çVÆÂÀ¢WF†÷%öÆ&VÃ¢Æ–W"æF—7Æ”æÖRÇÂÆ–W"æ–BÀ¢&öG•ö‡FÖÃ¢ÇâG¶W62†&öG’—ÓÂ÷æ ¢Ó°¢6öç7B6fVBÒv—B•W6W'D6†B„æ6öæf–rÂ&÷r“°¢æFFæ6†E&÷w2ÒÖW&vT6†E&÷w2„æFFæ6†E&÷w2Â·6fVEÒ“°¢v—B6fT66†R‚“°¢çV’æ6†DG&gG5·F‡&VBæ¶W•ÒÒrs°¢f÷&Òç&W6WB‚“°¢&VæFW$6†B‚“°¢æ÷F–g’‚}
íí]ÝRí-ý-½]ÝârÂvö²r“°¢Ð ¢gVæ7F–öâ&–æDvÆö&ÄWfVçG2‚’°¢Fö7VÖVçBæ&öG’æ6Æ74Æ—7BçFövvÆR‚wvV"Ö6Æ÷VBÖöæÇ’rÂ%TåD”ÔRæ6Æ÷VDöæÇ’“°¢Fö7VÖVçBæ&öG’æ6Æ74Æ—7BçFövvÆR‚wvV"Ö6Æ–VçBÖÖöFRrÂ%TåD”ÔRçvV$6Æ–VçB“°¢–b…%TåD”ÔRæ†–FT6öÖ&B’°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚u¶FF×67&VVãÒ&6öÖ&B%ÒÂ767&VVâÖ6öÖ&Br’æf÷$V6‚†æöFRÓâæöFRç&VÖ÷fR‚’“°¢Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vw'v“¦'F–6ÆRÖÆ–æ²×cƒ2rÂWfVçBÓâ°¢6öç7B'F–6ÆT–BÒ7G&–ær†WfVçBæFWF–Ãòæ'F–6ÆT–BÇÂrr’çG&–Ò‚“°¢–b†'F–6ÆT–B’÷Vä'F–6ÆT'”–B†'F–6ÆT–BÂ²F—&V7D66W73¢G'VRÒ“°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vw'v“¦VçF—G’ÖÆ–æ²×cƒRrÂWfVçBÓâ÷Vä6†&7FW$6†Ecƒb†WfVçBæFWF–ÂÇÂ·Ò’“°¢Fö7VÖVçBæ&öG’æFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢6öç7B'F–6ÆTÆ–æ²ÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚v¶‡&VeÒÂ¶FFÖ'F–6ÆRÖ–EÒÂ¶FFÖ'F–6ÆRÖÆ–æµÒr“°¢6öç7BÆ–æ¶VD'F–6ÆT–BÒ'F–6ÆTÆ–æ°¢ò7G&–ær†'F–6ÆTÆ–æ²æFF6WBæ'F–6ÆT–BÇÂ'F–6ÆTÆ–æ²æFF6WBæ'F–6ÆTÆ–æ²ÇÂÆ–æ¶VD'F–6ÆT–Ecƒ"†'F–6ÆTÆ–æ²ævWDGG&–'WFR‚v‡&Vbr’ÇÂrr’’çG&–Ò‚¢¢rs°¢–b†Æ–æ¶VD'F–6ÆT–B’°¢WfVçBç&WfVçDFVfVÇB‚“°¢÷Vä'F–6ÆT'”–B†Æ–æ¶VD'F–6ÆT–BÂ²F—&V7D66W73¢G'VRÒ“°¢&WGW&ã°¢Ð¢6öç7B6†&7FW$Æ–æ²ÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚v¶‡&VeÒÂ¶FFÖVçF—G’Ö–EÒr“°¢6öç7B6†&7FW%F&vWBÒ6†&7FW$Æ–æ°¢òÆ–æ¶VD6†&7FW%F&vWEcƒb†6†&7FW$Æ–æ²ævWDGG&–'WFR‚v‡&Vbr’ÇÂrrÂ6†&7FW$Æ–æ²¢¢²VçF—G•G—S¢rrÂVçF—G”–C¢rrÓ°¢–b†6†&7FW%F&vWBæVçF—G”–Bbb²wÆ–W"rÂvç2uÒæ–æ6ÇVFW2†6†&7FW%F&vWBæVçF—G•G—R’’°¢WfVçBç&WfVçDFVfVÇB‚“°¢÷Vä6†&7FW$6†Ecƒb†6†&7FW%F&vWB“°¢&WGW&ã°¢Ð¢6öç7B'WGFöâÒWfVçBçF&vWBæ6Æ÷6W7B‚u¶FFÖ7F–öåÒr“°¢–b‚'WGFöâ’&WGW&ã°¢6öç7B7F–öâÒ'WGFöâæFF6WBæ7F–öã°¢–b†7F–öâÓÓÒv&6†—fR×F"r’°¢çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs°¢çV’æF—&V7E&VÆFVDVçF—G•cÒçVÆÃ°¢çV’æ&6†—fUF"Ò'WGFöâæFF6WBçF#°¢çV’æ&6†—fU66÷Ucs’Òw6V7F–öâs°¢çV’æ&6†—fT6FVv÷'•cs’ÒvÆÂs°¢çV’æ&6†—fU7FGW5cs’ÒvÆÂs°¢çV’æ&6†—fUVW'’Òrs°¢çV’ç6VÆV7FVD&6†—fT–BÒrs°¢çV’ç6VÆV7FVD&6†—fUG—RÒrs°¢&VæFW$&6†—fR‚“°¢Ð¢–b†7F–öâÓÓÒw6VÆV7BÖ&6†—fRr’°¢çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs°¢çV’æF—&V7E&VÆFVDVçF—G•cÒçVÆÃ°¢çV’ç6VÆV7FVD&6†—fUG—RÒ'WGFöâæFF6WBçG—S°¢çV’ç6VÆV7FVD&6†—fT–BÒ'WGFöâæFF6WBæ–C°¢&VÖVÖ&W$&6†—fU&V6VçEcs’†'WGFöâæFF6WBçG—RÂ'WGFöâæFF6WBæ–B“°¢–b†'WGFöâæFF6WBçG—RÓÓÒv'F–6ÆRr’Ö&´&6†—fT'F–6ÆU&VB†'WGFöâæFF6WBæ–B“°¢&VæFW$&6†—fR‚“°¢–b‡v–æF÷ræÖF6„ÖVF–‚r†Ö‚×v–GFƒ¢ƒc‚’r’æÖF6†W2’&WVW7Dæ–ÖF–öäg&ÖR‚‚’ÓâFö7VÖVçBçVW'•6VÆV7F÷"‚ræ&6†—fRÖFWF–Â×æRr“òç67&öÆÄ–çFõf–Wr‡²&V†f–÷#¢w6Öö÷F‚rÂ&Æö6³¢w7F'BrÒ’“°¢Ð¢–b†7F–öâÓÓÒv&6†—fRÖff÷&—FR×cs’r’°¢FövvÆT&6†—fTff÷&—FUcs’†'WGFöâæFF6WBçG—RÂ'WGFöâæFF6WBæ–B“°¢&VæFW$&6†—fR‚“°¢Ð¢–b†7F–öâÓÓÒv&6†—fRÖ6ÆV"×cs’r’°¢çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs°¢çV’æ&6†—fUVW'’Òrs°¢&VæFW$&6†—fR‚“°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’ÓâB‚r6&6†—fR×6V&6‚Ö–çWBr“òæfö7W2‚’“°¢Ð¢–b†7F–öâÓÓÒv&6†—fRÖ&6²×cs’r’Fö7VÖVçBçVW'•6VÆV7F÷"‚ræ&6†—fR×6–FV&"r“òç67&öÆÄ–çFõf–Wr‡²&V†f–÷#¢w6Öö÷F‚rÂ&Æö6³¢w7F'BrÒ“°¢–b†7F–öâÓÓÒv÷VâÖ'F–6ÆRr’÷Vä'F–6ÆT'”–B†'WGFöâæFF6WBæ'F–6ÆT–B“°¢–b†7F–öâÓÓÒv÷Vâ×ÆæWBr’÷VåÆæWB†'WGFöâæFF6WBçÆæWD–B“°¢–b†7F–öâÓÓÒv÷Vâ×7—7FVÒr’÷Vå7—7FVÒ†'WGFöâæFF6WBç7—7FVÔ–B“°¢–b†7F–öâÓÓÒv÷Vâ×&VÆFVBÖVçF—G’×cr’÷Vå&VÆFVDVçF—G•vV%c†'WGFöâæFF6WBç&VÆFVEG—RÂ'WGFöâæFF6WBç&VÆFVD–B“°¢–b†7F–öâÓÓÒv÷VâÖ6†&7FW"Ö6†B×cr’÷Vä6†&7FW$6†Ecƒb‡²VçF—G•G—S¢'WGFöâæFF6WBæVçF—G•G—RÂVçF—G”–C¢'WGFöâæFF6WBæVçF—G”–BÒ“°¢–b†7F–öâÓÓÒvfö7W2×7—7FVÒr’fö7W57—7FVÒ†'WGFöâæFF6WBç7—7FVÔ–B“°¢–b†7F–öâÓÓÒvvÆ‡’Ö&6²r’vV$vÆ‡”ÖæW†—E7—7FVÒ‡G'VR“°¢–b†7F–öâÓÓÒvvÆ‡’Ö6VçFW"r’vV$vÆ‡”Öç&V6VçFW"‚“°¢–b†7F–öâÓÓÒvvÆ‡’×7—7FVÒr’vV$vÆ‡”ÖæVçFW%7—7FVÒ†'WGFöâæFF6WBç7—7FVÔ–B“°¢–b†7F–öâÓÓÒvvÆ‡’×ÆæWBr’²çV’ævÆ‡•6VÆV7FVEÆæWD–BÒ'WGFöâæFF6WBçÆæWD–BÇÂrs²&VæFW$vÆ‡”–ç7V7F÷"†'WGFöâæFF6WBç7—7FVÔ–BÂ'WGFöâæFF6WBçÆæWD–B“²Ð¢–b†7F–öâÓÓÒw&öf–ÆRÖ—FVÒr’°¢÷Vå&öf–ÆT—FVÔÖöFÅcc†'WGFöâæFF6WBæ—FVÔ–BÂ²Æ&VÃ¢'WGFöâæFF6WBæ—FVÔÆ&VÂÇÂrrÂG“¢çVÖ&W"†'WGFöâæFF6WBæ—FVÕG’ÇÂ’Ò“°¢Ð¢–b†7F–öâÓÓÒw&öf–ÆRÖ—FVÒÖ6Æ÷6Rr’°¢–b†WfVçBçF&vWBÓÓÒ'WGFöâÇÂWfVçBçF&vWBæ6Æ÷6W7B‚rç&öf–ÆRÖ—FVÒÖÖöFÂÖ6Æ÷6R×ccr’’6Æ÷6U&öf–ÆT—FVÔÖöFÅcc‚“°¢Ð¢–b†7F–öâÓÓÒv'W’Ö—FVÒr’°¢'W”—FVÒ†'WGFöâæFF6WBæ—FVÔ–BÂ'WGFöâæFF6WBç&–6R’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÂvW'"r’“°¢Ð¢–b†7F–öâÓÓÒw6VÆV7B×F‡&VBr’°¢çV’ç6VÆV7FVEF‡&VD¶W’Ò'WGFöâæFF6WBçF‡&VD¶W“°¢÷VåvV$6†DÖ7FW%cc‚†'WGFöâæFF6WBçF‡&VD¶W’“°¢Ð¢–b†7F–öâÓÓÒw6VÆV7BÖ6öÖ&B×66VæRr’°¢çV’ç6VÆV7FVD6öÖ&E66VæT–BÒ'WGFöâæFF6WBç66VæT–C°¢çV’æ6öÖ&DgVÆÇ67&VVâÒG'VS°¢&VæFW$6öÖ&B‚“°¢Ð¢–b†7F–öâÓÓÒv÷VâÖ6öÖ&BÖgVÆÇ67&VVâr’°¢çV’ç6VÆV7FVD6öÖ&E66VæT–BÒ'WGFöâæFF6WBç66VæT–BÇÂçV’ç6VÆV7FVD6öÖ&E66VæT–C°¢çV’æ6öÖ&DgVÆÇ67&VVâÒG'VS°¢&VæFW$6öÖ&B‚“°¢Ð¢–b†7F–öâÓÓÒwFövvÆRÖ6öÖ&BÖgVÆÇ67&VVâr’°¢çV’æ6öÖ&DgVÆÇ67&VVâÒçV’æ6öÖ&DgVÆÇ67&VVã°¢&VæFW$6öÖ&B‚“°¢Ð¢–b†7F–öâÓÓÒwWw&FR×6¶–ÆÂr’°¢Ww&FU6¶–ÆÂ†'WGFöâæFF6WBç6¶–ÆÄ–B’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÂvW'"r’“°¢Ð¢–b†7F–öâÓÓÒwWw&FRÖ&–Æ—G’r’°¢Ww&FT&–Æ—G’†'WGFöâæFF6WBæ&–Æ—G”¶W’’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÂvW'"r’“°¢Ð¢–b†7F–öâÓÓÒw&öf–ÆR×F"r’°¢çV’ç&öf–ÆUF"Ò'WGFöâæFF6WBçF"ÇÂvÖ–âs°¢&VæFW%&öf–ÆR‚“°¢Ð¢–b†7F–öâÓÓÒw6¶–ÆÂ×¦ööÒr’°¢6öç7BÖöFRÒ'WGFöâæFF6WBç¦ööÓ°¢–b†ÖöFRÓÓÒv–âr’çV’ç6¶–ÆÅ¦ööÒÒ6Æ×vV%6¶–ÆÅ¦ööÒ‚„çV’ç6¶–ÆÅ¦ööÒÇÂ’¢ãR“°¢VÇ6R–b†ÖöFRÓÓÒv÷WBr’çV’ç6¶–ÆÅ¦ööÒÒ6Æ×vV%6¶–ÆÅ¦ööÒ‚„çV’ç6¶–ÆÅ¦ööÒÇÂ’òãR“°¢VÇ6RçV’ç6¶–ÆÅ¦ööÒÒ°¢&VæFW%&öf–ÆR‚“°¢Ð¢–b†7F–öâÓÓÒw&öf–ÆR×&Vg&W6‚r’°¢6fU&Vg&W6‚‡²FVfW%&VæFW#¢fÇ6RÒ’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÂvW'"r’“°¢Ð¢–b†7F–öâÓÓÒw&öf–ÆRÖÆöv÷WBr’°¢Æöv÷WB‚’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÂvW'"r’“°¢Ð¢–b†7F–öâÓÓÒw&öf–ÆRÖf÷&vWBÖFWf–6Rr’°¢–b‡v–æF÷ræ6öæf—&Ò‚}
=M½-Âí]ÝÝÝ½’-]íB‚ýÍ]-²ýíM­½í}]ÝòÝ-í=â=-í--òr’’°¢f÷&vWEF†—4FWf–6R‚’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÂvW'"r’“°¢Ð¢Ð¢Ò“° ¢Fö7VÖVçBæ&öG’æFDWfVçDÆ—7FVæW"‚w7V&Ö—BrÂWfVçBÓâ°¢6öç7Bf÷&ÒÒWfVçBçF&vWC°¢–b‚†f÷&Ò–ç7Fæ6Vöb…DÔÄf÷&ÔVÆVÖVçB’’&WGW&ã°¢–b†f÷&Òæ–BÓÓÒvÆöv–âÖf÷&Òr’°¢WfVçBç&WfVçDFVfVÇB‚“°¢6WE&VÖVÖ&W$Æöv–â„&ööÆVâ‚B‚r6Æöv–â×&VÖVÖ&W"ÖÆöv–âr“òæ6†V6¶VB’’çF†Vâ‚‚’ÓâÆöv–â‚B‚r6Æöv–â×Æ–W"r’çfÇVRÂB‚r6Æöv–â×72r’çfÇVR’’æ6F6‚†W'&÷"Óâ°¢B‚r6Æöv–â×7FGW2r’çFW‡D6öçFVçBÒW'&÷"æÖW76vS°¢æ÷F–g’†W'&÷"æÖW76vRÂvW'"r“°¢Ò“°¢Ð¢–b†f÷&Òæ–BÓÓÒv6†BÖ6ö×÷6RÖf÷&Òr’°¢WfVçBç&WfVçDFVfVÇB‚“°¢6VæDÖW76vR†f÷&Ò’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÂvW'"r’“°¢Ð¢Ò“° ¢Fö7VÖVçBæ&öG’æFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ°¢–b†WfVçBçF&vWBæ–BÓÓÒvÆöv–âÖ6×–vâr’²çV’ç6VÆV7FVD6×–vä–BÒWfVçBçF&vWBçfÇVRÇÂvÆÂs²&VæFW$Æöv–â‚“²Ð¢–b†WfVçBçF&vWBæ–BÓÓÒvÆöv–â×Æ–W"r’&VæFW$Æöv–å&Wf–Wr‚“°¢–b†WfVçBçF&vWBæ–BÓÓÒvÆöv–â×&VÖVÖ&W"ÖÆöv–âr’°¢6WE&VÖVÖ&W$Æöv–â„&ööÆVâ†WfVçBçF&vWBæ6†V6¶VB’’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÂvW'"r’“°¢Ð¢–b†WfVçBçF&vWBæ–BÓÓÒv&6†—fR×66÷R×cs’r’°¢çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs°¢çV’æ&6†—fU66÷Ucs’ÒWfVçBçF&vWBçfÇVRÓÓÒvÆÂròvÆÂr¢w6V7F–öâs°¢çV’æ&6†—fT6FVv÷'•cs’ÒvÆÂs°¢&VæFW$&6†—fR‚“°¢Ð¢–b†WfVçBçF&vWBæ–BÓÓÒv&6†—fRÖ6FVv÷'’×cs’r’²çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs²çV’æ&6†—fT6FVv÷'•cs’ÒWfVçBçF&vWBçfÇVRÇÂvÆÂs²&VæFW$&6†—fR‚“²Ð¢–b†WfVçBçF&vWBæ–BÓÓÒv&6†—fR×7FGW2×cs’r’²çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs²çV’æ&6†—fU7FGW5cs’ÒWfVçBçF&vWBçfÇVRÇÂvÆÂs²&VæFW$&6†—fR‚“²Ð¢–b†WfVçBçF&vWBæ–BÓÓÒv&6†—fR×6÷'B×cs’r’²çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs²çV’æ&6†—fU6÷'Ecs’ÒWfVçBçF&vWBçfÇVRÇÂwF—FÆRs²&VæFW$&6†—fR‚“²Ð¢Ò“° ¢Fö7VÖVçBæ&öG’æFDWfVçDÆ—7FVæW"‚v–çWBrÂWfVçBÓâ°¢6öç7B&6†—fU6V&6‚ÒWfVçBçF&vWBæ6Æ÷6W7B‚r6&6†—fR×6V&6‚Ö–çWBr“°¢–b†&6†—fU6V&6‚’°¢çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs°¢çV’æ&6†—fUVW'’Ò&6†—fU6V&6‚çfÇVRÇÂrs°¢&VæFW$&6†—fR‚“°¢6öç7BæW‡BÒB‚r6&6†—fR×6V&6‚Ö–çWBr“°¢–b†æW‡B’²æW‡Bæfö7W2‚“²æW‡Bç6VÆV7F–öå7F'BÒæW‡Bç6VÆV7F–öäVæBÒæW‡BçfÇVRæÆVæwFƒ²Ð¢&WGW&ã°¢Ð¢6öç7BFW‡F&VÒWfVçBçF&vWBæ6Æ÷6W7B‚r66†BÖ6ö×÷6RÖf÷&ÒFW‡F&V¶æÖSÒ&&öG’%Òr“°¢–b‚FW‡F&V’&WGW&ã°¢6öç7Bf÷&ÒÒFW‡F&Væ6Æ÷6W7B‚r66†BÖ6ö×÷6RÖf÷&Òr“°¢6öç7BF‡&VD¶W’Òf÷&ÓòæFF6WBçF‡&VD¶W’ÇÂçV’ç6VÆV7FVEF‡&VD¶W’ÇÂrs°¢–b‡F‡&VD¶W’’çV’æ6†DG&gG5·F‡&VD¶W•ÒÒFW‡F&VçfÇVS°¢Ò“° ¢Fö7VÖVçBæ&öG’æFDWfVçDÆ—7FVæW"‚v¶W–F÷vârÂWfVçBÓâ°¢6öç7BVçG'’ÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚ræ&6†—fRÖVçG'’×cs•¶FFÖ7F–öãÒ'6VÆV7BÖ&6†—fR%Òr“°¢–b‚VçG'’ÇÂWfVçBçF&vWCòæ6Æ÷6W7Còâ‚ræ&6†—fRÖff÷&—FR×cs’r’ÇÂ²tVçFW"rÂruÒæ–æ6ÇVFW2†WfVçBæ¶W’’’&WGW&ã°¢WfVçBç&WfVçDFVfVÇB‚“°¢çV’ç6VÆV7FVD&6†—fUG—RÒVçG'’æFF6WBçG—S°¢çV’ç6VÆV7FVD&6†—fT–BÒVçG'’æFF6WBæ–C°¢çV’æF—&V7D'F–6ÆT–Ecƒ"Òrs°¢&VÖVÖ&W$&6†—fU&V6VçEcs’†VçG'’æFF6WBçG—RÂVçG'’æFF6WBæ–B“°¢–b†VçG'’æFF6WBçG—RÓÓÒv'F–6ÆRr’Ö&´&6†—fT'F–6ÆU&VB†VçG'’æFF6WBæ–B“°¢&VæFW$&6†—fR‚“°¢Ò“° ¢ÆWBÆ7DFW6·F÷Æ–÷WBÒv–æF÷ræÖF6„ÖVF–‚r†Ö–â×v–GFƒ¢“‚’r’æÖF6†W3°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚w&W6—¦RrÂ‚’Óâ°¢–b„çV’ç67&VVâÓÓÒv6öÖ&Br’&WVW7Dæ–ÖF–öäg&ÖR†–æ—D6öÖ&Ef–Ww÷'G2“°¢6öç7BFW6·F÷Æ–÷WBÒv–æF÷ræÖF6„ÖVF–‚r†Ö–â×v–GFƒ¢“‚’r’æÖF6†W3°¢–b„çV’ç67&VVâÓÓÒv†öÖRrbbFW6·F÷Æ–÷WBÓÒÆ7DFW6·F÷Æ–÷WB’&VæFW$7W'&VçE67&VVâ‚“°¢Æ7DFW6·F÷Æ–÷WBÒFW6·F÷Æ–÷WC°¢Ò“° ¢BB‚rææbÖ'Fâr’æf÷$V6‚†'FâÓâ'FâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢çV’ç67&VVâÒ'FâæFF6WBç67&VVã°¢&VæFW$7W'&VçE67&VVâ‚“°¢Ò’“° ¢B‚r6Æöv–âÖwVW7BÖ'Fâr“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢6öç7B6öç6VçBÒB‚r6Æöv–â×&—f7’Ö6öç6VçB×cc‚r“°¢–b†6öç6VçBbb6öç6VçBæ6†V6¶VB’²6öç6VçBç&W÷'EfÆ–F—G“òâ‚“²&WGW&ã²Ð¢6WE&VÖVÖ&W$Æöv–â„&ööÆVâ‚B‚r6Æöv–â×&VÖVÖ&W"ÖÆöv–âr“òæ6†V6¶VB’’çF†Vâ‚‚’ÓâÆöv–äwVW7B‚’’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÂvW'"r’“°¢Ò“° ¢B‚r7vV"×&VÆöBÖ'Fâr“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâv–æF÷ræÆö6F–öâç&VÆöB‚’“° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚wf—6–&–Æ—G–6†ævRrÂ‚’Óâ°¢–b‚Fö7VÖVçBæ†–FFVâbbç6W76–öãòçW6W$–B’°¢–b‚ç&VÇF–ÖRæ6öææV7FVB’7F'E&VÇF–ÖR‚“°¢&W7–æ4gFW%&VÇF–ÖTv‚wf—6–&–Æ—G’×&W7VÖRr“°¢Ð¢Ò“° ¢v–æF÷ræFDWfVçDÆ—7FVæW"‚vöæÆ–æRrÂ‚’Óâ°¢–b‚ç6W76–öãòçW6W$–B’&WGW&ã°¢7F'E&VÇF–ÖR‚“°¢&W7–æ4gFW%&VÇF–ÖTv‚vöæÆ–æRr“°¢Ò“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚vöffÆ–æRrÂ‚’Óâæ÷F–g’…%TåD”ÔRæ6Æ÷VDöæÇ’ò}
]-Âýíý½Â-]Ý­½]Ý"mM"í½­âr¢}
]-Âýíý½Âí-ÍòÝ½í­½ÍÝíÂ­]RrÂwv&âr’“°¢Ð  ¢òòcããC’6×–vâf–Æ&–Æ—G’ÂW&F†VÖW2æBW&Öv&Rf—6–&–Æ—G¢6öç7BU$ôDTe5õcC’Ò°¢²–C¢vÖVF–WfÂrÂæÖS¢}
]MÝ]-]­í-ÍRrÂ6†÷'C¢}

	]	M	Ý	]	-	]	­	í	-
Í	RrÒÀ¢²–C¢v–æGW7G&–ÂrÂæÖS¢}	ÝM=-½ÍÝòrÂ6†÷'C¢}		Ý	M
=

-
			½
Í	Ý	
òrÒÀ¢²–C¢wFV6†æöÆöv–6ÂrÂæÖS¢}
-]]Ýí½í=}ÝòrÂ6†÷'C¢}
-	]
]	Ý	í	½	í	=	
}	Ý	
òrÐ¢Ó°¢6öç7BU$ô”E5õcC’ÒæWr6WB„U$ôDTe5õcC’æÖ†—FVÒÓâ—FVÒæ–B’“°¢gVæ7F–öâæ÷&ÖÆ—¦TW&cC’‡fÇVR’°¢6öç7B&rÒ7G&–ær‡fÇVRÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢–b„U$ô”E5õcC’æ†2‡&r’’&WGW&â&s°¢–b‚ý]GÆÖVF–WgÆfWVFÇÆæ6–VçBòçFW7B‡&r’’&WGW&âvÖVF–WfÂs°¢–b‚ýÝM=-Æ–æGW7G&–ÇÇ7FV×ÆF–W6VÇÆæÆöròçFW7B‡&r’’&WGW&âv–æGW7G&–Âs°¢&WGW&âwFV6†æöÆöv–6Âs°¢Ð¢gVæ7F–öâW&FVecC’‡fÇVR’²6öç7B–CÖæ÷&ÖÆ—¦TW&cC’‡fÇVR“²&WGW&âU$ôDTe5õcC’æf–æB†—FVÓÓæ—FVÒæ–CÓÓÖ–B—ÇÄU$ôDTe5õcC•³%Ó²Ð¢gVæ7F–öâVæ†æ6T6×–våcC’†6×–vâÒ·Ò’°¢6×–vâæW&Òæ÷&ÖÆ—¦TW&cC’†6×–vâæW&ÇÂ6×–vâæWö6‚ÇÂ6×–vâçF†VÖR“°¢–b‚ö&¦V7Bç&÷F÷G—Ræ†4÷vå&÷W'G’æ6ÆÂ†6×–vâÂvf–Æ&ÆTæ÷rr’’°¢6öç7B7FGW2Ò7G&–ær†6×–vâç7FGW2ÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢6×–vâæf–Æ&ÆTæ÷rÒ²wVæf–Æ&ÆRrÂvF—6&ÆVBrÂv–æ7F—fRrÂv6Æ÷6VBrÂv&6†—fVBrÂ}Ý]Mí-=ýÝrÂ}Ý]Mí-=ýÝâuÒæ–æ6ÇVFW2‡7FGW2“°¢ÒVÇ6R6×–vâæf–Æ&ÆTæ÷rÒ6×–vâæf–Æ&ÆTæ÷rÓÒfÇ6S°¢&WGW&â6×–vã°¢Ð¢gVæ7F–öâ6×–vç5cC’‚’²&WGW&â'&’æg&öÒ„æFFæ6×–vç2çfÇVW2‚’’æÖ†Væ†æ6T6×–våcC’’æf–ÇFW"†3Óå7G&–ær†2ç7FGW7ÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br’ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†ææÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"ææÖWÇÆ"æ–B’Âw'Rr’“²Ð¢gVæ7F–öâf–Æ&ÆT6×–vç5cC’‚’²&WGW&â6×–vç5cC’‚’æf–ÇFW"†3Óæ2æf–Æ&ÆTæ÷rÓÖfÇ6R“²Ð¢gVæ7F–öâ6×–våcC’†–B’²6öç7B3ÔæFFæ6×–vç2ævWB…7G&–ær†–GÇÂrr’“²&WGW&â3öVæ†æ6T6×–våcC’†2“¦çVÆÃ²Ð¢gVæ7F–öâ6VÆV7FVD6×–våcC’‚’°¢6öç7BFöÔ–CÕ7G&–ær‚B‚r6Æöv–âÖ6×–vâr“òçfÇVWÇÂrr’çG&–Ò‚“°¢6öç7BV”–CÕ7G&–ær„çV’ç6VÆV7FVD6×–vä–GÇÂrr’çG&–Ò‚“°¢6öç7B6W76–öä–CÕ7G&–ær„ç6W76–öãòæ6×–vä–GÇÂrr’çG&–Ò‚“°¢ÆWB–CÖFöÔ–BÇÂ‡V”–BbbV”–BÓÒvÆÂròV”–B¢rr’ÇÂ6W76–öä–C°¢–b†–Bbb6×–våcC’†–B“òæf–Æ&ÆTæ÷rÓÖfÇ6R’&WGW&â–C°¢&WGW&âf–Æ&ÆT6×–vç5cC’‚•³Óòæ–GÇÂrs°¢Ð¢gVæ7F–öâÇ”W&F†VÖUcC’†6×–vä÷$W&ÒçVÆÂ’°¢6öç7B6×–vâÒG—Vöb6×–vä÷$W&ÓÓÒvö&¦V7Brbf6×–vä÷$W&òVæ†æ6T6×–våcC’†6×–vä÷$W&’¢çVÆÃ°¢6öç7BW&Öæ÷&ÖÆ—¦TW&cC’†6×–vãòæW&ÇÆ6×–vä÷$W&ÇÂwFV6†æöÆöv–6Âr“°¢Fö7VÖVçBæFö7VÖVçDVÆVÖVçBæFF6WBæW&F†VÖSÖW&°¢Fö7VÖVçBæ&öG“òç6WDGG&–'WFR‚vFFÖW&×F†VÖRrÆW&“°¢6öç7BÖWFÖFö7VÖVçBçVW'•6VÆV7F÷"‚vÖWF¶æÖSÒ'F†VÖRÖ6öÆ÷"%Òr“°¢–b†ÖWF’ÖWFæ6öçFVçCÖW&ÓÓÒvÖVF–WfÂsòr3&Rs¦W&ÓÓÒv–æGW7G&–Âsòr3#32s¢r3ƒƒbs°¢6öç7B†–çCÒB‚r6Æöv–âÖ6×–vâÖ†–çBr“°¢–b††–çBbb6×–vâ’†–çBçFW‡D6öçFVçCÖ
Ýýí]¢G¶W&FVecC’†W&’ææÖWÒG¶6×–vâæf–Æ&ÆTæ÷sÓÓÖfÇ6Sòr+r	­ÍýÝò]}Ý]Mí-=ýÝs¢rwÖ°¢&WGW&âW&°¢Ð¢gVæ7F–öâf—6–&–Æ—G•66÷UcC’†VçF—G“×·Ò’°¢6öç7Bf—3ÖVçF—G’çf—6–&–Æ—G’bgG—VöbVçF—G’çf—6–&–Æ—G“ÓÓÒvö&¦V7BsöVçF—G’çf—6–&–Æ—G“§·Ó°¢6öç7BVæ—×cÓä'&’æg&öÒ†æWr6WB‚„'&’æ—4'&’‡b“÷c¥µÒ’æÖ‡ƒÓå7G&–ær‡ƒòæ–GÇÇƒòæ6×–vä–GÇÇ‡ÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ’’“°¢&WGW&â²Æ–W$–G3§Væ—‡f—2çÆ–W$–G2’Â6×–vä–G3§Væ—‡f—2æ6×–vä–G7ÇÇf—2æ6×–vç2’ÂW&–G3§Væ—‡f—2æW&–G7ÇÇf—2æW&7ÇÇf—2æWö6‡2’æÖ†æ÷&ÖÆ—¦TW&cC’’Ó°¢Ð¢gVæ7F–öâ6W76–öä6×–väÆÆ÷vVEcC’‚’°¢–b‚ç6W76–öãòçW6W$–B’&WGW&âfÇ6S°¢–b…7G&–ær„ç6W76–öâç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvwVW7Br’&WGW&âG'VS°¢6öç7BÆ–W#ÔæFFçÆ–W'2ævWB„ç6W76–öâçW6W$–B“°¢6öç7B6×–vä–C×6VÆV7FVD6×–våcC’‚“°¢6öç7B6×–vãÖ6×–våcC’†6×–vä–B“°¢&WGW&â&ööÆVâ‡Æ–W"bb6×–vâbb6×–vâæf–Æ&ÆTæ÷rÓÒfÇ6Rbb6×–vä–G4f÷%Æ–W"‡Æ–W"’æ–æ6ÇVFW2†6×–vä–B’“°¢Ð ¢6öç7Bõö6ö×–ÆTFFW&cC“Ö6ö×–ÆTFF°¢6ö×–ÆTFFÖgVæ7F–öâ‡6æ6†÷BÇÆ–W%&÷w2Æ6†E&÷w2Æ6öÖ&E'VçF–ÖR—°¢6öç7B&W7VÇCÕõö6ö×–ÆTFFW&cC’‡6æ6†÷BÇÆ–W%&÷w2Æ6†E&÷w2Æ6öÖ&E'VçF–ÖR“°¢æFFæ6×–vç2æf÷$V6‚†3ÓæVæ†æ6T6×–våcC’†2’“°¢6öç7B6VÆV7FVC×6VÆV7FVD6×–våcC’‚“°¢–b‡6VÆV7FVB’²çV’ç6VÆV7FVD6×–vä–C×6VÆV7FVC²Ç”W&F†VÖUcC’†6×–våcC’‡6VÆV7FVB’“²Ð¢&WGW&â&W7VÇC°¢Ó° ¢6VÆV7FVDÆöv–ä6×–vä–CÖgVæ7F–öâ‚—²&WGW&â6VÆV7FVD6×–våcC’‚“²Ó°¢6öç7BõöÇ”W&F†VÖUcS#ÖÇ”W&F†VÖUcC“°¢Ç”W&F†VÖUcC“ÖgVæ7F–öâ†6×–vä÷$W&ÖçVÆÂ—¶6öç7BW&ÕõöÇ”W&F†VÖUcS"†6×–vä÷$W&“¶6öç7B†–çCÒB‚r6Æöv–âÖ6×–vâÖ†–çBr“¶–b††–çB–†–çBçFW‡D6öçFVçCÒrs·&WGW&âW&·Ó° ¢6×–vä÷F–öç4Ö&·WÖgVæ7F–öâ‚—°¢6öç7B6VÆV7FVC×6VÆV7FVD6×–våcC’‚“°¢6öç7B&÷w3Ö6×–vç5cC’‚“°¢&WGW&â&÷w2æÖ‡&÷sÓæÆ÷F–öâfÇVSÒ"G¶W62‡&÷ræ–B—Ò"G·&÷ræ–CÓÓ×6VÆV7FVCòw6VÆV7FVBs¢rwÒG·&÷ræf–Æ&ÆTæ÷sÓÓÖfÇ6SòvF—6&ÆVBs¢rwÓâG¶W62‡&÷rææÖWÇÇ&÷ræ–B—Ò+rG¶W62†W&FVecC’‡&÷ræW&’ææÖR—ÒG·&÷ræf–Æ&ÆTæ÷sÓÓÖfÇ6Sòr+r	Ý	]	M	í

-
=	ý	Ý	s¢rwÓÂö÷F–öãæ’æ¦ö–â‚rr—ÇÂsÆ÷F–öâfÇVSÒ"#í	Ý]"Mí-=ýÝ½R­ÍýÝ“Âö÷F–öãâs°¢Ó° ¢&VæFW$Æöv–ãÖgVæ7F–öâ‚—°¢6öç7B6×–vå6VÆV7CÒB‚r6Æöv–âÖ6×–vâr“°¢6öç7BÆ–W%6VÆV7CÒB‚r6Æöv–â×Æ–W"r“°¢–b‚Æ–W%6VÆV7B’&WGW&ã°¢6öç7B&÷w3Ö6×–vç5cC’‚“°¢ÆWB6VÆV7FVC×6VÆV7FVD6×–våcC’‚“°¢–b‚6VÆV7FVGÇÆ6×–våcC’‡6VÆV7FVB“òæf–Æ&ÆTæ÷sÓÓÖfÇ6R’6VÆV7FVCÖf–Æ&ÆT6×–vç5cC’‚•³Óòæ–GÇÂrs°¢çV’ç6VÆV7FVD6×–vä–C×6VÆV7FVC°¢–b†6×–vå6VÆV7B—²6×–vå6VÆV7Bæ–ææW$…DÔÃÖ6×–vä÷F–öç4Ö&·W‚“²–b‡6VÆV7FVB’6×–vå6VÆV7BçfÇVS×6VÆV7FVC²6×–vå6VÆV7BæF—6&ÆVCÒf–Æ&ÆT6×–vç5cC’‚’æÆVæwFƒ²Ð¢6öç7B6×–vãÖ6×–våcC’‡6VÆV7FVB“²–b†6×–vâ’Ç”W&F†VÖUcC’†6×–vâ“²VÇ6RÇ”W&F†VÖUcC’‚wFV6†æöÆöv–6Âr“°¢6öç7BÆ–W'3Ô'&’æg&öÒ„æFFçÆ–W'2çfÇVW2‚’’æf–ÇFW"‡Æ–W#Óå7G&–ær‡Æ–W"ç&öÆWÇÂrr’ÓÒvwVW7Br’æf–ÇFW"‡Æ–W#Óç6VÆV7FVBbf6×–vä–G4f÷%Æ–W"‡Æ–W"’æ–æ6ÇVFW2‡6VÆV7FVB’’ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†æF—7Æ”æÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"æF—7Æ”æÖWÇÆ"æ–B’Âw'Rr’“°¢–b‚6VÆV7FVGÇÂÆ–W'2æÆVæwF‚—²Æ–W%6VÆV7Bæ–ææW$…DÔÃÖÆ÷F–öâfÇVSÒ"#âG·6VÆV7FVCò}	Ý]"Mí-=ýÝ½Rý]íÝm]’s¢}	Ý]"Mí-=ýÝ½R­ÍýÝ’wÓÂö÷F–öãæ²B‚r6Æöv–â×&Wf–Wrr’æ–ææW$…DÔÃÒsÆF—b6Æ73Ò&×WFVB#í	-½]-RMí-=ýÝ=â­ÍýÝââ	ý]íÝm‚Ý]Mí-=ýÝ½R­ÍýÝ’ÝRýí­}½-í-òãÂöF—câs²&WGW&ã²Ð¢6öç7B6fVCÔç6W76–öãòæ6×–vä–CÓÓ×6VÆV7FVBbdç6W76–öãòçW6W$–BbgÆ–W'2ç6öÖR‡Óçæ–CÓÓÔç6W76–öâçW6W$–B“ôç6W76–öâçW6W$–C§Æ–W'5³Òæ–C°¢Æ–W%6VÆV7Bæ–ææW$…DÔÃ×Æ–W'2æÖ‡Æ–W#ÓæÆ÷F–öâfÇVSÒ"G¶W62‡Æ–W"æ–B—Ò#âG¶W62‡Æ–W"æF—7Æ”æÖWÇÇÆ–W"ç6†÷'DæÖWÇÇÆ–W"æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr“°¢Æ–W%6VÆV7BçfÇVS×6fVC²&VæFW$Æöv–å&Wf–Wr‚“°¢Ó° ¢6öç7Bõ÷f—6–&ÆTf÷%Æ–W$W&cC“×f—6–&ÆTf÷%Æ–W#°¢f—6–&ÆTf÷%Æ–W#ÖgVæ7F–öâ†VçF—G’ÇÆ–W$–B—°¢–b‚VçF—G’’&WGW&âfÇ6S°¢–b‚VçF—G’çf—6–&–Æ—G—ÇÇG—VöbVçF—G’çf—6–&–Æ—G’ÓÒvö&¦V7Br’&WGW&âG'VS°¢6öç7Bf—3×f—6–&–Æ—G•66÷UcC’†VçF—G’“°¢–b‚f—2çÆ–W$–G2æÆVæwF‚bbf—2æ6×–vä–G2æÆVæwF‚bbf—2æW&–G2æÆVæwF‚’&WGW&âfÇ6S°¢6öç7B–CÕ7G&–ær‡Æ–W$–GÇÂrr“°¢–b‡f—2çÆ–W$–G2æ–æ6ÇVFW2‡–B’’&WGW&âG'VS°¢–b†—4wVW7E6W76–öâ‚’’&WGW&âf—2çÆ–W$–G2æ–æ6ÇVFW2„uTU5Eô”B—ÇÇf—2çÆ–W$–G2æ–æ6ÇVFW2‚vwVW7Br“°¢6öç7BÆ–W#ÔæFFçÆ–W'2ævWB‡–B—ÇÆçVÆÃ°¢6öç7B7F—fS×6VÆV7FVD6×–våcC’‚“°¢6öç7B6×–vä–G3ÖæWr6WB‡Æ–W#ö6×–vä–G4f÷%Æ–W"‡Æ–W"“¥µÒ“²–b†7F—fR’6×–vä–G2æFB†7F—fR“°¢–b‡f—2æ6×–vä–G2ç6öÖR†–CÓæ6×–vä–G2æ†2…7G&–ær†–B’’’’&WGW&âG'VS°¢6öç7BW&3ÖæWr6WB‚“²6×–vä–G2æf÷$V6‚†–CÓç¶6öç7B3Ö6×–våcC’†–B“¶–b†2–W&2æFB†æ÷&ÖÆ—¦TW&cC’†2æW&’“·Ò“°¢&WGW&âf—2æW&–G2ç6öÖR†–CÓæW&2æ†2†æ÷&ÖÆ—¦TW&cC’†–B’’“°¢Ó° ¢6öç7BõöÆöv–äW&cC“ÖÆöv–ã°¢Æöv–ãÖ7–æ2gVæ7F–öâ‡Æ–W$–BÇ72—°¢6öç7B6×–vä–C×6VÆV7FVD6×–våcC’‚“²6öç7B6×–vãÖ6×–våcC’†6×–vä–B“²6öç7BÆ–W#ÔæFFçÆ–W'2ævWB‡Æ–W$–B“°¢–b‚6×–vçÇÆ6×–vâæf–Æ&ÆTæ÷sÓÓÖfÇ6R’F‡&÷ræWrW'&÷"‚}
Ý-­ÍýÝò]}Ý]Mí-=ýÝr“°¢–b‚Æ–W'ÇÂ6×–vä–G4f÷%Æ–W"‡Æ–W"’æ–æ6ÇVFW2†6×–vä–B’’F‡&÷ræWrW'&÷"‚}	ý]íÝbÝRí-Ýí-ò¢-½ÝÝí’­ÍýÝ‚r“°¢çV’ç6VÆV7FVD6×–vä–CÖ6×–vä–C²Ç”W&F†VÖUcC’†6×–vâ“°¢v—BõöÆöv–äW&cC’‡Æ–W$–BÇ72“°¢ç6W76–öã×²âââ„ç6W76–öçÇÇ·Ò’Æ6×–vä–BÆW&¦æ÷&ÖÆ—¦TW&cC’†6×–vâæW&—Ó°¢v—B7F÷&vU6WB„´U•2ç6W76–öâÄç6W76–öâ“°¢6WEF÷&"‚B‚r767&VVâ×F—FÆRr“òçFW‡D6öçFVçGÇÂ}	-	]	Ý	­	½		]	Ý
"rÂB‚r767&VVâ×7V'F—FÆRr“òçFW‡D6öçFVçGÇÂrr“°¢Ó° ¢6öç7BõöÆöv–äwVW7DW&cC“ÖÆöv–äwVW7C°¢Æöv–äwVW7CÖ7–æ2gVæ7F–öâ‚—°¢6öç7B6VÆV7FVC×6VÆV7FVD6×–våcC’‚“²6öç7B6×–vãÖ6×–våcC’‡6VÆV7FVB“²–b†6×–vâ–Ç”W&F†VÖUcC’†6×–vâ“°¢v—BõöÆöv–äwVW7DW&cC’‚“°¢ç6W76–öã×²âââ„ç6W76–öçÇÇ·Ò’Æ6×–vä–C§6VÆV7FVGÇÂrrÆW&¦6×–vãöæ÷&ÖÆ—¦TW&cC’†6×–vâæW&“¢wFV6†æöÆöv–6ÂwÓ°¢v—B7F÷&vU6WB„´U•2ç6W76–öâÄç6W76–öâ“°¢Ó° ¢6öç7BõöÆöDÆö6Å7FFTW&cC“ÖÆöDÆö6Å7FFS°¢ÆöDÆö6Å7FFSÖ7–æ2gVæ7F–öâ‚—²v—BõöÆöDÆö6Å7FFTW&cC’‚“²–b„ç6W76–öãòæ6×–vä–B”çV’ç6VÆV7FVD6×–vä–CÕ7G&–ær„ç6W76–öâæ6×–vä–B“²Ó° ¢6öç7Bõ÷6WEF÷&$W&cC“×6WEF÷&#°¢6WEF÷&#ÖgVæ7F–öâ‡F—FÆRÇ7V'F—FÆR—°¢õ÷6WEF÷&$W&cC’‡F—FÆRÇ7V'F—FÆR“°¢6öç7B3Ö6×–våcC’‡6VÆV7FVD6×–våcC’‚’“°¢6öç7BÆ&VÃÒB‚r66×–vâÖÆ&VÂr“°¢–b†Æ&VÂbf2’Æ&VÂçFW‡D6öçFVçCÖG¶2ææÖWÇÆ2æ–GÒ+rG¶W&FVecC’†2æW&’ç6†÷'GÖ°¢Ó°   ¢òòcããS"&Vv—7G&F–öâÂ÷&–v–ç2Â&÷fÂ7FFRæBDÒgVÆÂf—6–&–Æ—G¢6öç7B$”Ä•D”U5õcS"Ò°¢²¶W“¢w7G&VæwF‚rÂÆ&VÃ¢}
½rÂ6†÷'C¢}
		²rÒÀ¢²¶W“¢vFW‡FW&—G’rÂÆ&VÃ¢}	½í-­í-ÂrÂ6†÷'C¢}	½	í	"rÒÀ¢²¶W“¢v–çFVÆÆ–vVæ6RrÂÆ&VÃ¢}	Ý-]½½]­"rÂ6†÷'C¢}		Ý
"rÒÀ¢²¶W“¢vVæGW&æ6RrÂÆ&VÃ¢}	-½Ýí½-í-ÂrÂ6†÷'C¢}	-
½	ÒrÒÀ¢²¶W“¢wv–ÆÂrÂÆ&VÃ¢}	-í½òrÂ6†÷'C¢}	-	í	²rÒÀ¢²¶W“¢vvÆ÷'’rÂÆ&VÃ¢}
½-rÂ6†÷'C¢}
	½	rÐ¢Ó°¢gVæ7F–öâ&÷fVEÆ–W%cS"‡Æ–W#×·Ò’°¢&WGW&â7G&–ær‡Æ–W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒrÇÂ7G&–ær‡Æ–W"æ&÷fÅ7FGW7ÇÂv&÷fVBr’çFôÆ÷vW$66R‚“ÓÓÒv&÷fVBs°¢Ð¢gVæ7F–öâ6ö6–Ä÷&–v–ç5cS"‚’²&WGW&âæFFç6ö6–Ä÷&–v–ç2–ç7Fæ6VöbÖòæFFç6ö6–Ä÷&–v–ç2¢æWrÖ‚“²Ð¢gVæ7F–öâvVöw&†–4÷&–v–ç5cS"‚’²&WGW&âæFFævVöw&†–4÷&–v–ç2–ç7Fæ6VöbÖòæFFævVöw&†–4÷&–v–ç2¢æWrÖ‚“²Ð¢gVæ7F–öâ÷&–v–ä&öçW4ÖcS"†÷&–v–ã×·Ò’²&WGW&âö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ‡&÷sÓå·&÷ræ¶W’ÄçVÖ&W"†÷&–v–ãòæ&–Æ—G”&öçW6W3òå·&÷ræ¶W•×ÇÃ•Ò’“²Ð¢gVæ7F–öâÆ–W$÷&–v–ä&öçW6W5cS"‡Æ–W#×·Ò’°¢6öç7B÷WCÔö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ‡&÷sÓå·&÷ræ¶W’ÃÒ’“°¢·6ö6–Ä÷&–v–ç5cS"‚’ævWB…7G&–ær‡Æ–W"ç6ö6–Ä÷&–v–ä–GÇÂrr’’ÆvVöw&†–4÷&–v–ç5cS"‚’ævWB…7G&–ær‡Æ–W"ævVöw&†–4÷&–v–ä–GÇÂrr’•Òæf–ÇFW"„&ööÆVâ’æf÷$V6‚†÷&–v–ãÓä$”Ä•D”U5õcS"æf÷$V6‚‡&÷sÓç¶÷WE·&÷ræ¶W•Ò³ÔçVÖ&W"†÷&–v–ãòæ&–Æ—G”&öçW6W3òå·&÷ræ¶W•×ÇÃ“·Ò’“°¢&WGW&â÷WC°¢Ð¢gVæ7F–öâVffV7F—fT&–Æ—F–W5cS"‡Æ–W#×·Ò’°¢6öç7B&6S×Æ–W"æ&–Æ—G”&6RbgG—VöbÆ–W"æ&–Æ—G”&6SÓÓÒvö&¦V7Bs÷Æ–W"æ&–Æ—G”&6S¢‡Æ–W"æ&–Æ—F–W7ÇÇ·Ò“°¢6öç7B&öçW3×Æ–W$÷&–v–ä&öçW6W5cS"‡Æ–W"“°¢&WGW&âö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ‡&÷sÓå·&÷ræ¶W’ÄçVÖ&W"†&6Sòå·&÷ræ¶W•×ÇÃ’´çVÖ&W"†&öçW5·&÷ræ¶W•×ÇÃ•Ò’“°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÓ×·Ò’°¢6öç7BG—SÕ7G&–ær†—FVÒçG—WÇÂrr’çFôÆ÷vW$66R‚“°¢6öç7BFw3Ô'&’æ—4'&’†—FVÒçFw2“ö—FVÒçFw2æÖ‡FsÓå7G&–ær‡FwÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚’“¥µÓ°¢–b…²w7Fö6²rÂw7Fö6·2rÂw6†&RrÂw6†&W2uÒæ–æ6ÇVFW2‡G—R—ÇÅ7G&–ær†—FVÒæ–GÇÂrr’çFôÆ÷vW$66R‚’ç7F'G5v—F‚‚w7Fö6µòr—ÇÂõí­m‚ƒó¥Ç7ÂB’ö’çFW7B…7G&–ær†—FVÒææÖWÇÂrr’çG&–Ò‚’—ÇÇFw2ç6öÖR‡FsÓå²}­m‚rÂw7Fö6²rÂw7Fö6·2rÂw6†&RrÂw6†&W2uÒæ–æ6ÇVFW2‡Fr’’—&WGW&âw7Fö6²s°¢&WGW&â²wvVöârÂw6†–VÆBrÂvw&VæFRrÂwGW'&WBrÂvG&öæRrÂv&Ö÷"rÂv–×ÆçBuÒæ–æ6ÇVFW2‡G—R“÷G—S¢vvV"s°¢Ð¢gVæ7F–öâVffV7F—fT&Ö÷$6Æ75cS"‡Æ–W#×·Ò’°¢6öç7B&Ö÷$–CÕ7G&–ær‡Æ–W#òæWV—ÖVçE6Æ÷G3òæ&Ö÷'ÇÂrr“°¢6öç7B&Ö÷#ÔæFFæ—FV×2ævWB†&Ö÷$–B“°¢–b†&Ö÷"bfæ÷&ÖÆ—¦VD—FVÕG—UcS"†&Ö÷"“ÓÓÒv&Ö÷"rbdçVÖ&W"†&Ö÷"æ&Ö÷$6Æ77ÇÃ“ã—&WGW&âçVÖ&W"†&Ö÷"æ&Ö÷$6Æ72“°¢&WGW&âçVÖ&W"‡Æ–W#òç7FG3òæ&6T&Ö÷$6Æ77ÇÃ“°¢Ð¢gVæ7F–öâf—6–&ÆT÷&–v–ç5cS"†Ö’²&WGW&â'&’æg&öÒ†ÖçfÇVW2‚’’ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†ææÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"ææÖWÇÆ"æ–B’Âw'Rr’“²Ð ¢6öç7Bõö6ö×–ÆTFFcS#Ö6ö×–ÆTFF°¢6ö×–ÆTFFÖgVæ7F–öâ‡6æ6†÷BÇÆ–W%&÷w2Æ6†E&÷w2Æ6öÖ&E'VçF–ÖR—°¢6öç7B&W7VÇCÕõö6ö×–ÆTFFcS"‡6æ6†÷BÇÆ–W%&÷w2Æ6†E&÷w2Æ6öÖ&E'VçF–ÖR“°¢6öç7Bv÷&ÆC×6æ6†÷Còçv÷&ÆEö§6öçÇÇ·Ó°¢æFFç6ö6–Ä÷&–v–ç3ÖæWrÖ„ö&¦V7BæVçG&–W2‡v÷&ÆBç6ö6–Ä÷&–v–ç3òå4ô4”Åôõ$”t”å7ÇÇ·Ò’æÖ‚…¶–BÇfÇVUÒ“Óå¶–BÆFVW‡fÇVR•Ò’“°¢æFFævVöw&†–4÷&–v–ç3ÖæWrÖ„ö&¦V7BæVçG&–W2‡v÷&ÆBævVöw&†–4÷&–v–ç3òätTôu$„”5ôõ$”t”å7ÇÇ·Ò’æÖ‚…¶–BÇfÇVUÒ“Óå¶–BÆFVW‡fÇVR•Ò’“°¢æFFçÆ–W'2æf÷$V6‚‡Æ–W#Óç°¢–b‚Æ–W"æ&÷fÅ7FGW2—Æ–W"æ&÷fÅ7FGW3Õ7G&–ær‡Æ–W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒsòv&÷fVBs¢v&÷fVBs°¢–b‚Æ–W"ç7FG2—Æ–W"ç7FG3×·Ó°¢–b‡Æ–W"ç7FG2æ&6T&Ö÷$6Æ73ÓÖçVÆÂ—Æ–W"ç7FG2æ&6T&Ö÷$6Æ73Ó°¢–b‚Æ–W"æ&–Æ—G”&6R—Æ–W"æ&–Æ—G”&6SÖFVW‡Æ–W"æ&–Æ—F–W7ÇÇ·Ò“°¢Æ–W"æ&–Æ—F–W3ÖVffV7F—fT&–Æ—F–W5cS"‡Æ–W"“°¢Æ–W"ç7FG2æ&Ö÷$6Æ73ÖVffV7F—fT&Ö÷$6Æ75cS"‡Æ–W"“°¢–b‚'&’æ—4'&’‡Æ–W"æ–ç7FÆÆVD–×ÆçD–G2’—Æ–W"æ–ç7FÆÆVD–×ÆçD–G3ÕµÓ°¢Ò“°¢&WGW&â&W7VÇC°¢Ó° ¢6×–vä÷F–öç4Ö&·WÖgVæ7F–öâ‚—°¢6öç7B6VÆV7FVC×6VÆV7FVD6×–våcC’‚“°¢6öç7B&÷w3Öf–Æ&ÆT6×–vç5cC’‚“°¢&WGW&â&÷w2æÖ‡&÷sÓæÆ÷F–öâfÇVSÒ"G¶W62‡&÷ræ–B—Ò"G·&÷ræ–CÓÓ×6VÆV7FVCòw6VÆV7FVBs¢rwÓâG¶W62‡&÷rææÖWÇÇ&÷ræ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÇÂsÆ÷F–öâfÇVSÒ"#í	Ý]"Mí-=ýÝ½R­ÍýÝ“Âö÷F–öãâs°¢Ó° ¢&VæFW$Æöv–ãÖgVæ7F–öâ‚—°¢6öç7B6×–vå6VÆV7CÒB‚r6Æöv–âÖ6×–vâr“°¢6öç7BÆ–W%6VÆV7CÒB‚r6Æöv–â×Æ–W"r“°¢–b‚Æ–W%6VÆV7B—&WGW&ã°¢6öç7B6×–vç3Öf–Æ&ÆT6×–vç5cC’‚“°¢ÆWB6VÆV7FVC×6VÆV7FVD6×–våcC’‚“°¢–b‚6×–vç2ç6öÖR†3Óæ2æ–CÓÓ×6VÆV7FVB’—6VÆV7FVCÖ6×–vç5³Óòæ–GÇÂrs°¢çV’ç6VÆV7FVD6×–vä–C×6VÆV7FVC°¢–b†6×–vå6VÆV7B—¶6×–vå6VÆV7Bæ–ææW$…DÔÃÖ6×–vä÷F–öç4Ö&·W‚“¶–b‡6VÆV7FVB–6×–vå6VÆV7BçfÇVS×6VÆV7FVC¶6×–vå6VÆV7BæF—6&ÆVCÒ6×–vç2æÆVæwFƒ·Ð¢6öç7B†–çCÒB‚r6Æöv–âÖ6×–vâÖ†–çBr“¶–b††–çB–†–çBçFW‡D6öçFVçCÒrs°¢6öç7B6×–vãÖ6×–våcC’‡6VÆV7FVB“¶–b†6×–vâ–Ç”W&F†VÖUcC’†6×–vâ“¶VÇ6RÇ”W&F†VÖUcC’‚wFV6†æöÆöv–6Âr“°¢6öç7BÆ–W'3Ô'&’æg&öÒ„æFFçÆ–W'2çfÇVW2‚’¢æf–ÇFW"‡Æ–W#Óå7G&–ær‡Æ–W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br¢æf–ÇFW"†&÷fVEÆ–W%cS"¢æf–ÇFW"‡Æ–W#Óå7G&–ær‡Æ–W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒwÇÂ‡6VÆV7FVBbf6×–vä–G4f÷%Æ–W"‡Æ–W"’æ–æ6ÇVFW2‡6VÆV7FVB’’¢ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†æF—7Æ”æÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"æF—7Æ”æÖWÇÆ"æ–B’Âw'Rr’“°¢–b‚6VÆV7FVGÇÂÆ–W'2æÆVæwF‚—·Æ–W%6VÆV7Bæ–ææW$…DÔÃÖÆ÷F–öâfÇVSÒ"#âG·6VÆV7FVCò}	Ý]"Mí-=ýÝ½Rý]íÝm]’s¢}	Ý]"Mí-=ýÝ½R­ÍýÝ’wÓÂö÷F–öãæ²B‚r6Æöv–â×&Wf–Wrr’æ–ææW$…DÔÃÒsÆF—b6Æ73Ò&×WFVB#í	M½ò-]íMMí-=ýÝ²-í½Í­âý]íÝm‚­--Ý½R­ÍýÝ’ÂíMí]ÝÝ½R	M	ÍíÂãÂöF—câs·&WGW&ã·Ð¢6öç7B6fVCÔç6W76–öãòæ6×–vä–CÓÓ×6VÆV7FVBbdç6W76–öãòçW6W$–BbgÆ–W'2ç6öÖR‡Óçæ–CÓÓÔç6W76–öâçW6W$–B“ôç6W76–öâçW6W$–C§Æ–W'5³Òæ–C°¢Æ–W%6VÆV7Bæ–ææW$…DÔÃ×Æ–W'2æÖ‡Æ–W#ÓæÆ÷F–öâfÇVSÒ"G¶W62‡Æ–W"æ–B—Ò#âG¶W62‡Æ–W"æF—7Æ”æÖWÇÇÆ–W"ç6†÷'DæÖWÇÇÆ–W"æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr“°¢Æ–W%6VÆV7BçfÇVS×6fVC·&VæFW$Æöv–å&Wf–Wr‚“°¢Ó° ¢6öç7Bõ÷f—6–&ÆTf÷%Æ–W%cS#×f—6–&ÆTf÷%Æ–W#°¢f—6–&ÆTf÷%Æ–W#ÖgVæ7F–öâ†VçF—G’ÇÆ–W$–B—°¢6öç7BÆ–W#ÔæFFçÆ–W'2ævWB…7G&–ær‡Æ–W$–GÇÂrr’“°¢–b…7G&–ær„ç6W76–öãòç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒwÇÅ7G&–ær‡Æ–W#òç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒr—&WGW&âG'VS°¢&WGW&âõ÷f—6–&ÆTf÷%Æ–W%cS"†VçF—G’ÇÆ–W$–B“°¢Ó° ¢gVæ7F–öâvVöw&†–4÷&–v–ä66W75vV%cc‡Æ–W#×·Ò’°¢6öç7B÷&–v–ãÖvVöw&†–4÷&–v–ç5cS"‚’ævWB…7G&–ær‡Æ–W"ævVöw&†–4÷&–v–ä–GÇÂrr’—ÇÇ·Ó°¢6öç7BÆæWD–G3Ô'&’æg&öÒ†æWr6WB…²âââ†÷&–v–âæÆ–æ¶VEÆæWD–G7ÇÅµÒ’Ââââ†÷&–v–âæw&çFVEÆæWD–G7ÇÅµÒ•ÒæÖ…7G&–ær’æf–ÇFW"„&ööÆVâ’’“°¢6öç7B7—7FVÔ–G3ÖæWr6WB…²âââ†÷&–v–âæw&çFVE7—7FVÔ–G7ÇÅµÒ•ÒæÖ…7G&–ær’æf–ÇFW"„&ööÆVâ’“°¢æFFç7—7FV×2æf÷$V6‚‡7—7FVÓÓç°¢–b‚‡7—7FVÒçÆæWD–G7ÇÅµÒ’ç6öÖR†–CÓçÆæWD–G2æ–æ6ÇVFW2…7G&–ær†–B’’’—7—7FVÔ–G2æFB…7G&–ær‡7—7FVÒæ–GÇÂrr’“°¢Ò“°¢&WGW&â·ÆæWD–G3¦æWr6WB‡ÆæWD–G2’Ç7—7FVÔ–G7Ó°¢Ð¢6öç7Bõ÷f—6–&ÆTf÷%Æ–W%cc×f—6–&ÆTf÷%Æ–W#°¢f—6–&ÆTf÷%Æ–W#ÖgVæ7F–öâ†VçF—G’ÇÆ–W$–B—°¢6öç7BÆ–W#ÔæFFçÆ–W'2ævWB…7G&–ær‡Æ–W$–GÇÂrr’“°¢–b‡Æ–W"be7G&–ær‡Æ–W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒrbe7G&–ær‡Æ–W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br—°¢6öç7B66W73ÖvVöw&†–4÷&–v–ä66W75vV%cc‡Æ–W"“°¢6öç7BVçF—G”–CÕ7G&–ær†VçF—G“òæ–GÇÂrr“°¢–b†VçF—G”–BbdæFFçÆæWG2æ†2†VçF—G”–B’bf66W72çÆæWD–G2æ†2†VçF—G”–B’—&WGW&âG'VS°¢–b†VçF—G”–BbdæFFç7—7FV×2ç6öÖR‡7—7FVÓÓå7G&–ær‡7—7FVÒæ–GÇÂrr“ÓÓÖVçF—G”–B’bf66W72ç7—7FVÔ–G2æ†2†VçF—G”–B’—&WGW&âG'VS°¢Ð¢&WGW&âõ÷f—6–&ÆTf÷%Æ–W%cc†VçF—G’ÇÆ–W$–B“°¢Ó° ¢6W76–öä6×–väÆÆ÷vVEcC“ÖgVæ7F–öâ‚—°¢–b‚ç6W76–öãòçW6W$–B—&WGW&âfÇ6S°¢–b…7G&–ær„ç6W76–öâç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvwVW7Br—&WGW&âG'VS°¢6öç7BÆ–W#ÔæFFçÆ–W'2ævWB„ç6W76–öâçW6W$–B“°¢6öç7B6×–vä–C×6VÆV7FVD6×–våcC’‚“¶6öç7B6×–vãÖ6×–våcC’†6×–vä–B“°¢–b‚Æ–W'ÇÂ6×–vçÇÆ6×–vâæf–Æ&ÆTæ÷sÓÓÖfÇ6WÇÂ&÷fVEÆ–W%cS"‡Æ–W"’—&WGW&âfÇ6S°¢–b…7G&–ær‡Æ–W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒr—&WGW&âG'VS°¢&WGW&â6×–vä–G4f÷%Æ–W"‡Æ–W"’æ–æ6ÇVFW2†6×–vä–B“°¢Ó° ¢Æöv–ãÖ7–æ2gVæ7F–öâ‡Æ–W$–BÇ72—°¢6öç7BÆ–W#ÔæFFçÆ–W'2ævWB‡Æ–W$–B“¶–b‚Æ–W"—F‡&÷ræWrW'&÷"‚}	ý]íÝbÝRÝM]Òr“°¢6öç7B6×–vä–C×6VÆV7FVD6×–våcC’‚“¶6öç7B6×–vãÖ6×–våcC’†6×–vä–B“°¢–b‚6×–vçÇÆ6×–vâæf–Æ&ÆTæ÷sÓÓÖfÇ6R—F‡&÷ræWrW'&÷"‚}
Ý-­ÍýÝò]}Ý]Mí-=ýÝr“°¢–b‚&÷fVEÆ–W%cS"‡Æ–W"’—F‡&÷ræWrW'&÷"…7G&–ær‡Æ–W"æ&÷fÅ7FGW7ÇÂrr“ÓÓÒwVæF–ærsò}	Ý­]-]ímM]"íMí]Ýò	M	Ís¢}	Ý­]-ý]íÝmí-­½íÝ]Ýr“°¢–b…7G&–ær‡Æ–W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒrbb6×–vä–G4f÷%Æ–W"‡Æ–W"’æ–æ6ÇVFW2†6×–vä–B’—F‡&÷ræWrW'&÷"‚}	ý]íÝbÝRí-Ýí-ò¢-½ÝÝí’­ÍýÝ‚r“°¢–b…7G&–ær‡Æ–W"ç&öÆWÇÂrr’ÓÒvwVW7Brbe7G&–ær‡Æ–W"ç77ÇÂrr’ÓÕ7G&–ær‡77ÇÂrr’—F‡&÷ræWrW'&÷"‚}	Ý]-]Ý½’ýí½Âý]íÝmr“°¢çV’ç6VÆV7FVD6×–vä–CÖ6×–vä–C¶Ç”W&F†VÖUcC’†6×–vâ“°¢ç6W76–öã×·W6W$–C§Æ–W$–BÇ&öÆS§Æ–W"ç&öÆWÇÂwÆ–W"rÆÆövvVD–äC¦æWrFFR‚’çFô•4õ7G&–ær‚’Æ6×–vä–BÆW&¦æ÷&ÖÆ—¦TW&cC’†6×–vâæW&—Ó°¢–b…%TåD”ÔRæ6Æ÷VDöæÇ’bdç&VÖVÖ&W$Æöv–â–v—B6WE&VÖVÖ&W$Æöv–â‡G'VRÇ¶W‡FVæC§G'VWÒ“°¢v—B7F÷&vU6WB„´U•2ç6W76–öâÄç6W76–öâ“¶÷Vä&ö÷B‚vr“´çV’ç67&VVãÒv†öÖRs·&VæFW$7W'&VçE67&VVâ‚“·7F'E&VÇF–ÖU7–æ2‚“¶æ÷F–g’†	-]íB-½ýí½Ý]Ó¢G·Æ–W"æF—7Æ”æÖWÇÇÆ–W"æ–GÖÂvö²r“°¢Ó° ¢6öç7Bõ÷&VæFW%&öf–ÆUcS#×&VæFW%&öf–ÆS°¢&VæFW%&öf–ÆSÖgVæ7F–öâ‚—°¢6öç7B&W7VÇCÕõ÷&VæFW%&öf–ÆUcS"‚“°¢6öç7BÆ–W#Ö7W'&VçEÆ–W"‚“¶6öç7B&ö÷CÒB‚r767&VVâ×&öf–ÆRr“¶–b‚Æ–W'ÇÂ&ö÷B—&WGW&â&W7VÇC°¢6öç7B7FDw&–C×&ö÷BçVW'•6VÆV7F÷"‚rç7FBÖw&–Br“°¢–b‡7FDw&–Bbb7FDw&–BçVW'•6VÆV7F÷"‚u¶FFÖ2×cS%Òr’—7FDw&–Bæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÆÆF—b6Æ73Ò'7FB"FFÖ2×cS#ãÆF—b6Æ73Ò&FFÖÆ&VÂ#í	­	ÂöF—cãÆF—b6Æ73Ò&FF×fÇVR#âG¶VffV7F—fT&Ö÷$6Æ75cS"‡Æ–W"—ÓÂöF—cãÂöF—cæ“°¢6öç7B6&C×&ö÷BçVW'•6VÆV7F÷"‚rç&öf–ÆRÖ6&Br“°¢–b†6&Bbb6&BçVW'•6VÆV7F÷"‚u¶FFÖ÷&–v–â×cS%Òr’—°¢6öç7B6ö6–Ã×6ö6–Ä÷&–v–ç5cS"‚’ævWB…7G&–ær‡Æ–W"ç6ö6–Ä÷&–v–ä–GÇÂrr’“¶6öç7BvVóÖvVöw&†–4÷&–v–ç5cS"‚’ævWB…7G&–ær‡Æ–W"ævVöw&†–4÷&–v–ä–GÇÂrr’“°¢6&Bæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÆÆF—b6Æ73Ò&F—f–FW"#ãÂöF—cãÆF—b6Æ73Ò&–æfòÖw&–B"FFÖ÷&–v–â×cS#ãÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#í	ýíM]óÂöF—cãÆF—b6Æ73Ò'b#âG¶W62‡6ö6–ÃòææÖWÇÂ}	ÝR-½Ýr—ÓÂöF—cãÂöF—cãÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#í	ýí]ímM]ÝSÂöF—cãÆF—b6Æ73Ò'b#âG¶W62†vVóòææÖWÇÂ}	ÝR-½Ýâr—ÓÂöF—cãÂöF—cãÂöF—cæ“°¢Ð¢–b‚&ö÷BçVW'•6VÆV7F÷"‚u¶FFÖ–×ÆçG2×cS%Òr’—°¢6öç7B–ç7FÆÆVCÒ‡Æ–W"æ–ç7FÆÆVD–×ÆçD–G7ÇÅµÒ’æÖ†–CÓäæFFæ—FV×2ævWB…7G&–ær†–B’’’æf–ÇFW"„&ööÆVâ’æf–ÇFW"†—FVÓÓææ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÒ“ÓÓÒv–×ÆçBr“°¢&ö÷Bæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÆÇ6V7F–öâ6Æ73Ò'æVÂ"FFÖ–×ÆçG2×cS#ãÆF—b6Æ73Ò'6V7F–öâÖ†VB#ãÆF—cãÆF—b6Æ73Ò&W–V'&÷r#í		Í	ý	½		Ý
-
³ÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
=-Ýí-½]ÝÝ½RÍý½Ý-³ÂöF—cãÂöF—cãÂöF—câG¶–ç7FÆÆVBæÆVæwFƒöÆF—b6Æ73Ò&–æfòÖw&–B#âG¶–ç7FÆÆVBæÖ†—FVÓÓç¶6öç7B&WÖ—FVÒç&WV—&VÖVçG7ÇÇ·Ó¶6öç7B&WFW‡CÔ$”Ä•D”U5õcS"æf–ÇFW"‡&÷sÓäçVÖ&W"‡&W·&÷ræ¶W•×ÇÃ“ã’æÖ‡&÷sÓæG·&÷rç6†÷'GÒG´çVÖ&W"‡&W·&÷ræ¶W•Ò—Ö’æ¦ö–â‚r+rr—ÇÂ}Ý]"s·&WGW&âÆF—b6Æ73Ò&–æfòÖ6&B#ãÆF—b6Æ73Ò&²#âG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂöF—cãÆF—b6Æ73Ò'b#âG´çVÖ&W"†—FVÒæVæW&w•&WV—&VGÇÃ—ÒÝÒãÂöF—cãÆF—b6Æ73Ò&×WFVB#í
-]í-Ýó¢G¶W62‡&WFW‡B—ÓÂöF—cãÂöF—cæ·Ò’æ¦ö–â‚rr—ÓÂöF—cæ¢sÆF—b6Æ73Ò&×WFVB#í	Ý]"=-Ýí-½]ÝÝ½RÍý½Ý-í"ãÂöF—câwÓÂ÷6V7F–öãæ“°¢Ð¢–b…7G&–ær„ç6W76–öãòç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒrbb&ö÷BçVW'•6VÆV7F÷"‚u¶FF×VæF–ærÖÆ–6F–öç2×cS%Òr’—°¢6öç7BVæF–æsÔ'&’æg&öÒ„æFFçÆ–W'2çfÇVW2‚’’æf–ÇFW"‡Óå7G&–ær‡ç&öÆWÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒrbe7G&–ær‡æ&÷fÅ7FGW7ÇÂv&÷fVBr’çFôÆ÷vW$66R‚“ÓÓÒwVæF–ærr’ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†æF—7Æ”æÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"æF—7Æ”æÖWÇÆ"æ–B’Âw'Rr’“°¢6öç7B–æ&÷„W'&÷#Õ7G&–ær„çV’æÆ–6F–öä–æ&÷„W'&÷'ÇÂrr’çG&–Ò‚“°¢&ö÷Bæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÆÇ6V7F–öâ6Æ73Ò'æVÂ"FF×VæF–ærÖÆ–6F–öç2×cS#ãÆF—b6Æ73Ò'6V7F–öâÖ†VB#ãÆF—cãÆF—b6Æ73Ò&W–V'&÷r#í	}	
ý	-	­	‚	ý	]

	í	Ý		m	]	“ÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	}ý-­‚ý]íÝm]“ÂöF—cãÂöF—cãÇ7â6Æ73Ò&6†—#âG·VæF–æræÆVæwF‡ÓÂ÷7ããÂöF—câG¶–æ&÷„W'&÷#öÆF—b6Æ73Ò&æ÷F–6RW'"#í
]-]Ý½’m=Ý²Ý­]"Ý]Mí-=ý]Ó¢G¶W62†–æ&÷„W'&÷"—Òâ
=-Ýí--R]-]Ý½’ÍíM=½Â-]‚ãã“2ãÂöF—cæ§VæF–æræÆVæwFƒöÆF—b6Æ73Ò'7F6²#âG·VæF–æræÖ‡ÓæÆF—b6Æ73Ò&–æfòÖ6&BÆ–6F–öâÖ6&B×cS"#ãÆF—cãÆF—b6Æ73Ò'b#âG¶W62‡æF—7Æ”æÖWÇÇæ–B—ÓÂöF—cãÆF—b6Æ73Ò&×WFVB#âG¶W62‚†6×–vä–G4f÷%Æ–W"‡’æÖ†–CÓäæFFæ6×–vç2ævWB†–B“òææÖWÇÆ–B’æf–ÇFW"„&ööÆVâ’æ¦ö–â‚rÂr’—ÇÂ}	­ÍýÝòÝR=­}Ýr—ÓÂöF—cãÂöF—cãÆF—b6Æ73Ò'&÷r#ãÆ'WGFöâ6Æ73Ò'&–Ö'’6ÖÆÂ"G—SÒ&'WGFöâ"FF×vV"Ö&÷fÂ×cS#Ò&&÷fVB"FF×Æ–W"Ö–CÒ"G¶W62‡æ–B—Ò#í	í	M	í	
	
-
ÃÂö'WGFöããÆ'WGFöâ6Æ73Ò&v†÷7BÖ'Fâ6ÖÆÂ"G—SÒ&'WGFöâ"FF×vV"Ö&÷fÂ×cS#Ò'&V¦V7FVB"FF×Æ–W"Ö–CÒ"G¶W62‡æ–B—Ò#í	í
-	­	½	í	Ý	
-
ÃÂö'WGFöããÂöF—cãÂöF—cæ’æ¦ö–â‚rr—ÓÂöF—cæ¢sÆF—b6Æ73Ò&×WFVB#í	Ýí-½R}ý-í¢Ý]"ãÂöF—câwÓÂ÷6V7F–öãæ“°¢Ð¢&WGW&â&W7VÇC°¢Ó° ¢7–æ2gVæ7F–öâ6WEÆ–W$&÷fÅcS"‡Æ–W$–BÇ7FGW2—°¢–b…7G&–ær„ç6W76–öãòç&öÆWÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒr—F‡&÷ræWrW'&÷"‚}
-]=]-òýíM½Â	M	Ír“°¢6öç7B–CÕ7G&–ær‡Æ–W$–GÇÂrr“¶6öç7B7W'&VçCÔæFFçÆ–W'2ævWB†–B“¶–b‚7W'&VçB—F‡&÷ræWrW'&÷"‚}	Ý­]-ÝRÝM]Ýr“°¢6öç7B6fVCÖv—B•&Wf–WuÆ–W$Æ–6F–öâ„æ6öæf–rÆ–BÇ7FGW2Äç6W76–öâçW6W$–GÇÂvvÒr“°¢æFFçÆ–W%&÷w2ç6WB†–BÇ6fVB“´æFFçÆ–W'3Ö'V–ÆEÆ–W$Ö„æ66†Rç6æ6†÷BÄ'&’æg&öÒ„æFFçÆ–W%&÷w2çfÇVW2‚’’“°¢v—B6fT66†R‚“·&VæFW$7W'&VçE67&VVâ‚“·&VæFW$Æöv–â‚“¶æ÷F–g’‡7FGW3ÓÓÒv&÷fVBsò}	ý]íÝbíMí]Òs¢}	Ý­]-í-­½íÝ]ÝrÂvö²r“°¢Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆ7–æ2WfVçCÓç¶6öç7B'FãÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö&÷fÂ×cS%Òr“¶–b‚'Fâ—&WGW&ã¶'FâæF—6&ÆVC×G'VS·G'—¶v—B6WEÆ–W$&÷fÅcS"†'FâæFF6WBçÆ–W$–BÆ'FâæFF6WBçvV$&÷fÅcS"“·Ö6F6‚†W'&÷"—¶æ÷F–g’†W'&÷"æÖW76vRÂvW'"r“¶'FâæF—6&ÆVCÖfÇ6S·×Ò“° ¢gVæ7F–öâ÷&–v–ä&öçW4&FvW5vV%cSB†÷&–v–ã×·Ò—°¢6öç7B&öçW6W3Ö÷&–v–ä&öçW4ÖcS"†÷&–v–â“¶6öç7B&÷w3Ô$”Ä•D”U5õcS"æf–ÇFW"‡&÷sÓäçVÖ&W"†&öçW6W5·&÷ræ¶W•×ÇÃ’ÓÓ’æÖ‡&÷sÓæÇ7â6Æ73Ò&÷&–v–âÖ&öçW2×cSBG´çVÖ&W"†&öçW6W5·&÷ræ¶W•Ò“ãòw÷6—F—fRs¢væVvF—fRwÒ#âG¶W62‡&÷rç6†÷'B—ÒG´çVÖ&W"†&öçW6W5·&÷ræ¶W•Ò“ãòr²s¢rwÒG´çVÖ&W"†&öçW6W5·&÷ræ¶W•Ò—ÓÂ÷7ãæ“°¢&WGW&â&÷w2æÆVæwFƒ÷&÷w2æ¦ö–â‚rr“¢sÇ7â6Æ73Ò&÷&–v–âÖ&öçW2×cSBæWWG&Â#í	]rÍíMM­-íí#Â÷7ãâs°¢Ð¢gVæ7F–öâvVõG—TÆ&VÅvV%cSB‡G—R—·&WGW&â‡¶6—G“¢}	=ííBrÇÆæWC¢}	ý½Ý]-rÇ&Vv–öã¢}
]=íÒòí½-ÂrÇ7FF–öã¢}
-ÝmòrÆ6öÆöç“¢}	­í½íÝòòýí]½]ÝRrÆ÷F†W#¢}	Í]-âýí]ímM]ÝòwÒ•µ7G&–ær‡G—WÇÂv÷F†W"r•×ÇÂ}	Í]-âýí]ímM]Ýòs·Ð¢gVæ7F–öâ&Vv—7G&F–öä÷&–v–ä6&G5vV%cSB†ÖÆf–VÆDæÖRÆ¶–æB—°¢6öç7B&÷w3×f—6–&ÆT÷&–v–ç5cS"†Ö“¶–b‚&÷w2æÆVæwF‚—&WGW&âsÆF—b6Æ73Ò&÷&–v–âÖV×G’×cSB#í	M	Â]ÝRMí-²-Ý-²M½ò-½íãÂöF—câs°¢&WGW&âÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖw&–B×cSB#âG·&÷w2æÖ†÷&–v–ãÓç¶6öç7B–ÖvSÕ7G&–ær†÷&–v–âæ–ÖvWÇÆ÷&–v–âæ–ÖvTÆö6ÇÇÂrr’çG&–Ò‚“¶6öç7B¶–6¶W#Ö¶–æCÓÓÒw&öfW76–öâsò}	ý
	í
M	]

	
òs¦vVõG—TÆ&VÅvV%cSB†÷&–v–âæÆö6F–öåG—R“¶6öç7B66W75ÆæWG3Ö¶–æCÓÓÒvvVöw&†–2sõ²âââ†÷&–v–âæÆ–æ¶VEÆæWD–G7ÇÅµÒ’Ââââ†÷&–v–âæw&çFVEÆæWD–G7ÇÅµÒ•ÒæÖ†–CÓäæFFçÆæWG2ævWB…7G&–ær†–B’“òææÖWÇÅ7G&–ær†–B’’æf–ÇFW"„&ööÆVâ“¥µÓ·&WGW&âÆÆ&VÂ6Æ73Ò&÷&–v–âÖ6†ö–6RÖ6&B×cSB#ãÆ–çWBG—SÒ'&F–ò"æÖSÒ"G¶f–VÆDæÖWÒ"fÇVSÒ"G¶W62†÷&–v–âæ–B—Ò"&WV—&VBóãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖÖVF–×cSB#âG¶–ÖvSöÆ–Ör7&3Ò"G¶W62†–ÖvR—Ò"ÇCÒ""óæ¦ÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6R×Æ6V†öÆFW"×cSB#âG¶¶–æCÓÓÒw&öfW76–öâsò}	ý
	í
M	]

	
òs¢}	ý
	í	

]	í	m	M	]	Ý		RwÓÂöF—cæÓÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖ&öG’×cSB#ãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖ¶–6¶W"×cSB#âG¶W62†¶–6¶W"—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6R×F—FÆR×cSB#âG¶W62†÷&–v–âææÖWÇÆ÷&–v–âæ–B—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖFW67&—F–öâ×cSB#âG¶W62†÷&–v–âæFW67&—F–öçÇÂ}	íýÝRýí­ÝR}ýí½Ý]Ýâ	M	ÍíÂâr—ÓÂöF—câG¶66W75ÆæWG2æÆVæwFƒöÆF—b6Æ73Ò&×WFVB÷&–v–âÖ66W72Öæ÷FR×cc#í	Mí-=ó¢G¶W62„'&’æg&öÒ†æWr6WB†66W75ÆæWG2’’æ¦ö–â‚r+rr’—ÓÂöF—cæ¢rwÓÆF—b6Æ73Ò&÷&–v–âÖ&öçW6W2×cSB#âG¶÷&–v–ä&öçW4&FvW5vV%cSB†÷&–v–â—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–â×6VÆV7BÖ–æF–6F÷"×cSB#í	-
½	
	
-
ÃÂöF—cãÂöF—cãÂöÆ&VÃæ·Ò’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð¢6öç7B4„$5DU%ô5$TD”ôåô%TDtUEõcccÓ°¢gVæ7F–öâ7&VF–öäW&vV%ccb‡fÇVR—¶6öç7B&sÕ7G&–ær‡fÇVWÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“¶–b‚ý]GÆÖVF–WgÆfWVFÇÆæ6–VçBòçFW7B‡&r’—&WGW&âvÖVF–WfÂs¶–b‚ýÝM=-Æ–æGW7G&–ÇÇ7FV×ÆF–W6VÇÆæÆöròçFW7B‡&r’—&WGW&âv–æGW7G&–Âs·&WGW&âwFV6†æöÆöv–6Âs·Ð¢gVæ7F–öâ7&VF–öä6÷7EvV%ccb†VçF—G“×·Ò—·&WGW&â6Æ×„ÖF‚æÖ‚ƒÄçVÖ&W"†VçF—G’æ7&VF–öä6÷7CóöVçF—G’æ6†&7FW$7&VF–öä6÷7Cóó’’ÃÄ4„$5DU%ô5$TD”ôåô%TDtUEõccb“·Ð¢gVæ7F–öâ7&VF–öåf—6–&–Æ—G•vV%ccb†VçF—G“×·Ò—¶6öç7Bf—3ÖVçF—G“òçf—6–&–Æ—G’bgG—VöbVçF—G’çf—6–&–Æ—G“ÓÓÒvö&¦V7BsöVçF—G’çf—6–&–Æ—G“§·Ó¶6öç7BVæ—×cÓä'&’æg&öÒ†æWr6WB‚„'&’æ—4'&’‡b“÷c¥µÒ’æÖ‡ƒÓå7G&–ær‡ƒòæ–GÇÇƒòæ6×–vä–GÇÇ‡ÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ’’“·&WGW&ç·Æ–W$–G3§Væ—‡f—2çÆ–W$–G2’Æ6×–vä–G3§Væ—‡f—2æ6×–vä–G7ÇÇf—2æ6×–vç2’ÆW&–G3§Væ—‡f—2æW&–G7ÇÇf—2æW&7ÇÇf—2æWö6‡2—Ó·Ð¢gVæ7F–öâ7&VF–öä÷F–öäf–Æ&ÆUvV%ccb†VçF—G“×·ÒÆ6×–vãÖçVÆÂ—°¢–b‚VçF—G—ÇÂ6×–vçÇÆVçF—G’æf–Æ&ÆTæ÷sÓÓÖfÇ6WÇÆVçF—G’æf–Æ&ÆSÓÓÖfÇ6R—&WGW&âfÇ6S°¢6öç7Bf—3Ö7&VF–öåf—6–&–Æ—G•vV%ccb†VçF—G’“¶6öç7B6×–vä–CÕ7G&–ær†6×–vâæ–GÇÂrr“¶6öç7BW&Ö7&VF–öäW&vV%ccb†6×–vâæW&ÇÆ6×–vâæWö6‡ÇÆ6×–vâçF†VÖR“°¢6öç7B6×–väÖF6ƒ×f—2æ6×–vä–G2æ–æ6ÇVFW2†6×–vä–B“¶6öç7BW&ÖF6ƒ×f—2æW&–G2æÖ†7&VF–öäW&vV%ccb’æ–æ6ÇVFW2†W&“°¢–b‡f—2æ6×–vä–G2æÆVæwF‡ÇÇf—2æW&–G2æÆVæwF‚—&WGW&â6×–väÖF6‡ÇÆW&ÖF6ƒ°¢–b‡f—2çÆ–W$–G2æÆVæwF‚—&WGW&âfÇ6S°¢&WGW&âG'VS°¢Ð¢gVæ7F–öâ7&VF–öä÷&–v–å&÷w5vV%ccb†ÖÆ6×–vâ—·&WGW&â'&’æg&öÒ†ÖçfÇVW2‚’’æf–ÇFW"†÷&–v–ãÓæ7&VF–öä÷F–öäf–Æ&ÆUvV%ccb†÷&–v–âÆ6×–vâ’’ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†ææÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"ææÖWÇÆ"æ–B’Âw'Rr’“·Ð¢gVæ7F–öâ&Vv—7G&F–öä÷&–v–ä6&G5vV%ccb†ÖÆf–VÆDæÖRÆ¶–æBÆ6×–vâ—°¢6öç7B&÷w3Ö7&VF–öä÷&–v–å&÷w5vV%ccb†ÖÆ6×–vâ“¶–b‚&÷w2æÆVæwF‚—&WGW&âsÆF—b6Æ73Ò&÷&–v–âÖV×G’×cSB#í	M½ò-½ÝÝí’­ÍýÝ‚Ý]"Mí-=ýÝ½R-Ý-í"ãÂöF—câs°¢&WGW&âÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖw&–B×cSB#âG·&÷w2æÖ†÷&–v–ãÓç¶6öç7B–ÖvSÕ7G&–ær†÷&–v–âæ–ÖvWÇÆ÷&–v–âæ–ÖvTÆö6ÇÇÂrr’çG&–Ò‚“¶6öç7B¶–6¶W#Ö¶–æCÓÓÒw&öfW76–öâsò}	ý
	í
M	]

	
òs¦vVõG—TÆ&VÅvV%cSB†÷&–v–âæÆö6F–öåG—R“¶6öç7B66W75ÆæWG3Ö¶–æCÓÓÒvvVöw&†–2sõ²âââ†÷&–v–âæÆ–æ¶VEÆæWD–G7ÇÅµÒ’Ââââ†÷&–v–âæw&çFVEÆæWD–G7ÇÅµÒ•ÒæÖ†–CÓäæFFçÆæWG2ævWB…7G&–ær†–B’“òææÖWÇÅ7G&–ær†–B’’æf–ÇFW"„&ööÆVâ“¥µÓ·&WGW&âÆÆ&VÂ6Æ73Ò&÷&–v–âÖ6†ö–6RÖ6&B×cSB7&VF–öâÖ6†ö–6RÖ6&B×ccb#ãÆ–çWBG—SÒ'&F–ò"æÖSÒ"G¶f–VÆDæÖWÒ"fÇVSÒ"G¶W62†÷&–v–âæ–B—Ò"&WV—&VBóãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖÖVF–×cSB#âG¶–ÖvSöÆ–Ör7&3Ò"G¶W62†–ÖvR—Ò"ÇCÒ""óæ¦ÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6R×Æ6V†öÆFW"×cSB#âG¶¶–æCÓÓÒw&öfW76–öâsò}	ý
	í
M	]

	
òs¢}	ý
	í	

]	í	m	M	]	Ý		RwÓÂöF—cæÓÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖ&öG’×cSB#ãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖ¶–6¶W"×cSB#âG¶W62†¶–6¶W"—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6R×F—FÆR×cSB#âG¶W62†÷&–v–âææÖWÇÆ÷&–v–âæ–B—ÓÂöF—cãÆF—b6Æ73Ò&7&VF–öâÖ6÷7BÖ&FvR×ccb#âG¶7&VF–öä6÷7EvV%ccb†÷&–v–â—Ò	í
}	¢ãÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖFW67&—F–öâ×cSB#âG¶W62†÷&–v–âæFW67&—F–öçÇÂ}	íýÝRýí­ÝR}ýí½Ý]Ýâ	M	ÍíÂâr—ÓÂöF—câG¶66W75ÆæWG2æÆVæwFƒöÆF—b6Æ73Ò&×WFVB÷&–v–âÖ66W72Öæ÷FR×cc#í	Mí-=ó¢G¶W62„'&’æg&öÒ†æWr6WB†66W75ÆæWG2’’æ¦ö–â‚r+rr’—ÓÂöF—cæ¢rwÓÆF—b6Æ73Ò&÷&–v–âÖ&öçW6W2×cSB#âG¶÷&–v–ä&öçW4&FvW5vV%cSB†÷&–v–â—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–â×6VÆV7BÖ–æF–6F÷"×cSB#í	-
½	
	
-
ÃÂöF—cãÂöF—cãÂöÆ&VÃæ·Ò’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð¢gVæ7F–öâ7F'F–ætWV—ÖVçE&÷w5vV%ccb†6×–vâ—·&WGW&â'&’æg&öÒ„æFFæ—FV×2çfÇVW2‚’’æf–ÇFW"†—FVÓÓâ†—FVÒæf–Æ&ÆT57F'F–æsÓÓ×G'VWÇÅ7G&–ær†—FVÒæf–Æ&ÆT57F'F–æwÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒwG'VRr’bf7&VF–öä÷F–öäf–Æ&ÆUvV%ccb†—FVÒÆ6×–vâ’’ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†ææÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"ææÖWÇÆ"æ–B’Âw'Rr’“·Ð¢gVæ7F–öâ7F'F–ætWV—ÖVçEG—UvV%ccb†—FVÓ×·Ò—¶6öç7BG—SÖæ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÒ“·&WGW&â‡·vVöã¢}	í=mRrÇ6†–VÆC¢}
-²rÆw&VæFS¢}	=Ý-rÇGW'&WC¢}
-=]½ÂrÆG&öæS¢}	MíÒrÆ&Ö÷#¢}	íÝòrÆ–×ÆçC¢}	Íý½Ý"rÇ7Fö6³¢}	­m‚wÒ•·G—U×ÇÂ}
Ýým]ÝRs·Ð¢gVæ7F–öâ7F'F–ætWV—ÖVçD6&G5vV%ccb†6×–vâ—¶6öç7B&÷w3×7F'F–ætWV—ÖVçE&÷w5vV%ccb†6×–vâ“¶–b‚&÷w2æÆVæwF‚—&WGW&âsÆF—b6Æ73Ò&÷&–v–âÖV×G’×cSB#í	M½òÝ-í’­ÍýÝ‚Ý]"ý]MÍ]-í"Âí-Í]}]ÝÝ½R­¢--í-½RãÂöF—câs·&WGW&âÆF—b6Æ73Ò'7F'F–ærÖWV—ÖVçBÖw&–B×ccb#âG·&÷w2æÖ†—FVÓÓæÆF—b6Æ73Ò'7F'F–ærÖWV—ÖVçBÖ6&B×ccb"FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6&B×cs"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"&öÆSÒ&'WGFöâ"F&–æFWƒÒ#"&–×&W76VCÒ&fÇ6R#ãÆ–çWBG—SÒ&6†V6¶&÷‚"æÖSÒ'7F'F–ætWV—ÖVçD–G2"fÇVSÒ"G¶W62†—FVÒæ–B—Ò"†–FFVâóâG·&VæFW$VçF—G•F‡VÖ"†—FVÒ—ÓÇ7â6Æ73Ò'7F'F–ærÖWV—ÖVçBÖ6÷’×ccb#ãÆ#âG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂö#ãÇ6ÖÆÃâG¶W62‡7F'F–ætWV—ÖVçEG—UvV%ccb†—FVÒ’—ÒG¶—FVÒç&&—G“ö+rG¶W62†—FVÒç&&—G’—Ö¢rwÓÂ÷6ÖÆÃãÇ6ÖÆÃâG¶W62†—FVÒæFW67ÇÂrr—ÓÂ÷6ÖÆÃãÂ÷7ããÇ7â6Æ73Ò&7&VF–öâÖ6÷7BÖ&FvR×ccb#âG¶7&VF–öä6÷7EvV%ccb†—FVÒ—Ò	í
}	¢ãÂ÷7ããÇ7â6Æ73Ò'7F'F–ærÖWV—ÖVçB×6VÆV7FVB×cs"#í	-
½	
		Ý	ãÂ÷7ããÂöF—cæ’æ¦ö–â‚rr—ÓÂöF—cæ·Ð¢gVæ7F–öâ÷Vå7F'F–ætWV—ÖVçDÖöFÅvV%cs"†—FVÔ–B—¶6öç7Bf÷&ÓÖFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv—7FW"Öf÷&Ò×cS"r“¶6öç7B—FVÓÔæFFæ—FV×2ævWB…7G&–ær†—FVÔ–GÇÂrr’“¶6öç7B–çWCÖf÷&ÓòçVW'•6VÆV7F÷"†¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Õ·fÇVSÒ"G´552æW66R…7G&–ær†—FVÔ–GÇÂrr’—Ò%Ö“¶–b‚—FV×ÇÂ–çWB—&WGW&ã¶÷Vå&öf–ÆT—FVÔÖöFÅcc†—FVÒæ–BÇ¶Æ&VÃ¢}
--í-íRÝým]ÝRrÇ&Vv—7G&F–öäWV—ÖVçC§G'VRÇ6VÆV7FVC¤&ööÆVâ†–çWBæ6†V6¶VB’Æ7&VF–öä6÷7C¦7&VF–öä6÷7EvV%ccb†—FVÒ—Ò“·Ð¢gVæ7F–öâ7&VF–öå6VÆV7F–öåvV%ccb†f÷&Ò—¶6öç7B6×–vä–CÕ7G&–ær†f÷&ÓòæVÆVÖVçG3òæ6×–vä–CòçfÇVWÇÂrr“¶6öç7B6×–vãÖ6×–våcC’†6×–vä–B“¶6öç7B6ö6–Ä–CÕ7G&–ær†f÷&ÓòçVW'•6VÆV7F÷"‚u¶æÖSÒ'6ö6–Ä÷&–v–ä–B%Ó¦6†V6¶VBr“òçfÇVWÇÂrr“¶6öç7BvVô–CÕ7G&–ær†f÷&ÓòçVW'•6VÆV7F÷"‚u¶æÖSÒ&vVöw&†–4÷&–v–ä–B%Ó¦6†V6¶VBr“òçfÇVWÇÂrr“¶6öç7B&öfW76–öã×6ö6–Ä÷&–v–ç5cS"‚’ævWB‡6ö6–Ä–B—ÇÆçVÆÃ¶6öç7BvVöw&†–3ÖvVöw&†–4÷&–v–ç5cS"‚’ævWB†vVô–B—ÇÆçVÆÃ¶6öç7BWV—ÖVçD–G3Ô'&’æg&öÒ†æWr6WB„'&’æg&öÒ†f÷&ÓòçVW'•6VÆV7F÷$ÆÂ‚u¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Ó¦6†V6¶VBr—ÇÅµÒ’æÖ†ãÓå7G&–ær†âçfÇVR’’æf–ÇFW"„&ööÆVâ’’“¶6öç7BWV—ÖVçCÖWV—ÖVçD–G2æÖ†–CÓäæFFæ—FV×2ævWB†–B’’æf–ÇFW"„&ööÆVâ“¶6öç7BF÷FÃÖ7&VF–öä6÷7EvV%ccb‡&öfW76–öâ’¶7&VF–öä6÷7EvV%ccb†vVöw&†–2’¶WV—ÖVçBç&VGV6R‚‡7VÒÆ—FVÒ“Óç7VÒ¶7&VF–öä6÷7EvV%ccb†—FVÒ’Ã“·&WGW&ç¶6×–vâÇ&öfW76–öâÆvVöw&†–2ÆWV—ÖVçBÆWV—ÖVçD–G2ÇF÷FÇÓ·Ð¢gVæ7F–öâWFFT7&VF–öä'VFvWEvV%ccb†f÷&Ò—¶–b‚f÷&Ò—&WGW&ã¶6öç7B6VÆV7F–öãÖ7&VF–öå6VÆV7F–öåvV%ccb†f÷&Ò“¶6öç7BæöFSÖf÷&ÒçVW'•6VÆV7F÷"‚u¶FFÖ7&VF–öâÖ'VFvWB×cceÒr“¶6öç7B7V&Ö—CÖf÷&ÒçVW'•6VÆV7F÷"‚u·G—SÒ'7V&Ö—B%Òr“¶6öç7B&VÖ–æ–æsÔ4„$5DU%ô5$TD”ôåô%TDtUEõccb×6VÆV7F–öâçF÷FÃ¶f÷&ÒçVW'•6VÆV7F÷$ÆÂ‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6&B×cs%Òr’æf÷$V6‚†6&CÓç¶6öç7B–çWCÖ6&BçVW'•6VÆV7F÷"‚u¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Òr“¶6&Bç6WDGG&–'WFR‚v&–×&W76VBrÅ7G&–ær„&ööÆVâ†–çWCòæ6†V6¶VB’’“·Ò“¶–b†æöFR—¶æöFRçFW‡D6öçFVçCÖ	ýí-}]Ýã¢G·6VÆV7F–öâçF÷FÇÒòG´4„$5DU%ô5$TD”ôåô%TDtUEõccgÒ+rG·&VÖ–æ–æsãÓö	í-½íÃ¢G·&VÖ–æ–æwÖ¦	ý	]
	]
	

]	í	C¢G´ÖF‚æ'2‡&VÖ–æ–ær—ÖÖ¶æöFRæ6Æ74Æ—7BçFövvÆR‚v÷fW"Ö'VFvWBrÇ&VÖ–æ–æsÃ“·Ö–b‡7V&Ö—B—7V&Ö—BæF—6&ÆVC×&VÖ–æ–æsÃ·Ð¢gVæ7F–öâ&Vg&W6…&Vv—7G&F–öä6†ö–6W5vV%ccb†f÷&Ò—¶–b‚f÷&Ò—&WGW&ã¶6öç7B6×–vãÖ6×–våcC’…7G&–ær†f÷&ÒæVÆVÖVçG3òæ6×–vä–CòçfÇVWÇÂrr’—ÇÆf–Æ&ÆT6×–vç5cC’‚•³×ÇÆçVÆÃ¶6öç7B&We6ö6–ÃÖf÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ'6ö6–Ä÷&–v–ä–B%Ó¦6†V6¶VBr“òçfÇVWÇÂrs¶6öç7B&WdvVóÖf÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ&vVöw&†–4÷&–v–ä–B%Ó¦6†V6¶VBr“òçfÇVWÇÂrs¶6öç7B&Wd—FV×3ÖæWr6WB„'&’æg&öÒ†f÷&ÒçVW'•6VÆV7F÷$ÆÂ‚u¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Ó¦6†V6¶VBr’’æÖ†ãÓæâçfÇVR’“¶6öç7BÖf÷&ÒçVW'•6VÆV7F÷"‚u¶FF×&Vv—7G&F–öâ×&öfW76–öç2×cceÒr’ÆsÖf÷&ÒçVW'•6VÆV7F÷"‚u¶FF×&Vv—7G&F–öâÖ÷&–v–ç2×cceÒr’ÆSÖf÷&ÒçVW'•6VÆV7F÷"‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçB×cceÒr“¶–b‡—æ–ææW$…DÔÃ×&Vv—7G&F–öä÷&–v–ä6&G5vV%ccb‡6ö6–Ä÷&–v–ç5cS"‚’Âw6ö6–Ä÷&–v–ä–BrÂw&öfW76–öârÆ6×–vâ“¶–b†r–ræ–ææW$…DÔÃ×&Vv—7G&F–öä÷&–v–ä6&G5vV%ccb†vVöw&†–4÷&–v–ç5cS"‚’ÂvvVöw&†–4÷&–v–ä–BrÂvvVöw&†–2rÆ6×–vâ“¶–b†R–Ræ–ææW$…DÔÃ×7F'F–ætWV—ÖVçD6&G5vV%ccb†6×–vâ“¶–b‡&We6ö6–Â—¶6öç7BƒÖf÷&ÒçVW'•6VÆV7F÷"†¶æÖSÒ'6ö6–Ä÷&–v–ä–B%Õ·fÇVSÒ"G´552æW66R‡&We6ö6–Â—Ò%Ö“¶–b‡‚—‚æ6†V6¶VC×G'VS·Ö–b‡&WdvVò—¶6öç7BƒÖf÷&ÒçVW'•6VÆV7F÷"†¶æÖSÒ&vVöw&†–4÷&–v–ä–B%Õ·fÇVSÒ"G´552æW66R‡&WdvVò—Ò%Ö“¶–b‡‚—‚æ6†V6¶VC×G'VS·×&Wd—FV×2æf÷$V6‚†–CÓç¶6öç7BƒÖf÷&ÒçVW'•6VÆV7F÷"†¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Õ·fÇVSÒ"G´552æW66R†–B—Ò%Ö“¶–b‡‚—‚æ6†V6¶VC×G'VS·Ò“·WFFT7&VF–öä'VFvWEvV%ccb†f÷&Ò“·Ð¢gVæ7F–öâfÆ–FFU&Vv—7G&F–öå6VÆV7F–öåvV%ccb†f÷&Ò—¶6öç7B6VÃÖ7&VF–öå6VÆV7F–öåvV%ccb†f÷&Ò“¶–b‚6VÂæ6×–vçÇÇ6VÂæ6×–vâæf–Æ&ÆTæ÷sÓÓÖfÇ6R—&WGW&ç¶ö³¦fÇ6RÆÖW76vS¢}	­ÍýÝòÝ]Mí-=ýÝârÂââç6VÇÓ¶–b‚6VÂç&öfW76–öçÇÂ7&VF–öä÷F–öäf–Æ&ÆUvV%ccb‡6VÂç&öfW76–öâÇ6VÂæ6×–vâ’—&WGW&ç¶ö³¦fÇ6RÆÖW76vS¢}	-½]-RMí-=ýÝ=âýíM]âârÂââç6VÇÓ¶–b‚6VÂævVöw&†–7ÇÂ7&VF–öä÷F–öäf–Æ&ÆUvV%ccb‡6VÂævVöw&†–2Ç6VÂæ6×–vâ’—&WGW&ç¶ö³¦fÇ6RÆÖW76vS¢}	-½]-RMí-=ýÝíRýí]ímM]ÝRârÂââç6VÇÓ¶–b‡6VÂæWV—ÖVçBç6öÖR†—FVÓÓâ†—FVÒæf–Æ&ÆT57F'F–æsÓÓ×G'VWÇÅ7G&–ær†—FVÒæf–Æ&ÆT57F'F–æwÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒwG'VRr—ÇÂ7&VF–öä÷F–öäf–Æ&ÆUvV%ccb†—FVÒÇ6VÂæ6×–vâ’’—&WGW&ç¶ö³¦fÇ6RÆÖW76vS¢}
ýí¢--í-í=âÝým]Ýò}Í]Ý½òâ	-½]-Rý]MÍ]-²}Ýí-âârÂââç6VÇÓ¶–b‡6VÂçF÷FÃä4„$5DU%ô5$TD”ôåô%TDtUEõccb—&WGW&ç¶ö³¦fÇ6RÆÖW76vS¦	ý]-½]ÒíMm]"í}MÝó¢G·6VÂçF÷FÇÒòG´4„$5DU%ô5$TD”ôåô%TDtUEõccgÒæÂââç6VÇÓ¶6öç7B7F'FW#Ö'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccr‡¶–çfVçF÷'•6—¦S£"Æ6''•vV–v‡DÖƒ£"ÆWV—ÖVçE6Æ÷G3§·&–Ö'•vVöã¢rrÇ6V6öæF'•vVöã¢rrÆ&Ö÷#¢rwÒÆ–×ÆçE6Æ÷D6÷VçC£Æ–×ÆçE6Æ÷G3¥µÒÆ–çfVçF÷'“§6VÂæWV—ÖVçD–G2æÖ†—FVÔ–CÓâ‡¶—FVÔ–BÇG“£Ç÷6—F–öç3¥µ×Ò’—Ò“¶–b‡7F'FW"çvV–v‡Cã"³RÓ’—&WGW&ç¶ö³¦fÇ6RÆÖW76vS¦
--í-íRÝým]ÝR½­íÂ-ým½íS¢G·7F'FW"çvV–v‡BçFôf—†VBƒ—Òò"æÂââç6VÇÓ¶–b‡7F'FW"æ÷fW&fÆ÷ræÆVæwF‚—&WGW&ç¶ö³¦fÇ6RÆÖW76vS¢}
--í-íRÝým]ÝRÝRýíÍ]]-ò"-ÝM-Ý½’Ý-]Ý-ÂÝ"­½]-í¢ârÂââç6VÇÓ·&WGW&ç¶ö³§G'VRÂââç6VÇÓ·Ð¢gVæ7F–öâ&Vv—7G&F–öäÖ&·WcS"‚—°¢6öç7B6×–vç3Öf–Æ&ÆT6×–vç5cC’‚“¶6öç7B&VfW'&VCÕ7G&–ær„çV“òç6VÆV7FVD6×–vä–GÇÇ6VÆV7FVD6×–våcC’‚—ÇÂrr“¶6öç7B6×–vãÖ6×–vç2æf–æB†3Óå7G&–ær†2æ–B“ÓÓ×&VfW'&VB—ÇÆ6×–vç5³×ÇÆçVÆÃ°¢&WGW&âÆF—b6Æ73Ò'&Vv—7G&F–öâ×v–æF÷r×cSB"&öÆSÒ&F–Æör"&–ÖÖöFÃÒ'G'VR"&–ÖÆ&VÆÆVF'“Ò'&Vv—7FW"×F—FÆR×cSB#ãÆF—b6Æ73Ò'&Vv—7G&F–öâÖ6&B×cS"#ãÆF—b6Æ73Ò'&Vv—7G&F–öâ×7F–6·’Ö†VB×cSB6V7F–öâÖ†VB#ãÆF—cãÆF—b6Æ73Ò&W–V'&÷r#í		Ý	­	]
-		ý	]

	í	Ý		m	ÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR"–CÒ'&Vv—7FW"×F—FÆR×cSB#í
]=-mòÝí-í=âý]íÝmÂöF—cãÆF—b6Æ73Ò&×WFVB#í	íMm]"í}MÝò(	BÍ­Í=ÂG´4„$5DU%ô5$TD”ôåô%TDtUEõccgÒí}­í"â	ýíM]òÂýí]ímM]ÝR‚--í-½Rý]MÍ]-²­½M½-í-òãÂöF—cãÂöF—cãÆ'WGFöâ6Æ73Ò&v†÷7BÖ'Fâ"G—SÒ&'WGFöâ"–CÒ'&Vv—7FW"Ö6Æ÷6R×cS"#í	}­½-ÃÂö'WGFöããÂöF—cà¢Æf÷&Ò–CÒ'&Vv—7FW"Öf÷&Ò×cS""6Æ73Ò&f÷&Ò7F6²ÖÆr&Vv—7G&F–öâÖf÷&Ò×cSB#ãÆF—b6Æ73Ò&7&VF–öâÖ'VFvWB×ccb"FFÖ7&VF–öâÖ'VFvWB×cccí	ýí-}]Ýã¢òG´4„$5DU%ô5$TD”ôåô%TDtUEõccgÒ+r	í-½íÃ¢G´4„$5DU%ô5$TD”ôåô%TDtUEõccgÓÂöF—cãÇ6V7F–öâ6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	íÝí-Ý½RMÝÝ½SÂöF—cãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãí	=í-ò­ÍýÝóÂ÷7ããÇ6VÆV7B6Æ73Ò&–çWB"æÖSÒ&6×–vä–B"&WV—&VCâG¶6×–vç2æÖ†3ÓæÆ÷F–öâfÇVSÒ"G¶W62†2æ–B—Ò"G¶6×–vãòæ–CÓÓÖ2æ–Còw6VÆV7FVBs¢rwÓâG¶W62†2ææÖWÇÆ2æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöÆ&VÃãÆF—b6Æ73Ò&f÷&ÒÖw&–B×cS"#ãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãí	ÍóÂ÷7ããÆ–çWB6Æ73Ò&–çWB"æÖSÒ&F—7Æ”æÖR"Ö†ÆVæwFƒÒ#ƒ"&WV—&VBóãÂöÆ&VÃãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãí
Mí-âý]íÝmÂ÷7ããÆ–çWB6Æ73Ò&–çWB"æÖSÒ'†÷Fò"G—SÒ&f–ÆR"66WCÒ&–ÖvR÷ærÆ–ÖvRö§VrÆ–ÖvR÷vV'Æ–ÖvRöv–b"óãÂöÆ&VÃãÂöF—cãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãí	íýÝRý]íÝmÂ÷7ããÇFW‡F&V6Æ73Ò&–çWB&V&Vv—7G&F–öâÖFW67&—F–öâ×cSB"æÖSÒ&FW67&—F–öâ"Ö†ÆVæwFƒÒ##"Æ6V†öÆFW#Ò-	-Ý]Ýí-ÂÂ-íòÂ-mÝ½RM]-½‚í=MŽ(
b#ãÂ÷FW‡F&VãÂöÆ&VÃãÂ÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	½}Ýí-ÃÂöF—cãÆF—b6Æ73Ò&f÷&ÒÖw&–B×ccb#ãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãí
}]-]­-]Â÷7ããÇFW‡F&V6Æ73Ò&–çWB&V"æÖSÒ'W'6öæÆ—G•G&—B"Ö†ÆVæwFƒÒ#3#ãÂ÷FW‡F&VãÂöÆ&VÃãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãí	M]³Â÷7ããÇFW‡F&V6Æ73Ò&–çWB&V"æÖSÒ&–FVÂ"Ö†ÆVæwFƒÒ#3#ãÂ÷FW‡F&VãÂöÆ&VÃãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãí
½í-ÃÂ÷7ããÇFW‡F&V6Æ73Ò&–çWB&V"æÖSÒ'vV¶æW72"Ö†ÆVæwFƒÒ#3#ãÂ÷FW‡F&VãÂöÆ&VÃãÂöF—cãÂ÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ýíM]óÂöF—cãÇ6Æ73Ò&×WFVB#í	ýí­}½-í-ò-í½Í­â-Ý-²ÂMí-=ýÝ½R-½ÝÝí’­ÍýÝ‚½‚]Ýýí]RãÂ÷ãÆF—bFF×&Vv—7G&F–öâ×&öfW76–öç2×cccâG·&Vv—7G&F–öä÷&–v–ä6&G5vV%ccb‡6ö6–Ä÷&–v–ç5cS"‚’Âw6ö6–Ä÷&–v–ä–BrÂw&öfW76–öârÆ6×–vâ—ÓÂöF—cãÂ÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ýí]ímM]ÝSÂöF—cãÇ6Æ73Ò&×WFVB#í	ýí]ímM]Ý]ÂÍím]"½-Â=ííBÂ]=íÒÂ-ÝmòÂ­í½íÝò½‚m]½òý½Ý]-ãÂ÷ãÆF—bFF×&Vv—7G&F–öâÖ÷&–v–ç2×cccâG·&Vv—7G&F–öä÷&–v–ä6&G5vV%ccb†vVöw&†–4÷&–v–ç5cS"‚’ÂvvVöw&†–4÷&–v–ä–BrÂvvVöw&†–2rÆ6×–vâ—ÓÂöF—cãÂ÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
--í-íRÝým]ÝSÂöF—cãÇ6Æ73Ò&×WFVB#í	ÍímÝâ-½-ÂÝ]­í½Í­âý]MÍ]-í"â	ýí­}½-í-ò-í½Í­âý]MÍ]-²M½=íÂ*½	Mí-=ý]Ò­¢--í-í\+²ÂMí-=ýÝ½R­ÍýÝ‚½‚]Ýýí]RãÂ÷ãÆF—bFF×&Vv—7G&F–öâÖWV—ÖVçB×cccâG·7F'F–ætWV—ÖVçD6&G5vV%ccb†6×–vâ—ÓÂöF—cãÂ÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Mí-=óÂöF—cãÆF—b6Æ73Ò&f÷&ÒÖw&–B×cS"#ãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãí	ýí½Âý]íÝmÂ÷7ããÆ–çWB6Æ73Ò&–çWB"æÖSÒ'72"G—SÒ'77v÷&B"Ö–æÆVæwFƒÒ#B"&WV—&VBWFö6ö×ÆWFSÒ&æWr×77v÷&B"óãÂöÆ&VÃãÆÆ&VÂ6Æ73Ò&f–VÆB#ãÇ7ãí	ýí--í-Rýí½ÃÂ÷7ããÆ–çWB6Æ73Ò&–çWB"æÖSÒ'73""G—SÒ'77v÷&B"Ö–æÆVæwFƒÒ#B"&WV—&VBWFö6ö×ÆWFSÒ&æWr×77v÷&B"óãÂöÆ&VÃãÂöF—cãÂ÷6V7F–öãà¢ÆF—b6Æ73Ò'&Vv—7G&F–öâ×7V&Ö—B×cSB#ãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í	í
-	ý
		-	
-
Â		Ý	­	]
-
2	M	Í
3Âö'WGFöããÆF—b6Æ73Ò'7FGW2ÖÆ–æR×WFVB"–CÒ'&Vv—7FW"×7FGW2×cS"#ãÂöF—cãÂöF—cãÂöf÷&ÓãÂöF—cãÂöF—cæ°¢Ð¢7–æ2gVæ7F–öâ&W6—¦U&Vv—7G&F–öå†÷FõcS"†f–ÆR—°¢–b‚f–ÆWÇÂf–ÆRç6—¦R—&WGW&ârs°¢–b†f–ÆRç6—¦Sã#£#B£#B—F‡&÷ræWrW'&÷"‚}
Mí-âM½òÝ­]-²Mí½mÝâ½-ÂÍ]ÝÍR#	Í	r“°¢6öç7BFFW&ÃÖv—BæWr&öÖ—6R‚‡&W6öÇfRÇ&V¦V7B“Óç¶6öç7B&VFW#ÖæWrf–ÆU&VFW"‚“·&VFW"æöæÆöCÒ‚“Óç&W6öÇfR…7G&–ær‡&VFW"ç&W7VÇGÇÂrr’“·&VFW"æöæW'&÷#Ò‚“Óç&V¦V7B†æWrW'&÷"‚}	ÝR=M½íÂýí}--ÂMí-âr’“·&VFW"ç&VD4FFU$Â†f–ÆR“·Ò“°¢6öç7B–ÖvSÖv—BæWr&öÖ—6R‚‡&W6öÇfRÇ&V¦V7B“Óç¶6öç7B–ÖsÖæWr–ÖvR‚“¶–ÖræöæÆöCÒ‚“Óç&W6öÇfR†–Ör“¶–ÖræöæW'&÷#Ò‚“Óç&V¦V7B†æWrW'&÷"‚}	ÝR=M½íÂM]­íMí--ÂMí-âr’“¶–Örç7&3ÖFFW&Ã·Ò“°¢6öç7BÖƒÓcC¶6öç7B66ÆSÔÖF‚æÖ–âƒÆÖ‚ôÖF‚æÖ‚†–ÖvRçv–GF‡ÇÃÆ–ÖvRæ†V–v‡GÇÃ’“¶6öç7B6çf3ÖFö7VÖVçBæ7&VFTVÆVÖVçB‚v6çf2r“¶6çf2çv–GFƒÔÖF‚æÖ‚ƒÄÖF‚ç&÷VæB†–ÖvRçv–GF‚§66ÆR’“¶6çf2æ†V–v‡CÔÖF‚æÖ‚ƒÄÖF‚ç&÷VæB†–ÖvRæ†V–v‡B§66ÆR’“¶6çf2ævWD6öçFW‡B‚s&Br’æG&t–ÖvR†–ÖvRÃÃÆ6çf2çv–GF‚Æ6çf2æ†V–v‡B“·&WGW&â6çf2çFôFFU$Â‚v–ÖvR÷vV'rÃãƒ"“°¢Ð¢gVæ7F–öâ÷Vå&Vv—7G&F–öåcS"‚—¶6öç7BæVÃÒB‚r7&Vv—7G&F–öâ×æVÂ×cS"r“¶–b‚æVÂ—&WGW&ã¶–b‡æVÂç&VçDVÆVÖVçBÓÖFö7VÖVçBæ&öG’–Fö7VÖVçBæ&öG’æVæD6†–ÆB‡æVÂ“·æVÂæ–ææW$…DÔÃ×&Vv—7G&F–öäÖ&·WcS"‚“·æVÂæ6Æ74Æ—7Bç&VÖ÷fR‚v†–FFVâr“¶Fö7VÖVçBæ&öG’æ6Æ74Æ—7BæFB‚w&Vv—7G&F–öâÖ÷Vâ×cSBr“·Ð¢gVæ7F–öâ6Æ÷6U&Vv—7G&F–öåcS"‚—¶6Æ÷6U&öf–ÆT—FVÔÖöFÅcc‚“¶6öç7BæVÃÒB‚r7&Vv—7G&F–öâ×æVÂ×cS"r“¶–b‡æVÂ—·æVÂæ6Æ74Æ—7BæFB‚v†–FFVâr“·æVÂæ–ææW$…DÔÃÒrs¶Fö7VÖVçBæ&öG’æ6Æ74Æ—7Bç&VÖ÷fR‚w&Vv—7G&F–öâÖ÷Vâ×cSBr“·×Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç°¢–b†WfVçBçF&vWCòæ–CÓÓÒw&Vv—7FW"Ö÷Vâ×cS"r–÷Vå&Vv—7G&F–öåcS"‚“°¢6öç7BWV—ÖVçD6&CÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6&B×cs%Òr“°¢–b†WV—ÖVçD6&BbfWV—ÖVçD6&Bæ6Æ÷6W7B‚r7&Vv—7G&F–öâ×æVÂ×cS"r’—¶WfVçBç&WfVçDFVfVÇB‚“¶÷Vå7F'F–ætWV—ÖVçDÖöFÅvV%cs"†WV—ÖVçD6&BæFF6WBæ—FVÔ–B“·&WGW&ã·Ð¢6öç7BWV—ÖVçE6VÆV7CÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçB×6VÆV7B×cs%Òr“°¢–b†WV—ÖVçE6VÆV7B—¶6öç7Bf÷&ÓÖFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv—7FW"Öf÷&Ò×cS"r“¶6öç7B—FVÔ–CÕ7G&–ær†WV—ÖVçE6VÆV7BæFF6WBæ—FVÔ–GÇÂrr“¶6öç7B–çWCÖf÷&ÓòçVW'•6VÆV7F÷"†¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Õ·fÇVSÒ"G´552æW66R†—FVÔ–B—Ò%Ö“¶–b†–çWB—¶–çWBæ6†V6¶VCÒ–çWBæ6†V6¶VC¶–çWBæF—7F6„WfVçB†æWrWfVçB‚v6†ævRrÇ¶'V&&ÆW3§G'VWÒ’“·Ö6Æ÷6U&öf–ÆT—FVÔÖöFÅcc‚“·&WGW&ã·Ð¢–b†WfVçBçF&vWCòæ–CÓÓÒw&Vv—7FW"Ö6Æ÷6R×cS"wÇÆWfVçBçF&vWCòæ6Æ74Æ—7Còæ6öçF–ç2‚w&Vv—7G&F–öâ×v–æF÷r×cSBr’–6Æ÷6U&Vv—7G&F–öåcS"‚“°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6†ævRrÆWfVçCÓç¶6öç7Bf÷&ÓÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚r7&Vv—7FW"Öf÷&Ò×cS"r“¶–b‚f÷&Ò—&WGW&ã¶–b†WfVçBçF&vWCòææÖSÓÓÒv6×–vä–Br—&Vg&W6…&Vv—7G&F–öä6†ö–6W5vV%ccb†f÷&Ò“¶VÇ6R–b…²w6ö6–Ä÷&–v–ä–BrÂvvVöw&†–4÷&–v–ä–BrÂw7F'F–ætWV—ÖVçD–G2uÒæ–æ6ÇVFW2…7G&–ær†WfVçBçF&vWCòææÖWÇÂrr’’—WFFT7&VF–öä'VFvWEvV%ccb†f÷&Ò“·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v¶W–F÷vârÆWfVçCÓç¶6öç7B6&CÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6&B×cs%Òr“¶–b†6&Bbb†WfVçBæ¶W“ÓÓÒtVçFW"wÇÆWfVçBæ¶W“ÓÓÒrr’—¶WfVçBç&WfVçDFVfVÇB‚“¶÷Vå7F'F–ætWV—ÖVçDÖöFÅvV%cs"†6&BæFF6WBæ—FVÔ–B“·&WGW&ã·Ö–b†WfVçBæ¶W“ÓÓÒtW66RrbdçV’ç&öf–ÆT—FVÔÖöFÃòç&Vv—7G&F–öäWV—ÖVçB—¶6Æ÷6U&öf–ÆT—FVÔÖöFÅcc‚“·&WGW&ã·Ö–b†WfVçBæ¶W“ÓÓÒtW66RrbbB‚r7&Vv—7G&F–öâ×æVÂ×cS"r“òæ6Æ74Æ—7Bæ6öçF–ç2‚v†–FFVâr’–6Æ÷6U&Vv—7G&F–öåcS"‚“·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v¶W–F÷vârÂWfVçBÓâ²–b†WfVçBæ¶W’ÓÓÒtW66RrbbFö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖ—FVÒÖÖöFÂ×ccr’’6Æ÷6U&öf–ÆT—FVÔÖöFÅcc‚“²Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚w7V&Ö—BrÆ7–æ2WfVçCÓç°¢–b†WfVçBçF&vWCòæ–BÓÒw&Vv—7FW"Öf÷&Ò×cS"r—&WGW&ã¶WfVçBç&WfVçDFVfVÇB‚“°¢6öç7Bf÷&ÓÖWfVçBçF&vWC¶6öç7BfCÖæWrf÷&ÔFF†f÷&Ò“¶6öç7B7FGW3Öf÷&ÒçVW'•6VÆV7F÷"‚r7&Vv—7FW"×7FGW2×cS"r“¶6öç7B6×–vä–CÕ7G&–ær†fBævWB‚v6×–vä–Br—ÇÂrr“¶6öç7B6×–vãÖ6×–våcC’†6×–vä–B“°¢–b‚6×–vçÇÆ6×–vâæf–Æ&ÆTæ÷sÓÓÖfÇ6R—·7FGW2çFW‡D6öçFVçCÒ}	­ÍýÝòÝ]Mí-=ýÝâs·&WGW&ã·Ð¢6öç7B7&VF–öã×fÆ–FFU&Vv—7G&F–öå6VÆV7F–öåvV%ccb†f÷&Ò“¶–b‚7&VF–öâæö²—·7FGW2çFW‡D6öçFVçCÖ7&VF–öâæÖW76vS·WFFT7&VF–öä'VFvWEvV%ccb†f÷&Ò“·&WGW&ã·Ð¢6öç7B73Õ7G&–ær†fBævWB‚w72r—ÇÂrr“¶–b‡72ÓÕ7G&–ær†fBævWB‚w73"r—ÇÂrr’—·7FGW2çFW‡D6öçFVçCÒ}	ýí½‚ÝRí-ýMí"âs·&WGW&ã·Ð¢6öç7BæÖSÕ7G&–ær†fBævWB‚vF—7Æ”æÖRr—ÇÂrr’çG&–Ò‚“¶–b‚æÖR—&WGW&ã·7FGW2çFW‡D6öçFVçCÒ}	í-ý-­Ý­]-¾(
bs°¢G'—°¢6öç7B7FVÓ×6ÇVuFW‡B†æÖR’ç&WÆ6R‚õµæ×­ÝýÓ•Ò²öv’Âuòr’ç&WÆ6R‚õåò·Åò²BörÂrr’çFôÆ÷vW$66R‚—ÇÂwÆ–W"s°¢6öç7B–CÖG·7FV×ÕòG´FFRææ÷r‚’çFõ7G&–ærƒ3b—ÕòG´ÖF‚ç&æFöÒ‚’çFõ7G&–ærƒ3b’ç6Æ–6Rƒ"Ãr—Ö°¢6öç7B–ÖvSÖv—B&W6—¦U&Vv—7G&F–öå†÷FõcS"†f÷&ÒæVÆVÖVçG2ç†÷Fóòæf–ÆW3òå³Ò“°¢6öç7B&6T&–Æ—F–W3Ôö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ‡&÷sÓå·&÷ræ¶W’ÃÒ’“°¢6öç7BÆ–W#×¶–BÇ&öÆS¢wÆ–W"rÇ72ÆF—7Æ”æÖS¦æÖRÇ6†÷'DæÖS¦æÖRÇ&æ³¢}	Ýí-½’ý]íÝbrÆfF$vÇ—ƒ¦æÖRç6Æ–6RƒÃ"’çFõWW$66R‚’ÆÆ÷&S¥7G&–ær†fBævWB‚vFW67&—F–öâr—ÇÂrr’çG&–Ò‚’Ææ÷FW3¢rrÆ–ÖvRÇW'6öæÆ—G•G&—C¥7G&–ær†fBævWB‚wW'6öæÆ—G•G&—Br—ÇÂrr’çG&–Ò‚’Æ–FVÃ¥7G&–ær†fBævWB‚v–FVÂr—ÇÂrr’çG&–Ò‚’ÇvV¶æW73¥7G&–ær†fBævWB‚wvV¶æW72r—ÇÂrr’çG&–Ò‚’Æ&÷fÅ7FGW3¢wVæF–ærrÆÆÆ÷t7&÷746×–väF—&V7DÖW76vW3¦fÇ6RÆÆ–6F–öå7V&Ö—GFVDC¦æWrFFR‚’çFô•4õ7G&–ær‚’Æ6×–vä–G3¥¶6×–vä–EÒÇ6ö6–Ä÷&–v–ä–C¦7&VF–öâç&öfW76–öâæ–BÆvVöw&†–4÷&–v–ä–C¦7&VF–öâævVöw&†–2æ–BÆ7&VF–öåö–çG57VçC¦7&VF–öâçF÷FÂÇ7F'F–ætWV—ÖVçD–G3¦7&VF–öâæWV—ÖVçD–G2Æ7&VF—G3£Ç7FG3§¶‡7W'&VçC£Æ‡Öƒ£Ç6†–VÆD7W'&VçC£Ç6†–VÆDÖƒ£ÆVæW&w”7W'&VçC£ÆVæW&w”Öƒ£Æ&6T&Ö÷$6Æ73£ÒÆ&–Æ—F–W3¦&6T&–Æ—F–W2Æ&–Æ—G”&6S¦&6T&–Æ—F–W2ÆWV—ÖVçE6Æ÷G3§·&–Ö'•vVöã¢rrÇ6V6öæF'•vVöã¢rrÆ&Ö÷#¢rwÒÆ–×ÆçE6Æ÷D6÷VçC£Æ–×ÆçE6Æ÷G3¥µÒÆ–ç7FÆÆVD–×ÆçD–G3¥µÒÆ–çfVçF÷'•6—¦S£"Æ6''•vV–v‡DÖƒ£"Æ–çfVçF÷'“¦7&VF–öâæWV—ÖVçD–G2æÖ†—FVÔ–CÓâ‡¶—FVÔ–BÇG“£Ç÷6—F–öç3¥µ×Ò’’Ç6ö6–Ã§¶ç4–G3¥µÒÆ÷&w3¥µÒÇ&WWFF–öã¥µ×ÒÆ7W'&VçEÆæWD–C¢rrÇ&VÆFVD'F–6ÆT–G3¥µ×Ó°¢6öç7B6VvÖVçG3ÖFV6ö×÷6UÆ–W"‡Æ–W"“¶6öç7B6fVCÖv—B”7&VFUÆ–W"„æ6öæf–rÇ·Æ–W%ö–C¦–BÇfW'6–öã£ÇWFFVEö'“¤æ6öæf–ræFWf–6TÆ&VÇÇÂwvV"×&Vv—7G&F–öârÂââç6VvÖVçG7Ò“´æFFçÆ–W%&÷w2ç6WB‡6fVBçÆ–W%ö–BÇ6fVB“´æFFçÆ–W'3Ö'V–ÆEÆ–W$Ö„æ66†Rç6æ6†÷BÄ'&’æg&öÒ„æFFçÆ–W%&÷w2çfÇVW2‚’’“¶v—B6fT66†R‚“·7FGW2çFW‡D6öçFVçCÒ}	Ý­]-í]Ý]ÝÝí-½Â”B‚ýíý-½Â"m=Ý½R	M	Íâ	ýí½RíMí]Ýòý]íÝbýíý--ò-â-]íMRâs¶f÷&Òç&W6WB‚“·&VæFW$Æöv–â‚“°¢Ö6F6‚†W'&÷"—·7FGW2çFW‡D6öçFVçCÖ	ÝR=M½íÂí-ý--ÂÝ­]-3¢G¶W'&÷"æÖW76vWÖ·Ð¢Ò“°  ¢òòcããc#¢6×–vâ×v–FR6†B²å26öçF7G2–âvV"²tÒ7F÷"–×W'6öæF–öâ–â6×–vâ6†ææVÇ2à¢gVæ7F–öâÆöv–6Ä6×–vä–Ecc"‚’°¢&WGW&â7G&–ær„ç6W76–öãòæ6×–vä–BÇÂçV“òç6VÆV7FVD6×–vä–BÇÂ6VÆV7FVD6×–våcC’‚’ÇÂrr’çG&–Ò‚“°¢Ð¢gVæ7F–öâ6×–våF‡&VD¶W•cc"†6×–vä–BÒÆöv–6Ä6×–vä–Ecc"‚’’°¢&WGW&â6×–vã£¢Gµ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚—Ö°¢Ð¢gVæ7F–öâ&÷fVD6×–våÆ–W'5cc"†6×–vä–BÒÆöv–6Ä6×–vä–Ecc"‚’’°¢6öç7B–BÒ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚“°¢–b‚–B’&WGW&âµÓ°¢&WGW&â'&’æg&öÒ„æFFçÆ–W'2çfÇVW2‚’¢æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br¢æf–ÇFW"‡Æ–W"Óâ&÷fVEÆ–W%cS"‡Æ–W"’¢æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒrÇÂ6×–vä–G4f÷%Æ–W"‡Æ–W"’æ–æ6ÇVFW2†–B’¢ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†æF—7Æ”æÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"æF—7Æ”æÖWÇÆ"æ–B’Âw'Rr’“°¢Ð¢gVæ7F–öâ7&÷746×–väF—&V7DVæ&ÆVEcc2‡Æ–W"Ò·Ò’°¢&WGW&âÆ–W#òæÆÆ÷t7&÷746×–väF—&V7DÖW76vW2ÓÓÒG'VRÇÂ7G&–ær‡Æ–W#òæÆÆ÷t7&÷746×–väF—&V7DÖW76vW2ÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒwG'VRs°¢Ð¢gVæ7F–öâ6åÆ–W'4F—&V7DÖW76vUcc2‡6VæFW"Ò7W'&VçEÆ–W"‚’ÂF&vWBÒçVÆÂÂ6×–vä–BÒÆöv–6Ä6×–vä–Ecc"‚’’°¢–b‚6VæFW"ÇÂF&vWB’&WGW&âfÇ6S°¢–b…7G&–ær‡F&vWBç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’°¢&WGW&â7G&–ær‡6VæFW"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Brbb&÷fVEÆ–W%cS"‡6VæFW"“°¢Ð¢–b…7G&–ær‡6VæFW"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’&WGW&â&÷fVEÆ–W%cS"‡F&vWB“°¢–b‚&÷fVEÆ–W%cS"‡6VæFW"’ÇÂ&÷fVEÆ–W%cS"‡F&vWB’’&WGW&âfÇ6S°¢6öç7B7F—fT6×–vâÒ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚“°¢–b†7F—fT6×–vâbb6×–vä–G4f÷%Æ–W"‡F&vWB’æ–æ6ÇVFW2†7F—fT6×–vâ’’&WGW&âG'VS°¢&WGW&â7&÷746×–väF—&V7DVæ&ÆVEcc2‡6VæFW"’ÇÂ7&÷746×–väF—&V7DVæ&ÆVEcc2‡F&vWB“°¢Ð ¢gVæ7F–öâ6×–väç4÷F–öç5cc"‡Æ–W"Ò7W'&VçEÆ–W"‚’’°¢&WGW&â'&’æg&öÒ„æFFæç72çfÇVW2‚’¢æf–ÇFW"†ç2Óâ°¢–b‚ç2’&WGW&âfÇ6S°¢–b…7G&–ær„ç6W76–öãòç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’&WGW&âG'VS°¢&WGW&âç4ÆÆ÷w5Æ–W$6†B†ç2’bbf—6–&ÆTf÷%Æ–W"†ç2ÂÆ–W#òæ–BÇÂç6W76–öãòçW6W$–BÇÂrr“°¢Ò¢ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†ææÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"ææÖWÇÆ"æ–B’Âw'Rr’“°¢Ð¢gVæ7F–öâ6×–våF‡&VEcc"‚’°¢6öç7B6×–vä–BÒÆöv–6Ä6×–vä–Ecc"‚“°¢–b‚6×–vä–BÇÂ7G&–ær„ç6W76–öãòç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvwVW7Br’&WGW&âçVÆÃ°¢6öç7B6×–vâÒæFFæ6×–vç2ævWB†6×–vä–B’ÇÂ²–C¢6×–vä–BÂæÖS¢6×–vä–BÓ°¢6öç7BÖVÖ&W'2Ò&÷fVD6×–våÆ–W'5cc"†6×–vä–B’æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒr“°¢&WGW&â°¢¶W“¢6×–våF‡&VD¶W•cc"†6×–vä–B’À¢Æ&VÃ¢	í’}"+rG¶6×–vâææÖRÇÂ6×–vâæ–GÖÀ¢G—S¢v6×–vârÀ¢6×–vä–BÀ¢7V'F—FÆS¢G¶ÖVÖ&W'2æÆVæwF‡ÒG¶ÖVÖ&W'2æÆVæwF‚ÓÓÒò}ý]íÝbr¢†ÖVÖ&W'2æÆVæwF‚ãÒ"bbÖVÖ&W'2æÆVæwF‚ÃÒBò}ý]íÝmr¢}ý]íÝm]’r—Ò+r	M	ÆÀ¢VçF—G“¢6×–vâÀ¢ÖVÖ&W'0¢Ó°¢Ð ¢6öç7Bõö'V–ÆEF‡&VG5cc"Ò'V–ÆEF‡&VG3°¢'V–ÆEF‡&VG2ÒgVæ7F–öâ‚’°¢6öç7BÆ–W"Ò7W'&VçEÆ–W"‚“°¢–b‚Æ–W"’&WGW&âµÓ°¢6öç7B6×–vä–BÒÆöv–6Ä6×–vä–Ecc"‚“°¢6öç7B&÷w2ÒµÓ°¢6öç7B6×–våF‡&VBÒ6×–våF‡&VEcc"‚“°¢–b†6×–våF‡&VB’&÷w2çW6‚†6×–våF‡&VB“° ¢'&’æg&öÒ„æFFçÆ–W'2çfÇVW2‚’¢æf–ÇFW"†÷F†W"Óâ÷F†W"bb÷F†W"æ–BÓÒÆ–W"æ–Bbb7G&–ær†÷F†W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br¢æf–ÇFW"†÷F†W"Óâ&÷fVEÆ–W%cS"†÷F†W"’¢æf–ÇFW"†÷F†W"Óâ6åÆ–W'4F—&V7DÖW76vUcc2‡Æ–W"Â÷F†W"Â6×–vä–B’¢ç6÷'B‚†Æ"“Óç6ÇVuFW‡B†æF—7Æ”æÖWÇÆæ–B’æÆö6ÆT6ö×&R‡6ÇVuFW‡B†"æF—7Æ”æÖWÇÆ"æ–B’Âw'Rr’¢æf÷$V6‚†÷F†W"Óâ°¢6öç7BF‡&VD¶W’Ò·Æ–W"æ–BÂ÷F†W"æ–EÒç6÷'B‚’æ¦ö–â‚uõòr“°¢6öç7B6ÖT7W'&VçD6×–vâÒ6×–vä–G4f÷%Æ–W"†÷F†W"’æ–æ6ÇVFW2†6×–vä–B“°¢&÷w2çW6‚‡²¶W“¢F‡&VD¶W’ÂÆ&VÃ¢÷F†W"æF—7Æ”æÖRÇÂ÷F†W"æ–BÂG—S¢vF—&V7BrÂ÷F†W$–C¢÷F†W"æ–BÂ7V'F—FÆS¢7G&–ær†÷F†W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒrò}	M	Âr¢‡6ÖT7W'&VçD6×–vâò†÷F†W"ç&æ²ÇÂ}	=í¢r’¢G¶÷F†W"ç&æ²ÇÂ}	=í¢wÒ+rM==ò­ÍýÝö’ÂVçF—G“¢÷F†W"Ò“°¢Ò“° ¢6×–väç4÷F–öç5cc"‡Æ–W"’æf÷$V6‚†ç2Óâ°¢6öç7BF‡&VD¶W’ÒG¶ç2æ–GÕõòG·Æ–W"æ–GÖ°¢&÷w2çW6‚‡²¶W“¢F‡&VD¶W’ÂÆ&VÃ¢ç2ææÖRÇÂç2æ–BÂG—S¢vç2rÂç4–C¢ç2æ–BÂ7V'F—FÆS¢ç2ç&öÆRÇÂtå2rÂVçF—G“¢ç2Ò“°¢Ò“°¢&WGW&â&÷w3°¢Ó° ¢gVæ7F–öâ6×–väÖW76vT7F÷$Ö&·Wcc"‡&÷rÂ6VÆV7FVB’°¢6öç7B÷vâÒ7G&–ær‡&÷rç6VæFW%ö–BÇÂrr’ÓÓÒ7G&–ær„ç6W76–öãòçW6W$–BÇÂrr’bb7G&–ær‡&÷rç6VæFW%÷G—RÇÂrr’ÓÒvç2s°¢6öç7B7F÷"ÒÖW76vT7F÷"‡&÷rÂ6VÆV7FVB“°¢&WGW&â°¢÷vâÀ¢7F÷"À¢Æ&VÃ¢&÷ræWF†÷%öÆ&VÂÇÂ7F÷#òæF—7Æ”æÖRÇÂ7F÷#òææÖRÇÂ†÷vâò†7W'&VçEÆ–W"‚“òæF—7Æ”æÖRÇÂ}
-²r’¢}
=}-Ý¢r¢Ó°¢Ð¢gVæ7F–öâ6×–väÖVÖ&W$Æ–æUcc"‡F‡&VB’°¢–b‚F‡&VBÇÂF‡&VBçG—RÓÒv6×–vâr’&WGW&ârs°¢6öç7BæÖW2Ò‡F‡&VBæÖVÖ&W'2ÇÂµÒ’æÖ‡Æ–W"ÓâÆ–W"æF—7Æ”æÖRÇÂÆ–W"æ–B’æf–ÇFW"„&ööÆVâ“°¢&WGW&âÆF—b6Æ73Ò&6×–vâÖ6†BÖÖVÖ&W'2×cc"#ãÇ7â6Æ73Ò&W–V'&÷r#í
=
}	

-	Ý		­	ƒÂ÷7ããÇ7ãâG¶W62†æÖW2æ¦ö–â‚r+rr’ÇÂ}	ýí­Ý]"íMí]ÝÝ½Rý]íÝm]’r—ÓÂ÷7ããÇ7ãì+r	M	ÃÂ÷7ããÂöF—cæ°¢Ð¢gVæ7F–öâvÔ6×–vä7F÷%6VÆV7Ecc"‡F‡&VB’°¢–b…7G&–ær„ç6W76–öãòç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒrÇÂF‡&VCòçG—RÓÒv6×–vâr’&WGW&ârs°¢6öç7BvÒÒ7W'&VçEÆ–W"‚“°¢6öç7Bç72Ò6×–väç4÷F–öç5cc"†vÒ“°¢&WGW&âÆÆ&VÂ6Æ73Ò&f–VÆB6×–vâÖ7F÷"Öf–VÆB×cc"#ãÇ7ãí	ý-Âí"½mÂ÷7ããÇ6VÆV7B6Æ73Ò&–çWB"æÖSÒ&7F÷"#ãÆ÷F–öâfÇVSÒ&vÓ¢G¶W62†vÓòæ–BÇÂç6W76–öãòçW6W$–BÇÂrr—Ò#í	M	Â+rG¶W62†vÓòæF—7Æ”æÖRÇÂvÓòç6†÷'DæÖRÇÂ}	-]M=’r—ÓÂö÷F–öãâG¶ç72æÖ†ç3ÓæÆ÷F–öâfÇVSÒ&ç3¢G¶W62†ç2æ–B—Ò#äå2+rG¶W62†ç2ææÖRÇÂç2æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöÆ&VÃæ°¢Ð ¢6öç7Bõ÷&VæFW$6†Ecc"Ò&VæFW$6†C°¢&VæFW$6†BÒgVæ7F–öâ‚’°¢6WEF÷&"‚}
}"rÂ}	í’­Ý²­ÍýÝ‚Â½}Ý½RM½í=‚‚å2+rö6¶WD&6R&VÇF–ÖRr“°¢6öç7B&ö÷BÒB‚r767&VVâÖ6†Br“°¢6öç7BF‡&VG2Ò'V–ÆEF‡&VG2‚“°¢–b‚çV’ç6VÆV7FVEF‡&VD¶W’ÇÂF‡&VG2ç6öÖR‡F‡&VBÓâF‡&VBæ¶W’ÓÓÒçV’ç6VÆV7FVEF‡&VD¶W’’’°¢çV’ç6VÆV7FVEF‡&VD¶W’ÒF‡&VG5³Óòæ¶W’ÇÂrs°¢Ð¢6öç7B6VÆV7FVBÒF‡&VG2æf–æB‡F‡&VBÓâF‡&VBæ¶W’ÓÓÒçV’ç6VÆV7FVEF‡&VD¶W’’ÇÂF‡&VG5³ÒÇÂçVÆÃ°¢6öç7BÖW76vW2Ò6VÆV7FVBòÖW76vW4f÷%F‡&VB‡6VÆV7FVBæ¶W’’¢µÓ°¢&ö÷Bæ–ææW$…DÔÂÒ ¢ÆF—b6Æ73Ò&6†BÖÖö&–ÆRÖÆ–÷WB#à¢ÆF—b6Æ73Ò&6&B6†BÖ7F—fRÖ6&B"7G–ÆSÒ'FF–æs£gƒ²#à¢ÆF—b6Æ73Ò'6V7F–öâÖ†VB#à¢ÆF—b6Æ73Ò'F‡&VB×&÷r6ö×7B#à¢G·6VÆV7FVBò&VæFW$VçF—G”fF"‡6VÆV7FVBæVçF—G’ÇÂ·ÒÂ6VÆV7FVBæÆ&VÂÂw6Òr’¢rwÐ¢ÆF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#âG¶W62‡6VÆV7FVCòæÆ&VÂÇÂ}	­Ý²r—ÓÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62‡6VÆV7FVCòç7V'F—FÆRÇÂrr—ÓÂöF—cãÂöF—cà¢ÂöF—cà¢ÂöF—cà¢G¶6×–väÖVÖ&W$Æ–æUcc"‡6VÆV7FVB—Ð¢ÆF—b6Æ73Ò&ÖW76vRÖÆ—7B#à¢G¶ÖW76vW2æÖ‡&÷rÓâ°¢6öç7BÖWFÒ6×–väÖW76vT7F÷$Ö&·Wcc"‡&÷rÂ6VÆV7FVB“°¢&WGW&â ¢ÆF—b6Æ73Ò&6†B×&÷rG¶ÖWFæ÷vâòv÷vâr¢rwÒ#à¢G·&VæFW$VçF—G”fF"†ÖWFæ7F÷"ÇÂ·ÒÂÖWFæÆ&VÂÂw6Òr—Ð¢ÆF—b6Æ73Ò&6†BÖ'V&&ÆRG¶ÖWFæ÷vâòv÷vâr¢rwÒG·&÷rç6VæFW%÷G—RÓÓÒvç2ròvç2ÖÖW76vR×cc"r¢rwÒ#à¢ÆF—b6Æ73Ò&6†BÖÖWF#âG¶W62†ÖWFæÆ&VÂ—Ò+rG¶f÷&ÖDFFR‡&÷ræ7&VFVEöB—ÓÂöF—cà¢ÆF—b6Æ73Ò&'F–6ÆRÖ&öG’#âG¶æ÷&ÖÆ—¦U&–6„‡FÖÂ‡&÷ræ&öG•ö‡FÖÂÇÂrr—ÓÂöF—cà¢ÂöF—cà¢ÂöF—cà¢°¢Ò’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'Æ6V†öÆFW"#í
íí]Ý’]Ý]"ãÂöF—câwÐ¢ÂöF—cà¢G·6VÆV7FVBò ¢Æf÷&Ò–CÒ&6†BÖ6ö×÷6RÖf÷&Ò"6Æ73Ò&6†BÖ6ö×÷6R"FF×F‡&VBÖ¶W“Ò"G¶W62‡6VÆV7FVBæ¶W’—Ò#à¢G¶vÔ6×–vä7F÷%6VÆV7Ecc"‡6VÆV7FVB—Ð¢ÇFW‡F&V6Æ73Ò'FW‡F&V"æÖSÒ&&öG’"&÷w3Ò#B"Æ6V†öÆFW#Ò"G·6VÆV7FVBçG—RÓÓÒv6×–vârò}	Ýý-Â"í’}"­ÍýÝ‚âââr¢6VÆV7FVBçG—RÓÓÒvç2rò}	Ýý-Âå2âââr¢}	Ýý-Âíí]ÝRâââwÒ#âG¶W62„çV’æ6†DG&gG5·6VÆV7FVBæ¶W•ÒÇÂrr—ÓÂ÷FW‡F&Và¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í	í-ý--ÃÂö'WGFöãà¢Âöf÷&Óà¢¢rwÐ¢ÂöF—cà¢ÆF—b6Æ73Ò'F‡&VBÖÆ—7B6†BÖ6öçF7BÖÆ—7B#à¢G·F‡&VG2æÖ‡F‡&VBÓâ°¢6öç7BÆ7BÒÖW76vW4f÷%F‡&VB‡F‡&VBæ¶W’’ç6Æ–6R‚Ó•³ÒÇÂçVÆÃ°¢6öç7BW–V'&÷rÒF‡&VBçG—RÓÓÒv6×–vârò}	­		Ý		²	­		Í	ý		Ý		‚r¢‡F‡&VBçG—RÓÓÒvç2rò}	M			½	í	2
å2r¢}	½	
}	Ý
½	’	M			½	í	2r“°¢&WGW&â ¢Æ'F–6ÆR6Æ73Ò'F‡&VBÖ6&BG·F‡&VBæ¶W’ÓÓÒ6VÆV7FVCòæ¶W’òv7F—fRr¢rwÒG·F‡&VBçG—RÓÓÒv6×–vâròv6×–vâ×F‡&VBÖ6&B×cc"r¢rwÒ#à¢ÆF—b6Æ73Ò'F‡&VB×&÷r#à¢G·&VæFW$VçF—G”fF"‡F‡&VBæVçF—G’ÇÂ·ÒÂF‡&VBæÆ&VÂ—Ð¢ÆF—b6Æ73Ò'F‡&VBÖ6÷’#à¢ÆF—b6Æ73Ò&W–V'&÷r#âG¶W–V'&÷wÓÂöF—cà¢Æƒ3âG¶W62‡F‡&VBæÆ&VÂ—ÓÂöƒ3à¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62†Æ7Bò7G&—‡FÖÂ†Æ7Bæ&öG•ö‡FÖÂÇÂrr’ç6Æ–6RƒÂƒ"’¢‡F‡&VBç7V'F—FÆRÇÂ}	]ríí]Ý’r’—ÓÂöF—cà¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò&VçF—G’Ö7F–öç2#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'6VÆV7B×F‡&VB"FF×F‡&VBÖ¶W“Ò"G¶W62‡F‡&VBæ¶W’—Ò#í	í-­½-ÃÂö'WGFöããÂöF—cà¢Âö'F–6ÆSà¢°¢Ò’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'Æ6V†öÆFW"#í	Ý]"Mí-=ýÝ½R­Ý½í"-ý}‚ãÂöF—câwÐ¢ÂöF—cà¢ÂöF—cà¢°¢Ó° ¢6öç7Bõ÷6VæDÖW76vUcc"Ò6VæDÖW76vS°¢6VæDÖW76vRÒ7–æ2gVæ7F–öâ†f÷&Ò’°¢6öç7BF‡&VD¶W’Ò7G&–ær†f÷&ÓòæFF6WCòçF‡&VD¶W’ÇÂrr“°¢6öç7BF‡&VBÒ'V–ÆEF‡&VG2‚’æf–æB†—FVÒÓâ—FVÒæ¶W’ÓÓÒF‡&VD¶W’“°¢–b‚F‡&VB’&WGW&âõ÷6VæDÖW76vUcc"†f÷&Ò“°¢–b‡F‡&VBçG—RÓÓÒvF—&V7Br’°¢6öç7B6VæFW"Ò7W'&VçEÆ–W"‚“°¢6öç7BF&vWBÒæFFçÆ–W'2ævWB‡F‡&VBæ÷F†W$–B“°¢–b‚6åÆ–W'4F—&V7DÖW76vUcc2‡6VæFW"ÂF&vWBÂÆöv–6Ä6×–vä–Ecc"‚’’’F‡&÷ræWrW'&÷"‚}	½}Ý½’}"ý]íÝm]ÂM==í’­ÍýÝ‚}ý]Ò]=âÝ-í­Í‚âr“°¢&WGW&âõ÷6VæDÖW76vUcc"†f÷&Ò“°¢Ð¢–b‡F‡&VBçG—RÓÒv6×–vâr’&WGW&âõ÷6VæDÖW76vUcc"†f÷&Ò“°¢6öç7BfBÒæWrf÷&ÔFF†f÷&Ò“°¢6öç7B&öG’Ò7G&–ær†fBævWB‚v&öG’r’ÇÂrr’çG&–Ò‚“°¢–b‚&öG’’&WGW&ã°¢6öç7BÆ–W"Ò7W'&VçEÆ–W"‚“°¢–b‚Æ–W"’F‡&÷ræWrW'&÷"‚}	ýíM½ÂÝRÝM]Òr“°¢6öç7B6×–vä–BÒ7G&–ær‡F‡&VBæ6×–vä–BÇÂÆöv–6Ä6×–vä–Ecc"‚’“°¢–b‚6×–vä–B’F‡&÷ræWrW'&÷"‚}	­ÍýÝòÝR-½Ýr“° ¢ÆWB6VæFW%G—RÒwÆ–W"s°¢ÆWB6VæFW$–BÒÆ–W"æ–C°¢ÆWBç4–BÒçVÆÃ°¢ÆWBWF†÷$Æ&VÂÒÆ–W"æF—7Æ”æÖRÇÂÆ–W"æ–C°¢–b…7G&–ær„ç6W76–öãòç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’°¢6öç7B7F÷"Ò7G&–ær†fBævWB‚v7F÷"r’ÇÂvÓ¢G·Æ–W"æ–GÖ“°¢–b†7F÷"ç7F'G5v—F‚‚vç3¢r’’°¢6öç7B&WVW7FVDç4–BÒ7F÷"ç6Æ–6RƒB“°¢6öç7Bç2ÒæFFæç72ævWB‡&WVW7FVDç4–B“°¢–b‚ç2’F‡&÷ræWrW'&÷"‚tå2ÝRÝM]Òr“°¢6VæFW%G—RÒvç2s°¢6VæFW$–BÒç2æ–C°¢ç4–BÒç2æ–C°¢WF†÷$Æ&VÂÒç2ææÖRÇÂç2æ–C°¢Ð¢Ð ¢6öç7B&÷rÒ°¢ÖW76vUö–C¢×6uòG´FFRææ÷r‚’çFõ7G&–ærƒ3b—ÕòG´ÖF‚ç&æFöÒ‚’çFõ7G&–ærƒ3b’ç6Æ–6Rƒ"Âr—ÖÀ¢òò&WW6RF†RW7F&Æ—6†VBö6¶WD&6R¶–æBfÇVS²6×–vâ–FVçF—G’—2F†RF‡&VEö¶W’&Vf—‚à¢¶–æC¢vF—&V7BrÀ¢F‡&VEö¶W“¢6×–våF‡&VD¶W•cc"†6×–vä–B’À¢6VæFW%÷G—S¢6VæFW%G—RÀ¢6VæFW%ö–C¢6VæFW$–BÀ¢òò¶VW&V6—–VçEÆ–W$–BæöâÖV×G’f÷"W†—7F–ærö6¶WD&6R66†VÖ2F†BÖ&²—B&WV—&VBà¢&V6—–VçE÷Æ–W%ö–C¢Æ–W"æ–BÀ¢ç5ö–C¢ç4–BÀ¢F—&V7Eö¢çVÆÂÀ¢F—&V7Eö#¢çVÆÂÀ¢WF†÷%öÆ&VÃ¢WF†÷$Æ&VÂÀ¢&öG•ö‡FÖÃ¢ÇâG¶W62†&öG’—ÓÂ÷æ ¢Ó°¢6öç7B6fVBÒv—B•W6W'D6†B„æ6öæf–rÂ&÷r“°¢æFFæ6†E&÷w2ÒÖW&vT6†E&÷w2„æFFæ6†E&÷w2Â·6fVEÒ“°¢v—B6fT66†R‚“°¢çV’æ6†DG&gG5·F‡&VBæ¶W•ÒÒrs°¢f÷&Òç&W6WB‚“°¢&VæFW$6†B‚“°¢æ÷F–g’‡6VæFW%G—RÓÓÒvç2rò
íí]ÝRí-ý-½]Ýâí"Í]Ý‚G¶WF†÷$Æ&VÇÖ¢}
íí]ÝRí-ý-½]Ýâ"í’}"rÂvö²r“°¢Ó°  ¢ò¢cããcRvV"6†BVç&VB7FFR²66Æ&ÆRå26VÆV7F÷'2¢ð¢6öç7B4„Eõ$TEõ5Dõ$tUõ$Td•…õccRÒvw'rçvV"æ6†E&VBçccRs° ¢gVæ7F–öâ6†E&VE7F÷&vT¶W•ccR‚’°¢6öç7BÆ–W$–BÒ7G&–ær„ç6W76–öãòçW6W$–BÇÂvwVW7Br“°¢6öç7B6×–vä–BÒ7G&–ær†Æöv–6Ä6×–vä–Ecc#òâ‚’ÇÂæ6öæf–sòæ6×–vä–BÇÂvÖ–âr“°¢&WGW&âG´4„Eõ$TEõ5Dõ$tUõ$Td•…õccWÓ¢G·Æ–W$–GÓ¢G¶6×–vä–GÖ°¢Ð ¢gVæ7F–öâÖW76vU7F×ccR‡&÷rÒ·Ò’°¢6öç7B&rÒ&÷ræ7&VFVEöBÇÂ&÷rçWFFVEöBÇÂ&÷ræ6Æ–VçE÷WFFVEöBÇÂrs°¢6öç7B'6VBÒFFRç'6R‡&r“°¢&WGW&âçVÖ&W"æ—4f–æ—FR‡'6VB’ò'6VB¢°¢Ð ¢gVæ7F–öâ—4÷vä6†DÖW76vUccR‡&÷rÒ·Ò’°¢6öç7BÆ–W$–BÒ7G&–ær„ç6W76–öãòçW6W$–BÇÂrr“°¢–b…7G&–ær‡&÷rç6VæFW%÷G—RÇÂrr’ÓÓÒwÆ–W"rbb7G&–ær‡&÷rç6VæFW%ö–BÇÂrr’ÓÓÒÆ–W$–B’&WGW&âG'VS°¢òòå2ÖW76vW2–âF†RvV"6Æ–VçB&RWF†÷&VB'’F†RtÒâFòæ÷Bæ÷F–g’F†RtÐ¢òò&÷WBF†V—"÷vâ–×W'6öæFVBå2ÖW76vW2à¢–b…7G&–ær„ç6W76–öãòç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒrbb7G&–ær‡&÷rç6VæFW%÷G—RÇÂrr’ÓÓÒvç2r’&WGW&âG'VS°¢&WGW&âfÇ6S°¢Ð ¢gVæ7F–öâw&—FT6†E&VE7FFUccR‡7FFR’°¢G'’²v–æF÷ræÆö6Å7F÷&vRç6WD—FVÒ†6†E&VE7F÷&vT¶W•ccR‚’Â¥4ôâç7G&–æv–g’‡7FFR’“²Ò6F6‚·Ð¢Ð ¢gVæ7F–öâVç7W&T6†E&VE7FFUccR‡F‡&VG2Ò'V–ÆEF‡&VG2‚’’°¢6öç7B¶W’Ò6†E&VE7F÷&vT¶W•ccR‚“°¢ÆWB7FFRÒ§6öå7F÷&vU&VB‡v–æF÷ræÆö6Å7F÷&vRÂ¶W’ÂçVÆÂ“°¢–b‚7FFRÇÂG—Vöb7FFRÓÒvö&¦V7BrÇÂ7FFRçfW'6–öâÓÒÇÂ7FFRçF‡&VG2ÇÂG—Vöb7FFRçF‡&VG2ÓÒvö&¦V7Br’°¢6öç7B–æ—F–Æ—¦VDBÒFFRææ÷r‚“°¢7FFRÒ²fW'6–öã¢Â–æ—F–Æ—¦VDBÂF‡&VG3¢·ÒÓ°¢òòcããcR–çG&öGV6W2Vç&VBG&6¶–ærf÷"F†Rf—'7BF–ÖRâW†—7F–ær†—7F÷'’—0¢òòG&VFVB2Ç&VG’&VB6òW6W'2Fòæ÷B&V6V—fRvÆÂöbÆVv7’&FvW2à¢f÷"†6öç7BF‡&VBöbF‡&VG2’°¢6öç7BÆFW7BÒÖW76vW4f÷%F‡&VB‡F‡&VBæ¶W’’ç&VGV6R‚†Ö‚Â&÷r’ÓâÖF‚æÖ‚†Ö‚ÂÖW76vU7F×ccR‡&÷r’’Â“°¢7FFRçF‡&VG5·F‡&VBæ¶W•ÒÒÆFW7BÇÂ–æ—F–Æ—¦VDC°¢Ð¢w&—FT6†E&VE7FFUccR‡7FFR“°¢Ð¢&WGW&â7FFS°¢Ð ¢gVæ7F–öâF‡&VEVç&VD6÷VçEccR‡F‡&VBÂ7FFRÒVç7W&T6†E&VE7FFUccR‚’’°¢–b‚F‡&VCòæ¶W’’&WGW&â°¢6öç7B&VDBÒçVÖ&W"‡7FFRçF‡&VG3òå·F‡&VBæ¶W•Òóò7FFRæ–æ—F–Æ—¦VDBóò“°¢&WGW&âÖW76vW4f÷%F‡&VB‡F‡&VBæ¶W’’ç&VGV6R‚†6÷VçBÂ&÷r’Óâ°¢–b‡&÷ræFVÆWFVEöBÇÂ—4÷vä6†DÖW76vUccR‡&÷r’’&WGW&â6÷VçC°¢&WGW&âÖW76vU7F×ccR‡&÷r’â&VDBò6÷VçB²¢6÷VçC°¢ÒÂ“°¢Ð ¢gVæ7F–öâÖ&µF‡&VE&VEccR‡F‡&VD¶W’’°¢6öç7B¶W’Ò7G&–ær‡F‡&VD¶W’ÇÂrr“°¢–b‚¶W’’&WGW&ã°¢6öç7B7FFRÒVç7W&T6†E&VE7FFUccR‚“°¢6öç7BÆFW7BÒÖW76vW4f÷%F‡&VB†¶W’’ç&VGV6R‚†Ö‚Â&÷r’ÓâÖF‚æÖ‚†Ö‚ÂÖW76vU7F×ccR‡&÷r’’Â“°¢7FFRçF‡&VG5¶¶W•ÒÒÖF‚æÖ‚„çVÖ&W"‡7FFRçF‡&VG5¶¶W•ÒÇÂ’ÂÆFW7BÇÂFFRææ÷r‚’“°¢w&—FT6†E&VE7FFUccR‡7FFR“°¢Ð ¢gVæ7F–öâ6WEVç&VD&FvUFW‡EccR†æöFRÂ6÷VçB’°¢–b‚æöFR’&WGW&ã°¢6öç7BfÇVRÒçVÖ&W"†6÷VçBÇÂ“°¢æöFRçFW‡D6öçFVçBÒfÇVRâ“’òs“’²r¢7G&–ær‡fÇVR“°¢æöFRæ†–FFVâÒfÇVRÃÒ°¢æöFRç6WDGG&–'WFR‚v&–ÖÆ&VÂrÂfÇVRâò	Ý]ýí}-ÝÝ½Ríí]Ý“¢G·fÇVWÖ¢}	Ý]"Ý]ýí}-ÝÝ½Ríí]Ý’r“°¢Ð ¢gVæ7F–öâWFFT6†EVç&VD–æF–6F÷'5ccR†÷F–öç2Ò·Ò’°¢–b‚ç6W76–öãòçW6W$–BÇÂçV’æ&ö÷BÓÒvr’&WGW&ã°¢6öç7BF‡&VG2Ò'V–ÆEF‡&VG2‚“°¢–b†÷F–öç2æÖ&µ6VÆV7FVBbbçV’ç67&VVâÓÓÒv6†BrbbçV’ç6VÆV7FVEF‡&VD¶W’’Ö&µF‡&VE&VEccR„çV’ç6VÆV7FVEF‡&VD¶W’“°¢6öç7B7FFRÒVç7W&T6†E&VE7FFUccR‡F‡&VG2“°¢ÆWBF÷FÂÒ°¢6öç7B6÷VçG2ÒæWrÖ‚“°¢f÷"†6öç7BF‡&VBöbF‡&VG2’°¢6öç7B6÷VçBÒF‡&VEVç&VD6÷VçEccR‡F‡&VBÂ7FFR“°¢6÷VçG2ç6WB‡F‡&VBæ¶W’Â6÷VçB“°¢F÷FÂ³Ò6÷VçC°¢Ð ¢6öç7Bæd'WGFöâÒFö7VÖVçBçVW'•6VÆV7F÷"‚rææbÖ'Få¶FF×67&VVãÒ&6†B%Òr“°¢–b†æd'WGFöâ’°¢ÆWB&FvRÒæd'WGFöâçVW'•6VÆV7F÷"‚ræ6†BÖæb×Vç&VB×ccRr“°¢–b‚&FvR’°¢&FvRÒFö7VÖVçBæ7&VFTVÆVÖVçB‚w7âr“°¢&FvRæ6Æ74æÖRÒv6†BÖæb×Vç&VB×ccRs°¢æd'WGFöâæVæD6†–ÆB†&FvR“°¢Ð¢6WEVç&VD&FvUFW‡EccR†&FvRÂF÷FÂ“°¢æd'WGFöâæ6Æ74Æ—7BçFövvÆR‚v†2×Vç&VB×ccRrÂF÷FÂâ“°¢Ð ¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚r767&VVâÖ6†B¶FFÖ7F–öãÒ'6VÆV7B×F‡&VB%Õ¶FF×F‡&VBÖ¶W•Òr’æf÷$V6‚†'WGFöâÓâ°¢6öç7BF‡&VD¶W’Ò7G&–ær†'WGFöâæFF6WBçF‡&VD¶W’ÇÂrr“°¢6öç7B6&BÒ'WGFöâæ6Æ÷6W7B‚rçF‡&VBÖ6&Br“°¢–b‚6&B’&WGW&ã°¢ÆWB&FvRÒ6&BçVW'•6VÆV7F÷"‚ræ6†B×F‡&VB×Vç&VB×ccRr“°¢–b‚&FvR’°¢&FvRÒFö7VÖVçBæ7&VFTVÆVÖVçB‚w7âr“°¢&FvRæ6Æ74æÖRÒv6†B×F‡&VB×Vç&VB×ccRs°¢6öç7B&÷rÒ6&BçVW'•6VÆV7F÷"‚rçF‡&VB×&÷rr’ÇÂ6&C°¢&÷ræVæD6†–ÆB†&FvR“°¢Ð¢6öç7B6÷VçBÒ6÷VçG2ævWB‡F‡&VD¶W’’ÇÂ°¢6WEVç&VD&FvUFW‡EccR†&FvRÂ6÷VçB“°¢6&Bæ6Æ74Æ—7BçFövvÆR‚v†2×Vç&VB×ccRrÂ6÷VçBâ“°¢Ò“°¢Ð ¢gVæ7F–öâVæ†æ6UvV$ç5–6¶W'5ccR‡&ö÷BÒFö7VÖVçB’°¢&ö÷CòçVW'•6VÆV7F÷$ÆÃòâ‚w6VÆV7E¶æÖSÒ&7F÷"%ÒÂ6VÆV7E¶æÖSÒ&ç4–B%Òr’æf÷$V6‚‡6VÆV7BÓâ°¢6öç7Bç46÷VçBÒ'&’æg&öÒ‡6VÆV7Bæ÷F–öç2ÇÂµÒ’æf–ÇFW"†÷F–öâÓâ7G&–ær†÷F–öâçfÇVRÇÂrr’ç7F'G5v—F‚‚vç3¢r’ÇÂ6VÆV7BææÖRÓÓÒvç4–Br’æÆVæwFƒ°¢–b†ç46÷VçBÃÒb’°¢6VÆV7Bç&VÖ÷fTGG&–'WFR‚w6—¦Rr“°¢6VÆV7Bæ6Æ74Æ—7Bç&VÖ÷fR‚vç2×67&öÆÂ×6VÆV7B×ccBrÂvç2×67&öÆÂ×6VÆV7B×ccRr“°¢&WGW&ã°¢Ð¢6VÆV7BæFF6WBç67&öÆÆ&ÆTç5ccRÒss°¢6VÆV7Bæ6Æ74Æ—7BæFB‚vç2×67&öÆÂ×6VÆV7B×ccRr“°¢6VÆV7Bç6—¦RÒÖF‚æÖ–âƒ‚ÂÖF‚æÖ‚ƒbÂç46÷VçB²‡6VÆV7BææÖRÓÓÒv7F÷"rò¢’’“°¢6VÆV7BçF—FÆRÒ}
ýí¢å2ýí­=}-]-òs°¢Ò“°¢Ð ¢6öç7Bõ÷&VæFW$6†EccRÒ&VæFW$6†C°¢&VæFW$6†BÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒõ÷&VæFW$6†EccR‚“°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’Óâ°¢Væ†æ6UvV$ç5–6¶W'5ccR†Fö7VÖVçBævWDVÆVÖVçD'”–B‚w67&VVâÖ6†Br’ÇÂFö7VÖVçB“°¢WFFT6†EVç&VD–æF–6F÷'5ccR‡²Ö&µ6VÆV7FVC¢G'VRÒ“°¢Ò“°¢&WGW&â&W7VÇC°¢Ó° ¢6öç7Bõ÷&VæFW$7W'&VçE67&VVåccRÒ&VæFW$7W'&VçE67&VVã°¢&VæFW$7W'&VçE67&VVâÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒõ÷&VæFW$7W'&VçE67&VVåccR‚“°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’ÓâWFFT6†EVç&VD–æF–6F÷'5ccR‡²Ö&µ6VÆV7FVC¢çV’ç67&VVâÓÓÒv6†BrÒ’“°¢&WGW&â&W7VÇC°¢Ó° ¢6öç7Bõ÷&VæFW$ffV7FVE67&VVç5ccRÒ&VæFW$ffV7FVE67&VVç3°¢&VæFW$ffV7FVE67&VVç2ÒgVæ7F–öâ†6†ævVBÒ·Ò’°¢6öç7B&W7VÇBÒõ÷&VæFW$ffV7FVE67&VVç5ccR†6†ævVB“°¢–b†6†ævVBæ6†B’&WVW7Dæ–ÖF–öäg&ÖR‚‚’ÓâWFFT6†EVç&VD–æF–6F÷'5ccR‡²Ö&µ6VÆV7FVC¢çV’ç67&VVâÓÓÒv6†BrÒ’“°¢&WGW&â&W7VÇC°¢Ó°  ¢ò¢cããc‚6†BÆ—7B²6W&FR6öçfW'6F–öâÖ7FW"v–æF÷r¢ð¢gVæ7F–öâvÔ6†D7F÷%6VÆV7Ecc‚‡F‡&VB’°¢–b…7G&–ær„ç6W76–öãòç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒrÇÂF‡&VBÇÂ²v6×–vârÂvF—&V7BuÒæ–æ6ÇVFW2‡F‡&VBçG—R’’&WGW&ârs°¢6öç7BvÒÒ7W'&VçEÆ–W"‚“°¢6öç7Bç72Ò6×–väç4÷F–öç5cc"†vÒ“°¢&WGW&âÆÆ&VÂ6Æ73Ò&f–VÆB6×–vâÖ7F÷"Öf–VÆB×cc"6†BÖÖ7FW"Ö7F÷"×cc‚#ãÇ7ãí	ý-Âí"½mÂ÷7ããÇ6VÆV7B6Æ73Ò&–çWB"æÖSÒ&7F÷"#ãÆ÷F–öâfÇVSÒ&vÓ¢G¶W62†vÓòæ–BÇÂç6W76–öãòçW6W$–BÇÂrr—Ò#í	M	Â+rG¶W62†vÓòæF—7Æ”æÖRÇÂvÓòç6†÷'DæÖRÇÂ}	-]M=’r—ÓÂö÷F–öãâG¶ç72æÖ†ç3ÓæÆ÷F–öâfÇVSÒ&ç3¢G¶W62†ç2æ–B—Ò#äå2+rG¶W62†ç2ææÖRÇÂç2æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöÆ&VÃæ°¢Ð ¢gVæ7F–öâ6äÖævT6†E&÷uvV%cs‚‡&÷rÒ·Ò’°¢–b…7G&–ær„ç6W76–öãòç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’&WGW&âG'VS°¢&WGW&â7G&–ær‡&÷rç6VæFW%÷G—RÇÂrr’ÓÓÒwÆ–W"p¢bb7G&–ær‡&÷rç6VæFW%ö–BÇÂrr’ÓÓÒ7G&–ær„ç6W76–öãòçW6W$–BÇÂrr“°¢Ð ¢gVæ7F–öâ6†E&÷tÖWFvV%cs‚‡&÷rÒ·ÒÂÆ&VÂÒrr’°¢&WGW&âG¶W62†Æ&VÂ—Ò+rG¶f÷&ÖDFFR‡&÷ræ7&VFVEöB—ÒG·&÷ræVF—FVEöBòr+r}Í]Ý]Ýâr¢rwÖ°¢Ð ¢gVæ7F–öâ6†E&÷t6öçG&öÇ5vV%cs‚‡&÷rÒ·Ò’°¢–b‚6äÖævT6†E&÷uvV%cs‚‡&÷r’’&WGW&ârs°¢&WGW&âÆF—b6Æ73Ò&6†BÖ7F–öç2×cs‚#à¢Æ'WGFöâ6Æ73Ò&6†BÖ7F–öâ×cs‚"G—SÒ&'WGFöâ"FF×vV"Ö6†BÖ7F–öâ×csƒÒ&VF—B"FFÖÖW76vRÖ–CÒ"G¶W62‡&÷ræÖW76vUö–B—Ò#í	}Í]Ý-ÃÂö'WGFöãà¢Æ'WGFöâ6Æ73Ò&6†BÖ7F–öâ×cs‚FævW""G—SÒ&'WGFöâ"FF×vV"Ö6†BÖ7F–öâ×csƒÒ&FVÆWFR"FFÖÖW76vRÖ–CÒ"G¶W62‡&÷ræÖW76vUö–B—Ò#í
­½-ÃÂö'WGFöãà¢ÂöF—cæ°¢Ð ¢gVæ7F–öâf–æEvV$6†E&÷ucs‚†ÖW76vT–B’°¢&WGW&âæFFæ6†E&÷w2æf–æB‡&÷rÓâ7G&–ær‡&÷sòæÖW76vUö–BÇÂrr’ÓÓÒ7G&–ær†ÖW76vT–BÇÂrr’’ÇÂçVÆÃ°¢Ð ¢7–æ2gVæ7F–öâVF—EvV$6†E&÷ucs‚‡&÷r’°¢–b‚&÷rÇÂ6äÖævT6†E&÷uvV%cs‚‡&÷r’’F‡&÷ræWrW'&÷"‚}	Ý]Mí--í}Ýâý"M½ò}Í]Ý]Ýòíí]Ýòr“°¢6öç7B7W'&VçBÒ7G&—‡FÖÂ‡&÷ræ&öG•ö‡FÖÂÇÂrr“°¢6öç7BæW‡BÒv–æF÷rç&ö×B‚}	}Í]Ý-Âíí]ÝRrÂ7W'&VçB“°¢–b†æW‡BÓÒçVÆÂ’&WGW&âfÇ6S°¢6öç7B6ÆVâÒ7G&–ær†æW‡B’çG&–Ò‚“°¢–b‚6ÆVâ’F‡&÷ræWrW'&÷"‚}	ý=-íRíí]ÝRÝ]½Í}òí]Ý-Âr“°¢6öç7Bæ÷rÒæWrFFR‚’çFô•4õ7G&–ær‚“°¢6öç7B6fVBÒv—B•W6W'D6†B„æ6öæf–rÂ°¢ââç&÷rÀ¢&öG•ö‡FÖÃ¢ÇâG¶W62†6ÆVâ—ÓÂ÷æÀ¢VF—FVEöC¢æ÷rÀ¢6Æ–VçE÷WFFVEöC¢æ÷p¢Ò“°¢æFFæ6†E&÷w2ÒÖW&vT6†E&÷w2„æFFæ6†E&÷w2Â·6fVEÒ“°¢v—B6fT66†R‚“°¢&VæFW$6†B‚“°¢–b„çV’æ6†DÖ7FW$÷Våcc‚bbçV’ç6VÆV7FVEF‡&VD¶W’’&VæFW%vV$6†DÖ7FW%cc‚„çV’ç6VÆV7FVEF‡&VD¶W’“°¢æ÷F–g’‚}
íí]ÝR}Í]Ý]ÝârÂvö²r“°¢&WGW&âG'VS°¢Ð ¢7–æ2gVæ7F–öâ6ögDFVÆWFUvV$6†E&÷ucs‚‡&÷r’°¢–b‚&÷rÇÂ6äÖævT6†E&÷uvV%cs‚‡&÷r’’F‡&÷ræWrW'&÷"‚}	Ý]Mí--í}Ýâý"M½ò­½-òíí]Ýòr“°¢–b‚v–æF÷ræ6öæf—&Ò‚}
­½-Âíí]ÝSò	íÝâ}]}Ý]"r}-ÂÝâí]Ý-òÝ]-]RM½òÍíM]m‚‚]}íýÝí-‚âr’’&WGW&âfÇ6S°¢6öç7Bæ÷rÒæWrFFR‚’çFô•4õ7G&–ær‚“°¢6öç7B6fVBÒv—B•W6W'D6†B„æ6öæf–rÂ°¢ââç&÷rÀ¢FVÆWFVEöC¢æ÷rÀ¢VF—FVEöC¢çVÆÂÀ¢6Æ–VçE÷WFFVEöC¢æ÷p¢Ò“°¢æFFæ6†E&÷w2ÒÖW&vT6†E&÷w2„æFFæ6†E&÷w2Â·6fVEÒ“°¢v—B6fT66†R‚“°¢&VæFW$6†B‚“°¢–b„çV’æ6†DÖ7FW$÷Våcc‚bbçV’ç6VÆV7FVEF‡&VD¶W’’&VæFW%vV$6†DÖ7FW%cc‚„çV’ç6VÆV7FVEF‡&VD¶W’“°¢æ÷F–g’‚}
íí]ÝR­½-ârÂvö²r“°¢&WGW&âG'VS°¢Ð ¢gVæ7F–öâ6†EF‡&VD6&Ecc‚‡F‡&VB’°¢6öç7BÆ7BÒÖW76vW4f÷%F‡&VB‡F‡&VBæ¶W’’ç6Æ–6R‚Ó•³ÒÇÂçVÆÃ°¢6öç7BW–V'&÷rÒF‡&VBçG—RÓÓÒv6×–vârò}	í	
		’
}	
"r¢‡F‡&VBçG—RÓÓÒvç2ròtå2r¢}	½	
}	Ý
½	’
}	
"r“°¢&WGW&âÆ'F–6ÆR6Æ73Ò'F‡&VBÖ6&B6†BÖÆ—7BÖ6&B×cc‚G·F‡&VBçG—RÓÓÒv6×–vâròv6×–vâ×F‡&VBÖ6&B×cc"r¢rwÒ#à¢ÆF—b6Æ73Ò'F‡&VB×&÷r#à¢G·&VæFW$VçF—G”fF"‡F‡&VBæVçF—G’ÇÂ·ÒÂF‡&VBæÆ&VÂ—Ð¢ÆF—b6Æ73Ò'F‡&VBÖ6÷’#ãÆF—b6Æ73Ò&W–V'&÷r#âG¶W–V'&÷wÓÂöF—cãÆƒ3âG¶W62‡F‡&VBæÆ&VÂ—ÓÂöƒ3ãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62†Æ7Bò7G&—‡FÖÂ†Æ7Bæ&öG•ö‡FÖÂÇÂrr’ç6Æ–6RƒÂ“b’¢‡F‡&VBç7V'F—FÆRÇÂ}	]ríí]Ý’r’—ÓÂöF—cãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò&VçF—G’Ö7F–öç2#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'6VÆV7B×F‡&VB"FF×F‡&VBÖ¶W“Ò"G¶W62‡F‡&VBæ¶W’—Ò#í	í-­½-ÃÂö'WGFöããÂöF—cà¢Âö'F–6ÆSæ°¢Ð ¢gVæ7F–öâVç7W&UvV$6†DÖ7FW$†÷7Ecc‚‚’°¢ÆWB†÷7BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚v6†BÖÖ7FW"ÖÖöFÂ×cc‚r“°¢–b††÷7B’&WGW&â†÷7C°¢†÷7BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“°¢†÷7Bæ–BÒv6†BÖÖ7FW"ÖÖöFÂ×cc‚s°¢†÷7Bæ6Æ74æÖRÒv6†BÖÖ7FW"ÖÖöFÂ×cc‚†–FFVâs°¢†÷7Bç6WDGG&–'WFR‚v&–Ö†–FFVârÂwG'VRr“°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB††÷7B“°¢&WGW&â†÷7C°¢Ð ¢gVæ7F–öâ6Æ÷6UvV$6†DÖ7FW%cc‚‚’°¢6öç7B†÷7BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚v6†BÖÖ7FW"ÖÖöFÂ×cc‚r“°¢–b‚†÷7B’&WGW&ã°¢çV’æ6†DÖ7FW$÷Våcc‚ÒfÇ6S°¢†÷7Bæ6Æ74Æ—7BæFB‚v†–FFVâr“°¢†÷7Bç6WDGG&–'WFR‚v&–Ö†–FFVârÂwG'VRr“°¢†÷7Bæ–ææW$…DÔÂÒrs°¢WFFT6†EVç&VD–æF–6F÷'5ccR‡²Ö&µ6VÆV7FVC¢fÇ6RÒ“°¢Ð ¢gVæ7F–öâ&VæFW%vV$6†DÖ7FW%cc‚‡F‡&VD¶W’ÒçV’ç6VÆV7FVEF‡&VD¶W’’°¢6öç7B†÷7BÒVç7W&UvV$6†DÖ7FW$†÷7Ecc‚‚“°¢6öç7BF‡&VBÒ'V–ÆEF‡&VG2‚’æf–æB†—FVÒÓâ—FVÒæ¶W’ÓÓÒ7G&–ær‡F‡&VD¶W’ÇÂrr’“°¢–b‚F‡&VB’²6Æ÷6UvV$6†DÖ7FW%cc‚‚“²&WGW&ã²Ð¢çV’ç6VÆV7FVEF‡&VD¶W’ÒF‡&VBæ¶W“°¢çV’æ6†DÖ7FW$÷Våcc‚ÒG'VS°¢Ö&µF‡&VE&VEccR‡F‡&VBæ¶W’“°¢6öç7BÖW76vW2ÒÖW76vW4f÷%F‡&VB‡F‡&VBæ¶W’“°¢†÷7Bæ–ææW$…DÔÂÒÆF—b6Æ73Ò&6†BÖÖ7FW"Ö&6¶G&÷×cc‚"FFÖ6†BÖÖ7FW"Ö6Æ÷6R×ccƒãÂöF—cà¢Ç6V7F–öâ6Æ73Ò&6†BÖÖ7FW"×v–æF÷r×cc‚"&öÆSÒ&F–Æör"&–ÖÖöFÃÒ'G'VR"&–ÖÆ&VÃÒ"G¶W62‡F‡&VBæÆ&VÂ—Ò#à¢Æ†VFW"6Æ73Ò&6†BÖÖ7FW"Ö†VFW"×cc‚#à¢ÆF—b6Æ73Ò'F‡&VB×&÷r6ö×7B#âG·&VæFW$VçF—G”fF"‡F‡&VBæVçF—G’ÇÂ·ÒÂF‡&VBæÆ&VÂÂw6Òr—ÓÆF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#âG¶W62‡F‡&VBæÆ&VÂ—ÓÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62‡F‡&VBç7V'F—FÆRÇÂrr—ÓÂöF—cãÂöF—cãÂöF—cà¢Æ'WGFöâ6Æ73Ò&6†BÖÖ7FW"Ö6Æ÷6R×cc‚"G—SÒ&'WGFöâ"FFÖ6†BÖÖ7FW"Ö6Æ÷6R×cc‚&–ÖÆ&VÃÒ-	}­½-Â#ì9sÂö'WGFöãà¢Âö†VFW#à¢G¶6×–väÖVÖ&W$Æ–æUcc"‡F‡&VB—Ð¢ÆF—b6Æ73Ò&ÖW76vRÖÆ—7B6†BÖÖ7FW"ÖÖW76vRÖÆ—7B×cc‚#à¢G¶ÖW76vW2æÖ‡&÷rÓâ²6öç7BÖWFÒ6×–väÖW76vT7F÷$Ö&·Wcc"‡&÷rÂF‡&VB“²&WGW&âÆF—b6Æ73Ò&6†B×&÷rG¶ÖWFæ÷vâòv÷vâr¢rwÒ#âG·&VæFW$VçF—G”fF"†ÖWFæ7F÷"ÇÂ·ÒÂÖWFæÆ&VÂÂw6Òr—ÓÆF—b6Æ73Ò&6†BÖ'V&&ÆRG¶ÖWFæ÷vâòv÷vâr¢rwÒG·&÷rç6VæFW%÷G—RÓÓÒvç2ròvç2ÖÖW76vR×cc"r¢rwÒ#ãÆF—b6Æ73Ò&6†BÖ†VB×&÷r×cs‚#ãÆF—b6Æ73Ò&6†BÖÖWF#âG¶6†E&÷tÖWFvV%cs‚‡&÷rÂÖWFæÆ&VÂ—ÓÂöF—câG¶6†E&÷t6öçG&öÇ5vV%cs‚‡&÷r—ÓÂöF—cãÆF—b6Æ73Ò&'F–6ÆRÖ&öG’#âG¶æ÷&ÖÆ—¦U&–6„‡FÖÂ‡&÷ræ&öG•ö‡FÖÂÇÂrr—ÓÂöF—cãÂöF—cãÂöF—cæ²Ò’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'Æ6V†öÆFW"#í
íí]Ý’]Ý]"ãÂöF—câwÐ¢ÂöF—cà¢Æf÷&Ò–CÒ&6†BÖ6ö×÷6RÖf÷&Ò"6Æ73Ò&6†BÖ6ö×÷6R6†BÖÖ7FW"Ö6ö×÷6R×cc‚"FF×F‡&VBÖ¶W“Ò"G¶W62‡F‡&VBæ¶W’—Ò#à¢G¶vÔ6†D7F÷%6VÆV7Ecc‚‡F‡&VB—Ð¢ÇFW‡F&V6Æ73Ò'FW‡F&V"æÖSÒ&&öG’"&÷w3Ò#B"Æ6V†öÆFW#Ò"G·F‡&VBçG—RÓÓÒv6×–vârò}	Ýý-Â"í’}"­ÍýÝ‚âââr¢F‡&VBçG—RÓÓÒvç2rò}	Ýý-Âå2âââr¢}	Ýý-Âíí]ÝRâââwÒ#âG¶W62„çV’æ6†DG&gG5·F‡&VBæ¶W•ÒÇÂrr—ÓÂ÷FW‡F&Và¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í	í-ý--ÃÂö'WGFöãà¢Âöf÷&Óà¢Â÷6V7F–öãæ°¢†÷7Bæ6Æ74Æ—7Bç&VÖ÷fR‚v†–FFVâr“°¢†÷7Bç6WDGG&–'WFR‚v&–Ö†–FFVârÂvfÇ6Rr“°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’Óâ°¢Væ†æ6UvV$ç5–6¶W'5ccR††÷7B“°¢6öç7BÆ—7BÒ†÷7BçVW'•6VÆV7F÷"‚ræ6†BÖÖ7FW"ÖÖW76vRÖÆ—7B×cc‚r“°¢–b†Æ—7B’°¢Æ—7Bç67&öÆÅF÷ÒÆ—7Bç67&öÆÄ†V–v‡C°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’Óâ²Æ—7Bç67&öÆÅF÷ÒÆ—7Bç67&öÆÄ†V–v‡C²Ò“°¢Ð¢WFFT6†EVç&VD–æF–6F÷'5ccR‡²Ö&µ6VÆV7FVC¢fÇ6RÒ“°¢Ò“°¢Ð ¢gVæ7F–öâ÷VåvV$6†DÖ7FW%cc‚‡F‡&VD¶W’’°¢&VæFW%vV$6†DÖ7FW%cc‚‡F‡&VD¶W’“°¢Ð ¢6öç7Bõ÷&VæFW$6†Ecc‚Ò&VæFW$6†C°¢&VæFW$6†BÒgVæ7F–öâ‚’°¢6WEF÷&"‚}
íí]ÝòrÂrr“°¢6öç7B&ö÷BÒB‚r767&VVâÖ6†Br“°¢–b‚&ö÷B’&WGW&ã°¢6öç7BF‡&VG2Ò'V–ÆEF‡&VG2‚“°¢–b„çV’ç6VÆV7FVEF‡&VD¶W’bbF‡&VG2ç6öÖR‡F‡&VBÓâF‡&VBæ¶W’ÓÓÒçV’ç6VÆV7FVEF‡&VD¶W’’’çV’ç6VÆV7FVEF‡&VD¶W’Òrs°¢&ö÷Bæ–ææW$…DÔÂÒÆF—b6Æ73Ò&6†BÖÆ—7BÖöæÇ’×cc‚#ãÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc#ãÆF—cãÆF—b6Æ73Ò&W–V'&÷r#í
}	
-
³ÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
íí]ÝóÂöF—cãÂöF—cãÂöF—cãÆF—b6Æ73Ò'F‡&VBÖÆ—7B6†BÖ6öçF7BÖÆ—7B6†BÖ6öçF7BÖÆ—7BÖöæÇ’×cc‚#âG·F‡&VG2æÖ†6†EF‡&VD6&Ecc‚’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'Æ6V†öÆFW"#í	Ý]"Mí-=ýÝ½R­Ý½í"-ý}‚ãÂöF—câwÓÂöF—cãÂöF—cæ°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’ÓâWFFT6†EVç&VD–æF–6F÷'5ccR‡²Ö&µ6VÆV7FVC¢fÇ6RÒ’“°¢Ó° ¢6öç7Bõ÷WFFT6†EVç&VD–æF–6F÷'5cc‚ÒWFFT6†EVç&VD–æF–6F÷'5ccS°¢WFFT6†EVç&VD–æF–6F÷'5ccRÒgVæ7F–öâ†÷F–öç2Ò·Ò’°¢&WGW&âõ÷WFFT6†EVç&VD–æF–6F÷'5cc‚‡²ââæ÷F–öç2ÂÖ&µ6VÆV7FVC¢&ööÆVâ†÷F–öç2æÖ&µ6VÆV7FVBbbçV’æ6†DÖ7FW$÷Våcc‚’Ò“°¢Ó° ¢6öç7Bõ÷6VæDÖW76vUcc‚Ò6VæDÖW76vS°¢6VæDÖW76vRÒ7–æ2gVæ7F–öâ†f÷&Ò’°¢6öç7BF‡&VD¶W’Ò7G&–ær†f÷&ÓòæFF6WCòçF‡&VD¶W’ÇÂrr“°¢6öç7BF‡&VBÒ'V–ÆEF‡&VG2‚’æf–æB†—FVÒÓâ—FVÒæ¶W’ÓÓÒF‡&VD¶W’“°¢–b‡F‡&VCòçG—RÓÓÒvF—&V7Brbb7G&–ær„ç6W76–öãòç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’°¢6öç7BfBÒæWrf÷&ÔFF†f÷&Ò“°¢6öç7B&öG’Ò7G&–ær†fBævWB‚v&öG’r’ÇÂrr’çG&–Ò‚“°¢6öç7B7F÷"Ò7G&–ær†fBævWB‚v7F÷"r’ÇÂrr“°¢–b†&öG’bb7F÷"ç7F'G5v—F‚‚vç3¢r’’°¢6öç7Bç4–BÒ7F÷"ç6Æ–6RƒB“°¢6öç7Bç2ÒæFFæç72ævWB†ç4–B“°¢6öç7BF&vWBÒæFFçÆ–W'2ævWB‡F‡&VBæ÷F†W$–B“°¢–b‚ç2’F‡&÷ræWrW'&÷"‚tå2ÝRÝM]Òr“°¢–b‚F&vWBÇÂ7G&–ær‡F&vWBç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’F‡&÷ræWrW'&÷"‚}
Ý-í"ý]íÝbÝ]Mí-=ý]ÒM½ò½}Ýí=â}-r“°¢6öç7B&÷rÒ²ÖW76vUö–C¦×6uòG´FFRææ÷r‚’çFõ7G&–ærƒ3b—ÕòG´ÖF‚ç&æFöÒ‚’çFõ7G&–ærƒ3b’ç6Æ–6Rƒ"Ãr—ÖÂ¶–æC¢vF—&V7BrÂF‡&VEö¶W“§F‡&VBæ¶W’Â6VæFW%÷G—S¢vç2rÂ6VæFW%ö–C¦ç2æ–BÂ&V6—–VçE÷Æ–W%ö–C§F&vWBæ–BÂç5ö–C¦ç2æ–BÂF—&V7Eö¦7W'&VçEÆ–W"‚“òæ–BÇÂç6W76–öãòçW6W$–BÇÂrrÂF—&V7Eö#§F&vWBæ–BÂWF†÷%öÆ&VÃ¦ç2ææÖRÇÂç2æ–BÂ&öG•ö‡FÖÃ¦ÇâG¶W62†&öG’—ÓÂ÷æÓ°¢6öç7B6fVBÒv—B•W6W'D6†B„æ6öæf–rÇ&÷r“°¢æFFæ6†E&÷w2ÒÖW&vT6†E&÷w2„æFFæ6†E&÷w2Å·6fVEÒ“°¢v—B6fT66†R‚“°¢çV’æ6†DG&gG5·F‡&VBæ¶W•ÓÒrs°¢f÷&Òç&W6WB‚“°¢&VæFW$6†B‚“°¢&VæFW%vV$6†DÖ7FW%cc‚‡F‡&VBæ¶W’“°¢æ÷F–g’†
íí]ÝRí-ý-½]Ýâí"Í]Ý‚G¶ç2ææÖRÇÂç2æ–GÖÂvö²r“°¢&WGW&ã°¢Ð¢Ð¢v—Bõ÷6VæDÖW76vUcc‚†f÷&Ò“°¢–b„çV’æ6†DÖ7FW$÷Våcc‚bbF‡&VD¶W’’&VæFW%vV$6†DÖ7FW%cc‚‡F‡&VD¶W’“°¢Ó° ¢6öç7Bõ÷&VæFW$ffV7FVE67&VVç5cc‚Ò&VæFW$ffV7FVE67&VVç3°¢&VæFW$ffV7FVE67&VVç2ÒgVæ7F–öâ†6†ævVBÒ·Ò’°¢6öç7B&W7VÇBÒõ÷&VæFW$ffV7FVE67&VVç5cc‚†6†ævVB“°¢–b†6†ævVBæ6†BbbçV’æ6†DÖ7FW$÷Våcc‚bbçV’ç6VÆV7FVEF‡&VD¶W’’&WVW7Dæ–ÖF–öäg&ÖR‚‚’Óâ&VæFW%vV$6†DÖ7FW%cc‚„çV’ç6VÆV7FVEF‡&VD¶W’’“°¢&WGW&â&W7VÇC°¢Ó° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢6öç7B7F–öâÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö6†BÖ7F–öâ×cs…Òr“°¢–b†7F–öâ’°¢WfVçBç&WfVçDFVfVÇB‚“°¢WfVçBç7F÷&÷vF–öâ‚“°¢–b†7F–öâæF—6&ÆVB’&WGW&ã°¢6öç7B&÷rÒf–æEvV$6†E&÷ucs‚†7F–öâæFF6WBæÖW76vT–B“°¢–b‚&÷r’²æ÷F–g’‚}
íí]ÝRÝRÝM]ÝârÂwv&âr“²&WGW&ã²Ð¢7F–öâæF—6&ÆVBÒG'VS°¢6öç7BF6²Ò7F–öâæFF6WBçvV$6†D7F–öåcs‚ÓÓÒvFVÆWFRp¢ò6ögDFVÆWFUvV$6†E&÷ucs‚‡&÷r¢¢VF—EvV$6†E&÷ucs‚‡&÷r“°¢&öÖ—6Rç&W6öÇfR‡F6²’æ6F6‚†W'&÷"Óâæ÷F–g’†W'&÷"æÖW76vRÇÂ7G&–ær†W'&÷"’ÂvW'"r’’æf–æÆÇ’‚‚’Óâ²7F–öâæF—6&ÆVBÒfÇ6S²Ò“°¢&WGW&ã°¢Ð¢6öç7B6Æ÷6RÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖ6†BÖÖ7FW"Ö6Æ÷6R×cc…Òr“°¢–b‚6Æ÷6R’&WGW&ã°¢–b†6Æ÷6Ræ6Æ74Æ—7Bæ6öçF–ç2‚v6†BÖÖ7FW"Ö&6¶G&÷×cc‚r’bbWfVçBçF&vWBÓÒ6Æ÷6R’&WGW&ã°¢6Æ÷6UvV$6†DÖ7FW%cc‚‚“°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v¶W–F÷vârÂWfVçBÓâ²–b†WfVçBæ¶W’ÓÓÒtW66RrbbçV’æ6†DÖ7FW$÷Våcc‚’6Æ÷6UvV$6†DÖ7FW%cc‚‚“²Ò“° ¢ò¢cããcr–çfVçF÷'’w&–BÂ6''––ærÆ–Ö—G2æBWV—ÖVçB6Æ÷G2¢ð¢6öç7BDTdTÅEô”ådTåDõ%•õ4•¤UõccrÒ#°¢6öç7BDTdTÅEô4%%•õtT”t…EõccrÒ#°¢gVæ7F–öâ–çDæöäæVvF—fUvV%ccr‡fÇVRÆfÆÆ&6³Ó—¶6öç7BãÔçVÖ&W"‡fÇVR“·&WGW&âçVÖ&W"æ—4f–æ—FR†â“ôÖF‚æÖ‚ƒÄÖF‚æfÆö÷"†â’“¦fÆÆ&6³·Ð¢gVæ7F–öâçVÔæöäæVvF—fUvV%ccr‡fÇVRÆfÆÆ&6³Ó—¶6öç7BãÔçVÖ&W"‡fÇVR“·&WGW&âçVÖ&W"æ—4f–æ—FR†â“ôÖF‚æÖ‚ƒÆâ“¦fÆÆ&6³·Ð¢gVæ7F–öâ—FVÕ6—¦UvV%ccr†—FVÓ×·Ò—·&WGW&ç·s¤ÖF‚æÖ‚ƒÆ–çDæöäæVvF—fUvV%ccr†—FVÒæ–çfVçF÷'•v–GFƒóö—FVÒç6—¦Uv–GFƒóö—FVÒçv–GF„6VÆÇ3óóÃ’’Æƒ¤ÖF‚æÖ‚ƒÆ–çDæöäæVvF—fUvV%ccr†—FVÒæ–çfVçF÷'”†V–v‡Cóö—FVÒç6—¦T†V–v‡Cóö—FVÒæ†V–v‡D6VÆÇ3óóÃ’—Ó·Ð¢gVæ7F–öâ—FVÔÖ75vV%ccr†—FVÓ×·Ò—·&WGW&âçVÔæöäæVvF—fUvV%ccr†—FVÒæÖ73óö—FVÒçvV–v‡CóóÃ“·Ð¢gVæ7F–öâ—FVÕG—UvV%ccr†—FVÓ×·Ò—·&WGW&âæ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÒ“·Ð¢gVæ7F–öâ—FVÕvV%ccr†—FVÔ–B—·&WGW&âæFFæ—FV×2ævWB…7G&–ær†—FVÔ–GÇÂrr’—ÇÇ¶–C¥7G&–ær†—FVÔ–GÇÂrr’ÆæÖS¥7G&–ær†—FVÔ–GÇÂrr’ÇG—S¢vvV"rÆÖ73£Æ–çfVçF÷'•v–GFƒ£Æ–çfVçF÷'”†V–v‡C£Ó·Ð¢gVæ7F–öâæ÷&ÖÆ—¦T–çfVçF÷'”VçG'•vV%ccr†VçG'“×·Ò—¶6öç7BG“Ö–çDæöäæVvF—fUvV%ccr†VçG'’çG’Ã“¶6öç7B÷6—F–öç3Ô'&’æ—4'&’†VçG'’ç÷6—F–öç2“öVçG'’ç÷6—F–öç2ç6Æ–6RƒÇG’’æÖ‡÷3Óç÷2bdçVÖ&W"æ—4–çFVvW"„çVÖ&W"‡÷2ç‚’’bdçVÖ&W"æ—4–çFVvW"„çVÖ&W"‡÷2ç’’’bdçVÖ&W"‡÷2ç‚“ãÓbdçVÖ&W"‡÷2ç’“ãÓ÷·ƒ¤çVÖ&W"‡÷2ç‚’Ç“¤çVÖ&W"‡÷2ç’—Ó¦çVÆÂ“¥µÓ·&WGW&ç²ââæVçG'’Æ—FVÔ–C¥7G&–ær†VçG'’æ—FVÔ–GÇÂrr’ÇG’Ç÷6—F–öç7Ó·Ð¢gVæ7F–öâæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡Æ–W#×·Ò—°¢6öç7BæW‡CÖFVW‡Æ–W'ÇÇ·Ò“°¢æW‡Bæ–çfVçF÷'•6—¦SÖ–çDæöäæVvF—fUvV%ccr†æW‡Bæ–çfVçF÷'•6—¦RÄDTdTÅEô”ådTåDõ%•õ4•¤Uõccr“°¢æW‡Bæ6''•vV–v‡DÖƒÖçVÔæöäæVvF—fUvV%ccr†æW‡Bæ6''•vV–v‡DÖƒóöæW‡BæÖ„6''•vV–v‡BÄDTdTÅEô4%%•õtT”t…Eõccr“°¢æW‡Bæ–çfVçF÷'“Ò„'&’æ—4'&’†æW‡Bæ–çfVçF÷'’“öæW‡Bæ–çfVçF÷'“¥µÒ’æÖ†æ÷&ÖÆ—¦T–çfVçF÷'”VçG'•vV%ccr’æf–ÇFW"†VçG'“ÓæVçG'’æ—FVÔ–BbfVçG'’çG“ã“°¢æW‡BæWV—ÖVçE6Æ÷G3×·&–Ö'•vVöã¢rrÇ6V6öæF'•vVöã¢rrÆ&Ö÷#¢rrÂâââ†æW‡BæWV—ÖVçE6Æ÷G7ÇÇ·Ò—Ó°¢6öç7BÆVv7•6Æ÷G3Ô'&’æ—4'&’†æW‡Bæ–×ÆçE6Æ÷G2“öæW‡Bæ–×ÆçE6Æ÷G3¢„'&’æ—4'&’†æW‡Bæ–ç7FÆÆVD–×ÆçD–G2“öæW‡Bæ–ç7FÆÆVD–×ÆçD–G3¥µÒ“°¢æW‡Bæ–×ÆçE6Æ÷D6÷VçCÖæW‡Bæ–×ÆçE6Æ÷D6÷VçCÓÖçVÆÃöÆVv7•6Æ÷G2æf–ÇFW"„&ööÆVâ’æÆVæwFƒ¦–çDæöäæVvF—fUvV%ccr†æW‡Bæ–×ÆçE6Æ÷D6÷VçBÃ“°¢æW‡Bæ–×ÆçE6Æ÷G3Ô'&’æg&öÒ‡¶ÆVæwFƒ¦æW‡Bæ–×ÆçE6Æ÷D6÷VçGÒÂ…òÆ–æFW‚“Óå7G&–ær†ÆVv7•6Æ÷G5¶–æFW…×ÇÂrr’“°¢æW‡Bæ–ç7FÆÆVD–×ÆçD–G3ÖæW‡Bæ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ“°¢&WGW&âæW‡C°¢Ð¢gVæ7F–öâ–çfVçF÷'”6öÇ5vV%ccr‡6—¦R—·&WGW&âÖF‚æÖ‚ƒÄÖF‚æ6V–Â„ÖF‚ç7'B„ÖF‚æÖ‚ƒÆ–çDæöäæVvF—fUvV%ccr‡6—¦RÄDTdTÅEô”ådTåDõ%•õ4•¤Uõccr’’’’“·Ð¢gVæ7F–öâWV—VD6÷VçG5vV%ccr‡W6W#×·Ò—¶6öç7BÖÖæWrÖ‚“¶6öç7BFCÖ–CÓç¶6öç7B¶W“Õ7G&–ær†–GÇÂrr“¶–b†¶W’–Öç6WB†¶W’Â†ÖævWB†¶W’—ÇÃ’³“·Ó¶FB‡W6W"æWV—ÖVçE6Æ÷G3òç&–Ö'•vVöâ“¶FB‡W6W"æWV—ÖVçE6Æ÷G3òç6V6öæF'•vVöâ“¶FB‡W6W"æWV—ÖVçE6Æ÷G3òæ&Ö÷"“²‡W6W"æ–×ÆçE6Æ÷G7ÇÅµÒ’æf÷$V6‚†FB“·&WGW&âÖ·Ð¢gVæ7F–öâ–çfVçF÷'•vV–v‡EvV%ccr‡W6W#×·Ò—·&WGW&â‡W6W"æ–çfVçF÷'—ÇÅµÒ’ç&VGV6R‚‡7VÒÆVçG'’“Óç7VÒ¶—FVÔÖ75vV%ccr†—FVÕvV%ccr†VçG'’æ—FVÔ–B’’¦–çDæöäæVvF—fUvV%ccr†VçG'’çG’Ã’Ã“·Ð¢gVæ7F–öâÖ&´ö65vV%ccr†ö67W–VBÇ‚Ç’ÇrÆ‚ÇfÇVS×G'VR—¶f÷"†ÆWB—“×“·—“Ç’¶ƒ·—’²²–f÷"†ÆWB‡ƒ×ƒ·‡ƒÇ‚·s·‡‚²²—¶6öç7B¶W“ÖG·‡‡Ó¢G·——Ö¶–b‡fÇVR–ö67W–VBæFB†¶W’“¶VÇ6Rö67W–VBæFVÆWFR†¶W’“·×Ð¢gVæ7F–öâf—G5vV%ccr‡6—¦RÆ6öÇ2Æö67W–VBÇ‚Ç’ÇrÆ‚—¶–b‡ƒÃÇÇ“ÃÇÇ‚·sæ6öÇ2—&WGW&âfÇ6S¶f÷"†ÆWB—“×“·—“Ç’¶ƒ·—’²²–f÷"†ÆWB‡ƒ×ƒ·‡ƒÇ‚·s·‡‚²²—¶6öç7B–æFWƒ×—’¦6öÇ2·‡ƒ¶–b†–æFWƒÃÇÆ–æFWƒã×6—¦WÇÆö67W–VBæ†2†G·‡‡Ó¢G·——Ö’—&WGW&âfÇ6S·×&WGW&âG'VS·Ð¢gVæ7F–öâf—'7Df—EvV%ccr‡6—¦RÆ6öÇ2Æö67W–VBÇrÆ‚—¶6öç7B&÷w3ÔÖF‚æ6V–Â„ÖF‚æÖ‚ƒÇ6—¦R’ö6öÇ2“¶f÷"†ÆWB“Ó·“Ç&÷w3·’²²–f÷"†ÆWBƒÓ·ƒÆ6öÇ3·‚²²––b†f—G5vV%ccr‡6—¦RÆ6öÇ2Æö67W–VBÇ‚Ç’ÇrÆ‚’—&WGW&ç·‚Ç—Ó·&WGW&âçVÆÃ·Ð¢gVæ7F–öâ'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccr‡&uW6W#×·Ò—°¢6öç7BW6W#Öæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡&uW6W"“¶6öç7B6—¦S×W6W"æ–çfVçF÷'•6—¦RÆ6öÇ3Ö–çfVçF÷'”6öÇ5vV%ccr‡6—¦R’ÆWV—VCÖWV—VD6÷VçG5vV%ccr‡W6W"’Æö67W–VCÖæWr6WB‚’Æ–ç7Fæ6W3ÕµÒÆ÷fW&fÆ÷sÕµÓ°¢f÷"†6öç7BVçG'’öbW6W"æ–çfVçF÷'’—¶6öç7B—FVÓÖ—FVÕvV%ccr†VçG'’æ—FVÔ–B’Ç7£Ö—FVÕ6—¦UvV%ccr†—FVÒ’Ç6¶—ÔÖF‚æÖ–â†VçG'’çG’ÆWV—VBævWB†VçG'’æ—FVÔ–B—ÇÃ“¶f÷"†ÆWBVæ—D–æFWƒ×6¶—·Væ—D–æFWƒÆVçG'’çG“·Væ—D–æFW‚²²—¶6öç7B¶W“ÖG¶VçG'’æ—FVÔ–GÓ£¢G·Væ—D–æFW‡Ö¶ÆWB÷3ÖVçG'’ç÷6—F–öç3òå·Væ—D–æFW…×ÇÆçVÆÃ¶–b‚÷7ÇÂf—G5vV%ccr‡6—¦RÆ6öÇ2Æö67W–VBÇ÷2ç‚Ç÷2ç’Ç7¢çrÇ7¢æ‚’—÷3Öf—'7Df—EvV%ccr‡6—¦RÆ6öÇ2Æö67W–VBÇ7¢çrÇ7¢æ‚“¶6öç7B–ç7C×¶¶W’Æ—FVÔ–C¦VçG'’æ—FVÔ–BÇVæ—D–æFW‚Æ—FVÒÇs§7¢çrÆƒ§7¢æ‚Ç÷7Ó¶–b‡÷2—¶Ö&´ö65vV%ccr†ö67W–VBÇ÷2ç‚Ç÷2ç’Ç7¢çrÇ7¢æ‚“¶–ç7Fæ6W2çW6‚†–ç7B“·ÖVÇ6R÷fW&fÆ÷rçW6‚†–ç7B“·×Ð¢&WGW&ç·W6W"Ç6—¦RÆ6öÇ2Ç&÷w3¤ÖF‚æ6V–Â„ÖF‚æÖ‚ƒÇ6—¦R’ö6öÇ2’Æ–ç7Fæ6W2Æ÷fW&fÆ÷rÇvV–v‡C¦–çfVçF÷'•vV–v‡EvV%ccr‡W6W"—Ó°¢Ð¢gVæ7F–öâ6WE÷6—F–öåvV%ccr‡W6W"Æ—FVÔ–BÇVæ—D–æFW‚Ç÷2—¶6öç7BVçG'“Ò‡W6W"æ–çfVçF÷'—ÇÅµÒ’æf–æB‡&÷sÓç&÷ræ—FVÔ–CÓÓÖ—FVÔ–B“¶–b‚VçG'’—&WGW&âfÇ6S¶VçG'’ç÷6—F–öç3Ô'&’æ—4'&’†VçG'’ç÷6—F–öç2“öVçG'’ç÷6—F–öç3¥µÓ·v†–ÆR†VçG'’ç÷6—F–öç2æÆVæwFƒÆVçG'’çG’–VçG'’ç÷6—F–öç2çW6‚†çVÆÂ“¶VçG'’ç÷6—F–öç5·Væ—D–æFW…Ó×÷3÷·ƒ¦–çDæöäæVvF—fUvV%ccr‡÷2ç‚’Ç“¦–çDæöäæVvF—fUvV%ccr‡÷2ç’—Ó¦çVÆÃ·&WGW&âG'VS·Ð¢gVæ7F–öâ6åÆ6UvV%ccr‡W6W"Æ—FVÔ–BÇVæ—D–æFW‚Ç‚Ç’—¶6öç7BÆ–÷WCÖ'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccr‡W6W"’Æö67W–VCÖæWr6WB‚’ÆÖ÷f–æsÖG¶—FVÔ–GÓ£¢G·Væ—D–æFW‡Ö¶Æ–÷WBæ–ç7Fæ6W2æf–ÇFW"†“Óæ’æ¶W’ÓÖÖ÷f–ærbf’ç÷2’æf÷$V6‚†“ÓæÖ&´ö65vV%ccr†ö67W–VBÆ’ç÷2ç‚Æ’ç÷2ç’Æ’çrÆ’æ‚’“¶6öç7B7£Ö—FVÕ6—¦UvV%ccr†—FVÕvV%ccr†—FVÔ–B’“·&WGW&âf—G5vV%ccr†Æ–÷WBç6—¦RÆÆ–÷WBæ6öÇ2Æö67W–VBÇ‚Ç’Ç7¢çrÇ7¢æ‚“·Ð¢gVæ7F–öâvWE6Æ÷EvV%ccr‡W6W"ÇG—RÆ–æFWƒÒÓ—·&WGW&âG—SÓÓÒv–×ÆçBsõ7G&–ær‡W6W"æ–×ÆçE6Æ÷G3òå¶–æFW…×ÇÂrr“¥7G&–ær‡W6W"æWV—ÖVçE6Æ÷G3òå·G—U×ÇÂrr“·Ð¢gVæ7F–öâ6WE6Æ÷EvV%ccr‡W6W"ÇG—RÆ–æFW‚Æ—FVÔ–B—¶–b‡G—SÓÓÒv–×ÆçBr—·W6W"æ–×ÆçE6Æ÷G3Ô'&’æg&öÒ‡¶ÆVæwFƒ§W6W"æ–×ÆçE6Æ÷D6÷VçGÒÂ…òÆ’“Óå7G&–ær‡W6W"æ–×ÆçE6Æ÷G3òå¶•×ÇÂrr’“¶–b†–æFWƒÃÇÆ–æFWƒã×W6W"æ–×ÆçE6Æ÷D6÷VçB—&WGW&âfÇ6S·W6W"æ–×ÆçE6Æ÷G5¶–æFW…ÓÕ7G&–ær†—FVÔ–GÇÂrr“·W6W"æ–ç7FÆÆVD–×ÆçD–G3×W6W"æ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ“·&WGW&âG'VS·×W6W"æWV—ÖVçE6Æ÷G3×·&–Ö'•vVöã¢rrÇ6V6öæF'•vVöã¢rrÆ&Ö÷#¢rrÂâââ‡W6W"æWV—ÖVçE6Æ÷G7ÇÇ·Ò—Ó·W6W"æWV—ÖVçE6Æ÷G5·G—UÓÕ7G&–ær†—FVÔ–GÇÂrr“·&WGW&âG'VS·Ð¢gVæ7F–öâ6Æ÷D66WG5vV%ccr‡G—RÆ—FVÒ—¶6öç7B—FVÕG—SÖ—FVÕG—UvV%ccr†—FVÒ“¶–b‡G—SÓÓÒv&Ö÷"r—&WGW&â—FVÕG—SÓÓÒv&Ö÷"s¶–b‡G—SÓÓÒv–×ÆçBr—&WGW&â—FVÕG—SÓÓÒv–×ÆçBs¶–b‡G—SÓÓÒw&–Ö'•vVöâr—&WGW&â—FVÕG—SÓÓÒw6†–VÆBwÇÆ—FVÕG—SÓÓÒwvVöârbe²w&–Ö'’rÂwfW'6F–ÆRrÂruÒæ–æ6ÇVFW2…7G&–ær†—FVÒçvVöå6Æ÷GÇÂw&–Ö'’r’“¶–b‡G—SÓÓÒw6V6öæF'•vVöâr—&WGW&â—FVÕG—SÓÓÒwvVöârbe²w6V6öæF'’rÂwfW'6F–ÆRrÂruÒæ–æ6ÇVFW2…7G&–ær†—FVÒçvVöå6Æ÷GÇÂw6V6öæF'’r’“·&WGW&âfÇ6S·Ð¢gVæ7F–öâ÷væVEG•vV%ccr‡W6W"Æ—FVÔ–B—·&WGW&â–çDæöäæVvF—fUvV%ccr‚‡W6W"æ–çfVçF÷'—ÇÅµÒ’æf–æB†VçG'“ÓæVçG'’æ—FVÔ–CÓÓÖ—FVÔ–B“òçG’Ã“·Ð¢gVæ7F–öâWV—VD6÷VçEvV%ccr‡W6W"Æ—FVÔ–B—·&WGW&âWV—VD6÷VçG5vV%ccr‡W6W"’ævWB…7G&–ær†—FVÔ–GÇÂrr’—ÇÃ·Ð¢gVæ7F–öâ6äFD–çfVçF÷'”—FVÕvV%ccr‡W6W"Æ—FVÔ–BÇG“Ó—¶6öç7B7W'&VçCÖæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡W6W"’Æ—FVÓÖ—FVÕvV%ccr†—FVÔ–B’Æ6÷VçCÔÖF‚æÖ‚ƒÆ–çDæöäæVvF—fUvV%ccr‡G’Ã’’ÆæW‡EvV–v‡CÖ–çfVçF÷'•vV–v‡EvV%ccr†7W'&VçB’¶—FVÔÖ75vV%ccr†—FVÒ’¦6÷VçC¶–b†æW‡EvV–v‡Cæ7W'&VçBæ6''•vV–v‡DÖ‚³RÓ’—&WGW&ç¶ö³¦fÇ6RÇ&V6öã¦	ý]-½]Òý]]ÝíÍ½’-]¢G¶æW‡EvV–v‡BçFôf—†VBƒ—ÒòG¶7W'&VçBæ6''•vV–v‡DÖ‡ÖÓ¶6öç7B6ÆöæSÖFVW†7W'&VçB“¶ÆWBVçG'“Ö6ÆöæRæ–çfVçF÷'’æf–æB‡&÷sÓç&÷ræ—FVÔ–CÓÓÖ—FVÔ–B“¶–b‚VçG'’—¶VçG'“×¶—FVÔ–BÇG“£Ç÷6—F–öç3¥µ×Ó¶6ÆöæRæ–çfVçF÷'’çW6‚†VçG'’“·ÖVçG'’çG’³Ö6÷VçC¶–b†'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccr†6ÆöæR’æ÷fW&fÆ÷ræÆVæwF‚—&WGW&ç¶ö³¦fÇ6RÇ&V6öã¢}	"Ý-]Ý-RÝ]Mí--í}Ýâ-ííMÝí=âÍ]-M½òý]MÍ]-âwÓ·&WGW&ç¶ö³§G'VWÓ·Ð ¢gVæ7F–öâvV%6Æ÷DÆ&VÅccr‡G—RÆ–æFWƒÒÓ—·&WGW&âG—SÓÓÒw&–Ö'•vVöâsò}	íÝí-ÝíRs§G—SÓÓÒw6V6öæF'•vVöâsò}	--í}ÝíRs§G—SÓÓÒv&Ö÷"sò}	íÝòs¦	Íý½Ý"G¶–æFW‚³Ö·Ð¢gVæ7F–öâvV%6Æ÷DÖ&·Wccr‡W6W"ÇG—RÆ–æFWƒÒÓ—¶6öç7B—FVÔ–CÖvWE6Æ÷EvV%ccr‡W6W"ÇG—RÆ–æFW‚’Æ—FVÓÖ—FVÔ–Cö—FVÕvV%ccr†—FVÔ–B“¦çVÆÃ·&WGW&âÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷B×ccrG¶—FVÓòvf–ÆÆVBs¢rwÒ"FF×vV"Ö–çfVçF÷'’×6Æ÷B×ccrFF×6Æ÷B×G—SÒ"G·G—WÒ"FF×6Æ÷BÖ–æFWƒÒ"G¶–æFW‡Ò#ãÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷BÖÆ&VÂ×ccr#âG¶W62‡vV%6Æ÷DÆ&VÅccr‡G—RÆ–æFW‚’—ÓÂöF—câG¶—FVÓöÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷BÖ—FVÒ×ccr"G&vv&ÆSÒ'G'VR"FF×vV"Ö–çfVçF÷'’ÖG&r×ccrFF×6÷W&6SÒ'6Æ÷B"FF×6Æ÷B×G—SÒ"G·G—WÒ"FF×6Æ÷BÖ–æFWƒÒ"G¶–æFW‡Ò"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"FFÖ7F–öãÒ'&öf–ÆRÖ—FVÒ"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"FFÖ—FVÒÖÆ&VÃÒ"G¶W62‡vV%6Æ÷DÆ&VÅccr‡G—RÆ–æFW‚’—Ò#âG·&VæFW$VçF—G•F‡VÖ"†—FVÒ—ÓÇ7ãâG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂ÷7ããÂöF—cæ¢sÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷BÖV×G’×ccr#í	ý]]--Rý]MÍ]#ÂöF—câwÓÂöF—cæ·Ð¢gVæ7F–öâvV$w&–DÖ&·Wccr‡W6W"—¶6öç7BÆ–÷WCÖ'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccr‡W6W"“¶6öç7B6VÆÇ3Ô'&’æg&öÒ‡¶ÆVæwFƒ¦Æ–÷WBç6—¦WÒÂ…òÆ–æFW‚“ÓæÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’Ö6VÆÂ×ccr"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–æFW‚VÆ–÷WBæ6öÇ2³Ó¶w&–B×&÷s¢G´ÖF‚æfÆö÷"†–æFW‚öÆ–÷WBæ6öÇ2’³Ò#ãÂöF—cæ’æ¦ö–â‚rr“¶6öç7BF–ÆW3ÖÆ–÷WBæ–ç7Fæ6W2æÖ†–ç7CÓæÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×F–ÆR×ccr"G&vv&ÆSÒ'G'VR"FF×vV"Ö–çfVçF÷'’ÖG&r×ccrFF×6÷W&6SÒ&w&–B"FFÖ—FVÒÖ–CÒ"G¶W62†–ç7Bæ—FVÔ–B—Ò"FF×Væ—BÖ–æFWƒÒ"G¶–ç7BçVæ—D–æFW‡Ò"FFÖ7F–öãÒ'&öf–ÆRÖ—FVÒ"FFÖ—FVÒÖ–CÒ"G¶W62†–ç7Bæ—FVÔ–B—Ò"FFÖ—FVÒÖÆ&VÃÒ-	Ý-]Ý-Â"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–ç7Bç÷2ç‚³Ò÷7âG¶–ç7BçwÓ¶w&–B×&÷s¢G¶–ç7Bç÷2ç’³Ò÷7âG¶–ç7Bæ‡Ò"F—FÆSÒ"G¶W62†–ç7Bæ—FVÒææÖWÇÆ–ç7Bæ—FVÔ–B—Ò+rG¶–ç7BçwÜ9rG¶–ç7Bæ‡Ò+rG¶—FVÔÖ75vV%ccr†–ç7Bæ—FVÒ—Ò-]#âG·&VæFW$VçF—G•F‡VÖ"†–ç7Bæ—FVÒ—ÓÇ7ãâG¶W62†–ç7Bæ—FVÒææÖWÇÆ–ç7Bæ—FVÔ–B—ÓÂ÷7ããÇ6ÖÆÃâG¶–ç7BçwÜ9rG¶–ç7Bæ‡ÓÂ÷6ÖÆÃãÂöF—cæ’æ¦ö–â‚rr“¶6öç7B÷fW&fÆ÷sÖÆ–÷WBæ÷fW&fÆ÷ræÆVæwFƒöÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’Ö÷fW&fÆ÷r×ccr#ãÆ#í	ÝRýíÍ]]-ó¢G¶Æ–÷WBæ÷fW&fÆ÷ræÆVæwF‡ÓÂö#âG¶Æ–÷WBæ÷fW&fÆ÷ræÖ†–ç7CÓæÇ7ãâG¶W62†–ç7Bæ—FVÒææÖWÇÆ–ç7Bæ—FVÔ–B—Ò‚G¶–ç7BçwÜ9rG¶–ç7Bæ‡Ò“Â÷7ãæ’æ¦ö–â‚rr—ÓÂöF—cæ¢rs·&WGW&æÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’Öw&–B×ccr"FF×vV"Ö–çfVçF÷'’Öw&–B×ccr7G–ÆSÒ"ÒÖ–çbÖ6öÇ3¢G¶Æ–÷WBæ6öÇ7Ó²ÒÖ–çb×&÷w3¢G¶Æ–÷WBç&÷w7Ò#âG¶6VÆÇ7ÒG·F–ÆW7ÓÂöF—câG¶÷fW&fÆ÷wÖ·Ð¢gVæ7F–öâvV$–çfVçF÷'•æVÅccr‡&uÆ–W"—¶6öç7BW6W#Öæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡&uÆ–W"’ÆÆ–÷WCÖ'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccr‡W6W"’Æ÷fW'vV–v‡CÖÆ–÷WBçvV–v‡CçW6W"æ6''•vV–v‡DÖ‚³RÓ“·&WGW&âÇ6V7F–öâ6Æ73Ò'æVÂvV"×&öf–ÆRÖ–çfVçF÷'’×ccr#ãÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc#ãÆF—cãÆF—b6Æ73Ò&W–V'&÷r#í
	Ý	

ý	m	]	Ý		SÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
Ý­ýí-­‚Ý-]Ý-ÃÂöF—cãÂöF—cãÂöF—cãÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’Ö66—G’×ccr#ãÇ7ãí	Ý-]Ý-ÂÆ#âGµ²ââæÆ–÷WBæ–ç7Fæ6W2ÂââæÆ–÷WBæ÷fW&fÆ÷uÒç&VGV6R‚‡7VÒÆ’“Óç7VÒ¶’çr¦’æ‚Ã—ÒòG·W6W"æ–çfVçF÷'•6—¦WÓÂö#â­½]-í£Â÷7ããÇ7â6Æ73Ò"G¶÷fW'vV–v‡Còv–çfVçF÷'’ÖÆ–Ö—BÖW†6VVFVB×ccrs¢rwÒ#í	-]Æ#âG¶Æ–÷WBçvV–v‡BçFôf—†VBƒ—ÒòG´çVÖ&W"‡W6W"æ6''•vV–v‡DÖ‚’çFôf—†VBƒ—ÓÂö#ãÂ÷7ããÇ7ãí	Íý½Ý-²Æ#âG·W6W"æ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ’æÆVæwF‡ÒòG·W6W"æ–×ÆçE6Æ÷D6÷VçGÓÂö#ãÂ÷7ããÂöF—cãÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷G2×ccr#âG·vV%6Æ÷DÖ&·Wccr‡W6W"Âw&–Ö'•vVöâr—ÒG·vV%6Æ÷DÖ&·Wccr‡W6W"Âw6V6öæF'•vVöâr—ÒG·vV%6Æ÷DÖ&·Wccr‡W6W"Âv&Ö÷"r—ÒG´'&’æg&öÒ‡¶ÆVæwFƒ§W6W"æ–×ÆçE6Æ÷D6÷VçGÒÂ…òÆ’“ÓçvV%6Æ÷DÖ&·Wccr‡W6W"Âv–×ÆçBrÆ’’’æ¦ö–â‚rr—ÓÂöF—cãÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×ccvV"Ö–çfVçF÷'’Öw&–BÖ†VB×ccr#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Ý-]Ý-ÃÂöF—cãÆF—b6Æ73Ò&×WFVB#í	ý]]-­--Rý]MÍ]-²ýâ]-­R‚"½í-²ãÂöF—cãÂöF—câG·vV$w&–DÖ&·Wccr‡W6W"—ÓÂ÷6V7F–öãæ·Ð ¢6öç7Bõ÷&VæFW%&öf–ÆUccs×&VæFW%&öf–ÆS°¢&VæFW%&öf–ÆSÖgVæ7F–öâ‚—¶6öç7B&W7VÇCÕõ÷&VæFW%&öf–ÆUccr‚“¶6öç7B&ö÷CÒB‚r767&VVâ×&öf–ÆRr’ÇÆ–W#Ö7W'&VçEÆ–W"‚“¶–b‚&ö÷GÇÂÆ–W"—&WGW&â&W7VÇC¶6öç7B†VG3Ô'&’æg&öÒ‡&ö÷BçVW'•6VÆV7F÷$ÆÂ‚rç6V7F–öâÖ†VBr’“¶f÷"†6öç7B†VBöb†VG2—¶6öç7BF—FÆSÖ†VBçVW'•6VÆV7F÷"‚rç6V7F–öâ×F—FÆRr“òçFW‡D6öçFVçCòçG&–Ò‚“¶–b…²}
-]­=]RÝým]ÝRrÂ}	Ý-]Ý-ÂuÒæ–æ6ÇVFW2‡F—FÆR’—¶6öç7BæW‡CÖ†VBææW‡DVÆVÖVçE6–&Æ–æs¶†VBç&VÖ÷fR‚“¶–b†æW‡Còæ6Æ74Æ—7Bæ6öçF–ç2‚w&öf–ÆRÖ—FVÒÖw&–B×ccr’–æW‡Bç&VÖ÷fR‚“·××&ö÷BçVW'•6VÆV7F÷"‚u¶FFÖ–×ÆçG2×cS%Òr“òç&VÖ÷fR‚“·&ö÷BçVW'•6VÆV7F÷"‚rçvV"×&öf–ÆRÖ–çfVçF÷'’×ccrr“òç&VÖ÷fR‚“¶6öç7BÖ–ã×&ö÷BçVW'•6VÆV7F÷"‚rç&öf–ÆRÖ6&Br“¶–b†Ö–â—¶Ö–âæ–ç6W'DF¦6VçD…DÔÂ‚vgFW&VæBrÇvV$–çfVçF÷'•æVÅccr‡Æ–W"’“¶6öç7B–æfôw&–CÖÖ–âçVW'•6VÆV7F÷"‚ræ–æfòÖw&–Br“¶–b†–æfôw&–BbbÖ–âçVW'•6VÆV7F÷"‚u¶FF×vV"Ö–çfVçF÷'’ÖÆ–Ö—G2×ccuÒr’––æfôw&–Bæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÆÆF—b6Æ73Ò&–æfòÖ6&B"FF×vV"Ö–çfVçF÷'’ÖÆ–Ö—G2×ccsãÆF—b6Æ73Ò&²#í	Ý-]Ý-Âò-]ÂöF—cãÆF—b6Æ73Ò'b#âG¶æ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡Æ–W"’æ–çfVçF÷'•6—¦WÒý}]]¢+rG´çVÖ&W"†æ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡Æ–W"’æ6''•vV–v‡DÖ‚’çFôf—†VBƒ—ÓÂöF—cãÂöF—cæ“·×&WGW&â&W7VÇC·Ó° ¢ÆWBvV$–çfVçF÷'”G&uccsÖçVÆÃ°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&w7F'BrÆWfVçCÓç¶6öç7BæöFSÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö–çfVçF÷'’ÖG&r×ccuÒr“¶–b‚æöFR—&WGW&ã·vV$–çfVçF÷'”G&uccs×·6÷W&6S¥7G&–ær†æöFRæFF6WBç6÷W&6WÇÂrr’Æ—FVÔ–C¥7G&–ær†æöFRæFF6WBæ—FVÔ–GÇÂrr’ÇVæ—D–æFWƒ¦–çDæöäæVvF—fUvV%ccr†æöFRæFF6WBçVæ—D–æFW‚ÂÓ’Ç6Æ÷EG—S¥7G&–ær†æöFRæFF6WBç6Æ÷EG—WÇÂrr’Ç6Æ÷D–æFWƒ¤çVÖ&W"†æöFRæFF6WBç6Æ÷D–æFWƒóòÓ—Ó¶WfVçBæFFG&ç6fW"æVffV7DÆÆ÷vVCÒvÖ÷fRs·G'—¶WfVçBæFFG&ç6fW"ç6WDFF‚wFW‡B÷Æ–ârÇvV$–çfVçF÷'”G&uccræ—FVÔ–B“·Ö6F6‡·ÖæöFRæ6Æ74Æ—7BæFB‚wvV"Ö–çfVçF÷'’ÖG&vv–ær×ccrr“·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&vVæBrÆWfVçCÓç¶WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö–çfVçF÷'’ÖG&r×ccuÒr“òæ6Æ74Æ—7Bç&VÖ÷fR‚wvV"Ö–çfVçF÷'’ÖG&vv–ær×ccrr“·vV$–çfVçF÷'”G&uccsÖçVÆÃ·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&v÷fW"rÆWfVçCÓç¶–b‚vV$–çfVçF÷'”G&uccr—&WGW&ã¶–b†WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö–çfVçF÷'’Öw&–B×ccuÒÅ¶FF×vV"Ö–çfVçF÷'’×6Æ÷B×ccuÒr’—¶WfVçBç&WfVçDFVfVÇB‚“¶WfVçBæFFG&ç6fW"æG&÷VffV7CÒvÖ÷fRs·×Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&÷rÆ7–æ2WfVçCÓç¶–b‚vV$–çfVçF÷'”G&uccr—&WGW&ã¶6öç7Bw&–CÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö–çfVçF÷'’Öw&–B×ccuÒr’Ç6Æ÷CÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö–çfVçF÷'’×6Æ÷B×ccuÒr“¶–b‚w&–Bbb6Æ÷B—&WGW&ã¶WfVçBç&WfVçDFVfVÇB‚“¶6öç7BG&s×²ââçvV$–çfVçF÷'”G&uccwÓ·vV$–çfVçF÷'”G&uccsÖçVÆÃ·G'—¶–b‡6Æ÷B—¶6öç7BF&vWEG—SÕ7G&–ær‡6Æ÷BæFF6WBç6Æ÷EG—WÇÂrr’ÇF&vWD–æFWƒÔçVÖ&W"‡6Æ÷BæFF6WBç6Æ÷D–æFWƒóòÓ’Æ—FVÓÖ—FVÕvV%ccr†G&ræ—FVÔ–B“¶–b‚6Æ÷D66WG5vV%ccr‡F&vWEG—RÆ—FVÒ’—F‡&÷ræWrW'&÷"‚}
Ý-í"ý]MÍ]"Ý]½Í}ò=-Ýí--Â"-½ÝÝ½’½í"r“¶v—B6öÖÖ—EÆ–W$×WFF–öâ‡W6W#Óç¶6öç7Bæ÷&ÖÆ—¦VCÖæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡W6W"“´ö&¦V7Bæ76–vâ‡W6W"Ææ÷&ÖÆ—¦VB“¶–b†G&rç6÷W&6SÓÓÒw6Æ÷Br—6WE6Æ÷EvV%ccr‡W6W"ÆG&rç6Æ÷EG—RÆG&rç6Æ÷D–æFW‚Ârr“¶6öç7B÷væVCÖ÷væVEG•vV%ccr‡W6W"ÆG&ræ—FVÔ–B’ÆWV—VCÖWV—VD6÷VçEvV%ccr‡W6W"ÆG&ræ—FVÔ–B’ÇF&vWD7W'&VçCÖvWE6Æ÷EvV%ccr‡W6W"ÇF&vWEG—RÇF&vWD–æFW‚’ÆÆÆ÷væ6S×F&vWD7W'&VçCÓÓÖG&ræ—FVÔ–Có£¶–b†÷væVCÃÖWV—VBÖÆÆ÷væ6R—F‡&÷ræWrW'&÷"‚}	"Ý-]Ý-RÝ]"-ííMÝí=âÝ­}]Íý½ýÝ-í=âý]MÍ]-r“·6WE6Æ÷EvV%ccr‡W6W"ÇF&vWEG—RÇF&vWD–æFW‚ÆG&ræ—FVÔ–B“·ÒÂ}
Ý­ýí-­íÝí-½]Ýr“·&WGW&ã·Ö6öç7B&V7CÖw&–BævWD&÷VæF–æt6Æ–VçE&V7B‚’Æ6öÇ3ÔçVÖ&W"†vWD6ö×WFVE7G–ÆR†w&–B’ævWE&÷W'G•fÇVR‚rÒÖ–çbÖ6öÇ2r’—ÇÃÇ7G–ÆSÖvWD6ö×WFVE7G–ÆR†w&–B’Æv×'6TfÆöB‡7G–ÆRæ6öÇVÖäv—ÇÃÇ&÷tv×'6TfÆöB‡7G–ÆRç&÷tv—ÇÃÆ6VÆÃÒ†w&–Bæ6Æ–VçEv–GF‚Ó"¢‡'6TfÆöB‡7G–ÆRçFF–ætÆVgB—ÇÃ’Ò†6öÇ2Ó’¦v’ö6öÇ2Ç&÷t†V–v‡C×'6TfÆöB‡7G–ÆRæw&–EFV×ÆFU&÷w2—ÇÃc‚ÇƒÔÖF‚æÖ‚ƒÄÖF‚æÖ–â†6öÇ2ÓÄÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE‚×&V7BæÆVgBÒ‡'6TfÆöB‡7G–ÆRçFF–ætÆVgB—ÇÃ’’ò†6VÆÂ¶v’’’’Ç“ÔÖF‚æÖ‚ƒÄÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE’×&V7BçF÷Ò‡'6TfÆöB‡7G–ÆRçFF–æuF÷—ÇÃ’’ò‡&÷t†V–v‡B·&÷tv’’“¶v—B6öÖÖ—EÆ–W$×WFF–öâ‡W6W#Óç¶6öç7Bæ÷&ÖÆ—¦VCÖæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡W6W"“´ö&¦V7Bæ76–vâ‡W6W"Ææ÷&ÖÆ—¦VB“¶ÆWBVæ—D–æFWƒÖG&rçVæ—D–æFWƒ¶–b†G&rç6÷W&6SÓÓÒw6Æ÷Br—·6WE6Æ÷EvV%ccr‡W6W"ÆG&rç6Æ÷EG—RÆG&rç6Æ÷D–æFW‚Ârr“·Væ—D–æFWƒÖWV—VD6÷VçEvV%ccr‡W6W"ÆG&ræ—FVÔ–B“·Ö–b‡Væ—D–æFWƒÃÇÂ6åÆ6UvV%ccr‡W6W"ÆG&ræ—FVÔ–BÇVæ—D–æFW‚Ç‚Ç’’—F‡&÷ræWrW'&÷"‚}	ý]MÍ]"ÝRýíÍ]]-ò"-½ÝÝíRÍ]-âr“·6WE÷6—F–öåvV%ccr‡W6W"ÆG&ræ—FVÔ–BÇVæ—D–æFW‚Ç·‚Ç—Ò“·ÒÆG&rç6÷W&6SÓÓÒw6Æ÷Bsò}	ý]MÍ]"Ýý"s¢}	Ý-]Ý-Âý]]Í]Òr“·Ö6F6‚†W'&÷"—¶æ÷F–g’†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’Âwv&âr“·×Ò“° ¢7–æ2gVæ7F–öâ†æFÆUö–çFW$–çfVçF÷'”G&÷vV%ccr†G&rÇF&vWBÆ6Æ–VçE‚Æ6Æ–VçE’—¶6öç7Bw&–C×F&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö–çfVçF÷'’Öw&–B×ccuÒr’Ç6Æ÷C×F&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö–çfVçF÷'’×6Æ÷B×ccuÒr“¶–b‚w&–Bbb6Æ÷B—&WGW&ã·G'—¶–b‡6Æ÷B—¶6öç7BF&vWEG—SÕ7G&–ær‡6Æ÷BæFF6WBç6Æ÷EG—WÇÂrr’ÇF&vWD–æFWƒÔçVÖ&W"‡6Æ÷BæFF6WBç6Æ÷D–æFWƒóòÓ’Æ—FVÓÖ—FVÕvV%ccr†G&ræ—FVÔ–B“¶–b‚6Æ÷D66WG5vV%ccr‡F&vWEG—RÆ—FVÒ’—F‡&÷ræWrW'&÷"‚}
Ý-í"ý]MÍ]"Ý]½Í}ò=-Ýí--Â"-½ÝÝ½’½í"r“¶v—B6öÖÖ—EÆ–W$×WFF–öâ‡W6W#Óç´ö&¦V7Bæ76–vâ‡W6W"Ææ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡W6W"’“¶–b†G&rç6÷W&6SÓÓÒw6Æ÷Br—6WE6Æ÷EvV%ccr‡W6W"ÆG&rç6Æ÷EG—RÆG&rç6Æ÷D–æFW‚Ârr“¶6öç7B÷væVCÖ÷væVEG•vV%ccr‡W6W"ÆG&ræ—FVÔ–B’ÆWV—VCÖWV—VD6÷VçEvV%ccr‡W6W"ÆG&ræ—FVÔ–B’ÇF&vWD7W'&VçCÖvWE6Æ÷EvV%ccr‡W6W"ÇF&vWEG—RÇF&vWD–æFW‚’ÆÆÆ÷væ6S×F&vWD7W'&VçCÓÓÖG&ræ—FVÔ–Có£¶–b†÷væVCÃÖWV—VBÖÆÆ÷væ6R—F‡&÷ræWrW'&÷"‚}	"Ý-]Ý-RÝ]"-ííMÝí=âÝ­}]Íý½ýÝ-í=âý]MÍ]-r“·6WE6Æ÷EvV%ccr‡W6W"ÇF&vWEG—RÇF&vWD–æFW‚ÆG&ræ—FVÔ–B“·ÒÂ}
Ý­ýí-­íÝí-½]Ýr“·&WGW&ã·Ö6öç7B&V7CÖw&–BævWD&÷VæF–æt6Æ–VçE&V7B‚’Æ6öÇ3ÔçVÖ&W"†vWD6ö×WFVE7G–ÆR†w&–B’ævWE&÷W'G•fÇVR‚rÒÖ–çbÖ6öÇ2r’—ÇÃÇ7G–ÆSÖvWD6ö×WFVE7G–ÆR†w&–B’Æv×'6TfÆöB‡7G–ÆRæ6öÇVÖäv—ÇÃÇ&÷tv×'6TfÆöB‡7G–ÆRç&÷tv—ÇÃÆ6VÆÃÒ†w&–Bæ6Æ–VçEv–GF‚Ó"¢‡'6TfÆöB‡7G–ÆRçFF–ætÆVgB—ÇÃ’Ò†6öÇ2Ó’¦v’ö6öÇ2Ç&÷t†V–v‡C×'6TfÆöB‡7G–ÆRæw&–EFV×ÆFU&÷w2—ÇÃc‚ÇƒÔÖF‚æÖ‚ƒÄÖF‚æÖ–â†6öÇ2ÓÄÖF‚æfÆö÷"‚†6Æ–VçE‚×&V7BæÆVgBÒ‡'6TfÆöB‡7G–ÆRçFF–ætÆVgB—ÇÃ’’ò†6VÆÂ¶v’’’’Ç“ÔÖF‚æÖ‚ƒÄÖF‚æfÆö÷"‚†6Æ–VçE’×&V7BçF÷Ò‡'6TfÆöB‡7G–ÆRçFF–æuF÷—ÇÃ’’ò‡&÷t†V–v‡B·&÷tv’’“¶v—B6öÖÖ—EÆ–W$×WFF–öâ‡W6W#Óç´ö&¦V7Bæ76–vâ‡W6W"Ææ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡W6W"’“¶ÆWBVæ—D–æFWƒÖG&rçVæ—D–æFWƒ¶–b†G&rç6÷W&6SÓÓÒw6Æ÷Br—·6WE6Æ÷EvV%ccr‡W6W"ÆG&rç6Æ÷EG—RÆG&rç6Æ÷D–æFW‚Ârr“·Væ—D–æFWƒÖWV—VD6÷VçEvV%ccr‡W6W"ÆG&ræ—FVÔ–B“·Ö–b‡Væ—D–æFWƒÃÇÂ6åÆ6UvV%ccr‡W6W"ÆG&ræ—FVÔ–BÇVæ—D–æFW‚Ç‚Ç’’—F‡&÷ræWrW'&÷"‚}	ý]MÍ]"ÝRýíÍ]]-ò"-½ÝÝíRÍ]-âr“·6WE÷6—F–öåvV%ccr‡W6W"ÆG&ræ—FVÔ–BÇVæ—D–æFW‚Ç·‚Ç—Ò“·ÒÆG&rç6÷W&6SÓÓÒw6Æ÷Bsò}	ý]MÍ]"Ýý"s¢}	Ý-]Ý-Âý]]Í]Òr“·Ö6F6‚†W'&÷"—¶æ÷F–g’†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’Âwv&âr“·×Ð¢ÆWBF÷V6„–çfVçF÷'”G&uvV%ccsÖçVÆÃ°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚wö–çFW&F÷vârÆWfVçCÓç¶–b‡v–æF÷räu%t–çfVçF÷'”ÖVçUcC"ÇÂWfVçBçö–çFW%G—SÓÓÒvÖ÷W6Rr—&WGW&ã¶6öç7BæöFSÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"Ö–çfVçF÷'’ÖG&r×ccuÒr“¶–b‚æöFR—&WGW&ã¶6öç7BG&s×·6÷W&6S¥7G&–ær†æöFRæFF6WBç6÷W&6WÇÂrr’Æ—FVÔ–C¥7G&–ær†æöFRæFF6WBæ—FVÔ–GÇÂrr’ÇVæ—D–æFWƒ¦–çDæöäæVvF—fUvV%ccr†æöFRæFF6WBçVæ—D–æFW‚ÂÓ’Ç6Æ÷EG—S¥7G&–ær†æöFRæFF6WBç6Æ÷EG—WÇÂrr’Ç6Æ÷D–æFWƒ¤çVÖ&W"†æöFRæFF6WBç6Æ÷D–æFWƒóòÓ—Ó¶6öç7B7FFS×¶æöFRÆG&rÇö–çFW$–C¦WfVçBçö–çFW$–BÇ7F'Eƒ¦WfVçBæ6Æ–VçE‚Ç7F'E“¦WfVçBæ6Æ–VçE’Çƒ¦WfVçBæ6Æ–VçE‚Ç“¦WfVçBæ6Æ–VçE’Æ7F—fS¦fÇ6RÇF–ÖW#¦çVÆÂÆv†÷7C¦çVÆÇÓ·7FFRçF–ÖW#×6WEF–ÖV÷WB‚‚“Óç·7FFRæ7F—fS×G'VS·7FFRææöFRæ6Æ74Æ—7BæFB‚wvV"Ö–çfVçF÷'’ÖG&vv–ær×ccrr“¶6öç7Bv†÷7C×7FFRææöFRæ6ÆöæTæöFR‡G'VR“¶v†÷7Bæ6Æ74Æ—7BæFB‚wvV"Ö–çfVçF÷'’×F÷V6‚Öv†÷7B×ccrr“¶v†÷7Bç&VÖ÷fTGG&–'WFR‚vG&vv&ÆRr“¶Fö7VÖVçBæ&öG’æVæD6†–ÆB†v†÷7B“·7FFRæv†÷7CÖv†÷7C¶v†÷7Bç7G–ÆRæÆVgCÖG·7FFRç‡×†¶v†÷7Bç7G–ÆRçF÷ÖG·7FFRç—×†·ÒÃ#ƒ“·F÷V6„–çfVçF÷'”G&uvV%ccs×7FFS·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚wö–çFW&Ö÷fRrÆWfVçCÓç¶6öç7B7FFS×F÷V6„–çfVçF÷'”G&uvV%ccs¶–b‚7FFWÇÇ7FFRçö–çFW$–BÓÖWfVçBçö–çFW$–B—&WGW&ã·7FFRçƒÖWfVçBæ6Æ–VçEƒ·7FFRç“ÖWfVçBæ6Æ–VçE“¶6öç7BF—7CÔÖF‚æ‡—÷B†WfVçBæ6Æ–VçE‚×7FFRç7F'E‚ÆWfVçBæ6Æ–VçE’×7FFRç7F'E’“¶–b‚7FFRæ7F—fRbfF—7Cã—¶6ÆV%F–ÖV÷WB‡7FFRçF–ÖW"“·F÷V6„–çfVçF÷'”G&uvV%ccsÖçVÆÃ·&WGW&ã·Ö–b‡7FFRæ7F—fR—¶WfVçBç&WfVçDFVfVÇB‚“¶–b‡7FFRæv†÷7B—·7FFRæv†÷7Bç7G–ÆRæÆVgCÖG¶WfVçBæ6Æ–VçE‡×†·7FFRæv†÷7Bç7G–ÆRçF÷ÖG¶WfVçBæ6Æ–VçE—×†·××ÒÇ·76—fS¦fÇ6WÒ“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚wö–çFW'WrÆ7–æ2WfVçCÓç¶6öç7B7FFS×F÷V6„–çfVçF÷'”G&uvV%ccs¶–b‚7FFWÇÇ7FFRçö–çFW$–BÓÖWfVçBçö–çFW$–B—&WGW&ã¶6ÆV%F–ÖV÷WB‡7FFRçF–ÖW"“·F÷V6„–çfVçF÷'”G&uvV%ccsÖçVÆÃ¶–b‚7FFRæ7F—fR—&WGW&ã¶WfVçBç&WfVçDFVfVÇB‚“¶WfVçBç7F÷&÷vF–öâ‚“·7FFRææöFRæ6Æ74Æ—7Bç&VÖ÷fR‚wvV"Ö–çfVçF÷'’ÖG&vv–ær×ccrr“·7FFRæv†÷7Còç&VÖ÷fR‚“¶6öç7BF&vWCÖFö7VÖVçBæVÆVÖVçDg&öÕö–çB†WfVçBæ6Æ–VçE‚ÆWfVçBæ6Æ–VçE’“¶v—B†æFÆUö–çFW$–çfVçF÷'”G&÷vV%ccr‡7FFRæG&rÇF&vWBÆWfVçBæ6Æ–VçE‚ÆWfVçBæ6Æ–VçE’“·ÒÇ·76—fS¦fÇ6WÒ“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚wö–çFW&6æ6VÂrÆWfVçCÓç¶6öç7B7FFS×F÷V6„–çfVçF÷'”G&uvV%ccs¶–b‚7FFWÇÇ7FFRçö–çFW$–BÓÖWfVçBçö–çFW$–B—&WGW&ã¶6ÆV%F–ÖV÷WB‡7FFRçF–ÖW"“·7FFRææöFRæ6Æ74Æ—7Bç&VÖ÷fR‚wvV"Ö–çfVçF÷'’ÖG&vv–ær×ccrr“·7FFRæv†÷7Còç&VÖ÷fR‚“·F÷V6„–çfVçF÷'”G&uvV%ccsÖçVÆÃ·Ò“° ¢ò¢cããs(	BG&ç67F–öæÂF–Ç’ÆæWF'’Ö&¶WB¢ð¢6öç7BÖ&¶WDVæv–æUcs×v–æF÷räu%tÖ&¶WDVæv–æUcs°¢ÆWBÖ&¶WE6VÆV7F–öåvV%csÖçVÆÂÆÖ&¶WDG&uvV%csÖçVÆÂÆÖ&¶WEF%vV%cs3ÒvvööG2rÆÆ7DÖ&¶WDF•vV%csÔÖ&¶WDVæv–æUcsòç&÷FF–öä¶W“òâ‚—ÇÂrs°¢gVæ7F–öâÖ&¶WE&÷FF–öåvV%cs‡ÆæWCÖ7W'&VçEÆæWB‚’—°¢–b‚Ö&¶WDVæv–æUcsÇÂÆæWB—&WGW&ç·&÷FF–öä¶W“¢rrÆæW‡E&÷FF–öäC¦æWrFFR‚’çFô•4õ7G&–ær‚’ÆöffW'3¥µÒÆÆÄöffW'3¥µ×Ó°¢6öç7B6×–vãÔæFFæ6×–vç2ævWB„æ6öæf–sòæ6×–vä–GÇÂvÖ–âr—ÇÇ·Ó°¢&WGW&âÖ&¶WDVæv–æUcsæ'V–ÆE&÷FF–öâ‡¶6×–vä–C¤æ6öæf–sòæ6×–vä–GÇÂvÖ–ârÆ6×–vâÆvÖTFFS¦6×–vâæÖ&¶WDFFRÇÆæWBÇÆæWG3¤æFFçÆæWG2ÆWV—ÖVçC¤æFFæ—FV×2ÆÖ&¶WE7FFS¤æFFç7FFSòæÖ&¶WE'VçF–ÖUcsÇÇ¶6Æ–×3§·××Ò“°¢Ð¢gVæ7F–öâÖ&¶WE6—¦UvV%cs†—FVÓ×·Ò—·&WGW&ç·s¤ÖF‚æÖ‚ƒÄçVÖ&W"ç'6T–çB†—FVÒæ–çfVçF÷'•v–GFƒóö—FVÒç6—¦Uv–GFƒóóÃ—ÇÃ’Æƒ¤ÖF‚æÖ‚ƒÄçVÖ&W"ç'6T–çB†—FVÒæ–çfVçF÷'”†V–v‡Cóö—FVÒç6—¦T†V–v‡CóóÃ—ÇÃ—Ó·Ð¢gVæ7F–öâÖ&¶WD—FVÔ—57Fö6µvV%cs2†—FVÓ×·Ò—·&WGW&âæ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÒ“ÓÓÒw7Fö6²s·Ð¢ÆWBvööG46FVv÷'•vV%cCCÒvÆÂs°¢gVæ7F–öâÖ&¶WEF$ÖF6†W5vV%cs2†—FVÓ×·ÒÇF#ÖÖ&¶WEF%vV%cs2—·&WGW&âF#ÓÓÒw7Fö6·2söÖ&¶WD—FVÔ—57Fö6µvV%cs2†—FVÒ“¢Ö&¶WD—FVÔ—57Fö6µvV%cs2†—FVÒ“·Ð¢gVæ7F–öâÖ&¶WE6VÆÅW&6VçEvV%cs2†öffW"Æ—FVÒ—¶6öç7BfÆÆ&6³ÖÖ&¶WD—FVÔ—57Fö6µvV%cs2†—FVÒ“ó¢ãrÇ&FSÔçVÖ&W"æ—4f–æ—FR„çVÖ&W"†öffW#òç6VÆÅ&FR’“ôçVÖ&W"†öffW"ç6VÆÅ&FR“¦fÆÆ&6³·&WGW&âÖF‚ç&÷VæB‡&FR£“·Ð¢gVæ7F–öâÖ&¶WDöffW%F–ÆUvV%cs†öffW"—¶6öç7B—FVÓÔæFFæ—FV×2ævWB†öffW"æ—FVÔ–B“¶–b‚—FVÒ—&WGW&ârs¶6öç7B6—¦SÖÖ&¶WE6—¦UvV%cs†—FVÒ’Ç6VÆV7FVCÖÖ&¶WE6VÆV7F–öåvV%csòç6÷W&6SÓÓÒvÖ&¶WBrbfÖ&¶WE6VÆV7F–öåvV%csòæ—FVÔ–CÓÓÖ—FVÒæ–C·&WGW&æÆ'WGFöâ6Æ73Ò&Ö&¶WB×6†÷×F–ÆR×csG·6VÆV7FVCòw6VÆV7FVBs¢rwÒ"G—SÒ&'WGFöâ"G&vv&ÆSÒ'G'VR"FF×vV"ÖÖ&¶WBÖG&r×csFF×6÷W&6SÒ&Ö&¶WB"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"7G–ÆSÒ&w&–BÖ6öÇVÖã§7âG·6—¦RçwÓ¶w&–B×&÷s§7âG·6—¦Ræ‡Ò"F—FÆSÒ"G¶W62†—FVÒææÖWÇÆ—FVÒæ–B—Ò+rG·6—¦RçwÜ9rG·6—¦Ræ‡Ò#âG·&VæFW$VçF—G•F‡VÖ"†—FVÒ—ÓÇ7â6Æ73Ò&Ö&¶WB×F–ÆRÖæÖR×cs#âG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂ÷7ããÇ7â6Æ73Ò&Ö&¶WB×F–ÆRÖÖWF×cs#âG·6—¦RçwÜ9rG·6—¦Ræ‡ÒG¶öffW"çVæ—VSòr+r
=Ý­½ÍÝ½’s¢rwÓÂ÷7ããÆ"6Æ73Ò&Ö&¶WB×F–ÆR×&–6R×cs#âG¶f÷&ÖD7&VF—G2†öffW"ç&–6R—ÓÂö#ãÂö'WGFöãæ·Ð¢gVæ7F–öâÖ&¶WD–çfVçF÷'•vV%cs‡Æ–W"ÆöffW'2ÇF#ÖÖ&¶WEF%vV%cs2—¶6öç7BÆ–÷WCÖ'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccr‡Æ–W"’ÆöffW$ÖÖæWrÖ†öffW'2æÖ†öffW#Óå¶öffW"æ—FVÔ–BÆöffW%Ò’“¶6öç7B6VÆÇ3Ô'&’æg&öÒ‡¶ÆVæwFƒ¦Æ–÷WBç6—¦WÒÂ…òÆ–æFW‚“ÓæÆF—b6Æ73Ò&Ö&¶WBÖ–çfVçF÷'’Ö6VÆÂ×cs"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–æFW‚VÆ–÷WBæ6öÇ2³Ó¶w&–B×&÷s¢G´ÖF‚æfÆö÷"†–æFW‚öÆ–÷WBæ6öÇ2’³Ò#ãÂöF—cæ’æ¦ö–â‚rr“¶6öç7Bf—6–&ÆSÖÆ–÷WBæ–ç7Fæ6W2æf–ÇFW"†–ç7CÓæÖ&¶WEF$ÖF6†W5vV%cs2†–ç7Bæ—FVÒÇF"’“¶6öç7BF–ÆW3×f—6–&ÆRæÖ†–ç7CÓç¶6öç7BöffW#ÖöffW$ÖævWB†–ç7Bæ—FVÔ–B’Ç6VÆV7FVCÖÖ&¶WE6VÆV7F–öåvV%csòç6÷W&6SÓÓÒv–çfVçF÷'’rbfÖ&¶WE6VÆV7F–öåvV%csòæ—FVÔ–CÓÓÖ–ç7Bæ—FVÔ–BbdçVÖ&W"†Ö&¶WE6VÆV7F–öåvV%csòçVæ—D–æFW‚“ÓÓÔçVÖ&W"†–ç7BçVæ—D–æFW‚“·&WGW&æÆ'WGFöâ6Æ73Ò&Ö&¶WBÖ–çfVçF÷'’×F–ÆR×csG·6VÆV7FVCòw6VÆV7FVBs¢rwÒG¶öffW#òw6VÆÆ&ÆRs¢væ÷B×6VÆÆ&ÆRwÒ"G—SÒ&'WGFöâ"G&vv&ÆSÒ'G'VR"FF×vV"ÖÖ&¶WBÖG&r×csFF×6÷W&6SÒ&–çfVçF÷'’"FFÖ—FVÒÖ–CÒ"G¶W62†–ç7Bæ—FVÔ–B—Ò"FF×Væ—BÖ–æFWƒÒ"G¶–ç7BçVæ—D–æFW‡Ò"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–ç7Bç÷2ç‚³Ò÷7âG¶–ç7BçwÓ¶w&–B×&÷s¢G¶–ç7Bç÷2ç’³Ò÷7âG¶–ç7Bæ‡Ò"F—FÆSÒ"G¶W62†–ç7Bæ—FVÒææÖWÇÆ–ç7Bæ—FVÔ–B—ÒG¶öffW#ö+r	ýíMm}G¶f÷&ÖD7&VF—G2†öffW"ç6VÆÅ&–6R—Ö¢r+r
]=íMÝòÝRýÝÍ]-òwÒ#âG·&VæFW$VçF—G•F‡VÖ"†–ç7Bæ—FVÒ—ÓÇ7ãâG¶W62†–ç7Bæ—FVÒææÖWÇÆ–ç7Bæ—FVÔ–B—ÓÂ÷7ããÇ6ÖÆÃâG¶–ç7BçwÜ9rG¶–ç7Bæ‡ÒG¶öffW#ö+rG¶f÷&ÖD7&VF—G2†öffW"ç6VÆÅ&–6R—Ö¢rwÓÂ÷6ÖÆÃãÂö'WGFöãæ·Ò’æ¦ö–â‚rr“¶6öç7B÷fW&fÆ÷sÖÆ–÷WBæ÷fW&fÆ÷ræf–ÇFW"†–ç7CÓæÖ&¶WEF$ÖF6†W5vV%cs2†–ç7Bæ—FV×ÇÄæFFæ—FV×2ævWB†–ç7Bæ—FVÔ–B’ÇF"’“·&WGW&æÆF—b6Æ73Ò&Ö&¶WBÖ–çfVçF÷'’Öw&–B×cs"FF×vV"ÖÖ&¶WBÖ–çfVçF÷'’ÖG&÷×cs7G–ÆSÒ"ÒÖ–çbÖ6öÇ3¢G¶Æ–÷WBæ6öÇ7Ó²ÒÖ–çb×&÷w3¢G¶Æ–÷WBç&÷w7Ò#âG¶6VÆÇ7ÒG·F–ÆW7ÓÂöF—câG¶÷fW&fÆ÷ræÆVæwFƒöÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’Ö÷fW&fÆ÷r×ccr#ãÆ#í	ÝRýíÍ]]-ó¢G¶÷fW&fÆ÷ræÆVæwF‡ÓÂö#ãÂöF—cæ¢rwÖ·Ð¢gVæ7F–öâÖ&¶WEG—TÆ&VÅvV%cs†—FVÓ×·Ò—¶6öç7BG—SÖæ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÒ“·&WGW&â‡·vVöã¢}	í=mRrÇ6†–VÆC¢}
-²rÆw&VæFS¢}	=Ý-rÇGW'&WC¢}
-=]½ÂrÆG&öæS¢}	MíÒrÆ&Ö÷#¢}	íÝòrÆ–×ÆçC¢}	Íý½Ý"rÇ7Fö6³¢}	­m‚wÒ•·G—U×ÇÂ}
Ýým]ÝRs·Ð¢gVæ7F–öâÖ&¶WEvVöå6Æ÷DÆ&VÅvV%cs‡fÇVR—·&WGW&â‡·&–Ö'“¢}	íÝí-ÝíRrÇ6V6öæF'“¢}	--í}ÝíRrÇfW'6F–ÆS¢}
=Ý-]½ÍÝíRwÒ•µ7G&–ær‡fÇVWÇÂw&–Ö'’r•×ÇÅ7G&–ær‡fÇVWÇÂ}	íÝí-ÝíRr“·Ð¢gVæ7F–öâÖ&¶WE&WV—&VÖVçEFW‡EvV%cs†—FVÓ×·Ò—¶6öç7B&WÖ—FVÒç&WV—&VÖVçG2bgG—Vöb—FVÒç&WV—&VÖVçG3ÓÓÒvö&¦V7Bsö—FVÒç&WV—&VÖVçG3§·Ó¶6öç7B&÷w3Ô$”Ä•D”U5õcS"æf–ÇFW"‡&÷sÓäçVÖ&W"‡&W·&÷ræ¶W•×ÇÃ“ã’æÖ‡&÷sÓæG·&÷rç6†÷'GÒG´çVÖ&W"‡&W·&÷ræ¶W•Ò—Ö“·&WGW&â&÷w2æÆVæwFƒ÷&÷w2æ¦ö–â‚r+rr“¢}Ý]"s·Ð¢gVæ7F–öâÖ&¶WD—FVÔFWF–Ç5vV%cs†—FVÒÆöffW"—¶6öç7BG—SÖæ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÒ’Ç6—¦SÖÖ&¶WE6—¦UvV%cs†—FVÒ’ÆÖ73ÔçVÖ&W"†—FVÒæÖ73óö—FVÒçvV–v‡Cóó’Æf7G3Õ¶
-ó¢G¶Ö&¶WEG—TÆ&VÅvV%cs†—FVÒ—ÖÆ—FVÒç&&—G“ö
]M­í-Ã¢G¶—FVÒç&&—G—Ö¢rrÆ
}Í]¢G·6—¦RçwÜ9rG·6—¦Ræ‡ÖÆ	Í¢G´çVÖ&W"æ—4f–æ—FR†Ö72“öÖ73£ÖÆöffW#òçVæ—VSò}
=Ý­½ÍÝ½’ý]MÍ]"s¢ruÓ¶–b‡G—SÓÓÒwvVöâr—¶–b†—FVÒæFÖvR–f7G2çW6‚†
=íÓ¢G¶—FVÒæFÖvWÖ“¶–b„çVÖ&W"†—FVÒç&ævWÇÃ“ã–f7G2çW6‚†	M½ÍÝí-Ã¢G´çVÖ&W"†—FVÒç&ævR—Ö“¶f7G2çW6‚†	ýíýMÝS¢G´çVÖ&W"†—FVÒæ†—D&öçW7ÇÃ“ãÓòr²s¢rwÒG´çVÖ&W"†—FVÒæ†—D&öçW7ÇÃ—Ö“¶f7G2çW6‚†
½í#¢G¶Ö&¶WEvVöå6Æ÷DÆ&VÅvV%cs†—FVÒçvVöå6Æ÷B—Ö“·Ö–b‡G—SÓÓÒvw&VæFRr—¶–b†—FVÒæFÖvR–f7G2çW6‚†
=íÓ¢G¶—FVÒæFÖvWÖ“¶f7G2çW6‚†	íí£¢G´çVÖ&W"†—FVÒæw&VæFU&ævWÇÃ—ÖÆ
M=¢G´çVÖ&W"†—FVÒæw&VæFU&F—W7ÇÃ—Ö“·Ö–b…²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2‡G—R’—¶–b†—FVÒæFÖvR–f7G2çW6‚†
=íÓ¢G¶—FVÒæFÖvWÖ“¶f7G2çW6‚†	M½ÍÝí-Ã¢G´çVÖ&W"†—FVÒç&ævWÇÃ—ÖÆ…¢G´çVÖ&W"†—FVÒçVæ—D‡ÇÃ—ÖÆ	­	¢G´çVÖ&W"†—FVÒçVæ—D&Ö÷$6Æ77ÇÃ—Ö“¶–b‡G—SÓÓÒvG&öæRr–f7G2çW6‚†	M-m]ÝS¢G´çVÖ&W"†—FVÒçVæ—DÖ÷fU&ævWÇÃ—Ö“·Ö–b‡G—SÓÓÒv&Ö÷"rbdçVÖ&W"†—FVÒæ&Ö÷$6Æ77ÇÃ“ã–f7G2çW6‚†	­½íÝƒ¢G´çVÖ&W"†—FVÒæ&Ö÷$6Æ72—Ö“¶–b‡G—SÓÓÒv–×ÆçBr–f7G2çW6‚†
-]=]ÍòÝÝ]=ó¢G´çVÖ&W"†—FVÒæVæW&w•&WV—&VCóö—FVÒç&WV—&VDVæW&w“óó—Ö“¶6öç7BFw3Ô'&’æ—4'&’†—FVÒçFw2“ö—FVÒçFw2æÖ‡FsÓå7G&–ær‡FwÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ“¥µÓ·&WGW&æÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖf7G2×cs#âG¶f7G2æf–ÇFW"„&ööÆVâ’æÖ†f7CÓæÇ7â6Æ73Ò'–ÆÂ#âG¶W62†f7B—ÓÂ÷7ãæ’æ¦ö–â‚rr—ÒG·v–æF÷räu%t—FVÔf7G5cCòç–ÆÇ2†—FVÒÇ¶W†6ÇVFTÆ&VÇ3¦f7G7Ò—ÇÂrwÓÂöF—cãÇ6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖFW67&—F–öâ×cs#âG¶W62†—FVÒæFW67ÇÆ—FVÒæFW67&—F–öçÇÆ—FVÒç7VÖÖ'—ÇÂ}	íýÝRý]MÍ]-ÝR}MÝââr—ÓÂ÷ãÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâ×&WV—&VÖVçG2×cs#ãÆ#í
-]í-Ýó£Âö#âG¶W62†Ö&¶WE&WV—&VÖVçEFW‡EvV%cs†—FVÒ’—ÓÂöF—câG·Fw2æÆVæwFƒöÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâ×Fw2×cs#ãÆ#í	­-]=íƒ£Âö#âG¶W62‡Fw2æ¦ö–â‚r+rr’—ÓÂöF—cæ¢rwÖ·Ð¢gVæ7F–öâVçF—G”6öçG&öÇ5vV%c3’‡·Æ–W"Æ—FVÒÆöffW"Æ'W’Ç7Fö6²Æ÷væVCÓÆF—6&ÆVCÖfÇ6RÆ66—G“×¶ö³§G'VW×Ò—°¢–b‚'W’bb7Fö6²—&WGW&æÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ&'WGFöâ"FF×vV"ÖÖ&¶WBÖ7F–öâ×csÒ'6VÆÂ"G¶F—6&ÆVCòvF—6&ÆVBs¢rwÓí	ý
	í	M	
-
ÃÂö'WGFöãæ°¢6öç7BVæ—E&–6SÔÖF‚æÖ‚ƒÄçVÖ&W"†'W“ööffW#òç&–6S¦öffW#òç6VÆÅ&–6R—ÇÃ’Æ7&VF—G3ÔÖF‚æÖ‚ƒÄçVÖ&W"‡Æ–W#òæ7&VF—G2—ÇÃ’Æff÷&F&ÆSÖ'W“ò‡Væ—E&–6SãôÖF‚æfÆö÷"†7&VF—G2÷Væ—E&–6R“£“¤ÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†÷væVB—ÇÃ’’ÆÆ–Ö—CÔÖF‚æÖ‚ƒÄÖF‚æÖ–âƒÆöffW#òçVæ—VSó¦ff÷&F&ÆR’’Æ7F–öãÖ'W“òv'W’s¢w6VÆÂrÆ7F–öäGG#×7Fö6³òvFF×vV"×7Fö6²Ö7F–öâ×csBs¢vFF×vV"ÖÖ&¶WBÖ7F–öâ×css°¢&WGW&æÆF—b6Æ73Ò&Ö&¶WB×VçF—G’×c3’"FF×vV"ÖÖ&¶WB×VçF—G’×c3’FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"FFÖ7F–öãÒ"G¶7F–öçÒ"FF×7Fö6³Ò"G·7Fö6³òss¢swÒ"FF×Væ—B×&–6SÒ"G·Væ—E&–6WÒ"FFÖÆ–Ö—CÒ"G¶Æ–Ö—GÒ#ãÆÆ&VÃí	­í½}]--ãÂöÆ&VÃãÆF—b6Æ73Ò&Ö&¶WB×VçF—G’Ö–çWB×c3’#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×vV"ÖÖ&¶WB×G’×7FW×c3“Ò"Ó"&–ÖÆ&VÃÒ-
=Í]ÝÍ-Â­í½}]--â#î(‰#Âö'WGFöããÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""–çWFÖöFSÒ&çVÖW&–2"Ö–ãÒ#"ÖƒÒ"G´ÖF‚æÖ‚ƒÆÆ–Ö—B—Ò"7FWÒ#"fÇVSÒ#"FF×vV"ÖÖ&¶WB×G’Ö–çWB×c3’&–ÖÆ&VÃÒ-	­í½}]--âM½òíý]m‚#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×vV"ÖÖ&¶WB×G’×7FW×c3“Ò#"&–ÖÆ&VÃÒ-
=-]½}-Â­í½}]--â#â³Âö'WGFöããÂöF—cãÆF—b6Æ73Ò&Ö&¶WB×VçF—G’×F÷FÂ×c3’#ãÇ7ãí	-í=ãÂ÷7ããÆ"FF×vV"ÖÖ&¶WB×G’×F÷FÂ×c3“âG¶f÷&ÖD7&VF—G2‡Væ—E&–6R—ÓÂö#ãÂöF—cãÇ6ÖÆÂ6Æ73Ò&Ö&¶WB×VçF—G’ÖW'&÷"×c3’G¶66—G“òæö³ÓÓÖfÇ6Sòwf—6–&ÆRs¢rwÒ"FF×vV"ÖÖ&¶WB×G’ÖW'&÷"×c3“âG¶66—G“òæö³ÓÓÖfÇ6SöW62†66—G’ç&V6öâ“¦Æ–Ö—CÃò†'W“ò}	Ý]Mí--í}Ýâ­]M-í"âs¢}	"ýí-M]½RÝ]"Ý-í’­m‚âr“¢rwÓÂ÷6ÖÆÃãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ&'WGFöâ"G¶7F–öäGG'ÓÒ"G¶7F–öçÒ"G¶F—6&ÆVGÇÆÆ–Ö—CÃÇÆ66—G“òæö³ÓÓÖfÇ6SòvF—6&ÆVBs¢rwÓâG¶'W“ò}	­
=	ý	
-
Âs¢}	ý
	í	M	
-
ÂwÒ+rG·7Fö6³ò}­bâs¢}"âwÓÂö'WGFöããÂöF—cæ°¢Ð¢gVæ7F–öâWFFTÖ&¶WEVçF—G•vV%c3’†6öçG&öÂ—°¢–b‚6öçG&öÂ—&WGW&â¶6öç7B–çWCÖ6öçG&öÂçVW'•6VÆV7F÷"‚u¶FF×vV"ÖÖ&¶WB×G’Ö–çWB×c3•Òr’Æ'WGFöãÖ6öçG&öÂçVW'•6VÆV7F÷"‚u¶FF×vV"ÖÖ&¶WBÖ7F–öâ×csÒÅ¶FF×vV"×7Fö6²Ö7F–öâ×csEÒr’ÆW'&÷#Ö6öçG&öÂçVW'•6VÆV7F÷"‚u¶FF×vV"ÖÖ&¶WB×G’ÖW'&÷"×c3•Òr’ÇF÷FÃÖ6öçG&öÂçVW'•6VÆV7F÷"‚u¶FF×vV"ÖÖ&¶WB×G’×F÷FÂ×c3•Òr’ÆÆ–Ö—CÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†6öçG&öÂæFF6WBæÆ–Ö—B—ÇÃ’’ÇVæ—E&–6SÔÖF‚æÖ‚ƒÄçVÖ&W"†6öçG&öÂæFF6WBçVæ—E&–6R—ÇÃ’Æ7F–öãÖ6öçG&öÂæFF6WBæ7F–öãÓÓÒw6VÆÂsòw6VÆÂs¢v'W’rÇ7Fö6³Ö6öçG&öÂæFF6WBç7Fö6³ÓÓÒss°¢ÆWBVçF—G“ÔÖF‚çG'Væ2„çVÖ&W"†–çWCòçfÇVR—ÇÃ“·VçF—G“ÔÖF‚æÖ‚ƒÄÖF‚æÖ–â„ÖF‚æÖ‚ƒÆÆ–Ö—B’ÇVçF—G’’“¶–b†–çWB––çWBçfÇVSÕ7G&–ær‡VçF—G’“¶–b‡F÷FÂ—F÷FÂçFW‡D6öçFVçCÖf÷&ÖD7&VF—G2‡Væ—E&–6R§VçF—G’“¶ÆWBÖW76vSÖÆ–Ö—CÃò†7F–öãÓÓÒv'W’sò}	Ý]Mí--í}Ýâ­]M-í"âs¢}	"ýí-M]½RÝ]"Ý-í’­m‚âr’¢rs°¢–b‚ÖW76vRbf7F–öãÓÓÒv'W’rbb7Fö6²—¶6öç7B6†V6³Ö6äFD–çfVçF÷'”—FVÕvV%ccr†7W'&VçEÆ–W"‚’Å7G&–ær†6öçG&öÂæFF6WBæ—FVÔ–GÇÂrr’ÇVçF—G’“¶–b†6†V6³òæö³ÓÓÖfÇ6R–ÖW76vSÖ6†V6²ç&V6öã·Ð¢–b†W'&÷"—¶W'&÷"çFW‡D6öçFVçCÖÖW76vS¶W'&÷"æ6Æ74Æ—7BçFövvÆR‚wf—6–&ÆRrÄ&ööÆVâ†ÖW76vR’“·Ö–b†'WGFöâ—¶'WGFöâæF—6&ÆVCÔ&ööÆVâ†ÖW76vR—ÇÆÆ–Ö—CÃ¶'WGFöâçFW‡D6öçFVçCÖG¶7F–öãÓÓÒv'W’sò}	­
=	ý	
-
Âs¢}	ý
	í	M	
-
ÂwÒ+rG·VçF—G—ÒG·7Fö6³ò}­bâs¢}"âwÖ·×&WGW&âVçF—G“°¢Ð¢gVæ7F–öâÖ&¶WE6VÆV7F–öåvV$Ö&·Wcs‡&÷FF–öâÇÆ–W"—¶6öç7B—FVÓÖÖ&¶WE6VÆV7F–öåvV%csòæ—FVÔ–CôæFFæ—FV×2ævWB†Ö&¶WE6VÆV7F–öåvV%csæ—FVÔ–B“¦çVÆÃ¶–b‚—FVÒ—&WGW&âsÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖV×G’×cs#í	-½]-Rý½-­2-í-½‚ý]MÍ]-ãÂöF—câs¶6öç7B'W“ÖÖ&¶WE6VÆV7F–öåvV%csç6÷W&6SÓÓÒvÖ&¶WBrÆöffW#Ò†'W“÷&÷FF–öâæöffW'3§&÷FF–öâæÆÄöffW'2’æf–æB‡&÷sÓç&÷ræ—FVÔ–CÓÓÖ—FVÒæ–B’Æ66—G“Ö'W“ö6äFD–çfVçF÷'”—FVÕvV%ccr‡Æ–W"Æ—FVÒæ–BÃ“§¶ö³§G'VWÒÆF—6&ÆVCÒöffW'ÇÂ†'W’bb‚66—G’æö·ÇÄçVÖ&W"‡Æ–W"æ7&VF—G7ÇÃ“ÄçVÖ&W"†öffW"ç&–6WÇÃ’’’Ç6VÆÅW&6VçCÖÖ&¶WE6VÆÅW&6VçEvV%cs2†öffW"Æ—FVÒ“·&WGW&æÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖ6&B×cs#âG·&VæFW$VçF—G•F‡VÖ"†—FVÒ—ÓÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖFWF–Ç2×cs#ãÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖ†VF–ær×cs#ãÆ#âG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂö#ãÇ7G&öæsâG¶'W“ö	ýí­=ý­¢G¶f÷&ÖD7&VF—G2†öffW#òç&–6WÇÃ—Ö¦öffW#ö	ýíMm¢G¶f÷&ÖD7&VF—G2†öffW"ç6VÆÅ&–6R—Ò‚G·6VÆÅW&6VçGÒR–¢}
]=íMÝòÝ-í"-í-ÝRýÝÍ]-òwÓÂ÷7G&öæsãÂöF—câG¶Ö&¶WD—FVÔFWF–Ç5vV%cs†—FVÒÆöffW"—ÓÂöF—câG·VçF—G”6öçG&öÇ5vV%c3’‡·Æ–W"Æ—FVÒÆöffW"Æ'W’Ç7Fö6³¦fÇ6RÆF—6&ÆVBÆ66—G—Ò—ÓÂöF—cæ·Ð¢&VæFW$Ö&¶WCÖgVæ7F–öâ‚—°¢6öç7B&ö÷CÒB‚r767&VVâÖÖ&¶WBr’ÇÆ–W#Ö7W'&VçEÆ–W"‚’ÇÆæWCÖ7W'&VçEÆæWB‚“°¢6WEF÷&"‚}
-í=í-½’-]ÍÝ²rÂ}	]m]MÝ]-Ýòí-mòí-Í]Ý-‚m]Òr“°¢–b‚Æ–W'ÇÂÆæWB—·&ö÷Bæ–ææW$…DÔÃÒsÆF—b6Æ73Ò'Æ6V†öÆFW"Ö&¶WBÖF—6&ÆVB#í
-]ÍÝ²}½í­í-Òâ
2ýíM½òÝ]"-]­=]’ý½Ý]-²ãÂöF—câs·&WGW&ã·Ð¢6öç7B&÷FF–öãÖÖ&¶WE&÷FF–öåvV%cs‡ÆæWB“°¢6öç7Bf—6–&ÆTöffW'3×&÷FF–öâæöffW'2æf–ÇFW"†öffW#ÓæÖ&¶WEF$ÖF6†W5vV%cs2„æFFæ—FV×2ævWB†öffW"æ—FVÔ–B’’“°¢6öç7Bf—6–&ÆTÆÄöffW'3×&÷FF–öâæÆÄöffW'2æf–ÇFW"†öffW#ÓæÖ&¶WEF$ÖF6†W5vV%cs2„æFFæ—FV×2ævWB†öffW"æ—FVÔ–B’’“°¢6öç7B6FVv÷'”“×v–æF÷räu%tÖ&¶WD6FVv÷&–W5cCC°¢6öç7B6FVv÷&–W3Ö6FVv÷'”’æ6FVv÷&–W2‡f—6–&ÆTöffW'2Æ–CÓäæFFæ—FV×2ævWB†–B’“°¢–b†vööG46FVv÷'•vV%cCBÓÒvÆÂrbb6FVv÷&–W2ç6öÖR‡&÷sÓç&÷ræÆ&VÃÓÓÖvööG46FVv÷'•vV%cCB’–vööG46FVv÷'•vV%cCCÒvÆÂs°¢6öç7Bf–ÇFW&VDöffW'3ÖÖ&¶WEF%vV%cs3ÓÓÒvvööG2rbfvööG46FVv÷'•vV%cCBÓÒvÆÂs÷f—6–&ÆTöffW'2æf–ÇFW"‡&÷sÓæ6FVv÷'”’æ6FVv÷'’„æFFæ—FV×2ævWB‡&÷ræ—FVÔ–B’“ÓÓÖvööG46FVv÷'•vV%cCB“§f—6–&ÆTöffW'3°¢6öç7B6FVv÷'•–6¶W#ÖÖ&¶WEF%vV%cs3ÓÓÒvvööG2söÆF—b6Æ73Ò&Ö&¶WBÖ6FVv÷&–W2×cCB"&öÆSÒ&w&÷W"&–ÖÆ&VÃÒ-	­-]=í‚-í-í"#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’G¶vööG46FVv÷'•vV%cCCÓÓÒvÆÂsòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"&–×&W76VCÒ"G¶vööG46FVv÷'•vV%cCCÓÓÒvÆÂwÒ"FF×vV"ÖÖ&¶WBÖ6FVv÷'’×cCCÒ&ÆÂ#í	-RÇ7ãâG·f—6–&ÆTöffW'2æÆVæwF‡ÓÂ÷7ããÂö'WGFöãâG¶6FVv÷&–W2æÖ‡&÷sÓæÆ'WGFöâ6Æ73Ò'6V6öæF'’G¶vööG46FVv÷'•vV%cCCÓÓ×&÷ræÆ&VÃòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"&–×&W76VCÒ"G¶vööG46FVv÷'•vV%cCCÓÓ×&÷ræÆ&VÇÒ"FF×vV"ÖÖ&¶WBÖ6FVv÷'’×cCCÒ"G¶W62‡&÷ræÆ&VÂ—Ò#âG¶W62‡&÷ræÆ&VÂ—ÒÇ7ãâG·&÷ræ6÷VçGÓÂ÷7ããÂö'WGFöãæ’æ¦ö–â‚rr—ÓÂöF—cæ¢rs°¢–b†Ö&¶WE6VÆV7F–öåvV%csbb‚Ö&¶WEF$ÖF6†W5vV%cs2„æFFæ—FV×2ævWB†Ö&¶WE6VÆV7F–öåvV%csæ—FVÔ–B’—ÇÂ†Ö&¶WE6VÆV7F–öåvV%csç6÷W&6SÓÓÒvÖ&¶WBrbbf—6–&ÆTöffW'2ç6öÖR†öffW#ÓæöffW"æ—FVÔ–CÓÓÖÖ&¶WE6VÆV7F–öåvV%csæ—FVÔ–B’’’–Ö&¶WE6VÆV7F–öåvV%csÖçVÆÃ°¢&ö÷Bæ–ææW$…DÔÃÖÆF—b6Æ73Ò&Ö&¶WB×FW&Ö–æÂ×cs#ãÆF—b6Æ73Ò&†W&òÖ6&BÖ&¶WBÖ†W&ò×cs#ãÆF—b6Æ73Ò'6V7F–öâÖ†VB#ãÆF—cãÆF—b6Æ73Ò&W–V'&÷r#í
-	í
	=	í	-
½	’
-	]
	Í		Ý		³ÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#âG¶W62‡ÆæWBææÖR—ÓÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	=í-í’M]ÝÂ½Ý­¢G¶W62†f÷&ÖDFFR‡&÷FF–öâç&÷FF–öä¶W’’—ÓÂöF—cãÂöF—cãÆF—b6Æ73Ò'–ÆÂ#í	½Ý¢G¶f÷&ÖD7&VF—G2‡Æ–W"æ7&VF—G7ÇÃ—ÓÂöF—cãÂöF—cãÂöF—cãÆF—b6Æ73Ò&Ö&¶WB×F'2×cs2"&öÆSÒ'F&Æ—7B"&–ÖÆ&VÃÒ-
}M]²-í=í-í=â-]ÍÝ½#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’G¶Ö&¶WEF%vV%cs3ÓÓÒvvööG2sòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"&öÆSÒ'F""&–×6VÆV7FVCÒ"G¶Ö&¶WEF%vV%cs3ÓÓÒvvööG2wÒ"FF×vV"ÖÖ&¶WB×F"×cs3Ò&vööG2#í
-	í	-	

³Âö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’G¶Ö&¶WEF%vV%cs3ÓÓÒw7Fö6·2sòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"&öÆSÒ'F""&–×6VÆV7FVCÒ"G¶Ö&¶WEF%vV%cs3ÓÓÒw7Fö6·2wÒ"FF×vV"ÖÖ&¶WB×F"×cs3Ò'7Fö6·2#í		­
m		ƒÂö'WGFöããÂöF—cãÆF—b6Æ73Ò&Ö&¶WBÖ66W72Ö&ææW"×csö²#í	ýí­=ý­Mí-=ýÝâ	í½}Ý½R-í-²ýíMí-ò}sR-]­=]’m]Ý²ãÂöF—cãÆF—b6Æ73Ò&Ö&¶WBÖGVÂÖw&–B×cs#ãÇ6V7F–öâ6Æ73Ò&Ö&¶WB×æR×csÖ&¶WB×7Fö6²×æR×cs"FF×vV"ÖÖ&¶WB×7Fö6²ÖG&÷×csãÆF—b6Æ73Ò&Ö&¶WB×æRÖ†VB×cs#ãÆF—cãÇ7â6Æ73Ò&W–V'&÷r#âG¶Ö&¶WEF%vV%cs3ÓÓÒw7Fö6·2sò}		­
m		‚s¢}
-	í	-	

²wÓÂ÷7ããÆ#âG¶Ö&¶WEF%vV%cs3ÓÓÒw7Fö6·2sò}	­m‚s¢}
-í-²wÓÂö#ãÂöF—cãÇ7ãâG¶f–ÇFW&VDöffW'2æÆVæwF‡ÒýírãÂ÷7ããÂöF—câG¶6FVv÷'•–6¶W'ÓÆF—b6Æ73Ò&Ö&¶WB×6†÷Öw&–B×cs#âG¶f–ÇFW&VDöffW'2æÖ†Ö&¶WDöffW%F–ÆUvV%cs’æ¦ö–â‚rr—ÇÆÆF—b6Æ73Ò'Æ6V†öÆFW"#í	"-]­=]’í-m‚Ý]"G¶Ö&¶WEF%vV%cs3ÓÓÒw7Fö6·2sò}­m’s¢}-í-í"wÒãÂöF—cæÓÂöF—cãÂ÷6V7F–öããÇ6V7F–öâ6Æ73Ò&Ö&¶WB×æR×cs#ãÆF—b6Æ73Ò&Ö&¶WB×æRÖ†VB×cs#ãÆF—cãÇ7â6Æ73Ò&W–V'&÷r#í		Ý	-	]	Ý
-	

ÃÂ÷7ããÆ#âG¶Ö&¶WEF%vV%cs3ÓÓÒw7Fö6·2sò}	ýí-M]½Âs¢}	Ý-]Ý-ÂwÓÂö#ãÂöF—cãÇ7ãâG¶f÷&ÖD7&VF—G2‡Æ–W"æ7&VF—G7ÇÃ—ÓÂ÷7ããÂöF—câG¶Ö&¶WD–çfVçF÷'•vV%cs‡Æ–W"Çf—6–&ÆTÆÄöffW'2ÆÖ&¶WEF%vV%cs2—ÓÂ÷6V7F–öããÂöF—câG¶Ö&¶WE6VÆV7F–öåvV$Ö&·Wcs‡&÷FF–öâÇÆ–W"—ÓÂöF—cæ°¢Ó°¢7–æ2gVæ7F–öâG&ç67DÖ&¶WEvV%cs‡–ÆöB’°¢6öç7BÆ–W#Ö7W'&VçEÆ–W"‚’ÇÆæWCÖ7W'&VçEÆæWB‚“°¢–b‚Æ–W'ÇÂÆæWB—F‡&÷ræWrW'&÷"‚}
-í=í-½’-]ÍÝ²Ý]Mí-=ý]Òr“°¢&WGW&âÆ–W%w&—FW5c3Rç'Vâ‡Æ–W"æ–BÆ7–æ2‚“Óç°¢6öç7B¶W“Òvw'v’æÖ&¶WBçVæF–ærçc3“¢r´æ6öæf–ræ6×–vä–B²s¢r·Æ–W"æ–C°¢6öç7B–çFVçC×¶6×–vä–C¤æ6öæf–ræ6×–vä–BÇÆ–W$–C§Æ–W"æ–BÇÆæWD–C§ÆæWBæ–BÂââç–ÆöGÓ°¢ÆWB6fVCÖçVÆÃ·G'—·6fVCÔ¥4ôâç'6R†Æö6Å7F÷&vRævWD—FVÒ†¶W’—ÇÂvçVÆÂr“·Ö6F6‡·Ð¢–b‡6fVBbbv–æF÷räu%uÆ–W%7–æ46÷&Uc3RæWVÂ‡6fVBæ–çFVçBÆ–çFVçB’—F‡&÷ræWrW'&÷"‚}	ý]M½M=ò-í=í-òíý]mòÝRýíM--]mM]Ýâ	ýí--í-R]ý]]BÝí-í’ýí­=ý­í’âr“°¢6öç7B&WVW7C×6fVCòç&WVW7GÇÇ²ââæ–çFVçBÆ÷W&F–öä–C§v–æF÷räu%uÆ–W%7–æ46÷&Uc3Ræ÷W&F–öä–B‚’ÇWFFVD'“¤æ6öæf–ræFWf–6TÆ&VÇÇÂwvV"ÖÖ&¶WBwÓ°¢Æö6Å7F÷&vRç6WD—FVÒ†¶W’Ä¥4ôâç7G&–æv–g’‡¶–çFVçBÇ&WVW7GÒ’“°¢ÆWB&W7VÇC°¢f÷"†ÆWBGFV×CÓ¶GFV×CÃ3¶GFV×B²²—°¢G'—·&W7VÇCÖv—B$fWF6‚„æ6öæf–rÂrö’öw'v’öÖ&¶WB÷G&ç67F–öâ×c3’rÇ¶ÖWF†öC¢uõ5BrÆ§6öã§&WVW7GÒ“¶'&V³·Ð¢6F6‚†W'&÷"—¶–b†W'&÷"ç7FGW2bfW'&÷"ç7FGW3ÃS—¶Æö6Å7F÷&vRç&VÖ÷fT—FVÒ†¶W’“·F‡&÷rW'&÷#·Ö–b†GFV×CÓÓÓ"—F‡&÷rW'&÷#·Ð¢Ð¢–b‚&W7VÇCòæö²—F‡&÷ræWrW'&÷"‡&W7VÇCòæÖW76vWÇÂ}	íý]mò½Ý­ÝR-½ýí½Ý]Ýr“°¢Æö6Å7F÷&vRç&VÖ÷fT—FVÒ†¶W’“°¢–b‡&W7VÇBçÆ–W"—°¢6öç7B&÷sÖæ÷&ÖÆ—¦UÆ–W%&÷r‡·Æ–W$–C§Æ–W"æ–BÆ6×–vä–C¤æ6öæf–ræ6×–vä–BÇÆ–W$§6öã§&W7VÇBçÆ–W"ÇfW'6–öã§&W7VÇBçÆ–W%fW'6–öâÇWFFVDC§&W7VÇBçÆ–W%WFFVDBÇWFFVD'“§&W7VÇBçÆ–W%WFFVD'’Æ6Æ–VçEWFFVDC§&W7VÇBçÆ–W$6Æ–VçEWFFVDGÒ“°¢6öç7B7W'&VçCÔæFFçÆ–W%&÷w2ævWB‡Æ–W"æ–B“°¢–b‚7W'&VçGÇÄçVÖ&W"‡&÷rçfW'6–öâ“ãÔçVÖ&W"†7W'&VçBçfW'6–öâ’”æFFçÆ–W%&÷w2ç6WB‡Æ–W"æ–BÇ&÷r“°¢æFFçÆ–W'3Ö'V–ÆEÆ–W$Ö„æ66†Rç6æ6†÷BÄ'&’æg&öÒ„æFFçÆ–W%&÷w2çfÇVW2‚’’“°¢Ð¢Ö&¶WE6VÆV7F–öåvV%csÖçVÆÃ°¢v—B6fT66†R‚“¶–b‡&W7VÇBç6æ6†÷D6†ævVB–v—BVÆÄWfW'—F†–ær‡·6–ÆVçC§G'VRÇ&VæFW#¦fÇ6WÒ“°¢&VæFW$Ö&¶WB‚“¶æ÷F–g’‡–ÆöBæ7F–öãÓÓÒv'W’sò}	ýí­=ý­}-]]Ýs¢}	ýíMm}-]]ÝrÂvö²r“·&WGW&â&W7VÇC°¢Ò“°¢Ð ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç¶6öç7BF#ÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WB×F"×cs5Òr“¶–b‡F"bgF"æ6Æ÷6W7B‚r767&VVâÖÖ&¶WBr’—¶Ö&¶WEF%vV%cs3×F"æFF6WBçvV$Ö&¶WEF%cs3ÓÓÒw7Fö6·2sòw7Fö6·2s¢vvööG2s¶Ö&¶WE6VÆV7F–öåvV%csÖçVÆÃ·&VæFW$Ö&¶WB‚“·&WGW&ã·Ö6öç7B6FVv÷'“ÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WBÖ6FVv÷'’×cCEÒr“¶–b†6FVv÷'’bf6FVv÷'’æ6Æ÷6W7B‚r767&VVâÖÖ&¶WBr’—¶vööG46FVv÷'•vV%cCCÖ6FVv÷'’æFF6WBçvV$Ö&¶WD6FVv÷'•cCC¶Ö&¶WE6VÆV7F–öåvV%csÖçVÆÃ·&VæFW$Ö&¶WB‚“·&WGW&ã·Ö6öç7BF–ÆSÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WBÖG&r×csÒr“¶–b‡F–ÆRbgF–ÆRæ6Æ÷6W7B‚r767&VVâÖÖ&¶WBr’—¶Ö&¶WE6VÆV7F–öåvV%cs×·6÷W&6S¥7G&–ær‡F–ÆRæFF6WBç6÷W&6WÇÂrr’Æ—FVÔ–C¥7G&–ær‡F–ÆRæFF6WBæ—FVÔ–GÇÂrr’ÇVæ—D–æFWƒ¤çVÖ&W"‡F–ÆRæFF6WBçVæ—D–æFWƒóòÓ—Ó·&VæFW$Ö&¶WB‚“·&WGW&ã·Ö6öç7B7F–öãÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WBÖ7F–öâ×csÒr“¶–b‚7F–öçÇÂÖ&¶WE6VÆV7F–öåvV%cs—&WGW&ã¶6öç7B6öçG&öÃÖ7F–öâæ6Æ÷6W7B‚u¶FF×vV"ÖÖ&¶WB×VçF—G’×c3•Òr’ÇVçF—G“Ö6öçG&öÃ÷WFFTÖ&¶WEVçF—G•vV%c3’†6öçG&öÂ“£¶–b†7F–öâæF—6&ÆVB—&WGW&ã·G&ç67DÖ&¶WEvV%cs‡¶7F–öã¥7G&–ær†7F–öâæFF6WBçvV$Ö&¶WD7F–öåcs’Æ—FVÔ–C¦Ö&¶WE6VÆV7F–öåvV%csæ—FVÔ–BÇVæ—D–æFWƒ¦Ö&¶WE6VÆV7F–öåvV%csçVæ—D–æFW‚ÇVçF—G—Ò’æ6F6‚†W'&÷#Óææ÷F–g’†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r’“·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&w7F'BrÆWfVçCÓç¶6öç7BæöFSÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WBÖG&r×csÒr“¶–b‚æöFR—&WGW&ã¶Ö&¶WDG&uvV%cs×·6÷W&6S¥7G&–ær†æöFRæFF6WBç6÷W&6WÇÂrr’Æ—FVÔ–C¥7G&–ær†æöFRæFF6WBæ—FVÔ–GÇÂrr’ÇVæ—D–æFWƒ¤çVÖ&W"†æöFRæFF6WBçVæ—D–æFWƒóòÓ—Ó¶WfVçBæFFG&ç6fW"æVffV7DÆÆ÷vVCÖÖ&¶WDG&uvV%csç6÷W&6SÓÓÒvÖ&¶WBsòv6÷’s¢vÖ÷fRs·G'—¶WfVçBæFFG&ç6fW"ç6WDFF‚wFW‡B÷Æ–ârÆÖ&¶WDG&uvV%csæ—FVÔ–B“·Ö6F6‡·ÖæöFRæ6Æ74Æ—7BæFB‚vÖ&¶WBÖG&vv–ær×csr“·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&vVæBrÆWfVçCÓç¶WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WBÖG&r×csÒr“òæ6Æ74Æ—7Bç&VÖ÷fR‚vÖ&¶WBÖG&vv–ær×csr“¶Ö&¶WDG&uvV%csÖçVÆÃ·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&v÷fW"rÆWfVçCÓç¶–b‚Ö&¶WDG&uvV%cs—&WGW&ã¶6öç7BF&vWCÖÖ&¶WDG&uvV%csç6÷W&6SÓÓÒvÖ&¶WBsöWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WBÖ–çfVçF÷'’ÖG&÷×csÒr“¦WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WB×7Fö6²ÖG&÷×csÒr“¶–b‡F&vWB—¶WfVçBç&WfVçDFVfVÇB‚“¶WfVçBæFFG&ç6fW"æG&÷VffV7CÖÖ&¶WDG&uvV%csç6÷W&6SÓÓÒvÖ&¶WBsòv6÷’s¢vÖ÷fRs·×Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&÷rÆWfVçCÓç¶–b‚Ö&¶WDG&uvV%cs—&WGW&ã¶6öç7B–çfVçF÷'“ÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WBÖ–çfVçF÷'’ÖG&÷×csÒr’Ç7Fö6³ÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WB×7Fö6²ÖG&÷×csÒr“¶–b‚†Ö&¶WDG&uvV%csç6÷W&6SÓÓÒvÖ&¶WBrbb–çfVçF÷'’—ÇÂ†Ö&¶WDG&uvV%csç6÷W&6SÓÓÒv–çfVçF÷'’rbb7Fö6²’—&WGW&ã¶WfVçBç&WfVçDFVfVÇB‚“¶6öç7B–ÆöC×¶7F–öã¦Ö&¶WDG&uvV%csç6÷W&6SÓÓÒvÖ&¶WBsòv'W’s¢w6VÆÂrÆ—FVÔ–C¦Ö&¶WDG&uvV%csæ—FVÔ–BÇVæ—D–æFWƒ¦Ö&¶WDG&uvV%csçVæ—D–æFW‡Ó¶–b†–çfVçF÷'’—¶6öç7B&V7CÖ–çfVçF÷'’ævWD&÷VæF–æt6Æ–VçE&V7B‚’Æ6öÇ3ÔçVÖ&W"†vWD6ö×WFVE7G–ÆR†–çfVçF÷'’’ævWE&÷W'G•fÇVR‚rÒÖ–çbÖ6öÇ2r’—ÇÃÆ6VÆÃ×&V7Bçv–GF‚ö6öÇ3·–ÆöBçF&vWE÷6—F–öã×·ƒ¤ÖF‚æÖ‚ƒÄÖF‚æÖ–â†6öÇ2ÓÄÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE‚×&V7BæÆVgB’ö6VÆÂ’’’Ç“¤ÖF‚æÖ‚ƒÄÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE’×&V7BçF÷’ö6VÆÂ’—Ó·ÖÖ&¶WDG&uvV%csÖçVÆÃ·G&ç67DÖ&¶WEvV%cs‡–ÆöB’æ6F6‚†W'&÷#Óææ÷F–g’†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r’“·Ò“°¢6WD–çFW'fÂ‚‚“Óç¶6öç7B¶W“ÔÖ&¶WDVæv–æUcsòç&÷FF–öä¶W“òâ‚—ÇÂrs¶–b†¶W’bf¶W’ÓÖÆ7DÖ&¶WDF•vV%cs—¶Æ7DÖ&¶WDF•vV%csÖ¶W“¶Ö&¶WE6VÆV7F–öåvV%csÖçVÆÃ¶–b„çV’ç67&VVãÓÓÒvÖ&¶WBr—&VæFW$Ö&¶WB‚“·×ÒÃc“° ¢ò¢cããsB(	BvÆö&Â6V7W&—F–W2W†6†ævRæBæöâÖ–çfVçF÷'’÷'FföÆ–ò¢ð¢ÆWB7Fö6µ6VÆV7F–öåvV%csCÖçVÆÂÇ7Fö6´G&uvV%csCÖçVÆÂÇ7Fö6´W†6†ævUvV%cCƒÖçVÆÂÇ7Fö6µF–ÖVg&ÖUvV%cCƒÒs‚rÇ7Fö6´÷&FW%f–WuvV%cSÒvæWrs°¢6öç7B7Fö6µW&–öD6÷VçG5vV%cS×²sÒs£ÂsVÒs£RÂs‚s£cÒÇ7Fö6µW&–öDÆ&VÇ5vV%cS×²sÒs¢sÍÒrÂsVÒs¢sRÍÒrÂs‚s¢srwÓ°¢6öç7B7Fö6´÷&FW%G—TÆ&VÇ5vV%cS×¶Ö&¶WC¢}
½Ýí}ÝòrÆÆ–Ö—C¢}	½Í-ÝòrÇ7F÷öÆ÷73¢}
-íòÝ½írÇF¶U÷&öf—C¢}
-]¢ÝýíM"rÇG&–Æ–æu÷7F÷¢}
-]½Ý2Ý-íòwÓ°¢6öç7B7Fö6´÷&FW$–çFVçDÆ&VÇ5vV%cS×¶÷VåöÆöæs¢}	í-­½-Â½íÝ2rÆ6Æ÷6UöÆöæs¢}	}­½-Â½íÝ2rÆ÷Vå÷6†÷'C¢}	í-­½-Âí"rÆ6Æ÷6U÷6†÷'C¢}	}­½-Âí"wÓ°¢6öç7B7Fö6´÷&FW%7FGW4Æ&VÇ5vV%cS×·VæF–æs¢}	­--ÝrÆf–ÆÆVC¢}	ýí½Ý]ÝrÆ6æ6VÆÆVC¢}	í-Í]Ý]ÝrÇ&V¦V7FVC¢}	í-­½íÝ]ÝwÓ°¢7–æ2gVæ7F–öâ&Vg&W6…7Fö6´W†6†ævUvV%cC‚‡¶f÷&6T÷&FW'3ÖfÇ6WÓ×·Ò—¶6öç7BÆ–W#Ö7W'&VçEÆ–W"‚“¶–b‚Æ–W#òæ–B—&WGW&ã·G'—¶6öç7B—FVÔ–C×7Fö6µ6VÆV7F–öåvV%csCòæ—FVÔ–GÇÂrs¶6öç7B&W7VÇCÖv—B$fWF6‚„æ6öæf–rÆö’öw'v’÷7Fö6²ÖW†6†ævR×cCƒö6×–vä–CÒG¶Væ6öFUU$”6ö×öæVçB„æ6öæf–ræ6×–vä–B—ÒgÆ–W$–CÒG¶Væ6öFUU$”6ö×öæVçB‡Æ–W"æ–B—Òf—FVÔ–CÒG¶Væ6öFUU$”6ö×öæVçB†—FVÔ–B—Ö“¶–b‡&W7VÇCòæö²—·7Fö6´W†6†ævUvV%cCƒ×&W7VÇC¶–b‡&W7VÇBçÆ–W"”ö&¦V7Bæ76–vâ‡Æ–W"Ç&W7VÇBçÆ–W"“¶–b†Ö&¶WEF%vV%cs3ÓÓÒw7Fö6·2rbdçV’ç67&VVãÓÓÒvÖ&¶WBr—F6…7Fö6´W†6†ævUvV%cC’‡¶f÷&6T÷&FW'7Ò“·×Ö6F6‚†W'&÷"—¶6öç6öÆRçv&â‚u·7Fö6²×cC…ÒrÆW'&÷"æÖW76vR“·×Ð¢gVæ7F–öâÆ—fU7Fö6µV÷FUvV%cC‚†—FVÔ–B—·&WGW&â7Fö6´W†6†ævUvV%cCƒòçV÷FW3òæf–æCòâ‡&÷sÓç&÷ræ—FVÔ–CÓÓÖ—FVÔ–B—ÇÆçVÆÃ·Ð¢gVæ7F–öâ7Fö6µW&–öE&÷w5vV%cS†—FVÔ–B—·&WGW&â‡7Fö6´W†6†ævUvV%cCƒòæ6æFÆW3òå¶—FVÔ–E×ÇÅµÒ’ç6Æ–6R‚Ò‡7Fö6µW&–öD6÷VçG5vV%cS·7Fö6µF–ÖVg&ÖUvV%cC…×ÇÃc’“·Ð¢gVæ7F–öâ7Fö6µW&–öD6†ævUvV%cS†—FVÔ–B—¶6öç7B&÷w3×7Fö6µW&–öE&÷w5vV%cS†—FVÔ–B’ÇV÷FSÖÆ—fU7Fö6µV÷FUvV%cC‚†—FVÔ–B’Ç&–6SÔçVÖ&W"‡V÷FSòç&–6WÇÇ&÷w2æB‚Ó“òæ6Æ÷6WÇÃ’Ç7F'CÔçVÖ&W"‡&÷w5³Óòæ÷VçÇÃ“¶–b‚‡7F'Cã’—&WGW&ç¶6†ævS£ÇW&6VçC£Æf–Æ&ÆS¦fÇ6WÓ¶6öç7B6†ævS×&–6R×7F'C·&WGW&ç¶6†ævRÇW&6VçC¦6†ævR÷7F'B£Æf–Æ&ÆS§G'VWÓ·Ð¢gVæ7F–öâ7Fö6µW&–öD6†ævTÖ&·WvV%cS†—FVÔ–B—¶6öç7BfÇVS×7Fö6µW&–öD6†ævUvV%cS†—FVÔ–B’ÇW×fÇVRæ6†ævSãÓ·&WGW&æÇ7G&öær6Æ73Ò"G·WòwWs¢vF÷vâwÒ#âG·Wò~)k"s¢~)kÂwÒG´ÖF‚æ'2‡fÇVRçW&6VçB’çFôf—†VBƒ"—ÒR+rG·6–væVD7&VF—G5vV%csB‡fÇVRæ6†ævR—Ò}G·7Fö6µW&–öDÆ&VÇ5vV%cS·7Fö6µF–ÖVg&ÖUvV%cC…×ÓÂ÷7G&öæsæ·Ð¢gVæ7F–öâF6…7Fö6´W†6†ævUvV%cC’‡¶f÷&6T÷&FW'3ÖfÇ6WÓ×·Ò—¶6öç7B&ö÷CÒB‚r767&VVâÖÖ&¶WBr“¶–b‚&ö÷B—&WGW&ã¶6öç7B–C×7Fö6µ6VÆV7F–öåvV%csCòæ—FVÔ–GÇÂrs·&ö÷BçVW'•6VÆV7F÷$ÆÂ‚u¶FF×vV"×7Fö6²×csEÕ¶FFÖ—FVÒÖ–EÒr’æf÷$V6‚‡F–ÆSÓç¶6öç7BÖÆ—fU7Fö6µV÷FUvV%cC‚‡F–ÆRæFF6WBæ—FVÔ–B“¶–b‚—&WGW&ã¶6öç7B&–6S×F–ÆRçVW'•6VÆV7F÷"‚w7G&öærr’Æ6†ævS×F–ÆRçVW'•6VÆV7F÷"‚w6ÖÆÂr’ÇW&–öC×F–ÆRæFF6WBæ—FVÔ–CÓÓÖ–Bbg7Fö6µW&–öE&÷w5vV%cS†–B’æÆVæwFƒ÷7Fö6µW&–öD6†ævUvV%cS†–B“§¶6†ævS¤çVÖ&W"‡æ6†ævWÇÃ’ÇW&6VçC¤çVÖ&W"‡æ6†ævUW&6VçGÇÃ—ÒÇW×W&–öBæ6†ævSãÓ·F–ÆRæ6Æ74Æ—7Bç&VÖ÷fR‚wWrÂvF÷vârÂvfÆBr“·F–ÆRæ6Æ74Æ—7BæFB‡7Fö6´6†ævT6Æ75vV%csB‡W&–öBæ6†ævR’“¶–b‡&–6R—&–6RçFW‡D6öçFVçCÖf÷&ÖD7&VF—G2‡ç&–6R“¶–b†6†ævR–6†ævRçFW‡D6öçFVçCÖG·Wò~)k"s¢~)kÂwÒG´ÖF‚æ'2‡W&–öBçW&6VçB’çFôf—†VBƒ"—ÒR+rG·6–væVD7&VF—G5vV%csB‡W&–öBæ6†ævR—ÒG·F–ÆRæFF6WBæ—FVÔ–CÓÓÖ–Cö}G·7Fö6µW&–öDÆ&VÇ5vV%cS·7Fö6µF–ÖVg&ÖUvV%cC…×Ö¢rwÖ·Ò“¶6öç7B6VÆV7F–öã×&ö÷BçVW'•6VÆV7F÷"‚rç7Fö6²×6VÆV7F–öâ×csBr“¶–b‚6VÆV7F–öçÇÂ–B—&WGW&ã¶6öç7BöÆC×6VÆV7F–öâçVW'•6VÆV7F÷"‚rç7Fö6²×F×cC‚Âç7Fö6²Ö6†'BÖV×G’×cC‚r’ÆVF—F–æsÖFö7VÖVçBæ7F—fTVÆVÖVçCòæ6Æ÷6W7Còâ‚rç7Fö6²Ö÷&FW'2×cC‚Âç7Fö6²ÖFÒ×cC’r“¶–b†öÆBbbVF—F–ær–öÆBæ÷WFW$…DÔÃ×7Fö6µFV6†æ–6ÅvV%cC‚†–B“¶6öç7B÷&FW%æVÃ×6VÆV7F–öâçVW'•6VÆV7F÷"‚rç7Fö6²Ö÷&FW'2×cC‚r’Æ—FVÓÔæFFæ—FV×2ævWB†–B“¶–b†—FVÒbf÷&FW%æVÂbb†f÷&6T÷&FW'7ÇÂVF—F–ær’–÷&FW%æVÂæ÷WFW$…DÔÃ×7Fö6´÷&FW%æVÅvV%cC‚†—FVÒ“¶6öç7BÖÆ—fU7Fö6µV÷FUvV%cC‚†–B’Æ&÷ƒ×6VÆV7F–öâçVW'•6VÆV7F÷"‚rç7Fö6²×6VÆV7F–öâ×V÷FR×csBr’ÇW&–öC×7Fö6µW&–öD6†ævUvV%cS†–B“¶–b‡bf&÷‚—¶&÷‚æ6Æ74Æ—7Bç&VÖ÷fR‚wWrÂvF÷vârÂvfÆBr“¶&÷‚æ6Æ74Æ—7BæFB‡7Fö6´6†ævT6Æ75vV%csB‡W&–öBæ6†ævR’“¶&÷‚æ–ææW$…DÔÃÖÇ7ãí
]-]Ýòm]Ý+rG¶W62‡ç&Vv–ÖWÇÂ}ímMÝRr—ÓÂ÷7ããÆ#âG¶f÷&ÖD7&VF—G2‡ç&–6R—ÓÂö#ãÇ6ÖÆÃí	}Í]Ý]ÝRí"Ý}½-½ÝÝí=âý]íMÂ÷6ÖÆÃâG·7Fö6µW&–öD6†ævTÖ&·WvV%cS†–B—Ö·×Ð¢gVæ7F–öâ7Fö6µFV6†æ–6ÅvV%cC‚†—FVÔ–B—¶6öç7B&÷w3×7Fö6µW&–öE&÷w5vV%cS†—FVÔ–B“¶–b‚&÷w2æÆVæwF‚—&WGW&âsÆF—b6Æ73Ò'7Fö6²Ö6†'BÖV×G’×cC‚#í
]-]Ý­ý½-]"-íâ­í-í-í®(
cÂöF—câs¶6öç7BfÇVW3×&÷w2æfÆDÖ‡&÷sÓå´çVÖ&W"‡&÷ræ†–v‚’ÄçVÖ&W"‡&÷ræÆ÷r•Ò’Ç&tÖ–ãÔÖF‚æÖ–â‚ââçfÇVW2’Ç&tÖƒÔÖF‚æÖ‚‚ââçfÇVW2’ÆÖ&v–ãÔÖF‚æÖ‚‚ãÂ‡&tÖ‚×&tÖ–â’¢ã‚’ÆÖ–ãÔÖF‚æÖ‚ƒÇ&tÖ–âÖÖ&v–â’ÆÖƒ×&tÖ‚¶Ö&v–âÇ7ãÔÖF‚æÖ‚‚ãÆÖ‚ÖÖ–â’ÇsÓcCÆƒÓƒÇÓ"Ç7FWÒ‡r×£"’÷&÷w2æÆVæwF‚Ç“×fÇVSÓæ‚×Ò‚„çVÖ&W"‡fÇVR’ÖÖ–â’÷7â’¢†‚×£"’Æ6æFÆW3×&÷w2æÖ‚‡&÷rÆ–æFW‚“Óç¶6öç7Bƒ×·7FW¢†–æFW‚²ãR’ÇWÔçVÖ&W"‡&÷ræ6Æ÷6R“ãÔçVÖ&W"‡&÷ræ÷Vâ“·&WGW&æÆr6Æ73Ò"G·WòwWs¢vF÷vâwÒ#ãÆÆ–æRƒÒ"G·‡Ò"“Ò"G·’‡&÷ræ†–v‚—Ò"ƒ#Ò"G·‡Ò"“#Ò"G·’‡&÷ræÆ÷r—Ò"óãÇ&V7BƒÒ"G·‚ÔÖF‚æÖ‚ƒÇ7FW¢ã#R—Ò"“Ò"G´ÖF‚æÖ–â‡’‡&÷ræ÷Vâ’Ç’‡&÷ræ6Æ÷6R’—Ò"v–GFƒÒ"G´ÖF‚æÖ‚ƒ"Ç7FW¢ãR—Ò"†V–v‡CÒ"G´ÖF‚æÖ‚ƒÄÖF‚æ'2‡’‡&÷ræ÷Vâ’×’‡&÷ræ6Æ÷6R’’—Ò"óãÂösæ·Ò’æ¦ö–â‚rr’Æ–æF–6F÷#ÖÆ—fU7Fö6µV÷FUvV%cC‚†—FVÔ–B“òæ–æF–6F÷'7ÇÇ·Ó·&WGW&æÆF—b6Æ73Ò'7Fö6²×F×cC‚#ãÆF—b6Æ73Ò'7Fö6²Ö6†'BÖ†VB×cC’#ãÆF—cãÆ#í	MÝÍ­m]Ý³Âö#ãÇ6ÖÆÃí	}Í]Ý]ÝR}-]-òí"Ý}½ý]íMÂ÷6ÖÆÃãÂöF—cãÆF—b6Æ73Ò'7Fö6²×F–ÖVg&ÖW2×cC‚#âGµ²sÒrÂsVÒrÂs‚uÒæÖ‡fÇVSÓæÆ'WGFöâG—SÒ&'WGFöâ"6Æ73Ò'6V6öæF'’G·7Fö6µF–ÖVg&ÖUvV%cCƒÓÓ×fÇVSòv7F—fRs¢rwÒ"FF×vV"×7Fö6²×F–ÖVg&ÖR×cCƒÒ"G·fÇVWÒ#âG·fÇVWÓÂö'WGFöãæ’æ¦ö–â‚rr—ÓÂöF—cãÂöF—cãÇ7frf–Wt&÷ƒÒ#G·wÒG¶‡Ò#âG¶6æFÆW7ÓÂ÷7fsãÆF—b6Æ73Ò'7Fö6²ÖÆVvVæB×cC’#ãÇ7â6Æ73Ò'W#î)j
í#Â÷7ããÇ7â6Æ73Ò&F÷vâ#î)j
Ým]ÝSÂ÷7ãâG·7Fö6µW&–öD6†ævTÖ&·WvV%cS†—FVÔ–B—ÓÂöF—cãÆF—b6Æ73Ò'7Fö6²Ö–æF–6F÷'2×cC‚#ãÇ7ãå4ÔRÆ#âG¶–æF–6F÷"ç6ÖSÓÖçVÆÃò~(	Bs¦f÷&ÖD7&VF—G2†–æF–6F÷"ç6ÖR—ÓÂö#ãÂ÷7ããÇ7ãå4Ô#Æ#âG¶–æF–6F÷"ç6Ö#ÓÖçVÆÃò~(	Bs¦f÷&ÖD7&VF—G2†–æF–6F÷"ç6Ö#—ÓÂö#ãÂ÷7ããÇ7ãå%4’BÆ#âG¶–æF–6F÷"ç'6“CÓÖçVÆÃò~(	Bs¤çVÖ&W"†–æF–6F÷"ç'6“B’çFôf—†VBƒ—ÓÂö#ãÂ÷7ããÂöF—cãÂöF—cæ·Ð¢gVæ7F–öâ7Fö6´÷&FW%&–6UvV%cS†÷&FW"—¶–b†÷&FW"ç7FGW3ÓÓÒvf–ÆÆVBr—&WGW&æ	ýí½Ý]Ýã¢G¶f÷&ÖD7&VF—G2†÷&FW"æf–ÆÅ&–6R—Ö¶–b†÷&FW"çG—SÓÓÒvÆ–Ö—Br—&WGW&æ	½Í#¢G¶f÷&ÖD7&VF—G2†÷&FW"æÆ–Ö—E&–6R—Ö¶–b…²w7F÷öÆ÷72rÂwF¶U÷&öf—BuÒæ–æ6ÇVFW2†÷&FW"çG—R’—&WGW&æ	­--mó¢G¶f÷&ÖD7&VF—G2†÷&FW"çG&–vvW%&–6R—Ö¶–b†÷&FW"çG—SÓÓÒwG&–Æ–æu÷7F÷r—&WGW&æ	í-­½íÝ]ÝS¢G´çVÖ&W"†÷&FW"çG&–Æ–æuW&6VçGÇÃ’çFôf—†VBƒ—ÒV·&WGW&â}	ýâ½Ý­2s·Ð¢gVæ7F–öâ7Fö6´÷&FW%F–ÖUvV%cS†÷&FW"—¶6öç7BFFSÖæWrFFR†÷&FW"æf–ÆÆVDGÇÆ÷&FW"æ6æ6VÆÆVDGÇÆ÷&FW"æ7&VFVDGÇÃ“·&WGW&âçVÖ&W"æ—4f–æ—FR†FFRævWEF–ÖR‚’“öFFRçFôÆö6ÆU7G&–ær‚w'RÕ%RrÇ¶F“¢s"ÖF–v—BrÆÖöçFƒ¢s"ÖF–v—BrÆ†÷W#¢s"ÖF–v—BrÆÖ–çWFS¢s"ÖF–v—BwÒ“¢~(	Bs·Ð¢gVæ7F–öâ7Fö6´÷&FW$Æ—7EvV%cS†—FVÔ–B—¶6öç7B&÷w3Ò‡7Fö6´W†6†ævUvV%cCƒòæ÷&FW'7ÇÅµÒ’æf–ÇFW"‡&÷sÓç&÷ræ—FVÔ–CÓÓÖ—FVÔ–B’ÇVæF–æs×&÷w2æf–ÇFW"‡&÷sÓç&÷rç7FGW3ÓÓÒwVæF–ærr’Ç6†÷vã×7Fö6´÷&FW%f–WuvV%cSÓÓÒv7F—fRs÷VæF–æs§&÷w3·&WGW&æÆF—b6Æ73Ò'7Fö6²Ö÷&FW"Ö†—7F÷'’×cS#ãÆF—b6Æ73Ò'7Fö6²Ö÷&FW"Öf–ÇFW"×cS#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’G·7Fö6´÷&FW%f–WuvV%cSÓÓÒv7F—fRsòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"FF×vV"×7Fö6²Ö÷&FW"×f–Wr×cSÒ&7F—fR#í		­
-		-	Ý
½	R+rG·VæF–æræÆVæwF‡ÓÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’G·7Fö6´÷&FW%f–WuvV%cSÓÓÒvÆÂsòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"FF×vV"×7Fö6²Ö÷&FW"×f–Wr×cSÒ&ÆÂ#í	-
	R+rG·&÷w2æÆVæwF‡ÓÂö'WGFöããÂöF—câG·6†÷vâæÆVæwFƒ÷6†÷vâæÖ†÷&FW#ÓæÆF—b6Æ73Ò'7Fö6²Ö÷&FW"×&÷r×cSG¶W62†÷&FW"ç7FGW2—Ò#ãÆF—cãÆ#âG¶W62‡7Fö6´÷&FW%G—TÆ&VÇ5vV%cS¶÷&FW"çG—U×ÇÆ÷&FW"çG—R—Ò+rG¶W62‡7Fö6´÷&FW$–çFVçDÆ&VÇ5vV%cS¶÷&FW"æ–çFVçE×ÇÆ÷&FW"æ–çFVçB—ÓÂö#ãÇ7ãâG´çVÖ&W"†÷&FW"çVçF—G—ÇÃ—Ò"â+r9rG´çVÖ&W"†÷&FW"æÆWfW&vWÇÃ—Ò+rG¶W62‡7Fö6´÷&FW%&–6UvV%cS†÷&FW"’—Ò+rG¶W62‡7Fö6´÷&FW%F–ÖUvV%cS†÷&FW"’—ÓÂ÷7ããÂöF—cãÆF—cãÇ7â6Æ73Ò'7Fö6²Ö÷&FW"×7FGW2×cS#âG¶W62‡7Fö6´÷&FW%7FGW4Æ&VÇ5vV%cS¶÷&FW"ç7FGW5×ÇÆ÷&FW"ç7FGW2—ÓÂ÷7ãâG¶÷&FW"ç7FGW3ÓÓÒwVæF–ærsöÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×vV"×7Fö6²Ö6æ6VÂ×cCƒÒ"G¶W62†÷&FW"æ–B—Ò#í	í
-	Í	]	Ý	
-
ÃÂö'WGFöãæ¢rwÓÂöF—câG¶÷&FW"æÖW76vSöÇ6ÖÆÃâG¶W62†÷&FW"æÖW76vR—ÓÂ÷6ÖÆÃæ¢rwÓÂöF—cæ’æ¦ö–â‚rr“¢sÆF—b6Æ73Ò'7Fö6²Ö6†'BÖV×G’×cC‚#í	}ý-í¢"Ý-íÂ}M]½RÝ]"ãÂöF—câwÓÂöF—cæ·Ð¢gVæ7F–öâ7Fö6´÷&FW%æVÅvV%cC‚†—FVÒ—¶6öç7B&÷w3Ò‡7Fö6´W†6†ævUvV%cCƒòæ÷&FW'7ÇÅµÒ’æf–ÇFW"‡&÷sÓç&÷ræ—FVÔ–CÓÓÖ—FVÒæ–B’ÇVæF–æs×&÷w2æf–ÇFW"‡&÷sÓç&÷rç7FGW3ÓÓÒwVæF–ærr’æÆVæwF‚ÇF'3ÖÆF—b6Æ73Ò'7Fö6²Ö÷&FW"ÖÖöFR×cS#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’G·7Fö6´÷&FW%f–WuvV%cSÓÓÒvæWrsòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"FF×vV"×7Fö6²Ö÷&FW"×f–Wr×cSÒ&æWr#í	Ý	í	-	
ò	}	
ý	-	­	Âö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’G·7Fö6´÷&FW%f–WuvV%cSÓÒvæWrsòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"FF×vV"×7Fö6²Ö÷&FW"×f–Wr×cSÒ&7F—fR#í	Í	í	‚	}	
ý	-	­	‚G·VæF–æsö+rG·VæF–æwÖ¢rwÓÂö'WGFöããÂöF—cæ¶–b‡7Fö6´÷&FW%f–WuvV%cSÓÒvæWrr—&WGW&æÆF—b6Æ73Ò'7Fö6²Ö÷&FW'2×cC‚"FFÖ÷&FW"×G—SÒ&Ö&¶WB#âG·F'7ÒG·7Fö6´÷&FW$Æ—7EvV%cS†—FVÒæ–B—ÓÂöF—cæ·&WGW&æÆF—b6Æ73Ò'7Fö6²Ö÷&FW'2×cC‚"FFÖ÷&FW"×G—SÒ&Ö&¶WB#âG·F'7ÓÆF—b6Æ73Ò'7Fö6²Ö÷&FW"×F'2×cC‚#ãÆ#í	ýÍ]-³Âö#ãÇ7ãí	ýí½Ýý]-ò]-]íÂÂMmR­í=M"}­½#Â÷7ããÂöF—cãÆF—b6Æ73Ò'7Fö6²Ö÷&FW"Öw&–B×cC‚#ãÆÆ&VÃí	íý]móÇ6VÆV7B6Æ73Ò&–çWB"FF×vV"×7Fö6²Ö÷&FW"Ö–çFVçB×cCƒãÆ÷F–öâfÇVSÒ&÷VåöÆöær#í	í-­½-Â½íÝ3Âö÷F–öããÆ÷F–öâfÇVSÒ&6Æ÷6UöÆöær#í	}­½-Â½íÝ3Âö÷F–öããÆ÷F–öâfÇVSÒ&÷Vå÷6†÷'B#í	í-­½-Âí#Âö÷F–öããÆ÷F–öâfÇVSÒ&6Æ÷6U÷6†÷'B#í	}­½-Âí#Âö÷F–öããÂ÷6VÆV7CãÂöÆ&VÃãÆÆ&VÃí
-óÇ6VÆV7B6Æ73Ò&–çWB"FF×vV"×7Fö6²Ö÷&FW"×G—R×cCƒãÆ÷F–öâfÇVSÒ&Ö&¶WB#í
½Ýí}ÝóÂö÷F–öããÆ÷F–öâfÇVSÒ&Æ–Ö—B#í	½Í-ÝóÂö÷F–öããÆ÷F–öâfÇVSÒ'7F÷öÆ÷72#í
-íòÝ½íÂö÷F–öããÆ÷F–öâfÇVSÒ'F¶U÷&öf—B#í
-]¢ÝýíM#Âö÷F–öããÆ÷F–öâfÇVSÒ'G&–Æ–æu÷7F÷#í
-]½Ý2Ý-íóÂö÷F–öããÂ÷6VÆV7CãÂöÆ&VÃãÆÆ&VÃí	­í½}]--ãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"ÖƒÒ#"fÇVSÒ#"FF×vV"×7Fö6²Ö÷&FW"×VçF—G’×cCƒãÂöÆ&VÃãÆÆ&VÂ6Æ73Ò'7Fö6²Öf–VÆB×G&–vvW"×cC’#í
m]Ý­--mƒÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#ã"7FWÒ#ã"FF×vV"×7Fö6²Ö÷&FW"×G&–vvW"×cCƒãÂöÆ&VÃãÆÆ&VÂ6Æ73Ò'7Fö6²Öf–VÆBÖÆ–Ö—B×cC’#í	½Í-Ýòm]ÝÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#ã"7FWÒ#ã"FF×vV"×7Fö6²Ö÷&FW"ÖÆ–Ö—B×cCƒãÂöÆ&VÃãÆÆ&VÂ6Æ73Ò'7Fö6²Öf–VÆB×G&–Æ–ær×cC’#í	í-­½íÝ]ÝRÂSÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ"ã"ÖƒÒ#S"7FWÒ"ã"fÇVSÒ#"FF×vV"×7Fö6²Ö÷&FW"×G&–Æ–ær×cCƒãÂöÆ&VÃãÆÆ&VÃí	ý½]}ãÇ6VÆV7B6Æ73Ò&–çWB"FF×vV"×7Fö6²Ö÷&FW"ÖÆWfW&vR×cCƒãÆ÷F–öâfÇVSÒ##ì9sÂö÷F–öããÆ÷F–öâfÇVSÒ#"#ì9s#Âö÷F–öããÆ÷F–öâfÇVSÒ#2#ì9s3Âö÷F–öããÂ÷6VÆV7CãÂöÆ&VÃãÆ'WGFöâ6Æ73Ò'&–Ö'’7Fö6²×7V&Ö—B×cC’"G—SÒ&'WGFöâ"FF×vV"×7Fö6²×7V&Ö—B×cCƒÒ"G¶W62†—FVÒæ–B—Ò#í
		}	Í	]

-	
-
ÃÂö'WGFöããÂöF—cãÂöF—cæ·Ð¢gVæ7F–öâ7Fö6´FÕæVÅvV%cC’†—FVÒ—¶6öç7B&öÆSÕ7G&–ær†7W'&VçEÆ–W"‚“òç&öÆWÇÂrr’çFôÆ÷vW$66R‚“¶–b‚²vvÒrÂvFÒrÂvÖ7FW"uÒæ–æ6ÇVFW2‡&öÆR’—&WGW&ârs·&WGW&æÆF—b6Æ73Ò'7Fö6²ÖFÒ×cC’#ãÆF—b6Æ73Ò'7Fö6²Ö÷&FW"×F'2×cC‚#ãÆ#í
=ý-½]ÝR	M	ÍÂö#ãÇ7ãí	Íý=½Íý-íM"m]Ý2¢=­}ÝÝíÍ2}Í]Ý]Ýâ}-]Âí¢â	Ýí-½’Íý=½Í}Í]Ýý]"ý]M½M=’ãÂ÷7ããÂöF—cãÆF—b6Æ73Ò'7Fö6²ÖFÒÖw&–B×cC’#ãÆÆ&VÃí
-í}Ýòm]ÝÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ"ã"7FWÒ"ã"Æ6V†öÆFW#Ò-	]r}Í]Ý]Ýò"FF×vV"×7Fö6²ÖFÒ×&–6R×cC“ãÂöÆ&VÃãÆÆ&VÃí	}Í]Ý]ÝR}í¢ÂSÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ"ÓS"ÖƒÒ#S"7FWÒ"ã"fÇVSÒ#R"FF×vV"×7Fö6²ÖFÒ×W&6VçB×cC“ãÂöÆ&VÃãÆÆ&VÃí	M½-]½ÍÝí-ÂÂ]­=ÝCÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"ÖƒÒ#3c"7FWÒ#"fÇVSÒ#c"FF×vV"×7Fö6²ÖFÒÖGW&F–öâ×cC“ãÂöÆ&VÃãÆ'WGFöâ6Æ73Ò'6V6öæF'’"FF×vV"×7Fö6²Ö–×VÇ6R×cC“Ò"G¶W62†—FVÒæ–B—Ò#í	ý
		Í	]	Ý	
-
ÃÂö'WGFöããÂöF—cãÆF—b6Æ73Ò'7Fö6²ÖFÒ×&W6WG2×cC’#âGµ²ÓÂÓRÃRÃÒæÖ‡cÓæÆ'WGFöâ6Æ73Ò'6V6öæF'’"FF×vV"×7Fö6²×&W6WB×cC“Ò"G·gÒ#âG·cãòr²s¢rwÒG·gÒSÂö'WGFöãæ’æ¦ö–â‚rr—ÓÂöF—cãÂöF—cæ·Ð¢gVæ7F–öâ7Fö6µF–6¶W%vV%csB†—FVÓ×·Ò—·&WGW&âÖ&¶WDVæv–æUcsç7Fö6µF–6¶W"†—FVÒ—ÇÂ~(	Bs·Ð¢gVæ7F–öâ7Fö6µG•vV%csB‡÷6—F–öã×·Ò—·&WGW&âÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâæ¶æ÷våG—ÇÃ’’´ÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâçVç&–6VEG—ÇÃ’“·Ð¢gVæ7F–öâ7Fö6´6†ævT6Æ75vV%csB‡fÇVR—·&WGW&âçVÖ&W"‡fÇVWÇÃ“ãòwWs¤çVÖ&W"‡fÇVWÇÃ“ÃòvF÷vâs¢vfÆBs·Ð¢gVæ7F–öâ6–væVD7&VF—G5vV%csB‡fÇVR—¶6öç7BÖ÷VçCÔçVÖ&W"‡fÇVWÇÃ“·&WGW&æG¶Ö÷VçCãòr²s¢rwÒG¶f÷&ÖD7&VF—G2†Ö÷VçB—Ö·Ð¢gVæ7F–öâæ÷&ÖÆ—¦U7Fö6µ÷6—F–öåvV%csB†—FVÔ–BÇfÇVS×·Ò—¶6öç7B6÷7D&6—3ÔÖF‚æÖ‚ƒÄçVÖ&W"‡fÇVRæ6÷7D&6—7ÇÃ’“·&WGW&ç¶—FVÔ–C¥7G&–ær†—FVÔ–GÇÇfÇVRæ—FVÔ–GÇÂrr’Æ¶æ÷våG“¤ÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"‡fÇVRæ¶æ÷våG“ó÷fÇVRçVçF—G“óó—ÇÃ’’ÇVç&–6VEG“¤ÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"‡fÇVRçVç&–6VEG—ÇÃ—ÇÃ’’Æ6÷7D&6—2ÆÖ&v–ã¤ÖF‚æÖ‚ƒÄçVÖ&W"‡fÇVRæÖ&v–ãóö6÷7D&6—2—ÇÃ’ÆÆWfW&vS¤ÖF‚æÖ‚ƒÄçVÖ&W"‡fÇVRæÆWfW&vWÇÃ—ÇÃ—Ó·Ð¢gVæ7F–öâæ÷&ÖÆ—¦U7Fö6µ6†÷'EvV%cS†—FVÔ–BÇfÇVS×·Ò—¶6öç7B6÷7D&6—3ÔÖF‚æÖ‚ƒÄçVÖ&W"‡fÇVRæ6÷7D&6—7ÇÃ’“·&WGW&ç¶—FVÔ–C¥7G&–ær†—FVÔ–GÇÇfÇVRæ—FVÔ–GÇÂrr’ÇVçF—G“¤ÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"‡fÇVRçVçF—G—ÇÃ—ÇÃ’’Æ6÷7D&6—2ÆÖ&v–ã¤ÖF‚æÖ‚ƒÄçVÖ&W"‡fÇVRæÖ&v–ãóö6÷7D&6—2—ÇÃ’ÆÆWfW&vS¤ÖF‚æÖ‚ƒÄçVÖ&W"‡fÇVRæÆWfW&vWÇÃ—ÇÃ—Ó·Ð¢gVæ7F–öâæ÷&ÖÆ—¦U7Fö6µ÷'FföÆ–õvV%csB‡6÷W&6S×·Ò—°¢6öç7B&s×6÷W&6Rç7Fö6µ÷'FföÆ–òbgG—Vöb6÷W&6Rç7Fö6µ÷'FföÆ–óÓÓÒvö&¦V7Brbb'&’æ—4'&’‡6÷W&6Rç7Fö6µ÷'FföÆ–ò“öFVW‡6÷W&6Rç7Fö6µ÷'FföÆ–ò“§·ÒÇ÷6—F–öç3×·ÒÇ6†÷'E÷6—F–öç3×·Ó°¢–b„'&’æ—4'&’‡&rç÷6—F–öç2’—&rç÷6—F–öç2æf÷$V6‚‡&÷sÓç¶–b‡&÷sòæ—FVÔ–B—÷6—F–öç5µ7G&–ær‡&÷ræ—FVÔ–B•ÓÖæ÷&ÖÆ—¦U7Fö6µ÷6—F–öåvV%csB‡&÷ræ—FVÔ–BÇ&÷r“·Ò“°¢VÇ6Rö&¦V7BæVçG&–W2‡&rç÷6—F–öç7ÇÇ·Ò’æf÷$V6‚‚…¶—FVÔ–BÇ&÷uÒ“Óç·÷6—F–öç5¶—FVÔ–EÓÖæ÷&ÖÆ—¦U7Fö6µ÷6—F–öåvV%csB†—FVÔ–BÇ&÷r“·Ò“°¢–b„'&’æ—4'&’‡&rç6†÷'E÷6—F–öç2’—&rç6†÷'E÷6—F–öç2æf÷$V6‚‡&÷sÓç¶–b‡&÷sòæ—FVÔ–B—6†÷'E÷6—F–öç5µ7G&–ær‡&÷ræ—FVÔ–B•ÓÖæ÷&ÖÆ—¦U7Fö6µ6†÷'EvV%cS‡&÷ræ—FVÔ–BÇ&÷r“·Ò“°¢VÇ6Rö&¦V7BæVçG&–W2‡&rç6†÷'E÷6—F–öç7ÇÇ·Ò’æf÷$V6‚‚…¶—FVÔ–BÇ&÷uÒ“Óç·6†÷'E÷6—F–öç5¶—FVÔ–EÓÖæ÷&ÖÆ—¦U7Fö6µ6†÷'EvV%cS†—FVÔ–BÇ&÷r“·Ò“°¢6öç7BÖ–w&FVC×&ræÆVv7”–çfVçF÷'”Ö–w&FVBbgG—Vöb&ræÆVv7”–çfVçF÷'”Ö–w&FVCÓÓÒvö&¦V7Brbb'&’æ—4'&’‡&ræÆVv7”–çfVçF÷'”Ö–w&FVB“÷²ââç&ræÆVv7”–çfVçF÷'”Ö–w&FVGÓ§·ÒÆ–çfVçF÷'“ÕµÓ°¢„'&’æ—4'&’‡6÷W&6Ræ–çfVçF÷'’“÷6÷W&6Ræ–çfVçF÷'“¥µÒ’æf÷$V6‚†VçG'“Óç¶6öç7B—FVÔ–CÕ7G&–ær†VçG'“òæ—FVÔ–GÇÂrr’Æ—FVÓÔæFFæ—FV×2ævWB†—FVÔ–B“¶–b‚—FV×ÇÂÖ&¶WDVæv–æUcsæ—57Fö6²†—FVÒ’—¶–çfVçF÷'’çW6‚†VçG'’“·&WGW&ã·Ö6öç7BG“ÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†VçG'’çG—ÇÃ—ÇÃ’’Æ66÷VçFVCÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†Ö–w&FVE¶—FVÔ–E×ÇÃ—ÇÃ’’ÆFVÇFÔÖF‚æÖ‚ƒÇG’Ö66÷VçFVB’Ç÷6—F–öã×÷6—F–öç5¶—FVÔ–E×ÇÆæ÷&ÖÆ—¦U7Fö6µ÷6—F–öåvV%csB†—FVÔ–B“·÷6—F–öâçVç&–6VEG’³ÖFVÇF·÷6—F–öç5¶—FVÔ–EÓ×÷6—F–öã¶Ö–w&FVE¶—FVÔ–EÓÔÖF‚æÖ‚†66÷VçFVBÇG’“·Ò“°¢&WGW&ç·÷6—F–öç2Ç6†÷'E÷6—F–öç2ÆÆVFvW#¤'&’æ—4'&’‡&ræÆVFvW"“÷&ræÆVFvW"ç6Æ–6R‚ÓS“¥µÒÆÆVv7”–çfVçF÷'”Ö–w&FVC¦Ö–w&FVBÆ–çfVçF÷'—Ó°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦U7Fö6µÆ–W%vV%csB‡Æ–W#×·Ò—¶6öç7B÷'FföÆ–óÖæ÷&ÖÆ—¦U7Fö6µ÷'FföÆ–õvV%csB‡Æ–W"“·Æ–W"ç7Fö6µ÷'FföÆ–ó×·÷6—F–öç3§÷'FföÆ–òç÷6—F–öç2Ç6†÷'E÷6—F–öç3§÷'FföÆ–òç6†÷'E÷6—F–öç2ÆÆVFvW#§÷'FföÆ–òæÆVFvW"ÆÆVv7”–çfVçF÷'”Ö–w&FVC§÷'FföÆ–òæÆVv7”–çfVçF÷'”Ö–w&FVGÓ·Æ–W"æ–çfVçF÷'“×÷'FföÆ–òæ–çfVçF÷'“·&WGW&âÆ–W#·Ð¢6öç7B6ö×–ÆTFF&Vf÷&U7Fö6·5vV%csCÖ6ö×–ÆTFF°¢6ö×–ÆTFFÖgVæ7F–öâ‚ââæ&w2—¶6öç7B&W7VÇCÖ6ö×–ÆTFF&Vf÷&U7Fö6·5vV%csB‚ââæ&w2“´æFFçÆ–W'2æf÷$V6‚†æ÷&ÖÆ—¦U7Fö6µÆ–W%vV%csB“·&WGW&â&W7VÇC·Ó° ¢gVæ7F–öâ7Fö6µ÷'FföÆ–õ7FG5vV%csB‡Æ–W"Ç&÷FF–öâ—°¢æ÷&ÖÆ—¦U7Fö6µÆ–W%vV%csB‡Æ–W"“¶6öç7B÷'FföÆ–ó×Æ–W"ç7Fö6µ÷'FföÆ–òÇV÷FW3ÖæWrÖ‚‡&÷FF–öâçV÷FW7ÇÅµÒ’æÖ‡&÷sÓå·&÷ræ—FVÔ–BÇ&÷uÒ’“¶ÆWBÖ&¶WEfÇVSÓÆ–çfW7FVCÓÇVç&VÆ—¦VCÓÇVç&–6VEG“ÓÆW‡Vç6W3ÓÆ–æ6öÖSÓÇ&VÆ—¦VCÓ°¢ö&¦V7BçfÇVW2‡÷'FföÆ–òç÷6—F–öç7ÇÇ·Ò’æf÷$V6‚‡÷6—F–öãÓç¶6öç7BV÷FS×V÷FW2ævWB‡÷6—F–öâæ—FVÔ–B’ÇG“×7Fö6µG•vV%csB‡÷6—F–öâ’Æ¶æ÷vãÔÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâæ¶æ÷våG—ÇÃ’’Æ&6—3ÔÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâæ6÷7D&6—7ÇÃ’’ÆÖ&v–ãÔÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâæÖ&v–ãóö&6—2’“¶–çfW7FVB³ÖÖ&v–ã·Vç&–6VEG’³ÔÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâçVç&–6VEG—ÇÃ’“¶–b‡V÷FR—¶Ö&¶WEfÇVR³×G’§V÷FRç&–6S·Vç&VÆ—¦VB³Ö¶æ÷vâ§V÷FRç&–6RÖ&6—3·×Ò“°¢ö&¦V7BçfÇVW2‡÷'FföÆ–òç6†÷'E÷6—F–öç7ÇÇ·Ò’æf÷$V6‚‡÷6—F–öãÓç¶6öç7BV÷FS×V÷FW2ævWB‡÷6—F–öâæ—FVÔ–B’ÇG“ÔÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâçVçF—G—ÇÃ’’Æ&6—3ÔÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâæ6÷7D&6—7ÇÃ’’ÆÖ&v–ãÔÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâæÖ&v–ãóö&6—2’’ÆfW&vS×G“ö&6—2÷G“£¶–çfW7FVB³ÖÖ&v–ã¶–b‡V÷FR—¶6öç7BWV—G“ÔÖF‚æÖ‚ƒÆÖ&v–â²†fW&vR×V÷FRç&–6R’§G’“¶Ö&¶WEfÇVR³ÖWV—G“·Vç&VÆ—¦VB³Ò†fW&vR×V÷FRç&–6R’§G“·×Ò“°¢‡÷'FföÆ–òæÆVFvW'ÇÅµÒ’æf÷$V6‚‡&÷sÓç¶–b…²v'W’rÂv÷VåöÆöærrÂv÷Vå÷6†÷'BuÒæ–æ6ÇVFW2‡&÷rçG—R’–W‡Vç6W2³ÔÖF‚æ'2„çVÖ&W"‡&÷ræ66„fÆ÷só÷&÷ræÖ&v–ãó÷&÷rçF÷FÂ—ÇÃ“¶–b…²w6VÆÂrÂv6Æ÷6UöÆöærrÂv6Æ÷6U÷6†÷'BuÒæ–æ6ÇVFW2‡&÷rçG—R’—¶–æ6öÖR³ÔÖF‚æÖ‚ƒÄçVÖ&W"‡&÷ræ66„fÆ÷só÷&÷rçF÷FÂ—ÇÃ“¶–b„çVÖ&W"æ—4f–æ—FR„çVÖ&W"‡&÷rç&VÆ—¦VEæÂ’’—&VÆ—¦VB³ÔçVÖ&W"‡&÷rç&VÆ—¦VEæÂ“·Ö–b…²vÆ—V–FF–öåöÆöærrÂvÆ—V–FF–öå÷6†÷'BuÒæ–æ6ÇVFW2‡&÷rçG—R’—&VÆ—¦VB³ÔçVÖ&W"‡&÷rç&VÆ—¦VEæÇÇÃ“·Ò“°¢&WGW&ç·÷'FföÆ–òÇV÷FW2ÆÖ&¶WEfÇVRÆ–çfW7FVBÇVç&VÆ—¦VBÇVç&–6VEG’ÆW‡Vç6W2Æ–æ6öÖRÇ&VÆ—¦VBÇF÷FÅ&W7VÇC§&VÆ—¦VB·Vç&VÆ—¦VGÓ°¢Ð¢gVæ7F–öâ7Fö6µ7&¶Æ–æUvV%csB††—7F÷'“ÕµÒ—°¢–b††—7F÷'’æÆVæwFƒÃ"—&WGW&ârs¶6öç7BfÇVW3Ö†—7F÷'’æÖ‡&÷sÓäçVÖ&W"‡&÷rç&–6WÇÃ’’ÆÖ–ãÔÖF‚æÖ–â‚ââçfÇVW2’ÆÖƒÔÖF‚æÖ‚‚ââçfÇVW2’Ç7ãÔÖF‚æÖ‚ƒÆÖ‚ÖÖ–â’Çv–GFƒÓC#Æ†V–v‡CÓÇCÓ‚Çö–çG3Ö†—7F÷'’æÖ‚‡&÷rÆ–æFW‚“ÓæG·B²†–æFW‚ò††—7F÷'’æÆVæwF‚Ó’’¢‡v–GF‚×B£"—ÒÂG¶†V–v‡B×BÒ‚„çVÖ&W"‡&÷rç&–6WÇÃ’ÖÖ–â’÷7â’¢††V–v‡B×B£"—Ö’æ¦ö–â‚rr’ÆÆ7CÖ†—7F÷'•¶†—7F÷'’æÆVæwF‚ÓÓ°¢&WGW&æÆF—b6Æ73Ò'7Fö6²Ö6†'B×csBG·7Fö6´6†ævT6Æ75vV%csB‡fÇVW5·fÇVW2æÆVæwF‚ÓÒ×fÇVW5³Ò—Ò#ãÇ7frf–Wt&÷ƒÒ#G·v–GF‡ÒG¶†V–v‡GÒ"&öÆSÒ&–Ör"&–ÖÆ&VÃÒ-	-íòm]Ý²}3=í-½RMÝ]’#ãÇöÇ–Æ–æRö–çG3Ò"G·ö–çG7Ò"óãÂ÷7fsãÆF—cãÇ7ãâG¶W62†f÷&ÖDFFR††—7F÷'•³ÓòæF’’—ÓÂ÷7ããÆ#âG¶f÷&ÖD7&VF—G2†Ö–â—Ò(	BG¶f÷&ÖD7&VF—G2†Ö‚—ÓÂö#ãÇ7ãâG¶W62†f÷&ÖDFFR†Æ7CòæF’’—ÓÂ÷7ããÂöF—cãÂöF—cæ°¢Ð¢gVæ7F–öâ7Fö6µ&VÆFVD'F–6ÆW5vV%csB†—FVÓ×·Ò—¶6öç7BÆ–W#Ö7W'&VçEÆ–W"‚’Ç&÷w3Ò„'&’æ—4'&’†—FVÒç&VÆFVD'F–6ÆT–G2“ö—FVÒç&VÆFVD'F–6ÆT–G3¥µÒ’æÖ†–CÓäæFFæ'F–6ÆW2ævWB…7G&–ær†–B’’’æf–ÇFW"†'F–6ÆSÓæ'F–6ÆRbgf—6–&ÆTf÷%Æ–W"†'F–6ÆRÇÆ–W#òæ–B’“¶–b‚&÷w2æÆVæwF‚—&WGW&ârs·&WGW&æÆF—b6Æ73Ò'7Fö6²×&VÆFVB×csB#ãÆ#í
-ý}ÝÝ½RÍ-]½³Âö#ãÆF—câG·&÷w2æÖ†'F–6ÆSÓæÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖ7F–öãÒ&÷VâÖ'F–6ÆR"FFÖ'F–6ÆRÖ–CÒ"G¶W62†'F–6ÆRæ–B—Ò#âG¶W62†'F–6ÆRææÖWÇÆ'F–6ÆRçF—FÆWÇÆ'F–6ÆRæ–B—ÓÂö'WGFöãæ’æ¦ö–â‚rr—ÓÂöF—cãÂöF—cæ·Ð¢gVæ7F–öâ7Fö6´öffW%F–ÆUvV%csB†öffW"—¶6öç7B—FVÓÔæFFæ—FV×2ævWB†öffW"æ—FVÔ–B“¶–b‚—FVÒ—&WGW&ârs·&WGW&æÆ'WGFöâ6Æ73Ò'7Fö6²×V÷FR×F–ÆR×csBG·7Fö6µ6VÆV7F–öåvV%csCòç6÷W&6SÓÓÒvÖ&¶WBrbg7Fö6µ6VÆV7F–öåvV%csBæ—FVÔ–CÓÓÖ—FVÒæ–Còw6VÆV7FVBs¢rwÒG·7Fö6´6†ævT6Æ75vV%csB†öffW"æ6†ævR—Ò"G—SÒ&'WGFöâ"G&vv&ÆSÒ'G'VR"FF×vV"×7Fö6²×csBFF×6÷W&6SÒ&Ö&¶WB"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò#ãÇ7ãâG¶W62‡7Fö6µF–6¶W%vV%csB†—FVÒ’—ÓÂ÷7ããÆ#âG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂö#ãÇ7G&öæsâG¶f÷&ÖD7&VF—G2†öffW"ç&–6R—ÓÂ÷7G&öæsãÇ6ÖÆÃâG¶öffW"æ6†ævSãÓò~)k"s¢~)kÂwÒG´ÖF‚æ'2„çVÖ&W"†öffW"æ6†ævUW&6VçGÇÃ’’çFôf—†VBƒ"—ÒR+rG·6–væVD7&VF—G5vV%csB†öffW"æ6†ævR—ÓÂ÷6ÖÆÃãÂö'WGFöãæ·Ð¢6öç7B7Fö6´ÆVFvW$Æ&VÇ5vV%cS×¶'W“¢}	ý	í	­
=	ý	­	rÇ6VÆÃ¢}	ý
	í	M		m	rÆ÷VåöÆöæs¢}	½	í	Ý	2rÆ6Æ÷6UöÆöæs¢}	}		­

½
-		R	½	í	Ý	=	rÆ÷Vå÷6†÷'C¢}
	í

"rÆ6Æ÷6U÷6†÷'C¢}	}		­

½
-		R
	í

-	rÆÆ—V–FF–öåöÆöæs¢}	½		­	-		M	
m	
ò	½	í	Ý	=	rÆÆ—V–FF–öå÷6†÷'C¢}	½		­	-		M	
m	
ò
	í

-	wÓ°¢gVæ7F–öâ7Fö6´ÆVFvW%F–ÖUvV%cS‡&÷r—¶6öç7BFFSÖæWrFFR‡&÷ræ7&VFVDGÇÇ&÷ræÖ&¶WDF—ÇÃ“·&WGW&âçVÖ&W"æ—4f–æ—FR†FFRævWEF–ÖR‚’“öFFRçFôÆö6ÆU7G&–ær‚w'RÕ%RrÇ¶F“¢s"ÖF–v—BrÆÖöçFƒ¢s"ÖF–v—BrÇ–V#¢s"ÖF–v—BrÆ†÷W#¢s"ÖF–v—BrÆÖ–çWFS¢s"ÖF–v—BwÒ“¥7G&–ær‡&÷ræÖ&¶WDF—ÇÂ~(	Br“·Ð¢gVæ7F–öâ7Fö6´ÆVFvW%&÷uvV%cS‡&÷r—¶6öç7B—FVÓÔæFFæ—FV×2ævWB‡&÷ræ—FVÔ–B—ÇÇ¶–C§&÷ræ—FVÔ–GÒÆ6Æ÷6SÕ²w6VÆÂrÂv6Æ÷6UöÆöærrÂv6Æ÷6U÷6†÷'BrÂvÆ—V–FF–öåöÆöærrÂvÆ—V–FF–öå÷6†÷'BuÒæ–æ6ÇVFW2‡&÷rçG—R’ÇæÃÔçVÖ&W"‡&÷rç&VÆ—¦VEæÂ’Æ†5æÃÖ6Æ÷6RbdçVÖ&W"æ—4f–æ—FR‡æÂ’Æ66ƒÔçVÖ&W"‡&÷ræ66„fÆ÷sóò‡&÷rçG—SÓÓÒv'W’sòÔçVÖ&W"‡&÷rçF÷FÇÇÃ“§&÷rçF÷FÇÇÃ’“·&WGW&æÆF—b6Æ73Ò'÷'FföÆ–òÖÆVFvW"×&÷r×csB#ãÆF—b6Æ73Ò'÷'FföÆ–òÖÆVFvW"ÖÖ–â×cS#ãÇ7â6Æ73Ò"G¶6Æ÷6SòwWs¢vF÷vâwÒ#âG¶W62‡7Fö6´ÆVFvW$Æ&VÇ5vV%cS·&÷rçG—U×ÇÅ7G&–ær‡&÷rçG—WÇÂ}	í	ý	]
	
m	
òr’çFõWW$66R‚’—ÓÂ÷7ããÆ#âG¶W62‡7Fö6µF–6¶W%vV%csB†—FVÒ’—ÓÂö#ãÇF–ÖSâG¶W62‡7Fö6´ÆVFvW%F–ÖUvV%cS‡&÷r’—ÓÂ÷F–ÖSãÂöF—cãÆF—b6Æ73Ò'÷'FföÆ–òÖÆVFvW"ÖÖWG&–72×cS#ãÇ7ãí	­í½}]--âÆ#âG´çVÖ&W"‡&÷rçVçF—G—ÇÃ—Ò"ãÂö#ãÂ÷7ããÇ7ãí
m]ÝÆ#âG¶f÷&ÖD7&VF—G2‡&÷rçVæ—E&–6WÇÃ—ÓÂö#ãÂ÷7ããÇ7ãí
=ÍÍÆ#âG¶f÷&ÖD7&VF—G2‡&÷rçF÷FÇÇÃ—ÓÂö#ãÂ÷7ããÇ7ãí	ý½]}âÆ#ì9rG´çVÖ&W"‡&÷ræÆWfW&vWÇÃ—ÓÂö#ãÂ÷7ãâG´çVÖ&W"‡&÷ræÖ&v–çÇÃ“ãöÇ7ãí	í]ý]}]ÝRÆ#âG¶f÷&ÖD7&VF—G2‡&÷ræÖ&v–â—ÓÂö#ãÂ÷7ãæ¢rwÓÇ7ãí	½ÝÆ"6Æ73Ò"G·7Fö6´6†ævT6Æ75vV%csB†66‚—Ò#âG·6–væVD7&VF—G5vV%csB†66‚—ÓÂö#ãÂ÷7ãâG¶†5æÃöÇ7ãí
]}=½Í-"Æ"6Æ73Ò"G·7Fö6´6†ævT6Æ75vV%csB‡æÂ—Ò#âG·6–væVD7&VF—G5vV%csB‡æÂ—ÓÂö#ãÂ÷7ãæ¢rwÓÂöF—cãÂöF—cæ·Ð¢gVæ7F–öâ7Fö6µ÷'FföÆ–ôÖ&·WvV%csB‡Æ–W"Ç&÷FF–öâ—°¢6öç7B7FG3×7Fö6µ÷'FföÆ–õ7FG5vV%csB‡Æ–W"Ç&÷FF–öâ’ÆÆöæw3Ôö&¦V7BçfÇVW2‡7FG2ç÷'FföÆ–òç÷6—F–öç7ÇÇ·Ò’æf–ÇFW"‡&÷sÓç7Fö6µG•vV%csB‡&÷r“ã’Ç6†÷'G3Ôö&¦V7BçfÇVW2‡7FG2ç÷'FföÆ–òç6†÷'E÷6—F–öç7ÇÇ·Ò’æf–ÇFW"‡&÷sÓäçVÖ&W"‡&÷rçVçF—G—ÇÃ“ã’Ç÷6—F–öç3Õ²ââæÆöæw2æÖ‡&÷sÓâ‡²ââç&÷rÇ6–FS¢vÆöærwÒ’’Âââç6†÷'G2æÖ‡&÷sÓâ‡²ââç&÷rÇ6–FS¢w6†÷'BwÒ’•Òç6÷'B‚†Æ"“Óç7Fö6µF–6¶W%vV%csB„æFFæ—FV×2ævWB†æ—FVÔ–B’’æÆö6ÆT6ö×&R‡7Fö6µF–6¶W%vV%csB„æFFæ—FV×2ævWB†"æ—FVÔ–B’’Âw'Rr’“°¢6öç7B†öÆF–æw3×÷6—F–öç2æÖ‡÷6—F–öãÓç¶6öç7B—FVÓÔæFFæ—FV×2ævWB‡÷6—F–öâæ—FVÔ–B—ÇÇ¶–C§÷6—F–öâæ—FVÔ–BÆæÖS§÷6—F–öâæ—FVÔ–GÒÇV÷FS×7FG2çV÷FW2ævWB‡÷6—F–öâæ—FVÔ–B’ÇG“×÷6—F–öâç6–FSÓÓÒw6†÷'BsôçVÖ&W"‡÷6—F–öâçVçF—G—ÇÃ“§7Fö6µG•vV%csB‡÷6—F–öâ’Æ¶æ÷vã×÷6—F–öâç6–FSÓÓÒw6†÷'Bs÷G“¤çVÖ&W"‡÷6—F–öâæ¶æ÷våG—ÇÃ’ÆfW&vSÖ¶æ÷vããôçVÖ&W"‡÷6—F–öâæ6÷7D&6—7ÇÃ’ö¶æ÷vã¦çVÆÂÆFVÇF×V÷FRbffW&vRÖçVÆÃò‡÷6—F–öâç6–FSÓÓÒw6†÷'BsöfW&vR×V÷FRç&–6S§V÷FRç&–6RÖfW&vR“£ÇW&6VçCÖfW&vSãöFVÇFöfW&vR££ÆWV—G“×V÷FSò‡÷6—F–öâç6–FSÓÓÒw6†÷'BsôÖF‚æÖ‚ƒÄçVÖ&W"‡÷6—F–öâæÖ&v–çÇÃ’¶FVÇF§G’“§G’§V÷FRç&–6R“£ÇWÖFVÇFãÓ·&WGW&æÆ'WGFöâ6Æ73Ò'7Fö6²Ö†öÆF–ær×csBG·7Fö6µ6VÆV7F–öåvV%csCòç6÷W&6SÓÓÒw÷'FföÆ–òrbg7Fö6µ6VÆV7F–öåvV%csBæ—FVÔ–CÓÓ×÷6—F–öâæ—FVÔ–Còw6VÆV7FVBs¢rwÒ"G—SÒ&'WGFöâ"G&vv&ÆSÒ'G'VR"FF×vV"×7Fö6²×csBFF×6÷W&6SÒ'÷'FföÆ–ò"FFÖ—FVÒÖ–CÒ"G¶W62‡÷6—F–öâæ—FVÔ–B—Ò#ãÇ7â6Æ73Ò'7Fö6²Ö†öÆF–ær×7–Ö&öÂ×csB#âG¶W62‡7Fö6µF–6¶W%vV%csB†—FVÒ’—ÓÂ÷7ããÇ7ããÆ#âG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÒG·÷6—F–öâç6–FSÓÓÒw6†÷'Bsòr+r
	í

"s¢rwÓÂö#ãÇ6ÖÆÃâG·G—Ò"âG¶fW&vSÓÖçVÆÃòr+r]r-í‚ýí­=ý­‚s¦+r-]íBG¶f÷&ÖD7&VF—G2†fW&vR—Ò+r9rG´çVÖ&W"‡÷6—F–öâæÆWfW&vWÇÃ—ÖÓÂ÷6ÖÆÃãÂ÷7ããÇ7ããÆ#âG·V÷FSöf÷&ÖD7&VF—G2†WV—G’“¢}	Ý]"­í-í-­‚wÓÂö#âG·V÷FRbffW&vRÖçVÆÃöÇ6ÖÆÂ6Æ73Ò"G·7Fö6´6†ævT6Æ75vV%csB†FVÇF—Ò#âG·Wò~)k"s¢~)kÂwÒG´ÖF‚æ'2‡W&6VçB’çFôf—†VBƒ"—ÒRí"m]Ý²-]íMÂ÷6ÖÆÃæ¢rwÓÂ÷7ããÂö'WGFöãæ·Ò’æ¦ö–â‚rr’ÆÆVFvW#Ò‡7FG2ç÷'FföÆ–òæÆVFvW'ÇÅµÒ’ç6Æ–6R‚Ó’ç&WfW'6R‚“°¢&WGW&æÆF—b6Æ73Ò'÷'FföÆ–ò×6†VÆÂ×csB"FF×vV"×7Fö6²×÷'FföÆ–òÖG&÷×csCãÆF—b6Æ73Ò'÷'FföÆ–òÖ†VB×csB#ãÆF—cãÇ7â6Æ73Ò&W–V'&÷r#í	½	
}	Ý
½	’

}
#Â÷7ããÆ#í	ýí-M]½ÃÂö#ãÂöF—cãÇ7G&öæsâG¶f÷&ÖD7&VF—G2‡7FG2æÖ&¶WEfÇVR—ÓÂ÷7G&öæsãÂöF—cãÆF—b6Æ73Ò'÷'FföÆ–òÖÖWG&–72×csB#ãÆF—cãÇ7ãí
-íÍí-Âýí-M]½óÂ÷7ããÆ#âG¶f÷&ÖD7&VF—G2‡7FG2æÖ&¶WEfÇVR—ÓÂö#ãÂöF—cãÆF—cãÇ7ãí	í]ý]}]ÝSÂ÷7ããÆ#âG¶f÷&ÖD7&VF—G2‡7FG2æ–çfW7FVB—ÓÂö#ãÂöF—cãÆF—cãÇ7ãí	-í}-]Ýâý‚}­½-ƒÂ÷7ããÆ#âG¶f÷&ÖD7&VF—G2‡7FG2æ–æ6öÖR—ÓÂö#ãÂöF—cãÆF—cãÇ7ãí	-Ý]]Ýâ"ýí}mƒÂ÷7ããÆ#âG¶f÷&ÖD7&VF—G2‡7FG2æW‡Vç6W2—ÓÂö#ãÂöF—cãÆF—b6Æ73Ò"G·7Fö6´6†ævT6Æ75vV%csB‡7FG2çVç&VÆ—¦VB—Ò#ãÇ7ãí	Ý]]½}í-ÝÝ½’]}=½Í-#Â÷7ããÆ#âG·6–væVD7&VF—G5vV%csB‡7FG2çVç&VÆ—¦VB—ÓÂö#ãÂöF—cãÆF—b6Æ73Ò"G·7Fö6´6†ævT6Æ75vV%csB‡7FG2ç&VÆ—¦VB—Ò#ãÇ7ãí	}M­í-ÝÝ½’]}=½Í-#Â÷7ããÆ#âG·6–væVD7&VF—G5vV%csB‡7FG2ç&VÆ—¦VB—ÓÂö#ãÂöF—cãÆF—b6Æ73Ò'÷'FföÆ–ò×&W7VÇB×csBG·7Fö6´6†ævT6Æ75vV%csB‡7FG2çF÷FÅ&W7VÇB—Ò#ãÇ7ãí	í’]}=½Í-#Â÷7ããÆ#âG·6–væVD7&VF—G5vV%csB‡7FG2çF÷FÅ&W7VÇB—ÓÂö#ãÂöF—cãÂöF—câG·7FG2çVç&–6VEG“öÆF—b6Æ73Ò'÷'FföÆ–òÖÆVv7’Öæ÷FR×csB#âG·7FG2çVç&–6VEG—Ò­bâý]]Ý]]Ýâr-í=âÝ-]Ý-ò]rm]Ý²ýí]-]Ýò‚ÝR=}--=]""}-Rý½½‚ãÂöF—cæ¢rwÓÆF—b6Æ73Ò'÷'FföÆ–òÖ†öÆF–æw2×csB#âG¶†öÆF–æw7ÇÂsÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖV×G’×cs#í	ýí-M]½Âý="ãÂöF—câwÓÂöF—cãÆF—b6Æ73Ò'÷'FföÆ–òÖÆVFvW"×csB#ãÆF—b6Æ73Ò'÷'FföÆ–òÖÆVFvW"Ö†VB×csB#ãÆ#í	ýí½]MÝRíý]mƒÂö#ãÇ7ãâG¶ÆVFvW"æÆVæwF‡ÓÂ÷7ããÂöF—câG¶ÆVFvW"æÖ‡7Fö6´ÆVFvW%&÷uvV%cS’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	íý]m’]Ý]"ãÂöF—câwÓÂöF—cãÂöF—cæ°¢Ð¢gVæ7F–öâ7Fö6µ6VÆV7F–öäÖ&·WvV%csB‡Æ–W"ÇÆæWBÇ&÷FF–öâ—°¢6öç7B—FVÓ×7Fö6µ6VÆV7F–öåvV%csCòæ—FVÔ–CôæFFæ—FV×2ævWB‡7Fö6µ6VÆV7F–öåvV%csBæ—FVÔ–B“¦çVÆÃ¶–b‚—FVÒ—&WGW&âsÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖV×G’×cs#í	-½]-R­mâ½‚ýí}mâýí-M]½òãÂöF—câs¶6öç7B'W“×7Fö6µ6VÆV7F–öåvV%csBç6÷W&6SÓÓÒvÖ&¶WBrÆöffW#Ò†'W“÷&÷FF–öâæöffW'3§&÷FF–öâçV÷FW2’æf–æB‡&÷sÓç&÷ræ—FVÔ–CÓÓÖ—FVÒæ–B’Ç÷6—F–öã×Æ–W"ç7Fö6µ÷'FföÆ–óòç÷6—F–öç3òå¶—FVÒæ–EÒÇG“×7Fö6µG•vV%csB‡÷6—F–öâ’ÆF—6&ÆVCÒ&÷FF–öâç7Fö6´Ö&¶WDVæ&ÆVGÇÂöffW'ÇÂ†'W’bdçVÖ&W"‡Æ–W"æ7&VF—G7ÇÃ“ÄçVÖ&W"†öffW#òç&–6WÇÃ’—ÇÂ‚'W’bgG“Ã’Æ6×–vãÔæFFæ6×–vç2ævWB„æ6öæf–sòæ6×–vä–GÇÂvÖ–âr—ÇÇ·ÒÆ†—7F÷'“ÔÖ&¶WDVæv–æUcsç&–6T†—7F÷'’‡¶6×–vä–C¤æ6öæf–sòæ6×–vä–GÇÂvÖ–ârÆ6×–vâÆvÖTFFS¦6×–vâæÖ&¶WDFFRÇÆæWBÇÆæWG3¤æFFçÆæWG2ÆWV—ÖVçC¤æFFæ—FV×2Æ—FVÔ–C¦—FVÒæ–BÆVæDF“§&÷FF–öâç&÷FF–öä¶W’ÆF—3£3Ò“°¢6öç7BÆ—fSÖÆ—fU7Fö6µV÷FUvV%cC‚†—FVÒæ–B—ÇÆöffW'ÇÇ·Ó·&WGW&æÆF—b6Æ73Ò'7Fö6²×6VÆV7F–öâ×csB#ãÆF—b6Æ73Ò'7Fö6²×6VÆV7F–öâÖ†VB×csB#âG·&VæFW$VçF—G•F‡VÖ"†—FVÒ—ÓÆF—cãÇ7â6Æ73Ò'7Fö6²×7–Ö&öÂ×csB#âG¶W62‡7Fö6µF–6¶W%vV%csB†—FVÒ’—ÓÂ÷7ããÆƒ#âG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂöƒ#ãÇâG¶W62†—FVÒæFW67ÇÆ—FVÒæFW67&—F–öçÇÂ}	íýÝR­m‚ÝR}MÝââr—ÓÂ÷ãÂöF—cãÆF—b6Æ73Ò'7Fö6²×6VÆV7F–öâ×V÷FR×csBG·7Fö6´6†ævT6Æ75vV%csB‡7Fö6µW&–öD6†ævUvV%cS†—FVÒæ–B’æ6†ævR—Ò#ãÇ7ãí
]-]Ýòm]Ý+rG¶W62†Æ—fRç&Vv–ÖWÇÂ}ímMÝRr—ÓÂ÷7ããÆ#âG¶f÷&ÖD7&VF—G2†Æ—fRç&–6WÇÃ—ÓÂö#ãÇ6ÖÆÃí	}Í]Ý]ÝRí"Ý}½-½ÝÝí=âý]íMÂ÷6ÖÆÃâG·7Fö6µW&–öD6†ævTÖ&·WvV%cS†—FVÒæ–B—ÓÂöF—cãÂöF—câG·7Fö6µFV6†æ–6ÅvV%cC‚†—FVÒæ–B—ÓÆF—b6Æ73Ò'7Fö6²×÷6—F–öâÖf7G2×csB#ãÇ7ãí	½íÝ3¢Æ#âG·G—Ò"ãÂö#ãÂ÷7ããÇ7ãí
í#¢Æ#âG´çVÖ&W"‡Æ–W"ç7Fö6µ÷'FföÆ–óòç6†÷'E÷6—F–öç3òå¶—FVÒæ–EÓòçVçF—G—ÇÃ—Ò"ãÂö#ãÂ÷7ããÇ7ãí
]]-íÍí-Ã¢Æ#âG¶f÷&ÖD7&VF—G2‡÷6—F–öãòæ6÷7D&6—7ÇÃ—ÓÂö#ãÂ÷7ããÂöF—câG·7Fö6µ&VÆFVD'F–6ÆW5vV%csB†—FVÒ—ÒG·7Fö6´÷&FW%æVÅvV%cC‚†—FVÒ—ÒG·7Fö6´FÕæVÅvV%cC’†—FVÒ—ÓÂöF—cæ°¢Ð¢6öç7B&VæFW$vööG4Ö&¶WD&Vf÷&U7Fö6·5vV%csC×&VæFW$Ö&¶WC°¢&VæFW$Ö&¶WCÖgVæ7F–öâ‚—°¢–b…7G&–ær†7W'&VçEÆæWB‚“òæÆö6F–öåG—WÇÂwÆæWBr’çFôÆ÷vW$66R‚“ÓÓÒv‡V"r–Ö&¶WEF%vV%cs3Òw7Fö6·2s°¢–b†Ö&¶WEF%vV%cs2ÓÒw7Fö6·2r—·&VæFW$vööG4Ö&¶WD&Vf÷&U7Fö6·5vV%csB‚“·&WGW&ã·Ð¢6öç7B&ö÷CÒB‚r767&VVâÖÖ&¶WBr’ÇÆ–W#Ö7W'&VçEÆ–W"‚’ÇÆæWCÖ7W'&VçEÆæWB‚“·6WEF÷&"‚}
-í=í-½’-]ÍÝ²rÂ}	=½í½ÍÝòm‚½}Ý½’ýí-M]½Âr“¶–b‚Æ–W'ÇÂÆæWB—·&ö÷Bæ–ææW$…DÔÃÒsÆF—b6Æ73Ò'Æ6V†öÆFW"Ö&¶WBÖF—6&ÆVB#í
-]ÍÝ²}½í­í-Òâ
2ýíM½òÝ]"-]­=]’ý½Ý]-²ãÂöF—câs·&WGW&ã·Öæ÷&ÖÆ—¦U7Fö6µÆ–W%vV%csB‡Æ–W"“¶6öç7B&÷FF–öãÖÖ&¶WE&÷FF–öåvV%cs‡ÆæWB’Ç6W'fW$ÖÖæWrÖ‚‡7Fö6´W†6†ævUvV%cCƒòçV÷FW7ÇÅµÒ’æÖ‡&÷sÓå·&÷ræ—FVÔ–BÇ&÷uÒ’’ÆöffW'3×&÷FF–öâæöffW'2æf–ÇFW"‡&÷sÓäÖ&¶WDVæv–æUcsæ—57Fö6²„æFFæ—FV×2ævWB‡&÷ræ—FVÔ–B’’’æÖ‡&÷sÓâ‡²ââç&÷rÂâââ‡6W'fW$ÖævWB‡&÷ræ—FVÔ–B—ÇÇ·Ò—Ò’“·&÷FF–öâçV÷FW3×&÷FF–öâçV÷FW2æÖ‡&÷sÓâ‡²ââç&÷rÂâââ‡6W'fW$ÖævWB‡&÷ræ—FVÔ–B—ÇÇ·Ò—Ò’“¶–b‡7Fö6µ6VÆV7F–öåvV%csBbbÖ&¶WDVæv–æUcsæ—57Fö6²„æFFæ—FV×2ævWB‡7Fö6µ6VÆV7F–öåvV%csBæ—FVÔ–B’’—7Fö6µ6VÆV7F–öåvV%csCÖçVÆÃ°¢&ö÷Bæ–ææW$…DÔÃÖÆF—b6Æ73Ò&Ö&¶WB×FW&Ö–æÂ×csG·&÷FF–öâç7Fö6´Ö&¶WDVæ&ÆVCòrs¢vÆö6¶VBwÒ#ãÆF—b6Æ73Ò&†W&òÖ6&BÖ&¶WBÖ†W&ò×cs#ãÆF—b6Æ73Ò'6V7F–öâÖ†VB#ãÆF—cãÆF—b6Æ73Ò&W–V'&÷r#í		
	m	ÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#âG¶W62‡ÆæWBææÖR—ÓÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	=í-í’M]ÝÂ½Ý­¢G¶W62†f÷&ÖDFFR‡&÷FF–öâç&÷FF–öä¶W’’—ÓÂöF—cãÂöF—cãÆF—b6Æ73Ò'–ÆÂ#í	½Ý¢G¶f÷&ÖD7&VF—G2‡Æ–W"æ7&VF—G7ÇÃ—ÓÂöF—cãÂöF—cãÂöF—cãÆF—b6Æ73Ò&Ö&¶WB×F'2×cs2"&öÆSÒ'F&Æ—7B#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×vV"ÖÖ&¶WB×F"×cs3Ò&vööG2#í
-	í	-	

³Âö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’7F—fR"G—SÒ&'WGFöâ"FF×vV"ÖÖ&¶WB×F"×cs3Ò'7Fö6·2#í		­
m		ƒÂö'WGFöããÂöF—cãÆF—b6Æ73Ò&Ö&¶WBÖ66W72Ö&ææW"×csG·&÷FF–öâç7Fö6´Ö&¶WDVæ&ÆVCòvö²s¢vW'"wÒ#âG·&÷FF–öâç7Fö6´Ö&¶WDVæ&ÆVCò}	-R­m‚Mí-=ýÝ²ýâ]MÝ½Âm]ÝÂÝ-]Rý½Ý]-Râ	ýíMm(	BR-]­=]’­í-í-­‚âs¢}	ÝÝ-í’ý½Ý]-RÝ]"MíÝMí-í=â½Ý­â	ýí-M]½ÂMí-=ý]ÒM½òýíÍí-Â-í=í-½Ríý]m‚í-­½í}]Ý²âwÓÂöF—cãÆF—b6Æ73Ò&Ö&¶WBÖGVÂÖw&–B×cs7Fö6²ÖÆ–÷WB×csB#ãÇ6V7F–öâ6Æ73Ò&Ö&¶WB×æR×cs"FF×vV"×7Fö6²ÖÖ&¶WBÖG&÷×csCãÆF—b6Æ73Ò&Ö&¶WB×æRÖ†VB×cs#ãÆF—cãÇ7â6Æ73Ò&W–V'&÷r#í	­	í
-	
	í	-	­	ƒÂ÷7ããÆ#í	m]-½R­í-í-­ƒÂö#ãÂöF—cãÇ7ãâG¶öffW'2æÆVæwF‡ÒýírãÂ÷7ããÂöF—cãÆF—b6Æ73Ò'7Fö6²×V÷FW2Öw&–B×csB#âG¶öffW'2æÖ‡7Fö6´öffW%F–ÆUvV%csB’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'Æ6V†öÆFW"#í	ÝÝ-í’ý½Ý]-RMíÝMí-½’½Ýí¢Ý]Mí-=ý]ÒãÂöF—câwÓÂöF—cãÂ÷6V7F–öããÇ6V7F–öâ6Æ73Ò&Ö&¶WB×æR×cs#âG·7Fö6µ÷'FföÆ–ôÖ&·WvV%csB‡Æ–W"Ç&÷FF–öâ—ÓÂ÷6V7F–öããÂöF—câG·7Fö6µ6VÆV7F–öäÖ&·WvV%csB‡Æ–W"ÇÆæWBÇ&÷FF–öâ—ÓÂöF—cæ°¢Ó°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç¶6öç7BF–ÆSÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²×csEÒr“¶–b‡F–ÆRbgF–ÆRæ6Æ÷6W7B‚r767&VVâÖÖ&¶WBr’—·7Fö6µ6VÆV7F–öåvV%csC×·6÷W&6S¥7G&–ær‡F–ÆRæFF6WBç6÷W&6WÇÂrr’Æ—FVÔ–C¥7G&–ær‡F–ÆRæFF6WBæ—FVÔ–GÇÂrr—Ó·&VæFW$Ö&¶WB‚“·&WGW&ã·Ö6öç7B7F–öãÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²Ö7F–öâ×csEÒr“¶–b†7F–öâbg7Fö6µ6VÆV7F–öåvV%csB—¶6öç7B6öçG&öÃÖ7F–öâæ6Æ÷6W7B‚u¶FF×vV"ÖÖ&¶WB×VçF—G’×c3•Òr’ÇVçF—G“Ö6öçG&öÃ÷WFFTÖ&¶WEVçF—G•vV%c3’†6öçG&öÂ“£¶–b†7F–öâæF—6&ÆVB—&WGW&ã·G&ç67DÖ&¶WEvV%cs‡¶7F–öã¥7G&–ær†7F–öâæFF6WBçvV%7Fö6´7F–öåcsB’Æ—FVÔ–C§7Fö6µ6VÆV7F–öåvV%csBæ—FVÔ–BÇVçF—G—Ò’æ6F6‚†W'&÷#Óææ÷F–g’†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r’“·×Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6†ævRrÆWfVçCÓç¶6öç7BG—SÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²Ö÷&FW"×G—R×cC…Òr“¶–b‡G—R—G—Ræ6Æ÷6W7B‚rç7Fö6²Ö÷&FW'2×cC‚r’æFF6WBæ÷&FW%G—S×G—RçfÇVS·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç¶6öç7B&W6WCÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²×&W6WB×cC•Òr“¶–b‡&W6WB—·&W6WBæ6Æ÷6W7B‚rç7Fö6²ÖFÒ×cC’r’çVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²ÖFÒ×W&6VçB×cC•Òr’çfÇVS×&W6WBæFF6WBçvV%7Fö6µ&W6WEcC“·&WGW&ã·Ö6öç7B–×VÇ6SÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²Ö–×VÇ6R×cC•Òr“¶–b†–×VÇ6R—¶6öç7BæVÃÖ–×VÇ6Ræ6Æ÷6W7B‚rç7Fö6²ÖFÒ×cC’r’Æ&öG“×¶6×–vä–C¤æ6öæf–ræ6×–vä–BÇÆ–W$–C¦7W'&VçEÆ–W"‚’æ–BÆ—FVÔ–C¦–×VÇ6RæFF6WBçvV%7Fö6´–×VÇ6UcC’ÇF&vWE&–6S¤çVÖ&W"‡æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²ÖFÒ×&–6R×cC•Òr’çfÇVR’ÇW&6VçC¤çVÖ&W"‡æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²ÖFÒ×W&6VçB×cC•Òr’çfÇVR’ÆGW&F–öã¤çVÖ&W"‡æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²ÖFÒÖGW&F–öâ×cC•Òr’çfÇVR—Ó·$fWF6‚„æ6öæf–rÂrö’öw'v’÷7Fö6²ÖW†6†ævR×cC‚ö–×VÇ6RrÇ¶ÖWF†öC¢uõ5BrÆ§6öã¦&öG—Ò’çF†Vâ‡&W7VÇCÓç¶–b‚&W7VÇCòæö²—F‡&÷ræWrW'&÷"‡&W7VÇCòæÖW76vWÇÂ}	­í]­-í-­í-­½íÝ]Ýr“¶æ÷F–g’‡&W7VÇBç7FGW3ÓÓÒw&–6R×6WBsò}
m]Ý}Í]Ý]Ýs¢}	Íý=½Í}ý½Ýí-ÒrÂvö²r“·&WGW&â&Vg&W6…7Fö6´W†6†ævUvV%cC‚‚“·Ò’æ6F6‚†W'&÷#Óææ÷F–g’†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r’“·×Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç¶6öç7BF–ÖVg&ÖSÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²×F–ÖVg&ÖR×cC…Òr“¶–b‡F–ÖVg&ÖR—·7Fö6µF–ÖVg&ÖUvV%cCƒ×F–ÖVg&ÖRæFF6WBçvV%7Fö6µF–ÖVg&ÖUcCƒ·F6…7Fö6´W†6†ævUvV%cC’‚“·&WGW&ã·Ö6öç7Bf–WsÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²Ö÷&FW"×f–Wr×cSÒr“¶–b‡f–Wr—·7Fö6´÷&FW%f–WuvV%cS×f–WræFF6WBçvV%7Fö6´÷&FW%f–WucS·F6…7Fö6´W†6†ævUvV%cC’‡¶f÷&6T÷&FW'3§G'VWÒ“·&WGW&ã·Ö6öç7B7V&Ö—CÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²×7V&Ö—B×cC…Òr“¶–b‡7V&Ö—B—¶6öç7BæVÃ×7V&Ö—Bæ6Æ÷6W7B‚rç7Fö6²Ö÷&FW'2×cC‚r’ÇÆ–W#Ö7W'&VçEÆ–W"‚’Æ&öG“×¶6×–vä–C¤æ6öæf–ræ6×–vä–BÇÆ–W$–C§Æ–W"æ–BÆ—FVÔ–C§7V&Ö—BæFF6WBçvV%7Fö6µ7V&Ö—EcC‚Æ–çFVçC§æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²Ö÷&FW"Ö–çFVçB×cC…Òr’çfÇVRÇG—S§æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²Ö÷&FW"×G—R×cC…Òr’çfÇVRÇVçF—G“¤çVÖ&W"‡æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²Ö÷&FW"×VçF—G’×cC…Òr’çfÇVR’ÇG&–vvW%&–6S¤çVÖ&W"‡æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²Ö÷&FW"×G&–vvW"×cC…Òr’çfÇVR’ÆÆ–Ö—E&–6S¤çVÖ&W"‡æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²Ö÷&FW"ÖÆ–Ö—B×cC…Òr’çfÇVR’ÇG&–Æ–æuW&6VçC¤çVÖ&W"‡æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²Ö÷&FW"×G&–Æ–ær×cC…Òr’çfÇVR’ÆÆWfW&vS¤çVÖ&W"‡æVÂçVW'•6VÆV7F÷"‚u¶FF×vV"×7Fö6²Ö÷&FW"ÖÆWfW&vR×cC…Òr’çfÇVR’Æ÷W&F–öä–C¦7'—Fòç&æFöÕUT”B‚—Ó·$fWF6‚„æ6öæf–rÂrö’öw'v’÷7Fö6²ÖW†6†ævR×cC‚ö÷&FW"rÇ¶ÖWF†öC¢uõ5BrÆ§6öã¦&öG—Ò’çF†Vâ‡&W7VÇCÓç¶–b‚&W7VÇCòæö²—F‡&÷ræWrW'&÷"‡&W7VÇCòæÖW76vWÇÂ}	}ý-­í-­½íÝ]Ýr“·7Fö6´W†6†ævUvV%cCƒ×&W7VÇC·7Fö6´÷&FW%f–WuvV%cSÒvÆÂs¶æ÷F–g’‡&W7VÇBç7FGW3ÓÓÒvf–ÆÆVBsò}	}ý-­ýí½Ý]Ýs¢}	}ý-­}Í]]ÝrÂvö²r“·&WGW&â&Vg&W6…7Fö6´W†6†ævUvV%cC‚‡¶f÷&6T÷&FW'3§G'VWÒ“·Ò’æ6F6‚†W'&÷#Óææ÷F–g’†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r’“·&WGW&ã·Ö6öç7B6æ6VÃÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²Ö6æ6VÂ×cC…Òr“¶–b†6æ6VÂ—·$fWF6‚„æ6öæf–rÂrö’öw'v’÷7Fö6²ÖW†6†ævR×cC‚ö6æ6VÂrÇ¶ÖWF†öC¢uõ5BrÆ§6öã§¶6×–vä–C¤æ6öæf–ræ6×–vä–BÇÆ–W$–C¦7W'&VçEÆ–W"‚’æ–BÆ÷&FW$–C¦6æ6VÂæFF6WBçvV%7Fö6´6æ6VÅcC‡×Ò’çF†Vâ‡&W7VÇCÓç¶–b‚&W7VÇCòæö²—F‡&÷ræWrW'&÷"‡&W7VÇCòæÖW76vWÇÂ}	}ý-­2ÝR=M½íÂí-Í]Ý-Âr“¶æ÷F–g’‚}	}ý-­í-Í]Ý]ÝrÂvö²r“·&WGW&â&Vg&W6…7Fö6´W†6†ævUvV%cC‚‡¶f÷&6T÷&FW'3§G'VWÒ“·Ò’æ6F6‚†W'&÷#Óææ÷F–g’†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r’“·×Ò“°¢6WD–çFW'fÂ‚‚“Óç¶–b†Ö&¶WEF%vV%cs3ÓÓÒw7Fö6·2rbdçV’ç67&VVãÓÓÒvÖ&¶WBr—&Vg&W6…7Fö6´W†6†ævUvV%cC‚‚“·ÒÃS“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&w7F'BrÆWfVçCÓç¶6öç7BæöFSÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²×csEÒr“¶–b‚æöFWÇÂæöFRæ6Æ÷6W7B‚r767&VVâÖÖ&¶WBr’—&WGW&ã·7Fö6´G&uvV%csC×·6÷W&6S¥7G&–ær†æöFRæFF6WBç6÷W&6WÇÂrr’Æ—FVÔ–C¥7G&–ær†æöFRæFF6WBæ—FVÔ–GÇÂrr—Ó¶WfVçBæFFG&ç6fW"æVffV7DÆÆ÷vVC×7Fö6´G&uvV%csBç6÷W&6SÓÓÒvÖ&¶WBsòv6÷’s¢vÖ÷fRs·G'—¶WfVçBæFFG&ç6fW"ç6WDFF‚wFW‡B÷Æ–ârÇ7Fö6´G&uvV%csBæ—FVÔ–B“·Ö6F6‡·×Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&vVæBrÆWfVçCÓç¶–b†WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²×csEÒr’—7Fö6´G&uvV%csCÖçVÆÃ·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&v÷fW"rÆWfVçCÓç¶–b‚7Fö6´G&uvV%csB—&WGW&ã¶6öç7BF&vWC×7Fö6´G&uvV%csBç6÷W&6SÓÓÒvÖ&¶WBsöWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²×÷'FföÆ–òÖG&÷×csEÒr“¦WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²ÖÖ&¶WBÖG&÷×csEÒr“¶–b‡F&vWB—¶WfVçBç&WfVçDFVfVÇB‚“¶WfVçBæFFG&ç6fW"æG&÷VffV7C×7Fö6´G&uvV%csBç6÷W&6SÓÓÒvÖ&¶WBsòv6÷’s¢vÖ÷fRs·×Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&÷rÆWfVçCÓç¶–b‚7Fö6´G&uvV%csB—&WGW&ã¶6öç7B÷'FföÆ–óÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²×÷'FföÆ–òÖG&÷×csEÒr’ÆÖ&¶WCÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"×7Fö6²ÖÖ&¶WBÖG&÷×csEÒr“¶–b‚‡7Fö6´G&uvV%csBç6÷W&6SÓÓÒvÖ&¶WBrbb÷'FföÆ–ò—ÇÂ‡7Fö6´G&uvV%csBç6÷W&6SÓÓÒw÷'FföÆ–òrbbÖ&¶WB’—&WGW&ã¶WfVçBç&WfVçDFVfVÇB‚“¶6öç7B–ÆöC×¶7F–öã§7Fö6´G&uvV%csBç6÷W&6SÓÓÒvÖ&¶WBsòv'W’s¢w6VÆÂrÆ—FVÔ–C§7Fö6´G&uvV%csBæ—FVÔ–GÓ·7Fö6´G&uvV%csCÖçVÆÃ·G&ç67DÖ&¶WEvV%cs‡–ÆöB’æ6F6‚†W'&÷#Óææ÷F–g’†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r’“·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç¶6öç7B7FWÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WB×G’×7FW×c3•Òr“¶–b‚7FWÇÂ7FWæ6Æ÷6W7B‚r767&VVâÖÖ&¶WBr’—&WGW&ã¶6öç7B6öçG&öÃ×7FWæ6Æ÷6W7B‚u¶FF×vV"ÖÖ&¶WB×VçF—G’×c3•Òr’Æ–çWCÖ6öçG&öÃòçVW'•6VÆV7F÷"‚u¶FF×vV"ÖÖ&¶WB×G’Ö–çWB×c3•Òr“¶–b†–çWB––çWBçfÇVSÕ7G&–ær‚„ÖF‚çG'Væ2„çVÖ&W"†–çWBçfÇVR—ÇÃ’’²„ÖF‚çG'Væ2„çVÖ&W"‡7FWæFF6WBçvV$Ö&¶WEG•7FWc3’—ÇÃ’’“·WFFTÖ&¶WEVçF—G•vV%c3’†6öçG&öÂ“·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v–çWBrÆWfVçCÓç¶6öç7B–çWCÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×vV"ÖÖ&¶WB×G’Ö–çWB×c3•Òr“¶–b†–çWBbf–çWBæ6Æ÷6W7B‚r767&VVâÖÖ&¶WBr’—WFFTÖ&¶WEVçF—G•vV%c3’†–çWBæ6Æ÷6W7B‚u¶FF×vV"ÖÖ&¶WB×VçF—G’×c3•Òr’“·Ò“° ¢Ç”W&F†VÖUcC’‚wFV6†æöÆöv–6Âr“° ¢òòcããƒs¢6—F—¦Vç6†——26Æ7VÆFVBg&öÒvVöw&†–2Ö÷&–v–âÆæWB66W72à¢òòÆæWB6öÆ÷"—2F†R7F&ÆR¶W“²F†RF—7Æ–VBæÖRÇv—26öÖW2g&öÒF†RvÆö&ÂÖÖÆVvVæBà¢gVæ7F–öâ6—F—¦Vç6†—6öÆ÷$¶W•vV%cƒr‡fÇVR’°¢6öç7B&sÕ7G&–ær‡fÇVWÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢6öç7B6†÷'C×&ræÖF6‚‚õâ2…³Ó–Öe×³7Ò’Bö’“¶–b‡6†÷'B—&WGW&æ2G·6†÷'E³Òç7Æ—B‚rr’æÖ‡'CÓç'B·'B’æ¦ö–â‚rr—Ö°¢6öç7B†Wƒ×&ræÖF6‚‚õâ2…³Ó–Öe×³gÒ’ƒó¥³Ó–Öe×³'Ò“òBö’“¶–b††W‚—&WGW&æ2G¶†W…³×Ö°¢6öç7B&v#×&ræÖF6‚‚õç&v&õÂ…Ç2¢…ÆG³Ã7Ò•Ç2¢ÅÇ2¢…ÆG³Ã7Ò•Ç2¢ÅÇ2¢…ÆG³Ã7Ò’ö’“°¢–b‡&v"—&WGW&æ2G·&v"ç6Æ–6RƒÃB’æÖ‡fÇVSÓäÖF‚æÖ‚ƒÄÖF‚æÖ–âƒ#SRÄçVÖ&W"‡fÇVR’’’çFõ7G&–ærƒb’çE7F'Bƒ"Âsr’’æ¦ö–â‚rr—Ö°¢&WGW&â&rç&WÆ6R‚õÇ2²örÂrr“°¢Ð¢gVæ7F–öâ6—F—¦Vç6†—ÆVvVæEvV%cƒr‚—°¢6öç7B7FFSÔ'&’æ—4'&’„æFFç7FFSòævÆ‡”ÆVvVæB“ôæFFç7FFRævÆ‡”ÆVvVæC¥µÓ°¢6öç7Bv÷&ÆCÔ'&’æ—4'&’„æFFçv÷&ÆCòçV“òævÆ‡”ÆVvVæB“ôæFFçv÷&ÆBçV’ævÆ‡”ÆVvVæC¥µÓ°¢&WGW&â‡7FFRæÆVæwFƒ÷7FFS§v÷&ÆB’æÖ†VçG'“Óâ‡¶6öÆ÷#¥7G&–ær†VçG'“òæ6öÆ÷'ÇÂrr’çG&–Ò‚’ÆÆ&VÃ¥7G&–ær†VçG'“òæÆ&VÇÇÆVçG'“òææÖWÇÂrr’çG&–Ò‚—Ò’’æf–ÇFW"†VçG'“ÓæVçG'’æ6öÆ÷"bfVçG'’æÆ&VÂ“°¢Ð¢gVæ7F–öâ6—F—¦Vç6†—÷&–v–åvV%cƒr†÷&–v–ä–B—°¢6öç7B–CÕ7G&–ær†÷&–v–ä–GÇÂrr“¶6öç7BÖVCÔæFFævVöw&†–4÷&–v–ç3òævWCòâ†–B“¶–b†ÖVB—&WGW&âÖVC°¢6öç7B6V7F–öãÔæFFçv÷&ÆCòævVöw&†–4÷&–v–ç7ÇÇ·Ó·&WGW&â6V7F–öãòätTôu$„”5ôõ$”t”å3òå¶–E×ÇÂ‡6V7F–öãòätTôu$„”5ôõ$”t”åôÄ•5GÇÅµÒ’æf–æB†÷&–v–ãÓå7G&–ær†÷&–v–ãòæ–GÇÂrr“ÓÓÖ–B—ÇÆçVÆÃ°¢Ð¢gVæ7F–öâ&W6öÇfT6—F—¦Vç6†—vV%cƒr‡Æ–W#×·Ò—°¢6öç7B÷&–v–ãÖ6—F—¦Vç6†—÷&–v–åvV%cƒr‡Æ–W"ævVöw&†–4÷&–v–ä–B—ÇÇ·Ó°¢6öç7BÆæWD–G3Ô'&’æg&öÒ†æWr6WB…²âââ†÷&–v–âæÆ–æ¶VEÆæWD–G7ÇÆ÷&–v–âçÆæWD–G7ÇÆ÷&–v–âæ66W75ÆæWD–G7ÇÅµÒ’Ââââ†÷&–v–âæw&çFVEÆæWD–G7ÇÆ÷&–v–âæ66W74w&çFVEÆæWD–G7ÇÅµÒ•ÒæÖ‡fÇVSÓå7G&–ær‡fÇVWÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ’’“°¢6öç7B'”6öÆ÷#ÖæWrÖ‚“¶6—F—¦Vç6†—ÆVvVæEvV%cƒr‚’æf÷$V6‚†VçG'“Óç¶6öç7B¶W“Ö6—F—¦Vç6†—6öÆ÷$¶W•vV%cƒr†VçG'’æ6öÆ÷"“¶–b†¶W’bb'”6öÆ÷"æ†2†¶W’’–'”6öÆ÷"ç6WB†¶W’ÆVçG'’“·Ò“°¢6öç7BÖF6†W3ÕµÒÇ6VVãÖæWr6WB‚’ÇVç&W6öÇfVEÆæWD–G3ÕµÓ°¢ÆæWD–G2æf÷$V6‚‡ÆæWD–CÓç¶6öç7BÆæWCÔæFFçÆæWG2ævWB‡ÆæWD–B’ÆVçG'“×ÆæWCö'”6öÆ÷"ævWB†6—F—¦Vç6†—6öÆ÷$¶W•vV%cƒr‡ÆæWBæ6öÆ÷"’“¦çVÆÃ¶–b‚VçG'’—·Vç&W6öÇfVEÆæWD–G2çW6‚‡ÆæWD–B“·&WGW&ã·Ö–b‡6VVâæ†2†VçG'’æÆ&VÂ’—¶ÖF6†W2æf–æB‡&÷sÓç&÷ræÆ&VÃÓÓÖVçG'’æÆ&VÂ“òçÆæWD–G2çW6‚‡ÆæWD–B“·&WGW&ã·×6VVâæFB†VçG'’æÆ&VÂ“¶ÖF6†W2çW6‚‡¶Æ&VÃ¦VçG'’æÆ&VÂÆ6öÆ÷#¦VçG'’æ6öÆ÷"ÇÆæWD–G3¥·ÆæWD–E×Ò“·Ò“°¢6öç7BÆ&VÇ3ÖÖF6†W2æÖ†VçG'“ÓæVçG'’æÆ&VÂ“·&WGW&ç¶Æ&VÃ¦Æ&VÇ2æ¦ö–â‚r+rr’ÆÆ&VÇ2ÆÖF6†W2ÇÆæWD–G2ÇVç&W6öÇfVEÆæWD–G2Æ÷&–v–ä–C¥7G&–ær‡Æ–W"ævVöw&†–4÷&–v–ä–GÇÂrr—Ó°¢Ð¢gVæ7F–öâ6—F—¦Vç6†—Ö&·WvV%cƒr‡&W7VÇBÆfÆÆ&6³Ò}	ÝRíý]M]½]Ýâr—°¢–b‚&W7VÇCòæÖF6†W3òæÆVæwF‚—&WGW&æÇ7â6Æ73Ò&6—F—¦Vç6†—×fÇVR×cƒrVç&W6öÇfVB#âG¶W62†fÆÆ&6²—ÓÂ÷7ãæ°¢&WGW&æÇ7â6Æ73Ò&6—F—¦Vç6†—×fÇVR×cƒr#âG·&W7VÇBæÖF6†W2æÖ†VçG'“ÓæÇ7â6Æ73Ò&6—F—¦Vç6†—Ö6†—×cƒr#ãÆ’6Æ73Ò&6—F—¦Vç6†—×7vF6‚×cƒr"7G–ÆSÒ"ÒÖ6—F—¦Vç6†—Ö6öÆ÷#¢G¶W62†6—F—¦Vç6†—6öÆ÷$¶W•vV%cƒr†VçG'’æ6öÆ÷"’—Ò#ãÂö“âG¶W62†VçG'’æÆ&VÂ—ÓÂ÷7ãæ’æ¦ö–â‚rr—ÓÂ÷7ãæ°¢Ð¢v–æF÷räu%6—F—¦Vç6†—cƒsÔö&¦V7Bæg&VW¦R‡·&W6öÇfS§&W6öÇfT6—F—¦Vç6†—vV%cƒrÆ6öÆ÷$¶W“¦6—F—¦Vç6†—6öÆ÷$¶W•vV%cƒwÒ“° ¢6öç7BFV6ö×÷6UÆ–W$&Vf÷&T6—F—¦Vç6†—vV%cƒsÖFV6ö×÷6UÆ–W#°¢FV6ö×÷6UÆ–W#ÖgVæ7F–öâ‡Æ–W"—°¢6öç7BæW‡C×²âââ‡Æ–W'ÇÇ·Ò—ÒÆ6—F—¦Vç6†—×&W6öÇfT6—F—¦Vç6†—vV%cƒr†æW‡B“°¢æW‡Bæ6—F—¦Vç6†—Ö6—F—¦Vç6†—æÆ&VÃ¶æW‡Bæ6—F—¦Vç6†—Æ&VÇ3Ö6—F—¦Vç6†—æÆ&VÇ3¶æW‡Bæ6—F—¦Vç6†—ÆæWD–G3Ö6—F—¦Vç6†—çÆæWD–G3°¢&WGW&âFV6ö×÷6UÆ–W$&Vf÷&T6—F—¦Vç6†—vV%cƒr†æW‡B“°¢Ó° ¢6öç7B&VæFW%&öf–ÆT&Vf÷&T6—F—¦Vç6†—vV%cƒs×&VæFW%&öf–ÆS°¢&VæFW%&öf–ÆSÖgVæ7F–öâ‚—°¢6öç7B&W7VÇC×&VæFW%&öf–ÆT&Vf÷&T6—F—¦Vç6†—vV%cƒr‚’ÇÆ–W#Ö7W'&VçEÆ–W"‚’Ç&ö÷CÒB‚r767&VVâ×&öf–ÆRr“¶–b‚Æ–W'ÇÂ&ö÷B—&WGW&â&W7VÇC°¢6öç7Bw&–C×&ö÷BçVW'•6VÆV7F÷"‚u¶FFÖ÷&–v–â×cS%Òr—ÇÇ&ö÷BçVW'•6VÆV7F÷"‚rç&öf–ÆRÖ6&Bæ–æfòÖw&–Br“°¢–b†w&–Bbbw&–BçVW'•6VÆV7F÷"‚u¶FFÖ6—F—¦Vç6†—×cƒuÒr’–w&–Bæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÆÆF—b6Æ73Ò&–æfòÖ6&B6—F—¦Vç6†—Ö–æfòÖ6&B×cƒr"FFÖ6—F—¦Vç6†—×cƒsãÆF—b6Æ73Ò&²#í	=mMÝ--ãÂöF—cãÆF—b6Æ73Ò'b#âG¶6—F—¦Vç6†—Ö&·WvV%cƒr‡&W6öÇfT6—F—¦Vç6†—vV%cƒr‡Æ–W"’—ÓÂöF—cãÂöF—cæ“°¢&WGW&â&W7VÇC°¢Ó° ¢6öç7B&VæFW$Æöv–å&Wf–Wt&Vf÷&T6—F—¦Vç6†—vV%cƒs×&VæFW$Æöv–å&Wf–Ws°¢&VæFW$Æöv–å&Wf–WsÖgVæ7F–öâ‚—°¢6öç7B&W7VÇC×&VæFW$Æöv–å&Wf–Wt&Vf÷&T6—F—¦Vç6†—vV%cƒr‚’ÇÆ–W#ÔæFFçÆ–W'2ævWB‚B‚r6Æöv–â×Æ–W"r“òçfÇVWÇÂrr’Æ6÷“ÒB‚r6Æöv–â×&Wf–Wrç&öf–ÆRÖ†W&òâF—c¦Æ7BÖ6†–ÆBr“°¢–b‡Æ–W"bf6÷’bb6÷’çVW'•6VÆV7F÷"‚u¶FFÖÆöv–âÖ6—F—¦Vç6†—×cƒuÒr’–6÷’æ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÆÆF—b6Æ73Ò'6ÖÆÂÖæ÷FRÆöv–âÖ6—F—¦Vç6†—×cƒr"FFÖÆöv–âÖ6—F—¦Vç6†—×cƒsí	=mMÝ--ã¢G¶6—F—¦Vç6†—Ö&·WvV%cƒr‡&W6öÇfT6—F—¦Vç6†—vV%cƒr‡Æ–W"’—ÓÂöF—cæ“°¢&WGW&â&W7VÇC°¢Ó° ¢gVæ7F–öâFV6÷&FU&Vv—7G&F–öä6—F—¦Vç6†—vV%cƒr‡&ö÷CÖFö7VÖVçB—°¢&ö÷BçVW'•6VÆV7F÷$ÆÃòâ‚r7&Vv—7G&F–öâ×æVÂ×cS"¶æÖSÒ&vVöw&†–4÷&–v–ä–B%Òr’æf÷$V6‚†–çWCÓç°¢6öç7B&öG“Ö–çWBæ6Æ÷6W7B‚ræ÷&–v–âÖ6†ö–6RÖ6&B×cSBr“òçVW'•6VÆV7F÷"‚ræ÷&–v–âÖ6†ö–6RÖ&öG’×cSBr“¶–b‚&öG—ÇÆ&öG’çVW'•6VÆV7F÷"‚u¶FFÖ÷&–v–âÖ6—F—¦Vç6†—×cƒuÒr’—&WGW&ã°¢6öç7BÖ&·WÖÆF—b6Æ73Ò&÷&–v–âÖ6—F—¦Vç6†—×cƒr"FFÖ÷&–v–âÖ6—F—¦Vç6†—×cƒsãÇ7ãí	=mMÝ--ãÂ÷7ãâG¶6—F—¦Vç6†—Ö&·WvV%cƒr‡&W6öÇfT6—F—¦Vç6†—vV%cƒr‡¶vVöw&†–4÷&–v–ä–C¦–çWBçfÇVWÒ’—ÓÂöF—cæ°¢6öç7Bæ6†÷#Ö&öG’çVW'•6VÆV7F÷"‚ræ÷&–v–âÖ&öçW6W2×cSBÂæ÷&–v–â×6VÆV7BÖ–æF–6F÷"×cSBr“¶–b†æ6†÷"–æ6†÷"æ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&V&Vv–ârÆÖ&·W“¶VÇ6R&öG’æ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÆÖ&·W“°¢Ò“°¢Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç¶–b†WfVçBçF&vWCòæ–CÓÓÒw&Vv—7FW"Ö÷Vâ×cS"r—&WVW7Dæ–ÖF–öäg&ÖR‚‚“ÓæFV6÷&FU&Vv—7G&F–öä6—F—¦Vç6†—vV%cƒr‚’“·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6†ævRrÆWfVçCÓç¶–b†WfVçBçF&vWCòææÖSÓÓÒv6×–vä–BrbfWfVçBçF&vWBæ6Æ÷6W7B‚r7&Vv—7G&F–öâ×æVÂ×cS"r’—&WVW7Dæ–ÖF–öäg&ÖR‚‚“ÓæFV6÷&FU&Vv—7G&F–öä6—F—¦Vç6†—vV%cƒr‚’“·Ò“° ¢òòcããƒƒ¢W&f—6–&–Æ—G’—2WfÇVFVBv–ç7BF†R6×–vâöbF†R7W'&VçB6W76–öâÀ¢òòæ÷BWfW'’6×–vâWfW"76–væVBFòF†R6†&7FW"à¢6öç7Bd•4”$”Ä•E•ôU$5õtT%õcƒƒÖæWr6WB…²vÖVF–WfÂrÂv–æGW7G&–ÂrÂwFV6†æöÆöv–6ÂuÒ“°¢gVæ7F–öâæ÷&ÖÆ—¦Uf—6–&–Æ—G”W&vV%cƒ‚‡fÇVRÆfÆÆ&6³Òrr—°¢6öç7B&sÕ7G&–ær‡fÇVWÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“¶–b…d•4”$”Ä•E•ôU$5õtT%õcƒ‚æ†2‡&r’—&WGW&â&s°¢–b‚ý]GÆÖVF–WgÆfWVFÇÆæ6–VçBòçFW7B‡&r’—&WGW&âvÖVF–WfÂs°¢–b‚ýÝM=-Æ–æGW7G&–ÇÇ7FV×ÆF–W6VÇÆæÆöwÆÖöFW&çÆæ÷vF—2òçFW7B‡&r’—&WGW&âv–æGW7G&–Âs°¢–b‚ý-]]×ÇFV6†æöÆöwÆgWGW&WÇ66•µÇ2ÕÓöf—Ç76RòçFW7B‡&r’—&WGW&âwFV6†æöÆöv–6Âs°¢&WGW&âfÆÆ&6³°¢Ð¢gVæ7F–öâVæ—VUf—6–&–Æ—G”–G5vV%cƒ‚‡fÇVR—·&WGW&â'&’æg&öÒ†æWr6WB‚„'&’æ—4'&’‡fÇVR“÷fÇVS¥µÒ’æÖ†VçG'“Óå7G&–ær†VçG'“òæ–GÇÆVçG'“òæ6×–vä–GÇÆVçG'—ÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ’’“·Ð¢gVæ7F–öâf—6–&–Æ—G•66÷UvV%cƒ‚†VçF—G“×·Ò—°¢6öç7B6÷W&6SÖVçF—G“òçf—6–&–Æ—G’bgG—VöbVçF—G’çf—6–&–Æ—G“ÓÓÒvö&¦V7BsöVçF—G’çf—6–&–Æ—G“§·Ó°¢&WGW&ç·Æ–W$–G3§Væ—VUf—6–&–Æ—G”–G5vV%cƒ‚‡6÷W&6RçÆ–W$–G2’Æ6×–vä–G3§Væ—VUf—6–&–Æ—G”–G5vV%cƒ‚‡6÷W&6Ræ6×–vä–G7ÇÇ6÷W&6Ræ6×–vç2’ÆW&–G3§Væ—VUf—6–&–Æ—G”–G5vV%cƒ‚‡6÷W&6RæW&–G7ÇÇ6÷W&6RæW&7ÇÇ6÷W&6RæWö6‡2’æÖ‡fÇVSÓææ÷&ÖÆ—¦Uf—6–&–Æ—G”W&vV%cƒ‚‡fÇVR’’æf–ÇFW"„&ööÆVâ—Ó°¢Ð¢gVæ7F–öâ7F—fT6×–väf÷%f—6–&–Æ—G•vV%cƒ‚‡Æ–W#×·Ò—°¢6öç7B6W76–öä–CÕ7G&–ær„ç6W76–öãòæ6×–vä–GÇÂrr’çG&–Ò‚“¶–b‡6W76–öä–BbdæFFæ6×–vç2æ†2‡6W76–öä–B’—&WGW&âæFFæ6×–vç2ævWB‡6W76–öä–B“°¢6öç7BV”–CÕ7G&–ær„çV“òç6VÆV7FVD6×–vä–GÇÂrr’çG&–Ò‚“¶–b‡V”–BbgV”–BÓÒvÆÂrbdæFFæ6×–vç2æ†2‡V”–B’—&WGW&âæFFæ6×–vç2ævWB‡V”–B“°¢&WGW&â6×–vä–G4f÷%Æ–W"‡Æ–W"’æÖ†–CÓäæFFæ6×–vç2ævWB…7G&–ær†–B’’’æf–æB„&ööÆVâ—ÇÆçVÆÃ°¢Ð¢gVæ7F–öâ6×–våf—6–&–Æ—G”W&vV%cƒ‚†6×–vâ—·&WGW&â6×–vãöæ÷&ÖÆ—¦Uf—6–&–Æ—G”W&vV%cƒ‚†6×–vâæW&ÇÆ6×–vâæW&–GÇÆ6×–vâæWö6‡ÇÆ6×–vâæWö6„–GÇÆ6×–vâçF†VÖRÂwFV6†æöÆöv–6Âr“¢rs·Ð¢gVæ7F–öâ÷&–v–äw&çG5f—6–&–Æ—G•vV%cƒ‚†VçF—G“×·ÒÇÆ–W#×·Ò—°¢6öç7BVçF—G”–CÕ7G&–ær†VçF—G“òæ–GÇÂrr“¶–b‚VçF—G”–GÇÂÆ–W#òævVöw&†–4÷&–v–ä–B—&WGW&âfÇ6S°¢6öç7B66W73ÖvVöw&†–4÷&–v–ä66W75vV%cc‡Æ–W"“°¢–b„æFFçÆæWG2æ†2†VçF—G”–B’bf66W72çÆæWD–G2æ†2†VçF—G”–B’—&WGW&âG'VS°¢&WGW&â&ööÆVâ„æFFç7—7FV×2ç6öÖR‡7—7FVÓÓå7G&–ær‡7—7FVÒæ–GÇÂrr“ÓÓÖVçF—G”–B’bf66W72ç7—7FVÔ–G2æ†2†VçF—G”–B’“°¢Ð¢gVæ7F–öâWfÇVFUf—6–&–Æ—G•vV%cƒ‚†VçF—G’ÇÆ–W$–CÔç6W76–öãòçW6W$–GÇÂrr—°¢–b‚VçF—G’—&WGW&âfÇ6S°¢6öç7BÆ–W#ÔæFFçÆ–W'2ævWB…7G&–ær‡Æ–W$–GÇÂrr’—ÇÆçVÆÂÇ&öÆSÕ7G&–ær‡Æ–W#òç&öÆWÇÄç6W76–öãòç&öÆWÇÂrr’çFôÆ÷vW$66R‚“°¢–b‡&öÆSÓÓÒvvÒr—&WGW&âG'VS°¢–b‚VçF—G’çf—6–&–Æ—G—ÇÇG—VöbVçF—G’çf—6–&–Æ—G’ÓÒvö&¦V7Br—&WGW&âG'VS°¢6öç7B66÷S×f—6–&–Æ—G•66÷UvV%cƒ‚†VçF—G’“¶–b‚66÷RçÆ–W$–G2æÆVæwF‚bb66÷Ræ6×–vä–G2æÆVæwF‚bb66÷RæW&–G2æÆVæwF‚—&WGW&âfÇ6S°¢6öç7B–CÕ7G&–ær‡Æ–W$–GÇÂrr“¶–b‡66÷RçÆ–W$–G2æ–æ6ÇVFW2†–B’—&WGW&âG'VS°¢–b‡&öÆSÓÓÒvwVW7BwÇÆ—4wVW7E6W76–öâ‚’—&WGW&â66÷RçÆ–W$–G2æ–æ6ÇVFW2„uTU5Eô”B—ÇÇ66÷RçÆ–W$–G2æ–æ6ÇVFW2‚vwVW7Br“°¢–b‡Æ–W"bf÷&–v–äw&çG5f—6–&–Æ—G•vV%cƒ‚†VçF—G’ÇÆ–W"’—&WGW&âG'VS°¢6öç7B6×–vä–G3ÖæWr6WB‡Æ–W#ö6×–vä–G4f÷%Æ–W"‡Æ–W"“¥µÒ“¶–b‡66÷Ræ6×–vä–G2ç6öÖR‡fÇVSÓæ6×–vä–G2æ†2…7G&–ær‡fÇVR’’’—&WGW&âG'VS°¢–b‚66÷RæW&–G2æÆVæwF‚—&WGW&âfÇ6S°¢6öç7B7F—fTW&Ö6×–våf—6–&–Æ—G”W&vV%cƒ‚†7F—fT6×–väf÷%f—6–&–Æ—G•vV%cƒ‚‡Æ–W'ÇÇ·Ò’“·&WGW&â&ööÆVâ†7F—fTW&bg66÷RæW&–G2æ–æ6ÇVFW2†7F—fTW&’“°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦TVçF—G•f—6–&–Æ—G•vV%cƒ‚†VçF—G’—¶–b†VçF—G“òçf—6–&–Æ—G’bgG—VöbVçF—G’çf—6–&–Æ—G“ÓÓÒvö&¦V7Br–VçF—G’çf—6–&–Æ—G“×f—6–&–Æ—G•66÷UvV%cƒ‚†VçF—G’“·&WGW&âVçF—G“·Ð¢gVæ7F–öâæ÷&ÖÆ—¦Uf—6–&–Æ—G•7F÷&UvV%cƒ‚‡7F÷&R—°¢–b‡7F÷&R–ç7Fæ6VöbÖ—·7F÷&Ræf÷$V6‚†æ÷&ÖÆ—¦TVçF—G•f—6–&–Æ—G•vV%cƒ‚“·&WGW&ã·Ð¢–b„'&’æ—4'&’‡7F÷&R’—·7F÷&Ræf÷$V6‚†æ÷&ÖÆ—¦TVçF—G•f—6–&–Æ—G•vV%cƒ‚“·&WGW&ã·Ð¢–b‡7F÷&RbgG—Vöb7F÷&SÓÓÒvö&¦V7Br”ö&¦V7BçfÇVW2‡7F÷&R’æf÷$V6‚†æ÷&ÖÆ—¦TVçF—G•f—6–&–Æ—G•vV%cƒ‚“°¢Ð¢6öç7B6ö×–ÆTFF&Vf÷&TW&f—6–&–Æ—G•vV%cƒƒÖ6ö×–ÆTFF°¢6ö×–ÆTFFÖgVæ7F–öâ‚ââæ&w2—°¢6öç7B&W7VÇCÖ6ö×–ÆTFF&Vf÷&TW&f—6–&–Æ—G•vV%cƒ‚‚ââæ&w2“°¢´æFFç7—7FV×2ÄæFFçÆæWG2ÄæFFæ'F–6ÆW2ÄæFFæ'F–6ÆTÆ—7BÄæFFææWw4Æ—7BÄæFFçF6·4Æ—7BÄæFFæç72ÄæFFæfÆ÷&ÄæFFæfVæÄæFFæ—FV×2ÄæFFç6¶–ÆÇ2ÄæFFæf7F–öç2ÄæFFæ÷&væ—¦F–öç2ÄæFFç6ö6–Ä÷&–v–ç2ÄæFFævVöw&†–4÷&–v–ç5Òæf÷$V6‚†æ÷&ÖÆ—¦Uf—6–&–Æ—G•7F÷&UvV%cƒ‚“°¢&WGW&â&W7VÇC°¢Ó°¢f—6–&ÆTf÷%Æ–W#ÖWfÇVFUf—6–&–Æ—G•vV%cƒƒ°¢v–æF÷räu%uf—6–&–Æ—G•cƒƒÔö&¦V7Bæg&VW¦R‡¶WfÇVFS¦WfÇVFUf—6–&–Æ—G•vV%cƒ‚Ç66÷S§f—6–&–Æ—G•66÷UvV%cƒ‚Ææ÷&ÖÆ—¦TW&¦æ÷&ÖÆ—¦Uf—6–&–Æ—G”W&vV%cƒ‚Æ7F—fT6×–vã¦7F—fT6×–väf÷%f—6–&–Æ—G•vV%cƒ‡Ò“° ¢7–æ2gVæ7F–öâ&WF—&U&VÖ÷fVEvV$æ÷F–f–6F–öç5c“"‚—°¢G'—°¢f÷"†ÆWB–æFWƒ×v–æF÷ræÆö6Å7F÷&vRæÆVæwF‚Ó¶–æFWƒãÓ¶–æFW‚ÓÓ—°¢6öç7B¶W“Õ7G&–ær‡v–æF÷ræÆö6Å7F÷&vRæ¶W’†–æFW‚—ÇÂrr“°¢–b†¶W’ç7F'G5v—F‚‚vw'rçvV"ææ÷F–f–6F–öç2çc“¢r’—v–æF÷ræÆö6Å7F÷&vRç&VÖ÷fT—FVÒ†¶W’“°¢Ð¢Ö6F6‡·Ð¢–b‚‚w6W'f–6Uv÷&¶W"v–âæf–vF÷"’—&WGW&ã°¢G'—°¢6öç7B&Vv—7G&F–öç3Öv—Bæf–vF÷"ç6W'f–6Uv÷&¶W"ævWE&Vv—7G&F–öç2‚“°¢v—B&öÖ—6RæÆÂ‡&Vv—7G&F–öç2æf–ÇFW"‡&Vv—7G&F–öãÓç°¢6öç7BW&Ç3Õ·&Vv—7G&F–öâæ–ç7FÆÆ–æsòç67&—EU$ÂÇ&Vv—7G&F–öâçv—F–æsòç67&—EU$ÂÇ&Vv—7G&F–öâæ7F—fSòç67&—EU$ÅÒæf–ÇFW"„&ööÆVâ“°¢&WGW&âW&Ç2ç6öÖR‡W&ÃÓå7G&–ær‡W&Â’æ–æ6ÇVFW2‚röæ÷F–f–6F–öâ×7ræ§2r’“°¢Ò’æÖ†7–æ2&Vv—7G&F–öãÓç°¢G'—¶6öç7B6†÷vãÖv—B&Vv—7G&F–öâævWDæ÷F–f–6F–öç2‚“·6†÷vâæf÷$V6‚†æ÷F–f–6F–öãÓææ÷F–f–6F–öâæ6Æ÷6R‚’“·Ö6F6‡·Ð¢v—B&Vv—7G&F–öâçVç&Vv—7FW"‚“°¢Ò’“°¢Ö6F6‡·Ð¢Ð ¢ò¢cãã#"(	BFW6·F÷×&—G’–çfVçF÷'’ÂWV—ÖVçBÂ–×ÆçG2æB&VF&ÆRÖöF–f–W'2¢ð¢6öç7BtT#…õD$tUE3×·7G&VæwFƒ¢}
½rÆFW‡FW&—G“¢}	½í-­í-ÂrÆVæGW&æ6S¢}	-½Ýí½-í-ÂrÆ–çFVÆÆ–vVæ6S¢}	Ý-]½½]­"rÇv–ÆÃ¢}	-í½òrÆvÆ÷'“¢}
½-rÆÖ…ö‡¢}	Í­Í½ÍÝíR…rÆ&Ö÷%ö6Æ73¢}	­½íÝ‚rÆFVfVç6S¢}	}-rÆ–æ—F–F—fUö&öçW3¢}	Ým--rÆÖ÷fVÖVçC¢}	M-m]ÝRrÇf—6–öã¢}	í}írÆ–çfVçF÷'•÷6Æ÷G3¢}
ý}]­‚Ý-]Ý-òrÆ6''•ö66—G“¢}	ý]]ÝíÍ½’-]rÆ–×ÆçE÷6Æ÷G3¢}
½í-²Íý½Ý-í"rÇ6ö6–Åö&öçW3¢}
ím½ÍÝ½’íÝ=rÆGF6µö&öçW3¢}	ýíýMÝRrÆFÖvUö&öçW3¢}
=íÒrÇvVöåö†—E÷7FC¢}
]­-]-­ýíýMÝòrÇvVöåö†—EöW‡G&÷7FC¢}	Míýí½Ý-]½ÍÝò]­-]-­ýíýMÝòwÓ°¢6öç7BtT#…õ5DE3×·7G&VæwFƒ¢}
½rÆFW‡FW&—G“¢}	½í-­í-ÂrÆVæGW&æ6S¢}	-½Ýí½-í-ÂrÆ–çFVÆÆ–vVæ6S¢}	Ý-]½½]­"rÇv–ÆÃ¢}	-í½òrÆvÆ÷'“¢}
½-wÓ°¢6öç7BtT#…õtTôåõ5DE3×¶Æ–v‡C¢vFW‡FW&—G’rÆ†Vg“¢vVæGW&æ6RrÆVæW&w“¢v–çFVÆÆ–vVæ6RrÆÖVÆVS¢vFW‡FW&—G’wÓ°¢gVæ7F–öâ6–væVEvV#‚‡fÇVR—¶6öç7BãÔçVÖ&W"‡fÇVWÇÃ“·&WGW&æG¶ããÓòr²s¢rwÒG´çVÖ&W"æ—4–çFVvW"†â“öã¦âçFôf—†VBƒ—Ö·Ð¢gVæ7F–öâæ÷&ÖÆ—¦T—FVÕvV#‚‡&s×·Ò—°¢6öç7B—FVÓÖFVW‡&wÇÇ·Ò’ÇG—SÕ7G&–ær†—FVÒçG—WÇÂvvV"r’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢–b…²vÖ×Væ—F–öârÂ}ý-íÝ²rÂ}í]ýý²uÒæ–æ6ÇVFW2‡G—R’–—FVÒçG—SÒvÖÖòs°¢VÇ6R–b…²v&6·6²rÂ}í­}¢rÂ}í­}­‚uÒæ–æ6ÇVFW2‡G—R’–—FVÒçG—SÒv&6·6²s°¢—FVÒæÖÖõG—T–CÕ7G&–ær†—FVÒæÖÖõG—T–GÇÆ—FVÒæÖ×Væ—F–öä–GÇÂrr“°¢—FVÒæÖv¦–æU6—¦SÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†—FVÒæÖv¦–æU6—¦Sóö—FVÒæ6Æ—6—¦Sóó—ÇÃ’“°¢—FVÒæÖÖõW%6†÷CÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†—FVÒæÖÖõW%6†÷Cóö—FVÒç&÷VæG5W%6†÷Cóó—ÇÃ’“°¢—FVÒç&–Df—&U6†÷G3ÔÖF‚æÖ‚ƒÄÖF‚æÖ–âƒ2ÄÖF‚çG'Væ2„çVÖ&W"†—FVÒç&–Df—&U6†÷G3óö—FVÒæ'W'7E6†÷G3óó—ÇÃ’’“°¢—FVÒçvVöå6¶–ÆÄ–CÕ7G&–ær†—FVÒçvVöå6¶–ÆÄ–GÇÂrr“¶—FVÒçvVöå6¶–ÆÄ&öçW3ÔçVÖ&W"†—FVÒçvVöå6¶–ÆÄ&öçW7ÇÃ“°¢—FVÒæ&Ö÷%vV–v‡D6Æ73Õ7G&–ær†—FVÒæ&Ö÷%vV–v‡D6Æ77ÇÂvÆ–v‡Br“ÓÓÒv†Vg’sòv†Vg’s¢vÆ–v‡Bs¶—FVÒæ†Vg”&Ö÷#Ö—FVÒæ&Ö÷%vV–v‡D6Æ73ÓÓÒv†Vg’wÇÆ—FVÒæ†Vg”&Ö÷#ÓÓ×G'VS°¢—FVÒç6†–VÆD6÷fW$&öçW3ÔÖF‚æÖ‚ƒÄçVÖ&W"†—FVÒç6†–VÆD6÷fW$&öçW7ÇÃ’“¶—FVÒç6†–VÆDFW‡FW&—G”6Õ7G&–ær†—FVÒç6†–VÆDFW‡FW&—G”6óòrr’çG&–Ò‚“ÓÓÒrsöçVÆÃ¤ÖF‚æÖ‚ƒÄçVÖ&W"†—FVÒç6†–VÆDFW‡FW&—G”6—ÇÃ“°¢—FVÒæÖöF–f–W'3Ò„'&’æ—4'&’†—FVÒæÖöF–f–W'2“ö—FVÒæÖöF–f–W'3¥µÒ’æf–ÇFW"†ÖöCÓæÖöBbfÖöBçF&vWB’æÖ†ÖöCÓâ‡²ââæÖöBÆVæ&ÆVC¦ÖöBæVæ&ÆVBÓÖfÇ6WÒ’“°¢–b†—FVÒçG—SÓÓÒvÖÖòr—°¢—FVÒç7F6¶&ÆS×G'VS¶—FVÒç7F6´Æ–Ö—CÔÖF‚æÖ‚ƒ"ÄÖF‚çG'Væ2„çVÖ&W"†—FVÒç7F6´Æ–Ö—GÇÃ““’’’“¶—FVÒçFW‡DöæÇ”–çfVçF÷'“ÖfÇ6S°¢—FVÒæÖ73ÔÖF‚æÖ‚ƒÄçVÖ&W"†—FVÒæÖ73óóã"—ÇÃ“¶—FVÒæ–çfVçF÷'•v–GFƒÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†—FVÒæ–çfVçF÷'•v–GF‡ÇÃ’’“¶—FVÒæ–çfVçF÷'”†V–v‡CÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†—FVÒæ–çfVçF÷'”†V–v‡GÇÃ’’“°¢ÖVÇ6W¶—FVÒç7F6¶&ÆSÖfÇ6S¶—FVÒç7F6´Æ–Ö—CÓ·Ð¢&WGW&â—FVÓ°¢Ð¢6öç7Bæ÷&ÖÆ—¦VD—FVÕG—T&Vf÷&SƒÖæ÷&ÖÆ—¦VD—FVÕG—UcS#°¢æ÷&ÖÆ—¦VD—FVÕG—UcS#ÖgVæ7F–öâ†—FVÓ×·Ò—¶6öç7BG—SÕ7G&–ær†—FVÒçG—WÇÂrr’çFôÆ÷vW$66R‚“¶–b…²vÖÖòrÂvÖ×Væ—F–öârÂ}ý-íÝ²rÂ}í]ýý²uÒæ–æ6ÇVFW2‡G—R’—&WGW&âvÖÖòs¶–b…²v&6·6²rÂ}í­}¢rÂ}í­}­‚uÒæ–æ6ÇVFW2‡G—R’—&WGW&âv&6·6²s·&WGW&âæ÷&ÖÆ—¦VD—FVÕG—T&Vf÷&S‚†—FVÒ“·Ó°¢—FVÕvV%ccsÖgVæ7F–öâ†—FVÔ–B—¶6öç7B—FVÓÔæFFæ—FV×2ævWB…7G&–ær†—FVÔ–GÇÂrr’“·&WGW&â—FVÓöæ÷&ÖÆ—¦T—FVÕvV#‚†—FVÒ“§¶–C¥7G&–ær†—FVÔ–GÇÂrr’ÆæÖS¥7G&–ær†—FVÔ–GÇÂrr’ÇG—S¢vvV"rÆÖ73£Æ–çfVçF÷'•v–GFƒ£Æ–çfVçF÷'”†V–v‡C£ÆÖöF–f–W'3¥µ×Ó·Ó° ¢gVæ7F–öâÖöF–f–W$6öæF—F–öåvV#‚†ÖöBÇÆ–W"Æ6öçFW‡C×·Ò—°¢–b†ÖöCòæVæ&ÆVCÓÓÖfÇ6R—&WGW&âfÇ6S¶6öç7B6öæF—F–öãÕ7G&–ær†ÖöCòæ6öæF—F–öçÇÂvÇv—2r“°¢–b†6öæF—F–öãÓÓÒvÇv—2wÇÂ6öæF—F–öâ—&WGW&âG'VS°¢–b†6öæF—F–öãÓÓÒv–åö6öÖ&Br—&WGW&â6öçFW‡Bæ–ä6öÖ&CÓÓ×G'VS°¢–b†6öæF—F–öãÓÓÒv†5÷6¶–ÆÂr—&WGW&â‡Æ–W"ç6¶–ÆÇ7ÇÅµÒ’æÖ…7G&–ær’æ–æ6ÇVFW2…7G&–ær†ÖöBæ6öæF—F–öåfÇVWÇÂrr’“°¢–b†6öæF—F–öãÓÓÒv—FVÕöWV—VBr—¶6öç7B–CÕ7G&–ær†ÖöBæ6öæF—F–öåfÇVWÇÂrr“·&WGW&âö&¦V7BçfÇVW2‡Æ–W"æWV—ÖVçE6Æ÷G7ÇÇ·Ò’æÖ…7G&–ær’æ–æ6ÇVFW2†–B—ÇÂ‡Æ–W"æ–×ÆçE6Æ÷G7ÇÅµÒ’æÖ…7G&–ær’æ–æ6ÇVFW2†–B“·Ð¢–b†6öæF—F–öãÓÓÒv‡ö&VÆ÷u÷W&6VçBr—¶6öç7BÖƒÔÖF‚æÖ‚ƒÄçVÖ&W"‡Æ–W"ç7FG3òæ‡Ö‡ÇÃ’“·&WGW&âçVÖ&W"‡Æ–W"ç7FG3òæ‡7W'&VçCóöÖ‚’öÖ‚£ÄçVÖ&W"†ÖöBæ6öæF—F–öåfÇVWÇÃS“·Ð¢–b†6öæF—F–öãÓÓÒv–æ6öÖ–æu÷vVöåö6FVv÷'’r—&WGW&â7G&–ær†6öçFW‡Bæ–æ6öÖ–æuvVöä6FVv÷'—ÇÂrr“ÓÓÕ7G&–ær†ÖöBæ6öæF—F–öåfÇVWÇÂrr“°¢&WGW&âG'VS°¢Ð¢gVæ7F–öâÖöF–f–W%66÷UvV#‚†ÖöBÆ6öçFW‡C×·Ò—¶–b…7G&–ær†ÖöCòç66÷WÇÂvvÆö&Âr“ÓÓÒwvVöåö–Br—&WGW&â7G&–ær†6öçFW‡BçvVöä–GÇÂrr“ÓÓÕ7G&–ær†ÖöBç66÷UfÇVWÇÂrr“¶–b…7G&–ær†ÖöCòç66÷WÇÂvvÆö&Âr“ÓÓÒwvVöåö6FVv÷'’r—&WGW&â7G&–ær†6öçFW‡BçvVöä6FVv÷'—ÇÂrr“ÓÓÕ7G&–ær†ÖöBç66÷UfÇVWÇÂrr“·&WGW&âG'VS·Ð¢gVæ7F–öâÖöF–f–W%6÷W&6W5vV#‚‡Æ–W#×·Ò—°¢6öç7B&÷w3ÕµÒÇW6ƒÒ‡6÷W&6RÆ¶–æB“Óç¶–b‚6÷W&6R—&WGW&ã²‡6÷W&6RæÖöF–f–W'7ÇÅµÒ’æf÷$V6‚†ÖöCÓç&÷w2çW6‚‡²ââæÖöBÇ6÷W&6TæÖS§6÷W&6RææÖWÇÇ6÷W&6RæF—7Æ”æÖWÇÇ6÷W&6Ræ–GÇÆ¶–æBÇ6÷W&6T¶–æC¦¶–æGÒ’“¶–b…²w&öfW76–öârÂv÷&–v–âuÒæ–æ6ÇVFW2†¶–æB’bg6÷W&6Ræ&–Æ—G”&öçW6W2”ö&¦V7BæVçG&–W2‡6÷W&6Ræ&–Æ—G”&öçW6W2’æf÷$V6‚‚…·F&vWBÇfÇVUÒ“Óç¶–b„çVÖ&W"‡fÇVWÇÃ’—&÷w2çW6‚‡·F&vWBÆ÷¢vFBrÇfÇVS¤çVÖ&W"‡fÇVR’Ç66÷S¢vvÆö&ÂrÆ6öæF—F–öã¢vÇv—2rÆVæ&ÆVC§G'VRÇ6÷W&6TæÖS§6÷W&6RææÖWÇÇ6÷W&6Ræ–GÇÆ¶–æBÇ6÷W&6T¶–æC¦¶–æGÒ“·Ò“¶–b†¶–æCÓÓÒvWV—ÖVçBrbfæ÷&ÖÆ—¦VD—FVÕG—UcS"‡6÷W&6R“ÓÓÒv&Ö÷"r—¶–b‚‡6÷W&6RæÖöF–f–W'7ÇÅµÒ’ç6öÖR†ÖöCÓæÖöBçF&vWCÓÓÒv&Ö÷%ö6Æ72r’bdçVÖ&W"‡6÷W&6Ræ&Ö÷$6Æ77ÇÃ’—¶6öç7BÆVv7“ÔçVÖ&W"‡6÷W&6Ræ&Ö÷$6Æ72’Æ&öçW3ÖÆVv7“ãÓSöÆVv7’Ó¦ÆVv7“¶–b†&öçW2—&÷w2çW6‚‡·F&vWC¢v&Ö÷%ö6Æ72rÆ÷¢vFBrÇfÇVS¦&öçW2Ç66÷S¢vvÆö&ÂrÆ6öæF—F–öã¢vÇv—2rÆVæ&ÆVC§G'VRÇ6÷W&6TæÖS§6÷W&6RææÖWÇÇ6÷W&6Ræ–GÇÆ¶–æBÇ6÷W&6T¶–æC¦¶–æGÒ“·Ö–b‚‡6÷W&6RæÖöF–f–W'7ÇÅµÒ’ç6öÖR†ÖöCÓæÖöBçF&vWCÓÓÒvFVfVç6Rr’bdçVÖ&W"‡6÷W&6RæFÖvU&VGV7F–öãó÷6÷W&6RæFVfVç6Sóó“ã—&÷w2çW6‚‡·F&vWC¢vFVfVç6RrÆ÷¢vFBrÇfÇVS¤çVÖ&W"‡6÷W&6RæFÖvU&VGV7F–öãó÷6÷W&6RæFVfVç6R’Ç66÷S¢vvÆö&ÂrÆ6öæF—F–öã¢vÇv—2rÆVæ&ÆVC§G'VRÇ6÷W&6TæÖS§6÷W&6RææÖWÇÇ6÷W&6Ræ–GÇÆ¶–æBÇ6÷W&6T¶–æC¦¶–æGÒ“·×Ó°¢W6‚‡Æ–W"Âv6†&7FW"r“·W6‚„æFFç6ö6–Ä÷&–v–ç3òævWCòâ…7G&–ær‡Æ–W"ç6ö6–Ä÷&–v–ä–GÇÂrr’’Âw&öfW76–öâr“·W6‚„æFFævVöw&†–4÷&–v–ç3òævWCòâ…7G&–ær‡Æ–W"ævVöw&†–4÷&–v–ä–GÇÂrr’’Âv÷&–v–âr“°¢‡Æ–W"ç6¶–ÆÇ7ÇÅµÒ’æf÷$V6‚†–CÓçW6‚„æFFç6¶–ÆÇ2ævWB…7G&–ær†–B’’Âw6¶–ÆÂr’“°¢6öç7B6Æ÷G3×Æ–W"æWV—ÖVçE6Æ÷G7ÇÇ·Óµ²w&–Ö'•vVöârÂw6V6öæF'•vVöârÂv&Ö÷"rÂv&6·6²uÒæf÷$V6‚†¶W“ÓçW6‚†—FVÕvV%ccr‡6Æ÷G5¶¶W•Ò’ÂvWV—ÖVçBr’“°¢‡Æ–W"æ–×ÆçE6Æ÷G7ÇÇÆ–W"æ–ç7FÆÆVD–×ÆçD–G7ÇÅµÒ’æf÷$V6‚†–CÓçW6‚†—FVÕvV%ccr†–B’Âv–×ÆçBr’“°¢&WGW&â&÷w2æf–ÇFW"†ÖöCÓæÖöF–f–W$6öæF—F–öåvV#‚†ÖöBÇÆ–W"’“°¢Ð¢gVæ7F–öâÇ”ÖöF–f–W%vV#‚†&6RÇF&vWBÆÖöG2ÇÆ–W"Æ6öçFW‡C×·Ò—°¢ÆWBfÇVSÔçVÖ&W"†&6WÇÃ“¶6öç7BÖF6†–æsÖÖöG2æf–ÇFW"†ÖöCÓå7G&–ær†ÖöBçF&vWB“ÓÓ×F&vWBbfÖöF–f–W%66÷UvV#‚†ÖöBÆ6öçFW‡B’’ç6÷'B‚†Æ"“ÓäçVÖ&W"†ç&–÷&—G—ÇÃ’ÔçVÖ&W"†"ç&–÷&—G—ÇÃ’“°¢f÷"†6öç7BÖöBöbÖF6†–ær—¶–b†ÖöBæ÷ÓÓÒw6WBr—fÇVSÔçVÖ&W"†ÖöBçfÇVWÇÃ“¶VÇ6R–b†ÖöBæ÷ÓÓÒvFBwÇÂÖöBæ÷—fÇVR³ÔçVÖ&W"†ÖöBçfÇVWÇÃ“¶VÇ6R–b†ÖöBæ÷ÓÓÒw&WÆ6U÷7FBrbfÖöBç7FE&Vb—fÇVSÔçVÖ&W"†6öçFW‡Bæ&–Æ—F–W3òå¶ÖöBç7FE&Ve×ÇÃ’¤çVÖ&W"†6öçFW‡Bç7FE66ÆWÇÃ“¶VÇ6R–b†ÖöBæ÷ÓÓÒvFE÷7FBrbfÖöBç7FE&Vb—fÇVR³ÔçVÖ&W"†6öçFW‡Bæ&–Æ—F–W3òå¶ÖöBç7FE&Ve×ÇÃ’¤çVÖ&W"†6öçFW‡Bç7FE66ÆWÇÃ“·Ð¢&WGW&âfÇVS°¢Ð¢gVæ7F–öâÇ”f÷&×VÆvV#‚‡7FF–4&6RÆFVfVÇE7FBÇF&vWBÆÖöG2Æ6öçFW‡C×·ÒÇ66ÆSÓ—°¢6öç7BÖF6†–æsÖÖöG2æf–ÇFW"†ÖöCÓå7G&–ær†ÖöBçF&vWB“ÓÓ×F&vWBbfÖöF–f–W%66÷UvV#‚†ÖöBÆ6öçFW‡B’’ç6÷'B‚†Æ"“ÓäçVÖ&W"†ç&–÷&—G—ÇÃ’ÔçVÖ&W"†"ç&–÷&—G—ÇÃ’“°¢6öç7B&WÆ6VÖVçCÖÖF6†–æræf–ÇFW"†ÖöCÓæÖöBæ÷ÓÓÒw&WÆ6U÷7FBrbfÖöBç7FE&Vb’æB‚Ó’Ç7FC×&WÆ6VÖVçCòç7FE&VgÇÆFVfVÇE7FC°¢ÆWBfÇVSÔçVÖ&W"‡7FF–4&6WÇÃ’²‡7FCôçVÖ&W"†6öçFW‡Bæ&–Æ—F–W3òå·7FE×ÇÃ’§66ÆS£“°¢f÷"†6öç7BÖöBöbÖF6†–ær—¶–b†ÖöBæ÷ÓÓÒvFE÷7FBrbfÖöBç7FE&Vb—fÇVR³ÔçVÖ&W"†6öçFW‡Bæ&–Æ—F–W3òå¶ÖöBç7FE&Ve×ÇÃ’§66ÆS¶VÇ6R–b†ÖöBæ÷ÓÓÒvFBwÇÂÖöBæ÷—fÇVR³ÔçVÖ&W"†ÖöBçfÇVWÇÃ“¶VÇ6R–b†ÖöBæ÷ÓÓÒw6WBr—fÇVSÔçVÖ&W"†ÖöBçfÇVWÇÃ“·Ð¢&WGW&âfÇVS°¢Ð¢gVæ7F–öâFW&—fVEÆ–W%vV#‚‡Æ–W#×·Ò—°¢6öç7B&6T&–Æ—F–W3×Æ–W"æ&–Æ—G”&6RbgG—VöbÆ–W"æ&–Æ—G”&6SÓÓÒvö&¦V7Bs÷Æ–W"æ&–Æ—G”&6S¢‡Æ–W"æ&–Æ—F–W7ÇÇ·Ò’ÆÖöG3ÖÖöF–f–W%6÷W&6W5vV#‚‡Æ–W"’Æ&–Æ—F–W3×·Ó°¢ö&¦V7Bæ¶W—2…tT#…õ5DE2’æf÷$V6‚†¶W“Óç¶&–Æ—F–W5¶¶W•ÓÔÖF‚æÖ‚ƒÆÇ”ÖöF–f–W%vV#‚„çVÖ&W"†&6T&–Æ—F–W5¶¶W•×ÇÃ’Æ¶W’ÆÖöG2ÇÆ–W"Ç¶&–Æ—F–W7Ò’“·Ò“°¢6öç7B&6S×Æ–W"æ&6U7FG7ÇÇ·Ó°¢6öç7B–çfVçF÷'•6Æ÷G3ÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2†Ç”ÖöF–f–W%vV#‚„çVÖ&W"†&6Ræ–çfVçF÷'•6Æ÷G3ó÷Æ–W"æ–çfVçF÷'”&6U6Æ÷G3ó÷Æ–W"æ–çfVçF÷'•6—¦Sóó"’Âv–çfVçF÷'•÷6Æ÷G2rÆÖöG2ÇÆ–W"Ç¶&–Æ—F–W7Ò’’“°¢6öç7B6''”66—G“ÔÖF‚æÖ‚ƒÆÇ”f÷&×VÆvV#‚„çVÖ&W"†&6Ræ6''”&6Só÷Æ–W"æ6''”&6Sóó"’Âw7G&VæwF‚rÂv6''•ö66—G’rÆÖöG2Ç¶&–Æ—F–W7ÒÃ"’“°¢6öç7B–×ÆçE6Æ÷G3ÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2†Ç”ÖöF–f–W%vV#‚„çVÖ&W"†&6Ræ–×ÆçE6Æ÷G3ó÷Æ–W"æ&6T–×ÆçE6Æ÷G3ó÷Æ–W"æ–×ÆçE6Æ÷D6÷VçCóó’Âv–×ÆçE÷6Æ÷G2rÆÖöG2ÇÆ–W"Ç¶&–Æ—F–W7Ò’’“°¢6öç7B&Ö÷$6Æ73ÖÇ”f÷&×VÆvV#‚„çVÖ&W"†&6Ræ&Ö÷$6Æ73ó÷Æ–W"æ&6T&Ö÷$6Æ74&öçW3óó’ÂvFW‡FW&—G’rÂv&Ö÷%ö6Æ72rÆÖöG2Ç¶&–Æ—F–W7ÒÃ“°¢6öç7BFVfVç6SÔÖF‚æÖ‚ƒÆÇ”ÖöF–f–W%vV#‚„çVÖ&W"†&6RæFVfVç6Só÷Æ–W"æ&6TFVfVç6Sóó’ÂvFVfVç6RrÆÖöG2ÇÆ–W"Ç¶&–Æ—F–W7Ò’“°¢6öç7Bf—6–öãÔÖF‚æÖ‚ƒÆÇ”ÖöF–f–W%vV#‚„çVÖ&W"†&6Rçf—6–öãó÷Æ–W"æ&6Uf—6–öãó÷Æ–W"æ6öÖ&Còçf—6–öå&ævSóób’Âwf—6–öârÆÖöG2ÇÆ–W"Ç¶&–Æ—F–W7Ò’“°¢6öç7BÖ÷fVÖVçCÔÖF‚æÖ‚ƒÆÇ”ÖöF–f–W%vV#‚„çVÖ&W"†&6RæÖ÷fVÖVçCó÷Æ–W"æ&6TÖ÷fVÖVçCó÷Æ–W"æ6öÖ&CòæÖ÷fU&ævSóób’ÂvÖ÷fVÖVçBrÆÖöG2ÇÆ–W"Ç¶&–Æ—F–W7Ò’“°¢&WGW&ç¶&–Æ—F–W2ÆÖöG2Æ–çfVçF÷'•6Æ÷G2Æ6''”66—G’Æ–×ÆçE6Æ÷G2Æ&Ö÷$6Æ72ÆFVfVç6RÇf—6–öâÆÖ÷fVÖVçGÓ°¢Ð¢gVæ7F–öâ÷væVD6÷VçEvV#‚‡Æ–W"Æ—FVÔ–B—·&WGW&âÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"‚‡Æ–W"æ–çfVçF÷'—ÇÅµÒ’æf–æB‡&÷sÓå7G&–ær‡&÷ræ—FVÔ–B“ÓÓÕ7G&–ær†—FVÔ–B’“òçG—ÇÃ’’“·Ð¢æ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccsÖgVæ7F–öâ‡Æ–W#×·Ò—°¢6öç7BæW‡CÖFVW‡Æ–W'ÇÇ·Ò“¶æW‡Bæ–çfVçF÷'“Ò„'&’æ—4'&’†æW‡Bæ–çfVçF÷'’“öæW‡Bæ–çfVçF÷'“¥µÒ’æÖ†æ÷&ÖÆ—¦T–çfVçF÷'”VçG'•vV%ccr’æf–ÇFW"†VçG'“ÓæVçG'’æ—FVÔ–BbfVçG'’çG“ã“°¢æW‡BæWV—ÖVçE6Æ÷G3×·&–Ö'•vVöã¢rrÇ6V6öæF'•vVöã¢rrÆ&Ö÷#¢rrÆ&6·6³¢rrÂâââ†æW‡BæWV—ÖVçE6Æ÷G7ÇÇ·Ò—Ó°¢6öç7BÆVv7“Ô'&’æ—4'&’†æW‡Bæ–×ÆçE6Æ÷G2“öæW‡Bæ–×ÆçE6Æ÷G3¢„'&’æ—4'&’†æW‡Bæ–ç7FÆÆVD–×ÆçD–G2“öæW‡Bæ–ç7FÆÆVD–×ÆçD–G3¥µÒ’ÇW6VCÖæWrÖ‚“°¢6öç7B÷væVD–×ÆçG3ÖÆVv7’æÖ‡fÇVSÓç¶6öç7B–CÕ7G&–ær‡fÇVWÇÂrr“¶–b‚–GÇÆæ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÕvV%ccr†–B’’ÓÒv–×ÆçBr—&WGW&ârs¶6öç7B6÷VçCÒ‡W6VBævWB†–B—ÇÃ’³·W6VBç6WB†–BÆ6÷VçB“·&WGW&â÷væVD6÷VçEvV#‚†æW‡BÆ–B“ãÖ6÷VçCö–C¢rs·Ò“°¢æW‡Bæ–×ÆçE6Æ÷G3Ö÷væVD–×ÆçG3¶æW‡Bæ–ç7FÆÆVD–×ÆçD–G3Ö÷væVD–×ÆçG2æf–ÇFW"„&ööÆVâ“°¢6öç7BFW&—fVCÖFW&—fVEÆ–W%vV#‚†æW‡B“¶æW‡Bæ–çfVçF÷'•6—¦SÖFW&—fVBæ–çfVçF÷'•6Æ÷G3¶æW‡Bæ6''•vV–v‡DÖƒÖFW&—fVBæ6''”66—G“¶æW‡Bæ–×ÆçE6Æ÷D6÷VçCÖFW&—fVBæ–×ÆçE6Æ÷G3°¢æW‡Bæ–×ÆçE6Æ÷G3Ô'&’æg&öÒ‡¶ÆVæwFƒ¦æW‡Bæ–×ÆçE6Æ÷D6÷VçGÒÂ…òÆ–æFW‚“Óå7G&–ær†÷væVD–×ÆçG5¶–æFW…×ÇÂrr’“°¢æW‡Bæ–ç7FÆÆVD–×ÆçD–G3ÖæW‡Bæ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ“¶æW‡Bæ–×ÆçG3ÕµÓ°¢æW‡Bæ&–Æ—F–W3ÖFW&—fVBæ&–Æ—F–W3¶æW‡Bç7FG3×²âââ†æW‡Bç7FG7ÇÇ·Ò’Æ&Ö÷$6Æ73¦FW&—fVBæ&Ö÷$6Æ72ÆFVfVç6S¦FW&—fVBæFVfVç6WÓ¶æW‡Bæ6öÖ&C×²âââ†æW‡Bæ6öÖ&GÇÇ·Ò’Çf—6–öå&ævS¦FW&—fVBçf—6–öâÆÖ÷fU&ævS¦FW&—fVBæÖ÷fVÖVçGÓ¶æW‡BæFW&—fVE7FG5c3×²âââ†æW‡BæFW&—fVE7FG5c7ÇÇ·Ò’Æ&Ö÷$6Æ73¦FW&—fVBæ&Ö÷$6Æ72ÆFVfVç6S¦FW&—fVBæFVfVç6RÇf—6–öã¦FW&—fVBçf—6–öâÆÖ÷fVÖVçC¦FW&—fVBæÖ÷fVÖVçBÆ–çfVçF÷'•6Æ÷G3¦FW&—fVBæ–çfVçF÷'•6Æ÷G2Æ6''”66—G“¦FW&—fVBæ6''”66—G’Æ–×ÆçE6Æ÷G3¦FW&—fVBæ–×ÆçE6Æ÷G7Ó°¢&WGW&âæW‡C°¢Ó°¢–çfVçF÷'”6öÇ5vV%ccsÖgVæ7F–öâ‚—·&WGW&âS·Ó°¢WV—VD6÷VçG5vV%ccsÖgVæ7F–öâ‡W6W#×·Ò—¶6öç7BÖÖæWrÖ‚’ÆFCÖ–CÓç¶6öç7B¶W“Õ7G&–ær†–GÇÂrr“¶–b†¶W’–Öç6WB†¶W’Â†ÖævWB†¶W’—ÇÃ’³“·Óµ²w&–Ö'•vVöârÂw6V6öæF'•vVöârÂv&Ö÷"rÂv&6·6²uÒæf÷$V6‚†¶W“ÓæFB‡W6W"æWV—ÖVçE6Æ÷G3òå¶¶W•Ò’“²‡W6W"æ–×ÆçE6Æ÷G7ÇÅµÒ’æf÷$V6‚†FB“·&WGW&âÖ·Ó°¢6Æ÷D66WG5vV%ccsÖgVæ7F–öâ‡G—RÆ—FVÒ—¶6öç7B—FVÕG—SÖæ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÒ“¶–b‡G—SÓÓÒv&Ö÷"r—&WGW&â—FVÕG—SÓÓÒv&Ö÷"s¶–b‡G—SÓÓÒv&6·6²r—&WGW&â—FVÕG—SÓÓÒv&6·6²s¶–b‡G—SÓÓÒv–×ÆçBr—&WGW&â—FVÕG—SÓÓÒv–×ÆçBs¶–b‡G—SÓÓÒw&–Ö'•vVöâr—&WGW&â—FVÕG—SÓÓÒw6†–VÆBwÇÆ—FVÕG—SÓÓÒwvVöârbe²w&–Ö'’rÂwfW'6F–ÆRrÂruÒæ–æ6ÇVFW2…7G&–ær†—FVÒçvVöå6Æ÷GÇÂw&–Ö'’r’“¶–b‡G—SÓÓÒw6V6öæF'•vVöâr—&WGW&â—FVÕG—SÓÓÒwvVöârbe²w6V6öæF'’rÂwfW'6F–ÆRrÂruÒæ–æ6ÇVFW2…7G&–ær†—FVÒçvVöå6Æ÷GÇÂw6V6öæF'’r’“·&WGW&âfÇ6S·Ó°¢vV%6Æ÷DÆ&VÅccsÖgVæ7F–öâ‡G—RÆ–æFWƒÒÓ—·&WGW&âG—SÓÓÒw&–Ö'•vVöâsò}	íÝí-ÝíRí=mRò"s§G—SÓÓÒw6V6öæF'•vVöâsò}	--í}ÝíRí=mRs§G—SÓÓÒv&Ö÷"sò}	íÝòs§G—SÓÓÒv&6·6²sò}
í­}¢s¦	Íý½Ý"G¶–æFW‚³Ö·Ó° ¢'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccsÖgVæ7F–öâ‡&uW6W#×·Ò—°¢6öç7BW6W#Öæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡&uW6W"’Ç6—¦S×W6W"æ–çfVçF÷'•6—¦RÆ6öÇ3ÓRÆWV—VCÖWV—VD6÷VçG5vV%ccr‡W6W"’Æö67W–VCÖæWr6WB‚’Æ–ç7Fæ6W3ÕµÒÆ÷fW&fÆ÷sÕµÒÇFW‡D—FV×3ÕµÓ°¢f÷"†6öç7BVçG'’öbW6W"æ–çfVçF÷'’—°¢6öç7B—FVÓÖ—FVÕvV%ccr†VçG'’æ—FVÔ–B’ÇG“ÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†VçG'’çG—ÇÃ’’’Ç6¶—ÔÖF‚æÖ–â‡G’ÆWV—VBævWB†VçG'’æ—FVÔ–B—ÇÃ’Ç&VÖ–æ–æsÔÖF‚æÖ‚ƒÇG’×6¶—“¶–b‚&VÖ–æ–ær–6öçF–çVS°¢–b†—FVÒçFW‡DöæÇ”–çfVçF÷'“ÓÓ×G'VWÇÂ„çVÖ&W"†—FVÒæÖ77ÇÃ“ÓÓÓbdçVÖ&W"†—FVÒæ–çfVçF÷'•v–GF‡ÇÃ“ÓÓÓbdçVÖ&W"†—FVÒæ–çfVçF÷'”†V–v‡GÇÃ“ÓÓÓ’—·FW‡D—FV×2çW6‚‡¶—FVÔ–C¦VçG'’æ—FVÔ–BÆ—FVÒÇG“§&VÖ–æ–ærÆVçG'—Ò“¶6öçF–çVS·Ð¢6öç7B7£Ö—FVÕ6—¦UvV%ccr†—FVÒ’Ç7F6´Æ–Ö—CÖ—FVÒç7F6¶&ÆSÓÓ×G'VSôÖF‚æÖ‚ƒ"ÄÖF‚çG'Væ2„çVÖ&W"†—FVÒç7F6´Æ–Ö—GÇÃ“’’’“£Æ6÷VçCÖ—FVÒç7F6¶&ÆSÓÓ×G'VSôÖF‚æ6V–Â‡&VÖ–æ–ær÷7F6´Æ–Ö—B“§&VÖ–æ–æs°¢f÷"†ÆWB7F6´–æFWƒÓ·7F6´–æFWƒÆ6÷VçC·7F6´–æFW‚³Ó—¶6öç7BVæ—D–æFWƒÖ—FVÒç7F6¶&ÆSÓÓ×G'VS÷6¶—·7F6´–æFW‚§7F6´Æ–Ö—C§6¶—·7F6´–æFW‚Æ¶W“ÖG¶VçG'’æ—FVÔ–GÓ£¢G·Væ—D–æFW‡Ö¶ÆWB÷3ÖVçG'’ç÷6—F–öç3òå·Væ—D–æFW…×ÇÆVçG'’ç÷6—F–öç3òå·7F6´–æFW…×ÇÆçVÆÃ¶–b‚÷7ÇÂf—G5vV%ccr‡6—¦RÆ6öÇ2Æö67W–VBÇ÷2ç‚Ç÷2ç’Ç7¢çrÇ7¢æ‚’—÷3Öf—'7Df—EvV%ccr‡6—¦RÆ6öÇ2Æö67W–VBÇ7¢çrÇ7¢æ‚“¶6öç7B7F6µG“Ö—FVÒç7F6¶&ÆSÓÓ×G'VSôÖF‚æÖ–â‡7F6´Æ–Ö—BÇ&VÖ–æ–ær×7F6´–æFW‚§7F6´Æ–Ö—B“£Æ–ç7C×¶¶W’Æ—FVÔ–C¦VçG'’æ—FVÔ–BÇVæ—D–æFW‚Æ—FVÒÇs§7¢çrÆƒ§7¢æ‚Ç÷2ÇG“§7F6µG—Ó¶–b‡÷2—¶Ö&´ö65vV%ccr†ö67W–VBÇ÷2ç‚Ç÷2ç’Ç7¢çrÇ7¢æ‚“¶–ç7Fæ6W2çW6‚†–ç7B“·ÖVÇ6R÷fW&fÆ÷rçW6‚†–ç7B“·Ð¢Ð¢&WGW&ç·W6W"Ç6—¦RÆ6öÇ2Ç&÷w3¤ÖF‚æ6V–Â„ÖF‚æÖ‚ƒÇ6—¦R’ö6öÇ2’Æ–ç7Fæ6W2Æ÷fW&fÆ÷rÇFW‡C§FW‡D—FV×2ÇvV–v‡C¦–çfVçF÷'•vV–v‡EvV%ccr‡W6W"—Ó°¢Ó° ¢gVæ7F–öâÖöF–f–W%FW‡EvV#‚†ÖöC×·Ò—°¢6öç7BF&vWCÕtT#…õD$tUE5¶ÖöBçF&vWE×ÇÅ7G&–ær†ÖöBçF&vWGÇÂ}	ýí­}-]½Âr“¶ÆWBVffV7CÒrs°¢–b†ÖöBæ÷ÓÓÒw6WBr–VffV7CÖ=-Ýí--ÂG´çVÖ&W"†ÖöBçfÇVWÇÃ—Ö¶VÇ6R–b†ÖöBæ÷ÓÓÒw&WÆ6U÷7FBr–VffV7CÖýí½Í}í--Â*²GµtT#…õ5DE5¶ÖöBç7FE&Ve×ÇÆÖöBç7FE&VgÇÂ}]­-]-­2wÜ+¶¶VÇ6R–b†ÖöBæ÷ÓÓÒvFE÷7FBr–VffV7CÖMí--Â*²GµtT#…õ5DE5¶ÖöBç7FE&Ve×ÇÆÖöBç7FE&VgÇÂ}]­-]-­2wÜ+¶¶VÇ6RVffV7C×6–væVEvV#‚†ÖöBçfÇVR“°¢6öç7B66÷W3×·vVöåö6FVv÷'“¢}M½ò­-]=í‚í=mòrÇvVöåö–C¢}M½ò­íÝ­]-Ýí=âí=mòwÒÆ6öæF—F–öç3×¶–åö6öÖ&C¢}"í]-í’m]ÝRrÆ†5÷6¶–ÆÃ¢}ý‚Ý½}‚Ý-½­rÆ—FVÕöWV—VC¢}­í=Mý]MÍ]"Ý­ýí-ÒrÆ‡ö&VÆ÷u÷W&6VçC¢}ý‚Ý}­íÂ…rÆ–æ6öÖ–æu÷vVöåö6FVv÷'“¢}ýí-"­-]=í‚í=mòwÓ°¢&WGW&å·F&vWBÆVffV7BÇ66÷W5¶ÖöBç66÷UÓöG·66÷W5¶ÖöBç66÷U×ÒG¶ÖöBç66÷UfÇVSö*²G¶ÖöBç66÷UfÇVWÜ+¶¢rwÖ¢rrÆ6öæF—F–öç5¶ÖöBæ6öæF—F–öåÓöG¶6öæF—F–öç5¶ÖöBæ6öæF—F–öå×ÒG¶ÖöBæ6öæF—F–öåfÇVSö*²G¶ÖöBæ6öæF—F–öåfÇVWÜ+¶¢rwÖ¢ruÒæf–ÇFW"„&ööÆVâ’æ¦ö–â‚r+rr“°¢Ð¢gVæ7F–öâvVöäGF6µvV#‚‡Æ–W"Æ—FVÒ—°¢6öç7BFW&—fVCÖFW&—fVEÆ–W%vV#‚‡Æ–W"’Æ6FVv÷'“Õ7G&–ær†—FVÒçvVöä6FVv÷'—ÇÂvÆ–v‡Br’Æ6öçFW‡C×·vVöä–C¦—FVÒæ–BÇvVöä6FVv÷'“¦6FVv÷'’Æ&–Æ—F–W3¦FW&—fVBæ&–Æ—F–W7Ó¶ÆWB7FCÕtT#…õtTôåõ5DE5¶6FVv÷'•×ÇÂvFW‡FW&—G’s°¢6öç7B&WÆ6W3ÖFW&—fVBæÖöG2æf–ÇFW"†ÖöCÓæÖöBçF&vWCÓÓÒwvVöåö†—E÷7FBrbfÖöBæ÷ÓÓÒw&WÆ6U÷7FBrbfÖöBç7FE&VbbfÖöF–f–W%66÷UvV#‚†ÖöBÆ6öçFW‡B’“¶–b‡&WÆ6W2æÆVæwF‚—7FC×&WÆ6W5·&WÆ6W2æÆVæwF‚ÓÒç7FE&Vc°¢ÆWB&öçW3ÔçVÖ&W"†FW&—fVBæ&–Æ—F–W5·7FE×ÇÃ’´çVÖ&W"†—FVÒæ†—D&öçW7ÇÃ’ÆFÖvT&öçW3Ó°¢–b†—FVÒçvVöå6¶–ÆÄ–Bbb‡Æ–W"ç6¶–ÆÇ7ÇÅµÒ’æÖ…7G&–ær’æ–æ6ÇVFW2…7G&–ær†—FVÒçvVöå6¶–ÆÄ–B’’–&öçW2³ÔçVÖ&W"†—FVÒçvVöå6¶–ÆÄ&öçW7ÇÃ“°¢f÷"†6öç7BÖöBöbFW&—fVBæÖöG2æf–ÇFW"†ÖöCÓæÖöF–f–W%66÷UvV#‚†ÖöBÆ6öçFW‡B’’—¶–b†ÖöBçF&vWCÓÓÒvGF6µö&öçW2rbfÖöBæ÷ÓÒw6WBr–&öçW2³ÔçVÖ&W"†ÖöBçfÇVWÇÃ“¶–b†ÖöBçF&vWCÓÓÒvGF6µö&öçW2rbfÖöBæ÷ÓÓÒw6WBr–&öçW3ÔçVÖ&W"†ÖöBçfÇVWÇÃ“¶–b†ÖöBçF&vWCÓÓÒvFÖvUö&öçW2rbfÖöBæ÷ÓÒw6WBr–FÖvT&öçW2³ÔçVÖ&W"†ÖöBçfÇVWÇÃ“¶–b†ÖöBçF&vWCÓÓÒvFÖvUö&öçW2rbfÖöBæ÷ÓÓÒw6WBr–FÖvT&öçW3ÔçVÖ&W"†ÖöBçfÇVWÇÃ“¶–b†ÖöBçF&vWCÓÓÒwvVöåö†—EöW‡G&÷7FBrbfÖöBæ÷ÓÓÒvFE÷7FBrbfÖöBç7FE&Vb–&öçW2³ÔçVÖ&W"†FW&—fVBæ&–Æ—F–W5¶ÖöBç7FE&Ve×ÇÃ“·Ð¢&WGW&ç¶&öçW2ÆFÖvT&öçW7Ó°¢Ð¢gVæ7F–öâ—FVÔ&FvW5vV#‚†—FVÒÇÆ–W#Ö7W'&VçEÆ–W"‚’—°¢6öç7B&÷w3ÕµÒÇG—SÖæ÷&ÖÆ—¦VD—FVÕG—UcS"†—FVÒ“°¢–b‡G—SÓÓÒwvVöâr—¶6öç7BGF6³×Æ–W#÷vVöäGF6µvV#‚‡Æ–W"Æ—FVÒ“§¶&öçW3¤çVÖ&W"†—FVÒæ†—D&öçW7ÇÃ’ÆFÖvT&öçW3£Ó·&÷w2çW6‚…²}
=íÒrÆG¶—FVÒæFÖvWÇÂ~(	BwÒG¶GF6²æFÖvT&öçW3öG·6–væVEvV#‚†GF6²æFÖvT&öçW2—Ö¢rwÖÒÅ²}	ýíýMÝRrÇ6–væVEvV#‚†GF6²æ&öçW2•Ò“¶–b„çVÖ&W"†—FVÒç&ævWÇÃ“ã—&÷w2çW6‚…²}	M½ÍÝí-ÂrÆG´çVÖ&W"†—FVÒç&ævR—Ò=]­æÒ“¶–b„çVÖ&W"†—FVÒæÖv¦–æU6—¦WÇÃ“ã—¶6öç7BÆöFVC×Æ–W#òçvVöäÖv¦–æW3òå¶—FVÒæ–EÓòæÆöFVC·&÷w2çW6‚…²}	Í=}ÒrÆG¶ÆöFVCÓÖçVÆÃôçVÖ&W"†—FVÒæÖv¦–æU6—¦R“¤çVÖ&W"†ÆöFVB—ÒòG´çVÖ&W"†—FVÒæÖv¦–æU6—¦R—ÖÒ“·Ö–b„çVÖ&W"†—FVÒç&–Df—&U6†÷G7ÇÃ“ã—&÷w2çW6‚…²}
­íí-]½ÍÝí-ÂrÆG´ÖF‚æÖ–âƒ2ÄçVÖ&W"†—FVÒç&–Df—&U6†÷G2’—Ò-½-]½Ò“·Ð¢VÇ6R–b‡G—SÓÓÒv&Ö÷"r—¶6öç7B&Ö÷#Ò†—FVÒæÖöF–f–W'7ÇÅµÒ’æf–ÇFW"†ÖöCÓæÖöBçF&vWCÓÓÒv&Ö÷%ö6Æ72rbfÖöBæ÷ÓÓÒvFBr’ç&VGV6R‚‡7VÒÆÖöB“Óç7VÒ´çVÖ&W"†ÖöBçfÇVWÇÃ’Ã’ÆFVfVç6SÒ†—FVÒæÖöF–f–W'7ÇÅµÒ’æf–ÇFW"†ÖöCÓæÖöBçF&vWCÓÓÒvFVfVç6RrbfÖöBæ÷ÓÓÒvFBr’ç&VGV6R‚‡7VÒÆÖöB“Óç7VÒ´çVÖ&W"†ÖöBçfÇVWÇÃ’Ã“¶–b†&Ö÷'ÇÆ—FVÒæ&Ö÷$6Æ72—&÷w2çW6‚…²}	­½íÝ‚rÆ&Ö÷#÷6–væVEvV#‚†&Ö÷"“¤çVÖ&W"†—FVÒæ&Ö÷$6Æ72•Ò“¶–b†FVfVç6WÇÆ—FVÒæFÖvU&VGV7F–öâ—&÷w2çW6‚…²}	}-rÆFVfVç6S÷6–væVEvV#‚†FVfVç6R“¤çVÖ&W"†—FVÒæFÖvU&VGV7F–öâ•Ò“·Ð¢VÇ6R–b‡G—SÓÓÒv–×ÆçBr—&÷w2çW6‚…²}
ÝÝ]=òrÄçVÖ&W"†—FVÒæVæW&w•&WV—&VCóö—FVÒç&WV—&VDVæW&w“óó•Ò“°¢VÇ6R–b‡G—SÓÓÒvÖÖòr—&÷w2çW6‚…²}
-òrÂ}	ý-íÝ²uÒ“°¢VÇ6R–b‡G—SÓÓÒvw&VæFRr—·&÷w2çW6‚…²}
=íÒrÆ—FVÒæFÖvWÇÂ~(	BuÒ“¶–b„çVÖ&W"†—FVÒæw&VæFU&F—W7ÇÃ“ã—&÷w2çW6‚…²}
M=rÆG´çVÖ&W"†—FVÒæw&VæFU&F—W2—Ò=]­æÒ“·Ð¢–b„çVÖ&W"†—FVÒæÖ77ÇÃ“ã—&÷w2çW6‚…²}	ÍrÄçVÖ&W"†—FVÒæÖ72•Ò“·&WGW&â&÷w2ç6Æ–6RƒÃR“°¢Ð¢gVæ7F–öâ—FVÔÖWFvV#‚†—FVÒÆ6ö×7CÖfÇ6RÇÆ–W#Ö7W'&VçEÆ–W"‚’—°¢6öç7B&FvW3Ö—FVÔ&FvW5vV#‚†—FVÒÇÆ–W"’ÆÖöG3Ò†—FVÒæÖöF–f–W'7ÇÅµÒ’æf–ÇFW"†ÖöCÓæÖöBæVæ&ÆVBÓÖfÇ6R’æÖ†ÖöF–f–W%FW‡EvV#‚“°¢&WGW&æÆF—b6Æ73Ò'vV"Ö—FVÒÖÖWF×c‚G¶6ö×7Còv6ö×7Bs¢rwÒ#âG¶&FvW2æÆVæwFƒöÆF—b6Æ73Ò'vV"Ö—FVÒ×7FG2×c‚#âG¶&FvW2æÖ‚…¶Æ&VÂÇfÇVUÒ“ÓæÇ7ããÆ“âG¶W62†Æ&VÂ—ÓÂö“ãÆ#âG¶W62‡fÇVR—ÓÂö#ãÂ÷7ãæ’æ¦ö–â‚rr—ÓÂöF—cæ¢rwÒG¶ÖöG2æÆVæwFƒöÆF—b6Æ73Ò'vV"Ö—FVÒÖÖöF–f–W'2×c‚#âG¶ÖöG2ç6Æ–6RƒÆ6ö×7Có£B’æÖ‡fÇVSÓæÇ7ãâG¶W62‡fÇVR—ÓÂ÷7ãæ’æ¦ö–â‚rr—ÒG¶ÖöG2æÆVæwFƒâ†6ö×7Có£B“öÆVÓâ²]G¶ÖöG2æÆVæwF‚Ò†6ö×7Có£B—ÓÂöVÓæ¢rwÓÂöF—cæ¢rwÓÂöF—cæ°¢Ð¢vV%6Æ÷DÖ&·WccsÖgVæ7F–öâ‡W6W"ÇG—RÆ–æFWƒÒÓ—¶6öç7B—FVÔ–CÖvWE6Æ÷EvV%ccr‡W6W"ÇG—RÆ–æFW‚’Æ—FVÓÖ—FVÔ–Cö—FVÕvV%ccr†—FVÔ–B“¦çVÆÃ·&WGW&æÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷B×ccrG¶—FVÓòvf–ÆÆVBs¢rwÒ"FF×vV"Ö–çfVçF÷'’×6Æ÷B×ccrFF×6Æ÷B×G—SÒ"G·G—WÒ"FF×6Æ÷BÖ–æFWƒÒ"G¶–æFW‡Ò#ãÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷BÖÆ&VÂ×ccr#âG¶W62‡vV%6Æ÷DÆ&VÅccr‡G—RÆ–æFW‚’—ÓÂöF—câG¶—FVÓöÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷BÖ—FVÒ×ccrvV"Ö—FVÒÖ6&B×c‚"G&vv&ÆSÒ'G'VR"FF×vV"Ö–çfVçF÷'’ÖG&r×ccrFF×6÷W&6SÒ'6Æ÷B"FF×6Æ÷B×G—SÒ"G·G—WÒ"FF×6Æ÷BÖ–æFWƒÒ"G¶–æFW‡Ò"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"FFÖ7F–öãÒ'&öf–ÆRÖ—FVÒ"FFÖ—FVÒÖÆ&VÃÒ"G¶W62‡vV%6Æ÷DÆ&VÅccr‡G—RÆ–æFW‚’—Ò#âG·&VæFW$VçF—G•F‡VÖ"†—FVÒ—ÓÇ7ãâG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂ÷7ãâG¶—FVÔÖWFvV#‚†—FVÒÆfÇ6RÇW6W"—ÓÂöF—cæ¢sÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷BÖV×G’×ccr#í	ý]]--Rý]MÍ]#ÂöF—câwÓÂöF—cæ·Ó°¢vV$w&–DÖ&·WccsÖgVæ7F–öâ‡W6W"—¶6öç7BÆ–÷WCÖ'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccr‡W6W"’Æ6VÆÇ3Ô'&’æg&öÒ‡¶ÆVæwFƒ¦Æ–÷WBç6—¦WÒÂ…òÆ–æFW‚“ÓæÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’Ö6VÆÂ×ccr"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–æFW‚VÆ–÷WBæ6öÇ2³Ó¶w&–B×&÷s¢G´ÖF‚æfÆö÷"†–æFW‚öÆ–÷WBæ6öÇ2’³Ò#ãÂöF—cæ’æ¦ö–â‚rr’ÇF–ÆW3ÖÆ–÷WBæ–ç7Fæ6W2æÖ†–ç7CÓæÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×F–ÆR×ccrvV"Ö—FVÒÖ6&B×c‚"G&vv&ÆSÒ'G'VR"FF×vV"Ö–çfVçF÷'’ÖG&r×ccrFF×6÷W&6SÒ&w&–B"FFÖ—FVÒÖ–CÒ"G¶W62†–ç7Bæ—FVÔ–B—Ò"FF×Væ—BÖ–æFWƒÒ"G¶–ç7BçVæ—D–æFW‡Ò"FFÖ7F–öãÒ'&öf–ÆRÖ—FVÒ"FFÖ—FVÒÖÆ&VÃÒ-	Ý-]Ý-Â"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–ç7Bç÷2ç‚³Ò÷7âG¶–ç7BçwÓ¶w&–B×&÷s¢G¶–ç7Bç÷2ç’³Ò÷7âG¶–ç7Bæ‡Ò"F—FÆSÒ"G¶W62†–ç7Bæ—FVÒææÖWÇÆ–ç7Bæ—FVÔ–B—Ò#âG·&VæFW$VçF—G•F‡VÖ"†–ç7Bæ—FVÒ—ÓÇ7ãâG¶W62†–ç7Bæ—FVÒææÖWÇÆ–ç7Bæ—FVÔ–B—ÓÂ÷7ãâG´çVÖ&W"†–ç7BçG—ÇÃ“ãöÇ6ÖÆÃí	­í½}]--ã¢G¶–ç7BçG—ÓÂ÷6ÖÆÃæ¢rwÒG¶—FVÔÖWFvV#‚†–ç7Bæ—FVÒÇG'VRÇW6W"—ÓÂöF—cæ’æ¦ö–â‚rr’Æ÷fW&fÆ÷sÖÆ–÷WBæ÷fW&fÆ÷ræÆVæwFƒöÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’Ö÷fW&fÆ÷r×ccr#ãÆ#í	ÝRýíÍ]]-ó¢G¶Æ–÷WBæ÷fW&fÆ÷ræÆVæwF‡ÓÂö#âG¶Æ–÷WBæ÷fW&fÆ÷ræÖ†–ç7CÓæÇ7ãâG¶W62†–ç7Bæ—FVÒææÖWÇÆ–ç7Bæ—FVÔ–B—ÓÂ÷7ãæ’æ¦ö–â‚rr—ÓÂöF—cæ¢rs·&WGW&æÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’Öw&–B×ccr"FF×vV"Ö–çfVçF÷'’Öw&–B×ccr7G–ÆSÒ"ÒÖ–çbÖ6öÇ3¢G¶Æ–÷WBæ6öÇ7Ó²ÒÖ–çb×&÷w3¢G¶Æ–÷WBç&÷w7Ò#âG¶6VÆÇ7ÒG·F–ÆW7ÓÂöF—câG¶÷fW&fÆ÷wÖ·Ó°¢vV$–çfVçF÷'•æVÅccsÖgVæ7F–öâ‡&uÆ–W"—¶6öç7BW6W#Öæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡&uÆ–W"’ÆÆ–÷WCÖ'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccr‡W6W"’Æ÷fW'vV–v‡CÖÆ–÷WBçvV–v‡CçW6W"æ6''•vV–v‡DÖ‚³RÓ’ÆFö7VÖVçG3Ò†Æ–÷WBçFW‡GÇÅµÒ’æÖ‡&÷sÓæÆ'WGFöâ6Æ73Ò'–ÆÂ"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'&öf–ÆRÖ—FVÒ"FFÖ—FVÒÖ–CÒ"G¶W62‡&÷ræ—FVÔ–B—Ò"FFÖ—FVÒÖÆ&VÃÒ-	Mí­=Í]Ý"#âG¶W62‡&÷ræ—FVÒææÖWÇÇ&÷ræ—FVÔ–B—ÒG·&÷rçG“ãö9rG·&÷rçG—Ö¢rwÓÂö'WGFöãæ’æ¦ö–â‚rr“·&WGW&æÇ6V7F–öâ6Æ73Ò'æVÂvV"×&öf–ÆRÖ–çfVçF÷'’×ccrvV"×&öf–ÆRÖ–çfVçF÷'’×c‚#ãÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×cc#ãÆF—cãÆF—b6Æ73Ò&W–V'&÷r#í
	Ý	

ý	m	]	Ý		SÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
Ý­ýí-­‚Ý-]Ý-ÃÂöF—cãÂöF—cãÂöF—cãÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’Ö66—G’×ccr#ãÇ7ãí	Ý-]Ý-ÂÆ#âGµ²ââæÆ–÷WBæ–ç7Fæ6W2ÂââæÆ–÷WBæ÷fW&fÆ÷uÒç&VGV6R‚‡7VÒÆ—FVÒ“Óç7VÒ¶—FVÒçr¦—FVÒæ‚Ã—ÒòG·W6W"æ–çfVçF÷'•6—¦WÓÂö#â­½]-í£Â÷7ããÇ7â6Æ73Ò"G¶÷fW'vV–v‡Còv–çfVçF÷'’ÖÆ–Ö—BÖW†6VVFVB×ccrs¢rwÒ#í	-]Æ#âG¶Æ–÷WBçvV–v‡BçFôf—†VBƒ—ÒòG´çVÖ&W"‡W6W"æ6''•vV–v‡DÖ‚’çFôf—†VBƒ—ÓÂö#ãÂ÷7ããÇ7ãí	Íý½Ý-²Æ#âG·W6W"æ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ’æÆVæwF‡ÒòG·W6W"æ–×ÆçE6Æ÷D6÷VçGÓÂö#ãÂ÷7ããÂöF—cãÆF—b6Æ73Ò'vV"Ö–çfVçF÷'’×6Æ÷G2×ccr#âG·vV%6Æ÷DÖ&·Wccr‡W6W"Âw&–Ö'•vVöâr—ÒG·vV%6Æ÷DÖ&·Wccr‡W6W"Âw6V6öæF'•vVöâr—ÒG·vV%6Æ÷DÖ&·Wccr‡W6W"Âv&Ö÷"r—ÒG·vV%6Æ÷DÖ&·Wccr‡W6W"Âv&6·6²r—ÒG´'&’æg&öÒ‡¶ÆVæwFƒ§W6W"æ–×ÆçE6Æ÷D6÷VçGÒÂ…òÆ–æFW‚“ÓçvV%6Æ÷DÖ&·Wccr‡W6W"Âv–×ÆçBrÆ–æFW‚’’æ¦ö–â‚rr—ÓÂöF—cãÆF—b6Æ73Ò'6V7F–öâÖ†VBW&Ö'F–6ÆR×F÷×ccvV"Ö–çfVçF÷'’Öw&–BÖ†VB×ccr#ãÆF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Ý-]Ý-ÃÂöF—cãÆF—b6Æ73Ò&×WFVB#í	ýý-Âý}]]¢"-í­S²-íý­‚}ÝÍí"}Í]íMÝí=âý]MÍ]-ãÂöF—cãÂöF—cãÂöF—câG·vV$w&–DÖ&·Wccr‡W6W"—ÒG¶Fö7VÖVçG3öÆF—b6Æ73Ò'vV"ÖFö7VÖVçG2×c‚#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Mí­=Í]Ý-²‚ý]MÍ]-²]r-]ÂöF—cãÆF—b6Æ73Ò'–ÆÂ×&÷r#âG¶Fö7VÖVçG7ÓÂöF—cãÂöF—cæ¢rwÓÂ÷6V7F–öãæ·Ó° ¢6öç7B&öf–ÆT—FVÔFWF–Ä&Vf÷&Sƒ×&öf–ÆT—FVÔFWF–ÄÖ&·Wcc°¢&öf–ÆT—FVÔFWF–ÄÖ&·WccÖgVæ7F–öâ‡&rÆÖWF×·Ò—¶6öç7B—FVÓÖæ÷&ÖÆ—¦T—FVÕvV#‚‡&r’Æ&6S×&öf–ÆT—FVÔFWF–Ä&Vf÷&S‚†—FVÒÆÖWF’ÆÖöG3Ò†—FVÒæÖöF–f–W'7ÇÅµÒ’æf–ÇFW"†ÖöCÓæÖöBæVæ&ÆVBÓÖfÇ6R’æÖ†ÖöF–f–W%FW‡EvV#‚’ÆÖÖóÖ—FVÒæÖÖõG—T–Cö—FVÕvV%ccr†—FVÒæÖÖõG—T–B“¦çVÆÂÇ6¶–ÆÃÖ—FVÒçvVöå6¶–ÆÄ–CôæFFç6¶–ÆÇ2ævWB…7G&–ær†—FVÒçvVöå6¶–ÆÄ–B’“¦çVÆÂÆÖV6†æ–73Õ¶—FVÒçvVöå6¶–ÆÄ–Cö	í=m]Ý½’Ý-½£¢G·6¶–ÆÃòææÖWÇÆ—FVÒçvVöå6¶–ÆÄ–GÒG¶—FVÒçvVöå6¶–ÆÄ&öçW3ö‚G·6–væVEvV#‚†—FVÒçvVöå6¶–ÆÄ&öçW2—Ò¢ýíýMÝâý‚}=}]Ý‚–¢rwÖ¢rrÆ—FVÒæ&Ö÷%vV–v‡D6Æ73ÓÓÒv†Vg’sò}
-ým½òíÝó¢	½í-­í-ÂÝRMí-½ý]-ò¢­--Ýí’}-Rs¢rrÆ—FVÒç6†–VÆD6÷fW$&öçW3ö
M}}]­’#¢²G¶—FVÒç6†–VÆD6÷fW$&öçW7Ó²ÝR­½M½-]-ò=­½-]Æ¢rrÆ—FVÒç6†–VÆDFW‡FW&—G”6ÖçVÆÃö	ý]M]²	½í-­í-‚í"-¢G¶—FVÒç6†–VÆDFW‡FW&—G”6Ö¢ruÒæf–ÇFW"„&ööÆVâ“¶6öç7BW‡G&ÖÆF—b6Æ73Ò'vV"Ö—FVÒÖFWF–Â×c‚#âG¶—FVÔÖWFvV#‚†—FVÒÆfÇ6R—ÒG¶ÖÖóöÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#ãÆ#í
-òý-íÝí#£Âö#âG¶W62†ÖÖòææÖWÇÆÖÖòæ–B—ÓÂöF—cæ¢rwÒG¶ÖV6†æ–72æÖ‡fÇVSÓæÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62‡fÇVR—ÓÂöF—cæ’æ¦ö–â‚rr—ÒG¶ÖöG2æÆVæwFƒöÆF—b6Æ73Ò'vV"ÖÖöF–f–W"ÖFWF–Â×c‚#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ÍíMM­-í³ÂöF—câG¶ÖöG2æÖ‡fÇVSÓæÆF—câG¶W62‡fÇVR—ÓÂöF—cæ’æ¦ö–â‚rr—ÓÂöF—cæ¢rwÓÂöF—cæ·&WGW&â&6Rç&WÆ6R‚sÆF—b6Æ73Ò&F—f–FW"#ãÂöF—cârÆG¶W‡G&ÓÆF—b6Æ73Ò&F—f–FW"#ãÂöF—cæ“·Ó° ¢6öç7B6†÷u6¶–ÆÅF—&Vf÷&Sƒ×6†÷uvV%6¶–ÆÅF—°¢6†÷uvV%6¶–ÆÅF—ÖgVæ7F–öâ†æöFRÇ6¶–ÆÄ–B—·6†÷u6¶–ÆÅF—&Vf÷&S‚†æöFRÇ6¶–ÆÄ–B“¶6öç7B6¶–ÆÃÔæFFç6¶–ÆÇ2ævWB‡6¶–ÆÄ–B’ÆÆ&VÃ×¶7F—fS¢}	­--Ý½’rÇ76—fS¢}	ý-Ý½’rÇ&V7F–öã¢}
]­mòwÕµ7G&–ær‡6¶–ÆÃòæ7F—fF–öåG—WÇÂw76—fRr•×ÇÂ}	ý-Ý½’rÆ†VCÖFö7VÖVçBçVW'•6VÆV7F÷"‚r7vV"×6¶–ÆÂ×F—çvV"×6¶–ÆÂ×F—Ö†VB7âr“¶–b††VBbe7G&–ær‡6¶–ÆÃòç6¶–ÆÅG—WÇÇ6¶–ÆÃòçG—R’ÓÒw7V6–Æ—¦F–öâr–†VBçFW‡D6öçFVçCÖ	Ý-½¢+rG¶Æ&VÇÖ·Ó° ¢6öç7B6ö×–ÆTFF&Vf÷&SƒÖ6ö×–ÆTFF°¢6ö×–ÆTFFÖgVæ7F–öâ‚ââæ&w2—¶6öç7B&W7VÇCÖ6ö×–ÆTFF&Vf÷&S‚‚ââæ&w2“´æFFæ—FV×3ÖæWrÖ„'&’æg&öÒ„æFFæ—FV×2æVçG&–W2‚’’æÖ‚…¶–BÆ—FVÕÒ“Óå¶–BÆæ÷&ÖÆ—¦T—FVÕvV#‚‡²ââæ—FVÒÆ–C¦—FVÒæ–GÇÆ–GÒ•Ò’“´æFFç6¶–ÆÇ2æf÷$V6‚‡6¶–ÆÃÓç·6¶–ÆÂæ7F—fF–öåG—SÕ²v7F—fRrÂw76—fRrÂw&V7F–öâuÒæ–æ6ÇVFW2…7G&–ær‡6¶–ÆÂæ7F—fF–öåG—R’“õ7G&–ær‡6¶–ÆÂæ7F—fF–öåG—R“¢w76—fRs·Ò“´æFFçÆ–W'3ÖæWrÖ„'&’æg&öÒ„æFFçÆ–W'2æVçG&–W2‚’’æÖ‚…¶–BÇÆ–W%Ò“Óå¶–BÆæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡Æ–W"•Ò’“·&WGW&â&W7VÇC·Ó° ¢6öç7B&VæFW%&öf–ÆT&Vf÷&Sƒ×&VæFW%&öf–ÆS°¢&VæFW%&öf–ÆSÖgVæ7F–öâ‚—¶6öç7B&W7VÇC×&VæFW%&öf–ÆT&Vf÷&S‚‚“¶6öç7B&ö÷CÒB‚r767&VVâ×&öf–ÆRr’ÇÆ–W#Ö7W'&VçEÆ–W"‚“¶–b‡&ö÷BbgÆ–W"—¶6öç7Bæ÷&ÖÆ—¦VCÖæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡Æ–W"“¶6öç7B6&C×&ö÷BçVW'•6VÆV7F÷"‚rç&öf–ÆRÖ6&Bæ–æfòÖw&–Br“¶–b†6&Bbb6&BçVW'•6VÆV7F÷"‚u¶FF×vV"Ö6öÖ&B×7FG2×c…Òr’–6&Bæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÆÆF—b6Æ73Ò&–æfòÖ6&B"FF×vV"Ö6öÖ&B×7FG2×cƒãÆF—b6Æ73Ò&²#í	í}íòM-m]ÝSÂöF—cãÆF—b6Æ73Ò'b#âG´çVÖ&W"†æ÷&ÖÆ—¦VBæ6öÖ&Còçf—6–öå&ævWÇÃ—ÒòG´çVÖ&W"†æ÷&ÖÆ—¦VBæ6öÖ&CòæÖ÷fU&ævWÇÃ—Ò=]­ãÂöF—cãÂöF—cãÆF—b6Æ73Ò&–æfòÖ6&B"FF×vV"Ö6öÖ&B×7FG2×cƒãÆF—b6Æ73Ò&²#í	­½íÝ‚ò}-ÂöF—cãÆF—b6Æ73Ò'b#âG´çVÖ&W"†æ÷&ÖÆ—¦VBç7FG3òæ&Ö÷$6Æ77ÇÃ—ÒòG´çVÖ&W"†æ÷&ÖÆ—¦VBç7FG3òæFVfVç6WÇÃ—ÓÂöF—cãÂöF—cæ“·×&WGW&â&W7VÇC·Ó°¢v–æF÷räu%uvV$fVGW&U6µcƒÔö&¦V7Bæg&VW¦R‡·fW'6–öã¢sãã#"rÆæ÷&ÖÆ—¦T—FVÓ¦æ÷&ÖÆ—¦T—FVÕvV#‚Ææ÷&ÖÆ—¦UÆ–W#¦æ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccrÆFW&—fVEÆ–W#¦FW&—fVEÆ–W%vV#‚ÆÖöF–f–W%FW‡C¦ÖöF–f–W%FW‡EvV#‚ÇvVöäGF6³§vVöäGF6µvV#‚Æ—FVÔ&FvW3¦—FVÔ&FvW5vV#‡Ò“°¢v–æF÷räu%uvV$fVGW&U6µc“Ôö&¦V7Bæg&VW¦R‡·fW'6–öã¢sãã’rÆæ÷&ÖÆ—¦T—FVÓ¦æ÷&ÖÆ—¦T—FVÕvV#‡Ò“° ¢ò¢cãã#(	B÷F–Ö—7F–2–çfVçF÷'’ÂÖ×Væ—F–öâfÖ–Æ–W2æB&–æ'’6¶–ÆÇ2¢ð¢6öç7Bæ÷&ÖÆ—¦T—FVÔ&Vf÷&UvV##Öæ÷&ÖÆ—¦T—FVÕvV#ƒ°¢æ÷&ÖÆ—¦T—FVÕvV#ƒÖgVæ7F–öâ‡&s×·Ò—°¢6öç7B6÷W&6SÖFVW‡&wÇÇ·Ò’Æ—FVÓÖæ÷&ÖÆ—¦T—FVÔ&Vf÷&UvV##‡6÷W&6R“°¢6öç7B†4ÆVv7”F–ÖVç6–öç3Õ²vÖ72rÂv–çfVçF÷'•v–GF‚rÂv–çfVçF÷'”†V–v‡BuÒæWfW'’†¶W“Óäö&¦V7Bç&÷F÷G—Ræ†4÷vå&÷W'G’æ6ÆÂ‡6÷W&6RÆ¶W’’“°¢—FVÒæÆVv7•FW‡DöæÇ”–çfVçF÷'•c3×6÷W&6RçFW‡DöæÇ”–çfVçF÷'“ÓÓ×G'VWÇÂ††4ÆVv7”F–ÖVç6–öç2bdçVÖ&W"‡6÷W&6RæÖ72“ÓÓÓbdçVÖ&W"‡6÷W&6Ræ–çfVçF÷'•v–GF‚“ÓÓÓbdçVÖ&W"‡6÷W&6Ræ–çfVçF÷'”†V–v‡B“ÓÓÓ—ÇÆ—FVÒæÆVv7•FW‡DöæÇ”–çfVçF÷'•c3ÓÓ×G'VS°¢—FVÒæÖÖôfÖ–Ç“Õ7G&–ær‡6÷W&6RæÖÖôfÖ–Ç“ó÷6÷W&6Ræ6Æ–&W#ó÷6÷W&6RæÖ×Væ—F–öäfÖ–Ç“óö—FVÒæÖÖôfÖ–Ç“óòrr’çG&–Ò‚“°¢—FVÒç&–Df—&U6†÷G3ÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"‡6÷W&6Rç&–Df—&U6†÷G3ó÷6÷W&6Ræ'W'7E6†÷G3óö—FVÒç&–Df—&U6†÷G3óó—ÇÃ’“°¢—FVÒç7F6¶&ÆSÖ—FVÒçG—SÓÓÒvÖÖòwÇÇ6÷W&6Rç7F6¶&ÆSÓÓ×G'VWÇÅ7G&–ær‡6÷W&6Rç7F6¶&ÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒwG'VRs°¢—FVÒç7F6´Æ–Ö—CÖ—FVÒç7F6¶&ÆSôÖF‚æÖ‚ƒ"ÄÖF‚çG'Væ2„çVÖ&W"‡6÷W&6Rç7F6´Æ–Ö—Cóö—FVÒç7F6´Æ–Ö—Cóó“’—ÇÃ“’’“£°¢—FVÒçFW‡DöæÇ”–çfVçF÷'“ÖfÇ6S°¢—FVÒæ–çfVçF÷'•v–GFƒÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"‡6÷W&6Ræ–çfVçF÷'•v–GFƒóö—FVÒæ–çfVçF÷'•v–GFƒóó—ÇÃ’“°¢—FVÒæ–çfVçF÷'”†V–v‡CÔÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"‡6÷W&6Ræ–çfVçF÷'”†V–v‡Cóö—FVÒæ–çfVçF÷'”†V–v‡Cóó—ÇÃ’“°¢—FVÒæÖöF–f–W'3Ò„'&’æ—4'&’†—FVÒæÖöF–f–W'2“ö—FVÒæÖöF–f–W'3¥µÒ’æf–ÇFW"†ÖöCÓæÖöCòçF&vWB“°¢&WGW&â—FVÓ°¢Ó° ¢gVæ7F–öâæ÷&ÖÆ—¦U6¶–ÆÅvV##‡&s×·Ò—°¢6öç7B6¶–ÆÃÖFVW‡&wÇÇ·Ò’ÆöÆEG—SÕ7G&–ær‡6¶–ÆÂç6¶–ÆÅG—WÇÇ6¶–ÆÂçG—WÇÂw6¶–ÆÂr’çFôÆ÷vW$66R‚“°¢6¶–ÆÂç6¶–ÆÅG—SÒw6¶–ÆÂs·6¶–ÆÂçG—SÒw6¶–ÆÂs·6¶–ÆÂç7V6–Æ—¦F–öä–æ7&V6W3ÕµÓ°¢6¶–ÆÂæ7F—fF–öåG—SÕ²v7F—fRrÂw76—fRrÂw&V7F–öâuÒæ–æ6ÇVFW2…7G&–ær‡6¶–ÆÂæ7F—fF–öåG—WÇÂrr’çFôÆ÷vW$66R‚’“õ7G&–ær‡6¶–ÆÂæ7F—fF–öåG—R’çFôÆ÷vW$66R‚“¢w76—fRs°¢–b†öÆEG—SÓÓÒw7V6–Æ—¦F–öâr—6¶–ÆÂæÆVv7•6¶–ÆÅG—Uc#Òw7V6–Æ—¦F–öâs°¢&WGW&â6¶–ÆÃ°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦UÆ–W%vV##‡&s×·Ò—°¢6öç7BÆ–W#ÖFVW‡&wÇÇ·Ò’ÆÆVv7“×Æ–W"ç7V6–Æ—¦F–öç2bgG—VöbÆ–W"ç7V6–Æ—¦F–öç3ÓÓÒvö&¦V7Bs÷Æ–W"ç7V6–Æ—¦F–öç3§·Ó°¢6öç7BÖ–w&FVCÔö&¦V7BæVçG&–W2†ÆVv7’’æf–ÇFW"‚…²ÇfÇVUÒ“ÓäçVÖ&W"‡fÇVWÇÃ“ã’æÖ‚…¶–EÒ“Óå7G&–ær†–B’“°¢Æ–W"ç6¶–ÆÇ3Ô'&’æg&öÒ†æWr6WB…²âââ„'&’æ—4'&’‡Æ–W"ç6¶–ÆÇ2“÷Æ–W"ç6¶–ÆÇ3¥µÒ’æÖ…7G&–ær’ÂââæÖ–w&FVEÒæf–ÇFW"„&ööÆVâ’’“°¢–b†Ö–w&FVBæÆVæwF‚—Æ–W"æÆVv7•7V6–Æ—¦F–öç5c#×²âââ‡Æ–W"æÆVv7•7V6–Æ—¦F–öç5c#ÇÇ·Ò’ÂââæFVW†ÆVv7’—Ó°¢Æ–W"ç7V6–Æ—¦F–öç3×·Ó°¢6öç7BFW‡D—FV×3×Æ–W"çFW‡D–çfVçF÷'”—FV×3ó÷Æ–W"çvV–v‡FÆW74—FV×3ó÷Æ–W"æ–çfVçF÷'•FW‡D—FV×3ó÷Æ–W"æÆö÷6T—FV×3óõµÓ°¢Æ–W"çFW‡D–çfVçF÷'”—FV×3Ò„'&’æ—4'&’‡FW‡D—FV×2“÷FW‡D—FV×3¥µÒ’æÖ‡&÷sÓçG—Vöb&÷sÓÓÒw7G&–ærs÷¶æÖS§&÷rÇG“£Ó§&÷r’æf–ÇFW"‡&÷sÓç&÷rbgG—Vöb&÷sÓÓÒvö&¦V7Br’æÖ‡&÷sÓâ‡¶æÖS¥7G&–ær‡&÷rææÖSó÷&÷rçF—FÆSó÷&÷ræÆ&VÃóòrr’çG&–Ò‚’ç6Æ–6RƒÃC’ÇG“¤ÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"‡&÷rçG“ó÷&÷rçVçF—G“óó—ÇÃ’—Ò’’æf–ÇFW"‡&÷sÓç&÷rææÖR“°¢6öç7B¶WCÕµÓ°¢f÷"†6öç7BVçG'’öb'&’æ—4'&’‡Æ–W"æ–çfVçF÷'’“÷Æ–W"æ–çfVçF÷'“¥µÒ—¶6öç7B—FVÓÔæFFæ—FV×2ævWB…7G&–ær†VçG'’æ—FVÔ–GÇÂrr’“¶–b†—FVÓòæÆVv7•FW‡DöæÇ”–çfVçF÷'•c3ÓÓ×G'VR—Æ–W"çFW‡D–çfVçF÷'”—FV×2çW6‚‡¶æÖS¥7G&–ær†—FVÒææÖWÇÆVçG'’æ—FVÔ–B’ÇG“¤ÖF‚æÖ‚ƒÄÖF‚çG'Væ2„çVÖ&W"†VçG'’çG—ÇÃ’’—Ò“¶VÇ6R¶WBçW6‚†VçG'’“·Ð¢Æ–W"æ–çfVçF÷'“Ö¶WC°¢&WGW&âG—Vöbæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccsÓÓÒvgVæ7F–öâsöæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr‡Æ–W"“§Æ–W#°¢Ð¢—57V6–Æ—¦F–öãÖgVæ7F–öâ‚—·&WGW&âfÇ6S·Ó°¢Ç•6¶–ÆÅ7V6–Æ—¦F–öä–æ7&V6W3ÖgVæ7F–öâ‚—·&WGW&ç·Ó·Ó° ¢6öç7B÷F–Ö—7F–5Æ–W'5vV##ÖæWrÖ‚’Æ×WFF–öåVWVW5vV##ÖæWrÖ‚“°¢ÆWB×WFF–öå6WvV##Ó°¢6öç7B'V–ÆEÆ–W$Ö&Vf÷&UvV##Ö'V–ÆEÆ–W$Ö°¢'V–ÆEÆ–W$ÖÖgVæ7F–öâ‡6æ6†÷BÇ&÷w2—°¢6öç7BÖÖ'V–ÆEÆ–W$Ö&Vf÷&UvV##‡6æ6†÷BÇ&÷w2“°¢Öæf÷$V6‚‚‡Æ–W"Æ–B“ÓæÖç6WB†–BÆæ÷&ÖÆ—¦UÆ–W%vV##‡Æ–W"’’“°¢÷F–Ö—7F–5Æ–W'5vV##æf÷$V6‚‚†VçG'’Æ–B“Óç¶–b†Öæ†2†–B—ÇÅ7G&–ær„ç6W76–öãòçW6W$–GÇÂrr“ÓÓÕ7G&–ær†–B’–Öç6WB†–BÆFVW†VçG'’çÆ–W"’“·Ò“°¢&WGW&âÖ°¢Ó°¢6öç7B6ö×–ÆTFF&Vf÷&UvV##Ö6ö×–ÆTFF°¢6ö×–ÆTFFÖgVæ7F–öâ‚ââæ&w2—°¢6öç7B&W7VÇCÖ6ö×–ÆTFF&Vf÷&UvV##‚ââæ&w2“°¢æFFæ—FV×3ÖæWrÖ„'&’æg&öÒ„æFFæ—FV×2æVçG&–W2‚’’æÖ‚…¶–BÆ—FVÕÒ“Óå¶–BÆæ÷&ÖÆ—¦T—FVÕvV#‚‡²ââæ—FVÒÆ–C¦—FVÒæ–GÇÆ–GÒ•Ò’“°¢æFFç6¶–ÆÇ3ÖæWrÖ„'&’æg&öÒ„æFFç6¶–ÆÇ2æVçG&–W2‚’’æÖ‚…¶–BÇ6¶–ÆÅÒ“Óå¶–BÆæ÷&ÖÆ—¦U6¶–ÆÅvV##‡²ââç6¶–ÆÂÆ–C§6¶–ÆÂæ–GÇÆ–GÒ•Ò’“°¢æFFçÆ–W'3ÖæWrÖ„'&’æg&öÒ„æFFçÆ–W'2æVçG&–W2‚’’æÖ‚…¶–BÇÆ–W%Ò“Óå¶–BÆæ÷&ÖÆ—¦UÆ–W%vV##‡Æ–W"•Ò’“°¢&WGW&â&W7VÇC°¢Ó° ¢gVæ7F–öâ–çfVçF÷'”6†ævVEvV##†&Vf÷&S×·ÒÆgFW#×·Ò—°¢6öç7B–6³×fÇVSÓä¥4ôâç7G&–æv–g’‡¶–çfVçF÷'“§fÇVRæ–çfVçF÷'—ÇÅµÒÆWV—ÖVçE6Æ÷G3§fÇVRæWV—ÖVçE6Æ÷G7ÇÇ·ÒÆ–×ÆçE6Æ÷G3§fÇVRæ–×ÆçE6Æ÷G7ÇÅµÒÆ–ç7FÆÆVD–×ÆçD–G3§fÇVRæ–ç7FÆÆVD–×ÆçD–G7ÇÅµ×Ò“°¢&WGW&â–6²†&Vf÷&R’Ó×–6²†gFW"“°¢Ð¢gVæ7F–öâ&VæFW$÷F–Ö—7F–5Æ–W%vV##†&Vf÷&RÆæW‡B—°¢–b„çV’ç67&VVâÓÒw&öf–ÆRr—&WGW&ã°¢–b†–çfVçF÷'”6†ævVEvV##†&Vf÷&RÆæW‡B’—°¢6öç7BæVÃÖFö7VÖVçBçVW'•6VÆV7F÷"‚r767&VVâ×&öf–ÆRçvV"×&öf–ÆRÖ–çfVçF÷'’×ccrr“°¢–b‡æVÂ—·æVÂæ÷WFW$…DÔÃ×vV$–çfVçF÷'•æVÅccr†æW‡B“·&WGW&ã·Ð¢Ð¢&VæFW$7W'&VçE67&VVâ‚“°¢Ð¢6öç7BÆ–W%w&—FW5c3S×v–æF÷räu%uÆ–W%7–æ46÷&Uc3Ræ7&VFUVWVR‚“°¢6öÖÖ—EÆ–W$×WFF–öãÖ7–æ2gVæ7F–öâ†×WFF÷"Ç7V66W74ÖW76vR—°¢6öç7B6÷&S×v–æF÷räu%uÆ–W%7–æ46÷&Uc3S°¢6öç7B7W'&VçCÖ7W'&VçEÆ–W"‚“¶–b‚7W'&VçB—F‡&÷ræWrW'&÷"‚}	ýíM½Â=í­ÝR-½Òr“°¢6öç7BÆ–W$–CÕ7G&–ær†7W'&VçBæ–B’Æ&Vf÷&SÖFVW†7W'&VçB’Æ÷F–Ö—7F–3Öæ÷&ÖÆ—¦UÆ–W%vV##†FVW†7W'&VçB’“°¢6öç7B÷WF6öÖSÖ×WFF÷"†÷F–Ö—7F–2“°¢–b†÷WF6öÖRbgG—Vöb÷WF6öÖRçF†VãÓÓÒvgVæ7F–öâr—F‡&÷ræWrW'&÷"‚uÆ–W"×WFF–öâ×W7B&R7–æ6‡&öæ÷W2r“°¢–b†÷WF6öÖSÓÓÖfÇ6R—&WGW&ã°¢6öç7Bæ÷&ÖÆ—¦VD÷F–Ö—7F–3Öæ÷&ÖÆ—¦UÆ–W%vV##†÷F–Ö—7F–2’Ç6WÒ²¶×WFF–öå6WvV##°¢÷F–Ö—7F–5Æ–W'5vV##ç6WB‡Æ–W$–BÇ·6WÇÆ–W#¦FVW†æ÷&ÖÆ—¦VD÷F–Ö—7F–2—Ò“°¢æFFçÆ–W'2ç6WB‡Æ–W$–BÆFVW†æ÷&ÖÆ—¦VD÷F–Ö—7F–2’“°¢Fö7VÖVçBæ&öG’æ6Æ74Æ—7BæFB‚wvV"×Æ–W"×w&—FR×VæF–ær×c#r“°¢&VæFW$÷F–Ö—7F–5Æ–W%vV##†&Vf÷&RÆæ÷&ÖÆ—¦VD÷F–Ö—7F–2“°¢&WGW&âÆ–W%w&—FW5c3Rç'Vâ‡Æ–W$–BÆ7–æ2‚“Óç°¢ÆWB6fVCÖçVÆÃ°¢f÷"†ÆWB6öæfÆ–7CÓ¶6öæfÆ–7CÃBbb6fVC¶6öæfÆ–7B²²—°¢6öç7B&6U&÷sÖv—B•VÆÅÆ–W"„æ6öæf–rÇÆ–W$–B“°¢–b‚&6U&÷wÇÆ&6U&÷ræFVÆWFVEöB—F‡&÷ræWrW'&÷"‚}	}ýÂ=í­Ý]Mí-=ýÝr“°¢6öç7B&sÖ6ö×÷6UÆ–W$§6öäg&öÕ6VvÖVçG2†&6U&÷r“°¢6öç7BæW‡CÖæ÷&ÖÆ—¦UÆ–W%vV##†FVW‡&r’“°¢×WFF÷"†æW‡B“°¢6öç7B–ÆöC×²ââæFV6ö×÷6UÆ–W"†æ÷&ÖÆ—¦UÆ–W%vV##†æW‡B’’Æ&6UÆ–W#§&rÀ¢÷W&F–öä–C¦6÷&Ræ÷W&F–öä–B‚’ÇWFFVEö'“¤æ6öæf–ræFWf–6TÆ&VÇÇÂwvV"×Æ–W"wÓ°¢òò¶VWF†R6ÖR÷W&F–öâ–Bv†VâG&ç7÷'Bf–Ç2gFW"F†R6W'fW"6öÖÖ—G2à¢f÷"†ÆWBGFV×CÓ¶GFV×CÃ3¶GFV×B²²—°¢G'—·6fVCÖv—B•F6…Æ–W%v—F…fW'6–öâ„æ6öæf–rÇÆ–W$–BÄçVÖ&W"†&6U&÷rçfW'6–öçÇÃ’Ç–ÆöB“¶'&V³·Ð¢6F6‚†W'&÷"—¶–b†GFV×CÓÓÓ'ÇÆW'&÷"ç7FGW2bfW'&÷"ç7FGW3ÃS—F‡&÷rW'&÷#·Ð¢Ð¢Ð¢–b‚6fVB—F‡&÷ræWrW'&÷"‚}	ýíM½Â}Í]Ýý]-òÝM==íÂ=-í--Râ	íÝí--RMÝÝ½Râr“°¢6öç7B66†VCÔæFFçÆ–W%&÷w2ævWB‡Æ–W$–B“°¢–b‚66†VGÇÄçVÖ&W"‡6fVBçfW'6–öçÇÃ“ãÔçVÖ&W"†66†VBçfW'6–öçÇÃ’”æFFçÆ–W%&÷w2ç6WB‡Æ–W$–BÇ6fVB“°¢6öç7BÆFW7CÖ÷F–Ö—7F–5Æ–W'5vV##ævWB‡Æ–W$–B“°¢–b†ÆFW7Còç6WÓÓ×6W–÷F–Ö—7F–5Æ–W'5vV##æFVÆWFR‡Æ–W$–B“°¢æFFçÆ–W'3Ö'V–ÆEÆ–W$Ö„æ66†Rç6æ6†÷BÄ'&’æg&öÒ„æFFçÆ–W%&÷w2çfÇVW2‚’’“°¢v—B6fT66†R‚“°¢–b†ÆFW7Còç6WÓÓ×6W—¶Fö7VÖVçBæ&öG’æ6Æ74Æ—7Bç&VÖ÷fR‚wvV"×Æ–W"×w&—FR×VæF–ær×c#r“·&VæFW$7W'&VçE67&VVâ‚“¶–b‡7V66W74ÖW76vR–æ÷F–g’‡7V66W74ÖW76vRÂvö²r“·Ð¢&WGW&â6fVC°¢Ò’æ6F6‚†7–æ2W'&÷#Óç°¢6öç7BÆFW7CÖ÷F–Ö—7F–5Æ–W'5vV##ævWB‡Æ–W$–B“°¢–b†ÆFW7Còç6WÓÓ×6W—°¢÷F–Ö—7F–5Æ–W'5vV##æFVÆWFR‡Æ–W$–B“¶Fö7VÖVçBæ&öG’æ6Æ74Æ—7Bç&VÖ÷fR‚wvV"×Æ–W"×w&—FR×VæF–ær×c#r“°¢G'—¶6öç7B&÷sÖv—B•VÆÅÆ–W"„æ6öæf–rÇÆ–W$–B“¶–b‡&÷r”æFFçÆ–W%&÷w2ç6WB‡Æ–W$–BÇ&÷r“·Ö6F6‡·Ð¢æFFçÆ–W'3Ö'V–ÆEÆ–W$Ö„æ66†Rç6æ6†÷BÄ'&’æg&öÒ„æFFçÆ–W%&÷w2çfÇVW2‚’’“°¢v—B6fT66†R‚“·&VæFW$7W'&VçE67&VVâ‚“°¢Ð¢F‡&÷rW'&÷#°¢Ò“°¢Ó° ¢6öç7B&VæFW$ffV7FVD&Vf÷&UvV##×&VæFW$ffV7FVE67&VVç3°¢&VæFW$ffV7FVE67&VVç3ÖgVæ7F–öâ†6†ævVC×·Ò—°¢–b†6†ævVBçÆ–W'2bdçV’ç67&VVãÓÓÒw&öf–ÆRrbf÷F–Ö—7F–5Æ–W'5vV##æ†2…7G&–ær„ç6W76–öãòçW6W$–GÇÂrr’’—&WGW&ã°¢&WGW&â&VæFW$ffV7FVD&Vf÷&UvV##†6†ævVB“°¢Ó° ¢6öç7B—FVÔ&FvW4&Vf÷&UvV##Ö—FVÔ&FvW5vV#ƒ°¢—FVÔ&FvW5vV#ƒÖgVæ7F–öâ†—FVÒÇÆ–W#Ö7W'&VçEÆ–W"‚’—°¢6öç7B&÷w3Ö—FVÔ&FvW4&Vf÷&UvV##†æ÷&ÖÆ—¦T—FVÕvV#‚†—FVÒ’ÇÆ–W"’ÆfÖ–Ç“Õ7G&–ær†—FVÓòæÖÖôfÖ–Ç—ÇÂrr’çG&–Ò‚“°¢–b†fÖ–Ç’bb&÷w2ç6öÖR‚…¶Æ&VÅÒ“ÓæÆ&VÃÓÓÒ}	­½r’—&÷w2çW6‚…²}	­½rÆfÖ–Ç•Ò“°¢&WGW&â&÷w2ç6Æ–6RƒÃb“°¢Ó°¢6öç7B—FVÔÖWF&Vf÷&UvV##Ö—FVÔÖWFvV#ƒ°¢—FVÔÖWFvV#ƒÖgVæ7F–öâ†—FVÒÆ6ö×7CÖfÇ6RÇÆ–W#Ö7W'&VçEÆ–W"‚’—°¢6öç7Bæ÷&ÖÆ—¦VCÖæ÷&ÖÆ—¦T—FVÕvV#‚†—FVÒ’Æ&6SÖ—FVÔÖWF&Vf÷&UvV##†æ÷&ÖÆ—¦VBÆ6ö×7BÇÆ–W"’ÆFW67&—F–öãÕ7G&–ær†æ÷&ÖÆ—¦VBæFW67ÇÆæ÷&ÖÆ—¦VBæFW67&—F–öçÇÆæ÷&ÖÆ—¦VBç7VÖÖ'—ÇÂrr’ç&WÆ6R‚óÅµãåÒ£âörÂrr’ç&WÆ6R‚òfæ'7²öv’Ârr’ç&WÆ6R‚õÇ2²örÂrr’çG&–Ò‚“°¢&WGW&â6ö×7BbfFW67&—F–öãöG¶&6WÓÆF—b6Æ73Ò'vV"Ö—FVÒÖFW67&—F–öâ×c##âG¶W62†FW67&—F–öâ—ÓÂöF—cæ¦&6S°¢Ó° ¢&VæFW$Öö&–ÆU&WWFF–öãÖgVæ7F–öâ‡Æ–W"—°¢6öç7B&÷w3×&WWFF–öå&÷w2‡Æ–W"“¶–b‚&÷w2æÆVæwF‚—&WGW&ârs°¢&WGW&âÇ6V7F–öâ6Æ73Ò'vV"×&WWFF–öâ×c##ãÆF—b6Æ73Ò'6V7F–öâÖ†VB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
]ý=-móÂöF—cãÂöF—cãÆF—b6Æ73Ò'vV"×&WWFF–öâÖÆ—7B×c##âG·&÷w2æÖ‚‡¶f7F–öâÇfÇVRÆÆ&VÇÒ“Óç¶6öç7B&÷VæFVCÔÖF‚æÖ‚‚ÓÄÖF‚æÖ–âƒÄçVÖ&W"‡fÇVWÇÃ’’’Ç÷6—F–öãÒ†&÷VæFVB³’ó"ÆÆVgCÔÖF‚æÖ–âƒSÇ÷6—F–öâ’Çv–GFƒÔÖF‚æ'2‡÷6—F–öâÓS“·&WGW&æÆF—b6Æ73Ò'vV"×&WWFF–öâ×&÷r×c##ãÆF—câG·&VæFW$VçF—G•F‡VÖ"†f7F–öâ—ÓÇ7ããÆ#âG¶W62†f7F–öâææÖWÇÆf7F–öâæ–B—ÓÂö#âG¶Æ&VÃöÇ6ÖÆÃâG¶W62†Æ&VÂ—ÓÂ÷6ÖÆÃæ¢rwÓÂ÷7ããÇ7G&öæsâG¶&÷VæFVCãòr²s¢rwÒG¶&÷VæFVGÓÂ÷7G&öæsãÂöF—cãÆ“ãÇ7â7G–ÆSÒ&ÆVgC¢G¶ÆVgGÒS·v–GFƒ¢G·v–GF‡ÒR#ãÂ÷7ããÂö“ãÂöF—cæ·Ò’æ¦ö–â‚rr—ÓÂöF—cãÂ÷6V7F–öãæ°¢Ó° ¢6öç7B&VæFW%&öf–ÆT&Vf÷&UvV##×&VæFW%&öf–ÆS°¢&VæFW%&öf–ÆSÖgVæ7F–öâ‚—°¢6öç7B&W7VÇC×&VæFW%&öf–ÆT&Vf÷&UvV##‚’Ç&ö÷CÖFö7VÖVçBævWDVÆVÖVçD'”–B‚w67&VVâ×&öf–ÆRr’ÇÆ–W#Ö7W'&VçEÆ–W"‚“¶–b‚&ö÷GÇÂÆ–W"—&WGW&â&W7VÇC°¢&ö÷BçVW'•6VÆV7F÷$ÆÂ‚u¶FFÖ2×cS%Òr’æf÷$V6‚†æöFSÓææöFRç&VÖ÷fR‚’“°¢&ö÷BçVW'•6VÆV7F÷$ÆÂ‚rç6V7F–öâÖ†VBr’æf÷$V6‚††VCÓç¶–b††VBçVW'•6VÆV7F÷"‚rç6V7F–öâ×F—FÆRr“òçFW‡D6öçFVçCòçG&–Ò‚“ÓÓÒ}
ý]m½}m‚r—¶6öç7BæW‡CÖ†VBææW‡DVÆVÖVçE6–&Æ–æs¶†VBç&VÖ÷fR‚“¶–b†æW‡Còæ6Æ74Æ—7Bæ6öçF–ç2‚w7V2Öw&–BÖÖö&–ÆRr’–æW‡Bç&VÖ÷fR‚“·×Ò“°¢6öç7B6öÖ&–æVCÔ'&’æg&öÒ‡&ö÷BçVW'•6VÆV7F÷$ÆÂ‚u¶FF×vV"Ö6öÖ&B×7FG2×c…Òr’’æf–æB†æöFSÓâý	­½íÝ…Ç2¥ÂõÇ2­}-ö’çFW7B†æöFRçVW'•6VÆV7F÷"‚ræ²r“òçFW‡D6öçFVçGÇÂrr’“°¢–b†6öÖ&–æVB—¶6öç7Bæ÷&ÖÆ—¦VCÖæ÷&ÖÆ—¦UÆ–W%vV##‡Æ–W"“¶6öÖ&–æVBæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&V&Vv–ârÆÆF—b6Æ73Ò&–æfòÖ6&B"FF×vV"Ö6öÖ&B×7FG2×c#Ò&&Ö÷"#ãÆF—b6Æ73Ò&²#í	­½íÝƒÂöF—cãÆF—b6Æ73Ò'b#âG´çVÖ&W"†æ÷&ÖÆ—¦VBç7FG3òæ&Ö÷$6Æ77ÇÃ—ÓÂöF—cãÂöF—cãÆF—b6Æ73Ò&–æfòÖ6&B"FF×vV"Ö6öÖ&B×7FG2×c#Ò&FVfVç6R#ãÆF—b6Æ73Ò&²#í	}-ÂöF—cãÆF—b6Æ73Ò'b#âG´çVÖ&W"†æ÷&ÖÆ—¦VBç7FG3òæFVfVç6WÇÃ—ÓÂöF—cãÂöF—cæ“¶6öÖ&–æVBç&VÖ÷fR‚“·Ð¢&WGW&â&W7VÇC°¢Ó° ¢6öç7BvV$–çfVçF÷'•æVÄ&Vf÷&S3×vV$–çfVçF÷'•æVÅccs°¢vV$–çfVçF÷'•æVÅccsÖgVæ7F–öâ‡&uÆ–W"—°¢6öç7BÆ–W#Öæ÷&ÖÆ—¦UÆ–W%vV##‡&uÆ–W"’Æ&6S×vV$–çfVçF÷'•æVÄ&Vf÷&S3‡Æ–W"’Ç&÷w3×Æ–W"çFW‡D–çfVçF÷'”—FV×7ÇÅµÓ°¢–b‚&÷w2æÆVæwF‚—&WGW&â&6S°¢6öç7B&Æö6³ÖÇ6V7F–öâ6Æ73Ò'vV"×FW‡BÖ–çfVçF÷'’×c3#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ý]MÍ]-²]r-]ÂöF—cãÆF—b6Æ73Ò'vV"×FW‡BÖ–çfVçF÷'’ÖÆ—7B×c3#âG·&÷w2æÖ‡&÷sÓæÆF—b6Æ73Ò'vV"×FW‡BÖ–çfVçF÷'’×&÷r×c3#ãÇ7ãâG¶æ÷&ÖÆ—¦U&–6„‡FÖÂ‡&÷rææÖR—ÓÂ÷7ããÆ#ì9rG´çVÖ&W"‡&÷rçG—ÇÃ—ÓÂö#ãÂöF—cæ’æ¦ö–â‚rr—ÓÂöF—cãÂ÷6V7F–öãæ°¢&WGW&â&6Rç&WÆ6R‚óÅÂ÷6V7F–öãåÇ2¢BòÆG¶&Æö6·ÓÂ÷6V7F–öãæ“°¢Ó° ¢v–æF÷räu%uvV$fVGW&U6µc#Ôö&¦V7Bæg&VW¦R‡·fW'6–öã¢sãã3RrÆæ÷&ÖÆ—¦T—FVÓ¦æ÷&ÖÆ—¦T—FVÕvV#‚Ææ÷&ÖÆ—¦UÆ–W#¦æ÷&ÖÆ—¦UÆ–W%vV##Ææ÷&ÖÆ—¦U6¶–ÆÃ¦æ÷&ÖÆ—¦U6¶–ÆÅvV##Æ&6†—fTWV—ÖVçDf7G3¦&6†—fTWV—ÖVçDf7G5vV%c3Ò“° ¢ò¢cããC’(	BW'6—7FVçBvV"æf–vF–öâæBÖö&–ÆR&6²†æFÆ–ær¢ð¢6öç7BtT%ôäeô´U•õcC“Òvw'rçvV"ææf–vF–öâçcC’s°¢6öç7BtT%õ45$TTå5õcC“ÖæWr6WB…²v†öÖRrÂv&6†—fRrÂvÖ&¶WBrÂv6†BrÂv6öÖ&BrÂw&öf–ÆRuÒ“°¢ÆWBvV$æe÷cC“ÖfÇ6RÇvV$æe67&VVåcC“ÒrrÇvV$æe67&öÆÅF–ÖW%cC“Ó°¢gVæ7F–öâvV$æe6æ6†÷EcC’‚—°¢&WGW&ç°¢67&VVã¥tT%õ45$TTå5õcC’æ†2„çV’ç67&VVâ“ôçV’ç67&VVã¢v†öÖRrÀ¢67&öÆÅ“¤ÖF‚æÖ‚ƒÄÖF‚çG'Væ2‡v–æF÷rç67&öÆÅ—ÇÆFö7VÖVçBç67&öÆÆ–ætVÆVÖVçCòç67&öÆÅF÷ÇÃ’’À¢&6†—fUF#¤çV’æ&6†—fUF"Ç6VÆV7FVD&6†—fT–C¤çV’ç6VÆV7FVD&6†—fT–BÇ6VÆV7FVD&6†—fUG—S¤çV’ç6VÆV7FVD&6†—fUG—RÀ¢&6†—fUVW'“¤çV’æ&6†—fUVW'’Æ&6†—fU66÷Ucs“¤çV’æ&6†—fU66÷Ucs’Æ&6†—fT6FVv÷'•cs“¤çV’æ&6†—fT6FVv÷'•cs’À¢&6†—fU7FGW5cs“¤çV’æ&6†—fU7FGW5cs’Æ&6†—fU6÷'Ecs“¤çV’æ&6†—fU6÷'Ecs’À¢6VÆV7FVEF‡&VD¶W“¤çV’ç6VÆV7FVEF‡&VD¶W’Ç6VÆV7FVD6öÖ&E66VæT–C¤çV’ç6VÆV7FVD6öÖ&E66VæT–BÀ¢fö7W6VE7—7FVÔ–C¤çV’æfö7W6VE7—7FVÔ–BÆvÆ‡•6VÆV7FVE7—7FVÔ–C¤çV’ævÆ‡•6VÆV7FVE7—7FVÔ–BÆvÆ‡•6VÆV7FVEÆæWD–C¤çV’ævÆ‡•6VÆV7FVEÆæWD–BÀ¢&öf–ÆUF#¤çV’ç&öf–ÆUF"Ç&öf–ÆT—FVÔÖöFÃ¤çV’ç&öf–ÆT—FVÔÖöFÃöFVW„çV’ç&öf–ÆT—FVÔÖöFÂ“¦çVÆÂÀ¢Ö&¶WEF#¦Ö&¶WEF%vV%cs2ÆÖ&¶WE6VÆV7F–öã¦Ö&¶WE6VÆV7F–öåvV%csöFVW†Ö&¶WE6VÆV7F–öåvV%cs“¦çVÆÂÀ¢7Fö6µ6VÆV7F–öã§7Fö6µ6VÆV7F–öåvV%csCöFVW‡7Fö6µ6VÆV7F–öåvV%csB“¦çVÆÂÇ7Fö6µF–ÖVg&ÖS§7Fö6µF–ÖVg&ÖUvV%cC€¢Ó°¢Ð¢gVæ7F–öâ6fUvV$æf–vF–öåcC’‚—°¢–b„çV’æ&ö÷BÓÒvwÇÂç6W76–öãòçW6W$–B—&WGW&ã°¢G'—·6W76–öå7F÷&vRç6WD—FVÒ…tT%ôäeô´U•õcC’Ä¥4ôâç7G&–æv–g’‡vV$æe6æ6†÷EcC’‚’’“·Ö6F6‡·Ð¢Ð¢gVæ7F–öâ&W7F÷&UvV$æf–vF–öåcC’‚—°¢ÆWB6fVCÖçVÆÃ·G'—·6fVCÔ¥4ôâç'6R‡6W76–öå7F÷&vRævWD—FVÒ…tT%ôäeô´U•õcC’—ÇÂvçVÆÂr“·Ö6F6‡·Ð¢–b‚6fVGÇÂtT%õ45$TTå5õcC’æ†2‡6fVBç67&VVâ’—6fVC×·67&VVã¢v†öÖRrÇ67&öÆÅ“£Ó°¢²v&6†—fUF"rÂw6VÆV7FVD&6†—fT–BrÂw6VÆV7FVD&6†—fUG—RrÂv&6†—fUVW'’rÂv&6†—fU66÷Ucs’rÂv&6†—fT6FVv÷'•cs’rÂv&6†—fU7FGW5cs’rÂv&6†—fU6÷'Ecs’rÂw6VÆV7FVEF‡&VD¶W’rÂw6VÆV7FVD6öÖ&E66VæT–BrÂvfö7W6VE7—7FVÔ–BrÂvvÆ‡•6VÆV7FVE7—7FVÔ–BrÂvvÆ‡•6VÆV7FVEÆæWD–BrÂw&öf–ÆUF"uÒæf÷$V6‚†¶W“Óç¶–b‡6fVE¶¶W•ÒÖçVÆÂ”çV•¶¶W•Ó×6fVE¶¶W•Ó·Ò“°¢çV’ç67&VVãÕ%TåD”ÔRæ†–FT6öÖ&Bbg6fVBç67&VVãÓÓÒv6öÖ&Bsòv†öÖRs§6fVBç67&VVã°¢–b‡6fVBæÖ&¶WEF"–Ö&¶WEF%vV%cs3×6fVBæÖ&¶WEF#ÓÓÒw7Fö6·2sòw7Fö6·2s¢vvööG2s°¢Ö&¶WE6VÆV7F–öåvV%cs×6fVBæÖ&¶WE6VÆV7F–öâbgG—Vöb6fVBæÖ&¶WE6VÆV7F–öãÓÓÒvö&¦V7Bs÷6fVBæÖ&¶WE6VÆV7F–öã¦çVÆÃ°¢7Fö6µ6VÆV7F–öåvV%csC×6fVBç7Fö6µ6VÆV7F–öâbgG—Vöb6fVBç7Fö6µ6VÆV7F–öãÓÓÒvö&¦V7Bs÷6fVBç7Fö6µ6VÆV7F–öã¦çVÆÃ°¢–b‡6fVBç7Fö6µF–ÖVg&ÖR—7Fö6µF–ÖVg&ÖUvV%cCƒ×6fVBç7Fö6µF–ÖVg&ÖS°¢vV$æe67&VVåcC“ÔçV’ç67&VVã°¢†—7F÷'’ç&WÆ6U7FFR‡¶w't–çFW&æÅcC“§G'VRÇ67&VVã¤çV’ç67&VVçÒÂrrÆÆö6F–öâæ‡&Vb“°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚“Óç&WVW7Dæ–ÖF–öäg&ÖR‚‚“Óç°¢v–æF÷rç67&öÆÅFò‡·F÷¤ÖF‚æÖ‚ƒÄçVÖ&W"‡6fVBç67&öÆÅ’—ÇÃ’ÆÆVgC£Æ&V†f–÷#¢vWFòwÒ“°¢–b‡6fVBç&öf–ÆT—FVÔÖöFÃòæ—FVÔ–B–÷Vå&öf–ÆT—FVÔÖöFÅcc‡6fVBç&öf–ÆT—FVÔÖöFÂæ—FVÔ–BÇ6fVBç&öf–ÆT—FVÔÖöFÂ“°¢Ò’“°¢Ð¢6öç7B&VæFW$7W'&VçE67&VVä&Vf÷&TæecC“×&VæFW$7W'&VçE67&VVã°¢&VæFW$7W'&VçE67&VVãÖgVæ7F–öâ‚—°¢6öç7B6†ævVCÔ&ööÆVâ‡vV$æe67&VVåcC’bgvV$æe67&VVåcC’ÓÔçV’ç67&VVâ“°¢–b‚vV$æe67&VVåcC’–†—7F÷'’ç&WÆ6U7FFR‡¶w't–çFW&æÅcC“§G'VRÇ67&VVã¤çV’ç67&VVçÒÂrrÆÆö6F–öâæ‡&Vb“°¢VÇ6R–b†6†ævVBbbvV$æe÷cC’–†—7F÷'’çW6…7FFR‡¶w't–çFW&æÅcC“§G'VRÇ67&VVã¤çV’ç67&VVçÒÂrrÆÆö6F–öâæ‡&Vb“°¢vV$æe67&VVåcC“ÔçV’ç67&VVã°¢6öç7B&W7VÇC×&VæFW$7W'&VçE67&VVä&Vf÷&TæecC’‚“°¢6fUvV$æf–vF–öåcC’‚“°¢&WGW&â&W7VÇC°¢Ó°¢6öç7B÷Vå&öf–ÆT—FVÔÖöFÄ&Vf÷&TæecC“Ö÷Vå&öf–ÆT—FVÔÖöFÅcc°¢÷Vå&öf–ÆT—FVÔÖöFÅccÖgVæ7F–öâ†—FVÔ–BÆÖWF×·Ò—°¢6öç7BÇ&VG”÷VãÔ&ööÆVâ†Fö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖ—FVÒÖÖöFÂ×ccr’“°¢6öç7B&W7VÇCÖ÷Vå&öf–ÆT—FVÔÖöFÄ&Vf÷&TæecC’†—FVÔ–BÆÖWF“°¢–b‚Ç&VG”÷VâbbvV$æe÷cC’–†—7F÷'’çW6…7FFR‡¶w't–çFW&æÅcC“§G'VRÇ67&VVã¤çV’ç67&VVâÆÆ–W#¢w&öf–ÆRÖ—FVÒwÒÂrrÆÆö6F–öâæ‡&Vb“°¢6fUvV$æf–vF–öåcC’‚“°¢&WGW&â&W7VÇC°¢Ó°¢6öç7B6Æ÷6U&öf–ÆT—FVÔÖöFÄ&Vf÷&TæecC“Ö6Æ÷6U&öf–ÆT—FVÔÖöFÅcc°¢6Æ÷6U&öf–ÆT—FVÔÖöFÅccÖgVæ7F–öâ‚—°¢6öç7B†DÖöFÃÔ&ööÆVâ†Fö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖ—FVÒÖÖöFÂ×ccr’“°¢6öç7B&W7VÇCÖ6Æ÷6U&öf–ÆT—FVÔÖöFÄ&Vf÷&TæecC’‚“°¢6fUvV$æf–vF–öåcC’‚“°¢–b††DÖöFÂbbvV$æe÷cC’bf†—7F÷'’ç7FFSòæÆ–W#ÓÓÒw&öf–ÆRÖ—FVÒr–†—7F÷'’æ&6²‚“°¢&WGW&â&W7VÇC°¢Ó°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚w÷7FFRrÆWfVçCÓç°¢vV$æe÷cC“×G'VS°¢–b†Fö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖ—FVÒÖÖöFÂ×ccr’–6Æ÷6U&öf–ÆT—FVÔÖöFÄ&Vf÷&TæecC’‚“°¢6öç7BF&vWCÖWfVçBç7FFSòæw't–çFW&æÅcC’betT%õ45$TTå5õcC’æ†2†WfVçBç7FFRç67&VVâ“öWfVçBç7FFRç67&VVã¦çVÆÃ°¢–b‡F&vWBbgF&vWBÓÔçV’ç67&VVâ—´çV’ç67&VVã×F&vWC·&VæFW$7W'&VçE67&VVâ‚“·Ð¢6fUvV$æf–vF–öåcC’‚“°¢VWVTÖ–7&÷F6²‚‚“Óç·vV$æe÷cC“ÖfÇ6S·Ò“°¢Ò“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚w67&öÆÂrÂ‚“Óç¶6ÆV%F–ÖV÷WB‡vV$æe67&öÆÅF–ÖW%cC’“·vV$æe67&öÆÅF–ÖW%cC“×6WEF–ÖV÷WB‡6fUvV$æf–vF–öåcC’Ã#“·ÒÇ·76—fS§G'VWÒ“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚wvV†–FRrÇ6fUvV$æf–vF–öåcC’“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚v&Vf÷&WVæÆöBrÇ6fUvV$æf–vF–öåcC’“° ¢7–æ2gVæ7F–öâ–æ—B‚’°¢v—B&WF—&U&VÖ÷fVEvV$æ÷F–f–6F–öç5c“"‚“°¢&–æDvÆö&ÄWfVçG2‚“°¢v—BÆöDÆö6Å7FFR‚“°¢7–æ5&VÖVÖ&W$6öçG&öÇ2‚“° ¢6öç7B†466†VBÒ%TåD”ÔRæ6Æ÷VDöæÇ’òfÇ6R¢v—B&ö÷Dg&öÔ66†T–dæVVFVB‚“°¢–b‚æ6öæf–r’æ6öæf–rÒæ÷&ÖÆ—¦T6öæf–r‡²W&Ã¢DTdTÅE2çW&ÂÂ6×–vä–C¢vÖ–ârÂFWf–6TÆ&VÃ¢wvV"×Æ–W"rÒ“°¢–b††46öæf–r‚’’°¢G'’°¢v—BVÆÄWfW'—F†–ær‡²6–ÆVçC¢G'VRÒ“°¢Ò6F6‚†W'&÷"’°¢–b‚†466†VB’°¢÷Vä&ö÷B‚vÆöv–âr“°¢&VæFW$Æöv–â‚“°¢6öç7B7FGW2ÒB‚r6Æöv–â×7FGW2r“°¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒ	ÝR=M½íÂýí½=}-Âýí¢ý]íÝm]“¢G¶W'&÷"æÖW76vWÖ°¢&WGW&ã°¢Ð¢æ÷F–g’†	}==m]Ò½í­½ÍÝ½’­]‚â	í½­â]}Ý]Mí-=ýÝã¢G¶W'&÷"æÖW76vWÖÂwv&âr“°¢Ð¢&VæFW$Æöv–â‚“°¢–b„ç6W76–öãòçW6W$–BbbæFFçÆ–W'2æ†2„ç6W76–öâçW6W$–B’bb6W76–öä6×–väÆÆ÷vVEcC’‚’’°¢Ç”W&F†VÖUcC’†6×–våcC’‡6VÆV7FVD6×–våcC’‚’’“°¢÷Vä&ö÷B‚vr“°¢&W7F÷&UvV$æf–vF–öåcC’‚“°¢&VæFW$7W'&VçE67&VVâ‚“°¢7F'E&VÇF–ÖU7–æ2‚“°¢ÒVÇ6R°¢–b„ç6W76–öãòçW6W$–Bbb7G&–ær„ç6W76–öâç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br’²ç6W76–öâÒçVÆÃ²v—B7F÷&vU&VÖ÷fR„´U•2ç6W76–öâ“²Ð¢÷Vä&ö÷B‚vÆöv–âr“°¢Ð¢&WGW&ã°¢Ð¢÷Vä&ö÷B‚vÆöv–âr“°¢&VæFW$Æöv–â‚“°¢6öç7B7FGW2ÒB‚r6Æöv–â×7FGW2r“°¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒ}	-½]-Rý]íÝm‚--]M-R]=âýí½Ââs°¢Ð ¢v–æF÷räu%t–çfVçF÷'”ÖVçUcC#òæ&–æB‡°¢6VÆV7F÷#¢r767&VVâ×&öf–ÆR¶FF×vV"Ö–çfVçF÷'’ÖG&r×ccuÒrÀ¢7W'&VçC¦7W'&VçEÆ–W"Æ—FVÓ¦—FVÕvV%ccrÆæ÷&ÖÆ—¦S¦æ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccrÀ¢Æ–÷WC¦'V–ÆD–çfVçF÷'”Æ–÷WEvV%ccrÆ66WG3§6Æ÷D66WG5vV%ccrÀ¢6öÖÖ—C¢†×WFF÷"Ææ÷F–6R“Óæ6öÖÖ—EÆ–W$×WFF–öâ†×WFF÷"Ææ÷F–6R’ÆFWF–Ç3¦÷Vå&öf–ÆT—FVÔÖöFÅcc ¢Ò“°¢v–æF÷räu%t‡V$'&–FvUcS2Ò°¢7W'&VçEÆ–W"À¢7W'&VçEÆæWBÀ¢ÆæWG3¢‚’Óâ'&’æg&öÒ„æFFçÆæWG2çfÇVW2‚’’À¢—FVÓ¢–BÓâæFFæ—FV×2ævWB…7G&–ær†–BÇÂrr’’ÇÂçVÆÂÀ¢ç3¢–BÓâæFFæç72ævWB…7G&–ær†–BÇÂrr’’ÇÂçVÆÂÀ¢'F–6ÆS¢–BÓâæFFæ'F–6ÆW2ævWB…7G&–ær†–BÇÂrr’’ÇÂçVÆÂÀ¢6öÖÖ—C¢†×WFF÷"Âæ÷F–6RÒ}
í-íýÝR]í]Ý]Ýâr’Óâ6öÖÖ—EÆ–W$×WFF–öâ†×WFF÷"Âæ÷F–6R’À¢÷Vä'F–6ÆS¢–BÓâ÷Vä'F–6ÆT'”–B…7G&–ær†–BÇÂrr’Â²F—&V7D66W73¢G'VRÒ’À¢÷Vå7Fö6·3¢‚’Óâ²Ö&¶WEF%vV%cs2Òw7Fö6·2s²çV’ç67&VVâÒvÖ&¶WBs²&VæFW$7W'&VçE67&VVâ‚“²ÒÀ¢æ÷F–g’À¢W62À¢FVWÀ¢¢ ¢Ó°¢6öç7B&VæFW%&öf–ÆT&Vf÷&U6†VWEcC"Ò&VæFW%&öf–ÆS°¢&VæFW%&öf–ÆRÒgVæ7F–öâ‚’°¢6öç7B†÷7CÒB‚r767&VVâ×&öf–ÆRr’Ç&Wf–÷W3×v–æF÷räu%u&öf–ÆU6†VWEcC#òæ6GW&T–çfVçF÷'’††÷7B’Ç67&öÆÃÖFö7VÖVçBç67&öÆÆ–ætVÆVÖVçCòç67&öÆÅF÷ÇÂ°¢6öç7B&W7VÇBÒ&VæFW%&öf–ÆT&Vf÷&U6†VWEcC"‚“°¢–b„çV’ç&öf–ÆUF"ÓÒw6¶–ÆÇ2r’v–æF÷räu%u&öf–ÆU6†VWEcC#òæÆ–÷WEvV"‚B‚r767&VVâ×&öf–ÆRr’Âæ÷&ÖÆ—¦T–çfVçF÷'•Æ–W%vV%ccr†7W'&VçEÆ–W"‚’ÇÂ·Ò’“°¢v–æF÷räu%u&öf–ÆU6†VWEcC#òç&W7F÷&T–çfVçF÷'’††÷7BÇ&Wf–÷W2“°¢–b‡&Wf–÷W2bbFö7VÖVçBç67&öÆÆ–ætVÆVÖVçB–Fö7VÖVçBç67&öÆÆ–ætVÆVÖVçBç67&öÆÅF÷×67&öÆÃ°¢&WGW&â&W7VÇC°¢Ó° ¢–æ—B‚’æ6F6‚†W'&÷"Óâ°¢÷Vä&ö÷B‚vÆöv–âr“°¢&VæFW$Æöv–â‚“°¢6öç7B7FGW2ÒB‚r6Æöv–â×7FGW2r“°¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒW'&÷"æÖW76vS°¢æ÷F–g’†	í­}ý=­¢G¶W'&÷"æÖW76vWÖÂvW'"r“°¢Ò“°§Ò’‚“° 