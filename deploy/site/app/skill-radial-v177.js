/* Radial presentation of existing skills. Layout is not a purchase requirement. */
(function (root) {
  "use strict";
  const C =
    root.GRPGSkillCatalogV176 ||
    (typeof require === "function" ? require("./skill-catalog-v176.js") : null);
  if (!C) return;
  const G=root.GRPGSkillGraphV185||(typeof require==='function'?require('./skill-graph-v185.js'):null);
  const branches=G.sectors;
  const branchMap=skills=>G.layout(skills).assignment;
  const radialLayout=(skills,groups)=>G.layout(skills,groups||{});
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
        common: false,
        filters: false,
        camera: null,
        commonScroll: 0,
      };
      sessions.set(identity, state);
    }
    host.dataset.radialIdentity185=identity;
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
      busy = false,
      lastSelected = "",
      mounted = true,renderedSignature185=null;
    const abort = new AbortController();
    host.__radial177?.dispose();
    host.__radial177 = {
      refresh:render,
      dispose() {
        mounted = false;
        abort.abort();
        resize.disconnect();
      },
    };
    const readStatus = (s) => {
      const r = adapter.status(s),
        structurallyBlocked=graph?.cycles.includes(String(s.id))||graph?.missing.some(e=>e.to===String(s.id)),
        available = r.available && !structurallyBlocked && !s.originOnly178;
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
      skills = adapter.skills().filter(s=>!s.originOnly178||adapter.status(s).owned);

      by = new Map(skills.map((s) => [String(s.id), s]));
      graph = radialLayout(skills,adapter.groups?.());
      if(state.branch==='general')state.branch="";
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
        (!state.branch || (graph.assignment.get(String(s.id)) === state.branch||(graph.assignment.get(String(s.id))!=='general'&&graph.positions.get(String(s.id)).anchors.includes(state.branch))))
      );
    }
    function thumb(s) {
      return adapter.thumb
        ? adapter.thumb(s)
        : `<span class="r177-glyph">${escape((s.name || "?").slice(0, 2))}</span>`;
    }
    function node(s) {
      const id = String(s.id),
        p = graph.positions.get(id),
        st = statuses.get(id),
        b = branches.find((b) => b.id === p.branch),
        color = b?.color || "#c9b58c",
        major = graph.edges.filter((e) => e.from === id).length > 1;
      return `<button type="button" class="r177-node ${st.state} ${major ? "notable" : ""} ${state.selected === id ? "selected" : ""}" data-r177-node="${escape(id)}" data-branch="${p.branch}" style="left:${p.x}px;top:${p.y}px;--branch:${color}" aria-label="${escape(s.name)} · ${labels[st.state]} · ${Number(s.cost ?? 1)} ОУ${s.isBasic ? ' · Базовый, выдан автоматически' : ''}" aria-pressed="${state.selected === id}" title="${escape(s.name)} · ${labels[st.state]}"><span class="r177-ring">${thumb(s)}${st.owned ? '<i aria-hidden="true">✓</i>' : ""}${s.isBasic?'<small class="r185-basic" title="Автоматически выдан всем персонажам">Базовый</small>':""}</span><span class="r177-name">${escape(s.name)}</span><span class="r185-req" title="Требования к характеристикам">${(s.requiredAbilities||[]).filter(r=>r.value>0).map(r=>`${escape(branches.find(b=>b.id===r.key)?.name||r.key)} ${Number(r.value)}`).join(' · ')}</span></button>`;
    }
    function commonCard(s){
      const id=String(s.id),st=statuses.get(id);
      return `<button type="button" class="r189-common-card ${st.state}" data-r177-result="${escape(id)}" data-common189="${escape(id)}"><span class="r189-common-thumb">${thumb(s)}</span><span><strong>${escape(s.name)}</strong><small>${escape(s.isBasic?'Базовый · выдан автоматически':adapter.source?.(s)||labels[st.state])}</small><small>${s.isBasic?'Без затрат ОУ':Number(s.cost??1)+' ОУ'}</small></span></button>`;
    }
    function commonWindow(){
      host.querySelector('.r177-common').hidden=!state.common;
      workspace.classList.toggle('has-common',state.common);
      host.querySelectorAll('[data-r177-common-toggle]').forEach(b=>b.setAttribute('aria-expanded',String(state.common)));
    }
    function edge(e) {
      const a = graph.positions.get(e.from),
        b = graph.positions.get(e.to),
        owned = statuses.get(e.from)?.owned && statuses.get(e.to)?.owned,
        color =
          branches.find((branch) => branch.id === a.branch)?.color || "#a39676";
      return `<path style="--edge-color:${color}" data-r177-edge="${escape(e.from)}|${escape(e.to)}" class="${owned ? "owned" : ""}" d="${graph.routes.get(e.from+'|'+e.to)||''}"/>`;
    }
    function render() {
      const focused=host.contains(document.activeElement)?document.activeElement:null;
      const searchState=focused?.matches('[data-r177-search]')?{start:focused.selectionStart,end:focused.selectionEnd,direction:focused.selectionDirection}:null;
      refresh();
      const user = adapter.user();
      if(renderedSignature185===graph.signature&&host.querySelector('.r177-world')){
        host.querySelectorAll('[data-r177-node]').forEach(n=>{const skill=by.get(n.dataset.r177Node),st=statuses.get(n.dataset.r177Node),imageKey=JSON.stringify([skill.image,skill.imageLocal,skill.imageStoragePath,skill.name]);n.querySelector('.r177-name').textContent=skill.name;n.title=skill.name+' · '+labels[st.state];if(n.dataset.image185!==imageKey){n.querySelector('.r177-ring').innerHTML=thumb(skill)+(skill.isBasic?'<small class="r185-basic" title="Автоматически выдан всем персонажам">Базовый</small>':'');n.dataset.image185=imageKey;}for(const key of ['owned','available','gm','points','locked'])n.classList.toggle(key,key===st.state);const mark=n.querySelector('.r177-ring i');if(st.owned&&!mark)n.querySelector('.r177-ring').insertAdjacentHTML('beforeend','<i aria-hidden="true">✓</i>');else if(!st.owned)mark?.remove();});
        host.querySelectorAll('[data-r177-edge]').forEach(n=>{const [a,b]=n.dataset.r177Edge.split('|');n.classList.toggle('owned',statuses.get(a)?.owned&&statuses.get(b)?.owned);});
        host.querySelector('.r177-points span').textContent=Number(user.skillPoints||0);
        host.querySelector('.r177-core small').textContent=skills.filter(s=>statuses.get(String(s.id)).owned).length+' / '+skills.length+' изучено';
        host.querySelectorAll('.r177-hub').forEach(n=>n.querySelector('b').textContent=Number(user.abilities?.[n.dataset.r177Branch]||0));
        host.querySelectorAll('[data-r177-upgrade]').forEach(n=>{const key=n.dataset.r177Upgrade,value=Number((user.abilityBase||user.abilities||{})[key]||0),cost=value+1;n.disabled=!!adapter.readonly?.()||key==='glory'||cost>5||cost>Number(user.skillPoints||0);n.textContent=key==='glory'?'ДМ':cost>5?'Макс.':'+1 · '+cost+' ОУ';n.previousElementSibling.textContent=(branches.find(b=>b.id===key)?.name||key)+': '+value;});
        commonWindow();host.querySelectorAll('[data-common189]').forEach(n=>{const skill=by.get(n.dataset.common189),st=statuses.get(n.dataset.common189);for(const key of ['owned','available','gm','points','locked'])n.classList.toggle(key,key===st.state);n.querySelector('strong').textContent=skill.name;const notes=n.querySelectorAll('small');notes[0].textContent=skill.isBasic?'Базовый · выдан автоматически':adapter.source?.(skill)||labels[st.state];notes[1].textContent=skill.isBasic?'Без затрат ОУ':Number(skill.cost??1)+' ОУ';const imageKey=JSON.stringify([skill.image,skill.imageLocal,skill.imageStoragePath,skill.name]);if(n.dataset.image189!==imageKey){n.querySelector('.r189-common-thumb').innerHTML=thumb(skill);n.dataset.image189=imageKey;}});
        host.querySelector('.r177-filter-panel').hidden=!state.filters;
        const search=host.querySelector('[data-r177-search]');if(search.value!==state.query)search.value=state.query;
        const status=host.querySelector('[data-r177-status]');status.value=state.status;
        host.querySelectorAll('[data-r177-tags] option').forEach(o=>o.selected=state.tags.includes(o.value));
        root.GRPGCheckboxPickerV172?.enhance(host);camera();filter();detail();return;
      }
      renderedSignature185=graph.signature;
      host.innerHTML = `<header class="r177-toolbar"><div class="r177-title"><span>РАЗВИТИЕ</span><h2>Созвездия навыков</h2></div><div class="r177-search"><input class="input" type="search" data-r177-search value="${escape(state.query)}" placeholder="Найти навык или тег" aria-label="Поиск навыков"><div class="r177-results" data-r177-results></div></div><button type="button" class="secondary" data-r177-abilities>Характеристики ↑</button><button type="button" class="ghost" data-r177-filters aria-expanded="${state.filters}">Фильтры</button><button type="button" class="ghost" data-r177-common-toggle aria-expanded="${state.common}">Общие · ${graph.common.length}</button><strong class="r177-points"><span>${Number(user.skillPoints || 0)}</span> ОУ</strong></header><nav class="r177-branches" aria-label="Ветки навыков"><button type="button" class="ghost" data-r177-branch="">Всё дерево</button>${branches.map((b) => `<button type="button" class="ghost" style="--branch:${b.color}" data-r177-branch="${b.id}"><i></i>${b.name}<small>${skills.filter((s) => (graph.assignment.get(String(s.id)) === b.id||(graph.assignment.get(String(s.id))!=='general'&&graph.positions.get(String(s.id)).anchors.includes(b.id)))).length}</small></button>`).join("")}${[...new Map(graph.groups.map(g=>[g.id,g])).values()].map(g=>`<button class="ghost" type="button" data-r185-group="${escape(g.id)}" title="${escape(g.description||'')}">${escape(g.name)}</button>`).join('')}</nav><div class="r177-workspace ${state.common ? "has-common" : ""}"><div class="r177-viewport" tabindex="0" aria-label="Дерево навыков: перетаскивание, колесо для масштаба"><div class="r177-world"><svg class="r177-map-lines" aria-hidden="true"></svg><button class="r177-core" type="button" data-r177-fit title="Показать всё дерево"><span class="r177-core-symbol">✧</span><strong>${escape(user.displayName || "Персонаж")}</strong><small>${skills.filter((s) => statuses.get(String(s.id)).owned).length} / ${skills.length} изучено</small></button>${branches.map((b) => `<button type="button" class="r177-hub" data-r177-branch="${b.id}" style="left:${Math.cos(b.angle) * 182}px;top:${Math.sin(b.angle) * 182}px;--branch:${b.color}"><span>${b.name}</span><b>${Number(user.abilities?.[b.id] || 0)}</b></button>`).join("")}${skills
        .filter((s) => graph.assignment.get(String(s.id)) !== "general")
        .map((s) => node(s))
        .join(
          "",
        )}</div></div><aside class="r177-common" ${state.common ? "" : "hidden"} role="dialog" aria-label="Общие навыки"><header><div><span>ВНЕ ВЕТОК</span><h3>Общие навыки</h3></div><button type="button" class="ghost" data-r177-common-toggle aria-label="Закрыть общие навыки">×</button></header><p>Условия изучения указаны в карточке навыка. Все требования обязательны.</p><div class="r177-common-scroll"><div class="r189-common-list">${graph.common.map(id=>commonCard(by.get(id))).join('')||'<p>Общих навыков нет.</p>'}</div></div></aside><div class="r177-camera-tools"><button type="button" class="ghost" data-r177-zoom="out" aria-label="Уменьшить">−</button><output data-r177-scale></output><button type="button" class="ghost" data-r177-zoom="in" aria-label="Увеличить">+</button><button type="button" class="ghost" data-r177-fit>Вписать</button><button type="button" class="ghost" data-r177-center>К персонажу</button><button type="button" class="ghost" data-r177-focus>К выбранному</button></div><div class="r177-legend"><span class="owned">● Изучено</span><span class="available">◉ Доступно</span><span>○ Закрыто</span><span>Базовый · выдан автоматически</span></div><div class="r177-hint" role="status" data-r177-count></div><aside class="r177-detail" hidden aria-label="Описание навыка"></aside><section class="r177-filter-panel" ${state.filters ? "" : "hidden"}><header><h3>Поиск и фильтры</h3><button class="ghost" type="button" data-r177-filters aria-label="Закрыть фильтры">×</button></header><label>Состояние<select class="select" data-r177-status>${[
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
        )}</select></label><button class="ghost" type="button" data-r177-reset>Сбросить фильтры</button></section><section class="r177-ability-panel" hidden aria-label="Повысить характеристики"><div class="row"><strong>Характеристики</strong><button class="ghost" type="button" data-r177-abilities>Закрыть</button></div><p>Повышение базового значения на 1 стоит столько ОУ, сколько составит новое значение. Максимум — 5.</p>${branches
        .map((b) => {
          const value = Number(
              (user.abilityBase || user.abilities || {})[b.id] || 0,
            ),
            cost = value + 1;
          return `<div class="r177-upgrade"><span>${b.name}: ${value}</span><button class="secondary" type="button" data-r177-upgrade="${b.id}" ${adapter.readonly?.() || b.id === "glory" || cost > 5 || cost > Number(user.skillPoints || 0) ? "disabled" : ""}>${b.id === "glory" ? "ДМ" : cost > 5 ? "Макс." : `+1 · ${cost} ОУ`}</button></div>`;
        })
        .join("")}</section></div>`;
      workspace = host.querySelector(".r177-workspace");
      viewport = host.querySelector(".r177-viewport");
      world = host.querySelector(".r177-world");
      const radial = [...graph.positions.values()].filter(
          (p) => p.branch !== "general",
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
          const r = Math.max(300,...radial.filter(p=>p.branch!=='general'&&(p.branch===b.id||p.anchors.includes(b.id))).map(p=>Math.hypot(p.x,p.y)+120)),
            a = b.angle - 0.46,
            c = b.angle + 0.46;
          return `<path class="r177-sector" fill="${b.color}" d="M0,0 L${Math.cos(a) * r},${Math.sin(a) * r} A${r},${r} 0 0 1 ${Math.cos(c) * r},${Math.sin(c) * r} Z"/>`;
        })
        .join(
          "",
        )}<circle class="r177-orbit" r="105"/><circle class="r177-orbit" r="182"/>${branches.map((b) => `<path class="r177-spoke" style="stroke:${b.color}" d="M${Math.cos(b.angle) * 115},${Math.sin(b.angle) * 115} L${Math.cos(b.angle) * 245},${Math.sin(b.angle) * 245}"/>`).join("")}${graph.groups.map(g=>`<rect class="r185-group" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="70"/><text class="r185-group-title" x="${g.x+20}" y="${g.y+24}">${escape(g.name)}</text>`).join('')}${graph.edges
        .filter(
          (e) =>
            graph.assignment.get(e.from) !== "general" &&
            graph.assignment.get(e.to) !== "general",
        )
        .map(edge)
        .join("")}`;
      const scroll = host.querySelector(".r177-common-scroll");
      scroll.scrollTop = state.commonScroll;
      scroll.onscroll = () => {
        state.commonScroll = scroll.scrollTop;
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
      if(searchState){const input=host.querySelector('[data-r177-search]');input.focus({preventScroll:true});input.setSelectionRange(searchState.start,searchState.end,searchState.direction);}
    }
    function pointsForBranch(id) {
      return [...graph.positions]
        .filter(([key, p]) => p.branch !== "general" && (!id || p.branch === id || (p.branch!=='general'&&p.anchors.includes(id))))
        .map(([, p]) => p);
    }
    function fit(id = "",groupId="") {
      const points = pointsForBranch(id).filter(p=>!groupId||p.groupId===groupId);
      if (!points.length) points.push({ x: -230, y: -230 }, { x: 230, y: 230 });
      if (!id&&!groupId) points.push({ x: -230, y: -230 }, { x: 230, y: 230 });
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
      if (p.branch === "general") {
        if (!state.common) {
          state.common = true;
          commonWindow();
        }
        host
          .querySelector(`[data-common189="${CSS.escape(id)}"]`)
          ?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: motion() ? "smooth" : "auto",
          });
      } else {
        state.common=false;commonWindow();
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
      host.querySelectorAll('[data-common189]').forEach(n=>{n.hidden=!matches(by.get(n.dataset.common189));if(!n.hidden)count++;n.classList.toggle('selected',n.dataset.common189===state.selected);});
      host.classList.toggle("r185-has-selection",!!state.selected);
      host.querySelectorAll("[data-r177-edge]").forEach((p) => {
        const [from, to] = p.dataset.r177Edge.split("|");
        p.classList.toggle(
          "selected",
          highlighted.has(from) && highlighted.has(to),
        );
      });
      host.querySelector("[data-r177-count]").textContent = graph.cycles.length||graph.missing.length||[...graph.routes.values()].some(d=>!d)
        ? "Проверьте зависимости и пересекающиеся ручные позиции в World Config"
        : state.query ||
            state.tags.length ||
            state.status !== "all" ||
            state.branch
          ? `Подсвечено: ${count} / ${skills.length}`
          : "Перетаскивайте поле · колесо или два пальца — масштаб";
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
                  `<button type="button" data-r177-result="${escape(s.id)}"><strong>${escape(s.name)}</strong><small>${["common","general"].includes(graph.assignment.get(String(s.id))) ? "Общие" : branches.find((b) => b.id === graph.assignment.get(String(s.id)))?.name || "Сочетания"}</small></button>`,
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
      pane.innerHTML = `<header><span class="r177-detail-thumb">${thumb(s)}</span><div><span>${p.branch==='general'?"Общие навыки":branch?.name||(p.branch==='combined'?"Сочетания характеристик":"Ветки характеристик")}</span><h3>${escape(s.name)}</h3><small>${escape(s.category||'Общие')} · </small><small>${labels[st.state]} · ${{ active: "Активный", passive: "Пассивный", reaction: "Реакция" }[s.activationType] || "Пассивный"}</small></div><button type="button" class="ghost" data-r177-close aria-label="Закрыть описание">×</button></header><div class="r177-detail-body"><div class="r177-tags">${C.tags(
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
      }</ul>${adapter.readonly?.() ? "<p>Режим гостя: изменение профиля недоступно.</p>" : ""}<p class="r185-source-note">${escape(s.isBasic?'Базовый — выдан автоматически':adapter.source?.(s)||s.originSource178?.name||'')}</p>${!st.owned&&!st.available?`<p role="status">${escape((st.reasons||[]).join(' · ')||'Изучение недоступно')}${graph.cycles.includes(String(s.id))?' · Циклическая зависимость':''}${graph.missing.some(e=>e.to===String(s.id))?' · Отсутствует обязательный навык':''}</p>`:''}<footer><strong>${Number(s.cost ?? 1)} ОУ</strong>${st.available&&!adapter.readonly?.()?`<button class="primary" type="button" data-r177-learn ${busy?"disabled":""}>${busy?"Сохранение…":"Изучить"}</button>`:""}</footer></div>`;
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
      if(graph.assignment.get(String(id))==='general'){state.branch='';state.common=true;commonWindow();}
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
        if(e.pointerType==='touch'&&performance.now()<suppressTouchClick)return;
        if(ignoreClick185){ignoreClick185=false;return;}
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
          state.common=false;commonWindow();
          state.branch = b.dataset.r177Branch;
          filter();
          fit(state.branch);
        }
        if (b.hasAttribute("data-r177-center")) {state.camera={x:viewport.clientWidth/2,y:viewport.clientHeight/2,z:1};camera();}
        if (b.hasAttribute("data-r177-fit")) {
          state.branch = "";
          filter();
          fit();
        }
        if (b.hasAttribute("data-r185-group")){state.common=false;commonWindow();state.branch="";filter();fit("",b.dataset.r185Group);}
        if (b.hasAttribute("data-r177-focus")) focus();
        if (b.hasAttribute("data-r177-zoom"))
          zoom(b.dataset.r177Zoom === "in" ? 1.2 : 1 / 1.2);
        if (b.hasAttribute("data-r177-common-toggle")) {
          state.common = !state.common;
          if(state.common){state.branch="";filter();}
          commonWindow();
        }
        if (b.hasAttribute("data-r177-abilities")) {
          const panel = host.querySelector(".r177-ability-panel");
          panel.hidden = !panel.hidden;
        }
        if (b.classList.contains("r177-hub"))
          host.querySelector(".r177-ability-panel").hidden = false;
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
          (state.selected || state.filters || state.searchOpen || state.common)
        ) {
          e.stopPropagation();
          if(!state.selected)state.common=false;
          commonWindow();
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
      let drag,ignoreClick185=false,pinch=null,gesture=false,suppressTouchClick=0;
      const touches=new Map();
      const pinchStart=()=>{const [a,b]=[...touches.values()],r=viewport.getBoundingClientRect();if(!a||!b)return;const center={x:(a.x+b.x)/2-r.x,y:(a.y+b.y)/2-r.y};pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center,camera:{...state.camera}};drag=null;gesture=true;viewport.classList.add('dragging');};
      viewport.onpointerdown = (e) => {
        if(e.pointerType==='touch'){
          touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
          viewport.setPointerCapture(e.pointerId);
          if(touches.size>=2){pinchStart();e.preventDefault();return;}
          // Touches on nodes can still become a pinch; a short tap selects them.
          drag={x:e.clientX,y:e.clientY,camera:{...state.camera},touch:true,tap:e.target.closest('button')};
          e.preventDefault();return;
        }
        const node=e.target.closest('[data-r177-node]');
        if(node&&adapter.move&&e.button===0){const id=node.dataset.r177Node;drag={id,node,x:e.clientX,y:e.clientY,p:{...graph.positions.get(id)}};viewport.setPointerCapture(e.pointerId);e.preventDefault();return;}
        if (
          (e.target.closest("button") && e.button !== 1) ||
          (e.button !== 0 && e.button !== 1)
        )
          return;
        drag = { x: e.clientX, y: e.clientY, camera: { ...state.camera } };
        viewport.setPointerCapture(e.pointerId);
        viewport.classList.add("dragging");
        e.preventDefault();
      };
      viewport.onpointermove = (e) => {
        if(touches.has(e.pointerId)){
          touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
          if(pinch&&touches.size>=2){
            const [a,b]=[...touches.values()],r=viewport.getBoundingClientRect(),x=(a.x+b.x)/2-r.x,y=(a.y+b.y)/2-r.y,z=Math.max(.08,Math.min(2.5,pinch.camera.z*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance)),ratio=z/pinch.camera.z;
            state.camera={x:x-(pinch.center.x-pinch.camera.x)*ratio,y:y-(pinch.center.y-pinch.camera.y)*ratio,z};camera();e.preventDefault();return;
          }
        }
        if (!drag) return;
        if(drag.touch&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4){drag.moved=true;gesture=true;viewport.classList.add('dragging');}
        if(drag.id){drag.moved=Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3;drag.point={x:drag.p.x+(e.clientX-drag.x)/state.camera.z,y:drag.p.y+(e.clientY-drag.y)/state.camera.z};drag.node.style.left=drag.point.x+'px';drag.node.style.top=drag.point.y+'px';return;}
        state.camera = {
          ...drag.camera,
          x: drag.camera.x + e.clientX - drag.x,
          y: drag.camera.y + e.clientY - drag.y,
        };
        camera();
      };
      for (const n of ["pointerup", "pointercancel", "lostpointercapture"])
        viewport.addEventListener(n, (e) => {
          if(e.pointerType==='touch'){
            if(!touches.has(e.pointerId))return;
            const tap=drag?.touch&&!drag.moved&&!gesture&&n==='pointerup'?drag.tap:null;
            touches.delete(e.pointerId);pinch=null;drag=null;
            if(touches.size>=2)pinchStart();
            else if(touches.size===1){const p=[...touches.values()][0];drag={...p,camera:{...state.camera},touch:true,moved:true};}
            else {viewport.classList.remove('dragging');gesture=false;}
            suppressTouchClick=performance.now()+700;
            if(tap)tap.click();return;
          }
          if(drag?.id&&drag.moved&&n==='pointerup'){adapter.move(drag.id,drag.point);ignoreClick185=true;drag=null;render();}
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
