// PLAYWRIGHT_MODULE=/path/playwright/index.mjs CHROMIUM_EXECUTABLE=/path/chromium node tests/v139-technological-theme.browser.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE) : 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = process.env.CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const roots = {
  landing: path.join(root, 'deploy/site'),
  web: path.join(root, 'deploy/site/app'),
  desktop: path.join(root, 'renderer')
};
const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname !== 'grpgi.test') return route.abort();
  const [, surface, ...parts] = url.pathname.split('/');
  const base = roots[surface];
  if (!base) return route.fulfill({ status: 404, body: '' });
  const relative = parts.join('/') || 'index.html';
  const file = path.resolve(base, decodeURIComponent(relative));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
  let body = fs.readFileSync(file);
  if (path.extname(file).toLowerCase() === '.html') {
    body = body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    if (surface === 'web') body = body.replace('class="boot-shell hidden"', 'class="boot-shell"');
  }
  return route.fulfill({ body, contentType: contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream' });
});

try {
  await page.goto('http://grpgi.test/landing/', { waitUntil: 'networkidle' });
  const landing = await page.evaluate(() => ({
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    radius: getComputedStyle(document.querySelector('.card')).borderRadius,
    panelBackground: getComputedStyle(document.querySelector('.card')).backgroundImage,
    body: getComputedStyle(document.body).backgroundImage,
    text: document.body.textContent
  }));
  assert.equal(landing.accent.toLowerCase(), '#b99358');
  assert.equal(landing.radius, '3px');
  assert.match(landing.panelBackground, /193, 155, 94/, landing.panelBackground);
  assert.match(landing.body, /linear-gradient/);
  assert.match(landing.text, /платформа настольных ролевых игр/i);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'v139-landing.png'), fullPage: true });

  await page.goto('http://grpgi.test/web/', { waitUntil: 'networkidle' });
  const web = await page.evaluate(() => ({
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    radius: getComputedStyle(document.querySelector('.boot-card')).borderRadius,
    panelBackground: getComputedStyle(document.querySelector('.boot-card')).backgroundImage,
    label: document.querySelector('#login-screen .eyebrow')?.textContent?.trim(),
    title: document.title
  }));
  assert.equal(web.accent.toLowerCase(), '#b99358');
  assert.equal(web.radius, '3px');
  assert.match(web.panelBackground, /193, 155, 94/, web.panelBackground);
  assert.equal(web.label, 'ВХОД В ПРОФИЛЬ');
  assert.equal(web.title, 'GRPGI · веб-клиент');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'v139-web-login.png'), fullPage: true });

  await page.goto('http://grpgi.test/desktop/', { waitUntil: 'networkidle' });
  const desktop = await page.evaluate(() => ({
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    radius: getComputedStyle(document.querySelector('.login-box')).borderRadius,
    panelBackground: getComputedStyle(document.querySelector('.login-box')).backgroundImage,
    sync: document.getElementById('sync-chip')?.textContent?.trim(),
    status: document.getElementById('status-line')?.textContent?.trim()
  }));
  assert.equal(desktop.accent.toLowerCase(), '#b99358');
  assert.equal(desktop.radius, '3px');
  assert.match(desktop.panelBackground, /193, 155, 94/, desktop.panelBackground);
  assert.equal(desktop.sync, 'ЛОКАЛЬНЫЕ ДАННЫЕ');
  assert.equal(desktop.status, 'GRPGI · версия 1.0.140');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'v139-desktop-login.png'), fullPage: true });

  assert.deepEqual(errors, []);
  console.log('PASS Chromium: v139 technological theme renders on landing, web login and desktop login');
} finally {
  await browser.close();
}
