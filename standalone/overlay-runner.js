(function () {
  'use strict';
  const livePage = /^https:\/\/compass\.jinritemai\.com\/screen\/anchor\/talent(?:[/?#]|$)/u.test(String(location.href));
  if (!livePage) {
    try { window.alert('请切换到已登录的千川主播大屏标签页，再点击“千川流速启动”。'); } catch (_) {}
    return;
  }
  const KEY = '__QIANCHUAN_STANDALONE__';
  if (window[KEY]?.destroy) {
    window[KEY].destroy();
    return;
  }

  const roomId = new URL(location.href).searchParams.get('live_room_id') || location.pathname;
  const storageKey = `qianchuan-flow-standalone:${roomId}`;
  const rowKeys = new WeakMap();
  let nextRowKey = 1;
  const state = { startedAt: Date.now(), events: [], paused: false, screen: null, previous: [], observer: null, timer: null };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && Array.isArray(saved.events)) {
      state.startedAt = Number(saved.startedAt) || state.startedAt;
      state.events = saved.events.filter((event) => event && typeof event.timestamp === 'number' && typeof event.username === 'string');
      state.paused = Boolean(saved.paused);
    }
  } catch (_) {}

  const style = document.createElement('style');
  style.textContent = `#qianchuan-standalone{position:fixed;z-index:2147483647;right:20px;top:20px;width:300px;background:#fff;color:#17323a;border:1px solid #cbd9dc;border-radius:8px;box-shadow:0 10px 30px #15323c33;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}#qianchuan-standalone *{box-sizing:border-box}#qianchuan-standalone header{padding:12px 14px;border-bottom:1px solid #edf1f2;font-weight:700;cursor:move;display:flex;gap:8px}#qianchuan-standalone header span{flex:1}#qianchuan-standalone main{padding:14px}.qcs-status{display:flex;justify-content:space-between;color:#687a80;margin-bottom:10px}.qcs-rate{font-size:27px;font-weight:750;color:#153944}.qcs-rate small{font-size:12px;color:#6d7f87;font-weight:500}.qcs-line{margin:6px 0;color:#687a80;font-size:11px}.qcs-value{font-weight:700}.qcs-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.qcs-cell{padding:9px 10px;background:#f3f8f8;border-radius:6px}.qcs-cell small{display:block;color:#6d7b82}.qcs-cell b{font-size:16px}.qcs-controls{display:flex;gap:6px}.qcs-controls button{border:1px solid #cfdbde;border-radius:5px;background:#fff;color:#20343b;padding:6px 9px;cursor:pointer}.qcs-controls button:hover{background:#f0f7f6}.qcs-hint{min-height:17px;color:#718087;font-size:11px;margin-top:9px}`;
  document.documentElement.append(style);
  const panel = document.createElement('section');
  panel.id = 'qianchuan-standalone';
  panel.innerHTML = '<header><span>千川流速 · 独立悬浮</span><button class="qcs-close" title="关闭">×</button></header><main><div class="qcs-status"><span class="qcs-status-text">启动中</span><span class="qcs-time">本场 0 分钟</span></div><div class="qcs-rate">0.0 <small>人/分钟</small></div><div class="qcs-line">较上一分钟：<b class="qcs-compare">等待上一分钟</b></div><div class="qcs-line">最近进入：<b class="qcs-idle">暂无进入</b></div><div class="qcs-grid"><div class="qcs-cell"><small>窗口进入</small><b class="qcs-events">0</b></div><div class="qcs-cell"><small>去重观众</small><b class="qcs-unique">0</b></div></div><div class="qcs-controls"><button class="qcs-pause">暂停</button><button class="qcs-reset">重置本场</button></div><div class="qcs-hint"></div></main></section>';
  document.documentElement.append(panel);

  function save() { try { localStorage.setItem(storageKey, JSON.stringify({ startedAt: state.startedAt, events: state.events, paused: state.paused })); } catch (_) {} }
  function text(node) { return (node?.textContent || '').replace(/[\u200b\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim(); }
  function rowKey(node) { let key = rowKeys.get(node); if (!key) { key = `row-${nextRowKey++}`; rowKeys.set(node, key); } return key; }
  function hidden(node) { if (!node || node === document.documentElement) return false; const style = getComputedStyle(node); return node.hidden || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || hidden(node.parentElement); }
  function isRow(node) { const value = `${node.id || ''} ${node.className || ''}`; return node.matches?.('[data-live-message],[data-public-message],[data-entry-row],[role="listitem"]') || /(?:^|[\s_-])(?:levelMessage|message|entry|comment|visitor|chat-line)(?:--|[\s_-]|$)/i.test(value); }
  function screenTitle(node) { return text(node).replace(/\s/g, '') === '实时公屏'; }
  function findScreen() {
    const titles = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],[class*="title"],div,span,p')].filter((node) => !hidden(node) && screenTitle(node));
    for (const title of titles) {
      let current = title;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        if (current.getAttribute('role') === 'log') return current;
        const value = `${current.id || ''} ${current.className || ''}`;
        if (/(commentsWrap|public|screen|live|chat|comment|panel)/i.test(value) && !/commentsManager/i.test(value)) return current;
        if ([...current.querySelectorAll('*')].some(isRow)) return current;
      }
    }
    return null;
  }
  function rows(container) {
    if (!container) return [];
    let found = [...container.querySelectorAll('[data-live-message],[data-public-message],[data-entry-row],[role="listitem"]')];
    if (!found.length) found = [...container.querySelectorAll('[class],[id]')].filter(isRow);
    const seen = new Set();
    return found.filter((node) => !hidden(node) && text(node) && ![...found].some((other) => other !== node && other.contains(node)) && !seen.has(node) && seen.add(node)).map((node) => ({ key: rowKey(node), text: text(node) }));
  }
  function username(value) { const match = value.match(/^(.+?)\s*来了[!！~～.。]?$/u); if (!match || /[:：]/u.test(match[1])) return null; return match[1].trim() || null; }
  function scan() {
    const screen = findScreen();
    if (screen !== state.screen) {
      state.observer?.disconnect();
      state.screen = screen;
      state.previous = rows(screen);
      if (screen) { state.observer = new MutationObserver(() => tick()); state.observer.observe(screen, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] }); }
    }
    const current = rows(state.screen);
    const previousKeys = new Set(state.previous.map((row) => row.key));
    const previousText = new Map(state.previous.map((row) => [row.key, row.text]));
    if (!state.paused) {
      const fresh = current.filter((row) => !previousKeys.has(row.key) || previousText.get(row.key) !== row.text);
      const now = Date.now();
      for (const row of fresh) { const name = username(row.text); if (name) state.events.push({ timestamp: now, username: name }); }
      if (fresh.length) save();
    }
    state.previous = current;
    render();
  }
  function render() {
    const now = Date.now(); const active = state.events.filter((event) => event.timestamp >= now - 60000 && event.timestamp <= now); const current = active.length; const old = state.events.filter((event) => event.timestamp >= now - 120000 && event.timestamp < now - 60000).length; const rate = current; const compare = old ? `${rate >= old ? '↑ 提升' : '↓ 降低'} ${Math.abs((rate - old) / old * 100).toFixed(1)}%` : '等待上一分钟';
    panel.querySelector('.qcs-status-text').textContent = state.paused ? '已暂停' : state.screen ? '检测中' : '未找到实时公屏'; panel.querySelector('.qcs-time').textContent = `本场 ${Math.floor((now - state.startedAt) / 60000)} 分钟`; panel.querySelector('.qcs-rate').firstChild.textContent = `${rate.toFixed(1)} `; panel.querySelector('.qcs-compare').textContent = compare; const last = state.events.at(-1); panel.querySelector('.qcs-idle').textContent = last ? `${Math.floor((now - last.timestamp) / 1000)} 秒前` : '暂无进入'; panel.querySelector('.qcs-events').textContent = current; panel.querySelector('.qcs-unique').textContent = new Set(active.map((event) => event.username)).size; panel.querySelector('.qcs-hint').textContent = state.screen ? '仅读取当前页面已渲染的公屏' : '请等待公屏出现，或确认当前是主播大屏页面'; panel.querySelector('.qcs-pause').textContent = state.paused ? '继续' : '暂停';
  }
  function reset() { state.startedAt = Date.now(); state.events = []; state.previous = rows(state.screen); save(); render(); }
  let drag = null; panel.querySelector('header').addEventListener('pointerdown', (event) => { drag = { x: event.clientX, y: event.clientY, right: parseFloat(getComputedStyle(panel).right), top: parseFloat(getComputedStyle(panel).top) }; panel.setPointerCapture(event.pointerId); }); panel.querySelector('header').addEventListener('pointermove', (event) => { if (!drag) return; panel.style.right = `${Math.max(8, drag.right - event.clientX + drag.x)}px`; panel.style.top = `${Math.max(8, drag.top + event.clientY - drag.y)}px`; }); panel.querySelector('header').addEventListener('pointerup', () => { drag = null; });
  panel.querySelector('.qcs-close').onclick = () => api.destroy(); panel.querySelector('.qcs-pause').onclick = () => { state.paused = !state.paused; save(); render(); }; panel.querySelector('.qcs-reset').onclick = reset;
  const api = { destroy() { state.observer?.disconnect(); clearInterval(state.timer); panel.remove(); style.remove(); delete window[KEY]; } }; window[KEY] = api; state.timer = setInterval(scan, 500); scan();
})();
