// PLAYWRIGHT_MODULE=/path/playwright/index.mjs CHROMIUM_EXECUTABLE=/path/chromium node tests/v139-market.browser.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE) : 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname !== 'grpgi.test') return route.abort();
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(root, 'renderer', relative);
  if (!file.startsWith(path.join(root, 'renderer') + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(file)] || 'application/octet-stream';
  return route.fulfill({ body: fs.readFileSync(file), contentType: type });
});

await page.addInitScript(() => {
  window.setInterval = () => 0;
  window.requestAnimationFrame = () => 0;
  const add = window.addEventListener.bind(window);
  const docAdd = document.addEventListener.bind(document);
  window.addEventListener = (type, ...args) => type !== 'load' ? add(type, ...args) : undefined;
  document.addEventListener = (type, ...args) => type !== 'DOMContentLoaded' ? docAdd(type, ...args) : undefined;
  window.electronAPI = { appVersion: '1.0.140', debugLog: async () => {} };
});

try {
  await page.goto('http://grpgi.test/', { waitUntil: 'load' });
  await page.evaluate(() => {
    applyWorldData({
      players: { PLAYER_TEMPLATES: { p: {
        id: 'p', role: 'player', displayName: 'Тиль', approvalStatus: 'approved', currentPlanetId: 'port', credits: 5000,
        inventory: [], equipmentSlots: {}, implantSlots: [], baseStats: { inventorySlots: 20, carryBase: 100 }
      } } },
      planets: { PLANETS: { port: {
        id: 'port', name: 'Порт Вольный', stockMarketEnabled: true,
        market: [{ itemId: 'medkit', enabled: true, appearanceChance: 100, minPrice: 120, maxPrice: 120 }, { itemId: 'vest', enabled: true, appearanceChance: 100, minPrice: 200, maxPrice: 200 }]
      } } },
      equipment: { EQUIPMENT: {
        vest: { id: 'vest', name: 'Защитный жилет', type: 'armor', inventoryWidth: 1, inventoryHeight: 1 },
        medkit: { id: 'medkit', name: 'Полевой медицинский набор', type: 'gear', rarity: 'редкий', mass: 1, inventoryWidth: 1, inventoryHeight: 1, desc: 'Комплект первой помощи для дальней экспедиции.' },
        stock_acme: { id: 'stock_acme', name: 'Консорциум «Гелиос»', type: 'stock', ticker: 'HLS', stockMinPrice: 85, stockMaxPrice: 85, desc: 'Акции энергетического консорциума.' }
      } },
      campaigns: { CAMPAIGNS: { test: { id: 'test', marketDate: '3616-09-21' } } }
    });
    App.state = makeDefaultState();
    App.state.users.p = normalizePlayerProfileV2(PLAYER_TEMPLATES.p);
    App.currentUserId = 'p';
    App.activeCampaignId = 'test';
    Sync.config = { enabled: false, campaignId: 'test' };
    UI.selectedPlanetId = 'port';
    document.getElementById('login-screen').classList.remove('open');
    document.getElementById('mod-market').classList.add('open');
    UI.renderMarket();
  });

  assert.equal(await page.locator('[data-market-category-v144]').count(), 3);
  await page.locator('[data-market-category-v144="Броня"]').click();
  assert.equal(await page.locator('[data-market-v1074][data-source="market"]').count(), 1);
  assert.equal(await page.locator('[data-market-v1074][data-item-id="vest"]').count(), 1);
  await page.locator('[data-market-category-v144="all"]').click();
  await page.locator('[data-market-v1074][data-item-id="medkit"]').click();
  const goodsMarkup = await page.locator('#market-items').innerHTML();
  assert.match(goodsMarkup, /data-market-quantity-v139/, goodsMarkup.slice(-2000));
  const goodsInput = page.locator('[data-market-qty-input-v139]');
  await goodsInput.fill('4');
  await goodsInput.dispatchEvent('input');
  assert.match(await page.locator('[data-market-qty-total-v139]').textContent(), /480/);
  assert.match(await page.locator('[data-market-action-v1074]').textContent(), /4 шт\./);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'v139-market-goods.png'), fullPage: true });

  await page.locator('[data-market-tab-v1074="stocks"]').click();
  assert.equal(await page.locator('[data-market-category-v144]').count(), 0);
  await page.locator('[data-market-v1074][data-item-id="stock_acme"]').click();
  const stockInput = page.locator('[data-market-qty-input-v139]');
  await stockInput.fill('12');
  await stockInput.dispatchEvent('input');
  assert.match(await page.locator('[data-market-qty-total-v139]').textContent(), /1.?020/);
  assert.match(await page.locator('[data-market-action-v1074]').textContent(), /12 акц\./);
  const style = await page.locator('.market-pane-v1071').first().evaluate(node => ({ radius: getComputedStyle(node).borderRadius, background: getComputedStyle(node).backgroundImage }));
  assert.equal(style.radius, '3px');
  assert.match(style.background, /193, 155, 94/, style.background);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'v139-market-stocks.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS Chromium: goods and stocks expose working quantity controls in the real desktop market');
} finally {
  await browser.close();
}
