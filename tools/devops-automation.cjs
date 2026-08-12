'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const DEFAULT_CONFIG = Object.freeze({
  github: {
    remote: 'origin',
    expectedRepository: 'Kpyrep123/GRPGI',
    targetBranch: 'main',
    createTag: false,
    protectedDeletionPrefixes: ['mobile/', 'renderer/assets/', 'deploy/site/', '.github/', 'sync-server/'],
    protectedDeletionPaths: ['package.json', 'package-lock.json', 'main.js', 'preload.js', 'renderer/app.js', 'renderer/index.html'],
    maxUnprotectedDeletions: 20
  },
  webDeploy: {
    source: 'deploy/site',
    host: '161.104.35.195',
    port: 22,
    user: 'root',
    target: '/var/www/grpg-app',
    identityFile: '~/.ssh/grpgi_deploy',
    healthUrls: [
      'https://app.grpg-sync.ru/',
      'https://app.grpg-sync.ru/app/'
    ],
    healthAddress: '127.0.0.1'
  },
  archive: {
    maxFileSizeMb: 20,
    excludePrefixes: [
      'renderer/assets/audio/',
      'webapp_work/',
      'mobile/android/.gradle/',
      'mobile/android/build/',
      'mobile/android/app/build/'
    ],
    excludeDirectoryNames: [
      '.git',
      'node_modules',
      'dist',
      'out',
      'release',
      'build',
      '.gradle',
      '.idea',
      '.cache',
      'coverage',
      'pb_data',
      'user-data',
      'world-data'
    ],
    excludeExtensions: [
      '.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac',
      '.exe', '.msi', '.msix', '.appx', '.dmg', '.appimage', '.deb', '.rpm',
      '.apk', '.aab', '.ipa', '.jar',
      '.zip', '.7z', '.rar', '.tar', '.gz', '.tgz',
      '.log', '.pdb'
    ]
  }
});

let activeOperation = '';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeConfig(base, override) {
  const result = clone(base);
  if (!override || typeof override !== 'object') return result;
  for (const [sectionName, sectionValue] of Object.entries(override)) {
    if (!sectionValue || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) continue;
    result[sectionName] = { ...(result[sectionName] || {}), ...sectionValue };
  }
  return result;
}

function normalizeRelative(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function loadConfig(rootDir) {
  const configPath = path.join(rootDir, 'devops.config.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw new Error(`Не удалось прочитать devops.config.json: ${error.message}`);
    }
    return clone(DEFAULT_CONFIG);
  }
}

function commandError(command, args, result) {
  const details = String(result?.stderr || result?.stdout || '').trim();
  const error = new Error(details || `Команда завершилась с кодом ${result?.code}: ${command} ${args.join(' ')}`);
  error.command = command;
  error.args = args;
  error.code = result?.code;
  error.stdout = result?.stdout || '';
  error.stderr = result?.stderr || '';
  return error;
}

