const { app, BrowserWindow, ipcMain, screen, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let autoUpdater = null;
let updaterLoadError = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (error) {
  updaterLoadError = error;
}

const WORLD_FILE_NAMES = ['players','systems','planets','npcs','equipment','flora','fauna','articles','news','tasks','organizations','factions','skills','campaigns','combatScenes','ui','regionMaps','ships','missiles','radars'];
const DEFAULT_SYNC_TABLE = 'campaign_snapshots';
const DEFAULT_CHAT_TABLE = 'campaign_messages';
const DEFAULT_PLAYER_TABLE = 'campaign_players';
const DEFAULT_COMBAT_RUNTIME_TABLE = 'campaign_combat_runtime';
const DEFAULT_POCKETBASE_USERS_COLLECTION = 'app_users';
const DEFAULT_POCKETBASE_ASSETS_COLLECTION = 'campaign_assets';

function debugLog(label, payload) {
  const stamp = new Date().toISOString();
  try {
    console.log(`[${stamp}] ${label}`, payload ?? '');
  } catch {
    console.log(`[${stamp}] ${label}`);
  }
}

function stateFilePath() {
  return path.join(app.getPath('userData'), 'galactic-state.json');
}

function syncConfigFilePath() {
  return path.join(app.getPath('userData'), 'galactic-sync-config.json');
}

function readMarkersFilePath() {
  return path.join(app.getPath('userData'), 'galactic-read-markers.json');
}

function defaultWorldDataDir() {
  return path.join(__dirname, 'renderer', 'data');
}

function writableWorldDataDir() {
  return path.join(app.getPath('userData'), 'world-data');
}

function writableWorldAssetsDir() {
  return path.join(writableWorldDataDir(), 'assets');
}

function writableWorldAudioDir() {
  // Combat sounds are local editor assets, intentionally not part of remote world-data sync.
  return path.join(__dirname, 'renderer', 'assets', 'audio');
}

function backupExportDirName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `campaign-backup-${stamp}`;
}

async function copyPathIfExists(source, target) {
  try {
    await fs.promises.access(source);
  } catch {
    return false;
  }
  const stat = await fs.promises.stat(source);
  if (stat.isDirectory()) {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    if (fs.promises.cp) {
      await fs.promises.cp(source, target, { recursive: true, force: true });
    } else {
      await fs.promises.mkdir(target, { recursive: true });
      for (const name of await fs.promises.readdir(source)) {
        await copyPathIfExists(path.join(source, name), path.join(target, name));
      }
    }
    return true;
  }
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.copyFile(source, target);
  return true;
}

