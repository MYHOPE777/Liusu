const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const domDetector = require('../src/dom-detector.js');

function page(body) { return new JSDOM(`<!doctype html><body>${body}</body>`); }

test('locates the exact visible public-screen title within a bounded panel', () => {
  const dom = page('<main><section id="other"><h2>实时公屏预览</h2><div>wrong</div></section><section id="screen" data-public-screen><h2> 实时\u200b 公屏 </h2><div role="log"></div></section></main>');
  assert.equal(domDetector.findPublicScreen(dom.window.document).id, 'screen');
  const noTitle = page('<h2>直播聊天</h2><div>实时公屏</div>');
  assert.equal(domDetector.findPublicScreen(noTitle.window.document), null);
  const generic = page('<section class="public-panel"><div>实时公屏</div><div role="log"><div>未标记的消息</div></div></section>');
  assert.equal(domDetector.findPublicScreen(generic.window.document).className, 'public-panel');
  const pageLevel = page('<main><div>实时公屏</div><div>页面其它内容</div></main>');
  assert.notEqual(domDetector.findPublicScreen(pageLevel.window.document)?.tagName, 'MAIN');
});

test('reads visible rows in DOM order and keeps node keys stable', () => {
  const dom = page('<section data-public-screen><h2>实时公屏</h2><div role="log"><div data-live-message>Alice来了</div><div data-live-message style="display:none">Hidden来了</div><div data-live-message aria-hidden="true">Gone来了</div><div data-live-message>Bob来了</div></div></section>');
  const screen = domDetector.findPublicScreen(dom.window.document);
  const first = domDetector.readRows(screen);
  assert.deepEqual(first.map((row) => row.text), ['Alice来了', 'Bob来了']);
  assert.equal(domDetector.readRows(screen)[0].key, first[0].key);
});

test('detects the rendered anchor-screen message nodes inside CSS module wrappers', async () => {
  const dom = page('<section class="commentsWrap--ljY6Z"><div class="title--OziRk" id="commentsManager"><span>实时公屏</span><button>公屏管理</button></div><div class="chatMessages--X32PK"><div class="messgesAreas--ABrPg"><div class="normalAreas--leCzh"><div class="levelMessage--a2gWz"><span class="nickname--Z10ja">XXX</span><span class="content--ryzTq">来了</span></div></div></div></div></section>');
  const screen = domDetector.findPublicScreen(dom.window.document);
  assert.equal(screen.className, 'commentsWrap--ljY6Z');
  assert.deepEqual(domDetector.readRows(screen).map((row) => row.text), ['XXX来了']);
  assert.equal(domDetector.readRows(screen).length, 1);

  const snapshots = [];
  const cleanup = domDetector.observeScreen(screen, (rows, evidence) => snapshots.push({ rows, evidence }));
  const messageArea = screen.querySelector('.normalAreas--leCzh');
  const appended = dom.window.document.createElement('div');
  appended.className = 'levelMessage--a2gWz';
  appended.innerHTML = '<span class="nickname--Z10ja">YYY</span><span class="content--ryzTq">来了</span>';
  messageArea.appendChild(appended);
  await new Promise((resolve) => dom.window.queueMicrotask(resolve));
  const added = snapshots.at(-1);
  assert.deepEqual(added.rows.map((row) => row.text), ['XXX来了', 'YYY来了']);
  assert.equal(added.evidence.freshKeys.has(added.rows[1].key), true);

  const firstMessage = messageArea.children[0];
  firstMessage.querySelector('.nickname--Z10ja').textContent = 'ZZZ';
  await new Promise((resolve) => dom.window.queueMicrotask(resolve));
  const changed = snapshots.at(-1);
  assert.equal(changed.evidence.freshKeys.has(changed.rows[0].key), true);
  cleanup();
});

test('observes appended and changed rows while suppressing same-content redraw', async () => {
  const dom = page('<section data-public-screen><h2>实时公屏</h2><div role="log" id="log"><div data-live-message>Alice来了</div><div data-live-message>Bob来了</div></div></section>');
  const screen = dom.window.document.querySelector('[data-public-screen]');
  const log = dom.window.document.querySelector('#log');
  const snapshots = [];
  const cleanup = domDetector.observeScreen(screen, (rows, evidence) => snapshots.push({ rows, evidence }));
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].evidence.freshKeys.size, 0);
  const appended = dom.window.document.createElement('div'); appended.dataset.liveMessage = ''; appended.textContent = 'Alice来了'; log.appendChild(appended);
  await new Promise((resolve) => dom.window.queueMicrotask(resolve));
  assert.equal(snapshots.at(-1).evidence.freshKeys.has(snapshots.at(-1).rows[2].key), true);
  log.replaceChildren(...Array.from(log.children).map((old) => old.cloneNode(true)));
  await new Promise((resolve) => dom.window.queueMicrotask(resolve));
  assert.equal(snapshots.at(-1).evidence.freshKeys.size, 0);
  cleanup();
  const afterCleanup = dom.window.document.createElement('div'); afterCleanup.dataset.liveMessage = ''; afterCleanup.textContent = 'Cara来了'; log.appendChild(afterCleanup);
  await new Promise((resolve) => dom.window.queueMicrotask(resolve));
  assert.equal(snapshots.at(-1).rows.some((row) => row.text === 'Cara来了'), false);
});

test('marks a recycled row whose text changes as fresh and removes hidden rows', async () => {
  const dom = page('<section data-public-screen><h2>实时公屏</h2><div role="log" id="log"><div data-live-message>Alice来了</div><div data-live-message>Bob来了</div></div></section>');
  const screen = dom.window.document.querySelector('[data-public-screen]');
  const log = dom.window.document.querySelector('#log');
  const snapshots = [];
  domDetector.observeScreen(screen, (rows, evidence) => snapshots.push({ rows, evidence }));
  const recycled = log.children[1]; recycled.textContent = 'Cara来了';
  await new Promise((resolve) => dom.window.queueMicrotask(resolve));
  const current = snapshots.at(-1);
  assert.equal(current.evidence.freshKeys.has(current.rows[1].key), true);
  recycled.setAttribute('hidden', '');
  await new Promise((resolve) => dom.window.queueMicrotask(resolve));
  assert.deepEqual(snapshots.at(-1).rows.map((row) => row.text), ['Alice来了']);
});

test('can treat asynchronously hydrated rows as an initial baseline during warmup', async () => {
  const dom = page('<section data-public-screen><h2>实时公屏</h2><div role="log" id="log"></div></section>');
  const screen = dom.window.document.querySelector('[data-public-screen]');
  const log = dom.window.document.querySelector('#log');
  const snapshots = [];
  const cleanup = domDetector.observeScreen(screen, (rows, evidence) => snapshots.push({ rows, evidence }), { warmupMs: 5 });
  const old = dom.window.document.createElement('div'); old.dataset.liveMessage = ''; old.textContent = '旧用户来了'; log.append(old);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(snapshots.at(-1).evidence.warming, false);
  assert.equal(snapshots.at(-1).evidence.freshKeys.size, 0);
  const fresh = dom.window.document.createElement('div'); fresh.dataset.liveMessage = ''; fresh.textContent = '新用户来了'; log.append(fresh);
  await new Promise((resolve) => dom.window.queueMicrotask(resolve));
  assert.equal(snapshots.at(-1).evidence.freshKeys.size, 1);
  cleanup();
});
