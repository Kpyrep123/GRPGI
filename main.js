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

const WORLD_FILE_NAMES = ['players','systems','planets','npcs','equipment','flora','fauna','articles','news','tasks','organizations','combatScenes','ui'];
const DEFAULT_SYNC_TABLE = 'campaign_snapshots';
const DEFAULT_CHAT_TABLE = 'campaign_messages';
const DEFAULT_PLAYER_TABLE = 'campaign_players';
const DEFAULT_COMBAT_RUNTIME_TABLE = 'campaign_combat_runtime';
const DEFAULT_STORAGE_BUCKET = 'campaign-assets';

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
  // Combat sounds are local editor assets, intentionally not part of Supabase/world-data sync.
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
    url: '',
    anonKey: '',
    campaignId: '',
    deviceLabel: '',
    tableName: DEFAULT_SYNC_TABLE,
    chatTableName: DEFAULT_CHAT_TABLE,
    playerTableName: DEFAULT_PLAYER_TABLE,
    combatRuntimeTableName: DEFAULT_COMBAT_RUNTIME_TABLE,
    storageBucket: DEFAULT_STORAGE_BUCKET,
    pollIntervalMs: 45000,
    connectTimeoutMs: 8000
  };
}

function normalizeSyncConfig(payload = {}) {
  const base = defaultSyncConfig();
  return {
    ...base,
    ...payload,
    enabled: Boolean(payload?.enabled),
    url: String(payload?.url || base.url).trim(),
    anonKey: String(payload?.anonKey || base.anonKey).trim(),
    campaignId: String(payload?.campaignId || base.campaignId).trim(),
    deviceLabel: String(payload?.deviceLabel || base.deviceLabel).trim(),
    tableName: String(payload?.tableName || base.tableName || DEFAULT_SYNC_TABLE).trim() || DEFAULT_SYNC_TABLE,
    chatTableName: String(payload?.chatTableName || base.chatTableName || DEFAULT_CHAT_TABLE).trim() || DEFAULT_CHAT_TABLE,
    playerTableName: String(payload?.playerTableName || base.playerTableName || DEFAULT_PLAYER_TABLE).trim() || DEFAULT_PLAYER_TABLE,
    combatRuntimeTableName: String(payload?.combatRuntimeTableName || base.combatRuntimeTableName || DEFAULT_COMBAT_RUNTIME_TABLE).trim() || DEFAULT_COMBAT_RUNTIME_TABLE,
    storageBucket: String(payload?.storageBucket || base.storageBucket || DEFAULT_STORAGE_BUCKET).trim() || DEFAULT_STORAGE_BUCKET,
    pollIntervalMs: Math.max(10000, Number(payload?.pollIntervalMs || base.pollIntervalMs || 45000)),
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

function getPublicImageUrl(config = {}, storagePath = '') {
  const client = getSupabaseClient(config);
  const bucket = config.storageBucket || DEFAULT_STORAGE_BUCKET;
  const { data } = client.storage.from(bucket).getPublicUrl(storagePath);
  return data?.publicUrl || '';
}

async function uploadImageSourceToSupabase(config = {}, source = '', options = {}) {
  if (!source) return { ok: false, message: 'Empty image source' };
  if (!config.enabled) return { ok: false, message: 'Sync disabled' };
  const kind = imageSourceKind(source);
  if (kind === 'http-url') {
    return { ok: true, url: source, publicUrl: source, storagePath: options.storagePath || null, skipped: true };
  }
  const bucket = config.storageBucket || DEFAULT_STORAGE_BUCKET;
  const client = getSupabaseClient(config);
  const contentType = inferImageContentType(source);
  const ext = extensionFromContentType(contentType) || extensionFromPathLike(source);
  const storagePath = options.storagePath || buildStorageImagePath(config, { ...options, ext });
  const buffer = await imageSourceToBuffer(source);
  const { error } = await client.storage.from(bucket).upload(storagePath, buffer, {
    upsert: true,
    cacheControl: '31536000',
    contentType
  });
  if (error) {
    throw new Error(formatSupabaseError(error));
  }
  const publicUrl = getPublicImageUrl(config, storagePath);
  return {
    ok: true,
    bucket,
    storagePath,
    publicUrl,
    url: publicUrl || source,
    contentType
  };
}

async function ensureEntityImageOnSupabase(config = {}, entity = {}, options = {}) {
  if (!entity || typeof entity !== 'object') return entity;
  const image = String(entity.image || '').trim();
  if (!image) return entity;
  if (imageSourceKind(image) === 'http-url') return entity;
  const upload = await uploadImageSourceToSupabase(config, image, {
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

async function normalizeSnapshotImagesForCloud(config = {}, snapshot = {}) {
  const clone = JSON.parse(JSON.stringify(snapshot || {}));
  const playersMap = clone?.world?.players?.PLAYER_TEMPLATES || {};
  for (const player of Object.values(playersMap)) {
    await ensureEntityImageOnSupabase(config, player, { section: 'players' });
  }
  const systems = clone?.world?.systems?.SYSTEMS || [];
  for (const system of systems) {
    await ensureEntityImageOnSupabase(config, system, { section: 'systems' });
  }
  const planets = clone?.world?.planets?.PLANETS || {};
  for (const planet of Object.values(planets)) {
    await ensureEntityImageOnSupabase(config, planet, { section: 'planets' });
  }
  const npcs = clone?.world?.npcs?.NPCS || {};
  for (const npc of Object.values(npcs)) {
    await ensureEntityImageOnSupabase(config, npc, { section: 'npcs' });
  }
  const equipment = clone?.world?.equipment?.EQUIPMENT || {};
  for (const item of Object.values(equipment)) {
    await ensureEntityImageOnSupabase(config, item, { section: 'equipment' });
  }
  const flora = clone?.world?.flora?.FLORA || {};
  for (const entry of Object.values(flora)) {
    await ensureEntityImageOnSupabase(config, entry, { section: 'flora' });
  }
  const fauna = clone?.world?.fauna?.FAUNA || {};
  for (const entry of Object.values(fauna)) {
    await ensureEntityImageOnSupabase(config, entry, { section: 'fauna' });
  }
  const articles = clone?.world?.articles?.ARTICLES || {};
  for (const entry of Object.values(articles)) {
    await ensureEntityImageOnSupabase(config, entry, { section: 'articles' });
  }
  const news = clone?.world?.news?.NEWS || {};
  for (const entry of Object.values(news)) {
    await ensureEntityImageOnSupabase(config, entry, { section: 'news' });
  }
  const tasks = clone?.world?.tasks?.TASKS || {};
  for (const entry of Object.values(tasks)) {
    await ensureEntityImageOnSupabase(config, entry, { section: 'tasks' });
  }
  const stateUsers = clone?.state?.users || {};
  for (const player of Object.values(stateUsers)) {
    await ensureEntityImageOnSupabase(config, player, { section: 'players' });
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
        const upload = await uploadImageSourceToSupabase(config, scene.backgroundImage, { section: 'combat-scenes', entityId: scene.id || 'scene', preferredStem: `scene_bg_${scene.id || 'scene'}` });
        scene.backgroundImage = upload.publicUrl || upload.url || scene.backgroundImage;
      } catch {}
    }
    for (const asset of Array.isArray(scene.assets) ? scene.assets : []) {
      await ensureEntityImageOnSupabase(config, asset, { section: 'combat-assets', entityId: asset.id || scene.id, preferredStem: asset.name || asset.id || 'asset' });
    }
    for (const token of Array.isArray(scene.tokens) ? scene.tokens : []) {
      await ensureEntityImageOnSupabase(config, token, { section: 'combat-tokens', entityId: token.id || scene.id, preferredStem: token.name || token.id || 'token' });
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
        const upload = await uploadImageSourceToSupabase(config, scene.backgroundImage, { section: 'combat-scenes', entityId: scene.id || 'scene', preferredStem: `scene_bg_${scene.id || 'scene'}` });
        scene.backgroundImage = upload.publicUrl || upload.url || scene.backgroundImage;
      } catch {}
    }
    for (const asset of Array.isArray(scene.assets) ? scene.assets : []) {
      await ensureEntityImageOnSupabase(config, asset, { section: 'combat-assets', entityId: asset.id || scene.id, preferredStem: asset.name || asset.id || 'asset' });
    }
    for (const token of Array.isArray(scene.tokens) ? scene.tokens : []) {
      await ensureEntityImageOnSupabase(config, token, { section: 'combat-tokens', entityId: token.id || scene.id, preferredStem: token.name || token.id || 'token' });
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
      const upload = await uploadImageSourceToSupabase(config, localUrl, {
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

function validateSyncConfig(config = {}) {
  const issues = [];
  if (!config.url) issues.push('SUPABASE_URL пустой');
  if (!config.anonKey) issues.push('SUPABASE_KEY пустой');
  if (!config.campaignId) issues.push('CAMPAIGN_ID пустой');
  return issues;
}

function getSupabaseClient(config = {}) {
  const issues = validateSyncConfig(config);
  if (issues.length) {
    throw new Error(issues.join('; '));
  }
  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (error) {
    throw new Error(`Не установлен @supabase/supabase-js: ${error.message}`);
  }
  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    realtime: {
      params: { eventsPerSecond: 2 }
    },
    global: {
      headers: {
        'x-application-name': 'galactic-rpg-interface'
      }
    }
  });
}

function formatSupabaseError(error) {
  if (!error) return 'unknown supabase error';
  return [error.message, error.details, error.hint].filter(Boolean).join(' // ') || JSON.stringify(error);
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
let combatRuntimeRealtime = null;
let chatRealtime = null;
let mainWindow = null;
let playerDisplayWindow = null;
let playerDisplayMirrorState = { activeSceneId: '', cameraByScene: {}, updatedAt: null };
let updaterConfigured = false;
let updaterLatestStatus = { status: 'idle', packaged: false, available: Boolean(autoUpdater), message: '' };

function broadcastCombatRuntimeEvent(payload = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win?.isDestroyed()) win.webContents.send('combat:runtime:event', payload);
    } catch {}
  }
}

async function teardownCombatRuntimeRealtime() {
  if (!combatRuntimeRealtime) return;
  try {
    await combatRuntimeRealtime.client.removeChannel(combatRuntimeRealtime.channel);
  } catch {}
  combatRuntimeRealtime = null;
}

async function setupCombatRuntimeRealtime(config = {}) {
  await teardownCombatRuntimeRealtime();
  if (!config?.enabled || !config?.campaignId) return;
  const client = getSupabaseClient(config);
  const tableName = config.combatRuntimeTableName || DEFAULT_COMBAT_RUNTIME_TABLE;
  const channel = client
    .channel(`combat-runtime-${config.campaignId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: tableName,
      filter: `campaign_id=eq.${config.campaignId}`
    }, payload => {
      const row = normalizeCombatRuntimeRow(payload.new || payload.old || {});
      broadcastCombatRuntimeEvent({ eventType: payload.eventType, row });
    })
    .subscribe(status => {
      debugLog('COMBAT_RUNTIME_REALTIME_STATUS', { status, campaignId: config.campaignId, tableName });
    });
  combatRuntimeRealtime = { client, channel, campaignId: config.campaignId, tableName };
}


async function teardownChatRealtime() {
  if (!chatRealtime) return;
  try {
    await chatRealtime.client.removeChannel(chatRealtime.channel);
  } catch {}
  chatRealtime = null;
}

function broadcastChatRealtimeEvent(payload = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win?.isDestroyed()) win.webContents.send('chat:remote:event', payload);
    } catch {}
  }
}

async function setupChatRealtime(config = {}) {
  await teardownChatRealtime();
  if (!config?.enabled || !config?.campaignId) return;
  const client = getSupabaseClient(config);
  const tableName = config.chatTableName || DEFAULT_CHAT_TABLE;
  const channel = client
    .channel(`chat-${config.campaignId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: tableName,
      filter: `campaign_id=eq.${config.campaignId}`
    }, payload => {
      const row = payload.new || payload.old || null;
      if (!row) return;
      broadcastChatRealtimeEvent({ eventType: payload.eventType, row });
    })
    .subscribe(status => {
      debugLog('CHAT_REALTIME_STATUS', { status, campaignId: config.campaignId, tableName });
    });
  chatRealtime = { client, channel, campaignId: config.campaignId, tableName };
}

async function setupNetworkRealtime(config = {}) {
  await Promise.allSettled([setupCombatRuntimeRealtime(config), setupChatRealtime(config)]);
}

async function teardownNetworkRealtime() {
  await Promise.allSettled([teardownCombatRuntimeRealtime(), teardownChatRealtime()]);
}

function selectPlayerColumns(config = {}) {
  return 'campaign_id, player_id, version, updated_at, updated_by, client_updated_at, profile_json, inventory_json, private_state_json';
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

function normalizePlayerRemoteRow(row = {}) {
  if (!row) return null;
  const player = combineSegmentedPlayerState(row);
  const deletedAt = row.deleted_at || row.deletedAt || (player.__deleted ? row.updated_at || row.updatedAt || null : null);
  return {
    campaignId: row.campaign_id,
    playerId: row.player_id,
    version: Number(row.version || 0),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    clientUpdatedAt: row.client_updated_at || null,
    deletedAt,
    player,
    profile_json: sanitizePlayerObject(row.profile_json || {}),
    inventory_json: sanitizeInventoryArray(row.inventory_json || []),
    private_state_json: sanitizePlayerObject(row.private_state_json || {})
  };
}

async function fetchRemotePlayerRows(config = {}, options = {}) {
  const client = getSupabaseClient(config);
  let query = client
    .from(config.playerTableName || DEFAULT_PLAYER_TABLE)
    .select(selectPlayerColumns(config))
    .eq('campaign_id', config.campaignId)
    .order('updated_at', { ascending: true })
    .order('player_id', { ascending: true });

  if (options.since) query = query.gt('updated_at', options.since);
  if (options.playerId) query = query.eq('player_id', String(options.playerId));
  if (options.limit) query = query.limit(Math.max(1, Math.min(5000, Number(options.limit || 500))));

  const { data, error } = await query;
  if (error) throw new Error(formatSupabaseError(error));
  return Array.isArray(data) ? data.map(normalizePlayerRemoteRow).filter(Boolean) : [];
}

async function fetchRemotePlayerRow(config = {}, playerId = '') {
  const rows = await fetchRemotePlayerRows(config, { playerId, limit: 1 });
  return rows[0] || null;
}

async function insertPlayerSegments(client, config, row, actor, updatedAt) {
  const insertRow = {
    campaign_id: config.campaignId,
    player_id: row.player_id,
    version: 1,
    updated_at: updatedAt,
    updated_by: actor,
    client_updated_at: row.clientUpdatedAt || updatedAt,
    ...splitPlayerState(row.player, { privateState: row.private_state_json, deleted: Boolean(row.deletedAt) })
  };
  const { data, error } = await client
    .from(config.playerTableName || DEFAULT_PLAYER_TABLE)
    .insert(insertRow)
    .select(selectPlayerColumns(config))
    .maybeSingle();
  if (error) throw error;
  return normalizePlayerRemoteRow(data || insertRow);
}

async function updatePlayerSegments(client, config, row, remote, actor, updatedAt, patchOnly = false) {
  const rowPlayer = sanitizePlayerObject(row.player || {});
  const hasInventoryPatch = Object.prototype.hasOwnProperty.call(rowPlayer, 'inventory');
  const nextPlayer = patchOnly
    ? combineSegmentedPlayerState({
        profile_json: { ...(remote?.profile_json || {}), ...(row.profile_json || {}) },
        inventory_json: hasInventoryPatch ? row.inventory_json : (remote?.inventory_json || []),
        private_state_json: { ...(remote?.private_state_json || {}), ...(row.private_state_json || {}) }
      })
    : combineSegmentedPlayerState({
        profile_json: row.profile_json,
        inventory_json: row.inventory_json,
        private_state_json: row.private_state_json
      });
  const segments = splitPlayerState(nextPlayer, { privateState: nextPlayer.__deleted ? { ...(remote?.private_state_json || {}), ...(row.private_state_json || {}), __deleted: true } : { ...(remote?.private_state_json || {}), ...(row.private_state_json || {}) } });
  const payload = {
    version: Number.isFinite(Number(row.baseVersion)) ? Number(row.baseVersion) + 1 : Number(remote?.version || 0) + 1,
    updated_at: updatedAt,
    updated_by: actor,
    client_updated_at: row.clientUpdatedAt || updatedAt,
    ...segments
  };
  const { data, error } = await client
    .from(config.playerTableName || DEFAULT_PLAYER_TABLE)
    .update(payload)
    .eq('campaign_id', config.campaignId)
    .eq('player_id', row.player_id)
    .eq('version', Number.isFinite(Number(row.baseVersion)) ? Number(row.baseVersion) : Number(remote?.version || 0))
    .select(selectPlayerColumns(config))
    .maybeSingle();
  if (error) throw new Error(formatSupabaseError(error));
  if (!data) return null;
  return normalizePlayerRemoteRow(data);
}

async function pushRemotePlayerRow(config = {}, payload = {}) {
  const client = getSupabaseClient(config);
  const row = normalizePlayerRowPayload(payload);
  const updatedAt = new Date().toISOString();
  const actor = String(row.updatedBy || config.deviceLabel || 'unknown-device').trim() || 'unknown-device';
  const expectedVersion = Number.isFinite(Number(row.baseVersion)) ? Number(row.baseVersion) : 0;
  const remote = await fetchRemotePlayerRow(config, row.player_id);

  if (!remote) {
    if (expectedVersion !== 0) {
      return { ok: false, status: 'conflict', message: 'Игрок уже изменён другим клиентом', remote: null };
    }
    try {
      const inserted = await insertPlayerSegments(client, config, row, actor, updatedAt);
      return { ok: true, status: 'inserted', row: inserted };
    } catch (error) {
      if (String(error.code || '') === '23505') {
        const latest = await fetchRemotePlayerRow(config, row.player_id);
        return { ok: false, status: 'conflict', message: 'Игрок уже был создан на другом клиенте', remote: latest || null };
      }
      throw new Error(formatSupabaseError(error));
    }
  }

  if (Number(remote.version || 0) !== expectedVersion) {
    return { ok: false, status: 'conflict', message: 'У игрока уже есть более новая версия в облаке', remote };
  }

  const updated = await updatePlayerSegments(client, config, row, remote, actor, updatedAt, false);
  if (!updated) {
    const latest = await fetchRemotePlayerRow(config, row.player_id);
    return { ok: false, status: 'conflict', message: 'Игрок был изменён до завершения сохранения', remote: latest || remote || null };
  }
  return { ok: true, status: 'updated', row: updated };
}

async function patchRemotePlayerRow(config = {}, payload = {}) {
  const client = getSupabaseClient(config);
  const row = normalizePlayerRowPayload(payload);
  const updatedAt = new Date().toISOString();
  const actor = String(row.updatedBy || config.deviceLabel || 'unknown-device').trim() || 'unknown-device';
  const expectedVersion = Number.isFinite(Number(row.baseVersion)) ? Number(row.baseVersion) : 0;
  const remote = await fetchRemotePlayerRow(config, row.player_id);

  if (!remote) {
    if (expectedVersion !== 0) {
      return { ok: false, status: 'conflict', message: 'Игрок уже изменён другим клиентом', remote: null };
    }
    try {
      const inserted = await insertPlayerSegments(client, config, row, actor, updatedAt);
      return { ok: true, status: 'inserted', row: inserted };
    } catch (error) {
      if (String(error.code || '') === '23505') {
        const latest = await fetchRemotePlayerRow(config, row.player_id);
        return { ok: false, status: 'conflict', message: 'Игрок уже был создан на другом клиенте', remote: latest || null };
      }
      throw new Error(formatSupabaseError(error));
    }
  }

  if (Number(remote.version || 0) !== expectedVersion) {
    return { ok: false, status: 'conflict', message: 'У игрока уже есть более новая версия в облаке', remote };
  }

  const updated = await updatePlayerSegments(client, config, row, remote, actor, updatedAt, true);
  if (!updated) {
    const latest = await fetchRemotePlayerRow(config, row.player_id);
    return { ok: false, status: 'conflict', message: 'Игрок был изменён до завершения сохранения', remote: latest || remote || null };
  }
  return { ok: true, status: 'updated', row: updated };
}

async function deleteRemotePlayerRow(config = {}, payload = {}) {
  const client = getSupabaseClient(config);
  const row = normalizePlayerRowPayload(payload);
  const updatedAt = new Date().toISOString();
  const actor = String(row.updatedBy || config.deviceLabel || 'unknown-device').trim() || 'unknown-device';
  const remote = await fetchRemotePlayerRow(config, row.player_id);
  if (!remote) {
    try {
      const inserted = await insertPlayerSegments(client, config, {
        ...row,
        player: { id: row.player_id, inventory: [] },
        private_state_json: { __deleted: true },
        deletedAt: updatedAt
      }, actor, updatedAt);
      return { ok: true, status: 'deleted', row: inserted };
    } catch (error) {
      throw new Error(formatSupabaseError(error));
    }
  }
  const expectedVersion = Number.isFinite(Number(row.baseVersion)) ? Number(row.baseVersion) : Number(remote.version || 0);
  if (Number(remote.version || 0) !== expectedVersion) {
    return { ok: false, status: 'conflict', message: 'Игрок уже изменён другим клиентом', remote };
  }
  const updated = await updatePlayerSegments(client, config, {
    ...row,
    baseVersion: expectedVersion,
    player: { ...(remote.player || {}), __deleted: true },
    private_state_json: { ...(remote.private_state_json || {}), __deleted: true },
    deletedAt: updatedAt
  }, remote, actor, updatedAt, false);
  if (!updated) {
    const latest = await fetchRemotePlayerRow(config, row.player_id);
    return { ok: false, status: 'conflict', message: 'Игрок был изменён до завершения удаления', remote: latest || remote || null };
  }
  return { ok: true, status: 'deleted', row: updated };
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

function selectChatColumns(config = {}) {
  return 'campaign_id, message_id, kind, thread_key, sender_type, sender_id, recipient_player_id, npc_id, direct_a, direct_b, author_label, body_html, created_at, edited_at, deleted_at, updated_at, client_updated_at';
}

async function fetchRemoteChatRows(config = {}, options = {}) {
  const client = getSupabaseClient(config);
  let query = client
    .from(config.chatTableName || DEFAULT_CHAT_TABLE)
    .select(selectChatColumns(config))
    .eq('campaign_id', config.campaignId)
    .order('updated_at', { ascending: true })
    .order('message_id', { ascending: true });

  const since = String(options.since || '').trim();
  if (since) query = query.gte('updated_at', since);
  if (options.threadKey) query = query.eq('thread_key', options.threadKey);
  if (options.limit) query = query.limit(Math.max(1, Math.min(10000, Number(options.limit || 500))));

  const { data, error } = await query;
  if (error) throw new Error(formatSupabaseError(error));
  return Array.isArray(data) ? data : [];
}

async function upsertRemoteChatRow(config = {}, payload = {}) {
  const client = getSupabaseClient(config);
  const row = normalizeChatRowInput(payload);
  const now = new Date().toISOString();
  const writeRow = {
    campaign_id: config.campaignId,
    ...row,
    updated_at: now,
    client_updated_at: row.client_updated_at || row.updated_at || now
  };
  const { data, error } = await client
    .from(config.chatTableName || DEFAULT_CHAT_TABLE)
    .upsert(writeRow, { onConflict: 'campaign_id,message_id' })
    .select(selectChatColumns(config))
    .maybeSingle();
  if (error) throw new Error(formatSupabaseError(error));
  return data || writeRow;
}

async function upsertRemoteChatRows(config = {}, rows = []) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const client = getSupabaseClient(config);
  const payload = rows.map(row => {
    const normalized = normalizeChatRowInput(row);
    const observedNow = new Date().toISOString();
    return {
      campaign_id: config.campaignId,
      ...normalized,
      updated_at: observedNow,
      client_updated_at: normalized.client_updated_at || normalized.updated_at || observedNow
    };
  });
  const { data, error } = await client
    .from(config.chatTableName || DEFAULT_CHAT_TABLE)
    .upsert(payload, { onConflict: 'campaign_id,message_id' })
    .select(selectChatColumns(config));
  if (error) throw new Error(formatSupabaseError(error));
  return Array.isArray(data) ? data : payload;
}

async function fetchRemoteSnapshot(config = {}, options = {}) {
  const client = getSupabaseClient(config);
  const columns = options.includePayload !== false
    ? 'campaign_id, revision, updated_at, updated_by, client_updated_at, world_json, state_json'
    : 'campaign_id, revision, updated_at, updated_by, client_updated_at';

  const query = client
    .from(config.tableName || DEFAULT_SYNC_TABLE)
    .select(columns)
    .eq('campaign_id', config.campaignId)
    .maybeSingle();

  const { data, error } = await query;
  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return data ? {
    ok: true,
    exists: true,
    remote: {
      campaignId: data.campaign_id,
      revision: Number(data.revision || 0),
      updatedAt: data.updated_at || null,
      updatedBy: data.updated_by || null,
      clientUpdatedAt: data.client_updated_at || null,
      world: data.world_json || null,
      state: data.state_json || null
    }
  } : {
    ok: true,
    exists: false,
    remote: null
  };
}

async function pushRemoteSnapshot(config = {}, payload = {}) {
  const client = getSupabaseClient(config);
  const updatedAt = new Date().toISOString();
  const actor = String(payload.updatedBy || config.deviceLabel || 'unknown-device').trim() || 'unknown-device';
  const expectedRevision = Number.isFinite(Number(payload.baseRevision)) ? Number(payload.baseRevision) : 0;

  const remoteInfo = await fetchRemoteSnapshot(config, { includePayload: false });
  if (!remoteInfo.ok) return remoteInfo;

  if (!remoteInfo.exists) {
    const insertRow = {
      campaign_id: config.campaignId,
      revision: 1,
      updated_at: updatedAt,
      updated_by: actor,
      client_updated_at: payload.clientUpdatedAt || updatedAt,
      world_json: payload.world || {},
      state_json: payload.state || {}
    };
    const { data, error } = await client
      .from(config.tableName || DEFAULT_SYNC_TABLE)
      .insert(insertRow)
      .select('campaign_id, revision, updated_at, updated_by, client_updated_at')
      .maybeSingle();

    if (error) {
      if (String(error.code || '') === '23505') {
        const latest = await fetchRemoteSnapshot(config, { includePayload: false });
        return {
          ok: false,
          status: 'conflict',
          message: 'В Supabase уже появилась более новая запись кампании',
          remote: latest.remote || null
        };
      }
      throw new Error(formatSupabaseError(error));
    }

    return {
      ok: true,
      status: 'inserted',
      remote: {
        campaignId: data.campaign_id,
        revision: Number(data.revision || 1),
        updatedAt: data.updated_at || updatedAt,
        updatedBy: data.updated_by || actor,
        clientUpdatedAt: data.client_updated_at || payload.clientUpdatedAt || updatedAt
      }
    };
  }

  if (Number(remoteInfo.remote?.revision || 0) !== expectedRevision) {
    return {
      ok: false,
      status: 'conflict',
      message: 'В облаке есть более новая ревизия данных',
      remote: remoteInfo.remote
    };
  }

  const nextRevision = expectedRevision + 1;
  const { data, error } = await client
    .from(config.tableName || DEFAULT_SYNC_TABLE)
    .update({
      revision: nextRevision,
      updated_at: updatedAt,
      updated_by: actor,
      client_updated_at: payload.clientUpdatedAt || updatedAt,
      world_json: payload.world || {},
      state_json: payload.state || {}
    })
    .eq('campaign_id', config.campaignId)
    .eq('revision', expectedRevision)
    .select('campaign_id, revision, updated_at, updated_by, client_updated_at')
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (!data) {
    const latest = await fetchRemoteSnapshot(config, { includePayload: false });
    return {
      ok: false,
      status: 'conflict',
      message: 'Запись была изменена другим клиентом до завершения вашего сохранения',
      remote: latest.remote || remoteInfo.remote || null
    };
  }

  return {
    ok: true,
    status: 'updated',
    remote: {
      campaignId: data.campaign_id,
      revision: Number(data.revision || nextRevision),
      updatedAt: data.updated_at || updatedAt,
      updatedBy: data.updated_by || actor,
      clientUpdatedAt: data.client_updated_at || payload.clientUpdatedAt || updatedAt
    }
  };
}

function selectCombatRuntimeColumns(config = {}) {
  return 'campaign_id, revision, updated_at, updated_by, client_updated_at, active_scene_id, scene_json, runtime_json';
}

function normalizeCombatRuntimeRow(row = {}) {
  if (!row) return null;
  return {
    campaignId: row.campaign_id,
    revision: Number(row.revision || 0),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    clientUpdatedAt: row.client_updated_at || null,
    activeSceneId: String(row.active_scene_id || '').trim(),
    scene: row.scene_json || {},
    runtime: row.runtime_json || {}
  };
}

async function fetchRemoteCombatRuntime(config = {}) {
  const client = getSupabaseClient(config);
  const { data, error } = await client
    .from(config.combatRuntimeTableName || DEFAULT_COMBAT_RUNTIME_TABLE)
    .select(selectCombatRuntimeColumns(config))
    .eq('campaign_id', config.campaignId)
    .maybeSingle();
  if (error) throw new Error(formatSupabaseError(error));
  return data ? normalizeCombatRuntimeRow(data) : null;
}

async function pushRemoteCombatRuntime(config = {}, payload = {}) {
  const client = getSupabaseClient(config);
  const normalized = await normalizeCombatPublishPayloadImages(config, payload);
  const now = new Date().toISOString();
  const expectedRevision = Number.isFinite(Number(normalized.baseRevision)) ? Number(normalized.baseRevision) : 0;
  const actor = String(normalized.updatedBy || config.deviceLabel || 'unknown-device').trim() || 'unknown-device';
  const current = await fetchRemoteCombatRuntime(config);
  if (!current) {
    if (expectedRevision !== 0) return { ok: false, status: 'conflict', message: 'Combat runtime already changed remotely', remote: null };
    const insertRow = {
      campaign_id: config.campaignId,
      revision: 1,
      updated_at: now,
      updated_by: actor,
      client_updated_at: normalized.clientUpdatedAt || now,
      active_scene_id: String(normalized.active_scene_id || normalized.activeSceneId || normalized.scene_json?.id || '').trim(),
      scene_json: normalized.scene_json || normalized.scene || {},
      runtime_json: normalized.runtime_json || normalized.runtime || {}
    };
    const { data, error } = await client
      .from(config.combatRuntimeTableName || DEFAULT_COMBAT_RUNTIME_TABLE)
      .insert(insertRow)
      .select(selectCombatRuntimeColumns(config))
      .maybeSingle();
    if (error) throw new Error(formatSupabaseError(error));
    return { ok: true, status: 'inserted', row: normalizeCombatRuntimeRow(data || insertRow) };
  }
  if (current.revision !== expectedRevision) {
    return { ok: false, status: 'conflict', message: 'Combat runtime has newer remote version', remote: current };
  }
  const updateRow = {
    revision: expectedRevision + 1,
    updated_at: now,
    updated_by: actor,
    client_updated_at: normalized.clientUpdatedAt || now,
    active_scene_id: String(normalized.active_scene_id || normalized.activeSceneId || normalized.scene_json?.id || '').trim(),
    scene_json: normalized.scene_json || normalized.scene || {},
    runtime_json: normalized.runtime_json || normalized.runtime || {}
  };
  const { data, error } = await client
    .from(config.combatRuntimeTableName || DEFAULT_COMBAT_RUNTIME_TABLE)
    .update(updateRow)
    .eq('campaign_id', config.campaignId)
    .eq('revision', expectedRevision)
    .select(selectCombatRuntimeColumns(config))
    .maybeSingle();
  if (error) throw new Error(formatSupabaseError(error));
  if (!data) {
    const latest = await fetchRemoteCombatRuntime(config);
    return { ok: false, status: 'conflict', message: 'Combat runtime changed before save finished', remote: latest || current || null };
  }
  return { ok: true, status: 'updated', row: normalizeCombatRuntimeRow(data) };
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
          bucket: config.storageBucket || DEFAULT_STORAGE_BUCKET
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
      return { ok: true, enabled: true, connected: true, status: 'empty', message: 'В Supabase ещё нет снапшота кампании', remote: null, config };
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
      bucket: config.storageBucket || DEFAULT_STORAGE_BUCKET
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
    playerDisplayMirrorState = {
      activeSceneId: String(next.activeSceneId || playerDisplayMirrorState.activeSceneId || '').trim(),
      cameraByScene: next.cameraByScene && typeof next.cameraByScene === 'object' ? next.cameraByScene : (playerDisplayMirrorState.cameraByScene || {}),
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
