let worldData = {};
let PLAYER_TEMPLATES = {};
let PLAYER_LIST = [];
let SYSTEMS = [];
let PLANETS = {};
let PLANET_LIST = [];
let NPCS = {};
let NPC_LIST = [];
let EQUIPMENT = {};
let EQUIPMENT_LIST = [];
let WEAPON_OPTIONS = [];
let ARMOR_OPTIONS = [];
let FLORA = {};
let FLORA_LIST = [];
let FAUNA = {};
let FAUNA_LIST = [];
let ARTICLES = {};
let ARTICLE_LIST = [];


const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const deep = value => JSON.parse(JSON.stringify(value));
const lerp = (a,b,t) => a + (b-a) * t;
const clamp = (v,min,max) => Math.min(Math.max(v,min), max);
const now = () => performance.now();
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const GRPG_APP_VERSION = String(window.electronAPI?.appVersion || '1.0.143');

/* v1.0.75 â€” cosmetic in-world calendar; stored timestamps remain unchanged */
const GRPG_LORE_YEAR_V1075 = 3616;
const GRPG_LORE_ERA_V1075 = 'Ð’.Ð­.';
function formatLoreDateV1075(value, options = {}) {
  if (value == null || value === '') return options.fallback ?? 'â€”';
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
  const includeTime = options.includeTime ?? !dateOnly;
  return includeTime ? `${dateText}, ${pad(hour)}:${pad(minute)}` : dateText;
}
window.GRPGCosmeticDateV1075 = Object.freeze({ year: GRPG_LORE_YEAR_V1075, era: GRPG_LORE_ERA_V1075, format: formatLoreDateV1075 });

const Debug = {
  log(label, payload) {
    try { console.log(`[DEBUG] ${label}`, payload ?? ''); } catch {}
    try { window.electronAPI?.debugLog?.(label, payload ?? null); } catch {}
  },
  error(label, payload) {
    try { console.error(`[DEBUG:${label}]`, payload ?? ''); } catch {}
    try { window.electronAPI?.debugLog?.(`ERROR:${label}`, payload ?? null); } catch {}
  }
};



const Toast = {
  _timer: null,
  show(message, kind = 'info') {
    const el = document.querySelector('#toast');
    const safeKind = ['ok', 'err', 'info'].includes(kind) ? kind : 'info';
    if (!el) {
      try { console.log(`[TOAST:${safeKind}] ${message}`); } catch {}
      return;
    }
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    el.textContent = String(message ?? '');
    el.className = `toast ${safeKind} show`;
    this._timer = setTimeout(() => {
      el.className = `toast ${safeKind}`;
      this._timer = null;
    }, 2600);
  }
};

const GRAPHICS_MODE_STORAGE_KEY_V1098 = 'GRPGI_GRAPHICS_MODE';
const GraphicsMode = {
  read() {
    try { return localStorage.getItem(GRAPHICS_MODE_STORAGE_KEY_V1098) === 'lite'; } catch { return false; }
  },
  isLite() {
    return document.documentElement.dataset.graphicsMode === 'lite';
  },
  refreshButton() {
    const button = document.getElementById('lite-graphics-btn');
    if (!button) return;
    const enabled = this.isLite();
    button.textContent = enabled ? 'Ð“Ð ÐÐ¤Ð˜ÐšÐ: Ð£ÐŸÐ ÐžÐ©ÐÐÐÐÐ¯' : 'Ð“Ð ÐÐ¤Ð˜ÐšÐ: ÐŸÐžÐ›ÐÐÐ¯';
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.title = enabled ? 'Ð£Ð¿Ñ€Ð¾Ñ‰Ñ‘Ð½Ð½Ð°Ñ Ð³Ñ€Ð°Ñ„Ð¸ÐºÐ°: Ð¼Ð°ÐºÑÐ¸Ð¼Ð°Ð»ÑŒÐ½Ð°Ñ ÑÐºÐ¾Ð½Ð¾Ð¼Ð¸Ñ Ñ€ÐµÑÑƒÑ€ÑÐ¾Ð²' : 'ÐŸÐ¾Ð»Ð½Ð°Ñ Ð³Ñ€Ð°Ñ„Ð¸ÐºÐ°';
  },
  apply(enabled, options = {}) {
    const lite = Boolean(enabled);
    document.documentElement.dataset.graphicsMode = lite ? 'lite' : 'full';
    if (options.persist !== false) {
      try { localStorage.setItem(GRAPHICS_MODE_STORAGE_KEY_V1098, lite ? 'lite' : 'full'); } catch {}
    }
    this.refreshButton();
    try {
      Promise.resolve(window.electronAPI?.updatePlayerDisplayView?.({
        graphicsMode: lite ? 'lite' : 'full',
        updatedAt: new Date().toISOString()
      })).catch(() => {});
    } catch {}
    try {
      GalaxyMap.lastBackdropTransform = '';
      const layer = document.querySelector('.galaxy-backdrop-main');
      if (layer) layer.style.transform = '';
      GalaxyMap.stopAnimation();
      GalaxyMap.resize();
      GalaxyMap.requestFrame();
    } catch {}
    if (options.notify) Toast.show(lite ? 'Lite: Ð²ÐºÐ»ÑŽÑ‡ÐµÐ½Ð° Ð¼Ð°ÐºÑÐ¸Ð¼Ð°Ð»ÑŒÐ½Ð°Ñ ÑÐºÐ¾Ð½Ð¾Ð¼Ð¸Ñ Ð³Ñ€Ð°Ñ„Ð¸ÐºÐ¸.' : 'Full: Ð¿Ð¾Ð»Ð½Ð°Ñ Ð³Ñ€Ð°Ñ„Ð¸ÐºÐ° Ð²ÐºÐ»ÑŽÑ‡ÐµÐ½Ð°.', 'info');
    return lite;
  },
  toggle() {
    return this.apply(!this.isLite(), { persist: true, notify: true });
  }
};
GraphicsMode.apply(GraphicsMode.read(), { persist: false, notify: false });
window.GRPGGraphicsMode = GraphicsMode;

/* v1.0.90 â€” in-app confirmation dialog.
   Native window.confirm can leave an Electron BrowserWindow without keyboard focus
   after it closes. This dialog stays inside the renderer and restores the previous
   focused control explicitly. */
function requestConfirmationV1090(message, options = {}) {
  return new Promise(resolve => {
    document.querySelector('.app-confirm-v1090')?.remove();
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const host = document.createElement('div');
    host.className = 'app-confirm-v1090';
    host.setAttribute('role', 'presentation');
    host.innerHTML = `
      <div class="app-confirm-backdrop-v1090" data-confirm-cancel-v1090></div>
      <section class="app-confirm-card-v1090" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title-v1090" aria-describedby="app-confirm-message-v1090">
        <div class="mono accent" id="app-confirm-title-v1090"></div>
        <div class="app-confirm-message-v1090" id="app-confirm-message-v1090"></div>
        <div class="row app-confirm-actions-v1090">
          <button class="secondary" type="button" data-confirm-cancel-v1090></button>
          <button class="primary" type="button" data-confirm-accept-v1090></button>
        </div>
      </section>`;
    host.querySelector('#app-confirm-title-v1090').textContent = String(options.title || 'ÐŸÐ¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´ÐµÐ½Ð¸Ðµ');
    host.querySelector('#app-confirm-message-v1090').textContent = String(message || 'ÐŸÑ€Ð¾Ð´Ð¾Ð»Ð¶Ð¸Ñ‚ÑŒ?');
    host.querySelector('[data-confirm-cancel-v1090]:not(.app-confirm-backdrop-v1090)').textContent = String(options.cancelLabel || 'ÐžÑ‚Ð¼ÐµÐ½Ð°');
    host.querySelector('[data-confirm-accept-v1090]').textContent = String(options.acceptLabel || 'ÐŸÐ¾Ð´Ñ‚Ð²ÐµÑ€Ð´Ð¸Ñ‚ÑŒ');

    let finished = false;
    const finish = value => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKeyDown, true);
      host.remove();
      requestAnimationFrame(() => {
        try { window.focus(); } catch {}
        if (previous?.isConnected) {
          try { previous.focus({ preventScroll: true }); } catch { try { previous.focus(); } catch {} }
        }
      });
      resolve(Boolean(value));
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      if (event.key === 'Enter' && !event.target?.matches?.('[data-confirm-cancel-v1090]')) { event.preventDefault(); finish(true); }
    };
    host.addEventListener('click', event => {
      if (event.target.closest('[data-confirm-accept-v1090]')) finish(true);
      else if (event.target.closest('[data-confirm-cancel-v1090]')) finish(false);
    });
    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(host);
    requestAnimationFrame(() => host.querySelector('[data-confirm-accept-v1090]')?.focus());
  });
}
window.requestConfirmationV1090 = requestConfirmationV1090;


const SOUND_CONFIG = {
  // ÐŸÐ¾Ð»Ð¾Ð¶Ð¸ ÑÐ²Ð¾Ð¸ Ñ„Ð°Ð¹Ð»Ñ‹ Ð² renderer/assets/audio/ Ð¸ Ð¿Ñ€Ð¸ Ð½ÐµÐ¾Ð±Ñ…Ð¾Ð´Ð¸Ð¼Ð¾ÑÑ‚Ð¸ Ð¿Ð¾Ð¼ÐµÐ½ÑÐ¹ Ð¿ÑƒÑ‚Ð¸ Ð½Ð¸Ð¶Ðµ.
  uiClick: './assets/audio/ui_click.mp3',
  moduleOpen: './assets/audio/module_open.mp3',
  systemJump: './assets/audio/system_jump.mp3',
  planetFocus: './assets/audio/planet_focus.mp3',
  marketBuy: './assets/audio/market_buy.mp3',
  success: './assets/audio/action_success.mp3',
  fail: './assets/audio/action_fail.mp3',
  ambient: './assets/audio/ambient_space.mp3'
};

const SYSTEM_MARKER_STYLES = [
  { id: 'orbital', label: 'Ð—Ð²Ñ‘Ð·Ð´Ð½Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°' },
  { id: 'node', label: 'Ð£Ð·ÐµÐ»' },
  { id: 'blackhole', label: 'Ð§Ñ‘Ñ€Ð½Ð°Ñ Ð´Ñ‹Ñ€Ð°' },
  { id: 'ship', label: 'ÐšÐ¾Ñ€Ð°Ð±Ð»ÑŒ' },
  { id: 'diamond', label: 'ÐžÐ¿Ð°ÑÐ½Ð¾ÑÑ‚ÑŒ' },
  { id: 'square', label: 'ÐŸÑ€Ð¾Ñ‡ÐµÐµ' },
  { id: 'credits', label: 'Ð¢Ð¾Ñ€Ð³Ð¾Ð²Ð»Ñ' }
];

const GALAXY_MARKER_LEGEND = [
  { id: 'ship', label: 'ÐšÐ¾Ñ€Ð°Ð±Ð»ÑŒ', glyph: 'â–²' },
  { id: 'node', label: 'Ð£Ð·ÐµÐ»', glyph: 'âŠ•' },
  { id: 'blackhole', label: 'Ð§Ñ‘Ñ€Ð½Ð°Ñ Ð´Ñ‹Ñ€Ð°', glyph: 'â—‰' },
  { id: 'diamond', label: 'ÐžÐ¿Ð°ÑÐ½Ð¾ÑÑ‚ÑŒ / Ð·Ð°Ð¿Ñ€ÐµÑ‚Ð½Ð°Ñ Ð·Ð¾Ð½Ð°', glyph: 'â—†' },
  { id: 'square', label: 'ÐŸÑ€Ð¾Ñ‡ÐµÐµ', glyph: 'â– ' },
  { id: 'credits', label: 'Ð¢Ð¾Ñ€Ð³Ð¾Ð²Ð»Ñ / ÐºÑ€ÑƒÐ¿Ð½Ñ‹Ð¹ Ñ€Ñ‹Ð½Ð¾Ðº', glyph: 'Â¤' },
  { id: 'orbital', label: 'Ð—Ð²Ñ‘Ð·Ð´Ð½Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°', glyph: 'â—Ž' }
];

const AudioManager = {
  enabled: true,
  ambientStarted: false,
  ambientNode: null,
  masterVolume: 0.8,
  resolve(key) {
    return SOUND_CONFIG[key] || '';
  },
  play(key, options = {}) {
    if (!this.enabled) return;
    const src = this.resolve(key);
    if (!src) return;
    try {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = clamp(Number(options.volume ?? 0.9) * this.masterVolume, 0, 1);
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {}
  },
  ensureAmbient() {
    if (!this.enabled || this.ambientNode) return this.ambientNode;
    const src = this.resolve('ambient');
    if (!src) return null;
    try {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.loop = true;
      audio.volume = 0.22 * this.masterVolume;
      this.ambientNode = audio;
      return audio;
    } catch {
      return null;
    }
  },
  onUserGesture() {
    if (this.ambientStarted) return;
    const ambient = this.ensureAmbient();
    if (!ambient) return;
    this.ambientStarted = true;
    ambient.play().catch(() => { this.ambientStarted = false; });
  },
  stopAmbient() {
    if (!this.ambientNode) return;
    try {
      this.ambientNode.pause();
      this.ambientNode.currentTime = 0;
    } catch {}
    this.ambientStarted = false;
  }
};

const SESSION_KEY = 'galactic-session-v4';
const FALLBACK_STATE_KEY = 'galactic-fileless-state-v4';

const WORLD_SECTIONS = {
  players: { label: 'ÐŸÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð¸', mapKey: 'PLAYER_TEMPLATES', listKey: 'PLAYER_LIST' },
  systems: { label: 'Ð¡Ð¸ÑÑ‚ÐµÐ¼Ñ‹', arrayKey: 'SYSTEMS' },
  planets: { label: 'ÐŸÐ»Ð°Ð½ÐµÑ‚Ñ‹', mapKey: 'PLANETS', listKey: 'PLANET_LIST' },
  npcs: { label: 'NPC', mapKey: 'NPCS', listKey: 'NPC_LIST' },
  equipment: { label: 'Ð¡Ð½Ð°Ñ€ÑÐ¶ÐµÐ½Ð¸Ðµ', mapKey: 'EQUIPMENT', listKey: 'EQUIPMENT_LIST' },
  flora: { label: 'Ð¤Ð»Ð¾Ñ€Ð°', mapKey: 'FLORA', listKey: 'FLORA_LIST' },
  fauna: { label: 'Ð¤Ð°ÑƒÐ½Ð°', mapKey: 'FAUNA', listKey: 'FAUNA_LIST' },
  articles: { label: 'Ð¡Ñ‚Ð°Ñ‚ÑŒÐ¸ Ð°Ñ€Ñ…Ð¸Ð²Ð°', mapKey: 'ARTICLES', listKey: 'ARTICLE_LIST' }
};

function slugifyId(value, fallback = 'entity') {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[^a-z0-9Ð°-ÑÑ‘]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return slug || `${fallback}_${Date.now()}`;
}

function listText(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function parseListEditor(text) {
  return String(text || '').split('\n').map(v => v.trim()).filter(Boolean);
}

function parseInventoryEditor(text) {
  return String(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [itemId, qtyRaw] = line.split(':').map(v => v.trim());
      const qty = Math.max(1, Number(qtyRaw || 1));
      return { itemId, qty };
    });
}

function inventoryText(value) {
  return Array.isArray(value) ? value.map(entry => `${entry.itemId}:${entry.qty}`).join('\n') : '';
}

function formatCredits(value) {
  const amount = Math.max(0, Math.trunc(Number(value) || 0));
  const parts = String(amount).split('');
  let out = '';
  while (parts.length > 3) {
    out = '.' + parts.splice(parts.length - 3, 3).join('') + out;
  }
  out = parts.join('') + out;
  return `${out || '0'} â‚¹`;
}

function parseImplantsEditor(text) {
  return String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, status] = line.split('|').map(v => v.trim());
      return { name: name || 'Ð˜Ð¼Ð¿Ð»Ð°Ð½Ñ‚', status: status || 'Active' };
    });
}

function implantsText(value) {
  return Array.isArray(value) ? value.map(entry => `${entry.name}|${entry.status}`).join('\n') : '';
}

function parseMarketEditor(text) {
  return String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [itemId, priceRaw] = line.split(':').map(v => v.trim());
      const price = Math.max(0, Number(priceRaw || 0));
      return { itemId, price };
    });
}

function marketText(value) {
  return Array.isArray(value) ? value.map(entry => `${entry.itemId}:${entry.price}`).join('\n') : '';
}

function sortEntitiesForList(items) {
  return items.slice().sort((a, b) => {
    const av = (a.name || a.displayName || a.id || '').toLowerCase();
    const bv = (b.name || b.displayName || b.id || '').toLowerCase();
    return av.localeCompare(bv, 'ru');
  });
}

function serializeWorldSection(sectionName, source) {
  const meta = WORLD_SECTIONS[sectionName];
  if (!meta) throw new Error(`Unknown section: ${sectionName}`);
  if (meta.arrayKey) {
    return { [meta.arrayKey]: sortEntitiesForList(Array.isArray(source) ? source : []) };
  }
  const record = source || {};
  return {
    [meta.mapKey]: record,
    [meta.listKey]: sortEntitiesForList(Object.values(record))
  };
}

function createBlankEntity(type) {
  const stamp = Date.now().toString().slice(-6);
  if (type === 'players') {
    return {
      id: `player_${stamp}`,
      role: 'player',
      pass: '0000',
      shortName: `Agent${stamp.slice(-3)}`,
      displayName: 'ÐÐ¾Ð²Ñ‹Ð¹ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶',
      rank: 'Operative',
      avatarGlyph: 'PX',
      credits: 0,
      lore: '',
      notes: '',
      stats: { hp: 100, shield: 50, bio: 20 },
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      equipmentSlots: { weapon: WEAPON_OPTIONS[0]?.id || '', armor: ARMOR_OPTIONS[0]?.id || '' },
      inventory: [],
      implants: [],
      social: { npcIds: [], orgs: [] },
      currentPlanetId: '',
      image: '',
      relatedArticleIds: []
    };
  }
  if (type === 'systems') {
    return {
      id: `system_${stamp}`,
      name: 'ÐÐ¾Ð²Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°',
      markerLabel: 'Ð¢Ð¾Ñ‡ÐºÐ° Ð¸Ð½Ñ‚ÐµÑ€ÐµÑÐ°',
      markerStyle: 'orbital',
      color: '#7df9ff',
      pos: { x: 0.5, y: 0.5 },
      planetIds: [],
      routes: [],
      image: '',
      relatedArticleIds: [],
      visibility: { playerIds: [] }
    };
  }
  if (type === 'planets') {
    return {
      id: `planet_${stamp}`,
      name: 'ÐÐ¾Ð²Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°',
      code: `P-${stamp}`,
      color: '#7df9ff',
      dist: 24,
      speed: 0.0006,
      size: 8,
      location: { arm: '', node: '', system: '', obj: '' },
      physics: { type: '', mass: '', radius: '', gravity: '', climate: '', temp: '', atm: '' },
      socio: { pop: '', capital: '', gov: '', law: '' },
      pilot: { reference: '', info: '', warning: '' },
      npcIds: [], floraIds: [], faunaIds: [], market: [],
      image: '',
      relatedArticleIds: [],
      visibility: { playerIds: [] }
    };
  }
  if (type === 'npcs') {
    return { id: `npc_${stamp}`, name: 'ÐÐ¾Ð²Ñ‹Ð¹ NPC', role: '', location: '', summary: '', traits: [], image: '', relatedArticleIds: [], visibility: { playerIds: [] } };
  }
  if (type === 'equipment') {
    return { id: `item_${stamp}`, type: 'misc', name: 'ÐÐ¾Ð²Ñ‹Ð¹ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚', desc: '', rarity: 'Ð¾Ð±Ñ‹Ñ‡Ð½Ñ‹Ð¹', tags: [], image: '', relatedArticleIds: [], visibility: { playerIds: [] }, mechanicType: '', decryptorMode: 'decryptor', mechanicTitle: '', decryptorDefaultCipher: 'caesar', mechanicHint: '', mechanicTimeLimit: 20, mechanicCodeLength: 5, mechanicSlots: 3 };
  }
  if (type === 'flora') {
    return { id: `flora_${stamp}`, name: 'ÐÐ¾Ð²Ð°Ñ Ñ„Ð»Ð¾Ñ€Ð°', habitat: '', summary: '', danger: 'ÐÐ¸Ð·ÐºÐ°Ñ', use: '', image: '', relatedArticleIds: [], visibility: { playerIds: [] } };
  }
  if (type === 'fauna') {
    return { id: `fauna_${stamp}`, name: 'ÐÐ¾Ð²Ð°Ñ Ñ„Ð°ÑƒÐ½Ð°', habitat: '', summary: '', danger: 'ÐÐ¸Ð·ÐºÐ°Ñ', behavior: '', image: '', hpMax: 10, damage: '1', hitBonus: 0, attackRange: 1, moveRange: 6, visionRange: 6, armorClass: 10, defense: 0, initiative: 0, relatedArticleIds: [], visibility: { playerIds: [] } };
  }
  if (type === 'articles') {
    return {
      id: `article_${stamp}`,
      name: 'ÐÐ¾Ð²Ð°Ñ ÑÑ‚Ð°Ñ‚ÑŒÑ',
      category: 'ÐÑ€Ñ…Ð¸Ð²',
      summary: '',
      body: '',
      searchOnly: false,
      image: '',
      relatedPlanetIds: [], relatedNpcIds: [], relatedItemIds: [], relatedFloraIds: [], relatedFaunaIds: [], relatedArticleIds: [],
      visibility: { playerIds: [] }
    };
  }
  return { id: `entity_${stamp}`, name: 'ÐÐ¾Ð²Ð°Ñ ÑÑƒÑ‰Ð½Ð¾ÑÑ‚ÑŒ' };
}

function applyWorldData(payload = {}) {
  worldData = payload || {};
  PLAYER_TEMPLATES = worldData.players?.PLAYER_TEMPLATES || {};
  PLAYER_LIST = worldData.players?.PLAYER_LIST || Object.values(PLAYER_TEMPLATES);
  SYSTEMS = worldData.systems?.SYSTEMS || [];
  PLANETS = worldData.planets?.PLANETS || {};
  PLANET_LIST = worldData.planets?.PLANET_LIST || Object.values(PLANETS);
  NPCS = worldData.npcs?.NPCS || {};
  NPC_LIST = worldData.npcs?.NPC_LIST || Object.values(NPCS);
  EQUIPMENT = worldData.equipment?.EQUIPMENT || {};
  EQUIPMENT_LIST = worldData.equipment?.EQUIPMENT_LIST || Object.values(EQUIPMENT);
  WEAPON_OPTIONS = worldData.equipment?.WEAPON_OPTIONS || EQUIPMENT_LIST.filter(item => item.type === 'weapon');
  ARMOR_OPTIONS = worldData.equipment?.ARMOR_OPTIONS || EQUIPMENT_LIST.filter(item => item.type === 'armor');
  FLORA = worldData.flora?.FLORA || {};
  FLORA_LIST = worldData.flora?.FLORA_LIST || Object.values(FLORA);
  FAUNA = worldData.fauna?.FAUNA || {};
  FAUNA_LIST = worldData.fauna?.FAUNA_LIST || Object.values(FAUNA);
  ARTICLES = worldData.articles?.ARTICLES || {};
  ARTICLE_LIST = worldData.articles?.ARTICLE_LIST || Object.values(ARTICLES);

  Object.values(PLAYER_TEMPLATES).forEach(player => {
    if (typeof player.currentPlanetId !== 'string') player.currentPlanetId = '';
  });
  SYSTEMS = (SYSTEMS || []).map(system => {
    const markerStyle = String(system?.markerStyle || 'orbital').trim();
    const validMarkerStyle = SYSTEM_MARKER_STYLES.some(style => style.id === markerStyle) ? markerStyle : 'orbital';
    return ({
      color: '#7df9ff',
      markerLabel: system?.markerLabel || system?.name || '',
      markerStyle: validMarkerStyle,
      routes: Array.isArray(system?.routes) ? system.routes.filter(Boolean).map(route => ({
        toId: String(route?.toId || '').trim(),
        color: String(route?.color || '#7df9ff').trim() || '#7df9ff',
        width: Math.max(1, Number(route?.width || 2)),
        label: String(route?.label || '').trim()
      })).filter(route => route.toId) : [],
      ...system,
      markerStyle: validMarkerStyle
    });
  });
  PLANETS = Object.fromEntries(Object.entries(PLANETS || {}).map(([id, planet]) => [id, normalizePlanetPilot(planet)]));
  PLANET_LIST = sortEntitiesForList(Object.values(PLANETS));

  Data.systems = SYSTEMS;
  Data.planets = PLANETS;
  Data.npcs = NPCS;
  Data.equipment = EQUIPMENT;
  Data.flora = FLORA;
  Data.fauna = FAUNA;
  Data.articles = ARTICLES;
  try {
    const legend = Array.isArray(worldData?.ui?.galaxyLegend) ? worldData.ui.galaxyLegend : [];
    if (typeof App !== 'undefined' && App?.state && (!Array.isArray(App.state.galaxyLegend) || !App.state.galaxyLegend.length) && legend.length) {
      App.state.galaxyLegend = deep(legend);
    }
  } catch {}
}

function normalizePlanetPilot(planet = {}) {
  const pilot = planet?.pilot || {};
  const reference = typeof pilot.reference === 'string' ? pilot.reference : (typeof pilot.history === 'string' ? pilot.history : '');
  const info = typeof pilot.info === 'string' ? pilot.info : (typeof pilot.economy === 'string' ? pilot.economy : '');
  const warning = typeof pilot.warning === 'string' ? pilot.warning : '';
  return { ...planet, pilot: { ...pilot, reference, info, warning } };
}

function getPlanetReference(planet = {}) {
  return normalizePlanetPilot(planet).pilot.reference || '';
}

function getPlanetInfo(planet = {}) {
  return normalizePlanetPilot(planet).pilot.info || '';
}

function getPlayersSourceRecord(state = App?.state) {
  const stateUsers = state?.users && Object.keys(state.users).length ? state.users : null;
  return stateUsers ? deep(stateUsers) : deep(PLAYER_TEMPLATES);
}

function mirrorPlayersIntoWorld(state = App?.state) {
  const livePlayers = getPlayersSourceRecord(state);
  PLAYER_TEMPLATES = livePlayers;
  PLAYER_LIST = sortEntitiesForList(Object.values(PLAYER_TEMPLATES));
  worldData.players = serializeWorldSection('players', PLAYER_TEMPLATES);
  return PLAYER_TEMPLATES;
}

async function persistPlayerWorldMirror(state = App?.state) {
  if (!window.electronAPI?.saveWorldData) return { ok: false, message: 'Electron API unavailable' };
  mirrorPlayersIntoWorld(state);
  const result = await window.electronAPI.saveWorldData(buildWorldSnapshot());
  if (result?.ok && result.world) {
    applyWorldData(result.world);
  }
  return result;
}

function buildWorldSnapshot() {
  mirrorPlayersIntoWorld(App?.state);
  return {
    players: serializeWorldSection('players', PLAYER_TEMPLATES),
    systems: serializeWorldSection('systems', SYSTEMS),
    planets: serializeWorldSection('planets', PLANETS),
    npcs: serializeWorldSection('npcs', NPCS),
    equipment: serializeWorldSection('equipment', EQUIPMENT),
    flora: serializeWorldSection('flora', FLORA),
    fauna: serializeWorldSection('fauna', FAUNA),
    articles: serializeWorldSection('articles', ARTICLES)
  };
}

function defaultSyncMeta() {
  return {
    enabled: false,
    configured: false,
    localDirty: false,
    remoteRevision: 0,
    remoteUpdatedAt: null,
    lastPulledAt: null,
    lastPushedAt: null,
    lastCheckedAt: null,
    lastStatus: 'LOCAL_ONLY',
    lastError: null,
    campaignId: '',
    deviceLabel: ''
  };
}

function defaultPlayerSyncMeta() {
  return {
    enabled: false,
    lastPulledAt: null,
    lastPushedAt: null,
    lastStatus: 'LOCAL_ONLY',
    lastError: null,
    records: {}
  };
}

function normalizePlayerSyncMeta(meta = {}) {
  return {
    ...defaultPlayerSyncMeta(),
    ...(meta || {}),
    enabled: Boolean(meta?.enabled),
    records: meta?.records && typeof meta.records === 'object' ? deep(meta.records) : {}
  };
}

function ensurePlayerSyncMeta(state = App?.state) {
  if (!state?.meta) return normalizePlayerSyncMeta();
  state.meta.playerSync = normalizePlayerSyncMeta(state.meta.playerSync || {});
  return state.meta.playerSync;
}

function getPlayerRemoteMeta(playerId, state = App?.state) {
  const meta = ensurePlayerSyncMeta(state);
  return meta.records?.[playerId] || { version: 0, updatedAt: null, updatedBy: null, clientUpdatedAt: null, deletedAt: null, contentHash: null };
}

function setPlayerRemoteMeta(playerId, remote = {}, state = App?.state) {
  if (!playerId || !state?.meta) return null;
  const meta = ensurePlayerSyncMeta(state);
  meta.records[playerId] = {
    version: Number(remote?.version || 0),
    updatedAt: remote?.updatedAt || null,
    updatedBy: remote?.updatedBy || null,
    clientUpdatedAt: remote?.clientUpdatedAt || null,
    deletedAt: remote?.deletedAt || null,
    contentHash: remote?.contentHash || null
  };
  return meta.records[playerId];
}

function dropPlayerRemoteMeta(playerId, state = App?.state) {
  if (!playerId || !state?.meta?.playerSync?.records) return;
  delete state.meta.playerSync.records[playerId];
}

function activeSyncActorLabel() {
  return String(Sync?.config?.deviceLabel || App?.currentUser?.displayName || App?.currentUserId || 'unknown-device').trim() || 'unknown-device';
}

function shallowDiffObject(base = {}, next = {}, keys = []) {
  const diff = {};
  for (const key of keys) {
    const prev = base?.[key];
    const value = next?.[key];
    if (JSON.stringify(prev) !== JSON.stringify(value)) diff[key] = value;
  }
  return diff;
}

function buildSharedStateSnapshot(state = App?.state || makeDefaultState()) {
  const syncMeta = state?.meta?.sync || defaultSyncMeta();
  return {
    meta: {
      version: Number(state?.meta?.version || 7),
      lastUpdatedAt: state?.meta?.lastUpdatedAt || null,
      sync: {
        remoteRevision: Number(syncMeta.remoteRevision || 0),
        remoteUpdatedAt: syncMeta.remoteUpdatedAt || null
      }
    },
    users: deep(state?.users || {}),
    npcChats: deep(state?.npcChats || {}),
    gmReports: deep(state?.gmReports || { items: [] }),
    toolState: deep(state?.toolState || {})
  };
}

async function persistPlayersTemplateOnly() {
  return persistPlayerWorldMirror(App?.state);
}

function makeDefaultState() {
  return {
    meta: {
      version: 7,
      syncMode: 'LOCAL_FILE_CACHE',
      lastUpdatedAt: null,
      sync: defaultSyncMeta(),
      playerSync: defaultPlayerSyncMeta()
    },
    users: deep(PLAYER_TEMPLATES),
    npcChats: {},
    gmReports: { items: [] },
    toolState: {}
  };
}

const Data = {
  systems: SYSTEMS,
  planets: PLANETS,
  npcs: NPCS,
  equipment: EQUIPMENT,
  flora: FLORA,
  fauna: FAUNA,
  articles: ARTICLES,
  getSystem(id) {
    return this.systems.find(system => system.id === id) || null;
  },
  getPlanet(id) {
    return this.planets[id] || null;
  },
  getNpc(id) {
    return this.npcs[id] || null;
  },
  getItem(id) {
    return this.equipment[id] || null;
  },
  getFlora(id) {
    return this.flora[id] || null;
  },
  getFauna(id) {
    return this.fauna[id] || null;
  },
  getArticle(id) {
    return this.articles[id] || null;
  },
  getSystemForPlanet(planetId) {
    return this.systems.find(system => (system.planetIds || []).includes(planetId)) || null;
  }
};


function getPlayerCurrentLocation(player = App.currentUser) {
  if (!player?.currentPlanetId) return { planet: null, system: null };
  const planet = Data.getPlanet(player.currentPlanetId) || null;
  const system = planet ? Data.getSystemForPlanet(planet.id) : null;
  return { planet, system };
}


function getMarketAccessState(player = App.currentUser, planetId = UI?.selectedPlanetId) {
  const currentPlanetId = String(player?.currentPlanetId || '').trim();
  const currentPlanet = currentPlanetId ? Data.getPlanet(currentPlanetId) : null;
  if (!planetId) {
    return { canBuy: false, reason: 'ÐÐµ Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð° Ð¿Ð»Ð°Ð½ÐµÑ‚Ð° Ñ‚Ð¾Ñ€Ð³Ð¾Ð²Ð¾Ð³Ð¾ Ñ‚ÐµÑ€Ð¼Ð¸Ð½Ð°Ð»Ð°.', currentPlanet };
  }
  if (!player) {
    return { canBuy: false, reason: 'Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð²Ð¾Ð¹Ð´Ð¸Ñ‚Ðµ Ð² Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÑŒ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°.', currentPlanet };
  }
  if (!currentPlanetId) {
    return {
      canBuy: false,
      reason: 'ÐŸÐ¾ÐºÑƒÐ¿ÐºÐ° Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ñ‚Ð¾Ð»ÑŒÐºÐ¾ ÐµÑÐ»Ð¸ Ð² Ð¿Ñ€Ð¾Ñ„Ð¸Ð»Ðµ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð° ÑƒÐºÐ°Ð·Ð°Ð½Ð° Ñ‚ÐµÐºÑƒÑ‰Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°.',
      currentPlanet
    };
  }
  if (currentPlanetId !== planetId) {
    return {
      canBuy: false,
      reason: `ÐŸÐ¾ÐºÑƒÐ¿ÐºÐ° Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð½Ð° Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¹ Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°: ${currentPlanet?.name || currentPlanetId}.`,
      currentPlanet
    };
  }
  return { canBuy: true, reason: '', currentPlanet };
}

function getPlayerDisplayName(playerId) {
  const player = App?.state?.users?.[playerId] || PLAYER_TEMPLATES[playerId] || null;
  return player?.displayName || player?.shortName || playerId || 'Ð˜Ð³Ñ€Ð¾Ðº';
}

function ensureNpcChatState() {
  if (!App.state.npcChats || typeof App.state.npcChats !== 'object') App.state.npcChats = {};
  return App.state.npcChats;
}

function getNpcChatThread(npcId, playerId) {
  const chats = ensureNpcChatState();
  if (!chats[npcId] || typeof chats[npcId] !== 'object') chats[npcId] = {};
  if (!Array.isArray(chats[npcId][playerId])) chats[npcId][playerId] = [];
  return chats[npcId][playerId];
}

function listNpcChatPlayerIds(npcId) {
  return Object.keys(ensureNpcChatState()[npcId] || {}).sort((a, b) => getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b), 'ru'));
}

function appendNpcChatMessage(npcId, playerId, payload = {}) {
  const thread = getNpcChatThread(npcId, playerId);
  const text = String(payload.text || '').trim();
  if (!text) return null;
  const message = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sender: payload.sender || 'player',
    playerId,
    npcId,
    text,
    createdAt: new Date().toISOString(),
    authorLabel: payload.authorLabel || (payload.sender === 'npc' ? (Data.getNpc(npcId)?.name || 'NPC') : getPlayerDisplayName(playerId))
  };
  thread.push(message);
  return message;
}

function ensureGmReportsState() {
  if (!App.state.gmReports || typeof App.state.gmReports !== 'object') App.state.gmReports = { items: [] };
  if (!Array.isArray(App.state.gmReports.items)) App.state.gmReports.items = [];
  return App.state.gmReports.items;
}

function appendGmReport(payload = {}) {
  const items = ensureGmReportsState();
  const report = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    playerId: payload.playerId || App.currentUserId || 'unknown',
    playerName: payload.playerName || getPlayerDisplayName(payload.playerId || App.currentUserId),
    itemId: payload.itemId || '',
    itemName: payload.itemName || (payload.itemId ? (Data.getItem(payload.itemId)?.name || payload.itemId) : ''),
    category: payload.category || 'tool',
    title: payload.title || 'Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð½Ñ‹Ð¹ Ð¾Ñ‚Ñ‡Ñ‘Ñ‚',
    text: payload.text || '',
    success: payload.success === true,
    details: payload.details || ''
  };
  items.unshift(report);
  if (items.length > 200) items.length = 200;
  return report;
}

function consumeInventoryItem(userId, itemId, qty = 1) {
  const user = App.state?.users?.[userId];
  if (!user || !Array.isArray(user.inventory)) return false;
  const entry = user.inventory.find(item => item.itemId === itemId);
  if (!entry || Number(entry.qty || 0) < qty) return false;
  entry.qty = Number(entry.qty || 0) - qty;
  if (entry.qty <= 0) user.inventory = user.inventory.filter(item => item !== entry);
  return true;
}

function itemMechanicType() { return ''; }
function itemRuntimeMechanic() { return ''; }
function itemHasUsableMechanic() { return false; }
function entityExtraDataset(type, entity, opts = {}) {
  const attrs = [];
  if (opts.action) attrs.push(`data-action="${esc(opts.action)}"`);
  return attrs.join(' ');
}

// v1.0.52: active inventory mini-games (decryptor / quick hack / door hack) were retired.
// Keep a tiny compatibility object so old saved UI state cannot crash during migration.
const Tooling = {
  activeItemId: null,
  render() {},
  openForItem(itemId) {
    if (itemId) Wiki.showEntity('item', itemId, true);
  },
  stopTicker() {}
};

const ChatUI = {
  renderNpcThreadForPlayer(npc) {
    const playerId = App.currentUserId;
    const thread = getNpcChatThread(npc.id, playerId);
    return `
      <div class="chat-panel card pad18">
        <div class="section-title">ÐšÐ°Ð½Ð°Ð» ÑÐ²ÑÐ·Ð¸</div>
        <div class="small-note">Ð¡Ð¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ñ Ñ…Ñ€Ð°Ð½ÑÑ‚ÑÑ Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾ Ð¸ ÑÐ¸Ð½Ñ…Ñ€Ð¾Ð½Ð¸Ð·Ð¸Ñ€ÑƒÑŽÑ‚ÑÑ Ñ‡ÐµÑ€ÐµÐ· Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ñ‹Ð¹ backend Ð²Ð¼ÐµÑÑ‚Ðµ Ñ Ð¾Ð±Ñ‰Ð¸Ð¼ ÑÐ½Ð°Ð¿ÑˆÐ¾Ñ‚Ð¾Ð¼ ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸.</div>
        <div class="chat-thread" data-chat-thread>
          ${thread.map(message => this.messageMarkup(message, npc.id)).join('') || '<div class="small-note">Ð”Ð¸Ð°Ð»Ð¾Ð³ ÐµÑ‰Ñ‘ Ð½Ðµ Ð½Ð°Ñ‡Ð°Ñ‚.</div>'}
        </div>
        <form class="form npc-chat-form" data-npc-id="${esc(npc.id)}" data-player-id="${esc(playerId)}" data-role="player">
          <div class="field"><label>Ð¡Ð¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ðµ Ð´Ð»Ñ ${esc(npc.name)}</label><textarea class="area chat-input" name="message" placeholder="ÐžÑ‚Ð¿Ñ€Ð°Ð²Ð¸Ñ‚ÑŒ ÑÐ¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ðµ..."></textarea></div>
          <button class="primary" type="submit">ÐžÐ¢ÐŸÐ ÐÐ’Ð˜Ð¢Ð¬</button>
        </form>
      </div>
    `;
  },
  renderNpcThreadsForGm(npc) {
    const playerIds = listNpcChatPlayerIds(npc.id);
    if (!playerIds.length) {
      return '<div class="chat-panel card pad18"><div class="section-title">ÐšÐ°Ð½Ð°Ð» ÑÐ²ÑÐ·Ð¸</div><div class="small-note">Ð˜Ð³Ñ€Ð¾ÐºÐ¸ ÐµÑ‰Ñ‘ Ð½Ðµ Ð¿Ð¸ÑÐ°Ð»Ð¸ ÑÑ‚Ð¾Ð¼Ñƒ NPC.</div></div>';
    }
    return `
      <div class="chat-gm-stack">
        ${playerIds.map(playerId => {
          const thread = getNpcChatThread(npc.id, playerId);
          return `
            <div class="chat-panel card pad18">
              <div class="data-row"><span class="data-label">Ð˜Ð³Ñ€Ð¾Ðº</span><span class="data-value">${esc(getPlayerDisplayName(playerId))}</span></div>
              <div class="chat-thread" data-chat-thread>
                ${thread.map(message => this.messageMarkup(message, npc.id)).join('')}
              </div>
              <form class="form npc-chat-form" data-npc-id="${esc(npc.id)}" data-player-id="${esc(playerId)}" data-role="npc">
                <div class="field"><label>ÐžÑ‚Ð²ÐµÑ‚ Ð¾Ñ‚ Ð¸Ð¼ÐµÐ½Ð¸ ${esc(npc.name)}</label><textarea class="area chat-input" name="message" placeholder="ÐžÑ‚Ð²ÐµÑ‚Ð¸Ñ‚ÑŒ Ð¸Ð³Ñ€Ð¾ÐºÑƒ..."></textarea></div>
                <button class="primary" type="submit">ÐžÐ¢ÐŸÐ ÐÐ’Ð˜Ð¢Ð¬ ÐžÐ¢Ð’Ð•Ð¢</button>
              </form>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },
  messageMarkup(message, npcId) {
    const own = message.sender === 'npc';
    const label = own ? (Data.getNpc(npcId)?.name || 'NPC') : getPlayerDisplayName(message.playerId);
    return `<div class="chat-bubble ${own ? 'npc' : 'player'}"><div class="chat-meta">${esc(label)} Â· ${esc(formatLoreDateV1075(message.createdAt || Date.now()))}</div><div>${esc(message.text)}</div></div>`;
  },
  bindWithin(root) {
    root?.querySelectorAll('.npc-chat-form').forEach(form => {
      if (form.dataset.bound === '1') return;
      form.dataset.bound = '1';
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const fd = new FormData(form);
        const npcId = form.dataset.npcId;
        const playerId = form.dataset.playerId;
        const role = form.dataset.role || 'player';
        const text = String(fd.get('message') || '').trim();
        if (!text) {
          Toast.show('Ð¡Ð¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ðµ Ð¿ÑƒÑÑ‚Ð¾Ðµ', 'err');
          return;
        }
        appendNpcChatMessage(npcId, playerId, { sender: role === 'npc' ? 'npc' : 'player', text, authorLabel: role === 'npc' ? (Data.getNpc(npcId)?.name || 'NPC') : getPlayerDisplayName(playerId) });
        await App.saveState(role === 'npc' ? 'ÐžÑ‚Ð²ÐµÑ‚ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²Ð»ÐµÐ½ Ð¸Ð³Ñ€Ð¾ÐºÑƒ' : 'Ð¡Ð¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ðµ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²Ð»ÐµÐ½Ð¾ Ð”ÐœÑƒ');
        Wiki.showEntity('npc', npcId, UI.activeModuleId === 'wiki');
      });
    });
  }
};


const Persistence = {
  async load() {
    if (window.electronAPI?.loadState) {
      const fileState = await window.electronAPI.loadState();
      if (fileState && !fileState.__error) return this.normalize(fileState);
    }
    const raw = localStorage.getItem(FALLBACK_STATE_KEY);
    if (raw) {
      try { return this.normalize(JSON.parse(raw)); } catch (error) {}
    }
    return this.normalize(makeDefaultState());
  },
  async save(state) {
    state.meta.lastUpdatedAt = new Date().toISOString();
    if (window.electronAPI?.saveState) {
      const res = await window.electronAPI.saveState(state);
      if (!res?.ok) {
        localStorage.setItem(FALLBACK_STATE_KEY, JSON.stringify(state));
        return { ok: true, fallback: true };
      }
      return res;
    }
    localStorage.setItem(FALLBACK_STATE_KEY, JSON.stringify(state));
    return { ok: true, fallback: true };
  },
  normalize(candidate) {
    const state = makeDefaultState();
    if (candidate?.meta) state.meta = { ...state.meta, ...candidate.meta, version: Number(candidate?.meta?.version || state.meta.version || 7), sync: { ...defaultSyncMeta(), ...(candidate?.meta?.sync || {}) }, playerSync: normalizePlayerSyncMeta(candidate?.meta?.playerSync || {}) };
    state.npcChats = deep(candidate?.npcChats || {});
    state.gmReports = deep(candidate?.gmReports || { items: [] });
    if (!Array.isArray(state.gmReports.items)) state.gmReports.items = [];
    state.toolState = deep(candidate?.toolState || {});
    const candidateUsers = candidate?.users && typeof candidate.users === 'object' ? candidate.users : {};
    const playerIds = new Set([...Object.keys(PLAYER_TEMPLATES || {}), ...Object.keys(candidateUsers)]);
    for (const id of playerIds) {
      const template = PLAYER_TEMPLATES?.[id] || {};
      const incoming = candidateUsers[id] || {};
      state.users[id] = {
        ...deep(template),
        ...deep(incoming),
        id: String(incoming.id || template.id || id),
        credits: Number.isFinite(Number(incoming.credits)) ? Number(incoming.credits) : Number(template.credits || 0),
        stats: { ...(template.stats || {}), ...(incoming.stats || {}) },
        abilities: { ...(template.abilities || {}), ...(incoming.abilities || {}) },
        equipmentSlots: { ...(template.equipmentSlots || {}), ...(incoming.equipmentSlots || {}) },
        inventory: Array.isArray(incoming.inventory) ? deep(incoming.inventory) : deep(template.inventory || []),
        implants: Array.isArray(incoming.implants) ? deep(incoming.implants) : deep(template.implants || []),
        social: {
          ...(template.social || {}),
          ...(incoming.social || {}),
          npcIds: Array.isArray(incoming.social?.npcIds) ? deep(incoming.social.npcIds) : deep(template.social?.npcIds || []),
          orgs: Array.isArray(incoming.social?.orgs) ? deep(incoming.social.orgs) : deep(template.social?.orgs || [])
        },
        currentPlanetId: typeof incoming.currentPlanetId === 'string' ? incoming.currentPlanetId : (typeof template.currentPlanetId === 'string' ? template.currentPlanetId : '')
      };
    }
    return state;
  },
  clearSession() {
    localStorage.removeItem(SESSION_KEY);
  },
  saveSession(userId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
  },
  loadSession() {
    try {
      const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (raw?.userId && PLAYER_TEMPLATES[raw.userId]) return raw;
    } catch (error) {}
    return null;
  },
  async resetAll() {
    localStorage.removeItem(FALLBACK_STATE_KEY);
    await this.save(makeDefaultState());
    this.clearSession();
  }
};

const Sync = {
  config: null,
  baselineToken: '',
  status: { enabled: false, connected: false, message: 'Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ð¹ Ñ€ÐµÐ¶Ð¸Ð¼', remote: null },
  pollTimer: null,
  dataTransferDepth: 0,
  dataTransferDirection: '',
  manualPushBusy: false,
  beginDataTransfer(direction = 'receive') {
    if (this.dataTransferDepth === 0) this.dataTransferDirection = direction === 'send' ? 'send' : 'receive';
    this.dataTransferDepth += 1;
    this.refreshDataTransferIndicator();
  },
  endDataTransfer() {
    this.dataTransferDepth = Math.max(0, Number(this.dataTransferDepth || 0) - 1);
    if (this.dataTransferDepth === 0) this.dataTransferDirection = '';
    this.refreshDataTransferIndicator();
  },
  refreshDataTransferIndicator() {
    const busy = Number(this.dataTransferDepth || 0) > 0;
    const sending = this.dataTransferDirection === 'send';
    const title = busy ? (sending ? 'ÐžÑ‚Ð¿Ñ€Ð°Ð²ÐºÐ° Ð´Ð°Ð½Ð½Ñ‹Ñ… Ð² Ð¾Ð±Ð»Ð°ÐºÐ¾' : 'ÐŸÐ¾Ð»ÑƒÑ‡ÐµÐ½Ð¸Ðµ Ð´Ð°Ð½Ð½Ñ‹Ñ… Ð¸Ð· Ð¾Ð±Ð»Ð°ÐºÐ°') : 'ÐžÐ±Ð½Ð¾Ð²Ð»ÐµÐ½Ð¸Ñ Ð´Ð°Ð½Ð½Ñ‹Ñ…: Ð¾Ð¶Ð¸Ð´Ð°Ð½Ð¸Ðµ';
    const indicator = $('#data-update-indicator');
    const label = $('#data-update-label');
    const notice = $('#data-transfer-notice');
    indicator?.classList.toggle('busy', busy);
    if (indicator) {
      indicator.disabled = busy;
      indicator.title = title;
      indicator.setAttribute('aria-label', title);
      indicator.dataset.direction = busy ? this.dataTransferDirection : '';
    }
    if (label) label.textContent = busy ? (sending ? 'ÐžÐ¢ÐŸÐ ÐÐ’ÐšÐ' : 'ÐŸÐžÐ›Ð£Ð§Ð•ÐÐ˜Ð•') : 'Ð”ÐÐÐÐ«Ð•';
    if (notice) notice.hidden = !busy;
    const noticeTitle = $('#data-transfer-title');
    if (noticeTitle) noticeTitle.textContent = title;
    const noticeCopy = $('#data-transfer-copy');
    if (noticeCopy) noticeCopy.textContent = 'ÐÐµ Ð¸Ð·Ð¼ÐµÐ½ÑÐ¹Ñ‚Ðµ Ð´Ð°Ð½Ð½Ñ‹Ðµ Ð´Ð¾ Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð¸Ñ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸.';
    ['#sync-test-btn', '#sync-pull-btn', '#sync-push-btn'].forEach(selector => {
      const button = $(selector);
      if (button) button.disabled = busy || Boolean(this.manualPushBusy);
    });
  },
  provider(config = this.config) {
    const value = String(config?.provider || '').toLowerCase();
    return value === 'selfhost' ? 'selfhost' : 'pocketbase';
  },
  cloudName(config = this.config) {
    return this.provider(config) === 'selfhost' ? 'Self-host' : 'PocketBase';
  },
  isConfiguredConfig(config = this.config) {
    const provider = this.provider(config);
    if (provider === 'selfhost') return Boolean(config?.enabled && config?.serverUrl && config?.campaignId);
    return Boolean(config?.enabled && config?.url && config?.campaignId);
  },
  isConfigured() {
    return this.isConfiguredConfig(this.config);
  },
  needsBootstrap() {
    return false;
  },
  async init() {
    await this.loadConfig();
    this.refreshChip();
    this.render();
    this.refreshDataTransferIndicator();
    if (this.config?.enabled) {
      this.startPolling();
    }
  },
  async loadConfig() {
    if (!window.electronAPI?.loadSyncConfig) {
      this.config = { enabled: false, campaignId: '', deviceLabel: '', pollIntervalMs: 45000 };
      return this.config;
    }
    const res = await window.electronAPI.loadSyncConfig();
    this.config = res?.config || { enabled: false, campaignId: '', deviceLabel: '', pollIntervalMs: 45000 };
    const current = App?.state?.meta?.sync || defaultSyncMeta();
    current.enabled = Boolean(this.config.enabled);
    current.configured = this.isConfiguredConfig(this.config);
    current.campaignId = this.config.campaignId || '';
    current.deviceLabel = this.config.deviceLabel || '';
    if (App?.state?.meta) {
      App.state.meta.sync = { ...defaultSyncMeta(), ...current };
      App.state.meta.syncMode = this.config.enabled ? `${this.cloudName(this.config).toUpperCase()}_MIRROR` : 'LOCAL_FILE_CACHE';
    }
    return this.config;
  },
  markLocalDirty(reason = 'local-change') {
    if (!App?.state?.meta) return;
    App.state.meta.sync = { ...defaultSyncMeta(), ...(App.state.meta.sync || {}) };
    App.state.meta.sync.localDirty = true;
    App.state.meta.sync.lastStatus = reason;
    App.state.meta.sync.enabled = Boolean(this.config?.enabled);
    App.state.meta.sync.configured = this.isConfiguredConfig(this.config);
    App.state.meta.sync.campaignId = this.config?.campaignId || '';
    App.state.meta.sync.deviceLabel = this.config?.deviceLabel || '';
    App.state.meta.syncMode = this.config?.enabled ? `${this.cloudName(this.config).toUpperCase()}_MIRROR` : 'LOCAL_FILE_CACHE';
    this.refreshChip();
  },
  buildSnapshot() {
    return {
      world: buildWorldSnapshot(),
      state: buildSharedStateSnapshot(App.state)
    };
  },
  async applyRemoteSnapshot(payload, remoteMeta = {}, options = {}) {
    if (!payload?.world || !payload?.state) {
      return { ok: false, message: 'Remote payload Ð¿ÑƒÑÑ‚Ð¾Ð¹' };
    }
    Debug.log('SYNC_APPLY_REMOTE_START', { revision: remoteMeta?.revision || 0, updatedAt: remoteMeta?.updatedAt || null, force: Boolean(options.force) });
    const worldSave = await window.electronAPI?.saveWorldData?.(payload.world);
    if (!worldSave?.ok) {
      throw new Error(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ ÑÐ¾Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑŒ world snapshot: ${worldSave?.message || 'unknown error'}`);
    }
    await App.loadWorldData();
    const normalizedState = Persistence.normalize(payload.state);
    if (PlayerSync.shouldIsolateUsersFromSnapshot()) {
      normalizedState.users = deep(App.state?.users || normalizedState.users || {});
      normalizedState.meta.playerSync = normalizePlayerSyncMeta(App.state?.meta?.playerSync || normalizedState.meta?.playerSync || {});
    }
    normalizedState.meta.sync = {
      ...defaultSyncMeta(),
      ...(App.state?.meta?.sync || {}),
      enabled: Boolean(this.config?.enabled),
      configured: this.isConfiguredConfig(this.config),
      campaignId: this.config?.campaignId || '',
      deviceLabel: this.config?.deviceLabel || '',
      localDirty: false,
      remoteRevision: Number(remoteMeta?.revision || 0),
      remoteUpdatedAt: remoteMeta?.updatedAt || null,
      lastPulledAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      lastStatus: 'REMOTE_APPLIED',
      lastError: null
    };
    normalizedState.meta.syncMode = this.config?.enabled ? `${this.cloudName(this.config).toUpperCase()}_MIRROR` : 'LOCAL_FILE_CACHE';
    await Persistence.save(normalizedState);
    App.state = await Persistence.load();
    mirrorPlayersIntoWorld(App.state);
    App.fillLoginSelect();
    App.renderLive();
    this.status = { enabled: true, connected: true, message: 'REMOTE_APPLIED', remote: remoteMeta };
    this.refreshChip();
    this.render();
    Debug.log('SYNC_APPLY_REMOTE_DONE', { revision: remoteMeta?.revision || 0, updatedAt: remoteMeta?.updatedAt || null });
    return { ok: true };
  },
  async ping() {
    if (!window.electronAPI?.pingSync) return { ok: false, enabled: false, connected: false, message: 'Electron sync API unavailable' };
    const res = await window.electronAPI.pingSync();
    this.status = {
      enabled: Boolean(res?.enabled),
      connected: Boolean(res?.connected),
      message: res?.message || (res?.connected ? 'ONLINE' : 'OFFLINE'),
      remote: res?.remote || null
    };
    if (App?.state?.meta?.sync) {
      App.state.meta.sync.lastCheckedAt = new Date().toISOString();
      App.state.meta.sync.lastStatus = this.status.message;
      App.state.meta.sync.lastError = res?.ok ? null : (res?.message || null);
      if (res?.remote) {
        App.state.meta.sync.remoteRevision = Number(res.remote.revision || App.state.meta.sync.remoteRevision || 0);
        App.state.meta.sync.remoteUpdatedAt = res.remote.updatedAt || App.state.meta.sync.remoteUpdatedAt || null;
      }
    }
    this.refreshChip();
    this.render();
    return res;
  },
  async checkForRemoteUpdates(reason = 'manual-check', options = {}) {
    await this.loadConfig();
    if (!this.config?.enabled || !window.electronAPI?.pullSync) {
      this.refreshChip();
      return { ok: true, status: 'disabled' };
    }
    const localSync = App.state?.meta?.sync || defaultSyncMeta();
    const localRevision = Number(localSync.remoteRevision || 0);
    const res = await window.electronAPI.pullSync({ localRevision, force: Boolean(options.force) });
    Debug.log('SYNC_PULL_RESULT', { reason, localRevision, ok: res?.ok, status: res?.status, newer: res?.newer, remoteRevision: res?.remote?.revision || null });
    if (!res?.ok) {
      if (options.force) this.baselineToken = '';
      this.status = { enabled: true, connected: false, message: res?.message || 'SYNC_PULL_FAILED', remote: null };
      App.state.meta.sync.lastCheckedAt = new Date().toISOString();
      App.state.meta.sync.lastStatus = 'PULL_FAILED';
      App.state.meta.sync.lastError = res?.message || 'SYNC_PULL_FAILED';
      this.refreshChip();
      this.render();
      if (!options.silent) Toast.show(`${this.cloudName()} Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½: ${res?.message || 'unknown error'}`, 'info');
      return res;
    }

    App.state.meta.sync.lastCheckedAt = new Date().toISOString();
    App.state.meta.sync.lastError = null;
    if (res?.remote) {
      App.state.meta.sync.remoteRevision = Number(res.remote.revision || App.state.meta.sync.remoteRevision || 0);
      App.state.meta.sync.remoteUpdatedAt = res.remote.updatedAt || App.state.meta.sync.remoteUpdatedAt || null;
    }

    if (res.status === 'newer' && res.payload) {
      if (localSync.localDirty && !options.force) {
        App.state.meta.sync.lastStatus = 'REMOTE_NEWER_LOCAL_DIRTY';
        this.status = { enabled: true, connected: true, message: 'CONFLICT_REMOTE_NEWER', remote: res.remote || null };
        this.refreshChip();
        this.render();
        if (!options.silent) Toast.show(`Ð’ ${this.cloudName()} ÐµÑÑ‚ÑŒ Ð±Ð¾Ð»ÐµÐµ Ð½Ð¾Ð²Ñ‹Ðµ Ð´Ð°Ð½Ð½Ñ‹Ðµ. Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ðµ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ Ð½Ðµ Ð¿ÐµÑ€ÐµÐ·Ð°Ð¿Ð¸ÑÐ°Ð½Ñ‹ Ð°Ð²Ñ‚Ð¾Ð¼Ð°Ñ‚Ð¸Ñ‡ÐµÑÐºÐ¸.`, 'info');
        await Persistence.save(App.state);
        return { ...res, skipped: true };
      }
      if (options.applyIfNewer === false) {
        App.state.meta.sync.lastStatus = 'REMOTE_NEWER_AVAILABLE';
        this.status = { enabled: true, connected: true, message: 'REMOTE_NEWER_AVAILABLE', remote: res.remote || null };
        this.refreshChip();
        this.render();
        await Persistence.save(App.state);
        if (!options.silent) Toast.show('Ð’ Ð¾Ð±Ð»Ð°ÐºÐµ ÐµÑÑ‚ÑŒ Ð±Ð¾Ð»ÐµÐµ ÑÐ²ÐµÐ¶Ð¸Ð¹ ÑÐ½Ð¸Ð¼Ð¾Ðº Ð¼Ð¸Ñ€Ð°. ÐžÐ½ Ð½Ðµ Ð±Ñ‹Ð» Ð¿Ñ€Ð¸Ð¼ÐµÐ½Ñ‘Ð½ Ð°Ð²Ñ‚Ð¾Ð¼Ð°Ñ‚Ð¸Ñ‡ÐµÑÐºÐ¸.', 'info');
        return { ...res, skipped: true };
      }
      await this.applyRemoteSnapshot(res.payload, res.remote, options);
      this.baselineToken = String(res.baselineToken || '');
      this.refreshChip();
      this.render();
      if (!options.silent) Toast.show(`Ð—Ð°Ð³Ñ€ÑƒÐ¶ÐµÐ½Ñ‹ Ð±Ð¾Ð»ÐµÐµ ÑÐ²ÐµÐ¶Ð¸Ðµ Ð´Ð°Ð½Ð½Ñ‹Ðµ Ð¸Ð· ${this.cloudName()}`, 'ok');
      return res;
    }

    if (res.status === 'empty') this.baselineToken = '';

    App.state.meta.sync.lastStatus = res.status === 'empty' ? 'REMOTE_EMPTY' : 'UP_TO_DATE';
    App.state.meta.sync.lastError = null;
    this.status = { enabled: true, connected: true, message: res.status === 'empty' ? 'REMOTE_EMPTY' : 'UP_TO_DATE', remote: res.remote || null };
    this.refreshChip();
    this.render();
    await Persistence.save(App.state);
    return res;
  },
  async pushCurrentSnapshot(reason = 'manual-push', options = {}) {
    await this.loadConfig();
    if (!this.config?.enabled || !window.electronAPI?.pushSync) {
      this.refreshChip();
      return { ok: true, status: 'disabled' };
    }
    const currentRole = String(App?.currentUser?.role || '').trim().toLowerCase();
    if (options.requireGm && currentRole !== 'gm') {
      return { ok: false, enabled: true, connected: true, status: 'gm-required', message: 'Ð ÑƒÑ‡Ð½Ð°Ñ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²ÐºÐ° Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÑŽ Ð”ÐœÐ°' };
    }
    const syncMeta = App.state?.meta?.sync || defaultSyncMeta();
    const baseRevision = Number(syncMeta.remoteRevision || 0);
    const payload = {
      snapshot: this.buildSnapshot(),
      baseRevision,
      baselineToken: this.baselineToken,
      updatedBy: this.config.deviceLabel || App.currentUser?.displayName || 'unknown-device',
      clientUpdatedAt: App.state?.meta?.lastUpdatedAt || new Date().toISOString(),
      manual: Boolean(options.manual),
      gmWrite: currentRole === 'gm',
      actorId: currentRole === 'gm' ? String(App.currentUserId || '') : '',
      reason: String(reason || 'snapshot-push'),
      ...(Array.isArray(options.worldSections) ? { worldSections: options.worldSections.map(String) } : {}),
      ...(options.allowBundledWorldReset === true ? { allowBundledWorldReset: true } : {}),
      cloudHistory: {
        knownRevision: baseRevision,
        lastPulledAt: syncMeta.lastPulledAt || null,
        lastPushedAt: syncMeta.lastPushedAt || null
      }
    };
    Debug.log('SYNC_PUSH_START', { reason, baseRevision, localDirty: Boolean(syncMeta.localDirty), campaignId: this.config.campaignId || '' });
    const res = await window.electronAPI.pushSync(payload);
    Debug.log('SYNC_PUSH_FINISH', { reason, ok: res?.ok, status: res?.status, remoteRevision: res?.remote?.revision || null, message: res?.message || null });

    App.state.meta.sync.lastCheckedAt = new Date().toISOString();
    if (!res?.ok) {
      if (res?.status === 'baseline-required' || res?.status === 'baseline-stale' || res?.status === 'remote-empty-protected') {
        this.baselineToken = '';
      }
      App.state.meta.sync.lastStatus = res?.status === 'conflict' ? 'CONFLICT' : 'PUSH_FAILED';
      App.state.meta.sync.lastError = res?.message || 'SYNC_PUSH_FAILED';
      if (res?.remote) {
        App.state.meta.sync.remoteRevision = Number(res.remote.revision || App.state.meta.sync.remoteRevision || 0);
        App.state.meta.sync.remoteUpdatedAt = res.remote.updatedAt || App.state.meta.sync.remoteUpdatedAt || null;
      }
      this.status = { enabled: true, connected: Boolean(res?.connected), message: App.state.meta.sync.lastStatus, remote: res?.remote || null };
      this.refreshChip();
      this.render();
      await Persistence.save(App.state);
      if (!options.silent) {
        const msg = res?.status === 'conflict'
          ? `Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¾ Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾, Ð½Ð¾ Ð² ${this.cloudName()} ÑƒÐ¶Ðµ ÐµÑÑ‚ÑŒ Ð±Ð¾Ð»ÐµÐµ Ð½Ð¾Ð²Ð°Ñ Ñ€ÐµÐ²Ð¸Ð·Ð¸Ñ. Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð¿Ð¾Ð´Ñ‚ÑÐ½Ð¸ Ð¾Ð±Ð»Ð°ÐºÐ¾.`
          : `Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¾ Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾, Ð½Ð¾ ${this.cloudName()} Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½: ${res?.message || 'unknown error'}`;
        Toast.show(msg, 'info');
      }
      return res;
    }

    if (res?.worldPersisted) await App.loadWorldData();
    else if (res?.snapshot?.world && window.electronAPI?.saveWorldData) {
      // Backward compatibility with an older main process.
      const worldSave = await window.electronAPI.saveWorldData(res.snapshot.world);
      if (worldSave?.ok) await App.loadWorldData();
    }
    const normalizedUsers = res?.normalizedUsers || res?.snapshot?.state?.users || null;
    if (normalizedUsers) {
      App.state.users = deep(normalizedUsers);
      mirrorPlayersIntoWorld(App.state);
    }

    App.state.meta.sync = {
      ...defaultSyncMeta(),
      ...(App.state.meta.sync || {}),
      enabled: true,
      configured: true,
      campaignId: this.config.campaignId || '',
      deviceLabel: this.config.deviceLabel || '',
      localDirty: false,
      remoteRevision: Number(res.remote?.revision || baseRevision),
      remoteUpdatedAt: res.remote?.updatedAt || new Date().toISOString(),
      lastPushedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      lastStatus: 'SYNCED',
      lastError: null
    };
    if (res?.baselineToken) this.baselineToken = String(res.baselineToken || '');
    App.state.meta.syncMode = `${this.cloudName(this.config).toUpperCase()}_MIRROR`;
    this.status = { enabled: true, connected: true, message: 'SYNCED', remote: res.remote || null };
    this.refreshChip();
    this.render();
    await Persistence.save(App.state);
    if (!options.silent) Toast.show(`Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ðµ Ð´Ð°Ð½Ð½Ñ‹Ðµ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²Ð»ÐµÐ½Ñ‹ Ð² ${this.cloudName()}`, 'ok');
    return res;
  },
  refreshChip() {
    const chip = $('#sync-chip');
    if (!chip) return;
    const syncMeta = App?.state?.meta?.sync || defaultSyncMeta();
    let label = 'Ð›ÐžÐšÐÐ›Ð¬ÐÐ«Ð• Ð”ÐÐÐÐ«Ð•';
    if (this.config?.enabled) {
      const cloud = this.cloudName(this.config);
      if (syncMeta.lastStatus === 'SYNCED') label = `${cloud}: ÑÐ¸Ð½Ñ…Ñ€Ð¾Ð½Ð¸Ð·Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¾ Â· ${syncMeta.remoteRevision || 0}`;
      else if (syncMeta.lastStatus === 'CONFLICT' || syncMeta.lastStatus === 'REMOTE_NEWER_LOCAL_DIRTY') label = `${cloud}: Ñ‚Ñ€ÐµÐ±ÑƒÐµÑ‚ÑÑ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÐ°`;
      else if (this.status?.connected === false && this.status?.message && this.status?.message !== 'Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ð¹ Ñ€ÐµÐ¶Ð¸Ð¼') label = `${cloud}: Ð½ÐµÑ‚ ÑÐ²ÑÐ·Ð¸`;
      else if (syncMeta.localDirty) label = `${cloud}: ÐµÑÑ‚ÑŒ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ`;
      else label = `${cloud}: Ð³Ð¾Ñ‚Ð¾Ð²Ð¾`;
    }
    chip.textContent = label;
    chip.title = this.describeStatus();
  },
  describeStatus() {
    const syncMeta = App?.state?.meta?.sync || defaultSyncMeta();
    const playerMeta = App?.state?.meta?.playerSync || defaultPlayerSyncMeta();
    const parts = [
      `campaign=${syncMeta.campaignId || this.config?.campaignId || 'â€”'}`,
      `device=${syncMeta.deviceLabel || this.config?.deviceLabel || 'â€”'}`,
      `remoteRevision=${syncMeta.remoteRevision || 0}`,
      `localDirty=${syncMeta.localDirty ? 'yes' : 'no'}`,
      `status=${syncMeta.lastStatus || 'LOCAL_ONLY'}`,
      `playerSync=${playerMeta.lastStatus || 'LOCAL_ONLY'}`
    ];
    if (syncMeta.remoteUpdatedAt) parts.push(`remoteUpdatedAt=${syncMeta.remoteUpdatedAt}`);
    if (syncMeta.lastError) parts.push(`error=${syncMeta.lastError}`);
    return parts.join(' // ');
  },
  startPolling() {
    this.stopPolling();
    // ÐšÐ¾Ð³Ð´Ð° Ð°ÐºÑ‚Ð¸Ð²ÐµÐ½ realtime-Ð¼Ð¾ÑÑ‚ (PocketBase: ÑÐ¾Ð±Ñ‹Ñ‚Ð¸Ñ Ð¿Ñ€Ð¸Ñ…Ð¾Ð´ÑÑ‚ Ð¼Ð³Ð½Ð¾Ð²ÐµÐ½Ð½Ð¾),
    // Ð¾Ð¿Ñ€Ð¾Ñ Ð¿Ð¾ Ñ‚Ð°Ð¹Ð¼ÐµÑ€Ñƒ â€” Ñ‚Ð¾Ð»ÑŒÐºÐ¾ ÑÑ‚Ñ€Ð°Ñ…Ð¾Ð²ÐºÐ° Ð½Ð° ÑÐ»ÑƒÑ‡Ð°Ð¹ Ð¿Ñ€Ð¾Ð¿ÑƒÑ‰ÐµÐ½Ð½Ð¾Ð³Ð¾ ÑÐ¾Ð±Ñ‹Ñ‚Ð¸Ñ.
    const realtimeActive = Boolean(this._worldSnapshotRealtimeUnsubV1015);
    const every = Math.max(realtimeActive ? 180000 : 10000, Number(this.config?.pollIntervalMs || 45000));
    this.pollTimer = setInterval(() => {
      (async () => {
        const canApplyWorld = !UiSyncGuard.isEditingCriticalForm() && !App?.state?.meta?.sync?.localDirty;
        await this.checkForRemoteUpdates('poll', { applyIfNewer: canApplyWorld, silent: true });
        await PlayerSync.pullUpdates('poll', { silent: true, rerender: !UiSyncGuard.isEditingCriticalForm() });
        UiSyncGuard.flushIfIdle();
      })().catch(error => {
        Debug.error('SYNC_POLL_FAILED', { message: error?.message || String(error), stack: error?.stack || null });
      });
    }, every);
  },
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },
  async saveConfigFromForm(formEl, options = {}) {
    const formData = new FormData(formEl);
    const payload = {
      enabled: options.forceEnable ? true : Boolean(formData.get('enabled')),
      provider: String(formData.get('provider') || this.config?.provider || 'pocketbase').trim().toLowerCase(),
      url: String(formData.get('url') || '').trim(),
      serverUrl: String(formData.get('serverUrl') || '').trim(),
      accessToken: String(formData.get('accessToken') || '').trim(),
      pocketbaseUsersCollection: String(formData.get('pocketbaseUsersCollection') || 'app_users').trim() || 'app_users',
      pocketbaseAssetsCollection: String(formData.get('pocketbaseAssetsCollection') || 'campaign_assets').trim() || 'campaign_assets',
      campaignId: String(formData.get('campaignId') || '').trim(),
      deviceLabel: String(formData.get('deviceLabel') || '').trim(),
      tableName: String(formData.get('tableName') || 'campaign_snapshots').trim() || 'campaign_snapshots',
      chatTableName: String(formData.get('chatTableName') || 'campaign_messages').trim() || 'campaign_messages',
      playerTableName: String(formData.get('playerTableName') || 'campaign_players').trim() || 'campaign_players',
      combatRuntimeTableName: String(formData.get('combatRuntimeTableName') || 'campaign_combat_runtime').trim() || 'campaign_combat_runtime',
      pollIntervalMs: Number(formData.get('pollIntervalMs') || 45000)
    };
    const res = await window.electronAPI?.saveSyncConfig?.(payload);
    if (!res?.ok) {
      Toast.show(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ ÑÐ¾Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑŒ sync config: ${res?.message || 'unknown error'}`, 'err');
      return res;
    }
    const previousSyncConfig = this.config || {};
    this.config = res.config;
    const previousIdentity = [
      this.provider(previousSyncConfig),
      previousSyncConfig.url || previousSyncConfig.serverUrl || '',
      previousSyncConfig.campaignId || '',
      previousSyncConfig.tableName || ''
    ].join('|');
    const nextIdentity = [
      this.provider(this.config),
      this.config.url || this.config.serverUrl || '',
      this.config.campaignId || '',
      this.config.tableName || ''
    ].join('|');
    const keepRemoteMeta = previousIdentity === nextIdentity;
    App.state.meta.sync = {
      ...defaultSyncMeta(),
      ...(keepRemoteMeta ? (App.state.meta.sync || {}) : {}),
      enabled: Boolean(this.config.enabled),
      configured: this.isConfiguredConfig(this.config),
      localDirty: Boolean(App.state?.meta?.sync?.localDirty),
      campaignId: this.config.campaignId || '',
      deviceLabel: this.config.deviceLabel || '',
      lastStatus: keepRemoteMeta ? (App.state?.meta?.sync?.lastStatus || 'LOCAL_ONLY') : 'BACKEND_CHANGED',
      lastError: null
    };
    App.state.meta.syncMode = this.config.enabled ? `${this.cloudName(this.config).toUpperCase()}_MIRROR` : 'LOCAL_FILE_CACHE';
    await Persistence.save(App.state);
    if (this.config.enabled) this.startPolling(); else this.stopPolling();
    this.refreshChip();
    this.render();
    App.updateBootView?.();
    if (!options.silentToast) Toast.show(`ÐŸÐ°Ñ€Ð°Ð¼ÐµÑ‚Ñ€Ñ‹ ${this.cloudName(this.config)} ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ñ‹ Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾`, 'ok');
    return res;
  },
  renderBootstrap() {
    const root = $('#login-sync-bootstrap');
    if (!root) return;
    root.innerHTML = '';
  },

  render() {
    const root = $('#sync-content');
    if (!root) return;
    const config = this.config || { enabled: false, provider: 'pocketbase', url: 'https://sync.grpg-sync.ru', campaignId: 'main', deviceLabel: '', tableName: 'campaign_snapshots', pollIntervalMs: 45000 };
    const syncMeta = App?.state?.meta?.sync || defaultSyncMeta();
    const isGm = String(App?.currentUser?.role || '').trim().toLowerCase() === 'gm';
    const actionsBusy = Boolean(this.manualPushBusy) || Number(this.dataTransferDepth || 0) > 0;
    root.innerHTML = `
      <div class="module-wrap">
        <div class="card pad18 form">
          <div class="section-title">ÐŸÐ¾Ð´ÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ðµ Ðº ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸</div>
          <div class="small-note">ÐŸÐ°Ñ€Ð°Ð¼ÐµÑ‚Ñ€Ñ‹ Ð·Ð°Ð´Ð°Ð½Ñ‹ Ð¿Ñ€Ð¸Ð»Ð¾Ð¶ÐµÐ½Ð¸ÐµÐ¼ Ð¸ Ð·Ð°Ñ‰Ð¸Ñ‰ÐµÐ½Ñ‹ Ð¾Ñ‚ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ.</div>
          <div class="form">
            <div class="cols2">
              <div class="field"><label>URL</label><input class="input" value="${esc(config.url || 'https://sync.grpg-sync.ru')}" readonly /></div>
              <div class="field"><label>CAMPAIGN_ID</label><input class="input" value="${esc(config.campaignId || 'main')}" readonly /></div>
            </div>
            <div class="small-note">Ð”Ð¾ÑÑ‚ÑƒÐ¿ Ðº PocketBase Ð±ÐµÐ· Ð¾Ð±Ñ‰ÐµÐ³Ð¾ Ð°ÐºÐºÐ°ÑƒÐ½Ñ‚Ð°. Ð’Ñ…Ð¾Ð´ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð° Ð² Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÑŒ Ð¾ÑÑ‚Ð°Ñ‘Ñ‚ÑÑ Ð¾Ñ‚Ð´ÐµÐ»ÑŒÐ½Ñ‹Ð¼.</div>
            <div class="cols3">
              <div class="field"><label>BACKEND</label><input class="input" value="PocketBase" readonly /></div>
              <div class="field"><label>APP_VERSION</label><input class="input" value="${esc(GRPG_APP_VERSION)}" readonly /></div>
              <div class="field"><label>REMOTE_REVISION</label><div class="input" style="display:flex;align-items:center">${syncMeta.remoteRevision || 0}</div></div>
            </div>
            <div class="row config-actions">
              <button type="button" id="sync-test-btn" class="secondary" ${actionsBusy ? 'disabled' : ''}>ÐŸÐ ÐžÐ’Ð•Ð Ð˜Ð¢Ð¬ Ð¡Ð’Ð¯Ð—Ð¬</button>
              <button type="button" id="sync-pull-btn" class="secondary" ${actionsBusy ? 'disabled' : ''}>ÐŸÐžÐ›Ð£Ð§Ð˜Ð¢Ð¬ Ð˜Ð— ÐžÐ‘Ð›ÐÐšÐ</button>
              ${isGm ? `<button type="button" id="sync-push-btn" class="primary" ${actionsBusy ? 'disabled' : ''}>ÐžÐ¢ÐŸÐ ÐÐ’Ð˜Ð¢Ð¬ Ð’ ÐžÐ‘Ð›ÐÐšÐž</button>` : ''}
            </div>
            ${isGm ? '<div class="small-note">Ð ÑƒÑ‡Ð½Ð°Ñ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²ÐºÐ° Ð½Ðµ Ð·Ð°Ð³Ñ€ÑƒÐ¶Ð°ÐµÑ‚ Ð¾Ð±Ð»Ð°Ñ‡Ð½Ñ‹Ð¹ ÑÐ½Ð¸Ð¼Ð¾Ðº Ð¿Ð¾Ð²ÐµÑ€Ñ… Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾Ð¹ Ñ€Ð°Ð±Ð¾Ñ‚Ñ‹. ÐŸÐµÑ€ÐµÐ´ Ð·Ð°Ð¿Ð¸ÑÑŒÑŽ Ð¿Ñ€Ð¸Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÑÐµÑ‚ Ñ€Ð¾Ð»ÑŒ Ð”ÐœÐ° Ð¸ Ñ€ÐµÐ²Ð¸Ð·Ð¸ÑŽ; Ð¿Ñ€Ð¸ Ñ€Ð°ÑÑ…Ð¾Ð¶Ð´ÐµÐ½Ð¸Ð¸ Ð¾Ð±Ð»Ð°Ñ‡Ð½Ð°Ñ Ð²ÐµÑ€ÑÐ¸Ñ Ð°Ð²Ñ‚Ð¾Ð¼Ð°Ñ‚Ð¸Ñ‡ÐµÑÐºÐ¸ ÑÐ¾Ñ…Ñ€Ð°Ð½ÑÐµÑ‚ÑÑ Ð² Ñ€ÐµÐ·ÐµÑ€Ð²Ð½ÑƒÑŽ ÐºÐ¾Ð¿Ð¸ÑŽ.</div>' : ''}
          </div>
        </div>
        <div class="card pad18">
          <div class="section-title">Ð¡Ñ‚Ð°Ñ‚ÑƒÑ ÑÐ¸Ð½Ñ…Ñ€Ð¾Ð½Ð¸Ð·Ð°Ñ†Ð¸Ð¸</div>
          <div class="data-row"><span class="data-label">Ð ÐµÐ¶Ð¸Ð¼</span><span class="data-value">${esc(App?.state?.meta?.syncMode || 'LOCAL_FILE_CACHE')}</span></div>
          <div class="data-row"><span class="data-label">Backend</span><span class="data-value">${esc(this.cloudName(config))}</span></div>
          <div class="data-row"><span class="data-label">Ð¡Ñ‚Ð°Ñ‚ÑƒÑ</span><span class="data-value">${esc(syncMeta.lastStatus || 'LOCAL_ONLY')}</span></div>
          <div class="data-row"><span class="data-label">Ð—Ð°Ñ‰Ð¸Ñ‚Ð° Ð¾Ð±Ð»Ð°Ñ‡Ð½Ð¾Ð¹ Ð·Ð°Ð¿Ð¸ÑÐ¸</span><span class="data-value">${isGm ? 'GM_AUTO_PUSH' : (this.baselineToken ? 'READY' : 'PROTECTED')}</span></div>
          <div class="data-row"><span class="data-label">Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ðµ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ</span><span class="data-value">${syncMeta.localDirty ? 'YES' : 'NO'}</span></div>
          <div class="data-row"><span class="data-label">ÐŸÐ¾ÑÐ»ÐµÐ´Ð½ÑÑ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÐ°</span><span class="data-value">${esc(syncMeta.lastCheckedAt || 'â€”')}</span></div>
          <div class="data-row"><span class="data-label">ÐŸÐ¾ÑÐ»ÐµÐ´Ð½ÑÑ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²ÐºÐ°</span><span class="data-value">${esc(syncMeta.lastPushedAt || 'â€”')}</span></div>
          <div class="data-row"><span class="data-label">ÐŸÐ¾ÑÐ»ÐµÐ´Ð½ÐµÐµ Ð¿Ð¾Ð»ÑƒÑ‡ÐµÐ½Ð¸Ðµ</span><span class="data-value">${esc(syncMeta.lastPulledAt || 'â€”')}</span></div>
          <div class="small-note" style="margin-top:12px">${esc(syncMeta.lastError || 'ÐžÑˆÐ¸Ð±Ð¾Ðº Ð½ÐµÑ‚. ÐŸÑ€Ð¸ ÐºÐ¾Ð½Ñ„Ð»Ð¸ÐºÑ‚Ðµ Ð¿Ñ€Ð¸Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ Ð½Ðµ Ð¿ÐµÑ€ÐµÐ·Ð°Ð¿Ð¸ÑÑ‹Ð²Ð°ÐµÑ‚ Ð¾Ð±Ð»Ð°ÐºÐ¾ Ð°Ð²Ñ‚Ð¾Ð¼Ð°Ñ‚Ð¸Ñ‡ÐµÑÐºÐ¸.')}</div>
        </div>
      </div>
    `;
    $('#sync-test-btn')?.addEventListener('click', async () => {
      const res = await this.ping();
      if (res?.ok && res?.connected) Toast.show(`Ð¡Ð²ÑÐ·ÑŒ Ñ ${this.cloudName()} Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´ÐµÐ½Ð°`, 'ok');
      else Toast.show(`Ð¡Ð²ÑÐ·ÑŒ Ñ ${this.cloudName()} Ð½Ðµ Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´ÐµÐ½Ð°: ${res?.message || 'unknown error'}`, 'info');
    });
    $('#sync-pull-btn')?.addEventListener('click', async () => {
      if (this.manualPushBusy || this.dataTransferDepth > 0) return;
      this.beginDataTransfer('receive');
      try {
        await this.checkForRemoteUpdates('manual-pull', { applyIfNewer: true, force: true, silent: false });
        await PlayerSync.pullUpdates('manual-pull', { forceFull: true, silent: false, rerender: true });
      } finally {
        this.endDataTransfer();
      }
    });
    $('#sync-push-btn')?.addEventListener('click', async () => {
      if (this.manualPushBusy || this.dataTransferDepth > 0) return;
      if (String(App?.currentUser?.role || '').trim().toLowerCase() !== 'gm') {
        Toast.show('Ð ÑƒÑ‡Ð½Ð°Ñ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²ÐºÐ° Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÑŽ Ð”ÐœÐ°', 'err');
        return;
      }
      this.manualPushBusy = true;
      this.refreshDataTransferIndicator();
      try {
        const localRevision = Number(App.state?.meta?.sync?.remoteRevision || 0);
        const check = await window.electronAPI?.pingSync?.();
        if (!check?.ok || !check?.connected) {
          Toast.show(`ÐžÐ±Ð»Ð°ÐºÐ¾ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾: ${check?.message || 'Ð¾ÑˆÐ¸Ð±ÐºÐ° ÑÐ¾ÐµÐ´Ð¸Ð½ÐµÐ½Ð¸Ñ'}`, 'err');
          return;
        }
        if (!check?.hasRemoteSnapshot || !check?.remote) {
          this.baselineToken = '';
          Toast.show('ÐžÐ±Ð»Ð°Ñ‡Ð½Ñ‹Ð¹ ÑÐ½Ð¸Ð¼Ð¾Ðº Ð¾Ñ‚ÑÑƒÑ‚ÑÑ‚Ð²ÑƒÐµÑ‚. Ð—Ð°Ð³Ñ€ÑƒÐ·ÐºÐ° ÑƒÑÑ‚Ð°Ð½Ð¾Ð²Ð¾Ñ‡Ð½Ñ‹Ñ… Ð´Ð°Ð½Ð½Ñ‹Ñ… Ð·Ð°Ð¿Ñ€ÐµÑ‰ÐµÐ½Ð°.', 'err');
          return;
        }
        const cloudRevision = Number(check.remote.revision || 0);
        const revisionNote = cloudRevision === localRevision
          ? 'Ð ÐµÐ²Ð¸Ð·Ð¸Ð¸ ÑÐ¾Ð²Ð¿Ð°Ð´Ð°ÑŽÑ‚.'
          : `Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ð°Ñ Ð±Ð°Ð·Ð¾Ð²Ð°Ñ Ñ€ÐµÐ²Ð¸Ð·Ð¸Ñ: r${localRevision}. ÐŸÐµÑ€ÐµÐ´ Ð·Ð°Ð¼ÐµÐ½Ð¾Ð¹ Ð¾Ð±Ð»Ð°Ñ‡Ð½Ð°Ñ r${cloudRevision} Ð±ÑƒÐ´ÐµÑ‚ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð° Ð² Ñ€ÐµÐ·ÐµÑ€Ð²Ð½ÑƒÑŽ ÐºÐ¾Ð¿Ð¸ÑŽ.`;
        const confirmed = await requestConfirmationV1090(
          `ÐžÑ‚Ð¿Ñ€Ð°Ð²Ð¸Ñ‚ÑŒ Ñ‚ÐµÐºÑƒÑ‰Ð¸Ð¹ Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ð¹ ÑÐ½Ð¸Ð¼Ð¾Ðº ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸ Ð² Ð¾Ð±Ð»Ð°ÐºÐ¾?\n\nÐžÐ±Ð»Ð°Ñ‡Ð½Ð°Ñ Ñ€ÐµÐ²Ð¸Ð·Ð¸Ñ: r${cloudRevision}\nÐŸÐ¾ÑÐ»Ðµ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²ÐºÐ¸: r${cloudRevision + 1}\n${revisionNote}\n\nÐ”Ð¾ Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð¸Ñ Ð½Ðµ Ð¸Ð·Ð¼ÐµÐ½ÑÐ¹Ñ‚Ðµ Ð´Ð°Ð½Ð½Ñ‹Ðµ.`,
          { title: 'Ð ÑƒÑ‡Ð½Ð¾Ðµ Ð¾Ð±Ð½Ð¾Ð²Ð»ÐµÐ½Ð¸Ðµ Ð¾Ð±Ð»Ð°ÐºÐ°', acceptLabel: 'ÐžÑ‚Ð¿Ñ€Ð°Ð²Ð¸Ñ‚ÑŒ' }
        );
        if (!confirmed) return;
        const result = await this.pushCurrentSnapshot('manual-gm-push', { silent: true, manual: true, requireGm: true });
        if (result?.ok) Toast.show(`Ð”Ð°Ð½Ð½Ñ‹Ðµ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²Ð»ÐµÐ½Ñ‹ Ð² Ð¾Ð±Ð»Ð°ÐºÐ¾. Ð ÐµÐ²Ð¸Ð·Ð¸Ñ r${Number(result.remote?.revision || cloudRevision + 1)}${result.cloudBackupCreated ? '. ÐŸÑ€ÐµÐ´Ñ‹Ð´ÑƒÑ‰Ð°Ñ Ð¾Ð±Ð»Ð°Ñ‡Ð½Ð°Ñ Ñ€ÐµÐ²Ð¸Ð·Ð¸Ñ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð° Ð² Ñ€ÐµÐ·ÐµÑ€Ð²Ð½ÑƒÑŽ ÐºÐ¾Ð¿Ð¸ÑŽ' : ''}`, 'ok');
        else Toast.show(result?.message || 'ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²Ð¸Ñ‚ÑŒ Ð´Ð°Ð½Ð½Ñ‹Ðµ Ð² Ð¾Ð±Ð»Ð°ÐºÐ¾', 'err');
      } finally {
        this.manualPushBusy = false;
        this.render();
        this.refreshDataTransferIndicator();
      }
    });
  }
};

/* v1.0.96 â€” persistent data-transfer status for full campaign snapshots. */
const __syncCheckForRemoteUpdatesV1096 = Sync.checkForRemoteUpdates.bind(Sync);
Sync.checkForRemoteUpdates = async function(...args) {
  this.beginDataTransfer('receive');
  try {
    return await __syncCheckForRemoteUpdatesV1096(...args);
  } finally {
    this.endDataTransfer();
  }
};
const __syncPushCurrentSnapshotV1096 = Sync.pushCurrentSnapshot.bind(Sync);
Sync.pushCurrentSnapshot = async function(...args) {
  this.beginDataTransfer('send');
  try {
    return await __syncPushCurrentSnapshotV1096(...args);
  } finally {
    this.endDataTransfer();
  }
};

/* v1.0.15 patch: live world snapshot refresh for skills, tickers and reputation sections */
(function() {
  if (window.__worldSnapshotRealtimeV1015) return;
  window.__worldSnapshotRealtimeV1015 = true;

  function snapshotEventFingerprintV1015(payload = {}) {
    const remote = payload?.remote || payload || {};
    return [payload?.eventType || '', remote?.campaignId || '', remote?.revision || 0, remote?.updatedAt || '', remote?.updatedBy || ''].join('|');
  }

  function shouldApplyWorldSnapshotNowV1015() {
    if (!Sync?.config?.enabled) return false;
    if (UiSyncGuard?.isEditingCriticalForm?.()) return false;
    if (App?.state?.meta?.sync?.localDirty) return false;
    return true;
  }

  Sync._seenWorldSnapshotEventsV1015 = Sync._seenWorldSnapshotEventsV1015 || {};
  Sync._pendingWorldSnapshotPullV1015 = null;

  Sync.scheduleWorldSnapshotPullV1015 = function(reason = 'world-snapshot-event', delayMs = 350) {
    if (this._pendingWorldSnapshotPullV1015) clearTimeout(this._pendingWorldSnapshotPullV1015);
    this._pendingWorldSnapshotPullV1015 = setTimeout(() => {
      this._pendingWorldSnapshotPullV1015 = null;
      (async () => {
        await this.loadConfig();
        if (!this.config?.enabled) return;
        if (!shouldApplyWorldSnapshotNowV1015()) {
          if (App?.state?.meta?.sync?.localDirty) {
            await this.checkForRemoteUpdates(`${reason}:dirty-check`, { applyIfNewer: false, silent: true });
            return;
          }
          this.scheduleWorldSnapshotPullV1015(`${reason}:deferred`, 1200);
          return;
        }
        await this.checkForRemoteUpdates(reason, { applyIfNewer: true, silent: true });
      })().catch(error => {
        Debug.error('WORLD_SNAPSHOT_REALTIME_PULL_FAILED', { message: error?.message || String(error), stack: error?.stack || null });
      });
    }, Math.max(0, Number(delayMs || 0)));
  };

  Sync.initWorldSnapshotRealtimeBridgeV1015 = function() {
    if (this._worldSnapshotRealtimeUnsubV1015 || !window.electronAPI?.onSyncSnapshotEvent) return;
    this._worldSnapshotRealtimeUnsubV1015 = window.electronAPI.onSyncSnapshotEvent(payload => {
      const fp = snapshotEventFingerprintV1015(payload);
      const now = Date.now();
      const seenAt = Number(this._seenWorldSnapshotEventsV1015[fp] || 0);
      if (fp && seenAt && now - seenAt < 15000) return;
      if (fp) this._seenWorldSnapshotEventsV1015[fp] = now;

      const remoteRevision = Number(payload?.remote?.revision || 0);
      const localRevision = Number(App?.state?.meta?.sync?.remoteRevision || 0);
      if (remoteRevision && remoteRevision <= localRevision) return;
      this.scheduleWorldSnapshotPullV1015('world-snapshot-realtime', 350);

      Object.entries(this._seenWorldSnapshotEventsV1015).forEach(([key, stamp]) => {
        if (now - Number(stamp || 0) > 30000) delete this._seenWorldSnapshotEventsV1015[key];
      });
    });
  };

  const __syncInitV1015 = Sync.init.bind(Sync);
  Sync.init = async function() {
    const result = await __syncInitV1015();
    this.initWorldSnapshotRealtimeBridgeV1015();
    // Ð¿ÐµÑ€ÐµÐ·Ð°Ð¿ÑƒÑÐºÐ°ÐµÐ¼ Ð¾Ð¿Ñ€Ð¾Ñ: Ñ Ð°ÐºÑ‚Ð¸Ð²Ð½Ñ‹Ð¼ realtime Ð¾Ð½ Ñ€Ð°ÑÑ‚ÑÐ³Ð¸Ð²Ð°ÐµÑ‚ÑÑ Ð´Ð¾ ÑÑ‚Ñ€Ð°Ñ…Ð¾Ð²Ð¾Ñ‡Ð½Ð¾Ð³Ð¾
    if (this._worldSnapshotRealtimeUnsubV1015 && this.pollTimer) this.startPolling();
    return result;
  };

  const __syncSaveConfigFromFormV1015 = Sync.saveConfigFromForm.bind(Sync);
  Sync.saveConfigFromForm = async function(formEl, options = {}) {
    const result = await __syncSaveConfigFromFormV1015(formEl, options);
    this.initWorldSnapshotRealtimeBridgeV1015();
    if (result?.ok && result?.config?.enabled) this.scheduleWorldSnapshotPullV1015('sync-config-saved', 250);
    return result;
  };
})();

// ==== v1.0.88 active-campaign era visibility ====
window.addEventListener('load', () => {
  const ERA_IDS_V1088 = new Set(['medieval', 'industrial', 'technological']);

  function normalizeVisibilityEraV1088(value, fallback = '') {
    const raw = String(value || '').trim().toLowerCase();
    if (ERA_IDS_V1088.has(raw)) return raw;
    if (/ÑÑ€ÐµÐ´|mediev|feudal|ancient/.test(raw)) return 'medieval';
    if (/Ð¸Ð½Ð´ÑƒÑÑ‚Ñ€|industrial|steam|diesel|analog|modern|nowadays/.test(raw)) return 'industrial';
    if (/Ñ‚ÐµÑ…Ð½|technolog|future|sci[\s-]?fi|space/.test(raw)) return 'technological';
    return fallback;
  }

  function uniqueVisibilityIdsV1088(value) {
    return Array.from(new Set((Array.isArray(value) ? value : [])
      .map(entry => String(entry?.id || entry?.campaignId || entry || '').trim())
      .filter(Boolean)));
  }

  function visibilityScopeV1088(entity = {}) {
    const source = entity?.visibility && typeof entity.visibility === 'object' ? entity.visibility : {};
    return {
      playerIds: uniqueVisibilityIdsV1088(source.playerIds),
      campaignIds: uniqueVisibilityIdsV1088(source.campaignIds || source.campaigns),
      eraIds: uniqueVisibilityIdsV1088(source.eraIds || source.eras || source.epochs)
        .map(value => normalizeVisibilityEraV1088(value))
        .filter(Boolean)
    };
  }

  function campaignIdsForVisibilityV1088(user = {}) {
    const ids = uniqueVisibilityIdsV1088(user.campaignIds || user.campaigns);
    if (user.campaignId) ids.push(String(user.campaignId).trim());
    return Array.from(new Set((ids.length ? ids : ['main']).filter(Boolean)));
  }

  function campaignForVisibilityV1088(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    return Data?.getCampaign?.(key) || Data?.campaigns?.[key] || worldData?.campaigns?.CAMPAIGNS?.[key] || null;
  }

  function campaignEraV1088(campaign = null) {
    if (!campaign) return '';
    return normalizeVisibilityEraV1088(campaign.era || campaign.eraId || campaign.epoch || campaign.epochId || campaign.theme, 'technological');
  }

  function activeCampaignForVisibilityV1088(user = {}) {
    const activeId = String(App?.activeCampaignId || '').trim();
    if (activeId) {
      const active = campaignForVisibilityV1088(activeId);
      if (active) return active;
    }
    return campaignIdsForVisibilityV1088(user).map(campaignForVisibilityV1088).find(Boolean) || null;
  }

  function originGrantsEntityV1088(entity = {}, user = {}) {
    const entityId = String(entity?.id || '').trim();
    const originId = String(user?.geographicOriginId || '').trim();
    if (!entityId || !originId) return false;
    const section = worldData?.geographicOrigins || {};
    const origin = section?.GEOGRAPHIC_ORIGINS?.[originId]
      || (section?.GEOGRAPHIC_ORIGIN_LIST || []).find(row => String(row?.id || '') === originId);
    if (!origin) return false;
    let regionMaps = {};
    try { regionMaps = window.RegionMapsV36?.maps?.() || {}; } catch {}
    const planetIds = uniqueVisibilityIdsV1088([
      ...(origin.linkedPlanetIds || origin.planetIds || origin.accessPlanetIds || []),
      ...(origin.grantedPlanetIds || origin.accessGrantedPlanetIds || []),
      ...uniqueVisibilityIdsV1088(origin.linkedRegionIds || origin.regionIds || origin.accessRegionIds || [])
        .map(regionId => regionMaps?.[regionId]?.planetId || '')
    ]);
    if (Data?.getPlanet?.(entityId) && planetIds.includes(entityId)) return true;
    const systemIds = new Set(uniqueVisibilityIdsV1088(origin.grantedSystemIds || origin.accessGrantedSystemIds || []));
    planetIds.forEach(planetId => {
      const systemId = Data?.getSystemForPlanet?.(planetId)?.id;
      if (systemId) systemIds.add(String(systemId));
    });
    return Boolean(Data?.getSystem?.(entityId) && systemIds.has(entityId));
  }

  function evaluateVisibilityV1088(entity, user = App.currentUser) {
    if (!entity) return false;
    const role = String(user?.role || '').trim().toLowerCase();
    if (!user || role === 'gm') return true;
    if (!entity.visibility || typeof entity.visibility !== 'object') return true;
    const scope = visibilityScopeV1088(entity);
    if (!scope.playerIds.length && !scope.campaignIds.length && !scope.eraIds.length) return false;
    const userId = String(user.id || '').trim();
    if (scope.playerIds.includes(userId)) return true;
    if (role === 'guest') return scope.playerIds.includes('__guest__') || scope.playerIds.includes('guest');
    if (originGrantsEntityV1088(entity, user)) return true;
    const campaignIds = new Set(campaignIdsForVisibilityV1088(user));
    if (scope.campaignIds.some(id => campaignIds.has(String(id)))) return true;
    if (!scope.eraIds.length) return false;
    const activeEra = campaignEraV1088(activeCampaignForVisibilityV1088(user));
    return Boolean(activeEra && scope.eraIds.includes(activeEra));
  }

  function copyRawVisibilityV1088(target, raw) {
    if (!target || !raw || !raw.visibility || typeof raw.visibility !== 'object') return;
    target.visibility = visibilityScopeV1088(raw);
  }

  function restoreMapVisibilityV1088(store, rawMap) {
    if (!store || !rawMap || typeof rawMap !== 'object') return;
    Object.entries(rawMap).forEach(([id, raw]) => {
      const target = store instanceof Map ? store.get(id) : store[id];
      copyRawVisibilityV1088(target, raw);
    });
  }

  function restoreArrayVisibilityV1088(store, rawRows) {
    if (!Array.isArray(store) || !Array.isArray(rawRows)) return;
    const byId = new Map(store.map(row => [String(row?.id || ''), row]));
    rawRows.forEach(raw => copyRawVisibilityV1088(byId.get(String(raw?.id || '')), raw));
  }

  const applyWorldBeforeEraVisibilityV1088 = applyWorldData;
  applyWorldData = function(payload = {}) {
    const result = applyWorldBeforeEraVisibilityV1088(payload);
    restoreArrayVisibilityV1088(Data?.systems, payload?.systems?.SYSTEMS);
    restoreMapVisibilityV1088(Data?.planets, payload?.planets?.PLANETS);
    restoreMapVisibilityV1088(Data?.npcs, payload?.npcs?.NPCS);
    restoreMapVisibilityV1088(Data?.equipment, payload?.equipment?.EQUIPMENT);
    restoreMapVisibilityV1088(Data?.flora, payload?.flora?.FLORA);
    restoreMapVisibilityV1088(Data?.fauna, payload?.fauna?.FAUNA);
    restoreMapVisibilityV1088(Data?.articles, payload?.articles?.ARTICLES);
    restoreMapVisibilityV1088(Data?.news, payload?.news?.NEWS);
    restoreMapVisibilityV1088(Data?.tasks, payload?.tasks?.TASKS);
    restoreMapVisibilityV1088(Data?.organizations, payload?.organizations?.ORGANIZATIONS);
    restoreMapVisibilityV1088(Data?.factions, payload?.factions?.FACTIONS);
    restoreMapVisibilityV1088(Data?.skills, payload?.skills?.SKILLS);
    return result;
  };

  isEntityVisible = evaluateVisibilityV1088;
  window.GRPGVisibilityV1088 = Object.freeze({
    evaluate: evaluateVisibilityV1088,
    scope: visibilityScopeV1088,
    normalizeEra: normalizeVisibilityEraV1088,
    activeCampaign: activeCampaignForVisibilityV1088
  });
});

// v1.0.87: citizenship is derived from geographic-origin access and the global-map legend.
// The value is deliberately not editable: changing an origin, a planet color or a legend label
// must update every character without creating a second, stale source of truth.
window.addEventListener('load', () => {
  function colorKeyV1087(value) {
    const raw = String(value || '').trim().toLowerCase();
    const short = raw.match(/^#([0-9a-f]{3})$/i);
    if (short) return `#${short[1].split('').map(part => part + part).join('')}`;
    const hex = raw.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
    if (hex) return `#${hex[1]}`;
    const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (rgb) return `#${rgb.slice(1, 4).map(value => Math.max(0, Math.min(255, Number(value))).toString(16).padStart(2, '0')).join('')}`;
    return raw.replace(/\s+/g, '');
  }

  function uniqueIdsV1087(values = []) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean)));
  }

  function geographicOriginV1087(originId) {
    const section = worldData?.geographicOrigins || {};
    const direct = section?.GEOGRAPHIC_ORIGINS?.[String(originId || '')];
    if (direct) return direct;
    return (section?.GEOGRAPHIC_ORIGIN_LIST || []).find(origin => String(origin?.id || '') === String(originId || '')) || null;
  }

  function originPlanetIdsV1087(origin = {}) {
    let regionMaps = {};
    try { regionMaps = window.RegionMapsV36?.maps?.() || {}; } catch {}
    return uniqueIdsV1087([
      ...(origin.linkedPlanetIds || origin.planetIds || origin.accessPlanetIds || []),
      ...(origin.grantedPlanetIds || origin.accessGrantedPlanetIds || []),
      ...uniqueIdsV1087(origin.linkedRegionIds || origin.regionIds || origin.accessRegionIds || [])
        .map(regionId => regionMaps?.[regionId]?.planetId || '')
    ]);
  }

  function legendRowsV1087() {
    const stateRows = Array.isArray(App?.state?.galaxyLegend) ? App.state.galaxyLegend : [];
    const worldRows = Array.isArray(worldData?.ui?.galaxyLegend) ? worldData.ui.galaxyLegend : [];
    return (stateRows.length ? stateRows : worldRows)
      .map(entry => ({ color: String(entry?.color || '').trim(), label: String(entry?.label || entry?.name || '').trim() }))
      .filter(entry => entry.color && entry.label);
  }

  function resolveCitizenshipV1087(player = {}) {
    const origin = geographicOriginV1087(player.geographicOriginId);
    const planetIds = originPlanetIdsV1087(origin || {});
    const legend = legendRowsV1087();
    const legendByColor = new Map();
    legend.forEach(entry => {
      const key = colorKeyV1087(entry.color);
      if (key && !legendByColor.has(key)) legendByColor.set(key, entry);
    });
    const matches = [];
    const seenLabels = new Set();
    const unresolvedPlanetIds = [];
    planetIds.forEach(planetId => {
      const planet = PLANETS?.[planetId];
      const entry = planet ? legendByColor.get(colorKeyV1087(planet.color)) : null;
      if (!entry) { unresolvedPlanetIds.push(planetId); return; }
      if (seenLabels.has(entry.label)) {
        const previous = matches.find(row => row.label === entry.label);
        if (previous) previous.planetIds.push(planetId);
        return;
      }
      seenLabels.add(entry.label);
      matches.push({ label: entry.label, color: entry.color, planetIds: [planetId] });
    });
    const labels = matches.map(entry => entry.label);
    return {
      label: labels.join(' Â· '),
      labels,
      matches,
      planetIds,
      unresolvedPlanetIds,
      originId: String(player.geographicOriginId || '')
    };
  }

  function citizenshipMarkupV1087(result, fallback = 'ÐÐµ Ð¾Ð¿Ñ€ÐµÐ´ÐµÐ»ÐµÐ½Ð¾') {
    if (!result?.matches?.length) return `<span class="citizenship-value-v1087 unresolved">${esc(fallback)}</span>`;
    return `<span class="citizenship-value-v1087">${result.matches.map(entry => `<span class="citizenship-chip-v1087"><i class="citizenship-swatch-v1087" style="--citizenship-color:${esc(colorKeyV1087(entry.color))}"></i>${esc(entry.label)}</span>`).join('')}</span>`;
  }

  const normalizePlayerBeforeCitizenshipV1087 = normalizePlayerProfileV2;
  normalizePlayerProfileV2 = function(user = {}) {
    const next = normalizePlayerBeforeCitizenshipV1087(user);
    const citizenship = resolveCitizenshipV1087(next);
    next.citizenship = citizenship.label;
    next.citizenshipLabels = citizenship.labels;
    next.citizenshipPlanetIds = citizenship.planetIds;
    return next;
  };

  window.GRPCitizenshipV1087 = Object.freeze({ resolve: resolveCitizenshipV1087, colorKey: colorKeyV1087 });

  const renderProfileBeforeCitizenshipV1087 = UI.renderProfile.bind(UI);
  UI.renderProfile = function() {
    const result = renderProfileBeforeCitizenshipV1087();
    const user = App.currentUser ? normalizePlayerProfileV2(App.currentUser) : null;
    const card = document.querySelector('#profile-content .profile-card');
    if (user && card && !card.querySelector('[data-citizenship-v1087]')) {
      const balance = Array.from(card.querySelectorAll('.data-row')).find(row => row.querySelector('.data-label')?.textContent?.trim() === 'Ð‘Ð°Ð»Ð°Ð½Ñ');
      const markup = `<div class="data-row citizenship-row-v1087" data-citizenship-v1087><span class="data-label">Ð“Ñ€Ð°Ð¶Ð´Ð°Ð½ÑÑ‚Ð²Ð¾</span><span class="data-value">${citizenshipMarkupV1087(resolveCitizenshipV1087(user))}</span></div>`;
      if (balance) balance.insertAdjacentHTML('beforebegin', markup); else card.insertAdjacentHTML('beforeend', markup);
    }
    return result;
  };

  const renderLoginBeforeCitizenshipV1087 = App.renderLoginPreview.bind(App);
  App.renderLoginPreview = function() {
    const result = renderLoginBeforeCitizenshipV1087();
    const selectedId = document.getElementById('char-select')?.value || '';
    const player = this.state?.users?.[selectedId] || PLAYER_TEMPLATES?.[selectedId] || null;
    const copy = document.querySelector('#login-preview .login-preview-inner > div:last-child');
    if (player && copy && !copy.querySelector('[data-login-citizenship-v1087]')) {
      copy.insertAdjacentHTML('beforeend', `<div class="small-note login-citizenship-v1087" data-login-citizenship-v1087>Ð“Ñ€Ð°Ð¶Ð´Ð°Ð½ÑÑ‚Ð²Ð¾: ${citizenshipMarkupV1087(resolveCitizenshipV1087(player))}</div>`);
    }
    return result;
  };

  const renderPlayerEditorBeforeCitizenshipV1087 = Configurator.renderPlayerEditor.bind(Configurator);
  Configurator.renderPlayerEditor = function(rawUser) {
    const user = normalizePlayerProfileV2(rawUser);
    let html = renderPlayerEditorBeforeCitizenshipV1087(user);
    const result = resolveCitizenshipV1087(user);
    const field = `<div class="card pad18 citizenship-editor-v1087" data-citizenship-editor-v1087><div class="data-row"><span class="data-label">Ð“Ñ€Ð°Ð¶Ð´Ð°Ð½ÑÑ‚Ð²Ð¾</span><span class="data-value" data-citizenship-value-v1087>${citizenshipMarkupV1087(result)}</span></div><div class="small-note">ÐžÐ¿Ñ€ÐµÐ´ÐµÐ»ÑÐµÑ‚ÑÑ Ð°Ð²Ñ‚Ð¾Ð¼Ð°Ñ‚Ð¸Ñ‡ÐµÑÐºÐ¸ Ð¿Ð¾ Ð¿Ñ€Ð¾Ð¸ÑÑ…Ð¾Ð¶Ð´ÐµÐ½Ð¸ÑŽ, Ñ†Ð²ÐµÑ‚Ñƒ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾Ð¹ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹ Ð¸ Ð³Ð»Ð¾Ð±Ð°Ð»ÑŒÐ½Ð¾Ð¹ Ð»ÐµÐ³ÐµÐ½Ð´Ðµ.</div></div>`;
    const anchor = '<div class="section-title">Ð›Ð¸Ñ‡Ð½Ð¾ÑÑ‚ÑŒ</div>';
    if (html.includes(anchor)) html = html.replace(anchor, field + anchor);
    else html = html.replace('<button class="primary" type="submit">SAVE_PLAYER</button>', field + '<button class="primary" type="submit">SAVE_PLAYER</button>');
    return html;
  };

  const collectEntityBeforeCitizenshipV1087 = Configurator.collectEntity.bind(Configurator);
  Configurator.collectEntity = function(type, formEl, formData = new FormData(formEl)) {
    const entity = collectEntityBeforeCitizenshipV1087(type, formEl, formData);
    if (type !== 'players' || !entity) return entity;
    const citizenship = resolveCitizenshipV1087(entity);
    entity.citizenship = citizenship.label;
    entity.citizenshipLabels = citizenship.labels;
    entity.citizenshipPlanetIds = citizenship.planetIds;
    return entity;
  };

  function decorateRegistrationOriginsV1087(root = document) {
    root.querySelectorAll?.('#registration-panel-v1052 [name="geographicOriginId"]').forEach(input => {
      const body = input.closest('.origin-choice-card-v1054')?.querySelector('.origin-choice-body-v1054');
      if (!body || body.querySelector('[data-origin-citizenship-v1087]')) return;
      const result = resolveCitizenshipV1087({ geographicOriginId: input.value });
      const markup = `<div class="origin-citizenship-v1087" data-origin-citizenship-v1087><span>Ð“Ñ€Ð°Ð¶Ð´Ð°Ð½ÑÑ‚Ð²Ð¾</span>${citizenshipMarkupV1087(result)}</div>`;
      const anchor = body.querySelector('.origin-bonuses-v1054, .origin-select-indicator-v1054');
      if (anchor) anchor.insertAdjacentHTML('beforebegin', markup); else body.insertAdjacentHTML('beforeend', markup);
    });
  }

  document.addEventListener('click', event => {
    if (event.target?.id === 'register-character-btn-v1052') requestAnimationFrame(() => decorateRegistrationOriginsV1087());
  });
  document.addEventListener('change', event => {
    if (event.target?.name === 'campaignId' && event.target.closest('#registration-panel-v1052')) requestAnimationFrame(() => decorateRegistrationOriginsV1087());
    if (event.target?.name === 'geographicOriginId' && event.target.closest('#config-editor-form')) {
      const target = document.querySelector('[data-citizenship-value-v1087]');
      if (target) target.innerHTML = citizenshipMarkupV1087(resolveCitizenshipV1087({ geographicOriginId: event.target.value }));
    }
  });
});

// ==== v1.0.86 World Config rich insertion + fast player editing ====
(() => {
  'use strict';

  let activeMenuV1086 = null;
  let activePickerV1086 = null;

  const attributeV1086 = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  function closeMenuV1086() {
    activeMenuV1086?.remove();
    activeMenuV1086 = null;
  }

  function closePickerV1086() {
    activePickerV1086?.remove();
    activePickerV1086 = null;
  }

  function placeMenuV1086(menu, x, y) {
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    activeMenuV1086 = menu;
  }

  function showMenuV1086(x, y, entries = []) {
    closeMenuV1086();
    const menu = document.createElement('div');
    menu.className = 'rich-context-menu-v1086';
    menu.setAttribute('role', 'menu');
    entries.forEach(entry => {
      if (entry.separator) {
        menu.insertAdjacentHTML('beforeend', '<div class="rich-context-separator-v1086"></div>');
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `<span>${entry.icon || 'â€º'}</span><b>${esc(entry.label || '')}</b>${entry.hint ? `<kbd>${esc(entry.hint)}</kbd>` : ''}`;
      button.addEventListener('click', event => {
        event.preventDefault();
        closeMenuV1086();
        Promise.resolve(entry.action?.()).catch(error => Toast.show(error?.message || String(error), 'err'));
      });
      menu.appendChild(button);
    });
    placeMenuV1086(menu, x, y);
  }

  function captureEditorV1086(target) {
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const start = Number(target.selectionStart ?? target.value.length);
      const end = Number(target.selectionEnd ?? start);
      return { target, kind: 'control', start, end, selectedText: target.value.slice(start, end) };
    }
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const inside = range && target.contains(range.commonAncestorContainer);
    return {
      target,
      kind: 'contenteditable',
      range: inside ? range.cloneRange() : null,
      selectedText: inside ? range.toString() : ''
    };
  }

  function restoreControlSelectionV1086(snapshot) {
    const target = snapshot?.target;
    if (!target?.isConnected) throw new Error('ÐŸÐ¾Ð»Ðµ ÑƒÐ¶Ðµ Ð·Ð°ÐºÑ€Ñ‹Ñ‚Ð¾. ÐžÑ‚ÐºÑ€Ð¾Ð¹Ñ‚Ðµ ÐµÐ³Ð¾ Ð¸ Ð¿Ð¾Ð²Ñ‚Ð¾Ñ€Ð¸Ñ‚Ðµ Ð²ÑÑ‚Ð°Ð²ÐºÑƒ.');
    target.focus();
    if (snapshot.kind === 'control') target.setSelectionRange(snapshot.start, snapshot.end);
  }

  function insertIntoEditorV1086(snapshot, value) {
    const html = String(value || '');
    const target = snapshot?.target;
    if (!target?.isConnected) throw new Error('ÐŸÐ¾Ð»Ðµ ÑƒÐ¶Ðµ Ð·Ð°ÐºÑ€Ñ‹Ñ‚Ð¾. ÐžÑ‚ÐºÑ€Ð¾Ð¹Ñ‚Ðµ ÐµÐ³Ð¾ Ð¸ Ð¿Ð¾Ð²Ñ‚Ð¾Ñ€Ð¸Ñ‚Ðµ Ð²ÑÑ‚Ð°Ð²ÐºÑƒ.');
    if (snapshot.kind === 'control') {
      target.focus();
      target.setRangeText(html, snapshot.start, snapshot.end, 'end');
    } else {
      target.focus();
      const range = snapshot.range || document.createRange();
      if (!snapshot.range) {
        range.selectNodeContents(target);
        range.collapse(false);
      }
      range.deleteContents();
      const template = document.createElement('template');
      template.innerHTML = html;
      const fragment = template.content;
      const last = fragment.lastChild;
      range.insertNode(fragment);
      if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function richEditorContextV1086(target) {
    const form = target.closest?.('#config-editor-form, form');
    const type = String(form?.dataset?.entityType || form?.dataset?.campaignId || 'rich-text');
    const id = String(form?.querySelector?.('[name="id"]')?.value || form?.dataset?.playerId || form?.dataset?.npcId || App.currentUserId || 'entry');
    return { section: type === 'rich-text' ? 'rich-text' : `rich-${type}`, entityId: id };
  }

  function pickerRowsV1086(kind) {
    if (kind === 'article') {
      const pool = new Map();
      Object.values(ARTICLES || {}).forEach(article => article?.id && pool.set(String(article.id), article));
      (ARTICLE_LIST || []).forEach(article => article?.id && pool.set(String(article.id), article));
      return Array.from(pool.values()).map(article => ({
        id: String(article.id),
        type: 'article',
        label: String(article.title || article.name || article.id),
        subtitle: String(article.category || article.subtitle || article.id),
        search: `${article.title || ''} ${article.name || ''} ${article.category || ''} ${article.id || ''}`.toLowerCase()
      }));
    }
    const players = Object.values({ ...(PLAYER_TEMPLATES || {}), ...(App.state?.users || {}) })
      .filter(player => player?.id && String(player.role || '').toLowerCase() !== 'gm')
      .map(player => ({
        id: String(player.id), type: 'player',
        label: String(player.displayName || player.shortName || player.id),
        subtitle: `ÐŸÐµÑ€ÑÐ¾Ð½Ð°Ð¶ Ð¸Ð³Ñ€Ð¾ÐºÐ° Â· ${player.rank || player.id}`,
        search: `${player.displayName || ''} ${player.shortName || ''} ${player.rank || ''} ${player.id || ''}`.toLowerCase()
      }));
    if (kind === 'player') return players.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    const npcs = Object.values(NPCS || {}).filter(npc => npc?.id).map(npc => ({
      id: String(npc.id), type: 'npc', label: String(npc.name || npc.id),
      subtitle: `NPC Â· ${npc.mapLabel || npc.role || npc.id}`,
      search: `${npc.name || ''} ${npc.mapLabel || ''} ${npc.role || ''} ${npc.id || ''}`.toLowerCase()
    }));
    return [...players, ...npcs].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }

  function openPickerV1086({ kind, title, selectedText = '', onChoose }) {
    closePickerV1086();
    const modal = document.createElement('div');
    modal.className = 'modal open rich-link-picker-v1086';
    modal.innerHTML = `<div class="rich-link-picker-shell-v1086 card">
      <div class="rich-link-picker-head-v1086"><div><span class="mono accent">ÐÐÐ¡Ð¢Ð ÐžÐ™ÐšÐ ÐœÐ˜Ð Ð</span><h2>${esc(title)}</h2></div><button class="ghost" type="button" data-picker-close-v1086>Ã—</button></div>
      ${kind !== 'player' ? `<div class="field"><label>Ð¢ÐµÐºÑÑ‚ ÑÑÑ‹Ð»ÐºÐ¸</label><input class="input" data-picker-label-v1086 value="${attributeV1086(selectedText)}" placeholder="Ð•ÑÐ»Ð¸ Ð¿ÑƒÑÑ‚Ð¾ â€” Ð±ÑƒÐ´ÐµÑ‚ Ð¸ÑÐ¿Ð¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ð½Ð¾ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ" /></div>` : ''}
      <div class="field"><label>ÐŸÐ¾Ð¸ÑÐº</label><input class="input" type="search" data-picker-search-v1086 placeholder="ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¸Ð»Ð¸ ID" autofocus /></div>
      <div class="rich-link-picker-list-v1086" data-picker-list-v1086></div>
    </div>`;
    document.body.appendChild(modal);
    activePickerV1086 = modal;
    const rows = pickerRowsV1086(kind);
    const search = modal.querySelector('[data-picker-search-v1086]');
    const list = modal.querySelector('[data-picker-list-v1086]');
    const render = () => {
      const query = String(search?.value || '').trim().toLowerCase();
      const visible = rows.filter(row => !query || row.search.includes(query)).slice(0, 250);
      list.innerHTML = visible.map(row => `<button type="button" data-picker-row-v1086 data-id="${attributeV1086(row.id)}" data-type="${attributeV1086(row.type)}"><span class="rich-link-picker-glyph-v1086">${row.type === 'article' ? 'A' : row.type === 'npc' ? 'N' : 'P'}</span><span><b>${esc(row.label)}</b><small>${esc(row.subtitle)}</small></span><em>Ð’Ð«Ð‘Ð ÐÐ¢Ð¬</em></button>`).join('') || '<div class="small-note">ÐÐ¸Ñ‡ÐµÐ³Ð¾ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾.</div>';
    };
    render();
    search?.addEventListener('input', render);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-picker-close-v1086]')) {
        closePickerV1086();
        return;
      }
      const button = event.target.closest('[data-picker-row-v1086]');
      if (!button) return;
      const row = rows.find(item => item.id === button.dataset.id && item.type === button.dataset.type);
      if (!row) return;
      const label = String(modal.querySelector('[data-picker-label-v1086]')?.value || '').trim() || row.label;
      closePickerV1086();
      onChoose?.(row, label);
    });
    requestAnimationFrame(() => search?.focus());
  }

  function insertArticleLinkV1086(snapshot) {
    openPickerV1086({
      kind: 'article', title: 'Ð¡ÑÑ‹Ð»ÐºÐ° Ð½Ð° ÑÑ‚Ð°Ñ‚ÑŒÑŽ', selectedText: snapshot.selectedText,
      onChoose: (row, label) => insertIntoEditorV1086(snapshot, `<a href="article:${attributeV1086(row.id)}" data-article-id="${attributeV1086(row.id)}">${esc(label)}</a>`)
    });
  }

  function insertCharacterLinkV1086(snapshot) {
    openPickerV1086({
      kind: 'character', title: 'Ð¡ÑÑ‹Ð»ÐºÐ° Ð½Ð° Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°', selectedText: snapshot.selectedText,
      onChoose: (row, label) => insertIntoEditorV1086(snapshot, `<a href="${row.type}:${attributeV1086(row.id)}" data-entity-type="${row.type}" data-entity-id="${attributeV1086(row.id)}">${esc(label)}</a>`)
    });
  }

  async function insertLocalImageV1086(snapshot) {
    if (!window.electronAPI?.saveWorldImage) throw new Error('Ð—Ð°Ð³Ñ€ÑƒÐ·ÐºÐ° Ñ ÐºÐ¾Ð¼Ð¿ÑŒÑŽÑ‚ÐµÑ€Ð° Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ð² Ð¿Ñ€Ð¸Ð»Ð¾Ð¶ÐµÐ½Ð¸Ð¸ World Config.');
    if (!Sync?.config?.enabled) throw new Error('Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð²ÐºÐ»ÑŽÑ‡Ð¸Ñ‚Ðµ Ð¾Ð±Ð»Ð°Ñ‡Ð½ÑƒÑŽ ÑÐ¸Ð½Ñ…Ñ€Ð¾Ð½Ð¸Ð·Ð°Ñ†Ð¸ÑŽ: Ð¸Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ð´Ð¾Ð»Ð¶Ð½Ð¾ Ð¿Ð¾Ð»ÑƒÑ‡Ð¸Ñ‚ÑŒ Ð¾Ð±Ñ‰Ð¸Ð¹ URL Ð´Ð»Ñ Ð´Ñ€ÑƒÐ³Ð¸Ñ… Ð¸Ð³Ñ€Ð¾ÐºÐ¾Ð².');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.dds';
    fileInput.hidden = true;
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.remove();
      if (!file) return;
      const context = richEditorContextV1086(snapshot.target);
      const stem = `${context.section}_${context.entityId}_${file.name}`;
      Toast.show('Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ð·Ð°Ð³Ñ€ÑƒÐ¶Ð°ÐµÑ‚ÑÑ Ð² Ð¾Ð±Ð»Ð°ÐºÐ¾â€¦', 'info');
      try {
        const nativePath = !isDdsFileV51(file) ? window.electronAPI.getPathForFile?.(file) : '';
        const result = nativePath && window.electronAPI.saveWorldImageFile
          ? await window.electronAPI.saveWorldImageFile({ filePath: nativePath, preferredStem: stem, ...context })
          : await window.electronAPI.saveWorldImage({ dataUrl: await readImageFileAsRenderableDataUrlV51(file), preferredStem: stem, ...context });
        if (!result?.ok) throw new Error(result?.message || 'Ð¤Ð°Ð¹Ð» Ð½Ðµ Ð·Ð°Ð³Ñ€ÑƒÐ¶ÐµÐ½');
        if (!result.cloudUrl) throw new Error(result.warning || 'ÐžÐ±Ð»Ð°Ñ‡Ð½Ð¾Ðµ Ñ…Ñ€Ð°Ð½Ð¸Ð»Ð¸Ñ‰Ðµ Ð½Ðµ Ð²ÐµÑ€Ð½ÑƒÐ»Ð¾ Ð¿ÑƒÐ±Ð»Ð¸Ñ‡Ð½ÑƒÑŽ ÑÑÑ‹Ð»ÐºÑƒ. Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ð¹ Ð¿ÑƒÑ‚ÑŒ Ð½Ðµ Ð²ÑÑ‚Ð°Ð²Ð»ÐµÐ½.');
        insertIntoEditorV1086(snapshot, `<img class="rich-inline-image-v1086" src="${attributeV1086(result.cloudUrl)}" alt="${attributeV1086(file.name.replace(/\.[^.]+$/, ''))}" loading="lazy" decoding="async" />`);
        Toast.show('Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ð·Ð°Ð³Ñ€ÑƒÐ¶ÐµÐ½Ð¾ Ð¸ Ð²ÑÑ‚Ð°Ð²Ð»ÐµÐ½Ð¾', 'ok');
      } catch (error) {
        Toast.show(error?.message || String(error), 'err');
      }
    }, { once: true });
    fileInput.click();
  }

  async function pastePlainTextV1086(snapshot) {
    try {
      const text = await navigator.clipboard.readText();
      insertIntoEditorV1086(snapshot, text);
    } catch {
      restoreControlSelectionV1086(snapshot);
      if (!document.execCommand('paste')) Toast.show('Ð’ÑÑ‚Ð°Ð²ÐºÐ° Ð·Ð°Ð¿Ñ€ÐµÑ‰ÐµÐ½Ð° ÑÐ¸ÑÑ‚ÐµÐ¼Ð¾Ð¹. Ð˜ÑÐ¿Ð¾Ð»ÑŒÐ·ÑƒÐ¹Ñ‚Ðµ Ctrl+V.', 'info');
    }
  }

  function editorMenuV1086(snapshot, x, y) {
    showMenuV1086(x, y, [
      { icon: 'â–§', label: 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ñ ÐºÐ¾Ð¼Ð¿ÑŒÑŽÑ‚ÐµÑ€Ð°', action: () => insertLocalImageV1086(snapshot) },
      { icon: 'A', label: 'Ð¡ÑÑ‹Ð»ÐºÐ° Ð½Ð° ÑÑ‚Ð°Ñ‚ÑŒÑŽ', action: () => insertArticleLinkV1086(snapshot) },
      { icon: 'P', label: 'Ð¡ÑÑ‹Ð»ÐºÐ° Ð½Ð° Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°', action: () => insertCharacterLinkV1086(snapshot) },
      { separator: true },
      { icon: 'âœ‚', label: 'Ð’Ñ‹Ñ€ÐµÐ·Ð°Ñ‚ÑŒ', hint: 'Ctrl+X', action: () => { restoreControlSelectionV1086(snapshot); document.execCommand('cut'); } },
      { icon: 'â–£', label: 'ÐšÐ¾Ð¿Ð¸Ñ€Ð¾Ð²Ð°Ñ‚ÑŒ', hint: 'Ctrl+C', action: () => { restoreControlSelectionV1086(snapshot); document.execCommand('copy'); } },
      { icon: 'â†“', label: 'Ð’ÑÑ‚Ð°Ð²Ð¸Ñ‚ÑŒ', hint: 'Ctrl+V', action: () => pastePlainTextV1086(snapshot) }
    ]);
  }

  function playerByIdV1086(playerId) {
    return App.state?.users?.[playerId] || PLAYER_TEMPLATES?.[playerId] || null;
  }

  function openFastPlayerEditorV1086(playerId) {
    const id = String(playerId || '').trim();
    const player = playerByIdV1086(id);
    if (!player) {
      Toast.show('ÐŸÐµÑ€ÑÐ¾Ð½Ð°Ð¶ Ð¸Ð³Ñ€Ð¾ÐºÐ° Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½', 'err');
      return;
    }
    Configurator.selectedType = 'players';
    Configurator.selectedId = id;
    UI.openModule('config');
    Configurator.render();
    requestAnimationFrame(() => {
      const form = document.getElementById('config-editor-form');
      if (!form) return;
      form.dataset.fastPlayerEditorV1086 = '1';
      form.querySelector('[name="hpCurrent"]')?.focus();
      form.scrollIntoView({ block: 'start' });
    });
    Toast.show(`Ð‘Ñ‹ÑÑ‚Ñ€Ð¾Ðµ Ñ€ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¸Ðµ: ${player.displayName || id}`, 'info');
  }

  function chooseFastPlayerV1086() {
    openPickerV1086({
      kind: 'player', title: 'Ð‘Ñ‹ÑÑ‚Ñ€Ð¾Ðµ Ñ€ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¸Ðµ Ð¸Ð³Ñ€Ð¾ÐºÐ°',
      onChoose: row => openFastPlayerEditorV1086(row.id)
    });
  }

  function playerIdFromMapTargetV1086(target) {
    const direct = String(target.closest?.('.combat-token[data-player-id], .rts-map-token-v36[data-player-id], .rcc-token-v2[data-player-id]')?.dataset?.playerId || '').trim();
    if (direct) return direct;
    const combatNode = target.closest?.('[data-combat-kind="token"][data-combat-id]');
    if (combatNode) return String(Combat?.getRuntime?.()?.tokens?.find?.(token => String(token.id) === String(combatNode.dataset.combatId))?.playerId || '');
    return '';
  }

  function mapMenuV1086(target, x, y) {
    const playerId = playerIdFromMapTargetV1086(target);
    const player = playerByIdV1086(playerId);
    showMenuV1086(x, y, player ? [
      { icon: 'P', label: `Ð ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ñ‚ÑŒ: ${player.displayName || playerId}`, action: () => openFastPlayerEditorV1086(playerId) },
      { icon: 'â‰¡', label: 'Ð’Ñ‹Ð±Ñ€Ð°Ñ‚ÑŒ Ð´Ñ€ÑƒÐ³Ð¾Ð³Ð¾ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°', action: chooseFastPlayerV1086 }
    ] : [
      { icon: 'P', label: 'Ð‘Ñ‹ÑÑ‚Ñ€Ð¾ Ð¸Ð·Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°â€¦', action: chooseFastPlayerV1086 }
    ]);
  }

  document.addEventListener('contextmenu', event => {
    if (event.shiftKey) return;
    const editor = event.target?.closest?.('textarea:not([disabled]):not([readonly]), [contenteditable="true"]');
    if (editor) {
      event.preventDefault();
      event.stopPropagation();
      editorMenuV1086(captureEditorV1086(editor), event.clientX, event.clientY);
      return;
    }
    const gm = String(App.currentUser?.role || '').toLowerCase() === 'gm';
    const mapSurface = event.target?.closest?.('#galaxy, #combat-stage, #region-map-stage-v36, #rcc-stage-v2, .combat-token[data-player-id], .rts-map-token-v36[data-player-id], .rcc-token-v2[data-player-id]');
    if (gm && mapSurface) {
      event.preventDefault();
      event.stopPropagation();
      mapMenuV1086(event.target, event.clientX, event.clientY);
    }
  }, true);

  document.addEventListener('pointerdown', event => {
    if (activeMenuV1086 && !event.target.closest('.rich-context-menu-v1086')) closeMenuV1086();
  }, true);
  window.addEventListener('blur', closeMenuV1086);
  window.addEventListener('resize', closeMenuV1086);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    closeMenuV1086();
    closePickerV1086();
  });

  window.GRPGWorldConfigToolsV1086 = {
    openFastPlayerEditor: openFastPlayerEditorV1086,
    chooseFastPlayer: chooseFastPlayerV1086
  };
})();

/* v1.0.74 â€” full global stock exchange and non-inventory portfolio */
window.GRPGInstallGlobalStockExchangeV1074 = function(){
  if (window.__grpgGlobalStockExchangeV1074) return;
  window.__grpgGlobalStockExchangeV1074 = true;
  const Engine = window.GRPGMarketEngineV1071;
  if (!Engine) return;

  let tab = 'goods';
  let goodsCategoryV144 = 'all';
  let selected = null;
  let dragged = null;
  let exchangeV148 = null;
  let stockTimeframeV148 = '1m';

  function campaignIdV1074() { return String(Sync?.config?.campaignId || App.activeCampaignId || 'main'); }
  function campaignV1074() { const id=campaignIdV1074(); return Data?.getCampaign?.(id) || Data?.campaigns?.[id] || {}; }
  function marketStateV1074() { return App.state?.marketRuntimeV1071 || { claims:{} }; }
  function rotationV1074(planet = Data.getPlanet(UI.selectedPlanetId)) {
    return Engine.buildRotation({ campaignId:campaignIdV1074(), campaign:campaignV1074(), gameDate:campaignV1074()?.marketDate, planet, planets:PLANETS, equipment:EQUIPMENT, marketState:marketStateV1074() });
  }
  function stockItemV1074(item={}) { return Engine.isStock(item); }
  function tickerV1074(item={}) { return Engine.stockTicker(item) || 'â€”'; }
  function signedCreditsV1074(value) { const n=Number(value||0); return `${n>0?'+':''}${formatCredits(n)}`; }
  function changeClassV1074(value) { return Number(value||0)>0?'up':Number(value||0)<0?'down':'flat'; }
  function positionQtyV1074(position={}) { return Math.max(0,Number(position.knownQty||0))+Math.max(0,Number(position.unpricedQty||0)); }
  function portfolioV1074(user) { return normalizePlayerProfileV2(user).stockPortfolio || {positions:{},ledger:[],legacyInventoryMigrated:{}}; }
  function serverQuoteV148(itemId){return exchangeV148?.quotes?.find?.(row=>row.itemId===itemId)||null;}
  async function refreshExchangeV148(){
    if(!Sync?.config?.enabled||!App.currentUser?.id||!window.electronAPI?.getStockExchange)return;
    const result=await window.electronAPI.getStockExchange({playerId:App.currentUser.id});
    if(result?.ok){exchangeV148=result;if(result.player)Object.assign(App.currentUser,normalizePlayerProfileV2(result.player));if(tab==='stocks'&&UI.activeModuleId==='market')renderV1074();}
  }
  function technicalChartV148(itemId){
    const all=exchangeV148?.candles?.[itemId]||[],count=stockTimeframeV148==='1h'?60:stockTimeframeV148==='5m'?30:20,rows=all.slice(-count);if(rows.length<2)return'<div class="stock-chart-empty-v148">Ð¡ÐµÑ€Ð²ÐµÑ€ Ð½Ð°ÐºÐ°Ð¿Ð»Ð¸Ð²Ð°ÐµÑ‚ Ð¸ÑÑ‚Ð¾Ñ€Ð¸ÑŽ ÐºÐ¾Ñ‚Ð¸Ñ€Ð¾Ð²Ð¾Ðºâ€¦</div>';
    const values=rows.flatMap(row=>[Number(row.high),Number(row.low)]),min=Math.min(...values),max=Math.max(...values),span=Math.max(.01,max-min),w=640,h=180,p=12,step=(w-p*2)/rows.length;
    const candles=rows.map((row,index)=>{const x=p+step*(index+.5),y=value=>h-p-((Number(value)-min)/span)*(h-p*2),up=Number(row.close)>=Number(row.open);return`<g class="${up?'up':'down'}"><line x1="${x}" y1="${y(row.high)}" x2="${x}" y2="${y(row.low)}"/><rect x="${x-Math.max(1,step*.25)}" y="${Math.min(y(row.open),y(row.close))}" width="${Math.max(2,step*.5)}" height="${Math.max(1,Math.abs(y(row.open)-y(row.close)))}"/></g>`;}).join('');
    const indicator=serverQuoteV148(itemId)?.indicators||{};return`<div class="stock-ta-v148"><div class="stock-timeframes-v148">${['1m','5m','1h'].map(value=>`<button type="button" class="secondary ${stockTimeframeV148===value?'active':''}" data-stock-timeframe-v148="${value}">${value}</button>`).join('')}</div><svg viewBox="0 0 ${w} ${h}" aria-label="Ð¡Ð²ÐµÑ‡Ð½Ð¾Ð¹ Ð³Ñ€Ð°Ñ„Ð¸Ðº">${candles}</svg><div class="stock-indicators-v148"><span>SMA 5 <b>${indicator.sma5==null?'â€”':formatCredits(indicator.sma5)}</b></span><span>SMA 20 <b>${indicator.sma20==null?'â€”':formatCredits(indicator.sma20)}</b></span><span>RSI 14 <b>${indicator.rsi14==null?'â€”':Number(indicator.rsi14).toFixed(1)}</b></span></div></div>`;
  }
  function stockOrderPanelV148(item,position={}){
    const orders=(exchangeV148?.orders||[]).filter(row=>row.itemId===item.id&&row.status==='pending');
    return`<div class="stock-orders-v148"><div class="stock-order-tabs-v148"><b>Ð—Ð°ÑÐ²ÐºÐ°</b><span>Ð˜ÑÐ¿Ð¾Ð»Ð½ÑÐµÑ‚ÑÑ ÑÐµÑ€Ð²ÐµÑ€Ð¾Ð¼, Ð´Ð°Ð¶Ðµ ÐºÐ¾Ð³Ð´Ð° Ð¿Ñ€Ð¸Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ Ð·Ð°ÐºÑ€Ñ‹Ñ‚Ð¾</span></div><div class="stock-order-grid-v148"><label>ÐžÐ¿ÐµÑ€Ð°Ñ†Ð¸Ñ<select class="input" data-stock-order-intent-v148><option value="open_long">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð»Ð¾Ð½Ð³</option><option value="close_long">Ð—Ð°ÐºÑ€Ñ‹Ñ‚ÑŒ Ð»Ð¾Ð½Ð³</option><option value="open_short">ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ ÑˆÐ¾Ñ€Ñ‚</option><option value="close_short">Ð—Ð°ÐºÑ€Ñ‹Ñ‚ÑŒ ÑˆÐ¾Ñ€Ñ‚</option></select></label><label>Ð¢Ð¸Ð¿<select class="input" data-stock-order-type-v148><option value="market">Ð Ñ‹Ð½Ð¾Ñ‡Ð½Ð°Ñ</option><option value="limit">Ð›Ð¸Ð¼Ð¸Ñ‚Ð½Ð°Ñ</option><option value="stop_loss">Ð¡Ñ‚Ð¾Ð¿-Ð»Ð¾ÑÑ</option><option value="take_profit">Ð¢ÐµÐ¹Ðº-Ð¿Ñ€Ð¾Ñ„Ð¸Ñ‚</option><option value="trailing_stop">Ð¢Ñ€ÐµÐ¹Ð»Ð¸Ð½Ð³-ÑÑ‚Ð¾Ð¿</option></select></label><label>ÐšÐ¾Ð»Ð¸Ñ‡ÐµÑÑ‚Ð²Ð¾<input class="input" type="number" min="1" max="10000" value="1" data-stock-order-quantity-v148></label><label>Ð¦ÐµÐ½Ð° Ð°ÐºÑ‚Ð¸Ð²Ð°Ñ†Ð¸Ð¸<input class="input" type="number" min="0.01" step="0.01" placeholder="Ð”Ð»Ñ ÑÑ‚Ð¾Ð¿/Ñ‚ÐµÐ¹Ðº" data-stock-order-trigger-v148></label><label>Ð›Ð¸Ð¼Ð¸Ñ‚Ð½Ð°Ñ Ñ†ÐµÐ½Ð°<input class="input" type="number" min="0.01" step="0.01" placeholder="Ð”Ð»Ñ Ð»Ð¸Ð¼Ð¸Ñ‚Ð½Ð¾Ð¹" data-stock-order-limit-v148></label><label>ÐŸÐ»ÐµÑ‡Ð¾<select class="input" data-stock-order-leverage-v148><option value="1">Ã—1</option><option value="2">Ã—2</option><option value="3">Ã—3</option></select></label></div><button class="primary" type="button" data-stock-submit-v148="${esc(item.id)}">Ð ÐÐ—ÐœÐ•Ð¡Ð¢Ð˜Ð¢Ð¬ Ð—ÐÐ¯Ð’ÐšÐ£</button>${orders.length?`<div class="stock-open-orders-v148"><b>ÐÐºÑ‚Ð¸Ð²Ð½Ñ‹Ðµ Ð·Ð°ÑÐ²ÐºÐ¸</b>${orders.map(order=>`<div><span>${esc(order.type)} Â· ${esc(order.intent)} Â· ${order.quantity} ÑˆÑ‚.</span><button class="secondary" type="button" data-stock-cancel-v148="${esc(order.id)}">ÐžÑ‚Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ</button></div>`).join('')}</div>`:''}</div>`;
  }

  function stockHistoryV1074(itemId, planet, day) {
    return Engine.priceHistory({ campaignId:campaignIdV1074(), planet, planets:PLANETS, equipment:EQUIPMENT, itemId, endDay:day, days:30 });
  }
  function sparklineV1074(history=[]) {
    if (history.length<2) return '';
    const values=history.map(row=>Number(row.price||0)),min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min),w=420,h=110,p=8;
    const points=history.map((row,index)=>`${p+(index/(history.length-1))*(w-p*2)},${h-p-((Number(row.price||0)-min)/span)*(h-p*2)}`).join(' ');
    const last=values[values.length-1],first=values[0],cls=changeClassV1074(last-first);
    return `<div class="stock-chart-v1074 ${cls}"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Ð˜ÑÑ‚Ð¾Ñ€Ð¸Ñ Ñ†ÐµÐ½Ñ‹ Ð·Ð° 30 Ð¸Ð³Ñ€Ð¾Ð²Ñ‹Ñ… Ð´Ð½ÐµÐ¹"><polyline points="${points}" /></svg><div><span>${esc(formatLoreDateV1075(history[0]?.day, { includeTime:false }))}</span><b>${formatCredits(min)} â€” ${formatCredits(max)}</b><span>${esc(formatLoreDateV1075(history.at(-1)?.day, { includeTime:false }))}</span></div></div>`;
  }
  function linkedArticlesV1074(item={}) {
    const rows=(Array.isArray(item.relatedArticleIds)?item.relatedArticleIds:[]).map(id=>Data.getArticle?.(id)).filter(article=>article&&isEntityVisible(article));
    if(!rows.length)return'';
    return `<div class="stock-related-v1074"><b>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ Ð¼Ð°Ñ‚ÐµÑ€Ð¸Ð°Ð»Ñ‹</b><div>${rows.map(article=>`<a class="secondary" href="article:${esc(article.id)}" data-article-id="${esc(article.id)}">${esc(article.name||article.title||article.id)}</a>`).join('')}</div></div>`;
  }

  function portfolioMetricsV1074(user,rotation) {
    const portfolio=portfolioV1074(user),quoteMap=new Map((rotation.quotes||[]).map(q=>[q.itemId,q]));
    let marketValue=0,invested=0,unrealized=0,unpricedQty=0;
    Object.values(portfolio.positions||{}).forEach(position=>{const quote=quoteMap.get(position.itemId),qty=positionQtyV1074(position),known=Math.max(0,Number(position.knownQty||0)),basis=Math.max(0,Number(position.costBasis||0));invested+=basis;unpricedQty+=Math.max(0,Number(position.unpricedQty||0));if(quote){marketValue+=qty*quote.price;unrealized+=known*quote.price-basis;}});
    let expenses=0,income=0,realized=0;
    (portfolio.ledger||[]).forEach(row=>{if(row.type==='buy')expenses+=Number(row.total||0);if(row.type==='sell'){income+=Number(row.total||0);if(Number.isFinite(Number(row.realizedPnl)))realized+=Number(row.realizedPnl);}});
    return {portfolio,quoteMap,marketValue,invested,unrealized,unpricedQty,expenses,income,realized,totalResult:realized+unrealized};
  }

  function portfolioMarkupV1074(user,rotation) {
    const stats=portfolioMetricsV1074(user,rotation);
    const positions=Object.values(stats.portfolio.positions||{}).filter(row=>positionQtyV1074(row)>0).sort((a,b)=>String(tickerV1074(Data.getItem(a.itemId))).localeCompare(String(tickerV1074(Data.getItem(b.itemId)))));
    const holdings=positions.map(position=>{const item=Data.getItem(position.itemId)||{id:position.itemId,name:position.itemId},quote=stats.quoteMap.get(position.itemId),qty=positionQtyV1074(position),value=quote?qty*quote.price:0,avg=Number(position.knownQty||0)>0?Number(position.costBasis||0)/Number(position.knownQty):null;return `<button class="stock-holding-v1074 ${selected?.source==='portfolio'&&selected.itemId===position.itemId?'selected':''}" type="button" draggable="true" data-market-v1074 data-source="portfolio" data-item-id="${esc(position.itemId)}"><span class="stock-holding-symbol-v1074">${esc(tickerV1074(item))}</span><span><b>${esc(item.name||item.id)}</b><small>${qty} ÑˆÑ‚.${avg==null?' Â· Ñ‡Ð°ÑÑ‚ÑŒ Ð¿Ð°ÐºÐµÑ‚Ð° Ð±ÐµÐ· Ð¸ÑÑ‚Ð¾Ñ€Ð¸Ð¸ Ð¿Ð¾ÐºÑƒÐ¿ÐºÐ¸':` Â· ÑÑ€ÐµÐ´Ð½ÑÑ ${formatCredits(avg)}`}</small></span><span><b>${quote?formatCredits(value):'ÐÐµÑ‚ ÐºÐ¾Ñ‚Ð¸Ñ€Ð¾Ð²ÐºÐ¸'}</b>${quote?`<small class="${changeClassV1074(quote.change)}">${quote.change>=0?'â–²':'â–¼'} ${Math.abs(quote.changePercent).toFixed(2)}%</small>`:''}</span></button>`;}).join('');
    const ledger=(stats.portfolio.ledger||[]).slice(-10).reverse();
    return `<div class="portfolio-shell-v1074" data-market-portfolio-drop-v1074><div class="portfolio-head-v1074"><div><span class="mono accent">Ð›Ð˜Ð§ÐÐ«Ð™ Ð¡Ð§ÐÐ¢</span><b>ÐŸÐ¾Ñ€Ñ‚Ñ„ÐµÐ»ÑŒ</b></div><strong>${formatCredits(stats.marketValue)}</strong></div><div class="portfolio-metrics-v1074"><div><span>Ð¡Ñ‚Ð¾Ð¸Ð¼Ð¾ÑÑ‚ÑŒ Ð¿Ð¾Ñ€Ñ‚Ñ„ÐµÐ»Ñ</span><b>${formatCredits(stats.marketValue)}</b></div><div><span>Ð’Ð»Ð¾Ð¶ÐµÐ½Ð¾</span><b>${formatCredits(stats.invested)}</b></div><div><span>Ð”Ð¾Ñ…Ð¾Ð´ Ð¾Ñ‚ Ð¿Ñ€Ð¾Ð´Ð°Ð¶</span><b>${formatCredits(stats.income)}</b></div><div><span>Ð Ð°ÑÑ…Ð¾Ð´Ñ‹ Ð½Ð° Ð¿Ð¾ÐºÑƒÐ¿ÐºÐ¸</span><b>${formatCredits(stats.expenses)}</b></div><div class="${changeClassV1074(stats.unrealized)}"><span>ÐÐµÑ€ÐµÐ°Ð»Ð¸Ð·Ð¾Ð²Ð°Ð½Ð½Ñ‹Ð¹ Ñ€ÐµÐ·ÑƒÐ»ÑŒÑ‚Ð°Ñ‚</span><b>${signedCreditsV1074(stats.unrealized)}</b></div><div class="${changeClassV1074(stats.realized)}"><span>Ð—Ð°Ñ„Ð¸ÐºÑÐ¸Ñ€Ð¾Ð²Ð°Ð½Ð½Ñ‹Ð¹ Ñ€ÐµÐ·ÑƒÐ»ÑŒÑ‚Ð°Ñ‚</span><b>${signedCreditsV1074(stats.realized)}</b></div><div class="portfolio-result-v1074 ${changeClassV1074(stats.totalResult)}"><span>ÐžÐ±Ñ‰Ð¸Ð¹ Ñ€ÐµÐ·ÑƒÐ»ÑŒÑ‚Ð°Ñ‚</span><b>${signedCreditsV1074(stats.totalResult)}</b></div></div>${stats.unpricedQty?`<div class="portfolio-legacy-note-v1074">${stats.unpricedQty} Ð°ÐºÑ†. Ð¿ÐµÑ€ÐµÐ½ÐµÑÐµÐ½Ð¾ Ð¸Ð· ÑÑ‚Ð°Ñ€Ð¾Ð³Ð¾ Ð¸Ð½Ð²ÐµÐ½Ñ‚Ð°Ñ€Ñ Ð±ÐµÐ· Ñ†ÐµÐ½Ñ‹ Ð¿Ñ€Ð¸Ð¾Ð±Ñ€ÐµÑ‚ÐµÐ½Ð¸Ñ Ð¸ Ð½Ðµ ÑƒÑ‡Ð°ÑÑ‚Ð²ÑƒÐµÑ‚ Ð² Ñ€Ð°ÑÑ‡Ñ‘Ñ‚Ðµ Ð¿Ñ€Ð¸Ð±Ñ‹Ð»Ð¸.</div>`:''}<div class="portfolio-holdings-v1074">${holdings||'<div class="market-selection-empty-v1071">ÐŸÐ¾Ñ€Ñ‚Ñ„ÐµÐ»ÑŒ Ð¿ÑƒÑÑ‚.</div>'}</div><div class="portfolio-ledger-v1074"><div class="portfolio-ledger-head-v1074"><b>ÐŸÐ¾ÑÐ»ÐµÐ´Ð½Ð¸Ðµ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸</b><span>${ledger.length}</span></div>${ledger.map(row=>{const item=Data.getItem(row.itemId)||{id:row.itemId,name:row.itemId};return `<div class="portfolio-ledger-row-v1074"><span class="${row.type==='buy'?'down':'up'}">${row.type==='buy'?'ÐŸÐžÐšÐ£ÐŸÐšÐ':'ÐŸÐ ÐžÐ”ÐÐ–Ð'}</span><b>${esc(tickerV1074(item))}</b><span>${esc(formatLoreDateV1075(row.marketDay, { includeTime:false }))}</span><strong>${row.type==='buy'?'-':'+'}${formatCredits(row.total||0)}</strong></div>`;}).join('')||'<div class="small-note">ÐžÐ¿ÐµÑ€Ð°Ñ†Ð¸Ð¹ ÐµÑ‰Ñ‘ Ð½ÐµÑ‚.</div>'}</div></div>`;
  }

  function goodsInventoryMarkupV1074(user,offers) {
    const layout=window.GRPGInventoryV1067?.buildLayout?.(user)||{size:0,cols:1,rows:1,instances:[],overflow:[]},offerMap=new Map(offers.map(row=>[row.itemId,row]));
    const cells=Array.from({length:layout.size},(_,index)=>`<div class="market-inventory-cell-v1071" style="grid-column:${index%layout.cols+1};grid-row:${Math.floor(index/layout.cols)+1}"></div>`).join('');
    const tiles=layout.instances.filter(instance=>!stockItemV1074(instance.item)).map(instance=>{const offer=offerMap.get(instance.itemId),active=selected?.source==='inventory'&&selected.itemId===instance.itemId&&Number(selected.unitIndex)===Number(instance.unitIndex);return `<button class="market-inventory-tile-v1071 ${active?'selected':''} ${offer?'sellable':'not-sellable'}" type="button" draggable="true" data-market-v1074 data-source="inventory" data-item-id="${esc(instance.itemId)}" data-unit-index="${instance.unitIndex}" style="grid-column:${instance.pos.x+1}/span ${instance.w};grid-row:${instance.pos.y+1}/span ${instance.h}">${renderThumb(instance.item,{size:'sm',type:'item',glyph:initials(instance.item.name,'â–£')})}<span>${esc(instance.item.name||instance.itemId)}</span><small>${offer?formatCredits(offer.sellPrice):'ÐÐµÑ‚ Ð¿Ñ€Ð¸Ñ‘Ð¼Ð°'}</small></button>`;}).join('');
    return `<div class="market-inventory-grid-v1071" data-market-inventory-drop-v1074 style="--inv-cols:${layout.cols};--inv-rows:${layout.rows}">${cells}${tiles}</div>`;
  }

  function offerTileV1074(offer) {
    const item=Data.getItem(offer.itemId);if(!item)return'';const stock=stockItemV1074(item),active=selected?.source==='market'&&selected.itemId===item.id;
    if(stock)return `<button class="stock-quote-tile-v1074 ${active?'selected':''} ${changeClassV1074(offer.change)}" type="button" draggable="true" data-market-v1074 data-source="market" data-item-id="${esc(item.id)}"><span>${esc(tickerV1074(item))}</span><b>${esc(item.name||item.id)}</b><strong>${formatCredits(offer.price)}</strong><small>${offer.change>=0?'â–²':'â–¼'} ${Math.abs(offer.changePercent).toFixed(2)}% Â· ${signedCreditsV1074(offer.change)}</small></button>`;
    const size={w:Math.max(1,Number(item.inventoryWidth||1)),h:Math.max(1,Number(item.inventoryHeight||1))};
    return `<button class="market-shop-tile-v1071 ${active?'selected':''}" type="button" draggable="true" data-market-v1074 data-source="market" data-item-id="${esc(item.id)}" style="grid-column:span ${size.w};grid-row:span ${size.h}">${renderThumb(item,{size:'sm',type:'item',glyph:initials(item.name,'â–£')})}<span class="market-tile-name-v1071">${esc(item.name||item.id)}</span><span class="market-tile-meta-v1071">${size.w}Ã—${size.h}${offer.unique?' Â· Ð£Ð½Ð¸ÐºÐ°Ð»ÑŒÐ½Ñ‹Ð¹':''}</span><b class="market-tile-price-v1071">${formatCredits(offer.price)}</b></button>`;
  }

  function quantityControlsV139({user,item,offer,buy,stock,owned=0,disabled=false,capacity={ok:true}}) {
    if(!buy&&!stock)return `<button class="primary" type="button" data-market-action-v1074="sell" ${disabled?'disabled':''}>ÐŸÐ ÐžÐ”ÐÐ¢Ð¬</button>`;
    const unitPrice=Math.max(0,Number(buy?offer?.price:offer?.sellPrice)||0),credits=Math.max(0,Number(user?.credits)||0);
    const affordable=buy?(unitPrice>0?Math.floor(credits/unitPrice):10000):Math.max(0,Math.trunc(Number(owned)||0));
    const limit=Math.max(0,Math.min(10000,offer?.unique?1:affordable)),action=buy?'buy':'sell',noun=stock?'Ð°ÐºÑ†.':'ÑˆÑ‚.';
    return `<div class="market-quantity-v139" data-market-quantity-v139 data-item-id="${esc(item.id)}" data-action="${action}" data-stock="${stock?'1':'0'}" data-unit-price="${unitPrice}" data-limit="${limit}"><label>ÐšÐ¾Ð»Ð¸Ñ‡ÐµÑÑ‚Ð²Ð¾</label><div class="market-quantity-input-v139"><button class="secondary" type="button" data-market-qty-step-v139="-1" aria-label="Ð£Ð¼ÐµÐ½ÑŒÑˆÐ¸Ñ‚ÑŒ ÐºÐ¾Ð»Ð¸Ñ‡ÐµÑÑ‚Ð²Ð¾">âˆ’</button><input class="input" type="number" inputmode="numeric" min="1" max="${Math.max(1,limit)}" step="1" value="1" data-market-qty-input-v139 aria-label="ÐšÐ¾Ð»Ð¸Ñ‡ÐµÑÑ‚Ð²Ð¾ Ð´Ð»Ñ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸"><button class="secondary" type="button" data-market-qty-step-v139="1" aria-label="Ð£Ð²ÐµÐ»Ð¸Ñ‡Ð¸Ñ‚ÑŒ ÐºÐ¾Ð»Ð¸Ñ‡ÐµÑÑ‚Ð²Ð¾">+</button></div><div class="market-quantity-total-v139"><span>Ð˜Ñ‚Ð¾Ð³Ð¾</span><b data-market-qty-total-v139>${formatCredits(unitPrice)}</b></div><small class="market-quantity-error-v139 ${capacity?.ok===false?'visible':''}" data-market-qty-error-v139>${capacity?.ok===false?esc(capacity.reason):limit<1?(buy?'ÐÐµÐ´Ð¾ÑÑ‚Ð°Ñ‚Ð¾Ñ‡Ð½Ð¾ ÐºÑ€ÐµÐ´Ð¸Ñ‚Ð¾Ð².':'Ð’ Ð¿Ð¾Ñ€Ñ‚Ñ„ÐµÐ»Ðµ Ð½ÐµÑ‚ ÑÑ‚Ð¾Ð¹ Ð°ÐºÑ†Ð¸Ð¸.'):''}</small><button class="primary" type="button" data-market-action-v1074="${action}" ${disabled||limit<1||capacity?.ok===false?'disabled':''}>${buy?'ÐšÐ£ÐŸÐ˜Ð¢Ð¬':'ÐŸÐ ÐžÐ”ÐÐ¢Ð¬'} Â· 1 ${noun}</button></div>`;
  }

  function updateQuantityControlV139(control) {
    if(!control)return 1;const input=control.querySelector('[data-market-qty-input-v139]'),button=control.querySelector('[data-market-action-v1074]'),error=control.querySelector('[data-market-qty-error-v139]'),total=control.querySelector('[data-market-qty-total-v139]');
    const limit=Math.max(0,Math.trunc(Number(control.dataset.limit)||0)),unitPrice=Math.max(0,Number(control.dataset.unitPrice)||0),action=control.dataset.action==='sell'?'sell':'buy',stock=control.dataset.stock==='1';
    let quantity=Math.trunc(Number(input?.value)||1);quantity=Math.max(1,Math.min(Math.max(1,limit),quantity));if(input)input.value=String(quantity);if(total)total.textContent=formatCredits(unitPrice*quantity);
    let message=limit<1?(action==='buy'?'ÐÐµÐ´Ð¾ÑÑ‚Ð°Ñ‚Ð¾Ñ‡Ð½Ð¾ ÐºÑ€ÐµÐ´Ð¸Ñ‚Ð¾Ð².':'Ð’ Ð¿Ð¾Ñ€Ñ‚Ñ„ÐµÐ»Ðµ Ð½ÐµÑ‚ ÑÑ‚Ð¾Ð¹ Ð°ÐºÑ†Ð¸Ð¸.') : '';
    if(!message&&action==='buy'&&!stock){const check=window.GRPGInventoryV1067?.canAddItem?.(App.currentUser,String(control.dataset.itemId||''),quantity);if(check?.ok===false)message=check.reason;}
    if(error){error.textContent=message;error.classList.toggle('visible',Boolean(message));}
    if(button){button.disabled=Boolean(message)||limit<1;button.textContent=`${action==='buy'?'ÐšÐ£ÐŸÐ˜Ð¢Ð¬':'ÐŸÐ ÐžÐ”ÐÐ¢Ð¬'} Â· ${quantity} ${stock?'Ð°ÐºÑ†.':'ÑˆÑ‚.'}`;}
    return quantity;
  }

  function selectionMarkupV1074(user,planet,rotation) {
    const item=selected?.itemId?Data.getItem(selected.itemId):null;if(!item)return'<div class="market-selection-empty-v1071">Ð’Ñ‹Ð±ÐµÑ€Ð¸Ñ‚Ðµ Ñ‚Ð¾Ð²Ð°Ñ€ Ð¸Ð»Ð¸ Ð¿Ð¾Ð·Ð¸Ñ†Ð¸ÑŽ Ð¿Ð¾Ñ€Ñ‚Ñ„ÐµÐ»Ñ.</div>';
    const stock=stockItemV1074(item),buy=selected.source==='market',offer=(buy?rotation.offers:(stock?rotation.quotes:rotation.allOffers)).find(row=>row.itemId===item.id),position=portfolioV1074(user).positions?.[item.id],qty=positionQtyV1074(position),capacity=!stock&&buy?window.GRPGInventoryV1067?.canAddItem?.(user,item.id,1):{ok:true};
    const disabled=!offer||(stock&&!rotation.stockMarketEnabled)||(buy&&Number(user.credits||0)<Number(offer?.price||0))||(buy&&capacity?.ok===false)||(!buy&&stock&&qty<1);
    if(stock){const live=serverQuoteV148(item.id)||offer||{};return `<div class="stock-selection-v1074"><div class="stock-selection-head-v1074">${renderThumb(item,{size:'sm',type:'item',glyph:tickerV1074(item)})}<div><span class="stock-symbol-v1074">${esc(tickerV1074(item))}</span><h2>${esc(item.name||item.id)}</h2><p>${esc(item.desc||item.description||'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð°ÐºÑ†Ð¸Ð¸ Ð½Ðµ Ð·Ð°Ð´Ð°Ð½Ð¾.')}</p></div><div class="stock-selection-quote-v1074 ${changeClassV1074(live.change)}"><span>Ð¡ÐµÑ€Ð²ÐµÑ€Ð½Ð°Ñ Ñ†ÐµÐ½Ð° Â· ${esc(live.regime||'Ð¾Ð¶Ð¸Ð´Ð°Ð½Ð¸Ðµ')}</span><b>${formatCredits(live.price||0)}</b><small>ÐžÐ±Ð½Ð¾Ð²Ð»ÐµÐ½Ð¸Ðµ ÐºÐ°Ð¶Ð´ÑƒÑŽ ÑÐµÐºÑƒÐ½Ð´Ñƒ</small><strong>${live.change>=0?'â–²':'â–¼'} ${Math.abs(Number(live.changePercent||0)).toFixed(2)}% Â· ${signedCreditsV1074(live.change||0)}</strong></div></div>${technicalChartV148(item.id)}<div class="stock-position-facts-v1074"><span>Ð›Ð¾Ð½Ð³: <b>${qty} ÑˆÑ‚.</b></span><span>Ð¨Ð¾Ñ€Ñ‚: <b>${Number(user.stockPortfolio?.shortPositions?.[item.id]?.quantity||0)} ÑˆÑ‚.</b></span><span>Ð¡ÐµÐ±ÐµÑÑ‚Ð¾Ð¸Ð¼Ð¾ÑÑ‚ÑŒ: <b>${formatCredits(position?.costBasis||0)}</b></span></div>${linkedArticlesV1074(item)}${stockOrderPanelV148(item,position)}</div>`;}
    const mass=Number(item.mass??item.weight??1),size=`${Math.max(1,Number(item.inventoryWidth||1))}Ã—${Math.max(1,Number(item.inventoryHeight||1))}`;
    return `<div class="market-selection-card-v1071">${renderThumb(item,{size:'sm',type:'item',glyph:initials(item.name,'â–£')})}<div class="market-selection-details-v1071"><div class="market-selection-heading-v1071"><b>${esc(item.name||item.id)}</b><strong>${buy?'ÐŸÐ¾ÐºÑƒÐ¿ÐºÐ°':'ÐŸÑ€Ð¾Ð´Ð°Ð¶Ð°'}: ${formatCredits(buy?offer?.price||0:offer?.sellPrice||0)}</strong></div><div class="market-selection-facts-v1071"><span class="pill">${esc(item.rarity||'Ð¾Ð±Ñ‹Ñ‡Ð½Ñ‹Ð¹')}</span><span class="pill">Ð Ð°Ð·Ð¼ÐµÑ€ ${size}</span><span class="pill">ÐœÐ°ÑÑÐ° ${mass}</span>${window.GRPGItemFactsV141?.pills(item,{excludeLabels:['Ð¢Ð¸Ð¿','Ð ÐµÐ´ÐºÐ¾ÑÑ‚ÑŒ','Ð Ð°Ð·Ð¼ÐµÑ€','ÐœÐ°ÑÑÐ°']})||''}</div><p class="market-selection-description-v1071">${esc(item.desc||item.description||'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ð° Ð½Ðµ Ð·Ð°Ð´Ð°Ð½Ð¾.')}</p></div>${quantityControlsV139({user,item,offer,buy,stock:false,disabled,capacity})}</div>`;
  }

  function renderV1074() {
    const planet=Data.getPlanet(UI.selectedPlanetId),rawUser=App.currentUser;if(!planet||!rawUser||!isEntityVisible(planet))return;const user=normalizePlayerProfileV2(rawUser);Object.assign(rawUser,user);const access=getMarketAccessState(user,planet.id),rotation=rotationV1074(planet),offers=rotation.offers.filter(row=>stockItemV1074(Data.getItem(row.itemId))===(tab==='stocks'));
    if(selected){const item=Data.getItem(selected.itemId);if(!item||stockItemV1074(item)!==(tab==='stocks'))selected=null;}
    $('#market-title').textContent=`Ð¢ÐžÐ Ð“ÐžÐ’Ð«Ð™ Ð¢Ð•Ð ÐœÐ˜ÐÐÐ› Â· ${planet.name.toUpperCase()}`;$('#market-subtitle').textContent=`Ð˜Ð³Ñ€Ð¾Ð²Ð¾Ð¹ Ð´ÐµÐ½ÑŒ Ñ€Ñ‹Ð½ÐºÐ°: ${formatLoreDateV1075(rotation.rotationKey, { includeTime:false })}`;$('#market-balance').textContent=formatCredits(user.credits);$('#market-planet').textContent=planet.name;
    const categoryApi=window.GRPGMarketCategoriesV144;
    const categories=categoryApi.categories(offers, id=>Data.getItem(id));
    if(goodsCategoryV144!=='all'&&!categories.some(row=>row.label===goodsCategoryV144))goodsCategoryV144='all';
    const filteredOffers=tab==='goods'&&goodsCategoryV144!=='all'?offers.filter(row=>categoryApi.category(Data.getItem(row.itemId))===goodsCategoryV144):offers;
    const categoryPicker=tab==='goods'?`<div class="market-categories-v144" role="group" aria-label="ÐšÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¸ Ñ‚Ð¾Ð²Ð°Ñ€Ð¾Ð²"><button class="secondary ${goodsCategoryV144==='all'?'active':''}" type="button" aria-pressed="${goodsCategoryV144==='all'}" data-market-category-v144="all">Ð’ÑÐµ <span>${offers.length}</span></button>${categories.map(row=>`<button class="secondary ${goodsCategoryV144===row.label?'active':''}" type="button" aria-pressed="${goodsCategoryV144===row.label}" data-market-category-v144="${esc(row.label)}">${esc(row.label)} <span>${row.count}</span></button>`).join('')}</div>`:'';
    const root=$('#market-items');const stockMode=tab==='stocks',tradeAllowed=access.canBuy&&(!stockMode||rotation.stockMarketEnabled);
    root.innerHTML=`<div class="market-terminal-v1071 ${tradeAllowed?'':'locked'}"><div class="market-tabs-v1073"><button class="secondary ${!stockMode?'active':''}" type="button" data-market-tab-v1074="goods">Ð¢ÐžÐ’ÐÐ Ð«</button><button class="secondary ${stockMode?'active':''}" type="button" data-market-tab-v1074="stocks">ÐÐšÐ¦Ð˜Ð˜</button></div><div class="market-access-banner-v1071 ${tradeAllowed?'ok':'err'}">${!access.canBuy?`<b>Ð¢Ð¾Ñ€Ð³Ð¾Ð²Ð»Ñ Ð·Ð°Ð±Ð»Ð¾ÐºÐ¸Ñ€Ð¾Ð²Ð°Ð½Ð°.</b> ${esc(access.reason)}`:stockMode&&!rotation.stockMarketEnabled?'<b>ÐÐ° ÑÑ‚Ð¾Ð¹ Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ Ð½ÐµÑ‚ Ñ„Ð¾Ð½Ð´Ð¾Ð²Ð¾Ð³Ð¾ Ñ€Ñ‹Ð½ÐºÐ°.</b> ÐŸÐ¾Ñ€Ñ‚Ñ„ÐµÐ»ÑŒ Ð´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½ Ð´Ð»Ñ Ð¿Ñ€Ð¾ÑÐ¼Ð¾Ñ‚Ñ€Ð°, Ñ‚Ð¾Ñ€Ð³Ð¾Ð²Ñ‹Ðµ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸ Ð¾Ñ‚ÐºÐ»ÑŽÑ‡ÐµÐ½Ñ‹.':stockMode?`Ð“Ð»Ð¾Ð±Ð°Ð»ÑŒÐ½Ð°Ñ Ð±Ð¸Ñ€Ð¶Ð° Ð¾Ñ‚ÐºÑ€Ñ‹Ñ‚Ð°. Ð’ÑÐµ Ð°ÐºÑ†Ð¸Ð¸ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹ Ð¿Ð¾ ÐµÐ´Ð¸Ð½Ñ‹Ð¼ Ñ†ÐµÐ½Ð°Ð¼. Ð˜Ð³Ñ€Ð¾Ð²Ð¾Ð¹ Ð´ÐµÐ½ÑŒ: <b>${esc(formatLoreDateV1075(rotation.rotationKey, { includeTime:false }))}</b>.`:`Ð¢Ð¾Ñ€Ð³Ð¾Ð²Ð»Ñ Ñ‚Ð¾Ð²Ð°Ñ€Ð°Ð¼Ð¸ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ð½Ð° Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ <b>${esc(planet.name)}</b>. ÐŸÑ€Ð¾Ð´Ð°Ð¶Ð° â€” 70% Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¹ Ñ†ÐµÐ½Ñ‹.`}</div><div class="market-dual-grid-v1071 ${stockMode?'stock-layout-v1074':''}"><section class="market-pane-v1071 market-stock-pane-v1071" data-market-stock-drop-v1074><div class="market-pane-head-v1071"><div><span class="mono accent">${stockMode?'Ð‘Ð˜Ð Ð–Ð':'Ð¢ÐžÐ’ÐÐ Ð«'}</span><b>${stockMode?'Ð‘Ð¸Ñ€Ð¶ÐµÐ²Ñ‹Ðµ ÐºÐ¾Ñ‚Ð¸Ñ€Ð¾Ð²ÐºÐ¸':'Ð¢Ð¾Ð²Ð°Ñ€Ñ‹'}</b></div><span>${filteredOffers.length} Ð¿Ð¾Ð·.</span></div>${categoryPicker}<div class="${stockMode?'stock-quotes-grid-v1074':'market-shop-grid-v1071'}">${filteredOffers.map(offerTileV1074).join('')||`<div class="small-note">${stockMode?'Ð¤Ð¾Ð½Ð´Ð¾Ð²Ñ‹Ð¹ Ñ€Ñ‹Ð½Ð¾Ðº Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½.':'Ð’ Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¹ Ñ€Ð¾Ñ‚Ð°Ñ†Ð¸Ð¸ Ð½ÐµÑ‚ Ñ‚Ð¾Ð²Ð°Ñ€Ð¾Ð².'}</div>`}</div></section><section class="market-pane-v1071">${stockMode?portfolioMarkupV1074(user,rotation):`<div class="market-pane-head-v1071"><div><span class="mono accent">Ð˜ÐÐ’Ð•ÐÐ¢ÐÐ Ð¬</span><b>Ð˜Ð½Ð²ÐµÐ½Ñ‚Ð°Ñ€ÑŒ</b></div><span>${formatCredits(user.credits)}</span></div>${goodsInventoryMarkupV1074(user,rotation.allOffers)}`}</section></div>${selectionMarkupV1074(user,planet,rotation)}</div>`;
  }
  UI.renderMarket=renderV1074;

  function appendLocalLedgerV1074(portfolio,row){portfolio.ledger=Array.isArray(portfolio.ledger)?portfolio.ledger:[];portfolio.ledger.push(row);if(portfolio.ledger.length>500)portfolio.ledger=portfolio.ledger.slice(-500);}
  async function localTransactionV1074({action,itemId,quantity=1,unitIndex=-1,targetPosition=null}) {
    const amount=Math.trunc(Number(quantity));if(!Number.isSafeInteger(amount)||amount<1||amount>10000)throw new Error('Ð£ÐºÐ°Ð¶Ð¸Ñ‚Ðµ ÐºÐ¾Ð»Ð¸Ñ‡ÐµÑÑ‚Ð²Ð¾ Ð¾Ñ‚ 1 Ð´Ð¾ 10 000.');
    const user=App.currentUser,planet=Data.getPlanet(UI.selectedPlanetId),rotation=rotationV1074(planet),item=Data.getItem(itemId),stock=stockItemV1074(item),offer=(action==='sell'&&stock?rotation.quotes:(action==='sell'?rotation.allOffers:rotation.offers)).find(row=>row.itemId===itemId);if(!offer)throw new Error('ÐŸÐ¾Ð·Ð¸Ñ†Ð¸Ñ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ð´Ð»Ñ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸');if(stock&&!rotation.stockMarketEnabled)throw new Error('ÐÐ° ÑÑ‚Ð¾Ð¹ Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ Ð½ÐµÑ‚ Ñ„Ð¾Ð½Ð´Ð¾Ð²Ð¾Ð³Ð¾ Ñ€Ñ‹Ð½ÐºÐ°');if(!stock&&action==='sell'&&amount!==1)throw new Error('Ð¡Ð½Ð°Ñ€ÑÐ¶ÐµÐ½Ð¸Ðµ Ð¿Ñ€Ð¾Ð´Ð°Ñ‘Ñ‚ÑÑ Ð¿Ð¾ Ð¾Ð´Ð½Ð¾Ð¼Ñƒ ÑÐºÐ·ÐµÐ¼Ð¿Ð»ÑÑ€Ñƒ.');if(offer.unique&&amount!==1)throw new Error('Ð£Ð½Ð¸ÐºÐ°Ð»ÑŒÐ½Ñ‹Ð¹ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚ Ð¼Ð¾Ð¶Ð½Ð¾ ÐºÑƒÐ¿Ð¸Ñ‚ÑŒ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð² Ð¾Ð´Ð½Ð¾Ð¼ ÑÐºÐ·ÐµÐ¼Ð¿Ð»ÑÑ€Ðµ.');Object.assign(user,normalizePlayerProfileV2(user));const portfolio=user.stockPortfolio,unitPrice=Math.max(0,Number(action==='buy'?offer.price:offer.sellPrice)||0),total=unitPrice*amount;if(!Number.isSafeInteger(total))throw new Error('Ð¡Ñ‚Ð¾Ð¸Ð¼Ð¾ÑÑ‚ÑŒ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸ Ð½ÐµÐ´Ð¾Ð¿ÑƒÑÑ‚Ð¸Ð¼Ð°.');
    if(action==='buy'){
      if(Number(user.credits||0)<total)throw new Error('ÐÐµÐ´Ð¾ÑÑ‚Ð°Ñ‚Ð¾Ñ‡Ð½Ð¾ ÐºÑ€ÐµÐ´Ð¸Ñ‚Ð¾Ð² Ð´Ð»Ñ Ð²Ñ‹Ð±Ñ€Ð°Ð½Ð½Ð¾Ð³Ð¾ ÐºÐ¾Ð»Ð¸Ñ‡ÐµÑÑ‚Ð²Ð°.');
      if(stock){
        const pos=portfolio.positions[itemId]||{itemId,knownQty:0,unpricedQty:0,costBasis:0};pos.knownQty=Math.max(0,Number(pos.knownQty||0))+amount;pos.costBasis=Math.max(0,Number(pos.costBasis||0))+total;portfolio.positions[itemId]=pos;
        appendLocalLedgerV1074(portfolio,{id:`stock_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,type:'buy',itemId,quantity:amount,unitPrice,total,planetId:planet.id,marketDay:rotation.rotationKey,createdAt:new Date().toISOString()});
      }else{
        const check=window.GRPGInventoryV1067?.canAddItem?.(user,itemId,amount);if(check?.ok===false)throw new Error(check.reason);let entry=user.inventory.find(row=>row.itemId===itemId);if(!entry){entry={itemId,qty:0,positions:[]};user.inventory.push(entry);}const oldQty=Number(entry.qty||0);entry.qty=oldQty+amount;entry.positions=Array.isArray(entry.positions)?entry.positions:[];while(entry.positions.length<entry.qty)entry.positions.push(null);if(amount===1&&targetPosition)entry.positions[oldQty]={x:Number(targetPosition.x),y:Number(targetPosition.y)};if(offer.unique){const claims={...(App.state.marketRuntimeV1071?.claims||{})};claims[offer.claimKey]={playerId:user.id,boughtAt:new Date().toISOString()};App.state.marketRuntimeV1071={claims,updatedAt:new Date().toISOString()};}
      }
      user.credits=Number(user.credits||0)-total;
    }else if(stock){
      const pos=portfolio.positions[itemId];if(!pos||positionQtyV1074(pos)<amount)throw new Error('Ð’ Ð¿Ð¾Ñ€Ñ‚Ñ„ÐµÐ»Ðµ Ð½ÐµÐ´Ð¾ÑÑ‚Ð°Ñ‚Ð¾Ñ‡Ð½Ð¾ Ð°ÐºÑ†Ð¸Ð¹.');const knownBefore=Math.max(0,Number(pos.knownQty||0)),average=knownBefore>0?Math.max(0,Number(pos.costBasis||0))/knownBefore:0,knownSold=Math.min(knownBefore,amount),unpricedSold=amount-knownSold,costRemoved=average*knownSold;pos.knownQty=knownBefore-knownSold;pos.unpricedQty=Math.max(0,Number(pos.unpricedQty||0)-unpricedSold);pos.costBasis=Math.max(0,Number(pos.costBasis||0)-costRemoved);if(positionQtyV1074(pos)<1)delete portfolio.positions[itemId];user.credits=Number(user.credits||0)+total;appendLocalLedgerV1074(portfolio,{id:`stock_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,type:'sell',itemId,quantity:amount,unitPrice,total,costRemoved:knownSold?costRemoved:null,realizedPnl:unpricedSold?null:total-costRemoved,planetId:planet.id,marketDay:rotation.rotationKey,createdAt:new Date().toISOString()});
    }else{
      const entry=user.inventory.find(row=>row.itemId===itemId);if(!entry||Number(entry.qty||0)<1)throw new Error('Ð’ Ð¸Ð½Ð²ÐµÐ½Ñ‚Ð°Ñ€Ðµ Ð½ÐµÑ‚ ÑÑ‚Ð¾Ð³Ð¾ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ð°');const equipped=[user.equipmentSlots?.primaryWeapon||user.equipmentSlots?.weapon,user.equipmentSlots?.secondaryWeapon,user.equipmentSlots?.armor,user.equipmentSlots?.backpack,...(user.implantSlots||[])].filter(id=>id===itemId).length;if(Number(entry.qty||0)<=equipped)throw new Error('ÐÐµÐ»ÑŒÐ·Ñ Ð¿Ñ€Ð¾Ð´Ð°Ñ‚ÑŒ ÑÐºÐ¸Ð¿Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð½Ñ‹Ð¹ ÑÐºÐ·ÐµÐ¼Ð¿Ð»ÑÑ€');const removeIndex=Number.isInteger(Number(unitIndex))&&Number(unitIndex)>=equipped?Number(unitIndex):Number(entry.qty)-1;entry.qty-=1;if(Array.isArray(entry.positions))entry.positions.splice(removeIndex,1);if(entry.qty<=0)user.inventory=user.inventory.filter(row=>row!==entry);user.credits=Number(user.credits||0)+total;if(offer.unique){const claims={...(App.state.marketRuntimeV1071?.claims||{})};delete claims[offer.claimKey];App.state.marketRuntimeV1071={claims,updatedAt:new Date().toISOString()};}
    }
    await App.saveState(`${action==='buy'?'ÐšÑƒÐ¿Ð»ÐµÐ½Ð¾':'ÐŸÑ€Ð¾Ð´Ð°Ð½Ð¾'}: ${item?.name||itemId}${amount>1?` Ã— ${amount}`:''}`);return{ok:true,quantity:amount,total};
  }
  async function transactV1074(payload) {
    const user=App.currentUser,planet=Data.getPlanet(UI.selectedPlanetId),access=getMarketAccessState(user,planet?.id);
    if(!access.canBuy)throw new Error(access.reason);
    if(!Sync?.config?.enabled)return localTransactionV1074(payload);
    if(!window.electronAPI?.transactMarket)throw new Error('ÐžÐ±Ð½Ð¾Ð²Ð¸Ñ‚Ðµ Ð¿Ñ€Ð¸Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ: ÑÐµÑ€Ð²ÐµÑ€Ð½Ð°Ñ Ñ‚Ð¾Ñ€Ð³Ð¾Ð²Ð»Ñ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð°');
    const playerId=user.id;
    return PlayerSync._queueV135.run(playerId,async()=>{
      const key='grpgi.market.pending.v139:'+campaignIdV1074()+':'+playerId;
      const intent={playerId,planetId:planet.id,...payload};
      let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
      if(saved&&!window.GRPGPlayerSyncCoreV135.equal(saved.intent,intent))throw new Error('ÐŸÑ€ÐµÐ´Ñ‹Ð´ÑƒÑ‰Ð°Ñ Ñ‚Ð¾Ñ€Ð³Ð¾Ð²Ð°Ñ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ñ Ð½Ðµ Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´ÐµÐ½Ð°. ÐŸÐ¾Ð²Ñ‚Ð¾Ñ€Ð¸Ñ‚Ðµ ÐµÑ‘ Ð¿ÐµÑ€ÐµÐ´ Ð½Ð¾Ð²Ð¾Ð¹ Ð¿Ð¾ÐºÑƒÐ¿ÐºÐ¾Ð¹.');
      const request=saved?.request||{...intent,operationId:window.GRPGPlayerSyncCoreV135.operationId()};
      localStorage.setItem(key,JSON.stringify({intent,request}));
      let result;
      for(let attempt=0;attempt<3;attempt++){
        result=await window.electronAPI.transactMarket(request);
        if(result?.ok||result?.httpStatus&&result.httpStatus<500)break;
      }
      if(!result?.ok){
        if(result?.httpStatus&&result.httpStatus<500)localStorage.removeItem(key);
        throw new Error(result?.message||'Ð¡ÐµÑ€Ð²ÐµÑ€ Ð½Ðµ Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð´Ð¸Ð» Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸ÑŽ. ÐŸÐ¾Ð²Ñ‚Ð¾Ñ€Ð¸Ñ‚Ðµ ÐµÑ‘.');
      }
      localStorage.removeItem(key);
      if(result.player)PlayerSync.applyRemoteRow({
        playerId,
        player: result.player,
        version: result.playerVersion,
        updatedAt: result.playerUpdatedAt || null,
        updatedBy: result.playerUpdatedBy || null,
        clientUpdatedAt: result.playerClientUpdatedAt || null
      }, { authoritative: true, source: 'market-response' });
      await App.writeLocalMirrors();
      if(result.snapshotChanged)await Sync.checkForRemoteUpdates('market-transaction',{applyIfNewer:true,silent:true});
      selected=null;App.refreshAfterLocalWrite();
      Toast.show(payload.action==='buy'?'ÐŸÐ¾ÐºÑƒÐ¿ÐºÐ° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°':'ÐŸÑ€Ð¾Ð´Ð°Ð¶Ð° Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð°','ok');return result;
    });
  }

  document.addEventListener('click',event=>{
    const tabButton=event.target?.closest?.('[data-market-tab-v1074]');if(tabButton&&tabButton.closest('#market-items')){tab=tabButton.dataset.marketTabV1074==='stocks'?'stocks':'goods';selected=null;renderV1074();if(tab==='stocks')refreshExchangeV148();return;}
    const timeframe=event.target?.closest?.('[data-stock-timeframe-v148]');if(timeframe){stockTimeframeV148=timeframe.dataset.stockTimeframeV148;renderV1074();return;}
    const submit=event.target?.closest?.('[data-stock-submit-v148]');if(submit){const panel=submit.closest('.stock-orders-v148'),payload={playerId:App.currentUser.id,itemId:submit.dataset.stockSubmitV148,intent:panel.querySelector('[data-stock-order-intent-v148]').value,type:panel.querySelector('[data-stock-order-type-v148]').value,quantity:Number(panel.querySelector('[data-stock-order-quantity-v148]').value),triggerPrice:Number(panel.querySelector('[data-stock-order-trigger-v148]').value),limitPrice:Number(panel.querySelector('[data-stock-order-limit-v148]').value),leverage:Number(panel.querySelector('[data-stock-order-leverage-v148]').value),operationId:crypto?.randomUUID?.()||`order_${Date.now()}`};window.electronAPI.submitStockOrder(payload).then(result=>{if(!result?.ok)throw new Error(result?.message||'Ð—Ð°ÑÐ²ÐºÐ° Ð¾Ñ‚ÐºÐ»Ð¾Ð½ÐµÐ½Ð°');exchangeV148=result;Toast.show(result.status==='filled'?'Ð—Ð°ÑÐ²ÐºÐ° Ð¸ÑÐ¿Ð¾Ð»Ð½ÐµÐ½Ð°':'Ð—Ð°ÑÐ²ÐºÐ° Ñ€Ð°Ð·Ð¼ÐµÑ‰ÐµÐ½Ð°','ok');return refreshExchangeV148();}).catch(error=>Toast.show(error.message||String(error),'err'));return;}
    const cancel=event.target?.closest?.('[data-stock-cancel-v148]');if(cancel){window.electronAPI.cancelStockOrder({playerId:App.currentUser.id,orderId:cancel.dataset.stockCancelV148}).then(refreshExchangeV148).catch(error=>Toast.show(error.message||String(error),'err'));return;}
    const category=event.target?.closest?.('[data-market-category-v144]');if(category&&category.closest('#market-items')){goodsCategoryV144=category.dataset.marketCategoryV144;selected=null;renderV1074();return;}
    const tile=event.target?.closest?.('[data-market-v1074]');if(tile&&tile.closest('#market-items')){selected={source:String(tile.dataset.source||''),itemId:String(tile.dataset.itemId||''),unitIndex:Number(tile.dataset.unitIndex??-1)};renderV1074();return;}
    const step=event.target?.closest?.('[data-market-qty-step-v139]');if(step&&step.closest('#market-items')){const control=step.closest('[data-market-quantity-v139]'),input=control?.querySelector('[data-market-qty-input-v139]');if(input)input.value=String((Math.trunc(Number(input.value)||1))+(Math.trunc(Number(step.dataset.marketQtyStepV139)||0)));updateQuantityControlV139(control);return;}
    const action=event.target?.closest?.('[data-market-action-v1074]');if(action&&selected){const control=action.closest('[data-market-quantity-v139]'),quantity=control?updateQuantityControlV139(control):1;if(action.disabled)return;transactV1074({action:String(action.dataset.marketActionV1074),itemId:selected.itemId,unitIndex:selected.unitIndex,quantity}).catch(error=>Toast.show(error.message||String(error),'err'));}
  });
  document.addEventListener('input',event=>{const input=event.target?.closest?.('[data-market-qty-input-v139]');if(input&&input.closest('#market-items'))updateQuantityControlV139(input.closest('[data-market-quantity-v139]'));});
  document.addEventListener('dragstart',event=>{const node=event.target?.closest?.('[data-market-v1074]');if(!node||!node.closest('#market-items'))return;dragged={source:String(node.dataset.source||''),itemId:String(node.dataset.itemId||''),unitIndex:Number(node.dataset.unitIndex??-1)};event.dataTransfer.effectAllowed=dragged.source==='market'?'copy':'move';try{event.dataTransfer.setData('text/plain',dragged.itemId);}catch{}});
  document.addEventListener('dragend',()=>{dragged=null;});
  document.addEventListener('dragover',event=>{if(!dragged)return;const stock=stockItemV1074(Data.getItem(dragged.itemId));const valid=dragged.source==='market'?(stock?event.target?.closest?.('[data-market-portfolio-drop-v1074]'):event.target?.closest?.('[data-market-inventory-drop-v1074]')):event.target?.closest?.('[data-market-stock-drop-v1074]');if(valid){event.preventDefault();event.dataTransfer.dropEffect=dragged.source==='market'?'copy':'move';}});
  document.addEventListener('drop',event=>{if(!dragged)return;const stock=stockItemV1074(Data.getItem(dragged.itemId)),portfolioDrop=event.target?.closest?.('[data-market-portfolio-drop-v1074]'),inventoryDrop=event.target?.closest?.('[data-market-inventory-drop-v1074]'),marketDrop=event.target?.closest?.('[data-market-stock-drop-v1074]');if(dragged.source==='market'&&!((stock&&portfolioDrop)||(!stock&&inventoryDrop)))return;if(dragged.source!=='market'&&!marketDrop)return;event.preventDefault();const payload={action:dragged.source==='market'?'buy':'sell',itemId:dragged.itemId,unitIndex:dragged.unitIndex};if(inventoryDrop){const rect=inventoryDrop.getBoundingClientRect(),cols=Number(getComputedStyle(inventoryDrop).getPropertyValue('--inv-cols'))||1,cell=rect.width/cols;payload.targetPosition={x:Math.max(0,Math.min(cols-1,Math.floor((event.clientX-rect.left)/cell))),y:Math.max(0,Math.floor((event.clientY-rect.top)/cell))};}dragged=null;transactV1074(payload).catch(error=>Toast.show(error.message||String(error),'err'));});

  const renderNewsBeforeStocksV1074=UI.renderNews.bind(UI);
  UI.renderNews=function(){renderNewsBeforeStocksV1074();const root=document.getElementById('news-content');if(!root)return;root.querySelector('.org-market-ticker')?.remove();const campaign=campaignV1074(),quotes=Engine.buildStockQuotes({campaignId:campaignIdV1074(),campaign,gameDate:campaign?.marketDate,equipment:EQUIPMENT,planets:PLANETS,marketState:marketStateV1074()}).filter(quote=>quote.ticker);if(!quotes.length)return;const row=quotes.map(quote=>`<span class="org-ticker-item ${quote.change>=0?'up':'down'}"><b>${esc(quote.ticker)}</b><span>${formatCredits(quote.price)}</span><em>${quote.change>=0?'â–²':'â–¼'} ${Math.abs(quote.changePercent).toFixed(2)}%</em></span>`).join('');root.insertAdjacentHTML('afterbegin',`<div class="org-market-ticker card" aria-label="Ð ÐµÐ°Ð»ÑŒÐ½Ñ‹Ðµ ÐºÐ¾Ñ‚Ð¸Ñ€Ð¾Ð²ÐºÐ¸ Ð°ÐºÑ†Ð¸Ð¹"><div class="org-ticker-label">Ð‘Ð˜Ð Ð–Ð Â· ${esc(formatLoreDateV1075(quotes[0]?.rotationKey, { includeTime:false }))}</div><div class="org-ticker-track"><div class="org-ticker-line">${row}${row}</div></div></div>`);};
};


const PlayerSync = {
  shouldIsolateUsersFromSnapshot() {
    return Boolean(Sync?.config?.enabled && window.electronAPI?.pullPlayers);
  },
  async pullUpdates(reason = 'manual', options = {}) {
    if (!this.shouldIsolateUsersFromSnapshot()) return { ok: true, status: 'disabled', rows: [] };
    const meta = ensurePlayerSyncMeta(App.state);
    const since = options.forceFull ? null : (meta.lastPulledAt || null);
    const res = await window.electronAPI.pullPlayers({ since, limit: options.limit || 500 });
    if (!res?.ok) {
      meta.lastStatus = 'PULL_FAILED';
      meta.lastError = res?.message || 'PLAYER_PULL_FAILED';
      await Persistence.save(App.state);
      return res;
    }
    const rows = Array.isArray(res.rows) ? res.rows : [];
    if (!rows.length) {
      meta.enabled = true;
      meta.lastStatus = 'UP_TO_DATE';
      meta.lastError = null;
      meta.lastPulledAt = meta.lastPulledAt || new Date().toISOString();
      await Persistence.save(App.state);
      return { ...res, rows };
    }
    for (const row of rows) this.applyRemoteRow(row, { authoritative: true, source: `pull:${reason}` });
    meta.enabled = true;
    meta.lastStatus = 'SYNCED';
    meta.lastError = null;
    meta.lastPulledAt = rows.reduce((latest, row) => {
      const stamp = row?.updatedAt || row?.updated_at || latest || null;
      if (!latest) return stamp;
      return new Date(stamp || 0).getTime() > new Date(latest || 0).getTime() ? stamp : latest;
    }, meta.lastPulledAt || new Date().toISOString());
    await App.writeLocalMirrors();
    if (options.rerender !== false) {
      if (UiSyncGuard.isEditingCriticalForm()) UiSyncGuard.defer(`player-pull:${reason}`);
      else App.refreshAfterLocalWrite();
    }
    return { ...res, rows };
  },
  applyRemoteRow(row = {}, options = {}) {
    const playerId = String(row.playerId || row.player_id || '').trim();
    if (!playerId) return false;
    const remoteMeta = getPlayerRemoteMeta(playerId, App.state);
    const incomingVersion = Number(row.version || 0);
    const currentVersion = Number(remoteMeta.version || 0);
    if (incomingVersion < currentVersion) return false;
    const source = row.player || row.player_json || {};
    const core = window.GRPGPlayerSyncCoreV135;
    const incomingHash = core.canonical({ deleted: Boolean(row.deletedAt || row.deleted_at), player: source });
    if (incomingVersion === currentVersion && currentVersion > 0 && !options.authoritative) {
      const incomingStamp = Date.parse(row.updatedAt || row.updated_at || row.clientUpdatedAt || row.client_updated_at || '');
      const currentStamp = Date.parse(remoteMeta.updatedAt || remoteMeta.clientUpdatedAt || '');
      const samePayload = remoteMeta.contentHash
        ? remoteMeta.contentHash === incomingHash
        : core.equal(source, this._confirmedV135.get(playerId) || App.state.users[playerId] || {});
      if (samePayload) return false;
      if (!Number.isFinite(incomingStamp) || !Number.isFinite(currentStamp) || incomingStamp <= currentStamp) {
        Debug.log('PLAYER_EQUAL_VERSION_CONFLICT_IGNORED', {
          playerId,
          version: incomingVersion,
          source: options.source || 'realtime',
          incomingUpdatedAt: row.updatedAt || row.updated_at || null,
          currentUpdatedAt: remoteMeta.updatedAt || null
        });
        return false;
      }
    }
    if (row.deletedAt || row.deleted_at) {
      this._confirmedV135.delete(playerId);
      this._pendingV135.delete(playerId);
      delete App.state.users[playerId];
      delete PLAYER_TEMPLATES[playerId];
      dropPlayerRemoteMeta(playerId, App.state);
      setPlayerRemoteMeta(playerId, {
        version: Number(row.version || 0),
        updatedAt: row.updatedAt || row.updated_at || null,
        updatedBy: row.updatedBy || row.updated_by || null,
        clientUpdatedAt: row.clientUpdatedAt || row.client_updated_at || null,
        deletedAt: row.deletedAt || row.deleted_at || null,
        contentHash: incomingHash
      }, App.state);
      return true;
    }
    const local=App.state.users[playerId];
    const combatActive=UI?.activeModuleId==='combat'||document.body.classList.contains('combat-stability-v108');
    const previous=combatActive&&local&&this._confirmedV135.has(playerId)?normalizePlayerProfileV2(this.projectedPlayerV135(playerId)):null;
    const bufferedStats={};
    if(previous)for(const key of ['hpCurrent','shieldCurrent','energyCurrent']){
      if(local.stats?.[key]!==undefined&&!core.equal(local.stats[key],previous.stats?.[key]))bufferedStats[key]=local.stats[key];
    }
    const bufferedMagazines=previous&&!core.equal(local.weaponMagazines,previous.weaponMagazines)?deep(local.weaponMagazines||{}):null;
    this._confirmedV135.set(playerId,deep({...source,id:playerId}));
    const normalized = normalizePlayerProfileV2({...this.projectedPlayerV135(playerId),id:playerId});
    if(previous)normalized.stats={...normalized.stats,...bufferedStats};
    if(bufferedMagazines)normalized.weaponMagazines=bufferedMagazines;
    App.state.users[playerId] = normalized;
    PLAYER_TEMPLATES[playerId] = deep(normalized);
    setPlayerRemoteMeta(playerId, {
      version: Number(row.version || 0),
      updatedAt: row.updatedAt || row.updated_at || null,
      updatedBy: row.updatedBy || row.updated_by || null,
      clientUpdatedAt: row.clientUpdatedAt || row.client_updated_at || null,
      deletedAt: row.deletedAt || row.deleted_at || null,
      contentHash: incomingHash
    }, App.state);
    return true;
  },
  async finalizeSuccessfulWrite(row, notice, options = {}) {
    if (row) this.applyRemoteRow(row, { authoritative: true, source: 'write-response' });
    const meta = ensurePlayerSyncMeta(App.state);
    meta.enabled = true;
    meta.lastStatus = 'SYNCED';
    meta.lastError = null;
    meta.lastPushedAt = new Date().toISOString();
    if (options.writeLocalMirrors !== false) await App.writeLocalMirrors();
    if (options.rerender !== false) App.refreshAfterLocalWrite();
    if (notice) Toast.show(notice, 'ok');
    return { ok: true, row };
  },
  _confirmedV135: new Map(),
  _pendingV135: new Map(),
  _queueV135: window.GRPGPlayerSyncCoreV135.createQueue(),
  projectedPlayerV135(playerId) {
    const core=window.GRPGPlayerSyncCoreV135;
    let player=core.clone(this._confirmedV135.get(playerId) || App.state.users[playerId] || {});
    for(const entry of this._pendingV135.get(playerId) || []) {
      if(player.__syncReceiptsV135?.[entry.operationId]) continue;
      try { player=core.mergePatch(entry.basePlayer,entry.player,player); }
      catch { player={...player,...core.clone(entry.player)}; }
    }
    return player;
  },
  async pushPlayerPatch(playerId, patch = {}, options = {}) {
    const core=window.GRPGPlayerSyncCoreV135;
    if (!this.shouldIsolateUsersFromSnapshot() || !window.electronAPI?.patchPlayer) {
      await App.writeLocalMirrors();
      if(options.rerender!==false)App.refreshAfterLocalWrite();
      if(options.notice)Toast.show(options.notice,'ok');
      return {ok:true,status:'disabled'};
    }
    const basePlayer=core.clone(options.basePlayer || this.projectedPlayerV135(playerId));
    const intended=core.clean(patch);
        // Flush unsent combat resources with the next player write.
        // Otherwise rebuilding the optimistic profile would discard local damage/ammo.
        const local=App.state.users[playerId];
        if(local&&(UI?.activeModuleId==='combat'||document.body.classList.contains('combat-stability-v108'))){
          const baseline=normalizePlayerProfileV2(this.projectedPlayerV135(playerId));
          for(const key of ['hpCurrent','shieldCurrent','energyCurrent']){
            if(local.stats?.[key]!==undefined&&!core.equal(local.stats[key],baseline.stats?.[key])&&
              !Object.prototype.hasOwnProperty.call(intended.stats||{},key)){
              intended.stats={...intended.stats,[key]:local.stats[key]};
            }
          }
          if(!Object.prototype.hasOwnProperty.call(intended,'weaponMagazines')&&
            !core.equal(local.weaponMagazines,baseline.weaponMagazines))intended.weaponMagazines=deep(local.weaponMagazines||{});
        }
        const player=core.diff(basePlayer,intended);
    if(!Object.keys(player).length)return{ok:true,status:'noop'};
    const entry={playerId,basePlayer,player,operationId:core.operationId()};
    const pending=this._pendingV135.get(playerId)||[];
    pending.push(entry);this._pendingV135.set(playerId,pending);
    // Registration is synchronous, before any local disk or network wait.
    App.state.users[playerId]=normalizePlayerProfileV2(this.projectedPlayerV135(playerId));
    PLAYER_TEMPLATES[playerId]=deep(App.state.users[playerId]);
    return this._queueV135.run(playerId,async()=>{
      await App.writeLocalMirrors();
      const request={...entry,baseVersion:Number(getPlayerRemoteMeta(playerId,App.state).version||0),
        updatedBy:activeSyncActorLabel(),clientUpdatedAt:new Date().toISOString()};
      let res;
      for(let attempt=0;attempt<3;attempt++){
        try { res=await window.electronAPI[options.create?'pushPlayer':'patchPlayer'](request); }
        catch(error){res={ok:false,status:'error',message:error.message};}
        if(res?.ok || res?.status!=='error')break;
      }
      if(!res?.ok && res?.status==='error'){
        try{
          const check=await window.electronAPI.pullPlayers({playerId,limit:1});
          const row=check?.rows?.find(row=>String(row.playerId||row.player_id)===String(playerId));
          if(row?.player?.__syncReceiptsV135?.[entry.operationId])res={ok:true,row};
          else if(row)res={...res,remote:row};
        }catch{}
      }
      const rows=(this._pendingV135.get(playerId)||[]).filter(item=>item!==entry);
      if(rows.length)this._pendingV135.set(playerId,rows);else this._pendingV135.delete(playerId);
      if(res?.ok && res.row)this.applyRemoteRow(res.row,{authoritative:true,source:'write-response'});
      else if(res?.remote)this.applyRemoteRow(res.remote,{authoritative:true,source:'conflict-response'});
      else if(this._confirmedV135.has(playerId)){
        App.state.users[playerId]=normalizePlayerProfileV2(this.projectedPlayerV135(playerId));
        PLAYER_TEMPLATES[playerId]=deep(App.state.users[playerId]);
      }
      await App.writeLocalMirrors();
      if(options.rerender!==false)App.refreshAfterLocalWrite();
      if(!res?.ok){
        const meta=ensurePlayerSyncMeta(App.state);
        meta.lastStatus='PUSH_FAILED';meta.lastError=res?.message||'PLAYER_PUSH_FAILED';
        Toast.show('Ð˜Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ðµ Ð½Ðµ Ð¿Ð¾Ð´Ñ‚Ð²ÐµÑ€Ð¶Ð´ÐµÐ½Ð¾ ÑÐµÑ€Ð²ÐµÑ€Ð¾Ð¼: '+meta.lastError,'err');
        return res||{ok:false,status:'error'};
      }
      if(options.notice)Toast.show(options.notice,'ok');
      return res;
    });
  },
  async pushPlayerRecord(playerId, playerRecord, options = {}) {
    const res=await this.pushPlayerPatch(playerId,playerRecord,{...options,create:true,
      basePlayer:options.basePlayer || this._editorBaseV135?.get(playerId) || (Number(getPlayerRemoteMeta(playerId,App.state).version||0)===0?{}:this.projectedPlayerV135(playerId))});
    if(res?.ok && options.oldId && options.oldId!==playerId)
      await this.deletePlayer(options.oldId,{silentToast:true,rerender:false});
    return res;
  },
  async deletePlayer(playerId, options = {}) {
    if (!this.shouldIsolateUsersFromSnapshot() || !window.electronAPI?.deletePlayer) {
      if (options.rerender !== false) App.refreshAfterLocalWrite();
      if (!options.silentToast && options.notice) Toast.show(options.notice, 'ok');
      return { ok: true, status: 'disabled' };
    }
    const baseMeta = getPlayerRemoteMeta(playerId, App.state);
    const res = await window.electronAPI.deletePlayer({
      playerId,
      baseVersion: Number(baseMeta.version || 0),
      updatedBy: activeSyncActorLabel(),
      clientUpdatedAt: new Date().toISOString()
    });
    if (!res?.ok) {
      const meta = ensurePlayerSyncMeta(App.state);
      meta.lastStatus = 'DELETE_FAILED';
      meta.lastError = res?.message || 'PLAYER_DELETE_FAILED';
      await Persistence.save(App.state);
      return res;
    }
    return this.finalizeSuccessfulWrite(res.row || null, options.silentToast ? null : (options.notice || null), options);
  }
};

const App = {
  state: { meta: { version: 7, syncMode: 'LOCAL_FILE_CACHE', lastUpdatedAt: null, sync: defaultSyncMeta(), playerSync: defaultPlayerSyncMeta() }, users: {}, npcChats: {}, gmReports: { items: [] }, toolState: {} },
  worldLoaded: false,
  currentUserId: null,
  uiHoverLock: false,
  async init() {
    await this.loadWorldData();
    await bootstrapReadMarkersCache();
    this.state = await Persistence.load();
    pruneReadMarkersForState();
    mirrorPlayersIntoWorld(this.state);
    this.bindStaticEvents();
    await Sync.init();
    if (Sync.isConfigured()) {
      const startupSync = await Sync.checkForRemoteUpdates('startup', { applyIfNewer: true, force: true, silent: true });
      if (!startupSync?.ok || startupSync?.status === 'empty') {
        const reason = startupSync?.message || 'Ð¾Ð±Ð»Ð°Ñ‡Ð½Ñ‹Ð¹ ÑÐ½Ð¸Ð¼Ð¾Ðº Ð½Ðµ Ð¿Ð¾Ð»ÑƒÑ‡ÐµÐ½';
        $('#login-error').textContent = `ÐžÐ±Ð»Ð°ÐºÐ¾ Ð½Ðµ Ð³Ð¾Ñ‚Ð¾Ð²Ð¾: ${reason}. ÐžÑ‚Ð¿Ñ€Ð°Ð²ÐºÐ° Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ñ… Ð´Ð°Ð½Ð½Ñ‹Ñ… Ð·Ð°Ð±Ð»Ð¾ÐºÐ¸Ñ€Ð¾Ð²Ð°Ð½Ð°.`;
      }
      await PlayerSync.pullUpdates('startup-full', { forceFull: true, silent: true, rerender: false });
      this.state = await Persistence.load();
      pruneReadMarkersForState();
      mirrorPlayersIntoWorld(this.state);
    }
    this.fillLoginSelect();
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
    GalaxyMap.init();
    await this.fillPathHint();
    this.updateBootView();
    const session = Persistence.loadSession();
    if (session?.userId && this.state.users[session.userId]) {
      this.currentUserId = session.userId;
      this.finishLogin();
    }
  },
  async loadWorldData() {
    if (window.electronAPI?.loadWorldData) {
      const response = await window.electronAPI.loadWorldData();
      if (response?.ok && response.world) {
        applyWorldData(response.world);
        this.worldLoaded = true;
        this.worldDataDir = response.dataDir || null;
        try { renderGalaxyLegendOverlay(); } catch {}
        return;
      }
      console.error('WORLD_LOAD_FAILED', response);
      $('#login-error').textContent = `ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð·Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ Ñ„Ð°Ð¹Ð»Ñ‹ Ð¼Ð¸Ñ€Ð°: ${response?.message || 'unknown error'}`;
    }
    applyWorldData(window.GalacticData || {});
    this.worldLoaded = Object.keys(PLAYER_TEMPLATES).length > 0;
    if (!this.worldLoaded) {
      $('#login-error').textContent = 'Ð¤Ð°Ð¹Ð»Ñ‹ Ð¼Ð¸Ñ€Ð° Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ñ‹ Ð¸Ð»Ð¸ Ð¿ÑƒÑÑ‚Ñ‹.';
    }
  },
  fillLoginSelect() {
    const sourcePlayers = sortEntitiesForList(Object.values(this.state?.users || PLAYER_TEMPLATES));
    if (!sourcePlayers.length) {
      $('#char-select').innerHTML = '<option value=>ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÐµÐ¹</option>';
      this.renderLoginPreview();
      return;
    }
    $('#char-select').innerHTML = sourcePlayers.map(player => `<option value="${player.id}">${esc(player.displayName)}</option>`).join('');
    this.renderLoginPreview();
    this.updateBootView?.();
  },
  renderLoginPreview() {
    const root = $('#login-preview');
    if (!root) return;
    const user = this.state.users[$('#char-select')?.value] || Object.values(this.state.users)[0];
    if (!user) {
      root.innerHTML = '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÐµÐ¹.</div>';
      return;
    }
    const visibleSystemsCount = getVisibleSystems(user).length;
    root.innerHTML = `
      <div class="login-preview-inner">
        ${renderThumb(user, { size: 'lg', type: 'player', glyph: user.avatarGlyph || initials(user.displayName) })}
        <div>
          <div><b>${esc(user.displayName)}</b></div>
          <div class="subtle">${esc(user.rank || '')}</div>
          <div class="small-note" style="margin-top:6px">Ð”Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾ ÑÐ¸ÑÑ‚ÐµÐ¼: ${visibleSystemsCount} Â· ÐºÑ€ÐµÐ´Ð¸Ñ‚Ñ‹: ${formatCredits(user.credits)}</div>
        </div>
      </div>
    `;
  },
  updateBootView() {
    const bootstrap = $('#login-sync-bootstrap');
    const authPanel = $('#login-auth-panel');
    const copy = $('#login-copy');
    const loginBox = $('#login-screen .login-box');
    const title = $('#login-screen .login-box h2');
    const needsBootstrap = Sync.needsBootstrap();
    loginBox?.classList.toggle('bootstrap-mode', needsBootstrap);
    if (title) title.textContent = needsBootstrap ? 'ÐŸÐ¾Ð´ÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ðµ Ðº ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸' : 'Ð’Ñ…Ð¾Ð´ Ð² Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÑŒ';
    if (copy) {
      copy.textContent = needsBootstrap
        ? 'ÐÐ° Ð¿ÐµÑ€Ð²Ð¾Ð¼ Ð·Ð°Ð¿ÑƒÑÐºÐµ Ð½ÑƒÐ¶Ð½Ð¾ ÑƒÐºÐ°Ð·Ð°Ñ‚ÑŒ Ð¿Ð°Ñ€Ð°Ð¼ÐµÑ‚Ñ€Ñ‹ ÑÐ¸Ð½Ñ…Ñ€Ð¾Ð½Ð¸Ð·Ð°Ñ†Ð¸Ð¸ Ð´Ð»Ñ ÑÑ‚Ð¾Ð¹ ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸.'
        : '';
    }
    if (bootstrap) {
      bootstrap.classList.toggle('open', needsBootstrap);
      if (needsBootstrap) Sync.renderBootstrap();
      else bootstrap.innerHTML = '';
    }
    authPanel?.classList.toggle('hidden', needsBootstrap);
    $('#login-sync-btn') && ($('#login-sync-btn').style.display = needsBootstrap ? 'none' : 'inline-flex');
  },

  bindStaticEvents() {
    document.addEventListener('click', event => {
      AudioManager.onUserGesture();
      if (event.target.closest('button, .dock-item, .player-chip, .entity-card-btn, .market-link')) {
        AudioManager.play('uiClick', { volume: 0.65 });
      }
    }, true);
    $('#char-select').addEventListener('change', () => this.renderLoginPreview());
    $('#login-btn').addEventListener('click', () => this.login());
    $('#sync-open-btn')?.addEventListener('click', () => UI.openModule('sync'));
    $('#data-update-indicator')?.addEventListener('click', () => UI.openModule('sync'));
    $('#lite-graphics-btn')?.addEventListener('click', () => GraphicsMode.toggle());
    $('#login-sync-btn')?.addEventListener('click', () => UI.openModule('sync', { overLogin: true }));
    $('#reset-btn').addEventListener('click', async () => {
      await Persistence.resetAll();
      this.state = await Persistence.load();
      pruneReadMarkersForState();
      mirrorPlayersIntoWorld(this.state);
      this.fillLoginSelect();
      $('#pass-input').value = '';
      $('#login-error').textContent = 'Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ñ ÑÐ±Ñ€Ð¾ÑˆÐµÐ½Ñ‹.';
      Toast.show('Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ñ ÑÐ±Ñ€Ð¾ÑˆÐµÐ½Ñ‹', 'info');
    });
    $('#logout-btn').addEventListener('click', () => this.logout());
    $('#open-profile').addEventListener('click', () => UI.openModule('profile'));
    $('#open-wiki').addEventListener('click', () => UI.openModule('wiki'));
    $('#open-market-direct').addEventListener('click', () => {
      if (!UI.selectedPlanetId) {
        Toast.show('Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð²Ñ‹Ð±ÐµÑ€Ð¸ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñƒ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ', 'info');
        return;
      }
      UI.openModule('market');
    });
    $('#gm-dock-btn').addEventListener('click', () => UI.openModule('config'));
    $('#back-to-galaxy').addEventListener('click', () => GalaxyMap.exitSystem());
    $('#return-to-center')?.addEventListener('click', () => GalaxyMap.recenterGalaxy());
    $('#market-open-btn').addEventListener('click', () => UI.openModule('market'));
    $('#wiki-search-btn').addEventListener('click', () => Wiki.search($('#wiki-input').value));
    $('#wiki-input').addEventListener('keydown', event => {
      if (event.key === 'Enter') Wiki.search($('#wiki-input').value);
    });
    document.querySelectorAll('[data-wiki-section-v1060]').forEach(button => {
      button.addEventListener('click', () => Wiki.setSection(button.dataset.wikiSectionV1060));
    });
    $('#export-profile-btn').addEventListener('click', () => UI.exportProfile());
    $('#restore-data-btn')?.addEventListener('click', () => GM.restoreDefaults());
    $('#open-world-config-btn')?.addEventListener('click', () => UI.openModule('config'));
    $('#reset-world-btn')?.addEventListener('click', () => Configurator.resetWorldDefaults());
    $$('.module-close').forEach(button => button.addEventListener('click', () => UI.closeModule()));

    const hoverTargets = ['#hud-analysis', '#dock', '#mod-profile', '#mod-market', '#mod-wiki', '#mod-gm', '#mod-config', '#mod-sync', '#mod-tool'];
    hoverTargets.forEach(selector => {
      const element = $(selector);
      element?.addEventListener('mouseenter', () => { this.uiHoverLock = true; });
      element?.addEventListener('mouseleave', () => { this.uiHoverLock = false; });
    });
  },
  async fillPathHint() {
    if (window.electronAPI?.getPaths) {
      const paths = await window.electronAPI.getPaths();
      if (paths?.stateFile) $('#state-path').textContent = `Ð¡Ð¾ÑÑ‚Ð¾ÑÐ½Ð¸Ðµ: ${paths.stateFile} Â· Ð”Ð°Ð½Ð½Ñ‹Ðµ Ð¼Ð¸Ñ€Ð°: ${paths.worldDataDir || 'Ð½Ðµ Ð·Ð°Ð´Ð°Ð½Ð¾'} Â· Ð¡Ð¸Ð½Ñ…Ñ€Ð¾Ð½Ð¸Ð·Ð°Ñ†Ð¸Ñ: ${paths.syncConfigFile || 'Ð½Ðµ Ð·Ð°Ð´Ð°Ð½Ð¾'}`;
    } else {
      $('#state-path').textContent = 'Ð”Ð°Ð½Ð½Ñ‹Ðµ Ñ…Ñ€Ð°Ð½ÑÑ‚ÑÑ Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾ Ð² Ð±Ñ€Ð°ÑƒÐ·ÐµÑ€Ðµ';
    }
  },
  get currentUser() {
    return this.state.users[this.currentUserId] || null;
  },
  async login() {
    if (Sync.needsBootstrap()) {
      this.updateBootView();
      Toast.show('Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð¿Ð¾Ð´ÐºÐ»ÑŽÑ‡Ð¸ ÑÐ¸Ð½Ñ…Ñ€Ð¾Ð½Ð¸Ð·Ð°Ñ†Ð¸ÑŽ Ð´Ð»Ñ ÑÑ‚Ð¾Ð¹ ÐºÐ°Ð¼Ð¿Ð°Ð½Ð¸Ð¸', 'info');
      return;
    }
    const requestedUserId = $('#char-select').value;
    const pass = $('#pass-input').value;
    await Sync.checkForRemoteUpdates('login', { applyIfNewer: true, silent: true });
    await PlayerSync.pullUpdates('login', { silent: true, rerender: false });
    this.state = await Persistence.load();
    mirrorPlayersIntoWorld(this.state);
    this.fillLoginSelect();
    if (requestedUserId && this.state.users[requestedUserId]) {
      $('#char-select').value = requestedUserId;
      this.renderLoginPreview();
    }
    const userId = $('#char-select').value;
    const target = this.state.users[userId];
    if (!target) {
      $('#login-error').textContent = 'ÐŸÑ€Ð¾Ñ„Ð¸Ð»ÑŒ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½. ÐŸÑ€Ð¾Ð²ÐµÑ€ÑŒ Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ðµ Ñ„Ð°Ð¹Ð»Ñ‹ Ð¸ Ð¾Ð±Ð»Ð°Ñ‡Ð½ÑƒÑŽ ÑÐ¸Ð½Ñ…Ñ€Ð¾Ð½Ð¸Ð·Ð°Ñ†Ð¸ÑŽ.';
      return;
    }
    if (target.pass !== pass) {
      $('#login-error').textContent = 'ERROR: WRONG_PASS';
      return;
    }
    this.currentUserId = userId;
    Persistence.saveSession(userId);
    this.finishLogin();
  },
  finishLogin() {
    const user = this.currentUser;
    Sync.refreshChip();
    $('#login-screen').classList.remove('open');
    GalaxyMap.syncAnimationState();
    $('#dock').style.display = 'flex';
    $('#logout-btn').style.display = 'inline-flex';
    $('#gm-dock-btn').style.display = user?.role === 'gm' ? 'grid' : 'none';
    $('#status-line').textContent = `GRPGI Â· Ð²ÐµÑ€ÑÐ¸Ñ ${GRPG_APP_VERSION} Â· ${user.displayName.toUpperCase()}`;
    Sync.refreshChip();
    AudioManager.onUserGesture();
    UI.renderProfile();
    Wiki.prime();
    try { renderGalaxyLegendOverlay(); } catch {}
    requestAnimationFrame(() => { try { renderGalaxyLegendOverlay(); } catch {} });
    setTimeout(() => { try { renderGalaxyLegendOverlay(); } catch {} }, 60);
  },
  logout() {
    this.currentUserId = null;
    Persistence.clearSession();
    $('#login-screen').classList.add('open');
    GalaxyMap.syncAnimationState();
    $('#dock').style.display = 'none';
    $('#logout-btn').style.display = 'none';
    $('#gm-dock-btn').style.display = 'none';
    $('#pass-input').value = '';
    $('#login-error').textContent = '';
    this.updateBootView();
    AudioManager.stopAmbient();
    UI.closeModule();
  },
  updateClock() {
    $('#clock').textContent = new Date().toLocaleTimeString('ru-RU');
  },
  _mirrorQueueV135: window.GRPGPlayerSyncCoreV135.createQueue(),
  writeLocalMirrors() {
    return this._mirrorQueueV135.run('mirror',()=>this._writeLocalMirrorsV135());
  },
  async _writeLocalMirrorsV135() {
    mirrorPlayersIntoWorld(this.state);
    await Persistence.save(this.state);
    const worldMirrorRes = await persistPlayerWorldMirror(this.state);
    if (!worldMirrorRes?.ok) {
      Debug.error('PLAYER_WORLD_MIRROR_FAILED', { message: worldMirrorRes?.message || 'unknown error' });
    } else {
      Debug.log('PLAYER_WORLD_MIRROR_DONE', {
        users: Object.keys(this.state?.users || {}).length,
        currentUserId: this.currentUserId || null,
        credits: this.currentUser?.credits ?? null,
        inventoryCount: Array.isArray(this.currentUser?.inventory) ? this.currentUser.inventory.length : null
      });
    }
    return worldMirrorRes;
  },
  refreshAfterLocalWrite() {
    this.fillLoginSelect();
    if (this.currentUserId && !this.state.users[this.currentUserId]) {
      this.logout();
      return;
    }
    this.renderLive();
    Sync.refreshChip();
  },
  async saveState(notice = 'Ð”Ð°Ð½Ð½Ñ‹Ðµ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ñ‹') {
    Sync.markLocalDirty('LOCAL_EDIT_PENDING_SYNC');
    await this.writeLocalMirrors();
    const syncRes = await Sync.pushCurrentSnapshot('state-save', { silent: true });
    this.state = await Persistence.load();
    mirrorPlayersIntoWorld(this.state);
    this.refreshAfterLocalWrite();
    if (syncRes?.ok || syncRes?.status === 'disabled') Toast.show(`${notice}${syncRes?.cloudBackupCreated ? '. ÐŸÑ€ÐµÐ´Ñ‹Ð´ÑƒÑ‰Ð°Ñ Ð¾Ð±Ð»Ð°Ñ‡Ð½Ð°Ñ Ñ€ÐµÐ²Ð¸Ð·Ð¸Ñ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð° Ð² Ñ€ÐµÐ·ÐµÑ€Ð²Ð½ÑƒÑŽ ÐºÐ¾Ð¿Ð¸ÑŽ' : ''}`, 'ok');
    else Toast.show(`Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¾, Ð½Ð¾ Ð¾Ð±Ð»Ð°ÐºÐ¾ Ð½Ðµ Ð¾Ð±Ð½Ð¾Ð²Ð»ÐµÐ½Ð¾: ${syncRes?.message || 'unknown error'}`, 'err');
    return syncRes;
  },
  async saveStateLocalOnly(notice = 'Ð”Ð°Ð½Ð½Ñ‹Ðµ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ñ‹', options = {}) {
    await this.writeLocalMirrors();
    this.refreshAfterLocalWrite();
    if (!options.silentToast) Toast.show(notice, 'ok');
    return { ok: true };
  },
  renderLive() {
    if (this.currentUser) UI.renderProfile();
    if (UI.activeModuleId === 'market') UI.renderMarket();
    if (UI.activeModuleId === 'config') Configurator.render();
    if (UI.activeModuleId === 'sync') Sync.render();
    if (UI.activeModuleId === 'wiki' && Wiki.currentView) Wiki.showEntity(Wiki.currentView.type, Wiki.currentView.id);
    if (UI.activeModuleId === 'tool') Tooling.render();
  }
};


function playerEntities(includeGm = false) {
  return Object.values(PLAYER_TEMPLATES).filter(player => includeGm || player.role !== 'gm');
}

function entityVisibilityIds(entity) {
  return Array.isArray(entity?.visibility?.playerIds) ? entity.visibility.playerIds : [];
}

function isEntityVisible(entity, user = App.currentUser) {
  if (!entity) return false;
  if (!user || user.role === 'gm') return true;
  const allowed = entityVisibilityIds(entity);
  return allowed.length === 0 || allowed.includes(user.id);
}

function getVisibleSystems(user = App.currentUser) {
  return Data.systems.filter(system => {
    if (!isEntityVisible(system, user)) return false;
    const planetIds = Array.isArray(system.planetIds) ? system.planetIds : [];
    if (!planetIds.length) return true;
    return planetIds.some(planetId => isEntityVisible(Data.getPlanet(planetId), user));
  });
}

function getVisiblePlanetsForSystem(system, user = App.currentUser) {
  return (system?.planetIds || []).map(id => Data.getPlanet(id)).filter(planet => isEntityVisible(planet, user));
}

function getSystemLabel(system) {
  return String(system?.markerLabel || system?.name || system?.id || '').trim();
}

function getEraGalaxyPaletteV1050() {
  const root = document.documentElement;
  const era = String(root?.dataset?.eraTheme || 'technological').toLowerCase();
  const styles = getComputedStyle(root);
  const css = (name, fallback) => String(styles.getPropertyValue(name) || '').trim() || fallback;
  if (era === 'medieval') return {
    era,
    marker: css('--map-marker', '#c88a52'),
    route: css('--map-route', '#9b673c'),
    text: css('--map-text', '#f0d9ad'),
    panel: 'rgba(48,29,15,0.94)',
    orbit: 'rgba(205,150,88,0.19)'
  };
  if (era === 'industrial') return {
    era,
    marker: css('--map-marker', '#d49a3f'),
    route: css('--map-route', '#a96f2f'),
    text: css('--map-text', '#ead8b4'),
    panel: 'rgba(15,16,16,0.95)',
    orbit: 'rgba(212,154,63,0.17)'
  };
  return {
    era: 'technological',
    marker: css('--map-marker', '#60c9ff'),
    route: css('--map-route', '#328dff'),
    text: css('--map-text', '#e8f8ff'),
    panel: 'rgba(4,13,25,0.92)',
    orbit: 'rgba(96,201,255,0.16)'
  };
}

const ERA_MARKER_ASSET_FOLDERS_V1055 = Object.freeze({
  industrial: 'nowadays',
  medieval: 'bronzera',
  technological: 'scifi'
});

const ERA_MARKER_ASSET_FILES_V1055 = Object.freeze({
  blackhole: 'blackhole.png',
  diamond: 'danger.png',
  square: 'misc.png',
  credits: 'trade.png',
  node: 'node.png',
  orbital: 'star.png',
  planet: 'planet.png',
  ship: 'ship.png'
});

const ERA_MARKER_SPRITE_SCALE_V1055 = Object.freeze({
  blackhole: 5.1,
  diamond: 3.55,
  square: 3.55,
  credits: 3.75,
  node: 3.85,
  orbital: 4.0,
  planet: 3.15,
  ship: 3.65
});

const ERA_MARKER_IMAGE_CACHE_V1055 = new Map();
const ERA_MARKER_TINT_CACHE_V1055 = new Map();

function eraMarkerAssetFolderV1055(palette = getEraGalaxyPaletteV1050()) {
  const era = String(palette?.era || document.documentElement?.dataset?.eraTheme || 'technological').toLowerCase();
  return ERA_MARKER_ASSET_FOLDERS_V1055[era] || ERA_MARKER_ASSET_FOLDERS_V1055.technological;
}

function eraMarkerAssetUrlV1055(kind, palette = getEraGalaxyPaletteV1050()) {
  const file = ERA_MARKER_ASSET_FILES_V1055[String(kind || '').toLowerCase()];
  if (!file) return '';
  return `./assets/images/${eraMarkerAssetFolderV1055(palette)}/${file}`;
}

function markerSpriteEntryV1055(kind, palette = getEraGalaxyPaletteV1050()) {
  const url = eraMarkerAssetUrlV1055(kind, palette);
  if (!url || typeof Image === 'undefined') return null;
  let entry = ERA_MARKER_IMAGE_CACHE_V1055.get(url);
  if (entry) return entry;
  const image = new Image();
  entry = { url, image, status: 'loading' };
  image.decoding = 'async';
  image.onload = () => {
    entry.status = image.naturalWidth && image.naturalHeight ? 'ready' : 'error';
    ERA_MARKER_TINT_CACHE_V1055.clear();
  };
  image.onerror = () => { entry.status = 'error'; };
  image.src = url;
  ERA_MARKER_IMAGE_CACHE_V1055.set(url, entry);
  return entry;
}

function tintedMarkerSpriteV1055(entry, markerColor = '#7df9ff') {
  if (!entry || entry.status !== 'ready' || !entry.image?.naturalWidth || !entry.image?.naturalHeight) return null;
  const color = String(markerColor || '#7df9ff').trim() || '#7df9ff';
  const key = `${entry.url}|${color.toLowerCase()}`;
  const cached = ERA_MARKER_TINT_CACHE_V1055.get(key);
  if (cached) return cached;

  const side = 192;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const tctx = canvas.getContext('2d');
  if (!tctx) return null;
  const pad = 10;
  const scale = Math.min((side - pad * 2) / entry.image.naturalWidth, (side - pad * 2) / entry.image.naturalHeight);
  const w = entry.image.naturalWidth * scale;
  const h = entry.image.naturalHeight * scale;
  const x = (side - w) / 2;
  const y = (side - h) / 2;
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(entry.image, x, y, w, h);

  // Preserve the authored sprite and only bias its palette toward the marker color.
  // source-atop limits the tint to non-transparent pixels and keeps most original luminance/detail.
  tctx.save();
  tctx.globalCompositeOperation = 'source-atop';
  tctx.globalAlpha = 0.27;
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, side, side);
  tctx.restore();

  ERA_MARKER_TINT_CACHE_V1055.set(key, canvas);
  return canvas;
}

function drawEraMarkerSpriteV1055(ctx, kind, x, y, size, markerColor, palette, options = {}) {
  const entry = markerSpriteEntryV1055(kind, palette);
  const sprite = tintedMarkerSpriteV1055(entry, markerColor);
  if (!sprite) return false;
  const dpr = Number(options.dpr || 1);
  const active = Boolean(options.active);
  const scale = ERA_MARKER_SPRITE_SCALE_V1055[kind] || 3.6;
  const visual = Math.max(12 * dpr, Number(size || 8) * scale);
  const color = String(markerColor || palette?.marker || '#7df9ff').trim() || '#7df9ff';

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = active ? 1 : 0.96;
  ctx.shadowColor = color;
  ctx.shadowBlur = (active ? 14 : 8) * dpr;
  ctx.drawImage(sprite, -visual / 2, -visual / 2, visual, visual);
  ctx.shadowBlur = 0;
  if (active) {
    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 1.25 * dpr);
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.arc(0, 0, visual * 0.56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  return true;
}

function drawEraMarkerFrameV1050(ctx, size, palette, glow = 1) {
  ctx.save();
  ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.72);
  if (palette.era === 'industrial') {
    ctx.globalAlpha = 0.65 * glow;
    const r = size * 1.72;
    const tick = size * 0.48;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-r, -r + tick); ctx.lineTo(-r, -r); ctx.lineTo(-r + tick, -r);
    ctx.moveTo(r - tick, -r); ctx.lineTo(r, -r); ctx.lineTo(r, -r + tick);
    ctx.moveTo(r, r - tick); ctx.lineTo(r, r); ctx.lineTo(r - tick, r);
    ctx.moveTo(-r + tick, r); ctx.lineTo(-r, r); ctx.lineTo(-r, r - tick);
    ctx.stroke();
  } else if (palette.era === 'medieval') {
    ctx.globalAlpha = 0.42 * glow;
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-size * 1.55, -size * 1.55, size * 3.1, size * 3.1);
    ctx.rotate(-Math.PI / 4);
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.86, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.globalAlpha = 0.28 * glow;
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.15 * glow;
    ctx.beginPath();
    ctx.arc(0, 0, size * 2.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function computeGalaxyMarkerScaleMapV1058(points = [], dpr = 1) {
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
    const densityPenalty = Math.max(0, density - 1) * 0.07;
    const severePenalty = severe * 0.045;
    const scale = clamp(1 - densityPenalty - severePenalty, 0.58, 1);
    scaleMap.set(String(point.id || ''), scale);
  }
  return scaleMap;
}

function drawSystemMarker(ctx, point, size, system, options = {}) {


  const active = !!options.active;
  const style = SYSTEM_MARKER_STYLES.some(option => option.id === system?.markerStyle) ? system.markerStyle : 'orbital';
  const palette = options.palette || getEraGalaxyPaletteV1050();
  const markerColor = String(system?.color || palette.marker || '#7df9ff').trim() || '#7df9ff';
  const ringColor = hexToRgbString(markerColor, '125,249,255');
  const glow = options.glow || 1;
  const line = (options.lineWidth || 1.6) * (options.dpr || 1);

  if (drawEraMarkerSpriteV1055(ctx, style, point.sx, point.sy, size, markerColor, palette, { active, dpr: options.dpr || 1 })) return;

  ctx.save();
  ctx.translate(point.sx, point.sy);
  ctx.lineWidth = line;
  ctx.strokeStyle = `rgba(${ringColor},0.95)`;
  ctx.fillStyle = palette.panel;

  if (style === 'orbital') {
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.62, size * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.28 * glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.95, size * 1.12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(${ringColor},0.98)`;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -size * 1.4, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'node') {
    ctx.globalAlpha = 0.26 * glow;
    for (let i = 1; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, size * (0.75 + i * 0.52), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 1.35, 0); ctx.lineTo(size * 1.35, 0);
    ctx.moveTo(0, -size * 1.35); ctx.lineTo(0, size * 1.35);
    ctx.stroke();
    ctx.fillStyle = 'rgba(4,10,18,0.94)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.68, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(${ringColor},0.98)`;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -size * 1.52, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'blackhole') {
    ctx.globalAlpha = 0.24 * glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 2.2, size * 1.25, -0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.16 * glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 2.65, size * 1.55, -0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.92, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${ringColor},0.88)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.58, size * 0.62, -0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(${ringColor},0.92)`;
    ctx.beginPath();
    ctx.arc(0, -size * 1.25, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'ship') {
    ctx.fillStyle = 'rgba(4,10,18,0.94)';
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.2);
    ctx.lineTo(size * 1.06, size * 0.86);
    ctx.lineTo(0, size * 0.42);
    ctx.lineTo(-size * 1.06, size * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(${ringColor},0.98)`;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(size * 0.44, size * 0.16);
    ctx.lineTo(0, -size * 0.02);
    ctx.lineTo(-size * 0.44, size * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.34 * glow;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.78, size * 0.84, size * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (style === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.18);
    ctx.lineTo(size * 1.12, 0);
    ctx.lineTo(0, size * 1.18);
    ctx.lineTo(-size * 1.12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(${ringColor},0.98)`;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.44);
    ctx.lineTo(size * 0.44, 0);
    ctx.lineTo(0, size * 0.44);
    ctx.lineTo(-size * 0.44, 0);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'square') {
    const r = size * 0.38;
    ctx.beginPath();
    ctx.roundRect(-size * 1.1, -size * 1.1, size * 2.2, size * 2.2, r);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.22 * glow;
    ctx.beginPath();
    ctx.roundRect(-size * 1.45, -size * 1.45, size * 2.9, size * 2.9, r * 1.1);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(${ringColor},0.96)`;
    ctx.fillRect(-size * 0.28, -size * 0.28, size * 0.56, size * 0.56);
  } else if (style === 'credits') {
    ctx.beginPath();
    ctx.moveTo(-size * 0.84, -size * 0.1);
    ctx.quadraticCurveTo(-size * 0.84, size * 1.04, 0, size * 1.22);
    ctx.quadraticCurveTo(size * 0.84, size * 1.04, size * 0.84, -size * 0.1);
    ctx.quadraticCurveTo(size * 0.5, -size * 0.42, 0, -size * 0.56);
    ctx.quadraticCurveTo(-size * 0.5, -size * 0.42, -size * 0.84, -size * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.34, -size * 0.62);
    ctx.lineTo(0, -size * 1.02);
    ctx.lineTo(size * 0.34, -size * 0.62);
    ctx.stroke();
    ctx.fillStyle = `rgba(${ringColor},0.98)`;
    ctx.font = `bold ${Math.max(9, size * 1.25)}px Consolas`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('â‚¹', 0, size * 0.26);
  }

  drawEraMarkerFrameV1050(ctx, size, palette, glow);
  ctx.restore();
}

function getVisibleSystemRoutes(user = App.currentUser) {
  const visibleSystems = getVisibleSystems(user);
  const byId = new Map(visibleSystems.map(system => [system.id, system]));
  const routes = [];
  const seen = new Set();
  visibleSystems.forEach(system => {
    (system.routes || []).forEach(route => {
      const target = byId.get(route.toId);
      if (!target || target.id === system.id) return;
      const key = [system.id, target.id].sort().join('::');
      if (seen.has(key)) return;
      seen.add(key);
      routes.push({
        key,
        from: system,
        to: target,
        color: String(route.color || system.color || '#7df9ff').trim() || '#7df9ff',
        width: Math.max(1, Number(route.width || 2)),
        label: String(route.label || '').trim()
      });
    });
  });
  return routes;
}

function filterVisibleIds(ids, getter, user = App.currentUser) {
  return (ids || []).filter(id => isEntityVisible(getter.call(Data, id), user));
}

function entityByType(type, id) {
  if (type === 'system') return Data.getSystem(id);
  if (type === 'planet') return Data.getPlanet(id);
  if (type === 'npc') return Data.getNpc(id);
  if (type === 'item') return Data.getItem(id);
  if (type === 'flora') return Data.getFlora(id);
  if (type === 'fauna') return Data.getFauna(id);
  if (type === 'article') return Data.getArticle(id);
  if (type === 'player') return App.state.users[id] || PLAYER_TEMPLATES[id] || null;
  return null;
}

function titleForEntity(type, entity) {
  if (!entity) return 'ÐÐµÐ¸Ð·Ð²ÐµÑÑ‚Ð½Ð¾';
  if (type === 'player') return entity.displayName || entity.shortName || entity.id;
  if (type === 'article') return entity.name || entity.title || entity.id;
  if (type === 'system') return getSystemLabel(entity) || entity.name || entity.id;
  return entity.name || entity.displayName || entity.id;
}

function initials(value, fallback = 'â€¢') {
  const clean = String(value || '').trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/).filter(Boolean);
  const chars = parts.slice(0, 2).map(part => part[0]).join('');
  return (chars || clean.slice(0, 2)).toUpperCase();
}

function hashHue(value) {
  const str = String(value || 'entity');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = ((hash << 5) - hash) + str.charCodeAt(i);
  return Math.abs(hash) % 360;
}

function hexToRgbString(value, fallback = '125,249,255') {
  const hex = String(value || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

function renderZoomableThumb(entity, options = {}) {
  const thumbHtml = renderThumb(entity, options);
  if (!entity?.image) return thumbHtml;
  const label = options.label || titleForEntity(options.type || 'entity', entity);
  return `
    <button class="zoomable-thumb-btn" type="button" data-zoom-image="${esc(entity.image)}" data-zoom-label="${esc(label)}" aria-label="Ð£Ð²ÐµÐ»Ð¸Ñ‡Ð¸Ñ‚ÑŒ Ð¸Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ ${esc(label)}">
      ${thumbHtml}
      <span class="zoomable-thumb-hint">ï¼‹</span>
    </button>
  `;
}

function renderFocusableInputValue(value) {
  return String(value || '');
}

function restoreInputSelection(selector, text, selectionStart = null, selectionEnd = null) {
  const field = typeof selector === 'string' ? $(selector) : selector;
  if (!field) return;
  if (typeof text === 'string' && field.value !== text) field.value = text;
  try {
    field.focus({ preventScroll: true });
  } catch {
    try { field.focus(); } catch {}
  }
  if (typeof selectionStart === 'number' && typeof field.setSelectionRange === 'function') {
    const end = typeof selectionEnd === 'number' ? selectionEnd : selectionStart;
    try { field.setSelectionRange(selectionStart, end); } catch {}
  }
}

function bindTypeaheadFields(root) {
  root?.querySelectorAll('[data-typeahead-root]').forEach(wrapper => {
    if (wrapper.dataset.boundTypeahead === '1') return;
    wrapper.dataset.boundTypeahead = '1';
    const hidden = wrapper.querySelector('input[type="hidden"]');
    const input = wrapper.querySelector('[data-typeahead-input]');
    const list = wrapper.querySelector('[data-typeahead-list]');
    const options = Array.from(wrapper.querySelectorAll('[data-typeahead-option]'));
    const syncFromValue = () => {
      const current = options.find(option => String(option.dataset.value || '') === String(hidden?.value || ''));
      if (input && current && document.activeElement !== input) input.value = current.dataset.label || '';
    };
    const apply = () => {
      const query = String(input?.value || '').trim().toLowerCase();
      let visible = 0;
      options.forEach(option => {
        const hay = String(option.dataset.searchText || '').toLowerCase();
        const show = !query || hay.includes(query);
        option.hidden = !show;
        if (show) visible += 1;
      });
      if (list) list.hidden = visible === 0;
    };
    input?.addEventListener('focus', () => { if (list) list.hidden = false; apply(); });
    input?.addEventListener('input', apply);
    input?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { if (list) list.hidden = true; syncFromValue(); }
    });
    options.forEach(option => option.addEventListener('click', () => {
      if (hidden) hidden.value = option.dataset.value || '';
      if (input) input.value = option.dataset.label || '';
      if (list) list.hidden = true;
    }));
    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) {
        if (list) list.hidden = true;
        syncFromValue();
      }
    });
    syncFromValue();
    if (list) list.hidden = true;
  });
}

function bindSearchableSelects(root) {
  root?.querySelectorAll('select.select').forEach(select => {
    const options = Array.from(select.options || []).filter(option => option.value);
    if (options.length < 8 || select.dataset.boundSearchSelect === '1') return;
    select.dataset.boundSearchSelect = '1';
    const field = select.closest('.field') || select.parentElement;
    if (!field || field.querySelector('[data-select-filter]')) return;
    const input = document.createElement('input');
    input.className = 'input select-filter-input';
    input.type = 'text';
    input.placeholder = 'ÐŸÐ¾Ð¸ÑÐº Ð¿Ð¾ ÑÐ¿Ð¸ÑÐºÑƒ...';
    input.setAttribute('data-select-filter', '1');
    field.insertBefore(input, select);
    const sync = () => {
      const query = String(input.value || '').trim().toLowerCase();
      Array.from(select.options || []).forEach(option => {
        if (!option.value) return;
        const hay = `${option.textContent || ''} ${option.value || ''}`.toLowerCase();
        option.hidden = Boolean(query) && !hay.includes(query);
      });
    };
    input.addEventListener('input', sync);
    sync();
  });
}

function bindFilterableSelectors(root) {
  root?.querySelectorAll('[data-selector-panel]').forEach(panel => {
    if (panel.dataset.boundSelectorSearch === '1') return;
    panel.dataset.boundSelectorSearch = '1';
    const input = panel.querySelector('[data-selector-search]');
    const options = Array.from(panel.querySelectorAll('[data-selector-option]'));
    const empty = panel.querySelector('[data-selector-empty]');
    const apply = () => {
      const query = String(input?.value || '').trim().toLowerCase();
      let visible = 0;
      options.forEach(option => {
        const haystack = String(option.dataset.searchText || '').toLowerCase();
        const show = !query || haystack.includes(query);
        option.hidden = !show;
        if (show) visible += 1;
      });
      if (empty) empty.hidden = visible > 0;
    };
    input?.addEventListener('input', apply);
    panel.querySelector('[data-selector-check-all]')?.addEventListener('click', () => {
      panel.querySelectorAll('input[type="checkbox"]').forEach(box => { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); });
    });
    panel.querySelector('[data-selector-clear]')?.addEventListener('click', () => {
      panel.querySelectorAll('input[type="checkbox"]').forEach(box => { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); });
    });
    apply();
  });
}

const MediaPreview = {
  ensure() {
    let node = document.getElementById('media-preview-modal');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'media-preview-modal';
    node.className = 'media-preview-modal';
    node.innerHTML = `
      <div class="media-preview-backdrop" data-close-media-preview></div>
      <div class="media-preview-dialog card">
        <button class="secondary media-preview-close" type="button" data-close-media-preview>Ð—ÐÐšÐ Ð«Ð¢Ð¬</button>
        <div class="media-preview-frame">
          <img class="media-preview-image" alt="" />
        </div>
        <div class="media-preview-caption subtle"></div>
      </div>
    `;
    document.body.appendChild(node);
    node.addEventListener('click', event => {
      if (event.target.closest('[data-close-media-preview]')) this.close();
    });
    return node;
  },
  open(src, label = '') {
    if (!src) return;
    const node = this.ensure();
    const image = node.querySelector('.media-preview-image');
    const caption = node.querySelector('.media-preview-caption');
    if (image) {
      image.src = src;
      image.alt = label || 'preview';
    }
    if (caption) caption.textContent = label || '';
    node.classList.add('open');
    document.body.classList.add('media-preview-open');
  },
  close() {
    const node = document.getElementById('media-preview-modal');
    if (!node) return;
    node.classList.remove('open');
    document.body.classList.remove('media-preview-open');
  }
};

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') MediaPreview.close();
});

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-zoom-image]');
  if (!trigger) return;
  event.preventDefault();
  event.stopPropagation();
  MediaPreview.open(trigger.dataset.zoomImage, trigger.dataset.zoomLabel || '');
});

function isMapInteractionBlocked(target = null) {
  if (document.querySelector('.modal.open')) return true;
  if (UI?.activeModuleId && UI?.activeElement?.classList?.contains('open')) return true;
  if (!target) return false;
  return Boolean(target.closest('.title-bar, #dock, #hud-analysis, #back-to-galaxy, #return-to-center, .fs-module, .fs-header, .modal, #toast, .media-preview-modal'));
}

function renderThumb(entity, options = {}) {
  const size = options.size || 'sm';
  const label = options.label || titleForEntity(options.type || 'entity', entity);
  const glyph = entity?.avatarGlyph || options.glyph || initials(label, 'âœ¦');
  if (entity?.image) {
    return `<div class="entity-thumb ${size}"><img src="${esc(entity.image)}" alt="${esc(label)}" loading="lazy" /></div>`;
  }
  const hue = hashHue(entity?.id || label);
  const hue2 = (hue + 45) % 360;
  return `<div class="entity-thumb ${size} fallback" style="--thumb-a:hsla(${hue},80%,58%,0.82);--thumb-b:hsla(${hue2},88%,70%,0.18)"><span>${esc(glyph)}</span></div>`;
}

function renderEntityButton(type, entity, opts = {}) {
  if (!entity) return '';
  const compact = opts.compact ? ' compact' : '';
  const subtitle = opts.subtitle ? `<div class="entity-card-sub">${esc(opts.subtitle)}</div>` : '';
  const qty = opts.qty ? `<span class="entity-card-qty">Ã—${opts.qty}</span>` : '';
  const extra = entityExtraDataset(type, entity, opts);
  return `
    <button class="entity-card-btn${compact}" data-entity="${esc(type)}" data-id="${esc(entity.id)}" ${extra} type="button">
      ${renderThumb(entity, { size: opts.thumbSize || 'sm', type, glyph: opts.glyph })}
      <span class="entity-card-meta">
        <span class="entity-card-title">${esc(titleForEntity(type, entity))}</span>
        ${subtitle}
      </span>
      ${qty}
    </button>
  `;
}

function renderTagList(buttons, emptyText = 'ÐÐµÑ‚ Ð´Ð°Ð½Ð½Ñ‹Ñ…') {
  const html = buttons.filter(Boolean).join('');
  return html || `<div class="small-note">${esc(emptyText)}</div>`;
}

function renderRelatedArticlesEditor(ids = []) {
  return renderCheckboxSelector('relatedArticleIds', Object.values(ARTICLES), ids || [], 'article', 'ÐÐµÑ‚ ÑÑ‚Ð°Ñ‚ÐµÐ¹');
}

function renderRelatedArticlesSection(ids = [], title = 'Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸') {
  const articles = filterVisibleIds(ids, Data.getArticle).map(id => Data.getArticle(id)).filter(Boolean);
  if (!articles.length) return '';
  return `
    <div class="section-title" style="margin-top:18px">${esc(title)}</div>
    <div class="result-stack">${articles.map(article => renderEntityButton('article', article, { subtitle: article.category || article.summary || 'Ð¡Ñ‚Ð°Ñ‚ÑŒÑ Ð°Ñ€Ñ…Ð¸Ð²Ð°', thumbSize: 'sm' })).join('')}</div>
  `;
}

function getCheckedValues(form, name) {
  return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(node => node.value);
}

function readInventoryRows(formEl) {
  return Array.from(formEl.querySelectorAll('.inventory-row')).map(row => ({
    itemId: row.querySelector('input[type="hidden"][data-role="item"]')?.value || row.querySelector('[data-role="item"]')?.value || '',
    qty: Math.max(1, Number(row.querySelector('[data-role="qty"]')?.value || 1))
  })).filter(entry => entry.itemId);
}

function readMarketRows(formEl) {
  return Array.from(formEl.querySelectorAll('.market-row-editor')).map(row => ({
    itemId: row.querySelector('input[type="hidden"][data-role="item"]')?.value || row.querySelector('[data-role="item"]')?.value || '',
    price: Math.max(0, Number(row.querySelector('[data-role="price"]')?.value || 0))
  })).filter(entry => entry.itemId);
}

function readSystemRouteRows(formEl) {
  return Array.from(formEl.querySelectorAll('.route-row-editor')).map(row => ({
    toId: String(row.querySelector('input[type="hidden"][data-role="to"]')?.value || row.querySelector('[data-role="to"]')?.value || '').trim(),
    color: String(row.querySelector('[data-role="color"]')?.value || '#7df9ff').trim() || '#7df9ff',
    width: Math.max(1, Number(row.querySelector('[data-role="width"]')?.value || 2)),
    label: String(row.querySelector('[data-role="label"]')?.value || '').trim()
  })).filter(entry => entry.toId);
}

function planetForNpc(npcId) {
  return Object.values(PLANETS).find(planet => (planet.npcIds || []).includes(npcId)) || null;
}

function renderCheckboxSelector(name, items, selectedIds = [], type, emptyText = 'ÐÐµÑ‚ ÑÐ»ÐµÐ¼ÐµÐ½Ñ‚Ð¾Ð²') {
  if (!items.length) return `<div class="small-note">${esc(emptyText)}</div>`;
  return `
    <div class="selector-panel" data-selector-panel>
      <div class="selector-actions-v58">
        <button class="ghost" type="button" data-selector-check-all>Ð’Ð¡Ð•Ðœ</button>
        <button class="ghost" type="button" data-selector-clear>Ð¡ÐÐ¯Ð¢Ð¬</button>
      </div>
      <div class="field selector-search-field">
        <input class="input selector-search-input" type="text" placeholder="ÐŸÐ¾Ð¸ÑÐº Ð¿Ð¾ ÑÐ¿Ð¸ÑÐºÑƒ..." data-selector-search />
      </div>
      <div class="selector-grid selector-grid-scroll" data-selector-grid>
        ${items.map(item => {
          const subtitle = item.role || item.type || item.location || item.category || item.habitat || item.id;
          const haystack = [titleForEntity(type, item), subtitle, item.id].filter(Boolean).join(' ').toLowerCase();
          return `
            <label class="selector-option" data-selector-option data-search-text="${esc(haystack)}">
              <input type="checkbox" name="${name}" value="${esc(item.id)}" ${selectedIds.includes(item.id) ? 'checked' : ''} />
              ${renderThumb(item, { size: 'xs', type })}
              <span>
                <b>${esc(titleForEntity(type, item))}</b>
                <span class="subtle selector-sub">${esc(subtitle)}</span>
              </span>
            </label>
          `;
        }).join('')}
      </div>
      <div class="small-note selector-empty-note" data-selector-empty hidden>ÐÐ¸Ñ‡ÐµÐ³Ð¾ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾</div>
    </div>
  `;
}

function renderInventoryRows(items) {
  const rows = Array.isArray(items) && items.length ? items : [{ itemId: '', qty: 1 }];
  return rows.map(entry => `
    <div class="inventory-row dynamic-row">
      <select class="select" data-role="item">
        <option value="">Ð’Ñ‹Ð±ÐµÑ€Ð¸ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚</option>
        ${EQUIPMENT_LIST.map(item => `<option value="${item.id}" ${item.id === entry.itemId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}
      </select>
      <input class="input" data-role="qty" type="number" min="1" value="${Math.max(1, Number(entry.qty || 1))}" />
      <button type="button" class="ghost remove-row-btn">REMOVE</button>
    </div>
  `).join('');
}

function renderMarketRows(items) {
  const rows = Array.isArray(items) && items.length ? items : [{ itemId: '', price: 0 }];
  return rows.map((entry, index) => `
    <div class="market-row-editor dynamic-row">
      ${renderTypeaheadField({
        role: 'item',
        value: entry.itemId || '',
        placeholder: 'Ð’Ñ‹Ð±ÐµÑ€Ð¸ Ñ‚Ð¾Ð²Ð°Ñ€',
        options: EQUIPMENT_LIST.map(item => ({ value: item.id, label: item.name || item.id, hint: item.id })),
        key: `market-${index}-${entry.itemId || 'new'}`
      })}
      <input class="input" data-role="price" type="number" min="0" value="${Math.max(0, Number(entry.price || 0))}" />
      <button type="button" class="ghost remove-row-btn">REMOVE</button>
    </div>
  `).join('');
}

function renderSystemRouteRows(items, ownerId = '') {
  const rows = Array.isArray(items) && items.length ? items : [{ toId: '', color: '#7df9ff', width: 2, label: '' }];
  const options = SYSTEMS.filter(system => !ownerId || system.id !== ownerId).map(system => ({
    value: system.id,
    label: getSystemLabel(system),
    hint: system.name && system.name !== getSystemLabel(system) ? `${system.name} Â· ${system.id}` : system.id
  }));
  return rows.map((entry, index) => `
    <div class="route-row-editor dynamic-row">
      ${renderTypeaheadField({
        role: 'to',
        value: entry.toId || '',
        placeholder: 'ÐšÑƒÐ´Ð° Ð²ÐµÐ´Ñ‘Ñ‚ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚',
        options,
        key: `route-${ownerId || 'world'}-${index}-${entry.toId || 'new'}`
      })}
      <input class="input" data-role="label" value="${esc(entry.label || '')}" placeholder="ÐœÐµÑ‚ÐºÐ° Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚Ð° (Ð½ÐµÐ¾Ð±ÑÐ·Ð°Ñ‚ÐµÐ»ÑŒÐ½Ð¾)" />
      <input class="input" data-role="color" value="${esc(entry.color || '#7df9ff')}" placeholder="#7df9ff" />
      <input class="input" data-role="width" type="number" min="1" max="10" step="0.5" value="${Math.max(1, Number(entry.width || 2))}" />
      <button type="button" class="ghost remove-row-btn">REMOVE</button>
    </div>
  `).join('');
}

function renderTypeaheadField({ role, value = '', placeholder = 'Ð’Ñ‹Ð±Ñ€Ð°Ñ‚ÑŒ...', options = [], key = 'typeahead' }) {
  const current = options.find(option => String(option.value) === String(value)) || null;
  return `
    <div class="typeahead-field" data-typeahead-root data-role="${esc(role || '')}">
      <input type="hidden" data-role="${esc(role || '')}" value="${esc(value || '')}" />
      <input class="input typeahead-input" type="text" value="${esc(current?.label || value || '')}" placeholder="${esc(placeholder)}" data-typeahead-input autocomplete="off" />
      <div class="typeahead-list" data-typeahead-list hidden>
        ${options.map(option => `
          <button type="button" class="typeahead-option" data-typeahead-option data-value="${esc(option.value)}" data-label="${esc(option.label)}" data-search-text="${esc(`${option.label || ''} ${option.hint || ''} ${option.value || ''}`.toLowerCase())}">
            <span>${esc(option.label)}</span>
            ${option.hint ? `<span class="subtle">${esc(option.hint)}</span>` : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderInventoryRowsEditor(items) {
  return `<div id="inventory-rows" class="dynamic-list" data-kind="inventory">${renderInventoryRows(items)}</div><button id="add-inventory-row" class="secondary" type="button">ADD_INVENTORY_ITEM</button>`;
}

function renderSystemRoutesEditor(items, ownerId = '') {
  return `<div id="route-rows" class="dynamic-list" data-kind="routes" data-owner-id="${esc(ownerId)}">${renderSystemRouteRows(items, ownerId)}</div><button id="add-route-row" class="secondary" type="button">ADD_ROUTE</button>`;
}

function imageFieldMarkup(entity, title = 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ') {
  return `
    <div class="field media-field">
      <label>${esc(title)}</label>
      <input type="hidden" name="imageData" value="${esc(entity?.image || '')}" />
      <div class="media-field-box">
        <div class="media-preview" data-preview-box>
          ${renderThumb(entity, { size: 'xl', type: 'entity', glyph: entity?.avatarGlyph || 'âœ¦' })}
        </div>
        <div class="media-actions">
          <input class="input image-file-input" type="file" accept="image/*,.dds,image/vnd.ms-dds,application/octet-stream" />
          <button type="button" class="secondary clear-image-btn">REMOVE_IMAGE</button>
        </div>
      </div>
    </div>
  `;
}

function waitForPendingImageTasks(root) {
  const tasks = Array.isArray(root?._imagePendingTasks) ? root._imagePendingTasks.filter(Boolean) : [];
  if (!tasks.length) return Promise.resolve();
  return Promise.allSettled(tasks);
}

function isDdsFileV51(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return name.endsWith('.dds') || type.includes('dds') || type === 'image/vnd.ms-dds';
}

function readFileAsDataUrlV51(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBufferV51(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.readAsArrayBuffer(file);
  });
}

function fourCcFromViewV51(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function rgb565ToRgbaV51(value, alpha = 255) {
  return [
    Math.round(((value >> 11) & 31) * 255 / 31),
    Math.round(((value >> 5) & 63) * 255 / 63),
    Math.round((value & 31) * 255 / 31),
    alpha
  ];
}

function buildDxtColorPaletteV51(c0, c1, forceFourColor = false) {
  const a = rgb565ToRgbaV51(c0, 255);
  const b = rgb565ToRgbaV51(c1, 255);
  const out = [a, b];
  if (forceFourColor || c0 > c1) {
    out[2] = [
      Math.round((2 * a[0] + b[0]) / 3),
      Math.round((2 * a[1] + b[1]) / 3),
      Math.round((2 * a[2] + b[2]) / 3),
      255
    ];
    out[3] = [
      Math.round((a[0] + 2 * b[0]) / 3),
      Math.round((a[1] + 2 * b[1]) / 3),
      Math.round((a[2] + 2 * b[2]) / 3),
      255
    ];
  } else {
    out[2] = [
      Math.round((a[0] + b[0]) / 2),
      Math.round((a[1] + b[1]) / 2),
      Math.round((a[2] + b[2]) / 2),
      255
    ];
    out[3] = [0, 0, 0, 0];
  }
  return out;
}

function writePixelV51(target, width, height, x, y, rgba) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * 4;
  target[index] = rgba[0];
  target[index + 1] = rgba[1];
  target[index + 2] = rgba[2];
  target[index + 3] = rgba[3];
}

function decodeDxtColorBlockV51(bytes, offset, target, width, height, blockX, blockY, alphaValues = null, forceFourColor = false) {
  const c0 = bytes[offset] | (bytes[offset + 1] << 8);
  const c1 = bytes[offset + 2] | (bytes[offset + 3] << 8);
  const palette = buildDxtColorPaletteV51(c0, c1, forceFourColor);
  const code = (bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24)) >>> 0;
  for (let py = 0; py < 4; py += 1) {
    for (let px = 0; px < 4; px += 1) {
      const pixelIndex = py * 4 + px;
      const colorIndex = (code >>> (2 * pixelIndex)) & 3;
      const color = palette[colorIndex].slice();
      if (alphaValues) color[3] = alphaValues[pixelIndex];
      writePixelV51(target, width, height, blockX * 4 + px, blockY * 4 + py, color);
    }
  }
}

function decodeDxt1V51(bytes, offset, width, height) {
  const target = new Uint8Array(width * height * 4);
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  let cursor = offset;
  for (let by = 0; by < blocksHigh; by += 1) {
    for (let bx = 0; bx < blocksWide; bx += 1) {
      decodeDxtColorBlockV51(bytes, cursor, target, width, height, bx, by, null, false);
      cursor += 8;
    }
  }
  return target;
}

function decodeDxt3V51(bytes, offset, width, height) {
  const target = new Uint8Array(width * height * 4);
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  let cursor = offset;
  for (let by = 0; by < blocksHigh; by += 1) {
    for (let bx = 0; bx < blocksWide; bx += 1) {
      const alpha = new Array(16);
      for (let i = 0; i < 16; i += 1) {
        const byte = bytes[cursor + Math.floor(i / 2)];
        const nibble = (i % 2 === 0) ? (byte & 0x0f) : (byte >> 4);
        alpha[i] = nibble * 17;
      }
      decodeDxtColorBlockV51(bytes, cursor + 8, target, width, height, bx, by, alpha, true);
      cursor += 16;
    }
  }
  return target;
}

function decodeDxt5AlphaPaletteV51(a0, a1) {
  const palette = [a0, a1];
  if (a0 > a1) {
    palette[2] = Math.round((6 * a0 + a1) / 7);
    palette[3] = Math.round((5 * a0 + 2 * a1) / 7);
    palette[4] = Math.round((4 * a0 + 3 * a1) / 7);
    palette[5] = Math.round((3 * a0 + 4 * a1) / 7);
    palette[6] = Math.round((2 * a0 + 5 * a1) / 7);
    palette[7] = Math.round((a0 + 6 * a1) / 7);
  } else {
    palette[2] = Math.round((4 * a0 + a1) / 5);
    palette[3] = Math.round((3 * a0 + 2 * a1) / 5);
    palette[4] = Math.round((2 * a0 + 3 * a1) / 5);
    palette[5] = Math.round((a0 + 4 * a1) / 5);
    palette[6] = 0;
    palette[7] = 255;
  }
  return palette;
}

function decodeDxt5V51(bytes, offset, width, height) {
  const target = new Uint8Array(width * height * 4);
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  let cursor = offset;
  for (let by = 0; by < blocksHigh; by += 1) {
    for (let bx = 0; bx < blocksWide; bx += 1) {
      const a0 = bytes[cursor];
      const a1 = bytes[cursor + 1];
      const alphaPalette = decodeDxt5AlphaPaletteV51(a0, a1);
      let alphaBits = 0n;
      for (let i = 0; i < 6; i += 1) alphaBits |= BigInt(bytes[cursor + 2 + i]) << BigInt(8 * i);
      const alpha = new Array(16);
      for (let i = 0; i < 16; i += 1) {
        const alphaIndex = Number((alphaBits >> BigInt(3 * i)) & 7n);
        alpha[i] = alphaPalette[alphaIndex];
      }
      decodeDxtColorBlockV51(bytes, cursor + 8, target, width, height, bx, by, alpha, true);
      cursor += 16;
    }
  }
  return target;
}

function countMaskShiftV51(mask) {
  let shift = 0;
  let value = mask >>> 0;
  if (!value) return 0;
  while ((value & 1) === 0) {
    shift += 1;
    value >>>= 1;
  }
  return shift;
}

function countMaskBitsV51(mask) {
  let bits = 0;
  let value = mask >>> 0;
  while (value) {
    bits += value & 1;
    value >>>= 1;
  }
  return bits;
}

function extractMaskedByteV51(pixel, mask, fallback = 0) {
  mask >>>= 0;
  if (!mask) return fallback;
  const shift = countMaskShiftV51(mask);
  const bits = countMaskBitsV51(mask);
  const max = (1 << bits) - 1;
  const value = (pixel & mask) >>> shift;
  return Math.round(value * 255 / max);
}

function decodeUncompressedDdsV51(bytes, offset, width, height, bitCount, masks, pitch = 0) {
  const bytesPerPixel = Math.ceil(bitCount / 8);
  const rowPitch = pitch > 0 ? pitch : width * bytesPerPixel;
  const target = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = offset + y * rowPitch;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + x * bytesPerPixel;
      let pixel = 0;
      for (let i = 0; i < bytesPerPixel; i += 1) pixel |= (bytes[pixelOffset + i] || 0) << (8 * i);
      const rgba = [
        extractMaskedByteV51(pixel, masks.r, bytes[pixelOffset] || 0),
        extractMaskedByteV51(pixel, masks.g, bytes[pixelOffset + 1] || 0),
        extractMaskedByteV51(pixel, masks.b, bytes[pixelOffset + 2] || 0),
        masks.a ? extractMaskedByteV51(pixel, masks.a, 255) : 255
      ];
      writePixelV51(target, width, height, x, y, rgba);
    }
  }
  return target;
}

function pngDataUrlFromRgbaV51(width, height, rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function convertDdsArrayBufferToPngDataUrlV51(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (buffer.byteLength < 128 || fourCcFromViewV51(view, 0) !== 'DDS ') {
    throw new Error('Ð¤Ð°Ð¹Ð» Ð½Ðµ Ð¿Ð¾Ñ…Ð¾Ð¶ Ð½Ð° DDS');
  }
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const pitchOrLinearSize = view.getUint32(20, true);
  const pfFlags = view.getUint32(80, true);
  const fourCC = fourCcFromViewV51(view, 84);
  const bitCount = view.getUint32(88, true);
  const masks = {
    r: view.getUint32(92, true),
    g: view.getUint32(96, true),
    b: view.getUint32(100, true),
    a: view.getUint32(104, true)
  };
  if (!width || !height) throw new Error('DDS ÑÐ¾Ð´ÐµÑ€Ð¶Ð¸Ñ‚ Ð½ÐµÐºÐ¾Ñ€Ñ€ÐµÐºÑ‚Ð½Ñ‹Ð¹ Ñ€Ð°Ð·Ð¼ÐµÑ€');

  let format = fourCC;
  let dataOffset = 128;
  if (fourCC === 'DX10') {
    if (buffer.byteLength < 148) throw new Error('ÐÐµÐºÐ¾Ñ€Ñ€ÐµÐºÑ‚Ð½Ñ‹Ð¹ DDS DX10');
    const dxgiFormat = view.getUint32(128, true);
    dataOffset = 148;
    if (dxgiFormat === 71 || dxgiFormat === 72) format = 'DXT1';
    else if (dxgiFormat === 74 || dxgiFormat === 75) format = 'DXT3';
    else if (dxgiFormat === 77 || dxgiFormat === 78) format = 'DXT5';
    else if (dxgiFormat === 28) format = 'RGBA32';
    else if (dxgiFormat === 87) format = 'BGRA32';
    else throw new Error(`DDS DX10 format ${dxgiFormat} Ð¿Ð¾ÐºÐ° Ð½Ðµ Ð¿Ð¾Ð´Ð´ÐµÑ€Ð¶Ð¸Ð²Ð°ÐµÑ‚ÑÑ`);
  }

  let rgba = null;
  if (format === 'DXT1') rgba = decodeDxt1V51(bytes, dataOffset, width, height);
  else if (format === 'DXT3') rgba = decodeDxt3V51(bytes, dataOffset, width, height);
  else if (format === 'DXT5') rgba = decodeDxt5V51(bytes, dataOffset, width, height);
  else if (format === 'RGBA32') rgba = decodeUncompressedDdsV51(bytes, dataOffset, width, height, 32, { r: 0x000000ff, g: 0x0000ff00, b: 0x00ff0000, a: 0xff000000 }, width * 4);
  else if (format === 'BGRA32') rgba = decodeUncompressedDdsV51(bytes, dataOffset, width, height, 32, { r: 0x00ff0000, g: 0x0000ff00, b: 0x000000ff, a: 0xff000000 }, width * 4);
  else if ((pfFlags & 0x40) && (bitCount === 32 || bitCount === 24 || bitCount === 16)) rgba = decodeUncompressedDdsV51(bytes, dataOffset, width, height, bitCount, masks, pitchOrLinearSize);
  else throw new Error(`DDS Ñ„Ð¾Ñ€Ð¼Ð°Ñ‚ ${format || 'Ð±ÐµÐ· FourCC'} Ð¿Ð¾ÐºÐ° Ð½Ðµ Ð¿Ð¾Ð´Ð´ÐµÑ€Ð¶Ð¸Ð²Ð°ÐµÑ‚ÑÑ`);

  return pngDataUrlFromRgbaV51(width, height, rgba);
}

async function readImageFileAsRenderableDataUrlV51(file) {
  if (!isDdsFileV51(file)) return readFileAsDataUrlV51(file);
  const buffer = await readFileAsArrayBufferV51(file);
  return convertDdsArrayBufferToPngDataUrlV51(buffer);
}

function bindImageInputs(root) {
  if (!Array.isArray(root._imagePendingTasks)) root._imagePendingTasks = [];
  root.querySelectorAll('.media-field').forEach(field => {
    const fileInput = field.querySelector('.image-file-input');
    const hidden = field.querySelector('input[name="imageData"]');
    const preview = field.querySelector('[data-preview-box]');
    const clearBtn = field.querySelector('.clear-image-btn');
    const entityNameInput = root.querySelector('[name="displayName"], [name="name"]');
    const glyphInput = root.querySelector('[name="avatarGlyph"]');

    const renderPreview = () => {
      const pseudo = {
        id: root.querySelector('[name="id"]')?.value || 'entity',
        name: entityNameInput?.value || '',
        displayName: entityNameInput?.value || '',
        avatarGlyph: glyphInput?.value || '',
        image: field._previewObjectUrl || hidden.value || ''
      };
      preview.innerHTML = renderThumb(pseudo, { size: 'xl', type: 'entity', glyph: pseudo.avatarGlyph || 'âœ¦' });
    };

    fileInput?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      field.dataset.imageToken = token;
      field.dataset.imagePending = '1';
      if (field._previewObjectUrl) URL.revokeObjectURL(field._previewObjectUrl);
      field._previewObjectUrl = URL.createObjectURL(file);
      renderPreview();
      let task = null;
      try {
        const stem = [root.dataset.entityType || 'entity', root.querySelector('[name="id"]')?.value || '', entityNameInput?.value || file.name].filter(Boolean).join('_');
        const nativePath = !isDdsFileV51(file) ? window.electronAPI?.getPathForFile?.(file) : '';
        if (nativePath && window.electronAPI?.saveWorldImageFile) {
          field.dataset.pendingImageValue = nativePath;
          task = window.electronAPI.saveWorldImageFile({ filePath: nativePath, preferredStem: stem });
        } else {
          const dataUrl = await readImageFileAsRenderableDataUrlV51(file);
          field.dataset.pendingImageValue = isDdsFileV51(file) ? 'dds-conversion' : 'legacy-data-url';
          task = window.electronAPI?.saveWorldImage
            ? window.electronAPI.saveWorldImage({ dataUrl, preferredStem: stem })
            : Promise.resolve({ ok: true, url: dataUrl });
        }
        const tracked = Promise.resolve(task).then(result => {
          if (!result?.ok || !result?.url) throw new Error(result?.message || 'unknown error');
          if (field.dataset.imageToken === token) {
            hidden.value = result.url || result.localUrl || '';
            field.dataset.savedImageValue = hidden.value;
            if (field._previewObjectUrl) URL.revokeObjectURL(field._previewObjectUrl);
            field._previewObjectUrl = '';
            renderPreview();
          }
          if (result?.warning) Toast.show(`Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ð¹ Ñ„Ð°Ð¹Ð» ÑÐ¾Ñ…Ñ€Ð°Ð½Ñ‘Ð½, Ð½Ð¾ upload Ð² backend Ð½Ðµ ÑƒÐ´Ð°Ð»ÑÑ: ${result.warning}`, 'info');
          return result;
        }).finally(() => {
          if (field.dataset.imageToken === token) delete field.dataset.imagePending;
          root._imagePendingTasks = (root._imagePendingTasks || []).filter(item => item !== tracked);
        });
        field._imageTask = tracked;
        root._imagePendingTasks.push(tracked);
        await tracked;
      } catch (error) {
        delete field.dataset.imagePending;
        if (field._previewObjectUrl) URL.revokeObjectURL(field._previewObjectUrl);
        field._previewObjectUrl = '';
        renderPreview();
        Toast.show(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¾Ð±Ñ€Ð°Ð±Ð¾Ñ‚Ð°Ñ‚ÑŒ Ð¸Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ: ${error.message}`, 'err');
      }
    });

    clearBtn?.addEventListener('click', () => {
      hidden.value = '';
      field.dataset.savedImageValue = '';
      field.dataset.pendingImageValue = '';
      delete field.dataset.imagePending;
      field._imageTask = null;
      if (field._previewObjectUrl) URL.revokeObjectURL(field._previewObjectUrl);
      field._previewObjectUrl = '';
      if (fileInput) fileInput.value = '';
      renderPreview();
    });

    entityNameInput?.addEventListener('input', renderPreview);
    glyphInput?.addEventListener('input', renderPreview);
    renderPreview();
  });
}

function bindDynamicRowEditor(root) {
  root.querySelectorAll('.remove-row-btn').forEach(button => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      const row = button.closest('.dynamic-row');
      const list = row?.parentElement;
      row?.remove();
      if (list && !list.children.length) {
        if (list.dataset.kind === 'inventory') list.insertAdjacentHTML('beforeend', renderInventoryRows([]));
        if (list.dataset.kind === 'market') list.insertAdjacentHTML('beforeend', renderMarketRows([]));
        if (list.dataset.kind === 'routes') list.insertAdjacentHTML('beforeend', renderSystemRouteRows([], list.dataset.ownerId || ''));
        bindDynamicRowEditor(root);
      }
    });
  });

  const addInventory = root.querySelector('#add-inventory-row');
  if (addInventory && addInventory.dataset.bound !== '1') {
    addInventory.dataset.bound = '1';
    addInventory.addEventListener('click', () => {
      root.querySelector('#inventory-rows')?.insertAdjacentHTML('beforeend', renderInventoryRows([]));
      bindDynamicRowEditor(root);
    });
  }

  const addMarket = root.querySelector('#add-market-row');
  if (addMarket && addMarket.dataset.bound !== '1') {
    addMarket.dataset.bound = '1';
    addMarket.addEventListener('click', () => {
      root.querySelector('#market-rows')?.insertAdjacentHTML('beforeend', renderMarketRows([]));
      bindDynamicRowEditor(root);
    });
  }

  const addRoute = root.querySelector('#add-route-row');
  if (addRoute && addRoute.dataset.bound !== '1') {
    addRoute.dataset.bound = '1';
    addRoute.addEventListener('click', () => {
      const list = root.querySelector('#route-rows');
      list?.insertAdjacentHTML('beforeend', renderSystemRouteRows([], list?.dataset?.ownerId || ''));
      bindDynamicRowEditor(root);
    });
  }
}

const UI = {
  activeModuleId: null,
  activeElement: null,
  selectedPlanetId: null,
  selectedSystemId: null,
  attachEntityLinks(root) {
    root?.querySelectorAll('[data-entity][data-id]').forEach(node => {
      if (node.dataset.bound === '1') return;
      node.dataset.bound = '1';
      node.addEventListener('click', event => {
        event.preventDefault();
        if (node.dataset.action === 'use-item') {
          Tooling.openForItem(node.dataset.id);
          return;
        }
        Wiki.showEntity(node.dataset.entity, node.dataset.id, true);
      });
    });
  },
  openModule(id, options = {}) {
    if (this.activeModuleId !== id) this.closeModule();
    if (id === 'profile') this.renderProfile();
    if (id === 'tool') Tooling.render();
    if (id === 'market') {
      if (!this.selectedPlanetId) {
        Toast.show('Ð¡Ð½Ð°Ñ‡Ð°Ð»Ð° Ð²Ñ‹Ð±ÐµÑ€Ð¸ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñƒ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ', 'info');
        return;
      }
      this.renderMarket();
    }
    if (id === 'wiki' && !options.preserveWikiState) Wiki.prime();
    if (id === 'gm') GM.render();
    if (id === 'config') Configurator.render();
    if (id === 'sync') Sync.render();

    const moduleElement = $(`#mod-${id}`);
    if (!moduleElement) return;
    AudioManager.play('moduleOpen', { volume: 0.72 });
    if (options.overLogin || (id === 'sync' && document.getElementById('login-screen')?.classList.contains('open'))) moduleElement.classList.add('over-login');
    else moduleElement.classList.remove('over-login');
    moduleElement.style.display = 'block';
    requestAnimationFrame(() => moduleElement.classList.add('open'));
    this.activeModuleId = id;
    this.activeElement = moduleElement;
    document.body.classList.add('module-open');
    GalaxyMap.syncAnimationState();
  },
  closeModule() {
    if (!this.activeElement) return;
    const prev = this.activeElement;
    prev.classList.remove('open');
    prev.classList.remove('over-login');
    setTimeout(() => { prev.style.display = 'none'; }, 220);
    this.activeModuleId = null;
    this.activeElement = null;
    document.body.classList.remove('module-open');
    setTimeout(() => GalaxyMap.syncAnimationState(), 230);
  },
  inventoryMarkup(inventory) {
    return renderTagList(inventory.map(entry => {
      const item = Data.getItem(entry.itemId);
      if (!isEntityVisible(item)) return '';
      return renderEntityButton('item', item || { id: entry.itemId, name: entry.itemId }, { qty: entry.qty, compact: true, thumbSize: 'xs', preferUse: true });
    }), 'Ð˜Ð½Ð²ÐµÐ½Ñ‚Ð°Ñ€ÑŒ Ð¿ÑƒÑÑ‚');
  },
  socialNpcMarkup(npcIds) {
    return renderTagList(filterVisibleIds(npcIds, Data.getNpc).map(id => {
      const npc = Data.getNpc(id);
      return renderEntityButton('npc', npc, { compact: true, thumbSize: 'xs', subtitle: npc.role || npc.location || '' });
    }), 'ÐÐµÑ‚ Ð¸Ð·Ð²ÐµÑÑ‚Ð½Ñ‹Ñ… ÐºÐ¾Ð½Ñ‚Ð°ÐºÑ‚Ð¾Ð²');
  },
  floraMarkup(ids) {
    return renderTagList(filterVisibleIds(ids, Data.getFlora).map(id => renderEntityButton('flora', Data.getFlora(id), { compact: true, thumbSize: 'xs', subtitle: Data.getFlora(id)?.habitat || '' })), 'ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… ÑÐ²ÐµÐ´ÐµÐ½Ð¸Ð¹');
  },
  faunaMarkup(ids) {
    return renderTagList(filterVisibleIds(ids, Data.getFauna).map(id => renderEntityButton('fauna', Data.getFauna(id), { compact: true, thumbSize: 'xs', subtitle: Data.getFauna(id)?.habitat || '' })), 'ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… ÑÐ²ÐµÐ´ÐµÐ½Ð¸Ð¹');
  },
  renderProfile() {
    const user = App.currentUser;
    if (!user) return;
    const weapon = Data.getItem(user.equipmentSlots.weapon);
    const armor = Data.getItem(user.equipmentSlots.armor);
    const canEdit = user.role !== 'gm';
    const { planet: currentPlanet, system: currentSystem } = getPlayerCurrentLocation(user);
    const currentLocationMarkup = currentPlanet
      ? `
        <div class="result-stack">
          ${renderEntityButton('planet', currentPlanet, { compact: false, thumbSize: 'sm', subtitle: currentPlanet.code || currentPlanet.location?.system || 'Ð¢ÐµÐºÑƒÑ‰Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°' })}
          ${currentSystem ? renderEntityButton('system', currentSystem, { compact: true, thumbSize: 'xs', subtitle: 'Ð¢ÐµÐºÑƒÑ‰Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°' }) : ''}
        </div>
      `
      : '<div class="small-note">ÐŸÐ¾Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ Ð½Ðµ Ð·Ð°Ð´Ð°Ð½Ð¾ Ð² World Config.</div>';

    $('#profile-content').innerHTML = `
      <div class="grid3">
        <div class="stack">
          <div class="card profile-card">
            <div class="avatar media-avatar">${renderThumb(user, { size: 'hero', type: 'player', glyph: user.avatarGlyph || initials(user.displayName) })}</div>
            <h2 class="mono accent" style="margin:16px 0 4px">${esc(user.displayName)}</h2>
            <div class="subtle" style="margin-bottom:12px">${esc(user.rank)}</div>
            <div class="small-note" style="margin-bottom:18px">${esc(user.lore || 'ÐÐµÑ‚ Ð´Ð¾ÑÑŒÐµ')}</div>
            <div class="stat">
              <div>
                <div class="data-row"><span class="data-label">Ð—Ð´Ð¾Ñ€Ð¾Ð²ÑŒÐµ</span><span class="data-value">${user.stats.hp}%</span></div>
                <div class="bar"><div class="fill" style="width:${clamp(user.stats.hp,0,100)}%"></div></div>
              </div>
              <div>
                <div class="data-row"><span class="data-label">Ð©Ð¸Ñ‚</span><span class="data-value">${user.stats.shield}</span></div>
                <div class="bar"><div class="fill" style="width:${clamp(user.stats.shield/1.5,0,100)}%"></div></div>
              </div>
              <div>
                <div class="data-row"><span class="data-label">Ð‘Ð¸Ð¾Ð¼Ð¾Ð´ÑƒÐ»ÑŒ</span><span class="data-value">${user.stats.bio}</span></div>
                <div class="bar"><div class="fill" style="width:${clamp(user.stats.bio,0,100)}%"></div></div>
              </div>
            </div>
            <div style="margin-top:18px">
              <div class="data-row"><span class="data-label">Ð‘Ð°Ð»Ð°Ð½Ñ</span><span class="data-value">${formatCredits(user.credits)}</span></div>
              <div class="data-row"><span class="data-label">ID</span><span class="data-value">#${esc(user.id.toUpperCase())}</span></div>
            </div>
            <div style="margin-top:18px">
              <div class="section-title">Ð¢ÐµÐºÑƒÑ‰ÐµÐµ Ð¿Ð¾Ð»Ð¾Ð¶ÐµÐ½Ð¸Ðµ</div>
              ${currentLocationMarkup}
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card profile-card">
            <div class="section-title">Ð¥Ð°Ñ€Ð°ÐºÑ‚ÐµÑ€Ð¸ÑÑ‚Ð¸ÐºÐ¸</div>
            <div class="abilities">
              ${Object.entries(user.abilities).map(([key, value]) => `<div class="ability"><span>${key.toUpperCase()}</span><b>${value}</b></div>`).join('')}
            </div>
          </div>

          <div class="card profile-card">
            <div class="section-title">Ð¡Ð½Ð°Ñ€ÑÐ¶ÐµÐ½Ð¸Ðµ</div>
            <div class="equip-click-wrap">${weapon ? renderEntityButton('item', weapon, { compact: false, thumbSize: 'md', subtitle: weapon.desc || '' }) : '<div class="equip"><div class="icon">âš”</div><div>â€”</div></div>'}</div>
            <div class="equip-click-wrap">${armor ? renderEntityButton('item', armor, { compact: false, thumbSize: 'md', subtitle: armor.desc || '' }) : '<div class="equip"><div class="icon">â›¨</div><div>â€”</div></div>'}</div>
            <div class="section-title" style="margin-top:18px">Ð˜Ð½Ð²ÐµÐ½Ñ‚Ð°Ñ€ÑŒ</div>
            <div class="small-note" style="margin-bottom:8px">ÐŸÑ€ÐµÐ´Ð¼ÐµÑ‚Ñ‹ Ð¾Ñ‚ÐºÑ€Ñ‹Ð²Ð°ÑŽÑ‚ ÐºÐ°Ñ€Ñ‚Ð¾Ñ‡ÐºÑƒ Ñ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸ÐµÐ¼ Ð¸ ÑÐ²ÑÐ·Ð°Ð½Ð½Ñ‹Ð¼Ð¸ Ð¼Ð°Ñ‚ÐµÑ€Ð¸Ð°Ð»Ð°Ð¼Ð¸.</div>
            <div class="tags entity-button-row">${this.inventoryMarkup(user.inventory)}</div>
            <div class="section-title" style="margin-top:18px">Ð˜Ð¼Ð¿Ð»Ð°Ð½Ñ‚Ñ‹</div>
            <div class="list-grid">${user.implants.map(implant => `<div class="data-row"><span>${esc(implant.name)}</span><span class="data-value">${esc(implant.status)}</span></div>`).join('') || '<div class="small-note">ÐÐµÑ‚ Ð¸Ð¼Ð¿Ð»Ð°Ð½Ñ‚Ð¾Ð²</div>'}</div>
          </div>
        </div>

        <div class="stack">
          <div class="card profile-card">
            <div class="section-title">Ð¡Ð¾Ñ†Ð¸Ð°Ð»ÑŒÐ½Ñ‹Ðµ ÑÐ²ÑÐ·Ð¸</div>
            <div class="tags entity-button-row">${this.socialNpcMarkup(user.social.npcIds)}</div>
            <div class="section-title" style="margin-top:18px">ÐžÑ€Ð³Ð°Ð½Ð¸Ð·Ð°Ñ†Ð¸Ð¸</div>
            <div class="tags">${(user.social.orgs || []).map(org => `<span class="tag">${esc(org)}</span>`).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð°Ð½Ð½Ñ‹Ñ…</div>'}</div>
          </div>

          <form id="profile-edit-form" class="card profile-card form">
            <div class="section-title">Ð ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¸Ðµ Ð¿Ñ€Ð¾Ñ„Ð¸Ð»Ñ</div>
            <div class="field"><label>ÐžÑ‚Ð¾Ð±Ñ€Ð°Ð¶Ð°ÐµÐ¼Ð¾Ðµ Ð¸Ð¼Ñ</label><input class="input" name="displayName" value="${esc(user.displayName)}" ${canEdit ? '' : 'disabled'} /></div>
            <div class="field"><label>ÐŸÐ°Ñ€Ð¾Ð»ÑŒ</label><input class="input" name="pass" value="${esc(user.pass)}" ${canEdit ? '' : 'disabled'} /></div>
            <div class="field"><label>Ð›Ð¾Ñ€ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°</label><textarea class="area" name="lore" ${canEdit ? '' : 'disabled'}>${esc(user.lore)}</textarea></div>
            <div class="field"><label>Ð›Ð¸Ñ‡Ð½Ñ‹Ðµ Ð·Ð°Ð¼ÐµÑ‚ÐºÐ¸</label><textarea class="area" name="notes">${esc(user.notes)}</textarea></div>
            <button class="primary" type="submit">Ð¡ÐžÐ¥Ð ÐÐÐ˜Ð¢Ð¬ ÐŸÐ ÐžÐ¤Ð˜Ð›Ð¬</button>
            <div class="small-note">Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ð¸ ÑÐ²ÑÐ·Ð°Ð½Ð½Ñ‹Ð¹ ÐºÐ¾Ð½Ñ‚ÐµÐ½Ñ‚ Ð·Ð°Ð´Ð°ÑŽÑ‚ÑÑ Ñ‡ÐµÑ€ÐµÐ· Ð¼Ð°ÑÑ‚ÐµÑ€ÑÐºÐ¸Ð¹ ÐºÐ¾Ð½Ñ„Ð¸Ð³ÑƒÑ€Ð°Ñ‚Ð¾Ñ€. Ð”Ð¾ÑÑ‚ÑƒÐ¿ Ðº Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°Ð¼, NPC Ð¸ ÑÑ‚Ð°Ñ‚ÑŒÑÐ¼ Ñ‚Ð¾Ð¶Ðµ ÐºÐ¾Ð½Ñ‚Ñ€Ð¾Ð»Ð¸Ñ€ÑƒÐµÑ‚ÑÑ Ñ‚Ð°Ð¼.</div>
          </form>
        </div>
      </div>
    `;

    this.attachEntityLinks($('#profile-content'));

    $('#profile-edit-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      user.notes = String(formData.get('notes') || '').trim();
      if (user.role !== 'gm') {
        user.displayName = String(formData.get('displayName') || user.displayName).trim() || user.displayName;
        user.pass = String(formData.get('pass') || user.pass).trim() || user.pass;
        user.lore = String(formData.get('lore') || user.lore).trim() || user.lore;
      }
      if (PLAYER_TEMPLATES[user.id]) {
        PLAYER_TEMPLATES[user.id].notes = user.notes;
        PLAYER_TEMPLATES[user.id].displayName = user.displayName;
        PLAYER_TEMPLATES[user.id].pass = user.pass;
        PLAYER_TEMPLATES[user.id].lore = user.lore;
      }
      const saveWorldRes = await persistPlayersTemplateOnly();
      if (!saveWorldRes?.ok) {
        Toast.show(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð·Ð°Ð¿Ð¸ÑÐ°Ñ‚ÑŒ players.json: ${saveWorldRes?.message || 'unknown error'}`, 'err');
        return;
      }
      await App.saveState('ÐŸÑ€Ð¾Ñ„Ð¸Ð»ÑŒ Ð¾Ð±Ð½Ð¾Ð²Ð»Ñ‘Ð½');
      this.renderProfile();
    });
  },
  renderPlanetAnalysis(planetId, systemId) {
    const planet = Data.getPlanet(planetId);
    const system = Data.getSystem(systemId);
    if (!planet || !isEntityVisible(planet)) {
      Toast.show('Ð£ Ð²Ð°Ñ Ð½ÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð° Ðº ÑÑ‚Ð¾Ð¹ Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ', 'err');
      return;
    }
    this.selectedPlanetId = planet.id;
    this.selectedSystemId = systemId;
    AudioManager.play('planetFocus', { volume: 0.85 });
    $('#obj-name').textContent = planet.name.toUpperCase();
    $('#obj-subname').textContent = system ? `Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð° ${system.name}` : 'ÐŸÐ»Ð°Ð½ÐµÑ‚Ð°Ñ€Ð½Ñ‹Ð¹ Ð¾Ð±ÑŠÐµÐºÑ‚';
    $('#obj-id').textContent = planet.code || planet.id;
    $('#hud-analysis').style.display = 'block';
    $('#market-trigger').style.display = 'block';

    $('#analysis-content').innerHTML = `
      <div class="analysis-hero">
        ${renderThumb(planet, { size: 'hero', type: 'planet', glyph: initials(planet.name, 'â—Œ') })}
        <div>
          <div class="section-title">ÐŸÐ»Ð°Ð½ÐµÑ‚Ð°Ñ€Ð½Ñ‹Ð¹ ÑÐºÐ°Ð½</div>
          <div class="analysis-headline">${esc(planet.name)}</div>
          <div class="subtle">${esc(planet.location?.system || '')}</div>
          <div style="margin-top:8px">${__renderRichText(getPlanetReference(planet), '<div class="small-note">ÐÐµÑ‚ ÑÐ¿Ñ€Ð°Ð²ÐºÐ¸ Ð´Ð»Ñ Ð¿Ð¸Ð»Ð¾Ñ‚Ð¾Ð²</div>')}</div>
          <div style="margin-top:12px">${renderEntityButton('planet', planet, { compact: true, thumbSize: 'xs', subtitle: 'ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð¿Ð¾Ð»Ð½ÑƒÑŽ ÑÑ‚Ð°Ñ‚ÑŒÑŽ Ð² Ð°Ñ€Ñ…Ð¸Ð²Ðµ' })}</div>
        </div>
      </div>
      <div class="analysis-section">
        <div class="section-title">Ð›Ð¾ÐºÐ°Ñ†Ð¸Ñ</div>
        <div class="data-row"><span class="data-label">Ð ÐµÐ³Ð¸Ð¾Ð½</span><span class="data-value">${esc(planet.location?.arm || '')}</span></div>
        <div class="data-row"><span class="data-label">Ð£Ð·ÐµÐ»</span><span class="data-value">${esc(planet.location?.node || '')}</span></div>
        <div class="data-row"><span class="data-label">Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð°</span><span class="data-value">${esc(planet.location?.system || '')}</span></div>
        <div class="data-row"><span class="data-label">ÐžÐ±ÑŠÐµÐºÑ‚</span><span class="data-value">${esc(planet.location?.obj || '')}</span></div>
      </div>
      <div class="analysis-section">
        <div class="section-title">Ð¤Ð¸Ð·Ð¸Ñ‡ÐµÑÐºÐ¸Ðµ Ñ…Ð°Ñ€Ð°ÐºÑ‚ÐµÑ€Ð¸ÑÑ‚Ð¸ÐºÐ¸</div>
        <div class="data-row"><span class="data-label">Ð¢Ð¸Ð¿</span><span class="data-value">${esc(planet.physics?.type || '')}</span></div>
        <div class="data-row"><span class="data-label">ÐœÐ°ÑÑÐ°</span><span class="data-value">${esc(planet.physics?.mass || '')}</span></div>
        <div class="data-row"><span class="data-label">Ð Ð°Ð´Ð¸ÑƒÑ</span><span class="data-value">${esc(planet.physics?.radius || '')}</span></div>
        <div class="data-row"><span class="data-label">Ð“Ñ€Ð°Ð²Ð¸Ñ‚Ð°Ñ†Ð¸Ñ</span><span class="data-value">${esc(planet.physics?.gravity || '')}</span></div>
        <div class="data-row"><span class="data-label">Ð¢ÐµÐ¼Ð¿ÐµÑ€Ð°Ñ‚ÑƒÑ€Ð°</span><span class="data-value">${esc(planet.physics?.temp || '')}</span></div>
        <div class="data-row"><span class="data-label">ÐšÐ»Ð¸Ð¼Ð°Ñ‚</span><span class="data-value">${esc(planet.physics?.climate || '')}</span></div>
        <div class="subtle" style="margin-top:6px">${esc(planet.physics?.atm || '')}</div>
      </div>
      <div class="analysis-section">
        <div class="section-title">Ð¡Ð¾Ñ†Ð¸Ð¾-Ð¿Ð¾Ð»Ð¸Ñ‚Ð¸Ñ‡ÐµÑÐºÐ¸Ð¹ ÑÑ‚Ð°Ñ‚ÑƒÑ</div>
        <div class="data-row"><span class="data-label">ÐÐ°ÑÐµÐ»ÐµÐ½Ð¸Ðµ</span><span class="data-value">${esc(planet.socio?.pop || '')}</span></div>
        <div class="data-row"><span class="data-label">Ð¡Ñ‚Ð¾Ð»Ð¸Ñ†Ð°</span><span class="data-value">${esc(planet.socio?.capital || '')}</span></div>
        <div class="data-row"><span class="data-label">ÐŸÑ€Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ</span><span class="data-value">${esc(planet.socio?.gov || '')}</span></div>
        <div class="subtle" style="margin-top:6px"><b>Ð ÐµÐ¶Ð¸Ð¼:</b> ${esc(planet.socio?.law || '')}</div>
      </div>
      <div class="analysis-section">
        <div class="section-title">ÐšÐ»ÑŽÑ‡ÐµÐ²Ñ‹Ðµ ÑÑƒÑ‰Ð½Ð¾ÑÑ‚Ð¸</div>
        <div class="subtle" style="margin-bottom:6px">NPC</div>
        <div class="tags entity-button-row">${this.socialNpcMarkup(planet.npcIds)}</div>
        <div class="subtle" style="margin:10px 0 6px">Ð¤Ð»Ð¾Ñ€Ð°</div>
        <div class="tags entity-button-row">${this.floraMarkup(planet.floraIds)}</div>
        <div class="subtle" style="margin:10px 0 6px">Ð¤Ð°ÑƒÐ½Ð°</div>
        <div class="tags entity-button-row">${this.faunaMarkup(planet.faunaIds)}</div>
      </div>
      <div class="analysis-section">
        <div class="section-title">Ð¡Ð¿Ñ€Ð°Ð²ÐºÐ° Ð´Ð»Ñ Ð¿Ð¸Ð»Ð¾Ñ‚Ð¾Ð²</div>
        <div class="annotation-box">
          ${__renderRichText(getPlanetReference(planet), '<p>ÐÐµÑ‚ ÑÐ¿Ñ€Ð°Ð²ÐºÐ¸ Ð´Ð»Ñ Ð¿Ð¸Ð»Ð¾Ñ‚Ð¾Ð².</p>')}
          ${planet.pilot?.warning ? `<div style="margin-top:12px"><span class="warning">ÐŸÐ Ð•Ð”Ð£ÐŸÐ Ð•Ð–Ð”Ð•ÐÐ˜Ð•:</span>${__renderRichText(planet.pilot?.warning, '')}</div>` : ''}
        </div>
      </div>
    `;

    this.attachEntityLinks($('#analysis-content'));
  },
  renderMarket() {
    const planet = Data.getPlanet(this.selectedPlanetId);
    const user = App.currentUser;
    if (!planet || !user || !isEntityVisible(planet)) return;
    const marketAccess = getMarketAccessState(user, planet.id);

    $('#market-title').textContent = `Ð¢ÐžÐ Ð“ÐžÐ’Ð«Ð™ Ð¢Ð•Ð ÐœÐ˜ÐÐÐ› Â· ${planet.name.toUpperCase()}`;
    $('#market-subtitle').textContent = marketAccess.canBuy
      ? 'Ð Ñ‹Ð½Ð¾Ðº Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹ Ð¸ Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ðµ Ð¿Ñ€ÐµÐ´Ð»Ð¾Ð¶ÐµÐ½Ð¸Ñ'
      : `ÐŸÐ¾ÐºÑƒÐ¿ÐºÐ° Ð·Ð°Ð±Ð»Ð¾ÐºÐ¸Ñ€Ð¾Ð²Ð°Ð½Ð°: ${marketAccess.reason}`;
    $('#market-balance').textContent = `${formatCredits(user.credits)}`;
    $('#market-planet').textContent = planet.name;

    const visibleEntries = (planet.market || []).filter(entry => isEntityVisible(Data.getItem(entry.itemId)));
    const accessBanner = marketAccess.canBuy
      ? `<div class="card pad18 small-note market-access-banner ok">ÐŸÐ¾ÐºÑƒÐ¿ÐºÐ° Ñ€Ð°Ð·Ñ€ÐµÑˆÐµÐ½Ð°. ÐŸÐµÑ€ÑÐ¾Ð½Ð°Ð¶ Ð½Ð°Ñ…Ð¾Ð´Ð¸Ñ‚ÑÑ Ð½Ð° Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ <b>${esc(planet.name)}</b>.</div>`
      : `<div class="card pad18 small-note market-access-banner err"><b>ÐŸÐ¾ÐºÑƒÐ¿ÐºÐ° Ð·Ð°Ð±Ð»Ð¾ÐºÐ¸Ñ€Ð¾Ð²Ð°Ð½Ð°.</b> ${esc(marketAccess.reason)}${marketAccess.currentPlanet ? ` Ð¡ÐµÐ¹Ñ‡Ð°Ñ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶ Ð½Ð°Ñ…Ð¾Ð´Ð¸Ñ‚ÑÑ Ð½Ð° Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ <b>${esc(marketAccess.currentPlanet.name)}</b>.` : ''}</div>`;

    $('#market-items').innerHTML = `${accessBanner}${visibleEntries.map(entry => {
      const item = Data.getItem(entry.itemId) || { id: entry.itemId, name: entry.itemId, desc: '' };
      return `
        <div class="card market-item market-card">
          <div class="market-card-top">
            ${renderThumb(item, { size: 'lg', type: 'item', glyph: initials(item.name, 'â–£') })}
            <div>
              <button class="market-link" data-entity="item" data-id="${esc(item.id)}">${esc(item.name)}</button>
              <div class="subtle" style="margin-top:6px;min-height:36px">${esc(item.desc || 'ÐÐµÑ‚ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ñ')}</div>
              <div class="tags" style="margin-top:10px">${(item.tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div>
            </div>
          </div>
          <div class="price" style="margin:14px 0 8px">${formatCredits(entry.price)}</div>
          <button class="primary buy-btn" data-item-id="${esc(entry.itemId)}" data-price="${entry.price}" ${marketAccess.canBuy ? '' : 'disabled aria-disabled="true" title="ÐŸÐ¾ÐºÑƒÐ¿ÐºÐ° Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð½Ð° Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¹ Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°"'}>ÐšÐ£ÐŸÐ˜Ð¢Ð¬</button>
        </div>
      `;
    }).join('') || '<div class="card pad18 small-note">ÐÐ° ÑÑ‚Ð¾Ð¹ Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ Ð½ÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð¿Ñ€ÐµÐ´Ð»Ð¾Ð¶ÐµÐ½Ð¸Ð¹ Ð´Ð»Ñ Ñ‚ÐµÐºÑƒÑ‰ÐµÐ³Ð¾ Ð¿Ð¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ñ‚ÐµÐ»Ñ.</div>'}`;

    this.attachEntityLinks($('#market-items'));

    $('#market-items').querySelectorAll('.buy-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const access = getMarketAccessState(user, planet.id);
        if (!access.canBuy) {
          Toast.show(access.reason, 'err');
          return;
        }
        const price = Number(button.dataset.price);
        const itemId = button.dataset.itemId;
        if (user.credits < price) {
          Toast.show('ÐÐµÐ´Ð¾ÑÑ‚Ð°Ñ‚Ð¾Ñ‡Ð½Ð¾ ÐºÑ€ÐµÐ´Ð¸Ñ‚Ð¾Ð²', 'err');
          return;
        }
        user.credits -= price;
        const entry = user.inventory.find(inv => inv.itemId === itemId);
        if (entry) entry.qty += 1;
        else user.inventory.push({ itemId, qty: 1 });
        AudioManager.play('marketBuy', { volume: 0.9 });
        await App.saveState(`ÐšÑƒÐ¿Ð»ÐµÐ½Ð¾: ${Data.getItem(itemId)?.name || itemId}`);
        this.renderMarket();
      });
    });
  },
  exportProfile() {
    const user = App.currentUser;
    if (!user) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      user,
      resolvedEquipment: {
        weapon: Data.getItem(user.equipmentSlots.weapon),
        armor: Data.getItem(user.equipmentSlots.armor),
        inventory: user.inventory.map(entry => ({ ...entry, item: Data.getItem(entry.itemId) || null }))
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${user.id}-profile.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    Toast.show('ÐŸÑ€Ð¾Ñ„Ð¸Ð»ÑŒ ÑÐºÑÐ¿Ð¾Ñ€Ñ‚Ð¸Ñ€Ð¾Ð²Ð°Ð½', 'ok');
  }
};

const Wiki = {
  activeSection: 'articles',
  sectionForType(type) {
    return ({ planet: 'planets', item: 'equipment', article: 'articles', system: 'systems' })[type] || '';
  },
  syncSectionNav() {
    document.querySelectorAll('[data-wiki-section-v1060]').forEach(button => {
      button.classList.toggle('active', button.dataset.wikiSectionV1060 === this.activeSection);
    });
    const input = $('#wiki-input');
    if (input) {
      input.placeholder = ({
        planets: 'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹, ÑÐ¸ÑÑ‚ÐµÐ¼Ð°, ÐºÐ¾Ð´...',
        equipment: 'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ð°, Ñ‚Ð¸Ð¿, Ñ€ÐµÐ´ÐºÐ¾ÑÑ‚ÑŒ...',
        articles: 'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸, ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ñ, Ñ‚ÐµÐºÑÑ‚...',
        systems: 'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ ÑÐ¸ÑÑ‚ÐµÐ¼Ñ‹, Ð¼ÐµÑ‚ÐºÐ°...'
      })[this.activeSection] || 'ÐŸÐ¾Ð¸ÑÐº Ð¿Ð¾ Ð°Ñ€Ñ…Ð¸Ð²Ñƒ...';
    }
  },
  setSection(section, options = {}) {
    const allowed = new Set(['planets', 'equipment', 'articles', 'systems']);
    this.activeSection = allowed.has(section) ? section : 'articles';
    if (options.clearSearch !== false && $('#wiki-input')) $('#wiki-input').value = '';
    this.currentView = null;
    this.syncSectionNav();
    this.prime();
  },
  entityPool(section = this.activeSection) {
    const pool = [];
    if (section === 'systems') {
      getVisibleSystems().forEach(system => pool.push({ type: 'system', entity: system, summary: `Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð° Â· ${system.planetIds?.length || 0} Ð¿Ð»Ð°Ð½ÐµÑ‚` }));
    } else if (section === 'planets') {
      Object.values(Data.planets).filter(entity => isEntityVisible(entity)).forEach(planet => pool.push({ type: 'planet', entity: planet, summary: planet.location?.system || planet.code || 'ÐŸÐ»Ð°Ð½ÐµÑ‚Ð°' }));
    } else if (section === 'equipment') {
      Object.values(Data.equipment).filter(entity => isEntityVisible(entity)).forEach(item => pool.push({ type: 'item', entity: item, summary: `${item.type || item.category || 'ÑÐ½Ð°Ñ€ÑÐ¶ÐµÐ½Ð¸Ðµ'} Â· ${item.rarity || ''}` }));
    } else {
      Object.values(Data.articles).filter(entity => isEntityVisible(entity)).forEach(article => pool.push({ type: 'article', entity: article, summary: article.category || article.summary || 'Ð¡Ñ‚Ð°Ñ‚ÑŒÑ Ð°Ñ€Ñ…Ð¸Ð²Ð°' }));
    }
    return pool;
  },
  prime() {
    this.syncSectionNav();
    const hits = this.entityPool();
    $('#wiki-results').innerHTML = hits.map(hit => `
      <div class="wiki-hit wiki-hit-rich" data-entity="${hit.type}" data-id="${hit.entity.id}">
        ${renderThumb(hit.entity, { size: 'sm', type: hit.type })}
        <div>
          <div><b>${esc(titleForEntity(hit.type, hit.entity))}</b></div>
          <div class="subtle">${esc(hit.summary)}</div>
        </div>
      </div>
    `).join('') || '<div class="subtle">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð·Ð°Ð¿Ð¸ÑÐµÐ¹.</div>';
    $('#wiki-results').querySelectorAll('.wiki-hit').forEach(node => {
      node.addEventListener('click', () => this.showEntity(node.dataset.entity, node.dataset.id));
    });
    if (hits[0]) this.showEntity(hits[0].type, hits[0].entity.id);
  },
  search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return this.prime();
    const results = this.entityPool().filter(hit => {
      const entity = hit.entity;
      const hay = [
        entity.id,
        entity.name,
        entity.displayName,
        hit.summary,
        entity.summary,
        entity.desc,
        entity.location,
        entity.role,
        entity.habitat,
        entity.code,
        getPlanetReference(entity),
        getPlanetInfo(entity),
        entity.use,
        entity.behavior,
        entity.body,
        entity.category
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });

    $('#wiki-results').innerHTML = results.map(hit => `
      <div class="wiki-hit wiki-hit-rich" data-entity="${hit.type}" data-id="${hit.entity.id}">
        ${renderThumb(hit.entity, { size: 'sm', type: hit.type })}
        <div>
          <div><b>${esc(titleForEntity(hit.type, hit.entity))}</b></div>
          <div class="subtle">${esc(hit.summary)}</div>
        </div>
      </div>
    `).join('') || '<div class="subtle">ÐÐ¸Ñ‡ÐµÐ³Ð¾ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾ Ð² Ð¿Ñ€ÐµÐ´ÐµÐ»Ð°Ñ… Ñ‚Ð²Ð¾ÐµÐ³Ð¾ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð°.</div>';

    $('#wiki-results').querySelectorAll('.wiki-hit').forEach(node => {
      node.addEventListener('click', () => this.showEntity(node.dataset.entity, node.dataset.id));
    });
    if (results[0]) this.showEntity(results[0].type, results[0].entity.id);
  },
  currentView: null,
  showEntity(type, id, autoOpen = false) {
    const section = this.sectionForType(type);
    if (section) {
      this.activeSection = section;
      this.syncSectionNav();
    }
    this.currentView = { type, id };
    const entity = entityByType(type, id);
    if (!entity || !isEntityVisible(entity)) {
      $('#wiki-detail').innerHTML = '<div class="subtle">Ð­Ñ‚Ð° Ð·Ð°Ð¿Ð¸ÑÑŒ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¼Ñƒ Ð¿Ð¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ñ‚ÐµÐ»ÑŽ.</div>';
      if (autoOpen && UI.activeModuleId !== 'wiki') UI.openModule('wiki', { preserveWikiState: true });
      return;
    }
    if (autoOpen && UI.activeModuleId !== 'wiki') UI.openModule('wiki', { preserveWikiState: true });
    const target = $('#wiki-detail');

    if (type === 'system') {
      const planets = getVisiblePlanetsForSystem(entity);
      target.innerHTML = `
        <div class="wiki-hero">
          ${renderThumb(entity, { size: 'hero', type: 'system', glyph: initials(entity.name, 'âœ¦') })}
          <div>
            <div class="section-title">Ð—Ð²Ñ‘Ð·Ð´Ð½Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°</div>
            <h2 class="mono accent">${esc(entity.name)}</h2>
            <div class="subtle">ÐšÐ¾Ð¾Ñ€Ð´Ð¸Ð½Ð°Ñ‚Ñ‹: ${esc(entity.pos?.x)} / ${esc(entity.pos?.y)}</div>
            <div class="small-note" style="margin-top:8px">Ð’Ð¸Ð´Ð¸Ð¼Ð¾ÑÑ‚ÑŒ Ð´Ð»Ñ Ð¸Ð³Ñ€Ð¾ÐºÐ¾Ð² Ñ€ÐµÐ³ÑƒÐ»Ð¸Ñ€ÑƒÐµÑ‚ÑÑ Ð¾Ñ‚Ð´ÐµÐ»ÑŒÐ½Ð¾. Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð° Ð¿Ð¾ÑÐ²Ð»ÑÐµÑ‚ÑÑ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ñƒ Ñ‚ÐµÑ…, ÐºÑ‚Ð¾ Ð¸Ð¼ÐµÐµÑ‚ Ðº Ð½ÐµÐ¹ Ð´Ð¾ÑÑ‚ÑƒÐ¿.</div>
          </div>
        </div>
        <div class="section-title">ÐŸÐ»Ð°Ð½ÐµÑ‚Ñ‹</div>
        <div class="result-stack">${planets.map(planet => renderEntityButton('planet', planet, { subtitle: planet.code || planet.location?.system || '', thumbSize: 'md' })).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð¿Ð»Ð°Ð½ÐµÑ‚ Ð² ÑÑ‚Ð¾Ð¹ ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ.</div>'}</div>
        ${renderRelatedArticlesSection(entity.relatedArticleIds)}
      `;
    }

    if (type === 'planet') {
      target.innerHTML = `
        <div class="wiki-hero">
          ${renderThumb(entity, { size: 'hero', type: 'planet', glyph: initials(entity.name, 'â—Œ') })}
          <div>
            <div class="section-title">ÐŸÐ»Ð°Ð½ÐµÑ‚Ð°</div>
            <h2 class="mono accent">${esc(entity.name)}</h2>
            <div class="subtle">${esc(entity.code || '')} Â· ${esc(entity.location?.system || '')}</div>
            ${__renderRichText(getPlanetInfo(entity), '<p>ÐÐµÑ‚ Ð¸Ð½Ñ„Ð¾Ñ€Ð¼Ð°Ñ†Ð¸Ð¸</p>')}
          </div>
        </div>
        <div class="wiki-data-grid">
          <div class="card pad18">
            <div class="section-title">Ð¤Ð¸Ð·Ð¸ÐºÐ°</div>
            <div class="data-row"><span class="data-label">Ð¢Ð¸Ð¿</span><span class="data-value">${esc(entity.physics?.type || '')}</span></div>
            <div class="data-row"><span class="data-label">ÐšÐ»Ð¸Ð¼Ð°Ñ‚</span><span class="data-value">${esc(entity.physics?.climate || '')}</span></div>
            <div class="data-row"><span class="data-label">Ð“Ñ€Ð°Ð²Ð¸Ñ‚Ð°Ñ†Ð¸Ñ</span><span class="data-value">${esc(entity.physics?.gravity || '')}</span></div>
            <div class="data-row"><span class="data-label">ÐÑ‚Ð¼Ð¾ÑÑ„ÐµÑ€Ð°</span><span class="data-value">${esc(entity.physics?.atm || '')}</span></div>
          </div>
          <div class="card pad18">
            <div class="section-title">ÐžÐ±Ñ‰ÐµÑÑ‚Ð²Ð¾</div>
            <div class="data-row"><span class="data-label">ÐÐ°ÑÐµÐ»ÐµÐ½Ð¸Ðµ</span><span class="data-value">${esc(entity.socio?.pop || '')}</span></div>
            <div class="data-row"><span class="data-label">Ð¡Ñ‚Ð¾Ð»Ð¸Ñ†Ð°</span><span class="data-value">${esc(entity.socio?.capital || '')}</span></div>
            <div class="data-row"><span class="data-label">ÐŸÑ€Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ</span><span class="data-value">${esc(entity.socio?.gov || '')}</span></div>
            <div class="small-note" style="margin-top:8px">${esc(entity.socio?.law || '')}</div>
          </div>
        </div>
        <div class="section-title" style="margin-top:18px">ÐšÐ»ÑŽÑ‡ÐµÐ²Ñ‹Ðµ NPC</div>
        <div class="tags entity-button-row">${UI.socialNpcMarkup(entity.npcIds)}</div>
        <div class="section-title" style="margin-top:18px">Ð¤Ð»Ð¾Ñ€Ð°</div>
        <div class="tags entity-button-row">${UI.floraMarkup(entity.floraIds)}</div>
        <div class="section-title" style="margin-top:18px">Ð¤Ð°ÑƒÐ½Ð°</div>
        <div class="tags entity-button-row">${UI.faunaMarkup(entity.faunaIds)}</div>
        <div class="section-title" style="margin-top:18px">Ð Ñ‹Ð½Ð¾Ðº</div>
        <div class="result-stack">${(entity.market || []).filter(entry => isEntityVisible(Data.getItem(entry.itemId))).map(entry => renderEntityButton('item', Data.getItem(entry.itemId), { subtitle: `${formatCredits(entry.price)}`, thumbSize: 'sm' })).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ñ‚Ð¾Ð²Ð°Ñ€Ð¾Ð²</div>'}</div>
        ${renderRelatedArticlesSection(entity.relatedArticleIds)}
      `;
    }

    if (type === 'npc') {
      const homePlanet = planetForNpc(entity.id);
      target.innerHTML = `
        <div class="wiki-hero">
          ${renderZoomableThumb(entity, { size: 'hero', type: 'npc', glyph: initials(entity.name, 'âŒ') })}
          <div>
            <div class="section-title">NPC</div>
            <h2 class="mono accent">${esc(entity.name)}</h2>
            <div class="subtle">${esc(entity.role || '')} Â· ${esc(entity.location || '')}</div>
            <p>${esc(entity.summary || 'ÐÐµÑ‚ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ñ')}</p>
          </div>
        </div>
        <div class="section-title">Ð§ÐµÑ€Ñ‚Ñ‹</div>
        <div class="tags">${(entity.traits || []).map(trait => `<span class="tag">${esc(trait)}</span>`).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð°Ð½Ð½Ñ‹Ñ…</div>'}</div>
        ${homePlanet && isEntityVisible(homePlanet) ? `<div class="section-title" style="margin-top:18px">Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°</div><div>${renderEntityButton('planet', homePlanet, { subtitle: homePlanet.code || '', thumbSize: 'sm' })}</div>` : ''}
        ${renderRelatedArticlesSection(entity.relatedArticleIds)}
        <div class="section-title" style="margin-top:18px">Ð¡Ð²ÑÐ·ÑŒ</div>
        ${App.currentUser?.role === 'gm' ? ChatUI.renderNpcThreadsForGm(entity) : ChatUI.renderNpcThreadForPlayer(entity)}
      `;
    }

    if (type === 'item') {
      const soldOn = Object.values(PLANETS).filter(planet => isEntityVisible(planet) && (planet.market || []).some(entry => entry.itemId === entity.id));
      target.innerHTML = `
        <div class="wiki-hero">
          ${renderThumb(entity, { size: 'hero', type: 'item', glyph: initials(entity.name, 'â–£') })}
          <div>
            <div class="section-title">ÐŸÑ€ÐµÐ´Ð¼ÐµÑ‚</div>
            <h2 class="mono accent">${esc(entity.name)}</h2>
            <div class="subtle">${esc(entity.type || '')} Â· ${esc(entity.rarity || '')}</div>
            <p>${esc(entity.desc || 'ÐÐµÑ‚ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ñ')}</p>
            ${itemHasUsableMechanic(entity) ? `<button class="primary" type="button" id="wiki-use-item-btn">ÐžÐ¢ÐšÐ Ð«Ð¢Ð¬ ÐœÐžÐ”Ð£Ð›Ð¬ ÐŸÐ Ð•Ð”ÐœÐ•Ð¢Ð</button>` : ''}
          </div>
        </div>
        <div class="tags">${(entity.tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('') || '<div class="small-note">ÐÐµÑ‚ Ñ‚ÐµÐ³Ð¾Ð²</div>'}</div>
        ${itemHasUsableMechanic(entity) ? `<div class="card pad18" style="margin:18px 0"><div class="data-row"><span class="data-label">ÐœÐµÑ…Ð°Ð½Ð¸ÐºÐ°</span><span class="data-value">${esc(entity.mechanicTitle || 'Ð”ÐµÑˆÐ¸Ñ„Ñ€Ð°Ñ‚Ð¾Ñ€')}</span></div><div class="small-note" style="margin-top:8px">${esc(entity.mechanicHint || 'Ð­Ñ‚Ð¾Ñ‚ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚ Ð¾Ñ‚ÐºÑ€Ñ‹Ð²Ð°ÐµÑ‚ Ð¸Ð½Ñ‚ÐµÑ€Ð°ÐºÑ‚Ð¸Ð²Ð½Ñ‹Ð¹ Ð¸Ð½ÑÑ‚Ñ€ÑƒÐ¼ÐµÐ½Ñ‚ Ð¸Ð· Ð¸Ð½Ð²ÐµÐ½Ñ‚Ð°Ñ€Ñ.')}</div></div>` : ''}
        <div class="section-title" style="margin-top:18px">Ð“Ð´Ðµ Ð²ÑÑ‚Ñ€ÐµÑ‡Ð°ÐµÑ‚ÑÑ</div>
        <div class="result-stack">${soldOn.map(planet => renderEntityButton('planet', planet, { subtitle: `${formatCredits((planet.market || []).find(entry => entry.itemId === entity.id)?.price || 0)}`, thumbSize: 'sm' })).join('') || '<div class="small-note">ÐÐµ Ð¿Ñ€Ð¾Ð´Ð°Ñ‘Ñ‚ÑÑ Ð½Ð° Ð¸Ð·Ð²ÐµÑÑ‚Ð½Ñ‹Ñ… Ñ€Ñ‹Ð½ÐºÐ°Ñ…</div>'}</div>
        ${renderRelatedArticlesSection(entity.relatedArticleIds)}
      `;
    }

    if (type === 'flora') {
      const planets = Object.values(PLANETS).filter(planet => isEntityVisible(planet) && (planet.floraIds || []).includes(entity.id));
      target.innerHTML = `
        <div class="wiki-hero">
          ${renderThumb(entity, { size: 'hero', type: 'flora', glyph: initials(entity.name, 'â€') })}
          <div>
            <div class="section-title">Ð¤Ð»Ð¾Ñ€Ð°</div>
            <h2 class="mono accent">${esc(entity.name)}</h2>
            <div class="subtle">${esc(entity.habitat || '')}</div>
            <p>${esc(entity.summary || 'ÐÐµÑ‚ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ñ')}</p>
          </div>
        </div>
        <div class="data-row"><span class="data-label">ÐžÐ¿Ð°ÑÐ½Ð¾ÑÑ‚ÑŒ</span><span class="data-value">${esc(entity.danger || '')}</span></div>
        <div class="data-row"><span class="data-label">ÐŸÑ€Ð¸Ð¼ÐµÐ½ÐµÐ½Ð¸Ðµ</span><span class="data-value">${esc(entity.use || '')}</span></div>
        <div class="section-title" style="margin-top:18px">Ð“Ð´Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾</div>
        <div class="result-stack">${planets.map(planet => renderEntityButton('planet', planet, { subtitle: planet.location?.system || '', thumbSize: 'sm' })).join('') || '<div class="small-note">Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ñ… Ð¿Ð»Ð°Ð½ÐµÑ‚ Ð½ÐµÑ‚</div>'}</div>
        ${renderRelatedArticlesSection(entity.relatedArticleIds)}
      `;
    }

    if (type === 'fauna') {
      const planets = Object.values(PLANETS).filter(planet => isEntityVisible(planet) && (planet.faunaIds || []).includes(entity.id));
      target.innerHTML = `
        <div class="wiki-hero">
          ${renderThumb(entity, { size: 'hero', type: 'fauna', glyph: initials(entity.name, 'â—ˆ') })}
          <div>
            <div class="section-title">Ð¤Ð°ÑƒÐ½Ð°</div>
            <h2 class="mono accent">${esc(entity.name)}</h2>
            <div class="subtle">${esc(entity.habitat || '')}</div>
            <p>${esc(entity.summary || 'ÐÐµÑ‚ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ñ')}</p>
          </div>
        </div>
        <div class="data-row"><span class="data-label">ÐžÐ¿Ð°ÑÐ½Ð¾ÑÑ‚ÑŒ</span><span class="data-value">${esc(entity.danger || '')}</span></div>
        <div class="data-row"><span class="data-label">ÐŸÐ¾Ð²ÐµÐ´ÐµÐ½Ð¸Ðµ</span><span class="data-value">${esc(entity.behavior || '')}</span></div>
        <div class="section-title" style="margin-top:18px">Ð“Ð´Ðµ Ð·Ð°Ð¼ÐµÑ‡ÐµÐ½Ð¾</div>
        <div class="result-stack">${planets.map(planet => renderEntityButton('planet', planet, { subtitle: planet.location?.system || '', thumbSize: 'sm' })).join('') || '<div class="small-note">Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ñ… Ð¿Ð»Ð°Ð½ÐµÑ‚ Ð½ÐµÑ‚</div>'}</div>
        ${renderRelatedArticlesSection(entity.relatedArticleIds)}
      `;
    }

    if (type === 'article') {
      target.innerHTML = `
        <div class="wiki-hero">
          ${renderThumb(entity, { size: 'hero', type: 'article', glyph: initials(entity.name, 'âœ¶') })}
          <div>
            <div class="section-title">Ð¡Ñ‚Ð°Ñ‚ÑŒÑ Ð°Ñ€Ñ…Ð¸Ð²Ð°</div>
            <h2 class="mono accent">${esc(entity.name || entity.id)}</h2>
            <div class="subtle">${esc(entity.category || 'ÐÑ€Ñ…Ð¸Ð²')}</div>
            <p>${esc(entity.summary || 'ÐÐµÑ‚ ÐºÑ€Ð°Ñ‚ÐºÐ¾Ð³Ð¾ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ñ')}</p>
          </div>
        </div>
        <div class="card pad18"><div class="article-body">${esc(entity.body || 'Ð¢ÐµÐºÑÑ‚ ÑÑ‚Ð°Ñ‚ÑŒÐ¸ Ð¿Ð¾ÐºÐ° Ð¿ÑƒÑÑ‚.')}</div></div>
        ${renderRelatedArticlesSection(entity.relatedArticleIds, 'Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸')}
        ${(entity.relatedPlanetIds || []).length ? `<div class="section-title" style="margin-top:18px">Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹</div><div class="result-stack">${filterVisibleIds(entity.relatedPlanetIds, Data.getPlanet).map(id => Data.getPlanet(id)).filter(Boolean).map(planet => renderEntityButton('planet', planet, { subtitle: planet.code || planet.location?.system || '', thumbSize: 'sm' })).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð¿Ð»Ð°Ð½ÐµÑ‚</div>'}</div>` : ''}
        ${(entity.relatedNpcIds || []).length ? `<div class="section-title" style="margin-top:18px">Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ NPC</div><div class="result-stack">${filterVisibleIds(entity.relatedNpcIds, Data.getNpc).map(id => Data.getNpc(id)).filter(Boolean).map(npc => renderEntityButton('npc', npc, { subtitle: npc.role || npc.location || '', thumbSize: 'sm' })).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… NPC</div>'}</div>` : ''}
        ${(entity.relatedItemIds || []).length ? `<div class="section-title" style="margin-top:18px">Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ñ‹</div><div class="result-stack">${filterVisibleIds(entity.relatedItemIds, Data.getItem).map(id => Data.getItem(id)).filter(Boolean).map(item => renderEntityButton('item', item, { subtitle: item.type || item.rarity || '', thumbSize: 'sm' })).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ð¾Ð²</div>'}</div>` : ''}
        ${(entity.relatedFloraIds || []).length ? `<div class="section-title" style="margin-top:18px">Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ð°Ñ Ñ„Ð»Ð¾Ñ€Ð°</div><div class="result-stack">${filterVisibleIds(entity.relatedFloraIds, Data.getFlora).map(id => Data.getFlora(id)).filter(Boolean).map(flora => renderEntityButton('flora', flora, { subtitle: flora.habitat || '', thumbSize: 'sm' })).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾Ð¹ Ñ„Ð»Ð¾Ñ€Ñ‹</div>'}</div>` : ''}
        ${(entity.relatedFaunaIds || []).length ? `<div class="section-title" style="margin-top:18px">Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ð°Ñ Ñ„Ð°ÑƒÐ½Ð°</div><div class="result-stack">${filterVisibleIds(entity.relatedFaunaIds, Data.getFauna).map(id => Data.getFauna(id)).filter(Boolean).map(fauna => renderEntityButton('fauna', fauna, { subtitle: fauna.habitat || '', thumbSize: 'sm' })).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾Ð¹ Ñ„Ð°ÑƒÐ½Ñ‹</div>'}</div>` : ''}
      `;
    }

    UI.attachEntityLinks(target);
    ChatUI.bindWithin(target);
    target.querySelector('#wiki-use-item-btn')?.addEventListener('click', () => Tooling.openForItem(id));
  }
};

const GM = {
  selectedUserId: 'u1',
  render() {
    const players = Object.values(App.state.users);
    if (!players.find(player => player.id === this.selectedUserId)) this.selectedUserId = players[0]?.id || 'u1';
    const active = players.find(player => player.id === this.selectedUserId);
    $('#gm-content').innerHTML = `
      <div class="gm-grid">
        <div class="card gm-pane">
          <div class="section-title">Ð˜Ð³Ñ€Ð¾ÐºÐ¸</div>
          <div class="result-stack">
            ${players.map(player => `<div class="player-chip ${player.id === this.selectedUserId ? 'active' : ''}" data-id="${player.id}">${renderThumb(player, { size: 'xs', type: 'player', glyph: player.avatarGlyph || initials(player.displayName) })}<div><b>${esc(player.displayName)}</b><div class="subtle" style="margin-top:4px">${esc(player.rank)} Â· ${formatCredits(player.credits)}</div></div></div>`).join('')}
          </div>
        </div>
        <div class="card gm-pane">${this.renderEditor(active)}</div>
      </div>
    `;

    $('#gm-content').querySelectorAll('.player-chip').forEach(node => {
      node.addEventListener('click', () => {
        this.selectedUserId = node.dataset.id;
        this.render();
      });
    });

    $('#gm-editor-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const user = App.state.users[this.selectedUserId];
      user.displayName = String(formData.get('displayName') || user.displayName).trim() || user.displayName;
      user.rank = String(formData.get('rank') || user.rank).trim() || user.rank;
      user.pass = String(formData.get('pass') || user.pass).trim() || user.pass;
      user.credits = Number(formData.get('credits') || user.credits);
      user.lore = String(formData.get('lore') || user.lore).trim();
      user.notes = String(formData.get('notes') || user.notes).trim();
      user.stats.hp = Number(formData.get('hp') || user.stats.hp);
      user.stats.shield = Number(formData.get('shield') || user.stats.shield);
      user.stats.bio = Number(formData.get('bio') || user.stats.bio);
      user.abilities.str = Number(formData.get('str') || user.abilities.str);
      user.abilities.dex = Number(formData.get('dex') || user.abilities.dex);
      user.abilities.con = Number(formData.get('con') || user.abilities.con);
      user.abilities.int = Number(formData.get('int') || user.abilities.int);
      user.abilities.wis = Number(formData.get('wis') || user.abilities.wis);
      user.abilities.cha = Number(formData.get('cha') || user.abilities.cha);
      user.equipmentSlots.weapon = String(formData.get('weapon') || user.equipmentSlots.weapon);
      user.equipmentSlots.armor = String(formData.get('armor') || user.equipmentSlots.armor);
      user.inventory = parseInventoryEditor(String(formData.get('inventory') || ''));
      user.social.orgs = String(formData.get('orgs') || '').split('\n').map(v => v.trim()).filter(Boolean);
      user.social.npcIds = String(formData.get('npcIds') || '').split('\n').map(v => v.trim()).filter(Boolean);
      await App.saveState(`GM Ð¾Ð±Ð½Ð¾Ð²Ð¸Ð» Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÑŒ ${user.displayName}`);
      this.render();
    });
  },
  renderEditor(user) {
    if (!user) return '<div class="subtle">ÐÐµÑ‚ Ð¿Ð¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ñ‚ÐµÐ»Ñ</div>';
    const inventoryTextRaw = user.inventory.map(entry => `${entry.itemId}:${entry.qty}`).join('\n');
    const orgsText = user.social.orgs.join('\n');
    const npcsText = user.social.npcIds.join('\n');
    const visiblePlanets = Object.values(Data.planets).filter(planet => isEntityVisible(planet, user));
    return `
      <form id="gm-editor-form" class="form">
        <div class="section-title">Ð ÐµÐ´Ð°ÐºÑ‚Ð¾Ñ€ Ð¿Ñ€Ð¾Ñ„Ð¸Ð»Ñ</div>
        <div class="gm-profile-head">
          ${renderThumb(user, { size: 'lg', type: 'player', glyph: user.avatarGlyph || initials(user.displayName) })}
          <div class="small-note">Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ, Ð·Ð½Ð°Ð½Ð¸Ñ Ð¼Ð¸Ñ€Ð°, Ñ€Ñ‹Ð½ÐºÐ¸ Ð¸ Ð´Ð¾ÑÑ‚ÑƒÐ¿ Ðº ÑÐ½Ñ†Ð¸ÐºÐ»Ð¾Ð¿ÐµÐ´Ð¸Ð¸ Ð½Ð°ÑÑ‚Ñ€Ð°Ð¸Ð²Ð°ÑŽÑ‚ÑÑ Ñ‡ÐµÑ€ÐµÐ· <b>WORLD_CONFIG</b>.</div>
        </div>
        <div class="cols2">
          <div class="field"><label>Ð˜Ð¼Ñ</label><input class="input" name="displayName" value="${esc(user.displayName)}" /></div>
          <div class="field"><label>Ð Ð°Ð½Ð³</label><input class="input" name="rank" value="${esc(user.rank)}" /></div>
        </div>
        <div class="cols2">
          <div class="field"><label>ÐŸÐ°Ñ€Ð¾Ð»ÑŒ</label><input class="input" name="pass" value="${esc(user.pass)}" /></div>
          <div class="field"><label>ÐšÑ€ÐµÐ´Ð¸Ñ‚Ñ‹</label><input class="input" type="number" name="credits" value="${user.credits}" /></div>
        </div>
        <div class="cols3">
          <div class="field"><label>HP</label><input class="input" type="number" name="hp" value="${user.stats.hp}" /></div>
          <div class="field"><label>Shield</label><input class="input" type="number" name="shield" value="${user.stats.shield}" /></div>
          <div class="field"><label>Bio</label><input class="input" type="number" name="bio" value="${user.stats.bio}" /></div>
        </div>
        <div class="cols3">
          <div class="field"><label>STR</label><input class="input" type="number" name="str" value="${user.abilities.str}" /></div>
          <div class="field"><label>DEX</label><input class="input" type="number" name="dex" value="${user.abilities.dex}" /></div>
          <div class="field"><label>CON</label><input class="input" type="number" name="con" value="${user.abilities.con}" /></div>
          <div class="field"><label>INT</label><input class="input" type="number" name="int" value="${user.abilities.int}" /></div>
          <div class="field"><label>WIS</label><input class="input" type="number" name="wis" value="${user.abilities.wis}" /></div>
          <div class="field"><label>CHA</label><input class="input" type="number" name="cha" value="${user.abilities.cha}" /></div>
        </div>
        <div class="cols2">
          <div class="field">
            <label>ÐžÑ€ÑƒÐ¶Ð¸Ðµ</label>
            <select class="select" name="weapon">${WEAPON_OPTIONS.map(option => `<option value="${option.id}" ${option.id === user.equipmentSlots.weapon ? 'selected' : ''}>${esc(option.name)}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Ð‘Ñ€Ð¾Ð½Ñ</label>
            <select class="select" name="armor">${ARMOR_OPTIONS.map(option => `<option value="${option.id}" ${option.id === user.equipmentSlots.armor ? 'selected' : ''}>${esc(option.name)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field"><label>Ð›Ð¾Ñ€</label><textarea class="area" name="lore">${esc(user.lore)}</textarea></div>
        <div class="field"><label>Ð—Ð°Ð¼ÐµÑ‚ÐºÐ¸</label><textarea class="area" name="notes">${esc(user.notes)}</textarea></div>
        <div class="field"><label>Ð˜Ð½Ð²ÐµÐ½Ñ‚Ð°Ñ€ÑŒ (itemId:qty, Ð¿Ð¾ Ð¾Ð´Ð½Ð¾Ð¼Ñƒ Ð½Ð° ÑÑ‚Ñ€Ð¾ÐºÑƒ)</label><textarea class="area inv-editor" name="inventory">${esc(inventoryTextRaw)}</textarea></div>
        <div class="field"><label>NPC id (Ð¿Ð¾ Ð¾Ð´Ð½Ð¾Ð¼Ñƒ Ð½Ð° ÑÑ‚Ñ€Ð¾ÐºÑƒ)</label><textarea class="area inv-editor" name="npcIds">${esc(npcsText)}</textarea></div>
        <div class="field"><label>ÐžÑ€Ð³Ð°Ð½Ð¸Ð·Ð°Ñ†Ð¸Ð¸ (Ð¿Ð¾ Ð¾Ð´Ð½Ð¾Ð¹ Ð½Ð° ÑÑ‚Ñ€Ð¾ÐºÑƒ)</label><textarea class="area" name="orgs">${esc(orgsText)}</textarea></div>
        <div class="small-note">Ð˜Ð³Ñ€Ð¾Ðº ÑÐµÐ¹Ñ‡Ð°Ñ Ð²Ð¸Ð´Ð¸Ñ‚ ${visiblePlanets.length} Ð¿Ð»Ð°Ð½ÐµÑ‚(Ñ‹) Ñ‡ÐµÑ€ÐµÐ· ÑÐ¸ÑÑ‚ÐµÐ¼Ñƒ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð°.</div>
        <button class="primary" type="submit">Ð¡ÐžÐ¥Ð ÐÐÐ˜Ð¢Ð¬ Ð˜Ð—ÐœÐ•ÐÐ•ÐÐ˜Ð¯</button>
      </form>
    `;
  },
  async restoreDefaults() {
    App.state = makeDefaultState();
    await App.saveState('Ð”Ð°Ð½Ð½Ñ‹Ðµ Ð²Ð¾ÑÑÑ‚Ð°Ð½Ð¾Ð²Ð»ÐµÐ½Ñ‹ Ð¸Ð· ÑˆÐ°Ð±Ð»Ð¾Ð½Ð¾Ð²');
    this.render();
  }
};


const CONFIG_SEARCH_FIELD_LABELS_V1061 = Object.freeze({
  id: 'ID', name: 'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ', title: 'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ', displayName: 'Ð˜Ð¼Ñ', shortName: 'ÐšÐ¾Ñ€Ð¾Ñ‚ÐºÐ¾Ðµ Ð¸Ð¼Ñ',
  markerLabel: 'ÐœÐµÑ‚ÐºÐ°', mapLabel: 'ÐœÐµÑ‚ÐºÐ°', code: 'ÐšÐ¾Ð´', summary: 'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ', desc: 'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ',
  category: 'ÐšÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ñ', role: 'Ð Ð¾Ð»ÑŒ', habitat: 'Ð¡Ñ€ÐµÐ´Ð°', location: 'Ð›Ð¾ÐºÐ°Ñ†Ð¸Ñ',
  'location.arm': 'Ð ÑƒÐºÐ°Ð²', 'location.node': 'Ð£Ð·ÐµÐ»', 'location.system': 'Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð°', 'location.obj': 'ÐžÐ±ÑŠÐµÐºÑ‚',
  'physics.type': 'Ð¢Ð¸Ð¿', 'physics.mass': 'ÐœÐ°ÑÑÐ°', 'physics.radius': 'Ð Ð°Ð´Ð¸ÑƒÑ', 'physics.gravity': 'Ð“Ñ€Ð°Ð²Ð¸Ñ‚Ð°Ñ†Ð¸Ñ',
  'physics.climate': 'ÐšÐ»Ð¸Ð¼Ð°Ñ‚', 'physics.temp': 'Ð¢ÐµÐ¼Ð¿ÐµÑ€Ð°Ñ‚ÑƒÑ€Ð°', 'physics.atm': 'ÐÑ‚Ð¼Ð¾ÑÑ„ÐµÑ€Ð°',
  'socio.pop': 'ÐÐ°ÑÐµÐ»ÐµÐ½Ð¸Ðµ', 'socio.capital': 'Ð¡Ñ‚Ð¾Ð»Ð¸Ñ†Ð°', 'socio.gov': 'ÐŸÑ€Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ', 'socio.law': 'Ð ÐµÐ¶Ð¸Ð¼',
  'pilot.reference': 'Ð¡Ð¿Ñ€Ð°Ð²ÐºÐ°', 'pilot.info': 'Ð˜Ð½Ñ„Ð¾Ñ€Ð¼Ð°Ñ†Ð¸Ñ', 'pilot.warning': 'ÐŸÑ€ÐµÐ´ÑƒÐ¿Ñ€ÐµÐ¶Ð´ÐµÐ½Ð¸Ðµ'
});

function configEntityPrimaryNameV1061(item, type) {
  if (!item) return '';
  if (type === 'systems') return item.name || getSystemLabel(item) || item.id;
  if (type === 'players') return item.displayName || item.shortName || item.name || item.id;
  if (type === 'articles') return item.title || item.name || item.displayName || item.id;
  return item.displayName || item.title || item.name || item.label || item.mapLabel || item.id;
}

function configSearchEntriesV1061(value, prefix = '', depth = 0, out = []) {
  if (depth > 4 || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (entry == null) return;
      if (typeof entry === 'string' || typeof entry === 'number') out.push({ path: prefix, value: String(entry) });
      else if (typeof entry === 'object') configSearchEntriesV1061(entry, prefix ? `${prefix}.${index}` : String(index), depth + 1, out);
    });
    return out;
  }
  if (typeof value !== 'object') {
    if (prefix) out.push({ path: prefix, value: String(value) });
    return out;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (['image','imageLocal','body','visibility','relatedArticleIds','market','routes','tokens','markers','fog'].includes(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry == null) continue;
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') out.push({ path, value: String(entry) });
    else configSearchEntriesV1061(entry, path, depth + 1, out);
  }
  return out;
}

function configSearchMatchV1061(item, type, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { matched: true, path: '', value: '', score: 0 };
  const genericValues = new Set(['planet','Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°','planets','Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹','system','ÑÐ¸ÑÑ‚ÐµÐ¼Ð°','systems','ÑÐ¸ÑÑ‚ÐµÐ¼Ñ‹','article','ÑÑ‚Ð°Ñ‚ÑŒÑ','articles','ÑÑ‚Ð°Ñ‚ÑŒÐ¸','equipment','ÑÐ½Ð°Ñ€ÑÐ¶ÐµÐ½Ð¸Ðµ','item','Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚','region','Ñ€ÐµÐ³Ð¸Ð¾Ð½','city','Ð³Ð¾Ñ€Ð¾Ð´']);
  const entries = configSearchEntriesV1061(item);
  if (type === 'systems') entries.push({ path: 'markerLabel', value: getSystemLabel(item) });
  const canonicalPaths = new Set(['name','title','displayName','shortName','markerLabel','label']);
  const candidates = [];
  for (const entry of entries) {
    const value = String(entry.value || '').trim();
    if (!value || !value.toLowerCase().includes(q)) continue;
    const lastKey = String(entry.path || '').split('.').pop();
    const lowerValue = value.toLowerCase();
    const genericField = ['category','type','mapLabel','locationType'].includes(lastKey);
    if (genericField && genericValues.has(lowerValue)) continue;
    let score = canonicalPaths.has(entry.path) ? 0 : entry.path === 'id' ? 2 : 1;
    if (/description|summary|desc|reference|info|warning/i.test(entry.path)) score += 2;
    candidates.push({ ...entry, score });
  }
  candidates.sort((a, b) => a.score - b.score || a.value.length - b.value.length);
  const best = candidates[0];
  return best ? { matched: true, ...best } : { matched: false, path: '', value: '', score: 99 };
}

function configSearchFieldLabelV1061(path = '') {
  if (CONFIG_SEARCH_FIELD_LABELS_V1061[path]) return CONFIG_SEARCH_FIELD_LABELS_V1061[path];
  const clean = String(path || '').split('.').filter(part => !/^\d+$/.test(part)).pop() || 'ÐÑ‚Ñ€Ð¸Ð±ÑƒÑ‚';
  return clean.replace(/([a-zÐ°-Ñ])([A-ZÐ-Ð¯])/g, '$1 $2');
}

const Configurator = {
  selectedType: 'planets',
  selectedId: null,
  searchQuery: '',
  getItems(type) {
    if (type === 'players') return sortEntitiesForList(Object.values(App.state?.users || PLAYER_TEMPLATES));
    if (type === 'systems') return sortEntitiesForList(SYSTEMS);
    if (type === 'planets') return sortEntitiesForList(Object.values(PLANETS));
    if (type === 'npcs') return sortEntitiesForList(Object.values(NPCS));
    if (type === 'equipment') return sortEntitiesForList(Object.values(EQUIPMENT));
    if (type === 'flora') return sortEntitiesForList(Object.values(FLORA));
    if (type === 'fauna') return sortEntitiesForList(Object.values(FAUNA));
    if (type === 'articles') return sortEntitiesForList(Object.values(ARTICLES));
    return [];
  },
  getSelectedEntity() {
    return this.getItems(this.selectedType).find(item => item.id === this.selectedId) || null;
  },
  renderReportsPanel() {
    const reports = (App.state?.gmReports?.items || []).slice(0, 12);
    return `
      <div class="card pad18 config-report-card">
        <div class="row" style="justify-content:space-between;align-items:center;gap:12px">
          <div>
            <div class="section-title">Ð–ÑƒÑ€Ð½Ð°Ð» Ð”ÐœÐ°</div>
            <div class="small-note">Ð¡ÑŽÐ´Ð° Ð¿Ð°Ð´Ð°ÑŽÑ‚ Ñ€ÐµÐ·ÑƒÐ»ÑŒÑ‚Ð°Ñ‚Ñ‹ Ð¼Ð¸Ð½Ð¸-Ð¸Ð³Ñ€ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ð¾Ð² Ð¸ Ð´Ñ€ÑƒÐ³Ð¸Ðµ Ñ‚ÐµÑ…. Ð¾Ñ‚Ñ‡Ñ‘Ñ‚Ñ‹.</div>
          </div>
          <button id="config-clear-reports-btn" class="ghost" type="button">CLEAR_REPORTS</button>
        </div>
        <div class="result-stack report-stack" style="margin-top:12px">
          ${reports.length ? reports.map(report => `<div class="report-card ${report.success ? 'ok' : 'warn'}"><div class="report-top"><b>${esc(report.title || 'ÐžÑ‚Ñ‡Ñ‘Ñ‚')}</b><span>${esc(formatLoreDateV1075(report.createdAt || Date.now()))}</span></div><div class="small-note" style="margin:6px 0 8px">${esc(report.playerName || getPlayerDisplayName(report.playerId))} Â· ${esc(report.itemName || report.itemId || report.category || 'tool')}</div><div>${esc(report.text || '')}</div>${report.details ? `<div class="small-note" style="margin-top:8px">${esc(report.details)}</div>` : ''}</div>`).join('') : '<div class="small-note">Ð–ÑƒÑ€Ð½Ð°Ð» Ð¿Ð¾ÐºÐ° Ð¿ÑƒÑÑ‚.</div>'}
        </div>
      </div>
    `;
  },
  render() {
    const root = $('#config-content');
    if (!root) return;
    const previousRootScroll = root.scrollTop;
    const previousSideScroll = root.querySelector('.config-side')?.scrollTop || 0;
    const previousListScroll = root.querySelector('.config-entity-list')?.scrollTop || 0;
    const types = Object.entries(WORLD_SECTIONS);
    const rawItems = this.getItems(this.selectedType);
    const search = String(this.searchQuery || '').trim().toLowerCase();
    const matchesSearch = item => configSearchMatchV1061(item, this.selectedType, search).matched;
    const items = rawItems.filter(matchesSearch);
    if (this.selectedId && !items.some(item => item.id === this.selectedId)) this.selectedId = items[0]?.id || null;
    if (!items.length) this.selectedId = null;
    if (!this.selectedId && items.length) this.selectedId = items[0].id;
    const selected = this.getSelectedEntity();

    root.innerHTML = `
      ${App.currentUser?.role === 'gm' ? this.renderReportsPanel() : ''}
      <div class="config-grid">
        <div class="card config-side">
          <div class="section-title">ÐšÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¸</div>
          <div class="config-type-list">
            ${types.map(([key, meta]) => `<button class="secondary config-type-btn ${key === this.selectedType ? 'active' : ''}" data-type="${key}">${esc(meta.label)}</button>`).join('')}
          </div>
          <div class="section-title" style="margin-top:18px">Ð­Ð»ÐµÐ¼ÐµÐ½Ñ‚Ñ‹</div>
          <div class="row" style="margin-bottom:12px;justify-content:space-between">
            <div class="small-note">${esc(WORLD_SECTIONS[this.selectedType].label)}</div>
            <button id="config-add-btn" class="secondary">ADD_NEW</button>
          </div>
          <div class="field" style="margin-bottom:12px">
            <input id="config-search-input" class="input" value="${esc(this.searchQuery || '')}" placeholder="ÐŸÐ¾Ð¸ÑÐº Ð¿Ð¾ ID, Ð½Ð°Ð·Ð²Ð°Ð½Ð¸ÑŽ, Ð¼ÐµÑ‚ÐºÐµ..." />
          </div>
          <div class="result-stack config-entity-list">
            ${items.length ? items.map(item => {
              const primary = configEntityPrimaryNameV1061(item, this.selectedType);
              const match = configSearchMatchV1061(item, this.selectedType, search);
              const matchedAttribute = search && match.matched && !['name','title','displayName','shortName','markerLabel','label','id'].includes(match.path)
                ? `${configSearchFieldLabelV1061(match.path)}: ${match.value}`
                : '';
              const secondary = matchedAttribute || (this.selectedType === 'systems'
                ? [getSystemLabel(item) && getSystemLabel(item) !== item.name ? getSystemLabel(item) : '', item.id].filter(Boolean).join(' Â· ')
                : item.id);
              return `<div class="player-chip config-chip ${item.id === this.selectedId ? 'active' : ''}" data-config-id="${esc(item.id)}">${renderThumb(item, { size: 'xs', type: this.selectedType === 'equipment' ? 'item' : this.selectedType.slice(0,-1), glyph: item.avatarGlyph || initials(primary || item.id) })}<div><b>${esc(primary)}</b><div class="subtle" style="margin-top:4px">${esc(secondary)}</div></div></div>`;
            }).join('') : `<div class="subtle">${search ? 'ÐÐ¸Ñ‡ÐµÐ³Ð¾ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾' : 'Ð¡Ð¿Ð¸ÑÐ¾Ðº Ð¿ÑƒÑÑ‚'}</div>`}
          </div>
        </div>
        <div class="card gm-pane config-main">
          ${selected ? this.renderEditor(selected) : '<div class="subtle">Ð’Ñ‹Ð±ÐµÑ€Ð¸Ñ‚Ðµ Ð¸Ð»Ð¸ ÑÐ¾Ð·Ð´Ð°Ð¹Ñ‚Ðµ ÑÑƒÑ‰Ð½Ð¾ÑÑ‚ÑŒ.</div>'}
        </div>
      </div>
    `;
    root.scrollTop = previousRootScroll;
    const nextSide = root.querySelector('.config-side');
    const nextList = root.querySelector('.config-entity-list');
    if (nextSide) nextSide.scrollTop = previousSideScroll;
    if (nextList) nextList.scrollTop = previousListScroll;

    root.querySelectorAll('[data-type]').forEach(node => {
      node.addEventListener('click', () => {
        this.selectedType = node.dataset.type;
        this.selectedId = null;
        this.render();
      });
    });

    root.querySelectorAll('[data-config-id]').forEach(node => {
      node.addEventListener('click', () => {
        this.selectedId = node.dataset.configId;
        this.render();
      });
    });

    $('#config-search-input')?.addEventListener('input', event => {
      const field = event.currentTarget;
      const value = renderFocusableInputValue(field.value);
      const start = field.selectionStart;
      const end = field.selectionEnd;
      this.searchQuery = value;
      this.render();
      restoreInputSelection('#config-search-input', value, start, end);
    });

    $('#config-add-btn')?.addEventListener('click', () => this.createNew());
    $('#config-clear-reports-btn')?.addEventListener('click', async () => {
      App.state.gmReports = { items: [] };
      await App.saveState('Ð–ÑƒÑ€Ð½Ð°Ð» Ð”ÐœÐ° Ð¾Ñ‡Ð¸Ñ‰ÐµÐ½');
      this.render();
    });
    $('#config-delete-btn')?.addEventListener('click', () => this.deleteSelected());
    $('#config-duplicate-btn')?.addEventListener('click', () => this.duplicateSelected());
    const configForm = $('#config-editor-form');
    if (configForm) {
      const currentEntity = this.getSelectedEntity();
      FormDrafts.bind(configForm, FormDrafts.configKey(this.selectedType, currentEntity?.id || this.selectedId || 'new'));
    }
    configForm?.addEventListener('submit', event => this.submit(event));
    configForm?.querySelectorAll('[type="submit"]').forEach(button => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', event => {
        event.preventDefault();
        configForm.requestSubmit();
      });
    });
    bindImageInputs(root);
    bindDynamicRowEditor(root);
    bindFilterableSelectors(root);
    bindTypeaheadFields(root);
    bindSearchableSelects(root);
  },
  renderHeader(entity, description) {
    return `
      <div class="row" style="justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px">
        <div>
          <div class="section-title">ÐšÐ¾Ð½Ñ„Ð¸Ð³ÑƒÑ€Ð°Ñ‚Ð¾Ñ€ Ð¼Ð¸Ñ€Ð°</div>
          <h2 style="margin:0 0 6px">${esc(entity.name || entity.displayName || entity.id)}</h2>
          <div class="small-note">${description}</div>
        </div>
        <div class="row config-actions">
          <button id="config-duplicate-btn" type="button" class="secondary">DUPLICATE</button>
          <button id="config-delete-btn" type="button" class="ghost">DELETE</button>
        </div>
      </div>
    `;
  },
  renderVisibilityField(entity) {
    return `
      <div class="field">
        <label>Ð”Ð¾ÑÑ‚ÑƒÐ¿ Ð¸Ð³Ñ€Ð¾ÐºÐ°Ð¼</label>
        ${renderCheckboxSelector('visibilityPlayerIds', playerEntities(false), entityVisibilityIds(entity), 'player', 'ÐÐµÑ‚ Ð¸Ð³Ñ€Ð¾ÐºÐ¾Ð²')}
        <div class="small-note">Ð•ÑÐ»Ð¸ Ð½Ð¸Ñ‡ÐµÐ³Ð¾ Ð½Ðµ Ð¾Ñ‚Ð¼ÐµÑ‡ÐµÐ½Ð¾ â€” ÑÐ»ÐµÐ¼ÐµÐ½Ñ‚ Ð²Ð¸Ð´ÐµÐ½ Ð²ÑÐµÐ¼ Ð¸Ð³Ñ€Ð¾ÐºÐ°Ð¼. GM Ð²Ð¸Ð´Ð¸Ñ‚ Ð²ÑÑ‘ Ð²ÑÐµÐ³Ð´Ð°.</div>
      </div>
    `;
  },
  renderPlayerEditor(user) {
    return `
      <form id="config-editor-form" class="form" data-entity-type="players">
        ${this.renderHeader(user, 'Ð¨Ð°Ð±Ð»Ð¾Ð½ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð° Ñ Ð¸Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸ÐµÐ¼, Ð¸Ð½Ð²ÐµÐ½Ñ‚Ð°Ñ€Ñ‘Ð¼ Ð¸ ÐºÐ¾Ð½Ñ‚Ð°ÐºÑ‚Ð°Ð¼Ð¸. ÐŸÑ€Ð¸ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ð¸ Ð¾Ð±Ð½Ð¾Ð²Ð»ÑÐµÑ‚ÑÑ players.json Ð¸ Ð¶Ð¸Ð²Ð¾Ðµ ÑÐ¾ÑÑ‚Ð¾ÑÐ½Ð¸Ðµ Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÐµÐ¹.')}
        ${imageFieldMarkup(user, 'ÐŸÐ¾Ñ€Ñ‚Ñ€ÐµÑ‚ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°')}
        <div class="cols3">
          <div class="field"><label>ID</label><input class="input" name="id" value="${esc(user.id)}" /></div>
          <div class="field"><label>ÐšÐ¾Ñ€Ð¾Ñ‚ÐºÐ¾Ðµ Ð¸Ð¼Ñ</label><input class="input" name="shortName" value="${esc(user.shortName || '')}" /></div>
          <div class="field"><label>Ð Ð¾Ð»ÑŒ</label><select class="select" name="role"><option value="player" ${user.role === 'player' ? 'selected' : ''}>player</option><option value="gm" ${user.role === 'gm' ? 'selected' : ''}>gm</option></select></div>
        </div>
        <div class="cols3">
          <div class="field"><label>ÐžÑ‚Ð¾Ð±Ñ€Ð°Ð¶Ð°ÐµÐ¼Ð¾Ðµ Ð¸Ð¼Ñ</label><input class="input" name="displayName" value="${esc(user.displayName)}" /></div>
          <div class="field"><label>Ð Ð°Ð½Ð³</label><input class="input" name="rank" value="${esc(user.rank || '')}" /></div>
          <div class="field"><label>Ð“Ð»Ð¸Ñ„</label><input class="input" name="avatarGlyph" value="${esc(user.avatarGlyph || '')}" /></div>
        </div>
        <div class="cols3">
          <div class="field"><label>ÐŸÐ°Ñ€Ð¾Ð»ÑŒ</label><input class="input" name="pass" value="${esc(user.pass || '')}" /></div>
          <div class="field"><label>ÐšÑ€ÐµÐ´Ð¸Ñ‚Ñ‹</label><input class="input" type="number" name="credits" value="${Number(user.credits || 0)}" /></div>
          <div class="field"><label>Ð¢ÐµÐºÑƒÑ‰Ð°Ñ Ð¿Ð»Ð°Ð½ÐµÑ‚Ð°</label><select class="select" name="currentPlanetId"><option value="">ÐÐµ Ð·Ð°Ð´Ð°Ð½Ð°</option>${Object.values(PLANETS).map(option => `<option value="${option.id}" ${option.id === (user.currentPlanetId || '') ? 'selected' : ''}>${esc(option.name)}</option>`).join('')}</select><div class="small-note">ÐŸÐ¾Ð´ÑÐ²ÐµÑ‚ÐºÐ° ÑÑ‚Ð¾Ð¹ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹ Ð¿Ð¾ÑÐ²Ð¸Ñ‚ÑÑ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ Ð¸ Ð² Ð¿Ñ€Ð¾Ñ„Ð¸Ð»Ðµ Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°.</div></div>
        </div>
        <div class="cols3">
          <div class="field"><label>HP</label><input class="input" type="number" name="hp" value="${Number(user.stats?.hp || 0)}" /></div>
          <div class="field"><label>Shield</label><input class="input" type="number" name="shield" value="${Number(user.stats?.shield || 0)}" /></div>
          <div class="field"><label>Bio</label><input class="input" type="number" name="bio" value="${Number(user.stats?.bio || 0)}" /></div>
        </div>
        <div class="cols3">
          <div class="field"><label>STR</label><input class="input" type="number" name="str" value="${Number(user.abilities?.str || 0)}" /></div>
          <div class="field"><label>DEX</label><input class="input" type="number" name="dex" value="${Number(user.abilities?.dex || 0)}" /></div>
          <div class="field"><label>CON</label><input class="input" type="number" name="con" value="${Number(user.abilities?.con || 0)}" /></div>
          <div class="field"><label>INT</label><input class="input" type="number" name="int" value="${Number(user.abilities?.int || 0)}" /></div>
          <div class="field"><label>WIS</label><input class="input" type="number" name="wis" value="${Number(user.abilities?.wis || 0)}" /></div>
          <div class="field"><label>CHA</label><input class="input" type="number" name="cha" value="${Number(user.abilities?.cha || 0)}" /></div>
        </div>
        <div class="cols2">
          <div class="field"><label>ÐžÑ€ÑƒÐ¶Ð¸Ðµ</label><select class="select" name="weapon">${WEAPON_OPTIONS.map(option => `<option value="${option.id}" ${option.id === user.equipmentSlots?.weapon ? 'selected' : ''}>${esc(option.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Ð‘Ñ€Ð¾Ð½Ñ</label><select class="select" name="armor">${ARMOR_OPTIONS.map(option => `<option value="${option.id}" ${option.id === user.equipmentSlots?.armor ? 'selected' : ''}>${esc(option.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Ð›Ð¾Ñ€</label><textarea class="area" name="lore">${esc(user.lore || '')}</textarea></div>
        <div class="field"><label>Ð—Ð°Ð¼ÐµÑ‚ÐºÐ¸</label><textarea class="area" name="notes">${esc(user.notes || '')}</textarea></div>
        <div class="field"><label>Ð˜Ð½Ð²ÐµÐ½Ñ‚Ð°Ñ€ÑŒ</label><div id="inventory-rows" class="dynamic-list" data-kind="inventory">${renderInventoryRows(user.inventory)}</div><button id="add-inventory-row" class="secondary" type="button">ADD_INVENTORY_ITEM</button></div>
        <div class="field"><label>Ð˜Ð¼Ð¿Ð»Ð°Ð½Ñ‚Ñ‹ (name|status)</label><textarea class="area inv-editor" name="implants">${esc(implantsText(user.implants))}</textarea></div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ NPC</label>${renderCheckboxSelector('npcIds', Object.values(NPCS), user.social?.npcIds || [], 'npc', 'ÐÐµÑ‚ NPC')}</div>
        <div class="field"><label>ÐžÑ€Ð³Ð°Ð½Ð¸Ð·Ð°Ñ†Ð¸Ð¸</label><textarea class="area" name="orgs">${esc(listText(user.social?.orgs))}</textarea></div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸</label>${renderRelatedArticlesEditor(user.relatedArticleIds || [])}</div>
        <button class="primary" type="submit">SAVE_TEMPLATE</button>
      </form>
    `;
  },
  renderSystemEditor(system) {
    return `
      <form id="config-editor-form" class="form" data-entity-type="systems">
        ${this.renderHeader(system, 'Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð° ÑƒÐ¿Ñ€Ð°Ð²Ð»ÑÐµÑ‚ Ñ‚Ð¾Ñ‡ÐºÐ¾Ð¹ Ð½Ð° Ð³Ð°Ð»Ð°ÐºÑ‚Ð¸Ñ‡ÐµÑÐºÐ¾Ð¹ ÐºÐ°Ñ€Ñ‚Ðµ Ð¸ Ð½Ð°Ð±Ð¾Ñ€Ð¾Ð¼ Ð¿Ð»Ð°Ð½ÐµÑ‚ Ð²Ð½ÑƒÑ‚Ñ€Ð¸. ÐœÐ¾Ð¶Ð½Ð¾ Ð¾Ð³Ñ€Ð°Ð½Ð¸Ñ‡Ð¸Ñ‚ÑŒ Ð´Ð¾ÑÑ‚ÑƒÐ¿ Ð¿Ð¾ Ð¸Ð³Ñ€Ð¾ÐºÐ°Ð¼.')}
        ${imageFieldMarkup(system, 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ ÑÐ¸ÑÑ‚ÐµÐ¼Ñ‹')}
        <div class="cols2">
          <div class="field"><label>ID</label><input class="input" name="id" value="${esc(system.id)}" /></div>
          <div class="field"><label>Ð’Ð½ÑƒÑ‚Ñ€ÐµÐ½Ð½Ð¸Ð¹ ÐºÐ¾Ð´ Ñ‚Ð¾Ñ‡ÐºÐ¸</label><input class="input" value="${esc(system.id)}" disabled /></div>
        </div>
        <div class="cols4 cols-responsive-4">
          <div class="field"><label>Pos X (0..1)</label><input class="input" type="number" step="0.001" min="0" max="1" name="posX" value="${Number(system.pos?.x ?? 0.5)}" /></div>
          <div class="field"><label>Pos Y (0..1)</label><input class="input" type="number" step="0.001" min="0" max="1" name="posY" value="${Number(system.pos?.y ?? 0.5)}" /></div>
          <div class="field"><label>Ð¦Ð²ÐµÑ‚ ÑÐ¸ÑÑ‚ÐµÐ¼Ñ‹</label><input class="input" name="color" value="${esc(system.color || '#7df9ff')}" placeholder="#7df9ff" /></div>
          <div class="field"><label>Ð’Ð½ÐµÑˆÐ½Ð¸Ð¹ Ð²Ð¸Ð´ Ð¼ÐµÑ‚ÐºÐ¸</label><select class="select" name="markerStyle">${SYSTEM_MARKER_STYLES.map(option => `<option value="${option.id}" ${option.id === (system.markerStyle || 'orbital') ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select></div>
        </div>
        <div class="cols2">
          <div class="field"><label>ÐœÐµÑ‚ÐºÐ° Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ</label><input class="input" name="markerLabel" value="${esc(system.markerLabel || system.name || '')}" placeholder="Ð£Ð·ÐµÐ» ÐºÑ€Ð¸Ð²Ð¾Ð¿Ñ€Ð¾ÑÑ‚Ñ€Ð°Ð½ÑÑ‚Ð²Ð° / Ð¢Ð¾Ñ‡ÐºÐ° Ð¸Ð½Ñ‚ÐµÑ€ÐµÑÐ°" /></div>
          <div class="field"><label>Ð’Ð½ÑƒÑ‚Ñ€ÐµÐ½Ð½ÐµÐµ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ</label><input class="input" name="name" value="${esc(system.name || '')}" placeholder="Cassilia Binary" /></div>
        </div>
        <div class="field"><label>ÐŸÐ»Ð°Ð½ÐµÑ‚Ñ‹ Ð² ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ</label>${renderCheckboxSelector('planetIds', Object.values(PLANETS), system.planetIds || [], 'planet', 'ÐÐµÑ‚ Ð¿Ð»Ð°Ð½ÐµÑ‚')}</div>
        <div class="field"><label>ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚Ñ‹</label>${renderSystemRoutesEditor(system.routes || [], system.id)}</div>
        ${this.renderVisibilityField(system)}
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸</label>${renderRelatedArticlesEditor(system.relatedArticleIds || [])}</div>
        <button class="primary" type="submit">SAVE_SYSTEM</button>
      </form>
    `;
  },
  renderPlanetEditor(planet) {
    return `
      <form id="config-editor-form" class="form" data-entity-type="planets">
        ${this.renderHeader(planet, 'ÐŸÐ¾Ð»Ð½Ñ‹Ð¹ Ñ€ÐµÐ´Ð°ÐºÑ‚Ð¾Ñ€ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹ Ñ Ð¸Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸ÐµÐ¼, Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð°Ð¼Ð¸, ÑÐ²ÑÐ·ÑÐ¼Ð¸ Ð¸ Ñ€Ñ‹Ð½ÐºÐ¾Ð¼ Ð¿Ð¾ Ñ‚Ð¾Ð²Ð°Ñ€Ð°Ð¼.')}
        ${imageFieldMarkup(planet, 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹')}
        <div class="cols3">
          <div class="field"><label>ID</label><input class="input" name="id" value="${esc(planet.id)}" /></div>
          <div class="field"><label>ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ</label><input class="input" name="name" value="${esc(planet.name || '')}" /></div>
          <div class="field"><label>ÐšÐ¾Ð´</label><input class="input" name="code" value="${esc(planet.code || '')}" /></div>
        </div>
        <div class="cols4 cols-responsive-4">
          <div class="field"><label>Ð¦Ð²ÐµÑ‚</label><input class="input" name="color" value="${esc(planet.color || '#7df9ff')}" /></div>
          <div class="field"><label>Dist</label><input class="input" type="number" name="dist" value="${Number(planet.dist || 0)}" /></div>
          <div class="field"><label>Speed</label><input class="input" type="number" step="0.0001" name="speed" value="${Number(planet.speed || 0)}" /></div>
          <div class="field"><label>Size</label><input class="input" type="number" name="size" value="${Number(planet.size || 0)}" /></div>
        </div>
        ${this.renderVisibilityField(planet)}
        <div class="section-title">Ð›Ð¾ÐºÐ°Ñ†Ð¸Ñ</div>
        <div class="cols2">
          <div class="field"><label>Ð ÑƒÐºÐ°Ð²</label><input class="input" name="loc_arm" value="${esc(planet.location?.arm || '')}" /></div>
          <div class="field"><label>Ð£Ð·ÐµÐ»</label><input class="input" name="loc_node" value="${esc(planet.location?.node || '')}" /></div>
          <div class="field"><label>Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð°</label><input class="input" name="loc_system" value="${esc(planet.location?.system || '')}" /></div>
          <div class="field"><label>ÐžÐ±ÑŠÐµÐºÑ‚</label><input class="input" name="loc_obj" value="${esc(planet.location?.obj || '')}" /></div>
        </div>
        <div class="section-title">Ð¤Ð¸Ð·Ð¸ÐºÐ°</div>
        <div class="cols2">
          <div class="field"><label>Ð¢Ð¸Ð¿</label><input class="input" name="phy_type" value="${esc(planet.physics?.type || '')}" /></div>
          <div class="field"><label>ÐœÐ°ÑÑÐ°</label><input class="input" name="phy_mass" value="${esc(planet.physics?.mass || '')}" /></div>
          <div class="field"><label>Ð Ð°Ð´Ð¸ÑƒÑ</label><input class="input" name="phy_radius" value="${esc(planet.physics?.radius || '')}" /></div>
          <div class="field"><label>Ð“Ñ€Ð°Ð²Ð¸Ñ‚Ð°Ñ†Ð¸Ñ</label><input class="input" name="phy_gravity" value="${esc(planet.physics?.gravity || '')}" /></div>
          <div class="field"><label>ÐšÐ»Ð¸Ð¼Ð°Ñ‚</label><input class="input" name="phy_climate" value="${esc(planet.physics?.climate || '')}" /></div>
          <div class="field"><label>Ð¢ÐµÐ¼Ð¿ÐµÑ€Ð°Ñ‚ÑƒÑ€Ð°</label><input class="input" name="phy_temp" value="${esc(planet.physics?.temp || '')}" /></div>
        </div>
        <div class="field"><label>ÐÑ‚Ð¼Ð¾ÑÑ„ÐµÑ€Ð°</label><input class="input" name="phy_atm" value="${esc(planet.physics?.atm || '')}" /></div>
        <div class="section-title">Ð¡Ð¾Ñ†Ð¸ÑƒÐ¼</div>
        <div class="cols2">
          <div class="field"><label>ÐÐ°ÑÐµÐ»ÐµÐ½Ð¸Ðµ</label><input class="input" name="soc_pop" value="${esc(planet.socio?.pop || '')}" /></div>
          <div class="field"><label>Ð¡Ñ‚Ð¾Ð»Ð¸Ñ†Ð°</label><input class="input" name="soc_capital" value="${esc(planet.socio?.capital || '')}" /></div>
          <div class="field"><label>ÐŸÑ€Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ</label><input class="input" name="soc_gov" value="${esc(planet.socio?.gov || '')}" /></div>
          <div class="field"><label>ÐŸÑ€Ð°Ð²Ð¾Ð²Ð¾Ð¹ Ñ€ÐµÐ¶Ð¸Ð¼</label><input class="input" name="soc_law" value="${esc(planet.socio?.law || '')}" /></div>
        </div>
        <div class="section-title">Ð¢ÐµÐºÑÑ‚Ð¾Ð²Ñ‹Ðµ Ð±Ð»Ð¾ÐºÐ¸ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹</div>
        <div class="field"><label>Ð¡Ð¿Ñ€Ð°Ð²ÐºÐ°</label><textarea class="area" name="pilot_reference">${esc(getPlanetReference(planet))}</textarea></div>
        <div class="field"><label>Ð˜Ð½Ñ„Ð¾Ñ€Ð¼Ð°Ñ†Ð¸Ñ</label><textarea class="area article-body-editor" name="pilot_info">${esc(getPlanetInfo(planet))}</textarea></div>
        <div class="field"><label>ÐŸÑ€ÐµÐ´ÑƒÐ¿Ñ€ÐµÐ¶Ð´ÐµÐ½Ð¸Ðµ</label><textarea class="area" name="pilot_warning">${esc(planet.pilot?.warning || '')}</textarea></div>
        <div class="field"><label>ÐšÐ»ÑŽÑ‡ÐµÐ²Ñ‹Ðµ NPC</label>${renderCheckboxSelector('npcIds', Object.values(NPCS), planet.npcIds || [], 'npc', 'ÐÐµÑ‚ NPC')}</div>
        <div class="field"><label>Ð¤Ð»Ð¾Ñ€Ð°</label>${renderCheckboxSelector('floraIds', Object.values(FLORA), planet.floraIds || [], 'flora', 'ÐÐµÑ‚ Ñ„Ð»Ð¾Ñ€Ñ‹')}</div>
        <div class="field"><label>Ð¤Ð°ÑƒÐ½Ð°</label>${renderCheckboxSelector('faunaIds', Object.values(FAUNA), planet.faunaIds || [], 'fauna', 'ÐÐµÑ‚ Ñ„Ð°ÑƒÐ½Ñ‹')}</div>
        <div class="field"><label>Ð Ñ‹Ð½Ð¾Ðº</label><div id="market-rows" class="dynamic-list" data-kind="market">${renderMarketRows(planet.market)}</div><button id="add-market-row" class="secondary" type="button">ADD_MARKET_ITEM</button></div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸</label>${renderRelatedArticlesEditor(planet.relatedArticleIds || [])}</div>
        <button class="primary" type="submit">SAVE_PLANET</button>
      </form>
    `;
  },
  renderNpcEditor(npc) {
    return `
      <form id="config-editor-form" class="form" data-entity-type="npcs">
        ${this.renderHeader(npc, 'NPC Ð¿Ð¾Ð»ÑƒÑ‡Ð°ÐµÑ‚ ÑÐ²Ð¾Ñ‘ Ð¸Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ, Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð¸ Ð¾Ñ‚Ð´ÐµÐ»ÑŒÐ½Ñ‹Ð¹ Ð´Ð¾ÑÑ‚ÑƒÐ¿ Ð´Ð»Ñ Ð¸Ð³Ñ€Ð¾ÐºÐ¾Ð².')}
        ${imageFieldMarkup(npc, 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ NPC')}
        <div class="cols2">
          <div class="field"><label>ID</label><input class="input" name="id" value="${esc(npc.id)}" /></div>
          <div class="field"><label>Ð˜Ð¼Ñ</label><input class="input" name="name" value="${esc(npc.name || '')}" /></div>
        </div>
        <div class="cols2">
          <div class="field"><label>Ð Ð¾Ð»ÑŒ</label><input class="input" name="role" value="${esc(npc.role || '')}" /></div>
          <div class="field"><label>Ð›Ð¾ÐºÐ°Ñ†Ð¸Ñ</label><input class="input" name="location" value="${esc(npc.location || '')}" /></div>
        </div>
        ${this.renderVisibilityField(npc)}
        <div class="field"><label>ÐšÑ€Ð°Ñ‚ÐºÐ¾Ðµ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ</label><textarea class="area" name="summary">${esc(npc.summary || '')}</textarea></div>
        <div class="field"><label>Ð§ÐµÑ€Ñ‚Ñ‹ (Ð¿Ð¾ Ð¾Ð´Ð½Ð¾Ð¹ Ð½Ð° ÑÑ‚Ñ€Ð¾ÐºÑƒ)</label><textarea class="area inv-editor" name="traits">${esc(listText(npc.traits))}</textarea></div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸</label>${renderRelatedArticlesEditor(npc.relatedArticleIds || [])}</div>
        <button class="primary" type="submit">SAVE_NPC</button>
      </form>
    `;
  },
  renderEquipmentEditor(item) {
    return `
      <form id="config-editor-form" class="form" data-entity-type="equipment">
        ${this.renderHeader(item, 'ÐŸÑ€ÐµÐ´Ð¼ÐµÑ‚Ñ‹ Ð¿Ð¾Ð»ÑƒÑ‡Ð°ÑŽÑ‚ ÑƒÐ½Ð¸ÐºÐ°Ð»ÑŒÐ½Ñ‹Ðµ Ð¸Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ñ Ð¸ Ð¿Ð¾ÐºÐ°Ð·Ñ‹Ð²Ð°ÑŽÑ‚ÑÑ Ð² Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÑÑ…, Ñ€Ñ‹Ð½ÐºÐµ Ð¸ Ð²Ð¸ÐºÐ¸.')}
        ${imageFieldMarkup(item, 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ð°')}
        <div class="cols3">
          <div class="field"><label>ID</label><input class="input" name="id" value="${esc(item.id)}" /></div>
          <div class="field"><label>Ð¢Ð¸Ð¿</label><input class="input" name="type" value="${esc(item.type || '')}" /></div>
          <div class="field"><label>Ð ÐµÐ´ÐºÐ¾ÑÑ‚ÑŒ</label><input class="input" name="rarity" value="${esc(item.rarity || '')}" /></div>
        </div>
        <div class="field"><label>ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ</label><input class="input" name="name" value="${esc(item.name || '')}" /></div>
        ${this.renderVisibilityField(item)}
        <div class="field"><label>ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ</label><textarea class="area" name="desc">${esc(item.desc || '')}</textarea></div>
        <div class="cols3">
          <div class="field"><label>ÐœÐµÑ…Ð°Ð½Ð¸ÐºÐ° Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ð°</label><select class="select" name="mechanicType"><option value="" ${!item.mechanicType ? 'selected' : ''}>ÐÐµÑ‚ Ð°ÐºÑ‚Ð¸Ð²Ð½Ð¾Ð¹ Ð¼ÐµÑ…Ð°Ð½Ð¸ÐºÐ¸</option><option value="decryptor" ${item.mechanicType === 'decryptor' ? 'selected' : ''}>Ð”ÐµÑˆÐ¸Ñ„Ñ€Ð°Ñ‚Ð¾Ñ€ / Ð¸Ð½Ñ‚ÐµÑ€Ð°ÐºÑ‚Ð¸Ð²Ð½Ñ‹Ð¹ Ð¼Ð¾Ð´ÑƒÐ»ÑŒ</option></select></div>
          <div class="field"><label>Ð ÐµÐ¶Ð¸Ð¼ Ð¼Ð¾Ð´ÑƒÐ»Ñ</label><select class="select" name="decryptorMode"><option value="decryptor" ${String(item.decryptorMode || 'decryptor') === 'decryptor' ? 'selected' : ''}>ÐžÐ±Ñ‹Ñ‡Ð½Ñ‹Ð¹ Ð´ÐµÑˆÐ¸Ñ„Ñ€Ð°Ñ‚Ð¾Ñ€</option><option value="codebreaker" ${item.decryptorMode === 'codebreaker' ? 'selected' : ''}>ÐœÐ¸Ð½Ð¸-Ð¸Ð³Ñ€Ð°: Ð±Ñ‹ÑÑ‚Ñ€Ñ‹Ð¹ Ð²Ð·Ð»Ð¾Ð¼</option><option value="doorhack" ${item.decryptorMode === 'doorhack' ? 'selected' : ''}>ÐœÐ¸Ð½Ð¸-Ð¸Ð³Ñ€Ð°: Ð´Ð²ÐµÑ€Ð½Ð¾Ð¹ Ð²Ð·Ð»Ð¾Ð¼</option></select></div>
          <div class="field"><label>ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¼Ð¾Ð´ÑƒÐ»Ñ</label><input class="input" name="mechanicTitle" value="${esc(item.mechanicTitle || '')}" placeholder="ÐŸÐ¾Ð»ÐµÐ²Ð¾Ð¹ Ð´ÐµÑˆÐ¸Ñ„Ñ€Ð°Ñ‚Ð¾Ñ€" /></div>
        </div>
        <div class="cols3">
          <div class="field"><label>Ð¨Ð¸Ñ„Ñ€ Ð¿Ð¾ ÑƒÐ¼Ð¾Ð»Ñ‡Ð°Ð½Ð¸ÑŽ</label><select class="select" name="decryptorDefaultCipher"><option value="caesar" ${String(item.decryptorDefaultCipher || 'caesar') === 'caesar' ? 'selected' : ''}>Caesar</option><option value="vigenere" ${item.decryptorDefaultCipher === 'vigenere' ? 'selected' : ''}>Vigenere</option><option value="atbash" ${item.decryptorDefaultCipher === 'atbash' ? 'selected' : ''}>Atbash</option><option value="xor" ${item.decryptorDefaultCipher === 'xor' ? 'selected' : ''}>XOR/Base64</option></select></div>
          <div class="field"><label>Ð›Ð¸Ð¼Ð¸Ñ‚ Ð²Ñ€ÐµÐ¼ÐµÐ½Ð¸ (ÑÐµÐº)</label><input class="input" type="number" min="5" max="120" name="mechanicTimeLimit" value="${esc(String(item.mechanicTimeLimit || 20))}" /></div>
          <div class="field"><label>Ð”Ð»Ð¸Ð½Ð° ÐºÐ¾Ð´Ð° / ÑÐ»Ð¾Ñ‚Ð¾Ð²</label><input class="input" type="number" min="3" max="8" name="mechanicCodeLength" value="${esc(String(item.mechanicCodeLength || item.mechanicSlots || 5))}" /></div>
        </div>
        <div class="field"><label>ÐŸÐ¾Ð´ÑÐºÐ°Ð·ÐºÐ° Ðº Ð¼ÐµÑ…Ð°Ð½Ð¸ÐºÐµ</label><textarea class="area" name="mechanicHint">${esc(item.mechanicHint || '')}</textarea></div>
        <div class="field"><label>Ð¢ÐµÐ³Ð¸ (Ð¿Ð¾ Ð¾Ð´Ð½Ð¾Ð¼Ñƒ Ð½Ð° ÑÑ‚Ñ€Ð¾ÐºÑƒ)</label><textarea class="area inv-editor" name="tags">${esc(listText(item.tags))}</textarea></div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸</label>${renderRelatedArticlesEditor(item.relatedArticleIds || [])}</div>
        <button class="primary" type="submit">SAVE_ITEM</button>
      </form>
    `;
  },
  renderFloraEditor(flora) {
    return `
      <form id="config-editor-form" class="form" data-entity-type="flora">
        ${this.renderHeader(flora, 'Ð¤Ð»Ð¾Ñ€Ð° Ð¿Ð¾ÑÐ²Ð»ÑÐµÑ‚ÑÑ Ð² ÑÑ‚Ð°Ñ‚ÑŒÑÑ… Ð¿Ð»Ð°Ð½ÐµÑ‚ Ð¸ Ð²ÐµÐ´Ñ‘Ñ‚ Ð² Ð¾Ñ‚Ð´ÐµÐ»ÑŒÐ½ÑƒÑŽ Ð²Ð¸ÐºÐ¸-Ð·Ð°Ð¿Ð¸ÑÑŒ Ð¿Ð¾ ÐºÐ»Ð¸ÐºÑƒ.')}
        ${imageFieldMarkup(flora, 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ñ„Ð»Ð¾Ñ€Ñ‹')}
        <div class="cols2">
          <div class="field"><label>ID</label><input class="input" name="id" value="${esc(flora.id)}" /></div>
          <div class="field"><label>ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ</label><input class="input" name="name" value="${esc(flora.name || '')}" /></div>
        </div>
        ${this.renderVisibilityField(flora)}
        <div class="field"><label>ÐÑ€ÐµÐ°Ð»</label><input class="input" name="habitat" value="${esc(flora.habitat || '')}" /></div>
        <div class="field"><label>ÐšÑ€Ð°Ñ‚ÐºÐ¾Ðµ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ</label><textarea class="area" name="summary">${esc(flora.summary || '')}</textarea></div>
        <div class="cols2">
          <div class="field"><label>ÐžÐ¿Ð°ÑÐ½Ð¾ÑÑ‚ÑŒ</label><input class="input" name="danger" value="${esc(flora.danger || '')}" /></div>
          <div class="field"><label>ÐŸÑ€Ð¸Ð¼ÐµÐ½ÐµÐ½Ð¸Ðµ</label><input class="input" name="use" value="${esc(flora.use || '')}" /></div>
        </div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸</label>${renderRelatedArticlesEditor(flora.relatedArticleIds || [])}</div>
        <button class="primary" type="submit">SAVE_FLORA</button>
      </form>
    `;
  },
  renderFaunaEditor(fauna) {
    return `
      <form id="config-editor-form" class="form" data-entity-type="fauna">
        ${this.renderHeader(fauna, 'Ð¤Ð°ÑƒÐ½Ð° Ñ‚Ð¾Ð¶Ðµ Ð¿Ð¾Ð»ÑƒÑ‡Ð°ÐµÑ‚ ÐºÐ°Ñ€Ñ‚Ð¸Ð½ÐºÑƒ, ÑÐ²Ð¾Ð¹ Ð´Ð¾ÑÑ‚ÑƒÐ¿ Ð¸ Ð¾Ñ‚Ð´ÐµÐ»ÑŒÐ½ÑƒÑŽ ÑÑ‚Ð°Ñ‚ÑŒÑŽ Ð² Ð°Ñ€Ñ…Ð¸Ð²Ðµ.')}
        ${imageFieldMarkup(fauna, 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ Ñ„Ð°ÑƒÐ½Ñ‹')}
        <div class="cols2">
          <div class="field"><label>ID</label><input class="input" name="id" value="${esc(fauna.id)}" /></div>
          <div class="field"><label>ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ</label><input class="input" name="name" value="${esc(fauna.name || '')}" /></div>
        </div>
        ${this.renderVisibilityField(fauna)}
        <div class="field"><label>ÐÑ€ÐµÐ°Ð»</label><input class="input" name="habitat" value="${esc(fauna.habitat || '')}" /></div>
        <div class="field"><label>ÐšÑ€Ð°Ñ‚ÐºÐ¾Ðµ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ</label><textarea class="area" name="summary">${esc(fauna.summary || '')}</textarea></div>
        <div class="cols2">
          <div class="field"><label>ÐžÐ¿Ð°ÑÐ½Ð¾ÑÑ‚ÑŒ</label><input class="input" name="danger" value="${esc(fauna.danger || '')}" /></div>
          <div class="field"><label>ÐŸÐ¾Ð²ÐµÐ´ÐµÐ½Ð¸Ðµ</label><input class="input" name="behavior" value="${esc(fauna.behavior || '')}" /></div>
        </div>
        <div class="section-title">Ð‘Ð¾ÐµÐ²Ñ‹Ðµ Ñ…Ð°Ñ€Ð°ÐºÑ‚ÐµÑ€Ð¸ÑÑ‚Ð¸ÐºÐ¸</div>
        <div class="cols3">
          <div class="field"><label>HP</label><input class="input" type="number" min="1" step="1" name="hpMax" value="${Number(fauna.hpMax ?? fauna.hp ?? 10)}" /></div>
          <div class="field"><label>Ð£Ñ€Ð¾Ð½ Ð°Ñ‚Ð°ÐºÐ¸</label><input class="input" name="damage" value="${esc(fauna.damage || '1')}" /></div>
          <div class="field"><label>Ð‘Ð¾Ð½ÑƒÑ Ð¿Ð¾Ð¿Ð°Ð´Ð°Ð½Ð¸Ñ</label><input class="input" type="number" step="1" name="hitBonus" value="${Number(fauna.hitBonus || 0)}" /></div>
        </div>
        <div class="cols3">
          <div class="field"><label>Ð”Ð°Ð»ÑŒÐ½Ð¾ÑÑ‚ÑŒ Ð°Ñ‚Ð°ÐºÐ¸ (Ð³ÐµÐºÑÑ‹)</label><input class="input" type="number" min="0" step="1" name="attackRange" value="${Number(fauna.attackRange ?? fauna.range ?? 1)}" /></div>
          <div class="field"><label>Ð”Ð²Ð¸Ð¶ÐµÐ½Ð¸Ðµ (Ð³ÐµÐºÑÑ‹)</label><input class="input" type="number" min="0" step="1" name="moveRange" value="${Number(fauna.moveRange ?? 6)}" /></div>
          <div class="field"><label>ÐžÐ±Ð·Ð¾Ñ€ (Ð³ÐµÐºÑÑ‹)</label><input class="input" type="number" min="0" step="1" name="visionRange" value="${Number(fauna.visionRange ?? 6)}" /></div>
        </div>
        <div class="cols3">
          <div class="field"><label>ÐšÐ»Ð°ÑÑ Ð±Ñ€Ð¾Ð½Ð¸</label><input class="input" type="number" min="0" step="1" name="armorClass" value="${Number(fauna.armorClass ?? 10)}" /></div>
          <div class="field"><label>Ð—Ð°Ñ‰Ð¸Ñ‚Ð°</label><input class="input" type="number" min="0" step="1" name="defense" value="${Number(fauna.defense || 0)}" /></div>
          <div class="field"><label>Ð˜Ð½Ð¸Ñ†Ð¸Ð°Ñ‚Ð¸Ð²Ð°</label><input class="input" type="number" step="1" name="initiative" value="${Number(fauna.initiative || 0)}" /></div>
        </div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸</label>${renderRelatedArticlesEditor(fauna.relatedArticleIds || [])}</div>
        <button class="primary" type="submit">SAVE_FAUNA</button>
      </form>
    `;
  },
  renderArticleEditor(article) {
    return `
      <form id="config-editor-form" class="form" data-entity-type="articles">
        ${this.renderHeader(article, 'ÐžÑ‚Ð´ÐµÐ»ÑŒÐ½Ð°Ñ ÑÐ½Ñ†Ð¸ÐºÐ»Ð¾Ð¿ÐµÐ´Ð¸Ñ‡ÐµÑÐºÐ°Ñ ÑÑ‚Ð°Ñ‚ÑŒÑ Ð°Ñ€Ñ…Ð¸Ð²Ð° Ñ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð°Ð¼Ð¸, Ð¸Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸ÐµÐ¼ Ð¸ ÑÐ²ÑÐ·ÑÐ¼Ð¸ Ð½Ð° Ð´Ñ€ÑƒÐ³Ð¸Ðµ Ð¼Ð°Ñ‚ÐµÑ€Ð¸Ð°Ð»Ñ‹.')}
        ${imageFieldMarkup(article, 'Ð˜Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸')}
        <div class="cols3">
          <div class="field"><label>ID</label><input class="input" name="id" value="${esc(article.id)}" /></div>
          <div class="field"><label>Ð—Ð°Ð³Ð¾Ð»Ð¾Ð²Ð¾Ðº</label><input class="input" name="name" value="${esc(article.name || '')}" /></div>
          <div class="field"><label>ÐšÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ñ</label><input class="input" name="category" value="${esc(article.category || '')}" placeholder="ÐÑ€Ñ…Ð¸Ð²" /></div>
        </div>
        ${this.renderVisibilityField(article)}
        <label class="consent-line article-search-only-v1082"><input type="checkbox" name="searchOnly" ${article.searchOnly === true || String(article.searchOnly || '').toLowerCase() === 'true' ? 'checked' : ''}/><span><b>Ð”Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð¿Ð¾ Ð¿Ð¾Ð¸ÑÐºÑƒ</b><small>Ð¡Ñ‚Ð°Ñ‚ÑŒÑ ÑÐºÑ€Ñ‹Ñ‚Ð° Ð¸Ð· Ð¾Ð±Ñ‰ÐµÐ³Ð¾ ÐºÐ°Ñ‚Ð°Ð»Ð¾Ð³Ð°. Ð˜Ð³Ñ€Ð¾Ðº Ñ Ð¾Ð±Ñ‹Ñ‡Ð½Ñ‹Ð¼ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð¾Ð¼ Ð½Ð°Ð¹Ð´Ñ‘Ñ‚ ÐµÑ‘ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð¿Ð¾ ÑÐ»Ð¾Ð²Ð°Ð¼ Ð¸Ð· Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ñ; Ð¿Ñ€ÑÐ¼Ð°Ñ ÑÑÑ‹Ð»ÐºÐ° Ð¸Ð· ÑÑ‚Ð°Ñ‚ÑŒÐ¸ Ð¸Ð»Ð¸ ÑÐ¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ñ Ð¾Ñ‚ÐºÑ€Ð¾ÐµÑ‚ Ð¼Ð°Ñ‚ÐµÑ€Ð¸Ð°Ð» Ð½ÐµÐ·Ð°Ð²Ð¸ÑÐ¸Ð¼Ð¾ Ð¾Ñ‚ Ð½Ð°Ð·Ð½Ð°Ñ‡ÐµÐ½Ð½Ñ‹Ñ… Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð¾Ð².</small></span></label>
        <div class="field"><label>ÐšÑ€Ð°Ñ‚ÐºÐ¾Ðµ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ</label><textarea class="area" name="summary">${esc(article.summary || '')}</textarea></div>
        <div class="field"><label>ÐŸÐ¾Ð»Ð½Ñ‹Ð¹ Ñ‚ÐµÐºÑÑ‚ ÑÑ‚Ð°Ñ‚ÑŒÐ¸</label><textarea class="area article-body-editor" name="body">${esc(article.body || '')}</textarea></div>
        <div class="section-title">Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ Ð¼Ð°Ñ‚ÐµÑ€Ð¸Ð°Ð»Ñ‹</div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ ÑÑ‚Ð°Ñ‚ÑŒÐ¸</label>${renderCheckboxSelector('relatedArticleIds', Object.values(ARTICLES).filter(item => item.id !== article.id), article.relatedArticleIds || [], 'article', 'ÐÐµÑ‚ ÑÑ‚Ð°Ñ‚ÐµÐ¹')}</div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñ‹</label>${renderCheckboxSelector('relatedPlanetIds', Object.values(PLANETS), article.relatedPlanetIds || [], 'planet', 'ÐÐµÑ‚ Ð¿Ð»Ð°Ð½ÐµÑ‚')}</div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ NPC</label>${renderCheckboxSelector('relatedNpcIds', Object.values(NPCS), article.relatedNpcIds || [], 'npc', 'ÐÐµÑ‚ NPC')}</div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ñ‹Ðµ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ñ‹</label>${renderCheckboxSelector('relatedItemIds', Object.values(EQUIPMENT), article.relatedItemIds || [], 'item', 'ÐÐµÑ‚ Ð¿Ñ€ÐµÐ´Ð¼ÐµÑ‚Ð¾Ð²')}</div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ð°Ñ Ñ„Ð»Ð¾Ñ€Ð°</label>${renderCheckboxSelector('relatedFloraIds', Object.values(FLORA), article.relatedFloraIds || [], 'flora', 'ÐÐµÑ‚ Ñ„Ð»Ð¾Ñ€Ñ‹')}</div>
        <div class="field"><label>Ð¡Ð²ÑÐ·Ð°Ð½Ð½Ð°Ñ Ñ„Ð°ÑƒÐ½Ð°</label>${renderCheckboxSelector('relatedFaunaIds', Object.values(FAUNA), article.relatedFaunaIds || [], 'fauna', 'ÐÐµÑ‚ Ñ„Ð°ÑƒÐ½Ñ‹')}</div>
        <button class="primary" type="submit">SAVE_ARTICLE</button>
      </form>
    `;
  },
  renderEditor(entity) {
    if (this.selectedType === 'players') return this.renderPlayerEditor(entity);
    if (this.selectedType === 'systems') return this.renderSystemEditor(entity);
    if (this.selectedType === 'planets') return this.renderPlanetEditor(entity);
    if (this.selectedType === 'npcs') return this.renderNpcEditor(entity);
    if (this.selectedType === 'equipment') return this.renderEquipmentEditor(entity);
    if (this.selectedType === 'flora') return this.renderFloraEditor(entity);
    if (this.selectedType === 'fauna') return this.renderFaunaEditor(entity);
    if (this.selectedType === 'articles') return this.renderArticleEditor(entity);
    return '<div class="subtle">Ð ÐµÐ´Ð°ÐºÑ‚Ð¾Ñ€ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½</div>';
  },
  createNew() {
    const entity = createBlankEntity(this.selectedType);
    this.insertEntity(this.selectedType, entity);
    this.selectedId = entity.id;
    this.render();
  },
  duplicateSelected() {
    const entity = this.getSelectedEntity();
    if (!entity) return;
    const copy = deep(entity);
    const newId = slugifyId(`${entity.id}_copy`, this.selectedType.slice(0, -1));
    copy.id = newId;
    const base = copy.name || copy.displayName || copy.id;
    if (copy.name) copy.name = `${base} (ÐºÐ¾Ð¿Ð¸Ñ)`;
    if (copy.displayName) copy.displayName = `${base} (ÐºÐ¾Ð¿Ð¸Ñ)`;
    this.selectedId = copy.id;
    this.insertEntity(this.selectedType, copy);
    this.render();
  },
  allEntitiesWithArticleRefs() {
    return [
      ...Object.values(PLAYER_TEMPLATES),
      ...SYSTEMS,
      ...Object.values(PLANETS),
      ...Object.values(NPCS),
      ...Object.values(EQUIPMENT),
      ...Object.values(FLORA),
      ...Object.values(FAUNA),
      ...Object.values(ARTICLES)
    ];
  },
  cleanupReferences(type, id) {
    if (type === 'systems') {
      SYSTEMS.forEach(system => {
        system.routes = (system.routes || []).filter(route => route.toId !== id);
      });
      if (GalaxyMap.state.activeSystemId === id) GalaxyMap.exitSystem();
    }
    if (type === 'planets') {
      SYSTEMS.forEach(system => { system.planetIds = (system.planetIds || []).filter(value => value !== id); });
      Object.values(ARTICLES).forEach(article => { article.relatedPlanetIds = (article.relatedPlanetIds || []).filter(value => value !== id); });
      if (UI.selectedPlanetId === id) UI.selectedPlanetId = null;
    }
    if (type === 'npcs') {
      Object.values(PLANETS).forEach(planet => { planet.npcIds = (planet.npcIds || []).filter(value => value !== id); });
      Object.values(PLAYER_TEMPLATES).forEach(player => { player.social.npcIds = (player.social?.npcIds || []).filter(value => value !== id); });
      Object.values(App.state.users || {}).forEach(player => { player.social.npcIds = (player.social?.npcIds || []).filter(value => value !== id); });
      Object.values(ARTICLES).forEach(article => { article.relatedNpcIds = (article.relatedNpcIds || []).filter(value => value !== id); });
    }
    if (type === 'flora') {
      Object.values(PLANETS).forEach(planet => { planet.floraIds = (planet.floraIds || []).filter(value => value !== id); });
      Object.values(ARTICLES).forEach(article => { article.relatedFloraIds = (article.relatedFloraIds || []).filter(value => value !== id); });
    }
    if (type === 'fauna') {
      Object.values(PLANETS).forEach(planet => { planet.faunaIds = (planet.faunaIds || []).filter(value => value !== id); });
      Object.values(ARTICLES).forEach(article => { article.relatedFaunaIds = (article.relatedFaunaIds || []).filter(value => value !== id); });
    }
    if (type === 'articles') {
      this.allEntitiesWithArticleRefs().forEach(entity => { entity.relatedArticleIds = (entity.relatedArticleIds || []).filter(value => value !== id); });
    }
    if (type === 'equipment') {
      Object.values(PLANETS).forEach(planet => { planet.market = (planet.market || []).filter(entry => entry.itemId !== id); });
      Object.values(PLAYER_TEMPLATES).forEach(player => {
        player.inventory = (player.inventory || []).filter(entry => entry.itemId !== id);
        if (player.equipmentSlots?.weapon === id) player.equipmentSlots.weapon = '';
        if (player.equipmentSlots?.armor === id) player.equipmentSlots.armor = '';
      });
      Object.values(App.state.users || {}).forEach(player => {
        player.inventory = (player.inventory || []).filter(entry => entry.itemId !== id);
        if (player.equipmentSlots?.weapon === id) player.equipmentSlots.weapon = '';
        if (player.equipmentSlots?.armor === id) player.equipmentSlots.armor = '';
      });
      Object.values(ARTICLES).forEach(article => { article.relatedItemIds = (article.relatedItemIds || []).filter(value => value !== id); });
    }
  },
  remapReferences(type, oldId, newId) {
    if (oldId === newId) return;
    if (type === 'systems') {
      SYSTEMS.forEach(system => {
        system.routes = (system.routes || []).map(route => route.toId === oldId ? { ...route, toId: newId } : route);
      });
      if (GalaxyMap.state.activeSystemId === oldId) GalaxyMap.state.activeSystemId = newId;
    }
    if (type === 'planets') {
      SYSTEMS.forEach(system => { system.planetIds = (system.planetIds || []).map(value => value === oldId ? newId : value); });
      Object.values(ARTICLES).forEach(article => { article.relatedPlanetIds = (article.relatedPlanetIds || []).map(value => value === oldId ? newId : value); });
      if (UI.selectedPlanetId === oldId) UI.selectedPlanetId = newId;
    }
    if (type === 'npcs') {
      Object.values(PLANETS).forEach(planet => { planet.npcIds = (planet.npcIds || []).map(value => value === oldId ? newId : value); });
      Object.values(PLAYER_TEMPLATES).forEach(player => { player.social.npcIds = (player.social?.npcIds || []).map(value => value === oldId ? newId : value); });
      Object.values(App.state.users || {}).forEach(player => { player.social.npcIds = (player.social?.npcIds || []).map(value => value === oldId ? newId : value); });
      Object.values(ARTICLES).forEach(article => { article.relatedNpcIds = (article.relatedNpcIds || []).map(value => value === oldId ? newId : value); });
    }
    if (type === 'flora') {
      Object.values(PLANETS).forEach(planet => { planet.floraIds = (planet.floraIds || []).map(value => value === oldId ? newId : value); });
      Object.values(ARTICLES).forEach(article => { article.relatedFloraIds = (article.relatedFloraIds || []).map(value => value === oldId ? newId : value); });
    }
    if (type === 'fauna') {
      Object.values(PLANETS).forEach(planet => { planet.faunaIds = (planet.faunaIds || []).map(value => value === oldId ? newId : value); });
      Object.values(ARTICLES).forEach(article => { article.relatedFaunaIds = (article.relatedFaunaIds || []).map(value => value === oldId ? newId : value); });
    }
    if (type === 'articles') {
      this.allEntitiesWithArticleRefs().forEach(entity => { entity.relatedArticleIds = (entity.relatedArticleIds || []).map(value => value === oldId ? newId : value); });
      if (Wiki.currentView?.type === 'article' && Wiki.currentView?.id === oldId) Wiki.currentView = { type: 'article', id: newId };
    }
    if (type === 'equipment') {
      Object.values(PLANETS).forEach(planet => { planet.market = (planet.market || []).map(entry => entry.itemId === oldId ? { ...entry, itemId: newId } : entry); });
      Object.values(PLAYER_TEMPLATES).forEach(player => {
        player.inventory = (player.inventory || []).map(entry => entry.itemId === oldId ? { ...entry, itemId: newId } : entry);
        if (player.equipmentSlots?.weapon === oldId) player.equipmentSlots.weapon = newId;
        if (player.equipmentSlots?.armor === oldId) player.equipmentSlots.armor = newId;
      });
      Object.values(App.state.users || {}).forEach(player => {
        player.inventory = (player.inventory || []).map(entry => entry.itemId === oldId ? { ...entry, itemId: newId } : entry);
        if (player.equipmentSlots?.weapon === oldId) player.equipmentSlots.weapon = newId;
        if (player.equipmentSlots?.armor === oldId) player.equipmentSlots.armor = newId;
      });
      Object.values(ARTICLES).forEach(article => { article.relatedItemIds = (article.relatedItemIds || []).map(value => value === oldId ? newId : value); });
    }
    if (type === 'players' && App.state.users?.[oldId]) {
      App.state.users[newId] = { ...App.state.users[oldId], id: newId };
      delete App.state.users[oldId];
      if (App.currentUserId === oldId) App.currentUserId = newId;
    }
  },
  async deleteSelected() {
    const entity = this.getSelectedEntity();
    if (!entity) return;
    if (this.selectedType === 'players' && entity.id === 'gm') {
      Toast.show('ÐŸÑ€Ð¾Ñ„Ð¸Ð»ÑŒ Ð²ÐµÐ´ÑƒÑ‰ÐµÐ³Ð¾ ÑƒÐ´Ð°Ð»ÑÑ‚ÑŒ Ð½ÐµÐ»ÑŒÐ·Ñ', 'err');
      return;
    }
    const ok = await requestConfirmationV1090(`Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ ${entity.name || entity.displayName || entity.id}?`, { acceptLabel: 'Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ' });
    if (!ok) return;
    const removedId = entity.id;
    this.cleanupReferences(this.selectedType, removedId);
    this.removeEntity(this.selectedType, removedId);
    await this.persistAll(`Ð£Ð´Ð°Ð»ÐµÐ½Ð° ÑÑƒÑ‰Ð½Ð¾ÑÑ‚ÑŒ ${removedId}`, this.selectedType === 'players' ? { playerSync: { deleteId: removedId } } : {});
    const remaining = this.getItems(this.selectedType);
    this.selectedId = remaining[0]?.id || null;
    this.render();
  },
  insertEntity(type, entity) {
    if (type === 'players') {
      PLAYER_TEMPLATES[entity.id] = deep(entity);
      App.state.users[entity.id] = deep(entity);
    }
    if (type === 'systems') SYSTEMS.push(entity);
    if (type === 'planets') PLANETS[entity.id] = entity;
    if (type === 'npcs') NPCS[entity.id] = entity;
    if (type === 'equipment') EQUIPMENT[entity.id] = entity;
    if (type === 'flora') FLORA[entity.id] = entity;
    if (type === 'fauna') FAUNA[entity.id] = entity;
    if (type === 'articles') ARTICLES[entity.id] = entity;
  },
  removeEntity(type, id) {
    if (type === 'players') {
      delete PLAYER_TEMPLATES[id];
      delete App.state.users[id];
    }
    if (type === 'systems') {
      const index = SYSTEMS.findIndex(item => item.id === id);
      if (index >= 0) SYSTEMS.splice(index, 1);
    }
    if (type === 'planets') delete PLANETS[id];
    if (type === 'npcs') delete NPCS[id];
    if (type === 'equipment') delete EQUIPMENT[id];
    if (type === 'flora') delete FLORA[id];
    if (type === 'fauna') delete FAUNA[id];
    if (type === 'articles') delete ARTICLES[id];
  },
  replaceEntity(type, oldId, entity) {
    this.removeEntity(type, oldId);
    this.insertEntity(type, entity);
    this.remapReferences(type, oldId, entity.id);
    this.selectedId = entity.id;
  },
  collectEntity(type, formEl, formData = new FormData(formEl)) {
    const mediaField = formEl.querySelector('.media-field');
    const hiddenImage = formEl.querySelector('input[name="imageData"]')?.value || '';
    const image = String(hiddenImage || formData.get('imageData') || mediaField?.dataset?.savedImageValue || mediaField?.dataset?.pendingImageValue || '').trim();
    if (type === 'players') {
      const baseId = slugifyId(formData.get('id') || formData.get('displayName') || '', 'player');
      return {
        id: baseId,
        role: String(formData.get('role') || 'player'),
        pass: String(formData.get('pass') || '0000').trim(),
        shortName: String(formData.get('shortName') || baseId).trim(),
        displayName: String(formData.get('displayName') || baseId).trim(),
        rank: String(formData.get('rank') || '').trim(),
        avatarGlyph: String(formData.get('avatarGlyph') || '').trim(),
        credits: Number(formData.get('credits') || 0),
        lore: String(formData.get('lore') || '').trim(),
        notes: String(formData.get('notes') || '').trim(),
        stats: { hp: Number(formData.get('hp') || 0), shield: Number(formData.get('shield') || 0), bio: Number(formData.get('bio') || 0) },
        abilities: {
          str: Number(formData.get('str') || 0), dex: Number(formData.get('dex') || 0), con: Number(formData.get('con') || 0),
          int: Number(formData.get('int') || 0), wis: Number(formData.get('wis') || 0), cha: Number(formData.get('cha') || 0)
        },
        equipmentSlots: { weapon: String(formData.get('weapon') || ''), armor: String(formData.get('armor') || '') },
        inventory: readInventoryRows(formEl),
        implants: parseImplantsEditor(formData.get('implants') || ''),
        social: { npcIds: getCheckedValues(formEl, 'npcIds'), orgs: parseListEditor(formData.get('orgs') || '') },
        currentPlanetId: String(formData.get('currentPlanetId') || '').trim(),
        relatedArticleIds: getCheckedValues(formEl, 'relatedArticleIds'),
        image
      };
    }
    if (type === 'systems') {
      return {
        id: slugifyId(formData.get('id') || formData.get('name') || formData.get('markerLabel') || '', 'system'),
        name: String(formData.get('name') || formData.get('markerLabel') || '').trim(),
        markerLabel: String(formData.get('markerLabel') || formData.get('name') || '').trim(),
        markerStyle: SYSTEM_MARKER_STYLES.some(option => option.id === String(formData.get('markerStyle') || 'orbital').trim()) ? String(formData.get('markerStyle') || 'orbital').trim() : 'orbital',
        color: String(formData.get('color') || '#7df9ff').trim() || '#7df9ff',
        pos: { x: Number(clamp(Number(formData.get('posX') || 0.5), 0, 1).toFixed(3)), y: Number(clamp(Number(formData.get('posY') || 0.5), 0, 1).toFixed(3)) },
        planetIds: getCheckedValues(formEl, 'planetIds'),
        routes: readSystemRouteRows(formEl),
        image,
        relatedArticleIds: getCheckedValues(formEl, 'relatedArticleIds'),
        visibility: { playerIds: getCheckedValues(formEl, 'visibilityPlayerIds') }
      };
    }
    if (type === 'planets') {
      return {
        id: slugifyId(formData.get('id') || formData.get('name') || '', 'planet'),
        name: String(formData.get('name') || '').trim(),
        code: String(formData.get('code') || '').trim(),
        color: String(formData.get('color') || '#7df9ff').trim(),
        dist: Number(formData.get('dist') || 0),
        speed: Number(formData.get('speed') || 0),
        size: Number(formData.get('size') || 0),
        location: { arm: String(formData.get('loc_arm') || '').trim(), node: String(formData.get('loc_node') || '').trim(), system: String(formData.get('loc_system') || '').trim(), obj: String(formData.get('loc_obj') || '').trim() },
        physics: {
          type: String(formData.get('phy_type') || '').trim(), mass: String(formData.get('phy_mass') || '').trim(), radius: String(formData.get('phy_radius') || '').trim(),
          gravity: String(formData.get('phy_gravity') || '').trim(), climate: String(formData.get('phy_climate') || '').trim(), temp: String(formData.get('phy_temp') || '').trim(), atm: String(formData.get('phy_atm') || '').trim()
        },
        socio: { pop: String(formData.get('soc_pop') || '').trim(), capital: String(formData.get('soc_capital') || '').trim(), gov: String(formData.get('soc_gov') || '').trim(), law: String(formData.get('soc_law') || '').trim() },
        pilot: { reference: String(formData.get('pilot_reference') || '').trim(), info: String(formData.get('pilot_info') || '').trim(), warning: String(formData.get('pilot_warning') || '').trim() },
        npcIds: getCheckedValues(formEl, 'npcIds'),
        floraIds: getCheckedValues(formEl, 'floraIds'),
        faunaIds: getCheckedValues(formEl, 'faunaIds'),
        market: readMarketRows(formEl),
        image,
        relatedArticleIds: getCheckedValues(formEl, 'relatedArticleIds'),
        visibility: { playerIds: getCheckedValues(formEl, 'visibilityPlayerIds') }
      };
    }
    if (type === 'npcs') {
      return {
        id: slugifyId(formData.get('id') || formData.get('name') || '', 'npc'),
        name: String(formData.get('name') || '').trim(),
        role: String(formData.get('role') || '').trim(),
        location: String(formData.get('location') || '').trim(),
        summary: String(formData.get('summary') || '').trim(),
        traits: parseListEditor(formData.get('traits') || ''),
        image,
        relatedArticleIds: getCheckedValues(formEl, 'relatedArticleIds'),
        visibility: { playerIds: getCheckedValues(formEl, 'visibilityPlayerIds') }
      };
    }
    if (type === 'equipment') {
      return {
        id: slugifyId(formData.get('id') || formData.get('name') || '', 'item'),
        type: String(formData.get('type') || '').trim(),
        name: String(formData.get('name') || '').trim(),
        desc: String(formData.get('desc') || '').trim(),
        rarity: String(formData.get('rarity') || '').trim(),
        tags: parseListEditor(formData.get('tags') || ''),
        image,
        relatedArticleIds: getCheckedValues(formEl, 'relatedArticleIds'),
        visibility: { playerIds: getCheckedValues(formEl, 'visibilityPlayerIds') },
        mechanicType: String(formData.get('mechanicType') || '').trim(),
        decryptorMode: String(formData.get('decryptorMode') || 'decryptor').trim(),
        mechanicTitle: String(formData.get('mechanicTitle') || '').trim(),
        decryptorDefaultCipher: String(formData.get('decryptorDefaultCipher') || 'caesar').trim(),
        mechanicHint: String(formData.get('mechanicHint') || '').trim(),
        mechanicTimeLimit: clamp(Number(formData.get('mechanicTimeLimit') || 20), 5, 120),
        mechanicCodeLength: clamp(Number(formData.get('mechanicCodeLength') || 5), 3, 8),
        mechanicSlots: clamp(Number(formData.get('mechanicCodeLength') || formData.get('mechanicSlots') || 3), 3, 5)
      };
    }
    if (type === 'flora') {
      return {
        id: slugifyId(formData.get('id') || formData.get('name') || '', 'flora'),
        name: String(formData.get('name') || '').trim(),
        habitat: String(formData.get('habitat') || '').trim(),
        summary: String(formData.get('summary') || '').trim(),
        danger: String(formData.get('danger') || '').trim(),
        use: String(formData.get('use') || '').trim(),
        image,
        relatedArticleIds: getCheckedValues(formEl, 'relatedArticleIds'),
        visibility: { playerIds: getCheckedValues(formEl, 'visibilityPlayerIds') }
      };
    }
    if (type === 'fauna') {
      return {
        id: slugifyId(formData.get('id') || formData.get('name') || '', 'fauna'),
        name: String(formData.get('name') || '').trim(),
        habitat: String(formData.get('habitat') || '').trim(),
        summary: String(formData.get('summary') || '').trim(),
        danger: String(formData.get('danger') || '').trim(),
        behavior: String(formData.get('behavior') || '').trim(),
        hpMax: Math.max(1, Number(formData.get('hpMax') || 10)),
        damage: String(formData.get('damage') || '1').trim(),
        hitBonus: Number(formData.get('hitBonus') || 0),
        attackRange: Math.max(0, Number(formData.get('attackRange') || 0)),
        moveRange: Math.max(0, Number(formData.get('moveRange') || 0)),
        visionRange: Math.max(0, Number(formData.get('visionRange') || 0)),
        armorClass: Math.max(0, Number(formData.get('armorClass') || 0)),
        defense: Math.max(0, Number(formData.get('defense') || 0)),
        initiative: Number(formData.get('initiative') || 0),
        image,
        relatedArticleIds: getCheckedValues(formEl, 'relatedArticleIds'),
        visibility: { playerIds: getCheckedValues(formEl, 'visibilityPlayerIds') }
      };
    }
    if (type === 'articles') {
      return {
        id: slugifyId(formData.get('id') || formData.get('name') || '', 'article'),
        name: String(formData.get('name') || '').trim(),
        category: String(formData.get('category') || '').trim(),
        summary: String(formData.get('summary') || '').trim(),
        body: String(formData.get('body') || '').trim(),
        searchOnly: formData.get('searchOnly') === 'on',
        image,
        relatedArticleIds: getCheckedValues(formEl, 'relatedArticleIds'),
        relatedPlanetIds: getCheckedValues(formEl, 'relatedPlanetIds'),
        relatedNpcIds: getCheckedValues(formEl, 'relatedNpcIds'),
        relatedItemIds: getCheckedValues(formEl, 'relatedItemIds'),
        relatedFloraIds: getCheckedValues(formEl, 'relatedFloraIds'),
        relatedFaunaIds: getCheckedValues(formEl, 'relatedFaunaIds'),
        visibility: { playerIds: getCheckedValues(formEl, 'visibilityPlayerIds') }
      };
    }
    return null;
  },
  async submit(event) {
    event.preventDefault();
    const current = this.getSelectedEntity();
    const oldId = current?.id || this.selectedId;
    const formEl = event.currentTarget;
    Debug.log('CONFIG_SUBMIT_START', { type: this.selectedType, oldId });
    try {
      await waitForPendingImageTasks(formEl);
      const formData = new FormData(formEl);
      const entity = this.collectEntity(this.selectedType, formEl, formData);
      Debug.log('CONFIG_ENTITY_COLLECTED', {
        type: this.selectedType,
        oldId,
        newId: entity?.id,
        name: entity?.name || entity?.displayName || '',
        visibilityPlayerIds: entity?.visibility?.playerIds || [],
        npcIds: entity?.npcIds || entity?.social?.npcIds || [],
        floraIds: entity?.floraIds || [],
        faunaIds: entity?.faunaIds || [],
        marketCount: Array.isArray(entity?.market) ? entity.market.length : undefined
      });
      if (!entity?.id) {
        Toast.show('ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ ÑÐ¾Ð±Ñ€Ð°Ñ‚ÑŒ ÑÑƒÑ‰Ð½Ð¾ÑÑ‚ÑŒ', 'err');
        return;
      }
      if (this.selectedType === 'players' && oldId === 'gm' && entity.role !== 'gm') {
        Toast.show('ÐŸÑ€Ð¾Ñ„Ð¸Ð»ÑŒ Ð²ÐµÐ´ÑƒÑ‰ÐµÐ³Ð¾ Ð´Ð¾Ð»Ð¶ÐµÐ½ Ð¾ÑÑ‚Ð°Ð²Ð°Ñ‚ÑŒÑÑ Ñ€Ð¾Ð»ÑŒÑŽ gm', 'err');
        return;
      }
      this.replaceEntity(this.selectedType, oldId, entity);
      Debug.log('CONFIG_ENTITY_REPLACED', { type: this.selectedType, oldId, newId: entity.id });
      FormDrafts.clear(FormDrafts.configKey(this.selectedType, oldId || this.selectedId || 'new'));
      FormDrafts.clear(FormDrafts.configKey(this.selectedType, entity.id || 'new'));
      await this.persistAll(`Ð¡Ð¾Ñ…Ñ€Ð°Ð½Ñ‘Ð½ Ñ€Ð°Ð·Ð´ÐµÐ» ${WORLD_SECTIONS[this.selectedType].label}`, this.selectedType === 'players' ? { playerSync: { playerId: entity.id, oldId } } : {});
      this.render();
    } catch (error) {
      Debug.error('CONFIG_SUBMIT_FAILED', {
        type: this.selectedType,
        oldId,
        message: error?.message || String(error),
        stack: error?.stack || null
      });
      Toast.show(`Save failed: ${error.message}`, 'err');
    }
  },
  buildPayload(type) {
    if (type === 'players') return serializeWorldSection('players', PLAYER_TEMPLATES);
    if (type === 'systems') return serializeWorldSection('systems', SYSTEMS);
    if (type === 'planets') return serializeWorldSection('planets', PLANETS);
    if (type === 'npcs') return serializeWorldSection('npcs', NPCS);
    if (type === 'equipment') return serializeWorldSection('equipment', EQUIPMENT);
    if (type === 'flora') return serializeWorldSection('flora', FLORA);
    if (type === 'fauna') return serializeWorldSection('fauna', FAUNA);
    if (type === 'articles') return serializeWorldSection('articles', ARTICLES);
    throw new Error(`Unknown type ${type}`);
  },
  async persistAll(message, options = {}) {
    const intentId=options?.playerSync?.playerId;
    const playerIntent=intentId?deep(App.state.users[intentId]||PLAYER_TEMPLATES[intentId]||{}):null;
    const playerIntentBase=intentId?deep(PlayerSync._editorBaseV135?.get(intentId)||PlayerSync.projectedPlayerV135(intentId)):null;
    if (!window.electronAPI?.saveWorldData) {
      Toast.show('Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ðµ Ñ„Ð°Ð¹Ð»Ð¾Ð² Ð¼Ð¸Ñ€Ð° Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð² Electron', 'err');
      return;
    }

    const snapshot = buildWorldSnapshot();
    Debug.log('PERSIST_ALL_SNAPSHOT', {
      selectedType: this.selectedType,
      selectedId: this.selectedId,
      counts: {
        players: Object.keys(snapshot.players?.PLAYER_TEMPLATES || {}).length,
        systems: (snapshot.systems?.SYSTEMS || []).length,
        planets: Object.keys(snapshot.planets?.PLANETS || {}).length,
        npcs: Object.keys(snapshot.npcs?.NPCS || {}).length,
        equipment: Object.keys(snapshot.equipment?.EQUIPMENT || {}).length,
        flora: Object.keys(snapshot.flora?.FLORA || {}).length,
        fauna: Object.keys(snapshot.fauna?.FAUNA || {}).length
      }
    });
    const res = await window.electronAPI.saveWorldData(snapshot);
    Debug.log('PERSIST_ALL_RESULT', res);
    if (!res?.ok || !res.world) {
      Toast.show(`ÐžÑˆÐ¸Ð±ÐºÐ° Ð·Ð°Ð¿Ð¸ÑÐ¸ Ð¼Ð¸Ñ€Ð°: ${res?.message || 'unknown'}`, 'err');
      return;
    }

    worldData = res.world;
    applyWorldData(res.world);
    let snapshotSyncRes = null;
    let playerSyncRes = null;

    if (this.selectedType === 'players') {
      mirrorPlayersIntoWorld(App.state);
      App.state.users = deep(PLAYER_TEMPLATES);
      App.state.meta.lastUpdatedAt = new Date().toISOString();
      await App.writeLocalMirrors();
      const playerSync = options?.playerSync || {};
      let playerRes = { ok: true, status: 'noop' };
      if (playerSync.deleteId) {
        playerRes = await PlayerSync.deletePlayer(playerSync.deleteId, { silentToast: true, rerender: false });
      }
      if (playerSync.playerId && App.state.users[playerSync.playerId]) {
        playerRes = await PlayerSync.pushPlayerRecord(playerSync.playerId, playerIntent || App.state.users[playerSync.playerId], { oldId: playerSync.oldId, basePlayer:playerIntentBase, rerender: false });
      }
      playerSyncRes = playerRes;
      Sync.markLocalDirty('WORLD_CONFIG_PLAYER_PENDING_SYNC');
      await Persistence.save(App.state);
      snapshotSyncRes = await Sync.pushCurrentSnapshot('world-config-player-save', { silent: true, worldSections: ['players'] });
      await App.writeLocalMirrors();
      App.refreshAfterLocalWrite();
    } else {
      Sync.markLocalDirty('WORLD_CONFIG_PENDING_SYNC');
      await Persistence.save(App.state);
      snapshotSyncRes = await Sync.pushCurrentSnapshot('world-config-save', { silent: true, worldSections: [this.selectedType] });
      App.state = await Persistence.load();
    }

    if (UI.selectedPlanetId && !isEntityVisible(Data.getPlanet(UI.selectedPlanetId))) {
      UI.selectedPlanetId = null;
      $('#market-trigger').style.display = 'none';
    }

    App.renderLive();
    const playerSyncFailed = playerSyncRes && !playerSyncRes.ok && playerSyncRes.status !== 'disabled';
    if (playerSyncFailed) Toast.show(`Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¾, Ð½Ð¾ Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÑŒÐ½Ð°Ñ Ð·Ð°Ð¿Ð¸ÑÑŒ Ð½Ðµ Ð¾Ð±Ð½Ð¾Ð²Ð»ÐµÐ½Ð° Ð² Ð¾Ð±Ð»Ð°ÐºÐµ: ${playerSyncRes?.message || 'unknown error'}`, 'err');
    else if (snapshotSyncRes?.ok || snapshotSyncRes?.status === 'disabled') Toast.show(`${message}${snapshotSyncRes?.cloudBackupCreated ? '. ÐŸÑ€ÐµÐ´Ñ‹Ð´ÑƒÑ‰Ð°Ñ Ð¾Ð±Ð»Ð°Ñ‡Ð½Ð°Ñ Ñ€ÐµÐ²Ð¸Ð·Ð¸Ñ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð° Ð² Ñ€ÐµÐ·ÐµÑ€Ð²Ð½ÑƒÑŽ ÐºÐ¾Ð¿Ð¸ÑŽ' : ''}`, 'ok');
    else Toast.show(`Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¾, Ð½Ð¾ Ð¾Ð±Ð»Ð°ÐºÐ¾ Ð½Ðµ Ð¾Ð±Ð½Ð¾Ð²Ð»ÐµÐ½Ð¾: ${snapshotSyncRes?.message || 'unknown error'}`, 'err');
  },
  async resetWorldDefaults() {
    if (!window.electronAPI?.resetWorldData) {
      Toast.show('Ð¡Ð±Ñ€Ð¾Ñ Ñ„Ð°Ð¹Ð»Ð¾Ð² Ð¼Ð¸Ñ€Ð° Ð´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð² Electron', 'err');
      return;
    }
    const ok = await requestConfirmationV1090('Ð¡Ð±Ñ€Ð¾ÑÐ¸Ñ‚ÑŒ Ð²ÑÐµ Ñ„Ð°Ð¹Ð»Ñ‹ Ð¼Ð¸Ñ€Ð° Ðº Ð¸ÑÑ…Ð¾Ð´Ð½Ñ‹Ð¼ Ð·Ð½Ð°Ñ‡ÐµÐ½Ð¸ÑÐ¼?', { acceptLabel: 'Ð¡Ð±Ñ€Ð¾ÑÐ¸Ñ‚ÑŒ' });
    if (!ok) return;
    const res = await window.electronAPI.resetWorldData();
    if (!res?.ok) {
      Toast.show(`ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ ÑÐ±Ñ€Ð¾ÑÐ¸Ñ‚ÑŒ Ñ„Ð°Ð¹Ð»Ñ‹ Ð¼Ð¸Ñ€Ð°: ${res?.message || 'unknown'}`, 'err');
      return;
    }
    Sync.baselineToken = '';
    await Sync.checkForRemoteUpdates('world-reset-recovery', { applyIfNewer: true, force: true, silent: true });
    App.state = await Persistence.load();
    App.fillLoginSelect();
    this.selectedId = null;
    this.render();
    App.renderLive();
    Toast.show('Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ðµ Ñ„Ð°Ð¹Ð»Ñ‹ Ð²Ð¾ÑÑÑ‚Ð°Ð½Ð¾Ð²Ð»ÐµÐ½Ñ‹ Ð¸Ð· Ð¾Ð±Ð»Ð°ÐºÐ°. Ð”Ð°Ð½Ð½Ñ‹Ðµ ÑƒÑÑ‚Ð°Ð½Ð¾Ð²Ñ‰Ð¸ÐºÐ° Ð½Ðµ Ð¾Ñ‚Ð¿Ñ€Ð°Ð²Ð»ÑÐ»Ð¸ÑÑŒ.', 'ok');
  }
};



function ensureGalaxyLegend() {
  if (!App.state) App.state = makeDefaultState();
  if (!Array.isArray(App.state.galaxyLegend)) App.state.galaxyLegend = [];
  return App.state.galaxyLegend;
}

async function saveWorldConfigFromMap(message = 'Ð˜Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ñ‹') {
  const snapshot = buildWorldSnapshot();
  const res = await window.electronAPI.saveWorldData(snapshot);
  if (!res?.ok || !res.world) {
    Toast.show(`ÐžÑˆÐ¸Ð±ÐºÐ° Ð·Ð°Ð¿Ð¸ÑÐ¸ Ð¼Ð¸Ñ€Ð°: ${res?.message || 'unknown'}`, 'err');
    return false;
  }
  worldData = res.world;
  applyWorldData(res.world);
  Sync.markLocalDirty('WORLD_MAP_EDITOR_PENDING_SYNC');
  await Persistence.save(App.state);
  await Sync.pushCurrentSnapshot('world-map-editor-save', { silent: true });
  App.state = await Persistence.load();
  if (!Array.isArray(App.state.galaxyLegend)) App.state.galaxyLegend = [];
  App.renderLive();
  Toast.show(message, 'ok');
  return true;
}

function renderGalaxyLegendEditor() {
  const entries = ensureGalaxyLegend();
  const rows = entries.length ? entries : [{ color: '#7df9ff', label: 'ÐÐ¾Ð²Ð°Ñ Ñ„Ñ€Ð°ÐºÑ†Ð¸Ñ' }];
  return `
    <div class="field">
      <label>ÐÐ°Ð²Ð¸Ð³Ð°Ñ†Ð¸Ð¾Ð½Ð½Ñ‹Ðµ Ð¼ÐµÑ‚ÐºÐ¸ / Ñ„Ñ€Ð°ÐºÑ†Ð¸Ð¸</label>
      <div id="galaxy-legend-rows" class="dynamic-list" data-kind="galaxy-legend">
        ${rows.map(entry => `
          <div class="legend-row-editor dynamic-row">
            <input class="input" data-role="color" value="${esc(entry.color || '#7df9ff')}" placeholder="#7df9ff" />
            <input class="input" data-role="label" value="${esc(entry.label || '')}" placeholder="ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ñ„Ñ€Ð°ÐºÑ†Ð¸Ð¸ / Ð¾Ð±Ð¾Ð·Ð½Ð°Ñ‡ÐµÐ½Ð¸Ñ" />
            <button type="button" class="ghost remove-row-btn">REMOVE</button>
          </div>
        `).join('')}
      </div>
      <button id="add-legend-row-btn" class="secondary" type="button">ADD_LEGEND_ENTRY</button>
    </div>
  `;
}

function readGalaxyLegendRows(root) {
  return Array.from(root.querySelectorAll('.legend-row-editor')).map(row => ({
    color: String(row.querySelector('[data-role="color"]')?.value || '#7df9ff').trim() || '#7df9ff',
    label: String(row.querySelector('[data-role="label"]')?.value || '').trim()
  })).filter(entry => entry.label);
}

function renderGalaxyMapSystemQuickEditor(system) {
  const editableRoutes = renderSystemRoutesEditor(system.routes || [], system.id);
  return `
    <form id="galaxy-system-quick-form" class="form">
      <div class="section-title">Ð‘Ð«Ð¡Ð¢Ð Ð«Ð™ Ð Ð•Ð”ÐÐšÐ¢ÐžÐ  Ð¡Ð˜Ð¡Ð¢Ð•ÐœÐ«</div>
      <div class="cols2">
        <div class="field"><label>ÐœÐµÑ‚ÐºÐ° Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ</label><input class="input" name="markerLabel" value="${esc(system.markerLabel || system.name || '')}" /></div>
        <div class="field"><label>Ð’Ð½ÑƒÑ‚Ñ€ÐµÐ½Ð½ÐµÐµ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ</label><input class="input" name="name" value="${esc(system.name || '')}" /></div>
      </div>
      <div class="cols4 cols-responsive-4">
        <div class="field"><label>Ð¦Ð²ÐµÑ‚ ÑÐ¸ÑÑ‚ÐµÐ¼Ñ‹</label><input class="input" name="color" value="${esc(system.color || '#7df9ff')}" /></div>
        <div class="field"><label>Ð’Ð¸Ð´ Ð¼ÐµÑ‚ÐºÐ¸</label><select class="select" name="markerStyle">${SYSTEM_MARKER_STYLES.map(option => `<option value="${option.id}" ${option.id === (system.markerStyle || 'orbital') ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select></div>
        <div class="field"><label>Pos X (0..1)</label><input class="input" type="number" step="0.001" min="0" max="1" name="posX" value="${Number(system.pos?.x ?? 0.5)}" /></div>
        <div class="field"><label>Pos Y (0..1)</label><input class="input" type="number" step="0.001" min="0" max="1" name="posY" value="${Number(system.pos?.y ?? 0.5)}" /></div>
      </div>
      <div class="field"><label>ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚Ñ‹</label>${editableRoutes}</div>
      ${App.currentUser?.role === 'gm' ? renderGalaxyLegendEditor() : ''}
      <div class="row" style="justify-content:flex-end;gap:10px">
        <button class="secondary" type="button" id="galaxy-quick-open-config">OPEN_WORLD_CONFIG</button>
        <button class="primary" type="submit">SAVE_SYSTEM</button>
      </div>
    </form>
  `;
}

function renderGalaxyLegendOverlay() {
  let node = document.getElementById('galaxy-legend-overlay');
  if (!node) {
    node = document.createElement('div');
    node.id = 'galaxy-legend-overlay';
    node.className = 'galaxy-legend-overlay card';
    document.body.appendChild(node);
  }
  const worldLegend = Array.isArray(worldData?.ui?.galaxyLegend) ? worldData.ui.galaxyLegend : [];
  const stateLegend = Array.isArray(App?.state?.galaxyLegend) ? App.state.galaxyLegend : [];
  const entries = (stateLegend.length ? stateLegend : worldLegend).filter(entry => entry && (entry.label || entry.color));
  if (App?.state && (!Array.isArray(App.state.galaxyLegend) || !App.state.galaxyLegend.length) && worldLegend.length) {
    App.state.galaxyLegend = deep(worldLegend);
  }
  const showOverlay = !UI.activeModuleId && GalaxyMap?.state?.viewMode === 'galaxy';
  if (!showOverlay) {
    node.style.display = 'none';
    return;
  }
  const legendPalette = getEraGalaxyPaletteV1050();
  const markerMarkup = GALAXY_MARKER_LEGEND.map(entry => {
    const spriteUrl = eraMarkerAssetUrlV1055(entry.id, legendPalette);
    return `
      <div class="legend-chip legend-chip-marker">
        <span class="legend-marker legend-marker-${esc(entry.id)}">
          ${spriteUrl ? `<img class="legend-marker-sprite" src="${esc(spriteUrl)}" alt="" data-marker-sprite="1" />` : ''}
          <span class="legend-marker-fallback">${esc(entry.glyph)}</span>
        </span>
        <span>${esc(entry.label)}</span>
      </div>`;
  }).join('');
  const colorMarkup = entries.length
    ? `<div class="legend-group-title">Ð¦Ð’Ð•Ð¢ÐžÐ’Ð«Ð• ÐžÐ‘ÐžÐ—ÐÐÐ§Ð•ÐÐ˜Ð¯</div>${entries.map(entry => `<div class="legend-chip"><span class="legend-swatch" style="background:${esc(entry.color || '#7df9ff')}"></span><span>${esc(entry.label)}</span></div>`).join('')}`
    : '';
  node.style.display = 'block';
  node.innerHTML = `
    <div class="section-title">ÐÐÐ’Ð˜Ð“ÐÐ¦Ð˜Ð¯</div>
    <div class="legend-group-title">Ð¢Ð˜ÐŸÐ« ÐœÐ•Ð¢ÐžÐš</div>
    ${markerMarkup}
    ${colorMarkup}
  `;
  node.querySelectorAll('img[data-marker-sprite]').forEach(img => {
    const fallback = img.parentElement?.querySelector('.legend-marker-fallback');
    const sync = () => {
      const ok = Boolean(img.complete && img.naturalWidth && img.naturalHeight);
      img.classList.toggle('loaded', ok);
      if (fallback) fallback.style.display = ok ? 'none' : '';
    };
    img.addEventListener('load', sync, { once: true });
    img.addEventListener('error', sync, { once: true });
    sync();
  });
}

function renderGalaxyFocusButtonMarkup({ systemId = '', planetId = '', label = 'ÐŸÐµÑ€ÐµÐ¹Ñ‚Ð¸ Ðº ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ', subtle = '' } = {}) {
  const attrs = [
    systemId ? `data-focus-system="${esc(systemId)}"` : '',
    planetId ? `data-focus-planet="${esc(planetId)}"` : ''
  ].filter(Boolean).join(' ');
  if (!attrs) return '';
  return `
    <div class="wiki-map-action">
      <button class="secondary" type="button" ${attrs}>${esc(label)}</button>
      ${subtle ? `<div class="small-note">${esc(subtle)}</div>` : ''}
    </div>
  `;
}

function renderArticleGalaxyFocusMarkup(article) {
  const relatedPlanetIds = filterVisibleIds(article?.relatedPlanetIds || [], Data.getPlanet);
  if (!relatedPlanetIds.length) return '';
  const rendered = [];
  const seenSystems = new Set();
  for (const planetId of relatedPlanetIds) {
    const planet = Data.getPlanet(planetId);
    if (!planet) continue;
    const system = Data.getSystemForPlanet(planetId);
    if (!system || !isEntityVisible(system)) continue;
    if (seenSystems.has(`${system.id}::${planetId}`)) continue;
    seenSystems.add(`${system.id}::${planetId}`);
    rendered.push(renderGalaxyFocusButtonMarkup({
      systemId: system.id,
      planetId,
      label: relatedPlanetIds.length > 1 ? `ÐŸÐµÑ€ÐµÐ¹Ñ‚Ð¸ Ðº ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ: ${system.name || system.id}` : 'ÐŸÐµÑ€ÐµÐ¹Ñ‚Ð¸ Ðº ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ',
      subtle: planet.name ? `Ð¤Ð¾ÐºÑƒÑ Ð½Ð° ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ ${system.name || system.id} Ð¸ Ð¿Ð»Ð°Ð½ÐµÑ‚Ðµ ${planet.name}` : ''
    }));
  }
  if (!rendered.length) return '';
  return `<div class="section-title" style="margin-top:18px">ÐŸÐµÑ€ÐµÑ…Ð¾Ð´ Ð½Ð° ÐºÐ°Ñ€Ñ‚Ñƒ</div><div class="wiki-map-action-stack">${rendered.join('')}</div>`;
}

function bindGalaxyFocusWithin(root) {
  root?.querySelectorAll?.('[data-focus-system], [data-focus-planet]')?.forEach(node => {
    if (node.dataset.boundGalaxyFocus === '1') return;
    node.dataset.boundGalaxyFocus = '1';
    node.addEventListener('click', event => {
      event.preventDefault();
      const planetId = String(node.dataset.focusPlanet || '').trim();
      const directSystemId = String(node.dataset.focusSystem || '').trim();
      const systemId = directSystemId || (planetId ? (Data.getSystemForPlanet(planetId)?.id || '') : '');
      if (!systemId) {
        Toast.show('ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð½Ð°Ð¹Ñ‚Ð¸ ÑÐ¸ÑÑ‚ÐµÐ¼Ñƒ Ð´Ð»Ñ Ð¿ÐµÑ€ÐµÑ…Ð¾Ð´Ð°', 'err');
        return;
      }
      const ok = GalaxyMap.focusTarget(systemId, planetId || null);
      if (!ok) Toast.show('Ð¡Ð¸ÑÑ‚ÐµÐ¼Ð° Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ð½Ð° ÐºÐ°Ñ€Ñ‚Ðµ', 'err');
    });
  });
}

const GalaxyMap = {
  canvas: $('#galaxy'),
  ctx: null,
  DPR: Math.min(window.devicePixelRatio || 1, 1.25),
  MAX_DPR: 1.25,
  LITE_DPR: 0.75,
  TARGET_FPS: 60,
  LITE_ACTIVE_FPS: 15,
  frameTimerId: null,
  frameRequestId: null,
  animationRunning: false,
  lastFrameAt: 0,
  lastBackdropTransform: '',
  W: 0,
  H: 0,
  dragging: false,
  lastP: { x:0, y:0 },
  dragStart: { x:0, y:0 },
  state: { cx:0.5, cy:0.5, tx:0.5, ty:0.5, zoom:1, tzoom:1, mx:0.5, my:0.5, viewMode:'galaxy', activeSystemId:null },
  init() {
    this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.resize();
    this.bind();
    this.syncAnimationState();
  },
  bind() {
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.syncAnimationState());
    window.addEventListener('mousemove', event => {
      this.state.mx = event.clientX / window.innerWidth;
      this.state.my = event.clientY / window.innerHeight;
      if (!this.dragging) return;
      if (isMapInteractionBlocked(event.target)) {
        this.dragging = false;
        return;
      }
      this.state.tx -= (event.clientX - this.lastP.x) / (this.state.zoom * window.innerWidth);
      this.state.ty -= (event.clientY - this.lastP.y) / (this.state.zoom * window.innerHeight);
      this.lastP = { x:event.clientX, y:event.clientY };
      this.requestFrame();
    });
    window.addEventListener('mousedown', event => {
      if (isMapInteractionBlocked(event.target)) {
        this.dragging = false;
        return;
      }
      this.dragging = true;
      this.lastP = { x:event.clientX, y:event.clientY };
      this.dragStart = { x:event.clientX, y:event.clientY };
    });
    window.addEventListener('mouseup', event => {
      const wasDragging = this.dragging;
      const start = this.dragStart || { x: event.clientX, y: event.clientY };
      const dragDistance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      this.dragging = false;
      if (!wasDragging) return;
      if (isMapInteractionBlocked(event.target)) return;
      if (dragDistance < 5) this.handleClick(event.clientX, event.clientY);
    });
    window.addEventListener('wheel', event => {
      if (App.uiHoverLock || isMapInteractionBlocked(event.target)) return;
      this.state.tzoom = clamp(this.state.tzoom * (event.deltaY < 0 ? 1.18 : 0.84), 0.55, 30);
      if (this.state.viewMode === 'system' && event.deltaY > 0 && this.state.tzoom < 4.5) this.exitSystem(true);
      this.requestFrame();
    }, { passive:true });
  },
  resize() {
    const dprLimit = GraphicsMode.isLite() ? this.LITE_DPR : this.MAX_DPR;
    this.DPR = Math.min(window.devicePixelRatio || 1, dprLimit);
    this.W = Math.max(1, Math.round(window.innerWidth * this.DPR));
    this.H = Math.max(1, Math.round(window.innerHeight * this.DPR));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.syncBackdropTransform();
    this.requestFrame();
  },
  shouldAnimate() {
    if (document.hidden) return false;
    if (document.getElementById('login-screen')?.classList.contains('open')) return false;
    if (document.body?.classList.contains('module-open')) return false;
    return Boolean(App.currentUser);
  },
  cameraMoving() {
    const { state } = this;
    return Math.abs(state.cx - state.tx) > 0.00001
      || Math.abs(state.cy - state.ty) > 0.00001
      || Math.abs(state.zoom - state.tzoom) > 0.00001;
  },
  shouldContinueFrame() {
    return !GraphicsMode.isLite() || this.dragging || this.cameraMoving();
  },
  syncAnimationState() {
    if (this.shouldAnimate()) this.startAnimation();
    else this.stopAnimation();
  },
  startAnimation() {
    if (this.animationRunning) return;
    this.animationRunning = true;
    this.lastFrameAt = 0;
    this.scheduleFrame(0);
  },
  stopAnimation() {
    this.animationRunning = false;
    if (this.frameTimerId !== null) clearTimeout(this.frameTimerId);
    if (this.frameRequestId !== null) cancelAnimationFrame(this.frameRequestId);
    this.frameTimerId = null;
    this.frameRequestId = null;
  },
  scheduleFrame(delay = 0) {
    if (!this.animationRunning || this.frameTimerId !== null || this.frameRequestId !== null) return;
    this.frameTimerId = setTimeout(() => {
      this.frameTimerId = null;
      if (!this.animationRunning) return;
      this.frameRequestId = requestAnimationFrame(timestamp => {
        this.frameRequestId = null;
        this.tick(timestamp);
      });
    }, Math.max(0, delay));
  },
  tick(timestamp = performance.now()) {
    if (!this.animationRunning || !this.shouldAnimate()) {
      this.stopAnimation();
      return;
    }
    const frameStartedAt = performance.now();
    this.draw(timestamp);
    if (!this.shouldContinueFrame()) {
      this.stopAnimation();
      return;
    }
    const frameCost = performance.now() - frameStartedAt;
    const frameInterval = 1000 / (GraphicsMode.isLite() ? this.LITE_ACTIVE_FPS : this.TARGET_FPS);
    this.scheduleFrame(Math.max(0, frameInterval - frameCost));
  },
  requestFrame() {
    if (this.shouldAnimate()) this.startAnimation();
  },
  syncBackdropTransform() {
    const main = document.querySelector('.galaxy-backdrop-main');
    if (!main) return;
    if (GraphicsMode.isLite()) {
      if (main.style.transform) main.style.transform = '';
      this.lastBackdropTransform = '';
      return;
    }
    const zoom = Math.max(0.01, Number(this.state.zoom || 1));
    const tx = (0.5 - Number(this.state.cx || 0.5) * zoom) * window.innerWidth;
    const ty = (0.5 - Number(this.state.cy || 0.5) * zoom) * window.innerHeight;
    const transform = `matrix(${zoom.toFixed(5)},0,0,${zoom.toFixed(5)},${tx.toFixed(2)},${ty.toFixed(2)})`;
    if (transform === this.lastBackdropTransform) return;
    this.lastBackdropTransform = transform;
    main.style.transform = transform;
  },
  worldToScreen(x, y) {
    return { sx: (x - this.state.cx) * this.state.zoom * this.W + this.W / 2, sy: (y - this.state.cy) * this.state.zoom * this.H + this.H / 2 };
  },
  enterSystem(systemId) {
    const system = Data.getSystem(systemId);
    if (!system || !isEntityVisible(system)) return;
    this.state.viewMode = 'system';
    this.state.activeSystemId = systemId;
    AudioManager.play('systemJump', { volume: 0.86 });
    this.state.tx = system.pos.x;
    this.state.ty = system.pos.y;
    this.state.tzoom = 12.0;
    $('#back-to-galaxy').style.display = 'block';
    $('#hud-analysis').style.display = 'block';
    $('#obj-name').textContent = getSystemLabel(system).toUpperCase();
    $('#obj-subname').textContent = system.name && system.name !== getSystemLabel(system) ? system.name : 'ÐŸÑ€Ð¸Ð±Ð»Ð¸Ð¶ÐµÐ½Ð¸Ðµ Ðº ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ';
    $('#obj-id').textContent = system.id;
    $('#analysis-content').innerHTML = App.currentUser?.role === 'gm' ? renderGalaxyMapSystemQuickEditor(system) : '<div class="subtle">Ð’Ñ‹Ð±ÐµÑ€Ð¸ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñƒ Ð½Ð° Ð¾Ñ€Ð±Ð¸Ñ‚Ðµ Ð´Ð»Ñ Ð¿Ð¾Ð»ÑƒÑ‡ÐµÐ½Ð¸Ñ Ð¿Ð¾Ð´Ñ€Ð¾Ð±Ð½Ð¾Ð³Ð¾ ÑÐºÐ°Ð½Ð°.</div>';
    if (App.currentUser?.role === 'gm') bindGalaxyMapQuickEditor(system.id);
    $('#market-trigger').style.display = 'none';
    this.requestFrame();
  },
  exitSystem(preserveView = true) {
    const activeSystem = Data.getSystem(this.state.activeSystemId);
    this.state.viewMode = 'galaxy';
    this.state.activeSystemId = null;
    if (!preserveView) {
      this.state.tx = 0.5;
      this.state.ty = 0.5;
      this.state.tzoom = 1.0;
    } else if (activeSystem?.pos) {
      this.state.tx = activeSystem.pos.x;
      this.state.ty = activeSystem.pos.y;
    }
    UI.selectedPlanetId = null;
    $('#back-to-galaxy').style.display = 'none';
    $('#hud-analysis').style.display = 'none';
    renderGalaxyLegendOverlay();
    this.requestFrame();
  },
  recenterGalaxy() {
    this.state.viewMode = 'galaxy';
    this.state.activeSystemId = null;
    this.state.tx = 0.5;
    this.state.ty = 0.5;
    this.state.tzoom = 1.0;
    this.state.mx = 0.5;
    this.state.my = 0.5;
    UI.selectedPlanetId = null;
    $('#back-to-galaxy').style.display = 'none';
    $('#hud-analysis').style.display = 'none';
    $('#market-trigger').style.display = 'none';
    const objName = $('#obj-name');
    const objSub = $('#obj-subname');
    const objId = $('#obj-id');
    const analysis = $('#analysis-content');
    if (objName) objName.textContent = 'ÐžÐ‘ÐªÐ•ÐšÐ¢ ÐÐ• Ð’Ð«Ð‘Ð ÐÐ';
    if (objSub) objSub.textContent = 'Ð’Ñ‹Ð±ÐµÑ€Ð¸Ñ‚Ðµ ÑÐ¸ÑÑ‚ÐµÐ¼Ñƒ, Ð·Ð°Ñ‚ÐµÐ¼ Ð¿Ð»Ð°Ð½ÐµÑ‚Ñƒ';
    if (objId) objId.textContent = '---';
    if (analysis) analysis.innerHTML = '<div class="subtle">ÐšÐ°Ñ€Ñ‚Ð° Ð²Ð¾Ð·Ð²Ñ€Ð°Ñ‰ÐµÐ½Ð° Ðº Ñ†ÐµÐ½Ñ‚Ñ€Ñƒ Ð³Ð°Ð»Ð°ÐºÑ‚Ð¸ÐºÐ¸.</div>';
    renderGalaxyLegendOverlay();
    this.requestFrame();
  },
  focusTarget(systemId, planetId = null) {
    const system = Data.getSystem(systemId);
    if (!system || !isEntityVisible(system) || !system.pos) return false;
    UI.closeModule();
    this.state.tx = Number(system.pos.x || 0.5);
    this.state.ty = Number(system.pos.y || 0.5);
    this.state.mx = 0.5;
    this.state.my = 0.5;
    if (planetId) {
      this.state.viewMode = 'galaxy';
      this.state.activeSystemId = null;
      this.state.tzoom = 7.5;
      requestAnimationFrame(() => {
        try {
          this.enterSystem(systemId);
          if (planetId && Data.getPlanet(planetId)) UI.renderPlanetAnalysis(planetId, systemId);
        } catch (error) {
          console.warn('Galaxy focus planet failed', error);
        }
      });
      this.requestFrame();
      return true;
    }
    this.state.viewMode = 'galaxy';
    this.state.activeSystemId = null;
    this.state.tzoom = Math.max(5.2, Number(this.state.tzoom || 1));
    UI.selectedPlanetId = null;
    $('#back-to-galaxy').style.display = 'none';
    $('#hud-analysis').style.display = 'none';
    $('#market-trigger').style.display = 'none';
    const objName = $('#obj-name');
    const objSub = $('#obj-subname');
    const objId = $('#obj-id');
    const analysis = $('#analysis-content');
    if (objName) objName.textContent = getSystemLabel(system).toUpperCase();
    if (objSub) objSub.textContent = 'Ð¤Ð¾ÐºÑƒÑ ÐºÐ°Ð¼ÐµÑ€Ñ‹ Ð½Ð° ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ';
    if (objId) objId.textContent = system.id;
    if (analysis) analysis.innerHTML = `<div class="subtle">ÐšÐ°Ð¼ÐµÑ€Ð° ÑÑ„Ð¾ÐºÑƒÑÐ¸Ñ€Ð¾Ð²Ð°Ð½Ð° Ð½Ð° ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ ${esc(system.name || system.id)}.</div>`;
    renderGalaxyLegendOverlay();
    this.requestFrame();
    return true;
  },
  handleClick(mx, my) {
    const px = mx * this.DPR;
    const py = my * this.DPR;
    if (this.state.viewMode === 'galaxy') {
      for (const system of getVisibleSystems()) {
        const point = this.worldToScreen(system.pos.x, system.pos.y);
        if (Math.hypot(point.sx - px, point.sy - py) < 26 * 1.4 * this.DPR) return this.enterSystem(system.id);
      }
      return;
    }

    const system = Data.getSystem(this.state.activeSystemId);
    if (!system || !isEntityVisible(system)) return;
    const center = this.worldToScreen(system.pos.x, system.pos.y);
    const t = GraphicsMode.isLite() ? 0 : now() * 0.001;
    for (const planet of getVisiblePlanetsForSystem(system)) {
      const dist = planet.dist * this.state.zoom * (this.W / 2000);
      const ang = t * planet.speed * 50;
      const x = center.sx + Math.cos(ang) * dist;
      const y = center.sy + Math.sin(ang) * dist;
      if (Math.hypot(x - px, y - py) < 24 * this.DPR) {
        UI.renderPlanetAnalysis(planet.id, system.id);
        return;
      }
    }
  },
  draw(timestamp = performance.now()) {
    const { ctx, W, H, state } = this;
    const lite = GraphicsMode.isLite();
    const elapsedFrames = this.lastFrameAt ? clamp((timestamp - this.lastFrameAt) / (1000 / 60), 0.5, 4) : 1;
    const smoothing = 1 - Math.pow(1 - 0.08, elapsedFrames);
    this.lastFrameAt = timestamp;
    state.cx = lerp(state.cx, state.tx, smoothing);
    state.cy = lerp(state.cy, state.ty, smoothing);
    state.zoom = lerp(state.zoom, state.tzoom, smoothing);
    if (Math.abs(state.cx - state.tx) < 0.00001) state.cx = state.tx;
    if (Math.abs(state.cy - state.ty) < 0.00001) state.cy = state.ty;
    if (Math.abs(state.zoom - state.tzoom) < 0.00001) state.zoom = state.tzoom;

    ctx.clearRect(0, 0, W, H);
    if (lite) {
      ctx.fillStyle = '#05080d';
      ctx.fillRect(0, 0, W, H);
    }
    this.syncBackdropTransform();

    const currentLocation = getPlayerCurrentLocation(App.currentUser);
    const currentSystemId = currentLocation.system?.id || null;
    const currentPlanetId = currentLocation.planet?.id || null;
    const eraPalette = getEraGalaxyPaletteV1050();

    if (state.viewMode === 'galaxy') {
      const routes = getVisibleSystemRoutes(App.currentUser);
      routes.forEach(route => {
        const from = this.worldToScreen(route.from.pos.x, route.from.pos.y);
        const to = this.worldToScreen(route.to.pos.x, route.to.pos.y);
        const midX = (from.sx + to.sx) / 2;
        const midY = (from.sy + to.sy) / 2;
        const rgb = hexToRgbString(eraPalette.route, '50,141,255');
        ctx.save();
        ctx.lineCap = 'round';
        if (!lite) {
          const glow = ctx.createLinearGradient(from.sx, from.sy, to.sx, to.sy);
          glow.addColorStop(0, `rgba(${rgb},0.04)`);
          glow.addColorStop(0.5, `rgba(${rgb},0.22)`);
          glow.addColorStop(1, `rgba(${rgb},0.04)`);
          ctx.strokeStyle = glow;
          ctx.lineWidth = (route.width + 5) * this.DPR;
          ctx.beginPath();
          ctx.moveTo(from.sx, from.sy);
          ctx.lineTo(to.sx, to.sy);
          ctx.stroke();
        }
        ctx.strokeStyle = `rgba(${rgb},0.72)`;
        ctx.lineWidth = Math.max(0.75, (lite ? 0.8 : route.width) * this.DPR);
        if (!lite) ctx.setLineDash([10 * this.DPR, 8 * this.DPR]);
        ctx.beginPath();
        ctx.moveTo(from.sx, from.sy);
        ctx.lineTo(to.sx, to.sy);
        ctx.stroke();
        if (!lite) ctx.setLineDash([]);
        if (route.label) {
          ctx.font = `${9 * this.DPR}px Consolas`;
          if (!lite) {
            ctx.lineWidth = 3 * this.DPR;
            ctx.strokeStyle = 'rgba(4,10,18,0.9)';
            ctx.strokeText(route.label, midX + 8 * this.DPR, midY - 8 * this.DPR);
          }
          ctx.fillStyle = `rgba(${rgb},0.92)`;
          ctx.fillText(route.label, midX + 8 * this.DPR, midY - 8 * this.DPR);
        }
        ctx.restore();
      });
    }

    const visibleSystemEntries = getVisibleSystems().map(system => ({ system, point: this.worldToScreen(system.pos.x, system.pos.y) }));
    const markerScaleMap = state.viewMode === 'galaxy'
      ? computeGalaxyMarkerScaleMapV1058(visibleSystemEntries.map(({ system, point }) => ({
          id: system.id,
          x: point.sx,
          y: point.sy,
          size: ((system.id === state.activeSystemId ? 13 : 8) * 1.4 * this.DPR)
        })), this.DPR)
      : new Map();

    for (const { system, point } of visibleSystemEntries) {
      const active = system.id === state.activeSystemId;
      const isCurrentSystem = currentSystemId === system.id;
      if (state.viewMode === 'galaxy' || active) {
        const systemColor = String(system.color || eraPalette.marker || '#7df9ff').trim() || '#7df9ff';
        const ringColor = active ? '245,252,255' : hexToRgbString(systemColor, '96,201,255');
        const markerScale = markerScaleMap.get(system.id) || 1;
        const size = ((active ? 13 : 8) * 1.4 * this.DPR) * markerScale;
        if (lite) {
          ctx.fillStyle = systemColor;
          ctx.beginPath();
          ctx.arc(point.sx, point.sy, Math.max(2, size * 0.7), 0, Math.PI * 2);
          ctx.fill();
          if (active) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, this.DPR);
            ctx.stroke();
          }
        } else {
          const halo = ctx.createRadialGradient(point.sx, point.sy, 0, point.sx, point.sy, size * 4.2);
          halo.addColorStop(0, active ? 'rgba(255,255,255,0.8)' : `rgba(${ringColor},0.42)`);
          halo.addColorStop(0.2, active ? 'rgba(255,255,255,0.28)' : `rgba(${ringColor},0.12)`);
          halo.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(point.sx, point.sy, size * 4.2, 0, Math.PI * 2);
          ctx.fill();
          drawSystemMarker(ctx, point, size, system, { active, dpr: this.DPR, glow: 1, palette: eraPalette });
        }

        if (isCurrentSystem && state.viewMode === 'galaxy') {
          const pulse = lite ? 1 : 1 + 0.08 * Math.sin(now() * 0.004);
          ctx.save();
          if (!lite) ctx.setLineDash([7 * this.DPR, 7 * this.DPR]);
          ctx.lineWidth = 1.6 * this.DPR;
          ctx.strokeStyle = `rgba(${hexToRgbString(systemColor, '125,249,255')},0.85)`;
          ctx.beginPath();
          ctx.arc(point.sx, point.sy, size * 3.5 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          ctx.font = `bold ${10 * this.DPR}px Consolas`;
          if (!lite) {
            ctx.lineWidth = 4 * this.DPR;
            ctx.strokeStyle = 'rgba(3,8,16,0.9)';
            ctx.strokeText('YOU ARE HERE', point.sx + size + 6 * this.DPR, point.sy + 16 * this.DPR);
          }
          ctx.fillStyle = eraPalette.text;
          ctx.fillText('YOU ARE HERE', point.sx + size + 6 * this.DPR, point.sy + 16 * this.DPR);
          if (currentLocation.planet) {
            ctx.font = `${9 * this.DPR}px Consolas`;
            if (!lite) ctx.strokeText(currentLocation.planet.name, point.sx + size + 6 * this.DPR, point.sy + 29 * this.DPR);
            ctx.fillText(currentLocation.planet.name, point.sx + size + 6 * this.DPR, point.sy + 29 * this.DPR);
          }
        }

        const galaxyLabelFade = clamp((state.zoom - 2.75) / 1.4, 0, 1);
        if (state.viewMode === 'galaxy' && galaxyLabelFade > 0.02) {
          ctx.save();
          ctx.globalAlpha = galaxyLabelFade;
          ctx.font = `${11 * this.DPR}px Consolas`;
          const labelText = getSystemLabel(system);
          if (!lite) {
            ctx.lineWidth = 4 * this.DPR;
            ctx.strokeStyle = 'rgba(4,10,18,0.86)';
            ctx.strokeText(labelText, point.sx + size + 6 * this.DPR, point.sy - 6 * this.DPR);
          }
          ctx.fillStyle = `rgba(${ringColor},0.96)`;
          ctx.fillText(labelText, point.sx + size + 6 * this.DPR, point.sy - 6 * this.DPR);
          ctx.restore();
        }
      }
      if (active && state.zoom > 4) {
        const t = lite ? 0 : now() * 0.001;
        for (const planet of getVisiblePlanetsForSystem(system)) {
          const dist = planet.dist * state.zoom * (W / 2000);
          const ang = t * planet.speed * 50;
          const x = point.sx + Math.cos(ang) * dist;
          const y = point.sy + Math.sin(ang) * dist;
          ctx.strokeStyle = eraPalette.orbit;
          ctx.beginPath();
          ctx.arc(point.sx, point.sy, dist, 0, Math.PI * 2);
          ctx.stroke();

          const planetColor = planet.color || '#7df9ff';
          const spriteDrawn = !lite && drawEraMarkerSpriteV1055(ctx, 'planet', x, y, planet.size * this.DPR, planetColor, eraPalette, { dpr: this.DPR, active: UI.selectedPlanetId === planet.id });
          if (!spriteDrawn) {
            if (!lite) {
              const glow = ctx.createRadialGradient(x, y, 0, x, y, planet.size * 3.2 * this.DPR);
              glow.addColorStop(0, planetColor);
              glow.addColorStop(1, 'transparent');
              ctx.fillStyle = glow;
              ctx.beginPath();
              ctx.arc(x, y, planet.size * 3.2 * this.DPR, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.fillStyle = planetColor;
            ctx.beginPath();
            ctx.arc(x, y, planet.size * this.DPR, 0, Math.PI * 2);
            ctx.fill();
          }

          if (UI.selectedPlanetId === planet.id) {
            if (!lite) ctx.setLineDash([6 * this.DPR, 6 * this.DPR]);
            ctx.strokeStyle = `rgba(${hexToRgbString(eraPalette.marker, '96,201,255')},0.28)`;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(W - 20 * this.DPR, y);
            ctx.stroke();
            if (!lite) ctx.setLineDash([]);
          }

          if (planet.id === currentPlanetId) {
            ctx.save();
            if (!lite) ctx.setLineDash([4 * this.DPR, 5 * this.DPR]);
            ctx.strokeStyle = 'rgba(230,248,255,0.9)';
            ctx.lineWidth = 1.4 * this.DPR;
            ctx.beginPath();
            ctx.arc(x, y, planet.size * this.DPR * 2.6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = `${9 * this.DPR}px Consolas`;
            if (!lite) {
              ctx.lineWidth = 3 * this.DPR;
              ctx.strokeStyle = 'rgba(3,8,16,0.92)';
              ctx.strokeText('YOU ARE HERE', x + 12 * this.DPR, y - 10 * this.DPR);
            }
            ctx.fillStyle = 'rgba(235,248,255,0.96)';
            ctx.fillText('YOU ARE HERE', x + 12 * this.DPR, y - 10 * this.DPR);
            ctx.restore();
          }
        }
      }
    }
  }
};


window.addEventListener('load', () => {
  App.init().catch(error => {
    console.error('APP_INIT_FAILED', error);
    const message = `ÐžÑˆÐ¸Ð±ÐºÐ° Ð·Ð°Ð¿ÑƒÑÐºÐ°: ${error?.message || String(error)}`;
    const errorNode = document.getElementById('login-error');
    if (errorNode) errorNode.textContent = message;
    const login = document.getElementById('login-screen');
    if (login) login.classList.remove('hidden');
    const boot = document.getElementById('boot-screen');
    if (boot) boot.classList.add('hidden');
  });
});
// === v0.3.8 extension patch: rich text, news, tasks, ambient controls ===
let NEWS = {};
let NEWS_LIST = [];
let TASKS = {};
let TASK_LIST = [];

WORLD_SECTIONS.news = { label: 'ÐÐ¾Ð²Ð¾ÑÑ‚Ð¸', mapKey: 'NEWS', listKey: 'NEWS_LIST' };
WORLD_SECTIONS.tasks = { label: 'Ð—Ð°Ð´Ð°Ð½Ð¸Ñ', mapKey: 'TASKS', listKey: 'TASK_LIST' };
Data.news = NEWS;
Data.tasks = TASKS;

const __renderRichText = (value, fallback = '', options = {}) => {
  const html = String(value ?? '').trim();
  if (!html) return fallback;
  if (window.GRPGRichTextScope?.isolateHtml) return window.GRPGRichTextScope.isolateHtml(html, 'rich-text', options);
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('style, script, link[rel~="stylesheet"], link[as="style"]').forEach(node => node.remove());
  return `<div class="rich-text grpgi-rich-scope-v1081">${template.innerHTML}</div>`;
};
const __htmlHint = '<div class="small-note">ÐŸÐšÐœ Ð² Ð¿Ð¾Ð»Ðµ Ð¾Ñ‚ÐºÑ€Ñ‹Ð²Ð°ÐµÑ‚ Ð²ÑÑ‚Ð°Ð²ÐºÑƒ Ð¸Ð·Ð¾Ð±Ñ€Ð°Ð¶ÐµÐ½Ð¸Ñ Ñ ÐºÐ¾Ð¼Ð¿ÑŒÑŽÑ‚ÐµÑ€Ð°, ÑÑÑ‹Ð»ÐºÐ¸ Ð½Ð° ÑÑ‚Ð°Ñ‚ÑŒÑŽ Ð¸Ð»Ð¸ ÑÑÑ‹Ð»ÐºÐ¸ Ð½Ð° Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ð°. HTML-Ñ€Ð°Ð·Ð¼ÐµÑ‚ÐºÑƒ Ñ‚Ð°ÐºÐ¶Ðµ Ð¼Ð¾Ð¶Ð½Ð¾ Ð²Ð²Ð¾Ð´Ð¸Ñ‚ÑŒ Ð²Ñ€ÑƒÑ‡Ð½ÑƒÑŽ.</div>';

function __resolveLocalArticleLink(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = raw.match(/^(?:article:|local-article:)(.+)$/i);
  if (direct) return String(direct[1] || '').replace(/^\/+/, '').trim();
  const uri = raw.match(/^(?:article|local-article):\/\/(.+)$/i);
  if (uri) return String(uri[1] || '').replace(/^\/+/, '').trim();
  return '';
}

function __bindLocalArticleLinks(root = document) {
  if (!root || root.__localArticleLinksBound) return;
  root.__localArticleLinksBound = true;
  const openArticle = articleId => {
    const normalizedId = String(articleId || '').trim();
    if (!normalizedId) return;
    const article = Data?.getArticle?.(normalizedId);
    if (!article) {
      Toast.show(`Ð¡Ñ‚Ð°Ñ‚ÑŒÑ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð°: ${normalizedId}`, 'err');
      return;
    }
    Wiki.directArticleIdV1082 = normalizedId;
    Wiki.showEntity('article', normalizedId, true);
  };
  const resolveChatTarget = link => {
    const raw = String(link?.getAttribute?.('href') || '').trim();
    const match = raw.match(/^(player|character|npc):(?:\/\/)?(.+)$/i);
    const entityType = String(link?.dataset?.entityType || match?.[1] || '').toLowerCase();
    const entityId = String(link?.dataset?.entityId || match?.[2] || '').replace(/^\/+/, '').trim();
    return { entityType: entityType === 'character' ? 'player' : entityType, entityId };
  };
  const openChatTarget = ({ entityType, entityId } = {}) => {
    if (!['player', 'npc'].includes(entityType) || !entityId) return;
    const entity = entityType === 'npc'
      ? Data?.getNpc?.(entityId)
      : (App.state?.users?.[entityId] || PLAYER_TEMPLATES?.[entityId]);
    if (!entity) {
      Toast.show('ÐŸÐµÑ€ÑÐ¾Ð½Ð°Ð¶ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½', 'err');
      return;
    }
    if (String(App.currentUser?.role || '').toLowerCase() === 'gm') {
      MessagesUI.gmSearch = String(entity.name || entity.displayName || entityId);
      MessagesUI.selectedGmKind = null;
      MessagesUI.selectedGmKey = null;
    } else {
      MessagesUI.playerSearch = '';
      MessagesUI.selectedPlayerKind = entityType === 'npc' ? 'npc' : 'direct';
      MessagesUI.selectedPlayerKey = entityId;
    }
    UI.openModule('messages');
  };
  root.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href], a[data-article-id], [data-article-link], a[data-entity-id]');
    if (!link) return;
    const articleId = String(link.dataset?.articleId || link.dataset?.articleLink || __resolveLocalArticleLink(link.getAttribute('href') || '')).trim();
    if (articleId) {
      event.preventDefault();
      event.stopPropagation();
      openArticle(articleId);
      return;
    }
    const target = resolveChatTarget(link);
    if (!target.entityId || !['player', 'npc'].includes(target.entityType)) return;
    event.preventDefault();
    event.stopPropagation();
    openChatTarget(target);
  });
  root.addEventListener('grpgi:article-link-v1083', event => openArticle(event.detail?.articleId));
  root.addEventListener('grpgi:entity-link-v1085', event => openChatTarget(event.detail));
}

const __applyWorldData = applyWorldData;
applyWorldData = function(payload = {}) {
  __applyWorldData(payload);
  NEWS = payload.news?.NEWS || {};
  NEWS_LIST = payload.news?.NEWS_LIST || Object.values(NEWS);
  TASKS = payload.tasks?.TASKS || {};
  TASK_LIST = payload.tasks?.TASK_LIST || Object.values(TASKS);
  Data.news = NEWS;
  Data.tasks = TASKS;
};

const __buildWorldSnapshot = buildWorldSnapshot;
buildWorldSnapshot = function() {
  const snap = __buildWorldSnapshot();
  snap.news = serializeWorldSection('news', NEWS);
  snap.tasks = serializeWorldSection('tasks', TASKS);
  return snap;
};

const __createBlankEntity = createBlankEntity;
createBlankEntity = function(type) {
  const stamp = Date.now().toString().slice(-6);
  if (type === 'news') {
    return { id: `news_${stamp}`, name: 'ÐÐ¾Ð²Ð°Ñ Ð½Ð¾Ð²Ð¾ÑÑ‚ÑŒ', title: 'ÐÐ¾Ð²Ð°Ñ Ð½Ð¾Ð²Ð¾ÑÑ‚ÑŒ', subtitle: '', body: '', image: '', publishedAt: new Date().toISOString(), visibility: { playerIds: [] } };
  }
  if (type === 'tasks') {
    return { id: `task_${stamp}`, name: 'ÐÐ¾Ð²Ð¾Ðµ Ð·Ð°Ð´Ð°Ð½Ð¸Ðµ', title: 'ÐÐ¾Ð²Ð¾Ðµ Ð·Ð°Ð´Ð°Ð½Ð¸Ðµ', subtitle: '', summary: '', body: '', reward: '', status: 'open', image: '', relatedArticleIds: [], visibility: { playerIds: [] } };
  }
  return __createBlankEntity(type);
};

const __entityByType = entityByType;
entityByType = function(type, id) {
  if (type === 'news') return Data.getNews(id);
  if (type === 'task') return Data.getTask(id);
  return __entityByType(type, id);
};

const __titleForEntity = titleForEntity;
titleForEntity = function(type, entity) {
  if (type === 'news' || type === 'task') return entity?.title || entity?.name || entity?.id || 'Entity';
  return __titleForEntity(type, entity);
};

Data.getNews = function(id) { return this.news[id] || null; };
Data.getTask = function(id) { return this.tasks[id] || null; };

const __appendNpcChatMessage = appendNpcChatMessage;
appendNpcChatMessage = function(npcId, playerId, payload = {}) {
  const message = __appendNpcChatMessage(npcId, playerId, payload);
  if (message && message.sender === 'player') {
    appendGmReport({
      playerId,
      category: 'npc-message',
      title: 'ÐÐ¾Ð²Ð¾Ðµ ÑÐ¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ðµ NPC',
      text: `ÐÐ¾Ð²Ð¾Ðµ ÑÐ¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ðµ Ð¾Ñ‚ "${getPlayerDisplayName(playerId)}" Ð¿ÐµÑ€ÑÐ¾Ð½Ð°Ð¶Ñƒ "${Data.getNpc(npcId)?.name || npcId}".`,
      details: String(payload.text || '')
    });
  }
  return message;
};

const __ensureAmbient = AudioManager.ensureAmbient.bind(AudioManager);
AudioManager.ambientVolume = Number(localStorage.getItem('galactic-ambient-volume') || '0.22');
if (!Number.isFinite(AudioManager.ambientVolume)) AudioManager.ambientVolume = 0.22;
AudioManager.ensureAmbient = function() {
  const node = __ensureAmbient();
  if (node) node.volume = clamp(this.ambientVolume, 0, 1) * this.masterVolume;
  return node;
};
AudioManager.setAmbientVolume = function(value) {
  this.ambientVolume = clamp(Number(value ?? this.ambientVolume), 0, 1);
  try { localStorage.setItem('galactic-ambient-volume', String(this.ambientVolume)); } catch {}
  if (this.ambientNode) this.ambientNode.volume = this.ambientVolume * this.masterVolume;
};

UI.renderNews = function() {
  const visible = Object.values(NEWS).filter(entry => isEntityVisible(entry)).sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  const root = $('#news-content');
  if (!root) return;
  root.innerHTML = `
    <div class="news-stack">
      ${visible.length ? visible.map(entry => `
        <article class="card pad18 news-card">
          <div class="news-card-head">
            ${renderThumb(entry, { size: 'md', type: 'news', glyph: 'âœ¦' })}
            <div>
              <div class="section-title">ÐÐžÐ’ÐžÐ¡Ð¢Ð¬</div>
              <h2>${esc(entry.title || entry.name || 'Ð‘ÐµÐ· Ð·Ð°Ð³Ð¾Ð»Ð¾Ð²ÐºÐ°')}</h2>
              ${entry.subtitle ? `<div class="subtle">${esc(entry.subtitle)}</div>` : ''}
              <div class="small-note">${esc(formatLoreDateV1075(entry.publishedAt || Date.now()))}</div>
            </div>
          </div>
          ${__renderRichText(entry.body, '<div class="small-note">ÐÐµÑ‚ Ñ‚ÐµÐºÑÑ‚Ð° Ð½Ð¾Ð²Ð¾ÑÑ‚Ð¸.</div>')}
        </article>
      `).join('') : '<div class="card pad18 small-note">ÐŸÐ¾ÐºÐ° Ð½ÐµÑ‚ Ð¾Ð¿ÑƒÐ±Ð»Ð¸ÐºÐ¾Ð²Ð°Ð½Ð½Ñ‹Ñ… Ð½Ð¾Ð²Ð¾ÑÑ‚ÐµÐ¹.</div>'}
    </div>
  `;
};

UI.renderTasks = function() {
  const visible = Object.values(TASKS).filter(entry => isEntityVisible(entry));
  const root = $('#tasks-content');
  if (!root) return;
  const columns = [
    { key: 'open', label: 'ÐÐµ Ð¿Ñ€Ð¸Ð½ÑÑ‚Ñ‹Ðµ' },
    { key: 'active', label: 'ÐÐºÑ‚Ð¸Ð²Ð½Ñ‹Ðµ' },
    { key: 'completed', label: 'Ð—Ð°Ð²ÐµÑ€ÑˆÑ‘Ð½Ð½Ñ‹Ðµ' }
  ];
  root.innerHTML = `
    <div class="task-board">
      ${columns.map(column => `
        <section class="card pad18 task-column">
          <div class="section-title">${column.label}</div>
          <div class="task-column-stack">
            ${visible.filter(task => (task.status || 'open') === column.key).map(task => `
              <article class="task-card">
                <div class="task-card-head">
                  ${renderThumb(task, { size: 'sm', type: 'task', glyph: 'â—«' })}
                  <div>
                    <b>${esc(task.title || task.name || 'Ð‘ÐµÐ· Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ñ')}</b>
                    ${task.subtitle ? `<div class="subtle">${esc(task.subtitle)}</div>` : ''}
                  </div>
                </div>
                ${task.reward ? `<div class="chip" style="margin:8px 0">ÐÐÐ“Ð ÐÐ”Ð: ${esc(task.reward)}</div>` : ''}
                ${task.summary ? `<div class="small-note" style="margin-bottom:8px">${esc(task.summary)}</div>` : ''}
                ${__renderRichText(task.body, '')}
                ${renderRelatedArticlesSection(task.relatedArticleIds || [], 'ÐœÐ°Ñ‚ÐµÑ€Ð¸Ð°Ð»Ñ‹ Ð¿Ð¾ Ð·Ð°Ð´Ð°Ð½Ð¸ÑŽ')}
              </article>
            `).join('') || '<div class="small-note">ÐŸÑƒÑÑ‚Ð¾</div>'}
          </div>
        </section>
      `).join('')}
    </div>
  `;
  UI.attachEntityLinks(root);
};

const __openModule = UI.openModule.bind(UI);
UI.openModule = function(id, options = {}) {
  if (id === 'news') this.renderNews();
  if (id === 'tasks') this.renderTasks();
  return __openModule(id, options);
};

const __bindStaticEvents = App.bindStaticEvents.bind(App);
App.bindStaticEvents = function() {
  __bindStaticEvents();
  $('#open-news')?.addEventListener('click', () => UI.openModule('news'));
  $('#open-tasks')?.addEventListener('click', () => UI.openModule('tasks'));
  $('#ambient-volume')?.addEventListener('input', event => {
    AudioManager.setAmbientVolume(event.target.value);
    const label = $('#ambient-volume-value');
    if (label) label.textContent = `${Math.round(AudioManager.ambientVolume * 100)}%`;
    AudioManager.onUserGesture();
  });
  $('#ambient-mute-btn')?.addEventListener('click', () => {
    AudioManager.setAmbientVolume(AudioManager.ambientVolume > 0 ? 0 : 0.22);
    const slider = $('#ambient-volume');
    if (slider) slider.value = String(AudioManager.ambientVolume);
    const label = $('#ambient-volume-value');
    if (label) label.textContent = `${Math.round(AudioManager.ambientVolume * 100)}%`;
  });
};

const __appInit = App.init.bind(App);
App.init = async function() {
  await __appInit();
  const slider = $('#ambient-volume');
  if (slider) slider.value = String(AudioManager.ambientVolume);
  const label = $('#ambient-volume-value');
  if (label) label.textContent = `${Math.round(AudioManager.ambientVolume * 100)}%`;
};

const __wikiShowEntity = Wiki.showEntity.bind(Wiki);
Wiki.showEntity = function(type, id, autoOpen = false) {
  if (!['system', 'planet', 'article'].includes(type)) {
    return __wikiShowEntity(type, id, autoOpen);
  }
  this.currentView = { type, id };
  const entity = entityByType(type, id);
  const directArticleAccess = type === 'article' && String(this.directArticleIdV1082 || '') === String(id || '');
  if (!entity || (!directArticleAccess && !isEntityVisible(entity))) {
    $('#wiki-detail').innerHTML = '<div class="subtle">Ð­Ñ‚Ð° Ð·Ð°Ð¿Ð¸ÑÑŒ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð° Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¼Ñƒ Ð¿Ð¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ñ‚ÐµÐ»ÑŽ.</div>';
    if (autoOpen && UI.activeModuleId !== 'wiki') UI.openModule('wiki', { preserveWikiState: true });
    return;
  }
  if (autoOpen && UI.activeModuleId !== 'wiki') UI.openModule('wiki', { preserveWikiState: true });
  const target = $('#wiki-detail');
  if (type === 'system') {
    const planets = getVisiblePlanetsForSystem(entity);
    target.innerHTML = `
      <div class="wiki-hero">
        ${renderThumb(entity, { size: 'hero', type: 'system', glyph: initials(entity.name, 'âœ¦') })}
        <div>
          <div class="section-title">Ð—Ð²Ñ‘Ð·Ð´Ð½Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°</div>
          <h2 class="mono accent">${esc(entity.name)}</h2>
          <div class="subtle">ÐšÐ¾Ð¾Ñ€Ð´Ð¸Ð½Ð°Ñ‚Ñ‹: ${esc(entity.pos?.x)} / ${esc(entity.pos?.y)}</div>
          ${__renderRichText(entity.summary || entity.body || '', '')}
        </div>
      </div>
      ${renderGalaxyFocusButtonMarkup({ systemId: entity.id })}
      <div class="section-title">ÐŸÐ»Ð°Ð½ÐµÑ‚Ñ‹</div>
      <div class="result-stack">${planets.map(planet => renderEntityButton('planet', planet, { subtitle: planet.code || planet.location?.system || '', thumbSize: 'md' })).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ð¿Ð»Ð°Ð½ÐµÑ‚ Ð² ÑÑ‚Ð¾Ð¹ ÑÐ¸ÑÑ‚ÐµÐ¼Ðµ.</div>'}</div>
      ${renderRelatedArticlesSection(entity.relatedArticleIds)}
    `;
  } else if (type === 'planet') {
    target.innerHTML = `
      <div class="wiki-hero">
        ${renderThumb(entity, { size: 'hero', type: 'planet', glyph: initials(entity.name, 'â—Œ') })}
        <div>
          <div class="section-title">ÐŸÐ»Ð°Ð½ÐµÑ‚Ð°</div>
          <h2 class="mono accent">${esc(entity.name)}</h2>
          <div class="subtle">${esc(entity.code || '')} Â· ${esc(entity.location?.system || '')}</div>
          ${__renderRichText(getPlanetInfo(entity), '<p>ÐÐµÑ‚ Ð¸Ð½Ñ„Ð¾Ñ€Ð¼Ð°Ñ†Ð¸Ð¸</p>')}
        </div>
      </div>
      <div class="wiki-data-grid">
        <div class="card pad18">
          <div class="section-title">Ð¤Ð¸Ð·Ð¸ÐºÐ°</div>
          <div class="data-row"><span class="data-label">Ð¢Ð¸Ð¿</span><span class="data-value">${esc(entity.physics?.type || '')}</span></div>
          <div class="data-row"><span class="data-label">ÐšÐ»Ð¸Ð¼Ð°Ñ‚</span><span class="data-value">${esc(entity.physics?.climate || '')}</span></div>
          <div class="data-row"><span class="data-label">Ð“Ñ€Ð°Ð²Ð¸Ñ‚Ð°Ñ†Ð¸Ñ</span><span class="data-value">${esc(entity.physics?.gravity || '')}</span></div>
          <div class="data-row"><span class="data-label">ÐÑ‚Ð¼Ð¾ÑÑ„ÐµÑ€Ð°</span><span class="data-value">${esc(entity.physics?.atm || '')}</span></div>
        </div>
        <div class="card pad18">
          <div class="section-title">ÐžÐ±Ñ‰ÐµÑÑ‚Ð²Ð¾</div>
          <div class="data-row"><span class="data-label">ÐÐ°ÑÐµÐ»ÐµÐ½Ð¸Ðµ</span><span class="data-value">${esc(entity.socio?.pop || '')}</span></div>
          <div class="data-row"><span class="data-label">Ð¡Ñ‚Ð¾Ð»Ð¸Ñ†Ð°</span><span class="data-value">${esc(entity.socio?.capital || '')}</span></div>
          <div class="data-row"><span class="data-label">ÐŸÑ€Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ</span><span class="data-value">${esc(entity.socio?.gov || '')}</span></div>
          <div class="small-note" style="margin-top:8px">${esc(entity.socio?.law || '')}</div>
        </div>
      </div>
      ${entity.pilot?.warning ? `<div class="card pad18" style="margin-top:18px"><div class="section-title">ÐŸÑ€ÐµÐ´ÑƒÐ¿Ñ€ÐµÐ¶Ð´ÐµÐ½Ð¸Ðµ</div>${__renderRichText(entity.pilot?.warning, '')}</div>` : ''}
      <div class="section-title" style="margin-top:18px">ÐšÐ»ÑŽÑ‡ÐµÐ²Ñ‹Ðµ NPC</div>
      <div class="tags entity-button-row">${UI.socialNpcMarkup(entity.npcIds)}</div>
      <div class="section-title" style="margin-top:18px">Ð¤Ð»Ð¾Ñ€Ð°</div>
      <div class="tags entity-button-row">${UI.floraMarkup(entity.floraIds)}</div>
      <div class="section-title" style="margin-top:18px">Ð¤Ð°ÑƒÐ½Ð°</div>
      <div class="tags entity-button-row">${UI.faunaMarkup(entity.faunaIds)}</div>
      <div class="section-title" style="margin-top:18px">Ð Ñ‹Ð½Ð¾Ðº</div>
      <div class="result-stack">${(entity.market || []).filter(entry => isEntityVisible(Data.getItem(entry.itemId))).map(entry => renderEntityButton('item', Data.getItem(entry.itemId), { subtitle: `${formatCredits(entry.price)}`, thumbSize: 'sm' })).join('') || '<div class="small-note">ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ñ… Ñ‚Ð¾Ð²Ð°Ñ€Ð¾Ð²</div>'}</div>
      ${renderGalaxyFocusButtonMarkup({ systemId: Data.getSystemForPlanet(entity.id)?.id || '', planetId: entity.id })}
      ${renderRelatedArticlesSection(entity.relatedArticleIds)}
    `;
  } else if (type === 'article') {
    const relatedSections = [
      renderRelatedArticlesSection(entity.relatedArticleIds),
      filterVisibleIds(entity.relatedPlanetIds || [], Data.getPlanet).length ? `<div class="section-title" style="margin-top:18px">ÐŸÐ»Ð°Ð½ÐµÑ‚Ñ‹</div><div class="result-stack">${filterVisibleIds(entity.relatedPlanetIds || [], Data.getPlanet).map(pid => renderEntityButton('planet', Data.getPlanet(pid), { thumbSize: 'sm', subtitle÷­{ç¦òµë(š+myÒ&–çWB"G—SÒ&çVÖ&W""æÖSÒ'&F%&F—W2"fÇVSÒ"G´çVÖ&W"‡6†—ç&F%&F—W2ÇÂ—Ò"óãÂöF—cà¢ÆF—cãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
Ý­ýb=í­ƒÂöÆ&VÃâG·&VæFW$6†V6¶&÷…6VÆV7F÷"‚v7&WuÆ–W$–G2rÂÆ–W$÷F–öç5c3b†fÇ6R’Â6†—æ7&WuÆ–W$–G2ÇÂµÒÂwÆ–W"rÂ}	Ý]"=í­í"r—ÓÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
Ý­ýbå3ÂöÆ&VÃâG·&VæFW$6†V6¶&÷…6VÆV7F÷"‚v7&Wtç4–G2rÂç4÷F–öç5c3b‚’Â6†—æ7&Wtç4–G2ÇÂµÒÂvç2rÂ}	Ý]"å2r—ÓÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
­]-²-íí=m]ÝR“ÂöÆ&VÃâG·&VæFW$6†V6¶&÷…6VÆV7F÷"‚vÖ—76–ÆT–G2rÂ6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2„Ô•54”ÄU5õc3b’’Â6†—æÖ—76–ÆT–G2ÇÂµÒÂv—FVÒrÂ}
­]-²ÝR}MÝ²"v÷&ÆB6öæf–rr—ÓÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
M²ò

Ý	ÂöÆ&VÃâG·&VæFW$6†V6¶&÷…6VÆV7F÷"‚w&F$–G2rÂ6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2…$D%5õc3b’’Â6†—ç&F$–G2ÇÂµÒÂv—FVÒrÂ}
M²ÝR}MÝ²"v÷&ÆB6öæf–rr—ÓÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ý=­ƒÂöÆ&VÃãÆF—b–CÒ'6†—ÖwVâ×&÷w2"6Æ73Ò&G–æÖ–2ÖÆ—7B#âG·&VæFW%6†—wVå&÷w5c3b‡6†—æwVç2—ÓÂöF—cãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"–CÒ'6†—ÖFBÖwVâ×&÷r#äDEôuTãÂö'WGFöããÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	}Í]-­ƒÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V"æÖSÒ&æ÷FW2#âG¶W62‡6†—ææ÷FW2ÇÂrr—ÓÂ÷FW‡F&VãÂöF—cà¢G´6öæf–wW&F÷"ç&VæFW%f—6–&–Æ—G”f–VÆB‡6†——Ð¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-ý}ÝÝ½R--ÍƒÂöÆ&VÃâG·&VæFW%&VÆFVD'F–6ÆW4VF—F÷"‡6†—ç&VÆFVD'F–6ÆT–G2ÇÂµÒ—ÓÂöF—cà¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUõ4„•Âö'WGFöãà¢Âöf÷&Óæ°¢Ð ¢gVæ7F–öâ&VæFW$Ö—76–ÆTVF—F÷%c3b†Ö—76–ÆR’°¢&WGW&âÆf÷&Ò–CÒ&6öæf–rÖVF—F÷"Öf÷&Ò"6Æ73Ò&f÷&Ò"FFÖVçF—G’×G—SÒ&Ö—76–ÆW2#à¢G´6öæf–wW&F÷"ç&VæFW$†VFW"†Ö—76–ÆRÂ}
­]-¢-òÝ-]M]ÝòÂM½ÍÝí-Âý=­ÂM=ýí­m]½‚‚­íí-Ââ
=-Ý-½-]-òÝ­í½‚"]M­-íR­í½]’âr—Ð¢ÆF—b6Æ73Ò&6öÇ32#à¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃä”CÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&–B"fÇVSÒ"G¶W62†Ö—76–ÆRæ–B—Ò"óãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Ý}-ÝSÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&æÖR"fÇVSÒ"G¶W62†Ö—76–ÆRææÖR—Ò"óãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Ý-]M]ÝSÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&wV–Fæ6R#ãÆ÷F–öâfÇVSÒ&†VB"G¶Ö—76–ÆRæwV–Fæ6RÓÓÒv†VBròw6VÆV7FVBr¢rwÓí
-]ý½í-íR­í½‚‚­]-²“Âö÷F–öããÆ÷F–öâfÇVSÒ'&F""G¶Ö—76–ÆRæwV–Fæ6RÓÓÒw&F"ròw6VÆV7FVBr¢rwÓí
MÝíR=ííM‚­í½‚MíÂ“Âö÷F–öããÆ÷F–öâfÇVSÒ&çF’"G¶Ö—76–ÆRæwV–Fæ6RÓÓÒvçF’ròw6VÆV7FVBr¢rwÓí	ýí--í­]--í½Í­â­]-²“Âö÷F–öããÂ÷6VÆV7CãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò&6öÇ32#à¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	M½ÍÝí-Âý=­ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""æÖSÒ'&ævR"fÇVSÒ"G´çVÖ&W"†Ö—76–ÆRç&ævRÇÂ3S—Ò"óãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
M=ýí­m]½ƒÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""æÖSÒ'6VV²"fÇVSÒ"G´çVÖ&W"†Ö—76–ÆRç6VV²ÇÂ—Ò"óãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
­íí-ÃÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""æÖSÒ'7VVB"fÇVSÒ"G´çVÖ&W"†Ö—76–ÆRç7VVBÇÂ3—Ò"óãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	}Í]-­ƒÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V"æÖSÒ&æ÷FW2#âG¶W62†Ö—76–ÆRææ÷FW2ÇÂrr—ÓÂ÷FW‡F&VãÂöF—cà¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUôÔ•54”ÄSÂö'WGFöãà¢Âöf÷&Óæ°¢Ð¢gVæ7F–öâ&VæFW%&F$VF—F÷%c3b‡&F"’°¢&WGW&âÆf÷&Ò–CÒ&6öæf–rÖVF—F÷"Öf÷&Ò"6Æ73Ò&f÷&Ò"FFÖVçF—G’×G—SÒ'&F'2#à¢G´6öæf–wW&F÷"ç&VæFW$†VFW"‡&F"Â}
M½‚-Ýmò

Ý	â
MM"íÝ=m]ÝRÝý-½]Ý’}ý]M]½Í‚í}í²=½=½­

Ý	’­½-]"­í½Âí"}=mRMí"âr—Ð¢ÆF—b6Æ73Ò&6öÇ32#à¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃä”CÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&–B"fÇVSÒ"G¶W62‡&F"æ–B—Ò"óãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Ý}-ÝSÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&æÖR"fÇVSÒ"G¶W62‡&F"ææÖR—Ò"óãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-óÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&¶–æB#ãÆ÷F–öâfÇVSÒ'&F""G·&F"æ¶–æBÓÒv¦ÖÖW"ròw6VÆV7FVBr¢rwÓí
MÂö÷F–öããÆ÷F–öâfÇVSÒ&¦ÖÖW""G·&F"æ¶–æBÓÓÒv¦ÖÖW"ròw6VÆV7FVBr¢rwÓí	=½=½­…&F"¦ÖÖW"“Âö÷F–öããÂ÷6VÆV7CãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò&6öÇ32#à¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	M½ÍÝí-ÃÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""æÖSÒ'&ævR"fÇVSÒ"G´çVÖ&W"‡&F"ç&ævRÇÂ#—Ò"óãÂöF—cà¢ÆF—cãÂöF—cãÆF—cãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	}Í]-­ƒÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V"æÖSÒ&æ÷FW2#âG¶W62‡&F"ææ÷FW2ÇÂrr—ÓÂ÷FW‡F&VãÂöF—cà¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUõ$D#Âö'WGFöãà¢Âöf÷&Óæ°¢Ð¢6öç7Bõö6ftvWD—FV×5c3bÒ6öæf–wW&F÷"ævWD—FV×2æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ævWD—FV×2ÒgVæ7F–öâ‡G—R’°¢–b‡G—RÓÓÒw&Vv–öäÖ2r’&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2…$Tt”ôåôÔ5õc3b’“°¢–b‡G—RÓÓÒw6†—2r’&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2…4„•5õc3b’“°¢–b‡G—RÓÓÒvÖ—76–ÆW2r’&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2„Ô•54”ÄU5õc3b’“°¢–b‡G—RÓÓÒw&F'2r’&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2…$D%5õc3b’“°¢&WGW&âõö6ftvWD—FV×5c3b‡G—R“°¢Ó°¢6öç7Bõö6fu&VæFW$VF—F÷%c3bÒ6öæf–wW&F÷"ç&VæFW$VF—F÷"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW$VF—F÷"ÒgVæ7F–öâ†VçF—G’’°¢–b‡F†—2ç6VÆV7FVEG—RÓÓÒw&Vv–öäÖ2r’&WGW&â&VæFW%&Vv–öäÖVF—F÷%c3b†æ÷&ÖÆ—¦U&Vv–öäÖc3b†VçF—G’’“°¢–b‡F†—2ç6VÆV7FVEG—RÓÓÒw6†—2r’&WGW&â&VæFW%6†—VF—F÷%c3b†æ÷&ÖÆ—¦U6†—c3b†VçF—G’’“°¢–b‡F†—2ç6VÆV7FVEG—RÓÓÒvÖ—76–ÆW2r’&WGW&â&VæFW$Ö—76–ÆTVF—F÷%c3b†æ÷&ÖÆ—¦TÖ—76–ÆUc3b†VçF—G’’“°¢–b‡F†—2ç6VÆV7FVEG—RÓÓÒw&F'2r’&WGW&â&VæFW%&F$VF—F÷%c3b†æ÷&ÖÆ—¦U&F%c3b†VçF—G’’“°¢&WGW&âõö6fu&VæFW$VF—F÷%c3b†VçF—G’“°¢Ó°¢6öç7Bõö6ft–ç6W'DVçF—G•c3bÒ6öæf–wW&F÷"æ–ç6W'DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ–ç6W'DVçF—G’ÒgVæ7F–öâ‡G—RÂVçF—G’’°¢–b‡G—RÓÓÒw&Vv–öäÖ2r’²6öç7B—FVÒÒæ÷&ÖÆ—¦U&Vv–öäÖc3b†VçF—G’“²$Tt”ôåôÔ5õc3e¶—FVÒæ–EÒÒ—FVÓ²$Tt”ôåôÔôÄ•5Eõc3bÒ6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2…$Tt”ôåôÔ5õc3b’“²v÷&ÆDFFç&Vv–öäÖ2Ò6W&–Æ—¦Uv÷&ÆE6V7F–öâ‚w&Vv–öäÖ2rÂ$Tt”ôåôÔ5õc3b“²&WGW&ã²Ð¢–b‡G—RÓÓÒw6†—2r’²6öç7B—FVÒÒæ÷&ÖÆ—¦U6†—c3b†VçF—G’“²4„•5õc3e¶—FVÒæ–EÒÒ—FVÓ²4„•ôÄ•5Eõc3bÒ6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2…4„•5õc3b’“²v÷&ÆDFFç6†—2Ò6W&–Æ—¦Uv÷&ÆE6V7F–öâ‚w6†—2rÂ4„•5õc3b“²&WGW&ã²Ð¢–b‡G—RÓÓÒvÖ—76–ÆW2r’²6öç7B—FVÒÒæ÷&ÖÆ—¦TÖ—76–ÆUc3b†VçF—G’“²Ô•54”ÄU5õc3e¶—FVÒæ–EÒÒ—FVÓ²v÷&ÆDFFæÖ—76–ÆW2Ò6W&–Æ—¦Uv÷&ÆE6V7F–öâ‚vÖ—76–ÆW2rÂÔ•54”ÄU5õc3b“²&WGW&ã²Ð¢–b‡G—RÓÓÒw&F'2r’²6öç7B—FVÒÒæ÷&ÖÆ—¦U&F%c3b†VçF—G’“²$D%5õc3e¶—FVÒæ–EÒÒ—FVÓ²v÷&ÆDFFç&F'2Ò6W&–Æ—¦Uv÷&ÆE6V7F–öâ‚w&F'2rÂ$D%5õc3b“²&WGW&ã²Ð¢&WGW&âõö6ft–ç6W'DVçF—G•c3b‡G—RÂVçF—G’“°¢Ó°¢6öç7Bõö6fu&VÖ÷fTVçF—G•c3bÒ6öæf–wW&F÷"ç&VÖ÷fTVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VÖ÷fTVçF—G’ÒgVæ7F–öâ‡G—RÂ–B’°¢òò	-		m	Ý	ã¢&VÖ÷fTVçF—G’-½}½-]-ò‚ý‚í½}ÝíÂ
	]	M		­
-	
	í	-		Ý		‚‡&WÆ6TVçF—G’Ð¢òò&VÖ÷fR²–ç6W'B’ÂýíÝ-íÍ2}M]ÂÝ]½Í}ò­­MÝâ}--Â½½­‚(	BrÝ}Ý-í=à¢òò]M­-í-ÝR­í½ò=M½ý½â]=â-í­]Ý²­"Â]M­-í-ÝR­]-°¢òò½-½â]â-]R­í½]’â	íí-]-R½½­‚]}íýÝ³¢-RÍ]- ¢òòýí½Í}í-ÝòM½Í-=í"í-=---=íR–Bà¢–b‡G—RÓÓÒw&Vv–öäÖ2r’²FVÆWFR$Tt”ôåôÔ5õc3e¶–EÓ²&WGW&ã²Ð¢–b‡G—RÓÓÒw6†—2r’²FVÆWFR4„•5õc3e¶–EÓ²&WGW&ã²Ð¢–b‡G—RÓÓÒvÖ—76–ÆW2r’²FVÆWFRÔ•54”ÄU5õc3e¶–EÓ²&WGW&ã²Ð¢–b‡G—RÓÓÒw&F'2r’²FVÆWFR$D%5õc3e¶–EÓ²&WGW&ã²Ð¢&WGW&âõö6fu&VÖ÷fTVçF—G•c3b‡G—RÂ–B“°¢Ó°¢6öç7Bõö6ft6öÆÆV7DVçF—G•c3bÒ6öæf–wW&F÷"æ6öÆÆV7DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ6öÆÆV7DVçF—G’ÒgVæ7F–öâ‡G—RÂf÷&ÔVÂÂf÷&ÔFFÒæWrf÷&ÔFF†f÷&ÔVÂ’’°¢–b‡G—RÓÓÒw&Vv–öäÖ2r’°¢6öç7BöÆBÒF†—2ævWE6VÆV7FVDVçF—G’‚’ÇÂ·Ó°¢6öç7BÖVF–f–VÆBÒf÷&ÔVÂçVW'•6VÆV7F÷"‚ræÖVF–Öf–VÆBr“°¢6öç7B†–FFVä–ÖvRÒf÷&ÔVÂçVW'•6VÆV7F÷"‚v–çWE¶æÖSÒ&–ÖvTFF%Òr“òçfÇVRÇÂrs°¢6öç7B–ÖvRÒ7G&–ær††–FFVä–ÖvRÇÂf÷&ÔFFævWB‚v–ÖvTFFr’ÇÂÖVF–f–VÆCòæFF6WCòç6fVD–ÖvUfÇVRÇÂÖVF–f–VÆCòæFF6WCòçVæF–æt–ÖvUfÇVRÇÂöÆBæ–ÖvRÇÂrr’çG&–Ò‚“°¢&WGW&âæ÷&ÖÆ—¦U&Vv–öäÖc3b‡°¢ââæöÆBÀ¢–C¢6ÇVv–g”–B†f÷&ÔFFævWB‚v–Br’ÇÂf÷&ÔFFævWB‚væÖRr’ÇÂrrÂw&Vv–öâr’À¢æÖS¢7G&–ær†f÷&ÔFFævWB‚væÖRr’ÇÂrr’çG&–Ò‚’À¢¶–æC¢7G&–ær†f÷&ÔFFævWB‚v¶–æBr’ÇÂw&Vv–öâr’çG&–Ò‚’À¢ÆæWD–C¢7G&–ær†f÷&ÔFFævWB‚wÆæWD–Br’ÇÂrr’çG&–Ò‚’À¢&VçE&Vv–öä–C¢7G&–ær†f÷&ÔFFævWB‚w&VçE&Vv–öä–Br’ÇÂrr’çG&–Ò‚’À¢6öÆ÷#¢7G&–ær†f÷&ÔFFævWB‚v6öÆ÷"r’ÇÂr3vFc–fbr’çG&–Ò‚’À¢v–GFƒ¢çVÖ&W"†f÷&ÔFFævWB‚wv–GF‚r’ÇÂ’À¢†V–v‡C¢çVÖ&W"†f÷&ÔFFævWB‚v†V–v‡Br’ÇÂs’À¢66ÆTÆ&VÃ¢7G&–ær†f÷&ÔFFævWB‚w66ÆTÆ&VÂr’ÇÂ}­Âr’çG&–Ò‚’À¢7VÖÖ'“¢7G&–ær†f÷&ÔFFævWB‚w7VÖÖ'’r’ÇÂrr’çG&–Ò‚’À¢fös¢°¢Væ&ÆVC¢7G&–ær†f÷&ÔFFævWB‚vfötVæ&ÆVBr’óòsr’ÓÒsrÀ¢&F—W3¢ÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚vföu&F—W2r’óòS’’À¢W‡Æ÷&VC¢öÆBæfösòæW‡Æ÷&VBÇÂrp¢ÒÀ¢–ÖvRÀ¢&VÆFVD'F–6ÆT–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂw&VÆFVD'F–6ÆT–G2r’À¢f—6–&–Æ—G“¢²Æ–W$–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G•Æ–W$–G2r’Ð¢Ò“°¢Ð¢–b‡G—RÓÓÒw6†—2r’°¢6öç7BöÆBÒF†—2ævWE6VÆV7FVDVçF—G’‚’ÇÂ·Ó°¢6öç7BÖVF–f–VÆBÒf÷&ÔVÂçVW'•6VÆV7F÷"‚ræÖVF–Öf–VÆBr“°¢6öç7B†–FFVä–ÖvRÒf÷&ÔVÂçVW'•6VÆV7F÷"‚v–çWE¶æÖSÒ&–ÖvTFF%Òr“òçfÇVRÇÂrs°¢6öç7B–ÖvRÒ7G&–ær††–FFVä–ÖvRÇÂf÷&ÔFFævWB‚v–ÖvTFFr’ÇÂÖVF–f–VÆCòæFF6WCòç6fVD–ÖvUfÇVRÇÂÖVF–f–VÆCòæFF6WCòçVæF–æt–ÖvUfÇVRÇÂöÆBæ–ÖvRÇÂrr’çG&–Ò‚“°¢&WGW&âæ÷&ÖÆ—¦U6†—c3b‡°¢ââæöÆBÀ¢–C¢6ÇVv–g”–B†f÷&ÔFFævWB‚v–Br’ÇÂf÷&ÔFFævWB‚væÖRr’ÇÂrrÂw6†—r’À¢æÖS¢7G&–ær†f÷&ÔFFævWB‚væÖRr’ÇÂrr’çG&–Ò‚’À¢ÖöFVÃ¢7G&–ær†f÷&ÔFFævWB‚vÖöFVÂr’ÇÂrr’çG&–Ò‚’À¢÷væW%Æ–W$–C¢7G&–ær†f÷&ÔFFævWB‚v÷væW%Æ–W$–Br’ÇÂrr’çG&–Ò‚’À¢7W'&VçE&Vv–öä–C¢7G&–ær†f÷&ÔFFævWB‚v7W'&VçE&Vv–öä–Br’ÇÂrr’çG&–Ò‚’À¢7W'&VçEÆæWD–C¢7G&–ær†f÷&ÔFFævWB‚v7W'&VçEÆæWD–Br’ÇÂrr’çG&–Ò‚’À¢gVVÃ¢çVÖ&W"†f÷&ÔFFævWB‚vgVVÂr’ÇÂ’À¢gVVÄ66—G“¢çVÖ&W"†f÷&ÔFFævWB‚vgVVÄ66—G’r’ÇÂ’À¢gVVÄ6öç7V×F–öã¢çVÖ&W"†f÷&ÔFFævWB‚vgVVÄ6öç7V×F–öâr’ÇÂ’À¢Ö73¢çVÖ&W"†f÷&ÔFFævWB‚vÖ72r’ÇÂ’À¢Væv–æU÷vW#¢çVÖ&W"†f÷&ÔFFævWB‚vVæv–æU÷vW"r’ÇÂ’À¢6&vôÖ73¢çVÖ&W"†f÷&ÔFFævWB‚v6&vôÖ72r’ÇÂ’À¢f—6–öå&F—W3¢çVÖ&W"†f÷&ÔFFævWB‚wf—6–öå&F—W2r’ÇÂ’À¢&F%&F—W3¢çVÖ&W"†f÷&ÔFFævWB‚w&F%&F—W2r’ÇÂ’À¢&F$Væ&ÆVC¢öÆBç&F$Væ&ÆVBÓÒfÇ6RÀ¢7&WuÆ–W$–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂv7&WuÆ–W$–G2r’À¢7&Wtç4–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂv7&Wtç4–G2r’À¢Ö—76–ÆT–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂvÖ—76–ÆT–G2r’À¢&F$–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂw&F$–G2r’À¢wVç3¢&VE6†—wVç5c3b†f÷&ÔVÂ’À¢æ÷FW3¢7G&–ær†f÷&ÔFFævWB‚væ÷FW2r’ÇÂrr’çG&–Ò‚’À¢–ÖvRÀ¢&VÆFVD'F–6ÆT–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂw&VÆFVD'F–6ÆT–G2r’À¢f—6–&–Æ—G“¢²Æ–W$–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G•Æ–W$–G2r’Ð¢Ò“°¢Ð¢–b‡G—RÓÓÒvÖ—76–ÆW2r’°¢6öç7BöÆBÒF†—2ævWE6VÆV7FVDVçF—G’‚’ÇÂ·Ó°¢&WGW&âæ÷&ÖÆ—¦TÖ—76–ÆUc3b‡°¢ââæöÆBÀ¢–C¢6ÇVv–g”–B†f÷&ÔFFævWB‚v–Br’ÇÂf÷&ÔFFævWB‚væÖRr’ÇÂrrÂvÖ—76–ÆRr’À¢æÖS¢7G&–ær†f÷&ÔFFævWB‚væÖRr’ÇÂrr’çG&–Ò‚’À¢wV–Fæ6S¢7G&–ær†f÷&ÔFFævWB‚vwV–Fæ6Rr’ÇÂv†VBr’çG&–Ò‚’À¢&ævS¢çVÖ&W"†f÷&ÔFFævWB‚w&ævRr’ÇÂ3S’À¢6VV³¢çVÖ&W"†f÷&ÔFFævWB‚w6VV²r’ÇÂ’À¢7VVC¢çVÖ&W"†f÷&ÔFFævWB‚w7VVBr’ÇÂ3’À¢æ÷FW3¢7G&–ær†f÷&ÔFFævWB‚væ÷FW2r’ÇÂrr’çG&–Ò‚¢Ò“°¢Ð¢–b‡G—RÓÓÒw&F'2r’°¢6öç7BöÆBÒF†—2ævWE6VÆV7FVDVçF—G’‚’ÇÂ·Ó°¢&WGW&âæ÷&ÖÆ—¦U&F%c3b‡°¢ââæöÆBÀ¢–C¢6ÇVv–g”–B†f÷&ÔFFævWB‚v–Br’ÇÂf÷&ÔFFævWB‚væÖRr’ÇÂrrÂw&F"r’À¢æÖS¢7G&–ær†f÷&ÔFFævWB‚væÖRr’ÇÂrr’çG&–Ò‚’À¢¶–æC¢7G&–ær†f÷&ÔFFævWB‚v¶–æBr’ÇÂw&F"r’çG&–Ò‚’À¢&ævS¢çVÖ&W"†f÷&ÔFFævWB‚w&ævRr’ÇÂ#’À¢æ÷FW3¢7G&–ær†f÷&ÔFFævWB‚væ÷FW2r’ÇÂrr’çG&–Ò‚¢Ò“°¢Ð¢6öç7B&6RÒõö6ft6öÆÆV7DVçF—G•c3b‡G—RÂf÷&ÔVÂÂf÷&ÔFF“°¢–b‡G—RÓÓÒwÆ–W'2rbb&6R’°¢&6Ræ7W'&VçE&Vv–öä–BÒ7G&–ær†f÷&ÔFFævWB‚v7W'&VçE&Vv–öä–Br’ÇÂ&6Ræ7W'&VçE&Vv–öä–BÇÂrr’çG&–Ò‚“°¢&6Ræ7W'&VçE6†—–BÒ7G&–ær†f÷&ÔFFævWB‚v7W'&VçE6†—–Br’ÇÂ&6Ræ7W'&VçE6†—–BÇÂrr’çG&–Ò‚“°¢Ð¢&WGW&â&6S°¢Ó°¢6öç7Bõö6ft'V–ÆE–ÆöEc3bÒ6öæf–wW&F÷"æ'V–ÆE–ÆöBæ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ'V–ÆE–ÆöBÒgVæ7F–öâ‡G—R’°¢–b‡G—RÓÓÒw&Vv–öäÖ2r’&WGW&â6W&–Æ—¦Uv÷&ÆE6V7F–öâ‚w&Vv–öäÖ2rÂ$Tt”ôåôÔ5õc3b“°¢–b‡G—RÓÓÒw6†—2r’&WGW&â6W&–Æ—¦Uv÷&ÆE6V7F–öâ‚w6†—2rÂ4„•5õc3b“°¢–b‡G—RÓÓÒvÖ—76–ÆW2r’&WGW&â6W&–Æ—¦Uv÷&ÆE6V7F–öâ‚vÖ—76–ÆW2rÂÔ•54”ÄU5õc3b“°¢–b‡G—RÓÓÒw&F'2r’&WGW&â6W&–Æ—¦Uv÷&ÆE6V7F–öâ‚w&F'2rÂ$D%5õc3b“°¢&WGW&âõö6ft'V–ÆE–ÆöEc3b‡G—R“°¢Ó°¢6öç7Bõö6fu&VæFW%c3bÒ6öæf–wW&F÷"ç&VæFW"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW"ÒgVæ7F–öâ‚’°¢õö6fu&VæFW%c3b‚“°¢&–æE'G46öæf–tVæ†æ6VÖVçG5c3b‚“°¢Ó°¢6öç7Bõö6fuÆ–W$VF—F÷%c3bÒ6öæf–wW&F÷"ç&VæFW%Æ–W$VF—F÷#òæ&–æB„6öæf–wW&F÷"“°¢–b…õö6fuÆ–W$VF—F÷%c3b’°¢6öæf–wW&F÷"ç&VæFW%Æ–W$VF—F÷"ÒgVæ7F–öâ‡W6W"’°¢6öç7B‡FÖÂÒõö6fuÆ–W$VF—F÷%c3b‡W6W"“°¢6öç7Bf–VÆG2ÒÆF—b6Æ73Ò&6öÇ3"'G2×Æ–W"ÖÆö6F–öâÖf–VÆG2×c3b#à¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-]­=’]=íÒò=ííCÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&7W'&VçE&Vv–öä–B#âG·&Vv–öäÖ6VÆV7D÷F–öç5c3b‡W6W"æ7W'&VçE&Vv–öä–BÇÂrrÂW6W"æ7W'&VçEÆæWD–BÇÂrr—ÓÂ÷6VÆV7CãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-]­=’­í½ÃÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&7W'&VçE6†—–B#âG·6†—6VÆV7D÷F–öç5c3b‡W6W"æ7W'&VçE6†—–BÇÂrr—ÓÂ÷6VÆV7CãÂöF—cà¢ÂöF—cæ°¢&WGW&â‡FÖÂç&WÆ6R‚sÆF—b6Æ73Ò&6öÇ32#åÆâÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃä…ÂöÆ&VÃârÂG¶f–VÆG7ÓÆF—b6Æ73Ò&6öÇ32#åÆâÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃä…ÂöÆ&VÃæ“°¢Ó°¢Ð¢gVæ7F–öâ&–æE'G46öæf–tVæ†æ6VÖVçG5c3b‚’°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚u¶FFÖ÷Vâ×&Vv–öâÖÖÒr’æf÷$V6‚†'WGFöâÓâ°¢–b†'WGFöâæFF6WBç'G4&÷VæBÓÓÒsr’&WGW&ã°¢'WGFöâæFF6WBç'G4&÷VæBÒss°¢'WGFöâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ÷Vå&Vv–öäÖc3b†'WGFöâæFF6WBæ÷Vå&Vv–öäÖ’“°¢Ò“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w6†—ÖFBÖwVâ×&÷rr“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w6†—ÖwVâ×&÷w2r“òæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÂ&VæFW%6†—wVå&÷w5c3b…·²æÖS¢rrÂG—S¢rrÂFÖvS¢rrÂ&ævS¢ÕÒ’“°¢&–æE'G46öæf–tVæ†æ6VÖVçG5c3b‚“°¢Ò“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚rç'G2×&VÖ÷fR×&÷rr’æf÷$V6‚†'WGFöâÓâ°¢–b†'WGFöâæFF6WBç'G4&÷VæBÓÓÒsr’&WGW&ã°¢'WGFöâæFF6WBç'G4&÷VæBÒss°¢'WGFöâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ'WGFöâæ6Æ÷6W7B‚ræG–æÖ–2×&÷rr“òç&VÖ÷fR‚’“°¢Ò“°¢Ð ¢7–æ2gVæ7F–öâ7&VFU&Vv–öäf÷%ÆæWEc3b‡ÆæWD–BÂ¶–æBÒw&Vv–öâr’°¢6öç7BÆæWBÒÄäUE5·ÆæWD–EÓ°¢–b‚ÆæWB’&WGW&ã°¢6öç7B–BÒ6ÆVä–Ec3b†G¶¶–æGÕòG·ÆæWBæ–GÕòG´FFRææ÷r‚’çFõ7G&–ærƒ3b’ç6Æ–6R‚ÓR—ÖÂw&Vv–öâr“°¢$Tt”ôåôÔ5õc3e¶–EÒÒæ÷&ÖÆ—¦U&Vv–öäÖc3b‡²–BÂæÖS¢¶–æBÓÓÒv6—G’rò}	Ýí-½’=ííBr¢}	Ýí-½’]=íÒrÂ¶–æBÂÆæWD–C¢ÆæWBæ–BÂv–GFƒ¢Â†V–v‡C¢sÒ“°¢6öæf–wW&F÷"ç6VÆV7FVEG—RÒw&Vv–öäÖ2s°¢6öæf–wW&F÷"ç6VÆV7FVD–BÒ–C°¢v—BW'6—7E&Vv–öç56†—5c3b‚}	­-]=íÝí}MÝr“°¢T’æ÷VäÖöGVÆR‚v6öæf–rr“°¢Ð¢gVæ7F–öâ&Vv–öä'WGFöç4f÷%ÆæWEc3b‡ÆæWD–B’°¢6öç7BÖ2Ò&Vv–öäÖ÷F–öç5c3b‡ÆæWD–B“°¢6öç7B7W'&VçEW6W"Òòæ7W'&VçEW6W"ÇÂ·Ó°¢6öç7Bf—6–&ÆTÖ2ÒÖ2æf–ÇFW"†ÖÓâ6ä÷Vå&Vv–öäÖc3b†ÖÂ7W'&VçEW6W"’“°¢6öç7BvÒÒ—4vÕc3b‚“°¢&WGW&âÆF—b6Æ73Ò&æÇ—6—2×6V7F–öâ'G2×ÆæWB×&Vv–öâ×æVÂ×c3b#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
]=íÝ²ò=ííMÂöF—cà¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	=í­‚í-­½-í"-í½Í­â­-2-í=â]=íÝ½‚=ííMÂ=MRÝ]íM-òRý]íÝb½‚­í½ÂãÂöF—cà¢ÆF—b6Æ73Ò''G2×&Vv–öâÖ'WGFöâÖw&–B×c3b#âG·f—6–&ÆTÖ2æÖ†ÖÓâÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖ÷Vâ×&Vv–öâÖÖÒ"G¶W62†Öæ–B—Ò#âG¶W62†ÖææÖR—ÒÇ7ãâG¶W62†Öæ¶–æB—ÓÂ÷7ããÂö'WGFöãæ’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý]"Mí-=ýÝ½R­"]=íÝãÂöF—câwÓÂöF—cà¢G¶vÒòÆF—b6Æ73Ò'&÷r"7G–ÆSÒ&Ö&v–â×F÷£ƒ¶v£‡ƒ¶fÆW‚×w&§w&#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖ7&VFR×&Vv–öâÖÖÒ'&Vv–öâ"FF×ÆæWBÖ–CÒ"G¶W62‡ÆæWD–B—Ò#â²
	]	=		í	ÓÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖ7&VFR×&Vv–öâÖÖÒ&6—G’"FF×ÆæWBÖ–CÒ"G¶W62‡ÆæWD–B—Ò#â²	=	í
	í	CÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖ7&VFR×&Vv–öâÖÖÒ&'V–ÆF–ær"FF×ÆæWBÖ–CÒ"G¶W62‡ÆæWD–B—Ò#â²	}	M		Ý		SÂö'WGFöããÂöF—cæ¢rwÐ¢ÂöF—cæ°¢Ð¢6öç7Bõ÷&VæFW%ÆæWDæÇ—6—5c3bÒT’ç&VæFW%ÆæWDæÇ—6—2æ&–æB…T’“°¢T’ç&VæFW%ÆæWDæÇ—6—2ÒgVæ7F–öâ‡ÆæWD–BÂ7—7FVÔ–B’°¢õ÷&VæFW%ÆæWDæÇ—6—5c3b‡ÆæWD–BÂ7—7FVÔ–B“°¢6öç7B6öçF–æW"ÒFö7VÖVçBævWDVÆVÖVçD'”–B‚væÇ—6—2Ö6öçFVçBr“°¢–b†6öçF–æW"’°¢6öçF–æW"æ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÂ&Vv–öä'WGFöç4f÷%ÆæWEc3b‡ÆæWD–B’“°¢&–æE'G5&Vv–öä'WGFöç5c3b†6öçF–æW"“°¢Ð¢Ó°¢gVæ7F–öâ&–æE'G5&Vv–öä'WGFöç5c3b‡&ö÷BÒFö7VÖVçB’°¢&ö÷BçVW'•6VÆV7F÷$ÆÂ‚u¶FFÖ÷Vâ×&Vv–öâÖÖÒr’æf÷$V6‚†'WGFöâÓâ°¢–b†'WGFöâæFF6WBç'G4&÷VæBÓÓÒsr’&WGW&ã°¢'WGFöâæFF6WBç'G4&÷VæBÒss°¢'WGFöâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ÷Vå&Vv–öäÖc3b†'WGFöâæFF6WBæ÷Vå&Vv–öäÖ’“°¢Ò“°¢&ö÷BçVW'•6VÆV7F÷$ÆÂ‚u¶FFÖ7&VFR×&Vv–öâÖÖÒr’æf÷$V6‚†'WGFöâÓâ°¢–b†'WGFöâæFF6WBç'G4&÷VæBÓÓÒsr’&WGW&ã°¢'WGFöâæFF6WBç'G4&÷VæBÒss°¢'WGFöâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ7&VFU&Vv–öäf÷%ÆæWEc3b†'WGFöâæFF6WBçÆæWD–BÂ'WGFöâæFF6WBæ7&VFU&Vv–öäÖÇÂw&Vv–öâr’“°¢Ò“°¢Ð ¢gVæ7F–öâVç7W&U&Vv–öäÖöFÅc3b‚’°¢ÆWBÖöFÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖÖÖöFÂ×c3br“°¢–b†ÖöFÂ’&WGW&âÖöFÃ°¢ÖöFÂÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“°¢ÖöFÂæ–BÒw&Vv–öâÖÖÖÖöFÂ×c3bs°¢ÖöFÂæ6Æ74æÖRÒvÖöFÂ&Vv–öâÖÖÖÖöFÂ×c3bs°¢ÖöFÂæ–ææW$…DÔÂÒÆF—b6Æ73Ò'&Vv–öâÖÖ×6†VÆÂ×c3b#ãÆF—b–CÒ'&Vv–öâÖÖÖ&öG’×c3b#ãÂöF—cãÂöF—cæ°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB†ÖöFÂ“°¢ÖöFÂæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ²–b†WfVçBçF&vWBÓÓÒÖöFÂ’6Æ÷6U&Vv–öäÖc3b‚“²Ò“°¢&WGW&âÖöFÃ°¢Ð¢gVæ7F–öâ6Æ÷6U&Vv–öäÖc3b‚’°¢6öç7BÖöFÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖÖÖöFÂ×c3br“°¢–b†ÖöFÂ’ÖöFÂæ6Æ74Æ—7Bç&VÖ÷fR‚v÷Vâr“°¢–b…%E5õ$Tt”ôåõT•õc3bç&b’6æ6VÄæ–ÖF–öäg&ÖR…%E5õ$Tt”ôåõT•õc3bç&b“°¢%E5õ$Tt”ôåõT•õc3bç&bÒ°¢%E5õ$Tt”ôåõT•õc3bæ&Ö–ærÒrs°¢fÇW6…&Vv–öåW'6—7Ec3b‚“°¢G'’²v–æF÷rä6öÖ&DVF–õc3sòç7F÷Ö&–VçCòâ‚“²Ò6F6‚·Ð¢Ð¢gVæ7F–öâ&Vv–öäÖFö¶VäÆ&VÅc3b‡Fö¶Vâ’°¢–b‡Fö¶Vâç6†—–Bbb4„•5õc3e·Fö¶Vâç6†—–EÒ’&WGW&â4„•5õc3e·Fö¶Vâç6†—–EÒææÖS°¢–b‡Fö¶VâçÆ–W$–Bbb„ç7FFRçW6W'5·Fö¶VâçÆ–W$–EÒÇÂÄ”U%õDTÕÄDU5·Fö¶VâçÆ–W$–EÒ’’&WGW&â„ç7FFRçW6W'5·Fö¶VâçÆ–W$–EÒÇÂÄ”U%õDTÕÄDU5·Fö¶VâçÆ–W$–EÒ’æF—7Æ”æÖRÇÂFö¶VâçÆ–W$–C°¢–b‡Fö¶Vâæç4–Bbbå55·Fö¶Vâæç4–EÒ’&WGW&âå55·Fö¶Vâæç4–EÒææÖRÇÂFö¶Vâæç4–C°¢&WGW&âFö¶VâææÖRÇÂFö¶Vâæ–C°¢Ð¢gVæ7F–öâ&Vv–öäÖ66W74&ææW%c3b†Ö’°¢6öç7BÆæWBÒÄäUE5¶ÖçÆæWD–EÓ°¢6öç7B&VçBÒ$Tt”ôåôÔ5õc3e¶Öç&VçE&Vv–öä–EÓ°¢&WGW&âÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG·ÆæWBò	ý½Ý]-¢Æ#âG¶W62‡ÆæWBææÖR—ÓÂö#æ¢}	ý½Ý]-ÝR}MÝwÒG·&VçBò+r	-Ý=-ƒ¢Æ#âG¶W62‡&VçBææÖR—ÓÂö#æ¢rwÒ+rG¶W62†Öæ¶–æB—ÓÂöF—cæ°¢Ð¢gVæ7F–öâ&VæFW%&Vv–öåFö¶VäÖ&·Wc3b†ÖÂFö¶Vâ’°¢6öç7B÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶Vâ“°¢6öç7B6VÆV7FVD6Æ72ÒFö¶Vâæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–Bòr6VÆV7FVBr¢rs°¢6öç7BÖ÷f–æt6Æ72ÒFö¶VâæÖ÷fTVæG4BòrÖ÷f–ærr¢rs°¢6öç7B†–FFVä6Æ72Ò—4vÕc3b‚’bbFö¶Vâçf—6–&ÆUFõÆ–W'2òrÆ–W"Ö†–FFVâr¢rs°¢6öç7B—56†—ÒFö¶VâçG—RÓÓÒw6†—rÇÂFö¶VâçG—RÓÓÒw7VG&öâs°¢6öç7B—46—G’ÒFö¶VâçG—RÓÓÒv6—G’s°¢6öç7B6†—ÒFö¶Vâç6†—–Bò4„•5õc3e·Fö¶Vâç6†—–EÒ¢çVÆÃ°¢òò6†—2÷7VG&öç2&RG&vâ2Æ–â6öÆ÷W&VB6—&6ÆR²æÖR†æò–ÖvR’à¢6öç7B–ÖrÒ—56†—òrr¢‡Fö¶Vâæ–ÖvRÇÂ6†—òæ–ÖvRÇÂrr“°¢6öç7BvÇ—‚Ò—56†—òrr¢—46—G’ò~*Ê"r¢Fö¶VâçG—RÓÓÒwÆ–W"rò~)xòr¢~)k"s°¢6öç7B–ææW"Ò–ÖròÆ–Ör7&3Ò"G¶W62†–Ör—Ò"ÇCÒ""óæ¢Ç7ãâG¶W62†vÇ—‚—ÓÂ÷7ãæ°¢6öç7BÆ&VÂÒFö¶VâçG—RÓÓÒw7VG&öâròG·&Vv–öäÖFö¶VäÆ&VÅc3b‡Fö¶Vâ—Ò9rG·6fT'&•c3b‡Fö¶Vâç6†—–G2’æÆVæwF‡Ö¢&Vv–öäÖFö¶VäÆ&VÅc3b‡Fö¶Vâ“°¢&WGW&âÆ'WGFöâ6Æ73Ò''G2ÖÖ×Fö¶Vâ×c3bG·6VÆV7FVD6Æ77ÒG¶Ö÷f–æt6Æ77ÒG¶†–FFVä6Æ77ÒG¶—56†—òr—2×6†—×c3br¢rwÒG¶—46—G’òr—2Ö6—G’×c3br¢rwÒ"FF×Fö¶VâÖ–CÒ"G¶W62‡Fö¶Vâæ–B—Ò"G·Fö¶VâçÆ–W$–BòFF×Æ–W"Ö–CÒ"G¶W62‡Fö¶VâçÆ–W$–B—Ò&¢rwÒ7G–ÆSÒ&ÆVgC¢G²‡÷2ç‚òÖçv–GF‚¢’çFôf—†VBƒ2—ÒS·F÷¢G²‡÷2ç’òÖæ†V–v‡B¢’çFôf—†VBƒ2—ÒS²Ò×'G2Ö6öÆ÷#¢G¶W62‡Fö¶Vâæ6öÆ÷"—Ò"F—FÆSÒ"G¶W62†Æ&VÂ—Ò#âG¶–ææW'ÓÆ#âG¶W62†Æ&VÂ—ÓÂö#ãÂö'WGFöãæ°¢Ð¢gVæ7F–öâ&VæFW%&Vv–öå6–FUæVÅc3b†Ö’°¢6öç7B—4VF—BÒ%E5õ$Tt”ôåõT•õc3bæÖöFRÓÓÒvVF—Bs°¢6öç7B6VÆV7FVBÒ6fT'&•c3b†ÖçFö¶Vç2’æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B’ÇÂçVÆÃ°¢6öç7B6VÆV7FVDÖ&¶W"Ò—4VF—Bò6fT'&•c3b†ÖæÖ&¶W'2’æf–æB†ÒÓâÒæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVDÖ&¶W$–B’¢çVÆÃ°¢6öç7B6VÆV7FVE6†—Ò6VÆV7FVBòÆ—fU6†—f÷%Fö¶Våc3b‡6VÆV7FVB’¢çVÆÃ°¢6öç7BÆ–W$÷G2ÒÆ–W$÷F–öç5c3b†fÇ6R’æÖ‡ÓâÆ÷F–öâfÇVSÒ"G¶W62‡æ–B—Ò#âG¶W62‡æF—7Æ”æÖRÇÂæ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr“°¢6öç7BFEFööÇ2ÒÆF—b6Æ73Ò''G2×æVÂÖw&÷W×c3b#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Mí--ÂÝ­-3ÂöF—cà¢ÆF—b6Æ73Ò''G2ÖFB×&÷r×c3b#ãÇ6VÆV7B6Æ73Ò'6VÆV7B"–CÒ''G2×Æ–W"×Fö¶Vâ×c3b#ãÆ÷F–öâfÇVSÒ"#í	=í®(
cÂö÷F–öãâG·Æ–W$÷G7ÓÂ÷6VÆV7CãÆ'WGFöâ6Æ73Ò'6V6öæF'’'G2ÖFBÖ'Fâ×c3b"G—SÒ&'WGFöâ"FF×'G2ÖFCÒ'Æ–W""F—FÆSÒ-	Mí--Â=í­#â³Âö'WGFöããÂöF—cà¢ÆF—b6Æ73Ò''G2ÖFB×&÷r×c3b#ãÇ6VÆV7B6Æ73Ò'6VÆV7B"–CÒ''G2×6†—×Fö¶Vâ×c3b#ãÆ÷F–öâfÇVSÒ"#í	­í½Î(
cÂö÷F–öãâG·6†—÷F–öç5c3b‚’æÖ‡2ÓâÆ÷F–öâfÇVSÒ"G¶W62‡2æ–B—Ò#âG¶W62‡2ææÖR—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÆ'WGFöâ6Æ73Ò'6V6öæF'’'G2ÖFBÖ'Fâ×c3b"G—SÒ&'WGFöâ"FF×'G2ÖFCÒ'6†—"F—FÆSÒ-	Mí--Â­í½Â#â³Âö'WGFöããÂöF—cà¢ÆF—b6Æ73Ò''G2ÖFB×&÷r×c3b#ãÇ6VÆV7B6Æ73Ò'6VÆV7B"–CÒ''G2Öç2×Fö¶Vâ×c3b#ãÆ÷F–öâfÇVSÒ"#äå>(
cÂö÷F–öãâG¶ç4÷F–öç5c3b‚’æÖ†âÓâÆ÷F–öâfÇVSÒ"G¶W62†âæ–B—Ò#âG¶W62†âææÖRÇÂâæ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÆ'WGFöâ6Æ73Ò'6V6öæF'’'G2ÖFBÖ'Fâ×c3b"G—SÒ&'WGFöâ"FF×'G2ÖFCÒ&ç2"F—FÆSÒ-	Mí--Âå2#â³Âö'WGFöããÂöF—cà¢ÆF—b6Æ73Ò'&÷r"7G–ÆSÒ&v£‡ƒ¶fÆW‚×w&§w&#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×'G2ÖFCÒ'Væ—B#â²	Ý]-½ÍÝ½’í-ýCÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×'G2ÖFCÒ&6—G’#â²	=ííCÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×'G2ÖFCÒ&Ö&¶W"#â²	Í]-­Âö'WGFöããÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò''G2×æVÂÖw&÷W×c3b#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
-=ÍÒ-íÝ³ÂöF—cà¢ÆÆ&VÂ6Æ73Ò&6†V6²ÖÆ–æR#ãÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ''G2ÖförÖVæ&ÆVB×c3b"G¶ÖæfösòæVæ&ÆVBÓÒfÇ6Ròv6†V6¶VBr¢rwÒóâ	-­½í}ÓÂöÆ&VÃà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
M=í}í‚G¶W62†Öç66ÆTÆ&VÂÇÂ}]Br—Ò“ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""–CÒ''G2Öför×&F—W2×c3b"fÇVSÒ"G´çVÖ&W"†Öæfösòç&F—W2óòS—Ò"óãÂöF—cà¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	=í­‚-Mý"-í½Í­â}íÝ2í}í­í½]’â-íÍ‚ý]íÝmÍƒ²ýí­Ý=-ò}íÝÝí-}­½-]-òý½í-Ý½Â-=ÍÝíÂâ	­Ýíý­*½
-
=	Í		Ü+²"ý­Rýí­}½-]"-=ÍÒ­¢2=í­í"ãÂöF—cà¢ÂöF—cæ°¢6öç7B76–våFööÇ2ÒÆF—b6Æ73Ò''G2×æVÂÖw&÷W×c3b#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ý-í-Âýí½ím]ÝR=í­3ÂöF—cà¢ÆF—b6Æ73Ò''G2ÖFB×&÷r×c3b#ãÇ6VÆV7B6Æ73Ò'6VÆV7B"–CÒ''G2Ö76–vâ×Æ–W"×c3b#ãÆ÷F–öâfÇVSÒ"#í	=í®(
cÂö÷F–öãâG·Æ–W$÷G7ÓÂ÷6VÆV7CãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"–CÒ''G2Ö76–vâ×Æ–W"Ö'Fâ×c3b#äô³Âö'WGFöããÂöF—cà¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	=í¢Íím]"í-­½-Â­-2]=íÝÂ=MRÝ]íM-ò]=âý]íÝb½‚­í½ÂãÂöF—cà¢ÂöF—cæ°¢ÆWB–ç7V7F÷"Òrs°¢–b‡6VÆV7FVB’°¢6öç7BÖ÷f–ærÒ&ööÆVâ‡6VÆV7FVBæÖ÷fTVæG4B“°¢6öç7B—57VBÒ6VÆV7FVBçG—RÓÓÒw7VG&öâs°¢6öç7B&VÅ6†—Ò6VÆV7FVBçG—RÓÓÒw6†—rbb6VÆV7FVBç6†—–Bò4„•5õc3e·6VÆV7FVBç6†—–EÒ¢çVÆÃ°¢6öç7B7VE7FG2Ò—57VBò7VG&öå7FG5c3b‡6VÆV7FVB’¢çVÆÃ°¢òòí­]MÝý-ÍòÍímÝâ-í½Í­â­í½ýÍ‚ýí½}í-‚Ý=mÝâ½}-Íò¢6öç7BÔU$tUõ$ätRÒ%E5ôÔU$tUõ$ätUõc3c°¢6öç7B6VÅ÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡6VÆV7FVB“°¢6öç7BÖW&vUF&vWG2Ò‡&VÅ6†—ÇÂ—57VB’ò6fT'&•c3b†ÖçFö¶Vç2’æf–ÇFW"‡BÓâ°¢–b‡Bæ–BÓÓÒ6VÆV7FVBæ–BÇÂ‡BçG—RÓÒw6†—rbbBçG—RÓÒw7VG&öâr’’&WGW&âfÇ6S°¢6öç7BÒ7W'&VçEFö¶Vå÷6—F–öåc3b‡B“°¢&WGW&âÖF‚æ‡—÷B‡ç‚Ò6VÅ÷2ç‚Âç’Ò6VÅ÷2ç’’ÃÒÔU$tUõ$ätS°¢Ò’¢µÓ°¢6öç7B7&WtÖ&·WÒ&VÅ6†—ò ¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
Ý­ýb(	B=í­ƒÂöÆ&VÃãÆF—b6Æ73Ò''G2Ö7&WrÖÆ—7B×c3b#âG·Æ–W$÷F–öç5c3b†fÇ6R’æÖ‡ÓâÆÆ&VÂ6Æ73Ò&6†V6²ÖÆ–æR#ãÆ–çWBG—SÒ&6†V6¶&÷‚"FF×'G2Ö7&Wr×Æ–W#Ò"G¶W62‡æ–B—Ò"G²‡&VÅ6†—æ7&WuÆ–W$–G2ÇÂµÒ’æ–æ6ÇVFW2‡æ–B’òv6†V6¶VBr¢rwÒóâG¶W62‡æF—7Æ”æÖRÇÂæ–B—ÓÂöÆ&VÃæ’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý]"=í­í#ÂöF—câwÓÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
Ý­ýb(	Bå3ÂöÆ&VÃãÆF—b6Æ73Ò''G2Ö7&WrÖÆ—7B×c3b#âG¶ç4÷F–öç5c3b‚’æÖ†âÓâÆÆ&VÂ6Æ73Ò&6†V6²ÖÆ–æR#ãÆ–çWBG—SÒ&6†V6¶&÷‚"FF×'G2Ö7&WrÖç3Ò"G¶W62†âæ–B—Ò"G²‡&VÅ6†—æ7&Wtç4–G2ÇÂµÒ’æ–æ6ÇVFW2†âæ–B’òv6†V6¶VBr¢rwÒóâG¶W62†âææÖRÇÂâæ–B—ÓÂöÆ&VÃæ’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý]"å3ÂöF—câwÓÂöF—cãÂöF—cæ¢rs°¢6öç7B7VDÖ&·WÒ—57VBòÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
í-"Ý­M³ÂöÆ&VÃâG·7VE7FG2ç6†—2æÖ‡2ÓâÆF—b6Æ73Ò''G2×7VB×&÷r×c3b#ãÇ7ãâG¶W62‡2ææÖR—Ò+r)»ÒG´çVÖ&W"‡2ægVVÂÇÂ’çFôf—†VBƒ—ÒòG´çVÖ&W"‡2ægVVÄ66—G’ÇÂ’çFôf—†VBƒ—ÓÂ÷7ããÆ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"FF×'G2ÖFWF6ƒÒ"G¶W62‡2æ–B—Ò#í	í
-
m	]	ý	
-
ÃÂö'WGFöããÂöF—cæ’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
Ý­Mý=-ãÂöF—câwÓÂöF—cæ¢rs°¢6öç7BÖW&vTÖ&·WÒÖW&vUF&vWG2æÆVæwF€¢òÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	í­]MÝ-Â"Ý­M2ýMíÂÂ(šBG´ÔU$tUõ$ätWÒ]B“ÂöÆ&VÃãÆF—b6Æ73Ò''G2ÖFB×&÷r×c3b#ãÇ6VÆV7B6Æ73Ò'6VÆV7B"–CÒ''G2ÖÖW&vR×F&vWB×c3b#âG¶ÖW&vUF&vWG2æÖ‡BÓâÆ÷F–öâfÇVSÒ"G¶W62‡Bæ–B—Ò#âG¶W62‡&Vv–öäÖFö¶VäÆ&VÅc3b‡B’—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"–CÒ''G2ÖÖW&vRÖ'Fâ×c3b#äô³Âö'WGFöããÂöF—cãÂöF—cæ ¢¢‡&VÅ6†—ÇÂ—57VB’òÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	M½òí­]MÝ]ÝòýíM-]M‚­í½‚½mRŽ(šBG´ÔU$tUõ$ätWÒ]B’ãÂöF—cæ¢rs°¢–ç7V7F÷"ÒÆF—b6Æ73Ò''G2×æVÂÖw&÷W×c3b'G2Ö–ç7V7F÷"×c3b#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#âG¶—57VBò}
Ý­Mr¢6VÆV7FVBçG—RÓÓÒv6—G’rò}	=ííBr¢}
íÝ"wÓ¢G¶W62‡&Vv–öäÖFö¶VäÆ&VÅc3b‡6VÆV7FVB’—ÓÂöF—cà¢G¶—4VF—BòÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ÍòÝ­-SÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"–CÒ''G2×Fö¶VâÖæÖR×c3b"fÇVSÒ"G¶W62‡6VÆV7FVBææÖRÇÂrr—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
m-]#ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&6öÆ÷""–CÒ''G2×Fö¶VâÖ6öÆ÷"×c3b"fÇVSÒ"G¶W62‚õâ5³Ó–ÖdÔe×³gÒBòçFW7B‡6VÆV7FVBæ6öÆ÷"ÇÂrr’ò6VÆV7FVBæ6öÆ÷"¢r3vFc–fbr—Ò"óãÂöF—cãÂöF—cæ¢rwÐ¢ÆÆ&VÂ6Æ73Ò&6†V6²ÖÆ–æR#ãÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ''G2×Fö¶Vâ×f—6–&ÆR×c3b"G·6VÆV7FVBçf—6–&ÆUFõÆ–W'2òv6†V6¶VBr¢rwÒóâG·6VÆV7FVBçG—RÓÓÒv6—G’rò}	}­]ý½Ò(	B-M]Ò=í­Âýí-]R-=ÍÝr¢}	-MÂ=í­Â}­]ý½Ò	M	ÍíÂ’wÓÂöÆ&VÃà¢G·&VÅ6†—ò ¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
]­-]-­‚­í½ò…v÷&ÆB6öæf–r’(	BÍímÝâÍ]Ýý-ÂýýÍâ}M]Ã£ÂöF—cà¢ÆF—b6Æ73Ò&6öÇ32#à¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	í}íÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""–CÒ''G2×6†—×f—6–öâ×c3b"fÇVSÒ"G´çVÖ&W"‡&VÅ6†—çf—6–öå&F—W2ÇÂ—Ò"óãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
M(	BM½ÍÝí-ÃÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""–CÒ''G2×6†—×&F"×c3b"fÇVSÒ"G´çVÖ&W"‡&VÅ6†—ç&F%&F—W2ÇÂ—Ò"óãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-íý½-ãÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""7FWÒ#ã"–CÒ''G2×6†—ÖgVVÂ×c3b"fÇVSÒ"G´çVÖ&W"‡&VÅ6†—ægVVÂÇÂ—Ò"óãÂöF—cà¢ÂöF—cà¢G·Fö¶Vå&F$–æfõc3b‡6VÆV7FVB’ç"âòÆÆ&VÂ6Æ73Ò&6†V6²ÖÆ–æR#ãÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ''G2×6†—×&F"Ööâ×c3b"G·Fö¶Vå&F$–æfõc3b‡6VÆV7FVB’æ7F—fRòv6†V6¶VBr¢rwÒóâ
M-­½í}Ò+r-í=í-òM½ÍÝí-ÂG·Fö¶Vå&F$–æfõc3b‡6VÆV7FVB’ç'Ò]B-½­½í}]ÝÝ½’MÝR-M"‚ÝR*½-]--ü+²“ÂöÆ&VÃæ¢sÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
MÝR=-Ýí-½]Ò(	BMí-Â­í½ÂM"v÷&ÆB6öæf–rãÂöF—câwÐ¢¢—57VBò ¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	í}íÂM‚-íý½-âÝ­M²íý]M]½ýí-ò­í½ýÍ‚"]í--R…v÷&ÆB6öæf–r’ãÂöF—cà¢G·Fö¶Vå&F$–æfõc3b‡6VÆV7FVB’ç"âòÆÆ&VÂ6Æ73Ò&6†V6²ÖÆ–æR#ãÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ''G2×7VB×&F"Ööâ×c3b"G·6VÆV7FVBç&F$Væ&ÆVBÓÒfÇ6Ròv6†V6¶VBr¢rwÒóâ
MÝ­M²-­½í}Ò+rG·Fö¶Vå&F$–æfõc3b‡6VÆV7FVB’ç'Ò]CÂöÆ&VÃæ¢rwÐ¢¢ ¢ÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	í}íƒÒM=­-²“ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""–CÒ''G2×Fö¶Vâ×f—6–öâ×c3b"fÇVSÒ"G´çVÖ&W"‡6VÆV7FVBçf—6–öå&F—W2ÇÂ—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
M-í­]ÝÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""–CÒ''G2×Fö¶Vâ×&F"×c3b"fÇVSÒ"G´çVÖ&W"‡6VÆV7FVBç&F%&F—W2ÇÂ—Ò"óãÂöF—cãÂöF—cà¢G·Fö¶Vå&F$–æfõc3b‡6VÆV7FVB’ç"âòÆÆ&VÂ6Æ73Ò&6†V6²ÖÆ–æR#ãÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ''G2×Fö¶Vâ×&F"Ööâ×c3b"G·Fö¶Vå&F$–æfõc3b‡6VÆV7FVB’æ7F—fRòv6†V6¶VBr¢rwÒóâ
M-­½í}Ò+rM½ÍÝí-ÂG·Fö¶Vå&F$–æfõc3b‡6VÆV7FVB’ç'Ò]CÂöÆ&VÃæ¢rwÐ¢Ð¢G¶7&WtÖ&·WÐ¢G·7VDÖ&·WÐ¢G¶ÖW&vTÖ&·WÐ¢G·6VÆV7FVE6†—bb—57VBòÆF—b6Æ73Ò''G2×6†—×7FBÖ6&B×c3b#ãÆ#âG¶W62‡6VÆV7FVE6†—ææÖR—ÓÂö#âG·6†—Ö÷fVÖVçE7FG4Ö&·Wc3b‡6VÆV7FVE6†——ÓÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
-íý½-ã¢Ç7â–CÒ''G2×6†—ÖgVVÂ×&VF÷WB×c3b#âG´çVÖ&W"†Æ—fTgVVÅc3b‡6VÆV7FVBÂ6VÆV7FVE6†—’’çFôf—†VBƒ—ÒòG´çVÖ&W"‡6VÆV7FVE6†—ægVVÄ66—G’’çFôf—†VBƒ—ÓÂ÷7ããÂöF—cãÂöF—cæ¢rwÐ¢G¶—57VBòÆF—b6Æ73Ò''G2×6†—×7FBÖ6&B×c3b#ãÆ#âG¶W62‡6VÆV7FVBææÖRÇÂ}
Ý­Mr—ÓÂö#ãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
­íí-ÂÝ­M³¢G·7VE7FG2ç7VVBçFôf—†VBƒ—Ò]Bý]¢ýâÍíÍ2Í]M½]ÝÝíÍ2“ÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	í]R-íý½-ã¢Ç7â–CÒ''G2×6†—ÖgVVÂ×&VF÷WB×c3b#âG´çVÖ&W"†Æ—fTgVVÅc3b‡6VÆV7FVBÂÆ—fU6†—f÷%Fö¶Våc3b‡6VÆV7FVB’ÇÂ·Ò’’çFôf—†VBƒ—ÒòG·7VE7FG2ægVVÄ66—G’çFôf—†VBƒ—ÓÂ÷7ããÂöF—cãÂöF—cæ¢rwÐ¢ÆF—b6Æ73Ò''G2Ö–ç7V7F÷"Ö7F–öç2×c3b#à¢G²—4VF—Bò‚‚’Óâ°¢6öç7B–ç7FÆÆVD–G2Ò&VÅ6†—ò6fT'&•c3b‡&VÅ6†—æÖ—76–ÆT–G2’¢—57VBòVæ—VUc3b‡7VE7FG2ç6†—2æfÆDÖ‡2Óâ6fT'&•c3b‡2æÖ—76–ÆT–G2’’’¢µÓ°¢6öç7B–ç7FÆÆVBÒ–ç7FÆÆVD–G2æÖ†–BÓâÔ•54”ÄU5õc3e¶–EÒ’æf–ÇFW"„&ööÆVâ“°¢6öç7B÷F–öç2Ò–ç7FÆÆVBæÆVæwF€¢ò–ç7FÆÆVBæÖ†ÒÓâÆ÷F–öâfÇVSÒ'v3¢G¶W62†Òæ–B—Ò"G¶v3¢G¶Òæ–GÖÓÓÒ…%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆUG—RÇÂrr’òw6VÆV7FVBr¢rwÓâG¶W62†ÒææÖR—Ò+rG´çVÖ&W"†Òç&ævR—ÓÂö÷F–öãæ’æ¦ö–â‚rr¢¢ö&¦V7BæVçG&–W2„Ô•54”ÄUõE•U5õc3b’æÖ‚…¶¶W’Â7V5Ò’ÓâÆ÷F–öâfÇVSÒ"G¶W62†¶W’—Ò"G¶¶W’ÓÓÒ…%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆUG—RÇÂv†VBr’òw6VÆV7FVBr¢rwÓâG¶W62‡7V2æÆ&VÂ—Ò+rG·7V2ç&ævWÓÂö÷F–öãæ’æ¦ö–â‚rr“°¢&WGW&âÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"–CÒ''G2×7F÷×c3b"G¶Ö÷f–æròrr¢vF—6&ÆVBwÓí

-	í	óÂö'WGFöããÇ6VÆV7B6Æ73Ò'6VÆV7B'G2ÖÖ—76–ÆR×G—R×6VÂ×c3b"–CÒ''G2ÖÖ—76–ÆR×G—R×c3b"F—FÆSÒ"G¶–ç7FÆÆVBæÆVæwF‚ò}
­]-²Â=-Ýí-½]ÝÝ½RÝ­í½Rr¢}	--í]ÝÝ½R-ý²­]-²"t2ÝR=-Ýí-½]Ý²’wÒ#âG¶÷F–öç7ÓÂ÷6VÆV7CãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"–CÒ''G2ÖÖ—76–ÆR×c3b#í
		­	]
-	Âö'WGFöãæ°¢Ò’‚’¢rwÐ¢Æ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"–CÒ''G2ÖFVÆWFR×Fö¶Vâ×c3b#í
=M½-ÂíÝ#Âö'WGFöãà¢ÂöF—cà¢ÂöF—cæ°¢ÒVÇ6R–b‡6VÆV7FVDÖ&¶W"’°¢6öç7BF&vWD÷G2ÒÆ÷F–öâfÇVSÒ"#í	Ý]"ý]]]íMÂö÷F–öãâG·&Vv–öäÖ÷F–öç5c3b‚’æf–ÇFW"†ÒÓâÒæ–BÓÒÖæ–B’æÖ†ÒÓâÆ÷F–öâfÇVSÒ"G¶W62†Òæ–B—Ò"G¶Òæ–BÓÓÒ6VÆV7FVDÖ&¶W"çF&vWE&Vv–öä–Bòw6VÆV7FVBr¢rwÓâG¶W62†ÒææÖR—Ò+rG¶W62†Òæ¶–æB—ÓÂö÷F–öãæ’æ¦ö–â‚rr—Ö°¢–ç7V7F÷"ÒÆF—b6Æ73Ò''G2×æVÂÖw&÷W×c3b'G2Ö–ç7V7F÷"×c3b#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Í]-­ÂöF—cà¢ÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Ý}-ÝSÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"–CÒ''G2ÖÖ&¶W"ÖæÖR×c3b"fÇVSÒ"G¶W62‡6VÆV7FVDÖ&¶W"ææÖRÇÂrr—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
m-]#ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&6öÆ÷""–CÒ''G2ÖÖ&¶W"Ö6öÆ÷"×c3b"fÇVSÒ"G¶W62‚õâ5³Ó–ÖdÔe×³gÒBòçFW7B‡6VÆV7FVDÖ&¶W"æ6öÆ÷"ÇÂrr’ò6VÆV7FVDÖ&¶W"æ6öÆ÷"¢r3vFc–fbr—Ò"óãÂöF—cãÂöF—cà¢ÆÆ&VÂ6Æ73Ò&6†V6²ÖÆ–æR#ãÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ''G2ÖÖ&¶W"×f—6–&ÆR×c3b"G·6VÆV7FVDÖ&¶W"çf—6–&ÆUFõÆ–W'2ÓÒfÇ6Ròv6†V6¶VBr¢rwÒóâ	-MÝ=í­ÃÂöÆ&VÃà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ý]]]íB"]=íÒò=ííCÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"–CÒ''G2ÖÖ&¶W"×F&vWB×c3b#âG·F&vWD÷G7ÓÂ÷6VÆV7CãÂöF—cà¢ÆF—b6Æ73Ò''G2Ö–ç7V7F÷"Ö7F–öç2×c3b#ãÆ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"–CÒ''G2ÖFVÆWFRÖÖ&¶W"×c3b#í
=M½-ÂÍ]-­3Âö'WGFöããÂöF—cà¢ÂöF—cæ°¢Ð¢&WGW&âÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶—4VF—Bò}
]M­-í¢Mí-½ý’í­]­-²­Ýíý­Í‚ÝmRÂý]]-­-’Rýâ­-RÂ-ýÝ‚ý=-í-2(	BýÝíÍÂ­í½]â(	B}=Ââr¢}	=¢-½]‚íÝ"‚­½­Ý‚ýâ­-R(	Býí½ímÂ­=â	­í½]â(	B}=ÂÂ-ýÝ‚ý=-í-2(	BýÝíÍâwÓÂöF—cà¢G¶—4VF—BòFEFööÇ2¢76–våFööÇ7Ð¢G¶–ç7V7F÷"ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR"7G–ÆSÒ&Ö&v–â×F÷£'‚#í	í­]­"ÝR-½Ò(	B­½­Ý‚ýâíÝ-2½‚Í]-­RÝ­-RãÂöF—câwÖ°¢Ð¢gVæ7F–öâ&VæFW%&Vv–öäÖc3b†Ö’°¢6öç7BvÒÒ—4vÕc3b‚“°¢6öç7BFööÆ&"ÒÆF—b6Æ73Ò'&Vv–öâÖÖ×FööÆ&"×c3b#à¢ÆF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	­-]=íÝÂöF—cãÆƒ#âG¶W62†ÖææÖR—ÓÂöƒ#âG·&Vv–öäÖ66W74&ææW%c3b†Ö—ÓÂöF—cà¢ÆF—b6Æ73Ò'&÷r"7G–ÆSÒ&v£‡ƒ¶fÆW‚×w&§w&¶§W7F–g’Ö6öçFVçC¦fÆW‚ÖVæB#à¢G¶vÒòÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"–CÒ''G2ÖÖöFR×FövvÆR×c3b#âGµ%E5õ$Tt”ôåõT•õc3bæÖöFRÓÓÒvVF—Brò}
	]	m		Ã¢
	]	M		­
-	í
r¢}
	]	m		Ã¢		=
	wÓÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’Gµ%E5õ$Tt”ôåõT•õc3bçF–ÖU66ÆRÓÓÒòw'G2Ö&ÒÖ7F—fR×c3br¢rwÒ"G—SÒ&'WGFöâ"FF×'G2×F–ÖR×c3cÒ#"F—FÆSÒ-	ý=}#î(ûƒÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’Gµ%E5õ$Tt”ôåõT•õc3bçF–ÖU66ÆRÓÓÒòw'G2Ö&ÒÖ7F—fR×c3br¢rwÒ"G—SÒ&'WGFöâ"FF×'G2×F–ÖR×c3cÒ#"F—FÆSÒ-	í½}Ýò­íí-Â#ã9sÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’Gµ%E5õ$Tt”ôåõT•õc3bçF–ÖU66ÆRÓÓÒ"òw'G2Ö&ÒÖ7F—fR×c3br¢rwÒ"G—SÒ&'WGFöâ"FF×'G2×F–ÖR×c3cÒ#""F—FÆSÒ-	M-íÝò­íí-Â#ã,9sÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’Gµ%E5õ$Tt”ôåõT•õc3bæföu&Wf–Wròw'G2Ö&ÒÖ7F—fR×c3br¢rwÒ"G—SÒ&'WGFöâ"–CÒ''G2Öför×FövvÆR×c3b"F—FÆSÒ-	ýí­}-Â-=ÍÒ-íÝ²­¢2=í­í"#í
-
=	Í		ÓÂö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"–CÒ''G2ÖÖ&–VçB×c3b#í
Ý	Í			]	Ý
#Âö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"–CÒ''G2×6†÷rÖF—7Æ’×c3b#í	Ý	"
Ý	­
		ÓÂö'WGFöãæ¢rwÐ¢Æ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"–CÒ''G2Ö6Æ÷6RÖÖ×c3b#í	}		­

½
-
ÃÂö'WGFöãà¢ÂöF—cà¢ÂöF—cæ°¢6öç7BÖ&¶W'2Ò6fT'&•c3b†ÖæÖ&¶W'2’æf–ÇFW"†Ö&¶W"ÓâvÒÇÂÖ&¶W"çf—6–&ÆUFõÆ–W'2’æÖ†Ö&¶W"Óâ²6öç7B6VÂÒvÒbbÖ&¶W"æ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVDÖ&¶W$–Bòr6VÆV7FVBr¢rs²&WGW&âÆ'WGFöâ6Æ73Ò''G2ÖÖÖÖ&¶W"×c3bG·6VÇÒ"FFÖÖ&¶W"Ö–CÒ"G¶W62†Ö&¶W"æ–B—Ò"7G–ÆSÒ&ÆVgC¢G²†Ö&¶W"ç‚òÖçv–GF‚¢’çFôf—†VBƒ2—ÒS·F÷¢G²†Ö&¶W"ç’òÖæ†V–v‡B¢’çFôf—†VBƒ2—ÒS²Ò×'G2Ö6öÆ÷#¢G¶W62†Ö&¶W"æ6öÆ÷"—Ò"F—FÆSÒ"G¶W62†Ö&¶W"ææÖR—Ò#ãÇ7ããÂ÷7ããÆ#âG¶W62†Ö&¶W"ææÖR—ÓÂö#ãÂö'WGFöãæ²Ò’æ¦ö–â‚rr“°¢6öç7BFö¶Vç2Ò6fT'&•c3b†ÖçFö¶Vç2’æf–ÇFW"‡Fö¶VâÓâf—6–&ÆU&Vv–öåFö¶Våc3b‡Fö¶VâÂÖ’’æÖ‡Fö¶VâÓâ&VæFW%&Vv–öåFö¶VäÖ&·Wc3b†ÖÂFö¶Vâ’’æ¦ö–â‚rr“°¢6öç7B†–çBÒ%E5õ$Tt”ôåõT•õc3bæÖöFRÓÓÒvVF—Bp¢ò}	ý]]-­-’-í­]Ý²‚Í]-­‚+r­í½]â(	B}=Â+r-ýÝ‚ý=-í-2(	BýÝíÍp¢¢u6†–gB½­½¢(	B-½-Âý]M­-í--Â+r­½¢ýâí­]­-2(	Bý­r­=ý­]-’+r­½¢ýâý=-íÍ2Í]-2(	B­=s°¢&WGW&âG·FööÆ&'ÓÆF—b6Æ73Ò'&Vv–öâÖÖÖÆ–÷WB×c3b#à¢ÆF—b6Æ73Ò'&Vv–öâÖÖÖ&ö&B×w&×c3b"–CÒ'&Vv–öâÖÖÖ&ö&B×w&×c3b#à¢ÆF—b6Æ73Ò'&Vv–öâÖÖÖg&ÖR×c3bGµ%E5õ$Tt”ôåõT•õc3bæÖöFRÓÓÒvVF—Bròv—2ÖVF—Br¢v—2×Æ’wÒ"–CÒ'&Vv–öâÖÖÖg&ÖR×c3b"FFÖÖÖ–CÒ"G¶W62†Öæ–B—Ò#à¢ÆF—b6Æ73Ò'&Vv–öâÖÖ×7FvR×c3b"–CÒ'&Vv–öâÖÖ×7FvR×c3b"7G–ÆSÒ&&6¶w&÷VæBÖ6öÆ÷#¢3ƒ#²G¶Öæ–ÖvRò&6¶w&÷VæBÖ–ÖvS§W&Â‚rG¶W62†Öæ–ÖvR—Òr–¢rwÒ#à¢ÆF—b6Æ73Ò''G2ÖgVVÂ×&ævR×c3b"–CÒ'&Vv–öâÖgVVÂ×&ævR×c3b"7G–ÆSÒ&F—7Æ“¦æöæR#ãÂöF—cà¢ÆF—b6Æ73Ò''G2×&F"×&ævR×c3b"–CÒ'&Vv–öâ×&F"×&ævR×c3b"7G–ÆSÒ&F—7Æ“¦æöæR#ãÂöF—cà¢ÆF—b6Æ73Ò''G2ÖÖÖw&–B×c3b#ãÂöF—cà¢Ç7fr6Æ73Ò''G2Ö6÷W'6R×7fr×c3b"–CÒ''G2Ö6÷W'6R×7fr×c3b"f–Wt&÷ƒÒ#G´çVÖ&W"†Öçv–GF‚ÇÂ—ÒG´çVÖ&W"†Öæ†V–v‡BÇÂs—Ò"&W6W'fT7V7E&F–óÒ&æöæR"7G–ÆSÒ&F—7Æ“¦æöæR#ãÆÆ–æR6Æ73Ò''G2Ö6÷W'6RÖÆ–æR×c3b"–CÒ''G2Ö6÷W'6RÖÆ–æR×c3b"ƒÒ#"“Ò#"ƒ#Ò#"“#Ò#"óãÂ÷7fsà¢G¶Ö&¶W'7ÒG·Fö¶Vç7Ð¢ÆF—b6Æ73Ò''G2ÖÖ—76–ÆW2ÖÆ–W"×c3b"–CÒ''G2ÖÖ—76–ÆW2ÖÆ–W"×c3b#ãÂöF—cà¢Æ6çf26Æ73Ò''G2ÖförÖ6çf2×c3b"–CÒ''G2ÖförÖ6çf2×c3b"7G–ÆSÒ&F—7Æ“¦æöæR#ãÂö6çf3à¢ÂöF—cà¢ÆF—b6Æ73Ò'&Vv–öâÖÖ×¦ööÒÖ6öçG&öÇ2×c3b#à¢Æ'WGFöâG—SÒ&'WGFöâ"–CÒ''G2×¦ööÒÖ–â×c3b"F—FÆSÒ-	ý½}-Â#îûÈ³Âö'WGFöãà¢Æ'WGFöâG—SÒ&'WGFöâ"–CÒ''G2×¦ööÒÖ÷WB×c3b"F—FÆSÒ-	í-M½-Â#îûÈÓÂö'WGFöãà¢Æ'WGFöâG—SÒ&'WGFöâ"–CÒ''G2×¦ööÒ×&W6WB×c3b"F—FÆSÒ-
í-Â-B#î)û#Âö'WGFöãà¢ÂöF—cà¢ÆF—b6Æ73Ò'&Vv–öâÖÖÖ†–çB×c3b#âG¶†–çGÓÂöF—cà¢ÆF—b6Æ73Ò''G2Ö6÷W'6RÖÆ&VÂ×c3b"–CÒ''G2Ö6÷W'6RÖÆ&VÂ×c3b"7G–ÆSÒ&F—7Æ“¦æöæR#ãÂöF—cà¢ÂöF—cà¢ÂöF—cà¢Æ6–FR6Æ73Ò'&Vv–öâÖÖ×6–FR×c3b"–CÒ'&Vv–öâÖÖ×6–FR×c3b"G¶vÒòrr¢r7G–ÆSÒ&F—7Æ“¦æöæR"wÓâG¶vÒò&VæFW%&Vv–öå6–FUæVÅc3b†Ö’¢rwÓÂö6–FSà¢ÂöF—cæ°¢Ð¢gVæ7F–öâ÷Vå&Vv–öäÖc3b†Ö–B’°¢6öç7BÖÒ$Tt”ôåôÔ5õc3e¶Ö–EÓ°¢–b‚Ö’&WGW&âFö7Bç6†÷r‚}	­-]=íÝÝRÝM]ÝrÂvW'"r“°¢–b‚6ä÷Vå&Vv–öäÖc3b†Ö’’&WGW&âFö7Bç6†÷r‚}	ý]íÝbÝRÝ]íM-ò"Ý-íÂ]=íÝRrÂvW'"r“°¢%E5õ$Tt”ôåõT•õc3bæÖ–BÒÖæ–C°¢%E5õ$Tt”ôåõT•õc3bçf–WrÒ²¦ööÓ¢Âåƒ¢Âå“¢Âg&ÖUs¢Âg&ÖTƒ¢Ó°¢6öç7B'VçF–ÖRÒvWE&Vv–öå'VçF–ÖUc3b‚“°¢'VçF–ÖRæ7F—fTÖ–BÒÖæ–C°¢'VçF–ÖRçWFFVDBÒæ÷t—6õc3b‚“°¢6öç7BÖöFÂÒVç7W&U&Vv–öäÖöFÅc3b‚“°¢ÖöFÂæ6Æ74Æ—7BæFB‚v÷Vâr“°¢–b‚%E5õ$Tt”ôåõT•õc3bç&W6—¦T&÷VæB’°¢%E5õ$Tt”ôåõT•õc3bç&W6—¦T&÷VæBÒG'VS°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚w&W6—¦RrÂ‚’Óâ²–b†Fö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖÖÖöFÂ×c3br“òæ6Æ74Æ—7Bæ6öçF–ç2‚v÷Vâr’’6—¦U&Vv–öä&ö&Ec3b‚“²Ò“°¢Ð¢&W&VæFW%&Vv–öäÖc3b‚“°¢VWVU&Vv–öäF—7Æ”Ö—'&÷%c3b‚“°¢G'’²v–æF÷rä6öÖ&DVF–õc3sòç7F'DÖ&–VçCòâ‡&Vv–öäÖ&–VçD¶W•c3b‚’“²Ò6F6‚·Ð¢Ð¢gVæ7F–öâ&W&VæFW%&Vv–öäÖc3b‚’°¢6öç7BÖÒ$Tt”ôåôÔ5õc3eµ%E5õ$Tt”ôåõT•õc3bæÖ–EÓ°¢6öç7B&öG’ÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖÖ&öG’×c3br“°¢–b‚ÖÇÂ&öG’’&WGW&ã°¢&öG’æ–ææW$…DÔÂÒ&VæFW%&Vv–öäÖc3b†Ö“°¢&–æE&Vv–öäÖÖöFÅc3b†Ö“°¢6—¦U&Vv–öä&ö&Ec3b‚“°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’Óâ6—¦U&Vv–öä&ö&Ec3b‚’“°¢6WEF–ÖV÷WB‚‚’Óâ6—¦U&Vv–öä&ö&Ec3b‚’Âƒ“°¢7F'E&Vv–öäÖæ–ÖF–öåc3b‚“°¢Ð¢gVæ7F–öâ&Vg&W6…&Vv–öå6–FUc3b†Ö’°¢6öç7B6–FRÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖ×6–FR×c3br“°¢–b‚6–FRÇÂ—4vÕc3b‚’’&WGW&ã°¢6–FRæ–ææW$…DÔÂÒ&VæFW%&Vv–öå6–FUæVÅc3b†Ö“°¢&–æE&Vv–öå6–FT6öçG&öÇ5c3b†Ö“°¢Ð¢gVæ7F–öâ6VÆV7E&Vv–öåFö¶Våc3b†ÖÂ–B’°¢%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–BÒ–C°¢%E5õ$Tt”ôåõT•õc3bç6VÆV7FVDÖ&¶W$–BÒrs°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚rç'G2ÖÖ×Fö¶Vâ×c3br’æf÷$V6‚†æöFRÓâæöFRæ6Æ74Æ—7BçFövvÆR‚w6VÆV7FVBrÂæöFRæFF6WBçFö¶Vä–BÓÓÒ–B’“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚rç'G2ÖÖÖÖ&¶W"×c3br’æf÷$V6‚†æöFRÓâæöFRæ6Æ74Æ—7Bç&VÖ÷fR‚w6VÆV7FVBr’“°¢&Vg&W6…&Vv–öå6–FUc3b†Ö“°¢Ð¢gVæ7F–öâ6VÆV7E&Vv–öäÖ&¶W%c3b†ÖÂ–B’°¢%E5õ$Tt”ôåõT•õc3bç6VÆV7FVDÖ&¶W$–BÒ–C°¢%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–BÒrs°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚rç'G2ÖÖÖÖ&¶W"×c3br’æf÷$V6‚†æöFRÓâæöFRæ6Æ74Æ—7BçFövvÆR‚w6VÆV7FVBrÂæöFRæFF6WBæÖ&¶W$–BÓÓÒ–B’“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚rç'G2ÖÖ×Fö¶Vâ×c3br’æf÷$V6‚†æöFRÓâæöFRæ6Æ74Æ—7Bç&VÖ÷fR‚w6VÆV7FVBr’“°¢&Vg&W6…&Vv–öå6–FUc3b†Ö“°¢Ð¢gVæ7F–öâ&ö&D6ö÷&G4g&öÔWfVçEc3b†WfVçBÂÖ’°¢6öç7B7FvRÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖ×7FvR×c3br“°¢6öç7B&V7BÒ7FvRævWD&÷VæF–æt6Æ–VçE&V7B‚“°¢&WGW&â²ƒ¢6Æ×‚‚†WfVçBæ6Æ–VçE‚Ò&V7BæÆVgB’òÖF‚æÖ‚ƒÂ&V7Bçv–GF‚’’¢Öçv–GF‚ÂÂÖçv–GF‚’Â“¢6Æ×‚‚†WfVçBæ6Æ–VçE’Ò&V7BçF÷’òÖF‚æÖ‚ƒÂ&V7Bæ†V–v‡B’’¢Öæ†V–v‡BÂÂÖæ†V–v‡B’Ó°¢Ð¢gVæ7F–öâ&–æE&Vv–öäÖÖöFÅc3b†Ö’°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Ö6Æ÷6RÖÖ×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ6Æ÷6U&Vv–öäÖc3b“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖöFR×FövvÆR×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ²%E5õ$Tt”ôåõT•õc3bæÖöFRÒ%E5õ$Tt”ôåõT•õc3bæÖöFRÓÓÒvVF—BròwÆ’r¢vVF—Bs²%E5õ$Tt”ôåõT•õc3bæ&Ö–ærÒrs²&W&VæFW%&Vv–öäÖc3b‚“²Ò“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×6†÷rÖF—7Æ’×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ6†÷u&Vv–öäÖöäF—7Æ•c3b†Öæ–B’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ&–VçB×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ÷Vå&Vv–öäÖ&–VçEc3b“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Öför×FövvÆR×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ²%E5õ$Tt”ôåõT•õc3bæföu&Wf–WrÒ%E5õ$Tt”ôåõT•õc3bæföu&Wf–Ws²&W&VæFW%&Vv–öäÖc3b‚“²Ò“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚u¶FF×'G2×F–ÖR×c3eÒr’æf÷$V6‚†'FâÓâ'FâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ6WE&Vv–öåF–ÖU66ÆUc3b„çVÖ&W"†'FâæFF6WBç'G5F–ÖUc3b’’’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×¦ööÒÖ–â×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ&Vv–öå¦ööÔEc3bƒã"’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×¦ööÒÖ÷WB×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ&Vv–öå¦ööÔEc3bƒòã"’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×¦ööÒ×&W6WB×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ&W6WE&Vv–öåf–Wuc3b“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚rç'G2ÖÖ×Fö¶Vâ×c3br’æf÷$V6‚†æöFRÓâ°¢æöFRæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢WfVçBç7F÷&÷vF–öâ‚“°¢6öç7B–BÒæöFRæFF6WBçFö¶Vä–C°¢òò6†–gB½­½¢Ò-½íý]M­-í-ÝRâ	í½}Ý½’­½¢"]mÍR=²Òý­p¢òò­]-ý‚-íí=m]Ý‚ÂÝ}R(	B­=-½ÝÝí=âíÝ-¢m]½‚’à¢–b…%E5õ$Tt”ôåõT•õc3bæÖöFRÓÓÒvVF—BrÇÂWfVçBç6†–gD¶W’ÇÂ—4vÕc3b‚’’²6VÆV7E&Vv–öåFö¶Våc3b†ÖÂ–B“²&WGW&ã²Ð¢6öç7BF&vWBÒÖçFö¶Vç2æf–æB‡BÓâBæ–BÓÓÒ–B“°¢6öç7B6VÆV7FVBÒÖçFö¶Vç2æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B“°¢–b‚F&vWB’&WGW&ã°¢6öç7BF&vWE÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡F&vWB“°¢–b…%E5õ$Tt”ôåõT•õc3bæ&Ö–ær’°¢6öç7B6'&–W"ÒÖçFö¶Vç2æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bæ&Ö–ær“°¢–b†6'&–W"’²6öç7B7Ò7W'&VçEFö¶Vå÷6—F–öåc3b†6'&–W"“²–b†ÆVæ6„Ö—76–ÆUc3b†ÖÂ7ç‚Â7ç’ÂF&vWE÷2ç‚ÂF&vWE÷2ç’’’Fö7Bç6†÷r‚}
­]-}ý=]ÝrÂvö²r“²Ð¢%E5õ$Tt”ôåõT•õc3bæ&Ö–ærÒrs°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖÖg&ÖR×c3br“òæ6Æ74Æ—7Bç&VÖ÷fR‚v—2Ö&Ö–ærr“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ—76–ÆR×c3br“òæ6Æ74Æ—7Bç&VÖ÷fR‚w'G2Ö&ÒÖ7F—fR×c3br“°¢&WGW&ã°¢Ð¢–b‡6VÆV7FVBbb6VÆV7FVBæ–BÓÒ–B’²7F'E&Vv–öåFö¶VäÖ÷fUc3b†ÖÂ6VÆV7FVBÂF&vWE÷2ç‚ÂF&vWE÷2ç’“²&WGW&ã²Ð¢6VÆV7E&Vv–öåFö¶Våc3b†ÖÂ–B“°¢Ò“°¢æöFRæFDWfVçDÆ—7FVæW"‚wö–çFW&F÷vârÂWfVçBÓâ²WfVçBç7F÷&÷vF–öâ‚“²7F'E&Vv–öäG&uc3b†WfVçBÂÖÂwFö¶VârÂæöFRæFF6WBçFö¶Vä–B“²Ò“°¢Ò“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚rç'G2ÖÖÖÖ&¶W"×c3br’æf÷$V6‚†æöFRÓâ°¢æöFRæFDWfVçDÆ—7FVæW"‚wö–çFW&F÷vârÂWfVçBÓâ²WfVçBç7F÷&÷vF–öâ‚“²7F'E&Vv–öäG&uc3b†WfVçBÂÖÂvÖ&¶W"rÂæöFRæFF6WBæÖ&¶W$–B“²Ò“°¢æöFRæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢WfVçBç7F÷&÷vF–öâ‚“°¢6öç7BÖ&¶W"ÒÖæÖ&¶W'2æf–æB†ÒÓâÒæ–BÓÓÒæöFRæFF6WBæÖ&¶W$–B“°¢–b‚Ö&¶W"’&WGW&ã°¢–b†—4vÕc3b‚’bb%E5õ$Tt”ôåõT•õc3bæÖöFRÓÓÒvVF—Br’²6VÆV7E&Vv–öäÖ&¶W%c3b†ÖÂÖ&¶W"æ–B“²&WGW&ã²Ð¢òòÆ’ÖöFS¢6VÆV7FVBVæ—BvWG26÷W'6RFòF†RÖ&¶W#²÷F†W'v—6RföÆÆ÷rF†R&Vv–öâG&ç6—F–öâà¢6öç7BFö¶VâÒ—4vÕc3b‚’òÖçFö¶Vç2æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B’¢çVÆÃ°¢–b‡Fö¶Vâ’²7F'E&Vv–öåFö¶VäÖ÷fUc3b†ÖÂFö¶VâÂÖ&¶W"ç‚ÂÖ&¶W"ç’“²&WGW&ã²Ð¢–b†Ö&¶W"çF&vWE&Vv–öä–Bbb$Tt”ôåôÔ5õc3e¶Ö&¶W"çF&vWE&Vv–öä–EÒbb6ä÷Vå&Vv–öäÖc3b…$Tt”ôåôÔ5õc3e¶Ö&¶W"çF&vWE&Vv–öä–EÒ’’÷Vå&Vv–öäÖc3b†Ö&¶W"çF&vWE&Vv–öä–B“°¢Ò“°¢Ò“°¢&–æE&Vv–öä&ö&D–çFW&7F–öç5c3b†Ö“°¢&–æE&Vv–öå6–FT6öçG&öÇ5c3b†Ö“°¢Ð¢gVæ7F–öâ&–æE&Vv–öä&ö&D–çFW&7F–öç5c3b†Ö’°¢6öç7Bg&ÖRÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖÖg&ÖR×c3br“°¢–b‚g&ÖR’&WGW&ã°¢g&ÖRæFDWfVçDÆ—7FVæW"‚wv†VVÂrÂWfVçBÓâ°¢WfVçBç&WfVçDFVfVÇB‚“°¢6öç7B&V7BÒg&ÖRævWD&÷VæF–æt6Æ–VçE&V7B‚“°¢&Vv–öå¦ööÔEc3b†WfVçBæFVÇF’Âòã"¢òã"ÂWfVçBæ6Æ–VçE‚Ò&V7BæÆVgBÂWfVçBæ6Æ–VçE’Ò&V7BçF÷“°¢ÒÂ²76—fS¢fÇ6RÒ“°¢ÆWBâÒçVÆÃ°¢g&ÖRæFDWfVçDÆ—7FVæW"‚wö–çFW&F÷vârÂWfVçBÓâ°¢–b†WfVçBæ'WGFöâÓÒ’&WGW&ã°¢–b†WfVçBçF&vWBæ6Æ÷6W7B‚rç'G2ÖÖ×Fö¶Vâ×c3bÂç'G2ÖÖÖÖ&¶W"×c3bÂç&Vv–öâÖÖ×¦ööÒÖ6öçG&öÇ2×c3br’’&WGW&ã°¢6öç7BbÒvWE&Vv–öåf–Wuc3b‚“°¢âÒ²7F'Eƒ¢WfVçBæ6Æ–VçE‚Â7F'E“¢WfVçBæ6Æ–VçE’Âåƒ¢bçå‚Âå“¢bçå’ÂÖ÷fVC¢fÇ6RÂö–çFW$–C¢WfVçBçö–çFW$–BÓ°¢G'’²g&ÖRç6WEö–çFW$6GW&R†WfVçBçö–çFW$–B“²Ò6F6‚·Ð¢g&ÖRæ6Æ74Æ—7BæFB‚v—2×ææ–ærr“°¢†–FU&Vv–öä6÷W'6U&Wf–Wuc3b‚“°¢Ò“°¢g&ÖRæFDWfVçDÆ—7FVæW"‚wö–çFW&Ö÷fRrÂWfVçBÓâ°¢–b‚â’²WFFU&Vv–öä6÷W'6U&Wf–Wuc3b†ÖÂWfVçB“²&WGW&ã²Ð¢6öç7BG‚ÒWfVçBæ6Æ–VçE‚Òâç7F'E‚ÂG’ÒWfVçBæ6Æ–VçE’Òâç7F'E“°¢–b„ÖF‚æ'2†G‚’â2ÇÂÖF‚æ'2†G’’â2’âæÖ÷fVBÒG'VS°¢6öç7BbÒvWE&Vv–öåf–Wuc3b‚“°¢bçå‚Òâçå‚²Gƒ²bçå’Òâçå’²G“°¢Ç•&Vv–öä6ÖW&c3b‚“°¢–b‡âæÖ÷fVB’VWVU&Vv–öäF—7Æ”Ö—'&÷%c3b‚“°¢Ò“°¢g&ÖRæFDWfVçDÆ—7FVæW"‚wö–çFW&ÆVfRrÂ†–FU&Vv–öä6÷W'6U&Wf–Wuc3b“°¢g&ÖRæFDWfVçDÆ—7FVæW"‚wö–çFW'WrÂWfVçBÓâ°¢–b‚â’&WGW&ã°¢6öç7Bv5âÒâæÖ÷fVC°¢G'’²g&ÖRç&VÆV6Uö–çFW$6GW&R†WfVçBçö–çFW$–B“²Ò6F6‚·Ð¢g&ÖRæ6Æ74Æ—7Bç&VÖ÷fR‚v—2×ææ–ærr“°¢âÒçVÆÃ°¢–b‡v5â’²VWVU&Vv–öäF—7Æ”Ö—'&÷%c3b‚“²&WGW&ã²Ð¢–b‚—4vÕc3b‚’ÇÂ%E5õ$Tt”ôåõT•õc3bæÖöFRÓÒwÆ’r’&WGW&ã°¢–b†WfVçBçF&vWBæ6Æ÷6W7B‚rç'G2ÖÖ×Fö¶Vâ×c3bÂç'G2ÖÖÖÖ&¶W"×c3bÂç&Vv–öâÖÖ×¦ööÒÖ6öçG&öÇ2×c3br’’&WGW&ã°¢6öç7Bö–çBÒ&ö&D6ö÷&G4g&öÔWfVçEc3b†WfVçBÂÖ“°¢òòÖ—76–ÆR7G&–¶S¢v†Vâ&ÖVBÂF†RæW‡BV×G’6Æ–6²f—&W2BF†RF&vWB–ç7FVBöbÖ÷f–ærà¢–b…%E5õ$Tt”ôåõT•õc3bæ&Ö–ær’°¢6öç7B6'&–W"ÒÖçFö¶Vç2æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bæ&Ö–ær“°¢–b†6'&–W"’²6öç7B7Ò7W'&VçEFö¶Vå÷6—F–öåc3b†6'&–W"“²–b†ÆVæ6„Ö—76–ÆUc3b†ÖÂ7ç‚Â7ç’Âö–çBç‚Âö–çBç’’’Fö7Bç6†÷r‚}
­]-}ý=]ÝrÂvö²r“²Ð¢%E5õ$Tt”ôåõT•õc3bæ&Ö–ærÒrs°¢g&ÖRæ6Æ74Æ—7Bç&VÖ÷fR‚v—2Ö&Ö–ærr“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ—76–ÆR×c3br“òæ6Æ74Æ—7Bç&VÖ÷fR‚w'G2Ö&ÒÖ7F—fR×c3br“°¢&WGW&ã°¢Ð¢6öç7BFö¶VâÒÖçFö¶Vç2æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B“°¢–b‚Fö¶Vâ’²Fö7Bç6†÷r‚}
Ý}½-½]‚íÝ"M½òM-m]ÝòrÂvW'"r“²&WGW&ã²Ð¢7F'E&Vv–öåFö¶VäÖ÷fUc3b†ÖÂFö¶VâÂö–çBç‚Âö–çBç’“°¢†–FU&Vv–öä6÷W'6U&Wf–Wuc3b‚“°¢Ò“°¢g&ÖRæFDWfVçDÆ—7FVæW"‚wö–çFW&6æ6VÂrÂ‚’Óâ²âÒçVÆÃ²g&ÖRæ6Æ74Æ—7Bç&VÖ÷fR‚v—2×ææ–ærr“²Ò“°¢Ð¢gVæ7F–öâ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö’²&WGW&â6fT'&•c3b†ÖçFö¶Vç2’æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B’ÇÂçVÆÃ²Ð¢gVæ7F–öâ6VÆV7FVE&Vv–öäÖ&¶W%c3b†Ö’²&WGW&â6fT'&•c3b†ÖæÖ&¶W'2’æf–æB†ÒÓâÒæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVDÖ&¶W$–B’ÇÂçVÆÃ²Ð¢gVæ7F–öâFE&Vv–öäVçF—G•c3b†ÖÂ¶–æB’°¢6öç7BBÒf–Wt6VçFW$Ö6ö÷&G5c3b†Ö“°¢–b†¶–æBÓÓÒvÖ&¶W"r’°¢6öç7BÖ&¶W"Òæ÷&ÖÆ—¦U&Vv–öäÖ&¶W%c3b‡²æÖS¢}	Ýí-òÍ]-­rÂƒ¢Bç‚Â“¢Bç’Ò“°¢ÖæÖ&¶W'2çW6‚†Ö&¶W"“°¢%E5õ$Tt”ôåõT•õc3bç6VÆV7FVDÖ&¶W$–BÒÖ&¶W"æ–C²%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–BÒrs°¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}	Í]-­Mí-½]ÝrÂ²FVÆ“¢#Ò“°¢&W&VæFW%&Vv–öäÖc3b‚“°¢&WGW&ã°¢Ð¢ÆWBFö¶VâÒçVÆÃ°¢–b†¶–æBÓÓÒw6†—r’°¢6öç7B–BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×6†—×Fö¶Vâ×c3br“òçfÇVRÇÂrs°¢–b‚–BÇÂ4„•5õc3e¶–EÒ’&WGW&âFö7Bç6†÷r‚}	-½]‚­í½Ârý­rÂvW'"r“°¢òò­í½‚ýâ=Íí½}Ýâ­½-³¢=í­‚-Mý"R-í½Í­â"}íÝRí}í-íR­í½]¢Fö¶VâÒæ÷&ÖÆ—¦U&Vv–öåFö¶Våc3b‡²G—S¢w6†—rÂ6†—–C¢–BÂæÖS¢4„•5õc3e¶–EÒææÖRÂ–ÖvS¢4„•5õc3e¶–EÒæ–ÖvRÂƒ¢Bç‚Â“¢Bç’Âf—6–&ÆUFõÆ–W'3¢fÇ6RÒ“°¢ÒVÇ6R–b†¶–æBÓÓÒwÆ–W"r’°¢6öç7B–BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×Æ–W"×Fö¶Vâ×c3br“òçfÇVRÇÂrs°¢–b‚–B’&WGW&âFö7Bç6†÷r‚}	-½]‚=í­rý­rÂvW'"r“°¢Fö¶VâÒæ÷&ÖÆ—¦U&Vv–öåFö¶Våc3b‡²G—S¢wÆ–W"rÂÆ–W$–C¢–BÂæÖS¢vWEÆ–W$F—7Æ”æÖR†–B’Âƒ¢Bç‚Â“¢Bç’Âf—6–&ÆUFõÆ–W'3¢G'VRÒ“°¢ÒVÇ6R–b†¶–æBÓÓÒvç2r’°¢6öç7B–BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Öç2×Fö¶Vâ×c3br“òçfÇVRÇÂrs°¢–b‚–BÇÂå55¶–EÒ’&WGW&âFö7Bç6†÷r‚}	-½]‚å2rý­rÂvW'"r“°¢Fö¶VâÒæ÷&ÖÆ—¦U&Vv–öåFö¶Våc3b‡²G—S¢wVæ—BrÂç4–C¢–BÂæÖS¢å55¶–EÒææÖRÂ–ÖvS¢å55¶–EÒæ–ÖvRÂƒ¢Bç‚Â“¢Bç’Âf—6–&ÆUFõÆ–W'3¢fÇ6RÒ“°¢ÒVÇ6R–b†¶–æBÓÓÒv6—G’r’°¢òò=ííM-MÝ²=í­Âýí-]R-=ÍÝ-í½Í­âýí½R}­]ý½]Ýò	M	ÍíÀ¢Fö¶VâÒæ÷&ÖÆ—¦U&Vv–öåFö¶Våc3b‡²G—S¢v6—G’rÂæÖS¢}	=ííBrÂƒ¢Bç‚Â“¢Bç’Âf—6–&ÆUFõÆ–W'3¢fÇ6RÂ6öÆ÷#¢r6ffCcs‚rÒ“°¢ÒVÇ6R°¢Fö¶VâÒæ÷&ÖÆ—¦U&Vv–öåFö¶Våc3b‡²G—S¢wVæ—BrÂæÖS¢}	Ý]-½ÍÝ½’í-ýBrÂƒ¢Bç‚Â“¢Bç’Âf—6–&ÆUFõÆ–W'3¢fÇ6RÒ“°¢Ð¢ÖçFö¶Vç2çW6‚‡Fö¶Vâ“°¢%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–BÒFö¶Vâæ–C²%E5õ$Tt”ôåõT•õc3bç6VÆV7FVDÖ&¶W$–BÒrs°¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}
-í­]ÒMí-½]ÒrÂ²FVÆ“¢#Ò“°¢&W&VæFW%&Vv–öäÖc3b‚“°¢Ð¢gVæ7F–öâ6†—–G4öeFö¶Våc3b‡Fö¶Vâ’°¢–b‡Fö¶VâçG—RÓÓÒw7VG&öâr’&WGW&âVæ—VUc3b‡Fö¶Vâç6†—–G2ÇÂµÒ“°¢–b‡Fö¶VâçG—RÓÓÒw6†—rbbFö¶Vâç6†—–B’&WGW&â·Fö¶Vâç6†—–EÓ°¢&WGW&âµÓ°¢Ð¢gVæ7F–öâÖW&vT–çFõ7VG&öåc3b†ÖÂFö¶VäÂFö¶Vä"’°¢6öç7B–G4Ò6†—–G4öeFö¶Våc3b‡Fö¶Vä“°¢6öç7B–G4"Ò6†—–G4öeFö¶Våc3b‡Fö¶Vä"“°¢–b‚–G4æÆVæwF‚ÇÂ–G4"æÆVæwF‚’&WGW&âFö7Bç6†÷r‚}	í-í­]ÝMí½mÝ²½-Â­í½ýÍ‚½‚Ý­MÍ‚ý-ý}ÝÝ½Â­í½Ârt2’rÂvW'"r“°¢6öç7B6†—2ÒVæ—VUc3b…²ââæ–G4Âââæ–G4%Ò“°¢–b‡6†—2æÆVæwF‚Â"’&WGW&âFö7Bç6†÷r‚}
Ý-âíMÒ‚-í"mR­í½Â(	BÝ­MRÝ=mÝ²M-}Ý½RrÂvW'"r“°¢6öç7B÷4Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶Vä“°¢6öç7B÷4"Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶Vä"“°¢–b„ÖF‚æ‡—÷B‡÷4"ç‚Ò÷4ç‚Â÷4"ç’Ò÷4ç’’â%E5ôÔU$tUõ$ätUõc3b²’&WGW&âFö7Bç6†÷r†
½­íÂM½]­âM½òí­]MÝ]ÝòÝ=mÝâ(šBGµ%E5ôÔU$tUõ$ätUõc3gÒ]B–ÂvW'"r“°¢6öç7B÷2Ò÷4°¢6öç7BÆVBÒ4„•5õc3e·6†—5³ÕÓ°¢6öç7B7VBÒæ÷&ÖÆ—¦U&Vv–öåFö¶Våc3b‡°¢G—S¢w7VG&öârÀ¢æÖS¢
Ý­M*²G¶ÆVCòææÖRÇÂ6†—5³×Ü+¶À¢6†—–G3¢6†—2À¢ƒ¢÷2ç‚Â“¢÷2ç’À¢6öÆ÷#¢Fö¶Väæ6öÆ÷"À¢f—6–&ÆUFõÆ–W'3¢&ööÆVâ‡Fö¶Väçf—6–&ÆUFõÆ–W'2ÇÂFö¶Vä"çf—6–&ÆUFõÆ–W'2¢Ò“°¢ÖçFö¶Vç2ÒÖçFö¶Vç2æf–ÇFW"‡BÓâBæ–BÓÒFö¶Väæ–BbbBæ–BÓÒFö¶Vä"æ–B“°¢ÖçFö¶Vç2çW6‚‡7VB“°¢%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–BÒ7VBæ–C°¢Æ•&Vv–öå6÷VæE&æFöÕc3b‚vÖ—76–öåöVæEòrÂ2“²òò-íí]MÝ]ÝRÝ­M°¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}
Ý­MMíÍí-ÝrÂ²FVÆ“¢#Ò“°¢&W&VæFW%&Vv–öäÖc3b‚“°¢Ð¢gVæ7F–öâFWF6…6†—g&öÕ7VG&öåc3b†ÖÂFö¶VâÂ6†—–B’°¢–b‡Fö¶VâçG—RÓÒw7VG&öâr’&WGW&ã°¢Fö¶Vâç6†—–G2ÒVæ—VUc3b‡Fö¶Vâç6†—–G2ÇÂµÒ’æf–ÇFW"†–BÓâ–BÓÒ6†—–B“°¢6öç7B÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶Vâ“°¢6öç7B6†—Ò4„•5õc3e·6†—–EÓ°¢–b‡6†—’°¢ÖçFö¶Vç2çW6‚†æ÷&ÖÆ—¦U&Vv–öåFö¶Våc3b‡²G—S¢w6†—rÂ6†—–BÂæÖS¢6†—ææÖRÂƒ¢ÖF‚æÖ‚ƒÂ÷2ç‚ÒC’Â“¢ÖF‚æÖ‚ƒÂ÷2ç’ÒC’Âf—6–&ÆUFõÆ–W'3¢Fö¶Vâçf—6–&ÆUFõÆ–W'2Â6öÆ÷#¢Fö¶Vâæ6öÆ÷"Ò’“°¢Ð¢–b‡Fö¶Vâç6†—–G2æÆVæwF‚ÓÓÒ’°¢òòí-½ÂíMÝ]MÝm(	BÝ­MÝí--Ýí--ò­í½À¢6öç7BÆ7D–BÒFö¶Vâç6†—–G5³Ó°¢Fö¶VâçG—RÒw6†—s°¢Fö¶Vâç6†—–BÒÆ7D–C°¢Fö¶VâææÖRÒ4„•5õc3e¶Æ7D–EÓòææÖRÇÂFö¶VâææÖS°¢Fö¶Vâç6†—–G2ÒµÓ°¢ÒVÇ6R–b‚Fö¶Vâç6†—–G2æÆVæwF‚’°¢ÖçFö¶Vç2ÒÖçFö¶Vç2æf–ÇFW"‡BÓâBæ–BÓÒFö¶Vâæ–B“°¢%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–BÒrs°¢Ð¢Æ•&Vv–öå6÷VæE&æFöÕc3b‚vÖ—76–öå÷7F'EòrÂ2“²òò­í½Â=]íM"Ý}MÝP¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}	­í½Âí-m]ý½]Òí"Ý­M²rÂ²FVÆ“¢#Ò“°¢&W&VæFW%&Vv–öäÖc3b‚“°¢Ð¢gVæ7F–öâ&–æE&Vv–öå6–FT6öçG&öÇ5c3b†Ö’°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚u¶FF×'G2ÖFEÒr’æf÷$V6‚†'FâÓâ'FâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’ÓâFE&Vv–öäVçF—G•c3b†ÖÂ'FâæFF6WBç'G4FB’’“°¢òòÝ­ýb­í½òýýÍâ­-°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚u¶FF×'G2Ö7&Wr×Æ–W%ÒÅ¶FF×'G2Ö7&WrÖç5Òr’æf÷$V6‚†&÷‚Óâ&÷‚æFDWfVçDÆ—7FVæW"‚v6†ævRrÂ‚’Óâ°¢6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“°¢6öç7B6†—ÒFö¶Vãòç6†—–Bò4„•5õc3e·Fö¶Vâç6†—–EÒ¢çVÆÃ°¢–b‚6†—’&WGW&ã°¢6öç7B–BÒ&÷‚æFF6WBç'G47&WuÆ–W#°¢6öç7Bæ–BÒ&÷‚æFF6WBç'G47&Wtç3°¢–b‡–B’°¢6†—æ7&WuÆ–W$–G2ÒVæ—VUc3b…²âââ‡6†—æ7&WuÆ–W$–G2ÇÂµÒ’æf–ÇFW"†–BÓâ–BÓÒ–B’Ââââ†&÷‚æ6†V6¶VBò·–EÒ¢µÒ•Ò“°¢–b†&÷‚æ6†V6¶VBbbç7FFRçW6W'5·–EÒ’²ç7FFRçW6W'5·–EÒæ7W'&VçE6†—–BÒ6†—æ–C²–b‡6†—æ7W'&VçE&Vv–öä–B’ç7FFRçW6W'5·–EÒæ7W'&VçE&Vv–öä–BÒ6†—æ7W'&VçE&Vv–öä–C²Ð¢Ð¢–b†æ–B’6†—æ7&Wtç4–G2ÒVæ—VUc3b…²âââ‡6†—æ7&Wtç4–G2ÇÂµÒ’æf–ÇFW"†–BÓâ–BÓÒæ–B’Ââââ†&÷‚æ6†V6¶VBò¶æ–EÒ¢µÒ•Ò“°¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}
Ý­ýbíÝí-½Òr“°¢Ò’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖW&vRÖ'Fâ×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢6öç7B6VÆV7FVBÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“°¢6öç7BF&vWD–BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖW&vR×F&vWB×c3br“òçfÇVRÇÂrs°¢6öç7BF&vWBÒÖçFö¶Vç2æf–æB‡BÓâBæ–BÓÓÒF&vWD–B“°¢–b‡6VÆV7FVBbbF&vWB’ÖW&vT–çFõ7VG&öåc3b†ÖÂ6VÆV7FVBÂF&vWB“°¢Ò“°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚u¶FF×'G2ÖFWF6…Òr’æf÷$V6‚†'FâÓâ'FâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“°¢–b‡Fö¶Vâ’FWF6…6†—g&öÕ7VG&öåc3b†ÖÂFö¶VâÂ'FâæFF6WBç'G4FWF6‚“°¢Ò’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Ö76–vâ×Æ–W"Ö'Fâ×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ7–æ2‚’Óâ°¢6öç7BÆ–W$–BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Ö76–vâ×Æ–W"×c3br“òçfÇVRÇÂrs°¢–b‚Æ–W$–B’&WGW&âFö7Bç6†÷r‚}	-½]‚=í­rý­rÂvW'"r“°¢6öç7BÆ–W"Òç7FFRçW6W'5·Æ–W$–EÒÇÂÄ”U%õDTÕÄDU5·Æ–W$–EÓ°¢–b‚Æ–W"’&WGW&ã°¢Æ–W"æ7W'&VçE&Vv–öä–BÒÖæ–C°¢Æ–W"æ7W'&VçEÆæWD–BÒÖçÆæWD–C°¢–b„ç7FFRçW6W'5·Æ–W$–EÒ’²ç7FFRçW6W'5·Æ–W$–EÒæ7W'&VçE&Vv–öä–BÒÖæ–C²ç7FFRçW6W'5·Æ–W$–EÒæ7W'&VçEÆæWD–BÒÖçÆæWD–C²Ð¢–b…Ä”U%õDTÕÄDU5·Æ–W$–EÒ’²Ä”U%õDTÕÄDU5·Æ–W$–EÒæ7W'&VçE&Vv–öä–BÒÖæ–C²Ä”U%õDTÕÄDU5·Æ–W$–EÒæ7W'&VçEÆæWD–BÒÖçÆæWD–C²Ð¢–b‚6fT'&•c3b†ÖçFö¶Vç2’ç6öÖR‡Fö¶VâÓâFö¶VâçÆ–W$–BÓÓÒÆ–W$–B’’ÖçFö¶Vç2çW6‚†æ÷&ÖÆ—¦U&Vv–öåFö¶Våc3b‡²G—S¢wÆ–W"rÂÆ–W$–BÂæÖS¢Æ–W"æF—7Æ”æÖRÇÂÆ–W$–BÂƒ¢Öçv–GF‚ò"Â“¢Öæ†V–v‡Bò"Âf—6–&ÆUFõÆ–W'3¢G'VRÒ’“°¢G'’²v—Bç6fU7FFR‚}	ýí½ím]ÝR=í­íÝí-½]Ýâr“²Ò6F6‚·Ð¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}	=í¢ý-í]Ò]=íÝ2rÂ²FVÆ“¢#Ò“°¢&W&VæFW%&Vv–öäÖc3b‚“°¢Ò“°¢òòFö¶Vâ–ç7V7F÷ ¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×Fö¶VâÖæÖR×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“²–b‡Fö¶Vâ’²Fö¶VâææÖRÒ7G&–ær†WfVçBçF&vWBçfÇVRÇÂrr’çG&–Ò‚’ÇÂFö¶VâææÖS²Fö7VÖVçBçVW'•6VÆV7F÷"†¶FF×Fö¶VâÖ–CÒ"G´552æW66R‡Fö¶Vâæ–B—Ò%Ò&“òç&WÆ6T6†–ÆG&Vâ†Fö7VÖVçBæ7&VFUFW‡DæöFR‡&Vv–öäÖFö¶VäÆ&VÅc3b‡Fö¶Vâ’’“²66†VGVÆU&Vv–öåW'6—7Ec3b‚}	ÍòíÝí-½]Ýâr“²ÒÒ“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×Fö¶VâÖ6öÆ÷"×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“²–b‡Fö¶Vâ’²Fö¶Vâæ6öÆ÷"ÒWfVçBçF&vWBçfÇVS²Fö7VÖVçBçVW'•6VÆV7F÷"†¶FF×Fö¶VâÖ–CÒ"G´552æW66R‡Fö¶Vâæ–B—Ò%Ö“òç7G–ÆRç6WE&÷W'G’‚rÒ×'G2Ö6öÆ÷"rÂFö¶Vâæ6öÆ÷"“²66†VGVÆU&Vv–öåW'6—7Ec3b‚}
m-]"íÝí-½Òr“²ÒÒ“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×Fö¶Vâ×f—6–&ÆR×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ°¢6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“°¢–b‚Fö¶Vâ’&WGW&ã°¢Fö¶Vâçf—6–&ÆUFõÆ–W'2ÒWfVçBçF&vWBæ6†V6¶VC°¢Fö7VÖVçBçVW'•6VÆV7F÷"†¶FF×Fö¶VâÖ–CÒ"G´552æW66R‡Fö¶Vâæ–B—Ò%Ö“òæ6Æ74Æ—7BçFövvÆR‚wÆ–W"Ö†–FFVârÂFö¶Vâçf—6–&ÆUFõÆ–W'2“°¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}	-MÍí-Â-í­]ÝíÝí-½]Ýr“°¢Ò“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×Fö¶Vâ×f—6–öâ×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“²–b‡Fö¶Vâ’²Fö¶Vâçf—6–öå&F—W2ÒçVÖ&W"†WfVçBçF&vWBçfÇVRÇÂ“²66†VGVÆU&Vv–öåW'6—7Ec3b‚}	í}í-í­]ÝíÝí-½Òr“²ÒÒ“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×Fö¶Vâ×&F"×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“²–b‡Fö¶Vâ’²Fö¶Vâç&F%&F—W2ÒçVÖ&W"†WfVçBçF&vWBçfÇVRÇÂ“²66†VGVÆU&Vv–öåW'6—7Ec3b‚}
M-í­]ÝíÝí-½Òr“²ÒÒ“°¢òò	ýýÍíR]M­-í-ÝR­í½ò…v÷&ÆB6öæf–r’­-°¢6öç7BVF—E6VÆV7FVE6†—Ò†×WFFRÂ×6r’Óâ°¢6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“°¢6öç7B6†—ÒFö¶VãòçG—RÓÓÒw6†—rbbFö¶Vâç6†—–Bò4„•5õc3e·Fö¶Vâç6†—–EÒ¢çVÆÃ°¢–b‚6†—’&WGW&ã°¢×WFFR‡6†—“°¢v÷&ÆDFFç6†—2Ò6W&–Æ—¦Uv÷&ÆE6V7F–öâ‚w6†—2rÂ4„•5õc3b“°¢66†VGVÆU&Vv–öåW'6—7Ec3b†×6r“°¢Ó°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×6†—×f—6–öâ×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâVF—E6VÆV7FVE6†—‡6†—Óâ²6†—çf—6–öå&F—W2ÒÖF‚æÖ‚ƒÂçVÖ&W"†WfVçBçF&vWBçfÇVRÇÂ’“²ÒÂ}	í}í­í½òíÝí-½Ò…t2’r’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×6†—×&F"×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâVF—E6VÆV7FVE6†—‡6†—Óâ²6†—ç&F%&F—W2ÒÖF‚æÖ‚ƒÂçVÖ&W"†WfVçBçF&vWBçfÇVRÇÂ’“²ÒÂ}
M­í½òíÝí-½Ò…t2’r’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×6†—ÖgVVÂ×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâVF—E6VÆV7FVE6†—‡6†—Óâ²6†—ægVVÂÒ6Æ×„çVÖ&W"†WfVçBçF&vWBçfÇVRÇÂ’ÂÂÖF‚æÖ‚ƒÂçVÖ&W"‡6†—ægVVÄ66—G’ÇÂ6†—ægVVÂÇÂ’’“²ÒÂ}
-íý½-â­í½òíÝí-½]Ýâ…t2’r’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×6†—×&F"Ööâ×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“²VF—E6VÆV7FVE6†—‡6†—Óâ²6†—ç&F$Væ&ÆVBÒWfVçBçF&vWBæ6†V6¶VC²–b‡Fö¶Vâ’Fö¶Vâç&F$Væ&ÆVBÒWfVçBçF&vWBæ6†V6¶VC²ÒÂWfVçBçF&vWBæ6†V6¶VBò}
M-­½í}Òr¢}
M-½­½í}]Òr“²Ò“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×7VB×&F"Ööâ×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“²–b‡Fö¶Vâ’²Fö¶Vâç&F$Væ&ÆVBÒWfVçBçF&vWBæ6†V6¶VC²66†VGVÆU&Vv–öåW'6—7Ec3b†WfVçBçF&vWBæ6†V6¶VBò}
MÝ­M²-­½í}Òr¢}
MÝ­M²-½­½í}]Òr“²ÒÒ“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×Fö¶Vâ×&F"Ööâ×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ°¢6öç7BFö¶VâÒ6VÆV7FVE&Vv–öåFö¶Våc3b†Ö“°¢–b‚Fö¶Vâ’&WGW&ã°¢Fö¶Vâç&F$Væ&ÆVBÒWfVçBçF&vWBæ6†V6¶VC°¢–b‡Fö¶VâçG—RÓÓÒw6†—rbbFö¶Vâç6†—–Bbb4„•5õc3e·Fö¶Vâç6†—–EÒ’4„•5õc3e·Fö¶Vâç6†—–EÒç&F$Væ&ÆVBÒWfVçBçF&vWBæ6†V6¶VC°¢66†VGVÆU&Vv–öåW'6—7Ec3b†WfVçBçF&vWBæ6†V6¶VBò}
M-­½í}Òr¢}
M-½­½í}]Òr“°¢Ò“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ—76–ÆR×G—R×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆUG—RÒWfVçBçF&vWBçfÇVRÇÂv†VBs²Ò“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖFVÆWFR×Fö¶Vâ×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ²ÖçFö¶Vç2ÒÖçFö¶Vç2æf–ÇFW"‡BÓâBæ–BÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B“²%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–BÒrs²66†VGVÆU&Vv–öåW'6—7Ec3b‚}
-í­]Ò=M½ÒrÂ²FVÆ“¢#Ò“²&W&VæFW%&Vv–öäÖc3b‚“²Ò“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×7F÷×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ7F÷&Vv–öåFö¶VäÖ÷fUc3b†Ö’“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ—76–ÆR×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ&ÔÖ—76–ÆUc3b†Ö’“°¢òòÖ&¶W"–ç7V7F÷ ¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ&¶W"ÖæÖR×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BÖ&¶W"Ò6VÆV7FVE&Vv–öäÖ&¶W%c3b†Ö“²–b†Ö&¶W"’²Ö&¶W"ææÖRÒ7G&–ær†WfVçBçF&vWBçfÇVRÇÂrr’çG&–Ò‚’ÇÂÖ&¶W"ææÖS²6öç7BæöFRÒFö7VÖVçBçVW'•6VÆV7F÷"†¶FFÖÖ&¶W"Ö–CÒ"G´552æW66R†Ö&¶W"æ–B—Ò%Ò&“²–b†æöFR’æöFRçFW‡D6öçFVçBÒÖ&¶W"ææÖS²66†VGVÆU&Vv–öåW'6—7Ec3b‚}	Í]-­íÝí-½]Ýr“²ÒÒ“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ&¶W"Ö6öÆ÷"×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BÖ&¶W"Ò6VÆV7FVE&Vv–öäÖ&¶W%c3b†Ö“²–b†Ö&¶W"’²Ö&¶W"æ6öÆ÷"ÒWfVçBçF&vWBçfÇVS²Fö7VÖVçBçVW'•6VÆV7F÷"†¶FFÖÖ&¶W"Ö–CÒ"G´552æW66R†Ö&¶W"æ–B—Ò%Ö“òç7G–ÆRç6WE&÷W'G’‚rÒ×'G2Ö6öÆ÷"rÂÖ&¶W"æ6öÆ÷"“²66†VGVÆU&Vv–öåW'6—7Ec3b‚}
m-]"Í]-­‚íÝí-½Òr“²ÒÒ“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ&¶W"×f—6–&ÆR×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BÖ&¶W"Ò6VÆV7FVE&Vv–öäÖ&¶W%c3b†Ö“²–b†Ö&¶W"’²Ö&¶W"çf—6–&ÆUFõÆ–W'2ÒWfVçBçF&vWBæ6†V6¶VC²66†VGVÆU&Vv–öåW'6—7Ec3b‚}	-MÍí-ÂÍ]-­‚íÝí-½]Ýr“²ÒÒ“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ&¶W"×F&vWB×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²6öç7BÖ&¶W"Ò6VÆV7FVE&Vv–öäÖ&¶W%c3b†Ö“²–b†Ö&¶W"’²Ö&¶W"çF&vWE&Vv–öä–BÒWfVçBçF&vWBçfÇVS²66†VGVÆU&Vv–öåW'6—7Ec3b‚}	ý]]]íBÍ]-­‚íÝí-½Òr“²ÒÒ“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖFVÆWFRÖÖ&¶W"×c3br“òæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ²ÖæÖ&¶W'2ÒÖæÖ&¶W'2æf–ÇFW"†ÒÓâÒæ–BÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVDÖ&¶W$–B“²%E5õ$Tt”ôåõT•õc3bç6VÆV7FVDÖ&¶W$–BÒrs²66†VGVÆU&Vv–öåW'6—7Ec3b‚}	Í]-­=M½]ÝrÂ²FVÆ“¢#Ò“²&W&VæFW%&Vv–öäÖc3b‚“²Ò“°¢òòföröbv"6WGF–æw0¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖförÖVæ&ÆVB×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²–b‚Öæför’ÖæförÒ²Væ&ÆVC¢G'VRÂ&F—W3¢SÂW‡Æ÷&VC¢rrÓ²ÖæföræVæ&ÆVBÒWfVçBçF&vWBæ6†V6¶VC²66†VGVÆU&Vv–öåW'6—7Ec3b‚}
-=ÍÒ-íÝ²íÝí-½Òr“²Ò“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Öför×&F—W2×c3br“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ²–b‚Öæför’ÖæförÒ²Væ&ÆVC¢G'VRÂ&F—W3¢SÂW‡Æ÷&VC¢rrÓ²Öæförç&F—W2ÒÖF‚æÖ‚ƒÂçVÖ&W"†WfVçBçF&vWBçfÇVRÇÂ’“²66†VGVÆU&Vv–öåW'6—7Ec3b‚}
M=-=ÍÝíÝí-½Òr“²Ò“°¢Ð¢gVæ7F–öâ7F'E&Vv–öäG&uc3b†WfVçBÂÖÂ¶–æBÂ–B’°¢–b‚—4vÕc3b‚’ÇÂ%E5õ$Tt”ôåõT•õc3bæÖöFRÓÒvVF—Br’&WGW&ã°¢WfVçBç&WfVçDFVfVÇB‚“°¢6öç7B—FVÒÒ¶–æBÓÓÒwFö¶VâròÖçFö¶Vç2æf–æB‡BÓâBæ–BÓÓÒ–B’¢ÖæÖ&¶W'2æf–æB†ÒÓâÒæ–BÓÓÒ–B“°¢–b‚—FVÒ’&WGW&ã°¢–b†¶–æBÓÓÒwFö¶Vâr’6VÆV7E&Vv–öåFö¶Våc3b†ÖÂ–B“°¢VÇ6R6VÆV7E&Vv–öäÖ&¶W%c3b†ÖÂ–B“°¢%E5õ$Tt”ôåõT•õc3bæG&vv–ærÒ²¶–æBÂ–BÂÖ–C¢Öæ–BÓ°¢6öç7BæöFRÒFö7VÖVçBçVW'•6VÆV7F÷"†¶–æBÓÓÒwFö¶Vârò¶FF×Fö¶VâÖ–CÒ"G´552æW66R†–B—Ò%Ö¢¶FFÖÖ&¶W"Ö–CÒ"G´552æW66R†–B—Ò%Ö“°¢6öç7BÖ÷fRÒRÓâ°¢6öç7BÒ&ö&D6ö÷&G4g&öÔWfVçEc3b†RÂÖ“°¢—FVÒç‚Òçƒ²—FVÒç’Òç“°¢–b†¶–æBÓÓÒwFö¶Vâr’²—FVÒç7F'E‚Òçƒ²—FVÒç7F'E’Òç“²—FVÒæFW7E‚Òçƒ²—FVÒæFW7E’Òç“²—FVÒæÖ÷fU7F'FVDBÒrs²—FVÒæÖ÷fTVæG4BÒrs²—FVÒæÖ÷fU6†—–BÒrs²—FVÒæÖ÷fTgVVÄ6÷7BÒ²—FVÒæÖ÷fUW6VD×2Ò²Ð¢–b†æöFR’²æöFRç7G–ÆRæÆVgBÒG²‡ç‚òÖçv–GF‚¢’çFôf—†VBƒ2—ÒV²æöFRç7G–ÆRçF÷ÒG²‡ç’òÖæ†V–v‡B¢’çFôf—†VBƒ2—ÒV²Ð¢Ó°¢6öç7BWÒ‚’Óâ°¢v–æF÷rç&VÖ÷fTWfVçDÆ—7FVæW"‚wö–çFW&Ö÷fRrÂÖ÷fR“°¢v–æF÷rç&VÖ÷fTWfVçDÆ—7FVæW"‚wö–çFW'WrÂW“°¢%E5õ$Tt”ôåõT•õc3bæG&vv–ærÒçVÆÃ°¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}	ýí½ím]ÝRÝ­-Rí]Ý]Ýâr“°¢Ó°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚wö–çFW&Ö÷fRrÂÖ÷fR“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚wö–çFW'WrÂWÂ²öæ6S¢G'VRÒ“°¢Ð¢òò
M­=]"-íý½-âÂímmÝÝíR}ýíM]ÝÝ=â}-ÂÍ=-Â‚=Í]ÝÍ] ¢òòí--í¢-íÍí-‚â	-½}½-]-òý]]BÝí-½Âý­}íÂò-íýíÂòý=}í’(	@¢òòÝ}RÝ]Mí½]-]-’Í="*½-í}-¼+²-íý½-â2í-íý½-’à¢gVæ7F–öâ6öÖÖ—E'F–ÄÖ÷fTgVVÅc3b‡Fö¶VâÂBÒFFRææ÷r‚’’°¢6öç7B6÷7BÒçVÖ&W"‡Fö¶VâæÖ÷fTgVVÄ6÷7BÇÂ“°¢6öç7B7F'BÒFFRç'6R‡Fö¶VâæÖ÷fU7F'FVDBÇÂrr“°¢6öç7BVæBÒFFRç'6R‡Fö¶VâæÖ÷fTVæG4BÇÂrr“°¢–b‚†6÷7Bâ’ÇÂçVÖ&W"æ—4f–æ—FR‡7F'B’ÇÂçVÖ&W"æ—4f–æ—FR†VæB’ÇÂVæBÃÒ7F'B’&WGW&ã°¢6öç7B'W&æVBÒ6÷7B¢6Æ×‚†BÒ7F'B’ò†VæBÒ7F'B’ÂÂ“°¢–b‚†'W&æVBâ’’&WGW&ã°¢–b‡Fö¶VâçG—RÓÓÒw7VG&öâr’°¢6öç7B6†—2Ò7VG&öå6†—5c3b‡Fö¶Vâ“°¢6öç7BF÷FÂÒ6†—2ç&VGV6R‚‡7VÒÂ6†—’Óâ7VÒ²çVÖ&W"‡6†—ægVVÂÇÂ’Â“°¢–b‡F÷FÂâ’6†—2æf÷$V6‚‡6†—Óâ°¢6†—ægVVÂÒ6Æ×„çVÖ&W"‡6†—ægVVÂÇÂ’Ò'W&æVB¢çVÖ&W"‡6†—ægVVÂÇÂ’òF÷FÂÂÂÖF‚æÖ‚ƒÂçVÖ&W"‡6†—ægVVÄ66—G’ÇÂ6†—ægVVÂÇÂ’’“°¢Ò“°¢Fö¶VâæÖ÷fTgVVÅ7F'BÒ7VG&öå7FG5c3b‡Fö¶Vâ’ægVVÃ°¢ÒVÇ6R–b‡Fö¶VâæÖ÷fU6†—–Bbb4„•5õc3e·Fö¶VâæÖ÷fU6†—–EÒ’°¢6öç7B6†—Ò4„•5õc3e·Fö¶VâæÖ÷fU6†—–EÓ°¢6†—ægVVÂÒ6Æ×„çVÖ&W"‡Fö¶VâæÖ÷fTgVVÅ7F'BÇÂ6†—ægVVÂÇÂ’Ò'W&æVBÂÂÖF‚æÖ‚ƒÂçVÖ&W"‡6†—ægVVÄ66—G’ÇÂ6†—ægVVÂÇÂ’’“°¢Fö¶VâæÖ÷fTgVVÅ7F'BÒçVÖ&W"‡6†—ægVVÂÇÂ“°¢Ð¢Fö¶VâæÖ÷fTgVVÄ6÷7BÒÖF‚æÖ‚ƒÂ6÷7BÒ'W&æVB“°¢Ð¢gVæ7F–öâ7F'E&Vv–öåFö¶VäÖ÷fUc3b†ÖÂFö¶VâÂFW7E‚ÂFW7E’’°¢–b‚…%E5õ$Tt”ôåõT•õc3bçF–ÖU66ÆRóò’ÓÓÒ’²Fö7Bç6†÷r‚}	ý=}¢-í}íÝí-‚-]ÍòÂ}-í²í-M--Âý­}²rÂvW'"r“²&WGW&ã²Ð¢òò	Ýí-½’ý­r-â-]Íòýí½-¢Ý}½M­=]Â=mRímmÝÝíR-íý½-âà¢–b‡Fö¶VâæÖ÷fTVæG4B’6öÖÖ—E'F–ÄÖ÷fTgVVÅc3b‡Fö¶Vâ“°¢Fö¶VâæÖ÷fUW6VD×2Ò°¢6öç7B÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶Vâ“°¢6öç7BF—7Fæ6RÒÖF‚æ‡—÷B†FW7E‚Ò÷2ç‚ÂFW7E’Ò÷2ç’“°¢ÆWB7VVBÒC°¢6öç7B6†—ÒÆ—fU6†—f÷%Fö¶Våc3b‡Fö¶Vâ“°¢–b‡6†—’°¢7VVBÒ6†—åõ÷7VG&öâòçVÖ&W"‡6†—åõ÷7VVBÇÂC’¢6†—7VVEc3b‡6†—“°¢6öç7BgVVÄ6÷7BÒF—7Fæ6R¢ÖF‚æÖ‚ƒãÂçVÖ&W"‡6†—ægVVÄ6öç7V×F–öâÇÂ’’ò°¢–b†gVVÄ6÷7BâçVÖ&W"‡6†—ægVVÂÇÂ’’²Fö7Bç6†÷r‚}	Ý]Mí--í}Ýâ-íý½-M½òÍ=-rÂvW'"r“²&WGW&ã²Ð¢òògVVÂ—26öç7VÖVB&öw&W76—fVÇ’GW&–ærF†RÖ÷fRæB6öÖÖ—GFVBöæ6Röâ'&—fÂ‡6WGFÆU&Vv–öåFö¶Våc3b’à¢Fö¶VâæÖ÷fU6†—–BÒ6†—åõ÷7VG&öâòrr¢6†—æ–C°¢Fö¶VâæÖ÷fTgVVÅ7F'BÒçVÖ&W"‡6†—ægVVÂÇÂ“°¢Fö¶VâæÖ÷fTgVVÄ6÷7BÒgVVÄ6÷7C°¢6öç7BÖVÖ&W%6†—2Ò6†—åõ÷7VG&öâò7VG&öå6†—5c3b‡Fö¶Vâ’¢·6†—Ó°¢ÖVÖ&W%6†—2æf÷$V6‚†ÖVÖ&W"Óâ°¢ÖVÖ&W"æ7W'&VçE&Vv–öä–BÒÖæ–C°¢–b†ÖçÆæWD–B’ÖVÖ&W"æ7W'&VçEÆæWD–BÒÖçÆæWD–C°¢†ÖVÖ&W"æ7&WuÆ–W$–G2ÇÂµÒ’æf÷$V6‚‡–BÓâ°¢–b„ç7FFRçW6W'5·–EÒ’²ç7FFRçW6W'5·–EÒæ7W'&VçE&Vv–öä–BÒÖæ–C²ç7FFRçW6W'5·–EÒæ7W'&VçEÆæWD–BÒÖçÆæWD–C²ç7FFRçW6W'5·–EÒæ7W'&VçE6†—–BÒÖVÖ&W"æ–C²Ð¢–b…Ä”U%õDTÕÄDU5·–EÒ’²Ä”U%õDTÕÄDU5·–EÒæ7W'&VçE&Vv–öä–BÒÖæ–C²Ä”U%õDTÕÄDU5·–EÒæ7W'&VçEÆæWD–BÒÖçÆæWD–C²Ä”U%õDTÕÄDU5·–EÒæ7W'&VçE6†—–BÒÖVÖ&W"æ–C²Ð¢Ò“°¢Ò“°¢ÒVÇ6R°¢Fö¶VâæÖ÷fU6†—–BÒrs²Fö¶VâæÖ÷fTgVVÅ7F'BÒ²Fö¶VâæÖ÷fTgVVÄ6÷7BÒ°¢Ð¢6öç7BGW&F–öä×2Ò6Æ×‚†F—7Fæ6RòÖF‚æÖ‚ƒÂ7VVB’’¢òÖF‚æÖ‚ƒÂ%E5õ$Tt”ôåõT•õc3bçF–ÖU66ÆRÇÂ’Â3SÂ#“°¢6öç7Bæ÷t×2ÒFFRææ÷r‚“°¢Fö¶Vâç7F'E‚Ò÷2çƒ²Fö¶Vâç7F'E’Ò÷2ç“²Fö¶Vâç‚Ò÷2çƒ²Fö¶Vâç’Ò÷2ç“°¢Fö¶VâæFW7E‚ÒFW7Eƒ²Fö¶VâæFW7E’ÒFW7E“°¢Fö¶VâæÖ÷fU7F'FVDBÒæWrFFR†æ÷t×2’çFô•4õ7G&–ær‚“°¢Fö¶VâæÖ÷fTVæG4BÒæWrFFR†æ÷t×2²GW&F–öä×2’çFô•4õ7G&–ær‚“°¢Fö7VÖVçBçVW'•6VÆV7F÷"†¶FF×Fö¶VâÖ–CÒ"G´552æW66R‡Fö¶Vâæ–B—Ò%Ö“òæ6Æ74Æ—7BæFB‚vÖ÷f–ærr“°¢òòæò&R×&VæFW#¢F†R$bÆö÷æ–ÖFW2F†RFö¶Vã²W'6—7B6ööâ6òF†R6V6öæB67&VVâ²÷F†W"6Æ–VçG2–6²WF†R&÷WFRà¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}	Í="}ý=]ÒrÂ²FVÆ“¢#Ò“°¢Ð¢gVæ7F–öâWFFU&Vv–öägVVÅ&ævUc3b†ÖÂæ÷r’°¢6öç7B6—&6ÆRÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖgVVÂ×&ævR×c3br“°¢–b‚6—&6ÆR’&WGW&ã°¢6öç7BFö¶VâÒ6fT'&•c3b†ÖçFö¶Vç2’æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B“°¢6öç7B6†—ÒFö¶VâòÆ—fU6†—f÷%Fö¶Våc3b‡Fö¶Vâ’¢çVÆÃ°¢–b‚Fö¶VâÇÂ6†—’²6—&6ÆRç7G–ÆRæF—7Æ’ÒvæöæRs²&WGW&ã²Ð¢òò6F†RG&vâ&F—W2BF†RÖF–vöæÃ¢&W–öæBF†BF†R6—&6ÆR6÷fW'2F†P¢òòv†öÆRÖç—v’ÂæBF†R6¶VW2F†Rf—7VÂ&W7öç6—fRFògVVÂ6†ævW2à¢6öç7B&ævRÒÖF‚æÖ–â‡6†—&ævTg&öÔgVVÅc3b‡6†—ÂÆ—fTgVVÅc3b‡Fö¶VâÂ6†—Âæ÷r’’ÂÖF‚æ‡—÷B„çVÖ&W"†Öçv–GF‚ÇÂ’ÂçVÖ&W"†Öæ†V–v‡BÇÂs’’“°¢–b‚‡&ævRâ’’²6—&6ÆRç7G–ÆRæF—7Æ’ÒvæöæRs²&WGW&ã²Ð¢6öç7B÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶VâÂæ÷r“°¢6—&6ÆRç7G–ÆRæF—7Æ’Òrs°¢6—&6ÆRç7G–ÆRæÆVgBÒG²‡÷2ç‚òÖçv–GF‚¢’çFôf—†VBƒ2—ÒV°¢6—&6ÆRç7G–ÆRçF÷ÒG²‡÷2ç’òÖæ†V–v‡B¢’çFôf—†VBƒ2—ÒV°¢6—&6ÆRç7G–ÆRçv–GF‚ÒG²‡&ævRòÖçv–GF‚¢¢"’çFôf—†VBƒ2—ÒV°¢6—&6ÆRç7G–ÆRæ†V–v‡BÒG²‡&ævRòÖæ†V–v‡B¢¢"’çFôf—†VBƒ2—ÒV°¢Ð¢gVæ7F–öâF6…&Vv–öå6–FTgVVÅc3b†ÖÂæ÷r’°¢6öç7B&VF÷WBÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2×6†—ÖgVVÂ×&VF÷WB×c3br“°¢–b‚&VF÷WB’&WGW&ã°¢6öç7BFö¶VâÒ6fT'&•c3b†ÖçFö¶Vç2’æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B“°¢6öç7B6†—ÒFö¶VâòÆ—fU6†—f÷%Fö¶Våc3b‡Fö¶Vâ’¢çVÆÃ°¢–b‚6†—’&WGW&ã°¢&VF÷WBçFW‡D6öçFVçBÒG´çVÖ&W"†Æ—fTgVVÅc3b‡Fö¶VâÂ6†—Âæ÷r’’çFôf—†VBƒ—ÒòG´çVÖ&W"‡6†—ægVVÄ66—G’’çFôf—†VBƒ—Ö°¢Ð¢òò
MÝò]-­-í­=2-½ÝÝí=â­í½ò]½‚M]-Â‚-­½í}Ò’à¢gVæ7F–öâWFFU&Vv–öå&F%&ævUc3b†ÖÂæ÷r’°¢6öç7B6—&6ÆRÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâ×&F"×&ævR×c3br“°¢–b‚6—&6ÆR’&WGW&ã°¢6öç7BFö¶VâÒ6fT'&•c3b†ÖçFö¶Vç2’æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B“°¢6öç7B–æfòÒFö¶VâòFö¶Vå&F$–æfõc3b‡Fö¶Vâ’¢çVÆÃ°¢–b‚Fö¶VâÇÂ–æfòÇÂ–æfòæ7F—fR’²6—&6ÆRç7G–ÆRæF—7Æ’ÒvæöæRs²&WGW&ã²Ð¢6öç7B÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶VâÂæ÷r“°¢6—&6ÆRç7G–ÆRæF—7Æ’Òrs°¢6—&6ÆRç7G–ÆRæÆVgBÒG²‡÷2ç‚òÖçv–GF‚¢’çFôf—†VBƒ2—ÒV°¢6—&6ÆRç7G–ÆRçF÷ÒG²‡÷2ç’òÖæ†V–v‡B¢’çFôf—†VBƒ2—ÒV°¢6—&6ÆRç7G–ÆRçv–GF‚ÒG²†–æfòç"òÖçv–GF‚¢¢"’çFôf—†VBƒ2—ÒV°¢6—&6ÆRç7G–ÆRæ†V–v‡BÒG²†–æfòç"òÖæ†V–v‡B¢¢"’çFôf—†VBƒ2—ÒV°¢Ð¢òò
MâÝí}-=}­¢Ýí-½R­íÝ-­-²í}íýM’‚ýíí=‚-íý½-à¢gVæ7F–öâ&Vv–öå6÷VæEF–6µc3b†ÖÂæ÷r’°¢6öç7B6VVâÒ%E5õ$Tt”ôåõT•õc3bæ6öçF7E6VVâÇÂ…%E5õ$Tt”ôåõT•õc3bæ6öçF7E6VVâÒ²f—3¢æWr6WB‚’Â&F#¢æWr6WB‚’Ò“°¢6öç7Bf–WrÒÆ–W%f–Wu6÷W&6W5c3b†Ö“°¢6fT'&•c3b†ÖçFö¶Vç2’æf÷$V6‚‡Fö¶VâÓâ°¢–b‡Fö¶VâçG—RÓÓÒv6—G’rÇÂFö¶Väw&çG5Æ–W%f–Wuc3b‡Fö¶Vâ’’&WGW&ã°¢6öç7B÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶VâÂæ÷r“°¢6öç7B–åf–WrÒf–WræÆVæwF‚bbf–Wrç6öÖR‡7&2ÓâÖF‚æ‡—÷B‡÷2ç‚Ò7&2ç‚Â÷2ç’Ò7&2ç’’ÃÒ7&2ç"“°¢–b†–åf–Wr’°¢–b‚6VVâçf—2æ†2‡Fö¶Vâæ–B’’²6VVâçf—2æFB‡Fö¶Vâæ–B“²Æ•&Vv–öå6÷VæEc3b‚vÖÖöFUö6öçF7E÷f—5órÂ²¶W“¢v6öçF7E÷f—2rÂ6ööÆF÷vä×3¢cÒ“²Ð¢ÒVÇ6R°¢6VVâçf—2æFVÆWFR‡Fö¶Vâæ–B“°¢Ð¢Ò“°¢6öç7B6öçF7G2ÒÆ–W%&F$6öçF7G5c3b†ÖÂæ÷r“°¢6öç7B6öçF7D–G2ÒæWr6WB†6öçF7G2æÖ†2Óâ2çFö¶Vâæ–B’“°¢6öçF7G2æf÷$V6‚‚‡²Fö¶VâÂVÖ—GF–ærÒ’Óâ°¢–b‡6VVâç&F"æ†2‡Fö¶Vâæ–B’’&WGW&ã°¢6VVâç&F"æFB‡Fö¶Vâæ–B“°¢–b†VÖ—GF–ær’Æ•&Vv–öå6÷VæEc3b‚vÖÖöFUö6öçF7EöVÆ–çEórÂ²¶W“¢v6öçF7EöVÆ–çBrÂ6ööÆF÷vä×3¢SÒ“°¢VÇ6R–b‡Fö¶VâçG—RÓÓÒw6†—rÇÂFö¶VâçG—RÓÓÒw7VG&öâr’Æ•&Vv–öå6÷VæEc3b‚vÖÖöFUö6öçF7Eö—%órÂ²¶W“¢v6öçF7Eö—"rÂ6ööÆF÷vä×3¢SÒ“°¢VÇ6RÆ•&Vv–öå6÷VæEc3b‚vÖÖöFUö6öçF7E÷&F%órÂ²¶W“¢v6öçF7E÷&F"rÂ6ööÆF÷vä×3¢SÒ“°¢Ò“°¢'&’æg&öÒ‡6VVâç&F"’æf÷$V6‚†–BÓâ²–b‚6öçF7D–G2æ†2†–B’’6VVâç&F"æFVÆWFR†–B“²Ò“°¢òò-íý½-Ý½Rýíí=‚"Rí"­“¢Sò3ò#òò ¢6öç7B'V6¶WG2Ò³SÂ3Â#ÂÂÓ°¢6fT'&•c3b†ÖçFö¶Vç2’æf÷$V6‚‡Fö¶VâÓâ°¢–b‚Fö¶Väw&çG5Æ–W%f–Wuc3b‡Fö¶Vâ’’&WGW&ã°¢6öç7B6†—ÒÆ—fU6†—f÷%Fö¶Våc3b‡Fö¶Vâ“°¢–b‚6†—ÇÂ„çVÖ&W"‡6†—ægVVÄ66—G’’â’’&WGW&ã°¢6öç7B7BÒÆ—fTgVVÅc3b‡Fö¶VâÂ6†—Âæ÷r’òçVÖ&W"‡6†—ægVVÄ66—G’’¢°¢6öç7B7&÷76VBÒ'V6¶WG2æf–ÇFW"†"Óâ7BÃÒ"“°¢6öç7B'V6¶WBÒ7&÷76VBæÆVæwF‚ò7&÷76VE¶7&÷76VBæÆVæwF‚ÒÒ¢çVÆÃ°¢6öç7B&WbÒ%E5õ$Tt”ôåõT•õc3bægVVÄ'V6¶WD'•Fö¶Vå·Fö¶Vâæ–EÓ°¢–b‡&WbÓÓÒVæFVf–æVB’²%E5õ$Tt”ôåõT•õc3bægVVÄ'V6¶WD'•Fö¶Vå·Fö¶Vâæ–EÒÒ'V6¶WBÓÓÒçVÆÂò““’¢'V6¶WC²&WGW&ã²Òòò}í-ò½Ýò]r}-=­ ¢–b†'V6¶WBÓÒçVÆÂbb'V6¶WBÂ&Wb’°¢%E5õ$Tt”ôåõT•õc3bægVVÄ'V6¶WD'•Fö¶Vå·Fö¶Vâæ–EÒÒ'V6¶WC°¢Æ•&Vv–öå6÷VæEc3b†&F–õögVVÅòG¶'V6¶WBÓÓÒòsr¢'V6¶WGÖÂ²¶W“¢gVVÅòG·Fö¶Vâæ–GÖÂ6ööÆF÷vä×3¢SÒ“°¢ÒVÇ6R–b†'V6¶WBÓÓÒçVÆÂbb&WbÓÒ““’’°¢%E5õ$Tt”ôåõT•õc3bægVVÄ'V6¶WD'•Fö¶Vå·Fö¶Vâæ–EÒÒ“““²òò}ý-½ð¢Ð¢Ò“°¢Ð¢gVæ7F–öâf–Wt6VçFW$Ö6ö÷&G5c3b†Ö’°¢6öç7BbÒvWE&Vv–öåf–Wuc3b‚“°¢6öç7BgrÒÖF‚æÖ‚ƒÂbæg&ÖUrÇÂ’Âf‚ÒÖF‚æÖ‚ƒÂbæg&ÖT‚ÇÂ“°¢6öç7B¢ÒÖF‚æÖ‚ƒãÂbç¦ööÒÇÂ“°¢6öç7BÇ‚Ò†grò"Ò‡bçå‚ÇÂ’’ò£°¢6öç7BÇ’Ò†f‚ò"Ò‡bçå’ÇÂ’’ò£°¢&WGW&â²ƒ¢6Æ×†Ç‚ògr¢Öçv–GF‚ÂÂÖçv–GF‚’Â“¢6Æ×†Ç’òf‚¢Öæ†V–v‡BÂÂÖæ†V–v‡B’Ó°¢Ð¢òòÒÒÒÒý=}ò‚ò'‚ÒÒÒÐ¢òò
-ÍÝ=‚Í=-í"]Ýý-ò­¢vÆÂÖ6Æö6²ÂýíÝ-íÍ2Í]Ý­íí-‚-½ýí½Ýý]-ð¢òò*½ý]]}í-Ý]Ì+³¢M­=]Â-]­==âýí}mâý-íý½-â‚ý]]ý½-]ÂÝ-]-°¢òòÝí-½Âí--­íÂâ	ý=}­½M½-]"í--í¢"‚ÝÝ­--½]Ý-R’"Ö÷fUW6VD×2à¢òò	-Ý-â=]íM""Ýýí"Â-¢}-â--íí’Ý­Ò‚­½]Ý-²Ý]íÝÝ²à¢gVæ7F–öâ6WE&Vv–öåF–ÖU66ÆUc3b†æWu66ÆR’°¢6öç7BÖÒ$Tt”ôåôÔ5õc3eµ%E5õ$Tt”ôåõT•õc3bæÖ–EÓ°¢6öç7BöÆE66ÆRÒçVÖ&W"…%E5õ$Tt”ôåõT•õc3bçF–ÖU66ÆRóò“°¢æWu66ÆRÒçVÖ&W"†æWu66ÆR“°¢–b‚ÖÇÂöÆE66ÆRÓÓÒæWu66ÆR’&WGW&ã°¢6öç7Bæ÷rÒFFRææ÷r‚“°¢6fT'&•c3b†ÖçFö¶Vç2’æf÷$V6‚‡Fö¶VâÓâ°¢6öç7BVæBÒFFRç'6R‡Fö¶VâæÖ÷fTVæG4BÇÂrr“°¢6öç7BÖ÷f–ærÒçVÖ&W"æ—4f–æ—FR†VæB’bbVæBâæ÷s°¢–b†Ö÷f–ær’°¢6öÖÖ—E'F–ÄÖ÷fTgVVÅc3b‡Fö¶VâÂæ÷r“°¢6öç7B÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶VâÂæ÷r“°¢Fö¶Vâç7F'E‚Ò÷2çƒ²Fö¶Vâç7F'E’Ò÷2ç“²Fö¶Vâç‚Ò÷2çƒ²Fö¶Vâç’Ò÷2ç“°¢6öç7B&VÖ–æ–æuvÆÂÒVæBÒæ÷s°¢–b†æWu66ÆRÓÓÒ’°¢Fö¶VâæÖ÷fUW6VD×2Ò&VÖ–æ–æuvÆÂ¢ÖF‚æÖ‚ƒÂöÆE66ÆR“°¢Fö¶VâæÖ÷fU7F'FVDBÒrs²Fö¶VâæÖ÷fTVæG4BÒrs°¢ÒVÇ6R°¢Fö¶VâæÖ÷fU7F'FVDBÒæWrFFR†æ÷r’çFô•4õ7G&–ær‚“°¢Fö¶VâæÖ÷fTVæG4BÒæWrFFR†æ÷r²&VÖ–æ–æuvÆÂ¢ÖF‚æÖ‚ƒÂöÆE66ÆR’òæWu66ÆR’çFô•4õ7G&–ær‚“°¢Ð¢ÒVÇ6R–b†æWu66ÆRâbbçVÖ&W"‡Fö¶VâæÖ÷fUW6VD×2ÇÂ’â’°¢Fö¶VâæÖ÷fU7F'FVDBÒæWrFFR†æ÷r’çFô•4õ7G&–ær‚“°¢Fö¶VâæÖ÷fTVæG4BÒæWrFFR†æ÷r²çVÖ&W"‡Fö¶VâæÖ÷fUW6VD×2’òæWu66ÆR’çFô•4õ7G&–ær‚“°¢Fö¶VâæÖ÷fUW6VD×2Ò°¢Ð¢Ò“°¢%E5õ$Tt”ôåõT•õc3bçF–ÖU66ÆRÒæWu66ÆS°¢%E5õ$Tt”ôåõT•õc3bæÆ7EF–6´×2Òæ÷s°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚u¶FF×'G2×F–ÖR×c3eÒr’æf÷$V6‚†'FâÓâ'Fâæ6Æ74Æ—7BçFövvÆR‚w'G2Ö&ÒÖ7F—fR×c3brÂçVÖ&W"†'FâæFF6WBç'G5F–ÖUc3b’ÓÓÒæWu66ÆR’“°¢66†VGVÆU&Vv–öåW'6—7Ec3b†æWu66ÆRÓÓÒò}	ý=}r¢æWu66ÆRÓÓÒ"ò}
­íí-Â9s"r¢}	í½}Ýò­íí-ÂrÂ²FVÆ“¢#Ò“°¢Ð¢gVæ7F–öâ7F÷&Vv–öåFö¶VäÖ÷fUc3b†Ö’°¢6öç7BFö¶VâÒ6fT'&•c3b†ÖçFö¶Vç2’æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B“°¢–b‚Fö¶VâÇÂFö¶VâæÖ÷fTVæG4B’&WGW&ã°¢6öç7B÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶Vâ“°¢6öÖÖ—E'F–ÄÖ÷fTgVVÅc3b‡Fö¶Vâ“²òòM­=]ÂímmÝÝíR}}-}Ý½’Í="""írâM½òÝ­M²¢Fö¶Vâç‚Ò÷2çƒ²Fö¶Vâç’Ò÷2ç“²Fö¶Vâç7F'E‚Ò÷2çƒ²Fö¶Vâç7F'E’Ò÷2ç“²Fö¶VâæFW7E‚Ò÷2çƒ²Fö¶VâæFW7E’Ò÷2ç“°¢Fö¶VâæÖ÷fU7F'FVDBÒrs²Fö¶VâæÖ÷fTVæG4BÒrs²Fö¶VâæÖ÷fU6†—–BÒrs²Fö¶VâæÖ÷fTgVVÅ7F'BÒ²Fö¶VâæÖ÷fTgVVÄ6÷7BÒ²Fö¶VâæÖ÷fUW6VD×2Ò°¢Fö7VÖVçBçVW'•6VÆV7F÷"†¶FF×Fö¶VâÖ–CÒ"G´552æW66R‡Fö¶Vâæ–B—Ò%Ö“òæ6Æ74Æ—7Bç&VÖ÷fR‚vÖ÷f–ærr“°¢66†VGVÆU&Vv–öåW'6—7Ec3b‚}	M-m]ÝRí-Ýí-½]ÝârÂ²FVÆ“¢#Ò“°¢&Vg&W6…&Vv–öå6–FUc3b†Ö“°¢Ð¢gVæ7F–öâ†–FU&Vv–öä6÷W'6U&Wf–Wuc3b‚’°¢6öç7B7frÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Ö6÷W'6R×7fr×c3br“²–b‡7fr’7frç7G–ÆRæF—7Æ’ÒvæöæRs°¢6öç7BÆ&VÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Ö6÷W'6RÖÆ&VÂ×c3br“²–b†Æ&VÂ’Æ&VÂç7G–ÆRæF—7Æ’ÒvæöæRs°¢Ð¢gVæ7F–öâWFFU&Vv–öä6÷W'6U&Wf–Wuc3b†ÖÂWfVçB’°¢6öç7B7frÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Ö6÷W'6R×7fr×c3br“°¢6öç7BÆ–æRÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Ö6÷W'6RÖÆ–æR×c3br“°¢6öç7BÆ&VÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2Ö6÷W'6RÖÆ&VÂ×c3br“°¢6öç7Bg&ÖRÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖÖg&ÖR×c3br“°¢–b‚7frÇÂÆ–æRÇÂg&ÖR’&WGW&ã°¢–b‚—4vÕc3b‚’ÇÂ%E5õ$Tt”ôåõT•õc3bæÖöFRÓÒwÆ’rÇÂ%E5õ$Tt”ôåõT•õc3bæ&Ö–ær’²†–FU&Vv–öä6÷W'6U&Wf–Wuc3b‚“²&WGW&ã²Ð¢6öç7BFö¶VâÒ6fT'&•c3b†ÖçFö¶Vç2’æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B“°¢–b‚Fö¶Vâ’²†–FU&Vv–öä6÷W'6U&Wf–Wuc3b‚“²&WGW&ã²Ð¢6öç7Bg&öÒÒ7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶Vâ“°¢6öç7BFòÒ&ö&D6ö÷&G4g&öÔWfVçEc3b†WfVçBÂÖ“°¢Æ–æRç6WDGG&–'WFR‚wƒrÂg&öÒç‚çFôf—†VBƒ’“²Æ–æRç6WDGG&–'WFR‚w“rÂg&öÒç’çFôf—†VBƒ’“°¢Æ–æRç6WDGG&–'WFR‚wƒ"rÂFòç‚çFôf—†VBƒ’“²Æ–æRç6WDGG&–'WFR‚w“"rÂFòç’çFôf—†VBƒ’“°¢7frç7G–ÆRæF—7Æ’Òrs°¢6öç7BF—7BÒÖF‚æ‡—÷B‡Fòç‚Òg&öÒç‚ÂFòç’Òg&öÒç’“°¢6öç7B6†—ÒÆ—fU6†—f÷%Fö¶Våc3b‡Fö¶Vâ“°¢6öç7B7VVBÒ6†—ò‡6†—åõ÷7VG&öâòçVÖ&W"‡6†—åõ÷7VVBÇÂC’¢6†—7VVEc3b‡6†—’’¢C°¢6öç7BWFÒF—7BòÖF‚æÖ‚ƒÂ7VVB“°¢ÆWBFW‡BÒG¶F—7BçFôf—†VBƒ—ÒG¶Öç66ÆTÆ&VÂÇÂ}]BwÒ+r(ûG¶WFçFôf—†VBƒ—Ý°¢ÆWB&BÒfÇ6S°¢–b‡6†—’°¢6öç7B6÷7BÒF—7B¢ÖF‚æÖ‚ƒãÂçVÖ&W"‡6†—ægVVÄ6öç7V×F–öâÇÂ’’ò°¢FW‡B³Ò+r)»ÒG¶6÷7BçFôf—†VBƒ—Ö°¢–b†6÷7BâçVÖ&W"‡6†—ægVVÂÇÂ’’²&BÒG'VS²FW‡B³Òr+rÝ]"-íý½-s²Ð¢Ð¢–b†Æ&VÂ’°¢6öç7B&V7BÒg&ÖRævWD&÷VæF–æt6Æ–VçE&V7B‚“°¢Æ&VÂç7G–ÆRæÆVgBÒG²†WfVçBæ6Æ–VçE‚Ò&V7BæÆVgB²b’çFôf—†VBƒ—×†°¢Æ&VÂç7G–ÆRçF÷ÒG²†WfVçBæ6Æ–VçE’Ò&V7BçF÷²b’çFôf—†VBƒ—×†°¢Æ&VÂçFW‡D6öçFVçBÒFW‡C°¢Æ&VÂæ6Æ74Æ—7BçFövvÆR‚v&BrÂ&B“°¢Æ&VÂç7G–ÆRæF—7Æ’Òrs°¢Ð¢Ð¢gVæ7F–öâ&ÔÖ—76–ÆUc3b†Ö’°¢6öç7BFö¶VâÒ6fT'&•c3b†ÖçFö¶Vç2’æf–æB‡BÓâBæ–BÓÓÒ%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–B“°¢–b‚Fö¶Vâ’&WGW&âFö7Bç6†÷r‚}	-½]‚íÝ"ÝÝí-]½ÂrÂvW'"r“°¢6öç7B6VÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ—76–ÆR×G—R×c3br“°¢–b‡6VÃòçfÇVR’%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆUG—RÒ6VÂçfÇVS°¢%E5õ$Tt”ôåõT•õc3bæ&Ö–ærÒ%E5õ$Tt”ôåõT•õc3bæ&Ö–ærÓÓÒFö¶Vâæ–Bòrr¢Fö¶Vâæ–C°¢6öç7B&ÖVBÒ&ööÆVâ…%E5õ$Tt”ôåõT•õc3bæ&Ö–ær“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖÖg&ÖR×c3br“òæ6Æ74Æ—7BçFövvÆR‚v—2Ö&Ö–ærrÂ&ÖVB“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ—76–ÆR×c3br“òæ6Æ74Æ—7BçFövvÆR‚w'G2Ö&ÒÖ7F—fR×c3brÂ&ÖVB“°¢†–FU&Vv–öä6÷W'6U&Wf–Wuc3b‚“°¢Fö7Bç6†÷r†&ÖVBò}	­½­Ý‚ýâm]½‚M½ò}ý=­­]-²r¢}	}ý=¢í-Í]ÝÒrÂvö²r“°¢Ð¢òòÒÒÒÒ­]-³¢-ý²Ý-]M]ÝòÂ-í}­ýí­ÂÍ­Í½ÍÝòM½ÍÝí-ÂÒÒÒÐ¢6öç7BÔ•54”ÄUõE•U5õc3bÒ°¢†VC¢²Æ&VÃ¢}		¢rÂ&ævS¢3SÂ6VV³¢Â7VVC¢3ÒÂòò-]ý½í-½S¢­í½‚‚­]-²ÂÝR=ííM ¢&F#¢²Æ&VÃ¢}
	½
rÂ&ævS¢SÂ6VV³¢CÂ7VVC¢#cÒÂòòMÝ½S¢=ííM‚­í½‚-­½í}ÝÝ½ÂMíÂÂÝR­]-°¢çF“¢²Æ&VÃ¢}	ý
	ârÂ&ævS¢#SÂ6VV³¢3Â7VVC¢3ƒÒòòýí--í­]-³¢-í½Í­â­]-°¢Ó°¢gVæ7F–öâÖ—76–ÆT6åF&vWEFö¶Våc3b‡G—RÂFö¶Vâ’°¢–b‚Fö¶Vâ’&WGW&âfÇ6S°¢–b‡G—RÓÓÒv†VBr’&WGW&âFö¶VâçG—RÓÓÒw6†—rÇÂFö¶VâçG—RÓÓÒw7VG&öâs°¢–b‡G—RÓÓÒw&F"r’&WGW&âFö¶VâçG—RÓÓÒv6—G’rÇÂ‚‡Fö¶VâçG—RÓÓÒw6†—rÇÂFö¶VâçG—RÓÓÒw7VG&öâr’bbFö¶Vå&F$–æfõc3b‡Fö¶Vâ’æ7F—fR“°¢&WGW&âfÇ6S²òòçF’(	B-í½Í­â­]-°¢Ð¢òò
ý]mM­mò­]-³¢--í]ÝÝ½’-ò‚v†VBròw&F"ròvçF’r’½‚­]-p¢òòv÷&ÆB6öæf–r‚wv3£Æ–Câr’í--]ÝÝ½Í‚M½ÍÝí-Íâýýí­íÂý­íí-Íâà¢gVæ7F–öâvWDÖ—76–ÆU7V5c3b‡fÇVR’°¢6öç7B&rÒ7G&–ær‡fÇVRÇÂv†VBr“°¢–b‡&rç7F'G5v—F‚‚wv3¢r’’°¢6öç7BÖ—76–ÆRÒÔ•54”ÄU5õc3e·&rç6Æ–6Rƒ2•Ó°¢–b†Ö—76–ÆR’&WGW&â²Æ&VÃ¢Ö—76–ÆRææÖRÂwV–Fæ6S¢Ö—76–ÆRæwV–Fæ6RÂ&ævS¢çVÖ&W"†Ö—76–ÆRç&ævRÇÂ3S’Â6VV³¢çVÖ&W"†Ö—76–ÆRç6VV²ÇÂ’Â7VVC¢çVÖ&W"†Ö—76–ÆRç7VVBÇÂ3’Ó°¢Ð¢6öç7B'V–ÇF–âÒÔ•54”ÄUõE•U5õc3e·&uÒÇÂÔ•54”ÄUõE•U5õc3bæ†VC°¢&WGW&â²Æ&VÃ¢'V–ÇF–âæÆ&VÂÂwV–Fæ6S¢Ô•54”ÄUõE•U5õc3e·&uÒò&r¢v†VBrÂ&ævS¢'V–ÇF–âç&ævRÂ6VV³¢'V–ÇF–âç6VV²Â7VVC¢'V–ÇF–âç7VVBÓ°¢Ð¢gVæ7F–öâÆVæ6„Ö—76–ÆUc3b†ÖÂg&öÕ‚Âg&öÕ’Â6V&6…‚Â6V&6…’ÂG—RÒ%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆUG—RÇÂv†VBr’°¢6öç7B7V2ÒvWDÖ—76–ÆU7V5c3b‡G—R“°¢–b„ÖF‚æ‡—÷B‡6V&6…‚Òg&öÕ‚Â6V&6…’Òg&öÕ’’â7V2ç&ævR’°¢Fö7Bç6†÷r†
-í}­ýí­M½ÍRM=­]-²G·7V2æÆ&VÇÒ‚G·7V2ç&ævWÒ]B–ÂvW'"r“°¢&WGW&âfÇ6S°¢Ð¢–b‚'&’æ—4'&’…%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆW2’’%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆW2ÒµÓ°¢%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆW2çW6‚‡²–C¢ÕòG´FFRææ÷r‚’çFõ7G&–ærƒ3b—ÒG´ÖF‚ç&æFöÒ‚’çFõ7G&–ærƒ3b’ç6Æ–6Rƒ"ÂR—ÖÂG—RÂwV–Fæ6S¢7V2æwV–Fæ6RÂ6VV³¢7V2ç6VV²Â7VVC¢7V2ç7VVBÂƒ¢g&öÕ‚Â“¢g&öÕ’Â7ƒ¢6V&6…‚Â7“¢6V&6…’Â†6S¢wG&ç6—BrÂF&vWEFö¶Vä–C¢rrÂF&vWDÖ—76–ÆT–C¢rrÂFVC¢fÇ6RÂ&ööÔC¢Ò“°¢Æ•&Vv–öå6÷VæE&æFöÕc3b‚w&F–õöÖ—76–ÆUòrÂ2Â²6ööÆF÷vä×3¢sÒ“°¢&WGW&âG'VS°¢Ð¢gVæ7F–öâÖ—76–ÆT7V—&Uc3b†ÖÂÖ—76–ÆR’°¢6öç7BwV–Fæ6RÒÖ—76–ÆRæwV–Fæ6RÇÂÖ—76–ÆRçG—RÇÂv†VBs°¢6öç7B6VV²ÒçVÖ&W"†Ö—76–ÆRç6VV²ÇÂÔ•54”ÄUõE•U5õc3bæ†VBç6VV²“°¢ÆWB&W7BÒçVÆÃ°¢–b†wV–Fæ6RÓÓÒv†VBrÇÂwV–Fæ6RÓÓÒvçF’r’°¢…%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆW2ÇÂµÒ’æf÷$V6‚†÷F†W"Óâ°¢–b†÷F†W"ÓÓÒÖ—76–ÆRÇÂ÷F†W"æFVB’&WGW&ã°¢6öç7BBÒÖF‚æ‡—÷B†÷F†W"ç‚ÒÖ—76–ÆRç‚Â÷F†W"ç’ÒÖ—76–ÆRç’“°¢–b†BÃÒ6VV²bb‚&W7BÇÂBÂ&W7BæB’’&W7BÒ²BÂÖ—76–ÆT–C¢÷F†W"æ–BÓ°¢Ò“°¢Ð¢–b†wV–Fæ6RÓÒvçF’r’°¢6fT'&•c3b†ÖçFö¶Vç2’æf÷$V6‚‡Fö¶VâÓâ°¢–b‚Ö—76–ÆT6åF&vWEFö¶Våc3b†wV–Fæ6RÂFö¶Vâ’’&WGW&ã°¢6öç7BÒ7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶Vâ“°¢6öç7BBÒÖF‚æ‡—÷B‡ç‚ÒÖ—76–ÆRç‚Âç’ÒÖ—76–ÆRç’“°¢–b†BÃÒ6VV²bb‚&W7BÇÂBÂ&W7BæB’’&W7BÒ²BÂFö¶Vä–C¢Fö¶Vâæ–BÓ°¢Ò“°¢Ð¢–b†&W7CòçFö¶Vä–B’²Ö—76–ÆRçF&vWEFö¶Vä–BÒ&W7BçFö¶Vä–C²Ö—76–ÆRç†6RÒv†öÖ–ærs²&WGW&âG'VS²Ð¢–b†&W7CòæÖ—76–ÆT–B’²Ö—76–ÆRçF&vWDÖ—76–ÆT–BÒ&W7BæÖ—76–ÆT–C²Ö—76–ÆRç†6RÒv†öÖ–ærs²&WGW&âG'VS²Ð¢&WGW&âfÇ6S°¢Ð¢gVæ7F–öâFWFöæFTÖ—76–ÆUc3b†Ö—76–ÆRÂÆ–W"ÂÖ’°¢Ö—76–ÆRæFVBÒG'VS°¢Ö—76–ÆRæ&ööÔBÒFFRææ÷r‚“°¢Æ–W"çVW'•6VÆV7F÷"†¶FFÖÖ—76–ÆSÒ"G´552æW66R†Ö—76–ÆRæ–B—Ò%Ö“òç&VÖ÷fR‚“°¢6öç7B&ööÒÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“°¢&ööÒæ6Æ74æÖRÒw'G2ÖÖ—76–ÆRÖ–×7B×c3bs°¢&ööÒç7G–ÆRæÆVgBÒG²†Ö—76–ÆRç‚òÖçv–GF‚¢’çFôf—†VBƒ2—ÒV°¢&ööÒç7G–ÆRçF÷ÒG²†Ö—76–ÆRç’òÖæ†V–v‡B¢’çFôf—†VBƒ2—ÒV°¢Æ–W"æVæD6†–ÆB†&ööÒ“°¢6WEF–ÖV÷WB‚‚’Óâ&ööÒç&VÖ÷fR‚’Âc“°¢Ð¢gVæ7F–öâWFFTÖ—76–ÆW5c3b†ÖÂGD×2’°¢6öç7BÆ–W"ÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖÖ—76–ÆW2ÖÆ–W"×c3br“°¢–b‚Æ–W"’&WGW&ã°¢6öç7Bæ÷rÒFFRææ÷r‚“°¢6öç7BÆ—7BÒ'&’æ—4'&’…%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆW2’ò%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆW2¢µÓ°¢Æ—7Bæf÷$V6‚†Ö—76–ÆRÓâ°¢–b†Ö—76–ÆRæFVB’&WGW&ã°¢6öç7B7V2Ò²7VVC¢çVÖ&W"†Ö—76–ÆRç7VVBÇÂÔ•54”ÄUõE•U5õc3bæ†VBç7VVB’Ó°¢ÆWBG‚ÒÖ—76–ÆRç7‚ÂG’ÒÖ—76–ÆRç7“°¢–b†Ö—76–ÆRç†6RÓÓÒv†öÖ–ærr’°¢ÆWBÆ—fRÒfÇ6S°¢–b†Ö—76–ÆRçF&vWDÖ—76–ÆT–B’°¢6öç7BF&vWBÒÆ—7Bæf–æB†ÒÓâÒæ–BÓÓÒÖ—76–ÆRçF&vWDÖ—76–ÆT–BbbÒæFVB“°¢–b‡F&vWB’²G‚ÒF&vWBçƒ²G’ÒF&vWBç“²Æ—fRÒG'VS²Ð¢ÒVÇ6R–b†Ö—76–ÆRçF&vWEFö¶Vä–B’°¢6öç7BF&vWBÒ6fT'&•c3b†ÖçFö¶Vç2’æf–æB‡BÓâBæ–BÓÓÒÖ—76–ÆRçF&vWEFö¶Vä–B“°¢–b‡F&vWB’²6öç7BÒ7W'&VçEFö¶Vå÷6—F–öåc3b‡F&vWBÂæ÷r“²G‚Òçƒ²G’Òç“²Æ—fRÒG'VS²Ð¢Ð¢–b‚Æ—fR’²FWFöæFTÖ—76–ÆUc3b†Ö—76–ÆRÂÆ–W"ÂÖ“²&WGW&ã²Ð¢Ð¢6öç7BF—7BÒÖF‚æ‡—÷B‡G‚ÒÖ—76–ÆRç‚ÂG’ÒÖ—76–ÆRç’“°¢6öç7B7FWÒ7V2ç7VVB¢ÖF‚æÖ‚ƒÂGD×2’ò°¢–b†F—7BÃÒÖF‚æÖ‚ƒbÂ7FW’’°¢Ö—76–ÆRç‚ÒGƒ²Ö—76–ÆRç’ÒG“°¢òòMí-=½-í}­‚ýí­¢}]-"m]½‚½‚ýíM½ ¢–b†Ö—76–ÆRç†6RÓÓÒwG&ç6—BrbbÖ—76–ÆT7V—&Uc3b†ÖÂÖ—76–ÆR’’&WGW&ã°¢–b†Ö—76–ÆRç†6RÓÓÒv†öÖ–ærrbbÖ—76–ÆRçF&vWDÖ—76–ÆT–B’°¢6öç7BF&vWBÒÆ—7Bæf–æB†ÒÓâÒæ–BÓÓÒÖ—76–ÆRçF&vWDÖ—76–ÆT–BbbÒæFVB“°¢–b‡F&vWB’FWFöæFTÖ—76–ÆUc3b‡F&vWBÂÆ–W"ÂÖ“°¢Ð¢FWFöæFTÖ—76–ÆUc3b†Ö—76–ÆRÂÆ–W"ÂÖ“°¢&WGW&ã°¢Ð¢Ö—76–ÆRç‚³Ò‡G‚ÒÖ—76–ÆRç‚’òF—7B¢7FW°¢Ö—76–ÆRç’³Ò‡G’ÒÖ—76–ÆRç’’òF—7B¢7FW°¢ÆWBæöFRÒÆ–W"çVW'•6VÆV7F÷"†¶FFÖÖ—76–ÆSÒ"G´552æW66R†Ö—76–ÆRæ–B—Ò%Ö“°¢–b‚æöFR’²æöFRÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“²æöFRæ6Æ74æÖRÒw'G2ÖÖ—76–ÆR×c3bs²æöFRæFF6WBæÖ—76–ÆRÒÖ—76–ÆRæ–C²Æ–W"æVæD6†–ÆB†æöFR“²Ð¢æöFRç7G–ÆRæÆVgBÒG²†Ö—76–ÆRç‚òÖçv–GF‚¢’çFôf—†VBƒ2—ÒV°¢æöFRç7G–ÆRçF÷ÒG²†Ö—76–ÆRç’òÖæ†V–v‡B¢’çFôf—†VBƒ2—ÒV°¢Ò“°¢%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆW2ÒÆ—7Bæf–ÇFW"†ÒÓâÒæFVBÇÂæ÷rÒçVÖ&W"†Òæ&ööÔBÇÂ’Â““°¢Ð¢òòÒÒÒÒföröbv"ÒÒÒÐ¢gVæ7F–öâföt7F—fUc3b†Ö’°¢–b‚ÖæfösòæVæ&ÆVB’&WGW&âfÇ6S°¢–b…%E5õ$Tt”ôåõT•õc3bæÖöFRÓÓÒvVF—Br’&WGW&âfÇ6S°¢–b†—4vÕc3b‚’’&WGW&â&ööÆVâ…%E5õ$Tt”ôåõT•õc3bæföu&Wf–Wr“°¢&WGW&âG'VS°¢Ð¢òò
]âÝ}Ý½R*½í½­+²-=ÍÝ-íÝ³¢M]-]ÍÝí-ÝÝò-]­-=r­½=í"À¢òòÍ]M½]ÝÝâM]M=íó²}íÝí}íÍý=­â*½}M-=],+²í½­à¢gVæ7F–öâ'V–ÆDföt6Æ÷VG5c3b‡rÂ‚’°¢6öç7B7bÒFö7VÖVçBæ7&VFTVÆVÖVçB‚v6çf2r“°¢7bçv–GF‚Òs²7bæ†V–v‡BÒƒ°¢6öç7B2Ò7bævWD6öçFW‡B‚s&Br“°¢2æf–ÆÅ7G–ÆRÒw&v"ƒrÃ’Ã2’s°¢2æf–ÆÅ&V7BƒÂÂrÂ‚“°¢ÆWB6VVBÒ33s°¢6öç7B&æBÒ‚’Óâ²6VVBÒ‡6VVB¢ccCS#R²3“C##2’ããâ²&WGW&â6VVBòC#“C“cs#“c²Ó°¢f÷"†ÆWB’Ò²’Â#c²’³Ò’°¢6öç7B‚Ò&æB‚’¢rÂ’Ò&æB‚’¢‚Â"Ò‚²&æB‚’¢“S°¢6öç7B6†FRÒb²ÖF‚æfÆö÷"‡&æB‚’¢Cb“²òòí"ýí}-‚}Ýí=â¢]íÍ0¢6öç7BrÒ2æ7&VFU&F–Äw&F–VçB‡‚Â’ÂÂ‚Â’Â"“°¢ræFD6öÆ÷%7F÷ƒÂ&v&‚G·6†FWÒÂG·6†FR²7ÒÂG·6†FR²wÒÂG²ƒã#"²&æB‚’¢ã3B’çFôf—†VBƒ"—Ò–“°¢ræFD6öÆ÷%7F÷ƒÂw&v&ƒÃÃÃ’r“°¢2æf–ÆÅ7G–ÆRÒs°¢2æ&Vv–åF‚‚“²2æ&2‡‚Â’Â"ÂÂÖF‚å’¢"“²2æf–ÆÂ‚“°¢Ð¢&WGW&â7c°¢Ð¢gVæ7F–öâ&VæFW$föuc3b†Ö’°¢6öç7B6çf2ÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w'G2ÖförÖ6çf2×c3br“°¢–b‚6çf2’&WGW&ã°¢–b‚föt7F—fUc3b†Ö’’²6çf2ç7G–ÆRæF—7Æ’ÒvæöæRs²&WGW&ã²Ð¢6öç7BÆ—FRÒw&†–74ÖöFRæ—4Æ—FR‚“°¢6öç7BrÒÆ—FRòCƒ¢“Â‚ÒÖF‚æÖ‚ƒÂÖF‚ç&÷VæB…r¢„çVÖ&W"†Öæ†V–v‡BÇÂ’òÖF‚æÖ‚ƒÂçVÖ&W"†Öçv–GF‚ÇÂ’’’’“°¢–b†6çf2çv–GF‚ÓÒrÇÂ6çf2æ†V–v‡BÓÒ‚’²6çf2çv–GF‚Òs²6çf2æ†V–v‡BÒƒ²%E5õ$Tt”ôåõT•õc3bæföt6Æ÷VG2ÒçVÆÃ²Ð¢6çf2ç7G–ÆRæF—7Æ’Òrs°¢6öç7B7G‚Ò6çf2ævWD6öçFW‡B‚s&Br“°¢7G‚æ6ÆV%&V7BƒÂÂrÂ‚“°¢–b†Æ—FR’°¢7G‚æf–ÆÅ7G–ÆRÒw&v"ƒrÃ’Ã2’s°¢7G‚æf–ÆÅ&V7BƒÂÂrÂ‚“°¢ÒVÇ6R°¢–b‚%E5õ$Tt”ôåõT•õc3bæföt6Æ÷VG2’%E5õ$Tt”ôåõT•õc3bæföt6Æ÷VG2Ò'V–ÆDföt6Æ÷VG5c3b…rÂ‚“°¢6öç7B6Æ÷VG2Ò%E5õ$Tt”ôåõT•õc3bæföt6Æ÷VG3°¢òòÍ]M½]ÝÝ½’M]Bí½­í"-½Â,9s"M½ò]í-Ýí-‚¢6öç7BBÒFFRææ÷r‚’¢ãc°¢6öç7BG‚ÒÖF‚æfÆö÷"‡BRr’ÂG’ÒÖF‚æfÆö÷"‚‡B¢ãSR’R‚“°¢7G‚ævÆö&ÄÇ†Òã“s°¢7G‚æG&t–ÖvR†6Æ÷VG2ÂÖG‚ÂÖG’“°¢7G‚æG&t–ÖvR†6Æ÷VG2ÂrÒG‚ÂÖG’“°¢7G‚æG&t–ÖvR†6Æ÷VG2ÂÖG‚Â‚ÒG’“°¢7G‚æG&t–ÖvR†6Æ÷VG2ÂrÒG‚Â‚ÒG’“°¢7G‚ævÆö&ÄÇ†Ò°¢Ð¢7G‚ævÆö&Ä6ö×÷6—FT÷W&F–öâÒvFW7F–æF–öâÖ÷WBs°¢Æ–W%f–Wu6÷W&6W5c3b†Ö’æf÷$V6‚‡7&2Óâ°¢6öç7B7‚Ò7&2ç‚òÖçv–GF‚¢rÂ7’Ò7&2ç’òÖæ†V–v‡B¢‚Â"ÒÖF‚æÖ‚ƒ"Â7&2ç"òÖçv–GF‚¢r“°¢–b†Æ—FR’°¢7G‚æf–ÆÅ7G–ÆRÒr3s°¢ÒVÇ6R°¢òòÍý=­’í­’­’(	Bí½­*½-=ýí-ü+²-í­=2­í½ð¢6öç7BrÒ7G‚æ7&VFU&F–Äw&F–VçB†7‚Â7’ÂÂ7‚Â7’Â"“°¢ræFD6öÆ÷%7F÷ƒÂw&v&ƒÃÃÃ’r“°¢ræFD6öÆ÷%7F÷ƒãSRÂw&v&ƒÃÃÃ’r“°¢ræFD6öÆ÷%7F÷ƒãƒ"Âw&v&ƒÃÃÃãSR’r“°¢ræFD6öÆ÷%7F÷ƒÂw&v&ƒÃÃÃ’r“°¢7G‚æf–ÆÅ7G–ÆRÒs°¢Ð¢7G‚æ&Vv–åF‚‚“²7G‚æ&2†7‚Â7’Â"ÂÂÖF‚å’¢"“²7G‚æf–ÆÂ‚“°¢Ò“°¢7G‚ævÆö&Ä6ö×÷6—FT÷W&F–öâÒw6÷W&6RÖ÷fW"s°¢Ð¢gVæ7F–öâ&Vv–öäÖ&–VçD¶W•c3b‚’²&WGW&âw&Vv–öã¢r²…%E5õ$Tt”ôåõT•õc3bæÖ–BÇÂrr“²Ð¢gVæ7F–öâVç7W&U&Vv–öäÖ&–VçDÖöFÅc3b‚’°¢ÆWBÖöFÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖ&–VçBÖÖöFÂ×c3br“°¢–b†ÖöFÂ’&WGW&âÖöFÃ°¢ÖöFÂÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“°¢ÖöFÂæ–BÒw&Vv–öâÖÖ&–VçBÖÖöFÂ×c3bs°¢ÖöFÂæ6Æ74æÖRÒvÖöFÂ&Vv–öâÖÖ&–VçBÖÖöFÂ×c3bs°¢ÖöFÂæ–ææW$…DÔÂÒÆF—b6Æ73Ò'&Vv–öâÖÖ&–VçBÖ&÷‚×c3b#ãÆF—b6Æ73Ò'&÷r"7G–ÆSÒ&§W7F–g’Ö6öçFVçC§76RÖ&WGvVVã¶Æ–vâÖ—FV×3¦fÆW‚×7F'B#ãÆF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
ÝÍ]Ý"]=íÝÂöF—cãÆƒ"7G–ÆSÒ&Ö&v–ã£"–CÒ'&Vv–öâÖÖ&–VçB×F—FÆR×c3b#ãÂöƒ#ãÂöF—cãÆ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"–CÒ'&Vv–öâÖÖ&–VçBÖ6Æ÷6R×c3b#í	}		­

½
-
ÃÂö'WGFöããÂöF—cãÆF—b6Æ73Ò'&Vv–öâÖÖ&–VçBÖ&öG’×c3b"–CÒ'&Vv–öâÖÖ&–VçBÖ&öG’×c3b#ãÂöF—cãÂöF—cæ°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB†ÖöFÂ“°¢ÖöFÂæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢–b†WfVçBçF&vWBÓÓÒÖöFÂÇÂWfVçBçF&vWBæ6Æ÷6W7B‚r7&Vv–öâÖÖ&–VçBÖ6Æ÷6R×c3br’’²ÖöFÂæ6Æ74Æ—7Bç&VÖ÷fR‚v÷Vâr“²&WGW&ã²Ð¢6öç7BF&vWBÒWfVçBçF&vWBæ6Æ÷6W7B‚u¶FF×&ÖFB×6V7F–öåÒÅ¶FF×&ÖFEÒÅ¶FF×&×&æFöÕÒÅ¶FF×&×Æ•ÒÅ¶FF×&ÖÖ&–VçEÒÅ¶FF×&×7F÷ÒÅ¶FF×&ÖFVÆWFR×6V7F–öåÒÂ7&Vv–öâÖÖ&–VçB×7F÷×c3br“°¢–b‚F&vWB’&WGW&ã°¢6öç7BVF–ô’Òv–æF÷rä6öÖ&DVF–õc3s°¢–b‚VF–ô’’&WGW&ã°¢WfVçBç&WfVçDFVfVÇB‚“²WfVçBç7F÷&÷vF–öâ‚“°¢6öç7B¶W’Ò&Vv–öäÖ&–VçD¶W•c3b‚“°¢–b‡F&vWBæ–BÓÓÒw&Vv–öâÖÖ&–VçB×7F÷×c3brÇÂF&vWBæFF6WBç&7F÷ÓÒVæFVf–æVB’²FVÆWFRVF–ô’ç7FFRç66VæTÖ&–VçE¶¶W•Ó²VF–ô’ç6fR‚“²VF–ô’ç7F÷Ö&–VçB‚“²Ð¢VÇ6R–b‡F&vWBæFF6WBç&FE6V7F–öâÓÒVæFVf–æVB’²6öç7B–çWBÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖ&–VçB×6V7F–öâÖæÖR×c3br“²VF–ô’æFE6V7F–öâ†–çWCòçfÇVRÇÂrr“²–b†–çWB’–çWBçfÇVRÒrs²Ð¢VÇ6R–b‡F&vWBæFF6WBç&FVÆWFU6V7F–öâ’VF–ô’æFVÆWFU6V7F–öâ‡F&vWBæFF6WBç&FVÆWFU6V7F–öâ“°¢VÇ6R–b‡F&vWBæFF6WBç&FB’VF–ô’æFE6÷VæB‡F&vWBæFF6WBç&FB“°¢VÇ6R–b‡F&vWBæFF6WBç&&æFöÒ’VF–ô’çÆ•&æFöÒ‡F&vWBæFF6WBç&&æFöÒ“°¢VÇ6R–b‡F&vWBæFF6WBç&Æ’’VF–ô’çÆ’‡F&vWBæFF6WBç&Æ’“°¢VÇ6R–b‡F&vWBæFF6WBç&Ö&–VçB’VF–ô’ç6WDÖ&–VçB†¶W’ÂF&vWBæFF6WBç&Ö&–VçB“°¢6WEF–ÖV÷WB‡&VæFW%&Vv–öäÖ&–VçD&öG•c3bÂƒ“°¢Ò“°¢ÖöFÂæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ°¢6öç7B–çWCÖWfVçBçF&vWBæ6Æ÷6W7Còâ‚u¶FF×&×&VæÖR×6V7F–öåÒr“°¢–b‚–çWB’&WGW&ã°¢6öç7B“×v–æF÷rä6öÖ&DVF–õc3s°¢–b‚“òç&VæÖU6V7F–öãòâ†–çWBæFF6WBç&&VæÖU6V7F–öâÆ–çWBçfÇVR’’–çWBçfÇVSÖ“òæf–æE6V7F–öâ†–çWBæFF6WBç&&VæÖU6V7F–öâ“òææÖWÇÂrs°¢&VæFW%&Vv–öäÖ&–VçD&öG•c3b‚“°¢Ò“°¢&WGW&âÖöFÃ°¢Ð¢gVæ7F–öâ&VæFW%&Vv–öäÖ&–VçD&öG•c3b‚’°¢6öç7BÖöFÂÒVç7W&U&Vv–öäÖ&–VçDÖöFÅc3b‚“°¢6öç7BÖÒ$Tt”ôåôÔ5õc3eµ%E5õ$Tt”ôåõT•õc3bæÖ–EÓ°¢6öç7BF—FÆTVÂÒÖöFÂçVW'•6VÆV7F÷"‚r7&Vv–öâÖÖ&–VçB×F—FÆR×c3br“°¢–b‡F—FÆTVÂ’F—FÆTVÂçFW‡D6öçFVçBÒÖòææÖRÇÂ}
]=íÒs°¢6öç7B&öG’ÒÖöFÂçVW'•6VÆV7F÷"‚r7&Vv–öâÖÖ&–VçBÖ&öG’×c3br“°¢6öç7BVF–ô’Òv–æF÷rä6öÖ&DVF–õc3s°¢–b‚VF–ô’’²&öG’æ–ææW$…DÔÂÒsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	½í­½ÍÝò½í-]­}-=­í"Ý]Mí-=ýÝãÂöF—câs²&WGW&ã²Ð¢6öç7BÖ&–VçD–BÒVF–ô’ç7FFSòç66VæTÖ&–VçCòå·&Vv–öäÖ&–VçD¶W•c3b‚•ÒÇÂrs°¢&öG’æ–ææW$…DÔÂÒÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	}-=­‚]Ýý-ò½í­½ÍÝâ"ýý­RMÝÝ½Rý½ím]Ýòâ
ÝÍ]Ý"ý-ý}Ò¢Ý-í’­-R]=íÝ‚}ý=­]-òý‚]í-­½-‚ãÂöF—cà¢ÆF—b6Æ73Ò'&÷r6öÖ&BÖVF—F÷"Ö7F–öç2"7G–ÆSÒ&Ö&v–â×F÷£ƒ¶v£‡ƒ¶fÆW‚×w&§w&#ãÆ–çWB6Æ73Ò&–çWB"–CÒ'&Vv–öâÖÖ&–VçB×6V7F–öâÖæÖR×c3b"Æ6V†öÆFW#Ò-	Ýí-½’}M]²}-=­í""óãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×&ÖFB×6V7F–öãÒ##í	M	í			-	
-
Â
		}	M	]	³Âö'WGFöããÆ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"–CÒ'&Vv–öâÖÖ&–VçB×7F÷×c3b#í

-	í	ò
Ý	Í			]	Ý
#Âö'WGFöããÂöF—cà¢ÆF—b6Æ73Ò&6öÖ&B×6÷VæB×6V7F–öç2×c3r"7G–ÆSÒ&Ö&v–â×F÷£‚#âG¶VF–ô’ç6V7F–öç2æÖ‡6V7F–öâÓâÆF—b6Æ73Ò&6öÖ&B×6÷VæB×6V7F–öâ×c3r#ãÆF—b6Æ73Ò&6öÖ&B×6÷VæB×6V7F–öâÖ†VB×c3r#ãÆ–çWB6Æ73Ò&6öÖ&B×6÷VæBÖæÖRÖ–çWB×cC""fÇVSÒ"G¶W62‡6V7F–öâææÖR—Ò"FF×&×&VæÖR×6V7F–öãÒ"G¶W62‡6V7F–öâæ–B—Ò"&–ÖÆ&VÃÒ-	Ý}-ÝR}M]½}-=­í""óãÆF—b6Æ73Ò'&÷r6öÖ&BÖVF—F÷"Ö7F–öç2#ãÆ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"FF×&ÖFVÆWFR×6V7F–öãÒ"G¶W62‡6V7F–öâæ–B—Ò#í
=	M		½	
-
Â
		}	M	]	³Âö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×&ÖFCÒ"G¶W62‡6V7F–öâæ–B—Ò#í	M	í			-	
-
Â
M			½
³Âö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×&×&æFöÓÒ"G¶W62‡6V7F–öâæ–B—Ò#í
	½
=
}			Ý
½	“Âö'WGFöããÂöF—cãÂöF—cãÆF—b6Æ73Ò&6öÖ&B×6÷VæBÖÆ—7B×c3r#âG·6V7F–öâç6÷VæG2æÖ‡6÷VæBÓâÆF—b6Æ73Ò&6öÖ&B×6÷VæB×&÷r×c3r#ãÇ7ãâG¶W62‡6÷VæBææÖR—ÓÂ÷7ããÆF—b6Æ73Ò'&÷r6öÖ&BÖVF—F÷"Ö7F–öç2#ãÆ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"FF×&×Æ“Ò"G¶W62‡6÷VæBæ–B—Ò#í	-	í
	ý
	í		}	-	]

-	ƒÂö'WGFöããÆ'WGFöâ6Æ73Ò&v†÷7BG¶Ö&–VçD–BÓÓÒ6÷VæBæ–Bòv7F—fRr¢rwÒ"G—SÒ&'WGFöâ"FF×&ÖÖ&–VçCÒ"G¶W62‡6÷VæBæ–B—Ò#í
M	í	ÓÂö'WGFöããÆ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"FF×&×7F÷Ò"G¶W62‡6÷VæBæ–B—Ò"F—FÆSÒ-	í-Ýí--ÂMíÒ#î(û“Âö'WGFöããÂöF—cãÂöF—cæ’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	"Ý-íÂ}M]½Rýí­Ý]"M½í"ãÂöF—câwÓÂöF—cãÂöF—cæ’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð¢gVæ7F–öâ÷Vå&Vv–öäÖ&–VçEc3b‚’°¢–b‚v–æF÷rä6öÖ&DVF–õc3r’&WGW&âFö7Bç6†÷r‚}	½í-]­}-=­í"Ý]Mí-=ýÝrÂvW'"r“°¢&VæFW%&Vv–öäÖ&–VçD&öG•c3b‚“°¢Vç7W&U&Vv–öäÖ&–VçDÖöFÅc3b‚’æ6Æ74Æ—7BæFB‚v÷Vâr“°¢Ð¢gVæ7F–öâ7F'E&Vv–öäÖæ–ÖF–öåc3b‚’°¢–b…%E5õ$Tt”ôåõT•õc3bç&b’6æ6VÄæ–ÖF–öäg&ÖR…%E5õ$Tt”ôåõT•õc3bç&b“°¢%E5õ$Tt”ôåõT•õc3bæÆ7DÆ—FTg&ÖTBÒ°¢6öç7BF–6²Òg&ÖTæ÷rÓâ°¢6öç7BÖöFÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv–öâÖÖÖÖöFÂ×c3br“°¢6öç7BÖÒ$Tt”ôåôÔ5õc3eµ%E5õ$Tt”ôåõT•õc3bæÖ–EÓ°¢–b‚ÖÇÂÖöFÃòæ6Æ74Æ—7Bæ6öçF–ç2‚v÷Vâr’’²%E5õ$Tt”ôåõT•õc3bç&bÒ²&WGW&ã²Ð¢–b„w&†–74ÖöFRæ—4Æ—FR‚’bbg&ÖTæ÷rÒ%E5õ$Tt”ôåõT•õc3bæÆ7DÆ—FTg&ÖTBÂ’°¢%E5õ$Tt”ôåõT•õc3bç&bÒ&WVW7Dæ–ÖF–öäg&ÖR‡F–6²“°¢&WGW&ã°¢Ð¢%E5õ$Tt”ôåõT•õc3bæÆ7DÆ—FTg&ÖTBÒg&ÖTæ÷s°¢6öç7Bæ÷rÒFFRææ÷r‚“°¢ÆWB6WGFÆVBÒfÇ6S°¢6fT'&•c3b†ÖçFö¶Vç2’æf÷$V6‚‡Fö¶VâÓâ°¢6öç7B÷2Ò7W'&VçEFö¶Vå÷6—F–öåc3b‡Fö¶VâÂæ÷r“°¢6öç7BæöFRÒFö7VÖVçBçVW'•6VÆV7F÷"†¶FF×Fö¶VâÖ–CÒ"G´552æW66R‡Fö¶Vâæ–B—Ò%Ö“°¢–b†æöFR’°¢æöFRç7G–ÆRæÆVgBÒG²‡÷2ç‚òÖçv–GF‚¢’çFôf—†VBƒ2—ÒV°¢æöFRç7G–ÆRçF÷ÒG²‡÷2ç’òÖæ†V–v‡B¢’çFôf—†VBƒ2—ÒV°¢æöFRæ6Æ74Æ—7BçFövvÆR‚vÖ÷f–ærrÂ&ööÆVâ‡Fö¶VâæÖ÷fTVæG4B’bb÷2æFöæR“°¢Ð¢–b‡÷2æFöæR’6WGFÆVBÒG'VS°¢Ò“°¢WFFU&Vv–öägVVÅ&ævUc3b†ÖÂæ÷r“°¢WFFU&Vv–öå&F%&ævUc3b†ÖÂæ÷r“°¢F6…&Vv–öå6–FTgVVÅc3b†ÖÂæ÷r“°¢6öç7BGEvÆÂÒ%E5õ$Tt”ôåõT•õc3bæÆ7EF–6´×2òÖF‚æÖ–âƒ#Âæ÷rÒ%E5õ$Tt”ôåõT•õc3bæÆ7EF–6´×2’¢c°¢%E5õ$Tt”ôåõT•õc3bæÆ7EF–6´×2Òæ÷s°¢WFFTÖ—76–ÆW5c3b†ÖÂGEvÆÂ¢…%E5õ$Tt”ôåõT•õc3bçF–ÖU66ÆRóò’“°¢G'’²&Vv–öå6÷VæEF–6µc3b†ÖÂæ÷r“²Ò6F6‚·Ð¢G'’²&VæFW$föuc3b†Ö“²Ò6F6‚·Ð¢–b‡6WGFÆVB’°¢6WGFÆTÆÅ&Vv–öåFö¶Vç5c3b‚“°¢66†VGVÆU&Vv–öåW'6—7Ec3b‚rrÂ²FVÆ“¢SÒ“°¢òòý½-RÍ]Ýý]"Mí-=ýÝ½RM]--òÝýÍ]Â*½í­]MÝ-Â"Ý­M<+²¢&Vg&W6…&Vv–öå6–FUc3b†Ö“°¢Ð¢%E5õ$Tt”ôåõT•õc3bç&bÒ&WVW7Dæ–ÖF–öäg&ÖR‡F–6²“°¢Ó°¢%E5õ$Tt”ôåõT•õc3bç&bÒ&WVW7Dæ–ÖF–öäg&ÖR‡F–6²“°¢Ð¢7–æ2gVæ7F–öâ6†÷u&Vv–öäÖöäF—7Æ•c3b†Ö–B’°¢6öç7BÖÒ$Tt”ôåôÔ5õc3e¶Ö–EÓ°¢–b‚Ö’&WGW&ã°¢G'’²v—Bv–æF÷ræVÆV7G&öä“òæ÷VåÆ–W$F—7Æ“òâ‚“²Ò6F6‚·Ð¢G'’²v—Bv–æF÷ræVÆV7G&öä“òçWFFUÆ–W$F—7Æ•f–Wsòâ‡&Vv–öäF—7Æ•–ÆöEc3b‚’“²Ò6F6‚·Ð¢66†VGVÆU&Vv–öåW'6—7Ec3b‚rrÂ²FVÆ“¢SÒ“²òòfÇW6‚för6öæf–ròW‡Æ÷&VB6òF†R6V6öæB67&VVâ–6·2—BW ¢6öç7B'VçF–ÖRÒvWE&Vv–öå'VçF–ÖUc3b‚“²'VçF–ÖRæ7F—fTÖ–BÒÖæ–C²'VçF–ÖRçWFFVDBÒæ÷t—6õc3b‚“°¢G'’²v—Bç6fU7FFR‚}	­-]=íÝ-½-]M]ÝÝ--íí’Ý­Òr“²Ò6F6‚·Ð¢Ð ¢6öç7Bõ÷&VæFW%&öf–ÆUc3bÒT’ç&VæFW%&öf–ÆRæ&–æB…T’“°¢T’ç&VæFW%&öf–ÆRÒgVæ7F–öâ‚’°¢õ÷&VæFW%&öf–ÆUc3b‚“°¢–æ¦V7E&öf–ÆTÆö6F–öåc3b‚“°¢Ó°¢gVæ7F–öâ–æ¦V7E&öf–ÆTÆö6F–öåc3b‚’°¢6öç7B&ö÷BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖ6öçFVçBr“°¢–b‚&ö÷BÇÂ&ö÷BçVW'•6VÆV7F÷"‚rç&öf–ÆR×'G2ÖÆö6F–öâÖ6&B×c3br’’&WGW&ã°¢6öç7BW6W"Òæ7W'&VçEW6W"ÇÂç7FFRçW6W'3òå´æ7W'&VçEW6W$–EÒÇÂ·Ó°¢6öç7BÖÒ$Tt”ôåôÔ5õc3e·W6W"æ7W'&VçE&Vv–öä–BÇÂruÓ°¢6öç7B6†—Ò4„•5õc3e·W6W"æ7W'&VçE6†—–BÇÂruÓ°¢6öç7BÆæWBÒÄäUE5·W6W"æ7W'&VçEÆæWD–BÇÂÖòçÆæWD–BÇÂ6†—òæ7W'&VçEÆæWD–BÇÂruÓ°¢6öç7B‡FÖÂÒÆF—b6Æ73Ò&6&B&öf–ÆRÖ6&B&öf–ÆR×'G2ÖÆö6F–öâÖ6&B×c3b#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
-]­=]Rýí½ím]ÝSÂöF—cà¢ÆF—b6Æ73Ò&FF×&÷r#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#í	ý½Ý]-Â÷7ããÇ7â6Æ73Ò&FF×fÇVR#âG¶W62‡ÆæWCòææÖRÇÂ~(	Br—ÓÂ÷7ããÂöF—cà¢ÆF—b6Æ73Ò&FF×&÷r#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#í
]=íÒò=ííCÂ÷7ããÇ7â6Æ73Ò&FF×fÇVR#âG¶W62†ÖòææÖRÇÂ~(	Br—ÓÂ÷7ããÂöF—cà¢ÆF—b6Æ73Ò&FF×&÷r#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#í	­í½ÃÂ÷7ããÇ7â6Æ73Ò&FF×fÇVR#âG¶W62‡6†—òææÖRÇÂ~(	Br—ÒG·6†—òæÖöFVÂò+rG¶W62‡6†—æÖöFVÂ—Ö¢rwÓÂ÷7ããÂöF—cà¢G·6†—òÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
-íý½-âG´çVÖ&W"‡6†—ægVVÂÇÂ’çFôf—†VBƒ—ÒòG´çVÖ&W"‡6†—ægVVÄ66—G’ÇÂ’çFôf—†VBƒ—Ò+r­íí-ÂG·6†—7VVEc3b‡6†—’çFôf—†VBƒ—ÓÂöF—cæ¢rwÐ¢G¶Öbb6ä÷Vå&Vv–öäÖc3b†ÖÂW6W"’òÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖ÷Vâ×&Vv–öâÖÖÒ"G¶W62†Öæ–B—Ò"7G–ÆSÒ&Ö&v–â×F÷£‚#í	í
-	­

½
-
Â	­	

-
3Âö'WGFöãæ¢sÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR"7G–ÆSÒ&Ö&v–â×F÷£‚#í	­-Mí-=ýÝÂ­í=Mý]íÝbÝ]íM-ò"]=íÝRãÂöF—câwÐ¢ÂöF—cæ°¢&ö÷Bæ–ç6W'DF¦6VçD…DÔÂ‚vgFW&&Vv–ârÂ‡FÖÂ“°¢&–æE'G5&Vv–öä'WGFöç5c3b‡&ö÷B“°¢Ð ¢v–æF÷rå&Vv–öäÖ5c3bÒ°¢÷Vã¢÷Vå&Vv–öäÖc3bÀ¢÷VäÆVv7“¢÷Vå&Vv–öäÖc3bÀ¢6Æ÷6TÆVv7“¢6Æ÷6U&Vv–öäÖc3bÀ¢W'6—7C¢W'6—7E&Vv–öç56†—5c3bÀ¢Ö3¢‚’Óâ$Tt”ôåôÔ5õc3bÀ¢6†—3¢‚’Óâ4„•5õc3bÀ¢Ö—76–ÆW3¢‚’ÓâÔ•54”ÄU5õc3bÀ¢&F'3¢‚’Óâ$D%5õc3bÀ¢æ÷&ÖÆ—¦TÖ¢æ÷&ÖÆ—¦U&Vv–öäÖc3bÀ¢æ÷&ÖÆ—¦UFö¶Vã¢æ÷&ÖÆ—¦U&Vv–öåFö¶Våc3bÀ¢æ÷&ÖÆ—¦TÖ&¶W#¢æ÷&ÖÆ—¦U&Vv–öäÖ&¶W%c3bÀ¢æ÷&ÖÆ—¦U6†—¢æ÷&ÖÆ—¦U6†—c3bÀ¢æ÷&ÖÆ—¦TÖ—76–ÆS¢æ÷&ÖÆ—¦TÖ—76–ÆUc3bÀ¢æ÷&ÖÆ—¦U&F#¢æ÷&ÖÆ—¦U&F%c3bÀ¢7W'&VçE÷6—F–öã¢7W'&VçEFö¶Vå÷6—F–öåc3bÀ¢6WGFÆUFö¶Vã¢6WGFÆU&Vv–öåFö¶Våc3bÀ¢6WGFÆTÆÃ¢6WGFÆTÆÅ&Vv–öåFö¶Vç5c3bÀ¢Æ—fU6†—¢Æ—fU6†—f÷%Fö¶Våc3bÀ¢Æ—fTgVVÃ¢Æ—fTgVVÅc3bÀ¢6†—7VVC¢6†—7VVEc3bÀ¢6†—gVVÅ&ævS¢6†—gVVÅ&ævUc3bÀ¢6†—&ævTg&öÔgVVÃ¢6†—&ævTg&öÔgVVÅc3bÀ¢&F$–æfó¢Fö¶Vå&F$–æfõc3bÀ¢Æ–W%f–Wu6÷W&6W3¢Æ–W%f–Wu6÷W&6W5c3bÀ¢Æ–W%&F$6öçF7G3¢Æ–W%&F$6öçF7G5c3bÀ¢f—6–&ÆUFö¶Vã¢f—6–&ÆU&Vv–öåFö¶Våc3bÀ¢Ö—76–ÆU7V3¢vWDÖ—76–ÆU7V5c3bÀ¢7F'DÖ÷fS¢7F'E&Vv–öåFö¶VäÖ÷fUc3bÀ¢7F÷Ö÷fS¢7F÷&Vv–öåFö¶VäÖ÷fUc3bÀ¢ÆVæ6„Ö—76–ÆS¢ÆVæ6„Ö—76–ÆUc3bÀ¢WFFTÖ—76–ÆW3¢WFFTÖ—76–ÆW5c3bÀ¢&VæFW$fös¢&VæFW$föuc3bÀ¢6†÷töäF—7Æ“¢6†÷u&Vv–öäÖöäF—7Æ•c3bÀ¢7F—fFR†Ö–B’°¢6öç7BÖÒ$Tt”ôåôÔ5õc3e¶Ö–EÓ°¢–b‚Ö’&WGW&âfÇ6S°¢%E5õ$Tt”ôåõT•õc3bæÖ–BÒÖæ–C°¢6öç7B'VçF–ÖRÒvWE&Vv–öå'VçF–ÖUc3b‚“°¢'VçF–ÖRæ7F—fTÖ–BÒÖæ–C°¢'VçF–ÖRçWFFVDBÒæ÷t—6õc3b‚“°¢&WGW&âG'VS°¢ÒÀ¢6WE6VÆV7FVEFö¶Vâ†–BÒrr’²%E5õ$Tt”ôåõT•õc3bç6VÆV7FVEFö¶Vä–BÒ7G&–ær†–BÇÂrr“²ÒÀ¢6WDÖöFR†ÖöFRÒwÆ’r’²%E5õ$Tt”ôåõT•õc3bæÖöFRÒÖöFRÓÓÒvVF—BròvVF—Br¢wÆ’s²ÒÀ¢6WDföu&Wf–Wr‡fÇVR’²%E5õ$Tt”ôåõT•õc3bæföu&Wf–WrÒ&ööÆVâ‡fÇVR“²ÒÀ¢6WDÖ—76–ÆUG—R‡fÇVR’²%E5õ$Tt”ôåõT•õc3bæÖ—76–ÆUG—RÒ7G&–ær‡fÇVRÇÂv†VBr“²ÒÀ¢6WEF–ÖU66ÆS¢6WE&Vv–öåF–ÖU66ÆUc3bÀ¢vWEF–ÖU66ÆS¢‚’ÓâçVÖ&W"…%E5õ$Tt”ôåõT•õc3bçF–ÖU66ÆRóò’À¢vWE'VçF–ÖS¢‚’Óâ%E5õ$Tt”ôåõT•õc3bÀ¢6ä÷Vã¢6ä÷Vå&Vv–öäÖc3bÀ¢VWVTF—7Æ“¢VWVU&Vv–öäF—7Æ”Ö—'&÷%c3`¢Ó°§Ò’‚“° ¢ò¢ccB÷cããƒ’DUbWFöÖF–öã¢6—FR&VÆV6RÂvV"FWÆ÷’æB6ÆVâ6÷W&6R&6†—fR¢ð¢†gVæ7F–öâ‚—°¢–b‡v–æF÷råõöFWd÷5&öf–ÆUæVÅccB’&WGW&ã°¢v–æF÷råõöFWd÷5&öf–ÆUæVÅccBÒG'VS° ¢6öç7BFWd÷57FFUccBÒ°¢7FGW3¢çVÆÂÀ¢'W7“¢fÇ6RÀ¢&Vg&W6…&öÖ—6S¢çVÆÂÀ¢&VÆV6U&öw&W74&÷VæC¢fÇ6P¢Ó° ¢gVæ7F–öâ—4FÔFWd÷5W6W%ccB‚’°¢6öç7B&öÆRÒ7G&–ær„òæ7W'&VçEW6W#òç&öÆRÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢&WGW&â&öÆRÓÓÒvvÒrÇÂ&öÆRÓÓÒvFÒrÇÂ&öÆRÓÓÒvÖ7FW"s°¢Ð ¢gVæ7F–öâ7W'&VçDFWd÷5&öÆUccB‚’°¢&WGW&â7G&–ær„òæ7W'&VçEW6W#òç&öÆRÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢Ð ¢gVæ7F–öâW66TFWd÷5ccB‡fÇVR’°¢&WGW&â7G&–ær‡fÇVRóòrr’ç&WÆ6R‚õ²cÃâ"uÒörÂ6†"Óâ‡°¢rbs¢rf×²rÂsÂs¢rfÇC²rÂsâs¢rfwC²rÂr"s¢rgV÷C²rÂ"r#¢rb33“²p¢Õ¶6†%Ò’“°¢Ð ¢gVæ7F–öâf÷&ÖD'—FW4FWd÷5ccB‡fÇVR’°¢6öç7B'—FW2ÒçVÖ&W"‡fÇVRÇÂ“°¢–b‚çVÖ&W"æ—4f–æ—FR†'—FW2’ÇÂ'—FW2ÃÒ’&WGW&âs	s°¢–b†'—FW2Â#B’&WGW&âG¶'—FW7Ò	°¢–b†'—FW2Â#B¢#B’&WGW&âG²†'—FW2ò#B’çFôf—†VBƒ—Ò	­	°¢&WGW&âG²†'—FW2ò#Bò#B’çFôf—†VBƒ—Ò	Í	°¢Ð ¢gVæ7F–öâ&VÖ÷fTFWd÷5æVÅccB‚’°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚vFWf÷2×&öf–ÆR×æVÂ×ccBr“òç&VÖ÷fR‚“°¢Ð ¢gVæ7F–öâvWDFWd÷5æVÅccB‚’°¢&WGW&âFö7VÖVçBævWDVÆVÖVçD'”–B‚vFWf÷2×&öf–ÆR×æVÂ×ccBr“°¢Ð ¢gVæ7F–öâVç7W&TFWd÷5æVÅccB‚’°¢–b‚—4FÔFWd÷5W6W%ccB‚’’°¢&VÖ÷fTFWd÷5æVÅccB‚“°¢&WGW&âçVÆÃ°¢Ð¢6öç7Bf÷&ÒÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖVF—BÖf÷&Òr“°¢–b‚f÷&Ò’&WGW&âçVÆÃ°¢ÆWBæVÂÒvWDFWd÷5æVÅccB‚“°¢–b‡æVÂ’&WGW&âæVÃ°¢æVÂÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“°¢æVÂæ–BÒvFWf÷2×&öf–ÆR×æVÂ×ccBs°¢æVÂæ6Æ74æÖRÒv6&BC‚FWf÷2×&öf–ÆR×æVÂ×ccBs°¢æVÂæ–ææW$…DÔÂÒ ¢ÆF—b6Æ73Ò&FWf÷2×&öf–ÆRÖ†VB×ccB#à¢ÆF—cà¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#äDUc¢í­‚ý=½­móÂöF—cà¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FRFWf÷2×7FGW2×7VÖÖ'’×ccB#í	ýí-]­í}]=âí­=m]Ýþ(
cÂöF—cà¢ÂöF—cà¢Ç7â6Æ73Ò&FWf÷2Ö&FvR×ccB#äDUb²	M	ÃÂ÷7ãà¢ÂöF—cà¢ÆF—b6Æ73Ò&FWf÷2Öw&–B×ccB#à¢ÆF—cãÇ7ãí	-]óÂ÷7ããÆ"FFÖFWf÷2Öf–VÆCÒ'fW'6–öâ#î(	CÂö#ãÂöF—cà¢ÆF—cãÇ7ãí
½]M=íóÂ÷7ããÆ"FFÖFWf÷2Öf–VÆCÒ&æW‡EfW'6–öâ#î(	CÂö#ãÂöF—cà¢ÆF—cãÇ7ãí
=-Ýí-£Â÷7ããÆ"FFÖFWf÷2Öf–VÆCÒ&–ç7FÆÆW$Æ–2#î(	CÂö#ãÂöF—cà¢ÆF—cãÇ7ãí	­-½í2]-]Â÷7ããÆ"FFÖFWf÷2Öf–VÆCÒ'&VÆV6UF&vWB#î(	CÂö#ãÂöF—cà¢ÆF—cãÇ7ãí	½í­½ÍÝ½R}Í]Ý]Ý“Â÷7ããÆ"FFÖFWf÷2Öf–VÆCÒ&6†ævT6÷VçB#ãÂö#ãÂöF—cà¢ÆF—cãÇ7ãí	­Ý²íÝí-½]Ý“Â÷7ããÆ"FFÖFWf÷2Öf–VÆCÒ'V&Æ–5W&Â#î(	CÂö#ãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò'&÷rFWf÷2Ö7F–öç2×ccB#à¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ&'WGFöâ"FFÖFWf÷2Ö7F–öãÒ'V&Æ—6‚#í
	í	
	
-
Â	‚	í	ý
=		½		­	í	-	
-
Â	ý	£Âö'WGFöãà¢Æ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖFWf÷2Ö7F–öãÒ&FWÆ÷’×vV"#í	M	]	ý	½	í	’tT#Âö'WGFöãà¢Æ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FFÖFWf÷2Ö7F–öãÒ&&6†—fR#å¤•	M	½
ò	ý	]
	]	M	
}	ƒÂö'WGFöãà¢Æ'WGFöâ6Æ73Ò&v†÷7B"G—SÒ&'WGFöâ"FFÖFWf÷2Ö7F–öãÒ'&Vg&W6‚#í	í		Ý	í	-	
-
Â

-	
-
=
Âö'WGFöãà¢ÂöF—cà¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FRFWf÷2Ö†VÇ×ccB#à¢	­Ýíý­-Ý-]"½í­½ÍÝ=â‚]-]Ý=â-]‚Âý‚Ý]í]íMÍí-‚ýí-½]"F6‚Âí]"å4•2‚}==m]"=-Ýí-¢ÆFW7Bç–ÖÂÝ"âÆFW7Bç–ÖÂý=½­=]-òýí½]MÝÂÂýíÝ-íÍ2Ý]}-]ÝÝò}==}­ÝRí­ý-"=í­ÂÝí-=â-]ââv—D‡V"M½ò-½ý=­ÝRýí½Í}=]-òà¢ÂöF—cà¢Ç&R6Æ73Ò&FWf÷2Ö÷WGWB×ccB"&–ÖÆ—fSÒ'öÆ—FR#í	ímMÝR­íÍÝM²ãÂ÷&Sà¢°¢6öç7Bæ6†÷"ÒFö7VÖVçBævWDVÆVÖVçD'”–B‚wWFFW"×&öf–ÆR×æVÂr’ÇÂf÷&Ó°¢æ6†÷"æ–ç6W'DF¦6VçDVÆVÖVçB‚vgFW&VæBrÂæVÂ“°¢&–æDFWd÷5æVÅccB‡æVÂ“°¢&WGW&âæVÃ°¢Ð ¢gVæ7F–öâ6WDFWd÷4÷WGWEccB†ÖW76vRÂ¶–æBÒrr’°¢6öç7BæVÂÒvWDFWd÷5æVÅccB‚“°¢6öç7B÷WGWBÒæVÃòçVW'•6VÆV7F÷"‚ræFWf÷2Ö÷WGWB×ccBr“°¢–b‚÷WGWB’&WGW&ã°¢÷WGWBæ6Æ74æÖRÒFWf÷2Ö÷WGWB×ccBG¶¶–æBò—2ÒG¶¶–æGÖ¢rwÖçG&–Ò‚“°¢÷WGWBçFW‡D6öçFVçBÒ7G&–ær†ÖW76vRÇÂrr“°¢Ð ¢gVæ7F–öâ6WDFWd÷4'W7•ccB†'W7’ÂÆ&VÂÒrr’°¢FWd÷57FFUccBæ'W7’Ò&ööÆVâ†'W7’“°¢6öç7BæVÂÒvWDFWd÷5æVÅccB‚“°¢æVÃòçVW'•6VÆV7F÷$ÆÂ‚u¶FFÖFWf÷2Ö7F–öåÒr’æf÷$V6‚†'WGFöâÓâ°¢'WGFöâæF—6&ÆVBÒFWd÷57FFUccBæ'W7“°¢Ò“°¢–b†'W7’bbÆ&VÂ’6WDFWd÷4÷WGWEccB†Æ&VÂÂv'W7’r“°¢Ð ¢gVæ7F–öâWFFTFWd÷5æVÅccB‡7FGW2Ò·Ò’°¢FWd÷57FFUccBç7FGW2Ò7FGW3°¢–b‚—4FÔFWd÷5W6W%ccB‚’’°¢&VÖ÷fTFWd÷5æVÅccB‚“°¢&WGW&ã°¢Ð¢6öç7BæVÂÒVç7W&TFWd÷5æVÅccB‚“°¢–b‚æVÂ’&WGW&ã°¢6öç7B6WDf–VÆBÒ†æÖRÂfÇVR’Óâ°¢6öç7BæöFRÒæVÂçVW'•6VÆV7F÷"†¶FFÖFWf÷2Öf–VÆCÒ"G¶æÖWÒ%Ö“°¢–b†æöFR’æöFRçFW‡D6öçFVçBÒ7G&–ær‡fÇVRóò~(	Br“°¢Ó°¢6WDf–VÆB‚wfW'6–öârÂ7FGW2çfW'6–öâÇÂ~(	Br“°¢6WDf–VÆB‚væW‡EfW'6–öârÂ7FGW2ææW‡EfW'6–öâÇÂ~(	Br“°¢6WDf–VÆB‚v–ç7FÆÆW$Æ–2rÂ7FGW2æ–ç7FÆÆW$Æ–2ÇÂ~(	Br“°¢6WDf–VÆB‚w&VÆV6UF&vWBrÂ7FGW2ç&VÆV6UF&vWBÇÂ~(	Br“°¢6WDf–VÆB‚v6†ævT6÷VçBrÂçVÖ&W"‡7FGW2æ6†ævT6÷VçBÇÂ’“°¢6WDf–VÆB‚wV&Æ–5W&ÂrÂ7FGW2çV&Æ–5W&ÂÇÂ~(	Br“°¢6öç7B7VÖÖ'’ÒæVÂçVW'•6VÆV7F÷"‚ræFWf÷2×7FGW2×7VÖÖ'’×ccBr“°¢–b‡7VÖÖ'’’°¢6öç7BFööÅ7FFRÒ·7FGW2çFööÇ3òæçÓòæf–Æ&ÆRòvçÒô²r¢vçÒÝ]"rÂ7FGW2çFööÇ3òç76ƒòæf–Æ&ÆRòu54‚ô²r¢u54‚Ý]"rÂ7FGW2çFööÇ3òç67òæf–Æ&ÆRòu45ô²r¢u45Ý]"uÒæ¦ö–â‚r+rr“°¢7VÖÖ'’çFW‡D6öçFVçBÒG·7FGW2æÖW76vRÇÂ}	=í-í-âwÒ+rG·FööÅ7FFWÖ°¢Ð¢6öç7BV&Æ—6„'WGFöâÒæVÂçVW'•6VÆV7F÷"‚u¶FFÖFWf÷2Ö7F–öãÒ'V&Æ—6‚%Òr“°¢–b‡V&Æ—6„'WGFöâ’V&Æ—6„'WGFöâæF—6&ÆVBÒFWd÷57FFUccBæ'W7’ÇÂ7FGW2æf–Æ&ÆS°¢Ð ¢7–æ2gVæ7F–öâ&Vg&W6„FWd÷57FGW5ccB†÷F–öç2Ò·Ò’°¢–b‚—4FÔFWd÷5W6W%ccB‚’’°¢&VÖ÷fTFWd÷5æVÅccB‚“°¢&WGW&âçVÆÃ°¢Ð¢Vç7W&TFWd÷5æVÅccB‚“°¢–b‚v–æF÷ræVÆV7G&öä“òævWDFWd÷57FGW2’°¢6öç7BVæf–Æ&ÆRÒ°¢ö³¢fÇ6RÀ¢f–Æ&ÆS¢fÇ6RÀ¢&V6öã¢v—2×Væf–Æ&ÆRrÀ¢ÖW76vS¢tDUb’Ý]Mí-=ý]Òâ	ý]]}ý=--R]íMÝ=âFW6·F÷Ýí­2âp¢Ó°¢WFFTFWd÷5æVÅccB‡Væf–Æ&ÆR“°¢6WDFWd÷4÷WGWEccB‡Væf–Æ&ÆRæÖW76vRÂvW'&÷"r“°¢&WGW&âVæf–Æ&ÆS°¢Ð¢–b†FWd÷57FFUccBç&Vg&W6…&öÖ—6R’&WGW&âFWd÷57FFUccBç&Vg&W6…&öÖ—6S°¢FWd÷57FFUccBç&Vg&W6…&öÖ—6RÒv–æF÷ræVÆV7G&öä’ævWDFWd÷57FGW2†7W'&VçDFWd÷5&öÆUccB‚’¢çF†Vâ‡7FGW2Óâ°¢WFFTFWd÷5æVÅccB‡7FGW2ÇÂ·Ò“°¢–b†÷F–öç2ç6†÷t÷WGWBbb7FGW3òæö²’°¢6öç7BÆ–æW2Ò°¢
]-]¢G·7FGW2ç&VÆV6UF&vWBÇÂ~(	BwÖÀ¢	­Ý³¢G·7FGW2çV&Æ–5W&ÂÇÂ~(	BwÖÀ¢	-]ó¢G·7FGW2çfW'6–öâÇÂ~(	BwÒ(i"G·7FGW2ææW‡EfW'6–öâÇÂ~(	BwÖÀ¢	½í­½ÍÝ½R}Í]Ý]Ý“¢G´çVÖ&W"‡7FGW2æ6†ævT6÷VçBÇÂ—Ö ¢Ó°¢6WDFWd÷4÷WGWEccB†Æ–æW2æ¦ö–â‚uÆâr’Â7FGW2æf–Æ&ÆRòvö²r¢vW'&÷"r“°¢Ð¢&WGW&â7FGW3°¢Ò¢æ6F6‚†W'&÷"Óâ°¢6öç7BVæf–Æ&ÆRÒ°¢ö³¢fÇ6RÀ¢f–Æ&ÆS¢fÇ6RÀ¢&V6öã¢w7FGW2Öf–ÆVBrÀ¢ÖW76vS¢	ÝR=M½íÂýí-]-ÂDUbÝí­=m]ÝS¢G¶W'&÷#òæÖW76vRÇÂW'&÷'Ö ¢Ó°¢WFFTFWd÷5æVÅccB‡Væf–Æ&ÆR“°¢6WDFWd÷4÷WGWEccB‡Væf–Æ&ÆRæÖW76vRÂvW'&÷"r“°¢–b†÷F–öç2ç6†÷t÷WGWB’Fö7Bç6†÷r†DUbÝÝ-=Í]Ý-³¢G¶W'&÷#òæÖW76vRÇÂW'&÷'ÖÂvW'"r“°¢&WGW&âVæf–Æ&ÆS°¢Ò¢æf–æÆÇ’‚‚’Óâ²FWd÷57FFUccBç&Vg&W6…&öÖ—6RÒçVÆÃ²Ò“°¢&WGW&âFWd÷57FFUccBç&Vg&W6…&öÖ—6S°¢Ð ¢gVæ7F–öâ&W7VÇDW'&÷%FW‡EccB‡&W7VÇB’°¢&WGW&â·&W7VÇCòæÖW76vRÂ&W7VÇCòç7FFW'"Â&W7VÇCòç7FF÷WEÒæf–ÇFW"„&ööÆVâ’æ¦ö–â‚uÆâr’çG&–Ò‚’ÇÂ}	Ý]}-]-Ýòí­s°¢Ð ¢gVæ7F–öâ&–æE&VÆV6U&öw&W75cƒ’‚’°¢–b†FWd÷57FFUccBç&VÆV6U&öw&W74&÷VæBÇÂv–æF÷ræVÆV7G&öä“òæöäFWe&VÆV6U&öw&W72’&WGW&ã°¢FWd÷57FFUccBç&VÆV6U&öw&W74&÷VæBÒG'VS°¢v–æF÷ræVÆV7G&öä’æöäFWe&VÆV6U&öw&W72‡&öw&W72Óâ°¢–b‚&öw&W73òæÖW76vR’&WGW&ã°¢6WDFWd÷4÷WGWEccB‡&öw&W72æÖW76vRÂ&öw&W72ç7FvRÓÓÒvW'&÷"ròvW'&÷"r¢&öw&W72ç7FvRÓÓÒvFöæRròvö²r¢v'W7’r“°¢Ò“°¢Ð ¢7–æ2gVæ7F–öâV&Æ—6…F6…ccB‚’°¢6öç7B7FGW2Òv—B&Vg&W6„FWd÷57FGW5ccB‚“°¢–b‚7FGW3òæf–Æ&ÆR’&WGW&ã°¢6öç7B6öæf—&ÖVBÒv—B&WVW7D6öæf—&ÖF–öåc“€¢
í-Â‚íý=½­í--ÂG·7FGW2çfW'6–öçÒ(i"G·7FGW2ææW‡EfW'6–öçÓõÆåÆæ°¢	=M]"íÒÝí-½’v–æF÷w2Ý=-Ýí-¢‚}==m]Ò"G·7FGW2ç&VÆV6UF&vWGÒåÆæ°¢	ýí-]­íÝí-½]Ý’ý]]­½í}-òÝG·7FGW2çV&Æ–5W&ÇÒåÆåÆæ°¢	íý]mòÍím]"}Ýý-ÂÝ]­í½Í­âÍÝ="â	ÝR}­½--Rý½ím]ÝRMâýíM--]mM]Ýòý=½­m‚æ ¢“°¢–b‚6öæf—&ÖVB’&WGW&ã°¢6WDFWd÷4'W7•ccB‡G'VRÂ	ýíM=í-í-­í­‚bG·7FGW2ææW‡EfW'6–öçÞ(
f“°¢G'’°¢6öç7B&W7VÇBÒv—Bv–æF÷ræVÆV7G&öä“òçV&Æ—6„FWd–ç7FÆÆW#òâ†7W'&VçDFWd÷5&öÆUccB‚’“°¢–b‚&W7VÇCòæö²’°¢6WDFWd÷4÷WGWEccB‡&W7VÇDW'&÷%FW‡EccB‡&W7VÇB’ÂvW'&÷"r“°¢Fö7Bç6†÷r‚}	ý=½­mò=-Ýí-­}-]½Âí­í’rÂvW'"r“°¢&WGW&ã°¢Ð¢6öç7Bv&æ–æw2Ò‡&W7VÇBæ†VÇF…v&æ–æw2ÇÂµÒ’æÖ†—FVÒÓâG¶—FVÒçW&ÇÓ¢G¶—FVÒç7FGW5FW‡BÇÂ…EEG¶—FVÒç7FGW2ÇÂÖÖ“°¢6WDFWd÷4÷WGWEccB€¢
=-Ýí-¢íý=½­í-ÒåÆí	-]ó¢G·&W7VÇBçfW'6–öçÕÆí
#¢G·&W7VÇBæ–ç7FÆÆW%W&ÇÕÆí	ÍÝM]#¢G·&W7VÇBçWFFTÖæ–fW7EW&ÇÕÆí
M½í#¢G·&W7VÇBæf–ÆW3òæÆVæwF‚ÇÂÒG·v&æ–æw2æÆVæwF‚òÆí	ý]M=ý]mM]Ýòýí-]­ƒ¥ÆâG·v&æ–æw2æ¦ö–â‚uÆâr—Ö¢rwÖÀ¢v&æ–æw2æÆVæwF‚òvW'&÷"r¢vö²p¢“°¢Fö7Bç6†÷r†	-]òG·&W7VÇBçfW'6–öçÒíý=½­í-ÝÝ-VÂvö²r“°¢Òf–æÆÇ’°¢6WDFWd÷4'W7•ccB†fÇ6R“°¢v—B&Vg&W6„FWd÷57FGW5ccB‚“°¢Ð¢Ð ¢7–æ2gVæ7F–öâFWÆ÷•vV%ccB‚’°¢6öç7B6öæf—&ÖVBÒv—B&WVW7D6öæf—&ÖF–öåc“€¢}	}M]ý½í-ÂíM]mÍíRFWÆ÷’÷6—FRÝ&ö÷DcãBã3Rã“S¢÷f"÷wwröw'rÖõÆåÆâr°¢}	­-½í2F÷væÆöG2=M]"í]ÝÒâ	í-­"-½ýí½Ýý]-ò-í½Í­âý‚í­R}==}­‚½‚ýí-]mMÝÝ½RM½S²…EEÝýí-]­ýí½Rý=½­m‚Ýí"M=Ýí-}]­’]­-]âp¢“°¢–b‚6öæf—&ÖVB’&WGW&ã°¢6WDFWd÷4'W7•ccB‡G'VRÂ}	}==}­vV"Ý-]‚Ý]-](
br“°¢G'’°¢6öç7B&W7VÇBÒv—Bv–æF÷ræVÆV7G&öä“òæFWÆ÷”FWevV#òâ†7W'&VçDFWd÷5&öÆUccB‚’“°¢–b‚&W7VÇCòæö²’°¢6WDFWd÷4÷WGWEccB‡&W7VÇDW'&÷%FW‡EccB‡&W7VÇB’ÂvW'&÷"r“°¢Fö7Bç6†÷r‚uvV"ÝM]ý½í’}-]½òí­í’rÂvW'"r“°¢&WGW&ã°¢Ð¢6öç7B†VÇF„Æ–æW2Ò‡&W7VÇBæ†VÇF„6†V6·2ÇÂµÒ’æÖ†—FVÒÓâ°¢6öç7B6öFRÒçVÖ&W"†—FVÒç7FGW2ÇÂ“°¢6öç7BÆ&VÂÒ—FVÒæö²òtô²r¢ut$âs°¢&WGW&âG¶Æ&VÇÒG¶—FVÒçW&ÇÒG¶6öFRò…EEG¶6öFWÖ¢†—FVÒç7FGW5FW‡BÇÂ}Ý]"í--]-r—Ö°¢Ò“°¢6öç7B†5v&æ–æw2Ò&ööÆVâ‚‡&W7VÇBæ†VÇF…v&æ–æw2ÇÂµÒ’æÆVæwF‚“°¢6WDFWd÷4÷WGWEccB€¢vV"}M]ý½í]Ò=ý]ÝâåÆí	-í}Ý£¢G·&W7VÇBç6÷W&6WÕÆí
]-]¢G·&W7VÇBæVæGö–çGÕÆí	­-½í3¢G·&W7VÇBçF&vWGÕÆí	ýí-]­M½í#¢ôµÆä…EEÝM=Ýí-­ÝR-½}½-]"&öÆÆ&6²“¥ÆâG¶†VÇF„Æ–æW2æ¦ö–â‚uÆâr’ÇÂ}ÝRÝ-í]ÝwÖÀ¢†5v&æ–æw2òrr¢vö²p¢“°¢Fö7Bç6†÷r††5v&æ–æw2òuvV"íý=½­í-Ó²…EEÝýí-]­M½ý]M=ý]mM]ÝRr¢uvV"Ý-]òíý=½­í-ÝrÂ†5v&æ–æw2òv–æfòr¢vö²r“°¢Òf–æÆÇ’°¢6WDFWd÷4'W7•ccB†fÇ6R“°¢Ð¢Ð ¢7–æ2gVæ7F–öâ7&VFT&6†—fUccB‚’°¢6WDFWd÷4'W7•ccB‡G'VRÂ}	ýíM=í-í-­}-í=â¤•]íMÝ­í.(
br“°¢G'’°¢6öç7B&W7VÇBÒv—Bv–æF÷ræVÆV7G&öä“òæ7&VFTFWe6÷W&6T&6†—fSòâ†7W'&VçDFWd÷5&öÆUccB‚’“°¢–b‡&W7VÇCòæ6æ6VÆÆVB’°¢6WDFWd÷4÷WGWEccB‚}
í}MÝR¤•í-Í]Ý]Ýââr“°¢&WGW&ã°¢Ð¢–b‚&W7VÇCòæö²’°¢6WDFWd÷4÷WGWEccB‡&W7VÇDW'&÷%FW‡EccB‡&W7VÇB’ÂvW'&÷"r“°¢Fö7Bç6†÷r‚}	ÝR=M½íÂí}M-Â¤•]íMÝ­í"rÂvW'"r“°¢&WGW&ã°¢Ð¢6WDFWd÷4÷WGWEccB€¢¤•í}MÒåÆâG·&W7VÇBæ÷WGWEF‡ÕÆí
}Í]¢G¶f÷&ÖD'—FW4FWd÷5ccB‡&W7VÇBæ&6†—fU6—¦R—ÕÆí	-­½í}]ÝâM½í#¢G·&W7VÇBæ–æ6ÇVFVD6÷VçGÕÆí	­½í}]Ýã¢G·&W7VÇBæW†6ÇVFVD6÷VçGÖÀ¢vö²p¢“°¢Fö7Bç6†÷r‚}
}-½’¤•]íMÝ­í"í}MÒrÂvö²r“°¢Òf–æÆÇ’°¢6WDFWd÷4'W7•ccB†fÇ6R“°¢Ð¢Ð ¢gVæ7F–öâ&–æDFWd÷5æVÅccB‡æVÂ’°¢–b‡æVÂæFF6WBæFWf÷4&÷VæBÓÓÒsr’&WGW&ã°¢æVÂæFF6WBæFWf÷4&÷VæBÒss°¢æVÂæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ7–æ2WfVçBÓâ°¢6öç7B'WGFöâÒWfVçBçF&vWBæ6Æ÷6W7B‚u¶FFÖFWf÷2Ö7F–öåÒr“°¢–b‚'WGFöâÇÂFWd÷57FFUccBæ'W7’’&WGW&ã°¢6öç7B7F–öâÒ'WGFöâæFF6WBæFWf÷47F–öã°¢–b†7F–öâÓÓÒw&Vg&W6‚r’v—B&Vg&W6„FWd÷57FGW5ccB‡²6†÷t÷WGWC¢G'VRÒ“°¢–b†7F–öâÓÓÒwV&Æ—6‚r’v—BV&Æ—6…F6…ccB‚“°¢–b†7F–öâÓÓÒvFWÆ÷’×vV"r’v—BFWÆ÷•vV%ccB‚“°¢–b†7F–öâÓÓÒv&6†—fRr’v—B7&VFT&6†—fUccB‚“°¢Ò“°¢Ð ¢6öç7Bõ÷&VæFW%&öf–ÆTFWd÷5ccBÒT’ç&VæFW%&öf–ÆRæ&–æB…T’“°¢T’ç&VæFW%&öf–ÆRÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒõ÷&VæFW%&öf–ÆTFWd÷5ccB‚“°¢–b‚—4FÔFWd÷5W6W%ccB‚’’°¢&VÖ÷fTFWd÷5æVÅccB‚“°¢&WGW&â&W7VÇC°¢Ð¢òòF†RæVÂ×W7BW†—7B7–æ6‡&öæ÷W6Ç’â7FGW2F—66÷fW'’—27–æ6‡&öæ÷W2æB¢òòG&ç6–VçB•2÷FööÆ–ærf–ÇW&R×W7BæWfW"Ö¶RF†RV&Æ–6F–öâ6öçG&öÇ2fæ—6‚à¢Vç7W&TFWd÷5æVÅccB‚“°¢–b†FWd÷57FFUccBç7FGW2’WFFTFWd÷5æVÅccB†FWd÷57FFUccBç7FGW2“°¢&Vg&W6„FWd÷57FGW5ccB‚’æ6F6‚‚‚’Óâ·Ò“°¢&WGW&â&W7VÇC°¢Ó° ¢v–æF÷räu%tFWd÷5ccBÒö&¦V7Bæg&VW¦R‡°¢Vç7W&UæVÃ¢Vç7W&TFWd÷5æVÅccBÀ¢&Vg&W6…7FGW3¢&Vg&W6„FWd÷57FGW5cc@¢Ò“° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚tDôÔ6öçFVçDÆöFVBrÂ‚’Óâ°¢&–æE&VÆV6U&öw&W75cƒ’‚“°¢6WEF–ÖV÷WB‚‚’Óâ&Vg&W6„FWd÷57FGW5ccB‚’æ6F6‚‚‚’Óâ·Ò’Â“°¢Ò“°§Ò’‚“°  ¢ò¢cããC’6×–vâW&2Âf–Æ&–Æ—G’æBF†VÖVB–çFW&f6R¢ð¢†gVæ7F–öâ‚—°¢–b‡v–æF÷råõö6×–väW&5F†VÖW5cC’’&WGW&ã°¢v–æF÷råõö6×–väW&5F†VÖW5cC’ÒG'VS° ¢6öç7BU$ôDTe5õcC’Ò°¢²–C¢vÖVF–WfÂrÂæÖS¢}
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
òrÐ¢Ó°¢6öç7BU$ô”E5õcC’ÒæWr6WB„U$ôDTe5õcC’æÖ†—FVÒÓâ—FVÒæ–B’“° ¢gVæ7F–öâVæ—VU7G&–æw5cC’‡fÇVR’°¢&WGW&â'&’æg&öÒ†æWr6WB‚„'&’æ—4'&’‡fÇVR’òfÇVR¢µÒ’æÖ†VçG'’Óâ7G&–ær†VçG'“òæ–BÇÂVçG'“òæ6×–vä–BÇÂVçG'’ÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ’’“°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦TW&cC’‡fÇVR’°¢6öç7B&rÒ7G&–ær‡fÇVRÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢–b„U$ô”E5õcC’æ†2‡&r’’&WGW&â&s°¢–b‚ý]GÆÖVF–WgÆfWVFÇÆæ6–VçBòçFW7B‡&r’’&WGW&âvÖVF–WfÂs°¢–b‚ýÝM=-Æ–æGW7G&–ÇÇ7FV×ÆF–W6VÇÆæÆöròçFW7B‡&r’’&WGW&âv–æGW7G&–Âs°¢&WGW&âwFV6†æöÆöv–6Âs°¢Ð¢gVæ7F–öâW&FVecC’‡fÇVR’°¢6öç7B–BÒæ÷&ÖÆ—¦TW&cC’‡fÇVR“°¢&WGW&âU$ôDTe5õcC’æf–æB†—FVÒÓâ—FVÒæ–BÓÓÒ–B’ÇÂU$ôDTe5õcC•³%Ó°¢Ð¢gVæ7F–öâVæ†æ6T6×–våcC’†6×–vâÒ·ÒÂ&rÒçVÆÂ’°¢6öç7B6÷W&6RÒ&rbbG—Vöb&rÓÓÒvö&¦V7Brò&r¢6×–vã°¢6×–vâæW&Òæ÷&ÖÆ—¦TW&cC’‡6÷W&6RæW&ÇÂ6÷W&6RæWö6‚ÇÂ6÷W&6RçF†VÖRÇÂ6×–vâæW&“°¢–b„ö&¦V7Bç&÷F÷G—Ræ†4÷vå&÷W'G’æ6ÆÂ‡6÷W&6RÂvf–Æ&ÆTæ÷rr’’6×–vâæf–Æ&ÆTæ÷rÒ6÷W&6Ræf–Æ&ÆTæ÷rÓÒfÇ6S°¢VÇ6R–b„ö&¦V7Bç&÷F÷G—Ræ†4÷vå&÷W'G’æ6ÆÂ‡6÷W&6RÂvf–Æ&ÆRr’’6×–vâæf–Æ&ÆTæ÷rÒ6÷W&6Ræf–Æ&ÆRÓÒfÇ6S°¢VÇ6R°¢6öç7B7FGW2Ò7G&–ær‡6÷W&6Rç7FGW2ÇÂ6×–vâç7FGW2ÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢6×–vâæf–Æ&ÆTæ÷rÒ²wVæf–Æ&ÆRrÂvF—6&ÆVBrÂv–æ7F—fRrÂv6Æ÷6VBrÂv&6†—fVBrÂ}Ý]Mí-=ýÝrÂ}Ý]Mí-=ýÝâuÒæ–æ6ÇVFW2‡7FGW2“°¢Ð¢&WGW&â6×–vã°¢Ð¢gVæ7F–öâÆÄ6×–vç5cC’‚’°¢6öç7B6×–vç2Òö&¦V7BçfÇVW2„FFòæ6×–vç2ÇÂ·Ò’æÖ†—FVÒÓâVæ†æ6T6×–våcC’†—FVÒ’“°¢&WGW&â6÷'DVçF—F–W4f÷$Æ—7B†6×–vç2“°¢Ð¢gVæ7F–öâÆ–&ÆT6×–vç5cC’‚’°¢&WGW&âÆÄ6×–vç5cC’‚’æf–ÇFW"†6×–vâÓâ7G&–ær†6×–vâç7FGW2ÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br“°¢Ð¢gVæ7F–öâf–Æ&ÆT6×–vç5cC’‚’°¢&WGW&âÆ–&ÆT6×–vç5cC’‚’æf–ÇFW"†6×–vâÓâ6×–vâæf–Æ&ÆTæ÷rÓÒfÇ6R“°¢Ð¢gVæ7F–öâ6×–vä'”–EcC’†–B’°¢6öç7B6×–vâÒFFòævWD6×–vãòâ†–B’ÇÂFFòæ6×–vç3òå¶–EÒÇÂçVÆÃ°¢&WGW&â6×–vâòVæ†æ6T6×–våcC’†6×–vâ’¢çVÆÃ°¢Ð¢gVæ7F–öâÆ–W$6×–vä–G5cC’‡Æ–W"Ò·Ò’°¢6öç7B–G2ÒVæ—VU7G&–æw5cC’‡Æ–W"æ6×–vä–G2ÇÂÆ–W"æ6×–vç2ÇÂµÒ“°¢–b‡Æ–W"æ6×–vä–B’–G2çW6‚…7G&–ær‡Æ–W"æ6×–vä–B’çG&–Ò‚’“°¢&WGW&â'&’æg&öÒ†æWr6WB†–G2æf–ÇFW"„&ööÆVâ’æÆVæwF‚ò–G2æf–ÇFW"„&ööÆVâ’¢²vÖ–âuÒ’“°¢Ð¢gVæ7F–öâ6VÆV7FVD6×–vä–EcC’‚’°¢6öç7B6VÆV7BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚vÆöv–âÖ6×–vâ×6VÆV7B×ccr“°¢6öç7B7F÷&VBÒ7G&–ær‡6VÆV7CòçfÇVRÇÂÆö6Å7F÷&vRævWD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×cC’r’ÇÂÆö6Å7F÷&vRævWD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×ccr’ÇÂrr’çG&–Ò‚“°¢–b‡7F÷&VBbb6×–vä'”–EcC’‡7F÷&VB“òæf–Æ&ÆTæ÷rÓÒfÇ6Rbb7G&–ær†6×–vä'”–EcC’‡7F÷&VB“òç7FGW2ÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br’&WGW&â7F÷&VC°¢&WGW&âf–Æ&ÆT6×–vç5cC’‚•³Óòæ–BÇÂrs°¢Ð¢gVæ7F–öâ7F—fT6×–våcC’‡W6W"Òòæ7W'&VçEW6W"’°¢6öç7B6VÆV7FVBÒ7G&–ær„æ7F—fT6×–vä–BÇÂ6VÆV7FVD6×–vä–EcC’‚’ÇÂrr’çG&–Ò‚“°¢–b‡6VÆV7FVB’&WGW&â6×–vä'”–EcC’‡6VÆV7FVB“°¢6öç7Bf—'7BÒÆ–W$6×–vä–G5cC’‡W6W"ÇÂ·Ò’æÖ†6×–vä'”–EcC’’æf–æB„&ööÆVâ“°¢&WGW&âf—'7BÇÂf–Æ&ÆT6×–vç5cC’‚•³ÒÇÂçVÆÃ°¢Ð¢gVæ7F–öâÇ”W&F†VÖUcC’†6×–vä÷$W&ÒçVÆÂ’°¢6öç7B6×–vâÒG—Vöb6×–vä÷$W&ÓÓÒvö&¦V7Brbb6×–vä÷$W&òVæ†æ6T6×–våcC’†6×–vä÷$W&’¢çVÆÃ°¢6öç7BW&Òæ÷&ÖÆ—¦TW&cC’†6×–vãòæW&ÇÂ6×–vä÷$W&ÇÂwFV6†æöÆöv–6Âr“°¢6öç7BFVbÒW&FVecC’†W&“°¢Fö7VÖVçBæFö7VÖVçDVÆVÖVçBæFF6WBæW&F†VÖRÒW&°¢G'’²–b†Fö7VÖVçBævWDVÆVÖVçD'”–B‚vvÆ‡’ÖÆVvVæBÖ÷fW&Æ’r’’&VæFW$vÆ‡”ÆVvVæD÷fW&Æ’‚“²Ò6F6‚·Ð¢Fö7VÖVçBæ&öG“òç6WDGG&–'WFR‚vFFÖW&×F†VÖRrÂW&“°¢–b†6×–vãòæ–B’Fö7VÖVçBæFö7VÖVçDVÆVÖVçBæFF6WBæ6×–våF†VÖRÒ6×–vâæ–C°¢VÇ6RFVÆWFRFö7VÖVçBæFö7VÖVçDVÆVÖVçBæFF6WBæ6×–våF†VÖS°¢6öç7B&FvRÒFö7VÖVçBævWDVÆVÖVçD'”–B‚vW&×F†VÖRÖ&FvR×cC’r’ÇÂ‚‚’Óâ°¢6öç7BæöFRÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“°¢æöFRæ–BÒvW&×F†VÖRÖ&FvR×cC’s°¢æöFRæ6Æ74æÖRÒvW&×F†VÖRÖ&FvR×cC’s°¢Fö7VÖVçBæ&öG“òæVæD6†–ÆB†æöFR“°¢&WGW&âæöFS°¢Ò’‚“°¢–b†&FvR’°¢&FvRçFW‡D6öçFVçBÒ
Ý	ý	í
]	¢G¶FVbç6†÷'GÖ°¢&FvRçF—FÆRÒ6×–vãòææÖRò	­ÍýÝó¢G¶6×–vâææÖWÖ¢
-]Í¢G¶FVbææÖWÖ°¢Ð¢G'’²v–æF÷ræVÆV7G&öä“òçWFFUÆ–W$F—7Æ•f–Wsòâ‡²W&F†VÖS¢W&Âw&†–74ÖöFS¢w&†–74ÖöFRæ—4Æ—FR‚’òvÆ—FRr¢vgVÆÂrÂWFFVDC¢æWrFFR‚’çFô•4õ7G&–ær‚’Ò“²Ò6F6‚·Ð¢&WGW&âW&°¢Ð¢v–æF÷räu%t6×–våF†VÖRÒ²Ç“¢Ç”W&F†VÖUcC’ÂW&3¢U$ôDTe5õcC’Â6×–vã¢‚’Óâ7F—fT6×–våcC’‚’Ó° ¢gVæ7F–öâf—6–&–Æ—G•cC’†VçF—G’Ò·Ò’°¢6öç7Bf—2ÒVçF—G’çf—6–&–Æ—G’bbG—VöbVçF—G’çf—6–&–Æ—G’ÓÓÒvö&¦V7BròVçF—G’çf—6–&–Æ—G’¢·Ó°¢&WGW&â°¢Æ–W$–G3¢Væ—VU7G&–æw5cC’‡f—2çÆ–W$–G2ÇÂµÒ’À¢6×–vä–G3¢Væ—VU7G&–æw5cC’‡f—2æ6×–vä–G2ÇÂf—2æ6×–vç2ÇÂµÒ’À¢W&–G3¢Væ—VU7G&–æw5cC’‡f—2æW&–G2ÇÂf—2æWö6‡2ÇÂf—2æW&2ÇÂµÒ’æÖ†æ÷&ÖÆ—¦TW&cC’¢Ó°¢Ð¢gVæ7F–öâÖW&vUf—6–&–Æ—G”g&öÕ&ucC’‡F&vWBÂ&r’°¢–b‚F&vWBÇÂ&rÇÂG—Vöb&rÓÒvö&¦V7Br’&WGW&âF&vWC°¢6öç7B&uf—2Òf—6–&–Æ—G•cC’‡&r“°¢6öç7B7W'&VçBÒf—6–&–Æ—G•cC’‡F&vWB“°¢F&vWBçf—6–&–Æ—G’Ò°¢âââ‡F&vWBçf—6–&–Æ—G’ÇÂ·Ò’À¢Æ–W$–G3¢7W'&VçBçÆ–W$–G2À¢6×–vä–G3¢&uf—2æ6×–vä–G2æÆVæwF‚ò&uf—2æ6×–vä–G2¢7W'&VçBæ6×–vä–G2À¢W&–G3¢&uf—2æW&–G2æÆVæwF‚ò&uf—2æW&–G2¢7W'&VçBæW&–G0¢Ó°¢&WGW&âF&vWC°¢Ð¢gVæ7F–öâW&6VÆV7F÷$Ö&·WcC’‡6VÆV7FVD–G2ÒµÒ’°¢6öç7B6VÆV7FVBÒVæ—VU7G&–æw5cC’‡6VÆV7FVD–G2’æÖ†æ÷&ÖÆ—¦TW&cC’“°¢&WGW&âÆF—b6Æ73Ò&W&Ö66W72Öw&–B×cC’#âG´U$ôDTe5õcC’æÖ†W&ÓâÆÆ&VÂ6Æ73Ò&W&Ö66W72Ö÷F–öâ×cC’#ãÆ–çWBG—SÒ&6†V6¶&÷‚"æÖSÒ'f—6–&–Æ—G”W&–G2"fÇVSÒ"G¶W&æ–GÒ"G·6VÆV7FVBæ–æ6ÇVFW2†W&æ–B’òv6†V6¶VBr¢rwÒóãÇ7â6Æ73Ò&W&Ö66W72Ö–6öâ×cC’#âG¶W&æ–BÓÓÒvÖVF–WfÂrò~)Êbr¢W&æ–BÓÓÒv–æGW7G&–Ârò~)©’r¢~(É‚wÓÂ÷7ããÇ7ããÆ#âG¶W62†W&ææÖR—ÓÂö#ãÇ6ÖÆÃâG¶W&æ–GÓÂ÷6ÖÆÃãÂ÷7ããÂöÆ&VÃæ’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð¢gVæ7F–öâ6×–vä66W74Ö&·WcC’‡6VÆV7FVD–G2ÒµÒ’°¢6öç7B&÷w2ÒÆ–&ÆT6×–vç5cC’‚“°¢&WGW&â&VæFW$6†V6¶&÷…6VÆV7F÷"‚wf—6–&–Æ—G”6×–vä–G2rÂ&÷w2ÂVæ—VU7G&–æw5cC’‡6VÆV7FVD–G2’Âv6×–vârÂ}	=í-½R­ÍýÝ’ýí­Ý]"r“°¢Ð ¢6öç7BõöÇ•v÷&ÆDFFcC’ÒÇ•v÷&ÆDFF°¢Ç•v÷&ÆDFFÒgVæ7F–öâ‡–ÆöBÒ·Ò’°¢6öç7B&t6×–vç2Ò–ÆöCòæ6×–vç3òä4Õ”tå2bbG—Vöb–ÆöBæ6×–vç2ä4Õ”tå2ÓÓÒvö&¦V7Brò–ÆöBæ6×–vç2ä4Õ”tå2¢·Ó°¢6öç7B&W7VÇBÒõöÇ•v÷&ÆDFFcC’‡–ÆöB“°¢ö&¦V7BæVçG&–W2„FFòæ6×–vç2ÇÂ·Ò’æf÷$V6‚‚…¶–BÂ6×–våÒ’ÓâVæ†æ6T6×–våcC’†6×–vâÂ&t6×–vç5¶–EÒÇÂ6×–vâ’“° ¢òò6WfW&ÂöÆFW"æ÷&ÖÆ—¦W'2–çFVçF–öæÆÇ’6÷–VBöæÇ’Æ–W$–G2â&W7F÷&RF†RæWp¢òò66W72F–ÖVç6–öç2g&öÒF†R&r–ÆöBgFW"ÆÂÆVv7’æ÷&ÖÆ—¦W'2†fR'Vâà¢6öç7B&W7F÷&TÖÒ†FF¶W’Â6V7F–öäæÖRÂÖ¶W’’Óâ°¢6öç7B7F÷&RÒFFòå¶FF¶W•Ó°¢6öç7B&rÒ–ÆöCòå·6V7F–öäæÖUÓòå¶Ö¶W•Ó°¢–b‚7F÷&RÇÂ&rÇÂG—Vöb&rÓÒvö&¦V7Br’&WGW&ã°¢ö&¦V7BæVçG&–W2‡&r’æf÷$V6‚‚…¶–BÂ—FVÕÒ’Óâ°¢6öç7BF&vWBÒ7F÷&R–ç7Fæ6VöbÖò7F÷&RævWB†–B’¢7F÷&U¶–EÓ°¢–b‡F&vWB’ÖW&vUf—6–&–Æ—G”g&öÕ&ucC’‡F&vWBÂ—FVÒ“°¢Ò“°¢Ó°¢&W7F÷&TÖ‚v÷&væ—¦F–öç2rÂv÷&væ—¦F–öç2rÂtõ$tä•¤D”ôå2r“°¢&W7F÷&TÖ‚vf7F–öç2rÂvf7F–öç2rÂtd5D”ôå2r“°¢&W7F÷&TÖ‚w6¶–ÆÇ2rÂw6¶–ÆÇ2rÂu4´”ÄÅ2r“° ¢6öç7B6VÆV7FVBÒ6VÆV7FVD6×–vä–EcC’‚“°¢–b‡6VÆV7FVB’Ç”W&F†VÖUcC’†6×–vä'”–EcC’‡6VÆV7FVB’“°¢VÇ6RÇ”W&F†VÖUcC’‚wFV6†æöÆöv–6Âr“°¢&WGW&â&W7VÇC°¢Ó° ¢6öç7Bõö7&VFT&Ææ´VçF—G•cC’Ò7&VFT&Ææ´VçF—G“°¢7&VFT&Ææ´VçF—G’ÒgVæ7F–öâ‡G—R’°¢6öç7BVçF—G’Òõö7&VFT&Ææ´VçF—G•cC’‡G—R“°¢–b‡G—RÓÓÒv6×–vç2r’&WGW&âVæ†æ6T6×–våcC’‡²ââæVçF—G’Âf–Æ&ÆTæ÷s¢G'VRÂW&¢wFV6†æöÆöv–6ÂrÒ“°¢–b†VçF—G“òçf—6–&–Æ—G’bbG—VöbVçF—G’çf—6–&–Æ—G’ÓÓÒvö&¦V7Br’VçF—G’çf—6–&–Æ—G’Ò²ââæVçF—G’çf—6–&–Æ—G’Â6×–vä–G3¢µÒÂW&–G3¢µÒÓ°¢&WGW&âVçF—G“°¢Ó° ¢6öç7Bõ÷&VæFW%f—6–&–Æ—G”f–VÆEcC’Ò6öæf–wW&F÷"ç&VæFW%f—6–&–Æ—G”f–VÆBæ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW%f—6–&–Æ—G”f–VÆBÒgVæ7F–öâ†VçF—G’’°¢6öç7Bf—2Òf—6–&–Æ—G•cC’†VçF—G’“°¢&WGW&âÆF—b6Æ73Ò&66W72×66÷R×cC’#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Mí-=ýÝí-ÂÝ½]Í]Ý-ÂöF—cà¢ÆF—b6Æ73Ò&66W72×66÷R×F'2×cC’#ãÇ7ãí	ý	]

	í	Ý		cÂ÷7ããÇ7ãí	­		Í	ý		Ý	
óÂ÷7ããÇ7ãí
Ý	ý	í
]	Â÷7ããÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	­íÝ­]-Ý½Rý]íÝmƒÂöÆ&VÃâG·&VæFW$6†V6¶&÷…6VÆV7F÷"‚wf—6–&–Æ—G•Æ–W$–G2rÂ‚‚’Óâ²6öç7B&÷w2Ò6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2„ç7FFSòçW6W'2ÇÂÄ”U%õDTÕÄDU2ÇÂ·Ò’’æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒr“²–b‚&÷w2ç6öÖR‡Æ–W"ÓâÆ–W"æ–BÓÓÒuõöwVW7Eõòr’’&÷w2çW6‚‡²–C¢uõöwVW7EõòrÂ&öÆS¢vwVW7BrÂF—7Æ”æÖS¢}	=í-ÂrÂ6†÷'DæÖS¢twVW7BrÂfF$vÇ—ƒ¢tu2rÒ“²&WGW&â&÷w3²Ò’‚’Âf—2çÆ–W$–G2ÂwÆ–W"rÂ}	Ý]"=í­í"r—ÓÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	=í-½R­ÍýÝƒÂöÆ&VÃâG¶6×–vä66W74Ö&·WcC’‡f—2æ6×–vä–G2—ÓÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	-½ÝÝ½’Ý½]Í]Ý"=M]"Mí-=ý]Ò-]Âý]íÝmÂÂí-ÝíýÍò]í-ò²¢íMÝí’í-Í]}]ÝÝí’­ÍýÝ‚ãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
Ýýí]ƒÂöÆ&VÃâG¶W&6VÆV7F÷$Ö&·WcC’‡f—2æW&–G2—ÓÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
Ýýí]M"Mí-=ò-]Âý]íÝmÂ­ÍýÝ’Ý-í’Ýýí]‚â
=½í-ò*½ý]íÝbò­ÍýÝòòÝýí]+²í­]MÝýí-òýâýÝmý2		½	‚â	M	Â-M"-ãÂöF—cãÂöF—cà¢ÂöF—cæ°¢Ó° ¢6öç7Bõö6öÆÆV7DVçF—G•cC’Ò6öæf–wW&F÷"æ6öÆÆV7DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ6öÆÆV7DVçF—G’ÒgVæ7F–öâ‡G—RÂf÷&ÔVÂÂf÷&ÔFFÒæWrf÷&ÔFF†f÷&ÔVÂ’’°¢6öç7BVçF—G’Òõö6öÆÆV7DVçF—G•cC’‡G—RÂf÷&ÔVÂÂf÷&ÔFF“°¢–b‚VçF—G’’&WGW&âVçF—G“°¢–b‡G—RÓÓÒv6×–vç2r’°¢VçF—G’æf–Æ&ÆTæ÷rÒf÷&ÔFFævWB‚vf–Æ&ÆTæ÷rr’ÓÓÒvöâs°¢VçF—G’æW&Òæ÷&ÖÆ—¦TW&cC’†f÷&ÔFFævWB‚vW&r’“°¢&WGW&âVæ†æ6T6×–våcC’†VçF—G’“°¢Ð¢–b†f÷&ÔVÂçVW'•6VÆV7F÷"‚u¶æÖSÒ'f—6–&–Æ—G•Æ–W$–G2%ÒÅ¶æÖSÒ'f—6–&–Æ—G”6×–vä–G2%ÒÅ¶æÖSÒ'f—6–&–Æ—G”W&–G2%Òr’’°¢VçF—G’çf—6–&–Æ—G’Ò°¢âââ†VçF—G’çf—6–&–Æ—G’ÇÂ·Ò’À¢Æ–W$–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G•Æ–W$–G2r’À¢6×–vä–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G”6×–vä–G2r’À¢W&–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G”W&–G2r’æÖ†æ÷&ÖÆ—¦TW&cC’¢Ó°¢Ð¢&WGW&âVçF—G“°¢Ó° ¢6öç7Bõö–ç6W'DVçF—G•cC’Ò6öæf–wW&F÷"æ–ç6W'DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ–ç6W'DVçF—G’ÒgVæ7F–öâ‡G—RÂVçF—G’’°¢6öç7B&W7VÇBÒõö–ç6W'DVçF—G•cC’‡G—RÂVçF—G’“°¢–b‡G—RÓÓÒv6×–vç2rbbVçF—G“òæ–BbbFFòæ6×–vç3òå¶VçF—G’æ–EÒ’°¢ö&¦V7Bæ76–vâ„FFæ6×–vç5¶VçF—G’æ–EÒÂ²f–Æ&ÆTæ÷s¢VçF—G’æf–Æ&ÆTæ÷rÓÒfÇ6RÂW&¢æ÷&ÖÆ—¦TW&cC’†VçF—G’æW&’Ò“°¢Ð¢6öç7BFF7F÷&W2Ò²÷&væ—¦F–öç3¢FFòæ÷&væ—¦F–öç2Âf7F–öç3¢FFòæf7F–öç2Â6¶–ÆÇ3¢FFòç6¶–ÆÇ2Ó°¢6öç7B7F÷&RÒFF7F÷&W5·G—UÓ°¢–b‡7F÷&RbbVçF—G“òæ–B’°¢6öç7BF&vWBÒ7F÷&R–ç7Fæ6VöbÖò7F÷&RævWB†VçF—G’æ–B’¢7F÷&U¶VçF—G’æ–EÓ°¢–b‡F&vWB’ÖW&vUf—6–&–Æ—G”g&öÕ&ucC’‡F&vWBÂVçF—G’“°¢Ð¢&WGW&â&W7VÇC°¢Ó° ¢6öç7Bõ÷&VæFW$6×–väVF—F÷%cC’Ò6öæf–wW&F÷"ç&VæFW$6×–väVF—F÷#òæ&–æB„6öæf–wW&F÷"“°¢–b…õ÷&VæFW$6×–väVF—F÷%cC’’°¢6öæf–wW&F÷"ç&VæFW$6×–väVF—F÷"ÒgVæ7F–öâ†VçF—G’’°¢6öç7B6×–vâÒVæ†æ6T6×–våcC’‡²âââ†VçF—G’ÇÂ·Ò’Ò“°¢6öç7BW&Òæ÷&ÖÆ—¦TW&cC’†6×–vâæW&“°¢&WGW&âÆf÷&Ò–CÒ&6öæf–rÖVF—F÷"Öf÷&Ò"6Æ73Ò&f÷&Ò"FFÖVçF—G’×G—SÒ&6×–vç2#à¢G·F†—2ç&VæFW$†VFW"†6×–vâÂ}	­ÍýÝòíý]M]½ý]"Mí-=ýÝí-Âý]íÝm]’Â-}=½ÍÝ=âÝýí]2Ý-]M]‚==ýýí-½Rý-­íÝ-]Ý-âr—Ð¢G¶–ÖvTf–VÆDÖ&·W†6×–vâÂ}	}ím]ÝRòÝÍ½]Í­ÍýÝ‚r—Ð¢ÆF—b6Æ73Ò&6öÇ32#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃä”CÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&–B"fÇVSÒ"G¶W62†6×–vâæ–B—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Ý}-ÝSÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&æÖR"fÇVSÒ"G¶W62†6×–vâææÖR—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
--=ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ'7FGW2"fÇVSÒ"G¶W62†6×–vâç7FGW2ÇÂv7F—fRr—Ò"Æ6V†öÆFW#Ò&7F—fRò&6†—fVB"óãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&6×–vâÖf–Æ&–Æ—G’×cC’#ãÆÆ&VÂ6Æ73Ò'FövvÆR×&÷r#ãÆ–çWBG—SÒ&6†V6¶&÷‚"æÖSÒ&f–Æ&ÆTæ÷r"G¶6×–vâæf–Æ&ÆTæ÷rÓÒfÇ6Ròv6†V6¶VBr¢rwÒóâÇ7ããÆ#í	Mí-=ýÝ"MÝÝ½’ÍíÍ]Ý#Âö#ãÇ6ÖÆÃí	]½‚-½­½í}]ÝâÂ­ÍýÝâÝ]½Í}ò-½-Âý‚-]íMRÂ]ý]íÝm‚­½-í-òrý­ãÂ÷6ÖÆÃãÂ÷7ããÂöÆ&VÃãÂöF—cà¢ÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
Ýýí]Ý-]M]ÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&W&#âG´U$ôDTe5õcC’æÖ†—FVÒÓâÆ÷F–öâfÇVSÒ"G¶—FVÒæ–GÒ"G¶—FVÒæ–BÓÓÒW&òw6VÆV7FVBr¢rwÓâG¶W62†—FVÒææÖR—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
m-]"­ÍýÝƒÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&6öÆ÷""fÇVSÒ"G¶W62†6×–vâæ6öÆ÷"ÇÂr6#ƒ“CS‚r—Ò"óãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&W&×&Wf–Wr×cC’"FFÖW&×&Wf–WsÒ"G¶W&Ò#ãÇ7ãâG¶W&ÓÓÒvÖVF–WfÂrò~)Êbr¢W&ÓÓÒv–æGW7G&–Ârò~)©’r¢~(É‚wÓÂ÷7ããÆF—cãÆ#âG¶W62†W&FVecC’†W&’ææÖR—ÓÂö#ãÇ6ÖÆÃí
-½ÂÝ-]M]--íÍ-}]­‚ý]]­½í}]-òý‚-½íRÝ-í’­ÍýÝ‚ãÂ÷6ÖÆÃãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	íýÝSÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V"æÖSÒ&FW67&—F–öâ#âG¶W62†6×–vâæFW67&—F–öâÇÂrr—ÓÂ÷FW‡F&VâG·G—Vöbõö‡FÖÄ†–çBÓÒwVæFVf–æVBròõö‡FÖÄ†–çB¢rwÓÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-ý}ÝÝ½R--ÍƒÂöÆ&VÃâG·&VæFW%&VÆFVD'F–6ÆW4VF—F÷"†6×–vâç&VÆFVD'F–6ÆT–G2ÇÂµÒ—ÓÂöF—cà¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUô4Õ”tãÂö'WGFöãà¢Âöf÷&Óæ°¢Ó°¢Ð ¢òò&W6W'fRæWrf—6–&–Æ—G’F–ÖVç6–öç2–âÆVv7’æ÷&ÖÆ—¦W'2F†B&Wf–÷W6Ç’&VGV6V@¢òòF†Rö&¦V7BFò²Æ–W$–G2ÒöæÇ’à¢G'’°¢–b‡G—Vöbæ÷&ÖÆ—¦T÷&væ—¦F–öåcC‚ÓÓÒvgVæ7F–öâr’°¢6öç7BöÆBÒæ÷&ÖÆ—¦T÷&væ—¦F–öåcCƒ°¢æ÷&ÖÆ—¦T÷&væ—¦F–öåcC‚ÒgVæ7F–öâ†VçF—G’Ò·Ò’²&WGW&âÖW&vUf—6–&–Æ—G”g&öÕ&ucC’†öÆB†VçF—G’’ÂVçF—G’“²Ó°¢Ð¢Ò6F6‚·Ð¢G'’°¢–b‡G—Vöbæ÷&ÖÆ—¦Tf7F–öåcSÓÓÒvgVæ7F–öâr’°¢6öç7BöÆBÒæ÷&ÖÆ—¦Tf7F–öåcS°¢æ÷&ÖÆ—¦Tf7F–öåcSÒgVæ7F–öâ†VçF—G’Ò·Ò’²&WGW&âÖW&vUf—6–&–Æ—G”g&öÕ&ucC’†öÆB†VçF—G’’ÂVçF—G’“²Ó°¢Ð¢Ò6F6‚·Ð¢G'’°¢–b‡G—Vöbæ÷&ÖÆ—¦U6¶–ÆÅcSÓÓÒvgVæ7F–öâr’°¢6öç7BöÆBÒæ÷&ÖÆ—¦U6¶–ÆÅcS°¢æ÷&ÖÆ—¦U6¶–ÆÅcSÒgVæ7F–öâ†VçF—G’Ò·Ò’²&WGW&âÖW&vUf—6–&–Æ—G”g&öÕ&ucC’†öÆB†VçF—G’’ÂVçF—G’“²Ó°¢Ð¢Ò6F6‚·Ð ¢òò66W72'VÆS¢æò6VÆV7F÷'2ÒtÒÖöæÇ’†¶VW2F†R7W'&VçB6fRFVfVÇB’âç¢òò6VÆV7FVBÆ–W"Â6×–vâ÷"W&w&çG2f—6–&–Æ—G’à¢—4VçF—G•f—6–&ÆRÒgVæ7F–öâ†VçF—G’ÂW6W"Òæ7W'&VçEW6W"’°¢–b‚VçF—G’’&WGW&âfÇ6S°¢–b‚W6W"ÇÂ7G&–ær‡W6W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’&WGW&âG'VS°¢–b‚VçF—G’çf—6–&–Æ—G’ÇÂG—VöbVçF—G’çf—6–&–Æ—G’ÓÒvö&¦V7Br’&WGW&âG'VS°¢6öç7Bf—2Òf—6–&–Æ—G•cC’†VçF—G’“°¢–b‚f—2çÆ–W$–G2æÆVæwF‚bbf—2æ6×–vä–G2æÆVæwF‚bbf—2æW&–G2æÆVæwF‚’&WGW&âfÇ6S°¢6öç7BW6W$–BÒ7G&–ær‡W6W"æ–BÇÂrr“°¢–b‡f—2çÆ–W$–G2æ–æ6ÇVFW2‡W6W$–B’’&WGW&âG'VS°¢–b…7G&–ær‡W6W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvwVW7Br’&WGW&âf—2çÆ–W$–G2æ–æ6ÇVFW2‚uõöwVW7Eõòr’ÇÂf—2çÆ–W$–G2æ–æ6ÇVFW2‚vwVW7Br“°¢6öç7B7W'&VçD6×–vâÒ7F—fT6×–våcC’‡W6W"“°¢6öç7BW6W$6×–vä–G2ÒæWr6WB‡Æ–W$6×–vä–G5cC’‡W6W"’“°¢–b†7W'&VçD6×–vãòæ–B’W6W$6×–vä–G2æFB…7G&–ær†7W'&VçD6×–vâæ–B’“°¢–b‡f—2æ6×–vä–G2ç6öÖR†–BÓâW6W$6×–vä–G2æ†2…7G&–ær†–B’’’’&WGW&âG'VS°¢6öç7BW&2ÒæWr6WB‚“°¢W6W$6×–vä–G2æf÷$V6‚†–BÓâ²6öç7B6×–vâÒ6×–vä'”–EcC’†–B“²–b†6×–vâ’W&2æFB†æ÷&ÖÆ—¦TW&cC’†6×–vâæW&’“²Ò“°¢–b†7W'&VçD6×–vâ’W&2æFB†æ÷&ÖÆ—¦TW&cC’†7W'&VçD6×–vâæW&’“°¢&WGW&âf—2æW&–G2ç6öÖR†–BÓâW&2æ†2†æ÷&ÖÆ—¦TW&cC’†–B’’“°¢Ó° ¢6öç7Bõöf–ÆÄÆöv–å6VÆV7EcC’Òæf–ÆÄÆöv–å6VÆV7Bæ&–æB„“°¢æf–ÆÄÆöv–å6VÆV7BÒgVæ7F–öâ‚’°¢õöf–ÆÄÆöv–å6VÆV7EcC’‚“²òò7&VFW2F†Rcc6×–vâ&÷ræBwVW7B'WGFöà¢6öç7B6×–vå6VÆV7BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚vÆöv–âÖ6×–vâ×6VÆV7B×ccr“°¢6öç7B6†%6VÆV7BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚v6†"×6VÆV7Br“°¢–b‚6×–vå6VÆV7BÇÂ6†%6VÆV7B’&WGW&ã°¢6öç7B&÷w2ÒÆ–&ÆT6×–vç5cC’‚“°¢ÆWB6VÆV7FVBÒ6VÆV7FVD6×–vä–EcC’‚“°¢–b‚6VÆV7FVBÇÂ6×–vä'”–EcC’‡6VÆV7FVB“òæf–Æ&ÆTæ÷r’6VÆV7FVBÒf–Æ&ÆT6×–vç5cC’‚•³Óòæ–BÇÂrs°¢6×–vå6VÆV7Bæ–ææW$…DÔÂÒ&÷w2æÖ†6×–vâÓâÆ÷F–öâfÇVSÒ"G¶W62†6×–vâæ–B—Ò"G¶6×–vâæ–BÓÓÒ6VÆV7FVBòw6VÆV7FVBr¢rwÒG¶6×–vâæf–Æ&ÆTæ÷rÓÓÒfÇ6RòvF—6&ÆVBr¢rwÓâG¶W62†6×–vâææÖRÇÂ6×–vâæ–B—Ò+rG¶W62†W&FVecC’†6×–vâæW&’ææÖR—ÒG¶6×–vâæf–Æ&ÆTæ÷rÓÓÒfÇ6Ròr+r	Ý	]	M	í

-
=	ý	Ý	r¢rwÓÂö÷F–öãæ’æ¦ö–â‚rr’ÇÂsÆ÷F–öâfÇVSÒ"#í	Ý]"­ÍýÝ“Âö÷F–öãâs°¢–b‡6VÆV7FVB’6×–vå6VÆV7BçfÇVRÒ6VÆV7FVC°¢6×–vå6VÆV7BæF—6&ÆVBÒf–Æ&ÆT6×–vç5cC’‚’æÆVæwFƒ°¢æ7F—fT6×–vä–BÒ6VÆV7FVC°¢Æö6Å7F÷&vRç6WD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×cC’rÂ6VÆV7FVB“°¢–b‡6VÆV7FVB’Ç”W&F†VÖUcC’†6×–vä'”–EcC’‡6VÆV7FVB’“° ¢6öç7B6÷W&6UÆ–W'2Ò6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2‡F†—2ç7FFSòçW6W'2ÇÂÄ”U%õDTÕÄDU2ÇÂ·Ò’¢æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br¢æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒrÇÂ‡6VÆV7FVBbbÆ–W$6×–vä–G5cC’‡Æ–W"’æ–æ6ÇVFW2‡6VÆV7FVB’’“°¢6öç7B&WbÒ6†%6VÆV7BçfÇVS°¢–b‚6VÆV7FVBÇÂ6÷W&6UÆ–W'2æÆVæwF‚’°¢6†%6VÆV7Bæ–ææW$…DÔÂÒÆ÷F–öâfÇVSÒ"#âG·6VÆV7FVBò}	Ý]"Mí-=ýÝ½Rý]íÝm]’"Ý-í’­ÍýÝ‚r¢}	Ý]"Mí-=ýÝ½R­ÍýÝ’wÓÂö÷F–öãæ°¢F†—2ç&VæFW$Æöv–å&Wf–Wr‚“°¢&WGW&ã°¢Ð¢6†%6VÆV7Bæ–ææW$…DÔÂÒ6÷W&6UÆ–W'2æÖ‡Æ–W"ÓâÆ÷F–öâfÇVSÒ"G¶W62‡Æ–W"æ–B—Ò#âG¶W62‡Æ–W"æF—7Æ”æÖRÇÂÆ–W"æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr“°¢–b‡6÷W&6UÆ–W'2ç6öÖR‡Æ–W"ÓâÆ–W"æ–BÓÓÒ&Wb’’6†%6VÆV7BçfÇVRÒ&Wc°¢F†—2ç&VæFW$Æöv–å&Wf–Wr‚“°¢Ó° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ°¢–b†WfVçBçF&vWCòæ–BÓÒvÆöv–âÖ6×–vâ×6VÆV7B×ccr’&WGW&ã°¢6öç7B–BÒ7G&–ær†WfVçBçF&vWBçfÇVRÇÂrr’çG&–Ò‚“°¢6öç7B6×–vâÒ6×–vä'”–EcC’†–B“°¢–b‚6×–vâÇÂ6×–vâæf–Æ&ÆTæ÷rÓÓÒfÇ6R’°¢æf–ÆÄÆöv–å6VÆV7B‚“°¢&WGW&ã°¢Ð¢æ7F—fT6×–vä–BÒ–C°¢Æö6Å7F÷&vRç6WD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×cC’rÂ–B“°¢Æö6Å7F÷&vRç6WD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×ccrÂ–B“°¢Ç”W&F†VÖUcC’†6×–vâ“°¢æf–ÆÄÆöv–å6VÆV7B‚“°¢ÒÂG'VR“° ¢6öç7BõöÆöv–åcC’ÒæÆöv–âæ&–æB„“°¢æÆöv–âÒ7–æ2gVæ7F–öâ‚’°¢6öç7B6×–vä–BÒ6VÆV7FVD6×–vä–EcC’‚“°¢6öç7B6×–vâÒ6×–vä'”–EcC’†6×–vä–B“°¢6öç7BÆ–W$–BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚v6†"×6VÆV7Br“òçfÇVRÇÂrs°¢6öç7BÆ–W"ÒF†—2ç7FFSòçW6W'3òå·Æ–W$–EÓ°¢–b‚6×–vâÇÂ6×–vâæf–Æ&ÆTæ÷rÓÓÒfÇ6R’°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÆöv–âÖW'&÷"r’çFW‡D6öçFVçBÒ}	-½ÝÝò­ÍýÝò]}Ý]Mí-=ýÝâs°¢&WGW&ã°¢Ð¢–b‡Æ–W"bb7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒrbbÆ–W$6×–vä–G5cC’‡Æ–W"’æ–æ6ÇVFW2†6×–vä–B’’°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÆöv–âÖW'&÷"r’çFW‡D6öçFVçBÒ}
Ý-í"ý]íÝbÝRí-Ýí-ò¢-½ÝÝí’­ÍýÝ‚âs°¢&WGW&ã°¢Ð¢æ7F—fT6×–vä–BÒ6×–vä–C°¢Æö6Å7F÷&vRç6WD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×cC’rÂ6×–vä–B“°¢Ç”W&F†VÖUcC’†6×–vâ“°¢&WGW&âõöÆöv–åcC’‚“°¢Ó° ¢6öç7Bõöf–æ—6„Æöv–åcC’Òæf–æ—6„Æöv–âæ&–æB„“°¢æf–æ—6„Æöv–âÒgVæ7F–öâ‚’°¢6öç7B6VÆV7FVBÒ6VÆV7FVD6×–vä–EcC’‚“°¢6öç7B6×–vâÒ6×–vä'”–EcC’‡6VÆV7FVB“°¢6öç7BW6W"ÒF†—2æ7W'&VçEW6W#°¢6öç7B&öÆRÒ7G&–ær‡W6W#òç&öÆRÇÂrr’çFôÆ÷vW$66R‚“°¢òòwVW7B66W72—2vÆö&ÂæB&VBÖöæÇ“¢F†R6VÆV7FVB6×–vâ6öçG&öÇ2F†P¢òò–çFW&f6RF†VÖRÂ'WBF†RFV6†æ–6ÂwVW7B&öf–ÆR—2æ÷B76–væVBFò—Bà¢–b‡W6W"bb&öÆRÓÒvvÒrbb&öÆRÓÒvwVW7Br’°¢–b‚6×–vâÇÂ6×–vâæf–Æ&ÆTæ÷rÓÓÒfÇ6RÇÂÆ–W$6×–vä–G5cC’‡W6W"’æ–æ6ÇVFW2‡6VÆV7FVB’’°¢F†—2æ7W'&VçEW6W$–BÒçVÆÃ°¢G'’²W'6—7FVæ6Ræ6ÆV%6W76–öâ‚“²Ò6F6‚·Ð¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÆöv–â×67&VVâr“òæ6Æ74Æ—7BæFB‚v÷Vâr“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÆöv–âÖW'&÷"r’çFW‡D6öçFVçBÒ}
í]ÝÝÝò­ÍýÝòí½ÍRÝ]Mí-=ýÝâ	-½]-RM===â­ÍýÝâ‚ý]íÝmâs°¢F†—2æf–ÆÄÆöv–å6VÆV7B‚“°¢&WGW&ã°¢Ð¢Ð¢æ7F—fT6×–vä–BÒ6VÆV7FVC°¢–b†6×–vâ’Ç”W&F†VÖUcC’†6×–vâ“°¢&WGW&âõöf–æ—6„Æöv–åcC’‚“°¢Ó° ¢6öç7Bõ÷&VæFW$Æöv–å&Wf–WucC’Òç&VæFW$Æöv–å&Wf–Wræ&–æB„“°¢ç&VæFW$Æöv–å&Wf–WrÒgVæ7F–öâ‚’°¢õ÷&VæFW$Æöv–å&Wf–WucC’‚“°¢6öç7B&ö÷BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚vÆöv–â×&Wf–Wrr“°¢6öç7B6×–vâÒ6×–vä'”–EcC’‡6VÆV7FVD6×–vä–EcC’‚’“°¢–b‡&ö÷Bbb6×–vâ’&ö÷Bæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÂÆF—b6Æ73Ò&Æöv–âÖ6×–vâÖÖWF×cC’#ãÇ7â6Æ73Ò&6×–vâÖÆ—fRÖF÷B×cC’G¶6×–vâæf–Æ&ÆTæ÷rÓÒfÇ6Ròvöâr¢rwÒ#ãÂ÷7ããÆ#âG¶W62†6×–vâææÖRÇÂ6×–vâæ–B—ÓÂö#ãÇ7ãâG¶W62†W&FVecC’†6×–vâæW&’ææÖR—ÓÂ÷7ããÂöF—cæ“°¢Ó° ¢òò–æ—F–ÂF†VÖR&Vf÷&RF†Rf—'7Bv÷&ÆBÆöC²Ç•v÷&ÆDFFv–ÆÂ&Vf–æR—Bà¢Ç”W&F†VÖUcC’‚wFV6†æöÆöv–6Âr“°§Ò’‚“° ¢òòÓÓÓÓÒcããS"&Vv—7G&F–öâÂ÷&–v–ç2Â&Ö÷"6Æ72æBWV—ÖVçB66†VÖÓÓÓÓÐ¢†gVæ7F–öâ‚—°¢–b‡v–æF÷råõöw'ucS"’&WGW&ã°¢v–æF÷råõöw'ucS"ÒG'VS° ¢6öç7B$”Ä•D”U5õcS"Ò°¢²¶W“¢w7G&VæwF‚rÂÆ&VÃ¢}
½rÂ6†÷'C¢}
		²rÒÀ¢²¶W“¢vFW‡FW&—G’rÂÆ&VÃ¢}	½í-­í-ÂrÂ6†÷'C¢}	½	í	"rÒÀ¢²¶W“¢v–çFVÆÆ–vVæ6RrÂÆ&VÃ¢}	Ý-]½½]­"rÂ6†÷'C¢}		Ý
"rÒÀ¢²¶W“¢vVæGW&æ6RrÂÆ&VÃ¢}	-½Ýí½-í-ÂrÂ6†÷'C¢}	-
½	ÒrÒÀ¢²¶W“¢wv–ÆÂrÂÆ&VÃ¢}	-í½òrÂ6†÷'C¢}	-	í	²rÒÀ¢²¶W“¢vvÆ÷'’rÂÆ&VÃ¢}
½-rÂ6†÷'C¢}
	½	rÐ¢Ó°¢6öç7B•DTÕõE•U5õcS"Ò°¢²fÇVS¢vvV"rÂÆ&VÃ¢}
Ýým]ÝRrÒÀ¢²fÇVS¢wvVöârÂÆ&VÃ¢}	í=mRrÒÀ¢²fÇVS¢w6†–VÆBrÂÆ&VÃ¢}
-²rÒÀ¢²fÇVS¢vw&VæFRrÂÆ&VÃ¢}	=Ý-²rÒÀ¢²fÇVS¢wGW'&WBrÂÆ&VÃ¢}
-=]½‚rÒÀ¢²fÇVS¢vG&öæRrÂÆ&VÃ¢}	MíÝ²rÒÀ¢²fÇVS¢v&Ö÷"rÂÆ&VÃ¢}	íÝòrÒÀ¢²fÇVS¢v–×ÆçBrÂÆ&VÃ¢}	Íý½Ý-²rÒÀ¢²fÇVS¢w7Fö6²rÂÆ&VÃ¢}	­m‚rÐ¢Ó°¢6öç7B$õdÅõcS"ÒæWr6WB…²v&÷fVBrÂwVæF–ærrÂw&V¦V7FVBuÒ“°¢ÆWB4ô4”Åôõ$”t”å5õcS"Ò·Ó°¢ÆWBtTôu$„”5ôõ$”t”å5õcS"Ò·Ó° ¢tõ$ÄEõ4T5D”ôå2ç6ö6–Ä÷&–v–ç2Ò²Æ&VÃ¢}	ýíM]‚rÂÖ¶W“¢u4ô4”Åôõ$”t”å2rÂÆ—7D¶W“¢u4ô4”Åôõ$”t”åôÄ•5BrÓ°¢tõ$ÄEõ4T5D”ôå2ævVöw&†–4÷&–v–ç2Ò²Æ&VÃ¢}	ýí]ímM]ÝS¢=]í=M}]­íRrÂÖ¶W“¢ttTôu$„”5ôõ$”t”å2rÂÆ—7D¶W“¢ttTôu$„”5ôõ$”t”åôÄ•5BrÓ° ¢gVæ7F–öâVæ—VU7G&–æw5cS"‡fÇVR’°¢&WGW&â'&’æg&öÒ†æWr6WB‚„'&’æ—4'&’‡fÇVR’òfÇVR¢µÒ’æÖ†VçG'’Óâ7G&–ær†VçG'“òæ–BÇÂVçG'“òæ6×–vä–BÇÂVçG'’ÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ’’“°¢Ð¢gVæ7F–öâf—6–&–Æ—G•cS"‡fÇVRÒ·Ò’°¢6öç7Bf—2ÒfÇVSòçf—6–&–Æ—G’bbG—VöbfÇVRçf—6–&–Æ—G’ÓÓÒvö&¦V7BròfÇVRçf—6–&–Æ—G’¢fÇVRÇÂ·Ó°¢&WGW&â°¢Æ–W$–G3¢Væ—VU7G&–æw5cS"‡f—2çÆ–W$–G2’À¢6×–vä–G3¢Væ—VU7G&–æw5cS"‡f—2æ6×–vä–G2ÇÂf—2æ6×–vç2’À¢W&–G3¢Væ—VU7G&–æw5cS"‡f—2æW&–G2ÇÂf—2æW&2ÇÂf—2æWö6‡2¢Ó°¢Ð¢gVæ7F–öâ6×–vå&÷w5cS"‚’°¢6öç7B6÷W&6RÒv÷&ÆDFFòæ6×–vç3òä4Õ”tå2ÇÂ·Ó°¢&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2‡6÷W&6RÇÂ·Ò’æf–ÇFW"†2Óâ7G&–ær†3òç7FGW2ÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br’“°¢Ð¢gVæ7F–öâf–Æ&ÆT6×–vå&÷w5cS"‚’°¢&WGW&â6×–vå&÷w5cS"‚’æf–ÇFW"†2Óâ3òæf–Æ&ÆTæ÷rÓÒfÇ6R“°¢Ð¢gVæ7F–öâ6×–vä–G4f÷%Æ–W%cS"‡Æ–W"Ò·Ò’°¢6öç7B–G2ÒVæ—VU7G&–æw5cS"‡Æ–W"æ6×–vä–G2ÇÂÆ–W"æ6×–vç2“°¢–b‡Æ–W"æ6×–vä–B’–G2çW6‚…7G&–ær‡Æ–W"æ6×–vä–B’“°¢&WGW&â'&’æg&öÒ†æWr6WB†–G2’“°¢Ð¢gVæ7F–öâ—4&÷fVEÆ–W%cS"‡Æ–W"Ò·Ò’°¢–b…7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’&WGW&âG'VS°¢&WGW&â7G&–ær‡Æ–W"æ&÷fÅ7FGW2ÇÂv&÷fVBr’çFôÆ÷vW$66R‚’ÓÓÒv&÷fVBs°¢Ð¢gVæ7F–öâ&÷fÄÆ&VÅcS"‡7FGW2’°¢&WGW&â7FGW2ÓÓÒwVæF–ærrò}	ímM]"íMí]Ýò	M	Ír¢7FGW2ÓÓÒw&V¦V7FVBrò}	í-­½íÝ]Ýr¢}	íMí]Ýs°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦T&öçW4ÖcS"‡fÇVRÒ·Ò’°¢6öç7B÷WBÒ·Ó°¢f÷"†6öç7B—FVÒöb$”Ä•D”U5õcS"’÷WE¶—FVÒæ¶W•ÒÒçVÖ&W"‡fÇVSòå¶—FVÒæ¶W•ÒÇÂ“°¢&WGW&â÷WC°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦T÷&–v–åcS"†VçF—G’Ò·ÒÂfÆÆ&6²Òv÷&–v–âr’°¢6öç7B–BÒ6ÇVv–g”–B†VçF—G’æ–BÇÂVçF—G’ææÖRÇÂVçF—G’çF—FÆRÇÂrrÂfÆÆ&6²“°¢&WGW&â°¢ââæVçF—G’À¢–BÀ¢æÖS¢7G&–ær†VçF—G’ææÖRÇÂVçF—G’çF—FÆRÇÂ}	Ýí-íRýí]ímM]ÝRr’çG&–Ò‚’À¢FW67&—F–öã¢7G&–ær†VçF—G’æFW67&—F–öâÇÂVçF—G’ç7VÖÖ'’ÇÂrr’çG&–Ò‚’À¢–ÖvS¢7G&–ær†VçF—G’æ–ÖvRÇÂrr’çG&–Ò‚’À¢–ÖvTÆö6Ã¢7G&–ær†VçF—G’æ–ÖvTÆö6ÂÇÂrr’çG&–Ò‚’À¢Æö6F–öåG—S¢7G&–ær†VçF—G’æÆö6F–öåG—RÇÂVçF—G’çÆ6UG—RÇÂv÷F†W"r’çG&–Ò‚’çFôÆ÷vW$66R‚’À¢Æ–æ¶VEÆæWD–G3¢Væ—VU7G&–æw5cS"†VçF—G’æÆ–æ¶VEÆæWD–G2ÇÂVçF—G’çÆæWD–G2ÇÂVçF—G’æ66W75ÆæWD–G2ÇÂµÒ’À¢Æ–æ¶VE&Vv–öä–G3¢Væ—VU7G&–æw5cS"†VçF—G’æÆ–æ¶VE&Vv–öä–G2ÇÂVçF—G’ç&Vv–öä–G2ÇÂVçF—G’æ66W75&Vv–öä–G2ÇÂµÒ’À¢w&çFVEÆæWD–G3¢Væ—VU7G&–æw5cS"†VçF—G’æw&çFVEÆæWD–G2ÇÂVçF—G’æ66W74w&çFVEÆæWD–G2ÇÂµÒ’À¢w&çFVE7—7FVÔ–G3¢Væ—VU7G&–æw5cS"†VçF—G’æw&çFVE7—7FVÔ–G2ÇÂVçF—G’æ66W74w&çFVE7—7FVÔ–G2ÇÂµÒ’À¢7&VF–öä6÷7C¢6Æ×„ÖF‚æÖ‚ƒÂçVÖ&W"†VçF—G’æ7&VF–öä6÷7BóòVçF—G’æ6†&7FW$7&VF–öä6÷7Bóò’’ÂÂ’À¢&–Æ—G”&öçW6W3¢æ÷&ÖÆ—¦T&öçW4ÖcS"†VçF—G’æ&–Æ—G”&öçW6W2ÇÂVçF—G’æ&öçW6W2ÇÂ·Ò’À¢f—6–&–Æ—G“¢f—6–&–Æ—G•cS"†VçF—G’¢Ó°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦T÷&–v–å6V7F–öåcS"‡6V7F–öâÒ·ÒÂ¶–æBÒw6ö6–Âr’°¢6öç7BÖ¶W’Ò¶–æBÓÓÒw6ö6–Âròu4ô4”Åôõ$”t”å2r¢ttTôu$„”5ôõ$”t”å2s°¢6öç7BÆ—7D¶W’Ò¶–æBÓÓÒw6ö6–Âròu4ô4”Åôõ$”t”åôÄ•5Br¢ttTôu$„”5ôõ$”t”åôÄ•5Bs°¢6öç7B6÷W&6TÖÒ6V7F–öãòå¶Ö¶W•ÒbbG—Vöb6V7F–öå¶Ö¶W•ÒÓÓÒvö&¦V7Brò6V7F–öå¶Ö¶W•Ò¢·Ó°¢6öç7B6÷W&6TÆ—7BÒ'&’æ—4'&’‡6V7F–öãòå¶Æ—7D¶W•Ò’ò6V7F–öå¶Æ—7D¶W•Ò¢µÓ°¢6öç7B÷WBÒ·Ó°¢6öç7BFBÒ†VçF—G’ÂfÆÆ&6´–BÒrr’Óâ°¢–b‚VçF—G’ÇÂG—VöbVçF—G’ÓÒvö&¦V7Br’&WGW&ã°¢6öç7Bæ÷&ÖÆ—¦VBÒæ÷&ÖÆ—¦T÷&–v–åcS"‡²ââæVçF—G’Â–C¢VçF—G’æ–BÇÂfÆÆ&6´–BÒÂG¶¶–æGÕö÷&–v–æ“°¢–b†æ÷&ÖÆ—¦VBæ–B’÷WE¶æ÷&ÖÆ—¦VBæ–EÒÒæ÷&ÖÆ—¦VC°¢Ó°¢ö&¦V7BæVçG&–W2‡6÷W&6TÖ’æf÷$V6‚‚…¶–BÂVçF—G•Ò’ÓâFB†VçF—G’Â–B’“°¢6÷W&6TÆ—7Bæf÷$V6‚†VçF—G’ÓâFB†VçF—G’’“°¢&WGW&â÷WC°¢Ð¢gVæ7F–öâ÷&–v–ä'”–EcS"†¶–æBÂ–B’°¢&WGW&â†¶–æBÓÓÒw6ö6–Ârò4ô4”Åôõ$”t”å5õcS"¢tTôu$„”5ôõ$”t”å5õcS"•µ7G&–ær†–BÇÂrr•ÒÇÂçVÆÃ°¢Ð ¢gVæ7F–öâ&Vv–öäÖööÅcc‚’°¢G'’²&WGW&âv–æF÷rå&Vv–öäÖ5c3còæÖ3òâ‚’ÇÂ·Ó²Ò6F6‚²&WGW&â·Ó²Ð¢Ð¢gVæ7F–öâFW&—fT÷&–v–ä66W75cc†÷&–v–âÒ·Ò’°¢6öç7B&Vv–öäÖ2Ò&Vv–öäÖööÅcc‚“°¢6öç7BÆ–æ¶VE&Vv–öä–G2ÒVæ—VU7G&–æw5cS"†÷&–v–âæÆ–æ¶VE&Vv–öä–G2ÇÂµÒ“°¢6öç7BÆ–æ¶VEÆæWD–G2ÒVæ—VU7G&–æw5cS"…°¢âââ†÷&–v–âæÆ–æ¶VEÆæWD–G2ÇÂµÒ’À¢âââ†÷&–v–âæw&çFVEÆæWD–G2ÇÂµÒ’À¢ââæÆ–æ¶VE&Vv–öä–G2æÖ†–BÓâ&Vv–öäÖ3òå¶–EÓòçÆæWD–BÇÂrr¢Ò“°¢6öç7BÆ–æ¶VE7—7FVÔ–G2ÒVæ—VU7G&–æw5cS"…°¢âââ†÷&–v–âæw&çFVE7—7FVÔ–G2ÇÂµÒ’À¢ââæÆ–æ¶VEÆæWD–G2æÖ‡ÆæWD–BÓâFFævWE7—7FVÔf÷%ÆæWCòâ‡ÆæWD–B“òæ–BÇÂrr¢Ò“°¢&WGW&â²Æ–æ¶VE&Vv–öä–G2ÂÆ–æ¶VEÆæWD–G2ÂÆ–æ¶VE7—7FVÔ–G2Ó°¢Ð¢gVæ7F–öâ÷&–v–ä66W74f–VÆG5cc†÷&–v–âÒ·Ò’°¢6öç7B&Vv–öäÖ2Ò&Vv–öäÖööÅcc‚“°¢6öç7BÆ6U&÷w2Ò6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2‡&Vv–öäÖ2ÇÂ·Ò’æf–ÇFW"‡&÷rÓâ²w&Vv–öârÂv6—G’uÒæ–æ6ÇVFW2…7G&–ær‡&÷sòæ¶–æBÇÂrr’çFôÆ÷vW$66R‚’’’“°¢6öç7B6VÆV7FVEÆæWD–G2ÒVæ—VU7G&–æw5cS"†÷&–v–âæÆ–æ¶VEÆæWD–G2ÇÂµÒ“°¢6öç7B6VÆV7FVE&Vv–öä–G2ÒVæ—VU7G&–æw5cS"†÷&–v–âæÆ–æ¶VE&Vv–öä–G2ÇÂµÒ“°¢&WGW&âÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ý-ý}­¢Ý-í­RÍÂöF—cà¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£'‚#í	ÍímÝâ-½-ÂíMÝ2½‚Ý]­í½Í­âý½Ý]"Â=ííMí"‚]=íÝí"íMÝí-]Í]ÝÝââ	ý‚-½íRÝ-í=âýí]ímM]Ýòý]íÝb--íÍ-}]­‚ýí½=}]"Mí-=ò¢-ý}ÝÝ½Âý½Ý]-Â‚R}-}MÝ½Â-]ÍÂãÂöF—cà¢ÆF—b6Æ73Ò&6öÇ3"÷&–v–â×v÷&ÆBÖÆ–æ·2×cc#à¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ý½Ý]-³ÂöÆ&VÃâG·&VæFW$6†V6¶&÷…6VÆV7F÷"‚vÆ–æ¶VEÆæWD–G2rÂ6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2…ÄäUE2ÇÂ·Ò’’Â6VÆV7FVEÆæWD–G2ÂwÆæWBrÂ}	ý½Ý]-²ÝRí}MÝ²r—ÓÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
]=íÝ²ò=ííMÂöÆ&VÃâG·&VæFW$6†V6¶&÷…6VÆV7F÷"‚vÆ–æ¶VE&Vv–öä–G2rÂÆ6U&÷w2Â6VÆV7FVE&Vv–öä–G2Âw&Vv–öârÂ}
]=íÝ²‚=ííMÝRí}MÝ²r—ÓÂöF—cà¢ÂöF—cæ°¢Ð¢gVæ7F–öâ÷&–v–ä&öçW6W5cS"‡Æ–W"Ò·Ò’°¢6öç7B÷WBÒö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ†—FVÒÓâ¶—FVÒæ¶W’ÂÒ’“°¢6öç7B÷&–v–ç2Ò¶÷&–v–ä'”–EcS"‚w6ö6–ÂrÂÆ–W"ç6ö6–Ä÷&–v–ä–B’Â÷&–v–ä'”–EcS"‚vvVöw&†–2rÂÆ–W"ævVöw&†–4÷&–v–ä–B•Òæf–ÇFW"„&ööÆVâ“°¢÷&–v–ç2æf÷$V6‚†÷&–v–âÓâ$”Ä•D”U5õcS"æf÷$V6‚†—FVÒÓâ²÷WE¶—FVÒæ¶W•Ò³ÒçVÖ&W"†÷&–v–âæ&–Æ—G”&öçW6W3òå¶—FVÒæ¶W•ÒÇÂ“²Ò’“°¢&WGW&â÷WC°¢Ð¢gVæ7F–öâVffV7F—fT&–Æ—F–W5cS"‡Æ–W"Ò·Ò’°¢6öç7B&6RÒÆ–W"æ&–Æ—G”&6RbbG—VöbÆ–W"æ&–Æ—G”&6RÓÓÒvö&¦V7BròÆ–W"æ&–Æ—G”&6R¢‡Æ–W"æ&–Æ—F–W2ÇÂ·Ò“°¢6öç7B&öçW2Ò÷&–v–ä&öçW6W5cS"‡Æ–W"“°¢&WGW&âö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ†—FVÒÓâ¶—FVÒæ¶W’ÂçVÖ&W"†&6Sòå¶—FVÒæ¶W•ÒÇÂ’²çVÖ&W"†&öçW5¶—FVÒæ¶W•ÒÇÂ•Ò’“°¢Ð¢gVæ7F–öâÖÆVv7”—FVÕG—UcS"‡fÇVR’°¢6öç7B&rÒ7G&–ær‡fÇVRÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢–b‡&rÓÓÒwvVöâr’&WGW&âwvVöâs°¢–b…²w6†–VÆBrÂw6†–VÆG2rÂ}"rÂ}-²uÒæ–æ6ÇVFW2‡&r’’&WGW&âw6†–VÆBs°¢–b‡&rÓÓÒv&Ö÷"r’&WGW&âv&Ö÷"s°¢–b‡&rÓÓÒv–×ÆçBr’&WGW&âv–×ÆçBs°¢–b…²vÖÖòrÂvÖ×Væ—F–öârÂ}ý-íÝ²rÂ}í]ýý²uÒæ–æ6ÇVFW2‡&r’’&WGW&âvÖÖòs°¢–b…²v&6·6²rÂ}í­}¢rÂ}í­}­‚uÒæ–æ6ÇVFW2‡&r’’&WGW&âv&6·6²s°¢–b…²vw&VæFRrÂvw&VæFW2rÂ}=Ý-rÂ}=Ý-²uÒæ–æ6ÇVFW2‡&r’’&WGW&âvw&VæFRs°¢–b…²wGW'&WBrÂwGW'&WG2rÂ}-=]½ÂrÂ}-=]½‚uÒæ–æ6ÇVFW2‡&r’’&WGW&âwGW'&WBs°¢–b…²vG&öæRrÂvG&öæW2rÂ}MíÒrÂ}MíÝ²uÒæ–æ6ÇVFW2‡&r’’&WGW&âvG&öæRs°¢–b…²w7Fö6²rÂw7Fö6·2rÂw6†&RrÂw6†&W2uÒæ–æ6ÇVFW2‡&r’’&WGW&âw7Fö6²s°¢&WGW&âvvV"s°¢Ð¢gVæ7F–öâ—57Fö6´WV—ÖVçEcs2†—FVÒÒ·Ò’°¢6öç7BFw2Ò'&’æ—4'&’†—FVÒçFw2’ò—FVÒçFw2æÖ‡FrÓâ7G&–ær‡FrÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚’’¢µÓ°¢&WGW&â²w7Fö6²rÂw7Fö6·2rÂw6†&RrÂw6†&W2uÒæ–æ6ÇVFW2…7G&–ær†—FVÒçG—RÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚’’ÇÂ7G&–ær†—FVÒæ–BÇÂrr’çFôÆ÷vW$66R‚’ç7F'G5v—F‚‚w7Fö6µòr’ÇÂõí­m‚ƒó¥Ç7ÂB’ö’çFW7B…7G&–ær†—FVÒææÖRÇÂrr’çG&–Ò‚’’ÇÂFw2ç6öÖR‡FrÓâ²}­m‚rÂw7Fö6²rÂw7Fö6·2rÂw6†&RrÂw6†&W2uÒæ–æ6ÇVFW2‡Fr’“°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦U&WV—&VÖVçG5cS"‡fÇVRÒ·Ò’°¢&WGW&âö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ†—FVÒÓâ¶—FVÒæ¶W’ÂÖF‚æÖ‚ƒÂçVÖ&W"‡fÇVSòå¶—FVÒæ¶W•ÒÇÂ’•Ò’“°¢Ð ¢6öç7Bõöæ÷&ÖÆ—¦TWV—ÖVçD—FVÕcS"Òæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc#°¢æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"ÒgVæ7F–öâ†—FVÒÒ·Ò’°¢6öç7B&rÒ²âââ†—FVÒÇÂ·Ò’Ó°¢6öç7BæW‡BÒõöæ÷&ÖÆ—¦TWV—ÖVçD—FVÕcS"‡&r“°¢æW‡BçG—RÒ—57Fö6´WV—ÖVçEcs2‡&r’òw7Fö6²r¢ÖÆVv7”—FVÕG—UcS"‡&rçG—RÇÂæW‡BçG—R“°¢æW‡Bçf—6–&–Æ—G’Òf—6–&–Æ—G•cS"‡&r“°¢æW‡Bç&WV—&VÖVçG2Òæ÷&ÖÆ—¦U&WV—&VÖVçG5cS"‡&rç&WV—&VÖVçG2ÇÂ&ræ6†&7FW&—7F–5&WV—&VÖVçG2ÇÂ·Ò“°¢6öç7BGF6´—FVÒÒ²wvVöârÂwGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æW‡BçG—R“°¢6öç7BFÖvT—FVÒÒGF6´—FVÒÇÂæW‡BçG—RÓÓÒvw&VæFRs°¢æW‡BæFÖvRÒFÖvT—FVÒò7G&–ær‡&ræFÖvRÇÂrr’çG&–Ò‚’¢rs°¢æW‡Bæ†—D&öçW2ÒGF6´—FVÒòçVÖ&W"‡&ræ†—D&öçW2ÇÂ&ræGF6´&öçW2ÇÂ’¢°¢æW‡Bç&ævRÒGF6´—FVÒòÖF‚æÖ‚ƒÂçVÖ&W"‡&rç&ævRóò&ræGF6µ&ævRóò&ræÖ…&ævRóò’’¢°¢æW‡BçvVöå6Æ÷BÒæW‡BçG—RÓÓÒwvVöârò7G&–ær‡&rçvVöå6Æ÷BÇÂw&–Ö'’r’¢æW‡BçG—RÓÓÒw6†–VÆBròw&–Ö'’r¢rs°¢æW‡Bæw&VæFU&ævRÒæW‡BçG—RÓÓÒvw&VæFRròÖF‚æÖ‚ƒÂçVÖ&W"‡&ræw&VæFU&ævRóò&rçF‡&÷u&ævRóò&rç&ævRóòb’ÇÂ’¢°¢æW‡Bæw&VæFU&F—W2ÒæW‡BçG—RÓÓÒvw&VæFRròÖF‚æÖ‚ƒÂçVÖ&W"‡&ræw&VæFU&F—W2óò&ræ&Æ7E&F—W2óò&rç&F—W2óò"’ÇÂ’¢°¢æW‡BçVæ—D‡Ò²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æW‡BçG—R’òÖF‚æÖ‚ƒÂçVÖ&W"‡&rçVæ—D‡óò&ræ‡Ö‚óò&ræ‡óò’ÇÂ’¢°¢æW‡BçVæ—D&Ö÷$6Æ72Ò²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æW‡BçG—R’òÖF‚æÖ‚ƒÂçVÖ&W"‡&rçVæ—D&Ö÷$6Æ72óò&ræ&Ö÷$6Æ72óò&ræFVfVç6Róò’’¢°¢æW‡BçVæ—Ef—6–öå&ævRÒ²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æW‡BçG—R’òÖF‚æÖ‚ƒÂçVÖ&W"‡&rçVæ—Ef—6–öå&ævRóò&rçf—6–öå&ævRóòb’ÇÂ’¢°¢æW‡BçVæ—DÖ÷fU&ævRÒ²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æW‡BçG—R’òÖF‚æÖ‚ƒÂçVÖ&W"‡&rçVæ—DÖ÷fU&ævRóò&ræÖ÷fU&ævRóò†æW‡BçG—RÓÓÒvG&öæRròb¢’’ÇÂ’¢°¢æW‡BçVæ—D–æ—F–F—fRÒ²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æW‡BçG—R’òçVÖ&W"‡&rçVæ—D–æ—F–F—fRóò&ræ–æ—F–F—fRóò’ÇÂ¢°¢æW‡Bæ&Ö÷$6Æ72ÒæW‡BçG—RÓÓÒv&Ö÷"ròÖF‚æÖ‚ƒÂçVÖ&W"‡&ræ&Ö÷$6Æ72ÇÂ’’¢°¢æW‡BæVæW&w•&WV—&VBÒæW‡BçG—RÓÓÒv–×ÆçBròÖF‚æÖ‚ƒÂçVÖ&W"‡&ræVæW&w•&WV—&VBóò&ræVæW&w”6÷7Bóò’’¢°¢æW‡Bæ7&VF–öä6÷7BÒ6Æ×„ÖF‚æÖ‚ƒÂçVÖ&W"‡&ræ7&VF–öä6÷7Bóò&ræ6†&7FW$7&VF–öä6÷7Bóò’’ÂÂ“°¢æW‡Bæf–Æ&ÆT57F'F–ærÒ&ræf–Æ&ÆT57F'F–ærÓÓÒG'VRÇÂ7G&–ær‡&ræf–Æ&ÆT57F'F–ærÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒwG'VRs°¢FVÆWFRæW‡BæVæW&w”FVÇF°¢FVÆWFRæW‡BæÖV6†æ–5G—S°¢FVÆWFRæW‡BæÖV6†æ–3°¢FVÆWFRæW‡BæFV7'—F÷$ÖöFS°¢FVÆWFRæW‡BæÖV6†æ–4ÖöFS°¢FVÆWFRæW‡BæÖV6†æ–5F—FÆS°¢FVÆWFRæW‡BæFV7'—F÷$FVfVÇD6—†W#°¢FVÆWFRæW‡BæÖV6†æ–4†–çC°¢FVÆWFRæW‡BæÖV6†æ–5F–ÖTÆ–Ö—C°¢FVÆWFRæW‡BæÖV6†æ–46öFTÆVæwFƒ°¢FVÆWFRæW‡BæÖV6†æ–56Æ÷G3°¢&WGW&âæW‡C°¢Ó° ¢6öç7Bõöæ÷&ÖÆ—¦UÆ–W%&öf–ÆUcS"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc#°¢æ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"ÒgVæ7F–öâ‡W6W"Ò·Ò’°¢6öç7B6÷W&6RÒ²âââ‡W6W"ÇÂ·Ò’Ó°¢6öç7BæW‡BÒõöæ÷&ÖÆ—¦UÆ–W%&öf–ÆUcS"‡6÷W&6R“°¢æW‡Bæ&÷fÅ7FGW2Ò7G&–ær‡6÷W&6Ræ&÷fÅ7FGW2ÇÂæW‡Bæ&÷fÅ7FGW2ÇÂv&÷fVBr’çFôÆ÷vW$66R‚“°¢–b‚$õdÅõcS"æ†2†æW‡Bæ&÷fÅ7FGW2’’æW‡Bæ&÷fÅ7FGW2Òv&÷fVBs°¢–b…7G&–ær†æW‡Bç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’æW‡Bæ&÷fÅ7FGW2Òv&÷fVBs°¢æW‡Bç6ö6–Ä÷&–v–ä–BÒ7G&–ær‡6÷W&6Rç6ö6–Ä÷&–v–ä–BÇÂæW‡Bç6ö6–Ä÷&–v–ä–BÇÂrr’çG&–Ò‚“°¢æW‡BævVöw&†–4÷&–v–ä–BÒ7G&–ær‡6÷W&6RævVöw&†–4÷&–v–ä–BÇÂæW‡BævVöw&†–4÷&–v–ä–BÇÂrr’çG&–Ò‚“°¢æW‡BçW'6öæÆ—G•G&—BÒ7G&–ær‡6÷W&6RçW'6öæÆ—G•G&—BóòæW‡BçW'6öæÆ—G•G&—Bóòrr’çG&–Ò‚“°¢æW‡Bæ–FVÂÒ7G&–ær‡6÷W&6Ræ–FVÂóòæW‡Bæ–FVÂóòrr’çG&–Ò‚“°¢æW‡BçvV¶æW72Ò7G&–ær‡6÷W&6RçvV¶æW72óòæW‡BçvV¶æW72óòrr’çG&–Ò‚“°¢æW‡Bç7F'F–ætWV—ÖVçD–G2ÒVæ—VU7G&–æw5cS"‡6÷W&6Rç7F'F–ætWV—ÖVçD–G2ÇÂæW‡Bç7F'F–ætWV—ÖVçD–G2ÇÂµÒ“°¢æW‡Bæ7&VF–öåö–çG57VçBÒÖF‚æÖ‚ƒÂçVÖ&W"‡6÷W&6Ræ7&VF–öåö–çG57VçBóòæW‡Bæ7&VF–öåö–çG57VçBóò’“°¢æW‡Bç7FG2Ò²âââ†æW‡Bç7FG2ÇÂ·Ò’Â&6T&Ö÷$6Æ73¢ÖF‚æÖ‚ƒÂçVÖ&W"‡6÷W&6Rç7FG3òæ&6T&Ö÷$6Æ72óòæW‡Bç7FG3òæ&6T&Ö÷$6Æ72óò’’Ó°¢6öç7B&6U6÷W&6RÒ6÷W&6Ræ&–Æ—G”&6RbbG—Vöb6÷W&6Ræ&–Æ—G”&6RÓÓÒvö&¦V7Brò6÷W&6Ræ&–Æ—G”&6R¢†æW‡Bæ&–Æ—F–W2ÇÂ·Ò“°¢æW‡Bæ&–Æ—G”&6RÒö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ†—FVÒÓâ¶—FVÒæ¶W’ÂçVÖ&W"†&6U6÷W&6Sòå¶—FVÒæ¶W•ÒÇÂ•Ò’“°¢æW‡Bæ&–Æ—F–W2ÒVffV7F—fT&–Æ—F–W5cS"‡²ââææW‡BÂ&–Æ—G”&6S¢æW‡Bæ&–Æ—G”&6RÒ“°¢æW‡Bæ–ç7FÆÆVD–×ÆçD–G2ÒVæ—VU7G&–æw5cS"‡6÷W&6Ræ–ç7FÆÆVD–×ÆçD–G2ÇÂæW‡Bæ–ç7FÆÆVD–×ÆçD–G2’æf–ÇFW"†–BÓâUT•ÔTåCòå¶–EÒÇÂæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"„UT•ÔTåE¶–EÒ’çG—RÓÓÒv–×ÆçBr“°¢6öç7BWV—VD&Ö÷"ÒUT•ÔTåCòå¶æW‡BæWV—ÖVçE6Æ÷G3òæ&Ö÷"ÇÂruÓ°¢6öç7BWV—VD&Ö÷$6Æ72ÒWV—VD&Ö÷"bbÖÆVv7”—FVÕG—UcS"†WV—VD&Ö÷"çG—R’ÓÓÒv&Ö÷"ròçVÖ&W"†WV—VD&Ö÷"æ&Ö÷$6Æ72ÇÂ’¢°¢æW‡Bç7FG2æ&Ö÷$6Æ72ÒWV—VD&Ö÷$6Æ72âòWV—VD&Ö÷$6Æ72¢çVÖ&W"†æW‡Bç7FG2æ&6T&Ö÷$6Æ72ÇÂ“°¢&WGW&âæW‡C°¢Ó° ¢gVæ7F–öâvWDVffV7F—fT&Ö÷$6Æ75cS"‡Æ–W"Ò·Ò’°¢6öç7BW6W"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡Æ–W"“°¢6öç7B&Ö÷"ÒUT•ÔTåCòå·W6W"æWV—ÖVçE6Æ÷G3òæ&Ö÷"ÇÂruÓ°¢6öç7B—FVÒÒ&Ö÷"òæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†&Ö÷"’¢çVÆÃ°¢&WGW&â—FVÒbb—FVÒçG—RÓÓÒv&Ö÷"rbbçVÖ&W"†—FVÒæ&Ö÷$6Æ72ÇÂ’âòçVÖ&W"†—FVÒæ&Ö÷$6Æ72’¢çVÖ&W"‡W6W"ç7FG3òæ&6T&Ö÷$6Æ72ÇÂ“°¢Ð¢gVæ7F–öâ—FVÔÖVWG5&WV—&VÖVçG5cS"†—FVÒÒ·ÒÂÆ–W"Òæ7W'&VçEW6W"’°¢–b‚Æ–W"’&WGW&âG'VS°¢6öç7B&WÒæ÷&ÖÆ—¦U&WV—&VÖVçG5cS"†—FVÒç&WV—&VÖVçG2ÇÂ·Ò“°¢6öç7B&–Æ—F–W2ÒVffV7F—fT&–Æ—F–W5cS"†æ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡Æ–W"’“°¢&WGW&â$”Ä•D”U5õcS"æWfW'’‡&÷rÓâçVÖ&W"†&–Æ—F–W5·&÷ræ¶W•ÒÇÂ’ãÒçVÖ&W"‡&W·&÷ræ¶W•ÒÇÂ’“°¢Ð¢gVæ7F–öâ&WV—&VÖVçG5FW‡EcS"†—FVÒÒ·Ò’°¢6öç7B&WÒæ÷&ÖÆ—¦U&WV—&VÖVçG5cS"†—FVÒç&WV—&VÖVçG2ÇÂ·Ò“°¢6öç7B&÷w2Ò$”Ä•D”U5õcS"æf–ÇFW"‡&÷rÓâ&W·&÷ræ¶W•Òâ’æÖ‡&÷rÓâG·&÷rç6†÷'GÒG·&W·&÷ræ¶W•×Ö“°¢&WGW&â&÷w2æÆVæwF‚ò&÷w2æ¦ö–â‚r+rr’¢}Ý]"s°¢Ð ¢6öç7Bõö—FVÔW‡G&7VÖÖ'•cS"Ò—FVÔW‡G&7VÖÖ'•c#°¢—FVÔW‡G&7VÖÖ'•c"ÒgVæ7F–öâ†—FVÒÒ·Ò’°¢6öç7Bæ÷&ÒÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ“°¢6öç7BG—TÆ&VÂÒ‡¶vV#¢}
Ýým]ÝRrÇvVöã¢}	í=mRrÇ6†–VÆC¢}
-²rÆw&VæFS¢}	=Ý-rÇGW'&WC¢}
-=]½ÂrÆG&öæS¢}	MíÒrÆ&Ö÷#¢}	íÝòrÆ&6·6³¢}
í­}¢rÆ–×ÆçC¢}	Íý½Ý"rÇ7Fö6³¢}	­m‚wÒ•¶æ÷&ÒçG—UÒÇÂ}
Ýým]ÝRs°¢6öç7B&—G2Ò·G—TÆ&VÅÓ°¢–b†æ÷&Òç&&—G’’&—G2çW6‚†æ÷&Òç&&—G’“°¢–b…²wvVöârÂvw&VæFRrÂwGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æ÷&ÒçG—R’bbæ÷&ÒæFÖvR’&—G2çW6‚†=íÒG¶æ÷&ÒæFÖvWÖ“°¢–b…²wvVöârÂwGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æ÷&ÒçG—R’bbçVÖ&W"†æ÷&Òç&ævRÇÂ’’&—G2çW6‚†M½ÍÝí-ÂG¶æ÷&Òç&ævWÖ“°¢–b†æ÷&ÒçG—RÓÓÒvw&VæFRr’&—G2çW6‚†íí¢G¶æ÷&Òæw&VæFU&ævWÖÂM=G¶æ÷&Òæw&VæFU&F—W7Ö“°¢–b…²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æ÷&ÒçG—R’’&—G2çW6‚†…G¶æ÷&ÒçVæ—D‡ÖÂ	­	G¶æ÷&ÒçVæ—D&Ö÷$6Æ77ÖÂM-m]ÝRG¶æ÷&ÒçVæ—DÖ÷fU&ævWÖ“°¢–b…²wvVöârÂwGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æ÷&ÒçG—R’bbçVÖ&W"†æ÷&Òæ†—D&öçW2ÇÂ’’&—G2çW6‚†G¶æ÷&Òæ†—D&öçW2ãÒòr²r¢rwÒG¶æ÷&Òæ†—D&öçW7Ò¢ýíýMÝæ“°¢–b†æ÷&ÒçG—RÓÓÒv&Ö÷"rbbçVÖ&W"†æ÷&Òæ&Ö÷$6Æ72ÇÂ’’&—G2çW6‚†	­	G¶æ÷&Òæ&Ö÷$6Æ77Ö“°¢–b†æ÷&ÒçG—RÓÓÒv–×ÆçBrbbçVÖ&W"†æ÷&ÒæVæW&w•&WV—&VBÇÂ’’&—G2çW6‚†G¶æ÷&ÒæVæW&w•&WV—&VGÒTæ“°¢–b…²wvVöârÂv&Ö÷"rÂv&6·6²rÂv–×ÆçBuÒæ–æ6ÇVFW2†æ÷&ÒçG—R’’&—G2çW6‚†-]í-Ýó¢G·&WV—&VÖVçG5FW‡EcS"†æ÷&Ò—Ö“°¢&WGW&â&—G2æf–ÇFW"„&ööÆVâ’æ¦ö–â‚r+rr“°¢Ó° ¢gVæ7F–öâ÷&–v–å6V7F–öå–ÆöEcS"†¶–æB’°¢6öç7BÖÒ¶–æBÓÓÒw6ö6–Ârò4ô4”Åôõ$”t”å5õcS"¢tTôu$„”5ôõ$”t”å5õcS#°¢6öç7BÖ¶W’Ò¶–æBÓÓÒw6ö6–Âròu4ô4”Åôõ$”t”å2r¢ttTôu$„”5ôõ$”t”å2s°¢6öç7BÆ—7D¶W’Ò¶–æBÓÓÒw6ö6–Âròu4ô4”Åôõ$”t”åôÄ•5Br¢ttTôu$„”5ôõ$”t”åôÄ•5Bs°¢6öç7B–ÆöDÖÒ¶–æBÓÓÒvvVöw&†–2p¢òö&¦V7Bæg&öÔVçG&–W2„ö&¦V7BæVçG&–W2†ÖÇÂ·Ò’æÖ‚…¶–BÂ&uÒ’Óâ°¢6öç7B÷&–v–âÒæ÷&ÖÆ—¦T÷&–v–åcS"‡&rÂvvVõö÷&–v–âr“°¢6öç7B66W72ÒFW&—fT÷&–v–ä66W75cc†÷&–v–â“°¢÷&–v–âæw&çFVEÆæWD–G2Ò66W72æÆ–æ¶VEÆæWD–G3°¢÷&–v–âæw&çFVE7—7FVÔ–G2Ò66W72æÆ–æ¶VE7—7FVÔ–G3°¢&WGW&â¶–BÂ÷&–v–åÓ°¢Ò’¢¢Ö°¢&WGW&â²¶Ö¶W•Ó¢FVW‡–ÆöDÖ’Â¶Æ—7D¶W•Ó¢6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2‡–ÆöDÖ’’æÖ†FVW’Ó°¢Ð ¢gVæ7F–öâ&Vg&W6„WV—ÖVçDFW&—fVEcS"‚’°¢UT•ÔTåEôÄ•5BÒ6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2„UT•ÔTåBÇÂ·Ò’æÖ†æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"’“°¢tTôåôõD”ôå2ÒUT•ÔTåEôÄ•5Bæf–ÇFW"†—FVÒÓâ—FVÒçG—RÓÓÒwvVöâr“°¢$Ôõ%ôõD”ôå2ÒUT•ÔTåEôÄ•5Bæf–ÇFW"†—FVÒÓâ—FVÒçG—RÓÓÒv&Ö÷"r“°¢–b‡v÷&ÆDFFòæWV—ÖVçB’°¢v÷&ÆDFFæWV—ÖVçBäUT•ÔTåBÒUT•ÔTåC°¢v÷&ÆDFFæWV—ÖVçBäUT•ÔTåEôÄ•5BÒUT•ÔTåEôÄ•5C°¢v÷&ÆDFFæWV—ÖVçBåtTôåôõD”ôå2ÒtTôåôõD”ôå3°¢v÷&ÆDFFæWV—ÖVçBä$Ôõ%ôõD”ôå2Ò$Ôõ%ôõD”ôå3°¢Ð¢FFæWV—ÖVçBÒUT•ÔTåC°¢Ð ¢6öç7BõöÇ•v÷&ÆDFFcS"ÒÇ•v÷&ÆDFF°¢Ç•v÷&ÆDFFÒgVæ7F–öâ‡–ÆöBÒ·Ò’°¢õöÇ•v÷&ÆDFFcS"‡–ÆöB“°¢4ô4”Åôõ$”t”å5õcS"Òæ÷&ÖÆ—¦T÷&–v–å6V7F–öåcS"‡–ÆöBç6ö6–Ä÷&–v–ç2ÇÂv÷&ÆDFFòç6ö6–Ä÷&–v–ç2ÇÂ·ÒÂw6ö6–Âr“°¢tTôu$„”5ôõ$”t”å5õcS"Òæ÷&ÖÆ—¦T÷&–v–å6V7F–öåcS"‡–ÆöBævVöw&†–4÷&–v–ç2ÇÂv÷&ÆDFFòævVöw&†–4÷&–v–ç2ÇÂ·ÒÂvvVöw&†–2r“°¢v÷&ÆDFFç6ö6–Ä÷&–v–ç2Ò÷&–v–å6V7F–öå–ÆöEcS"‚w6ö6–Âr“°¢v÷&ÆDFFævVöw&†–4÷&–v–ç2Ò÷&–v–å6V7F–öå–ÆöEcS"‚vvVöw&†–2r“°¢FFç6ö6–Ä÷&–v–ç2Ò4ô4”Åôõ$”t”å5õcS#°¢FFævVöw&†–4÷&–v–ç2ÒtTôu$„”5ôõ$”t”å5õcS#°¢f÷"†6öç7B¶–BÂ—FVÕÒöbö&¦V7BæVçG&–W2„UT•ÔTåBÇÂ·Ò’’UT•ÔTåE¶–EÒÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ“°¢&Vg&W6„WV—ÖVçDFW&—fVEcS"‚“°¢f÷"†6öç7B¶–BÂÆ–W%Òöbö&¦V7BæVçG&–W2…Ä”U%õDTÕÄDU2ÇÂ·Ò’’Ä”U%õDTÕÄDU5¶–EÒÒæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡Æ–W"“°¢Ä”U%ôÄ•5BÒ6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2…Ä”U%õDTÕÄDU2ÇÂ·Ò’“°¢–b„òç7FFSòçW6W'2’f÷"†6öç7B¶–BÂÆ–W%Òöbö&¦V7BæVçG&–W2„ç7FFRçW6W'2’’ç7FFRçW6W'5¶–EÒÒæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡Æ–W"“°¢Ó° ¢6öç7Bõö'V–ÆEv÷&ÆE6æ6†÷EcS"Ò'V–ÆEv÷&ÆE6æ6†÷C°¢'V–ÆEv÷&ÆE6æ6†÷BÒgVæ7F–öâ‚’°¢6öç7B6æÒõö'V–ÆEv÷&ÆE6æ6†÷EcS"‚“°¢6æç6ö6–Ä÷&–v–ç2Ò÷&–v–å6V7F–öå–ÆöEcS"‚w6ö6–Âr“°¢6æævVöw&†–4÷&–v–ç2Ò÷&–v–å6V7F–öå–ÆöEcS"‚vvVöw&†–2r“°¢&WGW&â6æ°¢Ó° ¢6öç7Bõö7&VFT&Ææ´VçF—G•cS"Ò7&VFT&Ææ´VçF—G“°¢7&VFT&Ææ´VçF—G’ÒgVæ7F–öâ‡G—R’°¢6öç7B7F×ÒFFRææ÷r‚“°¢–b‡G—RÓÓÒw6ö6–Ä÷&–v–ç2rÇÂG—RÓÓÒvvVöw&†–4÷&–v–ç2r’&WGW&âæ÷&ÖÆ—¦T÷&–v–åcS"‡²–C¢G·G—RÓÓÒw6ö6–Ä÷&–v–ç2ròw&öfW76–öâr¢vvVòwÕö÷&–v–åòG·7F×ÖÂæÖS¢G—RÓÓÒw6ö6–Ä÷&–v–ç2rò}	Ýí-òýíM]òr¢}	Ýí-íRýí]ímM]ÝRrÂFW67&—F–öã¢rrÂ–ÖvS¢rrÂÆö6F–öåG—S¢G—RÓÓÒvvVöw&†–4÷&–v–ç2ròv÷F†W"r¢rrÂ7&VF–öä6÷7C¢Â&–Æ—G”&öçW6W3¢·ÒÂf—6–&–Æ—G“¢²Æ–W$–G3¢µÒÂ6×–vä–G3¢µÒÂW&–G3¢µÒÒÒÂG—RÓÓÒw6ö6–Ä÷&–v–ç2ròw&öfW76–öâr¢vvVõö÷&–v–âr“°¢–b‡G—RÓÓÒvWV—ÖVçBr’&WGW&âæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"‡²–C¢—FVÕòG·7F×ÖÂæÖS¢}	Ýí-½’ý]MÍ]"rÂG—S¢vvV"rÂ&&—G“¢}í½}Ý½’rÂFW63¢rrÂFw3¢µÒÂ7&VF–öä6÷7C¢Âf–Æ&ÆT57F'F–æs¢fÇ6RÂf—6–&–Æ—G“¢²Æ–W$–G3¢µÒÂ6×–vä–G3¢µÒÂW&–G3¢µÒÒÒ“°¢–b‡G—RÓÓÒwÆ–W'2r’&WGW&âæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡²ââåõö7&VFT&Ææ´VçF—G•cS"‡G—R’Â&÷fÅ7FGW3¢v&÷fVBrÂ6ö6–Ä÷&–v–ä–C¢rrÂvVöw&†–4÷&–v–ä–C¢rrÂW'6öæÆ—G•G&—C¢rrÂ–FVÃ¢rrÂvV¶æW73¢rrÂÆÆ÷t7&÷746×–väF—&V7DÖW76vW3¢fÇ6RÂ–ç7FÆÆVD–×ÆçD–G3¢µÒÂ7F'F–ætWV—ÖVçD–G3¢µÒÂ7&VF–öåö–çG57VçC¢Â7FG3¢²‡7W'&VçC¢"Â‡Öƒ¢"Â6†–VÆD7W'&VçC¢Â6†–VÆDÖƒ¢ÂVæW&w”7W'&VçC¢ÂVæW&w”Öƒ¢Â&6T&Ö÷$6Æ73¢ÒÒ“°¢&WGW&âõö7&VFT&Ææ´VçF—G•cS"‡G—R“°¢Ó° ¢gVæ7F–öâ÷&–v–ä÷F–öç5cS"†ÖÂ6VÆV7FVBÒrr’°¢&WGW&âÆ÷F–öâfÇVSÒ"#í	ÝR-½ÝãÂö÷F–öãâG·6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2†ÖÇÂ·Ò’’æÖ†÷&–v–âÓâÆ÷F–öâfÇVSÒ"G¶W62†÷&–v–âæ–B—Ò"G¶÷&–v–âæ–BÓÓÒ6VÆV7FVBòw6VÆV7FVBr¢rwÓâG¶W62†÷&–v–âææÖRÇÂ÷&–v–âæ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr—Ö°¢Ð¢gVæ7F–öâ6×–vå6VÆV7F÷%cS"‡6VÆV7FVD–G2ÒµÒ’°¢6öç7B6VÆV7FVBÒæWr6WB‡Væ—VU7G&–æw5cS"‡6VÆV7FVD–G2’“°¢&WGW&âÆF—b6Æ73Ò'6VÆV7F÷"Öw&–B6ö×7B×6VÆV7F÷"Öw&–B#âG¶6×–vå&÷w5cS"‚’æÖ†2ÓâÆÆ&VÂ6Æ73Ò'6VÆV7F÷"Ö6&B#ãÆ–çWBG—SÒ&6†V6¶&÷‚"æÖSÒ&6×–vä–G2"fÇVSÒ"G¶W62†2æ–B—Ò"G·6VÆV7FVBæ†2†2æ–B’òv6†V6¶VBr¢rwÒóãÇ7ãâG¶W62†2ææÖRÇÂ2æ–B—ÒG¶2æf–Æ&ÆTæ÷rÓÓÒfÇ6Ròr+r	Ý	]	M	í

-
=	ý	Ý	r¢rwÓÂ÷7ããÂöÆ&VÃæ’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	­ÍýÝ’Ý]"ãÂöF—câwÓÂöF—cæ°¢Ð¢gVæ7F–öâ–×ÆçE6VÆV7F÷%cS"‡6VÆV7FVD–G2ÒµÒ’°¢6öç7B6VÆV7FVBÒæWr6WB‡Væ—VU7G&–æw5cS"‡6VÆV7FVD–G2’“°¢6öç7B—FV×2Ò6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2„UT•ÔTåBÇÂ·Ò’æÖ†æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"’æf–ÇFW"†—FVÒÓâ—FVÒçG—RÓÓÒv–×ÆçBr’“°¢&WGW&âÆF—b6Æ73Ò'6VÆV7F÷"Öw&–B6ö×7B×6VÆV7F÷"Öw&–B#âG¶—FV×2æÖ†—FVÒÓâÆÆ&VÂ6Æ73Ò'6VÆV7F÷"Ö6&B#ãÆ–çWBG—SÒ&6†V6¶&÷‚"æÖSÒ&–ç7FÆÆVD–×ÆçD–G2"fÇVSÒ"G¶W62†—FVÒæ–B—Ò"G·6VÆV7FVBæ†2†—FVÒæ–B’òv6†V6¶VBr¢rwÒóãÇ7ãâG¶W62†—FVÒææÖRÇÂ—FVÒæ–B—Ò+rG´çVÖ&W"†—FVÒæVæW&w•&WV—&VBÇÂ—ÒTãÂ÷7ããÂöÆ&VÃæ’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Íý½Ý-²]ÝRí}MÝ²ãÂöF—câwÓÂöF—cæ°¢Ð¢gVæ7F–öâ&WV—&VÖVçD–çWG5cS"†—FVÒÒ·Ò’°¢6öç7B&WÒæ÷&ÖÆ—¦U&WV—&VÖVçG5cS"†—FVÒç&WV—&VÖVçG2ÇÂ·Ò“°¢&WGW&âÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
-]í-Ýò]­-]-£ÂöF—cãÆF—b6Æ73Ò&&–Æ—G’×&WV—&VÖVçG2×cS"#âG´$”Ä•D”U5õcS"æÖ‡&÷rÓâÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃâG¶W62‡&÷ræÆ&VÂ—ÓÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"æÖSÒ'&WòG·&÷ræ¶W—Ò"fÇVSÒ"G´çVÖ&W"‡&W·&÷ræ¶W•ÒÇÂ—Ò"óãÂöF—cæ’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð¢gVæ7F–öâ÷&–v–ä&öçW6W4–çWG5cS"†÷&–v–âÒ·Ò’°¢6öç7B&öçW6W2Òæ÷&ÖÆ—¦T&öçW4ÖcS"†÷&–v–âæ&–Æ—G”&öçW6W2ÇÂ·Ò“°¢&WGW&âÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ÍíMM­-í²]­-]-£ÂöF—cãÆF—b6Æ73Ò&&–Æ—G’×&WV—&VÖVçG2×cS"#âG´$”Ä•D”U5õcS"æÖ‡&÷rÓâÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃâG¶W62‡&÷ræÆ&VÂ—ÓÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""7FWÒ#"æÖSÒ&&öçW5òG·&÷ræ¶W—Ò"fÇVSÒ"G´çVÖ&W"†&öçW6W5·&÷ræ¶W•ÒÇÂ—Ò"óãÂöF—cæ’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð ¢6öæf–wW&F÷"ç&VæFW$÷&–v–äVF—F÷%cS"ÒgVæ7F–öâ†VçF—G’Â¶–æB’°¢6öç7B÷&–v–âÒæ÷&ÖÆ—¦T÷&–v–åcS"†VçF—G’Â¶–æBÓÓÒw6ö6–Âròw&öfW76–öâr¢vvVõö÷&–v–âr“°¢6öç7B—5&öfW76–öâÒ¶–æBÓÓÒw6ö6–Âs°¢6öç7BvVõG—W2Ò°¢²v6—G’rÂ}	=ííBuÒÂ²wÆæWBrÂ}	ý½Ý]-uÒÂ²w&Vv–öârÂ}
]=íÒòí½-ÂuÒÀ¢²w7FF–öârÂ}
-ÝmòuÒÂ²v6öÆöç’rÂ}	­í½íÝòòýí]½]ÝRuÒÂ²v÷F†W"rÂ}	M==íRÍ]-âuÐ¢Ó°¢&WGW&âÆf÷&Ò–CÒ&6öæf–rÖVF—F÷"Öf÷&Ò"6Æ73Ò&f÷&Ò"FFÖVçF—G’×G—SÒ"G¶—5&öfW76–öâòw6ö6–Ä÷&–v–ç2r¢vvVöw&†–4÷&–v–ç2wÒ#à¢G·F†—2ç&VæFW$†VFW"†÷&–v–âÂ—5&öfW76–öâò}	ýíM]òý]íÝm¢}Ýý-RÂ]Í]½âÂ½=m½‚ím½ÍÝòí½ÂMâÝ}½ý­½í}]Ý’âr¢}	=]í=M}]­íRýí]ímM]ÝS¢=ííBÂý½Ý]-Â]=íÒÂ-ÝmòÂ­í½íÝò½‚ÝíRÍ]-âÂí-­=MíMíÂý]íÝbâr—Ð¢G¶–ÖvTf–VÆDÖ&·W†÷&–v–âÂ—5&öfW76–öâò}	}ím]ÝRýíM]‚r¢}	}ím]ÝRÍ]-ýí]ímM]Ýòr—Ð¢ÆF—b6Æ73Ò&6öÇ32#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃä”CÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&–B"fÇVSÒ"G¶W62†÷&–v–âæ–B—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Ý}-ÝSÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&æÖR"fÇVSÒ"G¶W62†÷&–v–âææÖR—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-íÍí-Âí}MÝóÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"ÖƒÒ#"7FWÒ#"æÖSÒ&7&VF–öä6÷7B"fÇVSÒ"G´çVÖ&W"†÷&–v–âæ7&VF–öä6÷7BÇÂ—Ò"óãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	rí]=âíMm]-ý]íÝm"í}­í"ãÂöF—cãÂöF—cãÂöF—cà¢G²—5&öfW76–öâòÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-òÍ]-ÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&Æö6F–öåG—R#âG¶vVõG—W2æÖ‚…·fÇVRÆÆ&VÅÒ’ÓâÆ÷F–öâfÇVSÒ"G·fÇVWÒ"Gµ7G&–ær†÷&–v–âæÆö6F–öåG—RÇÂv÷F†W"r’ÓÓÒfÇVRòw6VÆV7FVBr¢rwÓâG¶Æ&VÇÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
-òÝ=m]Ò-í½Í­âM½òýíÝý-Ýí=âí-ím]Ýò=í­2â	ýí]ímM]Ý]ÂÍím]"½-Â­¢­íÝ­]-Ý½’=ííBÂ-¢‚m]½òý½Ý]-ãÂöF—cãÂöF—câG¶÷&–v–ä66W74f–VÆG5cc†÷&–v–â—Ö¢rwÐ¢G·F†—2ç&VæFW%f—6–&–Æ—G”f–VÆB†÷&–v–â—Ð¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
}-Ý=-íRíýÝSÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V÷&–v–âÖÆöærÖFW67&—F–öâ×cSB"æÖSÒ&FW67&—F–öâ"Æ6V†öÆFW#Ò-	ýíMíÝâíý-R-íâÂ­=½Í-=2Âíý}ÝÝí-‚Âírm}Ý‚Â]ý=-mâ‚-âÂ}-â=í­2-mÝâ}Ý-Âý]]B-½ííÂâ#âG¶W62†÷&–v–âæFW67&—F–öâÇÂrr—ÓÂ÷FW‡F&VãÂöF—cà¢G¶÷&–v–ä&öçW6W4–çWG5cS"†÷&–v–â—Ð¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#âG¶—5&öfW76–öâòu4dUõ$ôdU54”ôâr¢u4dUôõ$”t”âwÓÂö'WGFöãà¢Âöf÷&Óæ°¢Ó° ¢gVæ7F–öâVæ—D6öÖ&D—FVÔf–VÆG5cR†—FVÒÒ·ÒÂÆ&VÂÒ}
íÝ"r’°¢&WGW&âÆF—b6Æ73Ò&6öÇ32#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
=íÒ--í]ÝÝí’-­ƒÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&FÖvR"fÇVSÒ"G¶W62†—FVÒæFÖvRÇÂrr—Ò"Æ6V†öÆFW#Ò-ÝýÍ]&Cb"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	M½ÍÝí-Â-­‚=]­²“ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ'&ævR"fÇVSÒ"G´çVÖ&W"†—FVÒç&ævRÇÂ—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	íÝ=¢ýíýMÝãÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""7FWÒ#"æÖSÒ&†—D&öçW2"fÇVSÒ"G´çVÖ&W"†—FVÒæ†—D&öçW2ÇÂ—Ò"óãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&6öÇ32#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃä…ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ'Væ—D‡"fÇVSÒ"G´çVÖ&W"†—FVÒçVæ—D‡ÇÂ—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	­½íÝ‚ò}-³ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ'Væ—D&Ö÷$6Æ72"fÇVSÒ"G´çVÖ&W"†—FVÒçVæ—D&Ö÷$6Æ72óò—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Ým--ýâ=Íí½}ÝãÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""7FWÒ#"æÖSÒ'Væ—D–æ—F–F—fR"fÇVSÒ"G´çVÖ&W"†—FVÒçVæ—D–æ—F–F—fRÇÂ—Ò"óãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	M½ÍÝí-Â-MÍí-‚=]­²“ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ'Væ—Ef—6–öå&ævR"fÇVSÒ"G´çVÖ&W"†—FVÒçVæ—Ef—6–öå&ævRÇÂ—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	M½ÍÝí-ÂM-m]Ýò=]­²“ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ'Væ—DÖ÷fU&ævR"fÇVSÒ"G´çVÖ&W"†—FVÒçVæ—DÖ÷fU&ævRÇÂ—Ò"óãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62†Æ&VÂ—Òýíý-½ý]-ò-â-­½M­R*½
íÝ-¼+²]M­-ím]Ò‚=}--=]""Ým--Râ	-R-­-}]­RM½ÍÝí-‚}Mí-ò"=]­RãÂöF—cæ°¢Ð ¢6öæf–wW&F÷"ç&VæFW$WV—ÖVçDVF—F÷"ÒgVæ7F–öâ‡&t—FVÒ’°¢6öç7B—FVÒÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"‡&t—FVÒ“°¢6öç7B—5vVöâÒ—FVÒçG—RÓÓÒwvVöâs°¢6öç7B—56†–VÆBÒ—FVÒçG—RÓÓÒw6†–VÆBs°¢6öç7B—4w&VæFRÒ—FVÒçG—RÓÓÒvw&VæFRs°¢6öç7B—5GW'&WBÒ—FVÒçG—RÓÓÒwGW'&WBs°¢6öç7B—4G&öæRÒ—FVÒçG—RÓÓÒvG&öæRs°¢6öç7B—4&Ö÷"Ò—FVÒçG—RÓÓÒv&Ö÷"s°¢6öç7B—4–×ÆçBÒ—FVÒçG—RÓÓÒv–×ÆçBs°¢6öç7B—57Fö6²Ò—FVÒçG—RÓÓÒw7Fö6²s°¢&WGW&âÆf÷&Ò–CÒ&6öæf–rÖVF—F÷"Öf÷&Ò"6Æ73Ò&f÷&ÒWV—ÖVçBÖVF—F÷"×cS""FFÖVçF—G’×G—SÒ&WV—ÖVçB"FFÖ—FVÒ×G—SÒ"G¶W62†—FVÒçG—R—Ò#à¢G·F†—2ç&VæFW$†VFW"†—FVÒÂ}	ý]MÍ]-²}M]½]Ý²ÝÝým]ÝRÂí=mRÂ-²Â=Ý-²Â-=]½‚ÂMíÝ²ÂíÝâÂÍý½Ý-²‚­m‚âr—Ð¢G¶–ÖvTf–VÆDÖ&·W†—FVÒÂ}	}ím]ÝRý]MÍ]-r—Ð¢ÆF—b6Æ73Ò&6öÇ32#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃä”CÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&–B"fÇVSÒ"G¶W62†—FVÒæ–B—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	­-]=íóÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ'G—R#âG´•DTÕõE•U5õcS"æÖ†÷BÓâÆ÷F–öâfÇVSÒ"G¶÷BçfÇVWÒ"G¶÷BçfÇVRÓÓÒ—FVÒçG—Ròw6VÆV7FVBr¢rwÓâG¶W62†÷BæÆ&VÂ—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
]M­í-ÃÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ'&&—G’#âG´•DTÕõ$$•E•ôõD”ôå5õc"æÖ‡"ÓâÆ÷F–öâfÇVSÒ"G¶W62‡"—Ò"G·"ÓÓÒ—FVÒç&&—G’òw6VÆV7FVBr¢rwÓâG¶W62‡"—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Ý}-ÝSÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&æÖR"fÇVSÒ"G¶W62†—FVÒææÖRÇÂrr—Ò"óãÂöF—cà¢G·F†—2ç&VæFW%f—6–&–Æ—G”f–VÆB†—FVÒ—Ð¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	íýÝSÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V"æÖSÒ&FW62#âG¶W62†—FVÒæFW62ÇÂrr—ÓÂ÷FW‡F&VãÂöF—cà¢ÆF—b6Æ73Ò&—FVÒ×7V6–f–2×cS"G¶—5vVöâòrr¢v†–FFVâwÒ"FFÖf÷"Ö—FVÓÒ'vVöâ#à¢ÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
=íÓÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&FÖvR"fÇVSÒ"G¶W62†—FVÒæFÖvRÇÂrr—Ò"Æ6V†öÆFW#Ò-ÝýÍ]&Cb³"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	M½ÍÝí-Â=]­²“ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ'&ævR"fÇVSÒ"G´çVÖ&W"†—FVÒç&ævRÇÂ—Ò"óãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	"=]­RãÂöF—cãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	íÝ=¢ýíýMÝãÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""æÖSÒ&†—D&öçW2"fÇVSÒ"G´çVÖ&W"†—FVÒæ†—D&öçW2ÇÂ—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
½í#ÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ'vVöå6Æ÷B#âGµtTôåõ4ÄõEôõD”ôå5õc"æÖ†÷BÓâÆ÷F–öâfÇVSÒ"G¶÷BçfÇVWÒ"G¶÷BçfÇVRÓÓÒ7G&–ær†—FVÒçvVöå6Æ÷BÇÂw&–Ö'’r’òw6VÆV7FVBr¢rwÓâG¶W62†÷BæÆ&VÂ—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöF—cãÂöF—cà¢G·&WV—&VÖVçD–çWG5cS"†—FVÒ—Ð¢ÂöF—cà¢ÆF—b6Æ73Ò&—FVÒ×7V6–f–2×cS"G¶—56†–VÆBòrr¢v†–FFVâwÒ"FFÖf÷"Ö—FVÓÒ'6†–VÆB#à¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
"}ÝÍ]"½í"íÝí-Ýí=âí=mòâ	]=âíÝ=ÝR­½M½-]-ò=­½-]ÂãÂöF—cà¢ÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	íÝ=M}}]­í=â-ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ'6†–VÆD6÷fW$&öçW5c#""fÇVSÒ"G´çVÖ&W"†—FVÒç6†–VÆD6÷fW$&öçW2ÇÂ—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ý]M]²	½í-­í-ƒÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ'6†–VÆDFW‡FW&—G”6c#""fÇVSÒ"G¶—FVÒç6†–VÆDFW‡FW&—G”6óòrwÒ"Æ6V†öÆFW#Ò-]rí=Ý}]Ýò"óãÂöF—cãÂöF—cà¢G·&WV—&VÖVçD–çWG5cS"†—FVÒ—Ð¢ÂöF—cà¢ÆF—b6Æ73Ò&—FVÒ×7V6–f–2×cS"G¶—4w&VæFRòrr¢v†–FFVâwÒ"FFÖf÷"Ö—FVÓÒ&w&VæFR#ãÆF—b6Æ73Ò&6öÇ32#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
=íÓÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&FÖvR"fÇVSÒ"G¶W62†—FVÒæFÖvRÇÂrr—Ò"Æ6V†öÆFW#Ò-ÝýÍ]6Cb"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	M½ÍÝí-Âí­=]­²“ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ&w&VæFU&ævR"fÇVSÒ"G´çVÖ&W"†—FVÒæw&VæFU&ævRÇÂ—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
M=ýím]Ýò=]­²“ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ&w&VæFU&F—W2"fÇVSÒ"G´çVÖ&W"†—FVÒæw&VæFU&F—W2ÇÂ—Ò"óãÂöF—cãÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	M½ÍÝí-Âí­‚M=ýím]Ýò}Mí-ò"=]­Râ	íMÒíí¢]íM=]"íMÒÝ­}]Íý½ý=Ý-²rÝ-]Ý-òãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&—FVÒ×7V6–f–2×cS"G¶—5GW'&WBòrr¢v†–FFVâwÒ"FFÖf÷"Ö—FVÓÒ'GW'&WB#âG·Væ—D6öÖ&D—FVÔf–VÆG5cR†—FVÒÂ}
-=]½Âr—ÓÂöF—cà¢ÆF—b6Æ73Ò&—FVÒ×7V6–f–2×cS"G¶—4G&öæRòrr¢v†–FFVâwÒ"FFÖf÷"Ö—FVÓÒ&G&öæR#âG·Væ—D6öÖ&D—FVÔf–VÆG5cR†—FVÒÂ}	MíÒr—ÓÂöF—cà¢ÆF—b6Æ73Ò&—FVÒ×7V6–f–2×cS"G¶—4&Ö÷"òrr¢v†–FFVâwÒ"FFÖf÷"Ö—FVÓÒ&&Ö÷"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	­½íÝƒÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"æÖSÒ&&Ö÷$6Æ72"fÇVSÒ"G´çVÖ&W"†—FVÒæ&Ö÷$6Æ72ÇÂ—Ò"óãÂöF—câG·&WV—&VÖVçD–çWG5cS"†—FVÒ—ÓÂöF—cà¢ÆF—b6Æ73Ò&—FVÒ×7V6–f–2×cS"G¶—4–×ÆçBòrr¢v†–FFVâwÒ"FFÖf÷"Ö—FVÓÒ&–×ÆçB#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-]=]ÍòÝÝ]=óÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"æÖSÒ&VæW&w•&WV—&VB"fÇVSÒ"G´çVÖ&W"†—FVÒæVæW&w•&WV—&VBÇÂ—Ò"óãÂöF—câG·&WV—&VÖVçD–çWG5cS"†—FVÒ—ÓÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
=-Ýí-­Íý½Ý-}M-òí-M]½ÍÝâM½ò­mMí=âý]íÝm"}M]½R*½	ý]íÝmŒ+²ãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&—FVÒ×7V6–f–2×cS"G¶—57Fö6²òrr¢v†–FFVâwÒ"FFÖf÷"Ö—FVÓÒ'7Fö6²#ãÆF—b6Æ73Ò&6öÇ32#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-­]ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ'F–6¶W""Ö†ÆVæwFƒÒ#""fÇVSÒ"G¶W62†—FVÒçF–6¶W"ÇÂrr—Ò"Æ6V†öÆFW#Ò$µE""óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
--í-òm]ÝÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#ã"7FWÒ#ã"æÖSÒ'7Fö6´Ö–å&–6R"fÇVSÒ"G´çVÖ&W"†—FVÒç7Fö6´Ö–å&–6Róò—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	-í½-½ÍÝí-ÃÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#ãR"ÖƒÒ#‚"7FWÒ#ãR"æÖSÒ'7Fö6µföÆF–Æ—G’"fÇVSÒ"G´çVÖ&W"†—FVÒç7Fö6µföÆF–Æ—G’óò—Ò"óãÂöF—cãÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ý‚ý]-íÂ}ý=­R]-]-í}ÍÍ"--í-=âm]Ý2rý]mÝ]’ÝmÝ]’m]Ý²â	-]]Ý]=âý]M]½Ý]#²-í½-½ÍÝí-Â]==½=]"Íý½-=M2M-m]ÝòãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&—FVÒ×7V6–f–2×cS"G¶—FVÒçG—RÓÓÒvvV"ròrr¢v†–FFVâwÒ"FFÖf÷"Ö—FVÓÒ&vV"#ãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
Ýým]ÝR]Ý-ò"Ý-]Ý-R‚ÝRÍ]]"=íÝÂ	­	ÂÝÝ]=íýí-]½]Ýò½‚-]í-Ý’]­-]-¢ãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-]=‚ýâíMÝíÍ2Ý-í­2“ÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V–çbÖVF—F÷""æÖSÒ'Fw2#âG¶W62†Æ—7EFW‡B†—FVÒçFw2’—ÓÂ÷FW‡F&VãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-ý}ÝÝ½R--ÍƒÂöÆ&VÃâG·&VæFW%&VÆFVD'F–6ÆW4VF—F÷"†—FVÒç&VÆFVD'F–6ÆT–G2ÇÂµÒ—ÓÂöF—cà¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUô•DTÓÂö'WGFöãà¢Âöf÷&Óæ°¢Ó° ¢6öç7Bõ÷&VæFW%Æ–W$VF—F÷%cS"Ò6öæf–wW&F÷"ç&VæFW%Æ–W$VF—F÷"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW%Æ–W$VF—F÷"ÒgVæ7F–öâ‡&uW6W"’°¢6öç7BW6W"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡&uW6W"“°¢ÆWB‡FÖÂÒõ÷&VæFW%Æ–W$VF—F÷%cS"‡W6W"“°¢òò6†&7FW&—7F–2–çWG2VF—BF†R&6RfÇVRâ÷&–v–â&öçW6W2&RÆ–VBWFöÖF–6ÆÇ’öâF÷à¢f÷"†6öç7B&÷röb$”Ä•D”U5õcS"’°¢6öç7B&RÒæWr&VtW‡††æÖSÕÂ&&–Æ—G•òG·&÷ræ¶W—ÕÂ%µãåÒ§fÇVSÕÂ"•µåÂ%Ò¢…Â"–“°¢‡FÖÂÒ‡FÖÂç&WÆ6R‡&RÂCG´çVÖ&W"‡W6W"æ&–Æ—G”&6Sòå·&÷ræ¶W•ÒÇÂ—ÒC&“°¢Ð¢òò&WF—&RF†RÆVv7’g&VR×FW‡B–×ÆçBÆ—7C²–ç7FÆÆVB–×ÆçG2&Ræ÷r&VÂWV—ÖVçBVçF—F–W2à¢‡FÖÂÒ‡FÖÂç&WÆ6R‚óÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Íý½Ý-µµãÅÒ£ÅÂöÆ&VÃãÇFW‡F&VµãåÒ¦æÖSÒ&–×ÆçG2%µÇ5Å5Ò£óÅÂ÷FW‡F&VãÅÂöF—câörÂrr“°¢6öç7BW‡G&ÒÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
]=-mòÂýíM]ò‚ýí]ímM]ÝSÂöF—cà¢ÆF—b6Æ73Ò&6öÇ32#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
--=Ý­]-³ÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&&÷fÅ7FGW2#ãÆ÷F–öâfÇVSÒ&&÷fVB"G·W6W"æ&÷fÅ7FGW2ÓÓÒv&÷fVBròw6VÆV7FVBr¢rwÓí	íMí]ÝÂö÷F–öããÆ÷F–öâfÇVSÒ'VæF–ær"G·W6W"æ&÷fÅ7FGW2ÓÓÒwVæF–ærròw6VÆV7FVBr¢rwÓí	ímM]"íMí]ÝóÂö÷F–öããÆ÷F–öâfÇVSÒ'&V¦V7FVB"G·W6W"æ&÷fÅ7FGW2ÓÓÒw&V¦V7FVBròw6VÆV7FVBr¢rwÓí	í-­½íÝ]ÝÂö÷F–öããÂ÷6VÆV7CãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ýíM]óÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ'6ö6–Ä÷&–v–ä–B#âG¶÷&–v–ä÷F–öç5cS"…4ô4”Åôõ$”t”å5õcS"ÂW6W"ç6ö6–Ä÷&–v–ä–B—ÓÂ÷6VÆV7CãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ýí]ímM]ÝSÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&vVöw&†–4÷&–v–ä–B#âG¶÷&–v–ä÷F–öç5cS"„tTôu$„”5ôõ$”t”å5õcS"ÂW6W"ævVöw&†–4÷&–v–ä–B—ÓÂ÷6VÆV7CãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	½}Ýí-ÃÂöF—cãÆF—b6Æ73Ò&6öÇ32#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
}]-]­-]ÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&VW'6öæÆ—G’Öf–VÆB×ccb"æÖSÒ'W'6öæÆ—G•G&—B#âG¶W62‡W6W"çW'6öæÆ—G•G&—BÇÂrr—ÓÂ÷FW‡F&VãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	M]³ÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&VW'6öæÆ—G’Öf–VÆB×ccb"æÖSÒ&–FVÂ#âG¶W62‡W6W"æ–FVÂÇÂrr—ÓÂ÷FW‡F&VãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
½í-ÃÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&VW'6öæÆ—G’Öf–VÆB×ccb"æÖSÒ'vV¶æW72#âG¶W62‡W6W"çvV¶æW72ÇÂrr—ÓÂ÷FW‡F&VãÂöF—cãÂöF—cà¢G·W6W"ç7F'F–ætWV—ÖVçD–G3òæÆVæwF‚ÇÂçVÖ&W"‡W6W"æ7&VF–öåö–çG57VçBÇÂ’òÆF—b6Æ73Ò&6&BC‚7&VF–öâ×&Wf–Wr×ccb#ãÆF—b6Æ73Ò&FF×&÷r#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#í	í}­‚í}MÝóÂ÷7ããÇ7â6Æ73Ò&FF×fÇVR#âG´çVÖ&W"‡W6W"æ7&VF–öåö–çG57VçBÇÂ—ÒòÂ÷7ããÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
--í-íRÝým]ÝS¢G²‡W6W"ç7F'F–ætWV—ÖVçD–G2ÇÂµÒ’æÖ†–BÓâUT•ÔTåCòå¶–EÓòææÖRÇÂ–B’æÖ†W62’æ¦ö–â‚r+rr’ÇÂ}ÝR-½ÝâwÓÂöF—cãÂöF—cæ¢rwÐ¢ÆÆ&VÂ6Æ73Ò&6öç6VçBÖÆ–æR7&÷72Ö6×–vâÖ6†B×cc2#ãÆ–çWBG—SÒ&6†V6¶&÷‚"æÖSÒ&ÆÆ÷t7&÷746×–väF—&V7DÖW76vW2"G·W6W"æÆÆ÷t7&÷746×–väF—&V7DÖW76vW2ÓÓÒG'VRòv6†V6¶VBr¢rwÒóãÇ7ããÆ#í
}]-ÂÍ]m­ÍýÝÝ½R½}Ý½Ríí]ÝóÂö#ãÇ6ÖÆÃí
Ý-í"ý]íÝbÍím]"ý-Âý]íÝmÂM==R­ÍýÝ’‚ýí½=}-Âí"ÝR½}Ý½Ríí]Ýòâ	ýâ=Íí½}Ýâ½}Ý½’}"í=Ý}]Ò-½ÝÝí’]}­ÍýÝ]’ãÂ÷6ÖÆÃãÂ÷7ããÂöÆ&VÃà¢ÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	}í-½’­½íÝƒÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"æÖSÒ&&6T&Ö÷$6Æ72"fÇVSÒ"G´çVÖ&W"‡W6W"ç7FG3òæ&6T&Ö÷$6Æ72ÇÂ—Ò"óãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	]½‚ÝM]-íÝò	­	Âýí½Í}=]-ò}Ý}]ÝRíÝ‚ãÂöF—cãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
ÝMM]­--Ý½’	­	ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"fÇVSÒ"G¶vWDVffV7F—fT&Ö÷$6Æ75cS"‡W6W"—Ò"F—6&ÆVBóãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
=-Ýí-½]ÝÝ½RÍý½Ý-³ÂöÆ&VÃâG¶–×ÆçE6VÆV7F÷%cS"‡W6W"æ–ç7FÆÆVD–×ÆçD–G2—ÓÂöF—cà¢G·W6W"ç&öÆRÓÒvvÒròÆF—b6Æ73Ò'&÷r&÷fÂÖ7F–öç2×cS"#ãÆ'WGFöâG—SÒ&'WGFöâ"6Æ73Ò'6V6öæF'’"FFÖ&÷fÂ×cS#Ò&&÷fVB#í	í	M	í	
	
-
Â		Ý	­	]
-
3Âö'WGFöããÆ'WGFöâG—SÒ&'WGFöâ"6Æ73Ò&v†÷7B"FFÖ&÷fÂ×cS#Ò'&V¦V7FVB#í	í
-	­	½	í	Ý	
-
ÃÂö'WGFöããÂöF—cæ¢rwÖ°¢–b†‡FÖÂæ–æ6ÇVFW2‚sÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-ý}ÝÝ½R--ÍƒÂöÆ&VÃâr’’‡FÖÂÒ‡FÖÂç&WÆ6R‚sÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-ý}ÝÝ½R--ÍƒÂöÆ&VÃârÂW‡G&²sÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-ý}ÝÝ½R--ÍƒÂöÆ&VÃâr“°¢VÇ6R‡FÖÂÒ‡FÖÂç&WÆ6R‚sÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUõÄ”U#Âö'WGFöãârÂW‡G&²sÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUõÄ”U#Âö'WGFöãâr“°¢&WGW&â‡FÖÃ°¢Ó° ¢6öæf–wW&F÷"æWV—ÖVçD6FVv÷'•cS"Ò6öæf–wW&F÷"æWV—ÖVçD6FVv÷'•cS"ÇÂvvV"s°¢6öç7BõövWD—FV×5cS"Ò6öæf–wW&F÷"ævWD—FV×2æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ævWD—FV×2ÒgVæ7F–öâ‡G—R’°¢–b‡G—RÓÓÒw6ö6–Ä÷&–v–ç2r’&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2…4ô4”Åôõ$”t”å5õcS"’“°¢–b‡G—RÓÓÒvvVöw&†–4÷&–v–ç2r’&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2„tTôu$„”5ôõ$”t”å5õcS"’“°¢–b‡G—RÓÓÒvWV—ÖVçBr’&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2„UT•ÔTåBÇÂ·Ò’æÖ†æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"’æf–ÇFW"†—FVÒÓâ—FVÒçG—RÓÓÒF†—2æWV—ÖVçD6FVv÷'•cS"’“°¢&WGW&âõövWD—FV×5cS"‡G—R“°¢Ó°¢6öç7Bõ÷&VæFW$VF—F÷%cS"Ò6öæf–wW&F÷"ç&VæFW$VF—F÷"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW$VF—F÷"ÒgVæ7F–öâ†VçF—G’’°¢–b‡F†—2ç6VÆV7FVEG—RÓÓÒw6ö6–Ä÷&–v–ç2r’&WGW&âF†—2ç&VæFW$÷&–v–äVF—F÷%cS"†VçF—G’Âw6ö6–Âr“°¢–b‡F†—2ç6VÆV7FVEG—RÓÓÒvvVöw&†–4÷&–v–ç2r’&WGW&âF†—2ç&VæFW$÷&–v–äVF—F÷%cS"†VçF—G’ÂvvVöw&†–2r“°¢&WGW&âõ÷&VæFW$VF—F÷%cS"†VçF—G’“°¢Ó°¢6öç7Bõö6öæf–u&VæFW%cS"Ò6öæf–wW&F÷"ç&VæFW"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW"ÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒõö6öæf–u&VæFW%cS"‚“°¢–b‡F†—2ç6VÆV7FVEG—RÓÓÒvWV—ÖVçBr’°¢6öç7B6–FRÒFö7VÖVçBçVW'•6VÆV7F÷"‚r66öæf–rÖ6öçFVçBæ6öæf–r×6–FRr“°¢6öç7BF—FÆRÒ6–FRò'&’æg&öÒ‡6–FRçVW'•6VÆV7F÷$ÆÂ‚rç6V7F–öâ×F—FÆRr’’æf–æB†æöFRÓâæöFRçFW‡D6öçFVçCòçG&–Ò‚’ÓÓÒ}
Ý½]Í]Ý-²r’¢çVÆÃ°¢–b‡F—FÆRbb6–FRçVW'•6VÆV7F÷"‚ræWV—ÖVçB×F'2×cS"r’’°¢F—FÆRæ–ç6W'DF¦6VçD…DÔÂ‚vgFW&VæBrÂÆF—b6Æ73Ò&WV—ÖVçB×F'2×cS"#âG´•DTÕõE•U5õcS"æÖ†÷BÓâÆ'WGFöâG—SÒ&'WGFöâ"6Æ73Ò'6V6öæF'’G¶÷BçfÇVRÓÓÒF†—2æWV—ÖVçD6FVv÷'•cS"òv7F—fRr¢rwÒ"FFÖWV—ÖVçBÖ6FVv÷'’×cS#Ò"G¶÷BçfÇVWÒ#âG¶W62†÷BæÆ&VÂ—ÓÂö'WGFöãæ’æ¦ö–â‚rr—ÓÂöF—cæ“°¢Ð¢Ð¢&WGW&â&W7VÇC°¢Ó°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢6öç7B'FâÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖWV—ÖVçBÖ6FVv÷'’×cS%Òr“°¢–b‚'Fâ’&WGW&ã°¢6öæf–wW&F÷"æWV—ÖVçD6FVv÷'•cS"ÒÖÆVv7”—FVÕG—UcS"†'FâæFF6WBæWV—ÖVçD6FVv÷'•cS"“°¢6öæf–wW&F÷"ç6VÆV7FVD–BÒçVÆÃ°¢6öæf–wW&F÷"ç&VæFW"‚“°¢Ò“°¢6öç7Bõö7&VFTæWucS"Ò6öæf–wW&F÷"æ7&VFTæWræ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ7&VFTæWrÒgVæ7F–öâ‚’°¢–b‡F†—2ç6VÆV7FVEG—RÓÒvWV—ÖVçBr’&WGW&âõö7&VFTæWucS"‚“°¢6öç7B—FVÒÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†7&VFT&Ææ´VçF—G’‚vWV—ÖVçBr’“°¢—FVÒçG—RÒF†—2æWV—ÖVçD6FVv÷'•cS#°¢F†—2æ–ç6W'DVçF—G’‚vWV—ÖVçBrÂ—FVÒ“°¢F†—2ç6VÆV7FVD–BÒ—FVÒæ–C°¢F†—2ç&VæFW"‚“°¢Ó°¢6öç7Bõö–ç6W'DVçF—G•cS"Ò6öæf–wW&F÷"æ–ç6W'DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ–ç6W'DVçF—G’ÒgVæ7F–öâ‡G—RÂVçF—G’’°¢–b‡G—RÓÓÒw6ö6–Ä÷&–v–ç2r’²6öç7B—FVÒÒæ÷&ÖÆ—¦T÷&–v–åcS"†VçF—G’Âw6ö6–Åö÷&–v–âr“²4ô4”Åôõ$”t”å5õcS%¶—FVÒæ–EÒÒ—FVÓ²&WGW&ã²Ð¢–b‡G—RÓÓÒvvVöw&†–4÷&–v–ç2r’²6öç7B—FVÒÒæ÷&ÖÆ—¦T÷&–v–åcS"†VçF—G’ÂvvVõö÷&–v–âr“²tTôu$„”5ôõ$”t”å5õcS%¶—FVÒæ–EÒÒ—FVÓ²&WGW&ã²Ð¢–b‡G—RÓÓÒvWV—ÖVçBr’²6öç7B—FVÒÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†VçF—G’“²UT•ÔTåE¶—FVÒæ–EÒÒ—FVÓ²&Vg&W6„WV—ÖVçDFW&—fVEcS"‚“²&WGW&ã²Ð¢&WGW&âõö–ç6W'DVçF—G•cS"‡G—RÂVçF—G’“°¢Ó°¢6öç7Bõ÷&VÖ÷fTVçF—G•cS"Ò6öæf–wW&F÷"ç&VÖ÷fTVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VÖ÷fTVçF—G’ÒgVæ7F–öâ‡G—RÂ–B’°¢–b‡G—RÓÓÒw6ö6–Ä÷&–v–ç2r’²FVÆWFR4ô4”Åôõ$”t”å5õcS%¶–EÓ²&WGW&ã²Ð¢–b‡G—RÓÓÒvvVöw&†–4÷&–v–ç2r’²FVÆWFRtTôu$„”5ôõ$”t”å5õcS%¶–EÓ²&WGW&ã²Ð¢6öç7B&W7VÇBÒõ÷&VÖ÷fTVçF—G•cS"‡G—RÂ–B“°¢–b‡G—RÓÓÒvWV—ÖVçBr’&Vg&W6„WV—ÖVçDFW&—fVEcS"‚“°¢&WGW&â&W7VÇC°¢Ó°¢6öç7Bõ÷&VÖ&VfW&Væ6W5cS"Ò6öæf–wW&F÷"ç&VÖ&VfW&Væ6W2æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VÖ&VfW&Væ6W2ÒgVæ7F–öâ‡G—RÂöÆD–BÂæWt–B’°¢–b‡G—RÓÓÒw6ö6–Ä÷&–v–ç2rÇÂG—RÓÓÒvvVöw&†–4÷&–v–ç2r’°¢6öç7B¶W’ÒG—RÓÓÒw6ö6–Ä÷&–v–ç2ròw6ö6–Ä÷&–v–ä–Br¢vvVöw&†–4÷&–v–ä–Bs°¢f÷"†6öç7BÆ–W"öbö&¦V7BçfÇVW2…Ä”U%õDTÕÄDU2ÇÂ·Ò’’–b‡Æ–W#òå¶¶W•ÒÓÓÒöÆD–B’Æ–W%¶¶W•ÒÒæWt–BÇÂrs°¢f÷"†6öç7BÆ–W"öbö&¦V7BçfÇVW2„ç7FFSòçW6W'2ÇÂ·Ò’’–b‡Æ–W#òå¶¶W•ÒÓÓÒöÆD–B’Æ–W%¶¶W•ÒÒæWt–BÇÂrs°¢&WGW&ã°¢Ð¢6öç7B&W7VÇBÒõ÷&VÖ&VfW&Væ6W5cS"‡G—RÂöÆD–BÂæWt–B“°¢–b‡G—RÓÓÒvWV—ÖVçBr’&Vg&W6„WV—ÖVçDFW&—fVEcS"‚“°¢&WGW&â&W7VÇC°¢Ó°¢6öç7Bõö'V–ÆE–ÆöEcS"Ò6öæf–wW&F÷"æ'V–ÆE–ÆöBæ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ'V–ÆE–ÆöBÒgVæ7F–öâ‡G—R’°¢–b‡G—RÓÓÒw6ö6–Ä÷&–v–ç2r’&WGW&â÷&–v–å6V7F–öå–ÆöEcS"‚w6ö6–Âr“°¢–b‡G—RÓÓÒvvVöw&†–4÷&–v–ç2r’&WGW&â÷&–v–å6V7F–öå–ÆöEcS"‚vvVöw&†–2r“°¢&WGW&âõö'V–ÆE–ÆöEcS"‡G—R“°¢Ó° ¢6öç7Bõö6öÆÆV7DVçF—G•cS"Ò6öæf–wW&F÷"æ6öÆÆV7DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ6öÆÆV7DVçF—G’ÒgVæ7F–öâ‡G—RÂf÷&ÔVÂÂf÷&ÔFFÒæWrf÷&ÔFF†f÷&ÔVÂ’’°¢6öç7BÖVF–f–VÆBÒf÷&ÔVÂçVW'•6VÆV7F÷"‚ræÖVF–Öf–VÆBr“°¢6öç7B–ÖvRÒ7G&–ær†f÷&ÔVÂçVW'•6VÆV7F÷"‚v–çWE¶æÖSÒ&–ÖvTFF%Òr“òçfÇVRÇÂf÷&ÔFFævWB‚v–ÖvTFFr’ÇÂÖVF–f–VÆCòæFF6WCòç6fVD–ÖvUfÇVRÇÂÖVF–f–VÆCòæFF6WCòçVæF–æt–ÖvUfÇVRÇÂrr’çG&–Ò‚“°¢–b‡G—RÓÓÒw6ö6–Ä÷&–v–ç2rÇÂG—RÓÓÒvvVöw&†–4÷&–v–ç2r’°¢6öç7BÆ–æ¶VEÆæWD–G2ÒG—RÓÓÒvvVöw&†–4÷&–v–ç2ròVæ—VU7G&–æw5cS"†vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂvÆ–æ¶VEÆæWD–G2r’’¢µÓ°¢6öç7BÆ–æ¶VE&Vv–öä–G2ÒG—RÓÓÒvvVöw&†–4÷&–v–ç2ròVæ—VU7G&–æw5cS"†vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂvÆ–æ¶VE&Vv–öä–G2r’’¢µÓ°¢6öç7BG&gD÷&–v–âÒæ÷&ÖÆ—¦T÷&–v–åcS"‡°¢–C¢f÷&ÔFFævWB‚v–Br’ÇÂf÷&ÔFFævWB‚væÖRr’ÂæÖS¢7G&–ær†f÷&ÔFFævWB‚væÖRr’ÇÂrr’çG&–Ò‚’ÂFW67&—F–öã¢7G&–ær†f÷&ÔFFævWB‚vFW67&—F–öâr’ÇÂrr’çG&–Ò‚’Â–ÖvRÀ¢Æö6F–öåG—S¢G—RÓÓÒvvVöw&†–4÷&–v–ç2rò7G&–ær†f÷&ÔFFævWB‚vÆö6F–öåG—Rr’ÇÂv÷F†W"r’çG&–Ò‚’çFôÆ÷vW$66R‚’¢rrÀ¢Æ–æ¶VEÆæWD–G2À¢Æ–æ¶VE&Vv–öä–G2À¢7&VF–öä6÷7C¢6Æ×„ÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚v7&VF–öä6÷7Br’ÇÂ’’ÂÂ’À¢&–Æ—G”&öçW6W3¢ö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ‡&÷rÓâ·&÷ræ¶W’ÂçVÖ&W"†f÷&ÔFFævWB†&öçW5òG·&÷ræ¶W—Ö’ÇÂ•Ò’’À¢f—6–&–Æ—G“¢²Æ–W$–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G•Æ–W$–G2r’Â6×–vä–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G”6×–vä–G2r’ÂW&–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G”W&–G2r’Ð¢ÒÂG—RÓÓÒw6ö6–Ä÷&–v–ç2ròw6ö6–Åö÷&–v–âr¢vvVõö÷&–v–âr“°¢–b‡G—RÓÓÒvvVöw&†–4÷&–v–ç2r’°¢6öç7B66W72ÒFW&—fT÷&–v–ä66W75cc†G&gD÷&–v–â“°¢G&gD÷&–v–âæw&çFVEÆæWD–G2Ò66W72æÆ–æ¶VEÆæWD–G3°¢G&gD÷&–v–âæw&çFVE7—7FVÔ–G2Ò66W72æÆ–æ¶VE7—7FVÔ–G3°¢Ð¢&WGW&âG&gD÷&–v–ã°¢Ð¢–b‡G—RÓÓÒvWV—ÖVçBr’°¢6öç7B—FVÕG—RÒÖÆVv7”—FVÕG—UcS"†f÷&ÔFFævWB‚wG—Rr’“°¢6öç7BVçF—G’Òæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"‡°¢–C¢6ÇVv–g”–B†f÷&ÔFFævWB‚v–Br’ÇÂf÷&ÔFFævWB‚væÖRr’ÇÂrrÂv—FVÒr’À¢G—S¢—FVÕG—RÂæÖS¢7G&–ær†f÷&ÔFFævWB‚væÖRr’ÇÂrr’çG&–Ò‚’ÂFW63¢7G&–ær†f÷&ÔFFævWB‚vFW62r’ÇÂrr’çG&–Ò‚’Â&&—G“¢7G&–ær†f÷&ÔFFævWB‚w&&—G’r’ÇÂ}í½}Ý½’r’çG&–Ò‚’Â–ÖvRÀ¢7&VF–öä6÷7C¢6Æ×„ÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚v7&VF–öä6÷7Br’ÇÂ’’ÂÂ’Âf–Æ&ÆT57F'F–æs¢f÷&ÔFFævWB‚vf–Æ&ÆT57F'F–ærr’ÓÓÒvöârÀ¢Fw3¢'6TÆ—7DVF—F÷"†f÷&ÔFFævWB‚wFw2r’ÇÂrr’Â&VÆFVD'F–6ÆT–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂw&VÆFVD'F–6ÆT–G2r’À¢f—6–&–Æ—G“¢²Æ–W$–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G•Æ–W$–G2r’Â6×–vä–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G”6×–vä–G2r’ÂW&–G3¢vWD6†V6¶VEfÇVW2†f÷&ÔVÂÂwf—6–&–Æ—G”W&–G2r’ÒÀ¢FÖvS¢²wvVöârÂvw&VæFRrÂwGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†—FVÕG—R’ò7G&–ær†f÷&ÔFFævWB‚vFÖvRr’ÇÂrr’çG&–Ò‚’¢rrÀ¢†—D&öçW3¢²wvVöârÂwGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†—FVÕG—R’òçVÖ&W"†f÷&ÔFFævWB‚v†—D&öçW2r’ÇÂ’¢À¢&ævS¢²wvVöârÂwGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†—FVÕG—R’òÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚w&ævRr’ÇÂ’’¢À¢vVöå6Æ÷C¢—FVÕG—RÓÓÒwvVöârò7G&–ær†f÷&ÔFFævWB‚wvVöå6Æ÷Br’ÇÂw&–Ö'’r’¢rrÀ¢w&VæFU&ævS¢—FVÕG—RÓÓÒvw&VæFRròÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚vw&VæFU&ævRr’ÇÂ’’¢À¢w&VæFU&F—W3¢—FVÕG—RÓÓÒvw&VæFRròÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚vw&VæFU&F—W2r’ÇÂ’’¢À¢Væ—D‡¢²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†—FVÕG—R’òÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚wVæ—D‡r’ÇÂ’’¢À¢Væ—D&Ö÷$6Æ73¢²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†—FVÕG—R’òÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚wVæ—D&Ö÷$6Æ72r’óò’’¢À¢Væ—Ef—6–öå&ævS¢²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†—FVÕG—R’òÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚wVæ—Ef—6–öå&ævRr’ÇÂ’’¢À¢Væ—DÖ÷fU&ævS¢²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†—FVÕG—R’òÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚wVæ—DÖ÷fU&ævRr’ÇÂ’’¢À¢Væ—D–æ—F–F—fS¢²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†—FVÕG—R’òçVÖ&W"†f÷&ÔFFævWB‚wVæ—D–æ—F–F—fRr’ÇÂ’¢À¢&Ö÷$6Æ73¢—FVÕG—RÓÓÒv&Ö÷"ròçVÖ&W"†f÷&ÔFFævWB‚v&Ö÷$6Æ72r’ÇÂ’¢À¢VæW&w•&WV—&VC¢—FVÕG—RÓÓÒv–×ÆçBròçVÖ&W"†f÷&ÔFFævWB‚vVæW&w•&WV—&VBr’ÇÂ’¢À¢F–6¶W#¢—FVÕG—RÓÓÒw7Fö6²rò7G&–ær†f÷&ÔFFævWB‚wF–6¶W"r’ÇÂrr’çG&–Ò‚’çFõWW$66R‚’¢rrÀ¢7Fö6´Ö–å&–6S¢—FVÕG—RÓÓÒw7Fö6²ròÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"†f÷&ÔFFævWB‚w7Fö6´Ö–å&–6Rr’ÇÂ’’’¢À¢7Fö6´Ö…&–6S¢—FVÕG—RÓÓÒw7Fö6²ròÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚w7Fö6´Ö–å&–6Rr’ÇÂ’’¢À¢7Fö6µföÆF–Æ—G“¢—FVÕG—RÓÓÒw7Fö6²ròÖF‚æÖ‚ƒãRÂÖF‚æÖ–âƒ‚ÂçVÖ&W"†f÷&ÔFFævWB‚w7Fö6µföÆF–Æ—G’r’ÇÂ’’’¢À¢6†–VÆD6÷fW$&öçW3¢—FVÕG—RÓÓÒw6†–VÆBròÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚w6†–VÆD6÷fW$&öçW5c#"r’ÇÂ’’¢À¢6†–VÆDFW‡FW&—G”6¢—FVÕG—RÓÓÒw6†–VÆBrbb7G&–ær†f÷&ÔFFævWB‚w6†–VÆDFW‡FW&—G”6c#"r’ÇÂrr’çG&–Ò‚’ÓÒrròÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚w6†–VÆDFW‡FW&—G”6c#"r’’’¢çVÆÂÀ¢&WV—&VÖVçG3¢ö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ‡&÷rÓâ·&÷ræ¶W’Â²wvVöârÂw6†–VÆBrÂv&Ö÷"rÂv–×ÆçBuÒæ–æ6ÇVFW2†—FVÕG—R’òçVÖ&W"†f÷&ÔFFævWB†&WòG·&÷ræ¶W—Ö’ÇÂ’¢Ò’¢Ò“°¢&WGW&âVçF—G“°¢Ð¢6öç7BVçF—G’Òõö6öÆÆV7DVçF—G•cS"‡G—RÂf÷&ÔVÂÂf÷&ÔFF“°¢–b‡G—RÓÓÒwÆ–W'2rbbVçF—G’’°¢VçF—G’æ&÷fÅ7FGW2Ò7G&–ær†f÷&ÔFFævWB‚v&÷fÅ7FGW2r’ÇÂVçF—G’æ&÷fÅ7FGW2ÇÂv&÷fVBr’çFôÆ÷vW$66R‚“°¢VçF—G’ç6ö6–Ä÷&–v–ä–BÒ7G&–ær†f÷&ÔFFævWB‚w6ö6–Ä÷&–v–ä–Br’ÇÂrr’çG&–Ò‚“°¢VçF—G’ævVöw&†–4÷&–v–ä–BÒ7G&–ær†f÷&ÔFFævWB‚vvVöw&†–4÷&–v–ä–Br’ÇÂrr’çG&–Ò‚“°¢VçF—G’çW'6öæÆ—G•G&—BÒ7G&–ær†f÷&ÔFFævWB‚wW'6öæÆ—G•G&—Br’ÇÂrr’çG&–Ò‚“°¢VçF—G’æ–FVÂÒ7G&–ær†f÷&ÔFFævWB‚v–FVÂr’ÇÂrr’çG&–Ò‚“°¢VçF—G’çvV¶æW72Ò7G&–ær†f÷&ÔFFævWB‚wvV¶æW72r’ÇÂrr’çG&–Ò‚“°¢VçF—G’æÆÆ÷t7&÷746×–väF—&V7DÖW76vW2Òf÷&ÔFFævWB‚vÆÆ÷t7&÷746×–väF—&V7DÖW76vW2r’ÓÓÒvöâs°¢VçF—G’ç7FG2Ò²âââ†VçF—G’ç7FG2ÇÂ·Ò’Â&6T&Ö÷$6Æ73¢ÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚v&6T&Ö÷$6Æ72r’ÇÂVçF—G’ç7FG3òæ&6T&Ö÷$6Æ72ÇÂ’’Ó°¢VçF—G’æ–ç7FÆÆVD–×ÆçD–G2ÒvWD6†V6¶VEfÇVW2†f÷&ÔVÂÂv–ç7FÆÆVD–×ÆçD–G2r“°¢6öç7B7V&Ö—GFVD&6RÒVçF—G’æ&–Æ—F–W2ÇÂ·Ó°¢VçF—G’æ&–Æ—G”&6RÒö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ‡&÷rÓâ·&÷ræ¶W’ÂçVÖ&W"‡7V&Ö—GFVD&6U·&÷ræ¶W•ÒÇÂ•Ò’“°¢&WGW&âæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"†VçF—G’“°¢Ð¢&WGW&âVçF—G“°¢Ó° ¢6öç7Bõ÷&VæFW%&W÷'G5æVÅcS"Ò6öæf–wW&F÷"ç&VæFW%&W÷'G5æVÂæ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW%&W÷'G5æVÂÒgVæ7F–öâ‚’°¢6öç7B&6RÒõ÷&VæFW%&W÷'G5æVÅcS"‚“°¢6öç7BVæF–ærÒ6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2„ç7FFSòçW6W'2ÇÂÄ”U%õDTÕÄDU2ÇÂ·Ò’æÖ†æ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"’æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒrbbÆ–W"æ&÷fÅ7FGW2ÓÓÒwVæF–ærr’“°¢–b‚VæF–æræÆVæwF‚’&WGW&â&6S°¢&WGW&âG¶&6WÓÆF—b6Æ73Ò&6&BC‚VæF–ærÖÆ–6F–öç2×cS"#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	}ý-­‚ý]íÝm]’+rG·VæF–æræÆVæwF‡ÓÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ýí-½RÝ­]-²ÝRÍí=="-í-‚Mâ]]Ýò	M	ÍãÂöF—cãÆF—b6Æ73Ò'&W7VÇB×7F6²"7G–ÆSÒ&Ö&v–â×F÷£'‚#âG·VæF–æræÖ‡Æ–W"ÓâÆ'WGFöâG—SÒ&'WGFöâ"6Æ73Ò'6V6öæF'’VæF–ær×Æ–W"×cS""FF×VæF–ær×Æ–W"×cS#Ò"G¶W62‡Æ–W"æ–B—Ò#ãÇ7ãâG¶W62‡Æ–W"æF—7Æ”æÖRÇÂÆ–W"æ–B—ÓÂ÷7ããÇ7ãí	í
-	­

½
-
ÃÂ÷7ããÂö'WGFöãæ’æ¦ö–â‚rr—ÓÂöF—cãÂöF—cæ°¢Ó°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢6öç7BVæF–ærÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×VæF–ær×Æ–W"×cS%Òr“°¢–b‡VæF–ær’²6öæf–wW&F÷"ç6VÆV7FVEG—RÒwÆ–W'2s²6öæf–wW&F÷"ç6VÆV7FVD–BÒVæF–æræFF6WBçVæF–æuÆ–W%cS#²6öæf–wW&F÷"ç&VæFW"‚“²&WGW&ã²Ð¢6öç7B&÷fÂÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖ&÷fÂ×cS%Òr“°¢–b†&÷fÂ’²6öç7Bf÷&ÒÒ&÷fÂæ6Æ÷6W7B‚r66öæf–rÖVF—F÷"Öf÷&Òr“²6öç7B6VÆV7BÒf÷&ÓòçVW'•6VÆV7F÷"‚u¶æÖSÒ&&÷fÅ7FGW2%Òr“²–b‡6VÆV7B’²6VÆV7BçfÇVRÒ&÷fÂæFF6WBæ&÷fÅcS#²f÷&Òç&WVW7E7V&Ö—B‚“²ÒÐ¢Ò“° ¢òò6FVv÷'’×7V6–f–2WV—ÖVçBf–VÆG2v—F†÷WBÆ÷6–ærVç6fVB6öÖÖöâf–VÆG2à¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ°¢6öç7B6VÆV7BÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚r66öæf–rÖVF—F÷"Öf÷&ÒæWV—ÖVçBÖVF—F÷"×cS"6VÆV7E¶æÖSÒ'G—R%Òr“°¢–b‚6VÆV7B’&WGW&ã°¢6öç7Bf÷&ÒÒ6VÆV7Bæ6Æ÷6W7B‚vf÷&Òr“°¢f÷&ÒæFF6WBæ—FVÕG—RÒÖÆVv7”—FVÕG—UcS"‡6VÆV7BçfÇVR“°¢6öæf–wW&F÷"æWV—ÖVçD6FVv÷'•cS"Òf÷&ÒæFF6WBæ—FVÕG—S°¢f÷&ÒçVW'•6VÆV7F÷$ÆÂ‚u¶FFÖf÷"Ö—FVÕÒr’æf÷$V6‚†æöFRÓâæöFRæ6Æ74Æ—7BçFövvÆR‚v†–FFVârÂæöFRæFF6WBæf÷$—FVÒÓÒf÷&ÒæFF6WBæ—FVÕG—R’“°¢Ò“° ¢òòÆöv–ã¢Væf–Æ&ÆR6×–vç2&R6ö×ÆWFVÇ’'6VçC²6×–vâW&—2æòÆöævW"6†÷vâ–âF†R6VÆV7F÷"÷"&Wf–Wrà¢6öç7Bõöf–ÆÄÆöv–å6VÆV7EcS"Òæf–ÆÄÆöv–å6VÆV7Bæ&–æB„“°¢æf–ÆÄÆöv–å6VÆV7BÒgVæ7F–öâ‚’°¢õöf–ÆÄÆöv–å6VÆV7EcS"‚“°¢6öç7B6×–vå6VÆV7BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚vÆöv–âÖ6×–vâ×6VÆV7B×ccr“°¢6öç7BÆ–W%6VÆV7BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚v6†"×6VÆV7Br“°¢6öç7B6×–vç2Òf–Æ&ÆT6×–vå&÷w5cS"‚“°¢–b‚6×–vå6VÆV7BÇÂÆ–W%6VÆV7B’&WGW&ã°¢ÆWB6VÆV7FVBÒ7G&–ær†6×–vå6VÆV7BçfÇVRÇÂæ7F—fT6×–vä–BÇÂÆö6Å7F÷&vRævWD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×cC’r’ÇÂrr’çG&–Ò‚“°¢–b‚6×–vç2ç6öÖR†2Óâ2æ–BÓÓÒ6VÆV7FVB’’6VÆV7FVBÒ6×–vç5³Óòæ–BÇÂrs°¢6×–vå6VÆV7Bæ–ææW$…DÔÂÒ6×–vç2æÖ†2ÓâÆ÷F–öâfÇVSÒ"G¶W62†2æ–B—Ò"G¶2æ–BÓÓÒ6VÆV7FVBòw6VÆV7FVBr¢rwÓâG¶W62†2ææÖRÇÂ2æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr’ÇÂsÆ÷F–öâfÇVSÒ"#í	Ý]"Mí-=ýÝ½R­ÍýÝ“Âö÷F–öãâs°¢6×–vå6VÆV7BçfÇVRÒ6VÆV7FVC°¢6×–vå6VÆV7BæF—6&ÆVBÒ6×–vç2æÆVæwF‚ÓÓÒ°¢æ7F—fT6×–vä–BÒ6VÆV7FVC°¢–b‡6VÆV7FVB’²Æö6Å7F÷&vRç6WD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×cC’rÂ6VÆV7FVB“²Æö6Å7F÷&vRç6WD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×ccrÂ6VÆV7FVB“²Ð¢6öç7BÆ–W'2Ò6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2‡F†—2ç7FFSòçW6W'2ÇÂÄ”U%õDTÕÄDU2ÇÂ·Ò’¢æÖ†æ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"¢æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br¢æf–ÇFW"†—4&÷fVEÆ–W%cS"¢æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒrÇÂ‡6VÆV7FVBbb6×–vä–G4f÷%Æ–W%cS"‡Æ–W"’æ–æ6ÇVFW2‡6VÆV7FVB’’“°¢6öç7B&Wf–÷W2ÒÆ–W%6VÆV7BçfÇVS°¢Æ–W%6VÆV7Bæ–ææW$…DÔÂÒÆ–W'2æÆVæwF‚òÆ–W'2æÖ‡Æ–W"ÓâÆ÷F–öâfÇVSÒ"G¶W62‡Æ–W"æ–B—Ò#âG¶W62‡Æ–W"æF—7Æ”æÖRÇÂÆ–W"æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr’¢Æ÷F–öâfÇVSÒ"#âG·6VÆV7FVBò}	Ý]"Mí-=ýÝ½Rý]íÝm]’r¢}	Ý]"Mí-=ýÝ½R­ÍýÝ’wÓÂö÷F–öãæ°¢–b‡Æ–W'2ç6öÖR‡Æ–W"ÓâÆ–W"æ–BÓÓÒ&Wf–÷W2’’Æ–W%6VÆV7BçfÇVRÒ&Wf–÷W3°¢F†—2ç&VæFW$Æöv–å&Wf–Wr‚“°¢Ó° ¢6öç7Bõ÷&VæFW$Æöv–å&Wf–WucS"Òç&VæFW$Æöv–å&Wf–Wræ&–æB„“°¢ç&VæFW$Æöv–å&Wf–WrÒgVæ7F–öâ‚’°¢õ÷&VæFW$Æöv–å&Wf–WucS"‚“°¢6öç7BÖWFÒFö7VÖVçBçVW'•6VÆV7F÷"‚r6Æöv–â×&Wf–WræÆöv–âÖ6×–vâÖÖWF×cC’r“°¢–b†ÖWF’°¢6öç7B7ç2ÒÖWFçVW'•6VÆV7F÷$ÆÂ‚w7âr“°¢–b‡7ç2æÆVæwF‚â’7ç5·7ç2æÆVæwF‚ÒÒç&VÖ÷fR‚“°¢Ð¢Ó° ¢6öç7BõöÆöv–åcS"ÒæÆöv–âæ&–æB„“°¢æÆöv–âÒ7–æ2gVæ7F–öâ‚’°¢6öç7BÆ–W$–BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚v6†"×6VÆV7Br“òçfÇVRÇÂrs°¢6öç7BÆ–W"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡F†—2ç7FFSòçW6W'3òå·Æ–W$–EÒÇÂÄ”U%õDTÕÄDU3òå·Æ–W$–EÒÇÂ·Ò“°¢–b‡Æ–W$–Bbb—4&÷fVEÆ–W%cS"‡Æ–W"’’°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÆöv–âÖW'&÷"r’çFW‡D6öçFVçBÒÆ–W"æ&÷fÅ7FGW2ÓÓÒwVæF–ærrò}	Ý­]-ý]íÝm]ímM]"íMí]Ýò	M	Íâr¢}	Ý­]-ý]íÝmí-­½íÝ]Ý	M	ÍíÂâs°¢&WGW&ã°¢Ð¢&WGW&âõöÆöv–åcS"‚“°¢Ó° ¢òò&öf–ÆS¢&Ö÷"6Æ72æB÷&–v–âÖFW&—fVBVffV7F—fR6†&7FW&—7F–72à¢6öç7Bõ÷&VæFW%&öf–ÆUcS"ÒT’ç&VæFW%&öf–ÆRæ&–æB…T’“°¢T’ç&VæFW%&öf–ÆRÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒõ÷&VæFW%&öf–ÆUcS"‚“°¢6öç7BW6W"Òæ7W'&VçEW6W"òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"„æ7W'&VçEW6W"’¢çVÆÃ°¢–b‚W6W"’&WGW&â&W7VÇC°¢6öç7Bf—'7E&öf–ÆRÒFö7VÖVçBçVW'•6VÆV7F÷"‚r7&öf–ÆRÖ6öçFVçBç&öf–ÆRÖ6&Br“°¢–b†f—'7E&öf–ÆR’°¢6öç7B&÷w2Òf—'7E&öf–ÆRçVW'•6VÆV7F÷$ÆÂ‚ræFF×&÷rr“°¢6öç7Bæ6†÷"Ò'&’æg&öÒ‡&÷w2’æf–æB‡&÷rÓâ&÷rçVW'•6VÆV7F÷"‚ræFFÖÆ&VÂr“òçFW‡D6öçFVçCòçG&–Ò‚’ÓÓÒ}	½Ýr“°¢–b‚f—'7E&öf–ÆRçVW'•6VÆV7F÷"‚u¶FFÖ&Ö÷"Ö6Æ72×cS%Òr’’°¢6öç7BÖ&·WÒÆF—b6Æ73Ò&FF×&÷r"FFÖ&Ö÷"Ö6Æ72×cS#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#í	­½íÝƒÂ÷7ããÇ7â6Æ73Ò&FF×fÇVR#âG¶vWDVffV7F—fT&Ö÷$6Æ75cS"‡W6W"—ÓÂ÷7ããÂöF—cæ°¢–b†æ6†÷"’æ6†÷"æ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&V&Vv–ârÂÖ&·W“²VÇ6Rf—'7E&öf–ÆRæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÂÖ&·W“°¢Ð¢Ð¢6öç7BWV—6&G2ÒFö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚r7&öf–ÆRÖ6öçFVçBç&öf–ÆRÖ6&Br“°¢6öç7BF&vWBÒ'&’æg&öÒ†WV—6&G2’æf–æB†6&BÓâ6&BçFW‡D6öçFVçCòæ–æ6ÇVFW2‚}
Ý­ýí-­r’“°¢–b‡F&vWBbbF&vWBçVW'•6VÆV7F÷"‚u¶FFÖ÷&–v–ç2×cS%Òr’’°¢6öç7B6ö6–ÂÒ÷&–v–ä'”–EcS"‚w6ö6–ÂrÂW6W"ç6ö6–Ä÷&–v–ä–B“°¢6öç7BvVòÒ÷&–v–ä'”–EcS"‚vvVöw&†–2rÂW6W"ævVöw&†–4÷&–v–ä–B“°¢6öç7B–ç7FÆÆVBÒ‡W6W"æ–ç7FÆÆVD–×ÆçD–G2ÇÂµÒ’æÖ†–BÓâæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"„UT•ÔTåE¶–EÒÇÂ·Ò’’æf–ÇFW"†—FVÒÓâ—FVÒæ–Bbb—FVÒææÖR“°¢F&vWBæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÂÆF—bFFÖ÷&–v–ç2×cS#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR"7G–ÆSÒ&Ö&v–â×F÷£‡‚#í	ýíM]ò‚ýí]ímM]ÝSÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ýíM]ó¢G¶W62‡6ö6–ÃòææÖRÇÂ}ÝR-½Ýr—Ò+r	ýí]ímM]ÝS¢G¶W62†vVóòææÖRÇÂ}ÝR-½Ýâr—ÓÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR"7G–ÆSÒ&Ö&v–â×F÷£‡‚#í
=-Ýí-½]ÝÝ½RÍý½Ý-³ÂöF—cãÆF—b6Æ73Ò'&W7VÇB×7F6²#âG¶–ç7FÆÆVBæÖ†—FVÒÓâÆF—b6Æ73Ò&6&BC‚#ãÆF—b6Æ73Ò&FF×&÷r#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#âG¶W62†—FVÒææÖR—ÓÂ÷7ããÇ7â6Æ73Ò&FF×fÇVR#âG´çVÖ&W"†—FVÒæVæW&w•&WV—&VBÇÂ—ÒTãÂ÷7ããÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
-]í-Ýó¢G¶W62‡&WV—&VÖVçG5FW‡EcS"†—FVÒ’—ÓÂöF—cãÂöF—cæ’æ¦ö–â‚rr’ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý]"=-Ýí-½]ÝÝ½RÍý½Ý-í#ÂöF—câwÓÂöF—cãÂöF—cæ“°¢Ð¢6öç7B&öf–ÆU7F6²ÒFö7VÖVçBçVW'•6VÆV7F÷"‚r7&öf–ÆRÖ6öçFVçBæw&–C2âç7F6³¦f—'7BÖ6†–ÆBr“°¢–b‡&öf–ÆU7F6²bb&öf–ÆU7F6²çVW'•6VÆV7F÷"‚u¶FF×W'6öæÆ—G’×cceÒr’’°¢&öf–ÆU7F6²æ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÂÆF—b6Æ73Ò&6&B&öf–ÆRÖ6&BW'6öæÆ—G’×&öf–ÆR×ccb"FF×W'6öæÆ—G’×cccãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	½}Ýí-ÃÂöF—cãÆF—b6Æ73Ò'W'6öæÆ—G’×&öf–ÆRÖw&–B×ccb#ãÆF—cãÇ7â6Æ73Ò&FFÖÆ&VÂ#í
}]-]­-]Â÷7ããÇâG¶W62‡W6W"çW'6öæÆ—G•G&—BÇÂ}	ÝR=­}Ýr—ÓÂ÷ãÂöF—cãÆF—cãÇ7â6Æ73Ò&FFÖÆ&VÂ#í	M]³Â÷7ããÇâG¶W62‡W6W"æ–FVÂÇÂ}	ÝR=­}Òr—ÓÂ÷ãÂöF—cãÆF—cãÇ7â6Æ73Ò&FFÖÆ&VÂ#í
½í-ÃÂ÷7ããÇâG¶W62‡W6W"çvV¶æW72ÇÂ}	ÝR=­}Ýr—ÓÂ÷ãÂöF—cãÂöF—cãÂöF—cæ“°¢Ð¢&WGW&â&W7VÇC°¢Ó° ¢gVæ7F–öâ÷&–v–ä&öçW4&FvW5cSB†÷&–v–âÒ·Ò’°¢6öç7B&öçW6W2Òæ÷&ÖÆ—¦T&öçW4ÖcS"†÷&–v–âæ&–Æ—G”&öçW6W2ÇÂ·Ò“°¢6öç7B&÷w2Ò$”Ä•D”U5õcS"æf–ÇFW"‡&÷rÓâçVÖ&W"†&öçW6W5·&÷ræ¶W•ÒÇÂ’ÓÒ¢æÖ‡&÷rÓâÇ7â6Æ73Ò&÷&–v–âÖ&öçW2×cSBG´çVÖ&W"†&öçW6W5·&÷ræ¶W•Ò’âòw÷6—F—fRr¢væVvF—fRwÒ#âG¶W62‡&÷rç6†÷'B—ÒG´çVÖ&W"†&öçW6W5·&÷ræ¶W•Ò’âòr²r¢rwÒG´çVÖ&W"†&öçW6W5·&÷ræ¶W•Ò—ÓÂ÷7ãæ“°¢&WGW&â&÷w2æÆVæwF‚ò&÷w2æ¦ö–â‚rr’¢sÇ7â6Æ73Ò&÷&–v–âÖ&öçW2×cSBæWWG&Â#í	]rÍíMM­-íí#Â÷7ãâs°¢Ð¢gVæ7F–öâvVõG—TÆ&VÅcSB‡G—R’°¢&WGW&â‡²6—G“¢}	=ííBrÂÆæWC¢}	ý½Ý]-rÂ&Vv–öã¢}
]=íÒòí½-ÂrÂ7FF–öã¢}
-ÝmòrÂ6öÆöç“¢}	­í½íÝòòýí]½]ÝRrÂ÷F†W#¢}	Í]-âýí]ímM]ÝòrÒ•µ7G&–ær‡G—RÇÂv÷F†W"r•ÒÇÂ}	Í]-âýí]ímM]Ýòs°¢Ð¢gVæ7F–öâ&VæFW$÷&–v–å&Vv—7G&F–öä6&G5cSB†ÖÂf–VÆDæÖRÂ¶–æB’°¢6öç7B&÷w2Ò6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2†ÖÇÂ·Ò’“°¢–b‚&÷w2æÆVæwF‚’&WGW&âÆF—b6Æ73Ò&÷&–v–âÖV×G’×cSB#í	M	Â]ÝRMí-²-Ý-²M½ò-½íãÂöF—cæ°¢&WGW&âÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖw&–B×cSB#âG·&÷w2æÖ†÷&–v–âÓâ°¢6öç7B–ÖvRÒ7G&–ær†÷&–v–âæ–ÖvRÇÂ÷&–v–âæ–ÖvTÆö6ÂÇÂrr’çG&–Ò‚“°¢6öç7B¶–6¶W"Ò¶–æBÓÓÒw&öfW76–öârò}	ý
	í
M	]

	
òr¢vVõG—TÆ&VÅcSB†÷&–v–âæÆö6F–öåG—R“°¢&WGW&âÆÆ&VÂ6Æ73Ò&÷&–v–âÖ6†ö–6RÖ6&B×cSB#à¢Æ–çWBG—SÒ'&F–ò"æÖSÒ"G¶f–VÆDæÖWÒ"fÇVSÒ"G¶W62†÷&–v–âæ–B—Ò"&WV—&VBóà¢ÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖÖVF–×cSB#âG¶–ÖvRòÆ–Ör7&3Ò"G¶W62†–ÖvR—Ò"ÇCÒ""óæ¢ÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6R×Æ6V†öÆFW"×cSB#âG¶¶–æBÓÓÒw&öfW76–öârò}	ý
	í
M	]

	
òr¢}	ý
	í	

]	í	m	M	]	Ý		RwÓÂöF—cæÓÂöF—cà¢ÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖ&öG’×cSB#ãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖ¶–6¶W"×cSB#âG¶W62†¶–6¶W"—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6R×F—FÆR×cSB#âG¶W62†÷&–v–âææÖRÇÂ÷&–v–âæ–B—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖFW67&—F–öâ×cSB#âG¶W62†÷&–v–âæFW67&—F–öâÇÂ}	íýÝRýí­ÝR}ýí½Ý]Ýâ	M	ÍíÂâr—ÓÂöF—câG¶¶–æBÓÓÒvvVöw&†–2rò‚‚’Óâ²6öç7B66W72ÒFW&—fT÷&–v–ä66W75cc†÷&–v–â“²6öç7BÆæWG2Ò66W72æÆ–æ¶VEÆæWD–G2æÖ†–BÓâÄäUE3òå¶–EÓòææÖRÇÂ–B’æf–ÇFW"„&ööÆVâ“²&WGW&âÆæWG2æÆVæwF‚òÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR÷&–v–âÖ66W72Öæ÷FR×cc#í	Mí-=ó¢G¶W62‡ÆæWG2æ¦ö–â‚r+rr’—ÓÂöF—cæ¢rs²Ò’‚’¢rwÓÆF—b6Æ73Ò&÷&–v–âÖ&öçW6W2×cSB#âG¶÷&–v–ä&öçW4&FvW5cSB†÷&–v–â—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–â×6VÆV7BÖ–æF–6F÷"×cSB#í	-
½	
	
-
ÃÂöF—cãÂöF—cà¢ÂöÆ&VÃæ°¢Ò’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð¢6öç7B4„$5DU%ô5$TD”ôåô%TDtUEõccbÒ°¢gVæ7F–öâæ÷&ÖÆ—¦T7&VF–öäW&ccb‡fÇVR’°¢6öç7B&rÒ7G&–ær‡fÇVRÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢–b‚ý]GÆÖVF–WgÆfWVFÇÆæ6–VçBòçFW7B‡&r’’&WGW&âvÖVF–WfÂs°¢–b‚ýÝM=-Æ–æGW7G&–ÇÇ7FV×ÆF–W6VÇÆæÆöròçFW7B‡&r’’&WGW&âv–æGW7G&–Âs°¢&WGW&âwFV6†æöÆöv–6Âs°¢Ð¢gVæ7F–öâ7&VF–öä6÷7Eccb†VçF—G’Ò·Ò’°¢&WGW&â6Æ×„ÖF‚æÖ‚ƒÂçVÖ&W"†VçF—G’æ7&VF–öä6÷7BóòVçF—G’æ6†&7FW$7&VF–öä6÷7Bóò’’ÂÂ4„$5DU%ô5$TD”ôåô%TDtUEõccb“°¢Ð¢gVæ7F–öâ7&VF–öä÷F–öäf–Æ&ÆUccb†VçF—G’Ò·ÒÂ6×–vâÒçVÆÂ’°¢–b‚VçF—G’ÇÂ6×–vâÇÂVçF—G’æf–Æ&ÆTæ÷rÓÓÒfÇ6RÇÂVçF—G’æf–Æ&ÆRÓÓÒfÇ6R’&WGW&âfÇ6S°¢6öç7Bf—6–&–Æ—G’Òf—6–&–Æ—G•cS"†VçF—G’“°¢6öç7B6×–vä–BÒ7G&–ær†6×–vâæ–BÇÂrr’çG&–Ò‚“°¢6öç7BW&Òæ÷&ÖÆ—¦T7&VF–öäW&ccb†6×–vâæW&ÇÂ6×–vâæWö6‚ÇÂ6×–vâçF†VÖR“°¢6öç7B6×–väÖF6‚Òf—6–&–Æ—G’æ6×–vä–G2æ–æ6ÇVFW2†6×–vä–B“°¢6öç7BW&ÖF6‚Òf—6–&–Æ—G’æW&–G2æÖ†æ÷&ÖÆ—¦T7&VF–öäW&ccb’æ–æ6ÇVFW2†W&“°¢–b‡f—6–&–Æ—G’æ6×–vä–G2æÆVæwF‚ÇÂf—6–&–Æ—G’æW&–G2æÆVæwF‚’&WGW&â6×–väÖF6‚ÇÂW&ÖF6ƒ°¢–b‡f—6–&–Æ—G’çÆ–W$–G2æÆVæwF‚’&WGW&âfÇ6S°¢&WGW&âG'VS°¢Ð¢gVæ7F–öâ7&VF–öä÷&–v–å&÷w5ccb†ÖÂ6×–vâ’°¢&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2†ÖÇÂ·Ò’æf–ÇFW"†÷&–v–âÓâ7&VF–öä÷F–öäf–Æ&ÆUccb†÷&–v–âÂ6×–vâ’’“°¢Ð¢gVæ7F–öâ&VæFW$7&VF–öä÷&–v–ä6&G5ccb†ÖÂf–VÆDæÖRÂ¶–æBÂ6×–vâ’°¢6öç7B&÷w2Ò7&VF–öä÷&–v–å&÷w5ccb†ÖÂ6×–vâ“°¢–b‚&÷w2æÆVæwF‚’&WGW&âÆF—b6Æ73Ò&÷&–v–âÖV×G’×cSB#í	M½ò-½ÝÝí’­ÍýÝ‚Ý]"Mí-=ýÝ½R-Ý-í"ãÂöF—cæ°¢&WGW&âÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖw&–B×cSB#âG·&÷w2æÖ†÷&–v–âÓâ°¢6öç7B–ÖvRÒ7G&–ær†÷&–v–âæ–ÖvRÇÂ÷&–v–âæ–ÖvTÆö6ÂÇÂrr’çG&–Ò‚“°¢6öç7B¶–6¶W"Ò¶–æBÓÓÒw&öfW76–öârò}	ý
	í
M	]

	
òr¢vVõG—TÆ&VÅcSB†÷&–v–âæÆö6F–öåG—R“°¢6öç7B6÷7BÒ7&VF–öä6÷7Eccb†÷&–v–â“°¢&WGW&âÆÆ&VÂ6Æ73Ò&÷&–v–âÖ6†ö–6RÖ6&B×cSB7&VF–öâÖ6†ö–6RÖ6&B×ccb#à¢Æ–çWBG—SÒ'&F–ò"æÖSÒ"G¶f–VÆDæÖWÒ"fÇVSÒ"G¶W62†÷&–v–âæ–B—Ò"&WV—&VBóà¢ÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖÖVF–×cSB#âG¶–ÖvRòÆ–Ör7&3Ò"G¶W62†–ÖvR—Ò"ÇCÒ""óæ¢ÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6R×Æ6V†öÆFW"×cSB#âG¶¶–æBÓÓÒw&öfW76–öârò}	ý
	í
M	]

	
òr¢}	ý
	í	

]	í	m	M	]	Ý		RwÓÂöF—cæÓÂöF—cà¢ÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖ&öG’×cSB#ãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖ¶–6¶W"×cSB#âG¶W62†¶–6¶W"—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6R×F—FÆR×cSB#âG¶W62†÷&–v–âææÖRÇÂ÷&–v–âæ–B—ÓÂöF—cãÆF—b6Æ73Ò&7&VF–öâÖ6÷7BÖ&FvR×ccb#âG¶6÷7GÒ	í
}	¢ãÂöF—cãÆF—b6Æ73Ò&÷&–v–âÖ6†ö–6RÖFW67&—F–öâ×cSB#âG¶W62†÷&–v–âæFW67&—F–öâÇÂ}	íýÝRýí­ÝR}ýí½Ý]Ýâ	M	ÍíÂâr—ÓÂöF—câG¶¶–æBÓÓÒvvVöw&†–2rò‚‚’Óâ²6öç7B66W72ÒFW&—fT÷&–v–ä66W75cc†÷&–v–â“²6öç7BÆæWG2Ò66W72æÆ–æ¶VEÆæWD–G2æÖ†–BÓâÄäUE3òå¶–EÓòææÖRÇÂ–B’æf–ÇFW"„&ööÆVâ“²&WGW&âÆæWG2æÆVæwF‚òÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR÷&–v–âÖ66W72Öæ÷FR×cc#í	Mí-=ó¢G¶W62‡ÆæWG2æ¦ö–â‚r+rr’—ÓÂöF—cæ¢rs²Ò’‚’¢rwÓÆF—b6Æ73Ò&÷&–v–âÖ&öçW6W2×cSB#âG¶÷&–v–ä&öçW4&FvW5cSB†÷&–v–â—ÓÂöF—cãÆF—b6Æ73Ò&÷&–v–â×6VÆV7BÖ–æF–6F÷"×cSB#í	-
½	
	
-
ÃÂöF—cãÂöF—cà¢ÂöÆ&VÃæ°¢Ò’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð¢gVæ7F–öâ7F'F–ætWV—ÖVçE&÷w5ccb†6×–vâ’°¢&WGW&â6÷'DVçF—F–W4f÷$Æ—7B„ö&¦V7BçfÇVW2„UT•ÔTåBÇÂ·Ò’æÖ†æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"’æf–ÇFW"†—FVÒÓâ—FVÒæf–Æ&ÆT57F'F–ærbb7&VF–öä÷F–öäf–Æ&ÆUccb†—FVÒÂ6×–vâ’’“°¢Ð¢gVæ7F–öâ7F'F–ætWV—ÖVçDÆ&VÅccb†—FVÒÒ·Ò’°¢&WGW&â‡·vVöã¢}	í=mRrÇ6†–VÆC¢}
-²rÆw&VæFS¢}	=Ý-²rÇGW'&WC¢}
-=]½‚rÆG&öæS¢}	MíÝ²rÆ&Ö÷#¢}	íÝòrÆ&6·6³¢}
í­}¢rÆ–×ÆçC¢}	Íý½Ý"rÇ7Fö6³¢}	­m‚rÆÖÖó¢}	ý-íÝ²rÆvV#¢}
Ýým]ÝRwÒ•¶—FVÒçG—UÒÇÂ}
Ýým]ÝRs°¢Ð¢gVæ7F–öâ7F'F–ætWV—ÖVçDFWF–ÄÖ&·Wcs"†—FVÒÒ·ÒÂ6VÆV7FVBÒfÇ6R’°¢6öç7Bv–GF‚ÒÖF‚æÖ‚ƒÂçVÖ&W"ç'6T–çB†—FVÒæ–çfVçF÷'•v–GF‚óò—FVÒç6—¦Uv–GF‚óòÂ’ÇÂ“°¢6öç7B†V–v‡BÒÖF‚æÖ‚ƒÂçVÖ&W"ç'6T–çB†—FVÒæ–çfVçF÷'”†V–v‡Bóò—FVÒç6—¦T†V–v‡BóòÂ’ÇÂ“°¢6öç7BÖ72ÒçVÖ&W"†—FVÒæÖ72óò—FVÒçvV–v‡Bóò“°¢6öç7Bf7G2Ò°¢
-ó¢G·7F'F–ætWV—ÖVçDÆ&VÅccb†—FVÒ—ÖÀ¢—FVÒç&&—G’ò
]M­í-Ã¢G¶—FVÒç&&—G—Ö¢rrÀ¢
-íÍí-Ã¢G¶7&VF–öä6÷7Eccb†—FVÒ—Òí}¢æÀ¢
}Í]¢G·v–GF‡Ü9rG¶†V–v‡GÖÀ¢	Í¢G´çVÖ&W"æ—4f–æ—FR†Ö72’òÖ72¢Ö ¢Ó°¢–b†—FVÒçG—RÓÓÒwvVöâr’°¢–b†—FVÒæFÖvR’f7G2çW6‚†
=íÓ¢G¶—FVÒæFÖvWÖ“°¢–b„çVÖ&W"†—FVÒç&ævRÇÂ’â’f7G2çW6‚†	M½ÍÝí-Ã¢G´çVÖ&W"†—FVÒç&ævR—Ö“°¢f7G2çW6‚†	ýíýMÝS¢G´çVÖ&W"†—FVÒæ†—D&öçW2ÇÂ’ãÒòr²r¢rwÒG´çVÖ&W"†—FVÒæ†—D&öçW2ÇÂ—Ö“°¢Ð¢–b†—FVÒçG—RÓÓÒvw&VæFRr’²–b†—FVÒæFÖvR’f7G2çW6‚†
=íÓ¢G¶—FVÒæFÖvWÖ“²f7G2çW6‚†	íí£¢G´çVÖ&W"†—FVÒæw&VæFU&ævRÇÂ—ÖÂ
M=¢G´çVÖ&W"†—FVÒæw&VæFU&F—W2ÇÂ—Ö“²Ð¢–b…²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†—FVÒçG—R’’²–b†—FVÒæFÖvR’f7G2çW6‚†
=íÓ¢G¶—FVÒæFÖvWÖ“²f7G2çW6‚†	M½ÍÝí-Ã¢G´çVÖ&W"†—FVÒç&ævRÇÂ—ÖÂ…¢G´çVÖ&W"†—FVÒçVæ—D‡ÇÂ—ÖÂ	­	¢G´çVÖ&W"†—FVÒçVæ—D&Ö÷$6Æ72óò—ÖÂ	ýíýMÝS¢G´çVÖ&W"†—FVÒæ†—D&öçW7ÇÃ“ãÓòr²s¢rwÒG´çVÖ&W"†—FVÒæ†—D&öçW7ÇÃ—Ö“²Ð¢–b†—FVÒçG—RÓÓÒv&Ö÷"rbbçVÖ&W"†—FVÒæ&Ö÷$6Æ72ÇÂ’â’f7G2çW6‚†	­½íÝƒ¢G´çVÖ&W"†—FVÒæ&Ö÷$6Æ72—Ö“°¢–b†—FVÒçG—RÓÓÒv–×ÆçBr’f7G2çW6‚†
-]=]ÍòÝÝ]=ó¢G´çVÖ&W"†—FVÒæVæW&w•&WV—&VBóò—FVÒç&WV—&VDVæW&w’óò—Ö“°¢6öç7BFw2Ò'&’æ—4'&’†—FVÒçFw2’ò—FVÒçFw2æÖ‡fÇVRÓâ7G&–ær‡fÇVRÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ’¢µÓ°¢&WGW&âÆF—b6Æ73Ò'&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂÖ6&B×cs"#à¢Æ'WGFöâ6Æ73Ò&v†÷7B&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂÖ6Æ÷6R×cs""G—SÒ&'WGFöâ"FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6Æ÷6R×cs#í	}		­

½
-
ÃÂö'WGFöãà¢ÆF—b6Æ73Ò'&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂÖÆ–÷WB×cs"#à¢ÆF—b6Æ73Ò'&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂÖÖVF–×cs"#âG·&VæFW%F‡VÖ"†—FVÒÂ²6—¦S¢v†W&òrÂG—S¢v—FVÒrÂvÇ—ƒ¢–æ—F–Ç2†—FVÒææÖRÇÂ—FVÒæ–B’Ò—ÓÂöF—cà¢ÆF—b6Æ73Ò'&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂÖ6÷’×cs"#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
--í-íRÝým]ÝSÂöF—cà¢Æƒ#âG¶W62†—FVÒææÖRÇÂ—FVÒæ–B—ÓÂöƒ#à¢ÆF—b6Æ73Ò'&Vv—7G&F–öâÖWV—ÖVçBÖf7G2×cs"#âG¶f7G2æf–ÇFW"„&ööÆVâ’æÖ†f7BÓâÇ7â6Æ73Ò'–ÆÂ#âG¶W62†f7B—ÓÂ÷7ãæ’æ¦ö–â‚rr—ÓÂöF—cà¢ÇâG¶W62†—FVÒæFW62ÇÂ—FVÒæFW67&—F–öâÇÂ—FVÒç7VÖÖ'’ÇÂ}	íýÝRý]MÍ]-ÝR}MÝââr—ÓÂ÷à¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#ãÆ#í
-]í-Ýó£Âö#âG¶W62‡&WV—&VÖVçG5FW‡EcS"†—FVÒ’—ÓÂöF—cà¢G·Fw2æÆVæwF‚òÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#ãÆ#í	­-]=íƒ£Âö#âG¶W62‡Fw2æ¦ö–â‚r+rr’—ÓÂöF—cæ¢rwÐ¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò'&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂÖ7F–öç2×cs"#ãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ&'WGFöâ"FF×&Vv—7G&F–öâÖWV—ÖVçB×6VÆV7B×cs"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò#âG·6VÆV7FVBò}
=	
	
-
Â		r	-
½	
		Ý	Ý	í	=	âr¢}	-
½	
	
-
ÂwÓÂö'WGFöããÂöF—cà¢ÂöF—cæ°¢Ð¢gVæ7F–öâ6Æ÷6U7F'F–ætWV—ÖVçDÖöFÅcs"‡æVÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv—7G&F–öâ×æVÂ×cS"r’’°¢æVÃòçVW'•6VÆV7F÷"‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂ×cs%Òr“òç&VÖ÷fR‚“°¢Ð¢gVæ7F–öâ÷Vå7F'F–ætWV—ÖVçDÖöFÅcs"‡æVÂÂ—FVÔ–B’°¢6öç7Bf÷&ÒÒæVÃòçVW'•6VÆV7F÷"‚r7&Vv—7G&F–öâÖf÷&Ò×cS"r“°¢6öç7B—FVÒÒUT•ÔTåCòå¶—FVÔ–EÒòæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"„UT•ÔTåE¶—FVÔ–EÒ’¢çVÆÃ°¢6öç7B–çWBÒf÷&ÓòçVW'•6VÆV7F÷"†¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Õ·fÇVSÒ"G´552æW66R…7G&–ær†—FVÔ–BÇÂrr’—Ò%Ö“°¢–b‚—FVÒÇÂ–çWB’&WGW&ã°¢6Æ÷6U7F'F–ætWV—ÖVçDÖöFÅcs"‡æVÂ“°¢6öç7BÖöFÂÒFö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br“°¢ÖöFÂæ6Æ74æÖRÒw&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂ×cs"s°¢ÖöFÂæFF6WBç&Vv—7G&F–öäWV—ÖVçDÖöFÅcs"Òss°¢ÖöFÂæ–ææW$…DÔÂÒ7F'F–ætWV—ÖVçDFWF–ÄÖ&·Wcs"†—FVÒÂ&ööÆVâ†–çWBæ6†V6¶VB’“°¢æVÂæVæD6†–ÆB†ÖöFÂ“°¢Ð¢gVæ7F–öâ&VæFW%7F'F–ætWV—ÖVçD6&G5ccb†6×–vâ’°¢6öç7B&÷w2Ò7F'F–ætWV—ÖVçE&÷w5ccb†6×–vâ“°¢–b‚&÷w2æÆVæwF‚’&WGW&âÆF—b6Æ73Ò&÷&–v–âÖV×G’×cSB#í	M½òÝ-í’­ÍýÝ‚Ý]"ý]MÍ]-í"Âí-Í]}]ÝÝ½R­¢--í-½RãÂöF—cæ°¢&WGW&âÆF—b6Æ73Ò'7F'F–ærÖWV—ÖVçBÖw&–B×ccb#âG·&÷w2æÖ†—FVÒÓâÆF—b6Æ73Ò'7F'F–ærÖWV—ÖVçBÖ6&B×ccb"FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6&B×cs"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"&öÆSÒ&'WGFöâ"F&–æFWƒÒ#"&–×&W76VCÒ&fÇ6R#à¢Æ–çWBG—SÒ&6†V6¶&÷‚"æÖSÒ'7F'F–ætWV—ÖVçD–G2"fÇVSÒ"G¶W62†—FVÒæ–B—Ò"†–FFVâóà¢G·&VæFW%F‡VÖ"†—FVÒÂ²6—¦S¢vÖBrÂG—S¢v—FVÒrÂvÇ—ƒ¢–æ—F–Ç2†—FVÒææÖRÇÂ—FVÒæ–B’Ò—Ð¢Ç7â6Æ73Ò'7F'F–ærÖWV—ÖVçBÖ6÷’×ccb#ãÆ#âG¶W62†—FVÒææÖRÇÂ—FVÒæ–B—ÓÂö#ãÇ6ÖÆÃâG¶W62‡7F'F–ætWV—ÖVçDÆ&VÅccb†—FVÒ’—ÒG¶—FVÒç&&—G’ò+rG¶W62†—FVÒç&&—G’—Ö¢rwÓÂ÷6ÖÆÃãÇ6ÖÆÃâG¶W62†—FVÒæFW62ÇÂrr—ÓÂ÷6ÖÆÃãÂ÷7ãà¢Ç7â6Æ73Ò&7&VF–öâÖ6÷7BÖ&FvR×ccb#âG¶7&VF–öä6÷7Eccb†—FVÒ—Ò	í
}	¢ãÂ÷7ãà¢Ç7â6Æ73Ò'7F'F–ærÖWV—ÖVçB×6VÆV7FVB×cs"#í	-
½	
		Ý	ãÂ÷7ãà¢ÂöF—cæ’æ¦ö–â‚rr—ÓÂöF—cæ°¢Ð¢gVæ7F–öâ7&VF–öå6VÆV7F–öåccb†f÷&Ò’°¢6öç7B6×–vä–BÒ7G&–ær†f÷&ÓòæVÆVÖVçG3òæ6×–vä–CòçfÇVRÇÂrr’çG&–Ò‚“°¢6öç7B6×–vâÒf–Æ&ÆT6×–vå&÷w5cS"‚’æf–æB‡&÷rÓâ7G&–ær‡&÷ræ–B’ÓÓÒ6×–vä–B’ÇÂçVÆÃ°¢6öç7B&öfW76–öä–BÒ7G&–ær†f÷&ÓòçVW'•6VÆV7F÷"‚u¶æÖSÒ'6ö6–Ä÷&–v–ä–B%Ó¦6†V6¶VBr“òçfÇVRÇÂrr’çG&–Ò‚“°¢6öç7BvVöw&†–4÷&–v–ä–BÒ7G&–ær†f÷&ÓòçVW'•6VÆV7F÷"‚u¶æÖSÒ&vVöw&†–4÷&–v–ä–B%Ó¦6†V6¶VBr“òçfÇVRÇÂrr’çG&–Ò‚“°¢6öç7B&öfW76–öâÒ÷&–v–ä'”–EcS"‚w6ö6–ÂrÂ&öfW76–öä–B“°¢6öç7BvVöw&†–2Ò÷&–v–ä'”–EcS"‚vvVöw&†–2rÂvVöw&†–4÷&–v–ä–B“°¢6öç7BWV—ÖVçD–G2ÒVæ—VU7G&–æw5cS"„'&’æg&öÒ†f÷&ÓòçVW'•6VÆV7F÷$ÆÂ‚u¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Ó¦6†V6¶VBr’ÇÂµÒ’æÖ†æöFRÓâæöFRçfÇVR’“°¢6öç7BWV—ÖVçBÒWV—ÖVçD–G2æÖ†–BÓâUT•ÔTåCòå¶–EÒòæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"„UT•ÔTåE¶–EÒ’¢çVÆÂ’æf–ÇFW"„&ööÆVâ“°¢6öç7BF÷FÂÒ7&VF–öä6÷7Eccb‡&öfW76–öâ’²7&VF–öä6÷7Eccb†vVöw&†–2’²WV—ÖVçBç&VGV6R‚‡7VÒÂ—FVÒ’Óâ7VÒ²7&VF–öä6÷7Eccb†—FVÒ’Â“°¢&WGW&â²6×–vâÂ&öfW76–öâÂvVöw&†–2ÂWV—ÖVçBÂWV—ÖVçD–G2ÂF÷FÂÓ°¢Ð¢gVæ7F–öâWFFU&Vv—7G&F–öä'VFvWEccb†f÷&Ò’°¢–b‚f÷&Ò’&WGW&ã°¢6öç7B6VÆV7F–öâÒ7&VF–öå6VÆV7F–öåccb†f÷&Ò“°¢6öç7B'VFvWBÒf÷&ÒçVW'•6VÆV7F÷"‚u¶FFÖ7&VF–öâÖ'VFvWB×cceÒr“°¢6öç7B7V&Ö—BÒf÷&ÒçVW'•6VÆV7F÷"‚u·G—SÒ'7V&Ö—B%Òr“°¢6öç7B&VÖ–æ–ærÒ4„$5DU%ô5$TD”ôåô%TDtUEõccbÒ6VÆV7F–öâçF÷FÃ°¢f÷&ÒçVW'•6VÆV7F÷$ÆÂ‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6&B×cs%Òr’æf÷$V6‚†6&BÓâ°¢6öç7B–çWBÒ6&BçVW'•6VÆV7F÷"‚u¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Òr“°¢6&Bç6WDGG&–'WFR‚v&–×&W76VBrÂ7G&–ær„&ööÆVâ†–çWCòæ6†V6¶VB’’“°¢Ò“°¢–b†'VFvWB’°¢'VFvWBçFW‡D6öçFVçBÒ	ýí-}]Ýã¢G·6VÆV7F–öâçF÷FÇÒòG´4„$5DU%ô5$TD”ôåô%TDtUEõccgÒ+rG·&VÖ–æ–ærãÒò	í-½íÃ¢G·&VÖ–æ–æwÖ¢	ý	]
	]
	

]	í	C¢G´ÖF‚æ'2‡&VÖ–æ–ær—ÖÖ°¢'VFvWBæ6Æ74Æ—7BçFövvÆR‚v÷fW"Ö'VFvWBrÂ&VÖ–æ–ærÂ“°¢Ð¢–b‡7V&Ö—B’7V&Ö—BæF—6&ÆVBÒ&VÖ–æ–ærÂ°¢Ð¢gVæ7F–öâ&Vg&W6…&Vv—7G&F–öä6†ö–6W5ccb†f÷&Ò’°¢–b‚f÷&Ò’&WGW&ã°¢6öç7B6×–vä–BÒ7G&–ær†f÷&ÒæVÆVÖVçG3òæ6×–vä–CòçfÇVRÇÂrr’çG&–Ò‚“°¢6öç7B6×–vâÒf–Æ&ÆT6×–vå&÷w5cS"‚’æf–æB‡&÷rÓâ7G&–ær‡&÷ræ–B’ÓÓÒ6×–vä–B’ÇÂf–Æ&ÆT6×–vå&÷w5cS"‚•³ÒÇÂçVÆÃ°¢6öç7B&Wf–÷W5&öfW76–öâÒf÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ'6ö6–Ä÷&–v–ä–B%Ó¦6†V6¶VBr“òçfÇVRÇÂrs°¢6öç7B&Wf–÷W4÷&–v–âÒf÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ&vVöw&†–4÷&–v–ä–B%Ó¦6†V6¶VBr“òçfÇVRÇÂrs°¢6öç7B&Wf–÷W4—FV×2ÒæWr6WB„'&’æg&öÒ†f÷&ÒçVW'•6VÆV7F÷$ÆÂ‚u¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Ó¦6†V6¶VBr’’æÖ†æöFRÓâæöFRçfÇVR’“°¢6öç7B&öfW76–öä†÷7BÒf÷&ÒçVW'•6VÆV7F÷"‚u¶FF×&Vv—7G&F–öâ×&öfW76–öç2×cceÒr“°¢6öç7B÷&–v–ä†÷7BÒf÷&ÒçVW'•6VÆV7F÷"‚u¶FF×&Vv—7G&F–öâÖ÷&–v–ç2×cceÒr“°¢6öç7BWV—ÖVçD†÷7BÒf÷&ÒçVW'•6VÆV7F÷"‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçB×cceÒr“°¢–b‡&öfW76–öä†÷7B’&öfW76–öä†÷7Bæ–ææW$…DÔÂÒ&VæFW$7&VF–öä÷&–v–ä6&G5ccb…4ô4”Åôõ$”t”å5õcS"Âw6ö6–Ä÷&–v–ä–BrÂw&öfW76–öârÂ6×–vâ“°¢–b†÷&–v–ä†÷7B’÷&–v–ä†÷7Bæ–ææW$…DÔÂÒ&VæFW$7&VF–öä÷&–v–ä6&G5ccb„tTôu$„”5ôõ$”t”å5õcS"ÂvvVöw&†–4÷&–v–ä–BrÂvvVöw&†–2rÂ6×–vâ“°¢–b†WV—ÖVçD†÷7B’WV—ÖVçD†÷7Bæ–ææW$…DÔÂÒ&VæFW%7F'F–ætWV—ÖVçD6&G5ccb†6×–vâ“°¢–b‡&Wf–÷W5&öfW76–öâ’f÷&ÒçVW'•6VÆV7F÷"†¶æÖSÒ'6ö6–Ä÷&–v–ä–B%Õ·fÇVSÒ"G´552æW66R‡&Wf–÷W5&öfW76–öâ—Ò%Ö“òæ6Æ–6²‚“°¢–b‡&Wf–÷W4÷&–v–â’f÷&ÒçVW'•6VÆV7F÷"†¶æÖSÒ&vVöw&†–4÷&–v–ä–B%Õ·fÇVSÒ"G´552æW66R‡&Wf–÷W4÷&–v–â—Ò%Ö“òæ6Æ–6²‚“°¢&Wf–÷W4—FV×2æf÷$V6‚†–BÓâ²6öç7B–çWBÒf÷&ÒçVW'•6VÆV7F÷"†¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Õ·fÇVSÒ"G´552æW66R†–B—Ò%Ö“²–b†–çWB’–çWBæ6†V6¶VBÒG'VS²Ò“°¢WFFU&Vv—7G&F–öä'VFvWEccb†f÷&Ò“°¢Ð¢gVæ7F–öâfÆ–FFU&Vv—7G&F–öå6VÆV7F–öåccb†f÷&Ò’°¢6öç7B6VÆV7F–öâÒ7&VF–öå6VÆV7F–öåccb†f÷&Ò“°¢–b‚6VÆV7F–öâæ6×–vâ’&WGW&â²ö³¢fÇ6RÂÖW76vS¢}	­ÍýÝòÝ]Mí-=ýÝârÂââç6VÆV7F–öâÓ°¢–b‚6VÆV7F–öâç&öfW76–öâÇÂ7&VF–öä÷F–öäf–Æ&ÆUccb‡6VÆV7F–öâç&öfW76–öâÂ6VÆV7F–öâæ6×–vâ’’&WGW&â²ö³¢fÇ6RÂÖW76vS¢}	-½]-RMí-=ýÝ=âýíM]âârÂââç6VÆV7F–öâÓ°¢–b‚6VÆV7F–öâævVöw&†–2ÇÂ7&VF–öä÷F–öäf–Æ&ÆUccb‡6VÆV7F–öâævVöw&†–2Â6VÆV7F–öâæ6×–vâ’’&WGW&â²ö³¢fÇ6RÂÖW76vS¢}	-½]-RMí-=ýÝíRýí]ímM]ÝRârÂââç6VÆV7F–öâÓ°¢–b‡6VÆV7F–öâæWV—ÖVçBç6öÖR†—FVÒÓâ—FVÒæf–Æ&ÆT57F'F–ærÇÂ7&VF–öä÷F–öäf–Æ&ÆUccb†—FVÒÂ6VÆV7F–öâæ6×–vâ’’’&WGW&â²ö³¢fÇ6RÂÖW76vS¢}
ýí¢--í-í=âÝým]Ýò}Í]Ý½òâ	-½]-Rý]MÍ]-²}Ýí-âârÂââç6VÆV7F–öâÓ°¢–b‡6VÆV7F–öâçF÷FÂâ4„$5DU%ô5$TD”ôåô%TDtUEõccb’&WGW&â²ö³¢fÇ6RÂÖW76vS¢	ý]-½]ÒíMm]"í}MÝó¢G·6VÆV7F–öâçF÷FÇÒòG´4„$5DU%ô5$TD”ôåô%TDtUEõccgÒæÂââç6VÆV7F–öâÓ°¢6öç7B7F'FW$Æ–÷WBÒv–æF÷räu%t–çfVçF÷'•ccsòæ'V–ÆDÆ–÷WCòâ‡²–çfVçF÷'•6—¦S¢"Â6''•vV–v‡DÖƒ¢"ÂWV—ÖVçE6Æ÷G3¢²&–Ö'•vVöã¢rrÂ6V6öæF'•vVöã¢rrÂ&Ö÷#¢rrÒÂ–×ÆçE6Æ÷D6÷VçC¢Â–×ÆçE6Æ÷G3¢µÒÂ–çfVçF÷'“¢6VÆV7F–öâæWV—ÖVçD–G2æÖ†—FVÔ–BÓâ‡²—FVÔ–BÂG“¢Â÷6—F–öç3¢µÒÒ’’Ò“°¢–b‡7F'FW$Æ–÷WCòçvV–v‡Bâ"²RÓ’’&WGW&â²ö³¢fÇ6RÂÖW76vS¢
--í-íRÝým]ÝR½­íÂ-ým½íS¢G·7F'FW$Æ–÷WBçvV–v‡BçFôf—†VBƒ—Òò"æÂââç6VÆV7F–öâÓ°¢–b‡7F'FW$Æ–÷WCòæ÷fW&fÆ÷sòæÆVæwF‚’&WGW&â²ö³¢fÇ6RÂÖW76vS¢}
--í-íRÝým]ÝRÝRýíÍ]]-ò"-ÝM-Ý½’Ý-]Ý-ÂÝ"­½]-í¢ârÂââç6VÆV7F–öâÓ°¢&WGW&â²ö³¢G'VRÂââç6VÆV7F–öâÓ°¢Ð¢gVæ7F–öâ&Vv—7G&F–öäÖ&·WcS"‚’°¢6öç7B6×–vç2Òf–Æ&ÆT6×–vå&÷w5cS"‚“°¢6öç7B&VfW'&VD6×–vä–BÒ7G&–ær„æ7F—fT6×–vä–BÇÂÆö6Å7F÷&vRævWD—FVÒ‚vw'rÖÆöv–âÖ6×–vâ×cC’r’ÇÂrr’çG&–Ò‚“°¢6öç7B6×–vâÒ6×–vç2æf–æB‡&÷rÓâ7G&–ær‡&÷ræ–B’ÓÓÒ&VfW'&VD6×–vä–B’ÇÂ6×–vç5³ÒÇÂçVÆÃ°¢&WGW&âÆF—b6Æ73Ò'&Vv—7G&F–öâ×v–æF÷r×cSB"&öÆSÒ&F–Æör"&–ÖÖöFÃÒ'G'VR"&–ÖÆ&VÆÆVF'“Ò'&Vv—7G&F–öâ×F—FÆR×cSB#à¢ÆF—b6Æ73Ò'&Vv—7G&F–öâÖ6&B×cS"#à¢ÆF—b6Æ73Ò'&Vv—7G&F–öâ×7F–6·’Ö†VB×cSB&÷r#ãÆF—cãÆF—b6Æ73Ò&Ööæò66VçBF–ç’×76R#í		Ý	­	]
-		ý	]

	í	Ý		m	ÂöF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR"–CÒ'&Vv—7G&F–öâ×F—FÆR×cSB#í
]=-mòÝí-í=âý]íÝmÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	íMm]"í}MÝò(	BÍ­Í=ÂG´4„$5DU%ô5$TD”ôåô%TDtUEõccgÒí}­í"â	ýíM]òÂýí]ímM]ÝR‚--í-½Rý]MÍ]-²­½M½-í-òãÂöF—cãÂöF—cãÆ'WGFöâG—SÒ&'WGFöâ"6Æ73Ò&v†÷7B"–CÒ'&Vv—7G&F–öâÖ6Æ÷6R×cS"#í	}		­

½
-
ÃÂö'WGFöããÂöF—cà¢Æf÷&Ò–CÒ'&Vv—7G&F–öâÖf÷&Ò×cS""6Æ73Ò&f÷&Ò&Vv—7G&F–öâÖf÷&Ò×cSB#à¢ÆF—b6Æ73Ò&7&VF–öâÖ'VFvWB×ccb"FFÖ7&VF–öâÖ'VFvWB×cccí	ýí-}]Ýã¢òG´4„$5DU%ô5$TD”ôåô%TDtUEõccgÒ+r	í-½íÃ¢G´4„$5DU%ô5$TD”ôåô%TDtUEõccgÓÂöF—cà¢ÆF—b6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	íÝí-Ý½RMÝÝ½SÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	=í-ò­ÍýÝóÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&6×–vä–B"&WV—&VCâG¶6×–vç2æÖ†2ÓâÆ÷F–öâfÇVSÒ"G¶W62†2æ–B—Ò"G¶6×–vãòæ–BÓÓÒ2æ–Bòw6VÆV7FVBr¢rwÓâG¶W62†2ææÖRÇÂ2æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöF—cà¢ÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ÍóÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&F—7Æ”æÖR"&WV—&VBÖ†ÆVæwFƒÒ#ƒ"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
Mí-âý]íÝmÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&f–ÆR"æÖSÒ'†÷Fò"66WCÒ&–ÖvR÷ærÆ–ÖvRö§VrÆ–ÖvR÷vV'Æ–ÖvRöv–b"óãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	íýÝRý]íÝmÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V&Vv—7G&F–öâÖFW67&—F–öâ×cSB"æÖSÒ&FW67&—F–öâ"Ö†ÆVæwFƒÒ##"Æ6V†öÆFW#Ò-	-Ý]Ýí-ÂÂ-íòÂ-mÝ½RM]-½‚í=MŽ(
b#ãÂ÷FW‡F&VãÂöF—cãÂöF—cà ¢ÆF—b6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	½}Ýí-ÃÂöF—cãÆF—b6Æ73Ò&6öÇ32W'6öæÆ—G’×&Vv—7G&F–öâÖw&–B×ccb#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
}]-]­-]ÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V"æÖSÒ'W'6öæÆ—G•G&—B"Ö†ÆVæwFƒÒ#3"Æ6V†öÆFW#Ò-	­¢ý]íÝbí½}Ýâ-]M"]ò‚ýíý-½ý]"]óò#ãÂ÷FW‡F&VãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	M]³ÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V"æÖSÒ&–FVÂ"Ö†ÆVæwFƒÒ#3"Æ6V†öÆFW#Ò-	-â}-âý]íÝb-]"‚¢}]Í2-]Í-óò#ãÂ÷FW‡F&VãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
½í-ÃÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V"æÖSÒ'vV¶æW72"Ö†ÆVæwFƒÒ#3"Æ6V†öÆFW#Ò-
}-âýííÝâýí---Âý]íÝm"-=MÝíRýí½ím]ÝSò#ãÂ÷FW‡F&VãÂöF—cãÂöF—cãÂöF—cà ¢ÆF—b6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ýíM]óÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ýí­}½-í-ò-í½Í­â-Ý-²ÂMí-=ýÝ½R-½ÝÝí’­ÍýÝ‚½‚]Ýýí]RãÂöF—cãÆF—bFF×&Vv—7G&F–öâ×&öfW76–öç2×cccâG·&VæFW$7&VF–öä÷&–v–ä6&G5ccb…4ô4”Åôõ$”t”å5õcS"Âw6ö6–Ä÷&–v–ä–BrÂw&öfW76–öârÂ6×–vâ—ÓÂöF—cãÂöF—cà ¢ÆF—b6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ýí]ímM]ÝSÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Í]-íÂýí]ímM]ÝòÍím]"½-Â=ííBÂ]=íÒÂ-ÝmòÂ­í½íÝò½‚m]½òý½Ý]-ãÂöF—cãÆF—bFF×&Vv—7G&F–öâÖ÷&–v–ç2×cccâG·&VæFW$7&VF–öä÷&–v–ä6&G5ccb„tTôu$„”5ôõ$”t”å5õcS"ÂvvVöw&†–4÷&–v–ä–BrÂvvVöw&†–2rÂ6×–vâ—ÓÂöF—cãÂöF—cà ¢ÆF—b6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
--í-íRÝým]ÝSÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ÍímÝâ-½-ÂÝ]­í½Í­âý]MÍ]-í"â	ýí­}½-í-ò-í½Í­âý]MÍ]-²M½=íÂ*½	Mí-=ý]Ò­¢--í-í\+²ÂMí-=ýÝ½R­ÍýÝ‚½‚]Ýýí]RãÂöF—cãÆF—bFF×&Vv—7G&F–öâÖWV—ÖVçB×cccâG·&VæFW%7F'F–ætWV—ÖVçD6&G5ccb†6×–vâ—ÓÂöF—cãÂöF—cà ¢ÆF—b6Æ73Ò'&Vv—7G&F–öâ×6V7F–öâ×cSB#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Mí-=óÂöF—cãÆF—b6Æ73Ò&6öÇ3"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ýí½Âý]íÝmÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ'72"G—SÒ'77v÷&B"&WV—&VBÖ–æÆVæwFƒÒ#B"WFö6ö×ÆWFSÒ&æWr×77v÷&B"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ýí--í-Rýí½ÃÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ'73""G—SÒ'77v÷&B"&WV—&VBÖ–æÆVæwFƒÒ#B"WFö6ö×ÆWFSÒ&æWr×77v÷&B"óãÂöF—cãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò'&Vv—7G&F–öâ×7V&Ö—B×cSB#ãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í	í
-	ý
		-	
-
Â		Ý	­	]
-
2	M	Í
3Âö'WGFöããÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR"–CÒ'&Vv—7G&F–öâ×7FGW2×cS"#ãÂöF—cãÂöF—cà¢Âöf÷&Óà¢ÂöF—cà¢ÂöF—cæ°¢Ð¢7–æ2gVæ7F–öâ&Vv—7G&F–öå†÷FõcS"†f–ÆRÂ7FVÒ’°¢–b‚f–ÆRÇÂf–ÆRç6—¦R’&WGW&ârs°¢6öç7BæF—fUF‚Òv–æF÷ræVÆV7G&öä“òævWEF„f÷$f–ÆSòâ†f–ÆR“°¢–b†æF—fUF‚bbv–æF÷ræVÆV7G&öä“òç6fUv÷&ÆD–ÖvTf–ÆR’°¢6öç7B&W2Òv—Bv–æF÷ræVÆV7G&öä’ç6fUv÷&ÆD–ÖvTf–ÆR‡²f–ÆUFƒ¢æF—fUF‚Â&VfW'&VE7FVÓ¢7FVÒÇÂw&Vv—7G&F–öârÒ“°¢–b‡&W3òæö²’&WGW&â7G&–ær‡&W2çW&ÂÇÂ&W2æ6Æ÷VEW&ÂÇÂ&W2æÆö6ÅW&ÂÇÂrr“°¢F‡&÷ræWrW'&÷"‡&W3òæÖW76vRÇÂ}	ÝR=M½íÂí]Ý-ÂMí-âr“°¢Ð¢&WGW&âv—B&VD–ÖvTf–ÆT5&VæFW&&ÆTFFW&ÅcS†f–ÆR“°¢Ð¢gVæ7F–öâ&–æE&Vv—7G&F–öåcS"‚’°¢6öç7B÷VâÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv—7FW"Ö6†&7FW"Ö'Fâ×cS"r“°¢6öç7BæVÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&Vv—7G&F–öâ×æVÂ×cS"r“°¢–b‚÷VâÇÂæVÂÇÂ÷VâæFF6WBæ&÷VæEcS"ÓÓÒsr’&WGW&ã°¢–b‡æVÂç&VçDVÆVÖVçBÓÒFö7VÖVçBæ&öG’’Fö7VÖVçBæ&öG’æVæD6†–ÆB‡æVÂ“°¢÷VâæFF6WBæ&÷VæEcS"Òss°¢÷VâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ²æVÂæ–ææW$…DÔÂÒ&Vv—7G&F–öäÖ&·WcS"‚“²æVÂæ†–FFVâÒfÇ6S²Fö7VÖVçBæ&öG’æ6Æ74Æ—7BæFB‚w&Vv—7G&F–öâÖ÷Vâ×cSBr“²Ò“°¢æVÂæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢6öç7BWV—ÖVçE6VÆV7BÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçB×6VÆV7B×cs%Òr“°¢–b†WV—ÖVçE6VÆV7B’°¢6öç7Bf÷&ÒÒæVÂçVW'•6VÆV7F÷"‚r7&Vv—7G&F–öâÖf÷&Ò×cS"r“°¢6öç7B—FVÔ–BÒ7G&–ær†WV—ÖVçE6VÆV7BæFF6WBæ—FVÔ–BÇÂrr“°¢6öç7B–çWBÒf÷&ÓòçVW'•6VÆV7F÷"†¶æÖSÒ'7F'F–ætWV—ÖVçD–G2%Õ·fÇVSÒ"G´552æW66R†—FVÔ–B—Ò%Ö“°¢–b†–çWB’²–çWBæ6†V6¶VBÒ–çWBæ6†V6¶VC²–çWBæF—7F6„WfVçB†æWrWfVçB‚v6†ævRrÂ²'V&&ÆW3¢G'VRÒ’“²Ð¢6Æ÷6U7F'F–ætWV—ÖVçDÖöFÅcs"‡æVÂ“°¢&WGW&ã°¢Ð¢–b†WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6Æ÷6R×cs%Òr’ÇÂWfVçBçF&vWCòæ†4GG&–'WFSòâ‚vFF×&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂ×cs"r’’²6Æ÷6U7F'F–ætWV—ÖVçDÖöFÅcs"‡æVÂ“²&WGW&ã²Ð¢6öç7BWV—ÖVçD6&BÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6&B×cs%Òr“°¢–b†WV—ÖVçD6&B’²WfVçBç&WfVçDFVfVÇB‚“²÷Vå7F'F–ætWV—ÖVçDÖöFÅcs"‡æVÂÂWV—ÖVçD6&BæFF6WBæ—FVÔ–B“²&WGW&ã²Ð¢–b†WfVçBçF&vWCòæ–BÓÓÒw&Vv—7G&F–öâÖ6Æ÷6R×cS"rÇÂWfVçBçF&vWCòæ6Æ74Æ—7Còæ6öçF–ç2‚w&Vv—7G&F–öâ×v–æF÷r×cSBr’’²æVÂæ†–FFVâÒG'VS²æVÂæ–ææW$…DÔÂÒrs²Fö7VÖVçBæ&öG’æ6Æ74Æ—7Bç&VÖ÷fR‚w&Vv—7G&F–öâÖ÷Vâ×cSBr“²Ð¢Ò“°¢æVÂæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ°¢6öç7Bf÷&ÒÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚r7&Vv—7G&F–öâÖf÷&Ò×cS"r“°¢–b‚f÷&Ò’&WGW&ã°¢–b†WfVçBçF&vWCòææÖRÓÓÒv6×–vä–Br’&Vg&W6…&Vv—7G&F–öä6†ö–6W5ccb†f÷&Ò“°¢VÇ6R–b…²w6ö6–Ä÷&–v–ä–BrÂvvVöw&†–4÷&–v–ä–BrÂw7F'F–ætWV—ÖVçD–G2uÒæ–æ6ÇVFW2…7G&–ær†WfVçBçF&vWCòææÖRÇÂrr’’’WFFU&Vv—7G&F–öä'VFvWEccb†f÷&Ò“°¢Ò“°¢æVÂæFDWfVçDÆ—7FVæW"‚v¶W–F÷vârÂWfVçBÓâ²6öç7B6&BÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçBÖ6&B×cs%Òr“²–b†6&Bbb†WfVçBæ¶W’ÓÓÒtVçFW"rÇÂWfVçBæ¶W’ÓÓÒrr’’²WfVçBç&WfVçDFVfVÇB‚“²÷Vå7F'F–ætWV—ÖVçDÖöFÅcs"‡æVÂÂ6&BæFF6WBæ—FVÔ–B“²ÒÒ“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v¶W–F÷vârÂWfVçBÓâ²–b†WfVçBæ¶W’ÓÓÒtW66RrbbæVÂçVW'•6VÆV7F÷"‚u¶FF×&Vv—7G&F–öâÖWV—ÖVçBÖÖöFÂ×cs%Òr’’²6Æ÷6U7F'F–ætWV—ÖVçDÖöFÅcs"‡æVÂ“²&WGW&ã²Ò–b†WfVçBæ¶W’ÓÓÒtW66RrbbæVÂæ†–FFVâ’²æVÂæ†–FFVâÒG'VS²æVÂæ–ææW$…DÔÂÒrs²Fö7VÖVçBæ&öG’æ6Æ74Æ—7Bç&VÖ÷fR‚w&Vv—7G&F–öâÖ÷Vâ×cSBr“²ÒÒ“°¢æVÂæFDWfVçDÆ—7FVæW"‚w7V&Ö—BrÂ7–æ2WfVçBÓâ°¢–b†WfVçBçF&vWCòæ–BÓÒw&Vv—7G&F–öâÖf÷&Ò×cS"r’&WGW&ã°¢WfVçBç&WfVçDFVfVÇB‚“°¢6öç7Bf÷&ÒÒWfVçBçF&vWC²6öç7BfBÒæWrf÷&ÔFF†f÷&Ò“²6öç7B7FGW2Òf÷&ÒçVW'•6VÆV7F÷"‚r7&Vv—7G&F–öâ×7FGW2×cS"r“°¢6öç7B6×–vä–BÒ7G&–ær†fBævWB‚v6×–vä–Br’ÇÂrr’çG&–Ò‚“°¢6öç7B6×–vâÒf–Æ&ÆT6×–vå&÷w5cS"‚’æf–æB†2Óâ2æ–BÓÓÒ6×–vä–B“°¢–b‚6×–vâ’²7FGW2çFW‡D6öçFVçBÒ}	­ÍýÝòÝ]Mí-=ýÝâs²&WGW&ã²Ð¢6öç7B7&VF–öâÒfÆ–FFU&Vv—7G&F–öå6VÆV7F–öåccb†f÷&Ò“°¢–b‚7&VF–öâæö²’²7FGW2çFW‡D6öçFVçBÒ7&VF–öâæÖW76vS²WFFU&Vv—7G&F–öä'VFvWEccb†f÷&Ò“²&WGW&ã²Ð¢6öç7B72Ò7G&–ær†fBævWB‚w72r’ÇÂrr“²–b‡72ÓÒ7G&–ær†fBævWB‚w73"r’ÇÂrr’’²7FGW2çFW‡D6öçFVçBÒ}	ýí½‚ÝRí-ýMí"âs²&WGW&ã²Ð¢6öç7BF—7Æ”æÖRÒ7G&–ær†fBævWB‚vF—7Æ”æÖRr’ÇÂrr’çG&–Ò‚“²–b‚F—7Æ”æÖR’&WGW&ã°¢7FGW2çFW‡D6öçFVçBÒ}
í]Ý]ÝRÝ­]-¾(
bs°¢G'’°¢–b‚Æ–W%7–æ2ç6†÷VÆD—6öÆFUW6W'4g&öÕ6æ6†÷B‚’’F‡&÷ræWrW'&÷"‚}	í½}ÝòÝ]íÝ}mòÝ]Mí-=ýÝâ	Ý­]-ÝRí-ý-½]Ý	M	Í2âr“°¢6öç7B7FVÒÒ6ÇVv–g”–B†F—7Æ”æÖRÂwÆ–W"r“°¢6öç7B–BÒG·7FV×ÕòG´FFRææ÷r‚’çFõ7G&–ærƒ3b—ÕòG´ÖF‚ç&æFöÒ‚’çFõ7G&–ærƒ3b’ç6Æ–6Rƒ"Âr—Ö°¢6öç7B–ÖvRÒv—B&Vv—7G&F–öå†÷FõcS"†f÷&ÒæVÆVÖVçG2ç†÷Fóòæf–ÆW3òå³ÒÂ&Vv—7G&F–öåòG¶–GÖ“°¢6öç7BÆ–W"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡°¢–BÂ&öÆS¢wÆ–W"rÂ72Â6†÷'DæÖS¢F—7Æ”æÖRÂF—7Æ”æÖRÂ&æ³¢}	Ýí-½’ý]íÝbrÂfF$vÇ—ƒ¢–æ—F–Ç2†F—7Æ”æÖR’ÂÆ÷&S¢7G&–ær†fBævWB‚vFW67&—F–öâr’ÇÂrr’çG&–Ò‚’Âæ÷FW3¢rrÂ–ÖvRÀ¢W'6öæÆ—G•G&—C¢7G&–ær†fBævWB‚wW'6öæÆ—G•G&—Br’ÇÂrr’çG&–Ò‚’Â–FVÃ¢7G&–ær†fBævWB‚v–FVÂr’ÇÂrr’çG&–Ò‚’ÂvV¶æW73¢7G&–ær†fBævWB‚wvV¶æW72r’ÇÂrr’çG&–Ò‚’À¢&÷fÅ7FGW3¢wVæF–ærrÂÆ–6F–öå7V&Ö—GFVDC¢æWrFFR‚’çFô•4õ7G&–ær‚’Â6×–vä–G3¢¶6×–vä–EÒÂ6ö6–Ä÷&–v–ä–C¢7&VF–öâç&öfW76–öâæ–BÂvVöw&†–4÷&–v–ä–C¢7&VF–öâævVöw&†–2æ–BÂÆÆ÷t7&÷746×–väF—&V7DÖW76vW3¢fÇ6RÀ¢7&VF–öåö–çG57VçC¢7&VF–öâçF÷FÂÂ7F'F–ætWV—ÖVçD–G3¢7&VF–öâæWV—ÖVçD–G2À¢7&VF—G3¢Â7FG3¢²‡7W'&VçC¢Â‡Öƒ¢Â6†–VÆD7W'&VçC¢Â6†–VÆDÖƒ¢ÂVæW&w”7W'&VçC¢ÂVæW&w”Öƒ¢Â&6T&Ö÷$6Æ73¢ÒÂ&–Æ—F–W3¢ö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ‡&÷rÓâ·&÷ræ¶W’ÂÒ’’Â&–Æ—G”&6S¢ö&¦V7Bæg&öÔVçG&–W2„$”Ä•D”U5õcS"æÖ‡&÷rÓâ·&÷ræ¶W’ÂÒ’’À¢WV—ÖVçE6Æ÷G3¢²&–Ö'•vVöã¢rrÂ6V6öæF'•vVöã¢rrÂ&Ö÷#¢rrÒÂ–ç7FÆÆVD–×ÆçD–G3¢µÒÂ–çfVçF÷'“¢7&VF–öâæWV—ÖVçD–G2æÖ†—FVÔ–BÓâ‡²—FVÔ–BÂG“¢Ò’’Â6ö6–Ã¢²ç4–G3¢µÒÂ÷&w3¢µÒÂ&WWFF–öã¢µÒÒÂ7W'&VçEÆæWD–C¢rrÂ&VÆFVD'F–6ÆT–G3¢µÐ¢Ò“°¢–b‚v–æF÷ræVÆV7G&öä“òç7V&Ö—D6†&7FW$Æ–6F–öâ’F‡&÷ræWrW'&÷"‚}
=-Ýí--R-]âãã“2‚]-]Ý½’ÍíM=½ÂÝ­]"r“°¢6öç7B7V&Ö—GFVBÒv—Bv–æF÷ræVÆV7G&öä’ç7V&Ö—D6†&7FW$Æ–6F–öâ‡²Æ–W%ö–C¢–BÂÆ–W"ÂWFFVD'“¢7–æ2æ6öæf–sòæFWf–6TÆ&VÂÇÂvFW6·F÷×&Vv—7G&F–öârÂ6Æ–VçEWFFVDC¢æWrFFR‚’çFô•4õ7G&–ær‚’Ò“°¢–b‚7V&Ö—GFVCòæö²ÇÂ7V&Ö—GFVCòç&÷r’F‡&÷ræWrW'&÷"‡7V&Ö—GFVCòæÖW76vRÇÂ}
]-]ÝRýíM--]M²í]Ý]ÝRÝ­]-²r“°¢Æ–W%7–æ2æÇ•&VÖ÷FU&÷r‡7V&Ö—GFVBç&÷rÂ²WF†÷&—FF—fS¢G'VRÂ6÷W&6S¢vÆ–6F–öâ×7V&Ö—BrÒ“°¢v—Bçw&—FTÆö6ÄÖ—'&÷'2‚“°¢7FGW2çFW‡D6öçFVçBÒ}	Ý­]-ýí-]]Ý]-]íÂ‚ýíý-½Â"m=Ý½R	M	Íâ	MímM-]ÂíMí]Ýòâs°¢f÷&Òç&W6WB‚“°¢æf–ÆÄÆöv–å6VÆV7B‚“°¢Ò6F6‚†W'&÷"’²7FGW2çFW‡D6öçFVçBÒ	ÝR=M½íÂí-ý--ÂÝ­]-3¢G¶W'&÷"æÖW76vWÖ²Ð¢Ò“°¢Ð ¢òò6×–vâ6VÆV7F÷"Ö’&R&V'V–ÇBÖç’F–ÖW2Â'WB&Vv—7G&F–öâ6†÷VÆBÇv—2&VfÆV7BF†R7W'&VçBv÷&ÆBà¢6öç7Bõöf–æ—6„ÆöEcS"ÒÇ•v÷&ÆDFF°¢Ç•v÷&ÆDFFÒgVæ7F–öâ‡–ÆöBÒ·Ò’²6öç7B&W7VÇBÒõöf–æ—6„ÆöEcS"‡–ÆöB“²&–æE&Vv—7G&F–öåcS"‚“²&WGW&â&W7VÇC²Ó°¢&–æE&Vv—7G&F–öåcS"‚“° ¢òòcããc¢vVöw&†–2÷&–v–â6âw&çBf—6–&–Æ—G’Fò&VÂt2ÆæWG2æBF†V—"7—7FV×2à¢6öç7Bõö—4VçF—G•f—6–&ÆUccÒ—4VçF—G•f—6–&ÆS°¢—4VçF—G•f—6–&ÆRÒgVæ7F–öâ†VçF—G’ÂW6W"Òæ7W'&VçEW6W"’°¢–b‚VçF—G’’&WGW&âfÇ6S°¢6öç7B&öÆRÒ7G&–ær‡W6W#òç&öÆRÇÂrr’çFôÆ÷vW$66R‚“°¢–b‡W6W"bb&öÆRÓÒvvÒrbb&öÆRÓÒvwVW7Br’°¢6öç7B÷&–v–âÒ÷&–v–ä'”–EcS"‚vvVöw&†–2rÂW6W"ævVöw&†–4÷&–v–ä–B“°¢–b†÷&–v–â’°¢6öç7B66W72ÒFW&—fT÷&–v–ä66W75cc†÷&–v–â“°¢6öç7BVçF—G”–BÒ7G&–ær†VçF—G’æ–BÇÂrr“°¢–b†VçF—G”–Bbb66W72æÆ–æ¶VEÆæWD–G2æ–æ6ÇVFW2†VçF—G”–B’bbFFævWEÆæWCòâ†VçF—G”–B’’&WGW&âG'VS°¢–b†VçF—G”–Bbb66W72æÆ–æ¶VE7—7FVÔ–G2æ–æ6ÇVFW2†VçF—G”–B’bbFFævWE7—7FVÓòâ†VçF—G”–B’’&WGW&âG'VS°¢Ð¢Ð¢&WGW&âõö—4VçF—G•f—6–&ÆUcc†VçF—G’ÂW6W"“°¢Ó° ¢òòVç7W&RÆVv7’Ö–æ’ÖvÖRÖöGVÆR6âæWfW"&R&V÷VæVBg&öÒ7FÆR7FFRà¢6öç7Bõö÷VäÖöGVÆUcS"ÒT’æ÷VäÖöGVÆRæ&–æB…T’“°¢T’æ÷VäÖöGVÆRÒgVæ7F–öâ†–BÂââæ&w2’²–b†–BÓÓÒwFööÂr’&WGW&ã²&WGW&âõö÷VäÖöGVÆUcS"†–BÂââæ&w2“²Ó°§Ò’‚“°  ¢òòÓÓÓÒcããc"6×–vâ×v–FR6†B²tÒå2fö–6R–â6×–vâ6†ææVÂÓÓÓÐ¢†gVæ7F–öâ‚—°¢–b‡v–æF÷råõö6×–vä6†Ecc"’&WGW&ã°¢v–æF÷råõö6×–vä6†Ecc"ÒG'VS° ¢gVæ7F–öâÆ–W$6×–vä–G5cc"‡Æ–W"Ò·Ò’°¢6öç7B&rÒ'&’æ—4'&’‡Æ–W"æ6×–vä–G2’òÆ–W"æ6×–vä–G2¢„'&’æ—4'&’‡Æ–W"æ6×–vç2’òÆ–W"æ6×–vç2¢µÒ“°¢6öç7B–G2Ò&ræÖ‡fÇVRÓâ7G&–ær‡fÇVSòæ–BÇÂfÇVRÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ“°¢–b‡Æ–W"æ6×–vä–B’–G2çW6‚…7G&–ær‡Æ–W"æ6×–vä–B’çG&–Ò‚’“°¢6öç7BVæ—VRÒ'&’æg&öÒ†æWr6WB†–G2æf–ÇFW"„&ööÆVâ’’“°¢&WGW&âVæ—VRæÆVæwF‚òVæ—VR¢²vÖ–âuÓ°¢Ð¢gVæ7F–öâ—4&÷fVD6×–våÆ–W%cc"‡Æ–W"Ò·Ò’°¢6öç7B&öÆRÒ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚“°¢–b‡&öÆRÓÓÒvvÒr’&WGW&âG'VS°¢&WGW&â7G&–ær‡Æ–W"æ&÷fÅ7FGW2ÇÂv&÷fVBr’çFôÆ÷vW$66R‚’ÓÓÒv&÷fVBs°¢Ð¢gVæ7F–öâ7W'&VçD6×–vä–Ecc"‚’°¢&WGW&â7G&–ær„æ7F—fT6×–vä–BÇÂv–æF÷räu%t6×–våF†VÖSòæ6×–vãòâ‚“òæ–BÇÂrr’çG&–Ò‚“°¢Ð¢gVæ7F–öâ6åW6T6×–vä6†Ecsr†6×–vä–BÒ7W'&VçD6×–vä–Ecc"‚’’°¢6öç7B–BÒ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚“°¢6öç7B&öÆRÒ7G&–ær„æ7W'&VçEW6W#òç&öÆRÇÂrr’çFôÆ÷vW$66R‚“°¢–b‚–BÇÂæ7W'&VçEW6W"ÇÂ&öÆRÓÓÒvwVW7Br’&WGW&âfÇ6S°¢–b‡&öÆRÓÓÒvvÒr’&WGW&âG'VS°¢&WGW&âÆ–W$6×–vä–G5cc"„æ7W'&VçEW6W"’æ–æ6ÇVFW2†–B“°¢Ð¢gVæ7F–öâ6×–våF‡&VD¶W•cc"†6×–vä–BÒ7W'&VçD6×–vä–Ecc"‚’’°¢&WGW&â6×–vã£¢Gµ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚—Ö°¢Ð¢gVæ7F–öâ6×–väVçF—G•cc"†6×–vä–BÒ7W'&VçD6×–vä–Ecc"‚’’°¢6öç7B–BÒ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚“°¢&WGW&âFFòæ6×–vç3òå¶–EÒÇÂv÷&ÆDFFòæ6×–vç3òä4Õ”tå3òå¶–EÒÇÂ²–BÂæÖS¢–BÇÂ}	­ÍýÝòrÓ°¢Ð¢gVæ7F–öâ&÷fVD6×–våÆ–W'5cc"†6×–vä–BÒ7W'&VçD6×–vä–Ecc"‚’’°¢6öç7B–BÒ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚“°¢6öç7B&÷w2Òö&¦V7BçfÇVW2„ç7FFSòçW6W'2ÇÂÄ”U%õDTÕÄDU2ÇÂ·Ò“°¢&WGW&â&÷w0¢æf–ÇFW"‡Æ–W"ÓâÆ–W"bb7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÒvwVW7Br¢æf–ÇFW"†—4&÷fVD6×–våÆ–W%cc"¢æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒrÇÂÆ–W$6×–vä–G5cc"‡Æ–W"’æ–æ6ÇVFW2†–B’¢ç6÷'B‚†Æ"“Óå7G&–ær†æF—7Æ”æÖWÇÆç6†÷'DæÖWÇÆæ–GÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†"æF—7Æ”æÖWÇÆ"ç6†÷'DæÖWÇÆ"æ–GÇÂrr’Âw'Rr’“°¢Ð¢gVæ7F–öâ7&÷746×–väF—&V7DVæ&ÆVEcc2‡Æ–W"Ò·Ò’°¢&WGW&âÆ–W#òæÆÆ÷t7&÷746×–väF—&V7DÖW76vW2ÓÓÒG'VRÇÂ7G&–ær‡Æ–W#òæÆÆ÷t7&÷746×–väF—&V7DÖW76vW2ÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒwG'VRs°¢Ð¢gVæ7F–öâ6åÆ–W'4F—&V7DÖW76vUcc2‡6VæFW$–BÂF&vWD–BÂ6×–vä–BÒ7W'&VçD6×–vä–Ecc"‚’’°¢6öç7B6VæFW"ÒvWEÆ–W$VçF—G”f÷$6†B…7G&–ær‡6VæFW$–BÇÂrr’“°¢6öç7BF&vWBÒvWEÆ–W$VçF—G”f÷$6†B…7G&–ær‡F&vWD–BÇÂrr’“°¢–b‚6VæFW"ÇÂF&vWB’&WGW&âfÇ6S°¢–b…7G&–ær‡F&vWBç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’&WGW&âfÇ6S°¢–b…7G&–ær‡6VæFW"ç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’&WGW&â—4&÷fVD6×–våÆ–W%cc"‡F&vWB“°¢–b‚—4&÷fVD6×–våÆ–W%cc"‡6VæFW"’ÇÂ—4&÷fVD6×–våÆ–W%cc"‡F&vWB’’&WGW&âfÇ6S°¢6öç7B7F—fT6×–vâÒ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚“°¢–b†7F—fT6×–vâbbÆ–W$6×–vä–G5cc"‡F&vWB’æ–æ6ÇVFW2†7F—fT6×–vâ’’&WGW&âG'VS°¢&WGW&â7&÷746×–väF—&V7DVæ&ÆVEcc2‡6VæFW"’ÇÂ7&÷746×–väF—&V7DVæ&ÆVEcc2‡F&vWB“°¢Ð¢v–æF÷räu%t6†EöÆ–7•cc2Ò°¢6äF—&V7C¢‡6VæFW$–BÂF&vWD–B’Óâ6åÆ–W'4F—&V7DÖW76vUcc2‡6VæFW$–BÂF&vWD–BÂ7W'&VçD6×–vä–Ecc"‚’’À¢7&÷746×–väVæ&ÆVC¢Æ–W"Óâ7&÷746×–väF—&V7DVæ&ÆVEcc2‡Æ–W"¢Ó° ¢gVæ7F–öâ6×–väç4÷F–öç5cc"‚’°¢6öç7BÆ—7BÒö&¦V7BçfÇVW2„å52ÇÂ·Ò“°¢–b…7G&–ær„æ7W'&VçEW6W#òç&öÆRÇÂrr’çFôÆ÷vW$66R‚’ÓÓÒvvÒr’°¢&WGW&âÆ—7Bç6÷'B‚†Æ"“Óå7G&–ær†ææÖWÇÆæ–GÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†"ææÖWÇÆ"æ–GÇÂrr’Âw'Rr’“°¢Ð¢&WGW&âÆ—7Bæf–ÇFW"†ç2Óâ—4VçF—G•f—6–&ÆR†ç2’’ç6÷'B‚†Æ"“Óå7G&–ær†ææÖWÇÆæ–GÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†"ææÖWÇÆ"æ–GÇÂrr’Âw'Rr’“°¢Ð ¢gVæ7F–öâVç7W&T6×–vä6†E7FFUcc"‚’°¢–b‚ç7FFRæ6×–vä6†G2ÇÂG—Vöbç7FFRæ6×–vä6†G2ÓÒvö&¦V7Br’ç7FFRæ6×–vä6†G2Ò·Ó°¢&WGW&âç7FFRæ6×–vä6†G3°¢Ð¢gVæ7F–öâvWD6×–vä6†EF‡&VEcc"†6×–vä–BÒ7W'&VçD6×–vä–Ecc"‚’’°¢6öç7B6†G2ÒVç7W&T6×–vä6†E7FFUcc"‚“°¢6öç7B–BÒ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚“°¢–b‚'&’æ—4'&’†6†G5¶–EÒ’’6†G5¶–EÒÒµÓ°¢&WGW&â6†G5¶–EÓ°¢Ð¢gVæ7F–öâVæD6×–vä6†DÖW76vUcc"†6×–vä–BÂ–ÆöBÒ·Ò’°¢6öç7B–BÒ7G&–ær†6×–vä–BÇÂrr’çG&–Ò‚“°¢6öç7BFW‡BÒ7G&–ær‡–ÆöBçFW‡BÇÂrr’çG&–Ò‚“°¢–b‚–BÇÂFW‡BÇÂ6åW6T6×–vä6†Ecsr†–B’’&WGW&âçVÆÃ°¢6öç7B6VæFW%G—RÒ7G&–ær‡–ÆöBç6VæFW%G—RÇÂwÆ–W"r“°¢6öç7BÖW76vRÒ°¢–C¢G´FFRææ÷r‚—ÕòG´ÖF‚ç&æFöÒ‚’çFõ7G&–ærƒ3b’ç6Æ–6Rƒ"Ã‚—ÖÀ¢6×–vä–C¢–BÀ¢6VæFW%G—RÀ¢6VæFW$–C¢7G&–ær‡–ÆöBç6VæFW$–BÇÂæ7W'&VçEW6W$–BÇÂrr’À¢ç4–C¢6VæFW%G—RÓÓÒvç2rò7G&–ær‡–ÆöBæç4–BÇÂ–ÆöBç6VæFW$–BÇÂrr’¢rrÀ¢&V6—–VçEÆ–W$–C¢7G&–ær‡–ÆöBç&V6—–VçEÆ–W$–BÇÂæ7W'&VçEW6W$–BÇÂ–ÆöBç6VæFW$–BÇÂrr’À¢WF†÷$Æ&VÃ¢7G&–ær‡–ÆöBæWF†÷$Æ&VÂÇÂrr’À¢FW‡BÀ¢7&VFVDC¢æWrFFR‚’çFô•4õ7G&–ær‚¢Ó°¢vWD6×–vä6†EF‡&VEcc"†–B’çW6‚†ÖW76vR“°¢6†E7–æ2çVWVR„6†E7–æ2æ6×–vå&÷tg&öÔÖW76vUcc"†ÖW76vRÂ–B’“°¢&WGW&âÖW76vS°¢Ð ¢6öç7BõöÖ¶TFVfVÇE7FFUcc"ÒÖ¶TFVfVÇE7FFS°¢Ö¶TFVfVÇE7FFRÒgVæ7F–öâ‚’°¢6öç7B7FFRÒõöÖ¶TFVfVÇE7FFUcc"‚“°¢–b‚7FFRæ6×–vä6†G2ÇÂG—Vöb7FFRæ6×–vä6†G2ÓÒvö&¦V7Br’7FFRæ6×–vä6†G2Ò·Ó°¢&WGW&â7FFS°¢Ó°¢6öç7Bõöæ÷&ÖÆ—¦Ucc"ÒW'6—7FVæ6Rææ÷&ÖÆ—¦Ræ&–æB…W'6—7FVæ6R“°¢W'6—7FVæ6Rææ÷&ÖÆ—¦RÒgVæ7F–öâ†6æF–FFR’°¢6öç7B7FFRÒõöæ÷&ÖÆ—¦Ucc"†6æF–FFR“°¢7FFRæ6×–vä6†G2ÒFVW†6æF–FFSòæ6×–vä6†G2ÇÂ7FFRæ6×–vä6†G2ÇÂ·Ò“°¢–b‚7FFRæ6×–vä6†G2ÇÂG—Vöb7FFRæ6×–vä6†G2ÓÒvö&¦V7Br’7FFRæ6×–vä6†G2Ò·Ó°¢&WGW&â7FFS°¢Ó°¢Vç7W&T6×–vä6†E7FFUcc"‚“° ¢6†E7–æ2æ6×–vå&÷tg&öÔÖW76vUcc"ÒgVæ7F–öâ†ÖW76vRÂ6×–vä–B’°¢6öç7B–BÒ7G&–ær†6×–vä–BÇÂÖW76vSòæ6×–vä–BÇÂrr’çG&–Ò‚“°¢&WGW&â°¢ÖW76vUö–C¢7G&–ær†ÖW76vRæ–B’À¢òò¶VWF†RW7F&Æ—6†VBö6¶WD&6R¶–æBfÇVS²6×–vâ6†ææVÂ–FVçF—G’Æ—fW2–âF‡&VEö¶W’à¢¶–æC¢vF—&V7BrÀ¢F‡&VEö¶W“¢6×–våF‡&VD¶W•cc"†–B’À¢6VæFW%÷G—S¢7G&–ær†ÖW76vRç6VæFW%G—RÇÂwÆ–W"r’À¢6VæFW%ö–C¢7G&–ær†ÖW76vRç6VæFW$–BÇÂrr’À¢&V6—–VçE÷Æ–W%ö–C¢7G&–ær†ÖW76vRç&V6—–VçEÆ–W$–BÇÂÖW76vRç6VæFW$–BÇÂæ7W'&VçEW6W$–BÇÂrr’À¢ç5ö–C¢7G&–ær†ÖW76vRæç4–BÇÂrr’À¢F—&V7Eö¢çVÆÂÀ¢F—&V7Eö#¢çVÆÂÀ¢WF†÷%öÆ&VÃ¢ÖW76vRæWF†÷$Æ&VÂÇÂ†ÖW76vRç6VæFW%G—RÓÓÒvç2rò„FFævWDç2†ÖW76vRæç4–B“òææÖRÇÂtå2r’¢vWEÆ–W$F—7Æ”æÖR†ÖW76vRç6VæFW$–B’’À¢&öG•ö‡FÖÃ¢7G&–ær†ÖW76vRçFW‡BÇÂrr’À¢7&VFVEöC¢ÖW76vRæ7&VFVDBÇÂæWrFFR‚’çFô•4õ7G&–ær‚’À¢VF—FVEöC¢ÖW76vRæVF—FVDBÇÂçVÆÂÀ¢FVÆWFVEöC¢ÖW76vRæFVÆWFVDBÇÂçVÆÂÀ¢WFFVEöC¢ÖW76vRæVF—FVDBÇÂÖW76vRæFVÆWFVDBÇÂÖW76vRæ7&VFVDBÇÂæWrFFR‚’çFô•4õ7G&–ær‚’À¢6Æ–VçE÷WFFVEöC¢ÖW76vRæVF—FVDBÇÂÖW76vRæFVÆWFVDBÇÂÖW76vRæ7&VFVDBÇÂæWrFFR‚’çFô•4õ7G&–ær‚¢Ó°¢Ó° ¢6öç7BõöW‡÷'DÆÄÆö6Å&÷w5cc"Ò6†E7–æ2æW‡÷'DÆÄÆö6Å&÷w2æ&–æB„6†E7–æ2“°¢6†E7–æ2æW‡÷'DÆÄÆö6Å&÷w2ÒgVæ7F–öâ‚’°¢6öç7B&÷w2ÒõöW‡÷'DÆÄÆö6Å&÷w5cc"‚“°¢f÷"†6öç7B¶6×–vä–BÂF‡&VEÒöbö&¦V7BæVçG&–W2†Vç7W&T6×–vä6†E7FFUcc"‚’’’°¢„'&’æ—4'&’‡F‡&VB’òF‡&VB¢µÒ’æf÷$V6‚†ÖW76vRÓâ&÷w2çW6‚‡F†—2æ6×–vå&÷tg&öÔÖW76vUcc"†ÖW76vRÂ6×–vä–B’’“°¢Ð¢&WGW&â&÷w2ç6÷'B‚†Æ"“Óç°¢6öç7BBÒæWrFFR†çWFFVEöBÇÂæ7&VFVEöBÇÂ’ævWEF–ÖR‚“°¢6öç7B'BÒæWrFFR†"çWFFVEöBÇÂ"æ7&VFVEöBÇÂ’ævWEF–ÖR‚“°¢&WGW&âBÒ'BÇÂ7G&–ær†æÖW76vUö–GÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†"æÖW76vUö–GÇÂrr’“°¢Ò“°¢Ó° ¢6öç7BõöÇ•&VÖ÷FU&÷w5cc"Ò6†E7–æ2æÇ•&VÖ÷FU&÷w2æ&–æB„6†E7–æ2“°¢6†E7–æ2æÇ•&VÖ÷FU&÷w2ÒgVæ7F–öâ‡&÷w2ÒµÒ’°¢6öç7B6×–vå&÷w2Ò„'&’æ—4'&’‡&÷w2’ò&÷w2¢µÒ’æf–ÇFW"‡&÷rÓâ7G&–ær‡&÷sòçF‡&VEö¶W’ÇÂrr’ç7F'G5v—F‚‚v6×–vã£¢r’“°¢6öç7Bæ÷&ÖÅ&÷w2Ò„'&’æ—4'&’‡&÷w2’ò&÷w2¢µÒ’æf–ÇFW"‡&÷rÓâ7G&–ær‡&÷sòçF‡&VEö¶W’ÇÂrr’ç7F'G5v—F‚‚v6×–vã£¢r’“°¢ÆWB6†ævVBÒæ÷&ÖÅ&÷w2æÆVæwF‚òõöÇ•&VÖ÷FU&÷w5cc"†æ÷&ÖÅ&÷w2’¢fÇ6S°¢6×–vå&÷w2æf÷$V6‚‡&÷rÓâ°¢6öç7B6×–vä–BÒ7G&–ær‡&÷rçF‡&VEö¶W’ÇÂrr’ç6Æ–6R‚v6×–vã£¢ræÆVæwF‚’çG&–Ò‚“°¢–b‚6×–vä–BÇÂ&÷ræÖW76vUö–B’&WGW&ã°¢6öç7BF‡&VBÒvWD6×–vä6†EF‡&VEcc"†6×–vä–B“°¢6öç7B–G‚ÒF‡&VBæf–æD–æFW‚†ÖW76vRÓâ7G&–ær†ÖW76vRæ–B’ÓÓÒ7G&–ær‡&÷ræÖW76vUö–B’“°¢–b‡&÷ræFVÆWFVEöB’°¢–b†–G‚ãÒ’²F‡&VBç7Æ–6R†–G‚Ã“²6†ævVBÒG'VS²Ð¢F†—2çWFFT7W'6÷$g&öÕ&÷r‡&÷r“°¢&WGW&ã°¢Ð¢6öç7B6VæFW%G—RÒ7G&–ær‡&÷rç6VæFW%÷G—RÇÂwÆ–W"r“°¢6öç7BÖW76vRÒ°¢–C¢7G&–ær‡&÷ræÖW76vUö–B’À¢6×–vä–BÀ¢6VæFW%G—RÀ¢6VæFW$–C¢7G&–ær‡&÷rç6VæFW%ö–BÇÂrr’À¢ç4–C¢7G&–ær‡&÷ræç5ö–BÇÂ‡6VæFW%G—RÓÓÒvç2rò&÷rç6VæFW%ö–BÇÂrr¢rr’’À¢&V6—–VçEÆ–W$–C¢7G&–ær‡&÷rç&V6—–VçE÷Æ–W%ö–BÇÂrr’À¢WF†÷$Æ&VÃ¢&÷ræWF†÷%öÆ&VÂÇÂ‡6VæFW%G—RÓÓÒvç2rò„FFævWDç2‡&÷ræç5ö–BÇÂ&÷rç6VæFW%ö–B“òææÖRÇÂtå2r’¢vWEÆ–W$F—7Æ”æÖR‡&÷rç6VæFW%ö–B’’À¢FW‡C¢7G&–ær‡&÷ræ&öG•ö‡FÖÂÇÂrr’À¢7&VFVDC¢&÷ræ7&VFVEöBÇÂæWrFFR‚’çFô•4õ7G&–ær‚’À¢VF—FVDC¢&÷ræVF—FVEöBÇÂçVÆÀ¢Ó°¢–b†–G‚ãÒ’°¢–b„¥4ôâç7G&–æv–g’‡F‡&VE¶–G…Ò’ÓÒ¥4ôâç7G&–æv–g’†ÖW76vR’’²F‡&VE¶–G…ÒÒÖW76vS²6†ævVBÒG'VS²Ð¢ÒVÇ6R°¢F‡&VBçW6‚†ÖW76vR“°¢F‡&VBç6÷'B‚†Æ"“ÓææWrFFR†æ7&VFVDGÇÃ’ævWEF–ÖR‚’ÖæWrFFR†"æ7&VFVDGÇÃ’ævWEF–ÖR‚’ÇÂ7G&–ær†æ–GÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†"æ–GÇÂrr’’“°¢6†ævVBÒG'VS°¢Ð¢F†—2çWFFT7W'6÷$g&öÕ&÷r‡&÷r“°¢Ò“°¢&WGW&â6†ævVC°¢Ó° ¢6öç7Bõö'V–ÆE6†&VEcc"Ò'V–ÆE6†&VE7FFU6æ6†÷C°¢'V–ÆE6†&VE7FFU6æ6†÷BÒgVæ7F–öâ‡7FFRÒòç7FFRÇÂÖ¶TFVfVÇE7FFR‚’’°¢6öç7B6æÒõö'V–ÆE6†&VEcc"‡7FFR“°¢FVÆWFR6ææ6×–vä6†G3°¢&WGW&â6æ°¢Ó°¢6öç7BõöÇ•6æ6†÷Ecc"Ò7–æ2æÇ•&VÖ÷FU6æ6†÷Bæ&–æB…7–æ2“°¢7–æ2æÇ•&VÖ÷FU6æ6†÷BÒ7–æ2gVæ7F–öâ‡–ÆöBÂ&VÖ÷FTÖWFÒ·ÒÂ÷F–öç2Ò·Ò’°¢6öç7BÆö6Ä6×–vä6†G2ÒFVW„ç7FFSòæ6×–vä6†G2ÇÂ·Ò“°¢6öç7B&W7VÇBÒv—BõöÇ•6æ6†÷Ecc"‡–ÆöBÂ&VÖ÷FTÖWFÂ÷F–öç2“°¢ç7FFRæ6×–vä6†G2ÒÆö6Ä6×–vä6†G3°¢&WGW&â&W7VÇC°¢Ó° ¢gVæ7F–öâ6×–väÖW76vTÖ&·Wcc"†ÖW76vR’°¢6öç7B÷vâÒ7G&–ær†ÖW76vRç6VæFW$–BÇÂrr’ÓÓÒ7G&–ær„æ7W'&VçEW6W$–BÇÂrr’bbÖW76vRç6VæFW%G—RÓÒvç2s°¢6öç7BÆ&VÂÒÖW76vRæWF†÷$Æ&VÂÇÂ†ÖW76vRç6VæFW%G—RÓÓÒvç2rò„FFævWDç2†ÖW76vRæç4–B“òææÖRÇÂtå2r’¢vWEÆ–W$F—7Æ”æÖR†ÖW76vRç6VæFW$–B’“°¢&WGW&âÆF—b6Æ73Ò&6†BÖ'V&&ÆRG¶÷vâòwÆ–W"r¢vç2wÒG¶ÖW76vRç6VæFW%G—RÓÓÒvç2ròv6×–vâÖç2ÖÖW76vR×cc"r¢rwÒ#ãÆF—b6Æ73Ò&6†BÖ†VB×&÷r#ãÆF—b6Æ73Ò&6†BÖÖWF#âG¶W62†Æ&VÂ—Ò+rG¶W62†f÷&ÖDÖW76vTÖWFF–ÖR†ÖW76vR’—ÓÂöF—câG·&VæFW$6†DÖW76vT6öçG&öÇ2‚v6×–vârÂÖW76vR—ÓÂöF—câGµõ÷&VæFW%&–6…FW‡Bòõ÷&VæFW%&–6…FW‡B†ÖW76vRçFW‡BÂsÆF—cãÂöF—câr’¢ÆF—câG¶W62†ÖW76vRçFW‡B—ÓÂöF—cæÓÂöF—cæ°¢Ð¢gVæ7F–öâ6×–vä†VFW%cc"†6×–vä–B’°¢6öç7B6×–vâÒ6×–väVçF—G•cc"†6×–vä–B“°¢6öç7BÖVÖ&W'2Ò&÷fVD6×–våÆ–W'5cc"†6×–vä–B’æf–ÇFW"‡Æ–W"Óâ7G&–ær‡Æ–W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒr“°¢&WGW&âÆF—b6Æ73Ò&ÖW76vR×F‡&VBÖ†VB6×–vâÖ6†BÖ†VB×cc"#ãÆF—b6Æ73Ò&ÖW76vR×F‡&VBÖfF"#ãÆF—b6Æ73Ò&VçF—G’×F‡VÖ"6ÒfÆÆ&6²#ãÇ7ãäÄÃÂ÷7ããÂöF—cãÂöF—cãÆF—cãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	í’}"+rG¶W62†6×–vãòææÖRÇÂ6×–vä–B—ÓÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG¶W62†ÖVÖ&W'2æÖ‡Æ–W#ÓçÆ–W"æF—7Æ”æÖWÇÇÆ–W"ç6†÷'DæÖWÇÇÆ–W"æ–B’æ¦ö–â‚r+rr’ÇÂ}	Ý]"íMí]ÝÝ½Rý]íÝm]’r—Ò+r	M	ÃÂöF—cãÂöF—cãÂöF—cæ°¢Ð¢gVæ7F–öâ6×–vä6ö×÷6Ucc"†6×–vä–BÂvÒÒfÇ6R’°¢–b‚6åW6T6×–vä6†Ecsr†6×–vä–B’’&WGW&ârs°¢6öç7Bç4÷F–öç2ÒvÒò6×–väç4÷F–öç5cc"‚’¢µÓ°¢&WGW&âÆf÷&Ò6Æ73Ò&f÷&Ò6×–vâÖ6†BÖf÷&Ò×cc""FFÖ6×–vâÖ–CÒ"G¶W62†6×–vä–B—Ò#âG¶vÒòÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ý-Âí"½mÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&7F÷"#ãÆ÷F–öâfÇVSÒ&vÓ¢G¶W62„æ7W'&VçEW6W$–B—Ò#í	M	Â+rG¶W62„æ7W'&VçEW6W#òæF—7Æ”æÖRÇÂæ7W'&VçEW6W#òç6†÷'DæÖRÇÂ}	-]M=’r—ÓÂö÷F–öãâG¶ç4÷F–öç2æÖ†ç3ÓæÆ÷F–öâfÇVSÒ&ç3¢G¶W62†ç2æ–B—Ò#äå2+rG¶W62†ç2ææÖWÇÆç2æ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöF—cæ¢rwÓÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
íí]ÝSÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V6†BÖ–çWB"æÖSÒ&ÖW76vR"Æ6V†öÆFW#Ò-	Ýý-Â"í’}"­ÍýÝ‚âââ#ãÂ÷FW‡F&VâG·G—Vöbõö‡FÖÄ†–çBÓÒwVæFVf–æVBròõö‡FÖÄ†–çB¢rwÓÂöF—cãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í	í
-	ý
		-	
-
Â	"	í	
		’
}	
#Âö'WGFöããÂöf÷&Óæ°¢Ð ¢ÖW76vW5T’ç&VæFW$f÷%Æ–W"ÒgVæ7F–öâ‚’°¢6öç7B6×–vä–BÒ7W'&VçD6×–vä–Ecc"‚“°¢6öç7B6×–väÆÆ÷vVBÒ6åW6T6×–vä6†Ecsr†6×–vä–B“°¢6öç7B6×–våF‡&VBÒ6×–väÆÆ÷vVBòvWD6×–vä6†EF‡&VEcc"†6×–vä–B’¢µÓ°¢6öç7B6V&6‚Ò7G&–ær‡F†—2çÆ–W%6V&6‚ÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢6öç7BÖF6†W56V&6‚Ò‚ââç'G2’Óâ6V&6‚ÇÂ'G2æf–ÇFW"„&ööÆVâ’æ¦ö–â‚rr’çFôÆ÷vW$66R‚’æ–æ6ÇVFW2‡6V&6‚“°¢6öç7BF—&V7DVçG&–W2ÒÆ—7DF—&V7D6†E'FæW$–G2„æ7W'&VçEW6W$–B’æf–ÇFW"†–CÓæ6åÆ–W'4F—&V7DÖW76vUcc2„æ7W'&VçEW6W$–BÂ–BÂ6×–vä–B’’æÖ†–CÓç°¢6öç7BÆ–W#ÖvWEÆ–W$VçF—G”f÷$6†B†–B“²6öç7B¶W“ÖF—&V7D6†D¶W’„æ7W'&VçEW6W$–BÆ–B“²6öç7BF‡&VCÖvWDF—&V7D6†EF‡&VB„æ7W'&VçEW6W$–BÆ–B“°¢&WGW&â¶–BÇÆ–W"Æ¶W’ÇF‡&VBÇVç&VC¦vWDF—&V7EVç&VD6÷VçDf÷%f–WvW"†¶W’’ÆÆ7DC¦vWEF‡&VDÆ7DB‡F‡&VB’Ç&Wf–Ws¦vWEF‡&VDÆ7E&Wf–Wr‡F‡&VB—Ó°¢Ò’æf–ÇFW"†VçG'“ÓæÖF6†W56V&6‚†VçG'’çÆ–W"æF—7Æ”æÖWÇÆvWEÆ–W$F—7Æ”æÖR†VçG'’æ–B’ÆVçG'’ç&Wf–WrÆVçG'’æ–B’’ç6÷'B‚†Æ"“Óæ"æÆ7DBÖæÆ7DGÇÆ"çVç&VBÖçVç&VGÇÅ7G&–ær†çÆ–W"æF—7Æ”æÖWÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†"çÆ–W"æF—7Æ”æÖWÇÂrr’Âw'Rr’“°¢6öç7Bç4VçG&–W3ÖÆ—7Dç5F‡&VG4f÷%Æ–W"„æ7W'&VçEW6W$–B’æÖ†ç3Óç¶6öç7BF‡&VCÖvWDç46†EF‡&VB†ç2æ–BÄæ7W'&VçEW6W$–B“·&WGW&ç¶ç2ÇF‡&VBÇVç&VC¦vWDç5Vç&VD6÷VçDf÷%f–WvW"†ç2æ–BÄæ7W'&VçEW6W$–B’ÆÆ7DC¦vWEF‡&VDÆ7DB‡F‡&VB’Ç&Wf–Ws¦vWEF‡&VDÆ7E&Wf–Wr‡F‡&VB—×Ò’æf–ÇFW"†VçG'“ÓæÖF6†W56V&6‚†VçG'’æç2ææÖRÆVçG'’ç&Wf–WrÆVçG'’æç2æ–BÆVçG'’æç2æÖÆ&VÂ’’ç6÷'B‚†Æ"“Óæ"æÆ7DBÖæÆ7DGÇÆ"çVç&VBÖçVç&VGÇÅ7G&–ær†æç2ææÖWÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†"æç2ææÖWÇÂrr’Âw'Rr’“° ¢6öç7B6×–våfÆ–BÒ6×–väÆÆ÷vVBbb‚6V&6‚ÇÂÖF6†W56V&6‚†6×–väVçF—G•cc"†6×–vä–B“òææÖRÂ}í’}"rÂ}­ÍýÝòrÆvWEF‡&VDÆ7E&Wf–Wr†6×–våF‡&VB’’“°¢ÆWB¶–æC×F†—2ç6VÆV7FVEÆ–W$¶–æBÂ¶W“Õ7G&–ær‡F†—2ç6VÆV7FVEÆ–W$¶W—ÇÂrr“°¢–b†¶–æCÓÓÒv6×–vârbb¶W“ÓÓÖ6×–vä–Bbb6×–våfÆ–B’·Ð¢VÇ6R–b†¶–æCÓÓÒvF—&V7BrbbF—&V7DVçG&–W2ç6öÖR†SÓæRæ–CÓÓÖ¶W’’’·Ð¢VÇ6R–b†¶–æCÓÓÒvç2rbbç4VçG&–W2ç6öÖR†SÓæRæç2æ–CÓÓÖ¶W’’’·Ð¢VÇ6R–b†6×–våfÆ–B’¶¶–æCÒv6×–vâs¶¶W“Ö6×–vä–C·Ð¢VÇ6R–b†F—&V7DVçG&–W5³Ò’¶¶–æCÒvF—&V7Bs¶¶W“ÖF—&V7DVçG&–W5³Òæ–C·Ð¢VÇ6R–b†ç4VçG&–W5³Ò’¶¶–æCÒvç2s¶¶W“Öç4VçG&–W5³Òæç2æ–C·Ð¢VÇ6R¶¶–æCÖçVÆÃ¶¶W“Òrs·Ð¢F†—2ç6VÆV7FVEÆ–W$¶–æCÖ¶–æC·F†—2ç6VÆV7FVEÆ–W$¶W“Ö¶W“°¢6öç7B7F—fTF—&V7CÖ¶–æCÓÓÒvF—&V7BsöF—&V7DVçG&–W2æf–æB†SÓæRæ–CÓÓÖ¶W’“¦çVÆÃ°¢6öç7B7F—fTç4VçG'“Ö¶–æCÓÓÒvç2söç4VçG&–W2æf–æB†SÓæRæç2æ–CÓÓÖ¶W’“¦çVÆÃ°¢&WGW&âÆF—b6Æ73Ò&ÖW76vW2ÖÆ–÷WB#ãÆ6–FR6Æ73Ò&ÖW76vW2×6–FR6&B#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
íí]ÝóÂöF—cãÆF—b6Æ73Ò&f–VÆB"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£'‚#ãÆ–çWB6Æ73Ò&–çWB"–CÒ&ÖW76vW2×6V&6‚×Æ–W""fÇVSÒ"G¶W62‡F†—2çÆ–W%6V&6‡ÇÂrr—Ò"Æ6V†öÆFW#Ò-	ýí¢ýâÍ]Ý‚Â”B½‚-]­-2âââ"óãÂöF—cãÆF—b6Æ73Ò&ÖW76vRÖ6öçF7BÖÆ—7B#ãÆF—b6Æ73Ò'F–ç’ÖÆ&VÂ"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£‡‚#í	­ÍýÝóÂöF—câG¶6×–våfÆ–C÷&VæFW$ÖW76vT6öçF7E&÷r‡¶7F—fS¦¶–æCÓÓÒv6×–vârÇF—FÆS¦	í’}"+rG¶6×–väVçF—G•cc"†6×–vä–B“òææÖWÇÆ6×–vä–GÖÇ7V'F—FÆS¦vWEF‡&VDÆ7E&Wf–Wr†6×–våF‡&VB—ÇÂ}	-RíMí]ÝÝ½Rý]íÝm‚­ÍýÝ‚+r	M	ÂrÆfF$‡FÖÃ¢sÇ7â6Æ73Ò&VçF—G’×F‡VÖ"‡2fÆÆ&6²#ãÇ7ãäÄÃÂ÷7ããÂ÷7ãârÇVç&VC£Æ¶–æC¢v6×–vârÆ¶W“¦6×–vä–GÒ“¢sÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	í’}"Ý]Mí-=ý]ÒãÂöF—câwÓÂöF—cãÆF—b6Æ73Ò&ÖW76vRÖ6öçF7BÖÆ—7B"7G–ÆSÒ&Ö&v–â×F÷£G‚#ãÆF—b6Æ73Ò'F–ç’ÖÆ&VÂ"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£‡‚#í	=í­ƒÂöF—câG¶F—&V7DVçG&–W2æÖ†VçG'“Óç&VæFW$ÖW76vT6öçF7E&÷r‡¶7F—fS¦¶–æCÓÓÒvF—&V7Brbf¶W“ÓÓÖVçG'’æ–BÇF—FÆS¦VçG'’çÆ–W"æF—7Æ”æÖWÇÆvWEÆ–W$F—7Æ”æÖR†VçG'’æ–B’Ç7V'F—FÆS¦VçG'’ç&Wf–WrÆfF$‡FÖÃ§&VæFW%F‡VÖ"†VçG'’çÆ–W"Ç·6—¦S¢w‡2rÇG—S¢wÆ–W"rÆvÇ—ƒ¦VçG'’çÆ–W"æfF$vÇ—‡ÇÆ–æ—F–Ç2†VçG'’çÆ–W"æF—7Æ”æÖR—Ò’ÇVç&VC¦VçG'’çVç&VBÆ¶–æC¢vF—&V7BrÆ¶W“¦VçG'’æ–GÒ’’æ¦ö–â‚rr—ÇÆÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG·6V&6ƒò}	Ý}]=âÝRÝM]Ýâs¢}	Ý]"M==R=í­í"âwÓÂöF—cæÓÂöF—cãÆF—b6Æ73Ò&ÖW76vRÖ6öçF7BÖÆ—7B"7G–ÆSÒ&Ö&v–â×F÷£G‚#ãÆF—b6Æ73Ò'F–ç’ÖÆ&VÂ"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£‡‚#äå3ÂöF—câG¶ç4VçG&–W2æÖ†VçG'“Óç&VæFW$ÖW76vT6öçF7E&÷r‡¶7F—fS¦¶–æCÓÓÒvç2rbf¶W“ÓÓÖVçG'’æç2æ–BÇF—FÆS¦VçG'’æç2ææÖRÇ7V'F—FÆS¦VçG'’ç&Wf–WrÆfF$‡FÖÃ§&VæFW%F‡VÖ"†VçG'’æç2Ç·6—¦S¢w‡2rÇG—S¢vç2rÆvÇ—ƒ¦VçG'’æç2æfF$vÇ—‡ÇÆ–æ—F–Ç2†VçG'’æç2ææÖWÇÂtå2r—Ò’ÇVç&VC¦VçG'’çVç&VBÆ¶–æC¢vç2rÆ¶W“¦VçG'’æç2æ–GÒ’’æ¦ö–â‚rr—ÇÆÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#âG·6V&6ƒò}	Ý}]=âÝRÝM]Ýâs¢}	Ý]"Mí-=ýÝ½Rå2âwÓÂöF—cæÓÂöF—cãÂö6–FSãÇ6V7F–öâ6Æ73Ò&ÖW76vW2ÖÖ–â6&BC‚#âG¶¶–æCÓÓÒv6×–vâsöG¶6×–vä†VFW%cc"†6×–vä–B—ÓÆF—b6Æ73Ò&6†B×F‡&VBÖW76vR×F‡&VB#âG¶6×–våF‡&VBæÖ†6×–väÖW76vTÖ&·Wcc"’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	í’}"]ý="ãÂöF—câwÓÂöF—câG¶6×–vä6ö×÷6Ucc"†6×–vä–BÆfÇ6R—Ö¦7F—fTF—&V7CöG·&VæFW%Æ–W$6†D†VFW"†7F—fTF—&V7Bæ–B—ÓÆF—b6Æ73Ò&6†B×F‡&VBÖW76vR×F‡&VB#âG¶7F—fTF—&V7BçF‡&VBæÖ†ÖW76vSÓçF†—2æF—&V7DÖW76vTÖ&·W†ÖW76vR’’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	M½í2]ÝRÝ}"ãÂöF—câwÓÂöF—cãÆf÷&Ò6Æ73Ò&f÷&ÒF—&V7BÖ6†BÖf÷&Ò"FF×'FæW"Ö–CÒ"G¶W62†7F—fTF—&V7Bæ–B—Ò#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
íí]ÝSÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V6†BÖ–çWB"æÖSÒ&ÖW76vR"Æ6V†öÆFW#Ò-	Ýý-Â=í­2âââ#ãÂ÷FW‡F&VâG·G—Vöbõö‡FÖÄ†–çBÓÒwVæFVf–æVBsõõö‡FÖÄ†–çC¢rwÓÂöF—cãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í	í
-	ý
		-	
-
ÃÂö'WGFöããÂöf÷&Óæ¦7F—fTç4VçG'“öG·&VæFW$ç46†D†VFW"†7F—fTç4VçG'’æç2—ÓÆF—b6Æ73Ò&6†B×F‡&VBÖW76vR×F‡&VB#âG¶7F—fTç4VçG'’çF‡&VBæÖ†ÖW76vSÓä6†ET’æÖW76vTÖ&·W†ÖW76vRÆ7F—fTç4VçG'’æç2æ–B’’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	M½í2]ÝRÝ}"ãÂöF—câwÓÂöF—cãÆf÷&Ò6Æ73Ò&f÷&ÒÖW76vW2Öç2Ö6†BÖf÷&Ò"FFÖç2Ö–CÒ"G¶W62†7F—fTç4VçG'’æç2æ–B—Ò"FF×Æ–W"Ö–CÒ"G¶W62„æ7W'&VçEW6W$–B—Ò#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
íí]ÝRM½òG¶W62†7F—fTç4VçG'’æç2ææÖR—ÓÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V6†BÖ–çWB"æÖSÒ&ÖW76vR"Æ6V†öÆFW#Ò-	Ýý-Âå2âââ#ãÂ÷FW‡F&VâG·G—Vöbõö‡FÖÄ†–çBÓÒwVæFVf–æVBsõõö‡FÖÄ†–çC¢rwÓÂöF—cãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í	í
-	ý
		-	
-
Âå3Âö'WGFöããÂöf÷&Óæ¢sÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý]"Mí-=ýÝ½RM½í=í"ãÂöF—câwÓÂ÷6V7F–öããÂöF—cæ°¢Ó° ¢ÖW76vW5T’ç&VæFW$f÷$vÒÒgVæ7F–öâ‚’°¢6öç7B6×–vä–CÖ7W'&VçD6×–vä–Ecc"‚“²6öç7B6×–våF‡&VCÖvWD6×–vä6†EF‡&VEcc"†6×–vä–B“²6öç7B6V&6ƒÕ7G&–ær‡F†—2ævÕ6V&6‡ÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“²6öç7BÖF6†W56V&6ƒÒ‚ââç'G2“Óâ6V&6‡ÇÇ'G2æf–ÇFW"„&ööÆVâ’æ¦ö–â‚rr’çFôÆ÷vW$66R‚’æ–æ6ÇVFW2‡6V&6‚“°¢6öç7BF—&V7DVçG&–W3ÖÆ—7DF—&V7D6†D¶W—2‚’æÖ‡F‡&VD¶W“Óç¶6öç7B'G3ÖF—&V7D6†E'F–6—çG2‡F‡&VD¶W’“¶6öç7BF‡&VCÖVç7W&TF—&V7D6†E7FFR‚•·F‡&VD¶W•×ÇÅµÓ·&WGW&ç·F‡&VD¶W’Ç'G2ÇF‡&VBÇVç&VC¦vWDF—&V7EVç&VD6÷VçDf÷%f–WvW"‡F‡&VD¶W’’ÆÆ7DC¦vWEF‡&VDÆ7DB‡F‡&VB’Ç&Wf–Ws¦vWEF‡&VDÆ7E&Wf–Wr‡F‡&VB—×Ò’æf–ÇFW"†VçG'“ÓæÖF6†W56V&6‚†vWEÆ–W$F—7Æ”æÖR†VçG'’ç'G2æ’ÆvWEÆ–W$F—7Æ”æÖR†VçG'’ç'G2æ"’ÆVçG'’ç&Wf–WrÆVçG'’çF‡&VD¶W’’’ç6÷'B‚†Æ"“Óæ"æÆ7DBÖæÆ7DGÇÆ"çVç&VBÖçVç&VB“°¢6öç7Bç4VçG&–W3ÖÆ—7Dç5F‡&VDVçG&–W4f÷$vÒ‚’æÖ†VçG'“Óâ‡²ââæVçG'’ÇVç&VC¦vWDç5Vç&VD6÷VçDf÷%f–WvW"†VçG'’æç4–BÆVçG'’çÆ–W$–B’Ç&Wf–Ws¦vWEF‡&VDÆ7E&Wf–Wr†VçG'’çF‡&VB—Ò’’æf–ÇFW"†VçG'“ÓæÖF6†W56V&6‚†VçG'’æç2ææÖRÆvWEÆ–W$F—7Æ”æÖR†VçG'’çÆ–W$–B’ÆVçG'’ç&Wf–WrÆVçG'’æ¶W’’’ç6÷'B‚†Æ"“Óæ"æÆ7DBÖæÆ7DGÇÆ"çVç&VBÖçVç&VB“°¢6öç7B6×–våfÆ–CÖ6×–vä–Bbb‚6V&6‡ÇÆÖF6†W56V&6‚†6×–väVçF—G•cc"†6×–vä–B“òææÖRÂ}í’}"rÂ}­ÍýÝòrÆvWEF‡&VDÆ7E&Wf–Wr†6×–våF‡&VB’’“°¢ÆWB¶–æC×F†—2ç6VÆV7FVDvÔ¶–æBÆ¶W“Õ7G&–ær‡F†—2ç6VÆV7FVDvÔ¶W—ÇÂrr“²–b†¶–æCÓÓÒv6×–vârbf¶W“ÓÓÖ6×–vä–Bbf6×–våfÆ–B—·ÖVÇ6R–b†¶–æCÓÓÒvF—&V7BrbfF—&V7DVçG&–W2ç6öÖR†SÓæRçF‡&VD¶W“ÓÓÖ¶W’’—·ÖVÇ6R–b†¶–æCÓÓÒvç2rbfç4VçG&–W2ç6öÖR†SÓæRæ¶W“ÓÓÖ¶W’’—·ÖVÇ6R–b†6×–våfÆ–B—¶¶–æCÒv6×–vâs¶¶W“Ö6×–vä–C·ÖVÇ6R–b†ç4VçG&–W5³Ò—¶¶–æCÒvç2s¶¶W“Öç4VçG&–W5³Òæ¶W“·ÖVÇ6R–b†F—&V7DVçG&–W5³Ò—¶¶–æCÒvF—&V7Bs¶¶W“ÖF—&V7DVçG&–W5³ÒçF‡&VD¶W“·ÖVÇ6W¶¶–æCÖçVÆÃ¶¶W“Òrs·ÒF†—2ç6VÆV7FVDvÔ¶–æCÖ¶–æC·F†—2ç6VÆV7FVDvÔ¶W“Ö¶W“°¢6öç7B7F—fTF—&V7CÖ¶–æCÓÓÒvF—&V7BsöF—&V7DVçG&–W2æf–æB†SÓæRçF‡&VD¶W“ÓÓÖ¶W’“¦çVÆÃ²6öç7B7F—fTç4VçG'“Ö¶–æCÓÓÒvç2söç4VçG&–W2æf–æB†SÓæRæ¶W“ÓÓÖ¶W’“¦çVÆÃ²6öç7BÆ–W$÷F–öç3Ö&÷fVD6×–våÆ–W'5cc"†6×–vä–B’æf–ÇFW"‡Óå7G&–ær‡ç&öÆWÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒr’æÖ‡Óçæ–B“²6öç7Bç4÷F–öç3Ö6×–väç4÷F–öç5cc"‚“°¢&WGW&âÆF—b6Æ73Ò&ÖW76vW2ÖÆ–÷WBvÒ#ãÆ6–FR6Æ73Ò&ÖW76vW2×6–FR6&B#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	-RM½í=ƒÂöF—cãÆF—b6Æ73Ò&f–VÆB"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£'‚#ãÆ–çWB6Æ73Ò&–çWB"–CÒ&ÖW76vW2×6V&6‚ÖvÒ"fÇVSÒ"G¶W62‡F†—2ævÕ6V&6‡ÇÂrr—Ò"Æ6V†öÆFW#Ò-	ýí¢ýâ=í­2Âå2½‚-]­-2âââ"óãÂöF—cãÆF—b6Æ73Ò&ÖW76vRÖ6öçF7BÖÆ—7B#ãÆF—b6Æ73Ò'F–ç’ÖÆ&VÂ"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£‡‚#í	­ÍýÝóÂöF—câG¶6×–våfÆ–C÷&VæFW$ÖW76vT6öçF7E&÷r‡¶7F—fS¦¶–æCÓÓÒv6×–vârÇF—FÆS¦	í’}"+rG¶6×–väVçF—G•cc"†6×–vä–B“òææÖWÇÆ6×–vä–GÖÇ7V'F—FÆS¦vWEF‡&VDÆ7E&Wf–Wr†6×–våF‡&VB—ÇÂ}	-RíMí]ÝÝ½Rý]íÝm‚+r	M	ÂrÆfF$‡FÖÃ¢sÇ7â6Æ73Ò&VçF—G’×F‡VÖ"‡2fÆÆ&6²#ãÇ7ãäÄÃÂ÷7ããÂ÷7ãârÇVç&VC£Æ¶–æC¢v6×–vârÆ¶W“¦6×–vä–BÆvÓ§G'VWÒ“¢sÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý]"í]=â}-ãÂöF—câwÓÂöF—cãÆF—b6Æ73Ò&ÖW76vRÖ6öçF7BÖÆ—7B"7G–ÆSÒ&Ö&v–â×F÷£G‚#ãÆF—b6Æ73Ò'F–ç’ÖÆ&VÂ"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£‡‚#í	=í¢(iB	=í£ÂöF—câG¶F—&V7DVçG&–W2æÖ†VçG'“Óç¶6öç7BÖvWEÆ–W$VçF—G”f÷$6†B†VçG'’ç'G2æ’Ç#ÖvWEÆ–W$VçF—G”f÷$6†B†VçG'’ç'G2æ"“·&WGW&â&VæFW$ÖW76vT6öçF7E&÷r‡¶7F—fS¦¶–æCÓÓÒvF—&V7Brbf¶W“ÓÓÖVçG'’çF‡&VD¶W’ÇF—FÆS¦G¶vWEÆ–W$F—7Æ”æÖR†VçG'’ç'G2æ—Ò(iBG¶vWEÆ–W$F—7Æ”æÖR†VçG'’ç'G2æ"—ÖÇ7V'F—FÆS¦VçG'’ç&Wf–WrÆfF$‡FÖÃ¦Ç7â6Æ73Ò&ÖW76vRÖ6öçF7BÖGVÂ#âG·&VæFW%F‡VÖ"‡Ç·6—¦S¢w‡2rÇG—S¢wÆ–W"rÆvÇ—ƒ§æfF$vÇ—‡ÇÆ–æ—F–Ç2‡æF—7Æ”æÖR—Ò—ÒG·&VæFW%F‡VÖ"‡"Ç·6—¦S¢w‡2rÇG—S¢wÆ–W"rÆvÇ—ƒ§"æfF$vÇ—‡ÇÆ–æ—F–Ç2‡"æF—7Æ”æÖR—Ò—ÓÂ÷7ãæÇVç&VC¦VçG'’çVç&VBÆ¶–æC¢vF—&V7BrÆ¶W“¦VçG'’çF‡&VD¶W’ÆvÓ§G'VWÒ—Ò’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ýí­Ý]"½}Ý½Ríí]Ý’=í­í"ãÂöF—câwÓÂöF—cãÆF—b6Æ73Ò&ÖW76vRÖ6öçF7BÖÆ—7B"7G–ÆSÒ&Ö&v–â×F÷£G‚#ãÆF—b6Æ73Ò'F–ç’ÖÆ&VÂ"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£‡‚#äå2(iB	=í£ÂöF—câG¶ç4VçG&–W2æÖ†VçG'“Óç&VæFW$ÖW76vT6öçF7E&÷r‡¶7F—fS¦¶–æCÓÓÒvç2rbf¶W“ÓÓÖVçG'’æ¶W’ÇF—FÆS¦G¶VçG'’æç2ææÖWÒ(iBG¶vWEÆ–W$F—7Æ”æÖR†VçG'’çÆ–W$–B—ÖÇ7V'F—FÆS¦VçG'’ç&Wf–WrÆfF$‡FÖÃ§&VæFW%F‡VÖ"†VçG'’æç2Ç·6—¦S¢w‡2rÇG—S¢vç2rÆvÇ—ƒ¦VçG'’æç2æfF$vÇ—‡ÇÆ–æ—F–Ç2†VçG'’æç2ææÖWÇÂtå2r—Ò’ÇVç&VC¦VçG'’çVç&VBÆ¶–æC¢vç2rÆ¶W“¦VçG'’æ¶W’ÆvÓ§G'VWÒ’’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ýí­Ý]"å2ÝM½í=í"ãÂöF—câwÓÂöF—cãÂö6–FSãÇ6V7F–öâ6Æ73Ò&ÖW76vW2ÖÖ–â7F6²#ãÆF—b6Æ73Ò&6&BC‚#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Ýmí--ÂM½í2í"å3ÂöF—cãÆf÷&Ò6Æ73Ò&f÷&Òç2Ö6†BÖ–æ—BÖf÷&Ò#ãÆF—b6Æ73Ò&w&–C"#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃäå3ÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&ç4–B#âG¶ç4÷F–öç2æÖ†ç3ÓæÆ÷F–öâfÇVSÒ"G¶W62†ç2æ–B—Ò#âG¶W62†ç2ææÖR—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	=í£ÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ'Æ–W$–B#âG·Æ–W$÷F–öç2æÖ†–CÓæÆ÷F–öâfÇVSÒ"G¶W62†–B—Ò#âG¶W62†vWEÆ–W$F—7Æ”æÖR†–B’—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÂöF—cãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ý]-íRíí]ÝSÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V6†BÖ–çWB"æÖSÒ&ÖW76vR"Æ6V†öÆFW#Ò-
íí]ÝRí"Í]Ý‚å2âââ#ãÂ÷FW‡F&VâG·G—Vöbõö‡FÖÄ†–çBÓÒwVæFVf–æVBsõõö‡FÖÄ†–çC¢rwÓÂöF—cãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í	í
-	ý
		-	
-
Â	í
"å3Âö'WGFöããÂöf÷&ÓãÂöF—cãÆF—b6Æ73Ò&6&BC‚#âG¶¶–æCÓÓÒv6×–vâsöG¶6×–vä†VFW%cc"†6×–vä–B—ÓÆF—b6Æ73Ò&6†B×F‡&VBÖW76vR×F‡&VB#âG¶6×–våF‡&VBæÖ†6×–väÖW76vTÖ&·Wcc"’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	í’}"]ý="ãÂöF—câwÓÂöF—câG¶6×–vä6ö×÷6Ucc"†6×–vä–BÇG'VR—Ö¦7F—fTF—&V7CöG·&VæFW$GVÅÆ–W$6†D†VFW"†7F—fTF—&V7Bç'G2æÆ7F—fTF—&V7Bç'G2æ"—ÓÆF—b6Æ73Ò&6†B×F‡&VBÖW76vR×F‡&VB#âG¶7F—fTF—&V7BçF‡&VBæÖ†ÖW76vSÓçF†—2æF—&V7DÖW76vTÖ&·W†ÖW76vR’’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý]"íí]Ý’ãÂöF—câwÓÂöF—cæ¦7F—fTç4VçG'“öG·&VæFW$ç46†D†VFW"†7F—fTç4VçG'’æç2Æ7F—fTç4VçG'’çÆ–W$–B—ÓÆF—b6Æ73Ò&6†B×F‡&VBÖW76vR×F‡&VB#âG¶7F—fTç4VçG'’çF‡&VBæÖ†ÖW76vSÓä6†ET’æÖW76vTÖ&·W†ÖW76vRÆ7F—fTç4VçG'’æç4–B’’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý]"íí]Ý’ãÂöF—câwÓÂöF—cãÆf÷&Ò6Æ73Ò&f÷&ÒÖW76vW2Öç2Ö6†BÖf÷&Ò"FFÖç2Ö–CÒ"G¶W62†7F—fTç4VçG'’æç4–B—Ò"FF×Æ–W"Ö–CÒ"G¶W62†7F—fTç4VçG'’çÆ–W$–B—Ò"FF×&öÆSÒ&ç2#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	í--]"í"Í]Ý‚G¶W62†7F—fTç4VçG'’æç2ææÖR—ÓÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V6†BÖ–çWB"æÖSÒ&ÖW76vR"Æ6V†öÆFW#Ò-	í--]--Â=í­2âââ#ãÂ÷FW‡F&VâG·G—Vöbõö‡FÖÄ†–çBÓÒwVæFVf–æVBsõõö‡FÖÄ†–çC¢rwÓÂöF—cãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í	í
-	ý
		-	
-
Â	í
-	-	]
#Âö'WGFöããÂöf÷&Óæ¢sÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	-½]‚M½í2½]-Â}-í²ýíÍí-]-Â-íâãÂöF—câwÓÂöF—cãÂ÷6V7F–öããÂöF—cæ°¢Ó° ¢6öç7BõöÖW76vW4&–æEcc"ÒÖW76vW5T’æ&–æBæ&–æB„ÖW76vW5T’“°¢ÖW76vW5T’æ&–æBÒgVæ7F–öâ‡&ö÷B’°¢õöÖW76vW4&–æEcc"‡&ö÷B“°¢&ö÷BçVW'•6VÆV7F÷$ÆÂ‚ræ6×–vâÖ6†BÖf÷&Ò×cc"r’æf÷$V6‚†f÷&ÓÓç°¢–b†f÷&ÒæFF6WBæ&÷VæEcc#ÓÓÒsr—&WGW&ã¶f÷&ÒæFF6WBæ&÷VæEcc#Òss°¢f÷&ÒæFDWfVçDÆ—7FVæW"‚w7V&Ö—BrÆ7–æ2WfVçCÓç°¢WfVçBç&WfVçDFVfVÇB‚“²6öç7BfCÖæWrf÷&ÔFF†f÷&Ò“²6öç7B6×–vä–CÕ7G&–ær†f÷&ÒæFF6WBæ6×–vä–GÇÆ7W'&VçD6×–vä–Ecc"‚’“²–b‚6åW6T6×–vä6†Ecsr†6×–vä–B’—µFö7Bç6†÷r‚}	í’}"Ý]Mí-=ý]ÒrÂvW'"r“·&WGW&ã·Ò6öç7BFW‡CÕ7G&–ær†fBævWB‚vÖW76vRr—ÇÂrr’çG&–Ò‚“²–b‚FW‡B—µFö7Bç6†÷r‚}
íí]ÝRý=-íRrÂvW'"r“·&WGW&ã·Ð¢ÆWB6VæFW%G—SÒwÆ–W"s²ÆWB6VæFW$–CÔæ7W'&VçEW6W$–C²ÆWBç4–CÒrs²ÆWBWF†÷$Æ&VÃÖvWEÆ–W$F—7Æ”æÖR„æ7W'&VçEW6W$–B“°¢–b…7G&–ær„æ7W'&VçEW6W#òç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒr—¶6öç7B7F÷#Õ7G&–ær†fBævWB‚v7F÷"r—ÇÆvÓ¢G´æ7W'&VçEW6W$–GÖ“¶–b†7F÷"ç7F'G5v—F‚‚vç3¢r’—¶ç4–CÖ7F÷"ç6Æ–6RƒB“¶6öç7Bç3ÔFFævWDç2†ç4–B“¶–b‚ç2—µFö7Bç6†÷r‚tå2ÝRÝM]ÒrÂvW'"r“·&WGW&ã·×6VæFW%G—SÒvç2s·6VæFW$–CÖç4–C¶WF†÷$Æ&VÃÖç2ææÖWÇÆç4–C·×Ð¢VæD6×–vä6†DÖW76vUcc"†6×–vä–BÇ·6VæFW%G—RÇ6VæFW$–BÆç4–BÆWF†÷$Æ&VÂÇFW‡GÒ“²v—Bç6fU7FFR‡6VæFW%G—SÓÓÒvç2sö
íí]ÝRí-ý-½]Ýâí"Í]Ý‚G¶WF†÷$Æ&VÇÖ¢}
íí]ÝRí-ý-½]Ýâ"í’}"r“²F†—2ç&VæFW"‚“°¢Ò“°¢Ò“°¢Ó°§Ò’‚“° ¢ò¢cããcBÆæWBÖ÷væVB7—7FVÒÆ–æ·2²66Æ&ÆRå27F÷"6VÆV7F÷'2¢ð¢†gVæ7F–öâ‚—°¢–b‡v–æF÷råõ÷ÆæWD÷væVE7—7FVÔÆ–æ·5ccB’&WGW&ã°¢v–æF÷råõ÷ÆæWD÷væVE7—7FVÔÆ–æ·5ccBÒG'VS° ¢6öç7BVæ—ccBÒfÇVW2Óâ'&’æg&öÒ†æWr6WB‚„'&’æ—4'&’‡fÇVW2’òfÇVW2¢µÒ’æÖ‡fÇVRÓâ7G&–ær‡fÇVRÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ’’“°¢6öç7B7—7FVÔæÖUccBÒ7—7FVÒÓâ7G&–ær‡7—7FVÓòææÖRÇÂ7—7FVÓòæÖ&¶W$Æ&VÂÇÂ7—7FVÓòæ–BÇÂrr’çG&–Ò‚“° ¢gVæ7F–öâæ÷&ÖÆ—¦UÆæWD÷væVDÆ–æ·5ccB‡²Ö–w&FTÆVv7’ÒfÇ6RÒÒ·Ò’°¢6öç7B7—7FV×2Ò'&’æ—4'&’…5•5DTÕ2’ò5•5DTÕ2¢µÓ°¢6öç7BÆæWG2Òö&¦V7BçfÇVW2…ÄäUE2ÇÂ·Ò’æf–ÇFW"„&ööÆVâ“°¢6öç7B7—7FV×4'”–BÒæWrÖ‡7—7FV×2æÖ‡7—7FVÒÓâµ7G&–ær‡7—7FVÓòæ–BÇÂrr’çG&–Ò‚’Â7—7FVÕÒ’æf–ÇFW"†VçG'’ÓâVçG'•³Ò’“°¢6öç7BÆæWG4'”–BÒæWrÖ‡ÆæWG2æÖ‡ÆæWBÓâµ7G&–ær‡ÆæWCòæ–BÇÂrr’çG&–Ò‚’ÂÆæWEÒ’æf–ÇFW"†VçG'’ÓâVçG'•³Ò’“° ¢6öç7BÆVv7”6Æ–×2ÒæWrÖ‚“°¢–b†Ö–w&FTÆVv7’’°¢7—7FV×2æf÷$V6‚‡7—7FVÒÓâ°¢Væ—ccB‡7—7FVÒçÆæWD–G2’æf÷$V6‚‡ÆæWD–BÓâ°¢–b‡ÆæWG4'”–Bæ†2‡ÆæWD–B’bbÆVv7”6Æ–×2æ†2‡ÆæWD–B’’ÆVv7”6Æ–×2ç6WB‡ÆæWD–BÂ7G&–ær‡7—7FVÒæ–B’“°¢Ò“°¢Ò“°¢Ð ¢ÆæWG2æf÷$V6‚‡ÆæWBÓâ°¢6öç7B†4W‡Æ–6—E7—7FVÔ–BÒö&¦V7Bç&÷F÷G—Ræ†4÷vå&÷W'G’æ6ÆÂ‡ÆæWBÂw7—7FVÔ–Br“°¢ÆWB7—7FVÔ–BÒ7G&–ær‡ÆæWBç7—7FVÔ–BÇÂrr’çG&–Ò‚“°¢òòÆVv7’7—7FVÒçÆæWD–G2—26öç7VÇFVBöæÇ’v†VââöÆBÆæWB†2æò7—7FVÔ–Bf–VÆBBÆÂà¢òòâW‡Æ–6—BV×G’7—7FVÔ–BÖVç2F†RDÒ–çFVçF–öæÆÇ’VæÆ–æ¶VBF†RÆæWBæB×W7B7F’V×G’à¢–b‚†4W‡Æ–6—E7—7FVÔ–BbbÖ–w&FTÆVv7’’7—7FVÔ–BÒÆVv7”6Æ–×2ævWB…7G&–ær‡ÆæWBæ–B’’ÇÂrs°¢–b‚7—7FV×4'”–Bæ†2‡7—7FVÔ–B’’7—7FVÔ–BÒrs°¢ÆæWBç7—7FVÔ–BÒ7—7FVÔ–C°¢ÆæWBæÆö6F–öâÒÆæWBæÆö6F–öâbbG—VöbÆæWBæÆö6F–öâÓÓÒvö&¦V7Brò²ââçÆæWBæÆö6F–öâÒ¢·Ó°¢6öç7B7—7FVÒÒ7—7FVÔ–Bò7—7FV×4'”–BævWB‡7—7FVÔ–B’¢çVÆÃ°¢–b‡7—7FVÒ’°¢6öç7B&ÒÒ7G&–ær‡7—7FVÒæ&ÒÇÂ‡G—Vöb–æfW$vÆ‡”&Ô'•÷5c3BÓÓÒvgVæ7F–öârò–æfW$vÆ‡”&Ô'•÷5c3B‡7—7FVÒç÷2ÇÂ·Ò’¢7—7FVÒæÆö6F–öãòæ&ÒÇÂrr’’çG&–Ò‚“°¢ÆæWBæÆö6F–öâæ&ÒÒ&Ó°¢ÆæWBæÆö6F–öâç7—7FVÒÒ7—7FVÔæÖUccB‡7—7FVÒ“°¢ÆæWBæÆö6F–öâææöFRÒ7G&–ær‡7—7FVÒæÆö6F–öãòææöFRÇÂ7—7FVÒæÖ&¶W$Æ&VÂÇÂ7—7FVÒææÖRÇÂrr’çG&–Ò‚“°¢ÒVÇ6R°¢ÆæWBæÆö6F–öâæ&ÒÒrs°¢ÆæWBæÆö6F–öâç7—7FVÒÒrs°¢ÆæWBæÆö6F–öâææöFRÒrs°¢Ð¢ÆæWBæÆö6F–öâæö&¢Ò7G&–ær‡ÆæWBæÆö6F–öâæö&¢ÇÂÆæWBææÖRÇÂÆæWBæ6öFRÇÂÆæWBæ–BÇÂrr’çG&–Ò‚“°¢Ò“° ¢òò7—7FVÒçÆæWD–G2—2æ÷rFW&—fVB6ö×F–&–Æ—G’–æFW‚öæÇ’à¢7—7FV×2æf÷$V6‚‡7—7FVÒÓâ°¢7—7FVÒçÆæWD–G2ÒµÓ°¢7—7FVÒæÆö6F–öâÒ7—7FVÒæÆö6F–öâbbG—Vöb7—7FVÒæÆö6F–öâÓÓÒvö&¦V7Brò²ââç7—7FVÒæÆö6F–öâÒ¢·Ó°¢–b‡G—Vöb–æfW$vÆ‡”&Ô'•÷5c3BÓÓÒvgVæ7F–öâr’7—7FVÒæ&ÒÒ–æfW$vÆ‡”&Ô'•÷5c3B‡7—7FVÒç÷2ÇÂ·Ò“°¢7—7FVÒæÆö6F–öâæ&ÒÒ7G&–ær‡7—7FVÒæ&ÒÇÂ7—7FVÒæÆö6F–öâæ&ÒÇÂrr’çG&–Ò‚“°¢7—7FVÒæÆö6F–öâç7—7FVÒÒ7—7FVÔæÖUccB‡7—7FVÒ“°¢7—7FVÒæÆö6F–öâææöFRÒ7G&–ær‡7—7FVÒæÆö6F–öâææöFRÇÂ7—7FVÒæÖ&¶W$Æ&VÂÇÂ7—7FVÒææÖRÇÂrr’çG&–Ò‚“°¢Ò“°¢ÆæWG2æf÷$V6‚‡ÆæWBÓâ°¢6öç7B7—7FVÒÒ7—7FV×4'”–BævWB…7G&–ær‡ÆæWBç7—7FVÔ–BÇÂrr’“°¢–b‡7—7FVÒ’7—7FVÒçÆæWD–G2çW6‚…7G&–ær‡ÆæWBæ–B’“°¢Ò“°¢7—7FV×2æf÷$V6‚‡7—7FVÒÓâ°¢7—7FVÒçÆæWD–G2ÒVæ—ccB‡7—7FVÒçÆæWD–G2’ç6÷'B‚†Â"’Óâ7G&–ær‡ÆæWG4'”–BævWB†“òææÖRÇÂ’æÆö6ÆT6ö×&R…7G&–ær‡ÆæWG4'”–BævWB†"“òææÖRÇÂ"’Âw'Rr’“°¢Ò“° ¢FFç7—7FV×2Ò5•5DTÕ3°¢FFçÆæWG2ÒÄäUE3°¢Ð ¢6öç7BõöÇ•v÷&ÆDFFccBÒÇ•v÷&ÆDFF°¢Ç•v÷&ÆDFFÒgVæ7F–öâ‡–ÆöBÒ·Ò’°¢õöÇ•v÷&ÆDFFccB‡–ÆöB“°¢æ÷&ÖÆ—¦UÆæWD÷væVDÆ–æ·5ccB‡²Ö–w&FTÆVv7“¢G'VRÒ“°¢Ó° ¢6öç7Bõö'V–ÆEv÷&ÆE6æ6†÷EccBÒ'V–ÆEv÷&ÆE6æ6†÷C°¢'V–ÆEv÷&ÆE6æ6†÷BÒgVæ7F–öâ‚’°¢æ÷&ÖÆ—¦UÆæWD÷væVDÆ–æ·5ccB‡²Ö–w&FTÆVv7“¢fÇ6RÒ“°¢&WGW&âõö'V–ÆEv÷&ÆE6æ6†÷EccB‚“°¢Ó° ¢6öç7Bõ÷&VæFW%7—7FVÔVF—F÷%ccBÒ6öæf–wW&F÷"ç&VæFW%7—7FVÔVF—F÷"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW%7—7FVÔVF—F÷"ÒgVæ7F–öâ‡7—7FVÒ’°¢æ÷&ÖÆ—¦UÆæWD÷væVDÆ–æ·5ccB‡²Ö–w&FTÆVv7“¢fÇ6RÒ“°¢ÆWB‡FÖÂÒõ÷&VæFW%7—7FVÔVF—F÷%ccB‡7—7FVÒ“°¢6öç7BÆ–æ¶VBÒ‡7—7FVÒçÆæWD–G2ÇÂµÒ’æÖ†–BÓâÄäUE3òå¶–EÒ’æf–ÇFW"„&ööÆVâ“°¢6öç7B&VDöæÇ’ÒÆF—b6Æ73Ò&f–VÆBÆæWBÖÆ–æ·2×&VFöæÇ’×ccB#ãÆÆ&VÃí	ý½Ý]-²-]Í³ÂöÆ&VÃãÆF—b6Æ73Ò'Fw2#âG¶Æ–æ¶VBæÖ‡ÆæWBÓâÇ7â6Æ73Ò'Fr#âG¶W62‡ÆæWBææÖRÇÂÆæWBæ–B—ÓÂ÷7ãæ’æ¦ö–â‚rr’ÇÂsÇ7â6Æ73Ò'6ÖÆÂÖæ÷FR#í	ý½Ý]"ýí­Ý]"ãÂ÷7ãâwÓÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ý-ý}­]M­-=]-ò"­-í}­RÍí’ý½Ý]-³¢	Ý-í­Í(i"	ý½Ý]-²(i"
-]ÍãÂöF—cãÂöF—cæ°¢‡FÖÂÒ‡FÖÂç&WÆ6R‚óÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ý½Ý]-²"-]ÍSÅÂöÆ&VÃåµÇ5Å5Ò£óÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
-ý}‚-]Í(iBý½Ý]-²]M­-=í-ò-í½Í­â}M]ÅÂãÅÂöF—cãÅÂöF—câòÂ&VDöæÇ’“°¢‡FÖÂÒ‡FÖÂç&WÆ6R‚}
-]Í=ý-½ý]"-í}­í’Ý=½­-}]­í’­-R‚ÝííÂý½Ý]"-Ý=-‚â	ý½Ý]-²ý-ý}½-í-ò-í½Í­â}M]ÂÂ"]M­-íRý½Ý]-²-ý}Âýí­}½-]-ò--íÍ-}]­‚ârÂ}
-]Í=ý-½ý]"-í}­í’Ý=½­-}]­í’­-Râ	ý½Ý]-²ýÝM½]m"-]ÍR}]]rýí½R*½
-]Í+²"­-í}­R­mMí’ý½Ý]-²âr“°¢&WGW&â‡FÖÃ°¢Ó° ¢6öç7Bõ÷&VæFW%ÆæWDVF—F÷%ccBÒ6öæf–wW&F÷"ç&VæFW%ÆæWDVF—F÷"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW%ÆæWDVF—F÷"ÒgVæ7F–öâ‡ÆæWB’°¢æ÷&ÖÆ—¦UÆæWD÷væVDÆ–æ·5ccB‡²Ö–w&FTÆVv7“¢G'VRÒ“°¢ÆWB‡FÖÂÒõ÷&VæFW%ÆæWDVF—F÷%ccB‡ÆæWB“°¢6öç7B7W'&VçE7—7FVÔ–BÒ7G&–ær‡ÆæWBç7—7FVÔ–BÇÂFFævWE7—7FVÔf÷%ÆæWB‡ÆæWBæ–B“òæ–BÇÂrr’çG&–Ò‚“°¢6öç7B7—7FV×2Ò6÷'DVçF—F–W4f÷$Æ—7B„'&’æ—4'&’…5•5DTÕ2’ò5•5DTÕ2¢µÒ“°¢6öç7B6VÆV7BÒÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-]ÍÂöÆ&VÃãÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ'7—7FVÔ–B#ãÆ÷F–öâfÇVSÒ"#í	ÝRý-ý}ÝÂö÷F–öãâG·7—7FV×2æÖ‡7—7FVÒÓâÆ÷F–öâfÇVSÒ"G¶W62‡7—7FVÒæ–B—Ò"Gµ7G&–ær‡7—7FVÒæ–B’ÓÓÒ7W'&VçE7—7FVÔ–Bòw6VÆV7FVBr¢rwÓâG¶W62‡7—7FVÔæÖUccB‡7—7FVÒ’—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
Ý-â]MÝ--]ÝÝíRÍ]-âÂ=MRÝ}Ý}]-ò-]Íý½Ý]-²ãÂöF—cãÂöF—cæ°¢‡FÖÂÒ‡FÖÂç&WÆ6R‚óÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-]ÍÅÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"fÇVSÒ%µâ%Ò¢"&VFöæÇ’ÂóãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ý-ý}­Í]Ýý]-ò-í½Í­â"}M]½R*½
-]Í¼+µÂãÅÂöF—cãÅÂöF—câòÂ6VÆV7B“°¢‡FÖÂÒ‡FÖÂç&WÆ6R‚}
]M­-íý½Ý]-²â
-]Í‚=­"ýíM-ý=-í-ò--íÍ-}]­‚í"-í’-]Í²Â"­í-í=âý½Ý]--­½í}]Ý"}M]½R*½
-]Í¼+²ârÂ}
]M­-íý½Ý]-²â	}M]Â-½]-ò-]ÍÂ¢­í-íí’í-Ýí-òý½Ý]-²=­"‚½=m]Ý½Rýí½ò½í­m‚íÝí-½ýí-ò--íÍ-}]­‚âr“°¢&WGW&â‡FÖÃ°¢Ó° ¢6öç7Bõö6öÆÆV7DVçF—G•ccBÒ6öæf–wW&F÷"æ6öÆÆV7DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ6öÆÆV7DVçF—G’ÒgVæ7F–öâ‡G—RÂf÷&ÔVÂÂf÷&ÔFFÒæWrf÷&ÔFF†f÷&ÔVÂ’’°¢6öç7BVçF—G’Òõö6öÆÆV7DVçF—G•ccB‡G—RÂf÷&ÔVÂÂf÷&ÔFF“°¢–b‡G—RÓÓÒw7—7FV×2r’°¢òò6ö×F–&–Æ—G’Æ—7B—2FW&—fVBg&öÒÆæWG2æB—2æWfW"WF†÷&VB–â7—7FVÒf÷&Òà¢VçF—G’çÆæWD–G2ÒVæ—ccB‚…5•5DTÕ2æf–æB†—FVÒÓâ—FVÒæ–BÓÓÒVçF—G’æ–B“òçÆæWD–G2’ÇÂVçF—G’çÆæWD–G2ÇÂµÒ“°¢Ð¢–b‡G—RÓÓÒwÆæWG2r’°¢6öç7B7—7FVÔ–BÒ7G&–ær†f÷&ÔFFævWB‚w7—7FVÔ–Br’ÇÂrr’çG&–Ò‚“°¢6öç7B7—7FVÒÒ5•5DTÕ2æf–æB†—FVÒÓâ7G&–ær†—FVÒæ–B’ÓÓÒ7—7FVÔ–B’ÇÂçVÆÃ°¢VçF—G’ç7—7FVÔ–BÒ7—7FVÓòæ–BÇÂrs°¢VçF—G’æÆö6F–öâÒVçF—G’æÆö6F–öâbbG—VöbVçF—G’æÆö6F–öâÓÓÒvö&¦V7BròVçF—G’æÆö6F–öâ¢·Ó°¢–b‡7—7FVÒ’°¢VçF—G’æÆö6F–öâæ&ÒÒ7G&–ær‡7—7FVÒæ&ÒÇÂ‡G—Vöb–æfW$vÆ‡”&Ô'•÷5c3BÓÓÒvgVæ7F–öârò–æfW$vÆ‡”&Ô'•÷5c3B‡7—7FVÒç÷2ÇÂ·Ò’¢rr’’çG&–Ò‚“°¢VçF—G’æÆö6F–öâç7—7FVÒÒ7—7FVÔæÖUccB‡7—7FVÒ“°¢VçF—G’æÆö6F–öâææöFRÒ7G&–ær‡7—7FVÒæÆö6F–öãòææöFRÇÂ7—7FVÒæÖ&¶W$Æ&VÂÇÂ7—7FVÒææÖRÇÂrr’çG&–Ò‚“°¢ÒVÇ6R°¢VçF—G’æÆö6F–öâæ&ÒÒrs°¢VçF—G’æÆö6F–öâç7—7FVÒÒrs°¢VçF—G’æÆö6F–öâææöFRÒrs°¢Ð¢Ð¢&WGW&âVçF—G“°¢Ó° ¢6öç7Bõ÷&WÆ6TVçF—G•ccBÒ6öæf–wW&F÷"ç&WÆ6TVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&WÆ6TVçF—G’ÒgVæ7F–öâ‡G—RÂöÆD–BÂVçF—G’’°¢–b‡G—RÓÓÒwÆæWG2r’°¢6öç7BFW6—&VE7—7FVÔ–BÒ7G&–ær†VçF—G“òç7—7FVÔ–BÇÂrr’çG&–Ò‚“°¢5•5DTÕ2æf÷$V6‚‡7—7FVÒÓâ²7—7FVÒçÆæWD–G2ÒVæ—ccB‡7—7FVÒçÆæWD–G2’æf–ÇFW"†–BÓâ–BÓÒöÆD–Bbb–BÓÒVçF—G’æ–B“²Ò“°¢6öç7BF&vWBÒ5•5DTÕ2æf–æB‡7—7FVÒÓâ7G&–ær‡7—7FVÒæ–B’ÓÓÒFW6—&VE7—7FVÔ–B“°¢–b‡F&vWB’F&vWBçÆæWD–G2ÒVæ—ccB…²âââ‡F&vWBçÆæWD–G2ÇÂµÒ’ÂVçF—G’æ–EÒ“°¢Ð¢–b‡G—RÓÓÒw7—7FV×2rbböÆD–BÓÒVçF—G’æ–B’°¢ö&¦V7BçfÇVW2…ÄäUE2ÇÂ·Ò’æf÷$V6‚‡ÆæWBÓâ°¢–b…7G&–ær‡ÆæWBç7—7FVÔ–BÇÂrr’ÓÓÒ7G&–ær†öÆD–B’’ÆæWBç7—7FVÔ–BÒ7G&–ær†VçF—G’æ–BÇÂrr“°¢Ò“°¢Ð¢6öç7B&W7VÇBÒõ÷&WÆ6TVçF—G•ccB‡G—RÂöÆD–BÂVçF—G’“°¢–b‡G—RÓÓÒw7—7FV×2rÇÂG—RÓÓÒwÆæWG2r’æ÷&ÖÆ—¦UÆæWD÷væVDÆ–æ·5ccB‡²Ö–w&FTÆVv7“¢fÇ6RÒ“°¢&WGW&â&W7VÇC°¢Ó° ¢6öç7Bõö6ÆVçW&VfW&Væ6W5ccBÒ6öæf–wW&F÷"æ6ÆVçW&VfW&Væ6W2æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ6ÆVçW&VfW&Væ6W2ÒgVæ7F–öâ‡G—RÂ–B’°¢–b‡G—RÓÓÒw7—7FV×2r’°¢ö&¦V7BçfÇVW2…ÄäUE2ÇÂ·Ò’æf÷$V6‚‡ÆæWBÓâ°¢–b…7G&–ær‡ÆæWBç7—7FVÔ–BÇÂrr’ÓÓÒ7G&–ær†–B’’°¢ÆæWBç7—7FVÔ–BÒrs°¢ÆæWBæÆö6F–öâÒÆæWBæÆö6F–öâbbG—VöbÆæWBæÆö6F–öâÓÓÒvö&¦V7BròÆæWBæÆö6F–öâ¢·Ó°¢ÆæWBæÆö6F–öâæ&ÒÒrs°¢ÆæWBæÆö6F–öâç7—7FVÒÒrs°¢ÆæWBæÆö6F–öâææöFRÒrs°¢Ð¢Ò“°¢Ð¢6öç7B&W7VÇBÒõö6ÆVçW&VfW&Væ6W5ccB‡G—RÂ–B“°¢–b‡G—RÓÓÒw7—7FV×2rÇÂG—RÓÓÒwÆæWG2r’æ÷&ÖÆ—¦UÆæWD÷væVDÆ–æ·5ccB‡²Ö–w&FTÆVv7“¢fÇ6RÒ“°¢&WGW&â&W7VÇC°¢Ó° ¢6öç7Bõ÷&VÖ&VfW&Væ6W5ccBÒ6öæf–wW&F÷"ç&VÖ&VfW&Væ6W2æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VÖ&VfW&Væ6W2ÒgVæ7F–öâ‡G—RÂöÆD–BÂæWt–B’°¢–b‡G—RÓÓÒw7—7FV×2rbböÆD–BÓÒæWt–B’°¢ö&¦V7BçfÇVW2…ÄäUE2ÇÂ·Ò’æf÷$V6‚‡ÆæWBÓâ°¢–b…7G&–ær‡ÆæWBç7—7FVÔ–BÇÂrr’ÓÓÒ7G&–ær†öÆD–B’’ÆæWBç7—7FVÔ–BÒ7G&–ær†æWt–BÇÂrr“°¢Ò“°¢Ð¢6öç7B&W7VÇBÒõ÷&VÖ&VfW&Væ6W5ccB‡G—RÂöÆD–BÂæWt–B“°¢–b‡G—RÓÓÒw7—7FV×2rÇÂG—RÓÓÒwÆæWG2r’æ÷&ÖÆ—¦UÆæWD÷væVDÆ–æ·5ccB‡²Ö–w&FTÆVv7“¢fÇ6RÒ“°¢&WGW&â&W7VÇC°¢Ó° ¢òòÆöærå2Æ—7G2&V6öÖR67&öÆÆ&ÆRÆ—7F&÷†W2–ç7FVBöbf–Ww÷'B×FÆÂæF—fRG&÷ÖF÷vç2à¢gVæ7F–öâÖ¶Tç56VÆV7G567&öÆÆ&ÆUccB‡&ö÷BÒFö7VÖVçB’°¢&ö÷CòçVW'•6VÆV7F÷$ÆÃòâ‚w6VÆV7E¶æÖSÒ&7F÷"%ÒÂ6VÆV7E¶æÖSÒ&ç4–B%Òr’æf÷$V6‚‡6VÆV7BÓâ°¢–b‡6VÆV7BæFF6WBç67&öÆÆ&ÆTç5ccBÓÓÒsr’&WGW&ã°¢6öç7Bç46÷VçBÒ'&’æg&öÒ‡6VÆV7Bæ÷F–öç2ÇÂµÒ’æf–ÇFW"†÷F–öâÓâ7G&–ær†÷F–öâçfÇVRÇÂrr’ç7F'G5v—F‚‚vç3¢r’ÇÂ6VÆV7BææÖRÓÓÒvç4–Br’æÆVæwFƒ°¢–b†ç46÷VçBÃÒb’&WGW&ã°¢6VÆV7BæFF6WBç67&öÆÆ&ÆTç5ccBÒss°¢6VÆV7Bæ6Æ74Æ—7BæFB‚vç2×67&öÆÂ×6VÆV7B×ccBr“°¢6VÆV7Bç6—¦RÒÖF‚æÖ–âƒ‚ÂÖF‚æÖ‚ƒbÂç46÷VçB²‡6VÆV7BææÖRÓÓÒv7F÷"rò¢’’“°¢6VÆV7BçF—FÆRÒ}
ýí¢ýí­=}-]-ò­í½­íÂÍ½‚½‚ýí½íí’ýí­=-­‚s°¢Ò“°¢Ð¢v–æF÷ræÖ¶Tç56VÆV7G567&öÆÆ&ÆUccBÒÖ¶Tç56VÆV7G567&öÆÆ&ÆUccC° ¢6öç7BõöÖW76vW5&VæFW%ccBÒÖW76vW5T’ç&VæFW"æ&–æB„ÖW76vW5T’“°¢ÖW76vW5T’ç&VæFW"ÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒõöÖW76vW5&VæFW%ccB‚“°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’ÓâÖ¶Tç56VÆV7G567&öÆÆ&ÆUccB†Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÖW76vW2Ö6öçFVçBr’ÇÂFö7VÖVçB’“°¢&WGW&â&W7VÇC°¢Ó° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚tDôÔ6öçFVçDÆöFVBrÂ‚’Óâ°¢G'’²æ÷&ÖÆ—¦UÆæWD÷væVDÆ–æ·5ccB‡²Ö–w&FTÆVv7“¢G'VRÒ“²Ò6F6‚·Ð¢Ò“°§Ò’‚“° ¢ò¢cããcr–çfVçF÷'’w&–BÂ6''––ærÆ–Ö—G2æBWV—ÖVçB6Æ÷G2¢ð¢‚‚’Óâ°¢–b‡v–æF÷råõö–çfVçF÷'”w&–Eccr’&WGW&ã°¢v–æF÷råõö–çfVçF÷'”w&–EccrÒG'VS° ¢6öç7BDTdTÅEô”ådTåDõ%•õ4•¤UõccrÒ#°¢6öç7BDTdTÅEô4%%•õtT”t…EõccrÒ#° ¢gVæ7F–öâ–çDæöäæVvF—fUccr‡fÇVRÂfÆÆ&6²Ò’°¢6öç7BâÒçVÖ&W"‡fÇVR“°¢&WGW&âçVÖ&W"æ—4f–æ—FR†â’òÖF‚æÖ‚ƒÂÖF‚æfÆö÷"†â’’¢fÆÆ&6³°¢Ð¢gVæ7F–öâçVÔæöäæVvF—fUccr‡fÇVRÂfÆÆ&6²Ò’°¢6öç7BâÒçVÖ&W"‡fÇVR“°¢&WGW&âçVÖ&W"æ—4f–æ—FR†â’òÖF‚æÖ‚ƒÂâ’¢fÆÆ&6³°¢Ð¢gVæ7F–öâ—FVÕ6—¦Uccr†—FVÒÒ·Ò’°¢&WGW&â°¢s¢ÖF‚æÖ‚ƒÂ–çDæöäæVvF—fUccr†—FVÒæ–çfVçF÷'•v–GF‚óò—FVÒç6—¦Uv–GF‚óò—FVÒçv–GF„6VÆÇ2óòÂ’’À¢ƒ¢ÖF‚æÖ‚ƒÂ–çDæöäæVvF—fUccr†—FVÒæ–çfVçF÷'”†V–v‡Bóò—FVÒç6—¦T†V–v‡Bóò—FVÒæ†V–v‡D6VÆÇ2óòÂ’¢Ó°¢Ð¢gVæ7F–öâ—FVÔÖ75ccr†—FVÒÒ·Ò’°¢&WGW&âçVÔæöäæVvF—fUccr†—FVÒæÖ72óò—FVÒçvV–v‡BóòÂ“°¢Ð¢gVæ7F–öâ–çfVçF÷'”6öÇVÖç5ccr‡6—¦R’°¢òòcãã3¢–çfVçF÷'’v–GF‚—2Çv—2f—fR6VÆÇ3²66—G’W‡æG2F÷vçv&B'’&÷w2à¢&WGW&âS°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦U÷6—F–öåccr‡÷2’°¢–b‚÷2ÇÂG—Vöb÷2ÓÒvö&¦V7Br’&WGW&âçVÆÃ°¢6öç7B‚ÒçVÖ&W"‡÷2ç‚’Â’ÒçVÖ&W"‡÷2ç’“°¢–b‚çVÖ&W"æ—4–çFVvW"‡‚’ÇÂçVÖ&W"æ—4–çFVvW"‡’’ÇÂ‚ÂÇÂ’Â’&WGW&âçVÆÃ°¢&WGW&â²‚Â’Ó°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦T–çfVçF÷'”VçG'•ccr†VçG'’Ò·Ò’°¢6öç7BG’Ò–çDæöäæVvF—fUccr†VçG'’çG’Â“°¢6öç7B÷6—F–öç2Ò'&’æ—4'&’†VçG'’ç÷6—F–öç2’òVçG'’ç÷6—F–öç2ç6Æ–6RƒÂG’’æÖ†æ÷&ÖÆ—¦U÷6—F–öåccr’¢µÓ°¢&WGW&â²ââæVçG'’Â—FVÔ–C¢7G&–ær†VçG'’æ—FVÔ–BÇÂrr’çG&–Ò‚’ÂG’Â÷6—F–öç2Ó°¢Ð ¢6öç7Bõöæ÷&ÖÆ—¦TWV—ÖVçD—FVÕccrÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc#°¢æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"ÒgVæ7F–öâ†—FVÒÒ·Ò’°¢6öç7B&rÒ²âââ†—FVÒÇÂ·Ò’Ó°¢6öç7BæW‡BÒõöæ÷&ÖÆ—¦TWV—ÖVçD—FVÕccr‡&r“°¢æW‡Bæ7&VF–öä6÷7BÒ6Æ×„ÖF‚æÖ‚ƒÂçVÖ&W"‡&ræ7&VF–öä6÷7BóòæW‡Bæ7&VF–öä6÷7Bóò’’ÂÂ“°¢æW‡Bæf–Æ&ÆT57F'F–ærÒ&ræf–Æ&ÆT57F'F–ærÓÓÒG'VRÇÂ7G&–ær‡&ræf–Æ&ÆT57F'F–æróòæW‡Bæf–Æ&ÆT57F'F–æróòrr’çFôÆ÷vW$66R‚’ÓÓÒwG'VRs°¢æW‡BæÖ72Ò—FVÔÖ75ccr‡&r“°¢6öç7B6—¦RÒ—FVÕ6—¦Uccr‡&r“°¢æW‡Bæ–çfVçF÷'•v–GF‚Ò6—¦Rçs°¢æW‡Bæ–çfVçF÷'”†V–v‡BÒ6—¦Ræƒ°¢&WGW&âæW‡C°¢Ó° ¢6öç7Bõö—FVÔW‡G&7VÖÖ'•ccrÒ—FVÔW‡G&7VÖÖ'•c#°¢—FVÔW‡G&7VÖÖ'•c"ÒgVæ7F–öâ†—FVÒÒ·Ò’°¢6öç7Bæ÷&ÒÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ“°¢6öç7B6—¦RÒ—FVÕ6—¦Uccr†æ÷&Ò“°¢6öç7B&6RÒõö—FVÔW‡G&7VÖÖ'•ccr†æ÷&Ò“°¢&WGW&âG¶&6WÒ+rG¶—FVÔÖ75ccr†æ÷&Ò—Ò-]+rG·6—¦RçwÜ9rG·6—¦Ræ‡Ö°¢Ó° ¢6öç7Bõöæ÷&ÖÆ—¦UÆ–W%&öf–ÆUccrÒæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc#°¢æ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"ÒgVæ7F–öâ‡W6W"Ò·Ò’°¢6öç7B6÷W&6RÒ²âââ‡W6W"ÇÂ·Ò’Ó°¢6öç7BæW‡BÒõöæ÷&ÖÆ—¦UÆ–W%&öf–ÆUccr‡6÷W&6R“°¢æW‡Bæ–çfVçF÷'•6—¦RÒ–çDæöäæVvF—fUccr‡6÷W&6Ræ–çfVçF÷'•6—¦RóòæW‡Bæ–çfVçF÷'•6—¦RÂDTdTÅEô”ådTåDõ%•õ4•¤Uõccr“°¢æW‡Bæ6''•vV–v‡DÖ‚ÒçVÔæöäæVvF—fUccr‡6÷W&6Ræ6''•vV–v‡DÖ‚óò6÷W&6RæÖ„6''•vV–v‡BóòæW‡Bæ6''•vV–v‡DÖ‚ÂDTdTÅEô4%%•õtT”t…Eõccr“°¢æW‡Bæ–çfVçF÷'’Ò„'&’æ—4'&’‡6÷W&6Ræ–çfVçF÷'’’ò6÷W&6Ræ–çfVçF÷'’¢†æW‡Bæ–çfVçF÷'’ÇÂµÒ’’æÖ†æ÷&ÖÆ—¦T–çfVçF÷'”VçG'•ccr’æf–ÇFW"†VçG'’ÓâVçG'’æ—FVÔ–BbbVçG'’çG’â“°¢6öç7BÆVv7”–×ÆçG2Ò'&’æ—4'&’‡6÷W&6Ræ–×ÆçE6Æ÷G2’ò6÷W&6Ræ–×ÆçE6Æ÷G2¢„'&’æ—4'&’‡6÷W&6Ræ–ç7FÆÆVD–×ÆçD–G2’ò6÷W&6Ræ–ç7FÆÆVD–×ÆçD–G2¢†æW‡Bæ–ç7FÆÆVD–×ÆçD–G2ÇÂµÒ’“°¢6öç7BW‡Æ–6—D6÷VçBÒ6÷W&6Ræ–×ÆçE6Æ÷D6÷VçBóòæW‡Bæ–×ÆçE6Æ÷D6÷VçC°¢æW‡Bæ–×ÆçE6Æ÷D6÷VçBÒW‡Æ–6—D6÷VçBÓÒçVÆÂòÆVv7”–×ÆçG2æf–ÇFW"„&ööÆVâ’æÆVæwF‚¢–çDæöäæVvF—fUccr†W‡Æ–6—D6÷VçBÂ“°¢æW‡Bæ–×ÆçE6Æ÷G2Ò'&’æg&öÒ‡²ÆVæwFƒ¢æW‡Bæ–×ÆçE6Æ÷D6÷VçBÒÂ…òÂ–æFW‚’Óâ7G&–ær†ÆVv7”–×ÆçG5¶–æFW…ÒÇÂrr’çG&–Ò‚’“°¢æW‡Bæ–ç7FÆÆVD–×ÆçD–G2ÒæW‡Bæ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ“°¢&WGW&âæW‡C°¢Ó° ¢gVæ7F–öâ—FVÔf÷$–çfVçF÷'•ccr†—FVÔ–B’°¢&WGW&âæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"„UT•ÔTåCòå¶—FVÔ–EÒÇÂFFævWD—FVÓòâ†—FVÔ–B’ÇÂ²–C¢—FVÔ–BÂæÖS¢—FVÔ–BÂG—S¢vvV"rÒ“°¢Ð¢gVæ7F–öâWV—VD—FVÔ6÷VçG5ccr‡W6W"Ò·Ò’°¢6öç7B6÷VçG2ÒæWrÖ‚“°¢6öç7BFBÒ–BÓâ²6öç7B¶W’Ò7G&–ær†–BÇÂrr“²–b†¶W’’6÷VçG2ç6WB†¶W’Â†6÷VçG2ævWB†¶W’’ÇÂ’²“²Ó°¢FB‡W6W"æWV—ÖVçE6Æ÷G3òç&–Ö'•vVöâ“°¢FB‡W6W"æWV—ÖVçE6Æ÷G3òç6V6öæF'•vVöâ“°¢FB‡W6W"æWV—ÖVçE6Æ÷G3òæ&Ö÷"“°¢FB‡W6W"æWV—ÖVçE6Æ÷G3òæ&6·6²“°¢‡W6W"æ–×ÆçE6Æ÷G2ÇÂµÒ’æf÷$V6‚†FB“°¢&WGW&â6÷VçG3°¢Ð¢gVæ7F–öâ–çfVçF÷'•vV–v‡Eccr‡W6W"Ò·Ò’°¢&WGW&â‡W6W"æ–çfVçF÷'’ÇÂµÒ’ç&VGV6R‚‡7VÒÂVçG'’’Óâ7VÒ²—FVÔÖ75ccr†—FVÔf÷$–çfVçF÷'•ccr†VçG'’æ—FVÔ–B’’¢–çDæöäæVvF—fUccr†VçG'’çG’Â’Â“°¢Ð¢gVæ7F–öâf—G4–çfVçF÷'”Eccr‡6—¦RÂ6öÇ2Âö67W–VBÂ‚Â’ÂrÂ‚’°¢–b‡‚ÂÇÂ’ÂÇÂ‚²râ6öÇ2’&WGW&âfÇ6S°¢f÷"†ÆWB—’Ò“²—’Â’²ƒ²—’³Ò’°¢f÷"†ÆWB‡‚Òƒ²‡‚Â‚²s²‡‚³Ò’°¢6öç7B6VÆÄ–æFW‚Ò—’¢6öÇ2²‡ƒ°¢–b†6VÆÄ–æFW‚ÂÇÂ6VÆÄ–æFW‚ãÒ6—¦RÇÂö67W–VBæ†2†G·‡‡Ó¢G·——Ö’’&WGW&âfÇ6S°¢Ð¢Ð¢&WGW&âG'VS°¢Ð¢gVæ7F–öâÖ&´ö67W–VEccr†ö67W–VBÂ‚Â’ÂrÂ‚ÂfÇVRÒG'VR’°¢f÷"†ÆWB—’Ò“²—’Â’²ƒ²—’³Ò’f÷"†ÆWB‡‚Òƒ²‡‚Â‚²s²‡‚³Ò’°¢6öç7B¶W’ÒG·‡‡Ó¢G·——Ö°¢–b‡fÇVR’ö67W–VBæFB†¶W’“²VÇ6Rö67W–VBæFVÆWFR†¶W’“°¢Ð¢Ð¢gVæ7F–öâf—'7Df—D–çfVçF÷'•ccr‡6—¦RÂ6öÇ2Âö67W–VBÂrÂ‚’°¢6öç7B&÷w2ÒÖF‚æ6V–Â„ÖF‚æÖ‚ƒÂ6—¦R’ò6öÇ2“°¢f÷"†ÆWB’Ò²’Â&÷w3²’³Ò’f÷"†ÆWB‚Ò²‚Â6öÇ3²‚³Ò’°¢–b†f—G4–çfVçF÷'”Eccr‡6—¦RÂ6öÇ2Âö67W–VBÂ‚Â’ÂrÂ‚’’&WGW&â²‚Â’Ó°¢Ð¢&WGW&âçVÆÃ°¢Ð¢gVæ7F–öâ'V–ÆD–çfVçF÷'”Æ–÷WEccr‡&uW6W"Ò·Ò’°¢6öç7BW6W"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡&uW6W"“°¢6öç7B6—¦RÒW6W"æ–çfVçF÷'•6—¦S°¢6öç7B6öÇ2ÒS°¢6öç7BWV—VBÒWV—VD—FVÔ6÷VçG5ccr‡W6W"“°¢6öç7Bö67W–VBÒæWr6WB‚“°¢6öç7B–ç7Fæ6W2ÒµÓ°¢6öç7B÷fW&fÆ÷rÒµÓ°¢6öç7BFW‡BÒµÓ°¢f÷"†6öç7BVçG'’öbW6W"æ–çfVçF÷'’ÇÂµÒ’°¢6öç7B—FVÒÒ—FVÔf÷$–çfVçF÷'•ccr†VçG'’æ—FVÔ–B“°¢6öç7BG’Ò–çDæöäæVvF—fUccr†VçG'’çG’Â“°¢6öç7B6¶—ÒÖF‚æÖ–â‡G’ÂWV—VBævWB†VçG'’æ—FVÔ–B’ÇÂ“°¢6öç7B&VÖ–æ–ærÒÖF‚æÖ‚ƒÂG’Ò6¶—“°¢–b‚&VÖ–æ–ær’6öçF–çVS°¢–b†—FVÒçFW‡DöæÇ”–çfVçF÷'’ÓÓÒG'VRÇÂ„çVÖ&W"†—FVÒæÖ72ÇÂ’ÓÓÒbbçVÖ&W"†—FVÒæ–çfVçF÷'•v–GF‚ÇÂ’ÓÓÒbbçVÖ&W"†—FVÒæ–çfVçF÷'”†V–v‡BÇÂ’ÓÓÒ’’°¢FW‡BçW6‚‡²—FVÔ–C¦VçG'’æ—FVÔ–BÂ—FVÒÂVçG'’ÂG“§&VÖ–æ–ærÒ“°¢6öçF–çVS°¢Ð¢6öç7Bfö÷G&–çBÒ—FVÕ6—¦Uccr†—FVÒ“°¢6öç7B7F6´Æ–Ö—BÒ—FVÒç7F6¶&ÆRÓÓÒG'VRòÖF‚æÖ‚ƒ"Â–çDæöäæVvF—fUccr†—FVÒç7F6´Æ–Ö—BÂ“’’’¢°¢6öç7B–ç7Fæ6T6÷VçBÒ—FVÒç7F6¶&ÆRÓÓÒG'VRòÖF‚æ6V–Â‡&VÖ–æ–ærò7F6´Æ–Ö—B’¢&VÖ–æ–æs°¢f÷"†ÆWB7F6´–æFW‚Ò²7F6´–æFW‚Â–ç7Fæ6T6÷VçC²7F6´–æFW‚³Ò’°¢6öç7BVæ—D–æFW‚Ò—FVÒç7F6¶&ÆRÓÓÒG'VRò6¶—²7F6´–æFW‚¢7F6´Æ–Ö—B¢6¶—²7F6´–æFWƒ°¢6öç7B¶W’ÒG¶VçG'’æ—FVÔ–GÓ£¢G·Væ—D–æFW‡Ö°¢ÆWB÷2Òæ÷&ÖÆ—¦U÷6—F–öåccr†VçG'’ç÷6—F–öç3òå·Væ—D–æFW…ÒóòVçG'’ç÷6—F–öç3òå·7F6´–æFW…Ò“°¢–b‚÷2ÇÂf—G4–çfVçF÷'”Eccr‡6—¦RÂ6öÇ2Âö67W–VBÂ÷2ç‚Â÷2ç’Âfö÷G&–çBçrÂfö÷G&–çBæ‚’’°¢÷2Òf—'7Df—D–çfVçF÷'•ccr‡6—¦RÂ6öÇ2Âö67W–VBÂfö÷G&–çBçrÂfö÷G&–çBæ‚“°¢Ð¢6öç7B7F6µG’Ò—FVÒç7F6¶&ÆRÓÓÒG'VRòÖF‚æÖ–â‡7F6´Æ–Ö—BÂ&VÖ–æ–ærÒ7F6´–æFW‚¢7F6´Æ–Ö—B’¢°¢6öç7B–ç7Fæ6RÒ²¶W’Â—FVÔ–C¢VçG'’æ—FVÔ–BÂVæ—D–æFW‚ÂG“§7F6µG’Â—FVÒÂââæfö÷G&–çBÂ÷2Ó°¢–b‡÷2’²Ö&´ö67W–VEccr†ö67W–VBÂ÷2ç‚Â÷2ç’Âfö÷G&–çBçrÂfö÷G&–çBæ‚“²–ç7Fæ6W2çW6‚†–ç7Fæ6R“²Ð¢VÇ6R÷fW&fÆ÷rçW6‚†–ç7Fæ6R“°¢Ð¢Ð¢&WGW&â²W6W"Â6—¦RÂ6öÇ2Â&÷w3¢ÖF‚æ6V–Â„ÖF‚æÖ‚ƒÂ6—¦R’ò6öÇ2’Â–ç7Fæ6W2Â÷fW&fÆ÷rÂFW‡BÂö67W–VBÂvV–v‡C¢–çfVçF÷'•vV–v‡Eccr‡W6W"’Ó°¢Ð¢gVæ7F–öâ6WD–çfVçF÷'•÷6—F–öåccr‡W6W"Â—FVÔ–BÂVæ—D–æFW‚Â÷2’°¢6öç7BVçG'’Ò‡W6W"æ–çfVçF÷'’ÇÂµÒ’æf–æB‡&÷rÓâ&÷ræ—FVÔ–BÓÓÒ—FVÔ–B“°¢–b‚VçG'’’&WGW&âfÇ6S°¢VçG'’ç÷6—F–öç2Ò'&’æ—4'&’†VçG'’ç÷6—F–öç2’òVçG'’ç÷6—F–öç2¢µÓ°¢v†–ÆR†VçG'’ç÷6—F–öç2æÆVæwF‚ÂVçG'’çG’’VçG'’ç÷6—F–öç2çW6‚†çVÆÂ“°¢VçG'’ç÷6—F–öç5·Væ—D–æFW…ÒÒ÷2ò²ƒ¢–çDæöäæVvF—fUccr‡÷2ç‚’Â“¢–çDæöäæVvF—fUccr‡÷2ç’’Ò¢çVÆÃ°¢&WGW&âG'VS°¢Ð¢gVæ7F–öâ6åÆ6T–çfVçF÷'•Væ—Eccr‡W6W"Â—FVÔ–BÂVæ—D–æFW‚Â‚Â’’°¢6öç7BÆ–÷WBÒ'V–ÆD–çfVçF÷'”Æ–÷WEccr‡W6W"“°¢6öç7B—FVÒÒ—FVÔf÷$–çfVçF÷'•ccr†—FVÔ–B“°¢òòFW‡BÖöæÇ’ò¦W&ò×6—¦RVçG&–W2&VÆöærFòF†RFö7VÖVçB6V7F–öâæBæWfW"6öç7VÖR6VÆÂà¢–b†—FVÒçFW‡DöæÇ”–çfVçF÷'’ÓÓÒG'VRÇÂ„çVÖ&W"†—FVÒæÖ72ÇÂ’ÓÓÒbbçVÖ&W"†—FVÒæ–çfVçF÷'•v–GF‚ÇÂ’ÓÓÒbbçVÖ&W"†—FVÒæ–çfVçF÷'”†V–v‡BÇÂ’ÓÓÒ’’&WGW&âG'VS°¢6öç7BÖ÷f–æt¶W’ÒG¶—FVÔ–GÓ£¢G·Væ—D–æFW‡Ö°¢6öç7Bö67W–VBÒæWr6WB‚“°¢Æ–÷WBæ–ç7Fæ6W2æf–ÇFW"†–ç7Fæ6RÓâ–ç7Fæ6Ræ¶W’ÓÒÖ÷f–æt¶W’bb–ç7Fæ6Rç÷2’æf÷$V6‚†–ç7Fæ6RÓâÖ&´ö67W–VEccr†ö67W–VBÂ–ç7Fæ6Rç÷2ç‚Â–ç7Fæ6Rç÷2ç’Â–ç7Fæ6RçrÂ–ç7Fæ6Ræ‚’“°¢6öç7Bfö÷G&–çBÒ—FVÕ6—¦Uccr†—FVÒ“°¢&WGW&âf—G4–çfVçF÷'”Eccr†Æ–÷WBç6—¦RÂÆ–÷WBæ6öÇ2Âö67W–VBÂ‚Â’Âfö÷G&–çBçrÂfö÷G&–çBæ‚“°¢Ð¢gVæ7F–öâ6Æ÷D66WG4—FVÕccr‡6Æ÷EG—RÂ—FVÒ’°¢6öç7BG—RÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ’çG—S°¢–b‡6Æ÷EG—RÓÓÒv&Ö÷"r’&WGW&âG—RÓÓÒv&Ö÷"s°¢–b‡6Æ÷EG—RÓÓÒv&6·6²r’&WGW&âG—RÓÓÒv&6·6²s°¢–b‡6Æ÷EG—RÓÓÒv–×ÆçBr’&WGW&âG—RÓÓÒv–×ÆçBs°¢–b‡6Æ÷EG—RÓÓÒw&–Ö'•vVöâr’&WGW&âG—RÓÓÒw6†–VÆBrÇÂG—RÓÓÒwvVöârbb²w&–Ö'’rÂwfW'6F–ÆRrÂruÒæ–æ6ÇVFW2…7G&–ær†—FVÒçvVöå6Æ÷BÇÂw&–Ö'’r’“°¢–b‡6Æ÷EG—RÓÓÒw6V6öæF'•vVöâr’&WGW&âG—RÓÓÒwvVöârbb²w6V6öæF'’rÂwfW'6F–ÆRrÂruÒæ–æ6ÇVFW2…7G&–ær†—FVÒçvVöå6Æ÷BÇÂw6V6öæF'’r’“°¢&WGW&âfÇ6S°¢Ð¢gVæ7F–öâvWE6Æ÷D—FVÕccr‡W6W"Â6Æ÷EG—RÂ6Æ÷D–æFW‚ÒÓ’°¢–b‡6Æ÷EG—RÓÓÒv–×ÆçBr’&WGW&â7G&–ær‡W6W"æ–×ÆçE6Æ÷G3òå·6Æ÷D–æFW…ÒÇÂrr“°¢&WGW&â7G&–ær‡W6W"æWV—ÖVçE6Æ÷G3òå·6Æ÷EG—UÒÇÂrr“°¢Ð¢gVæ7F–öâ6WE6Æ÷D—FVÕccr‡W6W"Â6Æ÷EG—RÂ6Æ÷D–æFW‚Â—FVÔ–B’°¢–b‡6Æ÷EG—RÓÓÒv–×ÆçBr’°¢W6W"æ–×ÆçE6Æ÷G2Ò'&’æg&öÒ‡²ÆVæwFƒ¢W6W"æ–×ÆçE6Æ÷D6÷VçBÒÂ…òÂ–æFW‚’Óâ7G&–ær‡W6W"æ–×ÆçE6Æ÷G3òå¶–æFW…ÒÇÂrr’“°¢–b‡6Æ÷D–æFW‚ÂÇÂ6Æ÷D–æFW‚ãÒW6W"æ–×ÆçE6Æ÷D6÷VçB’&WGW&âfÇ6S°¢W6W"æ–×ÆçE6Æ÷G5·6Æ÷D–æFW…ÒÒ7G&–ær†—FVÔ–BÇÂrr“°¢W6W"æ–ç7FÆÆVD–×ÆçD–G2ÒW6W"æ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ“°¢&WGW&âG'VS°¢Ð¢W6W"æWV—ÖVçE6Æ÷G2Ò²&–Ö'•vVöã¢rrÂ6V6öæF'•vVöã¢rrÂ&Ö÷#¢rrÂ&6·6³¢rrÂâââ‡W6W"æWV—ÖVçE6Æ÷G2ÇÂ·Ò’Ó°¢W6W"æWV—ÖVçE6Æ÷G5·6Æ÷EG—UÒÒ7G&–ær†—FVÔ–BÇÂrr“°¢&WGW&âG'VS°¢Ð¢gVæ7F–öâWV—VD6÷VçDf÷$—FVÕccr‡W6W"Â—FVÔ–B’°¢&WGW&âWV—VD—FVÔ6÷VçG5ccr‡W6W"’ævWB…7G&–ær†—FVÔ–BÇÂrr’’ÇÂ°¢Ð¢gVæ7F–öâ—FVÔ÷væVEG•ccr‡W6W"Â—FVÔ–B’°¢&WGW&â–çDæöäæVvF—fUccr‚‡W6W"æ–çfVçF÷'’ÇÂµÒ’æf–æB†VçG'’ÓâVçG'’æ—FVÔ–BÓÓÒ—FVÔ–B“òçG’Â“°¢Ð¢gVæ7F–öâ6äFD–çfVçF÷'”—FVÕccr‡W6W"Â—FVÔ–BÂG’Ò’°¢6öç7B7W'&VçBÒæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡W6W"“°¢6öç7B—FVÒÒ—FVÔf÷$–çfVçF÷'•ccr†—FVÔ–B“°¢6öç7BæW‡EvV–v‡BÒ–çfVçF÷'•vV–v‡Eccr†7W'&VçB’²—FVÔÖ75ccr†—FVÒ’¢ÖF‚æÖ‚ƒÂ–çDæöäæVvF—fUccr‡G’Â’“°¢–b†æW‡EvV–v‡Bâ7W'&VçBæ6''•vV–v‡DÖ‚²RÓ’’&WGW&â²ö³¢fÇ6RÂ&V6öã¢	ý]-½]Òý]]ÝíÍ½’-]¢G¶æW‡EvV–v‡BçFôf—†VBƒ—ÒòG¶7W'&VçBæ6''•vV–v‡DÖ‡ÖÓ°¢6öç7B6ÆöæRÒFVW†7W'&VçB“°¢ÆWBVçG'’Ò6ÆöæRæ–çfVçF÷'’æf–æB‡&÷rÓâ&÷ræ—FVÔ–BÓÓÒ—FVÔ–B“°¢–b‚VçG'’’²VçG'’Ò²—FVÔ–BÂG“¢Â÷6—F–öç3¢µÒÓ²6ÆöæRæ–çfVçF÷'’çW6‚†VçG'’“²Ð¢VçG'’çG’³ÒÖF‚æÖ‚ƒÂ–çDæöäæVvF—fUccr‡G’Â’“°¢6öç7BÆ–÷WBÒ'V–ÆD–çfVçF÷'”Æ–÷WEccr†6ÆöæR“°¢–b†Æ–÷WBæ÷fW&fÆ÷ræÆVæwF‚’&WGW&â²ö³¢fÇ6RÂ&V6öã¢}	"Ý-]Ý-RÝ]Mí--í}Ýâ-ííMÝí=âÍ]-M½òý]MÍ]-ârÓ°¢&WGW&â²ö³¢G'VRÓ°¢Ð¢v–æF÷räu%t–çfVçF÷'•ccrÒ²6äFD—FVÓ¢6äFD–çfVçF÷'”—FVÕccrÂ'V–ÆDÆ–÷WC¢'V–ÆD–çfVçF÷'”Æ–÷WEccrÂvV–v‡C¢–çfVçF÷'•vV–v‡EccrÓ° ¢òòf—‚F†Rcããcbt2WV—ÖVçBVF—F÷"÷fW'&–FS¢F†RÆFW"VF—F÷"†B†–FFVâF†RæWr7&VF–öâf–VÆG2à¢6öç7Bõ÷&VæFW$WV—ÖVçDVF—F÷%ccrÒ6öæf–wW&F÷"ç&VæFW$WV—ÖVçDVF—F÷"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW$WV—ÖVçDVF—F÷"ÒgVæ7F–öâ‡&t—FVÒ’°¢6öç7B—FVÒÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"‡&t—FVÒ“°¢ÆWB‡FÖÂÒõ÷&VæFW$WV—ÖVçDVF—F÷%ccr†—FVÒ“°¢6öç7Bæ6†÷"ÒÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	Ý}-ÝSÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"æÖSÒ&æÖR"fÇVSÒ"G¶W62†—FVÒææÖRÇÂrr—Ò"óãÂöF—cæ°¢6öç7Bf–VÆG2ÒG¶æ6†÷'Ð¢ÆF—b6Æ73Ò&6öÇ3"7&VF–öâÖV6öæö×’Ö—FVÒ×ccr#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
-íÍí-Âí}MÝóÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"ÖƒÒ#"7FWÒ#"æÖSÒ&7&VF–öä6÷7B"fÇVSÒ"G´çVÖ&W"†—FVÒæ7&VF–öä6÷7BÇÂ—Ò"óãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
-íÍí-Âý]MÍ]-"íMm]-R]=-m‚rí}­í"ãÂöF—cãÂöF—cãÆÆ&VÂ6Æ73Ò&6öç6VçBÖÆ–æR7F'F–ærÖWV—ÖVçB×FövvÆR×ccb#ãÆ–çWBG—SÒ&6†V6¶&÷‚"æÖSÒ&f–Æ&ÆT57F'F–ær"G¶—FVÒæf–Æ&ÆT57F'F–æròv6†V6¶VBr¢rwÒóãÇ7ããÆ#í	Mí-=ý]Ò­¢--í-íSÂö#ãÇ6ÖÆÃí	ýí­}½--Âý‚]=-m‚Â]½‚ý]MÍ]"Mí-=ý]Ò­ÍýÝ‚½‚]Ýýí]RãÂ÷6ÖÆÃãÂ÷7ããÂöÆ&VÃãÂöF—cà¢ÆF—b6Æ73Ò&6öÇ32–çfVçF÷'’Ö—FVÒ×‡—6–72×ccr#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ÍÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#ã"æÖSÒ&Ö72"fÇVSÒ"G´çVÖ&W"†—FVÒæÖ72óò—Ò"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
}Í]ýâÝSÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ&–çfVçF÷'•v–GF‚"fÇVSÒ"G¶—FVÒæ–çfVçF÷'•v–GF‚ÇÂÒ"óãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
}Í]ýâ-½í-SÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ&–çfVçF÷'”†V–v‡B"fÇVSÒ"G¶—FVÒæ–çfVçF÷'”†V–v‡BÇÂÒ"óãÂöF—cãÂöF—cà¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR–çfVçF÷'’×6—¦RÖ†–çB×ccr#í
}Í]}M-ò"­½]-­RÝ-]Ý-òÂÝýÍ]9s"½‚,9sãÂöF—cæ°¢–b†‡FÖÂæ–æ6ÇVFW2†æ6†÷"’’‡FÖÂÒ‡FÖÂç&WÆ6R†æ6†÷"Âf–VÆG2“°¢&WGW&â‡FÖÃ°¢Ó° ¢6öç7Bõ÷&VæFW%Æ–W$VF—F÷%ccrÒ6öæf–wW&F÷"ç&VæFW%Æ–W$VF—F÷"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW%Æ–W$VF—F÷"ÒgVæ7F–öâ‡&uW6W"’°¢6öç7BW6W"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡&uW6W"“°¢ÆWB‡FÖÂÒõ÷&VæFW%Æ–W$VF—F÷%ccr‡W6W"“°¢6öç7B6WGF–æw2ÒÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	Ý-]Ý-Â‚½í-³ÂöF—cà¢ÆF—b6Æ73Ò&6öÇ32–çfVçF÷'’Ö6†&7FW"×6WGF–æw2×ccr#ãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
}Í]Ý-]Ý-óÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ&–çfVçF÷'•6—¦R"fÇVSÒ"G·W6W"æ–çfVçF÷'•6—¦WÒ"óãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	­í½}]--â­½]-í¢â	ýâ=Íí½}Ýâ"Â-]]Ý]=âí=Ý}]ÝòÝ]"ãÂöF—cãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	ý]]ÝíÍ½’-]ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#ã"æÖSÒ&6''•vV–v‡DÖ‚"fÇVSÒ"G´çVÖ&W"‡W6W"æ6''•vV–v‡DÖ‚—Ò"óãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ýâ=Íí½}Ýâ"Â-]]Ý]=âí=Ý}]ÝòÝ]"ãÂöF—cãÂöF—cãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
½í-í"Íý½Ý-í#ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"æÖSÒ&–×ÆçE6Æ÷D6÷VçB"fÇVSÒ"G·W6W"æ–×ÆçE6Æ÷D6÷VçGÒ"óãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ýâ=Íí½}ÝâÂ-]]Ý]=âí=Ý}]ÝòÝ]"ãÂöF—cãÂöF—cãÂöF—cæ°¢6öç7B–×ÆçD÷F–öç2Òö&¦V7BçfÇVW2„UT•ÔTåBÇÂ·Ò’æÖ†æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"’æf–ÇFW"†—FVÒÓâ—FVÒçG—RÓÓÒv–×ÆçBr’ç6÷'B‚†Æ"’Óâ7G&–ær†ææÖWÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†"ææÖWÇÂrr’Âw'Rr’“°¢6öç7B–×ÆçE6Æ÷G2ÒÆF—b6Æ73Ò&f–VÆB–×ÆçB×6Æ÷BÖVF—F÷"×ccr#ãÆÆ&VÃí
=-Ýí-½]ÝÝ½RÍý½Ý-²ýâ½í-ÃÂöÆ&VÃâG·W6W"æ–×ÆçE6Æ÷D6÷VçBòÆF—b6Æ73Ò&G–æÖ–2ÖÆ—7B#âG´'&’æg&öÒ‡¶ÆVæwFƒ§W6W"æ–×ÆçE6Æ÷D6÷VçGÒÂ…òÆ–æFW‚“ÓæÆF—b6Æ73Ò&G–æÖ–2×&÷r#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#í
½í"G¶–æFW‚³ÓÂ÷7ããÇ6VÆV7B6Æ73Ò'6VÆV7B"æÖSÒ&–×ÆçE6Æ÷EòG¶–æFW‡Ò#ãÆ÷F–öâfÇVSÒ"#î(	Bý=-â(	CÂö÷F–öãâG¶–×ÆçD÷F–öç2æÖ†—FVÓÓæÆ÷F–öâfÇVSÒ"G¶W62†—FVÒæ–B—Ò"Gµ7G&–ær‡W6W"æ–×ÆçE6Æ÷G5¶–æFW…×ÇÂrr“ÓÓÕ7G&–ær†—FVÒæ–B“òw6VÆV7FVBs¢rwÓâG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂö÷F–öãæ’æ¦ö–â‚rr—ÓÂ÷6VÆV7CãÇ7â6Æ73Ò'6ÖÆÂÖæ÷FR#âG·W6W"æ–×ÆçE6Æ÷G5¶–æFW…ÒòG´çVÖ&W"„UT•ÔTåCòå·W6W"æ–×ÆçE6Æ÷G5¶–æFW…ÕÓòæVæW&w•&WV—&VBÇÂ—ÒTæ¢rwÓÂ÷7ããÂöF—cæ’æ¦ö–â‚rr—ÓÂöF—cæ¢sÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
2ý]íÝmÝ]"Mí-=ýÝ½R½í-í"Íý½Ý-í"ãÂöF—câwÓÂöF—cæ°¢‡FÖÂÒ‡FÖÂç&WÆ6R‚sÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUõÄ”U#Âö'WGFöãârÂG·6WGF–æw7ÒG¶–×ÆçE6Æ÷G7ÓÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUõÄ”U#Âö'WGFöãæ“°¢&WGW&â‡FÖÃ°¢Ó° ¢6öç7Bõö6öæf–u&VæFW%ccrÒ6öæf–wW&F÷"ç&VæFW"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW"ÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒõö6öæf–u&VæFW%ccr‚“°¢–b‡F†—2ç6VÆV7FVEG—RÓÓÒwÆ–W'2r’°¢6öç7Bf÷&ÒÒFö7VÖVçBævWDVÆVÖVçD'”–B‚v6öæf–rÖVF—F÷"Öf÷&Òr“°¢–b†f÷&Ò’°¢'&’æg&öÒ†f÷&ÒçVW'•6VÆV7F÷$ÆÂ‚ræf–VÆBâÆ&VÂr’’æf–ÇFW"†Æ&VÂÓâÆ&VÂçFW‡D6öçFVçCòçG&–Ò‚’ÓÓÒ}
=-Ýí-½]ÝÝ½RÍý½Ý-²r’æf÷$V6‚†Æ&VÂÓâ°¢–b‚Æ&VÂæ6Æ÷6W7B‚ræ–×ÆçB×6Æ÷BÖVF—F÷"×ccrr’’Æ&VÂæ6Æ÷6W7B‚ræf–VÆBr“òæ6Æ74Æ—7BæFB‚vÆVv7’Ö–×ÆçBÖVF—F÷"Ö†–FFVâ×ccrr“°¢Ò“°¢Ð¢Ð¢&WGW&â&W7VÇC°¢Ó° ¢6öç7Bõö6öÆÆV7DVçF—G•ccrÒ6öæf–wW&F÷"æ6öÆÆV7DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ6öÆÆV7DVçF—G’ÒgVæ7F–öâ‡G—RÂf÷&ÔVÂÂf÷&ÔFFÒæWrf÷&ÔFF†f÷&ÔVÂ’’°¢6öç7BVçF—G’Òõö6öÆÆV7DVçF—G•ccr‡G—RÂf÷&ÔVÂÂf÷&ÔFF“°¢–b‚VçF—G’’&WGW&âVçF—G“°¢–b‡G—RÓÓÒvWV—ÖVçBr’°¢VçF—G’æ7&VF–öä6÷7BÒ6Æ×„ÖF‚æÖ‚ƒÂçVÖ&W"†f÷&ÔFFævWB‚v7&VF–öä6÷7Br’ÇÂ’’ÂÂ“°¢VçF—G’æf–Æ&ÆT57F'F–ærÒf÷&ÔFFævWB‚vf–Æ&ÆT57F'F–ærr’ÓÓÒvöâs°¢VçF—G’æÖ72ÒçVÔæöäæVvF—fUccr†f÷&ÔFFævWB‚vÖ72r’Â“°¢VçF—G’æ–çfVçF÷'•v–GF‚ÒÖF‚æÖ‚ƒÂ–çDæöäæVvF—fUccr†f÷&ÔFFævWB‚v–çfVçF÷'•v–GF‚r’Â’“°¢VçF—G’æ–çfVçF÷'”†V–v‡BÒÖF‚æÖ‚ƒÂ–çDæöäæVvF—fUccr†f÷&ÔFFævWB‚v–çfVçF÷'”†V–v‡Br’Â’“°¢&WGW&âæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†VçF—G’“°¢Ð¢–b‡G—RÓÓÒwÆ–W'2r’°¢VçF—G’æ–çfVçF÷'•6—¦RÒ–çDæöäæVvF—fUccr†f÷&ÔFFævWB‚v–çfVçF÷'•6—¦Rr’ÂDTdTÅEô”ådTåDõ%•õ4•¤Uõccr“°¢VçF—G’æ6''•vV–v‡DÖ‚ÒçVÔæöäæVvF—fUccr†f÷&ÔFFævWB‚v6''•vV–v‡DÖ‚r’ÂDTdTÅEô4%%•õtT”t…Eõccr“°¢VçF—G’æ–×ÆçE6Æ÷D6÷VçBÒ–çDæöäæVvF—fUccr†f÷&ÔFFævWB‚v–×ÆçE6Æ÷D6÷VçBr’Â“°¢VçF—G’æ–×ÆçE6Æ÷G2Ò'&’æg&öÒ‡²ÆVæwFƒ¢VçF—G’æ–×ÆçE6Æ÷D6÷VçBÒÂ…òÂ–æFW‚’Óâ7G&–ær†f÷&ÔFFævWB†–×ÆçE6Æ÷EòG¶–æFW‡Ö’ÇÂrr’çG&–Ò‚’“°¢VçF—G’æ–ç7FÆÆVD–×ÆçD–G2ÒVçF—G’æ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ“°¢&WGW&âæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"†VçF—G’“°¢Ð¢&WGW&âVçF—G“°¢Ó° ¢gVæ7F–öâ6Æ÷DÆ&VÅccr‡6Æ÷EG—RÂ–æFW‚ÒÓ’°¢–b‡6Æ÷EG—RÓÓÒw&–Ö'•vVöâr’&WGW&â}	íÝí-ÝíRs°¢–b‡6Æ÷EG—RÓÓÒw6V6öæF'•vVöâr’&WGW&â}	--í}ÝíRs°¢–b‡6Æ÷EG—RÓÓÒv&Ö÷"r’&WGW&â}	íÝòs°¢–b‡6Æ÷EG—RÓÓÒv&6·6²r’&WGW&â}
í­}¢s°¢&WGW&â	Íý½Ý"G¶–æFW‚²Ö°¢Ð¢gVæ7F–öâ–çfVçF÷'•6Æ÷DÖ&·Wccr‡W6W"Â6Æ÷EG—RÂ6Æ÷D–æFW‚ÒÓ’°¢6öç7B—FVÔ–BÒvWE6Æ÷D—FVÕccr‡W6W"Â6Æ÷EG—RÂ6Æ÷D–æFW‚“°¢6öç7B—FVÒÒ—FVÔ–Bò—FVÔf÷$–çfVçF÷'•ccr†—FVÔ–B’¢çVÆÃ°¢&WGW&âÆF—b6Æ73Ò&–çfVçF÷'’ÖWV—×6Æ÷B×ccrG¶—FVÒòvf–ÆÆVBr¢rwÒ"FFÖ–çfVçF÷'’×6Æ÷B×ccrFF×6Æ÷B×G—SÒ"G·6Æ÷EG—WÒ"FF×6Æ÷BÖ–æFWƒÒ"G·6Æ÷D–æFW‡Ò#à¢ÆF—b6Æ73Ò&–çfVçF÷'’×6Æ÷BÖÆ&VÂ×ccr#âG¶W62‡6Æ÷DÆ&VÅccr‡6Æ÷EG—RÂ6Æ÷D–æFW‚’—ÓÂöF—cà¢G¶—FVÒòÆF—b6Æ73Ò&–çfVçF÷'’×6Æ÷BÖ—FVÒ×ccr"G&vv&ÆSÒ'G'VR"FFÖ–çfVçF÷'’ÖG&r×ccrFF×6÷W&6SÒ'6Æ÷B"FF×6Æ÷B×G—SÒ"G·6Æ÷EG—WÒ"FF×6Æ÷BÖ–æFWƒÒ"G·6Æ÷D–æFW‡Ò"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"FFÖVçF—G“Ò&—FVÒ"FFÖ–CÒ"G¶W62†—FVÒæ–B—Ò#âG·&VæFW%F‡VÖ"†—FVÒÇ·6—¦S¢w6ÒrÇG—S¢v—FVÒrÆvÇ—ƒ¦–æ—F–Ç2†—FVÒææÖRÂ~)j2r—Ò—ÓÇ7ãâG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂ÷7ããÂöF—cæ¢sÆF—b6Æ73Ò&–çfVçF÷'’×6Æ÷BÖV×G’×ccr#í	ý]]--Rý]MÍ]#ÂöF—câwÐ¢ÂöF—cæ°¢Ð¢gVæ7F–öâ–çfVçF÷'”w&–DÖ&·Wccr‡W6W"’°¢6öç7BÆ–÷WBÒ'V–ÆD–çfVçF÷'”Æ–÷WEccr‡W6W"“°¢6öç7B6VÆÇ2Ò'&’æg&öÒ‡²ÆVæwFƒ¢Æ–÷WBç6—¦RÒÂ…òÂ–æFW‚’ÓâÆF—b6Æ73Ò&–çfVçF÷'’Öw&–BÖ6VÆÂ×ccr"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G²†–æFW‚RÆ–÷WBæ6öÇ2’²Ó¶w&–B×&÷s¢G´ÖF‚æfÆö÷"†–æFW‚òÆ–÷WBæ6öÇ2’²Ò"FFÖ6VÆÂÖ–æFWƒÒ"G¶–æFW‡Ò#ãÂöF—cæ’æ¦ö–â‚rr“°¢6öç7BF–ÆW2ÒÆ–÷WBæ–ç7Fæ6W2æÖ†–ç7Fæ6RÓâÆF—b6Æ73Ò&–çfVçF÷'’×F–ÆR×ccr"G&vv&ÆSÒ'G'VR"FFÖ–çfVçF÷'’ÖG&r×ccrFF×6÷W&6SÒ&w&–B"FFÖ—FVÒÖ–CÒ"G¶W62†–ç7Fæ6Ræ—FVÔ–B—Ò"FF×Væ—BÖ–æFWƒÒ"G¶–ç7Fæ6RçVæ—D–æFW‡Ò"FFÖVçF—G“Ò&—FVÒ"FFÖ–CÒ"G¶W62†–ç7Fæ6Ræ—FVÔ–B—Ò"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–ç7Fæ6Rç÷2ç‚²Ò÷7âG¶–ç7Fæ6RçwÓ¶w&–B×&÷s¢G¶–ç7Fæ6Rç÷2ç’²Ò÷7âG¶–ç7Fæ6Ræ‡Ò"F—FÆSÒ"G¶W62†–ç7Fæ6Ræ—FVÒææÖRÇÂ–ç7Fæ6Ræ—FVÔ–B—Ò+rG¶–ç7Fæ6RçwÜ9rG¶–ç7Fæ6Ræ‡Ò+rG¶—FVÔÖ75ccr†–ç7Fæ6Ræ—FVÒ—Ò-]#âG·&VæFW%F‡VÖ"†–ç7Fæ6Ræ—FVÒÇ·6—¦S¢w6ÒrÇG—S¢v—FVÒrÆvÇ—ƒ¦–æ—F–Ç2†–ç7Fæ6Ræ—FVÒææÖRÂ~)j2r—Ò—ÓÇ7ãâG¶W62†–ç7Fæ6Ræ—FVÒææÖWÇÆ–ç7Fæ6Ræ—FVÔ–B—ÓÂ÷7ããÇ6ÖÆÃâG¶–ç7Fæ6RçwÜ9rG¶–ç7Fæ6Ræ‡ÒG´çVÖ&W"†–ç7Fæ6RçG—ÇÃ“ãö+r9rG¶–ç7Fæ6RçG—Ö¢rwÓÂ÷6ÖÆÃãÂöF—cæ’æ¦ö–â‚rr“°¢6öç7B÷fW&fÆ÷rÒÆ–÷WBæ÷fW&fÆ÷ræÆVæwF‚òÆF—b6Æ73Ò&–çfVçF÷'’Ö÷fW&fÆ÷r×ccr#ãÆ#í	ÝRýíÍ]]-ó¢G¶Æ–÷WBæ÷fW&fÆ÷ræÆVæwF‡ÓÂö#âG¶Æ–÷WBæ÷fW&fÆ÷ræÖ†–ç7Fæ6SÓæÇ7ãâG¶W62†–ç7Fæ6Ræ—FVÒææÖWÇÆ–ç7Fæ6Ræ—FVÔ–B—Ò‚G¶–ç7Fæ6RçwÜ9rG¶–ç7Fæ6Ræ‡Ò“Â÷7ãæ’æ¦ö–â‚rr—ÓÂöF—cæ¢rs°¢&WGW&âÆF—b6Æ73Ò&–çfVçF÷'’Öw&–B×ccr"FFÖ–çfVçF÷'’Öw&–B×ccr7G–ÆSÒ"ÒÖ–çbÖ6öÇ3¢G¶Æ–÷WBæ6öÇ7Ó²ÒÖ–çb×&÷w3¢G¶Æ–÷WBç&÷w7Ò#âG¶6VÆÇ7ÒG·F–ÆW7ÓÂöF—câG¶÷fW&fÆ÷wÖ°¢Ð¢gVæ7F–öâ&öf–ÆT–çfVçF÷'”Ö&·Wccr‡W6W"Â÷&–v–ç4‡FÖÂÒrr’°¢6öç7BÆ–÷WBÒ'V–ÆD–çfVçF÷'”Æ–÷WEccr‡W6W"“°¢6öç7B÷fW'vV–v‡BÒÆ–÷WBçvV–v‡BâW6W"æ6''•vV–v‡DÖ‚²RÓ“°¢&WGW&âÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
Ý­ýí-­ÂöF—cà¢ÆF—b6Æ73Ò&–çfVçF÷'’Ö66—G’Ö&"×ccr#ãÇ7ãí	Ý-]Ý-ÂÆ#âGµ²ââæÆ–÷WBæ–ç7Fæ6W2ÂââæÆ–÷WBæ÷fW&fÆ÷uÒç&VGV6R‚‡7VÒÆ’“Óç7VÒ¶’çr¦’æ‚Ã—ÒòG·W6W"æ–çfVçF÷'•6—¦WÓÂö#â­½]-í£Â÷7ããÇ7â6Æ73Ò"G¶÷fW'vV–v‡Bòv–çfVçF÷'’ÖÆ–Ö—BÖW†6VVFVB×ccrr¢rwÒ#í	-]Æ#âG¶Æ–÷WBçvV–v‡BçFôf—†VBƒ—ÒòG´çVÖ&W"‡W6W"æ6''•vV–v‡DÖ‚’çFôf—†VBƒ—ÓÂö#ãÂ÷7ããÂöF—cà¢ÆF—b6Æ73Ò&–çfVçF÷'’ÖWV—ÖVçB×6Æ÷G2×ccr#âG¶–çfVçF÷'•6Æ÷DÖ&·Wccr‡W6W"Âw&–Ö'•vVöâr—ÒG¶–çfVçF÷'•6Æ÷DÖ&·Wccr‡W6W"Âw6V6öæF'•vVöâr—ÒG¶–çfVçF÷'•6Æ÷DÖ&·Wccr‡W6W"Âv&Ö÷"r—ÒG´'&’æg&öÒ‡¶ÆVæwFƒ§W6W"æ–×ÆçE6Æ÷D6÷VçGÒÂ…òÆ’“Óæ–çfVçF÷'•6Æ÷DÖ&·Wccr‡W6W"Âv–×ÆçBrÆ’’’æ¦ö–â‚rr—ÓÂöF—cà¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR"7G–ÆSÒ&Ö&v–â×F÷£‡‚#í	Ý-]Ý-ÃÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR"7G–ÆSÒ&Ö&v–âÖ&÷GFöÓ£‡‚#í	ý]MÍ]-²}ÝÍí"]½ÍÝ½’}Í]"­½]-­Râ	ý]]-­--RRýâ]-­R½‚"ýíM]íMýR½í-²Ý­ýí-­‚ãÂöF—cà¢G¶–çfVçF÷'”w&–DÖ&·Wccr‡W6W"—Ð¢G¶÷&–v–ç4‡FÖÇÖ°¢Ð ¢6öç7Bõ÷&VæFW%&öf–ÆUccrÒT’ç&VæFW%&öf–ÆRæ&–æB…T’“°¢T’ç&VæFW%&öf–ÆRÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒõ÷&VæFW%&öf–ÆUccr‚“°¢6öç7BW6W"Òæ7W'&VçEW6W"òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"„æ7W'&VçEW6W"’¢çVÆÃ°¢6öç7B&ö÷BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖ6öçFVçBr“°¢–b‚W6W"ÇÂ&ö÷B’&WGW&â&W7VÇC°¢6öç7BWV—6&BÒ'&’æg&öÒ‡&ö÷BçVW'•6VÆV7F÷$ÆÂ‚rç&öf–ÆRÖ6&Br’’æf–æB†6&BÓâ'&’æg&öÒ†6&BçVW'•6VÆV7F÷$ÆÂ‚rç6V7F–öâ×F—FÆRr’’ç6öÖR‡F—FÆRÓâ²}
Ý­ýí-­rÂ}
Ýým]ÝRuÒæ–æ6ÇVFW2‡F—FÆRçFW‡D6öçFVçCòçG&–Ò‚’’’“°¢–b†WV—6&B’°¢6öç7B÷&–v–ç4‡FÖÂÒWV—6&BçVW'•6VÆV7F÷"‚u¶FFÖ÷&–v–ç2×cS%Òr“òæ÷WFW$…DÔÂÇÂrs°¢WV—6&Bæ6Æ74Æ—7BæFB‚v–çfVçF÷'’×&öf–ÆRÖ6&B×ccrr“°¢WV—6&Bæ–ææW$…DÔÂÒ&öf–ÆT–çfVçF÷'”Ö&·Wccr‡W6W"Â÷&–v–ç4‡FÖÂ“°¢F†—2æGF6„VçF—G”Æ–æ·2†WV—6&B“°¢Ð¢6öç7Bf—'7E&öf–ÆRÒ&ö÷BçVW'•6VÆV7F÷"‚rç&öf–ÆRÖ6&Br“°¢–b†f—'7E&öf–ÆRbbf—'7E&öf–ÆRçVW'•6VÆV7F÷"‚u¶FFÖ–çfVçF÷'’ÖÆ–Ö—G2×ccuÒr’’°¢f—'7E&öf–ÆRæ–ç6W'DF¦6VçD…DÔÂ‚v&Vf÷&VVæBrÂÆF—bFFÖ–çfVçF÷'’ÖÆ–Ö—G2×ccr7G–ÆSÒ&Ö&v–â×F÷£G‚#ãÆF—b6Æ73Ò&FF×&÷r#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#í
}Í]Ý-]Ý-óÂ÷7ããÇ7â6Æ73Ò&FF×fÇVR#âG·W6W"æ–çfVçF÷'•6—¦WÓÂ÷7ããÂöF—cãÆF—b6Æ73Ò&FF×&÷r#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#í	ý]]ÝíÍ½’-]Â÷7ããÇ7â6Æ73Ò&FF×fÇVR#âG´çVÖ&W"‡W6W"æ6''•vV–v‡DÖ‚’çFôf—†VBƒ—ÓÂ÷7ããÂöF—cãÆF—b6Æ73Ò&FF×&÷r#ãÇ7â6Æ73Ò&FFÖÆ&VÂ#í
½í-²Íý½Ý-í#Â÷7ããÇ7â6Æ73Ò&FF×fÇVR#âG·W6W"æ–×ÆçE6Æ÷D6÷VçGÓÂ÷7ããÂöF—cãÂöF—cæ“°¢Ð¢&WGW&â&W7VÇC°¢Ó° ¢6öç7B&öf–ÆT–çfVçF÷'•VWVW5c#ÒæWrÖ‚“°¢6öç7B&öf–ÆT–çfVçF÷'”ÆFW7Ec#ÒæWrÖ‚“°¢ÆWB&öf–ÆT–çfVçF÷'•6Wc#Ò°¢gVæ7F–öâ&öf–ÆT–çfVçF÷'•F6…c#‡Æ–W"Ò·Ò’°¢&WGW&â°¢–çfVçF÷'“¢FVW‡Æ–W"æ–çfVçF÷'’ÇÂµÒ’À¢WV—ÖVçE6Æ÷G3¢FVW‡Æ–W"æWV—ÖVçE6Æ÷G2ÇÂ·Ò’À¢–×ÆçE6Æ÷G3¢FVW‡Æ–W"æ–×ÆçE6Æ÷G2ÇÂµÒ’À¢–ç7FÆÆVD–×ÆçD–G3¢FVW‡Æ–W"æ–ç7FÆÆVD–×ÆçD–G2ÇÂµÒ’À¢–çfVçF÷'•6—¦S¢Æ–W"æ–çfVçF÷'•6—¦RÀ¢6''•vV–v‡DÖƒ¢Æ–W"æ6''•vV–v‡DÖ‚À¢–×ÆçE6Æ÷D6÷VçC¢Æ–W"æ–×ÆçE6Æ÷D6÷Vç@¢Ó°¢Ð¢gVæ7F–öâ&öf–ÆT–çfVçF÷'”Ç”Æö6Åc#‡Æ–W$–BÂF6‚’°¢6öç7B&6SÔç7FFSòçW6W'3òå·Æ–W$–E×ÇÅÄ”U%õDTÕÄDU3òå·Æ–W$–EÓ¶–b‚&6R—&WGW&âçVÆÃ°¢6öç7BÖW&vVCÖæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡²ââæFVW†&6R’ÂââæFVW‡F6‚’Æ–C§Æ–W$–GÒ“°¢ç7FFRçW6W'5·Æ–W$–EÓÖÖW&vVCµÄ”U%õDTÕÄDU5·Æ–W$–EÓÖFVW†ÖW&vVB“·&WGW&âÖW&vVC°¢Ð¢gVæ7F–öâ&öf–ÆT–çfVçF÷'•&VæFW$Æö6Åc#‡Æ–W$–B—°¢–b…7G&–ær„æ7W'&VçEW6W$–GÇÂrr’ÓÕ7G&–ær‡Æ–W$–GÇÂrr’—&WGW&ã°¢–b†Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÖöB×&öf–ÆRr“òæ6Æ74Æ—7Bæ6öçF–ç2‚v÷Vâr’•T’ç&VæFW%&öf–ÆR‚“°¢Ð¢v–æF÷räu%t–çfVçF÷'•VæF–æuc#×¶†3§Æ–W$–CÓç&öf–ÆT–çfVçF÷'”ÆFW7Ec#æ†2…7G&–ær‡Æ–W$–GÇÂrr’’Æ†4ç“¢‚“Óç&öf–ÆT–çfVçF÷'”ÆFW7Ec#ç6—¦SãÓ° ¢7–æ2gVæ7F–öâW'6—7D–çfVçF÷'”×WFF–öåccr†×WFF÷"Âæ÷F–6RÒ}	Ý-]Ý-ÂíÝí-½Òr’°¢6öç7B7W'&VçCÔæ7W'&VçEW6W#¶–b‚7W'&VçB—&WGW&ã°¢6öç7BæW‡CÖæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"†FVW†7W'&VçB’“°¢6öç7B÷WF6öÖSÖ×WFF÷"†æW‡B“°¢–b†÷WF6öÖRbbG—Vöb÷WF6öÖRçF†VãÓÓÒvgVæ7F–öâr—F‡&÷ræWrW'&÷"‚t–çfVçF÷'’×WFF–öâ×W7B&R7–æ6‡&öæ÷W2r“°¢–b†÷WF6öÖSÓÓÖfÇ6R—&WGW&ã°¢æW‡Bæ–ç7FÆÆVD–×ÆçD–G3Ò†æW‡Bæ–×ÆçE6Æ÷G7ÇÅµÒ’æf–ÇFW"„&ööÆVâ“°¢ç7FFRçW6W'5¶æW‡Bæ–EÓÖæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"†æW‡B“°¢Ä”U%õDTÕÄDU5¶æW‡Bæ–EÓÖFVW„ç7FFRçW6W'5¶æW‡Bæ–EÒ“°¢6öç7BF6³ÕÆ–W%7–æ2çW6…Æ–W%F6‚†æW‡Bæ–BÇ&öf–ÆT–çfVçF÷'•F6…c#„ç7FFRçW6W'5¶æW‡Bæ–EÒ’Ç¶æ÷F–6RÇ&W&VæFW#¦fÇ6WÒ“°¢&öf–ÆT–çfVçF÷'•&VæFW$Æö6Åc#†æW‡Bæ–B“°¢6öç7B&W7VÇCÖv—BF6³·&öf–ÆT–çfVçF÷'•&VæFW$Æö6Åc#†æW‡Bæ–B“·&WGW&â&W7VÇC°¢Ð ¢ÆWBG&uccrÒçVÆÃ°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&w7F'BrÂWfVçBÓâ°¢6öç7BæöFRÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖ–çfVçF÷'’ÖG&r×ccuÒr“°¢–b‚æöFR’&WGW&ã°¢G&uccrÒ°¢6÷W&6S¢æöFRæFF6WBç6÷W&6RÀ¢—FVÔ–C¢7G&–ær†æöFRæFF6WBæ—FVÔ–BÇÂrr’À¢Væ—D–æFWƒ¢–çDæöäæVvF—fUccr†æöFRæFF6WBçVæ—D–æFW‚ÂÓ’À¢6Æ÷EG—S¢7G&–ær†æöFRæFF6WBç6Æ÷EG—RÇÂrr’À¢6Æ÷D–æFWƒ¢çVÖ&W"†æöFRæFF6WBç6Æ÷D–æFW‚óòÓ¢Ó°¢WfVçBæFFG&ç6fW"æVffV7DÆÆ÷vVBÒvÖ÷fRs°¢G'’²WfVçBæFFG&ç6fW"ç6WDFF‚wFW‡B÷Æ–ârÂG&uccræ—FVÔ–B“²Ò6F6‚·Ð¢æöFRæ6Æ74Æ—7BæFB‚v–çfVçF÷'’ÖG&vv–ær×ccrr“°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&vVæBrÂWfVçBÓâ°¢WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖ–çfVçF÷'’ÖG&r×ccuÒr“òæ6Æ74Æ—7Bç&VÖ÷fR‚v–çfVçF÷'’ÖG&vv–ær×ccrr“°¢G&uccrÒçVÆÃ°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&v÷fW"rÂWfVçBÓâ°¢–b‚G&uccr’&WGW&ã°¢–b†WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖ–çfVçF÷'’Öw&–B×ccuÒÅ¶FFÖ–çfVçF÷'’×6Æ÷B×ccuÒr’’°¢WfVçBç&WfVçDFVfVÇB‚“°¢WfVçBæFFG&ç6fW"æG&÷VffV7BÒvÖ÷fRs°¢Ð¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&÷rÂ7–æ2WfVçBÓâ°¢–b‚G&uccr’&WGW&ã°¢6öç7Bw&–BÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖ–çfVçF÷'’Öw&–B×ccuÒr“°¢6öç7B6Æ÷BÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖ–çfVçF÷'’×6Æ÷B×ccuÒr“°¢–b‚w&–Bbb6Æ÷B’&WGW&ã°¢WfVçBç&WfVçDFVfVÇB‚“°¢6öç7BG&rÒ²ââæG&uccrÓ°¢G&uccrÒçVÆÃ°¢–b‡6Æ÷B’°¢6öç7BF&vWEG—RÒ7G&–ær‡6Æ÷BæFF6WBç6Æ÷EG—RÇÂrr“°¢6öç7BF&vWD–æFW‚ÒçVÖ&W"‡6Æ÷BæFF6WBç6Æ÷D–æFW‚óòÓ“°¢6öç7B—FVÒÒ—FVÔf÷$–çfVçF÷'•ccr†G&ræ—FVÔ–B“°¢–b‚6Æ÷D66WG4—FVÕccr‡F&vWEG—RÂ—FVÒ’’²Fö7Bç6†÷r‚}
Ý-í"ý]MÍ]"Ý]½Í}ò=-Ýí--Â"-½ÝÝ½’½í"rÂvW'"r“²&WGW&ã²Ð¢v—BW'6—7D–çfVçF÷'”×WFF–öåccr‡W6W"Óâ°¢–b†G&rç6÷W&6RÓÓÒw6Æ÷Br’6WE6Æ÷D—FVÕccr‡W6W"ÂG&rç6Æ÷EG—RÂG&rç6Æ÷D–æFW‚Ârr“°¢6öç7B÷væVBÒ—FVÔ÷væVEG•ccr‡W6W"ÂG&ræ—FVÔ–B“°¢6öç7BÇ&VG”WV—VBÒWV—VD6÷VçDf÷$—FVÕccr‡W6W"ÂG&ræ—FVÔ–B“°¢6öç7BF&vWD7W'&VçBÒvWE6Æ÷D—FVÕccr‡W6W"ÂF&vWEG—RÂF&vWD–æFW‚“°¢6öç7BÆÆ÷væ6RÒF&vWD7W'&VçBÓÓÒG&ræ—FVÔ–Bò¢°¢–b†÷væVBÃÒÇ&VG”WV—VBÒÆÆ÷væ6R’²Fö7Bç6†÷r‚}	"Ý-]Ý-RÝ]"-ííMÝí=âÝ­}]Íý½ýÝ-í=âý]MÍ]-rÂvW'"r“²&WGW&âfÇ6S²Ð¢6WE6Æ÷D—FVÕccr‡W6W"ÂF&vWEG—RÂF&vWD–æFW‚ÂG&ræ—FVÔ–B“°¢&WGW&âG'VS°¢ÒÂ}
Ý­ýí-­íÝí-½]Ýr“°¢&WGW&ã°¢Ð¢6öç7B&V7BÒw&–BævWD&÷VæF–æt6Æ–VçE&V7B‚“°¢6öç7B6öÇ2ÒçVÖ&W"†vWD6ö×WFVE7G–ÆR†w&–B’ævWE&÷W'G•fÇVR‚rÒÖ–çbÖ6öÇ2r’’ÇÂ°¢6öç7B6VÆÂÒ&V7Bçv–GF‚ò6öÇ3°¢6öç7B‚ÒÖF‚æÖ‚ƒÂÖF‚æÖ–â†6öÇ2ÒÂÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE‚Ò&V7BæÆVgB’ò6VÆÂ’’“°¢6öç7B’ÒÖF‚æÖ‚ƒÂÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE’Ò&V7BçF÷’ò6VÆÂ’“°¢v—BW'6—7D–çfVçF÷'”×WFF–öåccr‡W6W"Óâ°¢ÆWBVæ—D–æFW‚ÒG&rçVæ—D–æFWƒ°¢–b†G&rç6÷W&6RÓÓÒw6Æ÷Br’°¢6WE6Æ÷D—FVÕccr‡W6W"ÂG&rç6Æ÷EG—RÂG&rç6Æ÷D–æFW‚Ârr“°¢Væ—D–æFW‚ÒWV—VD6÷VçDf÷$—FVÕccr‡W6W"ÂG&ræ—FVÔ–B“°¢Ð¢–b‡Væ—D–æFW‚ÂÇÂ6åÆ6T–çfVçF÷'•Væ—Eccr‡W6W"ÂG&ræ—FVÔ–BÂVæ—D–æFW‚Â‚Â’’’²Fö7Bç6†÷r‚}	ý]MÍ]"ÝRýíÍ]]-ò"-½ÝÝíRÍ]-ârÂvW'"r“²&WGW&âfÇ6S²Ð¢6WD–çfVçF÷'•÷6—F–öåccr‡W6W"ÂG&ræ—FVÔ–BÂVæ—D–æFW‚Â²‚Â’Ò“°¢&WGW&âG'VS°¢ÒÂG&rç6÷W&6RÓÓÒw6Æ÷Brò}	ý]MÍ]"Ýý"r¢}	Ý-]Ý-Âý]]Í]Òr“°¢Ò“°  ¢ò¢cããc‚v÷&ÆB6öæf–r–çfVçF÷'’ööÂ²G&röG&÷VF—F÷"¢ð¢gVæ7F–öâv4–çfVçF÷'•7FFUcc‚‡&uW6W"Ò·Ò’°¢6öç7BW6W"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡&uW6W"“°¢&WGW&â°¢–C¢7G&–ær‡W6W"æ–BÇÂrr’À¢&öÆS¢7G&–ær‡W6W"ç&öÆRÇÂwÆ–W"r’À¢&–Æ—G”&6S¢FVW‡W6W"æ&–Æ—G”&6RÇÂW6W"æ&–Æ—F–W2ÇÂ·Ò’À¢&–Æ—F–W3¢FVW‡W6W"æ&–Æ—F–W2ÇÂ·Ò’À¢&6U7FG3¢FVW‡W6W"æ&6U7FG2ÇÂ·Ò’À¢ÖöF–f–W'3¢FVW‡W6W"æÖöF–f–W'2ÇÂµÒ’À¢6¶–ÆÇ3¢FVW‡W6W"ç6¶–ÆÇ2ÇÂµÒ’À¢6ö6–Ä÷&–v–ä–C¢7G&–ær‡W6W"ç6ö6–Ä÷&–v–ä–BÇÂrr’À¢vVöw&†–4÷&–v–ä–C¢7G&–ær‡W6W"ævVöw&†–4÷&–v–ä–BÇÂrr’À¢7FG3¢FVW‡W6W"ç7FG2ÇÂ·Ò’À¢–çfVçF÷'”&6U6Æ÷G3¢çVÖ&W"‡W6W"æ–çfVçF÷'”&6U6Æ÷G2óòW6W"æ&6U7FG3òæ–çfVçF÷'•6Æ÷G2óòW6W"æ–çfVçF÷'•6—¦Róò"’À¢6''”&6S¢çVÖ&W"‡W6W"æ6''”&6RóòW6W"æ&6U7FG3òæ6''”&6Róò"’À¢&6T–×ÆçE6Æ÷G3¢çVÖ&W"‡W6W"æ&6T–×ÆçE6Æ÷G2óòW6W"æ&6U7FG3òæ–×ÆçE6Æ÷G2óòW6W"æ–×ÆçE6Æ÷D6÷VçBóò’À¢–çfVçF÷'•6—¦S¢W6W"æ–çfVçF÷'•6—¦RÀ¢6''•vV–v‡DÖƒ¢W6W"æ6''•vV–v‡DÖ‚À¢–×ÆçE6Æ÷D6÷VçC¢W6W"æ–×ÆçE6Æ÷D6÷VçBÀ¢–çfVçF÷'“¢FVW‡W6W"æ–çfVçF÷'’ÇÂµÒ’À¢WV—ÖVçE6Æ÷G3¢FVW‡W6W"æWV—ÖVçE6Æ÷G2ÇÂ²&–Ö'•vVöã¢rrÂ6V6öæF'•vVöã¢rrÂ&Ö÷#¢rrÂ&6·6³¢rrÒ’À¢–×ÆçE6Æ÷G3¢FVW‡W6W"æ–×ÆçE6Æ÷G2ÇÂµÒ¢Ó°¢Ð¢gVæ7F–öâv4–çfVçF÷'”—FV×5cc‚‚’°¢&WGW&âö&¦V7BçfÇVW2„UT•ÔTåBÇÂ·Ò’æÖ†æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"’æf–ÇFW"†—FVÓÓæ—FVÒçG—RÓÒw7Fö6²r’ç6÷'B‚†Æ"“Óå7G&–ær†ææÖWÇÆæ–B’æÆö6ÆT6ö×&R…7G&–ær†"ææÖWÇÆ"æ–B’Âw'Rr’“°¢Ð¢gVæ7F–öâv4–çfVçF÷'•G—TÆ&VÅcc‚†—FVÒÒ·Ò’°¢6öç7BG—RÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ’çG—S°¢&WGW&â‡·vVöã¢}	í=mRrÇ6†–VÆC¢}
-²rÆw&VæFS¢}	=Ý-²rÇGW'&WC¢}
-=]½‚rÆG&öæS¢}	MíÝ²rÆ&Ö÷#¢}	íÝòrÆ&6·6³¢}
í­}¢rÆ–×ÆçC¢}	Íý½Ý"rÇ7Fö6³¢}	­m‚rÆÖÖó¢}	ý-íÝ²rÆvV#¢}
Ýým]ÝRwÒ•·G—UÒÇÂ}
Ýým]ÝRs°¢Ð¢gVæ7F–öâv4–çfVçF÷'•&VE7FFUcc‚†6öçF–æW"’°¢6öç7B†–FFVâÒ6öçF–æW#òçVW'•6VÆV7F÷#òâ‚u¶æÖSÒ'v4–çfVçF÷'•7FFUcc‚%Òr“°¢G'’²&WGW&âv4–çfVçF÷'•7FFUcc‚„¥4ôâç'6R††–FFVãòçfÇVRÇÂw·Òr’“²Ò6F6‚²&WGW&âv4–çfVçF÷'•7FFUcc‚‡·Ò“²Ð¢Ð¢gVæ7F–öâv4–çfVçF÷'•w&—FU7FFUcc‚†6öçF–æW"Â7FFR’°¢6öç7B†–FFVâÒ6öçF–æW#òçVW'•6VÆV7F÷#òâ‚u¶æÖSÒ'v4–çfVçF÷'•7FFUcc‚%Òr“°¢–b††–FFVâ’†–FFVâçfÇVRÒ¥4ôâç7G&–æv–g’‡v4–çfVçF÷'•7FFUcc‚‡7FFR’“°¢Ð¢gVæ7F–öâv4–çfVçF÷'•6Æ÷DÖ&·Wcc‚‡W6W"Â6Æ÷EG—RÂ6Æ÷D–æFW‚ÒÓ’°¢6öç7B—FVÔ–BÒvWE6Æ÷D—FVÕccr‡W6W"Â6Æ÷EG—RÂ6Æ÷D–æFW‚“°¢6öç7B—FVÒÒ—FVÔ–Bò—FVÔf÷$–çfVçF÷'•ccr†—FVÔ–B’¢çVÆÃ°¢&WGW&âÆF—b6Æ73Ò'v2Ö–çfVçF÷'’×6Æ÷B×cc‚G¶—FVÒòvf–ÆÆVBr¢rwÒ"FF×v2Ö–çfVçF÷'’×6Æ÷B×cc‚FF×6Æ÷B×G—SÒ"G·6Æ÷EG—WÒ"FF×6Æ÷BÖ–æFWƒÒ"G·6Æ÷D–æFW‡Ò#à¢ÆF—b6Æ73Ò&–çfVçF÷'’×6Æ÷BÖÆ&VÂ×ccr#âG¶W62‡6Æ÷DÆ&VÅccr‡6Æ÷EG—RÇ6Æ÷D–æFW‚’—ÓÂöF—cà¢G¶—FVÒòÆF—b6Æ73Ò'v2Ö–çfVçF÷'’×6Æ÷BÖ—FVÒ×cc‚"G&vv&ÆSÒ'G'VR"FF×v2Ö–çfVçF÷'’ÖG&r×cc‚FF×6÷W&6SÒ'6Æ÷B"FF×6Æ÷B×G—SÒ"G·6Æ÷EG—WÒ"FF×6Æ÷BÖ–æFWƒÒ"G·6Æ÷D–æFW‡Ò"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò#âG·&VæFW%F‡VÖ"†—FVÒÇ·6—¦S¢w6ÒrÇG—S¢v—FVÒrÆvÇ—ƒ¦–æ—F–Ç2†—FVÒææÖRÂ~)j2r—Ò—ÓÇ7ãâG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂ÷7ããÂöF—cæ¢sÆF—b6Æ73Ò&–çfVçF÷'’×6Æ÷BÖV×G’×ccr#í	ý]]--Rý]MÍ]#ÂöF—câwÐ¢ÂöF—cæ°¢Ð¢gVæ7F–öâv4–çfVçF÷'”w&–DÖ&·Wcc‚‡W6W"’°¢6öç7BÆ–÷WBÒ'V–ÆD–çfVçF÷'”Æ–÷WEccr‡W6W"“°¢6öç7B6VÆÇ2Ò'&’æg&öÒ‡¶ÆVæwFƒ¦Æ–÷WBç6—¦WÒÂ…òÆ–æFW‚“ÓæÆF—b6Æ73Ò&–çfVçF÷'’Öw&–BÖ6VÆÂ×ccr"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G²†–æFW‚VÆ–÷WBæ6öÇ2’³Ó¶w&–B×&÷s¢G´ÖF‚æfÆö÷"†–æFW‚öÆ–÷WBæ6öÇ2’³Ò"FFÖ6VÆÂÖ–æFWƒÒ"G¶–æFW‡Ò#ãÂöF—cæ’æ¦ö–â‚rr“°¢6öç7BF–ÆW2ÒÆ–÷WBæ–ç7Fæ6W2æÖ†–ç7Fæ6SÓæÆF—b6Æ73Ò&–çfVçF÷'’×F–ÆR×ccrv2Ö–çfVçF÷'’×F–ÆR×cc‚"G&vv&ÆSÒ'G'VR"FF×v2Ö–çfVçF÷'’ÖG&r×cc‚FF×6÷W&6SÒ&w&–B"FFÖ—FVÒÖ–CÒ"G¶W62†–ç7Fæ6Ræ—FVÔ–B—Ò"FF×Væ—BÖ–æFWƒÒ"G¶–ç7Fæ6RçVæ—D–æFW‡Ò"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–ç7Fæ6Rç÷2ç‚³Ò÷7âG¶–ç7Fæ6RçwÓ¶w&–B×&÷s¢G¶–ç7Fæ6Rç÷2ç’³Ò÷7âG¶–ç7Fæ6Ræ‡Ò"F—FÆSÒ"G¶W62†–ç7Fæ6Ræ—FVÒææÖWÇÆ–ç7Fæ6Ræ—FVÔ–B—Ò+rG¶–ç7Fæ6RçwÜ9rG¶–ç7Fæ6Ræ‡Ò+rG¶—FVÔÖ75ccr†–ç7Fæ6Ræ—FVÒ—Ò-]#âG·&VæFW%F‡VÖ"†–ç7Fæ6Ræ—FVÒÇ·6—¦S¢w6ÒrÇG—S¢v—FVÒrÆvÇ—ƒ¦–æ—F–Ç2†–ç7Fæ6Ræ—FVÒææÖRÂ~)j2r—Ò—ÓÇ7ãâG¶W62†–ç7Fæ6Ræ—FVÒææÖWÇÆ–ç7Fæ6Ræ—FVÔ–B—ÓÂ÷7ããÇ6ÖÆÃâG¶–ç7Fæ6RçwÜ9rG¶–ç7Fæ6Ræ‡ÒG´çVÖ&W"†–ç7Fæ6RçG—ÇÃ“ãö+r9rG¶–ç7Fæ6RçG—Ö¢rwÓÂ÷6ÖÆÃãÂöF—cæ’æ¦ö–â‚rr“°¢6öç7B÷fW&fÆ÷rÒÆ–÷WBæ÷fW&fÆ÷ræÆVæwF‚òÆF—b6Æ73Ò&–çfVçF÷'’Ö÷fW&fÆ÷r×ccr#ãÆ#í	ÝRýíÍ]]-ó¢G¶Æ–÷WBæ÷fW&fÆ÷ræÆVæwF‡ÓÂö#âG¶Æ–÷WBæ÷fW&fÆ÷ræÖ†–ç7Fæ6SÓæÇ7ãâG¶W62†–ç7Fæ6Ræ—FVÒææÖWÇÆ–ç7Fæ6Ræ—FVÔ–B—Ò‚G¶–ç7Fæ6RçwÜ9rG¶–ç7Fæ6Ræ‡Ò“Â÷7ãæ’æ¦ö–â‚rr—ÓÂöF—cæ¢rs°¢&WGW&âÆF—b6Æ73Ò&–çfVçF÷'’Öw&–B×ccrv2Ö–çfVçF÷'’Öw&–B×cc‚"FF×v2Ö–çfVçF÷'’Öw&–B×cc‚7G–ÆSÒ"ÒÖ–çbÖ6öÇ3¢G¶Æ–÷WBæ6öÇ7Ó²ÒÖ–çb×&÷w3¢G¶Æ–÷WBç&÷w7Ò#âG¶6VÆÇ7ÒG·F–ÆW7ÓÂöF—câG¶÷fW&fÆ÷wÖ°¢Ð¢gVæ7F–öâv4–çfVçF÷'•7FvTÖ&·Wcc‚‡&u7FFRÒ·Ò’°¢6öç7BW6W"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡&u7FFR“°¢6öç7BÆ–÷WBÒ'V–ÆD–çfVçF÷'”Æ–÷WEccr‡W6W"“°¢6öç7Bö67W–VD6VÆÇ2Ò²ââæÆ–÷WBæ–ç7Fæ6W2ÂââæÆ–÷WBæ÷fW&fÆ÷uÒç&VGV6R‚‡7VÒÆ—FVÒ“Óç7VÒ¶—FVÒçr¦—FVÒæ‚Ã“°¢6öç7B÷fW'vV–v‡BÒÆ–÷WBçvV–v‡BâW6W"æ6''•vV–v‡DÖ‚²RÓ“°¢6öç7BVçF—G•&÷w2Ò‡W6W"æ–çfVçF÷'’ÇÂµÒ’æf–ÇFW"‡&÷sÓæ–çDæöäæVvF—fUccr‡&÷sòçG’Ã“ã’æÖ‡&÷sÓç¶6öç7B—FVÓÖ—FVÔf÷$–çfVçF÷'•ccr‡&÷ræ—FVÔ–B“·&WGW&âÆÆ&VÂ6Æ73Ò'v2Ö–çfVçF÷'’×VçF—G’×&÷r×c#’#ãÇ7ããÆ#âG¶W62†—FVÒææÖWÇÇ&÷ræ—FVÔ–B—ÓÂö#ãÇ6ÖÆÃâG¶W62‡v4–çfVçF÷'•G—TÆ&VÅcc‚†—FVÒ’—ÓÂ÷6ÖÆÃãÂ÷7ããÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"FF×v2Ö–çfVçF÷'’×G’×c#’FFÖ—FVÒÖ–CÒ"G¶W62‡&÷ræ—FVÔ–B—Ò"fÇVSÒ"G¶–çDæöäæVvF—fUccr‡&÷rçG’Ã—Ò"&–ÖÆ&VÃÒ-	­í½}]--âG¶W62†—FVÒææÖWÇÇ&÷ræ—FVÔ–B—Ò"óãÂöÆ&VÃæ·Ò’æ¦ö–â‚rr“°¢&WGW&âÆF—b6Æ73Ò&–çfVçF÷'’Ö66—G’Ö&"×ccr#ãÇ7ãí	Ý-]Ý-ÂÆ#âG¶ö67W–VD6VÆÇ7ÒòG·W6W"æ–çfVçF÷'•6—¦WÓÂö#â­½]-í£Â÷7ããÇ7â6Æ73Ò"G¶÷fW'vV–v‡Còv–çfVçF÷'’ÖÆ–Ö—BÖW†6VVFVB×ccrs¢rwÒ#í	-]Æ#âG¶Æ–÷WBçvV–v‡BçFôf—†VBƒ—ÒòG´çVÖ&W"‡W6W"æ6''•vV–v‡DÖ‚’çFôf—†VBƒ—ÓÂö#ãÂ÷7ããÇ7ãí	Íý½Ý-²Æ#âG·W6W"æ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ’æÆVæwF‡ÒòG·W6W"æ–×ÆçE6Æ÷D6÷VçGÓÂö#ãÂ÷7ããÂöF—cà¢ÆF—b6Æ73Ò&–çfVçF÷'’ÖWV—ÖVçB×6Æ÷G2×ccrv2Ö–çfVçF÷'’ÖWV—ÖVçB×6Æ÷G2×cc‚#âG·v4–çfVçF÷'•6Æ÷DÖ&·Wcc‚‡W6W"Âw&–Ö'•vVöâr—ÒG·v4–çfVçF÷'•6Æ÷DÖ&·Wcc‚‡W6W"Âw6V6öæF'•vVöâr—ÒG·v4–çfVçF÷'•6Æ÷DÖ&·Wcc‚‡W6W"Âv&Ö÷"r—ÒG·v4–çfVçF÷'•6Æ÷DÖ&·Wcc‚‡W6W"Âv&6·6²r—ÒG´'&’æg&öÒ‡¶ÆVæwFƒ§W6W"æ–×ÆçE6Æ÷D6÷VçGÒÂ…òÆ’“Óçv4–çfVçF÷'•6Æ÷DÖ&·Wcc‚‡W6W"Âv–×ÆçBrÆ’’’æ¦ö–â‚rr—ÓÂöF—cà¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR"7G–ÆSÒ&Ö&v–â×F÷£G‚#í	Ý-]Ý-Âý]íÝmÂöF—câG·v4–çfVçF÷'”w&–DÖ&·Wcc‚‡W6W"—Ð¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR"7G–ÆSÒ&Ö&v–â×F÷£G‚#í	­í½}]--âý]MÍ]-í#ÂöF—cãÆF—b6Æ73Ò'v2Ö–çfVçF÷'’×VçF—F–W2×c#’#âG·VçF—G•&÷w7ÇÂsÇ7â6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý-]Ý-Âý="ãÂ÷7ãâwÓÂöF—cà¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR"7G–ÆSÒ&Ö&v–â×F÷£G‚#í	Mí­=Í]Ý-²‚ý]MÍ]-²]r-]ý}Í]ÂöF—cãÆF—b6Æ73Ò'Fw2#âG²†Æ–÷WBçFW‡GÇÅµÒ’æÖ‡&÷sÓæÇ7â6Æ73Ò'Frv2Ö–çfVçF÷'’×FW‡BÖ—FVÒ×c2"G&vv&ÆSÒ'G'VR"FF×v2Ö–çfVçF÷'’ÖG&r×cc‚FF×6÷W&6SÒ&w&–B"FFÖ—FVÒÖ–CÒ"G¶W62‡&÷ræ—FVÔ–B—Ò"FF×Væ—BÖ–æFWƒÒ#"F—FÆSÒ-	ý]]--R"í’ý=²Â}-í²=M½-ÂíMÒÝ­}]Íý½ý#âG¶W62‡&÷ræ—FVÒææÖWÇÇ&÷ræ—FVÔ–B—ÒG´çVÖ&W"‡&÷rçG—ÇÃ“ãö9rG·&÷rçG—Ö¢rwÓÂ÷7ãæ’æ¦ö–â‚rr—ÇÂsÇ7â6Æ73Ò'6ÖÆÂÖæ÷FR#í	Ý]"-­Rý]MÍ]-í"ãÂ÷7ãâwÓÂöF—cæ°¢Ð¢gVæ7F–öâv4–çfVçF÷'”VF—F÷$Ö&·Wcc‚‡&uW6W"Ò·Ò’°¢6öç7B7FFRÒv4–çfVçF÷'•7FFUcc‚‡&uW6W"“°¢6öç7BööÂÒv4–çfVçF÷'”—FV×5cc‚‚’æÖ†—FVÓÓç¶6öç7B6—¦SÖ—FVÕ6—¦Uccr†—FVÒ“·&WGW&âÆF—b6Æ73Ò'v2Ö–çfVçF÷'’×ööÂÖ—FVÒ×cc‚"G&vv&ÆSÒ'G'VR"FF×v2Ö–çfVçF÷'’ÖG&r×cc‚FF×6÷W&6SÒ'ööÂ"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"FF×6V&6ƒÒ"G¶W62†G¶—FVÒææÖWÇÆ—FVÒæ–GÒG¶—FVÒæ–GÒG¶—FVÒçG—WÇÂrwÒG·v4–çfVçF÷'•G—TÆ&VÅcc‚†—FVÒ—ÒG²†—FVÒçFw7ÇÅµÒ’æ¦ö–â‚rr—ÖçFôÆ÷vW$66R‚’—Ò#âG·&VæFW%F‡VÖ"†—FVÒÇ·6—¦S¢w6ÒrÇG—S¢v—FVÒrÆvÇ—ƒ¦–æ—F–Ç2†—FVÒææÖRÂ~)j2r—Ò—ÓÇ7ããÆ#âG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂö#ãÇ6ÖÆÃâG¶W62‡v4–çfVçF÷'•G—TÆ&VÅcc‚†—FVÒ’—Ò+rG·6—¦RçwÜ9rG·6—¦Ræ‡Ò+rG¶—FVÔÖ75ccr†—FVÒ—Ò-]Â÷6ÖÆÃãÂ÷7ããÂöF—cæ·Ò’æ¦ö–â‚rr“°¢&WGW&âÇ6V7F–öâ6Æ73Ò'v2Ö–çfVçF÷'’ÖVF—F÷"×cc‚"FF×v2Ö–çfVçF÷'’ÖVF—F÷"×ccƒãÇFW‡F&VæÖSÒ'v4–çfVçF÷'•7FFUcc‚"†–FFVãâG¶W62„¥4ôâç7G&–æv–g’‡7FFR’—ÓÂ÷FW‡F&VãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í
]M­-íÝ-]Ý-óÂöF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	ý]]--Rý]MÍ]"rí]=âý=½"Ý-]Ý-Â½‚ýíM]íMý’½í"â
}-í²=M½-ÂíMÒÝ­}]Íý½ýÂý]]--R]=âí-Ýâ"í’ý=²ãÂöF—cãÆF—b6Æ73Ò'v2Ö–çfVçF÷'’ÖÆ–÷WB×cc‚#ãÆ6–FR6Æ73Ò'v2Ö–çfVçF÷'’×ööÂ×cc‚"FF×v2Ö–çfVçF÷'’×ööÂÖG&÷×ccƒãÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	í’ý=²ý]MÍ]-í#ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ'6V&6‚"FF×v2Ö–çfVçF÷'’×ööÂ×6V&6‚×cc‚Æ6V†öÆFW#Ò-	ýí¢ý]MÍ]-"óãÂöF—cãÆF—b6Æ73Ò'v2Ö–çfVçF÷'’×ööÂÖÆ—7B×cc‚#âG·ööÂÇÂsÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	"v÷&ÆB6öæf–r]Ý]"ý]MÍ]-í"ãÂöF—câwÓÂöF—cãÆF—b6Æ73Ò'v2Ö–çfVçF÷'’×ööÂ×&VÖ÷fR×cc‚#í	ý]]--RíMý]MÍ]"ý]íÝmÂ}-í²=M½-ÃÂöF—cãÂö6–FSãÆF—b6Æ73Ò'v2Ö–çfVçF÷'’×7FvR×cc‚"FF×v2Ö–çfVçF÷'’×7FvR×ccƒâG·v4–çfVçF÷'•7FvTÖ&·Wcc‚‡7FFR—ÓÂöF—cãÂöF—cãÂ÷6V7F–öãæ°¢Ð¢gVæ7F–öâv4–çfVçF÷'•&VæFW%7FvUcc‚†6öçF–æW"Â7FFR’°¢6öç7Bæ÷&ÖÆ—¦VBÒv4–çfVçF÷'•7FFUcc‚‡7FFR“°¢v4–çfVçF÷'•w&—FU7FFUcc‚†6öçF–æW"Âæ÷&ÖÆ—¦VB“°¢6öç7B7FvRÒ6öçF–æW"çVW'•6VÆV7F÷"‚u¶FF×v2Ö–çfVçF÷'’×7FvR×cc…Òr“°¢–b‡7FvR’7FvRæ–ææW$…DÔÂÒv4–çfVçF÷'•7FvTÖ&·Wcc‚†æ÷&ÖÆ—¦VB“°¢Ð¢gVæ7F–öâv4–çfVçF÷'”FEG•cc‚‡7FFRÂ—FVÔ–BÂG’Ò’°¢ÆWBVçG'’Ò‡7FFRæ–çfVçF÷'’ÇÃÒµÒ’æf–æB‡&÷sÓå7G&–ær‡&÷ræ—FVÔ–B“ÓÓÕ7G&–ær†—FVÔ–B’“°¢–b‚VçG'’’²VçG'“×¶—FVÔ–C¥7G&–ær†—FVÔ–B’ÇG“£Ç÷6—F–öç3¥µ×Ó²7FFRæ–çfVçF÷'’çW6‚†VçG'’“²Ð¢VçG'’ç÷6—F–öç2Ò'&’æ—4'&’†VçG'’ç÷6—F–öç2’òVçG'’ç÷6—F–öç2¢µÓ°¢VçG'’çG’Ò–çDæöäæVvF—fUccr†VçG'’çG’Ã’²ÖF‚æÖ‚ƒÆ–çDæöäæVvF—fUccr‡G’Ã’“°¢v†–ÆR†VçG'’ç÷6—F–öç2æÆVæwF‚ÂVçG'’çG’’VçG'’ç÷6—F–öç2çW6‚†çVÆÂ“°¢&WGW&âVçG'“°¢Ð¢gVæ7F–öâv4–çfVçF÷'•&VÖ÷fUVæ—Ecc‚‡7FFRÂ—FVÔ–BÂVæ—D–æFW‚ÒÓÂg&öÕ6Æ÷BÒfÇ6R’°¢6öç7BVçG'’Ò‡7FFRæ–çfVçF÷'’ÇÂµÒ’æf–æB‡&÷sÓå7G&–ær‡&÷ræ—FVÔ–B“ÓÓÕ7G&–ær†—FVÔ–B’“°¢–b‚VçG'’ÇÂ–çDæöäæVvF—fUccr†VçG'’çG’Ã’ÃÒ’&WGW&âfÇ6S°¢VçG'’ç÷6—F–öç2Ò'&’æ—4'&’†VçG'’ç÷6—F–öç2’òVçG'’ç÷6—F–öç2¢µÓ°¢–b†g&öÕ6Æ÷B’VçG'’ç÷6—F–öç2ç6†–gB‚“°¢VÇ6R–b‡Væ—D–æFW‚ãÒbbVæ—D–æFW‚ÂVçG'’ç÷6—F–öç2æÆVæwF‚’VçG'’ç÷6—F–öç2ç7Æ–6R‡Væ—D–æFW‚Ã“°¢VÇ6RVçG'’ç÷6—F–öç2ç÷‚“°¢VçG'’çG’ÒÖF‚æÖ‚ƒÆ–çDæöäæVvF—fUccr†VçG'’çG’Ã’Ó“°¢–b‚VçG'’çG’’7FFRæ–çfVçF÷'’Ò7FFRæ–çfVçF÷'’æf–ÇFW"‡&÷sÓç&÷rÓÖVçG'’“°¢&WGW&âG'VS°¢Ð¢gVæ7F–öâv4–çfVçF÷'”6ÆöæTæEfÆ–FFUcc‚‡7FFR’°¢6öç7Bæ÷&ÖÆ—¦VBÒv4–çfVçF÷'•7FFUcc‚‡7FFR“°¢6öç7BÆ–÷WBÒ'V–ÆD–çfVçF÷'”Æ–÷WEccr†æ÷&ÖÆ—¦VB“°¢–b†Æ–÷WBçvV–v‡Bâæ÷&ÖÆ—¦VBæ6''•vV–v‡DÖ‚²RÓ’’F‡&÷ræWrW'&÷"†	ý]-½]Òý]]ÝíÍ½’-]¢G¶Æ–÷WBçvV–v‡BçFôf—†VBƒ—ÒòG¶æ÷&ÖÆ—¦VBæ6''•vV–v‡DÖ‡Ö“°¢–b†Æ–÷WBæ÷fW&fÆ÷ræÆVæwF‚’F‡&÷ræWrW'&÷"‚}	ý]MÍ]-²ÝRýíÍ]í-ò"}MÝÝ½’}Í]Ý-]Ý-òâr“°¢&WGW&âæ÷&ÖÆ—¦VC°¢Ð ¢6öç7Bõ÷&VæFW%Æ–W$VF—F÷%cc‚Ò6öæf–wW&F÷"ç&VæFW%Æ–W$VF—F÷"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW%Æ–W$VF—F÷"ÒgVæ7F–öâ‡&uW6W"’°¢6öç7BW6W"Òæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡&uW6W"“°¢ÆWB‡FÖÂÒõ÷&VæFW%Æ–W$VF—F÷%cc‚‡W6W"“°¢6öç7B'WGFöâÒsÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#å4dUõÄ”U#Âö'WGFöãâs°¢–b†‡FÖÂæ–æ6ÇVFW2†'WGFöâ’’‡FÖÂÒ‡FÖÂç&WÆ6R†'WGFöâÂG·v4–çfVçF÷'”VF—F÷$Ö&·Wcc‚‡W6W"—ÒG¶'WGFöçÖ“°¢&WGW&â‡FÖÃ°¢Ó° ¢6öç7Bõö6öæf–u&VæFW%cc‚Ò6öæf–wW&F÷"ç&VæFW"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW"ÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒõö6öæf–u&VæFW%cc‚‚“°¢–b‡F†—2ç6VÆV7FVEG—RÓÓÒwÆ–W'2r’°¢6öç7Bf÷&ÒÒFö7VÖVçBævWDVÆVÖVçD'”–B‚v6öæf–rÖVF—F÷"Öf÷&Òr“°¢–b†f÷&Ò’°¢²w&–Ö'•vVöârÂw6V6öæF'•vVöârÂv&Ö÷"uÒæf÷$V6‚†æÖSÓæf÷&ÒçVW'•6VÆV7F÷"†¶æÖSÒ"G¶æÖWÒ%Ö“òæ6Æ÷6W7B‚ræf–VÆBr“òæ6Æ74Æ—7BæFB‚wv2Ö–çfVçF÷'’ÖÆVv7’Ö†–FFVâ×cc‚r’“°¢f÷&ÒçVW'•6VÆV7F÷"‚ræ–×ÆçB×6Æ÷BÖVF—F÷"×ccrr“òæ6Æ74Æ—7BæFB‚wv2Ö–çfVçF÷'’ÖÆVv7’Ö†–FFVâ×cc‚r“°¢'&’æg&öÒ†f÷&ÒçVW'•6VÆV7F÷$ÆÂ‚ræf–VÆBâÆ&VÂr’’æf÷$V6‚†Æ&VÃÓç°¢6öç7BFW‡CÖÆ&VÂçFW‡D6öçFVçCòçG&–Ò‚—ÇÂrs°¢–b‡FW‡BÓÓÒ}	Ý-]Ý-ÂrÇÂFW‡Bç7F'G5v—F‚‚}	Íý½Ý-²‚r’’Æ&VÂæ6Æ÷6W7B‚ræf–VÆBr“òæ6Æ74Æ—7BæFB‚wv2Ö–çfVçF÷'’ÖÆVv7’Ö†–FFVâ×cc‚r“°¢Ò“°¢Ð¢Ð¢&WGW&â&W7VÇC°¢Ó° ¢6öç7Bõö6öÆÆV7DVçF—G•cc‚Ò6öæf–wW&F÷"æ6öÆÆV7DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ6öÆÆV7DVçF—G’ÒgVæ7F–öâ‡G—RÂf÷&ÔVÂÂf÷&ÔFFÒæWrf÷&ÔFF†f÷&ÔVÂ’’°¢6öç7BVçF—G’Òõö6öÆÆV7DVçF—G•cc‚‡G—RÂf÷&ÔVÂÂf÷&ÔFF“°¢–b‡G—RÓÒwÆ–W'2rÇÂVçF—G’’&WGW&âVçF—G“°¢6öç7B&rÒ7G&–ær†f÷&ÔFFævWB‚wv4–çfVçF÷'•7FFUcc‚r’ÇÂrr’çG&–Ò‚“°¢–b‚&r’&WGW&âVçF—G“°¢G'’°¢6öç7B7FFRÒv4–çfVçF÷'•7FFUcc‚„¥4ôâç'6R‡&r’“°¢VçF—G’æ–çfVçF÷'’ÒFVW‡7FFRæ–çfVçF÷'’“°¢VçF—G’æWV—ÖVçE6Æ÷G2ÒFVW‡7FFRæWV—ÖVçE6Æ÷G2“°¢VçF—G’æ–×ÆçE6Æ÷D6÷VçBÒ7FFRæ–×ÆçE6Æ÷D6÷VçC°¢VçF—G’æ–×ÆçE6Æ÷G2ÒFVW‡7FFRæ–×ÆçE6Æ÷G2“°¢VçF—G’æ–ç7FÆÆVD–×ÆçD–G2Ò7FFRæ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ“°¢VçF—G’æ–çfVçF÷'•6—¦RÒ–çDæöäæVvF—fUccr†f÷&ÔFFævWB‚v–çfVçF÷'•6—¦Rr’Â7FFRæ–çfVçF÷'•6—¦R“°¢VçF—G’æ6''•vV–v‡DÖ‚ÒçVÔæöäæVvF—fUccr†f÷&ÔFFævWB‚v6''•vV–v‡DÖ‚r’Â7FFRæ6''•vV–v‡DÖ‚“°¢&WGW&âæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"†VçF—G’“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚ut2–çfVçF÷'’VF—F÷"7FFR'6Rf–ÆVBrÂW'&÷"“°¢&WGW&âVçF—G“°¢Ð¢Ó° ¢ò¢cããc“¢t2–çfVçF÷'’w&—FW2W6RF†R—6öÆFVBÆ–W"F6‚6†ææVÂ–ÖÖVF–FVÇ’â¢ð¢6öç7Bv4–çfVçF÷'•&VÇF–ÖUVWVW5cc’ÒæWrÖ‚“°¢6öç7Bv4–çfVçF÷'•&VÇF–ÖTÆFW7Ecc’ÒæWrÖ‚“°¢ÆWBv4–çfVçF÷'•&VÇF–ÖU6Wcc’Ò°¢gVæ7F–öâv4–çfVçF÷'•F&vWEÆ–W$–Ecc’†VF—F÷"’°¢–b„6öæf–wW&F÷"ç6VÆV7FVEG—RÓÒwÆ–W'2r’&WGW&ârs°¢6öç7B6VÆV7FVBÒ6öæf–wW&F÷"ævWE6VÆV7FVDVçF—G“òâ‚“°¢&WGW&â7G&–ær‡6VÆV7FVCòæ–BÇÂ6öæf–wW&F÷"ç6VÆV7FVD–BÇÂrr’çG&–Ò‚“°¢Ð¢gVæ7F–öâv4–çfVçF÷'•7FFTg&öÔVF—F÷%cc’†VF—F÷"Â7FFRÒçVÆÂ’°¢6öç7BæW‡BÒv4–çfVçF÷'•7FFUcc‚‡7FFRÇÂv4–çfVçF÷'•&VE7FFUcc‚†VF—F÷"’“°¢6öç7Bf÷&ÒÒVF—F÷#òæ6Æ÷6W7Còâ‚r66öæf–rÖVF—F÷"Öf÷&Òr“°¢–b†f÷&Ò’°¢æW‡Bæ–çfVçF÷'•6—¦RÒ–çDæöäæVvF—fUccr†f÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ&–çfVçF÷'•6—¦R%Òr“òçfÇVRÂæW‡Bæ–çfVçF÷'•6—¦R“°¢æW‡Bæ6''•vV–v‡DÖ‚ÒçVÔæöäæVvF—fUccr†f÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ&6''•vV–v‡DÖ‚%Òr“òçfÇVRÂæW‡Bæ6''•vV–v‡DÖ‚“°¢æW‡Bæ–×ÆçE6Æ÷D6÷VçBÒ–çDæöäæVvF—fUccr†f÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ&–×ÆçE6Æ÷D6÷VçB%Òr“òçfÇVRÂæW‡Bæ–×ÆçE6Æ÷D6÷VçB“°¢æW‡Bæ–×ÆçE6Æ÷G2Ò'&’æg&öÒ‡²ÆVæwFƒ¢æW‡Bæ–×ÆçE6Æ÷D6÷VçBÒÂ…òÂ’’Óâ7G&–ær†æW‡Bæ–×ÆçE6Æ÷G3òå¶•ÒÇÂrr’“°¢Ð¢&WGW&âv4–çfVçF÷'•7FFUcc‚†æW‡B“°¢Ð¢gVæ7F–öâv4–çfVçF÷'•F6…cc’‡7FFR’°¢6öç7Bæ÷&ÖÆ—¦VBÒv4–çfVçF÷'•7FFUcc‚‡7FFR“°¢&WGW&â°¢–çfVçF÷'“¢FVW†æ÷&ÖÆ—¦VBæ–çfVçF÷'’’À¢WV—ÖVçE6Æ÷G3¢FVW†æ÷&ÖÆ—¦VBæWV—ÖVçE6Æ÷G2’À¢–×ÆçE6Æ÷G3¢FVW†æ÷&ÖÆ—¦VBæ–×ÆçE6Æ÷G2’À¢–ç7FÆÆVD–×ÆçD–G3¢æ÷&ÖÆ—¦VBæ–×ÆçE6Æ÷G2æf–ÇFW"„&ööÆVâ’À¢–çfVçF÷'•6—¦S¢æ÷&ÖÆ—¦VBæ–çfVçF÷'•6—¦RÀ¢6''•vV–v‡DÖƒ¢æ÷&ÖÆ—¦VBæ6''•vV–v‡DÖ‚À¢–×ÆçE6Æ÷D6÷VçC¢æ÷&ÖÆ—¦VBæ–×ÆçE6Æ÷D6÷Vç@¢Ó°¢Ð¢gVæ7F–öâv4–çfVçF÷'”Ç”Æö6Åcc’‡Æ–W$–BÂ7FFR’°¢6öç7B&6RÒç7FFSòçW6W'3òå·Æ–W$–EÒÇÂÄ”U%õDTÕÄDU3òå·Æ–W$–EÓ°¢–b‚&6R’&WGW&âçVÆÃ°¢6öç7BF6‚Òv4–çfVçF÷'•F6…cc’‡7FFR“°¢6öç7BÖW&vVBÒæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡²ââæFVW†&6R’ÂââæFVW‡F6‚’Â–C¢Æ–W$–BÒ“°¢ç7FFRçW6W'5·Æ–W$–EÒÒÖW&vVC°¢Ä”U%õDTÕÄDU5·Æ–W$–EÒÒFVW†ÖW&vVB“°¢&WGW&âÖW&vVC°¢Ð¢gVæ7F–öâv4–çfVçF÷'•&Vg&W6„VF—F÷$g&öÕÆ–W%cc’‡Æ–W$–B’°¢–b„6öæf–wW&F÷"ç6VÆV7FVEG—RÓÒwÆ–W'2rÇÂ7G&–ær„6öæf–wW&F÷"ç6VÆV7FVD–BÇÂrr’ÓÒ7G&–ær‡Æ–W$–BÇÂrr’’&WGW&ã°¢–b…Æ–W%7–æ2å÷VæF–æuc3Ræ†2…7G&–ær‡Æ–W$–BÇÂrr’’’&WGW&ã°¢6öç7BVF—F÷"ÒFö7VÖVçBçVW'•6VÆV7F÷"‚r66öæf–rÖVF—F÷"Öf÷&Ò¶FF×v2Ö–çfVçF÷'’ÖVF—F÷"×cc…Òr“°¢6öç7BÆ–W"Òç7FFSòçW6W'3òå·Æ–W$–EÒÇÂÄ”U%õDTÕÄDU3òå·Æ–W$–EÓ°¢–b‚VF—F÷"ÇÂÆ–W"’&WGW&ã°¢6öç7Bæ÷&ÖÆ—¦VBÒv4–çfVçF÷'•7FFUcc‚‡Æ–W"“°¢6öç7Bf÷&ÒÒVF—F÷"æ6Æ÷6W7B‚r66öæf–rÖVF—F÷"Öf÷&Òr“°¢–b†f÷&Ò’°¢6öç7Bf–VÆG2Ò°¢–çfVçF÷'•6—¦S¢æ÷&ÖÆ—¦VBæ–çfVçF÷'•6—¦RÀ¢6''•vV–v‡DÖƒ¢æ÷&ÖÆ—¦VBæ6''•vV–v‡DÖ‚À¢–×ÆçE6Æ÷D6÷VçC¢æ÷&ÖÆ—¦VBæ–×ÆçE6Æ÷D6÷Vç@¢Ó°¢f÷"†6öç7B¶æÖRÂfÇVUÒöbö&¦V7BæVçG&–W2†f–VÆG2’’°¢6öç7B–çWBÒf÷&ÒçVW'•6VÆV7F÷"†¶æÖSÒ"G¶æÖWÒ%Ö“°¢–b†–çWBbbFö7VÖVçBæ7F—fTVÆVÖVçBÓÒ–çWB’–çWBçfÇVRÒ7G&–ær‡fÇVR“°¢Ð¢Ð¢v4–çfVçF÷'•&VæFW%7FvUcc‚†VF—F÷"Âæ÷&ÖÆ—¦VB“°¢Ð¢7–æ2gVæ7F–öâv4–çfVçF÷'•W'6—7E&VÇF–ÖUcc’†VF—F÷"Â7FFRÂ÷F–öç2Ò·Ò’°¢6öç7BÆ–W$–C×v4–çfVçF÷'•F&vWEÆ–W$–Ecc’†VF—F÷"“°¢–b‚Æ–W$–BÇÂ„ç7FFSòçW6W'3òå·Æ–W$–E×ÇÅÄ”U%õDTÕÄDU3òå·Æ–W$–EÒ’—&WGW&ç¶ö³§G'VRÇ7FGW3¢væWr×Æ–W"wÓ°¢6öç7Bæ÷&ÖÆ—¦VC×v4–çfVçF÷'•7FFTg&öÔVF—F÷%cc’†VF—F÷"Ç7FFR“°¢v4–çfVçF÷'”Ç”Æö6Åcc’‡Æ–W$–BÆæ÷&ÖÆ—¦VB“°¢6öç7B&W7VÇCÖv—BÆ–W%7–æ2çW6…Æ–W%F6‚‡Æ–W$–BÇv4–çfVçF÷'•F6…cc’†æ÷&ÖÆ—¦VB’Ç¶æ÷F–6S¦çVÆÂÇ&W&VæFW#¦fÇ6WÒ“°¢v4–çfVçF÷'•&Vg&W6„VF—F÷$g&öÕÆ–W%cc’‡Æ–W$–B“·&WGW&â&W7VÇC°¢Ð ¢òòÆ–W"VÆÇ2&RFVÆ–&W&FVÇ’&WfVçFVBg&öÒ&W&VæFW&–ærF†Rv†öÆRt2f÷&Òv†–ÆR—B—0¢òò&V–ærVF—FVBâWFFRöæÇ’—G2–çfVçF÷'’v–FvWB6ò&VÖ÷FR&öf–ÆRG&röG&÷&VÖ–ç2f—6–&ÆRà¢6öç7Bõ÷Æ–W%7–æ4Ç•&VÖ÷FU&÷ucc’ÒÆ–W%7–æ2æÇ•&VÖ÷FU&÷ræ&–æB…Æ–W%7–æ2“°¢Æ–W%7–æ2æÇ•&VÖ÷FU&÷rÒgVæ7F–öâ‡&÷rÒ·ÒÂ÷F–öç2Ò·Ò’°¢6öç7B&W7VÇBÒõ÷Æ–W%7–æ4Ç•&VÖ÷FU&÷ucc’‡&÷rÂ÷F–öç2“°¢6öç7BÆ–W$–BÒ7G&–ær‡&÷rçÆ–W$–BÇÂ&÷rçÆ–W%ö–BÇÂrr’çG&–Ò‚“°¢6öç7BVæF–æs×&öf–ÆT–çfVçF÷'”ÆFW7Ec#ævWB‡Æ–W$–B“°¢–b‡VæF–ær—&öf–ÆT–çfVçF÷'”Ç”Æö6Åc#‡Æ–W$–BÇVæF–ærçF6‚“°¢–b‡Æ–W$–B’v4–çfVçF÷'•&Vg&W6„VF—F÷$g&öÕÆ–W%cc’‡Æ–W$–B“°¢&WGW&â&W7VÇC°¢Ó° ¢ÆWBv4–çfVçF÷'”G&ucc‚ÒçVÆÃ°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&w7F'BrÂWfVçBÓâ°¢6öç7BæöFRÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v2Ö–çfVçF÷'’ÖG&r×cc…Òr“°¢–b‚æöFR’&WGW&ã°¢v4–çfVçF÷'”G&ucc‚Ò²6÷W&6S¥7G&–ær†æöFRæFF6WBç6÷W&6WÇÂrr’Â—FVÔ–C¥7G&–ær†æöFRæFF6WBæ—FVÔ–GÇÂrr’ÂVæ—D–æFWƒ¦–çDæöäæVvF—fUccr†æöFRæFF6WBçVæ—D–æFW‚ÂÓ’Â6Æ÷EG—S¥7G&–ær†æöFRæFF6WBç6Æ÷EG—WÇÂrr’Â6Æ÷D–æFWƒ¤çVÖ&W"†æöFRæFF6WBç6Æ÷D–æFWƒóòÓ’Ó°¢WfVçBæFFG&ç6fW"æVffV7DÆÆ÷vVCÒvÖ÷fRs°¢G'’²WfVçBæFFG&ç6fW"ç6WDFF‚wFW‡B÷Æ–ârÇv4–çfVçF÷'”G&ucc‚æ—FVÔ–B“²Ò6F6‚·Ð¢æöFRæ6Æ74Æ—7BæFB‚v–çfVçF÷'’ÖG&vv–ær×ccrr“°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&vVæBrÂWfVçBÓâ°¢WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v2Ö–çfVçF÷'’ÖG&r×cc…Òr“òæ6Æ74Æ—7Bç&VÖ÷fR‚v–çfVçF÷'’ÖG&vv–ær×ccrr“°¢v4–çfVçF÷'”G&uccƒÖçVÆÃ°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&v÷fW"rÂWfVçBÓâ°¢–b‚v4–çfVçF÷'”G&ucc‚’&WGW&ã°¢–b†WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v2Ö–çfVçF÷'’Öw&–B×cc…ÒÅ¶FF×v2Ö–çfVçF÷'’×6Æ÷B×cc…ÒÅ¶FF×v2Ö–çfVçF÷'’×ööÂÖG&÷×cc…Òr’’²WfVçBç&WfVçDFVfVÇB‚“²WfVçBæFFG&ç6fW"æG&÷VffV7CÒvÖ÷fRs²Ð¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&÷rÂ7–æ2WfVçBÓâ°¢–b‚v4–çfVçF÷'”G&ucc‚’&WGW&ã°¢6öç7BVF—F÷#ÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v2Ö–çfVçF÷'’ÖVF—F÷"×cc…Òr“°¢–b‚VF—F÷"’&WGW&ã°¢6öç7Bw&–CÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v2Ö–çfVçF÷'’Öw&–B×cc…Òr“°¢6öç7B6Æ÷CÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v2Ö–çfVçF÷'’×6Æ÷B×cc…Òr“°¢6öç7BööÃÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v2Ö–çfVçF÷'’×ööÂÖG&÷×cc…Òr“°¢–b‚w&–Bbb6Æ÷BbbööÂ’&WGW&ã°¢WfVçBç&WfVçDFVfVÇB‚“²WfVçBç7F÷&÷vF–öâ‚“°¢6öç7BG&s×²ââçv4–çfVçF÷'”G&ucc‡Ó²v4–çfVçF÷'”G&uccƒÖçVÆÃ°¢G'’°¢6öç7B7FFS×v4–çfVçF÷'•&VE7FFUcc‚†VF—F÷"“°¢7FFRæ–çfVçF÷'•6—¦SÖ–çDæöäæVvF—fUccr†VF—F÷"æ6Æ÷6W7B‚vf÷&Òr“òçVW'•6VÆV7F÷"‚u¶æÖSÒ&–çfVçF÷'•6—¦R%Òr“òçfÇVRÇ7FFRæ–çfVçF÷'•6—¦R“°¢7FFRæ6''•vV–v‡DÖƒÖçVÔæöäæVvF—fUccr†VF—F÷"æ6Æ÷6W7B‚vf÷&Òr“òçVW'•6VÆV7F÷"‚u¶æÖSÒ&6''•vV–v‡DÖ‚%Òr“òçfÇVRÇ7FFRæ6''•vV–v‡DÖ‚“°¢6öç7B&WVW7FVD–×ÆçG3Ö–çDæöäæVvF—fUccr†VF—F÷"æ6Æ÷6W7B‚vf÷&Òr“òçVW'•6VÆV7F÷"‚u¶æÖSÒ&–×ÆçE6Æ÷D6÷VçB%Òr“òçfÇVRÇ7FFRæ–×ÆçE6Æ÷D6÷VçB“°¢7FFRæ–×ÆçE6Æ÷D6÷VçC×&WVW7FVD–×ÆçG3°¢7FFRæ–×ÆçE6Æ÷G3Ô'&’æg&öÒ‡¶ÆVæwFƒ§&WVW7FVD–×ÆçG7ÒÂ…òÆ’“Óå7G&–ær‡7FFRæ–×ÆçE6Æ÷G3òå¶•×ÇÂrr’“° ¢–b‡ööÂ’°¢–b†G&rç6÷W&6SÓÓÒwööÂr’&WGW&ã°¢–b†G&rç6÷W&6SÓÓÒw6Æ÷Br’6WE6Æ÷D—FVÕccr‡7FFRÆG&rç6Æ÷EG—RÆG&rç6Æ÷D–æFW‚Ârr“°¢v4–çfVçF÷'•&VÖ÷fUVæ—Ecc‚‡7FFRÆG&ræ—FVÔ–BÆG&rçVæ—D–æFW‚ÆG&rç6÷W&6SÓÓÒw6Æ÷Br“°¢v4–çfVçF÷'•&VæFW%7FvUcc‚†VF—F÷"Ç7FFR“°¢v—Bv4–çfVçF÷'•W'6—7E&VÇF–ÖUcc’†VF—F÷"Â7FFR“°¢&WGW&ã°¢Ð ¢–b‡6Æ÷B’°¢6öç7BF&vWEG—SÕ7G&–ær‡6Æ÷BæFF6WBç6Æ÷EG—WÇÂrr’ÂF&vWD–æFWƒÔçVÖ&W"‡6Æ÷BæFF6WBç6Æ÷D–æFWƒóòÓ’Â—FVÓÖ—FVÔf÷$–çfVçF÷'•ccr†G&ræ—FVÔ–B“°¢–b‚6Æ÷D66WG4—FVÕccr‡F&vWEG—RÆ—FVÒ’’F‡&÷ræWrW'&÷"‚}
Ý-í"ý]MÍ]"Ý]½Í}ò=-Ýí--Â"-½ÝÝ½’½í"r“°¢–b†G&rç6÷W&6SÓÓÒwööÂr’v4–çfVçF÷'”FEG•cc‚‡7FFRÆG&ræ—FVÔ–BÃ“°¢–b†G&rç6÷W&6SÓÓÒw6Æ÷Br’6WE6Æ÷D—FVÕccr‡7FFRÆG&rç6Æ÷EG—RÆG&rç6Æ÷D–æFW‚Ârr“°¢6öç7B÷væVCÖ—FVÔ÷væVEG•ccr‡7FFRÆG&ræ—FVÔ–B’ÂWV—VCÖWV—VD6÷VçDf÷$—FVÕccr‡7FFRÆG&ræ—FVÔ–B’Â7W'&VçCÖvWE6Æ÷D—FVÕccr‡7FFRÇF&vWEG—RÇF&vWD–æFW‚’ÂÆÆ÷væ6SÖ7W'&VçCÓÓÖG&ræ—FVÔ–Có£°¢–b†÷væVCÃÖWV—VBÖÆÆ÷væ6R’F‡&÷ræWrW'&÷"‚}	Ý]"-ííMÝí=âÝ­}]Íý½ýý]MÍ]-M½òÝ-í=â½í-r“°¢6WE6Æ÷D—FVÕccr‡7FFRÇF&vWEG—RÇF&vWD–æFW‚ÆG&ræ—FVÔ–B“°¢6öç7BfÆ–FFVC×v4–çfVçF÷'”6ÆöæTæEfÆ–FFUcc‚‡7FFR“°¢v4–çfVçF÷'•&VæFW%7FvUcc‚†VF—F÷"ÇfÆ–FFVB“°¢v—Bv4–çfVçF÷'•W'6—7E&VÇF–ÖUcc’†VF—F÷"ÂfÆ–FFVB“°¢&WGW&ã°¢Ð ¢–b†w&–B’°¢6öç7B&V7CÖw&–BævWD&÷VæF–æt6Æ–VçE&V7B‚’Â6öÇ3ÔçVÖ&W"†vWD6ö×WFVE7G–ÆR†w&–B’ævWE&÷W'G•fÇVR‚rÒÖ–çbÖ6öÇ2r’—ÇÃÂ6VÆÃ×&V7Bçv–GF‚ö6öÇ3°¢6öç7BƒÔÖF‚æÖ‚ƒÄÖF‚æÖ–â†6öÇ2ÓÄÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE‚×&V7BæÆVgB’ö6VÆÂ’’’Â“ÔÖF‚æÖ‚ƒÄÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE’×&V7BçF÷’ö6VÆÂ’“°¢ÆWBVæ—D–æFWƒÖG&rçVæ—D–æFWƒ°¢–b†G&rç6÷W&6SÓÓÒwööÂr’²6öç7BVçG'“×v4–çfVçF÷'”FEG•cc‚‡7FFRÆG&ræ—FVÔ–BÃ“²Væ—D–æFWƒÖVçG'’çG’Ó²Ð¢–b†G&rç6÷W&6SÓÓÒw6Æ÷Br’²6WE6Æ÷D—FVÕccr‡7FFRÆG&rç6Æ÷EG—RÆG&rç6Æ÷D–æFW‚Ârr“²Væ—D–æFWƒÖWV—VD6÷VçDf÷$—FVÕccr‡7FFRÆG&ræ—FVÔ–B“²Ð¢–b‡Væ—D–æFWƒÃÇÂ6åÆ6T–çfVçF÷'•Væ—Eccr‡7FFRÆG&ræ—FVÔ–BÇVæ—D–æFW‚Ç‚Ç’’’F‡&÷ræWrW'&÷"‚}	ý]MÍ]"ÝRýíÍ]]-ò"-½ÝÝíRÍ]-âr“°¢6WD–çfVçF÷'•÷6—F–öåccr‡7FFRÆG&ræ—FVÔ–BÇVæ—D–æFW‚Ç·‚Ç—Ò“°¢6öç7BfÆ–FFVC×v4–çfVçF÷'”6ÆöæTæEfÆ–FFUcc‚‡7FFR“°¢v4–çfVçF÷'•&VæFW%7FvUcc‚†VF—F÷"ÇfÆ–FFVB“°¢v—Bv4–çfVçF÷'•W'6—7E&VÇF–ÖUcc’†VF—F÷"ÂfÆ–FFVB“°¢Ð¢Ò6F6‚†W'&÷"’²Fö7Bç6†÷r†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r“²Ð¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v–çWBrÂWfVçBÓâ°¢6öç7B6V&6ƒÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v2Ö–çfVçF÷'’×ööÂ×6V&6‚×cc…Òr“°¢–b‡6V&6‚’°¢6öç7BÕ7G&–ær‡6V&6‚çfÇVWÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢6öç7BVF—F÷#×6V&6‚æ6Æ÷6W7B‚u¶FF×v2Ö–çfVçF÷'’ÖVF—F÷"×cc…Òr“°¢6öç7BFW&×3×ç&WÆ6R‚ýörÂ}Rr’ç7Æ—B‚õÇ2²ò’æf–ÇFW"„&ööÆVâ“°¢VF—F÷#òçVW'•6VÆV7F÷$ÆÃòâ‚rçv2Ö–çfVçF÷'’×ööÂÖ—FVÒ×cc‚r’æf÷$V6‚†æöFSÓç°¢6öç7BFW‡CÕ7G&–ær†æöFRæFF6WBç6V&6‡ÇÂrr’ç&WÆ6R‚ýörÂ}Rr“°¢æöFRæ†–FFVãÒFW&×2æWfW'’‡FW&ÓÓçFW‡Bæ–æ6ÇVFW2‡FW&Ò’“°¢Ò“°¢&WGW&ã°¢Ð¢–b‚²v–çfVçF÷'•6—¦RrÂv6''•vV–v‡DÖ‚rÂv–×ÆçE6Æ÷D6÷VçBuÒæ–æ6ÇVFW2†WfVçBçF&vWCòææÖR’’&WGW&ã°¢6öç7Bf÷&ÓÖWfVçBçF&vWBæ6Æ÷6W7B‚r66öæf–rÖVF—F÷"Öf÷&Òr“°¢6öç7BVF—F÷#Öf÷&ÓòçVW'•6VÆV7F÷#òâ‚u¶FF×v2Ö–çfVçF÷'’ÖVF—F÷"×cc…Òr“°¢–b‚VF—F÷"’&WGW&ã°¢6öç7B7FFS×v4–çfVçF÷'•&VE7FFUcc‚†VF—F÷"“°¢7FFRæ–çfVçF÷'•6—¦SÖ–çDæöäæVvF—fUccr†f÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ&–çfVçF÷'•6—¦R%Òr“òçfÇVRÇ7FFRæ–çfVçF÷'•6—¦R“°¢7FFRæ6''•vV–v‡DÖƒÖçVÔæöäæVvF—fUccr†f÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ&6''•vV–v‡DÖ‚%Òr“òçfÇVRÇ7FFRæ6''•vV–v‡DÖ‚“°¢7FFRæ–×ÆçE6Æ÷D6÷VçCÖ–çDæöäæVvF—fUccr†f÷&ÒçVW'•6VÆV7F÷"‚u¶æÖSÒ&–×ÆçE6Æ÷D6÷VçB%Òr“òçfÇVRÇ7FFRæ–×ÆçE6Æ÷D6÷VçB“°¢7FFRæ–×ÆçE6Æ÷G3Ô'&’æg&öÒ‡¶ÆVæwFƒ§7FFRæ–×ÆçE6Æ÷D6÷VçGÒÂ…òÆ’“Óå7G&–ær‡7FFRæ–×ÆçE6Æ÷G3òå¶•×ÇÂrr’“°¢v4–çfVçF÷'•&VæFW%7FvUcc‚†VF—F÷"Ç7FFR“°¢6ÆV%F–ÖV÷WB†VF—F÷"åõ÷v4–çfVçF÷'•&VÇF–ÖUF–ÖW%cc’“°¢VF—F÷"åõ÷v4–çfVçF÷'•&VÇF–ÖUF–ÖW%cc’Ò6WEF–ÖV÷WB‚‚’Óâ°¢v4–çfVçF÷'•W'6—7E&VÇF–ÖUcc’†VF—F÷"Âv4–çfVçF÷'•&VE7FFUcc‚†VF—F÷"’’æ6F6‚†W'&÷"ÓâFö7Bç6†÷r†W'&÷#òæÖW76vRÇÂ7G&–ær†W'&÷"’ÂvW'"r’“°¢ÒÂ#c“°¢Ò“° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6†ævRrÂ7–æ2WfVçBÓâ°¢6öç7B–çWCÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v2Ö–çfVçF÷'’×G’×c#•Òr“°¢–b‚–çWB—&WGW&ã°¢6öç7BVF—F÷#Ö–çWBæ6Æ÷6W7B‚u¶FF×v2Ö–çfVçF÷'’ÖVF—F÷"×cc…Òr“¶–b‚VF—F÷"—&WGW&ã°¢6öç7B&Vf÷&S×v4–çfVçF÷'•&VE7FFUcc‚†VF—F÷"’Ç7FFS×v4–çfVçF÷'•7FFUcc‚†FVW†&Vf÷&R’’Æ—FVÔ–CÕ7G&–ær†–çWBæFF6WBæ—FVÔ–GÇÂrr’ÇG“Ö–çDæöäæVvF—fUccr†–çWBçfÇVRÃ“°¢G'—°¢6öç7BWV—VCÖWV—VD6÷VçDf÷$—FVÕccr‡7FFRÆ—FVÔ–B“¶–b‡G“ÆWV—VB—F‡&÷ræWrW'&÷"†	Ý]½Í}ò=Í]ÝÍ-Â­í½}]--âÝmR}½Ý­ýí-ÝÝ½RÝ­}]Íý½ýí"‚G¶WV—VGÒ–“°¢ÆWBVçG'“Ò‡7FFRæ–çfVçF÷'—ÇÅµÒ’æf–æB‡&÷sÓå7G&–ær‡&÷ræ—FVÔ–GÇÂrr“ÓÓÖ—FVÔ–B“°¢–b‚VçG'’bgG“ã—¶VçG'“×¶—FVÔ–BÇG“£Ç÷6—F–öç3¥µ×Ó·7FFRæ–çfVçF÷'’çW6‚†VçG'’“·Ð¢–b†VçG'’—¶VçG'’ç÷6—F–öç3Ô'&’æ—4'&’†VçG'’ç÷6—F–öç2“öVçG'’ç÷6—F–öç3¥µÓ¶VçG'’çG“×G“¶–b‡G“ÃÓ—7FFRæ–çfVçF÷'“×7FFRæ–çfVçF÷'’æf–ÇFW"‡&÷sÓç&÷rÓÖVçG'’“¶VÇ6W¶VçG'’ç÷6—F–öç3ÖVçG'’ç÷6—F–öç2ç6Æ–6RƒÇG’“·v†–ÆR†VçG'’ç÷6—F–öç2æÆVæwFƒÇG’–VçG'’ç÷6—F–öç2çW6‚†çVÆÂ“·×Ð¢6öç7BfÆ–FFVC×v4–çfVçF÷'”6ÆöæTæEfÆ–FFUcc‚‡7FFR“·v4–çfVçF÷'•&VæFW%7FvUcc‚†VF—F÷"ÇfÆ–FFVB“¶v—Bv4–çfVçF÷'•W'6—7E&VÇF–ÖUcc’†VF—F÷"ÇfÆ–FFVB“°¢Ö6F6‚†W'&÷"—·v4–çfVçF÷'•&VæFW%7FvUcc‚†VF—F÷"Æ&Vf÷&R“µFö7Bç6†÷r†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r“·Ð¢Ò“° ¢òò¶VWÖ&¶WBW&6†6W2v—F†–âF†R6öæf–wW&VBvV–v‡BæBw&–B66—G’à¢6öç7Bö'6W'fW%ccrÒæWr×WFF–öäö'6W'fW"‚‚’Óâ°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚r6Ö&¶WBÖ—FV×2æ'W’Ö'Fã¦æ÷B…¶FFÖ66—G’Ö6†V6²×ccuÒ’r’æf÷$V6‚†'WGFöâÓâ°¢'WGFöâæFF6WBæ66—G”6†V6µccrÒss°¢'WGFöâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢6öç7BW6W"Òæ7W'&VçEW6W#°¢6öç7B6†V6²ÒW6W"ò6äFD–çfVçF÷'”—FVÕccr‡W6W"Â'WGFöâæFF6WBæ—FVÔ–BÂ’¢²ö³¢G'VRÓ°¢–b‚6†V6²æö²’°¢WfVçBç&WfVçDFVfVÇB‚“°¢WfVçBç7F÷–ÖÖVF–FU&÷vF–öâ‚“°¢Fö7Bç6†÷r†6†V6²ç&V6öâÂvW'"r“°¢Ð¢ÒÂG'VR“°¢Ò“°¢Ò“°¢ö'6W'fW%ccræö'6W'fR†Fö7VÖVçBæFö7VÖVçDVÆVÖVçBÂ²7V'G&VS¢G'VRÂ6†–ÆDÆ—7C¢G'VRÒ“°§Ò’‚“°  ¢ò¢cããs(	BFW6·F÷6†B7V&Ö—B7F&–Æ—G’²67&öÆÂFòæWvW7BÖW76vR¢ð¢‚‚’Óâ°¢–b‡v–æF÷råõö6†E6VæE67&öÆÅcs’&WGW&ã°¢v–æF÷råõö6†E6VæE67&öÆÅcsÒG'VS° ¢gVæ7F–öâ—46†E7V&Ö—Df÷&Õcs†f÷&Ò’°¢&WGW&â&ööÆVâ†f÷&ÓòæÖF6†W3òâ‚ræF—&V7BÖ6†BÖf÷&ÒÂæÖW76vW2Öç2Ö6†BÖf÷&ÒÂæç2Ö6†BÖf÷&ÒÂæç2Ö6†BÖ–æ—BÖf÷&ÒÂæ6×–vâÖ6†BÖf÷&Ò×cc"r’“°¢Ð ¢gVæ7F–öâ67&öÆÅf—6–&ÆTÖW76vUF‡&VEFô&÷GFöÕcs‡&ö÷BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚vÖW76vW2Ö6öçFVçBr’’°¢–b‚&ö÷B’&WGW&ã°¢6öç7BF‡&VG2Ò'&’æg&öÒ‡&ö÷BçVW'•6VÆV7F÷$ÆÂ‚ræÖW76vR×F‡&VBÂæ6†B×F‡&VBr’’æf–ÇFW"†æöFRÓâæöFRæöfg6WE&VçBÓÒçVÆÂ“°¢6öç7BF‡&VBÒF‡&VG5·F‡&VG2æÆVæwF‚ÒÓ°¢–b‚F‡&VB’&WGW&ã°¢F‡&VBç67&öÆÅF÷ÒF‡&VBç67&öÆÄ†V–v‡C°¢Ð ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚wö–çFW&F÷vârÂWfVçBÓâ°¢6öç7B'WGFöâÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚v'WGFöå·G—SÒ'7V&Ö—B%ÒÂ–çWE·G—SÒ'7V&Ö—B%Òr“°¢6öç7Bf÷&ÒÒ'WGFöãòæf÷&Ó°¢–b‚—46†E7V&Ö—Df÷&Õcs†f÷&Ò’’&WGW&ã°¢f÷&ÒæFF6WBæ6†E7V&Ö—Eö–çFW%csÒ7G&–ær„FFRææ÷r‚’“°¢ÒÂG'VR“° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚w7V&Ö—BrÂWfVçBÓâ°¢6öç7Bf÷&ÒÒWfVçBçF&vWC°¢–b‚—46†E7V&Ö—Df÷&Õcs†f÷&Ò’’&WGW&ã°¢ÖW76vW5T’åõöf÷&6T&÷GFöÕVçF–ÅcsÒFFRææ÷r‚’²ƒ°¢ÒÂG'VR“° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢6öç7B6öçF7BÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖW76vRÖ¶–æEÒÂ¶FFÖvÒÖÖW76vRÖ¶–æEÒr“°¢–b‚6öçF7B’&WGW&ã°¢ÖW76vW5T’åõöf÷&6T&÷GFöÕVçF–ÅcsÒFFRææ÷r‚’²c°¢ÒÂG'VR“° ¢6öç7B&Wf–÷W5&VæFW%csÒÖW76vW5T’ç&VæFW"æ&–æB„ÖW76vW5T’“°¢ÖW76vW5T’ç&VæFW"ÒgVæ7F–öâ‚’°¢6öç7B&W7VÇBÒ&Wf–÷W5&VæFW%cs‚“°¢–b„çVÖ&W"‡F†—2åõöf÷&6T&÷GFöÕVçF–ÅcsÇÂ’ãÒFFRææ÷r‚’’°¢–b‡G—Vöb6†E7–æ2ÓÓÒvö&¦V7Br’6†E7–æ2ç&VæFW%VæF–ærÒfÇ6S°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’Óâ°¢67&öÆÅf—6–&ÆTÖW76vUF‡&VEFô&÷GFöÕcs†Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÖW76vW2Ö6öçFVçBr’“°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’Óâ67&öÆÅf—6–&ÆTÖW76vUF‡&VEFô&÷GFöÕcs†Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÖW76vW2Ö6öçFVçBr’’“°¢Ò“°¢Ð¢&WGW&â&W7VÇC°¢Ó° §v–æF÷rç67&öÆÅf—6–&ÆTÖW76vUF‡&VEFô&÷GFöÕcsÒ67&öÆÅf—6–&ÆTÖW76vUF‡&VEFô&÷GFöÕcs°§Ò’‚“°  ¢ò¢cããsB(	BvÆö&Â6V7W&—F–W2Â÷'FföÆ–ò7F÷&vRæB–âÖvÖRÖ&¶WBFFR¢ð¢†gVæ7F–öâ‚—°¢–b‡v–æF÷råõöw'u7Fö6·5÷'FföÆ–õcsB’&WGW&ã°¢v–æF÷råõöw'u7Fö6·5÷'FföÆ–õcsBÒG'VS° ¢gVæ7F–öâ7Fö6µF–6¶W%csB†—FVÒÒ·Ò’°¢–b†æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ’çG—RÓÒw7Fö6²r’&WGW&ârs°¢6öç7BW‡Æ–6—BÒ7G&–ær†—FVÒçF–6¶W"ÇÂ—FVÒç7–Ö&öÂÇÂrr’çG&–Ò‚’çFõWW$66R‚’ç&WÆ6R‚õµäÕ£Ó’åÂÕÒörÂrr’ç6Æ–6RƒÂ"“°¢–b†W‡Æ–6—B’&WGW&âW‡Æ–6—C°¢6öç7BFW67&—F–öâÒ7G&–ær†—FVÒæFW62ÇÂ—FVÒæFW67&—F–öâÇÂrr“°¢6öç7BÖF6‚ÒFW67&—F–öâæÖF6‚‚òƒó­-­]ÇF–6¶W"•Ç2¥³®(	BÕÕÇ2¢…´Õ£Ó’åÂÕ×³"Ã'Ò’ö’’ÇÂFW67&—F–öâæÖF6‚‚õåÇ2¢…´Õ£Ó•Õ´Õ£Ó’åÂÕ×³ÃÒ•Ç2¥¾(	BÕÕÇ2¢ò“°¢&WGW&âÖF6‚ò7G&–ær†ÖF6…³Ò’çFõWW$66R‚’¢rs°¢Ð ¢gVæ7F–öâÆVv7•7Fö6µ&ævUcsB†—FVÔ–BÂÆæWG2ÒÄäUE2’°¢6öç7B&÷rÒö&¦V7BçfÇVW2‡ÆæWG2ÇÂ·Ò’ç6÷'B‚†Æ"“Óå7G&–ær†òæ–GÇÂrr’æÆö6ÆT6ö×&R…7G&–ær†#òæ–GÇÂrr’’’æfÆDÖ‡ÆæWCÓä'&’æ—4'&’‡ÆæWCòæÖ&¶WB“÷ÆæWBæÖ&¶WC¥µÒ’æf–æB†VçG'“Óå7G&–ær†VçG'“òæ—FVÔ–GÇÂrr“ÓÓÕ7G&–ær†—FVÔ–GÇÂrr’“°¢–b‚&÷r’&WGW&âçVÆÃ°¢6öç7BÖ–âÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"‡&÷ræÖ–å&–6Róò&÷rç&–6TÖ–âóò&÷rç&–6Róò’ÇÂ’“°¢6öç7BÖ‚ÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"‡&÷ræÖ…&–6Róò&÷rç&–6TÖ‚óò&÷rç&–6RóòÖ–â’ÇÂ’“°¢&WGW&â²Ö–ã¢ÖF‚æÖ–â†Ö–âÆÖ‚’ÂÖƒ¢ÖF‚æÖ‚†Ö–âÆÖ‚’Ó°¢Ð ¢6öç7Bæ÷&ÖÆ—¦TWV—ÖVçD&Vf÷&U7Fö6·5csBÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc#°¢æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"ÒgVæ7F–öâ†—FVÒÒ·Ò’°¢6öç7B&rÒ²âââ†—FVÒÇÂ·Ò’Ó°¢6öç7BæW‡BÒæ÷&ÖÆ—¦TWV—ÖVçD&Vf÷&U7Fö6·5csB‡&r“°¢–b†æW‡BçG—RÓÓÒw7Fö6²r’°¢6öç7BÆVv7’ÒÆVv7•7Fö6µ&ævUcsB†æW‡Bæ–B“°¢6öç7BfÆÆ&6²ÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"‡&rç7Fö6µ&–6Róò&ræ&6U&–6Róò’ÇÂ’“°¢6öç7BÖ–âÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"‡&rç7Fö6´Ö–å&–6Róò&rç7Fö6µ&–6TÖ–âóòÆVv7“òæÖ–âóòfÆÆ&6²’ÇÂ’“°¢6öç7BÖ‚ÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"‡&rç7Fö6´Ö…&–6Róò&rç7Fö6µ&–6TÖ‚óòÆVv7“òæÖ‚óòfÆÆ&6²’ÇÂ’“°¢æW‡BçF–6¶W"Ò7Fö6µF–6¶W%csE&r‡&rÂæW‡B“°¢æW‡Bç7Fö6´Ö–å&–6RÒÖF‚æÖ–â†Ö–âÂÖ‚“°¢æW‡Bç7Fö6´Ö…&–6RÒÖF‚æÖ‚†Ö–âÂÖ‚“°¢ÒVÇ6R°¢FVÆWFRæW‡BçF–6¶W#°¢FVÆWFRæW‡Bç7Fö6´Ö–å&–6S°¢FVÆWFRæW‡Bç7Fö6´Ö…&–6S°¢Ð¢&WGW&âæW‡C°¢Ó° ¢gVæ7F–öâ7Fö6µF–6¶W%csE&r‡&rÂæ÷&ÖÆ—¦VB’°¢6öç7BW‡Æ–6—BÒ7G&–ær‡&rçF–6¶W"ÇÂ&rç7–Ö&öÂÇÂrr’çG&–Ò‚’çFõWW$66R‚’ç&WÆ6R‚õµäÕ£Ó’åÂÕÒörÂrr’ç6Æ–6RƒÂ"“°¢–b†W‡Æ–6—B’&WGW&âW‡Æ–6—C°¢6öç7BFW67&—F–öâÒ7G&–ær‡&ræFW62ÇÂ&ræFW67&—F–öâÇÂæ÷&ÖÆ—¦VCòæFW62ÇÂrr“°¢6öç7BÖF6‚ÒFW67&—F–öâæÖF6‚‚òƒó­-­]ÇF–6¶W"•Ç2¥³®(	BÕÕÇ2¢…´Õ£Ó’åÂÕ×³"Ã'Ò’ö’’ÇÂFW67&—F–öâæÖF6‚‚õåÇ2¢…´Õ£Ó•Õ´Õ£Ó’åÂÕ×³ÃÒ•Ç2¥¾(	BÕÕÇ2¢ò“°¢&WGW&âÖF6‚ò7G&–ær†ÖF6…³Ò’çFõWW$66R‚’¢rs°¢Ð ¢gVæ7F–öâæ÷&ÖÆ—¦U÷'FföÆ–õ÷6—F–öåcsB†—FVÔ–BÂfÇVRÒ·Ò’°¢6öç7B¶æ÷våG’ÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"‡fÇVRæ¶æ÷våG’óòfÇVRçVçF—G’óò’ÇÂ’“°¢6öç7BVç&–6VEG’ÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"‡fÇVRçVç&–6VEG’ÇÂ’ÇÂ’“°¢&WGW&â²—FVÔ–C¢7G&–ær†—FVÔ–BÇÂfÇVRæ—FVÔ–BÇÂrr’Â¶æ÷våG’ÂVç&–6VEG’Â6÷7D&6—3¢ÖF‚æÖ‚ƒÂçVÖ&W"‡fÇVRæ6÷7D&6—2ÇÂ’’Ó°¢Ð ¢gVæ7F–öâæ÷&ÖÆ—¦U7Fö6µ÷'FföÆ–õcsB‡6÷W&6RÒ·Ò’°¢6öç7B&rÒ6÷W&6Rç7Fö6µ÷'FföÆ–òbbG—Vöb6÷W&6Rç7Fö6µ÷'FföÆ–òÓÓÒvö&¦V7Brbb'&’æ—4'&’‡6÷W&6Rç7Fö6µ÷'FföÆ–ò’òFVW‡6÷W&6Rç7Fö6µ÷'FföÆ–ò’¢·Ó°¢6öç7B÷6—F–öç2Ò·Ó°¢–b„'&’æ—4'&’‡&rç÷6—F–öç2’’&rç÷6—F–öç2æf÷$V6‚‡&÷sÓç¶–b‡&÷sòæ—FVÔ–B—÷6—F–öç5µ7G&–ær‡&÷ræ—FVÔ–B•ÓÖæ÷&ÖÆ—¦U÷'FföÆ–õ÷6—F–öåcsB‡&÷ræ—FVÔ–BÇ&÷r“·Ò“°¢VÇ6Rö&¦V7BæVçG&–W2‡&rç÷6—F–öç2ÇÂ·Ò’æf÷$V6‚‚…¶—FVÔ–BÇ&÷uÒ“Óç·÷6—F–öç5¶—FVÔ–EÓÖæ÷&ÖÆ—¦U÷'FföÆ–õ÷6—F–öåcsB†—FVÔ–BÇ&÷r“·Ò“°¢6öç7BÖ–w&FVBÒ&ræÆVv7”–çfVçF÷'”Ö–w&FVBbbG—Vöb&ræÆVv7”–çfVçF÷'”Ö–w&FVBÓÓÒvö&¦V7Brbb'&’æ—4'&’‡&ræÆVv7”–çfVçF÷'”Ö–w&FVB’ò²ââç&ræÆVv7”–çfVçF÷'”Ö–w&FVBÒ¢·Ó°¢6öç7B–çfVçF÷'’ÒµÓ°¢„'&’æ—4'&’‡6÷W&6Ræ–çfVçF÷'’’ò6÷W&6Ræ–çfVçF÷'’¢µÒ’æf÷$V6‚†VçG'’Óâ°¢6öç7B—FVÔ–BÒ7G&–ær†VçG'“òæ—FVÔ–BÇÂrr“°¢6öç7B—FVÒÒUT•ÔTåCòå¶—FVÔ–EÒÇÂ·Ó°¢–b†æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ’çG—RÓÒw7Fö6²r’²–çfVçF÷'’çW6‚†VçG'’“²&WGW&ã²Ð¢6öç7BG’ÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"†VçG'’çG’ÇÂ’ÇÂ’“°¢6öç7B66÷VçFVBÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"†Ö–w&FVE¶—FVÔ–EÒÇÂ’ÇÂ’“°¢6öç7BFVÇFÒÖF‚æÖ‚ƒÂG’Ò66÷VçFVB“°¢6öç7B÷6—F–öâÒ÷6—F–öç5¶—FVÔ–EÒÇÂæ÷&ÖÆ—¦U÷'FföÆ–õ÷6—F–öåcsB†—FVÔ–B“°¢÷6—F–öâçVç&–6VEG’³ÒFVÇF°¢÷6—F–öç5¶—FVÔ–EÒÒ÷6—F–öã°¢Ö–w&FVE¶—FVÔ–EÒÒÖF‚æÖ‚†66÷VçFVBÂG’“°¢Ò“°¢&WGW&â²÷6—F–öç2ÂÆVFvW#¢'&’æ—4'&’‡&ræÆVFvW"’ò&ræÆVFvW"ç6Æ–6R‚ÓS’¢µÒÂÆVv7”–çfVçF÷'”Ö–w&FVC¢Ö–w&FVBÂ–çfVçF÷'’Ó°¢Ð ¢6öç7Bæ÷&ÖÆ—¦UÆ–W$&Vf÷&U7Fö6·5csBÒæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc#°¢æ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"ÒgVæ7F–öâ‡W6W"Ò·Ò’°¢6öç7B6÷W&6RÒ²âââ‡W6W"ÇÂ·Ò’Ó°¢6öç7BæW‡BÒæ÷&ÖÆ—¦UÆ–W$&Vf÷&U7Fö6·5csB‡6÷W&6R“°¢6öç7B÷'FföÆ–òÒæ÷&ÖÆ—¦U7Fö6µ÷'FföÆ–õcsB‡²ââç6÷W&6RÂ–çfVçF÷'“¢'&’æ—4'&’‡6÷W&6Ræ–çfVçF÷'’’ò6÷W&6Ræ–çfVçF÷'’¢æW‡Bæ–çfVçF÷'’Ò“°¢æW‡Bç7Fö6µ÷'FföÆ–òÒ²÷6—F–öç3¢÷'FföÆ–òç÷6—F–öç2ÂÆVFvW#¢÷'FföÆ–òæÆVFvW"ÂÆVv7”–çfVçF÷'”Ö–w&FVC¢÷'FföÆ–òæÆVv7”–çfVçF÷'”Ö–w&FVBÓ°¢æW‡Bæ–çfVçF÷'’Ò÷'FföÆ–òæ–çfVçF÷'“°¢&WGW&âæW‡C°¢Ó° ¢v–æF÷räu%u7Fö6µ÷'FföÆ–õcsBÒö&¦V7Bæg&VW¦R‡°¢æ÷&ÖÆ—¦S¢æ÷&ÖÆ—¦U7Fö6µ÷'FföÆ–õcsBÀ¢÷6—F–öç2‡W6W"Ò·Ò’²&WGW&âö&¦V7BçfÇVW2†æ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡W6W"’ç7Fö6µ÷'FföÆ–óòç÷6—F–öç2ÇÂ·Ò’æf–ÇFW"‡&÷sÓç&÷ræ¶æ÷våG’·&÷rçVç&–6VEG“ã“²ÒÀ¢VçF—G’‡÷6—F–öâÒ·Ò’²&WGW&âÖF‚æÖ‚ƒÂçVÖ&W"‡÷6—F–öâæ¶æ÷våG—ÇÃ’’²ÖF‚æÖ‚ƒÂçVÖ&W"‡÷6—F–öâçVç&–6VEG—ÇÃ’“²ÒÀ¢F–6¶W#¢7Fö6µF–6¶W%cs@¢Ò“° ¢6öç7BÇ•v÷&ÆD&Vf÷&U7Fö6·5csBÒÇ•v÷&ÆDFF°¢Ç•v÷&ÆDFFÒgVæ7F–öâ‡–ÆöBÒ·Ò’°¢6öç7B&t6×–vç2Ò–ÆöCòæ6×–vç3òä4Õ”tå2ÇÂ·Ó°¢6öç7B&W7VÇBÒÇ•v÷&ÆD&Vf÷&U7Fö6·5csB‡–ÆöB“°¢ö&¦V7BæVçG&–W2‡&t6×–vç2’æf÷$V6‚‚…¶–BÇ&uÒ“Óç¶–b„FFòæ6×–vç3òå¶–EÒ”FFæ6×–vç5¶–EÒæÖ&¶WDFFSÕ7G&–ær‡&sòæÖ&¶WDFFWÇÇ&sòævÖTFFWÇÇ&sòæ7W'&VçDFFWÇÂrr’ç6Æ–6RƒÃ“·Ò“°¢ö&¦V7BæVçG&–W2„UT•ÔTåBÇÂ·Ò’æf÷$V6‚‚…¶–BÆ—FVÕÒ“Óç´UT•ÔTåE¶–EÓÖæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ“·Ò“°¢–b„òç7FFSòçW6W'2’ö&¦V7BæVçG&–W2„ç7FFRçW6W'2’æf÷$V6‚‚…¶–BÇW6W%Ò“Óç´ç7FFRçW6W'5¶–EÓÖæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡W6W"“·Ò“°¢&WGW&â&W7VÇC°¢Ó° ¢6öç7B&VæFW$6×–vä&Vf÷&U7Fö6·5csBÒ6öæf–wW&F÷"ç&VæFW$6×–väVF—F÷#òæ&–æB„6öæf–wW&F÷"“°¢–b‡&VæFW$6×–vä&Vf÷&U7Fö6·5csB’6öæf–wW&F÷"ç&VæFW$6×–väVF—F÷"ÒgVæ7F–öâ†VçF—G’’°¢ÆWB‡FÖÂÒ&VæFW$6×–vä&Vf÷&U7Fö6·5csB†VçF—G’“°¢6öç7Bf–VÆBÒÆF—b6Æ73Ò&f–VÆB6×–vâÖÖ&¶WBÖFFR×csB#ãÆÆ&VÃí
-]­=ò=í-òM-½Ý­ÂöÆ&VÃãÆ–çWB6Æ73Ò&–çWB"G—SÒ&FFR"æÖSÒ&Ö&¶WDFFR"fÇVSÒ"G¶W62…7G&–ær†VçF—G“òæÖ&¶WDFFWÇÆVçF—G“òævÖTFFWÇÂrr’ç6Æ–6RƒÃ’—Ò"óãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í
Í]ÝÝ-í’M-²ý]]-íM"½Ýí¢ÝÝí-½’=í-í’M]ÝÂ‚íÝí-½ý]"­í-í-­‚ãÂöF—cãÂöF—cæ°¢&WGW&â‡FÖÂç&WÆ6R‚sÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	íýÝSÂöÆ&VÃârÂf–VÆB²sÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	íýÝSÂöÆ&VÃâr“°¢Ó° ¢6öç7B&VæFW%ÆæWD&Vf÷&U7Fö6·5csBÒ6öæf–wW&F÷"ç&VæFW%ÆæWDVF—F÷#òæ&–æB„6öæf–wW&F÷"“°¢–b‡&VæFW%ÆæWD&Vf÷&U7Fö6·5csB’6öæf–wW&F÷"ç&VæFW%ÆæWDVF—F÷"ÒgVæ7F–öâ†VçF—G’’°¢ÆWB‡FÖÂÒ&VæFW%ÆæWD&Vf÷&U7Fö6·5csB†VçF—G’“°¢6öç7BÆVv7”Væ&ÆVBÒ'&’æ—4'&’†VçF—G“òæÖ&¶WB’bbVçF—G’æÖ&¶WBç6öÖR‡&÷sÓææ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"„UT•ÔTåCòå·&÷sòæ—FVÔ–E×ÇÇ·Ò’çG—SÓÓÒw7Fö6²r“°¢6öç7BVæ&ÆVBÒG—VöbVçF—G“òç7Fö6´Ö&¶WDVæ&ÆVBÓÓÒv&ööÆVâròVçF—G’ç7Fö6´Ö&¶WDVæ&ÆVB¢ÆVv7”Væ&ÆVC°¢6öç7Bf–VÆBÒÆÆ&VÂ6Æ73Ò&6öç6VçBÖÆ–æRÆæWB×7Fö6²ÖÖ&¶WB×FövvÆR×csB#ãÆ–çWBG—SÒ&6†V6¶&÷‚"æÖSÒ'7Fö6´Ö&¶WDVæ&ÆVB"G¶Væ&ÆVCòv6†V6¶VBs¢rwÒóãÇ7ããÆ#í	Ýý½Ý]-RMí-=ý]ÒMíÝMí-½’½Ýí£Âö#ãÇ6ÖÆÃí	ý‚-­½í}]Ý‚-]ÍÝ²ýí­}½-]"-R­m‚­ÍýÝ‚ýâ]MÝ½Â=½í½ÍÝ½Âm]ÝÂãÂ÷6ÖÆÃãÂ÷7ããÂöÆ&VÃæ°¢&WGW&â‡FÖÂç&WÆ6R‚sÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
½Ýí£ÂöÆ&VÃârÂf–VÆB²sÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
½Ýí£ÂöÆ&VÃâr“°¢Ó° ¢6öç7B6öÆÆV7D&Vf÷&U7Fö6·5csBÒ6öæf–wW&F÷"æ6öÆÆV7DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ6öÆÆV7DVçF—G’ÒgVæ7F–öâ‡G—RÂf÷&ÔVÂÂf÷&ÔFFÒæWrf÷&ÔFF†f÷&ÔVÂ’’°¢6öç7BVçF—G’Ò6öÆÆV7D&Vf÷&U7Fö6·5csB‡G—RÂf÷&ÔVÂÂf÷&ÔFF“°¢–b‡G—RÓÓÒv6×–vç2rbbVçF—G’’VçF—G’æÖ&¶WDFFRÒ7G&–ær†f÷&ÔFFævWB‚vÖ&¶WDFFRr’ÇÂrr’ç6Æ–6RƒÃ“°¢–b‡G—RÓÓÒwÆæWG2rbbVçF—G’’VçF—G’ç7Fö6´Ö&¶WDVæ&ÆVBÒf÷&ÔFFævWB‚w7Fö6´Ö&¶WDVæ&ÆVBr’ÓÓÒvöâs°¢&WGW&âVçF—G“°¢Ó° ¢ö&¦V7BæVçG&–W2„UT•ÔTåBÇÂ·Ò’æf÷$V6‚‚…¶–BÆ—FVÕÒ“Óç´UT•ÔTåE¶–EÓÖæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ“·Ò“°¢–b„òç7FFSòçW6W'2’ö&¦V7BæVçG&–W2„ç7FFRçW6W'2’æf÷$V6‚‚…¶–BÇW6W%Ò“Óç´ç7FFRçW6W'5¶–EÓÖæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡W6W"“·Ò“°§Ò’‚“° ¢ò¢cããs(	BF–Ç’&÷FF–ærG&ç67F–öæÂÆæWF'’Ö&¶WB¢ð¢‚‚’Óâ°¢–b‡v–æF÷råõ÷ÆæWDÖ&¶WEcs’&WGW&ã°¢v–æF÷råõ÷ÆæWDÖ&¶WEcsÒG'VS°¢6öç7BVæv–æRÒv–æF÷räu%tÖ&¶WDVæv–æUcs°¢–b‚Væv–æR’F‡&÷ræWrW'&÷"‚tu%tÖ&¶WDVæv–æUcs—2æ÷BÆöFVBr“° ¢ÆWB6VÆV7F–öâÒçVÆÃ°¢ÆWBG&rÒçVÆÃ°¢ÆWBÖ&¶WEF%cs2ÒvvööG2s°¢ÆWBÆ7E&÷FF–öä¶W’ÒVæv–æRç&÷FF–öä¶W’‚“° ¢gVæ7F–öâÖ&¶WD6×–vä–Ecs‚’°¢&WGW&â7G&–ær…7–æ3òæ6öæf–sòæ6×–vä–BÇÂvÖ–âr“°¢Ð ¢gVæ7F–öâÖ&¶WE7FFUcs‚’°¢&WGW&âç7FFSòæÖ&¶WE'VçF–ÖUcsÇÂ²6Æ–×3¢·ÒÓ°¢Ð ¢gVæ7F–öâÖ&¶WE&÷FF–öåcs‡ÆæWBÒFFævWEÆæWB…T’ç6VÆV7FVEÆæWD–B’’°¢–b‚ÆæWB’&WGW&â²&÷FF–öä¶W“¢Væv–æRç&÷FF–öä¶W’‚’ÂæW‡E&÷FF–öäC¢Væv–æRææW‡E&÷FF–öäB‚’ÂöffW'3¢µÒÂÆÄöffW'3¢µÒÓ°¢&WGW&âVæv–æRæ'V–ÆE&÷FF–öâ‡²6×–vä–C¢Ö&¶WD6×–vä–Ecs‚’ÂÆæWBÂWV—ÖVçC¢UT•ÔTåBÂÖ&¶WE7FFS¢Ö&¶WE7FFUcs‚’Ò“°¢Ð ¢gVæ7F–öâÖ&¶WD—FVÕ6—¦Ucs†—FVÒÒ·Ò’°¢&WGW&â°¢s¢ÖF‚æÖ‚ƒÂçVÖ&W"ç'6T–çB†—FVÒæ–çfVçF÷'•v–GF‚óò—FVÒç6—¦Uv–GF‚óòÂ’ÇÂ’À¢ƒ¢ÖF‚æÖ‚ƒÂçVÖ&W"ç'6T–çB†—FVÒæ–çfVçF÷'”†V–v‡Bóò—FVÒç6—¦T†V–v‡BóòÂ’ÇÂ¢Ó°¢Ð ¢gVæ7F–öâÖ&¶WEG—TÆ&VÅcs†—FVÒÒ·Ò’°¢6öç7BG—RÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ’çG—S°¢&WGW&â‡·vVöã¢}	í=mRrÇ6†–VÆC¢}
-²rÆw&VæFS¢}	=Ý-²rÇGW'&WC¢}
-=]½‚rÆG&öæS¢}	MíÝ²rÆ&Ö÷#¢}	íÝòrÆ&6·6³¢}
í­}¢rÆ–×ÆçC¢}	Íý½Ý"rÇ7Fö6³¢}	­m‚rÆÖÖó¢}	ý-íÝ²rÆvV#¢}
Ýým]ÝRwÒ•·G—UÒÇÂ}
Ýým]ÝRs°¢Ð ¢gVæ7F–öâÖ&¶WD—FVÔ—57Fö6µcs2†—FVÒÒ·Ò’°¢&WGW&âæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ’çG—RÓÓÒw7Fö6²s°¢Ð ¢gVæ7F–öâÖ&¶WEF$ÖF6†W5cs2†—FVÒÒ·ÒÂF"ÒÖ&¶WEF%cs2’°¢&WGW&âF"ÓÓÒw7Fö6·2ròÖ&¶WD—FVÔ—57Fö6µcs2†—FVÒ’¢Ö&¶WD—FVÔ—57Fö6µcs2†—FVÒ“°¢Ð ¢gVæ7F–öâÖ&¶WE6VÆÅW&6VçEcs2†öffW"Â—FVÒ’°¢6öç7BfÆÆ&6²ÒÖ&¶WD—FVÔ—57Fö6µcs2†—FVÒ’ò¢ãs°¢6öç7B&FRÒçVÖ&W"æ—4f–æ—FR„çVÖ&W"†öffW#òç6VÆÅ&FR’’òçVÖ&W"†öffW"ç6VÆÅ&FR’¢fÆÆ&6³°¢&WGW&âÖF‚ç&÷VæB‡&FR¢“°¢Ð ¢gVæ7F–öâÖ&¶WD6öæf–tÖ&·Wcs‡ÆæWBÒ·Ò’°¢6öç7B6öæf–wW&VBÒæWrÖ‚„'&’æ—4'&’‡ÆæWBæÖ&¶WB’òÆæWBæÖ&¶WB¢µÒ’æÖ†VçG'’Óâµ7G&–ær†VçG'’æ—FVÔ–BÇÂrr’ÂVçG'•Ò’“°¢6öç7B—FV×2Òö&¦V7BçfÇVW2„UT•ÔTåBÇÂ·Ò’æÖ†æ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"’æf–ÇFW"†—FVÒÓâ—FVÒçG—RÓÒw7Fö6²r’ç6÷'B‚†Â"’Óâ7G&–ær†ææÖRÇÂæ–B’æÆö6ÆT6ö×&R…7G&–ær†"ææÖRÇÂ"æ–B’Âw'Rr’“°¢&WGW&âÆF—b6Æ73Ò&Ö&¶WBÖ6öæf–r×cs"FFÖÖ&¶WBÖ6öæf–r×csà¢ÆF—b6Æ73Ò&Ö&¶WBÖ6öæf–rÖ†VB×cs#à¢ÆF—cãÆ#í	]m]MÝ]-Ýòí-mò½Ý­Âö#ãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	=½í}­}]]"ýíý-½]ÝR-í-â	-]íý-Ýí-Â-MÝ-í½Í­â	M	Í2â
m]ÝÝ­mM½’M]ÝÂ-½]-òr=­}ÝÝí=âMý}íÝãÂöF—cãÂöF—cà¢Æ–çWB6Æ73Ò&–çWB"G—SÒ'6V&6‚"Æ6V†öÆFW#Ò-	ýí¢-í-âââ"FFÖÖ&¶WBÖ6öæf–r×6V&6‚×csóà¢ÂöF—cà¢ÆF—b6Æ73Ò&Ö&¶WBÖ6öæf–rÖ6öÇVÖç2×cs#ãÇ7ãí
-í-Â÷7ããÇ7ãí	-]íý-Ýí-ÃÂ÷7ããÇ7ãí
m]Ýí#Â÷7ããÇ7ãí
m]ÝMãÂ÷7ããÂöF—cà¢ÆF—b6Æ73Ò&Ö&¶WBÖ6öæf–rÖÆ—7B×cs#à¢G¶—FV×2æÖ†—FVÒÓâ°¢6öç7B&rÒ6öæf–wW&VBævWB…7G&–ær†—FVÒæ–B’’ÇÂ·Ó°¢6öç7B6frÒVæv–æRææ÷&ÖÆ—¦TVçG'’‡&rÂ—FVÒ“°¢6öç7B6VÆV7FVBÒ6öæf–wW&VBæ†2…7G&–ær†—FVÒæ–B’’bb&ræVæ&ÆVBÓÒfÇ6S°¢6öç7BVæ—VRÒVæv–æRæ—5Væ—VR†—FVÒÂ&r“°¢6öç7B6V&6‚Ò¶—FVÒææÖRÂ—FVÒæ–BÂ—FVÒçG—RÂ—FVÒç&&—G•Òæf–ÇFW"„&ööÆVâ’æ¦ö–â‚rr’çFôÆ÷vW$66R‚“°¢&WGW&âÆÆ&VÂ6Æ73Ò&Ö&¶WBÖ6öæf–r×&÷r×csG·6VÆV7FVBòw6VÆV7FVBr¢rwÒ"FFÖÖ&¶WBÖ6öæf–r×&÷r×csFF×6V&6ƒÒ"G¶W62‡6V&6‚—Ò#à¢Ç7â6Æ73Ò&Ö&¶WBÖ6öæf–rÖ—FVÒ×cs#ãÆ–çWBG—SÒ&6†V6¶&÷‚"FFÖÖ&¶WBÖVæ&ÆVB×csG·6VÆV7FVBòv6†V6¶VBr¢rwÒóâG·&VæFW%F‡VÖ"†—FVÒÇ·6—¦S¢w‡2rÇG—S¢v—FVÒrÆvÇ—ƒ¦–æ—F–Ç2†—FVÒææÖRÂ~)j2r—Ò—ÓÇ7ããÆ#âG¶W62†—FVÒææÖRÇÂ—FVÒæ–B—ÓÂö#ãÇ6ÖÆÃâG¶W62†Ö&¶WEG—TÆ&VÅcs†—FVÒ’—ÒG·Væ—VRòr+r
=	Ý		­		½
Í	Ý
½	’r¢rwÓÂ÷6ÖÆÃãÂ÷7ããÂ÷7ãà¢Ç7â6Æ73Ò&Ö&¶WBÖ6öæf–rÖçVÖ&W"×cs#ãÆ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"ÖƒÒ#"7FWÒ#ã"fÇVSÒ"G¶6fræV&æ6T6†æ6WÒ"FFÖÖ&¶WBÖ6†æ6R×csóãÇ6ÖÆÃâSÂ÷6ÖÆÃãÂ÷7ãà¢Æ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"fÇVSÒ"G¶6fræÖ–å&–6WÒ"FFÖÖ&¶WBÖÖ–â×csóà¢Æ–çWB6Æ73Ò&–çWB"G—SÒ&çVÖ&W""Ö–ãÒ#"7FWÒ#"fÇVSÒ"G¶6fræÖ…&–6WÒ"FFÖÖ&¶WBÖÖ‚×csóà¢Æ–çWBG—SÒ&†–FFVâ"fÇVSÒ"G¶W62†—FVÒæ–B—Ò"FFÖÖ&¶WBÖ—FVÒÖ–B×csóà¢ÂöÆ&VÃæ°¢Ò’æ¦ö–â‚rr—Ð¢ÂöF—cà¢ÂöF—cæ°¢Ð ¢6öç7B&Wf–÷W5ÆæWDVF—F÷%csÒ6öæf–wW&F÷"ç&VæFW%ÆæWDVF—F÷"æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"ç&VæFW%ÆæWDVF—F÷"ÒgVæ7F–öâ‡ÆæWB’°¢ÆWB‡FÖÂÒ&Wf–÷W5ÆæWDVF—F÷%cs‡ÆæWB“°¢6öç7B&WÆ6VÖVçBÒÆF—b6Æ73Ò&f–VÆBÖ&¶WBÖ6öæf–rÖf–VÆB×cs#ãÆÆ&VÃí
½Ýí£ÂöÆ&VÃâG¶Ö&¶WD6öæf–tÖ&·Wcs‡ÆæWB—ÓÂöF—cæ°¢‡FÖÂÒ‡FÖÂç&WÆ6R‚óÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí
½Ýí£ÅÂöÆ&VÃãÆF—b–CÒ&Ö&¶WB×&÷w2%µÇ5Å5Ò£óÆ'WGFöâ–CÒ&FBÖÖ&¶WB×&÷r%µÇ5Å5Ò£óÅÂö'WGFöããÅÂöF—câòÂ&WÆ6VÖVçB“°¢&WGW&â‡FÖÃ°¢Ó° ¢6öç7B&Wf–÷W46öÆÆV7DVçF—G•csÒ6öæf–wW&F÷"æ6öÆÆV7DVçF—G’æ&–æB„6öæf–wW&F÷"“°¢6öæf–wW&F÷"æ6öÆÆV7DVçF—G’ÒgVæ7F–öâ‡G—RÂf÷&ÔVÂÂf÷&ÔFFÒæWrf÷&ÔFF†f÷&ÔVÂ’’°¢6öç7BVçF—G’Ò&Wf–÷W46öÆÆV7DVçF—G•cs‡G—RÂf÷&ÔVÂÂf÷&ÔFF“°¢–b‡G—RÓÒwÆæWG2r’&WGW&âVçF—G“°¢VçF—G’æÖ&¶WBÒ'&’æg&öÒ†f÷&ÔVÂçVW'•6VÆV7F÷$ÆÂ‚u¶FFÖÖ&¶WBÖ6öæf–r×&÷r×csÒr’’æf–ÇFW"‡&÷rÓâ&÷rçVW'•6VÆV7F÷"‚u¶FFÖÖ&¶WBÖVæ&ÆVB×csÒr“òæ6†V6¶VB’æÖ‡&÷rÓâ°¢6öç7BÖ–å&rÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"‡&÷rçVW'•6VÆV7F÷"‚u¶FFÖÖ&¶WBÖÖ–â×csÒr“òçfÇVRÇÂ’’“°¢6öç7BÖ…&rÒÖF‚æÖ‚ƒÂÖF‚çG'Væ2„çVÖ&W"‡&÷rçVW'•6VÆV7F÷"‚u¶FFÖÖ&¶WBÖÖ‚×csÒr“òçfÇVRÇÂ’’“°¢&WGW&â°¢—FVÔ–C¢7G&–ær‡&÷rçVW'•6VÆV7F÷"‚u¶FFÖÖ&¶WBÖ—FVÒÖ–B×csÒr“òçfÇVRÇÂrr’À¢Væ&ÆVC¢G'VRÀ¢V&æ6T6†æ6S¢ÖF‚æÖ‚ƒÂÖF‚æÖ–âƒÂçVÖ&W"‡&÷rçVW'•6VÆV7F÷"‚u¶FFÖÖ&¶WBÖ6†æ6R×csÒr“òçfÇVRÇÂ’’’À¢Ö–å&–6S¢ÖF‚æÖ–â†Ö–å&rÂÖ…&r’À¢Ö…&–6S¢ÖF‚æÖ‚†Ö–å&rÂÖ…&r¢Ó°¢Ò’æf–ÇFW"†VçG'’ÓâVçG'’æ—FVÔ–B“°¢&WGW&âVçF—G“°¢Ó° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v–çWBrÂWfVçBÓâ°¢6öç7B6V&6‚ÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WBÖ6öæf–r×6V&6‚×csÒr“°¢–b‚6V&6‚’&WGW&ã°¢6öç7BVW'’Ò7G&–ær‡6V&6‚çfÇVRÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢6V&6‚æ6Æ÷6W7B‚u¶FFÖÖ&¶WBÖ6öæf–r×csÒr“òçVW'•6VÆV7F÷$ÆÂ‚u¶FFÖÖ&¶WBÖ6öæf–r×&÷r×csÒr’æf÷$V6‚‡&÷rÓâ²&÷ræ†–FFVâÒ&ööÆVâ‡VW'’bb7G&–ær‡&÷ræFF6WBç6V&6‚ÇÂrr’æ–æ6ÇVFW2‡VW'’’“²Ò“°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6†ævRrÂWfVçBÓâ°¢6öç7BFövvÆRÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WBÖVæ&ÆVB×csÒr“°¢–b‡FövvÆR’FövvÆRæ6Æ÷6W7B‚u¶FFÖÖ&¶WBÖ6öæf–r×&÷r×csÒr“òæ6Æ74Æ—7BçFövvÆR‚w6VÆV7FVBrÂFövvÆRæ6†V6¶VB“°¢Ò“° ¢gVæ7F–öâÖ&¶WDöffW%F–ÆUcs†öffW"’°¢6öç7B—FVÒÒFFævWD—FVÒ†öffW"æ—FVÔ–B“°¢–b‚—FVÒ’&WGW&ârs°¢6öç7B6—¦RÒÖ&¶WD—FVÕ6—¦Ucs†—FVÒ“°¢6öç7B6VÆV7FVBÒ6VÆV7F–öãòç6÷W&6RÓÓÒvÖ&¶WBrbb6VÆV7F–öãòæ—FVÔ–BÓÓÒöffW"æ—FVÔ–C°¢&WGW&âÆ'WGFöâ6Æ73Ò&Ö&¶WB×6†÷×F–ÆR×csG·6VÆV7FVBòw6VÆV7FVBr¢rwÒ"G—SÒ&'WGFöâ"G&vv&ÆSÒ'G'VR"FFÖÖ&¶WBÖG&r×csFF×6÷W&6SÒ&Ö&¶WB"FFÖ—FVÒÖ–CÒ"G¶W62†—FVÒæ–B—Ò"7G–ÆSÒ&w&–BÖ6öÇVÖã§7âG·6—¦RçwÓ¶w&–B×&÷s§7âG·6—¦Ræ‡Ò"F—FÆSÒ"G¶W62†—FVÒææÖRÇÂ—FVÒæ–B—Ò+rG·6—¦RçwÜ9rG·6—¦Ræ‡Ò#à¢G·&VæFW%F‡VÖ"†—FVÒÇ·6—¦S¢w6ÒrÇG—S¢v—FVÒrÆvÇ—ƒ¦–æ—F–Ç2†—FVÒææÖRÂ~)j2r—Ò—Ð¢Ç7â6Æ73Ò&Ö&¶WB×F–ÆRÖæÖR×cs#âG¶W62†—FVÒææÖRÇÂ—FVÒæ–B—ÓÂ÷7ãà¢Ç7â6Æ73Ò&Ö&¶WB×F–ÆRÖÖWF×cs#âG·6—¦RçwÜ9rG·6—¦Ræ‡ÒG¶öffW"çVæ—VRòr+r
=Ý­½ÍÝ½’r¢rwÓÂ÷7ãà¢Æ"6Æ73Ò&Ö&¶WB×F–ÆR×&–6R×cs#âG¶f÷&ÖD7&VF—G2†öffW"ç&–6R—ÓÂö#à¢Âö'WGFöãæ°¢Ð ¢gVæ7F–öâÖ&¶WD–çfVçF÷'”w&–Ecs‡W6W"ÂöffW'2ÂF"ÒÖ&¶WEF%cs2’°¢6öç7BÆ–÷WBÒv–æF÷räu%t–çfVçF÷'•ccsòæ'V–ÆDÆ–÷WCòâ‡W6W"’ÇÂ²6—¦S£Â6öÇ3£Â&÷w3£Â–ç7Fæ6W3¥µÒÂ÷fW&fÆ÷s¥µÒÂvV–v‡C£Ó°¢6öç7BöffW$ÖÒæWrÖ†öffW'2æÖ†öffW"Óâ¶öffW"æ—FVÔ–BÂöffW%Ò’“°¢6öç7B6VÆÇ2Ò'&’æg&öÒ‡¶ÆVæwFƒ¦Æ–÷WBç6—¦WÒÂ…òÆ–æFW‚“ÓæÆF—b6Æ73Ò&Ö&¶WBÖ–çfVçF÷'’Ö6VÆÂ×cs"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–æFW‚VÆ–÷WBæ6öÇ2³Ó¶w&–B×&÷s¢G´ÖF‚æfÆö÷"†–æFW‚öÆ–÷WBæ6öÇ2’³Ò#ãÂöF—cæ’æ¦ö–â‚rr“°¢6öç7Bf—6–&ÆT–ç7Fæ6W2ÒÆ–÷WBæ–ç7Fæ6W2æf–ÇFW"†–ç7Fæ6RÓâÖ&¶WEF$ÖF6†W5cs2†–ç7Fæ6Ræ—FVÒÂF"’“°¢6öç7BF–ÆW2Òf—6–&ÆT–ç7Fæ6W2æÖ†–ç7Fæ6RÓâ°¢6öç7BöffW"ÒöffW$ÖævWB†–ç7Fæ6Ræ—FVÔ–B“°¢6öç7B6VÆV7FVBÒ6VÆV7F–öãòç6÷W&6RÓÓÒv–çfVçF÷'’rbb6VÆV7F–öãòæ—FVÔ–BÓÓÒ–ç7Fæ6Ræ—FVÔ–BbbçVÖ&W"‡6VÆV7F–öãòçVæ—D–æFW‚’ÓÓÒçVÖ&W"†–ç7Fæ6RçVæ—D–æFW‚“°¢&WGW&âÆ'WGFöâ6Æ73Ò&Ö&¶WBÖ–çfVçF÷'’×F–ÆR×csG·6VÆV7FVBòw6VÆV7FVBr¢rwÒG¶öffW"òw6VÆÆ&ÆRr¢væ÷B×6VÆÆ&ÆRwÒ"G—SÒ&'WGFöâ"G&vv&ÆSÒ'G'VR"FFÖÖ&¶WBÖG&r×csFF×6÷W&6SÒ&–çfVçF÷'’"FFÖ—FVÒÖ–CÒ"G¶W62†–ç7Fæ6Ræ—FVÔ–B—Ò"FF×Væ—BÖ–æFWƒÒ"G¶–ç7Fæ6RçVæ—D–æFW‡Ò"7G–ÆSÒ&w&–BÖ6öÇVÖã¢G¶–ç7Fæ6Rç÷2ç‚³Ò÷7âG¶–ç7Fæ6RçwÓ¶w&–B×&÷s¢G¶–ç7Fæ6Rç÷2ç’³Ò÷7âG¶–ç7Fæ6Ræ‡Ò"F—FÆSÒ"G¶W62†–ç7Fæ6Ræ—FVÒææÖRÇÂ–ç7Fæ6Ræ—FVÔ–B—ÒG¶öffW"ò+r	ýíMm}G¶f÷&ÖD7&VF—G2†öffW"ç6VÆÅ&–6R—Ö¢r+r
]=íMÝòÝRýÝÍ]-òwÒ#à¢G·&VæFW%F‡VÖ"†–ç7Fæ6Ræ—FVÒÇ·6—¦S¢w6ÒrÇG—S¢v—FVÒrÆvÇ—ƒ¦–æ—F–Ç2†–ç7Fæ6Ræ—FVÒææÖRÂ~)j2r—Ò—ÓÇ7ãâG¶W62†–ç7Fæ6Ræ—FVÒææÖWÇÆ–ç7Fæ6Ræ—FVÔ–B—ÓÂ÷7ããÇ6ÖÆÃâG¶–ç7Fæ6RçwÜ9rG¶–ç7Fæ6Ræ‡ÒG¶öffW"ò+rG¶f÷&ÖD7&VF—G2†öffW"ç6VÆÅ&–6R—Ö¢rwÓÂ÷6ÖÆÃà¢Âö'WGFöãæ°¢Ò’æ¦ö–â‚rr“°¢6öç7Bf—6–&ÆT÷fW&fÆ÷rÒÆ–÷WBæ÷fW&fÆ÷ræf–ÇFW"†–ç7Fæ6RÓâÖ&¶WEF$ÖF6†W5cs2†–ç7Fæ6Ræ—FVÒÇÂFFævWD—FVÒ†–ç7Fæ6Ræ—FVÔ–B’ÂF"’“°¢6öç7B÷fW&fÆ÷rÒf—6–&ÆT÷fW&fÆ÷ræÆVæwF‚òÆF—b6Æ73Ò&–çfVçF÷'’Ö÷fW&fÆ÷r×ccr#ãÆ#í	ÝRýíÍ]]-ó¢G·f—6–&ÆT÷fW&fÆ÷ræÆVæwF‡ÓÂö#ãÂöF—cæ¢rs°¢&WGW&âÆF—b6Æ73Ò&Ö&¶WBÖ–çfVçF÷'’Öw&–B×cs"FFÖÖ&¶WBÖ–çfVçF÷'’ÖG&÷×cs7G–ÆSÒ"ÒÖ–çbÖ6öÇ3¢G¶Æ–÷WBæ6öÇ7Ó²ÒÖ–çb×&÷w3¢G¶Æ–÷WBç&÷w7Ò#âG¶6VÆÇ7ÒG·F–ÆW7ÓÂöF—câG¶÷fW&fÆ÷wÖ°¢Ð ¢gVæ7F–öâ6VÆV7FVDöffW%cs‡&÷FF–öâ’°¢&WGW&â&÷FF–öâæöffW'2æf–æB†öffW"ÓâöffW"æ—FVÔ–BÓÓÒ6VÆV7F–öãòæ—FVÔ–B’ÇÂçVÆÃ°¢Ð ¢gVæ7F–öâÖ&¶WEvVöå6Æ÷DÆ&VÅcs‡fÇVR’°¢&WGW&â‡²&–Ö'“¢}	íÝí-ÝíRrÂ6V6öæF'“¢}	--í}ÝíRrÂfW'6F–ÆS¢}
=Ý-]½ÍÝíRrÒ•µ7G&–ær‡fÇVRÇÂw&–Ö'’r•ÒÇÂ7G&–ær‡fÇVRÇÂ}	íÝí-ÝíRr“°¢Ð ¢gVæ7F–öâÖ&¶WE&WV—&VÖVçG5FW‡Ecs†—FVÒÒ·Ò’°¢6öç7BÆ&VÇ2Ò°¢²w7G&VæwF‚rÂ}
		²uÒÂ²vFW‡FW&—G’rÂ}	½	í	"uÒÂ²v–çFVÆÆ–vVæ6RrÂ}		Ý
"uÒÀ¢²vVæGW&æ6RrÂ}	-
½	ÒuÒÂ²wv–ÆÂrÂ}	-	í	²uÒÂ²vvÆ÷'’rÂ}
	½	uÐ¢Ó°¢6öç7B&WV—&VÖVçG2Ò—FVÒç&WV—&VÖVçG2bbG—Vöb—FVÒç&WV—&VÖVçG2ÓÓÒvö&¦V7Brò—FVÒç&WV—&VÖVçG2¢·Ó°¢6öç7B&÷w2ÒÆ&VÇ2æf–ÇFW"‚…¶¶W•Ò’ÓâçVÖ&W"‡&WV—&VÖVçG5¶¶W•ÒÇÂ’â’æÖ‚…¶¶W’ÂÆ&VÅÒ’ÓâG¶Æ&VÇÒG´çVÖ&W"‡&WV—&VÖVçG5¶¶W•Ò—Ö“°¢&WGW&â&÷w2æÆVæwF‚ò&÷w2æ¦ö–â‚r+rr’¢}Ý]"s°¢Ð ¢gVæ7F–öâÖ&¶WD—FVÔFWF–Ç5cs†—FVÒÂöffW"’°¢6öç7Bæ÷&ÖÆ—¦VBÒæ÷&ÖÆ—¦TWV—ÖVçD—FVÕc"†—FVÒ“°¢6öç7B6—¦RÒÖ&¶WD—FVÕ6—¦Ucs†æ÷&ÖÆ—¦VB“°¢6öç7BÖ72ÒçVÖ&W"†æ÷&ÖÆ—¦VBæÖ72óòæ÷&ÖÆ—¦VBçvV–v‡Bóò“°¢6öç7Bf7G2Ò°¢
-ó¢G¶Ö&¶WEG—TÆ&VÅcs†æ÷&ÖÆ—¦VB—ÖÀ¢æ÷&ÖÆ—¦VBç&&—G’ò
]M­í-Ã¢G¶æ÷&ÖÆ—¦VBç&&—G—Ö¢rrÀ¢
}Í]¢G·6—¦RçwÜ9rG·6—¦Ræ‡ÖÀ¢	Í¢G´çVÖ&W"æ—4f–æ—FR†Ö72’òÖ72¢ÖÀ¢öffW#òçVæ—VRò}
=Ý­½ÍÝ½’ý]MÍ]"r¢rp¢Ó°¢–b†æ÷&ÖÆ—¦VBçG—RÓÓÒwvVöâr’°¢–b†æ÷&ÖÆ—¦VBæFÖvR’f7G2çW6‚†
=íÓ¢G¶æ÷&ÖÆ—¦VBæFÖvWÖ“°¢–b„çVÖ&W"†æ÷&ÖÆ—¦VBç&ævRÇÂ’â’f7G2çW6‚†	M½ÍÝí-Ã¢G´çVÖ&W"†æ÷&ÖÆ—¦VBç&ævR—Ö“°¢f7G2çW6‚†	ýíýMÝS¢G´çVÖ&W"†æ÷&ÖÆ—¦VBæ†—D&öçW2ÇÂ’ãÒòr²r¢rwÒG´çVÖ&W"†æ÷&ÖÆ—¦VBæ†—D&öçW2ÇÂ—Ö“°¢f7G2çW6‚†
½í#¢G¶Ö&¶WEvVöå6Æ÷DÆ&VÅcs†æ÷&ÖÆ—¦VBçvVöå6Æ÷B—Ö“°¢Ð¢–b†æ÷&ÖÆ—¦VBçG—RÓÓÒvw&VæFRr’²–b†æ÷&ÖÆ—¦VBæFÖvR’f7G2çW6‚†
=íÓ¢G¶æ÷&ÖÆ—¦VBæFÖvWÖ“²f7G2çW6‚†	íí£¢G´çVÖ&W"†æ÷&ÖÆ—¦VBæw&VæFU&ævRÇÂ—ÖÂ
M=¢G´çVÖ&W"†æ÷&ÖÆ—¦VBæw&VæFU&F—W2ÇÂ—Ö“²Ð¢–b…²wGW'&WBrÂvG&öæRuÒæ–æ6ÇVFW2†æ÷&ÖÆ—¦VBçG—R’’²–b†æ÷&ÖÆ—¦VBæFÖvR’f7G2çW6‚†
=íÓ¢G¶æ÷&ÖÆ—¦VBæFÖvWÖ“²f7G2çW6‚†	M½ÍÝí-Ã¢G´çVÖ&W"†æ÷&ÖÆ—¦VBç&ævRÇÂ—ÖÂ…¢G´çVÖ&W"†æ÷&ÖÆ—¦VBçVæ—D‡ÇÂ—ÖÂ	­	¢G´çVÖ&W"†æ÷&ÖÆ—¦VBçVæ—D&Ö÷$6Æ72ÇÂ—ÖÂ	ýíýMÝS¢G´çVÖ&W"†æ÷&ÖÆ—¦VBæ†—D&öçW7ÇÃ“ãÓòr²s¢rwÒG´çVÖ&W"†æ÷&ÖÆ—¦VBæ†—D&öçW7ÇÃ—ÖÂ	M-m]ÝS¢G´çVÖ&W"†æ÷&ÖÆ—¦VBçVæ—DÖ÷fU&ævRÇÂ—Ö“²Ð¢–b†æ÷&ÖÆ—¦VBçG—RÓÓÒv&Ö÷"rbbçVÖ&W"†æ÷&ÖÆ—¦VBæ&Ö÷$6Æ72ÇÂ’â’f7G2çW6‚†	­½íÝƒ¢G´çVÖ&W"†æ÷&ÖÆ—¦VBæ&Ö÷$6Æ72—Ö“°¢–b†æ÷&ÖÆ—¦VBçG—RÓÓÒv–×ÆçBr’f7G2çW6‚†
-]=]ÍòÝÝ]=ó¢G´çVÖ&W"†æ÷&ÖÆ—¦VBæVæW&w•&WV—&VBÇÂ—Ö“°¢6öç7BFw2Ò'&’æ—4'&’†æ÷&ÖÆ—¦VBçFw2’òæ÷&ÖÆ—¦VBçFw2æÖ‡FrÓâ7G&–ær‡FrÇÂrr’çG&–Ò‚’’æf–ÇFW"„&ööÆVâ’¢µÓ°¢&WGW&âÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖf7G2×cs#âG¶f7G2æf–ÇFW"„&ööÆVâ’æÖ†f7BÓâÇ7â6Æ73Ò'–ÆÂ#âG¶W62†f7B—ÓÂ÷7ãæ’æ¦ö–â‚rr—ÓÂöF—cà¢Ç6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖFW67&—F–öâ×cs#âG¶W62†æ÷&ÖÆ—¦VBæFW62ÇÂæ÷&ÖÆ—¦VBæFW67&—F–öâÇÂæ÷&ÖÆ—¦VBç7VÖÖ'’ÇÂ}	íýÝRý]MÍ]-ÝR}MÝââr—ÓÂ÷à¢ÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâ×&WV—&VÖVçG2×cs#ãÆ#í
-]í-Ýó£Âö#âG¶W62†Ö&¶WE&WV—&VÖVçG5FW‡Ecs†æ÷&ÖÆ—¦VB’—ÓÂöF—cà¢G·Fw2æÆVæwF‚òÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâ×Fw2×cs#ãÆ#í	­-]=íƒ£Âö#âG¶W62‡Fw2æ¦ö–â‚r+rr’—ÓÂöF—cæ¢rwÖ°¢Ð ¢gVæ7F–öâÖ&¶WE6VÆV7F–öåæVÅcs‡&÷FF–öâÂW6W"’°¢6öç7BöffW"Ò‡6VÆV7F–öãòç6÷W&6RÓÓÒv–çfVçF÷'’rò&÷FF–öâæÆÄöffW'2¢&÷FF–öâæöffW'2’æf–æB‡&÷rÓâ&÷ræ—FVÔ–BÓÓÒ6VÆV7F–öãòæ—FVÔ–B’ÇÂçVÆÃ°¢6öç7B—FVÒÒ6VÆV7F–öãòæ—FVÔ–BòFFævWD—FVÒ‡6VÆV7F–öâæ—FVÔ–B’¢çVÆÃ°¢–b‚—FVÒ’&WGW&âÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖV×G’×cs#í	-½]-Rý½-­2-í-½‚ý]MÍ]-ãÂöF—cæ°¢6öç7B'W’Ò6VÆV7F–öâç6÷W&6RÓÓÒvÖ&¶WBs°¢6öç7B&–6RÒ'W’òöffW#òç&–6R¢öffW#òç6VÆÅ&–6S°¢6öç7B66—G’Ò'W’òv–æF÷räu%t–çfVçF÷'•ccsòæ6äFD—FVÓòâ‡W6W"Â—FVÒæ–BÂ’¢¶ö³§G'VWÓ°¢6öç7BF—6&ÆVBÒöffW"ÇÂ†'W’bb‚66—G“òæö²ÇÂçVÖ&W"‡W6W"æ7&VF—G7ÇÃ’ÂçVÖ&W"†öffW"ç&–6WÇÃ’’“°¢6öç7B6VÆÅW&6VçBÒÖ&¶WE6VÆÅW&6VçEcs2†öffW"Â—FVÒ“°¢&WGW&âÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖ6&B×cs#âG·&VæFW%F‡VÖ"†—FVÒÇ·6—¦S¢w6ÒrÇG—S¢v—FVÒrÆvÇ—ƒ¦–æ—F–Ç2†—FVÒææÖRÂ~)j2r—Ò—ÓÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖFWF–Ç2×cs#ãÆF—b6Æ73Ò&Ö&¶WB×6VÆV7F–öâÖ†VF–ær×cs#ãÆ#âG¶W62†—FVÒææÖWÇÆ—FVÒæ–B—ÓÂö#ãÇ7G&öæsâG¶'W’ò	ýí­=ý­¢G¶f÷&ÖD7&VF—G2‡&–6WÇÃ—Ö¢öffW"ò	ýíMm¢G¶f÷&ÖD7&VF—G2‡&–6WÇÃ—Ò‚G·6VÆÅW&6VçGÒR–¢}
]=íMÝòÝ-í"-í-ÝRýÝÍ]-òwÓÂ÷7G&öæsãÂöF—câG¶Ö&¶WD—FVÔFWF–Ç5cs†—FVÒÆöffW"—ÒG¶'W’bb66—G“òæö³ÓÓÖfÇ6RòÇ6ÖÆÂ6Æ73Ò&W'&÷"ÖÆ–æR#âG¶W62†66—G’ç&V6öâ—ÓÂ÷6ÖÆÃæ¢rwÓÂöF—cãÆ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ&'WGFöâ"FFÖÖ&¶WBÖ7F–öâ×csÒ"G¶'W“òv'W’s¢w6VÆÂwÒ"G¶F—6&ÆVCòvF—6&ÆVBs¢rwÓâG¶'W“ò}	­
=	ý	
-
Âs¢}	ý
	í	M	
-
ÂwÓÂö'WGFöããÂöF—cæ°¢Ð ¢gVæ7F–öâ&VæFW$Ö&¶WEcs‚’°¢6öç7BÆæWBÒFFævWEÆæWB…T’ç6VÆV7FVEÆæWD–B“°¢6öç7BW6W"Òæ7W'&VçEW6W#°¢–b‚ÆæWBÇÂW6W"ÇÂ—4VçF—G•f—6–&ÆR‡ÆæWB’’&WGW&ã°¢6öç7B66W72ÒvWDÖ&¶WD66W757FFR‡W6W"ÂÆæWBæ–B“°¢6öç7B&÷FF–öâÒÖ&¶WE&÷FF–öåcs‡ÆæWB“°¢6öç7Bf—6–&ÆTöffW'2Ò&÷FF–öâæöffW'2æf–ÇFW"†öffW"ÓâÖ&¶WEF$ÖF6†W5cs2„FFævWD—FVÒ†öffW"æ—FVÔ–B’’“°¢6öç7Bf—6–&ÆTÆÄöffW'2Ò&÷FF–öâæÆÄöffW'2æf–ÇFW"†öffW"ÓâÖ&¶WEF$ÖF6†W5cs2„FFævWD—FVÒ†öffW"æ—FVÔ–B’’“°¢–b‡6VÆV7F–öâbb‚Ö&¶WEF$ÖF6†W5cs2„FFævWD—FVÒ‡6VÆV7F–öâæ—FVÔ–B’’ÇÂ‡6VÆV7F–öâç6÷W&6RÓÓÒvÖ&¶WBrbbf—6–&ÆTöffW'2ç6öÖR†öffW"ÓâöffW"æ—FVÔ–BÓÓÒ6VÆV7F–öâæ—FVÔ–B’’’’6VÆV7F–öâÒçVÆÃ°¢B‚r6Ö&¶WB×F—FÆRr’çFW‡D6öçFVçBÒ
-	í
	=	í	-
½	’
-	]
	Í		Ý		²+rG·ÆæWBææÖRçFõWW$66R‚—Ö°¢B‚r6Ö&¶WB×7V'F—FÆRr’çFW‡D6öçFVçBÒ66W72æ6ä'W’ò	=í-í’M]ÝÂ½Ý­¢G¶f÷&ÖDÆ÷&TFFUcsR‡&÷FF–öâç&÷FF–öä¶W’Â²–æ6ÇVFUF–ÖS¢fÇ6RÒ—Ö¢66W72ç&V6öã°¢B‚r6Ö&¶WBÖ&Ææ6Rr’çFW‡D6öçFVçBÒf÷&ÖD7&VF—G2‡W6W"æ7&VF—G2“°¢B‚r6Ö&¶WB×ÆæWBr’çFW‡D6öçFVçBÒÆæWBææÖS°¢6öç7B&ö÷BÒB‚r6Ö&¶WBÖ—FV×2r“°¢&ö÷Bæ–ææW$…DÔÂÒÆF—b6Æ73Ò&Ö&¶WB×FW&Ö–æÂ×csG¶66W72æ6ä'W“òrs¢vÆö6¶VBwÒ#à¢ÆF—b6Æ73Ò&Ö&¶WB×F'2×cs2"&öÆSÒ'F&Æ—7B"&–ÖÆ&VÃÒ-
}M]²-í=í-í=â-]ÍÝ½#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’G¶Ö&¶WEF%cs2ÓÓÒvvööG2ròv7F—fRr¢rwÒ"G—SÒ&'WGFöâ"&öÆSÒ'F""&–×6VÆV7FVCÒ"G¶Ö&¶WEF%cs2ÓÓÒvvööG2wÒ"FFÖÖ&¶WB×F"×cs3Ò&vööG2#í
-	í	-	

³Âö'WGFöããÆ'WGFöâ6Æ73Ò'6V6öæF'’G¶Ö&¶WEF%cs2ÓÓÒw7Fö6·2ròv7F—fRr¢rwÒ"G—SÒ&'WGFöâ"&öÆSÒ'F""&–×6VÆV7FVCÒ"G¶Ö&¶WEF%cs2ÓÓÒw7Fö6·2wÒ"FFÖÖ&¶WB×F"×cs3Ò'7Fö6·2#í		­
m		ƒÂö'WGFöããÂöF—cà¢ÆF—b6Æ73Ò&Ö&¶WBÖ66W72Ö&ææW"×csG¶66W72æ6ä'W“òvö²s¢vW'"wÒ#âG¶66W72æ6ä'W’ò
-í=í-½òMí-=ýÝÝý½Ý]-RÆ#âG¶W62‡ÆæWBææÖR—ÓÂö#ââ	í½}Ý½R-í-²ýíMí-ò}sRÂ­m‚(	B}R-]­=]’m]Ý²æ¢Æ#í
-í=í-½ò}½í­í-ÝãÂö#âG¶W62†66W72ç&V6öâ—ÖÓÂöF—cà¢ÆF—b6Æ73Ò&Ö&¶WBÖGVÂÖw&–B×cs#à¢Ç6V7F–öâ6Æ73Ò&Ö&¶WB×æR×csÖ&¶WB×7Fö6²×æR×cs"FFÖÖ&¶WB×7Fö6²ÖG&÷×csãÆF—b6Æ73Ò&Ö&¶WB×æRÖ†VB×cs#ãÆF—cãÇ7â6Æ73Ò&Ööæò66VçB#âG¶Ö&¶WEF%cs2ÓÓÒw7Fö6·2rò}		­
m		‚r¢}
-	í	-	

²wÓÂ÷7ããÆ#âG¶Ö&¶WEF%cs2ÓÓÒw7Fö6·2rò}	­m‚r¢}
-í-²wÓÂö#ãÂöF—cãÇ7ãâG·f—6–&ÆTöffW'2æÆVæwF‡ÒýírãÂ÷7ããÂöF—cãÆF—b6Æ73Ò&Ö&¶WB×6†÷Öw&–B×cs#âG·f—6–&ÆTöffW'2æÖ†Ö&¶WDöffW%F–ÆUcs’æ¦ö–â‚rr’ÇÂÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	"-]­=]’í-m‚Ý]"G¶Ö&¶WEF%cs2ÓÓÒw7Fö6·2rò}­m’r¢}-í-í"wÒãÂöF—cæÓÂöF—cãÂ÷6V7F–öãà¢Ç6V7F–öâ6Æ73Ò&Ö&¶WB×æR×cs#ãÆF—b6Æ73Ò&Ö&¶WB×æRÖ†VB×cs#ãÆF—cãÇ7â6Æ73Ò&Ööæò66VçB#í		Ý	-	]	Ý
-	

ÃÂ÷7ããÆ#âG¶Ö&¶WEF%cs2ÓÓÒw7Fö6·2rò}	ýí-M]½Âr¢}	Ý-]Ý-ÂwÓÂö#ãÂöF—cãÇ7ãâG¶f÷&ÖD7&VF—G2‡W6W"æ7&VF—G2—ÓÂ÷7ããÂöF—câG¶Ö&¶WD–çfVçF÷'”w&–Ecs‡W6W"Çf—6–&ÆTÆÄöffW'2ÆÖ&¶WEF%cs2—ÓÂ÷6V7F–öãà¢ÂöF—cà¢G¶Ö&¶WE6VÆV7F–öåæVÅcs‡&÷FF–öâÇW6W"—Ð¢ÆF—b6Æ73Ò'6ÖÆÂÖæ÷FRÖ&¶WB×&÷FF–öâÖæ÷FR×cs#í
Ý­ýí-ÝÝ½Rý]MÍ]-²Ý]½Í}òýíM-ÂãÂöF—cà¢ÂöF—cæ°¢&ö÷BçVW'•6VÆV7F÷$ÆÂ‚u¶FFÖÖ&¶WBÖG&r×csÒr’æf÷$V6‚†æöFRÓâæöFRæF—6&ÆVBÒ66W72æ6ä'W’“°¢Ð ¢T’ç&VæFW$Ö&¶WBÒ&VæFW$Ö&¶WEcs° ¢7–æ2gVæ7F–öâÆö6ÄÖ&¶WEG&ç67F–öåcs‡²7F–öâÂ—FVÔ–BÂVæ—D–æFW‚ÒÓÂF&vWE÷6—F–öâÒçVÆÂÒ’°¢6öç7BW6W"Òæ7W'&VçEW6W#°¢6öç7BÆæWBÒFFævWEÆæWB…T’ç6VÆV7FVEÆæWD–B“°¢6öç7B&÷FF–öâÒÖ&¶WE&÷FF–öåcs‡ÆæWB“°¢6öç7BöffW"Ò†7F–öâÓÓÒw6VÆÂrò&÷FF–öâæÆÄöffW'2¢&÷FF–öâæöffW'2’æf–æB‡&÷rÓâ&÷ræ—FVÔ–BÓÓÒ—FVÔ–B“°¢–b‚öffW"’F‡&÷ræWrW'&÷"‚}
-í-í-=---=]""-]­=]’í-m‚r“°¢–b†7F–öâÓÓÒv'W’r’°¢6öç7B6†V6²Òv–æF÷räu%t–çfVçF÷'•ccsòæ6äFD—FVÓòâ‡W6W"Æ—FVÔ–BÃ“°¢–b†6†V6³òæö²ÓÓÒfÇ6R’F‡&÷ræWrW'&÷"†6†V6²ç&V6öâ“°¢–b„çVÖ&W"‡W6W"æ7&VF—G7ÇÃ’ÂöffW"ç&–6R’F‡&÷ræWrW'&÷"‚}	Ý]Mí--í}Ýâ­]M-í"r“°¢W6W"æ7&VF—G2ÒçVÖ&W"‡W6W"æ7&VF—G7ÇÃ’ÒöffW"ç&–6S°¢W6W"æ–çfVçF÷'’Ò'&’æ—4'&’‡W6W"æ–çfVçF÷'’’òW6W"æ–çfVçF÷'’¢µÓ°¢ÆWBVçG'’ÒW6W"æ–çfVçF÷'’æf–æB‡&÷sÓç&÷ræ—FVÔ–CÓÓÖ—FVÔ–B“°¢–b‚VçG'’—¶VçG'“×¶—FVÔ–BÇG“£Ç÷6—F–öç3¥µ×Ó·W6W"æ–çfVçF÷'’çW6‚†VçG'’“·Ð¢VçG'’çG“ÔçVÖ&W"†VçG'’çG—ÇÃ’³¶VçG'’ç÷6—F–öç3Ô'&’æ—4'&’†VçG'’ç÷6—F–öç2“öVçG'’ç÷6—F–öç3¥µÓ·v†–ÆR†VçG'’ç÷6—F–öç2æÆVæwFƒÆVçG'’çG’–VçG'’ç÷6—F–öç2çW6‚†çVÆÂ“°¢–b‡F&vWE÷6—F–öâ–VçG'’ç÷6—F–öç5¶VçG'’çG’ÓÓ×·ƒ¤çVÖ&W"‡F&vWE÷6—F–öâç‚’Ç“¤çVÖ&W"‡F&vWE÷6—F–öâç’—Ó°¢–b†öffW"çVæ—VR—¶6öç7B6Æ–×3×²âââ„ç7FFRæÖ&¶WE'VçF–ÖUcsòæ6Æ–×7ÇÇ·Ò—Ó¶6Æ–×5´Væv–æRæ6Æ–Ô¶W’†Ö&¶WD6×–vä–Ecs‚’ÇÆæWBæ–BÇ&÷FF–öâç&÷FF–öä¶W’Æ—FVÔ–B•Ó×·Æ–W$–C§W6W"æ–BÆ&÷Vv‡DC¦æWrFFR‚’çFô•4õ7G&–ær‚—Ó´ç7FFRæÖ&¶WE'VçF–ÖUcs×¶6Æ–×2ÇWFFVDC¦æWrFFR‚’çFô•4õ7G&–ær‚—Ó·Ð¢ÒVÇ6R°¢6öç7BVçG'“×W6W"æ–çfVçF÷'“òæf–æB‡&÷sÓç&÷ræ—FVÔ–CÓÓÖ—FVÔ–B“¶–b‚VçG'’—F‡&÷ræWrW'&÷"‚}	"Ý-]Ý-RÝ]"Ý-í=âý]MÍ]-r“°¢6öç7BWV—VCÕ·W6W"æWV—ÖVçE6Æ÷G3òç&–Ö'•vVöçÇÇW6W"æWV—ÖVçE6Æ÷G3òçvVöâÇW6W"æWV—ÖVçE6Æ÷G3òç6V6öæF'•vVöâÇW6W"æWV—ÖVçE6Æ÷G3òæ&Ö÷"Ââââ‡W6W"æ–×ÆçE6Æ÷G7ÇÅµÒ•Òæf–ÇFW"†–CÓæ–CÓÓÖ—FVÔ–B’æÆVæwFƒ°¢–b„çVÖ&W"†VçG'’çG—ÇÃ“ÃÖWV—VB—F‡&÷ræWrW'&÷"‚}	Ý]½Í}òýíM-ÂÝ­ýí-ÝÝ½’Ý­}]Íý½ýr“°¢6öç7B&VÖ÷fT–æFWƒÔçVÖ&W"æ—4–çFVvW"„çVÖ&W"‡Væ—D–æFW‚’’bdçVÖ&W"‡Væ—D–æFW‚“ãÖWV—VCôçVÖ&W"‡Væ—D–æFW‚“¤çVÖ&W"†VçG'’çG’’Ó¶VçG'’çG’ÓÓ¶–b„'&’æ—4'&’†VçG'’ç÷6—F–öç2’–VçG'’ç÷6—F–öç2ç7Æ–6R‡&VÖ÷fT–æFW‚Ã“¶–b†VçG'’çG“ÃÓ—W6W"æ–çfVçF÷'“×W6W"æ–çfVçF÷'’æf–ÇFW"‡&÷sÓç&÷rÓÖVçG'’“°¢W6W"æ7&VF—G3ÔçVÖ&W"‡W6W"æ7&VF—G7ÇÃ’¶öffW"ç6VÆÅ&–6S°¢–b†öffW"çVæ—VR—¶6öç7B6Æ–×3×²âââ„ç7FFRæÖ&¶WE'VçF–ÖUcsòæ6Æ–×7ÇÇ·Ò—Ó¶FVÆWFR6Æ–×5´Væv–æRæ6Æ–Ô¶W’†Ö&¶WD6×–vä–Ecs‚’ÇÆæWBæ–BÇ&÷FF–öâç&÷FF–öä¶W’Æ—FVÔ–B•Ó´ç7FFRæÖ&¶WE'VçF–ÖUcs×¶6Æ–×2ÇWFFVDC¦æWrFFR‚’çFô•4õ7G&–ær‚—Ó·Ð¢Ð¢v—Bç6fU7FFR†G¶7F–öãÓÓÒv'W’sò}	­=ý½]Ýâs¢}	ýíMÝâwÓ¢G´FFævWD—FVÒ†—FVÔ–B“òææÖWÇÆ—FVÔ–GÖ“°¢&WGW&â¶ö³§G'VRÇ7FGW3¢vÆö6ÂwÓ°¢Ð ¢7–æ2gVæ7F–öâG&ç67DÖ&¶WEcs‡–ÆöB’°¢6öç7BW6W"Òæ7W'&VçEW6W#°¢6öç7BÆæWBÒFFævWEÆæWB…T’ç6VÆV7FVEÆæWD–B“°¢6öç7B66W72ÒvWDÖ&¶WD66W757FFR‡W6W"ÇÆæWCòæ–B“°¢–b‚66W72æ6ä'W’’F‡&÷ræWrW'&÷"†66W72ç&V6öâ“°¢ÆWB&W7VÇC°¢–b…7–æ3òæ6öæf–sòæVæ&ÆVBbbv–æF÷ræVÆV7G&öä“òçG&ç67DÖ&¶WB’°¢&W7VÇBÒv—Bv–æF÷ræVÆV7G&öä’çG&ç67DÖ&¶WB‡·Æ–W$–C§W6W"æ–BÇÆæWD–C§ÆæWBæ–BÂââç–ÆöGÒ“°¢–b‚&W7VÇCòæö²’F‡&÷ræWrW'&÷"‡&W7VÇCòæÖW76vWÇÂ}	íý]mò½Ý­ÝR-½ýí½Ý]Ýr“°¢–b‡&W7VÇBçÆ–W"’°¢ç7FFRçW6W'5·W6W"æ–EÓÖæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡²ââäç7FFRçW6W'5·W6W"æ–EÒÂââç&W7VÇBçÆ–W"Æ–C§W6W"æ–GÒ“°¢Ä”U%õDTÕÄDU5·W6W"æ–EÓÖFVW„ç7FFRçW6W'5·W6W"æ–EÒ“°¢v—Bçw&—FTÆö6ÄÖ—'&÷'2‚“°¢Ð¢–b‡&W7VÇBç6æ6†÷D6†ævVB–v—B7–æ2æ6†V6´f÷%&VÖ÷FUWFFW2‚vÖ&¶WB×G&ç67F–öârÇ¶Ç”–dæWvW#§G'VRÇ6–ÆVçC§G'VWÒ“°¢v—BÆ–W%7–æ2çVÆÅWFFW2‚vÖ&¶WB×G&ç67F–öârÇ¶f÷&6TgVÆÃ§G'VRÇ6–ÆVçC§G'VRÇ&W&VæFW#¦fÇ6WÒ“°¢ÒVÇ6R&W7VÇBÒv—BÆö6ÄÖ&¶WEG&ç67F–öåcs‡–ÆöB“°¢6VÆV7F–öãÖçVÆÃ°¢VF–ôÖævW"çÆ’‡–ÆöBæ7F–öãÓÓÒv'W’sòvÖ&¶WD'W’s¢wV”6Æ–6²rÇ·föÇVÖS£ã—Ò“°¢ç&Vg&W6„gFW$Æö6Åw&—FR‚“°¢Fö7Bç6†÷r‡–ÆöBæ7F–öãÓÓÒv'W’sò}	ýí­=ý­}-]]Ýs¢}	ýíMm}-]]ÝrÂvö²r“°¢&WGW&â&W7VÇC°¢Ð ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂWfVçBÓâ°¢6öç7BF#ÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WB×F"×cs5Òr“°¢–b‡F"bgF"æ6Æ÷6W7B‚r6Ö&¶WBÖ—FV×2r’—¶Ö&¶WEF%cs3×F"æFF6WBæÖ&¶WEF%cs3ÓÓÒw7Fö6·2sòw7Fö6·2s¢vvööG2s·6VÆV7F–öãÖçVÆÃ·&VæFW$Ö&¶WEcs‚“·&WGW&ã·Ð¢6öç7BF–ÆSÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WBÖG&r×csÒr“°¢–b‡F–ÆRbgF–ÆRæ6Æ÷6W7B‚r6Ö&¶WBÖ—FV×2r’—·6VÆV7F–öã×·6÷W&6S¥7G&–ær‡F–ÆRæFF6WBç6÷W&6WÇÂrr’Æ—FVÔ–C¥7G&–ær‡F–ÆRæFF6WBæ—FVÔ–GÇÂrr’ÇVæ—D–æFWƒ¤çVÖ&W"‡F–ÆRæFF6WBçVæ—D–æFWƒóòÓ—Ó·&VæFW$Ö&¶WEcs‚“·&WGW&ã·Ð¢6öç7B7F–öãÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WBÖ7F–öâ×csÒr“°¢–b‚7F–öçÇÂ6VÆV7F–öâ—&WGW&ã°¢G&ç67DÖ&¶WEcs‡¶7F–öã¥7G&–ær†7F–öâæFF6WBæÖ&¶WD7F–öåcs’Æ—FVÔ–C§6VÆV7F–öâæ—FVÔ–BÇVæ—D–æFWƒ§6VÆV7F–öâçVæ—D–æFW‡Ò’æ6F6‚†W'&÷#ÓåFö7Bç6†÷r†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r’“°¢Ò“° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&w7F'BrÆWfVçCÓç¶6öç7BæöFSÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WBÖG&r×csÒr“¶–b‚æöFWÇÂæöFRæ6Æ÷6W7B‚r6Ö&¶WBÖ—FV×2r’—&WGW&ã¶G&s×·6÷W&6S¥7G&–ær†æöFRæFF6WBç6÷W&6WÇÂrr’Æ—FVÔ–C¥7G&–ær†æöFRæFF6WBæ—FVÔ–GÇÂrr’ÇVæ—D–æFWƒ¤çVÖ&W"†æöFRæFF6WBçVæ—D–æFWƒóòÓ—Ó¶WfVçBæFFG&ç6fW"æVffV7DÆÆ÷vVCÖG&rç6÷W&6SÓÓÒvÖ&¶WBsòv6÷’s¢vÖ÷fRs·G'—¶WfVçBæFFG&ç6fW"ç6WDFF‚wFW‡B÷Æ–ârÆG&ræ—FVÔ–B“·Ö6F6‡·ÖæöFRæ6Æ74Æ—7BæFB‚vÖ&¶WBÖG&vv–ær×csr“·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&vVæBrÆWfVçCÓç¶WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WBÖG&r×csÒr“òæ6Æ74Æ—7Bç&VÖ÷fR‚vÖ&¶WBÖG&vv–ær×csr“¶G&sÖçVÆÃ·Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&v÷fW"rÆWfVçCÓç¶–b‚G&r—&WGW&ã¶6öç7BF&vWCÖG&rç6÷W&6SÓÓÒvÖ&¶WBsöWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WBÖ–çfVçF÷'’ÖG&÷×csÒr“¦WfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WB×7Fö6²ÖG&÷×csÒr“¶–b‡F&vWB—¶WfVçBç&WfVçDFVfVÇB‚“¶WfVçBæFFG&ç6fW"æG&÷VffV7CÖG&rç6÷W&6SÓÓÒvÖ&¶WBsòv6÷’s¢vÖ÷fRs·×Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚vG&÷rÆWfVçCÓç¶–b‚G&r—&WGW&ã¶6öç7B–çfVçF÷'“ÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WBÖ–çfVçF÷'’ÖG&÷×csÒr’Ç7Fö6³ÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FFÖÖ&¶WB×7Fö6²ÖG&÷×csÒr“¶–b‚†G&rç6÷W&6SÓÓÒvÖ&¶WBrbb–çfVçF÷'’—ÇÂ†G&rç6÷W&6SÓÓÒv–çfVçF÷'’rbb7Fö6²’—&WGW&ã¶WfVçBç&WfVçDFVfVÇB‚“¶6öç7B–ÆöC×¶7F–öã¦G&rç6÷W&6SÓÓÒvÖ&¶WBsòv'W’s¢w6VÆÂrÆ—FVÔ–C¦G&ræ—FVÔ–BÇVæ—D–æFWƒ¦G&rçVæ—D–æFW‡Ó¶–b†–çfVçF÷'’—¶6öç7B&V7CÖ–çfVçF÷'’ævWD&÷VæF–æt6Æ–VçE&V7B‚’Æ6öÇ3ÔçVÖ&W"†vWD6ö×WFVE7G–ÆR†–çfVçF÷'’’ævWE&÷W'G•fÇVR‚rÒÖ–çbÖ6öÇ2r’—ÇÃÆ6VÆÃ×&V7Bçv–GF‚ö6öÇ3·–ÆöBçF&vWE÷6—F–öã×·ƒ¤ÖF‚æÖ‚ƒÄÖF‚æÖ–â†6öÇ2ÓÄÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE‚×&V7BæÆVgB’ö6VÆÂ’’’Ç“¤ÖF‚æÖ‚ƒÄÖF‚æfÆö÷"‚†WfVçBæ6Æ–VçE’×&V7BçF÷’ö6VÆÂ’—Ó·ÖG&sÖçVÆÃ·G&ç67DÖ&¶WEcs‡–ÆöB’æ6F6‚†W'&÷#ÓåFö7Bç6†÷r†W'&÷"æÖW76vWÇÅ7G&–ær†W'&÷"’ÂvW'"r’“·Ò“° ¢6WD–çFW'fÂ‚‚“Óç¶6öç7B¶W“ÔVæv–æRç&÷FF–öä¶W’‚“¶–b†¶W’ÓÖÆ7E&÷FF–öä¶W’—¶Æ7E&÷FF–öä¶W“Ö¶W“·6VÆV7F–öãÖçVÆÃ¶–b…T’æ7F—fTÖöGVÆT–CÓÓÒvÖ&¶WBr•T’ç&VæFW$Ö&¶WCòâ‚“·×ÒÃc“°¢6WD–çFW'fÂ‚‚“Óç¶–b‡F#ÓÓÒw7Fö6·2rbeT’æ7F—fTÖöGVÆT–CÓÓÒvÖ&¶WBr—&Vg&W6„W†6†ævUcC‚‚’æ6F6‚‚‚“Óç·Ò“·ÒÃ“°§Ò’‚“° §v–æF÷räu%t–ç7FÆÄvÆö&Å7Fö6´W†6†ævUcsCòâ‚“° ¢òòÓÓÓÒcããs’66Æ&ÆR&6†—fR6FÆörÂvÆö&Â6V&6‚æBW'6öæÂ6öÆÆV7F–öç2ÓÓÓÐ¢†gVæ7F–öâ‚—°¢–b‡v–æF÷råõö&6†—fT6FÆöucs’’&WGW&ã°¢v–æF÷råõö&6†—fT6FÆöucs’ÒG'VS° ¢6öç7Bddõ$•DU5ô´U•õcs’Òtu$•ô$4„•dUôddõ$•DU5õcs’s°¢6öç7B$T4TåEô´U•õcs’Òtu$•ô$4„•dUõ$T4TåEõcs’s°¢6öç7B$TEô´U•õcs’Òtu$•ô$4„•dUô%D”4ÄUõ$TEõcC"s°¢6öç7B4T5D”ôåôõ$DU%õcs’Ò²v'F–6ÆW2rÂwÆæWG2rÂw7—7FV×2rÂvWV—ÖVçBuÓ°¢6öç7B4T5D”ôåôÄ$TÅ5õcs’Ò¶'F–6ÆW3¢}
--Í‚rÇÆæWG3¢}	ý½Ý]-²rÇ7—7FV×3¢}
-]Í²rÆWV—ÖVçC¢}
Ýým]ÝRwÓ° ¢v–¶’æ&6†—fU66÷Ucs’Òv–¶’æ&6†—fU66÷Ucs’ÇÂw6V7F–öâs°¢v–¶’æ&6†—fT6FVv÷'•cs’Òv–¶’æ&6†—fT6FVv÷'•cs’ÇÂvÆÂs°¢v–¶’æ&6†—fU7FGW5cs’Òv–¶’æ&6†—fU7FGW5cs’ÇÂvÆÂs°¢v–¶’æ&6†—fU6÷'Ecs’Òv–¶’æ&6†—fU6÷'Ecs’ÇÂwF—FÆRs°¢v–¶’æ&6†—fUVW'•cs’Òv–¶’æ&6†—fUVW'•cs’ÇÂrs° ¢gVæ7F–öâ&6†—fUW6W$¶W•cs’‚—°¢&WGW&âòæ7W'&VçEW6W#òç&öÆRÓÓÒvvÒròvvÒr¢7G&–ær„òæ7W'&VçEW6W$–BÇÂòæ7W'&VçEW6W#òæ–BÇÂvwVW7Br“°¢Ð¢gVæ7F–öâ&VDÆö6ÄÖcs’†¶W’—°¢G'’²6öç7BfÇVSÔ¥4ôâç'6R†Æö6Å7F÷&vRævWD—FVÒ†¶W’—ÇÂw·Òr“²&WGW&âfÇVRbgG—VöbfÇVSÓÓÒvö&¦V7Bs÷fÇVS§·Ó²Ð¢6F6‚²&WGW&â·Ó²Ð¢Ð¢gVæ7F–öâw&—FTÆö6ÄÖcs’†¶W’ÇfÇVR—²G'’²Æö6Å7F÷&vRç6WD—FVÒ†¶W’Ä¥4ôâç7G&–æv–g’‡fÇVWÇÇ·Ò’“²Ò6F6‚·ÒÐ¢gVæ7F–öâ&6†—fT†—D¶W•cs’††—D÷%G—RÆ–CÒrr—°¢–b‡G—Vöb†—D÷%G—SÓÓÒvö&¦V7Br’&WGW&âGµ7G&–ær††—D÷%G—RçG—WÇÆ†—D÷%G—RæVçF—G“òå÷G—WÇÂrr—Ó¢Gµ7G&–ær††—D÷%G—RæVçF—G“òæ–GÇÆ†—D÷%G—Ræ–GÇÂrr—Ö°¢&WGW&âGµ7G&–ær††—D÷%G—WÇÂrr—Ó¢Gµ7G&–ær†–GÇÂrr—Ö°¢Ð¢gVæ7F–öâff÷&—FW5cs’‚—°¢6öç7BÖ×&VDÆö6ÄÖcs’„ddõ$•DU5ô´U•õcs’“°¢&WGW&âæWr6WB‚†Ö¶&6†—fUW6W$¶W•cs’‚•×ÇÅµÒ’æÖ…7G&–ær’“°¢Ð¢gVæ7F–öâFövvÆTff÷&—FUcs’‡G—RÆ–B—°¢6öç7BÖ×&VDÆö6ÄÖcs’„ddõ$•DU5ô´U•õcs’’ÇW6W#Ö&6†—fUW6W$¶W•cs’‚’Ç6WCÖæWr6WB‚†Ö·W6W%×ÇÅµÒ’æÖ…7G&–ær’’Æ¶W“Ö&6†—fT†—D¶W•cs’‡G—RÆ–B“°¢–b‡6WBæ†2†¶W’’—6WBæFVÆWFR†¶W’“¶VÇ6R6WBæFB†¶W’“°¢Ö·W6W%ÓÔ'&’æg&öÒ‡6WB“·w&—FTÆö6ÄÖcs’„ddõ$•DU5ô´U•õcs’ÆÖ“°¢Ð¢gVæ7F–öâ&V6VçEcs’‚—°¢6öç7BÖ×&VDÆö6ÄÖcs’…$T4TåEô´U•õcs’“°¢&WGW&â'&’æ—4'&’†Ö¶&6†—fUW6W$¶W•cs’‚•Ò“öÖ¶&6†—fUW6W$¶W•cs’‚•ÒæÖ…7G&–ær“¥µÓ°¢Ð¢gVæ7F–öâ&VÖVÖ&W%&V6VçEcs’‡G—RÆ–B—°¢6öç7BÖ×&VDÆö6ÄÖcs’…$T4TåEô´U•õcs’’ÇW6W#Ö&6†—fUW6W$¶W•cs’‚’Æ¶W“Ö&6†—fT†—D¶W•cs’‡G—RÆ–B“°¢Ö·W6W%ÓÕ¶¶W’Ââââ„'&’æ—4'&’†Ö·W6W%Ò“öÖ·W6W%Ó¥µÒ’æf–ÇFW"‡fÇVSÓå7G&–ær‡fÇVR’ÓÖ¶W’•Òç6Æ–6RƒÃ3“°¢w&—FTÆö6ÄÖcs’…$T4TåEô´U•õcs’ÆÖ“°¢Ð¢gVæ7F–öâ—5Vç&VEcs’††—B—°¢–b††—CòçG—RÓÒv'F–6ÆRwÇÂ†—BæVçF—G“òæ–B—&WGW&âfÇ6S°¢6öç7BÖ×&VDÆö6ÄÖcs’…$TEô´U•õcs’’Ç&VCÖæWr6WB‚†Ö¶&6†—fUW6W$¶W•cs’‚•×ÇÅµÒ’æÖ…7G&–ær’“°¢&WGW&â&VBæ†2…7G&–ær††—BæVçF—G’æ–B’“°¢Ð¢gVæ7F–öâæ÷&ÖÆ—¦VEFW‡Ecs’‡fÇVR—°¢&WGW&â7G&–ær‡fÇVSóòrr’ç&WÆ6R‚óÅµãåÒ£âörÂrr’ç&WÆ6R‚òe¶×¢3Ó•Ò³²öv’Ârr’ç&WÆ6R‚ýörÂ}Rr’ç&WÆ6R‚õÇ2²örÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢Ð¢gVæ7F–öâ6V&6†&ÆUfÇVW5cs’‡fÇVRÆ÷WCÕµÒÆFWFƒÓÆ¶W“Òrr—°¢–b‡fÇVSÓÖçVÆÇÇÆFWFƒãB—&WGW&â÷WC°¢–b‡G—VöbfÇVSÓÓÒw7G&–ærwÇÇG—VöbfÇVSÓÓÒvçVÖ&W"r—°¢6öç7BFW‡CÕ7G&–ær‡fÇVR“°¢–b‚õæFF¢ö’çFW7B‡FW‡B’bbò†–ÖvWÆfF'ÆÖVF–ÇF‡VÖ'Æ&6¶w&÷VæGÆ76WB’ö’çFW7B†¶W’’–÷WBçW6‚‡FW‡B“°¢&WGW&â÷WC°¢Ð¢–b„'&’æ—4'&’‡fÇVR’—·fÇVRç6Æ–6RƒÃ’æf÷$V6‚†VçG'“Óç6V&6†&ÆUfÇVW5cs’†VçG'’Æ÷WBÆFWF‚³Æ¶W’’“·&WGW&â÷WC·Ð¢–b‡G—VöbfÇVSÓÓÒvö&¦V7Br”ö&¦V7BæVçG&–W2‡fÇVR’æf÷$V6‚‚…¶6†–ÆD¶W’ÆVçG'•Ò“Óç6V&6†&ÆUfÇVW5cs’†VçG'’Æ÷WBÆFWF‚³Æ6†–ÆD¶W’’“°¢&WGW&â÷WC°¢Ð¢gVæ7F–öâ6V7F–öäf÷$†—Ecs’††—B—°¢&WGW&â‡¶'F–6ÆS¢v'F–6ÆW2rÇÆæWC¢wÆæWG2rÇ7—7FVÓ¢w7—7FV×2rÆ—FVÓ¢vWV—ÖVçBwÒ•¶†—CòçG—U×ÇÂv'F–6ÆW2s°¢Ð¢gVæ7F–öâ&6T6FVv÷'•cs’††—B—°¢6öç7BVçF—G“Ö†—CòæVçF—G—ÇÇ·Ó°¢–b††—CòçG—SÓÓÒv'F–6ÆRr—&WGW&â7G&–ær†VçF—G’æ6FVv÷'—ÇÆVçF—G’ç6V7F–öçÇÂ}	]r­-]=í‚r’çG&–Ò‚—ÇÂ}	]r­-]=í‚s°¢–b††—CòçG—SÓÓÒv—FVÒr—&WGW&â7G&–ær‡G—Vöb—FVÕG—TÆ&VÅc#ÓÓÒvgVæ7F–öâsö—FVÕG—TÆ&VÅc"†VçF—G’çG—WÇÆVçF—G’æ6FVv÷'’“¦VçF—G’çG—WÇÆVçF—G’æ6FVv÷'—ÇÂ}	ýí}]Rr’çG&–Ò‚—ÇÂ}	ýí}]Rs°¢–b††—CòçG—SÓÓÒwÆæWBr—&WGW&â7G&–ær†VçF—G’æÆö6F–öãòç7—7FV×ÇÆVçF—G’æÆö6F–öãòæö&§ÇÆVçF—G’æ6öFWÇÂ}	M==Rý½Ý]-²r’çG&–Ò‚—ÇÂ}	M==Rý½Ý]-²s°¢&WGW&â}	}-}MÝ½R-]Í²s°¢Ð¢gVæ7F–öâ6FVv÷'•cs’††—BÆvÆö&Å66÷SÖfÇ6R—°¢6öç7B&6SÖ&6T6FVv÷'•cs’††—B“°¢&WGW&âvÆö&Å66÷SöGµ4T5D”ôåôÄ$TÅ5õcs•·6V7F–öäf÷$†—Ecs’††—B•×Ò+rG¶&6WÖ¦&6S°¢Ð¢gVæ7F–öâ'F–6ÆU6V&6„öæÇ•cƒ"††—B—°¢6öç7BfÇVSÖ†—CòæVçF—G“òç6V&6„öæÇ“°¢&WGW&â†—CòçG—SÓÓÒv'F–6ÆRrbb‡fÇVSÓÓ×G'VWÇÅ7G&–ær‡fÇVWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒwG'VRr“°¢Ð¢gVæ7F–öâÆÄ†—G5cs’‚—°¢6öç7B6V7F–öç3Õv–¶’æ&6†—fU66÷Ucs“ÓÓÒvÆÂsõ4T5D”ôåôõ$DU%õcs“¥µv–¶’æ7F—fU6V7F–öçÇÂv'F–6ÆW2uÓ°¢6öç7Bf÷VæCÖæWrÖ‚“°¢6V7F–öç2æf÷$V6‚‡6V7F–öãÓâ…v–¶’æVçF—G•ööÂ‡6V7F–öâ—ÇÅµÒ’æf÷$V6‚††—CÓæf÷VæBç6WB†&6†—fT†—D¶W•cs’††—B’Æ†—B’’“°¢&WGW&â'&’æg&öÒ†f÷VæBçfÇVW2‚’“°¢Ð¢gVæ7F–öâf–ÇFW$†—G5cs’‚—°¢6öç7BFö¶Vç3Öæ÷&ÖÆ—¦VEFW‡Ecs’…v–¶’æ&6†—fUVW'•cs’’ç7Æ—B‚rr’æf–ÇFW"„&ööÆVâ“°¢6öç7B&6SÖÆÄ†—G5cs’‚’æf–ÇFW"††—CÓç°¢–b‚'F–6ÆU6V&6„öæÇ•cƒ"††—B’—&WGW&âG'VS°¢–b‚Fö¶Vç2æÆVæwF‚—&WGW&âfÇ6S°¢6öç7BF—FÆSÖæ÷&ÖÆ—¦VEFW‡Ecs’‡F—FÆTf÷$VçF—G’††—BçG—RÆ†—BæVçF—G’’“°¢&WGW&âFö¶Vç2æWfW'’‡Fö¶VãÓçF—FÆRæ–æ6ÇVFW2‡Fö¶Vâ’“°¢Ò’ÆvÆö&Å66÷SÕv–¶’æ&6†—fU66÷Ucs“ÓÓÒvÆÂs°¢6öç7B6FVv÷&–W3Ô'&’æg&öÒ†æWr6WB†&6RæÖ††—CÓæ6FVv÷'•cs’††—BÆvÆö&Å66÷R’’’’ç6÷'B‚†Æ"“ÓææÆö6ÆT6ö×&R†"Âw'Rr’“°¢–b…v–¶’æ&6†—fT6FVv÷'•cs’ÓÒvÆÂrbb6FVv÷&–W2æ–æ6ÇVFW2…v–¶’æ&6†—fT6FVv÷'•cs’’•v–¶’æ&6†—fT6FVv÷'•cs“ÒvÆÂs°¢6öç7Bff÷&—FW3Öff÷&—FW5cs’‚’Ç&V6VçC×&V6VçEcs’‚’Ç&V6VçD–æFWƒÖæWrÖ‡&V6VçBæÖ‚†¶W’Æ–æFW‚“Óå¶¶W’Æ–æFW…Ò’“°¢ÆWB&÷w3Ö&6Ræf–ÇFW"††—CÓç°¢–b…v–¶’æ&6†—fT6FVv÷'•cs’ÓÒvÆÂrbf6FVv÷'•cs’††—BÆvÆö&Å66÷R’ÓÕv–¶’æ&6†—fT6FVv÷'•cs’—&WGW&âfÇ6S°¢6öç7B¶W“Ö&6†—fT†—D¶W•cs’††—B“°¢–b…v–¶’æ&6†—fU7FGW5cs“ÓÓÒwVç&VBrbb—5Vç&VEcs’††—B’—&WGW&âfÇ6S°¢–b…v–¶’æ&6†—fU7FGW5cs“ÓÓÒvff÷&—FW2rbbff÷&—FW2æ†2†¶W’’—&WGW&âfÇ6S°¢–b…v–¶’æ&6†—fU7FGW5cs“ÓÓÒw&V6VçBrbb&V6VçD–æFW‚æ†2†¶W’’—&WGW&âfÇ6S°¢–b‚Fö¶Vç2æÆVæwF‚—&WGW&âG'VS°¢6öç7B†“Öæ÷&ÖÆ—¦VEFW‡Ecs’…¶†—Bç7VÖÖ'’Âââç6V&6†&ÆUfÇVW5cs’††—BæVçF—G’•Òæ¦ö–â‚rr’“°¢&WGW&âFö¶Vç2æWfW'’‡Fö¶VãÓæ†’æ–æ6ÇVFW2‡Fö¶Vâ’“°¢Ò“°¢&÷w2ç6÷'B‚†Æ"“Óç°¢–b…v–¶’æ&6†—fU7FGW5cs“ÓÓÒw&V6VçBr—&WGW&â‡&V6VçD–æFW‚ævWB†&6†—fT†—D¶W•cs’†’“óó““’’Ò‡&V6VçD–æFW‚ævWB†&6†—fT†—D¶W•cs’†"’“óó““’“°¢–b…v–¶’æ&6†—fU6÷'Ecs“ÓÓÒwVç&VBr—°¢6öç7BVç&VCÔçVÖ&W"†—5Vç&VEcs’†"’’ÔçVÖ&W"†—5Vç&VEcs’†’“¶–b‡Vç&VB—&WGW&âVç&VC°¢Ð¢6öç7BF—FÆT÷&FW#Õ7G&–ær‡F—FÆTf÷$VçF—G’†çG—RÆæVçF—G’’’æÆö6ÆT6ö×&R…7G&–ær‡F—FÆTf÷$VçF—G’†"çG—RÆ"æVçF—G’’’Âw'Rr“°¢&WGW&âv–¶’æ&6†—fU6÷'Ecs“ÓÓÒwF—FÆUöFW62sò×F—FÆT÷&FW#§F—FÆT÷&FW#°¢Ò“°¢&WGW&â¶&6RÇ&÷w2Æ6FVv÷&–W2ÆvÆö&Å66÷WÓ°¢Ð¢gVæ7F–öâWFFTæd6÷VçG5cs’‚—°¢6öç7BÆ&VÇ3×·ÆæWG3¢}	ý	½		Ý	]
-
²rÆWV—ÖVçC¢}
	Ý	

ý	m	]	Ý		RrÆ'F–6ÆW3¢}

-	
-
Í	‚rÇ7—7FV×3¢}
	

-	]	Í
²wÓ°¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚u¶FF×v–¶’×6V7F–öâ×ccÒr’æf÷$V6‚†'WGFöãÓç°¢6öç7B6V7F–öãÖ'WGFöâæFF6WBçv–¶•6V7F–öåcc°¢6öç7B6÷VçCÒ…v–¶’æVçF—G•ööÂ‡6V7F–öâ—ÇÅµÒ’æf–ÇFW"††—CÓâ'F–6ÆU6V&6„öæÇ•cƒ"††—B’’æÆVæwFƒ°¢'WGFöâçFW‡D6öçFVçCÖG¶Æ&VÇ5·6V7F–öå×ÇÇ6V7F–öçÒ+rG¶6÷VçGÖ°¢'WGFöâæ6Æ74Æ—7BçFövvÆR‚v7F—fRrÅv–¶’æ&6†—fU66÷Ucs’ÓÒvÆÂrbg6V7F–öãÓÓÕv–¶’æ7F—fU6V7F–öâ“°¢Ò“°¢Ð¢gVæ7F–öâWFFT6öçG&öÇ5cs’‡&W7VÇB—°¢6öç7B66÷SÒB‚r7v–¶’×66÷R×cs’r’Æ6FVv÷'“ÒB‚r7v–¶’Ö6FVv÷'’×cs’r’Ç7FGW3ÒB‚r7v–¶’×7FGW2×cs’r’Ç6÷'CÒB‚r7v–¶’×6÷'B×cs’r’ÆÖWFÒB‚r7v–¶’×&W7VÇG2ÖÖWF×cs’r“°¢–b‡66÷R—66÷RçfÇVSÕv–¶’æ&6†—fU66÷Ucs“°¢–b†6FVv÷'’—¶6FVv÷'’æ–ææW$…DÔÃÖÆ÷F–öâfÇVSÒ&ÆÂ#í	-R­-]=íƒÂö÷F–öãâG·&W7VÇBæ6FVv÷&–W2æÖ‡fÇVSÓæÆ÷F–öâfÇVSÒ"G¶W62‡fÇVR—Ò#âG¶W62‡fÇVR—ÓÂö÷F–öãæ’æ¦ö–â‚rr—Ö¶6FVv÷'’çfÇVSÕv–¶’æ&6†—fT6FVv÷'•cs“·Ð¢–b‡7FGW2—7FGW2çfÇVSÕv–¶’æ&6†—fU7FGW5cs“°¢–b‡6÷'B—6÷'BçfÇVSÕv–¶’æ&6†—fU6÷'Ecs“°¢–b†ÖWF–ÖWFæ–ææW$…DÔÃÖÇ7ãí	ÝM]Ýã¢Æ#âG·&W7VÇBç&÷w2æÆVæwF‡ÓÂö#ãÂ÷7ããÇ7ãí	Mí-=ýÝã¢G·&W7VÇBæ&6RæÆVæwF‡ÓÂ÷7ãæ°¢Ð¢gVæ7F–öâ&VæFW$†—G5cs’‚—°¢WFFTæd6÷VçG5cs’‚“°¢6öç7B&W7VÇCÖf–ÇFW$†—G5cs’‚’ÇF&vWCÒB‚r7v–¶’×&W7VÇG2r“°¢–b‚F&vWB—&WGW&âµÓ°¢WFFT6öçG&öÇ5cs’‡&W7VÇB“°¢6öç7Bff÷&—FW3Öff÷&—FW5cs’‚’Æw&÷W3ÖæWrÖ‚’Ç6VÆV7FVD¶W“Õv–¶’æ7W'&VçEf–Wsö&6†—fT†—D¶W•cs’…v–¶’æ7W'&VçEf–WrçG—RÅv–¶’æ7W'&VçEf–Wræ–B“¢rs°¢&W7VÇBç&÷w2æf÷$V6‚††—CÓç¶6öç7Bw&÷WÖ6FVv÷'•cs’††—BÇ&W7VÇBævÆö&Å66÷R“¶–b‚w&÷W2æ†2†w&÷W’–w&÷W2ç6WB†w&÷WÅµÒ“¶w&÷W2ævWB†w&÷W’çW6‚††—B“·Ò“°¢6öç7Bf÷&6T÷VãÔ&ööÆVâ†æ÷&ÖÆ—¦VEFW‡Ecs’…v–¶’æ&6†—fUVW'•cs’’—ÇÅv–¶’æ&6†—fT6FVv÷'•cs’ÓÒvÆÂwÇÅv–¶’æ&6†—fU7FGW5cs’ÓÒvÆÂs°¢6öç7B&Wf–÷W567&öÆÃ×F&vWBç67&öÆÅF÷°¢6öç7B÷Väw&÷W3ÖæWr6WB„'&’æg&öÒ‡F&vWBçVW'•6VÆV7F÷$ÆÂ‚rçv–¶’Öw&÷W×cs•¶÷VåÒr’ÆæöFSÓææöFRæFF6WBæ&6†—fTw&÷W’“°¢6öç7B†Dw&÷W3Ô&ööÆVâ‡F&vWBçVW'•6VÆV7F÷"‚rçv–¶’Öw&÷W×cs’r’“°¢F&vWBæ6Æ74Æ—7BæFB‚wv–¶’×&W7VÇG2×cs’r“°¢F&vWBæ–ææW$…DÔÃÔ'&’æg&öÒ†w&÷W2æVçG&–W2‚’’æÖ‚…¶w&÷WÇ&÷w5ÒÆw&÷W–æFW‚“Óç°¢6öç7B6öçF–ç56VÆV7FVC×&÷w2ç6öÖR††—CÓæ&6†—fT†—D¶W•cs’††—B“ÓÓ×6VÆV7FVD¶W’“°¢&WGW&âÆFWF–Ç26Æ73Ò'v–¶’Öw&÷W×cs’"FFÖ&6†—fRÖw&÷WÒ"G¶W62†w&÷W—Ò"G¶†Dw&÷W3ö÷Väw&÷W2æ†2†w&÷W“òv÷Vâs¢rs¦f÷&6T÷VçÇÆ6öçF–ç56VÆV7FVGÇÆw&÷W–æFWƒÓÓÓòv÷Vâs¢rwÓãÇ7VÖÖ'“ãÇ7ãâG¶W62†w&÷W—ÓÂ÷7ããÇ7â6Æ73Ò'v–¶’Öw&÷WÖ6÷VçB×cs’#âG·&÷w2æÆVæwF‡ÓÂ÷7ããÂ÷7VÖÖ'“ãÆF—b6Æ73Ò'v–¶’Öw&÷WÖÆ—7B×cs’#âG·&÷w2æÖ††—CÓç°¢6öç7B¶W“Ö&6†—fT†—D¶W•cs’††—B’ÇVç&VCÖ—5Vç&VEcs’††—B’Æff÷&—FSÖff÷&—FW2æ†2†¶W’“°¢&WGW&âÆF—b6Æ73Ò'v–¶’Ö†—Bv–¶’Ö†—B×&–6‚v–¶’Ö†—B×cs’G·Vç&VCòwv–¶’Ö†—B×Vç&VB×cC"s¢rwÒG¶¶W“ÓÓ×6VÆV7FVD¶W“òv7F—fRs¢rwÒ"FFÖVçF—G“Ò"G¶W62††—BçG—R—Ò"FFÖ–CÒ"G¶W62††—BæVçF—G’æ–B—Ò"F&–æFWƒÒ#"&öÆSÒ&'WGFöâ#âG·&VæFW%F‡VÖ"††—BæVçF—G’Ç·6—¦S¢w6ÒrÇG—S¦†—BçG—WÒ—ÓÆF—b6Æ73Ò'v–¶’Ö†—BÖ6÷’×cs’#ãÆF—b6Æ73Ò'v–¶’Ö†—B×F—FÆR×cs’#ãÆ#âG¶W62‡F—FÆTf÷$VçF—G’††—BçG—RÆ†—BæVçF—G’’—ÓÂö#âG·Vç&VCòsÇ7â6Æ73Ò'v–¶’×Vç&VB×–ÆÂ×cC"#í	Ý	í	-	í	SÂ÷7ãâs¢rwÓÂöF—cãÆF—b6Æ73Ò'7V'FÆRv–¶’Ö†—B×7VÖÖ'’×cs’#âG¶W62††—Bç7VÖÖ'—ÇÆ&6T6FVv÷'•cs’††—B’—ÓÂöF—cãÂöF—cãÆ'WGFöâ6Æ73Ò'v–¶’Öff÷&—FR×cs’G¶ff÷&—FSòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"FF×v–¶’Öff÷&—FR×cs’FFÖVçF—G“Ò"G¶W62††—BçG—R—Ò"FFÖ–CÒ"G¶W62††—BæVçF—G’æ–B—Ò"&–ÖÆ&VÃÒ"G¶ff÷&—FSò}
=-Âr}ÝÝí=âs¢}	Mí--Â"}ÝÝíRwÒ#âG¶ff÷&—FSò~)ˆRs¢~)ˆbwÓÂö'WGFöããÂöF—cæ°¢Ò’æ¦ö–â‚rr—ÓÂöF—cãÂöFWF–Ç3æ°¢Ò’æ¦ö–â‚rr—ÇÂsÆF—b6Æ73Ò'7V'FÆR#í	Ý}]=âÝRÝM]Ýâ"ý]M]½R-]­=]=âMí-=ý‚-½ÝÝ½RM½Í-í"ãÂöF—câs°¢F&vWBç67&öÆÅF÷×&Wf–÷W567&öÆÃ°¢F&vWBçVW'•6VÆV7F÷$ÆÂ‚rçv–¶’Ö†—B×cs’r’æf÷$V6‚†æöFSÓç°¢6öç7B÷VãÒ‚“Óçµv–¶’æF—&V7D'F–6ÆT–Ecƒ#Òrsµv–¶’ç6†÷tVçF—G’†æöFRæFF6WBæVçF—G’ÆæöFRæFF6WBæ–B“·Ó°¢æöFRæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç¶–b‚WfVçBçF&vWBæ6Æ÷6W7B‚u¶FF×v–¶’Öff÷&—FR×cs•Òr’–÷Vâ‚“·Ò“°¢æöFRæFDWfVçDÆ—7FVæW"‚v¶W–F÷vârÆWfVçCÓç¶–b‚†WfVçBæ¶W“ÓÓÒtVçFW"wÇÆWfVçBæ¶W“ÓÓÒrr’bbWfVçBçF&vWBæ6Æ÷6W7B‚u¶FF×v–¶’Öff÷&—FR×cs•Òr’—¶WfVçBç&WfVçDFVfVÇB‚“¶÷Vâ‚“·×Ò“°¢Ò“°¢&WGW&â&W7VÇBç&÷w3°¢Ð ¢v–¶’ç&–ÖSÖgVæ7F–öâ‚—°¢F†—2æ&6†—fUVW'•cs“Õ7G&–ær‚B‚r7v–¶’Ö–çWBr“òçfÇVWÇÂrr“°¢&VæFW$†—G5cs’‚“°¢–b‚F†—2æ7W'&VçEf–Wr’B‚r7v–¶’ÖFWF–Âr’æ–ææW$…DÔÃÒsÆF—b6Æ73Ò'v–¶’Ö&6†—fR×vVÆ6öÖR×cs’#ãÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	­-½í2]-ÂöF—cãÇ6Æ73Ò'7V'FÆR#í	-½]-RÍ-]²"­-½í=Râ	ýí¢ýí-]ý]"}=í½í-í¢Â­-]=íâÂ­-­íRíýÝR‚ýí½Ý½’-]­"ãÂ÷ãÂöF—câs°¢Ó°¢v–¶’ç6V&6ƒÖgVæ7F–öâ‡VW'’—·F†—2æ&6†—fUVW'•cs“Õ7G&–ær‡VW'—ÇÂrr“·&VæFW$†—G5cs’‚“·Ó° ¢6öç7B÷&–v–æÅ6WE6V7F–öåcs“Õv–¶’ç6WE6V7F–öâæ&–æB…v–¶’“°¢v–¶’ç6WE6V7F–öãÖgVæ7F–öâ‡6V7F–öâÆ÷F–öç3×·Ò—°¢F†—2æF—&V7D'F–6ÆT–Ecƒ#Òrs°¢F†—2æ&6†—fT6FVv÷'•cs“ÒvÆÂs°¢F†—2æ&6†—fUVW'•cs“Òrs°¢&WGW&â÷&–v–æÅ6WE6V7F–öåcs’‡6V7F–öâÆ÷F–öç2“°¢Ó°¢6öç7B÷&–v–æÅ6†÷tVçF—G•cs“Õv–¶’ç6†÷tVçF—G’æ&–æB…v–¶’“°¢v–¶’ç6†÷tVçF—G“ÖgVæ7F–öâ‡G—RÆ–BÆWFô÷VãÖfÇ6R—°¢6öç7B&W7VÇCÖ÷&–v–æÅ6†÷tVçF—G•cs’‡G—RÆ–BÆWFô÷Vâ“°¢&VÖVÖ&W%&V6VçEcs’‡G—RÆ–B“°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚“Óç&VæFW$†—G5cs’‚’“°¢&WGW&â&W7VÇC°¢Ó° ¢ÆWB6V&6…F–ÖW%cs“ÖçVÆÃ°¢B‚r7v–¶’Ö–çWBr“òæFDWfVçDÆ—7FVæW"‚v–çWBrÆWfVçCÓç°¢6ÆV%F–ÖV÷WB‡6V&6…F–ÖW%cs’“°¢6öç7BfÇVSÖWfVçBçF&vWBçfÇVS°¢6V&6…F–ÖW%cs“×6WEF–ÖV÷WB‚‚“Óåv–¶’ç6V&6‚‡fÇVR’Ã#“°¢Ò“°¢µ²r7v–¶’×66÷R×cs’rÂv&6†—fU66÷Ucs’uÒÅ²r7v–¶’Ö6FVv÷'’×cs’rÂv&6†—fT6FVv÷'•cs’uÒÅ²r7v–¶’×7FGW2×cs’rÂv&6†—fU7FGW5cs’uÒÅ²r7v–¶’×6÷'B×cs’rÂv&6†—fU6÷'Ecs’uÕÒæf÷$V6‚‚…·6VÆV7F÷"Æ¶W•Ò“Óç°¢B‡6VÆV7F÷"“òæFDWfVçDÆ—7FVæW"‚v6†ævRrÆWfVçCÓçµv–¶•¶¶W•ÓÖWfVçBçF&vWBçfÇVWÇÂvÆÂs¶–b†¶W“ÓÓÒv&6†—fU66÷Ucs’r•v–¶’æ&6†—fT6FVv÷'•cs“ÒvÆÂs·&VæFW$†—G5cs’‚“·Ò“°¢Ò“°¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç°¢6öç7B'WGFöãÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×v–¶’Öff÷&—FR×cs•Òr“°¢–b‚'WGFöçÇÂ'WGFöâæ6Æ÷6W7B‚r6ÖöB×v–¶’r’—&WGW&ã°¢WfVçBç&WfVçDFVfVÇB‚“¶WfVçBç7F÷&÷vF–öâ‚“°¢FövvÆTff÷&—FUcs’†'WGFöâæFF6WBæVçF—G’Æ'WGFöâæFF6WBæ–B“°¢&VæFW$†—G5cs’‚“°¢Ò“°§Ò’‚“°  ¢òòÓÓÓÒcãã“3¢WF†÷&—FF—fR6W'fW"–æ&÷‚f÷"&Vv—7G&F–öâÆ–6F–öç2ÓÓÓÐ¢†gVæ7F–öâ‚—°¢–b‡v–æF÷råõöw'u&Vv—7G&F–öäFVÆ—fW'•c“"—&WGW&ã°¢v–æF÷råõöw'u&Vv—7G&F–öäFVÆ—fW'•c“#×G'VS° ¢ÆWBÆ–W$WfVçEVç7V'67&–&Uc“#ÖçVÆÃ°¢ÆWBÆ–W$WfVçEVWVUc“#Õ&öÖ—6Rç&W6öÇfR‚“° ¢7–æ2gVæ7F–öâÇ•Æ–W%&VÇF–ÖTWfVçEc“"‡–ÆöC×·Ò—°¢6öç7B&÷s×–ÆöCòç&÷wÇÇ–ÆöCòç&V6÷&GÇÆçVÆÃ°¢6öç7BÆ–W$–CÕ7G&–ær‡&÷sòçÆ–W$–GÇÇ&÷sòçÆ–W%ö–GÇÂrr’çG&–Ò‚“°¢–b‚&÷wÇÂÆ–W$–B—&WGW&ã°¢6öç7B–æ6öÖ–æufW'6–öãÔçVÖ&W"‡&÷rçfW'6–öçÇÃ“°¢6öç7B7W'&VçEfW'6–öãÔçVÖ&W"†vWEÆ–W%&VÖ÷FTÖWF‡Æ–W$–BÄç7FFR“òçfW'6–öçÇÃ“°¢–b†–æ6öÖ–æufW'6–öâbf7W'&VçEfW'6–öâbf–æ6öÖ–æufW'6–öãÆ7W'&VçEfW'6–öâ—&WGW&ã° ¢Æ–W%7–æ2æÇ•&VÖ÷FU&÷r‡&÷rÂ²6÷W&6S¢w&VÇF–ÖRrÒ“°¢v—Bçw&—FTÆö6ÄÖ—'&÷'2‚“°¢ç&Vg&W6„gFW$Æö6Åw&—FR‚“°¢Ð ¢gVæ7F–öâ&–æEÆ–W%&VÇF–ÖUc“"‚—°¢–b‡Æ–W$WfVçEVç7V'67&–&Uc“'ÇÂv–æF÷ræVÆV7G&öä“òæöåÆ–W$WfVçB—&WGW&ã°¢Æ–W$WfVçEVç7V'67&–&Uc“#×v–æF÷ræVÆV7G&öä’æöåÆ–W$WfVçB‡–ÆöCÓç°¢Æ–W$WfVçEVWVUc“#×Æ–W$WfVçEVWVUc“ ¢çF†Vâ‚‚“ÓæÇ•Æ–W%&VÇF–ÖTWfVçEc“"‡–ÆöB’¢æ6F6‚†W'&÷#Óç·G'—´FV'VræW'&÷"‚uÄ”U%ôÄ”4D”ôåõ$TÅD”ÔUôd”ÄTBrÇ¶ÖW76vS¦W'&÷#òæÖW76vWÇÅ7G&–ær†W'&÷"—Ò“·Ö6F6‡·×Ò“°¢Ò“°¢Ð ¢7–æ2gVæ7F–öâVÆÄ6†&7FW$Æ–6F–öç5c“2‚—°¢–b‚v–æF÷ræVÆV7G&öä“òçVÆÄ6†&7FW$Æ–6F–öç2—F‡&÷ræWrW'&÷"‚}
=-Ýí--RFW6·F÷ãã“2r“°¢6öç7B&W7VÇCÖv—Bv–æF÷ræVÆV7G&öä’çVÆÄ6†&7FW$Æ–6F–öç2‚“°¢–b‚&W7VÇCòæö²—F‡&÷ræWrW'&÷"‡&W7VÇCòæÖW76vWÇÂ}
]-]Ý½’m=Ý²Ý­]"Ý]Mí-=ý]Òr“°¢‡&W7VÇBç&÷w7ÇÅµÒ’æf÷$V6‚‡&÷sÓåÆ–W%7–æ2æÇ•&VÖ÷FU&÷r‡&÷rÇ¶WF†÷&—FF—fS§G'VRÇ6÷W&6S¢vÆ–6F–öâ×VÆÂwÒ’“°¢v—Bçw&—FTÆö6ÄÖ—'&÷'2‚“°¢ç&Vg&W6„gFW$Æö6Åw&—FR‚“°¢&WGW&â&W7VÇBç&÷w7ÇÅµÓ°¢Ð ¢6öç7B–æ—D&Vf÷&U&Vv—7G&F–öäFVÆ—fW'•c“#Ôæ–æ—Bæ&–æB„“°¢æ–æ—CÖ7–æ2gVæ7F–öâ‚—°¢6öç7B&W7VÇCÖv—B–æ—D&Vf÷&U&Vv—7G&F–öäFVÆ—fW'•c“"‚“°¢&–æEÆ–W%&VÇF–ÖUc“"‚“°¢&WGW&â&W7VÇC°¢Ó° ¢6öç7Bf–æ—6„Æöv–ä&Vf÷&U&Vv—7G&F–öäFVÆ—fW'•c“#Ôæf–æ—6„Æöv–âæ&–æB„“°¢æf–æ—6„Æöv–ãÖgVæ7F–öâ‚—°¢6öç7B&W7VÇCÖf–æ—6„Æöv–ä&Vf÷&U&Vv—7G&F–öäFVÆ—fW'•c“"‚“°¢&–æEÆ–W%&VÇF–ÖUc“"‚“°¢Æ–W%7–æ2ç7F'EöÆÆ–ær‚“°¢Æ–W%7–æ2çVÆÅWFFW2‚vÆöv–âÖÆ–6F–öç2ÖgVÆÂrÇ¶f÷&6TgVÆÃ§G'VRÇ6–ÆVçC§G'VRÇ&W&VæFW#§G'VRÆÆ–Ö—C£Ò’æ6F6‚†W'&÷#Óç°¢G'—´FV'VræW'&÷"‚uÄ”U%ôÄ”4D”ôåôeTÄÅõTÄÅôd”ÄTBrÇ¶ÖW76vS¦W'&÷#òæÖW76vWÇÅ7G&–ær†W'&÷"—Ò“·Ö6F6‡·Ð¢Ò“°¢VÆÄ6†&7FW$Æ–6F–öç5c“2‚’æ6F6‚†W'&÷#Óç°¢G'—´FV'VræW'&÷"‚uÄ”U%ôÄ”4D”ôåô”ä$õ…ôd”ÄTBrÇ¶ÖW76vS¦W'&÷#òæÖW76vWÇÅ7G&–ær†W'&÷"—Ò“·Ö6F6‡·Ð¢–b…7G&–ær„æ7W'&VçEW6W#òç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒr•Fö7Bç6†÷r†	m=Ý²Ý­]"Ý]Mí-=ý]Ó¢G¶W'&÷#òæÖW76vWÇÅ7G&–ær†W'&÷"—ÖÂvW'"r“°¢Ò“°¢&WGW&â&W7VÇC°¢Ó°§Ò’‚“° ¢òòÓÓÓÒcãã3¢FVF–6FVB&–6‚6†&7FW"Æ÷&R&öf–ÆRF"ÓÓÓÐ¢†gVæ7F–öâ‚—°¢–b‡v–æF÷råõöw'u&öf–ÆTÆ÷&UF%c2—&WGW&ã°¢v–æF÷råõöw'u&öf–ÆTÆ÷&UF%c3×G'VS° ¢ÆWB7F—fU&öf–ÆU6V7F–öåc3Òw&öf–ÆRs° ¢gVæ7F–öâÆ÷&UF$Æ&VÅc2‡W6W"—°¢&WGW&â7G&–ær‡W6W#òç&öÆWÇÂrr’çFôÆ÷vW$66R‚“ÓÓÒvvÒsò}	ý
	í
}	
-	
-
Â	½	í
s¢}		}	Í	]	Ý	
-
Â	½	í
s°¢Ð ¢gVæ7F–öâ&öf–ÆTÆ÷&TÖ&·Wc2‡fÇVR—°¢6öç7B6÷W&6SÕ7G&–ær‡fÇVWÇÂrr“°¢–b‚6÷W&6RçG&–Ò‚’—&WGW&âsÇ6Æ73Ò'6ÖÆÂÖæ÷FR#í	½íý]íÝmýí­ÝR}ýí½Ý]ÒãÂ÷âs°¢6öç7B‡FÖÃÒóÅÂóõ¶×¥ÕµãåÒ£âö’çFW7B‡6÷W&6R“÷6÷W&6S¦W62‡6÷W&6R’ç&WÆ6R‚õÇ#õÆâörÂsÆ'#âr“°¢&WGW&âõ÷&VæFW%&–6…FW‡B†‡FÖÂÂsÇ6Æ73Ò'6ÖÆÂÖæ÷FR#í	½íý]íÝmýí­ÝR}ýí½Ý]ÒãÂ÷âr“°¢Ð ¢gVæ7F–öâ&öf–ÆUF'5c2‡W6W"—°¢&WGW&âÆF—b6Æ73Ò'&öf–ÆR×6V7F–öâ×F'2×c2"&öÆSÒ'F&Æ—7B"&–ÖÆ&VÃÒ-
}M]½²ýíM½ò#à¢Æ'WGFöâ6Æ73Ò'6V6öæF'’G¶7F—fU&öf–ÆU6V7F–öåc3ÓÓÒw&öf–ÆRsòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"&öÆSÒ'F""&–×6VÆV7FVCÒ"G¶7F—fU&öf–ÆU6V7F–öåc3ÓÓÒw&öf–ÆRwÒ"FF×&öf–ÆR×6V7F–öâ×c3Ò'&öf–ÆR#í	ý
	í
M		½
ÃÂö'WGFöãà¢Æ'WGFöâ6Æ73Ò'6V6öæF'’G¶7F—fU&öf–ÆU6V7F–öåc3ÓÓÒvÆ÷&Rsòv7F—fRs¢rwÒ"G—SÒ&'WGFöâ"&öÆSÒ'F""&–×6VÆV7FVCÒ"G¶7F—fU&öf–ÆU6V7F–öåc3ÓÓÒvÆ÷&RwÒ"FF×&öf–ÆR×6V7F–öâ×c3Ò&Æ÷&R#âG¶Æ÷&UF$Æ&VÅc2‡W6W"—ÓÂö'WGFöãà¢ÂöF—cæ°¢Ð ¢gVæ7F–öâ&VæFW$Æ÷&U6V7F–öåc2‡&ö÷BÇW6W"—°¢6öç7B6äVF—CÕ7G&–ær‡W6W"ç&öÆWÇÂrr’çFôÆ÷vW$66R‚’ÓÒvvÒs°¢&ö÷Bæ–ææW$…DÔÃÖG·&öf–ÆUF'5c2‡W6W"—Ð¢Ç6V7F–öâ6Æ73Ò'&öf–ÆRÖÆ÷&R×6†VÆÂ×c2#à¢ÆF—b6Æ73Ò&6&B&öf–ÆRÖÆ÷&RÖ†VFW"×c2#à¢ÆF—câG·&VæFW%F‡VÖ"‡W6W"Ç·6—¦S¢vÖBrÇG—S¢wÆ–W"rÆvÇ—ƒ§W6W"æfF$vÇ—‡ÇÆ–æ—F–Ç2‡W6W"æF—7Æ”æÖR—Ò—ÓÂöF—cà¢ÆF—cãÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	

-	í
	
ò	ý	]

	í	Ý		m	ÂöF—cãÆƒ#âG¶W62‡W6W"æF—7Æ”æÖWÇÇW6W"æ–B—ÓÂöƒ#ãÆF—b6Æ73Ò'7V'FÆR#âG¶W62‡W6W"ç&æ·ÇÇW6W"ç&öÆWÇÂ}	ý]íÝbr—ÓÂöF—cãÂöF—cà¢ÂöF—cà¢ÆF—b6Æ73Ò'&öf–ÆRÖÆ÷&RÖÆ–÷WB×c2G¶6äVF—CòvVF—F&ÆRs¢rwÒ#à¢Æ'F–6ÆR6Æ73Ò&6&B&öf–ÆRÖÆ÷&R×&Wf–Wr×c2#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#í	ý
	]	M	ý
	í
	Í	í
-
ÂöF—cà¢ÆF—b6Æ73Ò'&öf–ÆRÖÆ÷&R×&–6‚×c2#âG·&öf–ÆTÆ÷&TÖ&·Wc2‡W6W"æÆ÷&R—ÓÂöF—cà¢Âö'F–6ÆSà¢G¶6äVF—CöÆf÷&Ò–CÒ'&öf–ÆRÖÆ÷&RÖf÷&Ò×c2"6Æ73Ò&6&Bf÷&Ò&öf–ÆRÖÆ÷&RÖVF—F÷"×c2#à¢ÆF—b6Æ73Ò'6V7F–öâ×F—FÆR#ä…DÔÂÝ
	]	M		­
-	í
ÂöF—cà¢ÆF—b6Æ73Ò&f–VÆB#ãÆÆ&VÃí	½íý]íÝmÂöÆ&VÃãÇFW‡F&V6Æ73Ò&&V'F–6ÆRÖ&öG’ÖVF—F÷""æÖSÒ&Æ÷&R"7VÆÆ6†V6³Ò'G'VR#âG¶W62‡W6W"æÆ÷&WÇÂrr—ÓÂ÷FW‡F&VâGµõö‡FÖÄ†–çGÓÂöF—cà¢Æ'WGFöâ6Æ73Ò'&–Ö'’"G—SÒ'7V&Ö—B#í
	í
]
		Ý	
-
Â	½	í
Âö'WGFöãà¢Âöf÷&Óæ¢rwÐ¢ÂöF—cà¢Â÷6V7F–öãæ°¢T’æGF6„VçF—G”Æ–æ·2‡&ö÷B“° ¢&ö÷BçVW'•6VÆV7F÷"‚r7&öf–ÆRÖÆ÷&RÖf÷&Ò×c2r“òæFDWfVçDÆ—7FVæW"‚w7V&Ö—BrÆ7–æ2WfVçCÓç°¢WfVçBç&WfVçDFVfVÇB‚“°¢6öç7B'WGFöãÖWfVçBæ7W'&VçEF&vWBçVW'•6VÆV7F÷"‚u·G—SÒ'7V&Ö—B%Òr“°¢–b†'WGFöâ–'WGFöâæF—6&ÆVC×G'VS°¢6öç7B7W'&VçCÔç7FFRçW6W'5·W6W"æ–E×ÇÇW6W#°¢6öç7BÆ÷&SÕ7G&–ær†æWrf÷&ÔFF†WfVçBæ7W'&VçEF&vWB’ævWB‚vÆ÷&Rr—ÇÂrr’çG&–Ò‚“°¢6öç7BæW‡CÖæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"‡²ââæ7W'&VçBÆÆ÷&WÒ“°¢ç7FFRçW6W'5·W6W"æ–EÓÖæW‡C°¢Ä”U%õDTÕÄDU5·W6W"æ–EÓÖFVW†æW‡B“°¢v—Bçw&—FTÆö6ÄÖ—'&÷'2‚“°¢6öç7B&W7VÇCÖv—BÆ–W%7–æ2çW6…Æ–W%F6‚‡W6W"æ–BÇ¶Æ÷&WÒÇ¶æ÷F–6S¢}	½íý]íÝmíÝí-½ÒrÇ&W&VæFW#¦fÇ6WÒ“°¢–b‚&W7VÇCòæö²bg&W7VÇCòç7FGW2ÓÒvF—6&ÆVBr•Fö7Bç6†÷r†	½íí]ÝÒ½í­½ÍÝâÂÝâí½­âÝRíÝí-½íÃ¢G·&W7VÇCòæÖW76vWÇÂwVæ¶æ÷vâW'&÷"wÖÂv–æfòr“°¢T’ç&VæFW%&öf–ÆR‚“°¢Ò“°¢Ð ¢6öç7B&VæFW%&öf–ÆT&Vf÷&TÆ÷&Uc3ÕT’ç&VæFW%&öf–ÆRæ&–æB…T’“°¢T’ç&VæFW%&öf–ÆSÖgVæ7F–öâ‚—°¢6öç7B&W7VÇC×&VæFW%&öf–ÆT&Vf÷&TÆ÷&Uc2‚“°¢6öç7BW6W#Ôæ7W'&VçEW6W#öæ÷&ÖÆ—¦UÆ–W%&öf–ÆUc"„æ7W'&VçEW6W"“¦çVÆÃ°¢6öç7B&ö÷CÖFö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖ6öçFVçBr“°¢–b‚W6W'ÇÂ&ö÷B—&WGW&â&W7VÇC°¢–b†7F—fU&öf–ÆU6V7F–öåc3ÓÓÒvÆ÷&Rr—°¢&VæFW$Æ÷&U6V7F–öåc2‡&ö÷BÇW6W"“°¢&WGW&â&W7VÇC°¢Ð¢òò&–6‚Æ÷&R—2&VÆö6FVB&VÆ÷r–çfVçF÷'’'’F†R6†&7FW"6†VWBà¢6öç7BÆ÷&T–çWC×&ö÷BçVW'•6VÆV7F÷"‚r7&öf–ÆRÖVF—BÖf÷&Ò¶æÖSÒ&Æ÷&R%Òr“°¢6öç7BÆ÷&Tf–VÆCÖÆ÷&T–çWCòæ6Æ÷6W7B‚ræf–VÆBr“°¢–b†Æ÷&Tf–VÆB–Æ÷&Tf–VÆBæ÷WFW$…DÔÃÖÆF—b6Æ73Ò&f–VÆB&öf–ÆRÖÆ÷&RÖ÷VâÖf–VÆB×c2#ãÆ'WGFöâ6Æ73Ò'6V6öæF'’"G—SÒ&'WGFöâ"FF×&öf–ÆR×6V7F–öâ×c3Ò&Æ÷&R#âG¶Æ÷&UF$Æ&VÅc2‡W6W"—ÓÂö'WGFöããÆF—b6Æ73Ò'6ÖÆÂÖæ÷FR#í	½íí-­½""í-M]½ÍÝí’-­½M­R‚ýíMM]m-]"…DÔÂÝ}Í]-­2ãÂöF—cãÂöF—cæ°¢&ö÷Bæ–ç6W'DF¦6VçD…DÔÂ‚vgFW&&Vv–ârÇ&öf–ÆUF'5c2‡W6W"’“°¢&WGW&â&W7VÇC°¢Ó° ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÆWfVçCÓç°¢6öç7B'WGFöãÖWfVçBçF&vWCòæ6Æ÷6W7Còâ‚u¶FF×&öf–ÆR×6V7F–öâ×c5Òr“°¢–b‚'WGFöçÇÂ'WGFöâæ6Æ÷6W7B‚r7&öf–ÆRÖ6öçFVçBr’—&WGW&ã°¢WfVçBç&WfVçDFVfVÇB‚“°¢7F—fU&öf–ÆU6V7F–öåc3Ö'WGFöâæFF6WBç&öf–ÆU6V7F–öåc3ÓÓÒvÆ÷&RsòvÆ÷&Rs¢w&öf–ÆRs°¢FVÆWFRFö7VÖVçBævWDVÆVÖVçD'”–B‚w&öf–ÆRÖ6öçFVçBr’æFF6WBç&öf–ÆU&VæFW%6–væGW&Uc#3°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚vÖöB×&öf–ÆRr“òç67&öÆÅFò‡·F÷£Æ&V†f–÷#¢v–ç7FçBwÒ“°¢T’ç&VæFW%&öf–ÆR‚“°¢Ò“°§Ò’‚“°