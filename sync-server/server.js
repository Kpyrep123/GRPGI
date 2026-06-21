'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || process.env.SYNC_PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const SYNC_TOKEN = String(process.env.SYNC_TOKEN || '').trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 250 * 1024 * 1024);

const sseClients = new Map();

function nowIso() {
  return new Date().toISOString();
}

function safeName(value, fallback = 'default') {
  const raw = String(value || '').trim();
  const clean = raw.replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  return clean || fallback;
}

function campaignDir(campaignId) {
  return path.join(DATA_DIR, 'campaigns', safeName(campaignId));
}

function campaignFile(campaignId, filename) {
  return path.join(campaignDir(campaignId), filename);
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(file, data) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.promises.rename(tmp, file);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload || {});
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-sync-token'
  });
  res.end(body);
}

function sendError(res, status, message, extra = {}) {
  sendJson(res, status, { ok: false, status: 'error', message, ...extra });
}

function getRequestToken(req) {
  const auth = String(req.headers.authorization || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-sync-token'] || '').trim();
}

function isAuthorized(req, url) {
  if (!SYNC_TOKEN) return true;
  if (req.method === 'OPTIONS') return true;
  if (url.pathname.startsWith('/assets/')) return true;
  return getRequestToken(req) === SYNC_TOKEN;
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error(`Request body too large: ${total} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const buffer = await readBody(req);
  if (!buffer.length) return {};
  return JSON.parse(buffer.toString('utf8'));
}

function normalizeSnapshotRow(row) {
  if (!row) return null;
  return {
    campaignId: row.campaign_id,
    revision: Number(row.revision || 0),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    clientUpdatedAt: row.client_updated_at || null,
    world: row.world_json || null,
    state: row.state_json || null
  };
}

function normalizePlayerRow(row) {
  if (!row) return null;
  const profile = row.profile_json && typeof row.profile_json === 'object' ? row.profile_json : {};
  const privateState = row.private_state_json && typeof row.private_state_json === 'object' ? row.private_state_json : {};
  const inventory = Array.isArray(row.inventory_json) ? row.inventory_json : [];
  return {
    campaignId: row.campaign_id,
    playerId: row.player_id,
    version: Number(row.version || 0),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    clientUpdatedAt: row.client_updated_at || null,
    deletedAt: row.deleted_at || (privateState.__deleted ? row.updated_at || null : null),
    player: { ...profile, ...privateState, inventory },
    profile_json: profile,
    inventory_json: inventory,
    private_state_json: privateState
  };
}

function splitPlayerState(player = {}, privateStatePatch = {}, deleted = false) {
  const source = player && typeof player === 'object' && !Array.isArray(player) ? { ...player } : {};
  const inventory = Array.isArray(source.inventory) ? source.inventory : [];
  delete source.inventory;
  delete source.profile_json;
  delete source.inventory_json;
  delete source.private_state_json;
  const privateState = privateStatePatch && typeof privateStatePatch === 'object' && !Array.isArray(privateStatePatch) ? { ...privateStatePatch } : {};
  if (deleted) privateState.__deleted = true;
  return { profile_json: source, inventory_json: inventory, private_state_json: privateState };
}

function normalizeChatInput(payload = {}) {
  const messageId = String(payload.message_id || payload.messageId || payload.id || crypto.randomUUID()).trim();
  const kind = String(payload.kind || 'npc').trim() || 'npc';
  const createdAt = payload.created_at || payload.createdAt || nowIso();
  const updatedAt = payload.updated_at || payload.updatedAt || createdAt;
  const row = {
    message_id: messageId,
    kind,
    thread_key: String(payload.thread_key || payload.threadKey || '').trim(),
    sender_type: String(payload.sender_type || payload.senderType || '').trim(),
    sender_id: String(payload.sender_id || payload.senderId || '').trim(),
    recipient_player_id: String(payload.recipient_player_id || payload.recipientPlayerId || '').trim(),
    npc_id: String(payload.npc_id || payload.npcId || '').trim(),
    direct_a: String(payload.direct_a || payload.directA || '').trim(),
    direct_b: String(payload.direct_b || payload.directB || '').trim(),
    author_label: String(payload.author_label || payload.authorLabel || '').trim(),
    body_html: String(payload.body_html || payload.bodyHtml || payload.html || payload.text || '').trim(),
    created_at: createdAt,
    edited_at: payload.edited_at || payload.editedAt || null,
    deleted_at: payload.deleted_at || payload.deletedAt || null,
    updated_at: updatedAt,
    client_updated_at: payload.client_updated_at || payload.clientUpdatedAt || updatedAt
  };
  if (!row.thread_key) {
    row.thread_key = kind === 'npc'
      ? `${row.npc_id || ''}__${row.recipient_player_id || ''}`
      : [row.direct_a || '', row.direct_b || ''].sort().join('__');
  }
  return row;
}

function normalizeCombatRow(row = {}) {
  if (!row) return null;
  return {
    campaignId: row.campaign_id,
    revision: Number(row.revision || 0),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    clientUpdatedAt: row.client_updated_at || null,
    activeSceneId: String(row.active_scene_id || '').trim(),
    scene: row.scene_json || {},
    runtime: row.runtime_json || {},
    campaign_id: row.campaign_id,
    active_scene_id: row.active_scene_id || '',
    scene_json: row.scene_json || {},
    runtime_json: row.runtime_json || {}
  };
}

function getSseSet(campaignId) {
  const key = safeName(campaignId);
  if (!sseClients.has(key)) sseClients.set(key, new Set());
  return sseClients.get(key);
}

function broadcast(campaignId, payload = {}) {
  const set = getSseSet(campaignId);
  const data = `event: sync\ndata: ${JSON.stringify({ ...payload, campaignId })}\n\n`;
  for (const res of Array.from(set)) {
    try { res.write(data); } catch { set.delete(res); }
  }
}

function publicUrlForAsset(req, assetPath) {
  const clean = String(assetPath || '').replace(/^\/+/, '');
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}/assets/${clean}`;
  const host = req.headers.host || `localhost:${PORT}`;
  return `http://${host}/assets/${clean}`;
}

async function handleSnapshot(req, res, url, campaignId) {
  const file = campaignFile(campaignId, 'snapshot.json');
  if (req.method === 'GET') {
    const row = await readJson(file, null);
    if (!row) return sendJson(res, 200, { ok: true, exists: false, remote: null });
    const includePayload = url.searchParams.get('includePayload') !== '0' && url.searchParams.get('includePayload') !== 'false';
    const remote = normalizeSnapshotRow(row);
    if (!includePayload) {
      delete remote.world;
      delete remote.state;
    }
    return sendJson(res, 200, { ok: true, exists: true, remote });
  }
  if (req.method !== 'POST' && req.method !== 'PUT') return sendError(res, 405, 'Method not allowed');
  const payload = await readJsonBody(req);
  const existing = await readJson(file, null);
  const expected = Number.isFinite(Number(payload.baseRevision)) ? Number(payload.baseRevision) : 0;
  const actor = String(payload.updatedBy || payload.updated_by || 'unknown-device').trim() || 'unknown-device';
  const updatedAt = nowIso();
  if (!existing) {
    if (expected !== 0) return sendJson(res, 409, { ok: false, status: 'conflict', message: 'Remote snapshot is empty, but baseRevision is not 0', remote: null });
    const row = {
      campaign_id: campaignId,
      revision: 1,
      updated_at: updatedAt,
      updated_by: actor,
      client_updated_at: payload.clientUpdatedAt || payload.client_updated_at || updatedAt,
      world_json: payload.world || {},
      state_json: payload.state || {}
    };
    await writeJsonAtomic(file, row);
    const remote = normalizeSnapshotRow(row);
    delete remote.world;
    delete remote.state;
    broadcast(campaignId, { channel: 'snapshot', eventType: 'INSERT', remote });
    return sendJson(res, 200, { ok: true, status: 'inserted', remote });
  }
  const currentRevision = Number(existing.revision || 0);
  if (currentRevision !== expected) {
    const remote = normalizeSnapshotRow(existing);
    delete remote.world;
    delete remote.state;
    return sendJson(res, 409, { ok: false, status: 'conflict', message: 'Remote snapshot has newer revision', remote });
  }
  const row = {
    ...existing,
    revision: currentRevision + 1,
    updated_at: updatedAt,
    updated_by: actor,
    client_updated_at: payload.clientUpdatedAt || payload.client_updated_at || updatedAt,
    world_json: payload.world || {},
    state_json: payload.state || {}
  };
  await writeJsonAtomic(file, row);
  const remote = normalizeSnapshotRow(row);
  delete remote.world;
  delete remote.state;
  broadcast(campaignId, { channel: 'snapshot', eventType: 'UPDATE', remote });
  return sendJson(res, 200, { ok: true, status: 'updated', remote });
}

async function handlePlayers(req, res, url, campaignId, playerId = '') {
  const file = campaignFile(campaignId, 'players.json');
  const rows = await readJson(file, {});
  if (req.method === 'GET') {
    const since = String(url.searchParams.get('since') || '').trim();
    const wantedPlayer = String(url.searchParams.get('playerId') || playerId || '').trim();
    let list = Object.values(rows);
    if (wantedPlayer) list = list.filter(row => row.player_id === wantedPlayer);
    if (since) list = list.filter(row => new Date(row.updated_at || 0).getTime() > new Date(since).getTime());
    list.sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')) || String(a.player_id || '').localeCompare(String(b.player_id || '')));
    const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get('limit') || 500)));
    return sendJson(res, 200, { ok: true, status: 'ok', rows: list.slice(0, limit).map(normalizePlayerRow).filter(Boolean) });
  }
  const payload = await readJsonBody(req);
  const id = safeName(playerId || payload.playerId || payload.player_id || payload.id, '');
  if (!id) return sendError(res, 400, 'player_id is required');
  const existing = rows[id] || null;
  const expected = Number.isFinite(Number(payload.baseVersion)) ? Number(payload.baseVersion) : (Number.isFinite(Number(payload.version)) ? Number(payload.version) : 0);
  const actor = String(payload.updatedBy || payload.updated_by || 'unknown-device').trim() || 'unknown-device';
  const updatedAt = nowIso();
  if (req.method === 'DELETE') {
    if (existing && Number(existing.version || 0) !== expected) return sendJson(res, 409, { ok: false, status: 'conflict', message: 'Player has newer remote version', remote: normalizePlayerRow(existing) });
    const segments = splitPlayerState(existing?.profile_json || {}, existing?.private_state_json || {}, true);
    const row = {
      campaign_id: campaignId,
      player_id: id,
      version: existing ? Number(existing.version || 0) + 1 : 1,
      updated_at: updatedAt,
      updated_by: actor,
      client_updated_at: payload.clientUpdatedAt || payload.client_updated_at || updatedAt,
      deleted_at: updatedAt,
      ...segments
    };
    rows[id] = row;
    await writeJsonAtomic(file, rows);
    const normalized = normalizePlayerRow(row);
    broadcast(campaignId, { channel: 'players', eventType: 'DELETE', row: normalized });
    return sendJson(res, 200, { ok: true, status: 'deleted', row: normalized });
  }
  if (!existing && expected !== 0) return sendJson(res, 409, { ok: false, status: 'conflict', message: 'Player does not exist remotely', remote: null });
  if (existing && Number(existing.version || 0) !== expected) return sendJson(res, 409, { ok: false, status: 'conflict', message: 'Player has newer remote version', remote: normalizePlayerRow(existing) });
  const patchMode = req.method === 'PATCH';
  const currentPlayer = existing ? normalizePlayerRow(existing).player : {};
  const sourcePlayer = payload.player || payload.player_json || payload.data || payload.entity || {};
  const nextPlayer = patchMode ? { ...currentPlayer, ...sourcePlayer } : { ...sourcePlayer };
  const segments = splitPlayerState(nextPlayer, payload.private_state_json || payload.privateState || {}, false);
  const row = {
    campaign_id: campaignId,
    player_id: id,
    version: existing ? Number(existing.version || 0) + 1 : 1,
    updated_at: updatedAt,
    updated_by: actor,
    client_updated_at: payload.clientUpdatedAt || payload.client_updated_at || updatedAt,
    deleted_at: null,
    ...segments
  };
  rows[id] = row;
  await writeJsonAtomic(file, rows);
  const normalized = normalizePlayerRow(row);
  broadcast(campaignId, { channel: 'players', eventType: existing ? 'UPDATE' : 'INSERT', row: normalized });
  return sendJson(res, 200, { ok: true, status: existing ? 'updated' : 'inserted', row: normalized });
}

