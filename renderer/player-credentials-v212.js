(function(root) {
  'use strict';
  const secret = new Set(['pass', 'password', 'passwordHash', 'passwordConfirm', '__proto__', 'constructor', 'prototype']);
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const [key, child] of Object.entries(value)) if (!secret.has(key)) output[key] = clean(child);
    return output;
  }
  root.GRPGPlayerCredentialsV212 = {clean};
  if (typeof module !== 'undefined') module.exports = {clean};
})(typeof window === 'undefined' ? globalThis : window);
