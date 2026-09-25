(function (root) {
  const labels = {weapon:'Оружие',ammo:'Боеприпасы',ammunition:'Боеприпасы',grenade:'Гранаты',turret:'Турели',drone:'Дроны',armor:'Броня',implant:'Импланты',backpack:'Рюкзаки'};
  const order = ['Оружие','Боеприпасы','Гранаты','Броня','Импланты','Рюкзаки','Дроны','Турели','Снаряжение'];
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
  root.GRPGMarketCategoriesV144 = {category, categories};
})(typeof window === 'undefined' ? globalThis : window);