async function handleChat(req, res, url, campaignId, batch = false) {
  const file = campaignFile(campaignId, 'chat.json');
  const rows = await readJson(file, {});
  if (req.method === 'GET') {
    const since = String(url.searchParams.get('since') || '').trim();
    const threadKey = String(url.searchParams.get('threadKey') || '').trim();
    let list = Object.values(rows);
    if (since) list = list.filter(row => new Date(row.updated_at || 0).getTime() >= new Date(since).getTime());
    if (threadKey) list = list.filter(row => row.thread_key === threadKey);
    list.sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')) || String(a.message_id || '').localeCompare(String(b.message_id || '')));
    const limit = Math.max(1, Math.min(10000, Number(url.searchParams.get('limit') || 1000)));
    return sendJson(res, 200, { ok: true, status: 'ok', rows: list.slice(0, limit) });
  }
  if (req.method !== 'POST' && req.method !== 'PUT') return sendError(res, 405, 'Method not allowed');
  const payload = await readJsonBody(req);
  const inputRows = batch ? (Array.isArray(payload.rows) ? payload.rows : []) : [payload.row || payload.message || payload];
  const saved = [];
  for (const input of inputRows) {
    const row = { campaign_id: campaignId, ...normalizeChatInput(input), updated_at: nowIso() };
    row.client_updated_at = row.client_updated_at || row.updated_at;
    const exists = Boolean(rows[row.message_id]);
    rows[row.message_id] = row;
    saved.push(row);
    broadcast(campaignId, { channel: 'chat', eventType: exists ? 'UPDATE' : 'INSERT', row });
  }
  await writeJsonAtomic(file, rows);
  return sendJson(res, 200, batch ? { ok: true, status: 'ok', rows: saved } : { ok: true, status: 'ok', row: saved[0] || null });
}

