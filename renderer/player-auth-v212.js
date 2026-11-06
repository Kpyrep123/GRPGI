/* Shared recovery UI. Passwords and reset tokens are never copied into player data. */
(function(root) {
  'use strict';
  let adapter;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const path = name => '/api/grpgi/auth-v212/' + name;
  function dialog(title, content) {
    document.getElementById('auth-dialog-v212')?.remove();
    const box = document.createElement('dialog');
    box.id = 'auth-dialog-v212';
    box.style.cssText = 'width:min(560px,92vw);max-height:90vh;overflow:auto;background:var(--panel,#15140f);color:var(--text,#ddd5c4);border:1px solid var(--accent,#b99358);padding:20px';
    box.innerHTML = '<form method="dialog"><button class="secondary" style="float:right" aria-label="Закрыть">×</button></form><h3>' + escape(title) + '</h3>' + content + '<p role="status" data-auth-status></p>';
    document.body.append(box);
    box.showModal();
    return box;
  }
  function error(box, problem) {
    box.querySelector('[data-auth-status]').textContent = problem.message || 'Не удалось выполнить запрос';
  }
  function recovery() {
    const box = dialog('Восстановление пароля', '<p>Запросите восстановление для выбранного персонажа. Свяжитесь с ДМом через известный ему контакт.</p><button class="primary" data-request>Отправить запрос ДМу</button><hr><p>Уже получили ссылку восстановления?</p><button class="secondary" data-code>Ввести ссылку</button>');
    box.querySelector('[data-code]').onclick = () => confirm();
    box.querySelector('[data-request]').onclick = async event => {
      event.target.disabled = true;
      try {
        await adapter.call(path('recovery/request'), {campaignId:adapter.campaign(), playerId:adapter.selected()});
        box.querySelector('[data-auth-status]').textContent = 'Если персонаж существует, запрос передан ДМу.';
      } catch (problem) { error(box, problem); event.target.disabled = false; }
    };
  }
  function confirm(token = '') {
    const box = dialog('Новый пароль', '<form data-confirm><label class="field">Ссылка восстановления<input class="input" name="token" required autocomplete="off" value="' + escape(token) + '"></label><label class="field">Новый пароль<input class="input" type="password" name="password" minlength="8" required autocomplete="new-password"></label><label class="field">Повторите пароль<input class="input" type="password" name="again" required autocomplete="new-password"></label><button class="primary">Сохранить новый пароль</button></form>');
    box.querySelector('[data-confirm]').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget, data = new FormData(form), button = form.querySelector('button');
      if (data.get('password') !== data.get('again')) { error(box, new Error('Пароли не совпадают')); return; }
      let secret = String(data.get('token') || '');
      if (secret.includes('#recover=')) secret = secret.split('#recover=')[1];
      button.disabled = true;
      try {
        await adapter.call(path('recovery/confirm'), {token:secret, password:String(data.get('password'))});
        form.remove();
        box.querySelector('[data-auth-status]').textContent = 'Пароль изменён. Войдите заново.';
      } catch (problem) { error(box, problem); button.disabled = false; }
    };
  }
  async function inbox() {
    const box = dialog('Запросы восстановления', '<p>Подтвердите личность игрока через известный контакт перед выдачей ссылки.</p><div data-requests>Загрузка…</div>');
    try {
      const campaign = adapter.campaign();
      const result = await adapter.call(path('recovery/requests'), null, {campaignId:campaign});
      const list = box.querySelector('[data-requests]');
      list.innerHTML = result.requests.map(request => '<div class="card" style="padding:12px;margin:8px 0"><b>' + escape(adapter.name(request.playerId)) + '</b><p>' + escape(request.status === 'approved' ? 'Ссылка уже выдана. Повторная выдача отменит прежнюю.' : 'Ожидает подтверждения') + '</p><button class="primary" data-approve="' + escape(request.id) + '">Выдать ссылку</button> <button class="secondary" data-reject="' + escape(request.id) + '">Отклонить</button></div>').join('') || '<p>Запросов нет.</p>';
      list.onclick = async event => {
        const button = event.target.closest('[data-approve],[data-reject]');
        if (!button) return;
        const row = button.closest('.card');
        row.querySelectorAll('button').forEach(node => node.disabled = true);
        try {
          const action = button.hasAttribute('data-approve') ? 'approve' : 'reject';
          const response = await adapter.call(path('recovery/' + action), {campaignId:campaign, requestId:button.dataset.approve || button.dataset.reject});
          if (action === 'approve') {
            row.innerHTML = '<p>Передайте эту ссылку игроку лично. Она действует 30 минут и используется один раз.</p><textarea class="input" readonly aria-label="Ссылка восстановления">' + escape(response.url) + '</textarea>';
          } else row.remove();
        } catch (problem) { error(box, problem); row.querySelectorAll('button').forEach(node => node.disabled = false); }
      };
    } catch (problem) { error(box, problem); }
  }
  function attach() {
    const input = document.getElementById(adapter.input);
    if (input && !document.querySelector('[data-auth-recover-v212]')) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'secondary'; button.textContent = 'Забыли пароль?';
      button.dataset.authRecoverV212 = '';
      button.onclick = recovery;
      input.closest('.field')?.after(button);
    }
    const host = adapter.profile();
    if (host && adapter.dm() && !host.querySelector('[data-auth-inbox-v212]')) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'secondary'; button.textContent = 'Запросы восстановления пароля';
      button.dataset.authInboxV212 = ''; button.onclick = inbox; host.prepend(button);
    }
  }
  function install(options) {
    adapter = options;
    attach();
    const match = /^#recover=([A-Za-z0-9]{48})$/.exec(location.hash);
    if (match) {
      history.replaceState(null, '', location.pathname + location.search);
      confirm(match[1]);
    }
  }
  root.GRPGPlayerAuthV212 = {install, attach};
})(window);