function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const maxOutput = Number(options.maxOutputBytes || 2 * 1024 * 1024);
    const append = (current, chunk) => {
      if (current.length >= maxOutput) return current;
      return (current + chunk.toString()).slice(0, maxOutput);
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    const timeoutMs = Number(options.timeoutMs || 120000);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Превышено время выполнения команды: ${command}`));
    }, timeoutMs);
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      const result = { code: Number(code ?? -1), stdout, stderr };
      if (result.code !== 0 && !options.allowNonZero) {
        reject(commandError(command, args, result));
        return;
      }
      resolve(result);
    });
  });
}

function sanitizeError(error) {
  return {
    ok: false,
    message: error?.message || String(error),
    command: error?.command || '',
    stdout: String(error?.stdout || '').trim(),
    stderr: String(error?.stderr || '').trim()
  };
}

function normalizeRepository(remoteUrl) {
  const value = String(remoteUrl || '').trim().replace(/\.git$/i, '');
  const sshMatch = value.match(/^git@github\.com:([^/]+\/[^/]+)$/i);
  if (sshMatch) return sshMatch[1].toLowerCase();
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== 'github.com') return '';
    return parsed.pathname.replace(/^\/+/, '').toLowerCase();
  } catch {
    return '';
  }
}

function readPackage(rootDir) {
  const packagePath = path.join(rootDir, 'package.json');
  const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return { packagePath, parsed };
}

function patchVersion(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Версия должна иметь формат X.Y.Z, получено: ${version || 'пусто'}`);
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3]) + 1}`;
}

function parsePorcelain(output) {
  return String(output || '').split(/\r?\n/).filter(Boolean).map(line => {
    const status = line.slice(0, 2);
    let file = line.slice(3).trim();
    if (file.includes(' -> ')) file = file.split(' -> ').pop();
    if (file.startsWith('"') && file.endsWith('"')) {
      try { file = JSON.parse(file); } catch {}
    }
    return { status, path: normalizeRelative(file) };
  });
}

function isDeletedStatus(status) {
  return String(status || '').includes('D');
}

function isSecretPath(file) {
  const normalized = normalizeRelative(file).toLowerCase();
  const base = path.posix.basename(normalized);
  return normalized === '.env'
    || normalized.startsWith('.env.')
    || normalized.includes('/.env')
    || normalized.startsWith('pb_data/')
    || normalized.startsWith('user-data/')
    || normalized.startsWith('world-data/')
    || /(^|\/)(id_rsa|id_ed25519|id_ecdsa)(\.|$)/.test(normalized)
    || ['.pem', '.key', '.p12', '.pfx'].some(ext => base.endsWith(ext));
}

function blockedDeletionPaths(config, deletedPaths) {
  const explicitAllowed = new Set((config.github.allowedDeletedPaths || []).map(normalizeRelative));
  const protectedPaths = new Set((config.github.protectedDeletionPaths || []).map(normalizeRelative));
  const protectedPrefixes = (config.github.protectedDeletionPrefixes || []).map(item => normalizeRelative(item));
  const blocked = deletedPaths.filter(file => {
    if (explicitAllowed.has(file)) return false;
    if (protectedPaths.has(file)) return true;
    return protectedPrefixes.some(prefix => file === prefix.replace(/\/$/, '') || file.startsWith(prefix));
  });
  const unprotected = deletedPaths.filter(file => !blocked.includes(file) && !explicitAllowed.has(file));
  const maximum = Math.max(0, Number(config.github.maxUnprotectedDeletions ?? 20));
  if (unprotected.length > maximum) blocked.push(...unprotected);
  return [...new Set(blocked)];
}

async function commandAvailable(command, args = ['--version']) {
  try {
    const result = await run(command, args, { timeoutMs: 15000, allowNonZero: true });
    return { available: true, version: String(result.stdout || result.stderr || '').split(/\r?\n/)[0].trim(), exitCode: result.code };
  } catch (error) {
    return { available: false, version: '', message: error.message };
  }
}

async function getGitStatus(rootDir, config) {
  const gitInfo = await commandAvailable('git');
  if (!gitInfo.available) {
    return { ok: false, available: false, reason: 'git-not-found', message: 'Git не найден в PATH', tools: { git: gitInfo } };
  }
  const inside = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: rootDir, allowNonZero: true, timeoutMs: 15000 });
  if (inside.code !== 0 || String(inside.stdout).trim() !== 'true') {
    return { ok: false, available: false, reason: 'not-a-git-repository', message: 'Рабочая папка не содержит Git-репозиторий', tools: { git: gitInfo } };
  }
  const remoteName = String(config.github.remote || 'origin');
  const [remote, branch, statusResult] = await Promise.all([
    run('git', ['remote', 'get-url', remoteName], { cwd: rootDir, timeoutMs: 15000 }),
    run('git', ['branch', '--show-current'], { cwd: rootDir, timeoutMs: 15000 }),
    run('git', ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--untracked-files=all'], { cwd: rootDir, timeoutMs: 30000 })
  ]);
  const remoteUrl = String(remote.stdout).trim();
  const actualRepository = normalizeRepository(remoteUrl);
  const expectedRepository = String(config.github.expectedRepository || '').toLowerCase();
  const changes = parsePorcelain(statusResult.stdout);
  const deleted = changes.filter(item => isDeletedStatus(item.status)).map(item => item.path);
  const blockedDeletions = blockedDeletionPaths(config, deleted);
  const blockedSecrets = changes.map(item => item.path).filter(isSecretPath);
  const pkg = readPackage(rootDir).parsed;
  const sshInfo = await commandAvailable('ssh', ['-V']);
  const scpInfo = await commandAvailable('scp', ['-V']);
  return {
    ok: true,
    available: actualRepository === expectedRepository,
    reason: actualRepository === expectedRepository ? '' : 'unexpected-remote',
    message: actualRepository === expectedRepository ? 'DEV-инструменты готовы' : `Неразрешённый Git remote: ${remoteUrl}`,
    rootDir,
    version: String(pkg.version || ''),
    nextVersion: patchVersion(pkg.version),
    branch: String(branch.stdout).trim() || '(detached HEAD)',
    remoteName,
    remoteUrl,
    actualRepository,
    expectedRepository,
    targetBranch: String(config.github.targetBranch || 'main'),
    createTag: config.github.createTag === true,
    changes,
    changeCount: changes.length,
    deleted,
    blockedDeletions,
    blockedSecrets,
    tools: { git: gitInfo, ssh: sshInfo, scp: scpInfo },
    busy: activeOperation || ''
  };
}

async function getStatus(rootDir) {
  try {
    return await getGitStatus(rootDir, loadConfig(rootDir));
  } catch (error) {
    return sanitizeError(error);
  }
}

function updateVersionFiles(rootDir, nextVersion) {
  const { packagePath, parsed: pkg } = readPackage(rootDir);
  pkg.version = nextVersion;
  pkg.build = pkg.build && typeof pkg.build === 'object' ? pkg.build : {};
  pkg.build.buildVersion = `${nextVersion}.0`;
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  const lockPath = path.join(rootDir, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = nextVersion;
    if (lock.packages && lock.packages['']) lock.packages[''].version = nextVersion;
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  }
}

async function checkChangedFileSizes(rootDir, changes) {
  const warnings = [];
  const blocked = [];
  for (const item of changes) {
    if (isDeletedStatus(item.status)) continue;
    const absolute = path.join(rootDir, item.path);
    try {
      const stat = await fs.promises.stat(absolute);
      if (!stat.isFile()) continue;
      if (stat.size >= 95 * 1024 * 1024) blocked.push({ path: item.path, size: stat.size });
      else if (stat.size >= 25 * 1024 * 1024) warnings.push({ path: item.path, size: stat.size });
    } catch {}
  }
  return { blocked, warnings };
}

async function publishPatch(rootDir) {
  if (activeOperation) throw new Error(`Уже выполняется операция: ${activeOperation}`);
  activeOperation = 'github-publish';
  try {
    const config = loadConfig(rootDir);
    const status = await getGitStatus(rootDir, config);
    if (!status.ok || !status.available) throw new Error(status.message || 'GitHub-публикация недоступна');
    if (status.blockedDeletions.length) {
      const preview = status.blockedDeletions.slice(0, 20).join('\n');
      throw new Error(`Обнаружены запрещённые удаления. Публикация остановлена.\n${preview}${status.blockedDeletions.length > 20 ? '\n…' : ''}`);
    }
    if (status.blockedSecrets.length) {
      throw new Error(`Обнаружены потенциальные секреты или пользовательские данные:\n${status.blockedSecrets.join('\n')}`);
    }
    const sizes = await checkChangedFileSizes(rootDir, status.changes);
    if (sizes.blocked.length) {
      throw new Error(`GitHub-публикация остановлена: файлы размером 95 МБ и больше:\n${sizes.blocked.map(item => item.path).join('\n')}`);
    }

    const remote = status.remoteName;
    const targetBranch = status.targetBranch;
    await run('git', ['fetch', remote, targetBranch, '--tags'], {
      cwd: rootDir,
      timeoutMs: 180000,
      env: { GIT_TERMINAL_PROMPT: '0' }
    });
    const ancestor = await run('git', ['merge-base', '--is-ancestor', `${remote}/${targetBranch}`, 'HEAD'], {
      cwd: rootDir,
      timeoutMs: 30000,
      allowNonZero: true
    });
    if (ancestor.code !== 0) {
      throw new Error(`Текущий HEAD не основан на ${remote}/${targetBranch}. Сначала объедините актуальный main без force push.`);
    }

    const nextVersion = status.nextVersion;
    const tagName = `v${nextVersion}`;
    if (config.github.createTag === true) {
      const localTag = await run('git', ['rev-parse', '-q', '--verify', `refs/tags/${tagName}`], {
        cwd: rootDir,
        timeoutMs: 15000,
        allowNonZero: true
      });
      if (localTag.code === 0) throw new Error(`Тег ${tagName} уже существует локально`);
      const remoteTag = await run('git', ['ls-remote', '--tags', remote, `refs/tags/${tagName}`], {
        cwd: rootDir,
        timeoutMs: 60000,
        env: { GIT_TERMINAL_PROMPT: '0' }
      });
      if (String(remoteTag.stdout).trim()) throw new Error(`Тег ${tagName} уже существует на GitHub`);
    }

    updateVersionFiles(rootDir, nextVersion);
    await run('git', ['add', '-A', '--', '.'], { cwd: rootDir, timeoutMs: 120000 });
    const staged = await run('git', ['diff', '--cached', '--name-status'], { cwd: rootDir, timeoutMs: 30000 });
    if (!String(staged.stdout).trim()) throw new Error('После обновления версии нет файлов для коммита');

    const commitMessage = `Release ${tagName}`;
    await run('git', ['commit', '-m', commitMessage], {
      cwd: rootDir,
      timeoutMs: 120000,
      env: { GIT_TERMINAL_PROMPT: '0' }
    });
    if (config.github.createTag !== false) {
      await run('git', ['tag', '-a', tagName, '-m', commitMessage], { cwd: rootDir, timeoutMs: 30000 });
      await run('git', [
        'push', '--atomic', remote,
        `HEAD:refs/heads/${targetBranch}`,
        `refs/tags/${tagName}:refs/tags/${tagName}`
      ], {
        cwd: rootDir,
        timeoutMs: 300000,
        env: { GIT_TERMINAL_PROMPT: '0' }
      });
    } else {
      await run('git', ['push', remote, `HEAD:refs/heads/${targetBranch}`], {
        cwd: rootDir,
        timeoutMs: 300000,
        env: { GIT_TERMINAL_PROMPT: '0' }
      });
    }
    const commit = await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: rootDir, timeoutMs: 15000 });
    return {
      ok: true,
      version: nextVersion,
      tag: config.github.createTag === false ? '' : tagName,
      commit: String(commit.stdout).trim(),
      targetBranch,
      warnings: sizes.warnings,
      staged: String(staged.stdout).trim().split(/\r?\n/).filter(Boolean)
    };
  } finally {
    activeOperation = '';
  }
}

function validateWebConfig(config, rootDir) {
  const web = config.webDeploy || {};
  if (!/^[a-z0-9.-]+$/i.test(String(web.host || ''))) throw new Error('Некорректный webDeploy.host');
  if (!/^[a-z_][a-z0-9_-]*$/i.test(String(web.user || ''))) throw new Error('Некорректный webDeploy.user');
  if (!Number.isInteger(Number(web.port)) || Number(web.port) < 1 || Number(web.port) > 65535) throw new Error('Некорректный webDeploy.port');
  if (!/^\/[a-zA-Z0-9._/-]+$/.test(String(web.target || ''))) throw new Error('Некорректный webDeploy.target');
  const identityFile = expandHome(web.identityFile);
  if (identityFile && !fs.existsSync(identityFile)) throw new Error(`SSH-ключ не найден: ${identityFile}`);
  const sourcePath = path.resolve(rootDir, String(web.source || 'deploy/site'));
  const rootResolved = path.resolve(rootDir);
  if (!sourcePath.startsWith(`${rootResolved}${path.sep}`)) throw new Error('webDeploy.source выходит за пределы проекта');
  if (!fs.existsSync(path.join(sourcePath, 'index.html'))) throw new Error(`Не найден ${path.join(web.source, 'index.html')}`);
  if (!fs.existsSync(path.join(sourcePath, 'app', 'index.html'))) throw new Error(`Не найден ${path.join(web.source, 'app', 'index.html')}`);
  return { ...web, sourcePath };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

async function probePublicHealth(urls = []) {
  const results = [];
  for (const rawUrl of urls || []) {
    const url = String(rawUrl || '').trim();
    if (!url) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 GRPGI-DeployCheck/1.0',
          'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'cache-control': 'no-cache'
        }
      });
      results.push({
        url,
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
        statusText: response.statusText || ''
      });
    } catch (error) {
      results.push({
        url,
        ok: false,
        status: 0,
        statusText: error?.name === 'AbortError' ? 'timeout' : (error?.message || String(error))
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}

function expandHome(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text === '~') return os.homedir();
  if (text.startsWith('~/') || text.startsWith('~\\')) return path.join(os.homedir(), text.slice(2));
  return text;
}

function sshBaseArgs(web) {
  const args = [
    '-p', String(web.port),
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=10',
    '-o', 'StrictHostKeyChecking=accept-new'
  ];
  const identityFile = expandHome(web.identityFile);
  if (identityFile) args.push('-i', identityFile);
  return args;
}

function scpBaseArgs(web) {
  const args = [
    '-P', String(web.port),
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15',
    '-o', 'StrictHostKeyChecking=accept-new'
  ];
  const identityFile = expandHome(web.identityFile);
  if (identityFile) args.push('-i', identityFile);
  return args;
}

function assertWebSourceHasNoLegacyBackend(sourcePath) {
  const textExtensions = new Set(['.html', '.js', '.cjs', '.mjs', '.css', '.json', '.md', '.txt', '.yml', '.yaml']);
  const legacyBackend = ['supa', 'base'].join('');
  const forbidden = [
    { label: 'legacy backend marker', pattern: new RegExp(legacyBackend, 'i') },
    { label: 'legacy REST endpoint', pattern: /\/rest\/v1\//i },
    { label: 'legacy Storage endpoint', pattern: /\/storage\/v1\//i },
    { label: 'legacy public key', pattern: new RegExp(`(?:anon[_-]?key|${legacyBackend}[_-]?key)`, 'i') }
  ];
  const hits = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const content = fs.readFileSync(full, 'utf8');
      for (const rule of forbidden) {
        if (rule.pattern.test(content)) hits.push(`${normalizeRelative(path.relative(sourcePath, full))}: ${rule.label}`);
      }
    }
  };
  walk(sourcePath);
  if (hits.length) {
    throw new Error(`Web-деплой остановлен: в deploy/site найдены остатки старого backend:
