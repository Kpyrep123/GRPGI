(function (root) {
  "use strict";
  const clone = (v) => JSON.parse(JSON.stringify(v)),
    values = (v) =>
      v instanceof Map ? [...v.values()] : Object.values(v || {});
  const get = (record, id) =>
    record instanceof Map ? record.get(id) : record?.[id];
  function source(world, section, key) {
    return world?.[section]?.[key] || {};
  }
  function origins(world) {
    return [
      ["socialOrigins", "SOCIAL_ORIGINS", "socialOriginId"],
      ["geographicOrigins", "GEOGRAPHIC_ORIGINS", "geographicOriginId"],
    ].flatMap(([section, key, field]) =>
      values(source(world, section, key)).map((origin) => ({
        section,
        field,
        origin,
      })),
    );
  }
  function inlineId(section, origin, skill) {
    const enc = (v) =>
      [...new TextEncoder().encode(String(v))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `grant178_${enc(section)}_${enc(origin)}_${enc(skill)}`;
  }
  function definitions(world) {
    return origins(world).flatMap(({ section, origin }) =>
      (origin.grantedSkills || []).map((s) => ({
        ...clone(s),
        id: inlineId(section, origin.id, s.id),
        skillType: "skill",
        type: "skill",
        originOnly178: true,
        originSource178: { section, id: origin.id, name: origin.name },
        cost: 0,
        isBasic: false,
        requiredSkillIds: [],
        requiredAbilities: [],
        treeBranch: s.treeBranch || "common",
      })),
    );
  }
  // Profile normalization may grant skills, but never registration-only items.
  function apply(raw = {}, world = {}, options = {}) {
    const p = clone(raw),
      ids = new Set(p.skills || []),
      ledger = new Set(p.characterGrants178?.items || []),
      items = source(world, "equipment", "EQUIPMENT");
    for (const s of values(source(world, "skills", "SKILLS")))
      if (s.isBasic === true) ids.add(String(s.id));
    for (const { section, field, origin } of origins(world)) {
      if (String(p[field] || "") !== String(origin.id)) continue;
      for (const id of origin.grantedSkillIds || [])
        if (get(source(world, "skills", "SKILLS"), id)) ids.add(String(id));
      for (const s of origin.grantedSkills || [])
        ids.add(inlineId(section, origin.id, s.id));
      if (options.startingItems !== true) continue;
      for (const entry of origin.startingItems || []) {
        const id = String(entry.itemId || ""),
          qty = Math.max(1, Math.min(999, Math.trunc(Number(entry.qty) || 1))),
          token = section + ":" + origin.id + ":" + id;
        if (!get(items, id) || ledger.has(token)) continue;
        p.inventory ||= [];
        const existing = p.inventory.find((e) => String(e.itemId) === id);
        if (existing)
          existing.qty = Math.max(0, Number(existing.qty) || 0) + qty;
        else p.inventory.push({ itemId: id, qty, positions: [] });
        ledger.add(token);
      }
    }
    p.skills = [...ids];
    p.characterGrants178 = {
      ...(p.characterGrants178 || {}),
      items: [...ledger],
    };
    return p;
  }
  // Only the registration draft initializer opts into starting equipment.
  function startingLoadout(raw = {}, world = {}) {
    return apply(raw, world, { startingItems: true });
  }
  function ownedDefinitions(player, world) {
    const ids = new Set(apply(player, world).skills);
    return definitions(world).filter((s) => ids.has(s.id));
  }
  const api = { apply, startingLoadout, origins, definitions, ownedDefinitions, inlineId };
  root.GRPGCharacterGrantsV178 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