async function exportCampaignBackup() {
  const result = await dialog.showOpenDialog({
    title: 'Выберите папку для резервной копии',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, cancelled: true, message: 'BACKUP_CANCELLED' };
  }
  const targetRoot = result.filePaths[0];
  const backupDir = path.join(targetRoot, backupExportDirName());
  await fs.promises.mkdir(backupDir, { recursive: true });

  const copied = [];
  if (await copyPathIfExists(writableWorldDataDir(), path.join(backupDir, 'world-data'))) copied.push('world-data');
  if (await copyPathIfExists(stateFilePath(), path.join(backupDir, path.basename(stateFilePath())))) copied.push('state');
  if (await copyPathIfExists(syncConfigFilePath(), path.join(backupDir, path.basename(syncConfigFilePath())))) copied.push('sync-config');
  if (await copyPathIfExists(readMarkersFilePath(), path.join(backupDir, path.basename(readMarkersFilePath())))) copied.push('read-markers');

  const manifest = {
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    source: {
      userData: app.getPath('userData'),
      worldDataDir: writableWorldDataDir(),
      stateFile: stateFilePath(),
      syncConfigFile: syncConfigFilePath(),
      readMarkersFile: readMarkersFilePath()
    },
    copied
  };
  await fs.promises.writeFile(path.join(backupDir, 'backup-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { ok: true, backupDir, copied };
}

function worldBackupsDir() {
  return path.join(writableWorldDataDir(), 'backups');
}

function latestWorldSectionBackupPath(sectionName) {
  return path.join(worldBackupsDir(), `${sectionName}.latest.json`);
}

async function readJsonIfExists(file) {
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getWorldSectionItemCount(sectionName, payload) {
  if (!payload || typeof payload !== 'object') return 0;
  if (sectionName === 'players') return payload.PLAYER_TEMPLATES && typeof payload.PLAYER_TEMPLATES === 'object' ? Object.keys(payload.PLAYER_TEMPLATES).length : 0;
  if (sectionName === 'systems') return Array.isArray(payload.SYSTEMS) ? payload.SYSTEMS.length : 0;
  if (sectionName === 'planets') return payload.PLANETS && typeof payload.PLANETS === 'object' ? Object.keys(payload.PLANETS).length : 0;
  if (sectionName === 'npcs') return payload.NPCS && typeof payload.NPCS === 'object' ? Object.keys(payload.NPCS).length : 0;
  if (sectionName === 'equipment') return payload.EQUIPMENT && typeof payload.EQUIPMENT === 'object' ? Object.keys(payload.EQUIPMENT).length : 0;
  if (sectionName === 'flora') return payload.FLORA && typeof payload.FLORA === 'object' ? Object.keys(payload.FLORA).length : 0;
  if (sectionName === 'fauna') return payload.FAUNA && typeof payload.FAUNA === 'object' ? Object.keys(payload.FAUNA).length : 0;
  if (sectionName === 'articles') return payload.ARTICLES && typeof payload.ARTICLES === 'object' ? Object.keys(payload.ARTICLES).length : 0;
  if (sectionName === 'news') return payload.NEWS && typeof payload.NEWS === 'object' ? Object.keys(payload.NEWS).length : 0;
  if (sectionName === 'tasks') return payload.TASKS && typeof payload.TASKS === 'object' ? Object.keys(payload.TASKS).length : 0;
  if (sectionName === 'organizations') {
    if (payload.ORGANIZATIONS && typeof payload.ORGANIZATIONS === 'object') return Object.keys(payload.ORGANIZATIONS).length;
    return Array.isArray(payload.ORGANIZATION_LIST) ? payload.ORGANIZATION_LIST.length : 0;
  }
  if (sectionName === 'factions') {
    if (payload.FACTIONS && typeof payload.FACTIONS === 'object') return Object.keys(payload.FACTIONS).length;
    return Array.isArray(payload.FACTION_LIST) ? payload.FACTION_LIST.length : 0;
  }
  if (sectionName === 'skills') {
    if (payload.SKILLS && typeof payload.SKILLS === 'object') return Object.keys(payload.SKILLS).length;
    return Array.isArray(payload.SKILL_LIST) ? payload.SKILL_LIST.length : 0;
  }
  if (sectionName === 'campaigns') {
    if (payload.CAMPAIGNS && typeof payload.CAMPAIGNS === 'object') return Object.keys(payload.CAMPAIGNS).length;
    return Array.isArray(payload.CAMPAIGN_LIST) ? payload.CAMPAIGN_LIST.length : 0;
  }
  if (sectionName === 'regionMaps') {
    if (payload.REGION_MAPS && typeof payload.REGION_MAPS === 'object') return Object.keys(payload.REGION_MAPS).length;
    return Array.isArray(payload.REGION_MAP_LIST) ? payload.REGION_MAP_LIST.length : 0;
  }
  if (sectionName === 'ships') {
    if (payload.SHIPS && typeof payload.SHIPS === 'object') return Object.keys(payload.SHIPS).length;
    return Array.isArray(payload.SHIP_LIST) ? payload.SHIP_LIST.length : 0;
  }
  if (sectionName === 'combatScenes') return payload.COMBAT_SCENES && typeof payload.COMBAT_SCENES === 'object' ? Object.keys(payload.COMBAT_SCENES).length : 0;
  if (sectionName === 'ui') return Array.isArray(payload.galaxyLegend) ? payload.galaxyLegend.length : 0;
  return 0;
}

function isBundledDefaultSystemsPayload(payload) {
  const systems = Array.isArray(payload?.SYSTEMS) ? payload.SYSTEMS : [];
  return systems.length === 1 && String(systems[0]?.id || '') === 'cassilia_binary';
}

function scoreWorldSectionPayload(sectionName, payload, sourceTag = 'unknown') {
  if (!isWorldSectionUsable(sectionName, payload)) return -1;
  let score = getWorldSectionItemCount(sectionName, payload);
  if (sectionName === 'systems' && isBundledDefaultSystemsPayload(payload)) score -= 1000;
  if (sourceTag === 'backup') score += 0.25;
  if (sourceTag === 'current') score += 0.1;
  return score;
}

async function backupWorldSectionFile(sectionName, file) {
  try {
    if (!fs.existsSync(file)) return;
    const raw = await fs.promises.readFile(file, 'utf8');
    const dir = worldBackupsDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const latestFile = latestWorldSectionBackupPath(sectionName);
    await fs.promises.writeFile(latestFile, raw, 'utf8');
    const stamp = new Date().toISOString().replace(/[.:]/g, '-');
    const historyFile = path.join(dir, `${sectionName}.${stamp}.json`);
    await fs.promises.writeFile(historyFile, raw, 'utf8');
    const entries = (await fs.promises.readdir(dir))
      .filter(name => name.startsWith(`${sectionName}.`) && name.endsWith('.json') && !name.endsWith('.latest.json'))
      .sort();
    while (entries.length > 12) {
      const oldest = entries.shift();
      if (!oldest) break;
      await fs.promises.rm(path.join(dir, oldest), { force: true });
    }
  } catch (error) {
    debugLog('WORLD_SECTION_BACKUP_FAILED', { section: sectionName, file, message: error?.message || String(error) });
  }
}

function defaultSyncConfig() {
  return {
    enabled: false,
    provider: 'pocketbase',
    serverUrl: '',
    accessToken: '',
    pocketbaseEmail: '',
    pocketbasePassword: '',
    pocketbaseUsersCollection: DEFAULT_POCKETBASE_USERS_COLLECTION,
    pocketbaseAssetsCollection: DEFAULT_POCKETBASE_ASSETS_COLLECTION,
    url: '',
    campaignId: '',
    deviceLabel: '',
    tableName: DEFAULT_SYNC_TABLE,
    chatTableName: DEFAULT_CHAT_TABLE,
    playerTableName: DEFAULT_PLAYER_TABLE,
    combatRuntimeTableName: DEFAULT_COMBAT_RUNTIME_TABLE,
    pollIntervalMs: 45000,
    connectTimeoutMs: 8000
  };
}

function normalizeSyncConfig(payload = {}) {
  const base = defaultSyncConfig();
  const providerRaw = String(payload?.provider || payload?.syncProvider || '').trim().toLowerCase();
  const provider = providerRaw === 'selfhost' ? 'selfhost' : 'pocketbase';
  const serverUrl = String(payload?.serverUrl || base.serverUrl).trim().replace(/\/+$/, '');
  const url = String(provider === 'pocketbase' ? (payload?.url || base.url) : '').trim().replace(/\/+$/, '');
  return {
    ...base,
    enabled: Boolean(payload?.enabled),
    provider,
    serverUrl,
    accessToken: String(payload?.accessToken || base.accessToken).trim(),
    pocketbaseEmail: String(payload?.pocketbaseEmail || payload?.pbEmail || '').trim(),
    pocketbasePassword: String(payload?.pocketbasePassword || payload?.pbPassword || '').trim(),
    pocketbaseUsersCollection: String(payload?.pocketbaseUsersCollection || DEFAULT_POCKETBASE_USERS_COLLECTION).trim() || DEFAULT_POCKETBASE_USERS_COLLECTION,
    pocketbaseAssetsCollection: String(payload?.pocketbaseAssetsCollection || DEFAULT_POCKETBASE_ASSETS_COLLECTION).trim() || DEFAULT_POCKETBASE_ASSETS_COLLECTION,
    url,
    campaignId: String(payload?.campaignId || base.campaignId).trim(),
    deviceLabel: String(payload?.deviceLabel || base.deviceLabel).trim(),
    tableName: String(payload?.tableName || base.tableName || DEFAULT_SYNC_TABLE).trim() || DEFAULT_SYNC_TABLE,
    chatTableName: String(payload?.chatTableName || base.chatTableName || DEFAULT_CHAT_TABLE).trim() || DEFAULT_CHAT_TABLE,
    playerTableName: String(payload?.playerTableName || base.playerTableName || DEFAULT_PLAYER_TABLE).trim() || DEFAULT_PLAYER_TABLE,
    combatRuntimeTableName: String(payload?.combatRuntimeTableName || base.combatRuntimeTableName || DEFAULT_COMBAT_RUNTIME_TABLE).trim() || DEFAULT_COMBAT_RUNTIME_TABLE,
    pollIntervalMs: Math.max(3000, Number(payload?.pollIntervalMs || base.pollIntervalMs || 45000)),
    connectTimeoutMs: Math.max(3000, Number(payload?.connectTimeoutMs || base.connectTimeoutMs || 8000))
  };
}

async function loadSyncConfig() {
  const file = syncConfigFilePath();
  try {
    if (!fs.existsSync(file)) return defaultSyncConfig();
    const raw = await fs.promises.readFile(file, 'utf8');
    return normalizeSyncConfig(JSON.parse(raw));
  } catch (error) {
    debugLog('SYNC_CONFIG_LOAD_FAILED', { message: error.message, stack: error.stack });
    return defaultSyncConfig();
  }
}

async function saveSyncConfig(payload = {}) {
  const file = syncConfigFilePath();
  const config = normalizeSyncConfig(payload);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(config, null, 2), 'utf8');
  return { ok: true, file, config };
}

function transliterateCyrillic(value = '') {
  const map = {
    'а': 'a','б': 'b','в': 'v','г': 'g','д': 'd','е': 'e','ё': 'e','ж': 'zh','з': 'z','и': 'i','й': 'y',
    'к': 'k','л': 'l','м': 'm','н': 'n','о': 'o','п': 'p','р': 'r','с': 's','т': 't','у': 'u','ф': 'f',
    'х': 'h','ц': 'ts','ч': 'ch','ш': 'sh','щ': 'sch','ъ': '','ы': 'y','ь': '','э': 'e','ю': 'yu','я': 'ya'
  };
  return String(value || '').replace(/[А-Яа-яЁё]/g, char => {
    const lower = char.toLowerCase();
    const converted = map[lower] ?? '';
    if (!converted) return '';
    return char === lower ? converted : converted.charAt(0).toUpperCase() + converted.slice(1);
  });
}

function sanitizeFileStem(value) {
  const ascii = transliterateCyrillic(String(value || 'asset'))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return ascii
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || 'asset';
}

function extensionFromDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.exec(String(dataUrl || ''));
  if (!match) return 'png';
  const ext = match[1].toLowerCase();
  if (ext === 'jpeg' || ext === 'jpg') return 'jpg';
  if (ext === 'svg+xml') return 'svg';
  return ext;
}

function extensionFromContentType(contentType = '') {
  const value = String(contentType || '').toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg';
  if (value.includes('webp')) return 'webp';
  if (value.includes('gif')) return 'gif';
  if (value.includes('svg')) return 'svg';
  return 'png';
}

function contentTypeFromExtension(ext = '') {
  const value = String(ext || '').toLowerCase();
  if (value === 'png') return 'image/png';
  if (value === 'jpg' || value === 'jpeg') return 'image/jpeg';
  if (value === 'webp') return 'image/webp';
  if (value === 'gif') return 'image/gif';
  if (value === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function extensionFromPathLike(value = '') {
  const clean = String(value || '').split('?')[0].split('#')[0];
  const ext = path.extname(clean || '').replace(/^\./, '').toLowerCase();
  return ext || 'png';
}

function imageSourceKind(value = '') {
  const raw = String(value || '');
  if (!raw) return 'empty';
  if (raw.startsWith('data:image/')) return 'data-url';
  if (raw.startsWith('file://')) return 'file-url';
  if (/^https?:\/\//i.test(raw)) return 'http-url';
  return 'file-path';
}

function inferImageContentType(source = '') {
  const kind = imageSourceKind(source);
  if (kind === 'data-url') {
    const match = /^data:([^;]+);base64,/i.exec(String(source || ''));
    return match?.[1] || 'application/octet-stream';
  }
  return contentTypeFromExtension(extensionFromPathLike(source));
}

async function imageSourceToBuffer(source = '') {
  const kind = imageSourceKind(source);
  if (kind === 'data-url') {
    const base64 = String(source).split(',')[1] || '';
    return Buffer.from(base64, 'base64');
  }
  if (kind === 'file-url') {
    const file = new URL(String(source));
    return fs.promises.readFile(file);
  }
  if (kind === 'file-path') {
    return fs.promises.readFile(String(source));
  }
  throw new Error('Unsupported image source for buffer conversion');
}

function buildStorageImagePath(config = {}, options = {}) {
  const campaign = sanitizeFileStem(config.campaignId || 'campaign');
  const section = sanitizeFileStem(options.section || 'misc');
  const entityId = sanitizeFileStem(options.entityId || options.preferredStem || 'asset');
  const stem = sanitizeFileStem(options.preferredStem || options.entityName || entityId || 'asset');
  const ext = sanitizeFileStem(options.ext || 'png') || 'png';
  return `${campaign}/${section}/${entityId}/${Date.now()}_${stem}.${ext}`;
}


async function uploadImageSourceToBackend(config = {}, source = '', options = {}) {
  if (isPocketBaseSyncConfig(config)) return uploadImageSourceToPocketBase(config, source, options);
  if (isSelfhostSyncConfig(config)) return uploadImageSourceToSelfhost(config, source, options);
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function ensureEntityImageOnBackend(config = {}, entity = {}, options = {}) {
  if (!entity || typeof entity !== 'object') return entity;
  const image = String(entity.image || '').trim();
  if (!image) return entity;
  if (imageSourceKind(image) === 'http-url') return entity;
  const upload = await uploadImageSourceToBackend(config, image, {
    section: options.section,
    entityId: entity.id || options.entityId,
    entityName: entity.name || entity.displayName || options.entityName,
    preferredStem: options.preferredStem || entity.name || entity.displayName || entity.id || 'asset'
  });
  entity.image = upload.publicUrl || upload.url || image;
  entity.imageStoragePath = upload.storagePath || entity.imageStoragePath || null;
  entity.imageLocal = imageSourceKind(image) === 'http-url' ? (entity.imageLocal || null) : image;
  return entity;
}

function normalizeMapListSectionForSync(section = {}, mapKey, listKey, idKeys = ['id', 'name']) {
  const source = section && typeof section === 'object' ? section : {};
  const recordSource = source[mapKey] && typeof source[mapKey] === 'object' ? source[mapKey] : {};
  const listSource = Array.isArray(source[listKey]) ? source[listKey] : [];
  const record = {};

  const addEntry = (entry, fallbackId = '') => {
    if (!entry || typeof entry !== 'object') return;
    let id = String(fallbackId || '').trim();
    for (const key of idKeys) {
      if (id) break;
      id = String(entry[key] || '').trim();
    }
    if (!id) return;
    record[id] = { ...entry, id };
  };

  Object.entries(recordSource).forEach(([id, entry]) => addEntry(entry, id));
  listSource.forEach(entry => {
    let id = '';
    if (entry && typeof entry === 'object') {
      for (const key of idKeys) {
        id = String(entry[key] || '').trim();
        if (id) break;
      }
    }
    if (!id || !record[id]) addEntry(entry);
  });

  return {
    [mapKey]: record,
    [listKey]: Object.values(record).sort((a, b) => {
      const av = String(a.ticker || a.name || a.id || '').toLowerCase();
      const bv = String(b.ticker || b.name || b.id || '').toLowerCase();
      return av.localeCompare(bv, 'ru');
    })
  };
}

function normalizeOrganizationsSectionForSync(section = {}) {
  const source = section && typeof section === 'object' ? section : {};
  const recordSource = source.ORGANIZATIONS && typeof source.ORGANIZATIONS === 'object' ? source.ORGANIZATIONS : {};
  const listSource = Array.isArray(source.ORGANIZATION_LIST) ? source.ORGANIZATION_LIST : [];
  const organizations = {};

  const addOrganization = (entry, fallbackId = '') => {
    if (!entry || typeof entry !== 'object') return;
    const id = String(entry.id || fallbackId || entry.ticker || entry.symbol || entry.name || '').trim();
    if (!id) return;
    organizations[id] = { ...entry, id };
  };

  Object.entries(recordSource).forEach(([id, entry]) => addOrganization(entry, id));
  listSource.forEach(entry => {
    const id = String(entry?.id || entry?.ticker || entry?.symbol || entry?.name || '').trim();
    if (!id || !organizations[id]) addOrganization(entry);
  });

  return {
    ORGANIZATIONS: organizations,
    ORGANIZATION_LIST: Object.values(organizations).sort((a, b) => {
      const av = String(a.ticker || a.name || a.id || '').toLowerCase();
      const bv = String(b.ticker || b.name || b.id || '').toLowerCase();
      return av.localeCompare(bv, 'ru');
    })
  };
}

function normalizeFactionsSectionForSync(section = {}) {
  return normalizeMapListSectionForSync(section, 'FACTIONS', 'FACTION_LIST', ['id', 'name', 'title']);
}

function normalizeSkillsSectionForSync(section = {}) {
  return normalizeMapListSectionForSync(section, 'SKILLS', 'SKILL_LIST', ['id', 'name', 'title']);
}

function normalizeCampaignsSectionForSync(section = {}) {
  return normalizeMapListSectionForSync(section, 'CAMPAIGNS', 'CAMPAIGN_LIST', ['id', 'name', 'title']);
}

async function normalizeSnapshotImagesForCloud(config = {}, snapshot = {}) {
  const clone = JSON.parse(JSON.stringify(snapshot || {}));
  const playersMap = clone?.world?.players?.PLAYER_TEMPLATES || {};
  for (const player of Object.values(playersMap)) {
    await ensureEntityImageOnBackend(config, player, { section: 'players' });
  }
  const systems = clone?.world?.systems?.SYSTEMS || [];
  for (const system of systems) {
    await ensureEntityImageOnBackend(config, system, { section: 'systems' });
  }
  const planets = clone?.world?.planets?.PLANETS || {};
  for (const planet of Object.values(planets)) {
    await ensureEntityImageOnBackend(config, planet, { section: 'planets' });
  }
  const npcs = clone?.world?.npcs?.NPCS || {};
  for (const npc of Object.values(npcs)) {
    await ensureEntityImageOnBackend(config, npc, { section: 'npcs' });
  }
  const equipment = clone?.world?.equipment?.EQUIPMENT || {};
  for (const item of Object.values(equipment)) {
    await ensureEntityImageOnBackend(config, item, { section: 'equipment' });
  }
  const flora = clone?.world?.flora?.FLORA || {};
  for (const entry of Object.values(flora)) {
    await ensureEntityImageOnBackend(config, entry, { section: 'flora' });
  }
  const fauna = clone?.world?.fauna?.FAUNA || {};
  for (const entry of Object.values(fauna)) {
    await ensureEntityImageOnBackend(config, entry, { section: 'fauna' });
  }
  const articles = clone?.world?.articles?.ARTICLES || {};
  for (const entry of Object.values(articles)) {
    await ensureEntityImageOnBackend(config, entry, { section: 'articles' });
  }
  const news = clone?.world?.news?.NEWS || {};
  for (const entry of Object.values(news)) {
    await ensureEntityImageOnBackend(config, entry, { section: 'news' });
  }
  const tasks = clone?.world?.tasks?.TASKS || {};
  for (const entry of Object.values(tasks)) {
    await ensureEntityImageOnBackend(config, entry, { section: 'tasks' });
  }
  if (clone?.world?.organizations) {
    clone.world.organizations = normalizeOrganizationsSectionForSync(clone.world.organizations);
    const organizations = clone.world.organizations.ORGANIZATIONS || {};
    for (const entry of Object.values(organizations)) {
      await ensureEntityImageOnBackend(config, entry, { section: 'organizations' });
    }
    clone.world.organizations.ORGANIZATION_LIST = Object.values(organizations).sort((a, b) => {
      const av = String(a.ticker || a.name || a.id || '').toLowerCase();
      const bv = String(b.ticker || b.name || b.id || '').toLowerCase();
      return av.localeCompare(bv, 'ru');
    });
  }
  if (clone?.world?.factions) {
    clone.world.factions = normalizeFactionsSectionForSync(clone.world.factions);
    const factions = clone.world.factions.FACTIONS || {};
    for (const entry of Object.values(factions)) {
      await ensureEntityImageOnBackend(config, entry, { section: 'factions' });
    }
    clone.world.factions.FACTION_LIST = Object.values(factions).sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), 'ru'));
  }
  if (clone?.world?.skills) {
    clone.world.skills = normalizeSkillsSectionForSync(clone.world.skills);
    const skills = clone.world.skills.SKILLS || {};
    for (const entry of Object.values(skills)) {
      await ensureEntityImageOnBackend(config, entry, { section: 'skills' });
    }
    clone.world.skills.SKILL_LIST = Object.values(skills).sort((a, b) => String(a.category || '').localeCompare(String(b.category || ''), 'ru') || String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), 'ru'));
  }
  if (clone?.world?.campaigns) {
    clone.world.campaigns = normalizeCampaignsSectionForSync(clone.world.campaigns);
    const campaigns = clone.world.campaigns.CAMPAIGNS || {};
    for (const entry of Object.values(campaigns)) {
      await ensureEntityImageOnBackend(config, entry, { section: 'campaigns' });
    }
    clone.world.campaigns.CAMPAIGN_LIST = Object.values(campaigns).sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), 'ru'));
  }
  if (clone?.world?.regionMaps) {
    const regionMaps = clone.world.regionMaps.REGION_MAPS || {};
    for (const entry of Object.values(regionMaps)) {
      await ensureEntityImageOnBackend(config, entry, { section: 'regionMaps' });
    }
    clone.world.regionMaps.REGION_MAP_LIST = Object.values(regionMaps).sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), 'ru'));
  }
  if (clone?.world?.ships) {
    const ships = clone.world.ships.SHIPS || {};
    for (const entry of Object.values(ships)) {
      await ensureEntityImageOnBackend(config, entry, { section: 'ships' });
    }
    clone.world.ships.SHIP_LIST = Object.values(ships).sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), 'ru'));
  }

  const stateUsers = clone?.state?.users || {};
  for (const player of Object.values(stateUsers)) {
    await ensureEntityImageOnBackend(config, player, { section: 'players' });
  }

  if (clone?.world?.players) {
    clone.world.players.PLAYER_LIST = Object.values(playersMap);
  }
  if (clone?.world?.planets) {
    clone.world.planets.PLANET_LIST = Object.values(planets);
  }
  if (clone?.world?.npcs) {
    clone.world.npcs.NPC_LIST = Object.values(npcs);
  }
  if (clone?.world?.equipment) {
    clone.world.equipment.EQUIPMENT_LIST = Object.values(equipment);
    clone.world.equipment.WEAPON_OPTIONS = Object.values(equipment).filter(item => item.type === 'weapon');
    clone.world.equipment.ARMOR_OPTIONS = Object.values(equipment).filter(item => item.type === 'armor');
  }
  if (clone?.world?.flora) {
    clone.world.flora.FLORA_LIST = Object.values(flora);
  }
  if (clone?.world?.fauna) {
    clone.world.fauna.FAUNA_LIST = Object.values(fauna);
  }
  if (clone?.world?.articles) {
    clone.world.articles.ARTICLE_LIST = Object.values(articles);
  }
  if (clone?.world?.news) {
    clone.world.news.NEWS_LIST = Object.values(news);
  }
  if (clone?.world?.tasks) {
    clone.world.tasks.TASK_LIST = Object.values(tasks);
  }

  const combatScenes = clone?.world?.combatScenes?.COMBAT_SCENES || clone?.world?.combatScenes || {};
  for (const scene of Object.values(combatScenes)) {
    if (!scene || typeof scene !== 'object') continue;
    if (scene.backgroundImage) {
      try {
        const upload = await uploadImageSourceToBackend(config, scene.backgroundImage, { section: 'combat-scenes', entityId: scene.id || 'scene', preferredStem: `scene_bg_${scene.id || 'scene'}` });
        scene.backgroundImage = upload.publicUrl || upload.url || scene.backgroundImage;
      } catch {}
    }
    for (const asset of Array.isArray(scene.assets) ? scene.assets : []) {
      await ensureEntityImageOnBackend(config, asset, { section: 'combat-assets', entityId: asset.id || scene.id, preferredStem: asset.name || asset.id || 'asset' });
    }
    for (const token of Array.isArray(scene.tokens) ? scene.tokens : []) {
      await ensureEntityImageOnBackend(config, token, { section: 'combat-tokens', entityId: token.id || scene.id, preferredStem: token.name || token.id || 'token' });
    }
  }

  return clone;
}

