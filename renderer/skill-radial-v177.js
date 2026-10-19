/* Radial presentation of existing skills. Layout is not a purchase requirement. */
(function (root) {
  "use strict";
  const C =
    root.GRPGSkillCatalogV176 ||
    (typeof require === "function" ? require("./skill-catalog-v176.js") : null);
  if (!C) return;
  const branches = [
    ["strength", "Сила", "#df9567"],
    ["dexterity", "Ловкость", "#64cdb5"],
    ["intelligence", "Интеллект", "#79b9f2"],
    ["will", "Воля", "#b69ae8"],
    ["endurance", "Выносливость", "#8cba75"],
    ["glory", "Слава", "#e2bf72"],
  ].map(([id, name, color], i) => ({
    id,
    name,
    color,
    angle: -Math.PI / 2 + (i * Math.PI) / 3,
  }));
  const branchIds = new Set(branches.map((b) => b.id));
  function branchMap(skills) {
    const by = new Map(skills.map((s) => [String(s.id), s])),
      memo = new Map();
    function visit(id, stack) {
      if (memo.has(id)) return memo.get(id);
      if (stack.has(id) || !by.has(id)) return "common";
      const s = by.get(id);
      if (s.treeBranch === "common" || branchIds.has(s.treeBranch)) {
        memo.set(id, s.treeBranch);
        return s.treeBranch;
      }
      const direct = branches.find((b) =>
        (s.requiredAbilities || []).some(
          (r) => r.key === b.id && Number(r.value) > 0,
        ),
      );
      if (direct) {
        memo.set(id, direct.id);
        return direct.id;
      }
      stack.add(id);
      const parent = C.requirements(s)
        .filter((p) => by.has(p))
        .sort()
        .map((p) => visit(p, new Set(stack)))
        .find((b) => b !== "common");
      const value = parent || "common";
      memo.set(id, value);
      return value;
    }
    [...by.keys()].sort().forEach((id) => visit(id, new Set()));
    return memo;
  }
  function radialLayout(skills) {
    const by = new Map(skills.map((s) => [String(s.id), s])),
      assignment = branchMap(skills),
      positions = new Map(),
      common = [],
      cycles = new Set();
    for (const b of branches) {
      const list = skills.filter((s) => assignment.get(String(s.id)) === b.id),
        local = new Map(list.map((s) => [String(s.id), s])),
        top = C.layout(list),
        rows = new Map(),
        roots = new Map();
      function rootOf(id, seen = new Set()) {
        if (roots.has(id)) return roots.get(id);
        if (seen.has(id)) return id;
        seen.add(id);
        const parent = C.requirements(local.get(id) || {})
            .filter((p) => local.has(p))
            .sort()[0],
          value = parent ? rootOf(parent, seen) : id;
        roots.set(id, value);
        return value;
      }
      for (const id of top.cyclic) cycles.add(id);
      for (const skill of list) {
        const id = String(skill.id),
          depth = Math.round((top.positions.get(id).y - 32) / 148);
        if (!rows.has(depth)) rows.set(depth, []);
        rows.get(depth).push(skill);
        rootOf(id);
      }
      const rootIds = [...new Set([...roots.values()])].sort(),
        weights = new Map(rootIds.map((id) => [id, 1]));
      for (const row of rows.values())
        for (const id of rootIds)
          weights.set(
            id,
            Math.max(
              weights.get(id),
              row.filter((s) => rootOf(String(s.id)) === id).length,
            ),
          );
      const total = [...weights.values()].reduce((a, b) => a + b, 0) || 1,
        lanes = new Map();
      let offset = -0.38;
      for (const id of rootIds) {
        const span = (0.76 * weights.get(id)) / total;
        lanes.set(id, { angle: offset + span / 2, span: span * 0.7 });
        offset += span;
      }
      let previous = 220;
      for (const [depth, row] of [...rows].sort((a, b) => a[0] - b[0])) {
        const groups = rootIds.map((id) => ({
          id,
          nodes: row
            .filter((s) => rootOf(String(s.id)) === id)
            .sort((a, b) => String(a.id).localeCompare(String(b.id))),
        }));
        const radius = Math.max(
          320 + depth * 145,
          previous + 125,
          (row.length * 110) / 0.76,
          ...groups.map((g) =>
            g.nodes.length > 1
              ? ((g.nodes.length - 1) * 100) / lanes.get(g.id).span
              : 0,
          ),
        );
        previous = radius;
        for (const group of groups) {
          const lane = lanes.get(group.id);
          group.nodes.forEach((skill, i) => {
            const angle =
              b.angle +
              lane.angle +
              (group.nodes.length === 1
                ? 0
                : (i / (group.nodes.length - 1) - 0.5) * lane.span);
            positions.set(String(skill.id), {
              x: Math.cos(angle) * radius,
              y: Math.sin(angle) * radius,
              branch: b.id,
              depth,
            });
          });
        }
      }
    }

    const generals = skills.filter(
        (s) => assignment.get(String(s.id)) === "common",
      ),
      top = C.layout(generals),
      rows = new Map();
    for (const id of top.cyclic) cycles.add(id);
    for (const s of generals) {
      const depth = Math.round((top.positions.get(String(s.id)).y - 32) / 148);
      if (!rows.has(depth)) rows.set(depth, []);
      rows.get(depth).push(s);
    }
    let rowIndex = 0;
    for (const [depth, row] of [...rows].sort((a, b) => a[0] - b[0])) {
      row.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      row.forEach((s, i) => {
        const pos = {
          x: 44 + (i % 3) * 86,
          y: 42 + (rowIndex + Math.floor(i / 3)) * 112,
          branch: "common",
          depth,
        };
        positions.set(String(s.id), pos);
        common.push(String(s.id));
      });
      rowIndex += Math.ceil(row.length / 3);
    }
    const edges = skills.flatMap((s) =>
      C.requirements(s)
        .filter((p) => by.has(p))
        .map((p) => ({ from: p, to: String(s.id) })),
    );
    return {
      positions,
      assignment,
      common,
      commonHeight: Math.max(170, rowIndex * 112 + 16),
      edges,
      cycles: [...cycles],
    };
  }
  const sessions = new Map(),
    escape = C.esc,
    labels = {
      owned: "Изучено",
      available: "Можно изучить",
      gm: "Выдаётся ДМом",
      points: "Недостаточно очков",
      locked: "Не выполнены условия",
    };
  function mount(host, adapter) {
    if (!host) return;
    const identity = adapter.key || adapter.user().id || "player";
    let state = sessions.get(identity);
    if (!state) {
      state = {
        selected: "",
        query: "",
        tags: [],
        status: "all",
        branch: "",
        common: !root.matchMedia?.("(max-width: 720px)").matches,
        filters: false,
        camera: null,
        commonScroll: 0,
      };
      sessions.set(identity, state);
    }
    host.classList.add("skill-catalog176", "radial-skills177");
    const modal = host.closest(".profile-extra-modal-v50");
    modal?.classList.add("skill-modal176", "radial-modal177");
    let skills = [],
      by,
      graph,
      statuses,
      viewport,
      workspace,
      world,
      raf = 0,
      busy = false,
      lastSelected = "",
      mounted = true;
    const abort = new AbortController();
    host.__radial177?.dispose();
    host.__radial177 = {
      dispose() {
        mounted = false;
        abort.abort();
        resize.disconnect();
        cancelAnimationFrame(raf);
      },
    };
    const readStatus = (s) => {
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
    };
    function refresh() {
      skills = adapter.skills();
      by = new Map(skills.map((s) => [String(s.id), s]));
      graph = radialLayout(skills);
      statuses = new Map(skills.map((s) => [String(s.id), readStatus(s)]));
      if (!by.has(state.selected)) state.selected = "";
    }
    function matches(s) {
      const r = statuses.get(String(s.id));
      return (
        (!state.query ||
          C.key([s.name, ...C.tags(s.tags)].join(" ")).includes(
            C.key(state.query),
          )) &&
        (!state.tags.length ||
          C.tags(s.tags).some((t) =>
            state.tags.some((x) => C.key(x) === C.key(t)),
          )) &&
        (state.status === "all" ||
          (state.status === "owned" && r.owned) ||
          (state.status === "available" && r.available)) &&
        (!state.branch || graph.assignment.get(String(s.id)) === state.branch)
      );
    }
    function thumb(s) {
      return adapter.thumb
        ? adapter.thumb(s)
        : `<span class="r177-glyph">${escape((s.name || "?").slice(0, 2))}</span>`;
    }
    function node(s, common = false) {
      const id = String(s.id),
        p = graph.positions.get(id),
        st = statuses.get(id),
        b = branches.find((b) => b.id === p.branch),
        color = b?.color || "#c9b58c",
        major = graph.edges.filter((e) => e.from === id).length > 1;
      return `<button type="button" class="r177-node ${st.state} ${major ? "notable" : ""} ${state.selected === id ? "selected" : ""}" data-r177-node="${escape(id)}" data-branch="${p.branch}" style="left:${p.x}px;top:${p.y}px;--branch:${color}" aria-label="${escape(s.name)} · ${labels[st.state]} · ${Number(s.cost ?? 1)} ОУ" aria-pressed="${state.selected === id}" title="${escape(s.name)} · ${labels[st.state]}"><span class="r177-ring">${thumb(s)}${st.owned ? '<i aria-hidden="true">✓</i>' : ""}</span><span class="r177-name">${escape(s.name)}</span></button>`;
    }
    function edge(e) {
      const a = graph.positions.get(e.from),
        b = graph.positions.get(e.to),
        owned = statuses.get(e.from)?.owned && statuses.get(e.to)?.owned,
        color =
          branches.find((branch) => branch.id === a.branch)?.color || "#a39676";
      return `<path style="--edge-color:${color}" data-r177-edge="${escape(e.from)}|${escape(e.to)}" class="${owned ? "owned" : ""}" d="M${a.x},${a.y} L${b.x},${b.y}"/>`;
    }
    function render() {
      refresh();
      const user = adapter.user(),
        commonCount = graph.common.length;
      host.innerHTML = `<header class="r177-toolbar"><div class="r177-title"><span>РАЗВИТИЕ</span><h2>Дерево навыков</h2></div><div class="r177-search"><input class="input" type="search" data-r177-search value="${escape(state.query)}" placeholder="Найти навык или тег" aria-label="Поиск навыков"><div class="r177-results" data-r177-results></div></div><button type="button" class="ghost" data-r177-filters aria-expanded="${state.filters}">Фильтры</button><button type="button" class="ghost" data-r177-common-toggle aria-expanded="${state.common}">Общие · ${commonCount}</button><strong class="r177-points"><span>${Number(user.skillPoints || 0)}</span> ОУ</strong></header><nav class="r177-branches" aria-label="Ветки навыков"><button type="button" class="ghost" data-r177-branch="">Всё дерево</button>${branches.map((b) => `<button type="button" class="ghost" style="--branch:${b.color}" data-r177-branch="${b.id}"><i></i>${b.name}<small>${skills.filter((s) => graph.assignment.get(String(s.id)) === b.id).length}</small></button>`).join("")}</nav><div class="r177-workspace ${state.common ? "has-common" : ""}"><div class="r177-viewport" tabindex="0" aria-label="Дерево навыков: перетаскивание, колесо для масштаба"><div class="r177-world"><svg class="r177-map-lines" aria-hidden="true"></svg><button class="r177-core" type="button" data-r177-fit title="Показать всё дерево"><span class="r177-core-symbol">✧</span><strong>${escape(user.displayName || "Персонаж")}</strong><small>${skills.filter((s) => statuses.get(String(s.id)).owned).length} / ${skills.length} изучено</small></button>${branches.map((b) => `<button type="button" class="r177-hub" data-r177-branch="${b.id}" style="left:${Math.cos(b.angle) * 182}px;top:${Math.sin(b.angle) * 182}px;--branch:${b.color}"><span>${b.name}</span><b>${Number(user.abilities?.[b.id] || 0)}</b></button>`).join("")}${skills
        .filter((s) => graph.assignment.get(String(s.id)) !== "common")
        .map((s) => node(s))
        .join(
          "",
        )}</div></div><aside class="r177-common" ${state.common ? "" : "hidden"} aria-label="Общие навыки"><header><div><span>ВНЕ ВЕТОК</span><h3>Общие навыки</h3></div><button type="button" class="ghost" data-r177-common-toggle aria-label="Свернуть общие навыки">×</button></header><p>Самостоятельные навыки и их зависимости</p><div class="r177-common-scroll"><div class="r177-common-canvas" style="height:${graph.commonHeight}px"><svg width="260" height="${graph.commonHeight}" aria-hidden="true">${graph.edges
        .filter(
          (e) =>
            graph.assignment.get(e.from) === "common" &&
            graph.assignment.get(e.to) === "common",
        )
        .map(edge)
        .join(
          "",
        )}</svg>${graph.common.map((id) => node(by.get(id), true)).join("")}${!commonCount ? '<p class="r177-empty">Общих навыков пока нет.</p>' : ""}</div></div></aside><svg class="r177-cross-lines" aria-hidden="true"></svg><div class="r177-camera-tools"><button type="button" class="ghost" data-r177-zoom="out" aria-label="Уменьшить">−</button><output data-r177-scale></output><button type="button" class="ghost" data-r177-zoom="in" aria-label="Увеличить">+</button><button type="button" class="ghost" data-r177-fit>Вписать</button><button type="button" class="ghost" data-r177-focus>К выбранному</button></div><div class="r177-legend"><span class="owned">● Изучено</span><span class="available">◉ Доступно</span><span>○ Закрыто</span><span title="Пунктир обозначает размещение в ветке, а не условие изучения">⋯ Ветка</span></div><div class="r177-hint" role="status" data-r177-count></div><aside class="r177-detail" hidden aria-label="Описание навыка"></aside><section class="r177-filter-panel" ${state.filters ? "" : "hidden"}><header><h3>Поиск и фильтры</h3><button class="ghost" type="button" data-r177-filters aria-label="Закрыть фильтры">×</button></header><label>Состояние<select class="select" data-r177-status>${[
        ["all", "Все навыки"],
        ["available", "Можно изучить"],
        ["owned", "Изученные"],
      ]
        .map(
          ([id, label]) =>
            `<option value="${id}" ${state.status === id ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Теги · любой из выбранных<select multiple class="select" data-r177-tags>${C.tags(
        skills.flatMap((s) => s.tags || []),
      )
        .sort((a, b) => a.localeCompare(b, "ru"))
        .map(
          (t) =>
            `<option value="${escape(t)}" ${state.tags.includes(t) ? "selected" : ""}>${escape(t)}</option>`,
        )
        .join(
          "",
        )}</select></label><button class="ghost" type="button" data-r177-reset>Сбросить фильтры</button><details><summary>Повысить характеристики</summary>${branches
        .map((b) => {
          const value = Number(
              (user.abilityBase || user.abilities || {})[b.id] || 0,
            ),
            cost = value + 1;
          return `<div class="r177-upgrade"><span>${b.name}: ${value}</span><button class="secondary" type="button" data-r177-upgrade="${b.id}" ${adapter.readonly?.() || b.id === "glory" || cost > 5 || cost > Number(user.skillPoints || 0) ? "disabled" : ""}>${b.id === "glory" ? "ДМ" : cost > 5 ? "Макс." : `+1 · ${cost} ОУ`}</button></div>`;
        })
        .join("")}</details></section></div>`;
      workspace = host.querySelector(".r177-workspace");
      viewport = host.querySelector(".r177-viewport");
      world = host.querySelector(".r177-world");
      const radial = [...graph.positions.values()].filter(
          (p) => p.branch !== "common",
        ),
        extent = Math.max(
          650,
          ...radial.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)) + 130),
        ),
        svg = host.querySelector(".r177-map-lines");
      svg.setAttribute(
        "viewBox",
        `${-extent} ${-extent} ${extent * 2} ${extent * 2}`,
      );
      svg.setAttribute("width", extent * 2);
      svg.setAttribute("height", extent * 2);
      svg.style.cssText = `left:${-extent}px;top:${-extent}px`;
      svg.innerHTML = `${branches
        .map((b) => {
          const r = extent * 0.98,
            a = b.angle - 0.46,
            c = b.angle + 0.46;
          return `<path class="r177-sector" fill="${b.color}" d="M0,0 L${Math.cos(a) * r},${Math.sin(a) * r} A${r},${r} 0 0 1 ${Math.cos(c) * r},${Math.sin(c) * r} Z"/>`;
        })
        .join(
          "",
        )}<circle class="r177-orbit" r="105"/><circle class="r177-orbit" r="182"/>${branches.map((b) => `<path class="r177-spoke" style="stroke:${b.color}" d="M${Math.cos(b.angle) * 115},${Math.sin(b.angle) * 115} L${Math.cos(b.angle) * 245},${Math.sin(b.angle) * 245}"/>`).join("")}${branches
        .map((b) => {
          const entries = [...graph.positions.values()].filter(
              (p) => p.branch === b.id,
            ),
            level = Math.min(...entries.map((p) => p.depth));
          return entries
            .filter((p) => p.depth === level)
            .map(
              (p) =>
                `<path class="r177-affiliation" style="--edge-color:${b.color}" d="M${Math.cos(b.angle) * 215},${Math.sin(b.angle) * 215} L${p.x},${p.y}"/>`,
            )
            .join("");
        })
        .join("")}${graph.edges
        .filter(
          (e) =>
            graph.assignment.get(e.from) !== "common" &&
            graph.assignment.get(e.to) !== "common",
        )
        .map(edge)
        .join("")}`;
      const scroll = host.querySelector(".r177-common-scroll");
      scroll.scrollTop = state.commonScroll;
      scroll.onscroll = () => {
        state.commonScroll = scroll.scrollTop;
        crossLines();
      };
      bind();
      C.mount === mount && root.GRPGCheckboxPickerV172?.enhance(host);
      if (!state.camera) {
        fit();
        if (state.camera.z < 0.72) {
          state.camera = {
            x: viewport.clientWidth / 2,
            y: viewport.clientHeight / 2,
            z: 0.72,
          };
          camera();
        }
      } else camera();
      filter();
      detail();
    }
    function pointsForBranch(id) {
      return [...graph.positions]
        .filter(([key, p]) => p.branch !== "common" && (!id || p.branch === id))
        .map(([, p]) => p);
    }
    function fit(id = "") {
      const points = pointsForBranch(id);
      if (!points.length) points.push({ x: -230, y: -230 }, { x: 230, y: 230 });
      if (!id) points.push({ x: -230, y: -230 }, { x: 230, y: 230 });
      const minX = Math.min(...points.map((p) => p.x)) - 100,
        maxX = Math.max(...points.map((p) => p.x)) + 100,
        minY = Math.min(...points.map((p) => p.y)) - 90,
        maxY = Math.max(...points.map((p) => p.y)) + 90,
        w = viewport.clientWidth,
        h = viewport.clientHeight,
        z = Math.max(
          0.08,
          Math.min(1.25, (w - 44) / (maxX - minX), (h - 60) / (maxY - minY)),
        );
      state.camera = {
        x: w / 2 - ((minX + maxX) / 2) * z,
        y: h / 2 - ((minY + maxY) / 2) * z,
        z,
      };
      camera();
    }
    function camera() {
      if (!world || !state.camera) return;
      const p = state.camera;
      world.style.transform = `translate(${p.x}px,${p.y}px) scale(${p.z})`;
      viewport.classList.toggle("zoomed-out", p.z < 0.52);
      host.querySelector("[data-r177-scale]").textContent =
        Math.round(p.z * 100) + "%";
      crossLines();
    }
    function zoom(
      factor,
      x = viewport.clientWidth / 2,
      y = viewport.clientHeight / 2,
    ) {
      const p = state.camera,
        z = Math.max(0.08, Math.min(2.5, p.z * factor)),
        ratio = z / p.z;
      state.camera = { x: x - (x - p.x) * ratio, y: y - (y - p.y) * ratio, z };
      camera();
    }
    function focus(id = state.selected) {
      if (!by.has(id)) return;
      const p = graph.positions.get(id);
      if (p.branch === "common") {
        if (!state.common) {
          state.common = true;
          render();
        }
        host
          .querySelector(`[data-r177-node="${CSS.escape(id)}"]`)
          ?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: motion() ? "smooth" : "auto",
          });
      } else {
        state.camera = {
          x: viewport.clientWidth / 2 - p.x,
          y: viewport.clientHeight / 2 - p.y,
          z: 1,
        };
        camera();
      }
    }
    function motion() {
      return !root.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    }
    function crossLines() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!mounted || !host.isConnected) return;
        const overlay = host.querySelector(".r177-cross-lines"),
          bounds = workspace.getBoundingClientRect(),
          view = viewport.getBoundingClientRect(),
          commonBounds = host
            .querySelector(".r177-common-scroll")
            .getBoundingClientRect();
        overlay.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
        overlay.innerHTML = !state.common
          ? ""
          : graph.edges
              .filter(
                (e) =>
                  (graph.assignment.get(e.from) === "common") !==
                  (graph.assignment.get(e.to) === "common"),
              )
              .map((e) => {
                const a = host
                    .querySelector(
                      `[data-r177-node="${CSS.escape(e.from)}"] .r177-ring`,
                    )
                    ?.getBoundingClientRect(),
                  b = host
                    .querySelector(
                      `[data-r177-node="${CSS.escape(e.to)}"] .r177-ring`,
                    )
                    ?.getBoundingClientRect();
                if (!a || !b) return "";
                const visible = (r, isCommon) => {
                  const clip = isCommon ? commonBounds : view;
                  return (
                    r.left >= clip.left &&
                    r.right <= clip.right &&
                    r.top >= clip.top &&
                    r.bottom <= clip.bottom
                  );
                };
                if (
                  !visible(a, graph.assignment.get(e.from) === "common") ||
                  !visible(b, graph.assignment.get(e.to) === "common")
                )
                  return "";
                return `<path data-r177-edge="${escape(e.from)}|${escape(e.to)}" class="${state.selected === e.from || state.selected === e.to ? "selected" : ""}" d="M${a.x + a.width / 2 - bounds.x},${a.y + a.height / 2 - bounds.y} L${b.x + b.width / 2 - bounds.x},${b.y + b.height / 2 - bounds.y}"/>`;
              })
              .join("");
      });
    }
    function filter() {
      let count = 0;
      const highlighted = new Set(
        state.selected
          ? C.related(skills, state.selected).map((s) => String(s.id))
          : [],
      );
      host.querySelectorAll("[data-r177-node]").forEach((n) => {
        const id = n.dataset.r177Node,
          match = matches(by.get(id));
        if (match) count++;
        n.classList.toggle("filtered", !match);
        n.classList.toggle("selected", id === state.selected);
        n.classList.toggle("related", highlighted.has(id));
        n.setAttribute("aria-pressed", String(id === state.selected));
      });
      host.querySelectorAll("[data-r177-edge]").forEach((p) => {
        const [from, to] = p.dataset.r177Edge.split("|");
        p.classList.toggle(
          "selected",
          highlighted.has(from) && highlighted.has(to),
        );
      });
      host.querySelector("[data-r177-count]").textContent = graph.cycles.length
        ? "Есть цикл требований — исправьте его в World Config"
        : state.query ||
            state.tags.length ||
            state.status !== "all" ||
            state.branch
          ? `Подсвечено: ${count} / ${skills.length}`
          : "Перетаскивайте поле · колесо — масштаб";
      host
        .querySelectorAll("[data-r177-branch]")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.r177Branch === state.branch),
        );
      const results = host.querySelector("[data-r177-results]");
      results.innerHTML =
        state.query && state.searchOpen
          ? skills
              .filter(matches)
              .slice(0, 12)
              .map(
                (s) =>
                  `<button type="button" data-r177-result="${escape(s.id)}"><strong>${escape(s.name)}</strong><small>${graph.assignment.get(String(s.id)) === "common" ? "Общие" : branches.find((b) => b.id === graph.assignment.get(String(s.id)))?.name}</small></button>`,
              )
              .join("") || "<p>Навыки не найдены</p>"
          : "";
    }
    function detail() {
      const pane = host.querySelector(".r177-detail"),
        s = by.get(state.selected);
      pane.hidden = !s;
      if (!s) return;
      const st = statuses.get(state.selected),
        user = adapter.user(),
        p = graph.positions.get(state.selected),
        branch = branches.find((b) => b.id === p.branch);
      pane.classList.toggle("r177-enter", lastSelected !== state.selected);
      lastSelected = state.selected;
      pane.innerHTML = `<header><span class="r177-detail-thumb">${thumb(s)}</span><div><span>${branch?.name || "Общие навыки"}</span><h3>${escape(s.name)}</h3><small>${labels[st.state]} · ${{active:'Активный',passive:'Пассивный',reaction:'Реакция'}[s.activationType]||'Пассивный'}</small></div><button type="button" class="ghost" data-r177-close aria-label="Закрыть описание">×</button></header><div class="r177-detail-body"><div class="r177-tags">${C.tags(
        s.tags,
      )
        .map((t) => `<span>${escape(t)}</span>`)
        .join(
          "",
        )}</div><div class="sc-rich176">${C.rich(s.description || "Описание не задано.")}</div><h4>Условия изучения</h4><ul>${(
        s.requiredAbilities || []
      )
        .filter((r) => Number(r.value) > 0)
        .map(
          (r) =>
            `<li class="${Number(user.abilities?.[r.key] || 0) >= r.value ? "met" : ""}">${escape(branches.find((b) => b.id === r.key)?.name || r.key)}: ${Number(user.abilities?.[r.key] || 0)} / ${Number(r.value)}</li>`,
        )
        .join("")}${
        C.requirements(s)
          .map(
            (id) =>
              `<li>${by.has(id) ? `<button type="button" class="ghost" data-r177-result="${escape(id)}">${statuses.get(id)?.owned ? "✓ " : ""}${escape(by.get(id).name)}</button>` : "Скрытый или отсутствующий навык"}</li>`,
          )
          .join("") ||
        (!(s.requiredAbilities || []).some((r) => r.value > 0)
          ? "<li>Нет требований</li>"
          : "")
      }</ul>${adapter.readonly?.() ? "<p>Режим гостя: изменение профиля недоступно.</p>" : ""}<footer><strong>${Number(s.cost ?? 1)} ОУ</strong><button class="primary" type="button" data-r177-learn ${!st.available || busy ? "disabled" : ""}>${busy ? "Сохранение…" : st.owned ? "Изучено" : "Изучить"}</button></footer></div>`;
    }
    async function act(fn) {
      if (busy || adapter.readonly?.()) return;
      busy = true;
      host
        .querySelectorAll("[data-r177-learn],[data-r177-upgrade]")
        .forEach((b) => (b.disabled = true));
      try {
        await fn();
      } catch (e) {
        adapter.error?.(e.message);
      } finally {
        busy = false;
        if (mounted && host.isConnected) render();
      }
    }
    function choose(id, center = false) {
      state.selected = id;
      state.searchOpen = false;
      state.filters = false;
      host.querySelector(".r177-filter-panel").hidden = true;
      host
        .querySelector("[data-r177-filters]")
        .setAttribute("aria-expanded", "false");
      detail();
      filter();
      if (center) focus(id);
      host.querySelector("[data-r177-results]").innerHTML = "";
      host.querySelector(".r177-detail h3")?.setAttribute("tabindex", "-1");
      host.querySelector(".r177-detail h3")?.focus({ preventScroll: true });
    }
    function bind() {
      host.onclick = (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-r177-node")) choose(b.dataset.r177Node);
        if (b.hasAttribute("data-r177-result"))
          choose(b.dataset.r177Result, true);
        if (b.hasAttribute("data-r177-close")) {
          state.selected = "";
          lastSelected = "";
          detail();
          filter();
        }
        if (b.hasAttribute("data-r177-branch")) {
          state.branch = b.dataset.r177Branch;
          filter();
          fit(state.branch);
        }
        if (b.hasAttribute("data-r177-fit")) {
          state.branch = "";
          filter();
          fit();
        }
        if (b.hasAttribute("data-r177-focus")) focus();
        if (b.hasAttribute("data-r177-zoom"))
          zoom(b.dataset.r177Zoom === "in" ? 1.2 : 1 / 1.2);
        if (b.hasAttribute("data-r177-common-toggle")) {
          state.common = !state.common;
          render();
        }
        if (b.hasAttribute("data-r177-filters")) {
          state.filters = !state.filters;
          host.querySelector(".r177-filter-panel").hidden = !state.filters;
          host
            .querySelector("[data-r177-filters]")
            .setAttribute("aria-expanded", state.filters);
        }
        if (b.hasAttribute("data-r177-learn"))
          act(() => adapter.learn(state.selected));
        if (b.hasAttribute("data-r177-upgrade"))
          act(() => adapter.upgrade(b.dataset.r177Upgrade));
        if (b.hasAttribute("data-r177-reset")) {
          state.tags = [];
          state.status = "all";
          state.query = "";
          state.branch = "";
          render();
        }
      };
      host.querySelector("[data-r177-search]").oninput = (e) => {
        state.query = e.target.value;
        state.branch = "";
        state.searchOpen = true;
        filter();
      };
      host.querySelector("[data-r177-search]").onfocus = () => {
        state.searchOpen = true;
        filter();
      };
      host.onkeydown = (e) => {
        if (
          e.key === "Escape" &&
          (state.selected || state.filters || state.searchOpen)
        ) {
          e.stopPropagation();
          state.selected = "";
          state.filters = false;
          state.searchOpen = false;
          host.querySelector(".r177-filter-panel").hidden = true;
          detail();
          filter();
          viewport.focus({ preventScroll: true });
        }
      };
      host.querySelector("[data-r177-status]").onchange = (e) => {
        state.status = e.target.value;
        filter();
      };
      host.querySelector("[data-r177-tags]").onchange = (e) => {
        state.tags = [...e.target.selectedOptions].map((o) => o.value);
        filter();
      };
      let drag;
      viewport.onpointerdown = (e) => {
        if ((e.target.closest("button") && e.button !== 1) || (e.button !== 0 && e.button !== 1))
          return;
        drag = { x: e.clientX, y: e.clientY, camera: { ...state.camera } };
        viewport.setPointerCapture(e.pointerId);
        viewport.classList.add("dragging");
        e.preventDefault();
      };
      viewport.onpointermove = (e) => {
        if (!drag) return;
        state.camera = {
          ...drag.camera,
          x: drag.camera.x + e.clientX - drag.x,
          y: drag.camera.y + e.clientY - drag.y,
        };
        camera();
      };
      for (const n of ["pointerup", "pointercancel", "lostpointercapture"])
        viewport.addEventListener(n, () => {
          drag = null;
          viewport.classList.remove("dragging");
        });
      viewport.onwheel = (e) => {
        e.preventDefault();
        const r = viewport.getBoundingClientRect();
        zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.x, e.clientY - r.y);
      };
      viewport.onkeydown = (e) => {
        if (e.target !== viewport) return;
        const p = state.camera;
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        ) {
          e.preventDefault();
          p.x += e.key === "ArrowLeft" ? 50 : e.key === "ArrowRight" ? -50 : 0;
          p.y += e.key === "ArrowUp" ? 50 : e.key === "ArrowDown" ? -50 : 0;
          camera();
        }
        if (e.key === "+" || e.key === "=") zoom(1.2);
        if (e.key === "-") zoom(1 / 1.2);
      };
    }
    let lastSize = null;
    const resize = new ResizeObserver(() => {
      if (!host.isConnected) {
        host.__radial177.dispose();
        return;
      }
      const size = {
        w: viewport?.clientWidth || 0,
        h: viewport?.clientHeight || 0,
      };
      if (state.camera && lastSize) {
        state.camera.x += (size.w - lastSize.w) / 2;
        state.camera.y += (size.h - lastSize.h) / 2;
      }
      lastSize = size;
      if (state.camera) camera();
    });
    resize.observe(host);
    render();
    return { refresh: render, state };
  }
  const api = { branches, branchMap, layout: radialLayout, mount };
  root.GRPGSkillRadialV177 = api;
  C.mount = mount;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
