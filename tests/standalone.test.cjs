const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('standalone overlay starts without chrome extension APIs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'standalone', 'overlay-runner.js'), 'utf8');
  const dom = new JSDOM('<!doctype html><section class="public-screen"><h2>实时公屏</h2><div role="log"></div></section>', {
    url: 'https://compass.jinritemai.com/screen/anchor/talent?live_room_id=test-room',
    runScripts: 'dangerously'
  });
  dom.window.eval(source);
  assert.ok(dom.window.document.querySelector('#qianchuan-standalone'));
  assert.match(dom.window.document.querySelector('.qcs-status-text').textContent, /检测中|未找到实时公屏/);
  dom.window.document.querySelector('.qcs-close').click();
  assert.equal(dom.window.document.querySelector('#qianchuan-standalone'), null);
  dom.window.close();
});

test('bookmarklet is generated as a javascript URL', () => {
  const bookmarklet = fs.readFileSync(path.join(__dirname, '..', 'standalone', 'bookmarklet.txt'), 'utf8').trim();
  assert.match(bookmarklet, /^javascript:\(\(\)=>\{/);
  assert.ok(bookmarklet.length > 1000);
});
