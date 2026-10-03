(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.QianchuanRepository = api;
  if (root.chrome && chrome.runtime && chrome.runtime.onMessage) {
    const repository = api.createRepository(root.indexedDB, { storage: root.chrome.storage && root.chrome.storage.local });
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== 'QIANCHUAN_STORE') return undefined;
      repository.handle(message, sender).then((data) => sendResponse({ ok: true, data }), (error) => sendResponse({ ok: false, error: error.message }));
      return true;
    });
  }
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const CONFIG_KEY = 'qianchuanConfig';
  const CONFIG_DEFAULTS = { windowSeconds: 60, unitSeconds: 60, panelCollapsed: false, mode: 'live' };
  const now = () => Date.now();
  function id() { return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `session-${now()}-${Math.random().toString(36).slice(2)}`; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  class Repository {
    constructor(indexedDB, options = {}) {
      this.indexedDB = indexedDB;
      this.dbName = options.dbName || 'qianchuan-flow';
      this.storage = options.storage || null;
      this.config = { ...CONFIG_DEFAULTS };
      this.memorySessions = new Map();
      this.memoryEvents = new Map();
      this.appendQueues = new Map();
    }
    async open() {
      if (!this.indexedDB) return null;
      if (this.dbPromise) return this.dbPromise;
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.indexedDB.open(this.dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('sessions')) {
            const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
            sessions.createIndex('roomId', 'roomId', { unique: false });
          }
          if (!db.objectStoreNames.contains('events')) {
            const events = db.createObjectStore('events', { keyPath: 'id' });
            events.createIndex('sessionId', 'sessionId', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('无法打开本地数据存储'));
      });
      return this.dbPromise;
    }
    async getConfig() {
      if (this.storage && typeof this.storage.get === 'function') {
        const saved = await this.storage.get(CONFIG_KEY);
        this.config = { ...CONFIG_DEFAULTS, ...(saved && saved[CONFIG_KEY] || {}) };
      }
      return clone(this.config);
    }
    async setConfig(patch = {}) {
      this.config = { ...this.config, ...patch };
      if (this.storage && typeof this.storage.set === 'function') await this.storage.set({ [CONFIG_KEY]: this.config });
      return clone(this.config);
    }
    senderContext(sender = {}, metadata = {}) {
      const url = sender.url || metadata.pageUrl || '';
      if (url && !/^https:\/\/compass\.jinritemai\.com\/screen\/anchor\/talent(?:[/?#]|$)/u.test(url) && !url.startsWith('file:')) throw new Error('此页面不在千川流速支持范围内');
      return { tabId: sender.tab?.id ?? metadata.tabId ?? null, tabInstanceId: sender.documentId || metadata.tabInstanceId || id() };
    }
    async createSession(metadata = {}, sender = {}) {
      const context = this.senderContext(sender, metadata);
      const timestamp = metadata.startedAt || now();
      const session = { ...metadata, ...context, id: id(), startedAt: timestamp, endedAt: null, updatedAt: timestamp, eventCount: 0 };
      delete session.events;
      const db = await this.open();
      if (!db) this.memorySessions.set(session.id, session);
      else await this.put(db, 'sessions', session);
      return clone(session);
    }
    async appendEvents(sessionId, events = []) {
      const previous = this.appendQueues.get(sessionId) || Promise.resolve();
      const task = previous.then(() => this._appendEvents(sessionId, events));
      const queue = task.catch(() => {});
      this.appendQueues.set(sessionId, queue);
      try {
        return await task;
      } finally {
        if (this.appendQueues.get(sessionId) === queue) this.appendQueues.delete(sessionId);
      }
    }
    async _appendEvents(sessionId, events = []) {
      if (!Array.isArray(events) || !sessionId) throw new Error('事件批次无效');
      const session = await this.getSession(sessionId);
      if (!session) throw new Error('会话不存在');
      const existing = new Set((await this.getEvents(sessionId)).map((event) => event.id));
      const fresh = [];
      for (const event of events) {
        if (!event || typeof event.id !== 'string' || existing.has(event.id)) continue;
        existing.add(event.id);
        fresh.push({ ...clone(event), sessionId });
      }
      const updated = { ...session, eventCount: session.eventCount + fresh.length, updatedAt: now() };
      const db = await this.open();
      if (!db) { this.memoryEvents.set(sessionId, [...(this.memoryEvents.get(sessionId) || []), ...fresh]); this.memorySessions.set(sessionId, updated); }
      else await this.transaction(db, ['sessions', 'events'], 'readwrite', (stores) => {
        stores.sessions.put(updated); fresh.forEach((event) => stores.events.put(event));
      });
      return { appended: fresh.length, eventCount: updated.eventCount, session: clone(updated) };
    }
    async endSession(sessionId) { const session = await this.getSession(sessionId); if (!session) throw new Error('会话不存在'); session.endedAt = session.updatedAt = now(); const db = await this.open(); if (!db) this.memorySessions.set(sessionId, session); else await this.put(db, 'sessions', session); return clone(session); }
    async listSessions({ roomId } = {}) { const db = await this.open(); let sessions; if (!db) sessions = [...this.memorySessions.values()]; else sessions = await this.all(db, 'sessions'); return sessions.filter((session) => !roomId || session.roomId === roomId).sort((a, b) => b.startedAt - a.startedAt).map(clone); }
    async readSession(sessionId) { const session = await this.getSession(sessionId); if (!session) return null; return { session: clone(session), events: (await this.getEvents(sessionId)).map(clone) }; }
    async deleteSession(sessionId) { const db = await this.open(); if (!db) { this.memorySessions.delete(sessionId); this.memoryEvents.delete(sessionId); return true; } await this.transaction(db, ['sessions', 'events'], 'readwrite', (stores) => { stores.sessions.delete(sessionId); const request = stores.events.index('sessionId').openCursor(IDBKeyRange.only(sessionId)); request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } }; }); return true; }
    async getSession(id) { const db = await this.open(); return db ? this.get(db, 'sessions', id) : this.memorySessions.get(id) || null; }
    async getEvents(sessionId) { const db = await this.open(); return db ? this.byIndex(db, 'events', 'sessionId', sessionId) : this.memoryEvents.get(sessionId) || []; }
    async handle(message, sender = {}) {
      const action = message.action; const payload = message.payload || {};
      if (action === 'getContext') return this.senderContext(sender, payload);
      if (action === 'getConfig') return this.getConfig();
      if (action === 'setConfig') return this.setConfig(payload);
      if (action === 'createSession') return this.createSession(payload, sender);
      if (action === 'appendEvents') return this.appendEvents(payload.sessionId, payload.events);
      if (action === 'endSession') return this.endSession(payload.sessionId);
      if (action === 'listSessions') return this.listSessions(payload);
      if (action === 'readSession') return this.readSession(payload.sessionId);
      if (action === 'deleteSession') return this.deleteSession(payload.sessionId);
      throw new Error(`未知存储操作: ${action}`);
    }
    transaction(db, stores, mode, body) { return new Promise((resolve, reject) => { const tx = db.transaction(stores, mode); const map = Object.fromEntries(stores.map((name) => [name, tx.objectStore(name)])); body(map); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('本地数据写入失败')); }); }
    put(db, store, value) { return this.transaction(db, [store], 'readwrite', (stores) => stores[store].put(value)); }
    get(db, store, key) { return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).get(key); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); }); }
    all(db, store) { return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); }); }
    byIndex(db, store, index, key) { return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).index(index).getAll(IDBKeyRange.only(key)); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); }); }
  }
  function createRepository(indexedDB, options) { return new Repository(indexedDB, options); }
  return { Repository, createRepository, CONFIG_DEFAULTS };
});
