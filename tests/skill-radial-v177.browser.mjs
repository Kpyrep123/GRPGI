import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { chromium } = require(
    process.env.PLAYWRIGHT_CORE_PATH ||
      "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core",
  );
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/tmp/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const skills = Object.fromEntries(
  Array.from({ length: 120 }, (_, i) => [
    "s" + i,
    {
      id: "s" + i,
      name:
        i === 0
          ? "Медицина"
          : i === 1
            ? "Полевая медицина"
            : "Навык " + String(i).padStart(3, "0"),
      cost: 1,
      tags: i < 5 ? ["Медицина", "Общие"] : ["Боевые"],
      description:
        i === 0
          ? '<p>Первый абзац.</p><p><strong>Второй абзац.</strong></p><ul><li>Пункт</li></ul><img src=x onerror="window.injected=1"><script>window.injected=2</script>'
          : "Первая строка\n\nВторой абзац",
      requiredSkillIds: i > 0 && i < 5 ? ["s" + (i - 1)] : [],
      requiredAbilities: i === 4 ? [{ key: "intelligence", value: 3 }] : [],
      activationType: "passive",
      visibility: { playerIds: ["p"] },
      treePos: { x: i * 1000, y: 6000 },
    },
  ]),
);
skills.multi = {
  id: "multi",
  name: "Совместная подготовка",
  cost: 3,
  tags: ["Медицина"],
  visibility: { playerIds: ["p"] },
  requiredSkillIds: ["s1", "s2"],
  description: "Объединяет две ветки",
};
skills.secret = {
  id: "secret",
  name: "СЕКРЕТНЫЙ НАВЫК",
  cost: 1,
  visibility: { playerIds: ["other"] },
};
// Six named sectors, two short chains each; many general skills stay in the side bank.
const keys = [
  "strength",
  "dexterity",
  "intelligence",
  "will",
  "endurance",
  "glory",
];
const names = [
  ["Силовая техника", "Пробивающий удар", "Добыча", "Контрудар", "Серия"],
  ["Точность", "Быстрая перезарядка", "Подвижный", "Уклонение", "Снайпер"],
  [
    "Техническая подготовка",
    "Инженерия",
    "Дроновод",
    "Анализ",
    "Мастер систем",
  ],
  [
    "Выдержка",
    "Сосредоточенность",
    "Стальная воля",
    "Лидерство",
    "Командование",
  ],
  ["Закалка", "Дальний марш", "Живучесть", "Резерв", "Непоколебимость"],
  ["Признание", "Репутация", "Союзники", "Влияние", "Легенда"],
];
for (let i = 5; i < 65; i++) {
  const group = Math.floor((i - 5) / 10),
    step = (i - 5) % 5;
  skills["s" + i].requiredAbilities = step
    ? []
    : [{ key: keys[group], value: 1 }];
  skills["s" + i].requiredSkillIds = step ? ["s" + (i - 1)] : [];
  skills["s" + i].name = names[group][step] + ((i - 5) % 10 >= 5 ? " II" : "");
}
skills.s0.treeBranch = "intelligence";
skills.s65.treeBranch = "common";
skills.s65.requiredSkillIds = ["s5"];
skills.s65.name = "Общая подготовка";
const player = {
  id: "p",
  displayName: "Игрок",
  role: "player",
  inventory: [],
  skills: [],
  skillPoints: 10,
  abilities: {
    strength: 1,
    dexterity: 1,
    intelligence: 1,
    endurance: 1,
    will: 1,
    glory: 0,
  },
  abilityBase: {
    strength: 1,
    dexterity: 1,
    intelligence: 1,
    endurance: 1,
    will: 1,
    glory: 0,
  },
  campaignIds: ["main"],
};
const world = {
  players: {
    PLAYER_TEMPLATES: {
      p: player,
      gm: { ...player, id: "gm", role: "gm", displayName: "DM" },
    },
  },
  skills: { SKILLS: skills },
  equipment: { EQUIPMENT: {} },
  planets: { PLANETS: {} },
};
let serverRow = null,
  webWrites = 0,
  failNext = false;
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(30000);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (serverRow && url.pathname === "/api/grpgi/players/mutate") {
      if (failNext) {
        failNext = false;
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: '{"ok":false,"message":"fixture mutation failure"}',
        });
      }
      const body = route.request().postDataJSON();
      assert.equal(body.baseVersion, serverRow.version);
      serverRow = {
        ...serverRow,
        version: serverRow.version + 1,
        playerJson: body.player,
      };
      webWrites++;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, row: serverRow }),
      });
    }
    if (serverRow && url.pathname.includes("/campaign_players/records"))
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [serverRow],
          page: 1,
          totalPages: 1,
          totalItems: 1,
          perPage: 1,
        }),
      });
    if (!["desktop176.test", "web176.test"].includes(url.hostname))
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"message":"fixture offline"}',
      });
    const base =
        url.hostname === "desktop176.test" ? "renderer" : "deploy/site/app",
      file = path.resolve(
        base,
        decodeURIComponent(url.pathname.slice(1)) || "index.html",
      );
    if (
      !file.startsWith(path.resolve(base) + path.sep) ||
      !/[.](html|css|js)$/.test(file)
    )
      return route.abort();
    try {
      await route.fulfill({
        body: await fs.readFile(file),
        contentType: file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "text/html",
      });
    } catch {
      await route.abort();
    }
  });
  await page.addInitScript(() => {
    window.setInterval = () => 0;
    if (location.hostname === "desktop176.test") {
      const wa = window.addEventListener.bind(window),
        da = document.addEventListener.bind(document);
      window.addEventListener = (t, ...a) =>
        t === "load" ? undefined : wa(t, ...a);
      document.addEventListener = (t, ...a) =>
        t === "DOMContentLoaded" ? undefined : da(t, ...a);
      window.electronAPI = {
        appVersion: "1.0.155",
        debugLog: async () => {},
        saveWorldData: async (w) => {
          window.saved = structuredClone(w);
          return { ok: true, world: saved };
        },
        loadWorldData: async () => ({ ok: true, world: window.saved }),
      };
    }
  });
  await page.goto("https://desktop176.test/", {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate((world) => {
    window.saved = world;
    applyWorldData(world);
    App.state = makeDefaultState();
    App.currentUserId = "p";
    App.activeCampaignId = "main";
    App._writeLocalMirrorsV135 = async () => ({ ok: true });
    App.renderLive = () => {};
    Sync.config = { enabled: false };
    Sync.pushCurrentSnapshot = async () => ({ ok: true, status: "disabled" });
    Persistence.save = async () => ({ ok: true });
    window.patches = [];
    PlayerSync.pushPlayerPatch = async (id, patch) => {
      patches.push({ id, patch: structuredClone(patch) });
      return { ok: true, status: "disabled" };
    };
    requestConfirmationV1090 = async () => true;
    document.getElementById("login-screen").classList.remove("open");
    UI.renderProfile();
    document.getElementById("open-skills-v50").click();
  }, world);

  const host = page.locator("[data-skill-catalog176]");
  await fs.mkdir("/tmp/skills177-shots", { recursive: true });
  assert.equal(await host.locator("[data-r177-node]").count(), 121);
  assert.equal(await host.locator(".r177-hub").count(), 6);
  assert.equal(await host.locator(".sc-grid176,.sc-card176").count(), 0);
  assert.equal(await host.locator(".r177-detail").isVisible(), false);
  assert.equal(await host.locator("text=СЕКРЕТНЫЙ НАВЫК").count(), 0);
  await page.screenshot({ path: "/tmp/skills177-shots/desktop-tree.png" });
  const choose = async (id) => {
    const name = await page.evaluate(
      (id) => GRPGSkillModelV50.records[id]?.name || id,
      id,
    );
    await host.locator("[data-r177-search]").fill(name);
    await host.locator(`[data-r177-result="${id}"]`).first().click();
  };
  await choose("s0");
  assert.equal(await host.locator(".sc-rich176 p").count(), 2);
  assert.equal(
    await host.locator(".sc-rich176 script,.sc-rich176 img").count(),
    0,
  );
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await host.locator("[data-r177-learn]").click();
  await page.waitForFunction(() => App.state.users.p.skills.includes("s0"));
  assert.equal(await page.evaluate(() => App.state.users.p.skillPoints), 9);
  assert.equal(await page.evaluate(() => patches.length), 1);
  assert.ok(
    (
      await host.locator('[data-r177-node="s1"]').getAttribute("class")
    ).includes("available"),
  );
  await choose("s1");
  await page.screenshot({ path: "/tmp/skills177-shots/desktop-detail.png" });
  await host.locator("[data-r177-close]").click();
  await host.locator("[data-r177-search]").fill("");
  await host.locator('[data-r177-branch="strength"]').first().click();
  const oldTransform = await host.locator(".r177-world").getAttribute("style");
  const view = await host.locator(".r177-viewport").boundingBox();
  await page.mouse.move(view.x + 30, view.y + 70);
  await page.mouse.down();
  await page.mouse.move(view.x + 100, view.y + 95);
  await page.mouse.up();
  assert.notEqual(
    await host.locator(".r177-world").getAttribute("style"),
    oldTransform,
  );
  const oldScale = await host.locator("[data-r177-scale]").textContent();
  await host.locator('[data-r177-zoom="in"]').click();
  assert.notEqual(
    await host.locator("[data-r177-scale]").textContent(),
    oldScale,
  );
  await choose("s65");
  await host.locator('[data-r177-node="s65"]').scrollIntoViewIfNeeded();
  await host.locator('.r177-detail [data-r177-result="s5"]').click();
  await page.waitForFunction(
    () =>
      !!document.querySelector('.r177-map-lines [data-r177-edge="s5|s65"]'),
  );
  await host.locator("[data-r177-close]").click();
  await host.locator("[data-r177-fit]").last().click();
  await host.locator("[data-r177-filters]").first().click();
  await host.locator('[data-picker-check172="Медицина"]').check();
  assert.ok((await host.locator(".r177-node.filtered").count()) > 0);
  assert.equal(await host.locator("[data-r177-node]").count(), 121);
  await host.locator("[data-r177-reset]").click();
  // WC explicit placement is independent of requirements and round-trips JSON/reload.
  await page.evaluate(() => {
    document.getElementById("profile-extra-modal-v50").classList.remove("open");
    App.currentUserId = "gm";
    document.getElementById("mod-config").classList.add("open");
    Configurator.selectedType = "skills";
    Configurator.selectedId = "s1";
    Configurator.render();
  });
  const form = page.locator("#config-editor-form");
  await form.locator('[name="treeBranch177"]').selectOption("common");
  await form.locator('[type="submit"]').click();
  await page.waitForFunction(
    () => saved.skills.SKILLS.s1.treeBranch === "common",
  );
  assert.deepEqual(
    await page.evaluate(() => saved.skills.SKILLS.s1.requiredSkillIds),
    ["s0"],
  );
  await page.evaluate(() => {
    applyWorldData(saved);
    Configurator.render();
  });
  assert.equal(
    await form.locator('[name="treeBranch177"]').inputValue(),
    "common",
  );
  assert.equal(
    await page.evaluate(
      () =>
        GRPGWorldJsonCodecV132.canonicalExportPayload(
          "skills",
          WORLD_SECTIONS,
          Configurator.buildPayload("skills"),
        ).SKILLS.s1.treeBranch,
    ),
    "common",
  );
  await page.evaluate(() => {
    document.getElementById("mod-config").classList.remove("open");
    App.currentUserId = "p";
    UI.renderProfile();
    document.getElementById("open-skills-v50").click();
  });
  await host.locator("[data-r177-search]").fill("");
  await host.locator("[data-r177-common-toggle]").first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/skills177-shots/desktop-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  // Actual web application and optimistic mutation queue with a fake server boundary.
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("https://web176.test/index.html", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.GRPGHubBridgeV153);
  await page.evaluate(
    ({ world, player }) => {
      const A = GRPGHubBridgeV153.app;
      A.data.skills = new Map(Object.entries(world.skills.SKILLS));
      A.data.players.set("p", player);
      A.session = { userId: "p", role: "player", campaignId: "main" };
      A.ui.boot = "app";
      A.ui.screen = "profile";
      document.getElementById("login-screen").classList.add("hidden");
      document.getElementById("app-shell").classList.remove("hidden");
    },
    { world, player },
  );
  serverRow = {
    id: "row",
    campaignId: "main",
    playerId: "p",
    version: 0,
    playerJson: structuredClone(player),
  };
  await page.locator('[data-screen="profile"]').click();
  await page.locator('[data-action="profile-tab"][data-tab="skills"]').click();
  assert.equal(await host.locator("[data-r177-node]").count(), 121);
  await page.screenshot({ path: "/tmp/skills177-shots/web-tree.png" });
  await host.locator("[data-r177-search]").fill("Медицина");
  await host.locator('[data-r177-result="s0"]').click();
  page.on("dialog", (dialog) => dialog.accept());
  await host.locator("[data-r177-learn]").click();
  await page.waitForFunction(
    () =>
      !document.body.classList.contains("web-player-write-pending-v120") &&
      GRPGHubBridgeV153.currentPlayer().skills.includes("s0"),
  );
  assert.equal(webWrites, 1);
  assert.equal(serverRow.playerJson.skillPoints, 9);
  await host.locator("[data-r177-search]").fill("Полевая медицина");
  await host.locator('[data-r177-result="s1"]').click();
  failNext = true;
  await host.locator("[data-r177-learn]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#toast-stack")
      .textContent.includes("fixture mutation failure"),
  );
  assert.equal(webWrites, 1);
  assert.equal(
    await page.evaluate(() => GRPGHubBridgeV153.currentPlayer().skillPoints),
    9,
  );
  assert.equal(
    await page.evaluate(() =>
      GRPGHubBridgeV153.currentPlayer().skills.includes("s1"),
    ),
    false,
  );
  await page.evaluate(() => (GRPGHubBridgeV153.app.session.role = "guest"));
  await host.locator("[data-r177-common-toggle]").first().click();
  assert.equal(await host.locator("[data-r177-learn]").isDisabled(), true);
  assert.equal(
    await host.locator("[data-r177-upgrade]:not(:disabled)").count(),
    0,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await host
      .locator(".r177-detail")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none",
  );
  await host.locator("[data-r177-close]").click();
  await host.locator("[data-r177-search]").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/skills177-shots/web-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real desktop/web radial UI, six sectors and side bank, no catalogue columns, search/focus/filter/pan/zoom, safe details, purchases/unlock, WC branch JSON/reload, real web rollback, guests, mobile bounds and reduced motion",
  );
} finally {
  await browser.close();
}
