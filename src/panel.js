(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(typeof globalThis === 'object' ? globalThis : this);
  else root.QianchuanPanel = factory(root);
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';
  const iconNames = { pause: 'pause', play: 'play', reset: 'rotate-ccw', csv: 'file-spreadsheet', json: 'file-json', collapse: 'chevron-down', expand: 'chevron-up' };
  const css = `:host{all:initial;position:fixed;z-index:2147483647;right:20px;top:20px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#15232d}*{box-sizing:border-box}.card{width:300px;background:#fff;border:1px solid #d9e2e7;border-radius:8px;box-shadow:0 10px 30px #15323c24;overflow:hidden}.head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #edf1f2;cursor:move}.mark{width:10px;height:10px;border-radius:50%;background:#27a58a}.title{font-weight:700;flex:1}.state{font-size:11px;color:#73818a}.body{padding:14px}.status{display:flex;justify-content:space-between;color:#64747c;margin-bottom:13px}.number{font-size:26px;font-weight:750;color:#153944;letter-spacing:0}.unit{font-size:12px;color:#6d7f87;font-weight:500}.comparison,.activity{display:flex;align-items:center;gap:6px;margin:2px 0 8px;color:#718087;font-size:11px}.comparison-value,.activity-value{font-weight:700}.comparison-value.increase{color:#159a76}.comparison-value.decrease{color:#c45b50}.comparison-value.flat{color:#718087}.activity-value{color:#4c6870}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.metric{padding:9px 10px;background:#f4f8f8;border-radius:6px}.metric label{display:block;color:#6d7b82;font-size:11px;margin-bottom:2px}.metric strong{font-size:16px}.controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.controls button,.controls select{border:1px solid #cfdbde;border-radius:5px;background:#fff;color:#20343b;padding:6px 8px;font:inherit;cursor:pointer}.controls button:hover{background:#f0f7f6}.controls button.icon{width:31px;padding:6px 0;display:grid;place-items:center}.controls img{width:14px;height:14px}.selects{display:flex;gap:6px;margin:12px 0 0}.selects select{flex:1}.hint{font-size:11px;color:#7b8a91;margin-top:10px;min-height:15px}.collapsed .body{display:none}.collapsed .head{border:0}.trend{height:28px;display:flex;align-items:end;gap:2px;margin:8px 0}.bar{flex:1;background:#79c6b6;border-radius:2px 2px 0 0;min-height:2px}`;
  function asset(name) { if (typeof root.QIANCHUAN_ASSET_BASE === 'string') return `${root.QIANCHUAN_ASSET_BASE}${name}.svg`; return (typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL(`assets/icons/${name}.svg`) : `assets/icons/${name}.svg`; }
  function renderComparison(node, comparison) {
    node.className = 'comparison-value';
    if (!comparison || !comparison.available) {
      node.textContent = '等待上一分钟';
      return;
    }
    if (comparison.changePercent === null) {
      node.textContent = comparison.direction === 'increase' ? '↑ 新增' : '持平';
      node.classList.add(comparison.direction === 'increase' ? 'increase' : 'flat');
      return;
    }
    if (Math.abs(comparison.changePercent) < 0.05) {
      node.textContent = '持平 0.0%';
      node.classList.add('flat');
      return;
    }
    const increase = comparison.changePercent > 0;
    node.textContent = `${increase ? '↑ 提升' : '↓ 降低'} ${Math.abs(comparison.changePercent).toFixed(1)}%`;
    node.classList.add(increase ? 'increase' : 'decrease');
  }
  class Panel {
    constructor({ onPause, onReset, onConfig, onExport, onCollapse, initialCollapsed = false } = {}) { this.callbacks = { onPause, onReset, onConfig, onExport, onCollapse }; this.history = []; this.root = null; this.render(initialCollapsed); }
    render(collapsed) {
      const host = document.createElement('div'); host.dataset.qianchuanFlowRoot = 'true';
      const shadow = host.attachShadow({ mode: 'closed' }); const style = document.createElement('style'); style.textContent = css; shadow.append(style);
      const card = document.createElement('section'); card.className = `card${collapsed ? ' collapsed' : ''}`; card.innerHTML = `<header class="head"><span class="mark"></span><span class="title">千川流速</span><span class="state">启动中</span><button class="icon collapse" title="折叠面板" aria-label="折叠面板"><img></button></header><div class="body"><div class="status"><span class="status-text">等待实时公屏</span><span class="session-time">本场 0 分钟</span></div><div class="number"><span class="rate">0</span> <span class="unit">人/分钟</span></div><div class="comparison"><span>较上一分钟</span><strong class="comparison-value">等待上一分钟</strong></div><div class="activity"><span>最近进入</span><strong class="activity-value">暂无进入</strong></div><div class="grid"><div class="metric"><label>窗口进入</label><strong class="events">0</strong></div><div class="metric"><label>去重观众</label><strong class="unique">0</strong></div></div><div class="trend" aria-label="最近趋势"></div><div class="controls"><button class="pause"><img> <span>暂停</span></button><button class="reset"><img> <span>重置本场</span></button><button class="icon csv" title="导出 CSV" aria-label="导出 CSV"><img></button><button class="icon json" title="导出 JSON" aria-label="导出 JSON"><img></button></div><div class="selects"><select class="window" aria-label="统计窗口"><option value="10">10 秒</option><option value="30">30 秒</option><option value="60" selected>1 分钟</option><option value="300">5 分钟</option></select><select class="unit-select" aria-label="显示单位"><option value="1">人/秒</option><option value="60" selected>人/分钟</option><option value="3600">人/小时</option></select></div><div class="hint"></div></div></section>`;
      shadow.append(card); document.documentElement.append(host); this.root = { host, card, shadow };
      card.querySelector('.collapse').addEventListener('click', () => { const next = !card.classList.contains('collapsed'); card.classList.toggle('collapsed', next); this.setIcon('.collapse', next ? 'expand' : 'collapse'); this.callbacks.onCollapse?.(next); });
      card.querySelector('.pause').addEventListener('click', () => this.callbacks.onPause?.()); card.querySelector('.reset').addEventListener('click', () => this.callbacks.onReset?.());
      card.querySelector('.window').addEventListener('change', (event) => this.callbacks.onConfig?.({ windowSeconds: Number(event.target.value) })); card.querySelector('.unit-select').addEventListener('change', (event) => this.callbacks.onConfig?.({ unitSeconds: Number(event.target.value) }));
      card.querySelector('.csv').addEventListener('click', () => this.callbacks.onExport?.('csv')); card.querySelector('.json').addEventListener('click', () => this.callbacks.onExport?.('json'));
      this.setIcon('.collapse', collapsed ? 'expand' : 'collapse'); this.setIcon('.pause', 'pause'); this.setIcon('.reset', 'reset'); this.setIcon('.csv', 'csv'); this.setIcon('.json', 'json');
      this.makeDraggable(card.querySelector('.head'), host);
    }
    setIcon(selector, key) { const image = this.root.shadow.querySelector(selector + ' img'); if (image) image.src = asset(iconNames[key] || key); }
    update({ status = '检测中', paused = false, stats = {}, rateComparison = null, activity = null, elapsedSeconds = 0, windowSeconds = 60, unitSeconds = 60, trend = [] } = {}) {
      const { card } = this.root; card.querySelector('.state').textContent = paused ? '已暂停' : status; card.querySelector('.status-text').textContent = status; card.querySelector('.rate').textContent = Number(stats.rate || 0).toFixed(1); card.querySelector('.unit').textContent = unitSeconds === 1 ? '人/秒' : unitSeconds === 3600 ? '人/小时' : '人/分钟'; renderComparison(card.querySelector('.comparison-value'), rateComparison); const activityNode = card.querySelector('.activity-value'); activityNode.textContent = activity?.hasEvents ? `${Math.max(0, Math.floor(activity.idleSeconds))} 秒前` : '暂无进入'; card.querySelector('.events').textContent = stats.events || 0; card.querySelector('.unique').textContent = stats.unique || 0; card.querySelector('.session-time').textContent = `本场 ${Math.floor((elapsedSeconds || 0) / 60)} 分钟`;
      const select = card.querySelector('.window'); if (Number(select.value) !== windowSeconds) select.value = String(windowSeconds); const unit = card.querySelector('.unit-select'); if (Number(unit.value) !== unitSeconds) unit.value = String(unitSeconds);
      const trendNode = card.querySelector('.trend'); trendNode.replaceChildren(); const max = Math.max(1, ...trend); for (const value of trend.slice(-18)) { const bar = document.createElement('span'); bar.className = 'bar'; bar.style.height = `${Math.max(2, value / max * 28)}px`; trendNode.append(bar); }
      const button = card.querySelector('.pause'); button.querySelector('span').textContent = paused ? '继续' : '暂停'; this.setIcon('.pause', paused ? 'play' : 'pause');
    }
    hint(message) { this.root.card.querySelector('.hint').textContent = message || ''; }
    makeDraggable(handle, host) { let origin = null; handle.addEventListener('pointerdown', (event) => { origin = { x: event.clientX, y: event.clientY, right: parseFloat(getComputedStyle(host).right), top: parseFloat(getComputedStyle(host).top) }; handle.setPointerCapture(event.pointerId); }); handle.addEventListener('pointermove', (event) => { if (!origin) return; host.style.right = `${Math.max(8, origin.right - (event.clientX - origin.x))}px`; host.style.top = `${Math.max(8, origin.top + (event.clientY - origin.y))}px`; }); handle.addEventListener('pointerup', () => { origin = null; }); }
    destroy() { this.root.host.remove(); }
  }
  return { Panel };
});
