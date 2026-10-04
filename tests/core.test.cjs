const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseEntry, SequenceDetector, FlowCounter, exportCsv, exportJson
} = require('../src/detector-core.js');

function row(key, username) {
  return { key, text: `${username}\u6765\u4e86` };
}

test('recognizes complete entry messages and ignores chat text', () => {
  assert.equal(parseEntry('\u5c0f\u660e\u6765\u4e86'), '\u5c0f\u660e');
  assert.equal(parseEntry('  Alice \u6765\u4e86\uff01  '), 'Alice');
  assert.equal(parseEntry('\u7528\u6237\uff1a\u6211\u6765\u4e86'), null);
  assert.equal(parseEntry('\u6765\u4e86'), null);
  assert.equal(parseEntry('\u7528\u6237\u53d1\u9001\u4e86\u793c\u7269'), null);
  assert.equal(parseEntry(null), null);
});

test('baselines existing rows and emits only appended entries once', () => {
  const detector = new SequenceDetector();
  detector.baseline([row('a', 'Alice')]);
  assert.deepEqual(detector.scan([row('a', 'Alice')]), []);
  const rows = [row('a', 'Alice'), { key: 'chat', text: 'hello' }, row('b', 'Bob')];
  assert.deepEqual(detector.scan(rows), ['Bob']);
  assert.deepEqual(detector.scan(rows), []);
});

test('counts the tail when the message buffer scrolls and nodes are recycled', () => {
  const detector = new SequenceDetector();
  detector.baseline([row('slot-a', 'Alice'), row('slot-b', 'Bob')]);
  assert.deepEqual(detector.scan([row('slot-a', 'Bob'), row('slot-b', 'Cara')]), ['Cara']);
  assert.deepEqual(detector.scan([row('slot-b', 'Cara'), row('new', 'Dan')]), ['Dan']);
});

test('rebaselines unrelated snapshots and still detects the next append', () => {
  const detector = new SequenceDetector();
  detector.baseline([row('a', 'Alice')]);
  assert.deepEqual(detector.scan([row('b', 'Bob')]), []);
  assert.deepEqual(detector.scan([row('b', 'Bob'), row('c', 'Cara')]), ['Cara']);
  detector.baseline([]);
  assert.deepEqual(detector.scan([row('d', 'Dan')]), ['Dan']);
});

test('counts same-user reentry using retained node identity while ignoring redraw', () => {
  const detector = new SequenceDetector();
  detector.baseline([row('a', 'Alice'), row('b', 'Alice')]);
  assert.deepEqual(detector.scan([row('b', 'Alice'), row('c', 'Alice')]), ['Alice']);
  assert.deepEqual(detector.scan([row('redraw-a', 'Alice'), row('redraw-b', 'Alice')]), []);
  assert.deepEqual(detector.scan([row('redraw-a', 'Alice'), row('redraw-b', 'Alice'), row('d', 'Alice')]), ['Alice']);
});

test('records entry events and computes rolling unique counts and rate', () => {
  const counter = new FlowCounter({ startedAt: 0, tabInstanceId: 'tab-1', roomId: 'room-7' });
  const events = counter.add(['Alice', 'Bob', 'Alice'], 30_000);
  assert.deepEqual(events.map((event) => event.username), ['Alice', 'Bob', 'Alice']);
  assert.ok(events.every((event) => event.tabInstanceId === 'tab-1' && event.roomId === 'room-7'));
  assert.deepEqual(counter.stats(60_000, 60, 60), {
    events: 3, unique: 2, rate: 3, elapsedSeconds: 60, totalEvents: 3
  });
  assert.equal(counter.stats(91_000, 60, 60).events, 0);
});

test('loads persisted events and ignores malformed records', () => {
  const counter = new FlowCounter({ startedAt: 0 });
  const loaded = counter.load([{ id: 'saved-1', timestamp: 10_000, username: ' Alice ' }, { timestamp: 'bad', username: 'Nope' }, null]);
  assert.equal(loaded.length, 1);
  assert.equal(counter.stats(20_000, 60, 60).events, 1);
  assert.equal(counter.activity(20_000).lastEventAt, 10_000);
});

