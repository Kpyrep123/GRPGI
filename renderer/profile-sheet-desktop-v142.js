/* Desktop character sheet and print action. Loaded after profile feature packs. */
(function () {
  'use strict';
  const before = UI.renderProfile.bind(UI);
  UI.renderProfile = function (...args) {
    const result = before(...args);
    const host = document.getElementById('profile-content');
    if (host?.querySelector('.grid3')) window.GRPGProfileSheetV142?.layoutDesktop(host, App.currentUser || {});
    const toolbar = document.querySelector('#mod-profile .fs-header .row');
    if (toolbar && !toolbar.querySelector('[data-export-profile-pdf-v142]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.dataset.exportProfilePdfV142 = '';
      button.textContent = 'ПЕЧАТЬ / PDF';
      toolbar.prepend(button);
    }
    return result;
  };
  function profilePayload(user) {
    const equipped = user.equipmentSlots || {};
    const itemName = id => String(EQUIPMENT?.[id]?.name || id || '—');
    const details = id => window.GRPGItemFactsV141?.facts(EQUIPMENT?.[id] || {})
      .filter(row => !['Тип','Редкость','Размер','Масса'].includes(row.label))
      .map(row => `${row.label}: ${row.value}`).join(' · ') || '';
    const equipment = [
      ['Основное оружие', equipped.primaryWeapon], ['Вторичное оружие', equipped.secondaryWeapon],
      ['Броня', equipped.armor], ['Рюкзак', equipped.backpack]
    ].map(([slot, id]) => ({ name: itemName(id), detail: [slot, id ? details(id) : 'Пусто'].filter(Boolean).join(' · ') }));
    const implants = (user.implantSlots || []).filter(Boolean).map(id => ({ name: itemName(id), detail: details(id) }));
    const inventory = (user.inventory || []).map(row => typeof row === 'string'
      ? { name: itemName(row), detail: details(row) }
      : { name: itemName(row.itemId || row.id), detail: [`×${row.qty || 1}`, details(row.itemId || row.id)].filter(Boolean).join(' · ') });
    return {
      id: user.id, name: user.displayName, rank: user.rank || user.role,
      location: user.location?.planetId || '', stats: user.stats, credits: user.credits,
      abilities: user.abilities, vision: user.combat?.visionRange, movement: user.combat?.moveRange,
      inventorySize: user.inventorySize, carryWeightMax: user.carryWeightMax,
      equipment, implants, inventory,
      reputation: (user.social?.reputation || []).map(row => ({ name: row.name || row.orgId || 'Организация', detail: `${row.value ?? 0}${row.status ? ' · ' + row.status : ''}` })),
      personalityTrait: user.personalityTrait, ideal: user.ideal, weakness: user.weakness,
      lore: user.lore, npcs: (user.social?.npcIds || []).map(id => ({ name: String(id) }))
    };
  }
  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('[data-export-profile-pdf-v142]');
    if (!button || button.disabled) return;
    const user = App.currentUser;
    if (!user) return;
    button.disabled = true;
    let frame;
    try {
      const html = window.GRPGProfilePrintV142.renderProfilePdfV142(profilePayload(user));
      frame = document.createElement('iframe');
      frame.setAttribute('title', 'Печатный лист персонажа');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0';
      document.body.append(frame);
      await new Promise((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = () => reject(new Error('Не удалось подготовить печатный лист'));
        frame.srcdoc = html;
      });
      frame.contentWindow.focus();
      frame.contentWindow.print();
      Toast.show('В диалоге печати выберите «Сохранить как PDF».', 'info');
    } catch (error) {
      Toast.show(`Печать профиля не удалась: ${error.message}`, 'err');
    } finally {
      button.disabled = false;
      if (frame) setTimeout(() => frame.remove(), 60000);
    }
  });
})();
