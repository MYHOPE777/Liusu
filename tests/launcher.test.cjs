const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { parseLiveUrl } = require('../standalone/launcher.js');
const { mount } = require('../standalone/launcher.js');

test('launcher accepts an anchor live-screen URL and extracts the room id', () => {
  const result = parseLiveUrl('https://compass.jinritemai.com/screen/anchor/talent?live_room_id=7693167382356937508&live_app_id=1128');
  assert.equal(result.ok, true);
  assert.equal(result.roomId, '7693167382356937508');
  assert.match(result.href, /live_room_id=7693167382356937508/);
});

test('launcher rejects login, other hosts, and URLs without a room id', () => {
  assert.equal(parseLiveUrl('https://compass.jinritemai.com/login').ok, false);
  assert.equal(parseLiveUrl('https://example.com/screen/anchor/talent?live_room_id=1').ok, false);
  assert.equal(parseLiveUrl('https://compass.jinritemai.com/screen/anchor/talent').ok, false);
});

test('launcher validates the pasted URL and exposes a room link', () => {
  const dom = new JSDOM('<a data-bookmarklet-link hidden></a><form data-live-url-form><input data-live-url-input><div data-live-url-status></div><a data-live-url-open hidden></a><section data-live-url-tools hidden><a data-bookmarklet-link hidden></a></section></form>', {
    url: 'https://local.test/launcher.html'
  });
  const input = dom.window.document.querySelector('[data-live-url-input]');
  const form = dom.window.document.querySelector('[data-live-url-form]');
  input.value = 'https://compass.jinritemai.com/screen/anchor/talent?live_room_id=room-42';
  dom.window.QIANCHUAN_BOOKMARKLET = 'javascript:(()=>{})()';
  const stop = mount(dom.window.document, dom.window);
  assert.equal(dom.window.document.querySelector('[data-bookmarklet-link]').hidden, false);
  assert.match(dom.window.document.querySelector('[data-bookmarklet-link]').href, /^javascript:/);
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(dom.window.document.querySelector('[data-live-url-status]').textContent, '已定位直播间：room-42');
  assert.equal(dom.window.document.querySelector('[data-live-url-open]').href, input.value);
  assert.equal(dom.window.document.querySelector('[data-live-url-tools]').hidden, false);
  dom.window.document.querySelector('[data-bookmarklet-link]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.match(dom.window.document.querySelector('[data-live-url-status]').textContent, /拖到 Chrome 书签栏/);
  stop();
  dom.window.close();
});
