(() => {
  "use strict";
  const G = window.GRPGCharacterGrantsV178,
    C = window.GRPGSkillCatalogV176;
  if (!G || typeof Configurator === "undefined") return;
  const world = () => ({
    skills: { SKILLS: GRPGSkillModelV50.records },
    equipment: { EQUIPMENT },
    socialOrigins: {
      SOCIAL_ORIGINS: Object.fromEntries(
        Configurator.getItems("socialOrigins").map((o) => [o.id, o]),
      ),
    },
    geographicOrigins: {
      GEOGRAPHIC_ORIGINS: Object.fromEntries(
        Configurator.getItems("geographicOrigins").map((o) => [o.id, o]),
      ),
    },
  });
  let loadingWorld178 = false;
  const norm = normalizePlayerProfileV2;
  normalizePlayerProfileV2 = function (raw = {}) {
    return norm(loadingWorld178 ? raw : G.apply(raw, world()));
  };
  const get = Data.getSkill.bind(Data);
  Data.getSkill = (id) =>
    get(id) || G.definitions(world()).find((s) => s.id === id) || null;
  window.GRPGCharacterGrantWorldV178 = world;
  const render = Configurator.renderSkillEditor.bind(Configurator);
  Configurator.renderSkillEditor = function (entity) {
    const box = document.createElement("div");
    box.innerHTML = render(entity);
    box
      .querySelector("form")
      .insertAdjacentHTML(
        "beforeend",
        `<label><input type="checkbox" name="isBasic178" ${entity.isBasic ? "checked" : ""}> Базовый — автоматически изучен у всех персонажей, без расхода очков</label>`,
      );
    return box.innerHTML;
  };
  const originRender = Configurator.renderOriginEditorV1052.bind(Configurator);
  Configurator.renderOriginEditorV1052 = function (entity, kind) {
    const box = document.createElement("div");
    box.innerHTML = originRender(entity, kind);
    const form = box.querySelector("form");
    const rows = Object.values(GRPGSkillModelV50.records);
    form.insertAdjacentHTML(
      "beforeend",
      `<section data-origin-grants178><input type="hidden" name="existingSkillsJson178" value="${C.esc(JSON.stringify(entity.grantedSkillIds || []))}"><h3>Навыки и стартовые предметы</h3><label>Выдать существующие навыки<select multiple class="select" name="grantedSkillIds178">${rows.map((s) => `<option value="${C.esc(s.id)}" ${(entity.grantedSkillIds || []).includes(s.id) ? "selected" : ""}>${C.esc(s.name)}</option>`).join("")}</select></label><h4>Собственные навыки профессии / происхождения</h4><p class="small-note">Эти определения не входят в обычный список навыков. Владельцы выбранного происхождения получают их автоматически.</p><input type="hidden" name="privateSkillsJson178" value="${C.esc(JSON.stringify(entity.grantedSkills || []))}"><div data-private-skills178></div><button class="secondary" type="button" data-add-private178>Добавить собственный навык</button><h4>Стартовые предметы</h4><input type="hidden" name="starterItemsJson178" value="${C.esc(JSON.stringify(entity.startingItems || []))}"><div data-starter-items178></div><button class="secondary" type="button" data-add-item178>Добавить предмет</button></section>`,
    );
    const privateHost = form.querySelector("[data-private-skills178]"),
      itemHost = form.querySelector("[data-starter-items178]");
    for (const s of entity.grantedSkills || [])
      privateHost.insertAdjacentHTML("beforeend", skillRow(s));
    for (const row of entity.startingItems || [])
      itemHost.insertAdjacentHTML("beforeend", itemRow(row));
    return box.innerHTML;
  };
  function skillRow(s = {}) {
    return `<fieldset data-private-skill178><input type="hidden" data-field178="id" value="${C.esc(s.id || crypto.randomUUID())}"><input type="hidden" data-field178="raw" value="${C.esc(JSON.stringify(s))}"><label>Название<input class="input" data-field178="name" value="${C.esc(s.name || "")}" required></label><label>Тип<select class="select" data-field178="activationType">${[
      ["passive", "Пассивный"],
      ["active", "Активный"],
      ["reaction", "Реакция"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${s.activationType === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Изображение (URL)<input class="input" data-field178="image" value="${C.esc(s.image || "")}"></label><label>Модификаторы (JSON)<textarea class="area" data-field178="modifiersJson">${C.esc(s.modifiersJson ?? JSON.stringify(s.modifiers || []))}</textarea></label><label>Описание (HTML)<textarea class="area" data-field178="description">${C.esc(s.description || "")}</textarea></label><label><input type="checkbox" data-field178="luaEnabled" ${s.luaEnabled ? "checked" : ""}> Lua включён</label><label>Lua-скрипт<textarea class="area" data-field178="luaScript">${C.esc(s.luaScript || "")}</textarea></label><button class="danger" type="button" data-remove-grant178>Удалить навык</button></fieldset>`;
  }
  function itemRow(row = {}) {
    return `<div data-starter-item178><label>Предмет<select class="select" data-field178="itemId">${Object.values(
      EQUIPMENT,
    )
      .map(
        (i) =>
          `<option value="${C.esc(i.id)}" ${i.id === row.itemId ? "selected" : ""}>${C.esc(i.name)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Количество<input class="input" type="number" min="1" max="999" step="1" data-field178="qty" value="${Number(row.qty) || 1}"></label><button class="danger" type="button" data-remove-grant178>Удалить предмет</button></div>`;
  }
  const field = (row, key) => row.querySelector(`[data-field178="${key}"]`);
  function readSkills(form) {
    return [...form.querySelectorAll("[data-private-skill178]")].map((row) => ({
      ...JSON.parse(field(row, "raw").value),
      id: field(row, "id").value,
      name: field(row, "name").value.trim(),
      image: field(row, "image").value.trim(),
      modifiersJson: field(row, "modifiersJson").value,
      description: field(row, "description").value,
      activationType: field(row, "activationType").value,
      luaEnabled: field(row, "luaEnabled").checked,
      luaScript: field(row, "luaScript").value,
    }));
  }
  function readItems(form) {
    return [...form.querySelectorAll("[data-starter-item178]")].map((row) => ({
      itemId: field(row, "itemId").value,
      qty: field(row, "qty").value,
    }));
  }
  function remember(form) {
    form.elements.existingSkillsJson178.value = JSON.stringify(
      [...form.elements.grantedSkillIds178.selectedOptions].map((o) => o.value),
    );
    form.elements.privateSkillsJson178.value = JSON.stringify(readSkills(form));
    form.elements.starterItemsJson178.value = JSON.stringify(readItems(form));
  }
  for (const type of ["input", "change"])
    document.addEventListener(
      type,
      (e) => {
        const form = e.target.closest("form");
        if (form?.querySelector("[data-origin-grants178]")) remember(form);
      },
      true,
    );
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-private178]"),
      item = e.target.closest("[data-add-item178]"),
      remove = e.target.closest("[data-remove-grant178]"),
      button = add || item || remove;
    if (!button) return;
    const form = button.closest("form");
    if (add)
      form
        .querySelector("[data-private-skills178]")
        .insertAdjacentHTML("beforeend", skillRow());
    if (item)
      form
        .querySelector("[data-starter-items178]")
        .insertAdjacentHTML("beforeend", itemRow());
    if (remove)
      remove.closest("[data-private-skill178],[data-starter-item178]").remove();
    remember(form);
    form.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const beforeRender = Configurator.render.bind(Configurator);
  Configurator.render = function (...args) {
    const result = beforeRender(...args),
      form = document.getElementById("config-editor-form");
    if (form?.querySelector("[data-origin-grants178]")) {
      const ids = new Set(
        JSON.parse(form.elements.existingSkillsJson178.value),
      );
      for (const option of form.elements.grantedSkillIds178.options)
        option.selected = ids.has(option.value);
      form.querySelector("[data-private-skills178]").innerHTML = JSON.parse(
        form.elements.privateSkillsJson178.value,
      )
        .map(skillRow)
        .join("");
      form.querySelector("[data-starter-items178]").innerHTML = JSON.parse(
        form.elements.starterItemsJson178.value,
      )
        .map(itemRow)
        .join("");
      window.GRPGCheckboxPickerV172?.enhance(form);
    }
    return result;
  };
  const collect = Configurator.collectEntity.bind(Configurator);
  Configurator.collectEntity = function (type, form, fd = new FormData(form)) {
    const result = collect(type, form, fd);
    if (type === "skills") result.isBasic = fd.get("isBasic178") === "on";
    if (["socialOrigins", "geographicOrigins"].includes(type)) {
      result.grantedSkillIds = fd.getAll("grantedSkillIds178");
      result.grantedSkills = readSkills(form).map((s) => {
        if (!s.name) throw Error("У собственного навыка должно быть название");
        let modifiers;
        try {
          modifiers = JSON.parse(s.modifiersJson || "[]");
        } catch {
          throw Error("Модификаторы навыка: некорректный JSON");
        }
        if (!Array.isArray(modifiers))
          throw Error("Модификаторы навыка должны быть массивом");
        const { modifiersJson, ...rest } = s;
        return { ...rest, modifiers };
      });
      result.startingItems = readItems(form).map((row) => {
        const qty = Number(row.qty),
          itemId = row.itemId;
        if (
          !EQUIPMENT[itemId] ||
          !Number.isInteger(qty) ||
          qty < 1 ||
          qty > 999
        )
          throw Error("Проверьте стартовый предмет и количество (1–999)");
        return { itemId, qty };
      });
      if (
        new Set(result.startingItems.map((i) => i.itemId)).size !==
        result.startingItems.length
      )
        throw Error(
          "Объедините повторяющиеся стартовые предметы в одну строку",
        );
    }
    return result;
  };
  const apply = applyWorldData;
  applyWorldData = function (w) {
    let r;
    loadingWorld178 = true;
    try {
      r = apply(w);
    } finally {
      loadingWorld178 = false;
    }
    for (const [id, p] of Object.entries(PLAYER_TEMPLATES))
      PLAYER_TEMPLATES[id] = normalizePlayerProfileV2(p);
    if (App.state?.users)
      for (const [id, p] of Object.entries(App.state.users))
        App.state.users[id] = normalizePlayerProfileV2(p);
    return r;
  };
})();
