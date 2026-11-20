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

  const searchCache=new Map();
  function chooseEffects(variants, min, max, random) {
    const groups = [...new Set(variants.map(row=>row.group))].map(group=>variants.filter(row=>row.group===group));
    const signature=JSON.stringify([min,max,groups.map(rows=>rows.map(row=>row.cost))]);
    let memo=searchCache.get(signature);
    if(!memo){memo=new Map();if(searchCache.size>=32)searchCache.delete(searchCache.keys().next().value);searchCache.set(signature,memo);}
    function ways(index, left, budget) {
      if(left===0)return budget>=min&&budget<=max?1:0;
      if(groups.length-index<left)return 0;
      const key=[index,left,budget].join(':');
      if(memo.has(key))return memo.get(key);
      let total=ways(index+1,left,budget);
      for(const row of groups[index])total+=ways(index+1,left-1,budget+row.cost);
      memo.set(key,total);
      return total;
    }
    const counts=Array.from({length:6},(_,i)=>({count:i+1,ways:ways(0,i+1,0)})).filter(row=>row.ways>0);
    if(!counts.length)return null;
    // Choose a feasible count first so six-effect combinations do not dominate the pool.
    let left=counts[Math.min(counts.length-1,Math.floor(random()*counts.length))].count;
    let index=0,budget=0;const selected=[];
    while(left>0&&index<groups.length){
      const options=[{row:null,weight:ways(index+1,left,budget)},...groups[index].map(row=>({row,weight:ways(index+1,left-1,budget+row.cost)}))];
      let ticket=random()*options.reduce((sum,option)=>sum+option.weight,0);
      const choice=options.find(option=>(ticket-=option.weight)<0)||options.filter(option=>option.weight>0).at(-1);
      if(choice.row){selected.push(choice.row.id);budget+=choice.row.cost;left--;}
      index++;
    }
    return {budget,effects:selected};
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
