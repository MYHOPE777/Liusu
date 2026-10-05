const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const manifestPath = path.join(root, 'manifest.json');
const level = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(level)) {
  throw new Error(`Unsupported version level: ${level}. Use patch, minor, or major.`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

function git(args, options = {}) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', ...options });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function nextVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Version must use MAJOR.MINOR.PATCH: ${version}`);
  let [major, minor, patch] = match.slice(1).map(Number);
  if (level === 'major') { major += 1; minor = 0; patch = 0; }
  else if (level === 'minor') { minor += 1; patch = 0; }
  else patch += 1;
  return `${major}.${minor}.${patch}`;
}

const status = git(['status', '--porcelain']);
if (status.status !== 0) throw new Error(status.stderr || 'Not a Git worktree.');
if (!status.stdout.trim()) {
  console.log('No local changes; version was not incremented.');
  const push = git(['push']);
  if (push.status === 0) console.log('Pending local commits pushed.');
  else console.log('No changes committed. Push deferred until the network is available.');
  process.exit(0);
}

const packageJson = readJson(packagePath);
const version = nextVersion(packageJson.version);
packageJson.version = version;
writeJson(packagePath, packageJson);

const lockJson = readJson(lockPath);
lockJson.version = version;
if (lockJson.packages && lockJson.packages['']) lockJson.packages[''].version = version;
writeJson(lockPath, lockJson);

const manifest = readJson(manifestPath);
manifest.version = version;
writeJson(manifestPath, manifest);

run('npm', ['run', 'bookmarklet']);
run('npm', ['test']);
run('npm', ['run', 'check']);
run('npm', ['run', 'package']);
run('npm', ['run', 'test:browser', '--', 'dist']);

run('git', ['add', '-A']);
run('git', ['commit', '-m', `chore(release): v${version}`]);
console.log(`Local version v${version} committed.`);

const push = git(['push', '-u', 'origin', 'main'], { stdio: 'inherit' });
if (push.status === 0) {
  console.log(`Version v${version} pushed to origin/main.`);
} else {
  console.log(`Version v${version} is saved locally. Push deferred until the network or GitHub authentication is available.`);
}
