const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const runner = fs.readFileSync(path.join(root, 'standalone', 'overlay-runner.js'), 'utf8').trim();
const code = `javascript:(()=>{${runner.replace(/<\//g, '<\\/')}})()`;
fs.writeFileSync(path.join(root, 'standalone', 'bookmarklet.txt'), code + '\n');
console.log('Standalone bookmarklet generated.');
