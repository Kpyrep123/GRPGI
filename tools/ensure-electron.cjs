'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const electronDir = path.join(projectRoot, 'node_modules', 'electron');
const installScript = path.join(electronDir, 'install.js');
const pathFile = path.join(electronDir, 'path.txt');
const distDir = path.join(electronDir, 'dist');
const force = process.argv.includes('--force');
const fallbackMirror = 'https://npmmirror.com/mirrors/electron/';

function getInstalledBinary() {
  try {
    const relativePath = fs.readFileSync(pathFile, 'utf8').trim();
    if (!relativePath) return null;
    const binary = path.join(distDir, relativePath);
    return fs.existsSync(binary) ? binary : null;
  } catch {
    return null;
  }
}

function clearBrokenInstall() {
  try { fs.rmSync(distDir, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(pathFile, { force: true }); } catch {}
}

function installElectron(label, extraEnv = {}) {
  console.log(`[electron-check] Источник: ${label}`);
  const env = {
    ...process.env,
    npm_config_ignore_scripts: 'false',
    ...extraEnv
  };

  if ((env.HTTPS_PROXY || env.HTTP_PROXY || env.https_proxy || env.http_proxy) && !env.ELECTRON_GET_USE_PROXY) {
    env.ELECTRON_GET_USE_PROXY = '1';
  }

  const result = spawnSync(process.execPath, [installScript], {
    cwd: electronDir,
    stdio: 'inherit',
    env
  });

  if (result.error) {
    console.error(`[electron-check] Не удалось запустить установщик: ${result.error.message}`);
    return false;
  }

  if (result.status !== 0) {
    console.error(`[electron-check] Источник ${label} завершился с кодом ${result.status}.`);
    return false;
  }

  return Boolean(getInstalledBinary());
}

if (!fs.existsSync(installScript)) {
  console.error('[electron-check] Пакет Electron отсутствует. Выполните: npm ci');
  process.exit(1);
}

if (force) clearBrokenInstall();

const existingBinary = getInstalledBinary();
if (existingBinary) {
  console.log(`[electron-check] OK: ${existingBinary}`);
  process.exit(0);
}

console.log('[electron-check] Бинарник Electron отсутствует. Выполняется загрузка...');

const attempts = [];
if (process.env.ELECTRON_MIRROR) {
  attempts.push({ label: 'ELECTRON_MIRROR из окружения', env: {} });
} else {
  attempts.push({ label: 'официальные релизы GitHub', env: {} });
  attempts.push({
    label: 'резервное зеркало npmmirror',
    env: { ELECTRON_MIRROR: fallbackMirror }
  });
}

for (const attempt of attempts) {
  clearBrokenInstall();
  if (installElectron(attempt.label, attempt.env)) {
    const installedBinary = getInstalledBinary();
    console.log(`[electron-check] Electron установлен: ${installedBinary}`);
    process.exit(0);
  }
}

console.error('[electron-check] Не удалось загрузить Electron ни из одного доступного источника.');
console.error('[electron-check] Проверьте интернет, VPN/прокси, антивирус и доступ к GitHub.');
console.error('[electron-check] Для своего зеркала задайте ELECTRON_MIRROR и повторите: npm run electron:repair');
process.exit(1);