async function handleCombat(req, res, url, campaignId) {
  const file = campaignFile(campaignId, 'combat-runtime.json');
  const existing = await readJson(file, null);
  if (req.method === 'GET') return sendJson(res, 200, { ok: true, status: existing ? 'ok' : 'empty', row: existing ? normalizeCombatRow(existing) : null });
  if (req.method !== 'POST' && req.method !== 'PUT') return sendError(res, 405, 'Method not allowed');
  const payload = await readJsonBody(req);
  const expected = Number.isFinite(Number(payload.baseRevision)) ? Number(payload.baseRevision) : 0;
  if (!existing && expected !== 0) return sendJson(res, 409, { ok: false, status: 'conflict', message: 'Combat runtime is empty', remote: null });
  if (existing && Number(existing.revision || 0) !== expected) return sendJson(res, 409, { ok: false, status: 'conflict', message: 'Combat runtime has newer remote version', remote: normalizeCombatRow(existing) });
  const updatedAt = nowIso();
  const row = {
    campaign_id: campaignId,
    revision: existing ? Number(existing.revision || 0) + 1 : 1,
    updated_at: updatedAt,
    updated_by: String(payload.updatedBy || payload.updated_by || 'unknown-device').trim() || 'unknown-device',
    client_updated_at: payload.clientUpdatedAt || payload.client_updated_at || updatedAt,
    active_scene_id: String(payload.active_scene_id || payload.activeSceneId || payload.scene_json?.id || payload.scene?.id || '').trim(),
    scene_json: payload.scene_json || payload.scene || {},
    runtime_json: payload.runtime_json || payload.runtime || {}
  };
  await writeJsonAtomic(file, row);
  const normalized = normalizeCombatRow(row);
  broadcast(campaignId, { channel: 'combat', eventType: existing ? 'UPDATE' : 'INSERT', row: normalized });
  return sendJson(res, 200, { ok: true, status: existing ? 'updated' : 'inserted', row: normalized });
}

