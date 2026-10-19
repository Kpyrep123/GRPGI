import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
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
let server = null,
  attempts = 0,
  failAt = 0;
const writes = [];
try {
  const page = await browser.newPage({
      viewport: { width: 1900, height: 916 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Real init binds navigation after this async service-worker cleanup, reproducing the observed ordering.
  await page.addInitScript(() => {
    if (navigator.serviceWorker)
      Object.defineProperty(navigator.serviceWorker, "getRegistrations", {
        value: () =>
          new Promise((resolve) => setTimeout(() => resolve([]), 300)),
      });
  });
  await page.route("https://sync.grpg-sync.ru/**", async (route) => {
    const url = new URL(route.request().url());
    if (server && url.pathname === "/api/grpgi/players/mutate") {
      attempts++;
      if (attempts === failAt)
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: "fixture save failure" }),
        });
      const body = route.request().postDataJSON();
      assert.equal(body.baseVersion, server.version);
      server = {
        ...server,
        version: server.version + 1,
        playerJson: body.player,
      };
      writes.push(structuredClone(server.playerJson.hubState));
      await new Promise((r) => setTimeout(r, 40));
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, row: server }),
      });
    }
    if (server && url.pathname.includes("/campaign_players/records"))
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [server],
          totalItems: 1,
          totalPages: 1,
          page: 1,
          perPage: 1,
        }),
      });
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"message":"fixture offline"}',
    });
  });
  await page.route("https://web168.test/**", async (route) => {
    const relative =
        "deploy/site/app" +
        decodeURIComponent(new URL(route.request().url()).pathname),
      file = path.resolve(relative);
    if (!file.startsWith(path.resolve("deploy/site/app") + path.sep))
      return route.abort();
    try {
      const body = process.env.SOURCE_REF
        ? execFileSync(
            "git",
            ["show", process.env.SOURCE_REF + ":" + relative],
            { stdio: ["ignore", "pipe", "ignore"] },
          )
        : await fs.readFile(file);
      const ext = path.extname(file);
      await route.fulfill({
        body,
        contentType:
          ext === ".html"
            ? "text/html"
            : ext === ".js"
              ? "text/javascript"
              : ext === ".css"
                ? "text/css"
                : "application/octet-stream",
      });
    } catch {
      await route.abort();
    }
  });
  await page.goto("https://web168.test/index.html");
  await page.waitForFunction(
    () =>
      window.GRPGHubBridgeV153 &&
      document
        .querySelector("#login-status")
        .textContent.includes("Не удалось"),
  );
  await page.evaluate(() => {
    const B = GRPGHubBridgeV153,
      A = B.app,
      S = GRPGHubSpatialV157;
    const map = {
        id: "main",
        name: "Основная карта",
        width: 2000,
        height: 1200,
        hexSize: 28,
        objects: [],
        spawnPoints: [],
        walls: [],
      },
      start = { x: 300.3, y: 500.7 };
    map.fogEnabled = true;
    map.visionRange = 10;
    map.playerWidth = 40;
    map.walls = [
      {
        id: "barrier",
        thickness: 8,
        points: [
          { x: 600, y: 200 },
          { x: 600, y: 650 },
        ],
      },
    ];
    map.spawnPoints = [{ id: "entry", ...start }];
    map.objects = [
      {
        id: "sign",
        name: "Надпись",
        type: "decor",
        x: start.x + 35,
        y: start.y - 24,
        width: 48,
        height: 48,
        dialogIds: ["read"],
      },
    ];
    const planet = {
        id: "h",
        name: "Сухой док",
        locationType: "hub",
        hub: {
          maps: [map],
          defaultMapId: "main",
          dialogs: [
            {
              id: "read",
              name: "Прочитать",
              startNodeId: "n",
              nodes: [{ id: "n", text: "Надпись", choices: [] }],
            },
          ],
        },
      },
      player = {
        id: "p",
        displayName: "Тест",
        image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        currentPlanetId: "h",
        credits: 0,
        inventory: [],
        campaignIds: ["main"],
        role: "player",
      };
    A.data.planets.set("h", planet);
    A.data.players.set("p", player);
    A.session = { userId: "p", role: "player" };
    A.ui.boot = "app";
    A.ui.screen = "profile";
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("hidden");
    document.getElementById("nav-hub-v153").classList.remove("hidden");
  });
  server = {
    id: "row",
    campaignId: "main",
    playerId: "p",
    version: 0,
    playerJson: await page.evaluate(() =>
      structuredClone(GRPGHubBridgeV153.currentPlayer()),
    ),
  };
  await page.locator("#nav-hub-v153").click();
  await page.waitForTimeout(150);
  await page.evaluate(
    () => (document.querySelector("[data-runtime-map]").__sameMap = true),
  );
  const fogSamples=await page.evaluate(()=>{const c=document.querySelector('[data-fog]'),ctx=c.getContext('2d');return [[300,501],[650,501],[300,925]].map(([x,y])=>ctx.getImageData(x,y,1,1).data[3]);});
  assert.equal(fogSamples[0],0);assert.equal(fogSamples[1],255);assert.ok(fogSamples[2]>10&&fogSamples[2]<245,'fog edge has gradual alpha');
  await page.screenshot({path:'/tmp/hub178.png'});
  const destination = await page.evaluate(() => ({ x: 900.9, y: 500.7 }));
  const click = async (at) => {
    const rect = await page.locator("[data-runtime-map]").boundingBox();
    await page.mouse.click(
      rect.x + (at.x * rect.width) / 2000,
      rect.y + (at.y * rect.height) / 1200,
    );
  };
  await click(destination);
  await page.waitForFunction(({ x, y }) => {
    const p = GRPGHubBridgeV153.currentPlayer().hubState;
    return (
      p &&
      Math.hypot(p.x - x, p.y - y) < 2 &&
      !document.querySelector(".hub-walking-v157")
    );
  }, destination);
  assert.ok(writes.length > 10);
  assert.ok(writes.some((s) => s.y > 670));
  assert.equal(
    await page.locator(".hub-walls-v157,.hub-hex-grid-v157").count(),
    0,
  );
  assert.equal(await page.locator(".hub-player-v153 img").count(), 1);
  assert.equal(
    await page.evaluate(
      () => document.querySelector("[data-runtime-map]").__sameMap,
    ),
    true,
  );
  const map = await page.evaluate(
    () => GRPGHubBridgeV153.currentPlanet().hub.maps[0],
  );
  const distances = await page.evaluate(
    ({ map, steps }) => {
      const S = GRPGHubSpatialV157;
      return steps.map((at, i) => {
        const prev = i ? steps[i - 1] : map.spawnPoints[0];
        return S.distance(S.hex(map, prev.x, prev.y), S.hex(map, at.x, at.y));
      });
    },
    { map, steps: writes },
  );
  assert.ok(distances.every((d) => d > 0 && d <= 60.01));
  assert.equal(writes.at(-1).exploration.main.version178, 1);
  const before = writes.length;
  failAt = attempts + 2;
  const second = await page.evaluate(() => ({ x: 300.3, y: 500.7 }));
  await click(second);
  await page.waitForFunction(() =>
    document
      .querySelector("#toast-stack")
      ?.textContent.includes("fixture save failure"),
  );
  await page.waitForTimeout(300);
  assert.equal(writes.length, before + 1);
  assert.equal(
    await page.evaluate(() =>
      Boolean(document.querySelector(".hub-walking-v157")),
    ),
    false,
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      x: GRPGHubBridgeV153.currentPlayer().hubState.x,
      y: GRPGHubBridgeV153.currentPlayer().hubState.y,
    })),
    { x: writes.at(-1).x, y: writes.at(-1).y },
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: full web app + real mutation bridge follows continuous wall detour to exact clicked point; hidden walls and no hex grid, player photo, explored fog; failed segment stops at confirmed position",
  );
} finally {
  await browser.close();
}