${hits.slice(0, 20).join('\n')}`);
  }
}

function runtimeConfigScript(runtimeConfig = {}) {
  const safe = {
    url: String(runtimeConfig.url || '').trim(),
    campaignId: String(runtimeConfig.campaignId || 'main').trim() || 'main',
    appUsersCollection: String(runtimeConfig.appUsersCollection || 'app_users').trim() || 'app_users',
    appUserEmail: String(runtimeConfig.appUserEmail || '').trim(),
    appUserPassword: String(runtimeConfig.appUserPassword || ''),
    tableName: String(runtimeConfig.tableName || 'campaign_snapshots').trim() || 'campaign_snapshots',
    playerTableName: String(runtimeConfig.playerTableName || 'campaign_players').trim() || 'campaign_players',
    chatTableName: String(runtimeConfig.chatTableName || 'campaign_messages').trim() || 'campaign_messages',
    combatRuntimeTableName: String(runtimeConfig.combatRuntimeTableName || 'campaign_combat_runtime').trim() || 'campaign_combat_runtime',
    assetsCollection: String(runtimeConfig.assetsCollection || 'campaign_assets').trim() || 'campaign_assets'
  };
  if (!safe.url || !safe.appUserEmail || !safe.appUserPassword) throw new Error('Не хватает runtime PocketBase-данных для Web-деплоя');
  return `// Generated only in the temporary deployment directory. Do not commit.\nwindow.GRPG_WEB_RUNTIME = ${JSON.stringify(safe)};\n`;
}

