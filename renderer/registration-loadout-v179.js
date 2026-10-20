/* Registration-only draft. Inventory quantities include equipped copies, as in profiles. */
(function (root) {
  "use strict";
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const labels = {
    primaryWeapon: "Основное оружие / щит",
    secondaryWeapon: "Вторичное оружие",
    armor: "Броня",
    backpack: "Рюкзак",
  };
  const values = (v) =>
    v instanceof Map ? [...v.values()] : Object.values(v || {});
  function accepts(slot, item = {}) {
    const type = String(item.type || "gear").toLowerCase();
    if (slot === "armor" || slot === "backpack") return type === slot;
    if (slot === "primaryWeapon")
      return (
        type === "shield" ||
        (type === "weapon" &&
          ["", "primary", "versatile"].includes(String(item.weaponSlot || "")))
      );
    if (slot === "secondaryWeapon")
      return (
        type === "weapon" &&
        ["", "secondary", "versatile"].includes(String(item.weaponSlot || ""))
      );
    return false;
  }
  const counts = (p) => {
    const out = new Map();
    for (const id of Object.values(p.equipmentSlots || {}))
      if (id) out.set(id, (out.get(id) || 0) + 1);
    return out;
  };
  function position(p, id, index, pos) {
    const row = p.inventory.find((r) => r.itemId === id);
    if (!row) return;
    row.positions ||= [];
    while (row.positions.length < row.qty) row.positions.push(null);
    row.positions[index] = pos ? { x: pos.x, y: pos.y } : null;
  }
  function materialize(p, api) {
    const l = api.layout(p),
      next = clone(l.user || p);
    for (const inst of l.instances)
      if (inst.pos) position(next, inst.itemId, inst.unitIndex, inst.pos);
    return next;
  }
  function seed(selection, world) {
    const base = {
      role: "player",
      socialOriginId: selection.profession?.id || "",
      geographicOriginId: selection.geographic?.id || "",
      campaignIds: selection.campaign ? [selection.campaign.id] : [],
      skills: [],
      inventorySize: 12,
      inventoryBaseSlots: 12,
      carryWeightMax: 12,
      carryBase: 12,
      stats: {
        hpCurrent: 10,
        hpMax: 10,
        shieldCurrent: 0,
        shieldMax: 0,
        energyCurrent: 1,
        energyMax: 1,
        baseArmorClass: 10,
      },
      baseStats: {
        hpBase: 10,
        inventorySlots: 12,
        carryBase: 12,
        implantSlots: 0,
      },
      abilityBase: {
        strength: 0,
        dexterity: 0,
        endurance: 0,
        intelligence: 0,
        will: 0,
        glory: 0,
      },
      equipmentSlots: {
        primaryWeapon: "",
        secondaryWeapon: "",
        armor: "",
        backpack: "",
      },
      implantSlots: [],
      installedImplantIds: [],
      inventory: (selection.equipmentIds || []).map((itemId) => ({
        itemId,
        qty: 1,
        positions: [],
      })),
    };
    return root.GRPGCharacterGrantsV178.startingLoadout(base, world);
  }
  function reconcile(selection, world, previous, api) {
    const fresh = seed(selection, world),
      old = new Map((previous?.inventory || []).map((r) => [r.itemId, r])),
      owned = new Map(fresh.inventory.map((r) => [r.itemId, r.qty]));
    for (const row of fresh.inventory)
      row.positions = clone(old.get(row.itemId)?.positions || []).slice(
        0,
        row.qty,
      );
    const used = new Map();
    for (const slot of Object.keys(labels)) {
      const id = previous?.equipmentSlots?.[slot];
      if (
        id &&
        accepts(slot, api.item(id)) &&
        (used.get(id) || 0) < (owned.get(id) || 0)
      ) {
        fresh.equipmentSlots[slot] = id;
        used.set(id, (used.get(id) || 0) + 1);
      }
    }
    // Only newly selected/granted copies auto-equip. Manual unequipping survives other changes.
    const ordered = [...fresh.inventory].sort(
      (a, b) =>
        ["backpack", "armor"].indexOf(api.item(b.itemId)?.type) -
        ["backpack", "armor"].indexOf(api.item(a.itemId)?.type),
    );
    for (const row of ordered) {
      let added = row.qty - (old.get(row.itemId)?.qty || 0);
      for (const slot of Object.keys(labels))
        if (
          added > 0 &&
          !fresh.equipmentSlots[slot] &&
          accepts(slot, api.item(row.itemId)) &&
          (used.get(row.itemId) || 0) < row.qty
        ) {
          fresh.equipmentSlots[slot] = row.itemId;
          used.set(row.itemId, (used.get(row.itemId) || 0) + 1);
          added--;
        }
    }
    return materialize(api.normalize(fresh), api);
  }
  function move(raw, source, target, api) {
    let next = materialize(api.normalize(clone(raw)), api);
    const before = api.layout(next),
      item = api.item(source.itemId),
      slots = next.equipmentSlots,
      owned = next.inventory.find((r) => r.itemId === source.itemId)?.qty || 0;
    if (!item || !owned) throw Error("Предмет больше не выбран.");
    const fromSlot = source.source === "slot";
    if (fromSlot) {
      if (slots[source.slot] !== source.itemId)
        throw Error("Экипировка изменилась. Выберите предмет заново.");
      slots[source.slot] = "";
    } else if (
      ![...before.instances, ...before.overflow].some(
        (i) => i.itemId === source.itemId && i.unitIndex === source.unitIndex,
      )
    )
      throw Error("Экземпляр предмета больше недоступен.");
    if (target.slot) {
      if (!accepts(target.slot, item))
        throw Error("Этот предмет не подходит для выбранного слота.");
      if ((counts(next).get(source.itemId) || 0) >= owned)
        throw Error("Нет свободного экземпляра предмета.");
      const displaced = slots[target.slot];
      if (fromSlot && displaced && accepts(source.slot, api.item(displaced)))
        slots[source.slot] = displaced;
      if (!fromSlot) {
        const skip = counts(next).get(source.itemId) || 0,
          row = next.inventory.find((r) => r.itemId === source.itemId);
        if (source.unitIndex !== skip)
          position(
            next,
            source.itemId,
            source.unitIndex,
            row.positions?.[skip] || null,
          );
        position(next, source.itemId, skip, null);
      }
      slots[target.slot] = source.itemId;
    } else if (target.pos) {
      const { x, y } = target.pos;
      if (!Number.isInteger(x) || !Number.isInteger(y))
        throw Error("Выберите ячейку инвентаря.");
      const w = Math.max(1, +item.inventoryWidth || 1),
        h = Math.max(1, +item.inventoryHeight || 1),
        index = fromSlot
          ? counts(next).get(source.itemId) || 0
          : source.unitIndex;
      if (x < 0 || y < 0 || x + w > before.cols)
        throw Error("Предмет выходит за край инвентаря.");
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++)
          if (yy * before.cols + xx >= before.size)
            throw Error("Предмет выходит за край инвентаря.");
      if (
        before.instances.some(
          (i) =>
            !(
              i.itemId === source.itemId &&
              !fromSlot &&
              i.unitIndex === source.unitIndex
            ) &&
            i.pos &&
            x < i.pos.x + i.w &&
            x + w > i.pos.x &&
            y < i.pos.y + i.h &&
            y + h > i.pos.y,
        )
      )
        throw Error("Эти ячейки заняты.");
      position(next, source.itemId, index, { x, y });
    } else if (!fromSlot) throw Error("Сначала выберите предмет в слоте.");
    next = api.normalize(next);
    const after = api.layout(next),
      excess = (l) =>
        Math.max(0, l.weight - Number(l.user?.carryWeightMax || 0));
    if (after.overflow.length > before.overflow.length)
      throw Error("Недостаточно ячеек для снятого снаряжения.");
    if (excess(after) > excess(before) + 1e-9)
      throw Error("После изменения будет превышен переносимый вес.");
    return materialize(next, api);
  }
  function problems(p, api) {
    const l = api.layout(p),
      out = [];
    if (l.weight > l.user.carryWeightMax + 1e-9)
      out.push(
        `Переносимый вес: ${l.weight.toFixed(1)} / ${Number(l.user.carryWeightMax).toFixed(1)}. Уберите часть выбранных предметов.`,
      );
    if (l.overflow.length)
      out.push(
        `Не помещается предметов: ${l.overflow.length}. Освободите место или наденьте рюкзак.`,
      );
    return out;
  }
  const drafts = new WeakMap();
  let adapter;
  function esc(v) {
    return String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  const rich = (v) => root.GRPGSkillCatalogV176?.rich(v) || esc(v);
  function worldItem(world, id) {
    const rows = world.equipment?.EQUIPMENT;
    return rows instanceof Map ? rows.get(id) : rows?.[id];
  }
  function refresh(form) {
    if (!adapter || !form?.matches(adapter.formSelector)) return null;
    const selection = adapter.selection(form),
      world = adapter.world(),
      fingerprint = JSON.stringify([
        selection.campaign?.id,
        selection.profession,
        selection.geographic,
        selection.equipmentIds,
        world.skills,
        world.equipment,
      ]);
    let state = drafts.get(form);
    if (!state || state.fingerprint !== fingerprint) {
      state = {
        fingerprint,
        selection,
        player: reconcile(selection, world, state?.player, adapter),
        source: null,
        message: "",
      };
      drafts.set(form, state);
      render(form, state, world);
    }
    decorate(form, world);
    const errors = problems(state.player, adapter),
      submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = selection.total > 10 || errors.length > 0;
    return state;
  }
  function decorate(form, world) {
    for (const [field, key] of [
      ["socialOriginId", "socialOrigins"],
      ["geographicOriginId", "geographicOrigins"],
    ])
      for (const input of form.querySelectorAll(`[name="${field}"]`)) {
        const card = input.closest("label");
        if (!card || card.querySelector("[data-origin-gifts179]")) continue;
        const rows =
            key === "socialOrigins"
              ? world.socialOrigins?.SOCIAL_ORIGINS
              : world.geographicOrigins?.GEOGRAPHIC_ORIGINS,
          origin = rows?.[input.value];
        if (!origin) continue;
        const skillMap = world.skills?.SKILLS || {},
          skills = [
            ...(origin.grantedSkillIds || [])
              .map((id) => skillMap[id])
              .filter(Boolean),
            ...(origin.grantedSkills || []),
          ],
          items = (origin.startingItems || [])
            .map((row) => ({ row, item: worldItem(world, row.itemId) }))
            .filter((v) => v.item);
        if (!skills.length && !items.length) continue;
        const copy = document.createElement("div");
        copy.dataset.originGifts179 = "";
        copy.className = "reg179-gifts";
        copy.innerHTML = `${skills.length ? `<b>Навыки</b><span>${skills.map((s) => esc(s.name || s.id)).join(" · ")}</span>` : ""}${items.length ? `<b>Стартовое снаряжение</b><span>${items.map(({ item, row }) => `${esc(item.name || item.id)} ×${esc(Number(row.qty) || 1)}`).join(" · ")}</span>` : ""}`;
        const body = card.querySelector(".origin-choice-body-v1054"),
          indicator = body?.querySelector(".origin-select-indicator-v1054");
        if (indicator) indicator.before(copy);
        else body?.append(copy);
      }
  }
  function render(form, state, world) {
    let host = form.querySelector("[data-registration-loadout179]");
    if (!host) {
      host = document.createElement("section");
      host.dataset.registrationLoadout179 = "";
      host.className = "registration-section-v1054 reg179";
      form
        .querySelector("[data-registration-equipment-v1066]")
        .closest(".registration-section-v1054")
        .after(host);
    }
    const restoreFocus = host.contains(document.activeElement);
    const p = state.player,
      l = adapter.layout(p),
      errors = problems(p, adapter),
      skillMap = new Map(
        [
          ...values(world.skills?.SKILLS),
          ...root.GRPGCharacterGrantsV178.definitions(world),
        ].map((s) => [s.id, s]),
      );
    const skills = p.skills.map((id) => skillMap.get(id)).filter(Boolean),
      origins = root.GRPGCharacterGrantsV178.origins(world).filter(
        ({ field, origin }) => p[field] === origin.id,
      );
    const thumb = (item) => adapter.thumb(item),
      selected = (source) =>
        state.source &&
        state.source.itemId === source.itemId &&
        state.source.source === source.source &&
        (source.source === "slot"
          ? state.source.slot === source.slot
          : state.source.unitIndex === source.unitIndex);
    const itemButton = (item, source, style = "", qty = 1) =>
      `<button type="button" class="reg179-item ${selected(source) ? "selected" : ""}" draggable="true" data-reg179-item data-item-id="${esc(item.id)}" data-source="${source.source}" ${source.source === "slot" ? `data-slot="${source.slot}"` : `data-unit-index="${source.unitIndex}"`} style="${style}" aria-label="${esc(item.name || item.id)}${qty > 1 ? " ×" + qty : ""}" aria-pressed="${!!selected(source)}">${thumb(item)}<span>${esc(item.name || item.id)}</span>${qty > 1 ? `<em>×${qty}</em>` : ""}</button>`;
    host.innerHTML = `<div class="reg179-head"><div><div class="section-title">Ваш персонаж на старте</div><p>Навыки и предметы из выбранной профессии, происхождения и снаряжения.</p></div><span>${l.weight.toFixed(1)} / ${Number(l.user.carryWeightMax).toFixed(1)} веса · ${l.size} яч.</span></div><div class="reg179-skills"><h3>Стартовые навыки <small>${skills.length}</small></h3>${
      skills.length
        ? skills
            .map((s) => {
              const sources = [
                ...(s.isBasic ? ["Базовый"] : []),
                ...origins
                  .filter(
                    ({ origin, section }) =>
                      (origin.grantedSkillIds || []).includes(s.id) ||
                      (origin.grantedSkills || []).some(
                        (local) =>
                          root.GRPGCharacterGrantsV178.inlineId(
                            section,
                            origin.id,
                            local.id,
                          ) === s.id,
                      ),
                  )
                  .map(({ origin }) => origin.name),
              ];
              return `<details><summary>${thumb(s)}<span><b>${esc(s.name || s.id)}</b><small>${esc(sources.join(" · "))} · Уже изучен</small></span></summary><div class="reg179-rich">${rich(s.description || "Описание не задано.")}</div></details>`;
            })
            .join("")
        : "<p>У выбранных вариантов пока нет стартовых навыков.</p>"
    }</div><div class="reg179-loadout"><div class="reg179-slots">${Object.entries(
      labels,
    )
      .map(([slot, label]) => {
        const id = p.equipmentSlots[slot],
          item = id && adapter.item(id);
        return `<div class="reg179-slot ${slot}" data-reg179-slot="${slot}"><b>${label}</b>${item ? itemButton(item, { itemId: id, source: "slot", slot }) : `<button type="button" data-reg179-empty-slot="${slot}" aria-label="${label}: пусто">Пусто</button>`}</div>`;
      })
      .join(
        "",
      )}</div><div class="reg179-bag"><h3>Инвентарь</h3><p>Перетащите предмет в слот или на свободные клетки. Можно выбрать предмет щелчком, затем выбрать слот или клетку.</p><div class="reg179-grid" data-reg179-grid style="--cols:${l.cols};--rows:${l.rows}">${Array.from({ length: l.size }, (_, i) => `<button type="button" class="reg179-cell" data-reg179-cell="${i}" aria-label="Ячейка ${i + 1}" style="grid-column:${(i % l.cols) + 1};grid-row:${Math.floor(i / l.cols) + 1}"></button>`).join("")}${l.instances.map((i) => itemButton(i.item, { itemId: i.itemId, source: "grid", unitIndex: i.unitIndex }, `grid-column:${i.pos.x + 1} / span ${i.w};grid-row:${i.pos.y + 1} / span ${i.h}`, i.qty)).join("")}</div>${l.overflow.length ? `<div class="reg179-overflow"><h4>Не помещается</h4>${l.overflow.map((i) => itemButton(i.item, { itemId: i.itemId, source: "grid", unitIndex: i.unitIndex }, "", i.qty)).join("")}</div>` : ""}${(l.text || l.textItems || []).length ? `<div class="reg179-text"><h4>Без ячеек</h4>${(l.text || l.textItems).map((i) => `<p>${esc(i.item.name)} ×${i.qty}</p>`).join("")}</div>` : ""}</div></div><div class="reg179-detail" data-reg179-detail ${state.source ? "" : "hidden"}></div><div class="reg179-status ${errors.length ? "invalid" : ""}" role="status">${esc(state.message || errors.join(" "))}</div>`;
    host
      .querySelectorAll("[data-reg179-item] img")
      .forEach((img) => (img.draggable = false));
    renderDetail(host, state);
    if (restoreFocus)
      (
        host.querySelector(".reg179-item.selected") ||
        host.querySelector("[data-reg179-item],[data-reg179-cell]")
      )?.focus({ preventScroll: true });
  }
  function renderDetail(host, state) {
    const box = host.querySelector("[data-reg179-detail]"),
      source = state.source;
    if (!source) {
      box.hidden = true;
      return;
    }
    const item = adapter.item(source.itemId);
    if (!item) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = `<header><h3>${esc(item.name || item.id)}</h3><button type="button" data-reg179-close>Закрыть</button></header><div class="reg179-rich">${rich(item.desc || item.description || "Описание не задано.")}</div><dl>${(root.GRPGItemFactsV141?.facts(item) || []).map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join("")}</dl><div class="reg179-actions">${Object.entries(
      labels,
    )
      .filter(
        ([slot]) =>
          accepts(slot, item) &&
          !(source.source === "slot" && source.slot === slot),
      )
      .map(
        ([slot, label]) =>
          `<button type="button" data-reg179-equip="${slot}">Надеть: ${label}</button>`,
      )
      .join(
        "",
      )}${source.source === "slot" ? '<button type="button" data-reg179-unequip>Снять в инвентарь</button>' : ""}<span>Для перемещения выберите свободную клетку.</span></div>`;
  }
  function readSource(node) {
    return {
      itemId: node.dataset.itemId,
      source: node.dataset.source,
      slot: node.dataset.slot,
      unitIndex: Number(node.dataset.unitIndex),
    };
  }
  function change(form, target, source) {
    const state = refresh(form);
    if (!state?.source && !source) return;
    try {
      state.player = move(
        state.player,
        source || state.source,
        target,
        adapter,
      );
      state.source = null;
      state.message = "Раскладка обновлена.";
    } catch (e) {
      state.message = e.message;
    }
    render(form, state, adapter.world());
    const submit = form.querySelector('[type="submit"]');
    if (submit)
      submit.disabled =
        state.selection.total > 10 ||
        problems(state.player, adapter).length > 0;
  }
  function install(api) {
    if (adapter) return;
    adapter = api;
    document.addEventListener("click", (e) => {
      const host = e.target.closest("[data-registration-loadout179]");
      if (!host) return;
      const form = host.closest("form"),
        state = refresh(form),
        node = e.target.closest("[data-reg179-item]"),
        slot = e.target.closest("[data-reg179-slot]"),
        cell = e.target.closest("[data-reg179-cell]");
      if (e.target.closest("[data-reg179-equip]"))
        return change(form, {
          slot: e.target.closest("[data-reg179-equip]").dataset.reg179Equip,
        });
      if (e.target.closest("[data-reg179-unequip]")) return change(form, {});
      if (e.target.closest("[data-reg179-close]")) {
        state.source = null;
        render(form, state, api.world());
        return;
      }
      if (
        slot &&
        state.source &&
        (!node ||
          node.dataset.source !== "slot" ||
          state.source.source !== "slot" ||
          node.dataset.slot !== state.source.slot)
      )
        return change(form, { slot: slot.dataset.reg179Slot });
      if (node) {
        state.source = readSource(node);
        state.message = "Выберите слот или свободную клетку.";
        render(form, state, api.world());
        return;
      }
      if (cell && state.source) {
        const index = Number(cell.dataset.reg179Cell),
          l = api.layout(state.player);
        change(form, {
          pos: { x: index % l.cols, y: Math.floor(index / l.cols) },
        });
      }
    });
    let dragging = null;
    document.addEventListener("dragstart", (e) => {
      const node = e.target.closest(
        "[data-registration-loadout179] [data-reg179-item]",
      );
      if (!node) return;
      const rect = node.getBoundingClientRect(),
        grid = node.closest("form").querySelector("[data-reg179-grid]"),
        l = api.layout(refresh(node.closest("form")).player),
        cell = grid.getBoundingClientRect().width / l.cols;
      dragging = {
        form: node.closest("form"),
        source: readSource(node),
        dx: Math.max(0, Math.floor((e.clientX - rect.left) / cell)),
        dy: Math.max(0, Math.floor((e.clientY - rect.top) / cell)),
      };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify(dragging.source));
    });
    document.addEventListener("dragover", (e) => {
      if (
        dragging &&
        e.target.closest("[data-registration-loadout179]")?.closest("form") ===
          dragging.form
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
    });
    document.addEventListener("drop", (e) => {
      if (
        !dragging ||
        e.target.closest("[data-registration-loadout179]")?.closest("form") !==
          dragging.form
      )
        return;
      e.preventDefault();
      const d = dragging;
      dragging = null;
      const slot = e.target.closest("[data-reg179-slot]");
      if (slot)
        return change(d.form, { slot: slot.dataset.reg179Slot }, d.source);
      const grid = e.target.closest("[data-reg179-grid]");
      if (grid) {
        const r = grid.getBoundingClientRect(),
          l = api.layout(refresh(d.form).player),
          size = r.width / l.cols;
        change(
          d.form,
          {
            pos: {
              x: Math.floor((e.clientX - r.left) / size) - d.dx,
              y: Math.floor((e.clientY - r.top) / size) - d.dy,
            },
          },
          d.source,
        );
      }
    });
    document.addEventListener("dragend", () => (dragging = null));
    document.addEventListener(
      "keydown",
      (e) => {
        const form = e.target.closest(api.formSelector),
          state = form && drafts.get(form);
        if (e.key === "Escape" && state?.source) {
          e.preventDefault();
          e.stopImmediatePropagation();
          state.source = null;
          render(form, state, api.world());
        }
      },
      true,
    );
    document.addEventListener(
      "reset",
      (e) => {
        if (e.target.matches(api.formSelector)) {
          drafts.delete(e.target);
          queueMicrotask(() => refresh(e.target));
        }
      },
      true,
    );
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n.nodeType === 1) {
            if (n.matches(api.formSelector)) refresh(n);
            for (const form of n.querySelectorAll(api.formSelector))
              refresh(form);
          }
    }).observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll(api.formSelector).forEach(refresh);
  }
  function payload(p) {
    return Object.fromEntries(
      [
        "inventory",
        "equipmentSlots",
        "skills",
        "characterGrants178",
        "baseStats",
        "inventoryBaseSlots",
        "inventorySize",
        "carryBase",
        "carryWeightMax",
        "implantSlots",
        "implantSlotCount",
        "installedImplantIds",
        "textInventoryItems",
      ]
        .filter((k) => p[k] !== undefined)
        .map((k) => [k, clone(p[k])]),
    );
  }
  function player(form) {
    const state = refresh(form);
    return state ? clone(state.player) : null;
  }
  const core = {
    accepts,
    seed,
    reconcile,
    move,
    problems,
    materialize,
    payload,
    labels,
  };
  root.GRPGRegistrationLoadoutV179 = { ...core, install, refresh, player };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
})(typeof window !== "undefined" ? window : globalThis);