test('excludes paused time from elapsed seconds and rate', () => {
  const counter = new FlowCounter({ startedAt: 0 });
  counter.add(['Alice'], 10_000);
  counter.pause(20_000);
  assert.deepEqual(counter.add(['Bob'], 30_000), []);
  counter.resume(40_000);
  counter.add(['Bob'], 50_000);
  const stats = counter.stats(60_000, 60, 60);
  assert.equal(stats.events, 2);
  assert.equal(stats.elapsedSeconds, 40);
  assert.equal(stats.rate, 3);
});

test('compares the current minute with the previous complete minute', () => {
  const counter = new FlowCounter({ startedAt: 0 });
  counter.add(['A', 'B'], 10_000);
  counter.add(['C'], 20_000);
  counter.add(['D', 'E', 'F', 'G', 'H', 'I'], 70_000);
  const comparison = counter.comparePreviousMinute(120_000, 60);
  assert.equal(comparison.available, true);
  assert.equal(comparison.previousRate, 3);
  assert.equal(comparison.currentRate, 6);
  assert.equal(comparison.changePercent, 100);
  assert.equal(comparison.direction, 'increase');

  const decreasing = new FlowCounter({ startedAt: 0 });
  decreasing.add(['A', 'B', 'C', 'D'], 10_000);
  decreasing.add(['E', 'F'], 70_000);
  const decrease = decreasing.comparePreviousMinute(120_000, 60);
  assert.equal(decrease.changePercent, -50);
  assert.equal(decrease.direction, 'decrease');
});

test('does not invent a percentage before a full previous minute exists or when its rate is zero', () => {
  const short = new FlowCounter({ startedAt: 0 });
  short.add(['A'], 70_000);
  assert.equal(short.comparePreviousMinute(90_000).available, false);

  const zeroBaseline = new FlowCounter({ startedAt: 0 });
  zeroBaseline.add(['A'], 70_000);
  const comparison = zeroBaseline.comparePreviousMinute(120_000);
  assert.equal(comparison.available, true);
  assert.equal(comparison.previousRate, 0);
  assert.equal(comparison.changePercent, null);
  assert.equal(comparison.direction, 'increase');
});

test('reports live idle time after the last entry and excludes pauses', () => {
  const counter = new FlowCounter({ startedAt: 0 });
  assert.deepEqual(counter.activity(10_000), { hasEvents: false, lastEventAt: null, idleSeconds: 10 });
  counter.add(['A'], 20_000);
  assert.deepEqual(counter.activity(30_000), { hasEvents: true, lastEventAt: 20_000, idleSeconds: 10 });
  counter.pause(30_000);
  assert.equal(counter.activity(50_000).idleSeconds, 10);
  counter.resume(50_000);
  assert.equal(counter.activity(60_000).idleSeconds, 20);
});

test('uses fresh keys as explicit evidence for identical-text turnover', () => {
  const detector = new SequenceDetector();
  detector.baseline([row('a', 'Alice'), row('b', 'Alice')]);
  assert.deepEqual(detector.scan([row('c', 'Alice'), row('d', 'Alice')]), []);
  assert.deepEqual(detector.scan([row('e', 'Alice'), row('f', 'Alice')], { freshKeys: new Set(['e', 'f']) }), ['Alice', 'Alice']);
});

test('exports escaped CSV and JSON without spreadsheet formulas', () => {
  const events = [{ id: '1', timestamp: 10, username: '=SUM(A1)', tabInstanceId: 'tab', roomId: 'room' }];
  const csv = exportCsv(events);
  assert.match(csv, /^id,timestamp,username,tabInstanceId,roomId\r?\n/);
  assert.match(csv, /'=SUM\(A1\)/);
  assert.match(csv, /"'=SUM\(A1\)"/);
  const payload = JSON.parse(exportJson({ startedAt: 0, tabInstanceId: 'tab', roomId: 'room', events }));
  assert.equal(payload.events[0].username, '=SUM(A1)');
  assert.equal(payload.roomId, 'room');
});
