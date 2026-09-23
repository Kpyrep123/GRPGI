/* Shared by desktop, web and PocketBase. No UI or transport dependencies. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GRPGPlayerSyncCoreV135 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  function canonical(value) {
    if(Array.isArray(value))return '['+value.map(v=>canonical(v) ?? 'null').join(',')+']';
    if(object(value))return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function equal(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v,i) => equal(v,b[i]));
    if (object(a) && object(b)) {
      const keys = Object.keys(a);
      return keys.length === Object.keys(b).length && keys.every(k => own(b,k) && equal(a[k],b[k]));
    }
    return false;
  }
  const reserved = k => ['__proto__','prototype','constructor','__syncReceiptsV135'].includes(k);
  function clean(value) {
    const result = {};
    Object.keys(value || {}).forEach(k => { if (!reserved(k) && value[k] !== undefined) result[k] = clone(value[k]); });
    return result;
  }
  function diff(before, after) {
    const patch = {};
    Object.keys(after || {}).forEach(k => {
      if (!reserved(k) && !equal(before?.[k],after[k])) patch[k] = clone(after[k]);
    });
    return patch;
  }
  function mergeValue(base, wanted, remote, path) {
    if (equal(base,wanted)) return clone(remote);
    if (equal(base,remote)) return clone(wanted);
    if (equal(wanted,remote)) return clone(remote);
    if (path === 'inventory' && [base,wanted,remote].every(Array.isArray)) {
      const index = rows => {
        const map = {};
        rows.forEach(row => {
          if (!row?.itemId || reserved(String(row.itemId)) || own(map,row.itemId)) throw new Error('inventory');
          map[row.itemId] = row;
        });
        return map;
      };
      const merged = mergeValue(index(base),index(wanted),index(remote),'inventory.items');
      return Object.values(merged);
    }
    if (object(base) && object(wanted) && object(remote)) {
      const result = {};
      const keys = Array.from(new Set([...Object.keys(base),...Object.keys(wanted),...Object.keys(remote)]));
      keys.forEach(k => {
        if (reserved(k)) return;
        const v = mergeValue(base[k],wanted[k],remote[k],path ? path+'.'+k : k);
        if (v !== undefined) result[k] = v;
      });
      return result;
    }
    throw new Error(path || 'player');
  }
  function mergePatch(base, patch, remote) {
    const result = clone(remote || {}), changes = diff(base,patch);
    // An upgrade and its payment form one indivisible operation.
    const progression = ['skillPoints','skills','abilityBase','abilities','specializations'];
    if (progression.some(k => own(changes,k)) &&
        progression.some(k => own(base,k) && !equal(base[k],remote?.[k]))) {
      throw new Error('progression');
    }
    Object.keys(changes).forEach(k => { result[k] = mergeValue(base?.[k],changes[k],remote?.[k],k); });
    return result;
  }
  function operationId() {
    return 'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)+'_'+Math.random().toString(36).slice(2);
  }
  function createQueue() {
    const tails = new Map();
    return {
      run(key, task) {
        const previous = tails.get(key) || Promise.resolve();
        const result = previous.catch(() => {}).then(task);
        const settled = result.catch(() => {});
        tails.set(key,settled);
        settled.then(() => { if (tails.get(key) === settled) tails.delete(key); });
        return result;
      },
      pending(key) { return tails.has(key); }
    };
  }
  return Object.freeze({clone,equal,clean,diff,mergePatch,operationId,createQueue,canonical});
});
