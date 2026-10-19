import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { chromium } = require(
    process.env.PLAYWRIGHT_CORE_PATH ||
      "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core",
  );
for (const f of [
  "registration-loadout-v179.js",
  "registration-loadout-v179.css",
])
  assert.equal(
    await fs.readFile("renderer/" + f, "utf8"),
    await fs.readFile("deploy/site/app/" + f, "utf8"),
  );
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/tmp/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const image =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="8" y="8" width="48" height="48" rx="8" fill="#bb9750"/></svg>',
  ).toString("base64");
const mod = (target, value) => ({
  id: target,
  target,
  value,
  op: "add",
  scope: "global",
  condition: "always",
  enabled: true,
});
const items = {
  rifle: {
    name: "Карабин",
    type: "weapon",
    weaponSlot: "versatile",
    inventoryWidth: 2,
    inventoryHeight: 3,
    mass: 3,
    damage: 2,
    range: 20,
  },
  pistol: {
    name: "Пистолет",
    type: "weapon",
    weaponSlot: "versatile",
    inventoryWidth: 2,
    inventoryHeight: 1,
    mass: 1,
  },
  armor: {
    name: "Бронежилет",
    type: "armor",
    inventoryWidth: 2,
    inventoryHeight: 3,
    mass: 2,
  },
  bag: {
    name: "Рюкзак",
    type: "backpack",
    inventoryWidth: 2,
    inventoryHeight: 2,
    mass: 1,
    modifiers: [mod("inventory_slots", 10), mod("carry_capacity", 10)],
  },
  kit: {
    name: "Аптечка",
    type: "gear",
    inventoryWidth: 2,
    inventoryHeight: 1,
    mass: 1,
  },
  ammo: {
    name: "Патроны",
    type: "ammo",
    inventoryWidth: 1,
    inventoryHeight: 1,
    mass: 0.1,
    stackable: true,
    stackLimit: 20,
  },
  heavy: {
    name: "Тяжёлый контейнер",
    type: "gear",
    inventoryWidth: 4,
    inventoryHeight: 4,
    mass: 20,
  },
};
for (const [id, item] of Object.entries(items))
  Object.assign(item, {
    id,
    image,
    creationCost: 1,
    availableAsStarting: true,
    visibility: { campaignIds: ["main"], playerIds: [], eraIds: [] },
    desc: `<p>Описание: ${item.name}</p>`,
  });
