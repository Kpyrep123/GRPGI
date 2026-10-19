/* World Config tags use the shared checkbox picker and stay in the card draft. */
(() => {
  "use strict";
  if (typeof Configurator === "undefined") return;
  const C = window.GRPGSkillCatalogV176;
  const branchOptions = [
    ["auto", "Автоматически по условиям"],
    ["common", "Общие · отдельно от дерева"],
    ...(window.GRPGSkillRadialV177?.branches || []).map((b) => [b.id, b.name]),
  ];
  const all = () => Object.values(window.GRPGSkillModelV50.records),
    allTags = () => C.tags(all().flatMap((s) => s.tags || []));
  const render = Configurator.renderSkillEditor.bind(Configurator);
  Configurator.renderSkillEditor = function (entity) {
    const box = document.createElement("div");
    box.innerHTML = render(entity);
    const form = box.querySelector("form"),
      selected = C.tags(entity.tags),
      options = C.tags([...allTags(), ...selected]);
    form
      .querySelector('[name="category"]')
      ?.closest(".field")
      ?.insertAdjacentHTML(
        "afterend",
        `<div class="field"><label>Теги навыка</label><select class="select" multiple name="skillTags176" data-skill-tags176 data-allow-tag-create172>${options.map((t) => `<option value="${C.esc(t)}" ${selected.some((v) => C.key(v) === C.key(t)) ? "selected" : ""}>${C.esc(t)}</option>`).join("")}</select><div class="small-note">Несколько тегов для поиска и группировки. Теги не добавляют условий изучения.</div></div>`,
      );
    form
      .querySelector('[name="description"]')
      ?.closest(".field")
      ?.insertAdjacentHTML(
        "afterend",
        '<details><summary>Предпросмотр описания</summary><div class="sc-rich176" data-skill-preview176></div></details>',
      );
    form
      .querySelector('[name="category"]')
      ?.closest(".field")
      ?.insertAdjacentHTML(
        "afterend",
        `<div class="field"><label>Ветка дерева<select class="select" name="treeBranch177">${branchOptions.map(([id, name]) => `<option value="${id}" ${id === (entity.treeBranch || "auto") ? "selected" : ""}>${name}</option>`).join("")}</select></label><div class="small-note">Только размещение: не добавляет требований к изучению. При «Автоматически» учитываются характеристики и предыдущие навыки.</div></div>`,
      );
    return box.innerHTML;
  };
  const collect = Configurator.collectEntity.bind(Configurator);
  Configurator.collectEntity = function (type, form, fd = new FormData(form)) {
    const result = collect(type, form, fd);
    if (type === "skills") {
      result.tags = C.tags(fd.getAll("skillTags176"));
      result.treeBranch = fd.get("treeBranch177") || "auto";
    }
    return result;
  };
  document.addEventListener("grpg-create-tag172", (event) => {
    const { select, name } = event.detail;
    if (!select.matches("[data-skill-tags176]")) return;
    if (App.currentUser?.role !== "gm") {
      event.detail.error = "Создание тегов доступно ведущему";
      return;
    }
    const clean = String(name || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!clean || clean.length > 80) {
      event.detail.error = "Название тега: от 1 до 80 символов";
      return;
    }
    const existing = [
        ...allTags(),
        ...[...select.options].map((o) => o.value),
      ].find((t) => C.key(t) === C.key(clean)),
      label = existing || clean;
    let option = [...select.options].find(
      (o) => C.key(o.value) === C.key(label),
    );
    if (!option) {
      option = new Option(label, label);
      option.dataset.createdTagName172 = label;
      select.add(option);
    }
    event.detail.value = option.value;
  });
  function preview() {
    const form = document.getElementById("config-editor-form"),
      output = form?.querySelector("[data-skill-preview176]");
    if (output)
      output.innerHTML = C.rich(
        form.querySelector('[name="description"]').value,
      );
  }
  document.addEventListener("input", (e) => {
    if (e.target.matches('#config-editor-form [name="description"]')) preview();
  });
  const before = Configurator.render.bind(Configurator);
  Configurator.render = function (...args) {
    const result = before(...args);
    preview();
    return result;
  };
})();
