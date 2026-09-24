/* Character sheet presentation shared by Electron and the web client. */
(function (root) {
  'use strict';
  function sectionForTitle(host, title) {
    const heading = Array.from(host.children).find(node => node.classList.contains('section-head') && node.querySelector('.section-title')?.textContent.trim() === title);
    if (!heading) return [];
    const content = heading.nextElementSibling;
    return content ? [heading, content] : [heading];
  }
  function layoutWeb(host, user = {}) {
    if (!host || host.querySelector(':scope > .character-sheet-story-v142')) return;
    const hero = host.querySelector(':scope > .profile-card');
    const inventory = host.querySelector(':scope > .web-profile-inventory-v1067');
    if (!hero || !inventory) return;
    host.classList.add('character-sheet-v142');
    decorateHero(hero, user);
    const personality = sectionForTitle(hero, 'Личность');
    const lore = hero.querySelector('.profile-lore-rich-v1103');
    const abilities = sectionForTitle(host, 'Характеристики');
    const specializations = sectionForTitle(host, 'Специализации');
    if(abilities.length) {const card=document.createElement('section');card.className='sheet-abilities';abilities[0].before(card);for(const el of abilities)card.append(el);abilities.splice(0,abilities.length,card);}
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
    if (slots) groupSlots(slots);
    compactInventory(inventory);
  }
  function groupSlots(host) {
    if (host.querySelector('.character-sheet-gear-v142')) return;
    const equipment = document.createElement('div'); equipment.className = 'character-sheet-gear-v142';
    const implants = document.createElement('div'); implants.className = 'character-sheet-implants-v142';
    const slots = host.querySelectorAll('.web-inventory-slot-v1067,.inventory-equip-slot-v1067');
    for (const slot of slots) {
      slot.dataset.slotType ||= slot.dataset.slotV113;
      (slot.dataset.slotType === 'implant' ? implants : equipment).append(slot);
    }
    host.replaceChildren(equipment, implants);
  }
  function compactInventory(card) {
    if (card.querySelector('.sheet-loadout')) return;
    let slots = card.querySelector('.web-inventory-slots-v1067,.inventory-equipment-slots-v1067');
    if (!slots) {
      slots = document.createElement('div'); slots.className = 'inventory-equipment-slots-v1067';
      card.querySelectorAll('.inventory-equip-slot-v1067').forEach(slot=>slots.append(slot));
      card.querySelectorAll('.inventory-equipment-layout-v115,.inventory-implant-strip-v115').forEach(el=>el.remove());
      card.append(slots); groupSlots(slots);
    }
    const grid = card.querySelector('.web-inventory-grid-v1067,.inventory-grid-v1067');
    if (!grid) return;
    const loadout = document.createElement('div'); loadout.className = 'sheet-loadout';
    const bag = document.createElement('div'); bag.className = 'sheet-bag';
    const title = document.createElement('div'); title.className = 'section-title'; title.textContent = 'Инвентарь';
    bag.append(title,grid);
    card.querySelectorAll('.web-inventory-grid-head-v1067').forEach(el=>el.remove());
    Array.from(card.children).filter(el=>el.classList.contains('section-title') && el.textContent==='Инвентарь').forEach(el=>el.remove());
    const capacity = card.querySelector('.web-inventory-capacity-v1067,.inventory-capacity-bar-v1067');
    if (capacity) capacity.after(loadout); else card.append(loadout);
    loadout.append(slots,bag);
    card.querySelectorAll('[draggable="true"]').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label','Действия: '+(el.querySelector('span')?.textContent||el.dataset.itemId));});
  }
  const assetBase = new URL('./assets/profile/', document.currentScript?.src || document.baseURI).href;
  function metric(icon,label,value,current,max) {
    const card=document.createElement('div');card.className='sheet-metric';
    const img=document.createElement('img');img.src=assetBase+icon+'.webp';img.alt='';img.width=48;img.height=48;
    const copy=document.createElement('div'), title=document.createElement('span'),number=document.createElement('strong');
    title.textContent=label;number.textContent=String(value??'—');copy.append(title,number);card.append(img,copy);
    if (max>0) {const bar=document.createElement('progress');bar.max=max;bar.value=Math.max(0,Number(current)||0);bar.setAttribute('aria-label',label);card.append(bar);}
    return card;
  }
  function decorateHero(hero,user) {
    if (!hero || hero.querySelector('.sheet-metrics')) return;
    hero.classList.add('sheet-hero');
    let header=hero.querySelector('.profile-hero');
    if (!header) {
      header=document.createElement('div');header.className='profile-hero';
      const copy=document.createElement('div');
      const avatar=hero.querySelector(':scope > .avatar');if(avatar)header.append(avatar);
      for(const el of hero.querySelectorAll(':scope > h2,:scope > .subtle'))copy.append(el);
      header.append(copy);hero.prepend(header);
    }
    const credit=metric('credits','Кредиты',Number(user.credits||0).toLocaleString('ru-RU'));credit.classList.add('sheet-credits');header.append(credit);
    hero.querySelectorAll(':scope > .stat-grid,:scope > .stat,[data-web-inventory-limits-v1067],[data-web-combat-stats-v118],[data-web-combat-stats-v120]').forEach(el=>el.remove());
    hero.querySelectorAll('.data-row').forEach(row=>{if(['Баланс','Класс брони','Защита','Движение','Обзор'].includes(row.querySelector('.data-label')?.textContent.trim()))row.remove();});
    const metrics=document.createElement('div');metrics.className='sheet-metrics';const s=user.stats||{},c=user.combat||{};
    metrics.append(metric('health','Здоровье',`${s.hpCurrent??0} / ${s.hpMax??0}`,s.hpCurrent,s.hpMax),metric('shield','Щит',`${s.shieldCurrent??0} / ${s.shieldMax??0}`,s.shieldCurrent,s.shieldMax),metric('energy','Энергия',`${s.energyCurrent??0} / ${s.energyMax??0}`,s.energyCurrent,s.energyMax),metric('inventory','Инвентарь / вес',`${user.inventorySize??0} яч. / ${user.carryWeightMax??0}`),metric('movement','Движение',`${c.moveRange??0} гекс.`),metric('vision','Обзор',`${c.visionRange??0} гекс.`),metric('armor-class','Класс брони',s.armorClass??0),metric('defense','Защита',s.defense??0));
    header.after(metrics);
    hero.querySelectorAll(':scope > .divider').forEach(el=>el.remove());
  }
  function layoutDesktop(host, user = {}) {
    const grid = host.querySelector(':scope > .grid3');
    if (!grid || grid.classList.contains('character-sheet-stack-v142')) return;
    host.classList.add('character-sheet-v142');
    const hero = grid.querySelector(':scope > .stack:first-child > .profile-card');
    decorateHero(hero, user);
    const location = host.querySelector(':scope > .profile-rts-location-card-v36');
    if(location && hero) {
      Array.from(hero.querySelectorAll(':scope > div')).filter(el=>el.querySelector('.section-title')?.textContent.trim()==='Текущее положение').forEach(el=>el.remove());
      hero.append(location);
    }
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
    const richLore=hero?.querySelector('.profile-lore-rich-v1086');
    const lore = document.createElement('section');
    lore.className = 'card profile-card character-sheet-lore-v142';
    const loreTitle = document.createElement('div');
    loreTitle.className = 'section-title';
    loreTitle.textContent = 'История персонажа';
    const loreText = document.createElement('p');
    loreText.textContent = String(user.lore || 'Лор персонажа пока не заполнен.').replace(/<[^>]*>/g, ' ');
    lore.append(loreTitle, richLore || loreText);
    const remaining = Array.from(grid.querySelectorAll(':scope > .stack > *')).filter(node => ![hero, ability, inventory, social, personality, form].includes(node));
    grid.classList.add('character-sheet-stack-v142');
    for (const node of [hero, ability, inventory, reputation, personality, lore, social, ...remaining, form].filter(Boolean)) grid.append(node);
    grid.querySelectorAll(':scope > .stack:empty').forEach(node => node.remove());
    if (inventory) {
      const slots = inventory.querySelector('.inventory-equipment-slots-v1067');
      if (slots) groupSlots(slots);
      compactInventory(inventory);
    }
  }
  root.GRPGProfileSheetV142 = Object.freeze({layoutWeb, layoutDesktop});
})(window);