async function normalizeCombatPublishPayloadImages(config = {}, payload = {}) {
  const clone = JSON.parse(JSON.stringify(payload || {}));
  const scene = clone.scene_json || clone.scene || null;
  if (scene && typeof scene === 'object') {
    if (scene.backgroundImage) {
      try {
        const upload = await uploadImageSourceToBackend(config, scene.backgroundImage, { section: 'combat-scenes', entityId: scene.id || 'scene', preferredStem: `scene_bg_${scene.id || 'scene'}` });
        scene.backgroundImage = upload.publicUrl || upload.url || scene.backgroundImage;
      } catch {}
    }
    for (const asset of Array.isArray(scene.assets) ? scene.assets : []) {
      await ensureEntityImageOnBackend(config, asset, { section: 'combat-assets', entityId: asset.id || scene.id, preferredStem: asset.name || asset.id || 'asset' });
    }
    for (const token of Array.isArray(scene.tokens) ? scene.tokens : []) {
      await ensureEntityImageOnBackend(config, token, { section: 'combat-tokens', entityId: token.id || scene.id, preferredStem: token.name || token.id || 'token' });
    }
  }
  return clone;
}


function audioExtensionFromDataUrl(dataUrl = '') {
  const mime = String(dataUrl || '').match(/^data:([^;,]+)[;,]/)?.[1] || 'audio/mpeg';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  return 'mp3';
}

async function saveCombatSoundAsset(dataUrl, preferredStem = 'combat_sound') {
  if (!String(dataUrl || '').startsWith('data:audio/')) {
    throw new Error('Unsupported audio payload');
  }
  const audioDir = writableWorldAudioDir();
  await fs.promises.mkdir(audioDir, { recursive: true });
  const ext = audioExtensionFromDataUrl(dataUrl);
  const filename = `${Date.now()}_${sanitizeFileStem(preferredStem || 'combat_sound')}.${ext}`;
  const file = path.join(audioDir, filename);
  const base64 = String(dataUrl).split(',')[1] || '';
  await fs.promises.writeFile(file, Buffer.from(base64, 'base64'));
  return {
    ok: true,
    file,
    url: `./assets/audio/${filename}`,
    localUrl: `./assets/audio/${filename}`,
    fileUrl: pathToFileURL(file).href,
    audioDir
  };
}

async function saveImageAsset(dataUrl, preferredStem = 'asset') {
  if (!String(dataUrl || '').startsWith('data:image/')) {
    throw new Error('Unsupported image payload');
  }
  const assetsDir = writableWorldAssetsDir();
  await fs.promises.mkdir(assetsDir, { recursive: true });
  const ext = extensionFromDataUrl(dataUrl);
  const filename = `${Date.now()}_${sanitizeFileStem(preferredStem)}.${ext}`;
  const file = path.join(assetsDir, filename);
  const base64 = String(dataUrl).split(',')[1] || '';
  await fs.promises.writeFile(file, Buffer.from(base64, 'base64'));

  const localUrl = pathToFileURL(file).href;
  const payload = {
    ok: true,
    file,
    url: localUrl,
    localUrl,
    assetsDir,
    cloudUrl: null,
    storagePath: null,
    warning: null
  };

  try {
    const config = await loadSyncConfig();
    if (config.enabled) {
      const upload = await uploadImageSourceToBackend(config, localUrl, {
        section: 'world-config',
        entityId: sanitizeFileStem(preferredStem || 'asset'),
        preferredStem
      });
      if (upload?.ok && (upload.publicUrl || upload.url)) {
        payload.cloudUrl = upload.publicUrl || upload.url;
        payload.storagePath = upload.storagePath || null;
        payload.url = payload.cloudUrl;
      }
    }
  } catch (error) {
    payload.warning = error?.message || String(error);
    debugLog('WORLD_SAVE_IMAGE_CLOUD_UPLOAD_FAILED', { file, message: payload.warning });
  }

  return payload;
}

async function ensureWorldDataDir() {
  const targetDir = writableWorldDataDir();
  const sourceDir = defaultWorldDataDir();
  await fs.promises.mkdir(targetDir, { recursive: true });

  for (const name of WORLD_FILE_NAMES) {
    const sourceFile = path.join(sourceDir, `${name}.json`);
    const targetFile = path.join(targetDir, `${name}.json`);
    if (!fs.existsSync(targetFile)) {
      if (fs.existsSync(sourceFile)) await fs.promises.copyFile(sourceFile, targetFile);
      else await fs.promises.writeFile(targetFile, JSON.stringify((name === 'combatScenes' || name === 'ui') ? {} : {}, null, 2), 'utf8');
    }
  }
  return targetDir;
}

async function readWorldDataFile(primaryFile, fallbackFile = null) {
  try {
    const raw = await fs.promises.readFile(primaryFile, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (!fallbackFile) throw error;
    const raw = await fs.promises.readFile(fallbackFile, 'utf8');
    return JSON.parse(raw);
  }
}

function isWorldSectionUsable(name, payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (name === 'players') return Boolean(payload.PLAYER_TEMPLATES && Object.keys(payload.PLAYER_TEMPLATES).length);
  if (name === 'systems') return Array.isArray(payload.SYSTEMS) && payload.SYSTEMS.length > 0;
  if (name === 'planets') return Boolean(payload.PLANETS && Object.keys(payload.PLANETS).length);
  if (name === 'npcs') return Boolean(payload.NPCS && Object.keys(payload.NPCS).length);
  if (name === 'organizations') {
    return Boolean(
      (payload.ORGANIZATIONS && typeof payload.ORGANIZATIONS === 'object') ||
      Array.isArray(payload.ORGANIZATION_LIST)
    );
  }
  if (name === 'factions') {
    return Boolean(
      (payload.FACTIONS && typeof payload.FACTIONS === 'object') ||
      Array.isArray(payload.FACTION_LIST)
    );
  }
  if (name === 'skills') {
    return Boolean(
      (payload.SKILLS && typeof payload.SKILLS === 'object') ||
      Array.isArray(payload.SKILL_LIST)
    );
  }
  if (name === 'campaigns') {
    return Boolean(
      (payload.CAMPAIGNS && typeof payload.CAMPAIGNS === 'object') ||
      Array.isArray(payload.CAMPAIGN_LIST)
    );
  }
  if (name === 'regionMaps') {
    return Boolean(
      (payload.REGION_MAPS && typeof payload.REGION_MAPS === 'object') ||
      Array.isArray(payload.REGION_MAP_LIST)
    );
  }
  if (name === 'ships') {
    return Boolean(
      (payload.SHIPS && typeof payload.SHIPS === 'object') ||
      Array.isArray(payload.SHIP_LIST)
    );
  }
  return true;
}

function chooseWorldSectionPayload(name, currentPayload, backupPayload, fallbackPayload) {
  const currentUsable = isWorldSectionUsable(name, currentPayload);
  const backupUsable = isWorldSectionUsable(name, backupPayload);
  const fallbackUsable = isWorldSectionUsable(name, fallbackPayload);

  // v35: never "recover" over a valid current file.
  // The old systems-specific heuristic could resurrect an older backup after an
  // intentional deletion, because a one-system file looked like the bundled default.
  if (currentUsable) {
    return { source: 'current', payload: currentPayload };
  }

  if (backupUsable) return { source: 'backup', payload: backupPayload };
  if (fallbackUsable) return { source: 'fallback', payload: fallbackPayload };
  return { source: 'current', payload: currentPayload ?? backupPayload ?? fallbackPayload ?? {} };
}

async function readWorldData() {
  const dataDir = await ensureWorldDataDir();
  const sourceDir = defaultWorldDataDir();
  const world = {};
  for (const name of WORLD_FILE_NAMES) {
    const file = path.join(dataDir, `${name}.json`);
    const fallbackFile = path.join(sourceDir, `${name}.json`);
    const backupFile = latestWorldSectionBackupPath(name);
    let payload;
    try {
      payload = await readWorldDataFile(file, fs.existsSync(fallbackFile) ? fallbackFile : null);
    } catch (error) {
      payload = (name === 'combatScenes' || name === 'ui') ? {} : (() => { throw error; })();
    }

    const currentPayload = await readJsonIfExists(file);
    const fallbackPayload = fs.existsSync(fallbackFile) ? await readJsonIfExists(fallbackFile) : null;
    const backupPayload = fs.existsSync(backupFile) ? await readJsonIfExists(backupFile) : null;
    const best = chooseWorldSectionPayload(name, currentPayload ?? payload, backupPayload, fallbackPayload);

    payload = best.payload || payload;

    if (best.source !== 'current' && scoreWorldSectionPayload(name, best.payload, best.source) >= 0) {
      try {
        await fs.promises.writeFile(file, JSON.stringify(best.payload, null, 2), 'utf8');
      } catch {}
      debugLog('WORLD_SECTION_RECOVERED', {
        section: name,
        file,
        source: best.source,
        currentCount: getWorldSectionItemCount(name, currentPayload),
        recoveredCount: getWorldSectionItemCount(name, best.payload)
      });
    } else if (!isWorldSectionUsable(name, payload)) {
      debugLog('WORLD_SECTION_UNUSABLE_PRESERVED', { section: name, file });
    }

    world[name] = payload;
  }
  return { dataDir, world };
}

async function writeWorldSection(sectionName, payload) {
  if (!WORLD_FILE_NAMES.includes(sectionName)) {
    throw new Error(`Unsupported world section: ${sectionName}`);
  }
  const dataDir = await ensureWorldDataDir();
  const file = path.join(dataDir, `${sectionName}.json`);
  await backupWorldSectionFile(sectionName, file);
  await fs.promises.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  return { file, dataDir };
}

async function writeWorldData(worldPayload = {}) {
  const dataDir = await ensureWorldDataDir();
  const sourceDir = defaultWorldDataDir();
  for (const name of WORLD_FILE_NAMES) {
    const file = path.join(dataDir, `${name}.json`);
    let payload;
    if (Object.prototype.hasOwnProperty.call(worldPayload, name)) {
      payload = worldPayload[name];
    } else {
      const currentPayload = await readJsonIfExists(file);
      const fallbackFile = path.join(sourceDir, `${name}.json`);
      const fallbackPayload = fs.existsSync(fallbackFile) ? await readJsonIfExists(fallbackFile) : null;
      payload = currentPayload ?? fallbackPayload ?? {};
    }
    await backupWorldSectionFile(name, file);
    await fs.promises.writeFile(file, JSON.stringify(payload ?? {}, null, 2), 'utf8');
  }
  return { dataDir };
}

async function resetWorldDataDir() {
  const targetDir = writableWorldDataDir();
  await fs.promises.rm(targetDir, { recursive: true, force: true });
  await ensureWorldDataDir();
  return targetDir;
}

function isSelfhostSyncConfig(config = {}) {
  return String(config?.provider || '').toLowerCase() === 'selfhost';
}

function isPocketBaseSyncConfig(config = {}) {
  return String(config?.provider || '').toLowerCase() === 'pocketbase';
}

function validateSyncConfig(config = {}) {
  const issues = [];
  if (isSelfhostSyncConfig(config)) {
    if (!config.serverUrl) issues.push('SERVER_URL пустой');
    if (!config.campaignId) issues.push('CAMPAIGN_ID пустой');
    return issues;
  }
  if (isPocketBaseSyncConfig(config)) {
    if (!config.url) issues.push('POCKETBASE_URL пустой');
    if (!config.pocketbaseEmail) issues.push('POCKETBASE_EMAIL пустой');
    if (!config.pocketbasePassword) issues.push('POCKETBASE_PASSWORD пустой');
    if (!config.campaignId) issues.push('CAMPAIGN_ID пустой');
    return issues;
  }
  issues.push('Неподдерживаемый провайдер синхронизации');
  return issues;
}




function getSelfhostBaseUrl(config = {}) {
  return String(config.serverUrl || config.url || '').trim().replace(/\/+$/, '');
}

function getSelfhostToken(config = {}) {
  return String(config.accessToken || '').trim();
}

function encodePathPart(value = '') {
  return encodeURIComponent(String(value || '').trim());
}

async function selfhostFetch(config = {}, pathname = '/', options = {}) {
  const issues = validateSyncConfig(config);
  if (issues.length) throw new Error(issues.join('; '));
  const base = getSelfhostBaseUrl(config);
  const url = new URL(pathname, `${base}/`);
  const query = options.query || {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  const headers = { ...(options.headers || {}) };
  const token = getSelfhostToken(config);
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = options.body;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json ?? {});
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(3000, Number(config.connectTimeoutMs || 8000)));
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body,
      signal: controller.signal
    });
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const payload = contentType.includes('application/json') ? await res.json() : { ok: res.ok, text: await res.text() };
    if (!res.ok && payload?.ok !== false) payload.ok = false;
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Self-host sync timeout: ${url.origin}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function selfhostSnapshotPath(config = {}) {
  return `/api/snapshots/${encodePathPart(config.campaignId)}`;
}

