(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.QianchuanLauncher = api;
  if (root.document) api.mount(root.document, root);
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const LIVE_PATH = /^\/screen\/anchor\/talent(?:[/?#]|$)/u;
  const LAST_URL_KEY = 'qianchuan-standalone-last-url';

  function parseLiveUrl(value) {
    const input = String(value || '').trim();
    if (!input) return { ok: false, error: '请输入主播大屏 URL。' };
    let url;
    try {
      url = new URL(input);
    } catch (_) {
      return { ok: false, error: 'URL 格式不正确，请粘贴完整的 https:// 地址。' };
    }
    if (url.protocol !== 'https:' || url.hostname !== 'compass.jinritemai.com') {
      return { ok: false, error: '只支持 compass.jinritemai.com 的 HTTPS 主播大屏地址。' };
    }
    if (!LIVE_PATH.test(url.pathname)) {
      return { ok: false, error: '这不是主播大屏地址，请使用 /screen/anchor/talent 页面。' };
    }
    const roomId = url.searchParams.get('live_room_id');
    if (!roomId) return { ok: false, error: '地址缺少 live_room_id，无法定位直播间。' };
    return { ok: true, href: url.href, roomId };
  }

  function readLastUrl(storage) {
    try { return storage?.getItem(LAST_URL_KEY) || ''; } catch (_) { return ''; }
  }

  function writeLastUrl(storage, href) {
    try { storage?.setItem(LAST_URL_KEY, href); } catch (_) {}
  }

  function mount(document, root) {
    const form = document.querySelector('[data-live-url-form]');
    const input = document.querySelector('[data-live-url-input]');
    const status = document.querySelector('[data-live-url-status]');
    const link = document.querySelector('[data-live-url-open]');
    const tools = document.querySelector('[data-live-url-tools]');
    const bookmarklets = [...document.querySelectorAll('[data-bookmarklet-link]')];
    for (const bookmarklet of bookmarklets) {
      if (typeof root.QIANCHUAN_BOOKMARKLET === 'string' && root.QIANCHUAN_BOOKMARKLET.startsWith('javascript:')) {
        bookmarklet.href = root.QIANCHUAN_BOOKMARKLET;
        bookmarklet.hidden = false;
      }
    }
    if (!form || !input || !status || !link) return () => {};

    const last = readLastUrl(root.localStorage);
    if (!input.value && last) input.value = last;

    function report(result) {
      status.textContent = result.ok ? `已定位直播间：${result.roomId}` : result.error;
      status.dataset.state = result.ok ? 'success' : 'error';
      link.hidden = !result.ok;
      if (tools) tools.hidden = !result.ok;
      if (result.ok) {
        link.href = result.href;
        link.textContent = `打开直播间 ${result.roomId}`;
      }
      return result;
    }

    function locate(event) {
      event?.preventDefault();
      const result = report(parseLiveUrl(input.value));
      if (!result.ok) return result;
      writeLastUrl(root.localStorage, result.href);
      link.click();
      return result;
    }

    form.addEventListener('submit', locate);
    input.addEventListener('input', () => {
      if (status.dataset.state) status.textContent = '';
      status.dataset.state = '';
      link.hidden = true;
      if (tools) tools.hidden = true;
    });
    if (last) report(parseLiveUrl(last));
    return () => form.removeEventListener('submit', locate);
  }

  return { parseLiveUrl, mount };
});
