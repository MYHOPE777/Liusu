(function (root) {
  'use strict';
  if (!root.QianchuanCore || !root.QianchuanDOM || !root.QianchuanPanel || !root.QianchuanStore) return;
  const { SequenceDetector, FlowCounter, exportCsv, exportJson } = root.QianchuanCore;
  const { findPublicScreen, readRows, observeScreen } = root.QianchuanDOM;
  const { Panel } = root.QianchuanPanel;
  const roomId = new URL(location.href).searchParams.get('live_room_id') || location.pathname;
  const sessionStorageKey = `qianchuan-flow-session:${roomId}`;
  const state = { config: { windowSeconds: 60, unitSeconds: 60 }, session: null, context: null, counter: null, detector: new SequenceDetector(), screen: null, stopObserver: null, panel: null, manuallyPaused: false, hidden: document.hidden, trend: [], lastSample: Date.now(), sampleCount: 0 };
  function readSessionId() { try { return root.sessionStorage?.getItem(sessionStorageKey) || null; } catch (_) { return null; } }
  function writeSessionId(sessionId) { try { if (sessionId) root.sessionStorage?.setItem(sessionStorageKey, sessionId); } catch (_) {} }
  function clearSessionId() { try { root.sessionStorage?.removeItem(sessionStorageKey); } catch (_) {} }
  function download(text, filename, type) { const blob = new Blob([text], { type }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
  function pageIsPaused() { return state.manuallyPaused || document.hidden; }
  async function append(usernames) { if (!state.counter || !state.session || !usernames.length) return; const events = state.counter.add(usernames, Date.now()); if (!events.length) return; try { await root.QianchuanStore.appendEvents(state.session.id, events); } catch (error) { state.panel.hint(`本地保存失败：${error.message}`); } }
  function render(status) { if (!state.panel || !state.counter) return; const now = Date.now(); const stats = state.counter.stats(now, state.config.windowSeconds, state.config.unitSeconds); const rateComparison = state.counter.comparePreviousMinute(now, state.config.unitSeconds); const activity = state.counter.activity(now); state.panel.update({ status, paused: pageIsPaused(), stats, rateComparison, activity, elapsedSeconds: stats.elapsedSeconds, windowSeconds: state.config.windowSeconds, unitSeconds: state.config.unitSeconds, trend: state.trend }); }
  function sample() { if (!state.counter) return; const stats = state.counter.stats(Date.now(), state.config.windowSeconds, state.config.unitSeconds); state.trend.push(stats.events); if (state.trend.length > 30) state.trend.shift(); }
  async function exportSession(kind) { if (!state.session) return; try { const result = await root.QianchuanStore.readSession(state.session.id); if (!result) throw new Error('会话不存在'); const events = new Map((result.events || []).map((event) => [event.id, event])); for (const event of state.counter?.events || []) events.set(event.id, event); const allEvents = [...events.values()]; const session = { ...result.session, eventCount: allEvents.length }; const content = kind === 'csv' ? exportCsv(allEvents) : exportJson(session, allEvents); download(content, `qianchuan-flow-${new Date().toISOString().slice(0, 10)}.${kind}`, kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json'); } catch (error) { state.panel?.hint(`导出失败：${error.message}`); } }
  async function reset() { if (!state.counter || !state.context) return; if (state.session) await root.QianchuanStore.endSession(state.session.id); clearSessionId(); const now = Date.now(); state.counter.reset(now); if (state.manuallyPaused || document.hidden) state.counter.pause(now); state.detector = new SequenceDetector(); state.session = await root.QianchuanStore.createSession({ roomId, mode: 'live', pageUrl: location.href, startedAt: now, tabInstanceId: state.context.tabInstanceId }); writeSessionId(state.session.id); if (state.screen) state.detector.baseline(readRows(state.screen)); state.trend = []; render(state.screen ? '检测中' : '未找到实时公屏'); }
  async function togglePause() { if (!state.counter) return; const next = !state.manuallyPaused; state.manuallyPaused = next; if (next) state.counter.pause(Date.now()); else { state.counter.resume(Date.now()); if (state.screen) state.detector.baseline(readRows(state.screen)); } render(next ? '已暂停' : state.screen ? '检测中' : '未找到实时公屏'); }
  async function locate() {
    const found = findPublicScreen(document);
    if (found === state.screen) return;
    if (state.stopObserver) { state.stopObserver(); state.stopObserver = null; }
    state.screen = found; state.detector = new SequenceDetector();
    if (!found) { render('未找到实时公屏'); return; }
    const initialRows = readRows(found);
    state.detector.baseline(initialRows);
    state.stopObserver = observeScreen(found, (rows, info) => { if (info?.warming) { state.detector.baseline(rows); render('同步历史公屏'); return; } if (!pageIsPaused()) void append(state.detector.scan(rows, info)); else state.detector.baseline(rows); render('检测中'); }, { warmupMs: initialRows.length ? 0 : 1000 });
    render('检测中');
  }
  async function start() {
    let startupError = null;
    try { state.config = { ...state.config, ...(await root.QianchuanStore.getConfig()) }; } catch (error) { startupError = error; }
    state.panel = new Panel({ initialCollapsed: Boolean(state.config.panelCollapsed), onPause: () => void togglePause(), onReset: () => void reset(), onConfig: async (patch) => { state.config = { ...state.config, ...patch }; await root.QianchuanStore.setConfig(patch); render(state.screen ? '检测中' : '未找到实时公屏'); }, onExport: (kind) => void exportSession(kind), onCollapse: (collapsed) => void root.QianchuanStore.setConfig({ panelCollapsed: collapsed }) });
    try {
      state.context = await root.QianchuanStore.getContext({ roomId });
      const now = Date.now();
      const savedSessionId = readSessionId();
      let restored = null;
      if (savedSessionId) {
        try {
          const result = await root.QianchuanStore.readSession(savedSessionId);
          if (result?.session?.roomId === roomId && !result.session.endedAt) restored = result;
        } catch (_) {
          // A stale session reference must not prevent a new live session.
        }
        if (!restored) clearSessionId();
      }
      const session = restored?.session;
      state.counter = new FlowCounter({ startedAt: session?.startedAt ?? now, tabInstanceId: state.context.tabInstanceId, roomId });
      if (restored && typeof state.counter.load === 'function') state.counter.load(restored.events);
      if (restored) state.session = session;
      else {
        state.session = await root.QianchuanStore.createSession({ roomId, mode: 'live', pageUrl: location.href, tabInstanceId: state.context.tabInstanceId, startedAt: now });
        writeSessionId(state.session.id);
      }
    } catch (error) {
      const problem = startupError || error;
      state.panel.hint(`本地会话不可用：${problem.message}`);
      const now = Date.now();
      state.context = { tabInstanceId: `tab-${now}` };
      state.counter = new FlowCounter({ startedAt: now, tabInstanceId: state.context.tabInstanceId, roomId });
    }
    if (document.hidden) state.counter.pause(Date.now());
    document.addEventListener('visibilitychange', () => { if (document.hidden && !state.manuallyPaused) state.counter.pause(Date.now()); else if (!document.hidden && !state.manuallyPaused) { state.counter.resume(Date.now()); if (state.screen) state.detector.baseline(readRows(state.screen)); } render(document.hidden ? '页面未激活' : state.screen ? '检测中' : '未找到实时公屏'); });
    await locate(); setInterval(() => { void locate(); sample(); render(state.screen ? '检测中' : '未找到实时公屏'); }, 1000);
  }
  void start();
})(typeof globalThis === 'object' ? globalThis : this);
