(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    let core = null;
    try { core = require('./detector-core.js'); } catch (_) { core = null; }
    module.exports = factory(typeof globalThis === 'object' ? globalThis : root, core);
  } else {
    root.QianchuanDOM = factory(root, root.QianchuanCore || null);
  }
})(typeof globalThis === 'object' ? globalThis : this, function (root, core) {
  'use strict';

  const TITLE = '\u5b9e\u65f6\u516c\u5c4f';
  const nodeKeys = new WeakMap();
  let nextNodeKey = 1;

  function normalizeText(value) {
    return typeof value === 'string'
      ? value.replace(/[\u200b\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim()
      : '';
  }

  function nodeKey(node) {
    let key = nodeKeys.get(node);
    if (!key) {
      key = `dom-row-${nextNodeKey++}`;
      nodeKeys.set(node, key);
    }
    return key;
  }

  function isElement(node) { return Boolean(node && node.nodeType === 1); }

  function isHidden(node, stopAt) {
    const view = node && node.ownerDocument && node.ownerDocument.defaultView;
    let current = node;
    while (isElement(current)) {
      if (current.hidden || current.hasAttribute('hidden')) return true;
      if (normalizeText(current.getAttribute('aria-hidden')).toLowerCase() === 'true') return true;
      const style = current.getAttribute('style') || '';
      if (/(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/i.test(style)) return true;
      if (/(?:^|;)\s*visibility\s*:\s*(?:hidden|collapse)\s*(?:;|$)/i.test(style)) return true;
      if (view && typeof view.getComputedStyle === 'function') {
        try {
          const computed = view.getComputedStyle(current);
          if (computed && (computed.display === 'none' || computed.visibility === 'hidden' || computed.visibility === 'collapse')) return true;
        } catch (_) { /* detached or synthetic nodes have no computed style */ }
      }
      current = current.parentElement;
    }
    return false;
  }

  function hasExplicitRowMarker(element) {
    return element.matches('[data-live-message], [data-public-message], [data-screen-row], [data-live-row], [data-entry-row], [role="listitem"]');
  }
  function hasRowClass(element) {
    const value = `${element.id || ''} ${element.getAttribute('class') || ''}`;
    return /(?:^|[\s_-])(?:row|message|item|entry|comment|chat-line|visitor)(?:$|[\s_-])/i.test(value);
  }
  function isTitleElement(element) { return normalizeText(element.textContent).replace(/\s+/g, '') === TITLE; }
  function hasDescendantCandidate(element) { return Array.from(element.children || []).some((child) => hasExplicitRowMarker(child) || hasRowClass(child)); }
  function removeNestedCandidates(candidates) { return candidates.filter((candidate) => !candidates.some((other) => other !== candidate && other.contains(candidate))); }

  function directRowChildren(element) {
    return Array.from(element.children || []).filter((child) => {
      if (!isElement(child) || isHidden(child, element) || isTitleElement(child)) return false;
      const text = normalizeText(child.textContent);
      if (!text || /^(?:button|a|input|select|textarea|script|style)$/i.test(child.tagName)) return false;
      return true;
    });
  }

  function findRows(container) {
    if (!isElement(container)) return [];
    const explicit = Array.from(container.querySelectorAll('[data-live-message], [data-public-message], [data-screen-row], [data-live-row], [data-entry-row], [role="listitem"]'))
      .filter((element) => !isHidden(element, container) && normalizeText(element.textContent));
    if (explicit.length) return removeNestedCandidates(explicit);
    const logs = [container].concat(Array.from(container.querySelectorAll('[role="log"], [role="list"], ul, ol, [class*="message"], [class*="row"], [class*="list"], [class*="screen"]')));
    for (const list of logs) {
      if (!isElement(list) || isHidden(list, container)) continue;
      const children = directRowChildren(list).filter((child) => !hasDescendantCandidate(child) || hasRowClass(child));
      if (children.length) {
        const marked = children.filter(hasRowClass);
        if (marked.length) return removeNestedCandidates(marked);
        if (list !== container || list.getAttribute('role') === 'log' || list.getAttribute('role') === 'list') return children;
      }
    }
    const marked = Array.from(container.querySelectorAll('[class], [id]'))
      .filter((element) => !isHidden(element, container) && !isTitleElement(element) && hasRowClass(element) && normalizeText(element.textContent));
    if (marked.length) return removeNestedCandidates(marked);
    return directRowChildren(container);
  }
  function rowObjects(container) { return findRows(container).map((node) => ({ key: nodeKey(node), text: normalizeText(node.textContent) })); }

  function titleElements(document) {
    if (!document || typeof document.querySelectorAll !== 'function') return [];
    // Some live-room builds render the panel title as an unstyled div/span,
    // so exact text matching is intentionally independent of heading tags.
    return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], [data-title], [data-panel-title], [class*="title"], .title, div, span, p'))
      .filter((element) => !isHidden(element, document.body || null) && isTitleElement(element));
  }
  function markedContainer(element) { return element.closest && element.closest('[data-public-screen], [data-live-screen], [data-screen="public"], [data-screen-type="public"], [role="log"]'); }

  function findPublicScreen(document) {
    const titles = titleElements(document);
    let fallback = null;
    for (const title of titles) {
      const explicit = markedContainer(title);
      if (explicit && explicit !== document.body && explicit !== document.documentElement) return explicit;
      let current = title.parentElement;
      let depth = 0;
      while (current && current !== document.body && current !== document.documentElement && depth < 6) {
        // A page-level main element is too broad to use as a fallback screen.
        // Require a nearer panel/list marker instead.
        if (current.tagName === 'MAIN') break;
        if (!fallback) fallback = current;
        const rows = findRows(current).filter((row) => row !== title && !row.contains(title));
        const attributes = `${current.id || ''} ${current.getAttribute('class') || ''}`;
        const named = /(?:public|screen|live|chat|comment|message|panel)/i.test(attributes);
        if (rows.length || named || current.getAttribute('role') === 'log') return current;
        current = current.parentElement;
        depth += 1;
      }
    }
    return fallback;
  }

  function nearestRow(target, container) {
    let current = isElement(target) ? target : target && target.parentElement;
    while (isElement(current) && current !== container) {
      if (hasExplicitRowMarker(current) || hasRowClass(current) || current.getAttribute('role') === 'listitem') return current;
      current = current.parentElement;
    }
    if (current === container && hasExplicitRowMarker(current)) return current;
    return null;
  }
  function textChangedKeys(records, container, previousByKey, currentByKey) {
    const changed = new Set();
    const currentRows = findRows(container);
    const currentRowSet = new Set(currentRows);
    function rowFromTarget(target) {
      let current = isElement(target) ? target : target && target.parentElement;
      while (isElement(current) && current !== container) {
        if (currentRowSet.has(current)) return current;
        current = current.parentElement;
      }
      return null;
    }
    for (const record of records) {
      const row = rowFromTarget(record.target) || nearestRow(record.target, container);
      if (row) changed.add(row);
    }
    const keys = new Set();
    for (const row of changed) {
      const key = nodeKey(row);
      if (currentByKey.has(key) && previousByKey.get(key) !== currentByKey.get(key)) keys.add(key);
    }
    return keys;
  }
  function occurrenceCounts(rows) { const counts = new Map(); for (const row of rows) counts.set(row.text, (counts.get(row.text) || 0) + 1); return counts; }
  function freshKeysFor(records, previousRows, currentRows, container) {
    const previousKeys = new Set(previousRows.map((row) => row.key));
    const currentByKey = new Map(currentRows.map((row) => [row.key, row.text]));
    const previousByKey = new Map(previousRows.map((row) => [row.key, row.text]));
    const fresh = textChangedKeys(records, container, previousByKey, currentByKey);
    const retainedIndexes = currentRows.map((row, index) => previousKeys.has(row.key) ? index : -1).filter((index) => index >= 0);
    const lastRetained = retainedIndexes.length ? Math.max(...retainedIndexes) : -1;
    const allNew = retainedIndexes.length === 0;
    for (let index = 0; index < currentRows.length; index += 1) {
      const row = currentRows[index];
      if (previousKeys.has(row.key)) continue;
      if (allNew) continue;
      if (index > lastRetained) fresh.add(row.key);
    }
    if (allNew && currentRows.length > previousRows.length) {
      const oldCounts = occurrenceCounts(previousRows);
      const seen = new Map();
      for (const row of currentRows) {
        const count = (seen.get(row.text) || 0) + 1;
        seen.set(row.text, count);
        if (count > (oldCounts.get(row.text) || 0)) fresh.add(row.key);
      }
    }
    return fresh;
  }
  function observeScreen(container, onSnapshot, { warmupMs = 0 } = {}) {
    if (!isElement(container) || typeof onSnapshot !== 'function') return () => {};
    let previousRows = rowObjects(container);
    let warming = Number.isFinite(warmupMs) && warmupMs > 0;
    let warmupTimer = null;
    onSnapshot(previousRows, { freshKeys: new Set(), warming });
    const view = container.ownerDocument && container.ownerDocument.defaultView;
    const Observer = (view && view.MutationObserver) || root.MutationObserver;
    if (typeof Observer !== 'function') return () => {};
    const observer = new Observer((records) => {
      const currentRows = rowObjects(container);
      const freshKeys = freshKeysFor(records, previousRows, currentRows, container);
      previousRows = currentRows;
      onSnapshot(currentRows, { freshKeys: warming ? new Set() : freshKeys, warming });
    });
    observer.observe(container, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
    if (warming) {
      warmupTimer = setTimeout(() => {
        previousRows = rowObjects(container);
        warming = false;
        onSnapshot(previousRows, { freshKeys: new Set(), warming: false, initialBaseline: true });
      }, warmupMs);
    }
    const cleanup = () => {
      observer.disconnect();
      if (warmupTimer !== null) clearTimeout(warmupTimer);
    };
    cleanup.observer = observer;
    cleanup.disconnect = cleanup;
    return cleanup;
  }
  return { TITLE, normalizeText, clean: normalizeText, findPublicScreen, readRows: rowObjects, observeScreen, core };
});