const WEB_MARKER_ASSET_DIRS_V1055 = Object.freeze(['nowadays', 'bronzera', 'scifi']);
const WEB_MARKER_ASSET_FILES_V1055 = Object.freeze(['blackhole.png', 'danger.png', 'misc.png', 'trade.png', 'node.png', 'star.png', 'planet.png', 'ship.png']);

async function copyWebMarkerAssetsV1055(rootDir, stagingSite) {
  if (!rootDir) return { copied: 0, missing: [] };
  let copied = 0;
  const missing = [];
  for (const folder of WEB_MARKER_ASSET_DIRS_V1055) {
    const sourceDir = path.join(rootDir, 'renderer', 'assets', 'images', folder);
    const targetDir = path.join(stagingSite, 'app', 'assets', 'markers', folder);
    for (const file of WEB_MARKER_ASSET_FILES_V1055) {
      const source = path.join(sourceDir, file);
      if (!fs.existsSync(source)) {
        missing.push(normalizeRelative(path.relative(rootDir, source)));
        continue;
      }
      await fs.promises.mkdir(targetDir, { recursive: true });
      await fs.promises.copyFile(source, path.join(targetDir, file));
      copied += 1;
    }
  }
  return { copied, missing };
}

async function prepareWebDeploySource(sourcePath, runtimeConfig = {}, rootDir = '') {
  const stagingRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'grpgi-web-deploy-'));
  const stagingSite = path.join(stagingRoot, 'site');
  await fs.promises.cp(sourcePath, stagingSite, { recursive: true, force: true });
  const appDir = path.join(stagingSite, 'app');
  await fs.promises.mkdir(appDir, { recursive: true });
  await fs.promises.writeFile(path.join(appDir, 'runtime-config.js'), runtimeConfigScript(runtimeConfig), 'utf8');
  const markerAssets = await copyWebMarkerAssetsV1055(rootDir, stagingSite);
  return { stagingRoot, stagingSite, markerAssets };
}

