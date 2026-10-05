(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QianchuanRouteBootstrap = api;
  if (typeof module !== 'object' || !module.exports) api.start(root);
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const SUPPORTED_PATH = /^https:\/\/compass\.jinritemai\.com\/screen\/anchor\/talent(?:[/?#]|$)/u;

  function isSupportedUrl(url) {
    return SUPPORTED_PATH.test(String(url || ''));
  }

  function start(root) {
    if (!root || !root.location || isSupportedUrl(root.location.href)) return () => {};
    let previousUrl = root.location.href;
    const checkRoute = () => {
      const nextUrl = root.location.href;
      if (nextUrl === previousUrl) return;
      previousUrl = nextUrl;
      if (isSupportedUrl(nextUrl)) root.location.reload();
    };
    const timer = root.setInterval(checkRoute, 250);
    return () => root.clearInterval(timer);
  }

  return { isSupportedUrl, start };
});