function selfhostPlayersPath(config = {}, playerId = '') {
  const base = `/api/players/${encodePathPart(config.campaignId)}`;
  return playerId ? `${base}/${encodePathPart(playerId)}` : base;
}

function selfhostChatPath(config = {}, suffix = '') {
  const base = `/api/chat/${encodePathPart(config.campaignId)}`;
  return suffix ? `${base}/${suffix}` : base;
}

function selfhostCombatPath(config = {}) {
  return `/api/combat/${encodePathPart(config.campaignId)}`;
}

function selfhostAssetPath(config = {}) {
  return `/api/assets/${encodePathPart(config.campaignId)}`;
}

async function uploadImageSourceToSelfhost(config = {}, source = '', options = {}) {
  if (!source) return { ok: false, message: 'Empty image source' };
  if (!config.enabled) return { ok: false, message: 'Sync disabled' };
  const kind = imageSourceKind(source);
  if (kind === 'http-url') return { ok: true, url: source, publicUrl: source, storagePath: options.storagePath || null, skipped: true };
  const contentType = inferImageContentType(source);
  const ext = extensionFromContentType(contentType) || extensionFromPathLike(source);
  const storagePath = options.storagePath || buildStorageImagePath(config, { ...options, ext });
  const buffer = await imageSourceToBuffer(source);
  const result = await selfhostFetch(config, selfhostAssetPath(config), {
    method: 'POST',
    query: { path: storagePath },
    headers: { 'content-type': contentType },
    body: buffer
  });
  if (!result?.ok) throw new Error(result?.message || 'Self-host asset upload failed');
  return {
    ok: true,
    bucket: 'selfhost-assets',
    storagePath: result.storagePath || storagePath,
    publicUrl: result.publicUrl || result.url || '',
    url: result.publicUrl || result.url || source,
    contentType: result.contentType || contentType
  };
}

let selfhostRealtime = null;

async function teardownSelfhostRealtime() {
  if (!selfhostRealtime) return;
  try { selfhostRealtime.abortController?.abort(); } catch {}
  selfhostRealtime = null;
}

function broadcastPlayerRealtimeEvent(payload = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win?.isDestroyed()) win.webContents.send('players:remote:event', payload);
    } catch {}
  }
}

async function setupSelfhostRealtime(config = {}) {
  await teardownSelfhostRealtime();
  if (!config?.enabled || !config?.campaignId || !isSelfhostSyncConfig(config)) return;
  const base = getSelfhostBaseUrl(config);
  if (!base) return;
  const url = new URL(`/api/events/${encodePathPart(config.campaignId)}`, `${base}/`);
  const controller = new AbortController();
  selfhostRealtime = { abortController: controller, campaignId: config.campaignId, url: String(url) };
  (async () => {
    let retryDelay = 1000;
    while (!controller.signal.aborted) {
      try {
        const headers = {};
        const token = getSelfhostToken(config);
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`SSE failed: HTTP ${res.status}`);
        debugLog('SELFHOST_REALTIME_CONNECTED', { campaignId: config.campaignId, url: String(url) });
        retryDelay = 1000;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLine = frame.split('\n').find(line => line.startsWith('data:'));
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine.slice(5).trim());
            if (payload.channel === 'snapshot') broadcastWorldSnapshotRealtimeEvent({ eventType: payload.eventType, remote: payload.remote });
            else if (payload.channel === 'chat') broadcastChatRealtimeEvent({ eventType: payload.eventType, row: payload.row });
            else if (payload.channel === 'players') broadcastPlayerRealtimeEvent({ eventType: payload.eventType, row: payload.row });
            else if (payload.channel === 'combat') broadcastCombatRuntimeEvent({ eventType: payload.eventType, row: payload.row });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) break;
        debugLog('SELFHOST_REALTIME_ERROR', { campaignId: config.campaignId, message: error?.message || String(error) });
      }
      if (controller.signal.aborted) break;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(15000, Math.round(retryDelay * 1.5));
    }
  })();
}


let pocketbaseRealtime = null;

async function teardownPocketBaseRealtime() {
  if (!pocketbaseRealtime) return;
  try { pocketbaseRealtime.abortController?.abort(); } catch {}
  pocketbaseRealtime = null;
}

function parseSseFrame(frame = '') {
  const out = { event: 'message', data: '', id: '' };
  const data = [];
  for (const rawLine of String(frame || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) out.event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    else if (line.startsWith('id:')) out.id = line.slice(3).trim();
  }
  out.data = data.join('\n');
  return out;
}

function pocketbaseRealtimeCollectionName(eventName = '', record = {}) {
  const explicit = String(record.collectionName || record.collection || '').trim();
  if (explicit) return explicit;
  const clean = String(eventName || '').split('?')[0].trim();
  if (!clean || clean === 'message') return '';
  return clean.split('/')[0] || clean;
}

function pocketbaseRealtimeEventType(action = '') {
  const normalized = String(action || '').trim().toUpperCase();
  if (normalized === 'CREATE') return 'INSERT';
  if (normalized === 'UPDATE') return 'UPDATE';
  if (normalized === 'DELETE') return 'DELETE';
  return normalized || 'UPDATE';
}

function pocketbaseRealtimeCampaignMatches(config = {}, record = {}) {
  const recordCampaign = String(record?.campaignId || '').trim();
  return !recordCampaign || recordCampaign === String(config.campaignId || '').trim();
}

function handlePocketBaseRealtimeRecord(config = {}, eventName = '', payload = {}) {
  const record = payload?.record || payload?.data?.record || null;
  if (!record || typeof record !== 'object') return;
  if (!pocketbaseRealtimeCampaignMatches(config, record)) return;

  const collection = pocketbaseRealtimeCollectionName(eventName, record);
  const action = pocketbaseRealtimeEventType(payload?.action || payload?.event || eventName);
  const snapshotCollection = pocketbaseCollection(config, 'snapshot');
  const playersCollection = pocketbaseCollection(config, 'players');
  const chatCollection = pocketbaseCollection(config, 'chat');
  const combatCollection = pocketbaseCollection(config, 'combat');

  if (collection === snapshotCollection) {
    const remote = normalizePocketBaseSnapshotRecord(record);
    if (remote) {
      remote.world = null;
      remote.state = null;
      broadcastWorldSnapshotRealtimeEvent({ eventType: action, remote, provider: 'pocketbase' });
    }
    return;
  }

  if (collection === playersCollection) {
    const row = normalizePocketBasePlayerRecord(record);
    if (row) broadcastPlayerRealtimeEvent({ eventType: action, row, provider: 'pocketbase' });
    return;
  }

  if (collection === chatCollection) {
    const row = normalizePocketBaseChatRecord(record);
    if (row) broadcastChatRealtimeEvent({ eventType: action, row, provider: 'pocketbase' });
    return;
  }

  if (collection === combatCollection) {
    const row = normalizePocketBaseCombatRecord(record);
    if (row) broadcastCombatRuntimeEvent({ eventType: action, row, provider: 'pocketbase' });
  }
}

async function pocketbaseSetRealtimeSubscriptions(config = {}, clientId = '') {
  const subscriptions = [
    `${pocketbaseCollection(config, 'snapshot')}/*`,
    `${pocketbaseCollection(config, 'players')}/*`,
    `${pocketbaseCollection(config, 'chat')}/*`,
    `${pocketbaseCollection(config, 'combat')}/*`
  ];
  await pocketbaseFetch(config, '/api/realtime', {
    method: 'POST',
    json: { clientId, subscriptions }
  });
  debugLog('POCKETBASE_REALTIME_SUBSCRIBED', { campaignId: config.campaignId, subscriptions });
}

async function setupPocketBaseRealtime(config = {}) {
  await teardownPocketBaseRealtime();
  if (!config?.enabled || !config?.campaignId || !isPocketBaseSyncConfig(config)) return;
  const base = getPocketBaseBaseUrl(config);
  if (!base) return;
  const url = new URL('/api/realtime', `${base}/`);
  const controller = new AbortController();
  pocketbaseRealtime = { abortController: controller, campaignId: config.campaignId, url: String(url) };

  (async () => {
    let retryDelay = 1000;
    while (!controller.signal.aborted) {
      try {
        const res = await fetch(url, {
          headers: { accept: 'text/event-stream' },
          signal: controller.signal
        });
        if (!res.ok || !res.body) throw new Error(`PocketBase SSE failed: HTTP ${res.status}`);
        debugLog('POCKETBASE_REALTIME_CONNECTED', { campaignId: config.campaignId, url: String(url) });
        retryDelay = 1000;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let subscribedClientId = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const rawFrame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const frame = parseSseFrame(rawFrame);
            if (!frame.data) continue;
            let payload = null;
            try { payload = JSON.parse(frame.data); } catch { payload = null; }
            if (frame.event === 'PB_CONNECT') {
              const clientId = String(payload?.clientId || frame.id || '').trim();
              if (clientId && clientId !== subscribedClientId) {
                subscribedClientId = clientId;
                await pocketbaseSetRealtimeSubscriptions(config, clientId);
              }
              continue;
            }
            if (payload) handlePocketBaseRealtimeRecord(config, frame.event, payload);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) break;
        debugLog('POCKETBASE_REALTIME_ERROR', { campaignId: config.campaignId, message: error?.message || String(error) });
      }
      if (controller.signal.aborted) break;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(15000, Math.round(retryDelay * 1.5));
    }
  })();
}


const pocketbaseAuthCache = new Map();

function getPocketBaseBaseUrl(config = {}) {
  return String(config.url || config.serverUrl || '').trim().replace(/\/+$/, '');
}

function pocketbaseCollection(config = {}, key = 'snapshot') {
  if (key === 'users') return String(config.pocketbaseUsersCollection || DEFAULT_POCKETBASE_USERS_COLLECTION).trim() || DEFAULT_POCKETBASE_USERS_COLLECTION;
  if (key === 'assets') return String(config.pocketbaseAssetsCollection || DEFAULT_POCKETBASE_ASSETS_COLLECTION).trim() || DEFAULT_POCKETBASE_ASSETS_COLLECTION;
  if (key === 'snapshot') return String(config.tableName || DEFAULT_SYNC_TABLE).trim() || DEFAULT_SYNC_TABLE;
  if (key === 'players') return String(config.playerTableName || DEFAULT_PLAYER_TABLE).trim() || DEFAULT_PLAYER_TABLE;
  if (key === 'chat') return String(config.chatTableName || DEFAULT_CHAT_TABLE).trim() || DEFAULT_CHAT_TABLE;
  if (key === 'combat') return String(config.combatRuntimeTableName || DEFAULT_COMBAT_RUNTIME_TABLE).trim() || DEFAULT_COMBAT_RUNTIME_TABLE;
  return String(key || '').trim();
}

function pocketbaseAuthCacheKey(config = {}) {
  return [getPocketBaseBaseUrl(config), pocketbaseCollection(config, 'users'), config.pocketbaseEmail || ''].join('|');
}

