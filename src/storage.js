(function (root) {
  'use strict';
  function request(action, payload = {}) {
    if (!root.chrome?.runtime?.sendMessage) return Promise.reject(new Error('扩展存储不可用'));
    return new Promise((resolve, reject) => root.chrome.runtime.sendMessage({ type: 'QIANCHUAN_STORE', action, payload }, (response) => {
      const error = root.chrome.runtime.lastError || (response && !response.ok && new Error(response.error));
      if (error) reject(error instanceof Error ? error : new Error(String(error))); else resolve(response.data);
    }));
  }
  root.QianchuanStore = { getContext: (payload) => request('getContext', payload), getConfig: () => request('getConfig'), setConfig: (patch) => request('setConfig', patch), createSession: (metadata) => request('createSession', metadata), appendEvents: (sessionId, events) => request('appendEvents', { sessionId, events }), endSession: (sessionId) => request('endSession', { sessionId }), listSessions: (filter) => request('listSessions', filter), readSession: (sessionId) => request('readSession', { sessionId }), deleteSession: (sessionId) => request('deleteSession', { sessionId }) };
})(typeof globalThis === 'object' ? globalThis : this);
