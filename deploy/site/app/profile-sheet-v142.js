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
    const reputationSection = host.querySelector(':scope > .web-reputation-v120');
    const reputation = reputationSection ? [reputationSection] : sectionForTitle(host, 'Репутация');
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
    decorateAbilities(host);
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
    hero.querySelectorAll('.info-card').forEach(card=>{if(['Последнее обновление','Локация'].includes(card.querySelector('.k')?.textContent.trim()))card.remove();});
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
    hero.querySelectorAll('.data-row').forEach(row=>{if(['Баланс','Класс брони','Защита','Движение','Обзор','Последнее обновление','Локация'].includes(row.querySelector('.data-label')?.textContent.trim()))row.remove();});
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
    const list = document.createElement('div');list.className = 'web-reputation-list-v120';
    const byId = new Map();
    const rows = user.social?.reputation?.length ? user.social.reputation : (user.social?.orgs || []);
    for (const row of rows) if (row?.orgId || row?.id) byId.set(String(row.orgId || row.id), row);
    const factions = typeof Data !== 'undefined' ? Object.values(Data.factions || {}) : [];
    for (const faction of factions) {
      if (typeof isEntityVisible === 'function' && !isEntityVisible(faction, user)) continue;
      const row = byId.get(String(faction.id)) || rows.find(row=>row?.name && row.name.toLowerCase()===String(faction.name || '').toLowerCase()) || {};
      const card = document.createElement('div');card.className = 'web-reputation-row-v120';
      const line=document.createElement('div');
      if (typeof renderThumb === 'function') line.innerHTML = renderThumb(faction, {size:'sm',type:'organization'});
      const copy=document.createElement('span'),name=document.createElement('b');name.textContent=faction.name || 'Организация';copy.append(name);
      if (row.label || row.status) {const status=document.createElement('small');status.textContent=row.label || row.status;copy.append(status);}
      const value=document.createElement('strong'),score=Math.max(-100,Math.min(100,Number(row.value ?? row.score ?? row.reputation ?? 0)));
      value.textContent=(score>0?'+':'')+score;line.append(copy,value);
      const bar=document.createElement('i'),fill=document.createElement('span'),position=(score+100)/2;
      bar.setAttribute('aria-hidden','true');fill.style.left=Math.min(50,position)+'%';fill.style.width=Math.abs(position-50)+'%';bar.append(fill);
      card.append(line,bar);list.append(card);
    }
    if (!list.childElementCount) list.textContent = 'Нет доступных организаций.';
    reputation.append(list);
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
    decorateAbilities(host);
    compactTools(host, grid);
    if (inventory) {
      const slots = inventory.querySelector('.inventory-equipment-slots-v1067');
      if (slots) groupSlots(slots);
      compactInventory(inventory);
    }
  }
  function decorateAbilities(host) {
    const names = {'сила':'strength','ловкость':'agility','выносливость':'endurance','интеллект':'intelligence','воля':'will','слава':'glory'};
    host.querySelectorAll('.abilities .ability,.sheet-abilities .stat').forEach(card=>{
      const label = (card.querySelector('.data-label,span')?.textContent || '').trim().toLowerCase();
      if (names[label]) {card.classList.add('sheet-ability-art');card.style.setProperty('--ability-art', `url("${assetBase}ability-${names[label]}.png")`);}
    });
  }
  function compactTools(host, grid) {
    const nodes = ['profile-edit-form','updater-profile-panel','devops-profile-panel-v64'].map(id=>host.querySelector('#'+id)).filter(Boolean);
    if (!nodes.length || host.querySelector('.sheet-tools')) return;
    const tools = document.createElement('section');tools.className='sheet-tools';tools.setAttribute('aria-label','Настройки профиля и приложения');
    for (const node of nodes) {
      const details=document.createElement('details'),summary=document.createElement('summary');
      details.dataset.sheetTool=node.id;summary.textContent=node.querySelector('.section-title')?.textContent || 'Настройки';
      details.append(summary,node);tools.append(details);
    }
    grid.append(tools);
  }
  // Keep unchanged grid nodes and decoded images through synchronous profile renders.
  function captureInventory(host) {
    if (!host) return null;
    const selector='.web-inventory-grid-v1067,.inventory-grid-v1067',grid=host.querySelector(selector);
    return grid ? {grid,selector,children:Array.from(grid.children)} : null;
  }
  function restoreInventory(host, previous) {
    if (!previous) return;
    const next=host?.querySelector(previous.selector);if(!next || next===previous.grid)return;
    const key=node=>node.dataset.itemId ? `item:${node.dataset.itemId}:${node.dataset.unitIndex}` : `cell:${node.style.gridColumn}:${node.style.gridRow}`;
    const old=new Map(previous.children.map(node=>[key(node),node]));
    for (const node of Array.from(next.children)) {
      const match=old.get(key(node));if(match && match.outerHTML===node.outerHTML)node.replaceWith(match);
    }
    for(const attr of Array.from(previous.grid.attributes))if(!next.hasAttribute(attr.name))previous.grid.removeAttribute(attr.name);
    for(const attr of Array.from(next.attributes))previous.grid.setAttribute(attr.name,attr.value);
    previous.grid.replaceChildren(...next.childNodes);next.replaceWith(previous.grid);
  }
  root.GRPGProfileSheetV142 = Object.freeze({layoutWeb, layoutDesktop, captureInventory, restoreInventory});
})(window);