async function deployWeb(rootDir, options = {}) {
  if (activeOperation) throw new Error(`Уже выполняется операция: ${activeOperation}`);
  activeOperation = 'web-deploy';
  let prepared = null;
  try {
    const config = loadConfig(rootDir);
    const web = validateWebConfig(config, rootDir);
    assertWebSourceHasNoLegacyBackend(web.sourcePath);
    prepared = await prepareWebDeploySource(web.sourcePath, options.runtimeConfig || {}, rootDir);
    const deploySourcePath = prepared.stagingSite;
    const sshInfo = await commandAvailable('ssh', ['-V']);
    const scpInfo = await commandAvailable('scp', ['-V']);
    if (!sshInfo.available || !scpInfo.available) throw new Error('Для автодеплоя нужны ssh.exe и scp.exe в PATH');

    const endpoint = `${web.user}@${web.host}`;
    const sshArgs = sshBaseArgs(web);
    const connectionTest = await run('ssh', [...sshArgs, endpoint, 'printf GRPGI_SSH_OK'], {
      cwd: rootDir,
      timeoutMs: 30000,
      env: { SSH_ASKPASS: '', DISPLAY: '' }
    });
    if (!String(connectionTest.stdout).includes('GRPGI_SSH_OK')) throw new Error('SSH-проверка не вернула ожидаемый ответ');

    const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const target = String(web.target).replace(/\/+$/, '');
    const parent = path.posix.dirname(target);
    const incomingRoot = `${parent}/.grpg-app-incoming-${stamp}`;
    const backup = `${parent}/.grpg-app-backup-${stamp}`;
    await run('ssh', [...sshArgs, endpoint, `rm -rf ${shellQuote(incomingRoot)} && mkdir -p ${shellQuote(incomingRoot)}`], {
      cwd: rootDir,
      timeoutMs: 60000,
      env: { SSH_ASKPASS: '', DISPLAY: '' }
    });

    await run('scp', [...scpBaseArgs(web), '-r', deploySourcePath, `${endpoint}:${incomingRoot}/`], {
      cwd: rootDir,
      timeoutMs: 300000,
      env: { SSH_ASKPASS: '', DISPLAY: '' }
    });

    const incomingSite = `${incomingRoot}/${path.basename(deploySourcePath).replace(/[^a-zA-Z0-9._-]/g, '')}`;
    // Rollback is based on the deployed files themselves, not an HTTP request.
    // The public endpoint can legitimately reject curl/localhost probes with 403 because of WAF/Caddy rules.
    const remoteScript = [
      'set -eu',
      `target=${shellQuote(target)}`,
      `incoming=${shellQuote(incomingSite)}`,
      `incoming_root=${shellQuote(incomingRoot)}`,
      `backup=${shellQuote(backup)}`,
      '[ -s "$incoming/index.html" ]',
      '[ -s "$incoming/app/index.html" ]',
      '[ -s "$incoming/app/app.js" ]',
      '[ -s "$incoming/app/runtime-config.js" ]',
      'rm -rf "$backup"',
      'if [ -d "$target/downloads" ]; then mkdir -p "$incoming/downloads"; cp -a "$target/downloads/." "$incoming/downloads/"; fi',
      // scp is executed as root and the server may use umask 077. In that case
      // incoming dirs/files become 700/600 and Caddy cannot traverse/read them.
      // Normalize static-site permissions before the atomic rename.
      'find "$incoming" -type d -exec chmod 755 {} +',
      'find "$incoming" -type f -exec chmod 644 {} +',
      'if [ -d "$target" ]; then mv "$target" "$backup"; fi',
      'if ! mv "$incoming" "$target"; then if [ -d "$backup" ]; then mv "$backup" "$target"; fi; exit 42; fi',
      'find "$target" -type d -exec chmod 755 {} +',
      'find "$target" -type f -exec chmod 644 {} +',
      'rmdir "$incoming_root" 2>/dev/null || true',
      'if [ ! -s "$target/index.html" ] || [ ! -s "$target/app/index.html" ] || [ ! -s "$target/app/app.js" ] || [ ! -s "$target/app/runtime-config.js" ]; then rm -rf "$target"; if [ -d "$backup" ]; then mv "$backup" "$target"; fi; exit 43; fi',
      'rm -rf "$backup"',
      'printf GRPGI_DEPLOY_OK'
    ].join('; ');
    const deployed = await run('ssh', [...sshArgs, endpoint, remoteScript], {
      cwd: rootDir,
      timeoutMs: 180000,
      env: { SSH_ASKPASS: '', DISPLAY: '' }
    });
    if (!String(deployed.stdout).includes('GRPGI_DEPLOY_OK')) throw new Error('Сервер не подтвердил успешный деплой');
    const healthChecks = await probePublicHealth(web.healthUrls || []);
    const healthWarnings = healthChecks.filter(item => !item.ok);
    return {
      ok: true,
      source: normalizeRelative(path.relative(rootDir, web.sourcePath)),
      endpoint,
      target,
      healthUrls: web.healthUrls || [],
      healthChecks,
      healthWarnings,
      runtimeAuthInjected: true,
      markerAssetsCopied: Number(prepared?.markerAssets?.copied || 0),
      markerAssetsMissing: prepared?.markerAssets?.missing || []
    };
  } finally {
    if (prepared?.stagingRoot) {
      try { await fs.promises.rm(prepared.stagingRoot, { recursive: true, force: true }); } catch {}
    }
    activeOperation = '';
  }
}

