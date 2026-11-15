/* The loot chance is resolved by the caller before this rarity roll. */
(function (root) {
  'use strict';

  const rarities = [
    { id: 'common', min: 0, max: 0 },
    { id: 'uncommon', min: 1, max: 3 },
    { id: 'rare', min: 4, max: 5 },
    { id: 'epic', min: 6, max: 7 },
    { id: 'legendary', min: 8, max: 8 }
  ];

  const defaultChances = [
    [100, 0, 0, 0, 0],
    [90, 10, 0, 0, 0],
    [80, 20, 0, 0, 0],
    [70, 30, 0, 0, 0],
    [60, 32, 8, 0, 0],
    [48, 37, 15, 0, 0],
    [37, 38, 22, 3, 0],
    [25, 37, 30, 8, 0],
    [15, 30, 35, 16, 4]
  ];

  function maxBudget(danger) {
    return Math.min(9, Math.max(1, Math.trunc(Number(danger) || 1))) - 1;
  }

  function updateChance(row, index, value, danger) {
    const ceiling = maxBudget(danger);
    if (!rarities[index] || rarities[index].min > ceiling) throw Error('Редкость недоступна');
    const others = rarities.map((rarity, i) => i !== index && rarity.min <= ceiling ? i : -1).filter(i => i >= 0);
    const next = rarities.map(() => 0);
    next[index] = others.length ? Math.min(100, Math.max(0, Number(value) || 0)) : 100;
    const weights = others.map(i => Math.max(0, Number(row[i]) || 0));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    others.forEach((i, j) => {
      next[i] = (100 - next[index]) * (total ? weights[j] / total : 1 / others.length);
    });
    return next;
  }

  function chooseRarity(danger, chances, random) {
    const ceiling = maxBudget(danger);
    const row = chances?.[ceiling] || defaultChances[ceiling];
    const weights = rarities.map((rarity, i) => rarity.min <= ceiling ? Math.max(0, Number(row[i]) || 0) : 0);
    let ticket = random() * weights.reduce((sum, weight) => sum + weight, 0);
    return rarities.find((_rarity, i) => (ticket -= weights[i]) < 0) || rarities[0];
  }

  function chooseEffects(variants, min, max, random) {
    let count = 0, selected = null;
    const used = new Set(), combination = [];
    function visit(from, budget, negative) {
      if (combination.length && budget >= min && budget <= max) {
        count++;
        if (random() < 1 / count) selected = { budget, effects: combination.map(({ id }) => id) };
      }
      if (combination.length === 3) return;
      for (let i = from; i < variants.length; i++) {
        const effect = variants[i];
        if (used.has(effect.group) || (negative && effect.cost < 0)) continue;
        used.add(effect.group);
        combination.push(effect);
        visit(i + 1, budget + effect.cost, negative || effect.cost < 0);
        combination.pop();
        used.delete(effect.group);
      }
    }
    visit(0, 0, false);
    return selected;
  }

  function roll(danger, variants, { chances, random = Math.random } = {}) {
    const rarity = chooseRarity(danger, chances, random);
    if (rarity.id === 'common') return { rarity: 'common', budget: 0, effects: [] };
    const result = chooseEffects(variants, rarity.min, Math.min(maxBudget(danger), rarity.max), random);
    if (!result) return null;
    return { rarity: rarity.id, ...result };
  }

  const api = { defaultChances, maxBudget, updateChance, roll };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GRPGAberrationRoll = api;
})(typeof window === 'undefined' ? globalThis : window);
