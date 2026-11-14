(function (root) {
  const labels = {weapon:'Оружие',shield:'Щиты',ammo:'Боеприпасы',ammunition:'Боеприпасы',grenade:'Гранаты',turret:'Турели',drone:'Дроны',armor:'Броня',implant:'Импланты',backpack:'Рюкзаки'};
  const order = ['Оружие','Щиты','Боеприпасы','Гранаты','Броня','Импланты','Рюкзаки','Дроны','Турели','Снаряжение'];
  function category(item = {}) {
    return labels[String(item?.type || '').trim().toLowerCase()] || 'Снаряжение';
  }
  function categories(offers, getItem) {
    const counts = new Map();
    for (const offer of offers) {
      const item = getItem(offer.itemId);
      if (!item) continue;
      const label = category(item);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return order.filter(label => counts.has(label)).map(label => ({label, count:counts.get(label)}));
  }
  const family = item => String(item?.ammoFamily || item?.caliber || item?.ammunitionFamily || '').trim().toLowerCase();
  function compatible(item, player, getItem) {
    if (category(item) !== 'Боеприпасы' || !player) return false;
    const slots = player.equipmentSlots || {};
    const ids = new Set([slots.primaryWeapon, slots.secondaryWeapon, slots.weapon,
      ...(player.inventory || []).filter(row => Number(row.qty) > 0).map(row => row.itemId)]);
    const ammoFamily = family(item);
    for (const id of ids) {
      if (!id) continue;
      const weapon = getItem(id);
      if (category(weapon) !== 'Оружие') continue;
      if (String(weapon.ammoTypeId || weapon.ammunitionId || '') === String(item.id) ||
          (ammoFamily && family(weapon) === ammoFamily)) return true;
    }
    return false;
  }
  let highlight = false;
  function compatibilityToggle() {
    return `<label class="market-equipment-toggle"><input type="checkbox" data-market-equipment-toggle ${highlight?'checked':''}> Для вашего снаряжения</label>`;
  }
  root.document?.addEventListener('change',event=>{
    if (!event.target.matches?.('[data-market-equipment-toggle]')) return;
    highlight=event.target.checked;
    root.document.querySelectorAll('[data-market-equipment-toggle]').forEach(input=>{
      input.checked=highlight;
      input.closest('[data-trade-offer-view], #market-items, #screen-market')?.classList.toggle('highlight-compatible-equipment',highlight);
    });
  });
  root.GRPGMarketCategoriesV144 = {category, categories, compatible, compatibilityToggle, get highlight(){return highlight;}};

})(typeof window === 'undefined' ? globalThis : window);