function exclusionReason(relativePath, stat, archiveConfig) {
  const normalized = normalizeRelative(relativePath);
  const lower = normalized.toLowerCase();
  const segments = lower.split('/');
  const excludedDirs = new Set((archiveConfig.excludeDirectoryNames || []).map(item => String(item).toLowerCase()));
  if (segments.some(segment => excludedDirs.has(segment))) return 'excluded-directory';
  for (const prefix of archiveConfig.excludePrefixes || []) {
    const normalizedPrefix = normalizeRelative(prefix).toLowerCase();
    if (lower === normalizedPrefix.replace(/\/$/, '') || lower.startsWith(normalizedPrefix)) return 'excluded-prefix';
  }
  const base = path.posix.basename(lower);
  if (lower.endsWith('~') || base === '.ds_store' || base === 'thumbs.db' || ['.bak', '.tmp', '.old'].some(suffix => base.endsWith(suffix))) return 'temporary-or-backup-file';
  const ext = path.extname(lower);
  if ((archiveConfig.excludeExtensions || []).map(item => String(item).toLowerCase()).includes(ext)) return 'excluded-extension';
  if (isSecretPath(normalized)) return 'secret-or-user-data';
  const maxBytes = Number(archiveConfig.maxFileSizeMb || 20) * 1024 * 1024;
  if (stat && stat.size > maxBytes) return 'file-too-large';
  return '';
}

