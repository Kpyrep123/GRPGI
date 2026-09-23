/* GRPGI v1.0.132 — pure codec for section-scoped World Config JSON files */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GRPGWorldJsonCodecV132 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const MAX_ENTITIES = 50000;
  const MAX_DEPTH = 80;
  const MAX_NODES = 1000000;
  const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function sectionMeta(type, sections) {
    const key = String(type || '').trim();
    const meta = sections?.[key];
    if (!key || !meta || meta.special || (!meta.mapKey && !meta.arrayKey)) {
      throw new Error(`Раздел «${key || 'не выбран'}» не поддерживает JSON-обмен`);
    }
    return { key, meta };
  }

  function sanitizeJson(value, state = { nodes: 0 }, depth = 0) {
    state.nodes += 1;
    if (state.nodes > MAX_NODES) throw new Error('JSON содержит слишком много значений');
    if (depth > MAX_DEPTH) throw new Error('JSON имеет слишком большую глубину вложенности');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('JSON содержит недопустимое число');
      return value;
    }
    if (Array.isArray(value)) return value.map(item => sanitizeJson(item, state, depth + 1));
    if (!isRecord(value)) throw new Error('JSON содержит неподдерживаемое значение');
    const clean = {};
    for (const [key, item] of Object.entries(value)) {
      if (BLOCKED_KEYS.has(key)) throw new Error(`Недопустимый ключ JSON: ${key}`);
      clean[key] = sanitizeJson(item, state, depth + 1);
    }
    return clean;
  }

  function knownWrapperKeys(sections) {
    const keys = new Set(['entities']);
    for (const meta of Object.values(sections || {})) {
      if (meta?.mapKey) keys.add(meta.mapKey);
      if (meta?.listKey) keys.add(meta.listKey);
      if (meta?.arrayKey) keys.add(meta.arrayKey);
    }
    return keys;
  }

  function validateId(value) {
    const id = String(value || '').trim();
    if (!id) throw new Error('У каждой сущности должен быть непустой id');
    if (id.length > 240) throw new Error(`Слишком длинный id: ${id.slice(0, 40)}…`);
    if (BLOCKED_KEYS.has(id) || /[\u0000-\u001f\u007f]/.test(id)) throw new Error(`Недопустимый id: ${id}`);
    return id;
  }

  function rowsFromCandidate(candidate, mapMode) {
    if (Array.isArray(candidate)) return candidate.map(value => ({ value, fallbackId: '' }));
    if (mapMode && isRecord(candidate)) {
      return Object.entries(candidate).map(([fallbackId, value]) => ({ value, fallbackId }));
    }
    throw new Error('Раздел должен содержать массив или объект сущностей');
  }

  function sectionEntries(type, sections, rawPayload) {
    const { meta } = sectionMeta(type, sections);
    const raw = sanitizeJson(rawPayload);
    if (!Array.isArray(raw) && !isRecord(raw)) throw new Error("JSON должен содержать объект или массив сущностей");
    let candidate;
    let mapMode = false;

    if (Array.isArray(raw)) {
      candidate = raw;
    } else if (meta.arrayKey && Object.prototype.hasOwnProperty.call(raw, meta.arrayKey)) {
      if (!Array.isArray(raw[meta.arrayKey])) throw new Error(`Поле ${meta.arrayKey} должно быть массивом`);
      candidate = raw[meta.arrayKey];
    } else if (meta.mapKey && Object.prototype.hasOwnProperty.call(raw, meta.mapKey)) {
      if (!isRecord(raw[meta.mapKey])) throw new Error(`Поле ${meta.mapKey} должно быть объектом`);
      candidate = raw[meta.mapKey];
      mapMode = true;
    } else if (meta.listKey && Object.prototype.hasOwnProperty.call(raw, meta.listKey)) {
      if (!Array.isArray(raw[meta.listKey])) throw new Error(`Поле ${meta.listKey} должно быть массивом`);
      candidate = raw[meta.listKey];
    } else if (Object.prototype.hasOwnProperty.call(raw, 'entities')) {
      candidate = raw.entities;
      mapMode = isRecord(candidate);
    } else if (raw.id != null) {
      candidate = [raw];
    } else {
      const wrappers = knownWrapperKeys(sections);
      const foreign = Object.keys(raw).find(key => wrappers.has(key));
      if (foreign) throw new Error(`Файл содержит другой раздел World Config: ${foreign}`);
      candidate = raw;
      mapMode = true;
    }

    const rows = rowsFromCandidate(candidate, mapMode);
    if (rows.length > MAX_ENTITIES) throw new Error(`В одном разделе допускается не более ${MAX_ENTITIES} сущностей`);
    const ids = new Set();
    return rows.map(({ value, fallbackId }, index) => {
      if (!isRecord(value)) throw new Error(`Сущность №${index + 1} должна быть объектом`);
      const fallback = fallbackId ? validateId(fallbackId) : '';
      const id = validateId(value.id || fallback);
      if (fallback && value.id != null && String(value.id).trim() !== fallback) {
        throw new Error(`ID «${value.id}» не совпадает с ключом «${fallback}»`);
      }
      if (ids.has(id)) throw new Error(`Повторяющийся id: ${id}`);
      ids.add(id);
      return { ...value, id };
    });
  }

  function canonicalExportPayload(type, sections, sectionPayload) {
    const { meta } = sectionMeta(type, sections);
    const entries = sectionEntries(type, sections, sectionPayload || {});
    if (meta.arrayKey) return { [meta.arrayKey]: entries };
    const map = {};
    for (const entity of entries) map[entity.id] = entity;
    return { [meta.mapKey]: map };
  }

  function summarize(type, sections, currentPayload, importedEntries) {
    const current = sectionEntries(type, sections, currentPayload || {});
    const before = new Map(current.map(entity => [entity.id, entity]));
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const entity of importedEntries) {
      const previous = before.get(entity.id);
      if (!previous) added += 1;
      else if (JSON.stringify(previous) === JSON.stringify(entity)) unchanged += 1;
      else updated += 1;
    }
    const incoming = new Set(importedEntries.map(entity => entity.id));
    return {
      total: importedEntries.length,
      added,
      updated,
      unchanged,
      missing: current.filter(entity => !incoming.has(entity.id)).length,
      current: current.length
    };
  }

  return Object.freeze({
    VERSION: '1.0.132',
    MAX_ENTITIES,
    canonicalExportPayload,
    sanitizeJson,
    sectionEntries,
    summarize
  });
});
