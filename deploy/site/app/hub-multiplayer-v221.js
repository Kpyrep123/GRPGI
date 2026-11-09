(() => {
  'use strict';
  const number = new Intl.NumberFormat('ru', {maximumFractionDigits:4});

  function presence(B, map, context, player, getPoint) {
    if (!B.hubRequest) return () => {};
    const nodes = new Map();
    const layer = document.createElement('div');
    layer.className = 'hub-presence-v221';
    layer.setAttribute('aria-hidden', 'true');
    map.append(layer);
    const scope = {planetId:context.planet.id, mapId:context.map.id};
    let active = true, timer;
    async function poll() {
      if (!active || !B.isActive() || B.currentPlayer()?.id !== player.id || B.currentPlanet()?.id !== scope.planetId) {
        stop();
        return;
      }
      let delay = 360;
      try {
        const point = getPoint();
        const result = await B.hubRequest('presence', {...scope, x:point.x, y:point.y});
        if (!active) return;
        const visible = new Set();
        for (const peer of result.peers || []) {
          const profile = B.playerById?.(peer.id);
          if (String(profile?.role || '').toLowerCase() === 'gm') continue;
          let node = nodes.get(peer.id);
          if (!node) {
            node = document.createElement('div');
            node.className = 'hub-peer-v221';
            node.style.width = node.style.height = (window.GRPGHubFreeV178?.radius(context.map) * 2 || 40) + 'px';
            if (profile?.image) {
              const image = document.createElement('img');
              image.src = profile.image;
              image.alt = '';
              node.append(image);
            } else node.textContent = profile?.avatarGlyph || String(profile?.displayName || peer.id)[0]?.toUpperCase() || '?';
            node.title = profile?.displayName || peer.id;
            nodes.set(peer.id, node);
            layer.append(node);
          }
          visible.add(peer.id);
          node.style.transform = 'translate(' + peer.x + 'px,' + peer.y + 'px) translate(-50%,-50%)';
        }
        for (const [id, node] of nodes) if (!visible.has(id)) { node.remove(); nodes.delete(id); }
      } catch {
        layer.replaceChildren();
        nodes.clear();
        delay = 2500;
      }
      if (active) timer = setTimeout(poll, delay);
    }
    function stop() {
      active = false;
      clearTimeout(timer);
      layer.remove();
    }
    poll();
    return stop;
  }

  function storage(B, modal, context, box, esc) {
    const playerId = context.playerId;
    const scope = {planetId:context.planet.id, mapId:context.map.id, objectId:box.id};
    const view = modal(box.name || 'Ящик', '<div data-storage-v221>Загрузка…</div>');
    view.dataset.hubStorageV221 = '';
    const body = view.querySelector('[data-storage-v221]');
    const pendingKey = 'grpgi.hub-storage.v221:' + JSON.stringify([B.marketContext?.().campaignId, playerId, scope]);
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch {}
    const savePending = (value) => {
      if (value) localStorage.setItem(pendingKey, JSON.stringify(value));
      else { try { localStorage.removeItem(pendingKey); } catch {} }
      pending = value;
    };
    const format = value => number.format(Number(value) || 0);
    const bagSide = 'player';
    const boxSide = 'box';
    let result, selected, dragged, busy = false;
    const tiles = new Map();
    const web = Boolean(document.getElementById('screen-hub-v153'));
    const skin = web ? {
      grid:'web-inventory-grid-v1067', cell:'web-inventory-cell-v1067', tile:'web-inventory-tile-v1067 web-item-card-v118'
    } : {
      grid:'inventory-grid-v1067 inventory-grid-v115', cell:'inventory-grid-cell-v1067', tile:'inventory-tile-v1067 inventory-tile-v115'
    };
    view.setAttribute('role', 'dialog');
    view.setAttribute('aria-modal', 'true');
    view.setAttribute('aria-label', box.name || 'Ящик');
    view.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); view.remove(); }
    });
    view.querySelector('[data-close]')?.focus();
    const status = view.querySelector('[data-status]');
    const act = tile => tile.side === bagSide ? 'deposit' : 'withdraw';
    const caption = tile => tile.side === bagSide ? 'Сложить' : 'Забрать';
    const canMove = tile => Boolean(result?.rights[act(tile)]);

    function tileMarkup(tile, placement = '') {
      tiles.set(tile.key, tile);
      const title = tile.item?.name || tile.itemId || 'Кредиты';
      return `<button type="button" class="${skin.tile} hub-storage-tile-v221" data-storage-tile="${esc(tile.key)}"
        draggable="${Boolean(tile.itemId && canMove(tile))}" aria-pressed="false" title="${esc(title)}" ${placement}>
        ${tile.item ? B.itemThumb(tile.item) : '<span class="hub-storage-credit-icon-v221" aria-hidden="true">CR</span>'}
        <span>${esc(title)}</span><small>${tile.itemId ? '× ' + format(tile.qty) : format(tile.qty) + ' кр.'}</small>
      </button>`;
    }

    function inventory(side, player, options) {
      const layout = B.inventoryLayout(player, options);
      const cols = layout.cols, size = layout.size;
      const rows = layout.user?.inventory || player.inventory || [];
      const cellMarkup = Array.from({length:size}, (_, index) => `<div class="${skin.cell}" aria-hidden="true"
        style="grid-column:${index % cols + 1};grid-row:${Math.floor(index / cols) + 1}"></div>`).join('');
      function makeTile(entry, group, index) {
        const row = rows.find(item => item.itemId === entry.itemId);
        const qty = Number(entry.qty || 1);
        const copies = row?.instancesV215?.slice(entry.unitIndex, entry.unitIndex + qty) || [];
        return {key:`${side}:${group}:${index}`, side, itemId:entry.itemId, item:entry.item || B.item(entry.itemId) || {id:entry.itemId, name:entry.itemId},
          qty, copies:copies.length === qty && copies.every(copy => copy.id) ? copies : []};
      }
      const items = layout.instances.map((entry, index) => tileMarkup(makeTile(entry, 'grid', index),
        `style="grid-column:${entry.pos.x + 1}/span ${entry.w};grid-row:${entry.pos.y + 1}/span ${entry.h}"`)).join('');
      const overflow = (layout.overflow || []).map((entry, index) => tileMarkup(makeTile(entry, 'overflow', index))).join('');
      const documents = (layout.text || []).map((entry, index) => tileMarkup(makeTile({
        ...entry, itemId:entry.itemId || entry.entry?.itemId, unitIndex:(entry.entry?.qty || entry.qty) - entry.qty
      }, 'text', index))).join('');
      return `<div class="hub-storage-scroll-v221"><div class="${skin.grid} hub-storage-grid-v221" style="--inv-cols:${cols};--inv-rows:${layout.rows}">
        ${cellMarkup}${items}</div></div>
        ${overflow ? `<p>Вне сетки</p><div class="hub-storage-loose-v221">${overflow}</div>` : ''}
        ${documents ? `<p>Предметы без размера</p><div class="hub-storage-loose-v221">${documents}</div>` : ''}`;
    }

    function render() {
      const {contents, shared, capacity, creditLimit} = result;
      const player = B.currentPlayer();
      tiles.clear();
      dragged = null;
      body.innerHTML = `<div class="hub-storage-toolbar-v221">
        <span>${shared ? 'Общий ящик' : 'Личный ящик'}${creditLimit ? ' · лимит ' + format(creditLimit) + ' кр.' : ''}</span>
        <button type="button" class="secondary" data-storage-refresh>Обновить</button></div>
        <div class="hub-storage-panes-v221">
          <section data-storage-side="player"><h4>Инвентарь игрока</h4>
            ${inventory(bagSide, player)}
            ${tileMarkup({key:'player:credits', side:bagSide, qty:Number(player.credits || 0)})}
          </section>
          <section data-storage-side="box"><h4>Инвентарь ящика</h4>
            ${contents ? `<p class="subtle">Занято ${format(contents.cells)} из ${capacity} ячеек</p>
              ${inventory(boxSide, {inventory:contents.items}, {storageCapacity:capacity})}
              ${tileMarkup({key:'box:credits', side:boxSide, qty:Number(contents.credits || 0)})}` : '<p>Просмотр содержимого закрыт.</p>'}
          </section>
        </div>
        <section class="hub-storage-detail-v221" data-storage-detail aria-label="Информация о предмете"></section>`;
      select(null);
    }

    function select(tile) {
      selected = tile;
      for (const button of body.querySelectorAll('[data-storage-tile]')) {
        button.setAttribute('aria-pressed', String(button.dataset.storageTile === tile?.key));
      }
      const detail = body.querySelector('[data-storage-detail]');
      if (!tile) {
        detail.textContent = 'Выбери предмет, чтобы посмотреть характеристики или переместить его.';
        return;
      }
      const copy = tile.copies?.length === 1 ? tile.copies[0] : null;
      const info = tile.item && copy ? {...tile.item, rarity:copy.rarity || tile.item.rarity,
        modifiers:[...(tile.item.modifiers || []), ...(copy.modifiers || [])]} : tile.item;
      const facts = window.GRPGItemFactsV141;
      const requirements = Object.entries(info?.requirements || {}).filter(([, value]) => value !== '' && value != null);
      const articles = (info?.relatedArticleIds || []).map(id => B.article?.(id)).filter(Boolean);
      const title = info?.name || tile.itemId || 'Кредиты';
      const amount = tile.itemId ? '1' : '0.0001';
      detail.innerHTML = `<h4>${esc(title)} · ${format(tile.qty)}</h4>
        ${canMove(tile) && tile.qty > 0 ? `<form data-storage-transfer>
          <label>Количество <input class="input" name="amount" type="number" step="${amount}" min="${amount}"
            max="${tile.qty}" value="${tile.itemId ? 1 : Math.min(1, tile.qty)}" required></label>
          <button type="submit" class="primary">${caption(tile)}</button></form>` : ''}
        ${info ? `<div class="hub-storage-details-image-v221">${B.itemThumb(info)}</div>
          ${copy?.durabilityMax ? `<p>Прочность ${format(copy.durability)} / ${format(copy.durabilityMax)}</p>` : ''}
          ${copy?.chargesMax ? `<p>Заряды ${format(copy.charges)} / ${format(copy.chargesMax)}</p>` : ''}
          ${facts.table(info)}${facts.description(info)}
          ${requirements.length ? '<p>Требования: ' + requirements.map(([key, value]) => esc(key) + ' ' + esc(value)).join(' · ') + '</p>' : ''}
          ${articles.map(article => `<button type="button" class="secondary" data-storage-article="${esc(article.id)}">${esc(article.title || article.name || article.id)}</button>`).join('')}` : ''}`;
    }

    async function run(input) {
      if (busy || !view.isConnected || B.currentPlayer()?.id !== playerId) return;
      busy = true;
      status.textContent = '';
      body.inert = true;
      try {
        result = await B.hubRequest('storage', {...scope, ...input});
        if (input.operationId) savePending(null);
        if (view.isConnected && B.currentPlayer()?.id === playerId) render();
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && input.operationId) savePending(null);
        if (view.isConnected) {
          if (!body.querySelector('[data-storage-refresh]')) body.innerHTML = '<button type="button" class="secondary" data-storage-refresh>Повторить</button>';
          status.textContent = error.message;
        }
      } finally {
        busy = false;
        body.inert = false;
      }
    }

    function transfer(tile, amount) {
      if (!tile || !canMove(tile) || busy || amount <= 0 || amount > tile.qty || (tile.itemId && !Number.isInteger(amount))) return;
      if (pending) {
        status.textContent = 'Обнови ящик, чтобы завершить предыдущую операцию.';
        return;
      }
      const action = act(tile);
      if (tile.itemId && action === 'withdraw') {
        const check = B.canAdd?.(B.currentPlayer(), tile.itemId, amount);
        if (check?.ok === false) { status.textContent = check.reason; return; }
      }
      const input = {action, itemId:tile.itemId || '', amount, operationId:window.GRPGPlayerSyncCoreV135.operationId()};
      if (tile.copies?.length) input.instanceIds = tile.copies.slice(0, amount).map(copy => copy.id);
      try { savePending(input); }
      catch { status.textContent = 'Не удалось сохранить идентификатор операции в браузере'; return; }
      run(input);
    }

    body.addEventListener('click', event => {
      if (busy) return;
      if (event.target.closest('[data-storage-refresh]')) { run(pending || {action:'open'}); return; }
      const button = event.target.closest('[data-storage-tile]');
      if (button) {
        select(tiles.get(button.dataset.storageTile));
        body.querySelector('[data-storage-detail]').scrollIntoView?.({block:'nearest'});
        return;
      }
      const article = event.target.closest('[data-storage-article]');
      if (article) { view.remove(); B.openArticle(article.dataset.storageArticle); }
    });
    body.addEventListener('submit', event => {
      if (!event.target.matches('[data-storage-transfer]')) return;
      event.preventDefault();
      transfer(selected, Number(new FormData(event.target).get('amount')));
    });
    body.addEventListener('dragstart', event => {
      const tile = tiles.get(event.target.closest('[data-storage-tile]')?.dataset.storageTile);
      if (!tile?.itemId || !canMove(tile) || busy || pending) { event.preventDefault(); return; }
      dragged = tile;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-grpgi-storage', tile.key);
    });
    function clearDropTarget() {
      body.querySelector('[data-storage-drop-active]')?.removeAttribute('data-storage-drop-active');
    }
    body.addEventListener('dragover', event => {
      const target = event.target.closest('[data-storage-side]');
      if (dragged && target && target.dataset.storageSide !== dragged.side) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (!target.hasAttribute('data-storage-drop-active')) {
          clearDropTarget();
          target.setAttribute('data-storage-drop-active', '');
        }
      }
    });
    body.addEventListener('dragleave', event => {
      const target = event.target.closest('[data-storage-side]');
      if (target && !target.contains(event.relatedTarget)) clearDropTarget();
    });
    body.addEventListener('drop', event => {
      clearDropTarget();
      const target = event.target.closest('[data-storage-side]');
      const tile = dragged;
      dragged = null;
      if (!tile || !target || target.dataset.storageSide === tile.side ||
          event.dataTransfer.getData('application/x-grpgi-storage') !== tile.key) return;
      event.preventDefault();
      transfer(tile, tile.qty);
    });
    body.addEventListener('dragend', () => { dragged = null; clearDropTarget(); });
    run(pending || {action:'open'});
  }

  window.GRPGHubMultiplayerV221 = {presence, storage};
})();