async function listArchiveCandidates(rootDir, archiveConfig = {}) {
  const inside = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: rootDir, allowNonZero: true, timeoutMs: 15000 }).catch(() => ({ code: 1 }));
  if (inside.code === 0) {
    const listed = await run('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: rootDir, timeoutMs: 60000 });
    return [...new Set(String(listed.stdout || '').split('\0').filter(Boolean).map(normalizeRelative))];
  }
  const result = [];
  const excludedDirs = new Set((archiveConfig.excludeDirectoryNames || []).map(item => String(item).toLowerCase()));
  const excludedPrefixes = (archiveConfig.excludePrefixes || []).map(item => normalizeRelative(item).toLowerCase());
  async function walk(current) {
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = normalizeRelative(path.relative(rootDir, absolute));
      const lower = relative.toLowerCase();
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (excludedDirs.has(entry.name.toLowerCase())) continue;
        if (excludedPrefixes.some(prefix => lower === prefix.replace(/\/$/, '') || `${lower}/`.startsWith(prefix))) continue;
        await walk(absolute);
      } else if (entry.isFile()) result.push(relative);
    }
  }
  await walk(rootDir);
  return result;
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function createZipFromDirectory(stageDir, outputPath) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.rm(outputPath, { force: true });
  if (process.platform === 'win32') {
    const script = [
      "$ErrorActionPreference='Stop'",
      "$source = Join-Path $env:GRPGI_ARCHIVE_STAGE '*'",
      "Compress-Archive -Path $source -DestinationPath $env:GRPGI_ARCHIVE_OUT -CompressionLevel Optimal -Force"
    ].join('; ');
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      timeoutMs: 300000,
      env: { GRPGI_ARCHIVE_STAGE: stageDir, GRPGI_ARCHIVE_OUT: outputPath }
    });
    return;
  }
  await run('zip', ['-qr', outputPath, '.'], { cwd: stageDir, timeoutMs: 300000 });
}

