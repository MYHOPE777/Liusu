const test = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');
const { createRepository } = require('../src/background.js');

function repository(name) { return createRepository(indexedDB, { dbName: `qianchuan-test-${name}-${Date.now()}-${Math.random()}` }); }

test('stores an isolated session and retries events by stable id', async () => {
  const repo = repository('events');
  const session = await repo.createSession({ roomId: 'room-1', mode: 'simulation' }, { tab: { id: 4 }, url: 'https://compass.jinritemai.com/screen/anchor/talent?live_room_id=room-1', documentId: 'doc-1' });
  const event = { id: 'event-1', timestamp: 100, username: '小明', tabInstanceId: 'doc-1', roomId: 'room-1' };
  assert.equal((await repo.appendEvents(session.id, [event, event])).appended, 1);
  assert.equal((await repo.appendEvents(session.id, [event])).appended, 0);
  const stored = await repo.readSession(session.id);
  assert.equal(stored.events.length, 1);
  assert.equal(stored.session.eventCount, 1);
});

test('serializes concurrent event batches without losing counts', async () => {
  const repo = repository('concurrent-events');
  const session = await repo.createSession({ roomId: 'room-concurrent' }, { tab: { id: 7 }, url: 'https://compass.jinritemai.com/screen/anchor/talent?live_room_id=room-concurrent', documentId: 'doc-concurrent' });
  const first = { id: 'event-a', timestamp: 100, username: 'Alice' };
  const second = { id: 'event-b', timestamp: 110, username: 'Bob' };
  const results = await Promise.all([
    repo.appendEvents(session.id, [first]),
    repo.appendEvents(session.id, [second]),
    repo.appendEvents(session.id, [first])
  ]);
  assert.deepEqual(results.map((result) => result.appended), [1, 1, 0]);
  const stored = await repo.readSession(session.id);
  assert.equal(stored.events.length, 2);
  assert.equal(stored.session.eventCount, 2);
});

test('lists by room and removes a complete local session', async () => {
  const repo = repository('sessions');
  const first = await repo.createSession({ roomId: 'room-a' }, { tab: { id: 1 } });
  await repo.createSession({ roomId: 'room-b' }, { tab: { id: 2 } });
  assert.equal((await repo.listSessions({ roomId: 'room-a' })).length, 1);
  await repo.deleteSession(first.id);
  assert.equal(await repo.readSession(first.id), null);
});

test('rejects unsupported live page URLs', async () => {
  const repo = repository('url');
  await assert.rejects(() => repo.createSession({}, { tab: { id: 2 }, url: 'https://example.com/' }), /支持范围/);
});
