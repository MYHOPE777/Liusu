const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const names = ['activity', 'pause', 'play', 'rotate-ccw', 'download', 'chevron-down',
  'chevron-up', 'history', 'x', 'trash-2', 'move', 'external-link', 'users', 'file-json', 'file-spreadsheet'];
const source = path.dirname(require.resolve('lucide-static/package.json'));
fs.mkdirSync(path.join(root, 'assets', 'icons'), { recursive: true });
for (const name of names) {
  fs.copyFileSync(path.join(source, 'icons', name + '.svg'), path.join(root, 'assets', 'icons', name + '.svg'));
}
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(root, 'assets', 'LUCIDE-LICENSE'));
console.log('Local Lucide assets prepared.');
