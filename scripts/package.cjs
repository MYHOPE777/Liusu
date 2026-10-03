const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const files = ['manifest.json', 'src', 'assets'];
for (const entry of files) {
  const source = path.join(root, entry);
  const target = path.join(dist, entry);
  if (fs.statSync(source).isDirectory()) fs.cpSync(source, target, { recursive: true });
  else fs.copyFileSync(source, target);
}
console.log(`Extension copied to ${dist}`);