function defaultArchiveName(rootDir) {
  let version = 'source';
  try { version = readPackage(rootDir).parsed.version || version; } catch {}
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').slice(0, 13);
  return `GRPGI-source-v${version}-${stamp}.zip`;
}

async function createSourceArchive(rootDir, outputPath) {
  if (activeOperation) throw new Error(`Уже выполняется операция: ${activeOperation}`);
  activeOperation = 'source-archive';
  const stageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'grpgi-source-'));
  try {
    const config = loadConfig(rootDir);
    const candidates = await listArchiveCandidates(rootDir, config.archive || {});
    const included = [];
    const excluded = [];
    for (const relative of candidates.sort()) {
      const absolute = path.join(rootDir, relative);
      let stat;
      try { stat = await fs.promises.lstat(absolute); } catch { continue; }
      if (!stat.isFile() || stat.isSymbolicLink()) {
        excluded.push({ path: relative, reason: 'not-a-regular-file' });
        continue;
      }
      const reason = exclusionReason(relative, stat, config.archive || {});
      if (reason) {
        excluded.push({ path: relative, reason, size: stat.size });
        continue;
      }
      const target = path.join(stageDir, relative);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.copyFile(absolute, target);
      included.push({ path: relative, size: stat.size, sha256: await sha256File(absolute) });
    }
    const gitStatus = await getGitStatus(rootDir, config).catch(() => null);
    const manifest = {
      schema: 1,
      purpose: 'GRPGI source archive for code review and modification',
      createdAt: new Date().toISOString(),
      rootName: path.basename(rootDir),
      version: (() => { try { return readPackage(rootDir).parsed.version || ''; } catch { return ''; } })(),
      git: gitStatus?.ok ? {
        branch: gitStatus.branch,
        remote: gitStatus.remoteUrl,
        changeCount: gitStatus.changeCount,
        deletedFiles: gitStatus.deleted
      } : null,
      rules: config.archive,
      includedCount: included.length,
      excludedCount: excluded.length,
      included,
      excluded
    };
    await fs.promises.writeFile(
      path.join(stageDir, '_GRPGI_SOURCE_ARCHIVE_MANIFEST.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    );
    await createZipFromDirectory(stageDir, outputPath);
    const archiveStat = await fs.promises.stat(outputPath);
    return {
      ok: true,
      outputPath,
      archiveSize: archiveStat.size,
      includedCount: included.length,
      excludedCount: excluded.length
    };
  } finally {
    activeOperation = '';
    await fs.promises.rm(stageDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  getStatus,
  publishPatch,
  deployWeb,
  createSourceArchive,
  defaultArchiveName,
  sanitizeError
};
