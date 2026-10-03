const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || JSON.stringify(manifest.permissions) !== '["storage"]') {
  throw new Error('Expected MV3 with only storage permission.');
}
const expected = ['https://compass.jinritemai.com/screen/anchor/talent*'];
if (JSON.stringify(manifest.content_scripts[0].matches) !== JSON.stringify(expected)) {
  throw new Error('Unexpected page scope.');
}
for (const file of fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', path.join(root, 'src', file)]);
}
for (const file of [...manifest.content_scripts[0].js, manifest.background.service_worker]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error('Missing file: ' + file);
}
console.log('Manifest, page scope, permissions and JavaScript syntax passed.');