function pocketbaseFilterValue(value = '') {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pocketbaseEq(field, value) {
  return `${field}="${pocketbaseFilterValue(value)}"`;
}

function pocketbaseAnd(...parts) {
  return parts.filter(Boolean).join(' && ');
}

async function pocketbaseAuthToken(config = {}, options = {}) {
  const issues = validateSyncConfig(config);
  if (issues.length) throw new Error(issues.join('; '));
  const cacheKey = pocketbaseAuthCacheKey(config);
  if (!options.forceRefresh && pocketbaseAuthCache.has(cacheKey)) return pocketbaseAuthCache.get(cacheKey);
  const base = getPocketBaseBaseUrl(config);
  const collection = encodePathPart(pocketbaseCollection(config, 'users'));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(3000, Number(config.connectTimeoutMs || 8000)));
  try {
    const res = await fetch(`${base}/api/collections/${collection}/auth-with-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: String(config.pocketbaseEmail || ''), password: String(config.pocketbasePassword || '') }),
      signal: controller.signal
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.token) {
      throw new Error(payload?.message || `PocketBase auth failed: HTTP ${res.status}`);
    }
    pocketbaseAuthCache.set(cacheKey, payload.token);
    return payload.token;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`PocketBase auth timeout: ${base}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function pocketbaseFetch(config = {}, pathname = '/', options = {}) {
  const base = getPocketBaseBaseUrl(config);
  if (!base) throw new Error('POCKETBASE_URL пустой');
  const url = new URL(pathname, `${base}/`);
  const query = options.query || {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  let lastPayload = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = { ...(options.headers || {}) };
    if (options.auth !== false) headers.Authorization = `Bearer ${await pocketbaseAuthToken(config, { forceRefresh: attempt > 0 })}`;
    let body = options.body;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json ?? {});
    }
    if (options.form) body = options.form;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(3000, Number(config.connectTimeoutMs || 8000)));
    try {
      const res = await fetch(url, { method: options.method || 'GET', headers, body, signal: controller.signal });
      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      const payload = contentType.includes('application/json') ? await res.json().catch(() => ({})) : { text: await res.text().catch(() => '') };
      lastPayload = payload;
      if (res.status === 401 && attempt === 0) {
        pocketbaseAuthCache.delete(pocketbaseAuthCacheKey(config));
        continue;
      }
      if (!res.ok) {
        const detail = payload?.data && typeof payload.data === 'object' ? ` // ${JSON.stringify(payload.data)}` : '';
        throw new Error(`${payload?.message || 'PocketBase request failed'}: HTTP ${res.status}${detail}`);
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`PocketBase timeout: ${url.origin}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastPayload?.message || 'PocketBase request failed');
}

async function pocketbaseList(config = {}, collectionKey = '', options = {}) {
  const collection = encodePathPart(pocketbaseCollection(config, collectionKey));
  const query = {
    page: options.page || 1,
    perPage: options.perPage || options.limit || 500,
    filter: options.filter || '',
    sort: options.sort || ''
  };
  const payload = await pocketbaseFetch(config, `/api/collections/${collection}/records`, { query });
  return Array.isArray(payload?.items) ? payload.items : [];
}

async function pocketbaseFirst(config = {}, collectionKey = '', filter = '') {
  const rows = await pocketbaseList(config, collectionKey, { filter, perPage: 1 });
  return rows[0] || null;
}

function normalizePocketBaseSnapshotRecord(record = {}) {
  if (!record) return null;
  return {
    _id: record.id,
    campaignId: record.campaignId,
    revision: Number(record.revision || 0),
    updatedAt: record.updated || null,
    updatedBy: record.updatedBy || null,
    clientUpdatedAt: record.clientUpdatedAt || null,
    world: record.worldJson || null,
    state: record.stateJson || null
  };
}

async function fetchPocketBaseSnapshot(config = {}, options = {}) {
  const record = await pocketbaseFirst(config, 'snapshot', pocketbaseEq('campaignId', config.campaignId));
  const remote = normalizePocketBaseSnapshotRecord(record);
  if (!remote) return { ok: true, exists: false, remote: null };
  if (options.includePayload === false) {
    remote.world = null;
    remote.state = null;
  }
  return { ok: true, exists: true, remote };
}

async function pushPocketBaseSnapshot(config = {}, payload = {}) {
  const now = new Date().toISOString();
  const actor = String(payload.updatedBy || config.deviceLabel || 'unknown-device').trim() || 'unknown-device';
  const expectedRevision = Number.isFinite(Number(payload.baseRevision)) ? Number(payload.baseRevision) : 0;
  const remoteInfo = await fetchPocketBaseSnapshot(config, { includePayload: false });
  const collection = encodePathPart(pocketbaseCollection(config, 'snapshot'));
  if (!remoteInfo.exists) {
    // A clean PocketBase backend is a valid migration target.
    // Local metadata may still contain a remote revision from the previous backend,
    // so an empty PocketBase snapshot must be seeded instead of treated as a conflict.
    const record = await pocketbaseFetch(config, `/api/collections/${collection}/records`, {
      method: 'POST',
      json: {
        campaignId: config.campaignId,
        revision: 1,
        updatedBy: actor,
        clientUpdatedAt: payload.clientUpdatedAt || now,
        worldJson: payload.world || {},
        stateJson: payload.state || {}
      }
    });
    return { ok: true, status: expectedRevision > 0 ? 'seeded' : 'inserted', remote: normalizePocketBaseSnapshotRecord(record) };
  }
  if (Number(remoteInfo.remote?.revision || 0) !== expectedRevision) {
    return { ok: false, status: 'conflict', message: 'В PocketBase есть более новая ревизия данных', remote: remoteInfo.remote };
  }
  const nextRevision = expectedRevision + 1;
  const record = await pocketbaseFetch(config, `/api/collections/${collection}/records/${encodePathPart(remoteInfo.remote._id)}`, {
    method: 'PATCH',
    json: {
      revision: nextRevision,
      updatedBy: actor,
      clientUpdatedAt: payload.clientUpdatedAt || now,
      worldJson: payload.world || {},
      stateJson: payload.state || {}
    }
  });
  return { ok: true, status: 'updated', remote: normalizePocketBaseSnapshotRecord(record) };
}

function normalizePocketBasePlayerRecord(record = {}) {
  if (!record) return null;
  const player = sanitizePlayerObject(record.playerJson || {});
  const deletedAt = record.deletedAt || (player.__deleted ? record.updated || null : null);
  const segments = splitPlayerState(player, { privateState: player.private_state_json || {}, deleted: Boolean(deletedAt) });
  return {
    _id: record.id,
    campaignId: record.campaignId,
    playerId: record.playerId,
    player_id: record.playerId,
    version: Number(record.version || 0),
    updatedAt: record.updated || null,
    updatedBy: record.updatedBy || null,
    clientUpdatedAt: record.clientUpdatedAt || null,
    deletedAt,
    player,
    profile_json: segments.profile_json,
    inventory_json: segments.inventory_json,
    private_state_json: segments.private_state_json
  };
}

async function fetchPocketBasePlayerRows(config = {}, options = {}) {
  const filters = [pocketbaseEq('campaignId', config.campaignId)];
  if (options.playerId) filters.push(pocketbaseEq('playerId', options.playerId));
  if (options.since) filters.push(`updated>="${pocketbaseFilterValue(options.since)}"`);
  const rows = await pocketbaseList(config, 'players', { filter: pocketbaseAnd(...filters), sort: 'updated,playerId', perPage: Math.max(1, Math.min(5000, Number(options.limit || 500))) });
  return rows.map(normalizePocketBasePlayerRecord).filter(Boolean);
}

async function fetchPocketBasePlayerRow(config = {}, playerId = '') {
  const rows = await fetchPocketBasePlayerRows(config, { playerId, limit: 1 });
  return rows[0] || null;
}

function mergePocketBasePlayerPatch(remotePlayer = {}, patchPlayer = {}) {
  const remote = sanitizePlayerObject(remotePlayer);
  const patch = sanitizePlayerObject(patchPlayer);
  const merged = { ...remote, ...patch };
  if (!Object.prototype.hasOwnProperty.call(patch, 'inventory') && Object.prototype.hasOwnProperty.call(remote, 'inventory')) merged.inventory = remote.inventory;
  return merged;
}

async function writePocketBasePlayerRow(config = {}, payload = {}, options = {}) {
  const row = normalizePlayerRowPayload(payload);
  const now = new Date().toISOString();
  const actor = String(row.updatedBy || config.deviceLabel || 'unknown-device').trim() || 'unknown-device';
  const expectedVersion = Number.isFinite(Number(row.baseVersion)) ? Number(row.baseVersion) : 0;
  const remote = await fetchPocketBasePlayerRow(config, row.player_id);
  const collection = encodePathPart(pocketbaseCollection(config, 'players'));
  if (!remote) {
    if (expectedVersion !== 0) return { ok: false, status: 'conflict', message: 'Игрок уже изменён другим клиентом', remote: null };
    const player = options.deleted ? { ...row.player, __deleted: true } : row.player;
    const record = await pocketbaseFetch(config, `/api/collections/${collection}/records`, {
      method: 'POST',
      json: { campaignId: config.campaignId, playerId: row.player_id, version: 1, updatedBy: actor, clientUpdatedAt: row.clientUpdatedAt || now, deletedAt: options.deleted ? now : null, playerJson: player }
    });
    return { ok: true, status: options.deleted ? 'deleted' : 'inserted', row: normalizePocketBasePlayerRecord(record) };
  }
  if (Number(remote.version || 0) !== expectedVersion) return { ok: false, status: 'conflict', message: 'У игрока уже есть более новая версия в PocketBase', remote };
  let nextPlayer = options.patchOnly ? mergePocketBasePlayerPatch(remote.player || {}, row.player || {}) : row.player;
  if (options.deleted) nextPlayer = { ...(remote.player || {}), ...nextPlayer, __deleted: true };
  const record = await pocketbaseFetch(config, `/api/collections/${collection}/records/${encodePathPart(remote._id)}`, {
    method: 'PATCH',
    json: { version: expectedVersion + 1, updatedBy: actor, clientUpdatedAt: row.clientUpdatedAt || now, deletedAt: options.deleted ? now : (row.deletedAt || remote.deletedAt || null), playerJson: nextPlayer }
  });
  return { ok: true, status: options.deleted ? 'deleted' : 'updated', row: normalizePocketBasePlayerRecord(record) };
}

function pocketBaseMessageFromChatRow(row = {}, config = {}) {
  const normalized = normalizeChatRowInput(row);
  return {
    campaignId: config.campaignId,
    messageId: normalized.message_id,
    kind: normalized.kind,
    threadKey: normalized.thread_key,
    senderType: normalized.sender_type,
    senderId: normalized.sender_id,
    recipientPlayerId: normalized.recipient_player_id,
    npcId: normalized.npc_id,
    directA: normalized.direct_a,
    directB: normalized.direct_b,
    authorLabel: normalized.author_label,
    bodyHtml: normalized.body_html,
    clientCreatedAt: normalized.created_at,
    editedAt: normalized.edited_at,
    deletedAt: normalized.deleted_at,
    clientUpdatedAt: normalized.client_updated_at || normalized.updated_at
  };
}

function normalizePocketBaseChatRecord(record = {}) {
  if (!record) return null;
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

async function fetchPocketBaseChatRows(config = {}, options = {}) {
  const filters = [pocketbaseEq('campaignId', config.campaignId)];
  if (options.threadKey) filters.push(pocketbaseEq('threadKey', options.threadKey));
  if (options.since) filters.push(`updated>="${pocketbaseFilterValue(options.since)}"`);
  const rows = await pocketbaseList(config, 'chat', { filter: pocketbaseAnd(...filters), sort: 'updated,messageId', perPage: Math.max(1, Math.min(10000, Number(options.limit || 1000))) });
  return rows.map(normalizePocketBaseChatRecord).filter(Boolean);
}

async function upsertPocketBaseChatRow(config = {}, payload = {}) {
  const row = pocketBaseMessageFromChatRow(payload, config);
  const collection = encodePathPart(pocketbaseCollection(config, 'chat'));
  const existing = await pocketbaseFirst(config, 'chat', pocketbaseAnd(pocketbaseEq('campaignId', config.campaignId), pocketbaseEq('messageId', row.messageId)));
  const method = existing?.id ? 'PATCH' : 'POST';
  const path = existing?.id ? `/api/collections/${collection}/records/${encodePathPart(existing.id)}` : `/api/collections/${collection}/records`;
  const record = await pocketbaseFetch(config, path, { method, json: row });
  return normalizePocketBaseChatRecord(record);
}

async function upsertPocketBaseChatRows(config = {}, rows = []) {
  const result = [];
  for (const row of rows) result.push(await upsertPocketBaseChatRow(config, row));
  return result.filter(Boolean);
}

function normalizePocketBaseCombatRecord(record = {}) {
  if (!record) return null;
  return {
    _id: record.id,
    campaignId: record.campaignId,
    revision: Number(record.revision || 0),
    updatedAt: record.updated || null,
    updatedBy: record.updatedBy || null,
    clientUpdatedAt: record.clientUpdatedAt || null,
    activeSceneId: String(record.activeSceneId || '').trim(),
    scene: record.sceneJson || {},
    runtime: record.runtimeJson || {}
  };
}

async function fetchPocketBaseCombatRuntime(config = {}) {
  const record = await pocketbaseFirst(config, 'combat', pocketbaseEq('campaignId', config.campaignId));
  return normalizePocketBaseCombatRecord(record);
}

async function pushPocketBaseCombatRuntime(config = {}, payload = {}) {
  const normalized = await normalizeCombatPublishPayloadImages(config, payload);
  const now = new Date().toISOString();
  const actor = String(normalized.updatedBy || config.deviceLabel || 'unknown-device').trim() || 'unknown-device';
  const expectedRevision = Number.isFinite(Number(normalized.baseRevision)) ? Number(normalized.baseRevision) : 0;
  const current = await fetchPocketBaseCombatRuntime(config);
  const collection = encodePathPart(pocketbaseCollection(config, 'combat'));
  const writeRow = {
    campaignId: config.campaignId,
    updatedBy: actor,
    clientUpdatedAt: normalized.clientUpdatedAt || now,
    activeSceneId: String(normalized.active_scene_id || normalized.activeSceneId || normalized.scene_json?.id || '').trim(),
    sceneJson: normalized.scene_json || normalized.scene || {},
    runtimeJson: normalized.runtime_json || normalized.runtime || {}
  };
  if (!current) {
    if (expectedRevision !== 0) return { ok: false, status: 'conflict', message: 'Combat runtime already changed remotely', remote: null };
    const record = await pocketbaseFetch(config, `/api/collections/${collection}/records`, { method: 'POST', json: { ...writeRow, revision: 1 } });
    return { ok: true, status: 'inserted', row: normalizePocketBaseCombatRecord(record) };
  }
  if (current.revision !== expectedRevision) return { ok: false, status: 'conflict', message: 'Combat runtime has newer remote version', remote: current };
  const record = await pocketbaseFetch(config, `/api/collections/${collection}/records/${encodePathPart(current._id)}`, { method: 'PATCH', json: { ...writeRow, revision: expectedRevision + 1 } });
  return { ok: true, status: 'updated', row: normalizePocketBaseCombatRecord(record) };
}

async function uploadImageSourceToPocketBase(config = {}, source = '', options = {}) {
  if (!source) return { ok: false, message: 'Empty image source' };
  if (!config.enabled) return { ok: false, message: 'Sync disabled' };
  const kind = imageSourceKind(source);
  if (kind === 'http-url') return { ok: true, url: source, publicUrl: source, storagePath: options.storagePath || null, skipped: true };
  const contentType = inferImageContentType(source);
  const ext = extensionFromContentType(contentType) || extensionFromPathLike(source);
  const storagePath = options.storagePath || buildStorageImagePath(config, { ...options, ext });
  const buffer = await imageSourceToBuffer(source);
  const collection = pocketbaseCollection(config, 'assets');
  const form = new FormData();
  form.append('campaignId', config.campaignId);
  form.append('section', String(options.section || 'misc'));
  form.append('entityId', String(options.entityId || options.preferredStem || 'asset'));
  form.append('assetPath', storagePath);
  form.append('clientUpdatedAt', new Date().toISOString());
  form.append('file', new Blob([buffer], { type: contentType }), path.basename(storagePath));
  const record = await pocketbaseFetch(config, `/api/collections/${encodePathPart(collection)}/records`, { method: 'POST', form });
  const fileName = record?.file || path.basename(storagePath);
  const publicUrl = `${getPocketBaseBaseUrl(config)}/api/files/${encodePathPart(collection)}/${encodePathPart(record.id)}/${encodeURIComponent(fileName)}`;
  return { ok: true, bucket: collection, storagePath, publicUrl, url: publicUrl || source, contentType };
}


function broadcastUpdaterStatus(patch = {}) {
  updaterLatestStatus = {
    ...updaterLatestStatus,
    ...patch,
    packaged: app.isPackaged,
    available: Boolean(autoUpdater),
    updatedAt: new Date().toISOString()
  };
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win?.isDestroyed()) win.webContents.send('updater:status', updaterLatestStatus);
    } catch {}
  }
  return updaterLatestStatus;
}

function setupAutoUpdater() {
  if (updaterConfigured) return;
  updaterConfigured = true;
  if (!autoUpdater) {
    broadcastUpdaterStatus({
      status: 'unavailable',
      message: `electron-updater не установлен: ${updaterLoadError?.message || 'module not found'}`
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdaterStatus({ status: 'checking', message: 'Проверка обновлений...' });
  });
  autoUpdater.on('update-available', info => {
    broadcastUpdaterStatus({
      status: 'available',
      version: info?.version || '',
      releaseName: info?.releaseName || '',
      releaseDate: info?.releaseDate || '',
      message: `Доступна версия ${info?.version || ''}`.trim()
    });
  });
  autoUpdater.on('update-not-available', info => {
    broadcastUpdaterStatus({
      status: 'none',
      version: info?.version || app.getVersion(),
      message: 'Обновлений нет'
    });
  });
  autoUpdater.on('download-progress', progress => {
    broadcastUpdaterStatus({
      status: 'downloading',
      percent: Number(progress?.percent || 0),
      transferred: Number(progress?.transferred || 0),
      total: Number(progress?.total || 0),
      bytesPerSecond: Number(progress?.bytesPerSecond || 0),
      message: `Скачивание обновления: ${Math.round(Number(progress?.percent || 0))}%`
    });
  });
  autoUpdater.on('update-downloaded', info => {
    broadcastUpdaterStatus({
      status: 'downloaded',
      version: info?.version || '',
      message: 'Обновление загружено. Можно перезапустить приложение.'
    });
  });
  autoUpdater.on('error', error => {
    broadcastUpdaterStatus({
      status: 'error',
      message: error?.message || String(error)
    });
  });

  broadcastUpdaterStatus({ status: 'ready', message: app.isPackaged ? 'Updater готов' : 'Updater доступен только в packaged build' });
}

async function checkForUpdatesSafe(manual = false) {
  setupAutoUpdater();
  if (!autoUpdater) return broadcastUpdaterStatus({ status: 'unavailable', message: 'electron-updater не установлен' });
  if (!app.isPackaged) {
    return broadcastUpdaterStatus({ status: 'dev', message: 'Проверка обновлений работает только в собранном приложении' });
  }
  try {
    broadcastUpdaterStatus({ status: 'checking', message: manual ? 'Ручная проверка обновлений...' : 'Проверка обновлений при запуске...' });
    await autoUpdater.checkForUpdates();
    return updaterLatestStatus;
  } catch (error) {
    return broadcastUpdaterStatus({ status: 'error', message: error?.message || String(error) });
  }
}

async function downloadUpdateSafe() {
  setupAutoUpdater();
  if (!autoUpdater) return broadcastUpdaterStatus({ status: 'unavailable', message: 'electron-updater не установлен' });
  if (!app.isPackaged) return broadcastUpdaterStatus({ status: 'dev', message: 'Скачивание работает только в собранном приложении' });
  try {
    broadcastUpdaterStatus({ status: 'downloading', percent: 0, message: 'Запуск скачивания обновления...' });
    await autoUpdater.downloadUpdate();
    return updaterLatestStatus;
  } catch (error) {
    return broadcastUpdaterStatus({ status: 'error', message: error?.message || String(error) });
  }
}
let mainWindow = null;
let playerDisplayWindow = null;
let playerDisplayMirrorState = { mode: '', activeSceneId: '', activeRegionMapId: '', cameraByScene: {}, regionCamera: null, updatedAt: null };
let updaterConfigured = false;
let updaterLatestStatus = { status: 'idle', packaged: false, available: Boolean(autoUpdater), message: '' };

function broadcastCombatRuntimeEvent(payload = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win?.isDestroyed()) win.webContents.send('combat:runtime:event', payload);
    } catch {}
  }
}

function broadcastChatRealtimeEvent(payload = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win?.isDestroyed()) win.webContents.send('chat:remote:event', payload);
    } catch {}
  }
}

function broadcastWorldSnapshotRealtimeEvent(payload = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win?.isDestroyed()) win.webContents.send('sync:snapshot:event', payload);
    } catch {}
  }
}

async function setupNetworkRealtime(config = {}) {
  await Promise.allSettled([teardownSelfhostRealtime(), teardownPocketBaseRealtime()]);
  if (!config?.enabled) return;
  if (isSelfhostSyncConfig(config)) {
    await setupSelfhostRealtime(config);
    return;
  }
  if (isPocketBaseSyncConfig(config)) {
    await setupPocketBaseRealtime(config);
    return;
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function teardownNetworkRealtime() {
  await Promise.allSettled([teardownSelfhostRealtime(), teardownPocketBaseRealtime()]);
}

function sanitizePlayerObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function sanitizeInventoryArray(value) {
  return Array.isArray(value) ? value.map(item => (item && typeof item === 'object' ? { ...item } : item)).filter(Boolean) : [];
}

function combineSegmentedPlayerState(row = {}) {
  const profile = sanitizePlayerObject(row.profile_json || row.profile || row.player_json || row.player || {});
  const privateState = sanitizePlayerObject(row.private_state_json || row.privateState || {});
  const inventory = sanitizeInventoryArray(row.inventory_json || row.inventory || []);
  const merged = { ...profile, ...privateState };
  merged.inventory = inventory;
  if (privateState.__deleted) merged.__deleted = true;
  return merged;
}

function splitPlayerState(player = {}, options = {}) {
  const source = sanitizePlayerObject(player);
  const inventory = sanitizeInventoryArray(source.inventory);
  const privateState = sanitizePlayerObject(options.privateState || source.private_state_json || {});
  if (options.deleted) privateState.__deleted = true;
  const profile = { ...source };
  delete profile.inventory;
  delete profile.private_state_json;
  delete profile.profile_json;
  delete profile.inventory_json;
  return {
    profile_json: profile,
    inventory_json: inventory,
    private_state_json: privateState
  };
}

function normalizePlayerRowPayload(payload = {}) {
  const playerId = String(payload.player_id || payload.playerId || payload.id || '').trim();
  if (!playerId) throw new Error('player_id is required');
  const basePlayer = payload.player_json || payload.player || payload.data || payload.entity || {};
  const segments = splitPlayerState(basePlayer, {
    privateState: payload.private_state_json || payload.privateState || null,
    deleted: Boolean(payload.deleted || payload.deleted_at || payload.deletedAt)
  });
  return {
    player_id: playerId,
    player: combineSegmentedPlayerState({
      profile_json: segments.profile_json,
      inventory_json: segments.inventory_json,
      private_state_json: segments.private_state_json
    }),
    profile_json: segments.profile_json,
    inventory_json: segments.inventory_json,
    private_state_json: segments.private_state_json,
    version: Number.isFinite(Number(payload.version)) ? Number(payload.version) : null,
    baseVersion: Number.isFinite(Number(payload.baseVersion)) ? Number(payload.baseVersion) : (Number.isFinite(Number(payload.version)) ? Number(payload.version) : 0),
    updatedBy: String(payload.updated_by || payload.updatedBy || '').trim() || null,
    clientUpdatedAt: payload.client_updated_at || payload.clientUpdatedAt || null,
    deletedAt: payload.deleted_at || payload.deletedAt || (segments.private_state_json?.__deleted ? new Date().toISOString() : null)
  };
}

async function fetchRemotePlayerRows(config = {}, options = {}) {
  if (isPocketBaseSyncConfig(config)) return fetchPocketBasePlayerRows(config, options);
  if (isSelfhostSyncConfig(config)) {
    const result = await selfhostFetch(config, selfhostPlayersPath(config), { query: { since: options.since || '', limit: options.limit || 500, playerId: options.playerId || '' } });
    if (!result?.ok) throw new Error(result?.message || 'Self-host players pull failed');
    return Array.isArray(result.rows) ? result.rows : [];
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function fetchRemotePlayerRow(config = {}, playerId = '') {
  const rows = await fetchRemotePlayerRows(config, { playerId, limit: 1 });
  return rows[0] || null;
}



async function pushRemotePlayerRow(config = {}, payload = {}) {
  if (isPocketBaseSyncConfig(config)) return writePocketBasePlayerRow(config, payload, { patchOnly: false, deleted: false });
  if (isSelfhostSyncConfig(config)) {
    const row = normalizePlayerRowPayload(payload);
    const result = await selfhostFetch(config, selfhostPlayersPath(config, row.player_id), {
      method: 'PUT',
      json: {
        playerId: row.player_id,
        baseVersion: row.baseVersion,
        player: row.player,
        private_state_json: row.private_state_json,
        updatedBy: row.updatedBy || config.deviceLabel || 'unknown-device',
        clientUpdatedAt: row.clientUpdatedAt || new Date().toISOString()
      }
    });
    return result;
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function patchRemotePlayerRow(config = {}, payload = {}) {
  if (isPocketBaseSyncConfig(config)) return writePocketBasePlayerRow(config, payload, { patchOnly: true, deleted: false });
  if (isSelfhostSyncConfig(config)) {
    const playerId = String(payload.player_id || payload.playerId || payload.id || '').trim();
    if (!playerId) throw new Error('player_id is required');
    const baseVersion = Number.isFinite(Number(payload.baseVersion)) ? Number(payload.baseVersion) : (Number.isFinite(Number(payload.version)) ? Number(payload.version) : 0);
    const result = await selfhostFetch(config, selfhostPlayersPath(config, playerId), {
      method: 'PATCH',
      json: {
        playerId,
        baseVersion,
        player: payload.player || payload.player_json || payload.data || payload.entity || {},
        private_state_json: payload.private_state_json || payload.privateState || {},
        updatedBy: payload.updatedBy || payload.updated_by || config.deviceLabel || 'unknown-device',
        clientUpdatedAt: payload.clientUpdatedAt || payload.client_updated_at || new Date().toISOString()
      }
    });
    return result;
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function deleteRemotePlayerRow(config = {}, payload = {}) {
  if (isPocketBaseSyncConfig(config)) return writePocketBasePlayerRow(config, { ...payload, player_json: { id: payload?.player_id || payload?.playerId || payload?.id || '', __deleted: true } }, { patchOnly: true, deleted: true });
  if (isSelfhostSyncConfig(config)) {
    const row = normalizePlayerRowPayload(payload);
    const result = await selfhostFetch(config, selfhostPlayersPath(config, row.player_id), {
      method: 'DELETE',
      json: {
        playerId: row.player_id,
        baseVersion: row.baseVersion,
        updatedBy: row.updatedBy || config.deviceLabel || 'unknown-device',
        clientUpdatedAt: row.clientUpdatedAt || new Date().toISOString()
      }
    });
    return result;
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

function normalizeChatRowInput(payload = {}) {
  const kind = String(payload.kind || '').trim() === 'npc' ? 'npc' : 'direct';
  const messageId = String(payload.message_id || payload.messageId || '').trim();
  if (!messageId) throw new Error('chat message_id is required');
  const createdAt = payload.created_at || payload.createdAt || new Date().toISOString();
  const updatedAt = payload.updated_at || payload.updatedAt || payload.client_updated_at || payload.clientUpdatedAt || new Date().toISOString();
  const row = {
    message_id: messageId,
    kind,
    thread_key: String(payload.thread_key || payload.threadKey || '').trim(),
    sender_type: String(payload.sender_type || payload.senderType || '').trim() || 'player',
    sender_id: payload.sender_id != null ? String(payload.sender_id) : (payload.senderId != null ? String(payload.senderId) : null),
    recipient_player_id: payload.recipient_player_id != null ? String(payload.recipient_player_id) : (payload.recipientPlayerId != null ? String(payload.recipientPlayerId) : null),
    npc_id: payload.npc_id != null ? String(payload.npc_id) : (payload.npcId != null ? String(payload.npcId) : null),
    direct_a: payload.direct_a != null ? String(payload.direct_a) : (payload.directA != null ? String(payload.directA) : null),
    direct_b: payload.direct_b != null ? String(payload.direct_b) : (payload.directB != null ? String(payload.directB) : null),
    author_label: String(payload.author_label || payload.authorLabel || '').trim() || null,
    body_html: String(payload.body_html || payload.bodyHtml || payload.text || '').trim(),
    created_at: createdAt,
    edited_at: payload.edited_at || payload.editedAt || null,
    deleted_at: payload.deleted_at || payload.deletedAt || null,
    updated_at: updatedAt,
    client_updated_at: payload.client_updated_at || payload.clientUpdatedAt || updatedAt
  };
  if (!row.thread_key) {
    row.thread_key = kind === 'npc'
      ? `${row.npc_id || ''}__${row.recipient_player_id || ''}`
      : [String(row.direct_a || ''), String(row.direct_b || '')].sort().join('__');
  }
  return row;
}

async function fetchRemoteChatRows(config = {}, options = {}) {
  if (isPocketBaseSyncConfig(config)) return fetchPocketBaseChatRows(config, options);
  if (isSelfhostSyncConfig(config)) {
    const result = await selfhostFetch(config, selfhostChatPath(config), { query: { since: options.since || '', limit: options.limit || 1000, threadKey: options.threadKey || '' } });
    if (!result?.ok) throw new Error(result?.message || 'Self-host chat pull failed');
    return Array.isArray(result.rows) ? result.rows : [];
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function upsertRemoteChatRow(config = {}, payload = {}) {
  if (isPocketBaseSyncConfig(config)) return upsertPocketBaseChatRow(config, payload);
  if (isSelfhostSyncConfig(config)) {
    const result = await selfhostFetch(config, selfhostChatPath(config), { method: 'POST', json: payload });
    if (!result?.ok) throw new Error(result?.message || 'Self-host chat upsert failed');
    return result.row || payload;
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function upsertRemoteChatRows(config = {}, rows = []) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (isPocketBaseSyncConfig(config)) return upsertPocketBaseChatRows(config, rows);
  if (isSelfhostSyncConfig(config)) {
    const result = await selfhostFetch(config, selfhostChatPath(config, 'batch'), { method: 'POST', json: { rows } });
    if (!result?.ok) throw new Error(result?.message || 'Self-host chat batch upsert failed');
    return Array.isArray(result.rows) ? result.rows : rows;
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function fetchRemoteSnapshot(config = {}, options = {}) {
  if (isPocketBaseSyncConfig(config)) return fetchPocketBaseSnapshot(config, options);
  if (isSelfhostSyncConfig(config)) {
    return selfhostFetch(config, selfhostSnapshotPath(config), { query: { includePayload: options.includePayload === false ? '0' : '1' } });
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function pushRemoteSnapshot(config = {}, payload = {}) {
  if (isPocketBaseSyncConfig(config)) return pushPocketBaseSnapshot(config, payload);
  if (isSelfhostSyncConfig(config)) {
    return selfhostFetch(config, selfhostSnapshotPath(config), {
      method: 'POST',
      json: {
        world: payload.world || {},
        state: payload.state || {},
        baseRevision: payload.baseRevision,
        updatedBy: payload.updatedBy || config.deviceLabel || 'unknown-device',
        clientUpdatedAt: payload.clientUpdatedAt || new Date().toISOString()
      }
    });
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function fetchRemoteCombatRuntime(config = {}) {
  if (isPocketBaseSyncConfig(config)) return fetchPocketBaseCombatRuntime(config);
  if (isSelfhostSyncConfig(config)) {
    const result = await selfhostFetch(config, selfhostCombatPath(config));
    if (!result?.ok) throw new Error(result?.message || 'Self-host combat pull failed');
    return result.row || null;
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}

async function pushRemoteCombatRuntime(config = {}, payload = {}) {
  if (isPocketBaseSyncConfig(config)) return pushPocketBaseCombatRuntime(config, payload);
  if (isSelfhostSyncConfig(config)) {
    const normalized = await normalizeCombatPublishPayloadImages(config, payload);
    const result = await selfhostFetch(config, selfhostCombatPath(config), {
      method: 'PUT',
      json: {
        ...normalized,
        updatedBy: normalized.updatedBy || config.deviceLabel || 'unknown-device',
        clientUpdatedAt: normalized.clientUpdatedAt || new Date().toISOString()
      }
    });
    return result;
  }
  throw new Error('Неподдерживаемый провайдер синхронизации');
}


function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: 'Galactic RPG Interface',
    backgroundColor: '#04070b',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.webContents.on('did-finish-load', () => {
    try { win.webContents.send('updater:status', updaterLatestStatus); } catch {}
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const shouldOpenDevTools = !app.isPackaged && process.env.ELECTRON_OPEN_DEVTOOLS === '1';
  if (shouldOpenDevTools) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
  return win;
}

function getExternalDisplay() {
  const displays = screen.getAllDisplays();
  if (!displays.length) return null;
  const primaryId = screen.getPrimaryDisplay()?.id;
  return displays.find(display => display.id !== primaryId) || displays[0] || null;
}

function openPlayerDisplayWindow() {
  if (playerDisplayWindow && !playerDisplayWindow.isDestroyed()) {
    playerDisplayWindow.show();
    playerDisplayWindow.focus();
    return playerDisplayWindow;
  }
  const targetDisplay = getExternalDisplay();
  const hasSecondDisplay = Boolean(targetDisplay && screen.getAllDisplays().length > 1);
  const bounds = targetDisplay?.bounds || { x: 120, y: 120, width: 1440, height: 900 };
  playerDisplayWindow = new BrowserWindow({
    x: Number(bounds.x || 0),
    y: Number(bounds.y || 0),
    width: Math.max(960, Number(bounds.width || 1440)),
    height: Math.max(640, Number(bounds.height || 900)),
    backgroundColor: '#02050a',
    autoHideMenuBar: true,
    title: 'Galactic RPG Interface — Player Display',
    frame: false,
    titleBarStyle: 'hidden',
    fullscreen: hasSecondDisplay,
    kiosk: false,
    resizable: true,
    minimizable: false,
    maximizable: !hasSecondDisplay,
    fullscreenable: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  playerDisplayWindow.loadFile(path.join(__dirname, 'renderer', 'player-display.html'));
  playerDisplayWindow.webContents.on('did-finish-load', () => {
    try { playerDisplayWindow?.webContents?.send('display:player:view', playerDisplayMirrorState); } catch {}
  });
  playerDisplayWindow.on('closed', () => { playerDisplayWindow = null; });
  const shouldOpenDevTools = !app.isPackaged && process.env.ELECTRON_OPEN_DEVTOOLS === '1';
  if (shouldOpenDevTools) {
    playerDisplayWindow.webContents.openDevTools({ mode: 'detach' });
  }
  return playerDisplayWindow;
}

function closePlayerDisplayWindow() {
  if (playerDisplayWindow && !playerDisplayWindow.isDestroyed()) {
    playerDisplayWindow.close();
    playerDisplayWindow = null;
    return true;
  }
  return false;
}

ipcMain.handle('state:load', async () => {
  const file = stateFilePath();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = await fs.promises.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { __error: true, message: error.message };
  }
});

ipcMain.handle('state:save', async (_event, payload) => {
  const file = stateFilePath();
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, file };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('readMarkers:load', async () => {
  const file = readMarkersFilePath();
  try {
    if (!fs.existsSync(file)) return { ok: true, markers: null, file };
    const raw = await fs.promises.readFile(file, 'utf8');
    return { ok: true, markers: JSON.parse(raw), file };
  } catch (error) {
    return { ok: false, message: error.message, file };
  }
});

ipcMain.handle('readMarkers:save', async (_event, payload) => {
  const file = readMarkersFilePath();
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(payload || {}, null, 2), 'utf8');
    return { ok: true, file };
  } catch (error) {
    return { ok: false, message: error.message, file };
  }
});

ipcMain.on('readMarkers:saveSync', (event, payload) => {
  const file = readMarkersFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload || {}, null, 2), 'utf8');
    event.returnValue = { ok: true, file };
  } catch (error) {
    event.returnValue = { ok: false, message: error.message, file };
  }
});

ipcMain.handle('world:load', async () => {
  try {
    const { dataDir, world } = await readWorldData();
    return { ok: true, world, dataDir };
  } catch (error) {
    return { ok: false, message: error.message, dataDir: writableWorldDataDir() };
  }
});

ipcMain.handle('world:saveSection', async (_event, sectionName, payload) => {
  try {
    const result = await writeWorldSection(sectionName, payload);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('world:saveAll', async (_event, payload) => {
  try {
    debugLog('WORLD_SAVE_ALL_START', {
      sections: Object.keys(payload || {}),
      planets: Object.keys(payload?.planets?.PLANETS || {}).length,
      systems: (payload?.systems?.SYSTEMS || []).length,
      npcs: Object.keys(payload?.npcs?.NPCS || {}).length
    });

    let worldPayload = payload || {};
    try {
      const config = await loadSyncConfig();
      if (config.enabled) {
        const normalized = await normalizeSnapshotImagesForCloud(config, { world: worldPayload, state: {} });
        worldPayload = normalized.world || worldPayload;
        debugLog('WORLD_SAVE_ALL_IMAGE_UPLOAD_DONE', {
          campaignId: config.campaignId,
        });
      }
    } catch (error) {
      debugLog('WORLD_SAVE_ALL_IMAGE_UPLOAD_FAILED', { message: error.message, stack: error.stack });
      throw new Error(`Cloud asset upload failed: ${error.message}`);
    }

    await writeWorldData(worldPayload);
    const { dataDir, world } = await readWorldData();
    debugLog('WORLD_SAVE_ALL_DONE', {
      dataDir,
      planets: Object.keys(world?.planets?.PLANETS || {}).length,
      systems: (world?.systems?.SYSTEMS || []).length,
      npcs: Object.keys(world?.npcs?.NPCS || {}).length
    });
    return { ok: true, dataDir, world };
  } catch (error) {
    debugLog('WORLD_SAVE_ALL_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('world:reset', async () => {
  try {
    const dataDir = await resetWorldDataDir();
    return { ok: true, dataDir };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('app:paths', async () => {
  return {
    userData: app.getPath('userData'),
    stateFile: stateFilePath(),
    worldDataDir: writableWorldDataDir(),
    worldAssetsDir: writableWorldAssetsDir(),
    defaultWorldDataDir: defaultWorldDataDir(),
    syncConfigFile: syncConfigFilePath(),
    readMarkersFile: readMarkersFilePath()
  };
});



function isDevOpsDmRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'gm' || normalized === 'dm' || normalized === 'master';
}

function getDevOpsModule() {
  return require(path.join(__dirname, 'tools', 'devops-automation.cjs'));
}

function serializeDevOpsError(error) {
  return {
    ok: false,
    message: error?.message || String(error),
    command: error?.command || '',
    stdout: String(error?.stdout || '').trim(),
    stderr: String(error?.stderr || '').trim()
  };
}

function validateDevOpsRequest(event, payload = {}) {
  if (app.isPackaged) throw new Error('DEV-инструменты недоступны в собранном приложении');
  if (!isDevOpsDmRole(payload?.role)) throw new Error('DEV-инструменты доступны только ДМу');
  if (mainWindow && !mainWindow.isDestroyed() && event?.sender !== mainWindow.webContents) {
    throw new Error('DEV-команда отклонена: неизвестное окно');
  }
  return __dirname;
}

ipcMain.handle('devops:status', async (event, payload) => {
  if (app.isPackaged || !isDevOpsDmRole(payload?.role)) {
    return {
      ok: true,
      available: false,
      reason: app.isPackaged ? 'packaged-build' : 'dm-required',
      message: app.isPackaged ? 'DEV-инструменты доступны только при запуске исходного проекта' : 'Требуется режим ДМа'
    };
  }
  try {
    const rootDir = validateDevOpsRequest(event, payload);
    return await getDevOpsModule().getStatus(rootDir);
  } catch (error) {
    return { ok: false, available: false, message: error?.message || String(error) };
  }
});

ipcMain.handle('devops:publishPatch', async (event, payload) => {
  try {
    const rootDir = validateDevOpsRequest(event, payload);
    return await getDevOpsModule().publishPatch(rootDir);
  } catch (error) {
    debugLog('DEVOPS_PUBLISH_FAILED', { message: error?.message, command: error?.command, stderr: error?.stderr });
    return serializeDevOpsError(error);
  }
});

ipcMain.handle('devops:deployWeb', async (event, payload) => {
  try {
    const rootDir = validateDevOpsRequest(event, payload);
    return await getDevOpsModule().deployWeb(rootDir);
  } catch (error) {
    debugLog('DEVOPS_WEB_DEPLOY_FAILED', { message: error?.message, command: error?.command, stderr: error?.stderr });
    return serializeDevOpsError(error);
  }
});

ipcMain.handle('devops:createSourceArchive', async (event, payload) => {
  try {
    const rootDir = validateDevOpsRequest(event, payload);
    const devops = getDevOpsModule();
    const result = await dialog.showSaveDialog(mainWindow || undefined, {
      title: 'Сохранить ZIP исходников для передачи',
      defaultPath: path.join(app.getPath('documents'), devops.defaultArchiveName(rootDir)),
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    const outputPath = result.filePath.toLowerCase().endsWith('.zip') ? result.filePath : `${result.filePath}.zip`;
    return await devops.createSourceArchive(rootDir, outputPath);
  } catch (error) {
    debugLog('DEVOPS_ARCHIVE_FAILED', { message: error?.message, command: error?.command, stderr: error?.stderr });
    return serializeDevOpsError(error);
  }
});

ipcMain.handle('updater:status', async () => {
  setupAutoUpdater();
  return updaterLatestStatus;
});

ipcMain.handle('updater:check', async () => {
  return checkForUpdatesSafe(true);
});

ipcMain.handle('updater:download', async () => {
  return downloadUpdateSafe();
});

ipcMain.handle('updater:install', async () => {
  setupAutoUpdater();
  if (!autoUpdater) return { ok: false, status: 'unavailable', message: 'electron-updater не установлен' };
  if (!app.isPackaged) return { ok: false, status: 'dev', message: 'Установка работает только в собранном приложении' };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true, status: 'installing' };
});

ipcMain.handle('app:openWorldDataDir', async () => {
  const target = writableWorldDataDir();
  try {
    await fs.promises.mkdir(target, { recursive: true });
    const message = await shell.openPath(target);
    return { ok: !message, path: target, message: message || '' };
  } catch (error) {
    return { ok: false, path: target, message: error?.message || String(error) };
  }
});

ipcMain.handle('app:backupWorldData', async () => {
  try {
    return await exportCampaignBackup();
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
});

ipcMain.handle('world:saveImage', async (_event, payload) => {
  try {
    const dataUrl = payload?.dataUrl || '';
    const preferredStem = payload?.preferredStem || 'asset';
    const result = await saveImageAsset(dataUrl, preferredStem);
    debugLog('WORLD_SAVE_IMAGE', { ok: result.ok, file: result.file, url: result.url });
    return result;
  } catch (error) {
    debugLog('WORLD_SAVE_IMAGE_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('combat:sound:save', async (_event, payload) => {
  try {
    const dataUrl = payload?.dataUrl || '';
    const preferredStem = payload?.preferredStem || payload?.name || 'combat_sound';
    const result = await saveCombatSoundAsset(dataUrl, preferredStem);
    debugLog('COMBAT_SAVE_SOUND', { ok: result.ok, file: result.file, url: result.url });
    return result;
  } catch (error) {
    debugLog('COMBAT_SAVE_SOUND_FAILED', { message: error?.message || String(error), stack: error?.stack });
    return { ok: false, message: error?.message || String(error) };
  }
});

ipcMain.handle('sync:config:load', async () => {
  const config = await loadSyncConfig();
  try { await setupNetworkRealtime(config); } catch {}
  return { ok: true, config, file: syncConfigFilePath() };
});

ipcMain.handle('sync:config:save', async (_event, payload) => {
  try {
    const result = await saveSyncConfig(payload || {});
    await setupNetworkRealtime(result.config);
    debugLog('SYNC_CONFIG_SAVED', { file: result.file, enabled: result.config.enabled, campaignId: result.config.campaignId, tableName: result.config.tableName });
    return result;
  } catch (error) {
    debugLog('SYNC_CONFIG_SAVE_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, message: error.message, file: syncConfigFilePath() };
  }
});

ipcMain.handle('sync:ping', async () => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, connected: false, message: 'Синхронизация выключена', config };
    }
    const remote = await fetchRemoteSnapshot(config, { includePayload: false });
    return {
      ok: true,
      enabled: true,
      connected: true,
      config,
      remote: remote.remote,
      hasRemoteSnapshot: Boolean(remote.exists)
    };
  } catch (error) {
    debugLog('SYNC_PING_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, enabled: true, connected: false, message: error.message };
  }
});

ipcMain.handle('sync:pull', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, status: 'disabled', message: 'Синхронизация выключена', config };
    }
    const localRevision = Number(payload?.localRevision || 0);
    const force = Boolean(payload?.force);
    const remote = await fetchRemoteSnapshot(config, { includePayload: true });
    if (!remote.exists) {
      return { ok: true, enabled: true, connected: true, status: 'empty', message: `В ${isPocketBaseSyncConfig(config) ? 'PocketBase' : 'выделенном сервере'} ещё нет снапшота кампании`, remote: null, config };
    }
    const remoteRevision = Number(remote.remote?.revision || 0);
    const newer = force || remoteRevision > localRevision;
    return {
      ok: true,
      enabled: true,
      connected: true,
      status: newer ? 'newer' : 'up-to-date',
      newer,
      config,
      remote: remote.remote,
      payload: newer ? { world: remote.remote.world, state: remote.remote.state } : null
    };
  } catch (error) {
    debugLog('SYNC_PULL_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, enabled: true, connected: false, status: 'error', message: error.message };
  }
});

ipcMain.handle('sync:push', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, status: 'disabled', message: 'Синхронизация выключена', config };
    }
    const snapshot = payload?.snapshot || {};
    const normalizedSnapshot = await normalizeSnapshotImagesForCloud(config, snapshot);
    debugLog('SYNC_IMAGE_NORMALIZE_DONE', {
      campaignId: config.campaignId,
    });
    const result = await pushRemoteSnapshot(config, {
      world: normalizedSnapshot.world || {},
      state: normalizedSnapshot.state || {},
      baseRevision: payload?.baseRevision,
      updatedBy: payload?.updatedBy || config.deviceLabel || 'unknown-device',
      clientUpdatedAt: payload?.clientUpdatedAt || new Date().toISOString()
    });
    debugLog('SYNC_PUSH_RESULT', {
      ok: result.ok,
      status: result.status,
      revision: result.remote?.revision || null,
      updatedBy: result.remote?.updatedBy || null,
      campaignId: config.campaignId
    });
    return { ...result, enabled: true, connected: true, config, snapshot: normalizedSnapshot };
  } catch (error) {
    debugLog('SYNC_PUSH_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, enabled: true, connected: false, status: 'error', message: error.message };
  }
});


ipcMain.handle('chat:pull', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, status: 'disabled', rows: [], message: 'Синхронизация выключена', config };
    }
    const rows = await fetchRemoteChatRows(config, {
      since: payload?.since || null,
      limit: payload?.limit || 1000,
      threadKey: payload?.threadKey || null
    });
    return { ok: true, enabled: true, connected: true, status: 'ok', rows, config };
  } catch (error) {
    debugLog('CHAT_PULL_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, enabled: true, connected: false, status: 'error', rows: [], message: error.message };
  }
});

ipcMain.handle('chat:upsert', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, status: 'disabled', message: 'Синхронизация выключена', row: payload?.row || payload?.message || null, config };
    }
    const row = await upsertRemoteChatRow(config, payload?.row || payload?.message || payload || {});
    return { ok: true, enabled: true, connected: true, status: 'ok', row, config };
  } catch (error) {
    debugLog('CHAT_UPSERT_FAILED', { message: error.message, stack: error.stack, payload });
    return { ok: false, enabled: true, connected: false, status: 'error', message: error.message };
  }
});

ipcMain.handle('chat:pushBatch', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, status: 'disabled', message: 'Синхронизация выключена', rows: payload?.rows || [], config };
    }
    const rows = await upsertRemoteChatRows(config, Array.isArray(payload?.rows) ? payload.rows : []);
    return { ok: true, enabled: true, connected: true, status: 'ok', rows, config };
  } catch (error) {
    debugLog('CHAT_BATCH_PUSH_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, enabled: true, connected: false, status: 'error', message: error.message, rows: [] };
  }
});

ipcMain.handle('players:pull', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, status: 'disabled', rows: [], message: 'Синхронизация выключена', config };
    }
    const rows = await fetchRemotePlayerRows(config, {
      since: payload?.since || null,
      limit: payload?.limit || 500,
      playerId: payload?.playerId || null
    });
    return { ok: true, enabled: true, connected: true, status: 'ok', rows, config };
  } catch (error) {
    debugLog('PLAYER_PULL_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, enabled: true, connected: false, status: 'error', rows: [], message: error.message };
  }
});

ipcMain.handle('players:push', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, status: 'disabled', message: 'Синхронизация выключена', row: payload || null, config };
    }
    const result = await pushRemotePlayerRow(config, payload || {});
    return { ...result, enabled: true, connected: true, config };
  } catch (error) {
    debugLog('PLAYER_PUSH_FAILED', { message: error.message, stack: error.stack, payload });
    return { ok: false, enabled: true, connected: false, status: 'error', message: error.message };
  }
});

ipcMain.handle('players:patch', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, status: 'disabled', message: 'Синхронизация выключена', row: payload || null, config };
    }
    const result = await patchRemotePlayerRow(config, payload || {});
    return { ...result, enabled: true, connected: true, config };
  } catch (error) {
    debugLog('PLAYER_PATCH_FAILED', { message: error.message, stack: error.stack, payload });
    return { ok: false, enabled: true, connected: false, status: 'error', message: error.message };
  }
});

ipcMain.handle('players:delete', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) {
      return { ok: true, enabled: false, status: 'disabled', message: 'Синхронизация выключена', row: payload || null, config };
    }
    const result = await deleteRemotePlayerRow(config, payload || {});
    return { ...result, enabled: true, connected: true, config };
  } catch (error) {
    debugLog('PLAYER_DELETE_FAILED', { message: error.message, stack: error.stack, payload });
    return { ok: false, enabled: true, connected: false, status: 'error', message: error.message };
  }
});

ipcMain.handle('debug:log', async (_event, label, payload) => {
  debugLog(label || 'DEBUG', payload);
  return { ok: true };
});

ipcMain.handle('combat:pull', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) return { ok: false, status: 'disabled', message: 'Sync disabled' };
    const row = await fetchRemoteCombatRuntime(config);
    return { ok: true, status: row ? 'ok' : 'empty', row };
  } catch (error) {
    debugLog('COMBAT_PULL_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('combat:push', async (_event, payload) => {
  try {
    const config = await loadSyncConfig();
    if (!config.enabled) return { ok: false, status: 'disabled', message: 'Sync disabled' };
    const res = await pushRemoteCombatRuntime(config, payload || {});
    if (res?.ok && res?.row) {
      try { broadcastCombatRuntimeEvent({ eventType: 'local-push', row: res.row }); } catch {}
    }
    return { ok: true, ...res };
  } catch (error) {
    debugLog('COMBAT_PUSH_FAILED', { message: error.message, stack: error.stack });
    return { ok: false, message: error.message };
  }
});



ipcMain.handle('display:player:open', async () => {
  try {
    const win = openPlayerDisplayWindow();
    return { ok: true, opened: Boolean(win), externalDisplay: screen.getAllDisplays().length > 1 };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('display:player:close', async () => {
  try {
    const closed = closePlayerDisplayWindow();
    return { ok: true, closed };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('display:player:status', async () => {
  return {
    ok: true,
    open: Boolean(playerDisplayWindow && !playerDisplayWindow.isDestroyed()),
    externalDisplay: screen.getAllDisplays().length > 1
  };
});

ipcMain.handle('display:player:view:get', async () => ({
  ok: true,
  payload: playerDisplayMirrorState
}));

ipcMain.handle('display:player:view:update', async (_event, payload) => {
  try {
    const next = payload && typeof payload === 'object' ? payload : {};
    const hasMode = Object.prototype.hasOwnProperty.call(next, 'mode');
    const hasRegionMap = Object.prototype.hasOwnProperty.call(next, 'activeRegionMapId');
    const hasRegionCamera = Object.prototype.hasOwnProperty.call(next, 'regionCamera');
    playerDisplayMirrorState = {
      mode: hasMode ? String(next.mode || '').trim() : (playerDisplayMirrorState.mode || ''),
      activeSceneId: String(next.activeSceneId || playerDisplayMirrorState.activeSceneId || '').trim(),
      activeRegionMapId: hasRegionMap ? String(next.activeRegionMapId || '').trim() : (playerDisplayMirrorState.activeRegionMapId || ''),
      cameraByScene: next.cameraByScene && typeof next.cameraByScene === 'object' ? next.cameraByScene : (playerDisplayMirrorState.cameraByScene || {}),
      regionCamera: hasRegionCamera ? (next.regionCamera && typeof next.regionCamera === 'object' ? next.regionCamera : null) : (playerDisplayMirrorState.regionCamera || null),
      updatedAt: next.updatedAt || new Date().toISOString()
    };
    if (playerDisplayWindow && !playerDisplayWindow.isDestroyed()) {
      playerDisplayWindow.webContents.send('display:player:view', playerDisplayMirrorState);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

app.whenReady().then(async () => {

  await ensureWorldDataDir();
  try {
    const syncConfig = await loadSyncConfig();
    await setupNetworkRealtime(syncConfig);
  } catch (error) {
    debugLog('COMBAT_RUNTIME_REALTIME_BOOT_FAILED', { message: error.message, stack: error.stack });
  }
  createWindow();
  setupAutoUpdater();
  setTimeout(() => {
    void checkForUpdatesSafe(false);
  }, 2500);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
