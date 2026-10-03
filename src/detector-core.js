(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QianchuanCore = factory();
  }
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function normalizeText(text) {
    return typeof text === 'string'
      ? text.replace(/[\u200b\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim()
      : '';
  }

  function parseEntry(text) {
    const match = normalizeText(text).match(/^(.+?)\s*\u6765\u4e86[!\uff01~\uff5e.\u3002]?$/u);
    if (!match) return null;
    const username = match[1].trim();
    return username && !/[:\uff1a]/u.test(username) ? username : null;
  }

  class SequenceDetector {
    constructor() {
      this.previous = null;
    }

    baseline(rows) {
      const safeRows = Array.isArray(rows) ? rows : [];
      this.previous = safeRows.map((row) => ({ key: row.key, text: normalizeText(row.text) }));
    }

    // Rows are ordered oldest-to-newest. A text suffix/prefix overlap is treated
    // as retained history; with no overlap we rebaseline to avoid inventing
    // entries after a virtualized list redraw. `freshKeys` is optional mutation
    // evidence from the DOM adapter and can override that conservative choice
    // for rows known to represent newly inserted message nodes.
    scan(rows, { freshKeys = new Set() } = {}) {
      const safeRows = Array.isArray(rows) ? rows : [];
      if (this.previous === null) {
        this.baseline(safeRows);
        return [];
      }
      const current = safeRows.map((row) => ({ key: row.key, text: normalizeText(row.text) }));
      let overlap = 0;
      let identityMatches = -1;
      for (let length = Math.min(this.previous.length, current.length); length > 0; length -= 1) {
        const offset = this.previous.length - length;
        if (current.slice(0, length).every((row, index) => row.text === this.previous[offset + index].text)) {
          const matches = current.slice(0, length).filter((row, index) => row.key === this.previous[offset + index].key).length;
          if (matches > identityMatches) {
            overlap = length;
            identityMatches = matches;
          }
        }
      }
      const appended = this.previous.length > 0 && overlap === 0 ? [] : current.slice(overlap);
      const emitted = new Set(appended.map((row) => row.key));
      if (freshKeys && typeof freshKeys.has === 'function') {
        for (const row of current) {
          if (freshKeys.has(row.key) && !emitted.has(row.key)) {
            appended.push(row);
            emitted.add(row.key);
          }
        }
      }
      this.baseline(safeRows);
      return appended.map((row) => parseEntry(row.text)).filter((username) => username !== null);
    }
  }

  class FlowCounter {
    constructor({ startedAt = Date.now(), tabInstanceId = null, roomId = null } = {}) {
      this.startedAt = startedAt;
      this.tabInstanceId = tabInstanceId;
      this.roomId = roomId;
      this.events = [];
      this.pausedAt = null;
      this.pauses = [];
    }

    get paused() {
      return this.pausedAt !== null;
    }

    add(usernames, timestamp = Date.now()) {
      if (this.paused) return [];
      const names = (Array.isArray(usernames) ? usernames : [usernames])
        .filter((username) => typeof username === 'string' && username.trim())
        .map((username) => username.trim());
      const added = names.map((username) => ({
        id: createId(), timestamp, username, tabInstanceId: this.tabInstanceId, roomId: this.roomId
      }));
      this.events.push(...added);
      return added;
    }

    pause(now = Date.now()) {
      if (!this.paused) this.pausedAt = now;
      return this.paused;
    }

    resume(now = Date.now()) {
      if (this.paused) {
        this.pauses.push([this.pausedAt, Math.max(this.pausedAt, now)]);
        this.pausedAt = null;
      }
      return !this.paused;
    }

    reset(now = Date.now()) {
      this.startedAt = now;
      this.events = [];
      this.pausedAt = null;
      this.pauses = [];
    }

    stats(now = Date.now(), windowSeconds = 60, unitSeconds = 60) {
      const start = Math.max(this.startedAt, now - Math.max(0, windowSeconds) * 1000);
      const activeWindowSeconds = this._activeMillisecondsBetween(start, now) / 1000;
      const events = this.events.filter((event) => event.timestamp >= start && event.timestamp <= now);
      const elapsedSeconds = this._activeMillisecondsBetween(this.startedAt, now) / 1000;
      return {
        events: events.length,
        unique: new Set(events.map((event) => event.username)).size,
        rate: activeWindowSeconds > 0 ? events.length / activeWindowSeconds * unitSeconds : 0,
        elapsedSeconds,
        totalEvents: this.events.length
      };
    }

    comparePreviousMinute(now = Date.now(), unitSeconds = 60) {
      const currentStart = now - 60 * 1000;
      const previousStart = now - 2 * 60 * 1000;
      const currentActiveSeconds = this._activeMillisecondsBetween(currentStart, now) / 1000;
      const previousActiveSeconds = this._activeMillisecondsBetween(previousStart, currentStart) / 1000;
      const currentEvents = this.events.filter((event) => event.timestamp >= currentStart && event.timestamp <= now).length;
      const previousEvents = this.events.filter((event) => event.timestamp >= previousStart && event.timestamp < currentStart).length;
      const currentRate = currentActiveSeconds > 0 ? currentEvents / currentActiveSeconds * unitSeconds : 0;
      const previousRate = previousActiveSeconds > 0 ? previousEvents / previousActiveSeconds * unitSeconds : 0;
      const available = this.startedAt <= previousStart && currentActiveSeconds > 0 && previousActiveSeconds > 0;
      const direction = !available
        ? 'unavailable'
        : previousRate === 0
          ? currentRate > 0 ? 'increase' : 'flat'
          : currentRate > previousRate ? 'increase' : currentRate < previousRate ? 'decrease' : 'flat';
      return {
        currentRate,
        previousRate,
        currentEvents,
        previousEvents,
        available,
        direction,
        changePercent: available && previousRate > 0 ? (currentRate - previousRate) / previousRate * 100 : null
      };
    }

    activity(now = Date.now()) {
      const lastEventAt = this.events.reduce((latest, event) => Math.max(latest, event.timestamp), 0) || null;
      const idleStart = lastEventAt || this.startedAt;
      return {
        hasEvents: lastEventAt !== null,
        lastEventAt,
        idleSeconds: this._activeMillisecondsBetween(idleStart, now) / 1000
      };
    }

    _activeMillisecondsBetween(start, end) {
      const lower = Math.max(this.startedAt, start);
      const upper = Math.max(lower, end);
      let active = upper - lower;
      const pauses = this.pauses.slice();
      if (this.pausedAt !== null) pauses.push([this.pausedAt, upper]);
      for (const [pauseStart, pauseEnd] of pauses) {
        const overlapStart = Math.max(lower, pauseStart);
        const overlapEnd = Math.min(upper, pauseEnd);
        if (overlapEnd > overlapStart) active -= overlapEnd - overlapStart;
      }
      return Math.max(0, active);
    }
  }

  function createId() {
    if (typeof globalThis.crypto === 'object' && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function csvCell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCsv(events = []) {
    const headers = ['id', 'timestamp', 'username', 'tabInstanceId', 'roomId'];
    const lines = [headers.join(',')];
    for (const event of events) {
      lines.push(headers.map((header) => csvCell(event && event[header])).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  function exportJson(session = {}, events) {
    if (Array.isArray(session)) {
      const payload = events && typeof events === 'object' && !Array.isArray(events) ? { ...events } : {};
      payload.events = session;
      return JSON.stringify(payload, null, 2);
    }
    const payload = { ...session };
    if (events !== undefined) payload.events = events;
    if (!Array.isArray(payload.events)) payload.events = [];
    return JSON.stringify(payload, null, 2);
  }

  return { parseEntry, SequenceDetector, FlowCounter, exportCsv, exportJson };
});
