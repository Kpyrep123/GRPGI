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
  await fs.mkdir("/tmp/skills176-shots", { recursive: true });
  const host = page.locator("[data-skill-catalog176]");
  await page.screenshot({ path: "/tmp/skills176-shots/desktop-catalog.png" });
  assert.equal(await host.locator(".sc-card176").count(), 121);
  assert.equal(await host.locator("text=СЕКРЕТНЫЙ НАВЫК").count(), 0);
  await host.locator('[data-sc-select="s0"]').click();
  assert.equal(await host.locator(".sc-rich176 p").count(), 2);
  assert.equal(
    await host.locator(".sc-rich176 strong").textContent(),
    "Второй абзац.",
  );
  assert.equal(
    await host.locator(".sc-rich176 script,.sc-rich176 img").count(),
    0,
  );
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(
    await page.evaluate(() =>
      GRPGSkillCatalogV176.rich("<strong>Текст</strong>"),
    ),
    "<strong>Текст</strong>",
  );
  assert.equal(
    await page.evaluate(() =>
      GRPGSkillCatalogV176.rich(
        '<a href="javascript:alert(1)" onclick="alert(1)">Текст</a>',
      ),
    ),
    "<a>Текст</a>",
  );
  await host.locator('[data-sc-mode="graph"]').first().click();
  assert.equal(await host.locator(".sc-card176").count(), 6);
  assert.equal(await host.locator("svg path").count(), 6);
  assert.equal(await host.locator('[data-tree-kind="ability"]').count(), 0);
  await host.locator("[data-sc-fit]").click();
  await host.locator('[data-sc-zoom="in"]').click();
  await host.locator("[data-sc-center]").click();
  await host.locator('[data-sc-mode="catalog"]').click();
  await host.locator("[data-sc-search]").fill("медицина");
  assert.equal(await host.locator(".sc-card176").count(), 6);
  await host.locator("[data-sc-ability]").selectOption("general");
  assert.equal(await host.locator(".sc-card176").count(), 5);
  await host.locator("[data-sc-reset]").click();
  await host.locator('[data-sc-select="s0"]').click();
  await host.locator("[data-sc-learn]").click();
  await page.waitForFunction(() => App.state.users.p.skills.includes("s0"));
  assert.equal(await page.evaluate(() => patches.length), 1);
  assert.equal(await page.evaluate(() => App.state.users.p.skillPoints), 9);
  assert.equal(
    await host.locator(".sc-detail176 h3").textContent(),
    "Медицина",
  );
  assert.equal(
    await host
      .locator('[data-sc-select="s1"]')
      .getAttribute("class")
      .then((s) => s.includes("available")),
    true,
  );
  await host.locator('[data-sc-select="s1"]').click();
  await host.locator('[data-sc-mode="graph"]').first().click();
  await fs.mkdir("/tmp/skills176-shots", { recursive: true });
  await page.screenshot({ path: "/tmp/skills176-shots/desktop-graph.png" });
  // World Config: typed tags, deduplication, card drafts, saved world and JSON export.
  await page.evaluate(() => {
    document.getElementById("profile-extra-modal-v50").classList.remove("open");
    App.currentUserId = "gm";
    document.getElementById("mod-config").classList.add("open");
    Configurator.selectedType = "skills";
    Configurator.selectedId = "s0";
    Configurator.render();
  });
  const form = page.locator("#config-editor-form"),
    picker = form.locator("[data-skill-tags176] + .checkbox-picker-v172");
  await picker.locator("[data-picker-search172]").fill("Новый тег");
  await picker.locator("[data-picker-add172]").click();
  assert.equal(
    await page.evaluate(() =>
      GRPGSkillModelV50.records.s0.tags.includes("Новый тег"),
    ),
    false,
  );
  await page.evaluate(() => Configurator.render());
  assert.equal(
    await form
      .locator('[name="skillTags176"]')
      .evaluate((s) =>
        [...s.selectedOptions].some((o) => o.value === "Новый тег"),
      ),
    true,
  );
  await form.locator('[type="submit"]').click();
  await page.waitForFunction(() =>
    saved.skills.SKILLS.s0.tags.includes("Новый тег"),
  );
  assert.deepEqual(
    await page.evaluate(() => saved.skills.SKILLS.s0.requiredSkillIds),
    [],
  );
  assert.equal(
    await page.evaluate(() => saved.skills.SKILLS.s4.requiredSkillIds[0]),
    "s3",
  );
  await page.evaluate(() => Configurator.render());
  assert.equal(
    await form
      .locator('[name="skillTags176"]')
      .evaluate((s) =>
        [...s.selectedOptions].some((o) => o.value === "Новый тег"),
      ),
    true,
  );
  const exported = await page.evaluate(() =>
    GRPGWorldJsonCodecV132.canonicalExportPayload(
      "skills",
      WORLD_SECTIONS,
      Configurator.buildPayload("skills"),
    ),
  );
  assert.ok(exported.SKILLS.s0.tags.includes("Новый тег"));
  assert.equal(exported.SKILLS.s0.description, skills.s0.description);
  // Small-screen layout is scrollable, with no document-level horizontal overflow.
  await page.evaluate(() => {
    document.getElementById("mod-config").classList.remove("open");
    App.currentUserId = "p";
    UI.renderProfile();
    document.getElementById("open-skills-v50").click();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/skills176-shots/desktop-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  // Actual web application, its real mutation queue and mocked server boundary.
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
  assert.equal(await host.locator(".sc-card176").count(), 121);
  await page.screenshot({ path: "/tmp/skills176-shots/web-catalog.png" });
  await host.locator('[data-sc-select="s0"]').click();
  assert.equal(await host.locator(".sc-rich176 p").count(), 2);
  await host.locator('[data-sc-mode="graph"]').first().click();
  assert.equal(await host.locator("svg path").count(), 6);
  await page.screenshot({ path: "/tmp/skills176-shots/web-graph.png" });
  page.on("dialog", (dialog) => dialog.accept());
  await host.locator("[data-sc-learn]").click();
  await page.waitForFunction(
    () =>
      !document.body.classList.contains("web-player-write-pending-v120") &&
      GRPGHubBridgeV153.currentPlayer().skills.includes("s0"),
  );
  assert.equal(webWrites, 1);
  assert.equal(serverRow.playerJson.skillPoints, 9);
  assert.equal(
    await host.locator(".sc-detail176 h3").textContent(),
    "Медицина",
  );
  await host.locator('[data-sc-select="s1"]').click();
  failNext = true;
  await host.locator("[data-sc-learn]").click();
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
  await host.locator('[data-sc-mode="catalog"]').click();
  await host.locator('[data-sc-select="s12"]').click();
  assert.equal(await host.locator(".sc-rich176 p").count(), 2);
  await host.locator('[data-sc-mode="graph"]').first().click();
  assert.equal(await host.locator(".sc-card176").count(), 1);
  assert.equal(await host.locator("svg path").count(), 0);
  await host.locator('[data-sc-mode="catalog"]').click();

  await page.evaluate(() => (GRPGHubBridgeV153.app.session.role = "guest"));
  await host.locator('[data-sc-mode="catalog"]').click();
  assert.equal(await host.locator("[data-sc-learn]").isDisabled(), true);
  assert.equal(
    await host.locator("[data-sc-upgrade]:not(:disabled)").count(),
    0,
  );
  await page.evaluate(() => (GRPGHubBridgeV153.app.session.role = "player"));
  await host.locator('[data-sc-mode="catalog"]').click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await host
      .locator(".sc-detail176")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/skills176-shots/web-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual desktop/web catalogue, 121 visible skills, hidden skill protection, filters, complete multi-parent graph, safe paragraphs/HTML, learning and unlock, WC typed/draft/saved tags + JSON, web purchase/failure rollback, narrow bounds and reduced motion",
  );
} finally {
  await browser.close();
}
