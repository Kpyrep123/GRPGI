/* Character sheet presentation shared by Electron and the web client. */
(function (root) {
  'use strict';
  function sectionForTitle(host, title) {
    const heading = Array.from(host.children).find(node => node.classList.contains('section-head') && node.querySelector('.section-title')?.textContent.trim() === title);
    if (!heading) return [];
    const content = heading.nextElementSibling;
    return content ? [heading, content] : [heading];
  }
  function layoutWeb(host) {
    const hero = host.querySelector(':scope > .profile-card');
    const inventory = host.querySelector(':scope > .web-profile-inventory-v1067');
    if (!hero || !inventory) return;
    host.classList.add('character-sheet-v142');
    const personality = sectionForTitle(hero, 'Личность');
    const lore = hero.querySelector('.profile-lore-rich-v1103');
    const abilities = sectionForTitle(host, 'Характеристики');
    const specializations = sectionForTitle(host, 'Специализации');
    const reputation = sectionForTitle(host, 'Репутация');
    const related = Array.from(host.querySelectorAll(':scope > .related-entity-section-v1100'));
    const tail = document.createElement('section');
    tail.className = 'character-sheet-story-v142';
    for (const node of [...personality, lore, ...related].filter(Boolean)) tail.append(node);
    const sequence = document.createDocumentFragment();
    for (const node of [...abilities, ...specializations, inventory, ...reputation].filter(Boolean)) sequence.append(node);
    hero.after(sequence);
    if (tail.childElementCount) host.append(tail);
    const slots = inventory.querySelector('.web-inventory-slots-v1067');
    if (slots) groupSlots(slots, 'web-inventory-slot-v1067');
  }
  function groupSlots(host, slotClass) {
    if (host.querySelector('.character-sheet-gear-v142')) return;
    const equipment = document.createElement('div');
    equipment.className = 'character-sheet-gear-v142';
    const implants = document.createElement('div');
    implants.className = 'character-sheet-implants-v142';
    for (const slot of Array.from(host.children)) {
      (slot.dataset.slotType === 'implant' ? implants : equipment).append(slot);
    }
    host.append(equipment, implants);
  }
  function layoutDesktop(host, user = {}) {
    const grid = host.querySelector(':scope > .grid3');
    if (!grid) return;
    host.classList.add('character-sheet-v142');
    const hero = grid.querySelector(':scope > .stack:first-child > .profile-card');
    const ability = Array.from(grid.querySelectorAll('.profile-card')).find(card => card.querySelector('.abilities'));
    const inventory = grid.querySelector('.inventory-profile-card-v1067');
    const social = grid.querySelector('.profile-social-card-v123');
    const personality = grid.querySelector('[data-personality-v1066]');
    const form = grid.querySelector('#profile-edit-form');
    const reputation = document.createElement('section');
    reputation.className = 'card profile-card character-sheet-reputation-v142';
    const repTitle = document.createElement('div');
    repTitle.className = 'section-title';
    repTitle.textContent = 'Репутация';
    reputation.append(repTitle);
    const rows = Array.isArray(user.social?.reputation) ? user.social.reputation : [];
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'data-row';
      const name = document.createElement('span');
      name.className = 'data-label';
      name.textContent = row.name || row.orgId || 'Организация';
      const value = document.createElement('b');
      value.textContent = String(row.value ?? 0);
      line.append(name, value);
      reputation.append(line);
    }
    const repButton = social?.querySelector('#open-reputation-v50');
    if (repButton) reputation.append(repButton);
    const skillButton = social?.querySelector('#open-skills-v50');
    const tabs = host.querySelector('.profile-section-tabs-v1103');
    if (skillButton && tabs) tabs.append(skillButton);
    const lore = document.createElement('section');
    lore.className = 'card profile-card character-sheet-lore-v142';
    const loreTitle = document.createElement('div');
    loreTitle.className = 'section-title';
    loreTitle.textContent = 'История персонажа';
    const loreText = document.createElement('p');
    loreText.textContent = String(user.lore || 'Лор персонажа пока не заполнен.').replace(/<[^>]*>/g, ' ');
    lore.append(loreTitle, loreText);
    const remaining = Array.from(grid.querySelectorAll(':scope > .stack > *')).filter(node => ![hero, ability, inventory, social, personality, form].includes(node));
    grid.classList.add('character-sheet-stack-v142');
    for (const node of [hero, ability, inventory, reputation, personality, lore, social, ...remaining, form].filter(Boolean)) grid.append(node);
    grid.querySelectorAll(':scope > .stack:empty').forEach(node => node.remove());
    if (inventory) {
      const slots = inventory.querySelector('.inventory-equipment-slots-v1067');
      if (slots) groupSlots(slots, 'inventory-equip-slot-v1067');
    }
  }
  root.GRPGProfileSheetV142 = Object.freeze({layoutWeb, layoutDesktop});
})(window);
