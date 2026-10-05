const test = require('node:test');
const assert = require('node:assert/strict');
const { isSupportedUrl } = require('../src/route-bootstrap.js');

test('route bootstrap recognizes the live screen and ignores login or other pages', () => {
  assert.equal(isSupportedUrl('https://compass.jinritemai.com/screen/anchor/talent?live_room_id=7693167382356937508'), true);
  assert.equal(isSupportedUrl('https://compass.jinritemai.com/screen/anchor/talent/extra'), true);
  assert.equal(isSupportedUrl('https://compass.jinritemai.com/login'), false);
  assert.equal(isSupportedUrl('https://compass.jinritemai.com/screen/home'), false);
});
