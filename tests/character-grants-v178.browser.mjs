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
skills.basic178 = {
  id: "basic178",
  name: "Базовая способность",
  isBasic: true,
  activationType: "active",
  cost: 99,
  visibility: { playerIds: [] },
  luaEnabled: true,
  luaScript: "function OnAbilityCast(self, params) end",
};
world.equipment.EQUIPMENT.kit = {
  id: "kit",
  name: "Медицинский набор",
  type: "equipment",
  weight: 0,
  width: 1,
  height: 1,
};
world.socialOrigins = {
  SOCIAL_ORIGINS: {
    doctor: {
      id: "doctor",
      name: "Врач",
      grantedSkillIds: ["s90"],
      grantedSkills: [
        {
          id: "heal",
          name: "Помощь врача",
          activationType: "active",
          luaEnabled: true,
          luaScript: "function OnAbilityCast(self, params) end",
        },
      ],
      startingItems: [{ itemId: "kit", qty: 2 }],
    },
  },
};
world.geographicOrigins = {
  GEOGRAPHIC_ORIGINS: { station: { id: "station", name: "Станция" } },
};
player.socialOriginId = "doctor";
player.geographicOriginId = "station";
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
  assert.equal(
    await host.locator('[data-r177-node="basic178"].owned').count(),
    1,
  );
  const privateId = await page.evaluate(() =>
    GRPGCharacterGrantsV178.inlineId("socialOrigins", "doctor", "heal"),
  );
  assert.equal(
    await host.locator(`[data-r177-node="${privateId}"].owned`).count(),
    1,
  );
  assert.equal(
    await page.evaluate(
      () =>
        normalizePlayerProfileV2(App.state.users.p).inventory
          .filter((i) => i.itemId === "kit")
          .reduce((sum, i) => sum + i.qty, 0),
    ),
    0,
  );
  assert.equal(
    await page.evaluate((id) => Data.getSkill(id).luaEnabled, privateId),
    true,
  );
  await page.screenshot({path:'/tmp/skills178.png'});
  // Upgrade a characteristic through the new visible panel.
  await host.locator("[data-r177-abilities]").first().click();
  assert.equal(await host.locator(".r177-ability-panel").isVisible(), true);
  await host.locator('[data-r177-upgrade="strength"]').click();
  await page.waitForFunction(
    () => App.state.users.p.abilityBase.strength === 2,
  );
  assert.equal(await page.evaluate(() => App.state.users.p.skillPoints), 8);
  // Private and existing grants use WC's normal save and draft pipeline.
  await page.evaluate(() => {
    document.getElementById("profile-extra-modal-v50").classList.remove("open");
    App.currentUserId = "gm";
    document.getElementById("mod-config").classList.add("open");
    Configurator.selectedType = "socialOrigins";
    Configurator.selectedId = "doctor";
    Configurator.render();
  });
  const form = page.locator("#config-editor-form");
  await form.locator('[data-picker-check172="s91"]').check();
  await form.locator("[data-add-private178]").click();
  await form
    .locator("[data-private-skill178]")
    .last()
    .locator('[data-field178="name"]')
    .fill("Полевой врач");
  await form
    .locator("[data-private-skill178]")
    .last()
    .locator('[data-field178="activationType"]')
    .selectOption("reaction");
  await form
    .locator("[data-private-skill178]")
    .last()
    .locator('[data-field178="description"]')
    .fill("<p>Первая строка</p><p>Вторая строка</p>");
  await form.locator('[data-starter-item178] [data-field178="qty"]').fill("3");
  await page.evaluate(() => Configurator.render());
  assert.equal(await form.locator("[data-private-skill178]").count(), 2);
  assert.equal(
    await form
      .locator("[data-private-skill178]")
      .last()
      .locator('[data-field178="name"]')
      .inputValue(),
    "Полевой врач",
  );
  assert.equal(
    await form
      .locator('[data-starter-item178] [data-field178="qty"]')
      .inputValue(),
    "3",
  );
  assert.equal(
    await form.locator('[data-picker-check172="s90"]').isChecked(),
    true,
  );
  assert.equal(
    await form.locator('[data-picker-check172="s91"]').isChecked(),
    true,
  );
  await form.locator('[type="submit"]').click();
  await page.waitForFunction(
    () => saved.socialOrigins.SOCIAL_ORIGINS.doctor.grantedSkills?.length === 2,
  );
  assert.deepEqual(
    await page.evaluate(
      () => saved.socialOrigins.SOCIAL_ORIGINS.doctor.grantedSkillIds,
    ),
    ["s90", "s91"],
  );
  assert.equal(
    await page.evaluate(
      () => saved.socialOrigins.SOCIAL_ORIGINS.doctor.startingItems[0].qty,
    ),
    3,
  );
  await page.evaluate(() => {
    Configurator.selectedType = "skills";
    Configurator.selectedId = "s110";
    Configurator.render();
  });
  await form.locator('[name="isBasic178"]').check();
  await form.locator('[type="submit"]').click();
  await page.waitForFunction(() => saved.skills.SKILLS.s110.isBasic === true);
  await page.evaluate(() => {
    applyWorldData(saved);
    Configurator.render();
  });
  assert.equal(await form.locator('[name="isBasic178"]').isChecked(), true);
  assert.equal(
    await page.evaluate(() =>
      normalizePlayerProfileV2(App.state.users.p).skills.includes("s110"),
    ),
    true,
  );
  assert.equal(
    await page.evaluate(() =>
      Object.keys(GRPGSkillModelV50.records).some((id) =>
        id.startsWith("grant178_"),
      ),
    ),
    false,
    "private skills never enter global WC list",
  );
  assert.equal(
    await page.evaluate(
      () =>
        GRPGWorldJsonCodecV132.canonicalExportPayload(
          "socialOrigins",
          WORLD_SECTIONS,
          Configurator.buildPayload("socialOrigins"),
        ).SOCIAL_ORIGINS.doctor.grantedSkills.length,
    ),
    2,
  );
  // Full web client: effective grants and real mutation persistence, without retroactive starting goods.
  await page.goto("https://web176.test/index.html", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.GRPGHubBridgeV153);
  await page.evaluate(
    ({ world, player }) => {
      const A = GRPGHubBridgeV153.app,
        G = GRPGCharacterGrantsV178;
      A.data.skills = new Map(Object.entries(world.skills.SKILLS));
      A.data.items = new Map(Object.entries(world.equipment.EQUIPMENT));
      A.data.socialOrigins = new Map(
        Object.entries(world.socialOrigins.SOCIAL_ORIGINS),
      );
      A.data.geographicOrigins = new Map(
        Object.entries(world.geographicOrigins.GEOGRAPHIC_ORIGINS),
      );
      for (const s of G.definitions(world)) A.data.skills.set(s.id, s);
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
  assert.equal(
    await host.locator('[data-r177-node="basic178"].owned').count(),
    1,
  );
  assert.equal(
    await host.locator(`[data-r177-node="${privateId}"].owned`).count(),
    1,
  );
  page.on("dialog", (dialog) => dialog.accept());
  await host.locator("[data-r177-abilities]").first().click();
  await host.locator('[data-r177-upgrade="strength"]').click();
  await page.waitForFunction(
    () =>
      !document.body.classList.contains("web-player-write-pending-v120") &&
      GRPGHubBridgeV153.currentPlayer().abilityBase.strength === 2,
  );
  assert.ok(serverRow.playerJson.skills.includes("basic178"));
  assert.ok(serverRow.playerJson.skills.includes(privateId));
  assert.equal(
    serverRow.playerJson.inventory.filter((i) => i.itemId === "kit").reduce((sum, i) => sum + i.qty, 0),
    0,
  );
  assert.equal(serverRow.playerJson.skillPoints, 8);
  await page.evaluate(() =>
    GRPGHubBridgeV153.commit((p) => {
      p.inventory = [];
    }, null),
  );
  assert.deepEqual(
    await page.evaluate(() => GRPGHubBridgeV153.currentPlayer().inventory),
    [],
  );
  assert.deepEqual(serverRow.playerJson.inventory, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/web retroactive basics, owned private skills and combat metadata; WC multiple skill grants, draft restoration and JSON export; visible characteristic upgrades through real mutation queue; existing profiles receive no retroactive starting goods",
  );
} finally {
  await browser.close();
}