const world = {
  campaigns: {
    CAMPAIGNS: {
      main: {
        id: "main",
        name: "Основная",
        era: "technological",
        availableNow: true,
      },
      other: {
        id: "other",
        name: "Другая",
        era: "medieval",
        availableNow: true,
      },
    },
  },
  equipment: { EQUIPMENT: items },
  skills: {
    SKILLS: {
      basic: {
        id: "basic",
        name: "Базовая способность",
        isBasic: true,
        description: "<p>Базовый навык</p>",
        image,
      },
      known: {
        id: "known",
        name: "Подготовка",
        description:
          "<p>Первый абзац</p><p>Второй абзац</p><script>window.injected179=1</script>",
        image,
      },
    },
  },
  socialOrigins: {
    SOCIAL_ORIGINS: {
      tech: {
        id: "tech",
        name: "Техник",
        visibility: { campaignIds: ["main"] },
        grantedSkillIds: ["known"],
        grantedSkills: [
          {
            id: "repair",
            name: "Ремонт",
            activationType: "active",
            description: "<p>Чинит устройство.</p>",
            image,
          },
        ],
        startingItems: [{ itemId: "kit", qty: 2 }],
      },
    },
  },
  geographicOrigins: {
    GEOGRAPHIC_ORIGINS: {
      station: {
        id: "station",
        name: "Станция",
        visibility: { campaignIds: ["main"] },
        abilityBonuses: { strength: 1 },
        startingItems: [{ itemId: "ammo", qty: 25 }],
      },
      empty: {
        id: "empty",
        name: "Без снаряжения",
        visibility: { campaignIds: ["main"] },
      },
    },
  },
  players: {
    PLAYER_TEMPLATES: { gm: { id: "gm", role: "gm", displayName: "DM" } },
  },
  planets: { PLANETS: {} },
};
try {
  for (const kind of ["desktop", "web"]) {
    let submitted = null;
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/grpgi/character-applications/submit") {
        const body = route.request().postDataJSON();
        submitted = body.playerJson;
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            row: {
              id: "row",
              campaignId: "main",
              playerId: submitted.id,
              version: 1,
              playerJson: submitted,
            },
          }),
        });
      }
      if (url.pathname === "/api/grpgi/character-applications")
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            rows: submitted
              ? [
                  {
                    id: "row",
                    campaignId: "main",
                    playerId: submitted.id,
                    version: 1,
                    playerJson: submitted,
                  },
                ]
              : [],
          }),
        });
      if (url.hostname !== "reg179.test")
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"message":"fixture offline"}',
        });
      const base = kind === "desktop" ? "renderer" : "deploy/site/app",
        file = path.resolve(
          base,
          decodeURIComponent(url.pathname.slice(1)) || "index.html",
        );
      if (
        !file.startsWith(path.resolve(base) + path.sep) ||
        !/[.](js|css|html)$/.test(file)
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
    await page.addInitScript(
      ({ kind }) => {
        window.setInterval = () => 0;
        if (kind === "desktop") {
          const wa = window.addEventListener.bind(window),
            da = document.addEventListener.bind(document);
          window.addEventListener = (type, ...args) =>
            type === "load" ? undefined : wa(type, ...args);
          document.addEventListener = (type, ...args) =>
            type === "DOMContentLoaded" ? undefined : da(type, ...args);
          window.electronAPI = {
            appVersion: "1.0.155",
            debugLog: async () => {},
            submitCharacterApplication: async ({ player }) => {
              window.submitted179 = structuredClone(player);
              return {
                ok: true,
                row: { playerId: player.id, version: 1, player },
              };
            },
          };
        }
      },
      { kind },
    );
    await page.goto("https://reg179.test/index.html", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      (kind) =>
        window.GRPGRegistrationLoadoutV179 &&
        (kind === "desktop"
          ? window.GRPGRegistrationBridgeV179
          : window.GRPGHubBridgeV153),
      kind,
    );
    await page.evaluate(
      ({ kind, world }) => {
        if (kind === "desktop") {
          applyWorldData(world);
          App.state = makeDefaultState();
          App.currentUserId = null;
          App.activeCampaignId = "main";
          App._writeLocalMirrorsV135 = async () => ({ ok: true });
          App.fillLoginSelect = () => {};
          App.renderLive = () => {};
          PlayerSync.shouldIsolateUsersFromSnapshot = () => true;
          Sync.config = { enabled: true, campaignId: "main" };
          document.querySelector("#login-screen").classList.add("open");
          document.querySelector("#login-auth-panel").hidden = false;
        } else {
          const A = GRPGHubBridgeV153.app;
          A.data.items = new Map(Object.entries(world.equipment.EQUIPMENT));
          A.data.skills = new Map(Object.entries(world.skills.SKILLS));
          for (const s of GRPGCharacterGrantsV178.definitions(world))
            A.data.skills.set(s.id, s);
          A.data.socialOrigins = new Map(
            Object.entries(world.socialOrigins.SOCIAL_ORIGINS),
          );
          A.data.geographicOrigins = new Map(
            Object.entries(world.geographicOrigins.GEOGRAPHIC_ORIGINS),
          );
          A.data.campaigns = new Map(Object.entries(world.campaigns.CAMPAIGNS));
          A.cache.snapshot = { world_json: world, state_json: {} };
          A.ui.boot = "login";
          A.ui.selectedCampaignId = "main";
          document.querySelector("#login-screen").classList.remove("hidden");
          document
            .querySelector("#login-auth-panel")
            ?.classList.remove("hidden");
        }
      },
      { kind, world },
    );
    await page
      .locator(
        kind === "desktop"
          ? "#register-character-btn-v1052"
          : "#register-open-v1052",
      )
      .click();
    const form = page.locator(
        kind === "desktop"
          ? "#registration-form-v1052"
          : "#register-form-v1052",
      ),
      host = form.locator("[data-registration-loadout179]");
    const current = () =>
      page.evaluate(() =>
        GRPGRegistrationLoadoutV179.player(
          document.querySelector(
            "#registration-form-v1052,#register-form-v1052",
          ),
        ),
      );
    assert.equal(await host.locator(".reg179-skills details").count(), 1);
    await form
      .locator(".origin-choice-title-v1054")
      .filter({ hasText: "Техник" })
      .click();
    await form
      .locator(".origin-choice-title-v1054")
      .filter({ hasText: "Станция" })
      .click();
    assert.equal(await host.locator(".reg179-skills details").count(), 3);
    assert.match(
      await form.locator("[data-origin-gifts179]").first().textContent(),
      /Подготовка.*Ремонт.*Аптечка/s,
    );
    await host
      .locator(".reg179-skills summary")
      .filter({ hasText: "Подготовка" })
      .click();
    assert.equal(
      await host.locator(".reg179-skills details[open] p").count(),
      2,
    );
    assert.equal(await page.evaluate(() => window.injected179), undefined);
    // Select through the existing equipment detail modal, not just hidden form controls.
    await form
      .locator('[data-registration-equipment-card-v1072][data-item-id="rifle"]')
      .click();
    await page.locator("[data-registration-equipment-select-v1072]").click();
    for (const id of ["pistol", "armor", "bag"])
      await form
        .locator(`[name="startingEquipmentIds"][value="${id}"]`)
        .evaluate((n) => {
          n.checked = true;
          n.dispatchEvent(new Event("change", { bubbles: true }));
        });
    let p = await current();
    assert.deepEqual(p.equipmentSlots, {
      primaryWeapon: "rifle",
      secondaryWeapon: "pistol",
      armor: "armor",
      backpack: "bag",
    });
    assert.equal(p.inventorySize, 22);
    assert.equal(p.carryWeightMax, 24);
    assert.equal(p.baseStats.hpBase, 10);
    assert.equal(p.inventory.find((r) => r.itemId === "kit").qty, 2);
    assert.equal(p.inventory.find((r) => r.itemId === "ammo").qty, 25);
    assert.equal(
      await host.locator('.reg179-grid [data-item-id="ammo"]').count(),
      2,
      "stacked goods share profile layout rules",
    );
    await host
      .locator("[data-reg179-grid]")
      .evaluate((n) => n.scrollIntoView({ block: "center" }));
    const kit0 = host.locator(
      '[data-reg179-item][data-source="grid"][data-item-id="kit"][data-unit-index="0"]',
    );
    await kit0.dragTo(host.locator('[data-reg179-cell="13"]'), {
      sourcePosition: { x: 8, y: 8 },
      targetPosition: { x: 10, y: 10 },
    });
    assert.deepEqual(
      (await current()).inventory.find((r) => r.itemId === "kit").positions[0],
      { x: 3, y: 2 },
    );
    // Keyboard/tap movement uses the same validation as drag and drop.
    await host
      .locator(
        '[data-reg179-item][data-source="grid"][data-item-id="kit"][data-unit-index="1"]',
      )
      .click();
    await host.locator('[data-reg179-cell="15"]').press("Enter");
    assert.deepEqual(
      (await current()).inventory.find((r) => r.itemId === "kit").positions[1],
      { x: 0, y: 3 },
    );
    // Occupied targets reject a move rather than silently rearranging another item.
    await kit0.click();
    await host.locator('[data-reg179-cell="15"]').press("Enter");
    assert.match(await host.locator('[role="status"]').textContent(), /заняты/);
    assert.deepEqual(
      (await current()).inventory.find((r) => r.itemId === "kit").positions[0],
      { x: 3, y: 2 },
    );
    await host.locator("[data-reg179-close]").click();
    await host
      .locator(".reg179-slots")
      .evaluate((n) => n.scrollIntoView({ block: "center" }));
    await host
      .locator('[data-reg179-slot="primaryWeapon"] [data-reg179-item]')
      .dragTo(host.locator('[data-reg179-slot="secondaryWeapon"]'));
    assert.deepEqual((await current()).equipmentSlots, {
      primaryWeapon: "pistol",
      secondaryWeapon: "rifle",
      armor: "armor",
      backpack: "bag",
    });
    await host
      .locator('[data-reg179-slot="armor"] [data-reg179-item]')
      .dragTo(host.locator('[data-reg179-slot="primaryWeapon"]'));
    assert.match(
      await host.locator('[role="status"]').textContent(),
      /не подходит/,
    );
    assert.equal((await current()).equipmentSlots.armor, "armor");
    // An unrelated quantity change preserves the explicitly positioned originals.
    await form
      .locator('[name="startingEquipmentIds"][value="kit"]')
      .evaluate((n) => {
        n.checked = true;
        n.dispatchEvent(new Event("change", { bubbles: true }));
      });
    p = await current();
    assert.equal(p.inventory.find((r) => r.itemId === "kit").qty, 3);
    assert.deepEqual(p.inventory.find((r) => r.itemId === "kit").positions[0], {
      x: 3,
      y: 2,
    });
    await form
      .locator('[name="startingEquipmentIds"][value="kit"]')
      .evaluate((n) => {
        n.checked = false;
        n.dispatchEvent(new Event("change", { bubbles: true }));
      });
    // Removing a backpack is rejected when its capacity is still needed.
    await host
      .locator('[data-reg179-slot="secondaryWeapon"] [data-reg179-item]')
      .click();
    await host.locator("[data-reg179-unequip]").click();
    await host
      .locator('[data-reg179-slot="backpack"] [data-reg179-item]')
      .click();
    await host.locator("[data-reg179-unequip]").click();
    assert.equal((await current()).equipmentSlots.backpack, "bag");
    assert.match(await host.locator('[role="status"]').textContent(), /ячеек/);
    await host
      .locator('[data-reg179-item][data-source="grid"][data-item-id="rifle"]')
      .click();
    await host.locator('[data-reg179-equip="secondaryWeapon"]').click();
    await host
      .locator('[data-reg179-slot="backpack"] [data-reg179-item]')
      .click();
    await host.locator("[data-reg179-unequip]").click();
    assert.equal((await current()).inventorySize, 12);
    assert.equal((await current()).equipmentSlots.backpack, "");
    await form
      .locator('[name="startingEquipmentIds"][value="kit"]')
      .evaluate((n) => {
        n.checked = true;
        n.dispatchEvent(new Event("change", { bubbles: true }));
      });
    assert.equal(
      (await current()).equipmentSlots.backpack,
      "",
      "manual unequipping survives unrelated selection changes",
    );
    await form
      .locator('[name="startingEquipmentIds"][value="kit"]')
      .evaluate((n) => {
        n.checked = false;
        n.dispatchEvent(new Event("change", { bubbles: true }));
      });
    await host
      .locator('[data-reg179-item][data-source="grid"][data-item-id="bag"]')
      .click();
    await host.locator('[data-reg179-equip="backpack"]').click();
    assert.equal((await current()).inventorySize, 22);
    // Weight/space errors block submission and recover when deselected.
    await form
      .locator('[name="startingEquipmentIds"][value="heavy"]')
      .evaluate((n) => {
        n.checked = true;
        n.dispatchEvent(new Event("change", { bubbles: true }));
      });
    assert.equal(await form.locator('[type="submit"]').isDisabled(), true);
    assert.match(
      await host.locator('[role="status"]').textContent(),
      /вес|помещается/,
    );
    await form
      .locator('[name="startingEquipmentIds"][value="heavy"]')
      .evaluate((n) => {
        n.checked = false;
        n.dispatchEvent(new Event("change", { bubbles: true }));
      });
    assert.equal(await form.locator('[type="submit"]').isDisabled(), false);
    await host.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/registration179-${kind}.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await host
      .locator("[data-reg179-grid]")
      .evaluate((n) => n.scrollIntoView({ block: "center" }));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.screenshot({
      path: `/tmp/registration179-${kind}-full-mobile.png`,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await form.locator('[name="displayName"]').fill("Новый персонаж");
    await form.locator('[name="pass"]').fill("test179");
    await form.locator('[name="pass2"]').fill("test179");
    const intended = await current();
    await form.locator('[type="submit"]').click();
    if (kind === "desktop") {
      await page.waitForFunction(() => window.submitted179);
      submitted = await page.evaluate(() => window.submitted179);
    } else
      await page.waitForFunction(() =>
        document
          .querySelector("#register-status-v1052")
          .textContent.includes("Анкета сохранена"),
      );
    assert.equal(submitted.displayName, "Новый персонаж");
    assert.equal(submitted.pass, "test179");
    assert.equal(submitted.approvalStatus, "pending");
    assert.match(submitted.id, /^новы[ий]_персонаж_/);
    assert.deepEqual(submitted.campaignIds, ["main"]);
    assert.deepEqual(submitted.equipmentSlots, intended.equipmentSlots);
    assert.deepEqual(submitted.inventory, intended.inventory);
    assert.deepEqual(submitted.skills, intended.skills);
    assert.deepEqual(submitted.characterGrants178, intended.characterGrants178);
    assert.equal(submitted.inventorySize, 22);
    assert.equal(submitted.baseStats.inventorySlots, 12);
    assert.equal(submitted.inventory.find((r) => r.itemId === "kit").qty, 2);
    // The submitted profile reloads with the same equipment/positions/capacity, without another grant.
    const reloaded = await page.evaluate(
      ({ p, kind }) => {
        if (kind === "desktop") return normalizePlayerProfileV2(p);
        const A = GRPGHubBridgeV153.app;
        A.data.players.set(p.id, p);
        A.session = { userId: p.id };
        return GRPGHubBridgeV153.currentPlayer();
      },
      { p: submitted, kind },
    );
    assert.deepEqual(reloaded.equipmentSlots, intended.equipmentSlots);
    assert.deepEqual(reloaded.inventory, intended.inventory);
    assert.equal(reloaded.inventorySize, 22);
    // A new campaign clears no-longer-available choices and their derived grants.
    await form.locator('[name="campaignId"]').selectOption("other");
    assert.equal(await form.locator('[name="socialOriginId"]').count(), 0);
    assert.equal(
      await form.locator('[name="startingEquipmentIds"]').count(),
      0,
    );
    assert.equal(await host.locator(".reg179-skills details").count(), 1);
    assert.equal((await current()).inventory.length, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await host.scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.screenshot({ path: `/tmp/registration179-${kind}-mobile.png` });
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${kind}: origin/basic/private skill and goods previews; auto-equipment and backpack capacity; drag/tap/keyboard placement, swap/rejection; stack quantities; capacity validation; actual application payload/reload preserves identity, pending approval, grants and layout`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
