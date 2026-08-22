(function initGrpgiRichTextScope(root) {
  'use strict';

  let scopeSequence = 0;
  const GROUPING_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'document', 'scope']);
  const INTERACTIVE_PROTOCOL = 'grpgi-rich-v1083';
  const interactivePayloads = new Map();

  function escapeAttribute(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function interactiveToken() {
    scopeSequence += 1;
    const random = root?.crypto?.getRandomValues
      ? Array.from(root.crypto.getRandomValues(new Uint32Array(2)), value => value.toString(36)).join('-')
      : Math.random().toString(36).slice(2);
    return `v1083-${Date.now().toString(36)}-${scopeSequence.toString(36)}-${random}`;
  }

  function rememberInteractivePayload(token, html) {
    interactivePayloads.set(token, String(html || ''));
    while (interactivePayloads.size > 64) {
      const oldest = interactivePayloads.keys().next().value;
      interactivePayloads.delete(oldest);
    }
  }

  function sandboxFrameForSource(source) {
    if (typeof document === 'undefined' || !source) return null;
    return Array.from(document.querySelectorAll('iframe[data-grpgi-rich-frame-v1083]'))
      .find(frame => frame.contentWindow === source) || null;
  }

  function handleSandboxMessage(event) {
    const message = event?.data;
    if (!message || typeof message !== 'object' || !String(message.type || '').startsWith(INTERACTIVE_PROTOCOL)) return;
    const frame = sandboxFrameForSource(event.source);
    if (!frame) return;
    const token = String(frame.getAttribute('data-grpgi-rich-frame-v1083') || '');
    if (!token) return;

    if (message.type === `${INTERACTIVE_PROTOCOL}:ready`) {
      const html = interactivePayloads.get(token);
      if (html == null) return;
      frame.contentWindow?.postMessage({ type: `${INTERACTIVE_PROTOCOL}:init`, token, html }, '*');
      return;
    }
    if (String(message.token || '') !== token) return;

    if (message.type === `${INTERACTIVE_PROTOCOL}:resize`) {
      const requested = Number(message.height || 0);
      if (!Number.isFinite(requested) || requested <= 0) return;
      const height = Math.min(30000, Math.max(160, Math.ceil(requested)));
      frame.style.height = `${height}px`;
      return;
    }
    if (message.type === `${INTERACTIVE_PROTOCOL}:article-link`) {
      const articleId = String(message.articleId || '').trim();
      if (!articleId || typeof document === 'undefined') return;
      document.dispatchEvent(new CustomEvent('grpgi:article-link-v1083', { detail: { articleId } }));
      return;
    }
    if (message.type === `${INTERACTIVE_PROTOCOL}:error`) {
      frame.setAttribute('data-grpgi-rich-runtime-error', 'true');
      if (root?.console?.warn) root.console.warn('Interactive article script failed:', String(message.message || 'Unknown error'));
    }
  }

  if (root?.addEventListener) root.addEventListener('message', handleSandboxMessage);

  function splitSelectorList(selectorText) {
    const source = String(selectorText || '');
    const result = [];
    let start = 0;
    let roundDepth = 0;
    let squareDepth = 0;
    let quote = '';
    let escaped = false;
    let comment = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];
      if (comment) {
        if (char === '*' && next === '/') { comment = false; index += 1; }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '/' && next === '*') { comment = true; index += 1; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '(') roundDepth += 1;
      else if (char === ')') roundDepth = Math.max(0, roundDepth - 1);
      else if (char === '[') squareDepth += 1;
      else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
      else if (char === ',' && roundDepth === 0 && squareDepth === 0) {
        result.push(source.slice(start, index));
        start = index + 1;
      }
    }
    result.push(source.slice(start));
    return result;
  }

  function splitLeadingTrivia(value) {
    const source = String(value || '');
    let index = 0;
    while (index < source.length) {
      if (/\s/.test(source[index])) { index += 1; continue; }
      if (source[index] === '/' && source[index + 1] === '*') {
        const end = source.indexOf('*/', index + 2);
        if (end < 0) return { leading: source, core: '' };
        index = end + 2;
        continue;
      }
      break;
    }
    return { leading: source.slice(0, index), core: source.slice(index) };
  }

  function nextRuleBoundary(source, start) {
    let roundDepth = 0;
    let squareDepth = 0;
    let quote = '';
    let escaped = false;
    let comment = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];
      if (comment) {
        if (char === '*' && next === '/') { comment = false; index += 1; }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '/' && next === '*') { comment = true; index += 1; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '(') roundDepth += 1;
      else if (char === ')') roundDepth = Math.max(0, roundDepth - 1);
      else if (char === '[') squareDepth += 1;
      else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
      else if (roundDepth === 0 && squareDepth === 0 && (char === '{' || char === ';' || char === '}')) return index;
    }
    return -1;
  }

  function matchingBrace(source, openingIndex) {
    let depth = 1;
    let quote = '';
    let escaped = false;
    let comment = false;
    for (let index = openingIndex + 1; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];
      if (comment) {
        if (char === '*' && next === '/') { comment = false; index += 1; }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '/' && next === '*') { comment = true; index += 1; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    return -1;
  }

  function prefixSelector(selector, scopeRoot) {
    let value = String(selector || '').trim();
    if (!value) return '';
    const rootOnly = /^(?::root|html|body)$/i;
    if (rootOnly.test(value)) return scopeRoot;
    const rooted = value.match(/^(?::root|html|body)(?=\s|>|\+|~)/i);
    if (rooted) {
      value = value.slice(rooted[0].length).trim();
      return value ? `${scopeRoot} ${value}` : scopeRoot;
    }
    return `${scopeRoot} ${value}`;
  }

  function scopeCssRules(cssText, scopeRoot) {
    const source = String(cssText || '');
    let output = '';
    let cursor = 0;
    while (cursor < source.length) {
      const boundary = nextRuleBoundary(source, cursor);
      if (boundary < 0) {
        output += source.slice(cursor);
        break;
      }
      const marker = source[boundary];
      const prelude = source.slice(cursor, boundary);
      if (marker === ';') {
        const { leading, core } = splitLeadingTrivia(prelude);
        if (!/^@import\b/i.test(core.trim())) output += `${leading}${core};`;
        cursor = boundary + 1;
        continue;
      }
      if (marker === '}') {
        output += prelude;
        cursor = boundary + 1;
        continue;
      }
      const closing = matchingBrace(source, boundary);
      if (closing < 0) break;
      const body = source.slice(boundary + 1, closing);
      const { leading, core } = splitLeadingTrivia(prelude);
      const trimmed = core.trim();
      if (!trimmed) {
        output += `${leading}{${body}}`;
      } else if (trimmed.startsWith('@')) {
        const name = trimmed.match(/^@([\w-]+)/)?.[1]?.toLowerCase() || '';
        if (GROUPING_AT_RULES.has(name)) output += `${leading}${core}{${scopeCssRules(body, scopeRoot)}}`;
        else output += `${leading}${core}{${body}}`;
      } else {
        const scoped = splitSelectorList(core)
          .map(selector => prefixSelector(selector, scopeRoot))
          .filter(Boolean)
          .join(', ');
        if (scoped) output += `${leading}${scoped}{${body}}`;
      }
      cursor = closing + 1;
    }
    return output;
  }

  function isolateHtml(html, wrapperClass = '', options = {}) {
    if (typeof document === 'undefined') return String(html || '');
    const sourceHtml = String(html || '');
    const settings = options && typeof options === 'object' ? options : {};
    const template = document.createElement('template');
    template.innerHTML = sourceHtml;
    const hasScript = Boolean(template.content.querySelector('script'));
    if (settings.interactive === true && hasScript) {
      const token = interactiveToken();
      rememberInteractivePayload(token, sourceHtml);
      const classes = ['grpgi-rich-scope-v1081', 'grpgi-rich-interactive-v1083', String(wrapperClass || '').trim()].filter(Boolean).join(' ');
      return `<div class="${escapeAttribute(classes)}" data-grpgi-rich-scope="${escapeAttribute(token)}"><iframe class="grpgi-rich-interactive-frame-v1083" data-grpgi-rich-frame-v1083="${escapeAttribute(token)}" src="./article-sandbox.html?v=1.0.83" sandbox="allow-scripts" scrolling="no" loading="eager" referrerpolicy="no-referrer" title="Интерактивная статья"></iframe></div>`;
    }

    scopeSequence += 1;
    const token = `v1081-${scopeSequence}`;
    const scopeSelectorText = `[data-grpgi-rich-scope="${token}"]`;
    template.content.querySelectorAll('script').forEach(script => script.remove());
    template.content.querySelectorAll('style').forEach(style => {
      style.textContent = scopeCssRules(style.textContent || '', scopeSelectorText);
      style.setAttribute('data-grpgi-scoped-style', 'v1081');
    });
    template.content.querySelectorAll('link[rel~="stylesheet"], link[as="style"]').forEach(link => link.remove());
    const classes = ['grpgi-rich-scope-v1081', String(wrapperClass || '').trim()].filter(Boolean).join(' ');
    return `<div class="${classes}" data-grpgi-rich-scope="${token}">${template.innerHTML}</div>`;
  }

  const api = Object.freeze({ isolateHtml, scopeCssText: scopeCssRules, splitSelectorList, interactiveProtocol: INTERACTIVE_PROTOCOL });
  if (root) root.GRPGRichTextScope = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null);
