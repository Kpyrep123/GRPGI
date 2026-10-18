/* Shared desktop/web skill catalogue. Presentation never edits prerequisites or treePos. */
(function (root) {
  "use strict";
  const esc = (v) =>
    String(v ?? "").replace(
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
  const key = (v) => String(v).normalize("NFKC").toLocaleLowerCase("ru").trim();
  function tags(raw) {
    const seen = new Set();
    return (Array.isArray(raw) ? raw : [])
      .map((v) => String(v).trim().replace(/\s+/g, " "))
      .filter(
        (v) => v && v.length <= 80 && !seen.has(key(v)) && seen.add(key(v)),
      );
  }
  const requirements = (s) => {
    const raw = s.requiredSkillIds || s.requiredSkills || [];
    return [
      ...new Set(
        (Array.isArray(raw) ? raw : String(raw).split(/[\s,;]+/))
          .map(String)
          .filter(Boolean),
      ),
    ];
  };
  const abilities = (s) =>
    (s.requiredAbilities || []).filter((r) => Number(r.value) > 0);
  function related(skills, id) {
    const by = new Map(skills.map((s) => [String(s.id), s])),
      out = new Set();
    function walk(current, direction, seen) {
      if (seen.has(current) || !by.has(current)) return;
      seen.add(current);
      out.add(current);
      const next =
        direction === "up"
          ? requirements(by.get(current))
          : skills
              .filter((s) => requirements(s).includes(current))
              .map((s) => String(s.id));
      next.forEach((n) => walk(n, direction, seen));
    }
    walk(id, "up", new Set());
    walk(id, "down", new Set());
    for (const n of [...out]) walk(n, "up", new Set());
    return skills.filter((s) => out.has(String(s.id)));
  }
  function layout(skills) {
    const sorted = [...skills].sort((a, b) =>
        String(a.id).localeCompare(String(b.id)),
      ),
      by = new Map(sorted.map((s) => [String(s.id), s])),
      level = new Map(),
      pending = new Set(by.keys());
    let progress = true;
    while (pending.size && progress) {
      progress = false;
      for (const id of [...pending]) {
        const parents = requirements(by.get(id)).filter((p) => by.has(p));
        if (parents.every((p) => level.has(p))) {
          level.set(
            id,
            parents.length
              ? Math.max(...parents.map((p) => level.get(p))) + 1
              : 0,
          );
          pending.delete(id);
          progress = true;
        }
      }
    }
    const cyclic = [...pending];
    let last = Math.max(0, ...level.values()) + 1;
    for (const id of cyclic) level.set(id, last);
    const rows = new Map();
    for (const s of sorted) {
      const n = level.get(String(s.id));
      if (!rows.has(n)) rows.set(n, []);
      rows.get(n).push(s);
    }
    const width = Math.max(
        560,
        ...[...rows.values()].map((r) => r.length * 248 + 48),
      ),
      positions = new Map();
    for (const [n, row] of rows)
      row.forEach((s, i) =>
        positions.set(String(s.id), {
          x: (width - row.length * 248) / 2 + i * 248 + 12,
          y: 32 + n * 148,
        }),
      );
    return {
      positions,
      width,
      height: Math.max(260, (Math.max(0, ...level.values()) + 1) * 148 + 40),
      cyclic,
      edges: sorted.flatMap((s) =>
        requirements(s)
          .filter((p) => by.has(p))
          .map((p) => ({ from: p, to: String(s.id) })),
      ),
    };
  }
  function rich(value) {
    const text = String(value || "");
    if (typeof document === "undefined") return esc(text);
    const source = document.createElement("template");
    source.innerHTML = /<\/?[a-z][a-z0-9]*(?:\s|>)/i.test(text)
      ? text
      : "<p>" +
        esc(text)
          .replace(/\r\n/g, "\n")
          .split(/\n\s*\n/)
          .join("</p><p>")
          .replace(/\n/g, "<br>") +
        "</p>";
    const out = document.createElement("div"),
      allowed = new Set([
        "P",
        "BR",
        "STRONG",
        "B",
        "EM",
        "I",
        "U",
        "S",
        "UL",
        "OL",
        "LI",
        "H2",
        "H3",
        "H4",
        "BLOCKQUOTE",
        "CODE",
        "PRE",
        "HR",
        "A",
        "SPAN",
        "DIV",
        "TABLE",
        "THEAD",
        "TBODY",
        "TR",
        "TH",
        "TD",
      ]);
    function append(node, parent) {
      if (node.nodeType === 3) {
        parent.append(document.createTextNode(node.textContent));
        return;
      }
      if (node.nodeType !== 1) return;
      if (
        [
          "SCRIPT",
          "STYLE",
          "IFRAME",
          "OBJECT",
          "EMBED",
          "SVG",
          "MATH",
          "FORM",
          "INPUT",
          "BUTTON",
        ].includes(node.tagName)
      )
        return;
      if (!allowed.has(node.tagName)) {
        node.childNodes.forEach((n) => append(n, parent));
        return;
      }
      const el = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === "A") {
        const href = node.getAttribute("href") || "";
        if (/^(https?:\/\/|mailto:|#)/i.test(href)) {
          el.setAttribute("href", href);
          el.setAttribute("rel", "noopener noreferrer");
          if (!href.startsWith("#")) el.setAttribute("target", "_blank");
        }
      }
      node.childNodes.forEach((n) => append(n, el));
      parent.append(el);
    }
    source.content.childNodes.forEach((n) => append(n, out));
    return out.innerHTML;
  }
  const labels = {
    strength: "Сила",
    dexterity: "Ловкость",
    intelligence: "Интеллект",
    endurance: "Выносливость",
    will: "Воля",
    glory: "Слава",
  };
  const sessions = new Map();
  function mount(host, adapter) {
    if (!host) return;
    const user = adapter.user(),
      sessionKey = adapter.key || user.id || "player";
    let state = sessions.get(sessionKey);
    if (!state) {
      state = {
        mode: "catalog",
        query: "",
        tags: [],
        ability: "",
        status: "all",
        sort: "available",
        selected: "",
        zoom: 1,
        scroll: 0,
        pan: { left: 0, top: 0 },
      };
      sessions.set(sessionKey, state);
    }
    host.classList.add("skill-catalog176");
    host.closest(".profile-extra-modal-v50")?.classList.add("skill-modal176");
    let skills = [],
      byId,
      stats,
      busy = false,
      lastDetail = "";
    function status(s) {
      const r = adapter.status(s),
        available = r.available && !adapter.readonly?.();
      return {
        ...r,
        available,
        state: r.owned
          ? "owned"
          : r.gm
            ? "gm"
            : available
              ? "available"
              : r.pointsOnly
                ? "points"
                : "locked",
      };
    }
    const statusNames = {
      owned: "Изучено",
      gm: "Выдаётся ДМом",
      available: "Можно изучить",
      points: "Недостаточно очков",
      locked: "Не выполнены условия",
    };
    function refresh() {
      skills = adapter.skills();
      byId = new Map(skills.map((s) => [String(s.id), s]));
      stats = new Map(skills.map((s) => [String(s.id), status(s)]));
      if (!byId.has(state.selected)) state.selected = "";
    }
    function thumbnail(s) {
      return adapter.thumb
        ? adapter.thumb(s)
        : `<span class="sc-glyph176">${esc((s.name || "?").slice(0, 2))}</span>`;
    }
    function card(s, position) {
      const id = String(s.id),
        st = stats.get(id);
      return `<button type="button" class="sc-card176 ${st.state} ${state.selected === id ? "selected" : ""}" data-sc-select="${esc(id)}" aria-pressed="${state.selected === id}" ${position ? `style="left:${position.x}px;top:${position.y}px"` : ""}>${thumbnail(s)}<span class="sc-card-copy176"><strong>${esc(s.name || id)}</strong><small>${Number(s.cost ?? 1)} ОУ · ${{ active: "Активный", reaction: "Реакция", passive: "Пассивный" }[s.activationType] || "Пассивный"}</small><span class="sc-state176">${statusNames[st.state]}</span></span></button>`;
    }
    function draw() {
      const previous = new Map(
        [...host.querySelectorAll(".sc-grid176 [data-sc-select]")].map((n) => [
          n.dataset.scSelect,
          n.getBoundingClientRect(),
        ]),
      );
      refresh();
      const allTags = tags(skills.flatMap((s) => tags(s.tags))).sort((a, b) =>
        a.localeCompare(b, "ru"),
      );
      state.tags = state.tags.filter((t) =>
        allTags.some((x) => key(x) === key(t)),
      );
      const current = adapter.user(),
        focus = document.activeElement,
        rememberSearch = focus?.matches("[data-sc-search]"),
        caret = rememberSearch ? focus.selectionStart : 0;
      host.innerHTML = `<header class="sc-header176"><div><span class="sc-kicker176">РАЗВИТИЕ ПЕРСОНАЖА</span><h2>Навыки</h2></div><strong data-sc-points>${Number(current.skillPoints || 0)} <small>очков улучшения</small></strong></header><div class="sc-layout176"><aside class="sc-filters176"><label>Поиск<input class="input" type="search" data-sc-search placeholder="Название или тег" value="${esc(state.query)}"></label><details data-sc-filter-details ${root.matchMedia?.("(max-width: 540px)").matches ? "" : "open"}><summary>Фильтры</summary><label>Состояние<select class="select" data-sc-status>${[
        ["all", "Все навыки"],
        ["available", "Можно изучить"],
        ["owned", "Изученные"],
        ["unowned", "Неизученные"],
      ]
        .map(
          ([v, n]) =>
            `<option value="${v}" ${state.status === v ? "selected" : ""}>${n}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Требования к характеристике<select class="select" data-sc-ability><option value="">Любые</option><option value="general" ${state.ability === "general" ? "selected" : ""}>Общие · без требований к характеристикам</option>${Object.entries(
        labels,
      )
        .map(
          ([v, n]) =>
            `<option value="${v}" ${state.ability === v ? "selected" : ""}>${n}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Теги · любой из выбранных<select multiple class="select" data-sc-tags>${allTags.map((t) => `<option value="${esc(t)}" ${state.tags.includes(t) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label><button class="ghost" type="button" data-sc-reset>Сбросить фильтры</button></details><details class="sc-abilities176"><summary>Характеристики</summary>${Object.entries(
        labels,
      )
        .map(([k, n]) => {
          const value = Number(
              (current.abilityBase || current.abilities || {})[k] || 0,
            ),
            next = value + 1;
          return `<div><span>${n} <b>${value}</b></span><button type="button" class="secondary" data-sc-upgrade="${k}" ${adapter.readonly?.() || k === "glory" || next > 5 || Number(current.skillPoints || 0) < next ? "disabled" : ""}>${k === "glory" ? "ДМ" : value >= 5 ? "Макс." : `+1 · ${next} ОУ`}</button></div>`;
        })
        .join(
          "",
        )}</details></aside><section class="sc-main176"><nav class="sc-toolbar176" aria-label="Просмотр навыков"><div>${[
        ["catalog", "Каталог"],
        ["graph", "Связи"],
      ]
        .map(
          ([m, n]) =>
            `<button type="button" class="secondary ${state.mode === m ? "active" : ""}" data-sc-mode="${m}" aria-pressed="${state.mode === m}">${n}</button>`,
        )
        .join("")}</div><label>Порядок<select class="select" data-sc-sort>${[
        ["available", "Сначала доступные"],
        ["name", "По названию"],
        ["cost", "По стоимости"],
      ]
        .map(
          ([v, n]) =>
            `<option value="${v}" ${state.sort === v ? "selected" : ""}>${n}</option>`,
        )
        .join(
          "",
        )}</select></label></nav><div class="sc-content176"></div></section><aside class="sc-detail176" aria-label="Описание навыка"></aside></div><div class="sc-feedback176" role="status" aria-live="polite"></div>`;
      const content = host.querySelector(".sc-content176");
      if (state.mode === "catalog") {
        const rank = { available: 0, points: 1, locked: 2, gm: 3, owned: 4 };
        const filtered = skills.filter(
          (s) =>
            (!state.query ||
              key([s.name, ...tags(s.tags)].join(" ")).includes(
                key(state.query),
              )) &&
            (!state.tags.length ||
              tags(s.tags).some((t) =>
                state.tags.some((x) => key(x) === key(t)),
              )) &&
            (!state.ability ||
              (state.ability === "general"
                ? !abilities(s).length
                : abilities(s).some((r) => r.key === state.ability))) &&
            (state.status === "all" ||
              (state.status === "unowned" && !stats.get(String(s.id)).owned) ||
              (state.status === "owned" && stats.get(String(s.id)).owned) ||
              (state.status === "available" &&
                stats.get(String(s.id)).available)),
        );
        filtered.sort(
          (a, b) =>
            (state.sort === "available"
              ? rank[stats.get(String(a.id)).state] -
                rank[stats.get(String(b.id)).state]
              : state.sort === "cost"
                ? Number(a.cost ?? 1) - Number(b.cost ?? 1)
                : 0) ||
            String(a.name).localeCompare(String(b.name), "ru") ||
            String(a.id).localeCompare(String(b.id)),
        );
        content.innerHTML = `<p class="sc-count176">Показано ${filtered.length} из ${skills.length}</p><div class="sc-grid176">${filtered.map((s) => card(s)).join("") || '<p class="sc-empty176">Нет навыков по выбранным условиям.</p>'}</div>`;
        content.scrollTop = state.scroll;
        content.addEventListener(
          "scroll",
          () => (state.scroll = content.scrollTop),
          { passive: true },
        );
      } else drawGraph(content);
      detail();
      bind();
      root.GRPGCheckboxPickerV172?.enhance(host);
      if (!root.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        host.querySelectorAll(".sc-grid176 [data-sc-select]").forEach((n) => {
          const old = previous.get(n.dataset.scSelect);
          if (!old) return;
          const now = n.getBoundingClientRect(),
            x = old.x - now.x,
            y = old.y - now.y;
          if ((x || y) && Math.abs(x) + Math.abs(y) < 800)
            n.animate?.(
              [
                { transform: `translate(${x}px,${y}px)` },
                { transform: "translate(0,0)" },
              ],
              { duration: 180, easing: "ease-out" },
            );
        });
      if (rememberSearch) {
        const input = host.querySelector("[data-sc-search]");
        input.focus();
        input.setSelectionRange(caret, caret);
      }
    }
    function detail() {
      const pane = host.querySelector(".sc-detail176"),
        s = byId.get(state.selected);
      if (!s) {
        pane.innerHTML =
          '<div class="sc-empty176"><h3>Выберите навык</h3><p>Описание, требования и дальнейшее развитие появятся здесь.</p></div>';
        return;
      }
      pane.classList.toggle("sc-enter176", lastDetail !== state.selected);
      lastDetail = state.selected;
      const st = stats.get(state.selected),
        current = adapter.user();
      pane.innerHTML = `<div class="sc-detail-head176">${thumbnail(s)}<div><span class="sc-kicker176">${statusNames[st.state]}</span><h3>${esc(s.name)}</h3></div><button type="button" class="ghost" data-sc-close aria-label="Закрыть описание">×</button></div><div class="sc-tags176">${tags(
        s.tags,
      )
        .map((t) => `<span>${esc(t)}</span>`)
        .join(
          "",
        )}</div><div class="sc-rich176">${s.description ? rich(s.description) : "<p>Описание не задано.</p>"}</div><h4>Условия изучения</h4><ul class="sc-conditions176">${abilities(
        s,
      )
        .map(
          (r) =>
            `<li class="${Number(current.abilities?.[r.key] || 0) >= Number(r.value) ? "met" : ""}">${esc(labels[r.key] || r.key)}: ${Number(current.abilities?.[r.key] || 0)} / ${Number(r.value)}</li>`,
        )
        .join("")}${
        requirements(s)
          .map((id) => {
            const req = byId.get(id),
              owned = req && stats.get(id).owned;
            return `<li class="${owned ? "met" : ""}">${req ? `<button type="button" class="ghost" data-sc-select="${esc(id)}">${owned ? "✓ " : ""}${esc(req.name)}</button>` : "Скрытый или отсутствующий навык"}</li>`;
          })
          .join("") || (!abilities(s).length ? "<li>Нет требований.</li>" : "")
      }</ul>${adapter.readonly?.() ? '<p class="sc-warning176">Режим гостя: изменение профиля недоступно.</p>' : st.gm ? '<p class="sc-warning176">Этот навык выдаётся ДМом.</p>' : Number(current.skillPoints || 0) < Number(s.cost ?? 1) ? '<p class="sc-warning176">Недостаточно очков улучшения.</p>' : ""}<div class="sc-detail-actions176"><strong>${Number(s.cost ?? 1)} очк. улучшения</strong><button class="primary" type="button" data-sc-learn ${!st.available || busy ? "disabled" : ""}>${busy ? "Сохранение…" : st.owned ? "Изучено" : "Изучить"}</button><button class="secondary" type="button" data-sc-mode="graph">Показать связи</button></div>`;
    }
    function drawGraph(content) {
      const chosen = byId.get(state.selected);
      if (!chosen) {
        content.innerHTML =
          '<p class="sc-empty176">Выберите навык в каталоге, чтобы посмотреть его зависимости.</p>';
        return;
      }
      const items = related(skills, state.selected),
        g = layout(items);
      content.innerHTML = `<div class="sc-graph-tools176"><span>Связи выбранного навыка · ${items.length}</span><button class="ghost" data-sc-fit type="button">Вся цепочка</button><button class="ghost" data-sc-center type="button">К выбранному</button><button class="ghost" data-sc-zoom="out" type="button" aria-label="Уменьшить">−</button><span>${Math.round(state.zoom * 100)}%</span><button class="ghost" data-sc-zoom="in" type="button" aria-label="Увеличить">+</button><button class="ghost" data-sc-sort-graph type="button">Сбросить вид</button></div>${g.cyclic.length ? '<p class="sc-warning176">Обнаружен цикл требований. ДМ должен исправить связи в World Config.</p>' : ""}<p class="sc-count176">Показана цепочка независимо от фильтров каталога. Перетаскивайте свободное поле; Ctrl + колесо меняет масштаб.</p><div class="sc-viewport176" tabindex="0" aria-label="Полотно зависимостей"><div style="width:${g.width * state.zoom}px;height:${g.height * state.zoom}px"><div class="sc-canvas176" style="width:${g.width}px;height:${g.height}px;transform:scale(${state.zoom})"><svg width="${g.width}" height="${g.height}" aria-hidden="true"><defs><marker id="skill-arrow176" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" fill="#bfa476"></polygon></marker></defs>${g.edges
        .map((e) => {
          const a = g.positions.get(e.from),
            b = g.positions.get(e.to);
          return `<path marker-end="url(#skill-arrow176)" class="${e.from === state.selected || e.to === state.selected ? "selected" : ""}" d="M${a.x + 112},${a.y + 104} C${a.x + 112},${a.y + 126} ${b.x + 112},${b.y - 24} ${b.x + 112},${b.y}"></path>`;
        })
        .join(
          "",
        )}</svg>${items.map((s) => card(s, g.positions.get(String(s.id)))).join("")}</div></div></div>`;
      const view = content.querySelector(".sc-viewport176");
      view.scrollLeft = state.pan.left;
      view.scrollTop = state.pan.top;
      view.addEventListener(
        "scroll",
        () => (state.pan = { left: view.scrollLeft, top: view.scrollTop }),
        { passive: true },
      );
      let drag;
      view.addEventListener("pointerdown", (e) => {
        if ((e.button !== 0 && e.button !== 1) || e.target.closest("button"))
          return;
        drag = {
          x: e.clientX,
          y: e.clientY,
          left: view.scrollLeft,
          top: view.scrollTop,
        };
        view.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      view.addEventListener("pointermove", (e) => {
        if (drag) {
          view.scrollLeft = drag.left + drag.x - e.clientX;
          view.scrollTop = drag.top + drag.y - e.clientY;
        }
      });
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
        view.addEventListener(name, () => (drag = null));
      view.addEventListener(
        "wheel",
        (e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
        },
        { passive: false },
      );
      content.querySelector("[data-sc-fit]").onclick = () => {
        state.zoom = Math.max(
          0.05,
          Math.min(
            1.6,
            (view.clientWidth - 32) / g.width,
            (view.clientHeight - 32) / g.height,
          ),
        );
        state.pan = { left: 0, top: 0 };
        draw();
      };
      content.querySelector("[data-sc-center]").onclick = () => {
        const p = g.positions.get(state.selected);
        view.scrollTo({
          left: (p.x + 112) * state.zoom - view.clientWidth / 2,
          top: (p.y + 52) * state.zoom - view.clientHeight / 2,
          behavior: root.matchMedia?.("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      };
      content.querySelector("[data-sc-sort-graph]").onclick = () => {
        state.zoom = 1;
        state.pan = { left: 0, top: 0 };
        draw();
      };
    }
    function zoom(factor) {
      state.zoom = Math.max(0.05, Math.min(1.6, state.zoom * factor));
      draw();
    }
    async function action(fn) {
      if (busy || adapter.readonly?.()) return;
      busy = true;
      host
        .querySelectorAll("[data-sc-learn],[data-sc-upgrade]")
        .forEach((b) => (b.disabled = true));
      try {
        await fn();
      } catch (error) {
        adapter.error?.(error.message);
      } finally {
        busy = false;
        if (host.isConnected) draw();
      }
    }
    function bind() {
      host.querySelector("[data-sc-search]").oninput = (e) => {
        state.query = e.target.value;
        state.scroll = 0;
        draw();
      };
      for (const [attr, prop] of [
        ["status", "status"],
        ["ability", "ability"],
        ["sort", "sort"],
      ])
        host.querySelector(`[data-sc-${attr}]`).onchange = (e) => {
          state[prop] = e.target.value;
          state.scroll = 0;
          draw();
        };
      host.querySelector("[data-sc-tags]").onchange = (e) => {
        state.tags = [...e.target.selectedOptions].map((o) => o.value);
        state.scroll = 0;
        draw();
      };
      host.querySelector("[data-sc-reset]").onclick = () => {
        Object.assign(state, {
          query: "",
          tags: [],
          ability: "",
          status: "all",
          scroll: 0,
        });
        draw();
      };
      host.querySelectorAll("[data-sc-select]").forEach(
        (b) =>
          (b.onclick = () => {
            state.selected = b.dataset.scSelect;
            draw();
            host
              .querySelector(".sc-detail176 h3")
              ?.setAttribute("tabindex", "-1");
            host
              .querySelector(".sc-detail176 h3")
              ?.focus({ preventScroll: true });
            if (root.matchMedia?.("(max-width: 850px)").matches)
              host
                .querySelector(".sc-detail176")
                .scrollIntoView({
                  block: "start",
                  behavior: root.matchMedia?.(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "auto"
                    : "smooth",
                });
          }),
      );
      host.querySelectorAll("[data-sc-mode]").forEach(
        (b) =>
          (b.onclick = () => {
            state.mode = b.dataset.scMode;
            draw();
          }),
      );
      host.querySelector("[data-sc-close]")?.addEventListener("click", () => {
        state.selected = "";
        draw();
      });
      host
        .querySelector("[data-sc-learn]")
        ?.addEventListener("click", () =>
          action(() => adapter.learn(state.selected)),
        );
      host
        .querySelectorAll("[data-sc-upgrade]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              action(() => adapter.upgrade(b.dataset.scUpgrade))),
        );
      host
        .querySelectorAll("[data-sc-zoom]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              zoom(b.dataset.scZoom === "in" ? 1.15 : 1 / 1.15)),
        );
    }
    draw();
    return { refresh: draw, state };
  }
  root.addEventListener?.("resize", () => {
    const narrow = root.matchMedia?.("(max-width: 540px)").matches;
    document.querySelectorAll("[data-sc-filter-details]").forEach((el) => {
      if (el.dataset.narrow176 !== String(narrow)) {
        el.open = !narrow;
        el.dataset.narrow176 = String(narrow);
      }
    });
  });
  const api = { tags, key, requirements, related, layout, rich, mount, esc };
  root.GRPGSkillCatalogV176 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
