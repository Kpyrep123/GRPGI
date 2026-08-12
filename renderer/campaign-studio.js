/* v1.0.57 Campaign Studio — persistent local view state + drag-to-connect graph ports */
(() => {
  'use strict';
  if (window.__campaignStudioV1057) return;
  window.__campaignStudioV1057 = true;

  const STORE_VERSION = 1;
  const NODE_W = 250;
  const NODE_H = 112;
  const CAMPAIGN_KEY = 'grpg-campaign-studio-campaign-v1056';
  const MODE_KEY = 'grpg-campaign-studio-mode-v1056';
  const VIEW_KEY = 'grpg-campaign-studio-view-v1057';
  const PORTS = ['top', 'right', 'bottom', 'left'];
  const PLOT_TYPES = {
    scene: 'Сюжетный элемент',
    random: 'Случайное событие',
    ending: 'Финал / исход'
  };
  const STATUS_LABELS = {
    planned: 'Запланировано',
    active: 'Активно',
    completed: 'Завершено',
    failed: 'Сорвано'
  };

  const hx = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const clone = value => {
    try { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  };
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const slug = (value, prefix = 'id') => {
    const raw = String(value || '').trim().toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 56);
    return raw || `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
  };
  const arr = value => Array.isArray(value) ? value : [];
  const unique = value => Array.from(new Set(arr(value).map(v => String(v || '').trim()).filter(Boolean)));
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clampV = (value, min, max) => Math.max(min, Math.min(max, num(value, min)));
  const allCampaigns = () => {
    const rows = Object.values(Data?.campaigns || {}).filter(c => String(c?.status || '').toLowerCase() !== 'guest');
    return typeof sortEntitiesForList === 'function' ? sortEntitiesForList(rows) : rows.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ru'));
  };
  const campaignById = id => Data?.campaigns?.[id] || Data?.getCampaign?.(id) || null;

  function normalizeMilestone(raw = {}, index = 0) {
    const name = String(raw.name || raw.title || `Веха ${index + 1}`).trim();
    return {
      id: String(raw.id || slug(name, 'milestone')).trim(),
      name,
      description: String(raw.description || raw.desc || '').trim(),
      reached: raw.reached === true || raw.completed === true || raw.active === true
    };
  }
  function normalizeMilestones(value) {
    const seen = new Set();
    return arr(value).map(normalizeMilestone).filter(item => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id); return true;
    });
  }
  function campaignMilestones(campaignId) {
    const campaign = campaignById(campaignId);
    if (!campaign) return [];
    campaign.plotMilestones = normalizeMilestones(campaign.plotMilestones || campaign.milestones || []);
    return campaign.plotMilestones;
  }
  function loadMilestonesFromPayload(payload = {}) {
    const raw = payload?.campaigns?.CAMPAIGNS || {};
    Object.entries(raw).forEach(([id, source]) => {
      const target = campaignById(id);
      if (!target) return;
      target.plotMilestones = normalizeMilestones(source?.plotMilestones || source?.milestones || target.plotMilestones || []);
    });
  }

  function normalizeCamera(raw = {}) {
    return { x: num(raw.x, 80), y: num(raw.y, 80), zoom: clampV(raw.zoom, .35, 1.85) || 1 };
  }
  function normalizeKnowledgeNode(raw = {}, index = 0) {
    const kind = raw.kind === 'note' ? 'note' : 'entity';
    return {
      id: String(raw.id || uid('knowledge')),
      kind,
      entityType: kind === 'entity' ? String(raw.entityType || raw.type || '') : '',
      entityId: kind === 'entity' ? String(raw.entityId || raw.refId || '') : '',
      title: String(raw.title || (kind === 'note' ? `Заметка ${index + 1}` : raw.entityId || 'Сущность')).trim(),
      note: String(raw.note || raw.notes || '').trim(),
      x: num(raw.x, 680 + (index % 4) * 290),
      y: num(raw.y, 360 + Math.floor(index / 4) * 170)
    };
  }
  function normalizeEdge(raw = {}) {
    const validPort = value => PORTS.includes(String(value || '')) ? String(value) : '';
    return { id: String(raw.id || uid('edge')), from: String(raw.from || ''), to: String(raw.to || ''), label: String(raw.label || '').trim(), fromPort: validPort(raw.fromPort), toPort: validPort(raw.toPort) };
  }
  function normalizeCondition(raw = {}, index = 0) {
    return {
      id: String(raw.id || uid('condition')),
      name: String(raw.name || `Условие ${index + 1}`).trim(),
      notes: String(raw.notes || raw.description || '').trim(),
      milestoneIds: unique(raw.milestoneIds || raw.milestones || []),
      mode: String(raw.mode || 'all') === 'any' ? 'any' : 'all',
      x: num(raw.x, 740 + (index % 3) * 310),
      y: num(raw.y, 220 + Math.floor(index / 3) * 190)
    };
  }
  function normalizePlotNode(raw = {}, index = 0) {
    const type = ['scene', 'random', 'ending'].includes(raw.type) ? raw.type : 'scene';
    const status = Object.prototype.hasOwnProperty.call(STATUS_LABELS, raw.status) ? raw.status : 'planned';
    return {
      id: String(raw.id || uid('plot')),
      type,
      title: String(raw.title || PLOT_TYPES[type] || `Сюжет ${index + 1}`).trim(),
      description: String(raw.description || raw.note || '').trim(),
      conditionId: String(raw.conditionId || ''),
      randomWeight: Math.max(1, Math.floor(num(raw.randomWeight ?? raw.weight, 10))),
      status,
      conditionFromPort: PORTS.includes(String(raw.conditionFromPort || '')) ? String(raw.conditionFromPort) : '',
      conditionToPort: PORTS.includes(String(raw.conditionToPort || '')) ? String(raw.conditionToPort) : '',
      x: num(raw.x, 720 + (index % 4) * 300),
      y: num(raw.y, 480 + Math.floor(index / 4) * 190)
    };
  }
  function normalizeCampaignWorkspace(raw = {}) {
    return {
      knowledge: {
        camera: normalizeCamera(raw?.knowledge?.camera),
        nodes: arr(raw?.knowledge?.nodes).map(normalizeKnowledgeNode),
        edges: arr(raw?.knowledge?.edges).map(normalizeEdge).filter(e => e.from && e.to && e.from !== e.to)
      },
      plot: {
        camera: normalizeCamera(raw?.plot?.camera),
        nodes: arr(raw?.plot?.nodes).map(normalizePlotNode),
        conditions: arr(raw?.plot?.conditions).map(normalizeCondition),
        edges: arr(raw?.plot?.edges).map(normalizeEdge).filter(e => e.from && e.to && e.from !== e.to)
      }
    };
  }
  function normalizeStore(raw = {}) {
    const source = raw?.campaigns && typeof raw.campaigns === 'object' ? raw.campaigns : {};
    return {
      version: STORE_VERSION,
      updatedAt: num(raw?.updatedAt, 0),
      campaigns: Object.fromEntries(Object.entries(source).map(([id, value]) => [id, normalizeCampaignWorkspace(value)]))
    };
  }
  function loadLocalViews() {
    try {
      const parsed = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }
  function saveLocalViews(value) {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(value || {})); } catch {}
  }
  function validSelectionFor(studio, id, kind) {
    if (!id) return false;
    if (studio.mode === 'knowledge') return !!studio.knowledge()?.nodes.some(node => node.id === id);
    if (kind === 'condition') return !!studio.plot()?.conditions.some(node => node.id === id);
    return !!studio.plot()?.nodes.some(node => node.id === id);
  }

  const Studio = {
    store: normalizeStore(worldData?.campaignStudio || {}),
    campaignId: '',
    mode: localStorage.getItem(MODE_KEY) === 'plot' ? 'plot' : 'knowledge',
    selectedId: null,
    selectedKind: null,
    saveTimer: null,
    saving: false,
    drag: null,
    pan: null,
    lastRandomId: '',
    catalogQuery: '',
    localViews: loadLocalViews(),
    localDirty: false,
    linkDrag: null,
    domScroll: { sidebar: 0, inspector: 0 },

    currentCampaign() { return campaignById(this.campaignId); },
    workspace(id = this.campaignId) {
      if (!id) return null;
      if (!this.store.campaigns[id]) this.store.campaigns[id] = normalizeCampaignWorkspace({});
      return this.store.campaigns[id];
    },
    knowledge() { return this.workspace()?.knowledge || null; },
    plot() { return this.workspace()?.plot || null; },
    camera() { return this.mode === 'plot' ? this.plot()?.camera : this.knowledge()?.camera; },
    viewKey(campaignId = this.campaignId, mode = this.mode) { return `${campaignId || '_'}::${mode === 'plot' ? 'plot' : 'knowledge'}`; },
    captureDomState() {
      const sidebar = document.querySelector('#mod-campaign-studio .cs-sidebar-v1056');
      const inspector = document.querySelector('#mod-campaign-studio .cs-inspector-v1056');
      if (sidebar) this.domScroll.sidebar = sidebar.scrollTop;
      if (inspector) this.domScroll.inspector = inspector.scrollTop;
    },
    captureLocalView() {
      if (!this.campaignId) return;
      const camera = this.camera();
      const key = this.viewKey();
      this.localViews[key] = {
        camera: camera ? normalizeCamera(camera) : normalizeCamera({}),
        selectedId: String(this.selectedId || ''),
        selectedKind: String(this.selectedKind || ''),
        catalogQuery: String(this.catalogQuery || '')
      };
      saveLocalViews(this.localViews);
    },
    restoreLocalView() {
      if (!this.campaignId) return;
      const state = this.localViews[this.viewKey()] || {};
      const camera = this.camera();
      if (camera && state.camera) Object.assign(camera, normalizeCamera(state.camera));
      if (typeof state.catalogQuery === 'string') this.catalogQuery = state.catalogQuery;
      const id = String(state.selectedId || '');
      const kind = String(state.selectedKind || (this.mode === 'knowledge' ? 'knowledge' : 'plot'));
      if (validSelectionFor(this, id, kind)) { this.selectedId = id; this.selectedKind = kind; }
      else { this.selectedId = null; this.selectedKind = null; }
    },
    rememberViewSoon() { this.captureLocalView(); },

    load(payload = {}) {
      // Realtime/world refresh must never own the local camera or selection.
      this.captureDomState();
      this.captureLocalView();
      const incoming = normalizeStore(payload?.campaignStudio || worldData?.campaignStudio || this.store);
      if (!this.localDirty && !this.saving && num(incoming.updatedAt, 0) >= num(this.store?.updatedAt, 0)) this.store = incoming;
      loadMilestonesFromPayload(payload);
      const ids = new Set(allCampaigns().map(c => c.id));
      if (!ids.has(this.campaignId)) this.campaignId = '';
      this.ensureCampaignSelection();
      this.restoreLocalView();
      if (UI?.activeModuleId === 'campaign-studio') this.render({ preserveSelection: true, preserveScroll: true, externalRefresh: true });
    },
    ensureCampaignSelection() {
      const campaigns = allCampaigns();
      const saved = String(localStorage.getItem(CAMPAIGN_KEY) || '');
      if (!this.campaignId) this.campaignId = campaigns.some(c => c.id === saved) ? saved : campaigns[0]?.id || '';
      if (this.campaignId) localStorage.setItem(CAMPAIGN_KEY, this.campaignId);
      return this.campaignId;
    },
    updateEra() {
      const campaign = this.currentCampaign();
      if (campaign?.era) document.documentElement.dataset.eraTheme = String(campaign.era);
    },
    updateAccess() {
      const btn = document.getElementById('campaign-studio-dock-btn');
      if (!btn) return;
      btn.style.display = String(App?.currentUser?.role || '').toLowerCase() === 'gm' ? 'grid' : 'none';
    },
    open() {
      if (String(App?.currentUser?.role || '').toLowerCase() !== 'gm') { Toast?.show?.('Campaign Studio доступен только ДМу', 'err'); return; }
      this.ensureCampaignSelection();
      this.updateEra();
      UI.openModule('campaign-studio');
    },
    scheduleSave(reason = 'campaign-studio-change') {
      this.localDirty = true;
      this.store.updatedAt = Date.now();
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.persist(reason, { silent: true }), 700);
    },
    async persist(reason = 'campaign-studio-save', options = {}) {
      if (this.saving || !window.electronAPI?.saveWorldData) return;
      this.saving = true;
      try {
        if (worldData && typeof worldData === 'object') worldData.campaignStudio = clone(this.store);
        const snapshot = buildWorldSnapshot();
        snapshot.campaignStudio = clone(this.store);
        const res = await window.electronAPI.saveWorldData(snapshot);
        if (!res?.ok) throw new Error(res?.message || 'Не удалось сохранить Campaign Studio');
        try { Sync?.markLocalDirty?.('CAMPAIGN_STUDIO_EDIT'); } catch {}
        try { await Sync?.pushCurrentSnapshot?.(reason, { silent: true }); } catch (err) { Debug?.error?.('CAMPAIGN_STUDIO_SYNC_FAILED', { message: err?.message || String(err) }); }
        this.localDirty = false;
        if (!options.silent) Toast?.show?.('Campaign Studio сохранён', 'ok');
      } catch (err) {
        Debug?.error?.('CAMPAIGN_STUDIO_SAVE_FAILED', { message: err?.message || String(err) });
        if (!options.silent) Toast?.show?.(`Ошибка сохранения: ${err?.message || err}`, 'err');
      } finally { this.saving = false; }
    },

    render(options = {}) {
      if (String(App?.currentUser?.role || '').toLowerCase() !== 'gm') return;
      if (options.preserveScroll) this.captureDomState();
      this.ensureCampaignSelection();
      if (options.restoreView) this.restoreLocalView();
      const root = document.getElementById('campaign-studio-content-v1056');
      const select = document.getElementById('campaign-studio-campaign-v1056');
      if (!root || !select) return;
      const campaigns = allCampaigns();
      select.innerHTML = campaigns.map(c => `<option value="${hx(c.id)}" ${c.id === this.campaignId ? 'selected' : ''}>${hx(c.name || c.id)}</option>`).join('') || '<option value="">Нет кампаний</option>';
      select.disabled = !campaigns.length;
      if (!options.preserveSelection && !options.externalRefresh) { this.selectedId = null; this.selectedKind = null; }
      root.innerHTML = `<div class="cs-shell-v1056">
        ${this.toolbarMarkup()}
        <div class="cs-workspace-v1056">
          <aside class="cs-sidebar-v1056">${this.sidebarMarkup()}</aside>
          <main class="cs-viewport-v1056" id="cs-viewport-v1056">${this.boardMarkup()}</main>
          <aside class="cs-inspector-v1056" id="cs-inspector-v1056">${this.inspectorMarkup()}</aside>
        </div>
      </div>`;
      this.applyCameraTransform();
      if (options.preserveScroll) {
        const sidebar = root.querySelector('.cs-sidebar-v1056');
        const inspector = root.querySelector('.cs-inspector-v1056');
        if (sidebar) sidebar.scrollTop = this.domScroll.sidebar || 0;
        if (inspector) inspector.scrollTop = this.domScroll.inspector || 0;
      }
      this.captureLocalView();
    },
    toolbarMarkup() {
      return `<div class="cs-toolbar-v1056">
        <div class="cs-tabs-v1056"><button class="cs-tab-v1056 ${this.mode === 'knowledge' ? 'active' : ''}" data-cs-mode="knowledge">ПАУТИНА КАМПАНИИ</button><button class="cs-tab-v1056 ${this.mode === 'plot' ? 'active' : ''}" data-cs-mode="plot">ДЕРЕВО СЮЖЕТА</button></div>
        ${this.mode === 'knowledge'
          ? `<button class="cs-tool-btn-v1056" data-cs-action="add-note">+ ЗАМЕТКА</button>`
          : `<button class="cs-tool-btn-v1056" data-cs-action="add-scene">+ ЭЛЕМЕНТ</button><button class="cs-tool-btn-v1056" data-cs-action="add-condition">+ УСЛОВИЕ</button><button class="cs-tool-btn-v1056" data-cs-action="add-random">+ СЛУЧАЙНОЕ</button><button class="cs-tool-btn-v1056" data-cs-action="roll-random">БРОСИТЬ СОБЫТИЕ</button>`}
        <button class="cs-tool-btn-v1056" data-cs-action="fit">ПОКАЗАТЬ ВСЁ</button>
        <button class="cs-tool-btn-v1056" data-cs-action="center">ЦЕНТР</button>
      </div>`;
    },
    sidebarMarkup() {
      if (this.mode === 'plot') return this.plotSidebarMarkup();
      const catalog = this.entityCatalog(this.catalogQuery);
      return `<div class="cs-panel-v1056"><div class="cs-panel-title-v1056"><span>World Config</span><span class="cs-count-v1056" id="cs-catalog-count-v1056">${catalog.length}</span></div><input class="input cs-search-v1056" id="cs-catalog-search-v1056" value="${hx(this.catalogQuery)}" placeholder="Поиск сущности…"/><div class="cs-catalog-v1056" id="cs-catalog-list-v1056">${this.catalogRowsMarkup(catalog)}</div></div>
        <div class="cs-panel-v1056"><div class="cs-panel-title-v1056">Как работать</div><div class="small-note">Добавляйте сущности World Config и свободные заметки. Перетаскивайте карточки. Связи можно создавать в инспекторе или перетягиванием коннектора на грани карточки к коннектору другой карточки. Колесо — масштаб, перетаскивание пустого поля — камера.</div></div>`;
    },
    plotSidebarMarkup() {
      const milestones = campaignMilestones(this.campaignId);
      const conditions = this.plot()?.conditions || [];
      const randoms = (this.plot()?.nodes || []).filter(n => n.type === 'random');
      return `<div class="cs-panel-v1056"><div class="cs-panel-title-v1056"><span>Вехи сюжета</span><span class="cs-count-v1056">${milestones.length}</span></div>${milestones.map(m => `<label class="cs-milestone-v1056"><input type="checkbox" data-cs-milestone="${hx(m.id)}" ${m.reached ? 'checked' : ''}/><span><b>${hx(m.name)}</b>${m.description ? `<small>${hx(m.description)}</small>` : ''}</span></label>`).join('') || '<div class="small-note">Вехи ещё не заданы. Добавьте их в World Config → Игровые кампании.</div>'}<button class="secondary" data-cs-action="open-campaign-config" type="button">ОТКРЫТЬ ЛИСТ КАМПАНИИ</button></div>
        <div class="cs-panel-v1056"><div class="cs-panel-title-v1056"><span>Условия</span><span class="cs-count-v1056">${conditions.length}</span></div><div class="small-note">Одно условие можно назначить любому количеству сюжетных элементов. Условие проверяет достигнутые вехи кампании.</div></div>
        <div class="cs-panel-v1056"><div class="cs-panel-title-v1056"><span>Случайные события</span><span class="cs-count-v1056">${randoms.length}</span></div>${this.lastRandomId ? `<div class="cs-roll-result-v1056">Последний результат: <b>${hx(this.plotNodeById(this.lastRandomId)?.title || '—')}</b></div>` : '<div class="small-note">Кнопка «Бросить событие» выбирает по весам только те случайные события, условия которых выполнены.</div>'}</div>`;
    },

    catalogRowsMarkup(catalog = []) {
      return catalog.map(row => `<div class="cs-catalog-row-v1056"><div class="cs-catalog-main-v1056"><div class="cs-catalog-name-v1056">${hx(row.name)}</div><div class="cs-catalog-type-v1056">${hx(row.typeLabel)}</div></div><button class="cs-add-v1056" data-cs-add-entity="${hx(row.type)}" data-cs-entity-id="${hx(row.id)}" title="Добавить в паутину">+</button></div>`).join('') || '<div class="small-note">Ничего не найдено.</div>';
    },
    entityCatalog(query = '') {
      const q = String(query || '').trim().toLowerCase();
      const out = [];
      const types = Object.keys(WORLD_SECTIONS || {});
      for (const type of types) {
        let items = [];
        try {
          if (type === 'equipment') items = Object.values(Data?.equipment || EQUIPMENT || {});
          else if (type === 'players') items = Object.values(App?.state?.users || PLAYER_TEMPLATES || {});
          else items = Configurator?.getItems?.(type) || [];
        } catch { items = []; }
        const typeLabel = WORLD_SECTIONS?.[type]?.label || type;
        for (const item of items) {
          if (!item?.id) continue;
          const name = String(item.name || item.displayName || item.title || item.shortName || item.id);
          if (q && !`${name} ${typeLabel} ${item.id}`.toLowerCase().includes(q)) continue;
          out.push({ type, typeLabel, id: String(item.id), name });
        }
      }
      return out.slice(0, 240);
    },
    resolveEntity(type, id) {
      try {
        if (type === 'players') return (App?.state?.users || PLAYER_TEMPLATES || {})[id] || null;
        if (type === 'equipment') return (Data?.equipment || EQUIPMENT || {})[id] || null;
        const rows = Configurator?.getItems?.(type) || [];
        return rows.find(item => String(item?.id) === String(id)) || null;
      } catch { return null; }
    },
    nodeDisplay(node) {
      if (node.kind === 'note') return { title: node.title || 'Заметка', typeLabel: 'Заметка ДМа', missing: false, note: node.note || '' };
      const entity = this.resolveEntity(node.entityType, node.entityId);
      const typeLabel = WORLD_SECTIONS?.[node.entityType]?.label || node.entityType || 'World Config';
      return { title: entity?.name || entity?.displayName || entity?.title || node.title || node.entityId || 'Удалённая сущность', typeLabel, missing: !entity, note: node.note || '', entity };
    },
    boardMarkup() {
      const data = this.mode === 'plot' ? this.plot() : this.knowledge();
      const camera = data?.camera || normalizeCamera({});
      const nodes = this.mode === 'plot' ? this.plotRenderableNodes() : (data?.nodes || []);
      const edges = this.mode === 'plot' ? this.plotRenderableEdges() : (data?.edges || []);
      return `<div class="cs-world-v1056" id="cs-world-v1056" data-x="${camera.x}" data-y="${camera.y}" data-zoom="${camera.zoom}">
        <svg class="cs-links-v1056" id="cs-links-v1056" viewBox="0 0 4200 3000"><defs><marker id="cs-arrow-v1056" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor"></path></marker></defs>${this.edgesMarkup(edges, nodes)}</svg>
        <div class="cs-node-layer-v1056">${nodes.map(node => this.nodeMarkup(node)).join('')}</div>
      </div>${nodes.length ? '' : `<div class="cs-empty-v1056"><div class="cs-empty-card-v1056">${this.mode === 'plot' ? 'Добавьте первый сюжетный элемент или условие. Вехи создаются в листе кампании, а здесь из них собираются условия и ветви сюжета.' : 'Паутина этой кампании пока пуста. Добавьте сущности из World Config слева или создайте свободную заметку.'}</div></div>`}`;
    },
    plotRenderableNodes() {
      const plot = this.plot();
      if (!plot) return [];
      const conditionNodes = plot.conditions.map(c => ({ ...c, kind: 'condition', title: c.name, note: c.notes }));
      return [...conditionNodes, ...plot.nodes.map(n => ({ ...n, kind: 'plot', note: n.description }))];
    },
    plotRenderableEdges() {
      const plot = this.plot();
      if (!plot) return [];
      const conditionEdges = plot.nodes.filter(n => n.conditionId && plot.conditions.some(c => c.id === n.conditionId)).map(n => ({ id: `cond_${n.conditionId}_${n.id}`, from: n.conditionId, to: n.id, label: 'условие', condition: true, fromPort: n.conditionFromPort || '', toPort: n.conditionToPort || '' }));
      return [...plot.edges, ...conditionEdges];
    },
    portPoint(node, port = '', toward = null) {
      const cx = num(node.x) + NODE_W / 2, cy = num(node.y) + NODE_H / 2;
      let use = PORTS.includes(port) ? port : '';
      if (!use && toward) {
        const dx = num(toward.x) + NODE_W / 2 - cx, dy = num(toward.y) + NODE_H / 2 - cy;
        use = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
      }
      if (!use) use = 'right';
      if (use === 'left') return { x: num(node.x), y: cy, port: use, vx: -1, vy: 0 };
      if (use === 'right') return { x: num(node.x) + NODE_W, y: cy, port: use, vx: 1, vy: 0 };
      if (use === 'top') return { x: cx, y: num(node.y), port: use, vx: 0, vy: -1 };
      return { x: cx, y: num(node.y) + NODE_H, port: 'bottom', vx: 0, vy: 1 };
    },
    edgePath(a, b, edge = {}) {
      const pa = this.portPoint(a, edge.fromPort, b), pb = this.portPoint(b, edge.toPort, a);
      const distance = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const bend = clampV(distance * .42, 60, 210);
      const c1x = pa.x + pa.vx * bend, c1y = pa.y + pa.vy * bend;
      const c2x = pb.x + pb.vx * bend, c2y = pb.y + pb.vy * bend;
      return { d: `M ${pa.x} ${pa.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pb.x} ${pb.y}`, pa, pb, mx: (pa.x + pb.x) / 2, my: (pa.y + pb.y) / 2 - 7 };
    },
    edgesMarkup(edges, nodes) {
      const map = new Map(nodes.map(n => [n.id, n]));
      return edges.map(edge => {
        const a = map.get(edge.from), b = map.get(edge.to); if (!a || !b) return '';
        const path = this.edgePath(a, b, edge);
        return `<path class="cs-edge-v1056 ${edge.condition ? 'condition' : ''}" d="${path.d}"/>${edge.label ? `<text class="cs-edge-label-v1056" x="${path.mx}" y="${path.my}" text-anchor="middle">${hx(edge.label)}</text>` : ''}`;
      }).join('');
    },
    portsMarkup() {
      return PORTS.map(port => `<button type="button" class="cs-port-v1057 cs-port-${port}-v1057" data-cs-port="${port}" aria-label="Создать связь с ${port} грани" title="Перетащите к грани другой карточки"></button>`).join('');
    },
    nodeMarkup(node) {
      const selected = node.id === this.selectedId;
      if (this.mode === 'knowledge') {
        const display = this.nodeDisplay(node);
        return `<article class="cs-node-v1056 ${selected ? 'selected' : ''} ${display.missing ? 'missing' : ''}" data-cs-node="${hx(node.id)}" data-cs-kind="knowledge" style="left:${num(node.x)}px;top:${num(node.y)}px"><div class="cs-node-kicker-v1056"><span>${hx(display.typeLabel)}</span><span class="cs-node-dot-v1056"></span></div><div class="cs-node-title-v1056">${hx(display.title)}</div>${display.note ? `<div class="cs-node-note-v1056">${hx(display.note)}</div>` : ''}${display.missing ? '<div class="cs-node-status-v1056">ССЫЛКА УДАЛЕНА</div>' : ''}${this.portsMarkup()}</article>`;
      }
      if (node.kind === 'condition') {
        const ok = this.conditionSatisfied(node.id);
        return `<article class="cs-node-v1056 condition ${selected ? 'selected' : ''}" data-cs-node="${hx(node.id)}" data-cs-kind="condition" style="left:${num(node.x)}px;top:${num(node.y)}px"><div class="cs-node-kicker-v1056"><span>УСЛОВИЕ · ${node.mode === 'any' ? 'ЛЮБАЯ ВЕХА' : 'ВСЕ ВЕХИ'}</span><span class="cs-node-dot-v1056"></span></div><div class="cs-node-title-v1056">${hx(node.name)}</div>${node.notes ? `<div class="cs-node-note-v1056">${hx(node.notes)}</div>` : ''}<div class="cs-node-status-v1056">${ok ? 'ВЫПОЛНЕНО' : 'НЕ ВЫПОЛНЕНО'}</div>${this.portsMarkup()}</article>`;
      }
      const type = node.type || 'scene';
      return `<article class="cs-node-v1056 ${type} ${node.status || 'planned'} ${selected ? 'selected' : ''}" data-cs-node="${hx(node.id)}" data-cs-kind="plot" style="left:${num(node.x)}px;top:${num(node.y)}px"><div class="cs-node-kicker-v1056"><span>${hx(PLOT_TYPES[type] || type)}${type === 'random' ? ` · ВЕС ${Math.max(1, num(node.randomWeight, 10))}` : ''}</span><span class="cs-node-dot-v1056"></span></div><div class="cs-node-title-v1056">${hx(node.title)}</div>${node.description ? `<div class="cs-node-note-v1056">${hx(node.description)}</div>` : ''}<div class="cs-node-status-v1056">${hx(STATUS_LABELS[node.status] || node.status)}</div>${this.portsMarkup()}</article>`;
    },

    selectedKnowledgeNode() { return this.knowledge()?.nodes.find(n => n.id === this.selectedId) || null; },
    plotNodeById(id = this.selectedId) { return this.plot()?.nodes.find(n => n.id === id) || null; },
    conditionById(id = this.selectedId) { return this.plot()?.conditions.find(c => c.id === id) || null; },
    inspectorMarkup() {
      if (!this.selectedId) return '<div class="cs-inspector-empty-v1056"><div class="section-title">Инспектор</div>Выберите узел. Здесь редактируются заметки, условия и связи; сами данные World Config остаются в исходной карточке сущности.</div>';
      if (this.mode === 'knowledge') return this.knowledgeInspectorMarkup();
      if (this.selectedKind === 'condition') return this.conditionInspectorMarkup();
      return this.plotInspectorMarkup();
    },
    knowledgeInspectorMarkup() {
      const node = this.selectedKnowledgeNode(); if (!node) return '<div class="cs-inspector-empty-v1056">Узел не найден.</div>';
      const display = this.nodeDisplay(node); const allNodes = this.knowledge()?.nodes || [];
      const edges = (this.knowledge()?.edges || []).filter(e => e.from === node.id || e.to === node.id);
      return `<div class="section-title">${node.kind === 'note' ? 'Заметка' : 'Сущность World Config'}</div>
        ${node.kind === 'note' ? `<div class="field"><label>Название</label><input class="input" data-cs-edit="title" value="${hx(node.title)}"/></div>` : `<div class="cs-entity-preview-v1056"><b>${hx(display.title)}</b><div class="small-note">${hx(display.typeLabel)} · ${hx(node.entityId)}</div>${this.entityAttributesMarkup(display.entity)}</div><button class="secondary" data-cs-action="open-entity-config" type="button">ОТКРЫТЬ В WORLD CONFIG</button>`}
        <div class="field"><label>Заметка ДМа</label><textarea class="area" data-cs-edit="note" placeholder="Контекст, гипотезы, планы, секреты…">${hx(node.note)}</textarea></div>
        <div class="cs-panel-v1056"><div class="cs-panel-title-v1056">Новая связь</div><select class="select" id="cs-link-target-v1056"><option value="">Выберите узел…</option>${allNodes.filter(n => n.id !== node.id).map(n => `<option value="${hx(n.id)}">${hx(this.nodeDisplay(n).title)}</option>`).join('')}</select><input class="input" id="cs-link-label-v1056" placeholder="Название связи: союзник, владеет, знает…"/><button class="secondary" data-cs-action="add-link" type="button">СВЯЗАТЬ</button></div>
        <div class="cs-panel-v1056"><div class="cs-panel-title-v1056"><span>Связи</span><span class="cs-count-v1056">${edges.length}</span></div>${edges.map(edge => { const other = edge.from === node.id ? edge.to : edge.from; const target = allNodes.find(n => n.id === other); return `<div class="cs-connection-row-v1056"><div class="cs-connection-main-v1057"><span class="cs-connection-target-v1057">${hx(target ? this.nodeDisplay(target).title : other)}</span><input class="input cs-edge-label-input-v1057" data-cs-edge-label="${hx(edge.id)}" value="${hx(edge.label)}" placeholder="Название связи…"/></div><button class="cs-delete-v1056" data-cs-delete-edge="${hx(edge.id)}">×</button></div>`; }).join('') || '<div class="small-note">Связей пока нет.</div>'}</div>
        <button class="ghost" data-cs-action="delete-selected" type="button">УДАЛИТЬ УЗЕЛ ИЗ ПАУТИНЫ</button>`;
    },
    entityAttributesMarkup(entity) {
      if (!entity) return '<div class="small-note">Исходная сущность удалена из World Config. Заметка и связи сохранены.</div>';
      const skip = new Set(['image', 'imageLocal', 'imageData', 'visibility', 'relatedArticleIds']);
      const rows = Object.entries(entity).filter(([k, v]) => !skip.has(k) && v !== '' && v !== null && v !== undefined).slice(0, 9);
      return rows.map(([key, value]) => {
        let text = '';
        if (Array.isArray(value)) text = value.length ? `${value.length} элемент(а)` : '—';
        else if (typeof value === 'object') text = Object.keys(value || {}).length ? JSON.stringify(value).slice(0, 80) : '—';
        else text = String(value);
        return `<div class="cs-attr-row-v1056"><span class="cs-attr-key-v1056">${hx(key)}</span><span class="cs-attr-value-v1056">${hx(text)}</span></div>`;
      }).join('');
    },
    conditionInspectorMarkup() {
      const condition = this.conditionById(); if (!condition) return '<div class="cs-inspector-empty-v1056">Условие не найдено.</div>';
      const milestones = campaignMilestones(this.campaignId); const usedBy = (this.plot()?.nodes || []).filter(n => n.conditionId === condition.id);
      const ok = this.conditionSatisfied(condition.id);
      return `<div class="section-title">Условие сюжета</div><div class="field"><label>Название</label><input class="input" data-cs-condition-edit="name" value="${hx(condition.name)}"/></div><div class="field"><label>Логика</label><select class="select" data-cs-condition-edit="mode"><option value="all" ${condition.mode === 'all' ? 'selected' : ''}>Все выбранные вехи достигнуты</option><option value="any" ${condition.mode === 'any' ? 'selected' : ''}>Достигнута хотя бы одна веха</option></select></div>
        <div class="field"><label>Вехи</label><div class="cs-panel-v1056">${milestones.map(m => `<label class="cs-milestone-v1056"><input type="checkbox" data-cs-condition-milestone="${hx(m.id)}" ${condition.milestoneIds.includes(m.id) ? 'checked' : ''}/><span><b>${hx(m.name)}</b><small>${m.reached ? 'ДОСТИГНУТА' : 'не достигнута'}</small></span></label>`).join('') || '<div class="small-note">Вехи не заданы в листе кампании.</div>'}</div></div>
        <div class="field"><label>Заметка</label><textarea class="area" data-cs-condition-edit="notes">${hx(condition.notes)}</textarea></div><div class="cs-condition-status-v1056 ${ok ? 'ok' : 'no'}">${ok ? 'УСЛОВИЕ ВЫПОЛНЕНО' : 'УСЛОВИЕ ЕЩЁ НЕ ВЫПОЛНЕНО'}</div>
        <div class="cs-panel-v1056"><div class="cs-panel-title-v1056"><span>Используется</span><span class="cs-count-v1056">${usedBy.length}</span></div>${usedBy.map(n => `<div class="cs-connection-row-v1056"><span>${hx(n.title)}</span><button class="cs-delete-v1056" data-cs-clear-condition="${hx(n.id)}" title="Отвязать условие">×</button></div>`).join('') || '<div class="small-note">Пока не назначено ни одному элементу.</div>'}</div><button class="ghost" data-cs-action="delete-selected" type="button">УДАЛИТЬ УСЛОВИЕ</button>`;
    },
    plotInspectorMarkup() {
      const node = this.plotNodeById(); if (!node) return '<div class="cs-inspector-empty-v1056">Элемент не найден.</div>';
      const conditions = this.plot()?.conditions || []; const allNodes = this.plot()?.nodes || [];
      const edges = (this.plot()?.edges || []).filter(e => e.from === node.id || e.to === node.id);
      return `<div class="section-title">${hx(PLOT_TYPES[node.type] || 'Сюжетный элемент')}</div><div class="field"><label>Название</label><input class="input" data-cs-plot-edit="title" value="${hx(node.title)}"/></div><div class="field"><label>Тип</label><select class="select" data-cs-plot-edit="type">${Object.entries(PLOT_TYPES).map(([id, label]) => `<option value="${id}" ${node.type === id ? 'selected' : ''}>${hx(label)}</option>`).join('')}</select></div><div class="field"><label>Состояние</label><select class="select" data-cs-plot-edit="status">${Object.entries(STATUS_LABELS).map(([id, label]) => `<option value="${id}" ${node.status === id ? 'selected' : ''}>${hx(label)}</option>`).join('')}</select></div><div class="field"><label>Описание / заметки ДМа</label><textarea class="area" data-cs-plot-edit="description">${hx(node.description)}</textarea></div>
        <div class="field"><label>Общее условие</label><select class="select" data-cs-plot-edit="conditionId"><option value="">Без условия</option>${conditions.map(c => `<option value="${hx(c.id)}" ${node.conditionId === c.id ? 'selected' : ''}>${hx(c.name)}</option>`).join('')}</select><div class="small-note">Одно и то же условие можно выбрать у любого количества элементов дерева.</div></div>
        ${node.type === 'random' ? `<div class="field"><label>Вес случайного события</label><input class="input" type="number" min="1" max="999" data-cs-plot-edit="randomWeight" value="${Math.max(1, num(node.randomWeight, 10))}"/><div class="small-note">Чем выше вес, тем чаще событие выпадает среди доступных случайных событий.</div></div>` : ''}
        <div class="cs-panel-v1056"><div class="cs-panel-title-v1056">Следующая ветка</div><select class="select" id="cs-plot-link-target-v1056"><option value="">Выберите элемент…</option>${allNodes.filter(n => n.id !== node.id).map(n => `<option value="${hx(n.id)}">${hx(n.title)}</option>`).join('')}</select><input class="input" id="cs-plot-link-label-v1056" placeholder="Подпись ветки: успех, отказ, побег…"/><button class="secondary" data-cs-action="add-plot-link" type="button">СВЯЗАТЬ</button></div>
        <div class="cs-panel-v1056"><div class="cs-panel-title-v1056"><span>Ветки</span><span class="cs-count-v1056">${edges.length}</span></div>${edges.map(edge => { const other = edge.from === node.id ? edge.to : edge.from; const target = allNodes.find(n => n.id === other); return `<div class="cs-connection-row-v1056"><div class="cs-connection-main-v1057"><span class="cs-connection-target-v1057">${hx(target?.title || other)}</span><input class="input cs-edge-label-input-v1057" data-cs-plot-edge-label="${hx(edge.id)}" value="${hx(edge.label)}" placeholder="Подпись ветки…"/></div><button class="cs-delete-v1056" data-cs-delete-plot-edge="${hx(edge.id)}">×</button></div>`; }).join('') || '<div class="small-note">Веток пока нет.</div>'}</div><button class="ghost" data-cs-action="delete-selected" type="button">УДАЛИТЬ ЭЛЕМЕНТ</button>`;
    },

    conditionSatisfied(id) {
      if (!id) return true;
      const condition = this.conditionById(id); if (!condition) return false;
      const milestones = new Map(campaignMilestones(this.campaignId).map(m => [m.id, m]));
      const ids = unique(condition.milestoneIds); if (!ids.length) return false;
      const flags = ids.map(mid => milestones.get(mid)?.reached === true);
      return condition.mode === 'any' ? flags.some(Boolean) : flags.every(Boolean);
    },
    addEntity(type, entityId) {
      const graph = this.knowledge(); if (!graph) return;
      const existing = graph.nodes.find(n => n.kind === 'entity' && n.entityType === type && n.entityId === entityId);
      if (existing) { this.selectedId = existing.id; this.selectedKind = 'knowledge'; this.render({ preserveSelection: true, preserveScroll: true }); Toast?.show?.('Сущность уже есть в паутине', 'info'); return; }
      const entity = this.resolveEntity(type, entityId); const camera = graph.camera || normalizeCamera({});
      const x = clampV((520 - camera.x) / camera.zoom + 600 + Math.random() * 100, 80, 3800), y = clampV((320 - camera.y) / camera.zoom + 500 + Math.random() * 100, 80, 2700);
      const node = normalizeKnowledgeNode({ id: uid('knowledge'), kind: 'entity', entityType: type, entityId, title: entity?.name || entity?.displayName || entity?.title || entityId, x, y });
      graph.nodes.push(node); this.selectedId = node.id; this.selectedKind = 'knowledge'; this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true });
    },
    addNote() {
      const graph = this.knowledge(); if (!graph) return; const i = graph.nodes.length;
      const node = normalizeKnowledgeNode({ id: uid('note'), kind: 'note', title: 'Новая заметка', note: '', x: 620 + (i % 5) * 55, y: 380 + (i % 4) * 55 });
      graph.nodes.push(node); this.selectedId = node.id; this.selectedKind = 'knowledge'; this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true });
    },
    addPlot(type = 'scene') {
      const plot = this.plot(); if (!plot) return; const i = plot.nodes.length;
      const node = normalizePlotNode({ id: uid('plot'), type, title: type === 'random' ? 'Новое случайное событие' : type === 'ending' ? 'Новый финал' : 'Новый сюжетный элемент', x: 720 + (i % 4) * 70, y: 500 + (i % 5) * 55 });
      plot.nodes.push(node); this.selectedId = node.id; this.selectedKind = 'plot'; this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true });
    },
    addCondition() {
      const plot = this.plot(); if (!plot) return; const i = plot.conditions.length;
      const c = normalizeCondition({ id: uid('condition'), name: 'Новое условие', x: 680 + (i % 4) * 80, y: 220 + (i % 4) * 55 });
      plot.conditions.push(c); this.selectedId = c.id; this.selectedKind = 'condition'; this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true });
    },
    addKnowledgeLink() {
      const graph = this.knowledge(), node = this.selectedKnowledgeNode(); if (!graph || !node) return;
      const target = String(document.getElementById('cs-link-target-v1056')?.value || ''); if (!target || target === node.id) return;
      const exists = graph.edges.some(e => (e.from === node.id && e.to === target) || (e.from === target && e.to === node.id));
      if (exists) { Toast?.show?.('Связь уже существует', 'info'); return; }
      graph.edges.push(normalizeEdge({ id: uid('edge'), from: node.id, to: target, label: document.getElementById('cs-link-label-v1056')?.value || '' })); this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true });
    },
    addPlotLink() {
      const plot = this.plot(), node = this.plotNodeById(); if (!plot || !node) return;
      const target = String(document.getElementById('cs-plot-link-target-v1056')?.value || ''); if (!target || target === node.id) return;
      if (plot.edges.some(e => e.from === node.id && e.to === target)) { Toast?.show?.('Такая ветка уже существует', 'info'); return; }
      plot.edges.push(normalizeEdge({ id: uid('plot_edge'), from: node.id, to: target, label: document.getElementById('cs-plot-link-label-v1056')?.value || '' })); this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true });
    },
    deleteSelected() {
      if (!this.selectedId) return;
      if (!window.confirm('Удалить выбранный узел из Campaign Studio? World Config не будет изменён.')) return;
      if (this.mode === 'knowledge') {
        const graph = this.knowledge(); graph.nodes = graph.nodes.filter(n => n.id !== this.selectedId); graph.edges = graph.edges.filter(e => e.from !== this.selectedId && e.to !== this.selectedId);
      } else if (this.selectedKind === 'condition') {
        const plot = this.plot(); plot.conditions = plot.conditions.filter(c => c.id !== this.selectedId); plot.nodes.forEach(n => { if (n.conditionId === this.selectedId) { n.conditionId = ''; n.conditionFromPort = ''; n.conditionToPort = ''; } });
      } else {
        const plot = this.plot(); plot.nodes = plot.nodes.filter(n => n.id !== this.selectedId); plot.edges = plot.edges.filter(e => e.from !== this.selectedId && e.to !== this.selectedId);
      }
      this.selectedId = null; this.selectedKind = null; this.scheduleSave(); this.render();
    },
    rollRandom() {
      const plot = this.plot(); if (!plot) return;
      const eligible = plot.nodes.filter(n => n.type === 'random' && !['completed', 'failed'].includes(n.status) && this.conditionSatisfied(n.conditionId));
      if (!eligible.length) { Toast?.show?.('Нет доступных случайных событий: проверьте условия и статусы.', 'info'); return; }
      const total = eligible.reduce((sum, n) => sum + Math.max(1, num(n.randomWeight, 10)), 0); let roll = Math.random() * total; let chosen = eligible[0];
      for (const node of eligible) { roll -= Math.max(1, num(node.randomWeight, 10)); if (roll <= 0) { chosen = node; break; } }
      this.lastRandomId = chosen.id; this.selectedId = chosen.id; this.selectedKind = 'plot'; Toast?.show?.(`Случайное событие: ${chosen.title}`, 'ok'); this.render({ preserveSelection: true, preserveScroll: true });
    },
    openSelectedInConfig() {
      const node = this.selectedKnowledgeNode(); if (!node || node.kind !== 'entity') return;
      Configurator.selectedType = node.entityType; Configurator.selectedId = node.entityId; UI.openModule('config');
    },
    openCampaignConfig() {
      Configurator.selectedType = 'campaigns'; Configurator.selectedId = this.campaignId; UI.openModule('config');
    },

    setMode(mode) {
      this.captureLocalView();
      this.mode = mode === 'plot' ? 'plot' : 'knowledge'; localStorage.setItem(MODE_KEY, this.mode);
      this.restoreLocalView();
      this.render({ preserveSelection: true, preserveScroll: true });
    },
    applyCameraTransform() {
      const world = document.getElementById('cs-world-v1056'); const camera = this.camera(); if (!world || !camera) return;
      world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`;
    },
    center() {
      const camera = this.camera(); const viewport = document.getElementById('cs-viewport-v1056'); if (!camera || !viewport) return;
      camera.zoom = 1; camera.x = viewport.clientWidth / 2 - 1200; camera.y = viewport.clientHeight / 2 - 850; this.applyCameraTransform(); this.captureLocalView();
    },
    fit() {
      const viewport = document.getElementById('cs-viewport-v1056'); const camera = this.camera(); if (!viewport || !camera) return;
      const nodes = this.mode === 'plot' ? this.plotRenderableNodes() : (this.knowledge()?.nodes || []); if (!nodes.length) { this.center(); return; }
      const minX = Math.min(...nodes.map(n => num(n.x))), minY = Math.min(...nodes.map(n => num(n.y)));
      const maxX = Math.max(...nodes.map(n => num(n.x) + NODE_W)), maxY = Math.max(...nodes.map(n => num(n.y) + NODE_H));
      const w = Math.max(300, maxX - minX + 120), h = Math.max(220, maxY - minY + 120);
      const zoom = clampV(Math.min(viewport.clientWidth / w, viewport.clientHeight / h), .35, 1.35);
      camera.zoom = zoom; camera.x = viewport.clientWidth / 2 - ((minX + maxX) / 2) * zoom; camera.y = viewport.clientHeight / 2 - ((minY + maxY) / 2) * zoom; this.applyCameraTransform(); this.captureLocalView();
    },
    updateNodePosition(id, kind, x, y) {
      let target = null;
      if (this.mode === 'knowledge') target = this.knowledge()?.nodes.find(n => n.id === id);
      else target = kind === 'condition' ? this.conditionById(id) : this.plotNodeById(id);
      if (!target) return; target.x = clampV(x, 0, 3950); target.y = clampV(y, 0, 2850);
    },
    redrawEdges() {
      const svg = document.getElementById('cs-links-v1056'); if (!svg) return;
      const nodes = this.mode === 'plot' ? this.plotRenderableNodes() : (this.knowledge()?.nodes || []); const edges = this.mode === 'plot' ? this.plotRenderableEdges() : (this.knowledge()?.edges || []);
      const defs = svg.querySelector('defs')?.outerHTML || ''; svg.innerHTML = defs + this.edgesMarkup(edges, nodes);
    },

    onClick(event) {
      const modeBtn = event.target.closest('[data-cs-mode]'); if (modeBtn) { this.setMode(modeBtn.dataset.csMode); return; }
      const entityBtn = event.target.closest('[data-cs-add-entity]'); if (entityBtn) { this.addEntity(entityBtn.dataset.csAddEntity, entityBtn.dataset.csEntityId); return; }
      const node = event.target.closest('[data-cs-node]'); if (node && !this.drag?.moved && !this.linkDrag) { this.selectedId = node.dataset.csNode; this.selectedKind = node.dataset.csKind; this.captureLocalView(); this.render({ preserveSelection: true, preserveScroll: true }); return; }
      const edgeDel = event.target.closest('[data-cs-delete-edge]'); if (edgeDel) { const graph = this.knowledge(); graph.edges = graph.edges.filter(e => e.id !== edgeDel.dataset.csDeleteEdge); this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true }); return; }
      const plotEdgeDel = event.target.closest('[data-cs-delete-plot-edge]'); if (plotEdgeDel) { const plot = this.plot(); plot.edges = plot.edges.filter(e => e.id !== plotEdgeDel.dataset.csDeletePlotEdge); this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true }); return; }
      const clearCond = event.target.closest('[data-cs-clear-condition]'); if (clearCond) { const p = this.plotNodeById(clearCond.dataset.csClearCondition); if (p) { p.conditionId = ''; p.conditionFromPort = ''; p.conditionToPort = ''; } this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true }); return; }
      const action = event.target.closest('[data-cs-action]')?.dataset.csAction;
      if (!action) return;
      if (action === 'add-note') this.addNote();
      if (action === 'add-scene') this.addPlot('scene');
      if (action === 'add-random') this.addPlot('random');
      if (action === 'add-condition') this.addCondition();
      if (action === 'roll-random') this.rollRandom();
      if (action === 'fit') this.fit();
      if (action === 'center') this.center();
      if (action === 'add-link') this.addKnowledgeLink();
      if (action === 'add-plot-link') this.addPlotLink();
      if (action === 'delete-selected') this.deleteSelected();
      if (action === 'open-entity-config') this.openSelectedInConfig();
      if (action === 'open-campaign-config') this.openCampaignConfig();
    },
    onInput(event) {
      if (event.target?.id === 'cs-catalog-search-v1056') { this.catalogQuery = event.target.value; const catalog = this.entityCatalog(this.catalogQuery); const list = document.getElementById('cs-catalog-list-v1056'); const count = document.getElementById('cs-catalog-count-v1056'); if (list) list.innerHTML = this.catalogRowsMarkup(catalog); if (count) count.textContent = String(catalog.length); this.captureLocalView(); return; }
      const edgeLabelId = event.target?.dataset?.csEdgeLabel;
      if (edgeLabelId) { const edge = this.knowledge()?.edges.find(item => item.id === edgeLabelId); if (edge) { edge.label = String(event.target.value || ''); this.scheduleSave(); this.redrawEdges(); } return; }
      const plotEdgeLabelId = event.target?.dataset?.csPlotEdgeLabel;
      if (plotEdgeLabelId) { const edge = this.plot()?.edges.find(item => item.id === plotEdgeLabelId); if (edge) { edge.label = String(event.target.value || ''); this.scheduleSave(); this.redrawEdges(); } return; }
      const node = this.mode === 'knowledge' ? this.selectedKnowledgeNode() : null;
      const edit = event.target?.dataset?.csEdit;
      if (node && edit && ['title', 'note'].includes(edit)) { node[edit] = String(event.target.value || ''); this.scheduleSave(); const card = document.querySelector(`[data-cs-node="${CSS.escape(node.id)}"]`); if (card) { const title = card.querySelector('.cs-node-title-v1056'), note = card.querySelector('.cs-node-note-v1056'); if (title && edit === 'title') title.textContent = node.title; if (edit === 'note') { if (note) note.textContent = node.note; else if (node.note) title?.insertAdjacentHTML('afterend', `<div class="cs-node-note-v1056">${hx(node.note)}</div>`); } } return; }
      const cedit = event.target?.dataset?.csConditionEdit; if (cedit) { const c = this.conditionById(); if (!c) return; c[cedit] = String(event.target.value || ''); if (cedit === 'mode') c.mode = c.mode === 'any' ? 'any' : 'all'; this.scheduleSave(); return; }
      const pedit = event.target?.dataset?.csPlotEdit; if (pedit) { const p = this.plotNodeById(); if (!p) return; if (pedit === 'randomWeight') p.randomWeight = Math.max(1, Math.floor(num(event.target.value, 1))); else p[pedit] = String(event.target.value || ''); if (pedit === 'type' && !PLOT_TYPES[p.type]) p.type = 'scene'; if (pedit === 'status' && !STATUS_LABELS[p.status]) p.status = 'planned'; this.scheduleSave(); return; }
    },
    onChange(event) {
      if (event.target?.id === 'campaign-studio-campaign-v1056') { this.captureLocalView(); this.campaignId = String(event.target.value || ''); localStorage.setItem(CAMPAIGN_KEY, this.campaignId); this.workspace(); this.restoreLocalView(); this.updateEra(); this.render({ preserveSelection: true, preserveScroll: true }); return; }
      const milestoneId = event.target?.dataset?.csMilestone; if (milestoneId) { const milestone = campaignMilestones(this.campaignId).find(m => m.id === milestoneId); if (milestone) milestone.reached = event.target.checked; this.scheduleSave('campaign-milestone-state'); this.render({ preserveSelection: true, preserveScroll: true }); return; }
      const cm = event.target?.dataset?.csConditionMilestone; if (cm) { const c = this.conditionById(); if (!c) return; c.milestoneIds = event.target.checked ? unique([...c.milestoneIds, cm]) : c.milestoneIds.filter(id => id !== cm); this.scheduleSave(); this.render({ preserveSelection: true, preserveScroll: true }); return; }
      this.onInput(event);
    },
    nodeForLink(id, kind) {
      if (this.mode === 'knowledge') return this.knowledge()?.nodes.find(n => n.id === id) || null;
      return kind === 'condition' ? this.conditionById(id) : this.plotNodeById(id);
    },
    worldPointFromClient(clientX, clientY) {
      const viewport = document.getElementById('cs-viewport-v1056'), camera = this.camera();
      if (!viewport || !camera) return { x: 0, y: 0 };
      const rect = viewport.getBoundingClientRect();
      return { x: (clientX - rect.left - camera.x) / camera.zoom, y: (clientY - rect.top - camera.y) / camera.zoom };
    },
    redrawLinkPreview(clientX, clientY, targetPortEl = null) {
      const svg = document.getElementById('cs-links-v1056'); if (!svg || !this.linkDrag) return;
      let preview = svg.querySelector('#cs-link-preview-v1057');
      if (!preview) { preview = document.createElementNS('http://www.w3.org/2000/svg', 'path'); preview.id = 'cs-link-preview-v1057'; preview.setAttribute('class', 'cs-edge-preview-v1057'); svg.appendChild(preview); }
      const source = this.nodeForLink(this.linkDrag.fromId, this.linkDrag.fromKind); if (!source) return;
      const a = this.portPoint(source, this.linkDrag.fromPort);
      let b = this.worldPointFromClient(clientX, clientY), bv = { vx: 0, vy: 0 };
      if (targetPortEl) {
        const targetNodeEl = targetPortEl.closest('[data-cs-node]');
        const target = targetNodeEl ? this.nodeForLink(targetNodeEl.dataset.csNode, targetNodeEl.dataset.csKind) : null;
        if (target) { const pp = this.portPoint(target, targetPortEl.dataset.csPort); b = { x: pp.x, y: pp.y }; bv = pp; }
      }
      const dist = Math.hypot(b.x - a.x, b.y - a.y), bend = clampV(dist * .42, 55, 190);
      const c1x = a.x + a.vx * bend, c1y = a.y + a.vy * bend;
      const c2x = b.x + (bv.vx || 0) * bend, c2y = b.y + (bv.vy || 0) * bend;
      preview.setAttribute('d', `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`);
    },
    finishPortLink(event) {
      if (!this.linkDrag) return false;
      const sourceDrag = this.linkDrag;
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-cs-port]');
      document.querySelectorAll('.cs-port-v1057.link-target-v1057').forEach(el => el.classList.remove('link-target-v1057'));
      document.getElementById('cs-link-preview-v1057')?.remove();
      this.linkDrag = null;
      if (!hit) return true;
      const targetEl = hit.closest('[data-cs-node]');
      if (!targetEl || targetEl.dataset.csNode === sourceDrag.fromId) return true;
      const toId = String(targetEl.dataset.csNode || ''), toKind = String(targetEl.dataset.csKind || '');
      const toPort = String(hit.dataset.csPort || '');
      if (!PORTS.includes(toPort)) return true;
      if (this.mode === 'knowledge') {
        const graph = this.knowledge(); if (!graph) return true;
        const exists = graph.edges.some(e => (e.from === sourceDrag.fromId && e.to === toId) || (e.from === toId && e.to === sourceDrag.fromId));
        if (exists) { Toast?.show?.('Связь уже существует', 'info'); return true; }
        graph.edges.push(normalizeEdge({ id: uid('edge'), from: sourceDrag.fromId, to: toId, fromPort: sourceDrag.fromPort, toPort, label: '' }));
      } else {
        const plot = this.plot(); if (!plot) return true;
        const fromIsCondition = sourceDrag.fromKind === 'condition', toIsCondition = toKind === 'condition';
        if (fromIsCondition && toIsCondition) { Toast?.show?.('Условие связывается с сюжетным элементом, а не с другим условием.', 'info'); return true; }
        if (fromIsCondition || toIsCondition) {
          const conditionId = fromIsCondition ? sourceDrag.fromId : toId;
          const plotId = fromIsCondition ? toId : sourceDrag.fromId;
          const plotNode = this.plotNodeById(plotId);
          if (!plotNode) return true;
          plotNode.conditionId = conditionId;
          plotNode.conditionFromPort = fromIsCondition ? sourceDrag.fromPort : toPort;
          plotNode.conditionToPort = fromIsCondition ? toPort : sourceDrag.fromPort;
        } else {
          if (plot.edges.some(e => e.from === sourceDrag.fromId && e.to === toId)) { Toast?.show?.('Такая ветка уже существует', 'info'); return true; }
          plot.edges.push(normalizeEdge({ id: uid('plot_edge'), from: sourceDrag.fromId, to: toId, fromPort: sourceDrag.fromPort, toPort, label: '' }));
        }
      }
      this.scheduleSave('campaign-studio-port-link');
      this.redrawEdges();
      this.render({ preserveSelection: true, preserveScroll: true });
      return true;
    },
    onPointerDown(event) {
      const viewport = event.target.closest('#cs-viewport-v1056'); if (!viewport) return;
      const nodeEl = event.target.closest('[data-cs-node]'); const camera = this.camera(); if (!camera) return;
      const portEl = event.target.closest('[data-cs-port]');
      if (portEl && nodeEl) {
        event.preventDefault(); event.stopPropagation();
        const port = String(portEl.dataset.csPort || ''); if (!PORTS.includes(port)) return;
        portEl.setPointerCapture?.(event.pointerId);
        this.linkDrag = { fromId: String(nodeEl.dataset.csNode || ''), fromKind: String(nodeEl.dataset.csKind || ''), fromPort: port, pointerId: event.pointerId };
        this.selectedId = this.linkDrag.fromId; this.selectedKind = this.linkDrag.fromKind; this.captureLocalView();
        this.redrawLinkPreview(event.clientX, event.clientY);
        return;
      }
      if (nodeEl) {
        const kind = nodeEl.dataset.csKind, id = nodeEl.dataset.csNode;
        let target = this.mode === 'knowledge' ? this.knowledge()?.nodes.find(n => n.id === id) : kind === 'condition' ? this.conditionById(id) : this.plotNodeById(id);
        if (!target) return;
        event.preventDefault(); nodeEl.setPointerCapture?.(event.pointerId);
        this.drag = { id, kind, element: nodeEl, startX: event.clientX, startY: event.clientY, nodeX: num(target.x), nodeY: num(target.y), moved: false, pointerId: event.pointerId };
        this.selectedId = id; this.selectedKind = kind; return;
      }
      event.preventDefault(); viewport.setPointerCapture?.(event.pointerId); viewport.classList.add('dragging');
      this.pan = { startX: event.clientX, startY: event.clientY, camX: camera.x, camY: camera.y, pointerId: event.pointerId };
    },
    onPointerMove(event) {
      const camera = this.camera(); if (!camera) return;
      if (this.linkDrag) {
        const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-cs-port]');
        document.querySelectorAll('.cs-port-v1057.link-target-v1057').forEach(el => el.classList.remove('link-target-v1057'));
        if (hit && hit.closest('[data-cs-node]')?.dataset.csNode !== this.linkDrag.fromId) hit.classList.add('link-target-v1057');
        this.redrawLinkPreview(event.clientX, event.clientY, hit); return;
      }
      if (this.drag) {
        const dx = (event.clientX - this.drag.startX) / camera.zoom, dy = (event.clientY - this.drag.startY) / camera.zoom;
        if (Math.abs(dx) + Math.abs(dy) > 2 && !this.drag.moved) { this.drag.moved = true; this.localDirty = true; this.store.updatedAt = Date.now(); }
        const x = this.drag.nodeX + dx, y = this.drag.nodeY + dy; this.updateNodePosition(this.drag.id, this.drag.kind, x, y);
        if (this.drag.element) { this.drag.element.style.left = `${clampV(x,0,3950)}px`; this.drag.element.style.top = `${clampV(y,0,2850)}px`; }
        this.redrawEdges(); return;
      }
      if (this.pan) { camera.x = this.pan.camX + event.clientX - this.pan.startX; camera.y = this.pan.camY + event.clientY - this.pan.startY; this.applyCameraTransform(); }
    },
    onPointerUp(event = {}) {
      if (this.linkDrag) { this.finishPortLink(event); return; }
      if (this.drag) { if (this.drag.moved) this.scheduleSave('campaign-studio-drag'); this.captureLocalView(); this.drag = null; }
      if (this.pan) { this.captureLocalView(); this.pan = null; document.getElementById('cs-viewport-v1056')?.classList.remove('dragging'); }
    },
    onWheel(event) {
      const viewport = event.target.closest('#cs-viewport-v1056'); if (!viewport) return;
      event.preventDefault(); const camera = this.camera(); if (!camera) return;
      const rect = viewport.getBoundingClientRect(); const sx = event.clientX - rect.left, sy = event.clientY - rect.top;
      const wx = (sx - camera.x) / camera.zoom, wy = (sy - camera.y) / camera.zoom;
      const next = clampV(camera.zoom * (event.deltaY < 0 ? 1.1 : .9), .35, 1.85);
      camera.x = sx - wx * next; camera.y = sy - wy * next; camera.zoom = next; this.applyCameraTransform(); this.captureLocalView();
    }
  };

  window.CampaignStudio = Studio;

  // Campaign sheet: plot milestones live on the campaign itself, conditions merely reference them.
  function milestoneRowMarkup(m = normalizeMilestone({ id: uid('milestone'), name: '' })) {
    return `<div class="campaign-milestone-row-v1056" data-campaign-milestone-row-v1056 data-id="${hx(m.id)}"><input class="input" name="milestoneNameV1056" value="${hx(m.name)}" placeholder="Название вехи"/><textarea class="area" name="milestoneDescriptionV1056" placeholder="Что означает эта веха и когда ДМ считает её достигнутой">${hx(m.description)}</textarea><label class="campaign-milestone-state-v1056"><input type="checkbox" name="milestoneReachedV1056" ${m.reached ? 'checked' : ''}/> достигнута</label><button type="button" class="ghost campaign-milestone-remove-v1056" data-remove-campaign-milestone-v1056>УДАЛИТЬ</button></div>`;
  }
  function milestonesEditorMarkup(campaign) {
    const rows = normalizeMilestones(campaign?.plotMilestones || []);
    return `<div class="campaign-milestones-v1056"><div class="row" style="justify-content:space-between;align-items:center"><div><div class="section-title">Вехи сюжета</div><div class="small-note">Вехи — именованные факты кампании. В Campaign Studio из них строятся общие условия веток сюжета.</div></div><button class="secondary" type="button" data-add-campaign-milestone-v1056>+ ВЕХА</button></div><div data-campaign-milestones-list-v1056>${rows.map(milestoneRowMarkup).join('') || '<div class="small-note" data-empty-campaign-milestones-v1056>Вех пока нет.</div>'}</div></div>`;
  }
  function readMilestonesFromForm(formEl) {
    return Array.from(formEl.querySelectorAll('[data-campaign-milestone-row-v1056]')).map((row, index) => normalizeMilestone({ id: row.dataset.id || uid('milestone'), name: row.querySelector('[name="milestoneNameV1056"]')?.value || `Веха ${index + 1}`, description: row.querySelector('[name="milestoneDescriptionV1056"]')?.value || '', reached: row.querySelector('[name="milestoneReachedV1056"]')?.checked === true }, index)).filter(m => m.name);
  }

  try {
    loadMilestonesFromPayload(worldData || {});
    const oldApply = applyWorldData;
    applyWorldData = function(payload = {}) { const result = oldApply(payload); Studio.load(payload); return result; };

    const oldBuild = buildWorldSnapshot;
    buildWorldSnapshot = function() {
      const snap = oldBuild();
      snap.campaignStudio = clone(Studio.store);
      if (snap?.campaigns?.CAMPAIGNS) Object.entries(snap.campaigns.CAMPAIGNS).forEach(([id, campaign]) => { campaign.plotMilestones = clone(campaignMilestones(id)); });
      return snap;
    };

    const oldRenderCampaign = Configurator.renderCampaignEditor.bind(Configurator);
    Configurator.renderCampaignEditor = function(entity) {
      const live = campaignById(entity?.id) || entity || {};
      if (live && !Array.isArray(live.plotMilestones)) live.plotMilestones = normalizeMilestones(entity?.plotMilestones || []);
      let html = oldRenderCampaign(live);
      const block = milestonesEditorMarkup(live);
      if (html.includes('<button class="primary" type="submit">SAVE_CAMPAIGN</button>')) html = html.replace('<button class="primary" type="submit">SAVE_CAMPAIGN</button>', `${block}<button class="primary" type="submit">SAVE_CAMPAIGN</button>`);
      else html = html.replace('</form>', `${block}</form>`);
      return html;
    };

    const oldCollect = Configurator.collectEntity.bind(Configurator);
    Configurator.collectEntity = function(type, formEl, formData = new FormData(formEl)) {
      const entity = oldCollect(type, formEl, formData);
      if (type === 'campaigns' && entity) entity.plotMilestones = readMilestonesFromForm(formEl);
      return entity;
    };

    const oldInsert = Configurator.insertEntity.bind(Configurator);
    Configurator.insertEntity = function(type, entity) {
      const milestones = type === 'campaigns' ? normalizeMilestones(entity?.plotMilestones || []) : null;
      const result = oldInsert(type, entity);
      if (type === 'campaigns' && entity?.id) {
        const target = campaignById(entity.id); if (target) target.plotMilestones = milestones;
        if (worldData?.campaigns?.CAMPAIGNS?.[entity.id]) worldData.campaigns.CAMPAIGNS[entity.id].plotMilestones = clone(milestones);
      }
      return result;
    };

    const oldReplace = Configurator.replaceEntity.bind(Configurator);
    Configurator.replaceEntity = function(type, oldId, entity) {
      const workspace = type === 'campaigns' && oldId && oldId !== entity?.id ? clone(Studio.store.campaigns[oldId]) : null;
      const result = oldReplace(type, oldId, entity);
      if (workspace && entity?.id) { Studio.store.campaigns[entity.id] = normalizeCampaignWorkspace(workspace); delete Studio.store.campaigns[oldId]; if (Studio.campaignId === oldId) Studio.campaignId = entity.id; }
      return result;
    };
  } catch (err) { console.error('CAMPAIGN_STUDIO_PATCH_FAILED', err); }

  document.addEventListener('click', event => {
    if (event.target.closest('#campaign-studio-dock-btn')) { Studio.open(); return; }
    if (event.target.closest('#campaign-studio-save-v1056')) { Studio.persist('campaign-studio-manual-save', { silent: false }); return; }
    const addM = event.target.closest('[data-add-campaign-milestone-v1056]'); if (addM) { const list = document.querySelector('[data-campaign-milestones-list-v1056]'); list?.querySelector('[data-empty-campaign-milestones-v1056]')?.remove(); list?.insertAdjacentHTML('beforeend', milestoneRowMarkup()); return; }
    const removeM = event.target.closest('[data-remove-campaign-milestone-v1056]'); if (removeM) { removeM.closest('[data-campaign-milestone-row-v1056]')?.remove(); return; }
    if (event.target.closest('#mod-campaign-studio')) Studio.onClick(event);
  });
  document.addEventListener('input', event => { if (event.target.closest('#mod-campaign-studio')) Studio.onInput(event); });
  document.addEventListener('change', event => { if (event.target.closest('#mod-campaign-studio')) Studio.onChange(event); });
  document.addEventListener('pointerdown', event => { if (event.target.closest('#mod-campaign-studio')) Studio.onPointerDown(event); });
  document.addEventListener('pointermove', event => Studio.onPointerMove(event));
  document.addEventListener('pointerup', event => Studio.onPointerUp(event));
  document.addEventListener('pointercancel', event => Studio.onPointerUp(event));
  document.addEventListener('wheel', event => { if (event.target.closest('#mod-campaign-studio')) Studio.onWheel(event); }, { passive: false });

  const oldOpenModule = UI.openModule.bind(UI);
  UI.openModule = function(id, options = {}) {
    if (id === 'campaign-studio') {
      if (String(App?.currentUser?.role || '').toLowerCase() !== 'gm') return;
      Studio.render({ preserveSelection: true, preserveScroll: true });
    }
    return oldOpenModule(id, options);
  };
  const oldFinishLogin = App.finishLogin.bind(App);
  App.finishLogin = function(...args) { const result = oldFinishLogin(...args); Studio.updateAccess(); return result; };
  const oldLogout = App.logout.bind(App);
  App.logout = function(...args) { const result = oldLogout(...args); Studio.updateAccess(); return result; };

  // Initial state can already be authenticated before this file is evaluated.
  Studio.ensureCampaignSelection();
  Studio.restoreLocalView();
  Studio.updateAccess();
})();
