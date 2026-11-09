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
    let busy = false;
    const name = (id) => B.item(id)?.name || id;
    async function run(input) {
      if (busy || !view.isConnected || B.currentPlayer()?.id !== playerId) return;
      busy = true;
      const status = view.querySelector('[data-status]');
      status.textContent = '';
      body.querySelectorAll('button').forEach(button => button.disabled = true);
      try {
        const result = await B.hubRequest('storage', {...scope, ...input});
        if (input.operationId) savePending(null);
        if (view.isConnected) render(result);
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && input.operationId) savePending(null);
        if (view.isConnected) {
          body.querySelectorAll('button').forEach(button => button.disabled = false);
          const reload = body.querySelector('[data-storage-refresh]');
          if (!reload) body.innerHTML = '<button class="secondary" data-storage-refresh>ПОВТОРИТЬ</button>';
          body.querySelector('[data-storage-refresh]').onclick = () => run(pending || {action:'open'});
          status.textContent = error.message;
        }
      } finally { busy = false; }
    }
    function render(result) {
      const {rights, contents, shared, capacity, creditLimit} = result;
      const player = B.currentPlayer();
      const equipped = [...Object.values(player.equipmentSlots || {}), ...(player.implantSlots || [])];
      const bag = (player.inventory || []).map(row => ({...row, qty:Number(row.qty) - equipped.filter(id => id === row.itemId).length})).filter(row => row.qty > 0);
      const format = (value) => number.format(Number(value) || 0);
      const listing = contents?.items.map(row => '<li>' + esc(name(row.itemId)) + ' × ' + format(row.qty) + '</li>').join('');
      const form = (action, rows, caption) => '<form data-action="' + action + '"><strong>' + caption + '</strong>' +
        '<select class="select" name="itemId" aria-label="Что переместить"><option value="">Кредиты</option>' +
        rows.map(row => '<option value="' + esc(row.itemId) + '">' + esc(name(row.itemId)) + ' × ' + format(row.qty) + '</option>').join('') +
        '</select><input class="input" name="amount" aria-label="Количество" type="number" step="any" min="0.0001" value="1" required>' +
        '<button class="primary" type="submit">' + caption + '</button></form>';
      body.innerHTML = '<p>' + (shared ? 'Общий ящик' : 'Личный ящик') + ' · ' + capacity + ' ячеек' +
        (creditLimit ? ' · лимит ' + format(creditLimit) + ' кр.' : '') + '</p>' +
        (contents ? '<p>Занято ' + format(contents.cells) + ' из ' + capacity + ' · ' + format(contents.credits) + ' кр.</p>' +
          (listing ? '<ul>' + listing + '</ul>' : '<p>Предметов нет.</p>') : '<p>Просмотр содержимого закрыт.</p>') +
        '<p>При себе ' + format(player.credits) + ' кр.</p>' +
        (rights.deposit ? form('deposit', bag, 'Внести') : '') +
        (rights.withdraw ? form('withdraw', contents.items, 'Изъять') : '') +
        '<button class="secondary" data-storage-refresh>ОБНОВИТЬ</button>';
      body.querySelector('[data-storage-refresh]').onclick = () => run(pending || {action:'open'});
      body.querySelectorAll('form').forEach(form => form.onsubmit = (event) => {
        event.preventDefault();
        if (busy) return;
        if (pending) { run(pending); return; }
        const data = new FormData(form);
        const itemId = String(data.get('itemId') || ''), amount = Number(data.get('amount'));
        if (itemId && form.dataset.action === 'withdraw' && B.canAdd) {
          const check = B.canAdd(player, itemId, amount);
          if (check?.ok === false) { view.querySelector('[data-status]').textContent = check.reason; return; }
        }
        const input = {action:form.dataset.action, itemId, amount, operationId:window.GRPGPlayerSyncCoreV135.operationId()};
        try { savePending(input); }
        catch { view.querySelector('[data-status]').textContent = 'Не удалось сохранить идентификатор операции в браузере'; return; }
        run(input);
      });
    }
    run(pending || {action:'open'});
  }

  window.GRPGHubMultiplayerV221 = {presence, storage};
})();