async function handleAsset(req, res, url, campaignId) {
  if (req.method !== 'POST' && req.method !== 'PUT') return sendError(res, 405, 'Method not allowed');
  const rawPath = String(url.searchParams.get('path') || `${Date.now()}_asset.bin`).replace(/\\/g, '/');
  const cleanParts = rawPath.split('/').map(part => safeName(part, '')).filter(Boolean);
  const relativePath = [safeName(campaignId), ...cleanParts].join('/');
  const file = path.join(DATA_DIR, 'assets', relativePath);
  await ensureDir(path.dirname(file));
  const buffer = await readBody(req);
  await fs.promises.writeFile(file, buffer);
  const publicUrl = publicUrlForAsset(req, relativePath);
  return sendJson(res, 200, { ok: true, status: 'ok', storagePath: relativePath, publicUrl, url: publicUrl, contentType: req.headers['content-type'] || 'application/octet-stream', bytes: buffer.length });
}

function handleSse(req, res, campaignId) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'access-control-allow-origin': '*'
  });
  res.write(': connected\n\n');
  const set = getSseSet(campaignId);
  set.add(res);
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); set.delete(res); }
  }, 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    set.delete(res);
  });
}

async function serveAsset(req, res, url) {
  const relative = decodeURIComponent(url.pathname.replace(/^\/assets\//, '')).replace(/\\/g, '/');
  const clean = relative.split('/').map(part => safeName(part, '')).filter(Boolean).join('/');
  const file = path.join(DATA_DIR, 'assets', clean);
  if (!file.startsWith(path.join(DATA_DIR, 'assets'))) return sendError(res, 403, 'Forbidden');
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return sendError(res, 404, 'Asset not found');
    const stream = fs.createReadStream(file);
    const ext = path.extname(file).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable', 'content-length': stat.size });
    stream.pipe(res);
  } catch {
    sendError(res, 404, 'Asset not found');
  }
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (!isAuthorized(req, url)) return sendError(res, 401, 'Unauthorized');
  if (url.pathname === '/health' || url.pathname === '/api/health') return sendJson(res, 200, { ok: true, status: 'ok', dataDir: DATA_DIR, realtime: 'sse' });
  if (url.pathname.startsWith('/assets/')) return serveAsset(req, res, url);

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api') return sendError(res, 404, 'Not found');
  const resource = parts[1];
  const campaignId = parts[2] || '';
  if (!campaignId) return sendError(res, 400, 'campaignId is required');

  if (resource === 'events' && req.method === 'GET') return handleSse(req, res, campaignId);
  if (resource === 'snapshots') return handleSnapshot(req, res, url, campaignId);
  if (resource === 'players') return handlePlayers(req, res, url, campaignId, parts[3] || '');
  if (resource === 'chat') return handleChat(req, res, url, campaignId, parts[3] === 'batch');
  if (resource === 'combat') return handleCombat(req, res, url, campaignId);
  if (resource === 'assets') return handleAsset(req, res, url, campaignId);
  return sendError(res, 404, 'Not found');
}

const server = http.createServer((req, res) => {
  router(req, res).catch(error => {
    const status = error?.statusCode || 500;
    console.error('[sync-server]', error);
    sendError(res, status, error?.message || String(error));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[sync-server] listening on ${HOST}:${PORT}`);
  console.log(`[sync-server] data dir: ${DATA_DIR}`);
  console.log(`[sync-server] auth: ${SYNC_TOKEN ? 'token required' : 'disabled'}`);
});
